// LLM 래퍼 — 환각 방지 5축 통합
// 축 1 (구조 강제): JSON Schema 검증
// 축 2 (추적성): traceability rules
// 축 3 (도메인): forbidden terms, required keywords, ID patterns
// 축 4 (교차 검증): Claude 생성 → Gemini 검증
// 축 5 (HITL): state machine에서 처리

import { validateSchema, schemaErrorsToIssues } from "./schema-validator.js";
import { checkTraceability, checkDomainConstraints } from "./guardrails.js";

// ──────────────────────────────────────────────────
// 안전한 JSON 파싱 (LLM은 종종 ```json``` 마크다운으로 감쌈)
// ──────────────────────────────────────────────────
export function safeParseJSON(raw) {
  if (typeof raw !== "string") return raw;
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try { return JSON.parse(text); } catch {}

  // JSON이 문자열 중간에 있는 경우 (LLM 흔한 실패 모드)
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  throw new Error("LLM 응답에서 유효한 JSON을 추출할 수 없습니다.");
}

// ──────────────────────────────────────────────────
// Claude 호출 (생성용)
// ──────────────────────────────────────────────────
export async function callClaude({ system, user, model = "claude-sonnet-4-20250514", maxTokens = 8000 }) {
  const startTime = Date.now();

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system, messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || String(data.error));

  const text = data.content?.map(b => b.text || "").join("") || "";
  if (!text) throw new Error("Claude API 응답이 비어있습니다.");

  const parsed = safeParseJSON(text);
  const duration = (Date.now() - startTime) / 1000;

  return {
    parsed,
    rawText: text,
    metadata: {
      model: data.model || model,
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      duration_sec: duration,
    },
  };
}

// ──────────────────────────────────────────────────
// Gemini 호출 (검증용)
// ──────────────────────────────────────────────────
export async function callGemini({ prompt }) {
  const startTime = Date.now();

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const parsed = safeParseJSON(data.text || "");
  return {
    parsed,
    rawText: data.text,
    metadata: {
      model: data.model || "gemini",
      duration_sec: (Date.now() - startTime) / 1000,
    },
  };
}

// ──────────────────────────────────────────────────
// 산출물 생성 — 5축 통합
// ──────────────────────────────────────────────────
export async function generateWorkProduct({ processConfig, projectInfo, context, prevContents }) {
  // 1) 프롬프트 구성 — 스키마와 제약을 명시적으로 주입
  const systemMsg = buildSystemPrompt(processConfig);
  const userMsg = buildUserPrompt(processConfig, projectInfo, context, prevContents);

  // 2) Claude 호출 (생성)
  const result = await callClaude({ system: systemMsg, user: userMsg });

  // 3) Phase 1: 스키마 검증 (즉시 실패 가능)
  const schemaErrors = validateSchema(result.parsed, processConfig.outputSchema);
  if (schemaErrors.length > 0) {
    // 한 번 자동 재시도 (스키마 위반 메시지를 LLM에 피드백)
    const retrySystem = systemMsg + "\n\n[중요 — 이전 시도 실패]\n" +
      "직전 응답이 다음 스키마 오류를 일으켰습니다. 반드시 모든 필드와 패턴을 준수해 재생성하세요:\n" +
      schemaErrors.map(e => `- ${e.path}: ${e.message}`).join("\n");
    const retry = await callClaude({ system: retrySystem, user: userMsg });
    const retryErrors = validateSchema(retry.parsed, processConfig.outputSchema);
    if (retryErrors.length > 0) {
      // 두 번 실패 — 그래도 진행하되 이슈로 표시
      return {
        output: retry.parsed,
        metadata: { ...retry.metadata, schema_errors: retryErrors, retried: true },
      };
    }
    return {
      output: retry.parsed,
      metadata: { ...retry.metadata, retried: true },
    };
  }

  return {
    output: result.parsed,
    metadata: result.metadata,
  };
}

function buildSystemPrompt(processConfig) {
  const c = processConfig;
  return `당신은 ASPICE 4.0 ${c.label} 전문가입니다.
반드시 한국어로 작성하고, 마크다운 없이 완전한 JSON만 출력하세요.

[엄격한 규칙 — 위반 시 거부됨]
1. 출력은 정확히 다음 JSON 스키마를 따라야 합니다.
2. 모든 ID는 지정된 패턴을 정확히 따라야 합니다 (예: ${
    Object.entries(c.domainConstraints?.idPatterns ?? {})
      .map(([k, p]) => `${k} = ${p.source}`).join(", ")
  }).
3. 다음 모호 용어는 절대 사용하지 마세요: ${
    (c.domainConstraints?.forbiddenTerms ?? []).join(", ") || "(없음)"
  }
4. 모든 요구사항은 측정 가능한 수치 기준을 포함해야 합니다.
5. 모든 추적 링크의 참조 ID는 실제로 존재해야 합니다.

[출력 JSON 스키마]
${JSON.stringify(c.outputSchema, null, 2)}`;
}

function buildUserPrompt(processConfig, projectInfo, context, prevContents) {
  const c = processConfig;
  const prevSection = (c.dependencies ?? [])
    .map(depId => prevContents[depId]
      ? `\n\n[이전 단계 산출물 — ${depId}]\n${JSON.stringify(prevContents[depId], null, 2)}`
      : `\n\n[이전 단계 누락 — ${depId}]`)
    .join("");

  return `프로젝트: ${projectInfo.name}
도메인: ${projectInfo.domain || "자동차 부품"}

추가 맥락:
${context || "(없음)"}
${prevSection}

위 정보를 바탕으로 ${c.id} ${c.label} 산출물을 생성하세요.
지정된 JSON 스키마를 정확히 따르고, 마크다운 없이 JSON만 출력하세요.`;
}

// ──────────────────────────────────────────────────
// 5-Phase QA 파이프라인
// ──────────────────────────────────────────────────
export async function runQAPipeline({ output, processConfig, prevContents = {}, onProgress = () => {} }) {
  const allIssues = [];
  const phaseResults = {};
  const startTime = Date.now();

  // ── Phase 1: Pre-validation (Schema) ────────────
  onProgress({ phase: 1, name: "Pre-validation", status: "running" });
  const t1 = Date.now();
  const schemaErrors = validateSchema(output, processConfig.outputSchema);
  const phase1Issues = schemaErrorsToIssues(schemaErrors);
  phaseResults.phase1 = {
    name: "Pre-validation",
    duration: (Date.now() - t1) / 1000,
    issueCount: phase1Issues.length,
    deterministic: true,
  };
  allIssues.push(...phase1Issues);
  onProgress({ phase: 1, status: "done", issueCount: phase1Issues.length, duration: phaseResults.phase1.duration });

  // Fast-fail: Critical 스키마 위반이면 더 진행 의미 없음
  const hasFatalSchemaIssue = phase1Issues.some(i => i.severity === "Critical");
  if (hasFatalSchemaIssue) {
    return aggregate(allIssues, phaseResults, startTime, "Phase 1 Fast-Failed");
  }

  // ── Phase 2: Deterministic (Domain Constraints) ──
  onProgress({ phase: 2, name: "Deterministic", status: "running" });
  const t2 = Date.now();
  const phase2Issues = checkDomainConstraints(output, processConfig);
  phaseResults.phase2 = {
    name: "Deterministic",
    duration: (Date.now() - t2) / 1000,
    issueCount: phase2Issues.length,
    deterministic: true,
  };
  allIssues.push(...phase2Issues);
  onProgress({ phase: 2, status: "done", issueCount: phase2Issues.length, duration: phaseResults.phase2.duration });

  // ── Phase 3: LLM Semantic (Gemini) ──────────────
  onProgress({ phase: 3, name: "LLM Semantic", status: "running" });
  const t3 = Date.now();
  const phase3Issues = await runGeminiSemanticCheck(output, processConfig);
  phaseResults.phase3 = {
    name: "LLM Semantic",
    duration: (Date.now() - t3) / 1000,
    issueCount: phase3Issues.length,
    deterministic: false,
  };
  allIssues.push(...phase3Issues);
  onProgress({ phase: 3, status: "done", issueCount: phase3Issues.length, duration: phaseResults.phase3.duration });

  // ── Phase 4: Graph (Traceability) ────────────────
  onProgress({ phase: 4, name: "Graph", status: "running" });
  const t4 = Date.now();
  const phase4Issues = checkTraceability(output, processConfig, prevContents);
  phaseResults.phase4 = {
    name: "Graph",
    duration: (Date.now() - t4) / 1000,
    issueCount: phase4Issues.length,
    deterministic: true,
  };
  allIssues.push(...phase4Issues);
  onProgress({ phase: 4, status: "done", issueCount: phase4Issues.length, duration: phaseResults.phase4.duration });

  // ── Phase 5: Aggregation ─────────────────────────
  onProgress({ phase: 5, name: "Aggregation", status: "running" });
  const result = aggregate(allIssues, phaseResults, startTime);
  onProgress({ phase: 5, status: "done", duration: result.summary.total_duration });

  return result;
}

// Gemini로 의미적 검증 (Phase 3)
async function runGeminiSemanticCheck(output, processConfig) {
  const prompt = `당신은 ASPICE 4.0 ${processConfig.label} 검증자입니다.
다음 산출물의 의미적 품질을 평가하고, 발견된 이슈를 JSON 배열로만 응답하세요.

평가 기준:
1. domain_fit — 자동차 도메인에 맞는 용어와 개념을 사용했는가
2. semantic_consistency — 항목 간 내용이 모순되지 않는가
3. completeness — 누락된 정보 (전제 조건, 예외 처리 등)가 없는가
4. atomicity — 각 항목이 단일 책임만 가지는가 (AND/OR 결합 없음)
5. clarity — 모호하지 않고 측정 가능한가

산출물:
${JSON.stringify(output, null, 2).slice(0, 8000)}

다음 JSON 형식으로만 응답:
{"issues":[{"id":"GEMINI-001","severity":"Critical|Major|Minor|Info","category":"Completeness|Consistency|Verifiability|Atomicity","description":"한국어로 무엇이 문제인지","location":"어느 항목인지 (예: requirements[2].description)","recommendation":"한국어로 어떻게 고쳐야 하는지"}]}

최대 8개 이슈만 반환하세요. 이슈가 없으면 "issues": [] 로 반환.`;

  try {
    const result = await callGemini({ prompt });
    const issues = result.parsed?.issues ?? [];
    return issues.map(i => ({
      ...i,
      source: "Phase 3 - LLM Semantic",
      llm_model: result.metadata.model,
    }));
  } catch (e) {
    return [{
      id: "GEMINI-ERR-001",
      severity: "Info",
      category: "System",
      description: `Gemini 검증 호출 실패: ${e.message}`,
      location: "(system)",
      recommendation: "Gemini API 키 설정과 네트워크 상태를 확인하세요.",
      source: "Phase 3 - LLM Semantic",
    }];
  }
}

// 결과 집계
function aggregate(allIssues, phaseResults, startTime, fastFailReason = null) {
  const totalDuration = (Date.now() - startTime) / 1000;
  const sev = (s) => allIssues.filter(i => i.severity === s).length;

  const summary = {
    total_issues: allIssues.length,
    critical: sev("Critical"),
    major: sev("Major"),
    minor: sev("Minor"),
    info: sev("Info"),
    total_duration: totalDuration,
    phase_count: Object.keys(phaseResults).length,
    fast_failed: !!fastFailReason,
    fast_fail_reason: fastFailReason,
  };

  // 카테고리별 분포
  const byCategory = {};
  allIssues.forEach(i => {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
  });

  // 점수 계산 (Critical 1건 = -25, Major = -10, Minor = -3, Info = -1)
  const score = Math.max(0,
    100 - summary.critical * 25 - summary.major * 10 - summary.minor * 3 - summary.info * 1
  );

  // 권고
  let recommendation;
  if (summary.critical > 0) recommendation = "반려 — Critical 이슈 해결 필요";
  else if (summary.major > 2) recommendation = "수정 후 재검토";
  else if (allIssues.length === 0) recommendation = "승인 권장";
  else recommendation = "수정 후 재검토 권장";

  return {
    score,
    summary,
    by_category: byCategory,
    issues: allIssues,
    phase_results: phaseResults,
    recommendation,
    timestamp: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────
// Rationale Report 생성 (왜 이렇게 만들었는지 근거)
// ──────────────────────────────────────────────────
export function buildRationaleReport({ generationMetadata, qaResult, processConfig }) {
  return {
    generation: {
      model: generationMetadata.model,
      input_tokens: generationMetadata.input_tokens,
      output_tokens: generationMetadata.output_tokens,
      duration_sec: generationMetadata.duration_sec,
      retried: generationMetadata.retried || false,
    },
    qa: qaResult ? {
      score: qaResult.score,
      issue_summary: qaResult.summary,
      phases: Object.values(qaResult.phase_results).map(p => ({
        name: p.name,
        duration_sec: p.duration,
        issue_count: p.issueCount,
        deterministic: p.deterministic,
      })),
      recommendation: qaResult.recommendation,
    } : null,
    guardrails_applied: [
      `축 1 — 구조 강제: ${Object.keys(processConfig.outputSchema.properties ?? {}).length}개 필드 검증`,
      `축 2 — 추적성: ${(processConfig.traceabilityRules ?? []).length}개 규칙 검증`,
      `축 3 — 도메인 제약: 금지 용어 ${(processConfig.domainConstraints?.forbiddenTerms ?? []).length}개, ID 패턴 ${Object.keys(processConfig.domainConstraints?.idPatterns ?? {}).length}개`,
      `축 4 — 교차 검증: 생성=Claude, 검증=Gemini (편향 분리)`,
      `축 5 — HITL: 사람 승인 없이 다음 단계 진행 불가`,
    ],
    timestamp: new Date().toISOString(),
  };
}

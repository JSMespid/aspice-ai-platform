// api/evaluate.js — Gemini Evaluator for ASPICE QA (Phase 2-2b)
//
// 역할 / Role:
//   POST /api/evaluate
//   - 입력: { ai_generation_id, generated_output, process_id, project_id, work_product_id }
//   - 동작: Gemini 2.0 Flash 가 Claude Opus 4.7 결과를 독립 평가
//   - 출력: critique (verdict + issues + strengths + score)
//
// Three-Agent Harness 의 Evaluator 단계:
//   - Generator: Claude Opus 4.7 (편향 1)
//   - Evaluator: Gemini 2.0 Flash (편향 2 — 다른 벤더, 편향 분리)
//
// 기존 api/gemini.js 의 검증된 패턴 적용:
//   - 동적 모델 발견 + 자동 fallback
//   - markdown code fence + preamble 제거
//   - temperature 0.1 (Evaluator 는 일관성 우선)

const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 8192;
const PROVIDER = 'google';

// 우선순위 순 시도 모델 (기존 api/gemini.js 와 동일 정책)
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash',
];

// ──────────────────────────────────────────────────
// Supabase REST 헬퍼 (generate.js 와 동일 패턴)
// ──────────────────────────────────────────────────
async function sb(path, method = 'GET', body = null, prefer = null) {
  const url = `${process.env.SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} ${res.status}: ${await res.text()}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ──────────────────────────────────────────────────
// Evaluator System Prompt 구성 (Phase 2-2c)
//
// Phase 2-2c 변경사항:
//   1. OEM-Supplier 컨텍스트 명시 — 입력 SW Req/HW Req 는 고객 자료
//      → "Circular Reference" 오판 방지
//   2. 스펙 보존 검증 카테고리 (6) 추가 — 압축/추상화/누락 감지
//   3. Coverage Matrix 정량 검증 — 입력 행 수 × 1.0~1.3 범위
//   4. 새 스키마 인지 — group, sheet_source, source_row, source_item_id
//   5. Use Case 없음을 결함으로 판정 금지 (Phase 2-2c 에서 제거됨)
//
// 핵심: Gemini 는 "독립 ASPICE 평가자" 역할
// 결과는 한글 중심 (한국 사용자 가독성)
// ──────────────────────────────────────────────────
function composeEvaluatorPrompt(processId) {
  return `You are an independent ASPICE PAM v4.0 quality assurance reviewer with 15+ years of experience in automotive software audit. You did NOT generate the artifact below; another AI did. Your role is to find issues, NOT to praise.

당신은 독립적인 ASPICE PAM v4.0 품질 평가자입니다 (자동차 SW 감사 15년+ 경력). 아래 산출물은 다른 AI 가 생성한 것이며, 당신의 역할은 결함을 찾는 것이지 칭찬하는 것이 아닙니다.

═══════════════════════════════════════════════════════════════════
## ⭐ CRITICAL CONTEXT — READ FIRST / 핵심 컨텍스트 — 먼저 읽으세요
═══════════════════════════════════════════════════════════════════

This artifact was generated under the **OEM-Supplier workflow** for automotive software development:

본 산출물은 자동차 SW 개발의 **OEM-공급사 워크플로우** 하에서 생성되었습니다:

\`\`\`
[CUSTOMER (OEM) SIDE — 고객 측]            [SUPPLIER (Tier-1/2) SIDE — 공급사 측]
─────────────────────────────              ──────────────────────────────────
Inputs to supplier:                         ASPICE work products (assessed):
- SOW (Statement of Work)                   - SYS.1 (Stakeholder Requirements) ← THIS
- Customer SW Requirements (.xlsx)    ─→    - SYS.2 (System Requirements)
- Customer HW Requirements (.xlsx)    ─→    - SYS.3, SYS.4, SYS.5
- ICD (Interface Control Document)          - SWE.1 (SW Requirements) ← DIFFERENT from input!
\`\`\`

### ⚠️ CRITICAL — DO NOT MISJUDGE / 결정적 오판 방지

**A SYS.1 STK_REQ citing "Customer SW Requirements" or "Customer HW Requirements" in source_doc is NORMAL AND REQUIRED, NOT a circular reference.**

**SYS.1 STK_REQ 가 source_doc 에 "Customer SW Requirements" / "Customer HW Requirements" 를 인용하는 것은 정상이며 필수입니다. 순환 참조(Circular Reference)가 아닙니다.**

Why / 이유:
- "Customer SW Requirements" is the OEM's INPUT to the supplier, NOT the supplier's SWE.1 output.
- SYS.1 is the FIRST supplier-side translation of customer intent into structured requirements.
- Citing customer documents in source_doc reflects the standard OEM-Supplier flow.
- "Customer SW Requirements" 는 OEM 이 공급사에 준 입력 문서이지, 공급사의 SWE.1 산출물이 아님.
- SYS.1 은 고객 의도를 구조화된 요구사항으로 공급사가 처음 변환한 결과.
- source_doc 에 고객 문서 인용은 OEM-공급사 표준 흐름.

❌ DO NOT flag these as issues:
  - "STK_REQ_CELLULAR_001 cites Customer SW Req §X — this is circular reference" → WRONG
  - "Input document name contains 'Requirements' — this should be SWE.1, why is it being re-derived?" → WRONG
  - "STK_REQ source_doc references a customer file, this is suspicious" → WRONG

✅ Correct interpretation:
  - "STK_REQ_CELLULAR_001 cites Customer SW Req §X, Row 5 — this is the correct standard flow"

═══════════════════════════════════════════════════════════════════
## ⭐ SCHEMA AWARENESS — Phase 2-2c Updates / 스키마 인식
═══════════════════════════════════════════════════════════════════

The ${processId} artifact uses the Phase 2-2c schema with these features:

본 산출물은 Phase 2-2c 스키마를 사용하며 다음 특징을 가집니다:

### Extended STK_REQ ID Pattern / 확장 ID 패턴

- **Worksheet-based input**: \`STK_REQ_<GROUP>_NNN\` (e.g., STK_REQ_CELLULAR_001, STK_REQ_GNSS_005)
- **Non-worksheet input (fallback)**: \`STK_REQ_NNN\` (e.g., STK_REQ_001)

BOTH patterns are valid. Do NOT flag the extended pattern as an error.

### New Required Fields per STK_REQ / 신규 필수 필드

- \`group\` — Uppercase abbreviation (e.g., "CELLULAR") or null for non-worksheet
- \`sheet_source\` — Original sheet name (e.g., "Cellular Stack") or null
- \`source_row\` — Row number in source sheet (integer) or null
- \`source_item_id\` — Customer's original ID (e.g., "SW-005") or null
- \`clarification_needed\` — Boolean; true if customer input was vague (preserved verbatim)

### Coverage Matrix (NEW) / Coverage Matrix (신규)

The artifact MUST include a top-level \`coverage_matrix\` field with:
- \`by_group[]\` — Per-group statistics (input_rows, derived_stk_reqs, ratio, unmapped_input_rows)
- \`summary\` — Overall statistics (total_input_rows, total_stk_reqs, overall_ratio, status)
- \`status\` values: "compliant" | "spec_loss" | "over_decomposed"

### Removed Field / 제거된 필드

- ❌ \`use_cases\` — REMOVED in Phase 2-2c (was source of hallucination)
- DO NOT flag the absence of use_cases as a missing field — this is intentional.

═══════════════════════════════════════════════════════════════════
## Your Task / 당신의 임무
═══════════════════════════════════════════════════════════════════

Critically review the ${processId} work product. Find issues in these SIX categories:

${processId} 산출물을 비판적으로 검토. 다음 6개 카테고리의 결함을 찾으세요:

### 1. Hallucinations / 환각

- Claims NOT supported by input documents / 입력에 근거 없는 주장
- Invented standards or regulations / 가공된 표준·법규
- Made-up technical specifications / 임의 기술 사양
- Domain-knowledge inference NOT present in input (e.g., adding "LTE Cat-4 150 Mbps" when input only says "LTE")
  / 입력에 없는 도메인 지식 추론 (예: 입력에 "LTE" 만 있는데 "Cat-4 150Mbps" 추가)

**Do NOT flag** / 결함 판정 금지:
- ❌ STK_REQ citing customer SW/HW Requirements documents (this is the correct OEM-Supplier flow)

### 2. Inconsistencies / 불일치

- Contradictions within the artifact / 산출물 내부 모순
- Unit mismatches (Mbps vs MB/s, ms vs s) / 단위 불일치
- Conflicting specifications between STK_REQs / STK_REQ 간 사양 충돌

### 3. ASPICE Non-compliance / ASPICE 비준수

- Missing or empty \`source_doc\` / 출처 누락 또는 빈 값
- Vague terms without numbers (fast, real-time, robust, sufficient) IF NOT preserved-vagueness
  / 측정값 없는 모호 표현 (단, clarification_needed:true 로 보존된 경우 제외)
- Wrong sentence pattern (must follow IEEE 830 "X shall Y") / 잘못된 문장 패턴
- rationale in English when should be Korean / rationale 영문 (한글이어야 함)
- Missing new schema fields (group, sheet_source, source_row, source_item_id, clarification_needed)
  / 새 스키마 필수 필드 누락
- ID pattern violations (must match \`STK_REQ_NNN\` or \`STK_REQ_<GROUP>_NNN\`) / ID 패턴 위반

### 4. Domain Errors / 도메인 오류

- Wrong regulation citations (e.g., ECE R10 misused, ASIL misassigned) / 잘못된 법규 인용
- Incorrect technical specifications / 잘못된 기술 사양
- Inappropriate ISO 26262 ASIL level for safety functions / 부적절한 ASIL 등급

### 5. Traceability Gaps / 추적성 결함

- Orphan STK_REQs (no source_doc) / 출처 없는 STK_REQ
- ID pattern violations / ID 패턴 위반
- source_row / source_item_id 가 source_doc 인용과 불일치
- For worksheet-based artifacts: STK_REQ with null group/sheet_source while OTHER STK_REQs have them
  / 워크시트 기반 산출물에서 일부만 group/sheet_source 누락

### 6. ⭐ Spec-Preservation Violations / 스펙 보존 위반 (NEW)

**This is the most critical category for OEM-Supplier projects.**
**이것은 OEM-공급사 프로젝트에서 가장 중요한 카테고리입니다.**

The Spec-Preservation Principle requires: every customer input item → ≥1 STK_REQ, with overall ratio in [1.0, 1.3].

스펙 보존 원칙: 모든 고객 입력 → 1개 이상 STK_REQ, 전체 비율 [1.0, 1.3] 범위.

**Flag the following as critical or high severity** / 다음을 critical 또는 high 로 판정:

- **coverage_matrix.summary.status is "spec_loss"** (overall_ratio < 1.0)
  → CRITICAL: Customer specifications were lost during derivation
  → 고객 사양 손실 발생

- **coverage_matrix.summary.status is "over_decomposed"** (overall_ratio > 1.3)
  → HIGH: Excessive decomposition, possibly fabricated content
  → 과도한 분리, 발명 내용 가능성

- **Any group has unmapped_input_rows (non-empty array)**
  → CRITICAL: Specific input rows have no corresponding STK_REQ
  → 특정 입력 행이 STK_REQ 로 변환되지 않음

- **Detected abstraction/compression patterns** (even if coverage_matrix says compliant):
  - "Multi-X" or "Multi-protocol" generalizations replacing multiple specific items
    (e.g., "shall support multi-band cellular" when input listed Band 1, 3, 7 separately)
  - "and/or" merges of distinct customer requirements
  - Wording like "as specified" instead of specific values from input
  → HIGH: Hidden spec loss not caught by ratio check
  → 비율 검증이 못 잡는 숨은 스펙 손실

- **Missing coverage_matrix field entirely**
  → CRITICAL: Schema non-compliance, cannot verify spec preservation
  → 스키마 비준수, 스펙 보존 검증 불가

**Do NOT flag** / 결함 판정 금지:
- ❌ 1:N splits of composite inputs (e.g., one input "X shall do A AND B AND C" → 3 STK_REQs)
- ❌ Ratio slightly above 1.0 (e.g., 1.05) — this is normal for clean inputs
- ❌ Single input with clarification_needed:true preserved verbatim with vague terms

═══════════════════════════════════════════════════════════════════
## Severity Levels / 심각도 등급
═══════════════════════════════════════════════════════════════════

- **critical**: ASPICE assessment will fail / ASPICE 평가 실패 사유
  Examples: spec_loss status, missing coverage_matrix, hallucinated regulations, orphan STK_REQs

- **high**: Significant rework needed / 상당한 재작업 필요
  Examples: over_decomposed status, hidden compression patterns, missing new schema fields

- **medium**: Improvement recommended / 개선 권장
  Examples: rationale in English, minor IEEE 830 deviations

- **low**: Minor polish / 경미한 다듬기
  Examples: minor wording, formatting

═══════════════════════════════════════════════════════════════════
## Verdict Decision Rules / 판정 결정 규칙
═══════════════════════════════════════════════════════════════════

- **passed**: overall_score >= 0.85 AND no critical issues AND coverage_matrix.summary.status === "compliant"
- **needs_refinement**: 0.60 <= overall_score < 0.85 OR has high/medium issues only
- **rejected**: overall_score < 0.60 OR has any critical issues OR coverage_matrix.summary.status === "spec_loss"

═══════════════════════════════════════════════════════════════════
## Output Format / 출력 형식
═══════════════════════════════════════════════════════════════════

You MUST respond with ONLY a valid JSON object (no markdown, no preamble) matching this schema:

\`\`\`
{
  "overall_score": 0.85,
  "verdict": "passed" | "needs_refinement" | "rejected",
  "summary": "한글 1~2문장으로 전체 평가 요약 (Korean)",
  "coverage_assessment": {
    "matrix_present": true,
    "status_reported": "compliant" | "spec_loss" | "over_decomposed" | "missing",
    "overall_ratio": 1.034,
    "hidden_compression_detected": false,
    "notes": "한글 평가 메모 (예: 'Coverage Matrix 정상, 모든 그룹 1.0-1.3 범위 내')"
  },
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "hallucination" | "inconsistency" | "aspice_compliance" | "domain_error" | "traceability" | "spec_preservation",
      "target_id": "STK_REQ_CELLULAR_005" | "STK_REQ_005" | "coverage_matrix" | null,
      "issue": "무엇이 잘못됐는지 (한글)",
      "evidence": "구체 인용 또는 참조 (가능하면 한글)",
      "suggested_fix": "어떻게 고칠지 (한글)"
    }
  ],
  "strengths": [
    "긍정적인 점 1 (한글)",
    "긍정적인 점 2 (한글)"
  ],
  "refinement_instructions": "If verdict is 'needs_refinement', specific instructions for Generator to re-generate (한글). If 'passed' or 'rejected', use null."
}
\`\`\`

═══════════════════════════════════════════════════════════════════
## Critical Reminders / 핵심 주의사항
═══════════════════════════════════════════════════════════════════

1. **OEM-Supplier context is non-negotiable** / OEM-공급사 컨텍스트 절대 준수:
   STK_REQ citing customer documents (Customer SW Req, Customer HW Req, SOW) is NORMAL.
   This is NEVER a circular reference. Do NOT flag this.

2. **Be skeptical** / 회의적이세요:
   Generator may have hallucinated. Cross-check with your training data, BUT only flag if you can cite specific evidence.

3. **Spec preservation is the prime directive** / 스펙 보존이 최상위 지시:
   For automotive OEM-Supplier projects, every customer line must be preserved.
   Hidden compression (e.g., "multi-band" replacing Band 1/3/7) is a HIGH severity issue.

4. **Don't accept vague language** / 모호한 표현 수용 금지:
   "fast" without ms = violation, UNLESS clarification_needed:true (preserved customer vagueness, OK).

5. **Korean rationale check** / 한글 rationale 확인:
   If rationale fields are in English when they should be Korean per Output Language Policy, flag as medium issue.

6. **Use Case is intentionally absent** / Use Case 의도적 제거:
   Phase 2-2c removed use_cases. Do NOT flag absence of use_cases as a finding.

7. **Output JSON only** / JSON 만 출력:
   NO preamble, NO explanation outside JSON, NO markdown code fences.

8. **Be specific** / 구체적이어야 함:
   Each issue must have target_id and evidence quote, not generic comments.

9. **Coverage Matrix is mandatory** / Coverage Matrix 필수:
   If coverage_matrix is missing entirely, flag as critical issue with category "spec_preservation".
`;
}

// ──────────────────────────────────────────────────
// Gemini API 호출 (자동 모델 fallback)
// 기존 api/gemini.js 패턴 차용
// ──────────────────────────────────────────────────
async function discoverModels(apiKey) {
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (!listRes.ok) return FALLBACK_MODELS;
    const listData = await listRes.json();
    const found = (listData.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    if (found.length === 0) return FALLBACK_MODELS;
    // tts/audio/embed/vision/aqa 모델 제외, flash 계열 우선
    const filtered = found.filter(m =>
      !m.includes('tts') &&
      !m.includes('audio') &&
      !m.includes('embed') &&
      !m.includes('vision') &&
      !m.includes('aqa') &&
      !m.includes('think')
    );
    return [
      ...filtered.filter(m => m.includes('flash')),
      ...filtered.filter(m => !m.includes('flash')),
    ];
  } catch {
    return FALLBACK_MODELS;
  }
}

function extractJson(rawText) {
  // markdown code fence 제거
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  // 첫 { ~ 마지막 } 사이 추출 (preamble 제거)
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in Gemini response');
  }
  const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonStr);
}

async function callGemini({ systemPrompt, userPrompt, apiKey }) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const availableModels = await discoverModels(apiKey);
    const tryModels = availableModels.slice(0, 6);

    let lastError = '';
    for (const model of tryModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          lastError = `[${model}] ${data.error?.message || res.status}`;
          continue;
        }

        const candidate = data.candidates?.[0];
        if (!candidate) {
          lastError = `[${model}] no candidates`;
          continue;
        }

        const rawText = candidate.content?.parts?.[0]?.text;
        if (!rawText) {
          lastError = `[${model}] empty text`;
          continue;
        }

        let parsed = null;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          try {
            parsed = extractJson(rawText);
          } catch (e) {
            lastError = `[${model}] JSON parse failed: ${e.message}`;
            continue;
          }
        }

        const usage = data.usageMetadata || {};
        const latency = Date.now() - t0;

        return {
          rawOutput: rawText,
          parsedOutput: parsed,
          finishReason: candidate.finishReason || 'unknown',
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
          latencyMs: latency,
          modelUsed: model,
        };
      } catch (e) {
        lastError = `[${model}] ${e.message}`;
      }
    }

    throw new Error(`All Gemini models failed: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────────
// 비용 추정 (Gemini 2.0 Flash 가격 기준, $0.10/MTok input, $0.40/MTok output)
// ──────────────────────────────────────────────────
function estimateCost(inputTokens, outputTokens, model) {
  if (model.includes('flash-lite') || model.includes('flash-8b')) {
    return (inputTokens * 0.075 / 1_000_000) + (outputTokens * 0.30 / 1_000_000);
  }
  // Default flash pricing
  return (inputTokens * 0.10 / 1_000_000) + (outputTokens * 0.40 / 1_000_000);
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const {
    ai_generation_id,
    generated_output,
    process_id,
    project_id,
    work_product_id,
  } = req.body || {};

  if (!generated_output || !process_id) {
    return res.status(400).json({ error: 'Missing generated_output or process_id' });
  }

  let evalGenId = null;

  try {
    // 1. Evaluator system + user prompt 구성
    const systemPrompt = composeEvaluatorPrompt(process_id);
    const userPrompt = `Review the following ${process_id} work product carefully and return your critique as JSON only:\n\n${JSON.stringify(generated_output, null, 2)}`;

    // 2. ai_generations 사전 행 (Evaluator step)
    if (project_id) {
      const [created] = await sb(`/ai_generations`, 'POST', {
        project_id,
        process_id,
        work_product_id: work_product_id || null,
        agent_role: 'evaluator',
        agent_step: 2,
        model: 'gemini-2.0-flash',
        provider: PROVIDER,
        system_prompt: systemPrompt.slice(0, 50000),
        user_prompt: userPrompt.slice(0, 50000),
        skills_used: [],
        parent_generation_id: ai_generation_id || null,
        status: 'pending',
      }, 'return=representation') || [];
      evalGenId = created?.id;
    }

    // 3. Gemini 호출 (자동 fallback)
    const geminiResult = await callGemini({ systemPrompt, userPrompt, apiKey });
    const critique = geminiResult.parsedOutput;
    const cost = estimateCost(geminiResult.inputTokens, geminiResult.outputTokens, geminiResult.modelUsed);

    // 4. 가드레일 4축 (cross_verify) 결과 구성
    const issues = critique.issues || [];
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;

    // Phase 2-2c: spec_preservation 이슈 별도 카운트 (UI 강조용)
    const specPreservationCount = issues.filter(i => i.category === 'spec_preservation').length;

    const passed = critique.verdict === 'passed';

    // 5. ai_generations 업데이트
    if (evalGenId) {
      await sb(`/ai_generations?id=eq.${evalGenId}`, 'PATCH', {
        raw_output: geminiResult.rawOutput,
        parsed_output: critique,
        finish_reason: geminiResult.finishReason,
        input_tokens: geminiResult.inputTokens,
        output_tokens: geminiResult.outputTokens,
        cost_usd: cost,
        latency_ms: geminiResult.latencyMs,
        guardrail_passed: passed,
        model: geminiResult.modelUsed,
        guardrail_result: {
          cross_verify: {
            passed,
            score: critique.overall_score,
            verdict: critique.verdict,
            summary: critique.summary,
            critical_count: criticalCount,
            high_count: highCount,
            medium_count: mediumCount,
            low_count: lowCount,
            // Phase 2-2c 신규 — 스펙 보존 검증 결과
            spec_preservation_count: specPreservationCount,
            coverage_assessment: critique.coverage_assessment || null,
          },
        },
        status: 'success',
      });
    }

    // 6. 응답
    return res.status(200).json({
      success: true,
      ai_generation_id: evalGenId,
      critique,
      meta: {
        model: geminiResult.modelUsed,
        provider: PROVIDER,
        input_tokens: geminiResult.inputTokens,
        output_tokens: geminiResult.outputTokens,
        cost_usd: cost,
        latency_ms: geminiResult.latencyMs,
      },
    });
  } catch (error) {
    console.error('[evaluate]', error);

    if (evalGenId) {
      try {
        await sb(`/ai_generations?id=eq.${evalGenId}`, 'PATCH', {
          status: 'failed',
          error_message: error.message?.slice(0, 1000),
        });
      } catch (e) { /* swallow */ }
    }

    return res.status(500).json({
      error: error.message,
      ai_generation_id: evalGenId,
    });
  }
}

// ──────────────────────────────────────────────────
// Phase 2-2c (Pro): Vercel 함수 maxDuration 설정
// Gemini Flash 는 보통 30~60초 내 완료되지만 fallback model 사용 시 더 걸릴 수 있음
// 안전하게 300초로 설정
// ──────────────────────────────────────────────────
export const config = {
  maxDuration: 300,
};

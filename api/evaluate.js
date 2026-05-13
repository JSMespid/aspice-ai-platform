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
// Evaluator System Prompt 구성
// 핵심: Gemini 는 "독립 ASPICE 평가자" 역할
// 결과는 한글 중심 (한국 사용자 가독성)
// ──────────────────────────────────────────────────
function composeEvaluatorPrompt(processId) {
  return `You are an independent ASPICE PAM v4.0 quality assurance reviewer with 15+ years of experience in automotive software audit. You did NOT generate the artifact below; another AI did. Your role is to find issues, NOT to praise.

당신은 독립적인 ASPICE PAM v4.0 품질 평가자입니다 (자동차 SW 감사 15년+ 경력). 아래 산출물은 다른 AI 가 생성한 것이며, 당신의 역할은 결함을 찾는 것이지 칭찬하는 것이 아닙니다.

## Your Task / 당신의 임무

Critically review the ${processId} work product. Find issues in these categories:
${processId} 산출물을 비판적으로 검토. 다음 카테고리의 결함을 찾으세요:

### 1. Hallucinations / 환각
- Claims not supported by input documents / 입력 문서에 근거 없는 주장
- Invented standards or regulations / 가공된 표준·법규
- Made-up technical specifications / 임의 기술 사양

### 2. Inconsistencies / 불일치
- Contradictions within the artifact / 산출물 내부 모순
- Unit mismatches (Mbps vs MB/s, ms vs s) / 단위 불일치

### 3. ASPICE Non-compliance / ASPICE 비준수
- Missing source_doc / 출처 누락
- Vague terms without numbers (fast, real-time, robust, sufficient) / 측정값 없는 모호 표현
- Wrong sentence pattern (must follow IEEE 830 "X shall Y") / 잘못된 문장 패턴
- rationale in English when should be Korean / rationale 영문 (한글이어야 함)

### 4. Domain Errors / 도메인 오류
- Wrong regulation citations (e.g., ECE R10 misused, ASIL misassigned) / 잘못된 법규 인용
- Incorrect technical specifications / 잘못된 기술 사양
- Inappropriate ISO 26262 ASIL level for safety functions / 부적절한 ASIL 등급

### 5. Traceability Gaps / 추적성 결함
- Orphan STK_REQs (no source_doc) / 출처 없는 STK_REQ
- Dangling references (UC links to non-existent STK_REQ) / 존재하지 않는 ID 참조
- Missing coverage / 커버리지 누락

## Severity Levels / 심각도 등급

- **critical**: ASPICE assessment will fail / ASPICE 평가 실패 사유
- **high**: Significant rework needed / 상당한 재작업 필요
- **medium**: Improvement recommended / 개선 권장
- **low**: Minor polish / 경미한 다듬기

## Verdict Decision Rules / 판정 결정 규칙

- **passed**: overall_score >= 0.85 AND no critical issues
- **needs_refinement**: 0.60 <= overall_score < 0.85 OR has high/medium issues only
- **rejected**: overall_score < 0.60 OR has any critical issues

## Output Format / 출력 형식

You MUST respond with ONLY a valid JSON object (no markdown, no preamble) matching this schema:

\`\`\`
{
  "overall_score": 0.85,
  "verdict": "passed" | "needs_refinement" | "rejected",
  "summary": "한글 1~2문장으로 전체 평가 요약 (Korean)",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "hallucination" | "inconsistency" | "aspice_compliance" | "domain_error" | "traceability",
      "target_id": "STK_REQ_005" | "UC_002" | null,
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

## Critical Reminders / 핵심 주의사항

1. **Be skeptical** / 회의적이세요: Generator may have hallucinated. Cross-check with your training data.
2. **Don't accept vague language** / 모호한 표현 수용 금지: "fast" without ms = violation.
3. **Korean rationale check** / 한글 rationale 확인: If rationale fields are in English when they should be Korean per Output Language Policy, flag as medium issue.
4. **Output JSON only** / JSON 만 출력: NO preamble, NO explanation outside JSON, NO markdown code fences.
5. **Be specific** / 구체적이어야 함: Each issue must have target_id and evidence quote, not generic comments.
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

// src/lib/agent-harness.js — Three-Agent Harness Client (Phase 2-2b)
//
// 진행 단계:
//   1. PREPARING    — 입력 검증
//   2. GENERATING   — Claude Opus 4.7 호출 (/api/generate)
//   3. VALIDATING   — 서버 5축 가드레일 (1, 2, 3축)
//   4. EVALUATING   — Gemini 평가 (/api/evaluate) ← Phase 2-2b 신규
//   5. COMPLETED    — 모두 성공
//   6. FAILED       — 네트워크 또는 API 에러
//   7. BLOCKED      — 가드레일 ① ② ③ 차단
//   8. NEEDS_REFINEMENT — 가드레일 ④ Gemini critique 결과
//
// 2-Phase 호출 패턴 (Vercel Hobby maxDuration 300초 안전):
//   Phase 1: Generator (Opus 4.7) — 약 150~200초
//   Phase 2: Evaluator (Gemini Flash) — 약 10~30초
//   두 호출이 분리되어 각각 5분 안에 끝남.

export const AgentStep = Object.freeze({
  IDLE:              'idle',
  PREPARING:         'preparing',
  GENERATING:        'generating',
  VALIDATING:        'validating',
  EVALUATING:        'evaluating',
  COMPLETED:         'completed',
  FAILED:            'failed',
  BLOCKED:           'blocked',
  NEEDS_REFINEMENT:  'needs_refinement',
});

/**
 * Run the full agent harness:
 * Generator (Opus) → Validating → Evaluator (Gemini) → Completed
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.processId
 * @param {string} params.workProductId
 * @param {(step: string, detail?: any) => void} params.onProgress
 * @returns {Promise<HarnessResult>}
 */
export async function runAgentHarness({ projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => { if (onProgress) onProgress(step, detail); };

  // ─────────────────────────────────────
  // Phase 1: Generator
  // ─────────────────────────────────────
  emit(AgentStep.PREPARING, { message: '입력 검증 및 Skills 로딩' });
  await new Promise(r => setTimeout(r, 200));

  emit(AgentStep.GENERATING, {
    message: 'Claude Opus 4.7 (adaptive thinking) 호출 중 — 최고 품질 산출물을 위해 깊이 추론합니다. 보통 2~4분 소요. 패널을 닫지 마세요.',
  });

  let generateResp;
  try {
    generateResp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        process_id: processId,
        work_product_id: workProductId,
      }),
    });
  } catch (e) {
    emit(AgentStep.FAILED, { message: `네트워크 오류 (Generator): ${e.message}` });
    throw e;
  }

  if (!generateResp.ok) {
    const errText = await generateResp.text();
    emit(AgentStep.FAILED, { message: `Generator API 오류 ${generateResp.status}: ${errText.slice(0, 200)}` });
    throw new Error(errText);
  }

  const generateResult = await generateResp.json();

  // 가드레일 ① ② ③ 검증 단계 표시
  emit(AgentStep.VALIDATING, { message: '5축 가드레일 검증 (① 구조 / ② 추적성 / ③ 도메인)' });
  await new Promise(r => setTimeout(r, 200));

  // 가드레일 ① ② ③ 차단된 경우 — Evaluator 호출 안 함
  if (!generateResult.passed) {
    emit(AgentStep.BLOCKED, {
      message: `구조/추적성/도메인 가드레일 차단: ${(generateResult.guardrail_result?.failed_axes || []).join(', ')}`,
      result: generateResult,
    });
    return { generator: generateResult, evaluator: null, finalPassed: false, blockedAt: 'guardrail_1_2_3' };
  }

  // ─────────────────────────────────────
  // Phase 2: Evaluator (Gemini)
  // ─────────────────────────────────────
  emit(AgentStep.EVALUATING, {
    message: 'QA 검토 — Gemini 가 Claude 결과를 독립 평가합니다 (편향 분리). 10~30초 소요.',
  });

  let evaluateResp;
  try {
    evaluateResp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai_generation_id: generateResult.ai_generation_id,
        generated_output: generateResult.output,
        process_id: processId,
        project_id: projectId,
        work_product_id: workProductId,
      }),
    });
  } catch (e) {
    // Evaluator 실패는 치명적이지 않음 - Generator 결과는 유지
    emit(AgentStep.COMPLETED, {
      message: `생성 완료. QA 검토는 네트워크 오류로 건너뜀: ${e.message}`,
      result: { ...generateResult, evaluator_error: e.message },
    });
    return { generator: generateResult, evaluator: null, finalPassed: true, evaluatorError: e.message };
  }

  if (!evaluateResp.ok) {
    const errText = await evaluateResp.text();
    emit(AgentStep.COMPLETED, {
      message: `생성 완료. QA 검토 실패 (${evaluateResp.status}): ${errText.slice(0, 200)}`,
      result: { ...generateResult, evaluator_error: errText.slice(0, 200) },
    });
    return { generator: generateResult, evaluator: null, finalPassed: true, evaluatorError: errText };
  }

  const evaluateResult = await evaluateResp.json();
  const critique = evaluateResult.critique;
  const verdict = critique.verdict;

  // ─────────────────────────────────────
  // 최종 verdict 판정
  // ─────────────────────────────────────
  if (verdict === 'passed') {
    emit(AgentStep.COMPLETED, {
      message: `생성 + QA 검토 완료. Gemini 평가: ${critique.summary}`,
      result: { ...generateResult, evaluator: evaluateResult },
    });
    return { generator: generateResult, evaluator: evaluateResult, finalPassed: true };
  }

  if (verdict === 'rejected') {
    emit(AgentStep.BLOCKED, {
      message: `QA 검토 반려: ${critique.summary}`,
      result: { ...generateResult, evaluator: evaluateResult },
    });
    return { generator: generateResult, evaluator: evaluateResult, finalPassed: false, blockedAt: 'guardrail_4' };
  }

  // needs_refinement
  emit(AgentStep.NEEDS_REFINEMENT, {
    message: `QA 검토 결과: 개선 권장. ${critique.summary}`,
    result: { ...generateResult, evaluator: evaluateResult },
  });
  return { generator: generateResult, evaluator: evaluateResult, finalPassed: false, blockedAt: 'guardrail_4_refinement' };
}

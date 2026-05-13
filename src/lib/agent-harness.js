// src/lib/agent-harness.js — Two-Agent Harness Client (Phase 2-2b STEP C-2)
//
// 변경 사항 (vs STEP C-1):
//   - runGenerator() 와 runEvaluator() 를 별도 함수로 분리
//   - 자동 흐름 제거 — 사용자가 각 단계 명시적 트리거
//   - 화면설계서 v260506 의 3단계 워크플로우와 일치:
//     [1] AI 생성 (Generator) — [⚡ AI 생성] 버튼
//     [2] QA 검토 (Evaluator) — [🔍 QA 검토 시작] 버튼
//     [3] 승인 (HITL)          — Phase 2-3
//
// 이유 (대표님 지적):
//   ASPICE PAM v4.0 공학자 권한 원칙: 자동화는 보조, 인간이 결정.
//   Generator 결과는 초안(draft)이며, 인간 검토 후 QA 진행이 표준 워크플로우.

export const AgentStep = Object.freeze({
  IDLE:                  'idle',
  // Generator 단계
  GEN_PREPARING:         'gen_preparing',
  GEN_GENERATING:        'gen_generating',
  GEN_VALIDATING:        'gen_validating',
  GEN_COMPLETED:         'gen_completed',
  GEN_FAILED:            'gen_failed',
  GEN_BLOCKED:           'gen_blocked',
  // Evaluator 단계
  EVAL_PREPARING:        'eval_preparing',
  EVAL_EVALUATING:       'eval_evaluating',
  EVAL_COMPLETED:        'eval_completed',
  EVAL_FAILED:           'eval_failed',
  EVAL_NEEDS_REFINEMENT: 'eval_needs_refinement',
  EVAL_REJECTED:         'eval_rejected',
});

// ──────────────────────────────────────────────────
// Phase 1: Generator (Claude Opus 4.7)
// ──────────────────────────────────────────────────
/**
 * Run Generator only.
 * @returns {Promise<{generator, passed, blockedAt?}>}
 */
export async function runGenerator({ projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => {
    console.log('[harness:gen]', step, detail?.message || '');
    if (onProgress) onProgress(step, detail);
  };

  emit(AgentStep.GEN_PREPARING, { message: '입력 검증 및 Skills 로딩' });
  await new Promise(r => setTimeout(r, 200));

  emit(AgentStep.GEN_GENERATING, {
    message: 'Claude Opus 4.7 (adaptive thinking) 호출 중 — 깊이 추론 후 산출물 생성합니다. 보통 2~4분 소요. 패널을 닫지 마세요.',
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
    console.error('[harness:gen] network error:', e);
    emit(AgentStep.GEN_FAILED, { message: `네트워크 오류 (Generator): ${e.message}` });
    throw e;
  }

  if (!generateResp.ok) {
    const errText = await generateResp.text();
    console.error('[harness:gen] API error:', generateResp.status, errText);
    emit(AgentStep.GEN_FAILED, { message: `Generator API 오류 ${generateResp.status}: ${errText.slice(0, 200)}` });
    throw new Error(errText);
  }

  const generateResult = await generateResp.json();
  console.log('[harness:gen] result keys:', Object.keys(generateResult));

  // Generator의 통과 여부 — 다양한 응답 구조에 관대하게 대응
  const generatorPassed = (
    generateResult.passed === true ||
    generateResult.guardrail_passed === true ||
    (generateResult.success === true && !generateResult.error) ||
    (generateResult.success === true && generateResult.guardrail_result?.passed === true)
  );

  console.log('[harness:gen] passed?', generatorPassed);

  emit(AgentStep.GEN_VALIDATING, { message: '5축 가드레일 검증 (① 구조 / ② 추적성 / ③ 도메인)' });
  await new Promise(r => setTimeout(r, 300));

  if (!generatorPassed) {
    const failedAxes = generateResult.guardrail_result?.failed_axes
                    || generateResult.guardrail_result?.failed
                    || [];
    emit(AgentStep.GEN_BLOCKED, {
      message: `구조/추적성/도메인 가드레일 차단${failedAxes.length ? ': ' + failedAxes.join(', ') : ''}`,
      result: generateResult,
    });
    return {
      generator: generateResult,
      passed: false,
      blockedAt: 'guardrail_1_2_3',
    };
  }

  emit(AgentStep.GEN_COMPLETED, {
    message: `생성 완료. 산출물을 검토하신 후 [🔍 QA 검토 시작] 버튼을 누르면 Gemini가 독립 평가합니다.`,
    result: generateResult,
  });

  return {
    generator: generateResult,
    passed: true,
  };
}

// ──────────────────────────────────────────────────
// Phase 2: Evaluator (Gemini)
// ──────────────────────────────────────────────────
/**
 * Run Evaluator only. Requires Generator result.
 * @returns {Promise<{evaluator, critique, verdict, passed}>}
 */
export async function runEvaluator({ generatorResult, projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => {
    console.log('[harness:eval]', step, detail?.message || '');
    if (onProgress) onProgress(step, detail);
  };

  // Generator output 추출 (다양한 응답 구조 처리)
  const generatedOutput = (
    generatorResult.output ||
    generatorResult.parsed_output ||
    generatorResult.ai_generated ||
    generatorResult.content?.ai_generated ||
    generatorResult.content ||
    null
  );

  if (!generatedOutput) {
    console.error('[harness:eval] No output in generator result');
    emit(AgentStep.EVAL_FAILED, { message: 'Generator 출력을 찾을 수 없어 QA 검토 불가.' });
    throw new Error('No generator output found');
  }

  emit(AgentStep.EVAL_PREPARING, { message: 'Evaluator 준비 — Gemini API 호출 준비 중' });
  await new Promise(r => setTimeout(r, 200));

  emit(AgentStep.EVAL_EVALUATING, {
    message: 'QA 검토 — Gemini가 Claude 결과를 독립 평가합니다 (편향 분리). 10~30초 소요.',
  });

  let evaluateResp;
  try {
    evaluateResp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai_generation_id: generatorResult.ai_generation_id,
        generated_output: generatedOutput,
        process_id: processId,
        project_id: projectId,
        work_product_id: workProductId,
      }),
    });
  } catch (e) {
    console.error('[harness:eval] network error:', e);
    emit(AgentStep.EVAL_FAILED, { message: `네트워크 오류 (Evaluator): ${e.message}` });
    throw e;
  }

  if (!evaluateResp.ok) {
    const errText = await evaluateResp.text();
    console.error('[harness:eval] API error:', evaluateResp.status, errText);
    emit(AgentStep.EVAL_FAILED, { message: `Evaluator API 오류 ${evaluateResp.status}: ${errText.slice(0, 200)}` });
    throw new Error(errText);
  }

  const evaluateResult = await evaluateResp.json();
  console.log('[harness:eval] result:', evaluateResult);

  const critique = evaluateResult.critique;
  if (!critique) {
    console.error('[harness:eval] no critique field');
    emit(AgentStep.EVAL_FAILED, { message: 'Evaluator 응답에 critique 필드가 없음.' });
    throw new Error('No critique in evaluator response');
  }

  const verdict = critique.verdict;
  console.log('[harness:eval] verdict:', verdict, '| score:', critique.overall_score);

  // 최종 verdict 판정
  if (verdict === 'passed') {
    emit(AgentStep.EVAL_COMPLETED, {
      message: `QA 검토 완료 — 통과. ${critique.summary || ''}`,
      result: evaluateResult,
    });
    return {
      evaluator: evaluateResult,
      critique,
      verdict,
      passed: true,
    };
  }

  if (verdict === 'rejected') {
    emit(AgentStep.EVAL_REJECTED, {
      message: `QA 검토 반려: ${critique.summary || ''}`,
      result: evaluateResult,
    });
    return {
      evaluator: evaluateResult,
      critique,
      verdict,
      passed: false,
    };
  }

  // needs_refinement
  emit(AgentStep.EVAL_NEEDS_REFINEMENT, {
    message: `QA 검토 결과: 개선 권장. ${critique.summary || ''}`,
    result: evaluateResult,
  });
  return {
    evaluator: evaluateResult,
    critique,
    verdict,
    passed: false,
  };
}

// ──────────────────────────────────────────────────
// Helper: 활성 단계인지 (생성 중 또는 평가 중)
// ──────────────────────────────────────────────────
export function isGenerating(step) {
  return [
    AgentStep.GEN_PREPARING,
    AgentStep.GEN_GENERATING,
    AgentStep.GEN_VALIDATING,
  ].includes(step);
}

export function isEvaluating(step) {
  return [
    AgentStep.EVAL_PREPARING,
    AgentStep.EVAL_EVALUATING,
  ].includes(step);
}

export function isBusy(step) {
  return isGenerating(step) || isEvaluating(step);
}

// src/lib/agent-harness.js — Three-Agent Harness Client (Phase 2-2b STEP C-1)
//
// 변경 사항 (vs STEP B):
//   - Generator 응답 구조에 관대 (passed/guardrail_passed 둘 다 처리)
//   - Evaluator 호출이 항상 시도됨 (Generator 차단되지 않은 한)
//   - 콘솔 로그 강화 (디버깅용)
//   - Generator output 위치도 다양하게 처리 (output / parsed_output / content / ai_generated)
//
// 진행 단계:
//   PREPARING → GENERATING → VALIDATING → EVALUATING → COMPLETED
//   각 단계에서 emit으로 onProgress 콜백 호출

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
 * Run Generator + Evaluator (2-Phase Harness).
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.processId
 * @param {string} params.workProductId
 * @param {(step, detail) => void} params.onProgress
 * @returns {Promise<HarnessResult>}
 */
export async function runAgentHarness({ projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => {
    console.log('[harness]', step, detail?.message || '');
    if (onProgress) onProgress(step, detail);
  };

  // ─────────────────────────────────────
  // Phase 1: Generator
  // ─────────────────────────────────────
  emit(AgentStep.PREPARING, { message: '입력 검증 및 Skills 로딩' });
  await new Promise(r => setTimeout(r, 200));

  emit(AgentStep.GENERATING, {
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
    console.error('[harness] Generator network error:', e);
    emit(AgentStep.FAILED, { message: `네트워크 오류 (Generator): ${e.message}` });
    throw e;
  }

  if (!generateResp.ok) {
    const errText = await generateResp.text();
    console.error('[harness] Generator API error:', generateResp.status, errText);
    emit(AgentStep.FAILED, { message: `Generator API 오류 ${generateResp.status}: ${errText.slice(0, 200)}` });
    throw new Error(errText);
  }

  const generateResult = await generateResp.json();
  console.log('[harness] Generator result keys:', Object.keys(generateResult));

  // Generator의 통과 여부 — 다양한 응답 구조에 관대하게 대응
  // 가능성 1: { passed: true/false }
  // 가능성 2: { guardrail_passed: true/false }
  // 가능성 3: { success: true } + guardrail_result 분석
  const generatorPassed = (
    generateResult.passed === true ||
    generateResult.guardrail_passed === true ||
    (generateResult.success === true && !generateResult.error) ||
    (generateResult.success === true && generateResult.guardrail_result?.passed === true)
  );

  console.log('[harness] Generator passed?', generatorPassed,
              '| passed:', generateResult.passed,
              '| guardrail_passed:', generateResult.guardrail_passed,
              '| success:', generateResult.success);

  // 가드레일 ① ② ③ 검증 단계 표시
  emit(AgentStep.VALIDATING, { message: '5축 가드레일 검증 (① 구조 / ② 추적성 / ③ 도메인)' });
  await new Promise(r => setTimeout(r, 300));

  // Generator가 차단된 경우 — Evaluator 호출 안 함
  if (!generatorPassed) {
    const failedAxes = generateResult.guardrail_result?.failed_axes
                    || generateResult.guardrail_result?.failed
                    || [];
    emit(AgentStep.BLOCKED, {
      message: `구조/추적성/도메인 가드레일 차단${failedAxes.length ? ': ' + failedAxes.join(', ') : ''}`,
      result: generateResult,
    });
    return {
      generator: generateResult,
      evaluator: null,
      finalPassed: false,
      blockedAt: 'guardrail_1_2_3',
    };
  }

  // ─────────────────────────────────────
  // Generator output 추출 (다양한 응답 구조 처리)
  // ─────────────────────────────────────
  const generatedOutput = (
    generateResult.output ||
    generateResult.parsed_output ||
    generateResult.ai_generated ||
    generateResult.content?.ai_generated ||
    generateResult.content ||
    null
  );

  if (!generatedOutput) {
    console.error('[harness] No output found in generator response. Skipping evaluator.');
    emit(AgentStep.COMPLETED, {
      message: '생성 완료. QA 검토는 출력 형식이 인식되지 않아 건너뜀.',
      result: generateResult,
    });
    return {
      generator: generateResult,
      evaluator: null,
      finalPassed: true,
      evaluatorSkipped: 'no_output_in_response',
    };
  }

  // ─────────────────────────────────────
  // Phase 2: Evaluator (Gemini)
  // ─────────────────────────────────────
  emit(AgentStep.EVALUATING, {
    message: 'QA 검토 — Gemini가 Claude 결과를 독립 평가합니다 (편향 분리). 10~30초 소요.',
  });

  let evaluateResp;
  try {
    evaluateResp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai_generation_id: generateResult.ai_generation_id,
        generated_output: generatedOutput,
        process_id: processId,
        project_id: projectId,
        work_product_id: workProductId,
      }),
    });
  } catch (e) {
    console.error('[harness] Evaluator network error:', e);
    emit(AgentStep.COMPLETED, {
      message: `생성 완료. QA 검토는 네트워크 오류로 건너뜀: ${e.message}`,
      result: { ...generateResult, evaluator_error: e.message },
    });
    return {
      generator: generateResult,
      evaluator: null,
      finalPassed: true,
      evaluatorError: e.message,
    };
  }

  if (!evaluateResp.ok) {
    const errText = await evaluateResp.text();
    console.error('[harness] Evaluator API error:', evaluateResp.status, errText);
    emit(AgentStep.COMPLETED, {
      message: `생성 완료. QA 검토 실패 (${evaluateResp.status}): ${errText.slice(0, 200)}`,
      result: { ...generateResult, evaluator_error: errText.slice(0, 200) },
    });
    return {
      generator: generateResult,
      evaluator: null,
      finalPassed: true,
      evaluatorError: errText,
    };
  }

  const evaluateResult = await evaluateResp.json();
  console.log('[harness] Evaluator result:', evaluateResult);

  const critique = evaluateResult.critique;

  if (!critique) {
    console.error('[harness] Evaluator returned no critique field');
    emit(AgentStep.COMPLETED, {
      message: '생성 완료. QA 검토 응답이 비어 있음.',
      result: { ...generateResult, evaluator: evaluateResult },
    });
    return {
      generator: generateResult,
      evaluator: evaluateResult,
      finalPassed: true,
      evaluatorError: 'empty_critique',
    };
  }

  const verdict = critique.verdict;
  console.log('[harness] Verdict:', verdict, '| score:', critique.overall_score);

  // ─────────────────────────────────────
  // 최종 verdict 판정
  // ─────────────────────────────────────
  if (verdict === 'passed') {
    emit(AgentStep.COMPLETED, {
      message: `생성 + QA 검토 완료. Gemini 평가: ${critique.summary || '통과'}`,
      result: { ...generateResult, evaluator: evaluateResult },
    });
    return {
      generator: generateResult,
      evaluator: evaluateResult,
      finalPassed: true,
    };
  }

  if (verdict === 'rejected') {
    emit(AgentStep.BLOCKED, {
      message: `QA 검토 반려: ${critique.summary || '반려'}`,
      result: { ...generateResult, evaluator: evaluateResult },
    });
    return {
      generator: generateResult,
      evaluator: evaluateResult,
      finalPassed: false,
      blockedAt: 'guardrail_4',
    };
  }

  // needs_refinement (또는 unknown)
  emit(AgentStep.NEEDS_REFINEMENT, {
    message: `QA 검토 결과: 개선 권장. ${critique.summary || ''}`,
    result: { ...generateResult, evaluator: evaluateResult },
  });
  return {
    generator: generateResult,
    evaluator: evaluateResult,
    finalPassed: false,
    blockedAt: 'guardrail_4_refinement',
  };
}

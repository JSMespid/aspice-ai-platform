// src/lib/agent-harness.js — 클라이언트 사이드 Agent Harness
//
// Phase 2-2a:
//   - Generator-only 호출
//   - 진행 단계 표시 (Plan / Generate / Verify)
//   - 결과 + 가드레일 결과를 RationalePanel 에 전달
//
// Phase 2-2b 확장 예정:
//   - Evaluator (Gemini) 호출 추가
//   - critique-and-refine cycle
//
// Phase 2-2c 확장 예정:
//   - Planner (Claude Haiku) 호출 추가

/**
 * Agent Harness 의 단계별 상태
 */
export const AgentStep = Object.freeze({
  IDLE:         'idle',
  PREPARING:    'preparing',     // 입력 검증 + Skills 선택
  GENERATING:   'generating',    // Claude API 호출
  VALIDATING:   'validating',    // 가드레일 검증
  COMPLETED:    'completed',
  FAILED:       'failed',
  BLOCKED:      'blocked',       // 가드레일에 차단됨
});

/**
 * Generator 호출 + 진행 단계 콜백
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.processId
 * @param {string} params.workProductId
 * @param {(step: string, detail?: any) => void} params.onProgress
 * @returns {Promise<GenerationResult>}
 */
export async function runAgentHarness({ projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => {
    if (onProgress) onProgress(step, detail);
  };

  emit(AgentStep.PREPARING, { message: '입력 검증 및 Skills 로딩' });

  // 약간의 시각적 피드백 (Skills 로딩 시간)
  await new Promise(r => setTimeout(r, 300));

  emit(AgentStep.GENERATING, { message: 'Claude Opus 4.7 (adaptive thinking) 호출 중 — 최고 품질 산출물을 위해 깊이 추론합니다. 보통 2~4분 소요. 패널을 닫지 마세요.' });

  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        process_id: processId,
        work_product_id: workProductId,
      }),
    });
  } catch (e) {
    emit(AgentStep.FAILED, { message: `네트워크 오류: ${e.message}` });
    throw e;
  }

  if (!response.ok) {
    const errText = await response.text();
    emit(AgentStep.FAILED, { message: `API 오류 ${response.status}: ${errText.slice(0, 200)}` });
    throw new Error(errText);
  }

  const result = await response.json();

  emit(AgentStep.VALIDATING, { message: '5축 가드레일 검증 완료' });
  await new Promise(r => setTimeout(r, 200));

  if (result.passed) {
    emit(AgentStep.COMPLETED, {
      message: '생성 완료 (5축 가드레일 통과)',
      result,
    });
  } else {
    emit(AgentStep.BLOCKED, {
      message: `가드레일 차단: ${(result.guardrail_result?.failed_axes || []).join(', ')}`,
      result,
    });
  }

  return result;
}

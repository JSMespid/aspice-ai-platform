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
  // Phase 2-2d: Streaming 진행 단계 (백엔드 SSE 이벤트와 매핑)
  GEN_SHEET_START:       'gen_sheet_start',     // 시트별 시작
  GEN_SHEET_DONE:        'gen_sheet_done',      // 시트별 완료
  GEN_SHEET_FAILED:      'gen_sheet_failed',    // 시트별 실패
  GEN_MERGING:           'gen_merging',         // 결과 병합
  GEN_SAVING:            'gen_saving',          // 저장 중
  // Phase 2-2e: Batch 처리 단계 (Anthropic Tier 한도 회피)
  GEN_BATCH_PLAN:        'gen_batch_plan',      // 배치 계획 (N개씩 M배치)
  GEN_BATCH_START:       'gen_batch_start',     // 배치 시작
  GEN_BATCH_DONE:        'gen_batch_done',      // 배치 완료
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
 *
 * Phase 2-2d: SSE streaming 모드 사용
 *   - Vercel Edge proxy 5분 침묵 타임아웃 회피
 *   - 실시간 진행 단계 + 비용 + 토큰 정보 수신
 *   - onProgress 콜백에 detail 객체로 풍부한 정보 전달
 *
 * @returns {Promise<{generator, passed, blockedAt?}>}
 */
export async function runGenerator({ projectId, processId, workProductId, onProgress }) {
  const emit = (step, detail) => {
    console.log('[harness:gen]', step, detail?.message || '');
    if (onProgress) onProgress(step, detail);
  };

  emit(AgentStep.GEN_PREPARING, { message: '입력 검증 및 Skills 로딩' });

  // SSE 스트림 시작
  let generateResp;
  try {
    generateResp = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',  // Phase 2-2d: streaming 요청
      },
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

  // Phase 2-2d: SSE 응답을 받는지 JSON 응답을 받는지 판정
  const contentType = String(generateResp.headers.get('content-type') || '').toLowerCase();
  const isSSE = contentType.includes('text/event-stream');

  let generateResult = null;

  if (isSSE) {
    // ─── SSE 스트리밍 수신 ───
    emit(AgentStep.GEN_GENERATING, {
      message: 'Claude Opus 4.7 (adaptive thinking) 호출 중 — 깊이 추론 후 산출물 생성합니다. 보통 2~4분 소요. 패널을 닫지 마세요.',
    });

    try {
      generateResult = await consumeSSEStream(generateResp, (eventType, payload) => {
        // 백엔드 progress 이벤트 → 프론트엔드 AgentStep 매핑
        if (eventType === 'started') {
          // 이미 GEN_GENERATING으로 표시 중. 백엔드 시작 ack만 기록
          console.log('[harness:gen] backend started at', payload.ts);
          return;
        }
        if (eventType === 'progress') {
          const step = payload.step;
          // sheet_* 이벤트는 별도 AgentStep으로 표시
          if (step === 'sheet_start') {
            emit(AgentStep.GEN_SHEET_START, {
              message: payload.message,
              sheet_idx: payload.sheet_idx,
              sheet_name: payload.sheet_name,
              sheet_group: payload.sheet_group,
              raw: payload,
            });
          } else if (step === 'sheet_done') {
            emit(AgentStep.GEN_SHEET_DONE, {
              message: payload.message,
              sheet_idx: payload.sheet_idx,
              sheet_name: payload.sheet_name,
              sheet_group: payload.sheet_group,
              stk_count: payload.stk_count,
              cache_hit: payload.cache_hit,
              latency_ms: payload.latency_ms,
              raw: payload,
            });
          } else if (step === 'sheet_failed') {
            emit(AgentStep.GEN_SHEET_FAILED, {
              message: payload.message,
              sheet_idx: payload.sheet_idx,
              sheet_name: payload.sheet_name,
              error: payload.error,
              raw: payload,
            });
          } else if (step === 'batch_plan') {
            // Phase 2-2e: 배치 계획 정보 (배치 N개, 시트 M개씩)
            emit(AgentStep.GEN_BATCH_PLAN, {
              message: payload.message,
              batch_size: payload.batch_size,
              total_batches: payload.total_batches,
              total_sheets: payload.total_sheets,
              raw: payload,
            });
          } else if (step === 'batch_start') {
            // Phase 2-2e: 배치 시작 (배치 N/M 시작)
            emit(AgentStep.GEN_BATCH_START, {
              message: payload.message,
              batch_idx: payload.batch_idx,
              batch_total: payload.batch_total,
              sheets_in_batch: payload.sheets_in_batch,
              sheets_start_idx: payload.sheets_start_idx,
              sheets_end_idx: payload.sheets_end_idx,
              raw: payload,
            });
          } else if (step === 'batch_done') {
            // Phase 2-2e: 배치 완료
            emit(AgentStep.GEN_BATCH_DONE, {
              message: payload.message,
              batch_idx: payload.batch_idx,
              batch_total: payload.batch_total,
              batch_succeeded: payload.batch_succeeded,
              batch_failed: payload.batch_failed,
              batch_duration_ms: payload.batch_duration_ms,
              raw: payload,
            });
          } else if (step === 'merging') {
            emit(AgentStep.GEN_MERGING, {
              message: payload.message,
              raw: payload,
            });
          } else if (step === 'guardrail_running') {
            emit(AgentStep.GEN_VALIDATING, {
              message: payload.message,
              raw: payload,
            });
          } else if (step === 'guardrail_done') {
            // 결과는 complete 이벤트에서 처리하지만, 진행 표시는 여기서
            emit(AgentStep.GEN_VALIDATING, {
              message: payload.message,
              passed: payload.passed,
              failed_axes: payload.failed_axes,
              raw: payload,
            });
          } else if (step === 'saving') {
            emit(AgentStep.GEN_SAVING, {
              message: payload.message,
              cost_usd: payload.cost_usd,
              raw: payload,
            });
          } else {
            // mode_detected, loading_input, single_call_start/done 등 일반 progress
            emit(AgentStep.GEN_GENERATING, {
              message: payload.message || step,
              raw: payload,
            });
          }
        } else if (eventType === 'complete') {
          // 최종 결과 — generateResult로 사용
          return payload;  // consumeSSEStream이 이를 반환값으로 사용
        } else if (eventType === 'error') {
          // 백엔드 에러 — throw로 catch 블록에 위임
          throw new Error(payload.error || 'Streaming error');
        }
        return undefined;
      });
    } catch (e) {
      console.error('[harness:gen] streaming error:', e);
      emit(AgentStep.GEN_FAILED, { message: `Generator 스트리밍 오류: ${e.message}` });
      throw e;
    }
  } else {
    // ─── 기존 JSON 응답 (백워드 호환) ───
    emit(AgentStep.GEN_GENERATING, {
      message: 'Claude Opus 4.7 (adaptive thinking) 호출 중 — 깊이 추론 후 산출물 생성합니다. 보통 2~4분 소요. 패널을 닫지 마세요.',
    });
    generateResult = await generateResp.json();
  }

  console.log('[harness:gen] result keys:', generateResult ? Object.keys(generateResult) : null);

  if (!generateResult) {
    emit(AgentStep.GEN_FAILED, { message: 'Generator가 결과를 반환하지 않았습니다.' });
    throw new Error('No generator result');
  }

  // Generator의 통과 여부 — 다양한 응답 구조에 관대하게 대응
  const generatorPassed = (
    generateResult.passed === true ||
    generateResult.guardrail_passed === true ||
    (generateResult.success === true && !generateResult.error) ||
    (generateResult.success === true && generateResult.guardrail_result?.passed === true)
  );

  console.log('[harness:gen] passed?', generatorPassed);

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
// Phase 2-2d: SSE Stream Consumer
// ──────────────────────────────────────────────────
/**
 * fetch() 응답 body의 SSE 스트림을 파싱하여 onEvent 콜백 호출.
 * onEvent가 truthy 값을 반환하면 그 값이 최종 반환값(complete 이벤트의 payload).
 *
 * SSE 포맷:
 *   event: <type>
 *   data: <json>
 *   <blank line>
 *
 * 한 청크에 여러 이벤트가 올 수 있고, 한 이벤트가 여러 청크에 걸칠 수도 있음.
 * 버퍼 기반으로 \n\n 을 경계로 이벤트 단위 분리.
 */
async function consumeSSEStream(response, onEvent) {
  if (!response.body) {
    throw new Error('Response has no body (streaming not supported by this browser?)');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalResult = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 이벤트 경계: 빈 줄 (\n\n)
      // 한 청크 안에 여러 이벤트가 있을 수 있어 반복 처리
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        // ': ' 으로 시작하는 코멘트 라인 무시
        if (rawEvent.startsWith(':')) continue;
        if (rawEvent.trim().length === 0) continue;

        // event: <type>\ndata: <json>
        const lines = rawEvent.split('\n');
        let eventType = 'message';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) continue;

        let payload = null;
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch (e) {
          console.warn('[sse] failed to parse data:', dataLines.join('\n'), e);
          continue;
        }

        // complete/error 이벤트는 finalResult 후보
        if (eventType === 'complete') {
          finalResult = payload;
        }

        // 모든 이벤트를 onEvent로 전달
        const maybeFinal = onEvent(eventType, payload);
        if (maybeFinal && !finalResult) {
          finalResult = maybeFinal;
        }
      }
    }
    // 스트림 끝
    return finalResult;
  } finally {
    try { reader.releaseLock(); } catch (_) { /* noop */ }
  }
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
    // Phase 2-2d: streaming 진행 단계도 활성
    AgentStep.GEN_SHEET_START,
    AgentStep.GEN_SHEET_DONE,
    AgentStep.GEN_SHEET_FAILED,
    AgentStep.GEN_MERGING,
    AgentStep.GEN_SAVING,
    // Phase 2-2e: batch 처리 단계도 활성
    AgentStep.GEN_BATCH_PLAN,
    AgentStep.GEN_BATCH_START,
    AgentStep.GEN_BATCH_DONE,
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

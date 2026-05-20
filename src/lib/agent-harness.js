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
        if (eventType === 'ping') {
          // Phase 2-2f: SSE Keep-alive ping (25초마다) — Vercel proxy 침묵 타임아웃 방지용
          // UI 영향 없음, 디버그 로그만 (개발 중 검증용; 향후 verbose 플래그로 가릴 수 있음)
          if (payload.seq % 4 === 1) {
            // 매 4번째(=100초)마다 한 번만 로그 — 콘솔 노이즈 최소화
            console.log('[harness:gen] keep-alive ping seq', payload.seq, '(connection alive)');
          }
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

// ══════════════════════════════════════════════════════════════════
// Phase 2-2g (옵션 G): Chunked Generation Orchestrator
// ══════════════════════════════════════════════════════════════════
// 시트 ≥3 케이스에서 사용. Vercel 800s 한도를 피하기 위해 시트를 batch
// 단위로 쪼개서 init → batch(반복) → merge 시퀀스로 호출.
//
// 흐름:
//   1. work_product.content → 시트 추출 (extractSheetsFromWorkProduct)
//   2. batchSize 단위로 batches 계산
//   3. POST /api/generate-init → generation_id
//   4. 각 batch 마다 (concurrency 단위 wave 로):
//        POST /api/generate-batch (SSE)
//        consumeSSEStream + sheet_index→sheet_idx 정규화하여 emit
//   5. POST /api/generate-merge → 최종 결과 + 가드레일
//
// 설계 결정 반영 (인수인계 권장안):
//   #1 시트 수 분기: 호출 측 (ProcessScreen) 책임 — 이 함수는 ≥3 가정
//   #2 부분 실패 자동 merge: force_partial=true 항상
//   #3 Resume v1: 표시만 (이 함수는 신규 시작; resume 은 fetchGenerationStatus 별도)
//   #4 Cancel 후 부분 결과: 호출 측 책임 — 이 함수는 cancel 감지 시 즉시 종료
// ──────────────────────────────────────────────────────────────────

/**
 * Cancel a running generation (cooperative — batches stop at next checkpoint).
 * @param {string} generationId
 * @returns {Promise<{success, status, ...}>}
 */
export async function cancelGeneration(generationId) {
  if (!generationId) throw new Error('cancelGeneration: generationId required');
  const resp = await fetch('/api/generate-cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation_id: generationId }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`generate-cancel ${resp.status}: ${errText.slice(0, 200)}`);
  }
  return resp.json();
}

/**
 * Fetch current generation status (poll / resume support).
 * Either `generationId` OR (`projectId` + `workProductId`).
 * @returns {Promise<object|null>}  null if not found (project+wp pattern, no active)
 */
export async function fetchGenerationStatus({ generationId, projectId, workProductId } = {}) {
  const params = new URLSearchParams();
  if (generationId) params.set('generation_id', generationId);
  if (projectId) params.set('project_id', projectId);
  if (workProductId) params.set('work_product_id', workProductId);
  if (![...params.keys()].length) {
    throw new Error('fetchGenerationStatus: provide generationId OR (projectId AND workProductId)');
  }
  const resp = await fetch(`/api/generation-status?${params.toString()}`);
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`generation-status ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  // 패턴 B (project+wp) 에서 master 가 없으면 { generation: null }
  if (data && data.generation === null) return null;
  return data;
}

/**
 * Extract sheets from work_product.content for chunked generation.
 *
 * legacy api/generate.js 의 `sheetBasedInputs` 빌드 (line 913 근처) 와
 * 동일한 로직. wp.content 구조:
 *
 *   wp.content = {
 *     [itemKey]: {
 *       source_type: 'excel_multi_sheet',  // ← 필수 마커
 *       fileName: 'xxx.xlsx',
 *       sheets: [
 *         { sheet_name, group_name, columns, rows, selected, is_meta, ... },
 *         ...
 *       ],
 *     },
 *     ai_generated: {...},  // AI 산출물 (제외)
 *   }
 *
 * 추출 규칙 (legacy 동일):
 *   - source_type === 'excel_multi_sheet' 인 itemKey 만 처리
 *   - sheets[] 가 array 일 때만
 *   - 각 sheet 는 selected === true && is_meta !== true 만 (사용자 선택분)
 *   - sheet_index 는 글로벌 순서 (여러 itemKey 에 걸쳐 1, 2, 3, ...)
 *
 * 출력은 generate-batch 의 sheets[] 입력 그대로 사용 가능 (legacy 의
 * buildSheetUserPrompt 가 generate-batch 에서도 사용되므로 sheet 객체의
 * 모든 필드를 통과시킨다).
 *
 * @param {object} content  wp.content 객체
 * @returns {Array}  [{ sheet_index, sheet_name, group_name, columns, rows, ... }]
 */
export function extractSheetsFromWorkProduct(content) {
  if (!content || typeof content !== 'object') {
    console.warn('[extractSheets] empty/invalid content');
    return [];
  }

  const sheets = [];
  let globalIdx = 1;

  for (const [key, value] of Object.entries(content)) {
    if (value?.source_type !== 'excel_multi_sheet') continue;
    if (!Array.isArray(value.sheets)) continue;

    for (const sheet of value.sheets) {
      // legacy 와 동일한 필터: selected 시트, 메타 시트 제외
      if (!sheet.selected) continue;
      if (sheet.is_meta) continue;

      sheets.push({
        // legacy 의 sheet 객체 그대로 통과 (buildSheetUserPrompt 호환)
        ...sheet,
        // 글로벌 인덱스 (여러 itemKey 에 걸쳐 1, 2, 3, ...)
        sheet_index: globalIdx++,
        // 추적성: itemKey 와 fileName 보존 (legacy sheetBasedInputs 와 동일 정보)
        source_file_name: value.fileName || sheet.source_file_name || null,
        _item_key: key,  // 디버그/추적용 — backend 가 무시해도 무해
      });
    }
  }

  if (sheets.length === 0) {
    console.warn(
      '[extractSheets] excel_multi_sheet 시트를 찾지 못했습니다. ' +
      'content keys:', Object.keys(content),
      '— 입력 항목이 register 되었는지 확인하세요.'
    );
  } else {
    console.log(`[extractSheets] ${sheets.length} 시트 추출:`,
      sheets.map(s => `${s.sheet_index}: ${s.sheet_name} (${s._item_key})`).join(', ')
    );
  }

  return sheets;
}

/**
 * Build a chunked plan from a flat sheets[] array.
 * @returns {{ totalBatches, totalSheets, batches: [{ batch_idx, sheets: [...] }] }}
 */
function buildChunkedPlan(sheets, batchSize) {
  const batches = [];
  for (let i = 0; i < sheets.length; i += batchSize) {
    const slice = sheets.slice(i, i + batchSize);
    batches.push({
      batch_idx: batches.length + 1,
      sheets: slice,
    });
  }
  return {
    totalBatches: batches.length,
    totalSheets: sheets.length,
    batches,
  };
}

/**
 * Run one batch via SSE. Emits AgentStep events through `emit`.
 * Returns { batchIdx, finalPayload, cancelled, failed }.
 *
 * sheet_index → sheet_idx 정규화: generate-batch 의 progress 이벤트는 sheet_index
 * (snake_case 일관성) 를 보내지만 RationalePanel / AgentStep 디테일은 기존 legacy
 * 와 호환 위해 sheet_idx 로 노출.
 */
async function runOneBatch({ generationId, batchIdx, totalBatches, sheets, emit }) {
  emit(AgentStep.GEN_BATCH_START, {
    message: `Batch ${batchIdx}/${totalBatches} 시작 — 시트 ${sheets.length}개`,
    batch_idx: batchIdx,
    batch_total: totalBatches,
    sheets_in_batch: sheets.length,
    sheets_start_idx: sheets[0]?.sheet_index ?? null,
    sheets_end_idx: sheets[sheets.length - 1]?.sheet_index ?? null,
    raw: {
      batch_idx: batchIdx,
      batch_total: totalBatches,
      sheets_in_batch: sheets.length,
      sheets_start_idx: sheets[0]?.sheet_index ?? null,
      sheets_end_idx: sheets[sheets.length - 1]?.sheet_index ?? null,
    },
  });

  let resp;
  try {
    resp = await fetch('/api/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ generation_id: generationId, batch_idx: batchIdx, sheets }),
    });
  } catch (e) {
    emit(AgentStep.GEN_SHEET_FAILED, {
      message: `Batch ${batchIdx} 네트워크 오류: ${e.message}`,
      error: e.message,
    });
    return { batchIdx, cancelled: false, failed: true, error: e.message };
  }

  if (!resp.ok) {
    const errText = await resp.text();
    emit(AgentStep.GEN_SHEET_FAILED, {
      message: `Batch ${batchIdx} API 오류 ${resp.status}: ${errText.slice(0, 200)}`,
      error: errText.slice(0, 500),
    });
    return { batchIdx, cancelled: false, failed: true, error: errText };
  }

  const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
  const isSSE = contentType.includes('text/event-stream');

  let finalPayload = null;
  let cancelled = false;

  if (isSSE) {
    try {
      finalPayload = await consumeSSEStream(resp, (eventType, payload) => {
        if (eventType === 'started' || eventType === 'ping') return undefined;

        if (eventType === 'progress') {
          const step = payload.step;
          const sheetIdx = payload.sheet_index;  // generate-batch 는 sheet_index 사용
          const rawNormalized = { ...payload, sheet_idx: sheetIdx };

          if (step === 'sheet_start') {
            emit(AgentStep.GEN_SHEET_START, {
              message: payload.message,
              sheet_idx: sheetIdx,
              sheet_name: payload.sheet_name,
              sheet_group: payload.sheet_group,
              raw: rawNormalized,
            });
          } else if (step === 'sheet_done') {
            emit(AgentStep.GEN_SHEET_DONE, {
              message: payload.message,
              sheet_idx: sheetIdx,
              sheet_name: payload.sheet_name,
              sheet_group: payload.sheet_group,
              stk_count: payload.stk_count,
              cache_hit: payload.cache_hit,
              latency_ms: payload.latency_ms,
              cost_usd: payload.cost_usd,
              raw: rawNormalized,
            });
          } else if (step === 'sheet_failed') {
            emit(AgentStep.GEN_SHEET_FAILED, {
              message: payload.message,
              sheet_idx: sheetIdx,
              sheet_name: payload.sheet_name,
              error: payload.error,
              raw: rawNormalized,
            });
          } else {
            // 일반 progress
            emit(AgentStep.GEN_GENERATING, {
              message: payload.message || step,
              raw: rawNormalized,
            });
          }
        } else if (eventType === 'sheet_cancelled') {
          cancelled = true;
          emit(AgentStep.GEN_SHEET_FAILED, {
            message: payload.message || `시트 ${payload.sheet_index} 취소됨`,
            sheet_idx: payload.sheet_index,
            sheet_name: payload.sheet_name,
            error: 'cancelled',
            raw: { ...payload, sheet_idx: payload.sheet_index },
          });
        } else if (eventType === 'batch_cancelled') {
          cancelled = true;
          return payload;  // batch_cancelled 도 finalPayload 후보
        } else if (eventType === 'batch_complete') {
          return payload;
        } else if (eventType === 'circuit_breaker_paused') {
          emit(AgentStep.GEN_FAILED, {
            message: `Circuit breaker 작동: ${payload.message || '연속 batch 실패'}`,
            raw: payload,
          });
        } else if (eventType === 'error') {
          throw new Error(payload.error || 'Batch streaming error');
        }
        return undefined;
      });
    } catch (e) {
      console.error('[harness:gen:chunked] batch SSE error:', e);
      emit(AgentStep.GEN_SHEET_FAILED, {
        message: `Batch ${batchIdx} 스트리밍 오류: ${e.message}`,
        error: e.message,
      });
      return { batchIdx, cancelled, failed: true, error: e.message };
    }
  } else {
    finalPayload = await resp.json();
  }

  const succeeded = finalPayload?.sheets_succeeded ?? 0;
  const failed = finalPayload?.sheets_failed ?? 0;
  const cancelledCount = finalPayload?.sheets_cancelled ?? 0;
  const batchDurationMs = finalPayload?.batch_duration_ms ?? null;

  emit(AgentStep.GEN_BATCH_DONE, {
    message: `Batch ${batchIdx}/${totalBatches} 완료${cancelled ? ' (취소됨)' : ''} — 성공 ${succeeded}, 실패 ${failed}${cancelledCount ? `, 취소 ${cancelledCount}` : ''}`,
    batch_idx: batchIdx,
    batch_total: totalBatches,
    batch_succeeded: succeeded,
    batch_failed: failed,
    batch_cancelled: cancelledCount,
    batch_duration_ms: batchDurationMs,
    raw: finalPayload,
  });

  return { batchIdx, cancelled, finalPayload, succeeded, failed };
}

/**
 * Run a chunked Generator for ≥3-sheet work_products.
 *
 * @param {object} args
 * @param {string} args.projectId
 * @param {string} args.processId
 * @param {string} args.workProductId
 * @param {Array}  args.sheets        — required. 추출 책임은 호출 측 (또는 extractSheetsFromWorkProduct).
 * @param {number} [args.batchSize=2]
 * @param {number} [args.concurrency=2]
 * @param {function} [args.onProgress]
 * @param {function} [args.onGenerationId]  — generation_id 받자마자 호출 (취소 버튼 활성화용)
 * @returns {Promise<{generator, passed, blockedAt?, cancelled?, generation_id}>}
 */
export async function runGeneratorChunked({
  projectId, processId, workProductId,
  sheets, batchSize = 2, concurrency = 2,
  onProgress, onGenerationId,
}) {
  const emit = (step, detail) => {
    console.log('[harness:gen:chunked]', step, detail?.message || '');
    if (onProgress) onProgress(step, detail);
  };

  if (!Array.isArray(sheets) || sheets.length === 0) {
    emit(AgentStep.GEN_FAILED, { message: 'sheets 배열이 비어 있습니다 (chunked 경로는 ≥1 시트 필요).' });
    throw new Error('runGeneratorChunked: sheets[] required');
  }

  emit(AgentStep.GEN_PREPARING, { message: 'Chunked 모드 — batch plan 작성 중' });

  // ── 1. plan 작성 ──
  const plan = buildChunkedPlan(sheets, batchSize);
  const { totalBatches, totalSheets, batches } = plan;

  emit(AgentStep.GEN_BATCH_PLAN, {
    message: `Chunked 모드: ${totalBatches} 배치 × 최대 ${batchSize} 시트, 동시 ${concurrency}`,
    batch_size: batchSize,
    total_batches: totalBatches,
    total_sheets: totalSheets,
    raw: {
      batch_size: batchSize,
      total_batches: totalBatches,
      total_sheets: totalSheets,
      sheets: sheets.map(s => ({
        idx: s.sheet_index,
        name: s.sheet_name,
        group: s.group_name,
      })),
    },
  });

  // ── 2. /api/generate-init ──
  let initResult;
  try {
    const initResp = await fetch('/api/generate-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        process_id: processId,
        work_product_id: workProductId,
        plan: {
          batch_size: batchSize,
          concurrency,
          batches: batches.map(b => ({
            batch_idx: b.batch_idx,
            sheet_indices: b.sheets.map(s => s.sheet_index),
            sheet_names: b.sheets.map(s => s.sheet_name),
          })),
        },
      }),
    });
    if (!initResp.ok) {
      const errText = await initResp.text();
      throw new Error(`generate-init ${initResp.status}: ${errText.slice(0, 500)}`);
    }
    initResult = await initResp.json();
  } catch (e) {
    console.error('[harness:gen:chunked] init error:', e);
    emit(AgentStep.GEN_FAILED, { message: `초기화 실패: ${e.message}` });
    throw e;
  }

  const generationId = initResult.generation_id;
  if (onGenerationId) onGenerationId(generationId);
  console.log('[harness:gen:chunked] generation_id:', generationId);

  emit(AgentStep.GEN_GENERATING, {
    message: `${totalBatches}개 배치 처리 시작 — 시트 ${totalSheets}개, 예상 비용 ~$${(initResult.estimated_cost_usd || 0).toFixed(2)}`,
    generation_id: generationId,
    estimated_cost_usd: initResult.estimated_cost_usd,
  });

  // ── 3. batch 실행 (concurrency wave 단위) ──
  let anyCancelled = false;
  for (let waveStart = 0; waveStart < batches.length; waveStart += concurrency) {
    const wave = batches.slice(waveStart, waveStart + concurrency);
    const waveResults = await Promise.all(
      wave.map(b => runOneBatch({
        generationId,
        batchIdx: b.batch_idx,
        totalBatches,
        sheets: b.sheets,
        emit,
      }))
    );
    if (waveResults.some(r => r.cancelled)) {
      anyCancelled = true;
      break;  // 한 batch 라도 cancel → 다음 wave 진행 중단
    }
  }

  // ── 4. cancel 시 종료 (merge 시도하지 않음 — 호출 측이 부분 저장 결정) ──
  if (anyCancelled) {
    emit(AgentStep.GEN_FAILED, {
      message: '취소되었습니다. 부분 결과 보존 여부는 [부분 저장] / [모두 폐기] 버튼으로 결정하세요.',
      cancelled: true,
      generation_id: generationId,
    });
    return {
      generator: null,
      passed: false,
      cancelled: true,
      generation_id: generationId,
    };
  }

  // ── 5. /api/generate-merge ──
  emit(AgentStep.GEN_MERGING, { message: '병합 및 가드레일 검증 중' });

  let mergeResult;
  try {
    const mergeResp = await fetch('/api/generate-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generation_id: generationId,
        // 결정 #2 (인수인계 권장): 부분 실패 자동 merge 허용
        force_partial: true,
      }),
    });
    if (!mergeResp.ok) {
      const errText = await mergeResp.text();
      throw new Error(`generate-merge ${mergeResp.status}: ${errText.slice(0, 500)}`);
    }
    mergeResult = await mergeResp.json();
  } catch (e) {
    console.error('[harness:gen:chunked] merge error:', e);
    emit(AgentStep.GEN_FAILED, { message: `병합 실패: ${e.message}` });
    throw e;
  }

  console.log('[harness:gen:chunked] merge result keys:', mergeResult ? Object.keys(mergeResult) : null);

  // ── 6. 가드레일 결과 emit (RationalePanel 의 HOOKED → PASSED/FAILED 전환용) ──
  // merge endpoint 가 SSE 가 아니므로 guardrail_running/done 이벤트가 없다.
  // 결과만 한 번 GEN_VALIDATING 으로 emit 해서 패널이 표시할 수 있게 함.
  const gr = mergeResult.guardrail_result;
  if (gr) {
    emit(AgentStep.GEN_VALIDATING, {
      message: gr.passed
        ? `5축 가드레일 통과 (1·2·3축 PASS)`
        : `5축 가드레일 차단${gr.failed_axes?.length ? ': ' + gr.failed_axes.join(', ') : ''}`,
      passed: gr.passed,
      failed_axes: gr.failed_axes || gr.failed || [],
      guardrail_result: gr,
      raw: { step: 'guardrail_done', ...gr },
    });
  }

  // ── 7. 결과 분류 ──
  //   가드레일 FAIL → GEN_BLOCKED (사용자에게 명확한 차단 표시)
  //   가드레일 PASS + 전체 batch success → GEN_COMPLETED (이상적 완료)
  //   가드레일 PASS + 일부 batch 실패/취소 → GEN_COMPLETED + partial 경고
  //                                          (산출물은 저장되지만 일부 누락)
  const guardrailPassed = (
    gr?.passed === true ||
    mergeResult.guardrail_passed === true ||
    (mergeResult.success === true && !mergeResult.error && gr == null)
  );

  if (!guardrailPassed) {
    const failedAxes = gr?.failed_axes || gr?.failed || [];
    emit(AgentStep.GEN_BLOCKED, {
      message: `구조/추적성/도메인 가드레일 차단${failedAxes.length ? ': ' + failedAxes.join(', ') : ''}`,
      result: mergeResult,
    });
    return {
      generator: mergeResult,
      passed: false,
      blockedAt: 'guardrail_1_2_3',
      generation_id: generationId,
    };
  }

  // partial 케이스 — backend status='partial' 또는 is_partial=true 또는
  //                 일부 batch 가 실패/취소인 경우
  const isPartial = (
    mergeResult.status === 'partial' ||
    mergeResult.is_partial === true ||
    (mergeResult.failed_batches > 0) ||
    (mergeResult.cancelled_batches > 0)
  );

  if (isPartial) {
    const succeeded = mergeResult.successful_batches ?? 0;
    const failed = mergeResult.failed_batches ?? 0;
    const cancelledN = mergeResult.cancelled_batches ?? 0;
    const total = mergeResult.total_batches ?? 0;
    emit(AgentStep.GEN_COMPLETED, {
      message:
        `⚠️ 부분 완료 — ${total} batch 중 ${succeeded} 성공` +
        `${failed > 0 ? `, ${failed} 실패` : ''}` +
        `${cancelledN > 0 ? `, ${cancelledN} 취소` : ''}` +
        `. 누락된 시트는 다시 [⚡ AI 생성] 으로 재시도 가능합니다.`,
      partial: true,
      successful_batches: succeeded,
      failed_batches: failed,
      cancelled_batches: cancelledN,
      total_batches: total,
      result: mergeResult,
    });
    return {
      generator: mergeResult,
      passed: true,
      partial: true,
      generation_id: generationId,
    };
  }

  emit(AgentStep.GEN_COMPLETED, {
    message: '생성 완료. 산출물 검토 후 [🔍 QA 검토 시작] 진행 가능.',
    result: mergeResult,
  });

  return {
    generator: mergeResult,
    passed: true,
    generation_id: generationId,
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

// api/generate-batch.js — Function Chunking Endpoint #4 (옵션 G 코어)
//
// 역할:
//   POST /api/generate-batch
//   - 입력: { generation_id, batch_idx, sheets: [{ sheet_index, sheet_name, group_name, rows }] }
//   - 동작:
//     1. master row 존재 + cancel 여부 확인
//     2. 배치 내 시트들을 Claude 에 병렬 호출 (Phase 2-2e 의 makeCallTask 패턴 재사용)
//     3. SSE keep-alive (Phase 2-2f 패턴)
//     4. 시트마다 cancel flag 체크 → 발견 시 즉시 종료
//     5. child row INSERT (시트당 1개) + master.job_state 진행률 누적
//     6. circuit breaker: 같은 batch 안 모든 시트 실패 시 master 'paused'
//   - 출력: SSE stream
//     - progress (sheet_start / sheet_done / sheet_failed / ping)
//     - batch_complete (최종 결과)
//
// 설계 결정 반영:
//   - A1: frontend 가 시트 데이터 전송 (sheets[]).
//   - B:  배치 내부 병렬 (Promise.all), 배치 간 직렬은 frontend 가 제어.
//   - C:  cancel 체크 + AbortController. 시트 시작 전 + 시트 종료 후 = 매 시트 2회.
//   - D1: child row 는 이 endpoint 가 INSERT (init 은 master 만).
//
// 흐름:
//   [init] → [batch 1] (← 이 endpoint) → [batch 2] (← 이 endpoint 재호출) → ... → [merge]
//
// Phase 2-2g (Function Chunking) - 옵션 G 세션 1

import {
  sb,
  callClaude,
  composeSystemPrompt,
  buildSheetUserPrompt,
  estimateCost,
  sseSend,
  initSSE,
  wantsStreaming,
  PER_SHEET_SCHEMA,
  MODEL,
  PROVIDER,
} from './generate.js';

// ──────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────
const KEEPALIVE_INTERVAL_MS = 25_000;
const SHEETS_PER_BATCH_MAX = 4;  // 안전장치 — Anthropic Tier 1 한도 보호

// 같은 batch 안 모든 시트 실패 → circuit breaker paused (consecutive_failures 임계)
const CIRCUIT_BREAKER_THRESHOLD = 2;  // 연속 2 batch 실패 시 paused

// ──────────────────────────────────────────────────
// Phase 2-5: 함수 시간 예산 (좀비 child 방지)
// ──────────────────────────────────────────────────
// 배경 (0611-1 batch 4 사건):
//   시트 1회 호출(최대 ~12분) + 0개 가드 재시도(또 ~12분) 가 겹치면
//   Vercel maxDuration(800초)을 초과 → 함수가 status 갱신 없이 강제 종료
//   → child row 가 'running' 좀비로 영구 잔류 → merge 가 7분 헛대기 후
//   해당 시트 누락(partial) 또는 frontend 오인.
// 해결:
//   함수 시작 시 마감시각(deadline)을 정하고,
//   (1) 마감 임박 시 새 Claude 호출(특히 재시도)을 시작하지 않고 명시적 실패
//   (2) 진행 중인 호출도 마감 40초 전에 중단(race) → catch 가 child 를
//       'failed' 로 기록할 시간을 확보한 뒤 정상 종료.
//   조용한 좀비보다 시끄러운 실패가 낫다 — 실패한 batch 는 단독 재실행 가능.
const BATCH_TIME_BUDGET_MS = 700_000;   // 11분 40초 (maxDuration 800초 대비 ~100초 여유)
const DEADLINE_SAFETY_MS = 40_000;      // 마감 40초 전 호출 중단 → DB 기록 시간 확보
const MIN_TIME_FOR_CALL_MS = 150_000;   // 새 Claude 호출 시작에 필요한 최소 잔여 시간 (2.5분)

// promise 를 deadline 까지로 제한. 초과 시 명시적 에러로 reject
// (기저 fetch 는 계속될 수 있으나 함수가 곧 종료되므로 무해 —
//  중요한 건 child status 를 'failed' 로 기록하고 끝낼 시간을 버는 것)
function raceWithDeadline(promise, deadlineAt, label) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    return Promise.reject(new Error(
      `${label}: 함수 시간 예산 소진 — 호출을 시작하지 않음. 이 batch 만 다시 실행하세요.`
    ));
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(
        `${label}: Vercel maxDuration 임박으로 중단 ` +
        `(예산 ${Math.round(BATCH_TIME_BUDGET_MS / 1000)}초 중 잔여 ${Math.round(remaining / 1000)}초 소진). ` +
        `이 batch 만 다시 실행하세요.`
      ));
    }, remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ──────────────────────────────────────────────────
// UUID 형식 검증
// ──────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// ──────────────────────────────────────────────────
// Cancel flag 확인 (DB hot path)
// 마이그레이션에서 만든 is_generation_cancelled() 함수 사용
// PostgREST RPC 호출 방식
// ──────────────────────────────────────────────────
async function isCancelled(generationId) {
  // PostgREST 의 rpc 엔드포인트
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/is_generation_cancelled`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ gen_id: generationId }),
  });
  if (!res.ok) {
    // 함수 호출 실패 시 — 안전한 default: false (작업 계속).
    // 함수가 없거나 권한 문제면 직접 master 조회 폴백
    try {
      const fallback = await sb(
        `/ai_generations?id=eq.${generationId}` +
        `&parent_generation_id=is.null` +
        `&select=job_state`
      );
      const js = fallback?.[0]?.job_state || {};
      return !!js.cancel_requested;
    } catch {
      return false;
    }
  }
  const result = await res.json();
  return result === true;
}

// ──────────────────────────────────────────────────
// master.job_state 부분 업데이트
// PATCH 가 통째로 덮어쓰므로 read-modify-write 패턴
// ──────────────────────────────────────────────────
async function updateJobState(generationId, patch) {
  const rows = await sb(
    `/ai_generations?id=eq.${generationId}&select=job_state`
  );
  const current = rows?.[0]?.job_state || {};
  const updated = {
    ...current,
    ...patch,
    last_heartbeat_at: new Date().toISOString(),
  };
  // circuit_breaker 는 중첩 객체라 별도 merge
  if (patch.circuit_breaker) {
    updated.circuit_breaker = {
      ...(current.circuit_breaker || {}),
      ...patch.circuit_breaker,
    };
  }
  await sb(`/ai_generations?id=eq.${generationId}`, 'PATCH', {
    job_state: updated,
  });
  return updated;
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Phase 2-5: 함수 시간 예산 시작 (좀비 child 방지 — 상단 상수 참조)
  const deadlineAt = Date.now() + BATCH_TIME_BUDGET_MS;

  // SSE 모드 시작 — frontend 가 Accept: text/event-stream 로 호출 권장
  const streaming = wantsStreaming(req);
  if (streaming) {
    initSSE(res);
    sseSend(res, 'started', { ts: Date.now(), message: 'Batch 처리 시작' });
  }

  const emit = (eventType, payload) => {
    if (streaming) sseSend(res, eventType, payload);
  };

  // Vercel 의 finalPayload 응답 — non-streaming 모드에서만 사용
  let finalPayload = null;
  let masterGenId = null;  // catch 블록에서 사용

  // ── Keep-alive interval (try/finally 로 cleanup 보장) ─
  let pingCount = 0;
  const keepAliveInterval = streaming
    ? setInterval(() => {
        pingCount += 1;
        try {
          sseSend(res, 'ping', { ts: Date.now(), seq: pingCount });
        } catch (e) {
          console.error('[batch:keepalive] ping write failed:', e.message);
        }
      }, KEEPALIVE_INTERVAL_MS)
    : null;

  try {
    // ── 1. 입력 검증 ────────────────────────────────────────
    const { generation_id, batch_idx, sheets } = req.body || {};

    if (!generation_id) {
      throw Object.assign(new Error('Missing required field: generation_id'), { _status: 400 });
    }
    if (!isValidUUID(generation_id)) {
      throw Object.assign(new Error('Invalid generation_id format (must be UUID)'), { _status: 400 });
    }
    if (!Number.isInteger(batch_idx) || batch_idx < 1) {
      throw Object.assign(new Error('Invalid batch_idx: must be integer >= 1'), { _status: 400 });
    }
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw Object.assign(new Error('Missing or empty sheets[] array'), { _status: 400 });
    }
    if (sheets.length > SHEETS_PER_BATCH_MAX) {
      throw Object.assign(
        new Error(`Too many sheets in one batch (max ${SHEETS_PER_BATCH_MAX})`),
        { _status: 400 }
      );
    }
    for (const s of sheets) {
      if (!Number.isInteger(s.sheet_index) || !s.sheet_name || !Array.isArray(s.rows)) {
        throw Object.assign(
          new Error('Each sheet needs: sheet_index (int), sheet_name (str), rows (array)'),
          { _status: 400 }
        );
      }
    }

    masterGenId = generation_id;

    // ── 2. master row 조회 + 상태 검증 ──────────────────────
    const masterRows = await sb(
      `/ai_generations?id=eq.${generation_id}` +
      `&parent_generation_id=is.null` +
      `&select=*`
    );
    const master = masterRows?.[0];

    if (!master) {
      throw Object.assign(new Error('Generation not found or not master row'), { _status: 404 });
    }

    // 활성 상태가 아니면 거부
    if (!['queued', 'running'].includes(master.status)) {
      throw Object.assign(
        new Error(`Cannot process batch — generation status is '${master.status}'`),
        { _status: 409 }
      );
    }

    // 첫 batch 면 master 를 'running' 으로 전환
    if (master.status === 'queued') {
      await sb(`/ai_generations?id=eq.${generation_id}`, 'PATCH', { status: 'running' });
    }

    // 사전 cancel 체크 — 시작 전에 이미 cancel 요청됐다면
    if (await isCancelled(generation_id)) {
      emit('batch_cancelled', {
        batch_idx,
        reason: 'cancel_requested_before_start',
      });
      finalPayload = {
        success: false,
        cancelled: true,
        batch_idx,
        sheets_processed: 0,
        sheets_succeeded: 0,
        sheets_failed: 0,
        message: 'Batch aborted before start (cancel requested)',
      };
      throw Object.assign(new Error('_BATCH_CANCELLED'), { _isCancel: true });
    }

    // ── 3. circuit breaker 체크 ─────────────────────────────
    const cb = master.job_state?.circuit_breaker || {};
    if (cb.paused) {
      throw Object.assign(
        new Error(`Circuit breaker is paused: ${cb.paused_reason || 'unknown'}`),
        { _status: 409 }
      );
    }

    // ── 4. system prompt 생성 (skills 로드) ────────────────
    const systemPrompt = composeSystemPrompt(master.process_id);

    // ── 5. project, work_product 조회 (prompt 빌드용) ─────
    const [project] = await sb(`/projects?id=eq.${master.project_id}&select=*`) || [];
    const [wp] = await sb(`/work_products?id=eq.${master.work_product_id}&select=*`) || [];
    if (!project || !wp) {
      throw Object.assign(new Error('Project or work_product missing'), { _status: 404 });
    }

    // ── 6. otherInputsSummary 빌드 (옵션 G 의 batch 분리 본질) ─
    // batches_plan 의 모든 시트 메타를 Claude 에 컨텍스트로 제공 (사실 정보, 시트 데이터는 X)
    // 이렇게 해야 Claude 가 "전체 N 시트 중 일부만 보고 있다" 는 사실을 알고 추상화/중복판단을 안 함
    const batchesPlan = master.job_state?.batches_plan || [];
    const allSheetSummaries = batchesPlan
      .flatMap(b =>
        (b.sheet_indices || []).map((sIdx, i) => ({
          sheet_index: sIdx,
          sheet_name: (b.sheet_names || [])[i] || `Sheet ${sIdx}`,
          batch_idx: b.batch_idx,
        }))
      )
      .sort((a, b) => a.sheet_index - b.sheet_index);

    // 현재 batch 가 처리하는 시트는 'THIS BATCH', 나머지는 다른 batch 라고 표시
    const currentSheetIndices = new Set(sheets.map(s => s.sheet_index));
    const otherInputsSummary = allSheetSummaries
      .map(s =>
        `Sheet ${s.sheet_index}: "${s.sheet_name}" ` +
        (currentSheetIndices.has(s.sheet_index)
          ? '(processed in THIS BATCH)'
          : `(handled by batch ${s.batch_idx}, do NOT derive STK_REQs here)`)
      )
      .join('\n');

    // ── 7. 시트별 작업 정의 ─────────────────────────────────
    // 각 시트마다: child row INSERT → callClaude → child row UPDATE
    // makeCallTask 패턴 (Phase 2-2e) 을 답습하되 cancel 체크 + AbortController 추가
    const totalSheetsInProject = master.job_state?.total_sheets || sheets.length;

    const makeSheetTask = (sheet, taskIdx) => async () => {
      const sheetIdx = sheet.sheet_index;
      const sheetName = sheet.sheet_name;
      const sheetGroup = sheet.group_name || null;

      // 시트 시작 전 cancel 체크
      if (await isCancelled(generation_id)) {
        emit('sheet_cancelled', {
          batch_idx, sheet_index: sheetIdx, sheet_name: sheetName,
          message: `시트 ${sheetIdx} (${sheetName}) — cancel 감지, 시작 skip`,
        });
        return { success: false, cancelled: true, sheet, error: 'cancelled_before_start' };
      }

      emit('progress', {
        step: 'sheet_start',
        message: `시트 ${sheetIdx} (${sheetName}) 시작 — batch ${batch_idx}`,
        batch_idx,
        sheet_index: sheetIdx,
        sheet_name: sheetName,
        sheet_group: sheetGroup,
      });

      // child row INSERT (pending → 작업 후 success/failed 로 update)
      // Phase 2-5: 시작 전 잔여 시간 검사 — 부족하면 child 를 만들지 않고 명시적 실패
      if (deadlineAt - Date.now() < MIN_TIME_FOR_CALL_MS) {
        const errMsg =
          `시트 ${sheetIdx} (${sheetName}): 함수 잔여 시간 부족 ` +
          `(${Math.round((deadlineAt - Date.now()) / 1000)}초 < 최소 ${MIN_TIME_FOR_CALL_MS / 1000}초) — ` +
          `호출을 시작하지 않습니다. 이 batch 만 다시 실행하세요.`;
        console.warn(`[generate-batch] ${errMsg}`);
        emit('progress', {
          step: 'sheet_failed',
          message: errMsg,
          batch_idx, sheet_index: sheetIdx, sheet_name: sheetName,
          error: errMsg,
        });
        return { success: false, sheet, error: errMsg, childId: null };
      }
      let childId = null;
      try {
        const sheetUserPrompt = buildSheetUserPrompt({
          processId: master.process_id,
          sheetData: {
            sheet_name: sheetName,
            group_name: sheetGroup,
            rows: sheet.rows,
          },
          projectMeta: project,
          sheetIndex: sheetIdx,
          totalSheets: totalSheetsInProject,
          customerSourceFileName: sheet.source_file_name || null,
          otherInputsSummary,
        });

        const [createdChild] = await sb('/ai_generations', 'POST', {
          project_id: master.project_id,
          process_id: master.process_id,
          work_product_id: master.work_product_id,
          agent_role: 'generator',
          agent_step: batch_idx,  // batch_idx 를 agent_step 에 저장 (기존 schema 활용)
          model: master.model || MODEL,
          provider: PROVIDER,
          system_prompt: systemPrompt.slice(0, 50000),
          user_prompt: sheetUserPrompt.slice(0, 50000),
          skills_used: master.skills_used || [],
          parent_generation_id: generation_id,
          sheet_indices: [sheetIdx],
          status: 'running',
        }, 'return=representation') || [];
        childId = createdChild?.id || null;

        // 시트 callClaude (이미 검증된 generate.js 의 함수, retry 내장)
        // Phase 2-5: deadline race — maxDuration 전에 중단하고 failed 기록
        let sheetResult = await raceWithDeadline(
          callClaude({
            systemPrompt,
            userPrompt: sheetUserPrompt,
            schema: PER_SHEET_SCHEMA,
          }),
          deadlineAt - DEADLINE_SAFETY_MS,
          `시트 ${sheetIdx} (${sheetName}) Claude 호출`
        );

        // ── Phase 2-4: 0개 가드 (Interface 그룹 조용한 소실 차단) ──
        // 배경: "NAD System Interface" 같은 핀 정의표를 Claude 가 간헐적으로
        //   "요구사항 아님"으로 판단해 STK_REQ 0개를 반환 (0605-7, 0610 재발).
        //   PER_SHEET_SCHEMA 가 minItems:0 이라 0개도 유효 응답 → 그룹이 조용히 소실.
        // 처리: 행이 1개 이상인 시트가 0개를 반환하면 → 1회 재시도.
        //   재시도도 0개면 → 명시적 실패 (catch 로 흘러가 sheet_failed 이벤트 +
        //   child row 'failed' 기록). 조용한 성공보다 시끄러운 실패가 낫다.
        let stkCount = sheetResult.parsedOutput.stakeholder_requirements?.length || 0;
        if (stkCount === 0 && sheet.rows.length > 0) {
          console.warn(
            `[generate-batch] 시트 ${sheetIdx} (${sheetName}): ` +
            `행 ${sheet.rows.length}개인데 STK_REQ 0개 반환 — 재시도 1회`
          );
          emit('progress', {
            step: 'sheet_zero_retry',
            message: `시트 ${sheetIdx} (${sheetName}) — 행 ${sheet.rows.length}개에 STK_REQ 0개, 재시도 중`,
            batch_idx,
            sheet_index: sheetIdx,
            sheet_name: sheetName,
            input_rows: sheet.rows.length,
          });
          // Phase 2-5: 재시도가 이번 좀비 사건의 직접 원인 (1차 호출 + 재시도 > 800초)
          // 잔여 시간이 부족하면 재시도하지 않고 명시적 실패 → batch 단독 재실행 유도
          if (deadlineAt - Date.now() < MIN_TIME_FOR_CALL_MS) {
            throw new Error(
              `시트 "${sheetName}": 행 ${sheet.rows.length}개에 STK_REQ 0개 반환. ` +
              `재시도가 필요하나 함수 잔여 시간 부족 ` +
              `(${Math.round((deadlineAt - Date.now()) / 1000)}초) — Vercel maxDuration 초과(좀비) 방지를 위해 ` +
              `실패로 처리합니다. 이 batch 만 다시 실행하세요 (재실행 시 캐시 HIT 로 빨라짐).`
            );
          }
          const retryResult = await raceWithDeadline(
            callClaude({
              systemPrompt,
              userPrompt: sheetUserPrompt,
              schema: PER_SHEET_SCHEMA,
            }),
            deadlineAt - DEADLINE_SAFETY_MS,
            `시트 ${sheetIdx} (${sheetName}) 0개 가드 재시도`
          );
          const retryCount = retryResult.parsedOutput.stakeholder_requirements?.length || 0;
          if (retryCount > 0) {
            // 재시도 성공 — 토큰/비용/지연은 두 호출 합산해 child row 에 정확히 기록
            sheetResult = {
              ...retryResult,
              inputTokens: (sheetResult.inputTokens || 0) + (retryResult.inputTokens || 0),
              outputTokens: (sheetResult.outputTokens || 0) + (retryResult.outputTokens || 0),
              cacheCreationTokens:
                (sheetResult.cacheCreationTokens || 0) + (retryResult.cacheCreationTokens || 0),
              cacheReadTokens:
                (sheetResult.cacheReadTokens || 0) + (retryResult.cacheReadTokens || 0),
              latencyMs: (sheetResult.latencyMs || 0) + (retryResult.latencyMs || 0),
            };
            stkCount = retryCount;
            console.log(
              `[generate-batch] 시트 ${sheetIdx} 재시도 성공: ${retryCount}개 STK_REQ`
            );
          } else {
            throw new Error(
              `시트 "${sheetName}"에 입력 행 ${sheet.rows.length}개가 있으나 ` +
              `STK_REQ 0개 반환 (재시도 포함 2회). 테이블형 시트 변환 실패 — ` +
              `그룹 소실(spec_loss) 방지를 위해 실패로 처리합니다. ` +
              `해당 batch 만 다시 실행하거나 시트 데이터를 점검하세요.`
            );
          }
        }

        // 호출 직후 다시 한 번 cancel 체크 (callClaude 가 5분 걸리는 동안 cancel 됐을 수 있음)
        const cancelledNow = await isCancelled(generation_id);

        const sheetCost = estimateCost(
          sheetResult.inputTokens,
          sheetResult.outputTokens,
          sheetResult.cacheCreationTokens,
          sheetResult.cacheReadTokens,
        );

        // child row UPDATE
        if (childId) {
          await sb(`/ai_generations?id=eq.${childId}`, 'PATCH', {
            raw_output: sheetResult.rawOutput,
            parsed_output: sheetResult.parsedOutput,
            finish_reason: sheetResult.finishReason,
            input_tokens: sheetResult.inputTokens,
            output_tokens: sheetResult.outputTokens,
            cost_usd: sheetCost,
            latency_ms: sheetResult.latencyMs,
            status: cancelledNow ? 'cancelled' : 'success',
            error_message: cancelledNow ? 'completed but cancelled before save' : null,
          });
        }

        if (cancelledNow) {
          emit('sheet_cancelled', {
            batch_idx, sheet_index: sheetIdx, sheet_name: sheetName,
            message: `시트 ${sheetIdx} 완료됐으나 cancel 요청 후 처리 — 결과는 저장됨`,
          });
          return { success: false, cancelled: true, sheet, result: sheetResult, childId };
        }

        emit('progress', {
          step: 'sheet_done',
          message: `시트 ${sheetIdx} (${sheetName}) 완료: ${stkCount}개 STK_REQ${sheetResult.cacheHit ? ' ✓캐시HIT' : ''}`,
          batch_idx,
          sheet_index: sheetIdx,
          sheet_name: sheetName,
          sheet_group: sheetGroup,
          stk_count: stkCount,
          cache_hit: sheetResult.cacheHit,
          input_tokens: sheetResult.inputTokens,
          output_tokens: sheetResult.outputTokens,
          latency_ms: sheetResult.latencyMs,
          cost_usd: sheetCost,
        });

        return { success: true, sheet, result: sheetResult, childId, stkCount, sheetCost };
      } catch (e) {
        const errMsg = e.message?.slice(0, 1000) || String(e);
        if (childId) {
          await sb(`/ai_generations?id=eq.${childId}`, 'PATCH', {
            status: 'failed',
            error_message: errMsg,
          }).catch(() => {});
        }
        console.error(`[generate-batch] Sheet ${sheetIdx} failed:`, errMsg);
        emit('progress', {
          step: 'sheet_failed',
          message: `시트 ${sheetIdx} (${sheetName}) 실패: ${errMsg.slice(0, 200)}`,
          batch_idx,
          sheet_index: sheetIdx,
          sheet_name: sheetName,
          error: errMsg.slice(0, 500),
        });
        return { success: false, sheet, error: errMsg, childId };
      }
    };

    // ── 8. batch 내부 병렬 실행 ─────────────────────────────
    emit('progress', {
      step: 'batch_start',
      message: `Batch ${batch_idx} 시작 — 시트 ${sheets.length}개 병렬 처리`,
      batch_idx,
      sheets_count: sheets.length,
      sheet_indices: sheets.map(s => s.sheet_index),
    });

    const batchStartTime = Date.now();
    const sheetResults = await Promise.all(
      sheets.map((s, i) => makeSheetTask(s, i)())
    );
    const batchDurationMs = Date.now() - batchStartTime;

    const succeeded = sheetResults.filter(r => r.success).length;
    const failed = sheetResults.filter(r => !r.success && !r.cancelled).length;
    const cancelled = sheetResults.filter(r => r.cancelled).length;

    // ── 9. master.job_state 진행률 누적 ────────────────────
    // 모든 시트가 cancelled 면 batch 자체는 cancelled, 일부라도 success 면 completed
    const batchOutcome =
      cancelled === sheets.length ? 'cancelled' :
      succeeded > 0 ? 'completed' : 'failed';

    // 현재 job_state 의 카운터들 누적
    const cbCurrent = master.job_state?.circuit_breaker || {};
    const consecutiveFailures =
      batchOutcome === 'failed'
        ? (cbCurrent.consecutive_failures || 0) + 1
        : 0;
    const shouldPause = consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD;

    // job_state read-modify-write
    const updatedJobState = await updateJobState(generation_id, {
      completed_batches: (master.job_state?.completed_batches || 0) + (batchOutcome === 'completed' ? 1 : 0),
      failed_batches: (master.job_state?.failed_batches || 0) + (batchOutcome === 'failed' ? 1 : 0),
      queued_batches: Math.max(0, (master.job_state?.queued_batches || 0) - 1),
      circuit_breaker: {
        consecutive_failures: consecutiveFailures,
        paused: shouldPause,
        paused_reason: shouldPause
          ? `${consecutiveFailures} consecutive batch failures (threshold=${CIRCUIT_BREAKER_THRESHOLD})`
          : null,
      },
    });

    // ── 10. circuit breaker 발동 시 master status 변경 ───
    if (shouldPause) {
      console.warn(
        `[generate-batch] Circuit breaker tripped for ${generation_id} ` +
        `(${consecutiveFailures} consecutive failures)`
      );
      emit('circuit_breaker_paused', {
        consecutive_failures: consecutiveFailures,
        threshold: CIRCUIT_BREAKER_THRESHOLD,
        message: `연속 ${consecutiveFailures}개 batch 실패로 자동 일시정지. 재시도 또는 부분 결과 저장을 결정하세요.`,
      });
      // 별도 status 가 아니라 circuit_breaker 플래그로만 표시 (status='running' 유지)
      // — 사용자가 cancel/retry/merge 중 선택할 때까지 대기
    }

    // ── 11. 응답 (success/cancelled/failed 종합) ───────────
    finalPayload = {
      success: batchOutcome === 'completed',
      cancelled: batchOutcome === 'cancelled',
      circuit_breaker_paused: shouldPause,
      batch_idx,
      sheets_processed: sheets.length,
      sheets_succeeded: succeeded,
      sheets_failed: failed,
      sheets_cancelled: cancelled,
      batch_duration_ms: batchDurationMs,
      // child rows 의 id 목록 — frontend 가 필요 시 status endpoint 로 다시 조회 가능
      child_ids: sheetResults.map(r => r.childId).filter(Boolean),
      job_state: updatedJobState,
    };

    emit('batch_complete', finalPayload);

    if (streaming) {
      return res.end();
    }
    return res.status(200).json(finalPayload);
  } catch (error) {
    // _isCancel 마커가 있으면 정상 종료 흐름 (finalPayload 이미 set)
    if (error._isCancel && finalPayload) {
      if (streaming) {
        emit('batch_complete', finalPayload);
        return res.end();
      }
      return res.status(200).json(finalPayload);
    }

    console.error('[generate-batch]', error);

    // batch 전체 실패 — master 의 failed_batches 카운트 + circuit breaker
    if (masterGenId) {
      try {
        const masterRows = await sb(
          `/ai_generations?id=eq.${masterGenId}&select=job_state`
        );
        const current = masterRows?.[0]?.job_state || {};
        const cbCurrent = current.circuit_breaker || {};
        const consecutiveFailures = (cbCurrent.consecutive_failures || 0) + 1;
        const shouldPause = consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD;
        await updateJobState(masterGenId, {
          failed_batches: (current.failed_batches || 0) + 1,
          queued_batches: Math.max(0, (current.queued_batches || 0) - 1),
          circuit_breaker: {
            consecutive_failures: consecutiveFailures,
            paused: shouldPause,
            paused_reason: shouldPause
              ? `${consecutiveFailures} consecutive batch failures (threshold=${CIRCUIT_BREAKER_THRESHOLD})`
              : null,
          },
        });
      } catch (e) {
        console.warn('[generate-batch] failed to update circuit breaker on error:', e.message);
      }
    }

    const status = error._status || 500;
    const errorPayload = {
      success: false,
      error: error.message,
      batch_idx: req.body?.batch_idx ?? null,
    };

    if (streaming) {
      sseSend(res, 'error', errorPayload);
      return res.end();
    }
    return res.status(status).json(errorPayload);
  } finally {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      console.log(
        `[generate-batch] Keep-alive stopped: ${pingCount} pings sent ` +
        `(~${Math.round(pingCount * KEEPALIVE_INTERVAL_MS / 1000)}s)`
      );
    }
  }
}

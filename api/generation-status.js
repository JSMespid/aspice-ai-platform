// api/generation-status.js — Function Chunking Endpoint #3 (옵션 G)
//
// 역할:
//   GET /api/generation-status?generation_id=<uuid>
//   GET /api/generation-status?project_id=<uuid>&work_product_id=<uuid>
//   - 동작: master + child rows 조회 → 진행률 / ETA / 비용 / batch별 상태 종합
//   - 출력: 풍부한 status 객체 (UI dashboard 직접 활용 가능)
//
// 사용 시나리오:
//   1. Resume: 페이지 mount 시 work_product 의 활성 generation 조회
//      → GET ?project_id=X&work_product_id=Y
//   2. Polling: SSE 연결이 끊긴 경우 폴링으로 진행률 추적
//      → GET ?generation_id=Z
//   3. 종료 후 요약: 작업 완료 후 final summary 조회
//      → GET ?generation_id=Z
//
// 설계 결정 반영:
//   - 결정 1 (Backend 권위): 모든 state 가 DB 에서 재구성됨 → frontend 끊겨도 정확
//   - 결정 7 (Browser-independent resume): 이 endpoint 만으로 mount 시 상태 복원 가능
//   - 결정 4 (Job dashboard UI): ETA, batches[] 배열 등 dashboard 필수 필드 모두 포함
//
// Phase 2-2g (Function Chunking) - 옵션 G 세션 1

// ──────────────────────────────────────────────────
// Supabase REST 헬퍼
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
// UUID 형식 검증
// ──────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// ──────────────────────────────────────────────────
// child rows 를 batch_idx (agent_step) 기준으로 그룹화
// ──────────────────────────────────────────────────
// generate-batch 가 시트당 child row 를 INSERT 하므로
// 한 batch_idx 에 여러 child rows 가 존재할 수 있다.
// status / progress / batches[] 모두 batch 단위 집계가 정확하다.
function groupChildrenByBatch(children) {
  const groups = new Map();  // batch_idx → child[]
  for (const c of children) {
    if (!Number.isInteger(c.agent_step) || c.agent_step < 1) continue;
    if (!groups.has(c.agent_step)) groups.set(c.agent_step, []);
    groups.get(c.agent_step).push(c);
  }
  return groups;
}

// ──────────────────────────────────────────────────
// 한 batch 안 child 들의 status 로부터 batch 의 status 결정
// 결정 트리 (priority 순):
//   1. child 가 하나도 없음 → 'queued' (아직 시작 안 됨)
//   2. 한 child 라도 'running' → 'running'
//   3. 모두 'success' → 'success' (= completed)
//   4. 모두 'cancelled' → 'cancelled'
//   5. 모두 'failed' → 'failed'
//   6. mixed terminal (success + failed/cancelled 혼합) → 'partial'
// ──────────────────────────────────────────────────
function deriveBatchStatus(childrenInBatch) {
  if (!childrenInBatch || childrenInBatch.length === 0) return 'queued';
  if (childrenInBatch.some(c => c.status === 'running')) return 'running';

  if (childrenInBatch.every(c => c.status === 'success')) return 'success';
  if (childrenInBatch.every(c => c.status === 'cancelled')) return 'cancelled';
  if (childrenInBatch.every(c => c.status === 'failed')) return 'failed';

  // 혼합 종료 상태 (일부 success + 일부 failed/cancelled)
  return 'partial';
}

// ──────────────────────────────────────────────────
// 진행률 / ETA 계산 헬퍼
// ──────────────────────────────────────────────────
function computeProgress(master, children) {
  const totalBatches = master.job_state?.total_batches || 0;
  const groups = groupChildrenByBatch(children);

  // batch 단위 카운트 (child 직접 카운트 X — 시트당 child 라 중복 집계됨)
  let completed = 0;
  let failed = 0;
  let running = 0;
  let cancelled = 0;
  let partial = 0;

  for (const childrenInBatch of groups.values()) {
    const s = deriveBatchStatus(childrenInBatch);
    if (s === 'success') completed++;
    else if (s === 'failed') failed++;
    else if (s === 'running') running++;
    else if (s === 'cancelled') cancelled++;
    else if (s === 'partial') partial++;
  }

  const accounted = completed + failed + running + cancelled + partial;
  const queued = Math.max(0, totalBatches - accounted);

  // 종료(terminal) batch = completed + failed + cancelled + partial
  const terminalCount = completed + failed + cancelled + partial;
  const percent = totalBatches > 0
    ? Math.round((terminalCount / totalBatches) * 1000) / 10
    : 0;

  return {
    total_batches: totalBatches,
    completed_batches: completed,
    failed_batches: failed,
    running_batches: running,
    cancelled_batches: cancelled,
    partial_batches: partial,
    queued_batches: queued,
    percent,
  };
}

function computeETA(master, children, progress) {
  // 완료된 batch 들의 평균 duration 으로 ETA 추정
  const completedChildren = children.filter(
    c => c.status === 'success' && c.latency_ms != null
  );

  if (completedChildren.length === 0) {
    return {
      avg_batch_duration_ms: null,
      estimated_remaining_ms: null,
      estimated_completion_at: null,
      confidence: 'unknown',  // 데이터 부족
    };
  }

  const avgDurationMs = Math.round(
    completedChildren.reduce((sum, c) => sum + c.latency_ms, 0) / completedChildren.length
  );

  // 남은 batch / concurrency 만큼의 wave 가 필요
  const concurrency = master.job_state?.concurrency || 1;
  const remainingBatches = progress.queued_batches + progress.running_batches;
  // running 은 이미 진행 중이므로 절반만 추가로 걸린다고 보수적 추정
  const remainingWaves = Math.ceil(
    (progress.queued_batches + progress.running_batches * 0.5) / concurrency
  );
  const estimatedRemainingMs = remainingWaves * avgDurationMs;
  const estimatedCompletionAt = new Date(Date.now() + estimatedRemainingMs).toISOString();

  // 신뢰도: 완료된 batch 가 많을수록 평균이 정확
  let confidence;
  if (completedChildren.length >= 3) confidence = 'high';
  else if (completedChildren.length >= 1) confidence = 'low';
  else confidence = 'unknown';

  return {
    avg_batch_duration_ms: avgDurationMs,
    estimated_remaining_ms: estimatedRemainingMs,
    estimated_completion_at: estimatedCompletionAt,
    confidence,
  };
}

function computeCost(master, children) {
  const costSoFar = children.reduce((sum, c) => sum + (parseFloat(c.cost_usd) || 0), 0);
  return {
    cost_so_far_usd: Math.round(costSoFar * 10000) / 10000,  // 4자리
    estimated_total_usd: master.job_state?.estimated_cost_usd || null,
  };
}

// ──────────────────────────────────────────────────
// batch 별 상세 정보 추출 (UI dashboard 용)
// ──────────────────────────────────────────────────
// 시트당 child row 패턴이므로 batch 단위로 그룹화 후 합산해야 정확.
function buildBatchDetails(master, children) {
  const totalBatches = master.job_state?.total_batches || 0;
  const batchesPlan = master.job_state?.batches_plan || [];
  const groups = groupChildrenByBatch(children);

  const batches = [];
  for (let i = 1; i <= totalBatches; i++) {
    const childrenInBatch = groups.get(i) || [];
    const plan = batchesPlan.find(p => p.batch_idx === i) || null;
    const batchStatus = deriveBatchStatus(childrenInBatch);

    // batch 단위 합산
    let stkCount = 0;
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let maxLatencyMs = null;  // batch 내부 시트 병렬이므로 wall time = max
    const collectedSheetIndices = [];
    const childIds = [];
    let firstError = null;
    let sheetsSuccess = 0, sheetsFailed = 0, sheetsRunning = 0, sheetsCancelled = 0;

    for (const c of childrenInBatch) {
      stkCount += c.parsed_output?.stakeholder_requirements?.length || 0;
      costUsd += parseFloat(c.cost_usd) || 0;
      inputTokens += c.input_tokens || 0;
      outputTokens += c.output_tokens || 0;
      if (c.latency_ms != null && (maxLatencyMs == null || c.latency_ms > maxLatencyMs)) {
        maxLatencyMs = c.latency_ms;
      }
      if (Array.isArray(c.sheet_indices)) collectedSheetIndices.push(...c.sheet_indices);
      if (c.id) childIds.push(c.id);
      if (!firstError && c.error_message) firstError = c.error_message;
      if (c.status === 'success') sheetsSuccess++;
      else if (c.status === 'failed') sheetsFailed++;
      else if (c.status === 'running') sheetsRunning++;
      else if (c.status === 'cancelled') sheetsCancelled++;
    }

    // sheet_indices: child 들의 합집합 > plan 의 예정값
    const sheetIndices = collectedSheetIndices.length > 0
      ? collectedSheetIndices
      : (plan?.sheet_indices || []);

    batches.push({
      batch_idx: i,
      sheet_indices: sheetIndices,
      sheet_names: plan?.sheet_names || [],
      status: batchStatus,
      stk_count: stkCount,
      cost_usd: Math.round(costUsd * 10000) / 10000,
      latency_ms: maxLatencyMs,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      error_message: firstError,
      // 시트 단위 상세 (UI 가 batch 안 진행률 표시 가능)
      sheets_total: childrenInBatch.length || (plan?.sheet_indices?.length || 0),
      sheets_success: sheetsSuccess,
      sheets_failed: sheetsFailed,
      sheets_running: sheetsRunning,
      sheets_cancelled: sheetsCancelled,
      child_ids: childIds,
    });
  }

  return batches;
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. 입력 파싱 (query string) ─────────────────────────
    // req.query 는 Vercel 이 자동 파싱. 직접 URL 파싱도 fallback.
    let { generation_id, project_id, work_product_id } = req.query || {};
    if (!generation_id && !project_id && !work_product_id) {
      try {
        const url = new URL(req.url, 'http://localhost');
        generation_id = generation_id || url.searchParams.get('generation_id');
        project_id = project_id || url.searchParams.get('project_id');
        work_product_id = work_product_id || url.searchParams.get('work_product_id');
      } catch (_) { /* noop */ }
    }

    // UUID 형식 검증 — 빈 문자열이나 'undefined' 같은 잘못된 입력 방어
    // (값이 truthy 인 경우만 검증; 빈 string/null/undefined 는 "param 안 줌" 으로 취급)
    if (generation_id && !isValidUUID(generation_id)) {
      return res.status(400).json({ error: 'Invalid generation_id format (must be UUID)' });
    }
    if (project_id && !isValidUUID(project_id)) {
      return res.status(400).json({ error: 'Invalid project_id format (must be UUID)' });
    }
    if (work_product_id && !isValidUUID(work_product_id)) {
      return res.status(400).json({ error: 'Invalid work_product_id format (must be UUID)' });
    }

    // ── 2. master row 조회 ──────────────────────────────────
    let master;

    if (generation_id) {
      // 패턴 A: generation_id 직접 조회
      const rows = await sb(
        `/ai_generations?id=eq.${generation_id}` +
        `&parent_generation_id=is.null` +
        `&select=*`
      );
      master = rows?.[0];
    } else if (project_id && work_product_id) {
      // 패턴 B: project + work_product 의 최신 master 조회
      // 우선순위: 활성 작업 (queued/running/cancelling) > 가장 최근 종료 작업
      const activeRows = await sb(
        `/ai_generations?project_id=eq.${project_id}` +
        `&work_product_id=eq.${work_product_id}` +
        `&parent_generation_id=is.null` +
        `&status=in.(queued,running,cancelling)` +
        `&order=created_at.desc&limit=1` +
        `&select=*`
      );
      if (activeRows && activeRows.length > 0) {
        master = activeRows[0];
      } else {
        // 활성 없으면 가장 최근 종료된 작업
        const recentRows = await sb(
          `/ai_generations?project_id=eq.${project_id}` +
          `&work_product_id=eq.${work_product_id}` +
          `&parent_generation_id=is.null` +
          `&order=created_at.desc&limit=1` +
          `&select=*`
        );
        master = recentRows?.[0];
      }
    } else {
      return res.status(400).json({
        error: 'Missing query params: provide generation_id OR (project_id AND work_product_id)',
      });
    }

    if (!master) {
      // 패턴 B 에서 master 가 아예 없으면 200 with null (UI 가 처리)
      // 패턴 A 에서 master 가 없으면 404
      if (generation_id) {
        return res.status(404).json({
          error: 'Generation not found',
          generation_id,
        });
      }
      return res.status(200).json({
        generation: null,
        message: 'No generation found for this work_product',
      });
    }

    // ── 3. child rows (batches) 조회 ────────────────────────
    const children = await sb(
      `/ai_generations?parent_generation_id=eq.${master.id}` +
      `&order=agent_step.asc` +
      `&select=id,agent_step,sheet_indices,status,cost_usd,latency_ms,` +
        `input_tokens,output_tokens,error_message,parsed_output,created_at`
    ) || [];

    // ── 4. 진행률 / ETA / 비용 계산 ────────────────────────
    const progress = computeProgress(master, children);
    const eta = computeETA(master, children, progress);
    const cost = computeCost(master, children);
    const batches = buildBatchDetails(master, children);

    // ── 5. 응답 구조화 ──────────────────────────────────────
    const response = {
      generation_id: master.id,
      project_id: master.project_id,
      process_id: master.process_id,
      work_product_id: master.work_product_id,
      model: master.model,
      status: master.status,
      // job_state 그대로 노출 (cancel_requested, circuit_breaker 등 frontend 가 활용)
      job_state: master.job_state || {},
      // 계산된 진행률 (job_state 의 counter 보다 실제 child rows 기준이 정확)
      progress,
      eta,
      cost,
      // 배치별 상세 (UI dashboard 직접 표시)
      batches,
      // 메타
      created_at: master.created_at,
      started_at: master.job_state?.started_at || master.created_at,
      // terminal state 인 경우 최종 출력 포함 (옵션, UI 가 쓸 수 있음)
      is_terminal: ['success', 'partial', 'failed', 'cancelled', 'blocked_by_guardrail'].includes(master.status),
    };

    // master 가 terminal 이면 final output 도 함께 (UI 가 결과 표시용)
    if (response.is_terminal) {
      response.final_output = master.parsed_output || null;
      response.guardrail_result = master.guardrail_result || null;
      response.guardrail_passed = master.guardrail_passed;
      response.error_message = master.error_message || null;
      // 종료 시점의 누적 토큰/비용 (master row 의 합산 값)
      response.total_input_tokens = master.input_tokens || null;
      response.total_output_tokens = master.output_tokens || null;
      response.total_cost_usd = parseFloat(master.cost_usd) || null;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[generation-status]', error);
    return res.status(500).json({ error: error.message });
  }
}

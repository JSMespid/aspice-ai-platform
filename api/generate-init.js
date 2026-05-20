// api/generate-init.js — Function Chunking Endpoint #1 (옵션 G)
//
// 역할:
//   POST /api/generate-init
//   - 입력: project_id, process_id, work_product_id, plan { batch_size, concurrency, batches[] }
//   - 동작: ai_generations master row 생성 + work_product 상태 GENERATING 전환 + audit log
//   - 출력: { generation_id, status, total_batches, total_sheets }
//
// 위치한 위치 (옵션 G 흐름):
//   [init]  ← 이 endpoint
//   ↓
//   [batch] (반복, batches.length 번)
//   ↓
//   [merge]
//
// 설계 결정 반영:
//   - 결정 1 (Backend 권위 state): master row 의 job_state JSONB 가 진실의 원천
//   - 결정 6 (Cooperative cancellation): job_state.cancel_requested 필드 초기화
//   - 결정 7 (Browser-independent resume): master row 만으로 frontend 가 재구성 가능
//   - 결정 8 (비용 보호): 예상 비용을 job_state.estimated_cost_usd 에 기록 (사전 확인용)
//
// Phase 2-2g (Function Chunking) - 옵션 G 세션 1

// ──────────────────────────────────────────────────
// Supabase REST 헬퍼 (generate.js 와 동일 패턴)
// 새 endpoint 들은 standalone 으로 만들기 위해 inline
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
// 상태값 영문 ↔ 한글 매핑 (generate.js 와 동일)
// ──────────────────────────────────────────────────
function stateToStatus(state) {
  const map = {
    'INITIAL':    '초안',
    'GENERATING': '진행중',
    'GENERATED':  '검토중',
    'MODIFIED':   '검토중',
    'REJECTED':   '반려됨',
    'APPROVED':   '승인됨',
  };
  return map[state] || '초안';
}

function syncStateAndStatus(state) {
  return { state, status: stateToStatus(state) };
}

// ──────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────
const DEFAULT_MODEL = 'claude-opus-4-7';
const PROVIDER = 'anthropic';

// 평균 시트당 비용 추정 (sheet-by-sheet 모드 기준, Phase 2-2f 데이터)
// Phase 2-2f 검증: NAD0520 4시트 시도 비용 ~$5 (3시트 성공)
// → 시트당 약 $1.0~$1.7 사이, 보수적으로 $1.5 사용
// 이 값은 estimate 용도일 뿐 — 실제 비용은 child rows 의 cost_usd 합산
const AVG_COST_PER_SHEET_USD = 1.5;

// Hard cap: 한 generation 의 예상 비용 (사용자 안전장치)
// 초과 시 init 거부 (frontend 가 사용자에게 사전 확인)
const HARD_CAP_PER_GENERATION_USD = 20.0;

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. 입력 검증 ────────────────────────────────────────
    const {
      project_id,
      process_id,
      work_product_id,
      model = DEFAULT_MODEL,
      plan,  // { batch_size, concurrency, batches: [{ batch_idx, sheet_indices, sheet_names }] }
    } = req.body || {};

    if (!project_id || !process_id || !work_product_id) {
      return res.status(400).json({
        error: 'Missing required fields: project_id, process_id, work_product_id',
      });
    }
    if (!plan || !Array.isArray(plan.batches) || plan.batches.length === 0) {
      return res.status(400).json({
        error: 'Invalid plan: must include batches array (non-empty)',
      });
    }
    if (!plan.batch_size || plan.batch_size < 1 || plan.batch_size > 8) {
      return res.status(400).json({
        error: 'Invalid batch_size: must be 1~8',
      });
    }
    if (!plan.concurrency || plan.concurrency < 1 || plan.concurrency > 4) {
      return res.status(400).json({
        error: 'Invalid concurrency: must be 1~4',
      });
    }

    // batch 구조 검증
    for (const b of plan.batches) {
      if (!Number.isInteger(b.batch_idx) || b.batch_idx < 1) {
        return res.status(400).json({ error: `Invalid batch_idx: ${b.batch_idx}` });
      }
      if (!Array.isArray(b.sheet_indices) || b.sheet_indices.length === 0) {
        return res.status(400).json({ error: `Invalid sheet_indices for batch ${b.batch_idx}` });
      }
    }

    // ── 2. work_product 존재 확인 + project 조회 ────────────
    const [wp] = await sb(`/work_products?id=eq.${work_product_id}&select=*`) || [];
    if (!wp) {
      return res.status(404).json({ error: 'work_product not found' });
    }
    if (wp.project_id !== project_id) {
      return res.status(400).json({ error: 'work_product does not belong to project' });
    }

    // ── 3. 활성 generation 중복 방지 ────────────────────────
    // 같은 work_product 에 이미 queued/running/cancelling 인 master 가 있으면 거부
    // (사용자가 실수로 두 번 트리거하는 케이스 방지)
    const activeRows = await sb(
      `/ai_generations?work_product_id=eq.${work_product_id}` +
      `&parent_generation_id=is.null` +
      `&status=in.(queued,running,cancelling)` +
      `&select=id,status`
    );
    if (activeRows && activeRows.length > 0) {
      return res.status(409).json({
        error: 'Active generation already exists for this work_product',
        active_generation_id: activeRows[0].id,
        active_status: activeRows[0].status,
        hint: 'Cancel the active generation first or wait for it to complete.',
      });
    }

    // ── 4. 총 시트 수 + 예상 비용 계산 ──────────────────────
    const totalSheets = plan.batches.reduce(
      (sum, b) => sum + b.sheet_indices.length, 0
    );
    const totalBatches = plan.batches.length;
    const estimatedCostUsd = totalSheets * AVG_COST_PER_SHEET_USD;

    // 결정 8: 비용 보호 — 예상 비용이 hard cap 초과면 거부
    if (estimatedCostUsd > HARD_CAP_PER_GENERATION_USD) {
      return res.status(400).json({
        error: 'Estimated cost exceeds hard cap',
        estimated_cost_usd: estimatedCostUsd,
        hard_cap_usd: HARD_CAP_PER_GENERATION_USD,
        total_sheets: totalSheets,
        hint: `시트 수가 너무 많습니다. ${Math.floor(HARD_CAP_PER_GENERATION_USD / AVG_COST_PER_SHEET_USD)}개 이하로 나누어 진행하세요.`,
      });
    }

    // ── 5. master row 생성 (status='queued', agent_step=0) ──
    const startedAt = new Date().toISOString();
    const jobState = {
      total_batches: totalBatches,
      completed_batches: 0,
      failed_batches: 0,
      running_batches: 0,
      queued_batches: totalBatches,
      cancel_requested: false,
      cancel_requested_at: null,
      started_at: startedAt,
      last_heartbeat_at: startedAt,
      estimated_cost_usd: estimatedCostUsd,
      concurrency: plan.concurrency,
      batch_size: plan.batch_size,
      total_sheets: totalSheets,
      // 배치별 메타데이터 (sheet_names 등) — UI 표시용
      batches_plan: plan.batches.map(b => ({
        batch_idx: b.batch_idx,
        sheet_indices: b.sheet_indices,
        sheet_names: b.sheet_names || [],
      })),
      // Circuit breaker (결정 2: 연속 batch 실패 시 자동 일시정지)
      circuit_breaker: {
        consecutive_failures: 0,
        paused: false,
        paused_reason: null,
      },
    };

    const [created] = await sb('/ai_generations', 'POST', {
      project_id,
      process_id,
      work_product_id,
      agent_role: 'generator',
      agent_step: 0,  // 0 = master row
      model,
      provider: PROVIDER,
      // system_prompt / user_prompt 는 batch 별로 별도 기록 — master 는 메타만
      system_prompt: '[Chunked Generation Mode] — system prompt recorded per-batch child row',
      user_prompt: `[Chunked Generation Mode] ${totalBatches} batches, ${totalSheets} sheets, batch_size=${plan.batch_size}, concurrency=${plan.concurrency}`,
      skills_used: [],  // batch 별 child row 에 기록됨
      status: 'queued',
      job_state: jobState,
    }, 'return=representation') || [];

    if (!created || !created.id) {
      throw new Error('Failed to create master generation row');
    }
    const generationId = created.id;

    // ── 6. work_product 상태 전환 (INITIAL → GENERATING) ────
    // 기존 generate.js 와 같은 패턴
    await sb(`/work_products?id=eq.${work_product_id}`, 'PATCH', {
      ...syncStateAndStatus('GENERATING'),
    });

    // ── 7. state_transitions 기록 ───────────────────────────
    // wp.state 가 무엇이든 GENERATING 으로 전환된 기록
    await sb('/state_transitions', 'POST', {
      work_product_id,
      from_state: wp.state || 'INITIAL',
      to_state: 'GENERATING',
      trigger: 'ai_generation',
      reason: `Chunked generation initiated (${totalBatches} batches)`,
      ai_generation_id: generationId,
    }, 'return=minimal').catch(e => {
      // state_transitions 실패는 치명적이지 않음 — 로그만 남기고 진행
      console.warn('[generate-init] state_transitions insert failed:', e.message);
    });

    // ── 8. audit log ────────────────────────────────────────
    await sb('/audit_logs', 'POST', {
      action: 'ai_generate_init',
      resource_type: 'work_product',
      resource_id: work_product_id,
      project_id,
      details: {
        process_id,
        ai_generation_id: generationId,
        total_batches: totalBatches,
        total_sheets: totalSheets,
        batch_size: plan.batch_size,
        concurrency: plan.concurrency,
        estimated_cost_usd: estimatedCostUsd,
        model,
      },
    }, 'return=minimal').catch(e => {
      console.warn('[generate-init] audit_logs insert failed:', e.message);
    });

    // ── 9. 응답 ─────────────────────────────────────────────
    console.log(
      `[generate-init] Created generation ${generationId}: ` +
      `${totalBatches} batches, ${totalSheets} sheets, ` +
      `~$${estimatedCostUsd.toFixed(2)} estimated`
    );

    return res.status(200).json({
      success: true,
      generation_id: generationId,
      status: 'queued',
      total_batches: totalBatches,
      total_sheets: totalSheets,
      estimated_cost_usd: estimatedCostUsd,
      batch_size: plan.batch_size,
      concurrency: plan.concurrency,
      created_at: created.created_at,
      started_at: startedAt,
    });
  } catch (error) {
    console.error('[generate-init]', error);
    return res.status(500).json({ error: error.message });
  }
}

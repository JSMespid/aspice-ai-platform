// api/generate-cancel.js — Function Chunking Endpoint #2 (옵션 G)
//
// 역할:
//   POST /api/generate-cancel
//   - 입력: generation_id
//   - 동작: master row 의 job_state.cancel_requested=true 설정, status='cancelling' 전환
//   - 출력: { success, status, message }
//
// 설계 결정 반영:
//   - 결정 6 (Cooperative Cancellation):
//     이 endpoint 는 "취소 요청" 만 기록. 실제 batch 중단은 generate-batch 가
//     is_generation_cancelled() 함수로 확인하면서 협조적으로 종료.
//     → 사용자 UI: 즉시 응답 (~200ms), batch 는 다음 체크포인트에서 자체 종료
//
// 흐름:
//   사용자 [Cancel 버튼] → POST /api/generate-cancel
//                       → master.job_state.cancel_requested = true
//                       → master.status = 'cancelling'
//                       → 응답 (즉시)
//   진행 중 batch 들 → is_generation_cancelled() 체크 → 자체 종료 (status='cancelled')
//   마지막 batch 종료 → 별도 메커니즘 (status endpoint 또는 merge) 에서 master
//                     status='cancelled' 로 최종 전환
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
    const { generation_id } = req.body || {};
    if (!generation_id) {
      return res.status(400).json({ error: 'Missing required field: generation_id' });
    }
    if (!isValidUUID(generation_id)) {
      return res.status(400).json({ error: 'Invalid generation_id format (must be UUID)' });
    }

    // ── 2. master row 조회 ──────────────────────────────────
    const rows = await sb(
      `/ai_generations?id=eq.${generation_id}` +
      `&parent_generation_id=is.null` +  // master row 만
      `&select=id,status,job_state,work_product_id,project_id`
    );
    const master = rows?.[0];

    if (!master) {
      return res.status(404).json({
        error: 'Generation not found or not a master row',
        generation_id,
      });
    }

    // ── 3. 상태별 분기 처리 ────────────────────────────────
    const currentStatus = master.status;

    // 3a. 이미 종료된 상태 → idempotent (이미 끝났으니 OK 응답)
    if (['success', 'failed', 'cancelled', 'partial', 'blocked_by_guardrail'].includes(currentStatus)) {
      return res.status(200).json({
        success: true,
        status: currentStatus,
        message: `Generation already in terminal state: ${currentStatus}. No action taken.`,
        idempotent: true,
      });
    }

    // 3b. 이미 cancelling → idempotent (재요청도 OK)
    if (currentStatus === 'cancelling') {
      return res.status(200).json({
        success: true,
        status: 'cancelling',
        message: 'Cancel already requested. Batches are stopping cooperatively.',
        idempotent: true,
      });
    }

    // 3c. queued/running 만 실제 취소 처리
    if (!['queued', 'running'].includes(currentStatus)) {
      return res.status(400).json({
        error: `Unexpected status: ${currentStatus}. Cannot cancel.`,
        generation_id,
        current_status: currentStatus,
      });
    }

    // ── 4. cancel flag 설정 + status='cancelling' ───────────
    const cancelRequestedAt = new Date().toISOString();
    const updatedJobState = {
      ...(master.job_state || {}),
      cancel_requested: true,
      cancel_requested_at: cancelRequestedAt,
      last_heartbeat_at: cancelRequestedAt,
    };

    await sb(`/ai_generations?id=eq.${generation_id}`, 'PATCH', {
      status: 'cancelling',
      job_state: updatedJobState,
    });

    // ── 5. queued 상태의 child rows 도 cancelled 로 표시 ───
    // running 인 child 는 batch endpoint 가 협조적으로 종료
    // queued 인 child (있다면) 는 시작하지 않을 것이므로 즉시 cancelled 처리
    // 현재 설계에서는 child 가 batch endpoint 안에서만 생성되므로 보통 없지만,
    // 향후 확장 (pre-allocated child rows) 대비 안전장치
    await sb(
      `/ai_generations?parent_generation_id=eq.${generation_id}` +
      `&status=eq.queued`,
      'PATCH',
      { status: 'cancelled', error_message: 'Cancelled by user before start' }
    ).catch(e => {
      // child 가 없으면 빈 update 라 무해
      console.warn('[generate-cancel] child cancel update note:', e.message);
    });

    // ── 6. audit log ────────────────────────────────────────
    await sb('/audit_logs', 'POST', {
      action: 'ai_generate_cancel',
      resource_type: 'work_product',
      resource_id: master.work_product_id,
      project_id: master.project_id,
      details: {
        ai_generation_id: generation_id,
        previous_status: currentStatus,
        new_status: 'cancelling',
        cancelled_at: cancelRequestedAt,
      },
    }, 'return=minimal').catch(e => {
      console.warn('[generate-cancel] audit_logs insert failed:', e.message);
    });

    console.log(
      `[generate-cancel] Generation ${generation_id} cancel requested ` +
      `(was ${currentStatus} → cancelling). Batches will stop cooperatively.`
    );

    // ── 7. 응답 ─────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      generation_id,
      status: 'cancelling',
      previous_status: currentStatus,
      cancel_requested_at: cancelRequestedAt,
      message:
        '취소 요청이 접수되었습니다. 진행 중인 batch 가 다음 체크포인트에서 종료됩니다. ' +
        '상태는 /api/generation-status 로 확인하세요.',
    });
  } catch (error) {
    console.error('[generate-cancel]', error);
    return res.status(500).json({ error: error.message });
  }
}

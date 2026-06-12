// api/approve.js — 검토자 의사결정 (HITL ⑤축, 3단계 '승인')
//
// 흐름: 생성 → QA → [시정조치] → 재QA → **승인 (본 엔드포인트)**
//
// POST /api/approve
//   - 입력: {
//       work_product_id,                       (필수)
//       decision: 'approve' | 'reject' | 'request_changes' | 'revoke',  (필수)
//       reason,                                (반려/수정요청 시 권장, revoke 는 필수)
//       decided_by,                            (선택 — 검토자 표기, 예: 'reviewer@aspice.com')
//     }
//   - 동작:
//       1. work_products 상태 전이 (state + 한글 status 동기화)
//          approve         → APPROVED  (승인됨)
//          reject          → REJECTED  (반려됨)
//          request_changes → CHANGES_REQUESTED (수정요청)
//          revoke          → PENDING_APPROVAL (승인대기) — APPROVED 에서만 허용
//       2. state_transitions 기록 (trigger='reviewer_decision') — 심사 증빙
//       3. audit_logs 기록
//   - 출력: { success, work_product_id, from_state, to_state, decision }
//
// Phase 3-2 (SCR-12 후속) — 검토자 의사결정 버튼용
// 2026-06-12 (v2 — 승인 베이스라인 잠금):
//   - 'revoke' (승인 철회) 결정 추가. SUP.8 형상관리 원칙:
//     승인 = 베이스라인 확정·잠금이며, 개정(재검토/시정조치)은 명시적 철회로
//     잠금을 풀고 새 검증 사이클을 시작해야 한다. 철회는 APPROVED 상태에서만
//     허용되고 사유가 필수이며, 모든 전이가 state_transitions 에 증빙으로 남는다.
//     (프론트는 APPROVED 상태에서 [품질 다시 검토]/[AI 시정조치] 를 잠근다)

import { sb, syncStateAndStatus } from './generate.js';

const DECISION_TO_STATE = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  request_changes: 'CHANGES_REQUESTED',
  // v2: 승인 철회 — 베이스라인 잠금 해제, '승인대기' 로 복귀
  //     (QA 결과는 보존되며 재검토/시정조치/재승인이 다시 가능해짐)
  revoke: 'PENDING_APPROVAL',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { work_product_id, decision, reason, decided_by } = req.body || {};

    if (!work_product_id || !UUID_RE.test(work_product_id)) {
      return res.status(400).json({ error: 'work_product_id (UUID) 가 필요합니다' });
    }
    const toState = DECISION_TO_STATE[decision];
    if (!toState) {
      return res.status(400).json({
        error: `decision 은 'approve' | 'reject' | 'request_changes' | 'revoke' 중 하나여야 합니다 (받음: '${decision}')`,
      });
    }
    // v2: revoke 는 사유 필수 — "왜 베이스라인을 풀었는가" 가 심사 증빙의 핵심
    if (decision === 'revoke' && !(reason && String(reason).trim())) {
      return res.status(400).json({
        error: '승인 철회(revoke)에는 사유(reason)가 필수입니다',
      });
    }

    // 1. 현재 work_product 조회
    const [wp] = await sb(
      `/work_products?id=eq.${work_product_id}&select=id,project_id,process_id,state,status`
    ) || [];
    if (!wp) {
      return res.status(404).json({ error: `work_product ${work_product_id} 을 찾을 수 없습니다` });
    }
    const fromState = wp.state || 'INITIAL';

    // 진행 중(GENERATING)에는 의사결정 불가
    if (fromState === 'GENERATING') {
      return res.status(409).json({
        error: 'AI 생성이 진행 중입니다 — 완료 후 의사결정하세요',
        current_state: fromState,
      });
    }
    // v2: revoke 는 APPROVED 베이스라인에서만 허용
    if (decision === 'revoke' && fromState !== 'APPROVED') {
      return res.status(409).json({
        error: `승인 철회는 APPROVED 상태에서만 가능합니다 (현재: ${fromState})`,
        current_state: fromState,
      });
    }

    // 멱등: 이미 같은 상태면 그대로 성공 응답
    if (fromState === toState) {
      return res.status(200).json({
        success: true, idempotent: true,
        work_product_id, from_state: fromState, to_state: toState, decision,
      });
    }

    // 2. 의사결정의 근거가 되는 최신 evaluator (있으면 전이 기록에 연결)
    let latestEvalId = null;
    try {
      const [ev] = await sb(
        `/ai_generations?work_product_id=eq.${work_product_id}` +
        `&agent_role=eq.evaluator&status=eq.success` +
        `&select=id&order=created_at.desc&limit=1`
      ) || [];
      latestEvalId = ev?.id || null;
    } catch { /* 비차단 */ }

    // 3. 상태 전이
    await sb(`/work_products?id=eq.${work_product_id}`, 'PATCH', {
      ...syncStateAndStatus(toState),
    });

    // 4. state_transitions (심사 증빙)
    await sb('/state_transitions', 'POST', {
      work_product_id,
      from_state: fromState,
      to_state: toState,
      trigger: 'reviewer_decision',
      reason: [
        `검토자 의사결정: ${decision}`,
        decided_by ? `(by ${decided_by})` : null,
        reason ? `— ${reason}` : null,
      ].filter(Boolean).join(' '),
      ai_generation_id: latestEvalId,
      performed_by: null,
    }, 'return=minimal').catch(e => {
      console.warn('[approve] state_transitions insert failed:', e.message);
    });

    // 5. audit log
    await sb('/audit_logs', 'POST', {
      action: 'reviewer_decision',
      resource_type: 'work_product',
      resource_id: work_product_id,
      project_id: wp.project_id,
      details: {
        process_id: wp.process_id,
        decision,
        from_state: fromState,
        to_state: toState,
        reason: reason || null,
        decided_by: decided_by || null,
        latest_evaluator_id: latestEvalId,
      },
    }, 'return=minimal').catch(e => {
      console.warn('[approve] audit_logs insert failed:', e.message);
    });

    console.log(
      `[approve] work_product ${work_product_id}: ${fromState} → ${toState} (${decision})`
    );

    return res.status(200).json({
      success: true,
      work_product_id,
      from_state: fromState,
      to_state: toState,
      decision,
    });
  } catch (error) {
    console.error('[approve]', error);
    return res.status(500).json({ error: error.message });
  }
}

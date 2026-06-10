// api/generate-merge.js — Function Chunking Endpoint #5 (옵션 G 마지막 코어)
//
// 역할:
//   POST /api/generate-merge
//   - 입력: { generation_id, force_partial?: boolean }
//   - 동작:
//     1. master + 모든 child rows 조회
//     2. success child 들의 parsed_output 을 mergePerSheetOutputs() 로 합산
//     3. runGuardrails() 로 5축 검증
//     4. work_products.content.ai_generated 에 저장 + 상태 전환
//     5. master row 최종 status 결정 (success/partial/cancelled/blocked_by_guardrail)
//     6. state_transitions, audit_logs 기록
//   - 출력: JSON { success, status, parsed_output, guardrail_result, ... }
//
// 호출 시점:
//   - 정상: 모든 batch 완료 후
//   - cancel 직후: 부분 결과 저장하려는 경우 (force_partial=true)
//   - circuit breaker 발동 후: 사용자가 "지금까지 결과로 진행" 선택 시
//
// 설계 결정 반영:
//   - E: 부분 실패 처리 — 일부 batch 만 success 여도 merge 가능
//        → master.status='partial', warnings 에 누락 batch 정보 기록
//   - 가드레일 결과는 work_product state 에 반영:
//        - guardrail PASS → state='GENERATED' (status='검토중')
//        - guardrail FAIL → state='REJECTED' (status='반려됨')
//   - cancelled batch 가 있어도 success batch 가 1개라도 있으면 merge 진행 가능
//
// Phase 2-2g (Function Chunking) - 옵션 G 세션 1

import {
  sb,
  mergePerSheetOutputs,
  estimateCost,
  syncStateAndStatus,
} from './generate.js';

// 가드레일은 동일 모듈에서 직접 import (generate.js 가 import 하는 것과 같은 경로)
import { runGuardrails } from '../src/lib/guardrails-server.js';
// Phase 2-3 RAG: 표준 인용 검증 (warning-only, VOYAGE_API_KEY 없으면 내부에서 skip)
import { verifyCitations, persistCitationLogs } from '../src/lib/citation-verifier.js';

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
    const { generation_id, force_partial = false } = req.body || {};
    if (!generation_id) {
      return res.status(400).json({ error: 'Missing required field: generation_id' });
    }
    if (!isValidUUID(generation_id)) {
      return res.status(400).json({ error: 'Invalid generation_id format (must be UUID)' });
    }

    // ── 2. master row 조회 ──────────────────────────────────
    const masterRows = await sb(
      `/ai_generations?id=eq.${generation_id}` +
      `&parent_generation_id=is.null` +
      `&select=*`
    );
    const master = masterRows?.[0];
    if (!master) {
      return res.status(404).json({ error: 'Generation not found', generation_id });
    }

    // 이미 종료된 상태면 idempotent 응답
    if (['success', 'partial', 'cancelled', 'failed', 'blocked_by_guardrail'].includes(master.status)) {
      return res.status(200).json({
        success: ['success', 'partial'].includes(master.status),
        status: master.status,
        message: `Generation already in terminal state: ${master.status}`,
        idempotent: true,
        parsed_output: master.parsed_output,
        guardrail_result: master.guardrail_result,
      });
    }

    // 활성 상태가 아니면 거부 (queued 상태에서는 merge 할 게 없음)
    if (!['running', 'cancelling'].includes(master.status)) {
      return res.status(409).json({
        error: `Cannot merge — generation status is '${master.status}'`,
        current_status: master.status,
      });
    }

    // ── 3. child rows 조회 ──────────────────────────────────
    // Phase 2-4: 진행 중(in-flight) child 대기 루프
    //
    // 배경 (0610-2 실행에서 발견된 경쟁조건):
    //   batch 의 SSE 스트림이 일찍 끊기면 frontend 는 "성공 0" 으로 보고
    //   다음 batch → merge 로 넘어가지만, 서버의 batch 함수는 계속 돌아서
    //   child row 를 나중에 success 로 저장함. merge 가 그 사이에 실행되면
    //   해당 batch 결과(예: Interface 116개)가 병합에서 조용히 누락됨.
    //
    // 해결: status 가 running/pending 인 child 가 있으면 최대 7분까지
    //   15초 간격으로 재조회하며 완료를 기다린 뒤 병합.
    //   (Claude 시트 호출 최대 ~6분 커버. cancelling 상태면 대기 없이 진행.)
    const fetchChildren = async () =>
      (await sb(
        `/ai_generations?parent_generation_id=eq.${generation_id}` +
        `&order=agent_step.asc` +
        `&select=*`
      )) || [];

    const MERGE_WAIT_FOR_CHILDREN_MS = 420_000;  // 최대 7분 대기
    const MERGE_WAIT_POLL_MS = 15_000;           // 15초 간격 재조회
    const countInFlight = (cs) =>
      cs.filter(c => ['running', 'pending'].includes(c.status)).length;

    let children = await fetchChildren();
    if (master.status !== 'cancelling') {
      let waitedMs = 0;
      while (countInFlight(children) > 0 && waitedMs < MERGE_WAIT_FOR_CHILDREN_MS) {
        console.log(
          `[generate-merge] 진행 중 child ${countInFlight(children)}개 감지 — ` +
          `${MERGE_WAIT_POLL_MS / 1000}s 후 재확인 (누적 대기 ${waitedMs / 1000}s)`
        );
        await new Promise(r => setTimeout(r, MERGE_WAIT_POLL_MS));
        waitedMs += MERGE_WAIT_POLL_MS;
        children = await fetchChildren();
      }
      if (waitedMs > 0) {
        console.log(
          `[generate-merge] child 대기 종료: ${waitedMs / 1000}s 대기, ` +
          `잔여 in-flight ${countInFlight(children)}개`
        );
      }
    }

    const successChildren = children.filter(c => c.status === 'success');
    const failedChildren = children.filter(c => c.status === 'failed');
    const cancelledChildren = children.filter(c => c.status === 'cancelled');

    // ── 4. merge 가능 여부 판단 ─────────────────────────────
    const totalBatches = master.job_state?.total_batches || 0;
    const isCancelling = master.status === 'cancelling';

    if (successChildren.length === 0) {
      // success 가 0개면 merge 할 게 없음 → master 를 failed 또는 cancelled 로 종료
      const finalStatus = isCancelling || cancelledChildren.length > 0 ? 'cancelled' : 'failed';
      const errorMsg = isCancelling
        ? '취소되었으며 성공한 batch 가 없습니다'
        : '모든 batch 가 실패하여 merge 할 결과가 없습니다';

      await sb(`/ai_generations?id=eq.${generation_id}`, 'PATCH', {
        status: finalStatus,
        error_message: errorMsg,
      });

      // work_product 도 원래 상태로 (INITIAL 로 되돌림 — 사용자가 다시 시도 가능)
      await sb(`/work_products?id=eq.${master.work_product_id}`, 'PATCH', {
        ...syncStateAndStatus('INITIAL'),
      });

      await sb('/state_transitions', 'POST', {
        work_product_id: master.work_product_id,
        from_state: 'GENERATING',
        to_state: 'INITIAL',
        trigger: isCancelling ? 'user_cancel' : 'all_batches_failed',
        reason: errorMsg,
        ai_generation_id: generation_id,
      }, 'return=minimal').catch(() => {});

      return res.status(200).json({
        success: false,
        status: finalStatus,
        message: errorMsg,
        successful_batches: 0,
        failed_batches: failedChildren.length,
        cancelled_batches: cancelledChildren.length,
      });
    }

    // 부분 실패 — force_partial=true 가 아니면 모든 batch 완료 대기
    const incompleteBatches = totalBatches - successChildren.length - failedChildren.length - cancelledChildren.length;
    if (incompleteBatches > 0 && !force_partial) {
      return res.status(409).json({
        error: 'Some batches are still in progress',
        total_batches: totalBatches,
        completed_batches: successChildren.length,
        failed_batches: failedChildren.length,
        cancelled_batches: cancelledChildren.length,
        incomplete_batches: incompleteBatches,
        hint: 'Wait for all batches to complete, or pass force_partial=true to merge with partial results.',
      });
    }

    // ── 5. per-sheet outputs 수집 + merge ──────────────────
    const perSheetOutputs = successChildren
      .map(c => c.parsed_output)
      .filter(Boolean);

    if (perSheetOutputs.length === 0) {
      return res.status(500).json({
        error: 'Successful children have no parsed_output (data inconsistency)',
        success_children_count: successChildren.length,
      });
    }

    // 프로젝트 정보 (title 생성용)
    const [project] = await sb(`/projects?id=eq.${master.project_id}&select=*`) || [];
    const title = `Stakeholder Requirements for ${project?.product_name || project?.name || 'System'}`;

    let parsedOutput;
    try {
      parsedOutput = mergePerSheetOutputs(perSheetOutputs, master.process_id, title);
    } catch (mergeError) {
      console.error('[generate-merge] merge failed:', mergeError);
      return res.status(500).json({
        error: `Failed to merge sheet outputs: ${mergeError.message}`,
        success_children_count: successChildren.length,
      });
    }

    // ── 6. partial 표시 + warnings 추가 ─────────────────────
    const isPartialResult = failedChildren.length > 0 || cancelledChildren.length > 0;
    if (isPartialResult) {
      const partialWarnings = [];

      // 실패한 batch 들의 batch_idx (agent_step) 와 이유
      for (const c of failedChildren) {
        partialWarnings.push(
          `Batch ${c.agent_step} 실패 (시트 ${(c.sheet_indices || []).join(', ')}): ${(c.error_message || 'unknown').slice(0, 200)}`
        );
      }
      for (const c of cancelledChildren) {
        partialWarnings.push(
          `Batch ${c.agent_step} 취소됨 (시트 ${(c.sheet_indices || []).join(', ')})`
        );
      }

      parsedOutput.warnings = [
        ...(parsedOutput.warnings || []),
        '⚠️ 부분 결과로 진행 — 일부 batch 가 누락됨:',
        ...partialWarnings,
      ];
    }

    // ── 7. 가드레일 검증 ────────────────────────────────────
    const [wp] = await sb(`/work_products?id=eq.${master.work_product_id}&select=*`) || [];
    if (!wp) {
      return res.status(404).json({ error: 'work_product not found' });
    }

    let guardrailResult;
    try {
      guardrailResult = await runGuardrails({
        processId: master.process_id,
        output: parsedOutput,
        input: wp.content,
      });
    } catch (gErr) {
      console.error('[generate-merge] guardrail error:', gErr);
      // 가드레일 자체가 throw 하면 결과 없이 진행 불가 — master 를 failed 로
      await sb(`/ai_generations?id=eq.${generation_id}`, 'PATCH', {
        status: 'failed',
        error_message: `Guardrail execution failed: ${gErr.message}`.slice(0, 1000),
      });
      return res.status(500).json({ error: `Guardrail error: ${gErr.message}` });
    }

    const guardrailPassed = guardrailResult.overall_passed;

    // ── 7b. Phase 2-3 RAG: 표준 인용 검증 (WARNING only) ──
    // 환각성 인용(코퍼스에 없는 표준 조항)을 parsedOutput.warnings 로 표면화. 차단하지 않음.
    // VOYAGE_API_KEY 미설정 시 내부에서 skip. 검증 오류는 병합 자체를 실패시키지 않음.
    // 이 블록은 master row 업데이트(아래)보다 앞 → warnings 가 parsed_output 에 실려 docx 까지 전달됨.
    try {
      const cv = await verifyCitations({
        sb,
        parsedOutput,
        aiGenerationId: generation_id,
      });
      if (!cv.skipped) {
        if (cv.warnings.length) {
          parsedOutput.warnings = [...(parsedOutput.warnings || []), ...cv.warnings];
        }
        await persistCitationLogs(sb, cv.logs);
        console.log(
          `[generate-merge] RAG 인용검증: ${cv.checked}건 검사 ` +
          `(미발견 ${cv.notFound}, 약한일치 ${cv.weak})`
        );
      } else {
        console.log(`[generate-merge] RAG 인용검증 skip: ${cv.reason}`);
      }
    } catch (cvErr) {
      console.error('[generate-merge] RAG 인용검증 오류(무시):', cvErr.message);
    }

    // ── 8. 누적 토큰 / 비용 계산 ────────────────────────────
    const totalInputTokens = successChildren.reduce((s, c) => s + (c.input_tokens || 0), 0);
    const totalOutputTokens = successChildren.reduce((s, c) => s + (c.output_tokens || 0), 0);
    const totalCostUsd = successChildren.reduce((s, c) => s + (parseFloat(c.cost_usd) || 0), 0);
    // latency 는 batch 별 wall-clock (실제 사용자 체감 시간은 frontend 가 측정)
    const maxChildLatencyMs = Math.max(0, ...successChildren.map(c => c.latency_ms || 0));

    // raw_output 누적 (감사용)
    const rawOutputLog = successChildren
      .map(c => `=== Batch ${c.agent_step} (sheets: ${(c.sheet_indices || []).join(',')}) ===\n${c.raw_output || ''}`)
      .join('\n\n');

    // ── 9. 최종 status 결정 ─────────────────────────────────
    let finalStatus;
    if (!guardrailPassed) {
      finalStatus = 'blocked_by_guardrail';
    } else if (isPartialResult) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'success';
    }

    // ── 10. master row 업데이트 ─────────────────────────────
    await sb(`/ai_generations?id=eq.${generation_id}`, 'PATCH', {
      raw_output: rawOutputLog.slice(0, 100000),
      parsed_output: parsedOutput,
      finish_reason: isPartialResult
        ? `merged_partial_${successChildren.length}/${totalBatches}`
        : 'merged_from_sheets',
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: totalCostUsd,
      latency_ms: maxChildLatencyMs,
      guardrail_result: guardrailResult,
      guardrail_passed: guardrailPassed,
      status: finalStatus,
    });

    // ── 11. work_products 업데이트 ─────────────────────────
    // 가드레일 통과 → GENERATED (검토중)
    // 가드레일 실패 → REJECTED (반려됨)
    // partial 도 가드레일이 통과했으면 GENERATED 로 (사용자가 검토 후 결정)
    const wpNewState = guardrailPassed ? 'GENERATED' : 'REJECTED';
    const newContent = guardrailPassed
      ? { ...wp.content, ai_generated: parsedOutput }
      : wp.content;

    await sb(`/work_products?id=eq.${master.work_product_id}`, 'PATCH', {
      ...syncStateAndStatus(wpNewState),
      content: newContent,
    });

    // ── 12. state_transitions ──────────────────────────────
    await sb('/state_transitions', 'POST', {
      work_product_id: master.work_product_id,
      from_state: 'GENERATING',
      to_state: wpNewState,
      trigger: guardrailPassed ? 'ai_generation' : 'guardrail',
      reason: guardrailPassed
        ? (isPartialResult
            ? `Partial merge (${successChildren.length}/${totalBatches} batches), guardrail passed`
            : 'All batches merged, guardrail passed')
        : `Guardrail failed: ${(guardrailResult.failed_axes || []).join(', ')}`,
      ai_generation_id: generation_id,
    }, 'return=minimal').catch(e => {
      console.warn('[generate-merge] state_transitions insert failed:', e.message);
    });

    // ── 13. audit log ──────────────────────────────────────
    await sb('/audit_logs', 'POST', {
      action: 'ai_generate_merge',
      resource_type: 'work_product',
      resource_id: master.work_product_id,
      project_id: master.project_id,
      details: {
        process_id: master.process_id,
        ai_generation_id: generation_id,
        final_status: finalStatus,
        guardrail_passed: guardrailPassed,
        total_batches: totalBatches,
        successful_batches: successChildren.length,
        failed_batches: failedChildren.length,
        cancelled_batches: cancelledChildren.length,
        is_partial: isPartialResult,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost_usd: totalCostUsd,
        stk_req_count: parsedOutput.stakeholder_requirements?.length || 0,
      },
    }, 'return=minimal').catch(e => {
      console.warn('[generate-merge] audit_logs insert failed:', e.message);
    });

    console.log(
      `[generate-merge] Generation ${generation_id} completed: ` +
      `status=${finalStatus}, batches=${successChildren.length}/${totalBatches}, ` +
      `STK_REQs=${parsedOutput.stakeholder_requirements?.length || 0}, ` +
      `cost=$${totalCostUsd.toFixed(4)}, guardrail=${guardrailPassed ? 'PASS' : 'FAIL'}`
    );

    // ── 14. 응답 ─────────────────────────────────────────────
    return res.status(200).json({
      success: guardrailPassed,
      status: finalStatus,
      generation_id,
      work_product_state: wpNewState,
      is_partial: isPartialResult,
      successful_batches: successChildren.length,
      failed_batches: failedChildren.length,
      cancelled_batches: cancelledChildren.length,
      total_batches: totalBatches,
      stk_req_count: parsedOutput.stakeholder_requirements?.length || 0,
      total_cost_usd: totalCostUsd,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      parsed_output: parsedOutput,
      guardrail_result: guardrailResult,
    });
  } catch (error) {
    console.error('[generate-merge]', error);
    return res.status(500).json({ error: error.message });
  }
}

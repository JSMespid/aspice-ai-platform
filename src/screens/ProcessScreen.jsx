// SCR-05 — V-Model 프로세스 화면 (Data-Driven 동적 렌더링)
// 화면설계서 슬라이드 12, 15, 16
//
// Phase 2-1 완료:
//   - 산출물 등록 모달 + 직접 입력 모달 + Supabase Storage 업로드
// Phase 2-2a (현재):
//   - AI 생성 버튼 활성화 (필수 항목 충족 시)
//   - Claude Opus 4.7 (adaptive thinking) + Skills + 5축 가드레일 (1, 2, 3축 활성)
//   - 우측 슬라이드 패널 (RationalePanel) 에 진행/결과/가드레일 표시
// Phase 2-2b 예정:
//   - Gemini 교차검증 (4축 활성)
//   - critique-and-refine cycle

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PROCESSES, getPreviousProcessIds } from "../config/processes.js";
import WorkProductRegisterModal from "../components/WorkProductRegisterModal.jsx";
import WorkProductDirectInputModal from "../components/WorkProductDirectInputModal.jsx";
import RationalePanel from "../components/RationalePanel.jsx";
import RemediationPanel from "../components/RemediationPanel.jsx";
import GeneratedArtifactView from "../components/GeneratedArtifactView.jsx";
import StkReqEditModal from "../components/StkReqEditModal.jsx";
import {
  runGenerator,
  runGeneratorChunked,
  runEvaluator,
  cancelGeneration,
  fetchGenerationStatus,
  extractSheetsFromWorkProduct,
  AgentStep,
  isBusy,
} from "../lib/agent-harness.js";

// AI 생성 지원 프로세스 (Phase 2-2a 는 SYS.1만)
const AI_GENERATE_SUPPORTED = new Set(["SYS.1"]);

// Phase 2-2g (옵션 G): 시트 수에 따라 legacy / chunked 경로 분기
// 결정 #1 (인수인계 권장): 시트 ≥3 chunked, ≤2 legacy
//
// Tier 1 rate limit (40K input tokens/min) 회피를 위해 한 wave 에 시트 2개만 호출.
//   batch_size × concurrency = 동시 호출 시트 수 = 2 (안전)
//   batch 단위는 순차 (concurrency=1) — frontend orchestrator 가 직렬로 호출
//   4시트면 2 batch × ~5분 = ~10분 (정상 범위)
const CHUNKED_THRESHOLD = 3;
const CHUNKED_BATCH_SIZE = 1;
const CHUNKED_CONCURRENCY = 1;

async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export default function ProcessScreen({ project, workProducts, onWorkProductChange, onStateChange }) {
  const { processId } = useParams();
  const cfg = PROCESSES[processId];

  const wp = workProducts.find(w => w.process_id === processId);
  const [state, setState] = useState(wp?.state || "INITIAL");

  // 모달 상태
  const [registerModal, setRegisterModal] = useState({ open: false, item: null });
  const [directModal, setDirectModal] = useState({ open: false, item: null });
  const [stkReqEditModal, setStkReqEditModal] = useState({ open: false, req: null });

  // Rationale Panel 상태 (Phase 2-2a)
  const [panelOpen, setPanelOpen] = useState(false);
  // Phase 3-1: QA 시정조치 패널 (SCR-12)
  const [remediationOpen, setRemediationOpen] = useState(false);
  const [agentStep, setAgentStep] = useState(AgentStep.IDLE);
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentResult, setAgentResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  // Phase 2-2g (옵션 G): chunked generation state
  // - chunkedGenerationId: 진행 중 chunked 작업의 generation_id (cancel 버튼 활성화 + resume 표시용)
  // - cancelling: cancel 요청 진행 중 (중복 클릭 방지)
  // - resumeInfo: mount 시 활성 작업 감지하면 표시 (결정 #3 v1: 표시만)
  const [chunkedGenerationId, setChunkedGenerationId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [resumeInfo, setResumeInfo] = useState(null);

  useEffect(() => {
    setState(wp?.state || "INITIAL");
  }, [wp?.state]);

  useEffect(() => {
    if (onStateChange) onStateChange(state);
  }, [state, onStateChange]);

  // Phase 2-2g: mount 시 활성 chunked generation 감지 (Resume v1 — 표시만)
  // 페이지 reload / 다른 탭에서 시작한 작업이 진행 중일 때 사용자에게 알림.
  // v1 정책: 자동 재시도하지 않음. 사용자가 진행 보기 / 취소 결정.
  useEffect(() => {
    if (!project?.id || !wp?.id || !AI_GENERATE_SUPPORTED.has(processId)) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchGenerationStatus({
          projectId: project.id,
          workProductId: wp.id,
        });
        if (cancelled || !status) return;
        // 활성 상태만 (queued / running / cancelling) 표시
        if (['queued', 'running', 'cancelling'].includes(status.status)) {
          setResumeInfo({
            generationId: status.generation_id,
            status: status.status,
            progress: status.progress,
            cost: status.cost,
            startedAt: status.started_at,
          });
        }
      } catch (e) {
        // 조용한 실패 — Resume 은 보너스 기능이라 에러 시 무시
        console.warn('[ProcessScreen] resume detect failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id, wp?.id, processId]);

  const deps = getPreviousProcessIds(processId);
  const missingDeps = deps.filter(depId => {
    const depWp = workProducts.find(w => w.process_id === depId);
    return !depWp || depWp.state !== "APPROVED";
  });

  if (!cfg) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--c-text-muted)" }}>
        Unknown process: {processId}
      </div>
    );
  }

  // ── 산출물/직접입력 저장 ─────────────────────────
  async function handleItemSave(itemKey, newValue) {
    const existingContent = wp?.content || {};
    const updatedContent = {
      ...existingContent,
      [itemKey]: newValue,
    };

    if (wp) {
      await apiCall(
        `/api/projects?resource=work_products&id=${wp.id}`,
        "PATCH",
        { content: updatedContent }
      );
    } else {
      // 신규 work_product 생성
      // - title: "SYS.1 산출물" 식의 자동 생성 (Phase 2-2 AI 생성 시 의미있는 제목으로 갱신)
      // - state: 9-state 머신의 INITIAL
      // - status: v1 호환용 ("초안")
      await apiCall(
        `/api/projects?resource=work_products`,
        "POST",
        {
          project_id: project.id,
          process_id: processId,
          title: `${processId} 산출물`,
          content: updatedContent,
          state: "INITIAL",
          status: "초안",
        }
      );
    }
    if (onWorkProductChange) await onWorkProductChange();
  }

  // Phase 2-2d: 산출물 항목 삭제 핸들러
  // - content 객체에서 해당 itemKey 제거 (Supabase Storage 의 업로드 파일은 그대로 둠 — 복구 가능)
  // - work_product 자체는 삭제하지 않음 (다른 항목들은 유지)
  // - 사용 시나리오:
  //   1. 잘못된 시트로 등록했을 때 → 삭제 후 재등록
  //   2. 직접 입력 내용을 비우고 싶을 때
  //   3. AI 생성 후 입력을 교체하고 싶을 때
  async function handleItemDelete(itemKey) {
    if (!wp || !wp.content || !(itemKey in wp.content)) {
      // 등록된 게 없으면 아무 것도 안 함
      return;
    }
    // 객체에서 itemKey 만 제거 (다른 키는 유지)
    const updatedContent = { ...wp.content };
    delete updatedContent[itemKey];

    await apiCall(
      `/api/projects?resource=work_products&id=${wp.id}`,
      "PATCH",
      { content: updatedContent }
    );
    if (onWorkProductChange) await onWorkProductChange();
  }

  function getItemValue(itemKey) {
    return wp?.content?.[itemKey] || null;
  }

  // ── AI 생성 핸들러 (Phase 2-2b STEP C-2: Generator만) ──
  // Phase 2-2g 옵션 G: 시트 수 ≥3 → chunked, ≤2 → legacy
  async function handleAIGenerate() {
    if (!wp) {
      alert("입력값을 먼저 저장하세요.");
      return;
    }
    if (!AI_GENERATE_SUPPORTED.has(processId)) {
      alert(`현재 ${processId}는 AI 생성이 지원되지 않습니다. Phase 2-2a는 SYS.1만 지원합니다.`);
      return;
    }

    // 시트 추출 + 경로 분기
    const sheets = extractSheetsFromWorkProduct(wp.content);
    const useChunked = sheets.length >= CHUNKED_THRESHOLD;
    console.log(
      `[ProcessScreen] AI 생성 시작 — 시트 ${sheets.length}개, ` +
      `경로: ${useChunked ? 'chunked (옵션 G)' : 'legacy /api/generate'}`
    );

    // 패널 열고 진행 시작
    setPanelOpen(true);
    setAgentResult(null);
    setAgentStep(AgentStep.GEN_PREPARING);
    setAgentDetail({
      message: useChunked
        ? `Chunked 모드 — 시트 ${sheets.length}개 시작 중...`
        : '시작 중...',
    });
    setGenerating(true);
    setChunkedGenerationId(null);
    setResumeInfo(null);  // 새 작업 시작 시 resume 알림 해제

    try {
      let result;
      if (useChunked) {
        result = await runGeneratorChunked({
          projectId: project.id,
          processId,
          workProductId: wp.id,
          sheets,
          batchSize: CHUNKED_BATCH_SIZE,
          concurrency: CHUNKED_CONCURRENCY,
          onGenerationId: (gid) => setChunkedGenerationId(gid),
          onProgress: (step, detail) => {
            setAgentStep(step);
            setAgentDetail(detail);
          },
        });
      } else {
        result = await runGenerator({
          projectId: project.id,
          processId,
          workProductId: wp.id,
          onProgress: (step, detail) => {
            setAgentStep(step);
            setAgentDetail(detail);
          },
        });
      }
      // agentResult 에 Generator 결과만 저장 (Evaluator 는 별도 트리거)
      setAgentResult({ generator: result.generator, evaluator: null });

      // work_product 데이터 다시 로드 (state 업데이트 반영)
      if (onWorkProductChange) await onWorkProductChange();
    } catch (e) {
      setAgentStep(AgentStep.GEN_FAILED);
      setAgentDetail({ message: `오류: ${e.message}` });
    }
    setGenerating(false);
    setChunkedGenerationId(null);  // 종료 시 cancel 버튼 비활성
  }

  // ── Cancel 핸들러 (Phase 2-2g 옵션 G) ──
  // Cooperative cancellation: cancel 요청은 즉시, 실제 batch 종료는 다음 체크포인트.
  // runGeneratorChunked 의 batch loop 이 cancel 감지 → 자체 종료 → 위 try/catch 흐름.
  async function handleCancelGeneration() {
    if (!chunkedGenerationId || cancelling) return;
    if (!window.confirm('진행 중인 AI 생성을 취소합니다. 부분 결과는 보존되며, 다음 단계에서 [부분 저장] / [모두 폐기] 선택 가능합니다.\n\n계속할까요?')) {
      return;
    }
    setCancelling(true);
    setAgentDetail({
      message: '취소 중... 진행 중인 batch 가 다음 체크포인트에서 종료됩니다 (보통 5분 이내).',
    });
    try {
      const result = await cancelGeneration(chunkedGenerationId);
      console.log('[ProcessScreen] cancel result:', result);
    } catch (e) {
      console.error('[ProcessScreen] cancel failed:', e);
      setAgentDetail({ message: `취소 요청 실패: ${e.message}` });
    } finally {
      setCancelling(false);
    }
  }

  // ── QA 검토 핸들러 (Phase 2-2b STEP C-2: Evaluator만, 사용자 명시 트리거) ──
  async function handleQAReview() {
    if (!agentResult?.generator) {
      alert("AI 생성 결과가 없습니다. 먼저 [⚡ AI 생성] 을 실행하세요.");
      return;
    }

    setPanelOpen(true);
    setAgentStep(AgentStep.EVAL_PREPARING);
    setAgentDetail({ message: 'QA 검토 준비 중...' });
    setEvaluating(true);

    try {
      const result = await runEvaluator({
        generatorResult: agentResult.generator,
        projectId: project.id,
        processId,
        workProductId: wp.id,
        onProgress: (step, detail) => {
          setAgentStep(step);
          setAgentDetail(detail);
        },
      });
      // agentResult 에 Evaluator 결과 추가
      setAgentResult(prev => ({
        ...prev,
        evaluator: result.evaluator,
      }));
    } catch (e) {
      setAgentStep(AgentStep.EVAL_FAILED);
      setAgentDetail({ message: `오류: ${e.message}` });
    }
    setEvaluating(false);
  }

  // ── STK_REQ 카드 편집 핸들러 (Phase 2-2b STEP C-2: 옵션 A) ──
  // 사용자가 [✏ 편집] 클릭 시 모달 열기
  function handleStkReqEditOpen(req) {
    setStkReqEditModal({ open: true, req });
  }

  // 편집 모달에서 [저장] 클릭 시 호출 — DB 의 work_products.content 업데이트
  async function handleStkReqEditSave(editedReq) {
    if (!wp) throw new Error("Work product not found");

    const existing = wp.content?.ai_generated;
    if (!existing) throw new Error("No AI generated content");

    const stkReqs = existing.stakeholder_requirements || [];
    const idx = stkReqs.findIndex(r => r.id === editedReq.id);
    if (idx < 0) throw new Error(`Requirement ${editedReq.id} not found`);

    // 새 배열 생성 (immutable)
    const newStkReqs = stkReqs.map((r, i) => i === idx ? editedReq : r);

    const updatedContent = {
      ...wp.content,
      ai_generated: {
        ...existing,
        stakeholder_requirements: newStkReqs,
        // 메타 정보 추가
        user_modified: true,
        last_modified_at: new Date().toISOString(),
      },
    };

    // DB 업데이트
    await apiCall(
      `/api/projects?resource=work_products&id=${wp.id}`,
      "PATCH",
      { content: updatedContent }
    );

    // 부모에서 데이터 다시 로드
    if (onWorkProductChange) await onWorkProductChange();
  }

  // ── 페이지 진입 시 마지막 critique 자동 로드 ──
  // ai_generated 가 DB 에 있으면 가장 최근 evaluator critique 도 조회해서 agentResult 에 미리 설정
  // API 조회 실패 시에도 wp.content.ai_generated 만으로 최소한의 generator mock 생성 (QA 검토 가능)
  useEffect(() => {
    if (!wp?.content?.ai_generated || agentResult) return;
    let cancelled = false;

    // STEP 1: API 조회 시도 없이 즉시 최소 mock 설정 (fallback)
    // 이렇게 하면 API 조회가 실패해도 QA 검토 버튼이 활성화됨
    const minimalGeneratorMock = {
      success: true,
      passed: true,
      ai_generation_id: null,  // DB 조회 후 채워질 수 있음
      output: wp.content.ai_generated,
      meta: {
        model: 'claude-opus-4-7',
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        latency_ms: 0,
        skills_used: ['aspice-sys1-derivation', 'automotive-domain-guide', 'traceability-rules'],
      },
    };
    setAgentResult({
      generator: minimalGeneratorMock,
      evaluator: null,
    });
    // agentStep 도 "AI 생성 완료" 상태로 설정 (Rationale Panel 표시 정상화)
    setAgentStep(AgentStep.GEN_COMPLETED);

    // STEP 2: 새 /api/ai-generations 엔드포인트로 마지막 결과 조회
    //         성공하면 실제 값으로 덮어쓰기, 실패하면 fallback 유지
    (async () => {
      try {
        // 마지막 evaluator 결과 조회 (limit=1)
        const evalUrl = `/api/ai-generations?work_product_id=${encodeURIComponent(wp.id)}&agent_role=evaluator&limit=1`;
        const evalRes = await fetch(evalUrl);
        if (!evalRes.ok) {
          console.log('[ProcessScreen] /api/ai-generations 응답 실패:', evalRes.status, '— fallback 유지');
          return;
        }
        const evalData = await evalRes.json();
        if (!evalData.success) {
          console.warn('[ProcessScreen] /api/ai-generations evaluator 조회 실패:', evalData.error);
          return;
        }
        const lastEval = (evalData.results && evalData.results.length > 0) ? evalData.results[0] : null;
        if (cancelled) return;

        // 마지막 generator 결과 조회
        const genUrl = `/api/ai-generations?work_product_id=${encodeURIComponent(wp.id)}&agent_role=generator&limit=1`;
        const genRes = await fetch(genUrl);
        let lastGen = null;
        if (genRes.ok) {
          const genData = await genRes.json();
          if (genData.success && genData.results && genData.results.length > 0) {
            lastGen = genData.results[0];
          }
        }
        if (cancelled) return;

        console.log('[ProcessScreen] 마지막 결과 로드:',
          'generator:', lastGen ? `${lastGen.model} ($${(lastGen.cost_usd||0).toFixed(4)})` : 'none',
          'evaluator:', lastEval ? `${lastEval.model} ($${(lastEval.cost_usd||0).toFixed(4)})` : 'none');

        // 실제 DB 값으로 mock 덮어쓰기
        const generatorMock = lastGen ? {
          success: true,
          passed: lastGen.guardrail_passed,
          ai_generation_id: lastGen.id,
          output: wp.content.ai_generated,
          guardrail_result: lastGen.guardrail_result,
          meta: {
            model: lastGen.model,
            input_tokens: lastGen.input_tokens || 0,
            output_tokens: lastGen.output_tokens || 0,
            cost_usd: lastGen.cost_usd || 0,
            latency_ms: lastGen.latency_ms || 0,
            skills_used: lastGen.skills_used || [],
          },
        } : minimalGeneratorMock;

        const evaluatorMock = lastEval ? {
          success: true,
          critique: lastEval.parsed_output,
          meta: {
            model: lastEval.model,
            input_tokens: lastEval.input_tokens || 0,
            output_tokens: lastEval.output_tokens || 0,
            cost_usd: lastEval.cost_usd || 0,
            latency_ms: lastEval.latency_ms || 0,
          },
        } : null;

        setAgentResult({
          generator: generatorMock,
          evaluator: evaluatorMock,
        });
        // Evaluator 도 있으면 QA 완료 단계로
        if (evaluatorMock) {
          setAgentStep(AgentStep.EVAL_COMPLETED);
        }
      } catch (e) {
        console.warn('[ProcessScreen] failed to load last critique:', e);
        // fallback 으로 이미 설정된 minimalGeneratorMock 유지
      }
    })();
    return () => { cancelled = true; };
    // wp?.id 변경 시 (또는 ai_generated 처음 등장 시) 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wp?.id, wp?.content?.ai_generated]);

  const requiredItems = (cfg.items || []).filter(i => i.required);
  const filledRequired = requiredItems.filter(i => {
    const v = getItemValue(i.key);
    return v && v.body && v.body.trim().length > 0;
  });
  const allRequiredFilled = filledRequired.length === requiredItems.length && requiredItems.length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Phase 2-2g 옵션 G: 활성 chunked 작업 감지 알림 (Resume v1) ── */}
      {/*
        다른 탭 / 페이지 reload 등으로 진행 중인 작업이 있을 때 표시.
        v1 정책: 자동 재연결 X, 사용자가 [상태 보기] 또는 [취소] 결정.
        새 generation 시작 (handleAIGenerate) 시 resumeInfo 는 자동 해제.
      */}
      {resumeInfo && !generating && (
        <div style={{
          marginBottom: 16, padding: "12px 16px",
          background: "#fef9c3",
          border: "1px solid #fde047",
          borderRadius: 8,
          display: "flex", alignItems: "center", gap: 12,
          fontSize: 13,
        }}>
          <span style={{ flex: 1 }}>
            ⏳ <strong>진행 중인 AI 생성</strong>이 있습니다 — 배치{" "}
            {resumeInfo.progress?.completed_batches ?? 0}/
            {resumeInfo.progress?.total_batches ?? "?"} 완료 (
            {resumeInfo.progress?.percent ?? 0}%) · 누적 비용 $
            {(resumeInfo.cost?.cost_so_far_usd ?? 0).toFixed(2)}
          </span>
          <button
            onClick={async () => {
              try {
                const status = await fetchGenerationStatus({
                  generationId: resumeInfo.generationId,
                });
                if (!status) {
                  alert("이미 종료된 작업입니다.");
                  setResumeInfo(null);
                  return;
                }
                alert(
                  `상태: ${status.status}\n` +
                  `진행률: ${status.progress?.percent ?? 0}% ` +
                  `(완료 ${status.progress?.completed_batches ?? 0}, ` +
                  `실패 ${status.progress?.failed_batches ?? 0}, ` +
                  `진행중 ${status.progress?.running_batches ?? 0})\n` +
                  `누적 비용: $${(status.cost?.cost_so_far_usd ?? 0).toFixed(4)}\n` +
                  `예상 잔여: ${
                    status.eta?.estimated_remaining_ms != null
                      ? Math.round(status.eta.estimated_remaining_ms / 1000) + "초"
                      : "계산 불가"
                  }\n\n` +
                  `(v1: 실시간 SSE 재연결은 미구현. polling 형태 상태 조회만 제공.)`
                );
              } catch (e) {
                alert(`상태 조회 실패: ${e.message}`);
              }
            }}
            style={{
              background: "#fff",
              border: "1px solid var(--c-navy-deep)",
              color: "var(--c-navy-deep)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}>
            상태 보기
          </button>
          <button
            onClick={async () => {
              if (!window.confirm("진행 중인 AI 생성을 취소합니다. 부분 결과는 보존됩니다.")) return;
              try {
                await cancelGeneration(resumeInfo.generationId);
                setResumeInfo(null);
                alert("취소 요청을 보냈습니다. batch 가 다음 체크포인트에서 종료됩니다.");
              } catch (e) {
                alert(`취소 실패: ${e.message}`);
              }
            }}
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              color: "#b91c1c",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}>
            ⛔ 취소
          </button>
        </div>
      )}

      {/* ── 프로세스 헤더 ────────────────────────── */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--c-border)",
        borderTop: `3px solid ${cfg.color}`,
        padding: "20px 24px",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, color: "var(--c-text-muted)", marginBottom: 4,
              fontWeight: 600, letterSpacing: "0.04em",
            }}>
              {cfg.group} · {cfg.id}
            </div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: cfg.color,
              margin: "0 0 6px", letterSpacing: "-0.01em",
            }}>
              {cfg.label}
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 500, color: "var(--c-text-muted)" }}>
                {cfg.fullLabel}
              </span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--c-text-soft)", margin: 0, lineHeight: 1.6 }}>
              {cfg.desc}
            </p>
          </div>
          <StateBadge state={state} />
        </div>

        {missingDeps.length > 0 && (
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.30)",
            borderRadius: 8,
            fontSize: 12, color: "#92400E",
          }}>
            ⚠ 이전 단계 미승인: <strong>{missingDeps.join(", ")}</strong> — 해당 프로세스를 먼저 승인하세요.
          </div>
        )}
      </div>

      {/* ── 항목 행 (Data-Driven) ─────────────────── */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--c-border)",
        padding: 24,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
              {cfg.id} 산출물 항목
            </h2>
            <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 3 }}>
              설정에서 정의된 항목이 동적으로 렌더링됩니다 — 산출물 등록 또는 직접 입력
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(cfg.items ?? []).map(item => (
            <ItemRow
              key={item.key}
              item={item}
              value={getItemValue(item.key)}
              disabled={missingDeps.length > 0}
              onRegister={() => setRegisterModal({ open: true, item })}
              onDirect={() => setDirectModal({ open: true, item })}
              // Phase 2-2d: 삭제 — 확인 후 content[item.key] 제거
              onDelete={async () => {
                const v = getItemValue(item.key);
                if (!v) return;
                // 상황별 확인 메시지
                const desc = v.source === "register"
                  ? `등록된 파일 "${v.fileName || "산출물"}"`
                  : v.source === "direct"
                    ? "직접 입력 내용"
                    : "등록 내용";
                const ok = window.confirm(
                  `${item.label}의 ${desc}을(를) 삭제하시겠습니까?\n\n` +
                  `· 이 작업은 work_products 의 입력만 제거합니다.\n` +
                  `· 업로드된 파일은 Storage 에 보존됩니다 (복구 가능).\n` +
                  `· 이미 생성된 AI 산출물(stakeholder_requirements)은 영향받지 않습니다.\n\n` +
                  `계속하시려면 [확인] 을 누르세요.`
                );
                if (!ok) return;
                try {
                  await handleItemDelete(item.key);
                } catch (e) {
                  console.error("[handleItemDelete] failed:", e);
                  alert("삭제 중 오류: " + (e?.message || String(e)));
                }
              }}
            />
          ))}
          {(!cfg.items || cfg.items.length === 0) && (
            <div style={{
              padding: 32,
              background: "var(--c-bg-soft)",
              border: "1px dashed var(--c-border-strong)",
              borderRadius: 8,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", marginBottom: 6 }}>
                항목이 정의되지 않았습니다
              </div>
              <div style={{ fontSize: 11, color: "var(--c-text-muted)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                화면설계서 v2.4에 이 프로세스의 구체 항목명이 명시되지 않았습니다.<br/>
                Phase 3의 [설정 → 스키마 정의] 화면에서 대표님 검토 후 정의 예정입니다.
              </div>
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: "1px solid var(--c-border)",
          display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
        }}>
          <div style={{
            flex: 1,
            fontSize: 11, color: "var(--c-text-muted)",
          }}>
            {requiredItems.length > 0 && (
              <>
                필수 항목: <strong style={{ color: allRequiredFilled ? "#10B981" : "var(--c-text)" }}>
                  {filledRequired.length} / {requiredItems.length}
                </strong>
                {allRequiredFilled && " ✓"}
              </>
            )}
          </div>
          <button
            onClick={handleAIGenerate}
            disabled={!allRequiredFilled || generating || evaluating || !AI_GENERATE_SUPPORTED.has(processId)}
            title={
              !AI_GENERATE_SUPPORTED.has(processId)
                ? `Phase 2-2a는 SYS.1만 지원합니다 (${processId} 미지원)`
                : !allRequiredFilled
                  ? "필수 항목을 모두 채우세요"
                  : "AI 생성을 시작합니다"
            }
            style={{
              background: (allRequiredFilled && AI_GENERATE_SUPPORTED.has(processId)) ? cfg.color : "var(--c-bg-mid)",
              color: (allRequiredFilled && AI_GENERATE_SUPPORTED.has(processId)) ? "#fff" : "var(--c-text-muted)",
              border: "none",
              borderRadius: 6, padding: "9px 18px",
              fontSize: 12, fontWeight: 600,
              opacity: (generating || evaluating) ? 0.6 : 1,
              cursor: (allRequiredFilled && AI_GENERATE_SUPPORTED.has(processId) && !generating && !evaluating) ? "pointer" : "not-allowed",
            }}>
            {generating ? "⚡ 생성 중..." : "⚡ AI 생성"}
          </button>

          {/*
            Phase 2-2d: 진행/결과 보기 버튼
            - 산출물 영역과 무관하게 언제든 RationalePanel 다시 열기
            - 생성 중 / 실패 / 결과 있음 / 미시작 어떤 상태든 의미 있음
            - 미시작 상태에서는 비활성화 (보여줄 게 없음)
          */}
          {(generating || evaluating || agentResult || agentStep !== AgentStep.IDLE) && (
            <button
              onClick={() => setPanelOpen(true)}
              title={
                generating || evaluating
                  ? "현재 진행 상황 보기"
                  : "마지막 AI 생성 결과 / 가드레일 / Rationale 보기"
              }
              style={{
                background: "#fff",
                border: "1px solid var(--c-navy-deep)",
                color: "var(--c-navy-deep)",
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}>
              📊 {(generating || evaluating) ? "진행 보기" : "Rationale 보기"}
            </button>
          )}

          {/*
            Phase 3-1 (SCR-12): QA 시정조치 버튼
            - QA 검토 결과(evaluator critique)가 있을 때 표시
            - 반려(rejected) 시 강조색, 승인 후에도 추가 개선용으로 열 수 있음
            - 흐름: 이슈 선택 → AI 수정안(diff) → 사람 승인 → 리비전 반영 → 재QA
          */}
          {agentResult?.evaluator?.critique && !generating && !evaluating && (
            <button
              onClick={() => setRemediationOpen(true)}
              title="QA 이슈를 AI가 표적 수정 — 사람 승인 후 리비전으로 반영 (원본 불변)"
              style={{
                background: agentResult.evaluator.critique.verdict === "rejected" ? "#B91C1C" : "#fff",
                border: "1px solid #B91C1C",
                color: agentResult.evaluator.critique.verdict === "rejected" ? "#fff" : "#B91C1C",
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}>
              🔧 AI 시정조치
            </button>
          )}
        </div>
      </div>

      {/* ── AI 생성 결과 (있을 때만 표시) ────────────── */}
      {wp?.content?.ai_generated && (
        <GeneratedArtifactView
          aiGenerated={wp.content.ai_generated}
          processColor={cfg.color}
          onReopenPanel={() => setPanelOpen(true)}
          onQAReview={handleQAReview}
          canQAReview={!!agentResult?.generator && !generating && !evaluating}
          hasEvaluator={!!agentResult?.evaluator}
          evaluating={evaluating}
          onEditStkReq={handleStkReqEditOpen}
          // 다운로드 메타데이터 (Phase 2-2b STEP C-3a)
          projectName={project?.name}
          processId={processId}
          generatorModel={agentResult?.generator?.meta?.model}
          evaluatorModel={agentResult?.evaluator?.meta?.model}
          critique={agentResult?.evaluator?.critique}
        />
      )}

      {/* Phase 안내 */}
      <div style={{
        marginTop: 16, padding: "12px 16px",
        background: "rgba(30, 39, 97, 0.04)",
        border: "1px dashed var(--c-navy-mid)",
        borderRadius: 8,
        fontSize: 11, color: "var(--c-text-soft)", lineHeight: 1.6,
      }}>
        <strong>Phase 2-2b 활성 (STEP C-3b)</strong> — 사용자 제어 흐름 + 카드별 편집 + 다운로드 (JSON/CSV/Markdown/<strong>DOCX</strong>).<br/>
        Claude Opus 4.7 (Generator) + Gemini Flash (Evaluator) + 5축 가드레일 (① ② ③ ④ 활성). 다음 STEP C-3c: Excel (XLSX 트레이서빌리티 매트릭스). Phase 2-3: HITL ⑤ 활성.
      </div>

      {/* ── 모달 ──────────────────────────────────── */}
      {registerModal.open && (
        <WorkProductRegisterModal
          open={registerModal.open}
          onClose={() => setRegisterModal({ open: false, item: null })}
          projectId={project.id}
          processId={processId}
          item={registerModal.item}
          initialValue={getItemValue(registerModal.item.key)}
          onSave={(val) => handleItemSave(registerModal.item.key, val)}
        />
      )}
      {directModal.open && (
        <WorkProductDirectInputModal
          open={directModal.open}
          onClose={() => setDirectModal({ open: false, item: null })}
          processId={processId}
          item={directModal.item}
          initialValue={getItemValue(directModal.item.key)}
          onSave={(val) => handleItemSave(directModal.item.key, val)}
        />
      )}

      {/* STK_REQ 편집 모달 (Phase 2-2b STEP C-2: 옵션 A 카드별 인라인 편집) */}
      {stkReqEditModal.open && (
        <StkReqEditModal
          open={stkReqEditModal.open}
          onClose={() => setStkReqEditModal({ open: false, req: null })}
          req={stkReqEditModal.req}
          onSave={handleStkReqEditSave}
        />
      )}

      {/* Rationale Panel (우측 슬라이드) */}
      <RationalePanel
        open={panelOpen}
        onClose={() => !generating && !evaluating && setPanelOpen(false)}
        step={agentStep}
        detail={agentDetail}
        result={agentResult}
        // Phase 2-2g 옵션 G: chunked generation 진행 중일 때만 cancel 버튼 표시
        cancellable={!!chunkedGenerationId && generating}
        onCancel={handleCancelGeneration}
        cancelling={cancelling}
      />

      {/* Phase 3-1 (SCR-12): QA 시정조치 패널 */}
      <RemediationPanel
        open={remediationOpen}
        onClose={() => setRemediationOpen(false)}
        project={project}
        processId={processId}
        workProductId={wp?.id}
        // apply 가 work_products.content.ai_generated 를 리비전으로 갱신하므로
        // 화면(산출물 카드)을 다시 로드해 수정본을 표시
        onApplied={onWorkProductChange}
      />
    </div>
  );
}

function ItemRow({ item, value, disabled, onRegister, onDirect, onDelete }) {
  const hasValue = value && value.body && value.body.trim().length > 0;
  const preview = hasValue
    ? truncate(value.body, 80)
    : "항목을 등록하거나 직접 입력하세요";

  // 출처 라벨 + 다운로드 가능 여부
  const isUploaded = value?.source === "register" && value?.storagePath;
  const isDirect = value?.source === "direct";
  // Phase 2-2d: 무엇이 등록되었는지 (register | direct | none) — 버튼 상태 결정에 사용
  const hasRegistered = hasValue && (isUploaded || value?.source === "register");
  const hasDirect = hasValue && isDirect;
  const sourceLabel = isUploaded
    ? `📎 ${value.fileName || "산출물"}`
    : value?.source === "register"
    ? `📎 ${value.fileName || "산출물"} (메타만)` // 구버전 호환
    : value?.source === "direct"
    ? "✍ 직접 입력"
    : null;

  const canRegister = item.inputType !== "Text";

  // 다운로드 핸들러
  async function handleDownload(e) {
    e.stopPropagation();
    if (!isUploaded) return;
    try {
      const res = await fetch(`/api/upload?action=signed_url&path=${encodeURIComponent(value.storagePath)}`);
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.open(url, "_blank", "noopener");
    } catch (err) {
      alert("다운로드 링크 생성 실패: " + err.message);
    }
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr 110px 110px",
      gap: 10, alignItems: "stretch",
    }}>
      {/* 라벨 */}
      <div style={{
        background: "var(--c-navy-deep)",
        color: "#fff",
        borderRadius: 6,
        padding: "12px 14px",
        fontSize: 12, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {item.label}
        {item.required && (
          <span style={{ color: "var(--c-coral)", fontSize: 12 }}>*</span>
        )}
      </div>

      {/* 내용 미리보기 */}
      <div style={{
        background: hasValue ? "#fff" : "var(--c-bg-soft)",
        border: `1px solid ${hasValue ? "var(--c-navy-mid)" : "var(--c-border-strong)"}`,
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 11,
        color: hasValue ? "var(--c-text)" : "var(--c-text-muted)",
        fontStyle: hasValue ? "normal" : "italic",
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 4,
        position: "relative",
      }}>
        {sourceLabel && (
          <div style={{
            fontSize: 10, fontWeight: 600, fontStyle: "normal",
            display: "flex", alignItems: "center", gap: 8,
            paddingRight: 28, // 삭제 버튼 자리
          }}>
            <span style={{ color: "var(--c-navy-mid)" }}>{sourceLabel}</span>
            {isUploaded && (
              <button
                onClick={handleDownload}
                style={{
                  fontSize: 10, fontWeight: 600,
                  background: "transparent",
                  border: "1px solid var(--c-navy-mid)",
                  color: "var(--c-navy-mid)",
                  borderRadius: 3,
                  padding: "1px 6px",
                  cursor: "pointer",
                }}
                title="파일 다운로드"
              >
                ↓ 다운로드
              </button>
            )}
            {value?.fileSize && (
              <span style={{ color: "var(--c-text-muted)", fontWeight: 400 }}>
                · {(value.fileSize / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        )}
        <div style={{ lineHeight: 1.5 }}>{preview}</div>

        {/*
          Phase 2-2d: 삭제 버튼 (등록된 값 있을 때만)
          - 카드 우측 상단에 작게 — 항상 보이되 눈에 거슬리지 않게
          - 클릭 시 ProcessScreen 의 onDelete (확인 다이얼로그 포함)
        */}
        {hasValue && onDelete && !disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="이 항목 삭제"
            aria-label={`${item.label} 삭제`}
            style={{
              position: "absolute",
              top: 6, right: 8,
              width: 22, height: 22,
              padding: 0,
              background: "transparent",
              border: "1px solid var(--c-border-strong)",
              borderRadius: 4,
              color: "var(--c-text-muted)",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(220, 38, 38, 0.08)";
              e.currentTarget.style.borderColor = "rgba(220, 38, 38, 0.4)";
              e.currentTarget.style.color = "#DC2626";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--c-border-strong)";
              e.currentTarget.style.color = "var(--c-text-muted)";
            }}
          >
            🗑
          </button>
        )}
      </div>

      {/*
        Phase 2-2d: 산출물 등록 버튼
        - 등록된 파일이 이미 있으면 "교체" 로 표시 — 사용자가 의도를 명확히 알 수 있음
        - 클릭 동작은 동일 (onRegister): 모달이 열려 새로 업로드하면 기존 항목을 덮어쓰기
        - 직접 입력만 되어 있으면 그대로 "산출물 등록"
      */}
      <button
        disabled={disabled || !canRegister}
        onClick={onRegister}
        title={
          !canRegister
            ? "이 항목은 직접 입력만 가능합니다"
            : hasRegistered
              ? "기존 등록을 새 파일/시트로 교체"
              : "파일 업로드 또는 시트 선택"
        }
        style={{
          background: disabled || !canRegister ? "var(--c-bg-mid)" : "var(--c-navy-deep)",
          color: disabled || !canRegister ? "var(--c-text-muted)" : "#fff",
          border: "none", borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          cursor: disabled || !canRegister ? "not-allowed" : "pointer",
          opacity: !canRegister ? 0.5 : 1,
        }}>
        {hasRegistered ? "📎 교체" : "산출물 등록"}
      </button>

      {/* 직접 입력 버튼 — 직접 입력 내용이 이미 있으면 "수정" 으로 표시 */}
      <button
        disabled={disabled}
        onClick={onDirect}
        title={hasDirect ? "직접 입력 내용 수정" : "직접 텍스트 입력"}
        style={{
          background: "#fff",
          color: disabled ? "var(--c-text-muted)" : "var(--c-navy-deep)",
          border: `1px solid ${disabled ? "var(--c-border)" : "var(--c-navy-deep)"}`,
          borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
        }}>
        {hasDirect ? "✍ 수정" : "직접 입력"}
      </button>
    </div>
  );
}

function truncate(str, n) {
  if (!str) return "";
  const oneLine = str.replace(/\n+/g, " ");
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
}

function StateBadge({ state }) {
  const config = stateConfig(state);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 16,
      background: `${config.color}15`,
      color: config.color,
      border: `1px solid ${config.color}40`,
      fontSize: 11, fontWeight: 700,
      flexShrink: 0,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: config.color,
      }} />
      {config.label}
    </div>
  );
}

function stateConfig(state) {
  const map = {
    INITIAL:           { label: "초기",     color: "#9CA3AF" },
    GENERATING:        { label: "생성중",   color: "#2383E2" },
    GENERATED:         { label: "생성완료", color: "#2383E2" },
    VERIFYING:         { label: "검증중",   color: "#F59E0B" },
    VERIFIED:          { label: "검증완료", color: "#F59E0B" },
    PENDING_APPROVAL:  { label: "승인대기", color: "#3A4B8C" },
    APPROVED:          { label: "승인",     color: "#10B981" },
    REJECTED:          { label: "반려",     color: "#DC2626" },
    CHANGES_REQUESTED: { label: "수정요청", color: "#F96167" },
  };
  return map[state] || map.INITIAL;
}

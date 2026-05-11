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
import { runAgentHarness, AgentStep } from "../lib/agent-harness.js";

// AI 생성 지원 프로세스 (Phase 2-2a 는 SYS.1만)
const AI_GENERATE_SUPPORTED = new Set(["SYS.1"]);

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

  // Rationale Panel 상태 (Phase 2-2a)
  const [panelOpen, setPanelOpen] = useState(false);
  const [agentStep, setAgentStep] = useState(AgentStep.IDLE);
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentResult, setAgentResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setState(wp?.state || "INITIAL");
  }, [wp?.state]);

  useEffect(() => {
    if (onStateChange) onStateChange(state);
  }, [state, onStateChange]);

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

  function getItemValue(itemKey) {
    return wp?.content?.[itemKey] || null;
  }

  // ── AI 생성 핸들러 (Phase 2-2a) ──────────────────
  async function handleAIGenerate() {
    if (!wp) {
      alert("입력값을 먼저 저장하세요.");
      return;
    }
    if (!AI_GENERATE_SUPPORTED.has(processId)) {
      alert(`현재 ${processId}는 AI 생성이 지원되지 않습니다. Phase 2-2a는 SYS.1만 지원합니다.`);
      return;
    }

    // 패널 열고 진행 시작
    setPanelOpen(true);
    setAgentResult(null);
    setAgentStep(AgentStep.PREPARING);
    setAgentDetail({ message: '시작 중...' });
    setGenerating(true);

    try {
      const result = await runAgentHarness({
        projectId: project.id,
        processId,
        workProductId: wp.id,
        onProgress: (step, detail) => {
          setAgentStep(step);
          setAgentDetail(detail);
        },
      });
      setAgentResult(result);

      // work_product 데이터 다시 로드 (state 업데이트 반영)
      if (onWorkProductChange) await onWorkProductChange();
    } catch (e) {
      setAgentStep(AgentStep.FAILED);
      setAgentDetail({ message: `오류: ${e.message}` });
    }
    setGenerating(false);
  }

  const requiredItems = (cfg.items || []).filter(i => i.required);
  const filledRequired = requiredItems.filter(i => {
    const v = getItemValue(i.key);
    return v && v.body && v.body.trim().length > 0;
  });
  const allRequiredFilled = filledRequired.length === requiredItems.length && requiredItems.length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
            disabled={!allRequiredFilled || generating || !AI_GENERATE_SUPPORTED.has(processId)}
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
              opacity: generating ? 0.6 : 1,
              cursor: (allRequiredFilled && AI_GENERATE_SUPPORTED.has(processId) && !generating) ? "pointer" : "not-allowed",
            }}>
            {generating ? "⚡ 생성 중..." : "⚡ AI 생성"}
          </button>
        </div>
      </div>

      {/* Phase 안내 */}
      <div style={{
        marginTop: 16, padding: "12px 16px",
        background: "rgba(30, 39, 97, 0.04)",
        border: "1px dashed var(--c-navy-mid)",
        borderRadius: 8,
        fontSize: 11, color: "var(--c-text-soft)", lineHeight: 1.6,
      }}>
        <strong>Phase 2-2a 활성</strong> — Claude Opus 4.7 (adaptive thinking) + Skills (aspice-sys1-derivation, automotive-domain-guide, traceability-rules) + 5축 가드레일 (1, 2, 3축).<br/>
        다음 Phase 2-2b: Gemini 교차검증 추가 (4축 활성). Phase 2-3: HITL 승인 (5축 활성).
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

      {/* Rationale Panel (우측 슬라이드, Phase 2-2a) */}
      <RationalePanel
        open={panelOpen}
        onClose={() => !generating && setPanelOpen(false)}
        step={agentStep}
        detail={agentDetail}
        result={agentResult}
      />
    </div>
  );
}

function ItemRow({ item, value, disabled, onRegister, onDirect }) {
  const hasValue = value && value.body && value.body.trim().length > 0;
  const preview = hasValue
    ? truncate(value.body, 80)
    : "항목을 등록하거나 직접 입력하세요";

  // 출처 라벨 + 다운로드 가능 여부
  const isUploaded = value?.source === "register" && value?.storagePath;
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
      }}>
        {sourceLabel && (
          <div style={{
            fontSize: 10, fontWeight: 600, fontStyle: "normal",
            display: "flex", alignItems: "center", gap: 8,
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
      </div>

      {/* 산출물 등록 버튼 */}
      <button
        disabled={disabled || !canRegister}
        onClick={onRegister}
        title={!canRegister ? "이 항목은 직접 입력만 가능합니다" : undefined}
        style={{
          background: disabled || !canRegister ? "var(--c-bg-mid)" : "var(--c-navy-deep)",
          color: disabled || !canRegister ? "var(--c-text-muted)" : "#fff",
          border: "none", borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          cursor: disabled || !canRegister ? "not-allowed" : "pointer",
          opacity: !canRegister ? 0.5 : 1,
        }}>
        산출물 등록
      </button>

      {/* 직접 입력 버튼 */}
      <button
        disabled={disabled}
        onClick={onDirect}
        style={{
          background: "#fff",
          color: disabled ? "var(--c-text-muted)" : "var(--c-navy-deep)",
          border: `1px solid ${disabled ? "var(--c-border)" : "var(--c-navy-deep)"}`,
          borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
        }}>
        직접 입력
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

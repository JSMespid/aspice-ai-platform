// SCR-05 — V-Model 프로세스 화면 (Data-Driven 동적 렌더링)
// 화면설계서 슬라이드 12, 15, 16:
//   설정에서 정의한 항목들이 동적으로 렌더링됨
//   각 항목 행: [라벨] [내용 미리보기] [산출물등록] [직접입력]
//
// Phase 1: 셸 + 항목 행 표시 (산출물 등록/직접 입력 모달은 Phase 2에서 추가)

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PROCESSES, getPreviousProcessIds } from "../config/processes.js";

export default function ProcessScreen({ project, workProducts, onWorkProductChange, onStateChange }) {
  const { processId } = useParams();
  const cfg = PROCESSES[processId];

  const wp = workProducts.find(w => w.process_id === processId);
  const [state, setState] = useState(wp?.state || "INITIAL");

  // 부모(AppShell)의 TopBar에 현재 상태 전달
  useEffect(() => {
    if (onStateChange) onStateChange(state);
  }, [state, onStateChange]);

  // 이전 단계 의존성 체크
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
              {cfg.placeholder && (
                <span style={{
                  marginLeft: 8, fontSize: 9, fontWeight: 600,
                  background: "var(--c-bg-mid)", color: "var(--c-text-soft)",
                  padding: "2px 8px", borderRadius: 10,
                }}>
                  Phase 1 — 셸만 구현됨
                </span>
              )}
            </h2>
            <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 3 }}>
              설정에서 정의된 항목이 동적으로 렌더링됩니다 — 산출물 등록 또는 직접 입력
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(cfg.items ?? []).map(item => (
            <ItemRow key={item.key} item={item} disabled={missingDeps.length > 0} />
          ))}
          {(!cfg.items || cfg.items.length === 0) && (
            <div style={{
              padding: 24, background: "var(--c-bg-soft)",
              borderRadius: 8, textAlign: "center", color: "var(--c-text-muted)", fontSize: 12,
            }}>
              항목이 정의되지 않았습니다. 좌측 [설정]에서 이 프로세스의 항목을 정의하세요.
            </div>
          )}
        </div>

        {/* 하단 액션 — 저장 / 생성 */}
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: "1px solid var(--c-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button disabled style={{
            background: "#fff", border: "1px solid var(--c-border-strong)",
            borderRadius: 6, padding: "9px 18px",
            fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)",
          }}>
            저장
          </button>
          <button disabled style={{
            background: cfg.color, color: "#fff", border: "none",
            borderRadius: 6, padding: "9px 18px",
            fontSize: 12, fontWeight: 600,
            opacity: 0.5,
          }}>
            ⚡ AI 생성 (Phase 2)
          </button>
        </div>
      </div>

      {/* Phase 1 안내 */}
      <div style={{
        marginTop: 16, padding: "12px 16px",
        background: "rgba(30, 39, 97, 0.04)",
        border: "1px dashed var(--c-navy-mid)",
        borderRadius: 8,
        fontSize: 11, color: "var(--c-text-soft)", lineHeight: 1.6,
      }}>
        <strong>Phase 1 진행 중</strong> — 메인 워크스페이스 셸 + 사이드바 + 워크플로우 + 항목 행 UI까지 완성되었습니다.<br/>
        다음 Phase 2에서는 [산출물 등록] / [직접 입력] 모달과 AI 생성, 그리고 5-Phase QA가 추가됩니다.
      </div>
    </div>
  );
}

function ItemRow({ item, disabled }) {
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
        background: "#fff",
        border: "1px solid var(--c-border-strong)",
        borderRadius: 6,
        padding: "12px 14px",
        fontSize: 11, color: "var(--c-text-muted)",
        fontStyle: "italic",
        display: "flex", alignItems: "center",
      }}>
        항목을 등록하거나 직접 입력하세요
      </div>

      {/* 산출물 등록 버튼 */}
      <button disabled={disabled} style={{
        background: disabled ? "var(--c-bg-mid)" : "var(--c-navy-deep)",
        color: disabled ? "var(--c-text-muted)" : "#fff",
        border: "none", borderRadius: 6,
        fontSize: 11, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
        산출물 등록
      </button>

      {/* 직접 입력 버튼 */}
      <button disabled={disabled} style={{
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

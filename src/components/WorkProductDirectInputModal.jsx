// SCR-10 — 직접 입력 모달
// 화면설계서 v2.4 슬라이드 14:
//   - 항목별로 본문 텍스트만 직접 입력
//   - 등록 모달보다 가벼운 흐름 (메모/요약/즉석 입력용)
//   - 저장 시 work_products.content[item.key] 에 누적 저장

import { useState, useEffect } from "react";

export default function WorkProductDirectInputModal({
  open,
  onClose,
  processId,
  item,             // { key, label, required, inputType }
  initialValue,
  onSave,           // (newValue) => Promise<void>
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setBody(initialValue?.body || "");
      setError("");
    }
  }, [open, initialValue]);

  if (!open) return null;

  async function handleSave() {
    if (!body.trim()) {
      setError("내용을 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        source: "direct",
        body: body.trim(),
        registeredAt: new Date().toISOString(),
      });
      onClose();
    } catch (e) {
      setError("저장 실패: " + e.message);
    }
    setSaving(false);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ───────────────────────── */}
        <div style={headerStyle}>
          <div>
            <div style={{
              fontSize: 11, color: "var(--c-text-muted)",
              fontWeight: 600, letterSpacing: "0.04em", marginBottom: 4,
            }}>
              {processId} · 직접 입력
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
              {item.label}
              {item.required && <span style={{ color: "var(--c-coral)", marginLeft: 6 }}>*</span>}
            </h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="닫기">×</button>
        </div>

        {/* ── 본문 ───────────────────────── */}
        <div style={bodyStyle}>
          <div style={{
            background: "rgba(30, 39, 97, 0.04)",
            border: "1px solid rgba(30, 39, 97, 0.15)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 11, color: "var(--c-text-soft)", lineHeight: 1.6,
            marginBottom: 14,
          }}>
            기존 산출물 없이 즉석에서 텍스트를 입력합니다. AI 생성 시 이 내용이 입력으로 사용됩니다.
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={getPlaceholder(item.label)}
            rows={14}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--c-border-strong)",
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "inherit",
              lineHeight: 1.7,
              outline: "none",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />

          <div style={{
            marginTop: 6, fontSize: 11, color: "var(--c-text-muted)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>줄바꿈은 자유롭게 — Markdown 형식도 지원됩니다</span>
            <span>{body.length} 자</span>
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 12px",
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.30)",
              borderRadius: 6,
              fontSize: 12, color: "#991B1B",
            }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────── */}
        <div style={footerStyle}>
          <button onClick={onClose} disabled={saving} style={cancelBtnStyle}>
            취소
          </button>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 항목별 플레이스홀더 가이드
function getPlaceholder(label) {
  const map = {
    "이해관계자 요구사항": "예:\n- 운전자가 야간 주행 시 200m 이상 가시거리를 확보해야 한다.\n- 마주오는 차량에 눈부심을 주지 않아야 한다.\n- 법규 ECE R123을 만족해야 한다.",
    "Use Case": "예:\n- UC-01: 야간 주행 중 자동 하이빔 ON/OFF\n- UC-02: 마주오는 차량 감지 시 로우빔 전환\n- UC-03: 시스템 고장 시 안전 모드 진입",
    "운영 맥락": "예:\n- 동작 환경: -40°C ~ +85°C\n- 차량 속도: 30km/h ~ 150km/h\n- 주행 환경: 도시 / 고속도로 / 시골길",
  };
  return map[label] || "내용을 입력하세요. 줄바꿈, 목록 등을 자유롭게 사용할 수 있습니다.";
}

// ── 스타일 ──────────────────────────────────────────
const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};
const modalStyle = {
  background: "#fff",
  borderRadius: 12,
  width: "100%", maxWidth: 600,
  maxHeight: "calc(100vh - 40px)",
  display: "flex", flexDirection: "column",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)",
  overflow: "hidden",
};
const headerStyle = {
  padding: "18px 22px",
  borderBottom: "1px solid var(--c-border)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexShrink: 0,
};
const closeBtnStyle = {
  background: "transparent", border: "none",
  fontSize: 24, fontWeight: 300,
  color: "var(--c-text-muted)", cursor: "pointer",
  width: 32, height: 32, borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const bodyStyle = {
  padding: "20px 22px",
  overflowY: "auto",
  flex: 1,
};
const footerStyle = {
  padding: "14px 22px",
  borderTop: "1px solid var(--c-border)",
  display: "flex", justifyContent: "flex-end", gap: 8,
  flexShrink: 0,
};
const cancelBtnStyle = {
  background: "#fff",
  border: "1px solid var(--c-border-strong)",
  borderRadius: 6,
  padding: "9px 18px",
  fontSize: 12, fontWeight: 600,
  color: "var(--c-text)",
  cursor: "pointer",
};
const saveBtnStyle = {
  background: "var(--c-navy-deep)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  fontSize: 12, fontWeight: 600,
  cursor: "pointer",
};

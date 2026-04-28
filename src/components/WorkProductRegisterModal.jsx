// SCR-09 — 산출물 등록 모달
// 화면설계서 v2.4 슬라이드 14:
//   - 항목별로 외부 산출물(파일)을 등록
//   - 파일명, 파일 종류, 본문 텍스트, 비고를 입력
//   - 저장 시 work_products.content[item.key] 에 누적 저장
//
// Phase 2-1 범위:
//   - 모달 UI + 메타데이터 + 텍스트 본문 저장 (Supabase 연동)
//   - 실제 파일 바이너리 업로드는 후속 Phase에서 추가

import { useState, useEffect } from "react";

export default function WorkProductRegisterModal({
  open,
  onClose,
  processId,
  item,             // { key, label, required, inputType }
  initialValue,     // 기존에 등록된 값 (있으면 편집 모드)
  onSave,           // (newValue) => Promise<void>
}) {
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("문서");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 모달 열릴 때 초기값 세팅
  useEffect(() => {
    if (open) {
      setFileName(initialValue?.fileName || "");
      setFileType(initialValue?.fileType || "문서");
      setBody(initialValue?.body || "");
      setNote(initialValue?.note || "");
      setError("");
    }
  }, [open, initialValue]);

  if (!open) return null;

  async function handleSave() {
    if (!fileName.trim()) {
      setError("파일명을 입력하세요.");
      return;
    }
    if (!body.trim()) {
      setError("본문 내용을 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        source: "register",       // 등록 / 직접입력 구분
        fileName: fileName.trim(),
        fileType,
        body: body.trim(),
        note: note.trim(),
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
              {processId} · 산출물 등록
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
            marginBottom: 16,
          }}>
            기존 산출물(요구사항 명세서, 설계 문서 등)을 등록합니다. 파일 메타정보와 본문 내용을 입력하세요.
          </div>

          {/* 파일명 */}
          <Field label="파일명" required>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="예: 헤드램프_요구사항명세서_v1.2.docx"
              style={inputStyle}
            />
          </Field>

          {/* 파일 종류 */}
          <Field label="파일 종류">
            <select
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              style={inputStyle}
            >
              <option value="문서">문서 (Word, PDF, HWP)</option>
              <option value="스프레드시트">스프레드시트 (Excel, CSV)</option>
              <option value="모델">모델 (UML, SysML, Simulink)</option>
              <option value="요구사항관리">요구사항관리 (DOORS, Polarion)</option>
              <option value="이미지">이미지 (PNG, JPG, SVG)</option>
              <option value="기타">기타</option>
            </select>
          </Field>

          {/* 본문 */}
          <Field label="본문 내용" required>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="산출물의 본문 텍스트를 입력하세요. AI 생성 시 이 내용이 입력으로 사용됩니다."
              rows={10}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
          </Field>

          {/* 비고 */}
          <Field label="비고">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(선택) 산출물 작성자, 버전, 출처 등"
              style={inputStyle}
            />
          </Field>

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
            {saving ? "저장 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block",
        fontSize: 12, fontWeight: 600,
        color: "var(--c-text)", marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: "var(--c-coral)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
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
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--c-border-strong)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
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

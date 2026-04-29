// SCR-09 — 산출물 등록 모달 (실제 파일 업로드)
//
// 화면설계서 v2.4 슬라이드 13 명세:
//   "산출물등록 → 파일 업로드 모달 → 메타데이터 저장"
//
// 동작:
//   1) 사용자가 파일 선택 (클릭 또는 드래그&드롭)
//   2) 파일명/크기/타입 자동 표시 (사용자 타이핑 X)
//   3) 텍스트 파일이면 본문 자동 추출 (옵션)
//   4) [등록] 버튼 클릭 시:
//      a. base64 인코딩 → POST /api/upload?action=upload
//      b. storagePath 받아서 work_products.content[itemKey] 에 저장
//      c. 메타데이터: storagePath, fileName, fileType, size, body, note

import { useState, useEffect, useRef } from "react";

const MAX_SIZE_MB = 50;
const TEXT_TYPES = [
  "text/plain", "text/markdown", "text/csv",
  "application/json", "application/xml", "text/html",
];

export default function WorkProductRegisterModal({
  open,
  onClose,
  projectId,
  processId,
  item,             // { key, label, required, inputType }
  initialValue,
  onSave,           // (newValue) => Promise<void>
}) {
  const [file, setFile] = useState(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // 모달 열릴 때 초기값 세팅
  useEffect(() => {
    if (open) {
      setFile(null);
      setBody(initialValue?.body || "");
      setNote(initialValue?.note || "");
      setError("");
      setUploadProgress(0);
    }
  }, [open, initialValue]);

  if (!open) return null;

  // ── 파일 선택 처리 ─────────────────────────────────────────────
  function handleFileSelect(selectedFile) {
    if (!selectedFile) return;

    // 크기 검증
    const sizeMB = selectedFile.size / 1024 / 1024;
    if (sizeMB > MAX_SIZE_MB) {
      setError(`파일 크기는 ${MAX_SIZE_MB}MB를 초과할 수 없습니다 (현재: ${sizeMB.toFixed(1)}MB)`);
      return;
    }

    setError("");
    setFile(selectedFile);

    // 텍스트 파일이면 본문 자동 추출
    if (TEXT_TYPES.includes(selectedFile.type) || selectedFile.name.match(/\.(txt|md|csv|json|xml|html)$/i)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target.result || "").substring(0, 5000); // 5KB 미리보기
        if (!body.trim()) {  // 비어있을 때만 자동 채움
          setBody(text);
        }
      };
      reader.readAsText(selectedFile);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }

  // ── 등록 처리: 업로드 → 메타데이터 저장 ───────────────────────
  async function handleRegister() {
    if (!file) {
      setError("파일을 선택하세요.");
      return;
    }
    if (!body.trim()) {
      setError("본문 내용을 입력하세요. (AI 생성 시 입력으로 사용됩니다)");
      return;
    }

    setUploading(true);
    setError("");
    setUploadProgress(10);

    try {
      // 1) base64 인코딩
      const base64 = await fileToBase64(file);
      setUploadProgress(40);

      // 2) Supabase Storage 업로드
      const uploadRes = await fetch("/api/upload?action=upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
          projectId,
          processId,
          itemKey: item.key,
        }),
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`업로드 실패: ${errText}`);
      }
      const uploadResult = await uploadRes.json();
      setUploadProgress(80);

      // 3) work_products.content[item.key] 에 메타데이터 저장
      await onSave({
        source: "register",
        fileName: uploadResult.originalFileName,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath: uploadResult.storagePath,
        body: body.trim(),
        note: note.trim(),
        registeredAt: new Date().toISOString(),
      });
      setUploadProgress(100);

      // 잠시 100% 표시 후 닫기
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (e) {
      setError("등록 실패: " + e.message);
      setUploadProgress(0);
    }
    setUploading(false);
  }

  // ── 기존 파일 정보 (편집 모드) ─────────────────────────────────
  const existingFile = !file && initialValue?.storagePath ? {
    name: initialValue.fileName,
    type: initialValue.fileType,
    size: initialValue.fileSize,
    storagePath: initialValue.storagePath,
  } : null;

  return (
    <div style={overlayStyle} onClick={uploading ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ───────────────────────── */}
        <div style={headerStyle}>
          <div>
            <div style={metaLabelStyle}>{processId} · 산출물 등록</div>
            <h2 style={titleStyle}>
              {item.label}
              {item.required && <span style={{ color: "var(--c-coral)", marginLeft: 6 }}>*</span>}
            </h2>
          </div>
          <button onClick={onClose} disabled={uploading} style={closeBtnStyle} aria-label="닫기">×</button>
        </div>

        {/* ── 본문 ───────────────────────── */}
        <div style={bodyStyle}>
          <div style={infoBoxStyle}>
            기존 산출물 파일(요구사항 명세서, 설계 문서 등)을 업로드합니다. 본문 텍스트는 AI 생성 시 입력으로 사용됩니다.
          </div>

          {/* 파일 선택 영역 */}
          <Field label="파일" required>
            {(file || existingFile) ? (
              <FileChip
                file={file || existingFile}
                isExisting={!file && !!existingFile}
                onRemove={() => { setFile(null); }}
                disabled={uploading}
              />
            ) : (
              <DropZone
                dragOver={dragOver}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              disabled={uploading}
            />
          </Field>

          {/* 본문 */}
          <Field label="본문 내용" required>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="파일 본문 또는 요약 내용을 입력하세요. (텍스트 파일은 자동 채워집니다)"
              rows={6}
              disabled={uploading}
              style={textareaStyle}
            />
            <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 4 }}>
              {body.length} 자 · AI 생성 시 이 내용을 입력으로 사용
            </div>
          </Field>

          {/* 비고 */}
          <Field label="비고">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(선택) 작성자, 버전, 출처 등"
              disabled={uploading}
              style={inputStyle}
            />
          </Field>

          {/* 진행률 */}
          {uploading && (
            <div style={{ marginTop: 14 }}>
              <div style={{
                fontSize: 11, color: "var(--c-text-soft)", marginBottom: 6,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>업로드 중...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{
                height: 4, background: "var(--c-bg-mid)", borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${uploadProgress}%`,
                  background: "var(--c-navy-deep)",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div style={errorBoxStyle}>⚠ {error}</div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────── */}
        <div style={footerStyle}>
          <button onClick={onClose} disabled={uploading} style={cancelBtnStyle}>
            취소
          </button>
          <button onClick={handleRegister} disabled={uploading || !file} style={saveBtnStyle}>
            {uploading ? "업로드 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: "var(--c-text)", marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: "var(--c-coral)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function DropZone({ dragOver, onClick, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${dragOver ? "var(--c-navy-deep)" : "var(--c-border-strong)"}`,
        borderRadius: 8,
        padding: "28px 20px",
        background: dragOver ? "rgba(30, 39, 97, 0.06)" : "var(--c-bg-soft)",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📁</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", marginBottom: 4 }}>
        클릭하거나 파일을 드래그하세요
      </div>
      <div style={{ fontSize: 11, color: "var(--c-text-muted)" }}>
        Word, PDF, Excel, 텍스트 등 — 최대 {MAX_SIZE_MB}MB
      </div>
    </div>
  );
}

function FileChip({ file, isExisting, onRemove, disabled }) {
  const sizeKB = (file.size / 1024).toFixed(1);
  const icon = getFileIcon(file.name);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: "rgba(30, 39, 97, 0.05)",
      border: "1px solid var(--c-navy-mid)",
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: "var(--c-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--c-text-muted)", marginTop: 2 }}>
          {file.type || "binary"} · {sizeKB} KB
          {isExisting && " · 이미 업로드됨"}
        </div>
      </div>
      {!isExisting && (
        <button
          onClick={onRemove}
          disabled={disabled}
          style={{
            background: "transparent", border: "none",
            color: "var(--c-text-muted)", cursor: "pointer",
            fontSize: 18, padding: 4,
          }}
          aria-label="제거"
        >
          ×
        </button>
      )}
    </div>
  );
}

function getFileIcon(name = "") {
  const ext = name.toLowerCase().split(".").pop();
  if (["doc", "docx"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽";
  if (["pdf"].includes(ext)) return "📕";
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) return "🖼";
  if (["txt", "md"].includes(ext)) return "📝";
  if (["zip", "tar", "gz"].includes(ext)) return "🗜";
  return "📎";
}

// ── base64 헬퍼 ────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      // data:...;base64,XXXX → XXXX만
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 스타일 ──────────────────────────────────────────────────────
const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: 20,
};
const modalStyle = {
  background: "#fff", borderRadius: 12,
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
const metaLabelStyle = {
  fontSize: 11, color: "var(--c-text-muted)",
  fontWeight: 600, letterSpacing: "0.04em", marginBottom: 4,
};
const titleStyle = { fontSize: 17, fontWeight: 700, margin: 0 };
const closeBtnStyle = {
  background: "transparent", border: "none",
  fontSize: 24, fontWeight: 300,
  color: "var(--c-text-muted)", cursor: "pointer",
  width: 32, height: 32, borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const bodyStyle = {
  padding: "20px 22px", overflowY: "auto", flex: 1,
};
const infoBoxStyle = {
  background: "rgba(30, 39, 97, 0.04)",
  border: "1px solid rgba(30, 39, 97, 0.15)",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 11, color: "var(--c-text-soft)",
  lineHeight: 1.6, marginBottom: 16,
};
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--c-border-strong)",
  borderRadius: 6,
  fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.6,
};
const errorBoxStyle = {
  marginTop: 12, padding: "10px 12px",
  background: "rgba(220, 38, 38, 0.08)",
  border: "1px solid rgba(220, 38, 38, 0.30)",
  borderRadius: 6,
  fontSize: 12, color: "#991B1B",
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
  color: "#fff", border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  fontSize: 12, fontWeight: 600,
  cursor: "pointer",
};

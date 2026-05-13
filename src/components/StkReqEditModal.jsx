// src/components/StkReqEditModal.jsx — Phase 2-2b STEP C-2
//
// STK_REQ 카드별 인라인 편집 모달
// 편집 필드:
//   - statement (영문, IEEE 830 패턴 안내)
//   - rationale (한글)
//   - category (functional/non_functional/interface/constraint)
//   - priority (must/should/could)
//   - verification_method (test/analysis/inspection/demonstration)
//   - source_doc (선택)
//
// 저장 시 onSave(editedReq) 호출 — 부모에서 work_products.content 업데이트

import { useEffect, useState } from "react";

const CATEGORIES = [
  { value: "functional",     label: "Functional (기능)" },
  { value: "non_functional", label: "Non-Functional (비기능)" },
  { value: "interface",      label: "Interface (인터페이스)" },
  { value: "constraint",     label: "Constraint (제약)" },
];

const PRIORITIES = [
  { value: "must",   label: "MUST (필수)" },
  { value: "should", label: "SHOULD (권장)" },
  { value: "could",  label: "COULD (선택)" },
];

const VERIFICATION_METHODS = [
  { value: "test",         label: "Test (시험)" },
  { value: "analysis",     label: "Analysis (분석)" },
  { value: "inspection",   label: "Inspection (검사)" },
  { value: "demonstration", label: "Demonstration (시연)" },
];

export default function StkReqEditModal({ open, onClose, req, onSave }) {
  const [statement, setStatement] = useState("");
  const [rationale, setRationale] = useState("");
  const [category, setCategory] = useState("functional");
  const [priority, setPriority] = useState("must");
  const [verificationMethod, setVerificationMethod] = useState("test");
  const [sourceDoc, setSourceDoc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // req 가 변경되면 폼 초기화
  useEffect(() => {
    if (req) {
      setStatement(req.statement || "");
      setRationale(req.rationale || "");
      setCategory(req.category || "functional");
      setPriority(req.priority || "must");
      setVerificationMethod(req.verification_method || "test");
      setSourceDoc(req.source_doc || "");
      setError("");
    }
  }, [req]);

  if (!open || !req) return null;

  async function handleSubmit() {
    setError("");

    // 검증
    if (!statement.trim()) {
      setError("Statement는 필수 입력입니다.");
      return;
    }
    if (statement.trim().length < 10) {
      setError("Statement가 너무 짧습니다 (최소 10자).");
      return;
    }

    // IEEE 830 패턴 권장 (경고만)
    const ieeePattern = /\b(shall|must|should|will)\b/i;
    if (!ieeePattern.test(statement)) {
      const ok = window.confirm(
        "IEEE 830 권장 패턴: 'The [system] shall [function] [condition] [criteria]'\n\n" +
        "현재 statement에 'shall', 'must', 'should', 'will' 중 하나도 없습니다.\n" +
        "그래도 저장하시겠습니까?"
      );
      if (!ok) return;
    }

    const editedReq = {
      ...req,
      statement: statement.trim(),
      rationale: rationale.trim(),
      category,
      priority,
      verification_method: verificationMethod,
      source_doc: sourceDoc.trim() || req.source_doc,
      modified: true,
      modified_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await onSave(editedReq);
      onClose();
    } catch (e) {
      setError("저장 실패: " + e.message);
    }
    setSaving(false);
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => !saving && onClose()}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 950,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(680px, 95vw)',
          maxHeight: '90vh',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.30)',
          zIndex: 951,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--c-text-muted)',
              letterSpacing: '0.04em', marginBottom: 4,
            }}>
              ✏ STK_REQ 편집
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--c-coral)' }}>{req.id}</span>
              {req.modified && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  marginLeft: 10,
                  padding: '2px 8px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#92400E',
                  border: '1px solid rgba(245, 158, 11, 0.40)',
                  borderRadius: 10,
                }}>
                  이전에 수정됨
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent', border: 'none',
              fontSize: 22, fontWeight: 300,
              color: 'var(--c-text-muted)',
              cursor: saving ? 'not-allowed' : 'pointer',
              width: 32, height: 32, borderRadius: 6,
              opacity: saving ? 0.4 : 1,
            }}
            aria-label="닫기"
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {/* Statement */}
          <Field
            label="Statement"
            required
            hint="영문 IEEE 830 권장: 'The [system] shall [function] [condition] [criteria]'"
          >
            <textarea
              value={statement}
              onChange={e => setStatement(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="The NAD shall ..."
              style={textareaStyle}
            />
            <div style={hintStyle}>
              {statement.length} 문자
            </div>
          </Field>

          {/* Rationale */}
          <Field
            label="Rationale (근거)"
            hint="한글 권장 — 왜 이 요구사항이 필요한지, 어떤 입력 자료에서 도출되었는지"
          >
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="이 요구사항은 ... SOW §2.1 에 명시된 ..."
              style={textareaStyle}
            />
          </Field>

          {/* Category + Priority + Verification */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
          }}>
            <Field label="Category" required>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={saving}
                style={selectStyle}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Priority" required>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                disabled={saving}
                style={selectStyle}
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Verification Method" required>
              <select
                value={verificationMethod}
                onChange={e => setVerificationMethod(e.target.value)}
                disabled={saving}
                style={selectStyle}
              >
                {VERIFICATION_METHODS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Source Doc */}
          <Field
            label="Source Document (참조)"
            hint="입력 자료의 출처 — 예: SOW_Vehicle_NAD_Development_Project.docx §3.1 Connectivity"
          >
            <input
              type="text"
              value={sourceDoc}
              onChange={e => setSourceDoc(e.target.value)}
              disabled={saving}
              placeholder="HW_Requirements §2.1 Cellular Modem"
              style={inputStyle}
            />
          </Field>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.30)',
              borderRadius: 6,
              fontSize: 12, color: '#991B1B',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Info: 편집 후 QA 재검토 권장 */}
          <div style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'rgba(35, 131, 226, 0.06)',
            border: '1px solid rgba(35, 131, 226, 0.25)',
            borderRadius: 6,
            fontSize: 11, color: 'var(--c-navy-deep)', lineHeight: 1.6,
          }}>
            💡 <strong>안내</strong> — 편집 후에는 <strong>[🔍 QA 다시 검토]</strong>를 권장합니다.
            Gemini가 변경 사항을 다시 평가합니다 (5축 가드레일 ④).
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          background: 'var(--c-bg-soft)',
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: '#fff',
              border: '1px solid var(--c-border-strong)',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12, fontWeight: 600,
              color: 'var(--c-text)',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              background: saving ? 'var(--c-bg-mid)' : 'var(--c-navy-deep)',
              color: saving ? 'var(--c-text-muted)' : '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 12, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '저장 중...' : '✓ 저장'}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: 'var(--c-text)',
        marginBottom: 6,
        letterSpacing: '0.02em',
      }}>
        {label}
        {required && <span style={{ color: 'var(--c-coral)', marginLeft: 4 }}>*</span>}
      </div>
      {hint && (
        <div style={{
          fontSize: 10, color: 'var(--c-text-muted)',
          marginBottom: 6, lineHeight: 1.5,
        }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

const textareaStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.6,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
  outline: 'none',
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
  background: '#fff',
  boxSizing: 'border-box',
  cursor: 'pointer',
  outline: 'none',
};

const hintStyle = {
  fontSize: 10,
  color: 'var(--c-text-muted)',
  marginTop: 4,
  textAlign: 'right',
};

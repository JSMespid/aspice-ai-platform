// SCR-01 — 로그인 (사용자 인증 화면)
// 화면설계서 v2.4 슬라이드 9 기반
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const canSubmit = emailValid && passwordValid && !busy;

  async function handleSubmit(e) {
    e?.preventDefault();
    setError("");
    if (!emailValid) { setError("이메일 형식이 올바르지 않습니다."); return; }
    if (!passwordValid) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    setBusy(true);
    // 약간의 지연으로 인증 호출 느낌 — 실제로는 동기
    await new Promise((r) => setTimeout(r, 300));
    const result = login(email, password);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    navigate("/projects", { replace: true });
  }

  function fillDemo(role) {
    if (role === "admin")    { setEmail("admin@aspice.com");    setPassword("demo1234"); }
    if (role === "engineer") { setEmail("engineer@aspice.com"); setPassword("demo1234"); }
    if (role === "reviewer") { setEmail("reviewer@aspice.com"); setPassword("demo1234"); }
    setError("");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0F1838 0%, #1E2761 60%, #3A4B8C 100%)",
      padding: 16,
    }}>
      {/* 좌측 브랜드 패널 */}
      <div style={{
        position: "absolute", top: 32, left: 32,
        color: "#fff", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, background: "#F96167", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 14, color: "#fff",
        }}>A</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>
            ASPICE AI Platform
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
            v3.0 · Anti-Hallucination Edition
          </div>
        </div>
      </div>

      {/* 로그인 카드 — 화면설계서 SCR-01 wireframe */}
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 380,
        background: "#fff",
        borderRadius: 12,
        padding: "36px 32px 28px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
      }}>
        {/* 헤더 — 화면설계서: "ASPICE AI Platform" 텍스트 */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            fontSize: 18, fontWeight: 700, color: "#1E2761",
            letterSpacing: "-0.02em",
            borderBottom: "2px solid #1E2761",
            paddingBottom: 8, display: "inline-block",
          }}>
            ASPICE AI Platform
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>
            사용자 인증 화면 — SCR-01
          </div>
        </div>

        {/* 이메일 필드 */}
        <Field
          label="이메일"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="user@example.com"
          valid={!email || emailValid}
          autoFocus
        />

        {/* 비밀번호 필드 */}
        <Field
          label="비밀번호"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="8자 이상"
          valid={!password || passwordValid}
          hint={password && !passwordValid ? "8자 이상 입력해주세요" : null}
        />

        {/* 에러 메시지 — 화면설계서: 폼 하단, 빨강 */}
        {error && (
          <div style={{
            marginTop: 12, padding: "8px 10px",
            background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 6,
            fontSize: 12, color: "#DC2626",
          }}>
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%", marginTop: 20,
            padding: "12px 16px",
            background: canSubmit ? "#1E2761" : "#9CA3AF",
            color: "#fff", border: "none", borderRadius: 6,
            fontSize: 14, fontWeight: 600, letterSpacing: "0.02em",
            transition: "background 0.15s",
          }}
        >
          {busy ? "인증 중..." : "로그인"}
        </button>

        {/* 데모 계정 안내 */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #E5E9F0" }}>
          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            style={{
              width: "100%", background: "none", border: "none",
              color: "#6B7280", fontSize: 11, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <span>데모 계정 보기</span>
            <span style={{ fontSize: 9 }}>{showHint ? "▼" : "▶"}</span>
          </button>
          {showHint && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <DemoButton label="관리자 (Admin)"     desc="모든 권한"      onClick={() => fillDemo("admin")} />
              <DemoButton label="엔지니어 (Engineer)" desc="생성·수정"     onClick={() => fillDemo("engineer")} />
              <DemoButton label="검토자 (Reviewer)"  desc="승인·반려"     onClick={() => fillDemo("reviewer")} />
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                비밀번호는 모두 <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 3 }}>demo1234</code>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* 푸터 노트 */}
      <div style={{
        position: "absolute", bottom: 24, left: 0, right: 0,
        textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 10,
      }}>
        화면설계서 v2.4 · PAM v4.0 용어 기반 · AI Assistance 확장
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, valid, hint, autoFocus }) {
  const [focus, setFocus] = useState(false);
  const showError = !valid && value;
  const borderColor = showError ? "#DC2626" : focus ? "#1E2761" : "#D5DCE8";
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: "#1A1A2E", marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: "10px 12px",
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          background: "#fff",
          fontSize: 13, outline: "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          boxShadow: focus ? "0 0 0 3px rgba(30, 39, 97, 0.10)" : "none",
        }}
      />
      {hint && (
        <div style={{ fontSize: 10, color: "#DC2626", marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

function DemoButton({ label, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px", background: "#F7F9FC",
        border: "1px solid #E5E9F0", borderRadius: 6,
        fontSize: 11, color: "#1A1A2E", textAlign: "left",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "#E5E9F0"}
      onMouseLeave={(e) => e.currentTarget.style.background = "#F7F9FC"}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#9CA3AF", fontSize: 10 }}>{desc}</span>
    </button>
  );
}

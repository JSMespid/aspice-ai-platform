// 최상단 헤더 (56px 고정) — 로고, 프로젝트명, 사용자
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Header({ project, onLogout }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header style={{
      height: "var(--shell-header-h)",
      background: "#fff",
      borderBottom: "1px solid var(--c-border)",
      display: "flex", alignItems: "center",
      padding: "0 20px",
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* 좌측 — 로고 + 브랜드 */}
      <div onClick={() => navigate("/projects")} style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
      }}>
        <div style={{
          width: 28, height: 28, background: "var(--c-navy-deep)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff",
        }}>A</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--c-navy-deep)", letterSpacing: "-0.01em" }}>
          ASPICE AI Platform
        </div>
      </div>

      {/* 중앙 — 프로젝트 컨텍스트 */}
      {project && (
        <>
          <div style={{
            margin: "0 16px", color: "var(--c-text-muted)", fontSize: 11,
          }}>/</div>
          <button
            onClick={() => navigate("/projects")}
            style={{
              background: "none", border: "none", color: "var(--c-text-soft)",
              fontSize: 12, padding: "4px 8px", borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ← 프로젝트
          </button>
          <div style={{
            margin: "0 8px", color: "var(--c-text-muted)", fontSize: 11,
          }}>/</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)" }}>
            {project.name}
          </div>
        </>
      )}

      {/* 우측 — 사용자 메뉴 */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--c-bg-mid)", color: "var(--c-navy-deep)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700,
        }}>{user?.name?.[0]}</div>
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: 10, color: "var(--c-text-muted)" }}>{user?.role}</div>
        </div>
        <button onClick={onLogout} style={{
          marginLeft: 8, background: "#fff", border: "1px solid var(--c-border-strong)",
          borderRadius: 5, padding: "4px 10px", fontSize: 11, color: "var(--c-text-soft)",
        }}>
          로그아웃
        </button>
      </div>
    </header>
  );
}

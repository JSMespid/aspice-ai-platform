// SCR-04 — 메인 워크스페이스 (3영역 레이아웃)
// 화면설계서 슬라이드 12, 13:
//   ① 상단 워크플로우 (Top Bar) — 60px 고정
//   ② 좌측 사이드바 (Navigation) — 240px 고정
//   ③ 중간 영역 (Data-Driven) — 자유 폭
//
// 진입: /projects/:projectId
// 자식 라우트:
//   /projects/:id/process/:processId  → ProcessScreen
//   /projects/:id/traceability        → TraceabilityScreen
//   /projects/:id/consistency         → ConsistencyScreen
//   /projects/:id/templates           → TemplatesScreen
//   /projects/:id/settings            → SettingsScreen

import { useState, useEffect } from "react";
import { Routes, Route, useParams, useNavigate, Navigate } from "react-router-dom";
import Header from "./Header.jsx";
import TopBar from "./TopBar.jsx";
import Sidebar from "./Sidebar.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import ProcessScreen from "../screens/ProcessScreen.jsx";
import PlaceholderScreen from "../screens/PlaceholderScreen.jsx";

async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

export default function AppShell() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [project, setProject] = useState(null);
  const [workProducts, setWorkProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 현재 활성 프로세스의 상태 (TopBar에 전달)
  const [activeProcessState, setActiveProcessState] = useState("INITIAL");

  useEffect(() => { fetchProjectData(); }, [projectId]);

  async function fetchProjectData() {
    setLoading(true);
    setError("");
    try {
      const projects = await apiCall("/api/projects?resource=projects");
      const p = (Array.isArray(projects) ? projects : []).find(x => String(x.id) === String(projectId));
      if (!p) {
        setError("프로젝트를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }
      setProject(p);

      const wps = await apiCall(`/api/projects?resource=work_products&project_id=${projectId}`);
      const parsed = (Array.isArray(wps) ? wps : []).map(d => ({
        ...d,
        content: typeof d.content === "string" ? safeJSON(d.content) : d.content || {},
        qa_result: d.qa_result ? (typeof d.qa_result === "string" ? safeJSON(d.qa_result) : d.qa_result) : null,
        rationale: d.rationale ? (typeof d.rationale === "string" ? safeJSON(d.rationale) : d.rationale) : null,
        state: d.state || stateFromLegacyStatus(d.status),
      }));
      setWorkProducts(parsed);
    } catch (e) {
      setError("로드 실패: " + e.message);
    }
    setLoading(false);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  if (loading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 12, color: "var(--c-text-muted)", fontSize: 13,
      }}>
        <div style={{
          width: 28, height: 28,
          border: "2px solid var(--c-border)",
          borderTopColor: "var(--c-navy-deep)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        프로젝트 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 18 }}>⚠</div>
        <div style={{ color: "var(--c-sev-critical)", fontSize: 13 }}>{error}</div>
        <button onClick={() => navigate("/projects")} style={{
          background: "var(--c-navy-deep)", color: "#fff", border: "none",
          borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600,
        }}>
          프로젝트 목록으로
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── 최상단 헤더 ──────────────────────────── */}
      <Header project={project} onLogout={handleLogout} />

      {/* ── 본문: 사이드바 + (TopBar + 중간 영역) ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Sidebar workProducts={workProducts} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TopBar currentState={activeProcessState} />

          <main style={{
            flex: 1, overflowY: "auto", overflowX: "hidden",
            background: "var(--c-bg-soft)",
            padding: 24,
          }}>
            <Routes>
              <Route index element={<DefaultLanding project={project} />} />
              <Route path="process/:processId" element={
                <ProcessScreen
                  project={project}
                  workProducts={workProducts}
                  onWorkProductChange={fetchProjectData}
                  onStateChange={setActiveProcessState}
                />
              } />
              <Route path="traceability" element={
                <PlaceholderScreen
                  title="추적성 매트릭스 + 이분 그래프"
                  subtitle="SCR-07 · 화면설계서 슬라이드 19~22"
                  description="Phase 4에서 구현 예정 — 매트릭스 뷰, 이분 그래프 뷰, 연결 상세/추가 모달"
                />
              } />
              <Route path="consistency" element={
                <PlaceholderScreen
                  title="일관성 검증 결과"
                  subtitle="SCR-08 · 화면설계서 슬라이드 23"
                  description="Phase 4 후속에서 구현 예정 — 6개 검증 규칙 (R1~R6) 및 이슈 리스트"
                />
              } />
              <Route path="templates" element={
                <PlaceholderScreen
                  title="템플릿"
                  subtitle="템플릿 미리보기 · 메타 표시"
                  description="추후 구현 예정"
                />
              } />
              <Route path="settings" element={
                <PlaceholderScreen
                  title="설정 — 스키마 정의"
                  subtitle="SCR-06a/b · 화면설계서 슬라이드 17~18"
                  description="Phase 3에서 구현 예정 — 프로세스별 항목 정의/편집"
                />
              } />
              <Route path="*" element={<Navigate to={`/projects/${projectId}`} replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function DefaultLanding({ project }) {
  return (
    <div style={{
      maxWidth: 720, margin: "40px auto",
      background: "#fff", border: "1px solid var(--c-border)",
      borderRadius: 12, padding: 32,
      borderLeft: "4px solid var(--c-coral)",
    }}>
      <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginBottom: 6 }}>
        프로젝트
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--c-navy-deep)", margin: "0 0 8px" }}>
        {project?.name}
      </h1>
      <p style={{ fontSize: 13, color: "var(--c-text-soft)", margin: "0 0 24px", lineHeight: 1.6 }}>
        {project?.description || "설명 없음"}
      </p>
      <div style={{
        background: "var(--c-bg-soft)", borderRadius: 8, padding: 16,
        fontSize: 12, color: "var(--c-text-soft)",
      }}>
        <div style={{ fontWeight: 600, color: "var(--c-text)", marginBottom: 6 }}>
          시작하기
        </div>
        <div>좌측 사이드바에서 SYS 또는 SWE 프로세스를 선택하면 해당 프로세스 화면이 표시됩니다.</div>
        <div style={{ marginTop: 6 }}>
          상단 워크플로우는 선택한 프로세스의 현재 상태(생성 → QA 검토 → 승인)를 보여줍니다.
        </div>
      </div>
    </div>
  );
}

function safeJSON(text) {
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
    return {};
  }
}

function stateFromLegacyStatus(status) {
  if (status === "초안") return "GENERATED";
  if (status === "검토중") return "PENDING_APPROVAL";
  if (status === "승인됨") return "APPROVED";
  return "INITIAL";
}

// 새로운 메인 앱 — 5개 프로세스 통합 화면
// 기존 AspiceApp.jsx의 단일 거대 파일을 분해
import { useState, useEffect, useCallback } from "react";
import { T, GLOBAL_CSS, Card, Btn, Badge, Input, Select, Spinner, EmptyState } from "../components/ui.jsx";
import { ProcessPage } from "../components/ProcessPage.jsx";
import { PROCESS_ORDER, PROCESSES } from "../config/processes.js";
import { STATES } from "../lib/state-machine.js";

const DOMAIN_OPTIONS = ["자동차 부품", "소프트웨어 시스템", "하드웨어 시스템",
                        "임베디드 시스템", "IT 서비스", "항공우주", "의료기기"];

async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

export default function AspiceAppV2() {
  const [page, setPage] = useState("home");
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workProducts, setWorkProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    if (selectedProject) fetchWorkProducts(selectedProject.id);
  }, [selectedProject]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const data = await apiCall("/api/projects?resource=projects");
      setProjects(Array.isArray(data) ? data : []);
    } catch { setProjects([]); }
    setLoading(false);
  }

  async function fetchWorkProducts(projectId) {
    try {
      const data = await apiCall(`/api/projects?resource=work_products&project_id=${projectId}`);
      setWorkProducts(Array.isArray(data) ? data.map(d => ({
        ...d,
        content: typeof d.content === "string" ? safeJSON(d.content) : d.content || {},
        qa_result: d.qa_result ? (typeof d.qa_result === "string" ? safeJSON(d.qa_result) : d.qa_result) : null,
        rationale: d.rationale ? (typeof d.rationale === "string" ? safeJSON(d.rationale) : d.rationale) : null,
        state: d.state || stateFromLegacyStatus(d.status),
      })) : []);
    } catch { setWorkProducts([]); }
  }

  async function saveWorkProduct(wp) {
    await apiCall("/api/projects?resource=work_products", "POST", {
      project_id: selectedProject.id,
      process_id: wp.process_id,
      title: wp.content.title || PROCESSES[wp.process_id].label,
      domain: selectedProject.domain,
      content: JSON.stringify(wp.content),
      qa_result: JSON.stringify(wp.qa_result),
      rationale: JSON.stringify(wp.rationale),
      state: wp.state,
      status: wp.legacy_status,
    });
    await fetchWorkProducts(selectedProject.id);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>
      <style>{GLOBAL_CSS}</style>
      <style>{`
        @media (max-width: 900px) {
          .process-page-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Header
        project={selectedProject}
        onHome={() => { setSelectedProject(null); setSelectedProcessId(null); setPage("home"); }}
      />

      <main style={{ padding: "20px 16px", maxWidth: 1280, margin: "0 auto" }}>
        {!selectedProject ? (
          <ProjectListView
            projects={projects} loading={loading}
            onSelect={p => { setSelectedProject(p); setPage("pipeline"); }}
            onRefresh={fetchProjects}
          />
        ) : !selectedProcessId ? (
          <PipelineOverview
            project={selectedProject}
            workProducts={workProducts}
            onSelectProcess={pid => setSelectedProcessId(pid)}
            onBack={() => setSelectedProject(null)}
          />
        ) : (
          <>
            <BackBar
              onBack={() => setSelectedProcessId(null)}
              label={`← 파이프라인 (${selectedProject.name})`}
            />
            <ProcessPage
              processId={selectedProcessId}
              project={selectedProject}
              prevWorkProducts={workProducts}
              onSave={saveWorkProduct}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Header({ project, onHome }) {
  return (
    <header style={{
      background: "#1F1F1F", color: "#fff",
      padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 16,
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div onClick={onHome} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div style={{
          width: 30, height: 30, background: T.accent, borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
        }}>A</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>
            ASPICE AI Platform
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
            v2.0 — Anti-Hallucination Edition
          </div>
        </div>
      </div>
      {project && (
        <div style={{ marginLeft: 24, padding: "4px 12px",
                      background: "rgba(255,255,255,0.08)", borderRadius: 6,
                      fontSize: 12, color: "#93C5FD" }}>
          {project.name}
        </div>
      )}
      <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        Generator: Claude · Verifier: Gemini · 5-Phase QA · 9-state HITL
      </div>
    </header>
  );
}

function BackBar({ onBack, label }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: T.muted,
        fontSize: 13, cursor: "pointer", padding: 4,
        fontFamily: "inherit",
      }}>
        {label}
      </button>
    </div>
  );
}

// ── 프로젝트 목록 ─────────────────────────────────
function ProjectListView({ projects, loading, onSelect, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", domain: DOMAIN_OPTIONS[0], description: "" });

  async function handleCreate() {
    if (!form.name.trim()) return;
    await apiCall("/api/projects?resource=projects", "POST", form);
    setForm({ name: "", domain: DOMAIN_OPTIONS[0], description: "" });
    setCreating(false);
    onRefresh();
  }

  if (loading) return <Spinner text="프로젝트 로딩 중..." />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>프로젝트</h1>
        <Btn onClick={() => setCreating(true)}>+ 새 프로젝트</Btn>
      </div>

      {creating && (
        <Card style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="프로젝트명" value={form.name}
                   onChange={v => setForm({ ...form, name: v })}
                   placeholder="예: 헤드램프 빔 제어" />
            <Select label="도메인" value={form.domain}
                    onChange={v => setForm({ ...form, domain: v })}
                    options={DOMAIN_OPTIONS} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setCreating(false)}>취소</Btn>
              <Btn onClick={handleCreate} disabled={!form.name.trim()}>생성</Btn>
            </div>
          </div>
        </Card>
      )}

      {projects.length === 0 ? (
        <EmptyState text="프로젝트가 없습니다. 새 프로젝트를 생성하세요." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {projects.map(p => (
            <Card key={p.id} onClick={() => onSelect(p)}
                  style={{ padding: 16, cursor: "pointer" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{p.domain}</div>
              {p.description && (
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.6 }}>{p.description}</div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 파이프라인 개요 (5개 프로세스 카드) ─────────────────
function PipelineOverview({ project, workProducts, onSelectProcess, onBack }) {
  return (
    <div>
      <BackBar onBack={onBack} label="← 프로젝트 목록" />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{project.name}</h1>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
        {project.domain} · SYS.1 → SYS.2 → SYS.3 → SYS.4 → SYS.5 파이프라인
      </p>

      {/* 흐름 시각화 */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, overflowX: "auto" }}>
        {PROCESS_ORDER.map((pid, idx) => {
          const config = PROCESSES[pid];
          const wp = workProducts.find(w => w.process_id === pid);
          const approved = wp?.state === "APPROVED";
          return (
            <div key={pid} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <div style={{ textAlign: "center", width: 80 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: approved ? config.color : "transparent",
                  border: `2px solid ${wp ? config.color : T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700,
                  color: approved ? "#fff" : (wp ? config.color : T.muted),
                  margin: "0 auto 6px",
                }}>
                  {approved ? "✓" : config.icon}
                </div>
                <div style={{ fontSize: 11, color: wp ? config.color : T.muted, fontWeight: 600 }}>
                  {pid}
                </div>
              </div>
              {idx < PROCESS_ORDER.length - 1 && (
                <div style={{ width: 32 }}>
                  <div style={{ height: 2, background: workProducts.find(w => w.process_id === PROCESS_ORDER[idx]) ? config.color : T.border }} />
                  <div style={{ fontSize: 9, color: T.muted, textAlign: "center", marginTop: 4 }}>OUT→IN</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 5개 프로세스 카드 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PROCESS_ORDER.map(pid => {
          const config = PROCESSES[pid];
          const wp = workProducts.find(w => w.process_id === pid);
          const state = wp?.state || "INITIAL";
          const stateDef = STATES[state];
          const idx = PROCESS_ORDER.indexOf(pid);
          const prevId = idx > 0 ? PROCESS_ORDER[idx - 1] : null;
          const prevApproved = !prevId || workProducts.find(w => w.process_id === prevId)?.state === "APPROVED";

          return (
            <Card key={pid}
                  onClick={() => onSelectProcess(pid)}
                  style={{ padding: 0, overflow: "hidden", cursor: "pointer",
                           border: `1px solid ${wp ? config.color + "40" : T.border}` }}>
              <div style={{
                padding: "14px 18px",
                background: wp ? config.color + "08" : "transparent",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: config.color + "15", color: config.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>{config.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: config.color }}>
                    {config.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                    {config.desc}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  {wp && (
                    <div style={{
                      fontSize: 10, fontWeight: 600,
                      color: stateDef.color, padding: "3px 10px",
                      background: stateDef.color + "15", borderRadius: 12,
                      border: `1px solid ${stateDef.color}40`,
                    }}>
                      {stateDef.label}
                    </div>
                  )}
                  {!prevApproved && idx > 0 && (
                    <div style={{ fontSize: 9, color: T.amber }}>
                      ← {prevId} 승인 필요
                    </div>
                  )}
                  {wp && config.summary && (
                    <div style={{ fontSize: 10, color: T.muted }}>
                      {config.summary(wp.content)}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── 헬퍼 ───────────────────────────────────────────
function safeJSON(text) {
  try { return JSON.parse(text); }
  catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
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

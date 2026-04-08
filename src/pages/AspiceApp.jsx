import { useState, useEffect, useCallback } from "react";
import {
  T, GLOBAL_CSS, Card, Btn, Badge, Input, Select,
  Textarea, Spinner, EmptyState, StatusBadge, SeverityBadge,
} from "../components/ui.jsx";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const PROCESSES = [
  { id: "SYS.1", label: "SYS.1 — Stakeholder Requirements", short: "STK-REQ", color: T.accent, icon: "①",
    desc: "이해관계자 니즈를 수집하여 요구사항으로 정의합니다.",
    inputLabel: "프로젝트 배경 / 이해관계자 니즈",
    inputPlaceholder: "예: 전방 카메라 기반 자동 하이빔 제어\n이해관계자: 운전자, OEM, 법규 기관\n주요 요구: 야간 가시성 확보, 눈부심 방지",
    outputSummary: (c) => `Needs ${c?.summary?.total_needs ?? "?"}개 · Requirements ${c?.summary?.total_requirements ?? "?"}개`,
  },
  { id: "SYS.2", label: "SYS.2 — System Requirements", short: "SYS-REQ", color: T.purple, icon: "②",
    desc: "STK-REQ를 시스템 요구사항과 검증 기준으로 변환합니다. (SYS.1 OUT → SYS.2 IN)",
    inputLabel: "이전 단계 산출물 (SYS.1 자동 주입) + 추가 기술 맥락",
    inputPlaceholder: "SYS.1 산출물이 자동으로 주입됩니다.\n추가 기술 제약이 있으면 입력하세요.",
    outputSummary: (c) => `Functional ${c?.summary?.total_functional ?? "?"}개 · VC ${c?.summary?.total_vc ?? "?"}개`,
  },
  { id: "SYS.3", label: "SYS.3 — System Architecture", short: "Architecture", color: T.teal, icon: "③",
    desc: "SYS-REQ를 시스템 요소에 할당하고 아키텍처를 설계합니다. (SYS.2 OUT → SYS.3 IN)",
    inputLabel: "이전 단계 산출물 (SYS.2 자동 주입) + 아키텍처 제약",
    inputPlaceholder: "SYS.2 산출물이 자동으로 주입됩니다.\n하드웨어 제약, 플랫폼 정보 등을 입력하세요.",
    outputSummary: (c) => `Elements ${c?.summary?.total_elements ?? "?"}개 · Interfaces ${c?.summary?.total_interfaces ?? "?"}개`,
  },
  { id: "SYS.4", label: "SYS.4 — System Integration Test", short: "Integration", color: T.amber, icon: "④",
    desc: "시스템 요소를 통합하고 인터페이스를 검증합니다. (SYS.3 OUT → SYS.4 IN)",
    inputLabel: "이전 단계 산출물 (SYS.3 자동 주입) + 테스트 환경",
    inputPlaceholder: "SYS.3 산출물이 자동으로 주입됩니다.\n테스트 환경, 장비 정보를 입력하세요.",
    outputSummary: (c) => `Test Cases ${c?.test_cases?.length ?? "?"}개`,
  },
  { id: "SYS.5", label: "SYS.5 — System Qualification Test", short: "Qualification", color: T.green, icon: "⑤",
    desc: "시스템이 요구사항을 만족하는지 최종 검증합니다. (SYS.2+SYS.3 OUT → SYS.5 IN)",
    inputLabel: "이전 단계 산출물 (SYS.2+SYS.3 자동 주입) + 검증 기준",
    inputPlaceholder: "SYS.2, SYS.3 산출물이 자동으로 주입됩니다.\n검증 환경, 법규 기준을 입력하세요.",
    outputSummary: (c) => `Test Cases ${c?.summary?.total_test_cases ?? "?"}개`,
  },
];

const DOMAIN_OPTIONS = ["자동차 부품", "소프트웨어 시스템", "하드웨어 시스템", "임베디드 시스템", "IT 서비스", "항공우주", "의료기기"];

// ── API 헬퍼 ─────────────────────────────────────────────────────────────────
async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function callClaude(systemMsg, userMsg, maxTokens = 5000) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemMsg,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json[\s\S]*?```|```/g, "").trim());
}

// ── 산출물 생성 프롬프트 ─────────────────────────────────────────────────────
async function generateWorkProduct(processId, context, projectInfo, prevContents) {
  const SYS_BASE = `당신은 ASPICE 4.0 전문가입니다. 반드시 유효한 JSON만 응답하세요. 마크다운, 설명, 전문어 없이 JSON만 출력하세요.`;
  const prev = (key) => prevContents[key] ? `\n\n[이전 단계 산출물]\n${JSON.stringify(prevContents[key], null, 2)}` : "";

  const prompts = {
    "SYS.1": {
      system: SYS_BASE,
      user: `프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
컨텍스트: ${context}

다음 JSON 구조로 Stakeholder Requirements 산출물을 생성하세요:
{
  "process": "SYS.1",
  "title": "Stakeholder Requirements Specification",
  "needs": [{"id":"N-001","description":"string","source":"string"}],
  "requirements": [
    {"id":"STK-REQ-001","title":"string","description":"string","source_needs":["N-001"],"priority":"High|Medium|Low","acceptance_criteria":"string","stability":"Stable|Volatile"}
  ],
  "traceability": [{"need_id":"N-001","req_id":"STK-REQ-001","relation":"SATISFIES"}],
  "summary": {"total_needs":0,"total_requirements":0,"high_priority":0}
}`,
    },
    "SYS.2": {
      system: SYS_BASE,
      user: `프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.1")}

위의 SYS.1 Stakeholder Requirements를 바탕으로 다음 JSON 구조로 System Requirements + Verification Criteria를 생성하세요:
{
  "process": "SYS.2",
  "title": "System Requirements Specification",
  "requirements": [
    {"id":"SYS-REQ-F-001","title":"string","description":"string","type":"Functional|Non-functional","source_stk_req":["STK-REQ-001"],"priority":"High|Medium|Low","allocated_to":["SE-001"],"relation_type":"REFINES|DERIVES"}
  ],
  "verification_criteria": [
    {"id":"VC-001","req_id":"SYS-REQ-F-001","method":"Test|Analysis|Inspection|Demonstration","acceptance_criteria":"string","test_level":"System"}
  ],
  "traceability": [{"from":"STK-REQ-001","to":"SYS-REQ-F-001","type":"REFINES"}],
  "summary": {"total_functional":0,"total_nonfunctional":0,"total_vc":0}
}`,
    },
    "SYS.3": {
      system: SYS_BASE,
      user: `프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.2")}

위의 SYS.2 System Requirements를 바탕으로 다음 JSON 구조로 System Architecture를 생성하세요:
{
  "process": "SYS.3",
  "title": "System Architectural Design",
  "system_elements": [
    {"id":"SE-001","name":"string","type":"HW|SW|Mechanical|Electrical","description":"string","allocated_requirements":["SYS-REQ-F-001"],"interfaces":["IF-001"]}
  ],
  "interfaces": [
    {"id":"IF-001","name":"string","source":"SE-001","target":"SE-002","type":"Data|Control|Power","protocol":"string","specification":"string"}
  ],
  "allocation_matrix": [{"req_id":"SYS-REQ-F-001","element_id":"SE-001","rationale":"string"}],
  "integration_strategy": {"approach":"Bottom-up|Top-down|Sandwich","phases":["string"]},
  "summary": {"total_elements":0,"total_interfaces":0}
}`,
    },
    "SYS.4": {
      system: SYS_BASE,
      user: `프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.3")}

위의 SYS.3 Architecture를 바탕으로 다음 JSON 구조로 System Integration Test를 생성하세요:
{
  "process": "SYS.4",
  "title": "System Integration Test Specification",
  "integration_strategy": {
    "approach":"Bottom-up","phases":[{"phase":"Phase 1","description":"string","elements":["SE-001","SE-002"],"interface_verified":"IF-001"}]
  },
  "test_cases": [
    {
      "id":"ITC-001","title":"string","objective":"string",
      "primary_target":{"interface_id":"IF-001","description":"string"},
      "integrated_elements":["SE-001","SE-002"],
      "related_sys_req":["SYS-REQ-F-001"],
      "precondition":"string",
      "test_steps":["string"],
      "expected_result":"string",
      "pass_criteria":"string"
    }
  ],
  "traceability": [{"test_id":"ITC-001","primary_interface":"IF-001","elements":["SE-001","SE-002"],"indirect_req":"SYS-REQ-F-001"}],
  "summary": {"total_test_cases":0,"total_interfaces_covered":0}
}`,
    },
    "SYS.5": {
      system: SYS_BASE,
      user: `프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.2")}${prev("SYS.3")}

위의 SYS.2 + SYS.3 산출물을 바탕으로 다음 JSON 구조로 System Qualification Test를 생성하세요:
{
  "process": "SYS.5",
  "title": "System Qualification Test Specification",
  "test_cases": [
    {
      "id":"STC-001","title":"string","objective":"string",
      "system_requirements":["SYS-REQ-F-001"],
      "reference_stk_req":["STK-REQ-001"],
      "verification_criteria":["VC-001"],
      "test_environment":"string",
      "test_steps":["string"],
      "expected_result":"string",
      "pass_criteria":"string",
      "test_type":"Functional|Performance|Safety|Regulatory"
    }
  ],
  "traceability": [{"test_id":"STC-001","primary_req":"SYS-REQ-F-001","vc":"VC-001","reference_stk":"STK-REQ-001"}],
  "coverage_analysis": {"sys_req_covered":"string","vc_covered":"string"},
  "summary": {"total_test_cases":0}
}`,
    },
  };

  const p = prompts[processId];
  return await callClaude(p.system, p.user);
}

async function runQACheck(workProduct) {
  return await callClaude(
    `당신은 ASPICE 4.0 QA 전문가입니다. 산출물의 품질을 검증하고 반드시 JSON만 응답하세요.`,
    `다음 산출물을 검증하고 이슈를 식별하세요:\n${JSON.stringify(workProduct, null, 2)}\n\n다음 JSON 구조로 응답:\n{"overall_score":85,"completeness":{"score":90,"issues":[]},"consistency":{"score":80,"issues":[]},"traceability":{"score":85,"issues":[]},"issues":[{"id":"QA-001","severity":"Critical|Major|Minor|Info","category":"Completeness|Consistency|Traceability|Verifiability|Structure","description":"string","location":"string","recommendation":"string"}],"summary":{"total_issues":0,"critical":0,"major":0,"minor":0,"info":0},"recommendation":"승인 권장|수정 후 재검토|반려"}`
  );
}

// ── 다운로드 유틸 ─────────────────────────────────────────────────────────────
function downloadJSON(content, filename) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(content, project, processInfo) {
  const proc = processInfo;
  const lines = [
    `# ${content.title || proc.label}`,
    ``,
    `> **프로젝트**: ${project.name}  `,
    `> **도메인**: ${project.domain}  `,
    `> **프로세스**: ${proc.id} — ${proc.short}  `,
    `> **생성일**: ${new Date().toLocaleDateString("ko-KR")}`,
    ``,
    `---`,
    ``,
  ];

  // 각 섹션별 마크다운 변환
  const renderSection = (title, items, fields) => {
    if (!items?.length) return [];
    const out = [`## ${title}`, ``];
    items.forEach((item, i) => {
      out.push(`### ${i + 1}. ${item.id || ""} ${item.title || item.name || item.description?.slice(0, 40) || ""}`);
      fields.forEach(f => {
        if (item[f] !== undefined) {
          const val = Array.isArray(item[f]) ? item[f].join(", ") : String(item[f]);
          out.push(`- **${f}**: ${val}`);
        }
      });
      out.push(``);
    });
    return out;
  };

  if (content.needs) lines.push(...renderSection("Needs", content.needs, ["id", "description", "source"]));
  if (content.requirements) lines.push(...renderSection("Requirements", content.requirements, ["id", "title", "description", "type", "priority", "source_stk_req", "acceptance_criteria", "stability"]));
  if (content.verification_criteria) lines.push(...renderSection("Verification Criteria", content.verification_criteria, ["id", "req_id", "method", "acceptance_criteria", "test_level"]));
  if (content.system_elements) lines.push(...renderSection("System Elements", content.system_elements, ["id", "name", "type", "description", "allocated_requirements", "interfaces"]));
  if (content.interfaces) lines.push(...renderSection("Interfaces", content.interfaces, ["id", "name", "source", "target", "type", "protocol", "specification"]));
  if (content.test_cases) lines.push(...renderSection("Test Cases", content.test_cases, ["id", "title", "objective", "system_requirements", "test_type", "test_environment", "pass_criteria"]));
  if (content.traceability) lines.push(...renderSection("Traceability", content.traceability, Object.keys(content.traceability[0] || {})));
  if (content.summary) {
    lines.push(`## Summary`, ``);
    Object.entries(content.summary).forEach(([k, v]) => lines.push(`- **${k}**: ${v}`));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${project.name}_${proc.id}_${proc.short}.md`; a.click();
  URL.revokeObjectURL(url);
}

function downloadAllMarkdown(workProducts, project) {
  const lines = [
    `# ASPICE 산출물 패키지`,
    ``,
    `> **프로젝트**: ${project.name}  `,
    `> **도메인**: ${project.domain}  `,
    `> **산출물 수**: ${workProducts.length}개  `,
    `> **생성일**: ${new Date().toLocaleDateString("ko-KR")}`,
    ``,
    `---`,
    ``,
  ];
  workProducts.forEach(wp => {
    const proc = PROCESSES.find(p => p.id === wp.process_id);
    const content = wp.content || {};
    lines.push(`# ${proc?.id} — ${content.title || proc?.short}`);
    lines.push(``, `---`, ``);

    const renderSection = (title, items, fields) => {
      if (!items?.length) return;
      lines.push(`## ${title}`, ``);
      items.forEach((item, i) => {
        lines.push(`### ${i + 1}. ${item.id || ""} ${item.title || item.name || item.description?.slice(0, 40) || ""}`);
        fields.forEach(f => {
          if (item[f] !== undefined) {
            const val = Array.isArray(item[f]) ? item[f].join(", ") : String(item[f]);
            lines.push(`- **${f}**: ${val}`);
          }
        });
        lines.push(``);
      });
    };

    if (content.needs) renderSection("Needs", content.needs, ["id", "description", "source"]);
    if (content.requirements) renderSection("Requirements", content.requirements, ["id", "title", "description", "type", "priority", "acceptance_criteria"]);
    if (content.verification_criteria) renderSection("Verification Criteria", content.verification_criteria, ["id", "req_id", "method", "acceptance_criteria"]);
    if (content.system_elements) renderSection("System Elements", content.system_elements, ["id", "name", "type", "description", "allocated_requirements"]);
    if (content.interfaces) renderSection("Interfaces", content.interfaces, ["id", "name", "source", "target", "protocol"]);
    if (content.test_cases) renderSection("Test Cases", content.test_cases, ["id", "title", "objective", "pass_criteria", "test_type"]);
    if (content.summary) {
      lines.push(`## Summary`, ``);
      Object.entries(content.summary).forEach(([k, v]) => lines.push(`- **${k}**: ${v}`));
      lines.push(``);
    }
    lines.push(``, `---`, ``);
  });

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${project.name}_ASPICE_전체산출물.md`; a.click();
  URL.revokeObjectURL(url);
}

// ── 메인 앱 ───────────────────────────────────────────────────────────────────
export default function AspiceApp() {
  const [page, setPage] = useState("home");
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workProducts, setWorkProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const navItems = [
    { id: "home", label: "프로젝트 목록", icon: "⊞" },
    ...(selectedProject ? [
      { id: "pipeline", label: "파이프라인", icon: "⇒" },
      { id: "review", label: "HITL 검토", icon: "◎" },
      { id: "traceability", label: "추적성 분석", icon: "⇌" },
    ] : []),
  ];

  const nav = useCallback((p, proj = undefined) => {
    setPage(p);
    if (proj !== undefined) setSelectedProject(proj);
    setMenuOpen(false);
  }, []);

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
        content: typeof d.content === "string" ? JSON.parse(d.content || "{}") : d.content || {},
        qa_result: d.qa_result ? (typeof d.qa_result === "string" ? JSON.parse(d.qa_result) : d.qa_result) : null,
      })) : []);
    } catch { setWorkProducts([]); }
  }

  const onRefreshWPs = () => selectedProject && fetchWorkProducts(selectedProject.id);

  const pages = {
    home: <ProjectListPage
      projects={projects} loading={loading}
      onSelect={(proj) => { setSelectedProject(proj); setWorkProducts([]); nav("pipeline"); }}
      onRefresh={fetchProjects}
    />,
    pipeline: selectedProject ? <PipelinePage
      project={selectedProject} workProducts={workProducts}
      onRefresh={onRefreshWPs} nav={nav}
    /> : null,
    review: selectedProject ? <ReviewPage
      project={selectedProject} wps={workProducts}
      onUpdate={onRefreshWPs} nav={nav}
    /> : null,
    traceability: selectedProject ? <TraceabilityPage
      project={selectedProject} wps={workProducts}
    /> : null,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: T.bg, color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* 모바일 헤더 */}
      <div className="mob-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: T.surface, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <Logo onClick={() => nav("home", null)} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowGuide(true)} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 12, cursor: "pointer", padding: "4px 10px" }}>?</button>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer" }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="mob-menu" style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "8px 12px", zIndex: 99 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => nav(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%", background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: "none", cursor: "pointer", fontSize: 14, fontWeight: page === item.id ? 600 : 400, marginBottom: 4, fontFamily: "inherit" }}>
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        {/* PC 사이드바 */}
        <aside className="sidebar" style={{ display: "none", width: 230, background: T.surface, borderRight: `1px solid ${T.border}`, flexDirection: "column", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "0 20px 20px", borderBottom: `1px solid ${T.border}` }}>
            <Logo onClick={() => nav("home", null)} />
          </div>
          {selectedProject && (
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, background: T.accentGlow }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>현재 프로젝트</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProject.name}</div>
            </div>
          )}
          <nav style={{ padding: "14px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => nav(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: page === item.id ? `1px solid ${T.accentDim}` : "1px solid transparent", cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 600 : 400, fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all .15s" }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => setShowGuide(true)} style={{ width: "100%", padding: "8px 12px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
              📖 사용 가이드
            </button>
          </div>
        </aside>

        <main className="main-pad" style={{ flex: 1, overflow: "auto", padding: "20px 16px", animation: "fadeIn .3s ease" }}>
          {pages[page] || pages.home}
        </main>
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function Logo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div style={{ width: 34, height: 34, background: `linear-gradient(135deg,${T.accent},${T.purple})`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>A</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>ASPICE AI</div>
        <div style={{ fontSize: 10, color: T.muted }}>v2.0 · SYS.1~SYS.5 Pipeline</div>
      </div>
    </div>
  );
}

// ── 사용 가이드 모달 ─────────────────────────────────────────────────────────
function GuideModal({ onClose }) {
  const steps = [
    { icon: "①", color: T.accent, title: "프로젝트 생성", desc: "홈에서 [+ 새 프로젝트]를 클릭해 프로젝트명·도메인·설명을 입력합니다." },
    { icon: "②", color: T.purple, title: "SYS.1 생성 (파이프라인 시작)", desc: "파이프라인 탭에서 SYS.1 카드의 [생성] 버튼을 누릅니다. 프로젝트 배경과 이해관계자 니즈를 입력하면 AI가 Stakeholder Requirements를 자동 생성합니다." },
    { icon: "③", color: T.teal, title: "SYS.2~5 순차 생성 (IN→OUT→IN→OUT)", desc: "이전 단계 산출물이 자동으로 다음 단계에 주입됩니다. 각 단계에서 [생성] 버튼을 누르면 됩니다. 추가 맥락은 선택 입력입니다." },
    { icon: "④", color: T.amber, title: "QA 검증 & 승인", desc: "HITL 검토 탭에서 산출물을 선택 → [QA 검증 실행]으로 AI가 품질을 점검합니다. 검토 후 [승인] 또는 [거부]를 결정합니다." },
    { icon: "⑤", color: T.green, title: "다운로드", desc: "파이프라인 또는 상세 뷰에서 [Markdown 다운로드] 또는 [JSON 다운로드]로 개별 산출물을 저장합니다. [전체 다운로드]로 모든 산출물을 한 번에 내보낼 수 있습니다." },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 32, maxWidth: 580, width: "100%", maxHeight: "90vh", overflowY: "auto", animation: "fadeIn .25s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📖 사용 가이드</h2>
            <p style={{ fontSize: 12, color: T.muted }}>ASPICE AI Platform — 5단계로 완성하는 ASPICE 산출물</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: T.bg, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + "20", border: `1px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: s.color, fontWeight: 800, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: s.color }}>{s.title}</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 16px", background: T.accentGlow, border: `1px solid ${T.accentDim}`, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 6 }}>💡 파이프라인 핵심 원리</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
            <span style={{ color: T.accent }}>SYS.1 OUT</span> → <span style={{ color: T.purple }}>SYS.2 IN</span> → <span style={{ color: T.purple }}>SYS.2 OUT</span> → <span style={{ color: T.teal }}>SYS.3 IN</span> → <span style={{ color: T.teal }}>SYS.3 OUT</span> → <span style={{ color: T.amber }}>SYS.4 IN</span><br />
            각 단계 산출물이 자동으로 다음 단계의 입력이 됩니다. ASPICE V-Model 추적성이 자동 유지됩니다.
          </div>
        </div>

        <Btn onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>시작하기 →</Btn>
      </div>
    </div>
  );
}

// ── 프로젝트 목록 페이지 ─────────────────────────────────────────────────────
function ProjectListPage({ projects, loading, onSelect, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "자동차 부품", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!form.name.trim()) { setError("프로젝트명을 입력하세요."); return; }
    setSaving(true); setError("");
    try {
      await apiCall("/api/projects?resource=projects", "POST", { ...form, status: "active" });
      await onRefresh();
      setCreating(false);
      setForm({ name: "", domain: "자동차 부품", description: "" });
    } catch (e) { setError("생성 실패: " + e.message); }
    setSaving(false);
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm("프로젝트와 모든 산출물을 삭제합니다. 계속할까요?")) return;
    await apiCall(`/api/projects?resource=projects&id=${id}`, "DELETE");
    await onRefresh();
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>ASPICE 프로젝트</h1>
          <p style={{ color: T.muted, fontSize: 13 }}>프로젝트를 생성하고 SYS.1~SYS.5 산출물을 파이프라인으로 자동 생성합니다.</p>
        </div>
        <Btn onClick={() => setCreating(true)}>+ 새 프로젝트</Btn>
      </div>

      {/* 프로젝트 생성 폼 */}
      {creating && (
        <Card style={{ padding: 24, marginBottom: 24, border: `1px solid ${T.accent}` }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: T.accent }}>새 프로젝트 생성</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="프로젝트명" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="예: 헤드램프 제어 시스템 개발" required />
            <Select label="도메인" value={form.domain} onChange={v => setForm(f => ({ ...f, domain: v }))} options={DOMAIN_OPTIONS} />
            <Textarea label="프로젝트 설명 (선택)" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="프로젝트의 목적과 범위를 설명하세요." rows={3} />
            {error && <div style={{ color: T.red, fontSize: 12, padding: "8px 12px", background: T.redDim, borderRadius: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setCreating(false); setError(""); }}>취소</Btn>
              <Btn onClick={handleCreate} disabled={saving}>{saving ? "생성 중…" : "프로젝트 생성"}</Btn>
            </div>
          </div>
        </Card>
      )}

      {loading ? <Spinner text="프로젝트 불러오는 중…" /> :
        projects.length === 0 ? (
          <EmptyState icon="◈" title="프로젝트가 없습니다" desc="ASPICE 산출물을 관리할 프로젝트를 먼저 생성하세요."
            action={<Btn onClick={() => setCreating(true)}>첫 프로젝트 만들기</Btn>} />
        ) : (
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            {projects.map(proj => (
              <ProjectCard key={proj.id} project={proj} onClick={() => onSelect(proj)} onDelete={(e) => handleDelete(proj.id, e)} />
            ))}
          </div>
        )}
    </div>
  );
}

function ProjectCard({ project, onClick, onDelete }) {
  const [hov, setHov] = useState(false);
  const created = project.created_at ? new Date(project.created_at).toLocaleDateString("ko-KR") : "";

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: "20px 22px", background: T.surface, border: `1px solid ${hov ? T.accent : T.border}`, borderRadius: 14, cursor: "pointer", transition: "all .2s", boxShadow: hov ? `0 0 24px ${T.accentGlow}` : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
          {project.description && <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project.description}</div>}
        </div>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 6, flexShrink: 0, marginLeft: 10 }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge color={T.accent}>{project.domain}</Badge>
        <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>{created}</span>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>파이프라인 열기 →</span>
      </div>
    </div>
  );
}

// ── 파이프라인 페이지 ─────────────────────────────────────────────────────────
function PipelinePage({ project, workProducts, onRefresh, nav }) {
  const [activeProcess, setActiveProcess] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [viewingWP, setViewingWP] = useState(null);
  const [error, setError] = useState("");
  const [contextInputs, setContextInputs] = useState({});

  // 각 프로세스별 기존 산출물
  const wpByProcess = {};
  PROCESSES.forEach(p => {
    wpByProcess[p.id] = workProducts.filter(w => w.process_id === p.id);
  });

  // 이전 단계 content를 자동 수집 (파이프라인 주입용)
  function buildPrevContents(processId) {
    const prevContents = {};
    const idx = PROCESSES.findIndex(p => p.id === processId);
    for (let i = 0; i < idx; i++) {
      const prevId = PROCESSES[i].id;
      const prevWPs = wpByProcess[prevId];
      if (prevWPs?.length) prevContents[prevId] = prevWPs[prevWPs.length - 1].content;
    }
    return prevContents;
  }

  async function handleGenerate(processId) {
    setGeneratingId(processId); setGenerating(true); setError("");
    try {
      const proc = PROCESSES.find(p => p.id === processId);
      const prevContents = buildPrevContents(processId);
      const context = contextInputs[processId] || "";
      const result = await generateWorkProduct(processId, context, project, prevContents);

      await apiCall("/api/projects?resource=work_products", "POST", {
        project_id: project.id,
        process_id: processId,
        title: result.title || proc.label,
        domain: project.domain,
        content: JSON.stringify(result),
        status: "초안",
        created_at: new Date().toISOString(),
      });
      await onRefresh();
      setActiveProcess(null);
    } catch (e) { setError(`[${processId}] 생성 실패: ${e.message}`); }
    setGenerating(false); setGeneratingId(null);
  }

  async function handleDelete(wpId) {
    if (!confirm("이 산출물을 삭제합니까?")) return;
    await apiCall(`/api/projects?resource=work_products&id=${wpId}`, "DELETE");
    await onRefresh();
  }

  const allWPs = workProducts;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button onClick={() => nav("home")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>←</button>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</h1>
          </div>
          <p style={{ color: T.muted, fontSize: 12, paddingLeft: 28 }}>{project.domain} · SYS.1~SYS.5 파이프라인</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {allWPs.length > 0 && (
            <>
              <Btn variant="outline" size="sm" onClick={() => downloadAllMarkdown(allWPs, project)}>⬇ 전체 다운로드</Btn>
              <Btn variant="ghost" size="sm" onClick={() => downloadJSON(allWPs.map(w => ({ process: w.process_id, ...w.content })), `${project.name}_all.json`)}>JSON</Btn>
            </>
          )}
        </div>
      </div>

      {/* 파이프라인 흐름 표시 */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, overflowX: "auto", paddingBottom: 8 }}>
        {PROCESSES.map((proc, idx) => {
          const wps = wpByProcess[proc.id];
          const done = wps?.length > 0;
          return (
            <div key={proc.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <div style={{ textAlign: "center", width: 72 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: done ? proc.color : T.surface, border: `2px solid ${done ? proc.color : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: done ? "#fff" : T.muted, margin: "0 auto 6px" }}>
                  {done ? "✓" : proc.icon}
                </div>
                <div style={{ fontSize: 10, color: done ? proc.color : T.muted, fontWeight: done ? 700 : 400 }}>{proc.id}</div>
              </div>
              {idx < PROCESSES.length - 1 && (
                <div style={{ width: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", height: 2, background: wps?.length > 0 ? proc.color : T.border, transition: "background .3s" }} />
                  <div style={{ fontSize: 9, color: T.muted }}>OUT→IN</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: T.red, fontSize: 12, padding: "10px 14px", background: T.redDim, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {/* 프로세스 카드들 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PROCESSES.map((proc, idx) => {
          const wps = wpByProcess[proc.id];
          const hasPrev = idx === 0 || wpByProcess[PROCESSES[idx - 1].id]?.length > 0;
          const isActive = activeProcess === proc.id;
          const isGenerating = generatingId === proc.id && generating;
          const latestWP = wps?.[wps.length - 1];

          return (
            <Card key={proc.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${wps?.length ? proc.color + "44" : T.border}` }}>
              {/* 카드 헤더 */}
              <div style={{ padding: "16px 20px", background: wps?.length ? proc.color + "0D" : "transparent", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: proc.color + "20", border: `1px solid ${proc.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: proc.color, flexShrink: 0 }}>{proc.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: proc.color }}>{proc.label}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{proc.desc}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {wps?.length > 0 && <Badge color={proc.color}>{wps.length}개 생성됨</Badge>}
                  {!hasPrev && idx > 0 && <Badge color={T.muted}>이전 단계 필요</Badge>}
                </div>
              </div>

              {/* 기존 산출물 목록 */}
              {wps?.length > 0 && (
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                  {wps.map(wp => (
                    <div key={wp.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wp.content?.title || proc.label}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{proc.outputSummary(wp.content)}</div>
                      </div>
                      <StatusBadge status={wp.status} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" variant="ghost" onClick={() => setViewingWP({ wp, proc })}>보기</Btn>
                        <Btn size="sm" variant="outline" onClick={() => downloadMarkdown(wp.content, project, proc)}>⬇ MD</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => downloadJSON(wp.content, `${project.name}_${proc.id}.json`)}>JSON</Btn>
                        <Btn size="sm" variant="ghost" style={{ color: T.red }} onClick={() => handleDelete(wp.id)}>✕</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 생성 영역 */}
              <div style={{ padding: "14px 20px" }}>
                {isActive ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {idx > 0 && (
                      <div style={{ padding: "8px 12px", background: proc.color + "10", border: `1px solid ${proc.color}30`, borderRadius: 8, fontSize: 11, color: T.muted }}>
                        ⟳ <strong style={{ color: proc.color }}>이전 단계 산출물 자동 주입됨</strong> — 추가 맥락만 입력하세요.
                      </div>
                    )}
                    <Textarea
                      label={proc.inputLabel}
                      value={contextInputs[proc.id] || ""}
                      onChange={v => setContextInputs(c => ({ ...c, [proc.id]: v }))}
                      placeholder={proc.inputPlaceholder}
                      rows={4}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" onClick={() => setActiveProcess(null)}>취소</Btn>
                      <Btn onClick={() => handleGenerate(proc.id)} disabled={isGenerating || !hasPrev}>
                        {isGenerating ? "생성 중…" : `⚡ ${proc.id} AI 생성`}
                      </Btn>
                    </div>
                    {isGenerating && <Spinner text={`${proc.id} 산출물 AI 생성 중…`} />}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn
                      size="sm"
                      onClick={() => setActiveProcess(proc.id)}
                      disabled={!hasPrev || (generatingId !== null)}
                      style={{ background: proc.color, borderColor: proc.color }}
                    >
                      {wps?.length ? `+ 재생성` : `⚡ ${proc.id} 생성`}
                    </Btn>
                    {!hasPrev && idx > 0 && (
                      <span style={{ fontSize: 11, color: T.muted, alignSelf: "center" }}>
                        ← {PROCESSES[idx - 1].id}를 먼저 생성하세요
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 상세 뷰 모달 */}
      {viewingWP && (
        <WPDetailModal wpData={viewingWP} project={project} onClose={() => setViewingWP(null)} />
      )}
    </div>
  );
}

// ── 산출물 상세 모달 ─────────────────────────────────────────────────────────
function WPDetailModal({ wpData, project, onClose }) {
  const { wp, proc } = wpData;
  const [tab, setTab] = useState("content");
  const qaResult = wp.qa_result;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, width: "100%", maxWidth: 780, maxHeight: "92vh", display: "flex", flexDirection: "column", animation: "fadeIn .25s ease" }}>
        {/* 모달 헤더 */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge color={proc.color}>{proc.id}</Badge>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{wp.content?.title || proc.label}</span>
            <StatusBadge status={wp.status} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" variant="outline" onClick={() => downloadMarkdown(wp.content, project, proc)}>⬇ MD</Btn>
            <Btn size="sm" variant="ghost" onClick={() => downloadJSON(wp.content, `${project.name}_${proc.id}.json`)}>JSON</Btn>
            <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 2, padding: "10px 24px 0", flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
          {[["content", "산출물 내용"], ["qa", "QA 결과"], ["raw", "Raw JSON"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "7px 16px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: tab === id ? 700 : 400, background: tab === id ? T.bg : "transparent", color: tab === id ? T.text : T.muted, border: `1px solid ${tab === id ? T.border : "transparent"}`, borderBottom: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "content" && <WPResultViewer wp={wp.content} process={proc} />}
          {tab === "qa" && (
            qaResult ? <QAResultView qa={qaResult} /> :
              <EmptyState icon="🔍" title="QA 미실행" desc="HITL 검토 탭에서 QA를 실행하세요." />
          )}
          {tab === "raw" && (
            <pre style={{ fontSize: 11, color: T.text, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(wp.content, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 산출물 결과 뷰어 ─────────────────────────────────────────────────────────
function WPResultViewer({ wp, process: proc }) {
  if (!wp) return <EmptyState icon="◈" title="내용 없음" desc="산출물 데이터가 없습니다." />;
  const color = proc?.color || T.accent;

  const renderArray = (arr, fields) => {
    if (!arr?.length) return <div style={{ color: T.muted, fontSize: 12, padding: "8px 0" }}>데이터 없음</div>;
    return arr.map((item, i) => (
      <div key={i} style={{ padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
        {fields.map(f => item[f] !== undefined && (
          <div key={f} style={{ marginBottom: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", minWidth: 80, flexShrink: 0, paddingTop: 1 }}>{f}:</span>
            <span style={{ fontSize: 12, color: T.text, lineHeight: 1.6, flex: 1 }}>{Array.isArray(item[f]) ? item[f].join(", ") : typeof item[f] === "object" ? JSON.stringify(item[f]) : String(item[f])}</span>
          </div>
        ))}
      </div>
    ));
  };

  const sections = {
    "SYS.1": [
      { key: "needs", label: "Needs", fields: ["id", "description", "source"] },
      { key: "requirements", label: "Stakeholder Requirements", fields: ["id", "title", "description", "priority", "acceptance_criteria", "stability"] },
      { key: "traceability", label: "추적성", fields: ["need_id", "req_id", "relation"] },
    ],
    "SYS.2": [
      { key: "requirements", label: "System Requirements", fields: ["id", "title", "type", "description", "source_stk_req", "priority", "relation_type"] },
      { key: "verification_criteria", label: "Verification Criteria", fields: ["id", "req_id", "method", "acceptance_criteria", "test_level"] },
      { key: "traceability", label: "추적성", fields: ["from", "to", "type"] },
    ],
    "SYS.3": [
      { key: "system_elements", label: "System Elements", fields: ["id", "name", "type", "description", "allocated_requirements", "interfaces"] },
      { key: "interfaces", label: "Interfaces", fields: ["id", "name", "source", "target", "type", "protocol", "specification"] },
      { key: "allocation_matrix", label: "Allocation Matrix", fields: ["req_id", "element_id", "rationale"] },
    ],
    "SYS.4": [
      { key: "test_cases", label: "Integration Test Cases", fields: ["id", "title", "objective", "primary_target", "integrated_elements", "related_sys_req", "pass_criteria"] },
    ],
    "SYS.5": [
      { key: "test_cases", label: "Qualification Test Cases", fields: ["id", "title", "objective", "system_requirements", "reference_stk_req", "test_type", "test_environment", "pass_criteria"] },
    ],
  };

  const processId = wp.process || proc?.id;

  return (
    <div>
      <div style={{ padding: "14px 16px", background: color + "10", border: `1px solid ${color}30`, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <Badge color={color}>{processId}</Badge>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{wp.title}</span>
        </div>
        {wp.summary && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(wp.summary).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: T.muted }}>
                <span style={{ color, fontWeight: 700 }}>{v}</span> {k.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        )}
      </div>
      {(sections[processId] || []).map(s => (
        <div key={s.key} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 3, height: 14, background: color, borderRadius: 2, display: "inline-block" }} />
            {s.label}
          </h3>
          {renderArray(wp[s.key], s.fields)}
        </div>
      ))}
    </div>
  );
}

function QAResultView({ qa }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
        {[["종합 점수", qa.overall_score, qa.overall_score >= 80 ? T.green : qa.overall_score >= 60 ? T.amber : T.red],
          ["완전성", qa.completeness?.score, T.accent],
          ["일관성", qa.consistency?.score, T.purple],
          ["추적성", qa.traceability?.score, T.teal]].map(([label, val, color]) => (
          <div key={label} style={{ padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val ?? "—"}</div>
          </div>
        ))}
      </div>
      {qa.issues?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>이슈 ({qa.summary?.total_issues}건)</div>
          {qa.issues.map((issue, i) => (
            <div key={i} style={{ padding: "10px 12px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <SeverityBadge severity={issue.severity} />
                <Badge color={T.muted}>{issue.category}</Badge>
              </div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>{issue.description}</div>
              {issue.recommendation && <div style={{ fontSize: 11, color: T.teal, marginTop: 4 }}>권장: {issue.recommendation}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: "10px 14px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 11, color: T.muted, marginRight: 8 }}>AI 권장:</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: qa.recommendation?.includes("승인") ? T.green : T.amber }}>{qa.recommendation}</span>
      </div>
    </div>
  );
}

// ── HITL 검토 페이지 ─────────────────────────────────────────────────────────
function ReviewPage({ project, wps, onUpdate, nav }) {
  const [selected, setSelected] = useState(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState(null);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const pendingWPs = wps.filter(w => ["검토중", "초안"].includes(w.status));

  async function handleQA() {
    if (!selected) return;
    setQaRunning(true); setError(""); setQaResult(null);
    try {
      const r = await runQACheck(selected.content);
      setQaResult(r);
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", { qa_result: JSON.stringify(r) });
      await onUpdate();
    } catch (e) { setError("QA 실패: " + e.message); }
    setQaRunning(false);
  }

  async function handleStatusUpdate(status) {
    if (!selected) return;
    setUpdating(true);
    try {
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", { status });
      await onUpdate();
      setSelected(prev => ({ ...prev, status }));
    } catch (e) { setError("업데이트 실패: " + e.message); }
    setUpdating(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button onClick={() => nav("pipeline")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>←</button>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>HITL 검토</h1>
      </div>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 24, paddingLeft: 28 }}>{project.name} · AI 산출물 QA 검증 → 승인/거부</p>

      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <Card style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>검토 대기 ({pendingWPs.length})</h2>
          {pendingWPs.length === 0 ? (
            <EmptyState icon="◎" title="검토 대기 없음" desc="파이프라인에서 산출물을 생성하세요." action={<Btn onClick={() => nav("pipeline")}>파이프라인으로</Btn>} />
          ) : (
            pendingWPs.map(wp => {
              const proc = PROCESSES.find(p => p.id === wp.process_id);
              return (
                <div key={wp.id} onClick={() => { setSelected(wp); setQaResult(wp.qa_result); }}
                  style={{ padding: "12px 14px", borderRadius: 10, border: `2px solid ${selected?.id === wp.id ? T.accent : T.border}`, background: selected?.id === wp.id ? T.accentGlow : T.bg, cursor: "pointer", transition: "all .2s", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{wp.content?.title || wp.process_id}</span>
                    <StatusBadge status={wp.status} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Badge color={proc?.color || T.accent}>{wp.process_id}</Badge>
                    {wp.qa_result && <Badge color={T.purple}>QA완료</Badge>}
                  </div>
                </div>
              );
            })
          )}
        </Card>

        <div>
          {selected ? (
            <Card style={{ padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>QA 검증 — {selected.content?.title || selected.process_id}</h2>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <Btn onClick={handleQA} disabled={qaRunning}>🔍 QA 검증 실행</Btn>
                <Btn variant="success" onClick={() => handleStatusUpdate("승인됨")} disabled={updating}>✓ 승인</Btn>
                <Btn variant="danger" onClick={() => handleStatusUpdate("거부됨")} disabled={updating}>✕ 거부</Btn>
                <Btn size="sm" variant="outline" onClick={() => { const proc = PROCESSES.find(p => p.id === selected.process_id); downloadMarkdown(selected.content, project, proc); }}>⬇ MD</Btn>
              </div>
              {qaRunning && <Spinner text="QA Agent 검증 중…" />}
              {error && <div style={{ color: T.red, fontSize: 12, padding: 10, background: T.redDim, borderRadius: 8, marginBottom: 12 }}>{error}</div>}
              {qaResult && <QAResultView qa={qaResult} />}
            </Card>
          ) : (
            <Card style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
              <div style={{ color: T.muted, fontSize: 13 }}>좌측에서 검토할 산출물을 선택하세요</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 추적성 분석 페이지 ────────────────────────────────────────────────────────
async function analyzeTraceability(wps) {
  return await callClaude(
    `당신은 ASPICE 4.0 추적성 전문가입니다. 반드시 JSON만 응답하세요.`,
    `다음 산출물들의 양방향 추적성을 분석하세요:\n${JSON.stringify(wps.map(w => ({ process: w.process_id, data: w.content })), null, 2)}\n\n다음 JSON 구조로 응답:\n{"forward_chain":[{"from":"N-001","to":"STK-REQ-001","relation":"SATISFIES"}],"coverage":{"needs_covered":"5/5 (100%)","stk_req_covered":"4/4 (100%)","sys_req_covered":"5/5 (100%)","elements_allocated":"4/4 (100%)","vc_covered":"5/5 (100%)","test_cases_coverage":"5/5 (100%)"},"orphans":[],"gaps":[],"v_model_mapping":[{"left":"SYS.1 STK-REQ","right":"Acceptance Test","relation":"↔"},{"left":"SYS.2 SYS-REQ","right":"SYS.5 Qualification","relation":"↔"},{"left":"SYS.3 Architecture","right":"SYS.4 Integration","relation":"↔"}]}`
  );
}

function TraceabilityPage({ project, wps }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!wps.length) { setError("산출물이 없습니다."); return; }
    setAnalyzing(true); setError(""); setResult(null);
    try { setResult(await analyzeTraceability(wps)); }
    catch (e) { setError("분석 실패: " + e.message); }
    setAnalyzing(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>추적성 분석</h1>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>{project.name} · Need → STK-REQ → SYS-REQ → Element → VC → Test 전체 체인</p>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>산출물 현황 ({wps.length}건)</h2>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>생성된 산출물의 추적성을 AI로 분석합니다.</p>
          </div>
          <Btn onClick={handleAnalyze} disabled={analyzing || !wps.length}>⇌ 분석 실행</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PROCESSES.map(p => {
            const count = wps.filter(w => w.process_id === p.id).length;
            return count > 0 && <Badge key={p.id} color={p.color}>{p.id} ({count})</Badge>;
          })}
        </div>
      </Card>

      {analyzing && <Spinner text="추적성 분석 중…" />}
      {error && <div style={{ color: T.red, fontSize: 12, padding: 14, background: T.redDim, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .4s" }}>
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>커버리지</h2>
            <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {Object.entries(result.coverage || {}).map(([k, v]) => (
                <div key={k} style={{ padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{k.replace(/_/g, " ").toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: String(v).includes("100%") ? T.green : T.amber }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Forward Traceability</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(result.forward_chain || []).map((link, i) => {
                const relColor = { SATISFIES: T.accent, REFINES: T.purple, DERIVES: T.purple, ALLOCATED_TO: T.teal, VERIFIED_BY: T.green, TESTED_BY: T.amber }[link.relation] || T.muted;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.from}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <Badge color={relColor}>{link.relation}</Badge>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.to}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>V-Model 매핑</h2>
            {(result.v_model_mapping || []).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1 }}>{m.left}</span>
                <span style={{ color: T.muted, fontSize: 14 }}>{m.relation}</span>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1, textAlign: "right" }}>{m.right}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { T, GLOBAL_CSS, Card, Btn, Badge, Input, Select, Textarea, Spinner, EmptyState, StatusBadge, SeverityBadge } from "../components/ui.jsx";

// ── 상수 ─────────────────────────────────────────────────────────────────────
const PROCESSES = [
  { id: "SYS.1", label: "SYS.1 - Stakeholder Requirements", color: T.accent, icon: "①",
    desc: "이해관계자 니즈를 수집하여 요구사항으로 정의합니다." },
  { id: "SYS.2", label: "SYS.2 - System Requirements", color: T.purple, icon: "②",
    desc: "이해관계자 요구사항을 시스템 요구사항과 검증 기준으로 변환합니다." },
  { id: "SYS.3", label: "SYS.3 - System Architecture", color: T.teal, icon: "③",
    desc: "시스템 요구사항을 시스템 요소에 할당하고 아키텍처를 설계합니다." },
  { id: "SYS.4", label: "SYS.4 - System Integration Test", color: T.amber, icon: "④",
    desc: "시스템 요소를 통합하고 인터페이스 및 상호작용을 검증합니다." },
  { id: "SYS.5", label: "SYS.5 - System Qualification Test", color: T.green, icon: "⑤",
    desc: "시스템이 요구사항을 만족하는지 최종 검증합니다." },
];

const STATUS_FLOW = ["초안", "검토중", "승인됨", "거부됨"];

// ── API 호출 헬퍼 ─────────────────────────────────────────────────────────────
function safeParseJSON(raw) {
  const text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(text); } catch {}
  const lastClose = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastClose > 0) {
    try { return JSON.parse(text.slice(0, lastClose + 1)); } catch {}
  }
  throw new Error("JSON 파싱 실패 — 다시 시도해 주세요.");
}

async function callClaude(systemMsg, userMsg, maxTokens = 8000) {
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
  if (data.error) throw new Error(data.error.message || String(data.error));
  const text = data.content?.map(b => b.text || "").join("") || "";
  if (!text) throw new Error("API 응답이 비어있습니다.");
  return safeParseJSON(text);
}

// ── Gemini QA 호출 ────────────────────────────────────────────────────────────
async function callGeminiQA(workProduct) {
  const prompt = `당신은 ASPICE 4.0 QA 전문가입니다. 아래 산출물을 검증하고 반드시 JSON만 응답하세요. 마크다운 없이 JSON만 출력하세요.\n\n산출물:\n${JSON.stringify(workProduct, null, 2)}\n\n다음 JSON 구조로만 응답하세요:\n{"overall_score":85,"completeness":{"score":90,"issues":[]},"consistency":{"score":80,"issues":[]},"traceability":{"score":85,"issues":[]},"issues":[{"id":"QA-001","severity":"Critical|Major|Minor|Info","category":"Completeness|Consistency|Traceability|Verifiability|Structure","description":"string","location":"string","recommendation":"string"}],"summary":{"total_issues":0,"critical":0,"major":0,"minor":0,"info":0},"recommendation":"승인 권장|수정 후 재검토|반려"}`;

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return safeParseJSON(data.text || "");
}

// ── 산출물 생성 함수 ──────────────────────────────────────────────────────────
async function generateWorkProduct(processId, context, projectInfo) {
  const SYS_BASE = `당신은 ASPICE 4.0 전문가입니다. 반드시 유효한 JSON만 응답하세요. 마크다운, 설명, 전문어 없이 JSON만 출력하세요.`;

  const prompts = {
    "SYS.1": {
      system: SYS_BASE,
      user: `Needs는 최대 5개, Requirements는 최대 6개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
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
}`
    },
    "SYS.2": {
      system: SYS_BASE,
      user: `Requirements 최대 7개, VC 최대 7개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
이해관계자 요구사항 컨텍스트: ${context}

다음 JSON 구조로 System Requirements + Verification Criteria를 동시 생성하세요 (SYS.2.BP4 준수):
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
}`
    },
    "SYS.3": {
      system: SYS_BASE,
      user: `Elements 최대 5개, Interfaces 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
시스템 요구사항 컨텍스트: ${context}

다음 JSON 구조로 System Architecture를 생성하세요:
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
}`
    },
    "SYS.4": {
      system: SYS_BASE,
      user: `Test Cases 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
아키텍처 컨텍스트: ${context}

다음 JSON 구조로 System Integration Test를 생성하세요 (인터페이스 중심):
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
      "pass_criteria":"string",
      "note":"SYS-REQ는 간접 추적 (해당 인터페이스가 구현하는 요구사항)"
    }
  ],
  "traceability": [{"test_id":"ITC-001","primary_interface":"IF-001","elements":["SE-001","SE-002"],"indirect_req":"SYS-REQ-F-001"}],
  "summary": {"total_test_cases":0,"total_interfaces_covered":0}
}`
    },
    "SYS.5": {
      system: SYS_BASE,
      user: `Test Cases 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
시스템 요구사항 및 검증 기준 컨텍스트: ${context}

다음 JSON 구조로 System Qualification Test를 생성하세요:
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
      "test_type":"Functional|Performance|Safety|Regulatory",
      "note":"STK-REQ는 참조용 (Acceptance Test에서 직접 검증됨)"
    }
  ],
  "traceability": [{"test_id":"STC-001","primary_req":"SYS-REQ-F-001","vc":"VC-001","reference_stk":"STK-REQ-001"}],
  "coverage_analysis": {"sys_req_covered":"string","vc_covered":"string"},
  "summary": {"total_test_cases":0}
}`
    },
  };

  const p = prompts[processId];
  return await callClaude(p.system, p.user);
}

// ── QA 검증 함수 (Gemini) ────────────────────────────────────────────────────
async function runQACheck(workProduct) {
  return await callGeminiQA(workProduct);
}

// ── 추적성 분석 함수 ─────────────────────────────────────────────────────────
async function analyzeTraceability(workProducts) {
  const result = await callClaude(
    `당신은 ASPICE 4.0 추적성 전문가입니다. 반드시 JSON만 응답하세요.`,
    `다음 산출물들의 양방향 추적성을 분석하세요:
${JSON.stringify(workProducts.map(w => ({ process: w.process_id, data: w.content })), null, 2)}

다음 JSON 구조로 응답하세요:
{
  "forward_chain": [
    {"from":"N-001","to":"STK-REQ-001","relation":"SATISFIES"},
    {"from":"STK-REQ-001","to":"SYS-REQ-F-001","relation":"REFINES"},
    {"from":"SYS-REQ-F-001","to":"SE-001","relation":"ALLOCATED_TO"},
    {"from":"SYS-REQ-F-001","to":"VC-001","relation":"VERIFIED_BY"},
    {"from":"VC-001","to":"STC-001","relation":"TESTED_BY"}
  ],
  "coverage": {
    "needs_covered": "5/5 (100%)",
    "stk_req_covered": "4/4 (100%)",
    "sys_req_covered": "5/5 (100%)",
    "elements_allocated": "4/4 (100%)",
    "vc_covered": "5/5 (100%)",
    "test_cases_coverage": "5/5 (100%)"
  },
  "orphans": [],
  "gaps": [],
  "v_model_mapping": [
    {"left":"SYS.1 STK-REQ","right":"Acceptance Test","relation":"↔"},
    {"left":"SYS.2 SYS-REQ","right":"SYS.5 Qualification","relation":"↔"},
    {"left":"SYS.3 Architecture","right":"SYS.4 Integration","relation":"↔"}
  ]
}`
  );
  return result;
}

// ── 메인 앱 컴포넌트 ──────────────────────────────────────────────────────────
export default function AspiceApp() {
  const [page, setPage] = useState("dashboard");
  const [workProducts, setWorkProducts] = useState([]);
  const [currentWP, setCurrentWP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "대시보드", icon: "⊞" },
    { id: "generate", label: "산출물 생성", icon: "✦" },
    { id: "traceability", label: "추적성 분석", icon: "⇌" },
    { id: "review", label: "HITL 검토", icon: "◎" },
  ];

  useEffect(() => { fetchWorkProducts(); }, []);

  async function fetchWorkProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setWorkProducts(Array.isArray(data) ? data.map(d => ({
        ...d, content: typeof d.content === "string" ? JSON.parse(d.content || "{}") : d.content || {}
      })) : []);
    } catch { setWorkProducts([]); }
    setLoading(false);
  }

  const nav = (p, wp = null) => { setPage(p); if (wp) setCurrentWP(wp); setMenuOpen(false); };

  const pages = {
    dashboard: <Dashboard wps={workProducts} loading={loading} nav={nav} />,
    generate: <GeneratePage onSave={fetchWorkProducts} nav={nav} />,
    traceability: <TraceabilityPage wps={workProducts} />,
    review: <ReviewPage wps={workProducts} onUpdate={fetchWorkProducts} nav={nav} />,
    detail: <DetailPage wp={currentWP} nav={nav} onUpdate={fetchWorkProducts} />,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: T.bg, color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* 모바일 헤더 */}
      <div className="mob-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: T.surface, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <Logo />
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer" }}>
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* 모바일 드롭다운 */}
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
        <aside className="sidebar" style={{ display: "none", width: 220, background: T.surface, borderRight: `1px solid ${T.border}`, flexDirection: "column", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${T.border}` }}>
            <Logo />
          </div>
          <nav style={{ padding: "14px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => nav(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: page === item.id ? `1px solid ${T.accentDim}` : "1px solid transparent", cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 600 : 400, fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all .15s" }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>총 산출물</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{workProducts.length}<span style={{ fontSize: 13, color: T.muted, fontWeight: 400 }}> 건</span></div>
          </div>
        </aside>

        <main className="main-pad" style={{ flex: 1, overflow: "auto", padding: "20px 16px", animation: "fadeIn .3s ease" }}>
          {pages[page] || pages.dashboard}
        </main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, background: `linear-gradient(135deg,${T.accent},${T.purple})`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>A</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>ASPICE AI</div>
        <div style={{ fontSize: 10, color: T.muted }}>v1.0 · SYS.1~SYS.5</div>
      </div>
    </div>
  );
}

// ── 대시보드 ──────────────────────────────────────────────────────────────────
function Dashboard({ wps, loading, nav }) {
  const stats = [
    { label: "전체 산출물", value: wps.length, color: T.accent },
    { label: "승인됨", value: wps.filter(w => w.status === "승인됨").length, color: T.green },
    { label: "검토중", value: wps.filter(w => w.status === "검토중").length, color: T.amber },
    { label: "QA 완료", value: wps.filter(w => w.qa_result).length, color: T.purple },
  ];
  const processCoverage = PROCESSES.map(p => ({
    ...p, count: wps.filter(w => w.process_id === p.id).length,
    approved: wps.filter(w => w.process_id === p.id && w.status === "승인됨").length,
  }));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>ASPICE 4.0 AI 산출물 플랫폼</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>SYS.1~SYS.5 산출물 자동 생성 · QA 검증 · 양방향 추적성 관리</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* 프로세스 커버리지 */}
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>V-Model 프로세스 현황</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {processCoverage.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: p.color + "20", border: `1px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: p.color, flexShrink: 0 }}>{p.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
                <div style={{ height: 4, background: T.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: p.color, borderRadius: 4, width: p.count > 0 ? "100%" : "0%", transition: "width .5s" }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{p.count}건 / {p.approved}승인</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 산출물 목록 */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>최근 산출물</h2>
          <Btn size="sm" onClick={() => nav("generate")}>+ 산출물 생성</Btn>
        </div>
        {loading ? <Spinner text="산출물 불러오는 중…" /> :
          wps.length === 0 ? <EmptyState icon="◈" title="산출물이 없습니다" desc="ASPICE 프로세스별 산출물을 AI로 자동 생성해보세요." action={<Btn onClick={() => nav("generate")}>첫 산출물 생성하기</Btn>} /> :
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {wps.slice(0, 10).map(wp => (
                <WPCard key={wp.id} wp={wp} onClick={() => nav("detail", wp)} />
              ))}
            </div>
        }
      </Card>

      {/* ASPICE V-Model 안내 */}
      <Card style={{ padding: 20, marginTop: 20 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: T.muted }}>ASPICE V-Model 추적성 원칙</h2>
        <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {[
            { left: "SYS.1 STK-REQ", right: "Acceptance Test", color: T.accent, note: "STK-REQ는 Acceptance Test에서 직접 검증" },
            { left: "SYS.2 SYS-REQ", right: "SYS.5 Qualification", color: T.purple, note: "SYS-REQ는 SYS.5에서 직접 검증" },
            { left: "SYS.3 Architecture", right: "SYS.4 Integration", color: T.teal, note: "Interface/Element는 SYS.4에서 직접 검증" },
          ].map(r => (
            <div key={r.left} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: r.color, fontWeight: 600, minWidth: 80 }}>{r.left}</div>
              <div style={{ color: T.muted, fontSize: 12 }}>↔</div>
              <div style={{ fontSize: 11, color: r.color, fontWeight: 600, minWidth: 80 }}>{r.right}</div>
              <div style={{ fontSize: 10, color: T.muted, flex: 1 }}>{r.note}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function WPCard({ wp, onClick }) {
  const proc = PROCESSES.find(p => p.id === wp.process_id);
  return (
    <div onClick={onClick} style={{ padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, cursor: "pointer", transition: "border-color .2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.borderHover}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{wp.title || wp.process_id}</div>
        <StatusBadge status={wp.status || "초안"} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge color={proc?.color || T.accent}>{wp.process_id}</Badge>
        {wp.qa_result && <Badge color={T.purple}>QA완료</Badge>}
        <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>{wp.created_at ? new Date(wp.created_at).toLocaleDateString("ko-KR") : ""}</span>
      </div>
    </div>
  );
}

// ── 산출물 생성 페이지 ────────────────────────────────────────────────────────
function GeneratePage({ onSave, nav }) {
  const [step, setStep] = useState(0);
  const [projectInfo, setProjectInfo] = useState({ name: "", domain: "자동차 부품", description: "" });
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const domainOptions = ["자동차 부품", "소프트웨어 시스템", "하드웨어 시스템", "임베디드 시스템", "IT 서비스", "항공우주", "의료기기"];

  async function handleGenerate() {
    if (!selectedProcess || !projectInfo.name) { setError("프로젝트명과 프로세스를 선택하세요."); return; }
    setGenerating(true); setError(""); setResult(null);
    try {
      const wp = await generateWorkProduct(selectedProcess.id, context, projectInfo);
      setResult(wp);
      setStep(2);
    } catch (e) { setError("생성 실패: " + e.message); }
    setGenerating(false);
  }

  async function handleSave(status = "초안") {
    if (!result) return;
    setSaving(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          process_id: selectedProcess.id,
          title: result.title || selectedProcess.label,
          project_name: projectInfo.name,
          domain: projectInfo.domain,
          content: JSON.stringify(result),
          status,
          created_at: new Date().toISOString(),
        }),
      });
      await onSave();
      nav("dashboard");
    } catch (e) { setError("저장 실패: " + e.message); }
    setSaving(false);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>ASPICE 산출물 생성</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>AI가 ASPICE 4.0 기준에 맞는 산출물을 자동으로 생성합니다.</p>
      </div>

      {/* 스텝 표시 */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, position: "relative" }}>
        <div style={{ position: "absolute", top: 11, left: 11, right: 11, height: 2, background: T.border }} />
        <div style={{ position: "absolute", top: 11, left: 11, height: 2, background: T.accent, transition: "width .4s", width: step === 0 ? "0%" : step === 1 ? "50%" : "100%" }} />
        {["프로젝트 설정", "프로세스 & 컨텍스트", "결과 확인"].map((s, i) => (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 1 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: i <= step ? T.accent : T.surface, border: `2px solid ${i <= step ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: i <= step ? "#fff" : T.muted }}>
              {i < step ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === step ? T.accent : T.muted, fontWeight: i === step ? 600 : 400, textAlign: "center" }}>{s}</span>
          </div>
        ))}
      </div>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>프로젝트 정보 입력</h2>
            <Input label="프로젝트명" value={projectInfo.name} onChange={v => setProjectInfo(p => ({ ...p, name: v }))} placeholder="예: 헤드램프 제어 시스템 개발" required />
            <Select label="도메인" value={projectInfo.domain} onChange={v => setProjectInfo(p => ({ ...p, domain: v }))} options={domainOptions} />
            <Textarea label="프로젝트 설명 (선택)" value={projectInfo.description} onChange={v => setProjectInfo(p => ({ ...p, description: v }))} placeholder="프로젝트의 주요 목적과 범위를 설명하세요." rows={3} />
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>프로세스 선택 및 컨텍스트 입력</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PROCESSES.map(p => (
                <div key={p.id} onClick={() => setSelectedProcess(p)}
                  style={{ padding: 16, borderRadius: 12, border: `2px solid ${selectedProcess?.id === p.id ? p.color : T.border}`, background: selectedProcess?.id === p.id ? p.color + "10" : T.bg, cursor: "pointer", transition: "all .2s" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: selectedProcess?.id === p.id ? p.color : T.text }}>{p.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, paddingLeft: 28 }}>{p.desc}</div>
                </div>
              ))}
            </div>
            <Textarea label="컨텍스트 / 추가 정보" value={context} onChange={setContext}
              placeholder={`예: 전방 카메라 기반 자동 하이빔 제어, ECE R48 법규 준수 필요\n이해관계자: 운전자, 차량 OEM, 법규 기관\n주요 기능: 야간 가시성 확보, 눈부심 방지, 코너링 조명`}
              rows={5} />
            {generating && <Spinner />}
            {error && <div style={{ color: T.red, fontSize: 12, padding: "10px 14px", background: T.redDim, borderRadius: 9 }}>{error}</div>}
          </div>
        )}

        {step === 2 && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>생성 결과</h2>
              <Btn size="sm" variant="outline" onClick={() => { setResult(null); setStep(1); }}>재생성</Btn>
            </div>
            <WPResultViewer wp={result} process={selectedProcess} />
            {error && <div style={{ color: T.red, fontSize: 12, padding: "10px 14px", background: T.redDim, borderRadius: 9 }}>{error}</div>}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Btn variant="ghost" onClick={() => step > 0 ? setStep(s => s - 1) : nav("dashboard")}>← 이전</Btn>
        <div style={{ display: "flex", gap: 8 }}>
          {step === 1 && <Btn onClick={handleGenerate} disabled={!selectedProcess || !projectInfo.name || generating}>⚡ AI 생성</Btn>}
          {step === 0 && <Btn disabled={!projectInfo.name} onClick={() => setStep(1)}>다음 →</Btn>}
          {step === 2 && result && (
            <>
              <Btn variant="ghost" onClick={() => handleSave("초안")} disabled={saving}>초안 저장</Btn>
              <Btn onClick={() => handleSave("검토중")} disabled={saving}>{saving ? "저장 중…" : "검토 요청"}</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 산출물 결과 뷰어 ─────────────────────────────────────────────────────────
function WPResultViewer({ wp, process }) {
  if (!wp) return null;
  const color = process?.color || T.accent;

  const renderArray = (arr, fields) => {
    if (!arr || !arr.length) return <div style={{ color: T.muted, fontSize: 12 }}>데이터 없음</div>;
    return arr.map((item, i) => (
      <div key={i} style={{ padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
        {fields.map(f => item[f] !== undefined && (
          <div key={f} style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", marginRight: 6 }}>{f}:</span>
            <span style={{ fontSize: 12, color: T.text }}>{Array.isArray(item[f]) ? item[f].join(", ") : String(item[f])}</span>
          </div>
        ))}
      </div>
    ));
  };

  const sections = {
    "SYS.1": [
      { key: "needs", label: "Needs", fields: ["id", "description", "source"] },
      { key: "requirements", label: "Stakeholder Requirements", fields: ["id", "title", "description", "priority", "acceptance_criteria"] },
      { key: "traceability", label: "추적성", fields: ["need_id", "req_id", "relation"] },
    ],
    "SYS.2": [
      { key: "requirements", label: "System Requirements", fields: ["id", "title", "type", "description", "relation_type"] },
      { key: "verification_criteria", label: "Verification Criteria", fields: ["id", "req_id", "method", "acceptance_criteria"] },
    ],
    "SYS.3": [
      { key: "system_elements", label: "System Elements", fields: ["id", "name", "type", "description", "allocated_requirements"] },
      { key: "interfaces", label: "Interfaces", fields: ["id", "name", "source", "target", "protocol"] },
    ],
    "SYS.4": [
      { key: "test_cases", label: "Integration Test Cases", fields: ["id", "title", "primary_target", "integrated_elements", "related_sys_req", "pass_criteria", "note"] },
    ],
    "SYS.5": [
      { key: "test_cases", label: "Qualification Test Cases", fields: ["id", "title", "system_requirements", "reference_stk_req", "test_type", "pass_criteria", "note"] },
    ],
  };

  return (
    <div>
      <div style={{ padding: "14px 16px", background: color + "10", border: `1px solid ${color}30`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <Badge color={color}>{wp.process}</Badge>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{wp.title}</span>
        </div>
        {wp.summary && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(wp.summary).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: T.muted }}><span style={{ color: color, fontWeight: 600 }}>{v}</span> {k.replace(/_/g, " ")}</div>
            ))}
          </div>
        )}
      </div>
      {(sections[wp.process] || []).map(s => (
        <div key={s.key} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{s.label}</h3>
          {renderArray(wp[s.key], s.fields)}
        </div>
      ))}
    </div>
  );
}

// ── 추적성 분석 페이지 ────────────────────────────────────────────────────────
function TraceabilityPage({ wps }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (wps.length === 0) { setError("산출물이 없습니다. 먼저 산출물을 생성하세요."); return; }
    setAnalyzing(true); setError(""); setResult(null);
    try {
      const r = await analyzeTraceability(wps);
      setResult(r);
    } catch (e) { setError("분석 실패: " + e.message); }
    setAnalyzing(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>양방향 추적성 분석</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>Need → STK-REQ → SYS-REQ → Element → VC → Test의 전체 추적성 체인을 분석합니다.</p>
      </div>

      {wps.length === 0 ? (
        <EmptyState icon="⇌" title="산출물 없음" desc="추적성 분석을 위해 먼저 SYS.1~SYS.5 산출물을 생성하세요." />
      ) : (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600 }}>산출물 현황 ({wps.length}건)</h2>
              <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>선택된 모든 산출물의 추적성을 AI로 분석합니다.</p>
            </div>
            <Btn onClick={handleAnalyze} disabled={analyzing}>⇌ 추적성 분석</Btn>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PROCESSES.map(p => {
              const count = wps.filter(w => w.process_id === p.id).length;
              return count > 0 && <Badge key={p.id} color={p.color}>{p.id} ({count})</Badge>;
            })}
          </div>
        </Card>
      )}

      {analyzing && <Spinner text="추적성 분석 중…" />}
      {error && <div style={{ color: T.red, fontSize: 12, padding: 14, background: T.redDim, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .4s" }}>
          {/* Coverage */}
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>커버리지 분석</h2>
            <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {Object.entries(result.coverage || {}).map(([k, v]) => (
                <div key={k} style={{ padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{k.replace(/_/g, " ").toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: v.includes("100%") ? T.green : T.amber }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Forward Chain */}
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Forward Traceability 체인</h2>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 400 }}>
                {(result.forward_chain || []).map((link, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.from}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <Badge color={
                      link.relation === "SATISFIES" ? T.accent : link.relation === "REFINES" ? T.purple :
                        link.relation === "DERIVES" ? T.purple : link.relation === "ALLOCATED_TO" ? T.teal :
                          link.relation === "VERIFIED_BY" ? T.green : T.amber
                    }>{link.relation}</Badge>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.to}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* V-Model 매핑 */}
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>V-Model 매핑</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(result.v_model_mapping || []).map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1 }}>{m.left}</span>
                  <span style={{ color: T.muted, fontSize: 14 }}>{m.relation}</span>
                  <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1, textAlign: "right" }}>{m.right}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Orphans / Gaps */}
          {(result.orphans?.length > 0 || result.gaps?.length > 0) && (
            <Card style={{ padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: T.amber }}>⚠ 추적성 이슈</h2>
              {result.orphans?.map((o, i) => <div key={i} style={{ color: T.red, fontSize: 12, marginBottom: 4 }}>고아 항목: {JSON.stringify(o)}</div>)}
              {result.gaps?.map((g, i) => <div key={i} style={{ color: T.amber, fontSize: 12, marginBottom: 4 }}>Gap: {JSON.stringify(g)}</div>)}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── HITL 검토 페이지 ─────────────────────────────────────────────────────────
function ReviewPage({ wps, onUpdate, nav }) {
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
      // QA 결과 저장
      await fetch(`/api/projects?id=${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qa_result: JSON.stringify(r) }),
      });
      await onUpdate();
    } catch (e) { setError("QA 실패: " + e.message); }
    setQaRunning(false);
  }

  async function handleStatusUpdate(status) {
    if (!selected) return;
    setUpdating(true);
    try {
      await fetch(`/api/projects?id=${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await onUpdate();
      setSelected(prev => ({ ...prev, status }));
    } catch (e) { setError("업데이트 실패: " + e.message); }
    setUpdating(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>HITL 검토 (Human-in-the-Loop)</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>AI가 생성한 산출물을 QA 검증 후 승인/거부합니다. 3단계: 제시 → QA검증 → 확정 <span style={{color:T.teal,fontWeight:700}}>· QA 검증 엔진: Gemini 2.0 Flash</span></p>
      </div>

      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* 검토 대기 목록 */}
        <Card style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>검토 대기 산출물 ({pendingWPs.length})</h2>
          {pendingWPs.length === 0 ? (
            <EmptyState icon="◎" title="검토 대기 없음" desc="검토 요청된 산출물이 없습니다." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingWPs.map(wp => (
                <div key={wp.id} onClick={() => { setSelected(wp); setQaResult(wp.qa_result ? (typeof wp.qa_result === "string" ? JSON.parse(wp.qa_result) : wp.qa_result) : null); }}
                  style={{ padding: "12px 14px", borderRadius: 10, border: `2px solid ${selected?.id === wp.id ? T.accent : T.border}`, background: selected?.id === wp.id ? T.accentGlow : T.bg, cursor: "pointer", transition: "all .2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{wp.title || wp.process_id}</span>
                    <StatusBadge status={wp.status} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Badge color={PROCESSES.find(p => p.id === wp.process_id)?.color || T.accent}>{wp.process_id}</Badge>
                    {wp.qa_result && <Badge color={T.purple}>QA완료</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* QA 패널 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selected ? (
            <>
              <Card style={{ padding: 20 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>QA 검증 — {selected.title}</h2>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <Btn onClick={handleQA} disabled={qaRunning}>🔍 QA 검증 실행</Btn>
                  <Btn variant="success" onClick={() => handleStatusUpdate("승인됨")} disabled={updating}>✓ 승인</Btn>
                  <Btn variant="danger" onClick={() => handleStatusUpdate("거부됨")} disabled={updating}>✕ 거부</Btn>
                </div>
                {qaRunning && <Spinner text="QA Agent 검증 중…" />}
                {error && <div style={{ color: T.red, fontSize: 12, padding: 10, background: T.redDim, borderRadius: 8 }}>{error}</div>}

                {qaResult && (
                  <div style={{ animation: "fadeIn .4s" }}>
                    {/* 점수 */}
                    <div className="grid3" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
                      {[
                        { label: "종합 점수", value: qaResult.overall_score, color: qaResult.overall_score >= 80 ? T.green : qaResult.overall_score >= 60 ? T.amber : T.red },
                        { label: "완전성", value: qaResult.completeness?.score, color: T.accent },
                        { label: "일관성", value: qaResult.consistency?.score, color: T.purple },
                        { label: "추적성", value: qaResult.traceability?.score, color: T.teal },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value ?? "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* 이슈 목록 */}
                    {qaResult.issues?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: T.muted }}>식별된 이슈 ({qaResult.summary?.total_issues}건)</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                          {qaResult.issues.map((issue, i) => (
                            <div key={i} style={{ padding: "10px 12px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                <SeverityBadge severity={issue.severity} />
                                <Badge color={T.muted}>{issue.category}</Badge>
                                <span style={{ fontSize: 10, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>{issue.id}</span>
                              </div>
                              <div style={{ fontSize: 12, marginBottom: 4 }}>{issue.description}</div>
                              {issue.location && <div style={{ fontSize: 11, color: T.muted }}>위치: {issue.location}</div>}
                              {issue.recommendation && <div style={{ fontSize: 11, color: T.teal, marginTop: 4 }}>권장: {issue.recommendation}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 권장 사항 */}
                    <div style={{ marginTop: 14, padding: "10px 14px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 11, color: T.muted, marginRight: 8 }}>AI 권장:</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: qaResult.recommendation?.includes("승인") ? T.green : T.amber }}>{qaResult.recommendation}</span>
                    </div>
                  </div>
                )}
              </Card>
            </>
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

// ── 상세 보기 페이지 ─────────────────────────────────────────────────────────
function DetailPage({ wp, nav, onUpdate }) {
  const [tab, setTab] = useState("content");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!wp) return <div style={{ padding: 40, color: T.muted }}>산출물을 선택하세요.</div>;
  const proc = PROCESSES.find(p => p.id === wp.process_id);
  const qaResult = wp.qa_result ? (typeof wp.qa_result === "string" ? JSON.parse(wp.qa_result) : wp.qa_result) : null;

  async function handleDelete() {
    await fetch(`/api/projects?id=${wp.id}`, { method: "DELETE" });
    await onUpdate();
    nav("dashboard");
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => nav("dashboard")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Badge color={proc?.color || T.accent}>{wp.process_id}</Badge>
            <StatusBadge status={wp.status} />
          </div>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>{wp.title}</h1>
        </div>
        {confirmDelete
          ? <div style={{ display: "flex", gap: 6 }}><Btn variant="danger" onClick={handleDelete} size="sm">삭제 확인</Btn><Btn variant="ghost" onClick={() => setConfirmDelete(false)} size="sm">취소</Btn></div>
          : <Btn variant="ghost" onClick={() => setConfirmDelete(true)} size="sm" style={{ color: T.red }}>삭제</Btn>
        }
      </div>

      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: T.surface, borderRadius: 10, padding: 3, border: `1px solid ${T.border}` }}>
        {[["content", "산출물 내용"], ["qa", "QA 결과"], ["raw", "Raw JSON"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12, fontWeight: tab === id ? 700 : 400, background: tab === id ? T.accent : "transparent", color: tab === id ? "#fff" : T.muted, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "content" && <WPResultViewer wp={wp.content} process={proc} />}
      {tab === "qa" && (
        qaResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card style={{ padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>QA 검증 결과</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {[["종합", qaResult.overall_score], ["완전성", qaResult.completeness?.score], ["일관성", qaResult.consistency?.score], ["추적성", qaResult.traceability?.score]].map(([k, v]) => (
                  <div key={k} style={{ padding: "10px 16px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: v >= 80 ? T.green : v >= 60 ? T.amber : T.red }}>{v ?? "—"}</div>
                  </div>
                ))}
              </div>
              {qaResult.issues?.map((issue, i) => (
                <div key={i} style={{ padding: "10px 12px", background: T.surface2, borderRadius: 10, marginBottom: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}><SeverityBadge severity={issue.severity} /><Badge color={T.muted}>{issue.category}</Badge></div>
                  <div style={{ fontSize: 12 }}>{issue.description}</div>
                  {issue.recommendation && <div style={{ fontSize: 11, color: T.teal, marginTop: 4 }}>권장: {issue.recommendation}</div>}
                </div>
              ))}
            </Card>
          </div>
        ) : <EmptyState icon="🔍" title="QA 미실행" desc="HITL 검토 페이지에서 QA를 실행하세요." action={<Btn onClick={() => nav("review")}>검토 페이지로</Btn>} />
      )}
      {tab === "raw" && (
        <Card style={{ padding: 20 }}>
          <pre style={{ fontSize: 11, color: T.text, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(wp.content, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { SDLC_FACTOR_CRITERIA, criteriaToPromptText } from './sdlcFactorCriteria';
import TailoringGuideModal from './TailoringGuideModal';
import { TAILORING_GUIDES, getGuideForOSSP } from './tailoringGuides';
import { PROCESS_TAILORING_GUIDE, processMark, processKey, resolveProcessTailoring } from './processTailoringGuide';

const T = {
  bg: "#0A0C10", surface: "#111318", border: "#1E2230",
  accent: "#4F8EF7", accentDim: "#1E3A6E", accentGlow: "rgba(79,142,247,0.18)",
  green: "#2DD4A0", amber: "#F5A623", red: "#FF5B5B",
  text: "#E8EAF0", muted: "#6B7280", subtle: "#1C2030",
};

function Badge({ color = T.accent, children }) {
  return <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700, letterSpacing:0.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>{children}</span>;
}

function Card({ children, style={}, onClick, hover=false }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:T.surface, border:`1px solid ${hov&&hover?T.accent+"66":T.border}`, borderRadius:14,
        transition:"border-color .2s, box-shadow .2s", boxShadow:hov&&hover?`0 0 24px ${T.accentGlow}`:"none",
        cursor:onClick?"pointer":"default", ...style }}>
      {children}
    </div>
  );
}

function Btn({ children, variant="primary", onClick, style={}, disabled=false }) {
  const [hov, setHov] = useState(false);
  const base = { primary:{bg:T.accent,color:"#fff",border:T.accent}, ghost:{bg:"transparent",color:T.muted,border:T.border}, outline:{bg:"transparent",color:T.accent,border:T.accent}, danger:{bg:T.red,color:"#fff",border:T.red} }[variant];
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?(variant==="ghost"?T.subtle:base.bg):(variant==="primary"||variant==="danger"?base.bg:"transparent"),
        color:variant==="ghost"&&hov?T.text:base.color, border:`1px solid ${base.border}`, borderRadius:10,
        padding:"8px 16px", fontSize:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer",
        opacity:disabled?0.4:1, transition:"all .15s", fontFamily:"inherit", letterSpacing:0.3, ...style }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type="text", style={} }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:12, color:T.muted, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", color:T.text, fontSize:14, fontFamily:"inherit", outline:"none", ...style }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:12, color:T.muted, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", color:T.text, fontSize:14, fontFamily:"inherit", outline:"none", cursor:"pointer" }}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Spinner({ text="AI 생성 중…" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, color:T.muted, fontSize:13 }}>
      <div style={{ width:18, height:18, border:`2px solid ${T.border}`, borderTop:`2px solid ${T.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }} />
      {text}
    </div>
  );
}

// 생성 진행 상황 표시 — 단계 라벨 + 퍼센트 바 (AI 호출처럼 오래 걸리는 작업용)
function GenProgressBar({ progress, subText }) {
  if (!progress) return null;
  const pct = Math.min(100, Math.round(progress.percent || 0));
  const done = pct >= 100;
  return (
    <div style={{ padding:"14px 16px", background:T.bg, border:`1px solid ${done ? T.green+"55" : T.border}`, borderRadius:10, marginBottom:12, animation:"fadeIn .3s" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, fontWeight:600, color: done ? T.green : T.text, minWidth:0 }}>
          {!done && <div style={{ width:14, height:14, border:`2px solid ${T.border}`, borderTop:`2px solid ${T.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }} />}
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{done ? "✓ " : ""}{progress.label}</span>
        </div>
        <div style={{ fontSize:13, fontWeight:700, color: done ? T.green : T.accent, fontFamily:"monospace", flexShrink:0 }}>{pct}%</div>
      </div>
      <div style={{ height:8, background:T.border, borderRadius:99, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background: done ? T.green : T.accent, borderRadius:99, transition:"width .4s ease" }} />
      </div>
      {subText && !done && <div style={{ fontSize:10, color:T.muted, marginTop:6 }}>{subText}</div>}
    </div>
  );
}

const OSSP_OPTIONS = [
  { id:"waterfall", label:"Waterfall", desc:"전통적 순차 개발", phases:["요구분석","설계","구현","테스트","배포","유지보수"] },
  { id:"agile", label:"Agile/Scrum", desc:"반복·점진적 개발", phases:["스프린트 계획","백로그 관리","개발","리뷰","회고","릴리즈"] },
  { id:"devops", label:"DevOps", desc:"지속적 통합·배포", phases:["계획","코딩","빌드","테스트","배포","운영","모니터링"] },
];

// 기본 제공 방법론의 단계별 표준 산출물 프리셋 (PMBOK 8판 관점, QA 필수 산출물 포함)
// key는 방법론 label과 일치해야 함 (DB 시딩 name과 동일)
const BUILTIN_DELIVERABLES = {
  "Waterfall": {
    "요구분석": ["프로젝트 관리 계획서(PMP)", "요구사항 정의서", "요구사항 추적표(RTM)", "품질보증 계획서", "리스크 관리대장"],
    "설계":     ["아키텍처 설계서", "상세 설계서", "인터페이스 설계서", "DB 설계서(ERD)"],
    "구현":     ["프로그램 소스코드", "코딩 표준 준수 검토서", "단위테스트 결과서"],
    "테스트":   ["통합테스트 계획서/결과서", "테스트 케이스·시나리오", "결함 관리 대장"],
    "배포":     ["배포(이행) 계획서", "인수테스트 결과서", "사용자·운영자 매뉴얼", "릴리즈 노트"],
    "유지보수": ["변경 요청서(CR)", "형상관리 대장", "교훈(Lessons Learned) 보고서"],
  },
  "Agile/Scrum": {
    "스프린트 계획": ["스프린트 계획서", "스프린트 백로그", "완료 기준(DoD) 정의서"],
    "백로그 관리":   ["제품 백로그", "사용자 스토리", "스토리 맵"],
    "개발":          ["프로그램 소스코드", "단위테스트 코드", "번다운 차트"],
    "리뷰":          ["스프린트 리뷰 결과서", "제품 증분(Increment) 데모 자료"],
    "회고":          ["회고 결과서", "개선 액션 아이템 목록"],
    "릴리즈":        ["릴리즈 계획서", "릴리즈 노트", "배포 체크리스트"],
  },
  "DevOps": {
    "계획":     ["제품 로드맵", "SLO/SLA 정의서"],
    "코딩":     ["프로그램 소스코드", "코드 리뷰(PR) 기록", "코딩 표준 가이드"],
    "빌드":     ["CI 파이프라인 정의서", "빌드 결과 리포트"],
    "테스트":   ["자동화 테스트 스위트", "테스트 커버리지 리포트"],
    "배포":     ["CD 파이프라인 정의서", "배포 승인 기록", "롤백 절차서"],
    "운영":     ["운영 매뉴얼(Runbook)", "장애 대응 절차서"],
    "모니터링": ["모니터링 대시보드 정의서", "장애 회고 보고서(Postmortem)"],
  },
};

// 방법론별 테일러링 매트릭스와 가이드는 src/tailoringGuides.js로 이동 (TAILORING_GUIDES / getGuideForOSSP)

const TAILORING_RULES = [
  { id:"doc_level", label:"문서화 수준", options:["최소","표준","상세"] },
  { id:"review_cycle", label:"리뷰 주기", options:["주간","격주","월간"] },
  { id:"test_level", label:"테스트 수준", options:["단위","통합","전체"] },
  { id:"risk", label:"위험 관리", options:["기본","강화","최고"] },
];

function LoginGate({ onSuccess }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!id || !pw) { setErr("아이디와 비밀번호를 입력하세요."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/login", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ id, pw }),
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) { onSuccess(data.token); }
      else { setErr(data.error || "로그인에 실패했습니다."); }
    } catch(e){ setErr(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:T.bg, color:T.text, fontFamily:"'DM Sans','Apple SD Gothic Neo',sans-serif", padding:16 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:"100%", maxWidth:360, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:18, color:"#fff" }}>P</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700 }}>ProGenesis</div>
            <div style={{ fontSize:11, color:T.muted }}>v2.1 · AI Platform</div>
          </div>
        </div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>로그인</div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input value={id} onChange={e=>setId(e.target.value)} placeholder="아이디"
            onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
            style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:"11px 14px", color:T.text, fontSize:14, fontFamily:"inherit", outline:"none" }} />
          <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="비밀번호" type="password"
            onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
            style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:"11px 14px", color:T.text, fontSize:14, fontFamily:"inherit", outline:"none" }} />
          {err && <div style={{ color:T.red, fontSize:12 }}>{err}</div>}
          <Btn onClick={submit} disabled={busy} style={{ marginTop:4, justifyContent:"center" }}>
            {busy ? "확인 중…" : "로그인"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// AI JSON 호출 (모듈 공용): /api/chat 프록시 → JSON 파싱·잘림 복구 — 컴포넌트 밖에서도 사용
async function callClaudeJson(prompt, maxTokens=8000, model="claude-haiku-4-5-20251001") {
  const res = await fetch("/api/chat", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ model, max_tokens:maxTokens,
      system:"You are a project management expert. Always respond with valid JSON only, no markdown, no preamble. Keep string values concise to ensure the JSON is complete and not truncated.",
      messages:[{ role:"user", content:prompt }] }),
  });

  const data = await res.json();

  // 에러 응답 방어: Anthropic/서버가 에러를 주면 content가 없음
  if (!res.ok || data.error || !data.content) {
    const msg = data?.detail?.error?.message || data?.error?.message || data?.error || `요청 실패 (status ${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const text = data.content?.map(b=>b.text||"").join("")||"";
  if (!text.trim()) throw new Error("AI 응답이 비어 있습니다.");

  // JSON 파싱 방어: 모델이 마크다운/설명을 섞거나 응답이 잘려도 최대한 복구
  const cleaned = text.replace(/```json|```/g,"").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // 1) 첫 '{'부터 마지막 '}'까지 추출 재시도
  const start = cleaned.indexOf("{");
  let end = cleaned.lastIndexOf("}");
  if (start > -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }
  // 2) 응답이 중간에 잘린 경우: 문자열·배열·객체 상태를 추적해 순서대로 닫아 복구 시도
  //    (예: {"reason":"요구사항이 ← 문자열이 열린 채 잘려도 복구 가능)
  if (start > -1) {
    const frag = cleaned.slice(start);
    let inStr = false, esc = false;
    const stack = [];
    for (const ch of frag) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "{") stack.push("}");
        else if (ch === "[") stack.push("]");
        else if (ch === "}" || ch === "]") stack.pop();
      }
    }
    let repaired = frag;
    if (inStr) repaired += '"';                    // 열린 문자열 닫기
    repaired = repaired.replace(/,\s*$/, "");      // 끝에 남은 쉼표 제거
    repaired = repaired.replace(/:\s*$/, ':""');   // 값 없이 끝난 키 보정
    while (stack.length) repaired += stack.pop();  // 열린 배열/객체를 역순으로 닫기
    try { return JSON.parse(repaired); } catch (_) {}
  }
  // 3) 그래도 실패하면 원문 앞부분을 포함해 원인 파악을 돕는다
  throw new Error("AI 응답을 JSON으로 해석할 수 없습니다. 응답 일부: " + cleaned.slice(0, 120));
  }

export default function ProGenesis() {
  const AUTH_KEY = "progenesis_auth";
  const [authed, setAuthed] = useState(() => {
    try { return !!localStorage.getItem(AUTH_KEY); } catch { return false; }
  });
  const logout = () => { try { localStorage.removeItem(AUTH_KEY); } catch {} setAuthed(false); };

  const [page, setPage] = useState("dashboard");
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [projectForm, setProjectForm] = useState({ name:"", client:"", type:"신규개발", startDate:"", endDate:"", pm:"", clientLogo:null, companyLogo:null });
  const [selectedOSSP, setSelectedOSSP] = useState(null);
  const [customOSSP, setCustomOSSP] = useState([]);
  const [builtinOSSP, setBuiltinOSSP] = useState([]);   // DB에 시딩된 기본 제공 방법론 (자산 업로드용 UUID 보유)
  const [sdlcFactors, setSdlcFactors] = useState({ req_clarity:"보통", req_volatility:"보통", delivery:"단계적", risk:"보통", regulation:"보통", team:"집중" });
  const [selectedSDLC, setSelectedSDLC] = useState(null);
  const [sdlcRecommendation, setSdlcRecommendation] = useState(null);  // { recommended, reason, alternatives }
  const [recommending, setRecommending] = useState(false);
  const [tailoring, setTailoring] = useState({ scale:"중형", method:"UML", excluded:{}, doc_level:"표준", review_cycle:"격주", test_level:"통합", risk:"강화" });
  const [pdpData, setPdpData] = useState(null);
  const [wbsData, setWbsData] = useState(null);
  const [wbsSetup, setWbsSetup] = useState({ pbsText: "", selected: {} });   // PBS×FBS 매트릭스 설정
  const [deliverablesData, setDeliverablesData] = useState(null);
  const [requirements, setRequirements] = useState(null);   // AI 작성 요구사항: { items:[...], sourceName, updatedAt }
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [genProgress, setGenProgress] = useState(null);   // 산출물 생성 진행 상황: { percent, label }
  const [editingId, setEditingId] = useState(null);   // 완료된 프로젝트 수정 모드: 수정 대상 프로젝트 id

  const nav = (p) => { setPage(p); setGenError(null); setMenuOpen(false); };

  useEffect(() => { fetchProjects(); fetchOSSP(); }, []);

  async function fetchOSSP() {
    try {
      const res = await fetch('/api/ossp');
      const data = await res.json();
      if (Array.isArray(data)) {
        const mapped = data.map(o => ({
          id: o.id,
          label: o.name,                 // UI는 label 사용 → DB의 name 매핑
          version: o.version || '',
          desc: o.description || '',
          phases: Array.isArray(o.phases) ? o.phases : [],
          custom: !o.is_builtin,
          builtin: !!o.is_builtin,       // 기본 제공 여부 (서버 자동 시딩)
        }));
        setCustomOSSP(mapped.filter(o => !o.builtin));   // 위저드 StepOSSP 중복 방지: 사내 OSSP만
        setBuiltinOSSP(mapped.filter(o => o.builtin));
      }
    } catch (e) { console.error(e); }
  }

  async function addOSSP({ name, version, description, phases }) {
    const res = await fetch('/api/ossp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version, description, phases }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '등록에 실패했습니다.');
    }
    const created = await res.json();
    await fetchOSSP();
    return created;   // 생성된 OSSP(id 포함) 반환 → 파일 업로드에 사용
  }

  async function deleteOSSP(id) {
    await fetch(`/api/ossp?id=${id}`, { method: 'DELETE' });
    await fetchOSSP();
  }

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data.map(p => ({
          id:p.id, name:p.name, client:p.client, type:p.type,
          startDate:p.start_date, endDate:p.end_date, pm:p.pm, status:p.status,
          ossp:p.ossp, tailoring:p.tailoring, pdp:p.pdp, wbs:p.wbs, deliverables:p.deliverables,
          createdAt:new Date(p.created_at).toLocaleDateString("ko-KR"),
        })));
      }
    } catch(e) { console.error(e); }
    setLoadingProjects(false);
  }

  async function callClaude(prompt, maxTokens=8000, model="claude-haiku-4-5-20251001") {
    return callClaudeJson(prompt, maxTokens, model);
  }
  
  async function recommendSDLC() {
    setRecommending(true); setGenError(null); setSdlcRecommendation(null);
    try {
      const result = await callClaude(`당신은 PMBOK 8판에 정통한 프로젝트 관리 전문가입니다. 아래 프로젝트 특성에 맞는 SDLC(소프트웨어 개발 생애주기) 모델을 추천하세요.
프로젝트 유형: ${projectForm.type}
요구사항 명확성: ${sdlcFactors.req_clarity}
요구사항 변동성: ${sdlcFactors.req_volatility}
인도(딜리버리) 방식: ${sdlcFactors.delivery}
리스크 수준: ${sdlcFactors.risk}
규제/컴플라이언스: ${sdlcFactors.regulation}
팀 구성: ${sdlcFactors.team}
각 특성 값의 판정 기준(사용자가 이 정의를 보고 선택했음):
${criteriaToPromptText()}
후보 모델: Waterfall(폭포수), V-Model, Iterative(반복형), Incremental(점진형), Spiral(나선형), Agile/Scrum, DevOps
PMBOK의 예측형↔적응형 스펙트럼과 요구 변동성·인도 빈도·리스크·규제·팀 분산도를 근거로 판단하세요.
JSON만 출력: {"recommended":{"id":"string(영문 소문자, 예: waterfall)","label":"string","approach":"예측형|적응형|하이브리드"},"reason":"string(한국어 2~3문장, PMBOK 요인 근거 명시)","alternatives":[{"id":"string","label":"string","note":"string(언제 이 대안이 더 나은지 한국어 1문장)"}]}`);
      setSdlcRecommendation(result);
      if (result?.recommended) setSelectedSDLC(result.recommended);
    } catch(e) { setGenError("SDLC 추천 실패: "+e.message); }
    setRecommending(false);
  }

  async function generatePDP() {
    setGenerating(true); setGenError(null); setPdpData(null);
    try {
      // 선택한 OSSP에 해당하는 테일러링 가이드로 확정 산출물을 단계별로 요약
      const guide = getGuideForOSSP(selectedOSSP);
      const scaleLabel = guide.scaleOptions?.find(o=>o.value===(tailoring.scale||"중형"))?.label || (tailoring.scale||"중형");
      const pdpNotes = tailoring.notes || {};
      const applied = classifyDeliverables(tailoring.scale||"중형", tailoring.method||"UML", guide)
        .filter(d => {
          if (d.required) return true;   // 필수(M) 산출물은 항상 적용 (테일러링 대상 아님)
          const ov = pdpNotes[`${d.phase}:${d.code}`]?.applied;   // PDP 화면에서 수정한 적용 여부 우선
          return ov !== undefined ? ov : !(tailoring.excluded||{})[d.code];
        });
      const byPhase = {};
      applied.forEach(d => { (byPhase[d.phase] = byPhase[d.phase] || []).push(d.name); });
      const tailoringSummary = Object.entries(byPhase)
        .map(([ph, names]) => `${ph}: ${names.join(", ")}`).join(" / ");

      // 프로세스 테일러링(관리 프로세스) 요약 — PDP 개요 작성 근거에 포함
      const procApplicable2 = resolveProcessTailoring(tailoring.process).filter(r => r.status !== "해당없음");
      const procChanged = procApplicable2.filter(r => r.status !== "적용");
      const procSummary = `적용 등급 ${tailoring.process?.level||"L3"} · 적용대상 ${procApplicable2.length}건 (적용 ${procApplicable2.filter(r=>r.status==="적용").length} / 변경적용 ${procApplicable2.filter(r=>r.status==="변경적용").length} / 미적용 ${procApplicable2.filter(r=>r.status==="미적용").length})`
        + (procChanged.length ? ` — 변경·미적용: ${procChanged.slice(0,10).map(r=>`${r.process}${r.activity?"›"+r.activity:""}(${r.status}${r.reason?": "+r.reason:""})`).join(", ")}` : "");

      const result = await callClaude(`당신은 PMBOK 8판에 정통한 품질보증(QA) 전문가입니다. PDP(Project's Defined Process)는 OSSP(Organization's Set of Standard Process)를 테일러링 가이드 기준으로 테일러링한 테일러링결과서입니다.
프로젝트명: ${projectForm.name}, 고객사: ${projectForm.client}, 유형: ${projectForm.type}, SDLC: ${selectedSDLC?.label||"미지정"}, OSSP: ${selectedOSSP?.label}, 기간: ${projectForm.startDate}~${projectForm.endDate}, PM: ${projectForm.pm}
적용 테일러링 가이드: ${guide.title}
프로젝트 규모: ${scaleLabel}, 설계방식: ${guide.hasDesignMethod ? (tailoring.method||"UML") : "해당 없음"}
테일러링 확정 산출물(단계별): ${tailoringSummary}
프로세스 테일러링(관리 프로세스, 프로세스 테일러링 가이드 V2.0 기준): ${procSummary}
PMBOK 8판의 테일러링 원칙과 품질 성과영역 관점을 반영하고, 위 테일러링 기준(규모·설계방식·단계별 산출물·관리 프로세스 이행 수준)을 근거로 테일러링결과서의 프로젝트 개요를 작성하라.
분량 제한(응답 잘림 방지): objectives 최대 4개. 각 문자열은 간결하게.
PDP JSON만 출력(설명·마크다운 금지): {"overview":{"purpose":"string","scope":"string","objectives":["string"]}}`, 2000);
      setPdpData(result);
    } catch(e) { setGenError("PDP 생성 실패: "+e.message); }
    setGenerating(false);
  }

  // PBS(Product Breakdown Structure) 초안을 AI로 추천 — WBS 생성 자체는 매트릭스 기반 결정적 로직으로 수행
  async function recommendPBS() {
    setGenerating(true); setGenError(null);
    try {
      const result = await callClaude(`당신은 PMBOK 8판에 정통한 프로젝트 관리 전문가입니다. 아래 프로젝트의 PBS(Product Breakdown Structure, 제품 분해 구조)를 작성하세요.
프로젝트명: ${projectForm.name}, 고객사: ${projectForm.client}, 유형: ${projectForm.type}, OSSP: ${selectedOSSP?.label||"-"}
규칙: 대상 시스템을 구성 요소로 분해하여 "L1 > L2 > L3" 형식으로 한 줄에 하나씩 작성. L3이 없으면 "L1 > L2"까지만. 여러 요소에 공통 적용되는 부분은 L2에 "공통" 사용 가능. 8~14줄, 한국어.
JSON만 출력: {"pbs":["string"]}`, 2000);
      if (Array.isArray(result?.pbs) && result.pbs.length) {
        setWbsSetup(s => ({ ...s, pbsText: result.pbs.join("\n") }));
      } else { throw new Error("PBS 응답 형식 오류"); }
    } catch(e) { setGenError("PBS 추천 실패: "+e.message); }
    setGenerating(false);
  }

  async function generateDeliverables() {
    setGenerating(true); setGenError(null); setDeliverablesData(null);
    setGenProgress({ percent: 5, label: "WBS 산출물 수집 중…" });
    let progTimer = null;   // AI 호출 중 진행률을 점진 증가시키는 타이머
    try {
      // ── WBS의 최하위 Task에 지정된 산출물을 그대로 수집 (단계별 카테고리, 단계 내 중복 제거) ──
      // WBS 화면에서 직접 수정·추가한 산출물명까지 그대로 반영된다.
      if (!wbsData?.tasks?.length) throw new Error("WBS가 없습니다. WBS 단계에서 먼저 WBS를 생성하세요.");

      // 우선순위(필수/선택)·코드 매핑용 참조: 방법론 테일러링 확정 산출물 + 관리 프로세스 산출물
      const guide = getGuideForOSSP(selectedOSSP);
      const pdpNotes = tailoring.notes || {};
      const methodApplied = classifyDeliverables(tailoring.scale||"중형", tailoring.method||"UML", guide)
        .filter(d => {
          if (d.required) return true;
          const ov = pdpNotes[`${d.phase}:${d.code}`]?.applied;
          return ov !== undefined ? ov : !(tailoring.excluded||{})[d.code];
        });
      const nameRef = new Map();   // 산출물명 → { code, required, mgmt }
      methodApplied.forEach(d => { if (!nameRef.has(d.name)) nameRef.set(d.name, { code:d.code, required:d.required, mgmt:false }); });
      const firstOut = (outputs) => {
        const toks = String(outputs||"").split(/,|\s\/\s/).map(x=>x.trim()).filter(Boolean);
        return toks.find(t => t.length >= 2 && t !== "예") || toks[0] || "";
      };
      resolveProcessTailoring(tailoring.process).filter(r => r.applied).forEach(r => {
        const n = firstOut(r.outputs);
        if (n && !nameRef.has(n)) nameRef.set(n, { code:null, required: r.mark === "●", mgmt:true });
      });

      // ── 개수 대사(對査)용 집계 — 최하위 Task 1건 = 산출물 1건(1:1)이 원칙 ──
      let leafTotal = 0, leafWithDeliv = 0, dupIncluded = 0, pdpInjected = false;
      wbsData.tasks.forEach(t => (t.subtasks || []).forEach(s => {
        if (!isWbsLeaf(t.subtasks, s.wbsCode)) return;   // 산출물은 최하위 Task 기준으로만 집계
        leafTotal += 1;
        if (String(s.deliverable || "").trim()) leafWithDeliv += 1;
      }));

      const PHASE_ICONS = ["🛡","📌","📋","🔧","🧪","🚀","🛠","📈","🧭","📦"];
      // 같은 산출물명은 같은 코드를 공유 (동일 문서 유형이 여러 Task에서 산출되는 경우)
      let pmSeq = 0, dSeq = 0;
      const codeByName = new Map();
      const categories = wbsData.tasks.map((t, ti) => {
        const seen = new Set();
        const documents = [];
        (t.subtasks || []).forEach(s => {
          if (!isWbsLeaf(t.subtasks, s.wbsCode)) return;   // 산출물은 최하위 Task에서만 수집 (중간 계층은 요약)
          const name = String(s.deliverable || "").trim();
          if (!name) return;   // 산출물 미지정 Task만 제외 — 지정된 Task는 중복이라도 전부 1:1 반영
          if (seen.has(name)) dupIncluded += 1; else seen.add(name);
          let code = codeByName.get(name);
          if (!code) {
            const ref = nameRef.get(name);
            code = ref?.code || (ref?.mgmt ? `PM${String(++pmSeq).padStart(2,"0")}` : `D${String(++dSeq).padStart(2,"0")}`);
            codeByName.set(name, code);
          }
          const ref = nameRef.get(name);
          documents.push({
            id: `${t.id}-${documents.length}`, code, name,
            wbsNo: s.wbsCode || "", taskName: s.task || "",
            purpose: `${t.phase} 단계 산출물`,
            priority: ref ? (ref.required ? "필수(M)" : "선택(O)") : "선택(O)",
          });
        });
        return { id: t.id, name: t.phase, icon: PHASE_ICONS[ti % PHASE_ICONS.length], documents };
      }).filter(c => c.documents.length > 0);

      // ── 테일러링결과서(PDP)는 프로젝트 계획수립 산출물에 항상 포함 (필수) ──
      {
        const PDP_DOC_NAME = "테일러링결과서";
        let planCat = categories.find(c => c.name === "프로젝트 계획수립");
        if (!planCat) {
          planCat = { id: "cat-plan", name: "프로젝트 계획수립", icon: "📌", documents: [] };
          categories.unshift(planCat);
        }
        if (!planCat.documents.some(d => d.name === PDP_DOC_NAME)) {
          pdpInjected = true;
          planCat.documents.unshift({
            id: `${planCat.id}-pdp`, code: "PDP", name: PDP_DOC_NAME,
            purpose: "OSSP를 테일러링가이드 기준으로 테일러링한 결과서",
            priority: "필수(M)",
          });
        }
      }

      const allDocs = categories.flatMap(c => c.documents);
      if (allDocs.length === 0) throw new Error("WBS에 산출물이 지정된 작업이 없습니다. WBS 단계의 산출물 열을 확인하세요.");
      const summary = {
        totalDocs: allDocs.length,
        mandatoryCount: allDocs.filter(d => String(d.priority||"").startsWith("필수")).length,
        source: "wbs",   // WBS 기반 생성 마커 — 구버전 생성분과 구분
        // 개수 대사 내역: 최하위 Task 수 → 산출물 지정(1:1 전부 반영) → PDP 추가 = totalDocs
        recon: { leafTotal, leafWithDeliv, dupIncluded, pdpInjected },
      };

      // ── AI는 각 문서의 목적 설명(1문장)만 작성 — 실패해도 목록은 유지 ──
      // AI 호출은 응답 시점을 알 수 없으므로 90%까지 점진적으로 차오르게 표시
      setGenProgress({ percent: 30, label: `AI가 산출물 ${allDocs.length}건의 목적 설명 작성 중…` });
      progTimer = setInterval(() => {
        setGenProgress(p => (p && p.percent < 90) ? { ...p, percent: Math.min(90, p.percent + Math.max(0.4, (90 - p.percent) * 0.05)) } : p);
      }, 400);
      try {
        const result = await callClaude(`당신은 PMBOK 8판에 정통한 품질보증(QA) 전문가입니다. 아래 SI 프로젝트 산출물 각각의 목적을 한국어 1문장(30자 이내)으로 작성하라.
프로젝트: ${projectForm.name}, 고객사: ${projectForm.client}, OSSP: ${selectedOSSP?.label}, SDLC: ${selectedSDLC?.label||"미지정"}
산출물 목록: ${[...new Map(allDocs.map(d => [d.code, d])).values()].map(d => `${d.code} ${d.name}`).join(", ")}
JSON만 출력(코드를 key로): {"purposes":{"코드":"목적 1문장"}}`, 8000);
        if (result?.purposes) {
          allDocs.forEach(d => { if (result.purposes[d.code]) d.purpose = String(result.purposes[d.code]); });
        }
      } catch (_) { /* 목적 생성 실패는 무시 — 기본 설명 유지 */ }

      if (progTimer) { clearInterval(progTimer); progTimer = null; }
      setGenProgress({ percent: 100, label: "산출물 생성 완료" });
      setDeliverablesData({ categories, summary });
      setTimeout(() => setGenProgress(p => (p && p.percent >= 100 ? null : p)), 1500);
    } catch(e) {
      if (progTimer) { clearInterval(progTimer); progTimer = null; }
      setGenProgress(null);
      setGenError("산출물 생성 실패: "+e.message);
    }
    setGenerating(false);
  }

  // ── 위저드 임시저장 (localStorage) ─────────────────────────────
  const DRAFT_KEY = "progenesis_wizard_draft";

  function saveDraft() {
    try {
      const draft = {
        wizardStep, projectForm, selectedOSSP,
        sdlcFactors, selectedSDLC, sdlcRecommendation,
        tailoring, pdpData, wbsData, wbsSetup, deliverablesData, requirements,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch (e) { console.error(e); return false; }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { console.error(e); return null; }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { console.error(e); }
  }

  function restoreDraft() {
    const d = loadDraft();
    if (!d) return;
    setWizardStep(d.wizardStep || 0);
    if (d.projectForm) setProjectForm(d.projectForm);
    setSelectedOSSP(d.selectedOSSP || null);
    if (d.sdlcFactors) setSdlcFactors(d.sdlcFactors);
    setSelectedSDLC(d.selectedSDLC || null);
    setSdlcRecommendation(d.sdlcRecommendation || null);
    if (d.tailoring) setTailoring(d.tailoring);
    setPdpData(d.pdpData || null);
    setWbsData(d.wbsData || null);
    setWbsSetup(d.wbsSetup || { pbsText: "", selected: {} });
    setDeliverablesData(d.deliverablesData || null);
    setRequirements(d.requirements || null);
  }

  // 완료(저장)된 프로젝트를 위저드로 다시 열어 수정 — 저장된 데이터를 위저드 상태로 복원
  function editProject(p) {
    setEditingId(p.id);
    setProjectForm({ name:p.name||"", client:p.client||"", type:p.type||"신규개발", startDate:p.startDate||"", endDate:p.endDate||"", pm:p.pm||"",
      clientLogo:p.tailoring?.logos?.client||null, companyLogo:p.tailoring?.logos?.company||null });
    setSelectedOSSP(p.ossp||null);
    const t = p.tailoring || {};
    setSelectedSDLC(t.sdlc||null);
    setSdlcFactors(t.sdlc_factors||{ req_clarity:"보통", req_volatility:"보통", delivery:"단계적", risk:"보통", regulation:"보통", team:"집중" });
    setSdlcRecommendation(null);
    setTailoring({ scale:"중형", method:"UML", excluded:{}, doc_level:"표준", review_cycle:"격주", test_level:"통합", risk:"강화", ...t });
    setPdpData(p.pdp||null);
    setWbsData(p.wbs||null);
    // 매트릭스 선택(selected)은 프로젝트에 저장되지 않으므로 비움 — 일정표(wbsData)는 그대로 복원됨.
    // 구조를 다시 생성하려면 매트릭스를 재선택 후 "WBS 생성"을 누르면 됨.
    setWbsSetup({ pbsText:p.wbs?.pbsText||"", selected:{}, holidays:p.wbs?.holidays||[] });
    setDeliverablesData(p.deliverables||null);
    setRequirements(p.tailoring?.requirements || null);
    setGenError(null);
    setWizardStep(7);   // 완료(최종 확인) 단계에서 시작 — 상단 스텝을 눌러 어느 단계로든 이동 가능
    nav("new_project");
  }

  async function finishProject() {
    const newProject = {
      name:projectForm.name, client:projectForm.client, type:projectForm.type,
      start_date:projectForm.startDate, end_date:projectForm.endDate, pm:projectForm.pm,
      status:"진행중", ossp:selectedOSSP,
      // sdlc 전용 컬럼 없이 tailoring(JSON)에 함께 보존 → DB 스키마 변경 불필요
      tailoring:{ ...tailoring, sdlc:selectedSDLC, sdlc_factors:sdlcFactors, requirements: requirements||null,
        logos:{ client:projectForm.clientLogo||null, company:projectForm.companyLogo||null } },
      pdp:pdpData, wbs:wbsData, deliverables:deliverablesData,
    };
    try {
      const res = await fetch('/api/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newProject) });
      // 수정 모드: 새 버전 저장이 성공한 경우에만 기존 프로젝트 제거 (실패 시 데이터 유실 방지)
      if (res.ok && editingId) {
        await fetch(`/api/projects?id=${editingId}`, { method:'DELETE' });
      }
      await fetchProjects();
    } catch(e) { console.error(e); }
    setEditingId(null);
    setWizardStep(0); setProjectForm({ name:"",client:"",type:"신규개발",startDate:"",endDate:"",pm:"" });
    setSelectedOSSP(null); setTailoring({ scale:"중형", method:"UML", excluded:{}, doc_level:"표준",review_cycle:"격주",test_level:"통합",risk:"강화" });
    setSelectedSDLC(null); setSdlcRecommendation(null);
    setSdlcFactors({ req_clarity:"보통", req_volatility:"보통", delivery:"단계적", risk:"보통", regulation:"보통", team:"집중" });
    setPdpData(null); setWbsData(null); setWbsSetup({ pbsText: "", selected: {} }); setDeliverablesData(null); setRequirements(null);
    clearDraft();   // 완료된 프로젝트의 임시저장본 제거
    nav("dashboard");
  }

  async function deleteProject(id) {
    await fetch(`/api/projects?id=${id}`, { method:'DELETE' });
    await fetchProjects();
    nav("dashboard");
  }

  const pages = {
    dashboard: <Dashboard projects={projects} loading={loadingProjects} nav={nav} setCurrentProject={setCurrentProject}
      draft={loadDraft()} onContinueDraft={()=>{ restoreDraft(); nav("new_project"); }} onDiscardDraft={()=>{ clearDraft(); setPage("dashboard"); }} />,
    new_project: <NewProjectWizard step={wizardStep} setStep={setWizardStep} form={projectForm} setForm={setProjectForm}
      selectedOSSP={selectedOSSP} setSelectedOSSP={setSelectedOSSP} tailoring={tailoring} setTailoring={setTailoring}
      pdpData={pdpData} wbsData={wbsData} deliverablesData={deliverablesData} generating={generating} genError={genError} genProgress={genProgress}
      onGeneratePDP={generatePDP} onRecommendPBS={recommendPBS} setWbsData={setWbsData}
      wbsSetup={wbsSetup} setWbsSetup={setWbsSetup} onGenerateDeliverables={generateDeliverables}
      requirements={requirements} setRequirements={setRequirements}
      onFinish={finishProject} nav={nav} customOSSP={customOSSP}
      sdlcFactors={sdlcFactors} setSdlcFactors={setSdlcFactors}
      selectedSDLC={selectedSDLC} setSelectedSDLC={setSelectedSDLC}
      sdlcRecommendation={sdlcRecommendation} recommending={recommending} onRecommendSDLC={recommendSDLC}
      editing={!!editingId}
      onSaveDraft={saveDraft} loadDraft={loadDraft} onRestoreDraft={restoreDraft} onClearDraft={clearDraft} />,
    project_detail: <ProjectDetail project={currentProject} nav={nav} onDelete={deleteProject} onEdit={editProject} />,
    ossp: <OSSPPage nav={nav} customOSSP={customOSSP} builtinOSSP={builtinOSSP} onAdd={addOSSP} onDelete={deleteOSSP} />,
    regulation: <LibraryPage nav={nav} kind="regulation"
      title="규제 (Regulation / Compliance)" subtitle="프로젝트가 준수해야 할 규제·컴플라이언스 자산"
      categories={["법령/규정","감독규정","인증/심사기준","보안/개인정보","산업표준","기타"]} />,
    best_practice: <LibraryPage nav={nav} kind="best_practice"
      title="Best Practice 산출물" subtitle="모범 산출물 사례 라이브러리"
      categories={["요구정의","분석","설계","구축","운영전환","공통/기타"]} />,
  };

  const navItems = [
    {id:"dashboard",icon:"⊞",label:"대시보드"},
    {id:"new_project",icon:"+",label:"새 프로젝트"},
    {id:"ossp",icon:"◈",label:"OSSP 라이브러리"},
    {id:"regulation",icon:"§",label:"규제 (Regulation)"},
    {id:"best_practice",icon:"★",label:"Best Practice 산출물"},
  ];

  // 로그인 전이면 로그인 화면만 표시
  if (!authed) {
    return <LoginGate onSuccess={(token)=>{ try { localStorage.setItem(AUTH_KEY, token||"1"); } catch {} setAuthed(true); }} />;
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans','Apple SD Gothic Neo',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:${T.bg}} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        input,select{color-scheme:dark} input::placeholder{color:${T.muted}} button:focus{outline:none}
        @media(min-width:768px){ .layout{ flex-direction:row !important; } .sidebar{ display:flex !important; } .mobile-header{ display:none !important; } .main-content{ padding:32px 40px !important; } }
      `}</style>

      {/* 모바일 헤더 */}
      <div className="mobile-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", background:T.surface, borderBottom:`1px solid ${T.border}`, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:`linear-gradient(135deg,${T.accent},#7C3AED)`, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:"#fff" }}>P</div>
          <div style={{ fontSize:14, fontWeight:700 }}>ProGenesis</div>
        </div>
        <button onClick={()=>setMenuOpen(!menuOpen)} style={{ background:"none", border:"none", color:T.text, fontSize:22, cursor:"pointer", padding:"4px 8px" }}>
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {menuOpen && (
        <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"8px 12px", zIndex:99 }}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>nav(item.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:page===item.id?T.accentGlow:"transparent", color:page===item.id?T.accent:T.muted, border:"none", cursor:"pointer", fontSize:14, fontWeight:page===item.id?600:400, fontFamily:"inherit", width:"100%", marginBottom:4 }}>
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
          <div style={{ padding:"10px 12px", borderTop:`1px solid ${T.border}`, marginTop:4, fontSize:12, color:T.muted }}>
            전체 프로젝트 <span style={{ color:T.accent, fontWeight:700 }}>{projects.length}건</span>
          </div>
          <button onClick={logout} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, background:"transparent", color:T.muted, border:"none", cursor:"pointer", fontSize:14, fontFamily:"inherit", width:"100%" }}>
            <span>⏻</span> 로그아웃
          </button>
        </div>
      )}

      <div className="layout" style={{ display:"flex", flex:1 }}>
        {/* PC 사이드바 */}
        <aside className="sidebar" style={{ display:"none", width:220, background:T.surface, borderRight:`1px solid ${T.border}`, flexDirection:"column", padding:"24px 0", flexShrink:0 }}>
          <div style={{ padding:"0 20px 24px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, background:`linear-gradient(135deg,${T.accent},#7C3AED)`, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:"#fff" }}>P</div>
              <div><div style={{ fontSize:15, fontWeight:700, letterSpacing:-0.3 }}>ProGenesis</div><div style={{ fontSize:10, color:T.muted }}>v2.1 · AI Platform</div></div>
            </div>
          </div>
          <nav style={{ padding:"14px 10px", flex:1, display:"flex", flexDirection:"column", gap:2 }}>
            {navItems.map(item=>(
              <button key={item.id} onClick={()=>nav(item.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:10, background:page===item.id?T.accentGlow:"transparent", color:page===item.id?T.accent:T.muted, border:page===item.id?`1px solid ${T.accentDim}`:"1px solid transparent", cursor:"pointer", fontSize:13, fontWeight:page===item.id?600:400, fontFamily:"inherit", transition:"all .15s", textAlign:"left", width:"100%" }}>
                <span style={{ fontSize:15 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding:"16px 20px", borderTop:`1px solid ${T.border}` }}>
            <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>전체 프로젝트</div>
            <div style={{ fontSize:24, fontWeight:700 }}>{projects.length}<span style={{ fontSize:13, color:T.muted, fontWeight:400 }}> 건</span></div>
            <button onClick={logout} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"7px 10px", borderRadius:8, background:"transparent", color:T.muted, border:`1px solid ${T.border}`, cursor:"pointer", fontSize:12, fontFamily:"inherit", width:"100%" }}>
              <span>⏻</span> 로그아웃
            </button>
          </div>
        </aside>

        <main style={{ flex:1, overflow:"auto", animation:"fadeIn .3s ease" }}>
          {pages[page]||pages.dashboard}
        </main>
      </div>
    </div>
  );
}

function Dashboard({ projects, loading, nav, setCurrentProject, draft, onContinueDraft, onDiscardDraft }) {
  const hasDraft = draft && (draft.projectForm?.name || draft.selectedSDLC || draft.selectedOSSP);
  const stats = [
    { label:"전체 프로젝트", value:projects.length, color:T.accent },
    { label:"PDP 생성", value:projects.filter(p=>p.pdp).length, color:T.green },
    { label:"WBS 생성", value:projects.filter(p=>p.wbs).length, color:T.amber },
    { label:"산출물", value:projects.filter(p=>p.deliverables).length, color:"#C084FC" },
  ];
  const STEP_LABELS = ["기본정보","SDLC","OSSP","테일러링","PDP","WBS","산출물","완료"];
  return (
    <div style={{ padding:"20px 16px", maxWidth:1100, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:-0.5, marginBottom:4 }}>프로젝트 착수 자동화 플랫폼</h1>
        <p style={{ color:T.muted, fontSize:12 }}>OSSP 테일러링 → PDP → WBS → 산출물까지 AI로 완성</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:20 }}>
        {stats.map(s=><Card key={s.label} style={{ padding:"14px 16px" }}><div style={{ fontSize:10, color:T.muted, marginBottom:4 }}>{s.label}</div><div style={{ fontSize:26, fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</div></Card>)}
      </div>
      <Card style={{ padding:18, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <h2 style={{ fontSize:14, fontWeight:600 }}>프로젝트 목록</h2>
          <Btn onClick={()=>nav("new_project")} style={{ fontSize:12, padding:"6px 12px" }}>+ 새 프로젝트</Btn>
        </div>
        {loading ? (
          <div style={{ textAlign:"center", padding:"32px 0" }}><Spinner text="프로젝트 불러오는 중…" /></div>
        ) : (projects.length===0 && !hasDraft) ? (
          <div style={{ textAlign:"center", padding:"32px 0", color:T.muted }}>
            <div style={{ fontSize:28, marginBottom:8 }}>◈</div>
            <div style={{ fontSize:13, marginBottom:14 }}>아직 등록된 프로젝트가 없습니다.</div>
            <Btn onClick={()=>nav("new_project")}>첫 프로젝트 시작하기</Btn>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {/* 작성 중(임시저장) 항목 */}
            {hasDraft && (
              <div onClick={onContinueDraft}
                style={{ padding:"12px 14px", background:T.bg, borderRadius:10, border:`1px dashed ${T.amber}88`, cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{draft.projectForm?.name || "(제목 미입력)"}</div>
                  <Badge color={T.amber}>작성 중</Badge>
                </div>
                <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>
                  {draft.projectForm?.client || "고객사 미입력"}
                  {draft.selectedSDLC?.label && ` · ${draft.selectedSDLC.label}`}
                  {typeof draft.wizardStep === "number" && ` · ${STEP_LABELS[draft.wizardStep]||""} 단계`}
                  {draft.savedAt && ` · ${new Date(draft.savedAt).toLocaleString("ko-KR")} 저장`}
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Btn variant="primary" onClick={(e)=>{ e.stopPropagation(); onContinueDraft(); }} style={{ fontSize:11, padding:"4px 10px" }}>이어서 작성</Btn>
                  <Btn variant="ghost" onClick={(e)=>{ e.stopPropagation(); if(confirm("작성 중인 내용을 삭제할까요?")) onDiscardDraft(); }} style={{ fontSize:11, padding:"4px 10px" }}>삭제</Btn>
                </div>
              </div>
            )}
            {projects.map(p=>(
              <div key={p.id} onClick={()=>{ setCurrentProject(p); nav("project_detail"); }}
                style={{ padding:"12px 14px", background:T.bg, borderRadius:10, border:`1px solid ${T.border}`, cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{p.name}</div>
                  <Badge color={T.accent}>{p.status}</Badge>
                </div>
                <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>{p.client} · {p.ossp?.label} · {p.createdAt}</div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {p.pdp && <Badge color={T.green}>PDP</Badge>}
                  {p.wbs && <Badge color={T.amber}>WBS</Badge>}
                  {p.deliverables && <Badge color="#C084FC">산출물</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card style={{ padding:18 }}>
        <h2 style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>추천 시작 흐름</h2>
        {["프로젝트 기본정보 입력","OSSP 선택 & 테일러링","PDP 자동 생성 (AI)","WBS 자동 생성 (AI)","산출물 생성 (AI)","프로젝트 착수 완료"].map((s,i)=>(
          <div key={s} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
            <div style={{ width:20, height:20, borderRadius:"50%", background:T.accentDim, color:T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>{i+1}</div>
            <div style={{ fontSize:12, color:T.muted, lineHeight:1.5 }}>{s}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function NewProjectWizard({ step, setStep, form, setForm, selectedOSSP, setSelectedOSSP, tailoring, setTailoring, pdpData, wbsData, deliverablesData, generating, genError, genProgress, onGeneratePDP, onRecommendPBS, setWbsData, wbsSetup, setWbsSetup, onGenerateDeliverables, requirements, setRequirements, onFinish, nav, customOSSP, sdlcFactors, setSdlcFactors, selectedSDLC, setSelectedSDLC, sdlcRecommendation, recommending, onRecommendSDLC, editing, onSaveDraft, loadDraft, onRestoreDraft, onClearDraft }) {
  const steps = ["기본정보","SDLC","OSSP","테일러링","PDP","WBS","산출물","완료"];
  const canNext = [
    form.name&&form.client&&form.startDate&&form.endDate&&form.pm,  // 0 기본정보
    !!selectedSDLC,                                                  // 1 SDLC
    !!selectedOSSP,                                                  // 2 OSSP
    true,                                                           // 3 테일러링
    !!pdpData,                                                      // 4 PDP
    !!wbsData,                                                      // 5 WBS
    !!deliverablesData,                                             // 6 산출물
    true,                                                           // 7 완료
  ];
  const [saveMsg, setSaveMsg] = useState("");
  // 진입 시 임시저장본이 있으면 복원 안내. 이미 입력 중이면(폼에 값 있음) 안내 생략.
  const [draftInfo, setDraftInfo] = useState(() => {
    const d = loadDraft ? loadDraft() : null;
    return d && !form.name ? d : null;
  });

  function handleSave() {
    if (onSaveDraft && onSaveDraft()) {
      setSaveMsg("임시저장됨");
      setTimeout(()=>setSaveMsg(""), 2000);
    }
  }
  return (
    <div style={{ padding:"16px", maxWidth:960, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={()=>nav("dashboard")} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:20 }}>←</button>
        <div style={{ flex:1 }}><h1 style={{ fontSize:17, fontWeight:700 }}>{editing ? "프로젝트 수정" : "새 프로젝트 생성"}</h1><p style={{ fontSize:11, color:T.muted }}>STEP {step+1}/{steps.length} — {steps[step]}</p></div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {editing && <Badge color={T.amber}>수정 모드</Badge>}
          {saveMsg && <span style={{ fontSize:11, color:T.green, fontWeight:600 }}>✓ {saveMsg}</span>}
          <Btn variant="outline" onClick={handleSave} style={{ fontSize:12, padding:"6px 12px" }}>임시저장</Btn>
        </div>
      </div>

      {/* 임시저장본 복원 안내 */}
      {draftInfo && (
        <Card style={{ padding:14, marginBottom:16, border:`1px solid ${T.accent}55`, background:T.bg }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <div style={{ fontSize:12, color:T.text }}>
              저장된 작성 내용이 있습니다
              {draftInfo.savedAt && <span style={{ color:T.muted }}> ({new Date(draftInfo.savedAt).toLocaleString("ko-KR")})</span>}
              . 이어서 작성하시겠어요?
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <Btn variant="primary" onClick={()=>{ onRestoreDraft && onRestoreDraft(); setDraftInfo(null); }} style={{ fontSize:11, padding:"5px 10px" }}>이어서 작성</Btn>
              <Btn variant="ghost" onClick={()=>{ onClearDraft && onClearDraft(); setDraftInfo(null); }} style={{ fontSize:11, padding:"5px 10px" }}>새로 시작</Btn>
            </div>
          </div>
        </Card>
      )}
      {/* 진행 표시 */}
      <div style={{ display:"flex", gap:0, marginBottom:24, position:"relative" }}>
        <div style={{ position:"absolute", top:11, left:11, right:11, height:2, background:T.border, zIndex:0 }} />
        <div style={{ position:"absolute", top:11, left:11, height:2, background:T.accent, zIndex:1, transition:"width .4s", width:`${(step/(steps.length-1))*(100-20/steps.length)}%` }} />
        {steps.map((s,i)=>{
          // 이동 허용: 과거/현재 단계는 항상, 미래 단계는 그 직전까지 모든 단계의 완료조건을 만족할 때만
          const canJump = i <= step || canNext.slice(0, i).every(Boolean);
          return (
            <div key={s} onClick={()=>{ if(i!==step && canJump) setStep(i); }}
              style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, position:"relative", zIndex:2, cursor:canJump?"pointer":"not-allowed" }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:i<=step?T.accent:T.surface, border:`2px solid ${i<=step?T.accent:T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:i<=step?"#fff":T.muted, transition:"all .15s" }}>{i<step?"✓":i+1}</div>
              <span style={{ fontSize:9, color:i===step?T.accent:T.muted, fontWeight:i===step?600:400, textAlign:"center" }}>{s}</span>
            </div>
          );
        })}
      </div>
      <Card style={{ padding:20, minHeight:300, marginBottom:16 }}>
        {step===0 && <StepInfo form={form} setForm={setForm} />}
        {step===1 && <StepSDLC factors={sdlcFactors} setFactors={setSdlcFactors} selected={selectedSDLC} setSelected={setSelectedSDLC} recommendation={sdlcRecommendation} recommending={recommending} genError={genError} onRecommend={onRecommendSDLC} />}
        {step===2 && <StepOSSP selected={selectedOSSP} setSelected={setSelectedOSSP} customOSSP={customOSSP} sdlc={selectedSDLC} />}
        {step===3 && <StepTailoring tailoring={tailoring} setTailoring={setTailoring} ossp={selectedOSSP} />}
        {step===4 && <StepPDP pdpData={pdpData} generating={generating} genError={genError} onGenerate={onGeneratePDP} tailoring={tailoring} setTailoring={setTailoring} ossp={selectedOSSP} sdlc={selectedSDLC} form={form} />}
        {step===5 && <StepWBS wbsData={wbsData} setWbsData={setWbsData} generating={generating} genError={genError} onRecommendPBS={onRecommendPBS} wbsSetup={wbsSetup} setWbsSetup={setWbsSetup} tailoring={tailoring} ossp={selectedOSSP} />}
        {step===6 && <StepDeliverables deliverablesData={deliverablesData} generating={generating} genProgress={genProgress} genError={genError} onGenerate={onGenerateDeliverables} form={form} wbs={wbsData} requirements={requirements} setRequirements={setRequirements} pdpCtx={{ ossp:selectedOSSP, sdlc:selectedSDLC, tailoring, pdp:pdpData, requirements }} />}
        {step===7 && <StepReview form={form} sdlc={selectedSDLC} ossp={selectedOSSP} tailoring={tailoring} pdpData={pdpData} wbsData={wbsData} deliverablesData={deliverablesData} />}
      </Card>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="ghost" onClick={()=>step>0?setStep(s=>s-1):nav("dashboard")}>← 이전</Btn>
        {step<steps.length-1 ? <Btn disabled={!canNext[step]} onClick={()=>setStep(s=>s+1)}>다음 →</Btn> : <Btn onClick={onFinish}>{editing ? "✓ 수정 저장" : "✓ 완료"}</Btn>}
      </div>
    </div>
  );
}

function StepInfo({ form, setForm }) {
  const f = k => v => setForm(p=>({...p,[k]:v}));
  // 로고 업로드: dataURL + 원본 크기(폭/높이) 저장 — docx 임베드 시 비율 유지에 사용
  const readLogo = k => e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) { alert("로고 이미지는 1MB 이하로 올려주세요."); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const dataUrl = rd.result;
      const img = new Image();
      img.onload = () => setForm(p => ({ ...p, [k]: { dataUrl, w: img.naturalWidth || 300, h: img.naturalHeight || 100 } }));
      img.onerror = () => alert("이미지를 읽을 수 없습니다. PNG 또는 JPG 파일을 사용해 주세요.");
      img.src = dataUrl;
    };
    rd.readAsDataURL(file);
  };
  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>프로젝트 기본 정보</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Input label="프로젝트명 *" value={form.name} onChange={f("name")} placeholder="예: 스마트팩토리 MES 고도화" />
        <Input label="고객사 *" value={form.client} onChange={f("client")} placeholder="예: (주)한국제조" />
        <Select label="프로젝트 유형" value={form.type} onChange={f("type")} options={["신규개발","고도화","유지보수","컨설팅"].map(v=>({value:v,label:v}))} />
        <Input label="PM *" value={form.pm} onChange={f("pm")} placeholder="예: 홍길동" />
        <Input label="시작일 *" type="date" value={form.startDate} onChange={f("startDate")} />
        <Input label="종료일 *" type="date" value={form.endDate} onChange={f("endDate")} />
        <div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>문서 로고</div>
          <div style={{ fontSize:10, color:T.muted, marginBottom:8 }}>산출물 문서(docx)의 표지와 문서 정보 표에 삽입됩니다. (PNG/JPG · 1MB 이하)</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {[["clientLogo","고객사 로고"],["companyLogo","우리회사 로고"]].map(([k,label])=>(
              <div key={k} style={{ flex:1, minWidth:220, border:`1px dashed ${T.border}`, borderRadius:10, padding:12 }}>
                <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>{label}</div>
                {form[k]?.dataUrl ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <img src={form[k].dataUrl} alt={label} style={{ height:34, maxWidth:170, objectFit:"contain", background:"#fff", borderRadius:6, padding:"2px 6px" }} />
                    <button onClick={()=>setForm(p=>({ ...p, [k]:null }))}
                      style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.red, cursor:"pointer", fontSize:11, padding:"4px 10px", fontFamily:"inherit" }}>제거</button>
                  </div>
                ) : (
                  <label style={{ display:"inline-block", cursor:"pointer", fontSize:12, color:T.accent, border:`1px solid ${T.accent}`, borderRadius:8, padding:"6px 12px" }}>
                    이미지 선택
                    <input type="file" accept="image/png,image/jpeg" onChange={readLogo(k)} style={{ display:"none" }} />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// SDLC 모델 목록 (구체 모델 수준)
const SDLC_MODELS = [
  { id:"waterfall",   label:"Waterfall (폭포수)",   approach:"예측형",   desc:"요구가 명확하고 변동이 적은 순차 개발" },
  { id:"v-model",     label:"V-Model (검증형)",      approach:"예측형",   desc:"단계별 검증·확인을 중시(규제·안전 중요)" },
  { id:"iterative",   label:"Iterative (반복형)",    approach:"하이브리드", desc:"핵심부터 만들고 반복 보완" },
  { id:"incremental", label:"Incremental (점진형)",  approach:"하이브리드", desc:"기능 묶음을 점진적으로 인도" },
  { id:"spiral",      label:"Spiral (나선형)",       approach:"하이브리드", desc:"리스크가 큰 대형/불확실 프로젝트" },
  { id:"agile",       label:"Agile/Scrum",          approach:"적응형",   desc:"요구 변동이 크고 잦은 인도가 필요" },
  { id:"devops",      label:"DevOps",               approach:"적응형",   desc:"지속적 통합·배포·운영 자동화" },
];

const SDLC_FACTORS = [
  { id:"req_clarity",    label:"요구사항 명확성",   options:["낮음","보통","높음"] },
  { id:"req_volatility", label:"요구사항 변동성",   options:["낮음","보통","높음"] },
  { id:"delivery",       label:"인도 방식",         options:["일괄","단계적","빈번"] },
  { id:"risk",           label:"리스크 수준",       options:["낮음","보통","높음"] },
  { id:"regulation",     label:"규제/컴플라이언스", options:["없음","보통","엄격"] },
  { id:"team",           label:"팀 구성",           options:["집중","혼합","분산"] },
];

function StepSDLC({ factors, setFactors, selected, setSelected, recommendation, recommending, genError, onRecommend }) {
  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>SDLC(개발 생애주기) 선택</h2>
      <p style={{ fontSize:12, color:T.muted, marginBottom:16 }}>프로젝트 특성을 입력하면 PMBOK 기준으로 적합한 모델을 추천합니다. 최종 선택은 직접 확정하세요.</p>

      {/* 프로젝트 특성 입력 — 각 버튼 아래에 판정 기준 표시 */}
      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:16 }}>
        {SDLC_FACTORS.map(f=>{
          const crit = SDLC_FACTOR_CRITERIA[f.id];
          return (
            <div key={f.id}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{f.label}</div>
              {crit?.help && <div style={{ fontSize:10, color:T.muted, marginBottom:6 }}>{crit.help}</div>}
              <div style={{ display:"flex", gap:8, alignItems:"stretch" }}>
                {f.options.map(opt=>{
                  const on = factors[f.id]===opt;
                  return (
                    <div key={opt} style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                      <button onClick={()=>setFactors(s=>({...s,[f.id]:opt}))}
                        style={{ width:"100%", padding:"7px 0", borderRadius:8, fontSize:12, fontFamily:"inherit",
                          background:on?T.accent:T.bg, color:on?"#fff":T.muted,
                          border:`1px solid ${on?T.accent:T.border}`, cursor:"pointer",
                          fontWeight:on?600:400 }}>{opt}</button>
                      {crit?.options?.[opt] && (
                        <div style={{ fontSize:9.5, color:on?T.text:T.muted, lineHeight:1.5, padding:"0 2px" }}>
                          {crit.options[opt]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom:16 }}>
        <Btn onClick={onRecommend} disabled={recommending} style={{ fontSize:12, padding:"8px 14px" }}>
          {recommending ? "분석 중…" : "⚡ AI 추천 받기"}
        </Btn>
      </div>
      {recommending && <Spinner text="PMBOK 기준으로 분석 중…" />}
      {genError && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9, marginBottom:12 }}>{genError}</div>}

      {/* 추천 근거 */}
      {recommendation?.recommended && (
        <div style={{ marginBottom:16, animation:"fadeIn .4s" }}>
          <Card style={{ padding:14, background:T.bg, border:`1px solid ${T.accent}55` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <Badge color={T.green}>AI 추천</Badge>
              <span style={{ fontWeight:700, fontSize:14 }}>{recommendation.recommended.label}</span>
              {recommendation.recommended.approach && <Badge color={T.accent}>{recommendation.recommended.approach}</Badge>}
            </div>
            <div style={{ fontSize:12, color:T.text, lineHeight:1.7 }}>{recommendation.reason}</div>
            {recommendation.alternatives?.length > 0 && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                <div style={{ fontSize:11, color:T.muted, fontWeight:600, marginBottom:6 }}>대안</div>
                {recommendation.alternatives.map((a,i)=>(
                  <div key={i} style={{ fontSize:11, color:T.muted, marginBottom:4 }}>
                    <span style={{ color:T.accent, fontWeight:600 }}>{a.label}</span> — {a.note}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 최종 모델 선택 (사용자 확정) */}
      <div style={{ fontSize:12, fontWeight:600, color:T.muted, marginBottom:8 }}>SDLC 모델 확정</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        {SDLC_MODELS.map(m=>{
          const isRec = recommendation?.recommended?.id === m.id;
          const isSel = selected?.id === m.id;
          return (
            <div key={m.id} onClick={()=>setSelected(m)}
              style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer", transition:"all .15s",
                border:`2px solid ${isSel?T.accent:T.border}`, background:isSel?T.accentGlow:T.bg }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                <span style={{ fontWeight:700, fontSize:13, color:isSel?T.accent:T.text }}>{m.label}</span>
                {isRec && <Badge color={T.green}>추천</Badge>}
              </div>
              <div style={{ fontSize:10, color:T.muted, marginBottom:4 }}>{m.desc}</div>
              <Badge color={isSel?T.accent:T.muted}>{m.approach}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepOSSP({ selected, setSelected, customOSSP=[], sdlc }) {
  // SDLC와 같은 접근(또는 같은 모델 id)을 가진 OSSP를 상단으로 정렬
  const base = [...OSSP_OPTIONS, ...customOSSP];
  const matchesSDLC = (o) => sdlc && (o.id === sdlc.id || (o.approach && o.approach === sdlc.approach));
  const options = [...base].sort((a,b)=> (matchesSDLC(b)?1:0) - (matchesSDLC(a)?1:0));
  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>OSSP 방법론 선택</h2>
      <p style={{ fontSize:12, color:T.muted, marginBottom:12 }}>프로젝트에 적합한 개발 방법론을 선택하세요.</p>
      {sdlc && (
        <div style={{ fontSize:11, color:T.muted, marginBottom:16, padding:"8px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8 }}>
          선택한 SDLC: <span style={{ color:T.accent, fontWeight:600 }}>{sdlc.label}</span>
          {sdlc.approach && <span> ({sdlc.approach})</span>} — 이 방식에 어울리는 OSSP를 위쪽에 정렬했습니다.
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {options.map(o=>(
          <div key={o.id} onClick={()=>setSelected(o)} style={{ padding:16, borderRadius:12, border:`2px solid ${selected?.id===o.id?T.accent:T.border}`, background:selected?.id===o.id?T.accentGlow:T.bg, cursor:"pointer", transition:"all .2s" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontWeight:700, fontSize:14, color:selected?.id===o.id?T.accent:T.text }}>{o.label}</span>
              {o.custom && <Badge color={T.green}>사내</Badge>}
              {matchesSDLC(o) && <Badge color={T.amber}>SDLC 적합</Badge>}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginBottom:10 }}>{o.desc}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{o.phases.map(ph=><Badge key={ph} color={selected?.id===o.id?T.accent:T.muted}>{ph}</Badge>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 규모/설계방식/방법론 가이드에 따라 산출물을 필수(M)/선택(O)/제외로 분류
function classifyDeliverables(scale, method, guide) {
  const g = guide || TAILORING_GUIDES.ie;
  const scaleKey = scale === "(초)대형" ? "large" : scale === "중형" ? "medium" : "small";
  const result = [];
  for (const d of g.matrix) {
    // 설계방식(UML/IE) 개념이 있는 가이드만 방식 필터 적용, '공통'은 항상 포함
    if (g.hasDesignMethod && d.method !== "공통" && d.method !== method) continue;
    const mark = d[scaleKey];
    if (!mark || mark === "-") continue;
    result.push({ ...d, required: mark === "M" });
  }
  return result;
}

// 테일러링 단계 — [방법론 테일러링(산출물)] / [프로세스 테일러링(관리 프로세스)] 두 탭으로 구성
function StepTailoring({ tailoring, setTailoring, ossp }) {
  const [tTab, setTTab] = useState("method");
  const procLevel = tailoring?.process?.level || "L3";
  return (
    <div>
      <div style={{ display:"flex", gap:3, marginBottom:16, background:T.bg, borderRadius:10, padding:3, border:`1px solid ${T.border}` }}>
        {[["method","방법론 테일러링 (산출물)"],["process",`프로세스 테일러링 (${procLevel})`]].map(([id,label])=>(
          <button key={id} onClick={()=>setTTab(id)}
            style={{ flex:1, padding:"8px 0", borderRadius:7, fontSize:12, fontWeight:tTab===id?700:400,
              background:tTab===id?T.accent:"transparent", color:tTab===id?"#fff":T.muted,
              border:"none", cursor:"pointer", fontFamily:"inherit" }}>{label}</button>
        ))}
      </div>
      {tTab==="method"
        ? <MethodologyTailoring tailoring={tailoring} setTailoring={setTailoring} ossp={ossp} />
        : <StepProcessTailoring tailoring={tailoring} setTailoring={setTailoring} />}
    </div>
  );
}

// 프로세스 테일러링 가이드 전문 열람 모달 (원본 xls의 수행 방법·목적·매트릭스 전체)
function ProcessGuideModal({ onClose }) {
  const G = PROCESS_TAILORING_GUIDE;
  const byArea = {};
  G.items.forEach(it => { (byArea[it.area] = byArea[it.area] || []).push(it); });
  const markCell = (m) => (
    <td style={{ ...cell, textAlign:"center", fontWeight:700, color:m==="●"?T.accent:m==="○"?T.amber:T.muted }}>{m}</td>
  );
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, width:"100%", maxWidth:1000, maxHeight:"88vh", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>{G.title} — 전문</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"14px 18px", overflowY:"auto" }}>
          {/* 적용 기준 */}
          <div style={{ fontSize:11, color:T.muted, lineHeight:1.8, padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:9, marginBottom:4 }}>
            <div>{G.levelNote}</div>
            <div>{G.sizeNote}</div>
            <div>범례: <span style={{ color:T.accent, fontWeight:700 }}>●</span> 필수(항상 적용) · <span style={{ color:T.amber, fontWeight:700 }}>○</span> 선택 · <span style={{ color:T.muted }}>-</span> 해당 등급 미적용</div>
          </div>

          {/* 1. 프로세스별 목적 */}
          <SectionTitle n="1" title="프로세스별 목적 (Goal)" />
          <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
            <tbody>
              {Object.entries(G.goals).map(([k,v])=>(
                <tr key={k}>
                  <td style={{ ...cellHead, verticalAlign:"top", width:140 }}>{k}</td>
                  <td style={{ ...cell, lineHeight:1.7 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 2. 테일러링 가이드 매트릭스 */}
          <SectionTitle n="2" title={`테일러링 가이드 매트릭스 (전체 ${G.items.length}건)`} />
          <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <td style={{...cellHead, textAlign:"center"}} rowSpan={2}>프로세스 영역</td>
                <td style={{...cellHead, textAlign:"center"}} rowSpan={2}>세부 프로세스</td>
                <td style={{...cellHead, textAlign:"center"}} colSpan={3}>적용 등급</td>
                <td style={{...cellHead, textAlign:"center"}} rowSpan={2}>테일러링 적용 가이드</td>
                <td style={{...cellHead, textAlign:"center"}} rowSpan={2}>주요 산출물</td>
              </tr>
              <tr>{G.levels.map(lv=><td key={lv} style={{...cellHead, textAlign:"center", width:34}}>{lv}</td>)}</tr>
            </thead>
            <tbody>
              {Object.keys(byArea).map(area=>(
                byArea[area].map((it,i)=>(
                  <tr key={`${area}-${i}`}>
                    {i===0 && <td style={{...cell, fontWeight:600, verticalAlign:"top", whiteSpace:"nowrap"}} rowSpan={byArea[area].length}>{area}</td>}
                    <td style={cell}>{it.process}{it.activity && <span style={{ color:T.muted }}> › {it.activity}</span>}</td>
                    {markCell(it.l3)}{markCell(it.l4)}{markCell(it.l5)}
                    <td style={{...cell, fontSize:10, lineHeight:1.6, color:it.guide?T.text:T.muted }}>{it.guide || ""}</td>
                    <td style={{...cell, fontSize:10, lineHeight:1.6, color:it.outputs?T.text:T.muted }}>{it.outputs || ""}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 프로세스 테일러링 — 조직 표준 관리 프로세스(요구사항관리·계획수립·품질보증 등)를
// 적용 등급(L3/L4/L5) 기준으로 확정. 필수(●)는 항상 적용(수정 불가), 선택(○)만 적용·변경 여부 조정 가능.
function StepProcessTailoring({ tailoring, setTailoring }) {
  const G = PROCESS_TAILORING_GUIDE;
  const [showGuide, setShowGuide] = useState(false);   // 가이드 전문 모달
  const proc = tailoring?.process || {};
  const level = proc.level || "L3";
  const setLevel = (v) => setTailoring(t => ({ ...t, process: { ...(t.process||{}), level: v, items: (t.process?.items)||{} } }));
  const setItem = (key, patch) => setTailoring(t => {
    const p = t.process || {};
    const items = { ...(p.items||{}) };
    items[key] = { ...(items[key]||{}), ...patch };
    return { ...t, process: { ...p, level: p.level||"L3", items } };
  });

  const resolved = resolveProcessTailoring({ ...proc, level });
  const byArea = {};
  resolved.forEach(r => { (byArea[r.area] = byArea[r.area] || []).push(r); });
  const applicable = resolved.filter(r => r.status !== "해당없음");
  const required = applicable.filter(r => r.mark === "●");
  const optional = applicable.filter(r => r.mark === "○");
  const includedOptional = optional.filter(r => r.applied);

  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>프로세스 테일러링</h2>
      <p style={{ fontSize:12, color:T.muted, marginBottom:14 }}>
        관리 프로세스의 이행 수준을 확정합니다.
        <span style={{ marginLeft:8 }}>
          · <span onClick={()=>setShowGuide(true)} title="프로세스 테일러링 가이드 전문 보기"
              style={{ color:T.accent, cursor:"pointer", textDecoration:"underline", textUnderlineOffset:3 }}>
              {G.title} 기준 🔍
            </span>
        </span>
      </p>

      {/* 적용 등급 선택 */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>적용 등급 (Required Maturity Level)</div>
        <div style={{ display:"flex", gap:8 }}>
          {G.levels.map(lv=>(
            <button key={lv} onClick={()=>setLevel(lv)}
              style={{ flex:1, padding:"8px 0", borderRadius:8, fontSize:12, fontFamily:"inherit",
                background:level===lv?T.accent:T.bg, color:level===lv?"#fff":T.muted,
                border:`1px solid ${level===lv?T.accent:T.border}`, cursor:"pointer", fontWeight:level===lv?600:400 }}>{lv}</button>
          ))}
        </div>
        <div style={{ fontSize:10, color:T.muted, marginTop:6, lineHeight:1.6 }}>{G.levelNote}<br/>{G.sizeNote}</div>
      </div>

      {/* 요약 — 방법론 테일러링과 동일 구성 */}
      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.accent }}>{required.length}</div>
          <div style={{ fontSize:11, color:T.muted }}>필수 프로세스 (●)</div>
        </div>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.amber }}>{includedOptional.length}<span style={{ fontSize:12, color:T.muted }}> / {optional.length}</span></div>
          <div style={{ fontSize:11, color:T.muted }}>선택 프로세스 (○, 포함/전체)</div>
        </div>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.green }}>{required.length + includedOptional.length}</div>
          <div style={{ fontSize:11, color:T.muted }}>총 적용 프로세스</div>
        </div>
      </div>
      <div style={{ fontSize:10, color:T.muted, marginBottom:10 }}>
        ※ 필수(●) 프로세스는 항상 적용되며 수정할 수 없습니다. 선택(○) 프로세스만 적용 여부·변경 여부를 조정할 수 있으며, 변경·미적용 시 사유를 기록합니다.
      </div>

      {/* 영역별 세부 프로세스 목록 */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, maxHeight:420, overflowY:"auto", paddingRight:4 }}>
        {Object.keys(byArea).map(area=>(
          <div key={area}>
            <div title={G.goals[area] || ""} style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:6, position:"sticky", top:0, background:T.surface, padding:"2px 0", zIndex:1 }}>
              {area} <span style={{ color:T.muted, fontWeight:400 }}>({byArea[area].filter(r=>r.status!=="해당없음").length}/{byArea[area].length})</span>
              {G.goals[area] && <span style={{ color:T.muted, fontWeight:400, fontSize:10, marginLeft:6 }} title={G.goals[area]}>ⓘ 목적</span>}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {byArea[area].map(r=>{
                const na = r.status === "해당없음";
                const req = r.mark === "●";
                return (
                  <div key={r.key} style={{ padding:"6px 10px", borderRadius:7, background:T.bg,
                    border:`1px solid ${T.border}`, opacity:na?0.4:(!req && !r.applied?0.55:1) }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <Badge color={req?T.accent:r.mark==="○"?T.amber:T.muted}>
                        {req?"필수":r.mark==="○"?"선택":"해당없음"}
                      </Badge>
                      <span title={r.guide || ""} style={{ fontSize:12, color:T.text, flex:1, textDecoration:!na && !req && !r.applied ? "line-through" : "none" }}>
                        {r.process}{r.activity && <span style={{ color:T.muted }}> › {r.activity}</span>}
                        {r.guide && <span style={{ color:T.muted, fontSize:10, marginLeft:5 }}>ⓘ</span>}
                      </span>
                      {!na && req && (
                        <span title="필수 프로세스는 항상 적용됩니다" style={{ fontSize:12, color:T.accent, whiteSpace:"nowrap" }}>☒ 적용</span>
                      )}
                      {!na && !req && (
                        <span style={{ display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
                          <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:r.applied?T.text:T.red, cursor:"pointer", whiteSpace:"nowrap" }}>
                            <input type="checkbox" checked={r.applied}
                              onChange={e=>setItem(r.key,{ applied:e.target.checked, changed:e.target.checked?r.changed:false, reason:r.reason })}
                              style={{ width:13, height:13, cursor:"pointer" }} />적용
                          </label>
                          <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:r.changed?T.amber:T.muted, cursor:r.applied?"pointer":"not-allowed", opacity:r.applied?1:0.4, whiteSpace:"nowrap" }}>
                            <input type="checkbox" checked={r.changed} disabled={!r.applied}
                              onChange={e=>setItem(r.key,{ applied:r.applied, changed:e.target.checked, reason:r.reason })}
                              style={{ width:13, height:13, cursor:r.applied?"pointer":"not-allowed" }} />변경
                          </label>
                        </span>
                      )}
                    </div>
                    {r.outputs && !na && (
                      <div style={{ fontSize:10, color:T.muted, marginTop:3, paddingLeft:2 }}>산출물: {r.outputs}</div>
                    )}
                    {!na && !req && r.status!=="적용" && (
                      <input value={r.reason} onChange={e=>setItem(r.key,{ reason:e.target.value })}
                        placeholder={r.applied ? "변경 내역 입력" : "미적용 사유 입력"}
                        style={{ width:"100%", boxSizing:"border-box", marginTop:5, background:"transparent",
                          border:"none", borderBottom:`1px dashed ${T.border}`, color:T.text,
                          fontSize:11, fontFamily:"inherit", outline:"none", padding:"3px 2px" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 가이드 전문 모달 */}
      {showGuide && <ProcessGuideModal onClose={()=>setShowGuide(false)} />}
    </div>
  );
}

function MethodologyTailoring({ tailoring, setTailoring, ossp }) {
  const [showGuide, setShowGuide] = useState(false);   // 테일러링 가이드 열람 모달
  const guide = getGuideForOSSP(ossp);                 // 선택한 OSSP에 해당하는 테일러링 가이드
  const scale = tailoring.scale || "중형";
  const method = tailoring.method || "UML";
  const excluded = tailoring.excluded || {};   // { code: true } = 사용자가 제외한 선택 산출물

  const list = classifyDeliverables(scale, method, guide);
  const required = list.filter(d => d.required);
  const optional = list.filter(d => !d.required);
  const includedOptional = optional.filter(d => !excluded[d.code]);

  // 단계 순서 (가이드별)
  const PHASE_ORDER = guide.phaseOrder;
  const grouped = {};
  for (const d of list) (grouped[d.phase] = grouped[d.phase] || []).push(d);

  const setScale = (v) => setTailoring(t => ({ ...t, scale:v }));
  const setMethod = (v) => setTailoring(t => ({ ...t, method:v }));
  const toggleExclude = (code) => setTailoring(t => {
    const ex = { ...(t.excluded||{}) }; ex[code] = !ex[code]; return { ...t, excluded:ex };
  });

  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>OSSP 테일러링</h2>
      <p style={{ fontSize:12, color:T.muted, marginBottom:14 }}>
        선택: <span style={{ color:T.accent, fontWeight:600 }}>{ossp?.label}</span>
        <span style={{ marginLeft:8, color:T.muted }}>
          · <span onClick={()=>setShowGuide(true)} title="테일러링 가이드 전문 보기"
              style={{ color:T.accent, cursor:"pointer", textDecoration:"underline", textUnderlineOffset:3 }}>
              {guide.title} 기준 🔍
            </span>
        </span>
      </p>

      {/* 프로젝트 규모 */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>프로젝트 규모</div>
        <div style={{ display:"flex", gap:8 }}>
          {guide.scaleOptions.map(o=>(
            <button key={o.value} onClick={()=>setScale(o.value)}
              style={{ flex:1, padding:"8px 0", borderRadius:8, fontSize:12, fontFamily:"inherit",
                background:scale===o.value?T.accent:T.bg, color:scale===o.value?"#fff":T.muted,
                border:`1px solid ${scale===o.value?T.accent:T.border}`, cursor:"pointer", fontWeight:scale===o.value?600:400 }}>{o.label}</button>
          ))}
        </div>
        <div style={{ fontSize:10, color:T.muted, marginTop:6 }}>{guide.sizeNote}</div>
      </div>

      {/* 설계방식 — UML/IE 구분이 있는 가이드(IE 기반)에서만 표시 */}
      {guide.hasDesignMethod && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>프로세스 설계방식</div>
          <div style={{ display:"flex", gap:8 }}>
            {[["UML","UML (객체지향)"],["IE","IE (정보공학)"]].map(([v,label])=>(
              <button key={v} onClick={()=>setMethod(v)}
                style={{ flex:1, padding:"8px 0", borderRadius:8, fontSize:12, fontFamily:"inherit",
                  background:method===v?T.accent:T.bg, color:method===v?"#fff":T.muted,
                  border:`1px solid ${method===v?T.accent:T.border}`, cursor:"pointer", fontWeight:method===v?600:400 }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize:10, color:T.muted, marginTop:6 }}>※ 공통 산출물은 항상 포함되며, 선택한 설계방식 전용 산출물이 추가됩니다.</div>
        </div>
      )}

      {/* 요약 */}
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.accent }}>{required.length}</div>
          <div style={{ fontSize:11, color:T.muted }}>필수 산출물 (M)</div>
        </div>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.amber }}>{includedOptional.length}<span style={{ fontSize:12, color:T.muted }}> / {optional.length}</span></div>
          <div style={{ fontSize:11, color:T.muted }}>선택 산출물 (O, 포함/전체)</div>
        </div>
        <div style={{ flex:1, padding:"10px 14px", borderRadius:9, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:20, fontWeight:700, color:T.green }}>{required.length + includedOptional.length}</div>
          <div style={{ fontSize:11, color:T.muted }}>총 적용 산출물</div>
        </div>
      </div>

      {/* 단계별 산출물 목록 */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, maxHeight:380, overflowY:"auto", paddingRight:4 }}>
        {PHASE_ORDER.filter(ph=>grouped[ph]?.length).map(ph=>(
          <div key={ph}>
            <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:6, position:"sticky", top:0, background:T.surface, padding:"2px 0" }}>
              {ph} <span style={{ color:T.muted, fontWeight:400 }}>({grouped[ph].length})</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {grouped[ph].map(d=>{
                const isExcluded = !d.required && excluded[d.code];
                return (
                  <div key={d.code}
                    onClick={()=>{ if(!d.required) toggleExclude(d.code); }}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:7,
                      background:T.bg, border:`1px solid ${T.border}`, cursor:d.required?"default":"pointer",
                      opacity:isExcluded?0.45:1 }}>
                    {d.required ? (
                      <Badge color={T.accent}>필수</Badge>
                    ) : (
                      <input type="checkbox" checked={!isExcluded} onChange={()=>toggleExclude(d.code)}
                        onClick={e=>e.stopPropagation()} style={{ width:13, height:13, cursor:"pointer" }} />
                    )}
                    <span style={{ fontSize:11, color:T.muted, fontFamily:"monospace", flexShrink:0 }}>{d.code}</span>
                    <span style={{ fontSize:12, color:T.text, flex:1, textDecoration:isExcluded?"line-through":"none" }}>
                      {d.name}{d.note && <span style={{ color:T.muted, fontSize:10, marginLeft:6 }}>({d.note})</span>}
                    </span>
                    {d.method!=="공통" && <Badge color={T.muted}>{d.method}</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 테일러링 가이드 전문 모달 */}
      {showGuide && <TailoringGuideModal guide={guide} onClose={()=>setShowGuide(false)} />}
    </div>
  );
}

function StepPDP({ pdpData, generating, genError, onGenerate, tailoring, setTailoring, ossp, sdlc, form }) {
  const scale = tailoring?.scale || "중형";
  const method = tailoring?.method || "UML";
  const excluded = tailoring?.excluded || {};
  const guide = getGuideForOSSP(ossp);
  const scaleLabel = guide.scaleOptions?.find(o=>o.value===scale)?.label || scale;
  const PHASE_ORDER = guide.phaseOrder;

  // 가이드 기준 전체 산출물 — 테일러링결과서 양식에 따라 미적용 산출물도 함께 표시
  const list = classifyDeliverables(scale, method, guide);
  const grouped = {};
  list.forEach(d => { (grouped[d.phase] = grouped[d.phase] || []).push(d); });

  // 산출물별 테일러링 기록: tailoring.notes = { "단계:코드": { applied, changed, reason } }
  // (프로젝트 저장 시 tailoring JSON에 함께 보존)
  const notes = tailoring?.notes || {};
  const noteKey = (d) => `${d.phase}:${d.code}`;
  // 적용 여부: 필수(M)는 항상 적용(수정 불가). 선택(O)은 테일러링 단계 결과가 기본값, 이 화면에서 수정 가능
  const isApplied = (d) => {
    if (d.required) return true;
    const ov = notes[noteKey(d)]?.applied;
    return ov !== undefined ? ov : !excluded[d.code];
  };
  const appliedCount = list.filter(isApplied).length;
  const setNote = (d, patch) => setTailoring && setTailoring(t => {
    const ns = { ...(t.notes || {}) };
    const k = `${d.phase}:${d.code}`;
    ns[k] = { ...(ns[k] || {}), ...patch };
    return { ...t, notes: ns };
  });

  const docNo = `PDP-${(form?.client||"").replace(/\s/g,"").slice(0,4).toUpperCase()||"PRJ"}-${new Date().getFullYear()}`;
  const today = new Date().toLocaleDateString("ko-KR");

  // 프로세스 테일러링 확정 상태 — 이 화면에서도 방법론 매트릭스와 동일하게 직접 수정 가능
  const procState = tailoring?.process || {};
  const procLevel = procState.level || "L3";
  const procApplicable = resolveProcessTailoring(procState).filter(r => r.status !== "해당없음");
  const procByArea = {};
  procApplicable.forEach(r => { (procByArea[r.area] = procByArea[r.area] || []).push(r); });
  const setProcItem = (r, patch) => setTailoring && setTailoring(t => {
    const p = t.process || {};
    const items = { ...(p.items||{}) };
    items[r.key] = { applied:r.applied, changed:r.changed, reason:r.reason, ...patch };
    return { ...t, process: { ...p, level: p.level || "L3", items } };
  });

  // 표 안 인라인 입력 스타일
  const noteInput = { width:"100%", boxSizing:"border-box", background:"transparent", border:"none",
    borderBottom:`1px dashed ${T.border}`, color:T.text, fontSize:10.5, fontFamily:"inherit",
    outline:"none", padding:"2px 2px" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div><h2 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>PDP (테일러링결과서) 생성</h2><p style={{ fontSize:11, color:T.muted }}>OSSP를 테일러링가이드 기준으로 테일러링한 결과를 정식 문서로 작성합니다.</p></div>
        {!pdpData && <Btn onClick={onGenerate} disabled={generating} style={{ fontSize:12, padding:"7px 12px" }}>⚡ AI 생성</Btn>}
      </div>
      {generating && <Spinner text="테일러링결과서 작성 중…" />}
      {genError && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9 }}>{genError}</div>}
      {pdpData && (
        <div style={{ display:"flex", flexDirection:"column", gap:0, animation:"fadeIn .4s" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Badge color={T.green}>✓ 생성 완료</Badge>
            <Btn variant="outline" onClick={onGenerate} style={{ fontSize:11, padding:"4px 10px" }}>재생성</Btn>
          </div>

          {/* 문서 본체 (테일러링결과서 양식) */}
          <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:20, maxHeight:520, overflowY:"auto" }}>
            {/* 표지 */}
            <div style={{ textAlign:"center", paddingBottom:16, borderBottom:`2px solid ${T.accent}` }}>
              <div style={{ fontSize:18, fontWeight:700, letterSpacing:1 }}>프로젝트 정의 프로세스 (PDP)</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>테일러링결과서 · Tailoring Result</div>
              <div style={{ fontSize:13, fontWeight:600, color:T.accent, marginTop:10 }}>{form?.name}</div>
            </div>

            {/* 문서 메타 */}
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", margin:"14px 0" }}>
              <tbody>
                {[["문서번호",docNo,"버전","V1.0"],
                  ["고객사",form?.client||"-","작성일",today],
                  ["기준 OSSP",ossp?.label||"-","SDLC",sdlc?.label||"-"]].map((row,i)=>(
                  <tr key={i}>
                    <td style={cellHead}>{row[0]}</td><td style={cell}>{row[1]}</td>
                    <td style={cellHead}>{row[2]}</td><td style={cell}>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 1. 프로젝트 개요 */}
            <SectionTitle n="1" title="프로젝트 개요" />
            <div style={{ fontSize:12, color:T.text, lineHeight:1.7, marginBottom:6 }}>{pdpData.overview?.purpose}</div>
            {pdpData.overview?.scope && <div style={{ fontSize:11, color:T.muted, lineHeight:1.6, marginBottom:6 }}><b>범위:</b> {pdpData.overview.scope}</div>}
            {pdpData.overview?.objectives?.length > 0 && (
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.7 }}>
                {pdpData.overview.objectives.map((o,i)=>(
                  <div key={i}><span style={{ color:T.accent, marginRight:5 }}>▸</span>{o}</div>
                ))}
              </div>
            )}

            {/* 2. 테일러링 기준 */}
            <SectionTitle n="2" title="테일러링 기준" />
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
              <tbody>
                <tr><td style={cellHead}>적용 가이드</td><td style={cell} colSpan={3}>{guide.title}</td></tr>
                <tr><td style={cellHead}>프로젝트 규모</td><td style={cell}>{scaleLabel}</td><td style={cellHead}>설계방식</td><td style={cell}>{guide.hasDesignMethod ? method : "해당 없음"}</td></tr>
                <tr><td style={cellHead}>규모 판정 기준</td><td style={cell} colSpan={3}>{guide.sizeNote?.replace(/^※\s*/, "")}</td></tr>
              </tbody>
            </table>

            {/* 3. 산출물 테일러링 매트릭스 — 적용/변경 여부 및 사유 기록 */}
            <SectionTitle n="3" title={`산출물 테일러링 매트릭스 (전체 ${list.length}건 · 적용 ${appliedCount}건)`} />
            <div style={{ fontSize:10, color:T.muted, marginBottom:8 }}>
              ※ 필수(M) 산출물은 항상 적용되며 수정할 수 없습니다. 선택(O) 산출물은 테일러링 단계의 선택 결과가 기본값이며, 이 화면에서 적용 여부·변경 여부·테일러링 내역 및 사유를 수정·기록할 수 있습니다 (프로젝트 저장 시 함께 보존).
            </div>
            <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
              <thead>
                <tr>{["단계","코드","산출물","구분","적용 여부","변경 여부","테일러링 내역 및 사유"].map(h=>
                  <td key={h} style={{...cellHead, textAlign:"center"}}>{h}</td>)}</tr>
              </thead>
              <tbody>
                {PHASE_ORDER.filter(ph=>grouped[ph]?.length).map(ph=>(
                  grouped[ph].map((d,i)=>{
                    const k = noteKey(d);
                    const n = notes[k] || {};
                    const on = isApplied(d);
                    return (
                      <tr key={`${ph}-${d.code}`} style={{ opacity:on?1:0.55 }}>
                        {i===0 && <td style={{...cell, fontWeight:600, verticalAlign:"top"}} rowSpan={grouped[ph].length}>{ph}</td>}
                        <td style={{...cell, fontFamily:"monospace"}}>{d.code}</td>
                        <td style={cell}>
                          {d.name}
                          {d.note && <span style={{ color:T.muted, fontSize:9.5, marginLeft:4 }}>({d.note})</span>}
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          <Badge color={d.required?T.accent:T.amber}>{d.required?"필수":"선택"}</Badge>
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          {d.required
                            ? <span style={{ fontSize:14, color:T.accent }} title="필수 산출물은 항상 적용됩니다">☒</span>
                            : <input type="checkbox" checked={on}
                                onChange={e=>setNote(d,{applied:e.target.checked})}
                                style={{ width:14, height:14, cursor:"pointer" }} />}
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          {d.required
                            ? <span style={{ fontSize:12, color:T.muted }}>—</span>
                            : <input type="checkbox" checked={!!n.changed}
                                onChange={e=>setNote(d,{changed:e.target.checked})}
                                style={{ width:13, height:13, cursor:"pointer" }} />}
                        </td>
                        <td style={{...cell, minWidth:180 }}>
                          {d.required
                            ? <span style={{ fontSize:11, color:T.muted }}>—</span>
                            : <input value={n.reason||""}
                                onChange={e=>setNote(d,{reason:e.target.value})}
                                placeholder={on ? "" : "미적용 사유 입력"} style={noteInput} />}
                        </td>
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>

            {/* 4. 프로세스 테일러링 내역서 — 방법론 매트릭스와 동일한 컬럼·규칙 (필수 고정, 선택만 수정) */}
            <SectionTitle n="4" title={`프로세스 테일러링 내역서 (적용 등급 ${procLevel} · 적용대상 ${procApplicable.length}건)`} />
            <div style={{ fontSize:10, color:T.muted, marginBottom:8 }}>
              ※ 필수(●) 프로세스는 항상 적용되며 수정할 수 없습니다. 선택(○) 프로세스는 이 화면 또는 테일러링 단계의 '프로세스 테일러링' 탭에서 적용 여부·변경 여부·사유를 수정할 수 있습니다 (프로젝트 저장 시 함께 보존).
            </div>
            <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
              <thead>
                <tr>{["프로세스 영역","세부 프로세스","구분","적용 여부","변경 여부","테일러링 내역 및 사유"].map(h=>
                  <td key={h} style={{...cellHead, textAlign:"center"}}>{h}</td>)}</tr>
              </thead>
              <tbody>
                {Object.keys(procByArea).map(area=>(
                  procByArea[area].map((r,i)=>{
                    const req = r.mark === "●";
                    return (
                      <tr key={r.key} style={{ opacity:r.applied?1:0.55 }}>
                        {i===0 && <td style={{...cell, fontWeight:600, verticalAlign:"top"}} rowSpan={procByArea[area].length}>{area}</td>}
                        <td style={cell}>
                          {r.process}{r.activity && <span style={{ color:T.muted }}> › {r.activity}</span>}
                          {r.outputs && <div style={{ color:T.muted, fontSize:9.5, marginTop:2 }}>산출물: {r.outputs}</div>}
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          <Badge color={req?T.accent:T.amber}>{req?"필수":"선택"}</Badge>
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          {req
                            ? <span style={{ fontSize:14, color:T.accent }} title="필수 프로세스는 항상 적용됩니다">☒</span>
                            : <input type="checkbox" checked={r.applied}
                                onChange={e=>setProcItem(r,{ applied:e.target.checked, changed:e.target.checked?r.changed:false })}
                                style={{ width:14, height:14, cursor:"pointer" }} />}
                        </td>
                        <td style={{...cell, textAlign:"center"}}>
                          {req
                            ? <span style={{ fontSize:12, color:T.muted }}>—</span>
                            : (r.applied
                                ? <input type="checkbox" checked={r.changed}
                                    onChange={e=>setProcItem(r,{ changed:e.target.checked })}
                                    style={{ width:13, height:13, cursor:"pointer" }} />
                                : <span style={{ fontSize:12, color:T.muted }}>—</span>)}
                        </td>
                        <td style={{...cell, minWidth:180 }}>
                          {req || r.status==="적용"
                            ? <span style={{ fontSize:11, color:T.muted }}>—</span>
                            : <input value={r.reason||""}
                                onChange={e=>setProcItem(r,{ reason:e.target.value })}
                                placeholder={r.applied ? "변경 내역 입력" : "미적용 사유 입력"}
                                style={noteInput} />}
                        </td>
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 테일러링결과서 표 셀 스타일
const cell = { border:`1px solid ${T.border}`, padding:"5px 8px", color:T.text };
const cellHead = { border:`1px solid ${T.border}`, padding:"5px 8px", background:T.surface, color:T.muted, fontWeight:600, whiteSpace:"nowrap" };
function SectionTitle({ n, title }) {
  return <div style={{ fontSize:12.5, fontWeight:700, margin:"16px 0 8px", paddingBottom:4, borderBottom:`1px solid ${T.border}` }}>{n}. {title}</div>;
}

// ═══════════════════════════════════════════════════════════════════
// 근무일 달력 유틸 — 주말(토·일) + 사용자 지정 공휴일을 제외한 일정 계산.
// CPM 전진 일정(선행 FS 관계, 근무일 기준 기간)의 자체 구현 (외부 코드 미사용)
// ═══════════════════════════════════════════════════════════════════
function fmtDate(d) { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
function parseDate(s) { return new Date(s + "T00:00:00"); }
function addDaysStr(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
function isWorkday(s, hol) { const w = parseDate(s).getDay(); return w !== 0 && w !== 6 && !hol.includes(s); }
function nextWorkday(s, hol) { let x = s, g = 0; while (!isWorkday(x, hol) && g < 370) { x = addDaysStr(x, 1); g++; } return x; }
// 시작일을 1일째로 세어 n번째 근무일을 반환 (공수 n일 → 종료일)
function addWorkdays(s, n, hol) {
  let x = nextWorkday(s, hol), c = 1, g = 0;
  while (c < n && g < 3700) { x = addDaysStr(x, 1); if (isWorkday(x, hol)) c++; g++; }
  return x;
}
// 두 날짜 사이(양끝 포함)의 근무일 수
function countWorkdays(a, b, hol) {
  if (!a || !b || b < a) return 0;
  let x = a, c = 0, g = 0;
  while (x <= b && g < 3700) { if (isWorkday(x, hol)) c++; x = addDaysStr(x, 1); g++; }
  return c;
}
// 전진 일정 재계산: 선행(FS) 종료일 → 시작일(동일 날짜), 시작일+공수 → 종료일. 연쇄 전파.
function recalcSchedule(tasks, holidays) {
  const all = []; tasks.forEach(t => (t.subtasks || []).forEach(s => all.push(s)));
  const byCode = {}; all.forEach(s => { byCode[s.wbsCode] = s; });
  const cap = all.length + 3;
  for (let it = 0; it < cap; it++) {
    let changed = false;
    for (const s of all) {
      if (s.pred) {
        // 선행(FS) 작업의 종료일을 그대로 시작일로 사용 (여러 개면 가장 늦은 종료일)
        const fins = String(s.pred).split(",").map(x => byCode[x.trim()]).filter(p => p && p.finish).map(p => p.finish);
        if (fins.length) {
          const ns = fins.sort().slice(-1)[0];
          if (s.start !== ns) { s.start = ns; changed = true; }
        }
      }
      // 직접 입력한 시작일만 근무일로 스냅 (선행에서 온 시작일은 선행 종료일과 정확히 일치시킴)
      if (!s.pred && s.start && !isWorkday(s.start, holidays)) {
        const ns = nextWorkday(s.start, holidays);
        if (ns !== s.start) { s.start = ns; changed = true; }
      }
      const eff = Number(s.effort) || 0;
      if (s.start && eff > 0) {
        const nf = addWorkdays(s.start, eff, holidays);
        if (s.finish !== nf) { s.finish = nf; changed = true; }
      }
    }
    if (!changed) break;
  }
  return tasks;
}

// 공휴일 지정용 월 달력 — 주말 색상 구분, 평일 클릭으로 공휴일 토글
function HolidayCalendar({ holidays, onToggle }) {
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const mv = (k) => setYm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const z = n => String(n).padStart(2, "0");
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, width: 250, flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => mv(-1)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}>◀</button>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{ym.y}년 {ym.m + 1}월</span>
        <button onClick={() => mv(1)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}>▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center" }}>
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div key={w} style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? T.red : i === 6 ? T.accent : T.muted, padding: "2px 0" }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={"e" + i} />;
          const ds = `${ym.y}-${z(ym.m + 1)}-${z(d)}`;
          const dow = (startDow + d - 1) % 7;
          const weekend = dow === 0 || dow === 6;
          const isHol = holidays.includes(ds);
          return (
            <div key={ds} onClick={() => { if (!weekend) onToggle(ds); }}
              title={weekend ? "주말 (비근무일)" : isHol ? "공휴일 (클릭 시 해제)" : "클릭하여 공휴일 지정"}
              style={{ fontSize: 11, padding: "4px 0", borderRadius: 5, cursor: weekend ? "default" : "pointer",
                background: isHol ? T.red + "33" : weekend ? T.subtle : "transparent",
                color: isHol ? T.red : dow === 0 ? T.red + "99" : dow === 6 ? T.accent + "99" : T.text,
                border: isHol ? `1px solid ${T.red}66` : "1px solid transparent", fontWeight: isHol ? 700 : 400 }}>
              {d}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9.5, color: T.muted, marginTop: 8, lineHeight: 1.6 }}>
        평일을 클릭하면 <span style={{ color: T.red }}>공휴일</span>로 지정/해제됩니다. 주말(토·일)은 자동으로 비근무일 처리됩니다.
      </div>
    </div>
  );
}

// WBS 최하위(리프) Task 판별 — 같은 단계(subtasks) 안에 자신의 코드로 시작하는 하위 행이 없으면 최하위
// 예: "9.2.1"은 "9.2.1.1"이 존재하면 중간 계층, 없으면 최하위. 산출물은 최하위 Task에만 표시·집계한다.
function isWbsLeaf(subtasks, code) {
  const c = String(code || "");
  if (!c) return false;
  return !(subtasks || []).some(o => String(o?.wbsCode || "").startsWith(c + "."));
}

function StepWBS({ wbsData, setWbsData, generating, genError, onRecommendPBS, wbsSetup, setWbsSetup, tailoring, ossp }) {
  const guide = getGuideForOSSP(ossp);
  const scale = tailoring?.scale || "중형";
  const method = tailoring?.method || "UML";
  const excluded = tailoring?.excluded || {};
  const notes = tailoring?.notes || {};
  const holidays = wbsSetup?.holidays || [];
  const [showCal, setShowCal] = useState(false);
  const [showMgmt, setShowMgmt] = useState(false);   // 관리 프로세스 작업 목록 펼침

  // ── 관리 프로세스 작업: PDP(테일러링결과서)에서 '적용'으로 확정된 항목만 그대로 WBS에 반영 ──
  //    (별도 포함/제외 선택 없음 — 적용 여부는 PDP·프로세스 테일러링 탭에서만 결정)
  const mgmtItems = resolveProcessTailoring(tailoring?.process).filter(r => r.applied);
  const mgmtByArea = {};
  mgmtItems.forEach(r => { (mgmtByArea[r.area] = mgmtByArea[r.area] || []).push(r); });
  const firstOutput = (outputs) => {
    const toks = String(outputs||"").split(/,|\s\/\s/).map(x=>x.trim()).filter(Boolean);
    return toks.find(t => t.length >= 2 && t !== "예") || toks[0] || "";   // "예, ..." 같은 예시 접두 토큰 제외
  };

  // ── FBS: PDP(테일러링결과서)에서 적용 확정된 산출물 → 단계별 Activity ──
  const isApplied = (d) => {
    if (d.required) return true;   // 필수(M) 산출물은 항상 적용
    const ov = notes[`${d.phase}:${d.code}`]?.applied;
    return ov !== undefined ? ov : !excluded[d.code];
  };
  const fbs = classifyDeliverables(scale, method, guide).filter(isApplied);
  const fbsByPhase = {};
  fbs.forEach(d => { (fbsByPhase[d.phase] = fbsByPhase[d.phase] || []).push(d); });
  const phases = guide.phaseOrder.filter(ph => fbsByPhase[ph]?.length);

  // ── PBS: "L1 > L2 > L3" 한 줄 형식 텍스트 → leaf 목록 ──
  const pbsText = wbsSetup?.pbsText || "";
  const leaves = pbsText.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
    const p = line.split(">").map(x => x.trim()).filter(Boolean);
    return { l1: p[0] || "", l2: p[1] || "", l3: p[2] || "" };
  }).filter(l => l.l1);

  const selected = wbsSetup?.selected || {};
  const selKey = (d, li) => `${d.phase}|${d.code}|${li}`;
  const toggleCell = (d, li) => setWbsSetup(s => {
    const sel = { ...(s.selected || {}) };
    const k = `${d.phase}|${d.code}|${li}`;
    sel[k] = !sel[k];
    return { ...s, selected: sel };
  });
  const setRowAll = (d, val) => setWbsSetup(s => {
    const sel = { ...(s.selected || {}) };
    leaves.forEach((_, li) => { sel[`${d.phase}|${d.code}|${li}`] = val; });
    return { ...s, selected: sel };
  });
  const rowAllOn = (d) => leaves.length > 0 && leaves.every((_, li) => selected[selKey(d, li)]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  // ── 공통: 시스템 구성요소로 분해하지 않고 산출물 1건으로 작성 (구성요소 선택과 상호배타) ──
  const common = wbsSetup?.common || {};
  const comKey = (d) => `${d.phase}|${d.code}`;
  const toggleCommon = (d) => setWbsSetup(s => {
    const com = { ...(s.common || {}) };
    const k = `${d.phase}|${d.code}`;
    com[k] = !com[k];
    const sel = { ...(s.selected || {}) };
    if (com[k]) leaves.forEach((_, li) => { delete sel[`${d.phase}|${d.code}|${li}`]; });
    return { ...s, common: com, selected: sel };
  });
  const commonCount = Object.values(common).filter(Boolean).length;

  // ── 공휴일 토글: 설정 저장 + 기존 일정 즉시 재계산 ──
  const toggleHoliday = (ds) => {
    const nh = holidays.includes(ds) ? holidays.filter(x => x !== ds) : [...holidays, ds].sort();
    setWbsSetup(su => ({ ...su, holidays: nh }));
    if (wbsData?.tasks) {
      setWbsData(w => {
        const tasks = w.tasks.map(t => ({ ...t, subtasks: (t.subtasks || []).map(s => ({ ...s })) }));
        recalcSchedule(tasks, nh);
        return { ...w, tasks, holidays: nh };
      });
    }
  };

  // ── 행 편집: 값 반영 후 전진 일정 재계산 (종료일 직접 수정 시 공수 역산) ──
  const updateRow = (tid, sid, patch) => setWbsData(w => {
    const tasks = w.tasks.map(t => ({ ...t, subtasks: (t.subtasks || []).map(s => ({ ...s })) }));
    const t = tasks.find(x => x.id === tid);
    const s = t?.subtasks.find(x => x.id === sid);
    if (!s) return w;
    Object.assign(s, patch);
    if (patch.finish !== undefined && s.start) {
      if (s.finish && s.finish < s.start) s.finish = s.start;
      s.effort = countWorkdays(s.start, s.finish, holidays) || "";
    }
    recalcSchedule(tasks, holidays);
    return { ...w, tasks, holidays };
  });

  // ── WBS 생성 — 엑셀 매크로 'WBS자동생성'의 번호 체계 a.b.c.d.e 이식 ──
  function buildWBS() {
    const rows = [];
    let a = 0;
    // 1) 관리 프로세스 작업 (프로세스 테일러링 적용분) — 영역 단위, 시스템 구성요소 분해 없음
    for (const area of Object.keys(mgmtByArea)) {
      a += 1; let b = 0;
      rows.push({ level: 1, wbsCode: `${a}`, name: area, deliverable: "" });
      for (const m of mgmtByArea[area]) {
        b += 1;
        rows.push({ level: 2, wbsCode: `${a}.${b}`,
          name: m.activity ? `${m.process} — ${m.activity}` : m.process,
          deliverable: firstOutput(m.outputs) });
      }
    }
    // 2) 단계별 산출물 작성 작업 (방법론 테일러링 × 시스템 구성요소 매트릭스)
    for (const ph of phases) {
      const acts = fbsByPhase[ph].filter(d => common[comKey(d)] || leaves.some((_, li) => selected[selKey(d, li)]));
      if (!acts.length) continue;
      a += 1; let b = 0;
      rows.push({ level: 1, wbsCode: `${a}`, name: ph, deliverable: "" });
      for (const d of acts) {
        b += 1;
        if (common[comKey(d)]) {
          // 공통: 시스템 구성요소 분해 없이 산출물 작성 1건으로 종료
          rows.push({ level: 2, wbsCode: `${a}.${b}`, name: `${d.name} 작성`, deliverable: d.name });
          continue;
        }
        rows.push({ level: 2, wbsCode: `${a}.${b}`, name: `${d.name} 작성`, deliverable: "" });
        let c = 0, dd = 0, e = 0;
        const seenL1 = new Set(), seenL2 = new Set();
        leaves.forEach((leaf, li) => {
          if (!selected[selKey(d, li)]) return;
          if (leaf.l1 && !seenL1.has(leaf.l1)) {
            seenL1.add(leaf.l1);
            c += 1; dd = 0; e = 0;
            rows.push({ level: 3, wbsCode: `${a}.${b}.${c}`, name: leaf.l1, deliverable: d.name });
          }
          if (leaf.l2 && (leaf.l2 === "공통" || !seenL2.has(leaf.l2))) {
            if (leaf.l2 !== "공통") seenL2.add(leaf.l2);
            dd += 1; e = 0;
            rows.push({ level: 4, wbsCode: `${a}.${b}.${c}.${dd}`, name: leaf.l2, deliverable: d.name });
          }
          if (leaf.l3 && dd > 0) {
            e += 1;
            rows.push({ level: 5, wbsCode: `${a}.${b}.${c}.${dd}.${e}`, name: leaf.l3, deliverable: d.name });
          }
        });
      }
    }
    if (!rows.length) return;
    // 산출물은 최하위 Task에만 지정 — 하위 계층 행이 있는 중간 행(요약 성격)의 산출물은 비운다
    rows.forEach(r => {
      if (r.deliverable && rows.some(o => String(o.wbsCode || "").startsWith(r.wbsCode + "."))) r.deliverable = "";
    });
    const tasks = [];
    let cur = null;
    rows.forEach((r, idx) => {
      if (r.level === 1) {
        cur = { id: `t${idx}`, wbsCode: r.wbsCode, phase: r.name, duration: "", subtasks: [] };
        tasks.push(cur);
      } else if (cur) {
        cur.subtasks.push({ id: `s${idx}`, wbsCode: r.wbsCode, task: r.name, level: r.level, deliverable: r.deliverable,
          assignee: "", pred: "", start: "", finish: "", effort: "", duration: "", status: "대기" });
      }
    });
    setWbsData({ tasks, pbsText, holidays });
  }

  // 단계(요약) 행 롤업: 하위 작업의 시작 최소 ~ 종료 최대 · 공수 합계
  const rollup = (t) => {
    const ss = (t.subtasks || []).map(s => s.start).filter(Boolean).sort();
    const ff = (t.subtasks || []).map(s => s.finish).filter(Boolean).sort();
    const eff = (t.subtasks || []).reduce((n, s) => n + (Number(s.effort) || 0), 0);
    return { start: ss[0] || "", finish: ff.slice(-1)[0] || "", eff };
  };

  const th = { ...cellHead, textAlign: "center", fontSize: 10 };
  const edInput = { width: "100%", boxSizing: "border-box", background: "transparent", border: "none",
    borderBottom: `1px dashed ${T.border}`, color: T.text, fontSize: 10.5, fontFamily: "inherit", outline: "none", padding: "2px 2px" };
  const edDate = { ...edInput, colorScheme: "dark", width: 112 };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>WBS 자동 생성 (단계별 산출물 × 시스템 구성요소)</h2>
        <p style={{ fontSize: 11, color: T.muted }}>
          단계별 산출물은 PDP(테일러링결과서)에서, 관리 프로세스 작업은 프로세스 테일러링에서 자동 구성됩니다. 시스템 구성요소를 정의하고, 매트릭스에서 산출물이 적용될 구성요소를 선택한 뒤 WBS를 생성하세요.
        </p>
      </div>
      {genError && <div style={{ color: T.red, fontSize: 12, padding: 10, background: T.red + "11", borderRadius: 9, marginBottom: 10 }}>{genError}</div>}

      {/* 1. PBS 정의 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>① 시스템 구성요소 <span style={{ color: T.muted, fontWeight: 400, fontSize: 11 }}>(제품 분해 구조, PBS) · {leaves.length}개 요소</span></div>
          <Btn variant="outline" onClick={onRecommendPBS} disabled={generating} style={{ fontSize: 11, padding: "4px 10px" }}>
            {generating ? "추천 중…" : "⚡ AI 추천"}
          </Btn>
        </div>
        {generating && <div style={{ marginBottom: 6 }}><Spinner text="프로젝트 정보 기반 시스템 구성요소 구성 중…" /></div>}
        <textarea value={pbsText}
          onChange={e => setWbsSetup(s => ({ ...s, pbsText: e.target.value }))}
          placeholder={"한 줄에 하나씩 \"L1 > L2 > L3\" 형식으로 입력하세요.\n예)\n포털시스템 > 사용자관리 > 로그인\n포털시스템 > 사용자관리 > 권한관리\n포털시스템 > 게시판\n인터페이스 > 공통"}
          rows={6}
          style={{ width: "100%", boxSizing: "border-box", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.7 }} />
        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>※ L3을 사용하려면 L2가 있어야 합니다. 여러 요소에 공통 적용되는 부분은 L2에 "공통"을 사용하세요 (WBS에서 중복 허용).</div>
      </div>

      {/* 2. 단계별 산출물 × 시스템 구성요소 매트릭스 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>② 단계별 산출물 × 시스템 구성요소 매트릭스 <span style={{ color: T.muted, fontWeight: 400, fontSize: 11 }}>· 선택 {selectedCount}칸{commonCount > 0 ? ` · 공통 ${commonCount}건` : ""}</span></div>
          <Btn onClick={buildWBS} disabled={selectedCount === 0 && commonCount === 0 && mgmtItems.length === 0} style={{ fontSize: 12, padding: "6px 12px" }}>⚙ WBS 생성</Btn>
        </div>
        {leaves.length === 0 ? (
          <div style={{ fontSize: 11, color: T.muted, padding: "14px 12px", background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 10 }}>
            시스템 구성요소를 먼저 입력하면 매트릭스가 표시됩니다.
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 10.5, minWidth: "100%" }}>
              <thead>
                <tr>
                  <td style={{ ...th, textAlign: "left" }} rowSpan={3}>단계</td>
                  <td style={{ ...th, textAlign: "left", minWidth: 150 }} rowSpan={3}>단계별 산출물</td>
                  <td style={th} rowSpan={3}>전체</td>
                  <td style={th} rowSpan={3}>공통</td>
                  {leaves.map((l, li) => <td key={"h1" + li} style={{ ...th, background: "#16233a" }}>{l.l1}</td>)}
                </tr>
                <tr>{leaves.map((l, li) => <td key={"h2" + li} style={th}>{l.l2 || "—"}</td>)}</tr>
                <tr>{leaves.map((l, li) => <td key={"h3" + li} style={th}>{l.l3 || "—"}</td>)}</tr>
              </thead>
              <tbody>
                {phases.map(ph => (
                  fbsByPhase[ph].map((d, i) => (
                    <tr key={`${ph}-${d.code}`}>
                      {i === 0 && <td style={{ ...cell, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }} rowSpan={fbsByPhase[ph].length}>{ph}</td>}
                      <td style={{ ...cell, whiteSpace: "nowrap" }}><span style={{ color: T.muted, fontFamily: "monospace", fontSize: 9.5, marginRight: 5 }}>{d.code}</span>{d.name}</td>
                      <td style={{ ...cell, textAlign: "center" }}>
                        <input type="checkbox" checked={rowAllOn(d)} disabled={!!common[comKey(d)]} onChange={e => setRowAll(d, e.target.checked)} style={{ width: 12, height: 12, cursor: common[comKey(d)] ? "not-allowed" : "pointer", opacity: common[comKey(d)] ? 0.35 : 1 }} />
                      </td>
                      <td style={{ ...cell, textAlign: "center", background: common[comKey(d)] ? T.accentDim : "transparent" }}>
                        <input type="checkbox" checked={!!common[comKey(d)]} onChange={() => toggleCommon(d)} style={{ width: 12, height: 12, cursor: "pointer" }} />
                      </td>
                      {leaves.map((_, li) => {
                        const isCom = !!common[comKey(d)];
                        const on = !!selected[selKey(d, li)];
                        return (
                          <td key={li} onClick={() => { if (!isCom) toggleCell(d, li); }}
                            style={{ ...cell, textAlign: "center", cursor: isCom ? "not-allowed" : "pointer", background: on ? T.accentDim : "transparent", color: on ? "#bfd4ff" : T.muted, userSelect: "none", opacity: isCom ? 0.4 : 1 }}>
                            {on ? "●" : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. 관리 프로세스 작업 — PDP에서 적용 확정된 항목만 그대로 표시 (읽기 전용) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>③ 관리 프로세스 작업 <span style={{ color: T.muted, fontWeight: 400, fontSize: 11 }}>· PDP 적용 확정 {mgmtItems.length}건 — WBS 앞부분에 자동 추가</span></div>
          <Btn variant="outline" onClick={() => setShowMgmt(v => !v)} style={{ fontSize: 11, padding: "4px 10px" }}>
            {showMgmt ? "접기 ▲" : "목록 보기 ▼"}
          </Btn>
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginBottom: showMgmt ? 6 : 0 }}>
          ※ PDP(테일러링결과서)의 프로세스 테일러링 내역서에서 '적용'으로 확정된 관리 프로세스만 반영됩니다. 적용 여부를 바꾸려면 테일러링 단계 또는 PDP 화면에서 수정하세요.
        </div>
        {showMgmt && (
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", background: T.bg, display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.keys(mgmtByArea).map(area => (
              <div key={area}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 4 }}>
                  {area} <span style={{ color: T.muted, fontWeight: 400 }}>({mgmtByArea[area].length})</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {mgmtByArea[area].map(r => (
                    <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text }}>
                      <span style={{ color: T.green, flexShrink: 0 }}>✓</span>
                      <span>
                        {r.process}{r.activity && <span style={{ color: T.muted }}> › {r.activity}</span>}
                        {r.changed && <Badge color={T.amber}>변경적용</Badge>}
                      </span>
                      {firstOutput(r.outputs) && <span style={{ color: T.muted, fontSize: 9.5 }}>→ {firstOutput(r.outputs)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 일정 계획 (생성 결과 편집) */}
      {wbsData?.tasks?.length > 0 && (
        <div style={{ animation: "fadeIn .4s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>④ 일정 계획</div>
              <Badge color={T.green}>✓ {wbsData.tasks.reduce((n, t) => n + 1 + (t.subtasks?.length || 0), 0)}개 항목</Badge>
              <Badge color={T.accent}>단계 {wbsData.tasks.length} · 최하위 Task {wbsData.tasks.reduce((n, t) => n + (t.subtasks || []).filter(s => isWbsLeaf(t.subtasks, s.wbsCode)).length, 0)}건 · 산출물 {wbsData.tasks.reduce((n, t) => n + (t.subtasks || []).filter(s => isWbsLeaf(t.subtasks, s.wbsCode) && String(s.deliverable || "").trim()).length, 0)}건</Badge>
              {holidays.length > 0 && <Badge color={T.red}>공휴일 {holidays.length}일</Badge>}
            </div>
            <Btn variant="outline" onClick={() => setShowCal(v => !v)} style={{ fontSize: 11, padding: "4px 10px" }}>
              📅 {showCal ? "달력 닫기" : "달력 · 공휴일 설정"}
            </Btn>
          </div>

          {showCal && (
            <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <HolidayCalendar holidays={holidays} onToggle={toggleHoliday} />
              <div style={{ flex: 1, minWidth: 220, fontSize: 11, color: T.muted, lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>일정 계산 규칙 (근무일 기준)</div>
                <div>· 시작일 + 투입공수(근무일) → 종료일 자동 계산 (주말·공휴일 제외)</div>
                <div>· 종료일을 직접 수정하면 투입공수를 역산</div>
                <div>· 선행에 선행 WBS 코드 입력(쉼표 구분) → 선행 작업의 종료일이 시작일로 자동 입력 (여러 개면 가장 늦은 종료일)</div>
                <div>· 공휴일 변경 시 전체 일정 즉시 재계산</div>
                {holidays.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontWeight: 700, color: T.text }}>지정된 공휴일:</span>{" "}
                    {holidays.map(h => (
                      <span key={h} onClick={() => toggleHoliday(h)} title="클릭하여 해제"
                        style={{ display: "inline-block", margin: "2px 4px 2px 0", padding: "1px 7px", borderRadius: 5, background: T.red + "22", color: T.red, cursor: "pointer", fontSize: 10.5 }}>
                        {h} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 10.5, minWidth: "100%" }}>
              <thead>
                <tr>
                  <td style={{ ...th, textAlign: "left" }}>WBS</td>
                  <td style={{ ...th, textAlign: "left", minWidth: 170 }}>Task</td>
                  <td style={{ ...th, minWidth: 100 }}>산출물</td>
                  <td style={{ ...th, minWidth: 70 }}>작업자</td>
                  <td style={{ ...th, minWidth: 80 }}>선행<br/><span style={{ fontWeight: 400, fontSize: 8.5 }}>(선행 WBS, 쉼표)</span></td>
                  <td style={th}>시작일</td>
                  <td style={th}>종료일</td>
                  <td style={{ ...th, width: 60 }}>공수(일)</td>
                </tr>
              </thead>
              <tbody>
                {wbsData.tasks.map(t => {
                  const r = rollup(t);
                  return (
                    <React.Fragment key={t.id}>
                      <tr style={{ background: T.subtle }}>
                        <td style={{ ...cell, fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{t.wbsCode}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{t.phase}</td>
                        <td style={cell} colSpan={3}><span style={{ fontSize: 9.5, color: T.muted }}>요약 (하위 롤업)</span></td>
                        <td style={{ ...cell, textAlign: "center", color: T.muted }}>{r.start || "—"}</td>
                        <td style={{ ...cell, textAlign: "center", color: T.muted }}>{r.finish || "—"}</td>
                        <td style={{ ...cell, textAlign: "center", color: T.muted, fontWeight: 700 }}>{r.eff || "—"}</td>
                      </tr>
                      {t.subtasks?.map(s => (
                        <tr key={s.id}>
                          <td style={{ ...cell, fontFamily: "monospace", fontSize: 9.5, color: T.muted, whiteSpace: "nowrap" }}>{s.wbsCode}</td>
                          <td style={{ ...cell, paddingLeft: 8 + ((s.level || 2) - 2) * 14 }}>
                            <input value={s.task || ""} onChange={e => updateRow(t.id, s.id, { task: e.target.value })} style={edInput} />
                          </td>
                          <td style={cell}>
                            {isWbsLeaf(t.subtasks, s.wbsCode)
                              ? <input value={s.deliverable || ""} onChange={e => updateRow(t.id, s.id, { deliverable: e.target.value })} style={edInput} />
                              : <span style={{ fontSize: 9.5, color: T.muted }}>—</span>}
                          </td>
                          <td style={cell}>
                            <input value={s.assignee || ""} onChange={e => updateRow(t.id, s.id, { assignee: e.target.value })} style={edInput} />
                          </td>
                          <td style={cell}>
                            <input value={s.pred || ""} onChange={e => updateRow(t.id, s.id, { pred: e.target.value })} placeholder="예: 1.1.1" style={edInput} />
                          </td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>
                            <input type="date" value={s.start || ""} onChange={e => updateRow(t.id, s.id, { start: e.target.value })}
                              disabled={!!s.pred} title={s.pred ? "선행 작업에 의해 자동 계산됩니다" : ""} style={{ ...edDate, opacity: s.pred ? 0.55 : 1 }} />
                          </td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>
                            <input type="date" value={s.finish || ""} onChange={e => updateRow(t.id, s.id, { finish: e.target.value })} style={edDate} />
                          </td>
                          <td style={cell}>
                            <input type="number" min="0" value={s.effort || ""} onChange={e => updateRow(t.id, s.id, { effort: e.target.value })}
                              style={{ ...edInput, textAlign: "center", width: 50 }} />
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>
            ※ 매트릭스를 수정한 뒤 "WBS 생성"을 다시 누르면 구조가 재생성됩니다 (입력한 일정은 초기화). 일정·작업자·사유는 프로젝트 저장 시 함께 보존됩니다.
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 산출물 ZIP 일괄 다운로드 — 외부 라이브러리 없이 각 산출물을 실제 MS Office
// 파일(docx/xlsx/pptx = OOXML)로 생성해 단계별 폴더 구조의 ZIP으로 묶는다.
// 형식 자동 배정: 매트릭스·대장·목록·백로그·체크리스트 등 표 성격 → xlsx,
// 오리엔테이션·교육·데모 자료 → pptx, 그 외 계획서·정의서·보고서 → docx.
// OSSP 라이브러리 '산출물템플릿'에 이름이 일치하는 실파일이 있으면 그 파일을 사용,
// 없으면 스켈레톤 문서를 생성한다 (WBS·테일러링결과서는 동적 실데이터 문서가 우선).
// ═══════════════════════════════════════════════════════════════════
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// files: [{ path, content: string | Uint8Array }] → ZIP 바이트 (무압축 STORED, UTF-8 파일명)
function zipBytes(files) {
  const enc = new TextEncoder();
  const u16 = v => [v & 255, (v >>> 8) & 255];
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const chunks = []; const central = []; let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.path);
    const dataB = f.content instanceof Uint8Array ? f.content : enc.encode(f.content);
    const crc = crc32(dataB);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(dataB.length), ...u32(dataB.length), ...u16(nameB.length), ...u16(0)]);
    chunks.push(local, nameB, dataB);
    central.push({ nameB, crc, size: dataB.length, offset });
    offset += local.length + nameB.length + dataB.length;
  }
  const cdStart = offset; let cdSize = 0;
  for (const e of central) {
    const hdr = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.offset)]);
    chunks.push(hdr, e.nameB); cdSize += hdr.length + e.nameB.length;
  }
  chunks.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
  let total = 0; chunks.forEach(c => { total += c.length; });
  const out = new Uint8Array(total); let pos = 0;
  chunks.forEach(c => { out.set(c, pos); pos += c.length; });
  return out;
}

const xesc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ── DOCX ─────────────────────────────────────────────────────
function docxP(text, { bold = false, italic = false, size = 22, spacingAfter = 120, align = "" } = {}) {
  return `<w:p><w:pPr><w:spacing w:after="${spacingAfter}"/>${align ? `<w:jc w:val="${align}"/>` : ""}</w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xesc(text)}</w:t></w:r></w:p>`;
}
function docxTable(rows, headerCols = 0) {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>';
  // 셀 내부 여백: 왼쪽 3mm(170twip), 오른쪽 2mm(113twip), 상하 0.7mm(40twip) — 글자가 테두리에 붙지 않게
  const cellMar = '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="113" w:type="dxa"/></w:tblCellMar>';
  const trs = rows.map((cells, ri) => "<w:tr>" + cells.map((c, ci) => {
    const head = ri === 0 && headerCols === -1 ? true : ci < headerCols;
    return `<w:tc><w:tcPr>${head ? '<w:shd w:val="clear" w:fill="EFEFEF"/><w:vAlign w:val="center"/>' : ""}</w:tcPr><w:p>${head ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ""}<w:r><w:rPr>${head ? "<w:b/>" : ""}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${xesc(c)}</w:t></w:r></w:p></w:tc>`;
  }).join("") + "</w:tr>").join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}${cellMar}</w:tblPr>${trs}</w:tbl><w:p/>`;
}

// dataURL(PNG/JPEG) → { ext, bytes } — 로고 임베드용
function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/(png|jpe?g));base64,(.*)$/i.exec(String(dataUrl || ""));
  if (!m) return null;
  const bin = atob(m[3]);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return { ext: m[2].toLowerCase() === "png" ? "png" : "jpeg", bytes: b };
}
// 인라인 이미지 run (cx/cy: EMU, 1cm = 360000)
function docxImageRun(relId, cx, cy, id) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Logo${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Logo${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
// 서명 줄: 상단 가로선 + "작성자:      일자:" (첨부 양식의 서명란)
function docxSignLine(label) {
  return `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:tabs><w:tab w:val="left" w:pos="4800"/></w:tabs><w:spacing w:before="240" w:after="300"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${xesc(label)}: </w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">일자: </w:t></w:r></w:p>`;
}
// 2페이지 상단 문서 정보 표: 좌측 로고(세로 병합) + 제목(가로 병합) + 프로젝트/단계/시스템/문서번호/작성자/작성일자
function docxInfoHeaderTable({ logoXml, title, rows }) {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="6" w:color="000000"/><w:left w:val="single" w:sz="6" w:color="000000"/><w:bottom w:val="single" w:sz="6" w:color="000000"/><w:right w:val="single" w:sz="6" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="666666"/><w:insideV w:val="single" w:sz="4" w:color="666666"/></w:tblBorders>';
  const cellMar = '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>';
  const grid = [1700, 1300, 2200, 1300, 2526].map(w => `<w:gridCol w:w="${w}"/>`).join("");
  const tc = (xml, { span, vmerge, shade, center, w } = {}) =>
    `<w:tc><w:tcPr>${w ? `<w:tcW w:w="${w}" w:type="dxa"/>` : ""}${span ? `<w:gridSpan w:val="${span}"/>` : ""}${vmerge ? `<w:vMerge${vmerge === "restart" ? ' w:val="restart"' : ""}/>` : ""}${shade ? '<w:shd w:val="clear" w:fill="EFEFEF"/>' : ""}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="${center ? "center" : "left"}"/></w:pPr>${xml}</w:p></w:tc>`;
  const txt = (t, { bold, size = 20 } = {}) => `<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xesc(t)}</w:t></w:r>`;
  const r1 = `<w:tr><w:trPr><w:trHeight w:val="560"/></w:trPr>${tc(logoXml, { vmerge: "restart", center: true, w: 1700 })}${tc(txt(title, { bold: true, size: 32 }), { span: 4, center: true })}</w:tr>`;
  const rs = rows.map(cs => `<w:tr>${tc("", { vmerge: true, w: 1700 })}${tc(txt(cs[0], { bold: true }), { shade: true, center: true, w: 1300 })}${tc(txt(cs[1]), { w: 2200 })}${tc(txt(cs[2], { bold: true }), { shade: true, center: true, w: 1300 })}${tc(txt(cs[3]), { w: 2526 })}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}${cellMar}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${r1}${rs}</w:tbl><w:p/>`;
}
// 로고 소스 통일: 위저드는 form.clientLogo/companyLogo, 저장된 프로젝트는 tailoring.logos
function getDocLogos(meta) {
  const l = meta?.tailoring?.logos || {};
  return { client: meta?.clientLogo || l.client || null, company: meta?.companyLogo || l.company || null };
}
// ── OSSP 템플릿 실파일(docx)에 프로젝트 로고 주입 ─────────────────────────
// 다운로드한 템플릿 ZIP을 브라우저 내장 inflate(DecompressionStream)로 해체하고,
// (1) 본문·머리말·꼬리말의 '고객사로고'/'우리회사로고' 플레이스홀더 텍스트 → 로고 이미지 치환
// (2) 본문·머리말의 첫 번째 표에서 세로 병합(vMerge restart)된 짧은 텍스트 셀(예: 조직 약칭) → 고객사 로고 치환
// (3) 표지(첫 페이지 나누기·구역 나누기 직전)에 우측 정렬 로고 문단 삽입
// (4) 기본(default·even) 꼬리말을 표준 로고 꼬리말(고객사로고·쪽번호·우리회사로고)로 교체 — 표지용(first) 꼬리말은 유지,
//     꼬리말이 아예 없는 템플릿에는 새로 만들어 연결
// 후 무압축 ZIP으로 재조립한다. 어떤 단계든 실패하면 null을 반환해 원본을 그대로 쓴다.
async function unzipBytes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD(0x06054b50) 탐색 — 뒤에서부터 (ZIP 코멘트 최대 65535B 고려)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("bad central directory");
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = td.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    if (!name.endsWith("/")) {
      let data;
      if (method === 0) data = comp.slice();
      else if (method === 8) {
        const ds = new DecompressionStream("deflate-raw");
        data = new Uint8Array(await new Response(new Response(comp.slice()).body.pipeThrough(ds)).arrayBuffer());
      } else throw new Error("unsupported compression method " + method);
      out.push({ path: name, content: data });
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
// 네임스페이스를 자체 선언한 인라인 이미지 run — 임의 템플릿 XML에도 안전하게 삽입 가능
function docxImageRunNS(relId, cx, cy, id) {
  const NSD = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  return `<w:r><w:drawing ${NSD}><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="PgLogo${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="PgLogo${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
async function injectLogosIntoTemplateDocx(bytes, meta) {
  const logos = getDocLogos(meta);
  const cl = logos.client?.dataUrl ? dataUrlToBytes(logos.client.dataUrl) : null;
  const co = logos.company?.dataUrl ? dataUrlToBytes(logos.company.dataUrl) : null;
  if (!cl && !co) return null;   // 프로젝트에 등록된 로고 없음 → 원본 유지
  const ratioOf = l => (Number(l?.w) > 0 && Number(l?.h) > 0) ? Math.min(Number(l.w) / Number(l.h), 8) : 3;
  const info = {
    C: cl && { relId: "rIdPgLogoC", fileName: `pg_logo_client.${cl.ext}`, bytes: cl.bytes, ratio: ratioOf(logos.client) },
    W: co && { relId: "rIdPgLogoW", fileName: `pg_logo_company.${co.ext}`, bytes: co.bytes, ratio: ratioOf(logos.company) },
  };
  const files = await unzipBytes(bytes);
  const td = new TextDecoder();
  const byPath = {}; files.forEach(f => { byPath[f.path] = f; });
  if (!byPath["word/document.xml"]) return null;   // docx 아님
  let imgId = 9000;
  const mkRun = (k, hEmu) => info[k] ? docxImageRunNS(info[k].relId, Math.max(1, Math.round(hEmu * info[k].ratio)), hEmu, ++imgId) : null;
  const usedByPart = {};   // part path → Set("C"/"W")
  const markUsed = (part, k) => { (usedByPart[part] = usedByPart[part] || new Set()).add(k); };

  // (2) 첫 번째 표의 로고 셀 치환: 첫 <w:tc>가 vMerge restart + 짧은 텍스트(≤12자) + 이미지 없음일 때만
  const injectFirstTableCell = (xml, part) => {
    const run = mkRun("C", 324000) || mkRun("W", 324000);
    const kind = info.C ? "C" : "W";
    if (!run) return xml;
    const ti = xml.indexOf("<w:tbl");
    if (ti < 0) return xml;
    const tcI2 = Math.min(...[xml.indexOf("<w:tc ", ti), xml.indexOf("<w:tc>", ti)].filter(i => i >= 0));
    if (!isFinite(tcI2)) return xml;
    const tcEnd = xml.indexOf("</w:tc>", tcI2);
    if (tcEnd < 0) return xml;
    const cell = xml.slice(tcI2, tcEnd);
    if (!/<w:vMerge\s+w:val="restart"/.test(cell)) return xml;
    if (cell.includes("<w:drawing")) return xml;
    const text = (cell.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(s => s.replace(/<[^>]+>/g, "")).join("").trim();
    if (text.length > 12) return xml;
    const pI = cell.search(/<w:p[\s>/]/);
    if (pI < 0) return xml;
    const newCell = cell.slice(0, pI) + `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run}</w:p>`;
    markUsed(part, kind);
    return xml.slice(0, tcI2) + newCell + xml.slice(tcEnd);
  };

  // (1) 플레이스홀더 텍스트 run 치환: '고객사로고'/'우리회사로고' ({} 감싼 형태 포함)
  const replacePlaceholders = (xml, part, hEmu) => {
    const runRe = /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>).)*?<w:t[^>]*>\s*\{?(고객사로고|우리회사로고)\}?\s*<\/w:t>(?:(?!<\/w:r>).)*?<\/w:r>/gs;
    return xml.replace(runRe, (m, name) => {
      const k = name === "고객사로고" ? "C" : "W";
      const run = mkRun(k, hEmu);
      if (!run) return m;
      markUsed(part, k);
      return run;
    });
  };

  // 원본 document.xml 기준 꼬리말 참조(type별) 수집 — 교체 대상 판별용
  const docXml0 = td.decode(byPath["word/document.xml"].content);
  const relsXml0 = byPath["word/_rels/document.xml.rels"] ? td.decode(byPath["word/_rels/document.xml.rels"].content) : "";
  const relTargetOf = {};   // rId → word/ 기준 상대경로
  (relsXml0.match(/<Relationship\s[^>]*\/>/g) || []).forEach(r => {
    const id = /\bId="([^"]+)"/.exec(r); const tg = /\bTarget="([^"]+)"/.exec(r);
    if (id && tg) relTargetOf[id[1]] = "word/" + tg[1].replace(/^\/?(word\/)?/, "");
  });
  const ftrRefs = (docXml0.match(/<w:footerReference[^>]*\/>/g) || []).map(s => ({
    type: (/w:type="([^"]+)"/.exec(s) || [])[1] || "default",
    rid: (/r:id="([^"]+)"/.exec(s) || [])[1] || "",
  }));

  const partRe = /^word\/(document|header\d*|footer\d*)\.xml$/;
  for (const f of files) {
    if (!partRe.test(f.path)) continue;
    let xml = td.decode(f.content);
    const isFtr = /footer/.test(f.path);
    xml = replacePlaceholders(xml, f.path, isFtr ? 216000 : 324000);
    if (!isFtr) xml = injectFirstTableCell(xml, f.path);
    f.content = xml;   // 문자열이면 zipBytes가 UTF-8 인코딩
  }

  // (3) 표지 로고: 첫 페이지 나누기(없으면 문단 내 구역 나누기) 직전에 우측 정렬 로고 문단 삽입
  {
    const df = byPath["word/document.xml"];
    let xml = typeof df.content === "string" ? df.content : td.decode(df.content);
    let anchor = -1;
    const br = xml.indexOf('<w:br w:type="page"');
    if (br >= 0) anchor = Math.max(xml.lastIndexOf("<w:p ", br), xml.lastIndexOf("<w:p>", br));
    if (anchor < 0) {
      const sp = xml.indexOf("<w:sectPr");
      if (sp >= 0) {
        const pStart = Math.max(xml.lastIndexOf("<w:p ", sp), xml.lastIndexOf("<w:p>", sp));
        if (pStart >= 0 && xml.indexOf("</w:p>", pStart) > sp) anchor = pStart;   // 문단 내 구역 나누기만 (본문 말미 sectPr 제외)
      }
    }
    // 표지 영역에 이미 로고를 넣었다면(플레이스홀더·셀 치환) 중복 삽입하지 않음
    if (anchor >= 0 && !xml.slice(0, anchor).includes('name="PgLogo')) {
      const runs = [];
      if (info.C) { const r = mkRun("C", 324000); if (r) { runs.push(r); markUsed(df.path, "C"); } }
      if (info.W) { const r = mkRun("W", 324000); if (r) { runs.push(r); markUsed(df.path, "W"); } }
      if (runs.length) {
        const ps = runs.map(r => `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="140"/></w:pPr>${r}</w:p>`).join("");
        xml = xml.slice(0, anchor) + ps + xml.slice(anchor);
      }
    }
    df.content = xml;
  }

  // (4) 꼬리말: 표준 로고 꼬리말(고객사로고 · 쪽번호 · 우리회사로고)로 교체 — first(표지) 꼬리말 제외
  const stdFtrInner = part => {
    const tabDefs = '<w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs>';
    const pageFld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const l = mkRun("C", 216000); const r = mkRun("W", 216000);
    if (l) markUsed(part, "C");
    if (r) markUsed(part, "W");
    return `<w:p><w:pPr>${tabDefs}<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="0" w:after="0"/></w:pPr>${l || ""}<w:r><w:tab/></w:r>${pageFld}<w:r><w:tab/></w:r>${r || ""}</w:p>`;
  };
  let ftrTargets = ftrRefs.filter(f => f.type !== "first").map(f => relTargetOf[f.rid]).filter(p => p && byPath[p]);
  if (!ftrRefs.length) ftrTargets = files.filter(f => /^word\/footer\d*\.xml$/.test(f.path)).map(f => f.path);   // 참조 파싱 실패 시 전체 폴백
  ftrTargets = [...new Set(ftrTargets)];
  if (ftrTargets.length) {
    for (const p of ftrTargets) {
      let fx = typeof byPath[p].content === "string" ? byPath[p].content : td.decode(byPath[p].content);
      fx = fx.replace(/(<w:ftr[^>]*>)[\s\S]*(<\/w:ftr>)/, (_, a, b) => a + stdFtrInner(p) + b);
      byPath[p].content = fx;
    }
  } else if (info.C || info.W) {
    // 꼬리말이 전혀 없는 템플릿: 표준 꼬리말 파트를 생성해 default 참조가 없는 모든 구역에 연결
    const fp = "word/footerPg.xml";
    const nf = { path: fp, content: XMLH + `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${stdFtrInner(fp)}</w:ftr>` };
    files.push(nf); byPath[fp] = nf;
    const df = byPath["word/document.xml"];
    let xml = typeof df.content === "string" ? df.content : td.decode(df.content);
    xml = xml.replace(/<w:sectPr(\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/g, (m, attrs, inner) =>
      /w:footerReference w:type="default"/.test(inner) ? m : `<w:sectPr${attrs || ""}><w:footerReference w:type="default" r:id="rIdPgFtr"/>${inner}</w:sectPr>`);
    df.content = xml;
    // document.xml.rels에 꼬리말 관계 추가 + Content Types override
    const rp = "word/_rels/document.xml.rels";
    if (byPath[rp]) {
      let rx = typeof byPath[rp].content === "string" ? byPath[rp].content : td.decode(byPath[rp].content);
      if (!rx.includes('Id="rIdPgFtr"')) rx = rx.replace("</Relationships>", '<Relationship Id="rIdPgFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerPg.xml"/></Relationships>');
      byPath[rp].content = rx;
    }
    const ct0 = byPath["[Content_Types].xml"];
    if (ct0) {
      let cx = typeof ct0.content === "string" ? ct0.content : td.decode(ct0.content);
      if (!cx.includes("/word/footerPg.xml")) cx = cx.replace("</Types>", '<Override PartName="/word/footerPg.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
      ct0.content = cx;
    }
  }

  const modified = Object.keys(usedByPart);
  if (!modified.length) return null;   // 치환 지점 없음 → 원본 유지

  // 사용된 파트별 이미지 관계(rels) 추가·생성
  const REL = k => `<Relationship Id="${info[k].relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${info[k].fileName}"/>`;
  for (const part of modified) {
    const relPath = part.replace(/^word\//, "word/_rels/") + ".rels";
    const rels = [...usedByPart[part]].map(REL).join("");
    if (byPath[relPath]) {
      let rx = typeof byPath[relPath].content === "string" ? byPath[relPath].content : td.decode(byPath[relPath].content);
      [...usedByPart[part]].forEach(k => { if (!rx.includes(`Id="${info[k].relId}"`)) rx = rx.replace("</Relationships>", REL(k) + "</Relationships>"); });
      byPath[relPath].content = rx;
    } else {
      const nf = { path: relPath, content: XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` };
      files.push(nf); byPath[relPath] = nf;
    }
  }
  // 로고 미디어 파일 추가 (파일명 충돌 시 그대로 덮어쓰지 않도록 신규 경로 사용: pg_ 접두)
  const usedKinds = new Set(); modified.forEach(p => usedByPart[p].forEach(k => usedKinds.add(k)));
  usedKinds.forEach(k => { if (!byPath[`word/media/${info[k].fileName}`]) files.push({ path: `word/media/${info[k].fileName}`, content: info[k].bytes }); });
  // [Content_Types].xml에 이미지 확장자 Default 보강
  const ct = byPath["[Content_Types].xml"];
  if (ct) {
    let cx = typeof ct.content === "string" ? ct.content : td.decode(ct.content);
    usedKinds.forEach(k => {
      const ext = info[k].fileName.split(".").pop();
      if (!new RegExp(`Extension="${ext}"`).test(cx)) cx = cx.replace("</Types>", `<Default Extension="${ext}" ContentType="image/${ext === "png" ? "png" : "jpeg"}"/></Types>`);
    });
    ct.content = cx;
  }
  return zipBytes(files);
}

// ── OSSP 템플릿 실파일(xlsx)에 프로젝트 로고 주입 ─────────────────────────
// 엑셀 템플릿의 드로잉(xl/drawings/drawing*.xml)에서 텍스트가 '고객사 로고'/'우리회사 로고'인
// 텍스트박스 도형을 같은 위치·높이의 로고 그림으로 교체 (너비는 로고 원본 비율로 조정)
async function injectLogosIntoTemplateXlsx(bytes, meta) {
  const logos = getDocLogos(meta);
  const cl = logos.client?.dataUrl ? dataUrlToBytes(logos.client.dataUrl) : null;
  const co = logos.company?.dataUrl ? dataUrlToBytes(logos.company.dataUrl) : null;
  if (!cl && !co) return null;   // 프로젝트에 등록된 로고 없음 → 원본 유지
  const ratioOf = l => (Number(l?.w) > 0 && Number(l?.h) > 0) ? Math.min(Number(l.w) / Number(l.h), 8) : 3;
  const info = {
    C: cl && { relId: "rIdPgLogoC", fileName: `pg_logo_client.${cl.ext}`, bytes: cl.bytes, ratio: ratioOf(logos.client) },
    W: co && { relId: "rIdPgLogoW", fileName: `pg_logo_company.${co.ext}`, bytes: co.bytes, ratio: ratioOf(logos.company) },
  };
  const files = await unzipBytes(bytes);
  const td = new TextDecoder();
  const byPath = {}; files.forEach(f => { byPath[f.path] = f; });
  if (!byPath["xl/workbook.xml"]) return null;   // xlsx 아님
  let imgId = 9000;
  const usedByPart = {};   // drawing 경로 → Set("C"/"W")
  const markUsed = (part, k) => { (usedByPart[part] = usedByPart[part] || new Set()).add(k); };

  // 드로잉별로 플레이스홀더 텍스트박스(xdr:sp) → 그림(xdr:pic) 교체
  const drawingPaths = files.map(f => f.path).filter(p => /^xl\/drawings\/drawing\d+\.xml$/.test(p));
  for (const part of drawingPaths) {
    const f = byPath[part];
    let xml = typeof f.content === "string" ? f.content : td.decode(f.content);
    let changed = false;
    xml = xml.replace(/<xdr:(oneCellAnchor|twoCellAnchor)(\s[^>]*)?>(?:(?!<\/xdr:\1>).)*?<\/xdr:\1>/gs, anchor => {
      const spM = /<xdr:sp[\s>](?:(?!<\/xdr:sp>).)*?<\/xdr:sp>/s.exec(anchor);
      if (!spM) return anchor;
      const text = [...spM[0].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m => m[1]).join("").replace(/[\s\u00a0{}]/g, "");
      const k = text === "고객사로고" ? "C" : text === "우리회사로고" ? "W" : null;
      if (!k || !info[k]) return anchor;
      // 크기: 원래 텍스트박스 높이(cy)를 유지하고 너비(cx)는 로고 비율에 맞춤
      const extM = /<xdr:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/.exec(anchor);
      const cy = extM ? Number(extM[2]) : 336246;
      const cx = Math.max(1, Math.round(cy * info[k].ratio));
      const offM = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/.exec(spM[0]);
      const off = offM ? `<a:off x="${offM[1]}" y="${offM[2]}"/>` : '<a:off x="0" y="0"/>';
      const id = ++imgId;
      const pic = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="PgLogo${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${info[k].relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm>${off}<a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
      let out = anchor.replace(spM[0], pic);
      if (extM) out = out.replace(extM[0], `<xdr:ext cx="${cx}" cy="${cy}"/>`);
      markUsed(part, k); changed = true;
      return out;
    });
    if (changed) f.content = xml;
  }

  const modified = Object.keys(usedByPart);
  if (!modified.length) return null;   // 플레이스홀더 없음 → 원본 유지

  // 수정된 드로잉별 이미지 관계(rels) 추가·생성
  const REL = k => `<Relationship Id="${info[k].relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${info[k].fileName}"/>`;
  for (const part of modified) {
    const relPath = part.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
    if (byPath[relPath]) {
      let rx = typeof byPath[relPath].content === "string" ? byPath[relPath].content : td.decode(byPath[relPath].content);
      [...usedByPart[part]].forEach(k => { if (!rx.includes(`Id="${info[k].relId}"`)) rx = rx.replace("</Relationships>", REL(k) + "</Relationships>"); });
      byPath[relPath].content = rx;
    } else {
      const nf = { path: relPath, content: XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...usedByPart[part]].map(REL).join("")}</Relationships>` };
      files.push(nf); byPath[relPath] = nf;
    }
  }
  // 로고 미디어 파일 추가 (파일명 충돌 방지: pg_ 접두 신규 경로)
  const usedKinds = new Set(); modified.forEach(p => usedByPart[p].forEach(k => usedKinds.add(k)));
  usedKinds.forEach(k => { if (!byPath[`xl/media/${info[k].fileName}`]) files.push({ path: `xl/media/${info[k].fileName}`, content: info[k].bytes }); });
  // [Content_Types].xml에 이미지 확장자 Default 보강
  const ct = byPath["[Content_Types].xml"];
  if (ct) {
    let cxml = typeof ct.content === "string" ? ct.content : td.decode(ct.content);
    usedKinds.forEach(k => {
      const ext = info[k].fileName.split(".").pop();
      if (!new RegExp(`Extension="${ext}"`).test(cxml)) cxml = cxml.replace("</Types>", `<Default Extension="${ext}" ContentType="image/${ext === "png" ? "png" : "jpeg"}"/></Types>`);
    });
    ct.content = cxml;
  }
  return zipBytes(files);
}

// ── 표준 문서 프레임(회사 표준양식): 표지 → 문서정보표·사용권한·제.개정 이력 + 꼬리말 ──
// 생성되는 모든 워드파일이 공통 사용 — 로고는 표지·문서정보표·꼬리말에 임베드 (머리말에는 로고 미적용)
function docxStdParts({ title, docCode, phase, meta }) {
  const logos = getDocLogos(meta);
  // 로고 미디어는 문서 전체(본문·꼬리말)에서 공유 — 파트별로 관계(relId)만 따로 부여
  const media = [];
  const regLogo = (logo, base) => {
    const parsed = logo?.dataUrl ? dataUrlToBytes(logo.dataUrl) : null;
    if (!parsed) return null;
    const fileName = `${base}.${parsed.ext}`;
    media.push({ fileName, bytes: parsed.bytes });
    const ratio = (Number(logo.w) > 0 && Number(logo.h) > 0) ? Number(logo.w) / Number(logo.h) : 3;
    return { fileName, ratio: Math.min(ratio, 8) };   // 최대 8:1 비율 제한
  };
  const cl = regLogo(logos.client, "logo_client");
  const co = regLogo(logos.company, "logo_company");
  // hEmu: 표시 높이(EMU, 1cm=360000) — 표지 0.9cm, 꼬리말 0.6cm
  const mkRun = (info, relId, idNum, hEmu) => info ? docxImageRun(relId, Math.max(1, Math.round(hEmu * info.ratio)), hEmu, idNum) : "";
  const clientRun = mkRun(cl, "rIdImg1", 1, 324000);
  const companyRun = mkRun(co, "rIdImg2", 2, 324000);
  const today = new Date().toISOString().slice(0, 10);
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const rightImgP = run => `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="140"/></w:pPr>${run}</w:p>`;

  // 1페이지: 표지 (우측 정렬)
  const cover =
    docxP("", { spacingAfter: 2600 }) +
    docxP(title, { bold: true, size: 44, align: "right", spacingAfter: 500 }) +
    docxP(meta.name || "{프로젝트 명}", { bold: true, italic: true, size: 32, align: "right", spacingAfter: 420 }) +
    docxP(`문서번호 : ${docCode || "-"}`, { size: 24, align: "right", spacingAfter: 420 }) +
    docxP("Version 0.1", { bold: true, italic: true, size: 28, align: "right", spacingAfter: 260 }) +
    docxP(today, { size: 20, align: "right", spacingAfter: 600 }) +
    (clientRun ? rightImgP(clientRun) : docxP("고객사로고", { bold: true, size: 24, align: "right", spacingAfter: 140 })) +
    (companyRun ? rightImgP(companyRun) : docxP("우리회사로고", { bold: true, size: 24, align: "right", spacingAfter: 140 })) +
    pageBreak;

  // 2페이지: 문서 정보 표 + 사용권한 + 제.개정 이력
  const infoTable = docxInfoHeaderTable({
    logoXml: mkRun(cl, "rIdImg1", 3, 324000) || `<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>고객사로고</w:t></w:r>`,
    title,
    rows: [
      ["프로젝트", meta.name || "", "단계", phase || ""],
      ["시스템", meta.name || "", "문서번호", docCode || "-"],
      ["작성자", meta.pm || "", "작성일자", today],
    ],
  });
  const usage =
    docxP("사 용 권 한", { bold: true, size: 32, align: "center", spacingAfter: 320 }) +
    docxP("본 문서에 대한 서명은 당사 내부에서 본 문서에 대하여 수행 및 유지관리의 책임이 있음을 인정하는 것임.", { size: 22, spacingAfter: 260 }) +
    docxP("본 문서는 작성, 검토, 승인하여 승인된 원본을 보관한다.", { italic: true, size: 20, align: "center", spacingAfter: 260 }) +
    docxSignLine("작성자") +
    docxSignLine("검토자") +
    docxP("본인은 서명으로써 본 문서가 당사의 업무활동 범위 내에서 사용될 것을 인가함.", { size: 22, spacingAfter: 260 }) +
    docxSignLine("승인자");
  const history =
    docxP("제.개정 이력", { bold: true, size: 32, align: "center", spacingAfter: 260 }) +
    docxTable([["버전", "변경일자", "제.개정 내용", "작성자"], ...Array.from({ length: 10 }, () => [" ", " ", " ", " "])], -1);

  // ── 꼬리말(좌: 고객사로고 · 중앙: 쪽번호 · 우: 우리회사로고) — 머리말에는 로고를 넣지 않음 ──
  // 표지(1페이지)는 titlePg로 꼬리말 미표시 — 첨부 양식과 동일
  const tabDefs = '<w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs>';
  const smallTxt = t => `<w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="808080"/></w:rPr><w:t xml:space="preserve">${xesc(t)}</w:t></w:r>`;
  const pageFld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const ftrXml = `<w:p><w:pPr>${tabDefs}<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="0" w:after="0"/></w:pPr>${mkRun(cl, "rIdF1", 1, 216000) || smallTxt("고객사로고")}<w:r><w:tab/></w:r>${pageFld}<w:r><w:tab/></w:r>${mkRun(co, "rIdF2", 2, 216000) || smallTxt("우리회사로고")}</w:p>`;

  return {
    front: cover + infoTable + usage + history + pageBreak,
    pkgOpts: {
      media,
      bodyImages: [cl && { relId: "rIdImg1", fileName: cl.fileName }, co && { relId: "rIdImg2", fileName: co.fileName }].filter(Boolean),
      footer: { xml: ftrXml, images: [cl && { relId: "rIdF1", fileName: cl.fileName }, co && { relId: "rIdF2", fileName: co.fileName }].filter(Boolean) },
      titlePg: true,
    },
  };
}
function makeDocx({ title, metaRows, purpose, doc, catName, meta }) {
  // ── 신규 양식 (doc·meta 전달 시): 표지 → 문서정보표·사용권한·제.개정 이력 → 본문 ──
  if (doc && meta) {
    const { front, pkgOpts } = docxStdParts({ title, docCode: doc.code, phase: catName, meta });
    // 3페이지: 본문 스켈레톤
    const bodyPage =
      docxP("1. 목적", { bold: true, size: 26, spacingAfter: 160 }) +
      docxP(purpose || "(작성)") +
      docxP("2. 본문", { bold: true, size: 26, spacingAfter: 160 }) +
      docxP("(작성)");
    return docxPackage(front + bodyPage, pkgOpts);
  }

  // ── 구 양식 (호환): doc·meta 미전달 호출부 ──
  const body =
    docxP(title, { bold: true, size: 36, spacingAfter: 240 }) +
    docxTable(metaRows, 1) +
    docxP("1. 목적", { bold: true, size: 26, spacingAfter: 160 }) +
    docxP(purpose || "(작성)") +
    docxP("2. 본문", { bold: true, size: 26, spacingAfter: 160 }) +
    docxP("(작성)") +
    docxP("3. 문서 이력", { bold: true, size: 26, spacingAfter: 160 }) +
    docxTable([["버전", "일자", "작성자", "변경 내용"], ["V0.1", new Date().toLocaleDateString("ko-KR"), "", "최초 작성 (ProGenesis 자동 생성)"]], -1);
  return docxPackage(body);
}
// 본문(body XML) → docx 파일 바이트 (공통 패키징)
// opts: { media:[{fileName,bytes}], bodyImages:[{relId,fileName}], header:{xml,images}, footer:{xml,images}, titlePg }
// 하위 호환: opts 미전달 시 기존과 동일한 단순 문서 생성 (makePdpDocx 등)
function docxPackage(body, opts = {}) {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const media = opts.media || [];
  const relXml = imgs => XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${(imgs || []).map(im => `<Relationship Id="${im.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.fileName}"/>`).join("")}</Relationships>`;
  const files = [];
  const overrides = ['<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'];
  const docRelsExtra = [];
  let sectExtra = "";
  if (opts.header) {
    files.push({ path: "word/header2.xml", content: XMLH + `<w:hdr ${NS}>${opts.header.xml}</w:hdr>` });
    files.push({ path: "word/_rels/header2.xml.rels", content: relXml(opts.header.images) });
    overrides.push('<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
    docRelsExtra.push('<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>');
    sectExtra += '<w:headerReference w:type="default" r:id="rIdHdr"/>';
  }
  if (opts.footer) {
    files.push({ path: "word/footer2.xml", content: XMLH + `<w:ftr ${NS}>${opts.footer.xml}</w:ftr>` });
    files.push({ path: "word/_rels/footer2.xml.rels", content: relXml(opts.footer.images) });
    overrides.push('<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
    docRelsExtra.push('<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>');
    sectExtra += '<w:footerReference w:type="default" r:id="rIdFtr"/>';
  }
  if (opts.titlePg && (opts.header || opts.footer)) {
    // 표지(첫 페이지)에는 머리말·꼬리말을 표시하지 않음 — 빈 first 파트로 대체
    files.push({ path: "word/header1.xml", content: XMLH + `<w:hdr ${NS}><w:p/></w:hdr>` });
    files.push({ path: "word/footer1.xml", content: XMLH + `<w:ftr ${NS}><w:p/></w:ftr>` });
    overrides.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
    overrides.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
    docRelsExtra.push('<Relationship Id="rIdHdr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
    docRelsExtra.push('<Relationship Id="rIdFtr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
    sectExtra += '<w:headerReference w:type="first" r:id="rIdHdr1"/><w:footerReference w:type="first" r:id="rIdFtr1"/><w:titlePg/>';
  }
  const documentXml = XMLH + `<w:document ${NS}><w:body>${body}<w:sectPr>${sectExtra}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="567" w:footer="567"/></w:sectPr></w:body></w:document>`;
  const docRels = XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${(opts.bodyImages || []).map(im => `<Relationship Id="${im.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.fileName}"/>`).join("")}${docRelsExtra.join("")}</Relationships>`;
  return zipBytes([
    { path: "[Content_Types].xml", content: XMLH + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${overrides.join("")}</Types>` },
    { path: "_rels/.rels", content: XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: "word/_rels/document.xml.rels", content: docRels },
    { path: "word/document.xml", content: documentXml },
    ...files,
    ...media.map(m => ({ path: `word/media/${m.fileName}`, content: m.bytes })),
  ]);
}

// ── 테일러링결과서(PDP) 실문서 — PDP 화면(StepPDP)과 동일한 구성의 docx ──
function makePdpDocx(meta, ctx, phase) {
  const ossp = ctx?.ossp || null;
  const sdlc = ctx?.sdlc || null;
  const tailoring = ctx?.tailoring || {};
  const pdp = ctx?.pdp || {};
  const guide = getGuideForOSSP(ossp);
  const scale = tailoring.scale || "중형";
  const method = tailoring.method || "UML";
  const excluded = tailoring.excluded || {};
  const notes = tailoring.notes || {};
  const scaleLabel = guide.scaleOptions?.find(o => o.value === scale)?.label || scale;
  const list = classifyDeliverables(scale, method, guide);
  const isApplied = (d) => {
    if (d.required) return true;
    const ov = notes[`${d.phase}:${d.code}`]?.applied;
    return ov !== undefined ? ov : !excluded[d.code];
  };
  const appliedCount = list.filter(isApplied).length;
  const grouped = {};
  list.forEach(d => { (grouped[d.phase] = grouped[d.phase] || []).push(d); });
  const docNo = `PDP-${(meta.client || "").replace(/\s/g, "").slice(0, 4).toUpperCase() || "PRJ"}-${new Date().getFullYear()}`;
  const today = new Date().toLocaleDateString("ko-KR");

  const procState = tailoring.process || {};
  const procLevel = procState.level || "L3";
  const procApplicable = resolveProcessTailoring(procState).filter(r => r.status !== "해당없음");
  const procByArea = {};
  procApplicable.forEach(r => { (procByArea[r.area] = procByArea[r.area] || []).push(r); });

  // 3. 산출물 테일러링 매트릭스 (화면과 동일 컬럼)
  const delivRows = [["단계", "코드", "산출물", "구분", "적용 여부", "변경 여부", "테일러링 내역 및 사유"]];
  (guide.phaseOrder || Object.keys(grouped)).filter(ph => grouped[ph]?.length).forEach(ph => {
    grouped[ph].forEach((d, i) => {
      const n = notes[`${d.phase}:${d.code}`] || {};
      const on = isApplied(d);
      delivRows.push([
        i === 0 ? ph : "", d.code, d.name + (d.note ? ` (${d.note})` : ""),
        d.required ? "필수" : "선택",
        d.required ? "적용(고정)" : (on ? "적용" : "미적용"),
        d.required ? "—" : (n.changed ? "변경" : "—"),
        d.required ? "—" : (n.reason || ""),
      ]);
    });
  });

  // 4. 프로세스 테일러링 내역서 (화면과 동일 컬럼)
  const procRows = [["프로세스 영역", "세부 프로세스", "구분", "적용 여부", "변경 여부", "테일러링 내역 및 사유"]];
  Object.keys(procByArea).forEach(area => {
    procByArea[area].forEach((r, i) => {
      const req = r.mark === "●";
      procRows.push([
        i === 0 ? area : "",
        (r.activity ? `${r.process} › ${r.activity}` : r.process) + (r.outputs ? ` — 산출물: ${r.outputs}` : ""),
        req ? "필수" : "선택",
        req ? "적용(고정)" : (r.applied ? "적용" : "미적용"),
        req ? "—" : (r.applied && r.changed ? "변경" : "—"),
        req || r.status === "적용" ? "—" : (r.reason || ""),
      ]);
    });
  });

  const objectives = pdp.overview?.objectives || [];
  // 회사 표준양식 프레임(표지·문서정보표·사용권한·제.개정 이력·꼬리말) — 로고 임베드 포함
  const { front, pkgOpts } = docxStdParts({ title: "테일러링결과서", docCode: docNo, phase: phase || "프로젝트 계획수립", meta });
  const body =
    docxP("프로젝트 정의 프로세스 (PDP)", { bold: true, size: 36, spacingAfter: 60 }) +
    docxP("테일러링결과서 · Tailoring Result", { size: 22, spacingAfter: 60 }) +
    docxP(meta.name || "", { bold: true, size: 26, spacingAfter: 240 }) +
    docxTable([
      ["문서번호", docNo], ["버전", "V1.0"],
      ["고객사", meta.client || "-"], ["작성일", today],
      ["기준 OSSP", ossp?.label || "-"], ["SDLC", sdlc?.label || "-"],
    ], 1) +
    docxP("1. 프로젝트 개요", { bold: true, size: 26, spacingAfter: 160 }) +
    docxP(pdp.overview?.purpose || "(미작성 — PDP 단계에서 생성)") +
    (pdp.overview?.scope ? docxP("범위: " + pdp.overview.scope) : "") +
    objectives.map(o => docxP("▸ " + o, { spacingAfter: 60 })).join("") +
    docxP("2. 테일러링 기준", { bold: true, size: 26, spacingAfter: 160 }) +
    docxTable([
      ["적용 가이드", guide.title || "-"],
      ["프로젝트 규모", scaleLabel],
      ["설계방식", guide.hasDesignMethod ? method : "해당 없음"],
      ["규모 판정 기준", (guide.sizeNote || "").replace(/^※\s*/, "")],
    ], 1) +
    docxP(`3. 산출물 테일러링 매트릭스 (전체 ${list.length}건 · 적용 ${appliedCount}건)`, { bold: true, size: 26, spacingAfter: 160 }) +
    docxP("※ 필수(M) 산출물은 항상 적용되며 수정할 수 없습니다. 선택(O) 산출물은 테일러링 결과에 따라 적용 여부·변경 여부·사유를 기록합니다.", { size: 18, spacingAfter: 100 }) +
    docxTable(delivRows, -1) +
    docxP(`4. 프로세스 테일러링 내역서 (적용 등급 ${procLevel} · 적용대상 ${procApplicable.length}건)`, { bold: true, size: 26, spacingAfter: 160 }) +
    docxP("※ 필수(●) 프로세스는 항상 적용되며 수정할 수 없습니다.", { size: 18, spacingAfter: 100 }) +
    docxTable(procRows, -1);
  return docxPackage(front + body, pkgOpts);
}

// ── 요구사항 정의서·명세서 (AI 자동 작성 — 정보공학 방법론 RD1200·RD1300) ──────
// 산출물명 → 요구사항 문서 종류: "def"(정의서) | "spec"(명세서) | "both"(정의서·명세서 통합) | null
function reqDocKind(name) {
  // 산출물명의 '/'는 경로가 아니라 병기 구분자(예: "요구사항 정의서/명세서")이므로
  // normDocName의 경로 분리에 걸리지 않게 치환 후 정규화
  const n = normDocName(String(name || "").replace(/\//g, "·"));
  if (!n.includes("요구사항")) return null;
  const hasDef = n.includes("정의서");
  const hasSpec = n.includes("명세서");
  if (hasDef && hasSpec) return "both";
  if (hasDef) return "def";
  if (hasSpec) return "spec";
  return null;
}
const REQ_TYPE_PREFIX = { "기능": "RF", "비기능": "RN", "인터페이스": "RI" };
// 유형별 접두(RF/RN/RI) + 4자리 순번 ID 부여 — 기존 ID는 유지하고 빈 항목만 이어서 채번
function assignReqIds(items) {
  const maxN = {};
  items.forEach(it => { const m = /^([A-Z]{2})(\d{4})$/.exec(String(it.id || "")); if (m) maxN[m[1]] = Math.max(maxN[m[1]] || 0, Number(m[2])); });
  return items.map(it => {
    if (it.id) return it;
    const p = REQ_TYPE_PREFIX[it.type] || "RQ";
    maxN[p] = (maxN[p] || 0) + 1;
    return { ...it, id: p + String(maxN[p]).padStart(4, "0") };
  });
}
// WBS에서 요구사항 명세서(spec/both)를 산출물로 가진 '진짜 최하위' Task 목록 — 요구사항 배정 후보(기능 모듈)
function reqSpecLeaves(wbs) {
  const rows = [];
  (wbs?.tasks || []).forEach(t => (t.subtasks || []).forEach(s => rows.push(s)));
  const codes = rows.map(s => String(s.wbsCode || ""));
  return rows.filter(s => {
    const k = reqDocKind(s.deliverable || "");
    if (k !== "spec" && k !== "both") return false;
    const c = String(s.wbsCode || "");
    if (!c) return false;
    return !codes.some(o => o !== c && o.startsWith(c + "."));   // 하위 행이 없으면 최하위
  }).map(s => ({ wbsNo: String(s.wbsCode), name: String(s.task || "").trim() }));
}
// docx 바이트 → 평문 텍스트 (요구사항 원문 파일 업로드용)
async function docxBytesToText(bytes) {
  const files = await unzipBytes(bytes);
  const f = files.find(x => x.path === "word/document.xml");
  if (!f) return "";
  const td = new TextDecoder();
  let x = typeof f.content === "string" ? f.content : td.decode(f.content);
  x = x.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
  return x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).trim();
}
// xlsx 바이트 → 평문 텍스트 (요구사항 원문 파일 업로드용) — 시트별 셀 값을 탭/줄바꿈으로 이어붙임
async function xlsxBytesToText(bytes) {
  const files = await unzipBytes(bytes);
  const td = new TextDecoder();
  const read = p => { const f = files.find(x => x.path === p); return f ? (typeof f.content === "string" ? f.content : td.decode(f.content)) : ""; };
  const unesc = s => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d));
  // 공유 문자열 테이블 (t="s" 셀이 참조)
  const sst = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));
  const out = [];
  files.filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.path)).forEach(f => {
    const xml = typeof f.content === "string" ? f.content : td.decode(f.content);
    [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].forEach(rm => {
      const vals = [...rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cm => {
        const attrs = cm[1], inner = cm[2];
        if (/t="s"/.test(attrs)) { const v = /<v>([\s\S]*?)<\/v>/.exec(inner); return v ? (sst[Number(v[1])] || "") : ""; }
        if (/t="inlineStr"/.test(attrs)) return unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(""));
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        return v ? unesc(v[1]) : "";
      }).filter(v => String(v).trim() !== "");
      if (vals.length) out.push(vals.join("\t"));
    });
  });
  return out.join("\n").trim();
}
// 확정된 요구사항 → 정의서/명세서/통합 docx (회사 표준 프레임 + 로고)
function makeReqDocx(meta, ctx, phase, kind, doc) {
  const req = ctx?.requirements || {};
  const items = req.items || [];
  // 모듈 분권: 문서의 WBS 번호가 배정 체계(specLeaves) 트리에 속하면 해당 모듈 배정분 + 공통만 담는다
  const docWbs = String(doc?.wbsNo || "");
  const under = (child, parent) => child === parent || child.startsWith(parent + ".");
  const leaves = req.specLeaves || [];
  const leafName = {}; leaves.forEach(l => { leafName[l.wbsNo] = l.name; });
  const isCommon = it => !it.wbsNo || it.wbsNo === "공통";
  const inTree = kind !== "def" && docWbs && leaves.some(l => under(l.wbsNo, docWbs) || under(docWbs, l.wbsNo));
  const moduleItems = inTree ? items.filter(it => !isCommon(it) && under(String(it.wbsNo), docWbs)) : [];
  const commonItems = inTree ? items.filter(isCommon) : [];
  const docCode = kind === "spec" ? "RD1301" : kind === "def" ? "RD1202" : "RD1202·RD1301";
  const docNo = `${docCode}-${(meta.client || "").replace(/\s/g, "").slice(0, 4).toUpperCase() || "PRJ"}-${new Date().getFullYear()}`;
  const today = new Date().toLocaleDateString("ko-KR");
  const title = kind === "def" ? "요구사항 정의서" : kind === "spec" ? "요구사항 명세서" : "요구사항 정의서·명세서";
  const cnt = t => items.filter(i => i.type === t).length;
  const { front, pkgOpts } = docxStdParts({ title, docCode: docNo, phase: phase || "요구정의", meta });
  let body =
    docxP(title, { bold: true, size: 36, spacingAfter: 60 }) +
    docxP(meta.name || "", { bold: true, size: 26, spacingAfter: 240 }) +
    docxTable([
      ["문서번호", docNo], ["버전", "V1.0"],
      ["고객사", meta.client || "-"], ["작성일", today],
      ["요구사항 합계", inTree
        ? `모듈 ${moduleItems.length}건 + 공통 ${commonItems.length}건 (전체 ${items.length}건 중)`
        : `${items.length}건 (기능 ${cnt("기능")} · 비기능 ${cnt("비기능")} · 인터페이스 ${cnt("인터페이스")})`],
      ["요구사항 출처", req.sourceName || "이해관계자 요구사항 입력"],
      ...(inTree ? [["대상 기능", `${doc?.taskName || leafName[docWbs] || ""} (${docWbs})`.trim()]] : []),
    ], 1);
  let sec = 0;
  if (kind !== "spec") {
    const rows = [["No", "ID", "유형", "요구사항명", "기능 모듈", "출처", "우선순위", "개요"]];
    items.forEach((it, i) => rows.push([String(i + 1), it.id || "", it.type || "", it.name || "",
      isCommon(it) ? "공통" : `${it.wbsNo}${leafName[it.wbsNo] ? " " + leafName[it.wbsNo] : ""}`,
      it.source || "-", it.priority || "중", it.summary || ""]));
    body += docxP(`${++sec}. 요구사항 정의 (RD1200)`, { bold: true, size: 26, spacingAfter: 160 }) +
      docxP("※ 정보공학 방법론 요구정의 단계 기준 — 기능·비기능·인터페이스 요구사항을 도출하고 추적 가능한 요구사항 ID를 부여하여 정리한다.", { size: 18, spacingAfter: 100 }) +
      docxTable(rows, -1);
  }
  if (kind !== "def") {
    const specNote = "※ 요구사항별로 구현 가능성·테스트 가능성·우선순위를 고려해 구체화하며, 비기능 요구사항은 ISO 9126 품질특성(기능성·신뢰성·사용성·효율성·유지보수성·이식성)을 기준으로 기술한다.";
    const specBlock = it => docxP(`${it.id || ""} · ${it.name || ""}`, { bold: true, size: 22, spacingAfter: 80 }) +
      docxTable([
        ["유형", (it.type || "") + (it.type === "비기능" && it.quality ? ` (${it.quality})` : "")],
        ["우선순위", it.priority || "중"], ["출처", it.source || "-"],
        ["상세 설명", it.detail || it.summary || ""],
        ["인수 기준", it.acceptance || ""],
        ["가정·제약", it.assumptions || "-"],
      ], 1);
    if (inTree) {
      // 모듈별 명세서: (1) 해당 모듈 배정분, (2) 공통 요구사항(모든 모듈 명세서에 포함)
      body += docxP(`${++sec}. 모듈 요구사항 명세 (RD1300) — ${doc?.taskName || leafName[docWbs] || docWbs}`, { bold: true, size: 26, spacingAfter: 160 }) +
        docxP(specNote, { size: 18, spacingAfter: 100 });
      if (moduleItems.length) moduleItems.forEach(it => { body += specBlock(it); });
      else body += docxP("(이 모듈에 배정된 개별 요구사항이 없습니다 — 아래 공통 요구사항을 적용합니다.)", { size: 20, spacingAfter: 120 });
      body += docxP(`${++sec}. 공통 요구사항`, { bold: true, size: 26, spacingAfter: 160 }) +
        docxP("※ 특정 기능 모듈에 귀속되지 않는 전사 공통·비기능 요구사항으로, 본 모듈의 설계·구현·검증 시 항상 적용된다.", { size: 18, spacingAfter: 100 });
      if (commonItems.length) commonItems.forEach(it => { body += specBlock(it); });
      else body += docxP("(공통 요구사항 없음)", { size: 20, spacingAfter: 120 });
    } else {
      body += docxP(`${++sec}. 요구사항 명세 (RD1300)`, { bold: true, size: 26, spacingAfter: 160 }) +
        docxP(specNote, { size: 18, spacingAfter: 100 });
      items.forEach(it => { body += specBlock(it); });
    }
  }
  return docxPackage(front + body, pkgOpts);
}
// 요구사항 추적 매트릭스(xlsx 템플릿)의 '추적매트릭스(양식)' 시트에 확정 요구사항을 채움
// 1행(헤더)은 유지, 기존 예시 행은 제거하고 요구사항ID·명·출처·상태·우선순위(A~E열)를 기록
async function injectRequirementsIntoRtmXlsx(bytes, req) {
  const items = req?.items;
  if (!items?.length) return null;
  const leafName = {}; (req?.specLeaves || []).forEach(l => { leafName[l.wbsNo] = l.name; });
  const moduleOf = it => (!it.wbsNo || it.wbsNo === "공통") ? "공통" : `${it.wbsNo}${leafName[it.wbsNo] ? " " + leafName[it.wbsNo] : ""}`;
  const files = await unzipBytes(bytes);
  const td = new TextDecoder();
  const byPath = {}; files.forEach(f => { byPath[f.path] = f; });
  const wbF = byPath["xl/workbook.xml"];
  if (!wbF) return null;
  const wbXml = typeof wbF.content === "string" ? wbF.content : td.decode(wbF.content);
  const relF = byPath["xl/_rels/workbook.xml.rels"];
  const relXml = relF ? (typeof relF.content === "string" ? relF.content : td.decode(relF.content)) : "";
  const relMap = {};
  [...relXml.matchAll(/<Relationship\b[^>]*>/g)].forEach(m => {
    const id = /Id="([^"]+)"/.exec(m[0]); const tg = /Target="([^"]+)"/.exec(m[0]);
    if (id && tg) relMap[id[1]] = tg[1];
  });
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map(m => ({
    name: /name="([^"]+)"/.exec(m[0])?.[1] || "",
    rid: /r:id="([^"]+)"/.exec(m[0])?.[1] || "",
  }));
  const cand = sheets.filter(s => /추적/.test(s.name) && /매트릭스|matrix/i.test(s.name));
  const target = cand.find(s => /양식/.test(s.name)) || cand[0];
  if (!target || !relMap[target.rid]) return null;
  const path = "xl/" + relMap[target.rid].replace(/^\//, "").replace(/^xl\//, "");
  const shF = byPath[path];
  if (!shF) return null;
  let xml = typeof shF.content === "string" ? shF.content : td.decode(shF.content);
  const sd = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sd) return null;
  const rowsXml = [...sd[1].matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)].map(m => m[0]);
  if (!rowsXml.length) return null;
  const header = rowsXml[0];   // 1행 = 컬럼 헤더 유지
  const base = Number(/r="(\d+)"/.exec(header)?.[1] || 1) + 1;
  // 기존 첫 데이터 행의 셀 스타일을 컬럼별로 재사용해 표 서식(테두리 등) 유지
  const styleByCol = {};
  if (rowsXml[1]) [...rowsXml[1].matchAll(/<c\b[^>]*>/g)].forEach(m => {
    const rAttr = /r="([A-Z]+)\d+"/.exec(m[0]); const sAttr = /s="(\d+)"/.exec(m[0]);
    if (rAttr && sAttr) styleByCol[rAttr[1]] = sAttr[1];
  });
  const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cols = ["A", "B", "C", "D", "E", "N"];   // N열(비고) = 배정 기능 모듈
  const newRows = items.map((it, i) => {
    const r = base + i;
    const vals = [it.id || "", it.name || "", it.source || "", "신규", it.priority || "", moduleOf(it)];
    const cells = vals.map((v, ci) => {
      const s = styleByCol[cols[ci]] ? ` s="${styleByCol[cols[ci]]}"` : "";
      return `<c r="${cols[ci]}${r}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r}">${cells}</row>`;
  }).join("");
  xml = xml.replace(sd[0], `<sheetData>${header}${newRows}</sheetData>`);
  shF.content = xml;
  return zipBytes(files);
}

// ── XLSX ─────────────────────────────────────────────────────
function colLetter(n) { let s = ""; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function makeXlsx({ sheetName = "Sheet1", rows }) {
  const rowsXml = rows.map((cells, ri) =>
    `<row r="${ri + 1}">` + cells.map((c, ci) =>
      `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xesc(c)}</t></is></c>`
    ).join("") + "</row>"
  ).join("");
  const sheetXml = XMLH + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  const wbXml = XMLH + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xesc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return zipBytes([
    { path: "[Content_Types].xml", content: XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { path: "_rels/.rels", content: XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { path: "xl/workbook.xml", content: wbXml },
    { path: "xl/_rels/workbook.xml.rels", content: XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { path: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);
}

// ═══════════════════════════════════════════════════════════════════
// WBS 간트 워크북 생성기 (자체 구현 · 외부 코드/파일 미사용)
// - 시트: WBS(일정+간트) / 공휴일 / 사용법
// - B3 셀 하나로 차트 단위(일/주) 전환 — 조건부 서식·날짜 축이 수식으로 즉시 반영
// - 일정 수식: 선행(FS) 종료 + 1근무일 → 시작일(WORKDAY), 시작일 + 공수 - 1근무일 → 종료일
// - 간트 막대·진척·오늘·주말·공휴일은 조건부 서식(범용 엑셀 기법)으로 표현
// ═══════════════════════════════════════════════════════════════════


// 날짜 문자열(yyyy-mm-dd) → 엑셀 시리얼 값 (1900 날짜 체계)
function xlDateSerial(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d)) return null;
  return Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}
// 수식에 심을 정적 날짜: DATE(y,m,d) — 로캘 무관
function xlDateFn(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `DATE(${+m[1]},${+m[2]},${+m[3]})`;
}

function makeWbsGanttXlsx(wbs, meta) {
  const tasks = wbs?.tasks || [];
  const holidays = (wbs?.holidays || []).slice().sort();
  const today = new Date().toLocaleDateString("ko-KR");

  // ── 행 평탄화: 요약(레벨1) + 하위(레벨2~5), 자식 행 범위 기록 ──
  const flat = [];   // { kind:'sum'|'sub', ... }
  tasks.forEach(t => {
    const sumIdx = flat.length;
    flat.push({ kind: "sum", wbsCode: t.wbsCode, name: t.phase, childFrom: null, childTo: null });
    (t.subtasks || []).forEach(s => flat.push({ kind: "sub", ...s,
      deliverable: isWbsLeaf(t.subtasks, s.wbsCode) ? (s.deliverable || "") : "" }));   // 산출물은 최하위 Task에만 표시
    const n = (t.subtasks || []).length;
    if (n) { flat[sumIdx].childFrom = sumIdx + 1; flat[sumIdx].childTo = sumIdx + n; }
  });

  const HEAD_ROW = 6;                 // 테이블 헤더·날짜 축 행
  const DATA_START = HEAD_ROW + 1;    // 첫 데이터 행 = 7
  const lastRow = DATA_START + flat.length - 1;
  const rowOf = (i) => DATA_START + i;

  // ── 차트 시작일: 최소 시작일에서 이전 월요일로 스냅 (없으면 프로젝트 시작일/오늘) ──
  const allStarts = [];
  const allFinishes = [];
  flat.forEach(r => { if (r.kind === "sub") { if (r.start) allStarts.push(r.start); if (r.finish) allFinishes.push(r.finish); } });
  if (meta?.startDate) allStarts.push(meta.startDate);
  if (meta?.endDate) allFinishes.push(meta.endDate);
  allStarts.sort(); allFinishes.sort();
  let chartStart = allStarts[0] || new Date().toISOString().slice(0, 10);
  {
    const d = new Date(chartStart + "T00:00:00Z");
    const dow = d.getUTCDay();                       // 0=일
    d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));  // 직전(포함) 월요일
    chartStart = d.toISOString().slice(0, 10);
  }
  // 타임라인 열 수: 일 단위 기준 프로젝트 기간 + 여유, 90~240열
  let spanDays = 120;
  if (allFinishes.length) {
    const a = new Date(chartStart + "T00:00:00Z"), b = new Date(allFinishes[allFinishes.length - 1] + "T00:00:00Z");
    spanDays = Math.max(30, Math.round((b - a) / 86400000));
  }
  const NCOLS = Math.max(90, Math.min(240, spanDays + 30));
  const GANTT_FIRST = 10;                       // K열 (0-based 10)
  const GANTT_LAST = GANTT_FIRST + NCOLS - 1;
  const K = colLetter(GANTT_FIRST);             // "K"
  const LASTCOL = colLetter(GANTT_LAST);

  // ── 셀 헬퍼 ──
  const cStr = (r, c, v, s) => v === "" || v == null ? (s ? `<c r="${colLetter(c)}${r}" s="${s}"/>` : "") :
    `<c r="${colLetter(c)}${r}" s="${s || 0}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
  const cNum = (r, c, v, s) => v == null ? (s ? `<c r="${colLetter(c)}${r}" s="${s}"/>` : "") :
    `<c r="${colLetter(c)}${r}" s="${s || 0}"><v>${v}</v></c>`;
  const cFml = (r, c, f, s) => `<c r="${colLetter(c)}${r}" s="${s || 0}"><f>${xesc(f)}</f></c>`;
  const cEmpty = (r, c, s) => `<c r="${colLetter(c)}${r}" s="${s}"/>`;

  // ── 스타일 인덱스 (styles.xml 정의 순서와 일치) ──
  const S = {
    title: 1, metaLabel: 2, metaVal: 3, metaDate: 4, metaCenter: 5,
    head: 6, txt: 7, ctr: 8, date: 9, pct: 10, num: 11,
    sumTxt: 12, sumDate: 13, sumCtr: 14, sumPct: 15, sumNum: 16,
    tlMonth: 17, tlDay: 18, gantt: 19, ganttSum: 20, legend: 21, holHead: 22, holDate: 23, usage: 24, usageHead: 25,
    predTxt: 26,   // 선행 입력 열 — 텍스트 서식(@)이라 1.1 입력 시 숫자가 아닌 텍스트로 저장됨
  };

  // ═══ WBS 시트 ═══
  const rowsXml = [];

  // Row 1: 제목
  rowsXml.push(`<row r="1" ht="24" customHeight="1">${cStr(1, 0, "WBS · 일정 계획 (Gantt)", S.title)}</row>`);
  // Row 2: 프로젝트 메타
  rowsXml.push(`<row r="2">${[
    cStr(2, 0, "프로젝트명", S.metaLabel), cStr(2, 1, meta?.name || "", S.metaVal),
    cStr(2, 2, "고객사", S.metaLabel), cStr(2, 3, meta?.client || "", S.metaVal),
    cStr(2, 4, "PM", S.metaLabel), cStr(2, 5, meta?.pm || "", S.metaVal),
    cStr(2, 6, "기간", S.metaLabel), cStr(2, 7, `${meta?.startDate || ""} ~ ${meta?.endDate || ""}`, S.metaVal),
    cStr(2, 8, "작성일", S.metaLabel), cStr(2, 9, today, S.metaVal),
  ].join("")}</row>`);
  // Row 3: 차트 설정 (B3 = 단위 토글, D3 = 차트 시작일)
  rowsXml.push(`<row r="3">${[
    cStr(3, 0, "차트 단위 ▼", S.metaLabel), cStr(3, 1, "일", S.metaCenter),
    cStr(3, 2, "차트 시작일", S.metaLabel), cNum(3, 3, xlDateSerial(chartStart), S.metaDate),
    cStr(3, 4, "기준일", S.metaLabel), cFml(3, 5, "TODAY()", S.metaDate),
    cStr(3, 6, "버전", S.metaLabel), cStr(3, 7, "V0.1 (초안)", S.metaVal),
  ].join("")}</row>`);
  // Row 4: 범례
  rowsXml.push(`<row r="4">${cStr(4, 0, "범례: 파랑=작업 막대 · 진한 파랑=진척(진척률 입력 시) · 네이비=단계 요약 · 주황=오늘 · 분홍=공휴일 · 회색=주말  |  B3에서 일↔주 전환, D3에서 차트 시작일 변경", S.legend)}</row>`);

  // Row 5: 월 헤더 (날짜 축 행6 참조)
  {
    const cells = [];
    for (let i = 0; i < NCOLS; i++) {
      const col = GANTT_FIRST + i;
      const cl = colLetter(col);
      const prev = colLetter(col - 1);
      const f = i === 0
        ? `TEXT(${cl}$${HEAD_ROW},"yy년 m월")`
        : `IF(MONTH(${cl}$${HEAD_ROW})<>MONTH(${prev}$${HEAD_ROW}),TEXT(${cl}$${HEAD_ROW},"yy년 m월"),"")`;
      cells.push(cFml(5, col, f, S.tlMonth));
    }
    rowsXml.push(`<row r="5" ht="14" customHeight="1">${cells.join("")}</row>`);
  }

  // Row 6: 테이블 헤더 + 날짜 축
  {
    const heads = ["WBS", "Task", "산출물", "작업자", "선행", "시작일", "종료일", "공수(일)", "진척률", "상태"];
    const cells = heads.map((h, ci) => cStr(HEAD_ROW, ci, h, S.head));
    for (let i = 0; i < NCOLS; i++) {
      const col = GANTT_FIRST + i;
      const f = i === 0 ? `$D$3` : `${colLetter(col - 1)}$${HEAD_ROW}+IF(ChartUnit="주",7,1)`;
      cells.push(cFml(HEAD_ROW, col, f, S.tlDay));
    }
    rowsXml.push(`<row r="${HEAD_ROW}" ht="16" customHeight="1">${cells.join("")}</row>`);
  }

  // 데이터 행
  flat.forEach((it, i) => {
    const r = rowOf(i);
    const cells = [];
    const ganttStyle = it.kind === "sum" ? S.ganttSum : S.gantt;
    if (it.kind === "sum") {
      // childFrom/childTo는 flat 인덱스 → 행 번호로 변환
      const r1 = it.childFrom != null ? DATA_START + it.childFrom : null;
      const r2 = it.childTo != null ? DATA_START + it.childTo : null;
      cells.push(cStr(r, 0, it.wbsCode, S.sumTxt));
      cells.push(cStr(r, 1, it.name, S.sumTxt));
      cells.push(cStr(r, 2, "요약 (하위 롤업)", S.sumTxt));
      cells.push(cEmpty(r, 3, S.sumTxt));
      cells.push(cEmpty(r, 4, S.sumCtr));
      if (r1 != null) {
        cells.push(cFml(r, 5, `IF(COUNT($F$${r1}:$F$${r2})=0,"",MIN($F$${r1}:$F$${r2}))`, S.sumDate));
        cells.push(cFml(r, 6, `IF(COUNT($G$${r1}:$G$${r2})=0,"",MAX($G$${r1}:$G$${r2}))`, S.sumDate));
        cells.push(cFml(r, 7, `IF(SUM($H$${r1}:$H$${r2})=0,"",SUM($H$${r1}:$H$${r2}))`, S.sumNum));
        cells.push(cFml(r, 8, `IFERROR(SUMPRODUCT($H$${r1}:$H$${r2},$I$${r1}:$I$${r2})/SUM($H$${r1}:$H$${r2}),0)`, S.sumPct));
      } else {
        cells.push(cEmpty(r, 5, S.sumDate)); cells.push(cEmpty(r, 6, S.sumDate));
        cells.push(cEmpty(r, 7, S.sumNum)); cells.push(cEmpty(r, 8, S.sumPct));
      }
      cells.push(cEmpty(r, 9, S.sumCtr));
    } else {
      const startFn = xlDateFn(it.start);
      const finishFn = xlDateFn(it.finish);
      const staticStart = startFn || `""`;
      cells.push(cStr(r, 0, it.wbsCode || "", S.txt));
      const indent = "  ".repeat(Math.max(0, (it.level || 2) - 2));
      cells.push(cStr(r, 1, indent + (it.task || ""), S.txt));
      cells.push(cStr(r, 2, it.deliverable || "", S.txt));
      cells.push(cStr(r, 3, it.assignee || "", S.ctr));
      cells.push(it.pred ? cStr(r, 4, it.pred, S.predTxt) : cEmpty(r, 4, S.predTxt));
      // F 시작일: 선행이 있으면 위쪽 행에서 선행 종료일을 그대로 사용 (선행은 위쪽 행만 참조 — 순환 참조 방지)
      if (r > DATA_START) {
        const f = `IF($E${r}="",${staticStart},IFERROR(INDEX($G$${DATA_START}:$G$${r - 1},MATCH($E${r}&"",$A$${DATA_START}:$A$${r - 1},0)),${staticStart}))`;
        cells.push(cFml(r, 5, f, S.date));
      } else {
        cells.push(startFn ? cFml(r, 5, startFn, S.date) : cEmpty(r, 5, S.date));
      }
      // G 종료일: 시작일 + 공수(근무일) - 1
      {
        const fb = finishFn || `""`;
        cells.push(cFml(r, 6, `IF(OR($F${r}="",$H${r}=""),${fb},WORKDAY($F${r},MAX($H${r},1)-1,HolidayList))`, S.date));
      }
      // H 공수
      const eff = Number(it.effort);
      cells.push(eff > 0 ? cNum(r, 7, eff, S.num) : cEmpty(r, 7, S.num));
      // I 진척률 (기본 0)
      cells.push(cNum(r, 8, 0, S.pct));
      // J 상태
      cells.push(cFml(r, 9, `IF($F${r}="","",IF($I${r}>=1,"완료",IF($G${r}="","",IF(TODAY()>$G${r},"지연",IF(TODAY()>=$F${r},"진행","예정")))))`, S.ctr));
    }
    // 간트 영역 스타일 빈 셀 (조건부 서식이 칠함)
    for (let c = GANTT_FIRST; c <= GANTT_LAST; c++) cells.push(cEmpty(r, c, ganttStyle));
    const outline = it.kind === "sub" ? ` outlineLevel="${Math.min(7, Math.max(1, (it.level || 2) - 1))}"` : "";
    rowsXml.push(`<row r="${r}"${outline}>${cells.join("")}</row>`);
  });

  // 조건부 서식 (우선순위 순, stopIfTrue) — 범용 엑셀 기법의 자체 구현
  const ganttRange = `${K}${DATA_START}:${LASTCOL}${lastRow}`;
  const unitSpan = `IF(ChartUnit="주",6,0)`;
  const cf = `<conditionalFormatting sqref="${ganttRange}">` +
    `<cfRule type="expression" dxfId="0" priority="1" stopIfTrue="1"><formula>AND($A${DATA_START}&lt;&gt;"",ISERROR(FIND(".",$A${DATA_START})),$F${DATA_START}&lt;&gt;"",$G${DATA_START}&lt;&gt;"",${K}$${HEAD_ROW}&lt;=$G${DATA_START},${K}$${HEAD_ROW}+${unitSpan}&gt;=$F${DATA_START})</formula></cfRule>` +
    `<cfRule type="expression" dxfId="1" priority="2" stopIfTrue="1"><formula>AND($F${DATA_START}&lt;&gt;"",$G${DATA_START}&lt;&gt;"",${K}$${HEAD_ROW}&lt;=$G${DATA_START},${K}$${HEAD_ROW}+${unitSpan}&gt;=$F${DATA_START},$I${DATA_START}&gt;0,${K}$${HEAD_ROW}&lt;=$F${DATA_START}+($G${DATA_START}-$F${DATA_START})*$I${DATA_START})</formula></cfRule>` +
    `<cfRule type="expression" dxfId="2" priority="3" stopIfTrue="1"><formula>AND($F${DATA_START}&lt;&gt;"",$G${DATA_START}&lt;&gt;"",${K}$${HEAD_ROW}&lt;=$G${DATA_START},${K}$${HEAD_ROW}+${unitSpan}&gt;=$F${DATA_START})</formula></cfRule>` +
    `<cfRule type="expression" dxfId="3" priority="4" stopIfTrue="1"><formula>AND(${K}$${HEAD_ROW}&lt;=TODAY(),TODAY()&lt;${K}$${HEAD_ROW}+IF(ChartUnit="주",7,1))</formula></cfRule>` +
    `<cfRule type="expression" dxfId="4" priority="5" stopIfTrue="1"><formula>AND(ChartUnit="일",COUNTIF(HolidayList,${K}$${HEAD_ROW})&gt;0)</formula></cfRule>` +
    `<cfRule type="expression" dxfId="5" priority="6"><formula>AND(ChartUnit="일",WEEKDAY(${K}$${HEAD_ROW},2)&gt;=6)</formula></cfRule>` +
    `</conditionalFormatting>`;

  const dv = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" promptTitle="차트 단위" prompt="일 또는 주를 선택하면 간트 축이 바뀝니다" sqref="B3"><formula1>"일,주"</formula1></dataValidation></dataValidations>`;

  const wbsSheet = XMLH +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><outlinePr summaryBelow="0"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90">` +
    `<pane xSplit="10" ySplit="${HEAD_ROW}" topLeftCell="${K}${DATA_START}" activePane="bottomRight" state="frozen"/>` +
    `<selection pane="bottomRight" activeCell="${K}${DATA_START}" sqref="${K}${DATA_START}"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15.5" outlineLevelRow="4"/>` +
    `<cols>` +
    `<col min="1" max="1" width="9" customWidth="1"/>` +
    `<col min="2" max="2" width="36" customWidth="1"/>` +
    `<col min="3" max="3" width="20" customWidth="1"/>` +
    `<col min="4" max="4" width="9" customWidth="1"/>` +
    `<col min="5" max="5" width="10" customWidth="1"/>` +
    `<col min="6" max="7" width="11.5" customWidth="1"/>` +
    `<col min="8" max="8" width="8" customWidth="1"/>` +
    `<col min="9" max="9" width="7.5" customWidth="1"/>` +
    `<col min="10" max="10" width="7" customWidth="1"/>` +
    `<col min="${GANTT_FIRST + 1}" max="${GANTT_LAST + 1}" width="3.4" customWidth="1"/>` +
    `</cols>` +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    cf + dv +
    `</worksheet>`;

  // ═══ 공휴일 시트 ═══
  const HOL_MAX = 60;   // HolidayList = A2:A61 (빈 칸은 사용자가 추가 입력)
  const holRows = [`<row r="1">${cStr(1, 0, "공휴일 날짜", S.holHead)}${cStr(1, 1, "설명", S.holHead)}</row>`];
  for (let i = 0; i < HOL_MAX; i++) {
    const r = i + 2;
    const serial = i < holidays.length ? xlDateSerial(holidays[i]) : null;
    holRows.push(`<row r="${r}">${serial != null ? cNum(r, 0, serial, S.holDate) : cEmpty(r, 0, S.holDate)}${i < holidays.length ? cStr(r, 1, "프로젝트 지정 공휴일", S.txt) : cEmpty(r, 1, S.txt)}</row>`);
  }
  const holSheet = XMLH +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/></cols>` +
    `<sheetData>${holRows.join("")}</sheetData>` +
    `</worksheet>`;

  // ═══ 사용법 시트 ═══
  const usage = [
    ["WBS 일정 계획 워크북 사용법", true],
    ["", false],
    ["1. 차트 단위 전환 (일 ↔ 주)", true],
    ["   · WBS 시트 B3 셀에서 '일' 또는 '주'를 선택하면 간트 차트 축이 즉시 전환됩니다.", false],
    ["   · '주' 단위에서는 각 열이 7일(1주)을 나타내며, 주말·공휴일 음영은 '일' 단위에서만 표시됩니다.", false],
    ["2. 차트 시작일", true],
    ["   · D3 셀의 날짜를 바꾸면 간트 차트가 해당 날짜부터 표시됩니다.", false],
    ["3. 일정 자동 계산 (근무일 기준)", true],
    ["   · 시작일(F) + 공수(H) → 종료일(G) 자동 계산: 주말(토·일)과 공휴일 시트의 날짜를 제외합니다.", false],
    ["   · 선행(E)에 선행 작업의 WBS 코드를 입력하면 선행 작업의 종료일이 시작일로 자동 입력됩니다.", false],
    ["   · 제약: 선행은 자신보다 위쪽 행의 작업만 참조할 수 있습니다 (순환 참조 방지). 쉼표로 여러 개를 입력하면 자동 계산 대신 저장된 날짜가 유지됩니다.", false],
    ["   · 선행 열은 텍스트 서식이므로 1.1처럼 입력하면 WBS 코드로 정확히 인식됩니다.", false],
    ["4. 진척률과 상태", true],
    ["   · 진척률(I)을 입력하면 막대 위에 진한 색으로 진척 구간이 표시됩니다 (0%~100%).", false],
    ["   · 상태(J)는 오늘 날짜 기준으로 예정/진행/지연/완료가 자동 표시됩니다.", false],
    ["5. 공휴일 관리", true],
    ["   · '공휴일' 시트 A열(2행~61행)에 날짜를 추가/삭제하면 일정 계산과 간트 음영에 즉시 반영됩니다.", false],
    ["6. 행 그룹(개요)", true],
    ["   · 좌측 개요 버튼(1/2/3…)으로 단계별 하위 작업을 접거나 펼 수 있습니다.", false],
    ["", false],
    ["※ 본 워크북은 ProGenesis가 표준 엑셀 기능(수식·조건부 서식)만으로 자동 생성한 문서입니다 (매크로 없음).", false],
  ];
  const usageRows = usage.map(([t, b], i) => `<row r="${i + 1}">${cStr(i + 1, 0, t, b ? S.usageHead : S.usage)}</row>`);
  const usageSheet = XMLH +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>` +
    `<cols><col min="1" max="1" width="110" customWidth="1"/></cols>` +
    `<sheetData>${usageRows.join("")}</sheetData>` +
    `</worksheet>`;

  // ═══ styles.xml ═══
  const stylesXml = XMLH + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3">` +
    `<numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/>` +
    `<numFmt numFmtId="165" formatCode="d"/>` +
    `<numFmt numFmtId="166" formatCode="0%"/>` +
    `</numFmts>` +
    `<fonts count="6">` +
    `<font><sz val="10"/><name val="맑은 고딕"/></font>` +
    `<font><b/><sz val="10"/><name val="맑은 고딕"/></font>` +
    `<font><sz val="8"/><name val="맑은 고딕"/><color rgb="FF595959"/></font>` +
    `<font><b/><sz val="14"/><name val="맑은 고딕"/><color rgb="FF1F3864"/></font>` +
    `<font><b/><sz val="8"/><name val="맑은 고딕"/><color rgb="FF1F3864"/></font>` +
    `<font><b/><sz val="10"/><name val="맑은 고딕"/><color rgb="FF1F3864"/></font>` +
    `</fonts>` +
    `<fills count="5">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEDF2FA"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="3">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>` +
    `<border><left style="hair"><color rgb="FFE8E8E8"/></left><right style="hair"><color rgb="FFE8E8E8"/></right><top style="hair"><color rgb="FFE8E8E8"/></top><bottom style="hair"><color rgb="FFE8E8E8"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="27">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>` +                                                                   // 0
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0"/>` +                                                                   // 1 title
    `<xf numFmtId="0" fontId="1" fillId="4" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 2 metaLabel
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 3 metaVal
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 4 metaDate
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 5 metaCenter (B3)
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 6 head
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 7 txt
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 8 ctr
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 9 date
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 10 pct
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 11 num
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 12 sumTxt
    `<xf numFmtId="164" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 13 sumDate
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 14 sumCtr
    `<xf numFmtId="166" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 15 sumPct
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 16 sumNum
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 17 tlMonth
    `<xf numFmtId="165" fontId="2" fillId="2" borderId="2" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 18 tlDay
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="2"/>` +                                                                   // 19 gantt
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="2"/>` +                                                                   // 20 ganttSum
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 21 legend
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +   // 22 holHead
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 23 holDate
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 24 usage
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +              // 25 usageHead
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 26 predTxt (텍스트 @)
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `<dxfs count="6">` +
    `<dxf><fill><patternFill><bgColor rgb="FF203864"/></patternFill></fill></dxf>` +   // 0 요약 막대 (네이비)
    `<dxf><fill><patternFill><bgColor rgb="FF1F4E9C"/></patternFill></fill></dxf>` +   // 1 진척 (진한 파랑)
    `<dxf><fill><patternFill><bgColor rgb="FF8EAADB"/></patternFill></fill></dxf>` +   // 2 작업 막대 (파랑)
    `<dxf><fill><patternFill><bgColor rgb="FFF5A623"/></patternFill></fill></dxf>` +   // 3 오늘 (주황)
    `<dxf><fill><patternFill><bgColor rgb="FFF8CBAD"/></patternFill></fill></dxf>` +   // 4 공휴일 (분홍)
    `<dxf><fill><patternFill><bgColor rgb="FFE7E6E6"/></patternFill></fill></dxf>` +   // 5 주말 (회색)
    `</dxfs>` +
    `</styleSheet>`;

  // ═══ workbook / 관계 / Content_Types ═══
  const wbXml = XMLH + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="WBS" sheetId="1" r:id="rId1"/>` +
    `<sheet name="공휴일" sheetId="2" r:id="rId2"/>` +
    `<sheet name="사용법" sheetId="3" r:id="rId3"/>` +
    `</sheets>` +
    `<definedNames>` +
    `<definedName name="ChartUnit">WBS!$B$3</definedName>` +
    `<definedName name="HolidayList">공휴일!$A$2:$A$${HOL_MAX + 1}</definedName>` +
    `</definedNames>` +
    `<calcPr calcId="191029" fullCalcOnLoad="1"/>` +
    `</workbook>`;

  return zipBytes([
    { path: "[Content_Types].xml", content: XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { path: "_rels/.rels", content: XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { path: "xl/workbook.xml", content: wbXml },
    { path: "xl/_rels/workbook.xml.rels", content: XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { path: "xl/styles.xml", content: stylesXml },
    { path: "xl/worksheets/sheet1.xml", content: wbsSheet },
    { path: "xl/worksheets/sheet2.xml", content: holSheet },
    { path: "xl/worksheets/sheet3.xml", content: usageSheet },
  ]);
}

// ── PPTX ─────────────────────────────────────────────────────
const PPT_THEME = XMLH + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
function pptTextBox(id, name, x, y, w, h, text, size, bold, color) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xesc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${text.split("\n").map(line =>
    `<a:p><a:r><a:rPr lang="ko-KR" sz="${size}"${bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xesc(line)}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
}
function makePptx({ title, lines }) {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const slide1 = XMLH + `<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    pptTextBox(2, "Title", 457200, 1600200, 8229600, 1143000, title, 3200, true, "1F3864") +
    pptTextBox(3, "Body", 457200, 2971800, 8229600, 2286000, lines.join("\n"), 1600, false, "404040") +
    `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;
  const master = XMLH + `<p:sldMaster ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
  const layout = XMLH + `<p:sldLayout ${NS} type="blank"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const presentation = XMLH + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return zipBytes([
    { path: "[Content_Types].xml", content: XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>' },
    { path: "_rels/.rels", content: XMLH + `<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>` },
    { path: "ppt/presentation.xml", content: presentation },
    { path: "ppt/_rels/presentation.xml.rels", content: XMLH + `<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>` },
    { path: "ppt/slideMasters/slideMaster1.xml", content: master },
    { path: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: XMLH + `<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` },
    { path: "ppt/slideLayouts/slideLayout1.xml", content: layout },
    { path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: XMLH + `<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` },
    { path: "ppt/theme/theme1.xml", content: PPT_THEME },
    { path: "ppt/slides/slide1.xml", content: slide1 },
    { path: "ppt/slides/_rels/slide1.xml.rels", content: XMLH + `<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` },
  ]);
}


// 우선순위 표시: 방법론 테일러링의 M/O 표기와 통일 (구버전 "필수"/"선택" 저장분 호환)
function prioInfo(p) {
  const s = String(p || "");
  if (s.startsWith("필수")) return { label: "필수(M)", color: T.red };
  if (s.startsWith("권장")) return { label: "권장", color: T.amber };
  return { label: "선택(O)", color: T.muted };
}

// 산출물 이름으로 Office 형식 자동 배정
function pickOfficeFormat(name) {
  const n = String(name || "");
  if (/오리엔테이션|교육|발표|데모 자료/.test(n)) return "pptx";
  if (/매트릭스|대장|목록|리스트|백로그|체크리스트|WBS|추적표|현황|내역서|데이터|Data|차트|조견표/.test(n)) return "xlsx";
  return "docx";
}

// WBS 산출물 전용 — ④ 일정 계획 표 전체(요약 롤업·계층 들여쓰기·공휴일 포함)를 그대로 담는다
function wbsXlsxRows(wbs, meta) {
  const today = new Date().toLocaleDateString("ko-KR");
  const rollup = (t) => {
    const ss = (t.subtasks||[]).map(s=>s.start).filter(Boolean).sort();
    const ff = (t.subtasks||[]).map(s=>s.finish).filter(Boolean).sort();
    const eff = (t.subtasks||[]).reduce((n,s)=>n+(Number(s.effort)||0),0);
    return { start: ss[0]||"", finish: ff.slice(-1)[0]||"", eff };
  };
  const rows = [
    ["문서명", "WBS (일정 계획)"], ["프로젝트명", meta.name||""], ["고객사", meta.client||""], ["PM", meta.pm||""],
    ["프로젝트 기간", `${meta.startDate||""} ~ ${meta.endDate||""}`], ["작성일", today], ["버전", "V0.1 (초안)"],
  ];
  if ((wbs.holidays||[]).length) rows.push(["공휴일", wbs.holidays.join(", ")]);
  rows.push([]);
  rows.push(["WBS", "Task", "산출물", "작업자", "선행", "시작일", "종료일", "공수(일)"]);
  (wbs.tasks||[]).forEach(t => {
    const r = rollup(t);
    rows.push([t.wbsCode, t.phase, "요약 (하위 롤업)", "", "", r.start, r.finish, r.eff ? String(r.eff) : ""]);
    (t.subtasks||[]).forEach(s => {
      const indent = "  ".repeat(Math.max(0, (s.level||2) - 2));
      const deliv = isWbsLeaf(t.subtasks, s.wbsCode) ? (s.deliverable||"") : "";   // 산출물은 최하위 Task에만 표시
      rows.push([s.wbsCode, indent + (s.task||""), deliv, s.assignee||"", s.pred||"", s.start||"", s.finish||"", s.effort ? String(s.effort) : ""]);
    });
  });
  return rows;
}

// ── OSSP 라이브러리 산출물템플릿 매칭 ─────────────────────────
// 템플릿 파일명 정규화: 폴더 경로·확장자·버전 표기(_v2.0 등)·선두 코드(RD1202 - 등)·괄호·구분자 제거
function normDocName(s) {
  let x = String(s || "");
  x = x.split("/").pop();
  x = x.replace(/\.[A-Za-z0-9]+$/, "");
  x = x.replace(/[\s_\-]*v\d+([._\s]\d+)*$/i, "");
  x = x.replace(/^[A-Za-z]{1,4}\d{3,5}\s*[-–—_.]?\s*/, "");
  x = x.replace(/\(.*?\)/g, "");
  x = x.replace(/[\s_\-·.]/g, "");
  return x.toLowerCase();
}
const _osspTplCache = {};   // ossp_id(또는 "*"=전체) → 산출물템플릿 파일 목록 (세션 캐시)
async function fetchOsspTemplates(osspId) {
  const key = osspId || "*";
  if (_osspTplCache[key]) return _osspTplCache[key];
  const res = await fetch(osspId ? `/api/ossp-files?ossp_id=${osspId}` : "/api/ossp-files");
  const data = await res.json();
  const list = (Array.isArray(data) ? data : []).filter(f => f.category === "산출물템플릿");
  _osspTplCache[key] = list;
  return list;
}
// 위저드의 내장 OSSP는 하드코딩 id("waterfall" 등)라 DB UUID가 아님 → 이름으로 DB 행을 찾아 UUID 해석
const _osspListCache = { list: null };
async function resolveOsspDbId(ossp) {
  if (!ossp) return null;
  const id = String(ossp.id || "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  try {
    if (!_osspListCache.list) {
      const res = await fetch("/api/ossp");
      const data = await res.json();
      _osspListCache.list = Array.isArray(data) ? data : [];
    }
    const name = ossp.label || ossp.name || "";
    const row = _osspListCache.list.find(o => o.name === name);
    return row?.id || null;
  } catch (_) { return null; }
}
function findTemplateFor(docName, templates) {
  const target = normDocName(docName);
  if (!target) return null;
  let exact = null, partial = null;
  for (const f of templates) {
    const t = normDocName(f.file_name);
    if (!t) continue;
    if (t === target) { exact = f; break; }
    if (!partial && (t.includes(target) || target.includes(t))) partial = f;
  }
  return exact || partial;
}
async function fetchTemplateBytes(f) {
  const res = await fetch(`/api/ossp-files?path=${encodeURIComponent(f.file_url)}&name=${encodeURIComponent(f.file_name)}`);
  const data = await res.json();
  if (!data?.url) return null;
  const fileRes = await fetch(data.url);
  if (!fileRes.ok) return null;
  return new Uint8Array(await fileRes.arrayBuffer());
}
// 동적 실데이터로 생성해야 하는 특수 산출물 여부 (템플릿보다 우선)
function isDynamicDoc(doc, wbs, ctx) {
  const n = String(doc.name || "").replace(/\s/g, "");
  if (n.toUpperCase() === "WBS" && wbs?.tasks?.length) return true;
  if (n === "테일러링결과서" && ctx?.tailoring) return true;
  if (reqDocKind(doc.name) && ctx?.requirements?.items?.length) return true;   // 확정된 요구사항이 있으면 정의서·명세서를 실문서로 생성
  return false;
}
// 산출물 1건 → 파일 결정: 특수 산출물 → OSSP 템플릿 실파일 → 스켈레톤 순
async function resolveDeliverableFile(doc, catName, meta, wbs, ctx) {
  if (!isDynamicDoc(doc, wbs, ctx)) {
    try {
      // 1) 선택된 OSSP의 산출물템플릿에서 우선 매칭 (내장 OSSP는 이름 → DB UUID 해석)
      let tpl = null;
      const dbId = await resolveOsspDbId(ctx?.ossp);
      if (dbId) tpl = findTemplateFor(doc.name, await fetchOsspTemplates(dbId));
      // 2) 없으면 전체 OSSP 라이브러리의 산출물템플릿에서 폴백 매칭
      if (!tpl) tpl = findTemplateFor(doc.name, await fetchOsspTemplates(null));
      if (tpl) {
        const bytes = await fetchTemplateBytes(tpl);
        if (bytes) {
          const ext = (String(tpl.file_name).split(".").pop() || "bin").toLowerCase();
          // 템플릿이 docx면 프로젝트 로고(고객사·우리회사) 주입 시도 — 실패 시 원본 그대로
          if (ext === "docx") {
            try {
              const injected = await injectLogosIntoTemplateDocx(bytes, meta);
              if (injected) return { ext, bytes: injected };
            } catch (_) { /* 주입 실패 시 원본 유지 */ }
          }
          // 템플릿이 xlsx면: (1) 요구사항 추적 매트릭스에 확정 요구사항 채움 → (2) 로고 텍스트박스 치환
          if (ext === "xlsx") {
            let cur = bytes;
            try {
              const nn = normDocName(doc.name);
              if (nn.includes("추적매트릭스") || (nn.includes("요구사항") && nn.includes("추적"))) {
                const withReq = await injectRequirementsIntoRtmXlsx(cur, ctx?.requirements);
                if (withReq) cur = withReq;
              }
            } catch (_) { /* 요구사항 주입 실패 시 원본 유지 */ }
            try {
              const injected = await injectLogosIntoTemplateXlsx(cur, meta);
              return { ext, bytes: injected || cur };
            } catch (_) { return { ext, bytes: cur }; }
          }
          return { ext, bytes };
        }
      }
    } catch (_) { /* 템플릿 조회·다운로드 실패 시 스켈레톤 폴백 */ }
  }
  return officeFileForDoc(doc, catName, meta, wbs, ctx);
}

// 산출물 1건 → Office 파일 바이트 생성 (wbs: WBS 산출물에 일정 계획 원본을 담기 위한 전달)
function officeFileForDoc(doc, catName, meta, wbs, ctx) {
  // 산출물명이 'WBS'면 스켈레톤 대신 ④ 일정 계획 전체를 담은 간트 워크북(수식·조건부 서식, 일/주 전환)을 생성
  if (String(doc.name||"").replace(/\s/g,"").toUpperCase() === "WBS" && wbs?.tasks?.length) {
    return { ext: "xlsx", bytes: makeWbsGanttXlsx(wbs, meta) };
  }
  // 산출물명이 '테일러링결과서'면 스켈레톤 대신 PDP 화면과 동일한 구성의 실제 문서를 생성
  if (String(doc.name||"").replace(/\s/g,"") === "테일러링결과서" && ctx?.tailoring) {
    return { ext: "docx", bytes: makePdpDocx(meta, ctx, catName) };
  }
  // 산출물명이 요구사항 정의서/명세서(통합 포함)이고 확정된 요구사항이 있으면 실문서를 생성
  const reqKind = reqDocKind(doc.name);
  if (reqKind && ctx?.requirements?.items?.length) {
    return { ext: "docx", bytes: makeReqDocx(meta, ctx, catName, reqKind, doc) };
  }
  const fmt = pickOfficeFormat(doc.name);
  const today = new Date().toLocaleDateString("ko-KR");
  const prio = prioInfo(doc.priority).label;
  const period = `${meta.startDate || ""} ~ ${meta.endDate || ""}`;
  if (fmt === "xlsx") {
    const sheetName = String(doc.name).replace(/[\\/?*\[\]:]/g, " ").slice(0, 28).trim() || "Sheet1";
    return { ext: "xlsx", bytes: makeXlsx({ sheetName, rows: [
      ["문서명", doc.name], ["문서 코드", doc.code || "-"], ["단계/프로세스", catName], ["구분", prio],
      ["프로젝트명", meta.name || ""], ["고객사", meta.client || ""], ["PM", meta.pm || ""],
      ["프로젝트 기간", period], ["작성일", today], ["버전", "V0.1 (초안)"],
      ["목적", doc.purpose || ""], [],
      ["No", "항목", "내용", "작성자", "일자", "비고"],
      ["1", "", "", "", "", ""], ["2", "", "", "", "", ""], ["3", "", "", "", "", ""],
    ] }) };
  }
  if (fmt === "pptx") {
    return { ext: "pptx", bytes: makePptx({ title: doc.name, lines: [
      `프로젝트: ${meta.name || ""}`,
      `고객사: ${meta.client || ""} · PM: ${meta.pm || ""}`,
      `단계/프로세스: ${catName} · ${prio}`,
      `목적: ${doc.purpose || ""}`,
      `작성일: ${today} · V0.1 (초안)`,
    ] }) };
  }
  return { ext: "docx", bytes: makeDocx({ title: doc.name, purpose: doc.purpose, doc, catName, meta }) };
}

// 산출물 1건만 개별 다운로드 (ZIP 내부와 동일한 파일명 규칙)
const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
};
async function downloadSingleDeliverable(doc, catName, meta, wbs, ctx) {
  const sanitize = s => String(s || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  const pi = prioInfo(doc.priority);
  const of = await resolveDeliverableFile(doc, catName, meta, wbs, ctx);
  const mime = OFFICE_MIME[of.ext] || "application/octet-stream";
  const codePart = sanitize(doc.code || "");
  const wbsPart = sanitize(doc.wbsNo || "");
  const blob = new Blob([of.bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement("a");
  aEl.href = url; aEl.download = `[${pi.label}] ${wbsPart ? wbsPart + "_" : ""}${codePart ? codePart + "_" : ""}${sanitize(doc.name)}.${of.ext}`;
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// 산출물 전체를 폴더 구조 ZIP으로 다운로드 (각 파일은 실제 Office 문서)
// onProgress?: ({ percent, label }) => void — 건별 파일 생성 진행률 보고 (템플릿 조회·문서 생성이 오래 걸릴 수 있음)
async function downloadDeliverablesZip(deliverables, meta, wbs, ctx, onProgress) {
  const report = (percent, label) => { try { onProgress && onProgress({ percent, label }); } catch (_) {} };
  const sanitize = s => String(s || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  const cats = deliverables?.categories || [];
  const allCount = cats.reduce((n, c) => n + (c.documents?.length || 0), 0);
  let done = 0;
  report(2, `산출물 파일 생성 준비 중… (총 ${allCount}건)`);
  const files = []; const manifest = [];
  let total = 0, mand = 0;
  for (let ci = 0; ci < cats.length; ci++) {
    const cat = cats[ci];
    const folder = `${String(ci + 1).padStart(2, "0")}_${sanitize(cat.name)}`;
    for (const doc of (cat.documents || [])) {
      const pi = prioInfo(doc.priority);
      // 2~92% 구간을 건수 비례로 배분 — 파일 하나 생성할 때마다 전진
      report(2 + (done / Math.max(1, allCount)) * 90, `${doc.name} 생성 중… (${done + 1}/${allCount})`);
      const of = await resolveDeliverableFile(doc, cat.name, meta, wbs, ctx);
      done += 1;
      const codePart = sanitize(doc.code || "");
      const wbsPart = sanitize(doc.wbsNo || "");   // 동일 산출물명이 여러 Task에 있어도 WBS 번호로 파일명 구분
      files.push({ path: `${folder}/[${pi.label}] ${wbsPart ? wbsPart + "_" : ""}${codePart ? codePart + "_" : ""}${sanitize(doc.name)}.${of.ext}`, content: of.bytes });
      manifest.push([folder, doc.wbsNo || "-", doc.code || "-", doc.name, of.ext.toUpperCase(), pi.label, doc.purpose || ""]);
      total += 1; if (pi.label === "필수(M)") mand += 1;
    }
  }
  report(94, "산출물 목록 작성·ZIP 압축 중…");
  files.unshift({ path: "00_산출물목록.xlsx", content: makeXlsx({ sheetName: "산출물목록", rows: [
    ["프로젝트", meta.name || ""], ["고객사", meta.client || ""], ["PM", meta.pm || ""],
    ["생성일", new Date().toLocaleString("ko-KR")],
    ["전체", `${total}건 (필수(M) ${mand} · 선택(O) ${total - mand})`], [],
    ["폴더", "WBS", "코드", "산출물", "형식", "구분", "목적"],
    ...manifest,
  ] }) });
  const blob = new Blob([zipBytes(files)], { type: "application/zip" });
  report(100, `ZIP 다운로드 시작 — 산출물 ${allCount}건`);
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement("a");
  aEl.href = url; aEl.download = `${sanitize(meta.name) || "project"}_산출물.zip`;
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ── 요구사항 AI 작성 모달: 원문 입력(텍스트·txt·docx 업로드) → AI 도출·명세 → 검토·수정 → 확정 ──
// 확정된 요구사항은 요구사항 정의서·명세서 docx 생성과 요구사항 추적 매트릭스(xlsx) 자동 채움에 사용됨
function ReqGenModal({ onClose, form, wbs, requirements, setRequirements }) {
  const leaves = reqSpecLeaves(wbs);   // WBS 최하위 기능 모듈 (요구사항 배정 후보)
  const leafName = {}; leaves.forEach(l => { leafName[l.wbsNo] = l.name; });
  const [srcText, setSrcText] = useState("");
  const [srcName, setSrcName] = useState(requirements?.sourceName || "");
  const [items, setItems] = useState(requirements?.items ? requirements.items.map(x => ({ ...x })) : []);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});   // 행별 상세(명세) 펼침
  const inp = { width:"100%", padding:"5px 7px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, fontFamily:"inherit", boxSizing:"border-box" };
  const ta = { ...inp, minHeight:44, resize:"vertical", lineHeight:1.5 };

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const name = file.name.toLowerCase();
      let text = "";
      if (name.endsWith(".txt")) text = await file.text();
      else if (name.endsWith(".docx")) text = await docxBytesToText(new Uint8Array(await file.arrayBuffer()));
      else if (name.endsWith(".xlsx")) text = await xlsxBytesToText(new Uint8Array(await file.arrayBuffer()));
      else { setError("txt·docx·xlsx 파일만 업로드할 수 있습니다."); return; }
      if (!text.trim()) { setError("파일에서 텍스트를 추출하지 못했습니다."); return; }
      setSrcText(t => (t ? t + "\n\n" : "") + text.trim());
      setSrcName(file.name);
    } catch (err) { setError("파일 읽기 실패: " + err.message); }
  }

  async function generate() {
    const srcAll = srcText.trim();
    if (srcAll.length < 20) { setError("이해관계자 요구사항 원문을 20자 이상 입력하거나 파일을 업로드해 주세요."); return; }
    setBusy(true); setError(null);
    try {
      // 1차(RD1200): 원문 → 기능·비기능·인터페이스 요구사항 도출 — 원문이 길면 분할 호출 (Vercel 타임아웃 대응)
      const chunks = [];
      for (let i = 0; i < srcAll.length; i += 6000) chunks.push(srcAll.slice(i, i + 6000));
      let raw = [];
      for (let i = 0; i < chunks.length; i++) {
        setProg({ percent: 5 + (i / chunks.length) * 35, label: `요구사항 도출 중… (${i + 1}/${chunks.length})` });
        const r = await callClaudeJson(`당신은 정보공학 방법론 요구정의 단계(RD1200 요구사항 정의)에 정통한 SI 품질보증 전문가입니다. 아래 이해관계자 요구사항 원문에서 기능·비기능·인터페이스 요구사항을 도출하세요.
프로젝트: ${form?.name || ""} (${form?.type || ""}) / 고객사: ${form?.client || ""}
규칙: 요구사항 단위로 중복 없이 분할. 비기능은 ISO 9126 품질특성(기능성/신뢰성/사용성/효율성/유지보수성/이식성) 관점으로 식별. 최대 30건.
JSON만 출력: {"items":[{"type":"기능|비기능|인터페이스","name":"요구사항명(25자 이내)","source":"원문 내 근거(15자 이내)","priority":"상|중|하","summary":"개요 1문장(50자 이내)"}]}
--- 원문 ---
${chunks[i]}`, 6000);
        raw = raw.concat(Array.isArray(r?.items) ? r.items : []);
      }
      if (!raw.length) throw new Error("도출된 요구사항이 없습니다. 원문을 확인해 주세요.");
      let list = assignReqIds(raw.map(it => ({
        type: ["기능", "비기능", "인터페이스"].includes(it.type) ? it.type : "기능",
        name: String(it.name || "").slice(0, 60), source: String(it.source || ""),
        priority: ["상", "중", "하"].includes(it.priority) ? it.priority : "중",
        summary: String(it.summary || ""), detail: "", acceptance: "", quality: "", assumptions: "", wbsNo: "공통",
      })));
      // 2차(RD1300): 5건씩 상세 명세 — 상세설명·인수기준·품질특성·가정/제약
      const B = 5;
      for (let i = 0; i < list.length; i += B) {
        const grp = list.slice(i, i + B);
        setProg({ percent: 40 + (i / list.length) * 40, label: `요구사항 명세 작성 중… (${Math.min(i + B, list.length)}/${list.length})` });
        const r = await callClaudeJson(`당신은 정보공학 방법론 요구정의 단계(RD1300 요구사항 명세)에 정통한 SI 품질보증 전문가입니다. 아래 요구사항 각각을 구현 가능성·테스트 가능성을 고려해 상세 명세하세요. 비기능은 측정기준을 포함하세요.
JSON만 출력: {"items":[{"id":"...","detail":"상세 설명 2~3문장","acceptance":"측정 가능한 인수 기준 1~2문장","quality":"비기능이면 ISO 9126 품질특성명, 아니면 빈 문자열","assumptions":"가정·제약(없으면 빈 문자열)"}]}
--- 요구사항 ---
${JSON.stringify(grp.map(g => ({ id: g.id, type: g.type, name: g.name, summary: g.summary })))}`, 6000);
        const map = {};
        (Array.isArray(r?.items) ? r.items : []).forEach(d => { if (d?.id) map[d.id] = d; });
        list = list.map(it => map[it.id] ? { ...it, detail: String(map[it.id].detail || ""), acceptance: String(map[it.id].acceptance || ""), quality: String(map[it.id].quality || ""), assumptions: String(map[it.id].assumptions || "") } : it);
      }
      // 3차(배정): 요구사항 → WBS 최하위 기능 모듈. 공통·비기능처럼 특정 모듈에 귀속되지 않으면 "공통"
      if (leaves.length) {
        const A = 10;
        for (let i = 0; i < list.length; i += A) {
          const grp = list.slice(i, i + A);
          setProg({ percent: 80 + (i / list.length) * 18, label: `기능 모듈 배정 중… (${Math.min(i + A, list.length)}/${list.length})` });
          const r = await callClaudeJson(`당신은 SI 요구사항 관리 전문가입니다. 각 요구사항을 아래 WBS 최하위 기능 모듈 중 가장 적합한 곳에 배정하세요. 특정 모듈에 귀속되지 않는 전사 공통·보안·성능 등 비기능 요구사항은 "공통"으로 배정하세요.
모듈 목록: ${JSON.stringify(leaves)}
JSON만 출력: {"items":[{"id":"...","wbsNo":"모듈의 wbsNo 또는 공통"}]}
--- 요구사항 ---
${JSON.stringify(grp.map(g => ({ id: g.id, type: g.type, name: g.name, summary: g.summary })))}`, 4000);
          const amap = {};
          (Array.isArray(r?.items) ? r.items : []).forEach(d => { if (d?.id) amap[d.id] = String(d.wbsNo || "공통"); });
          list = list.map(it => {
            const w = amap[it.id];
            return w ? { ...it, wbsNo: leafName[w] !== undefined ? w : "공통" } : it;
          });
        }
      }
      setItems(list);
      setProg({ percent: 100, label: `요구사항 ${list.length}건 도출·명세${leaves.length ? "·모듈 배정" : ""} 완료 — 아래에서 검토·수정 후 확정하세요.` });
    } catch (e) { setError("AI 생성 실패: " + e.message); setProg(null); }
    setBusy(false);
  }

  const upd = (i, k, v) => setItems(list => list.map((it, j) => j === i ? { ...it, [k]: v } : it));
  const del = i => setItems(list => list.filter((_, j) => j !== i));
  const add = () => setItems(list => assignReqIds([...list, { id: "", type: "기능", name: "", source: "", priority: "중", summary: "", detail: "", acceptance: "", quality: "", assumptions: "", wbsNo: "공통" }]));
  function confirmSave() {
    const valid = items.filter(it => String(it.name || "").trim());
    if (!valid.length) { setError("확정할 요구사항이 없습니다. 요구사항명을 입력해 주세요."); return; }
    const normed = assignReqIds(valid).map(it => ({ ...it, wbsNo: it.wbsNo && (it.wbsNo === "공통" || leafName[it.wbsNo] !== undefined) ? it.wbsNo : "공통" }));
    setRequirements({ items: normed, sourceName: srcName || "직접 입력", specLeaves: leaves, updatedAt: new Date().toISOString() });
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, width:"100%", maxWidth:980, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>🤖 요구사항 정의서·명세서 AI 작성</div>
            <div style={{ fontSize:10.5, color:T.muted, marginTop:2 }}>이해관계자 요구사항 원문 → 도출(RD1200)·명세(RD1300) → 검토·확정 시 정의서·명세서 docx와 요구사항 추적 매트릭스에 자동 반영</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"14px 18px", overflowY:"auto" }}>
          <div style={{ fontSize:11, fontWeight:600, marginBottom:6 }}>이해관계자 요구사항 원문 <span style={{ color:T.muted, fontWeight:400 }}>(RFP 발췌·인터뷰 기록·회의록 등 붙여넣기 또는 파일 업로드)</span></div>
          <textarea value={srcText} onChange={e=>setSrcText(e.target.value)} placeholder="예) 사용자는 네트워크 장비 목록을 조건별로 검색할 수 있어야 한다. 시스템 응답시간은 3초 이내여야 한다. …" disabled={busy}
            style={{ ...ta, minHeight:110, marginBottom:8 }} />
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", border:`1px dashed ${T.border}`, borderRadius:8, cursor: busy?"default":"pointer", fontSize:11, color:T.muted }}>
              📎 파일 업로드 (txt·docx·xlsx)
              <input type="file" accept=".txt,.docx,.xlsx" onChange={onFile} disabled={busy} style={{ display:"none" }} />
            </label>
            {srcName && <span style={{ fontSize:10.5, color:T.accent }}>📄 {srcName}</span>}
            <div style={{ flex:1 }} />
            <Btn onClick={generate} disabled={busy} style={{ fontSize:12, padding:"7px 14px" }}>{busy ? "⏳ 생성 중…" : items.length ? "⚡ AI 재생성" : "⚡ AI 도출·명세"}</Btn>
          </div>
          {(busy || prog) && <GenProgressBar progress={prog || { percent:3, label:"요구사항 분석 준비 중…" }} subText="원문 분량·요구사항 건수에 따라 수십 초가 걸릴 수 있습니다. 화면을 유지해 주세요." />}
          {error && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9, marginBottom:10 }}>{error}</div>}
          {items.length > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:600 }}>도출된 요구사항 <span style={{ color:T.accent }}>{items.length}건</span> <span style={{ fontSize:10.5, color:T.muted, fontWeight:400 }}>— 수정·추가·삭제 후 확정하세요. '상세'에서 명세 내용을 편집합니다.</span></div>
                <button onClick={add} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.accent, cursor:"pointer", fontSize:11, padding:"3px 10px", fontFamily:"inherit" }}>＋ 행 추가</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ display:"grid", gridTemplateColumns:"60px 78px 1fr 92px 52px 150px 1fr 44px 24px", gap:6, fontSize:10, color:T.muted, padding:"0 4px" }}>
                  <span>ID</span><span>유형</span><span>요구사항명</span><span>출처</span><span>우선순위</span><span>기능 모듈</span><span>개요</span><span></span><span></span>
                </div>
                {items.map((it, i) => (
                  <div key={i} style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 8px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"60px 78px 1fr 92px 52px 150px 1fr 44px 24px", gap:6, alignItems:"center" }}>
                      <span style={{ fontFamily:"monospace", fontSize:10, color:T.accent }}>{it.id}</span>
                      <select value={it.type} onChange={e=>upd(i,"type",e.target.value)} style={inp}>
                        {["기능","비기능","인터페이스"].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={it.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="요구사항명" style={inp} />
                      <input value={it.source} onChange={e=>upd(i,"source",e.target.value)} placeholder="출처" style={inp} />
                      <select value={it.priority} onChange={e=>upd(i,"priority",e.target.value)} style={inp}>
                        {["상","중","하"].map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={it.wbsNo || "공통"} onChange={e=>upd(i,"wbsNo",e.target.value)} title="이 요구사항이 배정될 WBS 최하위 기능 모듈 — 공통은 모든 모듈 명세서에 포함" style={inp}>
                        <option value="공통">공통 (전 모듈)</option>
                        {leaves.map(l=><option key={l.wbsNo} value={l.wbsNo}>{l.wbsNo} {l.name}</option>)}
                      </select>
                      <input value={it.summary} onChange={e=>upd(i,"summary",e.target.value)} placeholder="개요 1문장" style={inp} />
                      <button onClick={()=>setOpen(o=>({ ...o, [i]:!o[i] }))} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.muted, cursor:"pointer", fontSize:10, padding:"4px 0", fontFamily:"inherit" }}>{open[i]?"접기":"상세"}</button>
                      <button onClick={()=>del(i)} title="삭제" style={{ background:"none", border:"none", color:T.red, cursor:"pointer", fontSize:12 }}>✕</button>
                    </div>
                    {open[i] && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:6 }}>
                        <div><div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>상세 설명 (명세서)</div><textarea value={it.detail} onChange={e=>upd(i,"detail",e.target.value)} style={ta} /></div>
                        <div><div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>인수 기준</div><textarea value={it.acceptance} onChange={e=>upd(i,"acceptance",e.target.value)} style={ta} /></div>
                        <div><div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>품질특성 (비기능 · ISO 9126)</div><input value={it.quality} onChange={e=>upd(i,"quality",e.target.value)} placeholder="예: 효율성" style={inp} /></div>
                        <div><div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>가정·제약</div><input value={it.assumptions} onChange={e=>upd(i,"assumptions",e.target.value)} style={inp} /></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <span style={{ fontSize:10.5, color:T.muted }}>{requirements?.items?.length ? `현재 확정본: ${requirements.items.length}건 (${(requirements.updatedAt||"").slice(0,10)})` : "확정된 요구사항 없음"}</span>
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="outline" onClick={onClose} style={{ fontSize:12, padding:"7px 14px" }}>취소</Btn>
            <Btn onClick={confirmSave} disabled={busy || !items.length} style={{ fontSize:12, padding:"7px 14px" }}>✓ 확정 저장 ({items.length}건)</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDeliverables({ deliverablesData, generating, genProgress, genError, onGenerate, form, wbs, pdpCtx, requirements, setRequirements }) {
  const [expanded, setExpanded] = useState({});   // { 카테고리id: true } — 여러 카테고리 동시 펼침 유지
  const toggleCat = (id) => setExpanded(m => ({ ...m, [id]: !m[id] }));
  const [zipProgress, setZipProgress] = useState(null);   // 전체 ZIP 다운로드 진행 상황
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState(null);
  const [reqModal, setReqModal] = useState(false);   // 요구사항 AI 작성 모달
  async function handleZipDownload() {
    if (zipping) return;
    setZipping(true); setZipError(null);
    try {
      await downloadDeliverablesZip(deliverablesData, form||{}, wbs, pdpCtx, setZipProgress);
      setTimeout(() => setZipProgress(p => (p && p.percent >= 100 ? null : p)), 1500);
    } catch (e) {
      setZipProgress(null);
      setZipError("ZIP 다운로드 실패: " + e.message);
    }
    setZipping(false);
  }
  const total = deliverablesData?.summary?.totalDocs || 0;
  const mand = deliverablesData?.summary?.mandatoryCount || 0;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div><h2 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>산출물 자동생성</h2><p style={{ fontSize:11, color:T.muted }}>WBS에 반영되는 모든 단계의 산출물 문서 패키지를 구성합니다 (관리 프로세스 + 방법론 전 단계).</p></div>
        {!deliverablesData && <Btn onClick={onGenerate} disabled={generating} style={{ fontSize:12, padding:"7px 12px" }}>⚡ AI 생성</Btn>}
      </div>
      {(generating || genProgress) && (
        <GenProgressBar
          progress={genProgress || { percent: 5, label: "산출물 생성 준비 중…" }}
          subText="AI 호출 상황에 따라 수십 초가 걸릴 수 있습니다. 화면을 유지해 주세요." />
      )}
      {genError && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9 }}>{genError}</div>}
      {deliverablesData && (
        <div style={{ animation:"fadeIn .4s" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Badge color={T.green}>✓ 산출물 생성 완료</Badge>
            <div style={{ display:"flex", gap:6 }}>
              <Btn onClick={handleZipDownload} disabled={zipping} style={{ fontSize:11, padding:"4px 12px" }}>{zipping ? "⏳ 생성 중…" : "⬇ 전체 ZIP 다운로드"}</Btn>
              <Btn variant="outline" onClick={onGenerate} disabled={generating || zipping} style={{ fontSize:11, padding:"4px 10px" }}>재생성</Btn>
            </div>
          </div>
          {(zipping || zipProgress) && (
            <GenProgressBar
              progress={zipProgress || { percent: 2, label: "ZIP 생성 준비 중…" }}
              subText="산출물별 템플릿 조회·문서 생성 후 ZIP으로 압축합니다. 건수가 많으면 시간이 걸릴 수 있습니다." />
          )}
          {zipError && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9, marginBottom:12 }}>{zipError}</div>}
          {deliverablesData.summary?.source !== "wbs" && (
            <div style={{ fontSize:11, color:T.amber, padding:"8px 12px", background:T.amber+"11", border:`1px solid ${T.amber}44`, borderRadius:8, marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
              <span>⚠ 이전 버전에서 생성된 결과입니다. WBS의 모든 산출물을 반영하려면 재생성하세요.</span>
              <Btn onClick={onGenerate} disabled={generating} style={{ fontSize:11, padding:"4px 12px" }}>지금 재생성</Btn>
            </div>
          )}
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            {[{label:"전체",value:total,color:T.accent},{label:"필수(M)",value:mand,color:T.red},{label:"선택(O)",value:total-mand,color:T.amber}].map(s=>(
              <div key={s.label} style={{ flex:1, padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, textAlign:"center" }}>
                <div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          {deliverablesData.summary?.recon && (() => { const r = deliverablesData.summary.recon; return (
            <div style={{ fontSize:10.5, color:T.muted, padding:"7px 10px", background:T.bg, border:`1px dashed ${T.border}`, borderRadius:8, marginBottom:12, lineHeight:1.7 }}>
              ℹ <b style={{ color:T.text }}>WBS 개수 대사</b> — 최하위 Task {r.leafTotal}건 중 산출물 지정 <b style={{ color:T.text }}>{r.leafWithDeliv}건</b> 전부 1:1 반영
              {r.leafTotal - r.leafWithDeliv > 0 && <> (미지정 {r.leafTotal - r.leafWithDeliv}건 제외)</>}
              {r.pdpInjected && <> + 테일러링결과서 <b style={{ color:T.text }}>1건</b>(필수 자동추가)</>}
              {" "}= 전체 <b style={{ color:T.accent }}>{total}건</b>
              {r.dupIncluded > 0 && <span style={{ color:T.muted }}> · 동일 산출물명 {r.dupIncluded}건 포함(WBS 번호로 구분)</span>}
            </div>
          ); })()}
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:420, overflowY:"auto" }}>
            {deliverablesData.categories?.map(cat=>(
              <div key={cat.id} style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden", flexShrink:0 }}>
                <div onClick={()=>toggleCat(cat.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", cursor:"pointer" }}>
                  <span>{cat.icon}</span>
                  <span style={{ fontWeight:600, fontSize:13, flex:1 }}>{cat.name}</span>
                  <span style={{ fontSize:11, color:T.muted }}>{cat.documents?.length}건 {expanded[cat.id]?"▲":"▼"}</span>
                </div>
                {expanded[cat.id] && cat.documents?.map(doc=>(
                  <div key={doc.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 12px", borderTop:`1px solid ${T.border}` }}>
                    {doc.wbsNo && <span style={{ fontFamily:"monospace", fontSize:9, color:T.muted, border:`1px solid ${T.border}`, padding:"2px 5px", borderRadius:4, flexShrink:0, marginTop:2 }}>{doc.wbsNo}</span>}
                    <span style={{ fontFamily:"monospace", fontSize:9, color:T.accent, background:T.accentDim, padding:"2px 5px", borderRadius:4, flexShrink:0, marginTop:2 }}>{doc.code}</span>
                    <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600 }}>{doc.name}</div><div style={{ fontSize:10, color:T.muted }}>{doc.taskName ? `${doc.taskName} — ` : ""}{doc.purpose}</div></div>
                    <Badge color={prioInfo(doc.priority).color}>{prioInfo(doc.priority).label}</Badge>
                    {reqDocKind(doc.name) && (
                      <button onClick={()=>setReqModal(true)} title="이해관계자 요구사항 원문으로 AI 자동 작성"
                        style={{ background: requirements?.items?.length ? T.accentDim : "none", border:`1px solid ${T.accent}66`, borderRadius:6, color:T.accent, cursor:"pointer", fontSize:11, padding:"3px 8px", flexShrink:0, fontFamily:"inherit" }}>
                        {requirements?.items?.length ? `🤖 ${requirements.items.length}건 ✓` : "🤖 AI 작성"}
                      </button>
                    )}
                    <button onClick={()=>downloadSingleDeliverable(doc, cat.name, form||{}, wbs, pdpCtx)} title="이 산출물만 다운로드"
                      style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.accent, cursor:"pointer", fontSize:11, padding:"3px 8px", flexShrink:0, fontFamily:"inherit" }}>⬇</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {reqModal && <ReqGenModal onClose={()=>setReqModal(false)} form={form} wbs={wbs} requirements={requirements} setRequirements={setRequirements} />}
    </div>
  );
}

function StepReview({ form, sdlc, ossp, tailoring, pdpData, wbsData, deliverablesData }) {
  const procApplicable = resolveProcessTailoring(tailoring?.process).filter(r => r.status !== "해당없음");
  const items = [
    {label:"프로젝트명",value:form.name},{label:"고객사",value:form.client},
    {label:"유형",value:form.type},{label:"PM",value:form.pm},
    {label:"기간",value:`${form.startDate}~${form.endDate}`},
    {label:"SDLC",value:sdlc?.label},{label:"OSSP",value:ossp?.label},
    {label:"프로세스 테일러링",value:`${tailoring?.process?.level||"L3"} · 적용대상 ${procApplicable.length}건`},
    {label:"PDP",value:pdpData?"✓ 생성완료":"—"},{label:"WBS",value:wbsData?`✓ ${wbsData.tasks?.length}개 단계`:"—"},
    {label:"산출물",value:deliverablesData?`✓ ${deliverablesData.summary?.totalDocs}건`:"—"},
  ];
  return (
    <div>
      <h2 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>최종 확인</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {items.map(item=>(
          <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", background:T.bg, borderRadius:10, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:11, color:T.muted, textTransform:"uppercase", letterSpacing:0.5 }}>{item.label}</div>
            <div style={{ fontSize:12, fontWeight:600, color:item.value?.startsWith("✓")?T.green:T.text }}>{item.value||"—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 완료된 프로젝트 조회용 — 위저드에서 작성한 PDP(테일러링결과서)·WBS(일정표)를
// 동일한 형태로 다시 볼 수 있는 읽기 전용 뷰
// ═══════════════════════════════════════════════════════════════════
function PdpDocView({ project }) {
  const pdp = project.pdp;
  const tailoring = project.tailoring || {};
  const ossp = project.ossp;
  const sdlc = tailoring.sdlc;
  const guide = getGuideForOSSP(ossp);
  const scale = tailoring.scale || "중형";
  const method = tailoring.method || "UML";
  const excluded = tailoring.excluded || {};
  const notes = tailoring.notes || {};
  const scaleLabel = guide.scaleOptions?.find(o=>o.value===scale)?.label || scale;
  const list = classifyDeliverables(scale, method, guide);
  const isApplied = (d) => {
    if (d.required) return true;   // 필수(M) 산출물은 항상 적용
    const ov = notes[`${d.phase}:${d.code}`]?.applied;
    return ov !== undefined ? ov : !excluded[d.code];
  };
  const appliedCount = list.filter(isApplied).length;
  const grouped = {};
  list.forEach(d => { (grouped[d.phase] = grouped[d.phase] || []).push(d); });

  // 프로세스 테일러링 확정 상태 (저장된 tailoring.process 기반)
  const procState = tailoring.process || {};
  const procLevel = procState.level || "L3";
  const procApplicable = resolveProcessTailoring(procState).filter(r => r.status !== "해당없음");
  const procByArea = {};
  procApplicable.forEach(r => { (procByArea[r.area] = procByArea[r.area] || []).push(r); });

  if (!pdp) return <div style={{ color:T.muted, fontSize:12, padding:20 }}>저장된 PDP가 없습니다.</div>;

  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:20 }}>
      {/* 표지 */}
      <div style={{ textAlign:"center", paddingBottom:16, borderBottom:`2px solid ${T.accent}` }}>
        <div style={{ fontSize:18, fontWeight:700, letterSpacing:1 }}>프로젝트 정의 프로세스 (PDP)</div>
        <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>테일러링결과서 · Tailoring Result</div>
        <div style={{ fontSize:13, fontWeight:600, color:T.accent, marginTop:10 }}>{project.name}</div>
      </div>

      {/* 문서 메타 */}
      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", margin:"14px 0" }}>
        <tbody>
          <tr><td style={cellHead}>고객사</td><td style={cell}>{project.client||"-"}</td><td style={cellHead}>기간</td><td style={cell}>{project.startDate} ~ {project.endDate}</td></tr>
          <tr><td style={cellHead}>기준 OSSP</td><td style={cell}>{ossp?.label||"-"}</td><td style={cellHead}>SDLC</td><td style={cell}>{sdlc?.label||"-"}</td></tr>
        </tbody>
      </table>

      {/* 1. 프로젝트 개요 */}
      <SectionTitle n="1" title="프로젝트 개요" />
      <div style={{ fontSize:12, color:T.text, lineHeight:1.7, marginBottom:6 }}>{pdp.overview?.purpose}</div>
      {pdp.overview?.scope && <div style={{ fontSize:11, color:T.muted, lineHeight:1.6, marginBottom:6 }}><b>범위:</b> {pdp.overview.scope}</div>}
      {pdp.overview?.objectives?.length > 0 && (
        <div style={{ fontSize:11, color:T.muted, lineHeight:1.7 }}>
          {pdp.overview.objectives.map((o,i)=>(
            <div key={i}><span style={{ color:T.accent, marginRight:5 }}>▸</span>{o}</div>
          ))}
        </div>
      )}

      {/* 2. 테일러링 기준 */}
      <SectionTitle n="2" title="테일러링 기준" />
      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
        <tbody>
          <tr><td style={cellHead}>적용 가이드</td><td style={cell} colSpan={3}>{guide.title}</td></tr>
          <tr><td style={cellHead}>프로젝트 규모</td><td style={cell}>{scaleLabel}</td><td style={cellHead}>설계방식</td><td style={cell}>{guide.hasDesignMethod ? method : "해당 없음"}</td></tr>
          <tr><td style={cellHead}>규모 판정 기준</td><td style={cell} colSpan={3}>{guide.sizeNote?.replace(/^※\s*/, "")}</td></tr>
        </tbody>
      </table>

      {/* 3. 산출물 테일러링 매트릭스 */}
      <SectionTitle n="3" title={`산출물 테일러링 매트릭스 (전체 ${list.length}건 · 적용 ${appliedCount}건)`} />
      <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
        <thead>
          <tr>{["단계","코드","산출물","구분","적용 여부","변경 여부","테일러링 내역 및 사유"].map(h=>
            <td key={h} style={{...cellHead, textAlign:"center"}}>{h}</td>)}</tr>
        </thead>
        <tbody>
          {guide.phaseOrder.filter(ph=>grouped[ph]?.length).map(ph=>(
            grouped[ph].map((d,i)=>{
              const n = notes[`${d.phase}:${d.code}`] || {};
              const on = isApplied(d);
              return (
                <tr key={`${ph}-${d.code}`} style={{ opacity:on?1:0.55 }}>
                  {i===0 && <td style={{...cell, fontWeight:600, verticalAlign:"top"}} rowSpan={grouped[ph].length}>{ph}</td>}
                  <td style={{...cell, fontFamily:"monospace"}}>{d.code}</td>
                  <td style={cell}>{d.name}{d.note && <span style={{ color:T.muted, fontSize:9.5, marginLeft:4 }}>({d.note})</span>}</td>
                  <td style={{...cell, textAlign:"center"}}><Badge color={d.required?T.accent:T.amber}>{d.required?"필수":"선택"}</Badge></td>
                  <td style={{...cell, textAlign:"center", fontSize:13, color:on?T.accent:T.muted }}>{on ? "☒" : "☐"}</td>
                  <td style={{...cell, textAlign:"center", fontSize:13, color:!d.required&&n.changed?T.amber:T.muted }}>{d.required ? "—" : (n.changed ? "☒" : "☐")}</td>
                  <td style={{...cell, color:n.reason?T.text:T.muted }}>{d.required ? "" : (n.reason || "")}</td>
                </tr>
              );
            })
          ))}
        </tbody>
      </table>

      {/* 4. 프로세스 테일러링 내역서 — 방법론 매트릭스와 동일한 컬럼 구성 (읽기 전용) */}
      <SectionTitle n="4" title={`프로세스 테일러링 내역서 (적용 등급 ${procLevel} · 적용대상 ${procApplicable.length}건)`} />
      <table style={{ width:"100%", fontSize:10.5, borderCollapse:"collapse" }}>
        <thead>
          <tr>{["프로세스 영역","세부 프로세스","구분","적용 여부","변경 여부","테일러링 내역 및 사유"].map(h=>
            <td key={h} style={{...cellHead, textAlign:"center"}}>{h}</td>)}</tr>
        </thead>
        <tbody>
          {Object.keys(procByArea).map(area=>(
            procByArea[area].map((r,i)=>(
              <tr key={r.key} style={{ opacity:r.applied?1:0.55 }}>
                {i===0 && <td style={{...cell, fontWeight:600, verticalAlign:"top"}} rowSpan={procByArea[area].length}>{area}</td>}
                <td style={cell}>
                  {r.process}{r.activity && <span style={{ color:T.muted }}> › {r.activity}</span>}
                  {r.outputs && <div style={{ color:T.muted, fontSize:9.5, marginTop:2 }}>산출물: {r.outputs}</div>}
                </td>
                <td style={{...cell, textAlign:"center"}}><Badge color={r.mark==="●"?T.accent:T.amber}>{r.mark==="●"?"필수":"선택"}</Badge></td>
                <td style={{...cell, textAlign:"center", fontSize:13, color:r.applied?T.accent:T.muted }}>{r.applied ? "☒" : "☐"}</td>
                <td style={{...cell, textAlign:"center", fontSize:13, color:r.changed?T.amber:T.muted }}>{r.mark==="●" ? "—" : (r.applied ? (r.changed ? "☒" : "☐") : "—")}</td>
                <td style={{...cell, color:r.reason?T.text:T.muted, fontSize:10 }}>{r.mark==="●" || r.status==="적용" ? "—" : (r.reason || "")}</td>
              </tr>
            ))
          ))}
        </tbody>
      </table>

      {/* (구버전 프로젝트 호환) 일정·리스크가 저장돼 있으면 표시 */}
      {pdp.schedule?.phases?.length > 0 && (
        <>
          <SectionTitle n="5" title="추진 일정 (구버전 저장분)" />
          {pdp.schedule.phases.map((ph,i)=>(
            <div key={i} style={{ fontSize:11, padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ color:T.accent, marginRight:6 }}>■</span>{ph.phase}
              <span style={{ color:T.muted }}> ({ph.start} ~ {ph.end})</span>
            </div>
          ))}
        </>
      )}
      {pdp.risks?.length > 0 && (
        <>
          <SectionTitle n={pdp.schedule?.phases?.length > 0 ? "6" : "5"} title="주요 리스크 (구버전 저장분)" />
          {pdp.risks.map((r,i)=>(
            <div key={i} style={{ fontSize:11, padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
              <Badge color={r.level==="상"?T.red:r.level==="중"?T.amber:T.muted}>{r.level}</Badge>
              <span style={{ marginLeft:6 }}>{r.description}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function WbsScheduleView({ wbs }) {
  if (!wbs?.tasks?.length) return <div style={{ color:T.muted, fontSize:12, padding:20 }}>저장된 WBS가 없습니다.</div>;
  const holidays = wbs.holidays || [];
  const th = { ...cellHead, textAlign:"center", fontSize:10 };
  const rollup = (t) => {
    const ss = (t.subtasks||[]).map(s=>s.start).filter(Boolean).sort();
    const ff = (t.subtasks||[]).map(s=>s.finish).filter(Boolean).sort();
    const eff = (t.subtasks||[]).reduce((n,s)=>n+(Number(s.effort)||0),0);
    return { start:ss[0]||"", finish:ff.slice(-1)[0]||"", eff };
  };
  const total = wbs.tasks.reduce((n,t)=>n+1+(t.subtasks?.length||0),0);
  const leafCount = wbs.tasks.reduce((n,t)=>n+(t.subtasks?.length||0),0);
  const delivCount = wbs.tasks.reduce((n,t)=>n+(t.subtasks||[]).filter(s=>String(s.deliverable||"").trim()).length,0);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
        <Badge color={T.green}>WBS {total}개 항목</Badge>
        <Badge color={T.accent}>단계 {wbs.tasks.length} · 최하위 Task {leafCount}건 · 산출물 {delivCount}건</Badge>
        {holidays.length > 0 && <Badge color={T.red}>공휴일 {holidays.length}일</Badge>}
        {holidays.length > 0 && <span style={{ fontSize:10, color:T.muted }}>{holidays.join(", ")}</span>}
      </div>
      <div style={{ overflowX:"auto", border:`1px solid ${T.border}`, borderRadius:10 }}>
        <table style={{ borderCollapse:"collapse", fontSize:10.5, minWidth:"100%" }}>
          <thead>
            <tr>
              <td style={{ ...th, textAlign:"left" }}>WBS</td>
              <td style={{ ...th, textAlign:"left", minWidth:170 }}>Task</td>
              <td style={{ ...th, minWidth:100 }}>산출물</td>
              <td style={{ ...th, minWidth:70 }}>작업자</td>
              <td style={{ ...th, minWidth:70 }}>선행</td>
              <td style={th}>시작일</td>
              <td style={th}>종료일</td>
              <td style={{ ...th, width:60 }}>공수(일)</td>
            </tr>
          </thead>
          <tbody>
            {wbs.tasks.map(t => {
              const r = rollup(t);
              return (
                <React.Fragment key={t.id}>
                  <tr style={{ background:T.subtle }}>
                    <td style={{ ...cell, fontFamily:"monospace", fontWeight:700, color:T.accent }}>{t.wbsCode}</td>
                    <td style={{ ...cell, fontWeight:700 }}>{t.phase}</td>
                    <td style={cell} colSpan={3}><span style={{ fontSize:9.5, color:T.muted }}>요약 (하위 롤업)</span></td>
                    <td style={{ ...cell, textAlign:"center", color:T.muted }}>{r.start || "—"}</td>
                    <td style={{ ...cell, textAlign:"center", color:T.muted }}>{r.finish || "—"}</td>
                    <td style={{ ...cell, textAlign:"center", color:T.muted, fontWeight:700 }}>{r.eff || "—"}</td>
                  </tr>
                  {t.subtasks?.map(s => (
                    <tr key={s.id}>
                      <td style={{ ...cell, fontFamily:"monospace", fontSize:9.5, color:T.muted, whiteSpace:"nowrap" }}>{s.wbsCode}</td>
                      <td style={{ ...cell, paddingLeft: 8 + ((s.level || 2) - 2) * 14 }}>{s.task}</td>
                      <td style={cell}>{s.deliverable || ""}</td>
                      <td style={{ ...cell, textAlign:"center" }}>{s.assignee || ""}</td>
                      <td style={{ ...cell, textAlign:"center" }}>{s.pred || ""}</td>
                      <td style={{ ...cell, textAlign:"center", whiteSpace:"nowrap" }}>{s.start || ""}</td>
                      <td style={{ ...cell, textAlign:"center", whiteSpace:"nowrap" }}>{s.finish || ""}</td>
                      <td style={{ ...cell, textAlign:"center" }}>{s.effort || ""}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectDetail({ project, nav, onDelete, onEdit }) {
  const [tab, setTab] = useState("overview");
  // 테일러링결과서 실문서 생성용 컨텍스트 (SDLC는 tailoring JSON에 함께 저장됨)
  const pdpCtx = { ossp:project.ossp||null, sdlc:project.tailoring?.sdlc||null, tailoring:project.tailoring||null, pdp:project.pdp||null, requirements:project.tailoring?.requirements||null };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zipProgress, setZipProgress] = useState(null);   // 전체 ZIP 다운로드 진행 상황
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState(null);
  async function handleZipDownload() {
    if (zipping) return;
    setZipping(true); setZipError(null);
    try {
      await downloadDeliverablesZip(project.deliverables, project, project.wbs, pdpCtx, setZipProgress);
      setTimeout(() => setZipProgress(p => (p && p.percent >= 100 ? null : p)), 1500);
    } catch (e) {
      setZipProgress(null);
      setZipError("ZIP 다운로드 실패: " + e.message);
    }
    setZipping(false);
  }
  if (!project) return <div style={{ padding:40, color:T.muted }}>프로젝트를 선택하세요.</div>;
  return (
    <div style={{ padding:"16px", maxWidth:1000, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={()=>nav("dashboard")} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:20 }}>←</button>
        <div style={{ flex:1 }}><h1 style={{ fontSize:17, fontWeight:700 }}>{project.name}</h1><p style={{ fontSize:11, color:T.muted }}>{project.client} · {project.ossp?.label} · PM: {project.pm}</p></div>
        <Btn variant="outline" onClick={()=>onEdit && onEdit(project)} style={{ fontSize:12, padding:"6px 10px" }}>✎ 수정</Btn>
        {confirmDelete
          ? <div style={{ display:"flex", gap:6 }}><Btn variant="danger" onClick={()=>onDelete(project.id)} style={{ fontSize:12, padding:"6px 10px" }}>삭제확인</Btn><Btn variant="ghost" onClick={()=>setConfirmDelete(false)} style={{ fontSize:12, padding:"6px 10px" }}>취소</Btn></div>
          : <Btn variant="ghost" onClick={()=>setConfirmDelete(true)} style={{ color:T.red, fontSize:12, padding:"6px 10px" }}>삭제</Btn>
        }
      </div>
      <div style={{ display:"flex", gap:3, marginBottom:16, background:T.surface, borderRadius:10, padding:3, border:`1px solid ${T.border}` }}>
        {[["overview","개요"],["pdp","PDP"],["wbs","WBS"],["deliverables","산출물"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"7px 0", borderRadius:7, fontSize:12, fontWeight:tab===id?700:400, background:tab===id?T.accent:"transparent", color:tab===id?"#fff":T.muted, border:"none", cursor:"pointer", fontFamily:"inherit" }}>{label}</button>
        ))}
      </div>
      {tab==="overview" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[["기간",`${project.startDate} ~ ${project.endDate}`],["유형",project.type],["OSSP",project.ossp?.label],["문서화 수준",project.tailoring?.doc_level],["리뷰 주기",project.tailoring?.review_cycle],["테스트 수준",project.tailoring?.test_level]].map(([k,v])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", background:T.surface, borderRadius:10, border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color:T.muted, textTransform:"uppercase" }}>{k}</div>
              <div style={{ fontSize:13, fontWeight:600 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {tab==="pdp" && <PdpDocView project={project} />}
      {tab==="wbs" && <WbsScheduleView wbs={project.wbs} />}
      {tab==="deliverables" && project.deliverables && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <Btn onClick={handleZipDownload} disabled={zipping} style={{ fontSize:11, padding:"5px 12px" }}>{zipping ? "⏳ 생성 중…" : "⬇ 전체 ZIP 다운로드"}</Btn>
          </div>
          {(zipping || zipProgress) && (
            <GenProgressBar
              progress={zipProgress || { percent: 2, label: "ZIP 생성 준비 중…" }}
              subText="산출물별 템플릿 조회·문서 생성 후 ZIP으로 압축합니다. 건수가 많으면 시간이 걸릴 수 있습니다." />
          )}
          {zipError && <div style={{ color:T.red, fontSize:12, padding:10, background:T.red+"11", borderRadius:9 }}>{zipError}</div>}
          <div style={{ display:"flex", gap:10 }}>
            {[{label:"전체",value:project.deliverables.summary?.totalDocs||0,color:T.accent},{label:"필수(M)",value:project.deliverables.summary?.mandatoryCount||0,color:T.red},{label:"선택(O)",value:(project.deliverables.summary?.totalDocs||0)-(project.deliverables.summary?.mandatoryCount||0),color:T.amber}].map(s=>(
              <Card key={s.label} style={{ flex:1, padding:"12px 14px", textAlign:"center" }}><div style={{ fontSize:10, color:T.muted, marginBottom:3 }}>{s.label}</div><div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div></Card>
            ))}
          </div>
          {project.deliverables.summary?.recon && (() => { const r = project.deliverables.summary.recon; const tt = project.deliverables.summary?.totalDocs||0; return (
            <div style={{ fontSize:10.5, color:T.muted, padding:"7px 10px", background:T.surface, border:`1px dashed ${T.border}`, borderRadius:8, lineHeight:1.7 }}>
              ℹ <b style={{ color:T.text }}>WBS 개수 대사</b> — 최하위 Task {r.leafTotal}건 중 산출물 지정 <b style={{ color:T.text }}>{r.leafWithDeliv}건</b> 전부 1:1 반영
              {r.leafTotal - r.leafWithDeliv > 0 && <> (미지정 {r.leafTotal - r.leafWithDeliv}건 제외)</>}
              {r.pdpInjected && <> + 테일러링결과서 <b style={{ color:T.text }}>1건</b>(필수 자동추가)</>}
              {" "}= 전체 <b style={{ color:T.accent }}>{tt}건</b>
              {r.dupIncluded > 0 && <span style={{ color:T.muted }}> · 동일 산출물명 {r.dupIncluded}건 포함(WBS 번호로 구분)</span>}
            </div>
          ); })()}
          {project.deliverables.categories?.map(cat=>(
            <Card key={cat.id} style={{ padding:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}><span style={{ fontSize:18 }}>{cat.icon}</span><span style={{ fontWeight:700, fontSize:14 }}>{cat.name}</span><span style={{ fontSize:11, color:T.muted, marginLeft:"auto" }}>{cat.documents?.length}건</span></div>
              {cat.documents?.map(doc=>(
                <div key={doc.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 0", borderTop:`1px solid ${T.border}` }}>
                  {doc.wbsNo && <span style={{ fontFamily:"monospace", fontSize:9, color:T.muted, border:`1px solid ${T.border}`, padding:"2px 5px", borderRadius:4, flexShrink:0, marginTop:2 }}>{doc.wbsNo}</span>}
                  <span style={{ fontFamily:"monospace", fontSize:9, color:T.accent, background:T.accentDim, padding:"2px 5px", borderRadius:4, flexShrink:0, marginTop:2 }}>{doc.code}</span>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{doc.name}</div><div style={{ fontSize:10, color:T.muted }}>{doc.taskName ? `${doc.taskName} — ` : ""}{doc.purpose}</div></div>
                  <Badge color={prioInfo(doc.priority).color}>{prioInfo(doc.priority).label}</Badge>
                  <button onClick={()=>downloadSingleDeliverable(doc, cat.name, project, project.wbs, pdpCtx)} title="이 산출물만 다운로드"
                    style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.accent, cursor:"pointer", fontSize:11, padding:"3px 8px", flexShrink:0, fontFamily:"inherit" }}>⬇</button>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const OSSP_ASSET_CATEGORIES = [
  "개요서","절차서","산출물템플릿","기법",
  "체크리스트","테일러링가이드","산출물흐름도","교육교재",
];

// 평평한 파일 목록(file_name에 "폴더/하위/파일.ext" 경로 포함 가능)을
// 폴더 트리 구조로 변환한다.
function buildFileTree(files) {
  const root = { folders: {}, files: [] };
  for (const f of files) {
    const parts = String(f.file_name || "").split("/");
    const fileName = parts.pop();           // 마지막은 실제 파일명
    let node = root;
    for (const part of parts) {             // 중간 경로는 폴더
      if (!part) continue;
      node.folders[part] = node.folders[part] || { folders: {}, files: [] };
      node = node.folders[part];
    }
    node.files.push({ ...f, _displayName: fileName });
  }
  return root;
}

// 폴더 트리를 접고 펴며 렌더링. 폴더 경로별 펼침 상태는 상위에서 관리.
function FileTree({ node, depth, openMap, toggle, onDownload, onRemove, selected, onToggleSelect, onBulkSelect, pathKey="" }) {
  const folderNames = Object.keys(node.folders).sort((a,b)=>a.localeCompare(b,'ko'));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {folderNames.map(name => {
        const childPath = pathKey ? `${pathKey}/${name}` : name;
        const isOpen = openMap[childPath] !== false;  // 기본 펼침
        const child = node.folders[name];
        const count = countFiles(child);
        const ids = collectFileIds(child);
        const allChecked = ids.length > 0 && ids.every(id => selected[id]);
        const someChecked = ids.some(id => selected[id]) && !allChecked;
        return (
          <div key={childPath}>
            <div style={{ display:"flex", alignItems:"center", gap:4,
                paddingLeft: depth*12, fontSize:11, color:T.text, fontWeight:600 }}>
              <input type="checkbox" checked={allChecked}
                ref={el=>{ if(el) el.indeterminate = someChecked; }}
                onChange={e=>onBulkSelect(ids, e.target.checked)}
                onClick={e=>e.stopPropagation()}
                style={{ cursor:"pointer", width:13, height:13, flexShrink:0 }} />
              <span onClick={()=>toggle(childPath)} style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer", overflow:"hidden" }}>
                <span style={{ color:T.muted, fontSize:9 }}>{isOpen ? "▼" : "▶"}</span>
                <span style={{ color:T.amber }}>📁</span>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
                <span style={{ color:T.muted, fontWeight:400, fontSize:9 }}>({count})</span>
              </span>
            </div>
            {isOpen && (
              <FileTree node={child} depth={depth+1} openMap={openMap} toggle={toggle}
                onDownload={onDownload} onRemove={onRemove}
                selected={selected} onToggleSelect={onToggleSelect} onBulkSelect={onBulkSelect}
                pathKey={childPath} />
            )}
          </div>
        );
      })}
      {node.files.map(f => (
        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:6, paddingLeft: depth*12 + 14 }}>
          <input type="checkbox" checked={!!selected[f.id]}
            onChange={()=>onToggleSelect(f.id)}
            style={{ cursor:"pointer", width:13, height:13, flexShrink:0 }} />
          <span onClick={()=>onDownload(f)} title={f.file_name}
            style={{ fontSize:11, color:T.accent, cursor:"pointer", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
            {f._displayName}
          </span>
          <span onClick={()=>onRemove(f)} style={{ fontSize:11, color:T.red, cursor:"pointer", flexShrink:0 }}>×</span>
        </div>
      ))}
    </div>
  );
}

function countFiles(node) {
  let n = node.files.length;
  for (const k of Object.keys(node.folders)) n += countFiles(node.folders[k]);
  return n;
}

// 한 폴더(노드) 하위의 모든 파일 id를 수집 (폴더 일괄 선택용)
function collectFileIds(node) {
  let ids = node.files.map(f => f.id);
  for (const k of Object.keys(node.folders)) ids = ids.concat(collectFileIds(node.folders[k]));
  return ids;
}

// 드롭된 항목(파일/폴더)을 재귀적으로 읽어 File 배열로 변환.
// 폴더 내부 파일에는 상대경로를 _relPath로 기록한다.
function readEntry(entry, path = "") {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file) => {
          try { file._relPath = path + file.name; } catch (_) {}
          resolve([file]);
        },
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (!entries.length) {
            const nested = await Promise.all(
              all.map((e) => readEntry(e, path + entry.name + "/"))
            );
            resolve(nested.flat());
          } else {
            all.push(...entries);
            readBatch();   // 폴더에 항목이 많으면 여러 번 호출해야 함
          }
        }, () => resolve([]));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

// DataTransfer에서 파일+폴더를 모두 수집
async function collectDroppedFiles(dataTransfer) {
  const items = dataTransfer.items;
  // webkitGetAsEntry 지원 시 폴더까지 재귀 수집
  if (items && items.length && items[0].webkitGetAsEntry) {
    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    const groups = await Promise.all(entries.map((e) => readEntry(e)));
    return groups.flat();
  }
  // 미지원 브라우저: 평면 파일 목록만
  return Array.from(dataTransfer.files || []);
}

// 한 OSSP의 8가지 자산 파일 관리 패널
// 기본 제공 방법론의 단계별 표준 산출물 목록 (읽기 전용 프리셋)
function BuiltinDeliverables({ label }) {
  const groups = BUILTIN_DELIVERABLES[label];
  if (!groups) return null;
  const total = Object.values(groups).reduce((n, arr) => n + arr.length, 0);
  return (
    <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
      <div style={{ fontSize:12, fontWeight:700, color:T.muted, marginBottom:10 }}>
        기본 산출물 <span style={{ fontWeight:400 }}>({total}종 · 표준 제공)</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {Object.entries(groups).map(([phase, items]) => (
          <div key={phase} style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:6 }}>{phase}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {items.map(d => (
                <span key={d} style={{ fontSize:11, padding:"3px 8px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, color:T.text }}>{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OSSPAssets({ osspId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);   // 업로드 중인 category
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState(null);
  const [dragCat, setDragCat] = useState(null);  // 드래그 오버 중인 category
  const [openMap, setOpenMap] = useState({});    // 폴더 경로별 펼침 상태
  const [selected, setSelected] = useState({});  // 선택된 파일 id 맵 (다중 삭제용)
  const toggleFolder = (path) => setOpenMap(m => ({ ...m, [path]: m[path] === false ? true : false }));

  async function onDrop(category, e) {
    e.preventDefault();
    setDragCat(null);
    if (busy) return;
    try {
      const collected = await collectDroppedFiles(e.dataTransfer);
      if (collected.length === 0) { setErr("올릴 파일을 찾지 못했습니다."); return; }
      await uploadMany(category, collected);
    } catch (ex) {
      setErr(ex.message || "드롭 처리 실패");
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ossp-files?ossp_id=${osspId}`);
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [osspId]);

  // 여러 파일을 순차 업로드 (폴더 업로드 포함)
  // 직접 업로드 방식: 서명 URL 발급 → Supabase Storage로 직접 PUT → 메타데이터 commit.
  // 파일 바이너리가 Vercel 함수를 거치지 않으므로 4.5MB 한도(413)를 우회한다.
  async function uploadMany(category, fileList) {
    const arr = Array.from(fileList || []).filter(f => f && f.size >= 0);
    if (arr.length === 0) return;
    setBusy(category); setErr(null);
    setProgress({ done: 0, total: arr.length });
    const failed = [];
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        // 상대경로 보존: + 폴더 버튼(webkitRelativePath) 또는 드롭(_relPath)
        const rel = (file._relPath && file._relPath !== file.name)
          ? file._relPath
          : (file.webkitRelativePath && file.webkitRelativePath !== file.name
              ? file.webkitRelativePath : file.name);

        // 1) 서명된 업로드 URL 발급
        const signRes = await fetch("/api/ossp-files", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sign-upload", ossp_id: osspId, category, file_name: rel }),
        });
        if (!signRes.ok) {
          const e = await signRes.json().catch(()=>({}));
          throw new Error(e.error || "업로드 URL 발급 실패");
        }
        const { storage_path, upload_url } = await signRes.json();

        // 2) Supabase Storage로 파일 직접 PUT (Vercel 함수 우회)
        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          const t = await putRes.text().catch(()=> "");
          throw new Error(`Storage 업로드 실패 (${putRes.status}) ${t.slice(0,120)}`);
        }

        // 3) 메타데이터 기록
        const commitRes = await fetch("/api/ossp-files", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit", ossp_id: osspId, category,
            file_name: rel, storage_path, file_type: file.type, file_size: file.size,
          }),
        });
        if (!commitRes.ok) {
          const e = await commitRes.json().catch(()=>({}));
          throw new Error(e.error || "메타데이터 저장 실패");
        }
      } catch (e) {
        failed.push(`${file.name}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: arr.length });
    }
    if (failed.length) setErr(`${failed.length}개 실패 — ${failed.slice(0,3).join(" / ")}${failed.length>3?" …":""}`);
    await load();
    setBusy(null);
    setProgress({ done: 0, total: 0 });
  }

  async function download(f) {
    try {
      const res = await fetch(`/api/ossp-files?path=${encodeURIComponent(f.file_url)}&name=${encodeURIComponent(f.file_name)}`);
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else setErr("다운로드 링크 발급 실패");
    } catch (e) { setErr(e.message); }
  }

  async function removeFile(f) {
    if (!confirm(`'${f.file_name}'을(를) 삭제할까요?`)) return;
    try {
      await fetch(`/api/ossp-files?id=${f.id}&path=${encodeURIComponent(f.file_url)}`, { method: "DELETE" });
      await load();
    } catch (e) { setErr(e.message); }
  }

  // 선택된 여러 파일을 한 번에 삭제
  async function removeMany(fileList) {
    const arr = (fileList || []).filter(Boolean);
    if (arr.length === 0) return;
    if (!confirm(`선택한 ${arr.length}개 파일을 삭제할까요?`)) return;
    setErr(null);
    const failed = [];
    for (const f of arr) {
      try {
        await fetch(`/api/ossp-files?id=${f.id}&path=${encodeURIComponent(f.file_url)}`, { method: "DELETE" });
      } catch (e) { failed.push(`${f.file_name}: ${e.message}`); }
    }
    if (failed.length) setErr(`${failed.length}개 삭제 실패 — ${failed.slice(0,3).join(" / ")}${failed.length>3?" …":""}`);
    setSelected({});
    await load();
  }

  // 선택 토글
  const toggleSelect = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  // 특정 파일 묶음을 한꺼번에 선택/해제 (폴더 체크박스용)
  const setSelectBulk = (ids, value) =>
    setSelected(s => { const n = { ...s }; ids.forEach(id => { n[id] = value; }); return n; });

  const byCat = {};
  files.forEach(f => { (byCat[f.category] = byCat[f.category] || []).push(f); });

  const selectedFiles = files.filter(f => selected[f.id]);

  return (
    <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color:T.muted }}>표준 프로세스 자산 (8종)</div>
        {selectedFiles.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:T.accent, fontWeight:600 }}>{selectedFiles.length}개 선택됨</span>
            <Btn variant="ghost" onClick={()=>setSelected({})} style={{ fontSize:11, padding:"4px 10px" }}>선택 해제</Btn>
            <Btn variant="danger" onClick={()=>removeMany(selectedFiles)} style={{ fontSize:11, padding:"4px 10px" }}>선택 삭제</Btn>
          </div>
        )}
      </div>
      {err && <div style={{ color:T.red, fontSize:11, marginBottom:8 }}>{err}</div>}
      {loading ? <Spinner text="자산 불러오는 중…" /> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {OSSP_ASSET_CATEGORIES.map(cat => (
            <div key={cat}
              onDragOver={e=>{ e.preventDefault(); if(!busy) setDragCat(cat); }}
              onDragLeave={e=>{ e.preventDefault(); setDragCat(c=>c===cat?null:c); }}
              onDrop={e=>onDrop(cat, e)}
              style={{
                background: dragCat===cat ? T.accentGlow : T.bg,
                border:`1px ${dragCat===cat ? "dashed" : "solid"} ${dragCat===cat ? T.accent : T.border}`,
                borderRadius:8, padding:"10px 12px", transition:"all .15s",
              }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                {busy===cat ? (
                  <span style={{ fontSize:10, color:T.accent, fontWeight:600 }}>
                    업로드 중… {progress.done}/{progress.total}
                  </span>
                ) : (
                  <span style={{ display:"flex", gap:8 }}>
                    <label style={{ fontSize:10, color:T.accent, cursor:"pointer", fontWeight:600 }}>
                      + 파일
                      <input type="file" multiple style={{ display:"none" }} disabled={!!busy}
                        onChange={e=>{ uploadMany(cat, e.target.files); e.target.value=""; }} />
                    </label>
                    <label style={{ fontSize:10, color:T.muted, cursor:"pointer", fontWeight:600 }}>
                      + 폴더
                      <input type="file" multiple style={{ display:"none" }} disabled={!!busy}
                        ref={el=>{ if(el){ el.webkitdirectory=true; el.directory=true; } }}
                        onChange={e=>{ uploadMany(cat, e.target.files); e.target.value=""; }} />
                    </label>
                  </span>
                )}
              </div>
              {dragCat===cat ? (
                <div style={{ fontSize:11, color:T.accent, fontWeight:600, padding:"6px 0" }}>여기에 놓으면 업로드됩니다</div>
              ) : (byCat[cat]||[]).length === 0 ? (
                <div style={{ fontSize:10, color:T.muted }}>등록된 파일 없음 · 파일·폴더를 끌어다 놓으세요</div>
              ) : (
                <FileTree
                  node={buildFileTree(byCat[cat]||[])}
                  depth={0}
                  openMap={openMap}
                  toggle={toggleFolder}
                  onDownload={download}
                  onRemove={removeFile}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onBulkSelect={setSelectBulk}
                  pathKey={cat}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 규제 / Best Practice 공용 파일 라이브러리 (kind로 구분)
// OSSP 자산 관리와 동일한 직접 업로드·폴더 트리·다중삭제 로직을 재사용.
function LibraryPage({ nav, kind, title, subtitle, categories }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);          // 업로드 중인 category
  const [progress, setProgress] = useState({ done:0, total:0 });
  const [err, setErr] = useState(null);
  const [dragCat, setDragCat] = useState(null);
  const [openMap, setOpenMap] = useState({});
  const [selected, setSelected] = useState({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/library-files?kind=${kind}`);
      setFiles(await res.json());
    } catch(e){ setErr(e.message); }
    setLoading(false);
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, [kind]);

  async function uploadMany(category, fileList) {
    const arr = Array.from(fileList || []).filter(f => f && f.size >= 0);
    if (arr.length === 0) return;
    setBusy(category); setErr(null);
    setProgress({ done:0, total:arr.length });
    const failed = [];
    for (let i=0;i<arr.length;i++){
      const file = arr[i];
      try {
        const rel = (file._relPath && file._relPath !== file.name)
          ? file._relPath
          : (file.webkitRelativePath && file.webkitRelativePath !== file.name ? file.webkitRelativePath : file.name);
        const signRes = await fetch("/api/library-files", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ action:"sign-upload", kind, category, file_name:rel }),
        });
        if (!signRes.ok){ const e=await signRes.json().catch(()=>({})); throw new Error(e.error||"업로드 URL 발급 실패"); }
        const { storage_path, upload_url } = await signRes.json();
        const putRes = await fetch(upload_url, { method:"PUT", headers:{ "Content-Type":file.type||"application/octet-stream" }, body:file });
        if (!putRes.ok){ const t=await putRes.text().catch(()=>""); throw new Error(`Storage 업로드 실패 (${putRes.status}) ${t.slice(0,120)}`); }
        const commitRes = await fetch("/api/library-files", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ action:"commit", kind, category, file_name:rel, storage_path, file_type:file.type, file_size:file.size }),
        });
        if (!commitRes.ok){ const e=await commitRes.json().catch(()=>({})); throw new Error(e.error||"메타데이터 저장 실패"); }
      } catch(e){ failed.push(`${file.name}: ${e.message}`); }
      setProgress({ done:i+1, total:arr.length });
    }
    if (failed.length) setErr(`${failed.length}개 실패 — ${failed.slice(0,3).join(" / ")}${failed.length>3?" …":""}`);
    await load(); setBusy(null); setProgress({ done:0, total:0 });
  }

  async function onDrop(category, e){
    e.preventDefault(); setDragCat(null);
    if (busy) return;
    const collected = await collectDroppedFiles(e.dataTransfer);
    if (collected.length) uploadMany(category, collected);
  }

  async function download(f){
    try {
      const res = await fetch(`/api/library-files?path=${encodeURIComponent(f.file_url)}&name=${encodeURIComponent(f.file_name.split("/").pop())}`);
      const { url } = await res.json();
      if (url) window.open(url, "_blank");
    } catch(e){ setErr(e.message); }
  }

  async function removeFile(f){
    if (!confirm(`'${f.file_name}'을(를) 삭제할까요?`)) return;
    try { await fetch(`/api/library-files?id=${f.id}&path=${encodeURIComponent(f.file_url)}`, { method:"DELETE" }); await load(); }
    catch(e){ setErr(e.message); }
  }

  async function removeMany(fileList){
    const arr = (fileList||[]).filter(Boolean);
    if (arr.length===0) return;
    if (!confirm(`선택한 ${arr.length}개 파일을 삭제할까요?`)) return;
    setErr(null); const failed=[];
    for (const f of arr){
      try { await fetch(`/api/library-files?id=${f.id}&path=${encodeURIComponent(f.file_url)}`, { method:"DELETE" }); }
      catch(e){ failed.push(`${f.file_name}: ${e.message}`); }
    }
    if (failed.length) setErr(`${failed.length}개 삭제 실패`);
    setSelected({}); await load();
  }

  const toggleFolder = (p) => setOpenMap(m=>({ ...m, [p]: m[p]===false ? true : false }));
  const toggleSelect = (id) => setSelected(s=>({ ...s, [id]: !s[id] }));
  const setSelectBulk = (ids,v) => setSelected(s=>{ const n={...s}; ids.forEach(id=>{n[id]=v;}); return n; });

  const byCat = {};
  files.forEach(f => { (byCat[f.category] = byCat[f.category] || []).push(f); });
  const selectedFiles = files.filter(f => selected[f.id]);

  return (
    <div style={{ padding:"16px", maxWidth:1100, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={()=>nav("dashboard")} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:20 }}>←</button>
        <div style={{ flex:1 }}><h1 style={{ fontSize:17, fontWeight:700 }}>{title}</h1><p style={{ fontSize:11, color:T.muted }}>{subtitle}</p></div>
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color:T.muted }}>카테고리 ({categories.length})</div>
        {selectedFiles.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:T.accent, fontWeight:600 }}>{selectedFiles.length}개 선택됨</span>
            <Btn variant="ghost" onClick={()=>setSelected({})} style={{ fontSize:11, padding:"4px 10px" }}>선택 해제</Btn>
            <Btn variant="danger" onClick={()=>removeMany(selectedFiles)} style={{ fontSize:11, padding:"4px 10px" }}>선택 삭제</Btn>
          </div>
        )}
      </div>
      {err && <div style={{ color:T.red, fontSize:11, marginBottom:8 }}>{err}</div>}

      {loading ? <Spinner text="라이브러리 불러오는 중…" /> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {categories.map(cat=>(
            <div key={cat}
              onDragOver={e=>{ e.preventDefault(); if(!busy) setDragCat(cat); }}
              onDragLeave={e=>{ e.preventDefault(); setDragCat(c=>c===cat?null:c); }}
              onDrop={e=>onDrop(cat, e)}
              style={{ background: dragCat===cat ? T.accentGlow : T.bg,
                border:`1px ${dragCat===cat?"dashed":"solid"} ${dragCat===cat?T.accent:T.border}`,
                borderRadius:8, padding:"10px 12px", transition:"all .15s" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                {busy===cat ? (
                  <span style={{ fontSize:10, color:T.accent, fontWeight:600 }}>업로드 중… {progress.done}/{progress.total}</span>
                ) : (
                  <span style={{ display:"flex", gap:8 }}>
                    <label style={{ fontSize:10, color:T.accent, cursor:"pointer", fontWeight:600 }}>+ 파일
                      <input type="file" multiple style={{ display:"none" }} disabled={!!busy}
                        onChange={e=>{ uploadMany(cat, e.target.files); e.target.value=""; }} />
                    </label>
                    <label style={{ fontSize:10, color:T.muted, cursor:"pointer", fontWeight:600 }}>+ 폴더
                      <input type="file" multiple style={{ display:"none" }} disabled={!!busy}
                        ref={el=>{ if(el){ el.webkitdirectory=true; el.directory=true; } }}
                        onChange={e=>{ uploadMany(cat, e.target.files); e.target.value=""; }} />
                    </label>
                  </span>
                )}
              </div>
              {dragCat===cat ? (
                <div style={{ fontSize:11, color:T.accent, fontWeight:600, padding:"6px 0" }}>여기에 놓으면 업로드됩니다</div>
              ) : (byCat[cat]||[]).length === 0 ? (
                <div style={{ fontSize:10, color:T.muted }}>등록된 파일 없음 · 파일·폴더를 끌어다 놓으세요</div>
              ) : (
                <FileTree node={buildFileTree(byCat[cat]||[])} depth={0} openMap={openMap} toggle={toggleFolder}
                  onDownload={download} onRemove={removeFile}
                  selected={selected} onToggleSelect={toggleSelect} onBulkSelect={setSelectBulk} pathKey={cat} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OSSPPage({ nav, customOSSP=[], builtinOSSP=[], onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [version, setVersion] = useState("");
  const [desc, setDesc] = useState("");
  const [phaseText, setPhaseText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);  // 펼쳐진 OSSP id

  function reset() { setLabel(""); setVersion(""); setDesc(""); setPhaseText(""); setError(null); }

  async function submit() {
    const phases = phaseText.split(",").map(s=>s.trim()).filter(Boolean);
    if (!label.trim()) { setError("이름을 입력하세요."); return; }
    if (phases.length === 0) { setError("단계를 1개 이상 입력하세요. (쉼표로 구분)"); return; }
    setSaving(true); setError(null);
    try {
      await onAdd({ name: label.trim(), version: version.trim(), description: desc.trim(), phases });
      reset(); setShowForm(false);
    } catch(e) { setError(e.message); }
    setSaving(false);
  }

  const renderCard = (o, kind) => {          // kind: "custom" | "builtin"
    const deletable = kind === "custom";
    const isOpen = expanded === o.id;
    const hasDbId = kind === "custom" || o.builtin === true;  // DB UUID 보유 → 파일 업로드 가능
    return (
      <Card key={o.id} style={{ padding:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:16, fontWeight:700 }}>{o.label}</span>
              {o.version && <Badge color={T.accent}>{o.version}</Badge>}
              {deletable ? <Badge color={T.green}>사내</Badge> : <Badge color={T.muted}>기본</Badge>}
            </div>
            <div style={{ fontSize:12, color:T.muted }}>{o.desc}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="outline" onClick={()=>setExpanded(isOpen ? null : o.id)} style={{ fontSize:11, padding:"5px 10px" }}>
              {isOpen ? "자산 닫기" : "자산 관리"}
            </Btn>
            <Btn variant="outline" onClick={()=>nav("new_project")} style={{ fontSize:11, padding:"5px 10px" }}>시작</Btn>
            {deletable && (
              <Btn variant="outline" onClick={()=>{ if(confirm(`'${o.label}'을(를) 삭제할까요? 등록된 파일도 함께 삭제됩니다.`)) onDelete(o.id); }} style={{ fontSize:11, padding:"5px 10px", color:T.red, borderColor:T.red+"55" }}>삭제</Btn>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {o.phases.map((ph,i)=>(
            <div key={ph+i} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ padding:"4px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, fontSize:11 }}><span style={{ color:T.accent, marginRight:4 }}>{i+1}.</span>{ph}</div>
              {i<o.phases.length-1 && <span style={{ color:T.border, fontSize:10 }}>→</span>}
            </div>
          ))}
        </div>
        {isOpen && (
          <>
            {kind === "builtin" && <BuiltinDeliverables label={o.label} />}
            {hasDbId
              ? <OSSPAssets osspId={o.id} />
              : <div style={{ marginTop:12, fontSize:11, color:T.muted }}>※ 파일 업로드 준비 중입니다. 페이지를 새로고침하면 기본 방법론이 서버에 자동 등록됩니다.</div>}
          </>
        )}
      </Card>
    );
  };

  return (
    <div style={{ padding:"16px", maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={()=>nav("dashboard")} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:20 }}>←</button>
        <div style={{ flex:1 }}><h1 style={{ fontSize:17, fontWeight:700 }}>OSSP 라이브러리</h1><p style={{ fontSize:11, color:T.muted }}>조직 표준 프로세스 및 자산 구성</p></div>
        <Btn variant="primary" onClick={()=>{ setShowForm(v=>!v); reset(); }} style={{ fontSize:12, padding:"7px 14px" }}>{showForm ? "취소" : "+ OSSP 등록"}</Btn>
      </div>

      {showForm && (
        <Card style={{ padding:18, marginBottom:18, border:`1px solid ${T.accent}55` }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>회사 OSSP 등록</div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Input label="이름" value={label} onChange={setLabel} placeholder="예: 정보공학 기반 SI 개발 방법론" />
            <Input label="버전" value={version} onChange={setVersion} placeholder="예: V1.0" />
            <Input label="설명" value={desc} onChange={setDesc} placeholder="예: 검증 중심 단계별 개발" />
            <Input label="단계 (쉼표로 구분)" value={phaseText} onChange={setPhaseText} placeholder="요구분석, 설계, 구현, 단위테스트, 통합테스트, 인수" />
            {phaseText.trim() && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {phaseText.split(",").map(s=>s.trim()).filter(Boolean).map((ph,i)=><Badge key={i}>{i+1}. {ph}</Badge>)}
              </div>
            )}
            <div style={{ fontSize:11, color:T.muted }}>※ 등록 후 카드의 '자산 관리'에서 개요서·절차서·템플릿 등 8종 파일을 올릴 수 있습니다.</div>
            {error && <div style={{ color:T.red, fontSize:12 }}>{error}</div>}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="primary" onClick={submit} disabled={saving} style={{ fontSize:12, padding:"8px 16px" }}>{saving ? "저장 중…" : "저장"}</Btn>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {customOSSP.length > 0 && (
          <>
            <div style={{ fontSize:12, fontWeight:600, color:T.muted, marginTop:4 }}>회사 등록 OSSP</div>
            {customOSSP.map(o=>renderCard(o, "custom"))}
          </>
        )}
        <div style={{ fontSize:12, fontWeight:600, color:T.muted, marginTop:8 }}>기본 제공</div>
        {(builtinOSSP.length > 0 ? builtinOSSP : OSSP_OPTIONS).map(o=>renderCard(o, "builtin"))}
      </div>
    </div>
  );
}

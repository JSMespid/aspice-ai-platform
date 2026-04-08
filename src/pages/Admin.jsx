import { useState, useEffect } from "react";
import { T, GLOBAL_CSS, Card, Btn, Badge, Input, Spinner, StatusBadge, SeverityBadge } from "../components/ui.jsx";

const PROCESSES = ["SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5"];
const PROC_COLORS = { "SYS.1": T.accent, "SYS.2": T.purple, "SYS.3": T.teal, "SYS.4": T.amber, "SYS.5": T.green };

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password }) });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem("admin_token", data.token);
      onLogin(data.token);
    } catch { setError("로그인 중 오류가 발생했습니다."); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <Card style={{ padding: 40, width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: `linear-gradient(135deg,${T.accent},${T.purple})`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 auto 14px" }}>A</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>ASPICE AI 관리자</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>관리자 계정으로 로그인하세요</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input label="이메일" value={email} onChange={setEmail} placeholder="admin@example.com" type="email" />
          <Input label="비밀번호" value={password} onChange={setPassword} placeholder="비밀번호 입력" type="password" />
          {error && <div style={{ color: T.red, fontSize: 12, padding: "8px 12px", background: T.redDim, borderRadius: 8 }}>{error}</div>}
          <Btn onClick={handleLogin} disabled={loading || !email || !password} style={{ padding: "11px 0", width: "100%", marginTop: 4, justifyContent: "center" }}>
            {loading ? "로그인 중..." : "로그인"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [wps, setWps] = useState([]);
  const [stats, setStats] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedWP, setSelectedWP] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) {
      fetch("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", token: t }) })
        .then(r => r.json()).then(d => { if (!d.error) setToken(t); setLoading(false); }).catch(() => setLoading(false));
    } else setLoading(false);
  }, []);

  useEffect(() => { if (token) { fetchData(); } }, [token]);

  async function fetchData() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(d => ({ ...d, content: typeof d.content === "string" ? JSON.parse(d.content || "{}") : d.content || {}, qa_result: d.qa_result ? (typeof d.qa_result === "string" ? JSON.parse(d.qa_result) : d.qa_result) : null })) : [];
      setWps(list);
      setStats({
        total: list.length,
        approved: list.filter(w => w.status === "승인됨").length,
        pending: list.filter(w => w.status === "검토중").length,
        withQA: list.filter(w => w.qa_result).length,
        byProcess: PROCESSES.reduce((a, p) => ({ ...a, [p]: list.filter(w => w.process_id === p).length }), {}),
      });
    } catch { }
  }

  function logout() { localStorage.removeItem("admin_token"); setToken(null); }

  if (loading) return <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}>로딩 중…</div>;
  if (!token) return <AdminLogin onLogin={setToken} />;

  const navItems = [
    { id: "dashboard", label: "대시보드", icon: "⊞" },
    { id: "all_wps", label: "전체 산출물", icon: "◈" },
    { id: "qa_overview", label: "QA 현황", icon: "🔍" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: T.bg, color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* 모바일 헤더 */}
      <div className="mob-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: T.surface, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, background: `linear-gradient(135deg,${T.accent},${T.purple})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>A</div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>관리자</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer" }}>{menuOpen ? "✕" : "☰"}</button>
      </div>
      {menuOpen && (
        <div className="mob-menu" style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "8px 12px", zIndex: 99 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setPage(item.id); setMenuOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%", background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: "none", cursor: "pointer", fontSize: 14, fontWeight: page === item.id ? 600 : 400, marginBottom: 4, fontFamily: "inherit" }}>
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
          <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%", background: "transparent", color: T.red, border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit", marginTop: 4 }}>로그아웃</button>
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        {/* PC 사이드바 */}
        <aside className="sidebar" style={{ display: "none", width: 220, background: T.surface, borderRight: `1px solid ${T.border}`, flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
          <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, background: `linear-gradient(135deg,${T.accent},${T.purple})`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>A</div>
              <div><div style={{ fontSize: 14, fontWeight: 700 }}>ASPICE 관리자</div><div style={{ fontSize: 10, color: T.muted }}>Admin Dashboard</div></div>
            </div>
          </div>
          <nav style={{ padding: "14px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: page === item.id ? `1px solid ${T.accentDim}` : "1px solid transparent", cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 600 : 400, fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all .15s" }}>
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={logout} style={{ fontSize: 12, color: T.red, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>로그아웃</button>
          </div>
        </aside>

        <main className="main-pad" style={{ flex: 1, overflow: "auto", padding: "20px 16px" }}>
          {page === "dashboard" && <AdminDashboard stats={stats} wps={wps} onRefresh={fetchData} />}
          {page === "all_wps" && <AllWorkProducts wps={wps} onUpdate={fetchData} />}
          {page === "qa_overview" && <QAOverview wps={wps} />}
        </main>
      </div>
    </div>
  );
}

function AdminDashboard({ stats, wps, onRefresh }) {
  if (!stats) return <Spinner text="데이터 로딩 중…" />;
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>관리자 대시보드</h1><p style={{ color: T.muted, fontSize: 13 }}>ASPICE AI 플랫폼 전체 현황</p></div>
        <Btn variant="ghost" size="sm" onClick={onRefresh}>↻ 새로고침</Btn>
      </div>

      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "전체 산출물", value: stats.total, color: T.accent },
          { label: "승인됨", value: stats.approved, color: T.green },
          { label: "검토중", value: stats.pending, color: T.amber },
          { label: "QA 완료", value: stats.withQA, color: T.purple },
        ].map(s => (
          <Card key={s.label} style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>프로세스별 현황</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PROCESSES.map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 60, fontSize: 12, fontWeight: 600, color: PROC_COLORS[p] }}>{p}</div>
              <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", background: PROC_COLORS[p], borderRadius: 4, width: stats.byProcess[p] > 0 ? "100%" : "0%", transition: "width .5s" }} />
              </div>
              <div style={{ width: 40, fontSize: 12, color: T.muted, textAlign: "right" }}>{stats.byProcess[p]}건</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>최근 산출물 (10건)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {wps.slice(0, 10).map(wp => (
            <div key={wp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{wp.title || wp.process_id}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge color={PROC_COLORS[wp.process_id] || T.accent}>{wp.process_id}</Badge>
                  <span style={{ fontSize: 11, color: T.muted }}>{wp.project_name}</span>
                </div>
              </div>
              <StatusBadge status={wp.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AllWorkProducts({ wps, onUpdate }) {
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");

  const filtered = wps.filter(w =>
    (filter === "전체" || w.process_id === filter || w.status === filter) &&
    (w.title || "").toLowerCase().includes(search.toLowerCase())
  );

  async function updateStatus(id, status) {
    await fetch(`/api/projects?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await onUpdate();
  }

  async function deleteWP(id) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
    await onUpdate();
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>전체 산출물 관리</h1></div>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {["전체", ...PROCESSES, "승인됨", "검토중", "거부됨"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: filter === f ? T.accent : T.bg, color: filter === f ? "#fff" : T.muted, border: `1px solid ${filter === f ? T.accent : T.border}`, cursor: "pointer", transition: "all .15s" }}>
              {f}
            </button>
          ))}
        </div>
        <Input label="" value={search} onChange={setSearch} placeholder="산출물명 검색…" />
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: T.muted, fontSize: 13 }}>검색 결과 없음</div> :
          filtered.map(wp => (
            <Card key={wp.id} style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{wp.title || wp.process_id}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge color={PROC_COLORS[wp.process_id] || T.accent}>{wp.process_id}</Badge>
                    <StatusBadge status={wp.status} />
                    {wp.qa_result && <Badge color={T.purple}>QA완료(점수:{wp.qa_result.overall_score})</Badge>}
                    <span style={{ fontSize: 11, color: T.muted }}>{wp.project_name}</span>
                    <span style={{ fontSize: 11, color: T.muted }}>{wp.created_at ? new Date(wp.created_at).toLocaleDateString("ko-KR") : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {wp.status !== "승인됨" && <Btn variant="success" size="sm" onClick={() => updateStatus(wp.id, "승인됨")}>승인</Btn>}
                  {wp.status !== "거부됨" && <Btn variant="danger" size="sm" onClick={() => updateStatus(wp.id, "거부됨")}>거부</Btn>}
                  <Btn variant="ghost" size="sm" onClick={() => deleteWP(wp.id)} style={{ color: T.red }}>삭제</Btn>
                </div>
              </div>
            </Card>
          ))
        }
      </div>
    </div>
  );
}

function QAOverview({ wps }) {
  const qaWPs = wps.filter(w => w.qa_result);
  const avgScore = qaWPs.length > 0 ? Math.round(qaWPs.reduce((a, w) => a + (w.qa_result.overall_score || 0), 0) / qaWPs.length) : 0;
  const allIssues = qaWPs.flatMap(w => (w.qa_result.issues || []).map(i => ({ ...i, wp_title: w.title, process: w.process_id })));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>QA 현황</h1><p style={{ color: T.muted, fontSize: 13 }}>QA Agent가 식별한 이슈 및 품질 지표</p></div>

      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "QA 완료 산출물", value: qaWPs.length, color: T.purple },
          { label: "평균 품질 점수", value: avgScore, color: avgScore >= 80 ? T.green : avgScore >= 60 ? T.amber : T.red },
          { label: "Critical 이슈", value: allIssues.filter(i => i.severity === "Critical").length, color: T.red },
          { label: "Major 이슈", value: allIssues.filter(i => i.severity === "Major").length, color: T.amber },
        ].map(s => (
          <Card key={s.label} style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {allIssues.length > 0 && (
        <Card style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>전체 이슈 목록 ({allIssues.length}건)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allIssues.map((issue, i) => (
              <div key={i} style={{ padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <SeverityBadge severity={issue.severity} />
                  <Badge color={T.muted}>{issue.category}</Badge>
                  <Badge color={PROC_COLORS[issue.process] || T.accent}>{issue.process}</Badge>
                  <span style={{ fontSize: 11, color: T.muted }}>{issue.wp_title}</span>
                </div>
                <div style={{ fontSize: 12 }}>{issue.description}</div>
                {issue.recommendation && <div style={{ fontSize: 11, color: T.teal, marginTop: 4 }}>권장: {issue.recommendation}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {qaWPs.length === 0 && (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🔍</div>
          <div style={{ color: T.muted, fontSize: 13 }}>QA가 실행된 산출물이 없습니다.</div>
        </Card>
      )}
    </div>
  );
}

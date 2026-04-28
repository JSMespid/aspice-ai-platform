// SCR-02 — 프로젝트 목록
// 화면설계서 v2.4 슬라이드 10: 단일 검색창 + 필터 칩 — 프로젝트명/제품명/조직/생성일
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

const ORGS = ["전체", "새시팀", "샤시팀", "QA팀", "전장팀", "구동팀"];
const SORT_OPTIONS = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "name", label: "이름순" },
  { value: "progress", label: "진행률순" },
];
const DATE_FILTERS = [
  { value: "all", label: "전체" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
  { value: "365", label: "최근 1년" },
];

async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

export default function ProjectListScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 검색/필터/정렬 상태
  const [queryName, setQueryName] = useState("");
  const [queryProduct, setQueryProduct] = useState("");
  const [filterOrg, setFilterOrg] = useState("전체");
  const [filterDate, setFilterDate] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // 모달
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    setLoading(true);
    setError("");
    try {
      const data = await apiCall("/api/projects?resource=projects");
      if (Array.isArray(data)) {
        setProjects(data);
      } else if (data?.error) {
        setError(typeof data.error === "string" ? data.error : "프로젝트 로드 실패");
      } else {
        setProjects([]);
      }
    } catch (e) {
      setError("네트워크 오류: " + e.message);
    }
    setLoading(false);
  }

  // 적용된 필터를 계산
  const filtered = useMemo(() => {
    let list = [...projects];

    // 프로젝트명 검색
    if (queryName.trim()) {
      const q = queryName.toLowerCase();
      list = list.filter((p) => p.name?.toLowerCase().includes(q));
    }
    // 제품명 검색 (description fallback)
    if (queryProduct.trim()) {
      const q = queryProduct.toLowerCase();
      list = list.filter((p) =>
        (p.product_name || p.description || "").toLowerCase().includes(q)
      );
    }
    // 조직 필터
    if (filterOrg !== "전체") {
      list = list.filter((p) => p.organization === filterOrg || p.org === filterOrg);
    }
    // 날짜 필터
    if (filterDate !== "all") {
      const days = parseInt(filterDate);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      list = list.filter((p) => new Date(p.created_at).getTime() > cutoff);
    }
    // 정렬
    if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === "oldest") {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === "name") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "progress") {
      list.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    }
    return list;
  }, [projects, queryName, queryProduct, filterOrg, filterDate, sortBy]);

  // 적용된 필터 칩
  const appliedFilters = [];
  if (filterOrg !== "전체") appliedFilters.push({ key: "org", label: `조직: ${filterOrg}`, clear: () => setFilterOrg("전체") });
  if (filterDate !== "all") appliedFilters.push({ key: "date", label: `최근 ${filterDate}일`, clear: () => setFilterDate("all") });

  function clearAll() {
    setQueryName(""); setQueryProduct(""); setFilterOrg("전체");
    setFilterDate("all"); setSortBy("newest");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC" }}>
      {/* 상단 헤더 */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #E5E9F0",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, background: "#1E2761", borderRadius: 7,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff",
          }}>A</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2761", letterSpacing: "-0.01em" }}>
              ASPICE AI Platform
            </div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>
              v3.0 · Anti-Hallucination Edition
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>{user?.role} · {user?.org}</div>
          </div>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            style={{
              background: "#fff", border: "1px solid #D5DCE8",
              borderRadius: 6, padding: "6px 12px",
              fontSize: 11, color: "#4B5563",
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 16px" }}>
        {/* 페이지 타이틀 */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1E2761", margin: 0 }}>
            프로젝트
          </h1>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
            단일 검색창 + 필터 칩 — 프로젝트명 / 제품명 / 조직 / 생성일
          </p>
        </div>

        {/* 검색/필터 카드 */}
        <div style={{
          background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12,
          padding: 16, marginBottom: 16, boxShadow: "0 1px 2px rgba(15, 24, 56, 0.04)",
        }}>
          {/* 1행: 두 검색창 + 검색 버튼 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 12, marginBottom: 12 }}>
            <SearchInput
              icon="🔍"
              placeholder="검색: 프로젝트명 입력 시 즉시 필터링"
              value={queryName}
              onChange={setQueryName}
            />
            <SearchInput
              icon="🔍"
              placeholder="검색: 제품명 입력 시 즉시 필터링"
              value={queryProduct}
              onChange={setQueryProduct}
            />
            <button
              onClick={fetchProjects}
              style={{
                background: "#1E2761", color: "#fff",
                border: "none", borderRadius: 6,
                fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              검 색
            </button>
          </div>

          {/* 2행: 필터들 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            paddingTop: 12, borderTop: "1px solid #F3F4F6",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A2E" }}>필터:</span>
            <FilterSelect label="조직" value={filterOrg} onChange={setFilterOrg} options={ORGS} />
            <FilterSelect label="생성일" value={filterDate} onChange={setFilterDate} options={DATE_FILTERS.map(d => d.label)} 
                          rawOptions={DATE_FILTERS} />
            <FilterSelect label="정렬" value={sortBy} onChange={setSortBy} options={SORT_OPTIONS.map(s => s.label)}
                          rawOptions={SORT_OPTIONS} />
            <div style={{ marginLeft: "auto" }}>
              <button onClick={clearAll} style={{
                background: "none", border: "none",
                fontSize: 11, color: "#1E2761",
                fontWeight: 500,
              }}>
                [ 초기화 ]
              </button>
            </div>
          </div>

          {/* 3행: 적용된 필터 칩 + 결과 수 */}
          {(appliedFilters.length > 0 || filtered.length > 0) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              paddingTop: 12, marginTop: 12, borderTop: "1px solid #F3F4F6",
            }}>
              {appliedFilters.length > 0 && (
                <span style={{ fontSize: 11, color: "#6B7280" }}>적용됨:</span>
              )}
              {appliedFilters.map((f) => (
                <FilterChip key={f.key} label={f.label} onClear={f.clear} />
              ))}
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>
                결과 {filtered.length}건
              </div>
            </div>
          )}
        </div>

        {/* 프로젝트 카드 그리드 */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchProjects} />
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setShowCreateModal(true)} hasFilters={appliedFilters.length > 0 || queryName || queryProduct} onClearFilters={clearAll} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: "#1E2761", color: "#fff",
                  border: "none", borderRadius: 6,
                  padding: "8px 16px", fontSize: 12, fontWeight: 600,
                }}
              >
                + 프로젝트 생성
              </button>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}>
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* 프로젝트 생성 모달 */}
      {showCreateModal && (
        <ProjectCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchProjects(); }}
        />
      )}
    </div>
  );
}

function SearchInput({ icon, placeholder, value, onChange }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        fontSize: 12, color: "#9CA3AF", pointerEvents: "none",
      }}>{icon}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: "8px 12px 8px 32px",
          border: `1px solid ${focus ? "#1E2761" : "#D5DCE8"}`,
          borderRadius: 6, background: "#fff", fontSize: 12, outline: "none",
          boxShadow: focus ? "0 0 0 3px rgba(30, 39, 97, 0.08)" : "none",
          transition: "all 0.15s",
        }}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, rawOptions }) {
  const opts = rawOptions || options.map(o => ({ value: o, label: o }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#6B7280" }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#fff", border: "1px solid #D5DCE8",
          borderRadius: 5, padding: "5px 8px", fontSize: 11,
          color: "#1A1A2E", cursor: "pointer", outline: "none",
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "#1E2761", color: "#fff",
      padding: "3px 4px 3px 10px", borderRadius: 12,
      fontSize: 10, fontWeight: 500,
    }}>
      {label}
      <button onClick={onClear} style={{
        background: "rgba(255,255,255,0.20)", border: "none",
        color: "#fff", width: 16, height: 16, borderRadius: "50%",
        fontSize: 10, padding: 0, lineHeight: 1,
      }}>✕</button>
    </span>
  );
}

function ProjectCard({ project, onClick }) {
  const created = project.created_at ? new Date(project.created_at).toISOString().split("T")[0] : "—";
  const progress = project.progress != null ? project.progress : (Math.random() * 80 + 10);

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12,
        padding: 16, cursor: "pointer", transition: "all 0.15s",
        borderTop: "3px solid #1E2761",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 24, 56, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2761", marginBottom: 6 }}>
        {project.name}
      </div>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
        조직: {project.organization || project.org || "—"}  ·  생성: {created}
      </div>
      {project.description && (
        <div style={{ fontSize: 11, color: "#4B5563", marginBottom: 10,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden" }}>
          {project.description}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <div style={{
          height: 4, background: "#E5E9F0", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${progress}%`, background: "#1E2761",
            transition: "width 0.3s",
          }} />
        </div>
        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
          {Math.round(progress)}% 진행
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      padding: 40, textAlign: "center", color: "#6B7280", fontSize: 13,
    }}>
      <div style={{
        width: 28, height: 28, margin: "0 auto 12px",
        border: "2px solid #E5E9F0", borderTopColor: "#1E2761",
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }} />
      프로젝트 로딩 중...
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{
      padding: 40, textAlign: "center", background: "#FEF2F2",
      border: "1px solid #FCA5A5", borderRadius: 12,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>⚠</div>
      <div style={{ fontSize: 13, color: "#991B1B", marginBottom: 12 }}>{message}</div>
      <button onClick={onRetry} style={{
        background: "#fff", border: "1px solid #FCA5A5",
        borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#991B1B",
      }}>
        다시 시도
      </button>
    </div>
  );
}

function EmptyState({ onCreate, hasFilters, onClearFilters }) {
  return (
    <div style={{
      padding: 60, textAlign: "center",
      background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12,
    }}>
      <div style={{ fontSize: 32, marginBottom: 12, color: "#D5DCE8" }}>◇</div>
      {hasFilters ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>검색 결과 없음</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 16 }}>
            다른 키워드를 시도하거나 필터를 초기화해보세요.
          </div>
          <button onClick={onClearFilters} style={{
            background: "#fff", border: "1px solid #1E2761",
            color: "#1E2761", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600,
          }}>
            [ 초기화 ]
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>프로젝트가 없습니다</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 16 }}>
            새 프로젝트를 생성해서 시작하세요.
          </div>
          <button onClick={onCreate} style={{
            background: "#1E2761", color: "#fff", border: "none",
            borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600,
          }}>
            + 프로젝트 생성
          </button>
        </>
      )}
    </div>
  );
}

// SCR-03 — 프로젝트 생성 모달
function ProjectCreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", organization: "", product_name: "", description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const nameValid = form.name.trim().length > 0 && form.name.length <= 100;
  const orgValid = form.organization.trim().length > 0;
  const canSubmit = nameValid && orgValid && !busy;

  async function handleCreate() {
    if (!canSubmit) return;
    setBusy(true); setError("");
    try {
      const result = await apiCall("/api/projects?resource=projects", "POST", {
        name: form.name.trim(),
        organization: form.organization.trim(),
        domain: form.product_name.trim() || "자동차 부품",
        description: form.description.trim(),
      });
      if (result?.error) {
        setError(typeof result.error === "string" ? result.error : "생성 실패");
      } else {
        onCreated();
      }
    } catch (e) {
      setError("네트워크 오류: " + e.message);
    }
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0,
      background: "rgba(15, 24, 56, 0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480,
        boxShadow: "0 24px 60px rgba(0,0,0,0.30)",
        overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #E5E9F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>
            새 프로젝트 생성
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 18,
            color: "#6B7280", cursor: "pointer", padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: 20 }}>
          <ModalField label="프로젝트명" required value={form.name}
                      onChange={(v) => setForm({ ...form, name: v })}
                      placeholder="예: EV Brake Control System"
                      maxLength={100} />
          <ModalField label="담당조직" required value={form.organization}
                      onChange={(v) => setForm({ ...form, organization: v })}
                      placeholder="예: 새시팀, QA팀"
                      isOrgRequired={!form.organization} />
          <ModalField label="제품명" value={form.product_name}
                      onChange={(v) => setForm({ ...form, product_name: v })}
                      placeholder="예: EV Brake Control System"
                      maxLength={100} />
          <ModalTextarea label="설명" value={form.description}
                         onChange={(v) => setForm({ ...form, description: v })}
                         placeholder="프로젝트에 대한 간단한 설명..."
                         maxLength={500} />
          {error && (
            <div style={{
              padding: "8px 10px", background: "#FEE2E2",
              border: "1px solid #FCA5A5", borderRadius: 6,
              fontSize: 11, color: "#DC2626", marginTop: 4,
            }}>{error}</div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{
          padding: "12px 20px", background: "#F7F9FC",
          borderTop: "1px solid #E5E9F0",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button onClick={onClose} style={{
            background: "#fff", border: "1px solid #D5DCE8", borderRadius: 6,
            padding: "8px 16px", fontSize: 12, color: "#4B5563",
          }}>
            취소
          </button>
          <button onClick={handleCreate} disabled={!canSubmit} style={{
            background: canSubmit ? "#1E2761" : "#9CA3AF",
            color: "#fff", border: "none", borderRadius: 6,
            padding: "8px 16px", fontSize: 12, fontWeight: 600,
          }}>
            {busy ? "생성 중..." : "생성"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, required, value, onChange, placeholder, maxLength, isOrgRequired }) {
  const [focus, setFocus] = useState(false);
  const overLimit = maxLength && value.length > maxLength;
  const orgError = isOrgRequired && label === "담당조직";
  const borderColor = overLimit ? "#DC2626" : orgError ? "#DC2626" : focus ? "#1E2761" : "#D5DCE8";
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label} {required && <span style={{ color: "#DC2626" }}>*</span>}
      </label>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: "8px 10px",
          border: `1px solid ${borderColor}`, borderRadius: 6,
          fontSize: 12, outline: "none",
          background: orgError ? "#FEF2F2" : "#fff",
          transition: "all 0.15s",
        }}
      />
      {orgError && (
        <div style={{ fontSize: 10, color: "#DC2626", marginTop: 3 }}>
          조직을 선택하세요
        </div>
      )}
      {maxLength && value.length > 0 && (
        <div style={{ fontSize: 10, color: overLimit ? "#DC2626" : "#9CA3AF", marginTop: 3, textAlign: "right" }}>
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}

function ModalTextarea({ label, value, onChange, placeholder, maxLength }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </label>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={3}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: "8px 10px",
          border: `1px solid ${focus ? "#1E2761" : "#D5DCE8"}`,
          borderRadius: 6, fontSize: 12, outline: "none", resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      {maxLength && (
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3, textAlign: "right" }}>
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}

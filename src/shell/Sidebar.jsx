// 좌측 사이드바 (240px 고정)
// 화면설계서 슬라이드 12: SYS/SWE 그룹 + 추적성/일관성/템플릿/설정
// 화면설계서 슬라이드 14: 각 프로세스별 진행률 바 (% + 색상)
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { PROCESS_GROUPS, PROCESSES, SIDEBAR_EXTRAS, calculateProgress } from "../config/processes.js";

export default function Sidebar({ workProducts = [], collapsed = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  // 현재 활성 항목 판단
  const path = location.pathname;
  const activeProcess = path.match(/\/process\/([^/]+)/)?.[1];
  const activeExtra = SIDEBAR_EXTRAS.find(x => path.endsWith("/" + x.path))?.id;

  function go(processId) {
    navigate(`/projects/${projectId}/process/${processId}`);
  }
  function goExtra(extra) {
    navigate(`/projects/${projectId}/${extra.path}`);
  }

  return (
    <aside style={{
      width: collapsed ? 56 : "var(--shell-sidebar-w)",
      background: "var(--c-navy-deep)",
      color: "#fff",
      flexShrink: 0,
      overflowY: "auto",
      transition: "width 0.2s",
      borderRight: "1px solid var(--c-navy-dark)",
    }}>
      {/* SYS/SWE 그룹들 */}
      {PROCESS_GROUPS.map((group, gi) => (
        <div key={group.id} style={{ paddingTop: gi === 0 ? 16 : 8 }}>
          {/* 그룹 헤더 */}
          {!collapsed && (
            <div style={{
              padding: "8px 16px 6px",
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              {group.label} ({group.fullLabel})
            </div>
          )}

          {/* 그룹 내 프로세스들 */}
          {group.processes.map(processId => {
            const cfg = PROCESSES[processId];
            const progress = calculateProgress(processId, workProducts);
            const isActive = activeProcess === processId;
            return (
              <ProcessItem
                key={processId}
                cfg={cfg}
                progress={progress}
                active={isActive}
                collapsed={collapsed}
                onClick={() => go(processId)}
              />
            );
          })}
        </div>
      ))}

      {/* 구분선 */}
      <div style={{
        margin: "16px 16px 12px",
        borderTop: "1px solid rgba(255,255,255,0.12)",
      }} />

      {/* 하단 네비게이션 (추적성, 일관성, 템플릿, 설정) */}
      <div style={{ paddingBottom: 24 }}>
        {SIDEBAR_EXTRAS.map(extra => (
          <ExtraItem
            key={extra.id}
            extra={extra}
            active={activeExtra === extra.id}
            collapsed={collapsed}
            onClick={() => goExtra(extra)}
          />
        ))}
      </div>
    </aside>
  );
}

function ProcessItem({ cfg, progress, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: collapsed ? "10px 0" : "9px 14px 9px 16px",
        background: active ? "rgba(249, 97, 103, 0.15)" : "transparent",
        border: "none",
        borderLeft: active ? "3px solid var(--c-coral)" : "3px solid transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.78)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {collapsed ? (
        <div style={{
          fontSize: 10, fontWeight: 700,
          color: active ? "#fff" : "rgba(255,255,255,0.7)",
          textAlign: "center",
        }}>
          {cfg.id.replace("SYS.", "S").replace("SWE.", "E")}
        </div>
      ) : (
        <>
          {/* 항목명 + 진행률 텍스트 */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 4,
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              lineHeight: 1.2,
            }}>
              <span style={{ opacity: 0.6, marginRight: 6 }}>{cfg.id}</span>
              {cfg.label}
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: progressColor(progress),
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
              marginLeft: 6,
            }}>
              {progress}%
            </div>
          </div>

          {/* 진행률 바 */}
          <div style={{
            height: 3, background: "rgba(255,255,255,0.10)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: progressColor(progress),
              transition: "width 0.4s ease, background 0.3s",
            }} />
          </div>
        </>
      )}
    </button>
  );
}

function ExtraItem({ extra, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%",
        padding: collapsed ? "10px 0" : "9px 16px",
        background: active ? "rgba(249, 97, 103, 0.15)" : "transparent",
        border: "none",
        borderLeft: active ? "3px solid var(--c-coral)" : "3px solid transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.78)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        justifyContent: collapsed ? "center" : "flex-start",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 12, opacity: 0.7 }}>{extra.icon}</span>
      {!collapsed && extra.label}
    </button>
  );
}

function progressColor(p) {
  if (p === 0) return "rgba(255,255,255,0.20)";
  if (p < 33) return "#FBBF24";   // amber
  if (p < 66) return "#60A5FA";   // blue
  if (p < 100) return "#3B82F6";  // blue stronger
  return "#10B981";               // green (완료)
}

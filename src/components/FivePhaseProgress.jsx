// 5-Phase QA 진행 표시 컴포넌트 (SCR-12a 화면 본체)
import { T } from "./ui.jsx";

const PHASE_DEFS = [
  { id: 1, name: "Pre-validation", desc: "JSON Schema · 구조 검증", deterministic: true },
  { id: 2, name: "Deterministic", desc: "도메인 제약 · 금지용어 · ID 패턴", deterministic: true },
  { id: 3, name: "LLM Semantic", desc: "Gemini로 의미 검증", deterministic: false },
  { id: 4, name: "Graph", desc: "추적성 · 양방향 일관성", deterministic: true },
  { id: 5, name: "Aggregation", desc: "결과 집계 · 점수 산출", deterministic: true },
];

export function FivePhaseProgress({ progress = {}, phaseResults = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        QA 5-Phase Verification
      </div>
      {PHASE_DEFS.map(phase => {
        const state = progress[phase.id] ?? "pending";
        const result = phaseResults?.[`phase${phase.id}`];
        return <PhaseRow key={phase.id} phase={phase} state={state} result={result} />;
      })}
      {phaseResults && (
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4, fontStyle: "italic", textAlign: "right" }}>
          확정적 60% (Phase 1·2·4·5) + 확률적 40% (Phase 3) — Fast-Fail 패턴
        </div>
      )}
    </div>
  );
}

function PhaseRow({ phase, state, result }) {
  const config = stateConfig(state, result);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px",
      background: T.surface2,
      border: `1px solid ${config.borderColor}`,
      borderRadius: 8,
      transition: "all 0.2s ease",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: config.iconBg, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        flexShrink: 0,
      }}>
        {config.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
          Phase {phase.id} — {phase.name}
          {!phase.deterministic && (
            <span style={{ marginLeft: 8, fontSize: 10, color: T.purple,
                           background: T.purpleDim, padding: "1px 6px", borderRadius: 4 }}>
              LLM
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{phase.desc}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {result?.duration !== undefined && (
          <span style={{ fontSize: 10, color: T.muted, fontVariantNumeric: "tabular-nums" }}>
            {result.duration.toFixed(1)}s
          </span>
        )}
        {config.badge}
      </div>
    </div>
  );
}

function stateConfig(state, result) {
  if (state === "running") return {
    icon: "●",
    iconBg: T.accent,
    borderColor: T.accent + "40",
    badge: <span style={{ fontSize: 10, color: T.accent, fontWeight: 600,
                           background: T.accentDim, padding: "2px 8px", borderRadius: 4 }}>진행중</span>,
  };
  if (state === "done") {
    const issueCount = result?.issueCount ?? 0;
    return {
      icon: "✓",
      iconBg: issueCount === 0 ? T.green : (issueCount < 3 ? T.amber : T.red),
      borderColor: issueCount === 0 ? T.greenBorder : (issueCount < 3 ? T.amberBorder : T.redBorder),
      badge: (
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: issueCount === 0 ? T.green : (issueCount < 3 ? T.amber : T.red),
          background: issueCount === 0 ? T.greenDim : (issueCount < 3 ? T.amberDim : T.redDim),
          padding: "2px 8px", borderRadius: 4,
        }}>
          {issueCount === 0 ? "통과" : `이슈 ${issueCount}건`}
        </span>
      ),
    };
  }
  return {
    icon: "○",
    iconBg: T.muted,
    borderColor: T.border,
    badge: <span style={{ fontSize: 10, color: T.muted, padding: "2px 8px" }}>대기</span>,
  };
}

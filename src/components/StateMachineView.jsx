// HITL 9-state State Machine UI (SCR-13)
import { STATES, availableEvents, transition } from "../lib/state-machine.js";
import { T } from "./ui.jsx";

export function StateMachineView({ currentState, onEvent, role = "Engineer", workProduct = null }) {
  const events = availableEvents(currentState, role);

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>HITL 상태 머신</div>
          <div style={{ fontSize: 10, color: T.muted }}>9 States · 8 Events · Critical 차단 게이트</div>
        </div>
        <div style={{
          fontSize: 10, color: T.muted,
          background: T.surface2, padding: "4px 10px", borderRadius: 12,
        }}>
          역할: <strong style={{ color: T.text }}>{role}</strong>
        </div>
      </div>

      {/* 9개 상태 시각화 — 가로 6 + 분기 2 + 종료 1 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", overflowX: "auto" }}>
          {["INITIAL", "GENERATING", "GENERATED", "VERIFYING", "VERIFIED", "PENDING_APPROVAL", "APPROVED"].map((s, i) => (
            <StateNode key={s} state={s} active={s === currentState} isLast={i === 6} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingRight: 16 }}>
          <StateNode state="CHANGES_REQUESTED" active={currentState === "CHANGES_REQUESTED"} variant="branch" />
          <StateNode state="REJECTED" active={currentState === "REJECTED"} variant="branch" />
        </div>
      </div>

      {/* 가능한 이벤트 (현재 상태 + 권한 기반) */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>가능한 액션</div>
        {events.length === 0 ? (
          <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>
            {STATES[currentState]?.terminal
              ? "종료 상태 — 더 이상 전이 불가"
              : `${role} 권한으로는 이 상태에서 가능한 액션이 없습니다.`}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {events.map(event => {
              const result = transition(currentState, event, role, workProduct);
              const blocked = !result.ok;
              return (
                <button
                  key={event}
                  onClick={() => !blocked && onEvent(event, result.nextState)}
                  disabled={blocked}
                  title={blocked ? result.reason : ""}
                  style={{
                    fontSize: 11, fontWeight: 600,
                    padding: "6px 12px", borderRadius: 6,
                    background: blocked ? T.surface2 : T.accent,
                    color: blocked ? T.muted : "#fff",
                    border: `1px solid ${blocked ? T.border : T.accent}`,
                    cursor: blocked ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {event}
                  {blocked && <span style={{ marginLeft: 4 }}>⛔</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StateNode({ state, active, variant = "main" }) {
  const def = STATES[state];
  if (!def) return null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      minWidth: variant === "branch" ? 90 : 78,
      flexShrink: 0,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: active ? def.color : T.surface,
        border: `2px solid ${active ? def.color : T.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: active ? "#fff" : T.muted,
        fontSize: 11, fontWeight: 700,
        boxShadow: active ? `0 0 0 4px ${def.color}25` : "none",
        transition: "all 0.2s ease",
        marginBottom: 4,
      }}>
        {active ? "●" : "○"}
      </div>
      <div style={{
        fontSize: 9, fontWeight: active ? 700 : 500,
        color: active ? def.color : T.muted,
        textAlign: "center", lineHeight: 1.2,
      }}>
        {def.label}
      </div>
    </div>
  );
}

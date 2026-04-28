// 상단 워크플로우 바 (60px) — 생성 → QA 검토 → 승인 3단계
// 화면설계서 슬라이드 12, 13: "상단 워크플로우 — 현재 상태 강조"
//
// 상태 매핑:
//   현재 단계가 GENERATING/GENERATED  → 1단계 활성 (파랑)
//   VERIFYING/VERIFIED                → 2단계 활성 (주황)
//   PENDING_APPROVAL                  → 3단계 진행중 (네이비)
//   APPROVED                          → 3단계 완료 (초록)

const STEPS = [
  { id: "generation", label: "생성",    color: "#2383E2", desc: "AI Generator" },
  { id: "qa",         label: "QA 검토", color: "#F59E0B", desc: "QA Agent" },
  { id: "approval",   label: "승인",    color: "#10B981", desc: "검토자 의사결정" },
];

export default function TopBar({ currentState }) {
  const currentStep = stateToStep(currentState);

  return (
    <div style={{
      height: "var(--shell-topbar-h)",
      background: "#fff",
      borderBottom: "1px solid var(--c-border)",
      padding: "0 24px",
      display: "flex", alignItems: "center",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        flex: 1, maxWidth: 720, margin: "0 auto",
      }}>
        {STEPS.map((step, idx) => {
          const status = idx < currentStep ? "completed"
                       : idx === currentStep ? "active"
                       : "pending";
          return (
            <Step
              key={step.id}
              step={step}
              index={idx}
              status={status}
              isLast={idx === STEPS.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}

function Step({ step, index, status, isLast }) {
  const config = stepConfig(step, status);

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        flex: isLast ? "none" : 1,
      }}>
        {/* 원형 인디케이터 */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: config.bg,
          color: config.fg,
          border: `2px solid ${config.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
          flexShrink: 0,
          boxShadow: status === "active" ? `0 0 0 4px ${step.color}20` : "none",
          transition: "all 0.2s",
        }}>
          {status === "completed" ? "✓" : index + 1}
        </div>

        {/* 라벨 */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: status === "active" ? 700 : 500,
            color: config.labelColor,
            lineHeight: 1.2,
          }}>
            {step.label}
          </div>
          <div style={{
            fontSize: 10, color: "var(--c-text-muted)",
            marginTop: 1, lineHeight: 1.2,
          }}>
            {step.desc}
          </div>
        </div>

        {/* 연결선 */}
        {!isLast && (
          <div style={{
            flex: 1, height: 2,
            background: status === "completed" ? step.color : "var(--c-border)",
            margin: "0 12px",
            borderRadius: 1,
            transition: "background 0.3s",
          }} />
        )}
      </div>
    </>
  );
}

function stepConfig(step, status) {
  if (status === "completed") return {
    bg: step.color, fg: "#fff", border: step.color,
    labelColor: step.color,
  };
  if (status === "active") return {
    bg: step.color, fg: "#fff", border: step.color,
    labelColor: step.color,
  };
  return {
    bg: "#fff", fg: "var(--c-text-muted)", border: "var(--c-border-strong)",
    labelColor: "var(--c-text-muted)",
  };
}

function stateToStep(state) {
  if (!state) return 0;
  if (["INITIAL", "GENERATING"].includes(state)) return 0;
  if (["GENERATED", "VERIFYING"].includes(state)) return 1;
  if (["VERIFIED", "PENDING_APPROVAL"].includes(state)) return 2;
  if (state === "APPROVED") return 3;
  return 0;
}

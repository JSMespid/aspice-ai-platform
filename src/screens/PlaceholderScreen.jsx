// 아직 구현하지 않은 화면을 위한 placeholder
// Phase 2/3/4 작업 완료 시 실제 화면으로 대체됨

export default function PlaceholderScreen({ title, subtitle, description }) {
  return (
    <div style={{
      maxWidth: 640, margin: "60px auto",
      background: "#fff",
      border: "1px solid var(--c-border)",
      borderRadius: 12,
      padding: 40, textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 56, margin: "0 auto 20px",
        borderRadius: "50%", background: "var(--c-bg-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, color: "var(--c-text-muted)",
        border: "2px dashed var(--c-border-strong)",
      }}>
        ◇
      </div>
      <h2 style={{
        fontSize: 18, fontWeight: 700, color: "var(--c-navy-deep)",
        margin: "0 0 6px",
      }}>
        {title}
      </h2>
      {subtitle && (
        <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginBottom: 16 }}>
          {subtitle}
        </div>
      )}
      <p style={{
        fontSize: 13, color: "var(--c-text-soft)",
        lineHeight: 1.7, margin: 0,
      }}>
        {description}
      </p>

      {/* 진행 상황 표시 */}
      <div style={{
        marginTop: 32, paddingTop: 20,
        borderTop: "1px solid var(--c-border)",
        display: "flex", justifyContent: "center", gap: 20,
      }}>
        <PhaseStatus phase="Phase 1" label="셸 + 로그인" status="completed" />
        <PhaseStatus phase="Phase 2" label="V-Model 화면" status="active" />
        <PhaseStatus phase="Phase 3" label="설정" status="pending" />
        <PhaseStatus phase="Phase 4" label="추적성·일관성" status="pending" />
      </div>
    </div>
  );
}

function PhaseStatus({ phase, label, status }) {
  const colors = {
    completed: { bg: "#10B981", text: "#10B981" },
    active:    { bg: "#F59E0B", text: "#F59E0B" },
    pending:   { bg: "#D5DCE8", text: "#9CA3AF" },
  };
  const c = colors[status];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: c.bg, margin: "0 auto 4px",
      }} />
      <div style={{ fontSize: 9, fontWeight: 700, color: c.text, marginBottom: 2 }}>
        {phase}
      </div>
      <div style={{ fontSize: 9, color: "var(--c-text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

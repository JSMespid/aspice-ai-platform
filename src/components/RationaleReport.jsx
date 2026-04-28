// Rationale Report 패널 (SCR-11 화면 우측)
// 환각 방지 5축이 어떻게 적용됐는지 사용자에게 투명하게 노출
import { T } from "./ui.jsx";

export function RationaleReport({ rationale }) {
  if (!rationale) return null;

  return (
    <div style={{
      background: T.surface2,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 16,
      borderLeft: `3px solid ${T.purple}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: T.purpleDim, color: T.purple,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700,
        }}>R</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Rationale Report</div>
          <div style={{ fontSize: 10, color: T.muted }}>AI 생성 근거 + 환각 방지 가드레일</div>
        </div>
      </div>

      <Section title="1. 생성 정보">
        <KV label="모델" value={rationale.generation.model} />
        <KV label="입력 토큰" value={rationale.generation.input_tokens.toLocaleString()} />
        <KV label="출력 토큰" value={rationale.generation.output_tokens.toLocaleString()} />
        <KV label="소요 시간" value={`${rationale.generation.duration_sec.toFixed(1)}초`} />
        {rationale.generation.retried && (
          <div style={{ marginTop: 6, padding: "6px 8px", background: T.amberDim,
                        border: `1px solid ${T.amberBorder}`, borderRadius: 6,
                        fontSize: 10, color: T.amber }}>
            ⚠ 첫 시도가 스키마 위반으로 실패하여 자동 재시도됨
          </div>
        )}
      </Section>

      {rationale.qa && (
        <Section title="2. QA 검증 결과">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 10px", background: T.surface, borderRadius: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: T.muted }}>전체 점수</span>
            <span style={{ fontSize: 16, fontWeight: 700,
                           color: scoreColor(rationale.qa.score) }}>
              {rationale.qa.score}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
            <SevPill label="Critical" count={rationale.qa.issue_summary.critical} color={T.red} />
            <SevPill label="Major" count={rationale.qa.issue_summary.major} color={T.amber} />
            <SevPill label="Minor" count={rationale.qa.issue_summary.minor} color={T.amber} />
            <SevPill label="Info" count={rationale.qa.issue_summary.info} color={T.accent} />
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
            권고: <strong style={{ color: recommendationColor(rationale.qa.recommendation) }}>
              {rationale.qa.recommendation}
            </strong>
          </div>
        </Section>
      )}

      <Section title="3. 환각 방지 가드레일">
        {rationale.guardrails_applied.map((g, i) => (
          <div key={i} style={{
            fontSize: 10, color: T.text, marginBottom: 4,
            paddingLeft: 16, position: "relative",
          }}>
            <span style={{ position: "absolute", left: 0, color: T.green }}>✓</span>
            {g}
          </div>
        ))}
      </Section>

      <div style={{ fontSize: 9, color: T.muted, marginTop: 8, fontStyle: "italic" }}>
        Generated at {new Date(rationale.timestamp).toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0" }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ color: T.text, fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </div>
  );
}

function SevPill({ label, count, color }) {
  return (
    <div style={{
      textAlign: "center", padding: "4px 0",
      background: count > 0 ? color + "15" : T.surface2,
      border: `1px solid ${count > 0 ? color + "40" : T.border}`,
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? color : T.muted,
                    fontVariantNumeric: "tabular-nums" }}>
        {count}
      </div>
      <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function scoreColor(score) {
  if (score >= 90) return "#0F7B6C";
  if (score >= 70) return "#C77D1A";
  return "#E03E3E";
}

function recommendationColor(rec) {
  if (rec.includes("승인")) return "#0F7B6C";
  if (rec.includes("반려")) return "#E03E3E";
  return "#C77D1A";
}

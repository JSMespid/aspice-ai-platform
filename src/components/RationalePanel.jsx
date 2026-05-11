// src/components/RationalePanel.jsx — 우측 슬라이드 패널
//
// 화면설계서 v260506 SCR-11 Rationale Report 골격
//
// 역할:
//   - AI 생성 진행 단계 표시 (Plan → Generate → Verify)
//   - 5축 가드레일 결과 표시 (구조/추적성/도메인/교차검증/HITL)
//   - 생성된 산출물 미리보기
//   - 메타데이터 (모델, Skills, 토큰, 비용, 지연시간)
//
// 상태:
//   open:    boolean
//   step:    AgentStep
//   detail:  step별 메시지/결과
//   result:  최종 generation 결과 (성공 or 차단)

import { AgentStep } from '../lib/agent-harness.js';

export default function RationalePanel({ open, onClose, step, detail, result }) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(2px)',
          zIndex: 900,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(560px, 90vw)',
          background: '#fff',
          boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.18)',
          zIndex: 901,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--c-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--c-text-muted)',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}
            >
              SCR-11 · RATIONALE REPORT
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
              AI 생성 + 5축 가드레일
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              fontWeight: 300,
              color: 'var(--c-text-muted)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              borderRadius: 6,
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <ProgressSection step={step} detail={detail} />

          {result && (
            <>
              <MetaSection meta={result.meta} skillsUsed={result.meta?.skills_used} />
              <GuardrailSection guardrailResult={result.guardrail_result} />
              {result.passed && result.output && (
                <OutputSection output={result.output} />
              )}
              {!result.passed && (
                <BlockedSection guardrailResult={result.guardrail_result} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid var(--c-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            flexShrink: 0,
            background: 'var(--c-bg-soft)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#fff',
              border: '1px solid var(--c-border-strong)',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────
// 진행 단계 표시
// ──────────────────────────────────────────────────
function ProgressSection({ step, detail }) {
  const steps = [
    { id: AgentStep.PREPARING,  label: '준비',     desc: '입력 검증 + Skills 로딩' },
    { id: AgentStep.GENERATING, label: '생성',     desc: 'Claude Opus 4.7 (adaptive thinking)' },
    { id: AgentStep.VALIDATING, label: '검증',     desc: '5축 가드레일' },
    { id: AgentStep.COMPLETED,  label: '완료',     desc: '결과 저장' },
  ];

  const stepIndex = steps.findIndex(s => s.id === step);
  const isFailed = step === AgentStep.FAILED;
  const isBlocked = step === AgentStep.BLOCKED;
  const isCompleted = step === AgentStep.COMPLETED;

  return (
    <Section title="진행 단계">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          let state;
          if (isFailed && i === stepIndex)  state = 'failed';
          else if (isBlocked && i >= 2)     state = i === 2 ? 'blocked' : 'pending';
          else if (i < stepIndex)           state = 'done';
          else if (i === stepIndex)         state = 'active';
          else                              state = 'pending';

          if (isCompleted && i <= 3)        state = 'done';

          return <StepRow key={s.id} step={s} state={state} />;
        })}
      </div>

      {detail?.message && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--c-bg-soft)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--c-text-soft)',
            lineHeight: 1.6,
          }}
        >
          {detail.message}
        </div>
      )}
    </Section>
  );
}

function StepRow({ step, state }) {
  const colors = {
    done:    { bg: '#10B981', icon: '✓', text: 'var(--c-text)' },
    active:  { bg: '#2383E2', icon: '●', text: 'var(--c-text)', pulse: true },
    pending: { bg: '#E5E7EB', icon: '○', text: 'var(--c-text-muted)' },
    failed:  { bg: '#DC2626', icon: '✗', text: 'var(--c-text)' },
    blocked: { bg: '#F59E0B', icon: '⚠', text: 'var(--c-text)' },
  };
  const c = colors[state];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: c.bg,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          animation: c.pulse ? 'pulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {c.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
          {step.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 1 }}>
          {step.desc}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 메타데이터
// ──────────────────────────────────────────────────
function MetaSection({ meta, skillsUsed }) {
  if (!meta) return null;
  const cost = meta.cost_usd || 0;
  return (
    <Section title="메타데이터">
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--c-text-muted)' }}>모델</span>
        <span style={{ fontFamily: 'monospace' }}>{meta.model}</span>

        <span style={{ color: 'var(--c-text-muted)' }}>Skills</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(skillsUsed || []).map(s => (
            <span
              key={s}
              style={{
                fontSize: 10,
                fontWeight: 600,
                background: 'rgba(30, 39, 97, 0.08)',
                color: 'var(--c-navy-deep)',
                padding: '2px 8px',
                borderRadius: 8,
                border: '1px solid rgba(30, 39, 97, 0.18)',
              }}
            >
              {s}
            </span>
          ))}
        </span>

        <span style={{ color: 'var(--c-text-muted)' }}>토큰</span>
        <span style={{ fontFamily: 'monospace' }}>
          입력 {meta.input_tokens?.toLocaleString() || 0} · 출력 {meta.output_tokens?.toLocaleString() || 0}
        </span>

        <span style={{ color: 'var(--c-text-muted)' }}>비용</span>
        <span style={{ fontFamily: 'monospace' }}>${cost.toFixed(4)}</span>

        <span style={{ color: 'var(--c-text-muted)' }}>지연</span>
        <span style={{ fontFamily: 'monospace' }}>{meta.latency_ms?.toLocaleString() || 0}ms</span>
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────
// 5축 가드레일 결과
// ──────────────────────────────────────────────────
function GuardrailSection({ guardrailResult }) {
  if (!guardrailResult) return null;

  const axes = [
    { key: 'structure',    label: '① 구조',    desc: 'JSON Schema' },
    { key: 'traceability', label: '② 추적성',  desc: 'ID 매핑·V-Model' },
    { key: 'domain',       label: '③ 도메인',  desc: '자동차 SW 규칙' },
    { key: 'cross_verify', label: '④ 교차검증', desc: 'Gemini 평가' },
    { key: 'hitl',         label: '⑤ HITL',    desc: 'Reviewer 승인' },
  ];

  return (
    <Section title="5축 가드레일">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {axes.map(axis => {
          const r = guardrailResult.axes?.[axis.key];
          if (!r) return null;
          const isHooked = r.hooked;
          const passed = r.passed;
          const issueCount = r.issues?.length || 0;

          return (
            <div
              key={axis.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                background: isHooked ? 'var(--c-bg-soft)' : passed ? 'rgba(16, 185, 129, 0.06)' : 'rgba(220, 38, 38, 0.06)',
                border: `1px solid ${isHooked ? 'var(--c-border)' : passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
                borderRadius: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{axis.label}</div>
                <div style={{ fontSize: 10, color: 'var(--c-text-muted)' }}>{axis.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-soft)' }}>
                {isHooked ? (
                  <span style={{ fontStyle: 'italic' }}>
                    {r.note || `Phase ${r.required_in_phase || '2-2b'}에서 활성화`}
                  </span>
                ) : passed ? (
                  '통과'
                ) : (
                  <span style={{ color: '#991B1B', fontWeight: 600 }}>
                    {issueCount}건 위반
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 10,
                  background: isHooked ? '#9CA3AF' : passed ? '#10B981' : '#DC2626',
                  color: '#fff',
                }}
              >
                {isHooked ? 'HOOKED' : passed ? 'PASS' : 'FAIL'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 위반 상세 */}
      {axes.map(axis => {
        const r = guardrailResult.axes?.[axis.key];
        if (!r || r.hooked || r.passed || !r.issues?.length) return null;
        return (
          <div key={axis.key + '-issues'} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', marginBottom: 6 }}>
              {axis.label} — 위반 항목
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.issues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: 'rgba(220, 38, 38, 0.04)',
                    border: '1px solid rgba(220, 38, 38, 0.2)',
                    borderRadius: 4,
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#991B1B' }}>
                    [{issue.severity || 'medium'}] {issue.message}
                  </div>
                  {issue.suggestion && (
                    <div style={{ marginTop: 3, color: 'var(--c-text-soft)' }}>
                      💡 {issue.suggestion}
                    </div>
                  )}
                  {issue.context && (
                    <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-muted)' }}>
                      {issue.context}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// ──────────────────────────────────────────────────
// 생성 결과 미리보기
// ──────────────────────────────────────────────────
function OutputSection({ output }) {
  return (
    <Section title="생성 결과">
      <div
        style={{
          background: 'var(--c-bg-soft)',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          padding: 12,
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: 1.6,
          maxHeight: 300,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(output, null, 2)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 6 }}>
        {output.stakeholder_requirements?.length || 0}개 STK_REQ 생성 ·{' '}
        {output.use_cases?.length || 0}개 Use Case
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────
// 차단 안내
// ──────────────────────────────────────────────────
function BlockedSection({ guardrailResult }) {
  return (
    <Section title="결과: 가드레일 차단">
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: '#92400E',
          lineHeight: 1.6,
        }}
      >
        AI 생성 결과가 가드레일에 차단되었습니다 ({(guardrailResult?.failed_axes || []).join(', ')}).
        <br />
        산출물은 저장되지 않았으며, 입력을 보완 후 재시도하세요.
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────
// Section 헬퍼
// ──────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--c-text-muted)',
          marginBottom: 10,
          marginTop: 0,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

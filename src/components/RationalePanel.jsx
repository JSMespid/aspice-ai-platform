// src/components/RationalePanel.jsx — Phase 2-2b STEP C-2

import { AgentStep } from '../lib/agent-harness.js';

export default function RationalePanel({ open, onClose, step, detail, result }) {
  if (!open) return null;

  const generator = result?.generator;
  const evaluator = result?.evaluator;
  const critique = evaluator?.critique;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(2px)',
        zIndex: 900,
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(640px, 95vw)',
        background: '#fff',
        boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.18)',
        zIndex: 901,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', gap: 12,
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--c-text-muted)',
              letterSpacing: '0.04em', marginBottom: 4,
            }}>
              SCR-11 · RATIONALE REPORT
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
              AI 생성 + 5축 가드레일
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            fontSize: 22, fontWeight: 300,
            color: 'var(--c-text-muted)',
            cursor: 'pointer', width: 32, height: 32, borderRadius: 6,
          }} aria-label="닫기">×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <ProgressSection step={step} detail={detail} hasGenerator={!!generator} hasEvaluator={!!evaluator} />

          {generator?.meta && (
            <MetaSection
              meta={generator.meta}
              skillsUsed={generator.meta.skills_used}
              evaluatorMeta={evaluator?.meta}
            />
          )}

          {(generator?.guardrail_result || critique) && (
            <GuardrailSection
              generatorGuardrail={generator?.guardrail_result}
              critique={critique}
              hasEvaluator={!!evaluator}
            />
          )}

          {critique && <CritiqueSection critique={critique} />}

          {generator && !evaluator && (
            <div style={{
              marginTop: 18,
              padding: '12px 14px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.30)',
              borderRadius: 8,
              fontSize: 12, color: '#92400E', lineHeight: 1.6,
            }}>
              💡 <strong>QA 검토 미실행</strong> — 산출물 화면 우측 상단 <strong>[🔍 QA 검토 시작]</strong> 버튼을 누르면 Gemini가 독립 평가합니다 (5축 가드레일 ④).
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
          background: 'var(--c-bg-soft)',
        }}>
          <button onClick={onClose} style={{
            background: '#fff',
            border: '1px solid var(--c-border-strong)',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 12, fontWeight: 600,
            color: 'var(--c-text)', cursor: 'pointer',
          }}>닫기</button>
        </div>
      </div>
    </>
  );
}

function ProgressSection({ step, detail, hasGenerator, hasEvaluator }) {
  const genSteps = [
    { id: AgentStep.GEN_PREPARING,  label: '준비',       desc: '입력 검증 + Skills 로딩' },
    { id: AgentStep.GEN_GENERATING, label: '생성',       desc: 'Claude Opus 4.7 (adaptive thinking)' },
    { id: AgentStep.GEN_VALIDATING, label: '구조 검증',  desc: '5축 가드레일 ① ② ③' },
    { id: AgentStep.GEN_COMPLETED,  label: 'AI 생성 완료', desc: '사용자 검토 단계' },
  ];

  const evalSteps = [
    { id: AgentStep.EVAL_PREPARING,  label: 'QA 준비',  desc: 'Gemini API 준비' },
    { id: AgentStep.EVAL_EVALUATING, label: 'QA 검토',  desc: 'Gemini 독립 평가 (④ 교차검증)' },
    { id: AgentStep.EVAL_COMPLETED,  label: 'QA 완료',  desc: '결과 저장' },
  ];

  function getStepState(stepId, group) {
    const groupSteps = group === 'gen' ? genSteps : evalSteps;
    const currentIndex = groupSteps.findIndex(s => s.id === step);
    const stepIndex = groupSteps.findIndex(s => s.id === stepId);
    const isFailed = (group === 'gen' && step === AgentStep.GEN_FAILED) ||
                     (group === 'eval' && step === AgentStep.EVAL_FAILED);
    const isBlocked = step === AgentStep.GEN_BLOCKED ||
                      step === AgentStep.EVAL_REJECTED;
    const isWarning = step === AgentStep.EVAL_NEEDS_REFINEMENT;

    if (currentIndex === stepIndex && currentIndex >= 0) {
      if (isFailed) return 'failed';
      if (isBlocked) return 'blocked';
      if (isWarning) return 'warning';
      return 'active';
    }

    if (currentIndex >= 0 && stepIndex < currentIndex) return 'done';

    if (group === 'gen' && hasGenerator) return 'done';
    if (group === 'eval' && hasEvaluator) return 'done';

    return 'pending';
  }

  return (
    <Section title="진행 단계">
      <div style={{
        fontSize: 10, fontWeight: 700,
        color: 'var(--c-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        [1] AI 생성 (Generator)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {genSteps.map(s => (
          <StepRow key={s.id} step={s} state={getStepState(s.id, 'gen')} />
        ))}
      </div>

      <div style={{
        fontSize: 10, fontWeight: 700,
        color: 'var(--c-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        [2] QA 검토 (Evaluator)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {evalSteps.map(s => (
          <StepRow key={s.id} step={s} state={getStepState(s.id, 'eval')} />
        ))}
      </div>

      {detail?.message && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          background: detail.message.includes('오류') || detail.message.includes('차단') || detail.message.includes('반려')
            ? 'rgba(220, 38, 38, 0.08)'
            : detail.message.includes('개선')
              ? 'rgba(245, 158, 11, 0.08)'
              : 'var(--c-bg-soft)',
          border: detail.message.includes('오류') || detail.message.includes('차단') || detail.message.includes('반려')
            ? '1px solid rgba(220, 38, 38, 0.25)'
            : detail.message.includes('개선')
              ? '1px solid rgba(245, 158, 11, 0.25)'
              : '1px solid transparent',
          borderRadius: 6,
          fontSize: 12, lineHeight: 1.6,
        }}>
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
    blocked: { bg: '#DC2626', icon: '⊘', text: 'var(--c-text)' },
    warning: { bg: '#F59E0B', icon: '⚠', text: 'var(--c-text)' },
  };
  const c = colors[state];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: c.bg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
        animation: c.pulse ? 'pulse 1.4s ease-in-out infinite' : 'none',
      }}>{c.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{step.label}</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 1 }}>{step.desc}</div>
      </div>
    </div>
  );
}

function MetaSection({ meta, skillsUsed, evaluatorMeta }) {
  if (!meta) return null;
  const generatorCost = meta.cost_usd || 0;
  const evaluatorCost = evaluatorMeta?.cost_usd || 0;
  const totalCost = generatorCost + evaluatorCost;

  return (
    <Section title="메타데이터">
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--c-text-muted)' }}>Generator</span>
        <span style={{ fontFamily: 'monospace' }}>{meta.model}</span>

        {evaluatorMeta && (
          <>
            <span style={{ color: 'var(--c-text-muted)' }}>Evaluator</span>
            <span style={{ fontFamily: 'monospace' }}>{evaluatorMeta.model}</span>
          </>
        )}

        {(skillsUsed?.length || 0) > 0 && (
          <>
            <span style={{ color: 'var(--c-text-muted)' }}>Skills</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(skillsUsed || []).map(s => (
                <span key={s} style={{
                  fontSize: 10, fontWeight: 600,
                  background: 'rgba(30, 39, 97, 0.08)',
                  color: 'var(--c-navy-deep)',
                  padding: '2px 8px', borderRadius: 8,
                  border: '1px solid rgba(30, 39, 97, 0.18)',
                }}>{s}</span>
              ))}
            </span>
          </>
        )}

        <span style={{ color: 'var(--c-text-muted)' }}>토큰 (Gen)</span>
        <span style={{ fontFamily: 'monospace' }}>
          ↓ {(meta.input_tokens || 0).toLocaleString()} · ↑ {(meta.output_tokens || 0).toLocaleString()}
        </span>

        {evaluatorMeta && (
          <>
            <span style={{ color: 'var(--c-text-muted)' }}>토큰 (QA)</span>
            <span style={{ fontFamily: 'monospace' }}>
              ↓ {(evaluatorMeta.input_tokens || 0).toLocaleString()} · ↑ {(evaluatorMeta.output_tokens || 0).toLocaleString()}
            </span>
          </>
        )}

        <span style={{ color: 'var(--c-text-muted)' }}>총 비용</span>
        <span style={{ fontFamily: 'monospace' }}>
          ${totalCost.toFixed(4)}
          {evaluatorMeta && <span style={{ color: 'var(--c-text-muted)', marginLeft: 6 }}>
            (Gen ${generatorCost.toFixed(4)} + QA ${evaluatorCost.toFixed(4)})
          </span>}
        </span>

        <span style={{ color: 'var(--c-text-muted)' }}>지연 (Gen)</span>
        <span style={{ fontFamily: 'monospace' }}>{(meta.latency_ms || 0).toLocaleString()}ms</span>

        {evaluatorMeta && (
          <>
            <span style={{ color: 'var(--c-text-muted)' }}>지연 (QA)</span>
            <span style={{ fontFamily: 'monospace' }}>{(evaluatorMeta.latency_ms || 0).toLocaleString()}ms</span>
          </>
        )}
      </div>
    </Section>
  );
}

function GuardrailSection({ generatorGuardrail, critique, hasEvaluator }) {
  const axes = [
    { key: 'structure',    label: '① 구조',     desc: 'JSON Schema',         source: 'generator' },
    { key: 'traceability', label: '② 추적성',   desc: 'ID 매핑·V-Model',     source: 'generator' },
    { key: 'domain',       label: '③ 도메인',   desc: '자동차 SW 규칙',      source: 'generator' },
    { key: 'cross_verify', label: '④ 교차검증', desc: 'Gemini 평가',        source: 'evaluator' },
    { key: 'hitl',         label: '⑤ HITL',     desc: 'Reviewer 승인',      source: 'phase_3' },
  ];

  function getAxisStatus(axis) {
    if (axis.source === 'phase_3') {
      return { active: false, status: 'HOOKED', note: 'Phase 2-3 활성' };
    }
    if (axis.source === 'evaluator') {
      if (!hasEvaluator || !critique) {
        return { active: false, status: 'PENDING', note: 'QA 검토 미실행' };
      }
      const passed = critique.verdict === 'passed';
      const issues = critique.issues || [];
      return {
        active: true,
        status: passed ? 'PASS' : (critique.verdict === 'rejected' ? 'FAIL' : 'REVIEW'),
        passed,
        verdict: critique.verdict,
        score: critique.overall_score,
        summary: critique.summary,
        issueCount: issues.length,
      };
    }
    const r = generatorGuardrail?.axes?.[axis.key];
    if (!r) return { active: false, status: 'HOOKED', note: '미실행' };
    return {
      active: true,
      status: r.passed ? 'PASS' : 'FAIL',
      passed: r.passed,
      issueCount: r.issues?.length || 0,
    };
  }

  return (
    <Section title="5축 가드레일">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {axes.map(axis => {
          const s = getAxisStatus(axis);
          let bg, border, statusBg, statusColor = '#fff';
          if (!s.active) {
            bg = 'var(--c-bg-soft)';
            border = 'var(--c-border)';
            statusBg = s.status === 'PENDING' ? '#F59E0B' : '#9CA3AF';
          } else if (s.status === 'PASS') {
            bg = 'rgba(16, 185, 129, 0.06)';
            border = 'rgba(16, 185, 129, 0.3)';
            statusBg = '#10B981';
          } else if (s.status === 'REVIEW') {
            bg = 'rgba(245, 158, 11, 0.08)';
            border = 'rgba(245, 158, 11, 0.4)';
            statusBg = '#F59E0B';
          } else {
            bg = 'rgba(220, 38, 38, 0.06)';
            border = 'rgba(220, 38, 38, 0.3)';
            statusBg = '#DC2626';
          }

          return (
            <div key={axis.key} style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr auto',
              gap: 10, alignItems: 'center',
              padding: '10px 12px',
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 6,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{axis.label}</div>
                <div style={{ fontSize: 10, color: 'var(--c-text-muted)' }}>{axis.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-soft)' }}>
                {!s.active ? (
                  <span style={{ fontStyle: 'italic' }}>{s.note}</span>
                ) : axis.source === 'evaluator' ? (
                  <span>
                    점수 <strong>{(s.score * 100).toFixed(0)}%</strong>
                    {s.issueCount > 0 && ` · ${s.issueCount}건 이슈`}
                  </span>
                ) : s.passed ? (
                  '통과'
                ) : (
                  <span style={{ color: '#991B1B', fontWeight: 600 }}>{s.issueCount}건 위반</span>
                )}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 10px', borderRadius: 10,
                background: statusBg, color: statusColor,
              }}>{s.status}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function CritiqueSection({ critique }) {
  if (!critique) return null;

  const verdictColors = {
    passed:           { bg: 'rgba(16, 185, 129, 0.10)', border: 'rgba(16, 185, 129, 0.40)', label: '통과', color: '#065F46' },
    needs_refinement: { bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.40)', label: '개선 권장', color: '#92400E' },
    rejected:         { bg: 'rgba(220, 38, 38, 0.10)', border: 'rgba(220, 38, 38, 0.40)', label: '반려', color: '#991B1B' },
  };
  const vc = verdictColors[critique.verdict] || verdictColors.needs_refinement;

  const issues = critique.issues || [];
  const strengths = critique.strengths || [];

  return (
    <Section title="Gemini QA 검토 결과">
      <div style={{
        padding: '12px 14px',
        background: vc.bg,
        border: `1px solid ${vc.border}`,
        borderRadius: 6,
        marginBottom: 14,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 6,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: vc.color,
            padding: '2px 10px',
            background: '#fff',
            borderRadius: 10,
            border: `1px solid ${vc.border}`,
          }}>
            {vc.label}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: vc.color, fontFamily: 'monospace',
          }}>
            {((critique.overall_score || 0) * 100).toFixed(0)} / 100
          </span>
        </div>
        <div style={{
          fontSize: 12, lineHeight: 1.6,
          color: vc.color,
        }}>
          {critique.summary}
        </div>
      </div>

      {strengths.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: '#065F46',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 6,
          }}>
            ✓ 강점 ({strengths.length})
          </div>
          <ul style={{
            margin: 0, paddingLeft: 18,
            fontSize: 12, lineHeight: 1.7,
            color: 'var(--c-text-soft)',
          }}>
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: '#991B1B',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}>
            ⚠ 발견된 이슈 ({issues.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {issues.map((issue, i) => <IssueCard key={i} issue={issue} />)}
          </div>
        </div>
      )}

      {critique.refinement_instructions && (
        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          background: 'rgba(35, 131, 226, 0.08)',
          border: '1px solid rgba(35, 131, 226, 0.30)',
          borderRadius: 6,
          fontSize: 11, lineHeight: 1.6,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: '#1E3A8A',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            💡 개선 지시
          </div>
          <div style={{ color: 'var(--c-text)' }}>
            {critique.refinement_instructions}
          </div>
        </div>
      )}
    </Section>
  );
}

function IssueCard({ issue }) {
  const severityColors = {
    critical: { bg: 'rgba(220, 38, 38, 0.12)', border: 'rgba(220, 38, 38, 0.40)', color: '#991B1B', label: 'CRITICAL' },
    high:     { bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.40)', color: '#92400E', label: 'HIGH' },
    medium:   { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.30)', color: '#3730A3', label: 'MEDIUM' },
    low:      { bg: 'rgba(107, 114, 128, 0.08)', border: 'rgba(107, 114, 128, 0.25)', color: '#374151', label: 'LOW' },
  };
  const sc = severityColors[issue.severity] || severityColors.medium;

  const categoryLabels = {
    hallucination:     '환각',
    inconsistency:     '불일치',
    aspice_compliance: 'ASPICE 비준수',
    domain_error:      '도메인 오류',
    traceability:      '추적성',
  };

  return (
    <div style={{
      padding: '10px 12px',
      background: sc.bg,
      border: `1px solid ${sc.border}`,
      borderRadius: 6,
      fontSize: 11, lineHeight: 1.6,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          fontSize: 9, fontWeight: 700,
          color: '#fff',
          background: sc.color,
          padding: '2px 6px', borderRadius: 3,
        }}>{sc.label}</span>
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: sc.color,
          padding: '2px 6px',
          background: '#fff',
          border: `1px solid ${sc.border}`,
          borderRadius: 3,
        }}>{categoryLabels[issue.category] || issue.category}</span>
        {issue.target_id && (
          <span style={{
            fontSize: 10, fontFamily: 'monospace',
            color: 'var(--c-text-soft)',
          }}>→ {issue.target_id}</span>
        )}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>
        {issue.issue}
      </div>
      {issue.evidence && (
        <div style={{
          fontSize: 10, color: 'var(--c-text-muted)',
          fontFamily: 'monospace',
          padding: '4px 6px',
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 3,
          marginTop: 4, marginBottom: 4,
        }}>
          📎 {issue.evidence}
        </div>
      )}
      {issue.suggested_fix && (
        <div style={{
          fontSize: 11, color: 'var(--c-text-soft)',
          fontStyle: 'italic',
          marginTop: 4,
        }}>
          💡 {issue.suggested_fix}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{
        fontSize: 12, fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--c-text-muted)',
        marginBottom: 10, marginTop: 0,
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

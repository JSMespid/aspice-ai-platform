// src/components/RationalePanel.jsx — Phase 2-2d
// 변경 사항 (vs 2-2b STEP C-2):
//   - SSE streaming 진행 단계를 받아 시트별 진행 카드 표시
//   - 실시간 비용/토큰/캐시 HIT 표시
//   - progressHistory 로 시간순 누적 (어떤 단계든 step prop으로 들어와도 OK)
//   - streaming 단계(GEN_SHEET_*, GEN_MERGING, GEN_SAVING)는 '생성' / '구조 검증' 행으로 매핑
// Phase 2-2g (옵션 G):
//   - cancellable / onCancel / cancelling props 추가 — chunked 모드에서 헤더의 취소 버튼 활성

import { useEffect, useRef, useState } from 'react';
import { AgentStep } from '../lib/agent-harness.js';

export default function RationalePanel({
  open, onClose, step, detail, result,
  // Phase 2-2g: chunked generation 취소 (기본값은 false/null — 미지정 시 버튼 안 보임)
  cancellable = false,
  onCancel = null,
  cancelling = false,
}) {
  // Phase 2-2d: streaming 진행 정보 누적
  //   - sheets: { [idx]: { name, group, status, stk_count, cache_hit, latency_ms } }
  //   - liveCost: 실시간 누적 비용 (단계별로 들어옴)
  //   - liveTokens: { input, output, cache_read, cache_creation }
  //   - guardrailLive: 가드레일 진행 상황 (running/done)
  // Phase 2-2e: batch 진행 정보 추가
  //   - batchPlan: { batch_size, total_batches, total_sheets }
  //   - batches: { [batch_idx]: { status, succeeded, failed, duration_ms, sheets_range } }
  const [progressState, setProgressState] = useState({
    sheets: {},
    sheetCount: 0,
    liveCost: null,
    liveTokens: null,
    guardrailLive: null,
    batchPlan: null,
    batches: {},
    history: [],  // { ts, step, message }
    startedAt: null,
  });
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (!step) return;
    const raw = detail?.raw;
    const now = Date.now();

    setProgressState(prev => {
      let next = { ...prev };
      // 첫 활성 단계에 startedAt 기록
      if (!startedAtRef.current && (step === AgentStep.GEN_PREPARING || step === AgentStep.GEN_GENERATING)) {
        startedAtRef.current = now;
        next.startedAt = now;
      }

      // history 누적 (메시지 있는 단계만, 최근 30개)
      if (detail?.message) {
        next.history = [
          ...prev.history,
          { ts: now, step, message: detail.message },
        ].slice(-30);
      }

      // SSE 백엔드 step
      const backendStep = raw?.step;

      if (backendStep === 'mode_detected') {
        next.sheetCount = raw.sheet_count || 0;
        // 사전에 시트 placeholder 채우기
        if (Array.isArray(raw.sheets)) {
          const placeholders = {};
          for (const s of raw.sheets) {
            placeholders[s.idx] = {
              idx: s.idx,
              name: s.name,
              group: s.group,
              status: 'pending',
            };
          }
          next.sheets = placeholders;
        }
      } else if (step === AgentStep.GEN_SHEET_START && raw) {
        next.sheets = {
          ...prev.sheets,
          [raw.sheet_idx]: {
            ...(prev.sheets[raw.sheet_idx] || {}),
            idx: raw.sheet_idx,
            name: raw.sheet_name,
            group: raw.sheet_group,
            status: 'running',
            startedAt: now,
          },
        };
      } else if (step === AgentStep.GEN_SHEET_DONE && raw) {
        next.sheets = {
          ...prev.sheets,
          [raw.sheet_idx]: {
            ...(prev.sheets[raw.sheet_idx] || {}),
            idx: raw.sheet_idx,
            name: raw.sheet_name,
            group: raw.sheet_group,
            status: 'done',
            stk_count: raw.stk_count,
            cache_hit: raw.cache_hit,
            latency_ms: raw.latency_ms,
            cache_read_tokens: raw.cache_read_tokens,
            cache_creation_tokens: raw.cache_creation_tokens,
            doneAt: now,
          },
        };
      } else if (step === AgentStep.GEN_SHEET_FAILED && raw) {
        next.sheets = {
          ...prev.sheets,
          [raw.sheet_idx]: {
            ...(prev.sheets[raw.sheet_idx] || {}),
            idx: raw.sheet_idx,
            name: raw.sheet_name,
            status: 'failed',
            error: raw.error,
          },
        };
      } else if (backendStep === 'batch_plan' && raw) {
        // Phase 2-2e: 배치 계획 저장
        next.batchPlan = {
          batch_size: raw.batch_size,
          total_batches: raw.total_batches,
          total_sheets: raw.total_sheets,
        };
      } else if (backendStep === 'batch_start' && raw) {
        // Phase 2-2e: 배치 시작
        next.batches = {
          ...prev.batches,
          [raw.batch_idx]: {
            ...(prev.batches[raw.batch_idx] || {}),
            idx: raw.batch_idx,
            total: raw.batch_total,
            status: 'running',
            sheets_in_batch: raw.sheets_in_batch,
            sheets_start_idx: raw.sheets_start_idx,
            sheets_end_idx: raw.sheets_end_idx,
            startedAt: now,
          },
        };
      } else if (backendStep === 'batch_done' && raw) {
        // Phase 2-2e: 배치 완료
        next.batches = {
          ...prev.batches,
          [raw.batch_idx]: {
            ...(prev.batches[raw.batch_idx] || {}),
            idx: raw.batch_idx,
            total: raw.batch_total,
            status: raw.batch_failed > 0 ? 'partial' : 'done',
            succeeded: raw.batch_succeeded,
            failed: raw.batch_failed,
            duration_ms: raw.batch_duration_ms,
            doneAt: now,
          },
        };
      } else if (backendStep === 'guardrail_running') {
        next.guardrailLive = { status: 'running' };
      } else if (backendStep === 'guardrail_done') {
        next.guardrailLive = {
          status: 'done',
          passed: raw.passed,
          failed_axes: raw.failed_axes || [],
        };
      } else if (backendStep === 'saving' && raw) {
        if (typeof raw.cost_usd === 'number') {
          next.liveCost = raw.cost_usd;
        }
        next.liveTokens = {
          input: raw.total_input_tokens || 0,
          output: raw.total_output_tokens || 0,
          cache_read: raw.cache_read_tokens || 0,
          cache_creation: raw.cache_creation_tokens || 0,
        };
      }

      return next;
    });
  }, [step, detail]);

  // 패널이 닫힌 후 다시 열리는 경우는 progress 초기화 (새 호출 시작)
  useEffect(() => {
    if (!open) {
      startedAtRef.current = null;
      setProgressState({
        sheets: {},
        sheetCount: 0,
        liveCost: null,
        liveTokens: null,
        guardrailLive: null,
        batchPlan: null,
        batches: {},
        history: [],
        startedAt: null,
      });
    }
  }, [open]);

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/*
              Phase 2-2g: Cancel 버튼 — chunked 모드에서만 표시.
              Cooperative cancellation: 클릭 즉시 cancel flag 만 설정,
              실제 batch 종료는 다음 체크포인트 (보통 5분 이내).
            */}
            {cancellable && onCancel && (
              <button
                onClick={onCancel}
                disabled={cancelling}
                style={{
                  background: cancelling ? '#fff' : '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12, fontWeight: 600,
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
                title={cancelling ? '취소 요청 처리 중...' : '진행 중인 AI 생성 취소 — 다음 체크포인트에서 종료'}
                aria-label="AI 생성 취소"
              >
                {cancelling ? '⏳ 취소 중...' : '⛔ 취소'}
              </button>
            )}
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none',
              fontSize: 22, fontWeight: 300,
              color: 'var(--c-text-muted)',
              cursor: 'pointer', width: 32, height: 32, borderRadius: 6,
            }} aria-label="닫기">×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <ProgressSection step={step} detail={detail} hasGenerator={!!generator} hasEvaluator={!!evaluator} />

          {/*
            Phase 2-2e: 배치 처리 진행 카드
            - 배치 계획이 도착했을 때만 표시 (단일 시트는 배치 없음)
            - 시트 진행 카드 위에 표시 (큰 그림 → 세부)
          */}
          {progressState.batchPlan && (
            <BatchProgressSection
              plan={progressState.batchPlan}
              batches={progressState.batches}
            />
          )}

          {/* Phase 2-2d: streaming 시트 진행 카드 */}
          {Object.keys(progressState.sheets).length > 0 && (
            <SheetProgressSection
              sheets={progressState.sheets}
              sheetCount={progressState.sheetCount}
              startedAt={progressState.startedAt}
            />
          )}

          {/* Phase 2-2d: 실시간 비용/토큰 (저장 단계에 들어왔을 때) */}
          {progressState.liveCost !== null && !generator && (
            <LiveCostSection
              cost={progressState.liveCost}
              tokens={progressState.liveTokens}
            />
          )}

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

// Phase 2-2d: streaming 단계 → 기존 4개 step row 매핑
//   - SHEET_START, SHEET_DONE, SHEET_FAILED, MERGING, SAVING => 'generating' 또는 'validating' 진행 중
// Phase 2-2e: BATCH_* 도 generating 활성으로 매핑
function mapStreamingStepToBase(step) {
  switch (step) {
    case AgentStep.GEN_SHEET_START:
    case AgentStep.GEN_SHEET_DONE:
    case AgentStep.GEN_SHEET_FAILED:
    case AgentStep.GEN_MERGING:
    case AgentStep.GEN_BATCH_PLAN:
    case AgentStep.GEN_BATCH_START:
    case AgentStep.GEN_BATCH_DONE:
      return AgentStep.GEN_GENERATING;
    case AgentStep.GEN_SAVING:
      // 저장은 가드레일 통과 후의 단계 — 구조 검증 이후이므로 VALIDATING 활성으로 보임
      return AgentStep.GEN_VALIDATING;
    default:
      return step;
  }
}

function ProgressSection({ step, detail, hasGenerator, hasEvaluator }) {
  // Phase 2-2d: streaming 단계는 4개 step row 중 적절한 것에 매핑
  const baseStep = mapStreamingStepToBase(step);

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
    const currentIndex = groupSteps.findIndex(s => s.id === baseStep);
    const stepIndex = groupSteps.findIndex(s => s.id === stepId);
    const isFailed = (group === 'gen' && baseStep === AgentStep.GEN_FAILED) ||
                     (group === 'eval' && baseStep === AgentStep.EVAL_FAILED);
    const isBlocked = baseStep === AgentStep.GEN_BLOCKED ||
                      baseStep === AgentStep.EVAL_REJECTED;
    const isWarning = baseStep === AgentStep.EVAL_NEEDS_REFINEMENT;

    // 우선 순위 1: 현재 활성 단계
    if (currentIndex === stepIndex && currentIndex >= 0) {
      if (isFailed) return 'failed';
      if (isBlocked) return 'blocked';
      if (isWarning) return 'warning';
      return 'active';
    }

    // 우선 순위 2: 현재 활성 단계 이전 단계 (완료됨)
    if (currentIndex >= 0 && stepIndex < currentIndex) return 'done';

    // 우선 순위 3: result 가 있으면 그룹 모두 완료로 표시
    // (페이지 새로고침 후 마지막 결과 로드된 경우)
    if (group === 'gen' && hasGenerator) return 'done';
    if (group === 'eval' && hasEvaluator) return 'done';

    // 우선 순위 4: 그 외 모두 pending
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

// ──────────────────────────────────────────────────
// Phase 2-2e: 배치 처리 진행 카드
// ──────────────────────────────────────────────────
// 큰 그림 (예: "배치 2/3 진행 중") 을 시트 카드 위에 표시.
// Anthropic Tier 1 rate limit 회피를 위해 백엔드가 BATCH_SIZE 씩 묶어서 처리하는 상황.
function BatchProgressSection({ plan, batches }) {
  if (!plan) return null;
  const batchList = Array.from({ length: plan.total_batches }, (_, i) => {
    const idx = i + 1;
    return batches[idx] || { idx, status: 'pending' };
  });
  const doneCount = batchList.filter(b => b.status === 'done' || b.status === 'partial').length;
  const runningCount = batchList.filter(b => b.status === 'running').length;
  const progressPercent = plan.total_batches > 0
    ? Math.round((doneCount / plan.total_batches) * 100)
    : 0;

  return (
    <Section title={`배치 처리 (${doneCount}/${plan.total_batches})`}>
      <div style={{
        fontSize: 11, color: 'var(--c-text-muted)',
        marginBottom: 10,
      }}>
        시트 {plan.total_sheets}개를 한 번에 <strong>{plan.batch_size}개씩</strong>{' '}
        {plan.total_batches}배치로 순차 처리 — Anthropic Tier 한도 회피
      </div>

      {/* 배치 progress bar */}
      <div style={{
        position: 'relative',
        height: 8,
        background: 'var(--c-bg-soft)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
      }}>
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${progressPercent}%`,
          background: '#3A4B8C',  // navy - 큰 그림용 색
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* 배치 칩 (Pill) 리스트 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        {batchList.map(b => (
          <BatchChip key={b.idx} batch={b} />
        ))}
      </div>
    </Section>
  );
}

function BatchChip({ batch }) {
  const statusStyle = {
    pending: { bg: 'var(--c-bg-soft)', border: 'var(--c-border)', color: 'var(--c-text-muted)', icon: '○' },
    running: { bg: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.4)', color: '#1D4ED8', icon: '⟳' },
    done: { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.4)', color: '#047857', icon: '✓' },
    partial: { bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.4)', color: '#B45309', icon: '⚠' },
  };
  const s = statusStyle[batch.status] || statusStyle.pending;

  return (
    <div
      title={
        batch.status === 'done' || batch.status === 'partial'
          ? `배치 ${batch.idx}: 성공 ${batch.succeeded}, 실패 ${batch.failed || 0}, ${Math.round((batch.duration_ms || 0) / 1000)}s`
          : batch.status === 'running'
            ? `배치 ${batch.idx}: 시트 ${batch.sheets_start_idx}~${batch.sheets_end_idx} 진행 중`
            : `배치 ${batch.idx}: 대기 중`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center', gap: 4,
        padding: '3px 8px',
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 12,
        fontSize: 10, fontWeight: 600,
        color: s.color,
        cursor: 'help',
      }}
    >
      <span style={batch.status === 'running' ? {
        display: 'inline-block',
        animation: 'spin 1.4s linear infinite',
      } : {}}>
        {s.icon}
      </span>
      배치 {batch.idx}
      {(batch.status === 'done' || batch.status === 'partial') && batch.succeeded !== undefined && (
        <span style={{ fontWeight: 400, opacity: 0.8 }}>
          · {batch.succeeded}{batch.failed > 0 ? `/${batch.failed}실패` : ''}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Phase 2-2d: 시트별 진행 카드 (streaming 전용)
// ──────────────────────────────────────────────────
function SheetProgressSection({ sheets, sheetCount, startedAt }) {
  const sheetList = Object.values(sheets).sort((a, b) => (a.idx || 0) - (b.idx || 0));
  const doneCount = sheetList.filter(s => s.status === 'done').length;
  const failedCount = sheetList.filter(s => s.status === 'failed').length;
  const totalCount = sheetCount || sheetList.length;
  const progressPercent = totalCount > 0
    ? Math.round((doneCount + failedCount) / totalCount * 100)
    : 0;

  // 경과 시간 (간이)
  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  return (
    <Section title={`시트 처리 (${doneCount + failedCount}/${totalCount})`}>
      {/* Progress bar */}
      <div style={{
        position: 'relative',
        height: 8,
        background: 'var(--c-bg-soft)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 14,
      }}>
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${progressPercent}%`,
          background: failedCount > 0 ? '#F59E0B' : '#10B981',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* 경과 시간 */}
      {elapsedSec > 0 && (
        <div style={{
          fontSize: 11,
          color: 'var(--c-text-muted)',
          marginBottom: 10,
        }}>
          ⏱ 경과 시간: {formatElapsed(elapsedSec)}
        </div>
      )}

      {/* 시트별 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sheetList.map(s => (
          <SheetCard key={s.idx} sheet={s} />
        ))}
      </div>
    </Section>
  );
}

function SheetCard({ sheet }) {
  const statusColor = {
    pending: { bg: 'var(--c-bg-soft)', border: 'var(--c-border)', icon: '⏳', label: '대기' },
    running: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.3)', icon: '⟳', label: '진행 중' },
    done: { bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.3)', icon: '✓', label: '완료' },
    failed: { bg: 'rgba(220, 38, 38, 0.06)', border: 'rgba(220, 38, 38, 0.3)', icon: '✗', label: '실패' },
  };
  const c = statusColor[sheet.status] || statusColor.pending;

  return (
    <div style={{
      padding: '10px 12px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 24, height: 24,
        borderRadius: '50%',
        background: '#fff',
        border: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
        flexShrink: 0,
      }}>
        {sheet.status === 'running' ? (
          <span style={{ animation: 'spin 1.4s linear infinite', display: 'inline-block' }}>{c.icon}</span>
        ) : c.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: 'var(--c-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          시트 {sheet.idx} · {sheet.name}
          {sheet.group && (
            <span style={{
              marginLeft: 6, fontSize: 10,
              color: 'var(--c-text-muted)',
              fontWeight: 500,
            }}>
              [{sheet.group}]
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>
          {sheet.status === 'done' && (
            <>
              {sheet.stk_count ?? 0}개 STK_REQ
              {' · '}
              {formatLatency(sheet.latency_ms)}
              {sheet.cache_hit && (
                <span style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  background: '#10B981',
                  color: '#fff',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 700,
                }}>
                  ✓ CACHE HIT
                </span>
              )}
            </>
          )}
          {sheet.status === 'running' && '처리 중…'}
          {sheet.status === 'pending' && '대기 중'}
          {sheet.status === 'failed' && (
            <span style={{ color: '#B91C1C' }}>
              {sheet.error?.slice(0, 80) || '실패'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Phase 2-2d: 실시간 비용/토큰 표시 (저장 단계 전)
// ──────────────────────────────────────────────────
function LiveCostSection({ cost, tokens }) {
  return (
    <Section title="실시간 비용">
      <div style={{
        padding: '12px 14px',
        background: 'rgba(59, 130, 246, 0.05)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>
          ${(cost || 0).toFixed(4)}
        </div>
        {tokens && (
          <div style={{
            fontSize: 11,
            color: 'var(--c-text-muted)',
            marginTop: 6,
            display: 'flex', flexWrap: 'wrap', gap: 12,
          }}>
            <span>입력: {tokens.input?.toLocaleString() || 0}</span>
            <span>출력: {tokens.output?.toLocaleString() || 0}</span>
            {tokens.cache_read > 0 && (
              <span style={{ color: '#059669' }}>
                ✓ 캐시 읽음: {tokens.cache_read.toLocaleString()}
              </span>
            )}
            {tokens.cache_creation > 0 && (
              <span>캐시 저장: {tokens.cache_creation.toLocaleString()}</span>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// 보조: 경과 시간 포맷 (초 -> "1m 23s")
function formatElapsed(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatLatency(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
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

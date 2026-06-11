// ──────────────────────────────────────────────────
// api/remediate.js — QA 시정조치 (Remediation) 엔드포인트
// ──────────────────────────────────────────────────
//
// Phase 3-1 (첫 구현 범위 (a)): MEDIUM 모호표현 등 항목 단위 표적 수정
//   - 전체 재생성이 아닌 "이슈가 걸린 STK_REQ 항목만" Claude 에 보내 수정안 생성
//   - HITL 유지: AI 수정안은 'proposed' 로 저장 → 사람이 승인 → 'applied' 시 리비전 생성
//   - SUP.1/SUP.10 심사 증빙: 모든 변경이 remediation_changes 테이블에
//     {수정자, 대상 ID, 전/후, 연결 이슈, 사유, 시각} 형식으로 기록됨
//
// 전체 흐름:
//   생성 → QA(evaluate) → [시정조치: 본 엔드포인트] → 재QA → 승인
//
// 3가지 action (POST body 의 action 필드로 구분):
//   1. propose : 선택 이슈 → Claude 표적 수정 → remediation_changes 에 proposed 저장 + diff 반환
//   2. decide  : 수정안 승인/거절 (proposed → approved | rejected)
//   3. apply   : approved 수정안을 반영한 리비전 생성
//                (ai_generations 에 agent_role='remediator' 새 row, 원본 불변)
//
// GET ?generation_id=<base id> : 해당 base 의 변경 기록 목록 (diff 화면용)
//
// 리비전 구조:
//   - AI 원본 (master 의 parsed_output) 은 절대 수정하지 않음 (불변)
//   - 리비전 = ai_generations 새 row:
//       agent_role='remediator', parent_generation_id=base id,
//       attempt_number=revision_no (v2=1, v3=2...), parsed_output=수정 반영된 전체 출력
//   - 재QA: 리비전의 parsed_output 을 그대로 /api/evaluate 에 전송
//           (ai_generation_id 에 리비전 id 를 넣으면 evaluator 가 리비전을 parent 로 가리킴)
//
// 비용: propose 1회 ~$0.05-0.3 (이슈 개수에 비례, Opus 표적 호출)
// ──────────────────────────────────────────────────

import {
  sb,
  callClaude,
  estimateCost,
  MODEL,
  PROVIDER,
} from './generate.js';

// ──────────────────────────────────────────────────
// 편집 가능 / 보호 필드 정의
// ──────────────────────────────────────────────────
// 보호 필드는 추적성(traceability) 의 근간 — AI 수정안이 무엇을 반환하든
// 서버에서 원본 값을 강제 유지한다 (스키마로도 막고, 코드로도 한 번 더 막음).
const EDITABLE_FIELDS = [
  'statement',
  'rationale',
  'category',
  'priority',
  'verification_method',
  'clarification_needed',
];
const PROTECTED_FIELDS = [
  'id',
  'group',
  'sheet_source',
  'source_row',
  'source_item_id',
  'source_doc',
];

// ──────────────────────────────────────────────────
// Claude 표적 수정 출력 스키마 (Structured Outputs)
// ──────────────────────────────────────────────────
// 편집 가능 필드만 받는다. 보호 필드는 스키마에서 아예 제외 → Claude 가
// 건드릴 방법 자체가 없음.
const REMEDIATION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target_id: { type: 'string' },       // 수정 대상 STK_REQ ID (원본 그대로)
          issue_index: { type: 'integer' },    // 연결된 이슈 인덱스 (입력에서 부여한 번호)
          revised: {
            type: 'object',
            properties: {
              statement: { type: 'string' },
              rationale: { type: 'string' },
              category: {
                type: 'string',
                enum: ['functional', 'non_functional', 'interface', 'constraint'],
              },
              priority: { type: 'string', enum: ['must', 'should', 'could'] },
              verification_method: {
                type: 'string',
                enum: ['test', 'analysis', 'inspection', 'demonstration'],
              },
              clarification_needed: { type: 'boolean' },
            },
            required: [
              'statement', 'rationale', 'category',
              'priority', 'verification_method', 'clarification_needed',
            ],
            additionalProperties: false,
          },
          reason: { type: 'string' },           // 수정 사유 (한글) — 심사 증빙에 그대로 기록
        },
        required: ['target_id', 'issue_index', 'revised', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['fixes'],
  additionalProperties: false,
};

// ──────────────────────────────────────────────────
// 시정조치 전용 시스템 프롬프트
// ──────────────────────────────────────────────────
function composeRemediationPrompt(processId) {
  return `You are an ASPICE ${processId} requirements remediation specialist working for an automotive supplier.

An independent QA reviewer (ASPICE PAM v4.0 기반) has flagged specific issues in individual stakeholder requirements (STK_REQ). Your job is to perform TARGETED fixes — revise ONLY the flagged items, addressing ONLY the flagged issues.

═══════════════════════════════════════════════════
## 핵심 원칙 (Core Rules)
═══════════════════════════════════════════════════

1. **표적 수정만 (Targeted fix only)**
   - 지적된 문제만 고친다. 문제없는 부분은 원문 표현을 최대한 보존한다.
   - 요구사항의 의미·범위·기술 사양을 임의로 바꾸지 않는다.

2. **스펙 날조 절대 금지 (No spec invention / hallucination)**
   - 원문에 없는 수치, 규격, 조건을 만들어내지 않는다.
   - 모호 표현(예: 'sufficient space', 'upgrades')을 정량화할 근거가
     원문(statement/rationale/source 정보)에 **있으면** 그 근거로 정량화한다.
   - 근거가 **없으면** 날조하지 말고:
     a) 문장을 검증 가능한 형태로 재구성하되 미확정 값은
        "[TBD: 고객 확인 필요 — <무엇을 확인해야 하는지>]" 형식으로 명시하고,
     b) clarification_needed 를 true 로 설정한다.

3. **ASPICE SYS.1 품질 기준 (PAM v4.0)**
   - 명확성: 모호한 형용사/부사 제거, 측정·검증 가능한 표현 사용
   - 일관성: 같은 묶음(variant)의 다른 항목과 분해 수준·용어 일치
   - 검증 가능성: verification_method 로 실제 확인 가능한 문장 구조
   - 절대 표현 주의: 'not contain ANY publicly known vulnerabilities' 같은
     검증 불가능한 절대 표현은 기준 시점/기준 DB(예: CVE as of milestone)를
     명시하는 형태로 재구성 (단, 기준 자체를 날조하지 말고 TBD 규칙 적용)

4. **언어와 문체 (Language & Style)**
   - statement / rationale: 원문 언어 유지 (영문이면 영문)
   - reason (수정 사유): 반드시 한국어 — 심사 증빙 문서에 그대로 들어감
   - **rationale 에 보충 설명을 추가할 때는 공식 문서의 완결된 서술문으로 통합**한다.
     괄호로 덧붙이는 개발 메모 스타일 — 예: "(고객 원본에 ID 없음 - 내부 식별자 부여)" —
     은 평가자가 '내부 개발 코멘트'로 지적하므로 금지.
     올바른 예: "고객 원본 문서에는 명시적 요구사항 식별자가 부여되어 있지 않으므로,
     본 요구사항은 내부 식별자 체계에 따라 ID 를 부여하고 source_doc, sheet_source,
     source_row 의 조합으로 원본 추적성을 확보한다."

5. **출력 (Output)**
   - 입력으로 받은 모든 대상 항목에 대해 fixes 배열에 1건씩 반환
   - target_id 와 issue_index 는 입력 값을 그대로 복사 (변경 금지)
   - 수정이 불필요하다고 판단되면 revised 에 원문 값을 그대로 넣고
     reason 에 "수정 불필요: <근거>" 라고 쓴다 (항목 누락 금지)

Respond ONLY with a valid JSON object matching the provided schema.`;
}

// ──────────────────────────────────────────────────
// 시정조치 user prompt 구성
// ──────────────────────────────────────────────────
// targets: [{ issueIndex, issue, item, siblings }]
function buildRemediationUserPrompt(processId, targets) {
  const lines = [];
  lines.push(`# Remediation Request — ${processId}`);
  lines.push('');
  lines.push(`아래 ${targets.length}개 항목을 각각의 연결 이슈에 따라 표적 수정하시오.`);
  lines.push('');

  targets.forEach((t, i) => {
    lines.push(`## Target ${i + 1}`);
    lines.push(`- target_id: ${t.item.id}`);
    lines.push(`- issue_index: ${t.issueIndex}`);
    lines.push('');
    lines.push(`### QA 이슈 (Evaluator 지적사항)`);
    lines.push(`- severity: ${t.issue.severity}`);
    lines.push(`- category: ${t.issue.category}`);
    lines.push(`- issue: ${t.issue.issue}`);
    if (t.issue.evidence) lines.push(`- evidence: ${t.issue.evidence}`);
    if (t.issue.suggested_fix) lines.push(`- suggested_fix: ${t.issue.suggested_fix}`);
    lines.push('');
    lines.push(`### 수정 대상 항목 (원문)`);
    lines.push('```json');
    lines.push(JSON.stringify(t.item, null, 2));
    lines.push('```');
    if (t.siblings && t.siblings.length > 0) {
      lines.push('');
      lines.push(`### 같은 그룹의 인접 항목 (문체·분해 수준 참고용 — 수정 대상 아님)`);
      lines.push('```json');
      lines.push(JSON.stringify(t.siblings, null, 2));
      lines.push('```');
    }
    lines.push('');
  });

  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// 헬퍼: STK_REQ 항목 인덱스 맵 구성
// ──────────────────────────────────────────────────
function indexStkReqs(parsedOutput) {
  const list = parsedOutput?.stakeholder_requirements;
  if (!Array.isArray(list)) {
    throw new Error('base generation 의 parsed_output 에 stakeholder_requirements 배열이 없습니다');
  }
  const byId = new Map();
  list.forEach((item, idx) => byId.set(item.id, { item, idx }));
  return { list, byId };
}

// 같은 group 의 인접 항목 최대 2건 (문체 참고용, 토큰 절약 위해 statement 중심 축약)
function pickSiblings(list, idx, group) {
  const out = [];
  for (let d = 1; d <= 10 && out.length < 2; d++) {
    for (const j of [idx - d, idx + d]) {
      if (out.length >= 2) break;
      const cand = list[j];
      if (cand && cand.group === group) {
        out.push({ id: cand.id, statement: cand.statement, priority: cand.priority });
      }
    }
  }
  return out;
}

// 다음 리비전 번호: 같은 work_product 에 이미 존재하는 remediator row 수 + 1
async function nextRevisionNo(workProductId) {
  if (!workProductId) return 1;
  const rows = await sb(
    `/ai_generations?work_product_id=eq.${workProductId}` +
    `&agent_role=eq.remediator&select=id`
  ) || [];
  return rows.length + 1;
}

// ──────────────────────────────────────────────────
// coverage_matrix 결정론적 보정 (v2 — 0611-1 재QA CRITICAL 대응)
// ──────────────────────────────────────────────────
// 평가자 지적: 메타/비요구사항 행이 input_rows 에 포함되어 ratio < 1.0 → spec_loss.
// 평가자 제안: 해당 행을 input_rows 계산에서 제외하고 제외 사실을 문서화.
// 이 작업은 순수 산술 + 문서화라 Claude 를 부르지 않고 서버에서 결정론적으로
// 수행한다 (날조 위험 0, 비용 0). 어떤 행이 비요구사항인지의 '판단'은
// 사람(또는 평가자 evidence)이 제공 → actor='human' 으로 기록, HITL 승인 동일.
function recomputeCoverageSummary(cm) {
  let totalInputRows = 0;
  let totalStkReqs = 0;
  for (const g of cm.by_group) {
    totalInputRows += g.input_rows || 0;
    totalStkReqs += g.derived_stk_reqs || 0;
  }
  cm.summary.total_input_rows = totalInputRows;
  cm.summary.total_stk_reqs = totalStkReqs;
  const ratio = totalInputRows > 0 ? totalStkReqs / totalInputRows : 0;
  cm.summary.overall_ratio = Math.round(ratio * 1000) / 1000;
  // generate.js mergePerSheetOutputs 와 동일한 status 산식
  if (totalInputRows === 0) cm.summary.status = 'compliant';
  else if (ratio < 1.0) cm.summary.status = 'spec_loss';
  else if (ratio > 1.3) cm.summary.status = 'over_decomposed';
  else cm.summary.status = 'compliant';
  return cm;
}

function buildCoverageFix(baseCoverageMatrix, fix) {
  const { group, exclude_rows, exclusion_reason } = fix;
  if (!group || !Array.isArray(exclude_rows) || exclude_rows.length === 0) {
    throw new Error('coverage_fix 에는 group 과 exclude_rows 배열이 필요합니다');
  }
  const before = JSON.parse(JSON.stringify(baseCoverageMatrix));
  const after = JSON.parse(JSON.stringify(baseCoverageMatrix));
  const g = after.by_group.find(x => x.group === group);
  if (!g) {
    throw new Error(
      `coverage_matrix.by_group 에 group '${group}' 이 없습니다 ` +
      `(존재: ${after.by_group.map(x => x.group).join(', ')})`
    );
  }
  // 안전장치: 제외 대상 행은 반드시 현재 unmapped_input_rows 에 있어야 함
  // (이미 STK_REQ 로 도출된 행을 제외하면 ratio 가 허위로 부풀려짐)
  const unmapped = new Set(g.unmapped_input_rows || []);
  const notUnmapped = exclude_rows.filter(r => !unmapped.has(r));
  if (notUnmapped.length > 0) {
    throw new Error(
      `행 ${notUnmapped.join(', ')} 은(는) unmapped_input_rows 에 없습니다 — ` +
      `이미 도출된 행은 제외할 수 없습니다 (허위 비율 방지)`
    );
  }
  g.input_rows = g.input_rows - exclude_rows.length;
  g.unmapped_input_rows = (g.unmapped_input_rows || []).filter(r => !exclude_rows.includes(r));
  g.ratio = g.input_rows > 0
    ? Math.round(((g.derived_stk_reqs || 0) / g.input_rows) * 1000) / 1000
    : 0;
  // 제외 사실 문서화 (평가자 제안 그대로 — 심사 증빙)
  g.excluded_non_requirement_rows = [
    ...(g.excluded_non_requirement_rows || []),
    ...exclude_rows,
  ];
  g.exclusion_reason = exclusion_reason ||
    '비요구사항(메타/N-A) 행으로 확인되어 input_rows 계산에서 제외';
  recomputeCoverageSummary(after);
  return { before, after, group: g };
}

// ──────────────────────────────────────────────────
// action: propose — 선택 이슈에 대해 AI 수정안 생성
// ──────────────────────────────────────────────────
// body: {
//   action: 'propose',
//   generation_id: '<base generation id (master 또는 이전 리비전)>',
//   evaluation_id: '<evaluator row id>'  (선택 — 없으면 base 의 최신 success evaluator),
//   selections: [
//     { issue_index: 2 },                                  // issue.target_id 사용
//     { issue_index: 5, target_ids: ['STK_REQ_IFNADSYSTEM_328', ...] }  // 동일 패턴 확장
//   ]
// }
async function handlePropose(req, res, body) {
  const { generation_id, evaluation_id, selections } = body;

  if (!generation_id || !Array.isArray(selections) || selections.length === 0) {
    return res.status(400).json({ error: 'generation_id 와 selections 배열이 필요합니다' });
  }

  // 1. base generation 조회 (master 또는 이전 리비전)
  const [base] = await sb(
    `/ai_generations?id=eq.${generation_id}` +
    `&select=id,project_id,process_id,work_product_id,agent_role,parsed_output,status`
  ) || [];
  if (!base) return res.status(404).json({ error: `generation ${generation_id} 을 찾을 수 없습니다` });
  if (!['generator', 'remediator'].includes(base.agent_role)) {
    return res.status(400).json({
      error: `base generation 의 agent_role 이 '${base.agent_role}' 입니다. ` +
             `generator(원본) 또는 remediator(리비전) row 의 id 를 전달하세요`,
    });
  }

  const { list, byId } = indexStkReqs(base.parsed_output);

  // 2. evaluator critique 조회
  let evaluation;
  if (evaluation_id) {
    [evaluation] = await sb(
      `/ai_generations?id=eq.${evaluation_id}&select=id,parsed_output,agent_role,status`
    ) || [];
  } else {
    // base 를 parent 로 가리키는 최신 success evaluator
    [evaluation] = await sb(
      `/ai_generations?parent_generation_id=eq.${generation_id}` +
      `&agent_role=eq.evaluator&status=eq.success` +
      `&select=id,parsed_output,agent_role,status` +
      `&order=created_at.desc&limit=1`
    ) || [];
    // v2 fallback: 프론트가 evaluate 호출 시 child id 를 parent 로 넘기는 경우가
    // 있어 (0611-1 에서 확인) base 직계에 없으면 같은 work_product 의 최신
    // success evaluator 를 사용
    if (!evaluation && base.work_product_id) {
      [evaluation] = await sb(
        `/ai_generations?work_product_id=eq.${base.work_product_id}` +
        `&agent_role=eq.evaluator&status=eq.success` +
        `&select=id,parsed_output,agent_role,status` +
        `&order=created_at.desc&limit=1`
      ) || [];
      if (evaluation) {
        console.log(`[remediate] evaluator fallback: work_product 기준 최신 사용 (${evaluation.id})`);
      }
    }
  }
  if (!evaluation || evaluation.agent_role !== 'evaluator') {
    return res.status(404).json({
      error: 'evaluator critique 를 찾을 수 없습니다. evaluation_id 를 직접 전달하거나, ' +
             '해당 generation 에 대해 QA(evaluate) 를 먼저 실행하세요',
    });
  }
  const issues = evaluation.parsed_output?.issues || [];

  // 3. selections → targets 전개
  // v2: coverage_fix 가 있는 selection 은 결정론적 coverage 보정으로 분리 처리
  const targets = [];
  const coverageFixes = [];
  const skipped = [];
  for (const sel of selections) {
    const issue = issues[sel.issue_index];
    if (!issue) {
      skipped.push({ selection: sel, reason: `issue_index ${sel.issue_index} 가 critique 에 없음 (0~${issues.length - 1})` });
      continue;
    }
    // v2: coverage_matrix 보정 (Claude 호출 없음 — 산술 + 문서화)
    if (sel.coverage_fix) {
      try {
        const built = buildCoverageFix(base.parsed_output.coverage_matrix, sel.coverage_fix);
        coverageFixes.push({ issueIndex: sel.issue_index, issue, built, fix: sel.coverage_fix });
      } catch (e) {
        skipped.push({ selection: sel, reason: `coverage_fix 실패: ${e.message}` });
      }
      continue;
    }
    // (a) 범위: 항목 단위 수정. coverage_matrix 등 비항목 대상은 coverage_fix 로 처리
    const targetIds = Array.isArray(sel.target_ids) && sel.target_ids.length > 0
      ? sel.target_ids
      : [issue.target_id];
    for (const tid of targetIds) {
      if (!tid || !byId.has(tid)) {
        skipped.push({
          selection: { issue_index: sel.issue_index, target_id: tid },
          reason: tid === 'coverage_matrix' || !tid
            ? '항목 단위 대상이 아님 — coverage_matrix 이슈는 selection 에 coverage_fix: {group, exclude_rows, exclusion_reason} 를 넣어 요청하세요'
            : `STK_REQ ID '${tid}' 가 parsed_output 에 없음`,
        });
        continue;
      }
      const { item, idx } = byId.get(tid);
      targets.push({
        issueIndex: sel.issue_index,
        issue,
        item,
        siblings: pickSiblings(list, idx, item.group),
      });
    }
  }

  if (targets.length === 0 && coverageFixes.length === 0) {
    return res.status(400).json({ error: '유효한 수정 대상이 없습니다', skipped });
  }

  // 4. Claude 표적 수정 호출 (1회 배치) — 항목 대상이 있을 때만
  //    (coverage_fix 만 있으면 Claude 호출 없음: 비용 0)
  let proposalGenId = null;
  let claudeResult = null;
  let cost = 0;
  if (targets.length > 0) {
    const systemPrompt = composeRemediationPrompt(base.process_id);
    const userPrompt = buildRemediationUserPrompt(base.process_id, targets);

    // LLM 호출 자체도 ai_generations 에 기록 (비용/감사 추적)
    // agent_role='remediation_proposal' — 리비전 스냅샷(remediator)과 구분
    const [created] = await sb('/ai_generations', 'POST', {
      project_id: base.project_id,
      process_id: base.process_id,
      work_product_id: base.work_product_id,
      agent_role: 'remediation_proposal',
      agent_step: 3,
      model: MODEL,
      provider: PROVIDER,
      system_prompt: systemPrompt.slice(0, 50000),
      user_prompt: userPrompt.slice(0, 50000),
      parent_generation_id: generation_id,
      status: 'pending',
    }, 'return=representation') || [];
    proposalGenId = created?.id;

    try {
      claudeResult = await callClaude({
        systemPrompt,
        userPrompt,
        schema: REMEDIATION_OUTPUT_SCHEMA,
      });
    } catch (error) {
      if (proposalGenId) {
        await sb(`/ai_generations?id=eq.${proposalGenId}`, 'PATCH', {
          status: 'failed',
          error_message: error.message?.slice(0, 1000),
        }).catch(() => {});
      }
      throw error;
    }

    cost = estimateCost(
      claudeResult.inputTokens,
      claudeResult.outputTokens,
      claudeResult.cacheCreationTokens,
      claudeResult.cacheReadTokens
    );
    if (proposalGenId) {
      await sb(`/ai_generations?id=eq.${proposalGenId}`, 'PATCH', {
        raw_output: claudeResult.rawOutput.slice(0, 100000),
        parsed_output: claudeResult.parsedOutput,
        finish_reason: claudeResult.finishReason,
        input_tokens: claudeResult.inputTokens,
        output_tokens: claudeResult.outputTokens,
        cost_usd: cost,
        latency_ms: claudeResult.latencyMs,
        status: 'success',
      }).catch(e => console.warn('[remediate] proposal row update failed:', e.message));
    }
  }

  // 5. 수정안 → remediation_changes (status='proposed') 저장
  //    보호 필드 강제: revised 의 편집 가능 필드만 원본 위에 덮어씀
  const revisionNo = await nextRevisionNo(base.work_product_id);
  const fixes = claudeResult?.parsedOutput?.fixes || [];
  const changes = [];
  const diffs = [];

  // 5-a. coverage 보정 (결정론적, actor='human' — 제외 판단은 사람/평가자 evidence)
  for (const cf of coverageFixes) {
    changes.push({
      project_id: base.project_id,
      work_product_id: base.work_product_id,
      base_generation_id: base.id,
      revision_no: revisionNo,
      actor: 'human',
      target_stk_req_id: `coverage_matrix:${cf.fix.group}`,
      issue_ref: {
        index: cf.issueIndex,
        severity: cf.issue.severity,
        category: cf.issue.category,
        issue: cf.issue.issue,
      },
      before_item: cf.built.before,
      after_item: cf.built.after,
      reason:
        `비요구사항 행 ${cf.fix.exclude_rows.join(', ')} 을(를) input_rows 계산에서 제외 ` +
        `(${cf.built.group.exclusion_reason}). ` +
        `그룹 ratio ${cf.built.before.by_group.find(g => g.group === cf.fix.group)?.ratio} → ${cf.built.group.ratio}, ` +
        `전체 status ${cf.built.before.summary.status} → ${cf.built.after.summary.status}`,
      status: 'proposed',
    });
    diffs.push({
      target_stk_req_id: `coverage_matrix:${cf.fix.group}`,
      issue_index: cf.issueIndex,
      reason: changes[changes.length - 1].reason,
      changed_fields: ['coverage_matrix'],
      before: {
        group_ratio: cf.built.before.by_group.find(g => g.group === cf.fix.group)?.ratio,
        unmapped: cf.built.before.by_group.find(g => g.group === cf.fix.group)?.unmapped_input_rows,
        summary: cf.built.before.summary,
      },
      after: {
        group_ratio: cf.built.group.ratio,
        unmapped: cf.built.group.unmapped_input_rows,
        excluded_non_requirement_rows: cf.built.group.excluded_non_requirement_rows,
        summary: cf.built.after.summary,
      },
    });
  }

  // 5-b. Claude 항목 수정안
  for (const fix of fixes) {
    const entry = byId.get(fix.target_id);
    if (!entry) {
      console.warn(`[remediate] Claude 가 알 수 없는 target_id 반환: ${fix.target_id} — 무시`);
      continue;
    }
    const before = entry.item;
    const after = { ...before };
    for (const f of EDITABLE_FIELDS) {
      if (fix.revised[f] !== undefined) after[f] = fix.revised[f];
    }
    // 보호 필드는 before 값이 이미 유지됨 (스키마 차단 + 여기서 한 번 더 보장)
    for (const f of PROTECTED_FIELDS) after[f] = before[f];

    const issue = issues[fix.issue_index] || null;
    changes.push({
      project_id: base.project_id,
      work_product_id: base.work_product_id,
      base_generation_id: base.id,
      revision_no: revisionNo,
      actor: 'ai',
      target_stk_req_id: fix.target_id,
      issue_ref: issue
        ? { index: fix.issue_index, severity: issue.severity, category: issue.category, issue: issue.issue }
        : { index: fix.issue_index },
      before_item: before,
      after_item: after,
      reason: fix.reason,
      status: 'proposed',
    });

    // diff 화면용 응답 (변경된 필드만 추려서)
    const changedFields = EDITABLE_FIELDS.filter(
      f => JSON.stringify(before[f]) !== JSON.stringify(after[f])
    );
    diffs.push({
      target_stk_req_id: fix.target_id,
      issue_index: fix.issue_index,
      reason: fix.reason,
      changed_fields: changedFields,
      before: Object.fromEntries(changedFields.map(f => [f, before[f]])),
      after: Object.fromEntries(changedFields.map(f => [f, after[f]])),
    });
  }

  let savedChanges = [];
  if (changes.length > 0) {
    savedChanges = await sb('/remediation_changes', 'POST', changes, 'return=representation') || [];
  }

  // diff 응답에 change_id 매핑 (저장 순서 = 입력 순서)
  savedChanges.forEach((row, i) => { if (diffs[i]) diffs[i].change_id = row.id; });

  return res.status(200).json({
    success: true,
    action: 'propose',
    base_generation_id: base.id,
    evaluation_id: evaluation.id,
    revision_no: revisionNo,
    proposal_generation_id: proposalGenId,
    proposed_count: savedChanges.length,
    skipped,
    diffs,
    meta: {
      model: claudeResult ? MODEL : null,
      claude_called: !!claudeResult,
      coverage_fixes: coverageFixes.length,
      input_tokens: claudeResult?.inputTokens || 0,
      output_tokens: claudeResult?.outputTokens || 0,
      cost_usd: cost,
      latency_ms: claudeResult?.latencyMs || 0,
    },
  });
}

// ──────────────────────────────────────────────────
// action: decide — 수정안 승인/거절 (HITL)
// ──────────────────────────────────────────────────
// body: { action: 'decide', change_ids: ['uuid', ...], decision: 'approved' | 'rejected' }
async function handleDecide(req, res, body) {
  const { change_ids, decision } = body;
  if (!Array.isArray(change_ids) || change_ids.length === 0) {
    return res.status(400).json({ error: 'change_ids 배열이 필요합니다' });
  }
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision 은 'approved' 또는 'rejected' 여야 합니다" });
  }

  const idList = change_ids.join(',');
  const updated = await sb(
    `/remediation_changes?id=in.(${idList})&status=eq.proposed`,
    'PATCH',
    { status: decision, decided_at: new Date().toISOString() },
    'return=representation'
  ) || [];

  return res.status(200).json({
    success: true,
    action: 'decide',
    decision,
    requested: change_ids.length,
    updated: updated.length,
    // proposed 상태가 아니어서 건너뛴 건수 (이미 승인/반영된 것은 변경 불가)
    skipped: change_ids.length - updated.length,
    change_ids: updated.map(r => r.id),
  });
}

// ──────────────────────────────────────────────────
// action: apply — 승인된 수정안을 반영한 리비전 생성
// ──────────────────────────────────────────────────
// body: { action: 'apply', generation_id: '<base generation id>' }
async function handleApply(req, res, body) {
  const { generation_id } = body;
  if (!generation_id) {
    return res.status(400).json({ error: 'generation_id 가 필요합니다' });
  }

  // 1. base generation
  const [base] = await sb(
    `/ai_generations?id=eq.${generation_id}` +
    `&select=id,project_id,process_id,work_product_id,agent_role,parsed_output`
  ) || [];
  if (!base) return res.status(404).json({ error: `generation ${generation_id} 을 찾을 수 없습니다` });

  // 2. 승인된 수정안 수집
  const approved = await sb(
    `/remediation_changes?base_generation_id=eq.${generation_id}` +
    `&status=eq.approved&order=created_at.asc`
  ) || [];
  if (approved.length === 0) {
    return res.status(400).json({
      error: '승인(approved) 상태의 수정안이 없습니다. decide 로 먼저 승인하세요',
    });
  }

  // 3. parsed_output 깊은 복사 후 항목 치환 (원본 불변)
  const revised = JSON.parse(JSON.stringify(base.parsed_output));
  const { byId } = indexStkReqs(revised);
  let appliedCount = 0;
  const notFound = [];
  for (const ch of approved) {
    // v2: coverage_matrix 변경 — 항목 치환이 아니라 coverage_matrix 전체 교체
    if (String(ch.target_stk_req_id).startsWith('coverage_matrix')) {
      revised.coverage_matrix = ch.after_item;
      appliedCount++;
      continue;
    }
    const entry = byId.get(ch.target_stk_req_id);
    if (!entry) {
      notFound.push(ch.target_stk_req_id);
      continue;
    }
    // 같은 항목에 수정안이 여러 건이면 created_at 순서대로 누적 적용
    Object.assign(entry.item, ch.after_item);
    // 보호 필드 재보장
    for (const f of PROTECTED_FIELDS) {
      entry.item[f] = base.parsed_output.stakeholder_requirements[entry.idx][f];
    }
    appliedCount++;
  }

  // 4. 리비전 메타 기록 (parsed_output 내부 — docx/재QA 시 추적 가능)
  const revisionNo = approved[0].revision_no || await nextRevisionNo(base.work_product_id);
  if (!Array.isArray(revised.remediation_history)) revised.remediation_history = [];
  revised.remediation_history.push({
    revision_no: revisionNo,
    base_generation_id: base.id,
    applied_change_count: appliedCount,
    applied_at: new Date().toISOString(),
    actors: [...new Set(approved.map(c => c.actor))],
  });

  // 5. 리비전 스냅샷 row 생성 (agent_role='remediator')
  //    LLM 호출이 아닌 내부 반영 작업이므로 model/provider 는 internal 표기
  const [revRow] = await sb('/ai_generations', 'POST', {
    project_id: base.project_id,
    process_id: base.process_id,
    work_product_id: base.work_product_id,
    agent_role: 'remediator',
    agent_step: 3,
    model: 'revision-snapshot',
    provider: 'internal',
    parsed_output: revised,
    parent_generation_id: base.id,
    attempt_number: revisionNo,
    status: 'success',
  }, 'return=representation') || [];
  if (!revRow?.id) {
    throw new Error('리비전 row 생성 실패 (ai_generations INSERT 가 id 를 반환하지 않음)');
  }

  // 6. 변경 기록 → applied 전환 + 리비전 연결
  await sb(
    `/remediation_changes?base_generation_id=eq.${generation_id}&status=eq.approved`,
    'PATCH',
    { status: 'applied', revision_generation_id: revRow.id }
  );

  // 7. state_transitions (상태는 유지, 시정조치 이벤트만 기록 — 심사 추적용)
  if (base.work_product_id) {
    const [wp] = await sb(
      `/work_products?id=eq.${base.work_product_id}&select=state`
    ) || [];
    const curState = wp?.state || 'GENERATED';
    await sb('/state_transitions', 'POST', {
      work_product_id: base.work_product_id,
      from_state: curState,
      to_state: curState,
      trigger: 'remediation_applied',
      reason: `시정조치 v${revisionNo + 1} 반영: ${appliedCount}건 ` +
              `(${approved.filter(c => c.actor === 'ai').length} AI / ` +
              `${approved.filter(c => c.actor === 'human').length} 사람)`,
      ai_generation_id: revRow.id,
    }, 'return=minimal').catch(e => {
      console.warn('[remediate] state_transitions insert failed:', e.message);
    });
  }

  // 8. audit log
  await sb('/audit_logs', 'POST', {
    action: 'remediation_apply',
    resource_type: 'work_product',
    resource_id: base.work_product_id,
    project_id: base.project_id,
    details: {
      process_id: base.process_id,
      base_generation_id: base.id,
      revision_generation_id: revRow.id,
      revision_no: revisionNo,
      applied_change_count: appliedCount,
      not_found_targets: notFound,
    },
  }, 'return=minimal').catch(e => {
    console.warn('[remediate] audit_logs insert failed:', e.message);
  });

  console.log(
    `[remediate] Revision created: base=${base.id} → revision=${revRow.id} ` +
    `(v${revisionNo + 1}, ${appliedCount} changes applied)`
  );

  return res.status(200).json({
    success: true,
    action: 'apply',
    base_generation_id: base.id,
    revision_generation_id: revRow.id,
    revision_no: revisionNo,
    applied_count: appliedCount,
    not_found_targets: notFound,
    stk_req_count: revised.stakeholder_requirements?.length || 0,
    // 재QA 안내: 이 parsed_output 을 /api/evaluate 에
    // { generated_output, process_id, project_id, work_product_id,
    //   ai_generation_id: revision_generation_id } 로 전송
  });
}

// ──────────────────────────────────────────────────
// GET — 변경 기록 목록 (diff 화면/심사 증빙 조회용)
// ──────────────────────────────────────────────────
async function handleList(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const generationId = url.searchParams.get('generation_id');
  const status = url.searchParams.get('status'); // 선택 필터
  if (!generationId) {
    return res.status(400).json({ error: 'generation_id 쿼리 파라미터가 필요합니다' });
  }
  let path = `/remediation_changes?base_generation_id=eq.${generationId}&order=created_at.asc`;
  if (status) path += `&status=eq.${status}`;
  const rows = await sb(path) || [];
  return res.status(200).json({ success: true, count: rows.length, changes: rows });
}

// ──────────────────────────────────────────────────
// 핸들러
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS (기존 엔드포인트와 동일하게 동일 출처 사용이므로 최소 처리)
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      return await handleList(req, res);
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'GET 또는 POST 만 지원합니다' });
    }

    const body = req.body || {};
    const action = body.action || 'propose';

    if (action === 'propose') return await handlePropose(req, res, body);
    if (action === 'decide')  return await handleDecide(req, res, body);
    if (action === 'apply')   return await handleApply(req, res, body);

    return res.status(400).json({
      error: `알 수 없는 action: '${action}' (propose | decide | apply)`,
    });
  } catch (error) {
    console.error('[remediate]', error);
    return res.status(500).json({ error: error.message });
  }
}

// Vercel 함수 maxDuration — Opus 표적 호출 여유 (이슈 다건 배치 대비)
export const config = {
  maxDuration: 300,
};

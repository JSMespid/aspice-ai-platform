// src/lib/guardrails-server.js — 5축 가드레일 (서버 사이드)
//
// 화면설계서 v260506 + 대표님 정정사항 기준 5축:
//   1. 구조      — JSON Schema 통과 (Claude의 Structured Output이 1차, 여기서 2차 확인)
//   2. 추적성    — ID 매핑 누락 / 패턴 위반 (대표님 V-Model 정정사항 반영)
//   3. 도메인    — 자동차 SW 금기어 + 측정 가능성
//   4. 교차검증  — Gemini (Phase 2-2b) — 현재는 훅(hook)만, mock pass
//   5. HITL      — Reviewer 승인 (Phase 2-3) — 현재는 훅만
//
// 결과 형식 (DB ai_generations.guardrail_result 에 저장됨):
// {
//   "overall_passed": false,
//   "failed_axes": ["domain"],
//   "axes": {
//     "structure":     { passed: true,  issues: [] },
//     "traceability":  { passed: true,  issues: [] },
//     "domain":        { passed: false, issues: [{...}] },
//     "cross_verify":  { passed: true,  hooked: true },
//     "hitl":          { passed: true,  hooked: true, required_in_phase: "2-3" }
//   }
// }

// ──────────────────────────────────────────────────
// 자동차 도메인 금기어 사전 (automotive-domain-guide SKILL 과 동기화)
// ──────────────────────────────────────────────────
const FORBIDDEN_TERMS = [
  // 모호한 성능
  { pattern: /\bfast\b/i,        category: 'vague_performance', suggestion: 'Use bounded latency (e.g., "≤200ms p99")' },
  { pattern: /\bquick(ly)?\b/i,  category: 'vague_performance', suggestion: 'Use bounded latency' },
  { pattern: /\binstantly\b/i,   category: 'vague_performance', suggestion: 'Use bounded latency (e.g., "<10ms")' },
  { pattern: /\bimmediately\b/i, category: 'vague_performance', suggestion: 'Use bounded latency' },
  { pattern: /\breal[\s-]?time\b/i, category: 'vague_performance', suggestion: 'Use bounded latency, not "real-time" alone' },
  // 모호한 수량
  { pattern: /\bmany\b/i,        category: 'vague_quantity', suggestion: 'Use specific count or threshold' },
  { pattern: /\bfew\b/i,         category: 'vague_quantity', suggestion: 'Use specific count' },
  { pattern: /\bsufficient\b/i,  category: 'vague_quantity', suggestion: 'Use measurable threshold' },
  { pattern: /\benough\b/i,      category: 'vague_quantity', suggestion: 'Use measurable threshold' },
  // 모호한 품질
  { pattern: /\buser[\s-]?friendly\b/i, category: 'vague_quality', suggestion: 'Use task completion metrics' },
  { pattern: /\bintuitive\b/i,   category: 'vague_quality', suggestion: 'Use task completion metrics' },
  { pattern: /\beasy[\s-]?to[\s-]?use\b/i, category: 'vague_quality', suggestion: 'Use task completion metrics' },
  // 모호한 빈도
  { pattern: /\boften\b/i,       category: 'vague_frequency', suggestion: 'Use specific frequency (e.g., "every 100ms")' },
  { pattern: /\brarely\b/i,      category: 'vague_frequency', suggestion: 'Use specific frequency' },
  { pattern: /\bsometimes\b/i,   category: 'vague_frequency', suggestion: 'Use specific frequency' },
];

// 검사할 필드 (텍스트가 들어가는 곳)
const TEXT_FIELDS_TO_SCAN = ['statement', 'rationale', 'operating_conditions', 'main_flow'];

// ──────────────────────────────────────────────────
// 축 1: 구조 검증
// ──────────────────────────────────────────────────
function checkStructure(output, processId) {
  const issues = [];

  if (!output) {
    issues.push({ severity: 'critical', message: 'Output is null/undefined' });
    return { passed: false, issues };
  }
  if (!output.process || output.process !== processId) {
    issues.push({ severity: 'critical', message: `process field must be "${processId}"` });
  }
  if (!output.title || typeof output.title !== 'string') {
    issues.push({ severity: 'critical', message: 'title field missing or invalid' });
  }

  if (processId === 'SYS.1') {
    if (!Array.isArray(output.stakeholder_requirements) || output.stakeholder_requirements.length === 0) {
      issues.push({ severity: 'critical', message: 'stakeholder_requirements must be non-empty array' });
    }
    if (!output.operational_context) {
      issues.push({ severity: 'high', message: 'operational_context missing' });
    }
    if (!output.traceability_seeds) {
      issues.push({ severity: 'high', message: 'traceability_seeds missing' });
    }
  }

  return { passed: issues.length === 0, issues };
}

// ──────────────────────────────────────────────────
// 축 2: 추적성 검증 (대표님 V-Model 정정사항 반영)
// ──────────────────────────────────────────────────
function checkTraceability(output, processId) {
  const issues = [];

  if (processId === 'SYS.1') {
    const stkReqs = output.stakeholder_requirements || [];
    const useCases = output.use_cases || [];

    // 2-1. ID 패턴 검사
    for (const req of stkReqs) {
      if (!req.id || !/^STK_REQ_\d{3}$/.test(req.id)) {
        issues.push({
          severity: 'high',
          rule: 'id_pattern',
          message: `Invalid STK_REQ ID format: "${req.id}" (expected STK_REQ_NNN)`,
        });
      }
      if (!req.source_doc) {
        issues.push({
          severity: 'high',
          rule: 'source_required',
          message: `${req.id}: source_doc is required (no orphan requirements)`,
        });
      }
    }

    // 2-2. ID 중복 검사
    const idCounts = {};
    for (const req of stkReqs) {
      idCounts[req.id] = (idCounts[req.id] || 0) + 1;
    }
    for (const [id, count] of Object.entries(idCounts)) {
      if (count > 1) {
        issues.push({
          severity: 'critical',
          rule: 'id_duplicate',
          message: `Duplicate STK_REQ ID: ${id} (appears ${count} times)`,
        });
      }
    }

    // 2-3. Use Case 의 linked_requirements 가 실제 STK_REQ 를 참조하는지
    const validIds = new Set(stkReqs.map(r => r.id));
    for (const uc of useCases) {
      if (!uc.id || !/^UC_\d{3}$/.test(uc.id)) {
        issues.push({
          severity: 'high',
          rule: 'id_pattern',
          message: `Invalid UC ID format: "${uc.id}"`,
        });
      }
      for (const linkedId of uc.linked_requirements || []) {
        if (!validIds.has(linkedId)) {
          issues.push({
            severity: 'critical',
            rule: 'dangling_reference',
            message: `${uc.id} references non-existent ${linkedId}`,
          });
        }
      }
    }
  }

  // SYS.4 — Interface 추적 정정사항 (Phase 2-2a 에서는 SYS.1 만이지만, 향후 대비)
  // SYS.5 — SYS-REQ 추적 정정사항 (동일)

  return { passed: issues.length === 0, issues };
}

// ──────────────────────────────────────────────────
// 축 3: 도메인 검증 (금기어 + 측정 가능성)
// ──────────────────────────────────────────────────
function checkDomain(output) {
  const issues = [];

  function scanText(text, location) {
    if (!text || typeof text !== 'string') return;
    for (const term of FORBIDDEN_TERMS) {
      const m = text.match(term.pattern);
      if (m) {
        issues.push({
          severity: 'medium',
          rule: 'forbidden_term',
          category: term.category,
          message: `Forbidden term "${m[0]}" found in ${location}`,
          suggestion: term.suggestion,
          context: text.length > 200 ? text.slice(0, 200) + '...' : text,
        });
      }
    }
  }

  function walk(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const newPath = path ? `${path}.${k}` : k;
      if (TEXT_FIELDS_TO_SCAN.includes(k) && typeof v === 'string') {
        scanText(v, newPath);
      } else if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
        // main_flow, preconditions 같은 string array
        if (TEXT_FIELDS_TO_SCAN.includes(k)) {
          v.forEach((s, i) => scanText(s, `${newPath}[${i}]`));
        }
      } else if (typeof v === 'object') {
        walk(v, newPath);
      }
    }
  }

  walk(output);

  return { passed: issues.length === 0, issues };
}

// ──────────────────────────────────────────────────
// 축 4: 교차 검증 (Gemini) — Phase 2-2b 에서 활성
// ──────────────────────────────────────────────────
async function checkCrossVerify(output, processId, input) {
  // Phase 2-2b 에서 Gemini API 호출하여 독립 평가
  return {
    passed: true,
    hooked: true,
    note: 'Cross-verification (Gemini) will be activated in Phase 2-2b',
  };
}

// ──────────────────────────────────────────────────
// 축 5: HITL — Phase 2-3 에서 활성
// ──────────────────────────────────────────────────
function checkHitl(output, processId) {
  return {
    passed: true,
    hooked: true,
    required_in_phase: '2-3',
    note: 'HITL approval will be enforced in Phase 2-3 (PENDING_APPROVAL state)',
  };
}

// ──────────────────────────────────────────────────
// 메인 진입점
// ──────────────────────────────────────────────────
export async function runGuardrails({ processId, output, input }) {
  const axes = {};

  axes.structure   = checkStructure(output, processId);
  axes.traceability = checkTraceability(output, processId);
  axes.domain       = checkDomain(output);
  axes.cross_verify = await checkCrossVerify(output, processId, input);
  axes.hitl         = checkHitl(output, processId);

  // 활성 축(1, 2, 3) 모두 통과해야 overall_passed
  const activeAxes = ['structure', 'traceability', 'domain'];
  const failed_axes = activeAxes.filter(name => !axes[name].passed);

  return {
    overall_passed: failed_axes.length === 0,
    failed_axes,
    axes,
    timestamp: new Date().toISOString(),
  };
}

// api/generate.js — ASPICE AI Generation Endpoint
//
// 역할:
//   POST /api/generate
//   - 입력: { project_id, process_id, work_product_id }
//   - 동작: work_products.content 의 항목별 입력을 모아 Claude Sonnet 4.6 호출
//   - 출력: 5축 가드레일 통과한 산출물 + Rationale Report
//
// 아키텍처 (Phase 2-2a 단계):
//   - Generator-only (Phase 2-2b 에서 Evaluator/Gemini 추가)
//   - Skills 자동 주입: aspice-{process}-derivation + automotive-domain-guide + traceability-rules
//   - Structured Outputs (output_config.format) 로 JSON 스키마 강제
//   - 5축 가드레일 중 1, 2, 3축 활성 / 4, 5축 훅(hook)만 둠
//
// Hard Caps (Anthropic 권장사항 반영):
//   max_tokens     = 4096
//   timeout        = 90초
//   retry on net   = 1회
//   retry on guard = 0회 (Phase 2-2b 에서 critique-and-refine 추가)
//   cost_cap       = $0.10 per generation
//
// 감사 추적:
//   ai_generations 행 기록 (raw_output, parsed_output, guardrail_result)
//   state_transitions 행 기록 (INITIAL → GENERATING → GENERATED/REJECTED)
//   audit_logs 행 기록

const TIMEOUT_MS = 280_000; // 4분 40초 (Vercel Hobby maxDuration 300초 한도 내 안전 마진)
const MAX_TOKENS = 16000;   // 한글 풍부한 ASPICE 산출물 충분히 담을 크기
const MODEL = 'claude-opus-4-7';  // 최상위 reasoning 모델 (품질 우선)
const PROVIDER = 'anthropic';

// ──────────────────────────────────────────────────
// Supabase REST 헬퍼
// ──────────────────────────────────────────────────
async function sb(path, method = 'GET', body = null, prefer = null) {
  const url = `${process.env.SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} ${res.status}: ${await res.text()}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ──────────────────────────────────────────────────
// Phase 2-2c: 상태값 영문 ↔ 한글 매핑
// work_products 테이블에는 state(영문) + status(한글) 두 컬럼이 있음
// UI는 status(한글)를 읽고, 영문 state는 코드 내부 처리용
// 두 컬럼이 항상 동기화되도록 헬퍼 사용
// ──────────────────────────────────────────────────
function stateToStatus(state) {
  const map = {
    'INITIAL':    '초안',
    'GENERATING': '진행중',
    'GENERATED':  '검토중',
    'MODIFIED':   '검토중',
    'REJECTED':   '반려됨',
    'APPROVED':   '승인됨',
  };
  return map[state] || '초안';
}

function syncStateAndStatus(state) {
  // 두 컬럼 모두 업데이트할 객체 반환
  return {
    state,
    status: stateToStatus(state),
  };
}

// ──────────────────────────────────────────────────
// Skills 로딩 (filesystem 기반)
// 빌드 시 함께 배포되도록 SKILL.md 들이 코드에 포함됨
// ──────────────────────────────────────────────────
const SKILLS_INDEX = {
  'SYS.1': ['aspice-sys1-derivation', 'automotive-domain-guide', 'traceability-rules'],
  // 'SWE.1': ['aspice-swe1-analysis',     'automotive-domain-guide', 'traceability-rules'],
  // 추가 프로세스는 Phase 2-2b 이후에 SKILL.md 추가하면서 매핑
};

// 런타임에 SKILL.md 들을 읽어 system prompt 에 합성
// (Vercel 함수에서 접근 가능하도록 inline)
import { readFileSync, existsSync } from 'fs';
import path from 'path';

function loadSkill(skillName) {
  // process.cwd() 는 프로젝트 루트 (Vercel 함수도 동일)
  const candidates = [
    path.join(process.cwd(), 'skills', skillName, 'SKILL.md'),
    path.join('/var/task', 'skills', skillName, 'SKILL.md'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  console.warn(`[skill] Not found: ${skillName} — searched: ${candidates.join(', ')}`);
  return null;
}

function composeSystemPrompt(processId) {
  const skillNames = SKILLS_INDEX[processId] || [];
  const skillBlocks = [];
  for (const name of skillNames) {
    const md = loadSkill(name);
    if (md) {
      skillBlocks.push(`<skill name="${name}">\n${md}\n</skill>`);
    }
  }
  return `You are a senior ASPICE PAM v4.0 consultant and automotive functional safety engineer. You have 15+ years of experience deriving stakeholder requirements for automotive ECUs, ADAS, infotainment, and connected vehicle systems.

Your task: Generate a high-quality ASPICE work product based on the provided input documents.

QUALITY PRINCIPLES (non-negotiable):

1. **Completeness over brevity**: Extract EVERY meaningful stakeholder requirement from the input. Do not artificially limit yourself. ASPICE assessors penalize missing requirements.

2. **Precision over speed**: For each STK_REQ, take time to:
   - Cite the EXACT section/page of the source document
   - Identify the underlying stakeholder need (not just paraphrase the input)
   - Specify measurable verification criteria

3. **Domain rigor**: Apply ISO 26262 (functional safety), ISO/SAE 21434 (cybersecurity), and ECE/KMVSS regulations where relevant. If a requirement has safety implications, classify ASIL.

4. **No hallucination**:
   - If a requirement is NOT in the input documents, do NOT invent it.
   - If the input is ambiguous, mark in rationale: "Source document lacks specificity in X; clarification needed."
   - Every STK_REQ_NNN MUST have a verifiable source_doc reference.

5. **JSON Schema compliance**: Your response MUST exactly match the schema in output_config. Any deviation causes validation failures.

6. **Korean OK for rationale**: Technical IDs, statements, source_doc in English. Rationale may use Korean if it captures nuance better.

OUTPUT EXPECTATIONS:
- Generate as many stakeholder_requirements as the input warrants (typical NAD-class systems: 15-30 STK_REQs).
- Generate primary use cases (typically 3-7).
- Include comprehensive operational_context (environmental, operational, regulatory).
- Provide thorough traceability_seeds showing which SW/HW/SOW sections map to each STK_REQ.

${skillBlocks.join('\n\n')}

Now analyze the user-provided input carefully. Think step by step:
- First, identify all stakeholders mentioned (driver, OEM, regulator, supplier, etc.)
- Second, extract their needs from the input documents
- Third, translate each need into a precise, testable STK_REQ
- Fourth, validate every STK_REQ against the Quality Principles above
- Finally, structure the response per the output schema

Apply the checklists in each Skill BEFORE finalizing your response. Quality is the only goal.`;
}

// ──────────────────────────────────────────────────
// Output Schema for SYS.1 — Phase 2-2c Schema
// 변경사항:
//   - ID 패턴 확장: STK_REQ_NNN 또는 STK_REQ_<GROUP>_NNN 둘 다 허용
//   - 신규 필드: group, sheet_source, source_row, source_item_id, clarification_needed
//   - use_cases 제거 (Phase 2-2c)
//   - coverage_matrix 추가 (스펙 보존 검증)
//   - warnings 추가 (메타 시트 감지 등 안내)
//   - 시트별 분할 호출 시 사용되는 partial schema 추가
// ──────────────────────────────────────────────────

// 전체 출력 스키마 (단일 호출 또는 병합된 최종 결과)
const STK_REQ_ID_PATTERN = '^STK_REQ_([A-Z][A-Z0-9_]*_)?[0-9]{3}$';

const STK_REQ_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: STK_REQ_ID_PATTERN },
    group: { type: ['string', 'null'] },
    sheet_source: { type: ['string', 'null'] },
    source_row: { type: ['integer', 'null'] },
    source_item_id: { type: ['string', 'null'] },
    category: { type: 'string', enum: ['functional', 'non_functional', 'interface', 'constraint'] },
    statement: { type: 'string' },
    rationale: { type: 'string' },
    source_doc: { type: 'string' },
    priority: { type: 'string', enum: ['must', 'should', 'could'] },
    verification_method: { type: 'string', enum: ['test', 'analysis', 'inspection', 'demonstration'] },
    clarification_needed: { type: 'boolean' },
  },
  required: [
    'id', 'group', 'sheet_source', 'source_row', 'source_item_id',
    'category', 'statement', 'rationale', 'source_doc',
    'priority', 'verification_method', 'clarification_needed',
  ],
  additionalProperties: false,
};

const OUTPUT_SCHEMAS = {
  'SYS.1': {
    type: 'object',
    properties: {
      process: { type: 'string', enum: ['SYS.1'] },
      title: { type: 'string' },
      stakeholder_requirements: {
        type: 'array',
        items: STK_REQ_ITEM_SCHEMA,
        minItems: 1,
      },
      operational_context: {
        type: 'object',
        properties: {
          operating_conditions: { type: 'string' },
          regulatory_constraints: { type: 'array', items: { type: 'string' } },
          external_interfaces: { type: 'array', items: { type: 'string' } },
        },
        required: ['operating_conditions', 'regulatory_constraints', 'external_interfaces'],
        additionalProperties: false,
      },
      coverage_matrix: {
        type: 'object',
        properties: {
          by_group: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                group: { type: ['string', 'null'] },
                sheet_source: { type: ['string', 'null'] },
                input_rows: { type: 'integer' },
                derived_stk_reqs: { type: 'integer' },
                ratio: { type: 'number' },
                unmapped_input_rows: { type: 'array', items: { type: 'integer' } },
              },
              required: ['group', 'sheet_source', 'input_rows', 'derived_stk_reqs', 'ratio', 'unmapped_input_rows'],
              additionalProperties: false,
            },
          },
          summary: {
            type: 'object',
            properties: {
              total_input_rows: { type: 'integer' },
              total_stk_reqs: { type: 'integer' },
              overall_ratio: { type: 'number' },
              status: { type: 'string', enum: ['compliant', 'spec_loss', 'over_decomposed'] },
            },
            required: ['total_input_rows', 'total_stk_reqs', 'overall_ratio', 'status'],
            additionalProperties: false,
          },
        },
        required: ['by_group', 'summary'],
        additionalProperties: false,
      },
      traceability_seeds: {
        type: 'object',
        properties: {
          from_customer_sw_req: { type: 'array', items: { type: 'string' } },
          from_customer_hw_req: { type: 'array', items: { type: 'string' } },
          from_sow:             { type: 'array', items: { type: 'string' } },
        },
        required: ['from_customer_sw_req', 'from_customer_hw_req', 'from_sow'],
        additionalProperties: false,
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'process', 'title', 'stakeholder_requirements',
      'operational_context', 'coverage_matrix', 'traceability_seeds', 'warnings'
    ],
    additionalProperties: false,
  },
};

// 시트별 분할 호출 시 사용 (부분 스키마)
const PER_SHEET_SCHEMA = {
  type: 'object',
  properties: {
    process: { type: 'string', enum: ['SYS.1'] },
    group: { type: 'string' },
    sheet_source: { type: 'string' },
    stakeholder_requirements: {
      type: 'array',
      items: STK_REQ_ITEM_SCHEMA,
      minItems: 0,  // 빈 시트 허용
    },
    coverage_matrix_partial: {
      type: 'object',
      properties: {
        group: { type: 'string' },
        sheet_source: { type: 'string' },
        input_rows: { type: 'integer' },
        derived_stk_reqs: { type: 'integer' },
        ratio: { type: 'number' },
        unmapped_input_rows: { type: 'array', items: { type: 'integer' } },
      },
      required: ['group', 'sheet_source', 'input_rows', 'derived_stk_reqs', 'ratio', 'unmapped_input_rows'],
      additionalProperties: false,
    },
    operational_context_partial: {
      type: 'object',
      properties: {
        regulatory_constraints: { type: 'array', items: { type: 'string' } },
        external_interfaces: { type: 'array', items: { type: 'string' } },
      },
      required: ['regulatory_constraints', 'external_interfaces'],
      additionalProperties: false,
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'process', 'group', 'sheet_source', 'stakeholder_requirements',
    'coverage_matrix_partial', 'operational_context_partial', 'warnings'
  ],
  additionalProperties: false,
};

// ──────────────────────────────────────────────────
// 5축 가드레일 (Phase 2-2a 활성: 1, 2, 3 / 훅: 4, 5)
// ──────────────────────────────────────────────────
import { runGuardrails } from '../src/lib/guardrails-server.js';

// ──────────────────────────────────────────────────
// 비용 추정 (Sonnet 4.6 가격 기준)
// ──────────────────────────────────────────────────
function estimateCost(inputTokens, outputTokens) {
  // Opus 4.7: $15 / MTok input, $75 / MTok output (Sonnet 대비 5배, 품질 우선이라 OK)
  return (inputTokens * 15 / 1_000_000) + (outputTokens * 75 / 1_000_000);
}

// ──────────────────────────────────────────────────
// 사용자 입력 구조화 (work_products.content 를 Claude 가 읽기 좋게 변환)
// Phase 2-2c: 라벨 매핑이 일반화됨 (sw_req/hw_req/sow → 사람이 읽는 라벨)
//             엑셀 시트는 본 함수가 아닌 buildSheetUserPrompt 사용
// ──────────────────────────────────────────────────
function buildUserPrompt(processId, content, projectMeta) {
  const lines = [];
  lines.push(`# Project Context`);
  lines.push(`- Project: ${projectMeta.name || '(unnamed)'}`);
  if (projectMeta.product_name) lines.push(`- Product: ${projectMeta.product_name}`);
  if (projectMeta.organization) lines.push(`- Organization: ${projectMeta.organization}`);
  if (projectMeta.description)  lines.push(`- Description: ${projectMeta.description}`);
  lines.push('');
  lines.push(`# Process: ${processId}`);
  lines.push('');
  lines.push(`# Input Items (OEM Customer Documents — preserve all specs)`);
  lines.push('');
  lines.push(`⚠️ These input documents are CUSTOMER deliverables provided to the supplier.`);
  lines.push(`Citing them in source_doc is NORMAL — NOT a circular reference.`);
  lines.push(`The supplier MUST preserve all customer specifications (ratio 1.0-1.3).`);
  lines.push('');

  for (const [key, value] of Object.entries(content || {})) {
    if (!value || !value.body) continue;
    const label = labelOf(processId, key);
    lines.push(`## ${label}`);
    if (value.fileName) lines.push(`Source file: ${value.fileName}`);
    if (value.note)     lines.push(`Note: ${value.note}`);
    lines.push('');
    lines.push(value.body);
    lines.push('');
  }

  lines.push(`# Task`);
  lines.push(`Generate the ${processId} work product per the loaded Skills (especially aspice-sys1-derivation).`);
  lines.push(`Apply Spec-Preservation Principle: every customer input item → ≥1 STK_REQ.`);
  lines.push(`Compute coverage_matrix with status "compliant" if ratio in [1.0, 1.3].`);
  lines.push(`Output strictly conforming JSON.`);
  return lines.join('\n');
}

// Phase 2-2c: 시트별 분할 호출용 사용자 프롬프트
function buildSheetUserPrompt({
  processId, sheetData, projectMeta, sheetIndex, totalSheets, customerSourceFileName, otherInputsSummary,
}) {
  const lines = [];
  lines.push(`# Project Context`);
  lines.push(`- Project: ${projectMeta.name || '(unnamed)'}`);
  if (projectMeta.product_name) lines.push(`- Product: ${projectMeta.product_name}`);
  if (projectMeta.organization) lines.push(`- Organization: ${projectMeta.organization}`);
  if (projectMeta.description)  lines.push(`- Description: ${projectMeta.description}`);
  lines.push('');
  lines.push(`# Process: ${processId}`);
  lines.push('');

  // 다른 시트들 요약 (Claude가 전체 컨텍스트 인식하도록)
  if (otherInputsSummary) {
    lines.push(`# Other inputs in this project (for context only — do NOT derive STK_REQs from these in this call)`);
    lines.push(otherInputsSummary);
    lines.push('');
  }

  lines.push(`# ⚠️ SHEET-BASED GENERATION MODE / 시트 단위 생성 모드`);
  lines.push('');
  lines.push(`This call generates STK_REQs from ONE worksheet only.`);
  lines.push(`Use the provided group_name for ALL STK_REQ IDs.`);
  lines.push(`Counter starts at 001 for this group.`);
  lines.push(`Output PER_SHEET_SCHEMA subset (process, group, sheet_source, stakeholder_requirements, coverage_matrix_partial, operational_context_partial, warnings).`);
  lines.push('');

  lines.push(`<sheet_context>`);
  lines.push(`  <sheet_name>${sheetData.sheet_name}</sheet_name>`);
  lines.push(`  <group_name>${sheetData.group_name}</group_name>`);
  lines.push(`  <sheet_index>${sheetIndex}</sheet_index>`);
  lines.push(`  <total_sheets>${totalSheets}</total_sheets>`);
  lines.push(`  <is_meta>${sheetData.is_meta}</is_meta>`);
  lines.push(`  <columns>${JSON.stringify(sheetData.columns)}</columns>`);
  lines.push(`  <source_document>${customerSourceFileName || 'Customer Document'}</source_document>`);
  lines.push(`  <rows>`);
  for (const row of sheetData.rows) {
    lines.push(`    ${JSON.stringify(row)}`);
  }
  lines.push(`  </rows>`);
  lines.push(`</sheet_context>`);
  lines.push('');

  lines.push(`# Task`);
  lines.push(`For each row in <sheet_context>.<rows>, derive 1 or more STK_REQs (1:1 for simple, 1:N for composite).`);
  lines.push(`ID format: STK_REQ_${sheetData.group_name}_NNN (001, 002, ...).`);
  lines.push(`Each STK_REQ MUST have:`);
  lines.push(`  - group: "${sheetData.group_name}"`);
  lines.push(`  - sheet_source: "${sheetData.sheet_name}"`);
  lines.push(`  - source_row: <the row_num from rows array>`);
  lines.push(`  - source_item_id: <the customer's ID field if present, else null>`);
  lines.push(`  - source_doc: "${customerSourceFileName || 'Customer Document'} §${sheetData.sheet_name}, Row N (ID-XYZ)"`);
  lines.push('');
  lines.push(`Compute coverage_matrix_partial: input_rows=${sheetData.rows.length}, derived_stk_reqs=<your count>, ratio, unmapped_input_rows.`);
  lines.push(`In operational_context_partial: include any regulations or interfaces SPECIFICALLY mentioned in this sheet only.`);
  lines.push(`Use warnings array if you detect any anomalies.`);

  return lines.join('\n');
}

function labelOf(processId, key) {
  const map = {
    'SYS.1': { sw_req: 'Customer SW Requirements', hw_req: 'Customer HW Requirements', sow: 'Statement of Work (SOW)' },
  };
  return (map[processId] && map[processId][key]) || key;
}

// Phase 2-2c: 시트별 호출 결과들을 최종 스키마로 병합
function mergePerSheetOutputs(perSheetOutputs, processId, title) {
  const merged = {
    process: processId,
    title,
    stakeholder_requirements: [],
    operational_context: {
      operating_conditions: '',  // 시트별로 잘 정의되지 않음 — 후처리 또는 빈 문자열
      regulatory_constraints: [],
      external_interfaces: [],
    },
    coverage_matrix: {
      by_group: [],
      summary: {
        total_input_rows: 0,
        total_stk_reqs: 0,
        overall_ratio: 0,
        status: 'compliant',
      },
    },
    traceability_seeds: {
      from_customer_sw_req: [],
      from_customer_hw_req: [],
      from_sow: [],
    },
    warnings: [],
  };

  const allRegulations = new Set();
  const allInterfaces = new Set();

  for (const sheetOut of perSheetOutputs) {
    if (!sheetOut) continue;

    // STK_REQ 누적
    if (Array.isArray(sheetOut.stakeholder_requirements)) {
      merged.stakeholder_requirements.push(...sheetOut.stakeholder_requirements);
    }

    // Coverage matrix 누적
    if (sheetOut.coverage_matrix_partial) {
      merged.coverage_matrix.by_group.push(sheetOut.coverage_matrix_partial);
    }

    // 법규/인터페이스 dedupe
    if (sheetOut.operational_context_partial) {
      (sheetOut.operational_context_partial.regulatory_constraints || []).forEach(r => allRegulations.add(r));
      (sheetOut.operational_context_partial.external_interfaces || []).forEach(i => allInterfaces.add(i));
    }

    // Warnings 누적
    if (Array.isArray(sheetOut.warnings)) {
      merged.warnings.push(...sheetOut.warnings);
    }
  }

  merged.operational_context.regulatory_constraints = Array.from(allRegulations);
  merged.operational_context.external_interfaces = Array.from(allInterfaces);
  merged.operational_context.operating_conditions = 'See individual sheet contexts. Default automotive operating range: -40°C to +85°C, 9-16V nominal, EMC per ECE R10.';

  // Summary 계산
  let totalInputRows = 0;
  let totalStkReqs = 0;
  for (const g of merged.coverage_matrix.by_group) {
    totalInputRows += g.input_rows || 0;
    totalStkReqs += g.derived_stk_reqs || 0;
  }
  merged.coverage_matrix.summary.total_input_rows = totalInputRows;
  merged.coverage_matrix.summary.total_stk_reqs = totalStkReqs;
  const ratio = totalInputRows > 0 ? totalStkReqs / totalInputRows : 0;
  merged.coverage_matrix.summary.overall_ratio = Math.round(ratio * 1000) / 1000;
  if (totalInputRows === 0) {
    merged.coverage_matrix.summary.status = 'compliant';
  } else if (ratio < 1.0) {
    merged.coverage_matrix.summary.status = 'spec_loss';
  } else if (ratio > 1.3) {
    merged.coverage_matrix.summary.status = 'over_decomposed';
  } else {
    merged.coverage_matrix.summary.status = 'compliant';
  }

  // Traceability seeds 자동 생성
  for (const stk of merged.stakeholder_requirements) {
    const arrow = `${stk.source_item_id || stk.sheet_source || 'Row ' + stk.source_row} → ${stk.id}`;
    if (stk.source_doc && /sw\s*req/i.test(stk.source_doc)) {
      merged.traceability_seeds.from_customer_sw_req.push(arrow);
    } else if (stk.source_doc && /hw\s*req/i.test(stk.source_doc)) {
      merged.traceability_seeds.from_customer_hw_req.push(arrow);
    } else if (stk.source_doc && /sow/i.test(stk.source_doc)) {
      merged.traceability_seeds.from_sow.push(arrow);
    }
  }

  return merged;
}

// ──────────────────────────────────────────────────
// Claude API 호출 (with Structured Outputs + Rate Limit Retry)
// Phase 2-2c: 429 응답 시 retry-after 헤더 기반 자동 재시도 (최대 2회)
// 병렬 호출 시에도 안전하게 작동
// ──────────────────────────────────────────────────
async function callClaude({ systemPrompt, userPrompt, schema, attempt = 0 }) {
  const MAX_RETRIES = 2;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        // Adaptive thinking — Opus 4.7 의 깊은 reasoning 활성화 (품질 극대화)
        thinking: { type: 'adaptive' },
        // Structured Outputs (GA — 별도 beta header 불필요)
        output_config: {
          format: {
            type: 'json_schema',
            schema,
          },
        },
      }),
    });

    // Phase 2-2c: 429 (Rate Limit) 또는 529 (Overloaded) 자동 재시도
    if ((res.status === 429 || res.status === 529) && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
      const waitMs = Math.min(Math.max(retryAfter * 1000, 1000), 30000);  // 1~30초
      console.log(`[callClaude] ${res.status} received, retry after ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      clearTimeout(timeoutId);
      await new Promise(r => setTimeout(r, waitMs));
      return callClaude({ systemPrompt, userPrompt, schema, attempt: attempt + 1 });
    }

    const data = await res.json();
    const latency = Date.now() - t0;

    if (!res.ok) {
      throw new Error(`Claude API ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }

    // 응답 파싱
    const textBlock = (data.content || []).find(c => c.type === 'text');
    if (!textBlock) {
      throw new Error('No text block in Claude response');
    }
    const rawOutput = textBlock.text;
    const stopReason = data.stop_reason || 'unknown';

    let parsedOutput = null;
    try {
      parsedOutput = JSON.parse(rawOutput);
    } catch (e) {
      // 잘림 감지: stop_reason 이 max_tokens 이면 명확히 안내
      if (stopReason === 'max_tokens') {
        throw new Error(
          `Claude 응답이 max_tokens(${MAX_TOKENS})에 도달해 잘렸습니다. ` +
          `생성된 ${rawOutput.length}자가 JSON으로 완결되지 못함. ` +
          `해결책: api/generate.js 의 MAX_TOKENS 를 더 크게 (예: 16000) 늘리세요.`
        );
      }
      throw new Error(`Failed to parse JSON from Claude (stop=${stopReason}): ${e.message}`);
    }

    return {
      rawOutput,
      parsedOutput,
      finishReason: stopReason,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      latencyMs: latency,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id, process_id, work_product_id } = req.body || {};
  if (!project_id || !process_id) {
    return res.status(400).json({ error: 'Missing project_id or process_id' });
  }

  // 지원하는 프로세스인지 확인 (Phase 2-2a 는 SYS.1만)
  if (!OUTPUT_SCHEMAS[process_id]) {
    return res.status(400).json({
      error: `Process ${process_id} not yet supported in Phase 2-2a. Currently supports: ${Object.keys(OUTPUT_SCHEMAS).join(', ')}`,
    });
  }

  let aiGenId = null;

  try {
    // 1. 프로젝트 + work_product 조회
    const [project] = await sb(`/projects?id=eq.${project_id}&select=id,name,product_name,organization,description`);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let wp = null;
    if (work_product_id) {
      const wps = await sb(`/work_products?id=eq.${work_product_id}&select=*`);
      wp = wps && wps[0];
    }
    if (!wp) {
      const wps = await sb(`/work_products?project_id=eq.${project_id}&process_id=eq.${process_id}&select=*&order=updated_at.desc&limit=1`);
      wp = wps && wps[0];
    }
    if (!wp) return res.status(404).json({ error: 'Work product not found' });
    if (!wp.content || Object.keys(wp.content).length === 0) {
      return res.status(400).json({ error: 'Work product has no input content yet' });
    }

    // 2. state: GENERATING
    await sb(`/work_products?id=eq.${wp.id}`, 'PATCH', syncStateAndStatus('GENERATING'));
    await sb(`/state_transitions`, 'POST', {
      work_product_id: wp.id,
      from_state: wp.state || 'INITIAL',
      to_state: 'GENERATING',
      trigger: 'ai_generation',
      reason: `AI generation triggered for ${process_id}`,
    }, 'return=minimal');

    // 3. ⭐ Phase 2-2c: 엑셀 멀티시트 입력 감지
    //    - 입력 항목 중 source_type === 'excel_multi_sheet' 가 있으면 시트별 분할 호출
    //    - 없으면 기존 단일 호출 (백워드 호환)
    const sheetBasedInputs = []; // [{ itemKey, label, fileName, sheet }]
    for (const [key, value] of Object.entries(wp.content || {})) {
      if (value?.source_type === 'excel_multi_sheet' && Array.isArray(value.sheets)) {
        const label = labelOf(process_id, key);
        for (const sheet of value.sheets) {
          if (sheet.selected && !sheet.is_meta) {
            sheetBasedInputs.push({
              itemKey: key,
              label,
              fileName: value.fileName || label,
              sheet,
            });
          }
        }
      }
    }

    const useSheetSplit = sheetBasedInputs.length > 0;
    const systemPrompt = composeSystemPrompt(process_id);
    const skillsUsed = SKILLS_INDEX[process_id] || [];

    // 4. ai_generations master row 생성 (실패해도 기록 남도록)
    const masterRowPrompt = useSheetSplit
      ? `[Sheet-Split Mode] Will dispatch ${sheetBasedInputs.length} per-sheet calls`
      : buildUserPrompt(process_id, wp.content, project);

    const [created] = await sb(`/ai_generations`, 'POST', {
      project_id,
      process_id,
      work_product_id: wp.id,
      agent_role: 'generator',
      agent_step: 0,  // master row (시트별 호출의 부모)
      model: MODEL,
      provider: PROVIDER,
      system_prompt: systemPrompt.slice(0, 50000),
      user_prompt: masterRowPrompt.slice(0, 50000),
      skills_used: skillsUsed,
      status: 'pending',
    }, 'return=representation') || [];
    aiGenId = created?.id;

    // 5. Claude 호출
    let parsedOutput;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let finishReason = 'success';
    let rawOutputLog = '';

    if (useSheetSplit) {
      // ── Phase 2-2c: 시트별 분할 호출 (병렬) ──
      // 2026년 5월 Anthropic Tier 1 Opus rate limit 15배 인상으로 병렬 호출 안전
      // callClaude 내부에 429/529 retry 로직 있어 추가 안전
      console.log(`[generate] Sheet-split mode (parallel): ${sheetBasedInputs.length} sheets`);

      // 다른 시트들 요약 (전체 컨텍스트 제공용)
      const otherInputsSummary = sheetBasedInputs
        .map((si, i) => `Sheet ${i + 1}/${sheetBasedInputs.length}: "${si.sheet.sheet_name}" (group: ${si.sheet.group_name}, ${si.sheet.rows.length} rows)`)
        .join('\n');

      // 사전: 각 시트별 child row 생성 (병렬로 DB 기록)
      const childRowPromises = sheetBasedInputs.map((si, i) => {
        const sheetUserPrompt = buildSheetUserPrompt({
          processId: process_id,
          sheetData: si.sheet,
          projectMeta: project,
          sheetIndex: i + 1,
          totalSheets: sheetBasedInputs.length,
          customerSourceFileName: si.fileName,
          otherInputsSummary,
        });
        return sb(`/ai_generations`, 'POST', {
          project_id,
          process_id,
          work_product_id: wp.id,
          agent_role: 'generator',
          agent_step: i + 1,
          model: MODEL,
          provider: PROVIDER,
          system_prompt: systemPrompt.slice(0, 50000),
          user_prompt: sheetUserPrompt.slice(0, 50000),
          skills_used: skillsUsed,
          parent_generation_id: aiGenId,
          status: 'pending',
        }, 'return=representation').then(arr => ({
          si, sheetUserPrompt, childId: arr?.[0]?.id || null,
        }));
      });
      const sheetTasks = await Promise.all(childRowPromises);

      // 병렬 Claude 호출 — Promise.allSettled 로 부분 실패 허용
      const callPromises = sheetTasks.map(async ({ si, sheetUserPrompt, childId }, i) => {
        try {
          const sheetResult = await callClaude({
            systemPrompt,
            userPrompt: sheetUserPrompt,
            schema: PER_SHEET_SCHEMA,
          });

          // child row 성공 업데이트
          if (childId) {
            const sheetCost = estimateCost(sheetResult.inputTokens, sheetResult.outputTokens);
            await sb(`/ai_generations?id=eq.${childId}`, 'PATCH', {
              raw_output: sheetResult.rawOutput,
              parsed_output: sheetResult.parsedOutput,
              finish_reason: sheetResult.finishReason,
              input_tokens: sheetResult.inputTokens,
              output_tokens: sheetResult.outputTokens,
              cost_usd: sheetCost,
              latency_ms: sheetResult.latencyMs,
              status: 'success',
            });
          }

          console.log(`[generate] Sheet ${i + 1}/${sheetBasedInputs.length} done: ${sheetResult.parsedOutput.stakeholder_requirements?.length || 0} STK_REQs`);
          return { success: true, si, sheetResult };
        } catch (e) {
          if (childId) {
            await sb(`/ai_generations?id=eq.${childId}`, 'PATCH', {
              status: 'failed',
              error_message: e.message?.slice(0, 1000),
            }).catch(() => {});
          }
          console.error(`[generate] Sheet ${i + 1} failed:`, e.message);
          return { success: false, si, error: e.message };
        }
      });

      const callResults = await Promise.all(callPromises);

      // 성공/실패 분리
      const successResults = callResults.filter(r => r.success);
      const failedResults = callResults.filter(r => !r.success);

      // 모든 시트가 실패하면 전체 실패
      if (successResults.length === 0) {
        throw new Error(
          `모든 시트(${sheetBasedInputs.length}개) 처리에 실패했습니다.\n` +
          failedResults.map(f => `  - "${f.si.sheet.sheet_name}": ${f.error}`).join('\n')
        );
      }

      // 일부 성공: 진행하되 warnings에 기록
      const perSheetOutputs = successResults.map(r => r.sheetResult.parsedOutput);
      const partialFailWarnings = failedResults.map(
        f => `시트 "${f.si.sheet.sheet_name}" 처리 실패: ${f.error}`
      );

      // 토큰/비용/지연 누적
      for (const r of successResults) {
        totalInputTokens += r.sheetResult.inputTokens;
        totalOutputTokens += r.sheetResult.outputTokens;
        rawOutputLog += `\n=== Sheet: ${r.si.sheet.sheet_name} ===\n${r.sheetResult.rawOutput}\n`;
      }
      // 병렬이므로 latency 는 가장 긴 시트 기준 (실제 wall-clock time)
      totalLatencyMs = Math.max(0, ...successResults.map(r => r.sheetResult.latencyMs));

      // 결과 병합
      const title = `Stakeholder Requirements for ${project.product_name || project.name || 'System'}`;
      parsedOutput = mergePerSheetOutputs(perSheetOutputs, process_id, title);

      // 부분 실패 경고 추가
      if (partialFailWarnings.length > 0) {
        parsedOutput.warnings = [...(parsedOutput.warnings || []), ...partialFailWarnings];
      }
      finishReason = failedResults.length > 0
        ? `partial_success_${successResults.length}/${sheetBasedInputs.length}`
        : 'merged_from_sheets';
    } else {
      // ── 단일 호출 (기존 흐름, 백워드 호환) ──
      const userPrompt = buildUserPrompt(process_id, wp.content, project);
      const claudeResult = await callClaude({
        systemPrompt,
        userPrompt,
        schema: OUTPUT_SCHEMAS[process_id],
      });
      parsedOutput = claudeResult.parsedOutput;
      totalInputTokens = claudeResult.inputTokens;
      totalOutputTokens = claudeResult.outputTokens;
      totalLatencyMs = claudeResult.latencyMs;
      finishReason = claudeResult.finishReason;
      rawOutputLog = claudeResult.rawOutput;
    }

    // 6. 5축 가드레일 검증
    const guardrailResult = await runGuardrails({
      processId: process_id,
      output: parsedOutput,
      input: wp.content,
    });

    const passed = guardrailResult.overall_passed;
    const cost = estimateCost(totalInputTokens, totalOutputTokens);

    // 7. ai_generations master row 업데이트
    if (aiGenId) {
      await sb(`/ai_generations?id=eq.${aiGenId}`, 'PATCH', {
        raw_output: rawOutputLog.slice(0, 100000),  // master는 log 형식
        parsed_output: parsedOutput,
        finish_reason: finishReason,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: cost,
        latency_ms: totalLatencyMs,
        guardrail_result: guardrailResult,
        guardrail_passed: passed,
        status: passed ? 'success' : 'blocked_by_guardrail',
      });
    }

    // 8. work_products 업데이트
    const newState = passed ? 'GENERATED' : 'REJECTED';
    const newContent = passed
      ? { ...wp.content, ai_generated: parsedOutput }
      : wp.content;

    await sb(`/work_products?id=eq.${wp.id}`, 'PATCH', {
      ...syncStateAndStatus(newState),
      content: newContent,
    });

    await sb(`/state_transitions`, 'POST', {
      work_product_id: wp.id,
      from_state: 'GENERATING',
      to_state: newState,
      trigger: passed ? 'ai_generation' : 'guardrail',
      reason: passed
        ? 'Guardrails passed'
        : `Guardrail failed: ${guardrailResult.failed_axes.join(', ')}`,
      ai_generation_id: aiGenId,
    }, 'return=minimal');

    // 9. audit log
    await sb(`/audit_logs`, 'POST', {
      action: 'ai_generate',
      resource_type: 'work_product',
      resource_id: wp.id,
      project_id,
      details: {
        process_id,
        ai_generation_id: aiGenId,
        passed,
        cost_usd: cost,
        latency_ms: totalLatencyMs,
        sheet_split_mode: useSheetSplit,
        sheet_count: useSheetSplit ? sheetBasedInputs.length : 0,
      },
    }, 'return=minimal');

    // 10. 응답
    return res.status(200).json({
      success: true,
      passed,
      state: newState,
      status: stateToStatus(newState),  // Phase 2-2c: UI 표시용 한글 상태
      ai_generation_id: aiGenId,
      output: parsedOutput,
      guardrail_result: guardrailResult,
      meta: {
        model: MODEL,
        skills_used: skillsUsed,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: cost,
        latency_ms: totalLatencyMs,
        sheet_split_mode: useSheetSplit,
        sheet_count: useSheetSplit ? sheetBasedInputs.length : 0,
      },
    });
  } catch (error) {
    console.error('[generate]', error);

    // 실패 기록
    if (aiGenId) {
      try {
        await sb(`/ai_generations?id=eq.${aiGenId}`, 'PATCH', {
          status: 'failed',
          error_message: error.message?.slice(0, 1000),
        });
      } catch (e) { /* swallow */ }
    }

    return res.status(500).json({
      error: error.message,
      ai_generation_id: aiGenId,
    });
  }
}

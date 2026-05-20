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

const TIMEOUT_MS = 750_000; // Phase 2-2c (Pro): 12분 30초 — Vercel Pro maxDuration 800초 한도 내 안전 마진
                             // 시트당 깊은 reasoning 5~6분도 충분히 처리 가능
const MAX_TOKENS = 64000;  // Phase 2-2c: 시트별 스펙 보존 모드로 출력 크기 증가 (Opus 4.7 최대 128000)
                            // 16000은 시트당 100+ STK_REQ 생성 시 부족하여 잘림 발생
const MODEL = 'claude-opus-4-7';  // 최상위 reasoning 모델 (품질 우선)
const PROVIDER = 'anthropic';

// Phase 2-2e: 시트별 호출 batch 크기
// Anthropic Tier 1 Opus 한도 (50 RPM, 30K ITPM) 안전 마진 + Vercel proxy 침묵 타임아웃 회피
// - 1: 완전 직렬 (안전하지만 느림 — 시트 N개 = N × 5분)
// - 2: 권장 (Tier 1 안전 + 적절한 병렬성)
// - 3: Tier 1 한도 빠듯 (Tier 2 이상부터 권장)
// - 4+: Tier 1에서 rate limit hit 가능성 높음
// 환경 변수 SHEET_BATCH_SIZE 로 운영 중 조정 가능
const SHEET_BATCH_SIZE = Math.max(1, Math.min(8,
  parseInt(process.env.SHEET_BATCH_SIZE || '2', 10) || 2
));

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
// 비용 추정 (Claude Opus 4.7 + Prompt Caching 가격)
// ──────────────────────────────────────────────────
//
// Anthropic Opus 4.7 가격 (per million tokens):
//   - Input (regular):        $15
//   - Input (cache write):    $18.75 (Input × 1.25, 캐시 생성 시 25% 추가)
//   - Input (cache read/HIT): $1.50  (Input × 0.10, 90% 할인)
//   - Output:                 $75
//
// Phase 2-2d: Prompt Caching 적용으로 정확한 비용 계산
function estimateCost(inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) {
  const inputCost = (inputTokens * 15) / 1_000_000;
  const cacheWriteCost = (cacheCreationTokens * 18.75) / 1_000_000;
  const cacheReadCost = (cacheReadTokens * 1.50) / 1_000_000;
  const outputCost = (outputTokens * 75) / 1_000_000;
  return inputCost + cacheWriteCost + cacheReadCost + outputCost;
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
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
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
          // Phase 2-2d: Prompt Caching 활성화
          // 시스템 프롬프트(SKILL 30KB)는 매번 동일하므로 캐시
          // - 첫 호출: 캐시 생성 (+25% 비용)
          // - 5분 이내 재호출: 캐시 HIT (-90% 비용)
          // - 두 시트 병렬 처리에서 두 번째 시트가 캐시 활용
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userPrompt }],
          // Phase 2-2c (Pro): Adaptive thinking 기본 (깊은 reasoning)
          // Vercel Pro maxDuration 800초로 시트당 4~6분의 깊은 추론도 안전
          // 자동차 OEM ASPICE 평가 통과를 위한 품질 우선
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
    } catch (fetchError) {
      // Phase 2-2c: 네트워크 레벨 에러 (fetch failed, ECONNRESET, ENOTFOUND 등) 자동 재시도
      // Anthropic API 일시 장애 또는 네트워크 일시 끊김에 대응
      const isNetworkError = fetchError.message?.includes('fetch failed') ||
                              fetchError.message?.includes('ECONNRESET') ||
                              fetchError.message?.includes('ENOTFOUND') ||
                              fetchError.message?.includes('ETIMEDOUT') ||
                              fetchError.code === 'UND_ERR_SOCKET' ||
                              fetchError.cause?.code === 'ECONNRESET';

      if (isNetworkError && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 3000;  // 3초, 6초 백오프
        console.log(`[callClaude] Network error: ${fetchError.message}, retry after ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        clearTimeout(timeoutId);
        await new Promise(r => setTimeout(r, waitMs));
        return callClaude({ systemPrompt, userPrompt, schema, attempt: attempt + 1 });
      }
      // 재시도 한도 초과 또는 다른 종류 에러는 그대로 throw
      throw fetchError;
    }

    // Phase 2-2c: 429 (Rate Limit) 또는 529 (Overloaded) 자동 재시도
    if ((res.status === 429 || res.status === 529) && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
      const waitMs = Math.min(Math.max(retryAfter * 1000, 1000), 30000);  // 1~30초
      console.log(`[callClaude] ${res.status} received, retry after ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      clearTimeout(timeoutId);
      await new Promise(r => setTimeout(r, waitMs));
      return callClaude({ systemPrompt, userPrompt, schema, attempt: attempt + 1 });
    }

    // Phase 2-2e: 응답 본문 안전 파싱
    // ── 문제 ──
    // 이전 코드: const data = await res.json()
    //   → Anthropic 게이트웨이/Envoy가 일시 장애 시 200/502/503 어느 상태든
    //     본문에 "upstream connect error..." 같은 plain text 를 반환할 수 있음
    //   → res.json() 이 SyntaxError ("Unexpected token 'u'") 로 폭발
    //   → 사용자에게 "not valid JSON" 메시지로 노출됨 (실제로는 Anthropic 인프라 에러)
    //
    // ── 해결 ──
    // 1) 본문을 먼저 text 로 받음
    // 2) JSON 파싱 시도
    // 3) 파싱 실패 시: upstream/proxy 에러 패턴이면 retry, 아니면 명확한 에러로 throw
    const rawBody = await res.text();
    const latency = Date.now() - t0;

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseErr) {
      // 본문이 JSON 이 아닌 경우 — Anthropic 게이트웨이 에러 패턴 검사
      const bodyPreview = rawBody.slice(0, 200);
      const isUpstreamError =
        /upstream\s+(connect|request|response|service)\s+(error|timeout|unavailable)/i.test(bodyPreview) ||
        /^upstream/i.test(bodyPreview) ||
        /service unavailable/i.test(bodyPreview) ||
        /bad gateway/i.test(bodyPreview) ||
        /gateway timeout/i.test(bodyPreview) ||
        /Cloudflare/i.test(bodyPreview) ||
        rawBody.startsWith('<');  // HTML 에러 페이지

      if (isUpstreamError && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 5000;  // 5초, 10초 백오프 (게이트웨이 회복 시간)
        console.log(
          `[callClaude] Upstream/gateway error (status=${res.status}, body="${bodyPreview.slice(0, 80)}..."), ` +
          `retry after ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        clearTimeout(timeoutId);
        await new Promise(r => setTimeout(r, waitMs));
        return callClaude({ systemPrompt, userPrompt, schema, attempt: attempt + 1 });
      }

      // 재시도 한도 초과 또는 다른 종류 파싱 에러 — 명확한 에러로 throw
      throw new Error(
        `Anthropic API 응답이 유효한 JSON 이 아닙니다 (HTTP ${res.status}). ` +
        `Anthropic 게이트웨이 장애로 추정되며 ${MAX_RETRIES}회 재시도 후에도 회복 안 됨. ` +
        `응답 본문 미리보기: "${bodyPreview}"`
      );
    }

    if (!res.ok) {
      throw new Error(`Claude API ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }

    // Phase 2-2d: Prompt Caching 통계 로깅
    // - cache_creation_input_tokens: 캐시에 새로 저장된 토큰 (첫 호출)
    // - cache_read_input_tokens: 캐시에서 읽은 토큰 (재호출, 비용 90% 할인)
    // - input_tokens: 캐시되지 않은 새로운 입력 토큰 (사용자 프롬프트 등)
    const usage = data.usage || {};
    const cacheCreated = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheHit = cacheRead > 0;
    console.log(
      `[callClaude] tokens: input=${inputTokens}, ` +
      `cache_created=${cacheCreated}, cache_read=${cacheRead} ` +
      `(${cacheHit ? '✓ CACHE HIT' : 'no cache'}), ` +
      `output=${outputTokens}, latency=${latency}ms`
    );

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
          `이 시트의 입력 항목이 너무 많거나, MAX_TOKENS 를 더 크게 늘리세요 (Opus 4.7 최대 128000).`
        );
      }
      throw new Error(`Failed to parse JSON from Claude (stop=${stopReason}): ${e.message}`);
    }

    return {
      rawOutput,
      parsedOutput,
      finishReason: stopReason,
      inputTokens,
      outputTokens,
      cacheCreationTokens: cacheCreated,
      cacheReadTokens: cacheRead,
      cacheHit,
      latencyMs: latency,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────────
// Phase 2-2d: SSE (Server-Sent Events) Streaming Helpers
// ──────────────────────────────────────────────────
//
// Vercel Edge Proxy 5분 침묵 타임아웃 해결:
//   - 함수 시작 즉시 SSE 헤더 + 첫 이벤트 전송 (25초 룰 만족)
//   - 처리 단계마다 progress 이벤트로 keep-alive
//   - 최종 결과는 complete 이벤트로 전송
//   - maxDuration 800초 풀 활용 가능
//
// 백워드 호환:
//   - 기존 JSON 응답 모드도 유지 (Accept 헤더로 결정)
//   - 클라이언트가 SSE 미지원 시 자동 폴백

/**
 * 요청이 SSE streaming 응답을 원하는지 판단.
 * Accept 헤더가 'text/event-stream'을 포함하거나
 * query string에 stream=true 가 있으면 SSE.
 */
function wantsStreaming(req) {
  const accept = String(req.headers?.accept || '').toLowerCase();
  if (accept.includes('text/event-stream')) return true;
  // URL query 로도 강제 지정 가능 (디버깅/테스트 편의)
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('stream') === 'true') return true;
  } catch (_) { /* req.url 형식이 다를 수 있어 무시 */ }
  return false;
}

/**
 * SSE 응답 헤더 설정 + 첫 이벤트 전송 (Vercel proxy 25초 룰 만족).
 */
function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // 일부 proxy에서 버퍼링 방지
  // 일부 환경에서 응답 헤더가 첫 write까지 flush 안 됨 — 빈 코멘트로 강제
  res.write(': ASPICE AI streaming started\n\n');
  // Express/Vercel Node 환경에서 즉시 flush
  if (typeof res.flushHeaders === 'function') {
    try { res.flushHeaders(); } catch (_) { /* noop */ }
  }
}

/**
 * SSE 이벤트 전송. 한 이벤트는 'event: type\ndata: json\n\n' 형식.
 * JSON 안에 줄바꿈이 있으면 SSE 파서가 깨지므로 stringify 결과만 사용.
 */
function sseSend(res, eventType, payload) {
  try {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (e) {
    console.error('[sse] write failed:', e.message);
  }
}

/**
 * Streaming/non-streaming 양 모드를 같은 코드로 다룰 emitter factory.
 *
 * mode='stream':
 *   - emit(eventType, payload) -> SSE 이벤트 전송 (즉시 전달)
 * mode='buffer':
 *   - emit(eventType, payload) -> 메모리에 누적 (기존 JSON 응답에서는 사용 안 함)
 */
function createEmitter({ streaming, res }) {
  if (streaming) {
    return {
      streaming: true,
      emit: (eventType, payload) => sseSend(res, eventType, payload),
    };
  }
  return {
    streaming: false,
    emit: () => { /* noop in non-streaming mode */ },
  };
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Phase 2-2d: Streaming 모드 판정 + 즉시 SSE 헤더 전송 (Vercel proxy 25초 룰 만족)
  const streaming = wantsStreaming(req);
  if (streaming) {
    initSSE(res);
    // 즉시 첫 이벤트 — Vercel Edge Proxy가 연결을 살아있다고 인식
    sseSend(res, 'started', {
      ts: Date.now(),
      message: 'AI 생성 시작',
    });
  }
  const emitter = createEmitter({ streaming, res });
  const emit = emitter.emit;

  const { project_id, process_id, work_product_id } = req.body || {};
  if (!project_id || !process_id) {
    if (streaming) {
      sseSend(res, 'error', { error: 'Missing project_id or process_id' });
      return res.end();
    }
    return res.status(400).json({ error: 'Missing project_id or process_id' });
  }

  // 지원하는 프로세스인지 확인 (Phase 2-2a 는 SYS.1만)
  if (!OUTPUT_SCHEMAS[process_id]) {
    const msg = `Process ${process_id} not yet supported. Currently supports: ${Object.keys(OUTPUT_SCHEMAS).join(', ')}`;
    if (streaming) {
      sseSend(res, 'error', { error: msg });
      return res.end();
    }
    return res.status(400).json({ error: msg });
  }

  let aiGenId = null;

  // Phase 2-2d: streaming/non-streaming 공통 에러 응답 헬퍼
  const sendError = (statusCode, errMsg, extra = {}) => {
    if (streaming) {
      sseSend(res, 'error', { error: errMsg, ...extra });
      return res.end();
    }
    return res.status(statusCode).json({ error: errMsg, ...extra });
  };

  try {
    emit('progress', { step: 'loading_input', message: '입력 검증 및 Skills 로딩' });

    // 1. 프로젝트 + work_product 조회
    const [project] = await sb(`/projects?id=eq.${project_id}&select=id,name,product_name,organization,description`);
    if (!project) return sendError(404, 'Project not found');

    let wp = null;
    if (work_product_id) {
      const wps = await sb(`/work_products?id=eq.${work_product_id}&select=*`);
      wp = wps && wps[0];
    }
    if (!wp) {
      const wps = await sb(`/work_products?project_id=eq.${project_id}&process_id=eq.${process_id}&select=*&order=updated_at.desc&limit=1`);
      wp = wps && wps[0];
    }
    if (!wp) return sendError(404, 'Work product not found');
    if (!wp.content || Object.keys(wp.content).length === 0) {
      return sendError(400, 'Work product has no input content yet');
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

    // Phase 2-2d: 시트 개수 + 모드 알림
    emit('progress', {
      step: 'mode_detected',
      message: useSheetSplit
        ? `시트별 분할 처리 모드 (${sheetBasedInputs.length}개 시트)`
        : '단일 호출 모드',
      sheet_split_mode: useSheetSplit,
      sheet_count: sheetBasedInputs.length,
      sheets: useSheetSplit
        ? sheetBasedInputs.map((si, idx) => ({
            idx: idx + 1,
            name: si.sheet.sheet_name,
            group: si.sheet.group_name || null,
            rows: si.sheet.row_count || null,
          }))
        : [],
    });

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
    // Phase 2-2d: Prompt Caching 토큰 누적
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;
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

      // Phase 2-2e: callPromise를 즉시 만들지 않고 factory 함수로 만들어 batch loop에서 호출
      // 이전: callPromises는 .map(async) 결과라 즉시 4개 모두 시작 → Anthropic Tier 1 한도 초과
      // 변경: makeCallTask 는 호출되기 전엔 fetch 안 함 → batch loop가 BATCH_SIZE씩 트리거
      const makeCallTask = ({ si, sheetUserPrompt, childId }, i) => async () => {
        const sheetIdx = i + 1;
        const sheetName = si.sheet.sheet_name;
        const sheetGroup = si.sheet.group_name || null;

        // Phase 2-2d: 시트 시작 알림
        emit('progress', {
          step: 'sheet_start',
          message: `시트 ${sheetIdx}/${sheetBasedInputs.length} 시작: ${sheetName}`,
          sheet_idx: sheetIdx,
          sheet_name: sheetName,
          sheet_group: sheetGroup,
        });

        try {
          const sheetResult = await callClaude({
            systemPrompt,
            userPrompt: sheetUserPrompt,
            schema: PER_SHEET_SCHEMA,
          });

          const stkCount = sheetResult.parsedOutput.stakeholder_requirements?.length || 0;

          // child row 성공 업데이트
          if (childId) {
            // Phase 2-2d: Prompt Caching 반영한 정확한 비용 계산
            const sheetCost = estimateCost(
              sheetResult.inputTokens,
              sheetResult.outputTokens,
              sheetResult.cacheCreationTokens,
              sheetResult.cacheReadTokens
            );
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

          console.log(
            `[generate] Sheet ${sheetIdx}/${sheetBasedInputs.length} done: ` +
            `${stkCount} STK_REQs ` +
            `(cache: ${sheetResult.cacheHit ? '✓ HIT' : 'miss'})`
          );

          // Phase 2-2d: 시트 완료 알림
          emit('progress', {
            step: 'sheet_done',
            message: `시트 ${sheetIdx}/${sheetBasedInputs.length} 완료: ${stkCount}개 STK_REQ ${sheetResult.cacheHit ? '✓캐시HIT' : ''}`,
            sheet_idx: sheetIdx,
            sheet_name: sheetName,
            sheet_group: sheetGroup,
            stk_count: stkCount,
            cache_hit: sheetResult.cacheHit,
            input_tokens: sheetResult.inputTokens,
            output_tokens: sheetResult.outputTokens,
            cache_creation_tokens: sheetResult.cacheCreationTokens,
            cache_read_tokens: sheetResult.cacheReadTokens,
            latency_ms: sheetResult.latencyMs,
          });

          return { success: true, si, sheetResult };
        } catch (e) {
          if (childId) {
            await sb(`/ai_generations?id=eq.${childId}`, 'PATCH', {
              status: 'failed',
              error_message: e.message?.slice(0, 1000),
            }).catch(() => {});
          }
          console.error(`[generate] Sheet ${sheetIdx} failed:`, e.message);
          // Phase 2-2d: 시트 실패 알림
          emit('progress', {
            step: 'sheet_failed',
            message: `시트 ${sheetIdx}/${sheetBasedInputs.length} 실패: ${e.message?.slice(0, 200)}`,
            sheet_idx: sheetIdx,
            sheet_name: sheetName,
            error: e.message?.slice(0, 500),
          });
          return { success: false, si, error: e.message };
        }
      };  // makeCallTask end

      // Phase 2-2e: Batch 처리 — Anthropic Tier 1 한도 + Vercel proxy 침묵 타임아웃 회피
      //
      // 동시에 모든 시트를 fetch 시작하면 Anthropic Tier 1 한도(50 RPM / 30K ITPM) 초과로 일부 시트가 큐 대기.
      // 큐 대기 중에는 SSE 이벤트가 안 나가서 Vercel proxy 가 침묵 타임아웃으로 연결을 끊을 수 있음.
      //
      // 해결: SHEET_BATCH_SIZE (기본 2) 씩 묶어서 순차 처리.
      //   - 각 batch 내부: 병렬 (BATCH_SIZE 만큼)
      //   - batch 간: 순차 (이전 batch 완료 대기)
      //   - 각 batch 시작/완료 시 SSE 이벤트 emit → proxy 연결 유지
      //
      // 예시 (시트 4개, BATCH_SIZE=2):
      //   batch 1: 시트 1, 2 동시 (~5분)  → batch_done emit
      //   batch 2: 시트 3, 4 동시 (~5분)  → batch_done emit
      //   total: ~10분 (Vercel 800초 안전, Tier 1 안전)
      const callTaskFactories = sheetTasks.map((task, i) => makeCallTask(task, i));
      const totalBatches = Math.ceil(callTaskFactories.length / SHEET_BATCH_SIZE);
      const callResults = [];

      emit('progress', {
        step: 'batch_plan',
        message: `시트 ${callTaskFactories.length}개를 ${SHEET_BATCH_SIZE}개씩 ${totalBatches}배치로 순차 처리`,
        batch_size: SHEET_BATCH_SIZE,
        total_batches: totalBatches,
        total_sheets: callTaskFactories.length,
      });

      // ──────────────────────────────────────────────────
      // Phase 2-2f: SSE Keep-alive (25초마다 ping)
      // ──────────────────────────────────────────────────
      // 문제: 시트 4개 시나리오에서 `await callClaude(...)` 가 4~5분 걸리는 동안
      //       SSE 이벤트가 전혀 안 나가서 Vercel Edge Proxy 가 침묵 타임아웃
      //       (~30~60초)으로 연결을 끊는 경우 발생 (오늘 NAD060520.08:49 사고).
      //
      // 해결: 25초마다 `ping` 이벤트를 emit → proxy 가 연결을 살아있다고 판단.
      //   - 25초 = Vercel 침묵 임계값보다 안전한 마진
      //   - 비용: 25s 마다 ~60B → 10분 배치당 ~1.4KB (무시 가능)
      //   - streaming 모드일 때만 활성 (JSON 모드 timer 낭비 방지)
      //   - try/finally 로 어떤 경로(success/throw/abort)든 cleanup 보장
      //
      // 주의: 프론트엔드는 'ping' 이벤트를 무시(또는 디버그 로그)만 함 — UI 영향 없음
      let pingCount = 0;
      const KEEPALIVE_INTERVAL_MS = 25000;
      const keepAliveInterval = emitter.streaming
        ? setInterval(() => {
            pingCount += 1;
            try {
              sseSend(res, 'ping', { ts: Date.now(), seq: pingCount });
            } catch (e) {
              console.error('[keepalive] ping write failed:', e.message);
            }
          }, KEEPALIVE_INTERVAL_MS)
        : null;

      try {
        for (let b = 0; b < totalBatches; b++) {
          const start = b * SHEET_BATCH_SIZE;
          const end = Math.min(start + SHEET_BATCH_SIZE, callTaskFactories.length);
          const batchIdx = b + 1;

          emit('progress', {
            step: 'batch_start',
            message: `배치 ${batchIdx}/${totalBatches} 시작 (시트 ${start + 1}~${end})`,
            batch_idx: batchIdx,
            batch_total: totalBatches,
            sheets_in_batch: end - start,
            sheets_start_idx: start + 1,
            sheets_end_idx: end,
          });

          const batchStartTime = Date.now();
          // 이 batch 의 task 들을 동시에 실행 (BATCH_SIZE 만큼만 — Tier 한도 안전)
          const batchResults = await Promise.all(
            callTaskFactories.slice(start, end).map(fn => fn())
          );
          const batchDuration = Date.now() - batchStartTime;

          callResults.push(...batchResults);

          const batchSucceeded = batchResults.filter(r => r.success).length;
          const batchFailed = batchResults.filter(r => !r.success).length;
          emit('progress', {
            step: 'batch_done',
            message: `배치 ${batchIdx}/${totalBatches} 완료 (성공 ${batchSucceeded}, 실패 ${batchFailed}, ${Math.round(batchDuration / 1000)}s)`,
            batch_idx: batchIdx,
            batch_total: totalBatches,
            batch_succeeded: batchSucceeded,
            batch_failed: batchFailed,
            batch_duration_ms: batchDuration,
          });

          console.log(
            `[generate] Batch ${batchIdx}/${totalBatches} done: ` +
            `${batchSucceeded} success, ${batchFailed} failed, ${Math.round(batchDuration / 1000)}s`
          );
        }
      } finally {
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          console.log(
            `[generate] Keep-alive stopped: ${pingCount} pings sent ` +
            `(~${Math.round(pingCount * KEEPALIVE_INTERVAL_MS / 1000)}s monitored)`
          );
        }
      }

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

      // 토큰/비용/지연 누적 (Phase 2-2d: cache 토큰도 누적)
      for (const r of successResults) {
        totalInputTokens += r.sheetResult.inputTokens;
        totalOutputTokens += r.sheetResult.outputTokens;
        totalCacheCreationTokens += r.sheetResult.cacheCreationTokens;
        totalCacheReadTokens += r.sheetResult.cacheReadTokens;
        rawOutputLog += `\n=== Sheet: ${r.si.sheet.sheet_name} ===\n${r.sheetResult.rawOutput}\n`;
      }
      // 병렬이므로 latency 는 가장 긴 시트 기준 (실제 wall-clock time)
      totalLatencyMs = Math.max(0, ...successResults.map(r => r.sheetResult.latencyMs));

      // 결과 병합
      // Phase 2-2d: 병합 단계 알림
      emit('progress', {
        step: 'merging',
        message: `${successResults.length}개 시트 결과 병합 중`,
        success_count: successResults.length,
        failed_count: failedResults.length,
      });
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
      // Phase 2-2d: 단일 호출 시작 알림
      emit('progress', {
        step: 'single_call_start',
        message: 'Claude Opus 4.7 단일 호출 시작 (adaptive thinking)',
      });

      // Phase 2-2f: 단일 호출 경로에도 Keep-alive 적용 (legacy path 보호)
      // 단일 callClaude 도 4~5분 걸릴 수 있어 같은 silence 문제 가능
      let pingCountSingle = 0;
      const keepAliveSingle = emitter.streaming
        ? setInterval(() => {
            pingCountSingle += 1;
            try {
              sseSend(res, 'ping', { ts: Date.now(), seq: pingCountSingle });
            } catch (e) {
              console.error('[keepalive-single] ping write failed:', e.message);
            }
          }, 25000)
        : null;

      let claudeResult;
      try {
        const userPrompt = buildUserPrompt(process_id, wp.content, project);
        claudeResult = await callClaude({
          systemPrompt,
          userPrompt,
          schema: OUTPUT_SCHEMAS[process_id],
        });
      } finally {
        if (keepAliveSingle) {
          clearInterval(keepAliveSingle);
          console.log(`[generate] Single-call keep-alive stopped: ${pingCountSingle} pings sent`);
        }
      }

      parsedOutput = claudeResult.parsedOutput;
      totalInputTokens = claudeResult.inputTokens;
      totalOutputTokens = claudeResult.outputTokens;
      // Phase 2-2d: cache 토큰 누적
      totalCacheCreationTokens = claudeResult.cacheCreationTokens;
      totalCacheReadTokens = claudeResult.cacheReadTokens;
      totalLatencyMs = claudeResult.latencyMs;
      finishReason = claudeResult.finishReason;
      rawOutputLog = claudeResult.rawOutput;

      // Phase 2-2d: 단일 호출 완료 알림
      emit('progress', {
        step: 'single_call_done',
        message: `단일 호출 완료: ${parsedOutput.stakeholder_requirements?.length || 0}개 STK_REQ`,
        stk_count: parsedOutput.stakeholder_requirements?.length || 0,
        cache_hit: claudeResult.cacheHit,
        latency_ms: claudeResult.latencyMs,
      });
    }

    // 6. 5축 가드레일 검증
    // Phase 2-2d: 가드레일 시작 알림
    emit('progress', {
      step: 'guardrail_running',
      message: '5축 가드레일 검증 중 (① 구조 / ② 추적성 / ③ 도메인)',
    });
    const guardrailResult = await runGuardrails({
      processId: process_id,
      output: parsedOutput,
      input: wp.content,
    });

    const passed = guardrailResult.overall_passed;
    // Phase 2-2d: 가드레일 결과 알림
    emit('progress', {
      step: 'guardrail_done',
      message: passed
        ? '5축 가드레일 통과'
        : `5축 가드레일 차단: ${(guardrailResult.failed_axes || []).join(', ')}`,
      passed,
      failed_axes: guardrailResult.failed_axes || [],
    });

    // Phase 2-2d: Prompt Caching 반영 비용
    const cost = estimateCost(
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens
    );

    // Phase 2-2d: 캐시 효과 로깅
    if (totalCacheReadTokens > 0 || totalCacheCreationTokens > 0) {
      const cachedTokens = totalCacheReadTokens + totalCacheCreationTokens;
      const totalTokensSeen = totalInputTokens + cachedTokens;
      const cacheRatio = totalTokensSeen > 0
        ? ((totalCacheReadTokens / totalTokensSeen) * 100).toFixed(1)
        : '0.0';
      // 캐시 없이의 추정 비용 (cache_read도 정가로 친 경우)
      const noCacheInputCost =
        ((totalInputTokens + totalCacheCreationTokens + totalCacheReadTokens) * 15) / 1_000_000;
      const noCacheCost = noCacheInputCost + (totalOutputTokens * 75) / 1_000_000;
      const savings = noCacheCost - cost;
      console.log(
        `[generate] cache stats: read=${totalCacheReadTokens}, created=${totalCacheCreationTokens}, ` +
        `regular_input=${totalInputTokens}, hit_ratio=${cacheRatio}%, ` +
        `cost=$${cost.toFixed(4)} (saved ~$${savings.toFixed(4)} vs no-cache)`
      );
    }

    // Phase 2-2d: 저장 시작 알림
    emit('progress', {
      step: 'saving',
      message: '산출물 저장 중',
      cost_usd: cost,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      cache_read_tokens: totalCacheReadTokens,
      cache_creation_tokens: totalCacheCreationTokens,
    });

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
    // Phase 2-2d: streaming/non-streaming 분기
    const finalPayload = {
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
        // Phase 2-2d: cache 정보도 포함
        cache_creation_tokens: totalCacheCreationTokens,
        cache_read_tokens: totalCacheReadTokens,
        cost_usd: cost,
        latency_ms: totalLatencyMs,
        sheet_split_mode: useSheetSplit,
        sheet_count: useSheetSplit ? sheetBasedInputs.length : 0,
      },
    };

    if (streaming) {
      // SSE: complete 이벤트로 전체 결과 전송 후 종료
      sseSend(res, 'complete', finalPayload);
      return res.end();
    }
    return res.status(200).json(finalPayload);
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

    // Phase 2-2d: streaming 모드에서는 error 이벤트로
    if (streaming) {
      sseSend(res, 'error', {
        error: error.message,
        ai_generation_id: aiGenId,
      });
      return res.end();
    }
    return res.status(500).json({
      error: error.message,
      ai_generation_id: aiGenId,
    });
  }
}

// Phase 2-2c (Pro): Vercel 함수 maxDuration = 800초 (vercel.json에서 설정)

// ──────────────────────────────────────────────────
// Phase 2-2g (옵션 G — Function Chunking) 용 named exports
// generate-batch.js, generate-merge.js 가 재사용.
// 기존 default export (handler) 는 그대로 — Vercel 은 default 만 endpoint 로 인식.
// ──────────────────────────────────────────────────
export {
  // 헬퍼
  sb,
  callClaude,
  composeSystemPrompt,
  buildSheetUserPrompt,
  buildUserPrompt,
  labelOf,
  mergePerSheetOutputs,
  estimateCost,
  stateToStatus,
  syncStateAndStatus,
  // SSE 도구
  sseSend,
  initSSE,
  wantsStreaming,
  createEmitter,
  // 스키마
  OUTPUT_SCHEMAS,
  PER_SHEET_SCHEMA,
  STK_REQ_ITEM_SCHEMA,
  // 상수
  TIMEOUT_MS,
  MAX_TOKENS,
  MODEL,
  PROVIDER,
  SHEET_BATCH_SIZE,
  SKILLS_INDEX,
};

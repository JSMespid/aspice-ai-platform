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
// Output Schema for SYS.1 (Phase 2-2a 의 첫 대상)
// 화면설계서 v260506 SYS.1 + traceability-rules SKILL 기반
// ──────────────────────────────────────────────────
const OUTPUT_SCHEMAS = {
  'SYS.1': {
    type: 'object',
    properties: {
      process: { type: 'string', enum: ['SYS.1'] },
      title: { type: 'string' },
      stakeholder_requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^STK_REQ_[0-9]{3}$' },
            category: { type: 'string', enum: ['functional', 'non_functional', 'interface', 'constraint'] },
            statement: { type: 'string' },
            rationale: { type: 'string' },
            source_doc: { type: 'string' },
            priority: { type: 'string', enum: ['must', 'should', 'could'] },
            verification_method: { type: 'string', enum: ['test', 'analysis', 'inspection', 'demonstration'] },
          },
          required: ['id', 'category', 'statement', 'rationale', 'source_doc', 'priority', 'verification_method'],
          additionalProperties: false,
        },
        minItems: 1,
      },
      use_cases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^UC_[0-9]{3}$' },
            name: { type: 'string' },
            actor: { type: 'string' },
            preconditions: { type: 'array', items: { type: 'string' } },
            main_flow: { type: 'array', items: { type: 'string' } },
            postconditions: { type: 'array', items: { type: 'string' } },
            linked_requirements: {
              type: 'array',
              items: { type: 'string', pattern: '^STK_REQ_[0-9]{3}$' },
            },
          },
          required: ['id', 'name', 'actor', 'preconditions', 'main_flow', 'postconditions', 'linked_requirements'],
          additionalProperties: false,
        },
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
      traceability_seeds: {
        type: 'object',
        properties: {
          from_sw_req: { type: 'array', items: { type: 'string' } },
          from_hw_req: { type: 'array', items: { type: 'string' } },
          from_sow:    { type: 'array', items: { type: 'string' } },
        },
        required: ['from_sw_req', 'from_hw_req', 'from_sow'],
        additionalProperties: false,
      },
    },
    required: ['process', 'title', 'stakeholder_requirements', 'use_cases', 'operational_context', 'traceability_seeds'],
    additionalProperties: false,
  },
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
  lines.push(`# Input Items`);
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
  lines.push(`Generate the ${processId} work product per the loaded Skills. Follow all checklists. Output strictly conforming JSON.`);
  return lines.join('\n');
}

function labelOf(processId, key) {
  const map = {
    'SYS.1': { sw_req: 'SW Requirements', hw_req: 'HW Requirements', sow: 'Statement of Work' },
  };
  return (map[processId] && map[processId][key]) || key;
}

// ──────────────────────────────────────────────────
// Claude API 호출 (with Structured Outputs)
// ──────────────────────────────────────────────────
async function callClaude({ systemPrompt, userPrompt, schema }) {
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
    await sb(`/work_products?id=eq.${wp.id}`, 'PATCH', { state: 'GENERATING' });
    await sb(`/state_transitions`, 'POST', {
      work_product_id: wp.id,
      from_state: wp.state || 'INITIAL',
      to_state: 'GENERATING',
      trigger: 'ai_generation',
      reason: `AI generation triggered for ${process_id}`,
    }, 'return=minimal');

    // 3. system + user prompt 구성
    const systemPrompt = composeSystemPrompt(process_id);
    const userPrompt = buildUserPrompt(process_id, wp.content, project);
    const schema = OUTPUT_SCHEMAS[process_id];
    const skillsUsed = SKILLS_INDEX[process_id] || [];

    // 4. ai_generations 사전 row 생성 (실패해도 기록 남도록)
    const [created] = await sb(`/ai_generations`, 'POST', {
      project_id,
      process_id,
      work_product_id: wp.id,
      agent_role: 'generator',
      agent_step: 1,
      model: MODEL,
      provider: PROVIDER,
      system_prompt: systemPrompt.slice(0, 50000),  // 너무 크면 자름
      user_prompt: userPrompt,
      skills_used: skillsUsed,
      status: 'pending',
    }, 'return=representation') || [];
    aiGenId = created?.id;

    // 5. Claude 호출
    const claudeResult = await callClaude({ systemPrompt, userPrompt, schema });

    // 6. 5축 가드레일 검증
    const guardrailResult = await runGuardrails({
      processId: process_id,
      output: claudeResult.parsedOutput,
      input: wp.content,
    });

    const passed = guardrailResult.overall_passed;
    const cost = estimateCost(claudeResult.inputTokens, claudeResult.outputTokens);

    // 7. ai_generations 업데이트
    if (aiGenId) {
      await sb(`/ai_generations?id=eq.${aiGenId}`, 'PATCH', {
        raw_output: claudeResult.rawOutput,
        parsed_output: claudeResult.parsedOutput,
        finish_reason: claudeResult.finishReason,
        input_tokens: claudeResult.inputTokens,
        output_tokens: claudeResult.outputTokens,
        cost_usd: cost,
        latency_ms: claudeResult.latencyMs,
        guardrail_result: guardrailResult,
        guardrail_passed: passed,
        status: passed ? 'success' : 'blocked_by_guardrail',
      });
    }

    // 8. work_products 업데이트
    const newState = passed ? 'GENERATED' : 'REJECTED';
    const newContent = passed
      ? { ...wp.content, ai_generated: claudeResult.parsedOutput }
      : wp.content;

    await sb(`/work_products?id=eq.${wp.id}`, 'PATCH', {
      state: newState,
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
        latency_ms: claudeResult.latencyMs,
      },
    }, 'return=minimal');

    // 10. 응답
    return res.status(200).json({
      success: true,
      passed,
      state: newState,
      ai_generation_id: aiGenId,
      output: claudeResult.parsedOutput,
      guardrail_result: guardrailResult,
      meta: {
        model: MODEL,
        skills_used: skillsUsed,
        input_tokens: claudeResult.inputTokens,
        output_tokens: claudeResult.outputTokens,
        cost_usd: cost,
        latency_ms: claudeResult.latencyMs,
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

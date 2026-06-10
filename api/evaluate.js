// api/evaluate.js — Gemini Evaluator for ASPICE QA (Phase 2-4)
//
// 역할 / Role:
//   POST /api/evaluate
//   - 입력: { ai_generation_id, generated_output, process_id, project_id, work_product_id }
//   - 동작: Gemini 가 Claude Opus 4.7 결과를 독립 평가
//   - 출력: critique (verdict + issues + strengths + score)
//
// ── Phase 2-4 변경사항 (Gemini 응답 파싱 근본 수정 + ASPICE 지식베이스) ──
//
// [버그 수정] "All Gemini models failed: JSON parse failed: No JSON object found"
//   원인 1: parts[0].text 만 읽음 → Gemini 2.5/-latest 계열(thinking 모델)은
//           응답이 여러 parts 로 나뉘고 첫 part 가 사고(thought) 텍스트일 수 있음.
//     해결: 모든 text parts 를 결합하고 thought part 는 제외.
//   원인 2: MAX_OUTPUT_TOKENS 8192 → 380개 STK_REQ 평가 시 JSON 이 중간에 잘림
//           (닫는 } 가 없어 추출 실패).
//     해결: 32768 로 증대 (Gemini 2.x 최대 65536) + finishReason=MAX_TOKENS 감지.
//   원인 3: discoverModels 가 -latest/preview/exp alias 모델을 1순위로 잡음
//           (alias 는 예고 없이 thinking 모델로 바뀌어 응답 형식이 달라짐).
//     해결: alias/실험 모델 제외, 버전 고정 모델 우선.
//   원인 4: userPrompt 가 pretty-print JSON (indent 2) → 토큰 2배 낭비.
//     해결: compact stringify.
//
// [신규] ASPICE PAM v4.0 지식베이스 주입 (RAG):
//   - Voyage 임베딩 + Supabase pgvector (기존 RAG 인프라 재사용)
//   - standard_chunks 에서 standard_body='ASPICE' (PAM v4.0 SYS.1 기준) 와
//     'ASPICE-USER' (사용자가 학습시킨 평가 기준·지적사례) 를 검색
//   - 검색된 기준을 평가 프롬프트에 주입 → Gemini 가 PAM 원문 근거로 평가
//   - VOYAGE_API_KEY 없거나 검색 실패 시 안전하게 skip (기존 동작 유지)
//   - "사용자 학습" = api/knowledge-upload.js 로 기준 추가 → 즉시 다음 평가에 반영

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 32768;   // Phase 2-4: 8192 → 32768 (대형 산출물 평가 잘림 방지)
const PROVIDER = 'google';

// Voyage (지식베이스 검색용 — citation-verifier.js 와 동일 설정)
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';
const EMBED_DIM = parseInt(process.env.EMBED_DIM || '1024', 10);

// 우선순위 순 시도 모델 — 버전 고정(stable) 모델만
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash',
];

// ──────────────────────────────────────────────────
// Supabase REST 헬퍼 (generate.js 와 동일 패턴)
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
// Phase 2-4: ASPICE 지식베이스 검색 (RAG)
// ──────────────────────────────────────────────────
// 기존 RAG 인프라(Voyage + match_standard_chunks) 재사용.
// - 'ASPICE'      : PAM v4.0 SYS.1 원문 기준 (aspice_sys1_knowledge.jsonl 로 적재)
// - 'ASPICE-USER' : 사용자가 knowledge-upload 로 학습시킨 기준·지적사례
// 실패는 모두 안전 skip — 평가 자체를 막지 않음.
async function fetchAspiceKnowledge(processId) {
  const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
  if (!VOYAGE_API_KEY) {
    console.log('[evaluate] 지식베이스 skip: VOYAGE_API_KEY 없음');
    return null;
  }
  try {
    // 평가 기준 검색 질의 (프로세스별 — 현재 SYS.1)
    const query =
      `${processId} stakeholder requirements elicitation base practices ` +
      `evaluation criteria output information items traceability agreement ` +
      `요구사항 도출 평가 기준 추적성 합의 검증기준`;

    // 1) 질의 임베딩
    const embRes = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: [query],
        input_type: 'query',
        output_dimension: EMBED_DIM,
      }),
    });
    if (!embRes.ok) {
      console.log(`[evaluate] 지식베이스 skip: Voyage ${embRes.status}`);
      return null;
    }
    const embedding = (await embRes.json()).data[0].embedding;
    const embStr = `[${embedding.join(',')}]`;

    // 2) PAM 원문 + 사용자 학습 지식 모두 검색
    const results = [];
    for (const body of ['ASPICE', 'ASPICE-USER']) {
      try {
        const rows = await sb('/rpc/match_standard_chunks', 'POST', {
          query_embedding: embStr,
          match_count: 6,
          filter_body: body,
        });
        if (Array.isArray(rows)) results.push(...rows);
      } catch (e) {
        // 한쪽 body 검색 실패는 무시하고 계속
        console.log(`[evaluate] 지식 검색 부분 실패(${body}): ${e.message?.slice(0, 120)}`);
      }
    }
    if (results.length === 0) {
      console.log('[evaluate] 지식베이스: 검색 결과 0건 (코퍼스 미적재?)');
      return null;
    }

    // 3) 유사도 상위 8개를 프롬프트 주입용 텍스트로 구성
    const top = results
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 8);
    const formatted = top
      .map(r =>
        `[${r.standard_id || 'PAM'} ${r.clause || ''} — ${r.title || ''}]` +
        `\n${String(r.content || '').slice(0, 1500)}`
      )
      .join('\n\n---\n\n');

    console.log(`[evaluate] 지식베이스 주입: ${top.length}개 청크 (최고 유사도 ${(top[0].similarity || 0).toFixed(3)})`);
    return formatted;
  } catch (e) {
    console.log(`[evaluate] 지식베이스 skip(오류): ${e.message?.slice(0, 200)}`);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Evaluator System Prompt 구성 (Phase 2-4)
// knowledgeBlock: fetchAspiceKnowledge() 결과 (null 이면 섹션 생략)
// ──────────────────────────────────────────────────
function composeEvaluatorPrompt(processId, knowledgeBlock) {
  const knowledgeSection = knowledgeBlock
    ? `
═══════════════════════════════════════════════════════════════════
## ⭐ ASPICE PAM v4.0 KNOWLEDGE BASE (Retrieved) / 평가 기준 지식베이스
═══════════════════════════════════════════════════════════════════

The following are AUTHORITATIVE evaluation criteria retrieved from the ASPICE PAM v4.0
knowledge base (and user-curated assessment knowledge). Evaluate the artifact AGAINST
these criteria. When you flag an issue grounded in these criteria, cite the clause
(e.g., "SYS.1.BP1", "17-54 속성") in the evidence field.

다음은 ASPICE PAM v4.0 지식베이스(및 사용자 등록 평가 기준)에서 검색된 공식 평가 기준입니다.
산출물을 이 기준에 비추어 평가하고, 기준에 근거한 결함은 evidence 에 해당 조항
(예: "SYS.1.BP1", "17-54 속성")을 인용하세요.

${knowledgeBlock}

═══════════════════════════════════════════════════════════════════
`
    : '';

  return `You are an independent ASPICE PAM v4.0 quality assurance reviewer with 15+ years of experience in automotive software audit. You did NOT generate the artifact below; another AI did. Your role is to find issues, NOT to praise.

당신은 독립적인 ASPICE PAM v4.0 품질 평가자입니다 (자동차 SW 감사 15년+ 경력). 아래 산출물은 다른 AI 가 생성한 것이며, 당신의 역할은 결함을 찾는 것이지 칭찬하는 것이 아닙니다.
${knowledgeSection}
═══════════════════════════════════════════════════════════════════
## ⭐ CRITICAL CONTEXT — READ FIRST / 핵심 컨텍스트 — 먼저 읽으세요
═══════════════════════════════════════════════════════════════════

This artifact was generated under the **OEM-Supplier workflow** for automotive software development:

본 산출물은 자동차 SW 개발의 **OEM-공급사 워크플로우** 하에서 생성되었습니다:

\`\`\`
[CUSTOMER (OEM) SIDE — 고객 측]            [SUPPLIER (Tier-1/2) SIDE — 공급사 측]
─────────────────────────────              ──────────────────────────────────
Inputs to supplier:                         ASPICE work products (assessed):
- SOW (Statement of Work)                   - SYS.1 (Stakeholder Requirements) ← THIS
- Customer SW Requirements (.xlsx)    ─→    - SYS.2 (System Requirements)
- Customer HW Requirements (.xlsx)    ─→    - SYS.3, SYS.4, SYS.5
- ICD (Interface Control Document)          - SWE.1 (SW Requirements) ← DIFFERENT from input!
\`\`\`

### ⚠️ CRITICAL — DO NOT MISJUDGE / 결정적 오판 방지

**A SYS.1 STK_REQ citing "Customer SW Requirements" or "Customer HW Requirements" in source_doc is NORMAL AND REQUIRED, NOT a circular reference.**

**SYS.1 STK_REQ 가 source_doc 에 "Customer SW Requirements" / "Customer HW Requirements" 를 인용하는 것은 정상이며 필수입니다. 순환 참조(Circular Reference)가 아닙니다.**

Why / 이유:
- "Customer SW Requirements" is the OEM's INPUT to the supplier, NOT the supplier's SWE.1 output.
- SYS.1 is the FIRST supplier-side translation of customer intent into structured requirements.
- Citing customer documents in source_doc reflects the standard OEM-Supplier flow.

❌ DO NOT flag these as issues:
  - "STK_REQ_CELLULAR_001 cites Customer SW Req §X — this is circular reference" → WRONG
  - "Input document name contains 'Requirements' — this should be SWE.1, why is it being re-derived?" → WRONG
  - "STK_REQ source_doc references a customer file, this is suspicious" → WRONG

✅ Correct interpretation:
  - "STK_REQ_CELLULAR_001 cites Customer SW Req §X, Row 5 — this is the correct standard flow"

═══════════════════════════════════════════════════════════════════
## ⭐ SCHEMA AWARENESS — Phase 2-2c Updates / 스키마 인식
═══════════════════════════════════════════════════════════════════

The ${processId} artifact uses the Phase 2-2c schema with these features:

### Extended STK_REQ ID Pattern / 확장 ID 패턴

- **Worksheet-based input**: \`STK_REQ_<GROUP>_NNN\` (e.g., STK_REQ_CELLULAR_001, STK_REQ_HWEU_005)
- **Non-worksheet input (fallback)**: \`STK_REQ_NNN\` (e.g., STK_REQ_001)

BOTH patterns are valid. Do NOT flag the extended pattern as an error.

NOTE on numbering: 전역 연번 정책에 따라 NNN 은 문서 전체를 관통하는 연속 번호이며,
그룹 경계에서 001 로 리셋되지 않습니다 (예: HWEU_001~086, HWCHINA_087~172).
그룹별 시작 번호가 001 이 아니라는 이유로 결함 판정하지 마세요.

### New Required Fields per STK_REQ / 신규 필수 필드

- \`group\` — Uppercase abbreviation (e.g., "CELLULAR") or null for non-worksheet
- \`sheet_source\` — Original sheet name (e.g., "Cellular Stack") or null
- \`source_row\` — Row number in source sheet (integer) or null
- \`source_item_id\` — Customer's original ID (e.g., "SW-005") or null
- \`clarification_needed\` — Boolean; true if customer input was vague (preserved verbatim)

### Coverage Matrix (NEW) / Coverage Matrix (신규)

The artifact MUST include a top-level \`coverage_matrix\` field with:
- \`by_group[]\` — Per-group statistics (input_rows, derived_stk_reqs, ratio, unmapped_input_rows)
- \`summary\` — Overall statistics (total_input_rows, total_stk_reqs, overall_ratio, status)
- \`status\` values: "compliant" | "spec_loss" | "over_decomposed"

### Removed Field / 제거된 필드

- ❌ \`use_cases\` — REMOVED in Phase 2-2c (was source of hallucination)
- DO NOT flag the absence of use_cases as a missing field — this is intentional.

═══════════════════════════════════════════════════════════════════
## Your Task / 당신의 임무
═══════════════════════════════════════════════════════════════════

Critically review the ${processId} work product. Find issues in these SIX categories:

### 1. Hallucinations / 환각

- Claims NOT supported by input documents / 입력에 근거 없는 주장
- Invented standards or regulations / 가공된 표준·법규
- Made-up technical specifications / 임의 기술 사양
- Domain-knowledge inference NOT present in input (e.g., adding "LTE Cat-4 150 Mbps" when input only says "LTE")

**Do NOT flag** / 결함 판정 금지:
- ❌ STK_REQ citing customer SW/HW Requirements documents (this is the correct OEM-Supplier flow)

### 2. Inconsistencies / 불일치

- Contradictions within the artifact / 산출물 내부 모순
- Unit mismatches (Mbps vs MB/s, ms vs s) / 단위 불일치
- Conflicting specifications between STK_REQs / STK_REQ 간 사양 충돌

### 3. ASPICE Non-compliance / ASPICE 비준수

- Missing or empty \`source_doc\` / 출처 누락 또는 빈 값 (PAM SYS.1.BP1: 출처 문서화는 합의·변경분석의 전제)
- Vague terms without numbers (fast, real-time, robust, sufficient) IF NOT preserved-vagueness
- Wrong sentence pattern (must follow IEEE 830 "X shall Y") / 잘못된 문장 패턴
- rationale in English when should be Korean / rationale 영문 (한글이어야 함)
- Missing new schema fields (group, sheet_source, source_row, source_item_id, clarification_needed)
- ID pattern violations (must match \`STK_REQ_NNN\` or \`STK_REQ_<GROUP>_NNN\`)

### 4. Domain Errors / 도메인 오류

- Wrong regulation citations (e.g., ECE R10 misused, ASIL misassigned) / 잘못된 법규 인용
- Incorrect technical specifications / 잘못된 기술 사양
- Inappropriate ISO 26262 ASIL level for safety functions / 부적절한 ASIL 등급

### 5. Traceability Gaps / 추적성 결함

- Orphan STK_REQs (no source_doc) / 출처 없는 STK_REQ (PAM: 양방향 추적성의 씨앗 부재)
- ID pattern violations / ID 패턴 위반
- source_row / source_item_id 가 source_doc 인용과 불일치
- For worksheet-based artifacts: STK_REQ with null group/sheet_source while OTHER STK_REQs have them

### 6. ⭐ Spec-Preservation Violations / 스펙 보존 위반

**This is the most critical category for OEM-Supplier projects.**

The Spec-Preservation Principle requires: every customer input item → ≥1 STK_REQ, with overall ratio in [1.0, 1.3].

**Flag the following as critical or high severity**:

- **coverage_matrix.summary.status is "spec_loss"** (overall_ratio < 1.0)
  → CRITICAL: Customer specifications were lost during derivation
- **coverage_matrix.summary.status is "over_decomposed"** (overall_ratio > 1.3)
  → HIGH: Excessive decomposition, possibly fabricated content
- **Any group has unmapped_input_rows (non-empty array)**
  → CRITICAL: Specific input rows have no corresponding STK_REQ
- **Detected abstraction/compression patterns** (even if coverage_matrix says compliant):
  - "Multi-X" or "Multi-protocol" generalizations replacing multiple specific items
  - "and/or" merges of distinct customer requirements
  - Wording like "as specified" instead of specific values from input
  → HIGH: Hidden spec loss not caught by ratio check
- **Missing coverage_matrix field entirely**
  → CRITICAL: Schema non-compliance, cannot verify spec preservation

**Do NOT flag** / 결함 판정 금지:
- ❌ 1:N splits of composite inputs (e.g., one input "X shall do A AND B AND C" → 3 STK_REQs)
- ❌ Ratio slightly above 1.0 (e.g., 1.05) — this is normal for clean inputs
- ❌ Single input with clarification_needed:true preserved verbatim with vague terms

═══════════════════════════════════════════════════════════════════
## Severity Levels / 심각도 등급
═══════════════════════════════════════════════════════════════════

- **critical**: ASPICE assessment will fail / ASPICE 평가 실패 사유
- **high**: Significant rework needed / 상당한 재작업 필요
- **medium**: Improvement recommended / 개선 권장
- **low**: Minor polish / 경미한 다듬기

═══════════════════════════════════════════════════════════════════
## Verdict Decision Rules / 판정 결정 규칙
═══════════════════════════════════════════════════════════════════

- **passed**: overall_score >= 0.85 AND no critical issues AND coverage_matrix.summary.status === "compliant"
- **needs_refinement**: 0.60 <= overall_score < 0.85 OR has high/medium issues only
- **rejected**: overall_score < 0.60 OR has any critical issues OR coverage_matrix.summary.status === "spec_loss"

═══════════════════════════════════════════════════════════════════
## Output Format / 출력 형식
═══════════════════════════════════════════════════════════════════

You MUST respond with ONLY a valid JSON object (no markdown, no preamble) matching this schema:

\`\`\`
{
  "overall_score": 0.85,
  "verdict": "passed" | "needs_refinement" | "rejected",
  "summary": "한글 1~2문장으로 전체 평가 요약 (Korean)",
  "coverage_assessment": {
    "matrix_present": true,
    "status_reported": "compliant" | "spec_loss" | "over_decomposed" | "missing",
    "overall_ratio": 1.034,
    "hidden_compression_detected": false,
    "notes": "한글 평가 메모"
  },
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "hallucination" | "inconsistency" | "aspice_compliance" | "domain_error" | "traceability" | "spec_preservation",
      "target_id": "STK_REQ_CELLULAR_005" | "STK_REQ_005" | "coverage_matrix" | null,
      "issue": "무엇이 잘못됐는지 (한글)",
      "evidence": "구체 인용 또는 PAM 조항 참조 (가능하면 한글, 예: 'SYS.1.BP1 위반 — 출처 미기재')",
      "suggested_fix": "어떻게 고칠지 (한글)"
    }
  ],
  "strengths": [
    "긍정적인 점 1 (한글)",
    "긍정적인 점 2 (한글)"
  ],
  "refinement_instructions": "If verdict is 'needs_refinement', specific instructions for Generator to re-generate (한글). If 'passed' or 'rejected', use null."
}
\`\`\`

⚠️ ISSUE COUNT LIMIT: Report at most 40 issues, prioritized by severity (critical first).
If there are more, summarize the rest in the last issue entry as a pattern
(예: "동일 패턴의 모호 표현이 STK_REQ_SWNAD_201~265 에 23건 추가 존재").
This keeps the response within output limits.

═══════════════════════════════════════════════════════════════════
## Critical Reminders / 핵심 주의사항
═══════════════════════════════════════════════════════════════════

1. **OEM-Supplier context is non-negotiable**: STK_REQ citing customer documents is NORMAL. Never flag.
2. **Be skeptical**: Generator may have hallucinated. Only flag with specific evidence.
3. **Spec preservation is the prime directive**: Hidden compression is HIGH severity.
4. **Don't accept vague language**: "fast" without ms = violation, UNLESS clarification_needed:true.
5. **Korean rationale check**: English rationale → medium issue.
6. **Use Case is intentionally absent**: Do NOT flag.
7. **Output JSON only**: NO preamble, NO markdown fences.
8. **Be specific**: Each issue must have target_id and evidence.
9. **Coverage Matrix is mandatory**: missing → critical (spec_preservation).
10. **Ground in PAM knowledge**: When the knowledge base section is present, cite PAM clauses (SYS.1.BP1 등) in evidence.
`;
}

// ──────────────────────────────────────────────────
// Gemini API 호출 (자동 모델 fallback)
// ──────────────────────────────────────────────────
async function discoverModels(apiKey) {
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (!listRes.ok) return FALLBACK_MODELS;
    const listData = await listRes.json();
    const found = (listData.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    if (found.length === 0) return FALLBACK_MODELS;

    // Phase 2-4: alias/실험/멀티모달 모델 제외
    //  - latest/preview/exp: 예고 없이 내부 모델이 바뀌어(thinking 등) 응답 형식 불안정
    //  - tts/audio/embed/vision/aqa/image/live/think: 평가 용도 아님
    const filtered = found.filter(m =>
      !m.includes('tts') &&
      !m.includes('audio') &&
      !m.includes('embed') &&
      !m.includes('vision') &&
      !m.includes('aqa') &&
      !m.includes('think') &&
      !m.includes('image') &&
      !m.includes('live') &&
      !m.includes('latest') &&
      !m.includes('preview') &&
      !m.includes('exp')
    );

    // 검증된 FALLBACK_MODELS 중 실제 존재하는 것 최우선, 나머지 flash, 나머지 순
    const known = FALLBACK_MODELS.filter(m => filtered.includes(m));
    const rest = filtered.filter(m => !known.includes(m));
    const ordered = [
      ...known,
      ...rest.filter(m => m.includes('flash')),
      ...rest.filter(m => !m.includes('flash')),
    ];
    return ordered.length > 0 ? ordered : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

// Phase 2-4: thinking 모델 대응 — 모든 text parts 결합, thought part 제외
function extractTextFromCandidate(candidate) {
  const parts = candidate?.content?.parts || [];
  return parts
    .filter(p => typeof p.text === 'string' && p.text.length > 0 && p.thought !== true)
    .map(p => p.text)
    .join('')
    .trim();
}

function extractJson(rawText) {
  // markdown code fence 제거
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  // 첫 { ~ 마지막 } 사이 추출 (preamble 제거)
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in Gemini response');
  }
  const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonStr);
}

async function callGemini({ systemPrompt, userPrompt, apiKey }) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const availableModels = await discoverModels(apiKey);
    const tryModels = availableModels.slice(0, 6);
    console.log(`[evaluate] 시도 모델 순서: ${tryModels.join(', ')}`);

    let lastError = '';
    for (const model of tryModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          lastError = `[${model}] ${data.error?.message || res.status}`;
          continue;
        }

        const candidate = data.candidates?.[0];
        if (!candidate) {
          // 안전 필터 차단 등 — promptFeedback 에 사유가 있을 수 있음
          const block = data.promptFeedback?.blockReason || 'no candidates';
          lastError = `[${model}] ${block}`;
          continue;
        }

        // Phase 2-4: 잘림 감지 — MAX_TOKENS 면 JSON 이 불완전할 가능성 높음
        const finishReason = candidate.finishReason || 'unknown';

        // Phase 2-4: 모든 text parts 결합 (thinking 모델 대응)
        const rawText = extractTextFromCandidate(candidate);
        if (!rawText) {
          lastError = `[${model}] empty text (finish=${finishReason}, parts=${(candidate.content?.parts || []).length})`;
          continue;
        }

        let parsed = null;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          try {
            parsed = extractJson(rawText);
          } catch (e) {
            // 잘림이 원인이면 명확히 기록 (다음 모델로 fallback)
            lastError = finishReason === 'MAX_TOKENS'
              ? `[${model}] 응답이 maxOutputTokens(${MAX_OUTPUT_TOKENS})에서 잘려 JSON 불완전`
              : `[${model}] JSON parse failed: ${e.message}`;
            continue;
          }
        }

        const usage = data.usageMetadata || {};
        const latency = Date.now() - t0;

        console.log(
          `[evaluate] ${model} 성공: in=${usage.promptTokenCount || 0}, ` +
          `out=${usage.candidatesTokenCount || 0}, finish=${finishReason}, ${latency}ms`
        );

        return {
          rawOutput: rawText,
          parsedOutput: parsed,
          finishReason,
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
          latencyMs: latency,
          modelUsed: model,
        };
      } catch (e) {
        lastError = `[${model}] ${e.message}`;
      }
    }

    throw new Error(`All Gemini models failed: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────────
// 비용 추정 (Gemini 2.0 Flash 가격 기준)
// ──────────────────────────────────────────────────
function estimateCost(inputTokens, outputTokens, model) {
  if (model.includes('flash-lite') || model.includes('flash-8b')) {
    return (inputTokens * 0.075 / 1_000_000) + (outputTokens * 0.30 / 1_000_000);
  }
  return (inputTokens * 0.10 / 1_000_000) + (outputTokens * 0.40 / 1_000_000);
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const {
    ai_generation_id,
    generated_output,
    process_id,
    project_id,
    work_product_id,
  } = req.body || {};

  if (!generated_output || !process_id) {
    return res.status(400).json({ error: 'Missing generated_output or process_id' });
  }

  let evalGenId = null;

  try {
    // 1. Phase 2-4: ASPICE 지식베이스 검색 (실패 시 null — 평가는 계속)
    const knowledgeBlock = await fetchAspiceKnowledge(process_id);

    // 2. Evaluator system + user prompt 구성
    const systemPrompt = composeEvaluatorPrompt(process_id, knowledgeBlock);
    // Phase 2-4: compact stringify (pretty-print 는 토큰 2배 낭비 + 잘림 유발)
    const userPrompt =
      `Review the following ${process_id} work product carefully and return your critique as JSON only:\n\n` +
      JSON.stringify(generated_output);

    // 3. ai_generations 사전 행 (Evaluator step)
    if (project_id) {
      const [created] = await sb(`/ai_generations`, 'POST', {
        project_id,
        process_id,
        work_product_id: work_product_id || null,
        agent_role: 'evaluator',
        agent_step: 2,
        model: 'gemini-2.0-flash',
        provider: PROVIDER,
        system_prompt: systemPrompt.slice(0, 50000),
        user_prompt: userPrompt.slice(0, 50000),
        skills_used: knowledgeBlock ? ['aspice-pam-v40-knowledge'] : [],
        parent_generation_id: ai_generation_id || null,
        status: 'pending',
      }, 'return=representation') || [];
      evalGenId = created?.id;
    }

    // 4. Gemini 호출 (자동 fallback)
    const geminiResult = await callGemini({ systemPrompt, userPrompt, apiKey });
    const critique = geminiResult.parsedOutput;
    const cost = estimateCost(geminiResult.inputTokens, geminiResult.outputTokens, geminiResult.modelUsed);

    // 5. 가드레일 4축 (cross_verify) 결과 구성
    const issues = critique.issues || [];
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;
    const specPreservationCount = issues.filter(i => i.category === 'spec_preservation').length;

    const passed = critique.verdict === 'passed';

    // 6. ai_generations 업데이트
    if (evalGenId) {
      await sb(`/ai_generations?id=eq.${evalGenId}`, 'PATCH', {
        raw_output: geminiResult.rawOutput.slice(0, 100000),
        parsed_output: critique,
        finish_reason: geminiResult.finishReason,
        input_tokens: geminiResult.inputTokens,
        output_tokens: geminiResult.outputTokens,
        cost_usd: cost,
        latency_ms: geminiResult.latencyMs,
        guardrail_passed: passed,
        model: geminiResult.modelUsed,
        guardrail_result: {
          cross_verify: {
            passed,
            score: critique.overall_score,
            verdict: critique.verdict,
            summary: critique.summary,
            critical_count: criticalCount,
            high_count: highCount,
            medium_count: mediumCount,
            low_count: lowCount,
            spec_preservation_count: specPreservationCount,
            coverage_assessment: critique.coverage_assessment || null,
            // Phase 2-4: 지식베이스 사용 여부 기록 (심사 추적용)
            knowledge_base_used: !!knowledgeBlock,
          },
        },
        status: 'success',
      });
    }

    // 7. 응답
    return res.status(200).json({
      success: true,
      ai_generation_id: evalGenId,
      critique,
      meta: {
        model: geminiResult.modelUsed,
        provider: PROVIDER,
        input_tokens: geminiResult.inputTokens,
        output_tokens: geminiResult.outputTokens,
        cost_usd: cost,
        latency_ms: geminiResult.latencyMs,
        knowledge_base_used: !!knowledgeBlock,
      },
    });
  } catch (error) {
    console.error('[evaluate]', error);

    if (evalGenId) {
      try {
        await sb(`/ai_generations?id=eq.${evalGenId}`, 'PATCH', {
          status: 'failed',
          error_message: error.message?.slice(0, 1000),
        });
      } catch (e) { /* swallow */ }
    }

    return res.status(500).json({
      error: error.message,
      ai_generation_id: evalGenId,
    });
  }
}

// Vercel 함수 maxDuration (지식 검색 + Gemini fallback 여유)
export const config = {
  maxDuration: 300,
};

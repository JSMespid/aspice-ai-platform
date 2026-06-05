// src/lib/citation-verifier.js
// ============================================================
// 외부 표준 RAG — 런타임 인용 검증 모듈
// ============================================================
// 역할: Claude 가 생성한 STK_REQ 들에서 표준 인용을 추출 →
//       Voyage 질의 임베딩 → pgvector(match_standard_chunks) 검색 →
//       실재성/정확도 판정(verified / weak_match / not_found)
//
// 설계 원칙:
//   - 차단(blocking)이 아니라 WARNING 으로 시작. 0604-5 같은 정상 산출물을
//     인용 검증 실패로 막지 않음. 결과는 warnings + citation_verifications 로그.
//   - VOYAGE_API_KEY 미설정 시: 조용히 skip (RAG 비활성) — 기존 흐름 무영향.
//   - 인용이 하나도 없으면 skip.
//
// 필요 환경변수:
//   VOYAGE_API_KEY (없으면 RAG 검증 자체를 skip)
//   VOYAGE_MODEL   (선택, 기본 'voyage-3.5')
//   EMBED_DIM      (선택, 기본 1024 — 인덱싱과 반드시 동일)
//   RAG_SIM_VERIFIED   (선택, 기본 0.60 — 이 이상이면 verified)
//   RAG_SIM_WEAK       (선택, 기본 0.45 — 이 이상 verified 미만이면 weak_match)
//
// 임계값 근거 (TS 26.267 코퍼스 실측, voyage-3.5):
//   - 진짜 eCall 인용 유사도: 0.54~0.68 (최근접 조항은 모두 정확히 매칭)
//   - 코퍼스 밖 표준(AEC-Q100/ISO 등): 0.34~0.43
//   → 두 분포 사이 간격(0.43~0.54)에 not_found 경계(0.45)를 둠.
//   - voyage-3.5 코사인 유사도는 의미가 맞아도 0.6~0.7대가 흔하고
//     0.75+ 는 거의 동일 문장일 때만 나오므로, 초기 0.75 는 과도하게 높았음.
//   - 코퍼스가 커지면 분포가 더 또렷해지므로 추후 재튜닝 권장.

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';
const EMBED_DIM = parseInt(process.env.EMBED_DIM || '1024', 10);
const SIM_VERIFIED = parseFloat(process.env.RAG_SIM_VERIFIED || '0.60');
const SIM_WEAK = parseFloat(process.env.RAG_SIM_WEAK || '0.45');

// ── 표준 인용 추출 ──
// STK_REQ 의 statement / source_doc 에서 "표준 인용처럼 보이는" 문자열 추출.
// 보수적으로: 잘 알려진 표준 기관 토큰이 포함된 구절만 인용으로 간주.
// (과추출 시 검증 노이즈 ↑ 이므로 좁게 시작 — 운영하며 패턴 확장)
const CITATION_PATTERNS = [
  // 3GPP: "3GPP Release 16", "3GPP TS 23.501", "3GPP TR 38.901"
  /3GPP\s+(?:Release\s+\d+|T[SR]\s*\d+\.\d+(?:\.\d+)?)/gi,
  // UN/ECE: "ECE R10", "UN R155", "ECE R10.06"
  /(?:UN\s*)?ECE\s*R\s*\d+(?:\.\d+)?/gi,
  /\bUN\s*R\s*\d+/gi,
];

function extractCitations(stkReq) {
  const fields = [stkReq.statement, stkReq.source_doc].filter(s => typeof s === 'string');
  const found = new Set();
  for (const text of fields) {
    for (const re of CITATION_PATTERNS) {
      const matches = text.match(re);
      if (matches) matches.forEach(m => found.add(m.trim().replace(/\s+/g, ' ')));
    }
  }
  return Array.from(found);
}

// ── Voyage 질의 임베딩 (input_type='query') ──
async function embedQuery(text) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: 'query',
      output_dimension: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage query embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

// ── pgvector 검색 (match_standard_chunks RPC) ──
async function searchChunks(sb, queryEmbedding, matchCount = 5, filterBody = null) {
  // sb: generate.js 의 Supabase 헬퍼 (path, method, body, prefer)
  // PostgREST RPC 호출
  const body = {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: matchCount,
    filter_body: filterBody,
  };
  return sb(`/rpc/match_standard_chunks`, 'POST', body);
}

// ── 단일 인용 검증 ──
async function verifyOne(sb, citedText) {
  const emb = await embedQuery(citedText);
  const hits = await searchChunks(sb, emb, 3);
  const top = Array.isArray(hits) && hits.length ? hits[0] : null;
  const sim = top ? Number(top.similarity) : 0;

  let verdict;
  if (top && sim >= SIM_VERIFIED) verdict = 'verified';
  else if (top && sim >= SIM_WEAK) verdict = 'weak_match';
  else verdict = 'not_found';

  return { citedText, verdict, similarity: sim, matched: top };
}

// ── 메인 진입점 ──
// 반환: { skipped, warnings[], logs[] }
//   warnings : parsedOutput.warnings 에 합칠 사람용 메시지
//   logs     : citation_verifications 테이블에 적재할 행들
export async function verifyCitations({ sb, parsedOutput, aiGenerationId }) {
  // RAG 비활성 조건: 키 없음 → 조용히 skip (기존 흐름 무영향)
  if (!VOYAGE_API_KEY) {
    return { skipped: true, reason: 'VOYAGE_API_KEY 미설정 — RAG 검증 skip', warnings: [], logs: [] };
  }
  const stkReqs = parsedOutput?.stakeholder_requirements || [];
  if (!stkReqs.length) {
    return { skipped: true, reason: 'STK_REQ 없음', warnings: [], logs: [] };
  }

  const warnings = [];
  const logs = [];
  let checked = 0, notFound = 0, weak = 0;

  for (const req of stkReqs) {
    const citations = extractCitations(req);
    for (const cited of citations) {
      checked += 1;
      try {
        const r = await verifyOne(sb, cited);
        logs.push({
          ai_generation_id: aiGenerationId || null,
          stk_req_id: req.id,
          cited_text: cited,
          matched_chunk_id: r.matched?.id ?? null,
          similarity: r.similarity,
          verdict: r.verdict,
        });
        if (r.verdict === 'not_found') {
          notFound += 1;
          warnings.push(
            `[인용검증] ${req.id}: "${cited}" — 코퍼스에서 일치 조항 미발견 (환각 가능성, 사람 검토 권장)`
          );
        } else if (r.verdict === 'weak_match') {
          weak += 1;
          warnings.push(
            `[인용검증] ${req.id}: "${cited}" — 약한 일치 (유사도 ${r.similarity.toFixed(2)}, ` +
            `근접 조항: ${r.matched?.standard_id || '?'} ${r.matched?.clause || ''})`
          );
        }
      } catch (e) {
        // 검증 중 오류는 산출물을 막지 않음 — 경고만
        warnings.push(`[인용검증] ${req.id}: "${cited}" 검증 중 오류 — ${e.message?.slice(0, 120)}`);
      }
    }
  }

  // 요약 1줄
  if (checked > 0) {
    warnings.unshift(
      `[인용검증 요약] 총 ${checked}건 검사 · 미발견 ${notFound} · 약한일치 ${weak} ` +
      `(WARNING only — 차단하지 않음)`
    );
  }

  return { skipped: false, checked, notFound, weak, warnings, logs };
}

// (선택) 검증 로그를 DB 에 적재 — generate.js 에서 호출
export async function persistCitationLogs(sb, logs) {
  if (!logs?.length) return;
  try {
    await sb(`/citation_verifications`, 'POST', logs, 'return=minimal');
  } catch (e) {
    console.error('[citation-verifier] 로그 적재 실패(무시):', e.message);
  }
}

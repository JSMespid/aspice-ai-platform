// api/knowledge-upload.js — ASPICE QA 지식베이스 사용자 학습 API (Phase 2-4)
//
// 역할:
//   사용자가 평가 기준·심사 지적사례·모범/불량 예시를 등록하면
//   Voyage 로 임베딩되어 standard_chunks (standard_body='ASPICE-USER') 에 적재.
//   → api/evaluate.js 가 QA 검토 시 자동 검색하여 Gemini 평가 프롬프트에 주입.
//   → 즉, "등록 즉시 다음 QA 검토부터 학습 내용이 반영"되는 구조.
//
// 엔드포인트:
//   GET  /api/knowledge-upload
//     → 등록된 사용자 지식 목록 (id, clause, title, created_at)
//   POST /api/knowledge-upload
//     body: { items: [ { title, content, clause? } ] }   (1~20개)
//     → 각 항목 임베딩 후 적재. 응답: { inserted: N }
//   DELETE /api/knowledge-upload
//     body: { id }  또는  { ids: [...] }
//     → 사용자 지식(ASPICE-USER)만 삭제 가능. PAM 원문 코퍼스는 보호됨.
//
// 사전 조건:
//   - Vercel env: VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
//   - Supabase: fix_user_knowledge_rls.sql 적용 (ASPICE-USER 행만 INSERT/DELETE 허용)
//
// 사용 예 (브라우저 콘솔 또는 curl):
//   fetch('/api/knowledge-upload', { method:'POST', headers:{'Content-Type':'application/json'},
//     body: JSON.stringify({ items: [{
//       title: '심사 지적사례 — 검증기준 누락',
//       clause: 'CASE-2026-01',
//       content: '2026년 5월 모의심사에서 STK_REQ에 verification criteria가 없어 SYS.1.BP2 미흡 판정. 모든 요구사항에 측정 가능한 검증기준 필수.'
//     }]})}).then(r=>r.json()).then(console.log)

const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';
const EMBED_DIM = parseInt(process.env.EMBED_DIM || '1024', 10);
const USER_BODY = 'ASPICE-USER';   // 사용자 학습 지식의 고정 standard_body
const MAX_ITEMS_PER_CALL = 20;
const MAX_CONTENT_CHARS = 8000;

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
// Voyage 임베딩 (document 모드 — 적재용)
// ──────────────────────────────────────────────────
async function embedDocuments(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: 'document',
      output_dimension: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET: 사용자 지식 목록 ──
    if (req.method === 'GET') {
      const rows = await sb(
        `/standard_chunks?standard_body=eq.${USER_BODY}` +
        `&select=id,clause,title,token_count,created_at&order=created_at.desc&limit=200`
      );
      return res.status(200).json({ count: (rows || []).length, items: rows || [] });
    }

    // ── POST: 지식 등록 (임베딩 + 적재) ──
    if (req.method === 'POST') {
      if (!process.env.VOYAGE_API_KEY) {
        return res.status(500).json({ error: 'VOYAGE_API_KEY not configured' });
      }
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items 배열이 필요합니다: [{ title, content, clause? }]' });
      }
      if (items.length > MAX_ITEMS_PER_CALL) {
        return res.status(400).json({ error: `한 번에 최대 ${MAX_ITEMS_PER_CALL}개까지 등록 가능합니다` });
      }

      // 검증 + 정규화
      const normalized = [];
      for (const [i, it] of items.entries()) {
        const title = String(it?.title || '').trim();
        const content = String(it?.content || '').trim();
        if (!title || !content) {
          return res.status(400).json({ error: `items[${i}]: title 과 content 는 필수입니다` });
        }
        if (content.length > MAX_CONTENT_CHARS) {
          return res.status(400).json({ error: `items[${i}]: content 가 ${MAX_CONTENT_CHARS}자를 초과합니다 (현재 ${content.length}자). 나눠서 등록하세요.` });
        }
        normalized.push({
          title,
          content,
          clause: String(it?.clause || `USER-${Date.now()}-${i + 1}`).slice(0, 100),
        });
      }

      // 임베딩 (제목+내용 합성 — 검색 품질 향상)
      const embedInputs = normalized.map(n => `${n.title}\n\n${n.content}`);
      const embeddings = await embedDocuments(embedInputs);

      // 적재 행 구성 (rag_schema.sql 의 standard_chunks 스키마와 동일)
      const rows = normalized.map((n, i) => ({
        standard_body: USER_BODY,
        standard_id: 'USER-KNOWLEDGE',
        release: null,
        clause: n.clause,
        title: n.title,
        source_url: null,
        content: `[사용자 등록 평가 지식] ${n.title}\n\n${n.content}`,
        token_count: Math.max(1, Math.floor(n.content.length / 4)),
        embedding: `[${embeddings[i].join(',')}]`,
      }));

      await sb('/standard_chunks', 'POST', rows, 'return=minimal');

      console.log(`[knowledge-upload] ${rows.length}개 지식 등록 완료`);
      return res.status(200).json({
        success: true,
        inserted: rows.length,
        message: `${rows.length}개 평가 지식이 등록되었습니다. 다음 QA 검토부터 즉시 반영됩니다.`,
      });
    }

    // ── DELETE: 사용자 지식 삭제 (ASPICE-USER 만 — PAM 코퍼스 보호) ──
    if (req.method === 'DELETE') {
      const id = req.body?.id;
      const ids = req.body?.ids;
      const targets = Array.isArray(ids) ? ids : (id ? [id] : []);
      if (targets.length === 0) {
        return res.status(400).json({ error: 'id 또는 ids 가 필요합니다' });
      }
      // standard_body 필터를 함께 걸어 PAM/3GPP 코퍼스 오삭제 원천 차단
      const idList = targets.map(t => `"${String(t).replace(/"/g, '')}"`).join(',');
      await sb(
        `/standard_chunks?id=in.(${idList})&standard_body=eq.${USER_BODY}`,
        'DELETE', null, 'return=minimal'
      );
      return res.status(200).json({ success: true, deleted_requested: targets.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[knowledge-upload]', error);
    return res.status(500).json({ error: error.message });
  }
}

export const config = {
  maxDuration: 60,
};

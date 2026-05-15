// api/ai-generations.js — AI Generation History Query (Phase 2-2b STEP C-3a-fix)
//
// 역할 / Role:
//   GET /api/ai-generations?work_product_id=...&agent_role=evaluator&limit=1
//   - 입력 (query string):
//       work_product_id (필수)    : work_product UUID
//       agent_role      (선택)    : 'generator' | 'evaluator' (기본: 둘 다)
//       limit           (선택)    : 최대 결과 수 (기본 5, 최대 20)
//       status          (선택)    : 'success' | 'failed' (기본: success 만)
//   - 동작: ai_generations 테이블에서 work_product 의 최근 생성 이력 조회
//   - 출력: [{id, agent_role, model, parsed_output, ...}] (created_at desc)
//
// 사용처:
//   - ProcessScreen.jsx useEffect 에서 페이지 진입 시 마지막 critique 자동 로드
//   - 다운로드 시 critique 포함 보장
//
// 보안:
//   - 읽기 전용 (GET 만)
//   - work_product_id 필수 (전체 테이블 스캔 방지)
//   - status='success' 기본 (실패 row 노출 방지)

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

// ──────────────────────────────────────────────────
// Supabase REST helper (generate.js / evaluate.js 와 동일 패턴)
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
// Main Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel 은 req.query 로 query string 파싱 제공
  const {
    work_product_id,
    agent_role,
    limit: limitStr,
    status,
  } = req.query || {};

  if (!work_product_id) {
    return res.status(400).json({ error: 'Missing work_product_id query parameter' });
  }

  // limit 검증
  let limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    // Supabase REST query 구성
    // 필요한 컬럼만 선택 (전체 raw_output 은 크기 클 수 있어 제외)
    const cols = [
      'id',
      'created_at',
      'agent_role',
      'agent_step',
      'model',
      'provider',
      'input_tokens',
      'output_tokens',
      'cost_usd',
      'latency_ms',
      'guardrail_passed',
      'guardrail_result',
      'parsed_output',
      'skills_used',
      'status',
      'error_message',
    ].join(',');

    const filters = [
      `work_product_id=eq.${encodeURIComponent(work_product_id)}`,
      `select=${cols}`,
      `order=created_at.desc`,
      `limit=${limit}`,
    ];

    // agent_role 필터 (지정한 경우만)
    if (agent_role === 'generator' || agent_role === 'evaluator' || agent_role === 'planner') {
      filters.push(`agent_role=eq.${agent_role}`);
    }

    // status 필터 (기본: success 만)
    const statusFilter = status || 'success';
    if (statusFilter === 'success' || statusFilter === 'failed' || statusFilter === 'pending') {
      filters.push(`status=eq.${statusFilter}`);
    }
    // status='all' 인 경우 필터 안 함

    const path = `/ai_generations?${filters.join('&')}`;
    const data = await sb(path, 'GET');

    return res.status(200).json({
      success: true,
      count: Array.isArray(data) ? data.length : 0,
      results: data || [],
    });
  } catch (error) {
    console.error('[ai-generations]', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

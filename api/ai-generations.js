// api/ai-generations.js — AI Generation History Query (v2 — Rationale 복원 개선)
//
// 역할 / Role:
//   GET /api/ai-generations?work_product_id=...&agent_role=evaluator&limit=1
//   - 입력 (query string):
//       work_product_id (필수)    : work_product UUID
//       agent_role      (선택)    : 'generator' | 'evaluator' | 'planner' | 'remediator'
//                                   (기본: 전체)
//       parent_null     (선택)    : 'true' 면 parent_generation_id IS NULL 만
//                                   (chunked 구조에서 child batch 를 제외하고
//                                    master 만 확정 조회 — guardrail_result ①②③ 은
//                                    master 에만 기록되므로 복원 시 필수)
//       limit           (선택)    : 최대 결과 수 (기본 5, 최대 20)
//       status          (선택)    : 단일 값 또는 쉼표 목록 (기본: success 만)
//                                   예: status=success,partial — master 가 partial
//                                   (3/4 부분 병합) 인 경우도 복원 대상에 포함
//   - 동작: ai_generations 테이블에서 work_product 의 최근 생성 이력 조회
//   - 출력: [{id, agent_role, model, parsed_output, parent_generation_id,
//             attempt_number, ...}] (created_at desc)
//
// v2 변경 (2026-06-12, Rationale 표시 개선):
//   1. agent_role 화이트리스트에 'remediator' 추가
//      — 시정조치 리비전 조회 가능 (RemediationPanel 기준버전 표시 정확화 겸용)
//   2. parent_null=true 파라미터 추가 — master/child 구분 (서버 확정 해석,
//      remediate.js resolveBaseGenerationId 와 동일 사상)
//   3. status 쉼표 목록 지원 (in.() 필터) — partial master 포함 조회
//   4. 응답 컬럼에 parent_generation_id, attempt_number 추가
//      — 클라이언트가 master 여부/리비전 번호를 검증·표시 가능
//
// 사용처:
//   - ProcessScreen.jsx useEffect 에서 페이지 진입 시 마지막 결과 자동 복원
//     (최신 remediator 리비전 우선 → master generator 폴백)
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
    parent_null,
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
      'parent_generation_id', // v2: master(null)/child 구분 검증용
      'attempt_number',       // v2: remediator 리비전 번호 (v2=1, v3=2...)
    ].join(',');

    const filters = [
      `work_product_id=eq.${encodeURIComponent(work_product_id)}`,
      `select=${cols}`,
      `order=created_at.desc`,
      `limit=${limit}`,
    ];

    // agent_role 필터 (지정한 경우만)
    // v2: 'remediator' 추가 — 시정조치 리비전 조회 지원
    const ALLOWED_ROLES = ['generator', 'evaluator', 'planner', 'remediator'];
    if (ALLOWED_ROLES.includes(agent_role)) {
      filters.push(`agent_role=eq.${agent_role}`);
    }

    // v2: parent_null=true → master 만 (child batch 제외)
    // chunked 구조에서 master 와 child 가 모두 agent_role='generator' 라서
    // created_at desc limit=1 만으로는 child 가 잡힐 수 있음.
    // guardrail_result(①②③) 는 master 에만 있으므로 복원 시 이 필터가 필수.
    if (parent_null === 'true') {
      filters.push(`parent_generation_id=is.null`);
    }

    // status 필터 (기본: success 만)
    // v2: 쉼표 목록 지원 — 예: status=success,partial
    //     (master 가 partial 부분 병합인 경우도 guardrail_result 복원 대상)
    const ALLOWED_STATUSES = ['success', 'failed', 'pending', 'running', 'partial', 'cancelled'];
    const statusFilter = status || 'success';
    if (statusFilter !== 'all') {
      const list = statusFilter
        .split(',')
        .map(s => s.trim())
        .filter(s => ALLOWED_STATUSES.includes(s));
      if (list.length === 1) {
        filters.push(`status=eq.${list[0]}`);
      } else if (list.length > 1) {
        filters.push(`status=in.(${list.join(',')})`);
      } else {
        // 화이트리스트 밖 값만 들어온 경우 — 안전하게 success 기본값
        filters.push(`status=eq.success`);
      }
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

// api/upload.js — Supabase Storage 파일 업로드 + Signed URL 생성
//
// 화면설계서 v2.4 슬라이드 13 명세:
//   "산출물등록 → 파일 업로드 모달 → 메타데이터 저장"
//
// 흐름:
//   1) POST /api/upload?action=upload
//      - multipart/form-data 또는 base64 (Vercel Serverless 단순화 위해 base64 채택)
//      - body: { fileName, contentType, base64, projectId, processId, itemKey }
//      - Supabase Storage 'work-products' 버킷에 업로드
//      - storagePath 반환 (예: "{projectId}/{processId}/{itemKey}/{timestamp}_{fileName}")
//
//   2) GET /api/upload?action=signed_url&path={storagePath}
//      - 1시간 유효 Signed URL 반환
//      - 다운로드 링크 클릭 시 사용
//
// 보안:
//   anon key 사용 (시연용). 운영 시 service_role + RLS + JWT 필요.
//   파일 크기 50MB 제한은 Supabase Storage 버킷 설정에서 1차 차단.

const BUCKET = 'work-products';
const SIGNED_URL_EXPIRES_SEC = 3600; // 1시간

async function sbStorage(path, method = 'GET', body = null, extraHeaders = {}) {
  const url = `${process.env.SUPABASE_URL}/storage/v1${path}`;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    ...extraHeaders,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body || null,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase Storage error ${res.status}: ${errText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const txt = await res.text();
    return txt ? JSON.parse(txt) : {};
  }
  return await res.text();
}

// 파일명에서 위험 문자 제거 (디렉토리 트래버설 방지 + URL 안전)
function sanitizeFileName(name) {
  return String(name || 'unnamed')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

export const config = {
  // base64 페이로드는 4MB 한계 부근에서 끊기므로 늘려야 함
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    // ── 1. POST /api/upload?action=upload ─────────────────────────────────
    if (req.method === 'POST' && action === 'upload') {
      const { fileName, contentType, base64, projectId, processId, itemKey } = req.body || {};

      if (!fileName || !base64 || !projectId || !processId || !itemKey) {
        return res.status(400).json({
          error: 'Missing required fields: fileName, base64, projectId, processId, itemKey'
        });
      }

      // base64 디코딩
      const buffer = Buffer.from(base64, 'base64');

      // 경로: {projectId}/{processId}/{itemKey}/{timestamp}_{sanitized_filename}
      const safeName = sanitizeFileName(fileName);
      const ts = Date.now();
      const storagePath = `${projectId}/${processId}/${itemKey}/${ts}_${safeName}`;

      // Supabase Storage 업로드 (PUT)
      await sbStorage(
        `/object/${BUCKET}/${encodeURI(storagePath)}`,
        'POST',
        buffer,
        {
          'Content-Type': contentType || 'application/octet-stream',
          'x-upsert': 'true',
        }
      );

      return res.status(200).json({
        success: true,
        storagePath,
        bucket: BUCKET,
        size: buffer.length,
        fileName: safeName,
        originalFileName: fileName,
        contentType: contentType || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
      });
    }

    // ── 2. GET /api/upload?action=signed_url&path=... ─────────────────────
    if (req.method === 'GET' && action === 'signed_url') {
      const { path } = req.query;
      if (!path) return res.status(400).json({ error: 'Missing path' });

      const result = await sbStorage(
        `/object/sign/${BUCKET}/${encodeURI(path)}`,
        'POST',
        JSON.stringify({ expiresIn: SIGNED_URL_EXPIRES_SEC }),
        { 'Content-Type': 'application/json' }
      );

      // 결과: { signedURL: "/object/sign/..." }
      // 클라이언트가 바로 fetch할 수 있는 절대 URL로 변환
      const signedURL = result?.signedURL || result?.signedUrl;
      if (!signedURL) {
        return res.status(500).json({ error: 'Failed to obtain signedURL' });
      }
      const fullURL = `${process.env.SUPABASE_URL}/storage/v1${signedURL}`;
      return res.status(200).json({ url: fullURL, expiresIn: SIGNED_URL_EXPIRES_SEC });
    }

    // ── 3. DELETE /api/upload?action=delete&path=... ──────────────────────
    if (req.method === 'DELETE' && action === 'delete') {
      const { path } = req.query;
      if (!path) return res.status(400).json({ error: 'Missing path' });
      await sbStorage(`/object/${BUCKET}/${encodeURI(path)}`, 'DELETE');
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action or method' });
  } catch (error) {
    console.error('[upload]', error);
    return res.status(500).json({ error: error.message });
  }
}

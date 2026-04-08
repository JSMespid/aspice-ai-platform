// api/projects.js  — projects + work_products 통합 핸들러
async function sb(path, method = 'GET', body = null) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { resource, id, project_id } = req.query;

  try {
    // ── PROJECTS ─────────────────────────────────────────────────────────────
    if (resource === 'projects' || !resource) {
      if (req.method === 'GET' && !resource) {
        // 하위 호환: resource 없으면 work_products 전체 반환 (기존 코드 호환)
        const data = await sb('/work_products?order=created_at.desc&select=*,projects(name,domain)');
        return res.status(200).json(Array.isArray(data) ? data : []);
      }
      if (req.method === 'GET') {
        const data = await sb('/projects?order=created_at.desc');
        return res.status(200).json(Array.isArray(data) ? data : []);
      }
      if (req.method === 'POST') {
        const data = await sb('/projects', 'POST', req.body);
        return res.status(200).json(Array.isArray(data) ? data[0] : data);
      }
      if (req.method === 'PATCH') {
        const data = await sb(`/projects?id=eq.${id}`, 'PATCH', req.body);
        return res.status(200).json(data);
      }
      if (req.method === 'DELETE') {
        await sb(`/projects?id=eq.${id}`, 'DELETE');
        return res.status(200).json({ success: true });
      }
    }

    // ── WORK_PRODUCTS ────────────────────────────────────────────────────────
    if (resource === 'work_products') {
      if (req.method === 'GET') {
        const filter = project_id
          ? `/work_products?project_id=eq.${project_id}&order=created_at.asc`
          : `/work_products?order=created_at.desc`;
        const data = await sb(filter);
        return res.status(200).json(Array.isArray(data) ? data : []);
      }
      if (req.method === 'POST') {
        const data = await sb('/work_products', 'POST', req.body);
        return res.status(200).json(Array.isArray(data) ? data[0] : data);
      }
      if (req.method === 'PATCH') {
        const data = await sb(`/work_products?id=eq.${id}`, 'PATCH', req.body);
        return res.status(200).json(data);
      }
      if (req.method === 'DELETE') {
        await sb(`/work_products?id=eq.${id}`, 'DELETE');
        return res.status(200).json({ success: true });
      }
    }

    return res.status(400).json({ error: 'Unknown resource or method' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Supabase REST API 헬퍼
async function supabase(path, method = 'GET', body = null) {
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
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const data = await supabase('/work_products?order=created_at.desc');
      return res.status(200).json(Array.isArray(data) ? data : []);
    }
    if (req.method === 'POST') {
      const data = await supabase('/work_products', 'POST', req.body);
      return res.status(200).json(data);
    }
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const data = await supabase(`/work_products?id=eq.${id}`, 'PATCH', req.body);
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      await supabase(`/work_products?id=eq.${id}`, 'DELETE');
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

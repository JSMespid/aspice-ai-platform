import crypto from 'crypto';

function sign(payload, secret) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}

function verify(token, secret) {
  try {
    const [h, b, s] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (s !== expected) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, email, password, token } = req.body;
  const secret = process.env.JWT_SECRET || 'default_secret_change_this_32chars';

  if (action === 'login') {
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    return res.status(200).json({ token: sign({ email, role: 'admin' }, secret) });
  }
  if (action === 'verify') {
    const p = verify(token, secret);
    if (!p) return res.status(401).json({ error: 'Invalid token' });
    return res.status(200).json({ valid: true, email: p.email });
  }
  return res.status(400).json({ error: 'Unknown action' });
}

// api/gemini.js — Google Gemini API 프록시 (HITL QA 전용)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });

  // v1beta와 v1 두 버전, 여러 모델 조합으로 시도
  const attempts = [
    { version: 'v1beta', model: 'gemini-2.0-flash-lite' },
    { version: 'v1beta', model: 'gemini-1.5-flash' },
    { version: 'v1',     model: 'gemini-1.5-flash' },
    { version: 'v1beta', model: 'gemini-pro' },
    { version: 'v1',     model: 'gemini-pro' },
  ];

  let lastError = '';

  for (const { version, model } of attempts) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        lastError = `[${version}/${model}] ${data.error?.message || response.status}`;
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = `[${version}/${model}] 응답 비어있음`;
        continue;
      }

      return res.status(200).json({ text, model: `${version}/${model}` });
    } catch (e) {
      lastError = `[${version}/${model}] ${e.message}`;
      continue;
    }
  }

  return res.status(500).json({ error: `모든 모델 시도 실패: ${lastError}` });
}

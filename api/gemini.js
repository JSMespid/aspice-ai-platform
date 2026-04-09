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

  // 순서대로 시도할 모델 목록
  const models = [
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
  ];

  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Gemini API 오류 (${response.status})`;
        continue; // 다음 모델 시도
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = 'Gemini 응답이 비어있습니다.';
        continue;
      }

      return res.status(200).json({ text, model });
    } catch (error) {
      lastError = error.message;
      continue;
    }
  }

  // 모든 모델 실패
  return res.status(500).json({ error: `모든 모델 시도 실패: ${lastError}` });
}

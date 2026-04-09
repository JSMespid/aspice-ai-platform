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

  const models = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
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
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = `[${model}] ${data.error?.message || response.status}`;
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = `[${model}] 응답 비어있음`;
        continue;
      }

      // JSON 추출: 코드블록 제거 후 { } 범위 추출
      const cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      // { 로 시작하는 위치부터 마지막 } 까지 추출
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        lastError = `[${model}] JSON 형식 없음`;
        continue;
      }

      const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);

      // JSON 파싱 검증
      try {
        JSON.parse(jsonStr);
      } catch {
        lastError = `[${model}] JSON 파싱 실패`;
        continue;
      }

      return res.status(200).json({ text: jsonStr, model });

    } catch (e) {
      lastError = `[${model}] ${e.message}`;
      continue;
    }
  }

  return res.status(500).json({ error: `QA 검증 실패: ${lastError}` });
}

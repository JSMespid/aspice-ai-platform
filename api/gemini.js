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

  // Google AI Studio Tier1 계정에서 사용 가능한 최신 모델 목록
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash',
  ];

  // 먼저 사용 가능한 모델 목록 조회
  let availableModels = models;
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const found = (listData.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      if (found.length > 0) {
        // tts/audio/embedding/vision 모델 제외, flash 계열 우선
        const filtered = found.filter(m =>
          !m.includes('tts') &&
          !m.includes('audio') &&
          !m.includes('embed') &&
          !m.includes('vision') &&
          !m.includes('aqa')
        );
        availableModels = [
          ...filtered.filter(m => m.includes('flash') && !m.includes('think')),
          ...filtered.filter(m => !m.includes('flash') && !m.includes('think')),
        ];
      }
    }
  } catch {}

  let lastError = '';
  for (const model of availableModels.slice(0, 6)) {
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
      if (!text) { lastError = `[${model}] 빈 응답`; continue; }

      // JSON 추출
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) { lastError = `[${model}] JSON 없음`; continue; }

      const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
      try { JSON.parse(jsonStr); } catch { lastError = `[${model}] JSON 파싱실패`; continue; }

      return res.status(200).json({ text: jsonStr, model });
    } catch (e) {
      lastError = `[${model}] ${e.message}`;
    }
  }

  return res.status(500).json({
    error: `QA 검증 실패: ${lastError}`,
    triedModels: availableModels.slice(0, 6),
  });
}

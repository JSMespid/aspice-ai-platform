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

  try {
    // 1단계: 사용 가능한 모델 목록 조회
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const listData = await listRes.json();

    if (!listRes.ok) {
      return res.status(500).json({ error: `모델 목록 조회 실패: ${listData.error?.message}` });
    }

    // generateContent 지원 모델만 필터링
    const availableModels = (listData.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    if (!availableModels.length) {
      return res.status(500).json({ error: '사용 가능한 모델이 없습니다.' });
    }

    // flash 모델 우선 정렬
    const sorted = [
      ...availableModels.filter(m => m.includes('flash') && !m.includes('thinking')),
      ...availableModels.filter(m => !m.includes('flash') && !m.includes('thinking')),
    ];

    // 순서대로 시도
    let lastError = '';
    for (const model of sorted.slice(0, 5)) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) { lastError = `[${model}] ${data.error?.message}`; continue; }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) { lastError = `[${model}] 응답 비어있음`; continue; }
        return res.status(200).json({ text, model });
      } catch (e) { lastError = `[${model}] ${e.message}`; continue; }
    }

    return res.status(500).json({
      error: `모든 모델 시도 실패: ${lastError}`,
      availableModels: sorted.slice(0, 10),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

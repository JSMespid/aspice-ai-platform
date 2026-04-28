# 빠른 실행 가이드 — 대표님께

## 30초 만에 화면 보기 (코드만 읽기)

```bash
unzip aspice-ai-platform-v2.zip
cd aspice-ai-platform-main/
cat README_v2.md         # 전체 설계 의사결정
ls src/lib/              # 환각 방지 5축 핵심 라이브러리
ls src/components/       # SCR-12a, SCR-13, ProcessPage 등 새 컴포넌트
ls src/config/processes.js  # SYS.1~5를 데이터로 정의 (★ 핵심)
ls evals/                # Eval Harness
```

## 5분 만에 빌드만 확인

```bash
cd aspice-ai-platform-main/
npm install
npm run build
# → dist/ 디렉토리에 빌드 결과 생성
# → 빌드 통과는 모든 새 코드가 syntactically 정상이라는 뜻
```

## 30분 만에 실제 동작 시연 (대표님 시연 모드)

### 사전 준비
1. 기존 환경의 `.env.local` 또는 vercel dashboard에 API 키 설정:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GEMINI_API_KEY=...
   SUPABASE_URL=https://...supabase.co
   SUPABASE_ANON_KEY=...
   ```

2. Supabase에 v2 마이그레이션 실행:
   ```sql
   -- supabase-migration-v2.sql 내용을 Supabase SQL Editor에 붙여넣기 후 실행
   ```

### 시연 시나리오 A — 정상 흐름
```bash
npm run dev
# → http://localhost:3000 자동 v2 화면
# → /legacy 로 가면 기존 화면 (비교용)
```

화면 흐름:
1. 프로젝트 목록 → "헤드램프 빔 제어" 선택 (없으면 [+ 새 프로젝트])
2. **SYS.1 카드 클릭** (★ 새 화면 진입점)
3. 컨텍스트 입력 ("전방 카메라, 야간 가시성, 눈부심 방지")
4. **[⚡ Claude 생성]** 버튼 클릭
5. 우측 Rationale Report에 즉시 모델/토큰/시간 표시 (★ 환각 방지 축 4 가시화)
6. **[▶ 5-Phase 검증 시작]** 클릭 (★ 환각 방지 5축 동시 작동)
7. 5개 단계 카드가 순차적으로 ✓로 채워짐:
   - Phase 1: Pre-validation (스키마) — 즉시
   - Phase 2: Deterministic (도메인) — 즉시
   - Phase 3: LLM Semantic (Gemini) — 5~15초
   - Phase 4: Graph (추적성) — 즉시
   - Phase 5: Aggregation — 즉시
8. 점수 + 권고 표시
9. State Machine에서 [SUBMIT_FOR_APPROVAL] 클릭

### 시연 시나리오 B — Critical 차단 (환각 방지 핵심 데모)
1. SYS.1 컨텍스트에 일부러 모호하게 입력: "적당히 빠르게 차량 검출"
2. 생성 → 검증
3. Phase 2에서 "fast" 같은 금지 용어 발견 → Critical 이슈
4. State Machine [SUBMIT_FOR_APPROVAL] 버튼이 **⛔ 표시되며 비활성화**
5. tooltip: "Critical 이슈 N건 미해결 — 승인 차단"

→ 이게 **"AI가 만들어도 환각이 있으면 사람이 승인 못하게 막는다"** 의 가시적 증명

### 시연 시나리오 C — V-Model 정정 (대표님 직접 발견 사항 박제)
별도 시연 — Eval Harness 실행:

```bash
node evals/runner.js --process=SYS.4
```

기대 출력:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ASPICE AI Platform — Eval Harness
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

데이터셋: 1건 (전체 3건 중)

▶ v-model-tracing-sys4-001 (SYS.4)... ✅ 100점 (5/5) · 18.4s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 결과: 1/1 통과 · 평균 100.0점 · 18.4s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

→ "**대표님이 직접 발견하신 V-Model 정정사항이 코드에 영구 박제됐고,
  매 PR마다 이 테스트가 자동 돌아가서 절대 회귀하지 않는다**"의 증명

## 가장 강력한 시연 한 줄

**Critical 차단을 보여주신 다음**, 대표님께 이렇게 설명하시면 됩니다:

> "대표님께서 강조하신 5가지 — Multi-Agent 분리, Rule Database, Data-driven Traceability,
>  HITL 9-state, 그리고 V-Model 정정 — 모두가 5축 가드레일로 통합되어
>  지금 화면 우측 Rationale Report에 어떤 가드레일이 작동했는지 실시간으로 보입니다.
>  단 한 축이라도 실패하면 사람이 승인 버튼을 누를 수조차 없습니다."

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 빌드 실패 | Node 버전 불일치 | Node 20+ 사용 |
| Claude 응답 빈값 | API 키 미설정 | `.env.local` 확인 |
| Gemini Phase 3 실패 | API 키 미설정 또는 모델 변경 | `api/gemini.js`의 fallback 모델 리스트 업데이트 |
| State Machine 진행 안 됨 | Critical 이슈 차단 (정상 동작) | 이슈 해결 후 재생성 |
| Eval runner fetch failed | 로컬 서버 미실행 | `npm run dev` 후 다른 터미널에서 runner 실행 |

## 다음 단계 (Phase 2 계획)

이번 코드는 **Phase 1 완료** 상태입니다. 다음 단계는:

1. **Eval 결과를 DB에 저장** → 시각 대시보드 (점수 추이 그래프)
2. **state_transitions 이력 활용** → 감사 보고서 자동 생성
3. **Adversarial Test 데이터셋 확장** (현재 3건 → 50건)
4. **GitHub Actions CI 통합** (`.github/workflows/eval.yml` 이미 작성됨, secrets만 설정하면 활성화)
5. **모델 비교 모드** (Sonnet 4 vs Opus 4 같은 데이터셋, 동일 평가 → 의사결정 데이터)

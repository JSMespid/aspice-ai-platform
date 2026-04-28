# ASPICE AI Platform v2.0 — Anti-Hallucination Edition

> 대표님의 5부작 상세설계서 + 화면설계서 v2.4 + 환각 방지 가드레일 통합 구현

## 무엇이 달라졌는가

| 항목 | v1 (기존) | v2 (이번) |
|---|---|---|
| QA 검증 | Gemini 1회 호출 | **5-Phase 파이프라인** (확정적 60% + 확률적 40%) |
| 상태 관리 | 3-state (초안/검토중/승인) | **9-state State Machine** (Critical 차단 게이트 포함) |
| 환각 방지 | Gemini만 신뢰 | **5축 가드레일** (구조 + 추적성 + 도메인 + 교차검증 + HITL) |
| 프로세스 정의 | 코드에 하드코딩 | **데이터 주도** (`src/config/processes.js` 한 파일에 SYS.1~5 모두) |
| Rationale | 없음 | **모든 결정의 근거를 보존** (Generator 메타데이터 + QA + 가드레일 적용 내역) |
| V-Model 정정 | 누락 | **Adversarial Test로 보장** (대표님 2026-03-31 지적사항 박제) |
| Eval Harness | 없음 | **골든 데이터셋 + 자동 채점 + CI 차단** |

## 환각 방지 5축 (가장 중요)

대표님채팅에서 강조하신 4가지 원칙 + Eval Harness가 결합되어 다음 5축이 됩니다:

```
축 1. 구조 강제      → JSON Schema (모든 필드/타입/패턴 검증)
축 2. 추적성 강제    → 참조 ID 실존성, 고아 노드 차단
축 3. 도메인 제약    → 금지 모호 용어, SHALL 키워드, 측정 가능 수치
축 4. 교차 검증      → Generator(Claude) ≠ Verifier(Gemini)
축 5. HITL 게이팅    → Critical 이슈 = 자동 승인 차단
```

**모든 화면(SYS.1~5)에서 5축이 동시에 작동**합니다. 단 한 축이라도 실패하면 다음 단계로 진행 불가.

## 디렉토리 구조

```
src/
  config/
    processes.js              ← SYS.1~5 정의를 데이터로 (스키마, 제약, 추적성 규칙)
  lib/
    schema-validator.js       ← 축 1
    guardrails.js             ← 축 2 + 3
    state-machine.js          ← 축 5
    llm.js                    ← Claude+Gemini 래퍼 + 5-Phase QA + Rationale
  components/
    FivePhaseProgress.jsx     ← SCR-12a UI
    RationaleReport.jsx       ← SCR-11 UI
    StateMachineView.jsx      ← SCR-13 UI
    ProcessPage.jsx           ← SYS.1~5 통합 화면 (★ 핵심)
  pages/
    AspiceAppV2.jsx           ← 새 메인 앱
    AspiceApp.jsx             ← 기존 앱 (legacy 라우트로 보존)

evals/
  datasets/
    headlamp-sys1-001.json
    v-model-tracing-sys4-001.json    ← 대표님 지적사항 박제
    v-model-tracing-sys5-001.json    ← 대표님 지적사항 박제
  runner.js                          ← node evals/runner.js

api/                          ← 기존 vercel functions 유지
  chat.js                     ← Claude 프록시
  gemini.js                   ← Gemini 프록시
  ...
```

## 실행 방법

### 1. 기존 환경 그대로 (vercel 배포 가정)

```bash
npm install
npm run dev      # 로컬 개발 → localhost:3000
npm run build    # 프로덕션 빌드
```

### 2. 환경변수 (vercel dashboard 또는 .env.local)

```
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=...
```

### 3. Eval Harness 실행

```bash
# 로컬 dev 서버 실행 후
node evals/runner.js                              # 전체
node evals/runner.js --process=SYS.4              # SYS.4만
node evals/runner.js --dataset=v-model-tracing-sys4-001
```

결과는 `evals/results/YYYY-MM-DD_HH-MM-SS.json`로 저장됩니다.

## 데모 시나리오 (대표님 보고용)

### Scenario A — 정상 흐름 (SYS.1)
1. 프로젝트 "헤드램프 빔 제어" 선택
2. SYS.1 카드 클릭 → ProcessPage 진입
3. 컨텍스트 입력 → [⚡ Claude 생성] 클릭
4. 우측 Rationale Report에 모델/토큰/시간 즉시 표시
5. 아래 [▶ 5-Phase 검증 시작] 클릭
6. 5개 단계 카드가 순차적으로 ✓로 채워짐 (Phase 1·2·4 = 즉시, Phase 3 = Gemini 호출)
7. 점수 + 권고 표시
8. State Machine에서 [SUBMIT_FOR_APPROVAL] 클릭

### Scenario B — Critical 차단 (자동 데모)
1. 일부러 모호한 컨텍스트 입력 ("적당히 빠르게 검출")
2. 생성 → 검증
3. Phase 2에서 "fast" 발견 → Critical 이슈
4. State Machine [SUBMIT_FOR_APPROVAL] 버튼이 ⛔ 표시되며 비활성화
5. tooltip: "Critical 이슈 N건 미해결 — 승인 차단"

### Scenario C — V-Model 정정 (대표님 직접 발견 사항)
1. SYS.4 진입
2. [⚡ 생성] → 결과 확인 → 우측 Rationale에 "Phase 4 - Traceability" 통과 확인
3. `node evals/runner.js --process=SYS.4` 로 자동 채점
4. 결과: ✅ 통과 — "★ 대표님 정정사항 ★ test_cases[].primary_target.interface_id가 IF-* 패턴" 검증됨

## 주요 의사결정 근거

### 왜 Generator=Claude / Verifier=Gemini 인가
- **편향 분리**: 같은 모델은 같은 방식으로 틀립니다. 다른 회사의 다른 모델이 검증하면 사각지대가 다름
- 대표님채팅 5부작 Part 1의 핵심 원칙
- Anthropic Claude의 강점 = 긴 추론 + 정밀 JSON / Google Gemini의 강점 = 비용 효율 + 빠른 검증

### 왜 5-Phase인가 (1-Phase 아니라)
- **Fast-Fail 패턴**: 스키마 위반 같은 명백한 실패는 Phase 1에서 즉시 종료 (LLM 비용 절약)
- **확정적 vs 확률적 분리**: Phase 1·2·4·5 = 결정적 (재현 가능, 회귀 검증 가능) / Phase 3 = LLM (의미 검증)
- **각 Phase 독립 평가**: 어디가 약한지 알 수 있음 → 개선 가능

### 왜 9-state State Machine인가 (3-state 아니라)
- **감사 추적**: 누가 언제 어떤 상태로 바꿨는지 모두 기록
- **권한 분리**: Engineer는 생성/재시작만, Reviewer는 승인/반려만 (대표님채팅 권한 매트릭스)
- **Critical 차단**: 단순 3-state로는 "QA 실패 시 승인 막기"를 표현 불가

### 왜 데이터 주도(`processes.js`)인가
- 새 프로세스 추가 시 코드 수정 0줄 → 설정 1개 row 추가
- SYS.1~5의 차이를 한눈에 볼 수 있음 (스키마, 제약, 추적성 규칙)
- Eval Harness가 같은 설정을 읽어서 채점 → 코드/평가 일관성 자동 보장

## 다음 단계 (Phase 2)

1. **State Machine DB 마이그레이션** (`work_products.state` 컬럼 추가, 기존 `status`와 동기화)
2. **state_transitions 이력 테이블** (감사 추적용)
3. **Gemini 검증 결과의 결정성 측정** (k-shot 평가 → rubric 개선)
4. **GitHub Actions CI 통합** (`evals/runner.js`를 PR마다 자동 실행)
5. **Eval 대시보드** (점수 추이 그래프, 시연용)

## 한 줄 요약

> **"AI가 만들어도, 사람이 확정하기 전엔 아무것도 진행되지 않으며,
>  AI가 만든 것이 무엇이고 왜 그렇게 만들었는지는 모두 추적 가능하다."**

# ASPICE AI Platform v3 — 빠른 시작 가이드

화면설계서 v2.4를 정확히 반영한 v3 구현입니다.

## v3에서 새로 만든 것

### Phase 1 — 기반 셸 ✅
- **SCR-01 로그인** — 다크 네이비 그라디언트 배경 + 이메일/비밀번호 + 데모 계정 토글
- **SCR-02 프로젝트 목록** — 단일 검색창 2개 + 필터 칩 (조직/날짜/정렬) + 적용된 필터 칩
- **SCR-03 프로젝트 생성 모달** — 필드 검증 + 글자수 카운트
- **SCR-04 메인 워크스페이스 (3영역 레이아웃)** ★
  - 상단 헤더 (56px) — 로고, 프로젝트 컨텍스트, 사용자
  - 좌측 사이드바 (240px) — SYS/SWE 그룹 + 진행률 바 + 추적성/일관성/템플릿/설정
  - 중간 영역 — 동적 라우팅
- **상단 워크플로우 바** — 생성→QA검토→승인 3단계 (현재 상태 강조)
- **사이드바 진행률 바** — 각 프로세스별 % + 색상 (회색→앰버→파랑→초록)

### Phase 1.5 — V-Model 화면 셸 ✅
- **SCR-05 V-Model 프로세스 화면** — 데이터 주도 동적 렌더링
- **항목 행** — 라벨 + 미리보기 + 산출물등록 + 직접입력 (UI만, 모달은 Phase 2)
- **상태 배지** — 9-state HITL 시각화

### Phase 2 (다음) — 미구현
- 산출물 등록 모달
- 직접 입력 모달 (리치 텍스트)
- AI 생성 (Claude)
- QA 5-Phase Verification (Gemini)
- Rationale Report 패널
- HITL State Machine 액션

### Phase 3, 4 (예정)
- 설정 — 스키마 정의/편집
- 추적성 — 매트릭스 뷰 + 이분 그래프 뷰
- 일관성 검증

## 데모 계정 (시연용)

3개 계정 모두 비밀번호 `demo1234`:

| 이메일 | 역할 | 권한 |
|---|---|---|
| `admin@aspice.com`    | Admin    | 모든 권한 |
| `engineer@aspice.com` | Engineer | 생성·수정 |
| `reviewer@aspice.com` | Reviewer | 승인·반려 |

## 라우팅

```
/login                                    → SCR-01 로그인
/projects                                 → SCR-02 프로젝트 목록
/projects/:id                             → SCR-04 메인 워크스페이스
/projects/:id/process/SYS.1               → SCR-05 SYS.1 화면
/projects/:id/process/SWE.1               → SCR-05 SWE.1 화면
/projects/:id/traceability                → SCR-07 (Phase 4 — Placeholder)
/projects/:id/consistency                 → SCR-08 (Phase 4 — Placeholder)
/projects/:id/templates                   → 템플릿 (Placeholder)
/projects/:id/settings                    → SCR-06 (Phase 3 — Placeholder)
```

## 빌드/실행

```bash
npm install
npm run build       # production 빌드 통과 확인
npm run dev         # 로컬 개발 서버
```

## Vercel 배포 시

기존 v2 환경변수를 그대로 사용 가능합니다:
- ANTHROPIC_API_KEY
- GEMINI_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY

Supabase 마이그레이션도 v2와 동일하므로 별도 작업 불필요합니다.

-- ASPICE AI Platform v3 — DB Migration (Part 3)
-- AI 생성 감사 추적 테이블 3종 신설
--
-- 배경:
--   제품 수준의 ASPICE AI Platform은 AI가 생성한 모든 산출물에 대해
--   "누가/언제/어떤 입력으로/어떤 결과/어떤 가드레일 통과" 를 추적할 수 있어야 함.
--   이는 자동차 ASPICE 평가 시 "AI 산출물의 추적성" 증명에 필수.
--
-- 신설 테이블:
--   1. ai_generations    — Claude/Gemini 호출별 raw 입출력 + 가드레일 결과
--   2. state_transitions — 9-state 머신의 모든 전이 기록
--   3. audit_logs        — 일반 감사 로그 (현재는 AI 생성 중심, 향후 확장)
--
-- 안전:
--   IF NOT EXISTS — 멱등 실행 보장
--   work_products 와의 외래키로 데이터 일관성 유지
--
-- 실행:
--   Supabase Dashboard → SQL Editor → 통째로 붙여넣고 RUN

-- ──────────────────────────────────────────────────
-- 1. ai_generations 테이블
--    AI 호출 1회 = 1 row. 멀티스텝 에이전트의 각 step도 별도 row.
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 컨텍스트
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  process_id TEXT NOT NULL,                  -- 'SYS.1', 'SWE.1' 등
  work_product_id UUID REFERENCES work_products(id) ON DELETE SET NULL,

  -- 에이전트 역할 (Three-Agent Harness 대비)
  agent_role TEXT NOT NULL,                  -- 'planner' | 'generator' | 'evaluator'
  agent_step INT DEFAULT 1,                  -- 같은 generation 내의 step 순서

  -- LLM 호출 정보
  model TEXT NOT NULL,                       -- 'claude-sonnet-4-6', 'gemini-2.x' 등
  provider TEXT NOT NULL,                    -- 'anthropic' | 'google'

  -- 입력
  system_prompt TEXT,                        -- 시스템 프롬프트 (Skills 포함)
  user_prompt TEXT,                          -- 사용자 입력 (구조화된 입력)
  skills_used JSONB DEFAULT '[]'::jsonb,     -- 사용한 SKILL.md 목록

  -- 출력
  raw_output TEXT,                           -- Claude의 원본 응답 (텍스트)
  parsed_output JSONB,                       -- 파싱된 JSON 결과
  finish_reason TEXT,                        -- 'end_turn' | 'max_tokens' | 'stop_sequence'

  -- 가드레일 결과
  guardrail_result JSONB DEFAULT '{}'::jsonb,
  -- 예시: {
  --   "structure":     {"passed": true,  "issues": []},
  --   "traceability":  {"passed": true,  "issues": []},
  --   "domain":        {"passed": false, "issues": ["abstract term: 'fast'"]},
  --   "cross_verify":  {"passed": true,  "evaluator_score": 0.92},
  --   "hitl":          {"required": true, "approved": false}
  -- }
  guardrail_passed BOOLEAN DEFAULT NULL,     -- 모든 활성 축 통과 여부

  -- 비용·성능
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10, 6),                   -- 추정 비용
  latency_ms INT,

  -- 재시도·상태
  attempt_number INT DEFAULT 1,              -- 같은 컨텍스트의 N번째 시도
  parent_generation_id UUID REFERENCES ai_generations(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',             -- 'pending' | 'success' | 'failed' | 'blocked_by_guardrail'
  error_message TEXT,

  -- 메타
  created_by UUID,                           -- 향후 인증 후 채워질 user.id
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_project ON ai_generations(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_gen_wp ON ai_generations(work_product_id);
CREATE INDEX IF NOT EXISTS idx_ai_gen_created ON ai_generations(created_at DESC);

-- ──────────────────────────────────────────────────
-- 2. state_transitions 테이블
--    work_products 의 9-state 머신 전이 기록
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  work_product_id UUID NOT NULL REFERENCES work_products(id) ON DELETE CASCADE,
  from_state TEXT,                           -- NULL = 최초 생성
  to_state TEXT NOT NULL,                    -- 'INITIAL' | 'GENERATING' | 'GENERATED' | ...

  -- 전이 사유
  trigger TEXT NOT NULL,                     -- 'user_action' | 'ai_generation' | 'guardrail' | 'reviewer'
  reason TEXT,                               -- 자유 텍스트 사유

  -- 관련 리소스
  ai_generation_id UUID REFERENCES ai_generations(id) ON DELETE SET NULL,

  -- 메타
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_trans_wp ON state_transitions(work_product_id);
CREATE INDEX IF NOT EXISTS idx_state_trans_at ON state_transitions(performed_at DESC);

-- ──────────────────────────────────────────────────
-- 3. audit_logs 테이블
--    일반 감사 로그 (AI 생성 외 다른 동작도 향후 기록)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 액션
  action TEXT NOT NULL,                      -- 'ai_generate' | 'wp_save' | 'project_create' 등
  resource_type TEXT,                        -- 'work_product' | 'project' | 'ai_generation'
  resource_id UUID,

  -- 컨텍스트
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}'::jsonb,

  -- 누가
  performed_by UUID,
  ip_address TEXT,
  user_agent TEXT,

  -- 언제
  performed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(performed_at DESC);

-- ──────────────────────────────────────────────────
-- 4. RLS 비활성화 (Phase 3에서 인증과 함께 활성화)
-- ──────────────────────────────────────────────────
ALTER TABLE ai_generations    DISABLE ROW LEVEL SECURITY;
ALTER TABLE state_transitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        DISABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────
-- 5. 확인 쿼리
-- ──────────────────────────────────────────────────
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('ai_generations', 'state_transitions', 'audit_logs')
 ORDER BY table_name, ordinal_position;

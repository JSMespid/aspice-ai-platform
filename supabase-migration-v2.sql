-- ASPICE AI Platform v2 — DB Migration
-- 기존 supabase-schema.sql에 이어서 실행하세요.
-- 안전: 기존 데이터는 보존됩니다 (ALTER + ADD IF NOT EXISTS 패턴).

-- ──────────────────────────────────────────────────
-- 1. work_products 테이블 확장
-- ──────────────────────────────────────────────────
-- v2 9-state State Machine 컬럼
ALTER TABLE work_products
  ADD COLUMN IF NOT EXISTS state VARCHAR(30);

-- v2 Rationale Report 컬럼 (생성 메타데이터 + QA 결과 + 가드레일 적용 내역)
ALTER TABLE work_products
  ADD COLUMN IF NOT EXISTS rationale JSONB;

-- 기존 status를 새 state로 매핑 (1회성)
UPDATE work_products SET state = 'GENERATED'        WHERE status = '초안'   AND state IS NULL;
UPDATE work_products SET state = 'PENDING_APPROVAL' WHERE status = '검토중' AND state IS NULL;
UPDATE work_products SET state = 'APPROVED'         WHERE status = '승인됨' AND state IS NULL;
UPDATE work_products SET state = 'INITIAL'          WHERE state IS NULL;

-- ──────────────────────────────────────────────────
-- 2. 상태 전이 이력 (감사 추적용 — 환각 방지 축 5)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS state_transitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_product_id UUID REFERENCES work_products(id) ON DELETE CASCADE,
  from_state VARCHAR(30),
  to_state VARCHAR(30) NOT NULL,
  event VARCHAR(40) NOT NULL,
  actor_role VARCHAR(20),
  actor_email TEXT,
  comment TEXT,
  qa_score NUMERIC,
  critical_count INTEGER,
  major_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_trans_wp ON state_transitions(work_product_id);
CREATE INDEX IF NOT EXISTS idx_state_trans_created ON state_transitions(created_at DESC);

-- ──────────────────────────────────────────────────
-- 3. Eval Harness 결과 저장소 (선택 — 시연용 대시보드 데이터)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dataset_id VARCHAR(100) NOT NULL,
  process VARCHAR(20) NOT NULL,
  score NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  checks_passed INTEGER,
  checks_total INTEGER,
  duration_sec NUMERIC,
  error_message TEXT,
  output JSONB,
  checks JSONB,
  git_sha VARCHAR(40),
  triggered_by VARCHAR(40),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_dataset ON eval_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_created ON eval_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_process ON eval_runs(process);

-- ──────────────────────────────────────────────────
-- 4. RLS 비활성화 (개발/시연용)
-- ──────────────────────────────────────────────────
ALTER TABLE state_transitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs DISABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────
-- 5. 확인 쿼리
-- ──────────────────────────────────────────────────
SELECT 'state distribution' AS metric, state, COUNT(*) AS count
  FROM work_products GROUP BY state
UNION ALL
SELECT 'tables created', tablename, 1
  FROM pg_tables WHERE tablename IN ('state_transitions', 'eval_runs');

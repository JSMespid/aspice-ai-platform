-- ASPICE AI Platform - Supabase 테이블 생성 SQL
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 1. work_products 테이블
CREATE TABLE IF NOT EXISTS work_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id VARCHAR(10) NOT NULL,          -- SYS.1 ~ SYS.5
  title TEXT NOT NULL,
  project_name TEXT,
  domain TEXT DEFAULT '자동차 부품',
  content JSONB,                             -- AI 생성 산출물 (JSON)
  status VARCHAR(20) DEFAULT '초안',         -- 초안 | 검토중 | 승인됨 | 거부됨
  qa_result JSONB,                           -- QA Agent 검증 결과
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_products_updated_at
  BEFORE UPDATE ON work_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_wp_process ON work_products(process_id);
CREATE INDEX IF NOT EXISTS idx_wp_status ON work_products(status);
CREATE INDEX IF NOT EXISTS idx_wp_created ON work_products(created_at DESC);

-- 4. RLS 비활성화 (개발용 - 프로덕션에서는 RLS 설정 필요)
ALTER TABLE work_products DISABLE ROW LEVEL SECURITY;

-- 확인
SELECT COUNT(*) FROM work_products;

-- ASPICE AI Platform v2 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 1. projects 테이블 (신규)
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT DEFAULT '자동차 부품',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. work_products 테이블 (project_id 추가)
CREATE TABLE IF NOT EXISTS work_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  process_id VARCHAR(10) NOT NULL,
  title TEXT NOT NULL,
  domain TEXT DEFAULT '자동차 부품',
  content JSONB,
  status VARCHAR(20) DEFAULT '초안',
  qa_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER work_products_updated_at
  BEFORE UPDATE ON work_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_project ON work_products(project_id);
CREATE INDEX IF NOT EXISTS idx_wp_process ON work_products(process_id);
CREATE INDEX IF NOT EXISTS idx_wp_status ON work_products(status);
CREATE INDEX IF NOT EXISTS idx_wp_created ON work_products(created_at DESC);

-- 5. RLS 비활성화 (개발용)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_products DISABLE ROW LEVEL SECURITY;

-- 확인
SELECT 'projects' AS tbl, COUNT(*) FROM projects
UNION ALL
SELECT 'work_products', COUNT(*) FROM work_products;

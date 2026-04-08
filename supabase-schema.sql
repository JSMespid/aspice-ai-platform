-- 1. projects 테이블 생성
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT DEFAULT '자동차 부품',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 기존 work_products에 project_id 컬럼 추가 (없을 때만)
ALTER TABLE work_products
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 3. updated_at 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 트리거 등록 (projects)
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_project       ON work_products(project_id);

-- 6. RLS 비활성화
ALTER TABLE projects      DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_products DISABLE ROW LEVEL SECURITY;

-- 7. 확인
SELECT 'projects' AS tbl, COUNT(*) FROM projects
UNION ALL
SELECT 'work_products', COUNT(*) FROM work_products;

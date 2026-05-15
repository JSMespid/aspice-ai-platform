// src/lib/exporters.js — Phase 2-2b STEP C-3a
//
// 산출물 다운로드 기능 (실제 제품용)
// 형식:
//   - JSON     (원본, 시스템 통합용)
//   - CSV      (엑셀 빠른 정리, STK_REQ 표)
//   - Markdown (보고서 형식, GitHub/Notion 게시)
//   - DOCX     (Phase 2-2b STEP C-3b — 별도 패키지)
//   - XLSX     (Phase 2-2b STEP C-3c — 별도 패키지)
//
// ASPICE 4.0 평가 시 평가관에게 제출할 deliverable 생성.

// ──────────────────────────────────────────────────
// 공통 헬퍼
// ──────────────────────────────────────────────────

/**
 * 파일 다운로드 트리거 — Blob 을 만들어 사용자 브라우저에 저장
 */
export function triggerDownload(content, filename, mimeType) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType || 'application/octet-stream' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 약간 지연 후 URL 해제 (Safari 호환)
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/**
 * 파일명 안전화 — 공백/특수문자 제거
 */
export function sanitizeFilename(name) {
  return String(name || 'output')
    .replace(/[^\w\-_가-힣]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

/**
 * 현재 날짜 (yyyy-mm-dd) 또는 yyyy-mm-dd_hhmmss
 */
export function nowStamp(withTime = false) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (!withTime) return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

/**
 * UTF-8 BOM 추가 (Excel CSV 한글 깨짐 방지)
 */
function withBom(text) {
  return '\uFEFF' + text;
}

// ──────────────────────────────────────────────────
// JSON Export
// ──────────────────────────────────────────────────

/**
 * JSON 원본 다운로드
 * @param {Object} aiGenerated - work_products.content.ai_generated
 * @param {Object} meta - { project_name, process_id, version, ... }
 */
export function exportJSON(aiGenerated, meta = {}) {
  const wrapped = {
    _metadata: {
      tool: 'ASPICE AI Platform',
      version: meta.version || '2.2b',
      project: meta.project_name || null,
      process: meta.process_id || null,
      exported_at: new Date().toISOString(),
      exported_by: meta.exported_by || null,
      generator_model: meta.generator_model || null,
      evaluator_model: meta.evaluator_model || null,
    },
    ai_generated: aiGenerated,
    qa_critique: meta.critique || null,
  };

  const json = JSON.stringify(wrapped, null, 2);
  const filename = `${sanitizeFilename(meta.project_name || 'project')}_${meta.process_id || 'SYS1'}_${nowStamp()}.json`;
  triggerDownload(json, filename, 'application/json');
  return { filename, size: json.length };
}

// ──────────────────────────────────────────────────
// CSV Export
// ──────────────────────────────────────────────────

/**
 * CSV 1 행으로 직렬화 (RFC 4180)
 */
function csvField(v) {
  if (v == null) return '';
  const s = String(v);
  // 쉼표, 큰따옴표, 줄바꿈 포함 시 따옴표로 감싸고 내부 " 는 ""로 escape
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(fields) {
  return fields.map(csvField).join(',');
}

/**
 * STK_REQ CSV 다운로드 (Excel 한글 호환)
 */
export function exportCSV(aiGenerated, meta = {}) {
  const stkReqs = aiGenerated.stakeholder_requirements || [];

  // 헤더
  const header = [
    'ID',
    'Category',
    'Priority',
    'Verification_Method',
    'Statement',
    'Rationale',
    'Source_Doc',
    'User_Modified',
    'Modified_At',
  ];

  const lines = [csvLine(header)];

  for (const r of stkReqs) {
    lines.push(csvLine([
      r.id,
      r.category,
      r.priority,
      r.verification_method,
      r.statement,
      r.rationale,
      r.source_doc,
      r.modified === true ? 'YES' : '',
      r.modified_at || '',
    ]));
  }

  const csv = lines.join('\r\n');
  const filename = `${sanitizeFilename(meta.project_name || 'project')}_${meta.process_id || 'SYS1'}_STK_REQ_${nowStamp()}.csv`;
  triggerDownload(withBom(csv), filename, 'text/csv;charset=utf-8');
  return { filename, size: csv.length, rows: stkReqs.length };
}

// ──────────────────────────────────────────────────
// Markdown Export
// ──────────────────────────────────────────────────

/**
 * Markdown 보고서 다운로드
 */
export function exportMarkdown(aiGenerated, meta = {}) {
  const stkReqs = aiGenerated.stakeholder_requirements || [];
  const useCases = aiGenerated.use_cases || [];
  const opContext = aiGenerated.operational_context || {};
  const traceSeeds = aiGenerated.traceability_seeds || {};
  const critique = meta.critique || null;

  const lines = [];

  // 표지
  lines.push(`# ${aiGenerated.title || 'Stakeholder Requirements'}`);
  lines.push('');
  lines.push(`> ASPICE AI Platform — ${meta.process_id || 'SYS.1'} 산출물`);
  lines.push('');
  lines.push('## 메타데이터');
  lines.push('');
  lines.push(`| 항목 | 값 |`);
  lines.push(`|---|---|`);
  lines.push(`| 프로젝트 | ${meta.project_name || '—'} |`);
  lines.push(`| 프로세스 | ${meta.process_id || 'SYS.1'} |`);
  lines.push(`| 생성 모델 | ${meta.generator_model || 'claude-opus-4-7'} |`);
  lines.push(`| QA 검토 모델 | ${meta.evaluator_model || '—'} |`);
  lines.push(`| 내보내기 일시 | ${new Date().toISOString()} |`);
  lines.push(`| 사용자 수정 | ${aiGenerated.user_modified ? '있음' : '없음'} |`);
  lines.push('');

  // 통계
  const categoryStats = {};
  for (const r of stkReqs) {
    categoryStats[r.category] = (categoryStats[r.category] || 0) + 1;
  }
  const priorityStats = {};
  for (const r of stkReqs) {
    priorityStats[r.priority] = (priorityStats[r.priority] || 0) + 1;
  }

  lines.push('## 통계');
  lines.push('');
  lines.push(`- **Stakeholder Requirements**: ${stkReqs.length}개`);
  lines.push(`- **Use Cases**: ${useCases.length}개`);
  lines.push(`- **법규/표준**: ${opContext.regulatory_constraints?.length || 0}건`);
  lines.push(`- **외부 인터페이스**: ${opContext.external_interfaces?.length || 0}건`);
  lines.push('');
  lines.push('### Category 별');
  lines.push('');
  for (const [cat, count] of Object.entries(categoryStats)) {
    lines.push(`- ${cat}: ${count}`);
  }
  lines.push('');
  lines.push('### Priority 별');
  lines.push('');
  for (const [pri, count] of Object.entries(priorityStats)) {
    lines.push(`- ${pri.toUpperCase()}: ${count}`);
  }
  lines.push('');

  // 1. Operational Context
  lines.push('## 1. Operational Context');
  lines.push('');
  if (opContext.operating_conditions) {
    lines.push(`**운영 조건**: ${opContext.operating_conditions}`);
    lines.push('');
  }
  if (opContext.regulatory_constraints?.length > 0) {
    lines.push('**법규 / 표준**:');
    lines.push('');
    for (const r of opContext.regulatory_constraints) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }
  if (opContext.external_interfaces?.length > 0) {
    lines.push('**외부 인터페이스**:');
    lines.push('');
    for (const i of opContext.external_interfaces) {
      lines.push(`- ${i}`);
    }
    lines.push('');
  }

  // 2. Stakeholder Requirements
  lines.push('## 2. Stakeholder Requirements');
  lines.push('');
  for (const r of stkReqs) {
    const modifiedBadge = r.modified ? ' ✏ **(사용자 수정)**' : '';
    lines.push(`### ${r.id} — ${r.category}, ${r.priority.toUpperCase()}${modifiedBadge}`);
    lines.push('');
    lines.push(`**Statement**: ${r.statement}`);
    lines.push('');
    if (r.rationale) {
      lines.push(`**Rationale**: ${r.rationale}`);
      lines.push('');
    }
    lines.push(`**Verification Method**: ${r.verification_method}`);
    lines.push('');
    if (r.source_doc) {
      lines.push(`**Source**: \`${r.source_doc}\``);
      lines.push('');
    }
    if (r.modified_at) {
      lines.push(`*최근 수정: ${r.modified_at}*`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  // 3. Use Cases
  if (useCases.length > 0) {
    lines.push('## 3. Use Cases');
    lines.push('');
    for (const uc of useCases) {
      lines.push(`### ${uc.id} — ${uc.name}`);
      lines.push('');
      lines.push(`**Actor**: ${uc.actor}`);
      lines.push('');
      if (uc.main_flow?.length > 0) {
        lines.push('**Main Flow**:');
        lines.push('');
        uc.main_flow.forEach((step, idx) => {
          lines.push(`${idx + 1}. ${step}`);
        });
        lines.push('');
      }
      if (uc.linked_requirements?.length > 0) {
        lines.push(`**연결 STK_REQ**: ${uc.linked_requirements.join(', ')}`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  // 4. Traceability Matrix
  lines.push('## 4. Traceability Matrix');
  lines.push('');
  if (traceSeeds.from_sw_req?.length > 0) {
    lines.push('### SW Requirements → STK_REQ');
    lines.push('');
    lines.push('```');
    for (const t of traceSeeds.from_sw_req) lines.push(t);
    lines.push('```');
    lines.push('');
  }
  if (traceSeeds.from_hw_req?.length > 0) {
    lines.push('### HW Requirements → STK_REQ');
    lines.push('');
    lines.push('```');
    for (const t of traceSeeds.from_hw_req) lines.push(t);
    lines.push('```');
    lines.push('');
  }
  if (traceSeeds.from_sow?.length > 0) {
    lines.push('### Statement of Work → STK_REQ');
    lines.push('');
    lines.push('```');
    for (const t of traceSeeds.from_sow) lines.push(t);
    lines.push('```');
    lines.push('');
  }

  // 5. QA Critique (있으면)
  if (critique) {
    lines.push('## 5. AI QA 검토 결과 (Gemini 독립 평가)');
    lines.push('');
    lines.push(`**Verdict**: ${critique.verdict || '—'}`);
    lines.push('');
    lines.push(`**점수**: ${((critique.overall_score || 0) * 100).toFixed(0)} / 100`);
    lines.push('');
    if (critique.summary) {
      lines.push(`**요약**: ${critique.summary}`);
      lines.push('');
    }
    if (critique.strengths?.length > 0) {
      lines.push('### ✓ 강점');
      lines.push('');
      for (const s of critique.strengths) {
        lines.push(`- ${s}`);
      }
      lines.push('');
    }
    if (critique.issues?.length > 0) {
      lines.push('### ⚠ 발견된 이슈');
      lines.push('');
      for (const issue of critique.issues) {
        lines.push(`#### ${issue.severity?.toUpperCase() || '—'} — ${issue.category || ''} ${issue.target_id ? `→ ${issue.target_id}` : ''}`);
        lines.push('');
        lines.push(`**Issue**: ${issue.issue}`);
        lines.push('');
        if (issue.evidence) {
          lines.push(`**Evidence**: \`${issue.evidence}\``);
          lines.push('');
        }
        if (issue.suggested_fix) {
          lines.push(`**제안**: ${issue.suggested_fix}`);
          lines.push('');
        }
      }
    }
    if (critique.refinement_instructions) {
      lines.push('### 💡 개선 지시');
      lines.push('');
      lines.push(critique.refinement_instructions);
      lines.push('');
    }
  }

  // 6. 푸터
  lines.push('---');
  lines.push('');
  lines.push(`*ASPICE AI Platform 으로 생성됨 — ${new Date().toISOString()}*`);
  lines.push('');

  const md = lines.join('\n');
  const filename = `${sanitizeFilename(meta.project_name || 'project')}_${meta.process_id || 'SYS1'}_${nowStamp()}.md`;
  triggerDownload(md, filename, 'text/markdown;charset=utf-8');
  return { filename, size: md.length };
}

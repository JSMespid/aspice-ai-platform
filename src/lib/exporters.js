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

// ──────────────────────────────────────────────────
// DOCX Export (Phase 2-2b STEP C-3b)
// ──────────────────────────────────────────────────
// ASPICE 평가관 제출용 Word 문서 생성
// - docx 라이브러리를 CDN 에서 동적 import (npm 의존성 추가 없음)
// - 7개 섹션: 표지, Operational Context, STK_REQ, Use Cases, Traceability, Metadata, QA Critique, User Modifications
// - 한글 폰트: 기본 (Word 자동 fallback)
// - 사용 라이브러리: docx@9.6.1 (https://esm.sh/docx@9.6.1)

const DOCX_CDN_URL = 'https://esm.sh/docx@9.6.1';

// docx 라이브러리는 페이지당 1회만 로드 (캐시)
let _docxLib = null;
async function loadDocxLib() {
  if (_docxLib) return _docxLib;
  try {
    _docxLib = await import(/* @vite-ignore */ DOCX_CDN_URL);
    return _docxLib;
  } catch (e) {
    console.error('[exporters] docx 라이브러리 로드 실패:', e);
    throw new Error(`docx 라이브러리 로드 실패 (CDN 접속 확인 필요): ${e.message}`);
  }
}

/**
 * Word (DOCX) 다운로드
 * @param {Object} aiGenerated
 * @param {Object} meta
 */
export async function exportDOCX(aiGenerated, meta = {}) {
  const docx = await loadDocxLib();
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
    PageBreak, LevelFormat, convertInchesToTwip, TabStopType, TabStopPosition,
  } = docx;

  const stkReqs = aiGenerated.stakeholder_requirements || [];
  const useCases = aiGenerated.use_cases || [];
  const opContext = aiGenerated.operational_context || {};
  const traceSeeds = aiGenerated.traceability_seeds || {};
  const critique = meta.critique || null;

  // 통계 계산
  const categoryStats = {};
  const priorityStats = {};
  for (const r of stkReqs) {
    categoryStats[r.category] = (categoryStats[r.category] || 0) + 1;
    priorityStats[r.priority] = (priorityStats[r.priority] || 0) + 1;
  }
  const modifiedCards = stkReqs.filter(r => r.modified === true);

  // ──── 헬퍼: 텍스트 단락 ────
  const p = (text, opts = {}) => new Paragraph({
    children: [new TextRun({
      text: String(text || ''),
      bold: opts.bold,
      italics: opts.italics,
      color: opts.color,
      size: opts.size,  // half-points (24 = 12pt)
      font: opts.font,
    })],
    alignment: opts.alignment,
    spacing: { after: opts.spacingAfter ?? 120 },
    heading: opts.heading,
    pageBreakBefore: opts.pageBreak,
  });

  // ──── 헬퍼: 라벨 + 값 형태의 줄 (메타데이터 표시용) ────
  const labelValue = (label, value) => new Paragraph({
    children: [
      new TextRun({ text: `${label}:  `, bold: true, size: 22 }),
      new TextRun({ text: String(value || '—'), size: 22 }),
    ],
    spacing: { after: 80 },
  });

  // ──── 헬퍼: 표 셀 ────
  const cell = (text, opts = {}) => new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.bg ? { type: ShadingType.CLEAR, fill: opts.bg } : undefined,
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text || ''),
        bold: opts.bold,
        color: opts.color,
        size: opts.size || 20,
      })],
      alignment: opts.alignment,
    })],
  });

  // ──── 1. 표지 ────
  const coverPage = [
    new Paragraph({
      children: [new TextRun({ text: '', size: 24 })],
      spacing: { after: 2400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: aiGenerated.title || 'Stakeholder Requirements',
        bold: true, size: 40, color: '1E2761',
      })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `ASPICE PAM v4.0 · ${meta.process_id || 'SYS.1'} Work Product`,
        size: 24, color: '666666',
      })],
      spacing: { after: 1200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: meta.project_name || '—',
        bold: true, size: 32,
      })],
      spacing: { after: 1800 },
    }),

    // 메타데이터 표 (2x N)
    new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({ children: [
          cell('Project', { bold: true, bg: 'F0F2F8', width: 30 }),
          cell(meta.project_name || '—', { width: 70 }),
        ]}),
        new TableRow({ children: [
          cell('Process', { bold: true, bg: 'F0F2F8' }),
          cell(meta.process_id || 'SYS.1'),
        ]}),
        new TableRow({ children: [
          cell('Generated', { bold: true, bg: 'F0F2F8' }),
          cell(new Date().toLocaleString('ko-KR')),
        ]}),
        new TableRow({ children: [
          cell('Generator Model', { bold: true, bg: 'F0F2F8' }),
          cell(meta.generator_model || 'claude-opus-4-7'),
        ]}),
        new TableRow({ children: [
          cell('QA Evaluator Model', { bold: true, bg: 'F0F2F8' }),
          cell(meta.evaluator_model || '—'),
        ]}),
        new TableRow({ children: [
          cell('User Modified', { bold: true, bg: 'F0F2F8' }),
          cell(modifiedCards.length > 0 ? `YES (${modifiedCards.length} cards)` : 'NO'),
        ]}),
        new TableRow({ children: [
          cell('Tool', { bold: true, bg: 'F0F2F8' }),
          cell(`ASPICE AI Platform v${meta.version || '2.2b'}`),
        ]}),
      ],
    }),

    new Paragraph({
      children: [new PageBreak()],
    }),
  ];

  // ──── 2. 통계 요약 ────
  const statsSection = [
    p('Document Overview', { heading: HeadingLevel.HEADING_1, spacingAfter: 200 }),
    labelValue('Stakeholder Requirements', `${stkReqs.length} items`),
    labelValue('Use Cases', `${useCases.length} items`),
    labelValue('Regulatory Constraints', `${opContext.regulatory_constraints?.length || 0} items`),
    labelValue('External Interfaces', `${opContext.external_interfaces?.length || 0} items`),
    p('', { spacingAfter: 120 }),

    p('Category Distribution', { bold: true, size: 22, spacingAfter: 100 }),
    ...Object.entries(categoryStats).map(([k, v]) => labelValue(`  ${k}`, `${v}`)),
    p('', { spacingAfter: 120 }),

    p('Priority Distribution', { bold: true, size: 22, spacingAfter: 100 }),
    ...Object.entries(priorityStats).map(([k, v]) => labelValue(`  ${k.toUpperCase()}`, `${v}`)),
  ];

  // ──── 3. Section 1: Operational Context ────
  const operationalContext = [
    new Paragraph({
      children: [new PageBreak()],
    }),
    p('1. Operational Context', { heading: HeadingLevel.HEADING_1, spacingAfter: 240 }),
    p('1.1 Operating Conditions', { heading: HeadingLevel.HEADING_2, spacingAfter: 160 }),
    p(opContext.operating_conditions || '—', { spacingAfter: 240 }),

    p('1.2 Regulatory Constraints', { heading: HeadingLevel.HEADING_2, spacingAfter: 160 }),
    ...(opContext.regulatory_constraints || []).map(r =>
      new Paragraph({
        children: [new TextRun({ text: '• ', bold: true }), new TextRun({ text: r, size: 22 })],
        spacing: { after: 80 },
        indent: { left: 200 },
      })
    ),
    p('', { spacingAfter: 120 }),

    p('1.3 External Interfaces', { heading: HeadingLevel.HEADING_2, spacingAfter: 160 }),
    ...(opContext.external_interfaces || []).map(i =>
      new Paragraph({
        children: [new TextRun({ text: '• ', bold: true }), new TextRun({ text: i, size: 22 })],
        spacing: { after: 80 },
        indent: { left: 200 },
      })
    ),
  ];

  // ──── 4. Section 2: Stakeholder Requirements ────
  const stkReqSection = [
    new Paragraph({
      children: [new PageBreak()],
    }),
    p(`2. Stakeholder Requirements (${stkReqs.length})`, {
      heading: HeadingLevel.HEADING_1, spacingAfter: 240,
    }),
  ];

  for (const r of stkReqs) {
    const isModified = r.modified === true;
    // 카드 1개당 미니 표
    stkReqSection.push(
      new Paragraph({
        children: [
          new TextRun({ text: r.id, bold: true, size: 26, color: '1E2761' }),
          new TextRun({ text: '   ' }),
          new TextRun({ text: `[${r.category}]`, size: 20, color: '666666' }),
          new TextRun({ text: '  ' }),
          new TextRun({ text: r.priority?.toUpperCase() || '—', bold: true, size: 20, color: priorityColor(r.priority) }),
          new TextRun({ text: '  ' }),
          new TextRun({ text: `🔍 ${r.verification_method || '—'}`, size: 18, color: '888888' }),
          ...(isModified ? [
            new TextRun({ text: '   ' }),
            new TextRun({ text: '✏ USER MODIFIED', bold: true, size: 18, color: '92400E' }),
          ] : []),
        ],
        spacing: { after: 120, before: 200 },
      })
    );

    stkReqSection.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [
          cell('Statement', { bold: true, bg: 'F0F2F8', width: 18 }),
          cell(r.statement || '—', { width: 82 }),
        ]}),
        ...(r.rationale ? [new TableRow({ children: [
          cell('Rationale', { bold: true, bg: 'F0F2F8' }),
          cell(r.rationale),
        ]})] : []),
        ...(r.source_doc ? [new TableRow({ children: [
          cell('Source', { bold: true, bg: 'F0F2F8' }),
          cell(r.source_doc),
        ]})] : []),
        ...(r.modified_at ? [new TableRow({ children: [
          cell('Last Modified', { bold: true, bg: 'F0F2F8' }),
          cell(new Date(r.modified_at).toLocaleString('ko-KR')),
        ]})] : []),
      ],
    }));

    stkReqSection.push(p('', { spacingAfter: 100 }));
  }

  // ──── 5. Section 3: Use Cases ────
  const useCaseSection = [];
  if (useCases.length > 0) {
    useCaseSection.push(
      new Paragraph({ children: [new PageBreak()] }),
      p(`3. Use Cases (${useCases.length})`, {
        heading: HeadingLevel.HEADING_1, spacingAfter: 240,
      }),
    );
    for (const uc of useCases) {
      useCaseSection.push(
        new Paragraph({
          children: [
            new TextRun({ text: uc.id, bold: true, size: 26, color: '1E2761' }),
            new TextRun({ text: '   ' }),
            new TextRun({ text: uc.name || '—', size: 24, bold: true }),
          ],
          spacing: { after: 120, before: 200 },
        }),
        labelValue('Actor', uc.actor),
      );
      if (uc.main_flow?.length > 0) {
        useCaseSection.push(p('Main Flow:', { bold: true, size: 22 }));
        for (let i = 0; i < uc.main_flow.length; i++) {
          useCaseSection.push(new Paragraph({
            children: [new TextRun({ text: `${i + 1}. `, bold: true }), new TextRun({ text: uc.main_flow[i], size: 22 })],
            spacing: { after: 60 },
            indent: { left: 300 },
          }));
        }
      }
      if (uc.linked_requirements?.length > 0) {
        useCaseSection.push(labelValue('Linked STK_REQ', uc.linked_requirements.join(', ')));
      }
      useCaseSection.push(p('', { spacingAfter: 120 }));
    }
  }

  // ──── 6. Section 4: Traceability Matrix ────
  const traceSection = [
    new Paragraph({ children: [new PageBreak()] }),
    p('4. Traceability Matrix', { heading: HeadingLevel.HEADING_1, spacingAfter: 240 }),
  ];

  function traceBlock(title, items) {
    if (!items?.length) return [];
    return [
      p(title, { heading: HeadingLevel.HEADING_2, spacingAfter: 160 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: items.map(t => new TableRow({
          children: [cell(t, { size: 18 })],
        })),
      }),
      p('', { spacingAfter: 200 }),
    ];
  }
  traceSection.push(...traceBlock('4.1 SW Requirements → STK_REQ', traceSeeds.from_sw_req));
  traceSection.push(...traceBlock('4.2 HW Requirements → STK_REQ', traceSeeds.from_hw_req));
  traceSection.push(...traceBlock('4.3 Statement of Work → STK_REQ', traceSeeds.from_sow));

  // ──── 7. Section 5: AI Generation Metadata ────
  const metaSection = [
    new Paragraph({ children: [new PageBreak()] }),
    p('5. AI Generation Metadata', { heading: HeadingLevel.HEADING_1, spacingAfter: 240 }),
    labelValue('Generator Model', meta.generator_model || 'claude-opus-4-7'),
    labelValue('Evaluator Model', meta.evaluator_model || '—'),
    labelValue('Tool Version', `ASPICE AI Platform v${meta.version || '2.2b'}`),
    labelValue('Generated At', new Date().toLocaleString('ko-KR')),
    p('', { spacingAfter: 120 }),
    p('Skills Used (Generator)', { bold: true, size: 22, spacingAfter: 100 }),
    labelValue('  •', 'aspice-sys1-derivation'),
    labelValue('  •', 'automotive-domain-guide'),
    labelValue('  •', 'traceability-rules'),
  ];

  // ──── 8. Section 6: QA Critique (있으면) ────
  const critiqueSection = [];
  if (critique) {
    critiqueSection.push(
      new Paragraph({ children: [new PageBreak()] }),
      p('6. AI QA Review Results (Gemini Critique)', {
        heading: HeadingLevel.HEADING_1, spacingAfter: 240,
      }),
      labelValue('Verdict', critique.verdict || '—'),
      labelValue('Overall Score', `${((critique.overall_score || 0) * 100).toFixed(0)} / 100`),
      p('', { spacingAfter: 100 }),
      p('Summary', { bold: true, size: 22, spacingAfter: 80 }),
      p(critique.summary || '—', { spacingAfter: 200 }),
    );

    if (critique.strengths?.length > 0) {
      critiqueSection.push(p(`6.1 Strengths (${critique.strengths.length})`, {
        heading: HeadingLevel.HEADING_2, spacingAfter: 160,
      }));
      for (const s of critique.strengths) {
        critiqueSection.push(new Paragraph({
          children: [
            new TextRun({ text: '✓ ', bold: true, color: '065F46' }),
            new TextRun({ text: s, size: 22 }),
          ],
          spacing: { after: 80 },
          indent: { left: 200 },
        }));
      }
      critiqueSection.push(p('', { spacingAfter: 120 }));
    }

    if (critique.issues?.length > 0) {
      critiqueSection.push(p(`6.2 Issues Found (${critique.issues.length})`, {
        heading: HeadingLevel.HEADING_2, spacingAfter: 160,
      }));
      for (const issue of critique.issues) {
        critiqueSection.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[${(issue.severity || 'unknown').toUpperCase()}]`,
                bold: true, color: severityColor(issue.severity),
                size: 22,
              }),
              new TextRun({ text: '  ' }),
              new TextRun({ text: issue.category || '—', size: 20, color: '666666' }),
              ...(issue.target_id ? [
                new TextRun({ text: '  →  ', size: 20 }),
                new TextRun({ text: issue.target_id, size: 20, color: '1E2761', bold: true }),
              ] : []),
            ],
            spacing: { after: 80, before: 160 },
          }),
        );
        critiqueSection.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              cell('Issue', { bold: true, bg: 'FFF3F3', width: 18 }),
              cell(issue.issue || '—', { width: 82 }),
            ]}),
            ...(issue.evidence ? [new TableRow({ children: [
              cell('Evidence', { bold: true, bg: 'F8F8F8' }),
              cell(issue.evidence),
            ]})] : []),
            ...(issue.suggested_fix ? [new TableRow({ children: [
              cell('Suggested Fix', { bold: true, bg: 'F0F8F0' }),
              cell(issue.suggested_fix),
            ]})] : []),
          ],
        }));
        critiqueSection.push(p('', { spacingAfter: 100 }));
      }
    }

    if (critique.refinement_instructions) {
      critiqueSection.push(
        p('6.3 Refinement Instructions', { heading: HeadingLevel.HEADING_2, spacingAfter: 160 }),
        p(critique.refinement_instructions, { spacingAfter: 200 }),
      );
    }
  }

  // ──── 9. Section 7: User Modification History (있으면) ────
  const modHistorySection = [];
  if (modifiedCards.length > 0) {
    modHistorySection.push(
      new Paragraph({ children: [new PageBreak()] }),
      p(`7. User Modification History (${modifiedCards.length} cards)`, {
        heading: HeadingLevel.HEADING_1, spacingAfter: 240,
      }),
      p('The following cards have been manually reviewed and modified by an engineer:', { spacingAfter: 200 }),
    );
    modHistorySection.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [
          cell('STK_REQ ID', { bold: true, bg: 'F0F2F8', width: 20 }),
          cell('Modified At', { bold: true, bg: 'F0F2F8', width: 40 }),
          cell('Statement (current)', { bold: true, bg: 'F0F2F8', width: 40 }),
        ]}),
        ...modifiedCards.map(r => new TableRow({
          children: [
            cell(r.id),
            cell(r.modified_at ? new Date(r.modified_at).toLocaleString('ko-KR') : '—'),
            cell((r.statement || '').slice(0, 120) + ((r.statement || '').length > 120 ? '...' : '')),
          ],
        })),
      ],
    }));
  }

  // ──── 10. Footer ────
  const footer = [
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: '— End of Document —',
        italics: true, color: '999999',
      })],
      spacing: { before: 2400, after: 240 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `Generated by ASPICE AI Platform v${meta.version || '2.2b'} · ${new Date().toISOString()}`,
        italics: true, color: '999999', size: 18,
      })],
    }),
  ];

  // ──── 문서 조립 ────
  const doc = new Document({
    creator: 'ASPICE AI Platform',
    title: aiGenerated.title || 'Stakeholder Requirements',
    description: `ASPICE ${meta.process_id || 'SYS.1'} work product`,
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',  // 한글은 Word 가 자동 fallback
            size: 22,         // 11pt (half-points)
          },
        },
      },
    },
    sections: [{
      properties: {},
      children: [
        ...coverPage,
        ...statsSection,
        ...operationalContext,
        ...stkReqSection,
        ...useCaseSection,
        ...traceSection,
        ...metaSection,
        ...critiqueSection,
        ...modHistorySection,
        ...footer,
      ],
    }],
  });

  // Blob 생성 + 다운로드
  const blob = await Packer.toBlob(doc);
  const filename = `${sanitizeFilename(meta.project_name || 'project')}_${meta.process_id || 'SYS1'}_${nowStamp()}.docx`;
  triggerDownload(blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return { filename, size: blob.size };
}

// ──── 헬퍼: severity → 색상 (HEX, # 없음) ────
function severityColor(severity) {
  switch (severity) {
    case 'critical': return '991B1B';
    case 'high':     return '92400E';
    case 'medium':   return '3730A3';
    case 'low':      return '374151';
    default:         return '666666';
  }
}

function priorityColor(priority) {
  switch (priority) {
    case 'must':   return 'DC2626';
    case 'should': return 'F59E0B';
    case 'could':  return '6B7280';
    default:       return '6B7280';
  }
}


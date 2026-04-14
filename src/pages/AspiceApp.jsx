import { useState, useEffect, useCallback } from "react";
import {
  T, GLOBAL_CSS, Card, Btn, Badge, Input, Select,
  Textarea, Spinner, EmptyState, StatusBadge, SeverityBadge,
} from "../components/ui.jsx";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const PROCESSES = [
  {
    id: "SYS.1", label: "SYS.1 — Stakeholder Requirements", short: "STK-REQ",
    color: T.accent, icon: "①",
    desc: "이해관계자 니즈를 수집하여 요구사항으로 정의합니다.",
    inputLabel: "프로젝트 배경 / 이해관계자 니즈",
    inputPlaceholder: "예: 전방 카메라 기반 자동 하이빔 제어\n이해관계자: 운전자, OEM, 법규 기관\n주요 요구: 야간 가시성 확보, 눈부심 방지",
    outputSummary: (c) => `Needs ${c?.summary?.total_needs ?? "?"}개 · REQ ${c?.summary?.total_requirements ?? "?"}개`,
  },
  {
    id: "SYS.2", label: "SYS.2 — System Requirements", short: "SYS-REQ",
    color: T.purple, icon: "②",
    desc: "STK-REQ를 시스템 요구사항과 검증 기준으로 변환합니다. (SYS.1 OUT → SYS.2 IN)",
    inputLabel: "이전 단계 산출물 자동 주입 + 추가 기술 맥락",
    inputPlaceholder: "SYS.1 산출물이 자동으로 주입됩니다.\n추가 기술 제약이 있으면 입력하세요.",
    outputSummary: (c) => `Functional ${c?.summary?.total_functional ?? "?"}개 · VC ${c?.summary?.total_vc ?? "?"}개`,
  },
  {
    id: "SYS.3", label: "SYS.3 — System Architecture", short: "Architecture",
    color: T.teal, icon: "③",
    desc: "SYS-REQ를 시스템 요소에 할당하고 아키텍처를 설계합니다. (SYS.2 OUT → SYS.3 IN)",
    inputLabel: "이전 단계 산출물 자동 주입 + 아키텍처 제약",
    inputPlaceholder: "SYS.2 산출물이 자동으로 주입됩니다.\n하드웨어 제약, 플랫폼 정보 등을 입력하세요.",
    outputSummary: (c) => `Elements ${c?.summary?.total_elements ?? "?"}개 · IF ${c?.summary?.total_interfaces ?? "?"}개`,
  },
  {
    id: "SYS.4", label: "SYS.4 — System Integration Test", short: "Integration",
    color: T.amber, icon: "④",
    desc: "시스템 요소를 통합하고 인터페이스를 검증합니다. (SYS.3 OUT → SYS.4 IN)",
    inputLabel: "이전 단계 산출물 자동 주입 + 테스트 환경",
    inputPlaceholder: "SYS.3 산출물이 자동으로 주입됩니다.\n테스트 환경, 장비 정보를 입력하세요.",
    outputSummary: (c) => `Test Cases ${c?.test_cases?.length ?? c?.summary?.total_test_cases ?? "?"}개`,
  },
  {
    id: "SYS.5", label: "SYS.5 — System Qualification Test", short: "Qualification",
    color: T.green, icon: "⑤",
    desc: "시스템이 요구사항을 만족하는지 최종 검증합니다. (SYS.2+SYS.3 OUT → SYS.5 IN)",
    inputLabel: "이전 단계 산출물 자동 주입 + 검증 기준",
    inputPlaceholder: "SYS.2, SYS.3 산출물이 자동으로 주입됩니다.\n검증 환경, 법규 기준을 입력하세요.",
    outputSummary: (c) => `Test Cases ${c?.summary?.total_test_cases ?? "?"}개`,
  },
];

const DOMAIN_OPTIONS = ["자동차 부품", "소프트웨어 시스템", "하드웨어 시스템", "임베디드 시스템", "IT 서비스", "항공우주", "의료기기"];

// ── JSON 파싱 안전 처리 ───────────────────────────────────────────────────────
function safeParseJSON(raw) {
  const text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(text); } catch {}
  const lastClose = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastClose > 0) {
    try { return JSON.parse(text.slice(0, lastClose + 1)); } catch {}
  }
  throw new Error("JSON 파싱 실패 — 다시 시도해 주세요.");
}

// ── Claude API 호출 ───────────────────────────────────────────────────────────
async function callClaude(systemMsg, userMsg, maxTokens = 8000) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemMsg,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || String(data.error));
  const text = data.content?.map(b => b.text || "").join("") || "";
  if (!text) throw new Error("API 응답이 비어있습니다.");
  return safeParseJSON(text);
}

// ── Gemini QA 호출 ────────────────────────────────────────────────────────────
async function callGeminiQA(workProduct) {
  const prompt = `당신은 ASPICE 4.0 QA 전문가입니다. 반드시 한국어로 작성하세요. description과 recommendation 필드는 반드시 한국어로 작성하세요. 아래 산출물을 검증하고 반드시 JSON만 응답하세요. 마크다운 없이 JSON만 출력하세요.

산출물:
${JSON.stringify(workProduct, null, 2)}

다음 JSON 구조로만 응답하세요:
{"overall_score":85,"completeness":{"score":90,"issues":[]},"consistency":{"score":80,"issues":[]},"traceability":{"score":85,"issues":[]},"issues":[{"id":"QA-001","severity":"Critical|Major|Minor|Info","category":"Completeness|Consistency|Traceability|Verifiability|Structure","description":"string","location":"string","recommendation":"string"}],"summary":{"total_issues":0,"critical":0,"major":0,"minor":0,"info":0},"recommendation":"승인 권장|수정 후 재검토|반려"}`;

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const result = safeParseJSON(data.text || "");

  // overall_score를 세 점수의 평균으로 재계산 (일관성 보장)
  if (result) {
    const c = result.completeness?.score ?? 0;
    const co = result.consistency?.score ?? 0;
    const t = result.traceability?.score ?? 0;
    const count = [c, co, t].filter(v => v > 0).length;
    if (count > 0) {
      result.overall_score = Math.round((c + co + t) / count);
    }
  }

  return result;
}

// ── QA 검증 함수 ──────────────────────────────────────────────────────────────
async function runQACheck(workProduct) {
  return await callGeminiQA(workProduct);
}

// ── 산출물 생성 프롬프트 ─────────────────────────────────────────────────────
async function generateWorkProduct(processId, context, projectInfo, prevContents) {
  const SYS_BASE = `당신은 ASPICE 4.0 전문가입니다. 반드시 유효한 JSON만 응답하세요. 마크다운, 설명 없이 완전한 JSON만 출력하세요.`;
  const prev = (key) => prevContents[key] ? `\n\n[이전 단계 산출물 - ${key}]\n${JSON.stringify(prevContents[key], null, 2)}` : "";

  const prompts = {
    "SYS.1": {
      system: SYS_BASE,
      user: `Needs는 최대 5개, Requirements는 최대 6개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
컨텍스트: ${context}

다음 JSON 구조로 Stakeholder Requirements 산출물을 생성하세요:
{"process":"SYS.1","title":"Stakeholder Requirements Specification","needs":[{"id":"N-001","description":"string","source":"string"}],"requirements":[{"id":"STK-REQ-001","title":"string","description":"string","source_needs":["N-001"],"priority":"High|Medium|Low","acceptance_criteria":"string","stability":"Stable|Volatile"}],"traceability":[{"need_id":"N-001","req_id":"STK-REQ-001","relation":"SATISFIES"}],"summary":{"total_needs":0,"total_requirements":0,"high_priority":0}}`,
    },
    "SYS.2": {
      system: SYS_BASE,
      user: `Requirements 최대 7개, VC 최대 7개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.1")}

위의 SYS.1 Stakeholder Requirements를 바탕으로 System Requirements + Verification Criteria를 생성하세요:
{"process":"SYS.2","title":"System Requirements Specification","requirements":[{"id":"SYS-REQ-F-001","title":"string","description":"string","type":"Functional|Non-functional","source_stk_req":["STK-REQ-001"],"priority":"High|Medium|Low","allocated_to":["SE-001"],"relation_type":"REFINES|DERIVES"}],"verification_criteria":[{"id":"VC-001","req_id":"SYS-REQ-F-001","method":"Test|Analysis|Inspection|Demonstration","acceptance_criteria":"string","test_level":"System"}],"traceability":[{"from":"STK-REQ-001","to":"SYS-REQ-F-001","type":"REFINES"}],"summary":{"total_functional":0,"total_nonfunctional":0,"total_vc":0}}`,
    },
    "SYS.3": {
      system: SYS_BASE,
      user: `Elements 최대 5개, Interfaces 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.2")}

위의 SYS.2 System Requirements를 바탕으로 System Architecture를 생성하세요:
{"process":"SYS.3","title":"System Architectural Design","system_elements":[{"id":"SE-001","name":"string","type":"HW|SW|Mechanical|Electrical","description":"string","allocated_requirements":["SYS-REQ-F-001"],"interfaces":["IF-001"]}],"interfaces":[{"id":"IF-001","name":"string","source":"SE-001","target":"SE-002","type":"Data|Control|Power","protocol":"string","specification":"string"}],"allocation_matrix":[{"req_id":"SYS-REQ-F-001","element_id":"SE-001","rationale":"string"}],"integration_strategy":{"approach":"Bottom-up","phases":["string"]},"summary":{"total_elements":0,"total_interfaces":0}}`,
    },
    "SYS.4": {
      system: SYS_BASE,
      user: `Test Cases 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.3")}

위의 SYS.3 Architecture를 바탕으로 System Integration Test를 생성하세요:
{"process":"SYS.4","title":"System Integration Test Specification","integration_strategy":{"approach":"Bottom-up","phases":[{"phase":"Phase 1","description":"string","elements":["SE-001","SE-002"],"interface_verified":"IF-001"}]},"test_cases":[{"id":"ITC-001","title":"string","objective":"string","primary_target":{"interface_id":"IF-001","description":"string"},"integrated_elements":["SE-001","SE-002"],"related_sys_req":["SYS-REQ-F-001"],"precondition":"string","test_steps":["string"],"expected_result":"string","pass_criteria":"string"}],"traceability":[{"test_id":"ITC-001","primary_interface":"IF-001","elements":["SE-001","SE-002"],"indirect_req":"SYS-REQ-F-001"}],"summary":{"total_test_cases":0,"total_interfaces_covered":0}}`,
    },
    "SYS.5": {
      system: SYS_BASE,
      user: `Test Cases 최대 5개로 제한하세요. 완전한 JSON만 출력하세요.
프로젝트: ${projectInfo.name}, 도메인: ${projectInfo.domain}
추가 맥락: ${context}${prev("SYS.2")}${prev("SYS.3")}

위의 SYS.2 + SYS.3 산출물을 바탕으로 System Qualification Test를 생성하세요:
{"process":"SYS.5","title":"System Qualification Test Specification","test_cases":[{"id":"STC-001","title":"string","objective":"string","system_requirements":["SYS-REQ-F-001"],"reference_stk_req":["STK-REQ-001"],"verification_criteria":["VC-001"],"test_environment":"string","test_steps":["string"],"expected_result":"string","pass_criteria":"string","test_type":"Functional|Performance|Safety|Regulatory"}],"traceability":[{"test_id":"STC-001","primary_req":"SYS-REQ-F-001","vc":"VC-001","reference_stk":"STK-REQ-001"}],"coverage_analysis":{"sys_req_covered":"string","vc_covered":"string"},"summary":{"total_test_cases":0}}`,
    },
  };

  const p = prompts[processId];
  return await callClaude(p.system, p.user);
}

// ── 추적성 분석 ───────────────────────────────────────────────────────────────
async function analyzeTraceability(wps) {
  return await callClaude(
    `당신은 ASPICE 4.0 추적성 전문가입니다. 반드시 완전한 JSON만 응답하세요.`,
    `다음 산출물들의 양방향 추적성을 분석하세요:\n${JSON.stringify(wps.map(w => ({ process: w.process_id, data: w.content })), null, 2)}\n\n다음 JSON 구조로 응답:\n{"forward_chain":[{"from":"N-001","to":"STK-REQ-001","relation":"SATISFIES"}],"coverage":{"needs_covered":"5/5 (100%)","stk_req_covered":"4/4 (100%)","sys_req_covered":"5/5 (100%)","elements_allocated":"4/4 (100%)","vc_covered":"5/5 (100%)","test_cases_coverage":"5/5 (100%)"},"orphans":[],"gaps":[],"v_model_mapping":[{"left":"SYS.1 STK-REQ","right":"Acceptance Test","relation":"↔"},{"left":"SYS.2 SYS-REQ","right":"SYS.5 Qualification","relation":"↔"},{"left":"SYS.3 Architecture","right":"SYS.4 Integration","relation":"↔"}]}`
  );
}

// ── API 헬퍼 ─────────────────────────────────────────────────────────────────
async function apiCall(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

// ── Word (.docx) 다운로드 — 누적 포함, 승인 게이팅 ──────────────────────────

// ── XML 헬퍼 ────────────────────────────────────────────────────────────────
function ex(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── ZIP / CRC32 ──────────────────────────────────────────────────────────────
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const t = crc32._t || (crc32._t = (() => {
    const T = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      T[i] = c;
    }
    return T;
  })());
  for (let i = 0; i < data.length; i++) crc = t[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatU8(arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len); let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], cds = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    parts.push(lh, data);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); cd.set(name, 46);
    cds.push(cd);
    offset += lh.length + data.length;
  }
  const cdBytes = concatU8(cds);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true); ev.setUint32(12, cdBytes.length, true);
  ev.setUint32(16, offset, true);
  return concatU8([...parts, cdBytes, eocd]);
}

// ── DOCX XML 빌더 ────────────────────────────────────────────────────────────
function xmlStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
          mc:Ignorable="w14">
<w:docDefaults><w:rPrDefault><w:rPr>
  <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
  <w:sz w:val="22"/><w:szCs w:val="22"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
  <w:name w:val="Normal"/>
  <w:pPr><w:spacing w:after="80"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
  <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="400" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="1E3A6E"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2">
  <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2C5F8A"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3">
  <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="1A4A7A"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading">
  <w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="32"/><w:color w:val="1E3A6E"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOC1">
  <w:name w:val="toc 1"/><w:basedOn w:val="Normal"/>
  <w:pPr>
    <w:spacing w:after="80"/>
    <w:tabs>
      <w:tab w:val="right" w:leader="dot" w:pos="9360"/>
    </w:tabs>
  </w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOC2">
  <w:name w:val="toc 2"/><w:basedOn w:val="Normal"/>
  <w:pPr>
    <w:spacing w:after="60"/>
    <w:ind w:left="360"/>
    <w:tabs>
      <w:tab w:val="right" w:leader="dot" w:pos="9360"/>
    </w:tabs>
  </w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>
</w:style>
</w:styles>`;
}

function xmlNumbering() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1">
  <w:lvl w:ilvl="0">
    <w:start w:val="1"/><w:numFmt w:val="bullet"/>
    <w:lvlText w:val="&#x2022;"/>
    <w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
  </w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function xmlRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;
}

function xmlAppRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function xmlContentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

// ── 단락/표 XML 헬퍼 ─────────────────────────────────────────────────────────
function pBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function pEmpty(spacing = 120) {
  return `<w:p><w:pPr><w:spacing w:after="${spacing}"/></w:pPr></w:p>`;
}

function pH1(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${ex(text)}</w:t></w:r></w:p>`;
}

function pH2(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${ex(text)}</w:t></w:r></w:p>`;
}

function pH3(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t xml:space="preserve">${ex(text)}</w:t></w:r></w:p>`;
}

function pNormal(text, bold = false, color = "", size = 22) {
  const b = bold ? "<w:b/>" : "";
  const col = color ? `<w:color w:val="${color}"/>` : "";
  const sz = `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
  return `<w:p><w:r><w:rPr>${b}${col}${sz}<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">${ex(text)}</w:t></w:r></w:p>`;
}

function pBullet(text) {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">${ex(text)}</w:t></w:r></w:p>`;
}

function pHRule() {
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1E3A6E"/></w:pBdr><w:spacing w:after="160"/></w:pPr></w:p>`;
}

// 2열 상세 표 (왼쪽=라벨 남색, 오른쪽=값)
function tbl2col(rows, colW1, colW2) {
  colW1 = colW1 || 2400; colW2 = colW2 || 6960;
  var bdr = '<w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
  var mar1 = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>';
  var mar2 = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';

  var rowsXml = rows.map(function(pair) {
    var label = pair[0]; var value = pair[1];
    var vals = String(value == null ? "" : value).split("\n").filter(function(v){ return v.trim() !== ""; });
    var valParas = vals.length
      ? vals.map(function(v, i){
          return '<w:p><w:pPr><w:spacing w:after="' + (i < vals.length-1 ? 60 : 0) + '"/></w:pPr>' +
            '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
            '<w:t xml:space="preserve">' + ex(v) + '</w:t></w:r></w:p>';
        }).join("")
      : '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
    return '<w:tr>' +
      '<w:tc><w:tcPr><w:tcW w:w="' + colW1 + '" w:type="dxa"/>' +
        '<w:shd w:val="clear" w:color="auto" w:fill="1E3A6E"/>' + mar1 + '</w:tcPr>' +
        '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' +
          '<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/>' +
            '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' +
            '<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>' +
          '<w:t xml:space="preserve">' + ex(label) + '</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="' + colW2 + '" w:type="dxa"/>' +
        '<w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>' + mar2 + '</w:tcPr>' +
        valParas + '</w:tc>' +
      '</w:tr>';
  }).join("");

  return '<w:tbl>' +
    '<w:tblPr>' +
      '<w:tblW w:w="' + (colW1+colW2) + '" w:type="dxa"/>' +
      '<w:tblBorders>' + bdr + '</w:tblBorders>' +
      '<w:tblLook w:val="0000"/>' +
    '</w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="' + colW1 + '"/><w:gridCol w:w="' + colW2 + '"/></w:tblGrid>' +
    rowsXml +
    '</w:tbl>' +
    '<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>';
}

function tblGeneral(headers, rows) {
  var bdr = '<w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
  var totalW = 9360;
  var colW = Math.floor(totalW / headers.length);
  var mar = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';

  var hRow = '<w:tr>' + headers.map(function(h){
    return '<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="1E3A6E"/>' + mar + '</w:tcPr>' +
      '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' +
        '<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/>' +
          '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' +
          '<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>' +
        '<w:t xml:space="preserve">' + ex(h) + '</w:t></w:r></w:p></w:tc>';
  }).join("") + '</w:tr>';

  var dRows = rows.map(function(row, ri){
    var fill = ri % 2 === 0 ? "FFFFFF" : "EEF4F8";
    return '<w:tr>' + row.map(function(cell){
      return '<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/>' +
        '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' + mar + '</w:tcPr>' +
        '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' +
          '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' +
            '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
          '<w:t xml:space="preserve">' + ex(String(cell == null ? "" : cell)) + '</w:t></w:r></w:p></w:tc>';
    }).join("") + '</w:tr>';
  }).join("");

  return '<w:tbl>' +
    '<w:tblPr>' +
      '<w:tblW w:w="' + totalW + '" w:type="dxa"/>' +
      '<w:tblBorders>' + bdr + '</w:tblBorders>' +
      '<w:tblLook w:val="0000"/>' +
    '</w:tblPr>' +
    '<w:tblGrid>' + headers.map(function(){ return '<w:gridCol w:w="' + colW + '"/>'; }).join("") + '</w:tblGrid>' +
    hRow + dRows +
    '</w:tbl>' +
    '<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>';
}


// ── SYS별 XML 생성 ────────────────────────────────────────────────────────────
function xmlSYS1(c, chapNum) {
  if (!c) return "";
  const parts = [];
  parts.push(pH1(`${chapNum}. SYS.1 — Stakeholder Requirements Definition`));
  parts.push(pNormal("프로세스 목적: 고객 및 이해관계자의 Needs를 Stakeholder Requirements로 변환", false, "555555", 20));
  parts.push(pHRule());

  // 1.1 Needs
  parts.push(pH2(`${chapNum}.1 Stakeholder Needs (입력)`));
  (c.needs || []).forEach(n => {
    parts.push(pBullet(`${n.id}: ${n.description}${n.source ? "  [출처: " + n.source + "]" : ""}`));
  });
  parts.push(pEmpty());

  // 1.2 Requirements
  parts.push(pH2(`${chapNum}.2 Stakeholder Requirements (출력)`));
  (c.requirements || []).forEach(req => {
    parts.push(pH3(`${req.id}: ${req.title || ""}`));
    const rows = [
      ["ID", req.id],
      ["Title", req.title],
      ["Description", req.description],
      ["Source Needs", Array.isArray(req.source_needs) ? req.source_needs.join(", ") : req.source_needs],
      ["Priority", req.priority],
      ["Acceptance Criteria", req.acceptance_criteria],
      ["Stability", req.stability],
    ].filter(([, v]) => v !== undefined && v !== null && v !== "");
    parts.push(tbl2col(rows));
  });

  // 1.3 Traceability
  if (c.traceability?.length) {
    parts.push(pH2(`${chapNum}.3 Traceability`));
    parts.push(tblGeneral(
      ["Need ID", "Requirement ID", "Relation"],
      c.traceability.map(t => [t.need_id, t.req_id, t.relation])
    ));
  }

  // Summary
  if (c.summary) {
    parts.push(pH2("Summary"));
    parts.push(tbl2col(Object.entries(c.summary).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }
  return parts.join("\n");
}

function xmlSYS2(c, chapNum) {
  if (!c) return "";
  const parts = [];
  parts.push(pH1(`${chapNum}. SYS.2 — System Requirements Analysis`));
  parts.push(pNormal("프로세스 목적: Stakeholder Requirements를 System Requirements로 정제 및 검증 기준 정의", false, "555555", 20));
  parts.push(pHRule());

  const functional = (c.requirements || []).filter(r => r.type === "Functional" || r.type?.includes("unctional") || r.id?.includes("F-"));
  const nonfunctional = (c.requirements || []).filter(r => !functional.includes(r));

  const renderReqs = (reqs, label, subNum) => {
    if (!reqs.length) return;
    parts.push(pH2(`${chapNum}.${subNum} ${label}`));
    reqs.forEach(req => {
      parts.push(pH3(`${req.id}: ${req.title || ""}`));
      const rows = [
        ["ID", req.id], ["Title", req.title], ["Description", req.description],
        ["Source (STK-REQ)", Array.isArray(req.source_stk_req) ? req.source_stk_req.join(", ") : req.source_stk_req],
        ["Type", req.type], ["Priority", req.priority],
        ["Verification Method", req.method || "Test"],
        ["Allocated To", Array.isArray(req.allocated_to) ? req.allocated_to.join(", ") : req.allocated_to],
        ["Relation Type", req.relation_type],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  };

  renderReqs(functional, "System Requirements (Functional)", 1);
  renderReqs(nonfunctional, "System Requirements (Non-functional)", 2);

  // Verification Criteria
  if (c.verification_criteria?.length) {
    parts.push(pH2(`${chapNum}.3 Verification Criteria`));
    c.verification_criteria.forEach(vc => {
      parts.push(pH3(`${vc.id}: [${vc.req_id}]`));
      const rows = [
        ["VC ID", vc.id], ["Requirement ID", vc.req_id],
        ["Verification Method", vc.method], ["Acceptance Criteria", vc.acceptance_criteria],
        ["Test Level", vc.test_level],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  }

  // Traceability
  if (c.traceability?.length) {
    parts.push(pH2(`${chapNum}.4 Traceability`));
    parts.push(tblGeneral(["From", "To", "Type"], c.traceability.map(t => [t.from, t.to, t.type])));
  }

  if (c.summary) {
    parts.push(pH2("Summary"));
    parts.push(tbl2col(Object.entries(c.summary).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }
  return parts.join("\n");
}

function xmlSYS3(c, chapNum) {
  if (!c) return "";
  const parts = [];
  parts.push(pH1(`${chapNum}. SYS.3 — System Architectural Design`));
  parts.push(pNormal("프로세스 목적: System Requirements를 System Elements에 할당하고 Architecture 정의", false, "555555", 20));
  parts.push(pHRule());

  if (c.system_elements?.length) {
    parts.push(pH2(`${chapNum}.1 System Elements`));
    c.system_elements.forEach(se => {
      parts.push(pH3(`${se.id}: ${se.name || ""}`));
      const rows = [
        ["ID", se.id], ["Name", se.name], ["Type", se.type],
        ["Description", se.description],
        ["Allocated Requirements", Array.isArray(se.allocated_requirements) ? se.allocated_requirements.join(", ") : se.allocated_requirements],
        ["Interfaces", Array.isArray(se.interfaces) ? se.interfaces.join(", ") : se.interfaces],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  }

  if (c.interfaces?.length) {
    parts.push(pH2(`${chapNum}.2 Interfaces`));
    c.interfaces.forEach(iface => {
      parts.push(pH3(`${iface.id}: ${iface.name || ""}`));
      const rows = [
        ["ID", iface.id], ["Name", iface.name],
        ["Source", iface.source], ["Target", iface.target],
        ["Type", iface.type], ["Protocol", iface.protocol],
        ["Specification", iface.specification],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  }

  if (c.allocation_matrix?.length) {
    parts.push(pH2(`${chapNum}.3 Allocation Matrix`));
    parts.push(tblGeneral(
      ["Requirement ID", "Element ID", "Rationale"],
      c.allocation_matrix.map(a => [a.req_id, a.element_id, a.rationale])
    ));
  }

  if (c.integration_strategy) {
    parts.push(pH2(`${chapNum}.4 Integration Strategy`));
    const is_ = c.integration_strategy;
    parts.push(tbl2col([
      ["Approach", is_.approach],
      ["Phases", Array.isArray(is_.phases) ? is_.phases.join("\n") : is_.phases],
    ].filter(([, v]) => v)));
  }

  if (c.summary) {
    parts.push(pH2("Summary"));
    parts.push(tbl2col(Object.entries(c.summary).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }
  return parts.join("\n");
}

function xmlSYS4(c, chapNum) {
  if (!c) return "";
  const parts = [];
  parts.push(pH1(`${chapNum}. SYS.4 — System Integration Test`));
  parts.push(pNormal("프로세스 목적: System Elements를 통합하고 Interface 및 상호작용 검증", false, "555555", 20));
  parts.push(pHRule());

  if (c.integration_strategy) {
    parts.push(pH2(`${chapNum}.1 Integration Strategy`));
    const is_ = c.integration_strategy;
    const rows = [["Approach", is_.approach]];
    if (is_.phases?.length) {
      is_.phases.forEach((ph, i) => {
        const label = `Phase ${i + 1}`;
        const val = typeof ph === "object"
          ? `${ph.phase || ""}: ${ph.description || ""} | Elements: ${(ph.elements || []).join(", ")} | Interface: ${ph.interface_verified || ""}`
          : String(ph);
        rows.push([label, val]);
      });
    }
    parts.push(tbl2col(rows.filter(([, v]) => v)));
    parts.push(pEmpty());
  }

  if (c.test_cases?.length) {
    parts.push(pH2(`${chapNum}.2 Integration Test Cases`));
    c.test_cases.forEach(tc => {
      parts.push(pH3(`${tc.id}: ${tc.title || ""}`));
      const target = typeof tc.primary_target === "object"
        ? `${tc.primary_target?.interface_id || ""}: ${tc.primary_target?.description || ""}`
        : String(tc.primary_target || "");
      const steps = Array.isArray(tc.test_steps) ? tc.test_steps.join("\n") : String(tc.test_steps || "");
      const rows = [
        ["Test Case ID", tc.id], ["Title", tc.title], ["Objective", tc.objective],
        ["Primary Target (Interface)", target],
        ["Integrated Elements", Array.isArray(tc.integrated_elements) ? tc.integrated_elements.join(", ") : tc.integrated_elements],
        ["Related SYS-REQ", Array.isArray(tc.related_sys_req) ? tc.related_sys_req.join(", ") : tc.related_sys_req],
        ["Precondition", tc.precondition],
        ["Test Steps", steps],
        ["Expected Result", tc.expected_result],
        ["Pass / Fail Criteria", tc.pass_criteria],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  }

  if (c.traceability?.length) {
    parts.push(pH2(`${chapNum}.3 Traceability`));
    parts.push(tblGeneral(
      ["Test ID", "Primary Interface", "Elements", "Indirect SYS-REQ"],
      c.traceability.map(t => [t.test_id, t.primary_interface, (t.elements || []).join(", "), t.indirect_req])
    ));
  }

  if (c.summary) {
    parts.push(pH2("Summary"));
    parts.push(tbl2col(Object.entries(c.summary).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }
  return parts.join("\n");
}

function xmlSYS5(c, chapNum) {
  if (!c) return "";
  const parts = [];
  parts.push(pH1(`${chapNum}. SYS.5 — System Qualification Test`));
  parts.push(pNormal("프로세스 목적: 시스템이 System Requirements를 만족하는지 최종 검증", false, "555555", 20));
  parts.push(pHRule());

  if (c.test_cases?.length) {
    parts.push(pH2(`${chapNum}.1 Qualification Test Cases`));
    c.test_cases.forEach(tc => {
      parts.push(pH3(`${tc.id}: ${tc.title || ""}`));
      const steps = Array.isArray(tc.test_steps) ? tc.test_steps.join("\n") : String(tc.test_steps || "");
      const rows = [
        ["Test Case ID", tc.id], ["Title", tc.title], ["Objective", tc.objective],
        ["System Requirements (Primary)", Array.isArray(tc.system_requirements) ? tc.system_requirements.join(", ") : tc.system_requirements],
        ["Reference STK-REQ", Array.isArray(tc.reference_stk_req) ? tc.reference_stk_req.join(", ") : tc.reference_stk_req],
        ["Verification Criteria", Array.isArray(tc.verification_criteria) ? tc.verification_criteria.join(", ") : tc.verification_criteria],
        ["Test Environment", tc.test_environment],
        ["Test Type", tc.test_type],
        ["Test Steps", steps],
        ["Expected Result", tc.expected_result],
        ["Pass / Fail Criteria", tc.pass_criteria],
      ].filter(([, v]) => v !== undefined && v !== null && v !== "");
      parts.push(tbl2col(rows));
    });
  }

  if (c.traceability?.length) {
    parts.push(pH2(`${chapNum}.2 Traceability`));
    parts.push(tblGeneral(
      ["Test ID", "Primary SYS-REQ", "VC", "Reference STK-REQ"],
      c.traceability.map(t => [t.test_id, t.primary_req, t.vc, t.reference_stk])
    ));
  }

  if (c.coverage_analysis) {
    parts.push(pH2(`${chapNum}.3 Coverage Analysis`));
    parts.push(tbl2col(Object.entries(c.coverage_analysis).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }

  if (c.summary) {
    parts.push(pH2("Summary"));
    parts.push(tbl2col(Object.entries(c.summary).map(([k, v]) => [k.replace(/_/g, " "), String(v)])));
  }
  return parts.join("\n");
}

function xmlTraceability(wps) {
  const parts = [];
  parts.push(pH1("추적성 가이드라인 (Traceability Guidelines)"));
  parts.push(pHRule());
  parts.push(pH2("ASPICE V-Model 추적성 관계"));
  parts.push(tblGeneral(
    ["Development Phase", "Work Product", "Verification Phase", "Test Work Product"],
    [
      ["SYS.1", "Stakeholder Requirements", "Acceptance Test", "Acceptance Test Cases"],
      ["SYS.2", "System Requirements", "SYS.5 Qualification Test", "System Test Cases ✅"],
      ["SYS.3", "System Architecture", "SYS.4 Integration Test", "Integration Test Cases ✅"],
    ]
  ));
  parts.push(pH2("각 프로세스별 추적성 대상"));
  parts.push(pNormal("SYS.4 Integration Test 추적성", true, "1E3A6E", 22));
  parts.push(pBullet("✅ Primary (직접 검증): Interface (IF-xxx), System Element 통합"));
  parts.push(pBullet("⚠️ Indirect (간접 검증): System Requirements (해당 Interface/Element가 구현)"));
  parts.push(pEmpty(80));
  parts.push(pNormal("SYS.5 Qualification Test 추적성", true, "1E3A6E", 22));
  parts.push(pBullet("✅ Primary (직접 검증): System Requirements (SYS-REQ-F-xxx, SYS-REQ-NF-xxx)"));
  parts.push(pBullet("📋 Reference (참조): Stakeholder Requirements (만족도 확인용)"));
  parts.push(pBullet("💡 Note: Stakeholder Requirements는 Acceptance Test (별도 프로세스)에서 직접 검증"));
  return parts.join("\n");
}

function xmlGlossary() {
  const terms = [
    ["Interface (IF)", "시스템 요소 간 연결점 (데이터, 전원, 제어 신호 등)"],
    ["System Element (SE)", "시스템을 구성하는 HW/SW 컴포넌트"],
    ["Integration Test", "Interface 및 Element 통합 검증 (SYS.4)"],
    ["Qualification Test", "System Requirements 검증 (SYS.5)"],
    ["Acceptance Test", "Stakeholder Requirements 검증 (별도 프로세스)"],
    ["HSI", "Hardware-Software Interface"],
    ["Direct Traceability", "직접 검증 대상 (Primary Test Target)"],
    ["Indirect Traceability", "간접 검증 대상 (Related Requirements)"],
    ["V-Model", "ASPICE 개발-검증 모델 (좌측: 개발, 우측: 검증)"],
    ["HIL", "Hardware-in-the-Loop 시뮬레이터"],
    ["HITL", "Human-in-the-Loop (인간 검토 프로세스)"],
    ["STK-REQ", "Stakeholder Requirement (이해관계자 요구사항)"],
    ["SYS-REQ", "System Requirement (시스템 요구사항)"],
    ["VC", "Verification Criteria (검증 기준)"],
  ];
  const parts = [];
  parts.push(pH1("부록 A. 용어 정의 (Glossary)"));
  parts.push(tblGeneral(["용어", "정의"], terms));
  return parts.join("\n");
}

// ── 표지 XML ─────────────────────────────────────────────────────────────────
function xmlCover(project, wps, date) {
  const completedIds = wps.map(w => w.process_id).join(", ") || "진행 중";
  return [
    pEmpty(400),
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1E3A6E"/><w:sz w:val="52"/><w:szCs w:val="52"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${ex(project.name)}</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:color w:val="2C5F8A"/><w:sz w:val="28"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>ASPICE 4.0 산출물 패키지</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="600"/></w:pPr><w:r><w:rPr><w:color w:val="555555"/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>SYS.1 through SYS.5 Work Products</w:t></w:r></w:p>`,
    tbl2col([
      ["Project", project.name],
      ["Domain", project.domain],
      ["Included Processes", completedIds],
      ["Date", date],
      ["Document Set", "ASPICE SYS.1 ~ SYS.5 Package"],
    ], 2200, 7160),
    pBreak(),
  ].join("\n");
}

// ── 전체 문서 XML 조립 ────────────────────────────────────────────────────────
function xmlTOC(wps) {
  const PROC_ORDER = ["SYS.1","SYS.2","SYS.3","SYS.4","SYS.5"];
  const PROC_LABELS = {
    "SYS.1": "SYS.1 — Stakeholder Requirements Definition",
    "SYS.2": "SYS.2 — System Requirements Analysis",
    "SYS.3": "SYS.3 — System Architectural Design",
    "SYS.4": "SYS.4 — System Integration Test",
    "SYS.5": "SYS.5 — System Qualification Test",
  };
  const included = PROC_ORDER.filter(id => wps.some(w => w.process_id === id));

  // 목차 항목 하나 생성 (점선 탭)
  function tocEntry(text, bold) {
    return `<w:p>
      <w:pPr>
        <w:spacing w:before="120" w:after="120"/>
        <w:tabs>
          <w:tab w:val="right" w:leader="dot" w:pos="8640"/>
        </w:tabs>
      </w:pPr>
      <w:r><w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="22"/><w:szCs w:val="22"/>
        ${bold ? '<w:b/>' : ''}
      </w:rPr>
        <w:t xml:space="preserve">${ex(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  const parts = [];

  // 목차 제목
  parts.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:r><w:t>목차 (Table of Contents)</w:t></w:r>
  </w:p>`);

  // 구분선
  parts.push(`<w:p><w:pPr>
    <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1E3A6E"/></w:pBdr>
    <w:spacing w:after="240"/>
  </w:pPr></w:p>`);

  // 각 SYS 장 항목
  included.forEach((id, i) => {
    parts.push(tocEntry(`${i + 1}.  ${PROC_LABELS[id]}`, true));
  });

  // 추적성 가이드라인
  if (included.length >= 2) {
    parts.push(tocEntry(`${included.length + 1}.  추적성 가이드라인 (Traceability Guidelines)`, true));
  }

  // 부록
  parts.push(tocEntry(`부록 A.  용어 정의 (Glossary)`, true));

  // 하단 여백
  parts.push(`<w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>`);

  return parts.join('\n');
}


function buildDocumentXml(project, wps, diagrams) {
  diagrams = diagrams || [];
  const date = new Date().toLocaleDateString("ko-KR");
  const sysMap = {};
  wps.forEach(wp => { sysMap[wp.process_id] = wp.content || {}; });

  const orderedIds = ["SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5"].filter(id => sysMap[id]);

  const bodyParts = [];

  // 표지
  bodyParts.push(xmlCover(project, wps, date));

  // 목차
  bodyParts.push(xmlTOC(wps));
  bodyParts.push(pBreak());

  // 각 SYS 장
  const renderers = { "SYS.1": xmlSYS1, "SYS.2": xmlSYS2, "SYS.3": xmlSYS3, "SYS.4": xmlSYS4, "SYS.5": xmlSYS5 };
  const archDiagram = diagrams.find(d => d.type === "arch");
  const traceDiagram = diagrams.find(d => d.type === "trace");

  orderedIds.forEach((id, i) => {
    if (i > 0) bodyParts.push(pBreak());
    bodyParts.push(renderers[id](sysMap[id], i + 1));

    // SYS.3 다음: 아키텍처 블록 다이어그램 삽입
    if (id === "SYS.3" && archDiagram) {
      bodyParts.push(pH2("Architecture Block Diagram"));
      bodyParts.push(pNormal("아래 다이어그램은 System Elements와 Interfaces의 관계를 나타냅니다.", false, "555555", 18));
      const diagW = 7315200; // 약 8인치 (EMU)
      const ratio = (archDiagram.svgH || 400) / (archDiagram.svgW || 900);
      const diagH = Math.round(diagW * ratio);
      bodyParts.push(pngToWordDrawing(null, archDiagram.rId, diagW, diagH));
    }

    // SYS.2 다음: 추적성 매트릭스 다이어그램 삽입
    if (id === "SYS.2" && traceDiagram) {
      bodyParts.push(pH2("Requirements Traceability Diagram"));
      bodyParts.push(pNormal("STK-REQ와 SYS-REQ 간의 추적성 관계를 나타냅니다.", false, "555555", 18));
      const diagW = 7315200;
      const ratio2 = (traceDiagram.svgH || 300) / (traceDiagram.svgW || 900);
      const diagH2 = Math.round(diagW * ratio2);
      bodyParts.push(pngToWordDrawing(null, traceDiagram.rId, diagW, diagH2));
    }
  });

  // 추적성 가이드라인 (2개 이상 SYS가 있을 때)
  if (orderedIds.length >= 2) {
    bodyParts.push(pBreak());
    bodyParts.push(xmlTraceability(wps));
  }

  // 부록
  bodyParts.push(pBreak());
  bodyParts.push(xmlGlossary());

  const sectPr = `<w:sectPr>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1260" w:header="720" w:footer="720" w:gutter="0"/>
    <w:pgNumType w:fmt="decimal" w:start="1"/>
  </w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
<w:body>
${bodyParts.join("\n")}
${sectPr}
</w:body>
</w:document>`;
}

// ── DOCX Blob 생성 ────────────────────────────────────────────────────────────
// ── 다이어그램 생성 (SVG → PNG → Word ImageRun) ────────────────────────────

// SVG 문자열을 PNG Base64로 변환 (Canvas API)
async function svgToPngBase64(svgStr, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl.split(',')[1]); // base64만
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── SYS.3 아키텍처 블록 다이어그램 SVG 생성 ─────────────────────────────────
function buildArchDiagramSVG(content) {
  const elements = content.system_elements || [];
  const interfaces = content.interfaces || [];
  if (elements.length === 0) return null;

  const W = 900, PADX = 60, PADY = 60;
  const BOX_W = 160, BOX_H = 70, GAP_X = 200, GAP_Y = 120;

  // 요소 위치 계산 (격자 배치)
  const cols = Math.min(4, elements.length);
  const rows = Math.ceil(elements.length / cols);
  const H = PADY * 2 + rows * BOX_H + (rows - 1) * GAP_Y + 80;

  const posMap = {};
  elements.forEach((el, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const totalW = cols * BOX_W + (cols - 1) * (GAP_X - BOX_W);
    const startX = (W - totalW) / 2;
    posMap[el.id] = {
      x: startX + col * GAP_X,
      y: PADY + 60 + row * (BOX_H + GAP_Y),
      cx: startX + col * GAP_X + BOX_W / 2,
      cy: PADY + 60 + row * (BOX_H + GAP_Y) + BOX_H / 2,
    };
  });

  // 색상 팔레트
  const COLORS = ['#3B5BDB','#1098AD','#2F9E44','#E67700','#9C36B5','#C92A2A'];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="font-family:Arial,sans-serif;">`;

  // 배경
  svg += `<rect width="${W}" height="${H}" fill="#F8FAFC" rx="12"/>`;

  // 제목
  svg += `<text x="${W/2}" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#1E3A6E">System Architecture Diagram</text>`;
  svg += `<line x1="60" y1="48" x2="${W-60}" y2="48" stroke="#1E3A6E" stroke-width="1.5" opacity="0.3"/>`;

  // 인터페이스 연결선 (먼저 그림 — 박스 아래에 위치)
  interfaces.forEach((iface, idx) => {
    const srcPos = posMap[iface.source];
    const tgtPos = posMap[iface.target];
    if (!srcPos || !tgtPos) return;

    const x1 = srcPos.cx, y1 = srcPos.cy;
    const x2 = tgtPos.cx, y2 = tgtPos.cy;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    // 곡선 화살표
    const ctrl1x = x1 + (x2 - x1) * 0.3;
    const ctrl1y = y1 - 30;
    const ctrl2x = x1 + (x2 - x1) * 0.7;
    const ctrl2y = y2 - 30;

    svg += `<defs><marker id="arrow${idx}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#6C757D" opacity="0.7"/>
    </marker></defs>`;

    svg += `<path d="M${x1},${y1} C${ctrl1x},${ctrl1y} ${ctrl2x},${ctrl2y} ${x2},${y2}"
      fill="none" stroke="#6C757D" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"
      marker-end="url(#arrow${idx})"/>`;

    // 인터페이스 라벨
    const labelX = (x1 + x2) / 2;
    const labelY = Math.min(y1, y2) - 20;
    svg += `<rect x="${labelX - 30}" y="${labelY - 10}" width="60" height="16" rx="4" fill="#E9ECEF" opacity="0.9"/>`;
    svg += `<text x="${labelX}" y="${labelY + 2}" text-anchor="middle" font-size="9" fill="#495057">${ex(iface.id)}</text>`;
  });

  // 시스템 요소 박스
  elements.forEach((el, i) => {
    const pos = posMap[el.id];
    if (!pos) return;
    const color = COLORS[i % COLORS.length];
    const lightColor = color + '22';

    // 그림자
    svg += `<rect x="${pos.x+3}" y="${pos.cy - BOX_H/2 + 3}" width="${BOX_W}" height="${BOX_H}" rx="10" fill="rgba(0,0,0,0.08)"/>`;
    // 박스
    svg += `<rect x="${pos.x}" y="${pos.cy - BOX_H/2}" width="${BOX_W}" height="${BOX_H}" rx="10" fill="white" stroke="${color}" stroke-width="2"/>`;
    // 상단 색상 바
    svg += `<rect x="${pos.x}" y="${pos.cy - BOX_H/2}" width="${BOX_W}" height="20" rx="10" fill="${color}"/>`;
    svg += `<rect x="${pos.x}" y="${pos.cy - BOX_H/2 + 12}" width="${BOX_W}" height="8" fill="${color}"/>`;

    // ID 텍스트 (상단 색상바 위)
    svg += `<text x="${pos.cx}" y="${pos.cy - BOX_H/2 + 14}" text-anchor="middle" font-size="10" font-weight="700" fill="white">${ex(el.id)}</text>`;

    // 이름 텍스트
    const name = (el.name || '').length > 18 ? el.name.slice(0, 16) + '…' : (el.name || '');
    svg += `<text x="${pos.cx}" y="${pos.cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#1E293B">${ex(name)}</text>`;

    // 타입
    if (el.type) {
      svg += `<text x="${pos.cx}" y="${pos.cy + 20}" text-anchor="middle" font-size="9" fill="#6C757D">${ex(el.type)}</text>`;
    }
  });

  // 범례
  const legY = H - 30;
  svg += `<text x="${PADX}" y="${legY}" font-size="9" fill="#6C757D">■ System Element</text>`;
  svg += `<line x1="${PADX + 120}" y1="${legY - 4}" x2="${PADX + 160}" y2="${legY - 4}" stroke="#6C757D" stroke-width="1.5" stroke-dasharray="4,2"/>`;
  svg += `<polygon points="${PADX + 160},${legY - 7} ${PADX + 167},${legY - 4} ${PADX + 160},${legY - 1}" fill="#6C757D"/>`;
  svg += `<text x="${PADX + 172}" y="${legY}" font-size="9" fill="#6C757D">Interface</text>`;

  svg += `</svg>`;
  return { svg, width: W, height: H };
}

// ── SYS.4/SYS.5 추적성 매트릭스 다이어그램 SVG ──────────────────────────────
function buildTraceDiagramSVG(sys1Content, sys2Content, sys3Content) {
  const stk = (sys1Content?.requirements || []).slice(0, 6);
  const sys = (sys2Content?.requirements || []).slice(0, 6);
  if (stk.length === 0 && sys.length === 0) return null;

  const W = 900, ROW_H = 32, COL_W = 140;
  const LABEL_W = 180;
  const H = 80 + Math.max(stk.length, sys.length) * ROW_H + 60;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="font-family:Arial,sans-serif;">`;
  svg += `<rect width="${W}" height="${H}" fill="#F8FAFC" rx="12"/>`;
  svg += `<text x="${W/2}" y="32" text-anchor="middle" font-size="16" font-weight="700" fill="#1E3A6E">Traceability Matrix: STK-REQ → SYS-REQ</text>`;
  svg += `<line x1="60" y1="44" x2="${W-60}" y2="44" stroke="#1E3A6E" stroke-width="1.5" opacity="0.3"/>`;

  const startY = 60;
  // STK-REQ 열 헤더
  svg += `<rect x="60" y="${startY}" width="${LABEL_W}" height="28" rx="4" fill="#1E3A6E"/>`;
  svg += `<text x="${60 + LABEL_W/2}" y="${startY + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="white">STK-REQ</text>`;
  // SYS-REQ 열 헤더
  svg += `<rect x="${60 + LABEL_W + 20}" y="${startY}" width="${LABEL_W}" height="28" rx="4" fill="#2C5F8A"/>`;
  svg += `<text x="${60 + LABEL_W + 20 + LABEL_W/2}" y="${startY + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="white">SYS-REQ</text>`;

  const maxRows = Math.max(stk.length, sys.length);
  // 행
  for (let i = 0; i < maxRows; i++) {
    const ry = startY + 28 + i * ROW_H;
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F0F4F8';
    svg += `<rect x="60" y="${ry}" width="${LABEL_W}" height="${ROW_H}" fill="${bg}" stroke="#E2E8F0" stroke-width="1"/>`;
    svg += `<rect x="${60 + LABEL_W + 20}" y="${ry}" width="${LABEL_W}" height="${ROW_H}" fill="${bg}" stroke="#E2E8F0" stroke-width="1"/>`;

    if (stk[i]) {
      svg += `<text x="${60 + 8}" y="${ry + ROW_H/2 + 4}" font-size="10" fill="#1E3A6E" font-weight="600">${ex(stk[i].id)}</text>`;
    }
    if (sys[i]) {
      svg += `<text x="${60 + LABEL_W + 28}" y="${ry + ROW_H/2 + 4}" font-size="10" fill="#2C5F8A" font-weight="600">${ex(sys[i].id)}</text>`;
    }

    // 화살표 연결
    if (stk[i] && sys[i]) {
      const x1 = 60 + LABEL_W, y1 = ry + ROW_H/2;
      const x2 = 60 + LABEL_W + 20, y2 = ry + ROW_H/2;
      svg += `<defs><marker id="tarrow${i}" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
        <polygon points="0 0, 6 2.5, 0 5" fill="#10B981"/>
      </marker></defs>`;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#10B981" stroke-width="1.5" marker-end="url(#tarrow${i})"/>`;
    }
  }

  svg += `</svg>`;
  return { svg, width: W, height: H };
}

// ── PNG Base64를 Word XML <w:drawing> 태그로 변환 ────────────────────────────
function pngToWordDrawing(base64, rId, widthEMU, heightEMU) {
  // EMU = English Metric Units (914400 = 1 inch)
  return `<w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="200" w:after="200"/></w:pPr>
    <w:r>
      <w:rPr/>
      <w:drawing>
        <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                   distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${widthEMU}" cy="${heightEMU}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="Architecture Diagram"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="1" name="diagram"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${widthEMU}" cy="${heightEMU}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

// ── 이미지 포함 Word 관계 XML ─────────────────────────────────────────────────
function xmlRelsWithImages(imageRIds) {
  const base = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`;
  const imgRels = imageRIds.map((rId, i) =>
    `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram${i+1}.png"/>`
  ).join('\n');
  return base + '\n' + imgRels + '\n</Relationships>';
}

// ── 이미지 포함 ContentTypes ──────────────────────────────────────────────────
function xmlContentTypesWithImages() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

async function createDocxBlob(project, wps) {
  // 다이어그램 이미지 생성
  const sysMap = {};
  wps.forEach(wp => { sysMap[wp.process_id] = wp.content || {}; });

  const diagrams = []; // { rId, base64, name }

  // SYS.3 아키텍처 다이어그램
  if (sysMap["SYS.3"]) {
    const archResult = buildArchDiagramSVG(sysMap["SYS.3"]);
    if (archResult) {
      try {
        const png = await svgToPngBase64(archResult.svg, archResult.width, archResult.height);
        diagrams.push({ rId: "rId10", base64: png, name: "diagram1.png", type: "arch", svgW: archResult.width, svgH: archResult.height });
      } catch(e) { console.warn("아키텍처 다이어그램 생성 실패:", e); }
    }
  }

  // 추적성 다이어그램 (SYS.1 + SYS.2 모두 있을 때)
  if (sysMap["SYS.1"] && sysMap["SYS.2"]) {
    const traceResult = buildTraceDiagramSVG(sysMap["SYS.1"], sysMap["SYS.2"], sysMap["SYS.3"]);
    if (traceResult) {
      try {
        const png = await svgToPngBase64(traceResult.svg, traceResult.width, traceResult.height);
        diagrams.push({ rId: "rId11", base64: png, name: "diagram2.png", type: "trace", svgW: traceResult.width, svgH: traceResult.height });
      } catch(e) { console.warn("추적성 다이어그램 생성 실패:", e); }
    }
  }

  // 다이어그램 정보를 buildDocumentXml에 전달
  const docXml = buildDocumentXml(project, wps, diagrams);

  // PNG 바이너리 변환 (base64 → Uint8Array)
  function b64ToUint8(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  const files = [
    { name: "[Content_Types].xml", data: xmlContentTypesWithImages() },
    { name: "_rels/.rels", data: xmlAppRels() },
    { name: "word/document.xml", data: docXml },
    { name: "word/styles.xml", data: xmlStyles() },
    { name: "word/numbering.xml", data: xmlNumbering() },
    { name: "word/_rels/document.xml.rels", data: xmlRelsWithImages(diagrams.map(d => d.rId)) },
    ...diagrams.map(d => ({ name: `word/media/${d.name}`, data: b64ToUint8(d.base64) })),
  ];

  const zipData = makeZip(files);
  return new Blob([zipData], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 공개 다운로드 함수 ────────────────────────────────────────────────────────
// 단계별: 해당 단계까지의 승인된 산출물 누적 포함
async function downloadWordSingle(wpContent, project, proc, allWorkProducts) {
  // 현재 단계 인덱스
  const PROC_ORDER = ["SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5"];
  const currentIdx = PROC_ORDER.indexOf(proc.id);
  // 현재 단계까지의 산출물 (승인 여부 무관, 존재하는 것 모두 포함)
  const wpsUpToCurrent = (allWorkProducts || []).filter(wp => {
    const idx = PROC_ORDER.indexOf(wp.process_id);
    return idx >= 0 && idx <= currentIdx;
  });
  // 최소한 현재 산출물은 포함
  const hasCurrentInAll = wpsUpToCurrent.some(w => w.process_id === proc.id);
  const targetWPs = hasCurrentInAll
    ? wpsUpToCurrent
    : [...wpsUpToCurrent, { process_id: proc.id, content: wpContent, status: "초안" }];
  const blob = await createDocxBlob(project, targetWPs);
  triggerDownload(blob, `${project.name}_${proc.id}_누적.docx`);
}

// 전체: 모든 완성된 산출물 포함
async function downloadWordAll(workProducts, project) {
  const blob = await createDocxBlob(project, workProducts);
  triggerDownload(blob, `${project.name}_ASPICE_전체산출물.docx`);
}

// ── 메인 앱 ───────────────────────────────────────────────────────────────────
export default function AspiceApp() {
  const [page, setPage] = useState("home");
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workProducts, setWorkProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const navItems = [
    { id: "home", label: "프로젝트 목록", icon: "⊞" },
    ...(selectedProject ? [
      { id: "pipeline", label: "파이프라인", icon: "⇒" },
      { id: "review", label: "HITL 검토", icon: "◎" },
      { id: "traceability", label: "추적성 분석", icon: "⇌" },
    ] : []),
  ];

  const nav = useCallback((p, proj = undefined) => {
    setPage(p);
    if (proj !== undefined) setSelectedProject(proj);
    setMenuOpen(false);
  }, []);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (selectedProject) fetchWorkProducts(selectedProject.id); }, [selectedProject]);

  // 글로벌 디자인 개선 CSS 주입
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "aspice-design-override";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
        background: #090b0f !important;
        color: #e2e8f0 !important;
        -webkit-font-smoothing: antialiased;
      }

      /* 사이드바 */
      .sidebar {
        background: linear-gradient(180deg, #0d1117 0%, #111827 100%) !important;
        border-right: 1px solid rgba(255,255,255,0.05) !important;
        box-shadow: 4px 0 32px rgba(0,0,0,0.4) !important;
      }

      /* 카드 */
      .aspice-card {
        background: rgba(17,24,39,0.8) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        border-radius: 14px !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05) !important;
        backdrop-filter: blur(12px) !important;
      }

      /* 버튼 기본 */
      button {
        font-family: 'Inter', sans-serif !important;
        letter-spacing: -0.01em !important;
        transition: all 0.15s ease !important;
      }
      button:hover { filter: brightness(1.1); transform: translateY(-1px); }
      button:active { transform: translateY(0); }

      /* 네비 버튼 */
      .nav-btn {
        border-radius: 8px !important;
        transition: all 0.15s ease !important;
      }
      .nav-btn:hover { background: rgba(99,102,241,0.12) !important; }

      /* 파이프라인 스텝 */
      .pipeline-step {
        background: rgba(17,24,39,0.9) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        border-radius: 14px !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 2px 12px rgba(0,0,0,0.2) !important;
      }
      .pipeline-step:hover { border-color: rgba(99,102,241,0.3) !important; box-shadow: 0 4px 20px rgba(99,102,241,0.1) !important; }

      /* 배지 */
      .aspice-badge {
        font-size: 10px !important;
        font-weight: 600 !important;
        letter-spacing: 0.04em !important;
        border-radius: 6px !important;
        padding: 3px 8px !important;
      }

      /* 입력창 */
      input, textarea, select {
        font-family: 'Inter', sans-serif !important;
        transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
      }
      input:focus, textarea:focus {
        outline: none !important;
        border-color: rgba(99,102,241,0.6) !important;
        box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important;
      }

      /* 스크롤바 */
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

      /* 텍스트 */
      h1, h2, h3 { letter-spacing: -0.02em; }

      /* 모달 배경 */
      .modal-overlay {
        backdrop-filter: blur(8px) !important;
        background: rgba(0,0,0,0.7) !important;
      }

      /* 상태 배지 */
      .status-approved { background: rgba(16,185,129,0.15) !important; color: #10b981 !important; border: 1px solid rgba(16,185,129,0.3) !important; }
      .status-draft { background: rgba(99,102,241,0.15) !important; color: #818cf8 !important; border: 1px solid rgba(99,102,241,0.3) !important; }
      .status-rejected { background: rgba(239,68,68,0.15) !important; color: #f87171 !important; border: 1px solid rgba(239,68,68,0.3) !important; }

      /* QA 점수 카드 */
      .qa-score-card {
        background: linear-gradient(135deg, rgba(17,24,39,0.9), rgba(30,41,59,0.9)) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        border-radius: 12px !important;
      }

      /* 이슈 카드 */
      .issue-card {
        border-radius: 10px !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
        transition: all 0.2s ease !important;
      }
      .issue-card:hover { border-color: rgba(99,102,241,0.2) !important; }

      /* CRITICAL 배지 */
      .severity-critical { background: rgba(239,68,68,0.2) !important; color: #fca5a5 !important; border: 1px solid rgba(239,68,68,0.4) !important; }
      .severity-major { background: rgba(245,158,11,0.2) !important; color: #fcd34d !important; border: 1px solid rgba(245,158,11,0.4) !important; }
      .severity-minor { background: rgba(99,102,241,0.2) !important; color: #a5b4fc !important; border: 1px solid rgba(99,102,241,0.3) !important; }
      .severity-info { background: rgba(20,184,166,0.15) !important; color: #5eead4 !important; border: 1px solid rgba(20,184,166,0.3) !important; }

      /* 프로젝트 카드 hover */
      .project-card {
        transition: all 0.2s ease !important;
        border-radius: 14px !important;
      }
      .project-card:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 32px rgba(99,102,241,0.15) !important;
        border-color: rgba(99,102,241,0.3) !important;
      }

      /* 로고 */
      .aspice-logo { letter-spacing: -0.03em !important; }

      /* 파이프라인 연결선 */
      .pipeline-arrow {
        opacity: 0.5 !important;
        font-size: 18px !important;
      }

      /* 버튼 스타일 강화 */
      .btn-primary {
        background: linear-gradient(135deg, #4f46e5, #6366f1) !important;
        box-shadow: 0 2px 12px rgba(99,102,241,0.35) !important;
        border: 1px solid rgba(99,102,241,0.5) !important;
      }
      .btn-success {
        background: linear-gradient(135deg, #059669, #10b981) !important;
        box-shadow: 0 2px 12px rgba(16,185,129,0.3) !important;
      }
      .btn-danger {
        background: linear-gradient(135deg, #dc2626, #ef4444) !important;
        box-shadow: 0 2px 12px rgba(239,68,68,0.25) !important;
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById("aspice-design-override"); if (el) el.remove(); };
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const data = await apiCall("/api/projects?resource=projects");
      setProjects(Array.isArray(data) ? data : []);
    } catch { setProjects([]); }
    setLoading(false);
  }

  async function fetchWorkProducts(projectId) {
    try {
      const data = await apiCall(`/api/projects?resource=work_products&project_id=${projectId}`);
      setWorkProducts(Array.isArray(data) ? data.map(d => ({
        ...d,
        content: typeof d.content === "string" ? safeParseJSON(d.content) : d.content || {},
        qa_result: d.qa_result ? (typeof d.qa_result === "string" ? safeParseJSON(d.qa_result) : d.qa_result) : null,
      })) : []);
    } catch { setWorkProducts([]); }
  }

  const onRefreshWPs = () => selectedProject && fetchWorkProducts(selectedProject.id);

  const pages = {
    home: <ProjectListPage projects={projects} loading={loading} onSelect={(proj) => { setSelectedProject(proj); setWorkProducts([]); nav("pipeline"); }} onRefresh={fetchProjects} />,
    pipeline: selectedProject ? <PipelinePage project={selectedProject} workProducts={workProducts} onRefresh={onRefreshWPs} nav={nav} /> : null,
    review: selectedProject ? <ReviewPage project={selectedProject} wps={workProducts} onUpdate={onRefreshWPs} nav={nav} /> : null,
    traceability: selectedProject ? <TraceabilityPage project={selectedProject} wps={workProducts} /> : null,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "linear-gradient(135deg,#090b0f 0%,#0d1117 60%,#0a0f1a 100%)", color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* 모바일 헤더 */}
      <div className="mob-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(13,17,23,0.9)", borderBottom: `1px solid rgba(255,255,255,0.07)`, position: "sticky", top: 0, zIndex: 100 }}>
        <Logo onClick={() => nav("home", null)} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowGuide(true)} style={{ background: "none", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 8, color: T.muted, fontSize: 12, cursor: "pointer", padding: "4px 10px" }}>?</button>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer" }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="mob-menu" style={{ background: "rgba(13,17,23,0.9)", borderBottom: `1px solid rgba(255,255,255,0.07)`, padding: "8px 12px", zIndex: 99 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => nav(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%", background: page === item.id ? T.accentGlow : "transparent", color: page === item.id ? T.accent : T.muted, border: "none", cursor: "pointer", fontSize: 14, fontWeight: page === item.id ? 600 : 400, marginBottom: 4, fontFamily: "inherit" }}>
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        {/* PC 사이드바 */}
        <aside className="sidebar" style={{ display: "none", width: 230, background: "rgba(13,17,23,0.9)", borderRight: `1px solid rgba(255,255,255,0.07)`, flexDirection: "column", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "0 20px 20px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
            <Logo onClick={() => nav("home", null)} />
          </div>
          {selectedProject && (
            <div style={{ padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.07)`, background: "rgba(99,102,241,0.08)", borderLeft: "2px solid rgba(99,102,241,0.5)" }}>
              <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginBottom: 3 }}>현재 프로젝트</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProject.name}</div>
            </div>
          )}
          <nav style={{ padding: "14px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => nav(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: page === item.id ? "rgba(99,102,241,0.15)" : "transparent", color: page === item.id ? "#818cf8" : "rgba(148,163,184,0.7)", border: page === item.id ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent", boxShadow: page === item.id ? "0 0 12px rgba(99,102,241,0.15)" : "none", cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 600 : 400, fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all .15s" }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: "14px 20px", borderTop: `1px solid rgba(255,255,255,0.07)` }}>
            <button onClick={() => setShowGuide(true)} style={{ width: "100%", padding: "8px 12px", background: "rgba(17,24,39,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(148,163,184,0.7)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
              📖 사용 가이드
            </button>
          </div>
        </aside>

        <main className="main-pad" style={{ flex: 1, overflow: "auto", padding: "20px 16px", animation: "fadeIn .3s ease" }}>
          {pages[page] || pages.home}
        </main>
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function Logo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div style={{
        width: 32, height: 32,
        background: "linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)",
        borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 800, color: "#fff",
        boxShadow: "0 2px 12px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
      }}>A</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.02em", lineHeight: 1.2 }}>ASPICE AI</div>
        <div style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", letterSpacing: "0.06em", marginTop: 1 }}>v2.0 · SYS.1~SYS.5 Pipeline</div>
      </div>
    </div>
  );
}

// ── 사용 가이드 모달 ─────────────────────────────────────────────────────────
function GuideModal({ onClose }) {
  const steps = [
    { icon: "①", color: T.accent, title: "프로젝트 생성", desc: "홈에서 [+ 새 프로젝트]를 클릭해 프로젝트명·도메인·설명을 입력합니다." },
    { icon: "②", color: T.purple, title: "SYS.1 생성 (파이프라인 시작)", desc: "파이프라인 탭에서 SYS.1 카드의 [생성] 버튼을 누릅니다. 프로젝트 배경과 이해관계자 니즈를 입력하면 AI가 자동 생성합니다." },
    { icon: "③", color: T.teal, title: "SYS.2~5 순차 생성 (IN→OUT→IN→OUT)", desc: "이전 단계 산출물이 자동으로 다음 단계에 주입됩니다. 각 단계에서 [생성] 버튼만 누르면 됩니다." },
    { icon: "④", color: T.amber, title: "QA 검증 & 승인 (Gemini)", desc: "HITL 검토 탭에서 산출물 선택 → [QA 검증 실행]으로 Gemini AI가 품질을 점검합니다. 검토 후 [승인] 또는 [거부]를 결정합니다." },
    { icon: "⑤", color: T.green, title: "다운로드", desc: "각 산출물의 [⬇ MD] 또는 [JSON] 버튼으로 개별 저장, 상단 [⬇ 전체 다운로드]로 모든 산출물을 한 번에 내보낼 수 있습니다." },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "rgba(13,17,23,0.9)", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 18, padding: 32, maxWidth: 580, width: "100%", maxHeight: "90vh", overflowY: "auto", animation: "fadeIn .25s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📖 사용 가이드</h2>
            <p style={{ fontSize: 12, color: T.muted }}>ASPICE AI Platform — 5단계로 완성하는 ASPICE 산출물</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: "rgba(17,24,39,0.6)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + "20", border: `1px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: s.color, fontWeight: 800, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: s.color }}>{s.title}</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 16px", background: T.accentGlow, border: `1px solid ${T.accentDim}`, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 6 }}>💡 파이프라인 핵심 원리</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
            <span style={{ color: T.accent }}>SYS.1 OUT</span> → <span style={{ color: T.purple }}>SYS.2 IN</span> → <span style={{ color: T.purple }}>SYS.2 OUT</span> → <span style={{ color: T.teal }}>SYS.3 IN</span> → <span style={{ color: T.teal }}>SYS.3 OUT</span> → <span style={{ color: T.amber }}>SYS.4 IN</span><br />
            각 단계 산출물이 자동으로 다음 단계의 입력이 됩니다.
          </div>
        </div>
        <Btn onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>시작하기 →</Btn>
      </div>
    </div>
  );
}

// ── 프로젝트 목록 페이지 ─────────────────────────────────────────────────────
function ProjectListPage({ projects, loading, onSelect, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "자동차 부품", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!form.name.trim()) { setError("프로젝트명을 입력하세요."); return; }
    setSaving(true); setError("");
    try {
      await apiCall("/api/projects?resource=projects", "POST", { ...form, status: "active" });
      await onRefresh();
      setCreating(false);
      setForm({ name: "", domain: "자동차 부품", description: "" });
    } catch (e) { setError("생성 실패: " + e.message); }
    setSaving(false);
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm("프로젝트와 모든 산출물을 삭제합니다. 계속할까요?")) return;
    await apiCall(`/api/projects?resource=projects&id=${id}`, "DELETE");
    await onRefresh();
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.02em" }}>ASPICE 프로젝트</h1>
          <p style={{ color: T.muted, fontSize: 13 }}>프로젝트를 생성하고 SYS.1~SYS.5 산출물을 파이프라인으로 자동 생성합니다.</p>
        </div>
        <Btn onClick={() => setCreating(true)}>+ 새 프로젝트</Btn>
      </div>

      {creating && (
        <Card style={{ padding: 24, marginBottom: 24, border: `1px solid ${T.accent}` }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: T.accent }}>새 프로젝트 생성</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="프로젝트명" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="예: 헤드램프 제어 시스템 개발" required />
            <Select label="도메인" value={form.domain} onChange={v => setForm(f => ({ ...f, domain: v }))} options={DOMAIN_OPTIONS} />
            <Textarea label="프로젝트 설명 (선택)" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="프로젝트의 목적과 범위를 설명하세요." rows={3} />
            {error && <div style={{ color: T.red, fontSize: 12, padding: "8px 12px", background: T.redDim, borderRadius: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setCreating(false); setError(""); }}>취소</Btn>
              <Btn onClick={handleCreate} disabled={saving}>{saving ? "생성 중…" : "프로젝트 생성"}</Btn>
            </div>
          </div>
        </Card>
      )}

      {loading ? <Spinner text="프로젝트 불러오는 중…" /> :
        projects.length === 0 ? (
          <EmptyState icon="◈" title="프로젝트가 없습니다" desc="ASPICE 산출물을 관리할 프로젝트를 먼저 생성하세요."
            action={<Btn onClick={() => setCreating(true)}>첫 프로젝트 만들기</Btn>} />
        ) : (
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            {projects.map(proj => (
              <ProjectCard key={proj.id} project={proj} onClick={() => onSelect(proj)} onDelete={(e) => handleDelete(proj.id, e)} />
            ))}
          </div>
        )}
    </div>
  );
}

function ProjectCard({ project, onClick, onDelete }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: "20px 22px",
        background: hov
          ? "linear-gradient(135deg,rgba(17,24,39,0.95),rgba(30,41,59,0.9))"
          : "linear-gradient(135deg,rgba(13,17,23,0.9),rgba(17,24,39,0.85))",
        border: `1px solid ${hov ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 14, cursor: "pointer", position: "relative",
        transition: "all 0.2s ease",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 8px 32px rgba(99,102,241,0.12)" : "0 2px 8px rgba(0,0,0,0.2)"
      }}>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(project.id); }}
          style={{ position: "absolute", top: 12, right: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, width: 24, height: 24, color: "rgba(248,113,113,0.7)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>✕</button>
      )}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 4, letterSpacing: "-0.01em" }}>{project.name}</div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", lineHeight: 1.5 }}>{project.description}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", background: "rgba(99,102,241,0.15)", color: "#818cf8", borderRadius: 5, border: "1px solid rgba(99,102,241,0.25)", letterSpacing: "0.03em" }}>{project.domain}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)" }}>{project.created_at ? new Date(project.created_at).toLocaleDateString("ko-KR") : ""}</span>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: 11, color: hov ? "#818cf8" : "rgba(99,102,241,0.6)", fontWeight: 600, transition: "color 0.2s" }}>파이프라인 열기 →</span>
      </div>
    </div>
  );
}


function PipelinePage({ project, workProducts, onRefresh, nav }) {
  const [activeProcess, setActiveProcess] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [viewingWP, setViewingWP] = useState(null);
  const [error, setError] = useState("");
  const [contextInputs, setContextInputs] = useState({});

  const wpByProcess = {};
  PROCESSES.forEach(p => { wpByProcess[p.id] = workProducts.filter(w => w.process_id === p.id); });

  function buildPrevContents(processId) {
    const prevContents = {};
    const idx = PROCESSES.findIndex(p => p.id === processId);
    for (let i = 0; i < idx; i++) {
      const prevId = PROCESSES[i].id;
      const prevWPs = wpByProcess[prevId];
      if (prevWPs?.length) prevContents[prevId] = prevWPs[prevWPs.length - 1].content;
    }
    return prevContents;
  }

  async function handleGenerate(processId) {
    setGeneratingId(processId); setError("");
    try {
      const proc = PROCESSES.find(p => p.id === processId);
      const result = await generateWorkProduct(processId, contextInputs[processId] || "", project, buildPrevContents(processId));
      await apiCall("/api/projects?resource=work_products", "POST", {
        project_id: project.id,
        process_id: processId,
        title: result.title || proc.label,
        domain: project.domain,
        content: JSON.stringify(result),
        status: "초안",
        created_at: new Date().toISOString(),
      });
      await onRefresh();
      setActiveProcess(null);
    } catch (e) { setError(`[${processId}] 생성 실패: ${e.message}`); }
    setGeneratingId(null);
  }

  async function handleDelete(wpId) {
    if (!confirm("이 산출물을 삭제합니까?")) return;
    await apiCall(`/api/projects?resource=work_products&id=${wpId}`, "DELETE");
    await onRefresh();
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button onClick={() => nav("home")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>←</button>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</h1>
          </div>
          <p style={{ color: T.muted, fontSize: 12, paddingLeft: 28 }}>{project.domain} · SYS.1~SYS.5 파이프라인</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {workProducts.length > 0 && (
            <>
              <Btn variant="outline" size="sm" onClick={async () => { try { await downloadWordAll(workProducts, project); } catch(e) { alert("다운로드 실패: " + (e.message || e.toString())); } }}>⬇ Word 전체 다운로드</Btn>

            </>
          )}
        </div>
      </div>

      {/* 파이프라인 흐름 표시 */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, overflowX: "auto", paddingBottom: 8 }}>
        {PROCESSES.map((proc, idx) => {
          const done = wpByProcess[proc.id]?.length > 0;
          return (
            <div key={proc.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <div style={{ textAlign: "center", width: 72 }}>
                {(() => {
                  const procWPs = wpByProcess[proc.id] || [];
                  const isApproved = procWPs.some(w => w.status === "승인됨");
                  const hasDraft = procWPs.length > 0;
                  const bg = isApproved ? proc.color : hasDraft ? "transparent" : "rgba(13,17,23,0.9)";
                  const border = isApproved ? proc.color : hasDraft ? proc.color : "rgba(255,255,255,0.15)";
                  const iconColor = isApproved ? "#fff" : hasDraft ? proc.color : T.muted;
                  const icon = isApproved ? "✓" : hasDraft ? "⏳" : proc.icon;
                  return (
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: bg,
                      border: `2px solid ${border}`, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 16, fontWeight: 700,
                      color: iconColor, margin: "0 auto 6px" }}>
                      {icon}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 10, color: done ? proc.color : T.muted, fontWeight: done ? 700 : 400 }}>{proc.id}</div>
              </div>
              {idx < PROCESSES.length - 1 && (
                <div style={{ width: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", height: 2, background: wpByProcess[proc.id]?.length > 0 ? proc.color : "rgba(255,255,255,0.15)" }} />
                  <div style={{ fontSize: 9, color: T.muted }}>OUT→IN</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: T.red, fontSize: 12, padding: "10px 14px", background: T.redDim, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PROCESSES.map((proc, idx) => {
          const wps = wpByProcess[proc.id];
          // 이전 단계가 존재하고 승인됨 상태여야 다음 단계 생성 가능
          const prevId = idx > 0 ? PROCESSES[idx - 1].id : null;
          const prevWPs = prevId ? (wpByProcess[prevId] || []) : [];
          const prevApproved = idx === 0 || prevWPs.some(w => w.status === "승인됨");
          const hasPrev = idx === 0 || (prevWPs.length > 0 && prevApproved);
          const isActive = activeProcess === proc.id;
          const isGenerating = generatingId === proc.id;

          return (
            <Card key={proc.id} className="pipeline-step" style={{ padding: 0, overflow: "hidden", border: `1px solid ${wps?.length ? proc.color + "44" : "rgba(255,255,255,0.08)"}` }}>
              <div style={{ padding: "16px 20px", background: wps?.length ? proc.color + "0D" : "transparent", borderBottom: `1px solid rgba(255,255,255,0.07)`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: proc.color + "20", border: `1px solid ${proc.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: proc.color, flexShrink: 0 }}>{proc.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: proc.color }}>{proc.label}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{proc.desc}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {wps?.length > 0 && <Badge color={proc.color}>{wps.length}개</Badge>}
                  {!hasPrev && idx > 0 && <Badge color={T.muted}>이전 단계 필요</Badge>}
                </div>
              </div>

              {wps?.length > 0 && (
                <div style={{ padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
                  {wps.map(wp => (
                    <div key={wp.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(17,24,39,0.5)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wp.content?.title || proc.label}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{proc.outputSummary(wp.content)}</div>
                      </div>
                      <StatusBadge status={wp.status} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" variant="ghost" onClick={() => setViewingWP({ wp, proc })}>보기</Btn>
                        <Btn size="sm" variant="outline" onClick={async () => { try { await downloadWordSingle(wp.content, project, proc, workProducts); } catch(e) { alert("다운로드 실패: " + (e.message || e.toString())); } }}>⬇ Word</Btn>
          
                        <Btn size="sm" variant="ghost" style={{ color: T.red }} onClick={() => handleDelete(wp.id)}>✕</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ padding: "14px 20px" }}>
                {isActive ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {idx > 0 && (
                      <div style={{ padding: "8px 12px", background: proc.color + "10", border: `1px solid ${proc.color}30`, borderRadius: 8, fontSize: 11, color: T.muted }}>
                        ⟳ <strong style={{ color: proc.color }}>이전 단계 산출물 자동 주입됨</strong> — 추가 맥락만 입력하세요.
                      </div>
                    )}
                    <Textarea label={proc.inputLabel} value={contextInputs[proc.id] || ""} onChange={v => setContextInputs(c => ({ ...c, [proc.id]: v }))} placeholder={proc.inputPlaceholder} rows={4} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" onClick={() => setActiveProcess(null)}>취소</Btn>
                      <Btn onClick={() => handleGenerate(proc.id)} disabled={isGenerating || !hasPrev}>
                        {isGenerating ? "생성 중…" : `⚡ ${proc.id} AI 생성`}
                      </Btn>
                    </div>
                    {isGenerating && <Spinner text={`${proc.id} 산출물 AI 생성 중…`} />}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Btn size="sm" onClick={() => setActiveProcess(proc.id)}
                      disabled={!hasPrev || generatingId !== null}
                      style={{ background: hasPrev ? proc.color : T.muted, borderColor: hasPrev ? proc.color : T.muted }}>
                      {wps?.length ? `↺ 재생성` : `⚡ ${proc.id} 생성`}
                    </Btn>
                    {/* 생성은 됐지만 미승인인 경우 → HITL 검토 유도 */}
                    {wps?.length > 0 && !wps.some(w => w.status === "승인됨") && (
                      <Btn size="sm" variant="outline" onClick={() => nav("review")}
                        style={{ borderColor: T.amber, color: T.amber }}>
                        ◎ Gemini QA 검토하기 →
                      </Btn>
                    )}
                    {/* 승인 완료 표시 */}
                    {wps?.some(w => w.status === "승인됨") && (
                      <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>✓ 승인됨</span>
                    )}
                    {!hasPrev && idx > 0 && (
                      <span style={{ fontSize: 11, color: T.amber, alignSelf: "center", fontWeight: 600 }}>
                        ← {prevWPs.length === 0 ? `${PROCESSES[idx-1].id}를 먼저 생성하세요` : `${PROCESSES[idx-1].id} 승인 후 진행 가능합니다`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {viewingWP && <WPDetailModal wpData={viewingWP} project={project} allWorkProducts={workProducts} onClose={() => setViewingWP(null)} />}
    </div>
  );
}

// ── 산출물 상세 모달 ─────────────────────────────────────────────────────────
function WPDetailModal({ wpData, project, allWorkProducts, onClose }) {
  const { wp, proc } = wpData;
  const [tab, setTab] = useState("content");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "rgba(13,17,23,0.9)", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 18, width: "100%", maxWidth: 780, maxHeight: "92vh", display: "flex", flexDirection: "column", animation: "fadeIn .25s ease" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid rgba(255,255,255,0.07)`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge color={proc.color}>{proc.id}</Badge>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{wp.content?.title || proc.label}</span>
            <StatusBadge status={wp.status} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" variant="outline" onClick={async () => { try { await downloadWordSingle(wp.content, project, proc, allWorkProducts || []); } catch(e) { alert("다운로드 실패: " + (e.message || e.toString())); } }}>⬇ Word</Btn>

            <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, padding: "10px 24px 0", flexShrink: 0, borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
          {[["content", "산출물 내용"], ["raw", "Raw JSON"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "7px 16px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: tab === id ? 700 : 400, background: tab === id ? "rgba(9,11,15,0.8)" : "transparent", color: tab === id ? T.text : T.muted, border: `1px solid ${tab === id ? "rgba(255,255,255,0.1)" : "transparent"}`, borderBottom: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "content" && <WPResultViewer wp={wp.content} process={proc} />}
          {tab === "raw" && (
            <pre style={{ fontSize: 11, color: T.text, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(wp.content, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 산출물 결과 뷰어 ─────────────────────────────────────────────────────────
function WPResultViewer({ wp, process: proc }) {
  if (!wp) return <EmptyState icon="◈" title="내용 없음" desc="산출물 데이터가 없습니다." />;
  const color = proc?.color || T.accent;
  const renderArray = (arr, fields) => {
    if (!arr?.length) return <div style={{ color: T.muted, fontSize: 12, padding: "8px 0" }}>데이터 없음</div>;
    return arr.map((item, i) => (
      <div key={i} style={{ padding: "12px 14px", background: "rgba(17,24,39,0.5)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
        {fields.map(f => item[f] !== undefined && (
          <div key={f} style={{ marginBottom: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", minWidth: 80, flexShrink: 0, paddingTop: 1 }}>{f}:</span>
            <span style={{ fontSize: 12, color: T.text, lineHeight: 1.6, flex: 1 }}>{Array.isArray(item[f]) ? item[f].join(", ") : typeof item[f] === "object" ? JSON.stringify(item[f]) : String(item[f])}</span>
          </div>
        ))}
      </div>
    ));
  };
  const sections = {
    "SYS.1": [{ key: "needs", label: "Needs", fields: ["id", "description", "source"] }, { key: "requirements", label: "Stakeholder Requirements", fields: ["id", "title", "description", "priority", "acceptance_criteria", "stability"] }, { key: "traceability", label: "추적성", fields: ["need_id", "req_id", "relation"] }],
    "SYS.2": [{ key: "requirements", label: "System Requirements", fields: ["id", "title", "type", "description", "source_stk_req", "priority"] }, { key: "verification_criteria", label: "Verification Criteria", fields: ["id", "req_id", "method", "acceptance_criteria"] }, { key: "traceability", label: "추적성", fields: ["from", "to", "type"] }],
    "SYS.3": [{ key: "system_elements", label: "System Elements", fields: ["id", "name", "type", "description", "allocated_requirements"] }, { key: "interfaces", label: "Interfaces", fields: ["id", "name", "source", "target", "type", "protocol"] }, { key: "allocation_matrix", label: "Allocation Matrix", fields: ["req_id", "element_id", "rationale"] }],
    "SYS.4": [{ key: "test_cases", label: "Integration Test Cases", fields: ["id", "title", "objective", "primary_target", "integrated_elements", "pass_criteria"] }],
    "SYS.5": [{ key: "test_cases", label: "Qualification Test Cases", fields: ["id", "title", "objective", "system_requirements", "test_type", "pass_criteria"] }],
  };
  const processId = wp.process || proc?.id;
  return (
    <div>
      <div style={{ padding: "14px 16px", background: color + "10", border: `1px solid ${color}30`, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <Badge color={color}>{processId}</Badge>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{wp.title}</span>
        </div>
        {wp.summary && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(wp.summary).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: T.muted }}><span style={{ color, fontWeight: 700 }}>{v}</span> {k.replace(/_/g, " ")}</div>
            ))}
          </div>
        )}
      </div>
      {(sections[processId] || []).map(s => (
        <div key={s.key} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 3, height: 14, background: color, borderRadius: 2, display: "inline-block" }} />{s.label}
          </h3>
          {renderArray(wp[s.key], s.fields)}
        </div>
      ))}
    </div>
  );
}

// ── QA 결과 뷰어 ─────────────────────────────────────────────────────────────
function QAResultView({ qa, onFixRequest }) {
  // 이슈별 체크 상태 & 지시사항 — qa가 바뀔 때마다 초기화
  const [issueStates, setIssueStates] = useState({});

  // qa.issues 변경 시 상태 초기화
  const issueKey = JSON.stringify((qa.issues || []).map(i => i.id || i.description));
  useEffect(() => {
    setIssueStates(
      (qa.issues || []).reduce((acc, issue, i) => {
        acc[i] = { checked: false, skip: false, instruction: "" };
        return acc;
      }, {})
    );
  }, [issueKey]);

  const checkedCount = Object.values(issueStates).filter(s => s.checked && !s.skip).length;

  function toggleCheck(i) {
    setIssueStates(prev => ({ ...prev, [i]: { ...prev[i], checked: !prev[i].checked } }));
  }
  function toggleSkip(i) {
    setIssueStates(prev => ({ ...prev, [i]: { ...prev[i], skip: !prev[i].skip, checked: false } }));
  }
  function setInstruction(i, val) {
    setIssueStates(prev => ({ ...prev, [i]: { ...prev[i], instruction: val } }));
  }

  function handleFixRequest() {
    const targets = (qa.issues || [])
      .map((issue, i) => ({ issue, ...issueStates[i] }))
      .filter(s => s.checked && !s.skip);
    onFixRequest(targets);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 점수 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
        {[["종합 점수", qa.overall_score, qa.overall_score >= 80 ? T.green : qa.overall_score >= 60 ? T.amber : T.red],
          ["완전성", qa.completeness?.score, T.accent],
          ["일관성", qa.consistency?.score, T.purple],
          ["추적성", qa.traceability?.score, T.teal]
        ].map(([label, val, color]) => (
          <div key={label} style={{ padding: "12px 14px", background: "linear-gradient(135deg, rgba(17,24,39,0.9), rgba(30,41,59,0.8))", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val ?? "—"}</div>
          </div>
        ))}
      </div>

      {/* 이슈 목록 */}
      {qa.issues?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>
            이슈 ({qa.summary?.total_issues}건) — 수정할 항목을 체크하세요
          </div>
          {qa.issues.map((issue, i) => {
            const st = issueStates[i] || {};
            return (
              <div key={i} style={{
                padding: "12px 14px", background: st.skip ? "rgba(17,24,39,0.5)" : st.checked ? "rgba(99,102,241,0.08)" : "rgba(17,24,39,0.7)",
                borderRadius: 10, border: `1px solid ${st.checked ? "rgba(99,102,241,0.4)" : st.skip ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)"}`,
                marginBottom: 10, opacity: st.skip ? 0.5 : 1, transition: "all .2s"
              }}>
                {/* 이슈 헤더 */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  {/* 수정 체크박스 */}
                  <input type="checkbox" checked={!!st.checked} disabled={st.skip}
                    onChange={() => toggleCheck(i)}
                    style={{ marginTop: 2, cursor: "pointer", width: 15, height: 15, accentColor: "#6366f1" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <SeverityBadge severity={issue.severity} />
                      <Badge color={T.muted}>{issue.category}</Badge>
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{issue.description}</div>
                    {issue.recommendation && (
                      <div style={{ fontSize: 11, color: T.teal, marginTop: 4 }}>
                        권장: {issue.recommendation}
                      </div>
                    )}
                  </div>
                  {/* 수정 안 함 토글 */}
                  <button onClick={() => toggleSkip(i)} style={{
                    background: st.skip ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${st.skip ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 6, padding: "3px 8px", fontSize: 10,
                    color: st.skip ? T.amber : T.muted, cursor: "pointer", whiteSpace: "nowrap"
                  }}>
                    {st.skip ? "✕ 수정 안 함" : "수정 안 함"}
                  </button>
                </div>

                {/* 지시사항 입력창 — 체크된 항목만 표시 */}
                {st.checked && !st.skip && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid rgba(255,255,255,0.07)` }}>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                      수정 지시사항 (비워두면 QA 권장사항 기반으로 Claude가 판단)
                    </div>
                    <textarea
                      value={st.instruction}
                      onChange={e => setInstruction(i, e.target.value)}
                      placeholder={`예: "${issue.recommendation || "구체적인 수정 내용을 입력하세요"}"`}
                      style={{
                        width: "100%", minHeight: 60, padding: "8px 10px",
                        background: "rgba(9,11,15,0.8)", border: "1px solid rgba(99,102,241,0.4)",
                        borderRadius: 8, color: "#e2e8f0", fontSize: 12, resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box"
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* 일괄 자동수정 버튼 */}
          {checkedCount > 0 && (
            <div style={{ marginTop: 4 }}>
              <Btn onClick={handleFixRequest} style={{ background: T.purple, borderColor: T.purple }}>
                ✦ 선택 항목 Claude 자동 수정 ({checkedCount}건)
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* Gemini 권장 */}
      <div style={{ padding: "10px 14px", background: "rgba(17,24,39,0.6)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 11, color: T.muted, marginRight: 8 }}>Gemini 권장:</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: qa.recommendation?.includes("승인") ? T.green : T.amber }}>
          {qa.recommendation}
        </span>
      </div>
    </div>
  );
}

// ── 항목 Claude 수정 요청 모달 ──────────────────────────────────────────────────
function ItemClaudeFixModal({ item, fieldLabel, onApply, onClose }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  async function handleRequest() {
    if (!instruction.trim()) return;
    setLoading(true); setError(""); setPreview(null);
    try {
      const prompt = `당신은 ASPICE 4.0 전문가입니다. 반드시 한국어로 작성하세요.
아래 항목에서 사용자의 지시사항대로 수정하세요.
수정하지 말라고 하지 않은 필드는 그대로 유지하세요.
반드시 동일한 JSON 구조로 반환하세요. 마크다운 없이 JSON만 출력하세요.

현재 항목:
${JSON.stringify(item, null, 2)}

사용자 수정 지시사항:
${instruction}`;

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수정 실패");

      const cleaned = data.text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
      const fixed = JSON.parse(cleaned.slice(s, e + 1));
      setPreview(fixed);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "linear-gradient(135deg, #111827, #1a2235)", borderRadius: 16, padding: 24, width: "min(600px,95vw)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "85vh", overflowY: "auto", border: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>✦ Claude에게 수정 요청</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* 현재 항목 요약 */}
        <div style={{ padding: "10px 12px", background: "rgba(9,11,15,0.8)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 14, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: T.accent, marginBottom: 4 }}>{item.id || fieldLabel}</div>
          {item.title && <div style={{ marginBottom: 2 }}>{item.title}</div>}
          {item.description && <div style={{ color: T.muted, fontSize: 11 }}>{String(item.description).slice(0, 120)}...</div>}
        </div>

        {/* 지시사항 입력 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>수정 지시사항을 입력하세요</div>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="예: description에 온도 범위 -40°C~85°C 조건을 추가해주세요"
            style={{ width: "100%", minHeight: 80, padding: "10px 12px", background: "rgba(9,11,15,0.8)",
              border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8, color: "#e2e8f0", fontSize: 13,
              resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        {error && <div style={{ color: T.red, fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {!preview && (
          <Btn onClick={handleRequest} disabled={loading || !instruction.trim()}>
            {loading ? "⏳ Claude 수정 중…" : "✦ 수정 요청"}
          </Btn>
        )}

        {/* 미리보기 */}
        {preview && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 10 }}>✓ 수정 결과 미리보기</div>
            {Object.entries(preview).map(([k, v]) => {
              const origV = item[k];
              const changed = JSON.stringify(v) !== JSON.stringify(origV);
              return (
                <div key={k} style={{ marginBottom: 8, padding: "8px 10px", background: changed ? "rgba(16,185,129,0.1)" : "rgba(9,11,15,0.7)", borderRadius: 6, border: `1px solid ${changed ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.06)"}` }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{k} {changed && <span style={{ color: T.green }}>● 수정됨</span>}</div>
                  {changed && <div style={{ fontSize: 11, color: T.red + "cc", textDecoration: "line-through", marginBottom: 2 }}>{String(origV ?? "")}</div>}
                  <div style={{ fontSize: 12 }}>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Btn onClick={() => onApply(preview)} style={{ background: T.green, borderColor: T.green }}>✓ 적용</Btn>
              <Btn variant="outline" onClick={() => setPreview(null)}>다시 수정</Btn>
              <Btn variant="outline" onClick={onClose}>취소</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 항목 직접 편집 모달 ───────────────────────────────────────────────────────
function ItemEditModal({ item, onSave, onClose }) {
  const [fields, setFields] = useState(() =>
    Object.entries(item).reduce((acc, [k, v]) => {
      if (typeof v !== "object" || v === null) acc[k] = String(v ?? "");
      else acc[k] = JSON.stringify(v, null, 2);
      return acc;
    }, {})
  );

  function setField(k, v) { setFields(prev => ({ ...prev, [k]: v })); }

  function handleSave() {
    const parsed = Object.entries(fields).reduce((acc, [k, v]) => {
      try { acc[k] = JSON.parse(v); } catch { acc[k] = v; }
      return acc;
    }, {});
    onSave(parsed);
  }

  const skipKeys = ["id"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "linear-gradient(135deg, #111827, #1a2235)", borderRadius: 16, padding: 24, width: "min(600px,95vw)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "85vh", overflowY: "auto", border: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>항목 직접 편집</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(fields).filter(([k]) => !skipKeys.includes(k)).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: "uppercase" }}>{k}</div>
              <textarea value={v} onChange={e => setField(k, e.target.value)}
                style={{ width: "100%", minHeight: v.length > 100 ? 100 : 44, padding: "8px 10px",
                  background: "rgba(9,11,15,0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                  color: "#e2e8f0", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Btn onClick={handleSave}>💾 저장</Btn>
          <Btn variant="outline" onClick={onClose}>취소</Btn>
        </div>
      </div>
    </div>
  );
}

// ── 수정 미리보기 모달 ────────────────────────────────────────────────────────
function FixPreviewModal({ original, fixed, onApply, onEditItem, onClose }) {
  const proc = original.process_id;

  // 수정된 항목 찾기
  function findChangedItems() {
    const changes = [];
    const origContent = original.content || {};
    const fixedContent = fixed || {};

    // 모든 배열 필드 비교
    const arrayFields = ["requirements", "needs", "system_elements", "interfaces",
      "test_cases", "verification_criteria", "allocation_matrix"];

    for (const field of arrayFields) {
      const origArr = origContent[field] || [];
      const fixedArr = fixedContent[field] || [];
      fixedArr.forEach((item, i) => {
        const origItem = origArr.find(o => o.id === item.id) || origArr[i];
        if (JSON.stringify(item) !== JSON.stringify(origItem)) {
          changes.push({ field, index: i, original: origItem, fixed: item });
        }
      });
    }
    return changes;
  }

  const changes = findChangedItems();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9998, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "linear-gradient(135deg, #111827, #1a2235)", borderRadius: 16, padding: 24, width: "min(700px,95vw)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "88vh", overflowY: "auto", border: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>✦ Claude 수정 결과 미리보기</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {changes.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 13, padding: 20, textAlign: "center" }}>수정된 항목이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>
              총 {changes.length}개 항목이 수정되었습니다. 확인 후 적용하세요.
            </div>
            {changes.map((ch, i) => (
              <div key={i} style={{ background: "rgba(9,11,15,0.7)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)", padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>
                    [{ch.field}] {ch.fixed?.id || `항목 ${ch.index + 1}`}
                  </div>
                  <Btn size="sm" variant="outline" onClick={() => onEditItem(ch.field, ch.index, ch.fixed)}>
                    ✏️ 직접 수정
                  </Btn>
                </div>
                {Object.entries(ch.fixed || {}).map(([k, v]) => {
                  const origV = ch.original?.[k];
                  const changed = JSON.stringify(v) !== JSON.stringify(origV);
                  if (!changed || k === "id") return null;
                  return (
                    <div key={k} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 11, color: T.red + "cc", textDecoration: "line-through", marginBottom: 2 }}>
                        {String(origV ?? "")}
                      </div>
                      <div style={{ fontSize: 11, color: T.green }}>
                        {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Btn onClick={onApply} style={{ background: T.green, borderColor: T.green }}>✓ 적용</Btn>
          <Btn variant="outline" onClick={onClose}>취소</Btn>
        </div>
      </div>
    </div>
  );
}

// ── HITL 검토 페이지 ─────────────────────────────────────────────────────────
function ReviewPage({ project, wps, onUpdate, nav }) {
  const [selected, setSelected] = useState(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState(null);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  // 자동수정 상태
  const [fixRunning, setFixRunning] = useState(false);
  const [fixPreview, setFixPreview] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [currentContent, setCurrentContent] = useState(null);
  // 개별 항목 수정 상태
  const [claudeFixItem, setClaudeFixItem] = useState(null); // { field, index, item }
  const [directEditItem, setDirectEditItem] = useState(null); // { field, index, item }
  const [showItemList, setShowItemList] = useState(false);

  const pendingWPs = wps.filter(w => ["검토중", "초안"].includes(w.status));

  function selectWP(wp) {
    setSelected(wp);
    setQaResult(wp.qa_result ? (typeof wp.qa_result === "string" ? JSON.parse(wp.qa_result) : wp.qa_result) : null);
    setCurrentContent(wp.content);
    setFixPreview(null);
    setError("");
  }

  async function handleQA() {
    if (!selected) return;
    setQaRunning(true); setError(""); setQaResult(null);
    try {
      const contentToCheck = currentContent || selected.content;
      const r = await runQACheck(contentToCheck);
      setQaResult(r);
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", {
        qa_result: JSON.stringify(r),
        content: contentToCheck
      });
      await onUpdate();
    } catch (e) { setError("QA 실패: " + e.message); }
    setQaRunning(false);
  }

  async function handleStatusUpdate(status) {
    if (!selected) return;
    setUpdating(true);
    try {
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", { status });
      await onUpdate();
      setSelected(prev => ({ ...prev, status }));
      if (status === "승인됨") setTimeout(() => nav("pipeline"), 800);
    } catch (e) { setError("업데이트 실패: " + e.message); }
    setUpdating(false);
  }

  // Claude 자동수정
  async function handleFixRequest(targets) {
    if (!selected || targets.length === 0) return;
    setFixRunning(true); setError("");
    try {
      const content = currentContent || selected.content;
      const proc = selected.process_id;

      // 수정 지시 프롬프트 생성
      const fixInstructions = targets.map((t, i) =>
        `[이슈 ${i + 1}] 심각도: ${t.issue.severity} | 카테고리: ${t.issue.category}
문제: ${t.issue.description}
권장: ${t.issue.recommendation}
${t.instruction ? `사용자 지시사항: ${t.instruction}` : "지시사항 없음 - QA 권장사항 기반으로 수정"}`
      ).join("\n\n");

      const prompt = `당신은 ASPICE 4.0 전문가입니다. 아래 산출물에서 지정된 이슈들만 수정하세요.
반드시 한국어로 작성하세요.
수정하지 않은 항목은 원본 그대로 유지하세요.
반드시 동일한 JSON 구조로 전체 content를 반환하세요. 마크다운 없이 JSON만 출력하세요.

프로세스: ${proc}

현재 산출물 JSON:
${JSON.stringify(content, null, 2)}

수정할 이슈 목록:
${fixInstructions}

중요: 위 이슈들과 관련된 항목만 수정하고, 나머지는 완전히 그대로 유지하세요.
전체 JSON 구조를 그대로 반환하세요.`;

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수정 실패");

      let fixedContent;
      try {
        const cleaned = data.text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
        fixedContent = JSON.parse(cleaned.slice(s, e + 1));
      } catch {
        throw new Error("수정 결과 파싱 실패");
      }

      setFixPreview({ fixedContent });
    } catch (e) { setError("자동수정 실패: " + e.message); }
    setFixRunning(false);
  }

  // 미리보기에서 항목 직접 수정
  function handleEditItem(field, index, item) {
    setEditingItem({ field, index, item });
  }

  function handleItemSave(savedItem) {
    if (!fixPreview) return;
    const newContent = JSON.parse(JSON.stringify(fixPreview.fixedContent));
    if (newContent[editingItem.field]) {
      newContent[editingItem.field][editingItem.index] = savedItem;
    }
    setFixPreview({ fixedContent: newContent });
    setEditingItem(null);
  }

  // 수정 결과 적용
  async function handleApplyFix() {
    if (!fixPreview || !selected) return;
    setUpdating(true);
    try {
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", {
        content: fixPreview.fixedContent
      });
      setCurrentContent(fixPreview.fixedContent);
      setFixPreview(null);
      setQaResult(null);
      await onUpdate();
      setError("");
    } catch (e) { setError("적용 실패: " + e.message); }
    setUpdating(false);
  }

  // 개별 항목 Claude 수정 적용
  async function applyItemFix(field, index, fixedItem) {
    if (!selected) return;
    const newContent = JSON.parse(JSON.stringify(currentContent || selected.content));
    if (newContent[field] && newContent[field][index] !== undefined) {
      newContent[field][index] = fixedItem;
    }
    setCurrentContent(newContent);
    try {
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", { content: newContent });
      await onUpdate();
    } catch (e) { setError("저장 실패: " + e.message); }
    setClaudeFixItem(null);
  }

  // 개별 항목 직접 편집 저장
  async function applyDirectEdit(field, index, editedItem) {
    if (!selected) return;
    const newContent = JSON.parse(JSON.stringify(currentContent || selected.content));
    if (newContent[field] && newContent[field][index] !== undefined) {
      newContent[field][index] = editedItem;
    }
    setCurrentContent(newContent);
    try {
      await apiCall(`/api/projects?resource=work_products&id=${selected.id}`, "PATCH", { content: newContent });
      await onUpdate();
    } catch (e) { setError("저장 실패: " + e.message); }
    setDirectEditItem(null);
  }

  // 현재 content에서 편집 가능한 항목 배열 필드 추출
  function getEditableItems() {
    const c = currentContent || selected?.content || {};
    const ARRAY_FIELDS = {
      needs: "Needs",
      requirements: "Requirements",
      system_elements: "System Elements",
      interfaces: "Interfaces",
      test_cases: "Test Cases",
      verification_criteria: "Verification Criteria",
      allocation_matrix: "Allocation Matrix",
    };
    const result = [];
    for (const [field, label] of Object.entries(ARRAY_FIELDS)) {
      if (Array.isArray(c[field]) && c[field].length > 0) {
        c[field].forEach((item, index) => {
          result.push({ field, label, index, item });
        });
      }
    }
    return result;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button onClick={() => nav("pipeline")} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>←</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>HITL 검토</h1>
      </div>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 24, paddingLeft: 28 }}>
        {project.name} · AI 산출물 QA 검증 → 수정 → 승인/거부 &nbsp;
        <span style={{ color: T.teal, fontWeight: 700 }}>· QA 엔진: Gemini 2.0 Flash</span>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        {/* 좌측: 검토 대기 목록 */}
        <Card style={{ padding: 20, alignSelf: "start" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>검토 대기 ({pendingWPs.length})</h2>
          {pendingWPs.length === 0 ? (
            <EmptyState icon="◎" title="검토 대기 없음" desc="파이프라인에서 산출물을 생성하세요." action={<Btn onClick={() => nav("pipeline")}>파이프라인으로</Btn>} />
          ) : pendingWPs.map(wp => {
            const proc = PROCESSES.find(p => p.id === wp.process_id);
            return (
              <div key={wp.id} onClick={() => selectWP(wp)}
                style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${selected?.id === wp.id ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.06)"}`, background: selected?.id === wp.id ? "rgba(99,102,241,0.1)" : "rgba(17,24,39,0.5)", cursor: "pointer", transition: "all .2s", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{wp.content?.title || wp.process_id}</span>
                  <StatusBadge status={wp.status} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Badge color={proc?.color || T.accent}>{wp.process_id}</Badge>
                  {wp.qa_result && <Badge color={T.purple}>QA완료</Badge>}
                </div>
              </div>
            );
          })}
        </Card>

        {/* 우측: QA 검증 & 수정 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {selected ? (
            <Card style={{ padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                QA 검증 — {selected.content?.title || selected.process_id}
                {currentContent !== selected.content && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: T.amber, fontWeight: 400 }}>● 수정됨 (미저장)</span>
                )}
              </h2>

              {/* 액션 버튼 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <Btn onClick={handleQA} disabled={qaRunning}>🔍 QA 검증 실행</Btn>
                <Btn variant="success" onClick={() => handleStatusUpdate("승인됨")} disabled={updating}>
                  ✓ 승인 → 다음 단계
                </Btn>
                <Btn variant="danger" onClick={() => handleStatusUpdate("거부됨")} disabled={updating}>✕ 거부</Btn>
              </div>

              {updating && (
                <div style={{ padding: "8px 12px", background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 8, fontSize: 12, color: T.green, marginBottom: 12 }}>
                  ⏳ 처리 중… 승인되면 파이프라인으로 자동 이동합니다.
                </div>
              )}
              {fixRunning && <Spinner text="Claude 자동 수정 중…" />}
              {qaRunning && <Spinner text="Gemini QA 검증 중…" />}
              {error && (
                <div style={{ color: T.red, fontSize: 12, padding: 10, background: T.redDim, borderRadius: 8, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              {qaResult && (
                <QAResultView
                  qa={qaResult}
                  onFixRequest={handleFixRequest}
                />
              )}

              {/* 산출물 항목 직접 수정 섹션 */}
              {selected && (
                <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      📋 산출물 항목 직접 수정
                    </div>
                    <Btn size="sm" variant="outline" onClick={() => setShowItemList(v => !v)}>
                      {showItemList ? "▲ 접기" : "▼ 항목 목록 보기"}
                    </Btn>
                  </div>
                  {showItemList && (() => {
                    const items = getEditableItems();
                    if (items.length === 0) return (
                      <div style={{ color: T.muted, fontSize: 12 }}>편집 가능한 항목이 없습니다.</div>
                    );
                    let lastField = "";
                    return items.map(({ field, label, index, item }) => {
                      const isNewField = field !== lastField;
                      lastField = field;
                      return (
                        <div key={`${field}-${index}`}>
                          {isNewField && (
                            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700,
                              marginTop: 10, marginBottom: 6, textTransform: "uppercase" }}>
                              {label}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 12px", background: "rgba(17,24,39,0.6)", borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.06)", transition: "all 0.15s ease", marginBottom: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>
                                {item.id || `${label} ${index + 1}`}
                              </span>
                              {item.title && (
                                <span style={{ fontSize: 12, color: T.muted, marginLeft: 8 }}>
                                  {String(item.title).slice(0, 40)}{item.title?.length > 40 ? "…" : ""}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <Btn size="sm" onClick={() => setClaudeFixItem({ field, index, item })}
                                style={{ background: T.purple, borderColor: T.purple, fontSize: 11 }}>
                                ✦ Claude
                              </Btn>
                              <Btn size="sm" variant="outline"
                                onClick={() => setDirectEditItem({ field, index, item })}
                                style={{ fontSize: 11 }}>
                                ✏️ 직접
                              </Btn>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </Card>
          ) : (
            <Card style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
              <div style={{ color: T.muted, fontSize: 13 }}>좌측에서 검토할 산출물을 선택하세요</div>
            </Card>
          )}
        </div>
      </div>

      {/* 수정 미리보기 모달 */}
      {fixPreview && (
        <FixPreviewModal
          original={selected}
          fixed={fixPreview.fixedContent}
          onApply={handleApplyFix}
          onEditItem={handleEditItem}
          onClose={() => setFixPreview(null)}
        />
      )}

      {/* 항목 직접 편집 모달 (미리보기에서) */}
      {editingItem && (
        <ItemEditModal
          item={editingItem.item}
          onSave={handleItemSave}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* 개별 항목 Claude 수정 요청 모달 */}
      {claudeFixItem && (
        <ItemClaudeFixModal
          item={claudeFixItem.item}
          fieldLabel={claudeFixItem.field}
          onApply={(fixed) => applyItemFix(claudeFixItem.field, claudeFixItem.index, fixed)}
          onClose={() => setClaudeFixItem(null)}
        />
      )}

      {/* 개별 항목 직접 편집 모달 */}
      {directEditItem && (
        <ItemEditModal
          item={directEditItem.item}
          onSave={(edited) => applyDirectEdit(directEditItem.field, directEditItem.index, edited)}
          onClose={() => setDirectEditItem(null)}
        />
      )}
    </div>
  );
}


// ── 추적성 분석 페이지 ────────────────────────────────────────────────────────
function TraceabilityPage({ project, wps }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!wps.length) { setError("산출물이 없습니다."); return; }
    setAnalyzing(true); setError(""); setResult(null);
    try { setResult(await analyzeTraceability(wps)); }
    catch (e) { setError("분석 실패: " + e.message); }
    setAnalyzing(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.02em" }}>추적성 분석</h1>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>{project.name} · Need → STK-REQ → SYS-REQ → Element → VC → Test</p>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>산출물 현황 ({wps.length}건)</h2>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>생성된 산출물의 추적성을 AI로 분석합니다.</p>
          </div>
          <Btn onClick={handleAnalyze} disabled={analyzing || !wps.length}>⇌ 분석 실행</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PROCESSES.map(p => { const count = wps.filter(w => w.process_id === p.id).length; return count > 0 && <Badge key={p.id} color={p.color}>{p.id} ({count})</Badge>; })}
        </div>
      </Card>
      {analyzing && <Spinner text="추적성 분석 중…" />}
      {error && <div style={{ color: T.red, fontSize: 12, padding: 14, background: T.redDim, borderRadius: 10, marginBottom: 16 }}>{error}</div>}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .4s" }}>
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>커버리지</h2>
            <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {Object.entries(result.coverage || {}).map(([k, v]) => (
                <div key={k} style={{ padding: "10px 14px", background: "rgba(9,11,15,0.7)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{k.replace(/_/g, " ").toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: String(v).includes("100%") ? T.green : T.amber }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Forward Traceability</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(result.forward_chain || []).map((link, i) => {
                const relColor = { SATISFIES: T.accent, REFINES: T.purple, DERIVES: T.purple, ALLOCATED_TO: T.teal, VERIFIED_BY: T.green, TESTED_BY: T.amber }[link.relation] || T.muted;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(9,11,15,0.7)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", fontSize: 12 }}>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.from}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <Badge color={relColor}>{link.relation}</Badge>
                    <span style={{ color: T.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{link.to}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>V-Model 매핑</h2>
            {(result.v_model_mapping || []).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(9,11,15,0.7)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1 }}>{m.left}</span>
                <span style={{ color: T.muted, fontSize: 14 }}>{m.relation}</span>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, flex: 1, textAlign: "right" }}>{m.right}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

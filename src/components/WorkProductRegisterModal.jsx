// SCR-09 — 산출물 등록 모달 (Phase 2-2c 확장)
//
// Phase 2-2b 까지: 파일 업로드 + 본문 텍스트 단일 입력
// Phase 2-2c 변경:
//   - 엑셀(.xlsx/.xls) 파일 감지 시 SheetJS 동적 로딩
//   - 워크시트 목록 표시 + 시트별 체크박스 + 미리보기
//   - 메타 시트 자동 감지 (Cover, Change Log, Legend, TOC, 표지, 변경이력, 범례, 목차 ...)
//   - 그룹명 자동 추출 (Cellular Stack → CELLULAR, GNSS → GNSS ...)
//   - 사용자가 선택한 시트만 JSON 변환 후 저장
//   - work_products.content[itemKey].sheets 배열에 시트별 데이터 저장
//   - 기존 단일 텍스트 흐름 유지 (백워드 호환)

import { useState, useEffect, useRef } from "react";

const MAX_SIZE_MB = 50;
const TEXT_TYPES = [
  "text/plain", "text/markdown", "text/csv",
  "application/json", "application/xml", "text/html",
];
const EXCEL_EXTENSIONS = /\.(xlsx|xls|xlsm)$/i;

// SheetJS CDN — 동적 로딩 (npm 의존성 회피)
const SHEETJS_CDN = "https://esm.sh/xlsx@0.18.5";

// ─── Phase 2-2c: 시트 수 임계값 ─────────────────────────────────
// Vercel Hobby 함수 maxDuration = 300초 (5분)
// 시트당 평균 30~45초 (Opus 4.7 + adaptive thinking)
// 병렬 호출 시 가장 느린 시트가 전체 시간 결정 → 안전 한도 약 8시트
// (Anthropic Tier 1 Opus rate limit 2026년 5월 인상으로 병렬 호출 안전)
const SHEET_COUNT_SAFE_MAX = 8;
const SHEET_COUNT_WARN_THRESHOLD = 5;

// ─── Phase 2-2c: 메타 시트 식별 키워드 (SKILL Section 4.2) ──────
const META_SHEET_KEYWORDS = [
  // English
  "cover", "title", "change log", "changelog", "revision history",
  "legend", "glossary", "toc", "table of contents", "index",
  "about", "info", "notes", "readme",
  // Korean
  "표지", "커버", "변경이력", "개정이력", "이력",
  "범례", "용어집", "목차", "설명", "안내",
];

function isMetaSheet(sheetName) {
  if (!sheetName) return true;
  const lower = sheetName.toLowerCase().trim();
  return META_SHEET_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// ─── Phase 2-2c: 그룹명 자동 추출 (SKILL Section 4.3) ──────────
const GROUP_ABBREVIATIONS = [
  [/cellular|4g|5g|lte/i, "CELLULAR"],
  [/bluetooth.*wi-?fi|bt.*wifi/i, "BTWIFI"],
  [/gnss|gps|positioning/i, "GNSS"],
  [/bluetooth\b|^bt\b/i, "BT"],
  [/wi-?fi|wlan/i, "WIFI"],
  [/diagnostic|uds\b/i, "DIAG"],
  [/power|energy/i, "POWER"],
  [/boot|startup/i, "BOOT"],
  [/ota|update/i, "OTA"],
  [/security|cybersec/i, "SEC"],
  [/audio|sound/i, "AUDIO"],
  [/display|hmi\b|^ui\b/i, "HMI"],
  [/can\s*bus|^can\b|can\s*network/i, "CAN"],
  [/ethernet|automotive\s*eth/i, "ETH"],
  [/\blin\b/i, "LIN"],
  [/connectivity/i, "CONN"],
  [/telematics|tcu/i, "TELEM"],
  [/antenna|\bant\b/i, "ANT"],
  [/storage|memory|flash/i, "STORAGE"],
  [/logging|event\s*log/i, "LOG"],
];

function extractGroupName(sheetName, fallbackIndex) {
  if (!sheetName) return `SHEET${fallbackIndex}`;
  const trimmed = sheetName.trim();
  for (const [regex, abbr] of GROUP_ABBREVIATIONS) {
    if (regex.test(trimmed)) return abbr;
  }
  const englishMatch = trimmed.match(/^[A-Za-z][A-Za-z0-9_]*/);
  if (englishMatch) {
    return englishMatch[0].toUpperCase().slice(0, 12);
  }
  return `SHEET${fallbackIndex}`;
}

// ─── Phase 2-2c: 자동 그룹명 충돌 해결 ──────────────────────────
// 같은 group_name 을 가진 시트들을 시트명에서 추가 단어 추출하여 disambiguate
//
// 예시:
//   시트 "NAD Cellular", "NAD Bluetooth", "NAD WiFi" → 모두 NAD 로 추출됨
//   → 자동 해결: NAD (첫번째 유지) / NADBT / NADWIFI 로 분리
function autoResolveGroupConflicts(sheets) {
  // 1. 그룹명별로 시트 인덱스 수집
  const groupBuckets = new Map();
  sheets.forEach((sheet, idx) => {
    if (sheet.is_meta || !sheet.selected) return;
    const g = sheet.group_name;
    if (!groupBuckets.has(g)) groupBuckets.set(g, []);
    groupBuckets.get(g).push(idx);
  });

  const newSheets = [...sheets];
  const usedNames = new Set();
  const changes = [];

  // 충돌이 없는 그룹명은 그대로 사용
  for (const [g, indices] of groupBuckets.entries()) {
    if (indices.length === 1) {
      usedNames.add(g);
    }
  }

  // 충돌이 있는 그룹들 처리
  for (const [g, indices] of groupBuckets.entries()) {
    if (indices.length <= 1) continue;

    // 충돌 시: 첫 번째는 원본 유지, 나머지는 시트명에서 disambiguator 추출
    indices.forEach((sheetIdx, occurrence) => {
      const sheet = sheets[sheetIdx];
      if (occurrence === 0) {
        // 첫 번째는 원본 유지
        usedNames.add(g);
        return;
      }

      // disambiguator 추출
      const newName = generateDisambiguatedName(sheet.sheet_name, g, usedNames, occurrence);
      newSheets[sheetIdx] = { ...sheet, group_name: newName };
      usedNames.add(newName);
      changes.push({
        sheet_name: sheet.sheet_name,
        from: g,
        to: newName,
      });
    });
  }

  return { sheets: newSheets, changes };
}

// 시트명에서 disambiguator 추출하여 새 그룹명 생성
function generateDisambiguatedName(sheetName, baseGroup, usedNames, occurrence) {
  const cleaned = sheetName.trim();

  // 전략 1: GROUP_ABBREVIATIONS에서 baseGroup 외의 다른 매칭이 있는지 찾기
  //   예: "NAD Cellular" → CELLULAR (NAD 매칭 외에) → NADCELL 같은 합성
  for (const [regex, abbr] of GROUP_ABBREVIATIONS) {
    if (abbr === baseGroup) continue;
    if (regex.test(cleaned)) {
      // baseGroup + abbr 의 합성을 시도 (최대 12자)
      const composed = (baseGroup + abbr).slice(0, 12);
      if (!usedNames.has(composed)) return composed;
      // 또는 abbr 만으로
      if (!usedNames.has(abbr)) return abbr;
    }
  }

  // 전략 2: 시트명에서 baseGroup 매칭 단어를 제거하고 남은 단어 첫 글자들 추출
  const words = cleaned.split(/[\s\-_/&()]+/).filter(w => w.length > 0);
  const meaningfulWords = words.filter(w => {
    const u = w.toUpperCase();
    return u !== baseGroup && !/^v?\d+$/i.test(w);  // 버전 번호 제외
  });

  if (meaningfulWords.length > 0) {
    // 첫 단어 영문 부분
    const firstMeaningful = meaningfulWords[0].match(/[A-Za-z][A-Za-z0-9]*/);
    if (firstMeaningful) {
      const upper = firstMeaningful[0].toUpperCase();
      // 1) baseGroup + upper
      const composed = (baseGroup + upper).slice(0, 12);
      if (!usedNames.has(composed)) return composed;
      // 2) upper 만으로
      if (upper.length >= 2 && !usedNames.has(upper)) return upper.slice(0, 12);
    }
  }

  // 전략 3: 숫자 접미사 (최후 수단)
  let suffix = 2;
  while (usedNames.has(`${baseGroup}${suffix}`)) suffix++;
  return `${baseGroup}${suffix}`.slice(0, 12);
}

// ─── SheetJS 동적 로딩 ──────────────────────────────────────────
let _xlsxModule = null;
async function loadSheetJS() {
  if (_xlsxModule) return _xlsxModule;
  try {
    _xlsxModule = await import(/* @vite-ignore */ SHEETJS_CDN);
    return _xlsxModule;
  } catch (e) {
    throw new Error(`SheetJS 로딩 실패: ${e.message}`);
  }
}

// ─── 엑셀 파일 → 시트별 데이터 변환 ────────────────────────────
async function parseExcelFile(file) {
  const XLSX = await loadSheetJS();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const sheets = workbook.SheetNames.map((sheetName, idx) => {
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });

    const columns = rawRows.length > 0 ? rawRows[0].map(c => String(c || "").trim()) : [];
    const dataRows = rawRows.slice(1)
      .filter(row => row.some(cell => String(cell || "").trim() !== ""))
      .map((row, rowIdx) => {
        const obj = { row_num: rowIdx + 2 };
        columns.forEach((col, colIdx) => {
          if (col) obj[col] = String(row[colIdx] || "").trim();
        });
        return obj;
      });

    const isMeta = isMetaSheet(sheetName);
    const groupName = isMeta ? null : extractGroupName(sheetName, idx + 1);

    return {
      sheet_name: sheetName,
      sheet_index: idx + 1,
      group_name: groupName,
      is_meta: isMeta,
      selected: !isMeta,
      columns,
      row_count: dataRows.length,
      rows: dataRows,
      preview: dataRows.slice(0, 3),
    };
  });

  return { sheets, total_sheets: workbook.SheetNames.length };
}

// ─── 선택된 시트들을 body 텍스트로 직렬화 (백워드 호환) ────────
function serializeSheetsToBody(sheets) {
  const lines = [];
  for (const sheet of sheets) {
    if (!sheet.selected || sheet.is_meta) continue;
    lines.push(`### Sheet: ${sheet.sheet_name} (Group: ${sheet.group_name})`);
    lines.push(`Columns: ${sheet.columns.join(" | ")}`);
    lines.push("");
    for (const row of sheet.rows) {
      const parts = sheet.columns
        .filter(c => row[c])
        .map(c => `${c}: ${row[c]}`);
      lines.push(`Row ${row.row_num}: ${parts.join(" | ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────
export default function WorkProductRegisterModal({
  open,
  onClose,
  projectId,
  processId,
  item,
  initialValue,
  onSave,
}) {
  const [file, setFile] = useState(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");  // Phase 2-2c: 성공/안내 메시지
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [excelData, setExcelData] = useState(null);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [excelError, setExcelError] = useState("");

  useEffect(() => {
    if (open) {
      setFile(null);
      setBody(initialValue?.body || "");
      setNote(initialValue?.note || "");
      setError("");
      setExcelError("");
      setUploadProgress(0);
      if (initialValue?.source_type === "excel_multi_sheet" && initialValue?.sheets) {
        setExcelData({
          sheets: initialValue.sheets,
          total_sheets: initialValue.sheets.length,
        });
      } else {
        setExcelData(null);
      }
    }
  }, [open, initialValue]);

  if (!open) return null;

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return;

    const sizeMB = selectedFile.size / 1024 / 1024;
    if (sizeMB > MAX_SIZE_MB) {
      setError(`파일 크기는 ${MAX_SIZE_MB}MB를 초과할 수 없습니다 (현재: ${sizeMB.toFixed(1)}MB)`);
      return;
    }

    setError("");
    setExcelError("");
    setFile(selectedFile);

    if (EXCEL_EXTENSIONS.test(selectedFile.name)) {
      setParsingExcel(true);
      setExcelData(null);
      try {
        const parsed = await parseExcelFile(selectedFile);
        setExcelData(parsed);
        setBody(serializeSheetsToBody(parsed.sheets));
      } catch (e) {
        setExcelError(`엑셀 파싱 실패: ${e.message}`);
        setExcelData(null);
      }
      setParsingExcel(false);
      return;
    }

    if (TEXT_TYPES.includes(selectedFile.type) || selectedFile.name.match(/\.(txt|md|csv|json|xml|html)$/i)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target.result || "").substring(0, 5000);
        if (!body.trim()) setBody(text);
      };
      reader.readAsText(selectedFile);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }

  function toggleSheetSelection(sheetIdx) {
    if (!excelData) return;
    const newSheets = excelData.sheets.map((s, i) =>
      i === sheetIdx ? { ...s, selected: !s.selected } : s
    );
    const newData = { ...excelData, sheets: newSheets };
    setExcelData(newData);
    setBody(serializeSheetsToBody(newSheets));
  }

  function updateGroupName(sheetIdx, newGroupName) {
    if (!excelData) return;
    const cleaned = newGroupName.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 12);
    const newSheets = excelData.sheets.map((s, i) =>
      i === sheetIdx ? { ...s, group_name: cleaned || `SHEET${i + 1}` } : s
    );
    const newData = { ...excelData, sheets: newSheets };
    setExcelData(newData);
    setBody(serializeSheetsToBody(newSheets));
  }

  // Phase 2-2c: 자동 그룹명 충돌 해결 핸들러
  function handleAutoResolveConflicts() {
    if (!excelData) return;
    const { sheets: resolvedSheets, changes } = autoResolveGroupConflicts(excelData.sheets);
    const newData = { ...excelData, sheets: resolvedSheets };
    setExcelData(newData);
    setBody(serializeSheetsToBody(resolvedSheets));

    if (changes.length === 0) {
      setInfoMessage("✓ 충돌이 발견되지 않았습니다.");
      setTimeout(() => setInfoMessage(""), 4000);
      return;
    }
    const summary = changes
      .slice(0, 5)
      .map(c => `  • "${c.sheet_name}": ${c.from} → ${c.to}`)
      .join("\n");
    const more = changes.length > 5 ? `\n  ... 외 ${changes.length - 5}개` : "";
    setInfoMessage(`✓ ${changes.length}개 시트 그룹명 자동 정리:\n${summary}${more}`);
    setTimeout(() => setInfoMessage(""), 10000);
  }

  async function handleRegister() {
    if (!file && !initialValue?.storagePath) {
      setError("파일을 선택하세요.");
      return;
    }
    if (!body.trim()) {
      setError("본문 내용을 입력하세요. (AI 생성 시 입력으로 사용됩니다)");
      return;
    }

    if (excelData) {
      const selectedSheets = excelData.sheets.filter(s => s.selected && !s.is_meta);
      if (selectedSheets.length === 0) {
        setError("최소 1개의 워크시트를 선택하세요. (메타 시트는 자동 제외됨)");
        return;
      }
      // Phase 2-2c: 시트 수 안전 한도
      if (selectedSheets.length > SHEET_COUNT_SAFE_MAX) {
        setError(`선택된 시트가 너무 많습니다 (${selectedSheets.length}개). Vercel 함수 타임아웃(300초) 위험으로 인해 최대 ${SHEET_COUNT_SAFE_MAX}개까지만 처리할 수 있습니다. 일부 시트의 선택을 해제하세요.`);
        return;
      }
      const groupNames = selectedSheets.map(s => s.group_name);
      const dupes = groupNames.filter((g, i) => groupNames.indexOf(g) !== i);
      if (dupes.length > 0) {
        setError(`그룹명이 중복되었습니다: ${[...new Set(dupes)].join(", ")} — 우측 [🔧 그룹명 자동 정리] 버튼을 사용하거나 각 시트마다 고유한 그룹명을 직접 입력하세요.`);
        return;
      }
    }

    setUploading(true);
    setError("");
    setUploadProgress(10);

    try {
      let storagePath = initialValue?.storagePath;
      let originalFileName = initialValue?.fileName || file?.name;

      if (file) {
        const base64 = await fileToBase64(file);
        setUploadProgress(40);

        const uploadRes = await fetch("/api/upload?action=upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            base64,
            projectId,
            processId,
            itemKey: item.key,
          }),
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`업로드 실패: ${errText}`);
        }
        const uploadResult = await uploadRes.json();
        storagePath = uploadResult.storagePath;
        originalFileName = uploadResult.originalFileName;
        setUploadProgress(80);
      }

      const payload = {
        source: "register",
        fileName: originalFileName,
        fileType: file?.type || initialValue?.fileType || "application/octet-stream",
        fileSize: file?.size || initialValue?.fileSize || 0,
        storagePath,
        body: body.trim(),
        note: note.trim(),
        registeredAt: new Date().toISOString(),
      };

      if (excelData) {
        payload.source_type = "excel_multi_sheet";
        payload.sheets = excelData.sheets;
        payload.total_sheets = excelData.total_sheets;
      }

      await onSave(payload);
      setUploadProgress(100);
      setTimeout(() => onClose(), 300);
    } catch (e) {
      setError("등록 실패: " + e.message);
      setUploadProgress(0);
    }
    setUploading(false);
  }

  const existingFile = !file && initialValue?.storagePath ? {
    name: initialValue.fileName,
    type: initialValue.fileType,
    size: initialValue.fileSize,
    storagePath: initialValue.storagePath,
  } : null;

  return (
    <div style={overlayStyle} onClick={uploading ? undefined : onClose}>
      <div style={{
        ...modalStyle,
        maxWidth: excelData ? 820 : 600,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={metaLabelStyle}>{processId} · 산출물 등록</div>
            <h2 style={titleStyle}>
              {item.label}
              {item.required && <span style={{ color: "var(--c-coral)", marginLeft: 6 }}>*</span>}
            </h2>
          </div>
          <button onClick={onClose} disabled={uploading} style={closeBtnStyle} aria-label="닫기">×</button>
        </div>

        <div style={bodyStyle}>
          <div style={infoBoxStyle}>
            기존 산출물 파일(요구사항 명세서, 설계 문서 등)을 업로드합니다.
            {" "}<strong>엑셀(.xlsx)</strong> 파일은 워크시트별 분류 처리됩니다. 본문 텍스트는 AI 생성 시 입력으로 사용됩니다.
          </div>

          <Field label="파일" required>
            {(file || existingFile) ? (
              <FileChip
                file={file || existingFile}
                isExisting={!file && !!existingFile}
                onRemove={() => { setFile(null); setExcelData(null); }}
                disabled={uploading}
              />
            ) : (
              <DropZone
                dragOver={dragOver}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              accept=".xlsx,.xls,.xlsm,.txt,.md,.csv,.json,.xml,.html,.docx,.pdf"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              disabled={uploading}
            />
          </Field>

          {parsingExcel && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(35, 131, 226, 0.08)",
              border: "1px solid rgba(35, 131, 226, 0.30)",
              borderRadius: 6,
              fontSize: 12,
              color: "#1A6DC4",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <div style={{
                width: 14, height: 14,
                border: "2px solid rgba(35, 131, 226, 0.30)",
                borderTop: "2px solid #2383E2",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }} />
              엑셀 파일 분석 중... (SheetJS 동적 로딩)
            </div>
          )}

          {excelError && (
            <div style={errorBoxStyle}>⚠ {excelError}</div>
          )}

          {excelData && !parsingExcel && (() => {
            // 선택된 비-메타 시트
            const activeSheets = excelData.sheets.filter(s => s.selected && !s.is_meta);
            const totalRows = activeSheets.reduce((sum, s) => sum + s.row_count, 0);

            // 그룹명 충돌 감지
            const groupNames = activeSheets.map(s => s.group_name);
            const groupCounts = groupNames.reduce((acc, g) => {
              acc[g] = (acc[g] || 0) + 1;
              return acc;
            }, {});
            const conflictGroups = Object.entries(groupCounts).filter(([, n]) => n > 1).map(([g]) => g);
            const hasConflicts = conflictGroups.length > 0;

            // 시트 수 경고 상태
            const sheetCount = activeSheets.length;
            const sheetCountStatus =
              sheetCount > SHEET_COUNT_SAFE_MAX ? 'danger' :
              sheetCount > SHEET_COUNT_WARN_THRESHOLD ? 'warn' :
              'ok';

            return (
              <Field label={`워크시트 (${excelData.total_sheets}개 감지)`}>
                <div style={{
                  fontSize: 11,
                  color: "var(--c-text-muted)",
                  marginBottom: 8,
                  lineHeight: 1.6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 12,
                }}>
                  <div>
                    AI 생성에 포함할 시트를 선택하세요. 메타 시트(표지, 변경이력, 범례 등)는 자동 제외됩니다.
                    그룹명은 STK_REQ ID에 사용됩니다 (예: STK_REQ_CELLULAR_001).
                  </div>
                  {hasConflicts && (
                    <button
                      onClick={handleAutoResolveConflicts}
                      disabled={uploading}
                      style={{
                        flexShrink: 0,
                        background: "#2383E2",
                        color: "#fff",
                        border: "none",
                        borderRadius: 5,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      🔧 그룹명 자동 정리
                    </button>
                  )}
                </div>

                {/* Phase 2-2c: 시트 수 경고 */}
                {sheetCountStatus !== 'ok' && (
                  <div style={{
                    padding: "8px 12px",
                    background: sheetCountStatus === 'danger'
                      ? "rgba(224, 62, 62, 0.08)"
                      : "rgba(199, 125, 26, 0.08)",
                    border: `1px solid ${sheetCountStatus === 'danger'
                      ? "rgba(224, 62, 62, 0.30)"
                      : "rgba(199, 125, 26, 0.30)"}`,
                    borderRadius: 6,
                    marginBottom: 8,
                    fontSize: 11,
                    color: sheetCountStatus === 'danger' ? "#991B1B" : "#92400E",
                    lineHeight: 1.6,
                  }}>
                    {sheetCountStatus === 'danger' ? (
                      <>
                        <strong>⚠️ 시트 수 초과 ({sheetCount}개 선택)</strong> — 최대 안전 한도 {SHEET_COUNT_SAFE_MAX}개를 초과했습니다.
                        Vercel 함수 타임아웃(300초) 위험이 있습니다. <strong>{sheetCount - SHEET_COUNT_SAFE_MAX}개 이상</strong> 체크 해제를 권장합니다.
                      </>
                    ) : (
                      <>
                        <strong>ℹ️ 시트 수 안내 ({sheetCount}개 선택)</strong> — 병렬 호출로 처리되며 약 30~90초 소요됩니다.
                        시트가 많을수록 비용도 증가합니다 (시트당 약 $0.3~$1.0).
                      </>
                    )}
                  </div>
                )}

                {/* Phase 2-2c: 그룹명 충돌 경고 */}
                {hasConflicts && (
                  <div style={{
                    padding: "8px 12px",
                    background: "rgba(224, 62, 62, 0.08)",
                    border: "1px solid rgba(224, 62, 62, 0.30)",
                    borderRadius: 6,
                    marginBottom: 8,
                    fontSize: 11,
                    color: "#991B1B",
                    lineHeight: 1.6,
                  }}>
                    <strong>⚠ 그룹명 중복</strong> — {conflictGroups.join(", ")} — 우측 <strong>[🔧 자동 정리]</strong> 버튼을 클릭하거나, 각 시트의 그룹명을 직접 수정하세요.
                  </div>
                )}

                <div style={{
                  border: "1px solid var(--c-border-strong)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}>
                  {excelData.sheets.map((sheet, idx) => (
                    <SheetRow
                      key={idx}
                      sheet={sheet}
                      onToggle={() => toggleSheetSelection(idx)}
                      onGroupNameChange={(name) => updateGroupName(idx, name)}
                      isLast={idx === excelData.sheets.length - 1}
                      isConflicted={conflictGroups.includes(sheet.group_name) && sheet.selected && !sheet.is_meta}
                    />
                  ))}
                </div>

                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--c-text-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span>
                    선택됨: <strong style={{
                      color: sheetCountStatus === 'danger' ? "#E03E3E" : "var(--c-text)"
                    }}>{sheetCount}</strong>개 시트
                    {sheetCount > 0 && ` (안전 한도 ${SHEET_COUNT_SAFE_MAX}개)`}
                  </span>
                  <span>
                    총 데이터 행: <strong style={{ color: "var(--c-text)" }}>{totalRows}</strong>개
                  </span>
                </div>
              </Field>
            );
          })()}

          <Field label="본문 내용" required>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={excelData
                ? "엑셀 데이터가 자동 변환되었습니다. 필요시 추가 설명을 적으세요."
                : "파일 본문 또는 요약 내용을 입력하세요. (텍스트 파일은 자동 채워집니다)"}
              rows={excelData ? 4 : 6}
              disabled={uploading}
              style={textareaStyle}
            />
            <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 4 }}>
              {body.length} 자 · AI 생성 시 이 내용을 입력으로 사용
            </div>
          </Field>

          <Field label="비고">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(선택) 작성자, 버전, 출처 등"
              disabled={uploading}
              style={inputStyle}
            />
          </Field>

          {uploading && (
            <div style={{ marginTop: 14 }}>
              <div style={{
                fontSize: 11, color: "var(--c-text-soft)", marginBottom: 6,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>업로드 중...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{
                height: 4, background: "var(--c-bg-mid)", borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${uploadProgress}%`,
                  background: "var(--c-navy-deep)",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {error && (
            <div style={errorBoxStyle}>⚠ {error}</div>
          )}

          {infoMessage && (
            <div style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "rgba(35, 131, 226, 0.06)",
              border: "1px solid rgba(35, 131, 226, 0.25)",
              borderRadius: 6,
              fontSize: 12,
              color: "#1A6DC4",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {infoMessage}
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} disabled={uploading} style={cancelBtnStyle}>
            취소
          </button>
          <button onClick={handleRegister} disabled={uploading || parsingExcel || (!file && !initialValue?.storagePath)} style={saveBtnStyle}>
            {uploading ? "업로드 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────

function SheetRow({ sheet, onToggle, onGroupNameChange, isLast, isConflicted }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      borderBottom: isLast ? "none" : "1px solid var(--c-border)",
      background: sheet.is_meta
        ? "var(--c-bg-soft)"
        : (isConflicted ? "rgba(224, 62, 62, 0.04)" : "#fff"),
      opacity: sheet.is_meta ? 0.6 : 1,
      borderLeft: isConflicted ? "3px solid #E03E3E" : "3px solid transparent",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
      }}>
        <input
          type="checkbox"
          checked={sheet.selected && !sheet.is_meta}
          disabled={sheet.is_meta}
          onChange={onToggle}
          style={{ flexShrink: 0, cursor: sheet.is_meta ? "not-allowed" : "pointer" }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--c-text)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{ fontFamily: "monospace" }}>{sheet.sheet_name}</span>
            {sheet.is_meta && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 6px",
                background: "rgba(156, 163, 175, 0.20)",
                color: "#6B6B6B",
                borderRadius: 3,
                letterSpacing: "0.04em",
              }}>
                META · 제외
              </span>
            )}
          </div>
          <div style={{
            fontSize: 10,
            color: "var(--c-text-muted)",
            marginTop: 2,
          }}>
            {sheet.row_count}행 · {sheet.columns.length}열
            {sheet.columns.length > 0 && ` · ${sheet.columns.slice(0, 3).join(", ")}${sheet.columns.length > 3 ? "..." : ""}`}
          </div>
        </div>

        {!sheet.is_meta && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 10, color: "var(--c-text-muted)" }}>그룹:</label>
              <input
                type="text"
                value={sheet.group_name || ""}
                onChange={(e) => onGroupNameChange(e.target.value)}
                style={{
                  width: 100,
                  padding: "4px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  border: isConflicted
                    ? "1px solid #E03E3E"
                    : "1px solid var(--c-border-strong)",
                  borderRadius: 4,
                  textTransform: "uppercase",
                  background: isConflicted ? "rgba(224, 62, 62, 0.06)" : "#fff",
                  color: isConflicted ? "#991B1B" : "inherit",
                }}
                disabled={!sheet.selected}
              />
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border-strong)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 10,
                cursor: "pointer",
                color: "var(--c-text-soft)",
              }}
            >
              {expanded ? "접기" : "미리보기"}
            </button>
          </>
        )}
      </div>

      {expanded && !sheet.is_meta && sheet.preview.length > 0 && (
        <div style={{
          background: "var(--c-bg-soft)",
          borderTop: "1px solid var(--c-border)",
          padding: "8px 12px 10px",
          fontSize: 10,
          fontFamily: "monospace",
          overflow: "auto",
          maxHeight: 200,
        }}>
          <div style={{ marginBottom: 4, color: "var(--c-text-muted)" }}>
            첫 3행 미리보기:
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.04)" }}>
                <th style={{ padding: 4, textAlign: "left", borderBottom: "1px solid var(--c-border)" }}>#</th>
                {sheet.columns.slice(0, 6).map((col, i) => (
                  <th key={i} style={{ padding: 4, textAlign: "left", borderBottom: "1px solid var(--c-border)" }}>
                    {col}
                  </th>
                ))}
                {sheet.columns.length > 6 && (
                  <th style={{ padding: 4, color: "var(--c-text-muted)" }}>...+{sheet.columns.length - 6}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sheet.preview.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: 4, color: "var(--c-text-muted)" }}>{row.row_num}</td>
                  {sheet.columns.slice(0, 6).map((col, ci) => (
                    <td key={ci} style={{
                      padding: 4,
                      maxWidth: 120,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {row[col] || ""}
                    </td>
                  ))}
                  {sheet.columns.length > 6 && <td />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: "var(--c-text)", marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: "var(--c-coral)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function DropZone({ dragOver, onClick, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${dragOver ? "var(--c-navy-deep)" : "var(--c-border-strong)"}`,
        borderRadius: 8,
        padding: "28px 20px",
        background: dragOver ? "rgba(30, 39, 97, 0.06)" : "var(--c-bg-soft)",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📁</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", marginBottom: 4 }}>
        클릭하거나 파일을 드래그하세요
      </div>
      <div style={{ fontSize: 11, color: "var(--c-text-muted)" }}>
        Excel(.xlsx/.xls), Word, PDF, 텍스트 등 — 최대 {MAX_SIZE_MB}MB
      </div>
    </div>
  );
}

function FileChip({ file, isExisting, onRemove, disabled }) {
  const sizeKB = (file.size / 1024).toFixed(1);
  const icon = getFileIcon(file.name);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: "rgba(30, 39, 97, 0.05)",
      border: "1px solid var(--c-navy-mid)",
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: "var(--c-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--c-text-muted)", marginTop: 2 }}>
          {file.type || "binary"} · {sizeKB} KB
          {isExisting && " · 이미 업로드됨"}
        </div>
      </div>
      {!isExisting && (
        <button
          onClick={onRemove}
          disabled={disabled}
          style={{
            background: "transparent", border: "none",
            color: "var(--c-text-muted)", cursor: "pointer",
            fontSize: 18, padding: 4,
          }}
          aria-label="제거"
        >×</button>
      )}
    </div>
  );
}

function getFileIcon(name = "") {
  const ext = name.toLowerCase().split(".").pop();
  if (["doc", "docx"].includes(ext)) return "📄";
  if (["xls", "xlsx", "xlsm", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽";
  if (["pdf"].includes(ext)) return "📕";
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) return "🖼";
  if (["txt", "md"].includes(ext)) return "📝";
  if (["zip", "tar", "gz"].includes(ext)) return "🗜";
  return "📎";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── 스타일 ──────────────────────────────────────────────────────
const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: 20,
};
const modalStyle = {
  background: "#fff", borderRadius: 12,
  width: "100%", maxWidth: 600,
  maxHeight: "calc(100vh - 40px)",
  display: "flex", flexDirection: "column",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)",
  overflow: "hidden",
  transition: "max-width 0.2s",
};
const headerStyle = {
  padding: "18px 22px",
  borderBottom: "1px solid var(--c-border)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexShrink: 0,
};
const metaLabelStyle = {
  fontSize: 11, color: "var(--c-text-muted)",
  fontWeight: 600, letterSpacing: "0.04em", marginBottom: 4,
};
const titleStyle = { fontSize: 17, fontWeight: 700, margin: 0 };
const closeBtnStyle = {
  background: "transparent", border: "none",
  fontSize: 24, fontWeight: 300,
  color: "var(--c-text-muted)", cursor: "pointer",
  width: 32, height: 32, borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const bodyStyle = {
  padding: "20px 22px", overflowY: "auto", flex: 1,
};
const infoBoxStyle = {
  background: "rgba(30, 39, 97, 0.04)",
  border: "1px solid rgba(30, 39, 97, 0.15)",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 11, color: "var(--c-text-soft)",
  lineHeight: 1.6, marginBottom: 16,
};
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--c-border-strong)",
  borderRadius: 6,
  fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.6,
};
const errorBoxStyle = {
  marginTop: 12, padding: "10px 12px",
  background: "rgba(220, 38, 38, 0.08)",
  border: "1px solid rgba(220, 38, 38, 0.30)",
  borderRadius: 6,
  fontSize: 12, color: "#991B1B",
};
const footerStyle = {
  padding: "14px 22px",
  borderTop: "1px solid var(--c-border)",
  display: "flex", justifyContent: "flex-end", gap: 8,
  flexShrink: 0,
};
const cancelBtnStyle = {
  background: "#fff",
  border: "1px solid var(--c-border-strong)",
  borderRadius: 6,
  padding: "9px 18px",
  fontSize: 12, fontWeight: 600,
  color: "var(--c-text)",
  cursor: "pointer",
};
const saveBtnStyle = {
  background: "var(--c-navy-deep)",
  color: "#fff", border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  fontSize: 12, fontWeight: 600,
  cursor: "pointer",
};

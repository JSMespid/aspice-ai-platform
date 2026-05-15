// src/components/GeneratedArtifactView.jsx — Phase 2-2b STEP C-3a
//
// 화면설계서 v260506 SCR-05 (확장):
//   AI 생성이 완료된 후, 생성된 산출물을 메인 화면에 시각적으로 표시
//   상단 액션 영역에 사용자 제어 버튼 (Rationale 보기 / QA 검토 시작 / 다운로드)
//
// Phase 2-2b STEP C-3a 변경:
//   - 다운로드 메뉴 추가 — JSON / CSV / Markdown (DOCX/XLSX 는 C-3b, C-3c)
//
// Phase 2-2b STEP C-2 (이전):
//   - 상단 액션 영역 — [📊 Rationale 보기] [🔍 QA 검토 시작]
//   - canQAReview, hasEvaluator, evaluating props 지원
//   - 카드별 [✏ 편집] 버튼

import { useState, useRef, useEffect } from "react";
import { exportJSON, exportCSV, exportMarkdown, exportDOCX } from "../lib/exporters.js";

export default function GeneratedArtifactView({
  aiGenerated,
  processColor,
  onReopenPanel,
  onQAReview,
  canQAReview,
  hasEvaluator,
  evaluating,
  onEditStkReq,
  // STEP C-3a 신규 props (다운로드용 메타데이터)
  projectName,
  processId,
  generatorModel,
  evaluatorModel,
  critique,        // 최근 critique (다운로드 포함용)
}) {
  const [view, setView] = useState("structured"); // 'structured' | 'json'
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef(null);

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!downloadMenuOpen) return;
    function handler(e) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setDownloadMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [downloadMenuOpen]);

  if (!aiGenerated) return null;

  const stkReqs = aiGenerated.stakeholder_requirements || [];
  const useCases = aiGenerated.use_cases || [];  // Phase 2-2c: 보통 빈 배열 (스키마 제거됨)
  const opContext = aiGenerated.operational_context || {};
  const traceSeeds = aiGenerated.traceability_seeds || {};
  // Phase 2-2c 신규 필드
  const coverageMatrix = aiGenerated.coverage_matrix || null;
  const warnings = aiGenerated.warnings || [];

  // 다운로드 메타데이터 구성
  const exportMeta = {
    project_name: projectName,
    process_id: processId,
    generator_model: generatorModel,
    evaluator_model: evaluatorModel,
    version: '2.2c',
    critique,
  };

  const [downloading, setDownloading] = useState(null); // null | 'docx' | 'xlsx' (큰 작업만)

  async function handleDownload(format) {
    setDownloadMenuOpen(false);
    try {
      let result;
      switch (format) {
        case 'json':
          result = exportJSON(aiGenerated, exportMeta);
          break;
        case 'csv':
          result = exportCSV(aiGenerated, exportMeta);
          break;
        case 'markdown':
          result = exportMarkdown(aiGenerated, exportMeta);
          break;
        case 'docx':
          // DOCX 는 CDN 라이브러리 로드 + 생성 시간 필요 (3~10초)
          setDownloading('docx');
          result = await exportDOCX(aiGenerated, exportMeta);
          setDownloading(null);
          break;
        default:
          alert(`알 수 없는 형식: ${format}`);
          return;
      }
      console.log(`[export] ${format} 다운로드 완료:`, result);
    } catch (e) {
      console.error(`[export] ${format} 실패:`, e);
      setDownloading(null);
      alert(`다운로드 실패: ${e.message}`);
    }
  }

  return (
    <div style={{
      marginTop: 16,
      background: "#fff",
      borderRadius: 12,
      border: "1px solid var(--c-border)",
      borderTop: `3px solid ${processColor}`,
      padding: 24,
    }}>
      {/* 헤더 + 액션 영역 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
        paddingBottom: 14,
        borderBottom: "1px solid var(--c-border)",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: "var(--c-text-muted)",
            letterSpacing: "0.04em",
            marginBottom: 4,
          }}>
            ⚡ AI GENERATED · CLAUDE OPUS 4.7
          </div>
          <h2 style={{
            fontSize: 16, fontWeight: 700, margin: 0,
            color: processColor,
          }}>
            {aiGenerated.title || "Stakeholder Requirements"}
          </h2>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* JSON 원본 보기 토글 */}
          <button
            onClick={() => setView(view === "structured" ? "json" : "structured")}
            style={{
              background: "#fff",
              border: "1px solid var(--c-border-strong)",
              borderRadius: 6,
              padding: "7px 13px",
              fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              color: "var(--c-text)",
            }}>
            {view === "structured" ? "📋 JSON 원본" : "📑 구조화 보기"}
          </button>

          {/* Rationale 보기 (이전 결과 확인) */}
          {onReopenPanel && (
            <button
              onClick={onReopenPanel}
              title="AI 생성 / QA 검토 결과 자세히 보기"
              style={{
                background: "#fff",
                border: "1px solid var(--c-navy-deep)",
                color: "var(--c-navy-deep)",
                borderRadius: 6,
                padding: "7px 13px",
                fontSize: 11, fontWeight: 600,
                cursor: "pointer",
              }}>
              📊 Rationale 보기
            </button>
          )}

          {/* 다운로드 메뉴 (Phase 2-2b STEP C-3a) */}
          <div ref={downloadMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDownloadMenuOpen(o => !o)}
              disabled={!!downloading}
              title={downloading ? `${downloading.toUpperCase()} 파일 생성 중...` : "산출물 다운로드 (JSON / CSV / Markdown / DOCX)"}
              style={{
                background: "#fff",
                border: "1px solid var(--c-border-strong)",
                borderRadius: 6,
                padding: "7px 13px",
                fontSize: 11, fontWeight: 600,
                cursor: downloading ? "wait" : "pointer",
                color: "var(--c-text)",
                display: "flex", alignItems: "center", gap: 4,
                opacity: downloading ? 0.6 : 1,
              }}>
              {downloading
                ? `⏳ ${downloading.toUpperCase()} 생성 중...`
                : <>📥 다운로드 <span style={{ fontSize: 9, marginLeft: 2 }}>▼</span></>
              }
            </button>

            {downloadMenuOpen && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                background: "#fff",
                border: "1px solid var(--c-border-strong)",
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(15, 23, 42, 0.15)",
                minWidth: 220,
                zIndex: 10,
                overflow: "hidden",
              }}>
                <DownloadMenuItem
                  icon="📄"
                  title="JSON"
                  desc="원본 데이터 (시스템 통합)"
                  onClick={() => handleDownload('json')}
                />
                <DownloadMenuItem
                  icon="📊"
                  title="CSV"
                  desc="엑셀 표 (STK_REQ 정리)"
                  onClick={() => handleDownload('csv')}
                />
                <DownloadMenuItem
                  icon="📝"
                  title="Markdown"
                  desc="보고서 (Notion/GitHub)"
                  onClick={() => handleDownload('markdown')}
                />
                <DownloadMenuItem
                  icon="📃"
                  title="Word (DOCX)"
                  desc="ASPICE 평가관 제출용"
                  onClick={() => handleDownload('docx')}
                  primary
                />
                <div style={{
                  padding: "8px 12px",
                  fontSize: 10,
                  color: "var(--c-text-muted)",
                  borderTop: "1px solid var(--c-border)",
                  background: "var(--c-bg-soft)",
                  fontStyle: "italic",
                }}>
                  Excel (XLSX) 곧 제공
                </div>
              </div>
            )}
          </div>

          {/* QA 검토 시작 (Phase 2-2b STEP C-2 핵심) */}
          {onQAReview && (
            <button
              onClick={onQAReview}
              disabled={!canQAReview || evaluating}
              title={
                !canQAReview
                  ? "먼저 AI 생성을 실행하세요"
                  : evaluating
                    ? "QA 검토 진행 중..."
                    : hasEvaluator
                      ? "다시 QA 검토를 실행합니다 (Gemini 재평가)"
                      : "Gemini가 Claude의 결과를 독립 평가합니다 (편향 분리). 10~30초 소요."
              }
              style={{
                background: (canQAReview && !evaluating) ? processColor : "var(--c-bg-mid)",
                border: "none",
                color: (canQAReview && !evaluating) ? "#fff" : "var(--c-text-muted)",
                borderRadius: 6,
                padding: "7px 13px",
                fontSize: 11, fontWeight: 600,
                cursor: (canQAReview && !evaluating) ? "pointer" : "not-allowed",
                opacity: evaluating ? 0.6 : 1,
              }}>
              {evaluating
                ? "🔍 검토 중..."
                : hasEvaluator
                  ? "🔍 QA 다시 검토"
                  : "🔍 QA 검토 시작"}
            </button>
          )}
        </div>
      </div>

      {/* QA 상태 안내 배너 */}
      {hasEvaluator && (
        <div style={{
          marginBottom: 18,
          padding: "10px 14px",
          background: "rgba(35, 131, 226, 0.08)",
          border: "1px solid rgba(35, 131, 226, 0.25)",
          borderRadius: 6,
          fontSize: 11, color: "var(--c-navy-deep)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>✓</span>
          <span>
            <strong>QA 검토 완료</strong> — Gemini 독립 평가가 실행되었습니다.
            우측 상단 <strong>[📊 Rationale 보기]</strong>를 눌러 critique 상세를 확인하세요.
          </span>
        </div>
      )}
      {!hasEvaluator && canQAReview && (
        <div style={{
          marginBottom: 18,
          padding: "10px 14px",
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.30)",
          borderRadius: 6,
          fontSize: 11, color: "#92400E",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>💡</span>
          <span>
            <strong>다음 단계</strong> — 산출물을 검토하신 후 우측 상단
            <strong> [🔍 QA 검토 시작]</strong>을 누르면 Gemini가 독립 평가합니다.
          </span>
        </div>
      )}

      {/* 본문 */}
      {view === "structured" ? (
        <StructuredView
          stkReqs={stkReqs}
          useCases={useCases}
          opContext={opContext}
          traceSeeds={traceSeeds}
          processColor={processColor}
          onEditStkReq={onEditStkReq}
          coverageMatrix={coverageMatrix}
          warnings={warnings}
        />
      ) : (
        <JsonView aiGenerated={aiGenerated} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// 구조화 보기 (Phase 2-2c: 그룹별 섹션 + Coverage Matrix)
// ──────────────────────────────────────────────────
function StructuredView({ stkReqs, useCases, opContext, traceSeeds, processColor, onEditStkReq, coverageMatrix, warnings }) {
  // Phase 2-2c: STK_REQ를 그룹별로 묶기
  const grouped = groupByGroupName(stkReqs);
  const hasGroups = grouped.size > 1 || (grouped.size === 1 && !grouped.has(null));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SummaryBar
        stats={[
          { label: "STK_REQ", count: stkReqs.length, color: processColor },
          ...(hasGroups ? [{ label: "그룹", count: grouped.size, color: "#6940A5" }] : []),
          { label: "법규/표준", count: opContext.regulatory_constraints?.length || 0, color: "#F59E0B" },
          { label: "외부 IF", count: opContext.external_interfaces?.length || 0, color: "#10B981" },
        ]}
      />

      {/* Phase 2-2c: Coverage Matrix (스펙 보존 결과) */}
      {coverageMatrix && (
        <CoverageMatrixView matrix={coverageMatrix} processColor={processColor} />
      )}

      {/* Phase 2-2c: Warnings */}
      {warnings && warnings.length > 0 && (
        <Section title="⚠ 주의사항" count={warnings.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{
                padding: "8px 12px",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.30)",
                borderRadius: 6,
                fontSize: 12,
                color: "#92400E",
                lineHeight: 1.6,
              }}>
                {w}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Phase 2-2c: 그룹별 또는 평면 STK_REQ 표시 */}
      {hasGroups ? (
        <Section title="Stakeholder Requirements (그룹별)" count={stkReqs.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {Array.from(grouped.entries()).map(([groupName, reqs]) => (
              <GroupSection
                key={groupName || "_no_group"}
                groupName={groupName}
                reqs={reqs}
                processColor={processColor}
                onEditStkReq={onEditStkReq}
              />
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Stakeholder Requirements" count={stkReqs.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stkReqs.map(req => (
              <StkReqCard
                key={req.id}
                req={req}
                processColor={processColor}
                onEdit={onEditStkReq ? () => onEditStkReq(req) : null}
              />
            ))}
          </div>
        </Section>
      )}

      {useCases.length > 0 && (
        <Section title="Use Cases" count={useCases.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {useCases.map(uc => (
              <UseCaseCard key={uc.id} uc={uc} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Operational Context">
        <div style={{
          background: "var(--c-bg-soft)",
          borderRadius: 8, padding: 14,
          fontSize: 12, lineHeight: 1.7,
        }}>
          {opContext.operating_conditions && (
            <div style={{ marginBottom: 10 }}>
              <strong>운영 조건:</strong> {opContext.operating_conditions}
            </div>
          )}
          {opContext.regulatory_constraints?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <strong>법규 · 표준:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {opContext.regulatory_constraints.map((r, i) => (
                  <span key={i} style={chipStyle("rgba(245, 158, 11, 0.15)", "#92400E", "rgba(245, 158, 11, 0.4)")}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {opContext.external_interfaces?.length > 0 && (
            <div>
              <strong>외부 인터페이스:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {opContext.external_interfaces.map((i, idx) => (
                  <span key={idx} style={chipStyle("rgba(16, 185, 129, 0.15)", "#065F46", "rgba(16, 185, 129, 0.4)")}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {(traceSeeds.from_sw_req?.length || traceSeeds.from_hw_req?.length || traceSeeds.from_sow?.length) && (
        <Section title="Traceability Seeds">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
            {traceSeeds.from_sw_req?.length > 0 && (
              <TraceabilityRow label="SW Requirements" items={traceSeeds.from_sw_req} color="#2383E2" />
            )}
            {traceSeeds.from_hw_req?.length > 0 && (
              <TraceabilityRow label="HW Requirements" items={traceSeeds.from_hw_req} color="#F59E0B" />
            )}
            {traceSeeds.from_sow?.length > 0 && (
              <TraceabilityRow label="Statement of Work" items={traceSeeds.from_sow} color="#10B981" />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function JsonView({ aiGenerated }) {
  return (
    <pre style={{
      margin: 0,
      padding: 16,
      background: "var(--c-bg-soft)",
      borderRadius: 8,
      border: "1px solid var(--c-border)",
      fontSize: 11,
      fontFamily: "monospace",
      lineHeight: 1.6,
      maxHeight: 600,
      overflow: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      {JSON.stringify(aiGenerated, null, 2)}
    </pre>
  );
}

function SummaryBar({ stats }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: 1,
          padding: "10px 14px",
          background: `${s.color}10`,
          border: `1px solid ${s.color}30`,
          borderRadius: 8,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            fontSize: 22, fontWeight: 700, color: s.color,
            fontVariantNumeric: "tabular-nums",
            minWidth: 30, textAlign: "center",
          }}>
            {s.count}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--c-text)" }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function StkReqCard({ req, processColor, onEdit }) {
  const categoryColors = {
    functional:     { bg: "rgba(35, 131, 226, 0.10)", text: "#1E3A8A", border: "rgba(35, 131, 226, 0.30)" },
    non_functional: { bg: "rgba(139, 92, 246, 0.10)", text: "#5B21B6", border: "rgba(139, 92, 246, 0.30)" },
    interface:      { bg: "rgba(16, 185, 129, 0.10)", text: "#065F46", border: "rgba(16, 185, 129, 0.30)" },
    constraint:     { bg: "rgba(245, 158, 11, 0.10)", text: "#92400E", border: "rgba(245, 158, 11, 0.30)" },
  };
  const cc = categoryColors[req.category] || categoryColors.functional;

  const priorityColors = {
    must:   "#DC2626",
    should: "#F59E0B",
    could:  "#6B7280",
  };

  const isModified = req.modified === true;

  return (
    <div style={{
      padding: "12px 14px",
      background: isModified ? "rgba(245, 158, 11, 0.04)" : "#fff",
      border: `1px solid ${isModified ? "rgba(245, 158, 11, 0.30)" : "var(--c-border)"}`,
      borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 8,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          fontFamily: "monospace",
          color: processColor,
          padding: "2px 8px",
          background: `${processColor}15`,
          border: `1px solid ${processColor}30`,
          borderRadius: 4,
        }}>
          {req.id}
        </span>
        <span style={chipStyle(cc.bg, cc.text, cc.border)}>
          {req.category}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: priorityColors[req.priority] || "#6B7280",
          padding: "2px 6px",
          border: `1px solid ${priorityColors[req.priority] || "#6B7280"}50`,
          borderRadius: 4,
          textTransform: "uppercase",
        }}>
          {req.priority}
        </span>
        <span style={{
          fontSize: 10, color: "var(--c-text-muted)",
        }}>
          🔍 {req.verification_method}
        </span>
        {/* Phase 2-2c: 시트 출처 배지 */}
        {req.sheet_source && (
          <span
            title={`시트: ${req.sheet_source}${req.source_row ? `, 행 ${req.source_row}` : ""}${req.source_item_id ? ` (${req.source_item_id})` : ""}`}
            style={{
              fontSize: 10,
              color: "#6940A5",
              padding: "2px 8px",
              background: "rgba(105, 64, 165, 0.08)",
              border: "1px solid rgba(105, 64, 165, 0.25)",
              borderRadius: 4,
              fontFamily: "monospace",
            }}
          >
            📋 {req.sheet_source}
            {req.source_row && <span style={{ opacity: 0.7 }}> · R{req.source_row}</span>}
            {req.source_item_id && <span style={{ opacity: 0.7 }}> · {req.source_item_id}</span>}
          </span>
        )}
        {/* Phase 2-2c: 명세 요청 필요 */}
        {req.clarification_needed && (
          <span
            title="입력이 모호하여 고객 명세 요청 필요"
            style={{
              fontSize: 10, fontWeight: 600,
              color: "#C77D1A",
              padding: "2px 8px",
              background: "rgba(199, 125, 26, 0.10)",
              border: "1px solid rgba(199, 125, 26, 0.30)",
              borderRadius: 10,
            }}
          >
            ❓ 명세 요청
          </span>
        )}
        {isModified && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: "#92400E",
            padding: "2px 8px",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.40)",
            borderRadius: 10,
          }}>
            ✏ 사용자 수정
          </span>
        )}

        {/* 편집 버튼 — 우측 끝 */}
        {onEdit && (
          <button
            onClick={onEdit}
            title="이 요구사항 편집"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--c-border-strong)",
              borderRadius: 4,
              padding: "3px 9px",
              fontSize: 10, fontWeight: 600,
              color: "var(--c-text-soft)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3,
            }}
          >
            ✏ 편집
          </button>
        )}
      </div>

      <div style={{
        fontSize: 13, lineHeight: 1.6, color: "var(--c-text)",
        fontWeight: 500,
      }}>
        {req.statement}
      </div>

      {req.rationale && (
        <div style={{
          fontSize: 11, lineHeight: 1.6,
          color: "var(--c-text-soft)",
          fontStyle: "italic",
          paddingLeft: 10, borderLeft: "2px solid var(--c-border)",
        }}>
          💡 {req.rationale}
        </div>
      )}

      {req.source_doc && (
        <div style={{
          fontSize: 10, color: "var(--c-text-muted)",
          fontFamily: "monospace",
        }}>
          📎 {req.source_doc}
        </div>
      )}
    </div>
  );
}

function UseCaseCard({ uc }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "rgba(35, 131, 226, 0.04)",
      border: "1px solid rgba(35, 131, 226, 0.25)",
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          fontFamily: "monospace",
          color: "#2383E2",
          padding: "2px 8px",
          background: "rgba(35, 131, 226, 0.15)",
          borderRadius: 4,
        }}>
          {uc.id}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{uc.name}</span>
        <span style={{ fontSize: 11, color: "var(--c-text-muted)", marginLeft: "auto" }}>
          👤 {uc.actor}
        </span>
      </div>

      {uc.main_flow?.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Main Flow:</div>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--c-text-soft)" }}>
            {uc.main_flow.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {uc.linked_requirements?.length > 0 && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: "1px solid rgba(35, 131, 226, 0.20)",
          display: "flex", gap: 4, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, color: "var(--c-text-muted)", fontWeight: 600 }}>
            연결 STK_REQ:
          </span>
          {uc.linked_requirements.map(id => (
            <span key={id} style={{
              fontSize: 10, fontFamily: "monospace",
              color: "#1E3A8A",
              padding: "1px 6px",
              background: "rgba(35, 131, 226, 0.10)",
              borderRadius: 3,
            }}>
              {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TraceabilityRow({ label, items, color }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, color, marginBottom: 6,
      }}>
        {label} → STK_REQ
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 4,
        fontFamily: "monospace", fontSize: 10,
        color: "var(--c-text-soft)",
        paddingLeft: 14, borderLeft: `2px solid ${color}40`,
      }}>
        {items.map((item, i) => (
          <div key={i}>{item}</div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 10,
      }}>
        <h3 style={{
          fontSize: 12, fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--c-text-muted)",
          margin: 0,
        }}>
          {title}
        </h3>
        {count != null && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: "var(--c-text)",
            background: "var(--c-bg-mid)",
            padding: "1px 7px",
            borderRadius: 8,
            fontVariantNumeric: "tabular-nums",
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function chipStyle(bg, color, border) {
  return {
    fontSize: 10, fontWeight: 600,
    color,
    padding: "2px 8px",
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 10,
  };
}

// ──────────────────────────────────────────────────
// 다운로드 메뉴 항목 (Phase 2-2b STEP C-3a)
// ──────────────────────────────────────────────────
function DownloadMenuItem({ icon, title, desc, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: primary ? "rgba(30, 39, 97, 0.04)" : "transparent",
        border: "none",
        padding: "10px 14px",
        cursor: "pointer",
        borderBottom: "1px solid var(--c-border)",
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg-soft)'}
      onMouseLeave={e => e.currentTarget.style.background = primary ? 'rgba(30, 39, 97, 0.04)' : 'transparent'}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: primary ? "var(--c-navy-deep)" : "var(--c-text)",
          }}>
            {title}
            {primary && <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 700,
              padding: '1px 5px', borderRadius: 3,
              background: 'var(--c-navy-deep)', color: '#fff',
            }}>추천</span>}
          </div>
          <div style={{ fontSize: 10, color: "var(--c-text-muted)", marginTop: 1 }}>{desc}</div>
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Phase 2-2c: 그룹별 표시 + Coverage Matrix
// ────────────────────────────────────────────────────────────────

// STK_REQ를 group 필드 기준으로 묶기 (Map 보존하여 입력 순서 유지)
function groupByGroupName(stkReqs) {
  const map = new Map();
  for (const req of stkReqs) {
    const key = req.group || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(req);
  }
  return map;
}

// Phase 2-2c: 그룹별 STK_REQ 섹션
function GroupSection({ groupName, reqs, processColor, onEditStkReq }) {
  const [collapsed, setCollapsed] = useState(false);
  const displayName = groupName || "기타";
  const sheetSources = Array.from(new Set(reqs.map(r => r.sheet_source).filter(Boolean)));

  return (
    <div style={{
      border: "1px solid var(--c-border, #E8E5E0)",
      borderRadius: 10,
      overflow: "hidden",
      background: "#fff",
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: `linear-gradient(to right, ${processColor}10, transparent)`,
          borderBottom: collapsed ? "none" : "1px solid var(--c-border, #E8E5E0)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 10,
            transform: collapsed ? "rotate(-90deg)" : "rotate(0)",
            transition: "transform 0.15s",
            color: "var(--c-text-muted, #9B9A97)",
          }}>▼</span>
          <span style={{
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: 13,
            color: processColor,
            letterSpacing: "0.02em",
          }}>
            {displayName}
          </span>
          <span style={{
            fontSize: 11,
            color: "var(--c-text-muted, #9B9A97)",
            fontWeight: 600,
          }}>
            {reqs.length}개
          </span>
          {sheetSources.length > 0 && (
            <span style={{
              fontSize: 10,
              color: "var(--c-text-soft, #6B6B6B)",
              fontStyle: "italic",
            }}>
              · {sheetSources.join(", ")}
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {reqs.map(req => (
            <StkReqCard
              key={req.id}
              req={req}
              processColor={processColor}
              onEdit={onEditStkReq ? () => onEditStkReq(req) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Phase 2-2c: Coverage Matrix 표시
function CoverageMatrixView({ matrix, processColor }) {
  const { by_group = [], summary } = matrix || {};
  if (!summary) return null;

  const statusConfig = {
    compliant: {
      label: "✓ 스펙 보존 양호",
      color: "#0F7B6C",
      bg: "rgba(15, 123, 108, 0.08)",
      border: "rgba(15, 123, 108, 0.30)",
    },
    spec_loss: {
      label: "⚠ 스펙 손실 감지",
      color: "#E03E3E",
      bg: "rgba(224, 62, 62, 0.08)",
      border: "rgba(224, 62, 62, 0.30)",
    },
    over_decomposed: {
      label: "⚠ 과도한 분리",
      color: "#C77D1A",
      bg: "rgba(199, 125, 26, 0.08)",
      border: "rgba(199, 125, 26, 0.30)",
    },
  };
  const sc = statusConfig[summary.status] || statusConfig.compliant;

  return (
    <Section title="📊 Coverage Matrix (스펙 보존 검증)" count={by_group.length}>
      <div style={{
        padding: "10px 12px",
        background: sc.bg,
        border: `1px solid ${sc.border}`,
        borderRadius: 6,
        marginBottom: 10,
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: sc.color,
          }}>
            {sc.label}
          </span>
          <div style={{
            display: "flex",
            gap: 16,
            fontSize: 11,
            color: "var(--c-text-soft, #6B6B6B)",
          }}>
            <span>입력 행: <strong style={{ color: "var(--c-text, #37352F)" }}>{summary.total_input_rows}</strong></span>
            <span>STK_REQ: <strong style={{ color: "var(--c-text, #37352F)" }}>{summary.total_stk_reqs}</strong></span>
            <span>비율: <strong style={{ color: sc.color }}>{Number(summary.overall_ratio).toFixed(3)}</strong></span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--c-text-soft, #6B6B6B)", marginTop: 6, lineHeight: 1.6 }}>
          {summary.status === "compliant" && "고객 입력이 STK_REQ로 적절히 보존되었습니다 (비율 1.0 ~ 1.3 범위)."}
          {summary.status === "spec_loss" && "⚠️ 일부 고객 입력이 STK_REQ로 변환되지 않았습니다. ASPICE 평가관 지적 위험이 있습니다."}
          {summary.status === "over_decomposed" && "⚠️ 입력 대비 STK_REQ가 너무 많이 생성되었습니다. 일부는 발명되었을 가능성이 있습니다."}
        </div>
      </div>

      {by_group.length > 0 && (
        <div style={{
          border: "1px solid var(--c-border, #E8E5E0)",
          borderRadius: 6,
          overflow: "hidden",
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ background: "var(--c-bg-soft, #F7F7F5)" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>그룹</th>
                <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>시트</th>
                <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>입력 행</th>
                <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>STK_REQ</th>
                <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>비율</th>
                <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--c-border, #E8E5E0)", fontWeight: 600 }}>누락</th>
              </tr>
            </thead>
            <tbody>
              {by_group.map((g, i) => {
                const ratio = Number(g.ratio || 0);
                const hasUnmapped = (g.unmapped_input_rows || []).length > 0;
                const ratioColor =
                  ratio < 1.0 ? "#E03E3E" :
                  ratio > 1.3 ? "#C77D1A" :
                  "#0F7B6C";
                return (
                  <tr key={i} style={{ borderBottom: i === by_group.length - 1 ? "none" : "1px solid var(--c-border, #E8E5E0)" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600, color: processColor }}>{g.group || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--c-text-soft, #6B6B6B)" }}>{g.sheet_source || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.input_rows}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.derived_stk_reqs}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: ratioColor, fontWeight: 600 }}>{ratio.toFixed(3)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      {hasUnmapped ? (
                        <span style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: "rgba(224, 62, 62, 0.10)",
                          color: "#E03E3E",
                          borderRadius: 3,
                          fontWeight: 600,
                        }}>
                          {g.unmapped_input_rows.length}개
                        </span>
                      ) : (
                        <span style={{ color: "var(--c-text-muted, #9B9A97)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// src/components/GeneratedArtifactView.jsx — Phase 2-2b STEP C-2
//
// 화면설계서 v260506 SCR-05 (확장):
//   AI 생성이 완료된 후, 생성된 산출물을 메인 화면에 시각적으로 표시
//   상단 액션 영역에 사용자 제어 버튼 (Rationale 보기 / QA 검토 시작)
//
// Phase 2-2b STEP C-2 변경:
//   - 상단 액션 영역 신규 — [📊 Rationale 보기] [🔍 QA 검토 시작]
//   - canQAReview, hasEvaluator, evaluating props 지원
//   - Phase 2-2a 기존 표시 (통계 바, STK_REQ 카드, Use Case, Operational Context, Traceability Seeds) 유지

import { useState } from "react";

export default function GeneratedArtifactView({
  aiGenerated,
  processColor,
  onReopenPanel,
  onQAReview,
  canQAReview,
  hasEvaluator,
  evaluating,
  onEditStkReq,   // 신규: STK_REQ 카드 편집 핸들러 (req => void)
}) {
  const [view, setView] = useState("structured"); // 'structured' | 'json'

  if (!aiGenerated) return null;

  const stkReqs = aiGenerated.stakeholder_requirements || [];
  const useCases = aiGenerated.use_cases || [];
  const opContext = aiGenerated.operational_context || {};
  const traceSeeds = aiGenerated.traceability_seeds || {};

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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        />
      ) : (
        <JsonView aiGenerated={aiGenerated} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// 구조화 보기
// ──────────────────────────────────────────────────
function StructuredView({ stkReqs, useCases, opContext, traceSeeds, processColor, onEditStkReq }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SummaryBar
        stats={[
          { label: "STK_REQ", count: stkReqs.length, color: processColor },
          { label: "Use Case", count: useCases.length, color: "#2383E2" },
          { label: "법규/표준", count: opContext.regulatory_constraints?.length || 0, color: "#F59E0B" },
          { label: "외부 IF", count: opContext.external_interfaces?.length || 0, color: "#10B981" },
        ]}
      />

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

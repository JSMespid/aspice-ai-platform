// 범용 프로세스 화면 — SYS.1~5 모두 이 컴포넌트로 동작
// processConfig 만 주입받아 동적으로 렌더링
import { useState, useEffect } from "react";
import { T, Card, Btn, Badge, Textarea, Spinner } from "./ui.jsx";
import { generateWorkProduct, runQAPipeline, buildRationaleReport } from "../lib/llm.js";
import { transition, STATES, toLegacyStatus } from "../lib/state-machine.js";
import { FivePhaseProgress } from "./FivePhaseProgress.jsx";
import { RationaleReport } from "./RationaleReport.jsx";
import { StateMachineView } from "./StateMachineView.jsx";
import { PROCESSES, getPreviousProcessIds } from "../config/processes.js";

export function ProcessPage({ processId, project, prevWorkProducts, onSave }) {
  const processConfig = PROCESSES[processId];
  if (!processConfig) return <div>Unknown process: {processId}</div>;

  // ── State ────────────────────────────────────────
  const [context, setContext] = useState("");
  const [output, setOutput] = useState(null);
  const [genMetadata, setGenMetadata] = useState(null);
  const [qaResult, setQaResult] = useState(null);
  const [qaProgress, setQaProgress] = useState({});
  const [stateMachineState, setStateMachineState] = useState("INITIAL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role] = useState("Engineer"); // 데모용 — 실제로는 인증에서 가져옴

  // 이전 단계 산출물 자동 주입
  const prevContents = {};
  for (const depId of getPreviousProcessIds(processId)) {
    const wp = prevWorkProducts.find(w => w.process_id === depId && w.state === "APPROVED");
    if (wp) prevContents[depId] = wp.content;
  }
  const missingDeps = getPreviousProcessIds(processId).filter(id => !prevContents[id]);

  // ── 액션 ─────────────────────────────────────────
  async function handleGenerate() {
    if (missingDeps.length > 0) {
      setError(`이전 단계 미승인: ${missingDeps.join(", ")} — 해당 프로세스를 먼저 승인하세요.`);
      return;
    }

    setBusy(true); setError("");
    advance("START_GENERATION");

    try {
      const result = await generateWorkProduct({
        processConfig, projectInfo: project, context, prevContents,
      });
      setOutput(result.output);
      setGenMetadata(result.metadata);
      advance("GENERATION_COMPLETE");
    } catch (e) {
      setError(`생성 실패: ${e.message}`);
      setStateMachineState("INITIAL");
    }
    setBusy(false);
  }

  async function handleVerify() {
    if (!output) return;
    setBusy(true); setError(""); setQaProgress({});
    advance("START_VERIFICATION");

    try {
      const result = await runQAPipeline({
        output, processConfig, prevContents,
        onProgress: ({ phase, status, issueCount, duration }) => {
          setQaProgress(prev => ({
            ...prev,
            [phase]: status,
            [`${phase}_result`]: { issueCount, duration },
          }));
        },
      });
      setQaResult(result);
      advance("VERIFICATION_COMPLETE");
    } catch (e) {
      setError(`QA 검증 실패: ${e.message}`);
    }
    setBusy(false);
  }

  function advance(event) {
    const result = transition(stateMachineState, event, role, { qa_result: qaResult });
    if (result.ok) {
      setStateMachineState(result.nextState);
    } else {
      setError(`상태 전이 실패: ${result.reason}`);
    }
  }

  function handleSubmitForApproval() {
    advance("SUBMIT_FOR_APPROVAL");
  }

  async function handleApproveOrReject(event) {
    const reviewer = "Reviewer"; // 데모: 역할 토글
    const result = transition(stateMachineState, event, reviewer, { qa_result: qaResult });
    if (!result.ok) {
      setError(`전이 실패: ${result.reason}`);
      return;
    }
    setStateMachineState(result.nextState);

    // 승인 시 DB 저장
    if (result.nextState === "APPROVED" && onSave) {
      await onSave({
        process_id: processId,
        content: output,
        qa_result: qaResult,
        rationale: buildRationaleReport({
          generationMetadata: genMetadata,
          qaResult,
          processConfig,
        }),
        state: result.nextState,
        legacy_status: toLegacyStatus(result.nextState),
      });
    }
  }

  // ── 렌더링 ───────────────────────────────────────
  const config = processConfig;
  const phaseResults = qaResult?.phase_results;
  const rationale = (genMetadata && qaResult)
    ? buildRationaleReport({ generationMetadata: genMetadata, qaResult, processConfig })
    : (genMetadata ? buildRationaleReport({ generationMetadata: genMetadata, qaResult: null, processConfig }) : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
      {/* ── 상단 헤더 ──────────────────────────────── */}
      <Card style={{ padding: 18, borderLeft: `4px solid ${config.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: config.color + "15", color: config.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700,
          }}>{config.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginBottom: 2 }}>
              {config.id}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: config.color }}>
              {config.label}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {config.desc}
            </div>
          </div>
          <CurrentStateBadge state={stateMachineState} />
        </div>

        {missingDeps.length > 0 && (
          <div style={{
            marginTop: 12, padding: "8px 12px",
            background: T.amberDim, border: `1px solid ${T.amberBorder}`,
            borderRadius: 8, fontSize: 12, color: T.amber,
          }}>
            ⚠ 이전 단계 미승인: <strong>{missingDeps.join(", ")}</strong> — 해당 프로세스를 먼저 승인하세요.
          </div>
        )}
      </Card>

      {/* ── 메인 콘텐츠 (좌: 입력+출력 / 우: Rationale) ─ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}
           className="process-page-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 1) 입력 영역 */}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              1. 입력 컨텍스트
            </div>
            {Object.keys(prevContents).length > 0 && (
              <div style={{
                marginBottom: 10, padding: "6px 10px",
                background: config.color + "10",
                border: `1px solid ${config.color}30`, borderRadius: 6,
                fontSize: 11, color: T.muted,
              }}>
                ⟳ <strong style={{ color: config.color }}>이전 단계 자동 주입</strong>:{" "}
                {Object.keys(prevContents).join(", ")}
              </div>
            )}
            <Textarea
              value={context}
              onChange={setContext}
              placeholder={config.inputPlaceholder}
              rows={5}
              disabled={stateMachineState !== "INITIAL" && stateMachineState !== "CHANGES_REQUESTED"}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn
                onClick={handleGenerate}
                disabled={busy || (stateMachineState !== "INITIAL" && stateMachineState !== "CHANGES_REQUESTED") || missingDeps.length > 0}
                style={{ background: config.color, borderColor: config.color }}
              >
                ⚡ {config.id} AI 생성 시작 (Claude)
              </Btn>
            </div>
            {busy && stateMachineState === "GENERATING" && <Spinner text="Claude 생성 중..." />}
          </Card>

          {/* 2) QA 5-Phase 진행 */}
          {(stateMachineState !== "INITIAL" && stateMachineState !== "GENERATING") && (
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  2. QA 검증 (Gemini · 5-Phase)
                </div>
                {stateMachineState === "GENERATED" && (
                  <Btn size="sm" onClick={handleVerify} disabled={busy}
                       style={{ background: T.amber, borderColor: T.amber }}>
                    ▶ 5-Phase 검증 시작
                  </Btn>
                )}
              </div>
              {(stateMachineState === "VERIFYING" || stateMachineState === "VERIFIED" || qaResult) && (
                <FivePhaseProgress progress={qaProgress} phaseResults={phaseResults} />
              )}
              {qaResult && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                  <QASummary qaResult={qaResult} />
                </div>
              )}
            </Card>
          )}

          {/* 3) 산출물 표시 */}
          {output && (
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                3. 생성된 산출물
                <span style={{ marginLeft: 8, fontSize: 11, color: T.muted, fontWeight: 400 }}>
                  {config.summary(output)}
                </span>
              </div>
              <DisplayItems output={output} processConfig={config} qaIssues={qaResult?.issues} />
            </Card>
          )}

          {/* 4) HITL State Machine + 액션 */}
          {output && (
            <StateMachineView
              currentState={stateMachineState}
              role={role}
              workProduct={{ qa_result: qaResult }}
              onEvent={(event) => {
                if (event === "SUBMIT_FOR_APPROVAL") handleSubmitForApproval();
                else if (["APPROVE", "REJECT", "REQUEST_CHANGES"].includes(event)) handleApproveOrReject(event);
                else advance(event);
              }}
            />
          )}

          {error && (
            <div style={{
              padding: "10px 14px", background: T.redDim, border: `1px solid ${T.redBorder}`,
              borderRadius: 8, fontSize: 12, color: T.red,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* 우측: Rationale Report (sticky) */}
        <div style={{ position: "sticky", top: 16 }}>
          {rationale ? <RationaleReport rationale={rationale} /> : (
            <div style={{
              padding: 24, background: T.surface2, border: `1px dashed ${T.border}`,
              borderRadius: 12, textAlign: "center", color: T.muted, fontSize: 12,
            }}>
              생성을 시작하면 이곳에<br/>Rationale Report가 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 헬퍼 컴포넌트 ───────────────────────────────────

function CurrentStateBadge({ state }) {
  const def = STATES[state];
  if (!def) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 16,
      background: def.color + "15", color: def.color,
      fontSize: 11, fontWeight: 700,
      border: `1px solid ${def.color}40`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: def.color }}></div>
      {def.label}
    </div>
  );
}

function QASummary({ qaResult }) {
  const s = qaResult.summary;
  const r = qaResult.recommendation;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        <ScoreBadge score={qaResult.score} />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          <SevCard label="Critical" count={s.critical} color={T.red} />
          <SevCard label="Major" count={s.major} color={T.amber} />
          <SevCard label="Minor" count={s.minor} color={T.amber} />
          <SevCard label="Info" count={s.info} color={T.accent} />
        </div>
      </div>
      <div style={{
        padding: "8px 12px", borderRadius: 6,
        background: r.includes("승인") ? T.greenDim : (r.includes("반려") ? T.redDim : T.amberDim),
        fontSize: 11, color: r.includes("승인") ? T.green : (r.includes("반려") ? T.red : T.amber),
        fontWeight: 600,
      }}>
        권고: {r}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const color = score >= 90 ? T.green : (score >= 70 ? T.amber : T.red);
  return (
    <div style={{
      width: 80, padding: "10px 0", textAlign: "center",
      background: color + "15", border: `1px solid ${color}40`, borderRadius: 8,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {score}
      </div>
      <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>점수</div>
    </div>
  );
}

function SevCard({ label, count, color }) {
  return (
    <div style={{
      textAlign: "center", padding: "8px 4px",
      background: count > 0 ? color + "15" : T.surface2,
      border: `1px solid ${count > 0 ? color + "40" : T.border}`, borderRadius: 6,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: count > 0 ? color : T.muted,
                    fontVariantNumeric: "tabular-nums" }}>{count}</div>
      <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DisplayItems({ output, processConfig, qaIssues }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(processConfig.displayItems ?? []).map(item => (
        <ItemTable
          key={item.key}
          label={item.label}
          rows={output[item.key] ?? []}
          columns={item.columns}
          qaIssues={qaIssues}
        />
      ))}
    </div>
  );
}

function ItemTable({ label, rows, columns, qaIssues }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>
        {label} <span style={{ color: T.muted, fontWeight: 400 }}>({rows.length})</span>
      </div>
      <div style={{
        border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          background: T.surface2, padding: "8px 12px",
          fontSize: 10, fontWeight: 600, color: T.muted,
          textTransform: "uppercase", letterSpacing: "0.05em",
          gap: 8,
        }}>
          {columns.map(c => <div key={c}>{formatColumnHeader(c)}</div>)}
        </div>
        {rows.map((row, i) => {
          const rowIssues = (qaIssues ?? []).filter(iss =>
            iss.location?.includes(row.id) || iss.location?.includes(`[${i}]`)
          );
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
              padding: "8px 12px", fontSize: 11,
              borderTop: `1px solid ${T.border}`,
              gap: 8,
              background: rowIssues.some(x => x.severity === "Critical") ? T.redDim
                        : rowIssues.some(x => x.severity === "Major") ? T.amberDim
                        : i % 2 === 0 ? T.surface : T.surface2,
            }}>
              {columns.map(c => (
                <div key={c} style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontFamily: c === "id" ? "JetBrains Mono, monospace" : "inherit",
                  fontWeight: c === "id" ? 600 : 400,
                  color: c === "id" ? T.accent : T.text,
                }}>
                  {formatCell(row[c], c)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatColumnHeader(c) {
  return c.replace(/_/g, " ");
}

function formatCell(value, key) {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    if (value.interface_id) return value.interface_id;
    return JSON.stringify(value).slice(0, 40);
  }
  return String(value);
}

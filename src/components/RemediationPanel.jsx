// SCR-12 — QA 시정조치 (Remediation) 패널
// Phase 3-1: 생성 → QA → [시정조치: 사람 ⊕ AI] → 재QA → 승인 루프의 UI
//
// 흐름 (HITL 유지):
//   1. 최신 QA 이슈 목록 로드 → 이슈 카드 체크박스로 선택
//      - 항목(STK_REQ) 이슈: 대상 ID 편집 가능 (evidence 에서 자동 추출)
//      - coverage_matrix 이슈: 그룹 + 제외 행 입력 (결정론적 보정, Claude 미호출)
//   2. [AI 시정조치] → POST /api/remediate {action:'propose'} → diff 카드
//   3. diff 검토 후 건별 선택 → [선택 승인] (decide)
//   4. [리비전 반영] (apply) → ai_generations 에 remediator 리비전 적층,
//      work_products.content.ai_generated 갱신 (원본 불변)
//   5. [재QA 실행] → /api/evaluate 에 리비전 출력 전송 → 새 verdict/score 표시
//
// 모든 변경은 remediation_changes 테이블에 {수정자, 대상, 전/후, 이슈, 사유, 시각}
// 으로 기록됨 — SUP.1/SUP.10 심사 증빙. [이력] 탭에서 조회.

import { useEffect, useState } from "react";

async function api(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

// evidence 텍스트에서 STK_REQ ID 들 추출 (대상 ID 자동 채움)
function extractStkIds(text) {
  if (!text) return [];
  const ids = String(text).match(/STK_REQ_[A-Z0-9_]+_\d{3}/g) || [];
  return [...new Set(ids)];
}
// evidence 에서 [93, 94, 95, 96] 형태의 행 목록 추출 (coverage 제외 행 자동 채움)
function extractRows(text) {
  if (!text) return "";
  const m = String(text).match(/\[\s*(\d{1,4}(?:\s*,\s*\d{1,4})+)\s*\]/);
  return m ? m[1].replace(/\s+/g, "") : "";
}
// issue 텍스트에서 "XXX 그룹" 패턴으로 그룹명 추출
function extractGroup(text) {
  const m = String(text || "").match(/([A-Z][A-Z0-9]{1,15})\s*그룹/);
  return m ? m[1] : "";
}

const SEV_COLOR = {
  CRITICAL: { bg: "#FEE2E2", border: "#FCA5A5", text: "#B91C1C" },
  HIGH:     { bg: "#FEF3C7", border: "#FCD34D", text: "#B45309" },
  MEDIUM:   { bg: "#E0E7FF", border: "#A5B4FC", text: "#3730A3" },
  LOW:      { bg: "#F3F4F6", border: "#D1D5DB", text: "#374151" },
};
function sevStyle(sev) {
  return SEV_COLOR[String(sev || "").toUpperCase()] || SEV_COLOR.LOW;
}

export default function RemediationPanel({
  open, onClose, project, processId, workProductId, onApplied,
}) {
  // 컨텍스트
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [baseGen, setBaseGen] = useState(null);       // 시정조치 기준 generation (최신 리비전 또는 master)
  const [evaluation, setEvaluation] = useState(null); // 최신 evaluator (critique)
  const [history, setHistory] = useState([]);         // remediation_changes 이력
  // 이슈 선택 상태
  const [sel, setSel] = useState({});       // { [issueIndex]: { checked, targetIdsText, covGroup, covRows, covReason } }
  // 단계 상태
  const [busy, setBusy] = useState("");     // '', 'propose', 'decide', 'apply', 'requa'
  const [proposal, setProposal] = useState(null);   // propose 응답
  const [diffChecked, setDiffChecked] = useState({});// { [change_id]: bool }
  const [applied, setApplied] = useState(null);     // apply 응답
  const [requaResult, setRequaResult] = useState(null); // 재QA 응답
  const [tab, setTab] = useState("issues"); // 'issues' | 'history'

  // 열릴 때마다 컨텍스트 로드 + 단계 초기화
  useEffect(() => {
    if (!open || !workProductId) return;
    let cancelled = false;
    setProposal(null); setApplied(null); setRequaResult(null);
    setDiffChecked({}); setSel({}); setBusy(""); setLoadError("");
    setLoading(true);
    (async () => {
      try {
        // 1. 기준 generation: 최신 remediator 리비전이 있으면 그것, 없으면 generator master
        let base = null;
        try {
          const r = await api(`/api/ai-generations?work_product_id=${encodeURIComponent(workProductId)}&agent_role=remediator&limit=1`);
          if (r.success && r.results?.length) base = r.results[0];
        } catch { /* remediator 없음 — 무시 */ }
        if (!base) {
          const g = await api(`/api/ai-generations?work_product_id=${encodeURIComponent(workProductId)}&agent_role=generator&limit=1`);
          if (g.success && g.results?.length) base = g.results[0];
        }
        if (!base) throw new Error("AI 생성 결과가 없습니다. 먼저 [⚡ AI 생성]을 실행하세요.");

        // 2. 최신 evaluator critique
        const e = await api(`/api/ai-generations?work_product_id=${encodeURIComponent(workProductId)}&agent_role=evaluator&limit=1`);
        const evalRow = (e.success && e.results?.length) ? e.results[0] : null;
        if (!evalRow?.parsed_output?.issues) {
          throw new Error("QA 검토 결과가 없습니다. 먼저 [QA 검토]를 실행하세요.");
        }

        // 3. 변경 이력
        let hist = [];
        try {
          const h = await api(`/api/remediate?generation_id=${base.id}`);
          hist = h.changes || [];
        } catch { /* 이력 없음 */ }

        if (cancelled) return;
        setBaseGen(base);
        setEvaluation(evalRow);
        setHistory(hist);

        // 이슈별 선택 상태 초기화 (evidence 기반 자동 채움)
        const init = {};
        (evalRow.parsed_output.issues || []).forEach((iss, i) => {
          const isCoverage = iss.target_id === "coverage_matrix" || !iss.target_id;
          const evidenceText = `${iss.evidence || ""} ${iss.issue || ""} ${iss.suggested_fix || ""}`;
          init[i] = isCoverage
            ? {
                checked: false, isCoverage: true,
                covGroup: extractGroup(evidenceText),
                covRows: extractRows(evidenceText),
                covReason: "비요구사항(메타/N-A) 행으로 확인되어 input_rows 계산에서 제외 — QA evidence 및 원본 검토 기반",
              }
            : {
                checked: false, isCoverage: false,
                targetIdsText: extractStkIds(`${iss.target_id || ""} ${evidenceText}`).join(", "),
              };
        });
        setSel(init);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workProductId]);

  if (!open) return null;

  const issues = evaluation?.parsed_output?.issues || [];
  const verdict = evaluation?.parsed_output?.verdict;
  const score = evaluation?.parsed_output?.overall_score;
  const checkedCount = Object.values(sel).filter(s => s?.checked).length;

  // ── 2단계: AI 시정조치 (propose) ──────────────────────────
  async function handlePropose() {
    const selections = [];
    for (const [idxStr, s] of Object.entries(sel)) {
      if (!s?.checked) continue;
      const issue_index = Number(idxStr);
      if (s.isCoverage) {
        const rows = String(s.covRows || "").split(",").map(x => parseInt(x.trim(), 10)).filter(Number.isInteger);
        if (!s.covGroup || rows.length === 0) {
          alert(`이슈 #${issue_index + 1}: coverage 보정에는 그룹명과 제외 행 목록이 필요합니다.`);
          return;
        }
        selections.push({
          issue_index,
          coverage_fix: { group: s.covGroup.trim(), exclude_rows: rows, exclusion_reason: s.covReason || undefined },
        });
      } else {
        const ids = String(s.targetIdsText || "").split(",").map(x => x.trim()).filter(Boolean);
        selections.push(ids.length > 0 ? { issue_index, target_ids: ids } : { issue_index });
      }
    }
    if (selections.length === 0) { alert("시정조치할 이슈를 선택하세요."); return; }

    setBusy("propose");
    setProposal(null); setApplied(null); setRequaResult(null);
    try {
      const r = await api("/api/remediate", "POST", {
        action: "propose",
        generation_id: baseGen.id,
        evaluation_id: evaluation.id,
        selections,
      });
      setProposal(r);
      // diff 전건 기본 체크 (검토 후 해제 가능)
      const dc = {};
      (r.diffs || []).forEach(d => { if (d.change_id) dc[d.change_id] = true; });
      setDiffChecked(dc);
    } catch (e) {
      alert(`AI 시정조치 실패: ${e.message}`);
    }
    setBusy("");
  }

  // ── 3단계: 승인/거절 (decide) + 4단계: 반영 (apply) ───────
  async function handleApproveAndApply() {
    const approveIds = Object.entries(diffChecked).filter(([, v]) => v).map(([k]) => k);
    const rejectIds = (proposal?.diffs || []).map(d => d.change_id).filter(id => id && !diffChecked[id]);
    if (approveIds.length === 0) { alert("승인할 수정안을 선택하세요."); return; }

    setBusy("decide");
    try {
      await api("/api/remediate", "POST", { action: "decide", decision: "approved", change_ids: approveIds });
      if (rejectIds.length > 0) {
        await api("/api/remediate", "POST", { action: "decide", decision: "rejected", change_ids: rejectIds });
      }
      setBusy("apply");
      const r = await api("/api/remediate", "POST", { action: "apply", generation_id: baseGen.id });
      setApplied(r);
      if (onApplied) await onApplied(); // wp.content 갱신됨 → 화면 새로고침
    } catch (e) {
      alert(`반영 실패: ${e.message}`);
    }
    setBusy("");
  }

  // ── 5단계: 재QA ───────────────────────────────────────────
  async function handleReQA() {
    if (!applied?.parsed_output) return;
    setBusy("requa");
    try {
      const r = await api("/api/evaluate", "POST", {
        ai_generation_id: applied.revision_generation_id,
        generated_output: applied.parsed_output,
        process_id: processId,
        project_id: project?.id,
        work_product_id: workProductId,
      });
      setRequaResult(r);
    } catch (e) {
      alert(`재QA 실패: ${e.message}`);
    }
    setBusy("");
  }

  // ── 렌더 ──────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15, 24, 56, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 860, maxHeight: "92vh",
        background: "#fff", borderRadius: 12, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--c-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--c-text-muted)", letterSpacing: "0.06em" }}>
              SCR-12 · QA REMEDIATION
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-navy-deep)" }}>
              🔧 AI 시정조치 — {processId}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {evaluation && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 12,
                background: verdict === "approved" ? "#D1FAE5" : "#FEE2E2",
                color: verdict === "approved" ? "#065F46" : "#B91C1C",
              }}>
                현재 QA: {verdict === "approved" ? "승인" : "반려"} · {Math.round((score || 0) * 100)}점
              </span>
            )}
            <button onClick={() => busy === "" && onClose()} style={{
              background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--c-text-muted)",
            }}>✕</button>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, padding: "10px 22px 0", borderBottom: "1px solid var(--c-border)" }}>
          {[["issues", `이슈 선택 (${issues.length})`], ["history", `시정조치 이력 (${history.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 14px", fontSize: 12, fontWeight: 600,
              background: "none", cursor: "pointer",
              border: "none", borderBottom: tab === k ? "2px solid var(--c-navy-deep)" : "2px solid transparent",
              color: tab === k ? "var(--c-navy-deep)" : "var(--c-text-muted)",
            }}>{label}</button>
          ))}
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          {loading && <div style={{ fontSize: 13, color: "var(--c-text-muted)", padding: 30, textAlign: "center" }}>불러오는 중...</div>}
          {loadError && (
            <div style={{ padding: "10px 12px", background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 12, color: "#B91C1C" }}>
              {loadError}
            </div>
          )}

          {/* ── 이력 탭 ── */}
          {!loading && !loadError && tab === "history" && (
            history.length === 0
              ? <div style={{ fontSize: 12, color: "var(--c-text-muted)", padding: 20, textAlign: "center" }}>이 기준 버전에 대한 시정조치 이력이 없습니다.</div>
              : history.map(ch => (
                <div key={ch.id} style={{ border: "1px solid var(--c-border)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ color: "var(--c-navy-deep)" }}>{ch.target_stk_req_id}</strong>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: ch.status === "applied" ? "#D1FAE5" : ch.status === "rejected" ? "#FEE2E2" : "#FEF3C7",
                      color: ch.status === "applied" ? "#065F46" : ch.status === "rejected" ? "#B91C1C" : "#92400E",
                    }}>{ch.status} · {ch.actor}</span>
                  </div>
                  <div style={{ color: "var(--c-text-soft)", lineHeight: 1.5 }}>{ch.reason}</div>
                  <div style={{ fontSize: 10, color: "var(--c-text-muted)", marginTop: 4 }}>
                    v{(ch.revision_no || 0) + 1} · {new Date(ch.created_at).toLocaleString()}
                  </div>
                </div>
              ))
          )}

          {/* ── 이슈 선택 탭 ── */}
          {!loading && !loadError && tab === "issues" && (
            <>
              {baseGen && (
                <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginBottom: 12 }}>
                  기준 버전: {baseGen.agent_role === "remediator" ? `시정조치 v${(baseGen.attempt_number || 0) + 1} 리비전` : "AI 원본 (master)"} · {String(baseGen.id).slice(0, 8)}…
                  — AI 원본은 불변이며, 수정은 새 리비전으로 적층됩니다.
                </div>
              )}

              {/* 1단계: 이슈 카드 + 체크박스 */}
              {!proposal && issues.map((iss, i) => {
                const s = sel[i] || {};
                const c = sevStyle(iss.severity);
                return (
                  <div key={i} style={{
                    border: `1px solid ${s.checked ? "var(--c-navy-deep)" : "var(--c-border)"}`,
                    borderLeft: `4px solid ${c.border}`,
                    borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                    background: s.checked ? "#F7F9FC" : "#fff",
                  }}>
                    <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={!!s.checked}
                        onChange={(e) => setSel(p => ({ ...p, [i]: { ...p[i], checked: e.target.checked } }))}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: c.bg, color: c.text }}>
                            {iss.severity}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--c-text-muted)" }}>{iss.category}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-navy-deep)", fontFamily: "monospace" }}>
                            → {iss.target_id || "coverage_matrix"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--c-text-soft)", lineHeight: 1.55 }}>{iss.issue}</div>
                      </div>
                    </label>

                    {/* 선택 시 상세 입력 */}
                    {s.checked && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--c-border)", paddingLeft: 24 }}>
                        {s.isCoverage ? (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--c-navy-deep)", marginBottom: 6 }}>
                              📐 Coverage 보정 (결정론적 — AI 호출 없음, 비용 0)
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <MiniInput label="그룹" value={s.covGroup} width={110}
                                onChange={v => setSel(p => ({ ...p, [i]: { ...p[i], covGroup: v } }))} />
                              <MiniInput label="제외 행 (쉼표 구분)" value={s.covRows} width={220}
                                onChange={v => setSel(p => ({ ...p, [i]: { ...p[i], covRows: v } }))} />
                            </div>
                            <MiniInput label="제외 사유 (심사 증빙에 기록)" value={s.covReason} full
                              onChange={v => setSel(p => ({ ...p, [i]: { ...p[i], covReason: v } }))} />
                          </>
                        ) : (
                          <MiniInput label="수정 대상 STK_REQ ID (쉼표 구분 — evidence 에서 자동 추출됨, 편집 가능)"
                            value={s.targetIdsText} full
                            onChange={v => setSel(p => ({ ...p, [i]: { ...p[i], targetIdsText: v } }))} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2단계 결과: diff 카드 + 승인 선택 */}
              {proposal && (
                <>
                  <div style={{
                    padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE",
                    borderRadius: 8, fontSize: 12, color: "#1E40AF", marginBottom: 12,
                  }}>
                    수정안 {proposal.proposed_count}건 생성됨
                    {proposal.meta?.claude_called
                      ? ` (Claude 호출 · $${(proposal.meta.cost_usd || 0).toFixed(3)})`
                      : " (결정론적 보정 — 비용 0)"}
                    {proposal.skipped?.length > 0 && ` · 건너뜀 ${proposal.skipped.length}건`}
                    — 아래에서 검토 후 반영할 건을 선택하세요. (선택 해제 = 거절)
                  </div>

                  {(proposal.diffs || []).map(d => (
                    <div key={d.change_id} style={{
                      border: `1px solid ${diffChecked[d.change_id] ? "var(--c-navy-deep)" : "var(--c-border)"}`,
                      borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                      background: diffChecked[d.change_id] ? "#F7F9FC" : "#fff",
                    }}>
                      <label style={{ display: "flex", gap: 10, cursor: applied ? "default" : "pointer", alignItems: "flex-start" }}>
                        <input
                          type="checkbox" disabled={!!applied}
                          checked={!!diffChecked[d.change_id]}
                          onChange={(e) => setDiffChecked(p => ({ ...p, [d.change_id]: e.target.checked }))}
                          style={{ marginTop: 3 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-navy-deep)", fontFamily: "monospace", marginBottom: 4 }}>
                            {d.target_stk_req_id}
                            <span style={{ fontWeight: 500, color: "var(--c-text-muted)", fontFamily: "inherit", marginLeft: 8 }}>
                              ({(d.changed_fields || []).join(", ")})
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--c-text-soft)", marginBottom: 8, lineHeight: 1.5 }}>
                            💡 {d.reason}
                          </div>
                          <DiffBlock label="변경 전" data={d.before} color="#B91C1C" bg="#FEF2F2" />
                          <DiffBlock label="변경 후" data={d.after} color="#065F46" bg="#ECFDF5" />
                        </div>
                      </label>
                    </div>
                  ))}
                </>
              )}

              {/* 4단계 결과: 반영 완료 + 재QA */}
              {applied && (
                <div style={{
                  padding: "12px 14px", background: "#ECFDF5", border: "1px solid #6EE7B7",
                  borderRadius: 8, fontSize: 12, color: "#065F46", marginBottom: 12,
                }}>
                  ✅ 리비전 v{(applied.revision_no || 0) + 1} 반영 완료 — 수정 {applied.applied_count}건,
                  총 {applied.stk_req_count}개 STK_REQ. 산출물 화면이 수정본으로 갱신되었습니다.
                  {!requaResult && <div style={{ marginTop: 6 }}>아래 [재QA 실행]으로 판정 변화를 확인하세요 (~$0.01, 30~60초).</div>}
                </div>
              )}

              {/* 5단계 결과: 재QA */}
              {requaResult && (
                <div style={{
                  padding: "12px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12,
                  background: requaResult.critique?.verdict === "approved" ? "#ECFDF5" : "#FFF7ED",
                  border: `1px solid ${requaResult.critique?.verdict === "approved" ? "#6EE7B7" : "#FDBA74"}`,
                  color: requaResult.critique?.verdict === "approved" ? "#065F46" : "#9A3412",
                }}>
                  <strong>재QA 결과: {requaResult.critique?.verdict === "approved" ? "✅ 승인" : "반려"} ·
                    {" "}{Math.round((requaResult.critique?.overall_score || 0) * 100)}점</strong>
                  {" "}(이슈 {(requaResult.critique?.issues || []).length}건)
                  <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{requaResult.critique?.summary}</div>
                  <div style={{ fontSize: 11, marginTop: 6, color: "var(--c-text-muted)" }}>
                    상세는 패널을 닫고 [📊 Rationale 보기]에서 확인하세요. 남은 이슈는 이 패널을 다시 열어 추가 시정조치할 수 있습니다.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 액션 */}
        <div style={{
          padding: "12px 22px", borderTop: "1px solid var(--c-border)",
          display: "flex", justifyContent: "flex-end", gap: 8, background: "#FAFBFD",
        }}>
          <button onClick={() => busy === "" && onClose()} disabled={busy !== ""} style={btnGhost}>닫기</button>

          {tab === "issues" && !proposal && (
            <button onClick={handlePropose} disabled={busy !== "" || checkedCount === 0 || loading} style={btnPrimary(busy !== "" || checkedCount === 0)}>
              {busy === "propose" ? "⏳ AI 수정안 생성 중... (~1분)" : `🔧 AI 시정조치 (선택 ${checkedCount}건)`}
            </button>
          )}
          {tab === "issues" && proposal && !applied && (
            <>
              <button onClick={() => { setProposal(null); setDiffChecked({}); }} disabled={busy !== ""} style={btnGhost}>
                ← 이슈 다시 선택
              </button>
              <button onClick={handleApproveAndApply} disabled={busy !== ""} style={btnPrimary(busy !== "")}>
                {busy === "decide" ? "⏳ 승인 기록 중..." : busy === "apply" ? "⏳ 리비전 반영 중..." :
                  `✓ 선택 승인 + 리비전 반영 (${Object.values(diffChecked).filter(Boolean).length}건)`}
              </button>
            </>
          )}
          {tab === "issues" && applied && !requaResult && (
            <button onClick={handleReQA} disabled={busy !== ""} style={btnPrimary(busy !== "")}>
              {busy === "requa" ? "⏳ 재QA 실행 중... (30~60초)" : "🔍 재QA 실행"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 소형 컴포넌트 ──────────────────────────────────────────
function MiniInput({ label, value, onChange, width, full }) {
  return (
    <div style={{ width: full ? "100%" : undefined, marginBottom: full ? 4 : 0 }}>
      <div style={{ fontSize: 10, color: "var(--c-text-muted)", marginBottom: 2 }}>{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: full ? "100%" : width, padding: "6px 8px",
          border: "1px solid var(--c-border-strong)", borderRadius: 6,
          fontSize: 12, fontFamily: "monospace", outline: "none",
        }}
      />
    </div>
  );
}

function DiffBlock({ label, data, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
      <pre style={{
        margin: 0, fontSize: 10.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
        fontFamily: "monospace", color: "var(--c-text-soft)", lineHeight: 1.5, maxHeight: 160, overflowY: "auto",
      }}>
        {JSON.stringify(data, null, 1)}
      </pre>
    </div>
  );
}

const btnGhost = {
  background: "#fff", border: "1px solid var(--c-border-strong)",
  color: "var(--c-text-soft)", borderRadius: 6, padding: "9px 16px",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
function btnPrimary(disabled) {
  return {
    background: disabled ? "#9CA3AF" : "var(--c-navy-deep, #1E2761)",
    border: "none", color: "#fff", borderRadius: 6, padding: "9px 18px",
    fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
  };
}

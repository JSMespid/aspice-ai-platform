// HITL 9-state State Machine
// 환각 방지 축 5: HITL 게이팅 — 사람 승인 없이는 진행 불가

export const STATES = {
  INITIAL: {
    label: "초기", color: "#9B9A97", terminal: false,
    description: "프로세스 시작 전",
  },
  GENERATING: {
    label: "생성중", color: "#2383E2", terminal: false,
    description: "Claude가 산출물을 생성 중",
  },
  GENERATED: {
    label: "생성완료", color: "#2383E2", terminal: false,
    description: "초안 생성 완료, 검증 대기",
  },
  VERIFYING: {
    label: "검증중", color: "#C77D1A", terminal: false,
    description: "5-Phase QA 파이프라인 실행 중",
  },
  VERIFIED: {
    label: "검증완료", color: "#C77D1A", terminal: false,
    description: "QA 검증 완료, 사람 검토 대기",
  },
  PENDING_APPROVAL: {
    label: "승인대기", color: "#3A4B8C", terminal: false,
    description: "최종 승인자 결정 대기",
  },
  APPROVED: {
    label: "승인", color: "#0F7B6C", terminal: true,
    description: "정식 산출물로 확정",
  },
  REJECTED: {
    label: "반려", color: "#E03E3E", terminal: true,
    description: "재작업 불가 — 폐기",
  },
  CHANGES_REQUESTED: {
    label: "수정요청", color: "#D85A30", terminal: false,
    description: "수정 후 재생성 필요",
  },
};

export const EVENTS = [
  "START_GENERATION",
  "GENERATION_COMPLETE",
  "START_VERIFICATION",
  "VERIFICATION_COMPLETE",
  "SUBMIT_FOR_APPROVAL",
  "APPROVE",
  "REJECT",
  "REQUEST_CHANGES",
  "REVISE_AND_REGENERATE",
];

const TRANSITIONS = {
  "INITIAL:START_GENERATION": "GENERATING",
  "GENERATING:GENERATION_COMPLETE": "GENERATED",
  "GENERATED:START_VERIFICATION": "VERIFYING",
  "VERIFYING:VERIFICATION_COMPLETE": "VERIFIED",
  "VERIFIED:SUBMIT_FOR_APPROVAL": "PENDING_APPROVAL",
  "PENDING_APPROVAL:APPROVE": "APPROVED",
  "PENDING_APPROVAL:REJECT": "REJECTED",
  "PENDING_APPROVAL:REQUEST_CHANGES": "CHANGES_REQUESTED",
  "CHANGES_REQUESTED:REVISE_AND_REGENERATE": "GENERATING",
};

export const PERMISSIONS = {
  Engineer: ["START_GENERATION", "GENERATION_COMPLETE", "START_VERIFICATION",
             "VERIFICATION_COMPLETE", "SUBMIT_FOR_APPROVAL", "REVISE_AND_REGENERATE"],
  Reviewer: ["APPROVE", "REJECT", "REQUEST_CHANGES"],
  Admin: "*",
};

// Critical 이슈가 있으면 SUBMIT_FOR_APPROVAL 차단 (가드레일)
const SUBMIT_GATES = {
  SUBMIT_FOR_APPROVAL: (workProduct) => {
    const qaResult = workProduct.qa_result;
    if (!qaResult) return { allowed: false, reason: "QA 검증이 완료되지 않음" };
    const criticalCount = qaResult.summary?.critical ?? 0;
    if (criticalCount > 0) {
      return { allowed: false, reason: `Critical 이슈 ${criticalCount}건 미해결 — 승인 차단` };
    }
    return { allowed: true };
  },
};

export function transition(currentState, event, role, workProduct = null) {
  // 1. 권한 체크
  const allowed = PERMISSIONS[role];
  if (allowed !== "*" && !(allowed ?? []).includes(event)) {
    return { ok: false, reason: `${role} 권한으로는 ${event} 이벤트를 트리거할 수 없습니다.` };
  }

  // 2. 게이트 체크 (Critical 이슈 차단 등)
  if (SUBMIT_GATES[event]) {
    const gate = SUBMIT_GATES[event](workProduct);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason };
    }
  }

  // 3. 전이 가능 체크
  const key = `${currentState}:${event}`;
  const nextState = TRANSITIONS[key];
  if (!nextState) {
    return { ok: false, reason: `${currentState} 상태에서 ${event} 이벤트는 허용되지 않습니다.` };
  }

  return { ok: true, nextState };
}

// UI에서 현재 상태에 가능한 이벤트 표시용
export function availableEvents(currentState, role) {
  const userEvents = PERMISSIONS[role] === "*" ? EVENTS : (PERMISSIONS[role] ?? []);
  return userEvents.filter(event => {
    const key = `${currentState}:${event}`;
    return key in TRANSITIONS;
  });
}

// 사용자 표시용 3단계 요약 (기존 화면 호환)
export function toLegacyStatus(state) {
  if (["INITIAL", "GENERATING", "GENERATED", "CHANGES_REQUESTED"].includes(state)) return "초안";
  if (["VERIFYING", "VERIFIED", "PENDING_APPROVAL"].includes(state)) return "검토중";
  if (state === "APPROVED") return "승인됨";
  if (state === "REJECTED") return "반려됨";
  return state;
}

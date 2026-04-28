// ASPICE 4.0 프로세스 정의 (데이터 주도)
// 화면설계서 v2.4 사이드바 구조 (SYS 5개 + SWE 6개) 반영

// ──────────────────────────────────────────────────
// SYS — System Engineering (5 processes)
// ──────────────────────────────────────────────────
const SYS_PROCESSES = {
  "SYS.1": {
    id: "SYS.1",
    label: "요구사항 도출",
    fullLabel: "Stakeholder Requirements",
    short: "STK-REQ",
    group: "SYS",
    color: "#1E2761",
    desc: "이해관계자 니즈를 수집하여 요구사항으로 정의합니다.",
    inputLabel: "프로젝트 배경 / 이해관계자 니즈",
    inputPlaceholder: "예: 전방 카메라 기반 자동 하이빔 제어\n이해관계자: 운전자, OEM, 법규 기관\n주요 요구: 야간 가시성 확보, 눈부심 방지",
    // 화면설계서 v2.4 슬라이드 12, 15 명시: SW 요구사항 / HW 요구사항 / SOW
    items: [
      { key: "sw_req", label: "SW 요구사항", required: true,  inputType: "File+Text" },
      { key: "hw_req", label: "HW 요구사항", required: true,  inputType: "File+Text" },
      { key: "sow",    label: "SOW",         required: true,  inputType: "File+Text" },
    ],
    dependencies: [],
    outputSchema: {
      type: "object",
      required: ["process", "title", "needs", "requirements", "traceability"],
      properties: {
        process: { const: "SYS.1" },
        title: { type: "string" },
        needs: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object",
            required: ["id", "description", "source"],
            properties: {
              id: { type: "string", pattern: "^N-\\d{3}$" },
              description: { type: "string", minLength: 10 },
              source: { type: "string" },
            },
          },
        },
        requirements: {
          type: "array", minItems: 3, maxItems: 6,
          items: {
            type: "object",
            required: ["id", "title", "description", "source_needs", "priority", "acceptance_criteria"],
            properties: {
              id: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
              title: { type: "string" },
              description: { type: "string", minLength: 20 },
              source_needs: { type: "array", minItems: 1,
                              items: { type: "string", pattern: "^N-\\d{3}$" } },
              priority: { enum: ["High", "Medium", "Low"] },
              acceptance_criteria: { type: "string", minLength: 10 },
              stability: { enum: ["Stable", "Volatile"] },
            },
          },
        },
        traceability: {
          type: "array",
          items: {
            type: "object",
            required: ["need_id", "req_id", "relation"],
            properties: {
              need_id: { type: "string" },
              req_id: { type: "string" },
              relation: { const: "SATISFIES" },
            },
          },
        },
      },
    },
    domainConstraints: {
      forbiddenTerms: ["fast", "good", "many", "some", "appropriate", "as needed", "if necessary"],
      requiredKeywords: { description: ["shall", "must"] },
      idPatterns: { N: /^N-\d{3}$/, STK_REQ: /^STK-REQ-\d{3}$/ },
    },
    traceabilityRules: [
      { type: "every-need-has-requirement",
        check: (out) => {
          const reqNeeds = new Set(out.requirements.flatMap(r => r.source_needs));
          return out.needs.filter(n => !reqNeeds.has(n.id));
        },
        severity: "Major", message: "참조되지 않은 Need (고아 노드)" },
      { type: "every-source-need-exists",
        check: (out) => {
          const needIds = new Set(out.needs.map(n => n.id));
          return out.requirements.flatMap(r =>
            r.source_needs.filter(nid => !needIds.has(nid))
              .map(nid => ({ req: r.id, missing: nid })));
        },
        severity: "Critical", message: "존재하지 않는 Need 참조 (broken reference)" },
    ],
    summary: (c) => `Needs ${c?.needs?.length ?? 0} · STK-REQ ${c?.requirements?.length ?? 0}`,
    displayItems: [
      { key: "needs", label: "Needs", columns: ["id", "description", "source"] },
      { key: "requirements", label: "Stakeholder Requirements",
        columns: ["id", "title", "priority", "source_needs"] },
    ],
  },

  "SYS.2": {
    id: "SYS.2",
    label: "시스템 요구사항 분석",
    fullLabel: "System Requirements",
    short: "SYS-REQ",
    group: "SYS",
    color: "#1E2761",
    desc: "STK-REQ를 시스템 요구사항과 검증 기준으로 변환합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 추가 기술 맥락",
    inputPlaceholder: "SYS.1 산출물이 자동으로 주입됩니다.\n추가 기술 제약이 있으면 입력하세요.",
    // 화면설계서 v2.4 슬라이드 17: "4개" 정의되어 있으나 구체 항목명 미명시
    // → Phase 3 SCR-06 설정 화면에서 대표님 검토 후 정의
    items: [],
    dependencies: ["SYS.1"],
    outputSchema: {
      type: "object",
      required: ["process", "title", "requirements", "verification_criteria", "traceability"],
      properties: {
        process: { const: "SYS.2" },
        title: { type: "string" },
        requirements: {
          type: "array", minItems: 3, maxItems: 7,
          items: {
            type: "object",
            required: ["id", "title", "description", "type", "source_stk_req", "priority", "relation_type"],
            properties: {
              id: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              title: { type: "string" },
              description: { type: "string", minLength: 20 },
              type: { enum: ["Functional", "Non-functional"] },
              source_stk_req: { type: "array", minItems: 1,
                                items: { type: "string", pattern: "^STK-REQ-\\d{3}$" } },
              priority: { enum: ["High", "Medium", "Low"] },
              relation_type: { enum: ["REFINES", "DERIVES"] },
            },
          },
        },
        verification_criteria: {
          type: "array", minItems: 3, maxItems: 7,
          items: {
            type: "object",
            required: ["id", "req_id", "method", "acceptance_criteria"],
            properties: {
              id: { type: "string", pattern: "^VC-\\d{3}$" },
              req_id: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              method: { enum: ["Test", "Analysis", "Inspection", "Demonstration"] },
              acceptance_criteria: { type: "string", minLength: 10 },
            },
          },
        },
        traceability: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to", "type"],
            properties: {
              from: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
              to: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              type: { enum: ["REFINES", "DERIVES"] },
            },
          },
        },
      },
    },
    domainConstraints: {
      forbiddenTerms: ["fast", "good", "many", "some", "appropriate", "as needed",
                       "if necessary", "약 ", "대략", "가능한 한", "최대한"],
      requiredKeywords: { description: ["shall"] },
      requireMeasurableValues: true,
      idPatterns: { SYS_REQ: /^SYS-REQ-(F|NF)-\d{3}$/, VC: /^VC-\d{3}$/ },
    },
    traceabilityRules: [
      { type: "every-stk-req-refined",
        check: (out, prev) => {
          const stk = prev?.["SYS.1"]?.requirements ?? [];
          const refined = new Set(out.requirements.flatMap(r => r.source_stk_req));
          return stk.filter(s => !refined.has(s.id));
        },
        severity: "Major", message: "정제되지 않은 STK-REQ (배분 누락)" },
      { type: "every-source-stk-exists",
        check: (out, prev) => {
          const stkIds = new Set((prev?.["SYS.1"]?.requirements ?? []).map(s => s.id));
          return out.requirements.flatMap(r =>
            r.source_stk_req.filter(sid => !stkIds.has(sid))
              .map(sid => ({ req: r.id, missing: sid })));
        },
        severity: "Critical", message: "존재하지 않는 STK-REQ 참조" },
      { type: "every-req-has-vc",
        check: (out) => {
          const verified = new Set(out.verification_criteria.map(v => v.req_id));
          return out.requirements.filter(r => !verified.has(r.id));
        },
        severity: "Major", message: "검증 기준이 없는 SYS-REQ" },
    ],
    summary: (c) => `Func ${c?.requirements?.filter(r => r.type === "Functional")?.length ?? 0} · NF ${c?.requirements?.filter(r => r.type === "Non-functional")?.length ?? 0} · VC ${c?.verification_criteria?.length ?? 0}`,
    displayItems: [
      { key: "requirements", label: "System Requirements",
        columns: ["id", "title", "type", "priority", "source_stk_req"] },
      { key: "verification_criteria", label: "Verification Criteria",
        columns: ["id", "req_id", "method", "acceptance_criteria"] },
    ],
  },

  "SYS.3": {
    id: "SYS.3",
    label: "시스템 아키텍처 설계",
    fullLabel: "System Architecture",
    short: "Architecture",
    group: "SYS",
    color: "#1E2761",
    desc: "SYS-REQ를 시스템 요소에 할당하고 아키텍처를 설계합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 아키텍처 제약",
    inputPlaceholder: "SYS.2 산출물이 자동으로 주입됩니다.\n하드웨어 제약, 플랫폼 정보 등을 입력하세요.",
    // 화면설계서 v2.4 슬라이드 17: "5개" 정의되어 있으나 구체 항목명 미명시
    items: [],
    dependencies: ["SYS.2"],
    outputSchema: {
      type: "object",
      required: ["process", "title", "system_elements", "interfaces", "allocation_matrix"],
      properties: {
        process: { const: "SYS.3" },
        title: { type: "string" },
        system_elements: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object",
            required: ["id", "name", "type", "description", "allocated_requirements"],
            properties: {
              id: { type: "string", pattern: "^SE-\\d{3}$" },
              name: { type: "string" },
              type: { enum: ["HW", "SW", "Mechanical", "Electrical"] },
              description: { type: "string", minLength: 15 },
              allocated_requirements: { type: "array", minItems: 1,
                                        items: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" } },
              interfaces: { type: "array", items: { type: "string", pattern: "^IF-\\d{3}$" } },
            },
          },
        },
        interfaces: {
          type: "array", minItems: 1, maxItems: 5,
          items: {
            type: "object",
            required: ["id", "name", "source", "target", "type", "specification"],
            properties: {
              id: { type: "string", pattern: "^IF-\\d{3}$" },
              name: { type: "string" },
              source: { type: "string", pattern: "^SE-\\d{3}$" },
              target: { type: "string", pattern: "^SE-\\d{3}$" },
              type: { enum: ["Data", "Control", "Power", "Signal"] },
              protocol: { type: "string" },
              specification: { type: "string", minLength: 10 },
            },
          },
        },
        allocation_matrix: {
          type: "array",
          items: {
            type: "object",
            required: ["req_id", "element_id", "rationale"],
            properties: {
              req_id: { type: "string" },
              element_id: { type: "string" },
              rationale: { type: "string", minLength: 10 },
            },
          },
        },
      },
    },
    domainConstraints: {
      forbiddenTerms: ["somehow", "various", "etc"],
      idPatterns: { SE: /^SE-\d{3}$/, IF: /^IF-\d{3}$/ },
    },
    traceabilityRules: [
      { type: "every-sys-req-allocated",
        check: (out, prev) => {
          const sysReqs = prev?.["SYS.2"]?.requirements ?? [];
          const allocated = new Set(out.system_elements.flatMap(e => e.allocated_requirements));
          return sysReqs.filter(r => !allocated.has(r.id));
        },
        severity: "Major", message: "어느 요소에도 할당되지 않은 SYS-REQ" },
      { type: "interface-endpoints-exist",
        check: (out) => {
          const elementIds = new Set(out.system_elements.map(e => e.id));
          return out.interfaces.filter(i =>
            !elementIds.has(i.source) || !elementIds.has(i.target));
        },
        severity: "Critical", message: "인터페이스의 source/target이 정의되지 않은 요소" },
    ],
    summary: (c) => `Elements ${c?.system_elements?.length ?? 0} · IF ${c?.interfaces?.length ?? 0}`,
    displayItems: [
      { key: "system_elements", label: "System Elements",
        columns: ["id", "name", "type", "allocated_requirements"] },
      { key: "interfaces", label: "Interfaces",
        columns: ["id", "name", "source", "target", "type"] },
    ],
  },

  "SYS.4": {
    id: "SYS.4",
    label: "시스템 통합 및 통합 테스트",
    fullLabel: "System Integration Test",
    short: "Integration",
    group: "SYS",
    color: "#1E2761",
    desc: "★ V-Model 정정사항 ★ — Interface를 직접 추적합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 테스트 환경",
    inputPlaceholder: "SYS.3 산출물이 자동으로 주입됩니다.\n테스트 환경, 장비 정보를 입력하세요.",
    // 화면설계서 v2.4 슬라이드 17: "2개" 정의되어 있으나 구체 항목명 미명시
    items: [],
    dependencies: ["SYS.3"],
    outputSchema: {
      type: "object",
      required: ["process", "title", "test_cases", "traceability"],
      properties: {
        process: { const: "SYS.4" },
        title: { type: "string" },
        test_cases: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object",
            required: ["id", "title", "objective", "primary_target", "integrated_elements", "test_steps", "pass_criteria"],
            properties: {
              id: { type: "string", pattern: "^ITC-\\d{3}$" },
              title: { type: "string" },
              objective: { type: "string", minLength: 15 },
              primary_target: {
                type: "object",
                required: ["interface_id", "description"],
                properties: {
                  interface_id: { type: "string", pattern: "^IF-\\d{3}$" },
                  description: { type: "string" },
                },
              },
              integrated_elements: { type: "array", minItems: 2,
                                     items: { type: "string", pattern: "^SE-\\d{3}$" } },
              test_steps: { type: "array", minItems: 2,
                            items: { type: "string", minLength: 10 } },
              expected_result: { type: "string" },
              pass_criteria: { type: "string", minLength: 10 },
            },
          },
        },
        traceability: {
          type: "array",
          items: {
            type: "object",
            required: ["test_id", "primary_interface", "elements"],
            properties: {
              test_id: { type: "string" },
              primary_interface: { type: "string", pattern: "^IF-\\d{3}$" },
              elements: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    domainConstraints: {
      forbiddenTerms: ["fast", "good", "many", "some"],
      idPatterns: { ITC: /^ITC-\d{3}$/ },
    },
    traceabilityRules: [
      { type: "test-traces-interface-not-stk-req",
        check: (out) => out.test_cases.filter(tc => {
          const target = tc.primary_target?.interface_id;
          return !target || !target.startsWith("IF-");
        }),
        severity: "Critical",
        message: "★ 통합 테스트는 Interface를 직접 추적해야 함 (V-Model 원칙)" },
      { type: "interface-exists",
        check: (out, prev) => {
          const ifIds = new Set((prev?.["SYS.3"]?.interfaces ?? []).map(i => i.id));
          return out.test_cases.filter(tc =>
            tc.primary_target?.interface_id && !ifIds.has(tc.primary_target.interface_id));
        },
        severity: "Critical", message: "존재하지 않는 인터페이스 참조" },
    ],
    summary: (c) => `Test Cases ${c?.test_cases?.length ?? 0}`,
    displayItems: [
      { key: "test_cases", label: "Integration Test Cases",
        columns: ["id", "title", "primary_target", "integrated_elements"] },
    ],
  },

  "SYS.5": {
    id: "SYS.5",
    label: "시스템 적격성 확인 테스트",
    fullLabel: "System Qualification Test",
    short: "Qualification",
    group: "SYS",
    color: "#1E2761",
    desc: "★ V-Model 정정사항 ★ — SYS-REQ를 primary로 추적합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 검증 기준",
    inputPlaceholder: "SYS.2, SYS.3 산출물이 자동으로 주입됩니다.\n검증 환경, 법규 기준을 입력하세요.",
    // 화면설계서 v2.4 슬라이드 17: "0개" — 미정의
    items: [],
    dependencies: ["SYS.2", "SYS.3"],
    outputSchema: {
      type: "object",
      required: ["process", "title", "test_cases", "traceability"],
      properties: {
        process: { const: "SYS.5" },
        title: { type: "string" },
        test_cases: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object",
            required: ["id", "title", "objective", "system_requirements", "verification_criteria",
                       "test_environment", "test_steps", "pass_criteria", "test_type"],
            properties: {
              id: { type: "string", pattern: "^STC-\\d{3}$" },
              title: { type: "string" },
              objective: { type: "string", minLength: 15 },
              system_requirements: { type: "array", minItems: 1,
                                     items: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" } },
              reference_stk_req: { type: "array",
                                   items: { type: "string", pattern: "^STK-REQ-\\d{3}$" } },
              verification_criteria: { type: "array", minItems: 1,
                                       items: { type: "string", pattern: "^VC-\\d{3}$" } },
              test_environment: { type: "string", minLength: 5 },
              test_steps: { type: "array", minItems: 2,
                            items: { type: "string", minLength: 10 } },
              expected_result: { type: "string" },
              pass_criteria: { type: "string", minLength: 10 },
              test_type: { enum: ["Functional", "Performance", "Safety", "Regulatory"] },
            },
          },
        },
        traceability: {
          type: "array",
          items: {
            type: "object",
            required: ["test_id", "primary_req", "vc"],
            properties: {
              test_id: { type: "string" },
              primary_req: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              vc: { type: "string", pattern: "^VC-\\d{3}$" },
              reference_stk: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
            },
          },
        },
      },
    },
    domainConstraints: {
      forbiddenTerms: ["fast", "good", "many", "some"],
      idPatterns: { STC: /^STC-\d{3}$/ },
    },
    traceabilityRules: [
      { type: "primary-trace-is-sys-req",
        check: (out) => out.test_cases.filter(tc => {
          const sysReqs = tc.system_requirements ?? [];
          return sysReqs.length === 0 || !sysReqs.every(r => r.startsWith("SYS-REQ-"));
        }),
        severity: "Critical",
        message: "★ Qualification 테스트는 SYS-REQ를 primary로 추적해야 함 (V-Model 원칙)" },
    ],
    summary: (c) => `Qualification Tests ${c?.test_cases?.length ?? 0}`,
    displayItems: [
      { key: "test_cases", label: "Qualification Test Cases",
        columns: ["id", "title", "test_type", "system_requirements"] },
    ],
  },
};

// ──────────────────────────────────────────────────
// SWE — Software Engineering (6 processes)
// Phase 1에서는 셸 + 항목만, 스키마/가드레일은 SYS와 같은 패턴으로 추후 확장
// ──────────────────────────────────────────────────
function makeSWE(id, label, fullLabel, deps, items) {
  return {
    id, label, fullLabel,
    short: id,
    group: "SWE",
    color: "#6940A5",
    desc: `${fullLabel} — V-Model SW 단계.`,
    inputLabel: deps.length > 0 ? `${deps.join(", ")} 산출물 자동 주입` : "프로젝트 컨텍스트",
    inputPlaceholder: `${id} 단계의 추가 컨텍스트를 입력하세요.`,
    items,
    dependencies: deps,
    outputSchema: { type: "object", properties: {} },
    domainConstraints: {},
    traceabilityRules: [],
    summary: () => "—",
    displayItems: [],
    placeholder: true,
  };
}

const SWE_PROCESSES = {
  // 화면설계서 v2.4 슬라이드 16 명시: 기능 / 비기능 / 인터페이스 / 제약사항
  "SWE.1": makeSWE("SWE.1", "SW 요구사항 분석", "Software Requirements", ["SYS.3"],
    [{ key: "func_req",       label: "기능 요구사항",       required: true,  inputType: "File+Text" },
     { key: "nonfunc_req",    label: "비기능 요구사항",     required: true,  inputType: "File+Text" },
     { key: "interface_req",  label: "인터페이스 요구사항", required: true,  inputType: "File+Text" },
     { key: "constraints",    label: "제약사항",            required: true,  inputType: "File+Text" }]),

  // 화면설계서 v2.4 슬라이드 17: "0개" — 미정의 (Phase 3에서 정의)
  "SWE.2": makeSWE("SWE.2", "SW 구조설계", "Software Architecture", ["SWE.1"], []),

  // 화면설계서 미명시 — 미정의
  "SWE.3": makeSWE("SWE.3", "상세설계 · 유닛", "Detailed Design", ["SWE.2"], []),

  // 화면설계서 미명시 — 미정의
  "SWE.4": makeSWE("SWE.4", "SW 유닛 검증", "Unit Verification", ["SWE.3"], []),

  // 화면설계서 v2.4 슬라이드 16 명시: 통합테스트 계획서 / 테스트 케이스 / 테스트 결과 보고서
  "SWE.5": makeSWE("SWE.5", "컴포넌트 · 통합", "SW Integration", ["SWE.4"],
    [{ key: "int_test_plan",   label: "통합테스트 계획서",  required: true, inputType: "File+Text" },
     { key: "int_test_cases",  label: "테스트 케이스",       required: true, inputType: "File+Text" },
     { key: "int_test_report", label: "테스트 결과 보고서", required: true, inputType: "File+Text" }]),

  // 화면설계서 미명시 — 미정의
  "SWE.6": makeSWE("SWE.6", "SW 적격성 확인 테스트", "SW Qualification", ["SWE.1", "SWE.5"], []),
};

// ──────────────────────────────────────────────────
// 통합 export
// ──────────────────────────────────────────────────
export const PROCESSES = { ...SYS_PROCESSES, ...SWE_PROCESSES };

export const PROCESS_GROUPS = [
  { id: "SYS", label: "SYS", fullLabel: "System Engineering",   color: "#1E2761",
    processes: ["SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5"] },
  { id: "SWE", label: "SWE", fullLabel: "Software Engineering", color: "#6940A5",
    processes: ["SWE.1", "SWE.2", "SWE.3", "SWE.4", "SWE.5", "SWE.6"] },
];

export const PROCESS_ORDER = [
  "SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5",
  "SWE.1", "SWE.2", "SWE.3", "SWE.4", "SWE.5", "SWE.6",
];

// 사이드바 하단 네비게이션 (화면설계서 슬라이드 12)
export const SIDEBAR_EXTRAS = [
  { id: "traceability", label: "추적성", icon: "⇆", path: "traceability" },
  { id: "consistency",  label: "일관성", icon: "✓", path: "consistency" },
  { id: "templates",    label: "템플릿", icon: "📋", path: "templates" },
  { id: "settings",     label: "설정",   icon: "⚙",  path: "settings" },
];

export function getProcess(id) { return PROCESSES[id]; }
export function getPreviousProcessIds(processId) { return PROCESSES[processId]?.dependencies ?? []; }

// 사이드바 진행률 계산 (화면설계서 슬라이드 14)
// 진행률 = required 항목 충족률 + 승인 시 100% 오버라이드
export function calculateProgress(processId, workProducts) {
  const cfg = PROCESSES[processId];
  if (!cfg) return 0;

  const wp = workProducts.find(w => w.process_id === processId);
  if (!wp) return 0;

  if (wp.state === "APPROVED" || wp.status === "승인됨") return 100;

  const requiredItems = (cfg.items ?? []).filter(it => it.required);
  if (requiredItems.length === 0) {
    if (wp.qa_result) return 66;
    if (wp.content) return 33;
    return 0;
  }

  const filled = requiredItems.filter(it => {
    const data = wp.items?.[it.key];
    return data && (data.file || data.text);
  }).length;

  return Math.round((filled / requiredItems.length) * 100);
}

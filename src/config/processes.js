// ASPICE 4.0 프로세스 정의 (데이터 주도)
// 이 파일이 SYS.1~5 화면을 모두 만들어냅니다.
// 새 프로세스 추가 시 이 파일에만 항목 추가.

export const PROCESSES = {
  "SYS.1": {
    id: "SYS.1",
    label: "Stakeholder Requirements",
    short: "STK-REQ",
    color: "#2383E2",
    icon: "①",
    desc: "이해관계자 니즈를 수집하여 요구사항으로 정의합니다.",

    // 입력 정의
    inputLabel: "프로젝트 배경 / 이해관계자 니즈",
    inputPlaceholder: "예: 전방 카메라 기반 자동 하이빔 제어\n이해관계자: 운전자, OEM, 법규 기관\n주요 요구: 야간 가시성 확보, 눈부심 방지",

    // 이전 단계 의존성 (없으면 빈 배열)
    dependencies: [],

    // 산출물 JSON 스키마 (구조 강제 - 환각 방지 축 1)
    outputSchema: {
      type: "object",
      required: ["process", "title", "needs", "requirements", "traceability"],
      properties: {
        process: { const: "SYS.1" },
        title: { type: "string" },
        needs: {
          type: "array",
          minItems: 2, maxItems: 5,
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
          type: "array",
          minItems: 3, maxItems: 6,
          items: {
            type: "object",
            required: ["id", "title", "description", "source_needs", "priority", "acceptance_criteria"],
            properties: {
              id: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
              title: { type: "string" },
              description: { type: "string", minLength: 20 },
              source_needs: {
                type: "array", minItems: 1,
                items: { type: "string", pattern: "^N-\\d{3}$" },
              },
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

    // 도메인 제약 (환각 방지 축 3)
    domainConstraints: {
      forbiddenTerms: ["fast", "good", "many", "some", "appropriate", "as needed", "if necessary"],
      requiredKeywords: { description: ["shall", "must"] },
      idPatterns: {
        N: /^N-\d{3}$/,
        STK_REQ: /^STK-REQ-\d{3}$/,
      },
    },

    // 추적성 규칙 (환각 방지 축 2)
    traceabilityRules: [
      {
        type: "every-need-has-requirement",
        check: (out) => {
          const reqNeeds = new Set(out.requirements.flatMap(r => r.source_needs));
          return out.needs.filter(n => !reqNeeds.has(n.id));
        },
        severity: "Major",
        message: "참조되지 않은 Need (고아 노드)",
      },
      {
        type: "every-source-need-exists",
        check: (out) => {
          const needIds = new Set(out.needs.map(n => n.id));
          return out.requirements.flatMap(r =>
            r.source_needs.filter(nid => !needIds.has(nid))
              .map(nid => ({ req: r.id, missing: nid }))
          );
        },
        severity: "Critical",
        message: "존재하지 않는 Need 참조 (broken reference)",
      },
    ],

    // 화면 표시용 요약
    summary: (c) => `Needs ${c?.needs?.length ?? 0} · STK-REQ ${c?.requirements?.length ?? 0}`,

    // 표시할 항목 (테이블 형태)
    displayItems: [
      { key: "needs", label: "Needs", columns: ["id", "description", "source"] },
      { key: "requirements", label: "Stakeholder Requirements",
        columns: ["id", "title", "priority", "source_needs"] },
    ],
  },

  "SYS.2": {
    id: "SYS.2",
    label: "System Requirements",
    short: "SYS-REQ",
    color: "#6940A5",
    icon: "②",
    desc: "STK-REQ를 시스템 요구사항과 검증 기준으로 변환합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 추가 기술 맥락",
    inputPlaceholder: "SYS.1 산출물이 자동으로 주입됩니다.\n추가 기술 제약이 있으면 입력하세요.",
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
              source_stk_req: {
                type: "array", minItems: 1,
                items: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
              },
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
      idPatterns: {
        SYS_REQ: /^SYS-REQ-(F|NF)-\d{3}$/,
        VC: /^VC-\d{3}$/,
      },
    },

    traceabilityRules: [
      {
        type: "every-stk-req-refined",
        check: (out, prevContents) => {
          const stk = prevContents?.["SYS.1"]?.requirements ?? [];
          const refined = new Set(out.requirements.flatMap(r => r.source_stk_req));
          return stk.filter(s => !refined.has(s.id));
        },
        severity: "Major",
        message: "정제되지 않은 STK-REQ (배분 누락)",
      },
      {
        type: "every-source-stk-exists",
        check: (out, prevContents) => {
          const stkIds = new Set((prevContents?.["SYS.1"]?.requirements ?? []).map(s => s.id));
          return out.requirements.flatMap(r =>
            r.source_stk_req.filter(sid => !stkIds.has(sid))
              .map(sid => ({ req: r.id, missing: sid }))
          );
        },
        severity: "Critical",
        message: "존재하지 않는 STK-REQ 참조",
      },
      {
        type: "every-req-has-vc",
        check: (out) => {
          const verified = new Set(out.verification_criteria.map(v => v.req_id));
          return out.requirements.filter(r => !verified.has(r.id));
        },
        severity: "Major",
        message: "검증 기준이 없는 SYS-REQ",
      },
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
    label: "System Architecture",
    short: "Architecture",
    color: "#0C7D8C",
    icon: "③",
    desc: "SYS-REQ를 시스템 요소에 할당하고 아키텍처를 설계합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 아키텍처 제약",
    inputPlaceholder: "SYS.2 산출물이 자동으로 주입됩니다.\n하드웨어 제약, 플랫폼 정보 등을 입력하세요.",
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
              allocated_requirements: {
                type: "array", minItems: 1,
                items: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              },
              interfaces: {
                type: "array",
                items: { type: "string", pattern: "^IF-\\d{3}$" },
              },
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
      idPatterns: {
        SE: /^SE-\d{3}$/,
        IF: /^IF-\d{3}$/,
      },
    },

    traceabilityRules: [
      {
        type: "every-sys-req-allocated",
        check: (out, prevContents) => {
          const sysReqs = prevContents?.["SYS.2"]?.requirements ?? [];
          const allocated = new Set(out.system_elements.flatMap(e => e.allocated_requirements));
          return sysReqs.filter(r => !allocated.has(r.id));
        },
        severity: "Major",
        message: "어느 요소에도 할당되지 않은 SYS-REQ",
      },
      {
        type: "interface-endpoints-exist",
        check: (out) => {
          const elementIds = new Set(out.system_elements.map(e => e.id));
          return out.interfaces.filter(i =>
            !elementIds.has(i.source) || !elementIds.has(i.target)
          );
        },
        severity: "Critical",
        message: "인터페이스의 source/target이 정의되지 않은 요소",
      },
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
    label: "System Integration Test",
    short: "Integration",
    color: "#C77D1A",
    icon: "④",
    desc: "시스템 요소를 통합하고 인터페이스를 검증합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 테스트 환경",
    inputPlaceholder: "SYS.3 산출물이 자동으로 주입됩니다.\n테스트 환경, 장비 정보를 입력하세요.",
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
              // 핵심: SYS.4는 Interface를 직접 추적 (대표님 정정사항)
              primary_target: {
                type: "object",
                required: ["interface_id", "description"],
                properties: {
                  interface_id: { type: "string", pattern: "^IF-\\d{3}$" },
                  description: { type: "string" },
                },
              },
              integrated_elements: {
                type: "array", minItems: 2,
                items: { type: "string", pattern: "^SE-\\d{3}$" },
              },
              test_steps: {
                type: "array", minItems: 2,
                items: { type: "string", minLength: 10 },
              },
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
      // 가장 중요: 대표님이 직접 정정하신 V-Model 원칙
      {
        type: "test-traces-interface-not-stk-req",
        check: (out) => {
          // SYS.4 테스트는 Interface를 추적해야 함 (STK-REQ 직접 추적 금지)
          return out.test_cases.filter(tc => {
            const target = tc.primary_target?.interface_id;
            return !target || !target.startsWith("IF-");
          });
        },
        severity: "Critical",
        message: "통합 테스트는 Interface를 직접 추적해야 함 (V-Model 원칙)",
      },
      {
        type: "interface-exists",
        check: (out, prevContents) => {
          const ifIds = new Set((prevContents?.["SYS.3"]?.interfaces ?? []).map(i => i.id));
          return out.test_cases.filter(tc =>
            tc.primary_target?.interface_id && !ifIds.has(tc.primary_target.interface_id)
          );
        },
        severity: "Critical",
        message: "존재하지 않는 인터페이스 참조",
      },
      {
        type: "elements-exist",
        check: (out, prevContents) => {
          const seIds = new Set((prevContents?.["SYS.3"]?.system_elements ?? []).map(e => e.id));
          return out.test_cases.flatMap(tc =>
            (tc.integrated_elements ?? []).filter(e => !seIds.has(e))
              .map(e => ({ test: tc.id, missing: e }))
          );
        },
        severity: "Critical",
        message: "존재하지 않는 요소 참조",
      },
    ],

    summary: (c) => `Test Cases ${c?.test_cases?.length ?? 0}`,

    displayItems: [
      { key: "test_cases", label: "Integration Test Cases",
        columns: ["id", "title", "primary_target", "integrated_elements"] },
    ],
  },

  "SYS.5": {
    id: "SYS.5",
    label: "System Qualification Test",
    short: "Qualification",
    color: "#0F7B6C",
    icon: "⑤",
    desc: "시스템이 요구사항을 만족하는지 최종 검증합니다.",
    inputLabel: "이전 단계 산출물 자동 주입 + 검증 기준",
    inputPlaceholder: "SYS.2, SYS.3 산출물이 자동으로 주입됩니다.\n검증 환경, 법규 기준을 입력하세요.",
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
              // 핵심: SYS.5는 SYS-REQ를 직접 추적 (대표님 정정사항)
              system_requirements: {
                type: "array", minItems: 1,
                items: { type: "string", pattern: "^SYS-REQ-(F|NF)-\\d{3}$" },
              },
              // STK-REQ는 참고용 (간접 추적)
              reference_stk_req: {
                type: "array",
                items: { type: "string", pattern: "^STK-REQ-\\d{3}$" },
              },
              verification_criteria: {
                type: "array", minItems: 1,
                items: { type: "string", pattern: "^VC-\\d{3}$" },
              },
              test_environment: { type: "string", minLength: 5 },
              test_steps: {
                type: "array", minItems: 2,
                items: { type: "string", minLength: 10 },
              },
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
      // 대표님 정정: SYS.5는 SYS-REQ를 primary로 추적, STK-REQ는 reference만
      {
        type: "primary-trace-is-sys-req",
        check: (out) => {
          return out.test_cases.filter(tc => {
            const sysReqs = tc.system_requirements ?? [];
            return sysReqs.length === 0 || !sysReqs.every(r => r.startsWith("SYS-REQ-"));
          });
        },
        severity: "Critical",
        message: "Qualification 테스트는 SYS-REQ를 primary로 추적해야 함 (V-Model 원칙)",
      },
      {
        type: "sys-req-exists",
        check: (out, prevContents) => {
          const sysReqIds = new Set((prevContents?.["SYS.2"]?.requirements ?? []).map(r => r.id));
          return out.test_cases.flatMap(tc =>
            (tc.system_requirements ?? []).filter(r => !sysReqIds.has(r))
              .map(r => ({ test: tc.id, missing: r }))
          );
        },
        severity: "Critical",
        message: "존재하지 않는 SYS-REQ 참조",
      },
      {
        type: "vc-exists",
        check: (out, prevContents) => {
          const vcIds = new Set((prevContents?.["SYS.2"]?.verification_criteria ?? []).map(v => v.id));
          return out.test_cases.flatMap(tc =>
            (tc.verification_criteria ?? []).filter(v => !vcIds.has(v))
              .map(v => ({ test: tc.id, missing: v }))
          );
        },
        severity: "Critical",
        message: "존재하지 않는 VC 참조",
      },
      {
        type: "every-sys-req-tested",
        check: (out, prevContents) => {
          const sysReqs = prevContents?.["SYS.2"]?.requirements ?? [];
          const tested = new Set(out.test_cases.flatMap(tc => tc.system_requirements ?? []));
          return sysReqs.filter(r => !tested.has(r.id));
        },
        severity: "Major",
        message: "테스트되지 않은 SYS-REQ (커버리지 누락)",
      },
    ],

    summary: (c) => `Qualification Tests ${c?.test_cases?.length ?? 0}`,

    displayItems: [
      { key: "test_cases", label: "Qualification Test Cases",
        columns: ["id", "title", "test_type", "system_requirements"] },
    ],
  },
};

export const PROCESS_ORDER = ["SYS.1", "SYS.2", "SYS.3", "SYS.4", "SYS.5"];

export function getProcess(id) {
  return PROCESSES[id];
}

export function getPreviousProcessIds(processId) {
  return PROCESSES[processId]?.dependencies ?? [];
}

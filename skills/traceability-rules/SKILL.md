---
name: traceability-rules
description: "Use whenever generating or validating ASPICE traceability between V-Model processes. Provides authoritative rules for which artifacts must trace to which (SYS.1↔SYS.2, SYS.2↔SYS.3, SYS.3↔SYS.4 via Interface, SYS.2↔SYS.5 via SYS-REQ, SWE.1-SWE.6 chain). Activates on any process generation that has 'dependencies' or asks about traceability matrices."
---

# ASPICE V-Model Traceability Rules
# ASPICE V-Model 추적성 규칙

## Authoritative Source / 권위 있는 출처

This skill encodes the V-Model traceability rules with **two corrections by the chief architect** (대표님 정정사항 2가지):

1. **SYS.4 → SYS.3 traceability is via Interface**, not via SYS-REQ
   (SYS.4 → SYS.3 추적은 SYS-REQ 가 아니라 Interface 경유)
2. **SYS.5 → SYS.2 traceability is the primary path**, via SYS-REQ
   (SYS.5 → SYS.2 추적이 primary 경로, SYS-REQ 경유)

These corrections are crucial. Any AI-generated traceability that violates these will be rejected.
이 정정사항은 매우 중요. AI 가 생성한 추적성이 이를 위반하면 거부됨.

## V-Model Traceability Matrix / V-Model 추적성 매트릭스

```
Left Side (Specification / 명세)              Right Side (Verification / 검증)
═══════════════════════════                  ═══════════════════════════

   STK_REQ (SYS.1)  ◄──────traceback──────►  ◄── SYS Qualification (SYS.5)
        │                                            ▲
        │ refines / 정련                              │ verifies / 검증
        ▼                                            │ (PRIMARY: via SYS-REQ)
   SYS_REQ (SYS.2)  ◄──────traceback──────────────────┘
        │                                            ▲
        │ allocates / 할당                            │
        ▼                                            │
   SYS_ELEMENT     ◄────traceback────►  SYS Integration (SYS.4)
   + INTERFACE       (PRIMARY: via Interface)        ▲
   (SYS.3)                                           │
        │                                            │
        │ refines                                    │
        ▼                                            │
   SW_REQ (SWE.1)  ◄──────traceback──────►  ◄── SW Qualification (SWE.6)
        │                                            ▲
        ▼                                            │
   SW_ARCH (SWE.2) ◄──────traceback──────►  SW Integration (SWE.5)
        │                                            ▲
        ▼                                            │
   SW_DETAIL (SWE.3) ◄──traceback──►  Unit Verification (SWE.4)
        │                                            ▲
        ▼                                            │
   SW_UNIT (implementation)  ───────────────────────┘
```

## Traceability Rules — Detailed / 추적성 규칙 상세

### Rule 1: SYS.1 → SYS.2 (Refinement / 정련)

- **Direction / 방향**: Each SYS_REQ must trace to one or more STK_REQ
- **Many-to-one allowed / 다대일 허용**: 여러 SYS_REQ 가 같은 STK_REQ 에서 파생 가능
- **Required field / 필수 필드**: `derives_from: ["STK_REQ_001", "STK_REQ_005"]`
- **Coverage check / 커버리지 확인**: 모든 STK_REQ 는 최소 1개의 SYS_REQ 로 cover

### Rule 2: SYS.2 → SYS.3 (Allocation / 할당)

- **Direction**: Each SYS_ELEMENT / INTERFACE must trace to one or more SYS_REQ
- **Decomposition allowed**: 1개 SYS_REQ 가 여러 element 에 할당 가능
- **Required field**: `allocates: ["SYS_REQ_010"]`

### Rule 3: SYS.3 → SYS.4 (★ Interface-based — 정정사항)

**This is a critical correction by the chief architect.**
**이것은 대표님의 핵심 정정사항입니다.**

Many AI tools incorrectly trace SYS.4 to SYS-REQ. The correct primary path is:
많은 AI 도구가 SYS.4 를 SYS-REQ 에 잘못 추적함. 올바른 primary 경로:

- **Primary / 주 경로**: SYS.4 test cases trace to **Interface definitions** in SYS.3
  (SYS.4 시험 사례는 SYS.3 의 **Interface 정의** 로 추적)
- **Why / 이유**: SYS.4 is *Integration Testing* — it tests that elements connect via interfaces correctly
  (SYS.4 는 *통합 시험* 으로, element 들이 interface 를 통해 올바로 연결되는지 시험)
- **Required field in SYS.4**: `verifies_interface: ["IF_CAN_001", "IF_LIN_003"]`

**Wrong / 잘못된 예 (common AI error)**:
```json
{"id": "INT_TEST_001", "verifies_sys_req": ["SYS_REQ_010"]}
```

**Correct / 올바른 예**:
```json
{"id": "INT_TEST_001", "verifies_interface": ["IF_CAN_BRAKE_001"]}
```

### Rule 4: SYS.2 → SYS.5 (★ SYS-REQ primary — 정정사항)

**Another critical correction by the chief architect.**
**대표님의 또 다른 핵심 정정사항.**

Many AI tools trace SYS.5 to STK_REQ directly. The correct primary path is:
많은 AI 도구가 SYS.5 를 STK_REQ 에 직접 추적함. 올바른 primary 경로:

- **Primary / 주 경로**: SYS.5 qualification tests trace to **SYS_REQ** (system requirements)
  (SYS.5 자격 확인 시험은 **SYS_REQ** 로 추적)
- **Why / 이유**: SYS.5 is *System Qualification* — it qualifies that the system meets specified system requirements
  (SYS.5 는 *시스템 자격 확인* 으로, 시스템이 명세된 SYS_REQ 를 충족하는지 확인)
- **Required field in SYS.5**: `verifies_sys_req: ["SYS_REQ_010"]`
- **Optional traceback / 선택 역추적**: STK_REQ 참조 가능하지만 SYS_REQ 가 primary

**Wrong / 잘못된 예**:
```json
{"id": "QUAL_TEST_001", "verifies_stk_req": ["STK_REQ_001"]}
```

**Correct / 올바른 예**:
```json
{
  "id": "QUAL_TEST_001",
  "verifies_sys_req": ["SYS_REQ_010"],
  "context_stk_req": ["STK_REQ_001"]
}
```

### Rule 5: SWE.1 → SWE.6 (SW Qualification / SW 자격 확인)

- **Direction**: SWE.6 test cases trace to SWE.1 SW_REQ
- **Required field**: `verifies_sw_req: ["SW_REQ_005"]`

### Rule 6: SWE.2 → SWE.5 (SW Integration / SW 통합)

- **Direction**: SWE.5 integration tests trace to SWE.2 SW_ARCH components
- **Required field**: `integrates_components: ["COMP_AUTH", "COMP_CRYPTO"]`

### Rule 7: SWE.3 → SWE.4 (Unit Verification / 단위 검증)

- **Direction**: SWE.4 unit tests trace to SWE.3 SW_DETAIL units
- **Required field**: `verifies_unit: ["UNIT_pin_validator"]`

## ID Naming Conventions / ID 명명 규칙

Strict patterns. AI generation MUST follow these.
엄격한 패턴. AI 생성 시 반드시 준수.

| Process | ID Pattern | Example |
|---|---|---|
| SYS.1 | `STK_REQ_NNN` | `STK_REQ_001` |
| SYS.2 | `SYS_REQ_NNN` | `SYS_REQ_010` |
| SYS.3 elements | `SYS_ELT_NNN` | `SYS_ELT_005` |
| SYS.3 interfaces | `IF_<protocol>_<purpose>_NNN` | `IF_CAN_BRAKE_001` |
| SYS.4 tests | `INT_TEST_NNN` | `INT_TEST_001` |
| SYS.5 tests | `QUAL_TEST_NNN` | `QUAL_TEST_001` |
| SWE.1 | `SW_REQ_NNN` | `SW_REQ_001` |
| SWE.2 components | `COMP_<name>` | `COMP_AUTH` |
| SWE.3 units | `UNIT_<name>` | `UNIT_pin_validator` |
| SWE.4 tests | `UT_NNN` | `UT_001` |
| SWE.5 tests | `IT_NNN` | `IT_001` |
| SWE.6 tests | `QT_NNN` | `QT_001` |

NNN = 3-digit zero-padded / 3자리 zero-padded

## Validation Checklist / 검증 점검표

When validating traceability, verify:
추적성 검증 시 확인:

1. ☐ Every SYS_REQ has `derives_from: [STK_REQ_*]`
2. ☐ Every STK_REQ is referenced by at least one SYS_REQ (no orphan)
3. ☐ Every SYS.4 test has `verifies_interface: [IF_*]` (NOT `verifies_sys_req`)
4. ☐ Every SYS.5 test has `verifies_sys_req: [SYS_REQ_*]` (NOT `verifies_stk_req` as primary)
5. ☐ All referenced IDs actually exist in their respective processes
6. ☐ ID patterns match the table above / ID 패턴 일치
7. ☐ No circular references / 순환 참조 없음

## Common AI Errors to Detect / 흔한 AI 오류

### Error 1: Wrong SYS.4 Primary Trace / SYS.4 잘못된 주 추적
```json
{"verifies_sys_req": [...]}    // ❌ WRONG for SYS.4
{"verifies_interface": [...]}  // ✅ CORRECT
```

### Error 2: Wrong SYS.5 Primary Trace / SYS.5 잘못된 주 추적
```json
{"verifies_stk_req": [...]}    // ❌ WRONG as primary for SYS.5
{"verifies_sys_req": [...]}    // ✅ CORRECT primary
```

### Error 3: Inventing IDs Not in Source / 존재하지 않는 ID 인용
입력에 SYS_REQ_001~010 만 있는데 SYS_REQ_999 참조 → hallucination, 거부.

### Error 4: Missing Coverage / 커버리지 누락
STK_REQ_005 가 SYS.1 에 있는데 어떤 SYS_REQ 도 역추적 안 함 → 불완전 커버리지, flag.

### Error 5: ID Pattern Violations / ID 패턴 위반
- `STK_001` — `_REQ_` 누락
- `STK_REQ_1` — zero-pad 누락
- `stk_req_001` — 소문자
- `STK_REQ_001A` — primary ID 에 suffix 금지

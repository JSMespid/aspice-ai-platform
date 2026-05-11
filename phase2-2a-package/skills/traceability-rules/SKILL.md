---
name: traceability-rules
description: "Use whenever generating or validating ASPICE traceability between V-Model processes. Provides authoritative rules for which artifacts must trace to which (SYS.1↔SYS.2, SYS.2↔SYS.3, SYS.3↔SYS.4 via Interface, SYS.2↔SYS.5 via SYS-REQ, SWE.1-SWE.6 chain). Activates on any process generation that has 'dependencies' or asks about traceability matrices."
---

# ASPICE V-Model Traceability Rules

## Authoritative Source

This skill encodes the V-Model traceability rules with **두 가지 정정사항** by 대표님:

1. **SYS.4 → SYS.3 traceability is via Interface**, not via SYS-REQ
2. **SYS.5 → SYS.2 traceability is the primary path**, via SYS-REQ

These corrections are crucial. Any AI-generated traceability that violates these will be rejected.

## V-Model Traceability Matrix (Authoritative)

```
Left Side (Specification)              Right Side (Verification)
═══════════════════════════           ═══════════════════════════

   STK_REQ (SYS.1)  ◄──────traceback──────►  ◄── SYS Qualification (SYS.5)
        │                                            ▲
        │ refines                                    │ verifies
        ▼                                            │ (PRIMARY: via SYS-REQ)
   SYS_REQ (SYS.2)  ◄──────traceback──────────────────┘
        │                                            ▲
        │ allocates                                  │
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

## Traceability Rules — Detailed

### Rule 1: SYS.1 → SYS.2 (Refinement)

- **Direction**: Each SYS_REQ must trace to one or more STK_REQ
- **Many-to-one allowed**: Multiple SYS_REQ can derive from same STK_REQ
- **Required field**: `derives_from: ["STK_REQ_001", "STK_REQ_005"]`
- **Coverage check**: Every STK_REQ must be covered by at least one SYS_REQ

### Rule 2: SYS.2 → SYS.3 (Allocation)

- **Direction**: Each SYS_ELEMENT/INTERFACE must trace to one or more SYS_REQ
- **Decomposition allowed**: One SYS_REQ can be allocated to multiple elements
- **Required field**: `allocates: ["SYS_REQ_010"]`

### Rule 3: SYS.3 → SYS.4 (★ Interface-based — 정정사항)

**This is a critical correction by the architect.** Many AI tools incorrectly trace SYS.4 to SYS-REQ. The correct primary path is:

- **Primary**: SYS.4 test cases trace to **Interface definitions** in SYS.3
- **Why**: SYS.4 is *Integration Testing* — it tests that elements connect via interfaces correctly
- **Required field in SYS.4**: `verifies_interface: ["IF_CAN_001", "IF_LIN_003"]`

**Wrong (common AI error):**
```json
{"id": "INT_TEST_001", "verifies_sys_req": ["SYS_REQ_010"]}
```

**Correct:**
```json
{"id": "INT_TEST_001", "verifies_interface": ["IF_CAN_BRAKE_001"]}
```

### Rule 4: SYS.2 → SYS.5 (★ SYS-REQ primary — 정정사항)

**Another critical correction.** Many AI tools trace SYS.5 to STK_REQ directly. The correct primary path is:

- **Primary**: SYS.5 qualification tests trace to **SYS_REQ** (system requirements)
- **Why**: SYS.5 is *System Qualification* — it qualifies that the system meets specified system requirements
- **Required field in SYS.5**: `verifies_sys_req: ["SYS_REQ_010"]`
- **Optional traceback**: Can also reference STK_REQ for context, but SYS_REQ is primary

**Wrong (common AI error):**
```json
{"id": "QUAL_TEST_001", "verifies_stk_req": ["STK_REQ_001"]}
```

**Correct:**
```json
{"id": "QUAL_TEST_001", "verifies_sys_req": ["SYS_REQ_010"], "context_stk_req": ["STK_REQ_001"]}
```

### Rule 5: SWE.1 → SWE.6 (SW Qualification)

- **Direction**: SWE.6 test cases trace to SWE.1 SW_REQ
- **Required field**: `verifies_sw_req: ["SW_REQ_005"]`

### Rule 6: SWE.2 → SWE.5 (SW Integration)

- **Direction**: SWE.5 integration tests trace to SWE.2 SW_ARCH components
- **Required field**: `integrates_components: ["COMP_AUTH", "COMP_CRYPTO"]`

### Rule 7: SWE.3 → SWE.4 (Unit Verification)

- **Direction**: SWE.4 unit tests trace to SWE.3 SW_DETAIL units
- **Required field**: `verifies_unit: ["UNIT_pin_validator"]`

## ID Naming Conventions

Strict patterns. AI generation MUST follow these:

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

NNN = 3-digit zero-padded.

## Validation Checklist

When validating traceability, verify:

1. ☐ Every SYS_REQ has `derives_from: [STK_REQ_*]`
2. ☐ Every STK_REQ is referenced by at least one SYS_REQ (no orphan stakeholder needs)
3. ☐ Every SYS.4 test has `verifies_interface: [IF_*]` (NOT `verifies_sys_req`)
4. ☐ Every SYS.5 test has `verifies_sys_req: [SYS_REQ_*]` (NOT `verifies_stk_req` as primary)
5. ☐ All referenced IDs actually exist in their respective processes
6. ☐ ID patterns match the table above
7. ☐ No circular references

## Common AI Errors to Detect

### Error 1: Wrong SYS.4 Primary Trace
```json
{"verifies_sys_req": [...]}   // ❌ WRONG for SYS.4
{"verifies_interface": [...]} // ✅ CORRECT
```

### Error 2: Wrong SYS.5 Primary Trace
```json
{"verifies_stk_req": [...]}   // ❌ WRONG as primary for SYS.5
{"verifies_sys_req": [...]}   // ✅ CORRECT primary
```

### Error 3: Inventing IDs Not in Source
If SYS.2 only has SYS_REQ_001 to SYS_REQ_010, but SYS.5 test references SYS_REQ_999 — that's a hallucination. Reject.

### Error 4: Missing Coverage
If STK_REQ_005 exists in SYS.1 but no SYS_REQ traces back to it — incomplete coverage. Flag.

### Error 5: ID Pattern Violations
- `STK_001` (missing _REQ_)
- `STK_REQ_1` (not zero-padded)
- `stk_req_001` (lowercase)
- `STK_REQ_001A` (suffix not allowed for primary IDs)

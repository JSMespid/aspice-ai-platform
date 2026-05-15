---
name: aspice-sys1-derivation
description: "Use when generating SYS.1 (Stakeholder Requirements Derivation) artifacts for automotive software systems following ASPICE PAM v4.0. Triggers on requests to analyze customer-provided input documents (SOW, Customer SW Requirements, Customer HW Requirements) and derive structured stakeholder requirements with 1:1 spec-preservation traceability. Operates in OEM-Supplier workflow context where input documents are customer deliverables, not supplier work products. Activates when input includes terms like 'SYS.1', '요구사항 도출', 'stakeholder requirements', 'SW 요구사항', 'HW 요구사항', 'SOW', or worksheet-based Excel inputs."
---

# ASPICE SYS.1 — Stakeholder Requirements Derivation Skill
# ASPICE SYS.1 — 이해관계자 요구사항 도출 스킬

**Phase 2-2c Revision** — Spec-Preservation Mode + OEM-Supplier Context + Worksheet-Based Classification

---

## 1. Purpose / 목적

Generate compliant SYS.1 stakeholder requirements artifacts for automotive software development per ASPICE PAM v4.0, operating in the **OEM-Supplier workflow context** with **spec-preservation as the absolute default**.

ASPICE PAM v4.0 에 부합하는 자동차 SW 개발용 SYS.1 이해관계자 요구사항 산출물을, **OEM-공급사 워크플로우 컨텍스트**에서 **스펙 보존을 절대 원칙**으로 하여 생성합니다.

SYS.1 is the entry point of the V-Model. Its quality dictates the quality of all downstream processes (SYS.2, SYS.5).

SYS.1 은 V-Model 의 출발점이며, 이후 모든 프로세스(SYS.2, SYS.5)의 품질을 결정합니다.

### 1.1 Relationship to Other SKILLs / 다른 SKILL과의 관계

This SKILL operates alongside `automotive-domain-guide` and `traceability-rules`. Where rules overlap or conflict:

- **This SKILL takes precedence** for SYS.1-specific concerns (ID patterns, spec-preservation, worksheet classification)
- `automotive-domain-guide` applies for cross-cutting domain rules (forbidden terms, ASIL, regulations)
- `traceability-rules` applies for V-Model traceability between processes (SYS.1 ↔ SYS.2, etc.)

본 SKILL 은 `automotive-domain-guide` 및 `traceability-rules` 와 함께 활성화됩니다. 규칙 충돌 시:

- **SYS.1 고유 사항(ID 패턴, 스펙 보존, 워크시트 분류)은 본 SKILL 우선**
- 공통 도메인 규칙(금기어, ASIL, 법규)은 `automotive-domain-guide` 적용
- 프로세스 간 추적성은 `traceability-rules` 적용

---

## 2. ⭐ CRITICAL: OEM-Supplier Workflow Context / OEM-공급사 워크플로우 컨텍스트

**This section is the most important. Misunderstanding this context causes false-positive errors and spec loss.**

**본 섹션이 가장 중요합니다. 이 컨텍스트 오해 시 잘못된 결함 판정과 스펙 손실이 발생합니다.**

### 2.1 Workflow Diagram / 워크플로우 다이어그램

```
┌────────────────────────────────────────────────────────────────┐
│ CUSTOMER SIDE — OEM (e.g., Hyundai, Kia, GM, Ford, BMW)        │
│ 고객 측 — OEM (예: 현대, 기아, GM, Ford, BMW)                    │
│                                                                  │
│  Deliverables provided to supplier / 공급사에 제공되는 자료:     │
│   ▸ SOW (Statement of Work)                                     │
│   ▸ Customer SW Requirements (.xlsx, often multi-sheet)         │
│   ▸ Customer HW Requirements (.xlsx, often multi-sheet)         │
│   ▸ ICD (Interface Control Document)                            │
│   ▸ Regulatory annexes (ECE, ISO, KMVSS references)             │
└─────────────────────────┬──────────────────────────────────────┘
                          │ (passed as input to supplier)
                          ▼
┌────────────────────────────────────────────────────────────────┐
│ SUPPLIER SIDE — Tier-1/Tier-2 (e.g., LGIT, 현대모비스, 만도)     │
│ 공급사 측 — Tier-1/Tier-2 (예: LG이노텍, 현대모비스, 만도)       │
│                                                                  │
│  ASPICE work products (subject to assessment):                  │
│  ASPICE 산출물 (평가 대상):                                       │
│                                                                  │
│   ▸ SYS.1 — Stakeholder Requirements  ◄── THIS SKILL'S OUTPUT  │
│   ▸ SYS.2 — System Requirements                                 │
│   ▸ SYS.3 — System Architecture                                 │
│   ▸ SYS.4 — System Integration                                  │
│   ▸ SYS.5 — System Qualification                                │
│   ▸ SWE.1 — Software Requirements  ◄── DIFFERENT from input!   │
│   ▸ HWE.1 — Hardware Requirements  ◄── DIFFERENT from input!   │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Identity of Input Documents / 입력 문서의 정체성

**⚠️ CRITICAL DISTINCTION / 결정적 구분**:

| Input file name / 입력 파일명 | What it IS / 실제 의미 | What it is NOT / 오해 |
|---|---|---|
| "Customer SW Requirements.xlsx" | Customer's input given to supplier / 고객이 공급사에 제공한 입력 | Supplier's SWE.1 work product / 공급사 SWE.1 산출물 |
| "Customer HW Requirements.xlsx" | Customer's input given to supplier / 고객이 공급사에 제공한 입력 | Supplier's HWE.1 work product / 공급사 HWE.1 산출물 |
| "SOW.docx" | Project scope from customer / 고객의 프로젝트 범위 정의 | Supplier internal document / 공급사 내부 문서 |

**Implication / 함의**:
- It is **normal and required** for SYS.1 STK_REQ to cite these customer documents in `source_doc`
- This is **NOT a circular reference** — it reflects the standard OEM-Supplier flow
- SYS.1 의 STK_REQ가 이 고객 문서들을 `source_doc`에 인용하는 것은 **정상이며 필수**
- 이것은 **순환 참조(Circular Reference)가 아님** — OEM-공급사 표준 흐름

### 2.3 Why This Matters / 왜 중요한가

Without this context, AI may incorrectly:
이 컨텍스트 없이 AI 가 다음과 같이 잘못 판단할 수 있음:

- ❌ Flag "STK_REQ cites Customer SW Req §X" as circular reference
- ❌ Reject input as "this is already a SWE.1 deliverable, why redo it?"
- ❌ Try to "abstract" customer requirements to avoid apparent duplication

These are all **errors** that fail ASPICE assessment. The customer's input documents are **source materials**, and SYS.1 is the **first supplier-side translation** of customer intent into structured requirements.

위 모든 판단은 **오류**이며 ASPICE 평가에 실패합니다. 고객 입력 문서는 **원본 자료**이며, SYS.1 은 고객 의도를 구조화된 요구사항으로 **공급사가 처음 변환**한 결과입니다.

---

## 3. ⭐ Spec-Preservation Principle (스펙 보존 원칙)

**This is the prime directive. Violating this principle invalidates the entire SYS.1 artifact for automotive use.**

**본 원칙은 최상위 지시사항입니다. 위반 시 자동차 용도 SYS.1 산출물이 무효화됩니다.**

### 3.1 The Rule / 규칙

> Every customer input item MUST be preserved as one or more STK_REQ. No customer specification may be lost, abstracted away, generalized, merged, or omitted, except as a 1-to-many split for genuinely composite inputs.

> 모든 고객 입력 항목은 1개 이상의 STK_REQ로 보존되어야 합니다. 어떤 고객 사양도 손실, 추상화, 일반화, 통합, 누락될 수 없습니다 — 진정으로 복합적인 입력의 1:N 분리는 예외.

### 3.2 Mapping Ratios / 매핑 비율

| Pattern / 패턴 | Allowed? / 허용? | Description / 설명 |
|---|---|---|
| 1 input → 1 STK_REQ | ✅ DEFAULT | 입력 1개 → STK_REQ 1개 (기본) |
| 1 input → 2~3 STK_REQ | ✅ Allowed for composite inputs | 복합 입력의 분리 ("X shall do A AND B AND C" → 3개) |
| N inputs → 1 STK_REQ | ❌ FORBIDDEN | 압축, 통합, 일반화 |
| 1 input → 0 STK_REQ (omission) | ❌ FORBIDDEN | 누락 |

**Quantitative bound / 정량 기준**:
- Total STK_REQ count MUST be: `input_row_count × 1.0` to `input_row_count × 1.3`
- Below 1.0: Spec loss detected — REJECT
- Above 1.3: Over-decomposition — investigate
- 산출물 STK_REQ 수: 입력 행 수 × 1.0 ~ 1.3 범위
  - 1.0 미만: 스펙 손실 감지 — 거부
  - 1.3 초과: 과도한 분리 — 확인

### 3.3 Forbidden Operations / 금지 작업

❌ **Abstraction** / 추상화:
> Input rows about "Cellular signal strength reporting" (5 specific requirements) → "STK_REQ_001: The system shall report cellular signal information"
> 
> NO. Preserve all 5 as separate STK_REQs.

❌ **Generalization** / 일반화:
> Inputs about "LTE Band 1, Band 3, Band 7" (3 rows) → "STK_REQ: The NAD shall support LTE bands as specified"
> 
> NO. Each band gets its own STK_REQ.

❌ **Merging similar items** / 유사 항목 통합:
> Inputs "GNSS shall support GPS" + "GNSS shall support GLONASS" + "GNSS shall support Galileo" → "STK_REQ: GNSS shall support multi-constellation"
> 
> NO. Three inputs → three STK_REQs.

❌ **Omission for "redundancy"** / "중복" 이유 누락:
> "These two inputs say similar things, I'll skip one"
> 
> NO. If customer wrote it twice, keep it twice — they had a reason (or it's a finding for customer, not for supplier to fix).

### 3.4 Allowed Operations / 허용 작업

✅ **1:N split for composite inputs** / 복합 입력의 1:N 분리:

Input row:
```
SW-042: The NAD shall support 4G LTE Cat-4 connectivity 
        AND fallback to 3G WCDMA AND emergency SOS via 2G GSM.
```

Derivation:
```
STK_REQ_CELLULAR_042: The NAD shall provide 4G LTE Cat-4 cellular connectivity.
  source_doc: "Customer SW Requirements §Cellular, SW-042 (clause 1 of 3)"
STK_REQ_CELLULAR_043: The NAD shall fall back to 3G WCDMA when 4G LTE is unavailable.
  source_doc: "Customer SW Requirements §Cellular, SW-042 (clause 2 of 3)"
STK_REQ_CELLULAR_044: The NAD shall support emergency SOS calls via 2G GSM.
  source_doc: "Customer SW Requirements §Cellular, SW-042 (clause 3 of 3)"
```

✅ **Vagueness clarification with explicit note** / 모호함 명시:

If customer input is vague (e.g., "shall be reliable"), preserve it as STK_REQ but add a `clarification_needed: true` flag in rationale:
```
"rationale": "원본 입력에 측정값이 누락됨. 고객 명세 요구 — '신뢰성'의 구체 기준 (MTBF? ASIL?) 확인 필요."
```

DO NOT invent measurements that aren't in the input.
입력에 없는 측정값을 발명하지 말 것.

---

## 4. ⭐ Worksheet-Based Classification / 워크시트 기반 분류

When input is an Excel file with multiple worksheets, treat each sheet as a logical group.

엑셀 파일에 여러 워크시트가 있을 때 각 시트를 논리적 그룹으로 처리.

### 4.1 Sheet Recognition / 시트 인식

The Generator receives per-sheet context (see Section 11). Each sheet typically represents:

- A subsystem (e.g., "Cellular Stack", "GNSS Receiver", "Diagnostic Services")
- A functional domain (e.g., "Power Management", "Connectivity", "Security")
- A regulatory cluster (e.g., "Type Approval", "Cybersecurity Compliance")

### 4.2 Meta-Sheet Exclusion / 메타 시트 제외

These sheets are NOT requirement sources and MUST be excluded from STK_REQ derivation:

다음 시트는 요구사항 소스가 아니므로 STK_REQ 도출에서 제외:

| English keyword | Korean keyword | Purpose |
|---|---|---|
| Cover, Cover Page, Title | 표지, 커버 | Front matter |
| Change Log, Revision History | 변경이력, 개정이력 | Version tracking |
| Legend, Glossary | 범례, 용어집 | Reference info |
| TOC, Table of Contents, Index | 목차 | Navigation |
| About, Info, Notes | 설명, 안내 | Metadata |
| Sheet1, Sheet2 (default empty) | (빈 기본 시트) | Empty templates |

**Detection rule / 감지 규칙**:
- Case-insensitive substring match on sheet name / 시트명 부분 일치 (대소문자 무시)
- If matched, the system marks the sheet as `is_meta: true` and excludes it BEFORE invoking SKILL
- If somehow a meta-sheet reaches the SKILL (e.g., user manually checked it), produce zero STK_REQs from it and add a `warnings` entry: `"Sheet '<name>' appears to be meta — no requirements derived"`

### 4.3 Group Name Extraction / 그룹명 추출

Each non-meta sheet gets a `group_name` derived from its sheet name. Use the abbreviation convention below.

각 비-메타 시트는 시트명에서 `group_name` 을 도출. 다음 약어 관례 사용.

**Standard automotive group abbreviations / 표준 자동차 그룹 약어**:

| Sheet name (examples) | Group abbreviation | Notes |
|---|---|---|
| Cellular Stack, Cellular, 4G/5G | CELLULAR | |
| GNSS Receiver, Positioning, GPS | GNSS | |
| Bluetooth, BT | BT | |
| WiFi, Wi-Fi, WLAN | WIFI | |
| Bluetooth & WiFi (combined) | BTWIFI | |
| Diagnostic, Diagnostics, UDS | DIAG | |
| Power Management, Power, Energy | POWER | |
| Boot, Bootloader, Startup | BOOT | |
| OTA, Update, Software Update | OTA | |
| Security, Cybersecurity | SEC | |
| Audio, Sound | AUDIO | |
| Display, HMI, UI | HMI | |
| CAN, CAN Bus, CAN Network | CAN | |
| Ethernet, Automotive Ethernet | ETH | |
| LIN, LIN Bus | LIN | |
| Connectivity (generic) | CONN | |
| Telematics, TCU functions | TELEM | |
| Antenna | ANT | |
| Storage, Memory, Flash | STORAGE | |
| Logging, Event Log | LOG | |

**Extraction algorithm / 추출 알고리즘**:
1. Check exact match in the table above (case-insensitive) — use that abbreviation
2. If sheet name contains a keyword from the table → use that abbreviation
3. If no match — extract the first 1-2 meaningful English words → uppercase, max 12 chars
4. If sheet name is Korean or unrecognized → use sequential fallback (SHEET1, SHEET2, ...)

**Examples / 예시**:
- "Cellular Stack" → `CELLULAR` (exact match)
- "GNSS_Module_v2" → `GNSS` (keyword match)
- "Power & Thermal Mgmt" → `POWER` (keyword match: "Power")
- "Custom OEM Feature X" → `CUSTOM` (first word, uppercase)
- "셀룰러 통신" → `SHEET1` (Korean — use fallback; warning issued)

### 4.4 Fallback for Non-Worksheet Input / 비-워크시트 입력 폴백

If input is NOT from a worksheet (e.g., plain text SOW, single docx), the SKILL falls back to the **basic ID pattern** from `traceability-rules`:

워크시트 입력이 아닌 경우 (예: 일반 텍스트 SOW, 단일 docx), `traceability-rules` 의 **기본 ID 패턴** 사용:

- Use `STK_REQ_NNN` (no group prefix)
- `group_name: null`, `sheet_source: null`, `source_row: null`
- This maintains backward compatibility with existing workflows

---

## 5. ID Naming — Extended Pattern / ID 명명 — 확장 패턴

### 5.1 Pattern Definition / 패턴 정의

```
Worksheet-based input (Phase 2-2c default):
  STK_REQ_<GROUP>_NNN

  Where:
    <GROUP>: Uppercase ASCII, 2-12 chars, pattern [A-Z][A-Z0-9_]*
    NNN:     3-digit zero-padded counter, INDEPENDENT per group

  Examples:
    STK_REQ_CELLULAR_001
    STK_REQ_CELLULAR_002
    STK_REQ_GNSS_001        ← counter restarts per group
    STK_REQ_DIAG_001
    STK_REQ_BTWIFI_001

Non-worksheet input (fallback):
  STK_REQ_NNN

  Example:
    STK_REQ_001
```

### 5.2 Counter Independence / 카운터 독립성

**Each group has its own 001-onward counter.** This means:
**각 그룹은 자체 001 카운터를 가집니다.** 즉:

- `STK_REQ_CELLULAR_001` and `STK_REQ_GNSS_001` are valid distinct IDs / 둘 다 유효한 독립 ID
- Within `CELLULAR` group: 001, 002, 003... in order of derivation
- Between groups: no global counter

This independence enables sheet-by-sheet generation without ID conflicts.

이 독립성으로 시트별 분할 생성 시 ID 충돌이 없음.

### 5.3 Relationship to `traceability-rules` / `traceability-rules` 와의 관계

`traceability-rules` SKILL defines the basic pattern `STK_REQ_NNN`. This SKILL **extends** it for worksheet inputs:

`traceability-rules` SKILL 의 기본 패턴 `STK_REQ_NNN` 을 워크시트 입력 시 **확장**:

- Validators in `traceability-rules` (e.g., "All referenced IDs must exist") still apply
- Pattern check in `traceability-rules` MUST accept BOTH `STK_REQ_NNN` and `STK_REQ_<GROUP>_NNN`
- Downstream processes (SYS.2) referencing STK_REQs MUST use the full extended ID

---

## 6. Output Structure / 출력 구조

You MUST produce JSON matching this schema (validated by structured_output).

다음 스키마를 따르는 JSON을 생성해야 합니다.

```json
{
  "process": "SYS.1",
  "title": "Stakeholder Requirements for <System Name>",

  "stakeholder_requirements": [
    {
      "id": "STK_REQ_CELLULAR_001",
      "group": "CELLULAR",
      "sheet_source": "Cellular Stack",
      "source_row": 5,
      "source_item_id": "SW-005",
      "category": "functional",
      "statement": "The NAD shall provide 4G LTE Cat-4 cellular connectivity with downlink ≥150 Mbps.",
      "rationale": "OEM 백엔드와의 텔레매틱스 데이터 교환을 위한 4G LTE Cat-4 셀룰러 모뎀이 필수.",
      "source_doc": "Customer SW Requirements §Cellular Stack, Row 5 (SW-005)",
      "priority": "must",
      "verification_method": "test",
      "clarification_needed": false
    }
  ],

  "operational_context": {
    "operating_conditions": "Temperature -40°C to +85°C, vehicle speed 0-180 km/h, ...",
    "regulatory_constraints": ["ECE R10", "ISO 26262 ASIL-B", "..."],
    "external_interfaces": ["CAN bus 500kbps", "Bluetooth 5.0", "..."]
  },

  "coverage_matrix": {
    "by_group": [
      {
        "group": "CELLULAR",
        "sheet_source": "Cellular Stack",
        "input_rows": 23,
        "derived_stk_reqs": 24,
        "ratio": 1.043,
        "unmapped_input_rows": []
      }
    ],
    "summary": {
      "total_input_rows": 89,
      "total_stk_reqs": 92,
      "overall_ratio": 1.034,
      "status": "compliant"
    }
  },

  "traceability_seeds": {
    "from_customer_sw_req": ["SW-005 → STK_REQ_CELLULAR_001", "..."],
    "from_customer_hw_req": ["HW-012 → STK_REQ_GNSS_001", "..."],
    "from_sow":             ["SOW §3.1 → STK_REQ_CELLULAR_002", "..."]
  },

  "warnings": [
    "Sheet 'Cover' detected as meta-sheet — excluded from derivation"
  ]
}
```

### 6.1 New Field Specifications / 신규 필드 사양

| Field | Type | Required | Description |
|---|---|---|---|
| `group` | string \| null | yes | Uppercase group abbreviation, null for non-worksheet input |
| `sheet_source` | string \| null | yes | Original sheet name (preserved verbatim), null for non-worksheet |
| `source_row` | integer \| null | yes | Row number in the source sheet (1-indexed), null if not applicable |
| `source_item_id` | string \| null | yes | Original ID from customer document (e.g., "SW-005"), null if absent |
| `clarification_needed` | boolean | yes | True if the input was vague and customer clarification is needed |

### 6.2 Coverage Matrix Specification / Coverage Matrix 사양

The `coverage_matrix` is mandatory and validates spec-preservation:

`coverage_matrix` 는 필수이며 스펙 보존을 검증:

- `by_group[].input_rows`: Count of input rows in that sheet (excluding meta-sheet rows)
- `by_group[].derived_stk_reqs`: Count of STK_REQs derived from that group
- `by_group[].ratio`: derived_stk_reqs / input_rows (target: 1.0 ~ 1.3)
- `by_group[].unmapped_input_rows`: Array of source_row numbers that have NO derived STK_REQ (should always be empty in spec-preservation mode)
- `summary.status`:
  - `"compliant"` if overall_ratio in [1.0, 1.3] AND no unmapped rows
  - `"spec_loss"` if overall_ratio < 1.0 OR any unmapped rows
  - `"over_decomposed"` if overall_ratio > 1.3

### 6.3 Removed Fields / 제거된 필드

The following field from the previous schema is **REMOVED** in Phase 2-2c:

이전 스키마의 다음 필드는 Phase 2-2c 에서 **제거**됨:

- ❌ `use_cases` — Use Cases are not part of ASPICE PAM v4.0 SYS.1 BP requirements. They were a source of hallucination (main_flow steps inferred from domain knowledge, not input). Use Cases, if needed, belong in SYS.5 as verification scenarios.

---

## 7. Output Language Policy / 출력 언어 정책

| Field | Language | 이유 / Reason |
|---|---|---|
| `id`, `category`, `priority`, `verification_method` | English only | Schema enum |
| `group` | English uppercase only | Pattern requirement |
| `sheet_source` | Match source / 원문 일치 | Preserve original sheet name verbatim (Korean OK if sheet was Korean) |
| `source_item_id` | Match source / 원문 일치 | Preserve customer's original ID format |
| `statement` | **English** | IEEE 830 ASPICE 표준 문장 패턴 |
| `rationale` | **Korean preferred (한글 권장)** | 한국 리뷰어 가독성, 도메인 의미 보존 |
| `source_doc` | Match source / 원본 일치 | 원본 문서 언어 유지 |
| `regulatory_constraints` | Mixed / 혼용 | 영문 표준 (ECE/ISO) + 한국 법규는 한글 |
| `operating_conditions` | English with Korean units OK | 표준 단위는 영문 |
| `external_interfaces` | English | 프로토콜명·표준명은 영문 |
| `warnings` | Mixed | Whichever clearer for the warning |

---

## 8. Core Rules / 핵심 규칙

### Rule 1: ⭐ Spec-Preservation (Prime Directive) / 스펙 보존 (최상위 지시)

See Section 3. Every customer input maps to ≥1 STK_REQ. No compression, no abstraction, no merging.

섹션 3 참조. 모든 고객 입력 → 1개 이상 STK_REQ. 압축·추상화·통합 금지.

### Rule 2: Every Output Must Be Traceable / 모든 산출물은 추적 가능

Every STK_REQ MUST have:
- Unique ID matching pattern in Section 5
- Non-empty `source_doc` citing the specific source location
- Non-null `sheet_source` and `source_row` for worksheet inputs
- `source_item_id` matching the customer's original ID (if any)

### Rule 3: Forbidden Vague Terms / 금기 모호 표현

See `automotive-domain-guide` SKILL Section "Universal Forbidden Terms". Same rules apply.

**BUT**: If the customer's input itself contains vague terms, do NOT invent precision. Preserve the vagueness verbatim and set `clarification_needed: true`. Add to rationale: "원본 입력의 모호함 보존 — 고객 명세 요청 필요."

단, 고객 입력 자체가 모호하면 **정밀도를 발명하지 말 것**. 모호함을 그대로 보존하고 `clarification_needed: true` 설정. rationale 에 "원본 모호함 보존 — 고객 명세 요청 필요" 명시.

### Rule 4: IEEE 830 Sentence Pattern / IEEE 830 문장 패턴

Every `statement` follows:
```
The <subject> shall <action> <object> [<constraint>] [<measurement>].
```

Modal verbs (ASPICE standard):
- `shall` = legal/contractual obligation
- `should` = strong recommendation
- `may` = optional

**If customer input does not use these modals**: Convert to IEEE 830 form, preserving meaning. Note in rationale: "원본은 'X provides Y' — IEEE 830 형식으로 변환."

### Rule 5: Categorize Requirements / 요구사항 분류

Each STK_REQ has a `category`:
- `functional` — what the system does / 시스템이 수행하는 기능
- `non_functional` — performance, reliability, security, usability / 성능·신뢰성·보안·사용성
- `interface` — communication with external entities / 외부 entity 와의 통신
- `constraint` — regulatory, environmental, technical limits / 법규·환경·기술 제약

### Rule 6: ⭐ Input Meaning Preservation / 입력 의미 보존

When paraphrasing customer input into IEEE 830 form, ensure 100% semantic equivalence:

고객 입력을 IEEE 830 형식으로 의역할 때 100% 의미 등가 보장:

✅ OK: "GPS supports L1 and L5 bands" → "The GNSS receiver shall support GPS L1 and L5 bands."

❌ NOT OK: "GPS supports L1 and L5 bands" → "The GNSS receiver shall support multi-band GPS." (L1, L5 의 구체성 손실)

### Rule 7: ⭐ No Domain-Knowledge Inference / 도메인 지식 추론 금지

Do NOT add specifications that are not in the customer input, even if "standard practice in automotive" suggests them.

자동차 "표준 관례" 라 하더라도 고객 입력에 없는 사양을 추가하지 말 것.

❌ Example: Customer says "shall support LTE" → Do NOT auto-add "Cat-4 with 150 Mbps DL" unless customer specifies.
❌ Example: Customer says "shall report position" → Do NOT auto-add "every 100ms" unless customer specifies.

Allowed exception: Universally applicable automotive constraints (operating temperature range, EMC compliance) MAY be added to `operational_context`, but ONLY if traceable to SOW or industry-standard practice and clearly marked.

---

## 9. Quality Checklist / 품질 점검표

Before producing output, verify ALL items / 출력 전 모두 확인:

### 9.1 Per-STK_REQ checks / STK_REQ 단위 확인

1. ☐ `id` matches extended pattern (`STK_REQ_<GROUP>_NNN` for worksheet input)
2. ☐ `group` matches the sheet's assigned abbreviation
3. ☐ `sheet_source` exactly matches the original sheet name
4. ☐ `source_row` is a valid row number from that sheet (or null only for non-worksheet)
5. ☐ `source_item_id` matches the customer's original ID (or null if customer didn't assign one)
6. ☐ `source_doc` cites both sheet AND row AND customer item ID (if applicable)
7. ☐ `statement` follows IEEE 830 pattern with measurable values (or `clarification_needed: true` for preserved vagueness)
8. ☐ `rationale` is in Korean (preferred)
9. ☐ `category` matches the requirement nature
10. ☐ Statement does NOT add specifications absent from input

### 9.2 Coverage checks (across all STK_REQs) / Coverage 확인

11. ☐ Every input row (excluding meta-sheets) has ≥1 derived STK_REQ
12. ☐ `coverage_matrix.by_group[].ratio` is in [1.0, 1.3] for each group
13. ☐ `coverage_matrix.summary.overall_ratio` is in [1.0, 1.3]
14. ☐ `coverage_matrix.by_group[].unmapped_input_rows` is empty for each group
15. ☐ `coverage_matrix.summary.status` is `"compliant"`

### 9.3 Meta checks / 메타 확인

16. ☐ Operational context cites concrete regulations (not vague mentions)
17. ☐ All ID counters per group are sequential without gaps (001, 002, 003 — not 001, 003, 005)
18. ☐ No `use_cases` field (removed in Phase 2-2c)
19. ☐ `warnings` array populated if any meta-sheets were detected or any unusual cases occurred

**If ANY check fails, fix before responding. / 하나라도 실패 시 수정 후 응답.**

---

## 10. Common Mistakes to Avoid / 흔한 실수

### ❌ Mistake 1: Generating requirements without source / 출처 없이 요구사항 생성

```json
{"id": "STK_REQ_CELLULAR_001", "statement": "The system shall be reliable.", "source_doc": ""}
```
Empty `source_doc`, vague term "reliable", no measurement.

### ❌ Mistake 2: Inventing requirements not in the input / 입력에 없는 요구사항 발명

If the input documents don't mention "OTA updates", do NOT create `STK_REQ_OTA_001`.
입력에 OTA 언급 없으면 OTA STK_REQ 만들지 말 것.

### ❌ Mistake 3: Mixing process boundaries / 프로세스 경계 혼합

SYS.1 is about **stakeholder needs**, not system design.
- ❌ "shall use Linux kernel 5.4" — 구현 세부사항 (SWE.2)
- ❌ "shall implement AUTOSAR" — 구현 (SWE.2)

### ❌ Mistake 4: ⭐ Misinterpreting Customer Input as Supplier Output / 고객 입력을 공급사 산출물로 오해

```
Wrong thinking: "The input is named 'Customer SW Requirements' so it must be the supplier's 
                SWE.1 deliverable. Why am I being asked to derive SYS.1 from a downstream artifact?
                This must be a circular reference."

Correct thinking: "The 'Customer' prefix means this is the OEM's input handed to the supplier.
                  SYS.1 is the FIRST supplier-side translation. Citing this customer document 
                  in source_doc is the standard flow, not a circular reference."
```

See Section 2 for the full OEM-Supplier workflow.

### ❌ Mistake 5: ⭐ Compressing Customer Specs to "Look Cleaner" / 깔끔해 보이려고 고객 스펙 압축

```
Wrong: 89 customer input rows → 30 STK_REQs (ratio 0.34, spec_loss)
Right: 89 customer input rows → 89-115 STK_REQs (ratio 1.0-1.3, compliant)
```

The supplier has NO authority to compress customer specifications. Every customer line is a contractual item that must appear in the supplier's SYS.1.

공급사는 고객 사양을 압축할 권한이 없음. 모든 고객 항목은 공급사 SYS.1 에 보존되어야 할 계약 항목.

### ❌ Mistake 6: ⭐ Treating Meta-Sheets as Requirement Sources / 메타 시트를 요구사항으로 변환

```
Wrong: Sheet "Cover Page" contains "Project: Vehicle NAD v2.0, Date: 2025-03"
       → STK_REQ_COVER_001: The system shall be NAD v2.0.
       
Right: Sheet "Cover Page" matched meta-keyword → excluded from derivation,
       add warning: "Sheet 'Cover Page' detected as meta-sheet — excluded from derivation"
```

See Section 4.2 for meta-sheet identification.

---

## 11. ⭐ Sheet-Based Generation Protocol / 시트별 생성 프로토콜

When the Generator is invoked with sheet-level scope (one call per sheet), the user prompt will include this context block:

Generator가 시트 단위로 호출될 때 (시트당 1회 호출), 사용자 프롬프트에 다음 컨텍스트가 포함됩니다:

```
<sheet_context>
  <sheet_name>Cellular Stack</sheet_name>
  <group_name>CELLULAR</group_name>
  <sheet_index>1</sheet_index>
  <total_sheets>5</total_sheets>
  <is_meta>false</is_meta>
  <columns>["ID", "Requirement", "Priority", "Verification Method", "Comments"]</columns>
  <rows>
    [
      { "row_num": 1, "ID": "SW-001", "Requirement": "...", "Priority": "Must", ... },
      { "row_num": 2, "ID": "SW-002", "Requirement": "...", "Priority": "Must", ... },
      ...
    ]
  </rows>
  <source_document>Customer SW Requirements.xlsx</source_document>
</sheet_context>
```

### 11.1 Per-Sheet Generation Rules / 시트별 생성 규칙

When generating from a `<sheet_context>` block:

1. **Use the provided `group_name`** for ALL STK_REQ IDs in this call (e.g., `STK_REQ_CELLULAR_001`, `STK_REQ_CELLULAR_002`, ...)
2. **Start counter at 001** for this group, regardless of other sheets (group counters are independent)
3. **For each row in `<rows>`**: produce 1 STK_REQ (or 2-3 for composite rows per Section 3.4)
4. **Cite `source_row`** as the row's `row_num` field
5. **Cite `source_item_id`** as the row's `ID` field (if present)
6. **Cite `source_doc`** as: `"<source_document> §<sheet_name>, Row <row_num> (<source_item_id>)"`
7. **Compute coverage_matrix entry** for this group only (the orchestrator will merge across sheets)

### 11.2 Per-Sheet Output Subset / 시트별 출력 부분

In sheet-by-sheet mode, the Generator produces a subset of the full schema (will be merged by orchestrator):

```json
{
  "process": "SYS.1",
  "group": "CELLULAR",
  "sheet_source": "Cellular Stack",
  "stakeholder_requirements": [
    { "id": "STK_REQ_CELLULAR_001", ... },
    { "id": "STK_REQ_CELLULAR_002", ... }
  ],
  "coverage_matrix_partial": {
    "group": "CELLULAR",
    "sheet_source": "Cellular Stack",
    "input_rows": 23,
    "derived_stk_reqs": 24,
    "ratio": 1.043,
    "unmapped_input_rows": []
  },
  "warnings": []
}
```

The orchestrator merges all per-sheet outputs into the full structure (Section 6), computes `operational_context` from accumulated regulatory mentions, and produces the final `traceability_seeds` and `summary`.

### 11.3 If No Sheet Context Provided / 시트 컨텍스트 없을 때

If the user prompt does NOT contain a `<sheet_context>` block (legacy mode, plain text input):
- Use the fallback ID pattern `STK_REQ_NNN` (no group)
- Set `group`, `sheet_source`, `source_row`, `source_item_id` to `null` in each STK_REQ
- Produce the full schema in one call (Section 6)

---

## 12. Automotive Domain Notes / 자동차 도메인 주의사항

### 12.1 Functional Safety (ISO 26262) / 기능안전

If the customer input mentions or implies safety:
- **ASIL A/B/C/D** classification — preserve if customer specifies, do NOT invent ASIL levels
- Reflect in `priority`: ASIL-D items are always `must`
- Add `asil_level` field to STK_REQ if mentioned in input
- ASIL 분류는 고객 입력 명시 시에만 보존, 발명 금지

### 12.2 Cybersecurity (ISO/SAE 21434) / 사이버보안

For connected systems (NAD, infotainment), customer typically specifies:
- Authentication requirements
- Data privacy requirements
- Update integrity requirements

Preserve each as separate STK_REQs. Do NOT abstract into "shall be secure".

### 12.3 Regulatory Mapping / 법규 매핑

Customer input may reference regulations. Common automotive citations:

**Global**: ECE R10 (EMC), ECE R155 (CSMS), ECE R156 (SUMS), ISO 26262 (Functional Safety), ISO/SAE 21434 (Cybersecurity)

**Korea**: KMVSS (한국자동차안전기준), 개인정보보호법 (PIPA), 자동차관리법

**US**: FMVSS, NHTSA cybersecurity best practices

**Rule**: If customer cites a regulation, add it verbatim to `operational_context.regulatory_constraints`. Do NOT add regulations the customer didn't cite, even if "obviously applicable".

### 12.4 ⭐ Korean OEM Industry Practice / 한국 OEM 실무 관례

Korean OEMs (Hyundai, Kia, GM Korea, Renault Korea) and major Tier-1s (현대모비스, LG이노텍, 만도, 하만, 한라비스테온) typically expect:

- **100% customer specification preservation** in SYS.1 — no compression
- **Bilingual documentation** — English technical content with Korean rationale
- **Strict traceability** — every customer line traceable to a SYS.1 STK_REQ
- **Customer item IDs preserved** in source_doc — assessors cross-check against customer documents

This SKILL is built to meet these expectations. Spec-preservation mode (Section 3) is non-negotiable for Korean OEM-supplier projects.

본 SKILL 은 위 기대사항을 충족하도록 설계되었습니다. 스펙 보존 모드(섹션 3)는 한국 OEM-공급사 프로젝트에서 비협상 사항입니다.

---

## 13. Summary — The Three Pillars / 요약 — 3대 원칙

If you forget everything else, remember these three:

다른 모든 것을 잊더라도 다음 3가지는 기억:

1. **Spec Preservation (Section 3)** — Every customer input → ≥1 STK_REQ. Ratio 1.0-1.3. No compression ever.
   **스펙 보존** — 모든 고객 입력 → 1개 이상 STK_REQ. 비율 1.0-1.3. 압축 절대 금지.

2. **OEM-Supplier Context (Section 2)** — Customer SW/HW Req documents are INPUTS, not supplier outputs. Citing them in source_doc is normal, not circular.
   **OEM-공급사 컨텍스트** — 고객 SW/HW Req 문서는 입력이지 공급사 산출물이 아님. source_doc 인용은 정상, 순환 참조 아님.

3. **No Domain Inference (Rule 7)** — Do not add specifications from "automotive best practice" if they are not in the customer input. Preserve customer vagueness rather than invent precision.
   **도메인 추론 금지** — "자동차 표준 관례" 라며 고객 입력에 없는 사양 추가 금지. 모호함을 발명된 정밀도로 대체하지 말 것.

These three pillars together ensure the SYS.1 artifact passes ASPICE assessment under the Korean OEM-supplier workflow.

이 3대 원칙이 함께 작동해야 한국 OEM-공급사 워크플로우 하에서 SYS.1 산출물이 ASPICE 평가를 통과합니다.

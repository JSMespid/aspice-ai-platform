---
name: aspice-sys1-derivation
description: "Use when generating SYS.1 (Stakeholder Requirements Derivation) artifacts for automotive software systems following ASPICE PAM v4.0. Triggers on requests to analyze customer-provided input documents (SOW, Customer SW Requirements, Customer HW Requirements) and derive structured stakeholder requirements with 1:1 spec-preservation traceability. Operates in OEM-Supplier workflow context where input documents are customer deliverables, not supplier work products. Activates when input includes terms like 'SYS.1', '요구사항 도출', 'stakeholder requirements', 'SW 요구사항', 'HW 요구사항', 'SOW', or worksheet-based Excel inputs."
---

# ASPICE SYS.1 — Stakeholder Requirements Derivation Skill
# ASPICE SYS.1 — 이해관계자 요구사항 도출 스킬

**Phase 2-2f.1 Revision** — Spec-Preservation Mode + OEM-Supplier Context + Worksheet-Based Classification + ⭐ Category Stability (Interface-Priority)

> **Changelog**:
> - Phase 2-2c: Spec-Preservation + OEM-Supplier Context + Worksheet Classification
> - Phase 2-2d: Korean warnings + work-product re-registration
> - Phase 2-2f.1 (this revision): Rule 5 확장 — 결정 트리 + Interface-Priority overlap rule + Section 8.5 Category Boundary Examples + Mistake 7

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

### 1.2 ⭐ Output Language at a Glance / 출력 언어 정책 한눈에 보기

**Quick reference for the most language-sensitive fields. 자세한 정책은 Section 7 참조.**

| Field | Language | Note |
|---|---|---|
| `statement` | **English (IEEE 830)** | "The NAD shall ..." |
| `rationale` | **한글 (Korean)** | 한국 리뷰어 가독성 |
| `warnings` | **한글 (Korean)** ⭐ | 영문 표준 용어(AEC-Q100, 3GPP 등)는 보존 — 자세한 가이드는 Section 7.1 |
| `id`, `category`, `priority`, `verification_method` | English (enum) | Schema 고정 |

⚠️ **`warnings` 배열의 모든 항목은 반드시 한글로 작성합니다.** 영문 warnings 는 더 이상 허용되지 않습니다 (Phase 2-2d, 2026-05-19~).
⚠️ **All `warnings` items MUST be written in Korean.** English warnings are no longer acceptable (Phase 2-2d, 2026-05-19~).

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
- If somehow a meta-sheet reaches the SKILL (e.g., user manually checked it), produce zero STK_REQs from it and add a `warnings` entry: `"시트 '<name>'는 메타 시트로 판단되어 요구사항 도출에서 제외되었습니다 (Meta-sheet: no requirements derived)"`

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
    "시트 'Cover'는 메타 시트로 감지되어 요구사항 도출에서 제외되었습니다."
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
| `warnings` | **Korean preferred (한글 우선)** | 한국 리뷰어 가독성. AI 생성 시 한글로 작성. 단, 영문 표준 용어 (e.g., AEC-Q100, 3GPP, ASIL-D, SoC) 는 영문 그대로 유지 |

### 7.1 ⭐ Warnings 한글 작성 가이드 / Korean Warnings Guidelines

**핵심 원칙 / Core Principle**:
`warnings` 배열의 각 항목은 **한국어로 작성**합니다. 한국 자동차 OEM/Tier 1/Tier 2 엔지니어가 직접 읽고 즉시 이해할 수 있도록 합니다.

Each item in the `warnings` array MUST be written in Korean. Korean automotive OEM/Tier 1/Tier 2 engineers should be able to read and immediately understand them.

**한글 문장 패턴 / Korean Sentence Patterns**:

| 영문 패턴 | ❌ 잘못된 예 (영문) | ✅ 올바른 예 (한글) |
|---|---|---|
| Row N contains... | "Row 41 and Row 42 contain identical text..." | "행 41과 행 42에 동일한 요구사항 텍스트가 있어 스펙 보존 원칙에 따라 모두 보존했습니다 — 의도적 중복인지 또는 별개 조건/축인지 고객 확인 권장." |
| N rows are marked... | "15 rows are marked 'N/A' by the customer..." | "15개 행(행 12, 13, 14, 19, 21, 22, 25, 32, 33, 38, 39, 40, 45, 46, 82)이 고객에 의해 'N/A'로 표시되어 placeholder STK_REQ로 보존(clarification_needed=true) — 원본 요구사항 컬럼에 서술 텍스트가 없어 N/A 처리만 가능." |
| Several rows contain... | "Several rows contain only 'Yes' without description" | "여러 행(24, 26, 27, 36, 47)이 Requirement 컬럼에 서술 없이 'Yes'만 포함 — 원본 feature 설명이 SKILL이 보지 못한 다른 컬럼에 있을 가능성. clarification_needed=true로 보존." |
| Coverage ratio reflects... | "Coverage ratio 0.958 reflects..." | "Coverage ratio 0.958은 90개 실제 요구사항 행(행 2~91) 중 92개 STK_REQ를 도출한 결과 (메타 행 92~97 제외 시 92/90 = 1.022, 준수)." |
| Row #N is composite... | "Row #1 is composite (3 distinct clauses): split into..." | "행 #1 (row_num=2)은 3개의 별도 조항(Linux 업그레이드 / CVE 정정 / 알려진 취약점 없음)을 포함하는 복합 문장 — 1:N 규칙에 따라 STK_REQ_NAD_001~003으로 분할." |
| Row N: ... clarification | "Row 23 (China eCall): Tier 2 comment notes..." | "행 23 (중국 eCall): Tier 2 코멘트가 EU 규제 기준임을 명시 — 중국 전용 eCall 요구사항은 별도 명세 필요로 플래그 표시." |
| Multiple rows (Tier 2 status 'N/A')... | "Multiple rows (Tier 2 status 'N/A'): #19, #20..." | "다수 행(Tier 2 상태 'N/A'): #19, #20, #36, #37, #38, #39, #40 (HPLMN timer, SAR, MIPI, NV 항목) 및 #55-#58 (RTT) — 스펙 보존 원칙에 따라 priority='could' + clarification_needed=true로 STK_REQ 생성. |
| Requirements marked 'Supported w/ NRE'... | "Several requirements marked 'Supported w/ NRE' or 'Supported w/ Restrictions'..." | "Tier 2(LGIT)가 'Supported w/ NRE' 또는 'Supported w/ Restrictions'로 표시한 여러 요구사항을 원문 그대로 보존 — 상업적 범위에 대한 고객 확인은 kickoff 시 권장." |

**중요 규칙 / Key Rules**:

1. **영문 표준 용어는 유지**: `AEC-Q100`, `3GPP Release 16`, `ASIL-D`, `IEEE 830`, `MIPI`, `eCall`, `SoC`, `eUICC`, `SIM`, `DRX`, `HPLMN`, `SAR`, `RTT`, `NRE` 등 자동차/통신 표준 약어 및 영문 ID 는 그대로 유지.

2. **행/열 표기는 한글**: "Row N" → "행 N", "Column" → "컬럼", "rows" → "행들"

3. **자연스러운 한글 문장**: 영문 직역이 아닌 자연스러운 한국어. 예: "are preserved" → "보존했습니다", "is composite" → "복합 문장"

4. **종결어미 일관성**: 한 warning 안에서 종결어미 통일. 예: "~보존했습니다" / "~필요합니다" / "~권장" (명사형 종결도 OK).

5. **숫자/단위는 영문**: "104.2~164.2 kHz", "<-10 dBuV", "≤200ms p99" 등 측정값은 영문 그대로.

6. **추적성 정보 보존**: 영문 ID/행 번호/시트명은 그대로 인용. "행 23 (China eCall)" — 영문 식별자 보존하면서 한글 설명 추가.

**Output expectation**:
모든 신규 AI 생성에서 `warnings` 배열의 모든 항목은 한글로 작성됩니다. 영문 warnings 는 더 이상 허용되지 않습니다.

All new AI generations MUST produce Korean `warnings`. English warnings are no longer acceptable.

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

### Rule 5: ⭐ Categorize Requirements — Deterministic Decision Tree / 요구사항 분류 — 결정 트리

**원칙 / Principle**: 같은 입력 행은 언제 분류하든 **반드시 같은 카테고리**가 나와야 합니다. 분류는 "느낌"이 아니라 결정 트리에 따른 기계적 판정입니다.

The same input row MUST yield the same category every time it is classified. Classification follows a deterministic decision tree, not intuition.

**⭐ Overlap Rule (가장 중요) / Most Important**:
요구사항이 **둘 이상의 카테고리에 모두 해당될 때** (예: 행위 + 외부 채널), 결정 트리의 **위쪽 단계가 항상 승리**합니다. 특히 `interface` 와 `functional` 이 동시에 해당되면 **항상 `interface`** 로 분류합니다.

When a requirement matches multiple categories (e.g., action + external channel), the **earlier step in the decision tree always wins**. In particular, when both `interface` and `functional` apply, classify as **`interface`** every time.

**4개 카테고리 / Four Categories**:

| Category | 한 줄 정의 / One-line definition | 핵심 동사 / Key verbs |
|---|---|---|
| `constraint` | 외부 권위/환경/표준이 부과하는 한계 또는 의무 | shall comply with, shall not exceed, shall be within, shall operate at |
| `interface` | 외부 시스템·신호·물리 채널과의 통신 또는 그 사양 (프로토콜·대역·커넥터·외부 entity 명시) | shall support, shall provide, shall expose, shall transmit/receive/report over, shall pair/connect with |
| `non_functional` | 정량 가능한 품질 속성 (행동 자체보다는 행동의 "얼마나 잘") | shall achieve, shall meet, shall maintain (a metric) |
| `functional` | 외부 채널/entity 명시 없이 시스템이 수행하는 내부 행위·상태·반응 | shall calculate, validate, maintain (state), trigger, switch (internal mode) |

**결정 트리 / Decision Tree** (위에서부터 순서대로 적용, 첫 매치가 승리 / apply top-down, first match wins):

```
Step 1 — constraint?
  ├─ 법규/표준 명시 (ECE Rxx, ISO xxxxx, KMVSS, FCC, AEC-Q100, 3GPP TS xx.xxx)?
  ├─ 안전 분류 (ASIL-A/B/C/D, SIL-x, QM)?
  ├─ 환경 한계 (-40°C~+85°C, vibration profile, IP67)?
  ├─ 전압/전류/전력 한계 (shall not exceed N W, shall operate at N V)?
  └─ 인증 의무 (shall be type-approved, shall comply with...)?
   → YES: category = "constraint"
   → NO:  go to Step 2

Step 2 — interface? (⭐ 광의로 적용: 외부 채널/entity 가 언급되면 무조건 여기서 멈춤)
  ├─ 특정 무선/유선 프로토콜 명시 (LTE Band N, 5G NR, BT 5.x, WiFi 6, NFC)?
  ├─ 자동차 네트워크 명시 (CAN 500kbps, CAN-FD, LIN, FlexRay, Ethernet 100BASE-T1)?
  ├─ 물리 커넥터/버스 (USB-C, MIPI CSI-2, I2C, SPI, UART)?
  ├─ 외부 entity 명시 (안테나, SIM/eUICC, GNSS satellites, OEM 백엔드 server, eCall PSAP)?
  ├─ "지원·제공·노출" 동사 + 외부 명세 (shall support/provide/expose <외부 사양>)?
  └─ 행위 동사 + 위의 외부 채널/entity 가 함께 등장? (shall transmit/receive/report/log/download OVER/VIA/TO/FROM <외부 채널>)
   → YES: category = "interface"  ⭐ 행위 동사가 있어도 외부 채널이 명시되면 여기서 멈춤
   → NO:  go to Step 3

Step 3 — non_functional?
  ├─ 정량화된 품질 메트릭 (latency, throughput, MTBF, availability, accuracy, jitter, BER, VSWR)?
  ├─ 보안 속성 자체 (shall be encrypted, shall authenticate, shall be tamper-resistant)?
  ├─ 응답성/처리시간 (response time ≤ N ms)?
  └─ 행위 명시 없이 "얼마나 잘"만 명시?
   → YES: category = "non_functional"
   → NO:  go to Step 4

Step 4 — functional (외부 채널/entity 가 전혀 언급되지 않은 순수 내부 행위만):
  └─ 시스템이 무엇을 "하는지"를 기술하되, 외부 채널/entity 명시 없음
     (calculate from internal data, validate internally, maintain internal state, trigger internal alert, ...)
   → category = "functional"
```

**중요 / Important**:
- 한 요구사항이 여러 카테고리에 걸치면 결정 트리의 **위쪽 단계가 무조건 승리**합니다 — 직관으로 뒤집지 마세요.
- 특히 Step 2 (interface) 는 **광의로 적용**합니다: 행위 동사가 있더라도 외부 채널·entity 가 함께 명시되면 interface 로 분류합니다. 이 규칙으로 분류 결정성을 보장하고, 같은 입력 → 같은 카테고리가 매 런마다 재현됩니다.
- `functional` 은 **외부 채널/entity 가 전혀 언급되지 않은 순수 내부 행위만**을 위한 카테고리입니다.

When a requirement straddles categories, the earlier step ALWAYS wins — do not override by intuition. Step 2 (interface) is applied **broadly**: even if an action verb is present, the presence of an external channel/entity puts the requirement in interface. This guarantees classification determinism. `functional` is reserved for **purely internal behaviors with no external channel/entity mentioned**.

See Section 8.5 for boundary examples and the worked decision-tree walkthroughs.

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

### Section 8.5 — ⭐ Category Boundary Examples (Interface-Priority Rule Applied) / 카테고리 경계 예시 (Interface 우선 규칙 적용)

이 섹션은 Rule 5 결정 트리 — 특히 **`interface` 와 `functional` 이 겹칠 때 항상 `interface` 가 승리** — 를 풀이 예시로 보여줍니다.

This section illustrates Rule 5's decision tree — specifically that **`interface` always wins over `functional` when both apply** — through worked examples.

#### 8.5.1 ⭐ The Channel-Mention Test / 채널 언급 테스트

요구사항을 분류하기 전 한 가지만 묻습니다:

Before classifying, ask one question:

> **"이 행에 특정 외부 채널·프로토콜·커넥터·entity 가 이름으로 언급되어 있는가?"**
> **"Does this row name a specific external channel, protocol, connector, or entity?"**

| 답 | 다음 단계 |
|---|---|
| YES (외부 채널/entity 언급 있음) | → Step 2 (interface). 행위 동사가 있어도 결과는 **interface**. |
| NO (외부 채널/entity 언급 전혀 없음) | → Step 3 (non_functional) 또는 Step 4 (functional) 평가 |

이 단순 테스트가 `interface` 와 `functional` 사이의 흔들리는 분류를 결정적으로 만들어줍니다.

This simple test deterministically resolves the wobble between `interface` and `functional`.

#### 8.5.2 Worked Examples (Interface-Priority) / 풀이 예시

| # | 원본 입력 | 분류 | 이유 |
|---|---|---|---|
| E1 | "The NAD shall support LTE Band 1, Band 3, Band 7." | **interface** | 채널 사양 명시 (LTE Band). Step 2. |
| E2 | "The NAD shall report position every 100ms over LTE." | **interface** | 행위 + 외부 채널(LTE) 동시 등장 → ⭐ Overlap → **interface 승리**. Step 2. |
| E3 | "Bluetooth shall comply with BT 5.0 specification." | **interface** | 외부 표준 명시 (BT 5.0). Step 2. |
| E4 | "The system shall pair with up to 5 Bluetooth devices." | **interface** | 행위(pair) + 외부 채널(Bluetooth) → ⭐ Overlap → **interface 승리**. Step 2. |
| E5 | "CAN bus shall operate at 500 kbps." | **interface** | 채널 사양 (CAN + 속도). Step 2. |
| E6 | "The system shall transmit DTCs over CAN upon request." | **interface** | 행위(transmit) + 외부 채널(CAN) → ⭐ Overlap → **interface 승리**. Step 2. |
| E7 | "The NAD shall provide UART at 115200 baud, 8N1." | **interface** | 커넥터 사양 (UART + 속도/포맷). Step 2. |
| E8 | "The NAD shall log boot events to UART for debugging." | **interface** | 행위(log) + 외부 커넥터(UART) → ⭐ Overlap → **interface 승리**. Step 2. |
| E9 | "The antenna shall achieve VSWR ≤ 1.5 at 1575.42 MHz (GPS L1)." | **non_functional** | 핵심은 정량 메트릭 (VSWR). 행위 동사 없음. Step 3. ※경계 사례 — 1575.42 MHz 는 채널 식별이지만, achieve+VSWR 메트릭이 핵심이고 행위 동사 부재. |
| E10 | "The system shall comply with ECE R10 for EMC." | **constraint** | 법규 명시. Step 1 (최우선). |
| E11 | "The system shall encrypt OTA payloads using AES-256." | **non_functional** | 보안 속성 자체 (암호화 알고리즘). 외부 채널 명시 없음 (OTA "payloads" 은 데이터, 채널 아님). Step 3. |
| E12 | "The system shall download OTA packages from the backend server." | **interface** | 행위(download) + 외부 entity(backend server) → ⭐ Overlap → **interface 승리**. Step 2. |
| E13 | "The system shall validate firmware integrity before booting." | **functional** | 행위 + 외부 채널 언급 없음. 순수 내부 행위. Step 4. |
| E14 | "The system shall maintain an internal state machine for power modes." | **functional** | 내부 상태. 외부 entity 없음. Step 4. |
| E15 | "The system shall calculate position using available satellite data." | **functional** | 내부 계산. 위성 데이터는 입력이지만 채널·프로토콜·entity 명시 없음. Step 4. (참고: 만약 "from GNSS satellites via NMEA over UART" 였다면 interface.) |
| E16 | "The system shall trigger an internal alert when temperature exceeds 85°C." | **functional** | 내부 트리거. 외부 채널 없음. Step 4. |

#### 8.5.3 Why Interface-Priority? / 왜 Interface 우선인가?

NAD (Network Access Device) 와 같은 통신 장치에서는 거의 모든 요구사항이 외부 채널과 연관됩니다. 이때 분류자(LLM)는 매 런마다 "이 행위는 functional 인가 interface 인가" 를 다시 판단하게 되어 분류가 흔들립니다.

For connectivity devices like NAD (Network Access Device), nearly every requirement involves external channels. The classifier (LLM) re-decides "is this functional or interface" each run, causing classification instability.

**해결책 / Solution**: 두 카테고리가 모두 적용 가능할 때 **무조건 `interface`** 로 결정. 모호함 제거 → 같은 입력 → 같은 카테고리.

When both categories apply, **always choose `interface`**. Ambiguity removed → same input → same category.

#### 8.5.4 What's Left in `functional`? / `functional` 에 남는 것은?

이 규칙 하에서 `functional` 은 다음만을 위한 카테고리:

Under this rule, `functional` is reserved for:

- 순수 내부 계산 (calculate, validate, compute) — 외부 채널 명시 없이
- 내부 상태 관리 (maintain state, switch mode, manage)
- 내부 데이터 처리 (process input, sanitize, transform) — 채널 명시 없이
- 내부 트리거/판정 (trigger internal alert, decide, evaluate) — 채널 명시 없이

`functional` 후보를 만났을 때 마지막 확인: **"이 행에 어떤 외부 채널·프로토콜·entity 도 이름으로 언급되어 있지 않은가?"** YES 라면 `functional`. NO (하나라도 언급) 라면 `interface`.

When considering `functional`, final check: **"Does this row mention NO external channel, protocol, or entity by name?"** YES → `functional`. NO (any mention) → `interface`.

#### 8.5.5 Self-Check Before Assigning Category / 카테고리 할당 전 자가 점검

각 STK_REQ 의 카테고리를 결정하기 전, 내부적으로 다음을 묻습니다 (출력에는 포함하지 않음):

Before assigning each STK_REQ's category, internally answer (do NOT include in output):

1. ☐ Step 1 (constraint): 법규·표준·환경·안전등급·인증 명시 있는가? YES → constraint. NO → 다음.
2. ☐ Step 2 (interface): 외부 채널·프로토콜·커넥터·entity 가 이름으로 언급되어 있는가? YES → **interface (행위 동사 무시)**. NO → 다음.
3. ☐ Step 3 (non_functional): 정량 메트릭이 핵심이고 행위 동사가 없는가? YES → non_functional. NO → 다음.
4. ☐ Step 4 (functional): 외부 채널 언급 전혀 없이 순수 내부 행위만 기술하는가? YES → functional.

자기 검증: 같은 행을 한 번 더 분류한다고 가정. 같은 답이 나오는가? 다르다면 결정 트리를 다시 위에서부터 적용.

Self-check: re-classify the same row mentally. Same answer? If not, re-apply the tree top-down.

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
9. ☐ `category` matches the requirement nature per Rule 5
9a. ☐ ⭐ `category` was assigned by applying the Rule 5 decision tree **top-down** (Section 8.5.5), not by intuition. Re-classifying the same row would yield the same category.
9b. ☐ ⭐ When the row mentions any external channel/protocol/connector/entity (even alongside an action verb), `category` = `interface` (Interface-Priority rule per Section 8.5.1). `functional` is reserved for rows with NO external channel mention.
9a. ☐ ⭐ `category` 는 Rule 5 결정 트리(Section 8.5.5)를 **위에서부터 순차** 적용해 결정함. 같은 행을 다시 분류해도 같은 답이 나옴.
9b. ☐ ⭐ 행에 외부 채널·프로토콜·커넥터·entity 가 언급되면 (행위 동사와 함께라도) `category` = `interface` (Interface-Priority, Section 8.5.1). `functional` 은 외부 채널 언급이 전혀 없는 순수 내부 행위에만 사용.
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
20. ☐ ⭐ All `warnings` items are written in Korean (한글) per Section 7.1 (영문 표준 용어 보존 OK; e.g., AEC-Q100, 3GPP, ASIL)

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

### ❌ Mistake 7: ⭐ Inconsistent Categorization Between Runs / 런 간 일관되지 않은 카테고리 분류

이번 패치에서 추가된, 가장 중요한 실수 유형입니다. (Phase 2-2f.1 에서 추가)

This is the most important new mistake type added in this patch (Phase 2-2f.1).

**증상 / Symptom**:
```
같은 입력 (예: NAD0519 SW + HW 워크시트) → 두 번 생성
Run 1 결과: interface 72개, functional 54개
Run 2 결과: interface 23개, functional 103개  ← 같은 행 49개가 두 카테고리 사이에서 뒤집힘
```

같은 input → 같은 output 이어야 합니다. 카테고리 흔들림은 결정 트리를 적용하지 않았다는 신호.

Same input → same output. Category flips signal that the decision tree was not applied.

**원인 / Cause**:
- "feel" 기반 분류 (이 행은 functional 같아 / 이 행은 interface 같아 — 매 런마다 다름)
- Overlap 규칙 무시 — interface 와 functional 둘 다 적용 가능할 때 임의 선택

**올바른 접근 / Correct approach**:

1. Section 8.5.1 의 Channel-Mention Test 를 먼저 적용:
   "이 행에 외부 채널·프로토콜·entity 가 이름으로 언급되어 있는가?"
2. YES → **interface** (행위 동사가 있어도). 결정 완료.
3. NO → Step 3 (non_functional) 또는 Step 4 (functional) 평가.

**Wrong** (직관에 의존):
```
Row: "shall transmit DTCs over CAN upon request"
Run 1 thinking: "transmit 는 행위니까 functional"  → functional
Run 2 thinking: "CAN 은 외부 채널이니까 interface" → interface  ← 같은 행, 다른 결과!
```

**Right** (Interface-Priority 결정 트리 적용):
```
Row: "shall transmit DTCs over CAN upon request"
Channel-Mention Test: "CAN" 명시 → YES → Step 2 → interface (확정)
다시 분류해도: "CAN" 명시 → YES → Step 2 → interface (같은 답)  ✅
```

분류는 결정 트리에 의한 기계적 판정이지 직관이 아닙니다. 카테고리가 런마다 뒤바뀐다면 결정 트리를 적용하지 않은 것입니다.

Classification is mechanical via decision tree, not intuition. If category flips between runs, the decision tree was not applied.

See Section 8.5 for the full tree, the Interface-Priority overlap rule, and 16 worked examples (E1–E16).

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

## 13. Summary — The Four Pillars / 요약 — 4대 원칙

If you forget everything else, remember these four:

다른 모든 것을 잊더라도 다음 4가지는 기억:

1. **Spec Preservation (Section 3)** — Every customer input → ≥1 STK_REQ. Ratio 1.0-1.3. No compression ever.
   **스펙 보존** — 모든 고객 입력 → 1개 이상 STK_REQ. 비율 1.0-1.3. 압축 절대 금지.

2. **OEM-Supplier Context (Section 2)** — Customer SW/HW Req documents are INPUTS, not supplier outputs. Citing them in source_doc is normal, not circular.
   **OEM-공급사 컨텍스트** — 고객 SW/HW Req 문서는 입력이지 공급사 산출물이 아님. source_doc 인용은 정상, 순환 참조 아님.

3. **No Domain Inference (Rule 7)** — Do not add specifications from "automotive best practice" if they are not in the customer input. Preserve customer vagueness rather than invent precision.
   **도메인 추론 금지** — "자동차 표준 관례" 라며 고객 입력에 없는 사양 추가 금지. 모호함을 발명된 정밀도로 대체하지 말 것.

4. ⭐ **Classification Determinism (Rule 5 + Section 8.5)** — Apply the decision tree top-down: constraint → interface → non_functional → functional. **When `interface` and `functional` overlap, ALWAYS choose `interface`**. Same input → same category every run.
   **분류 결정성** — 결정 트리를 위에서부터 적용: constraint → interface → non_functional → functional. **`interface` 와 `functional` 이 겹치면 항상 `interface`** 선택. 같은 입력 → 매 런마다 같은 카테고리.

These four pillars together ensure the SYS.1 artifact passes ASPICE assessment under the Korean OEM-supplier workflow with reproducible classification.

이 4대 원칙이 함께 작동해야 한국 OEM-공급사 워크플로우 하에서 SYS.1 산출물이 ASPICE 평가를 통과하며, 재현 가능한 분류를 보장합니다.

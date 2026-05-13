---
name: aspice-sys1-derivation
description: "Use when generating SYS.1 (Stakeholder Requirements Derivation) artifacts for automotive software systems following ASPICE PAM v4.0. Triggers on requests to analyze stakeholder needs (SOW, HW/SW requirements, user expectations) and derive structured stakeholder requirements with traceability. Activates when input includes terms like 'SYS.1', '요구사항 도출', 'stakeholder requirements', 'SW 요구사항', 'HW 요구사항', 'SOW'."
---

# ASPICE SYS.1 — Stakeholder Requirements Derivation Skill
# ASPICE SYS.1 — 이해관계자 요구사항 도출 스킬

## Purpose / 목적

Generate compliant SYS.1 stakeholder requirements artifacts for automotive software development per ASPICE PAM v4.0.

ASPICE PAM v4.0 에 부합하는 자동차 SW 개발용 SYS.1 이해관계자 요구사항 산출물을 생성합니다.

SYS.1 is the entry point of the V-Model. Its quality dictates the quality of all downstream processes (SYS.2, SYS.5).

SYS.1 은 V-Model 의 출발점이며, 이후 모든 프로세스(SYS.2, SYS.5)의 품질을 결정합니다.

## Core Rules / 핵심 규칙

### Rule 1: Every Output Must Be Traceable / 모든 산출물은 추적 가능해야 함

Every stakeholder requirement (STK_REQ_*) MUST:
모든 STK_REQ 는 반드시:

- Have a unique ID following the pattern `STK_REQ_NNN` (NNN = 3-digit zero-padded)
  (고유 ID: `STK_REQ_NNN` 패턴, 3자리 zero-padded)
- Reference its source in `source_doc` field with section/page citation
  (`source_doc` 필드에 섹션/페이지 단위로 출처 명시)
- Be testable / verifiable
  (시험 가능 / 검증 가능해야 함)

### Rule 2: Forbidden Vague Terms / 금기 모호 표현

Reject these terms outright. They are ASPICE non-compliance triggers.
다음 표현은 ASPICE 비준수 트리거이므로 절대 사용 금지.

| Category / 범주 | Forbidden / 금기 | Replace with / 대체 |
|---|---|---|
| Speed / 속도 | "fast", "quick", "real-time" (수치 없이) | "≤200ms p99" 같은 bounded latency |
| Quality / 품질 | "good", "user-friendly", "intuitive" | 측정 가능한 task completion metric |
| Frequency / 빈도 | "often", "rarely" | 구체 주기 (예: "every 100ms") |
| Capacity / 용량 | "many", "enough", "sufficient" | 측정 가능 임계값 |

Examples / 예시:

- ❌ "The system shall respond fast"
- ✅ "The system shall respond within 200ms (p99) under nominal load"
- ❌ "Storage shall be sufficient"
- ✅ "Storage shall hold ≥1000 messages or ≥10MB, whichever is larger"

### Rule 3: Use IEEE 830 Sentence Pattern / IEEE 830 문장 패턴 사용

Every statement must follow:
모든 statement 는 다음 패턴을 따라야 함:

```
The <subject> shall <action> <object> [<constraint>] [<measurement>].
```

Modal verb 의 의미 차이 (ASPICE 표준):
- **shall** = 법적/계약적 강제 사항 (must do)
- **should** = 강한 권고 (highly recommended)
- **may** = 선택 사항 (optional)

Examples / 예시:

- "The headlamp ECU shall switch from low-beam to high-beam within 80ms when the dark-environment sensor reading drops below 5 lux."
- "The NAD shall reject Bluetooth pairing requests after 3 failed PIN attempts within 60 seconds."

### Rule 4: Categorize Requirements / 요구사항 분류

Each STK_REQ_* must have a `category` / 각 STK_REQ 는 다음 중 하나의 `category` 보유:

- `functional` — what the system does / 시스템이 수행하는 기능
- `non_functional` — performance, reliability, security, usability / 성능·신뢰성·보안·사용성
- `interface` — communication with external entities / 외부 entity 와의 통신
- `constraint` — regulatory, environmental, technical limits / 법규·환경·기술 제약

## Output Structure / 출력 구조

You MUST produce JSON matching this schema (validated by structured_output):

```json
{
  "process": "SYS.1",
  "title": "Stakeholder Requirements for <System Name>",
  "stakeholder_requirements": [
    {
      "id": "STK_REQ_001",
      "category": "functional",
      "statement": "The <subject> shall <action>...",
      "rationale": "이 요구사항이 존재하는 이유 (1~2문장)",
      "source_doc": "SW Requirements v1.2, Section 3.4",
      "priority": "must" | "should" | "could",
      "verification_method": "test" | "analysis" | "inspection" | "demonstration"
    }
  ],
  "use_cases": [
    {
      "id": "UC_001",
      "name": "Short Use Case Name",
      "actor": "Driver" | "Passenger" | "External System" | "Service Tech",
      "preconditions": ["..."],
      "main_flow": ["Step 1", "Step 2"],
      "postconditions": ["..."],
      "linked_requirements": ["STK_REQ_001", "STK_REQ_003"]
    }
  ],
  "operational_context": {
    "operating_conditions": "Temperature -40°C to +85°C, vehicle speed 0-180 km/h, ...",
    "regulatory_constraints": ["ECE R10", "ISO 26262 ASIL-B", "..."],
    "external_interfaces": ["CAN bus 500kbps", "Bluetooth 5.0", "..."]
  },
  "traceability_seeds": {
    "from_sw_req": ["SW-REQ-001 → STK_REQ_001", "..."],
    "from_hw_req": ["HW-REQ-001 → STK_REQ_002", "..."],
    "from_sow":    ["SOW-§3.1 → STK_REQ_003", "..."]
  }
}
```

## Output Language Policy / 출력 언어 정책

생성하는 산출물의 각 필드는 다음 언어를 사용:

| Field | Language | 이유 / Reason |
|---|---|---|
| `id`, `category`, `priority`, `verification_method` | English only | Schema 표준 enum |
| `statement` | **English** | IEEE 830 ASPICE 표준 문장 패턴 |
| `rationale` | **Korean preferred (한글 권장)** | 한국 리뷰어 가독성, 도메인 의미 보존 |
| `source_doc` | Match source / 원본 일치 | 원본 문서 언어 유지 |
| `regulatory_constraints` | Mixed / 혼용 | 영문 표준 (ECE/ISO) + 한국 법규는 한글 |
| `operating_conditions` | English with Korean units OK | 표준 단위는 영문 |
| `external_interfaces` | English | 프로토콜명·표준명은 영문 |

### Korean Rationale Examples / 한글 rationale 예시

✅ Good / 좋은 예:
```json
{
  "id": "STK_REQ_001",
  "statement": "The NAD shall provide 4G LTE Cat-4 cellular connectivity with downlink ≥150 Mbps.",
  "rationale": "OEM 백엔드와의 텔레매틱스 데이터 교환을 위한 4G LTE Cat-4 셀룰러 모뎀이 필수이며, 3GPP Release 16 호환은 TCU 스트리밍 및 OTA 사용 시나리오 충족에 필요함."
}
```

❌ Bad / 나쁜 예 (영문 rationale):
```json
{
  "id": "STK_REQ_001",
  "statement": "The NAD shall provide 4G LTE Cat-4 cellular connectivity with downlink ≥150 Mbps.",
  "rationale": "Required for telematics data exchange with OEM backend."
}
```

## Quality Checklist / 품질 점검표

Before producing output, verify / 출력 전 다음 확인:

1. ☐ **Every** STK_REQ_* has `source_doc` / 모든 STK_REQ 가 출처 보유
2. ☐ **Every** STK_REQ_* has measurable values where applicable / 측정 가능값
3. ☐ **No** forbidden vague terms / 금기 모호 표현 없음
4. ☐ **All** STK_REQ_* IDs follow `STK_REQ_NNN` pattern / ID 패턴 준수
5. ☐ Use cases reference existing STK_REQ_* IDs only / 존재하는 STK_REQ 만 참조
6. ☐ Operational context cites concrete regulations / 구체 법규 인용
7. ☐ **Rationale fields are in Korean** / rationale 은 한글

If ANY check fails, fix before responding. / 하나라도 실패 시 수정 후 응답.

## Common Mistakes to Avoid / 흔한 실수

### ❌ Mistake 1: Generating requirements without source

```json
{"id": "STK_REQ_001", "statement": "The system shall be reliable."}
```
Missing `source_doc`, vague term "reliable", no measurement.
출처 누락 + 모호 표현 "reliable" + 측정값 없음.

### ❌ Mistake 2: Inventing requirements not in the input

If the input documents don't mention "OTA updates", do NOT create `STK_REQ_X for OTA`.
입력 문서에 "OTA"가 없으면 OTA 관련 STK_REQ 만들지 말 것.

Stick to what's in the input. / 입력에 있는 것만 사용.

### ❌ Mistake 3: Mixing process boundaries

SYS.1 is about **stakeholder needs**, not system design.
SYS.1 은 **이해관계자 니즈** 이지 시스템 설계가 아님.

피해야 할 표현:
- "shall use Linux kernel 5.4" — 구현 세부사항 (SWE.2 영역)
- "shall implement AUTOSAR" — 동일

## Automotive Domain Notes / 자동차 도메인 주의사항

### Functional Safety (ISO 26262) / 기능안전

If the system has safety implications / 안전 영향이 있으면:
- **ASIL A/B/C/D** based on hazard analysis from SOW
- Reflect in `priority`: ASIL-D items are always `must`
- ASIL 분류는 SOW 의 위험성 분석 기반

### Cybersecurity (ISO/SAE 21434) / 사이버보안

For connected systems (NAD, infotainment) / 연결성 있는 시스템:
- Authentication requirements / 인증 요구사항
- Data privacy requirements / 데이터 프라이버시
- Update integrity requirements / 업데이트 무결성

### Regulatory Mapping / 법규 매핑

Common regulations / 자주 인용되는 법규:

**Global / 국제**:
- ECE R10 (EMC)
- ECE R79 (Steering)
- ECE R155 (CSMS — cybersecurity management)
- ECE R156 (SUMS — software update management)
- ISO 26262 (Functional Safety)
- ISO/SAE 21434 (Cybersecurity Engineering)

**Korea / 한국**:
- KMVSS (한국자동차안전기준) — 국토교통부령
- 개인정보보호법 (PIPA) — 차량 내 개인정보
- 자동차관리법 — 자율주행 관련 조항 (제30조의5 등)

**US / 미국**:
- FMVSS (Federal Motor Vehicle Safety Standards)
- NHTSA cybersecurity best practices

---
name: automotive-domain-guide
description: "Use whenever generating ANY ASPICE work product for automotive software (SYS.1-SYS.5, SWE.1-SWE.6). Provides cross-cutting domain rules: regulatory constraints, terminology consistency, environmental conditions, ISO 26262 functional safety classifications, Korean regulatory context (KMVSS, PIPA), and forbidden vague terms common to all automotive specifications."
---

# Automotive Domain Common Guide
# 자동차 도메인 공통 가이드

## Purpose / 목적

Cross-cutting rules for all automotive ASPICE work products.
모든 자동차 ASPICE 산출물에 공통 적용되는 규칙.

Activates alongside any SYS.* or SWE.* skill. Provides consistency across processes.
SYS.* / SWE.* 어떤 skill 과도 함께 활성화. 프로세스 간 일관성 보장.

## Universal Forbidden Terms / 절대 금기어

These terms are forbidden in ALL automotive ASPICE artifacts. They cause ASPICE assessment findings.
모든 자동차 ASPICE 산출물에서 금지. ASPICE 평가에서 결함(finding)으로 처리됨.

### Vague Performance / 모호한 성능
- "fast", "slow", "quick", "rapid"
- "real-time" without bounded latency / bounded latency 없는 "실시간"
- "instantly", "immediately" / "즉시", "바로"

### Vague Quantity / 모호한 수량
- "many", "few", "several" / "많은", "적은", "여러"
- "high", "low" (without thresholds) / 임계값 없는 "높은", "낮은"
- "enough", "sufficient", "adequate" / "충분한", "적절한"

### Vague Quality / 모호한 품질
- "good", "bad", "excellent"
- "user-friendly", "intuitive", "easy to use" / "사용 편의적", "직관적"
- "robust", "reliable" (use ISO 26262 language instead) / ISO 26262 용어 사용

### Vague Frequency / 모호한 빈도
- "often", "sometimes", "rarely" / "자주", "가끔", "드물게"
- "as needed", "when necessary" / "필요시"

## Required Substitutions / 권장 대체

Always replace forbidden terms with measurable values:
금기어는 반드시 측정 가능 값으로 대체.

| Vague / 모호 | Replace with / 대체 | Example / 예시 |
|---|---|---|
| "fast" | latency in ms | "≤200ms p99" |
| "reliable" | MTBF or ASIL | "MTBF ≥10,000h" or "ASIL-B" |
| "robust" | failure tolerance | "shall continue operation with 1 sensor failure" |
| "user-friendly" | task completion metrics | "shall complete pairing in ≤3 user actions" |
| "real-time" | bounded response time | "shall respond within 50ms" |

## Standard Operating Conditions / 표준 운영 조건

For automotive systems, ALWAYS include applicable conditions:
자동차 시스템은 적용 가능한 조건을 반드시 포함.

### Environmental / 환경

- **Temperature / 온도**:
  - Interior / 실내: -40°C ~ +85°C
  - Engine bay / 엔진룸: -40°C ~ +125°C
- **Humidity / 습도**: 0% ~ 95% RH non-condensing
- **Vibration / 진동**: per ISO 16750-3
- **EMC**: per ECE R10 / CISPR 25

### Operational / 운영

- **Vehicle speed / 차속**:
  - Passenger vehicles / 승용: 0 ~ 180 km/h
  - Sport / 고성능: up to 250 km/h
- **Battery voltage / 배터리 전압**:
  - 12V system: 9V ~ 16V nominal
  - 24V system: 18V ~ 32V
- **Ignition states / IGN 상태**: OFF / ACC / RUN / START

### Use Modes / 사용 모드

- **Normal operation / 정상 동작**
- **Limp-home mode / 림프홈 모드** (degraded / 성능 저하 상태)
- **Service mode / 정비 모드** (diagnostic / 진단용)
- **Production mode / 생산 모드** (factory / 공장)

## Functional Safety (ISO 26262) / 기능안전

If the work product touches safety-critical functions, classify ASIL:
안전 critical 기능 관련 산출물은 ASIL 분류 필수.

| ASIL | Severity / 심각도 | Examples / 예시 |
|---|---|---|
| ASIL-D | Highest / 최고 | 제동 제어, 조향, 에어백 전개 |
| ASIL-C | High / 높음 | 주행 중 헤드램프 자동 조절, ESC 서브시스템 |
| ASIL-B | Medium / 중간 | 크루즈컨트롤 설정 속도, 안전벨트 경고 |
| ASIL-A | Low / 낮음 | 실내등 밝기, 인포테인먼트 볼륨 |
| QM | None (품질관리만) | 미적 기능, 안전 무관 편의 기능 |

For ASIL-rated requirements / ASIL 등급 요구사항:
- Add `asil_level` field to requirement
- Verification method MUST be "test" (not just "analysis")
- Must reference safety goal SG_* / 안전 목표 SG_* 참조 필수

## Cybersecurity (ISO/SAE 21434) / 사이버보안

For connected systems (NAD, infotainment, OTA-capable):
연결 가능 시스템 (NAD, 인포테인먼트, OTA):

- Threat model reference (TARA — Threat Analysis and Risk Assessment) / 위협 모델
- Authentication / 인증: mTLS, OAuth, etc.
- Data classification / 데이터 분류: public / internal / confidential / secret

## Korean Automotive Context / 한국 자동차 컨텍스트

When dealing with Korean OEMs/Tier-1s (현대/기아/LG이노텍/현대모비스 등):
한국 OEM/Tier-1 대응 시:

### Common Regulations / 주요 법규
- **KMVSS** (한국자동차안전기준) — 국토교통부령
- **자동차관리법 시행규칙** — 국토교통부 규정
- **개인정보보호법** (PIPA) — 차량 내 개인정보 수집/이용
- **위치정보의 보호 및 이용 등에 관한 법률** (LBS Act) — 위치정보 처리

### Common Suppliers / 주요 공급사
- LGIT (LG이노텍) — NAD, Telematics, Camera
- 현대모비스 (Hyundai Mobis) — ECU, Brake, Steering
- 만도 (Mando) — Chassis, Brake, Steering
- 한라비스테온 (Hanon Systems) — HVAC, Thermal
- 삼성전자 하만 (Harman) — Infotainment

### Korean Project Naming / 한국 프로젝트 명명 관례

Often use English names with Korean comments. Maintain English for technical IDs (STK_REQ_001) but allow Korean for `rationale` and human-readable text.

영문 명칭 + 한글 주석이 일반적. 기술 ID는 영문 유지, rationale 등은 한글 권장.

## Terminology Consistency / 용어 일관성

### Use ASPICE PAM v4.0 Terminology / ASPICE 표준 용어 사용

| Use / 사용 | NOT / 사용 금지 |
|---|---|
| Stakeholder Requirements / 이해관계자 요구사항 | "User Requirements" / "사용자 요구사항" |
| System Requirements / 시스템 요구사항 | "High-Level Requirements" / "상위 요구사항" |
| Software Requirements / SW 요구사항 | "App Requirements" / "앱 요구사항" |
| Verification / 검증 | "Testing" alone (testing 은 verification 의 일부) |
| Validation / 확인 | "Acceptance" alone |

### Domain-Specific Terms / 도메인 용어

| Use / 사용 | NOT / 금지 |
|---|---|
| ECU (Electronic Control Unit) | "Computer", "Module", "Box" |
| MCU (Microcontroller Unit) | "Chip", "Processor" |
| CAN / LIN / FlexRay / Ethernet | "Network", "Bus" alone |
| Diagnostic Service / 진단 서비스 | "Debug Function" / "디버그 기능" |

## Output Quality Bar / 출력 품질 기준

Every artifact must / 모든 산출물 필수:

1. **Cite source / 출처 인용** — Every requirement traces to a source document
2. **Use measurable values / 측정 가능값** — Never use vague terms
3. **Reference regulations / 법규 참조** — When applicable, cite ECE/ISO/KMVSS
4. **Maintain consistency / 일관성** — Use same term for same concept throughout
5. **Specify conditions / 조건 명시** — Operating conditions, modes, edge cases

If you find yourself writing a requirement without these elements, STOP and revise.
이 요소들 없이 요구사항 작성 시 멈추고 수정.

## Output Language for Automotive Domain / 자동차 도메인 출력 언어

| Field type | Language Policy |
|---|---|
| Technical IDs (STK_REQ, SYS_REQ 등) | English only / 영문만 |
| Statement (shall ...) | English (IEEE 830 표준) |
| Rationale / 근거 | **Korean preferred / 한글 권장** |
| Regulatory citations | Match original / 원문 일치 (ECE 영문, KMVSS 한글) |
| Operating conditions | English with units / 영문 + 단위 |
| Interface specs (CAN, LIN 등) | English / 영문 (표준 용어) |
| Safety classifications (ASIL-X) | English / 영문 (ISO 26262 표준) |

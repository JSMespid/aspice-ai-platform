---
name: automotive-domain-guide
description: "Use whenever generating ANY ASPICE work product for automotive software (SYS.1-SYS.5, SWE.1-SWE.6). Provides cross-cutting domain rules: regulatory constraints, terminology consistency, environmental conditions, ISO 26262 functional safety classifications, and forbidden vague terms common to all automotive specifications."
---

# Automotive Domain Common Guide

## Purpose

Cross-cutting rules for all automotive ASPICE work products. Activates alongside any SYS.* or SWE.* skill. Provides consistency across processes.

## Universal Forbidden Terms

These terms are forbidden in ALL automotive ASPICE artifacts. They cause ASPICE assessment findings.

### Vague Performance
- "fast", "slow", "quick", "rapid"
- "real-time" without bounded latency
- "instantly", "immediately"

### Vague Quantity
- "many", "few", "several"
- "high", "low" (without thresholds)
- "enough", "sufficient", "adequate"

### Vague Quality
- "good", "bad", "excellent"
- "user-friendly", "intuitive", "easy to use"
- "robust", "reliable" (use ISO 26262 language instead)

### Vague Frequency
- "often", "sometimes", "rarely"
- "as needed", "when necessary"

## Required Substitutions

Always replace forbidden terms with measurable values:

| Vague Term | Replace With | Example |
|---|---|---|
| "fast" | latency in ms | "≤200ms p99" |
| "reliable" | MTBF or ASIL level | "MTBF ≥10,000h" or "ASIL-B" |
| "robust" | failure tolerance | "shall continue operation with 1 sensor failure" |
| "user-friendly" | task completion metrics | "shall complete pairing in ≤3 user actions" |
| "real-time" | bounded response time | "shall respond within 50ms" |

## Standard Operating Conditions

For automotive systems, ALWAYS include applicable conditions:

### Environmental
- Temperature: -40°C to +85°C (interior) / -40°C to +125°C (engine bay)
- Humidity: 0% to 95% RH non-condensing
- Vibration: per ISO 16750-3
- EMC: per ECE R10 / CISPR 25

### Operational
- Vehicle speed: 0 to 180 km/h (most passenger vehicles) / up to 250 km/h (sport)
- Battery voltage: 9V to 16V nominal (12V system) / 18V to 32V (24V system)
- Ignition states: OFF / ACC / RUN / START

### Use Modes
- Normal operation
- Limp-home mode (degraded)
- Service mode (diagnostic)
- Production mode (factory)

## Functional Safety (ISO 26262) — When to Apply

If the work product touches safety-critical functions, classify ASIL:

| ASIL | Severity | Examples |
|---|---|---|
| ASIL-D | Highest | Brake control, steering, airbag deployment |
| ASIL-C | High | Headlamp aim adjust during driving, ESC subsystems |
| ASIL-B | Medium | Cruise control set-speed, seat-belt warning |
| ASIL-A | Low | Interior lighting brightness, infotainment volume |
| QM | None (Quality Management only) | Cosmetic features, non-safety convenience |

For ASIL-rated requirements:
- Add `asil_level` field to requirement
- Verification method MUST be "test" (not just "analysis")
- Must reference safety goal SG_*

## Cybersecurity (ISO/SAE 21434) — When to Apply

For connected systems (NAD, infotainment, OTA-capable):
- Add threat model reference (TARA — Threat Analysis and Risk Assessment)
- Specify authentication (mTLS, OAuth, etc.)
- Specify data classification (public / internal / confidential / secret)

## Korean Automotive Context

When dealing with Korean OEMs/Tier-1s (현대/기아/LG이노텍/현대모비스 etc.):

### Common Regulations
- KMVSS (한국자동차안전기준)
- 국토교통부 자동차관리법 시행규칙

### Common Suppliers' Systems
- LGIT (LG이노텍) NAD/Telematics
- 현대모비스 (Mobis) ECU
- 만도 (Mando) chassis/brake
- 한라비스테온 (Hanon Systems) HVAC

### Korean Project Names
Often use English names with Korean comments. Maintain English for technical IDs (STK_REQ_001) but allow Korean for `rationale` and human-readable text.

## Terminology Consistency

### Use ASPICE PAM v4.0 Terminology

| Use | NOT |
|---|---|
| Stakeholder Requirements | "User Requirements" |
| System Requirements | "High-Level Requirements" |
| Software Requirements | "App Requirements" |
| Verification | "Testing" (testing is a subset of verification) |
| Validation | "Acceptance" (validation is broader) |

### Domain-Specific Terms

| Use | NOT |
|---|---|
| ECU (Electronic Control Unit) | "Computer", "Module", "Box" |
| MCU (Microcontroller Unit) | "Chip", "Processor" |
| CAN/LIN/FlexRay/Ethernet | "Network", "Bus" alone |
| Diagnostic Service | "Debug Function" |

## Output Quality Bar

Every artifact must:

1. **Cite source** — Every requirement traces to a source document
2. **Use measurable values** — Never use vague terms
3. **Reference regulations** — When applicable, cite ECE/ISO/KMVSS
4. **Maintain consistency** — Use same term for same concept throughout
5. **Specify conditions** — Operating conditions, modes, edge cases

If you find yourself writing a requirement without these elements, STOP and revise.

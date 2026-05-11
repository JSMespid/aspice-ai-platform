---
name: aspice-sys1-derivation
description: "Use when generating SYS.1 (Stakeholder Requirements Derivation) artifacts for automotive software systems following ASPICE PAM v4.0. Triggers on requests to analyze stakeholder needs (SOW, HW/SW requirements, user expectations) and derive structured stakeholder requirements with traceability. Activates when input includes terms like 'SYS.1', '요구사항 도출', 'stakeholder requirements', 'SW 요구사항', 'HW 요구사항', 'SOW'."
---

# ASPICE SYS.1 — Stakeholder Requirements Derivation Skill

## Purpose

Generate compliant SYS.1 stakeholder requirements artifacts for automotive software development per ASPICE PAM v4.0. SYS.1 is the entry point of the V-Model and dictates the quality of all downstream processes (SYS.2, SYS.5).

## When to Use

- User input contains SW/HW requirements documents and SOW
- User asks to derive stakeholder requirements (STK_REQ_*)
- User mentions "SYS.1", "요구사항 도출", or "Stakeholder Requirements"

## Core Rules — Non-Negotiable

### Rule 1: Every Output Must Be Traceable

Every stakeholder requirement (STK_REQ_*) MUST:
- Have a unique ID following the pattern `STK_REQ_NNN` (NNN = 3-digit zero-padded)
- Reference its source in `source_doc` field (SW/HW/SOW)
- Be testable (link to verification criteria)

### Rule 2: Forbidden Vague Terms

Reject these terms outright. They are ASPICE non-compliance triggers:
- **Speed/Performance**: "fast", "quick", "real-time" without numbers
- **Quality**: "good", "high quality", "user-friendly", "intuitive"
- **Frequency**: "often", "rarely", "sometimes"
- **Capacity**: "many", "few", "enough", "sufficient"

ALWAYS replace with measurable values. Examples:
- ❌ "The system shall respond fast"
- ✅ "The system shall respond within 200ms (p99)"
- ❌ "Storage shall be sufficient"
- ✅ "Storage shall hold ≥1000 messages or ≥10MB, whichever is larger"

### Rule 3: Use IEEE 830 Sentence Pattern

Every requirement must follow:
```
The <subject> shall <action> <object> [<constraint>] [<measurement>].
```

Examples (good):
- "The headlamp ECU shall switch from low-beam to high-beam within 80ms when the dark-environment sensor reading drops below 5 lux."
- "The NAD shall reject Bluetooth pairing requests after 3 failed PIN attempts within 60 seconds."

### Rule 4: Categorize Requirements

Each STK_REQ_* must have a `category`:
- `functional` — what the system does
- `non_functional` — performance, reliability, security, usability
- `interface` — communication with external entities
- `constraint` — regulatory, environmental, technical limits

## Output Structure

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
      "rationale": "Why this requirement exists (1-2 sentences)",
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

## Quality Checklist (Self-Apply Before Returning)

Before producing output, verify:

1. ☐ **Every** STK_REQ_* has `source_doc` (no orphans)
2. ☐ **Every** STK_REQ_* has measurable values where applicable
3. ☐ **No** forbidden vague terms (see Rule 2)
4. ☐ **All** STK_REQ_* IDs follow `STK_REQ_NNN` pattern
5. ☐ Use cases reference existing STK_REQ_* IDs only
6. ☐ Operational context cites concrete regulations (ECE/ISO/SAE)

If ANY check fails, fix before responding.

## Common Mistakes to Avoid

### ❌ Generating requirements without source

```json
{"id": "STK_REQ_001", "statement": "The system shall be reliable."}
```
Missing `source_doc`, vague term "reliable", no measurement.

### ❌ Inventing requirements not in the input

If the input documents don't mention "OTA updates", do NOT create `STK_REQ_X for OTA`. Stick to what's in the input.

### ❌ Mixing process boundaries

SYS.1 is about **stakeholder needs**, not system design. Avoid:
- "shall use Linux kernel 5.4" — this is implementation detail (belongs to SWE.2)
- "shall implement AUTOSAR" — same

## Domain Notes — Automotive Specific

### Functional Safety (ISO 26262)

If the system has safety implications, classify:
- **ASIL A/B/C/D** based on hazard analysis from SOW
- Reflect in `priority`: ASIL-D items are always `must`

### Cybersecurity (ISO/SAE 21434)

For connected systems (NAD, infotainment), include:
- Authentication requirements
- Data privacy requirements
- Update integrity requirements

### Regulatory Mapping

Common Korean/EU/US regulations:
- ECE R10 (EMC)
- ECE R79 (Steering)
- ECE R155 (CSMS — cybersecurity)
- ECE R156 (SUMS — software updates)
- KMVSS (Korean MVSS)
- FMVSS (US)

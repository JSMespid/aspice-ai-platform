// 환각 방지 축 2 (추적성) + 축 3 (도메인 제약) 검증기

// ──────────────────────────────────────────────────
// 축 2: 추적성 검증
// ──────────────────────────────────────────────────
export function checkTraceability(output, processConfig, prevContents = {}) {
  const issues = [];

  for (const rule of processConfig.traceabilityRules ?? []) {
    try {
      const violations = rule.check(output, prevContents);
      if (violations && violations.length > 0) {
        violations.forEach((v, i) => {
          issues.push({
            id: `TRACE-${rule.type}-${String(i + 1).padStart(3, "0")}`,
            severity: rule.severity,
            category: "Traceability",
            description: `${rule.message}: ${formatViolation(v)}`,
            location: typeof v === "object" ? JSON.stringify(v) : String(v),
            recommendation: `${rule.message} 항목을 보완하거나 추적 링크를 추가하세요.`,
            source: "Phase 4 - Traceability",
            rule_type: rule.type,
          });
        });
      }
    } catch (e) {
      issues.push({
        id: `TRACE-ERR-${rule.type}`,
        severity: "Info",
        category: "Traceability",
        description: `규칙 ${rule.type} 실행 실패: ${e.message}`,
        location: rule.type,
        recommendation: "이전 단계 산출물이 없거나 구조가 다를 수 있습니다. 스키마를 확인하세요.",
        source: "Phase 4 - Traceability",
      });
    }
  }

  return issues;
}

function formatViolation(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    if (v.id) return v.id;
    if (v.req && v.missing) return `${v.req} → ${v.missing}`;
    if (v.test && v.missing) return `${v.test} → ${v.missing}`;
    return JSON.stringify(v).slice(0, 80);
  }
  return String(v);
}

// ──────────────────────────────────────────────────
// 축 3: 도메인 제약 검증
// ──────────────────────────────────────────────────
export function checkDomainConstraints(output, processConfig) {
  const issues = [];
  const c = processConfig.domainConstraints ?? {};

  // 1) 금지 용어 검사
  if (c.forbiddenTerms) {
    const allText = JSON.stringify(output).toLowerCase();
    for (const term of c.forbiddenTerms) {
      const re = new RegExp(`\\b${term.toLowerCase()}\\b`, "g");
      const matches = allText.match(re);
      if (matches && matches.length > 0) {
        issues.push({
          id: `DOMAIN-FORBIDDEN-${term}`,
          severity: "Major",
          category: "Verifiability",
          description: `금지된 모호 용어 "${term}" 발견 (${matches.length}회)`,
          location: "산출물 전체",
          recommendation: `"${term}"을 측정 가능한 수치/기준으로 대체하세요. 예: "fast" → "0.5초 이내"`,
          source: "Phase 2 - Deterministic",
          term,
        });
      }
    }
  }

  // 2) 필수 키워드 검사
  if (c.requiredKeywords) {
    for (const [field, keywords] of Object.entries(c.requiredKeywords)) {
      const items = collectStringField(output, field);
      const violators = items.filter(item =>
        !keywords.some(kw => item.value.toLowerCase().includes(kw.toLowerCase()))
      );
      violators.forEach(v => {
        issues.push({
          id: `DOMAIN-MISSING-KW-${v.path}`,
          severity: "Minor",
          category: "Structure",
          description: `필수 키워드 누락 (${keywords.join(" 또는 ")})`,
          location: v.path,
          recommendation: `요구사항 문장에 "${keywords[0]}" 키워드를 사용하세요. 예: "The system shall ..."`,
          source: "Phase 2 - Deterministic",
        });
      });
    }
  }

  // 3) ID 패턴 검사
  if (c.idPatterns) {
    for (const [name, pattern] of Object.entries(c.idPatterns)) {
      const ids = collectStringField(output, "id");
      const violators = ids.filter(({ value }) => {
        // 패턴이 해당하는 ID에만 적용 (다른 prefix는 다른 패턴 사용)
        const prefix = value.split("-")[0];
        const expectedPrefix = name.replace(/_/g, "-");
        if (prefix === expectedPrefix.split("-")[0]) {
          return !pattern.test(value);
        }
        return false;
      });
      violators.forEach(v => {
        issues.push({
          id: `DOMAIN-ID-FMT-${v.value}`,
          severity: "Major",
          category: "Structure",
          description: `ID 형식 위반: "${v.value}" (예상 패턴: ${pattern.source})`,
          location: v.path,
          recommendation: `ID를 패턴 ${pattern.source}에 맞게 수정하세요.`,
          source: "Phase 2 - Deterministic",
        });
      });
    }
  }

  // 4) ID 중복 검사
  const allIds = collectStringField(output, "id").map(x => x.value);
  const idCounts = {};
  allIds.forEach(id => { idCounts[id] = (idCounts[id] ?? 0) + 1; });
  Object.entries(idCounts).filter(([, n]) => n > 1).forEach(([id, n]) => {
    issues.push({
      id: `DOMAIN-DUP-ID-${id}`,
      severity: "Critical",
      category: "Structure",
      description: `ID 중복: "${id}" (${n}회 사용됨)`,
      location: id,
      recommendation: `각 항목에 고유한 ID를 부여하세요.`,
      source: "Phase 2 - Deterministic",
    });
  });

  // 5) 측정 가능한 수치 검사 (요구사항에 한해서)
  if (c.requireMeasurableValues) {
    const descs = collectStringField(output, "description");
    const numberPattern = /\d+\s*(ms|s|sec|초|m|km|mph|kph|%|°|°C|N|Hz|kHz|MHz|V|A|W|dB|lux|lm)/i;
    descs.filter(d => d.path.includes("requirement") && !numberPattern.test(d.value)).forEach(d => {
      issues.push({
        id: `DOMAIN-NO-NUMBER-${d.path}`,
        severity: "Minor",
        category: "Verifiability",
        description: `측정 가능한 수치 단위가 없는 요구사항`,
        location: d.path,
        recommendation: `정량적 기준을 추가하세요 (예: 시간 ms, 길이 m, 속도 km/h).`,
        source: "Phase 2 - Deterministic",
      });
    });
  }

  return issues;
}

// 객체 트리에서 특정 필드명의 모든 값을 수집 (path와 함께)
function collectStringField(obj, fieldName, path = "") {
  const results = [];
  if (obj === null || obj === undefined) return results;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      results.push(...collectStringField(item, fieldName, `${path}[${i}]`));
    });
  } else if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      if (key === fieldName && typeof value === "string") {
        results.push({ path: newPath, value });
      }
      if (typeof value === "object") {
        results.push(...collectStringField(value, fieldName, newPath));
      }
    }
  }
  return results;
}

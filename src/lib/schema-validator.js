// 경량 JSON Schema 검증기 (Ajv 없이 핵심만 구현)
// 환각 방지 축 1: 구조 강제

export function validateSchema(data, schema, path = "") {
  const errors = [];

  if (schema.type) {
    const actualType = Array.isArray(data) ? "array" : typeof data;
    if (actualType !== schema.type) {
      errors.push({ path, message: `Expected ${schema.type}, got ${actualType}` });
      return errors; // 타입이 틀리면 더 검사 의미 없음
    }
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push({ path, message: `Expected const "${schema.const}", got "${data}"` });
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `Value "${data}" not in enum [${schema.enum.join(", ")}]` });
  }

  if (schema.pattern) {
    const re = new RegExp(schema.pattern);
    if (typeof data === "string" && !re.test(data)) {
      errors.push({ path, message: `"${data}" does not match pattern ${schema.pattern}` });
    }
  }

  if (schema.minLength !== undefined && typeof data === "string" && data.length < schema.minLength) {
    errors.push({ path, message: `String too short (${data.length} < ${schema.minLength})` });
  }

  if (schema.type === "object") {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in data)) {
          errors.push({ path: `${path}.${key}`, message: `Missing required field "${key}"` });
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          errors.push(...validateSchema(data[key], subSchema, `${path}.${key}`));
        }
      }
    }
  }

  if (schema.type === "array") {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ path, message: `Array too short (${data.length} < ${schema.minItems})` });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({ path, message: `Array too long (${data.length} > ${schema.maxItems})` });
    }
    if (schema.items) {
      data.forEach((item, i) => {
        errors.push(...validateSchema(item, schema.items, `${path}[${i}]`));
      });
    }
  }

  return errors;
}

// 검증 실패를 QA Issue로 변환
export function schemaErrorsToIssues(errors) {
  return errors.map((err, i) => ({
    id: `SCHEMA-${String(i + 1).padStart(3, "0")}`,
    severity: "Critical",
    category: "Structure",
    description: `구조 위반: ${err.message}`,
    location: err.path || "(root)",
    recommendation: "AI 재생성 필요 — 스키마에 맞는 필드와 타입을 갖춘 산출물로 재요청하세요.",
    source: "Phase 1 - Schema Validation",
  }));
}

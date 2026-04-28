// Eval Harness — 골든 데이터셋 자동 채점
// 사용법:
//   node evals/runner.js                  # 전체 실행
//   node evals/runner.js --dataset=headlamp-sys1-001
//   node evals/runner.js --process=SYS.4  # 특정 프로세스만
//
// 환경변수:
//   ANTHROPIC_API_KEY (필수)
//   GEMINI_API_KEY (필수, Phase 3 검증용)
//   API_BASE_URL (옵션, 기본 http://localhost:3000)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────────
// CLI 인자 파싱
// ──────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const m = arg.match(/^--(\w+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// ──────────────────────────────────────────────────
// 데이터셋 로드
// ──────────────────────────────────────────────────
async function loadDatasets() {
  const dir = path.join(__dirname, 'datasets');
  const files = await fs.readdir(dir);
  const datasets = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const content = await fs.readFile(path.join(dir, f), 'utf8');
    datasets.push(JSON.parse(content));
  }
  return datasets;
}

// ──────────────────────────────────────────────────
// LLM 호출 (Claude via API endpoint)
// ──────────────────────────────────────────────────
async function generateViaAPI(processId, input) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: `당신은 ASPICE 4.0 ${processId} 전문가입니다. 마크다운 없이 완전한 JSON만 출력하세요.`,
      messages: [{ role: 'user', content: buildPrompt(processId, input) }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.content?.map(b => b.text || '').join('') || '';
  return parseJSON(text);
}

function buildPrompt(processId, input) {
  let prompt = `프로젝트: ${input.project.name}\n도메인: ${input.project.domain}\n\n`;
  prompt += `컨텍스트:\n${input.context}\n`;
  for (const [pid, content] of Object.entries(input.prev_contents || {})) {
    prompt += `\n[이전 단계 — ${pid}]\n${JSON.stringify(content, null, 2)}\n`;
  }
  prompt += `\n${processId} 산출물을 JSON으로 생성하세요.`;
  return prompt;
}

function parseJSON(text) {
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  }
  throw new Error('JSON 파싱 실패');
}

// ──────────────────────────────────────────────────
// 채점기
// ──────────────────────────────────────────────────
function grade(output, dataset) {
  const checks = [];
  const inv = dataset.expected_invariants;

  // 구조 검증
  if (inv.structural) {
    const struct = inv.structural;
    if (struct.min_needs && output.needs) {
      checks.push(rangeCheck('needs_count', output.needs.length, struct.min_needs, struct.max_needs));
    }
    if (struct.min_requirements && output.requirements) {
      checks.push(rangeCheck('requirements_count', output.requirements.length,
                              struct.min_requirements, struct.max_requirements));
    }
    if (struct.min_test_cases && output.test_cases) {
      checks.push(rangeCheck('test_cases_count', output.test_cases.length, struct.min_test_cases, 99));
    }
    if (struct.id_patterns) {
      for (const [field, pattern] of Object.entries(struct.id_patterns)) {
        const items = output[field] ?? [];
        const re = new RegExp(pattern);
        const allMatch = items.every(item => re.test(item.id));
        checks.push({ name: `id_pattern_${field}`, pass: allMatch, score: allMatch ? 1 : 0 });
      }
    }
  }

  // 도메인 검증
  if (inv.domain) {
    const allText = JSON.stringify(output).toLowerCase();
    if (inv.domain.forbidden_terms_zero_count) {
      for (const term of inv.domain.forbidden_terms_zero_count) {
        const re = new RegExp(`\\b${term}\\b`, 'g');
        const hits = (allText.match(re) || []).length;
        checks.push({
          name: `no_forbidden_${term}`,
          pass: hits === 0, score: hits === 0 ? 1 : 0,
          detail: hits > 0 ? `발견: ${hits}회` : null,
        });
      }
    }
    if (inv.domain.shall_keyword_required_in === 'requirements.description' && output.requirements) {
      const allHaveShall = output.requirements.every(r => r.description?.toLowerCase().includes('shall'));
      checks.push({ name: 'shall_keyword', pass: allHaveShall, score: allHaveShall ? 1 : 0 });
    }
    if (inv.domain.automotive_terms_present) {
      const presentCount = inv.domain.automotive_terms_present
        .filter(t => allText.includes(t.toLowerCase())).length;
      const ratio = presentCount / inv.domain.automotive_terms_present.length;
      checks.push({
        name: 'automotive_terms',
        pass: ratio >= 0.5,
        score: ratio,
      });
    }
  }

  // 추적성 검증
  if (inv.traceability) {
    if (inv.traceability.every_requirement_traces_to_need && output.requirements && output.needs) {
      const needIds = new Set(output.needs.map(n => n.id));
      const allTrace = output.requirements.every(r =>
        (r.source_needs ?? []).every(nid => needIds.has(nid))
      );
      checks.push({ name: 'all_reqs_trace', pass: allTrace, score: allTrace ? 1 : 0 });
    }
    if (inv.traceability.no_orphan_needs && output.needs && output.requirements) {
      const referencedNeeds = new Set(output.requirements.flatMap(r => r.source_needs ?? []));
      const orphans = output.needs.filter(n => !referencedNeeds.has(n.id));
      checks.push({
        name: 'no_orphan_needs',
        pass: orphans.length === 0,
        score: orphans.length === 0 ? 1 : 0,
        detail: orphans.length > 0 ? `고아: ${orphans.map(o => o.id).join(', ')}` : null,
      });
    }
  }

  // V-Model 추적 (★ 대표님 정정사항 ★)
  if (inv.v_model_tracing) {
    const v = inv.v_model_tracing;
    if (v.primary_target_must_be_interface && output.test_cases) {
      const allOK = output.test_cases.every(tc => {
        const target = tc.primary_target?.interface_id;
        return target && /^IF-\d{3}$/.test(target);
      });
      checks.push({
        name: 'sys4_primary_is_interface',
        pass: allOK, score: allOK ? 1 : 0,
        detail: !allOK ? '★ 대표님 정정사항 위반 ★' : null,
      });
    }
    if (v.must_NOT_directly_trace_to_stk_req && output.test_cases) {
      // STK-REQ 직접 참조가 있는지 (primary_target, integrated_elements에서)
      const hasDirect = output.test_cases.some(tc => {
        const json = JSON.stringify({
          primary_target: tc.primary_target,
          integrated_elements: tc.integrated_elements,
        });
        return /STK-REQ-/.test(json);
      });
      checks.push({
        name: 'sys4_no_direct_stk_req',
        pass: !hasDirect, score: !hasDirect ? 1 : 0,
        detail: hasDirect ? '★ 통합 테스트가 STK-REQ를 직접 추적함 (위반)' : null,
      });
    }
    if (v.system_requirements_must_be_present && output.test_cases) {
      const allHave = output.test_cases.every(tc => {
        const sr = tc.system_requirements ?? [];
        return sr.length > 0 && sr.every(r => /^SYS-REQ-(F|NF)-\d{3}$/.test(r));
      });
      checks.push({
        name: 'sys5_primary_is_sys_req',
        pass: allHave, score: allHave ? 1 : 0,
        detail: !allHave ? '★ 대표님 정정사항 위반 ★' : null,
      });
    }
  }

  // 총점
  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = total > 0 ? checks.reduce((s, c) => s + (c.score ?? 0), 0) / total : 0;

  return {
    score,
    passed,
    total,
    pass_overall: score >= dataset.minimum_score,
    checks,
  };
}

function rangeCheck(name, value, min, max) {
  const pass = value >= min && value <= max;
  return {
    name, pass, score: pass ? 1 : 0,
    detail: !pass ? `값=${value}, 기대 범위=[${min}, ${max}]` : null,
  };
}

// ──────────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' ASPICE AI Platform — Eval Harness');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allDatasets = await loadDatasets();
  let datasets = allDatasets;
  if (args.dataset) {
    datasets = datasets.filter(d => d.id === args.dataset);
  }
  if (args.process) {
    datasets = datasets.filter(d => d.process === args.process);
  }
  console.log(`데이터셋: ${datasets.length}건 (전체 ${allDatasets.length}건 중)\n`);

  const results = [];
  const startTime = Date.now();

  for (const dataset of datasets) {
    process.stdout.write(`▶ ${dataset.id} (${dataset.process})... `);
    const tStart = Date.now();
    try {
      const output = await generateViaAPI(dataset.process, dataset.input);
      const grade_result = grade(output, dataset);
      const duration = ((Date.now() - tStart) / 1000).toFixed(1);

      const status = grade_result.pass_overall ? '✅' : '❌';
      const scoreStr = (grade_result.score * 100).toFixed(0);
      console.log(`${status} ${scoreStr}점 (${grade_result.passed}/${grade_result.total}) · ${duration}s`);

      // 실패한 체크 표시
      if (!grade_result.pass_overall) {
        grade_result.checks
          .filter(c => !c.pass)
          .forEach(c => console.log(`    ✗ ${c.name}${c.detail ? ': ' + c.detail : ''}`));
      }

      results.push({
        dataset_id: dataset.id,
        process: dataset.process,
        score: grade_result.score,
        passed: grade_result.pass_overall,
        checks: grade_result.checks,
        duration_sec: parseFloat(duration),
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.log(`💥 에러: ${e.message}`);
      results.push({
        dataset_id: dataset.id,
        process: dataset.process,
        error: e.message,
        passed: false,
      });
    }
  }

  // 요약
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const passedCount = results.filter(r => r.passed).length;
  const avgScore = results.filter(r => r.score !== undefined)
    .reduce((s, r) => s + r.score, 0) / Math.max(1, results.filter(r => r.score !== undefined).length);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` 결과: ${passedCount}/${results.length} 통과 · 평균 ${(avgScore * 100).toFixed(1)}점 · ${totalDuration}s`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 결과 파일 저장
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  const outDir = path.join(__dirname, 'results');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${date}_${time}.json`);
  await fs.writeFile(outPath, JSON.stringify({
    summary: {
      total: results.length,
      passed: passedCount,
      avg_score: avgScore,
      duration_sec: parseFloat(totalDuration),
      timestamp: new Date().toISOString(),
    },
    results,
  }, null, 2));
  console.log(`결과 저장: ${outPath}`);

  // CI exit code
  process.exit(passedCount === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

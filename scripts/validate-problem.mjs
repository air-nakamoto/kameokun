#!/usr/bin/env node
// 亀夫君問題JSONの「構造クロス参照」バリデータ
//
// 役割と境界:
//   このスクリプトは JSON Schema 単体で表現しづらい構造的整合性
//   （ID一意性、参照整合性、列挙の網羅性、最低人数）だけを検査する。
//   Schema本体の型・必須項目・enum・min/maxItems などの検証は対象外。
//
// 運用上の必須レイヤ（両方が必要）:
//   1. JSON Schema validation (ajv 等)       … 型・必須・enum・形式
//   2. このスクリプト (validate-problem.mjs)  … クロス参照・全体一意性・網羅性
//   3. judgeModel (prompts/judge-quality.md)  … 意味的な致命欠陥9条件
//   生成 → (1) → (2) → (3) → 採用 / 再生成 の順で通すこと。
//
// Usage:
//   node scripts/validate-problem.mjs <problem.json> [<problem.json> ...] [--json]
// Exit code: 0 = all pass, 1 = at least one failed, 2 = usage error

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

const FAIL_CODES = [
  'solvable_without_truth',
  'solution_not_unique',
  'unnatural_concealment',
  'unreachable_truth',
  'charm_relies_on_oddity_only',
  'stage1_stage2_too_close',
  'truth_lacks_objective_anchor',
  'solution_too_abstract',
  'pattern_collision_with_samples',
];

function findDuplicates(values) {
  const seen = new Set();
  const dups = new Set();
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}

function validate(problem) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  const characters = problem?.characters ?? [];
  const facts = problem?.truth?.objective_facts ?? [];
  const beliefs = problem?.truth?.subjective_beliefs ?? [];
  const truthReqs = problem?.solution_criteria?.truth_requirements ?? [];
  const solReqs = problem?.solution_criteria?.solution_requirements ?? [];
  const minToClear = problem?.solution_criteria?.minimum_to_clear ?? [];
  const failConditions = problem?.quality_gate?.fail_conditions ?? [];

  // 1. characters[].id 一意
  for (const id of findDuplicates(characters.map(c => c?.id))) {
    add('characters[].id', `重複: "${id}"`);
  }

  // 2. objective_facts[].id 一意
  for (const id of findDuplicates(facts.map(f => f?.id))) {
    add('truth.objective_facts[].id', `重複: "${id}"`);
  }

  // 3. truth_requirements[].id と solution_requirements[].id の全体一意
  const truthReqIds = truthReqs.map(r => r?.id);
  const solReqIds = solReqs.map(r => r?.id);
  for (const id of findDuplicates([...truthReqIds, ...solReqIds])) {
    add(
      'solution_criteria.{truth,solution}_requirements[].id',
      `両配列をまたいで重複: "${id}"`,
    );
  }

  // 4. verifiable_by が実在キャラID
  const charIdSet = new Set(characters.map(c => c?.id).filter(Boolean));
  facts.forEach((f, i) => {
    (f?.verifiable_by ?? []).forEach((cid, j) => {
      if (!charIdSet.has(cid)) {
        add(
          `truth.objective_facts[${i}].verifiable_by[${j}]`,
          `存在しないキャラID: "${cid}"`,
        );
      }
    });
  });

  // 5. subjective_beliefs[].character_id が実在キャラID
  beliefs.forEach((b, i) => {
    if (b?.character_id && !charIdSet.has(b.character_id)) {
      add(
        `truth.subjective_beliefs[${i}].character_id`,
        `存在しないキャラID: "${b.character_id}"`,
      );
    }
  });

  // 6. anchored_facts が実在 objective fact ID
  const factIdSet = new Set(facts.map(f => f?.id).filter(Boolean));
  truthReqs.forEach((r, i) => {
    (r?.anchored_facts ?? []).forEach((fid, j) => {
      if (!factIdSet.has(fid)) {
        add(
          `solution_criteria.truth_requirements[${i}].anchored_facts[${j}]`,
          `存在しない objective_fact ID: "${fid}"`,
        );
      }
    });
  });

  // 7. minimum_to_clear が実在 requirement ID
  const reqIdSet = new Set([...truthReqIds, ...solReqIds].filter(Boolean));
  minToClear.forEach((rid, i) => {
    if (!reqIdSet.has(rid)) {
      add(
        `solution_criteria.minimum_to_clear[${i}]`,
        `存在しない requirement ID: "${rid}"`,
      );
    }
  });

  // 8. is_client: true が1名以上
  const clientCount = characters.filter(c => c?.is_client === true).length;
  if (clientCount < 1) {
    add('characters', 'is_client: true のキャラクターが1名もいません');
  }

  // 9. quality_gate.fail_conditions が9コードを各1回ずつ持つ
  const codeCounts = new Map();
  for (const fc of failConditions) {
    const code = fc?.code;
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }
  for (const code of FAIL_CODES) {
    const count = codeCounts.get(code) ?? 0;
    if (count === 0) {
      add('quality_gate.fail_conditions', `必須コードが欠落: "${code}"`);
    } else if (count > 1) {
      add(
        'quality_gate.fail_conditions',
        `重複コード: "${code}" (${count}回)`,
      );
    }
  }
  for (const code of codeCounts.keys()) {
    if (code !== undefined && !FAIL_CODES.includes(code)) {
      add('quality_gate.fail_conditions', `未定義コード: "${code}"`);
    }
  }

  return errors;
}

function printUsage() {
  console.error(
    'Usage: node scripts/validate-problem.mjs <problem.json> [<problem.json> ...] [--json]',
  );
}

const KNOWN_FLAGS = new Set(['--json']);

async function main() {
  const args = argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const unknownFlags = flags.filter(f => !KNOWN_FLAGS.has(f));
  if (unknownFlags.length > 0) {
    console.error(`Unknown option(s): ${unknownFlags.join(', ')}`);
    printUsage();
    exit(2);
  }
  const jsonOutput = flags.includes('--json');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length === 0) {
    printUsage();
    exit(2);
  }

  const results = [];
  let allOk = true;

  for (const file of files) {
    let problem;
    try {
      const raw = await readFile(file, 'utf8');
      problem = JSON.parse(raw);
    } catch (e) {
      results.push({
        file,
        ok: false,
        errors: [{ path: '<file>', message: `読み込み失敗: ${e.message}` }],
      });
      allOk = false;
      continue;
    }
    const errors = validate(problem);
    const ok = errors.length === 0;
    results.push({ file, ok, errors });
    if (!ok) allOk = false;
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ ok: allOk, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.ok) {
        console.log(`PASS: ${r.file}`);
      } else {
        console.log(`FAIL: ${r.file}`);
        for (const e of r.errors) {
          console.log(`  [${e.path}] ${e.message}`);
        }
      }
    }
    const failed = results.filter(r => !r.ok).length;
    if (failed > 0) {
      console.log(`\n${failed}/${results.length} files failed`);
    }
  }

  exit(allOk ? 0 : 1);
}

main();

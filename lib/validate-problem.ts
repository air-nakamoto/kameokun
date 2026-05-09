// 問題JSONの runtime バリデーション
// ajv (JSON Schema) + クロス参照（scripts/validate-problem.mjs と同じロジック）を統合
//
// scripts/validate-problem.mjs は CLI 専用、こちらはアプリ内呼び出し用。
// クロス参照ロジックは両者で同じ仕様だが、互いに依存しない（テスト容易性のため）。

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '@/schemas/problem.schema.json' with { type: 'json' };

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

export interface ValidationError {
  layer: 'schema' | 'cross-reference';
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats.default(ajv);
const validateSchema = ajv.compile(schema as object);

function findDuplicates<T>(values: (T | undefined | null)[]): T[] {
  const seen = new Set<T>();
  const dups = new Set<T>();
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}

function crossRefValidate(problem: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const add = (path: string, message: string) =>
    errors.push({ layer: 'cross-reference', path, message });

  const p = problem as Record<string, unknown>;
  const characters = (p?.characters as Array<Record<string, unknown>>) ?? [];
  const truth = (p?.truth as Record<string, unknown>) ?? {};
  const facts = (truth?.objective_facts as Array<Record<string, unknown>>) ?? [];
  const beliefs = (truth?.subjective_beliefs as Array<Record<string, unknown>>) ?? [];
  const sc = (p?.solution_criteria as Record<string, unknown>) ?? {};
  const truthReqs = (sc?.truth_requirements as Array<Record<string, unknown>>) ?? [];
  const solReqs = (sc?.solution_requirements as Array<Record<string, unknown>>) ?? [];
  const minToClear = (sc?.minimum_to_clear as string[]) ?? [];
  const qg = (p?.quality_gate as Record<string, unknown>) ?? {};
  const failConditions =
    (qg?.fail_conditions as Array<Record<string, unknown>>) ?? [];

  for (const id of findDuplicates(characters.map(c => c?.id as string))) {
    add('characters[].id', `重複: "${id}"`);
  }
  for (const id of findDuplicates(facts.map(f => f?.id as string))) {
    add('truth.objective_facts[].id', `重複: "${id}"`);
  }
  const truthReqIds = truthReqs.map(r => r?.id as string);
  const solReqIds = solReqs.map(r => r?.id as string);
  for (const id of findDuplicates([...truthReqIds, ...solReqIds])) {
    add(
      'solution_criteria.{truth,solution}_requirements[].id',
      `両配列をまたいで重複: "${id}"`,
    );
  }

  const charIdSet = new Set(
    characters.map(c => c?.id as string).filter(Boolean),
  );
  facts.forEach((f, i) => {
    const arr = (f?.verifiable_by as string[]) ?? [];
    arr.forEach((cid, j) => {
      if (!charIdSet.has(cid)) {
        add(
          `truth.objective_facts[${i}].verifiable_by[${j}]`,
          `存在しないキャラID: "${cid}"`,
        );
      }
    });
  });

  beliefs.forEach((b, i) => {
    const cid = b?.character_id as string;
    if (cid && !charIdSet.has(cid)) {
      add(
        `truth.subjective_beliefs[${i}].character_id`,
        `存在しないキャラID: "${cid}"`,
      );
    }
  });

  const factIdSet = new Set(facts.map(f => f?.id as string).filter(Boolean));
  truthReqs.forEach((r, i) => {
    const arr = (r?.anchored_facts as string[]) ?? [];
    arr.forEach((fid, j) => {
      if (!factIdSet.has(fid)) {
        add(
          `solution_criteria.truth_requirements[${i}].anchored_facts[${j}]`,
          `存在しない objective_fact ID: "${fid}"`,
        );
      }
    });
  });

  const reqIdSet = new Set(
    [...truthReqIds, ...solReqIds].filter(Boolean),
  );
  minToClear.forEach((rid, i) => {
    if (!reqIdSet.has(rid)) {
      add(
        `solution_criteria.minimum_to_clear[${i}]`,
        `存在しない requirement ID: "${rid}"`,
      );
    }
  });

  const clientCount = characters.filter(c => c?.is_client === true).length;
  if (clientCount < 1) {
    add('characters', 'is_client: true のキャラクターが1名もいません');
  }

  const codeCounts = new Map<string, number>();
  for (const fc of failConditions) {
    const code = fc?.code as string;
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

export function validateProblem(problem: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!validateSchema(problem)) {
    for (const err of validateSchema.errors ?? []) {
      errors.push({
        layer: 'schema',
        path: err.instancePath || err.schemaPath || '<root>',
        message: err.message ?? 'unknown',
      });
    }
    // schema 違反時はクロス参照の検査はスキップ（クラッシュ回避）
    return { ok: false, errors };
  }

  errors.push(...crossRefValidate(problem));
  return { ok: errors.length === 0, errors };
}

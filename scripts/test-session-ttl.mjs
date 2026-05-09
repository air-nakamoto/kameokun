#!/usr/bin/env node
// Session TTL の挙動テスト
//
// 確認内容:
//   - createSession で created_at == updated_at
//   - getSession で updated_at が前進する
//   - updateSession で updated_at が前進する
//   - TTL 経過後の getSession が null を返す
//   - TTL 経過後の updateSession が null を返す
//   - _forceCleanupForTest が期限切れを除去する
//   - getSessionCount でカウントが取れる
//   - env KAMEO_SESSION_TTL_MS の上書きが効く
//
// 短いTTL(50ms) で動作させ、setTimeout で経過を待つ。

import { spawn } from 'node:child_process';

const code = `
import {
  createSession,
  getSession,
  updateSession,
  getSessionCount,
  getSessionTTL,
  _resetSessionsForTest,
  _forceCleanupForTest,
} from './lib/session-store.ts';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const fixture = {
  id: 'problem_test', schema_version: '1.0.0',
  public: { title: 't', intro: 'i'.repeat(60), rules: 'r', player_visible_tags: { estimated_minutes: 10, difficulty: 'beginner' } },
  internal: { situation_type: 'workplace', tone: 'light', charm_pattern: 'x', misdirection: 'x', truth_reveal: 'x', solution_shape: 'x' },
  characters: [{ id: 'c1', name: 'A', role: 'r', personality: 'p', known_facts: [], unknown_facts: [], is_client: true }],
  truth: { hidden_truth: 'x', objective_facts: [], subjective_beliefs: [], misunderstandings: [], two_stage_structure: { stage_1_truth: 'x', stage_2_solution: 'y' } },
  answer_policy: { default_style: 'character_roleplay', allowed_answer_types: ['unknown'], reveal_rules: [], refusal_rules: [] },
  solution_criteria: { truth_requirements: [{ id: 'tr1', description: 'x' }], solution_requirements: [{ id: 'sr1', description: 'y' }], minimum_to_clear: ['tr1', 'sr1'] },
  quality_gate: { passed: false, fail_conditions: [] },
};

let pass = 0, fail = 0;
const check = (name, cond, info) => {
  if (cond) { console.log('PASS:', name); pass++; }
  else { console.log('FAIL:', name, info ?? ''); fail++; }
};

console.log('TTL =', getSessionTTL(), 'ms');
check('TTL is 50ms (env override)', getSessionTTL() === 50);

_resetSessionsForTest();
const s1 = createSession(fixture);
check('createSession sets timestamps', s1.created_at === s1.updated_at && !!s1.created_at);
check('getSessionCount = 1', getSessionCount() === 1);

const before = s1.updated_at;
await sleep(5);
const s2 = getSession(s1.id);
check('getSession returns session', s2 !== null);
check('getSession touches updated_at', s2 && s2.updated_at > before);

await sleep(5);
const s3 = updateSession(s1.id, { stage: 'stage_1' });
check('updateSession returns updated', s3 !== null && s3.stage === 'stage_1');
check('updateSession bumps updated_at', s3 && s3.updated_at > s2.updated_at);

// TTL 経過テスト
await sleep(80); // > TTL(50ms)
const s4 = getSession(s1.id);
check('expired getSession returns null', s4 === null);
check('expired session evicted from map', getSessionCount() === 0);

// updateSession on expired
const id_a = createSession(fixture).id;
await sleep(80);
const s5 = updateSession(id_a, { stage: 'stage_2' });
check('expired updateSession returns null', s5 === null);

// _forceCleanupForTest
_resetSessionsForTest();
createSession(fixture);
createSession(fixture);
check('count = 2', getSessionCount() === 2);
await sleep(80);
const removed = _forceCleanupForTest();
check('forceCleanup removed 2', removed === 2 && getSessionCount() === 0);

// 活発なセッションは生き続ける
_resetSessionsForTest();
const live = createSession(fixture);
for (let i = 0; i < 5; i++) {
  await sleep(20); // 20ms ごとにアクセス（< TTL=50ms）
  const got = getSession(live.id);
  if (!got) { fail++; console.log('FAIL: live session expired prematurely at i=', i); break; }
}
check('active session survives beyond initial TTL', getSession(live.id) !== null);

console.log('');
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
`;

const child = spawn(
  'node',
  ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', '--input-type=module', '-e', code],
  {
    stdio: 'inherit',
    env: { ...process.env, KAMEO_SESSION_TTL_MS: '50' },
  },
);
child.on('exit', code => process.exit(code ?? 1));

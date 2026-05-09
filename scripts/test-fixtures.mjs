#!/usr/bin/env node
// 検証パイプラインの正負テスト
//
// 確認内容:
//   - valid-problem.json   → ajv: pass / cross-ref: pass
//   - demo-problem.json    → ajv: pass / cross-ref: pass
//   - broken-problem.json  → ajv: fail / cross-ref: fail
//
// 「壊れたものが落ちる」ことまで確認するのが目的。
// validate-problem.mjs の検査ロジックや schema 制約に regression が入った場合、
// このスクリプトで気付ける。
//
// Usage:
//   node scripts/test-fixtures.mjs
//   npm run test:fixtures
//
// Exit code: 0 = all expectations met, 1 = at least one mismatch

import { spawn } from 'node:child_process';
import { argv, exit } from 'node:process';

const VALID = 'scripts/fixtures/valid-problem.json';
const DEMO = 'scripts/fixtures/demo-problem.json';
const BROKEN = 'scripts/fixtures/broken-problem.json';

function run(cmd, args) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.on('error', err => resolve({ code: -1, stdout, stderr: String(err) }));
  });
}

async function ajvCheck(file) {
  return run('npx', [
    '--no-install',
    'ajv',
    'validate',
    '-s', 'schemas/problem.schema.json',
    '-d', file,
    '-c', 'ajv-formats',
    '--spec=draft2020',
    '--strict=false',
  ]);
}

async function crossCheck(file) {
  return run('node', ['scripts/validate-problem.mjs', file]);
}

const cases = [
  { name: 'valid + ajv',           file: VALID,  fn: ajvCheck,   expectExit: 0 },
  { name: 'valid + cross-ref',     file: VALID,  fn: crossCheck, expectExit: 0 },
  { name: 'demo + ajv',            file: DEMO,   fn: ajvCheck,   expectExit: 0 },
  { name: 'demo + cross-ref',      file: DEMO,   fn: crossCheck, expectExit: 0 },
  { name: 'broken + ajv',          file: BROKEN, fn: ajvCheck,   expectExit: 1 },
  { name: 'broken + cross-ref',    file: BROKEN, fn: crossCheck, expectExit: 1 },
];

const verbose = argv.includes('--verbose');

let failed = 0;
for (const c of cases) {
  const { code, stdout, stderr } = await c.fn(c.file);
  const ok = code === c.expectExit;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${c.name}  (exit=${code}, expected=${c.expectExit})`);
  if (!ok || verbose) {
    if (stdout.trim()) console.log(`  stdout: ${stdout.trim().split('\n').slice(0, 3).join(' | ')}`);
    if (stderr.trim()) console.log(`  stderr: ${stderr.trim().split('\n').slice(0, 3).join(' | ')}`);
  }
  if (!ok) failed++;
}

console.log('');
if (failed === 0) {
  console.log(`All ${cases.length} fixture expectations met.`);
} else {
  console.log(`FAIL: ${failed}/${cases.length} mismatch.`);
}
exit(failed === 0 ? 0 : 1);

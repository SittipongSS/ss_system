#!/usr/bin/env node
// Answers "did the scheduled deploy actually happen, and is anything stuck?"
//
// Production is deployed from the `production` branch, which a scheduled
// workflow fast-forwards to `main` three times a day (see
// .github/workflows/deploy-production.yml). That indirection means `main`
// being up to date no longer tells you what production is running, so this
// prints the gap directly.
//
// Usage: npm run deploy:status

import { execFileSync } from 'node:child_process';

const REPO = 'SittipongSS/ss_system';

function run(cmd, args, { optional = false } = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

run('git', ['fetch', '--quiet', 'origin']);

const main = run('git', ['rev-parse', 'origin/main']);
const production = run('git', ['rev-parse', 'origin/production']);
const pending = run('git', ['log', '--oneline', 'origin/production..origin/main']);

console.log(`main        ${main.slice(0, 8)}`);
console.log(`production  ${production.slice(0, 8)}`);
console.log('');

if (!pending) {
  console.log('✓ production ตรงกับ main — ขึ้นครบแล้ว');
} else {
  const lines = pending.split('\n');
  const oldest = run('git', ['log', '-1', '--format=%cr', `${production}..${main}`, '--reverse']);
  console.log(`● ค้างรออยู่ ${lines.length} commit (เก่าสุด ${oldest}):`);
  for (const line of lines) console.log(`    ${line}`);
  console.log('');
  console.log('  รอบถัดไป 09:00 / 13:00 / 18:00 (GitHub หน่วงได้ 30+ นาที)');
  console.log(`  ด่วนกว่านั้น: gh workflow run "Deploy to production" --repo ${REPO}`);
}

// The workflow history is the record of whether the schedule is firing at all.
// `gh` is optional so the branch comparison above still works without it.
const runs = run('gh', [
  'run', 'list', '--workflow=Deploy to production', '--repo', REPO,
  '--limit', '5', '--json', 'event,createdAt,conclusion',
  '--jq', '.[] | "\\(.createdAt)  \\(.event)  \\(.conclusion)"',
], { optional: true });

if (runs) {
  console.log('');
  console.log('รอบล่าสุด:');
  for (const line of runs.split('\n')) console.log(`  ${line}`);
} else {
  console.log('');
  console.log('(ข้ามประวัติรอบ deploy — ต้องมี gh CLI ที่ล็อกอินแล้ว)');
}

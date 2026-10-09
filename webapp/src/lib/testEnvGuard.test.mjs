// โปรเซสเทสต์ต้องไม่ถือคีย์ฐานข้อมูลจริง (scripts/test-env-guard.mjs)
//
// 🐞 2026-10-09: เทสต์เขียน audit ปลอมลง production 1,523 แถวผ่าน CI โดยไม่มีอะไรแดง —
// ไฟล์นี้คือยามของรูนั้น: ถ้ามีคนถอดบรรทัดถอดคีย์ออกจาก test-loader เทสต์ชุดล่างจะแดงทันที
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATABASE_KEYS, SCRUBBED_FLAG, isTestRun, scrubDatabaseKeys } from '../../scripts/test-env-guard.mjs';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const WEBAPP = fileURLToPath(new URL('../../', import.meta.url));
const LOADER = new URL('../../scripts/test-loader.mjs', import.meta.url).href;

test('รู้จักโปรเซสเทสต์ และไม่เหมาสคริปต์ที่ยืม loader ไปใช้', () => {
  assert.equal(isTestRun({ execArgv: ['--import', './scripts/test-loader.mjs', '--test'] }), true, 'ตัวแม่ของ node --test');
  assert.equal(isTestRun({ argv: ['node', '/repo/src/lib/x.test.mjs'] }), true, 'ไฟล์เทสต์ (ลูกของตัวแม่ · หรือรันตรง ๆ)');
  // `npm run check:taxid` และสคริปต์ backfill ใช้ loader ตัวเดียวกัน แต่ต้องต่อฐานจริง
  assert.equal(isTestRun({
    execArgv: ['--import', './scripts/test-loader.mjs'], argv: ['node', '/repo/scripts/check-customer-tax-id.mjs'],
  }), false);
});

test('สคริปต์ที่เทสต์ spawn ต่อ (รับ NODE_TEST_CONTEXT ตกทอดมา) ไม่ถูกถอดคีย์ที่เทสต์ตั้งให้เอง', () => {
  // linePackParity.test.mjs รัน scripts/check-line-pack-parity.mjs ด้วยคีย์ปลอมชี้ 127.0.0.1 — ถอด = สคริปต์พัง
  const spawned = {
    execArgv: ['--import', './scripts/test-loader.mjs'], argv: ['node', '/repo/scripts/check-line-pack-parity.mjs'],
    env: { NODE_TEST_CONTEXT: 'child-v8', SUPABASE_URL: 'http://127.0.0.1:5050', SUPABASE_SERVICE_ROLE_KEY: 'test-key-not-real' },
  };
  assert.deepEqual(scrubDatabaseKeys(spawned), []);
  assert.equal(spawned.env.SUPABASE_SERVICE_ROLE_KEY, 'test-key-not-real');
});

test('ถอดเฉพาะคีย์ฐานข้อมูล เฉพาะตอนเป็นเทสต์ — คืนชื่อคีย์ที่ถอด', () => {
  const keys = { SUPABASE_SERVICE_ROLE_KEY: 'service', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' };
  const underTest = { execArgv: ['--test'], argv: [], env: { ...keys, SUPABASE_URL: 'https://x.supabase.co', PATH: '/bin' } };
  assert.deepEqual(scrubDatabaseKeys(underTest), DATABASE_KEYS);
  // ทิ้งป้ายไว้ให้ getSupabaseAdmin บอกเหตุได้ถูก · ของอื่นใน env ไม่แตะ
  assert.deepEqual(underTest.env, { SUPABASE_URL: 'https://x.supabase.co', PATH: '/bin', [SCRUBBED_FLAG]: DATABASE_KEYS.join(',') });
  assert.deepEqual(scrubDatabaseKeys(underTest), [], 'ถอดซ้ำ = ไม่มีอะไรให้ถอด');

  const script = { execArgv: [], argv: ['node', '/repo/scripts/backfill.mjs'], env: { ...keys } };
  assert.deepEqual(scrubDatabaseKeys(script), []);
  assert.deepEqual(script.env, keys, 'สคริปต์ที่ไม่ใช่เทสต์ต้องได้คีย์ตามเดิม');
});

// ── ของจริงทั้งเส้น: ตั้งคีย์ไว้ใน env แล้วรัน node --test ผ่าน loader — ไฟล์เทสต์ต้องไม่เห็นคีย์ ──
const CANARY = 'canary-not-a-real-key';
const run = (args, cwd) => {
  // NODE_TEST_CONTEXT ติดมาจากตัวรันของไฟล์นี้ — ทิ้งไว้ `node --test` ชั้นในจะถือว่าตัวเองถูกเรียกซ้อนแล้วไม่รันอะไรเลย
  const { NODE_TEST_CONTEXT: _nested, ...env } = process.env;
  return spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8',
    env: { ...env, SUPABASE_SERVICE_ROLE_KEY: CANARY, NEXT_PUBLIC_SUPABASE_ANON_KEY: CANARY },
  });
};

test('🔴 node --test ผ่าน test-loader: ไฟล์เทสต์ไม่เห็นคีย์ฐานข้อมูลที่ตั้งไว้ใน env (สภาพเดียวกับ CI)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'test-env-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const canary = join(dir, 'canary.test.mjs');
  writeFileSync(canary, `
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    test('ไม่มีคีย์ฐานข้อมูลในโปรเซสเทสต์', () => {
      assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
      assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, undefined);
    });
  `);
  const guarded = run(['--import', LOADER, '--test', canary], WEBAPP);
  assert.equal(guarded.status, 0, guarded.stdout + guarded.stderr);
  assert.match(guarded.stdout, /pass 1\b/, 'ไฟล์เทสต์ต้องถูกรันจริง ไม่ใช่ผ่านเพราะไม่ได้รัน');

  // ตัวเทียบ: ไม่ผ่าน loader = ไฟล์เดียวกันต้องแดง (ยืนยันว่าเทสต์ข้างบนจับรูได้จริง)
  const bare = run(['--test', canary], WEBAPP);
  assert.notEqual(bare.status, 0, 'ไม่มียาม คีย์ต้องหลุดถึงไฟล์เทสต์');
});

test('สคริปต์ที่ยืม loader แต่ไม่ใช่เทสต์ (check:taxid · backfill) ยังได้คีย์ครบ', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'test-env-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(dir, 'print-key.mjs');
  writeFileSync(script, 'process.stdout.write(String(process.env.SUPABASE_SERVICE_ROLE_KEY));');
  const out = run(['--import', LOADER, script], WEBAPP);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, CANARY);
});

test('เทสต์ที่หลุดไปเรียก client ตัวจริงหลังถูกถอดคีย์ ได้ข้อความที่บอกเหตุและทางออก ไม่ใช่ "ลืมตั้ง env"', (t) => {
  const touched = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', SCRUBBED_FLAG];
  const saved = Object.fromEntries(touched.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of touched) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env[SCRUBBED_FLAG] = 'SUPABASE_SERVICE_ROLE_KEY';
  assert.throws(() => getSupabaseAdmin(), /test-loader ถอดคีย์ฐานข้อมูลออก.*ส่ง client\/ตัวเขียน audit จำลอง/);
  delete process.env[SCRUBBED_FLAG];
  assert.throws(() => getSupabaseAdmin(), /Supabase env missing/);
});

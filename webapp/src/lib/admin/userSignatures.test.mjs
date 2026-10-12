import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  activeSignatureVersionId,
  emptyUserSignatureState,
  signatureRpcError,
  UserSignatureError,
} from './userSignatures.js';

test('empty signature state exposes no active version and safe upload limits', () => {
  const state = emptyUserSignatureState();
  assert.equal(state.active, null);
  assert.deepEqual(state.versions, []);
  assert.deepEqual(state.events, []);
  assert.equal(state.limits.bucket, 'signature-assets');
  assert.equal(state.limits.maxBytes, 1024 * 1024);
  assert.equal(state.limits.acceptedMime, 'image/png');
});

test('signature RPC errors map stale and owner failures to safe HTTP statuses', () => {
  const stale = signatureRpcError({ message: 'user_signature_active_stale' });
  assert.ok(stale instanceof UserSignatureError);
  assert.equal(stale.status, 409);
  assert.match(stale.message, /ข้อมูลล่าสุด/);

  const owner = signatureRpcError({ message: 'user_signature_owner_mismatch' });
  assert.equal(owner.status, 403);
  assert.equal(owner.message, 'forbidden');
});

test('signature RPC validation errors do not leak database details', () => {
  const invalid = signatureRpcError({ message: 'user_signature_asset_invalid: internal detail' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.message, 'ข้อมูลไฟล์ลายเซ็นไม่ถูกต้อง');

  const unknown = signatureRpcError({ message: 'postgres internal detail' });
  assert.equal(unknown.status, 500);
  assert.equal(unknown.message, 'จัดการลายเซ็นไม่สำเร็จ');
});

/* ── เวอร์ชันลายเซ็นที่ใช้งานอยู่ ─────────────────────────────────────────────
   🐞 2026-10-12: เส้นอนุมัติราคาผลิตค้นราก `user_signatures` ด้วย `id` แทน `userId` ⇒ ไม่เจอแถวเลย
      ผู้บริหารทุกคนถูกบอกให้ "เพิ่มลายเซ็น" แม้มีแล้ว · เทสต์นี้ล็อกคอลัมน์ที่ค้น และกวาดทั้ง src กันพลาดซ้ำ */

/** supabase ปลอม: แถวจริงของตารางมี `id` = รหัสแถวลายเซ็น และ `userId` = รหัสผู้ใช้ (ไม่เท่ากันเสมอ) */
function fakeSignatures(rows, { error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, column: null, value: null };
      calls.push(q);
      return {
        select(columns) { q.columns = columns; return this; },
        eq(column, value) { q.column = column; q.value = value; return this; },
        async maybeSingle() {
          if (error) return { data: null, error };
          return { data: rows.find((row) => row[q.column] === q.value) || null, error: null };
        },
      };
    },
  };
}

const ROWS = [
  { id: 'signature-f73f0001', userId: 'user-a', activeVersionId: 'sigver-1' },
  { id: 'signature-f73f0002', userId: 'user-b', activeVersionId: null },
];

test('activeSignatureVersionId ค้นรากด้วย userId — เจอเวอร์ชันที่ใช้งานของคนที่มีลายเซ็น', async () => {
  const supabase = fakeSignatures(ROWS);
  assert.deepEqual(await activeSignatureVersionId(supabase, 'user-a'), { versionId: 'sigver-1', error: null });
  assert.deepEqual(supabase.calls.map((c) => [c.table, c.column, c.value]), [['user_signatures', 'userId', 'user-a']]);
});

test('activeSignatureVersionId: ไม่มีแถว · แถวที่ถอนลายเซ็นแล้ว · ไม่ส่งรหัสผู้ใช้ = ไม่มีลายเซ็น (ไม่ใช่ข้อผิดพลาด)', async () => {
  assert.deepEqual(await activeSignatureVersionId(fakeSignatures(ROWS), 'user-none'), { versionId: null, error: null });
  assert.deepEqual(await activeSignatureVersionId(fakeSignatures(ROWS), 'user-b'), { versionId: null, error: null });
  const untouched = fakeSignatures(ROWS);
  assert.deepEqual(await activeSignatureVersionId(untouched, ''), { versionId: null, error: null });
  assert.equal(untouched.calls.length, 0, 'ไม่มีรหัสผู้ใช้ต้องไม่ยิงฐาน');
  // รหัสของแถวลายเซ็นไม่ใช่รหัสผู้ใช้ — ค้นด้วยมันต้องไม่เจอ (กันคนสลับคอลัมน์กลับ)
  assert.deepEqual(await activeSignatureVersionId(fakeSignatures(ROWS), 'signature-f73f0001'), { versionId: null, error: null });
});

test('activeSignatureVersionId: อ่านฐานไม่สำเร็จ = คืน error ไม่โยน และไม่แปลว่า "ไม่มีลายเซ็น"', async () => {
  const failure = { message: 'connection reset' };
  assert.deepEqual(await activeSignatureVersionId(fakeSignatures(ROWS, { error: failure }), 'user-a'), { versionId: null, error: failure });
});

const SRC = new URL('../../', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
  return /\.js$/.test(name) ? [full] : [];
});
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ทั้ง src: ไม่มีจุดไหนค้นราก user_signatures ด้วยคอลัมน์ id — รหัสผู้ใช้อยู่ที่ userId', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const match of code.matchAll(/\.from\(\s*['"`]user_signatures['"`]\s*\)([\s\S]{0,240}?)(?:;|\n\s*\n)/g)) {
      if (/\.eq\(\s*['"`]id['"`]/.test(match[1])) offenders.push(file.slice(SRC.length));
    }
  }
  assert.deepEqual(offenders, [], 'ค้น user_signatures ด้วย .eq("id", …) = ไม่มีวันเจอแถว (id คือรหัสแถวลายเซ็น) — ใช้ activeSignatureVersionId หรือ .eq("userId", …)');
});

test('เส้นอนุมัติราคาผลิตใช้ตัวอ่านกลาง และแยก "อ่านไม่สำเร็จ" (500) ออกจาก "ไม่มีลายเซ็น" (409)', () => {
  const route = stripComments(readFileSync(new URL('../../app/api/sa/costing/[id]/approve/route.js', import.meta.url), 'utf8'));
  assert.match(route, /activeSignatureVersionId\(supabase, user\?\.id\)/);
  assert.equal(route.includes("from('user_signatures')"), false, 'route ต้องไม่ค้นตารางเอง');
  const errorAt = route.indexOf('signature.error');
  const missingAt = route.indexOf("code: 'signature_required'");
  assert.ok(errorAt > 0 && missingAt > errorAt, 'ต้องเช็ก error ก่อนตอบว่าไม่มีลายเซ็น');
  assert.match(route.slice(errorAt, missingAt), /status: 500/);
});

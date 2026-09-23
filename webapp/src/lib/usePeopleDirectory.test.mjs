// ── ทะเบียนคน: "ยังโหลด" · "โหลดพัง" · "ไม่มีใครเลย" ต้องแยกกันได้ ─────────────────────
//
// 🐞 รีวิว 24/09: โมดัลลงคิวกลาง (`CommitDueDialog`) แยกสามสถานะนี้ แต่หน้าใบคำร้องส่งแค่รายชื่อ
//    (`usePeopleDirectory` กลืน error และไม่มีธงกำลังโหลด) ⇒ ทะเบียนช้าหรือพังบนหน้าใบ = โมดัลบอกเด็ดขาดว่า
//    "ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน" ซึ่งไม่จริง (หน้าจัดคิวส่งธงครบอยู่แล้ว)
// ⭐ `usePeopleDirectoryState` คืน `{ users, loading, error }` · ตัวเดิม (`usePeopleDirectory`) คืนรายชื่อตามเดิม
//    — ผู้เรียกอีก 11 จุดไม่ต้องแก้ (พังแล้วถอยไปชื่อที่เก็บไว้เองเหมือนเดิม)
// ⚠️ ฮุกเป็น React (ไม่มี test runner ฝั่ง React) ⇒ เทสต์ตรรกะล้วนที่ฮุกเรียก + ยามซอร์สของผู้เรียก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PEOPLE_DIRECTORY_LOADING, loadPeopleDirectory } from './usePeopleDirectory.js';

test('ตั้งต้น = กำลังโหลด (ไม่ใช่ "ไม่มีใคร")', () => {
  assert.deepEqual(PEOPLE_DIRECTORY_LOADING, { users: [], loading: true, error: false });
});

test('โหลดสำเร็จ = รายชื่อ · ไม่ใช่อาร์เรย์ = ว่าง (ไม่ใช่พัง)', async () => {
  const rows = [{ id: 'U1', name: 'สมชาย' }];
  assert.deepEqual(await loadPeopleDirectory(async () => rows), { users: rows, loading: false, error: false });
  assert.deepEqual(await loadPeopleDirectory(async () => null), { users: [], loading: false, error: false });
});

test('🐞 โหลดพัง = error (แยกจาก "ไม่มีใครเลย") · รายชื่อเดิมไม่หาย', async () => {
  const prev = [{ id: 'U9' }];
  assert.deepEqual(await loadPeopleDirectory(async () => { throw new Error('403'); }),
    { users: [], loading: false, error: true });
  const kept = await loadPeopleDirectory(async () => { throw new Error('net'); }, prev);
  assert.equal(kept.users, prev, 'พังแล้วไม่ทิ้งรายชื่อที่มีอยู่');
  assert.equal(kept.error, true);
});

test('🐞 หน้าใบคำร้องส่งธงกำลังโหลด/พังเข้าโมดัลลงคิว · ตัวเดิมยังคืนรายชื่อ', () => {
  const hook = readFileSync(new URL('./usePeopleDirectory.js', import.meta.url), 'utf8');
  assert.match(hook, /export default function usePeopleDirectory\(\) \{\s*return usePeopleDirectoryState\(\)\.users;\s*\}/);
  const page = readFileSync(new URL('../app/requests/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /const \{ users: directory, loading: directoryLoading, error: directoryError \} = usePeopleDirectoryState\(\);/);
  assert.match(page, /<CommitDueDialog[\s\S]*?techniciansLoading=\{!technicians\.length && directoryLoading\}[\s\S]*?techniciansError=\{!technicians\.length && directoryError\}/);
});

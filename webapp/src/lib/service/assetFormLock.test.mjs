// ── สถานะเครื่องเปลี่ยนได้ทางคำสั่งเดียว — ปิดทางลัดที่ฟอร์มแก้ข้อมูล ────────
//
// สองข้อในใบเดียวกัน เพราะเป็นการแก้จุดเดียวกัน:
//   E) เลือก "ว่าง" (`in_stock`) ในฟอร์มแก้ของหน้าไซต์ ⇒ ผิด CHECK
//      `service_assets_place_by_status` (mig 0344) ⇒ **500 ดิบทุกครั้ง ไม่มีทางสำเร็จ**
//   F) อีกสามค่าเป็นทางลัดปลดระวาง/ส่งซ่อมที่ **ไม่มีเหตุผลและไม่มีประวัติ** แข่งกับ
//      ระบบคำสั่ง (`service_asset_moves`) ที่ตั้งใจให้เป็นทางเดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOVE_ONLY_FIELDS, assetFormLockError } from './assetMoves.js';

/** ตัดคอมเมนต์ออกก่อนค้นซอร์ส — ไม่งั้นยามจะไปเจอคำในคำอธิบายของไฟล์เอง */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const asset = (over = {}) => ({
  id: 'SVA1', label: 'เครื่องล็อบบี้', siteId: 'SST1', zoneId: 'SZN1',
  status: 'active', removedAt: null, installedAt: '2026-01-05', ...over,
});

/* ══ ด่านกลาง ═══════════════════════════════════════════════════════════ */

test('🔴 เปลี่ยนสถานะผ่านฟอร์มไม่ได้ — ต้องบอกทางออกด้วย ไม่ใช่แค่ปฏิเสธ', () => {
  for (const status of ['in_stock', 'repair', 'removed']) {
    const err = assetFormLockError(asset(), { label: 'x', status });
    assert.match(err, /สถานะ/, status);
    assert.match(err, /คำสั่ง/, 'ต้องชี้ไปที่ระบบคำสั่ง');
    assert.match(err, /ประวัติ/, 'ต้องบอกว่าทำไมถึงต้องไปทางนั้น');
  }
});

test('🔴 วันที่ถอดก็เป็นของคำสั่ง — ปลดระวางเงียบ ๆ ด้วยการกรอกวันไม่ได้', () => {
  assert.match(assetFormLockError(asset(), { removedAt: '2026-09-09' }), /วันที่ถอด/);
});

test('🔴 สภาพเครื่องก็เป็นของคำสั่ง — พลิก "ชำรุด" กลับเป็น "ปกติ" ผ่านฟอร์มแก้ไม่ได้', () => {
  assert.match(assetFormLockError(asset({ condition: 'broken' }), { condition: 'ok' }), /สภาพเครื่อง/);
  assert.equal(assetFormLockError(asset({ condition: 'broken' }), { condition: 'broken' }), null);
});

test('ส่งค่าเดิมกลับมา = ไม่ใช่การเปลี่ยน (จอส่งทั้งฟอร์มเสมอ)', () => {
  assert.equal(assetFormLockError(asset(), { label: 'ใหม่', status: 'active' }), null);
  assert.equal(assetFormLockError(asset({ removedAt: '2026-08-01' }),
    { removedAt: '2026-08-01' }), null);
});

test('ค่าว่างสามหน้า (null · undefined · "") นับเป็นค่าเดียวกัน', () => {
  assert.equal(assetFormLockError(asset({ removedAt: null }), { removedAt: '' }), null);
  assert.equal(assetFormLockError(asset({ removedAt: null }), {}), null);
  // ⚠️ ไม่ส่งช่องนั้นมาเลย = ไม่ได้ตั้งใจแก้ ⇒ ผ่าน (route คงค่าเดิมไว้ให้)
  assert.equal(assetFormLockError(asset({ status: 'repair' }), { label: 'x' }), null);
});

test('ทะเบียนช่องที่ล็อกตรงกับที่ตั้งใจ — เพิ่มช่องต้องมาแก้เทสต์นี้', () => {
  // condition เติมตอนข้อ H: สภาพเครื่องเปลี่ยนได้ทางคำสั่ง (หน้าเครื่อง) กับทางนัด (ช่างแจ้ง) เท่านั้น
  assert.deepEqual(MOVE_ONLY_FIELDS.map(([f]) => f), ['status', 'removedAt', 'condition']);
  for (const [, label] of MOVE_ONLY_FIELDS) assert.ok(label, 'ทุกช่องต้องมีป้ายไทย');
});

/* ══ ฟอร์ม: ช่องต้องหายจริง ไม่ใช่แค่ server ตีกลับ ═════════════════════ */

test('🔴 ฟอร์มแก้เครื่องต้องไม่มี dropdown สถานะและช่องวันที่ถอดอีก', () => {
  const modal = code('../../components/service/ServiceAssetModal.js');
  assert.doesNotMatch(modal, /ASSET_STATUSES/, 'dropdown สี่ค่ากลับมา = 500 กลับมา');
  assert.doesNotMatch(modal, /change\("status"\)/);
  assert.doesNotMatch(modal, /removedAt/, 'ฟอร์มต้องไม่ส่งช่องที่ตัวเองแก้ไม่ได้');
});

test('สถานะยังต้องเห็น — แค่เป็นข้อความ พร้อมบอกว่าไปเปลี่ยนที่ไหน', () => {
  const modal = code('../../components/service/ServiceAssetModal.js');
  assert.match(modal, /styles\.readonlyValue/, 'ไม่ใช่ช่องกรอกที่ disabled');
  assert.match(modal, /ASSET_STATUS_LABELS\[asset\.status\]/);
  assert.match(modal, /ปลดระวาง/, 'ต้องบอกว่าคำสั่งอยู่ที่หน้าเครื่อง');
});

/* ══ server: ด่านต้องอยู่ฝั่งเซิร์ฟเวอร์ด้วย ═══════════════════════════ */

test('🔑 PATCH ของหน้าไซต์ต้องเรียกด่านกลาง ก่อนประกอบค่าที่จะเขียน', () => {
  const route = code('../../app/api/service/sites/[id]/assets/[assetId]/route.js');
  const lockAt = route.indexOf('assetFormLockError(before, body)');
  const normAt = route.indexOf('normalizeAssetInput({ ...before, ...body })');
  assert.ok(lockAt > 0 && normAt > lockAt, 'ต้องตีกลับก่อนแตะค่าที่จะเขียน');
  assert.match(route, /return conflict\(locked\)/);
});

test('🔴 เพิ่มเครื่องจากหน้าไซต์ต้องไม่เติม in_stock ให้ไซต์คลังอีก (CHECK ของ 0344)', () => {
  const route = code('../../app/api/service/sites/[id]/assets/route.js');
  assert.doesNotMatch(route, /'in_stock'/, 'เติมให้เมื่อไร = ผิด CHECK ทันที');
  assert.match(route, /if \(isWarehouseSite\(access\.site\)\)/,
    'ไซต์คลังต้องได้ข้อความภาษาคน ไม่ใช่ 500 ของฐานข้อมูล');
  assert.match(route, /body\.status && body\.status !== 'active'/);
});

/* ⚠️ กฎทั้งใบยืนอยู่บน CHECK ใบเดียว — ใครแก้ CHECK ต้องมาอ่านไฟล์นี้ */
test('🔴 CHECK ที่เป็นเหตุผลของข้อ E ยังอยู่ใน migration 0344', () => {
  const sql = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/0344_service_machine_registry.sql'), 'utf8');
  const at = sql.indexOf('service_assets_place_by_status CHECK');
  assert.ok(at > 0, 'CHECK หายไป = ต้องทบทวนว่าฟอร์มยังต้องล็อกอยู่ไหม');
  const block = sql.slice(at, sql.indexOf(');', at));
  assert.match(block, /status <> 'in_stock' OR "siteId" IS NULL/);
  assert.match(block, /status <> 'active'\s+OR "siteId" IS NOT NULL/);
});

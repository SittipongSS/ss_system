// คำสั่งย้าย/เปลี่ยนสถานะเครื่อง (เฟส C · mig 0335) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MOVE_CHANGES_SITE,
  MOVE_KINDS,
  MOVE_LABELS,
  MOVE_NEEDS_REASON,
  MOVE_RESULT,
  assetMoveError,
  assetMovePatch,
  assetMovePatchValid,
  assetMoveOwnerError,
  assetMoveRow,
} from './assetMoves.js';
import { ASSET_STATUSES } from './sites.js';

const stock = (over = {}) => ({ id: 'A1', label: 'เครื่อง A', siteId: 'WH', status: 'in_stock', condition: 'ok', ...over });
const onSite = (over = {}) => ({ id: 'A2', label: 'เครื่อง B', siteId: 'S1', status: 'active', condition: 'ok', ...over });
const warehouse = { id: 'WH', name: 'คลังเครื่อง', kind: 'warehouse' };
const customerSite = { id: 'S2', name: 'สาขาเอ', kind: 'customer' };
const ctx = { canEdit: true };
const today = '2026-09-02';

// ── ด่านที่ 1: เห็นปุ่มไหม ─────────────────────────────────────────────

test('ไม่มีสิทธิ์แก้ = ไม่เห็นคำสั่งไหนเลย', () => {
  for (const kind of MOVE_KINDS) {
    assert.ok(assetMoveOwnerError(stock(), kind, { canEdit: false }), `${kind} ควรถูกซ่อน`);
  }
});

/* 🔴 คำสั่งที่ไม่เข้ากับสถานะปัจจุบันต้อง **ซ่อน ไม่ใช่โชว์แล้วกดไม่ได้** —
   "โชว์แล้วบอกเหตุ" มีประโยชน์กับด่านที่ผู้ใช้แก้ได้ (กรอกเหตุผล เลือกปลายทาง)
   ไม่ใช่กับคำสั่งที่ไม่มีความหมายในสถานะนี้ (ติดตั้งเครื่องที่ติดตั้งอยู่แล้ว) */
test('คำสั่งที่ไม่เข้ากับสถานะปัจจุบันถูกซ่อน', () => {
  assert.ok(assetMoveOwnerError(onSite(), 'install', ctx), 'ติดตั้งเครื่องที่ติดตั้งอยู่แล้วไม่ได้');
  assert.ok(assetMoveOwnerError(stock(), 'transfer', ctx), 'ย้ายเครื่องที่อยู่ในคลังไม่ได้');
  assert.ok(assetMoveOwnerError(stock(), 'return', ctx), 'ถอนเครื่องที่อยู่ในคลังอยู่แล้วไม่ได้');
  assert.ok(assetMoveOwnerError(onSite(), 'repair_done', ctx), 'รับคืนเครื่องที่ไม่ได้ส่งซ่อมไม่ได้');

  assert.equal(assetMoveOwnerError(stock(), 'install', ctx), null);
  assert.equal(assetMoveOwnerError(onSite(), 'transfer', ctx), null);
  assert.equal(assetMoveOwnerError(onSite(), 'return', ctx), null);
  assert.equal(assetMoveOwnerError(onSite({ status: 'repair' }), 'repair_done', ctx), null);
});

test('เครื่องที่ปลดระวางแล้วไม่มีคำสั่งไหนทำได้อีก', () => {
  const dead = onSite({ status: 'removed' });
  for (const kind of MOVE_KINDS) {
    assert.ok(assetMoveOwnerError(dead, kind, ctx), `${kind} ต้องถูกปิดหลังปลดระวาง`);
  }
});

// ── ด่านที่ 2: กดได้ไหม ────────────────────────────────────────────────

test('ทุกคำสั่งต้องมีวันที่ และต้องเป็นรูปแบบ ISO', () => {
  assert.match(assetMoveError(onSite(), 'repair', {}, ctx), /วันที่/);
  assert.match(assetMoveError(onSite(), 'repair', { movedAt: '02/09/2026' }, ctx), /วันที่/);
  assert.equal(assetMoveError(onSite(), 'repair', { movedAt: today }, ctx), null);
});

/* เหตุผลบังคับต้องตรงกับ CHECK ใน DB เป๊ะ (>= 3 ตัวอักษร) — ต่างกันเมื่อไร
   ผู้ใช้จะเจอ error ดิบภาษาอังกฤษของ Postgres แทนข้อความไทย */
test('คำสั่งที่ต้องอธิบายได้ บังคับเหตุผลอย่างน้อย 3 ตัวอักษร', () => {
  for (const kind of MOVE_NEEDS_REASON) {
    const asset = kind === 'return' || kind === 'transfer' ? onSite() : onSite();
    const to = kind === 'return' ? warehouse : customerSite;
    const base = { movedAt: today, toSiteId: to.id };
    assert.match(assetMoveError(asset, kind, base, { ...ctx, toSite: to }), /เหตุผล/, `${kind} ต้องบังคับเหตุผล`);
    assert.match(assetMoveError(asset, kind, { ...base, reason: 'ok' }, { ...ctx, toSite: to }), /เหตุผล/);
    assert.equal(assetMoveError(asset, kind, { ...base, reason: 'ลูกค้าเลิกสัญญา' }, { ...ctx, toSite: to }), null);
  }
});

test('ส่งซ่อม/รับคืน ไม่บังคับเหตุผล — บังคับกับของที่ไม่มีอะไรให้อธิบายจะได้ข้อความขยะ', () => {
  assert.equal(assetMoveError(onSite(), 'repair', { movedAt: today }, ctx), null);
  // รับคืนไม่ต้องมีเหตุผล แต่ต้องมีคลังปลายทาง (ดูเทสต์บั๊ก UAT ด้านล่าง)
  assert.equal(assetMoveError(onSite({ status: 'repair' }), 'repair_done',
    { movedAt: today, toSiteId: 'WH' }, { ...ctx, toSite: warehouse }), null);
});

/* 🔴 ด่านที่กันไม่ให้ trigger ของ DB เป็นคนตีกลับ — ข้อความของ trigger เป็นภาษา
   ฐานข้อมูล ผู้ใช้อ่านไม่รู้เรื่อง */
test('ปลายทางต้องเป็นไซต์ประเภทที่ถูก', () => {
  const bad = assetMoveError(stock(), 'install', { movedAt: today, toSiteId: 'WH2' },
    { ...ctx, toSite: { id: 'WH2', name: 'คลัง 2', kind: 'warehouse' } });
  assert.match(bad, /คลัง/, 'ติดตั้งเข้าคลังไม่ได้');

  const bad2 = assetMoveError(onSite(), 'return', { movedAt: today, toSiteId: 'S2', reason: 'เลิกสัญญา' },
    { ...ctx, toSite: customerSite });
  assert.match(bad2, /คลัง/, 'ถอนกลับคลังต้องเลือกคลัง');

  assert.equal(assetMoveError(stock(), 'install', { movedAt: today, toSiteId: 'S2' },
    { ...ctx, toSite: customerSite }), null);
});

test('ย้ายไปที่เดิมไม่ใช่การย้าย', () => {
  const asset = onSite({ siteId: 'S2' });
  const err = assetMoveError(asset, 'transfer', { movedAt: today, toSiteId: 'S2', reason: 'ย้ายสาขา' },
    { ...ctx, toSite: customerSite });
  assert.match(err, /ที่เดิม/);
});

test('ไซต์ปลายทางที่ปิดใช้งานอยู่ เลือกไม่ได้', () => {
  const err = assetMoveError(stock(), 'install', { movedAt: today, toSiteId: 'S2' },
    { ...ctx, toSite: { ...customerSite, isActive: false } });
  assert.match(err, /ปิดใช้งาน/);
});

test('แจ้งเปลี่ยนสภาพเป็นค่าเดิม ไม่ใช่การเปลี่ยน', () => {
  assert.match(assetMoveError(onSite(), 'condition', { movedAt: today, condition: 'ok' }, ctx), /อยู่แล้ว/);
  assert.equal(assetMoveError(onSite(), 'condition', { movedAt: today, condition: 'broken' }, ctx), null);
});

// ── ผลลัพธ์ที่จะเขียนลงเครื่อง ──────────────────────────────────────────

test('ติดตั้ง: ย้ายไซต์ + ตั้งวันติดตั้ง + ล้างวันถอดเดิม', () => {
  const patch = assetMovePatch(stock(), 'install', { movedAt: today, toSiteId: 'S2', toZoneId: 'Z1' });
  assert.equal(patch.status, 'active');
  assert.equal(patch.siteId, 'S2');
  assert.equal(patch.zoneId, 'Z1');
  assert.equal(patch.installedAt, today);
  assert.equal(patch.removedAt, null, 'กลับมาใช้งานแล้ว วันถอดเดิมไม่จริงอีกต่อไป');
});

/* 🔴 ล้างโซนเสมอเมื่อข้ามไซต์ — ปล่อยค้างไว้เครื่องจะชี้โซนของไซต์อื่น
   (trigger ใน mig 0332 ตีกลับให้ แต่ต้องล้างที่นี่ ไม่ใช่ให้ล้ม) */
test('ย้ายข้ามไซต์โดยไม่เลือกโซน = โซนถูกล้าง ไม่ใช่ค้างของไซต์เดิม', () => {
  const patch = assetMovePatch(onSite({ zoneId: 'Z-OLD' }), 'transfer', { movedAt: today, toSiteId: 'S2' });
  assert.equal(patch.zoneId, null);
});

test('ถอนกลับคลัง: สถานะเป็น in_stock + บันทึกวันถอด', () => {
  const patch = assetMovePatch(onSite(), 'return', { movedAt: today, toSiteId: 'WH' });
  assert.equal(patch.status, 'in_stock');
  assert.equal(patch.siteId, 'WH');
  assert.equal(patch.removedAt, today);
});

test('ส่งซ่อมตั้งสภาพเป็นชำรุด · รับคืนตั้งกลับเป็นปกติ', () => {
  assert.equal(assetMovePatch(onSite(), 'repair', { movedAt: today }).condition, 'broken');
  const done = assetMovePatch(onSite({ status: 'repair', condition: 'broken' }), 'repair_done', { movedAt: today });
  assert.equal(done.status, 'in_stock');
  assert.equal(done.condition, 'ok');
});

test('แจ้งเปลี่ยนสภาพไม่แตะสถานะและที่อยู่', () => {
  const patch = assetMovePatch(onSite(), 'condition', { movedAt: today, condition: 'broken' });
  assert.equal(patch.condition, 'broken');
  assert.equal(patch.status, undefined);
  assert.equal(patch.siteId, undefined);
});

test('ทุกค่าที่คำสั่งเขียนลงเครื่อง ต้องอยู่ในทะเบียนที่ CHECK ใน DB ยอมรับ', () => {
  for (const kind of MOVE_KINDS) {
    const patch = assetMovePatch(onSite(), kind, { movedAt: today, toSiteId: 'S2', condition: 'broken' });
    assert.ok(assetMovePatchValid(patch), `${kind} เขียนค่าที่ DB ไม่ยอมรับ`);
  }
});

// ── แถวประวัติ ─────────────────────────────────────────────────────────

/* เก็บชื่อไซต์ ณ ตอนนั้นด้วย — ไซต์เปลี่ยนชื่อทีหลังแล้วประวัติต้องไม่เพี้ยน
   (กติกาเดียวกับ snapshot ชื่อลูกค้าบนเอกสาร) */
test('แถวประวัติเก็บทั้งต้นทาง ปลายทาง และค่าก่อน/หลังของสองแกน', () => {
  const asset = onSite({ siteId: 'S1', zoneId: 'Z-OLD', condition: 'ok' });
  const row = assetMoveRow(asset, 'transfer',
    { movedAt: today, toSiteId: 'S2', toZoneId: 'Z-NEW', reason: 'ย้ายสาขา' },
    { fromSite: { id: 'S1', name: 'สาขาเดิม' }, toSite: customerSite });

  assert.equal(row.fromSiteId, 'S1');
  assert.equal(row.fromSiteName, 'สาขาเดิม');
  assert.equal(row.fromZoneId, 'Z-OLD');
  assert.equal(row.toSiteId, 'S2');
  assert.equal(row.toSiteName, 'สาขาเอ');
  assert.equal(row.toZoneId, 'Z-NEW');
  assert.equal(row.statusBefore, 'active');
  assert.equal(row.statusAfter, 'active');
  assert.equal(row.reason, 'ย้ายสาขา');
});

test('คำสั่งที่ไม่ย้ายที่ ปลายทางเท่ากับต้นทาง (ไม่ใช่ค่าว่าง)', () => {
  const row = assetMoveRow(onSite({ siteId: 'S1' }), 'repair', { movedAt: today },
    { fromSite: { id: 'S1', name: 'สาขาเดิม' } });
  assert.equal(row.toSiteId, 'S1');
  assert.equal(row.toSiteName, 'สาขาเดิม');
  assert.equal(row.statusAfter, 'repair');
  assert.equal(row.conditionAfter, 'broken');
});

// ── ทะเบียนต้องตรงกันสามที่: lib · CHECK ใน DB · ป้ายไทย ───────────────

test('🔴 ทะเบียนคำสั่งใน lib ตรงกับ CHECK ของ migration 0335', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/0335_service_asset_moves.sql'), 'utf8');
  const block = sql.slice(sql.indexOf('kind            text NOT NULL CHECK'));
  const inSql = [...block.slice(0, block.indexOf('))')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...MOVE_KINDS].sort(), [...inSql].sort(),
    'เพิ่มคำสั่งใน lib แล้วลืมแก้ CHECK = insert ล้มด้วย 23514 ตอน production');
});

test('ทุกคำสั่งมีป้ายไทยและมีผลลัพธ์ประกาศไว้', () => {
  for (const kind of MOVE_KINDS) {
    assert.ok(MOVE_LABELS[kind], `ขาดป้ายของ ${kind}`);
    assert.ok(MOVE_RESULT[kind], `ขาดผลลัพธ์ของ ${kind}`);
    const { status } = MOVE_RESULT[kind];
    if (status) assert.ok(ASSET_STATUSES.includes(status), `${kind} ชี้สถานะที่ไม่มีในทะเบียน`);
  }
});

test('คำสั่งที่บังคับเหตุผล/ย้ายไซต์ ต้องเป็นสับเซ็ตของทะเบียนคำสั่ง', () => {
  for (const kind of [...MOVE_NEEDS_REASON, ...MOVE_CHANGES_SITE]) {
    assert.ok(MOVE_KINDS.includes(kind), `${kind} ไม่อยู่ในทะเบียนคำสั่ง`);
  }
});

/* 🐞 **บั๊กที่ UAT 2026-09-02 จับได้** — `repair_done` เคยไม่ต้องเลือกไซต์ปลายทาง
   ⇒ เครื่องที่ส่งซ่อม *จากไซต์ลูกค้า* ยังมี siteId ชี้ไซต์นั้น พอสั่งรับคืนแล้ว
   ตั้ง in_stock เครื่องกลายเป็น "อยู่ในคลัง" ทั้งที่อยู่ที่ไซต์ลูกค้า
   ⇒ **trigger ของ DB เป็นคนตีกลับ (500 + ข้อความภาษาฐานข้อมูล)** ซึ่งเป็นสิ่งที่
      ตัวตัดสินนี้มีไว้เพื่อกันตั้งแต่แรก */
test('🔴 รับคืนจากซ่อมต้องเลือกคลังปลายทาง — ไม่งั้น trigger ของ DB เป็นคนตีกลับ', () => {
  const atRepairFromSite = onSite({ status: 'repair', condition: 'broken', siteId: 'S1' });

  // ไม่เลือกปลายทาง = ตกที่ด่านของเรา ไม่ใช่ที่ DB
  assert.match(assetMoveError(atRepairFromSite, 'repair_done', { movedAt: today }, ctx), /ปลายทาง/);

  // เลือกไซต์ลูกค้า = ตกเหมือนกัน พร้อมข้อความที่คนอ่านรู้เรื่อง
  assert.match(
    assetMoveError(atRepairFromSite, 'repair_done', { movedAt: today, toSiteId: 'S2' },
      { ...ctx, toSite: customerSite }),
    /คลัง/,
  );

  // เลือกคลัง = ผ่าน และเครื่องย้ายเข้าคลังจริง
  assert.equal(assetMoveError(atRepairFromSite, 'repair_done', { movedAt: today, toSiteId: 'WH' },
    { ...ctx, toSite: warehouse }), null);
  const patch = assetMovePatch(atRepairFromSite, 'repair_done', { movedAt: today, toSiteId: 'WH' });
  assert.equal(patch.status, 'in_stock');
  assert.equal(patch.condition, 'ok');
  assert.equal(patch.siteId, 'WH', 'ต้องย้ายเข้าคลังจริง ไม่ใช่ค้างที่ไซต์ลูกค้า');
});

/* เครื่องที่ส่งซ่อม **จากคลัง** ต้องกลับเข้าคลังใบเดิมได้ — ไม่ใช่ถูกด่าน
   "ไซต์ปลายทางเป็นที่เดิม" ปิดไว้ (นี่คือเหตุผลที่ repair_done ไม่อยู่ใน
   MOVE_REQUIRES_NEW_SITE) */
test('ส่งซ่อมจากคลัง กลับเข้าคลังใบเดิมได้', () => {
  const atRepairFromStock = stock({ status: 'repair', condition: 'broken', siteId: 'WH' });
  assert.equal(assetMoveError(atRepairFromStock, 'repair_done', { movedAt: today, toSiteId: 'WH' },
    { ...ctx, toSite: warehouse }), null);
});

test('ถอนกลับคลังยังต้องเป็นคนละไซต์กับที่ติดตั้งอยู่', () => {
  const err = assetMoveError(onSite({ siteId: 'WH' }), 'return',
    { movedAt: today, toSiteId: 'WH', reason: 'เลิกสัญญา' }, { ...ctx, toSite: warehouse });
  assert.match(err, /ที่เดิม/);
});

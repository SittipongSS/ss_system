// ทะเบียนกลิ่น (mig 0171) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENT_USABLE_STATUSES,
  acceptScentError,
  archiveScentError,
  canEditScent,
  canProposeScent,
  canViewScents,
  deleteScentError,
  findScentByIdentity,
  isScentRegistrar,
  isScentUsable,
  normalizeScentInput,
  scentIdentityKey,
  scentTransitionError,
  sendScentError,
  derivedFromError,
} from './scents.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };
const admin = { id: 'u-admin', role: 'admin' };
const viewer = { id: 'u-viewer', role: 'viewer' };
const exec = { id: 'u-exec', role: 'executive' };

const scent = (over = {}) => ({
  id: 'SCT-1', name: 'Forest night', customerId: 'CUS-1',
  status: 'developing', createdById: 'u-sale', ...over,
});

// ── ตัวตน ────────────────────────────────────────────────────────────────
test('ตัวตนกลิ่น = ชื่อ + ลูกค้า (ไม่สนตัวพิมพ์/ช่องว่างซ้ำ)', () => {
  assert.equal(
    scentIdentityKey({ name: '  Forest   Night ', customerId: 'CUS-1' }),
    scentIdentityKey({ name: 'forest night', customerId: 'CUS-1' }),
  );
});

test('กลิ่นชื่อเดียวกันคนละลูกค้า = คนละตัว (มติ 9: ใช้ข้ามลูกค้าไม่ได้)', () => {
  const rows = [scent({ id: 'SCT-A', customerId: 'CUS-1' })];
  assert.equal(findScentByIdentity(rows, { name: 'Forest night', customerId: 'CUS-1' })?.id, 'SCT-A');
  assert.equal(findScentByIdentity(rows, { name: 'Forest night', customerId: 'CUS-2' }), null);
});

// ── ตรวจข้อมูลเข้า ───────────────────────────────────────────────────────
test('ต้องเลือกลูกค้าเสมอ — ไม่มี "กลิ่นกลาง" ในระบบนี้', () => {
  assert.match(normalizeScentInput({ name: 'A' }).error, /ลูกค้า/);
  assert.equal(normalizeScentInput({ name: 'A', customerId: 'CUS-1' }).error, null);
});

test('ชื่อกลิ่นถูกตัดช่องว่างซ้ำก่อนบันทึก', () => {
  assert.equal(normalizeScentInput({ name: ' Walk  on   beach ', customerId: 'C' }).value.name,
    'Walk on beach');
});

test('ไม่ระบุรหัสได้ (ร่างของฝ่ายขายยังไม่มีรหัส)', () => {
  assert.equal(normalizeScentInput({ name: 'A', customerId: 'C' }).value.code, null);
});

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
test('RD และ admin เป็นเจ้าของทะเบียน ฝ่ายขายไม่ใช่', () => {
  assert.equal(isScentRegistrar(rd), true);
  assert.equal(isScentRegistrar(admin), true);
  assert.equal(isScentRegistrar(sale), false);
});

test('ฝ่ายขายเสนอกลิ่นเป็นร่างได้ (มติ 10)', () => {
  assert.equal(canProposeScent(sale), true);
});

test('viewer/executive อ่านได้แต่เสนอไม่ได้ — read-only observer', () => {
  assert.equal(canViewScents(viewer), true);
  assert.equal(canViewScents(exec), true);
  assert.equal(canProposeScent(viewer), false);
  assert.equal(canProposeScent(exec), false);
});

test('ฝ่ายขายบันทึก feedback ลูกค้าได้ (คนที่คุยกับลูกค้าคือฝ่ายขาย)', () => {
});

test('ฝ่ายขายแก้ได้เฉพาะร่างของตัวเอง — เข้าทะเบียนแล้วเป็นงาน RD', () => {
  assert.equal(canEditScent(sale, scent({ status: 'draft', createdById: 'u-sale' })), true);
  assert.equal(canEditScent(sale, scent({ status: 'draft', createdById: 'u-other' })), false);
  assert.equal(canEditScent(sale, scent({ status: 'active' })), false);
  assert.equal(canEditScent(rd, scent({ status: 'active' })), true);
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('รับเข้าทะเบียนต้องมีรหัส และทำได้ครั้งเดียว', () => {
  assert.match(acceptScentError(scent({ status: 'draft' }), { code: '' }), /รหัส/);
  assert.equal(acceptScentError(scent({ status: 'draft' }), { code: 'SC-01' }), null);
  assert.match(acceptScentError(scent({ status: 'active' }), { code: 'SC-01' }), /ไปแล้ว/);
});

test('ลบได้เฉพาะร่างที่ยังไม่มีคำร้องอ้างถึง', () => {
  assert.equal(deleteScentError(scent({ status: 'draft' })), null);
  // ⚠️ ตาข่ายนี้มาแทน revisionCount เดิม — producedScentId เป็น FK แบบ SET NULL
  // ลบผ่านได้เงียบ ๆ แล้วคำร้องจะชี้ไปที่ว่างโดยไม่มีอะไรฟ้อง
  assert.match(deleteScentError(scent({ status: 'draft' }), { linkedCount: 1 }), /ลบไม่ได้/);
  assert.match(deleteScentError(scent({ status: 'active' })), /เฉพาะร่าง/);
});

test('ร่างเลิกใช้ไม่ได้ — ต้องลบทิ้ง', () => {
  assert.match(archiveScentError(scent({ status: 'draft' })), /ลบทิ้ง/);
  assert.equal(archiveScentError(scent({ status: 'active' })), null);
});

test('เปลี่ยนสถานะย้อนกลับไปเป็นร่างไม่ได้', () => {
  assert.match(scentTransitionError(scent({ status: 'active' }), 'draft'), /ไม่ได้/);
  assert.equal(scentTransitionError(scent({ status: 'active' }), 'archived'), null);
  assert.equal(scentTransitionError(scent({ status: 'archived' }), 'active'), null);
});

test('ร่างยังอ้างในคำร้องขอราคาไม่ได้', () => {
  assert.equal(isScentUsable(scent({ status: 'draft' })), false);
  assert.equal(isScentUsable(scent({ status: 'developing' })), true);
  assert.deepEqual(SCENT_USABLE_STATUSES, ['developing', 'active']);
});

// ── วันที่ส่งกลิ่น ────────────────────────────────────────────────────────
//
// ⭐ กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต ⇒ ไม่มีตารางรอบ ไม่มีเลข Rev ไม่มีด่าน
// "ตัวก่อนหน้ายังรอผลอยู่" · เหลือแค่ช่องวันที่ช่องเดียวบนตัวกลิ่น
test('กลิ่นที่ยังเป็นร่างบันทึกวันที่ส่งไม่ได้ (RD ต้องรับเข้าทะเบียนก่อน)', () => {
  assert.match(sendScentError(scent({ status: 'draft' }), { sentAt: '2026-07-28' }), /ร่าง/);
  assert.match(sendScentError(scent({ status: 'archived' }), { sentAt: '2026-07-28' }), /เปิดใช้ก่อน/);
});

test('วันที่ส่งกลิ่นบังคับและต้องเป็นรูปแบบ ISO', () => {
  assert.match(sendScentError(scent(), {}).toString(), /ต้องระบุวันที่ส่ง/);
  assert.match(sendScentError(scent(), { sentAt: '28-07-2026' }), /ไม่ถูกต้อง/);
  assert.equal(sendScentError(scent(), { sentAt: '2026-07-28' }), null);
});

test('บันทึกวันที่ส่งซ้ำได้ — คนกรอกผิดวันต้องแก้ได้ ไม่ใช่ลบกลิ่นทิ้งแล้วสร้างใหม่', () => {
  assert.equal(sendScentError(scent({ sentAt: '2026-07-01' }), { sentAt: '2026-07-28' }), null);
});

// ── ชื่อที่ลูกค้าเรียก + สายพันธุ์ ─────────────────────────────────────────
test('ชื่อที่ลูกค้าเรียกเป็นของเสริม ไม่ใช่ของบังคับ และไม่แทนชื่อของเรา', () => {
  // เว้นว่าง = null ไม่ใช่สตริงว่าง — ไม่งั้นทุกการนับต่อจากนี้ต้องระวัง '' vs NULL เอง
  // (บทเรียนจาก 0171 ข้อ 6: prod มี 41 แถวที่เป็น '' แล้วหน้าจอโชว์เหมือนมีค่า)
  const plain = normalizeScentInput({ name: 'Forest night', customerId: 'CUS-1' });
  assert.equal(plain.error, null);
  assert.equal(plain.value.customerTradeName, null);

  const named = normalizeScentInput({
    name: 'Forest night', customerId: 'CUS-1', customerTradeName: '  Summer   Breeze ',
  });
  assert.equal(named.value.customerTradeName, 'Summer Breeze', 'ตัดช่องว่างซ้ำเหมือนชื่อกลิ่น');
  // ชื่อของเราต้องไม่ถูกแตะเลย — สองช่องนี้อยู่คู่กัน ไม่ใช่แทนกัน
  assert.equal(named.value.name, 'Forest night');

  assert.match(
    normalizeScentInput({
      name: 'x', customerId: 'CUS-1', customerTradeName: 'ก'.repeat(201),
    }).error,
    /ชื่อที่ลูกค้าเรียก/,
  );
});

test('อ้างกลิ่นต้นทางข้ามลูกค้าไม่ได้ — ข้อห้ามระดับโมเดล ไม่ใช่แค่ตัวกรองบนจอ', () => {
  const parent = { id: 'SCT-9', customerId: 'CUS-1' };
  assert.equal(derivedFromError(parent, { customerId: 'CUS-1', id: 'SCT-1' }), null);
  assert.match(derivedFromError(parent, { customerId: 'CUS-2', id: 'SCT-1' }), /คนละราย/);
  // หาไม่เจอ ≠ ข้ามลูกค้า — ข้อความต้องต่างกัน เพราะทางแก้คนละทาง
  assert.match(derivedFromError(null, { customerId: 'CUS-1' }), /ไม่พบกลิ่นต้นทาง/);
  // วนลูปสั้นที่สุดที่เป็นไปได้ (constraint ของ 0205 กันอยู่ แต่ที่นี่ได้ข้อความไทย)
  assert.match(derivedFromError(parent, { customerId: 'CUS-1', id: 'SCT-9' }), /อ้างตัวเอง/);
});

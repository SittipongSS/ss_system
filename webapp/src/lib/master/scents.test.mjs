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
  SCENT_SOURCES, matchesScentSource, scentSourceKind, scentSourceLabel,
  NEW_SCENT_STATUSES, newScentStatus,
  acceptScentCode, acceptedScentStatus, canSetScentCode, proposedScentStatus,
  scentFormPayload,
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

// ── ที่มาของกลิ่น (มติผู้ใช้ 2026-08-08) ────────────────────────────────
//
// ทะเบียนเป็นของกลางที่ข้อมูลส่วนใหญ่มาจากสายพัฒนากลิ่น · ที่เพิ่มตรงคือกลิ่นเดิม
// ที่เคยออกแบบไว้ก่อนมีระบบ ⇒ เปิดทะเบียนมาต้องแยกออกทันทีว่าตัวไหนเป็นตัวไหน
const fromRequest = { briefId: 'B1', sourceRequest: { id: 'REQ-1', docNo: 'SB-2608-001' } };

test('⭐ ตัดสินที่มาจาก briefId ไม่ใช่ dealId — ดีลกรอกเองได้ตอนเพิ่มตรง', () => {
  assert.equal(scentSourceKind(fromRequest), 'request');
  assert.equal(scentSourceKind({ briefId: 'B1' }), 'request');
  assert.equal(scentSourceKind({}), 'manual');
  // ⚠️ ดีลอย่างเดียวไม่พอ — POST /api/master/scents รับ dealId จากคนเพิ่มเองได้
  assert.equal(scentSourceKind({ dealId: 'D-1' }), 'manual');
  assert.equal(scentSourceKind(null), 'manual');
});

test('ป้ายที่มา — มีคำร้องให้ตามกลับ กับไม่มี คนละข้อความ', () => {
  assert.deepEqual(scentSourceLabel(fromRequest),
    { kind: 'request', label: 'คำร้อง SB-2608-001', requestId: 'REQ-1' });
  // ⚠️ คำร้องถูกลบไปแล้ว ยังเป็น "มาจากคำร้อง" อยู่ดี — ตกเป็น "เพิ่มเอง" เมื่อไร
  // คือโกหกเรื่องที่มาของข้อมูล
  const orphan = scentSourceLabel({ briefId: 'B1' });
  assert.equal(orphan.kind, 'request');
  assert.equal(orphan.requestId, null);
  assert.match(orphan.label, /ถูกลบ/);
  assert.equal(scentSourceLabel({}).label, 'เพิ่มเอง');
  // ใบร่างที่ยังไม่มีเลขที่ — ถอยไปใช้ id ไม่ใช่โชว์ช่องว่าง
  assert.match(scentSourceLabel({ briefId: 'B1', sourceRequest: { id: 'REQ-9' } }).label, /REQ-9/);
});

test('ตัวกรองที่มา — ค่าว่างคือทั้งหมด', () => {
  assert.equal(matchesScentSource(fromRequest, ''), true);
  assert.equal(matchesScentSource({}, ''), true);
  assert.equal(matchesScentSource(fromRequest, 'request'), true);
  assert.equal(matchesScentSource(fromRequest, 'manual'), false);
  assert.equal(matchesScentSource({}, 'manual'), true);
  // ตัวเลือกบนจอต้องครบทั้งสองแบบ ไม่งั้นกรองแล้วมีของหายไปโดยไม่มีตัวเลือกให้กลับมา
  assert.deepEqual(SCENT_SOURCES.map((o) => o.value).sort(), ['manual', 'request']);
});

// ── กลิ่นเก่าที่เพิ่มเข้าทะเบียนเอง (มติผู้ใช้ 2026-08-08 · ม-75) ────────
const base = { name: 'Ocean Breeze', customerId: 'CUS-1' };

test('⭐ วันผลิต/วันส่งของกลิ่นเก่า — ไม่บังคับ แต่ใส่มาแล้วต้องเป็น ISO', () => {
  const { value } = normalizeScentInput({ ...base, producedAt: '2024-03-12', sentAt: '2024-03-20' });
  assert.equal(value.producedAt, '2024-03-12');
  assert.equal(value.sentAt, '2024-03-20');
  // ⚠️ ไม่บังคับ — กลิ่นเก่าบางตัวไม่มีใครจำวันได้แล้ว · ว่างแล้วขึ้น N/A ตรงไปตรงมา
  // ดีกว่าบังคับให้เดาวันแล้วได้ข้อมูลที่ดูน่าเชื่อถือแต่ผิด
  const blank = normalizeScentInput(base);
  assert.equal(blank.error, null);
  assert.equal(blank.value.producedAt, null);
  assert.equal(blank.value.sentAt, null);
  assert.match(normalizeScentInput({ ...base, producedAt: '12/03/2024' }).error, /วันที่ผลิตกลิ่น/);
  assert.match(normalizeScentInput({ ...base, sentAt: '20/03/2024' }).error, /วันที่ส่งลูกค้า/);
});

test('⭐ เลือกสถานะตอนสร้างได้เฉพาะสองตัวที่ "เป็นของจริงแล้ว"', () => {
  // กลิ่นเก่าที่ลูกค้าอนุมัติไปแล้ว = active ตั้งแต่แรก ไม่ต้องกดเปลี่ยนอีกรอบ
  assert.equal(newScentStatus('active', true), 'active');
  assert.equal(newScentStatus('developing', true), 'developing');
  // ⚠️ draft เป็นของทางเสนอร่าง · archived เป็น action แยก — เลือกเองไม่ได้ทั้งคู่
  assert.equal(newScentStatus('draft', true), 'developing');
  assert.equal(newScentStatus('archived', true), 'developing');
  assert.equal(newScentStatus('', true), 'developing');
  assert.deepEqual(NEW_SCENT_STATUSES, ['developing', 'active']);
});

test('⭐ ฝ่ายขายที่เสนอร่างได้ draft เสมอ ไม่ว่าจะส่งอะไรมา', () => {
  // "ใส่รหัส = รับเข้าทะเบียน" เป็นอำนาจของ RD — ปล่อยให้เลือกสถานะเองก็ข้ามด่านนั้น
  assert.equal(newScentStatus('active', false), 'draft');
  assert.equal(newScentStatus('developing', false), 'draft');
  assert.equal(newScentStatus(undefined, false), 'draft');
});

// ── ฝ่ายขายกรอกครบ · RD ยืนยัน (มติผู้ใช้ 2026-08-19 · mig 0269) ──────────
test('⭐ สถานะที่ผู้เสนอขอ เก็บได้เฉพาะสองตัวที่เป็นของจริง', () => {
  assert.equal(proposedScentStatus('active'), 'active');
  assert.equal(proposedScentStatus('developing'), 'developing');
  // draft/archived/ค่าเพี้ยน = ไม่เก็บ (null) — ตอนรับเข้าทะเบียนตกไปที่ developing
  assert.equal(proposedScentStatus('draft'), null);
  assert.equal(proposedScentStatus('archived'), null);
  assert.equal(proposedScentStatus(''), null);
  assert.equal(proposedScentStatus(undefined), null);
});

test('⭐ เจ้าของร่างกรอก/แก้รหัสของตัวเองได้ — ของที่เข้าทะเบียนแล้วเป็นของ RD', () => {
  assert.equal(canSetScentCode(sale, null), true);                                  // โหมดสร้าง
  assert.equal(canSetScentCode(sale, scent({ status: 'draft', createdById: 'u-sale' })), true);
  assert.equal(canSetScentCode(sale, scent({ status: 'draft', createdById: 'u-other' })), false);
  // ⚠️ รับเข้าทะเบียนแล้ว = รหัสเป็นตัวตนที่ระบบอื่นอ้างถึง ฝ่ายขายแตะไม่ได้
  assert.equal(canSetScentCode(sale, scent({ status: 'developing', createdById: 'u-sale' })), false);
  assert.equal(canSetScentCode(rd, scent({ status: 'active' })), true);
  assert.equal(canSetScentCode(viewer, null), false);
});

test('⭐ รหัสตอนรับเข้าทะเบียน มาจากร่างได้ ไม่ต้องพิมพ์ซ้ำ', () => {
  assert.equal(acceptScentCode(scent({ code: 'SC-OLD' }), {}), 'SC-OLD');
  // พิมพ์มาใหม่ = ทับของเดิม (RD แก้ที่ผู้เสนอกรอกผิดได้)
  assert.equal(acceptScentCode(scent({ code: 'SC-OLD' }), { code: ' SC-NEW ' }), 'SC-NEW');
  assert.equal(acceptScentCode(scent({ code: null }), {}), '');
  // ไม่มีทั้งสองทาง = ยังผ่านด่านไม่ได้ (constraint ของฐานบังคับว่าต้องมีรหัส)
  assert.match(acceptScentError(scent({ status: 'draft', code: null }), {}), /รหัส/);
  assert.equal(acceptScentError(scent({ status: 'draft', code: 'SC-OLD' }), {}), null);
});

test('⭐ สถานะปลายทางตอนรับเข้าทะเบียน: คนกดเลือก > ที่ผู้เสนอขอ > developing', () => {
  const draft = (over) => scent({ status: 'draft', ...over });
  assert.equal(acceptedScentStatus(draft({ proposedStatus: 'active' }), {}), 'active');
  // ⚠️ ค่าที่ผู้เสนอขอเป็นแค่ค่าตั้งต้น — คนตรวจเปลี่ยนทับได้เสมอ
  assert.equal(acceptedScentStatus(draft({ proposedStatus: 'active' }), { status: 'developing' }), 'developing');
  assert.equal(acceptedScentStatus(draft({ proposedStatus: null }), {}), 'developing');
  // ค่าที่ไม่อยู่ในชุด = ไม่เชื่อ (ยิง API ตรงก็ดันสถานะเถื่อนเข้าไม่ได้)
  assert.equal(acceptedScentStatus(draft({ proposedStatus: 'archived' }), { status: 'draft' }), 'developing');
});

/* ── ฟอร์ม → payload (ใช้ร่วมหน้ารายการกับหน้ารายละเอียด · 2026-08-19) ────── */
test('payload ของฟอร์มกลิ่น: วัน/สถานะส่งเฉพาะตอนสร้าง · รหัสส่งเมื่อมีสิทธิ์', () => {
  const value = {
    name: 'Forest night', code: ' SC-1 ', customerId: 'CUS-1', customerTradeName: '',
    derivedFromScentId: '', note: '', producedAt: '2026-08-01', sentAt: '2026-08-02',
    status: 'active',
  };
  const created = scentFormPayload(value, { canSetCode: true, mode: 'create', customerName: 'ลูกค้า ก' });
  assert.equal(created.code, 'SC-1', 'ตัดช่องว่างหัวท้ายเหมือนที่ index เทียบ');
  assert.equal(created.producedAt, '2026-08-01');
  /* ⭐ ฝ่ายขายส่งสถานะมาได้ (mig 0269) — server ลงเป็น `proposedStatus` ให้เอง
     แถวยังเป็นร่าง ⇒ ฟอร์มไม่ต้องรู้เรื่องนั้น ส่งสิ่งที่คนกรอกไปตรง ๆ */
  assert.equal(created.status, 'active');
  assert.equal(created.customerName, 'ลูกค้า ก');

  // ⚠️ โหมดแก้ไม่ส่งสามช่องนั้น — วัน/สถานะมี action ของตัวเอง
  const edited = scentFormPayload(value, { canSetCode: true, mode: 'edit' });
  assert.equal('producedAt' in edited, false);
  assert.equal('status' in edited, false);
  assert.equal(edited.customerId, 'CUS-1');

  // 🐞 ลบรหัสทิ้งแล้วต้อง **ส่งค่าว่างไป** ให้ server ตัดสิน — ไม่ส่ง = เงียบแล้วตอบ 200
  assert.equal(scentFormPayload({ ...value, code: '' }, { canSetCode: true }).code, '');
  // คนที่แตะรหัสไม่ได้ (ร่างของคนอื่น / ของที่เข้าทะเบียนแล้ว) ไม่ส่งช่องรหัสเลย
  assert.equal('code' in scentFormPayload(value, { canSetCode: false }), false);
});

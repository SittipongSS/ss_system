// ทะเบียนไซต์บริการ + เครื่อง (mig 0187) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessConflict,
  accessWindowText,
  assetRollup,
  minutesOf,
  normalizeAssetInput,
  normalizeSiteInput,
  refillDueDate,
  siteAddressCarry,
  siteAddressDrift,
  toHHMM,
} from './sites.js';
import { canBeServiceAssignee, canEditService, canViewService } from '../permissions.js';

const site = (over = {}) => ({ id: 'S1', name: 'สาขาเอ็มควอเทียร์', accessDays: [], ...over });

// ── ตรวจข้อมูลไซต์ ───────────────────────────────────────────────────────
test('ไซต์ต้องมีลูกค้าและชื่อ', () => {
  assert.equal(normalizeSiteInput({ name: 'สาขา A' }).error, 'ต้องเลือกลูกค้า');
  assert.equal(normalizeSiteInput({ customerId: 'C1' }).error, 'ต้องระบุชื่อไซต์');
});

test('เวลาเข้าไซต์ผิดรูปแบบถูกจับ', () => {
  assert.match(normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '25:00' }).error, /เวลาเริ่ม/);
});

test('เวลาเริ่มต้องก่อนเวลาสิ้นสุด', () => {
  const { error } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '15:00', accessTo: '10:00' });
  assert.match(error, /ต้องก่อนเวลาสิ้นสุด/);
});

test('⭐ accessDays เรียงเสมอ — [3,1] กับ [1,3] ต้องเป็นค่าเดียวกันใน DB', () => {
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessDays: [3, 1, 1] });
  assert.deepEqual(value.accessDays, [1, 3]);
});

test('เวลาถูกตัดวินาทีทิ้งเสมอ (Postgres คืน 10:00:00)', () => {
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '10:00:00', accessTo: '17:30' });
  assert.equal(value.accessFrom, '10:00');
  assert.equal(value.accessTo, '17:30');
  assert.equal(toHHMM('10:00:00'), '10:00');
  assert.equal(minutesOf('10:30'), 630);
});

// ── ที่มาของที่อยู่ + โครงการที่ประทับเอง (mig 0313 / 0299) ──────────────
test('ที่มาของที่อยู่และโครงการเดินทางถึง DB — ไม่ถูกตัดทิ้งกลางทาง', () => {
  const { value } = normalizeSiteInput({
    customerId: 'C1', name: 'A', customerAddressId: ' ADDR-1 ', projectId: 'PJ-9',
  });
  assert.equal(value.customerAddressId, 'ADDR-1');
  assert.equal(value.projectId, 'PJ-9');
});

test('⭐ ไม่ส่งมา = null ไม่ใช่สตริงว่าง — ไซต์ที่ไม่มีโครงการเป็นเรื่องปกติ', () => {
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A' });
  assert.equal(value.customerAddressId, null);
  assert.equal(value.projectId, null);
});

test('ค่าอ้างอิงที่ยาวผิดปกติถูกตีกลับ ไม่ใช่เขียนลงแถว', () => {
  const { error } = normalizeSiteInput({ customerId: 'C1', name: 'A', projectId: 'P'.repeat(61) });
  assert.match(error, /โครงการไม่ถูกต้อง/);
});

const registryAddress = {
  id: 'ADDR-1', address: '191 ถ.สีลม แขวงสีลม เขตบางรัก กทม. 10500', addressOverride: true,
  mapUrl: '', contactName: 'คุณสมชาย', contactPhone: '021234567',
};

test('⭐ ทะเบียนว่าง ห้ามล้างค่าที่กรอกเอง — หมุดแผนที่ของช่างต้องอยู่', () => {
  const carried = siteAddressCarry({ mapUrl: 'https://maps.app.goo.gl/x', address: '' }, registryAddress);
  assert.equal(carried.mapUrl, 'https://maps.app.goo.gl/x');
  assert.equal(carried.address, registryAddress.address);
  assert.equal(carried.contactName, 'คุณสมชาย');
});

test('⭐ ความต่างนับเฉพาะช่องที่ "ดึงใหม่" เปลี่ยนได้จริง — ไม่งั้นปุ่มกดแล้วนิ่ง', () => {
  const site = { ...registryAddress, mapUrl: 'https://maps.app.goo.gl/x', contactPhone: '' };
  // ทะเบียนไม่มี mapUrl ⇒ ไม่ใช่ความต่าง · เบอร์บนไซต์ว่างแต่ทะเบียนมี ⇒ ใช่
  const drift = siteAddressDrift(site, registryAddress);
  assert.deepEqual(drift.map((d) => d.field), ['contactPhone']);
});

test('ตรงกันหมด หรือไม่รู้ที่มา = ไม่มีความต่างให้เตือน', () => {
  assert.deepEqual(siteAddressDrift({ ...registryAddress, contactPhone: '021234567' }, registryAddress), []);
  assert.deepEqual(siteAddressDrift({ address: 'อะไรก็ได้' }, null), []);
});

// ── ตรวจข้อมูลเครื่อง ────────────────────────────────────────────────────
test('เครื่องต้องมีชื่อ/ตำแหน่ง', () => {
  assert.equal(normalizeAssetInput({}).error, 'ต้องระบุชื่อ/ตำแหน่งเครื่อง');
});

test('⭐ ไม่กรอกอัตราใช้ = null ไม่ใช่ 0 (0 ml/วัน = ไม่มีวันหมด ระบบจะไม่เตือนเลย)', () => {
  const { value } = normalizeAssetInput({ label: 'เครื่องล็อบบี้' });
  assert.equal(value.mlPerDay, null);
  assert.equal(value.bottleMl, null);
  assert.match(normalizeAssetInput({ label: 'x', mlPerDay: 0 }).error, /มากกว่า 0/);
});

test('ถอดก่อนติดตั้งไม่ได้', () => {
  const { error } = normalizeAssetInput({ label: 'x', installedAt: '2026-05-01', removedAt: '2026-04-01' });
  assert.match(error, /ไม่ก่อนวันที่ติดตั้ง/);
});

test('ปีพิมพ์ผิดถูกจับ (prod เคยมี 2202-08-06)', () => {
  assert.match(normalizeAssetInput({ label: 'x', installedAt: '2202-08-06' }).error, /นอกช่วงปี/);
});

// ── ช่วงเวลาที่ไซต์ให้เข้า ───────────────────────────────────────────────
test('ข้อความสรุปช่วงเวลาอ่านรู้เรื่อง', () => {
  assert.equal(accessWindowText(site({ accessFrom: '10:00:00', accessTo: '11:00:00' })), '10:00–11:00');
  assert.equal(accessWindowText(site({ accessDays: [1, 2, 3, 4, 5], accessFrom: '09:00' })), 'จ. อ. พ. พฤ. ศ. · ตั้งแต่ 09:00');
  assert.equal(accessWindowText(site()), '');
});

test('⭐ นัดที่ยังไม่ระบุเวลา ต้องไม่ถูกฟ้องว่าผิด — ไม่รู้เวลา ไม่ใช่ ผิด', () => {
  const s = site({ accessFrom: '10:00', accessTo: '11:00' });
  assert.equal(accessConflict(s, { date: '2026-08-03' }), null);
});

test('เข้าก่อน/ออกหลังเวลาที่ไซต์อนุญาต → เตือน', () => {
  const s = site({ accessFrom: '10:00', accessTo: '11:00' });
  assert.equal(accessConflict(s, { startTime: '09:00', endTime: '10:30' })?.kind, 'time');
  assert.equal(accessConflict(s, { startTime: '10:00', endTime: '12:00' })?.kind, 'time');
  assert.equal(accessConflict(s, { startTime: '10:00', endTime: '11:00' }), null);
});

test('นัดวันที่ไซต์ไม่รับ → เตือนเรื่องวัน', () => {
  const s = site({ accessDays: [1, 2, 3, 4, 5] });          // จ-ศ
  assert.equal(accessConflict(s, { date: '2026-08-08' })?.kind, 'day');  // เสาร์
  assert.equal(accessConflict(s, { date: '2026-08-03' }), null);         // จันทร์
});

test('ไซต์ที่ไม่ตั้งเงื่อนไขอะไรเลย ไม่เตือนอะไรทั้งนั้น', () => {
  assert.equal(accessConflict(site(), { date: '2026-08-08', startTime: '22:00' }), null);
});

// ── น้ำหอมใกล้หมด ────────────────────────────────────────────────────────
test('ประเมินวันน้ำหอมหมดจากขนาดขวด ÷ อัตราใช้', () => {
  const asset = { bottleMl: 300, mlPerDay: 10, installedAt: '2026-07-01' };
  assert.equal(refillDueDate(asset), '2026-07-31');
  assert.equal(refillDueDate(asset, '2026-08-01'), '2026-08-31');
});

test('⭐ ข้อมูลไม่พอ = ไม่เดา — ป้าย "ใกล้หมด" ที่มั่วจะทำให้ป้ายจริงถูกเมินไปด้วย', () => {
  assert.equal(refillDueDate({ bottleMl: 300, installedAt: '2026-07-01' }), null);
  assert.equal(refillDueDate({ mlPerDay: 10, installedAt: '2026-07-01' }), null);
  assert.equal(refillDueDate({ bottleMl: 300, mlPerDay: 10 }), null);
});

test('สรุปเครื่องแยกตามสถานะ', () => {
  const rollup = assetRollup([{ status: 'active' }, { status: 'active' }, { status: 'repair' }, { status: 'removed' }]);
  assert.deepEqual(rollup, { total: 4, active: 2, repair: 1, removed: 1 });
});

// ── สิทธิ์ (แผน §6) ──────────────────────────────────────────────────────
test('⭐ Planner/หัวหน้า TS แก้ธุรกิจบริการได้ · ทีมขาย SV ได้ · ทีมขายอื่นอ่านได้อย่างเดียว', () => {
  const ts = { role: 'ts', department: 'TS' };
  const aeSv = { role: 'ae', team: 'SV' };
  const aeKa = { role: 'ae', team: 'KA' };
  // ช่างหน้างานอ่านได้ แต่แก้ทะเบียน/ตารางไม่ได้ (มติ 2026-08-30) — เขาปิดงานของตัวเอง
  assert.equal(canViewService(ts), true);
  assert.equal(canEditService(ts), false);
  assert.equal(canEditService({ role: 'ts_planner', department: 'TS' }), true);
  assert.equal(canEditService(aeSv), true);
  assert.equal(canEditService(aeKa), false);
  assert.equal(canViewService(aeKa), true);
});

test('⭐ รับงานเข้าไซต์ได้ = ฝ่ายช่าง TS หรือทีมขาย SV — ไม่ใช่ทุกคนที่อ่านระบบได้', () => {
  // 🐞 บั๊กจริงบน prod 2026-07-31: กรองเฉพาะ TS แต่ยังไม่มีบัญชี TS สักคน →
  // dropdown ว่าง → ทุกนัด assigneeId = null → "นัดของฉัน" ว่างตลอดกาล
  assert.equal(canBeServiceAssignee({ role: 'ts', department: 'TS' }), true);
  assert.equal(canBeServiceAssignee({ role: 'ae', team: 'SV' }), true);
  assert.equal(canBeServiceAssignee({ role: 'senior_ae', team: 'SV' }), true);
  assert.equal(canBeServiceAssignee({ role: 'ae', team: 'KA' }), false);
  assert.equal(canBeServiceAssignee({ role: 'admin' }), false);   // แอดมินไม่ได้ออกหน้างาน
  assert.equal(canBeServiceAssignee({ role: 'wh', department: 'WH' }), false);
});

test('⭐ เมนู "นัดของฉัน" กว้างกว่าคนที่รับงานได้หนึ่งขั้น — หัวหน้าเปิดดูได้ ทีมขายอื่นไม่เห็น', () => {
  // มติผู้ใช้ 2026-07-31: เห็นเมนู = คนที่ "แก้งานบริการได้" (canEditService)
  // ⚠️ ต่างจาก canBeServiceAssignee ตรงที่ admin/หัวหน้าฝ่ายขายเห็นด้วย แม้ไม่เคย
  // ถูกมอบหมายนัด — เปิดเข้าไปจะว่าง ซึ่งยอมรับได้เพราะเขาเข้าไปดูของทีม (สลับ "ทั้งทีม")
  assert.equal(canEditService({ role: 'admin' }), true);
  assert.equal(canEditService({ role: 'ae_supervisor' }), true);
  assert.equal(canBeServiceAssignee({ role: 'admin' }), false);
  // ⚠️ ทีมขายที่ไม่ใช่ SV ยังไม่เห็นเมนูนี้ (เช่น senior_ae ทีม KA) — อ่านระบบได้
  // แต่ไม่ใช่คนทำงานบริการ
  assert.equal(canEditService({ role: 'senior_ae', team: 'KA' }), false);
  assert.equal(canViewService({ role: 'senior_ae', team: 'KA' }), true);
});

test('ฝ่ายโรงงานอื่นแตะธุรกิจบริการไม่ได้ — ไม่มี service:* ตั้งแต่ชั้น role', () => {
  for (const [role, department] of [['pc', 'PC'], ['pd', 'PD'], ['wh', 'WH'], ['qc', 'QC']]) {
    assert.equal(canEditService({ role, department }), false, department);
  }
});

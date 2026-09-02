// ทะเบียนไซต์บริการ + เครื่อง (mig 0187) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  accessConflict,
  accessWindowText,
  assetRollup,
  minutesOf,
  normalizeAssetInput,
  normalizeSiteInput,
  isAssetOnSite,
  isWarehouseSite,
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

test('⭐ ทะเบียนว่าง ห้ามล้างค่าที่กรอกเอง — หมุดแผนที่ของเจ้าหน้าที่ต้องอยู่', () => {
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
  assert.deepEqual(rollup, { total: 4, active: 2, inStock: 0, repair: 1, removed: 1, broken: 0 });
});

// ── สิทธิ์ (แผน §6) ──────────────────────────────────────────────────────
test('🔴 โมดูลธุรกิจบริการเป็นของฝ่าย TS เท่านั้น — ทีมขาย SV ก็เข้าไม่ได้', () => {
  const ts = { role: 'ts', department: 'TS' };
  const aeSv = { role: 'ae', team: 'SV' };
  const aeKa = { role: 'ae', team: 'KA' };
  // เจ้าหน้าที่หน้างานอ่านได้ แต่แก้ทะเบียน/ตารางไม่ได้ (มติ 2026-08-30) — เขาปิดงานของตัวเอง
  assert.equal(canViewService(ts), true);
  assert.equal(canEditService(ts), false);
  assert.equal(canEditService({ role: 'ts_planner', department: 'TS' }), true);
  /* มติผู้ใช้ 2026-08-30 — ของเดิมเปิดถึงทีมขาย SV เพราะตอนนั้นฝ่าย TS ยังไม่มีคน
     วันนี้ฝ่ายมีครบห้าตำแหน่งแล้ว เหตุผลนั้นหมดอายุ */
  assert.equal(canEditService(aeSv), false);
  assert.equal(canViewService(aeSv), false);
  assert.equal(canEditService(aeKa), false);
  assert.equal(canViewService(aeKa), false);
  // แอดมินยังเข้าได้ (มติ "admin ทำได้ทุกอย่าง") · หัวหน้าฝ่ายขายไม่ได้
  assert.equal(canEditService({ role: 'admin' }), true);
  assert.equal(canViewService({ role: 'ae_supervisor', department: 'SA' }), false);
});

test('🔴 รับงานเข้าไซต์ได้ = ฝ่ายบริการ TS เท่านั้น', () => {
  /* 🐞 บั๊กจริงบน prod 2026-07-31: กรองเฉพาะ TS แต่ยังไม่มีบัญชี TS สักคน →
     dropdown ว่าง → ทุกนัด assigneeId = null → "งานวันนี้" ว่างตลอดกาล
     ⇒ ตอนนั้นเปิดทีมขาย SV เป็นทางสำรอง · **ปิดแล้ว 2026-08-30** เพราะฝ่ายมีคนจริง
     ครบห้าตำแหน่ง และคนขายไม่ควรถูกมอบหมายให้ขับรถเข้าไซต์ */
  for (const role of ['ts', 'ts_planner', 'ts_senior', 'ts_audit', 'ts_manager']) {
    assert.equal(canBeServiceAssignee({ role, department: 'TS' }), true, role);
  }
  assert.equal(canBeServiceAssignee({ role: 'ae', team: 'SV', teams: ['SV'] }), false);
  assert.equal(canBeServiceAssignee({ role: 'senior_ae', team: 'SV', teams: ['SV'] }), false);
  assert.equal(canBeServiceAssignee({ role: 'ae', team: 'KA' }), false);
  assert.equal(canBeServiceAssignee({ role: 'admin' }), false);   // แอดมินไม่ได้ออกหน้างาน
  assert.equal(canBeServiceAssignee({ role: 'wh', department: 'WH' }), false);
});

test('เมนูงานบริการ = คนที่แก้งานบริการได้ — แอดมินเห็นด้วย แม้ไม่เคยถูกมอบหมายนัด', () => {
  // ⚠️ ต่างจาก canBeServiceAssignee ตรงที่ admin เห็นด้วย แม้ไม่เคยถูกมอบหมาย —
  // เปิดเข้าไปจะว่าง ซึ่งยอมรับได้เพราะเขาเข้าไปดูของทั้งฝ่าย
  assert.equal(canEditService({ role: 'admin' }), true);
  // 🔴 หัวหน้าฝ่ายขายไม่ใช่คนของโมดูลนี้ (มติ 2026-08-30)
  assert.equal(canEditService({ role: 'ae_supervisor', department: 'SA' }), false);
  assert.equal(canBeServiceAssignee({ role: 'admin' }), false);
  // ฝ่ายขายไม่เห็นโมดูลนี้แล้วทั้งอ่านและเขียน — ของที่เขายังต้องใช้คือการเลือก/สร้าง
  // สถานที่จาก **ในใบคำร้อง** ซึ่งไปทาง canPickServiceSite / canCreateServiceSite
  assert.equal(canEditService({ role: 'senior_ae', team: 'KA' }), false);
  assert.equal(canViewService({ role: 'senior_ae', team: 'KA' }), false);
});

test('ฝ่ายโรงงานอื่นแตะธุรกิจบริการไม่ได้ — ไม่มี service:* ตั้งแต่ชั้น role', () => {
  for (const [role, department] of [['pc', 'PC'], ['pd', 'PD'], ['wh', 'WH'], ['qc', 'QC']]) {
    assert.equal(canEditService({ role, department }), false, department);
  }
});

// ── ทะเบียนเครื่อง เฟส A: คลังเป็นไซต์จริง + สองแกน (mig 0332) ────────────

test('isAssetOnSite: เครื่องในคลังกับที่ปลดระวางแล้ว ไม่นับว่าอยู่หน้างาน', () => {
  assert.equal(isAssetOnSite({ status: 'active' }), true);
  assert.equal(isAssetOnSite({ status: 'repair' }), true, 'ส่งซ่อมยังผูกกับไซต์อยู่');
  assert.equal(isAssetOnSite({ status: 'in_stock' }), false);
  assert.equal(isAssetOnSite({ status: 'removed' }), false);
});

/* 🔴 เทสต์ตัวนี้คือด่านที่กันไม่ให้ `in_stock` หายไปเงียบ ๆ ตอนมีคนเพิ่มสถานะใหม่
   ถ้าลืมนับกองใดกองหนึ่ง ผลรวมจะไม่เท่า total แล้วหน้าไซต์จะโชว์เลขที่บวกไม่ลง */
test('assetRollup: ทุกกองรวมกันแล้วต้องเท่า total', () => {
  const rollup = assetRollup([
    { status: 'active', condition: 'ok' },
    { status: 'active', condition: 'broken' },
    { status: 'in_stock', condition: 'ok' },
    { status: 'in_stock', condition: 'broken' },
    { status: 'repair', condition: 'broken' },
    { status: 'removed', condition: 'ok' },
  ]);
  assert.equal(rollup.total, 6);
  assert.equal(rollup.active + rollup.inStock + rollup.repair + rollup.removed, rollup.total);
  assert.equal(rollup.inStock, 2);
  // สภาพเป็นแกนที่สอง — นับข้ามสถานะ ไม่ใช่กองที่ห้าที่แยกออกมา
  assert.equal(rollup.broken, 3);
});

test('normalizeAssetInput: รับสถานะ in_stock และสภาพ broken', () => {
  const { value, error } = normalizeAssetInput({ label: 'เครื่อง A', status: 'in_stock', condition: 'broken' });
  assert.equal(error, null);
  assert.equal(value.status, 'in_stock');
  assert.equal(value.condition, 'broken');
});

test('normalizeAssetInput: สภาพเครื่องนอกทะเบียนถูกตีกลับ', () => {
  const { value, error } = normalizeAssetInput({ label: 'เครื่อง A', condition: 'พัง' });
  assert.equal(value, null);
  assert.match(error, /สภาพเครื่อง/);
});

test('normalizeAssetInput: ไม่ส่งสภาพมา = ปกติ (ตรงกับ DEFAULT ใน DB)', () => {
  const { value } = normalizeAssetInput({ label: 'เครื่อง A' });
  assert.equal(value.condition, 'ok');
});

/* วันรับเข้าคลังต้องเป็นคนละช่องกับวันติดตั้ง — ชีตเก่ามีทั้งสองและต่างกันเป็นปี
   ยัดรวมช่องเดียวเมื่อไร อายุใช้งานที่คำนวณออกมาจะโกหกทันที */
test('normalizeAssetInput: receivedAt แยกจาก installedAt และตรวจรูปแบบวัน', () => {
  const ok = normalizeAssetInput({ label: 'A', receivedAt: '2025-01-08', installedAt: '2026-03-14' });
  assert.equal(ok.error, null);
  assert.equal(ok.value.receivedAt, '2025-01-08');
  assert.equal(ok.value.installedAt, '2026-03-14');

  const bad = normalizeAssetInput({ label: 'A', receivedAt: '08/01/2025' });
  assert.equal(bad.value, null);
  assert.match(bad.error, /วันที่รับเข้าคลัง/);
});

test('normalizeSiteInput: รับ kind ของไซต์ · ตั้งต้นเป็นไซต์ลูกค้า', () => {
  const plain = normalizeSiteInput({ customerId: 'C1', name: 'สาขาเอ' });
  assert.equal(plain.value.kind, 'customer');

  const wh = normalizeSiteInput({ customerId: 'C1', name: 'คลังเครื่อง', kind: 'warehouse' });
  assert.equal(wh.error, null);
  assert.equal(wh.value.kind, 'warehouse');

  const bad = normalizeSiteInput({ customerId: 'C1', name: 'x', kind: 'โกดัง' });
  assert.equal(bad.value, null);
  assert.match(bad.error, /ประเภทไซต์/);
});

/* 🔴 กันไม่ให้ใครกลับไปแยกคลังด้วยเจ้าของ — บริษัทตัวเอง (AR-000) มีไซต์ลูกค้าจริงด้วย
   (Scent and Sense Office ที่มีเครื่องตั้งใช้งานอยู่) แยกด้วย customerId เมื่อไร
   เครื่องที่ออฟฟิศตัวเองจะถูกนับเป็นสต๊อกทันที */
test('isWarehouseSite: ตัดสินจาก kind เท่านั้น ไม่ใช่จากเจ้าของไซต์', () => {
  const own = { customerId: 'CUS-SS', arCode: 'AR-000', kind: 'customer' };
  const warehouse = { customerId: 'CUS-SS', arCode: 'AR-000', kind: 'warehouse' };
  assert.equal(isWarehouseSite(own), false, 'ออฟฟิศตัวเองเป็นไซต์ลูกค้า ไม่ใช่คลัง');
  assert.equal(isWarehouseSite(warehouse), true);
});

test('ป้ายไทยครบทุกค่าที่ CHECK ใน DB ยอมรับ', () => {
  for (const status of ASSET_STATUSES) {
    assert.ok(ASSET_STATUS_LABELS[status], `ขาดป้ายของ ${status}`);
  }
  for (const condition of ASSET_CONDITIONS) {
    assert.ok(ASSET_CONDITION_LABELS[condition], `ขาดป้ายของ ${condition}`);
  }
  assert.equal(ASSET_STATUS_LABELS.removed, 'ปลดระวาง', 'mig 0332 เปลี่ยนความหมายจาก "ถอดออกแล้ว"');
});

/* 🐞 **บั๊กที่ UAT 2026-09-02 จับได้** — ฟอร์มเพิ่มเครื่องตั้ง `status: 'active'`
   ตายตัว ⇒ เพิ่มเครื่องเข้า **ไซต์คลัง** โดน trigger ของ mig 0332 ตีกลับด้วย
   500 + ข้อความภาษาฐานข้อมูล ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
   ⇒ ค่าตั้งต้นต้องเดินตามประเภทไซต์ · เทสต์นี้ตรึงคู่ (ประเภทไซต์ → สถานะตั้งต้น) */
test('🔴 คู่ที่ trigger ยอมรับ: คลังคู่กับ in_stock · ไซต์ลูกค้าคู่กับ active', () => {
  assert.equal(isWarehouseSite({ kind: 'warehouse' }), true);
  assert.equal(isWarehouseSite({ kind: 'customer' }), false);

  // สถานะตั้งต้นที่ฟอร์มควรเลือกให้ — ตรงกับที่ trigger ยอมรับ
  const defaultStatus = (site) => (isWarehouseSite(site) ? 'in_stock' : 'active');
  assert.equal(defaultStatus({ kind: 'warehouse' }), 'in_stock');
  assert.equal(defaultStatus({ kind: 'customer' }), 'active');
  assert.equal(defaultStatus(null), 'active', 'ไม่รู้ไซต์ = ไซต์ลูกค้า (เส้นทางเดิม)');

  for (const s of ['in_stock', 'active']) assert.ok(ASSET_STATUSES.includes(s));
});

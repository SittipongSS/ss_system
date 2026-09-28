// ── ด่านของช่อง "จำนวนรอบบริการ" บนใบสั่งขาย (mig 0326) ──────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeServiceRounds,
  serviceRoundLines,
  serviceRoundsEditError,
  validateServiceRoundsPatch,
} from './serviceRoundsEntry.js';

const svc = (over = {}) => ({ id: 'L1', fgCode: 'FG-374-02-001-1418', description: 'แพ็คเกจ', ...over });
const other = (over = {}) => ({ id: 'L2', fgCode: 'FG-374-01-002-1418', description: 'น้ำหอม', ...over });

test('รับเฉพาะจำนวนเต็มบวก — ที่เหลือคือ "ยังไม่ระบุ" ไม่ใช่ error', () => {
  assert.equal(normalizeServiceRounds(12), 12);
  assert.equal(normalizeServiceRounds('12'), 12);
  assert.equal(normalizeServiceRounds(''), null);      // ลบตัวเลขทิ้ง = ยังไม่ระบุ
  assert.equal(normalizeServiceRounds(null), null);
  assert.equal(normalizeServiceRounds(undefined), null);
  // CHECK ของฐานห้าม <= 0 อยู่แล้ว — ปล่อยผ่านจะกลายเป็น 500 ดิบแทนช่องว่างที่แก้เองได้
  assert.equal(normalizeServiceRounds(0), null);
  assert.equal(normalizeServiceRounds(-3), null);
  assert.equal(normalizeServiceRounds(1.5), null);
  assert.equal(normalizeServiceRounds('สิบสอง'), null);
});

test('เลือกเฉพาะบรรทัดหมวดบริการมาให้กรอก', () => {
  assert.deepEqual(serviceRoundLines([svc(), other()]).map((l) => l.id), ['L1']);
  assert.deepEqual(serviceRoundLines([]), []);
  assert.deepEqual(serviceRoundLines(null), []);
});

test('ใบที่อนุมัติแล้วยังแก้จำนวนรอบได้ (มติผู้ใช้ — ไม่ต้องออก Rev.)', () => {
  assert.equal(serviceRoundsEditError({ status: 'approved' }, { canEdit: true }), null);
  assert.equal(serviceRoundsEditError({ status: 'draft' }, { canEdit: true }), null);
});

/* 🔄 mig 0391: trigger ของฐานล็อกการแก้รอบระหว่างรออนุมัติ/ย้อนการอนุมัติแล้วทุกใบ (ก่อนนี้แก้ได้) —
   ด่าน JS ต้องพูดเรื่องเดียวกัน ไม่งั้นกดแล้วเจอ error ดิบจาก trigger */
test('รออนุมัติ / ย้อนการอนุมัติแล้ว = ล็อกทุกใบ (trigger ของ 0391 บังคับ)', () => {
  assert.equal(serviceRoundsEditError({ status: 'pending_approval' }, { canEdit: true }), 'รออนุมัติ — ดึงกลับก่อนแก้จำนวนรอบ');
  assert.equal(serviceRoundsEditError({ status: 'approval_revoked' }, { canEdit: true }), 'ย้อนการอนุมัติแล้ว — แก้จำนวนรอบที่ใบ Rev.');
});

test('ใบที่ตายแล้วและคนที่ไม่มีสิทธิ์ = ถูกปฏิเสธพร้อมเหตุผล', () => {
  for (const status of ['cancelled', 'revised']) {
    const why = serviceRoundsEditError({ status }, { canEdit: true });
    assert.match(why || '', /ปิดไปแล้ว/);
  }
  assert.match(serviceRoundsEditError({ status: 'approved' }, { canEdit: false }) || '', /ฝ่ายขาย/);
  assert.match(serviceRoundsEditError(null, { canEdit: true }) || '', /ไม่พบ/);
});

/* ⭐ ใบสั่งขายย้อนหลังที่ยังไม่อนุมัติ (มติ 22/09 · mig 0374) — จำนวนรอบอยู่ในบรรทัดโซนที่ฟอร์มคีย์ใบเขียนใหม่
   ทั้งชุดทุกครั้งที่บันทึก และ AE Sup กำลังตรวจตัวเลขชุดนั้น ⇒ แก้ตรงนี้ = ถูกทับ/เปลี่ยนของที่ผู้อนุมัติเห็น */
test('ใบย้อนหลังที่ยังไม่อนุมัติ: จำนวนรอบแก้ที่ฟอร์มคีย์ใบ · อนุมัติแล้วแก้ได้ตามเดิม', () => {
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    assert.match(serviceRoundsEditError({ status, origin: 'historical' }, { canEdit: true }) || '', /ฟอร์มคีย์ใบ/, status);
  }
  assert.equal(serviceRoundsEditError({ status: 'approved', origin: 'historical' }, { canEdit: true }), null);
  assert.match(serviceRoundsEditError({ status: 'cancelled', origin: 'historical' }, { canEdit: true }) || '', /ปิดไปแล้ว/);
  // ใบ pipeline ร่าง/รออนุมัติยังแก้ได้เหมือนเดิม
  assert.equal(serviceRoundsEditError({ status: 'draft', origin: 'pipeline' }, { canEdit: true }), null);
});

test('ก้อนที่จอส่งมาต้องเป็นบรรทัดของใบนี้และเป็นหมวดบริการจริง', () => {
  const lines = [svc(), other()];
  // ⚠️ จอส่ง id อะไรมาก็ได้ — ปล่อยผ่าน = เขียนทับบรรทัดของใบอื่น
  assert.match(validateServiceRoundsPatch({ 'L9': 12 }, lines).error || '', /ไม่ได้อยู่ในใบนี้/);
  // บรรทัดขายขวดน้ำหอมไม่มีรอบบริการ
  assert.match(validateServiceRoundsPatch({ L2: 12 }, lines).error || '', /02-001/);
  assert.match(validateServiceRoundsPatch({}, lines).error || '', /ไม่มีข้อมูล/);
  assert.match(validateServiceRoundsPatch(null, lines).error || '', /ไม่มีข้อมูล/);

  const okPatch = validateServiceRoundsPatch({ L1: '12' }, lines);
  assert.equal(okPatch.error, null);
  assert.equal(okPatch.value.get('L1'), 12);
  // ลบตัวเลขทิ้งต้องบันทึกได้ (กลับไป "ยังไม่ระบุ") ไม่ใช่ถูกปฏิเสธ
  assert.equal(validateServiceRoundsPatch({ L1: '' }, lines).value.get('L1'), null);
});

/* ══ mig 0391 (PR-A): ใบสาย SERVICE ตั้งรอบที่ตารางรายการ · ใบที่ประทับแล้วแก้รอบได้ (≥ 1) ══════════════════ */
const SERVICE_DEAL = { id: 'DL1', line: 'SERVICE' };
const STAMP = '2026-10-01T03:00:00Z';
const svcOrder = (over = {}) => ({ id: 'SO1', origin: 'pipeline', status: 'draft', dealId: 'DL1', deal: SERVICE_DEAL, serviceTermsOpenedAt: null, serviceSetupState: null, supersededById: null, ...over });
const manualPkg = (over = {}) => ({ id: 'L3', fgCode: null, productId: null, description: 'ระบบกระจายกลิ่น', serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-374-02-001-1418', serviceRounds: 12, ...over });

test('ใบสาย SERVICE: บอกทางไปตารางรายการตามขั้นของใบ', () => {
  const can = { canEdit: true };
  const lines = [manualPkg()];
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'draft', lines }), can), 'แก้จำนวนรอบที่ตารางรายการ แล้วกด ‘บันทึกงานบริการ’');
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'rejected', lines }), can), 'แก้จำนวนรอบที่ตารางรายการ แล้วกด ‘บันทึกงานบริการ’');
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'pending_approval', lines }), can), 'รออนุมัติ — ดึงกลับก่อนแก้จำนวนรอบ');
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approval_revoked', lines }), can), 'ย้อนการอนุมัติแล้ว — แก้จำนวนรอบที่ใบ Rev.');
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approved', lines }), can),
    'ใบนี้ยังไม่ได้ตั้งงานบริการ — ตั้งจำนวนรอบที่ตารางรายการ แล้วกด ‘บันทึกงานบริการ’');
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approved', serviceSetupState: 'submitted', lines }), can),
    'ยื่นตรวจงานบริการแล้ว — แก้ไม่ได้จนกว่าผู้จัดการจะตีกลับ');
  // ประทับแล้ว = แก้รอบได้ตามมติเดิม (ไม่ต้องออก Rev.)
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approved', serviceTermsOpenedAt: STAMP, lines }), can), null);
  assert.match(serviceRoundsEditError(svcOrder({ status: 'cancelled', lines }), can) || '', /ปิดไปแล้ว/);
  // ใบสายสินค้า/ใบย้อนหลังที่อนุมัติแล้ว: เหมือนเดิม
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approved', deal: { id: 'DL2', line: 'PRODUCT' }, lines }), can), null);
  assert.equal(serviceRoundsEditError(svcOrder({ status: 'approved', origin: 'historical', lines }), can), null);
});

test('บรรทัดที่กรอกรอบได้: ใบประทับแล้วถามชนิดของบรรทัด (แพ็คเกจพิมพ์เองนับ) · ยังไม่ประทับถามรหัส FG เหมือนเดิม', () => {
  const lines = [svc(), other(), manualPkg(), manualPkg({ id: 'L4', serviceKind: 'not_service', serviceProductId: null, serviceFgCode: null })];
  assert.deepEqual(serviceRoundLines(lines).map((l) => l.id), ['L1']);
  assert.deepEqual(serviceRoundLines(lines, svcOrder({ status: 'approved' })).map((l) => l.id), ['L1']);
  assert.deepEqual(serviceRoundLines(lines, svcOrder({ status: 'approved', serviceTermsOpenedAt: STAMP })).map((l) => l.id), ['L1', 'L3']);
});

test('ใบที่ประทับแล้ว: บรรทัดแพ็คเกจต้องมีอย่างน้อย 1 รอบ (trigger ของ 0391 ห้ามล้าง)', () => {
  const stamped = svcOrder({ status: 'approved', serviceTermsOpenedAt: STAMP });
  const lines = [svc(), manualPkg()];
  assert.equal(validateServiceRoundsPatch({ L3: '' }, lines, stamped).error, 'แพ็คเกจต้องมีอย่างน้อย 1 รอบ');
  assert.equal(validateServiceRoundsPatch({ L1: null }, lines, stamped).error, 'แพ็คเกจต้องมีอย่างน้อย 1 รอบ');
  assert.equal(validateServiceRoundsPatch({ L3: 10 }, lines, stamped).value.get('L3'), 10);
  // ยังไม่ประทับ: บรรทัดพิมพ์เองไม่ใช่ที่ของช่องนี้ · ลบเลขทิ้งได้เหมือนเดิม
  assert.match(validateServiceRoundsPatch({ L3: 10 }, lines, svcOrder({ status: 'approved' })).error || '', /02-001/);
  assert.equal(validateServiceRoundsPatch({ L1: '' }, lines, svcOrder({ status: 'approved' })).value.get('L1'), null);
});

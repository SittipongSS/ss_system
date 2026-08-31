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
  assert.equal(serviceRoundsEditError({ status: 'pending_approval' }, { canEdit: true }), null);
});

test('ใบที่ตายแล้วและคนที่ไม่มีสิทธิ์ = ถูกปฏิเสธพร้อมเหตุผล', () => {
  for (const status of ['cancelled', 'revised']) {
    const why = serviceRoundsEditError({ status }, { canEdit: true });
    assert.match(why || '', /ปิดไปแล้ว/);
  }
  assert.match(serviceRoundsEditError({ status: 'approved' }, { canEdit: false }) || '', /ฝ่ายขาย/);
  assert.match(serviceRoundsEditError(null, { canEdit: true }) || '', /ไม่พบ/);
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

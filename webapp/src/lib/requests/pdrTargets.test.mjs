// ── PDR 2.2/2.3 · ต้นทุน/ราคาขายรายสินค้า (mig 0229) ─────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PDR_TARGETS, emptyPdrTarget, normalizePdrTargets, pdrTargetFilled,
  pdrTargetValuesFrom, pdrTargetsProgress,
} from './pdrTargets.js';

test('แถวปกติ — สวิตช์เปิดแล้วเก็บรายละเอียดกับราคา · ลูกน้ำหลักพันรับได้', () => {
  const { targets, error } = normalizePdrTargets([
    {
      categoryCode: '02-010', fOn: true, fNote: 'เข้มข้น 20%', fPricePerKg: '1,200.50',
      fbOn: false, pricePerUnit: '590',
    },
  ]);
  assert.equal(error, null);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0], {
    sortOrder: 1, categoryCode: '02-010',
    fOn: true, fNote: 'เข้มข้น 20%', fPricePerKg: 1200.5,
    fbOn: false, fbNote: null, fbPricePerKg: null,
    pricePerUnit: 590,
  });
});

test('⭐ ซ้ำหมวดได้ — สินค้าหมวดเดียวกันคนละสเปกคนละต้นทุน (มติผู้ใช้)', () => {
  const { targets, error } = normalizePdrTargets([
    { categoryCode: '02-010', fOn: true, fPricePerKg: '1200' },
    { categoryCode: '02-010', fOn: true, fPricePerKg: '1400' },
  ]);
  assert.equal(error, null);
  assert.deepEqual(targets.map((t) => t.fPricePerKg), [1200, 1400]);
  assert.deepEqual(targets.map((t) => t.sortOrder), [1, 2]);
});

test('⚠️ ปิดสวิตช์แล้วค่าที่เคยกรอกต้องถูกล้าง ไม่ค้างไปโผล่บนกระดาษ', () => {
  const { targets } = normalizePdrTargets([
    { categoryCode: '02-010', fOn: false, fNote: 'ของเก่าที่ค้างอยู่', fPricePerKg: '999' },
  ]);
  assert.equal(targets[0].fNote, null);
  assert.equal(targets[0].fPricePerKg, null);
});

test('หมวดต้องอยู่ในข้อ 1.11 — เอาหมวดออกจาก 1.11 แล้วแถวที่ค้างต้องถูกทัก', () => {
  const rows = [{ categoryCode: '02-999', fOn: true, fPricePerKg: '10' }];
  assert.match(normalizePdrTargets(rows, { categoryCodes: ['02-010'] }).error, /ข้อ 1\.11/);
  // ไม่ส่งรายการหมวดมา = ไม่ตรวจ (ใบเก่าที่ 1.11 ยังว่าง)
  assert.equal(normalizePdrTargets(rows).error, null);
  assert.equal(normalizePdrTargets(rows, { categoryCodes: ['02-999'] }).error, null);
});

test('ตัวเลขอ่านไม่ออก/ติดลบ ต้องบอกว่าแถวไหนช่องไหน', () => {
  const kg = normalizePdrTargets([{ categoryCode: 'a', fOn: true, fPricePerKg: '1,200.-' }]).error;
  assert.match(kg, /รายการที่ 1/);
  assert.match(kg, /บาท\/Kg/);
  assert.match(kg, /1,200\.-/);

  const unit = normalizePdrTargets([{ categoryCode: 'a', pricePerUnit: '-5' }]).error;
  assert.match(unit, /บาท\/ชิ้น/);
  assert.match(unit, /ไม่ติดลบ/);

  const fb = normalizePdrTargets([{ categoryCode: 'a', fbOn: true, fbPricePerKg: 'สามพัน' }]).error;
  assert.match(fb, /เนื้อสาร \(FB\)/);
});

test('ด่านอื่น: ไม่เลือกหมวด · รายละเอียดยาวเกิน · เกินจำนวนแถว', () => {
  assert.match(normalizePdrTargets([{ categoryCode: '  ' }]).error, /ยังไม่ได้เลือกประเภทสินค้า/);
  assert.match(
    normalizePdrTargets([{ categoryCode: 'a', fOn: true, fNote: 'ก'.repeat(501) }]).error,
    /ยาวเกิน 500/,
  );
  const many = Array.from({ length: MAX_PDR_TARGETS + 1 }, () => ({ categoryCode: 'a' }));
  assert.match(normalizePdrTargets(many).error, new RegExp(`สูงสุด ${MAX_PDR_TARGETS}`));
});

test('ใบที่ยังไม่กรอกอะไรเลยต้องบันทึกได้ — ไม่มีแถวไหนบังคับ', () => {
  assert.deepEqual(normalizePdrTargets([]), { targets: [], error: null });
  assert.deepEqual(normalizePdrTargets(null), { targets: [], error: null });
  assert.equal(normalizePdrTargets([{ categoryCode: '02-010' }]).error, null);
});

// 🐞 เจอตอนกดบันทึกจริง: route ประกอบแถวเป็น `{ id: DPT-…, requestId, ...t }` ⇒ ถ้า
// ตัวแปลงคืน `id` ติดมาด้วย มันจะทับ id ที่เพิ่งสร้าง (เป็น null) แล้ว insert ตกที่
// PRIMARY KEY ⇒ ทั้งใบพังเป็น 500 โดยหน้าจอบอกแค่ "บันทึกไม่สำเร็จ"
test('⭐ ผลลัพธ์ต้องไม่มีคีย์ `id` ติดมา — id เป็นของฝั่งที่เขียนลง DB เท่านั้น', () => {
  const { targets } = normalizePdrTargets([
    { id: 'DPT-เก่า', categoryCode: '02-010', fOn: true, fPricePerKg: '10' },
    { categoryCode: '02-010' },
  ]);
  for (const row of targets) {
    assert.equal(Object.hasOwn(row, 'id'), false, `แถวยังมีคีย์ id: ${JSON.stringify(row)}`);
  }
});

test('ทางกลับ: แถวจาก DB → ค่าฟอร์ม เป็นสตริงทุกช่องยกเว้นสวิตช์', () => {
  const values = pdrTargetValuesFrom({
    id: 'DPT-1', categoryCode: '02-010', fOn: true, fNote: null, fPricePerKg: 1200.5,
    fbOn: false, fbNote: null, fbPricePerKg: null, pricePerUnit: 590,
  });
  assert.deepEqual(values, {
    id: 'DPT-1', categoryCode: '02-010',
    fOn: true, fNote: '', fPricePerKg: '1200.5',
    fbOn: false, fbNote: '', fbPricePerKg: '',
    pricePerUnit: '590',
  });
  // แถวเปล่าของฟอร์มต้องผ่านด่านได้ทันทีหลังกดปุ่มเพิ่ม
  assert.equal(normalizePdrTargets([emptyPdrTarget('02-010')]).error, null);
});

test('เกจนับเฉพาะแถวที่กรอกจริง — กดเพิ่มเฉย ๆ ยังไม่นับ', () => {
  assert.equal(pdrTargetFilled(emptyPdrTarget('02-010')), false);
  assert.equal(pdrTargetFilled({ categoryCode: 'a', fOn: true }), true);
  assert.equal(pdrTargetFilled({ categoryCode: 'a', pricePerUnit: '590' }), true);
  assert.deepEqual(
    pdrTargetsProgress([emptyPdrTarget('a'), { categoryCode: 'b', fbOn: true }]),
    { total: 2, filled: 1 },
  );
});

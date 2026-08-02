import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_LINES,
  BUSINESS_LINE_LABELS,
  UNSET_BUSINESS_LINE_LABEL,
  businessLineLabel,
  isBusinessLine,
  normalizeBusinessLine,
  countUnsetBusinessLine,
  summarizeBusinessLines,
} from './businessLines.js';

test('ชุดค่ามีสองสายและมีป้ายครบทุกตัว', () => {
  assert.deepEqual(BUSINESS_LINES, ['PRODUCT', 'SERVICE']);
  for (const line of BUSINESS_LINES) {
    assert.ok(BUSINESS_LINE_LABELS[line], `ขาดป้ายของ ${line}`);
  }
});

// ⚠️ `ODM` ชนกับชื่อทีมใน TEAMS — มติ #868 เลือก PRODUCT แทน ห้ามเผลอเติมกลับ
test('ไม่มีค่า ODM ในชุดสายธุรกิจ', () => {
  assert.equal(isBusinessLine('ODM'), false);
});

test('ค่าที่ยังไม่ระบุได้ป้ายของตัวเอง ไม่ใช่สตริงว่าง', () => {
  assert.equal(businessLineLabel(null), UNSET_BUSINESS_LINE_LABEL);
  assert.equal(businessLineLabel(undefined), UNSET_BUSINESS_LINE_LABEL);
  assert.equal(businessLineLabel(''), UNSET_BUSINESS_LINE_LABEL);
  assert.equal(businessLineLabel('PRODUCT'), 'สินค้า (Products)');
  assert.equal(businessLineLabel('SERVICE'), 'บริการ (Services)');
});

// ⚠️ มติผู้ใช้ 2026-08-02: ป้ายสั้น ไม่ต้องอธิบายในตัวเลือก
// เดิมเป็น "สายสินค้า (ส่งมอบของแล้วจบ)" ซึ่งฟุ่มเฟือยบน dropdown ที่มีสองค่า
test('ป้ายไม่พ่วงคำอธิบายยาว ๆ', () => {
  for (const label of Object.values(BUSINESS_LINE_LABELS)) {
    assert.ok(label.length <= 20, `ป้าย "${label}" ยาวเกินไปสำหรับตัวเลือก`);
  }
});

// สตริงว่างจากฟอร์มต้องกลายเป็น null — CHECK ของ mig 0191 ปฏิเสธ ''
test('normalize: ว่าง → null · ค่าจริง → ค่าจริง · ค่าผิด → undefined', () => {
  assert.equal(normalizeBusinessLine(''), null);
  assert.equal(normalizeBusinessLine(null), null);
  assert.equal(normalizeBusinessLine(undefined), null);
  assert.equal(normalizeBusinessLine('SERVICE'), 'SERVICE');
  assert.equal(normalizeBusinessLine(' service '), 'SERVICE');
  assert.equal(normalizeBusinessLine('ODM'), undefined);
  assert.equal(normalizeBusinessLine('อะไรก็ไม่รู้'), undefined);
});

// ⭐ ตัวนับนี้คือสิ่งที่แทนการใส่ default — ถ้ามันพัง โครงการที่ยังไม่ระบุจะหายเงียบ
test('นับโครงการที่ยังไม่ระบุสาย รวมค่าที่สะกดผิดด้วย', () => {
  const rows = [
    { id: '1', line: 'PRODUCT' },
    { id: '2', line: 'SERVICE' },
    { id: '3', line: null },
    { id: '4' },
    { id: '5', line: '' },
    { id: '6', line: 'ODM' }, // ค่าที่ไม่รู้จัก = ยังไม่ระบุ ไม่ใช่ผ่าน
  ];
  assert.equal(countUnsetBusinessLine(rows), 4);
  assert.deepEqual(summarizeBusinessLines(rows), { PRODUCT: 1, SERVICE: 1, unset: 4 });
});

test('ลิสต์ว่างไม่ระเบิด', () => {
  assert.equal(countUnsetBusinessLine(), 0);
  assert.deepEqual(summarizeBusinessLines(), { PRODUCT: 0, SERVICE: 0, unset: 0 });
});

// แม่แบบต้นทุนต่อประเภทสินค้า (mig 0140) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_LINE_KINDS,
  isValidCategoryCode,
  normalizeCostTemplateLines,
  sourceDeptForKind,
  summarizeCostTemplate,
  unitBasisForKind,
} from './costTemplate.js';

test('หน่วยและฝ่ายที่ต้องตอบราคา ผูกกับชนิดบรรทัดเสมอ', () => {
  assert.equal(unitBasisForKind('RM_F'), 'per_kg');
  assert.equal(unitBasisForKind('RM_FB'), 'per_kg');
  assert.equal(unitBasisForKind('PM'), 'per_piece');
  assert.equal(unitBasisForKind('labor'), 'per_piece');

  assert.equal(sourceDeptForKind('RM_F'), 'RD');
  assert.equal(sourceDeptForKind('RM_FB'), 'RD');
  assert.equal(sourceDeptForKind('PM'), 'PC');
  // ค่าดำเนินการคิดภายใน ไม่ต้องส่งใครตอบ
  assert.equal(sourceDeptForKind('labor'), null);
});

test('รหัสหมวดต้องเป็นรูป MM-TTT เท่านั้น', () => {
  assert.equal(isValidCategoryCode('01-006'), true);
  for (const bad of ['1-006', '01-06', '01006', '', null, 'AB-CDE', '01-0066']) {
    assert.equal(isValidCategoryCode(bad), false, String(bad));
  }
});

test('normalize: จัดลำดับใหม่ ตัดช่องว่าง และเติมหน่วยตามชนิด', () => {
  const { lines, error } = normalizeCostTemplateLines([
    { kind: 'RM_F', label: '  หัวน้ำหอม   A ', defaultGramsPerUnit: '20' },
    { kind: 'PM', label: 'ขวดแก้ว', required: false },
  ]);
  assert.equal(error, null);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    sortOrder: 1, kind: 'RM_F', label: 'หัวน้ำหอม A',
    unitBasis: 'per_kg', defaultGramsPerUnit: 20, required: true,
  });
  // per_piece ไม่มีกรัม/ชิ้น และ required: false ถูกเก็บตามจริง
  assert.deepEqual(lines[1], {
    sortOrder: 2, kind: 'PM', label: 'ขวดแก้ว',
    unitBasis: 'per_piece', defaultGramsPerUnit: null, required: false,
  });
});

test('normalize: กรัม/ชิ้นของบรรทัดต่อชิ้นถูกทิ้งเสมอ (ส่งมาก็ไม่เก็บ)', () => {
  const { lines, error } = normalizeCostTemplateLines([
    { kind: 'labor', label: 'ค่าบรรจุ', defaultGramsPerUnit: '99' },
  ]);
  assert.equal(error, null);
  assert.equal(lines[0].defaultGramsPerUnit, null);
});

test('normalize: ปฏิเสธแม่แบบว่าง ชนิดผิด ชื่อว่าง และชื่อซ้ำ', () => {
  assert.match(normalizeCostTemplateLines([]).error, /อย่างน้อย 1 บรรทัด/);
  assert.match(normalizeCostTemplateLines(null).error, /อย่างน้อย 1 บรรทัด/);
  assert.match(
    normalizeCostTemplateLines([{ kind: 'RM', label: 'x' }]).error,
    /ชนิดบรรทัดไม่ถูกต้อง/,
  );
  assert.match(
    normalizeCostTemplateLines([{ kind: 'PM', label: '   ' }]).error,
    /ต้องระบุชื่อรายการ/,
  );
  // ชื่อซ้ำในชนิดเดียวกัน = คนกรอกราคาแยกไม่ออกว่าบรรทัดไหนคือบรรทัดไหน
  assert.match(
    normalizeCostTemplateLines([
      { kind: 'PM', label: 'ขวด' },
      { kind: 'PM', label: 'ขวด ' },
    ]).error,
    /ชื่อรายการซ้ำ/,
  );
  // ชื่อเดียวกันแต่คนละชนิด ไม่ถือว่าซ้ำ
  assert.equal(
    normalizeCostTemplateLines([
      { kind: 'PM', label: 'ฟิล์ม' },
      { kind: 'labor', label: 'ฟิล์ม' },
    ]).error,
    null,
  );
});

test('normalize: บรรทัด per_kg ต้องมีกรัม/ชิ้นที่เป็นบวก', () => {
  for (const bad of ['0', '-5', 'abc']) {
    assert.match(
      normalizeCostTemplateLines([{ kind: 'RM_FB', label: 'เนื้อสาร', defaultGramsPerUnit: bad }]).error,
      /กรัมต่อชิ้น/,
      bad,
    );
  }
  // ว่าง = ยังไม่ระบุ (อนุญาต — ไปเติมตอนกางใบขอราคาได้)
  assert.equal(
    normalizeCostTemplateLines([{ kind: 'RM_FB', label: 'เนื้อสาร', defaultGramsPerUnit: '' }]).error,
    null,
  );
});

test('normalize: จำกัดจำนวนบรรทัดกันแม่แบบบวม', () => {
  const many = Array.from({ length: 61 }, (_, i) => ({ kind: 'PM', label: `รายการ ${i}` }));
  assert.match(normalizeCostTemplateLines(many).error, /มากเกินไป/);
});

test('summarize: นับบรรทัดแยกตามฝ่ายที่ต้องขอราคา', () => {
  const summary = summarizeCostTemplate([
    { kind: 'RM_F' }, { kind: 'RM_FB' },
    { kind: 'PM' }, { kind: 'PM' }, { kind: 'PM' },
    { kind: 'labor' },
  ]);
  assert.deepEqual(summary, { total: 6, rd: 2, pc: 3, internal: 1 });
  assert.deepEqual(summarizeCostTemplate([]), { total: 0, rd: 0, pc: 0, internal: 0 });
});

test('ทุกชนิดที่ประกาศไว้ มีหน่วยและฝ่ายที่กำหนดชัดเจน', () => {
  for (const kind of COST_LINE_KINDS) {
    assert.ok(['per_kg', 'per_piece'].includes(unitBasisForKind(kind)), kind);
    const dept = sourceDeptForKind(kind);
    assert.ok(dept === null || ['RD', 'PC'].includes(dept), kind);
  }
});

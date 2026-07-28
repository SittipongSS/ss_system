// ทะเบียนสูตร (mig 0171) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptFormulaError,
  archiveFormulaError,
  canEditFormula,
  canProposeFormula,
  canViewFormulas,
  deleteFormulaError,
  findFormulaByCode,
  isFormulaRegistrar,
  isFormulaUsable,
  normalizeFormulaInput,
  unsortedFormulaRows,
} from './formulas.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };
const viewer = { id: 'u-viewer', role: 'viewer' };

const formula = (over = {}) => ({
  id: 'FML-1', code: 'PF638010202-P1', name: 'Well sleep #2',
  status: 'active', createdById: 'u-sale', ...over,
});

// ── ตัวตน ────────────────────────────────────────────────────────────────
test('ตัวตนสูตร = รหัส (ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย)', () => {
  const rows = [formula()];
  assert.equal(findFormulaByCode(rows, ' pf638010202-p1 ')?.id, 'FML-1');
  assert.equal(findFormulaByCode(rows, 'อื่น'), null);
});

test('ร่างที่ยังไม่มีรหัสไม่มีตัวตนให้เทียบ (index เป็น partial)', () => {
  assert.equal(findFormulaByCode([formula({ code: null })], ''), null);
});

// ── ตรวจข้อมูลเข้า ───────────────────────────────────────────────────────
test('ชื่อสูตรบังคับ รหัสไม่บังคับ (ร่างจาก prod มี 10 แถวที่ไม่มีรหัส)', () => {
  assert.match(normalizeFormulaInput({}).error, /ชื่อสูตร/);
  const { value, error } = normalizeFormulaInput({ name: 'Well sleep #2' });
  assert.equal(error, null);
  assert.equal(value.code, null);
});

test('ดักปีพิมพ์ผิดแบบที่เจอจริงบน prod (2202-08-06)', () => {
  assert.match(normalizeFormulaInput({ name: 'A', formulaDate: '2202-08-06' }).error, /ปี/);
  assert.equal(normalizeFormulaInput({ name: 'A', formulaDate: '2025-08-06' }).error, null);
});

test('รูปแบบวันที่ต้องเป็น ISO', () => {
  assert.match(normalizeFormulaInput({ name: 'A', formulaDate: '06/08/2025' }).error, /ไม่ถูกต้อง/);
});

test('สูตรมีลูกค้าได้หรือเป็นสูตรกลางก็ได้ (ต่างจากกลิ่นที่บังคับ)', () => {
  assert.equal(normalizeFormulaInput({ name: 'A' }).value.customerId, null);
  assert.equal(normalizeFormulaInput({ name: 'A', customerId: 'CUS-1' }).value.customerId, 'CUS-1');
});

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
test('RD เป็นเจ้าของทะเบียน ฝ่ายขายเสนอร่างได้ viewer อ่านอย่างเดียว', () => {
  assert.equal(isFormulaRegistrar(rd), true);
  assert.equal(isFormulaRegistrar(sale), false);
  assert.equal(canProposeFormula(sale), true);
  assert.equal(canViewFormulas(viewer), true);
  assert.equal(canProposeFormula(viewer), false);
});

test('ฝ่ายขายแก้ได้เฉพาะร่างของตัวเอง', () => {
  assert.equal(canEditFormula(sale, formula({ status: 'draft', createdById: 'u-sale' })), true);
  assert.equal(canEditFormula(sale, formula({ status: 'draft', createdById: 'u-x' })), false);
  assert.equal(canEditFormula(sale, formula({ status: 'active' })), false);
  assert.equal(canEditFormula(rd, formula({ status: 'active' })), true);
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('รับเข้าทะเบียนต้องมีรหัส', () => {
  assert.match(acceptFormulaError(formula({ status: 'draft', code: null }), { code: '' }), /รหัส/);
  assert.equal(acceptFormulaError(formula({ status: 'draft' }), { code: 'PF-1' }), null);
  assert.match(acceptFormulaError(formula({ status: 'active' }), { code: 'PF-1' }), /ไปแล้ว/);
});

test('ลบร่างที่มีสินค้าอ้างอยู่ไม่ได้', () => {
  assert.equal(deleteFormulaError(formula({ status: 'draft' })), null);
  assert.match(deleteFormulaError(formula({ status: 'draft' }), { productCount: 2 }), /2 รายการ/);
  assert.match(deleteFormulaError(formula({ status: 'active' })), /เฉพาะร่าง/);
});

test('ร่างเลิกใช้ไม่ได้ ต้องลบทิ้ง', () => {
  assert.match(archiveFormulaError(formula({ status: 'draft' })), /ลบทิ้ง/);
  assert.equal(archiveFormulaError(formula({ status: 'active' })), null);
});

test('ร่างยังอ้างในคำร้องขอราคา FB ไม่ได้', () => {
  assert.equal(isFormulaUsable(formula({ status: 'draft' })), false);
  assert.equal(isFormulaUsable(formula({ status: 'active' })), true);
});

// ── "รอจัดระเบียบ" ───────────────────────────────────────────────────────
test('เก็บเฉพาะสินค้าที่มีชื่อสูตรแต่ยังไม่ผูกทะเบียนทั้งกลิ่นและสูตร', () => {
  const rows = unsortedFormulaRows([
    { id: 'p1', formulaName: 'Walk on beach 01', formulaDate: '2025-08-06', productDescription: 'FG-1' },
    { id: 'p2', formulaName: 'Well sleep #2', formulaId: 'FML-1' },   // ผูกแล้ว
    { id: 'p3', formulaName: 'Loyal love', scentId: 'SCT-1' },        // จัดเป็นกลิ่นแล้ว
    { id: 'p4', formulaName: '   ' },                                  // ว่างเปล่า
    { id: 'p5' },
  ]);
  assert.deepEqual(rows.map((r) => r.productId), ['p1']);
  assert.equal(rows[0].formulaName, 'Walk on beach 01');
  assert.equal(rows[0].productName, 'FG-1');
});

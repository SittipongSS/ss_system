// ทะเบียนสูตร (mig 0171) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptFormulaError, archiveFormulaError, canEditFormula, canProposeFormula, canViewFormulas, deleteFormulaError, derivedFromFormulaError, findFormulaByCode, findFormulaByIdentity, formulaIdentityKey, formulaScentCustomerError, formulaTransitionError, isFormulaRegistrar, isFormulaUsable, normalizeFormulaInput, sanitizeInheritedFormulaDate, unsortedFormulaRows,
  formulaFormPayload,
} from './formulas.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };
const viewer = { id: 'u-viewer', role: 'viewer' };

const formula = (over = {}) => ({
  id: 'FML-1', code: 'PF638010202-P1', name: 'Well sleep #2',
  status: 'active', createdById: 'u-sale', ...over,
});

// ── ตัวตน = หมวด × กลิ่น (mig 0207) ──────────────────────────────────────
//
// ⭐ เดิมตัวตนคือ "รหัส" ซึ่ง RD พิมพ์เอง ⇒ ระบบไม่มีทางรู้ว่าสองสูตรหมายถึงของ
// ชิ้นเดียวกันหรือเปล่า · มติผู้ใช้: เทียนหอมกลิ่น A กับก้านไม้หอมกลิ่น A คนละสูตร
// แต่เทียนหอมกลิ่น A สองแถวคือของซ้ำ
test('ตัวตนสูตร = หมวด × กลิ่น — ต้องตรงกับ index formulas_identity_uk', () => {
  assert.equal(formulaIdentityKey({ categoryCode: '01-002', scentId: 'SCT-9' }), '01-002::SCT-9');
  // หมวดเดียวกันคนละกลิ่น = คนละสูตร · กลิ่นเดียวกันคนละหมวด = คนละสูตร
  assert.notEqual(
    formulaIdentityKey({ categoryCode: '01-002', scentId: 'SCT-9' }),
    formulaIdentityKey({ categoryCode: '01-003', scentId: 'SCT-9' }),
  );
  assert.notEqual(
    formulaIdentityKey({ categoryCode: '01-002', scentId: 'SCT-9' }),
    formulaIdentityKey({ categoryCode: '01-002', scentId: 'SCT-8' }),
  );
});

test('ขาดหมวดหรือขาดกลิ่น = ยังไม่มีตัวตน (คืน null ไม่ใช่สตริงว่าง)', () => {
  // ⚠️ ถ้าคืน '' แล้วผู้เรียกเอาไปเทียบกัน สูตรฐานทุกตัวจะกลายเป็น "ของซ้ำ" หมด
  assert.equal(formulaIdentityKey({ categoryCode: '01-002' }), null);
  assert.equal(formulaIdentityKey({ scentId: 'SCT-9' }), null);
  assert.equal(formulaIdentityKey({}), null);
  assert.equal(findFormulaByIdentity([formula()], { scentId: 'SCT-9' }), null);
});

test('หาสูตรซ้ำ: ข้ามตัวที่เลิกใช้แล้ว — index ก็ยกเว้น archived เหมือนกัน', () => {
  const rows = [
    formula({ id: 'FML-old', status: 'archived', categoryCode: '01-002', scentId: 'SCT-9' }),
    formula({ id: 'FML-now', status: 'active', categoryCode: '01-002', scentId: 'SCT-9' }),
  ];
  assert.equal(findFormulaByIdentity(rows, { categoryCode: '01-002', scentId: 'SCT-9' })?.id, 'FML-now');
});

test('รหัสสูตรยังห้ามซ้ำ แต่เป็นเลขที่อ้างอิง ไม่ใช่ตัวตน', () => {
  const rows = [formula()];
  assert.equal(findFormulaByCode(rows, ' pf638010202-p1 ')?.id, 'FML-1');
  assert.equal(findFormulaByCode(rows, 'อื่น'), null);
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

// ⭐ **กลับทิศจาก 0207** (มติผู้ใช้ 2026-08-10: "สูตรผูกลูกค้าก่อน แล้วเลือกกลิ่น
// ที่ลูกค้ามี") — ลูกค้ากลับมาเป็นช่องกรอก แต่ **รูที่ 0207 ปิดไว้ต้องไม่กลับมา**
// (สูตรผูกลูกค้า A แต่ใช้กลิ่นของลูกค้า B) ⇒ ย้ายจากการ derive มาเป็นการตรวจตรง ๆ
test('ลูกค้ารับจากฟอร์มได้ แต่ชื่อลูกค้ายังไม่รับ (server อ่านจากทะเบียนเสมอ)', () => {
  const { value } = normalizeFormulaInput({ name: 'A', customerId: 'CUS-1', customerName: 'ก' });
  assert.equal(value.customerId, 'CUS-1');
  assert.equal('customerName' in value, false, 'ชื่อที่ client ส่งมาอาจเก่าแล้ว');
  // ว่าง = สูตรฐาน — พฤติกรรมเดิมต้องไม่หาย
  assert.equal(normalizeFormulaInput({ name: 'A' }).value.customerId, null);
});

test('⭐ รูของ 0207 ต้องไม่กลับมา — กลิ่นข้ามลูกค้าถูกปฏิเสธ', () => {
  const scent = { id: 'SC-1', customerId: 'CUS-2', customerName: 'ข' };
  assert.match(
    formulaScentCustomerError(scent, { customerId: 'CUS-1' }),
    /ลูกค้าคนละราย/,
    'สูตรของลูกค้า A ห้ามใช้กลิ่นของลูกค้า B',
  );
  assert.equal(formulaScentCustomerError(scent, { customerId: 'CUS-2' }), null);
  // สูตรฐานที่ผูกกลิ่นของลูกค้ารายหนึ่ง = ไม่ใช่สูตรฐานแล้ว แต่ไม่ได้ประกาศตัว
  assert.match(formulaScentCustomerError(scent, {}), /เลือกลูกค้าก่อน/);
  // ไม่เลือกกลิ่น = ไม่มีอะไรต้องตรวจ
  assert.equal(formulaScentCustomerError(null, { customerId: 'CUS-1' }), null);
});

test('หมวดสินค้าต้องเป็นรูป MM-TTT — ครึ่งหนึ่งของตัวตน จะรับค่ามั่วไม่ได้', () => {
  assert.match(normalizeFormulaInput({ name: 'A', categoryCode: '1-2' }).error, /หมวดสินค้า/);
  assert.equal(normalizeFormulaInput({ name: 'A', categoryCode: '01-002' }).value.categoryCode, '01-002');
  assert.equal(normalizeFormulaInput({ name: 'A' }).value.categoryCode, null);
});

test('สถานะสูตรเดินเส้นเดียวกับกลิ่นทุกประการ (คนใช้จำสองกฎไม่ไหว)', () => {
  assert.equal(formulaTransitionError(formula({ status: 'developing' }), 'active'), null);
  assert.match(formulaTransitionError(formula({ status: 'active' }), 'draft'), /ไม่ได้/);
  assert.match(formulaTransitionError(formula({ status: 'active' }), 'active'), /เดิมอยู่แล้ว/);
  assert.equal(formulaTransitionError(formula({ status: 'archived' }), 'active'), null);
});

test('สูตรต้นทางข้ามลูกค้าไม่ได้ แต่สูตรฐานเป็นต้นทางของใครก็ได้', () => {
  const parent = { id: 'FML-9', customerId: 'CUS-1' };
  assert.equal(derivedFromFormulaError(parent, { customerId: 'CUS-1', id: 'FML-1' }), null);
  assert.match(derivedFromFormulaError(parent, { customerId: 'CUS-2', id: 'FML-1' }), /คนละราย/);
  // สูตรฐาน (ไม่ผูกลูกค้า) — ผู้ใช้ยืนยันว่ามีจริงแต่น้อย
  assert.equal(derivedFromFormulaError({ id: 'FML-8', customerId: null }, { customerId: 'CUS-2' }), null);
  assert.match(derivedFromFormulaError(null, { customerId: 'CUS-1' }), /ไม่พบสูตรต้นทาง/);
  assert.match(derivedFromFormulaError(parent, { customerId: 'CUS-1', id: 'FML-9' }), /อ้างตัวเอง/);
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

// ── วันที่เสียที่สืบทอดมา ต้องไม่บล็อกการจัดระเบียบ ──────────────────────
test('วันที่เสียที่สืบทอดจากสินค้าเก่าถูกทิ้ง ไม่ทำให้จัดระเบียบไม่ได้', () => {
  // ของจริงบน prod: สินค้า "Glass window rain" มี formulaDate = '2202-08-06'
  // ถ้าปล่อยให้ตัวดักปีพิมพ์ผิดปฏิเสธ แถวนี้จะค้างในรายการรอจัดระเบียบตลอดไป
  assert.equal(sanitizeInheritedFormulaDate(null, '2202-08-06'), null);
  assert.equal(sanitizeInheritedFormulaDate('', '2025-08-06'), '2025-08-06');
  assert.equal(sanitizeInheritedFormulaDate(null, null), null);
});

test('วันที่ที่ผู้ใช้พิมพ์เองชนะค่าที่สืบทอดมาเสมอ (แก้ปีผิดตรงนั้นได้เลย)', () => {
  assert.equal(sanitizeInheritedFormulaDate('2025-08-06', '2202-08-06'), '2025-08-06');
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

// ── สูตรฐานยังผูกลูกค้าได้ (🐞 regression ที่ 0207 เกือบทำหลุด) ──────────────
//
// กฎที่ถูกคือ **"กลิ่นเป็นเจ้าของคำตอบเมื่อมีกลิ่น"** ไม่ใช่ "สูตรห้ามมีลูกค้า"
// เวอร์ชันแรกของ customerFromScent คืน { customerId: null } ตอนไม่มีกลิ่น ซึ่งไป
// **ล้างลูกค้าทิ้ง** — จุดที่พังจริงคือ "จัดระเบียบ" (สินค้าของลูกค้ารายหนึ่งถูกย้าย
// เป็นสูตร แล้วกลายเป็นสูตรฐานไร้ลูกค้าเงียบ ๆ)
//
// เทสต์นี้ล็อกที่ระดับ "ค่าที่ normalize คืน" — ตัวที่ derive จริงอยู่ใน
// scentFormulaAdmin ซึ่งแตะ DB · สิ่งที่ต้องกันคือ **ห้ามมี customerId โผล่กลับมา
// เป็นช่องที่ client กำหนดได้** ไม่ว่าจะทางไหน
test('สูตรที่ไม่ผูกกลิ่น ผูกลูกค้าได้ — ไม่ใช่ทุกสูตรต้องมีกลิ่น', () => {
  // สูตรที่ไม่ผูกกลิ่นแต่ผูกลูกค้า = มีจริง (ทาง "จัดระเบียบ" ย้ายสินค้าของลูกค้า
  // รายหนึ่งมาเป็นสูตร) — ต้องผ่าน ไม่ใช่ถูกปฏิเสธ
  const { value } = normalizeFormulaInput({ name: 'สูตรฐานเทียน', customerId: 'CUS-1' });
  assert.equal(value.customerId, 'CUS-1');
  assert.equal(value.name, 'สูตรฐานเทียน');
  assert.equal(value.scentId, null);
});

// ── ที่มาของสูตร (กติกาเดียวกับ ม-74 ของทะเบียนกลิ่น) ────────────────────
test('ที่มาตัดสินจาก sourceRequest ไม่ใช่ dealId — ฟอร์มเพิ่มเองก็กรอกดีลได้', async () => {
  const { formulaSourceKind, formulaSourceLabel, matchesFormulaSource, FORMULA_SOURCES } = await import('./formulas.js');
  // เพิ่มเองแต่ผูกดีล — ยังเป็น manual (บทเรียน ม-74)
  assert.equal(formulaSourceKind({ dealId: 'D1' }), 'manual');
  assert.equal(formulaSourceKind({ sourceRequest: { id: 'R1', docNo: 'FD-2608-004' } }), 'request');
  assert.deepEqual(
    formulaSourceLabel({ sourceRequest: { id: 'R1', docNo: 'FD-2608-004' } }),
    { kind: 'request', label: 'คำร้อง FD-2608-004', requestId: 'R1' },
  );
  assert.deepEqual(formulaSourceLabel({}), { kind: 'manual', label: 'เพิ่มเอง', requestId: null });
  // ตัวกรองกับป้ายพูดชุดเดียวกัน
  assert.ok(matchesFormulaSource({}, ''));
  assert.ok(matchesFormulaSource({}, 'manual'));
  assert.ok(!matchesFormulaSource({}, 'request'));
  assert.deepEqual(FORMULA_SOURCES.map((s) => s.value), ['request', 'manual']);
});

/* ── ฟอร์ม → payload (ใช้ร่วมหน้ารายการกับหน้ารายละเอียด · 2026-08-19) ────── */
test('payload ของฟอร์มสูตร: ส่งรหัสเฉพาะคนที่รับเข้าทะเบียนได้ — แต่ส่งแม้ช่องว่าง', () => {
  const value = {
    name: 'Well sleep #2', code: ' PF-1 ', customerId: 'CUS-1', scentId: 'SCT-1',
    categoryCode: '01-030', formulaDate: '', customerTradeName: 'Sleepy', note: '',
    derivedFromFormulaId: '',
  };
  const asRegistrar = formulaFormPayload(value, { canSetCode: true });
  assert.equal(asRegistrar.code, 'PF-1', 'ตัดช่องว่างหัวท้ายเหมือนที่ index เทียบ');
  assert.equal(asRegistrar.formulaDate, null, 'ช่องว่าง = null ไม่ใช่สตริงว่าง');
  assert.equal(asRegistrar.customerId, 'CUS-1');
  assert.equal('customerName' in asRegistrar, false, 'ชื่อลูกค้า server อ่านเอง');

  // 🐞 ลบรหัสทิ้งแล้วต้อง **ส่งค่าว่างไป** ให้ server ตัดสิน — ไม่ส่ง = เงียบแล้วตอบ 200
  assert.equal(formulaFormPayload({ ...value, code: '' }, { canSetCode: true }).code, '');
  // คนที่ไม่มีสิทธิ์ไม่ส่งช่องรหัสเลย จะได้ไม่โดนตีกลับทั้งฟอร์มเพราะช่องที่แก้ไม่ได้อยู่แล้ว
  assert.equal('code' in formulaFormPayload(value, { canSetCode: false }), false);
});

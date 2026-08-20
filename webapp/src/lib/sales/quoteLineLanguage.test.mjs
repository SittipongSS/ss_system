// ── ชื่อสินค้า FG บนใบเสนอราคา: ตามภาษาที่เลือกก่อน แล้วค่อยตกไปอีกภาษา ────────
//
// มติผู้ใช้ 2026-08-20: ใบเสนอราคาเลือกภาษาเอกสารได้ (mig 0238) แต่ชื่อสินค้าที่ตรึง
// ลงบรรทัดเป็นไทยเสมอ ⇒ ใบภาษาอังกฤษได้ชื่อไทยปนอยู่กลางเอกสารอังกฤษ
//
// ⚠️ กติกาที่เทสต์ชุดนี้ล็อกไว้:
//   1. ไม่แปลให้เอง — ไม่มีชื่ออังกฤษ = ใช้ชื่อไทย (และกลับกัน)
//   2. ชื่อสองภาษาเก็บ **ในบรรทัด** ไม่ใช่ไปอ่าน master ตอนพิมพ์ (ใบที่อนุมัติแล้ว
//      ต้องพิมพ์ซ้ำได้เหมือนเดิมแม้ master ถูกแก้)
//   3. ค่าใหม่อยู่ใน metadata ⇒ **ห้ามกระทบ fingerprint การอนุมัติ**
import test from 'node:test';
import assert from 'node:assert/strict';
import { productDisplayName, productDisplayNameFor } from '../master/productIdentity.js';
import { enforceMasterPrices, fgLineDescriptionFor, fgLineLanguageMeta, normalizeManualLines } from './quoteLines.js';
import { buildQuotationMasterModelFromQuote } from './quotationMasterTemplate.js';
import { quotationApprovalContent } from './quotationApprovalFingerprint.js';

const BOTH = { id: 'P1', fgCode: 'FG-1', productDescription: 'ก้านไม้หอม', productDescriptionEn: 'Reed Diffuser', volume: 100, volumeUnit: 'ml', saleUnit: 'ชิ้น', costPrice: 150 };
const THAI_ONLY = { id: 'P2', fgCode: 'FG-2', productDescription: 'เทียนหอม', productDescriptionEn: '', volume: 220, volumeUnit: 'g', saleUnit: 'ชิ้น', costPrice: 200 };
const EN_ONLY = { id: 'P3', fgCode: 'FG-3', productDescription: '', productDescriptionEn: 'Room Spray', volume: 50, volumeUnit: 'ml', saleUnit: 'ชิ้น', costPrice: 90 };

test('ชื่อสินค้าตามภาษาที่เลือก และตกไปอีกภาษาเมื่อไม่มี', () => {
  assert.equal(productDisplayNameFor(BOTH, 'en'), 'Reed Diffuser');
  assert.equal(productDisplayNameFor(BOTH, 'th'), 'ก้านไม้หอม');
  // ไม่มีอังกฤษ = ใช้ไทย (ไม่ใช่ช่องว่าง และไม่แปลให้เอง)
  assert.equal(productDisplayNameFor(THAI_ONLY, 'en'), 'เทียนหอม');
  // ไม่มีไทย = ใช้อังกฤษ — กติกาเดิมของหน้าจอก็เป็นแบบนี้อยู่แล้ว
  assert.equal(productDisplayNameFor(EN_ONLY, 'th'), 'Room Spray');
  // ภาษาที่ไม่รู้จัก/ไม่ส่ง = Thai-first ตามเดิมของทั้งระบบ
  assert.equal(productDisplayNameFor(BOTH), productDisplayName(BOTH));
  assert.equal(productDisplayNameFor(BOTH, 'fr'), 'ก้านไม้หอม');
});

test('คำอธิบายบรรทัดพ่วงปริมาตรทั้งสองภาษา', () => {
  assert.equal(fgLineDescriptionFor(BOTH, 'en'), 'Reed Diffuser · 100 ml');
  assert.equal(fgLineDescriptionFor(BOTH, 'th'), 'ก้านไม้หอม · 100 ml');
  assert.deepEqual(fgLineLanguageMeta(THAI_ONLY), {
    descriptionTh: 'เทียนหอม · 220 g',
    descriptionEn: 'เทียนหอม · 220 g',
  });
});

test('บันทึกใบ: ชื่อสองภาษาถูก sync ลงบรรทัดจาก master', async () => {
  const supabase = {
    from: () => ({ select: () => ({ in: async (_c, ids) => ({ data: [BOTH].filter((p) => ids.includes(p.id)), error: null }) }) }),
  };
  const [line] = await enforceMasterPrices(supabase, normalizeManualLines([
    { productId: 'P1', description: 'ชื่อที่ client ส่งมา', qty: 1, unitPrice: 1 },
  ]));
  assert.equal(line.metadata.descriptionTh, 'ก้านไม้หอม · 100 ml');
  assert.equal(line.metadata.descriptionEn, 'Reed Diffuser · 100 ml');
  // คำอธิบายหลักยังเป็น Thai-first เหมือนเดิม (หน้าจอทำงานอ่านค่านี้)
  assert.equal(line.description, 'ก้านไม้หอม · 100 ml');
});

test('สินค้าถูกลบจาก master: คงชื่อสองภาษาที่บันทึกไว้เดิม ไม่ล้างทิ้ง', async () => {
  const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) };
  const previous = [{ productId: 'P1', unitPrice: 150, description: 'ก้านไม้หอม · 100 ml', fgCode: 'FG-1', unit: 'ชิ้น', metadata: { descriptionTh: 'ก้านไม้หอม · 100 ml', descriptionEn: 'Reed Diffuser · 100 ml' } }];
  const [line] = await enforceMasterPrices(supabase, normalizeManualLines([
    { productId: 'P1', description: 'ก้านไม้หอม · 100 ml', qty: 1, unitPrice: 150 },
  ]), previous);
  assert.equal(line.metadata.descriptionEn, 'Reed Diffuser · 100 ml');
});

const quoteWith = (lines, docLanguage) => ({
  quoteNumber: 'QT-1', quoteDate: '2026-08-20', docLanguage, lines,
  subtotal: 100, totalAmount: 107, vatAmount: 7,
});

test('เอกสาร: ใบอังกฤษได้ชื่ออังกฤษ · ใบไทยได้ชื่อไทย', () => {
  const lines = [{
    id: 'L1', description: 'ก้านไม้หอม · 100 ml', qty: 1, unitPrice: 100, lineTotal: 100,
    metadata: { descriptionTh: 'ก้านไม้หอม · 100 ml', descriptionEn: 'Reed Diffuser · 100 ml' },
  }];
  assert.equal(buildQuotationMasterModelFromQuote(quoteWith(lines, 'en')).lines[0].description, 'Reed Diffuser · 100 ml');
  assert.equal(buildQuotationMasterModelFromQuote(quoteWith(lines, 'th')).lines[0].description, 'ก้านไม้หอม · 100 ml');
});

test('บรรทัดที่ไม่มีคู่ภาษา (พิมพ์เอง/ใบเก่า) พิมพ์ของเดิม ไม่ใช่ช่องว่าง', () => {
  const manual = [{ id: 'L2', description: 'ค่าออกแบบกลิ่น', qty: 1, unitPrice: 5000, lineTotal: 5000, metadata: {} }];
  assert.equal(buildQuotationMasterModelFromQuote(quoteWith(manual, 'en')).lines[0].description, 'ค่าออกแบบกลิ่น');
  const legacy = [{ id: 'L3', description: 'สินค้าเก่า', qty: 1, unitPrice: 1, lineTotal: 1 }];
  assert.equal(buildQuotationMasterModelFromQuote(quoteWith(legacy, 'en')).lines[0].description, 'สินค้าเก่า');
});

test('⛔ fingerprint การอนุมัติต้องไม่ขยับเพราะคู่ภาษาในบรรทัด', () => {
  const base = { id: 'L1', productId: 'P1', fgCode: 'FG-1', description: 'ก้านไม้หอม · 100 ml', qty: 1, unitPrice: 100, lineTotal: 100 };
  const withMeta = { ...base, metadata: { descriptionTh: 'ก้านไม้หอม · 100 ml', descriptionEn: 'Reed Diffuser · 100 ml' } };
  assert.deepEqual(
    quotationApprovalContent({ subtotal: 100 }, [withMeta]),
    quotationApprovalContent({ subtotal: 100 }, [base]),
  );
});

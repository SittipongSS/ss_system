// ม-167 (มติเจ้าของ 25/11/2026) — บรรทัด MSDS: กลิ่น (02-020) หรือสูตร (หมวดอื่น) ของ FG · ยังไม่ผูก = เลือก/พิมพ์ชื่อในบรรทัด
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docLineSubjectError, docLineSubjectText, docLineSubjectValues, docLineSubjectView, docLineWantsSubject,
  fgBoundSubjectId, fgNeedsLineSubject, fgSubjectKind,
} from './docLineSubject.js';
import { normalizeDocumentItems } from './lines.js';
import { BILLING_DOC_VOCABULARY } from './kinds/fn/billingDocTypes.js';
import { normalizeDocLines } from './lines.js';

const oilFg = { id: 'P-OIL', fgCode: 'FG-130-02-020-0415', categoryCode: '02-020', scentId: null, formulaId: null };
const lotionFg = { id: 'P-LOT', fgCode: 'FG-0632-02-011-10169', categoryCode: '02-011', scentId: null, formulaId: null, productDescription: 'Body Lotion' };
const giftFg = { id: 'P-GIFT', fgCode: 'FG-1-01-037-1', categoryCode: '01-037' };
const msds = (extra = {}) => ({ lineKind: 'document', docType: 'msds', productId: 'P', ...extra });

test('ชนิดของ FG ตามหมวด: 02-020 = กลิ่น · 01-037 = ชุดของขวัญ · อื่น = สูตร', () => {
  assert.equal(fgSubjectKind(oilFg), 'scent');
  assert.equal(fgSubjectKind(lotionFg), 'formula');
  assert.equal(fgSubjectKind(giftFg), 'giftSet');
  assert.equal(fgBoundSubjectId({ ...oilFg, scentId: 'S1', formulaId: 'F1' }), 'S1');
  assert.equal(fgBoundSubjectId({ ...lotionFg, formulaId: 'F1', scentId: 'S1' }), 'F1');
  assert.equal(fgNeedsLineSubject(lotionFg), true);
  assert.equal(fgNeedsLineSubject({ ...lotionFg, formulaId: 'F1' }), false);
  assert.equal(fgNeedsLineSubject(giftFg), false);
});

test('เฉพาะบรรทัด MSDS ของ RD — IFRA / Spec Sheet / ใบวางบิลไม่ถาม', () => {
  assert.equal(docLineWantsSubject(msds()), true);
  assert.equal(docLineWantsSubject({ lineKind: 'document', docType: 'ifra' }), false);
  assert.equal(docLineWantsSubject({ lineKind: 'document', docType: 'spec_sheet' }), false);
  assert.equal(docLineWantsSubject({ lineKind: 'billing_doc', docType: 'msds' }), false);
});

test('ค่าที่เก็บ: ตัดของผิดชนิดทิ้ง · ตัวจากทะเบียนชนะชื่อที่พิมพ์ · FG ผูกแล้วไม่เก็บอะไร', () => {
  assert.deepEqual(docLineSubjectValues(msds({ scentId: 'S1', formulaId: 'F1', typedSubjectName: 'x' }), oilFg),
    { scentId: 'S1', formulaId: null, typedSubjectName: null });
  assert.deepEqual(docLineSubjectValues(msds({ scentId: 'S1', formulaId: 'F1' }), lotionFg),
    { scentId: null, formulaId: 'F1', typedSubjectName: null });
  assert.deepEqual(docLineSubjectValues(msds({ typedSubjectName: '  shadow Elite ' }), oilFg),
    { scentId: null, formulaId: null, typedSubjectName: 'shadow Elite' });
  assert.deepEqual(docLineSubjectValues(msds({ formulaId: 'F9' }), { ...lotionFg, formulaId: 'F1' }),
    { scentId: null, formulaId: null, typedSubjectName: null });
  assert.deepEqual(docLineSubjectValues(msds({ formulaId: 'F9' }), giftFg),
    { scentId: null, formulaId: null, typedSubjectName: null });
});

test('ด่าน: บรรทัดใหม่ของ FG ที่ยังไม่ผูกต้องมีกลิ่น/สูตรหรือชื่อที่พิมพ์ · บรรทัดเดิมไม่บังคับ', () => {
  assert.match(docLineSubjectError(msds(), oilFg, { at: 'รายการที่ 1' }), /รายการที่ 1: FG FG-130-02-020-0415 ยังไม่ผูกกลิ่น/);
  assert.match(docLineSubjectError(msds(), lotionFg), /ยังไม่ผูกสูตร — เลือกสูตรจากทะเบียน หรือพิมพ์ชื่อสูตร/);
  // กลิ่นค้างไปกับ FG หมวดสูตร = ไม่นับ
  assert.ok(docLineSubjectError(msds({ scentId: 'S1' }), lotionFg));
  assert.equal(docLineSubjectError(msds({ formulaId: 'F1' }), lotionFg), null);
  assert.equal(docLineSubjectError(msds({ typedSubjectName: 'REBIRTH01' }), oilFg), null);
  assert.match(docLineSubjectError(msds({ typedSubjectName: 'x'.repeat(201) }), oilFg), /ยาวเกิน 200/);
  assert.equal(docLineSubjectError(msds({ id: 'DRI-old' }), lotionFg), null);
  assert.equal(docLineSubjectError(msds(), { ...lotionFg, formulaId: 'F1' }), null);
  assert.equal(docLineSubjectError(msds(), giftFg), null);
  assert.equal(docLineSubjectError(msds(), null), null);
});

test('ป้ายบนจอ: ของ FG ชนะของในบรรทัด · ผู้ขอเลือก · พิมพ์ชื่อ · ยังไม่ระบุ', () => {
  const scent = { code: 'PF13001', name: 'shadow Elite', producedAt: '2026-10-01' };
  const fgView = docLineSubjectView(msds({ scentId: 'S-line' }), { product: { ...oilFg, scentId: 'S1' }, fgScent: scent });
  assert.equal(fgView.source, 'fg');
  assert.equal(docLineSubjectText(fgView), 'กลิ่นของ FG PF13001 · shadow Elite · 01/10/2026');
  const lineView = docLineSubjectView(msds({ formulaId: 'F1' }), {
    product: lotionFg, lineFormula: { code: 'FM1', name: 'Lotion A', formulaDate: '2026-11-01' },
  });
  assert.equal(lineView.source, 'line');
  assert.equal(lineView.fg.description, 'Body Lotion');
  assert.match(docLineSubjectText(lineView), /^สูตร FM1 · Lotion A · 01\/11\/2026 \(ผู้ขอเลือก · FG ยังไม่ผูก\)$/);
  const typed = docLineSubjectView(msds({ typedSubjectName: 'REBIRTH01' }), { product: oilFg });
  assert.equal(docLineSubjectText(typed), 'กลิ่น REBIRTH01 (พิมพ์ชื่อ · ยังไม่มีในทะเบียน)');
  assert.equal(docLineSubjectText(docLineSubjectView(msds(), { product: lotionFg })), 'ยังไม่ระบุสูตร');
  // สูตรของ FG โหลดทะเบียนไม่เจอ = ใช้สำเนาบนแถวสินค้า
  const snap = docLineSubjectView(msds(), { product: { ...lotionFg, formulaId: 'F1', formulaCode: 'FM1', formulaName: 'Snap', formulaDate: null } });
  assert.equal(snap.label, 'FM1 · Snap · —');
  assert.equal(docLineSubjectView({ lineKind: 'document', docType: 'ifra' }, { product: oilFg }), null);
});

test('ตัวตรวจบรรทัด: MSDS พกกลิ่น/สูตร/ชื่อที่พิมพ์ไปให้ resolveLineLabels · IFRA ไม่มีคีย์สูตร · ใบวางบิลไม่มีคีย์ใหม่', () => {
  const { items, error } = normalizeDocumentItems([
    { docType: 'msds', productId: 'P1', scentId: 'S1', formulaId: 'F1', typedSubjectName: ' n ' },
    { docType: 'ifra', scentId: 'S2', formulaId: 'F2' },
  ]);
  assert.equal(error, null);
  assert.equal(items[0].scentId, 'S1');
  assert.equal(items[0].formulaId, 'F1');
  assert.equal(items[0].typedSubjectName, 'n');
  assert.equal(items[1].scentId, 'S2');
  assert.equal(items[1].formulaId, null);
  assert.equal(items[1].typedSubjectName, null);
  assert.match(normalizeDocumentItems([{ docType: 'msds', productId: 'P1', typedSubjectName: 'x'.repeat(201) }]).error, /ยาวเกิน 200/);
  const billing = normalizeDocLines([{ docType: BILLING_DOC_VOCABULARY.values[0], spec: 'a', formulaId: 'F1' }], BILLING_DOC_VOCABULARY);
  assert.equal(billing.error, null);
  assert.equal('formulaId' in billing.items[0], false);
  assert.equal('typedSubjectName' in billing.items[0], false);
});

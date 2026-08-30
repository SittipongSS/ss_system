// ── หมายเหตุประจำสินค้า → รายการบนใบเสนอราคา/ใบสั่งขาย (mig 0317) ────────────
//
// มติผู้ใช้ 2026-08-30: หมายเหตุรายบรรทัดมีอยู่แล้ว แต่ต้องพิมพ์ใหม่ทุกใบ ทั้งที่
// ข้อความเป็นของ "สินค้าตัวนั้น" ⇒ ตั้งที่ทะเบียนสินค้าสองภาษา แล้วให้ระบบเติมให้
//
// ⚠️ กติกาที่เทสต์ชุดนี้ล็อกไว้:
//   1. ก๊อป **ตอนสร้างบรรทัด** เท่านั้น — แก้ master ไม่ย้อนไปแก้ใบที่ออกไปแล้ว
//   2. คนออกใบแก้ทับได้ และพอแก้แล้วธง noteAuto หลุด ⇒ ใบภาษาอังกฤษพิมพ์ข้อความ
//      ที่พิมพ์เอง ไม่ใช่คู่แปลของสินค้า (ไม่แปลให้เอง — กติกาเดียวกับชื่อสินค้า)
//   3. ค่าใหม่อยู่ใน metadata ⇒ ห้ามกระทบ fingerprint การอนุมัติ
//   4. แก้เฉพาะหมายเหตุที่ทะเบียนสินค้า ⇒ **ไม่ต้องอนุมัติสินค้าใหม่**
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fgLineNoteMeta, lineNoteEdit, lineNoteFor, seedLinesFromProject,
} from './quoteLines.js';
import { buildQuotationMasterModelFromQuote } from './quotationMasterTemplate.js';
import { quotationApprovalContent } from './quotationApprovalFingerprint.js';
import { PRODUCT_DOC_NOTE_FIELDS, changedFieldsAgainst, resetApprovalOnEdit } from '../master/approval.js';

const BOTH = {
  id: 'P1', fgCode: 'FG-1', productDescription: 'ก้านไม้หอม', productDescriptionEn: 'Reed Diffuser',
  volume: 100, volumeUnit: 'ml', saleUnit: 'ชิ้น', costPrice: 150,
  docNote: 'บรรจุขวดแก้วพร้อมกล่อง', docNoteEn: 'Glass bottle with gift box',
};
const TH_ONLY = { ...BOTH, id: 'P2', docNote: 'ผลิตตามตัวอย่างที่อนุมัติ', docNoteEn: '' };
const NO_NOTE = { ...BOTH, id: 'P3', docNote: '', docNoteEn: null };

test('หมายเหตุจากทะเบียนสินค้า: สองภาษา + ตกไปอีกภาษาเมื่อมีข้างเดียว', () => {
  assert.deepEqual(fgLineNoteMeta(BOTH), {
    note: 'บรรจุขวดแก้วพร้อมกล่อง', noteEn: 'Glass bottle with gift box', noteAuto: true,
  });
  // ไม่แปลให้เอง — มีภาษาเดียวก็ใช้ภาษานั้นทั้งสองทาง
  assert.deepEqual(fgLineNoteMeta(TH_ONLY), {
    note: 'ผลิตตามตัวอย่างที่อนุมัติ', noteEn: 'ผลิตตามตัวอย่างที่อนุมัติ', noteAuto: true,
  });
  // ไม่มีหมายเหตุ = ไม่ยัดคีย์เปล่าลงบรรทัด
  assert.deepEqual(fgLineNoteMeta(NO_NOTE), {});
  assert.deepEqual(fgLineNoteMeta(null), {});
});

test('เอกสารเลือกภาษา: ใบอังกฤษได้หมายเหตุอังกฤษ ตราบใดที่ยังไม่มีใครแก้', () => {
  const auto = { metadata: fgLineNoteMeta(BOTH) };
  assert.equal(lineNoteFor(auto, 'th'), 'บรรจุขวดแก้วพร้อมกล่อง');
  assert.equal(lineNoteFor(auto, 'en'), 'Glass bottle with gift box');

  // คนออกใบแก้ข้อความ ⇒ ธงหลุด ⇒ ใบอังกฤษพิมพ์สิ่งที่พิมพ์ไว้ ไม่ใช่คู่แปลของสินค้า
  const edited = { metadata: lineNoteEdit(auto.metadata, 'ล็อตนี้ไม่มีกล่อง') };
  assert.equal(edited.metadata.noteAuto, undefined);
  assert.equal(edited.metadata.noteEn, undefined);
  assert.equal(lineNoteFor(edited, 'en'), 'ล็อตนี้ไม่มีกล่อง');

  // บรรทัดที่พิมพ์เองล้วน + ใบเก่าก่อน mig 0317 (ไม่มีคู่ภาษา) พิมพ์ของเดิมทั้งสองภาษา
  assert.equal(lineNoteFor({ metadata: { note: 'ของเก่า' } }, 'en'), 'ของเก่า');
  assert.equal(lineNoteFor({ note: 'บรรทัดที่ไม่มี metadata' }, 'en'), 'บรรทัดที่ไม่มี metadata');
  assert.equal(lineNoteFor({}, 'th'), '');
});

test('lineNoteEdit ไม่แตะคีย์อื่นในบรรทัด', () => {
  const before = { descriptionTh: 'ก', descriptionEn: 'a', productBrand: 'RAM', ...fgLineNoteMeta(BOTH) };
  const after = lineNoteEdit(before, 'ข้อความใหม่');
  assert.deepEqual(after, { descriptionTh: 'ก', descriptionEn: 'a', productBrand: 'RAM', note: 'ข้อความใหม่' });
});

test('เอกสารที่พิมพ์ออกมา: หมายเหตุเดินตามภาษาของใบ', () => {
  const lines = [{ id: 'L1', fgCode: 'FG-1', description: 'ก้านไม้หอม · 100 ml', qty: 1, unitPrice: 150, lineTotal: 150, metadata: { ...fgLineNoteMeta(BOTH) } }];
  const th = buildQuotationMasterModelFromQuote({ lines, docLanguage: 'th' });
  const en = buildQuotationMasterModelFromQuote({ lines, docLanguage: 'en' });
  assert.equal(th.lines[0].note, 'บรรจุขวดแก้วพร้อมกล่อง');
  assert.equal(en.lines[0].note, 'Glass bottle with gift box');
});

test('หมายเหตุอยู่ใน metadata จึงไม่กระทบ fingerprint การอนุมัติ', () => {
  const base = { id: 'L1', productId: 'P1', description: 'ก้านไม้หอม', qty: 1, unitPrice: 150, lineTotal: 150 };
  const plain = quotationApprovalContent({ lines: [base] });
  const withNote = quotationApprovalContent({ lines: [{ ...base, metadata: fgLineNoteMeta(BOTH) }] });
  assert.deepEqual(plain, withNote);
});

test('seed บรรทัดจากโครงการ: ได้หมายเหตุของสินค้าติดมาด้วย', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            { id: 'PP1', productId: 'P1', orderQty: 5, product: BOTH },
            { id: 'PP2', productId: 'P3', orderQty: 2, product: NO_NOTE },
          ],
        }),
      }),
    }),
  };
  const lines = await seedLinesFromProject(supabase, { projectId: 'PRJ-1' });
  assert.equal(lines[0].metadata.note, 'บรรจุขวดแก้วพร้อมกล่อง');
  assert.equal(lines[0].metadata.noteAuto, true);
  // สินค้าที่ไม่มีหมายเหตุต้องไม่ได้คีย์เปล่าติดมา
  assert.equal('note' in lines[1].metadata, false);
});

test('แก้เฉพาะหมายเหตุที่ทะเบียนสินค้า: ไม่ต้องอนุมัติใหม่ (มติ 2026-08-30)', () => {
  const approved = { approvalStatus: 'approved', docNote: 'เดิม', docNoteEn: 'old', costPrice: 150 };
  const user = { id: 'U1', name: 'AE' };

  const noteOnly = changedFieldsAgainst(approved, { ...approved, docNote: 'ใหม่', docNoteEn: 'new' });
  assert.deepEqual(noteOnly, ['docNote', 'docNoteEn']);
  assert.equal(resetApprovalOnEdit(approved, user, { changedFields: noteOnly, exemptFields: PRODUCT_DOC_NOTE_FIELDS }), null);

  // แต่พ่วงของจริงมาด้วยเมื่อไร ด่านเดิมกลับมาทันที
  const withPrice = changedFieldsAgainst(approved, { ...approved, docNote: 'ใหม่', costPrice: 200 });
  const reset = resetApprovalOnEdit(approved, user, { changedFields: withPrice, exemptFields: PRODUCT_DOC_NOTE_FIELDS });
  assert.equal(reset.approvalStatus, 'pending');
});

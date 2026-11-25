// ── หมายเหตุรายการบนใบสั่งขาย — แก้ในโหมด "แก้ไขข้อมูล" แล้วไปกับ "บันทึกร่าง" (มติเจ้าของ 25/11/2026) ──────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SO_LINE_NOTE_MAX,
  SO_LINE_NOTE_TEXT,
  changedLineNotes,
  currentLineNote,
  lineNoteTooLong,
  normalizeLineNote,
  salesOrderLineNoteMetadata,
  validateLineNotesPatch,
} from './salesOrderLineNote.js';
import { salesOrderApprovalFingerprint } from './salesOrderApprovalFingerprint.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const LINES = [
  { id: 'L1', fgCode: 'FG-1', metadata: { note: 'เดิม', noteEn: 'Old', noteAuto: true, categoryName: 'น้ำหอม' } },
  { id: 'L2', fgCode: 'FG-2' },
];

test('metadata ใหม่: ข้อความที่พิมพ์ทิ้งธงทะเบียนสินค้า · ว่าง = ลบสามคีย์ · คีย์อื่นอยู่ครบ', () => {
  assert.deepEqual(salesOrderLineNoteMetadata(LINES[0].metadata, ' พิมพ์เอง '), { categoryName: 'น้ำหอม', note: 'พิมพ์เอง' });
  assert.deepEqual(salesOrderLineNoteMetadata(LINES[0].metadata, ''), { categoryName: 'น้ำหอม' });
  assert.deepEqual(salesOrderLineNoteMetadata(null, 'ก'), { note: 'ก' });
  assert.equal(currentLineNote(LINES[0]), 'เดิม');
  assert.equal(currentLineNote(LINES[1]), '');
  assert.equal(normalizeLineNote(undefined), '');
});

test('ฝั่งจอ: ส่งเฉพาะบรรทัดที่ข้อความต่างจากเดิม · ไม่มีอะไรเปลี่ยน = null (ไม่ส่งคีย์)', () => {
  assert.equal(changedLineNotes({}, LINES), null);
  assert.equal(changedLineNotes({ L1: ' เดิม ', L2: '' }, LINES), null, 'พิมพ์แล้วกลับเป็นค่าเดิม = ไม่เปลี่ยน');
  assert.deepEqual(changedLineNotes({ L1: 'ใหม่ ', L2: '' }, LINES), { L1: 'ใหม่' });
  assert.deepEqual(changedLineNotes({ L1: '', L2: 'เพิ่ม' }, LINES), { L1: '', L2: 'เพิ่ม' }, 'ลบหมายเหตุ = ส่งข้อความว่าง');
  assert.equal(changedLineNotes({ L9: 'x' }, LINES), null, 'บรรทัดที่ไม่อยู่ในใบไม่ถูกส่ง');
});

test('ฝั่ง route: ตรวจบรรทัดเป็นของใบนี้ · ชนิดข้อมูล · ความยาว — ผิดข้อเดียวไม่เขียนสักแถว', () => {
  const { changes, error } = validateLineNotesPatch({ L1: 'ใหม่', L2: '' }, LINES);
  assert.equal(error, null);
  assert.deepEqual(changes.map((c) => [c.line.id, c.previous, c.note]), [['L1', 'เดิม', 'ใหม่']], 'L2 ว่างอยู่แล้ว = ไม่ใช่การแก้');
  assert.deepEqual(changes[0].metadata, { categoryName: 'น้ำหอม', note: 'ใหม่' });
  assert.equal(validateLineNotesPatch({ L1: 'x', L9: 'y' }, LINES).error, SO_LINE_NOTE_TEXT.lineMissing);
  assert.equal(validateLineNotesPatch({ L1: 5 }, LINES).error, SO_LINE_NOTE_TEXT.invalid);
  assert.equal(validateLineNotesPatch(['x'], LINES).error, SO_LINE_NOTE_TEXT.invalid);
  assert.equal(validateLineNotesPatch('x', LINES).error, SO_LINE_NOTE_TEXT.invalid);
  assert.equal(validateLineNotesPatch({ L2: 'ก'.repeat(SO_LINE_NOTE_MAX) }, LINES).error, null);
  assert.equal(validateLineNotesPatch({ L2: 'ก'.repeat(SO_LINE_NOTE_MAX + 1) }, LINES).error, SO_LINE_NOTE_TEXT.tooLong);
  assert.equal(lineNoteTooLong('ก'.repeat(SO_LINE_NOTE_MAX + 1)), true);
  assert.deepEqual(validateLineNotesPatch({ L1: null }, LINES).changes.map((c) => c.note), [''], 'null = ลบหมายเหตุ');
});

test('ลายนิ้วมือการอนุมัติไม่อ่านหมายเหตุรายการ', () => {
  const lines = [{ id: 'L1', sortOrder: 0, description: 'น้ำหอม', qty: 1, unitPrice: 100, lineTotal: 100, metadata: { note: 'เดิม' } }];
  const order = { orderNumber: 'SO-1', totalAmount: 100, lines };
  const edited = [{ ...lines[0], metadata: salesOrderLineNoteMetadata(lines[0].metadata, 'ใหม่') }];
  assert.equal(salesOrderApprovalFingerprint(order, edited), salesOrderApprovalFingerprint(order, lines));
});

/* ยามรูปโค้ด — เทสต์เรียก handler จริงไม่ได้ (เขียนฐาน) จึงยึดข้อที่พลาดแล้วเงียบ */
test('route: หมายเหตุรายการไปกับ action save เท่านั้น · ตรวจก่อนเขียน · เขียนบรรทัดหลังหัวใบผ่านด่านสถานะ', () => {
  const src = read('../../app/api/sales-planning/sales-orders/[id]/route.js');
  assert.doesNotMatch(src, /set_line_note/, 'ไม่มีทางบันทึกหมายเหตุแยก (มติ: อยู่ในลูป แก้ไขข้อมูล → บันทึกร่าง)');
  const start = src.indexOf("if (action === 'save')");
  const branch = src.slice(start, src.indexOf("if (action === 'submit')", start));
  assert.match(branch, /if \(!\['draft', 'rejected'\]\.includes\(before\.status\)\)/, 'ยื่น/อนุมัติแล้วแก้ไม่ได้');
  const validate = branch.indexOf('validateLineNotesPatch(body.lineNotes');
  const header = branch.indexOf(".eq('status', before.status)");
  const lines = branch.indexOf(".from('sales_order_lines')");
  assert.ok(validate > 0 && header > validate && lines > header, 'ตรวจ → หัวใบ (ด่านสถานะที่แถวจริง) → บรรทัด');
});

test('หน้าใบ: ช่องหมายเหตุขึ้นเฉพาะโหมดแก้ · ร่างล้างทุกครั้งที่โหลดใบ/ออกจากโหมดแก้ · ส่งไปกับบันทึกร่าง', () => {
  const src = read('../../app/sales-planning/sales-orders/[id]/page.js');
  assert.match(src, /const renderLineNote = editable\n/);
  assert.match(src, /requestAction\("save", \{\n\s*\.\.\.form, confirmation: \{ \.\.\.confirmation, attachments \}, \.\.\.\(lineNotesPatch \? \{ lineNotes: lineNotesPatch \} : \{\}\),/);
  const load = src.slice(src.indexOf('const load = useCallback'), src.indexOf('}, [id]);', src.indexOf('const load = useCallback')));
  assert.match(load, /setLineNotes\(\{\}\)/);
  const leave = src.slice(src.indexOf('function leaveEditMode()'), src.indexOf('setEditMode(false);', src.indexOf('function leaveEditMode()')));
  assert.match(leave, /setLineNotes\(\{\}\)/);
});

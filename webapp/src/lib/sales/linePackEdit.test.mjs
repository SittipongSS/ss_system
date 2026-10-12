// ── เลขแพ็คของบรรทัด: กฎฝั่งจอของช่องกรอก (งวด PR-3 · docs/qt-pack-column.md) ───────────────────────────────
//
// ⭐ มติเจ้าของ 08/10 (A2 "บังคับใส่" · A3 "ต้องใส่ทุกตัวในหมวด" · A4 "เมื่อแก้หรือออก Rev." · A5 ส่วนลดหักจากยอดทั้งรายการ)
//   ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React ⇒ ทุกอย่างที่จอ "ตัดสิน" อยู่ในฟังก์ชันล้วนของ linePackEdit.js และถูกยึดที่นี่
//   (เซลล์และสองหน้าแค่วาดผล — ยามซอร์สของมันอยู่ที่ quoteLineCells.test.mjs · quotePackEditorPages.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LINE_PACK_EDIT_TEXT, PACK_INPUT_TITLE, lineAmountAsStored, linePackEditView, linePackState, lineStoredUntouched, packGateNotice,
  quoteLinesPackView, resplitTotalNote,
} from './linePackEdit.js';
import * as linePackEdit from './linePackEdit.js';
import {
  LINE_PACK_TEXT, LinePackError, PACK_QTY_MAX, linePackGateMessage, linePackIssues, linePackMessage, packQtyValue,
} from './linePacks.js';
import { PACK_COLUMN_LABEL } from './linePackView.js';
import { enforceMasterPrices, manualLineCategoryPatch, masterPriceUncertain, normalizeManualLines, quoteLineFromProduct } from './quoteLines.js';
import { quoteLineNet, quoteTotals } from '../salesPlanning.js';
import { fmtMoney } from '../format.js';

const SOURCE = readFileSync(new URL('./linePackEdit.js', import.meta.url), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── ของตัวอย่าง: สินค้าและบรรทัดรูปเดียวกับที่หน้าใบเสนอราคาถือ ───────────────────────────────────────── */
const product = (id, fgCode, saleUnit, costPrice) => ({ id, fgCode, saleUnit, costPrice, productDescription: id });
const SDS = product('P-SDS', 'FG-278-02-001-0757', 'แพ็คเกจ', 3500);      // หมวด 02-001 ขายเป็นแพ็คเกจ
const SDS_S = product('P-SDS29', 'FG-278-02-001-0758', 'แพ็คเกจ', 2900);
const OIL_KG = product('P-OIL', 'FG-278-02-001-0771', 'กิโลกรัม', 1700);  // หมวด 02-001 ขายเป็นกิโลกรัม (A3)
const PART_PC = product('P-PC', 'FG-278-02-001-0780', 'ชิ้น', 900);        // หมวด 02-001 ขายเป็นชิ้น (A3)
const CANDLE = product('P-CD', 'FG-278-01-003-0763', 'ชิ้น', 250);        // หมวดอื่น
const PRODUCTS = [SDS, SDS_S, OIL_KG, PART_PC, CANDLE];

const fg = (item, over = {}) => ({
  _lineKind: 'product', productId: item.id, fgCode: item.fgCode, description: item.id, qty: 1, unit: item.saleUnit,
  unitPrice: item.costPrice, discountType: null, discountValue: 0, source: 'manual', metadata: {}, ...over,
});
const typed = (over = {}) => ({
  _lineKind: 'manual', productId: null, fgCode: null, description: 'ค่าบริการ', qty: 1, unit: 'ชิ้น', unitPrice: 0,
  discountType: null, discountValue: 0, source: 'manual', metadata: {}, ...over,
});
const SDS_CATEGORY = { categoryCode: '02-001', categoryName: 'ระบบกระจายกลิ่น', categoryNameEn: 'SDS' };
/* บรรทัดที่เก็บไว้แล้ว (อ่านจาก GET): มี id · lineTotal · discountAmount · packQty null */
const stored = (id, line, lineTotal, discountAmount = 0) => ({ id, ...line, packQty: null, lineTotal, discountAmount });

/* ═══ ข้อความ ═════════════════════════════════════════════════════════════════════════════════════════ */

test('ข้อความของช่องกรอก: ทุกคีย์ตรงตามสัญญา · คำว่า “แพ็ค/เดือน” และรหัสหมวดมาจากค่าคงที่ (ไม่สะกดซ้ำ)', () => {
  assert.equal(LINE_PACK_EDIT_TEXT.missing, 'ต้องกรอก');
  assert.equal(LINE_PACK_EDIT_TEXT.range, 'จำนวนเต็ม 1–9,999');
  assert.equal(LINE_PACK_EDIT_TEXT.stray, 'ลบตัวเลขนี้ออก');
  assert.equal(LINE_PACK_EDIT_TEXT.discountPerPackMonth('=', '600.00'), '= ลด 600.00 ต่อแพ็คต่อเดือน');
  assert.equal(LINE_PACK_EDIT_TEXT.storedAmount('฿498,800.00'), 'ยอดเดิม ฿498,800.00');
  assert.equal(LINE_PACK_EDIT_TEXT.totalSame('฿533,716.00'), 'ยอดรวมทั้งสิ้นเท่าเดิม ฿533,716.00');
  assert.equal(LINE_PACK_EDIT_TEXT.totalChanged('฿74,472.00', '฿164,352.00'), 'ยอดรวมทั้งสิ้นเปลี่ยนจาก ฿74,472.00 เป็น ฿164,352.00');
  assert.equal(LINE_PACK_EDIT_TEXT.reviseNote, 'ฉบับใหม่ต้องกรอก “แพ็ค/เดือน” ของรายการหมวด 02-001 ก่อนยื่นอนุมัติ');
  assert.equal(LINE_PACK_EDIT_TEXT.resplitHint,
    'รายการหมวด 02-001 ของใบนี้บันทึกไว้ก่อนมีช่อง “แพ็ค/เดือน” — แยกจำนวนเดิมเป็น แพ็ค × เดือน ให้ยอดเท่าเดิม (เช่น 24 = 2 แพ็ค × 12 เดือน)');
  assert.equal(PACK_INPUT_TITLE, 'แพ็ค/เดือน — จำนวนเต็ม 1–9,999');
  assert.ok(Object.isFrozen(LINE_PACK_EDIT_TEXT));
  // ช่วงในข้อความ = ช่วงของกฎ (CHECK ของ 0407)
  assert.ok(LINE_PACK_EDIT_TEXT.range.endsWith(PACK_QTY_MAX.toLocaleString('en-US')));
  // ไฟล์ไม่สะกดชื่อคอลัมน์/รหัสหมวดเอง — อ่านจาก PACK_COLUMN_LABEL · PACK_LINE_CATEGORY
  assert.doesNotMatch(CODE, /แพ็ค\/เดือน|02-001/);
  assert.equal(PACK_COLUMN_LABEL, 'แพ็ค/เดือน');
});

/* ═══ ช่องกรอก: เก็บทุกอย่างที่พิมพ์ — ตัวตัดสินคือ packQtyValue ตัวเดียวกับเซิร์ฟเวอร์ ═════════════════════════════ */

/* ⭐ ย้ายความคาดหวังโดยเจตนา (รีวิวเงิน + รีวิวจอ 09/10 · มติเจ้าของ 08/10 ข้อ A2 "บังคับใส่" · ข้อวินิจฉัย 5 "ไม่มีค่าตั้งต้นเงียบ"):
   เดิมยามนี้ยึดตัวกรอง `packInputText` — "รับได้แค่ว่างหรือเลข 1–9999 นอกนั้น null = ช่องคงค่าเดิม" ซึ่งถูกเรียก **ทุกครั้งที่กดปุ่ม**
   ⇒ ปุ่มที่ทำให้ค่าผิดถูกทิ้งเงียบ ๆ แล้วปุ่มถัดไปเดินต่อ: พิมพ์ 0 . 5 ได้ 5 · 1 . 5 ได้ 15 · 2 . 0 0 ได้ 200 · 1 0 0 0 0 ได้ 1000 ·
     ช่องมี 10 จะแก้เป็น 20 (ลบเลข 1 → "0" ถูกปฏิเสธ → พิมพ์ 2) ได้ 102 — ตัวคูณเงินเป็นเลขที่ไม่มีใครพิมพ์ ไม่มีอะไรบอก
   วันนี้ **ไม่มีตัวกรอง**: ช่องเก็บตามที่พิมพ์ทุกตัวอักษร · ค่าที่ใช้ไม่ได้ = สถานะ `invalid` (ยอดเป็นขีด · บอกช่วงใต้ช่อง · บันทึกไม่ได้)
   ไม่ได้คลายยาม: ทุกแถวของตารางเดิมยังถูกยึด — ค่าที่เดิม "ช่องไม่รับ" วันนี้คือ "ช่องเก็บไว้ให้เห็น แต่ใช้คิดเงินและบันทึกไม่ได้" */
test('🔴 ช่องแพ็คเก็บทุกอย่างที่พิมพ์ — ใช้ได้เฉพาะว่างหรือเลข 1–9999 ตรงตัว นอกนั้น invalid ทั้งก้อน (ไม่ตัดท่อน ไม่แปลง ไม่ปัด ไม่ทิ้งปุ่ม)', () => {
  const stateOf = (text) => linePackState(fg(SDS, { qty: 12, packQty: text }), SDS);
  /* [ข้อความในช่อง, สถานะ] — ตารางเดิมของตัวกรอง ครบทุกแถว */
  const table = [
    ['2', 'ok'],
    ['0', 'invalid'],          // เดิม: ปุ่มถูกทิ้ง ช่องยังว่าง ⇒ ปุ่มถัดไปกลายเป็นหลักแรก
    ['10', 'ok'],
    ['1.', 'invalid'],
    ['1.5', 'invalid'], ['1,200', 'invalid'], ['2 แพ็ค', 'invalid'], ['-2', 'invalid'], ['abc', 'invalid'], ['๒', 'invalid'],
    ['+2', 'invalid'], ['2e3', 'invalid'], ['2.00', 'invalid'], ['0.5', 'invalid'], ['1 2', 'invalid'],
    [' 12 ', 'ok'],            // ช่องว่างหัวท้ายไม่เปลี่ยนความหมาย (packQtyValue ตัดให้ทั้งสองฝั่ง)
    ['99999', 'invalid'],
    ['', 'missing'], ['   ', 'missing'],
    ['9999', 'ok'], ['1', 'ok'],
    ['12345', 'invalid'], ['10000', 'invalid'], ['00012', 'invalid'], ['02', 'invalid'],
  ];
  for (const [text, expected] of table) {
    assert.equal(stateOf(text), expected, JSON.stringify(text));
    const view = linePackEditView(fg(SDS, { qty: 12, packQty: text }), SDS);
    assert.equal(view.value, text, `ช่องโชว์ตามที่พิมพ์ทุกตัวอักษร: ${JSON.stringify(text)}`);
    assert.equal(view.input, true);
    if (expected === 'invalid') {
      assert.equal(view.pending, true, `${text}: ยอดเป็นขีด`);
      assert.equal(view.formula, null, `${text}: ไม่มีสูตร`);
      assert.equal(quoteLinesPackView([fg(SDS, { qty: 12, packQty: text })], PRODUCTS).issues[0].code, 'invalid', `${text}: ด่านฝั่งจอตีกลับ`);
      assert.throws(() => normalizeManualLines([fg(SDS, { qty: 12, packQty: text })]), LinePackError, `${text}: เซิร์ฟเวอร์ตีกลับ`);
    }
  }
  assert.equal(stateOf(' 12 '), 'ok');
  assert.equal(normalizeManualLines([fg(SDS, { qty: 12, packQty: ' 12 ' })])[0].packQty, 12, 'เซิร์ฟเวอร์เก็บตัวเลข ไม่ใช่ข้อความที่มีช่องว่าง');
  // ทุกข้อความตัวเลขล้วน: ใช้ได้ ⇔ 1–9999 — และค่าที่จอว่าใช้ได้ เซิร์ฟเวอร์อ่านเป็นเลขเดียวกัน (ไม่มีค่าที่จอรับแต่เซิร์ฟเวอร์ตีกลับ หรือกลับกัน)
  for (let n = 0; n <= 10050; n += 1) {
    const state = stateOf(String(n));
    if (n >= 1 && n <= 9999) { assert.equal(state, 'ok', String(n)); assert.equal(packQtyValue(String(n)), n); } else assert.equal(state, 'invalid', String(n));
  }

  /* 🔴 พิมพ์ทีละปุ่ม: ช่องเก็บทุกปุ่ม ⇒ ค่าสุดท้ายในช่องคือสิ่งที่พิมพ์ ไม่ใช่เลขอื่น · ยอดของบรรทัดไม่เคยเป็นยอดของเลขที่ไม่ได้พิมพ์
     (จำลองช่องข้อความธรรมดา: แต่ละปุ่มต่อท้ายข้อความเดิม แล้วเซลล์ส่งข้อความทั้งก้อนเข้า onPatch — ไม่มีอะไรคั่นกลาง) */
  const typeKeys = (keys) => {
    let text = '';
    const trail = [];
    for (const key of keys) { text += key; trail.push([text, stateOf(text)]); }
    return trail;
  };
  assert.deepEqual(typeKeys(['0', '.', '5']), [['0', 'invalid'], ['0.', 'invalid'], ['0.5', 'invalid']], 'เดิมได้ 5 = ฿210,000.00 แทนการปฏิเสธ');
  assert.deepEqual(typeKeys(['1', '.', '5']), [['1', 'ok'], ['1.', 'invalid'], ['1.5', 'invalid']], 'เดิมได้ 15');
  assert.deepEqual(typeKeys(['2', '.', '0', '0']).at(-1), ['2.00', 'invalid'], 'เดิมได้ 200 = ฿8,400,000.00');
  assert.deepEqual(typeKeys(['1', '0', '0', '0', '0']).map(([, state]) => state), ['ok', 'ok', 'ok', 'ok', 'invalid'], 'เดิมได้ 1000');
  // ช่องมี 10 จะแก้เป็น 20: ลบเลข 1 (เหลือ "0" — ช่องเก็บไว้ สถานะ invalid) แล้วพิมพ์ 2 ข้างหน้า = "20" · เดิม: การลบถูกปฏิเสธ แล้ว 2 ไปต่อท้าย = 102
  assert.equal(stateOf('0'), 'invalid');
  assert.equal(stateOf('20'), 'ok');
  assert.equal(quoteLineNet(fg(SDS, { qty: 12, packQty: '20' })).lineTotal, 840000);
  // ยอดที่จอพูดขณะค่าผิด = ขีด (ไม่ใช่ยอดของ "คูณ 1" และไม่ใช่ยอดของเลขที่ตัดท่อน)
  for (const bad of ['0.5', '1.5', '2.00', '10000', '0']) {
    const view = quoteLinesPackView([fg(SDS, { qty: 12, packQty: bad })], PRODUCTS);
    assert.equal(view.pending, true, bad);
    assert.equal(view.rows[0].pending, true, bad);
  }

  // ไม่มีตัวกรอง/ค่าคงที่ความยาวให้ใครหยิบไปใส่ onChange หรือ maxLength อีก
  assert.equal('packInputText' in linePackEdit, false, 'ตัวกรองรายปุ่มถูกถอดแล้ว — ห้ามกลับมา');
  assert.equal('PACK_INPUT_MAX_LENGTH' in linePackEdit, false);
  assert.doesNotMatch(CODE, /maxLength|slice\(0|substring|parseInt|parseFloat|Math\.(?:floor|trunc|min|max)\(|\.replace\(|\.trim\(/, 'ไฟล์กฎฝั่งจอห้ามตัดท่อน/แปลง/กรองค่าของช่อง');
});

test('⭐ ค่าที่พิมพ์ใช้ไม่ได้: บอกช่วงใต้ช่องทันทีด้วยสีกลาง (hint) — แดง (note) หลังกดเท่านั้น · สองข้อความไม่ขึ้นพร้อมกัน', () => {
  const bad = fg(SDS, { qty: 12, packQty: '1.5' });
  const before = linePackEditView(bad, SDS);
  assert.deepEqual({ state: before.state, note: before.note, hint: before.hint, pending: before.pending },
    { state: 'invalid', note: null, hint: 'จำนวนเต็ม 1–9,999', pending: true });
  const after = linePackEditView(bad, SDS, { errorsShown: true });
  assert.deepEqual({ note: after.note, hint: after.hint }, { note: 'จำนวนเต็ม 1–9,999', hint: null });
  // สถานะอื่นไม่มี hint (ช่องว่างที่ต้องกรอกมีดอกจันอยู่แล้ว — ไม่ทักก่อนกด)
  for (const line of [fg(SDS, { qty: 12 }), fg(SDS, { qty: 12, packQty: '2' }), fg(CANDLE, { qty: 12, packQty: '2' }), fg(CANDLE, { qty: 12 })]) {
    assert.equal(linePackEditView(line, null).hint, null);
    assert.equal(linePackEditView(line, null, { errorsShown: true }).hint, null);
  }
  // ค่าผิดบนบรรทัดหมวดอื่น (ตัวเลขค้างแล้วถูกแก้เป็นค่าผิด) ก็บอกช่วง
  assert.equal(linePackEditView(fg(CANDLE, { qty: 12, packQty: '2x' }), CANDLE).hint, 'จำนวนเต็ม 1–9,999');
});

/* ═══ สถานะของบรรทัด ═══════════════════════════════════════════════════════════════════════════════════ */

test('linePackState: หมวดอย่างเดียว (A3 — กิโลกรัม/ชิ้นของหมวด 02-001 ก็ต้องกรอก) · บรรทัดพิมพ์เองตามหมวดที่เลือก · สินค้านอกลิสต์ถอดจากรหัสบนบรรทัด', () => {
  // บรรทัดสินค้าหมวด 02-001 ทุกหน่วยขาย
  for (const item of [SDS, OIL_KG, PART_PC]) {
    assert.equal(linePackState(fg(item), item), 'missing', item.saleUnit);
    assert.equal(linePackState(fg(item, { packQty: '' }), item), 'missing');
    assert.equal(linePackState(fg(item, { packQty: '2' }), item), 'ok');
    assert.equal(linePackState(fg(item, { packQty: 1 }), item), 'ok');
  }
  // หมวดอื่น
  assert.equal(linePackState(fg(CANDLE), CANDLE), 'none');
  assert.equal(linePackState(fg(CANDLE, { packQty: '' }), CANDLE), 'none');
  assert.equal(linePackState(fg(CANDLE, { packQty: '2' }), CANDLE), 'stray', 'ตัวเลขบนหมวดอื่น = stray (ยังต้องเห็น)');
  // บรรทัดพิมพ์เอง: ตามหมวดที่คนเลือก
  assert.equal(linePackState(typed()), 'none', 'ยังไม่เลือกหมวด');
  assert.equal(linePackState(typed({ metadata: { ...SDS_CATEGORY } })), 'missing');
  assert.equal(linePackState(typed({ metadata: { ...SDS_CATEGORY }, packQty: '3' })), 'ok');
  assert.equal(linePackState(typed({ metadata: { categoryCode: '01-003' }, packQty: '3' })), 'stray');
  assert.equal(linePackState(typed({ packQty: '3' })), 'stray');
  // บรรทัดสินค้าที่ยังไม่เลือกสินค้า
  assert.equal(linePackState({ _lineKind: 'product', productId: null, fgCode: null, qty: 1 }), 'none');
  // สินค้าไม่อยู่ในลิสต์ของหน้า (รออนุมัติ/พักใช้/ถูกลบ) ⇒ ถอดหมวดจากรหัส FG ที่ตรึงบนบรรทัด
  assert.equal(linePackState(fg(SDS), null), 'missing');
  assert.equal(linePackState(fg(CANDLE, { packQty: 2 }), null), 'stray');
  // รหัสของสินค้าตัวสดชนะรหัสบนบรรทัด (ทะเบียนย้ายสินค้าข้ามหมวดหลังบันทึก — ข้อจำกัดที่จดไว้ §12 C12)
  assert.equal(linePackState(fg(SDS, { packQty: 2 }), { ...SDS, fgCode: CANDLE.fgCode }), 'stray');
  assert.equal(linePackState(fg(CANDLE), { ...CANDLE, fgCode: SDS.fgCode }), 'missing');
  // ค่าที่ไม่ใช่เลขแพ็ค (ช่องเก็บตามที่พิมพ์ — ข้อความ · และตัวเลข/ค่าแปลกที่มาทางอื่น)
  for (const bad of ['0', 0, '1.5', 1.5, 'abc', 10000, '10000', true]) {
    assert.equal(linePackState(fg(SDS, { packQty: bad }), SDS), 'invalid', String(bad));
    assert.equal(linePackState(fg(CANDLE, { packQty: bad }), CANDLE), 'invalid', String(bad));
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (รีวิว 09/10 · มติเจ้าของ 08/10 ข้อ A4 + ข้อวินิจฉัย 5): เดิม `lineStoredUntouched(line)` ดู **ยอดอย่างเดียว**
   ทำสองหน้าที่ — (ก) ยอดบนจอยังเท่ายอดที่เก็บไหม (ตัดสิน "ยอดเดิม") (ข) บรรทัดนี้ยังไม่มีใครแตะไหม (ตัดสินว่าช่องว่างโชว์ยอดที่เก็บได้)
   ข้อ (ข) ผิดเมื่อบรรทัดเก็บเลขแพ็ค 1 ไว้: ลบเลขแล้วยอดแบบคูณ 1 เท่ายอดที่เก็บพอดี ⇒ วันนี้แยกเป็นสองตัว:
   `lineAmountAsStored(line)` = ข้อ (ก) (ยามเดิมทุกบรรทัดย้ายมาที่นี่) · `lineStoredUntouched(line, storedLine)` = ข้อ (ข) ตัดสินจากแถวที่เก็บ */
test('lineAmountAsStored: ตัวเลขบนจอยังให้ยอดที่เก็บ — แก้จำนวนแล้วไม่ใช่ · แก้กลับแล้วใช่อีก · บรรทัดใหม่ไม่ใช่ · คลาดได้ไม่ถึงครึ่งสตางค์', () => {
  const old = stored('L1', fg(SDS_S, { qty: 172 }), 498800);
  assert.equal(lineAmountAsStored(old), true);
  assert.equal(lineAmountAsStored({ ...old, qty: 4 }), false);
  assert.equal(lineAmountAsStored({ ...old, qty: 4, packQty: '43' }), true, '43 × 4 × 2,900 = ยอดเดิม');
  assert.equal(lineAmountAsStored({ ...old, qty: '172' }), true, 'ช่องจำนวนคืนข้อความก็ได้');
  assert.equal(lineAmountAsStored({ ...old, qty: 171 }), false);
  assert.equal(lineAmountAsStored(stored('L2', fg(SDS, { qty: 24, discountType: 'amount', discountValue: 14400 }), 69600, 14400)), true);
  assert.equal(lineAmountAsStored(fg(SDS, { qty: 12 })), false, 'บรรทัดใหม่ไม่มี lineTotal');
  assert.equal(lineAmountAsStored({ ...fg(SDS), lineTotal: null }), false);
  // 🪤 Number(null) = 0 — บรรทัดใหม่ที่ยอดคิดได้ 0 (ราคายังไม่กรอก) ต้องไม่ถูกอ่านเป็น "เก็บไว้แล้ว ยอด 0" (ไม่งั้นช่องว่างของมันได้ ฿0.00 แทนขีด)
  assert.equal(lineAmountAsStored({ qty: 1, unitPrice: 0, lineTotal: null }), false);
  assert.equal(lineAmountAsStored({ qty: 1, unitPrice: 0 }), false);
  assert.equal(linePackEditView(typed({ qty: 1, unitPrice: 0, lineTotal: null, metadata: { ...SDS_CATEGORY } })).pending, true);
  assert.equal(lineAmountAsStored({ ...fg(SDS), lineTotal: undefined }), false);
  // §12 C11: เทียบด้วยค่าคลาด ไม่ใช่ === (ฐานเก็บ numeric · JS คิด floating point)
  assert.equal(lineAmountAsStored({ qty: 3, unitPrice: 33.33, lineTotal: 99.99 }), true);
  assert.equal(lineAmountAsStored({ qty: 3, unitPrice: 33.33, lineTotal: 99.994 }), true);
  assert.equal(lineAmountAsStored({ qty: 3, unitPrice: 33.33, lineTotal: 100 }), false, 'ต่างหนึ่งสตางค์ = ถูกแก้แล้ว');
  assert.equal(lineAmountAsStored({ qty: 1, unitPrice: 0, lineTotal: 0 }), true);
});

test('🔴 lineStoredUntouched ตัดสินจากแถวที่เก็บ: เก็บไว้โดยไม่มีเลขแพ็ค + ยังอ่านได้เหมือนที่เก็บ — บรรทัดที่เก็บเลขแพ็ค 1 แล้วถูกลบเลข **ไม่ใช่**', () => {
  const old = stored('L1', fg(SDS_S, { qty: 172 }), 498800);
  assert.equal(lineStoredUntouched(old, old), true, 'ใบเก่าที่เพิ่งเปิดมาแก้');
  assert.equal(lineStoredUntouched({ ...old, _lineKind: 'product' }, old), true, 'คีย์ฝั่งจอ (_lineKind) ไม่เกี่ยว');
  assert.equal(lineStoredUntouched({ ...old, qty: 4 }, old), false, 'แก้จำนวนแล้ว');
  assert.equal(lineStoredUntouched({ ...old, qty: '172' }, old), true, 'แก้กลับแล้วใช่อีก');
  assert.equal(lineStoredUntouched({ ...old, packQty: '' }, old), true, 'พิมพ์แล้วลบ = กลับมาเหมือนที่เก็บ');
  assert.equal(lineStoredUntouched({ ...old, qty: 4, packQty: '43' }, old), false, 'มีเลขแพ็คแล้ว = ไม่ใช่บรรทัดที่ยังไม่แตะ (ยอดเท่าเดิมก็ตาม)');
  // ไม่มีแถวที่เก็บ (บรรทัดใหม่ · หน้าสร้าง · ผู้เรียกไม่ส่ง) = false เสมอ — ปลอดภัยไว้ก่อน: ช่องว่าง = ขีด
  assert.equal(lineStoredUntouched(old), false);
  assert.equal(lineStoredUntouched(old, null), false);
  assert.equal(lineStoredUntouched(fg(SDS, { qty: 12 }), null), false);

  /* 🐞 รีวิว 09/10 — เลขแพ็ค 1 (ที่คนขายกรอกกับงานเหมา/สินค้ากิโลกรัม · มติ A3): ลบเลขแล้ว ยอดแบบคูณ 1 = ยอดที่เก็บพอดี
     เดิม: ยอด ฿20,400.00 และยอดรวมยังขึ้นเหมือนกรอก 1 ไว้ให้ + คำแนะนำ "บันทึกไว้ก่อนมีช่อง…" (ไม่จริงสำหรับใบนี้) */
  const packOne = { id: 'L7', ...fg(OIL_KG, { qty: 12, packQty: 1, unit: 'เดือน' }), lineTotal: 20400, discountAmount: 0 };
  for (const emptied of ['', null, '   ']) {
    const cleared = { ...packOne, packQty: emptied };
    assert.equal(lineAmountAsStored(cleared), true, 'ยอดแบบคูณ 1 เท่ายอดที่เก็บ — นี่คือกับดัก');
    assert.equal(lineStoredUntouched(cleared, packOne), false, 'แถวที่เก็บมีเลขแพ็ค ⇒ ถูกแก้แล้ว');
    const view = linePackEditView(cleared, OIL_KG, { storedLine: packOne });
    assert.deepEqual({ state: view.state, pending: view.pending, storedAmount: view.storedAmount, formula: view.formula },
      { state: 'missing', pending: true, storedAmount: 'ยอดเดิม ฿20,400.00', formula: null });
    const table = quoteLinesPackView([cleared], PRODUCTS, { storedLines: [packOne] });
    assert.equal(table.pending, true, 'ยอดรวมของหน้าเป็นขีด');
    assert.equal(table.resplitHint, null, 'ใบนี้บันทึกพร้อมเลขแพ็ค — ไม่มีคำแนะนำของใบเก่า');
  }
  // เลขแพ็ค 2 (ที่เดิมถูกอยู่แล้วเพราะยอดต่าง) ยังถูก
  const packTwo = { id: 'L8', ...fg(SDS, { qty: 12, packQty: 2 }), lineTotal: 84000, discountAmount: 0 };
  const clearedTwo = linePackEditView({ ...packTwo, packQty: '' }, SDS, { storedLine: packTwo });
  assert.deepEqual({ pending: clearedTwo.pending, storedAmount: clearedTwo.storedAmount }, { pending: true, storedAmount: 'ยอดเดิม ฿84,000.00' });

  /* บรรทัดพิมพ์เองที่เก็บไว้ในหมวดอื่น แล้วเพิ่งถูกเลือกเข้าหมวด 02-001: ถูกแก้แล้ว ⇒ ขีด + ยอดเดิม · ไม่ใช่ "ใบเก่า" */
  const typedStored = { id: 'L9', ...typed({ qty: 6, unitPrice: 1200, metadata: { categoryCode: '01-003', categoryName: 'เทียนหอม' } }), packQty: null, lineTotal: 7200, discountAmount: 0 };
  const row = { mainCategoryCode: '02', typeCode: '001', nameTh: 'ระบบกระจายกลิ่น', nameEn: 'SDS' };
  const moved = { ...typedStored, ...manualLineCategoryPatch(typedStored, row) };
  assert.equal(linePackState(moved), 'missing');
  assert.equal(lineStoredUntouched(moved, typedStored), false);
  const movedView = quoteLinesPackView([moved], PRODUCTS, { storedLines: [typedStored] });
  assert.deepEqual({ pending: movedView.rows[0].pending, storedAmount: movedView.rows[0].storedAmount, resplitHint: movedView.resplitHint },
    { pending: true, storedAmount: 'ยอดเดิม ฿7,200.00', resplitHint: null });
  // บรรทัดพิมพ์เองที่เก็บไว้ในหมวด 02-001 อยู่แล้ว (ใบเก่า 15 บรรทัดของจริง) = บรรทัดเก่า · ย้ายหมวดออกแล้วกลับ = กลับมาเหมือนที่เก็บ
  const typedOld = { id: 'L10', ...typed({ qty: 12, unitPrice: 3500, metadata: { ...SDS_CATEGORY } }), packQty: null, lineTotal: 42000, discountAmount: 0 };
  assert.equal(lineStoredUntouched(typedOld, typedOld), true);
  const away = { ...typedOld, ...manualLineCategoryPatch(typedOld, null) };
  const back = { ...away, ...manualLineCategoryPatch(away, row) };
  assert.equal(lineStoredUntouched(back, typedOld), true);
  // เปลี่ยนสินค้าเป็นอีกตัวของหมวด 02-001 ที่ราคาเท่ากัน: ยอดเท่าเดิม แต่ไม่ใช่บรรทัดเดิม
  const twin = product('P-TWIN', 'FG-278-02-001-0799', 'แพ็คเกจ', 2900);
  const swapped = quoteLineFromProduct(old, twin);
  assert.equal(lineAmountAsStored(swapped), true);
  assert.equal(lineStoredUntouched(swapped, old), false);
});

/* ═══ มุมมองของหนึ่งบรรทัด ═════════════════════════════════════════════════════════════════════════════ */

test('⭐ ตัวอย่างของเจ้าของ: 2 แพ็ค × 12 เดือน × 3,500 = 84,000 · สูตรใต้ยอด · ส่วนลด 14,400 บาท = ลด 600.00 ต่อแพ็คต่อเดือน', () => {
  const line = fg(SDS, { packQty: '2', qty: 12 });
  const view = linePackEditView(line, SDS);
  assert.deepEqual(view, {
    state: 'ok', input: true, required: true, value: '2', pending: false, note: null, hint: null,
    formula: '2 × 12 × 3,500.00', discountCaption: null, storedAmount: null,
  });
  assert.equal(quoteLineNet(line).lineTotal, 84000);
  const discounted = { ...line, discountType: 'amount', discountValue: 14400 };
  assert.equal(quoteLineNet(discounted).lineTotal, 69600, 'ส่วนลดบาทหักจากยอดทั้งรายการ ไม่คูณแพ็ค (A5)');
  assert.equal(linePackEditView(discounted, SDS).discountCaption, '= ลด 600.00 ต่อแพ็คต่อเดือน');
});

test('🔴 ช่องว่างบนบรรทัดที่ต้องกรอก = ยังไม่มียอด (ขีด) — ยกเว้นบรรทัดเก่าที่ยังไม่มีใครแตะ ซึ่งคงยอดที่เก็บไว้ · ไม่มีอะไรแดงก่อนกด', () => {
  // บรรทัดใหม่: ไม่มีค่าตั้งต้น ⇒ pending
  const fresh = linePackEditView(fg(SDS, { qty: 12 }), SDS);
  assert.equal(fresh.state, 'missing');
  assert.equal(fresh.input, true);
  assert.equal(fresh.value, '', 'ช่องว่าง — ไม่มีค่าตั้งต้น');
  assert.equal(fresh.pending, true);
  assert.equal(fresh.note, null, 'ยังไม่กด = ไม่แดง');
  assert.equal(fresh.formula, null);
  assert.equal(fresh.storedAmount, null, 'บรรทัดใหม่ไม่มียอดเดิม');
  // กดแล้ว: ข้อความใต้ช่อง
  assert.equal(linePackEditView(fg(SDS, { qty: 12 }), SDS, { errorsShown: true }).note, 'ต้องกรอก');
  assert.equal(linePackEditView(fg(SDS, { qty: 12, packQty: '0' }), SDS, { errorsShown: true }).note, 'จำนวนเต็ม 1–9,999');
  assert.equal(linePackEditView(fg(CANDLE, { qty: 12, packQty: '2' }), CANDLE, { errorsShown: true }).note, 'ลบตัวเลขนี้ออก');
  // บรรทัดที่ไม่มีข้อ ไม่แดงแม้อยู่ในโหมดแดง
  assert.equal(linePackEditView(fg(SDS, { qty: 12, packQty: '2' }), SDS, { errorsShown: true }).note, null);
  assert.equal(linePackEditView(fg(CANDLE, { qty: 12 }), CANDLE, { errorsShown: true }).note, null);
  // ไม่ส่ง errorsShown = ไม่มีข้อความทุกสถานะ (แดงหลังกดเท่านั้น)
  for (const line of [fg(SDS), fg(SDS, { packQty: '0' }), fg(CANDLE, { packQty: '2' }), typed({ metadata: { ...SDS_CATEGORY } })]) {
    assert.equal(linePackEditView(line, null).note, null);
  }

  // บรรทัดเก่า 172 × 2,900 ที่เปิดมาแก้: ช่องว่าง · ยอดที่เก็บไว้ยังโชว์ · ไม่มี "ยอดเดิม" (ยอดบนจอคือยอดเดิมอยู่แล้ว)
  const old = stored('L1', fg(SDS_S, { qty: 172 }), 498800);
  const untouched = linePackEditView(old, SDS_S, { storedLine: old });
  // ผู้เรียกที่ไม่ส่งแถวที่เก็บ (หน้าสร้างใบ) ไม่มีบรรทัดเก่า: ช่องว่าง = ขีดเสมอ
  assert.equal(linePackEditView(old, SDS_S).pending, true);
  assert.deepEqual({ state: untouched.state, value: untouched.value, pending: untouched.pending, storedAmount: untouched.storedAmount, formula: untouched.formula },
    { state: 'missing', value: '', pending: false, storedAmount: null, formula: null });
  assert.equal(linePackEditView(old, SDS_S, { errorsShown: true, storedLine: old }).note, 'ต้องกรอก', 'กดบันทึกแล้วบรรทัดเก่าก็ถูกทัก');
  // แก้จำนวนเป็น 4 ก่อน: ยอดเป็นขีด + ยอดเดิม
  const halfway = linePackEditView({ ...old, qty: 4 }, SDS_S, { storedLine: old });
  assert.equal(halfway.pending, true);
  assert.equal(halfway.storedAmount, 'ยอดเดิม ฿498,800.00');
  // กรอก 43: ยอดกลับมาเท่าเดิม · สูตร · ไม่มียอดเดิม
  const split = { ...old, qty: 4, packQty: '43' };
  const done = linePackEditView(split, SDS_S, { storedLine: old });
  assert.deepEqual({ state: done.state, pending: done.pending, formula: done.formula, storedAmount: done.storedAmount },
    { state: 'ok', pending: false, formula: '43 × 4 × 2,900.00', storedAmount: null });
  assert.equal(quoteLineNet(split).lineTotal, 498800);
  // แยกผิด (แพ็ค 2 แต่จำนวนยัง 24): ยอดเป็นสองเท่า — เห็นสูตรและยอดเดิมคู่กัน
  const wrong = { ...stored('L2', fg(SDS, { qty: 24, discountType: 'amount', discountValue: 14400 }), 69600, 14400), packQty: '2' };
  const doubled = linePackEditView(wrong, SDS);
  assert.equal(quoteLineNet(wrong).lineTotal, 153600);
  assert.deepEqual({ formula: doubled.formula, storedAmount: doubled.storedAmount, pending: doubled.pending },
    { formula: '2 × 24 × 3,500.00', storedAmount: 'ยอดเดิม ฿69,600.00', pending: false });
  // แพ็ค 1 กับจำนวนที่พับไว้: ยอดเท่าเดิม (ระบบไม่เดาเลขให้ — มติ A4)
  assert.equal(linePackEditView({ ...old, packQty: '1' }, SDS_S).storedAmount, null);
  assert.equal(linePackEditView({ ...old, packQty: '1' }, SDS_S).formula, '1 × 172 × 2,900.00');
  // บรรทัดที่มีเลขแพ็คเก็บไว้แล้ว แล้วถูกแก้จำนวน: ยอดเดิมขึ้นเทียบ
  const packed = { id: 'L9', ...fg(SDS, { qty: 12, packQty: 2 }), lineTotal: 84000, discountAmount: 0 };
  assert.equal(linePackEditView(packed, SDS).storedAmount, null);
  assert.equal(linePackEditView({ ...packed, qty: 6 }, SDS).storedAmount, 'ยอดเดิม ฿84,000.00');
  // ค่าที่ใช้ไม่ได้: ไม่มียอด
  assert.equal(linePackEditView(fg(SDS, { packQty: '0' }), SDS).pending, true);
  assert.equal(linePackEditView(fg(SDS, { packQty: '0' }), SDS).formula, null);
});

test('🔴 ตัวเลขบนบรรทัดที่ไม่ใช่หมวด 02-001 (stray) ยังเป็นช่องพร้อมสูตร — ตัวคูณที่คูณเงินอยู่ห้ามมองไม่เห็น · บรรทัดอื่นไม่ได้ช่อง', () => {
  const stray = fg(CANDLE, { qty: 12, packQty: 2 });
  const view = linePackEditView(stray, CANDLE);
  assert.deepEqual({ state: view.state, input: view.input, required: view.required, value: view.value, pending: view.pending, formula: view.formula },
    { state: 'stray', input: true, required: false, value: '2', pending: false, formula: '2 × 12 × 250.00' });
  assert.equal(quoteLineNet(stray).lineTotal, 6000, 'เลขนั้นคูณเงินจริง');
  assert.equal(view.storedAmount, null);
  const none = linePackEditView(fg(CANDLE, { qty: 12 }), CANDLE);
  assert.deepEqual(none, {
    state: 'none', input: false, required: false, value: '', pending: false, note: null, hint: null, formula: null, discountCaption: null, storedAmount: null,
  });
  // บรรทัดพิมพ์เองที่เลือกหมวด 02-001: ช่องว่างขึ้น ไม่มีค่าตั้งต้น
  const manual = linePackEditView(typed({ qty: 12, unitPrice: 3500, metadata: { ...SDS_CATEGORY } }));
  assert.deepEqual({ state: manual.state, input: manual.input, required: manual.required, value: manual.value, pending: manual.pending },
    { state: 'missing', input: true, required: true, value: '', pending: true });
});

test('สูตรใต้ยอดสร้างจากจำนวนแบบที่สูตรเงินอ่าน: จำนวนว่าง = 1 (ไม่ใช่ 0) · สามตัวเลขของสูตรคูณกันได้ยอดก่อนลดพอดี', () => {
  // จำนวนว่าง: quoteLineNet นับเป็น 1 — ตัวช่วยฝั่งอ่านของงวด PR-2 จะพิมพ์ 0 ถ้าป้อนแถวดิบ (แถวที่เก็บไว้ไม่มีจำนวนว่าง)
  const blank = fg(SDS, { packQty: '2', qty: '' });
  assert.equal(quoteLineNet(blank).lineTotal, 7000);
  assert.equal(linePackEditView(blank, SDS).formula, '2 × 1 × 3,500.00');
  assert.equal(linePackEditView(fg(SDS, { packQty: '2', qty: null }), SDS).formula, '2 × 1 × 3,500.00');
  assert.equal(linePackEditView(fg(SDS, { packQty: '2', qty: 0 }), SDS).formula, '2 × 0 × 3,500.00');
  assert.equal(linePackEditView(typed({ packQty: '3', qty: 6, unitPrice: '', metadata: { ...SDS_CATEGORY } })).formula, '3 × 6 × 0.00');
  const number = (text) => Number(text.replace(/,/g, ''));
  for (const packQty of ['1', '2', '43', '9999']) {
    for (const qty of ['', 0, 1, 4, 12, 1.5, 120]) {
      for (const unitPrice of ['', 0, 2900, 3500, 33.33, 207000]) {
        const line = fg(SDS, { packQty, qty, unitPrice });
        const [a, b, c] = linePackEditView(line, SDS).formula.split(' × ').map(number);
        assert.equal(Math.round(a * b * c * 100) / 100, quoteLineNet(line).gross, JSON.stringify({ packQty, qty, unitPrice }));
      }
    }
  }
});

test('⭐ §12 C7 คำกำกับส่วนลด: เฉพาะส่วนลดบาทบนบรรทัดที่มีเลขแพ็ค · จากส่วนลดที่หักจริง · "=" เมื่อหารลงตัวสองตำแหน่ง ไม่งั้น "≈" · หน่วย 0 ไม่หาร', () => {
  const caption = (over, item = SDS) => linePackEditView(fg(item, over), item).discountCaption;
  assert.equal(caption({ packQty: '2', qty: 12, discountType: 'amount', discountValue: 14400 }), '= ลด 600.00 ต่อแพ็คต่อเดือน');
  // 100.10 / 7 = 14.299999999999999 ใน floating point — ต้องเป็น "=" 14.30 (นับทศนิยมของผลหารตรง ๆ จะได้ "≈")
  assert.equal(100.10 / 7 === 14.3, false);
  assert.equal(caption({ packQty: '7', qty: 1, discountType: 'amount', discountValue: 100.10 }), '= ลด 14.30 ต่อแพ็คต่อเดือน');
  /* ผลหารที่ลงตัวพอดีแต่ floating point เก็บเศษไว้ (2.20 / 2 × 100 = 110.00000000000001 · 1.14 / 2 × 100 = 56.99999999999999) — ยังต้องเป็น "=" */
  assert.equal(Number.isInteger((2.2 / 2) * 100), false);
  assert.equal(caption({ packQty: '2', qty: 1, discountType: 'amount', discountValue: 2.2 }), '= ลด 1.10 ต่อแพ็คต่อเดือน');
  assert.equal(caption({ packQty: '1', qty: 2, discountType: 'amount', discountValue: 1.14 }), '= ลด 0.57 ต่อแพ็คต่อเดือน');
  assert.equal(caption({ packQty: '3', qty: 1, discountType: 'amount', discountValue: 1000 }), '≈ ลด 333.33 ต่อแพ็คต่อเดือน');
  assert.equal(caption({ packQty: '43', qty: 12, unitPrice: 12500, discountType: 'amount', discountValue: 142000 }), '≈ ลด 275.19 ต่อแพ็คต่อเดือน');
  // จำนวน 0 = หน่วย 0 ⇒ ไม่มีคำกำกับ (ไม่หารด้วยศูนย์) — ยอดก่อนลดเป็น 0 ส่วนลดที่หักจริงจึงเป็น 0 ด้วย: สองยามกันกรณีเดียวกัน
  assert.equal(caption({ packQty: '2', qty: 0, discountType: 'amount', discountValue: 500 }), null);
  assert.equal(quoteLineNet(fg(SDS, { packQty: '2', qty: 0, discountType: 'amount', discountValue: 500 })).discountAmount, 0);
  assert.doesNotMatch(String(caption({ packQty: '2', qty: 0, discountType: 'amount', discountValue: 500 })), /Infinity|NaN|∞/);
  // จำนวนว่าง = 1
  assert.equal(caption({ packQty: '2', qty: '', discountType: 'amount', discountValue: 500 }), '= ลด 250.00 ต่อแพ็คต่อเดือน');
  // ส่วนลดเกินยอดของบรรทัด: สูตรตัดที่ยอด ⇒ คำกำกับคิดจากที่หักจริง ไม่ใช่ตัวเลขที่พิมพ์
  assert.equal(caption({ packQty: '2', qty: 12, discountType: 'amount', discountValue: 999999 }), '= ลด 3,500.00 ต่อแพ็คต่อเดือน');
  // เปอร์เซ็นต์ · ไม่ลด · ส่วนลด 0 = ไม่มี
  assert.equal(caption({ packQty: '2', qty: 12, discountType: 'percent', discountValue: 10 }), null);
  assert.equal(caption({ packQty: '2', qty: 12, discountType: null, discountValue: 14400 }), null);
  assert.equal(caption({ packQty: '2', qty: 12, discountType: 'amount', discountValue: 0 }), null);
  assert.equal(caption({ packQty: '2', qty: 12, discountType: 'amount', discountValue: '' }), null);
  // ต่อหน่วยไม่ถึงหนึ่งสตางค์ = ไม่มี (ไม่พิมพ์ "ลด 0.00")
  assert.equal(caption({ packQty: '9999', qty: 120, discountType: 'amount', discountValue: 1 }), null);
  // ไม่มีเลขแพ็ค / ค่าใช้ไม่ได้ = ไม่มี
  assert.equal(caption({ qty: 12, discountType: 'amount', discountValue: 14400 }), null);
  assert.equal(caption({ packQty: '0', qty: 12, discountType: 'amount', discountValue: 14400 }), null);
  assert.equal(caption({ qty: 12, discountType: 'amount', discountValue: 100 }, CANDLE), null, 'บรรทัดหมวดอื่นไม่มีคำกำกับ');
  // stray: ตัวเลขคูณเงินอยู่ ⇒ คำกำกับตามจริง
  assert.equal(caption({ packQty: 2, qty: 12, discountType: 'amount', discountValue: 240 }, CANDLE), '= ลด 10.00 ต่อแพ็คต่อเดือน');
  // เครื่องหมาย "=" แปลว่า ตัวเลขที่โชว์ × หน่วย = ส่วนลดที่หักจริง (คลาดไม่ถึงครึ่งสตางค์) — ไล่ตรวจทั้งกริด
  for (const packQty of [1, 2, 3, 7, 43]) {
    for (const qty of [1, 4, 12]) {
      for (const discountValue of [1, 100, 100.10, 600, 1000, 14400, 21600]) {
        const line = fg(SDS, { packQty, qty, discountType: 'amount', discountValue });
        const text = linePackEditView(line, SDS).discountCaption;
        if (!text) continue;
        const each = Number(text.match(/ลด ([\d,.]+) /)[1].replace(/,/g, ''));
        const exact = Math.abs(each * packQty * qty - quoteLineNet(line).discountAmount) < 0.005;
        assert.equal(text.startsWith('='), exact, `${packQty} × ${qty} ลด ${discountValue}: ${text}`);
        assert.equal(text.startsWith('≈'), !exact);
      }
    }
  }
});

/* ═══ ทั้งตาราง ════════════════════════════════════════════════════════════════════════════════════════ */

test('quoteLinesPackView: คอลัมน์ขึ้นเมื่อมีบรรทัดที่ได้ช่อง · ยอดรวมเป็นขีดเมื่อมีบรรทัดที่ยังไม่มียอด · คำแนะนำของใบเก่า', () => {
  // ใบที่ไม่มีบรรทัดหมวด 02-001: ไม่มีคอลัมน์ ไม่มีข้อ — ตารางเดิม
  const plain = quoteLinesPackView([fg(CANDLE, { qty: 50 }), typed({ qty: 1, unitPrice: 3000 })], PRODUCTS);
  assert.deepEqual({ showColumn: plain.showColumn, pending: plain.pending, issues: plain.issues, message: plain.message, resplitHint: plain.resplitHint },
    { showColumn: false, pending: false, issues: [], message: '', resplitHint: null });
  assert.equal(plain.rows.length, 2);
  // ตารางว่าง
  assert.deepEqual(quoteLinesPackView([], PRODUCTS), { rows: [], showColumn: false, pending: false, issues: [], message: '', resplitHint: null });
  assert.deepEqual(quoteLinesPackView([], PRODUCTS, { storedLines: [] }).rows, []);
  assert.equal(quoteLinesPackView(undefined).showColumn, false);

  // ใบใหม่: บรรทัดหมวด 02-001 หนึ่งบรรทัดยังว่าง
  const fresh = quoteLinesPackView([fg(CANDLE, { qty: 50 }), fg(SDS, { qty: 12 })], PRODUCTS);
  assert.equal(fresh.showColumn, true);
  assert.equal(fresh.pending, true);
  assert.deepEqual(fresh.issues, [{ index: 1, row: 2, code: 'required' }]);
  assert.equal(fresh.message, 'รายการ 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ');
  assert.equal(fresh.resplitHint, null, 'ใบใหม่ไม่มีคำแนะนำของใบเก่า');
  assert.deepEqual(fresh.rows.map((row) => row.input), [false, true]);
  assert.deepEqual(fresh.rows.map((row) => row.note), [null, null], 'ไม่ส่ง errorsShown = ไม่มีข้อความแดง');
  assert.deepEqual(quoteLinesPackView([fg(CANDLE), fg(SDS)], PRODUCTS, { errorsShown: true }).rows.map((row) => row.note), [null, 'ต้องกรอก']);

  // กรอกครบ: คอลัมน์ยังอยู่ · ไม่มีข้อ · ยอดกลับมา
  const filled = quoteLinesPackView([fg(CANDLE, { qty: 50 }), fg(SDS, { qty: 12, packQty: '2' })], PRODUCTS);
  assert.deepEqual({ showColumn: filled.showColumn, pending: filled.pending, issues: filled.issues }, { showColumn: true, pending: false, issues: [] });

  // ใบเก่าที่เปิดมาแก้: ช่องว่าง · ยอดยังอยู่ (ไม่ pending) · มีคำแนะนำ · ด่านยังทักทุกบรรทัด
  const oldLines = [
    stored('L1', fg(SDS_S, { qty: 172 }), 498800),
    stored('L2', fg(SDS, { qty: 24, discountType: 'amount', discountValue: 14400 }), 69600, 14400),
    stored('L3', fg(CANDLE, { qty: 50 }), 12500),
  ];
  const old = quoteLinesPackView(oldLines, PRODUCTS, { storedLines: oldLines });
  assert.equal(old.showColumn, true);
  assert.equal(old.pending, false, 'ยอดของใบเก่าที่ยังไม่มีใครแตะยังโชว์');
  assert.equal(old.resplitHint, LINE_PACK_EDIT_TEXT.resplitHint);
  assert.equal(old.message, 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ');
  assert.deepEqual(old.rows.map((row) => row.state), ['missing', 'missing', 'none']);
  // แก้จำนวนของบรรทัดแรก: ยอดรวมเป็นขีดจนกว่าจะกรอกเลขแพ็ค · คำแนะนำยังอยู่ (บรรทัดที่สองยังไม่ถูกแตะ)
  const editing = quoteLinesPackView([{ ...oldLines[0], qty: 4 }, oldLines[1], oldLines[2]], PRODUCTS, { storedLines: oldLines });
  assert.deepEqual(editing.rows.map((row) => row.pending), [true, false, false], 'แถวที่แก้เป็นขีด · แถวเก่าที่ยังไม่แตะคงยอด');
  // ไม่ส่งแถวที่เก็บ = ไม่มีบรรทัดเก่า (ปลอดภัยไว้ก่อน): ทุกช่องว่างเป็นขีด ไม่มีคำแนะนำ
  const noStore = quoteLinesPackView(oldLines, PRODUCTS);
  assert.deepEqual({ pending: noStore.pending, resplitHint: noStore.resplitHint }, { pending: true, resplitHint: null });
  assert.equal(editing.pending, true);
  assert.equal(editing.resplitHint, LINE_PACK_EDIT_TEXT.resplitHint);
  // แยกครบทั้งสองบรรทัด: ไม่มีข้อ ไม่มีคำแนะนำ ยอดรวมเท่าเดิม
  const resplit = [{ ...oldLines[0], qty: 4, packQty: '43' }, { ...oldLines[1], qty: 12, packQty: '2' }, oldLines[2]];
  const after = quoteLinesPackView(resplit, PRODUCTS, { storedLines: oldLines });
  assert.deepEqual({ pending: after.pending, issues: after.issues, resplitHint: after.resplitHint }, { pending: false, issues: [], resplitHint: null });
  assert.equal(quoteTotals(resplit, { vatRate: 7 }).totalAmount, quoteTotals(oldLines, { vatRate: 7 }).totalAmount);

  /* แถวที่เก็บจับคู่ด้วย **id** ไม่ใช่ตำแหน่ง: ลบแถวแรก / แทรกแถวใหม่ข้างบน / สลับลำดับ แล้วแถวเก่าที่เหลือยังคงยอดที่เก็บของตัวเอง */
  const afterDelete = quoteLinesPackView([oldLines[1], oldLines[2]], PRODUCTS, { storedLines: oldLines });
  assert.deepEqual(afterDelete.rows.map((row) => [row.state, row.pending]), [['missing', false], ['none', false]]);
  assert.equal(afterDelete.resplitHint, LINE_PACK_EDIT_TEXT.resplitHint);
  const withNewOnTop = quoteLinesPackView([fg(SDS, { qty: 12 }), ...oldLines], PRODUCTS, { storedLines: oldLines });
  assert.deepEqual(withNewOnTop.rows.map((row) => row.pending), [true, false, false, false]);
  const reordered = quoteLinesPackView([oldLines[1], oldLines[0], oldLines[2]], PRODUCTS, { storedLines: oldLines });
  assert.deepEqual(reordered.rows.map((row) => row.pending), [false, false, false]);
  // แถวที่เก็บซึ่งไม่มี id ตรงกับบรรทัดบนจอ (บรรทัดที่ไม่ได้มาจากใบนี้) = ไม่ใช่บรรทัดเก่า
  assert.equal(quoteLinesPackView([{ ...oldLines[0], id: 'OTHER' }], PRODUCTS, { storedLines: oldLines }).rows[0].pending, true);
  // stray อย่างเดียว: คอลัมน์ขึ้น (ตัวเลขต้องเห็น) และด่านทักว่าใช้ไม่ได้กับหมวดนี้
  const strayOnly = quoteLinesPackView([fg(CANDLE, { qty: 12, packQty: 2 })], PRODUCTS);
  assert.equal(strayOnly.showColumn, true);
  assert.deepEqual(strayOnly.issues, [{ index: 0, row: 1, code: 'not_allowed' }]);
  assert.equal(strayOnly.rows.some((row) => row.required), false, 'ไม่มีบรรทัดที่ต้องกรอก ⇒ หัวคอลัมน์ไม่มีดอกจัน');
});

test('🔴 ทำไมยอดรวมต้องเป็นขีดขณะยังมีช่องว่าง: สูตรกลางนับช่องว่างเป็นคูณ 1 — โชว์ยอดนั้น = ค่าตั้งต้นเงียบว่า "หนึ่งแพ็ค"', () => {
  const lines = [fg(SDS, { qty: 12 })];
  assert.equal(quoteTotals(lines, { vatRate: 7 }).totalAmount, 44940, 'ตัวเลขที่จะขึ้นถ้าไม่เป็นขีด');
  assert.equal(quoteLinesPackView(lines, PRODUCTS).pending, true);
});

test('🔴 จอ ⊇ เซิร์ฟเวอร์: ทุกข้อที่เซิร์ฟเวอร์จะตีกลับ (ตัว normalize + ด่านบนบรรทัดชุดสุดท้าย) จอทักก่อนด้วยเลขรายการเดียวกัน · ไม่มีจำนวน 0 = เท่ากันพอดี', () => {
  /* ทางของเซิร์ฟเวอร์ตอนบันทึก (PATCH · สร้างใบ): normalizeManualLines → linePackIssues(…, { numbering: 'submitted' })
     หมวดฝั่งเซิร์ฟเวอร์ถอดจากรหัส FG บนบรรทัด (หลัง sync ทะเบียน) — ชุดนี้รหัสบนบรรทัดตรงกับสินค้าในลิสต์ */
  const serverIssues = (lines) => {
    try {
      const normalized = normalizeManualLines(lines);
      return linePackIssues(normalized, { numbering: 'submitted' }).map(({ row, code }) => `${row}:${code}`);
    } catch (error) {
      assert.ok(error instanceof LinePackError, String(error));
      return error.issues.map(({ row, code }) => `${row}:${code}`);
    }
  };
  const clientIssues = (lines) => quoteLinesPackView(lines, PRODUCTS).issues.map(({ row, code }) => `${row}:${code}`);
  const shapes = [
    (over) => fg(SDS, over), (over) => fg(OIL_KG, over), (over) => fg(CANDLE, over),
    (over) => typed({ ...over, unitPrice: 100, metadata: { ...SDS_CATEGORY } }), (over) => typed({ ...over, unitPrice: 100 }),
  ];
  const packs = ['', null, '2', 1];
  const qtys = [0, '', 12];
  const cells = shapes.flatMap((shape) => packs.flatMap((packQty) => qtys.map((qty) => ({ shape, packQty, qty }))));
  let lists = 0; let withZero = 0; let equal = 0; let flagged = 0;
  /* ทุกคู่ของบรรทัด (60 × 60) + แทรกบรรทัดกลางหนึ่งแบบ ⇒ เลขรายการหลังบรรทัดที่ถูกตัดถูกทดสอบจริง */
  for (const a of cells) {
    for (const b of cells) {
      const lines = [a.shape({ packQty: a.packQty, qty: a.qty }), fg(CANDLE, { qty: 0 }), b.shape({ packQty: b.packQty, qty: b.qty })];
      const server = serverIssues(lines);
      const client = clientIssues(lines);
      for (const issue of server) assert.ok(client.includes(issue), `เซิร์ฟเวอร์ทัก ${issue} แต่จอไม่ทัก: ${JSON.stringify(lines.map((l) => [l.fgCode, l.packQty, l.qty]))}`);
      lists += 1; withZero += 1; flagged += server.length;
      const noZero = [a.shape({ packQty: a.packQty, qty: a.qty || 12 }), b.shape({ packQty: b.packQty, qty: b.qty || 12 })];
      assert.deepEqual(clientIssues(noZero), serverIssues(noZero), JSON.stringify(noZero.map((l) => [l.fgCode, l.packQty, l.qty])));
      lists += 1; equal += 1;
    }
  }
  assert.equal(lists, 2 * cells.length * cells.length);
  assert.ok(withZero === 3600 && equal === 3600 && flagged > 1000, JSON.stringify({ withZero, equal, flagged }));
  // ตัวอย่างที่เลขรายการเคยเพี้ยน: [แพ็ค 2, จำนวน 0, ไม่มีแพ็ค] — เซิร์ฟเวอร์และจอชี้ "รายการ 3" ทั้งคู่ · จอทักบรรทัดจำนวน 0 เพิ่ม (รายการ 2)
  const sample = [fg(SDS, { qty: 12, packQty: '2' }), fg(SDS, { qty: 0 }), fg(SDS, { qty: 12 })];
  assert.deepEqual(serverIssues(sample), ['3:required']);
  assert.deepEqual(clientIssues(sample), ['2:required', '3:required']);
  // ค่าที่ใช้ไม่ได้ (ช่องเก็บตามที่พิมพ์ — "1.5" · "0" พิมพ์ได้จริง): ตัว normalize โยนก่อน — จอมีข้อเดียวกันและมากกว่า
  for (const bad of ['0', '1.5', '0.5', '2.00', '10000', 10000, 'abc', '๒']) {
    const lines = [fg(SDS, { qty: 12, packQty: bad }), fg(SDS, { qty: 12 }), fg(CANDLE, { qty: 1, packQty: '2' })];
    assert.deepEqual(serverIssues(lines), ['1:invalid']);
    assert.deepEqual(clientIssues(lines), ['1:invalid', '2:required', '3:not_allowed']);
  }
});

/* ═══ แถบแจ้งของหน้า — คิดสด ═══════════════════════════════════════════════════════════════════════════ */

test('⭐ §12 C5 แถบแจ้งคิดสดจากบรรทัดปัจจุบัน: แก้แถว 1 แล้วเหลือแถว 2 · ลบแถว 1 แล้วแถวที่เหลือกลายเป็นแถว 1 · แก้ครบ = ไม่มีแถบ · ยังไม่กด = ไม่มีแถบ', () => {
  const view = (lines) => quoteLinesPackView(lines, PRODUCTS);
  const two = [fg(SDS, { qty: 12 }), fg(SDS_S, { qty: 4 }), fg(CANDLE, { qty: 1 })];
  // ยังไม่กด: ไม่มีแถบ แม้มีข้อค้าง
  assert.equal(packGateNotice(view(two), null), null);
  assert.equal(packGateNotice(view(two), undefined), null);
  assert.equal(packGateNotice(view(two), ''), null);
  // กดบันทึก
  assert.deepEqual(packGateNotice(view(two), 'save'), { text: 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ', action: 'save' });
  // แก้แถว 1 ⇒ ข้อความชี้แถว 2 เท่านั้น
  const fixedFirst = [{ ...two[0], packQty: '2' }, two[1], two[2]];
  assert.equal(packGateNotice(view(fixedFirst), 'save').text, 'รายการ 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ');
  // ลบแถว 1 ⇒ แถวที่เคยเป็น 2 คือแถว 1 แล้ว
  const removedFirst = [two[1], two[2]];
  assert.equal(packGateNotice(view(removedFirst), 'save').text, 'รายการ 1: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ');
  // แก้ครบ ⇒ ไม่มีแถบ
  assert.equal(packGateNotice(view([{ ...two[0], packQty: '2' }, { ...two[1], packQty: '43' }, two[2]]), 'save'), null);
  // ยื่นอนุมัติ / อนุมัติ: ข้อความของด่านพร้อมปุ่มที่คนนั้นมี — ตัวเดียวกับที่เซิร์ฟเวอร์ตอบ
  const oldLines = [stored('L1', fg(SDS_S, { qty: 172 }), 498800)];
  for (const action of ['submit', 'approve', 'approveOwn']) {
    assert.deepEqual(packGateNotice(view(oldLines), action), { text: linePackGateMessage(view(oldLines).issues, action), action });
  }
  assert.equal(packGateNotice(view(oldLines), 'submit').text,
    'รายการ 1: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “แก้ไขข้อมูล” แล้วกรอกให้ครบก่อนยื่นอนุมัติ');
  assert.equal(packGateNotice(view(oldLines), 'approve').text.endsWith(LINE_PACK_TEXT.beforeApprove), true);
  assert.equal(packGateNotice(view(oldLines), 'approveOwn').text.endsWith(LINE_PACK_TEXT.beforeApproveOwn), true);
  // ตารางเปิดแก้อยู่: ข้อความแบบบันทึกเสมอ (คนกดยื่นแล้วเข้ามาแก้ — ไม่ชี้ไปที่ปุ่ม "แก้ไขข้อมูล" ที่กดมาแล้ว)
  assert.deepEqual(packGateNotice(view(oldLines), 'submit', { editing: true }), { text: linePackMessage(view(oldLines).issues), action: 'save' });
  // action ที่ไม่รู้จัก = โยน (ไม่มีข้อความเปล่าที่ไม่บอกทางออก)
  assert.throws(() => packGateNotice(view(oldLines), 'send-it'), /unknown action/);
});

/* ═══ โมดัลยืนยันบันทึกของใบเก่า ════════════════════════════════════════════════════════════════════════ */

/* ⭐ ย้ายความคาดหวังโดยเจตนา (รีวิวเงิน 09/10 · แผน §12 C6): ธงของประโยคนี้เดิมชื่อ `priceDrift` และหน้าคิดจาก "ราคาขยับที่จอเห็น" อย่างเดียว
   วันนี้ชื่อ `priceUncertain` และหน้าคิดด้วย `masterPriceUncertain` — รวมกรณีที่จอ **ไม่รู้** ราคาทะเบียน (สินค้าหลุดจากลิสต์เพราะเพิ่งถูกแก้)
   ไม่ได้คลายยาม: ทุกกรณีเดิม (เท่าเดิม · เปลี่ยน · ราคาขยับ = เงียบ · ใบอื่น = เงียบ) ยังอยู่ และเพิ่มกรณีที่เคยพูดผิด */
test('⭐ §12 C6 resplitTotalNote: ใบที่เก็บไว้มีบรรทัดหมวด 02-001 ที่ยังไม่มีเลขแพ็ค ⇒ บอกยอดเท่าเดิม/เปลี่ยนจาก–เป็น · จอสัญญายอดไม่ได้ = เงียบ · ใบอื่น = เงียบ', () => {
  const storedLines = [
    stored('L1', fg(SDS_S, { qty: 172 }), 498800),
    stored('L2', fg(SDS, { qty: 24, discountType: 'amount', discountValue: 14400 }), 69600, 14400),
  ];
  const storedTotal = quoteTotals(storedLines, { vatRate: 7 }).totalAmount; // 608,188.00
  assert.equal(storedTotal, 608188);
  const good = [{ ...storedLines[0], qty: 4, packQty: '43' }, { ...storedLines[1], qty: 12, packQty: '2' }];
  const wrong = [{ ...storedLines[0], qty: 4, packQty: '43' }, { ...storedLines[1], packQty: '2' }];
  const note = (nextLines, extra = {}) => resplitTotalNote({
    storedLines, products: PRODUCTS, storedTotal, nextTotal: quoteTotals(nextLines, { vatRate: 7 }).totalAmount, ...extra,
  });
  assert.equal(note(good), `ยอดรวมทั้งสิ้นเท่าเดิม ${fmtMoney(608188)}`);
  assert.equal(note(good), 'ยอดรวมทั้งสิ้นเท่าเดิม ฿608,188.00');
  assert.equal(note(wrong), 'ยอดรวมทั้งสิ้นเปลี่ยนจาก ฿608,188.00 เป็น ฿698,068.00');
  // จอสัญญายอดไม่ได้ (ราคาทะเบียนขยับ หรือจอไม่รู้ราคาทะเบียน): เซิร์ฟเวอร์จะคิดราคาใหม่ตอนบันทึก ⇒ ไม่มีประโยคยอด
  assert.equal(note(good, { priceUncertain: true }), null);
  assert.equal(note(wrong, { priceUncertain: true }), null);
  // คลาดไม่ถึงครึ่งสตางค์ = เท่าเดิม
  assert.equal(resplitTotalNote({ storedLines, products: PRODUCTS, storedTotal: 608188, nextTotal: 608188.004 }), 'ยอดรวมทั้งสิ้นเท่าเดิม ฿608,188.00');
  assert.equal(resplitTotalNote({ storedLines, products: PRODUCTS, storedTotal: 608188, nextTotal: 608188.01 }),
    'ยอดรวมทั้งสิ้นเปลี่ยนจาก ฿608,188.00 เป็น ฿608,188.01');
  // ใบที่ไม่ใช่ใบเก่าหมวด 02-001: โมดัลเดิม
  const packedStored = [{ id: 'L1', ...fg(SDS, { qty: 12, packQty: 2 }), lineTotal: 84000, discountAmount: 0 }];
  assert.equal(resplitTotalNote({ storedLines: packedStored, products: PRODUCTS, storedTotal: 89880, nextTotal: 44940 }), null);
  assert.equal(resplitTotalNote({ storedLines: [stored('L1', fg(CANDLE, { qty: 50 }), 12500)], products: PRODUCTS, storedTotal: 13375, nextTotal: 99 }), null);
  assert.equal(resplitTotalNote({ storedLines: [], products: PRODUCTS, storedTotal: 0, nextTotal: 0 }), null);
  assert.equal(resplitTotalNote(), null);
  // ชื่อธงเดิมไม่ถูกอ่านแล้ว — ผู้เรียกที่ยังส่ง priceDrift จะไม่ได้ความเงียบ (ยามของหน้าอยู่ที่ quotePackEditorPages.test.mjs)
  assert.doesNotMatch(CODE, /priceDrift/);
});

/* 🐞 รีวิวเงิน 09/10 (money-confirm-total-same-when-price-unknown) — ทำซ้ำทั้งเส้น ด้วยตัวคิดราคาตอนบันทึกของเซิร์ฟเวอร์ตัวจริง:
   ใบเก่า 172 × 2,900 · ราคาในทะเบียนถูกแก้เป็น 3,100 ⇒ สินค้ากลับเป็น "รออนุมัติ" จึง **ไม่อยู่ในลิสต์ที่หน้าโหลด** (GET /api/products)
   เดิม: ธงคิดจาก masterPriceDrift อย่างเดียว ซึ่งคืน null เมื่อไม่มีสินค้าในลิสต์ ⇒ โมดัลพูด "ยอดรวมทั้งสิ้นเท่าเดิม ฿533,716.00"
         แล้วเซิร์ฟเวอร์บันทึก 43 × 4 × 3,100 = 533,200 (ยอดรวม 570,524) */
test('🔴 จอไม่รู้ราคาทะเบียน (สินค้าหลุดจากลิสต์เพราะเพิ่งถูกแก้ราคา) = ไม่มีประโยค "ยอดรวมทั้งสิ้นเท่าเดิม" — เซิร์ฟเวอร์คิดราคาใหม่ตอนบันทึกจริง', async () => {
  const storedLines = [stored('L1', fg(SDS_S, { qty: 172 }), 498800)];
  const storedTotal = quoteTotals(storedLines, { vatRate: 7 }).totalAmount;
  assert.equal(storedTotal, 533716);
  const resplit = [{ ...storedLines[0], qty: 4, packQty: '43' }];
  const screenTotal = quoteTotals(resplit, { vatRate: 7 }).totalAmount;
  assert.equal(screenTotal, 533716, 'บนจอ: แยกแล้วยอดเท่าเดิม');
  /* ลิสต์ของหน้า: สินค้าตัวนี้ไม่อยู่ (รออนุมัติหลังถูกแก้ราคา) */
  const pageProducts = PRODUCTS.filter((item) => item.id !== SDS_S.id);
  const productOf = (line) => pageProducts.find((item) => item.id === line.productId) || null;
  const uncertain = resplit.some((line) => masterPriceUncertain(productOf(line), line));
  assert.equal(uncertain, true, 'จอไม่รู้ราคาทะเบียน = สัญญายอดไม่ได้');
  assert.equal(resplitTotalNote({ storedLines, products: pageProducts, storedTotal, nextTotal: screenTotal, priceUncertain: uncertain }), null,
    'ไม่มีประโยคยอด — โมดัลเดิม');
  /* สิ่งที่เซิร์ฟเวอร์ทำจริงตอนบันทึก: อ่านราคาตรงจากตาราง products (ไม่ผ่านด่านอนุมัติ) แล้วคิดยอดใหม่ */
  const registry = {
    from: (table) => {
      if (table !== 'products') throw new Error(`ตารางที่ไม่ได้ประกาศ: ${table}`); // ทะเบียนหมวดอ่านไม่ได้ = คงชื่อหมวดเดิม (productTypesOrNull)
      return { select: () => ({ in: async () => ({ data: [{ ...SDS_S, costPrice: 3100 }], error: null }) }) };
    },
  };
  const saved = await enforceMasterPrices(registry, normalizeManualLines(resplit), storedLines);
  assert.deepEqual([saved[0].packQty, saved[0].qty, saved[0].unitPrice, saved[0].lineTotal], [43, 4, 3100, 533200]);
  assert.equal(quoteTotals(saved, { vatRate: 7 }).totalAmount, 570524, 'ยอดที่ถูกบันทึกจริง ≠ ยอดที่จอเห็น');
  // สินค้าอยู่ในลิสต์และราคาตรง = สัญญาได้ · ราคาขยับที่จอเห็น = สัญญาไม่ได้ · ทะเบียนยังไม่ตั้งราคา (รู้แน่) = เซิร์ฟเวอร์คงราคาเดิม สัญญาได้
  assert.equal(masterPriceUncertain(SDS_S, resplit[0]), false);
  assert.equal(masterPriceUncertain({ ...SDS_S, costPrice: 3100 }, resplit[0]), true);
  assert.equal(masterPriceUncertain({ ...SDS_S, costPrice: 0 }, resplit[0]), false);
  assert.equal(masterPriceUncertain({ id: SDS_S.id, fgCode: SDS_S.fgCode }, resplit[0]), true, 'บทบาทที่ไม่เห็นคอลัมน์ราคา = ไม่รู้');
  assert.equal(masterPriceUncertain(null, resplit[0]), true);
  assert.equal(masterPriceUncertain(null, typed({ qty: 1, unitPrice: 100 })), false, 'บรรทัดที่ไม่ผูกสินค้า: ราคาที่พิมพ์คือราคาที่บันทึก');
});

/* ═══ การล้างเลขแพ็ค — จอเป็นคนเรียก (ตัวล้างอยู่ที่ quoteLines.js · ยามของมันอยู่ฝั่งนั้น) ═══════════════════ */

test('เปลี่ยนสินค้า/หมวดออกจาก 02-001: ช่องกลับเป็นขีดและยอดเหลือ จำนวน × ราคา · 02-001 → 02-001 เลขอยู่ · เลือกเข้า 02-001 ได้ช่องว่าง (ไม่มีค่าตั้งต้น)', () => {
  // สินค้า 02-001 ที่กรอก 2 แล้ว → เทียนหอม
  const before = fg(SDS, { qty: 12, packQty: '2' });
  const swapped = quoteLineFromProduct(before, CANDLE);
  assert.equal(swapped.packQty, null);
  assert.equal(linePackState(swapped, CANDLE), 'none');
  assert.equal(quoteLineNet(swapped).lineTotal, 12 * 250);
  assert.equal(quoteLinesPackView([swapped], PRODUCTS).showColumn, false, 'เป็นแถวเดียวที่มีช่อง ⇒ คอลัมน์หายไปด้วย');
  // 02-001 → 02-001: เลขแพ็คของคนกรอกอยู่ · ราคาและยอดตามสินค้าใหม่
  const sibling = quoteLineFromProduct(before, SDS_S);
  assert.equal(sibling.packQty, '2');
  assert.equal(quoteLineNet(sibling).lineTotal, 2 * 12 * 2900);
  assert.equal(linePackEditView(sibling, SDS_S).formula, '2 × 12 × 2,900.00');
  // เลือกเข้า 02-001: ไม่มีคีย์ใหม่ ช่องว่าง
  const into = quoteLineFromProduct(fg(CANDLE, { qty: 12 }), SDS);
  assert.equal('packQty' in into, false);
  assert.equal(linePackEditView(into, SDS).value, '');
  assert.equal(linePackEditView(into, SDS).pending, true);
  // บรรทัดพิมพ์เอง: เลือกหมวด 02-001 → ช่องว่าง · กรอก 3 → เปลี่ยนหมวด → ล้าง
  const row = { mainCategoryCode: '02', typeCode: '001', nameTh: 'ระบบกระจายกลิ่น', nameEn: 'SDS' };
  const other = { mainCategoryCode: '01', typeCode: '003', nameTh: 'เทียนหอม', nameEn: 'Candle' };
  let line = typed({ qty: 6, unitPrice: 1200 });
  line = { ...line, ...manualLineCategoryPatch(line, row) };
  assert.equal(linePackState(line), 'missing');
  assert.equal('packQty' in line, false, 'เลือกหมวดเข้า = ไม่มีค่าตั้งต้น');
  line = { ...line, packQty: '3' };
  assert.equal(quoteLineNet(line).lineTotal, 3 * 6 * 1200);
  const away = { ...line, ...manualLineCategoryPatch(line, other) };
  assert.equal(away.packQty, null);
  assert.equal(linePackState(away), 'none');
  assert.equal(quoteLineNet(away).lineTotal, 6 * 1200);
  const cleared = { ...line, ...manualLineCategoryPatch(line, null) };
  assert.equal(cleared.packQty, null, 'เลือก "ไม่ระบุหมวด" ก็ล้าง');
  assert.equal(linePackState(cleared), 'none');
});

/* ═══ รูปของไฟล์ ══════════════════════════════════════════════════════════════════════════════════════ */

test('ไฟล์กฎฝั่งจอ: import สี่ตัวเท่านั้น · เรียกด่านของเซิร์ฟเวอร์ครั้งเดียวด้วยค่าตั้งต้น · ไม่ตั้ง/ไม่ล้างเลขแพ็ค · ไม่มี React', () => {
  const imports = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['@/lib/format', '@/lib/sales/linePackView', '@/lib/sales/linePacks', '@/lib/salesPlanning']);
  assert.doesNotMatch(CODE, /\bimport\(|require\(/);
  // ด่านเดียวกับเซิร์ฟเวอร์ ครั้งเดียว — ไม่ปิดการบังคับ ไม่เลือกวิธีนับเอง (เลขรายการ = ตำแหน่งบนจอ)
  const calls = [...CODE.matchAll(/(?<![\w$.])linePackIssues\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(calls, ['lines, { productById }']);
  assert.doesNotMatch(CODE, /requireOnCategory|numbering|packInputOpen|open\s*:/);
  // ไม่ตั้งค่าเลขแพ็คเอง: ไม่มี packQty = … และคีย์ packQty: มีที่เดียวคือส่งค่าของบรรทัดต่อให้ตัวช่วย (ค่าเดิม ไม่ใช่ค่าคงที่)
  assert.doesNotMatch(CODE, /packQty\s*=(?!=)/);
  assert.deepEqual([...CODE.matchAll(/\bpackQty\s*:\s*([^,}]+)/g)].map((m) => m[1].trim()), ['line.packQty', 'line.packQty']);
  assert.doesNotMatch(CODE, /from 'react'|useState|useEffect|document\.|window\./);
  // ยอดมาจากสูตรกลาง ไม่คูณเอง
  assert.match(CODE, /quoteLineNet\(line\)/);
  assert.doesNotMatch(CODE, /unitPrice\s*\*|\*\s*(?:line\.)?unitPrice|qty\s*\*\s*\w*[pP]rice/);
});

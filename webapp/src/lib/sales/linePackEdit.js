// ── เลขแพ็คของบรรทัด: กฎฝั่งจอของช่องกรอก (งวด PR-3 · docs/qt-pack-column.md) ───────────────────────────────
//
// ⭐ มติเจ้าของ 08/10 ข้อ A2–A5: ช่อง "แพ็ค/เดือน" ของตารางรายการใบเสนอราคา (หน้าสร้าง = หน้าแก้ · ตาราง = การ์ด)
//   บังคับกรอกบนทุกบรรทัดหมวด 02-001 · ไม่มีค่าตั้งต้น · ระบบไม่เดาเลขให้ · ใบเก่าที่ไม่มีเลขแพ็คกรอกตอนแก้
// ไฟล์นี้เป็น **ฟังก์ชันล้วน** (ไม่มี React) — ตารางและสองหน้าเรียกผลของมันไปวาดอย่างเดียว ⇒ เทสต์ได้ครบโดยไม่ต้องเรนเดอร์
//   · งวด PR-5 (mig 0409 · ข้อวินิจฉัย 7): ขั้น ② ของฟอร์มใบสั่งขายย้อนหลังเป็นผู้ใช้อีกราย — ผ่านตัวห่อ `historicalZonesPackView`
//     (lib/sales/historicalIntakeForm.js) ซึ่งเรียก `quoteLinesPackView` ตัวนี้ครั้งเดียวแล้วตัดสูตร/คำอธิบายส่วนลดของแถวที่ยังไม่รู้ยอด
//     กฎของช่อง (คอลัมน์ขึ้นเมื่อไร · ไม่มีค่าตั้งต้น · สถานะ · ข้อความ) จึงเป็นของใบเสนอราคาทุกข้อ ไม่มีกฎชุดที่สองของฟอร์มนั้น
//
// 🔴 สามข้อที่ห้ามพัง
//   1. ตัวตัดสิน "บรรทัดไหนต้องมีเลขแพ็ค" และ "บันทึกได้ไหม" คือของเซิร์ฟเวอร์ตัวเดียวกัน (`lineTakesPacks` · `linePackIssues`)
//      เรียกด่านนั้น **ครั้งเดียว** ที่ quoteLinesPackView ด้วยค่าตั้งต้นของเซิร์ฟเวอร์ ⇒ จอ ⊇ เซิร์ฟเวอร์ (ยาม linePackWritePaths)
//   2. ไฟล์นี้ไม่ตั้ง ไม่ล้าง ไม่แปลงเลขแพ็ค — ตัวล้างสองตัวอยู่ที่ quoteLines.js และจอเป็นคนเรียก · **ช่องเก็บทุกตัวอักษรที่คนพิมพ์**
//      (ไม่มีตัวกรองรายปุ่ม): ค่าที่ไม่ใช่ ว่าง หรือเลข 1–9999 คือสถานะ `invalid` — ยอดเป็นขีด บอกช่วงใต้ช่อง บันทึกไม่ได้ทั้งที่จอและเซิร์ฟเวอร์
//      🐞 รีวิว 09/10: ตัวกรองรายปุ่มของรุ่นแรก ("ไม่รับปุ่มที่ทำให้ค่าผิด") ทิ้งปุ่มเงียบ ๆ แล้วเดินต่อ ⇒ พิมพ์ 0.5 ได้ 5 · 1.5 ได้ 15 ·
//         2.00 ได้ 200 · 10000 ได้ 1000 · แก้ 10 เป็น 20 ได้ 102 — ตัวคูณเงินกลายเป็นเลขที่ไม่มีใครพิมพ์ โดยไม่มีอะไรบอก
//   3. ยอดที่จอพูดมาจากสูตรกลางตัวเดียว (`quoteLineNet`) — ช่องว่างบนบรรทัดที่ต้องกรอก = ยังไม่มียอดให้พูด (ขีด)
//      ไม่ใช่ "คูณ 1" (ค่าตั้งต้นเงียบของการตัดสินใจ)
//
// 🪤 import ได้สี่ตัวเท่านั้น (เทสต์ยึด): format · salesPlanning · linePacks · linePackView — ไม่มีไฟล์ฝั่งเซิร์ฟเวอร์เรียกไฟล์นี้
import { fmtMoney, fmtNumber } from '@/lib/format';
import { quoteLineNet, toMoney } from '@/lib/salesPlanning';
import {
  PACK_LINE_CATEGORY, PACK_QTY_INVALID, linePackGateMessage, linePackIssues, linePackMessage, lineTakesPacks, lineUnitsTotal,
  packQtyValue,
} from '@/lib/sales/linePacks';
import { PACK_COLUMN_LABEL, linePackFormulaText } from '@/lib/sales/linePackView';

/* ข้อความทั้งหมดของช่องกรอก — ก้อนเดียวที่ตาราง สองหน้า และเทสต์อ้าง
   ⚠️ แก้คำแล้วต้องรัน check:thaiwrap ใหม่ (เพดานเต็มอยู่) · ข้อความของด่าน (ระบุเลขรายการ) มาจาก LINE_PACK_TEXT ของ linePacks.js */
export const LINE_PACK_EDIT_TEXT = Object.freeze({
  missing: 'ต้องกรอก',
  range: 'จำนวนเต็ม 1–9,999',
  stray: 'ลบตัวเลขนี้ออก',
  discountPerPackMonth: (sign, amount) => `${sign} ลด ${amount} ต่อแพ็คต่อเดือน`,
  storedAmount: (amount) => `ยอดเดิม ${amount}`,
  totalSame: (amount) => `ยอดรวมทั้งสิ้นเท่าเดิม ${amount}`,
  totalChanged: (before, after) => `ยอดรวมทั้งสิ้นเปลี่ยนจาก ${before} เป็น ${after}`,
  reviseNote: `ฉบับใหม่ต้องกรอก “${PACK_COLUMN_LABEL}” ของรายการหมวด ${PACK_LINE_CATEGORY} ก่อนยื่นอนุมัติ`,
  resplitHint: `รายการหมวด ${PACK_LINE_CATEGORY} ของใบนี้บันทึกไว้ก่อนมีช่อง “${PACK_COLUMN_LABEL}” — แยกจำนวนเดิมเป็น แพ็ค × เดือน ให้ยอดเท่าเดิม (เช่น 24 = 2 แพ็ค × 12 เดือน)`,
});

/** คำบอกใบ้ของช่อง (title): "แพ็ค/เดือน — จำนวนเต็ม 1–9,999" */
export const PACK_INPUT_TITLE = `${PACK_COLUMN_LABEL} — ${LINE_PACK_EDIT_TEXT.range}`;

const SATANG = 0.005;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * สถานะของช่องเลขแพ็คบนบรรทัดหนึ่ง
 * - `none`    ไม่ใช่หมวด 02-001 และไม่มีตัวเลข ⇒ ขีด
 * - `ok`      หมวด 02-001 มีเลขที่ใช้ได้
 * - `missing` หมวด 02-001 ช่องว่าง ⇒ ต้องกรอกก่อนบันทึก
 * - `invalid` ช่องมีค่าที่ไม่ใช่เลข 1–9999 ("1.5" · "0" · "10000" · "2.00" · "๒" · "1,200" — ช่องเก็บตามที่พิมพ์ ไม่กรองรายปุ่ม)
 *             ตัวตัดสินคือ `packQtyValue` ตัวเดียวกับเซิร์ฟเวอร์ ⇒ ค่าที่จอว่าใช้ได้ = ค่าที่เซิร์ฟเวอร์รับ พอดีกัน
 * - `stray`   มีตัวเลขบนบรรทัดที่ไม่ใช่หมวด 02-001 (เกิดได้เมื่อทะเบียนย้ายรหัสสินค้าข้ามหมวด) ⇒ **ยังวาดเป็นช่องพร้อมสูตร**
 *             เพราะตัวเลขนั้นคูณเงินอยู่ — ห้ามเป็นตัวคูณที่มองไม่เห็น
 * @param product สินค้าตัวสดของลิสต์ที่หน้าโหลดไว้ (ไม่มี = ถอดหมวดจากรหัส FG บนบรรทัด)
 */
export function linePackState(line, product = null) {
  const takes = lineTakesPacks(line, product);
  const value = packQtyValue(line?.packQty);
  if (value === PACK_QTY_INVALID) return 'invalid';
  if (takes) return value === null ? 'missing' : 'ok';
  return value === null ? 'none' : 'stray';
}

/**
 * ยอดที่คิดจากช่องบนจอยังเท่ายอดที่เก็บของบรรทัดนี้ไหม (คลาดได้ไม่ถึงครึ่งสตางค์ — CHECK ของฐานยอมหนึ่งสตางค์)
 * บรรทัดใหม่ไม่มี `lineTotal` จึงไม่เข้า · ใช้ตัดสินว่าต้องโชว์ "ยอดเดิม" ข้างยอดใหม่ไหม — **ไม่ใช่** ตัวตัดสินว่าบรรทัดถูกแตะหรือยัง
 */
export function lineAmountAsStored(line) {
  if (line?.lineTotal === null || line?.lineTotal === undefined) return false;
  return Math.abs(quoteLineNet(line).lineTotal - Number(line.lineTotal)) < SATANG;
}

/* "บรรทัดเดียวกับที่เก็บ" ในความหมายของหมวด: สินค้าตัวเดิม รหัส FG เดิม หมวดที่เลือกเดิม (บรรทัดพิมพ์เอง) */
const lineSubjectKey = (row) => [row?.productId || '', row?.fgCode || '', row?.metadata?.categoryCode || ''].join('|');

/**
 * บรรทัดเก่าที่ **เก็บไว้โดยไม่มีเลขแพ็ค** และยังอ่านได้เหมือนที่เก็บ — บรรทัดชนิดเดียวที่ช่องว่างยังโชว์ยอดที่เก็บไว้ได้
 * (มติ A4: ใบเก่ากรอกตอนแก้ · ยอดที่เก็บโชว์จนกว่าคนขายจะแก้บรรทัดนั้น)
 * ตัดสินจาก **แถวที่เก็บ** (`storedLine` — แถวของ `quote.lines` ที่ id ตรงกัน) ไม่ใช่จากยอดอย่างเดียว:
 *   · แถวที่เก็บต้องไม่มีเลขแพ็ค — บรรทัดที่เก็บเลขแพ็ค 1 ไว้แล้วถูกลบเลข ยอดแบบคูณ 1 เท่ายอดที่เก็บพอดี แต่มัน **ถูกแก้แล้ว**
 *   · บรรทัดบนจอต้องยังไม่มีเลขแพ็ค · ยังเป็นสินค้า/หมวดเดียวกับที่เก็บ (บรรทัดพิมพ์เองที่เพิ่งถูกเลือกเข้าหมวด 02-001 = ถูกแก้แล้ว)
 *   · ตัวเลขเงินยังให้ยอดที่เก็บ
 * 🐞 รีวิว 09/10: เดิมดูยอดอย่างเดียว ⇒ ลบเลข 1 ของบรรทัดที่เก็บ 1 × 12 × 1,700 แล้วยอด ฿20,400.00 และยอดรวมยังขึ้นเหมือนกรอก 1 ไว้ให้
 *   พร้อมคำแนะนำ "บันทึกไว้ก่อนมีช่อง…" ที่ไม่จริงสำหรับใบนั้น
 * @param storedLine แถวที่เก็บของบรรทัดนี้ — ไม่มี (บรรทัดใหม่ · หน้าสร้างใบ) = false เสมอ
 */
export function lineStoredUntouched(line, storedLine = null) {
  if (!storedLine || !lineAmountAsStored(line)) return false;
  if (packQtyValue(storedLine.packQty) !== null || packQtyValue(line?.packQty) !== null) return false;
  return lineSubjectKey(line) === lineSubjectKey(storedLine);
}

/* จำนวนและราคาแบบที่สูตรเงินอ่าน (quoteLineNet): จำนวนว่าง = 1 · ราคาว่าง = 0 — สูตรใต้ยอดต้องคูณกันได้ยอดก่อนลดของบรรทัดพอดี */
const moneyQty = (line) => toMoney(line?.qty, 1);
const moneyPrice = (line) => toMoney(line?.unitPrice);

/* "= ลด 600.00 ต่อแพ็คต่อเดือน" ใต้ส่วนลดที่เป็นบาท (มติ A5 — ตัวตรวจสายตา สูตรส่วนลดไม่เปลี่ยน)
   คิดจากส่วนลดที่ **หักจริง** (ตัดที่ยอดของบรรทัดแล้ว) หารด้วย แพ็ค × จำนวน · หารลงตัวที่สองตำแหน่ง = "=" ไม่ลงตัว = "≈" */
function discountCaptionOf(line, state) {
  if (state !== 'ok' && state !== 'stray') return null;
  if (line?.discountType !== 'amount') return null;
  const units = lineUnitsTotal({ packQty: line.packQty, qty: moneyQty(line) });
  const applied = quoteLineNet(line).discountAmount;
  if (!(units > 0) || !(applied > 0)) return null;
  const each = round2(applied / units);
  if (each < 0.01) return null;
  const sign = Math.abs(each * units - applied) < SATANG ? '=' : '≈';
  return LINE_PACK_EDIT_TEXT.discountPerPackMonth(sign, fmtNumber(each, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

const NOTE_OF_STATE = Object.freeze({ missing: 'missing', invalid: 'range', stray: 'stray' });

/**
 * ทุกอย่างที่เซลล์ของ **หนึ่งบรรทัด** ต้องใช้ในโหมดแก้ (เซลล์แพ็ค · หน่วย · ส่วนลด · จำนวนเงิน)
 * @param errorsShown คนกดบันทึก/ยื่นแล้วและยังมีข้อที่ต้องแก้ — ข้อความแดงใต้ช่องขึ้นเฉพาะตอนนี้ (กติกา: แดงหลังกดเท่านั้น)
 * @param storedLine  แถวที่เก็บของบรรทัดนี้ (หน้าใบส่ง `quote.lines` — lineStoredUntouched) · ไม่มี = บรรทัดใหม่
 * @returns
 *   state           linePackState
 *   input           วาดช่องกรอกไหม — ทุกสถานะยกเว้น `none` (บรรทัดที่ **มี** ตัวเลขได้ช่องเสมอ ไม่ซ่อน)
 *   required        บรรทัดนี้ต้องกรอก (หมวด 02-001) ⇒ ดอกจันบนป้ายของการ์ด + aria-required
 *   value           ข้อความในช่อง
 *   pending         ยังไม่มียอดให้พูด ⇒ จำนวนเงินของบรรทัดและยอดรวมทุกจุดของหน้าขึ้นขีด
 *                   (`missing` ที่เป็นบรรทัดใหม่หรือถูกแก้แล้ว · `invalid`) — บรรทัดเก่าที่เก็บไว้โดยไม่มีเลขแพ็คและยังไม่มีใครแตะคงยอดที่เก็บไว้
 *   note            ข้อความแดงใต้ช่อง (เฉพาะเมื่อ errorsShown)
 *   hint            ข้อความ **สีกลาง** ใต้ช่อง ก่อนมีการกด: ช่วงที่รับได้ เมื่อค่าที่พิมพ์ใช้ไม่ได้ (`invalid`) — ยอดเป็นขีดต้องมีคำอธิบายทันที
 *                   ไม่ใช่สีแดง (แดงหลังกดเท่านั้น) · หลังกดแล้ว `note` รับหน้าที่แทน
 *   formula         "2 × 12 × 3,500.00" ใต้ยอด — เมื่อมีเลขแพ็คที่ใช้ได้
 *   discountCaption "= ลด 600.00 ต่อแพ็คต่อเดือน" ใต้ส่วนลดบาท
 *   storedAmount    "ยอดเดิม ฿498,800.00" ใต้ยอดของบรรทัดหมวด 02-001 ที่เก็บไว้แล้ว เมื่อยอดบนจอเป็นขีดหรือไม่เท่ายอดที่เก็บ
 *                   (ตอนแยกจำนวนเดิมเป็น แพ็ค × เดือน คนกรอกต้องเห็นยอดที่ต้องได้เท่าเดิมอยู่ข้างยอดใหม่)
 */
export function linePackEditView(line, product = null, { errorsShown = false, storedLine = null } = {}) {
  const state = linePackState(line, product);
  const takes = lineTakesPacks(line, product);
  const pending = state === 'invalid' || (state === 'missing' && !lineStoredUntouched(line, storedLine));
  const hasPack = state === 'ok' || state === 'stray';
  const stored = line?.lineTotal !== null && line?.lineTotal !== undefined;
  const note = errorsShown && NOTE_OF_STATE[state] ? LINE_PACK_EDIT_TEXT[NOTE_OF_STATE[state]] : null;
  return {
    state,
    input: state !== 'none',
    required: takes,
    value: line?.packQty === null || line?.packQty === undefined ? '' : String(line.packQty),
    pending,
    note,
    hint: !note && state === 'invalid' ? LINE_PACK_EDIT_TEXT.range : null,
    formula: hasPack ? linePackFormulaText({ packQty: line.packQty, qty: moneyQty(line), unitPrice: moneyPrice(line) }) : null,
    discountCaption: discountCaptionOf(line, state),
    storedAmount: takes && stored && (pending || !lineAmountAsStored(line)) ? LINE_PACK_EDIT_TEXT.storedAmount(fmtMoney(line.lineTotal)) : null,
  };
}

/**
 * ทั้งตาราง (โหมดแก้)
 * @param products ลิสต์สินค้าที่หน้าโหลดไว้แล้ว (อาร์เรย์) — สินค้าที่ไม่อยู่ในลิสต์ (รออนุมัติ/พักใช้) ถอดหมวดจากรหัส FG บนบรรทัด
 * @param storedLines บรรทัดที่เก็บไว้ของใบนี้ (`quote.lines` ของหน้าใบ) — จับคู่ด้วย id ให้แต่ละบรรทัดรู้ว่า "ที่เก็บไว้" คืออะไร
 *   ไม่ส่ง (หน้าสร้างใบ) = ไม่มีบรรทัดไหนเป็นบรรทัดเก่า ⇒ ช่องว่างทุกช่องคือยอดเป็นขีด
 * @returns
 *   rows        linePackEditView ของแต่ละบรรทัด (ขนานกับ `lines`)
 *   showColumn  มีบรรทัดที่ได้ช่อง (ต้องกรอก หรือถือตัวเลขอยู่) ⇒ คอลัมน์ขึ้น
 *   pending     มีบรรทัดที่ยังไม่มียอด
 *   issues      ผลของด่านเซิร์ฟเวอร์ตัวเดียวกัน บนบรรทัดที่อยู่บนจอ (`row` = เลขรายการที่จอโชว์ · รวมบรรทัดจำนวน 0 ที่เซิร์ฟเวอร์จะตัดทิ้ง)
 *   message     ข้อความที่เซิร์ฟเวอร์จะตอบถ้าส่งไปทั้งอย่างนี้ ('' = ไม่มีข้อ)
 *   resplitHint บรรทัดกลาง ๆ เหนือตาราง ขณะยังมีบรรทัดเก่าหมวด 02-001 ที่เก็บไว้โดยไม่มีเลขแพ็คและยังไม่มีใครแตะ (ตัวตัดสินเดียวกับยอด)
 */
export function quoteLinesPackView(lines, products = [], { errorsShown = false, storedLines = null } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const productById = new Map((Array.isArray(products) ? products : []).filter((product) => product?.id).map((product) => [product.id, product]));
  const productOf = (line) => (line?.productId ? productById.get(line.productId) || null : null);
  const storedById = new Map((Array.isArray(storedLines) ? storedLines : []).filter((row) => row?.id).map((row) => [row.id, row]));
  const storedOf = (line) => (line?.id ? storedById.get(line.id) || null : null);
  const rows = list.map((line) => linePackEditView(line, productOf(line), { errorsShown, storedLine: storedOf(line) }));
  const issues = linePackIssues(lines, { productById });
  return {
    rows,
    showColumn: rows.some((row) => row.input),
    pending: rows.some((row) => row.pending),
    issues,
    message: linePackMessage(issues),
    resplitHint: list.some((line, index) => rows[index].state === 'missing' && lineStoredUntouched(line, storedOf(line))) ? LINE_PACK_EDIT_TEXT.resplitHint : null,
  };
}

/**
 * แถบแจ้งของหน้า — **คิดสดจากบรรทัดปัจจุบัน** ทุกครั้ง (ห้ามเก็บข้อความไว้: แก้หรือลบแถวแล้วเลขรายการเปลี่ยน)
 * @param view    ผลของ quoteLinesPackView
 * @param pressed ปุ่มที่คนกดแล้วเจอข้อค้าง: 'save' · 'submit' · 'approve' · 'approveOwn' · null = ยังไม่กด
 * @param editing ตารางเปิดแก้อยู่ ⇒ ข้อความแบบบันทึกเสมอ (ไม่ชี้ไปที่ปุ่ม "แก้ไขข้อมูล" ที่คนกดมาแล้ว)
 * @returns null (ยังไม่กด หรือไม่มีข้อเหลือ) | `{ text, action }`
 */
export function packGateNotice(view, pressed, { editing = false } = {}) {
  if (!pressed || !view?.issues?.length) return null;
  const action = editing ? 'save' : pressed;
  return { text: action === 'save' ? view.message : linePackGateMessage(view.issues, action), action };
}

/**
 * ประโยคของโมดัลยืนยันบันทึก เมื่อใบที่ **เก็บไว้** มีบรรทัดหมวด 02-001 ที่ยังไม่มีเลขแพ็ค (การบันทึกครั้งนี้คือการแยกจำนวนเดิม):
 * บอกว่ายอดรวมทั้งสิ้นเท่าเดิมหรือเปลี่ยนจากเท่าไรเป็นเท่าไร — ใบอื่น = null (โมดัลเดิม)
 * @param priceUncertain จอ **สัญญายอดหลังบันทึกไม่ได้** ⇒ null (โมดัลเดิม ไม่มีประโยคยอด) — เซิร์ฟเวอร์คิดราคาใหม่จากทะเบียนตอนบันทึก
 *   (enforceMasterPrices) จึงมีสองกรณี: มีแถวที่ขึ้นคำเตือน "ราคาในฐานข้อมูลตอนนี้ …" (ราคาขยับ) **หรือ** จอไม่รู้ราคาทะเบียนของสินค้าบนบรรทัด
 *   (สินค้าไม่อยู่ในลิสต์ของหน้า — แก้ข้อมูลสินค้าแม้ครั้งเดียวสถานะกลับเป็นรออนุมัติและหลุดจากลิสต์ ซึ่งก็คือตอนที่ราคาเพิ่งถูกแก้)
 *   หน้าคิดด้วย `masterPriceUncertain` (quoteLines.js) · 🐞 รีวิว 09/10: เดิมดูแค่ราคาขยับที่จอเห็น ⇒ โมดัลพูด "ยอดรวมทั้งสิ้นเท่าเดิม"
 *   แล้วเซิร์ฟเวอร์บันทึกยอดใหม่ตามราคาทะเบียน (172 × 2,900 → 43 × 4 × 3,100)
 */
export function resplitTotalNote({ storedLines, products = [], storedTotal, nextTotal, priceUncertain = false } = {}) {
  if (priceUncertain) return null;
  const hadMissing = quoteLinesPackView(storedLines, products).issues.some((issue) => issue.code === 'required');
  if (!hadMissing) return null;
  const before = Number(storedTotal) || 0;
  const after = Number(nextTotal) || 0;
  return Math.abs(after - before) < SATANG
    ? LINE_PACK_EDIT_TEXT.totalSame(fmtMoney(before))
    : LINE_PACK_EDIT_TEXT.totalChanged(fmtMoney(before), fmtMoney(after));
}

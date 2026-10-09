// ── เลขแพ็คของบรรทัดใบเสนอราคา ("แพ็ค/เดือน" · หมวด 02-001 · mig 0407) ──────────────────────────────────
//
// ⭐ มติเจ้าของ 08/10: จำนวนเงินของรายการ = แพ็ค × จำนวน × ราคา แล้วหักส่วนลดรายการตามเดิม
//   (2 แพ็ค × 12 เดือน × 3,500 = 84,000) · เก็บที่ quotation_lines."packQty" / sales_order_lines."packQty"
//   · ว่าง (NULL) = บรรทัดนี้ไม่ได้แยกแพ็ค = คูณ 1 = ยอดเดิมทุกสตางค์
//   เอกสาร: docs/qt-pack-column.md
//
// 🔴 กฎของเซิร์ฟเวอร์ — **ไม่แก้เลขแพ็คเอง**: รับตามที่ส่งมา หรือปฏิเสธพร้อมบอกว่ารายการไหน
//   ไม่ตัดคีย์ทิ้ง · ไม่เก็บ NULL แทนตัวเลข · ไม่คิดยอดใหม่โดยไม่มีตัวเลข (ตัวเลขนี้คูณเงิน — หายเงียบ = ยอดผิดเงียบ)
//
// 🪤 ไฟล์นี้ต้องเป็น "ใบ" ของกราฟ import — salesPlanning.js (สูตรเงิน) เรียกไฟล์นี้
//   ⇒ ห้าม import salesPlanning / serviceOrders / quoteLines กลับ (วน) · ของที่ต้องตรงกับไฟล์เหล่านั้น
//   เขียนเป็นค่าตรง ๆ แล้วให้เทสต์ยึด (linePacks.test.mjs)
import { categoryOf } from '@/lib/master/categoryOf';

/** หมวดที่บรรทัดต้องมีเลขแพ็ค — ค่าเดียวกับ SERVICE_ROUND_CATEGORY (serviceOrders.js · เทสต์ยึด) */
export const PACK_LINE_CATEGORY = '02-001';
/** ช่วงของเลขแพ็ค — เท่ากับ CHECK *_pack_qty_range ของ 0407 และ sales_order_line_zones."packsPerRound" (0392) */
export const PACK_QTY_MIN = 1;
export const PACK_QTY_MAX = 9999;
/** หน่วยข้างช่องจำนวนของบรรทัดที่มีเลขแพ็ค (มติ A1: จำนวน = จำนวนเดือน) — คำเดียวกับหน่วยรอบของใบสั่งขาย (เทสต์ยึด) */
export const PACK_LINE_UNIT = 'เดือน';

/* 🔴 สวิตช์ของช่องกรอก — **เปิดแล้ว** (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A4): ช่องกรอกของตาราง ด่าน "หมวดนี้ต้องกรอก" ตอนบันทึก
   และด่านตอนยื่น / อนุมัติ / ส่ง ขึ้นพร้อมกันในการ deploy ครั้งเดียว · งวด PR-1 / PR-2 ค่านี้เป็น false (เซิร์ฟเวอร์ปฏิเสธเลขแพ็คทุกค่า)
   ⚠️ ประตูทางเดียว: ห้ามตั้งค่านี้กลับเป็น false ตราบที่ยังมีบรรทัดที่มีเลขแพ็ค — ทางฉุกเฉินคือ deploy รุ่น PR-2 กลับ ไม่ใช่สวิตช์นี้
     · โค้ดตั้งแต่งวด PR-3 ยังวาดช่องกรอกอยู่ ⇒ กิ่ง "ปิด" บอกคนขายให้ลบตัวเลขออกแล้วบันทึกใหม่ และเขาทำได้จริง:
       เลขแพ็คถูกลบด้วยมือ ยอดหดเหลือ จำนวน × ราคา เป็นแถวที่ฐานรับ (CHECK มองไม่เห็น) และด่าน "ต้องกรอก" ก็ดับไปด้วย
     · รุ่น PR-2 ทำตามข้อความนั้นไม่ได้ (จอโชว์เลขแพ็คแบบล็อก ไม่มีช่องให้ลบ) จึงเป็นรุ่นเดียวที่ถอยไปได้ · ถอยต่ำกว่างวด PR-1 = ยอดหดเงียบ
     · ถอนฟีเจอร์ = แก้โค้ด (เลิกเสนอช่องว่าง + เลิกบังคับที่ด่าน) ไม่ใช่แก้ค่านี้ — docs/qt-pack-column.md หัวข้อ "ประตูทางเดียว"
   ค่าต้องเป็นค่าคงที่ตรง ๆ (ไม่ใช่ env / นิพจน์) — เทสต์ยึดทั้งค่าและประโยคข้างบน (linePacks.test.mjs) */
export const QUOTE_PACK_INPUT_OPEN = true;

/** ค่าที่ packQtyValue คืนเมื่อช่องมีค่าแต่ไม่ใช่เลขแพ็คที่ใช้ได้ */
export const PACK_QTY_INVALID = Symbol.for('ss.packQty.invalid');

/* ข้อความทั้งหมดของไฟล์นี้ — ก้อนเดียวที่ route ตีกลับและเทสต์อ้าง
   ⚠️ แก้คำแล้วต้องรัน check:thaiwrap ใหม่ (คำไทยที่ติดกับคำว่าแพ็คดันตัวนับเกินเพดาน) */
export const LINE_PACK_TEXT = Object.freeze({
  closed: 'ยังไม่เปิดให้กรอก “แพ็ค/เดือน” — ลบตัวเลขในช่องนั้นออกแล้วบันทึกอีกครั้ง',
  invalid: '“แพ็ค/เดือน” ต้องเป็นจำนวนเต็ม 1–9,999',
  required: `รายการหมวด ${PACK_LINE_CATEGORY} ต้องกรอก “แพ็ค/เดือน” ทุกรายการ`,
  notAllowed: `“แพ็ค/เดือน” ใช้ได้เฉพาะรายการหมวด ${PACK_LINE_CATEGORY} — ลบตัวเลขในช่องนั้นออกก่อนบันทึก`,
  moneyRule: 'ยอดของรายการไม่ตรงกับสูตร แพ็ค × จำนวน × ราคา — ยังไม่ได้บันทึก แจ้งผู้ดูแลระบบ',
  /* ท้ายข้อความของด่านที่ไม่ได้อยู่บนฟอร์มแก้ไข (linePackGateMessage) — บอก **ปุ่มที่คนนั้นมีอยู่จริง** บนหน้าใบ
     · ชื่อปุ่มในเครื่องหมายคำพูดและคำว่า "ออก Rev." ตรงกับป้ายของปุ่มจริงทุกตัวอักษร (เทสต์ยึด — เปลี่ยนชื่อปุ่ม = เทสต์แดง ไม่ใช่ข้อความชี้ปุ่มที่ไม่มี)
     · ผู้อนุมัติที่เป็นคนยื่นใบเองไม่มีปุ่ม "ตีกลับให้แก้ไข" (canRejectQuotationSubmission) จึงมีข้อความของตัวเอง */
  beforeSubmit: 'กด “แก้ไขข้อมูล” แล้วกรอกให้ครบก่อนยื่นอนุมัติ',
  beforeApprove: 'กด “ตีกลับให้แก้ไข” ให้ผู้จัดทำกรอกให้ครบก่อน',
  beforeApproveOwn: 'กด “ดึงกลับมาแก้ไข” แล้วกรอกให้ครบก่อนยื่นใหม่',
  beforeSend: 'ออก Rev. แล้วกรอกในฉบับใหม่ก่อนส่งลูกค้า',
  rows: (list) => `รายการ ${list.join(', ')}`,
});

/**
 * ค่าในช่องเลขแพ็ค → จำนวนเต็ม 1–9999 | `null` (ว่าง) | `PACK_QTY_INVALID` — **ไม่แปลงค่าให้เอง**
 * - ว่าง: `null` · `undefined` · `''` · สตริงที่มีแต่ช่องว่าง
 * - ใช้ได้: ตัวเลขจำนวนเต็มในช่วง · สตริงที่ตัดช่องว่างหัวท้ายแล้วเป็นเลข 1–4 หลักไม่ขึ้นต้นด้วย 0
 * - นอกนั้นใช้ไม่ได้ทั้งหมด: 0 · '0' · '02' · 1.5 · '1.5' · -2 · 'abc' · 10000 · true · NaN · อ็อบเจกต์
 */
export function packQtyValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return /^[1-9]\d{0,3}$/.test(text) ? Number(text) : PACK_QTY_INVALID;
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= PACK_QTY_MIN && raw <= PACK_QTY_MAX ? raw : PACK_QTY_INVALID;
  }
  return PACK_QTY_INVALID;
}

/** ตัวคูณของสูตรเงิน: เลขแพ็คที่ใช้ได้ นอกนั้น 1 (ว่างและค่าที่ใช้ไม่ได้ = 1 · ไม่มีวันเป็น 0 หรือเศษส่วน) */
export function packFactorOf(raw) {
  const value = packQtyValue(raw);
  return typeof value === 'number' ? value : 1;
}

/** จำนวนหน่วยที่ผู้อ่านควรนับจากบรรทัด: ตัวคูณแพ็ค × จำนวน (จำนวนไม่ใช่ตัวเลข = 0) — ตัวอ่านของงวด PR-2 ใช้ */
export function lineUnitsTotal(line) {
  const qty = Number(line?.qty);
  return Number.isFinite(qty) ? packFactorOf(line?.packQty) * qty : 0;
}

/**
 * รหัสหมวดของบรรทัด — บรรทัดที่ผูกสินค้า (มี productId หรือ fgCode) ถอดจากรหัส FG ของสินค้าก่อน แล้วค่อยของบรรทัด
 * (สินค้าถูกลบจากทะเบียน = ยังถอดจากรหัสที่ตรึงไว้บนบรรทัดได้) · บรรทัดพิมพ์เอง = หมวดที่คนออกใบเลือก
 * (`metadata.categoryCode` · manualLineCategoryEdit) · ไม่รู้ = null
 */
export function lineCategoryCode(line, product = null) {
  if (line?.productId || line?.fgCode) return categoryOf(product?.fgCode) || categoryOf(line?.fgCode) || null;
  const code = line?.metadata?.categoryCode;
  return typeof code === 'string' && code ? code : null;
}

/** บรรทัดนี้ต้องมีเลขแพ็คไหม — มติ A3: ดู **หมวดอย่างเดียว** ไม่ดูหน่วยขาย (กิโลกรัม/ชิ้นของหมวดนี้ก็ต้องกรอก) */
export function lineTakesPacks(line, product = null) {
  return lineCategoryCode(line, product) === PACK_LINE_CATEGORY;
}

/** หน่วยที่เก็บ/โชว์ข้างช่องจำนวน: บรรทัดที่มีเลขแพ็คที่ใช้ได้ = "เดือน" · นอกนั้นคืนหน่วยของทะเบียนตามเดิม */
export function packLineUnit(line, registryUnit) {
  return typeof packQtyValue(line?.packQty) === 'number' ? PACK_LINE_UNIT : registryUnit;
}

/**
 * เลขรายการ **ที่คนเห็นบนจอ** ของแต่ละบรรทัด (ขนานกับ `lines`) — ข้อความของด่านต้องชี้แถวเดียวกับที่ฟอร์มนับ
 * - `null` (ค่าตั้งต้น): ตำแหน่งในอาร์เรย์ + 1
 * - `'submitted'`: บรรทัดที่ผ่านตัว normalize ของคำขอนี้ — `sortOrder + 1` = ตำแหน่งในลิสต์ที่จอส่งมา **ก่อน** บรรทัดจำนวน 0 ถูกตัดทิ้ง
 *   (`[แพ็ค 2, จำนวน 0, ไม่มีแพ็ค]` เหลือสองบรรทัดที่ sortOrder 0 และ 2 ⇒ รายการ 1 และ 3 เหมือนบนจอ) · sortOrder ใช้ไม่ได้ = ตำแหน่ง + 1
 * - `'stored'`: บรรทัดที่อ่านจากฐาน — ลำดับที่ตามที่หน้าใบเรียงตอนโหลด (`sortOrder` น้อยไปมาก · เท่ากัน = ตามลำดับในอาร์เรย์)
 *   ⇒ sortOrder 0, 2, 5 คือรายการ 1, 2, 3 (ใบที่เคยมีบรรทัดจำนวน 0 ถูกตัด มีช่องว่างในเลขลำดับ)
 * @returns {number[]}
 */
export function lineScreenRows(lines, numbering = null) {
  const list = Array.isArray(lines) ? lines : [];
  if (numbering === 'submitted') {
    return list.map((line, index) => (Number.isInteger(line?.sortOrder) && line.sortOrder >= 0 ? line.sortOrder + 1 : index + 1));
  }
  if (numbering === 'stored') {
    const keyOf = (line) => { const key = Number(line?.sortOrder ?? 0); return Number.isFinite(key) ? key : 0; };
    const order = list.map((line, index) => ({ index, key: keyOf(line) })).sort((a, b) => a.key - b.key || a.index - b.index);
    const rows = new Array(list.length);
    order.forEach((entry, rank) => { rows[entry.index] = rank + 1; });
    return rows;
  }
  return list.map((_line, index) => index + 1);
}

/**
 * กฎของเซิร์ฟเวอร์ — อ่าน `line.packQty` (และหมวดเมื่อช่องเปิด) · คืน `[]` เมื่อบันทึกได้ทั้งหมด
 * - ช่องเปิด (ค่าตั้งต้น — สวิตช์จริง): ค่าใช้ไม่ได้ = `invalid` · บรรทัดที่ไม่ใช่หมวด 02-001 แต่มีตัวเลข = `not_allowed` ·
 *   บรรทัดหมวด 02-001 ที่ช่องว่าง = `required` เว้นแต่ `requireOnCategory: false`
 *   (ตอนออก Rev. และบรรทัดที่เซิร์ฟเวอร์สร้างเอง — ด่านทักตอนบันทึก/ยื่นครั้งถัดไป · มติ 08/10 ข้อ 3)
 * - ช่องปิด (`open: false` — **คำตอบของรุ่น PR-1 / PR-2 ซึ่งเป็นรุ่นที่ถอยกลับไปได้** · โค้ดของแอปไม่มีจุดไหนส่งค่านี้):
 *   ทุกบรรทัดที่ช่องไม่ว่าง ได้ `closed` — ค่าที่ถูกต้องด้วย · `null` / `undefined` / `''` / ไม่มีคีย์ ไม่ใช่เลขแพ็ค จึงไม่ถูกทักเลย
 * @param productById `Map` หรืออ็อบเจกต์ของแถวสินค้าตาม productId — ไม่ส่ง = ถอดหมวดจากรหัส FG บนบรรทัด
 * @param numbering วิธีนับเลขรายการในข้อความ (lineScreenRows) — `index` ยังเป็นตำแหน่งในอาร์เรย์เสมอ
 * @returns {{ index: number, row: number, code: 'closed' | 'invalid' | 'required' | 'not_allowed' }[]}
 */
export function linePackIssues(lines, {
  open = QUOTE_PACK_INPUT_OPEN, productById = null, requireOnCategory = true, numbering = null,
} = {}) {
  const issues = [];
  const list = Array.isArray(lines) ? lines : [];
  const screenRows = lineScreenRows(list, numbering);
  const productOf = (line) => {
    if (!productById || !line?.productId) return null;
    return (typeof productById.get === 'function' ? productById.get(line.productId) : productById[line.productId]) || null;
  };
  list.forEach((line, index) => {
    const value = packQtyValue(line?.packQty);
    let code = null;
    if (!open) {
      if (value !== null) code = 'closed';
    } else if (value === PACK_QTY_INVALID) {
      code = 'invalid';
    } else {
      const takes = lineTakesPacks(line, productOf(line));
      if (value !== null && !takes) code = 'not_allowed';
      else if (value === null && takes && requireOnCategory) code = 'required';
    }
    if (code) issues.push({ index, row: screenRows[index], code });
  });
  return issues;
}

const MESSAGE_ORDER = Object.freeze([
  ['closed', 'closed'], ['invalid', 'invalid'], ['not_allowed', 'notAllowed'], ['required', 'required'],
]);

/** ข้อความของรายการปัญหา (ไม่มี = '') — หนึ่งประโยคต่อหนึ่งชนิด แต่ละประโยคบอกเลขรายการของตัวเอง เรียงน้อยไปมาก */
export function linePackMessage(issues) {
  const list = Array.isArray(issues) ? issues : [];
  return MESSAGE_ORDER
    .map(([code, textKey]) => {
      const rows = list.filter((issue) => issue?.code === code).map((issue) => issue.row).sort((a, b) => a - b);
      return rows.length ? `${LINE_PACK_TEXT.rows(rows)}: ${LINE_PACK_TEXT[textKey]}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

const GATE_SUFFIX = Object.freeze({
  submit: 'beforeSubmit', approve: 'beforeApprove', approveOwn: 'beforeApproveOwn', send: 'beforeSend',
});

/**
 * ข้อความของด่านที่ **ไม่ได้อยู่บนฟอร์มแก้ไข** — ข้อความเดียวกับ linePackMessage ต่อท้ายด้วยสิ่งที่คนนั้นต้องกด (ไม่มีปัญหา = '')
 * @param action 'submit' (ยื่นอนุมัติ) · 'approve' (ผู้อนุมัติที่ไม่ใช่คนยื่น) · 'approveOwn' (ผู้อนุมัติที่เป็นคนยื่นเอง) · 'send' (ส่งลูกค้าทางเดิม)
 *   ค่าอื่น = โยน — ไม่มีข้อความเปล่าที่ไม่บอกทางออก
 */
export function linePackGateMessage(issues, action) {
  if (!Object.hasOwn(GATE_SUFFIX, action)) throw new Error(`linePackGateMessage: unknown action ${JSON.stringify(action)}`);
  const message = linePackMessage(issues);
  return message ? `${message} — ${LINE_PACK_TEXT[GATE_SUFFIX[action]]}` : '';
}

/** ความผิดพลาดเชิงกติกาของเลขแพ็ค — ผู้เรียกแปลงเป็นคำตอบ 400 พร้อมข้อความนี้ (ห้ามกลืนแล้วเดินต่อ) */
export class LinePackError extends Error {
  constructor(issues) {
    super(linePackMessage(issues));
    this.name = 'LinePackError';
    this.status = 400;
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

/**
 * แถวสำหรับ INSERT ตรง ๆ ลงตารางบรรทัด — ทุกแถวของคำขอเดียวต้องมีรูปเดียวกัน
 * - แถว "มีค่า" เมื่อ `row.packQty` ไม่ใช่ null/undefined (ใช้ได้หรือไม่ก็ตาม — ตัวนี้ **ไม่ตัดสินและไม่ทิ้งค่า**)
 * - ไม่มีแถวไหนมีค่า ⇒ ถอดคีย์ออกจากทุกแถว (คำขอไม่เอ่ยชื่อคอลัมน์เลย — โค้ดใช้ได้แม้ฐานยังไม่มีคอลัมน์)
 * - มีแถวไหนมีค่า ⇒ ทุกแถวมี `packQty: row.packQty ?? null` ค่าเดิมไม่ถูกแตะ
 * คืนอ็อบเจกต์ใหม่เสมอ ไม่แก้ของเดิม
 */
export function withPackColumn(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const anyValue = list.some((row) => row?.packQty !== null && row?.packQty !== undefined);
  return list.map((row) => {
    const { packQty, ...rest } = row || {};
    return anyValue ? { ...rest, packQty: packQty ?? null } : rest;
  });
}

/** error ของ PostgREST/RPC ที่มาจาก CHECK สองตัวของ 0407 (กฎเงินของบรรทัด · ช่วงเลขแพ็ค) → ข้อความไทย · นอกนั้น null */
export function lineMoneyRuleMessage(error) {
  if (error?.code !== '23514') return null;
  return /_line_money_rule|_pack_qty_range/.test(String(error?.message || '')) ? LINE_PACK_TEXT.moneyRule : null;
}

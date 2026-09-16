// ── จุดติดตั้งที่ TS หาไม่เจอหน้างาน (มติ 16/09/2026 ข้อ 23 ส่วน ข1 · mig 0362) ────────────
//
// ⭐ **บ้านเดียวของรหัสเหตุผลและตัวตัดสินทั้งสองฝั่ง** — ฝั่ง TS (คิวงานเข้าใหม่ · วิซาร์ด · ป้ายเมนู)
//    และฝั่งขาย (ทะเบียน SO · หน้าใบ) อ่านจากไฟล์นี้ตัวเดียว · สะกดรหัสผิดที่เดียว = ด่านเงียบ
//    (บทเรียนเดียวกับ `historicalOrders.js` ซึ่งเป็นบ้านเดียวของ literal 'historical')
//
// ⭐ สองชุดคอลัมน์ คนละเจ้าของ (mig 0362):
//    · `siteNotFound*` — **TS เขียน** ตอนแจ้ง · ล้างทั้งชุดตอนถอนการแจ้ง หรือตอนฝ่ายขายแก้ชื่อส่งกลับ
//    · `siteClosed*`   — **ฝ่ายขายเขียน** ตอนตัดสิน "ปิดจุดนี้ ไม่ต้องผูก (เก็บยอด)" · ปิดแล้วธงยังอยู่
//      (ตราปิดต้องมีธงรองรับเสมอ — CHECK `sales_order_lines_site_closed_sane`)
//
// ⚠️ ไฟล์นี้ **ไม่ import อะไรเลย** — เรียกได้ทั้งฝั่ง server และฝั่งจอ และเทสต์เรียกตรงได้

/* รหัสเหตุผล 4 ตัวของ TS — ตรงกับ CHECK `sales_order_lines_site_not_found_sane`
   ⚠️ ไม่มีค่าตั้งต้นบนจอ (กติกาไทล์: ของที่ต้องตัดสินห้ามมีคำตอบรออยู่แล้ว) */
export const SITE_NOT_FOUND_REASONS = Object.freeze([
  { value: 'name_mismatch', label: 'ชื่อจุดไม่ตรงกับหน้างาน', description: 'มีจุดใกล้เคียงแต่ชื่อในชีตไม่ตรง' },
  { value: 'branch_closed', label: 'สาขาปิด/ย้ายออกแล้ว', description: 'ไม่มีสาขานี้หน้างานแล้ว' },
  { value: 'customer_dropped', label: 'ลูกค้าบอกเลิกใช้จุดนี้', description: 'ลูกค้ายืนยันว่าไม่ใช้แล้ว' },
  { value: 'other', label: 'อื่น ๆ', description: 'อธิบายในหมายเหตุ' },
]);

export const SITE_NOT_FOUND_REASON_CODES = Object.freeze(SITE_NOT_FOUND_REASONS.map((r) => r.value));
export const SITE_NOTE_MAX = 500;            // = CHECK ทั้งสองตัวของ 0362
export const SITE_NOTE_REQUIRED_REASON = 'other';

/* คอลัมน์ทั้ง 9 ของ 0362 — จอไหนอยากรู้สถานะจุดต้อง select ชุดนี้ให้ครบ
   (ครึ่งชุด = การ์ดบนหน้าใบโชว์ "ปิดแล้ว" ไม่ได้ทั้งที่ปิดไปแล้ว) */
export const SITE_FLAG_COLUMNS = Object.freeze([
  'siteNotFoundAt', 'siteNotFoundById', 'siteNotFoundByName', 'siteNotFoundReason', 'siteNotFoundNote',
  'siteClosedAt', 'siteClosedById', 'siteClosedByName', 'siteClosedNote',
]);
/* ท่อนที่เอาไปต่อท้าย .select() ได้ตรง ๆ — คอลัมน์ camelCase ต้องมีอัญประกาศเสมอใน PostgREST */
export const SITE_FLAG_SELECT = SITE_FLAG_COLUMNS.map((c) => `"${c}"`).join(', ');

export const SITE_NOT_FOUND_LABEL = 'TS ไม่พบจุด';
export const SITE_CLOSED_LABEL = 'ปิดจุดแล้ว';

export const siteNotFoundReasonLabel = (code) =>
  SITE_NOT_FOUND_REASONS.find((r) => r.value === code)?.label || null;

/* บรรทัดนี้ถูกแจ้งว่าไม่พบหน้างานหรือยัง — **ตัวเดียวที่คิวใช้**
   ⚠️ จุดที่ปิดแล้วยังติดธงอยู่ ⇒ ตัวนี้ครอบทั้ง "รอฝ่ายขายตัดสิน" และ "ปิดแล้ว"
      ซึ่งถูกต้องสำหรับคิว: ทั้งสองสถานะไม่ต้องให้ TS ผูกโซน */
export const lineSiteNotFound = (line) => !!line?.siteNotFoundAt;
export const lineSiteClosed = (line) => !!line?.siteClosedAt;
/* รอฝ่ายขายตัดสิน = แจ้งแล้วแต่ยังไม่ถูกปิด (แก้ชื่อส่งกลับ = ล้างธง ⇒ หลุดจากสถานะนี้เอง) */
export const lineAwaitingSiteDecision = (line) => lineSiteNotFound(line) && !lineSiteClosed(line);
/* TS ถอนการแจ้งได้จนกว่าฝ่ายขายจะตัดสิน */
export const canWithdrawSiteNotFound = (line) => lineAwaitingSiteDecision(line);

/* นับจำนวนตัวอักษรแบบเดียวกับ length() ของ Postgres (code point ไม่ใช่ UTF-16 unit) */
export const noteLength = (value) => [...String(value ?? '').trim()].length;

export function siteNotFoundReasonError(reason) {
  if (!SITE_NOT_FOUND_REASON_CODES.includes(String(reason || ''))) return 'เลือกเหตุผลที่ไม่พบจุดนี้';
  return null;
}

/* หมายเหตุ: **บังคับเฉพาะ 'อื่น ๆ'** (มติข้อ 23.3 — ม็อกวาดบังคับทุกไทล์ ซึ่งขัดกับมติ · มติชนะ)
   เหตุผลอีกสามตัวอธิบายตัวเองครบแล้ว การบังคับพิมพ์ซ้ำทำให้คนพิมพ์คำว่า "-" ทิ้งไว้ */
export function siteNoteError(reason, note, { required = false } = {}) {
  const len = noteLength(note);
  if (len > SITE_NOTE_MAX) return `หมายเหตุยาวเกิน ${SITE_NOTE_MAX} ตัวอักษร`;
  const mustHave = required || String(reason || '') === SITE_NOTE_REQUIRED_REASON;
  if (mustHave && len < 1) return 'พิมพ์หมายเหตุบอกฝ่ายขายว่าเจออะไรหน้างาน';
  return null;
}

/* ผลตรวจก้อนเดียวของคำขอแจ้งหนึ่งจุด — จอและ route เรียกตัวเดียวกัน ข้อความจึงตรงกันเสมอ */
export function siteNotFoundInputError({ reason, note } = {}) {
  return siteNotFoundReasonError(reason) || siteNoteError(reason, note);
}

/* สิ่งที่ต้องเขียนลงแถวตอน TS แจ้ง — ครบทั้งชุดหรือว่างทั้งชุด (CHECK ของ 0362) */
export function siteNotFoundPatch({ reason, note, user, at }) {
  return {
    siteNotFoundAt: at,
    siteNotFoundById: user?.id || null,
    siteNotFoundByName: user?.name || null,
    siteNotFoundReason: String(reason),
    siteNotFoundNote: noteLength(note) ? String(note).trim() : null,
  };
}

/* ล้างธง — ใช้ทั้งตอน TS ถอนการแจ้ง และตอนฝ่ายขายแก้ชื่อจุดแล้วส่งกลับ
   ⚠️ ล้างตราปิดไปด้วยเสมอ: ตราปิดที่ไม่มีธงรองรับ = CHECK ตาย (และไม่มีความหมาย) */
export const SITE_FLAG_CLEARED = Object.freeze({
  siteNotFoundAt: null, siteNotFoundById: null, siteNotFoundByName: null,
  siteNotFoundReason: null, siteNotFoundNote: null,
  siteClosedAt: null, siteClosedById: null, siteClosedByName: null, siteClosedNote: null,
});
export const siteFlagClearPatch = () => ({ ...SITE_FLAG_CLEARED });

export function siteClosePatch({ note, user, at }) {
  return {
    siteClosedAt: at,
    siteClosedById: user?.id || null,
    siteClosedByName: user?.name || null,
    siteClosedNote: noteLength(note) ? String(note).trim() : null,
  };
}

/* ก้อนที่ audit เก็บ — แคบไว้เท่าที่การกระทำนี้แตะ (ท่าเดียวกับ exemptionTrail ของการยกเว้นด่านเงิน)
   ไม่งั้น before/after พกทั้งบรรทัดรวมราคา ซึ่งไม่ได้เปลี่ยนและอ่านยาก */
export function siteFlagTrail(line) {
  const out = {};
  for (const col of SITE_FLAG_COLUMNS) out[col] = line?.[col] ?? null;
  return out;
}

/* สรุปให้จออ่านบรรทัดเดียว — คืน null เมื่อไม่มีธง */
export function siteNotFoundOf(line) {
  if (!lineSiteNotFound(line)) return null;
  return {
    at: line.siteNotFoundAt,
    byName: line.siteNotFoundByName || null,
    reason: line.siteNotFoundReason || null,
    reasonLabel: siteNotFoundReasonLabel(line.siteNotFoundReason),
    note: line.siteNotFoundNote || null,
    closed: lineSiteClosed(line),
    closedAt: line.siteClosedAt || null,
    closedByName: line.siteClosedByName || null,
    closedNote: line.siteClosedNote || null,
  };
}

/* จำนวนจุดของใบที่ยัง "รอฝ่ายขายตัดสิน" — ชิปบนแถวคิว TS และบนทะเบียน SO ใช้ตัวเดียวกัน */
export const awaitingSiteDecisionCount = (lines = []) => lines.filter(lineAwaitingSiteDecision).length;
export const siteDecisionChipLabel = (count) => `รอฝ่ายขายตัดสิน ${count} จุด`;

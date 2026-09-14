/* ── สวิตช์ "ดีลเก่าจากระบบเดิม" (metadata.legacy) — กติกาเดียวของจอสร้าง · server · หน้าดีล ──
 *
 * ⭐ มติผู้ใช้ 2026-09-14: ดีลเก่าที่สร้างเป็น Won = บันทึกงานที่ปิดไปแล้วในระบบเดิม **ไม่มีมูลค่า**
 *    ไม่นับเป็นยอดขาย (Actual) ไม่เข้า FC · Actual มาจากใบสั่งขายที่อนุมัติแล้วเท่านั้น
 * 🐞 ที่มา: 2026-08-08 → 2026-09-14 ฟอร์มสัญญาว่ายอดที่พิมพ์ "เข้าเป็นยอด Won (Actual)" แต่ trigger
 *    enforce_sales_order_actual_on_deal (0110 · นิยามล่าสุด 0353) เขียน wonValue = ผลรวม SO อนุมัติ
 *    ทุกครั้งตั้งแต่ INSERT ⇒ ยอดที่พิมพ์ 15 ใบ 1,956,850 ไม่เคยนับ แต่ค้างใน projectValue เป็น FC
 *    และดีลที่สร้างเป็น Won ออกใบเสนอราคา/SO ไม่ได้เลย (quotations POST ปฏิเสธดีล Won)
 * ⚠️ "legacy" ในไฟล์นี้ = ธงสวิตช์ในฟอร์มเท่านั้น ไม่ใช่สาย SO ย้อนหลัง
 * ⚠️ สูตรล้วน (จอ import ได้) — ห้ามแตะฐานหรือ session
 */

/** บันทึกยอดปิดจากระบบเดิม — mig 0359 เขียนคนเดียว · หน้าดีลอ่านอย่างเดียว */
export const LEGACY_CLOSED_NOTE_KEYS = ['legacyClosedValue', 'legacyClosedDate'];

/** คีย์ metadata ที่ client เขียนไม่ได้ ทั้ง POST และ PATCH
 *  · actualSource = ของ trigger (เดิม POST ประทับเองหลัง spread — บรรทัดนั้นถูกลบ จึงต้องมีตัวกันแทน)
 *  · legacyClosedValue/Date = ของ mig 0359 */
export const SERVER_ONLY_DEAL_METADATA_KEYS = ['actualSource', ...LEGACY_CLOSED_NOTE_KEYS];

/** ถอดคีย์ของระบบออกจาก metadata ที่ client ส่งมา — ใช้ **ก่อน** merge กับของเดิม
 *  (ถอดจากผลรวมหลัง merge = ลบบันทึกที่ mig 0359 เขียนไว้ทุกครั้งที่ PATCH) */
export function stripServerOnlyDealMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = { ...metadata };
  for (const key of SERVER_ONLY_DEAL_METADATA_KEYS) delete out[key];
  return out;
}

export const LEGACY_WON_VALUE_ERROR =
  'ดีลเก่าที่สร้างเป็น Won ต้องไม่มีมูลค่า — ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC · ยอดขายจริงมาจากใบสั่งขายที่อนุมัติแล้วเท่านั้น (คำขอนี้ส่งยอดหรือรายการมูลค่ามา ระบบจึงไม่บันทึก)';
export const LEGACY_WON_FUTURE_DATE_ERROR =
  'วันที่ปิดในระบบเดิมต้องไม่เกินวันนี้ — ดีลเก่าที่สร้างเป็น Won คืองานที่ปิดไปแล้ว';

export const isLegacyWonCreate = (body = {}, stage) => stage === 'won' && Boolean(body?.metadata?.legacy);

/** null = ผ่าน · ข้อความไทย = ตีกลับ 400 (ห้ามทิ้งยอดเงียบ ๆ)
 *  · มีแถวมูลค่า (แถวไหนก็ได้ รวมราคา 0) หรือยอดรวมไม่ใช่ 0 ⇒ ตีกลับ
 *  · วันที่ปิดเลยวันนี้ (เวลาไทย — ผู้เรียกส่ง businessDate() มา) ⇒ ตีกลับ */
export function legacyWonCreateError(body = {}, { stage, today = null } = {}) {
  if (!isLegacyWonCreate(body, stage)) return null;
  const hasItems = Array.isArray(body.valueItems) && body.valueItems.length > 0;
  const typed = Number(body.projectValue);
  if (hasItems || (Number.isFinite(typed) && typed !== 0)) return LEGACY_WON_VALUE_ERROR;
  const closed = String(body.expectedCloseDate || '').slice(0, 10);
  if (today && closed && closed > today) return LEGACY_WON_FUTURE_DATE_ERROR;
  return null;
}

/** บันทึกยอดปิดในระบบเดิมบนหน้าดีล — null เมื่อไม่มีบันทึก
 *  stillInForecast = projectValue ยังไม่ถูกล้าง (ดีลที่รอเจ้าของยืนยันว่ายังผลิตอยู่)
 *  ⇒ ข้อความบนจอต้องไม่บอกว่า "ไม่เข้า FC" ในกรณีนั้น */
export function legacyClosedNoteOf(deal) {
  const value = Number(deal?.metadata?.legacyClosedValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rawDate = String(deal?.metadata?.legacyClosedDate || '');
  return {
    value,
    date: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null,
    stillInForecast: Number(deal?.projectValue) > 0,
  };
}

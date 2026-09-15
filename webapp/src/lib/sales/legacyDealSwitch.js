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
 *  · legacyClosedValue/Date = ของ mig 0359
 *  · wonSource / acceptedQuotationId = ของ accept_quotation_atomic (ล่าสุด 0284) · ทางถอย 0116/0138/0168/0170 ·
 *    forceDelete.cleanupQuotationOrphans — ทุกทางเขียนที่ฐานตรง ไม่ผ่าน route ดีล (มติผู้ใช้ 2026-09-15)
 *    ปล่อยให้ client เขียน = คำขอที่แต่งเองหลบตัวบ่งชี้ isLegacyWonAtCreate (lib/sales/dashboardMetrics) ได้
 *    ตั้งแต่ตอนสร้าง ⇒ ดีลสวิตช์กลับเข้ากอง "Won รอยื่น SO" · ตรวจผู้เรียก 2026-09-15: ไม่มีจอไหนส่งสองคีย์นี้
 *    (โมดัลสร้างส่งแค่ leadId/source/leadChannel/legacy · ฟอร์มแก้และปุ่ม action ไม่ส่ง metadata เลย)
 *    PATCH ถอดจากค่าที่ส่งมาก่อน merge ⇒ ค่าที่ RPC เขียนไว้ใน before อยู่ต่อ
 *  ⚠️ **ห้ามเพิ่ม 'legacy'** — ด่าน POST อ่านธงนี้ (สร้างที่ Won ได้เฉพาะดีลเก่า) และแถวที่บันทึกต้องเก็บธงไว้
 *     ให้ตัวบ่งชี้ ถอดทิ้ง = ดีลสวิตช์ใหม่ทุกใบกลับเข้ากอง Won รอยื่น SO เงียบ ๆ
 *     ธง legacy มีกติกาของตัวเองแยกสองทาง: clientDealMetadataOnCreate (POST เก็บเฉพาะ true จริง) ·
 *     clientDealMetadataOnPatch (PATCH ไม่รับเลย) — route ดีลเรียกสองตัวนั้น ไม่เรียกตัวถอดข้างล่างตรง ๆ */
export const SERVER_ONLY_DEAL_METADATA_KEYS = ['actualSource', ...LEGACY_CLOSED_NOTE_KEYS, 'wonSource', 'acceptedQuotationId'];

/** ถอดคีย์ของระบบออกจาก metadata ที่ client ส่งมา — ใช้ **ก่อน** merge กับของเดิม
 *  (ถอดจากผลรวมหลัง merge = ลบบันทึกที่ mig 0359 เขียนไว้ทุกครั้งที่ PATCH) */
export function stripServerOnlyDealMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = { ...metadata };
  for (const key of SERVER_ONLY_DEAL_METADATA_KEYS) delete out[key];
  return out;
}

/** ธงสวิตช์ "ดีลเก่าจากระบบเดิม" เปิดอยู่ไหม — ตัวอ่านธงตัวเดียวของทั้งระบบ
 *  ⭐ ต้องเป็น boolean true เท่านั้น: ด่านสร้าง (isLegacyWonCreate) กับตัวบ่งชี้ isLegacyWonAtCreate
 *     (lib/sales/dashboardMetrics) อ่านตัวนี้ร่วมกัน จึงตัดสินตรงกันเสมอ
 *  🐞 2026-09-15 (ตรวจรอบสอง): ด่าน POST เคยเช็กแบบ truthy (`!metadata.legacy` · `Boolean(...)`) แต่ตัวบ่งชี้เช็ก
 *     `=== true` ⇒ คำขอที่แต่ง legacy: 1 หรือ 'true' มาเองสร้างดีล Won ได้ แต่หลุดตัวบ่งชี้ กลายเป็นบรรทัด
 *     "+1 ดีล ฿0" ค้างในกอง Won รอยื่น SO ถาวร · โมดัลสร้างส่ง true จริงอยู่แล้ว (prod 49/49 เป็น true) */
export const hasLegacySwitchFlag = (metadata) => metadata?.legacy === true;

/** metadata ที่ POST สร้างดีลเก็บจากคำขอ = ถอดคีย์ของระบบ + ธง legacy เก็บเฉพาะ true จริง
 *  (ค่าอื่น — false · 1 · 'true' — ไม่เก็บ) ⇒ แถวที่บันทึกมีธงรูปเดียวกับที่ด่านและตัวบ่งชี้อ่าน */
export function clientDealMetadataOnCreate(metadata) {
  const out = stripServerOnlyDealMetadata(metadata);
  delete out.legacy;
  if (hasLegacySwitchFlag(metadata)) out.legacy = true;
  return out;
}

/** metadata จากคำขอ PATCH ที่ merge ทับของเดิมได้ = ถอดคีย์ของระบบ + **ไม่รับธง legacy เลย**
 *  ⭐ ธงนี้เป็นของตอนสร้างเท่านั้น (สวิตช์โผล่เฉพาะฟอร์มสร้าง · ฟอร์มแก้และปุ่ม action ไม่ส่ง metadata.legacy —
 *     ตรวจผู้เรียก 2026-09-15) ⇒ PATCH คงค่าใน before เสมอ
 *  🐞 ไม่ถอด = PATCH {metadata:{legacy:false}} บนดีลเก่าที่สร้างเป็น Won ผ่านทุกด่าน (ไม่ส่ง stage/title)
 *     ตัวบ่งชี้หลุด ⇒ ดีลกลับเข้ากอง "Won รอยื่น SO" (เช่นบล็อก B DL-26080340 283,350) · กลับด้านก็เหมือนกัน
 *     (ใส่ legacy:true ให้ดีลที่ไม่ใช่ดีลเก่า)
 *  ⚠️ ถอดเฉพาะ PATCH — ห้ามย้าย 'legacy' ไปไว้ใน SERVER_ONLY_DEAL_METADATA_KEYS เพราะ POST ต้องเก็บธง */
export function clientDealMetadataOnPatch(metadata) {
  const out = stripServerOnlyDealMetadata(metadata);
  delete out.legacy;
  return out;
}

export const LEGACY_WON_VALUE_ERROR =
  'ดีลเก่าที่สร้างเป็น Won ต้องไม่มีมูลค่า — ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC · ยอดขายจริงมาจากใบสั่งขายที่อนุมัติแล้วเท่านั้น (คำขอนี้ส่งยอดหรือรายการมูลค่ามา ระบบจึงไม่บันทึก)';
export const LEGACY_WON_FUTURE_DATE_ERROR =
  'วันที่ปิดในระบบเดิมต้องไม่เกินวันนี้ — ดีลเก่าที่สร้างเป็น Won คืองานที่ปิดไปแล้ว';

/** คำขอสร้างดีลเก่าที่ Won — route POST ใช้ตัวนี้เป็นด่าน "สร้างที่ Won ได้เฉพาะดีลเก่า" ด้วย (ธง true จริงเท่านั้น) */
export const isLegacyWonCreate = (body = {}, stage) => stage === 'won' && hasLegacySwitchFlag(body?.metadata);

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

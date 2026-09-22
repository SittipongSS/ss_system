// ── ช่องราคา RM ของกลิ่น/สูตร — F · B · FB (มติผู้ใช้ 2026-09-22 · ม-148) ─────────────
//
// ⭐ นิยาม (ถ้อยคำผู้ใช้): *"F คือกลิ่น(หัวน้ำหอม) / B คือเบส / FB คือ เบสที่ใส่กลิ่น"*
//   · F  = หัวน้ำหอม — ของ **กลิ่น** (ประทับ `scentId`) · สูตรที่ใช้กลิ่นเดียวกันเห็นราคา F ตัวเดียวกัน
//   · B  = เบสล้วนไม่ใส่กลิ่น — ของ **สูตร** (ประทับ `formulaId` · ชนิด `RM_B` · mig 0371)
//   · FB = เบสที่ใส่กลิ่นแล้ว — ของ **สูตร** (ประทับ `formulaId` · ชนิด `RM_FB`)
//
// ⭐ **ใครใส่ช่องไหนได้** (ถ้อยคำผู้ใช้: *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB … ยกเว้น กลิ่น(หัวน้ำหอม)
// ที่ใส่ได้แค่ F"*)
//   · สูตร = สามช่อง (F ไปลงกลิ่นของสูตรนั้น · สูตรไม่มีกลิ่น = ไม่มีช่อง F)
//   · กลิ่น = ช่อง F ช่องเดียว
//   · ใส่ **อย่างน้อยหนึ่งช่อง** ไม่บังคับครบ — SDS ใส่แค่ F ได้ · สูตรที่รู้แต่ราคาเนื้อใส่แค่ FB ได้
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — ขั้นใส่ราคาในคำร้อง · ปุ่มราคาหน้าทะเบียน · โมดัลบนจอ ถามตัวเดียวกัน
// ⚠️ ทุกช่องเป็นราคาเดียวต่อกิโล ไม่มีชั้นจำนวน (มติผู้ใช้ 2026-08-03)
import { normalizeQuotedPrice } from '@/lib/materialPrices';
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';

export const PRICE_SLOTS = Object.freeze({
  F: Object.freeze({
    key: 'F', kind: 'RM_F', stampColumn: 'scentId', short: 'F',
    text: 'ราคาหัวน้ำหอม (F)', hint: 'หัวน้ำหอมล้วน — ลงที่ทะเบียนกลิ่น', registry: 'กลิ่น',
  }),
  B: Object.freeze({
    key: 'B', kind: 'RM_B', stampColumn: 'formulaId', short: 'B',
    text: 'ราคาเบส (B)', hint: 'เบสไม่ใส่กลิ่น — ลงที่ทะเบียนสูตร', registry: 'สูตร',
  }),
  FB: Object.freeze({
    key: 'FB', kind: 'RM_FB', stampColumn: 'formulaId', short: 'FB',
    text: 'ราคาเบสที่ใส่กลิ่น (FB)', hint: 'เนื้อพร้อมใช้ รวมกลิ่นแล้ว — ลงที่ทะเบียนสูตร', registry: 'สูตร',
  }),
});

/** ลำดับบนจอ/ในข้อความ — ของประกอบก่อน ของรวมทีหลัง */
export const PRICE_SLOT_ORDER = Object.freeze(['F', 'B', 'FB']);

/** ช่องหลักเมื่อใส่หลายช่อง — แถวคำร้องชี้ rev ตัวนี้ (`answeredRevisionId`) · FB > B > F */
const MAIN_PRIORITY = ['FB', 'B', 'F'];

/**
 * ช่องราคาที่เปิดให้ใส่ — คืน `[{ ...PRICE_SLOTS[k], id }]` (id = กลิ่น/สูตรที่ช่องนั้นลง)
 * · มีสูตร = F (ถ้าสูตรมีกลิ่น) + B + FB · ไม่มีสูตรแต่มีกลิ่น = F · ไม่มีอะไร = []
 * · ⭐ **สูตรหมวดหัวน้ำหอม (02-020) = F ช่องเดียว** (มติผู้ใช้ 2026-09-22: *"กลิ่น(หัวน้ำหอม)ที่ใส่ได้แค่ F"* ·
 *   ถามต่อว่า "พัฒนาสูตรควรปรับตามพัฒนากลิ่นด้วยมั้ย") — พัฒนาสูตรที่ขอหมวด 02-020 คือหัวน้ำหอมของกลิ่นนั้น
 *   ไม่มีเบส ⇒ ราคาลงที่กลิ่นเหมือนพัฒนากลิ่นที่ส่งเป็นหัวน้ำหอม (ของจริง: RQ-FD-26090085 · RQ-FD-26090156)
 *   ⚠️ สูตร 02-020 ที่ไม่มีกลิ่น (สูตรฐาน) ไม่มีที่ให้ลง F ⇒ ถอยไปใช้ช่องของสูตรตามปกติ ไม่ปิดทางใส่ราคา
 */
/*   · `scentUsable: false` = กลิ่นของสูตรใส่ราคา F ไม่ได้ (ร่าง/เลิกใช้) ⇒ ไม่เปิดช่อง F — ไม่งั้นโมดัลเปิดช่องที่ server ตีกลับ
 *     แล้วทั้งชุด (B/FB ที่ถูกต้อง) บันทึกไม่ได้ไปด้วย (รีวิว ม-148 รอบสอง) · ไม่รู้สถานะ (ไม่ส่งมา) = ถือว่าใช้ได้ */
export function priceSlotsFor({ scentId: rawScentId = null, formulaId = null, categoryCode = null, scentUsable = true } = {}) {
  const scentId = scentUsable === false ? null : rawScentId;
  if (formulaId && scentId && categoryCode === PDR_FRAGRANCE_OIL_CODE) {
    return [{ ...PRICE_SLOTS.F, id: scentId }];
  }
  if (formulaId) {
    return [
      scentId ? { ...PRICE_SLOTS.F, id: scentId } : null,
      { ...PRICE_SLOTS.B, id: formulaId },
      { ...PRICE_SLOTS.FB, id: formulaId },
    ].filter(Boolean);
  }
  return scentId ? [{ ...PRICE_SLOTS.F, id: scentId }] : [];
}

/** ช่องที่ถือว่าเป็น "ราคาของสิ่งนี้" เมื่อมีช่องเดียวให้เลือก (ทางเข้าเก่าที่ส่ง `price` ตัวเดียว) */
export function primaryPriceSlot(slots = []) {
  for (const key of MAIN_PRIORITY) {
    const slot = slots.find((s) => s.key === key);
    if (slot) return slot;
  }
  return null;
}

/**
 * ตรวจราคาที่ส่งมา — คืน `{ entries: [{ slot, price }], error }` เรียงตาม PRICE_SLOT_ORDER
 *
 * รับ `body.prices = { F?, B?, FB? }` · ทางเข้าเก่า `body.price` = ช่องหลัก (FB ของสูตร / F ของกลิ่น)
 * ⚠️ ส่งช่องที่รายการนี้ไม่มีมา = ตีกลับ ไม่ทิ้งเงียบ (เช่น B ของกลิ่น — ถูกทิ้งแล้วคนใส่คิดว่าบันทึกแล้ว)
 */
export function normalizeSlotPrices(slots = [], body = {}) {
  if (!slots.length) return { entries: [], error: 'รายการนี้ยังไม่ผูกกลิ่นหรือสูตรในทะเบียน — ใส่ราคาไม่ได้' };
  let raw = {};
  if (body?.prices && typeof body.prices === 'object' && !Array.isArray(body.prices)) {
    raw = body.prices;
  } else if (body && Object.prototype.hasOwnProperty.call(body, 'price')) {
    raw = { [primaryPriceSlot(slots).key]: body.price };
  }
  const open = new Set(slots.map((s) => s.key));
  for (const key of Object.keys(raw)) {
    const given = raw[key] != null && raw[key] !== '';
    if (!open.has(key) && given) {
      const label = PRICE_SLOTS[key]?.text || key;
      return { entries: [], error: `${label} ใส่ให้รายการนี้ไม่ได้` };
    }
  }
  const entries = [];
  for (const key of PRICE_SLOT_ORDER) {
    const slot = slots.find((s) => s.key === key);
    if (!slot) continue;
    const value = raw[key];
    if (value == null || value === '') continue;
    const { value: price, error } = normalizeQuotedPrice(slot.kind, value);
    if (error) return { entries: [], error: slots.length > 1 ? `${slot.text}: ${error}` : error };
    entries.push({ slot, price });
  }
  if (!entries.length) {
    return { entries: [], error: slots.length > 1 ? 'ต้องใส่ราคาอย่างน้อย 1 ช่อง' : 'ต้องระบุราคา' };
  }
  return { entries, error: null };
}

/** ช่องหลักในชุดที่ใส่จริง — FB > B > F */
export function mainPriceEntry(entries = []) {
  for (const key of MAIN_PRIORITY) {
    const hit = entries.find((e) => e.slot.key === key);
    if (hit) return hit;
  }
  return null;
}

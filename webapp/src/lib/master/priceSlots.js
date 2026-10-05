// ── ช่องราคา RM ของกลิ่น/สูตร — F · B · FB (มติผู้ใช้ 2026-09-22 · ม-148) ─────────────
//
// ⭐ นิยาม (ถ้อยคำผู้ใช้): *"F คือกลิ่น(หัวน้ำหอม) / B คือเบส / FB คือ เบสที่ใส่กลิ่น"*
//   · F  = หัวน้ำหอม — ของ **กลิ่น** (ประทับ `scentId`) · สูตรที่ใช้กลิ่นเดียวกันเห็นราคา F ตัวเดียวกัน
//   · B  = เบสล้วนไม่ใส่กลิ่น — ของ **สูตร** (ประทับ `formulaId` · ชนิด `RM_B` · mig 0372)
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
import { SCENT_STATUS_LABELS, isScentUsable } from '@/lib/master/scents';

/** เหตุเมื่อไม่มีช่องให้ใส่เลย (แถว/รายการยังไม่ผูกกลิ่นหรือสูตร) — ข้อความเดียวทั้ง API · จอ · หน้า "รอใส่ราคา" */
export const NO_PRICE_SLOTS_REASON = 'รายการนี้ยังไม่ผูกกลิ่นหรือสูตรในทะเบียน — ใส่ราคาไม่ได้';

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
 *     แล้วทั้งชุด (B/FB ที่ถูกต้อง) บันทึกไม่ได้ไปด้วย (รีวิว ม-148 รอบสอง) · ไม่รู้สถานะ (ไม่ส่งมา) = ถือว่าใช้ได้
 *   · 🐞 **สูตรหัวน้ำหอมที่กลิ่นใช้ไม่ได้ = ไม่มีช่องเลย ไม่ใช่ B/FB** (ผู้ใช้ 2026-10-05 "แก้เลย") — เดิมล้าง scentId
 *     ก่อนดูหมวด ⇒ หัวน้ำหอมที่กลิ่นเป็นร่าง/เลิกใช้ตกไปทาง "สูตรไม่มีกลิ่น" แล้วได้ช่อง B/FB ซึ่งขัดมติ "ใส่ได้แค่ F"
 *     ⇒ ตัดสินหมวดก่อนสถานะกลิ่นเสมอ · เหตุที่ใส่ไม่ได้อยู่ที่ `priceSlotsBlocker` */
export function priceSlotsFor({ scentId: rawScentId = null, formulaId = null, categoryCode = null, scentUsable = true } = {}) {
  if (formulaId && isFragranceOilFormula({ scentId: rawScentId, categoryCode })) {
    return scentUsable === false ? [] : [{ ...PRICE_SLOTS.F, id: rawScentId }];
  }
  const scentId = scentUsable === false ? null : rawScentId;
  if (formulaId) {
    return [
      scentId ? { ...PRICE_SLOTS.F, id: scentId } : null,
      { ...PRICE_SLOTS.B, id: formulaId },
      { ...PRICE_SLOTS.FB, id: formulaId },
    ].filter(Boolean);
  }
  return scentId ? [{ ...PRICE_SLOTS.F, id: scentId }] : [];
}

/**
 * สูตรหมวดหัวน้ำหอม (02-020) ที่มีกลิ่น — ราคาของมันคือ F ของกลิ่น **เสมอ** ไม่ว่าตอนนี้ใส่ได้หรือไม่
 * ⚠️ ตัวเดียวที่ทั้งช่องราคา (`priceSlotsFor`) และราคาที่โชว์บนทะเบียนสูตร (`withFragranceOilPrice`) ถาม — สองที่คิดเองเมื่อไรก็เพี้ยนหากัน
 */
export function isFragranceOilFormula(formula) {
  return !!formula?.scentId && formula?.categoryCode === PDR_FRAGRANCE_OIL_CODE;
}

/**
 * ทำไมไม่มีช่องให้ใส่ — คืนข้อความไทย หรือ `''` เมื่อมีช่อง · อาร์กิวเมนต์ชุดเดียวกับ `priceSlotsFor`
 * (+ `scentStatus` · `scentLabel` ของกลิ่นไว้เขียนเหตุ) · ตัดสิน "ไม่มีช่อง" ด้วย `priceSlotsFor` ตัวเดียว ⇒ เหตุกับช่องขัดกันไม่ได้
 */
export function priceSlotsBlocker(args = {}) {
  if (priceSlotsFor(args).length) return '';
  const { formulaId = null, scentId = null, categoryCode = null, scentStatus = '', scentLabel = '' } = args;
  if (!formulaId || !isFragranceOilFormula({ scentId, categoryCode })) return NO_PRICE_SLOTS_REASON;
  const who = scentLabel ? `กลิ่น ${scentLabel}` : 'กลิ่นของสูตรนี้';
  const state = SCENT_STATUS_LABELS[scentStatus] ? ` สถานะ "${SCENT_STATUS_LABELS[scentStatus]}"` : '';
  const fix = { draft: ' · RD ต้องรับกลิ่นเข้าทะเบียนก่อน', archived: ' · เปิดใช้กลิ่นก่อน' }[scentStatus] || '';
  return `สูตรหัวน้ำหอม (${PDR_FRAGRANCE_OIL_CODE}) ใส่ได้แค่ราคา F ที่กลิ่นของสูตร — ${who}${state} ยังใส่ราคา F ไม่ได้${fix}`;
}

/**
 * ช่องราคาของ **สูตร** + เหตุเมื่อไม่มีช่อง — `{ slots, blocker }` · ทุกทางที่ใส่ราคาให้สูตรประกอบอาร์กิวเมนต์ที่นี่ที่เดียว
 * (ปุ่มราคาหน้าทะเบียนสูตร · API ราคาสูตร · ขั้นราคาของแถวคำร้องที่ผูกสูตร · หน้า "รอใส่ราคา")
 * `scent` = กลิ่นของสูตร `{ status, code?, name? }` — ไม่รู้สถานะ = ถือว่าใช้ได้ (ด่านจริงตอนเขียนอยู่ที่ `loadPriceSlotSource`)
 */
export function formulaPriceSlots(formula, scent = null) {
  const args = {
    scentId: formula?.scentId || null,
    formulaId: formula?.id || null,
    categoryCode: formula?.categoryCode || null,
    scentUsable: scent?.status ? isScentUsable(scent) : true,
    scentStatus: scent?.status || '',
    scentLabel: scent?.code || scent?.name || '',
  };
  return { slots: priceSlotsFor(args), blocker: priceSlotsBlocker(args) };
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
 * · `blocker` = เหตุที่ไม่มีช่อง (จาก `priceSlotsBlocker`) — ไม่ส่ง = ข้อความ "ยังไม่ผูก" มาตรฐาน
 */
export function normalizeSlotPrices(slots = [], body = {}, { blocker = '' } = {}) {
  if (!slots.length) return { entries: [], error: blocker || NO_PRICE_SLOTS_REASON };
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

/**
 * "ใช้ราคานี้" ผูกราคาตัวไหน — ราคาที่มีอยู่แล้วในทะเบียน แทนการพิมพ์ซ้ำ (ม-153 · มติผู้ใช้ 2026-10-01)
 *
 * `current` = `[{ key, price }]` ต่อช่องของแถว (`price` = ผลของ `attachRegistryPrice` หรือ null)
 * คืน `{ entry, blocker }` · `entry === null` = ไม่มีราคาในทะเบียนสักช่อง (ไม่มีอะไรให้ใช้ — ไม่ต้องโชว์ปุ่ม)
 * · `blocker` ไม่ว่าง = มีราคาแต่ใช้ไม่ได้ (โชว์ปุ่มแล้วบอกเหตุตอนกด — กฎ UI ของระบบ)
 *
 * ⭐ **เลือกช่องหลักที่มีราคา (FB > B > F) แล้วต้องพร้อมใช้ — ไม่ข้ามไปช่องรอง** — FB หมดอายุแต่ F ยังดี
 * ถ้ายอมผูก F แทน แถวสินค้าจะปิดด้วยราคาหัวน้ำหอมล้วน แล้วไม่มีใครถูกเตือนให้ต่ออายุ FB อีกเลย
 * ⇒ ช่องหลักหมดอายุ = ต้องใส่ราคาใหม่ (ช่องรองยังอยู่ในทะเบียนตามเดิม)
 * ⚠️ หน้าจอกับ API ถามตัวนี้ตัวเดียว — ปุ่มกับด่านพูดคนละเรื่องไม่ได้
 */
export function currentPriceToUse(current = []) {
  const priced = (current || []).filter((c) => c?.price && c.price.unitPrice != null);
  let entry = null;
  for (const key of MAIN_PRIORITY) {
    entry = priced.find((c) => c.key === key) || null;
    if (entry) break;
  }
  if (!entry) return { entry: null, blocker: '' };
  const label = PRICE_SLOTS[entry.key]?.text || entry.key;
  const state = entry.price.state;
  if (state === 'ready') return { entry, blocker: '' };
  if (state === 'expired') return { entry, blocker: `${label} ในทะเบียนหมดอายุแล้ว — กด "ใส่ราคา" เพื่อออกราคาใหม่` };
  /* ⚠️ วัสดุเก็บเข้ากรุ/ยังเป็นร่าง **ห้ามพาไป "ใส่ราคา"** (รีวิว ม-153) — ตัวเขียนราคาเลือกวัสดุตัวเดิม (`pickStampedMaterial`)
     แล้วต่อ rev บนตัวนั้น สถานะไม่เปลี่ยน ⇒ ได้ rev ซ้ำ และแถวปิดบนวัสดุที่ยังใช้ไม่ได้อยู่ดี · ต้องเปิดใช้วัสดุก่อน */
  const material = state === 'archived' ? 'เก็บเข้ากรุแล้ว' : 'ยังเป็นร่าง';
  return { entry, blocker: `${label} อยู่บนวัสดุที่${material} — ใส่ราคาใหม่ก็ยังใช้ไม่ได้ · แจ้งผู้ดูแลระบบให้เปิดใช้วัสดุในทะเบียนราคาก่อน` };
}

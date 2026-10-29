// ── "ไม่เรียกเก็บค่าสรรพสามิตในระบบ" บน SO ลูกค้า (แผนรื้อสรรพสามิต หมวด 3.5 · มติ Q6/Q7 28/10/2026) ─────────────
//
// SO ลูกค้าที่มีสินค้าสรรพสามิตแต่ **ไม่ออกใบเสนอราคาค่าสรรพสามิต** — SA ตัดสินบนตัว SO เอง (กฎความเป็นเจ้าของโมดูลข้อ 2:
// ขั้นของฝ่ายบนเอกสารเดิมเป็นคอลัมน์ ไม่ใช่เอกสารใหม่) · RA ยังยื่นกรมตามเดิม (PR5) ยกเว้นชนิด not_liable
// ⚠️ ค่าทั้งชุดตรงกับ CHECK `sales_orders_excise_not_billed_shape` (mig 0414) — ตรวจที่นี่ก่อนให้ได้ข้อความไทย ไม่ใช่ชื่อ constraint
// ⚠️ ไฟล์บริสุทธิ์ — จอ import ได้

export const EXCISE_NOT_BILLED_KINDS = Object.freeze({
  collected_outside: { label: 'เก็บนอกระบบแล้ว', hint: 'เก็บค่าภาษีจากลูกค้าไปแล้วนอกระบบ (เช่น ออกบิลใน Express) — ใส่เลขอ้างอิงถ้ามี' },
  included_in_price: { label: 'รวมในราคาสินค้าแล้ว', hint: 'ใบเสนอราคาของลูกค้ารวมค่าภาษีไว้ในราคาสินค้า — ใส่เลข QT ที่รวมไว้' },
  not_liable: { label: 'ไม่ต้องเสียภาษี', hint: 'สินค้าในใบนี้ไม่ต้องเสียภาษีสรรพสามิต — RA ไม่ต้องยื่นกรม' },
});
export const EXCISE_NOT_BILLED_REASON_MIN = 10;
export const EXCISE_NOT_BILLED_REASON_MAX = 500;
export const EXCISE_NOT_BILLED_REF_MAX = 100;

/** ตรวจ + จัดรูปคำตัดสินที่จอส่งมา — `{ value }` หรือ `{ error }` (ข้อความไทย) */
export function exciseNotBilledInput(body = {}) {
  const kind = String(body?.kind || '').trim();
  if (!EXCISE_NOT_BILLED_KINDS[kind]) return { error: 'เลือกเหตุที่ไม่เรียกเก็บในระบบ' };
  const reason = String(body?.reason || '').trim();
  if (reason.length < EXCISE_NOT_BILLED_REASON_MIN || reason.length > EXCISE_NOT_BILLED_REASON_MAX) {
    return { error: `ระบุเหตุผล ${EXCISE_NOT_BILLED_REASON_MIN}–${EXCISE_NOT_BILLED_REASON_MAX} ตัวอักษร` };
  }
  const ref = String(body?.ref || '').trim();
  if (ref.length > EXCISE_NOT_BILLED_REF_MAX) return { error: `เลขอ้างอิงยาวได้ไม่เกิน ${EXCISE_NOT_BILLED_REF_MAX} ตัวอักษร` };
  return { value: { kind, reason, ref: ref || null } };
}

/** ตัดสิน "ไม่เรียกเก็บ" บน SO นี้ได้ไหม — null = ได้ · `filing` = ใบยื่นกรมที่ผูก SO นี้ (ถ้ามี) */
export function exciseNotBilledBlocker(order, { liveQuote = null, clearing = false, filing = null } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (order.origin && order.origin !== 'pipeline') return 'ตัดสินได้เฉพาะใบสั่งขายจากใบเสนอราคา';
  if (clearing) {
    if (!order.exciseNotBilledKind) return 'ใบสั่งขายนี้ยังไม่ได้ตัดสินว่าไม่เรียกเก็บ';
    if (filing) return `ฝ่าย RA สร้างใบยื่นกรม ${filing.id} บนใบสั่งขายนี้แล้ว — ถอนการตัดสินไม่ได้`;
    return null;
  }
  if (order.status !== 'approved' || order.supersededById) return 'ตัดสินได้เฉพาะใบสั่งขายที่อนุมัติแล้วและยังไม่ถูกออก Rev. ทับ';
  if (order.exciseNotBilledKind) return 'ใบสั่งขายนี้ตัดสินว่าไม่เรียกเก็บไปแล้ว — ถอนก่อนถ้าจะเปลี่ยนเหตุ';
  if (liveQuote) return `มีใบเสนอราคาค่าสรรพสามิต ${liveQuote.quoteNumber || liveQuote.id} ที่ยังมีผลอยู่ — ยกเลิกใบนั้นก่อนจึงตัดสินว่าไม่เรียกเก็บได้`;
  return null;
}

/** แพตช์ของคอลัมน์ชุดนี้ — ตั้ง (ครบทั้งชุด) หรือล้าง (ว่างทั้งชุด) ตาม CHECK */
export function exciseNotBilledPatch(value, { user, at } = {}) {
  if (!value) {
    return {
      exciseNotBilledKind: null, exciseNotBilledReason: null, exciseNotBilledRef: null,
      exciseNotBilledAt: null, exciseNotBilledById: null, exciseNotBilledByName: null,
    };
  }
  return {
    exciseNotBilledKind: value.kind,
    exciseNotBilledReason: value.reason,
    exciseNotBilledRef: value.ref,
    exciseNotBilledAt: at,
    exciseNotBilledById: user?.id || null,
    exciseNotBilledByName: user?.name || null,
  };
}

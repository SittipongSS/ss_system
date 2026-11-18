// ── คำร้องพัฒนากลิ่นใบใหม่ "ต่อจากคำร้อง" ใบเดิม + บรีฟ "แก้จากกลิ่น" (ม-164 PR-4 · แผน §3) — logic ล้วน ──
//
// ⭐ ทางของงานเพิ่มที่ **ต้องมีบรีฟใหม่ หรือใบเดิมปิดแล้ว** (VARIDA: SB-26080006 ปิดแล้ว · SO-26080018-0 ขายแก้ไขกลิ่น)
//   · ใบที่ปิดแล้ว **ไม่เปิดกลับ** — ใบใหม่ชี้กลับด้วย `continuesRequestId` (mig 0436)
//   · บรีฟเลือกกลิ่นตั้งต้นได้ (`dept_request_scents.sourceScentId`) → ฟอร์มส่งกลิ่นของ RD เติม "แก้มาจากกลิ่น" ให้
//   · **SO หลักขายแก้ไขกลิ่น (03-010) ล้วน = ทุกบรีฟต้องเลือกกลิ่นตั้งต้น** (แก้กลิ่นต้องรู้ว่าแก้ตัวไหน) — บังคับตอนส่ง ไม่ใช่ตอนบันทึกร่าง
//     (กติกาเดียวกับชื่อบรีฟ · `scentBriefNameError`)
import { requestCloseNeedsSoConfirm } from '@/lib/master/requestTypes';
import { scentDesignLines } from '@/lib/requests/scentDesignOrders';
import { isScentRevisionLine } from '@/lib/requests/scentOrderLinks';

/** SO หลักขายแก้ไขกลิ่นล้วนไหม — ทุกบรรทัดงานพัฒนากลิ่นเป็น 03-010 */
export function briefSourceRequired(lines = []) {
  const design = scentDesignLines(lines || []);
  return design.length > 0 && design.every(isScentRevisionLine);
}

/**
 * บรีฟที่ยังไม่เลือกกลิ่นตั้งต้น ทั้งที่ใบขายแก้ไขกลิ่นล้วน — คืนข้อความไทย หรือ null
 * ⚠️ ถามตอนกดส่งเท่านั้น (ร่างยังว่างได้)
 */
export function briefSourceMissingError(briefs = [], lines = []) {
  if (!briefSourceRequired(lines)) return null;
  const missing = (briefs || []).findIndex((b) => !String(b?.sourceScentId ?? '').trim());
  if (missing < 0) return null;
  const name = briefs[missing]?.label || `กลิ่นที่ ${missing + 1}`;
  return `บรีฟ "${name}": ใบสั่งขายนี้ขายแก้ไขกลิ่น — ต้องเลือกกลิ่นตั้งต้นที่จะแก้ก่อนส่ง`;
}

/**
 * ใบเดิมที่จะ "ต่อจาก" ใช้ได้ไหม — คืนข้อความไทย หรือ null
 *
 * @param requestId      ใบที่กำลังเปิด/แก้ (null ตอนสร้าง)
 * @param kind           หัวข้อของใบที่กำลังเปิด/แก้
 * @param prev           แถวคำร้องเดิม `{ id, kind, status, customerId }` · null = ไม่พบ
 * @param sameTaxEntity  ลูกค้าของใบเดิมอยู่นิติบุคคลเดียวกันไหม
 * ⚠️ ใบเดิมสถานะไหนก็ได้ยกเว้นยกเลิก — ปิดแล้วคือเคสหลักของทางนี้ · ยังเปิดอยู่ก็ได้ (มีบรีฟใหม่)
 */
export function continueRequestError({ requestId = null, kind = null, prev = null, sameTaxEntity = false } = {}) {
  if (!requestCloseNeedsSoConfirm(kind)) return '"ต่อจากคำร้อง" ใช้ได้เฉพาะคำร้องพัฒนากลิ่น';
  if (!prev) return 'ไม่พบคำร้องเดิมที่เลือก';
  if (requestId && prev.id === requestId) return 'คำร้องต่อจากตัวเองไม่ได้';
  if (!requestCloseNeedsSoConfirm(prev.kind)) return 'คำร้องเดิมต้องเป็นคำร้องพัฒนากลิ่น';
  if (prev.status === 'cancelled') return 'คำร้องเดิมถูกยกเลิกแล้ว — เลือกใบอื่น';
  if (!sameTaxEntity) return 'คำร้องเดิมเป็นของลูกค้ารายอื่น — ต่อได้เฉพาะลูกค้าเดียวกัน';
  return null;
}

/**
 * ตัวเลือกกลิ่นตั้งต้นของบรีฟ — กลิ่นที่ลูกค้าคอนเฟิร์มในใบเดิมขึ้นก่อน แล้วตามด้วยกลิ่นอื่นของลูกค้า
 * @param scents     กลิ่นที่ลูกค้าใช้ได้ (ผู้เรียกกรองมาแล้ว)
 * @param preferIds  `confirmedScentIds` ของใบที่ต่อจาก
 */
export function orderSourceScents(scents = [], preferIds = []) {
  const prefer = new Set(preferIds || []);
  const first = (scents || []).filter((s) => prefer.has(s.id));
  const rest = (scents || []).filter((s) => !prefer.has(s.id));
  return [...first, ...rest];
}

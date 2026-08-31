// ── กรอก "จำนวนรอบบริการที่ขายไว้" ที่ใบสั่งขาย (mig 0326) ───────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-31 (รอบสอง)**: *"รอบบริการ ไปอยู่ที่ SO"* — ของเดิมกรอกที่
//   บรรทัดใบเสนอราคาแล้วไหลเข้าใบสั่งขายตอนสร้าง · เปลี่ยนมากรอกที่ใบสั่งขายตรง ๆ
//
// 🔴 **ช่องนี้เป็นช่องแรกบนบรรทัดใบสั่งขายที่แก้ได้** — ที่เหลือทั้งบรรทัด (ราคา จำนวน
//   หน่วย คำอธิบาย ส่วนลด) เป็น snapshot ที่ก๊อปมาจากใบเสนอราคาและแก้ไม่ได้เลย
//   ⇒ ต้องมีด่านของตัวเอง และต้องอธิบายได้ว่าทำไมช่องนี้ต่างจากเพื่อน:
//     ตัวเลขนี้ **ไม่กระทบยอดเงินและไม่อยู่บนเอกสารที่ออกไปแล้ว** — เป็นข้อผูกพัน
//     จำนวนครั้งที่ต้องไปหน้างาน ซึ่งของจริงรู้ชัดตอนทำใบสั่งขาย ไม่ใช่ตอนเสนอราคา
//
// ⚠️ **แก้ได้แม้ใบอนุมัติแล้ว** (มติผู้ใช้) — ไม่ต้องออก Rev. เพราะ Rev. หนึ่งใบเพื่อแก้
//   เลขรอบตัวเดียวคือภาระที่ไม่ได้อะไรกลับมา · ทุกครั้งที่แก้ลง audit log
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอและฝั่ง API — ห้าม import อะไรที่เป็น server-only
import { lineIsServicePackage } from '@/lib/sales/serviceOrders';

/** บรรทัดไหนกรอกรอบได้ — เกณฑ์เดียวกับที่ใช้ตัดสินว่าใบไหนมีรอบบริการ */
export const lineTakesServiceRounds = (line) => lineIsServicePackage(line);

export const serviceRoundLines = (lines = []) =>
  (Array.isArray(lines) ? lines : []).filter(lineTakesServiceRounds);

/**
 * ค่าที่ยอมให้เขียนลงฐาน — จำนวนเต็มบวก หรือ null (ยังไม่ระบุ)
 *
 * ⚠️ 0 / ติดลบ / ทศนิยม / ข้อความ = null ไม่ใช่ error — ผู้ใช้ลบตัวเลขทิ้งเพื่อ
 *   "ยังไม่ระบุ" ได้ตลอด และ CHECK ของฐานห้าม <= 0 อยู่แล้ว ⇒ ปล่อยผ่านไปถึงฐาน
 *   จะกลายเป็น 500 ดิบแทนที่จะเป็นช่องว่างที่คนแก้เองได้
 */
export function normalizeServiceRounds(value) {
  if (value === '' || value === null || value === undefined) return null;
  const rounds = Number(value);
  return Number.isInteger(rounds) && rounds > 0 ? rounds : null;
}

/**
 * ด่านเดียวที่ทั้งช่องกรอกบนจอและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * @param order            ใบสั่งขาย (ต้องมี `status`)
 * @param options.canEdit  ผู้ใช้มีสิทธิ์แก้ใบนี้ไหม (ผู้เรียกคำนวณมาให้ — cap + ขอบเขตทีม)
 */
export function serviceRoundsEditError(order, { canEdit = false } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (!canEdit) return 'กรอกจำนวนรอบได้เฉพาะฝ่ายขายที่ดูแลใบนี้';
  /* ⚠️ ใบที่ยกเลิก/ถูกแทนด้วย Rev. แล้วห้ามแก้ — แก้เอกสารที่ตายแล้วไม่มีผลกับงานจริง
     แต่ทำให้ประวัติอ่านย้อนแล้วขัดกัน (กติกาเดียวกับการผูกสัญญา) */
  if (['cancelled', 'revised'].includes(order?.status)) {
    return 'ใบนี้ปิดไปแล้ว — แก้จำนวนรอบไม่ได้';
  }
  return null;
}

/**
 * ตรวจก้อนที่จอส่งมา: { [lineId]: จำนวนรอบ } เทียบกับบรรทัดจริงของใบ
 * คืน { value, error } — `value` คือแผนที่ที่ normalize แล้ว พร้อมเขียนลงฐาน
 *
 * ⚠️ **ตรวจว่าบรรทัดเป็นของใบนี้จริงและเป็นหมวดบริการ** — จอส่ง id อะไรมาก็ได้
 *   ปล่อยผ่าน = เขียนทับบรรทัดของใบอื่น หรือใส่รอบให้บรรทัดขายขวดน้ำหอม
 */
export function validateServiceRoundsPatch(patch, lines = []) {
  if (!patch || typeof patch !== 'object') return { value: null, error: 'ไม่มีข้อมูลจำนวนรอบที่จะบันทึก' };
  const byId = new Map((Array.isArray(lines) ? lines : []).map((l) => [l.id, l]));
  const value = new Map();
  for (const [lineId, raw] of Object.entries(patch)) {
    const line = byId.get(lineId);
    if (!line) return { value: null, error: 'มีรายการที่ไม่ได้อยู่ในใบนี้ — รีเฟรชแล้วลองใหม่' };
    if (!lineTakesServiceRounds(line)) {
      return { value: null, error: 'กรอกจำนวนรอบได้เฉพาะรายการแพ็คเกจบริการ (หมวด 02-001)' };
    }
    value.set(lineId, normalizeServiceRounds(raw));
  }
  if (!value.size) return { value: null, error: 'ไม่มีข้อมูลจำนวนรอบที่จะบันทึก' };
  return { value, error: null };
}

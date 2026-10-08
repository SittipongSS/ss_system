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
// ใบสั่งขายย้อนหลัง (mig 0374) — ไฟล์ตัวตัดสิน import แค่ permissions.js ซึ่งไม่ import อะไร (ไม่มีวงวน · ฝั่ง client ใช้ได้)
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
// งานบริการรายบรรทัด (mig 0392) — ไฟล์นี้ import ตัวนั้นได้ แต่ตัวนั้นห้าม import ไฟล์นี้กลับ (กฎ 16 · serviceSetupImports.test.mjs)
import { serviceLineRole, serviceSetupFlow, serviceSetupRequired } from '@/lib/sales/serviceSetup';

/** บรรทัดไหนกรอกรอบได้ — เกณฑ์เดียวกับที่ใช้ตัดสินว่าใบไหนมีรอบบริการ
 *  ⭐ mig 0392: ใบที่ประทับ `serviceTermsOpenedAt` แล้วถามชนิดของบรรทัด (แพ็คเกจพิมพ์เองที่ฝ่ายขายตั้งให้ก็นับ)
 *    ยังไม่ประทับ = เกณฑ์เดิม (รหัส FG หมวด 02-001) — บรรทัดพิมพ์เองตั้งรอบที่ตารางรายการ ไม่ใช่ช่องนี้
 *  ⚠️ มีอาร์กิวเมนต์ `order` แล้ว — ห้ามส่งแบบ point-free (`.filter(lineTakesServiceRounds)` ส่ง index มาเป็น order) */
export const lineTakesServiceRounds = (line, order = null) => (order?.serviceTermsOpenedAt
  ? serviceLineRole(line) === 'package'
  : lineIsServicePackage(line, order));

export const serviceRoundLines = (lines = [], order = null) =>
  (Array.isArray(lines) ? lines : []).filter((l) => lineTakesServiceRounds(l, order));

/* ข้อความล็อกของช่องจำนวนรอบ (แผน §2.2 · ภาคผนวก A.3)
   ⭐ `required` มีสองคำตามหน่วยที่หน้าใบนั้นพูด (มติเจ้าของ 08/10: หน่วยของจำนวนรอบบริการบนตารางงานบริการ = "เดือน"):
     · ใบ pipeline ที่ประทับแล้ว (ดินสอบนตารางงานบริการ) = `requiredMonths` — หน่วยเดียวกับ `SERVICE_SETUP_LINE_TEXT.roundUnit` (เทสต์ยึดไว้)
     · ใบย้อนหลังที่ประทับแล้ว (การ์ดสัญญาบริการ — นอกขอบเขตมติ 08/10 ยังพูด "รอบ") = `required` คำเดิม
     ตัวเลือกคำ = `serviceRoundsRequiredText(order)` ที่เดียว (ดินสอของจอและตัวตรวจของ API ใช้ตัวเดียวกัน)
   ⚠️ literal — ไฟล์นี้ import serviceSetup.js ได้ทิศเดียว แต่ค่าคงที่ระดับบนสุดไม่อ่านชื่อที่ import (แบบเดียวกับกฎ 16) */
export const SERVICE_ROUNDS_EDIT_TEXT = Object.freeze({
  pipeline: 'แก้จำนวนรอบที่ตารางรายการ แล้วกด ‘บันทึกงานบริการ’',
  pending: 'รออนุมัติ — ดึงกลับก่อนแก้จำนวนรอบ',
  revoked: 'ย้อนการอนุมัติแล้ว — แก้จำนวนรอบที่ใบ Rev.',
  backfill: 'ใบนี้ยังไม่ได้ตั้งงานบริการ — ตั้งจำนวนรอบที่ตารางรายการ แล้วกด ‘บันทึกงานบริการ’',
  backfillSubmitted: 'ยื่นตรวจงานบริการแล้ว — แก้ไม่ได้จนกว่าผู้จัดการจะตีกลับ',
  required: 'แพ็คเกจต้องมีอย่างน้อย 1 รอบ',
  requiredMonths: 'แพ็คเกจต้องมีอย่างน้อย 1 เดือน',
});

/** คำของ "ล้างจำนวนรอบบริการของใบที่ประทับแล้วไม่ได้" ตามหน่วยที่หน้าใบนั้นพูด — ใบย้อนหลัง "รอบ" · ใบ pipeline "เดือน" (มติ 08/10) */
export const serviceRoundsRequiredText = (order) => (isHistoricalOrder(order)
  ? SERVICE_ROUNDS_EDIT_TEXT.required
  : SERVICE_ROUNDS_EDIT_TEXT.requiredMonths);

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
  /* ⭐ ใบสั่งขายย้อนหลังที่ยังไม่อนุมัติ (มติ 22/09 · mig 0374) — จำนวนรอบเป็นส่วนหนึ่งของบรรทัดโซนที่ฟอร์มคีย์ใบ
     เขียนใหม่ทั้งชุดทุกครั้งที่บันทึก และ AE Sup กำลังตรวจตัวเลขชุดนั้น ⇒ แก้ตรงนี้ = ถูกทับตอนบันทึกฟอร์ม หรือ
     เปลี่ยนสิ่งที่ผู้อนุมัติเห็นระหว่างรอ · อนุมัติแล้วแก้ได้ตามกติกาเดิม (ไม่ต้องออก Rev.) */
  if (isHistoricalOrder(order) && order?.status !== 'approved') {
    return 'จำนวนรอบของใบย้อนหลังแก้ที่ฟอร์มคีย์ใบจนกว่า AE Sup จะอนุมัติ';
  }
  /* 🔄 mig 0392: trigger ของฐานล็อกการแก้รอบของทุกใบระหว่างรออนุมัติ/ย้อนการอนุมัติแล้ว (ผู้อนุมัติกำลังดูตัวเลขชุดนั้น ·
     ใบที่ย้อนแล้วแก้ที่ใบ Rev.) — ก่อนนี้ช่องนี้ปล่อยผ่าน ⇒ กดแล้วเจอ error ดิบจาก trigger */
  if (order?.status === 'pending_approval') return SERVICE_ROUNDS_EDIT_TEXT.pending;
  if (order?.status === 'approval_revoked') return SERVICE_ROUNDS_EDIT_TEXT.revoked;
  /* ⭐ ใบ pipeline สาย SERVICE (mig 0392) — รอบเป็นส่วนหนึ่งของการตั้งงานบริการที่ตารางรายการ (บันทึกพร้อมโซน/แพ็ค)
     จนกว่าใบจะประทับ · ประทับแล้วแก้รอบที่นี่ได้ตามมติเดิม (≥ 1 — ตรวจที่ validateServiceRoundsPatch) */
  if (serviceSetupRequired(order)) {
    const flow = serviceSetupFlow(order);
    if (flow === 'pipeline') return SERVICE_ROUNDS_EDIT_TEXT.pipeline;
    if (order.status === 'approved' && !order.supersededById && !order.serviceTermsOpenedAt) {
      return order.serviceSetupState === 'submitted' ? SERVICE_ROUNDS_EDIT_TEXT.backfillSubmitted : SERVICE_ROUNDS_EDIT_TEXT.backfill;
    }
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
export function validateServiceRoundsPatch(patch, lines = [], order = null) {
  if (!patch || typeof patch !== 'object') return { value: null, error: 'ไม่มีข้อมูลจำนวนรอบที่จะบันทึก' };
  const byId = new Map((Array.isArray(lines) ? lines : []).map((l) => [l.id, l]));
  const value = new Map();
  for (const [lineId, raw] of Object.entries(patch)) {
    const line = byId.get(lineId);
    if (!line) return { value: null, error: 'มีรายการที่ไม่ได้อยู่ในใบนี้ — รีเฟรชแล้วลองใหม่' };
    if (!lineTakesServiceRounds(line, order)) {
      return { value: null, error: 'กรอกจำนวนรอบได้เฉพาะรายการแพ็คเกจบริการ (หมวด 02-001)' };
    }
    const rounds = normalizeServiceRounds(raw);
    /* ⭐ ใบที่ประทับแล้ว (mig 0392): รอบขายของโซนเกิดแล้ว — ล้างเป็น "ยังไม่ระบุ" ไม่ได้ (trigger ตอบ rounds_required) */
    if (rounds === null && order?.serviceTermsOpenedAt) return { value: null, error: serviceRoundsRequiredText(order) };
    value.set(lineId, rounds);
  }
  if (!value.size) return { value: null, error: 'ไม่มีข้อมูลจำนวนรอบที่จะบันทึก' };
  return { value, error: null };
}

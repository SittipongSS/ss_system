// ── เลขที่คำร้อง — ของกลาง ────────────────────────────────────────────────
// ออกตอนกดส่งเท่านั้น (ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง — บทเรียนใบขอราคาผลิต)
//
// scope มาจากหัวข้อ (requestDocScope) ไม่ใช่จากฝ่ายล้วน — ดู lib/master/requestTypes.js
import { businessMonthKey } from '@/lib/businessDate';
import { requestDocScope } from '@/lib/master/requestTypes';

export async function generateRequestDocNo(supabase, kind, dept, now = new Date()) {
  const scope = requestDocScope(kind, dept);
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: month });
  if (error) throw new Error(`ออกเลขที่คำร้องไม่สำเร็จ: ${error.message}`);
  return `${scope}-${month}${String(data).padStart(4, '0')}`;
}

/**
 * เลขที่สำหรับ "กดส่ง" — ใบที่มีเลขแล้วใช้เลขเดิม ออกใหม่เฉพาะใบที่ยังไม่เคยส่ง
 *
 * 🐞 บั๊กจริงที่ผู้ใช้แจ้ง (IS-26080010 · 2026-08-11): ฝ่าย RD ตีกลับคำร้อง ⇒ ใบกลับ
 * เป็น `draft` โดย `docNo` ยังคาอยู่ (ตั้งใจตามมติ mig 0209 — ตีกลับคือใบเดิม ไม่ใช่
 * ใบใหม่) · แต่เส้นทางกดส่งออกเลขใหม่ทุกครั้ง ⇒ UPDATE ชน trigger
 * `guard_dept_request` (`dept_request_doc_no_immutable`) ⇒ **ใบที่ถูกตีกลับส่งซ้ำ
 * ไม่ได้เลย** ทั้งที่ทั้งฟีเจอร์ตีกลับมีไว้ให้แก้แล้วส่งใหม่
 *
 * ⚠️ `next_entity_number` เพิ่มตัวนับแบบ atomic **ก่อน** UPDATE จะถูกปฏิเสธ ⇒ ทุกครั้ง
 * ที่ผู้ใช้กดส่งซ้ำ เลขจะถูกกินทิ้งหนึ่งเลขโดยไม่มีใบไหนได้ไป (ของจริง: ตัวนับ RQ
 * เดือน 2608 วิ่งไปถึง 37 ทั้งที่เลขที่ออกจริงสูงสุดคือ RQ-26080029)
 *
 * ⚠️ นี่ไม่ใช่ด่าน "ส่งได้ไหม" — ด่านนั้นคือ `submitRequestError` · ที่นี่ตอบแค่
 * "ใช้เลขไหน" ⇒ ใบที่มีเลขแล้วต้องส่งผ่านได้ตามปกติ ห้ามเปลี่ยนเป็น error
 */
export async function ensureRequestDocNo(supabase, request, now = new Date()) {
  if (request?.docNo) return request.docNo;
  return generateRequestDocNo(supabase, request?.kind, request?.dept, now);
}

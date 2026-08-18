// ── เลขที่คำร้อง — ของกลาง ────────────────────────────────────────────────
// ออกตอนกดส่งเท่านั้น (ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง — บทเรียนใบขอราคาผลิต)
//
// scope มาจากทะเบียนหัวข้อที่เดียว (`requestDocScope`) — ไม่มีค่าเดาจากฝ่ายแล้ว
// (ถอด `RM-`/`PM-` ออก 2026-08-18 · ทะเบียนบังคับให้ทุกหัวข้อประกาศ scope เอง)
import { businessMonthKey } from '@/lib/businessDate';
import { requestDocScope } from '@/lib/master/requestTypes';

export const REQUEST_RUNNING_WIDTH = 4;

// ชิ้นส่วนของเลขที่สำหรับส่งให้ฟังก์ชัน SQL — ที่นี่ยังเป็นที่เดียวที่รู้รูปแบบเลข
export function requestDocNoParts(kind, dept, now = new Date()) {
  const scope = requestDocScope(kind);
  // ⚠️ ไม่มี scope = ทะเบียนหัวข้อผิด (registry.js กันไว้ตั้งแต่ตอนโหลด) · ตายที่นี่
  // ดีกว่าปล่อยไปให้ SQL โยน `request_scope_invalid` ตอนผู้ใช้กดส่ง
  if (!scope) throw new Error(`หัวข้อ "${kind}" ไม่มี scope ของเลขที่`);
  const month = businessMonthKey(now);
  return { scope, month, prefix: `${scope}-${month}`, width: REQUEST_RUNNING_WIDTH };
}

/**
 * กดส่ง: ออกเลข (ถ้าใบยังไม่มี) + บันทึก patch ในทรานแซกชันเดียว (mig 0243)
 *
 * 🐞 บั๊กจริงที่ผู้ใช้แจ้ง (IS-26080010 · 2026-08-11): ฝ่าย RD ตีกลับคำร้อง ⇒ ใบกลับ
 * เป็น `draft` โดย `docNo` ยังคาอยู่ (ตั้งใจตามมติ mig 0209 — ตีกลับคือใบเดิม ไม่ใช่
 * ใบใหม่) · แต่เส้นทางกดส่งออกเลขใหม่ทุกครั้ง ⇒ UPDATE ชน trigger
 * `guard_dept_request` (`dept_request_doc_no_immutable`) ⇒ **ใบที่ถูกตีกลับส่งซ้ำ
 * ไม่ได้เลย** ทั้งที่ทั้งฟีเจอร์ตีกลับมีไว้ให้แก้แล้วส่งใหม่
 *
 * ⚠️ ตอนนั้นแก้ด้วยการเช็ค `docNo` เดิมฝั่ง JS ก่อนออกเลข ซึ่งพอสำหรับอาการนั้น แต่
 * โครงยังเป็น "จองเลขก่อน แล้วค่อยเขียนแถว" — เลขถูก commit ตั้งแต่คำสั่งแรก ⇒ ทุกครั้ง
 * ที่ UPDATE ไม่ผ่าน (ด่านอื่น/ชน guard/คอนเนกชันหลุด) เลขนั้นหายถาวร ของจริงที่วัดได้:
 * ตัวนับ RQ เดือน 2608 วิ่งไปถึง 37 ทั้งที่เลขที่ออกจริงสูงสุดคือ RQ-26080029
 *
 * ⇒ ตอนนี้ทั้งการออกเลขและการเขียนแถวอยู่ในฟังก์ชัน SQL ตัวเดียว ล้มตรงไหนก็คืนเลข
 * และการเช็ค "ใบนี้มีเลขแล้วหรือยัง" ย้ายไปอยู่ใต้ `SELECT … FOR UPDATE` ⇒ สองคนกดส่ง
 * พร้อมกันก็ไม่ได้คนละเลขบนใบเดียวกัน
 *
 * ⚠️ นี่ไม่ใช่ด่าน "ส่งได้ไหม" — ด่านนั้นคือ `submitRequestError` · ที่นี่ตอบแค่
 * "ใช้เลขไหน" ⇒ ใบที่มีเลขแล้วต้องส่งผ่านได้ตามปกติ ห้ามเปลี่ยนเป็น error
 */
export function assignRequestDocNo(supabase, request, patch, now = new Date()) {
  const { scope, month, prefix, width } = requestDocNoParts(request?.kind, request?.dept, now);
  return supabase.rpc('assign_dept_request_doc_no', {
    p_id: request?.id,
    p_scope: scope,
    p_month: month,
    p_prefix: prefix,
    p_width: width,
    p_patch: patch,
  });
}

// เปิดใบแล้วส่งในจังหวะเดียว (ขออัปเดตกำหนดของเข้าจากหน้าโครงการ) — insert พร้อมเลข
// ⚠️ ห้ามใส่คีย์ docNo ลงใน row เอง ฟังก์ชัน SQL เป็นคนเติมหลังจองเลขสำเร็จ
export function insertRequestWithDocNo(supabase, row, now = new Date()) {
  const { scope, month, prefix, width } = requestDocNoParts(row?.kind, row?.dept, now);
  return supabase.rpc('create_dept_request_with_doc_no', {
    p_scope: scope,
    p_month: month,
    p_prefix: prefix,
    p_width: width,
    p_row: row,
  });
}

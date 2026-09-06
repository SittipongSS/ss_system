// ── ใครเปิด "ใบประเมินพื้นที่" อ่านได้ — ตรรกะล้วน ไม่แตะ DB/HTTP ──────────
//
// 🐞 **เจอตอน UAT 06/09/2026** — ด่านชั้นนอกของ `GET /api/service/surveys/[id]` เดิม
//   เป็น `canViewRequests` ซึ่งตอบคำถามว่า *"ตอบคิวคำร้องของฝ่ายตัวเองได้ไหม"*
//   ⇒ role `ts` (เจ้าหน้าที่หน้างาน) ตอบ **false** ⇒ คนที่จอ 06 ออกแบบมาให้ใช้
//     — คนที่ยืนอยู่หน้างานถือมือถือ — เปิดใบไม่ได้เลย ได้ 403 ตั้งแต่ GET
//   ⚠️ อาการหลอกตา: `PATCH` ของเขา **ผ่าน** (ด่านนั้นเป็น `visitWriteAccess` ถูกแล้ว)
//     ⇒ เขียนได้แต่เปิดดูไม่ได้ · ด่านอ่านแคบกว่าด่านเขียนคือหน้าจอที่ไม่มีทางใช้จริง
//
// ⭐ กติกาของโมดูลเขียนไว้ที่ `canDoFieldWork` อยู่แล้ว: *"ใช้ตัดสินเมนู/หน้าจอ"*
//   ส่วน `canWorkOwnVisit` ตัดสิน *การเขียนรายใบ* ⇒ ใบประเมินคือหน้าจอ ด่านอ่านจึงต้อง
//   ยอมทั้ง **คนคุมคิว** (Planner/หัวหน้า/SA เจ้าของใบ) และ **คนออกหน้างาน**
//
// ⚠️ **ไม่ใช่การเปิดให้อ่านทุกใบ** — ช่างอ่านได้เฉพาะใบที่ส่งถึงฝ่ายตัวเอง และ
//   *การเขียน* ยังแคบกว่านี้อีกชั้นที่นัด (เขียนได้เฉพาะงานที่ถูกมอบหมาย)
import { SERVICE_DEPARTMENT, canDoFieldWork, canViewRequests, departmentOf } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';

/** ด่านชั้นนอกราคาถูก — ใช้ตัดก่อนแตะฐาน ไม่ให้คนนอกโมดูลยิง id เดาความมีอยู่ของใบได้
 *  ⚠️ **ไม่ใช่ด่านจริง** ด่านจริงคือ `surveyReadError` ที่ดูแถวด้วย */
export function canOpenSurveySheet(user) {
  return canViewRequests(user) || canDoFieldWork(user);
}

/**
 * 🔑 **ด่านอ่านของใบประเมิน — ที่เดียว** คืนข้อความไทยเมื่ออ่านไม่ได้ หรือ `null`
 *
 * @param user     ผู้ใช้ที่กำลังเปิด
 * @param request  แถว `dept_requests` (ส่ง `null` = ยังไม่โหลด ⇒ ปฏิเสธ)
 *
 * ⚠️ fail-closed: ไม่มีใบ = ปฏิเสธ · ผู้เรียกเป็นคนแยกว่าจะตอบ 403 หรือ 404
 */
export function surveyReadError(user, request) {
  if (!canOpenSurveySheet(user)) return 'ไม่มีสิทธิ์เปิดใบประเมิน';
  if (!request) return 'ไม่พบใบคำร้อง';
  const queueSide = canViewRequests(user);
  const fieldSide = canDoFieldWork(user);

  // คนคุมคิว/เจ้าของใบ — ด่านรายแถวเดิมของระบบคำร้อง (id หลุดทางลิงก์แจ้งเตือนได้)
  if (queueSide && canReadRequestRow(user, request)) return null;

  /* ช่างหน้างาน — อ่านได้เฉพาะใบที่ **ส่งถึงฝ่ายเรา** · ตั้งใจไม่แคบลงไปถึง "ใบที่ถูก
     มอบหมายให้ฉัน" เพราะช่างต้องเปิดดูใบของกันและกันได้ตอนสลับคิวและตอนไปช่วยงาน —
     ของที่ต้องกันคือ *การแก้* ซึ่งกันอยู่แล้วที่นัด */
  if (fieldSide && request.dept === SERVICE_DEPARTMENT && departmentOf(user) === SERVICE_DEPARTMENT) {
    return null;
  }

  return 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ';
}

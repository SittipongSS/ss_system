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
import {
  SERVICE_DEPARTMENT, canDoFieldWork, canSendSurveyResult, canViewRequests, departmentOf,
} from '@/lib/permissions';
import { canAnswerRequest, canManageRequest, canReadRequestRow } from '@/lib/requests/access';

/** ด่านชั้นนอกราคาถูก — ใช้ตัดก่อนแตะฐาน ไม่ให้คนนอกโมดูลยิง id เดาความมีอยู่ของใบได้
 *  ⚠️ **ไม่ใช่ด่านจริง** ด่านจริงคือ `surveyReadError` ที่ดูแถวด้วย */
export function canOpenSurveySheet(user) {
  return canViewRequests(user) || canDoFieldWork(user);
}

/** ⭐ **ลิงก์ "คำร้อง RQ-…" บนจอประเมิน กดแล้วถึงไหม** — คนละคำถามกับด่านอ่านใบประเมิน
 *
 *  🐞 การ์ดควบคุมเคยเดาคำตอบนี้เองจาก `canWrite`/`canDecide` ("เขียนได้แต่เคาะไม่ได้
 *     = ช่าง") ซึ่งพลาด **ช่างที่ไม่ได้ถูกมอบหมายในนัดนั้น**: เขาอ่านใบของเพื่อนได้
 *     (ตั้งใจให้ได้ — ดูคอมเมนต์ใน `surveyReadError`) แต่ `canWrite = false`
 *     ⇒ ถูกจัดเป็น "คนดู" แล้วได้ลิงก์ไปหน้าคำร้องที่ตอบ 403 ใส่เขา
 *  ⇒ ถามตรง ๆ ที่ server ว่า "คนนี้เปิดหน้าคำร้องได้ไหม" แล้วส่งคำตอบไปกับ payload
 *     (จอไม่รู้ role ของตัวเอง ⇒ เดาจากธงอื่นเมื่อไรก็ได้ลิงก์ตายเมื่อนั้น)
 *
 *  ⚠️ **ไม่ใช่ด่านอ่านของใบประเมิน** — ด่านนั้นคือ `surveyReadError` ซึ่งกว้างกว่านี้
 *     โดยตั้งใจ · ตัวนี้สะท้อนด่านของ **หน้าปลายทาง** (`GET /api/sa/requests/[id]`
 *     ใช้ `canViewRequests`) ⇒ ถ้าวันไหนด่านนั้นเปลี่ยน ต้องตามมาแก้ที่นี่ที่เดียว
 */
export function canOpenRequestPage(user) {
  return canViewRequests(user);
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

// ── ใครเปิด "รายงานการประเมินพื้นที่" (เอกสาร SU-…) ได้ — คนละด่านกับใบประเมินข้างบน ─────────
//
// 🔴 **ห้ามใช้ `surveyReadError` กับเอกสาร** — ด่านนั้นตั้งใจกว้าง: AE ผู้ขอ · ช่างหน้างาน · Planner ผ่านหมด
//   ส่วนเอกสารมีฉบับภายใน (จุดติดตั้ง · แผงการเคาะผล · ภาคผนวก) ที่ฝ่ายขายห้ามได้ไม่ว่าทางไหน และช่างไม่ได้อะไรเลย
// 🔴 **ห้ามใช้ `canAnswerRequest` เดี่ยว ๆ** — AE Sup / AC Sup ผ่านตัวนั้นทาง `isSuperuser`
//   ⇒ "ออกเอกสาร" ต้องเป็นคู่เดียวกับที่ปุ่มส่งผลใช้: หัวหน้าฝ่ายบริการ **และ** ตอบใบนี้ได้
//
//   head     = canSendSurveyResult(user)        แอดมิน · หัวหน้าฝ่าย TS · CD/CM
//   exec     = role 'executive'                 ไม่ใช่ `isReadOnlyObserver` — ตัวนั้นรับ `viewer` ด้วย
//   customer = head || exec || canManageRequest ผู้ขอ · เพื่อนร่วมทีม · หัวหน้าฝ่ายขาย
//   internal = head || exec
//   issue    = head && canAnswerRequest         กด "ออกเอกสาร" (และลองใหม่)
//   draft    = issue                            ดูตัวอย่างฉบับร่าง — ทั้งสองฉบับ
//   history  = head                             รายการฉบับที่ถูกแทนที่ (เลขที่ · วันที่ · เหตุ)
//
// ⚠️ เจ้าของดีลที่ไม่ใช่ผู้ขอและไม่อยู่ทีมของใบ ไม่ได้เอกสาร — เขาเปิดหน้าคำร้องไม่ได้อยู่แล้ว
//   และกติกาของเจ้าของคือ "AE ผู้ขอ"

/** ด่านชั้นนอกราคาถูกของเอกสาร — ตัดก่อนอ่านฐานทุกครั้ง (ช่าง `ts` · `viewer` ตกตรงนี้ ไม่มี query สักตัว)
 *  ⚠️ **ไม่ใช่ด่านจริง** ด่านจริงคือ `surveyDocAccess` ที่ดูแถวด้วย */
export function canOpenSurveyDocument(user) {
  return canSendSurveyResult(user) || user?.role === 'executive' || canViewRequests(user);
}

const NO_DOC_ACCESS = Object.freeze({ customer: false, internal: false, issue: false, draft: false, history: false });

/**
 * 🔑 **ด่านของเอกสารประเมิน — ที่เดียว** route ถามคีย์ที่ตัวเองจะเสิร์ฟก่อนอ่านแถวเอกสารเสมอ
 *
 * @param user     ผู้ใช้ที่กำลังเปิด
 * @param request  แถว `dept_requests` (ต้องมี `dept` · `requestedById` · `team`)
 * @returns `{ customer, internal, issue, draft, history }` — บูลีนทุกคีย์
 *   · `customer` / `internal` = เปิดฉบับนั้นได้ (คีย์ตรงกับ `surveyDocVersion`)
 *   · `issue` = กดออกเอกสารได้ · `draft` = ดูฉบับร่างได้ · `history` = เห็นรายการฉบับเก่า
 *
 * ⚠️ fail-closed: ไม่มีผู้ใช้ · ไม่มีใบ · ไม่ผ่านด่านชั้นนอก = ไม่ได้สักคีย์
 *   (ด่านชั้นนอกถูกถามซ้ำที่นี่โดยตั้งใจ — ช่างที่บังเอิญอยู่ทีมเดียวกับใบ ต้องไม่ได้ฉบับลูกค้า
 *    แม้ผู้เรียกลืมตัดด้วย `canOpenSurveyDocument` ก่อน)
 */
export function surveyDocAccess(user, request) {
  if (!user || !request || !canOpenSurveyDocument(user)) return { ...NO_DOC_ACCESS };
  const head = canSendSurveyResult(user);
  const exec = user.role === 'executive';
  const issue = head && canAnswerRequest(user, request);
  return {
    customer: head || exec || canManageRequest(user, request),
    internal: head || exec,
    issue,
    draft: issue,
    history: head,
  };
}

/** ฉบับที่ขอ → คีย์ของ `surveyDocAccess`
 *  🔴 **สตริง `internal` ตรงตัวเท่านั้นที่เป็นฉบับภายใน** — ค่าอื่นทุกค่า (ไม่ส่ง · `Internal` · อาเรย์) = ฉบับลูกค้า
 *    (กติกาเดียวกับ `surveyReportView`) ⇒ พิมพ์ผิดไม่มีทางได้ของภายใน และไม่มีทางข้ามด่านด้วยคีย์ที่ไม่มีในแผนที่ */
export function surveyDocVersion(value) {
  return value === 'internal' ? 'internal' : 'customer';
}

// ── แก้คำร้องที่ยังไม่ถูกรับเรื่อง — ช่องไหนแก้ได้ และใครแก้ได้ ─────────────
//
// ⭐ **ช่องว่างที่ผู้ใช้ทักมา (2026-08-09)**: ก่อนหน้านี้คำร้องที่บันทึกแล้ว **แก้ไม่ได้
// เลยสักช่อง** — PATCH เป็น action-based (submit/acknowledge/pdr/…) ไม่มี "update"
// ⇒ พิมพ์ชื่อเรื่องผิดหรือลืมใส่รายละเอียด ต้องลบทั้งใบแล้วเปิดใหม่
//
// ⚠️ **แก้ได้เฉพาะช่องที่ไม่กระทบ "ใบนี้ผูกกับอะไร"** — ดีล/ใบสั่งขาย/รายการ/หัวข้อ
// เปลี่ยนไม่ได้ทางนี้ เพราะ POST มีด่านผูกของยาวเป็นร้อยบรรทัด (SO อนุมัติแล้วไหม ·
// 1 SO : 1 PDR · ดีลมีโครงการไหม · กลิ่นข้ามลูกค้า) การเขียนใหม่ที่นี่ = มีสองชุดกฎ
// ที่ต้องคอยให้ตรงกันตลอดไป ซึ่งเป็นโรคเดิมของรีโปนี้
// ⇒ อยากเปลี่ยนของที่ผูก = ลบร่างแล้วเปิดใหม่ (ร่างลบได้ ไม่กินเลขที่)
//
// ⚠️ แบบฟอร์ม PDR มีทางแก้ของตัวเองอยู่แล้ว (`action: 'pdr'` + `pdrEdit.js`) ซึ่ง
// สลับเจ้าของสิทธิ์ตอน "รับเรื่อง" — ที่นี่ไม่ยุ่งกับมัน
import { canManageRequest } from '@/lib/requests/access';
import { requestSideText } from '@/lib/requests/replyTurn';

/** ช่องที่แก้ได้ — **ที่เดียว** ที่ทั้ง API และหน้าจอถามว่า "แก้อะไรได้บ้าง"
 *
 * ⭐ `billPercent`/`billAmount` เข้ามา 2026-08-24 — "ยอดที่ขอวางบิล" เป็นช่อง
 * **บังคับ** ของแท็บ "งาน" (`formTabs.js`) แต่ไม่เคยแก้ได้ ⇒ กรอกยอดผิดหนึ่งหลัก
 * ต้องเปิดใบใหม่ทั้งใบ · ⚠️ ค่าที่ส่งมาไม่ได้ถูกเชื่อตรง ๆ — server คิดใหม่จาก
 * **ยอดจริงของใบเสนอราคา** ด้วย `resolveBillAmount` ตัวเดียวกับตอนเปิดใบ
 * ⚠️ `quotationId` ยัง **แก้ไม่ได้** — เปลี่ยนใบ = เปลี่ยนดีล/ลูกค้า/ฐานยอดทั้งชุด
 * ซึ่งเป็นด่านผูกที่ POST ถืออยู่ (ดูย่อหน้าบนสุดของไฟล์)
 */
export const REQUEST_EDITABLE_FIELDS = Object.freeze([
  'title', 'body', 'requestedDueDate', 'urgent', 'urgentReason',
  'billPercent', 'billAmount',
]);

/* ช่องที่ `requestEditPatch` **เขียนลงแถวเองได้ตรง ๆ**
   ⚠️ ต่างจากลิสต์ข้างบนที่ `billPercent`/`billAmount` — สองตัวนั้นเชื่อค่าที่ client
   ส่งมาไม่ได้ ต้องคิดใหม่จาก **ยอดจริงของใบเสนอราคา** ซึ่งต้องอ่าน DB ⇒ handler
   เป็นคนเติมลง patch เอง (`resolveBillAmount`) ไม่ใช่ฟังก์ชันบริสุทธิ์ตัวนี้ */
export const REQUEST_EDIT_PATCH_FIELDS = Object.freeze([
  'title', 'body', 'requestedDueDate', 'urgent', 'urgentReason',
]);

/* ⭐ **บรรทัดก็เป็น "ช่องที่แก้ได้" เหมือนกัน** (มติผู้ใช้ 2026-08-24) — แต่ไม่ได้อยู่
   ในลิสต์ข้างบนเพราะมันอยู่คนละตาราง (`dept_request_items`) และเขียนด้วยแผน
   update/insert/remove ไม่ใช่ patch ก้อนเดียว ⇒ กฎอยู่ที่ `requestLineEdit.js`
   ⚠️ **ขั้นที่แก้บรรทัดได้ = ขั้นเดียวกับหัวใบ** (`REQUEST_EDITABLE_STATUSES`) —
   ไม่มีลิสต์ที่สองให้ต้องคอยดูแลให้ตรงกัน */

/* ขั้นที่ยังแก้ได้ — ยังไม่มีใครรับเรื่องไปทำ
   ⚠️ `pending` (ส่งแล้วรอรับเรื่อง) แก้ได้ด้วย เพราะฝ่ายปลายทางยังไม่เริ่มงาน และ
   เป็นจังหวะที่คนเพิ่งเห็นใบของตัวเองบนคิวแล้วรู้ตัวว่าพิมพ์ผิด — กติกาเดียวกับ
   `pdrEdit.js` ที่ให้ผู้ขอถือสิทธิ์จนถึงจังหวะรับเรื่อง */
export const REQUEST_EDITABLE_STATUSES = Object.freeze(['draft', 'pending']);

/**
 * แก้ใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ บอกว่า**ทำไมแก้ไม่ได้** ไม่ใช่แค่ปฏิเสธ (กฎเดียวกับ `requestFormBlocker`)
 */
export function requestEditError(request, user) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!REQUEST_EDITABLE_STATUSES.includes(request.status)) {
    return request.status === 'cancelled'
      ? 'คำร้องถูกยกเลิกแล้ว — แก้ไม่ได้'
      : `${requestSideText(request, 'dept', 'รับเรื่องไปแล้ว')} — แก้ไม่ได้ ให้คุยต่อในเธรดแทน`;
  }
  if (!canManageRequest(user, request)) return 'แก้ได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน';
  return null;
}

/**
 * ค่าที่จะเขียนลงแถว — รับเฉพาะช่องที่แก้ได้ และตัดความยาวเท่ากับตอนเปิดใบ
 *
 * ⚠️ ตัดความยาวด้วยเลขชุดเดียวกับ POST (200/4000/500) — ต่างกันเมื่อไรจะมีใบที่
 * "แก้แล้วยาวกว่าตอนสร้าง" ซึ่ง CHECK ของ DB จะเป็นคนตีกลับด้วยข้อความดิบ
 */
export function requestEditPatch(body = {}) {
  const urgent = !!body.urgent;
  return {
    title: body.title ? String(body.title).trim().slice(0, 200) : null,
    body: body.body ? String(body.body).trim().slice(0, 4000) : null,
    requestedDueDate: body.requestedDueDate || null,
    urgent,
    // ⚠️ ถอดธงด่วน = ล้างเหตุผลทิ้ง ไม่ใช่ปล่อยค้าง — เหตุผลที่ไม่มีธงคือข้อความ
    // ที่ไม่มีใครอ่านแล้วโผล่กลับมาตอนติ๊กใหม่โดยที่คนไม่ได้เขียนรอบนี้
    urgentReason: urgent ? (body.urgentReason ? String(body.urgentReason).trim().slice(0, 500) : null) : null,
  };
}

// ── กระดิ่ง "คำร้องเลยกำหนด" (งวด 3 · มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §11) ─────────────
//
// ⭐ ผู้รับ = **ผู้ถือใบในฝ่าย** (`requestAssignee` — คนที่ถูกมอบหมาย ไม่มีค่อยถอยไปคนที่กดรับเรื่อง) ตัวเดียวกับคอลัมน์
//   "ผู้รับผิดชอบ" ในคิว · ผู้ขอไม่ได้กระดิ่ง (มติ) · ใบที่ยังไม่มีใครถือ = ไม่ยิง (ห้ามหว่านทั้งฝ่าย — กติกาผู้รับ mig 0185)
// ⭐ "เลยกำหนด" = `requestDueOwed` ตัวเดียวกับคิว/แถบตัวเลข/ป้ายเมนู — วันที่ **ฝ่ายรับปาก** · ตาฝ่าย · ใบยังไม่จบ
//   (ตาผู้ขอ/วันที่ผู้ขออยากได้ ไม่นับ — มติ 23/11/2026)
// ⭐ ครั้งเดียวต่อ (ใบ × วันรับปาก) — เลื่อนวันรับปากใหม่แล้วเลยอีก = กุญแจใหม่ = ยิงใหม่ · ไม่ยิงย้อนใบที่เลยเกิน 7 วัน
// ⚠️ ฟังก์ชันบริสุทธิ์ — cron daily-digest ดึงใบ (+ แถวของใบ ผ่าน `attachReworkRows`) แล้วส่ง `todayIso` วันไทยเข้ามา
// ⚠️ ใบประเมินพื้นที่ (`kind: 'site_survey'`) พาไปจอฝ่ายบริการ — ช่างเปิดหน้าคำร้องไม่ได้ (role `ts` ⇒ 403)
// ⭐ ใบประเมินพื้นที่นับ **วันส่งผล** — `requestDueOwed` → `liveDueDate` รู้เองแล้ว (มติเจ้าของ 24/11/2026 · ตัวเดียวกับคิว)
//    🪦 #2115 เคยมีตัวแยก `requestBellDue` ระหว่างที่คิวยังนับจากวันนัด
import { requestAssignee } from '@/lib/requests/assign';
import { requestDueOwed } from '@/lib/requests/queueBoard';
import { calendarDays, dueBellFresh } from '@/lib/dueState';
import { fmtDate } from '@/lib/format';

export const REQUEST_OVERDUE_KIND = 'request_overdue';
export const requestOverdueDedupeKey = (requestId, due) => `request_overdue:${requestId}:${due}`;

const SURVEY_REQUEST_KIND = 'site_survey';
const text = (value) => String(value ?? '').trim();

/** ลิงก์ของใบ — ใบประเมินพื้นที่ไปจอของฝ่ายบริการ · ที่เหลือไปหน้าคำร้อง */
export function requestOverdueHref(request) {
  return request?.kind === SURVEY_REQUEST_KIND ? `/service/surveys/${request.id}` : `/requests/${request.id}`;
}

/**
 * กระดิ่งของใบที่เพิ่งเลยวันรับปาก — หนึ่งแถวต่อใบ ถึงผู้ถือใบคนเดียว
 * @param requests  แถว `dept_requests` ที่มี `items` (แถวทั้งใบ — `requestDueOwed` ตัดสินตาจากแถว)
 * @param directory Map id → ผู้ใช้ (ตัดบัญชีที่ปิดแล้ว · ไม่รู้จัก ≠ ปิดบัญชี)
 * @returns payload ของ `notifyUsers`
 */
export function requestOverdueNotices(requests = [], { todayIso, directory = null } = {}) {
  const out = [];
  for (const request of requests || []) {
    /* ⚠️ ไม่มีแถวของใบ (โหลดแถวพัง — `attachReworkRows` คืนใบเปล่าแทนการ throw) = ตัดสินตาไม่ได้ ⇒ ไม่ยิง
       (ใบไม่มีแถว `requestNextStep` อ่านเป็น "ตาฝ่าย" ⇒ ใบตาผู้ขอจะได้กระดิ่งผิดฝั่ง · รีวิว 24/11/2026) */
    if (!request?.id || !Array.isArray(request.items)) continue;
    const due = requestDueOwed(request);
    if (!due || !dueBellFresh(due, todayIso)) continue;
    const holder = text(requestAssignee(request).id);
    if (!holder || directory?.get?.(holder)?.disabled) continue;
    const days = calendarDays(due, todayIso);
    const doc = text(request.docNo) || text(request.title) || 'คำร้อง';
    out.push({
      userIds: [holder],
      entityType: 'dept_request',
      entityId: request.id,
      kind: REQUEST_OVERDUE_KIND,
      dedupeKey: requestOverdueDedupeKey(request.id, due),
      title: `คำร้องเลยกำหนด ${days} วัน · ${doc}`,
      body: [
        text(request.docNo) ? text(request.title) : '',
        `${request.kind === SURVEY_REQUEST_KIND ? 'รับปากส่งผล' : 'รับปากส่ง'} ${fmtDate(due)}`,
      ].filter(Boolean).join(' · '),
      href: requestOverdueHref(request),
    });
  }
  return out;
}

// ── คำร้องข้ามฝ่าย (mig 0173) — façade ────────────────────────────────────
//
// ⭐ ไฟล์นี้เคยเป็นที่อยู่ของ logic ทั้งหมด · P0a แตกออกเป็นโมดูลกลางใต้
// `lib/requests/` เพื่อให้แต่ละฝ่าย (RD · PC · บัญชี) ขยายของตัวเองได้โดยไม่ต้อง
// แตะไฟล์เดียวกันตลอดเวลา — ดูแผน "รื้อคำร้อง RD" ชั้น CORE
//
//   statuses.js  สถานะ 6 ขั้น · ป้าย · โทน
//   docNo.js     เลขที่ (ออกตอนกดส่ง)
//   lines.js     บรรทัด + ชั้นจำนวน
//   stages.js    ด่านของแต่ละ action + ความคืบหน้า
//   access.js    ใครแตะใบนี้ได้
//   queue.js     ลำดับคิว · กำหนดวันตอบ · ป้ายสรุป
//   pins.js      หมุดไทม์ไลน์
//   outcomes.js  ผลลัพธ์ตอนปิดเรื่อง
//
// **ไฟล์นี้อยู่ต่อในฐานะทางเข้าเดิม** — ผู้เรียก 15 จุด (API routes, หน้าจอ,
// DealTimelineTable, costingAttachmentAccess …) ไม่ต้องแก้ import เลย
// ⚠️ ห้ามเพิ่ม logic ใหม่ที่นี่ — เขียนในโมดูลแล้ว re-export ผ่านบรรทัดข้างล่าง
export {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  REQUEST_OPEN_STATUSES,
  REQUEST_ITEM_STATUS_LABELS,
  normalizeRequestStatus,
} from '@/lib/requests/statuses';

export { generateRequestDocNo } from '@/lib/requests/docNo';

export {
  MAX_REQUEST_ITEMS,
  MAX_REQUEST_TIERS,
  normalizeRequestItems,
  normalizeRequestTiers,
} from '@/lib/requests/lines';

export {
  requestProgress,
  deriveRequestStatusAfterAnswer,
  submitRequestError,
  acknowledgeRequestError,
  bounceRequestError,
  answerRequestError,
  closeRequestError,
  cancelRequestError,
  deleteRequestError,
} from '@/lib/requests/stages';

export {
  canAnswerRequest,
  canManageRequest,
  canViewRequest,
  canReadRequestRow,
} from '@/lib/requests/access';

export {
  requestDueTone,
  compareRequestUrgency,
  requestSummaryText,
} from '@/lib/requests/queue';

export {
  requestsByStepKey,
  stepPinSummary,
} from '@/lib/requests/pins';

export {
  REQUEST_OUTCOMES,
  OUTCOME_REGISTRY_BY_KIND,
  requestNeedsOutcome,
  closeOutcomeError,
} from '@/lib/requests/outcomes';

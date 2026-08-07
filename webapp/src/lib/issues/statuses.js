// ── สถานะ · ประเภท · ผลกระทบ ของเรื่องแจ้งปัญหาระบบ (mig 0219) ──────────
//
// แยกเป็นไฟล์ค่าคงที่ล้วน (ไม่มี I/O ไม่ import ชั้นสิทธิ์) เพื่อให้ทั้ง client
// (ป้าย/dropdown) และ server (validate) ใช้ชุดเดียวกัน — แพตเทิร์นเดียวกับ
// `lib/requests/statuses.js`
//
// ⚠️ **โทนของ pill = ชื่อโทนของ `<StatusBadge>` ไม่ใช่ค่าสี** — หน้าจอจึงไม่ต้อง
// รู้จัก token สีเลย และเปลี่ยนดีไซน์ป้ายได้ที่ `Badge.module.css` ที่เดียวทั้งระบบ

export const ISSUE_STATUSES = ['pending', 'acknowledged', 'resolved', 'closed', 'rejected'];

export const ISSUE_STATUS_LABELS = {
  pending: 'แจ้งแล้ว — รอรับเรื่อง',
  acknowledged: 'รับเรื่องแล้ว — กำลังแก้',
  resolved: 'แก้แล้ว — รอยืนยัน',
  closed: 'ปิดเรื่อง',
  rejected: 'ไม่ใช่บั๊ก / ไม่ทำ',
};

export const ISSUE_STATUS_TONES = {
  pending: 'warning',
  acknowledged: 'info',
  resolved: 'success',
  closed: 'neutral',
  rejected: 'neutral',
};

// เรื่องที่ "ยังเดินอยู่" — ใช้กรองคิวและนับงานค้างของแอดมิน
export const ISSUE_OPEN_STATUSES = ['pending', 'acknowledged', 'resolved'];

// ── ประเภทเรื่อง ────────────────────────────────────────────────────────
// แยกสามค่าตั้งแต่วันแรกโดยเจตนา — ปล่อยให้ปนกันก่อนแล้วค่อยแยกทีหลังคือแยกไม่ออก
export const ISSUE_KINDS = ['bug', 'request', 'question'];

export const ISSUE_KIND_LABELS = {
  bug: 'บั๊ก',
  request: 'ขอปรับ / ขอเพิ่ม',
  question: 'ถามวิธีใช้',
};

// ── ผลกระทบต่อการทำงาน ──────────────────────────────────────────────────
// ⭐ ตั้งใจ **ไม่** ใช้คำว่า "ด่วน" — ถามความด่วนจะได้ "ด่วนมาก" ทุกใบจนเรียง
// ลำดับไม่ได้ · ถามว่างานหยุดไหมเป็นข้อเท็จจริงที่ผู้แจ้งตอบได้และแอดมินตรวจได้
export const ISSUE_IMPACTS = ['blocked', 'workaround', 'minor'];

export const ISSUE_IMPACT_LABELS = {
  blocked: 'ทำงานต่อไม่ได้',
  workaround: 'ติด แต่มีทางเลี่ยง',
  minor: 'เรื่องเล็ก',
};

export const ISSUE_IMPACT_TONES = {
  blocked: 'danger',
  workaround: 'warning',
  minor: 'neutral',
};

// ลำดับความสำคัญของคิว — เลขน้อยมาก่อน (ใช้เรียงคิวแอดมิน)
// ⚠️ คิวเรียงตาม **ผลกระทบก่อนเวลา** — เรื่อง blocked ของเมื่อวานต้องอยู่เหนือ
// เรื่องเล็กที่เพิ่งแจ้งเมื่อเช้า ไม่งั้นคิวจะกลายเป็นรายการ "ใหม่สุดก่อน" ที่ไม่มี
// ความหมายกับคนที่ทำงานไม่ได้อยู่
export const ISSUE_IMPACT_ORDER = { blocked: 0, workaround: 1, minor: 2 };

export function normalizeIssueStatus(value) {
  const v = String(value || '').trim();
  return ISSUE_STATUSES.includes(v) ? v : 'pending';
}

export function normalizeIssueKind(value) {
  const v = String(value || '').trim();
  return ISSUE_KINDS.includes(v) ? v : 'bug';
}

export function normalizeIssueImpact(value) {
  const v = String(value || '').trim();
  return ISSUE_IMPACTS.includes(v) ? v : 'workaround';
}

export const issueStatusLabel = (status) => ISSUE_STATUS_LABELS[status] || status || '—';
export const issueKindLabel = (kind) => ISSUE_KIND_LABELS[kind] || kind || '—';
export const issueImpactLabel = (impact) => ISSUE_IMPACT_LABELS[impact] || impact || '—';

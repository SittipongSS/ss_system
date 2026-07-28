// ── Rev ของกลิ่น (mig 0171) — การส่งตัวอย่างให้ลูกค้า 1 ครั้ง + ผลตอบรับ ──
//
// ⚠️ ต่างจาก material_price_revisions (0157) ตรงที่ **แก้ได้** — feedback ของ
// ลูกค้ามาทีหลังวันส่งเสมอ ห้ามลอก guard immutable ของราคามาใส่ที่นี่
// (ผู้ใช้ระบุมาตรง ๆ ว่าอยากเก็บ Rev + Feedback — มติ 4)
import { SCENT_STATUS_LABELS } from '@/lib/master/scents';

export const SCENT_FEEDBACK_STATUSES = ['pending', 'revise', 'approved', 'rejected'];

export const SCENT_FEEDBACK_LABELS = {
  pending: 'ส่งแล้ว — รอลูกค้าตอบ',
  revise: 'ลูกค้าขอให้แก้',
  approved: 'ลูกค้าอนุมัติ',
  rejected: 'ลูกค้าไม่เอากลิ่นนี้',
};

export const SCENT_FEEDBACK_TONES = {
  pending: 'var(--amber)',
  revise: 'var(--blue)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
};

// Rev ที่ยัง "รอคำตอบ" — ใช้กันไม่ให้ส่ง Rev ใหม่ทับของที่ยังไม่รู้ผล
export function pendingRevision(revisions = []) {
  return revisions.find((r) => r.feedbackStatus === 'pending') || null;
}

export function latestRevision(revisions = []) {
  if (!revisions.length) return null;
  return [...revisions].sort((a, b) => Number(b.revisionNo) - Number(a.revisionNo))[0];
}

export function nextRevisionNo(revisions = []) {
  return (latestRevision(revisions)?.revisionNo || 0) + 1;
}

// สรุปความคืบหน้าของกลิ่น 1 ตัว — นับสดเสมอ ห้ามเก็บเป็นคอลัมน์ (กัน drift;
// แพตเทิร์นเดียวกับตัวนับอนุมัติของใบขอราคาผลิต)
export function revisionSummary(revisions = []) {
  const total = revisions.length;
  const latest = latestRevision(revisions);
  return {
    total,
    latestNo: latest?.revisionNo || 0,
    latestStatus: latest?.feedbackStatus || null,
    approved: revisions.some((r) => r.feedbackStatus === 'approved'),
    waiting: !!pendingRevision(revisions),
  };
}

// ── ด่านของแต่ละ action ──────────────────────────────────────────────────
export function sendRevisionError(scent, revisions = []) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status === 'draft') {
    return 'กลิ่นนี้ยังเป็นร่าง — RD ต้องรับเข้าทะเบียนก่อนจึงจะบันทึกการส่งกลิ่นได้';
  }
  if (scent.status === 'archived') {
    return `กลิ่นนี้อยู่ในสถานะ "${SCENT_STATUS_LABELS.archived}" — เปิดใช้ก่อนจึงจะส่งได้`;
  }
  // กันส่ง Rev ใหม่ทับของที่ยังไม่รู้ผล — ไม่งั้นเทียบไม่ได้ว่า feedback ที่เข้ามา
  // เป็นของครั้งไหน (ปัญหาเดิมของการคุยกันนอกระบบ)
  const waiting = pendingRevision(revisions);
  if (waiting) {
    return `Rev. ${waiting.revisionNo} ยังรอผลตอบรับอยู่ — บันทึกผลก่อนจึงจะส่งครั้งใหม่ได้`;
  }
  return null;
}

export function recordFeedbackError(revision, { status, feedbackAt } = {}) {
  if (!revision) return 'ไม่พบรายการส่งกลิ่น';
  if (!SCENT_FEEDBACK_STATUSES.includes(status)) return 'ผลตอบรับไม่ถูกต้อง';
  if (status === 'pending') return 'ต้องระบุผลตอบรับ (อนุมัติ / ขอให้แก้ / ไม่เอา)';
  if (!feedbackAt) return 'ต้องระบุวันที่ได้รับผลตอบรับ';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(feedbackAt))) return 'วันที่ได้รับผลตอบรับไม่ถูกต้อง';
  return null;
}

// สถานะกลิ่นที่ควรเป็นหลังบันทึก feedback — ระบบขยับให้เอง ไม่ต้องให้ใครกดซ้ำ
//   approved → กลิ่นใช้งานได้ (active)
//   revise   → กลับไปพัฒนาต่อ (developing)
//   rejected → ไม่แตะสถานะ (คนตัดสินเองว่าจะเลิกใช้หรือลองใหม่ — ระบบเดาแทนไม่ได้)
// คืน null = ไม่ต้องเปลี่ยนสถานะ
export function scentStatusAfterFeedback(scent, status) {
  if (!scent || scent.status === 'archived') return null;
  if (status === 'approved') return scent.status === 'active' ? null : 'active';
  if (status === 'revise') return scent.status === 'developing' ? null : 'developing';
  return null;
}

// ── ตรวจข้อมูลก่อนบันทึก ─────────────────────────────────────────────────
export function normalizeRevisionInput(body = {}) {
  const sentAt = String(body.sentAt ?? '').trim();
  if (!sentAt) return { value: null, error: 'ต้องระบุวันที่ส่งกลิ่น' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentAt)) return { value: null, error: 'วันที่ส่งกลิ่นไม่ถูกต้อง' };

  const sampleCode = String(body.sampleCode ?? '').trim();
  if (sampleCode.length > 100) return { value: null, error: 'รหัสตัวอย่างยาวเกิน 100 ตัวอักษร' };

  const note = String(body.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  return { value: { sentAt, sampleCode: sampleCode || null, note: note || null }, error: null };
}

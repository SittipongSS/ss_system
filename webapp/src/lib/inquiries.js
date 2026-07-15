// ── ระบบสอบถาม–ตอบกลับ (Inquiry) ฝ่ายขาย ↔ ฝ่ายที่ถูกถาม (เริ่มที่ RD) ──
// หลักการ "เก็บแยก โชว์รวม": เธรดถาม-ตอบมีสถานะ/SLA ของตัวเอง (ตาราง inquiries +
// inquiry_messages — mig 0104) แล้ว merge เหตุการณ์เข้าฟีดความเคลื่อนไหวของดีล
// ตอนอ่าน. ฝั่งถาม = ฝ่ายขาย (สร้าง/ถามต่อ/ปิด — คนถามคือคนตัดสินว่าคำตอบพอ),
// ฝั่งตอบ = role rd ของฝ่ายเป้าหมาย (รับเรื่อง/ตอบ — cap inquiries:respond).
import { canUser, isSuperuser, normalizeDepartment } from '@/lib/permissions';
import { inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { businessMonthKey } from '@/lib/businessDate';

export const INQUIRY_STATUSES = ['open', 'answered', 'closed'];
export const INQUIRY_STATUS_LABELS = {
  open: 'รอตอบ',
  answered: 'ตอบแล้ว',
  closed: 'ปิดเรื่อง',
};

// ฝ่ายที่รับข้อสอบถามได้ตอนนี้ — เพิ่มฝ่ายอื่นภายหลังได้โดยไม่แตะ schema
export const INQUIRY_TARGET_DEPTS = ['RD'];

// SLA ตอบกลับมาตรฐาน (มติผู้ใช้ 2026-07-15): 3 วันทำการ
export const INQUIRY_SLA_BUSINESS_DAYS = 3;

export function normalizeInquiryStatus(value) {
  return INQUIRY_STATUSES.includes(value) ? value : 'open';
}

// ── สิทธิ์ ──────────────────────────────────────────────────────────────
// ผู้ตอบ: อยู่ฝ่ายเดียวกับ targetDept และถือ cap inquiries:respond (role rd);
// superuser ช่วยตอบแทนได้ (break-glass — เช่นช่วง RD ไม่อยู่ทั้งฝ่าย)
export function canRespondInquiry(user, inquiry) {
  if (!user || !inquiry) return false;
  if (isSuperuser(user.role)) return true;
  return canUser(user, 'inquiries:respond')
    && normalizeDepartment(user.department) === inquiry.targetDept;
}

// ผู้ถาม/ทีมผู้ถาม: ใช้ scope แก้ไขงานขายเดิม (AE = ดีลตัวเอง, AC/Senior = ทีม,
// superuser = ทั้งหมด) บน record ตัวแทน {team, ownerId=requesterId}
export function inInquiryRequesterScope(user, inquiry) {
  if (!user || !inquiry) return false;
  return inSalesEditScope(user, { team: inquiry.team, ownerId: inquiry.requesterId });
}

// การมองเห็นรายเรื่อง: ฝั่งตอบเห็นทุกเรื่องของฝ่ายตน, ฝั่งขายเห็นตาม view scope
// เดิมของดีล (viewer เห็นหมดอยู่แล้วผ่าน scope 'all')
export function canViewInquiry(user, inquiry) {
  if (!user || !inquiry) return false;
  if (canRespondInquiry(user, inquiry)) return true;
  return inSalesViewScope(user, { team: inquiry.team, ownerId: inquiry.requesterId });
}

// ปิด/แก้หัวเรื่อง: ผู้ถามหรือทีมของผู้ถาม (คนถามเป็นคนตัดสินว่าคำตอบใช้ได้จริง)
export function canCloseInquiry(user, inquiry) {
  return inInquiryRequesterScope(user, inquiry);
}

// ── เลขที่เรื่อง: IQ-YYMMXXXX (เลขรัน atomic ต่อเดือน — RPC เดิม mig 0096) ──
export async function generateInquiryCode(supabase, now = new Date()) {
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: 'IQ', p_month: month });
  if (error) throw new Error(`ออกเลขที่เรื่องสอบถามไม่สำเร็จ: ${error.message}`);
  return `IQ-${month}${String(data).padStart(4, '0')}`;
}

// ── ไฟล์แนบ: รับเฉพาะ ref ไฟล์ที่อัปผ่าน /api/upload แล้ว (แพตเทิร์นเดียวกับ
// sales_deal_activities — เก็บแค่ตัวชี้ กัน payload แปลกปลอม) ──
const MAX_ATTACHMENTS = 8;
export function sanitizeInquiryAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a === 'object' && typeof a.fileUrl === 'string' && a.fileUrl)
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      fileUrl: String(a.fileUrl),
      driveFileId: a.driveFileId ? String(a.driveFileId) : null,
      fileName: a.fileName ? String(a.fileName).slice(0, 200) : null,
      mimeType: a.mimeType ? String(a.mimeType).slice(0, 100) : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? Number(a.sizeBytes) : null,
    }));
}

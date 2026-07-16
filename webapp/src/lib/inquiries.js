// ── ระบบสอบถาม–ตอบกลับ (Inquiry) ฝ่ายขาย ↔ ฝ่ายที่ถูกถาม (เริ่มที่ RD) ──
// หลักการ "เก็บแยก โชว์รวม": เธรดถาม-ตอบมีสถานะของตัวเอง (ตาราง inquiries +
// inquiry_messages — mig 0104) แล้ว merge เหตุการณ์เข้าฟีดความเคลื่อนไหวของดีล
// ตอนอ่าน. ฝั่งถาม = ฝ่ายขาย (สร้าง/ถามต่อ/ปิด — คนถามคือคนตัดสินว่าคำตอบพอ),
// ฝั่งตอบ = role rd ของฝ่ายเป้าหมาย (รับเรื่อง/ตอบ — cap inquiries:respond).
// กำหนดตอบ (มติผู้ใช้ 2026-07-16): ไม่มี SLA อัตโนมัติแล้ว — RD ระบุวันที่จะตอบ
// ตอนกดรับเรื่อง (บังคับ) แล้ววันนั้นเป็นเส้นวัด KPI. เลื่อนได้ แต่ลงเธรดทุกครั้ง.
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

export function normalizeInquiryStatus(value) {
  return INQUIRY_STATUSES.includes(value) ? value : 'open';
}

// ลำดับความเร่งของคิว (ใช้ร่วมหน้ารวมเรื่อง + action queue แดชบอร์ด RD):
// เรื่องที่ยังไม่มีผู้รับมาก่อนเสมอ (รอนานสุดขึ้นก่อน) เพราะยังไม่มีใครรับปากวันตอบ
// = ยังไม่มีกำหนด ถ้าเรียงด้วยวันที่ล้วนมันจะตกไปท้ายคิวทั้งที่เร่งที่สุด
export function compareInquiryUrgency(a, b) {
  const taken = (q) => (q?.assigneeId ? 1 : 0);
  if (taken(a) !== taken(b)) return taken(a) - taken(b);
  if (!a?.assigneeId) return String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
  return String(a?.committedDueDate || '9999').localeCompare(String(b?.committedDueDate || '9999'));
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

export function isInquiryAdmin(user) {
  return user?.role === 'admin';
}

// The take button is an RD operational action. Admin retains edit/delete
// override authority but does not appear as an RD assignee in the normal UI.
export function canTakeInquiry(user, inquiry) {
  if (!user || !inquiry || inquiry.status === 'closed') return false;
  return user.role === 'rd'
    && canUser(user, 'inquiries:respond')
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


export function inquirySide(user, inquiry) {
  if (!user || !inquiry) return null;
  if (canTakeInquiry(user, inquiry) && inquiry.acceptedAt && inquiry.assigneeId === user.id) return 'responder';
  if (inInquiryRequesterScope(user, inquiry)) return 'requester';
  return null;
}

export function canEditInquiryRequest(user, inquiry) {
  if (isInquiryAdmin(user)) return true;
  return inquiry?.status !== 'closed' && !inquiry?.acceptedAt
    && inInquiryRequesterScope(user, inquiry);
}

export function canDeleteInquiry(user, inquiry) {
  if (isInquiryAdmin(user)) return true;
  return !inquiry?.acceptedAt && inInquiryRequesterScope(user, inquiry);
}

// เลื่อนวันที่รับปากว่าจะตอบ — เฉพาะผู้รับเรื่องคนนั้น (ทุกครั้งลงเหตุการณ์ในเธรด)
export function canEditInquiryResponse(user, inquiry) {
  if (isInquiryAdmin(user)) return true;
  return inquiry?.status !== 'closed' && !!inquiry?.acceptedAt
    && inquiry?.assigneeId === user?.id && canTakeInquiry(user, inquiry);
}

export function canMutateInquiryMessage(user, inquiry, message) {
  if (!user || !inquiry || !message || message.deletedAt) return false;
  // admin (break-glass): จัดการได้ทุกชนิดข้อความ รวม system/status ที่คนทั่วไปแตะไม่ได้
  // — ตราบใดที่ยังไม่ถูกลบไปแล้ว (กันลบซ้ำ).
  if (isInquiryAdmin(user)) return true;
  // คนทั่วไป: เฉพาะคอมเมนต์ของตัวเอง เรื่องยังไม่ปิด และยังไม่ถูกรับทราบ
  if (message.kind !== 'comment') return false;
  return inquiry.status !== 'closed' && message.authorId === user.id && !message.acknowledgedAt;
}

export function canAcknowledgeInquiryMessage(user, inquiry, message) {
  if (!user || !inquiry || !message || message.kind !== 'comment' || message.deletedAt || message.acknowledgedAt) return false;
  if (isInquiryAdmin(user)) return true;
  if (message.authorId === user.id) return false;
  const side = inquirySide(user, inquiry);
  if (!side) return false;
  const fromResponder = normalizeDepartment(message.authorDept) === inquiry.targetDept;
  return (side === 'requester' && fromResponder) || (side === 'responder' && !fromResponder);
}

// ── บริบท ลูกค้า › โครงการ › ดีล ───────────────────────────────────────
// ทุกเรื่องสอบถามต้องมีครบทั้งสาม (มติผู้ใช้ 2026-07-16) — RD ต้องเปิดดูงานต้นทาง
// ได้เสมอ. ดีลเป็นตัวตั้ง: ลูกค้า/โครงการอ่านจากดีลจริงเสมอ ไม่เชื่อค่าที่ client ส่ง
// (กัน UI ค้างส่งคู่ที่ไม่ตรงกัน แล้วเรื่องไปโผล่ใต้โครงการผิดตัว).
// คืน { error, status? } ถ้าไม่ผ่าน หรือ { deal, context } ถ้าผ่าน.
export async function resolveInquiryContext(supabase, user, body = {}) {
  if (!body.dealId) return { error: 'ต้องเลือกดีล' };
  const { data: deal } = await supabase
    .from('sales_deals')
    .select('id, code, title, customerId, customerName, projectId, team, ownerId')
    .eq('id', body.dealId)
    .maybeSingle();
  if (!deal) return { error: 'ไม่พบดีล' };
  if (!inSalesEditScope(user, deal)) return { error: 'ไม่มีสิทธิ์สอบถามในนามดีลนี้', status: 403 };
  if (!deal.customerId) return { error: 'ดีลนี้ยังไม่ได้ระบุลูกค้า — ระบุลูกค้าที่หน้าดีลก่อน' };
  if (!deal.projectId) return { error: 'ดีลนี้ยังไม่ได้เชื่อมโครงการ — เชื่อมโครงการที่หน้าดีลก่อน' };
  if (body.projectId && body.projectId !== deal.projectId) return { error: 'โครงการที่เลือกไม่ตรงกับดีล' };
  if (body.customerId && body.customerId !== deal.customerId) return { error: 'ลูกค้าที่เลือกไม่ตรงกับดีล' };
  return {
    deal,
    context: {
      dealId: deal.id,
      projectId: deal.projectId,
      customerId: deal.customerId,
      team: deal.team ?? user?.team ?? null,
    },
  };
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

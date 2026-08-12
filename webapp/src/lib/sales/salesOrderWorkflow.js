// กติกาสถานะ/สิทธิ์ของใบสั่งขาย — ใช้ร่วมกันทั้งหน้าเว็บและ route (pure, ไม่แตะ DB)
import { isSuperuser } from '@/lib/permissions';

export const SALES_ORDER_STATUS_LABELS = {
  draft: 'ฉบับร่าง',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับ',
  revised: 'ออกฉบับแก้ไขแล้ว',
  approval_revoked: 'ยกเลิกอนุมัติแล้ว',
  cancelled: 'ยกเลิก',
};

export function isSalesOrderReviewer(role) {
  return role === 'ae_supervisor' || role === 'admin';
}

/* การยื่น = การลงนามช่อง "ฝ่ายขาย" บนใบ (mig 0153 ตรึงหลักฐานตอนยื่น) และช่องนั้นเป็น
   ของ AE เจ้าของดีล — AC สร้างใบแทนได้ตามเดิม แต่ต้องส่งต่อให้เจ้าของดีลกดยื่นเอง
   ไม่งั้นลายเซ็นในช่องจะเป็นของคนที่ไม่ได้รับผิดชอบดีล (มติผู้ใช้ 2026-08-05)
   กติกาเดียวกับ canApproveQuotation ของใบเสนอราคา — ยึด ownerId ไม่ยึดชื่อ */
export function canSubmitSalesOrder(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user?.role)) return true;
  return !!user.id && user.id === deal.ownerId;
}

export function isSalesOrderSubmitter(order, userId) {
  return Boolean(userId)
    && order?.status === 'pending_approval'
    && order?.submittedBy === userId;
}

/* "รอฉันลงมือ" ของใบสั่งขาย — ใบที่ผู้รีวิว **ตีกลับ** มาให้คนสร้างแก้
   ⚠️ `draft` ไม่นับ แม้จะเป็นใบของตัวเอง — ร่างที่ยังไม่เคยยื่นไม่มีใครรออยู่ปลายทาง
   (กติกาเดียวกับใบร่างคำร้อง ม-112 และใบเสนอราคา) · ต่างกันตรงใบสั่งขายเก็บ "ตีกลับ"
   เป็น `status` ของมันเอง จึงไม่ต้องดูเหตุผลค้างเหมือนใบเสนอราคา
   ⭐ **เลนผู้รีวิวเติมใน ม-119** — ใบที่ยื่นมาแล้วรออนุมัติ (`pending_approval`)
   ผู้รีวิวคือ role ระดับหัวหน้า (`isSalesOrderReviewer`) **ไม่ใช่เจ้าของดีล** แบบใบเสนอราคา
   ⇒ ต้องส่ง `reviewer` เข้ามา ห้ามเดาจาก `userId`
   ⚠️ ใบที่ตัวเองยื่นแล้วตัวเองอนุมัติได้ก็นับ — ระบบเปิดให้จริง (route อนุมัติเช็คแค่
   `reviewer`) ⇒ มันรอเราลงมืออยู่จริง ไม่ใช่ของคนอื่น */
export function isSalesOrderWaitingOnMe(order, { userId = '', reviewer = false } = {}) {
  if (!order) return false;
  if (reviewer && order.status === 'pending_approval') return true;
  return Boolean(userId) && order.status === 'rejected' && order.createdBy === userId;
}

// ดึงกลับ = **ของผู้ยื่นเท่านั้น** (มติ 2026-07-26) — ผู้รีวิวที่อยากส่งเอกสารกลับใช้
// "ตีกลับ" ซึ่งเก็บเหตุผลเป็นคอลัมน์ แสดงบนใบ และแจ้ง chat ให้ทีมขาย ส่วนการดึงกลับ
// เก็บเหตุผลไว้ใน metadata แล้วไม่มีใครแสดง = ส่งเอกสารกลับแบบเงียบเมื่อผู้รีวิวใช้
// ไม่เกิดทางตัน: ผู้รีวิวยังตีกลับได้เสมอ แม้ผู้ยื่นไม่อยู่แล้ว
export function canWithdrawSalesOrderSubmission(order, { userId = '' } = {}) {
  return order?.status === 'pending_approval'
    && isSalesOrderSubmitter(order, userId);
}

export function canEditSalesOrderContent(
  order,
  { canEdit = false, inScope = false } = {},
) {
  return Boolean(order)
    && canEdit
    && inScope
    && (order.status === 'draft' || order.status === 'rejected');
}

// สองขั้นแยกกัน (mig 0166): ยกเลิกอนุมัติ → สถานะกลางที่แก้ไม่ได้ → ออก Rev.
// เหตุผลกรอกครั้งเดียวที่ขั้นแรก เพราะเป็นเจตนาเดียวที่ถูกแบ่งเป็นสองคลิก
export function canRevokeSalesOrderApproval(order, { reviewer = false } = {}) {
  return Boolean(order) && reviewer && order.status === 'approved';
}

export function canIssueSalesOrderRevision(order, { reviewer = false } = {}) {
  return Boolean(order) && reviewer && order.status === 'approval_revoked';
}

// Hard delete is only cleanup for a draft that has never entered the signed
// workflow. Historical evidence remains authoritative even after the active
// pointer is cleared by cancellation or restore-to-draft.
export function canHardDeleteSalesOrder(order) {
  return order?.status === 'draft'
    && !order?.signatureEvidenceId
    && !order?.hasSignatureEvidence;
}

// revision chain ของ SO ผูกกันด้วย FK `ON DELETE RESTRICT` ทั้งสองทิศ (mig 0161:
// revisedFromId / supersededById) — ลบใบที่ยังมีอีกฉบับชี้อยู่จะเด้ง error Postgres ดิบ
// ออกหน้าเว็บ. ตรวจก่อนลบแล้วบอกทางออก (A4, 2026-07-26). ใช้ revisionHistory ที่ loadOrder
// โหลดมาอยู่แล้วเพื่อแปลง id เป็นเลขที่เอกสารให้คนอ่านรู้เรื่อง
export function salesOrderRevisionChainDeleteBlock(order) {
  if (!order) return null;
  const history = Array.isArray(order.revisionHistory) ? order.revisionHistory : [];
  const numberOf = (id) => history.find((row) => row.id === id)?.orderNumber || id;
  if (order.supersededById) {
    return `ลบถาวรไม่ได้: SO นี้ถูกแทนที่ด้วยฉบับ Revision ${numberOf(order.supersededById)} แล้ว`
      + ' — ต้องจัดการฉบับ Revision ก่อน จึงจะลบใบต้นทางได้';
  }
  if (order.revisedFromId) {
    return `ลบถาวรไม่ได้: SO นี้เป็นฉบับ Revision ของ ${numberOf(order.revisedFromId)} ซึ่งยังชี้มาที่ใบนี้อยู่`
      + ' — กรุณาใช้ “ยกเลิก SO” แทน';
  }
  return null;
}

// ตาข่ายกันพลาดชั้นสอง เผื่อ chain เกิดขึ้นหลังจากอ่านแถวแล้ว — 23503 = foreign_key_violation
export function isForeignKeyViolation(error) {
  if (!error) return false;
  if (error.code === '23503') return true;
  return /violates foreign key constraint/i.test(String(error.message || ''));
}

// เหตุผลยกเลิก SO แบบมาตรฐาน (มติผู้ใช้ 2026-07-18) — 3 กลุ่ม:
//   customer = ฝั่งลูกค้า (ดีลหลุดจริง → พิจารณาย้อน Won ในอนาคต)
//   document = แก้เอกสาร (ดีลยังอยู่ ออก SO ใหม่)
//   data     = ข้อมูลพลาด
// เก็บเป็น cancelReasonCode (โครงสร้าง) คู่กับ cancelReason (หมายเหตุอิสระ) เพื่อรายงาน.
export const SALES_ORDER_CANCEL_REASONS = [
  { code: 'customer_cancelled', group: 'customer', label: 'ลูกค้ายกเลิกคำสั่งซื้อ' },
  { code: 'customer_no_payment', group: 'customer', label: 'ลูกค้าไม่ชำระ / ผิดเงื่อนไข' },
  { code: 'switched_option', group: 'customer', label: 'เปลี่ยนไปใช้ข้อเสนอ/ใบเสนอราคาอื่น' },
  { code: 'wrong_document', group: 'document', label: 'ออก SO ผิด (ผิดใบ/ดีล/ลูกค้า)' },
  { code: 'reissue_correction', group: 'document', label: 'แก้รายการ/ราคา — ออก SO ใหม่' },
  { code: 'duplicate_test', group: 'data', label: 'รายการซ้ำ / ทดสอบ' },
  { code: 'other', group: 'data', label: 'อื่น ๆ (ระบุในหมายเหตุ)' },
];

const CANCEL_REASON_CODES = new Set(SALES_ORDER_CANCEL_REASONS.map((r) => r.code));
export function isValidCancelReasonCode(code) {
  return CANCEL_REASON_CODES.has(code);
}
export function cancelReasonLabel(code) {
  return SALES_ORDER_CANCEL_REASONS.find((r) => r.code === code)?.label || code || '';
}

// เหตุกลุ่ม "ฝั่งลูกค้า" = ดีลหลุดจริง → เสนอให้ย้อน Won (มติ 2026-07-18).
// กลุ่ม document/data = ดีลยังอยู่ (แก้เอกสาร/ข้อมูลพลาด) ไม่ต้องถอยดีล.
export function isCustomerCancelReason(code) {
  return SALES_ORDER_CANCEL_REASONS.find((r) => r.code === code)?.group === 'customer';
}

// ปลายทางเมื่อย้อน Won: reopen = กลับสถานะเปิดก่อน Won · lost = ลูกค้าเลิกถาวร
export const WON_REVERSAL_TARGETS = ['reopen', 'lost'];
export function isValidReversalTarget(target) {
  return WON_REVERSAL_TARGETS.includes(target);
}

export function salesOrderActual(order) {
  return order?.status === 'approved' ? Math.max(0, Number(order.actualAmount) || 0) : 0;
}

// sales_deals.wonValue is only a compatibility cache. Treat it as Actual only
// when the database marked the value as derived from approved Sale Orders —
// หรือเป็น 'legacy': ดีลเก่าจากระบบเดิมที่กรอก "มูลค่าที่ปิด" ตรงตอนย้ายระบบ
// (มติผู้ใช้ 2026-08-08) · เมื่อมี SO จริงมาผูกภายหลัง trigger ฝั่ง DB (0107/0108)
// จะทับ wonValue + actualSource เป็น 'sale_order' เอง — ยอดสดชนะยอดย้าย ไม่นับซ้ำ
export function dealActualFromSalesOrders(deal) {
  const source = deal?.metadata?.actualSource;
  if (source !== 'sale_order' && source !== 'legacy') return 0;
  return Math.max(0, Number(deal?.wonValue) || 0);
}

export function canSalesOrderTransition(status, action, { reviewer = false, admin = false } = {}) {
  if (action === 'save' || action === 'submit') return status === 'draft' || status === 'rejected';
  if (action === 'approve' || action === 'reject') return reviewer && status === 'pending_approval';
  if (action === 'withdraw') return status === 'pending_approval';
  if (action === 'revoke') return reviewer && status === 'approved';
  if (action === 'revise') return reviewer && status === 'approval_revoked';
  if (action === 'cancel') return status !== 'cancelled' && (status !== 'pending_approval' || reviewer);
  if (action === 'restore') return admin && status === 'cancelled';
  return false;
}

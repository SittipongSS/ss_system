// กติกาสถานะ/สิทธิ์ของใบสั่งขาย — ใช้ร่วมกันทั้งหน้าเว็บและ route (pure, ไม่แตะ DB)
import { isSuperuser } from '@/lib/permissions';
// ใบสั่งขายย้อนหลัง (mig 0360 → 0374) — ไฟล์ตัวตัดสินไม่มี import (ไม่มีวงวน · ฝั่ง client ใช้ได้)
import {
  HISTORICAL_UNAPPROVED_STATUSES, canKeyHistoricalSalesOrder, historicalOrderEditable, isHistoricalOrder,
} from '@/lib/sales/historicalOrders';
import { isSalesOrderSelfApproval } from '@/lib/sales/salesOrderApprovalOverride';
import { ownerLockedToSelf } from '@/lib/sales/dealOwner';

export const SALES_ORDER_STATUS_LABELS = {
  draft: 'ฉบับร่าง',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับ',
  revised: 'ออกฉบับแก้ไขแล้ว',
  approval_revoked: 'ย้อนการอนุมัติแล้ว',
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
   ⭐ **ยกเว้นร่างของใบสั่งขายย้อนหลัง** (มติ 22/09 · mig 0374) — ฟอร์มคีย์ใบกดครั้งเดียวจบที่ "รออนุมัติ"
     ร่างของใบนี้จึงเหลือค้างเฉพาะตอน **บันทึกไปครึ่งทาง** (สร้างใบแล้ว แต่อัปไฟล์/ส่งอนุมัติสะดุด) หรือดึงกลับเอง
     = งานที่ผู้คีย์ต้องกลับมาทำต่อจริง ⇒ นับให้คนสร้าง ไม่งั้นใบค้างเงียบจนไม่มีใครเห็น
   ⭐ **เลนผู้รีวิวเติมใน ม-119** — ใบที่ยื่นมาแล้วรออนุมัติ (`pending_approval`)
   ผู้รีวิวคือ role ระดับหัวหน้า (`isSalesOrderReviewer`) **ไม่ใช่เจ้าของดีล** แบบใบเสนอราคา
   ⇒ ต้องส่ง `reviewer` เข้ามา ห้ามเดาจาก `userId`
   ⭐ **ใบที่ตัวเองสร้าง/ยื่นไม่นับในเลนผู้รีวิว** (แก้ความเข้าใจเดิมของคอมเมนต์นี้ · 22/09) — route อนุมัติ
     ปฏิเสธผู้ตรวจที่อนุมัติใบตัวเองมาตลอด (`isSalesOrderSelfApproval` → 403) ⇒ ใบนั้นไม่ได้รอเรา
     ป้ายบนเมนูเคยนับเกินคิว "รออนุมัติจากคุณ" ที่ตัดใบตัวเองออกแล้ว · เหลือ **admin** ที่นับ เพราะ
     admin อนุมัติใบตัวเองได้จริง (Admin Override) ⇒ ต้องส่ง `role` มาด้วย ไม่ส่ง = ถือว่าไม่ใช่ admin */
export function isSalesOrderWaitingOnMe(order, { userId = '', reviewer = false, role = '' } = {}) {
  if (!order) return false;
  if (reviewer && order.status === 'pending_approval') {
    return role === 'admin' || !isSalesOrderSelfApproval(order, userId);
  }
  if (!userId || order.createdBy !== userId) return false;
  if (order.status === 'rejected') return true;
  return order.status === 'draft' && isHistoricalOrder(order);
}

/* ยื่นใบสั่งขายย้อนหลังเข้าคิว AE Sup (มติ 22/09 · mig 0374) — คู่ขนานกับ `canSubmitSalesOrder` ของใบปกติ
   ⭐ ผู้ยื่น = **ผู้คีย์** (ฝ่ายขายทุกตำแหน่ง + admin) ไม่ใช่ AE เจ้าของดีลเท่านั้น — ฟอร์มคีย์ใบกดครั้งเดียว
     บันทึกแล้วส่งเลย และใบย้อนหลังไม่มีช่องลงนามของฝ่ายขายให้ต้องเป็นของเจ้าของดีล (ไม่เก็บลายเซ็น)
   ⚠️ AE / Senior AE ยื่นได้เฉพาะใบที่ตัวเองเป็นเจ้าของ (คีย์ได้แค่ของตัวเอง — ownerLockedToSelf ·
     form-design-rules §2) · `inScope` = inSalesEditScope(user, ดีลของใบ) ผู้เรียกคำนวณมา
   ⚠️ ด่านจริงอยู่ที่ RPC submit_historical_sales_order (ตรวจ role · สถานะ · ไฟล์ · งวด) — ที่นี่ตอบว่าปุ่มควรโผล่ไหม */
export function canSubmitHistoricalSalesOrder(user, order, { inScope = false } = {}) {
  if (!user || !order || !inScope) return false;
  if (!historicalOrderEditable(order) || !canKeyHistoricalSalesOrder(user)) return false;
  if (ownerLockedToSelf(user.role)) return Boolean(user.id) && order.deal?.ownerId === user.id;
  return true;
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

// สองขั้นแยกกัน (mig 0166): ย้อนการอนุมัติ → สถานะกลางที่แก้ไม่ได้ → ออก Rev.
// เหตุผลกรอกครั้งเดียวที่ขั้นแรก เพราะเป็นเจตนาเดียวที่ถูกแบ่งเป็นสองคลิก
// ⛔ ใบสั่งขายย้อนหลัง (mig 0360) ย้อนอนุมัติ/ออก Rev. ไม่ได้ — ไม่มีใบเสนอราคาให้ออกฉบับใหม่
//    (CHECK sales_orders_origin_shape ตรึงที่ฐานอีกชั้น) · อนุมัติแล้วข้อมูลผิด = AE Sup ยกเลิกใบแล้วคีย์ใหม่
//    (HISTORICAL_CORRECTION_PATH · มติ 22/09 — ฐานยกเลิกเอกสารแทนสัญญาตามใบเอง)
export function canRevokeSalesOrderApproval(order, { reviewer = false } = {}) {
  return Boolean(order) && reviewer && order.status === 'approved' && !isHistoricalOrder(order);
}

export function canIssueSalesOrderRevision(order, { reviewer = false } = {}) {
  return Boolean(order) && reviewer && order.status === 'approval_revoked' && !isHistoricalOrder(order);
}

// Hard delete is only cleanup for a draft that has never entered the signed
// workflow. Historical evidence remains authoritative even after the active
// pointer is cleared by cancellation or restore-to-draft.
// ⭐ ใบสั่งขายย้อนหลัง (mig 0374) ลบแบบปกติได้เฉพาะตอน **ยังไม่เคยอนุมัติ** — ร่าง/รออนุมัติ/ตีกลับ และยกเลิก
//    ที่ approvedAt ว่าง: ยังไม่มีรอบขายของโซน · งวดยังไม่หยุดยอด · เอกสารแทนสัญญายังเป็นร่าง (= ทาง undo ของคนคีย์)
//    · อนุมัติแล้ว/ยกเลิกหลังอนุมัติ ⇒ ปุ่ม "บังคับลบ" ซึ่งพรีวิวนับรอบขาย/รอบบริการให้เห็นก่อน
//    🐞 ของเดิม (0360) กลับหัว: ใบเกิดเป็นอนุมัติ ⇒ เปิดให้ลบแบบปกติเฉพาะอนุมัติ/ยกเลิก — พอใบมีร่าง ร่างกลับ
//      ลบไม่ได้ และใบอนุมัติที่มีรอบขายแล้วได้ปุ่มลบแบบปกติที่กดแล้วติด historicalDeleteBlock ทุกครั้ง (ทางตัน)
//    ⚠️ route ยังถาม historicalDeleteBlock ก่อนลบเสมอ · ฐานยกเลิกเอกสารแทนสัญญาตามใบเอง (trigger ของ 0374)
export function canHardDeleteSalesOrder(order) {
  if (isHistoricalOrder(order)) {
    if (HISTORICAL_UNAPPROVED_STATUSES.includes(order?.status)) return true;
    return order?.status === 'cancelled' && !order?.approvedAt;
  }
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

// ⛔ ใบสั่งขายย้อนหลัง (mig 0360) ไม่ใช่ Actual แม้อนุมัติแล้ว — ยอดจริงอยู่ในใบ แต่ตัวคำนวณตัดทิ้ง
//    (ตรงกับ sync_sales_order_actual ที่กรอง origin = 'pipeline')
export function salesOrderActual(order) {
  if (isHistoricalOrder(order)) return 0;
  return order?.status === 'approved' ? Math.max(0, Number(order.actualAmount) || 0) : 0;
}

/* ── ยอด "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353) ─────────────────────────
   SO ที่ยื่นแล้วรอ AE Supervisor อนุมัติ — **โชว์ยอดได้ แต่ไม่ใช่ Actual** เดิมทุกจอ
   ตีเป็น 0 จนดีล Won ดูเหมือนไม่มีมูลค่า (หลุดจาก FC คงเหลือเพราะ Won แล้ว + ยังไม่เข้า
   Actual เพราะยังไม่อนุมัติ)
   ⭐ นับเฉพาะ `pending_approval` — ร่าง/ตีกลับ/ย้อนอนุมัติ/ยกเลิก ไม่ใช่ "รออนุมัติ"
      (`status !== 'approved'` จะดึงพวกนั้นมาปนเงียบ ๆ เพราะ actualAmount มีค่าตั้งแต่ร่าง)
   ⭐ ยอด = `actualAmount` (ก่อน VAT) ตัวเดียวกับ Actual — ห้ามใช้ totalAmount
   ⛔ ห้ามบวกเข้า Actual / เป้า / % / ขาด-เกิน ทุกกรณี — ยอดที่หน้า "เติมยอดจากระบบ"
      และตัวช่วยวางเป้าคัดลอกไปเก็บใน sales_history ถาวร อ่านจาก Actual ทั้งหมด
   ⚠️ ชื่อเลี่ยงคำว่า pending เปล่า ๆ — financeStatus 'pending' (รอบัญชีตรวจ) ·
      สถานะงวด 'pending' · statusOf 'pending' (รอปิดยอด) มีความหมายอื่นอยู่แล้ว */
export const PENDING_APPROVAL_LABEL = SALES_ORDER_STATUS_LABELS.pending_approval;

export function salesOrderPendingApprovalAmount(order) {
  return order?.status === 'pending_approval' ? Math.max(0, Number(order.actualAmount) || 0) : 0;
}

// สามสถานะของยอดบนแถว SO — ใช้ตัดสินสี/ป้ายของเซลล์ยอดในทุกตาราง SO
//   'actual'           อนุมัติแล้ว นับเป็น Actual
//   'pending_approval' ยื่นแล้วรออนุมัติ โชว์ยอดแยก ยังไม่นับ
//   'excluded'         ร่าง/ตีกลับ/ย้อนอนุมัติ/ออก Rev. แล้ว/ยกเลิก — ไม่นับทั้งสองกอง
//                      + **ใบสั่งขายย้อนหลังทุกสถานะ** (mig 0360 · ไม่นับ Actual / FC / เป้า)
export function salesOrderAmountKind(order) {
  if (isHistoricalOrder(order)) return 'excluded';
  if (order?.status === 'approved') return 'actual';
  if (order?.status === 'pending_approval') return 'pending_approval';
  return 'excluded';
}

// รวมยอดจากแถว SO ตรง ๆ (หน้ารายการ SO · ตาราง SO ในดีล/โครงการ · รายงาน)
// ⭐ ผลต้องตรงกับ cache บนดีล (sync_sales_order_actual) — กติกาเดียวกันทุกตัวอักษร
export function splitSalesOrderAmounts(orders = []) {
  const out = { actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 0 };
  for (const order of orders || []) {
    const kind = salesOrderAmountKind(order);
    if (kind === 'actual') {
      out.actual += salesOrderActual(order);
      out.actualCount += 1;
    } else if (kind === 'pending_approval') {
      out.pendingApproval += salesOrderPendingApprovalAmount(order);
      out.pendingApprovalCount += 1;
    }
  }
  return out;
}

// อ่านยอดรออนุมัติของดีลจาก cache ที่ DB เขียนให้ (metadata.soPendingAmount/Count · mig 0353)
// ⭐ ไม่มีคีย์ = 0 — JS ขึ้น production ได้ก่อนรัน migration โดยไม่มีอะไรพัง
// ⭐ ไม่ต้องดู actualSource: สองคีย์นี้มีแต่ trigger ฝั่ง DB เป็นคนเขียน (enforce ถอดค่าที่
//    หน้าจอส่งมาทิ้งทุกครั้ง) · ตัวกรอง "นับเฉพาะดีล Won" อยู่ที่ตัวรวมยอด (dashboardMetrics)
export function dealPendingApprovalAmount(deal) {
  return Math.max(0, Number(deal?.metadata?.soPendingAmount) || 0);
}

export function dealPendingApprovalCount(deal) {
  return Math.max(0, Math.trunc(Number(deal?.metadata?.soPendingCount) || 0));
}

// sales_deals.wonValue is only a compatibility cache. Treat it as Actual only
// when the database marked the value as derived from approved Sale Orders.
// ⭐ มติผู้ใช้ 2026-09-14: Actual มาจากใบสั่งขายที่อนุมัติแล้ว **เท่านั้น** ไม่มีที่มาอื่น
// 🐞 เดิมรับค่าที่มาอีกแบบด้วย (ดีลเก่าที่พิมพ์ยอดตอนสร้าง · มติ 2026-08-08) โดยเชื่อว่า trigger
//    ปล่อยค่าที่พิมพ์ไว้ — แต่ 0110 (2026-07-16) เขียนทับ wonValue + actualSource ทุกครั้งตั้งแต่
//    INSERT ⇒ ฐานไม่เคยมีแถวแบบนั้น (461/461 เป็น sale_order) กิ่งนั้นผ่านได้เพราะเทสต์ปั้นข้อมูลให้
export function dealActualFromSalesOrders(deal) {
  if (deal?.metadata?.actualSource !== 'sale_order') return 0;
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

/**
 * คำสั่งไหนต้องมี **สิทธิ์แก้งานขาย** และคำสั่งไหนแค่ **อ่านใบได้ก็พอ**
 *
 * 🐞 เกิดจากบั๊กจริง 2026-08-13: ด่านบนสุดของ PATCH บังคับ `salesplan:edit` กับทุก
 * คำสั่งที่ไม่ใช่ `withdraw` ⇒ **ฝ่ายบัญชีโดน 403 ก่อนถึงสาขา action ทุกครั้ง**
 * ปุ่มขึ้นบนจอปกติแต่กดแล้วไม่สำเร็จ · ที่คอนเฟิร์มงวดรอดเพราะอยู่คนละ route
 *
 * ⭐ เกณฑ์: คำสั่งที่ **เปลี่ยนเนื้อหาใบหรือเดินสายอนุมัติเอกสาร** ต้องมีสิทธิ์แก้ ·
 * คำสั่งที่เป็น **การตัดสินของคนนอกสายขาย** (ขั้นบัญชี) หรือ **การถอยของผู้ยื่นเอง**
 * (ดึงกลับ) ใช้แค่สิทธิ์อ่าน — ด่านจริงของแต่ละคำสั่งอยู่ที่ตัวมันเอง
 * (`financeActionError` · `canWithdrawSalesOrderSubmission`) ซึ่งแคบด้วยฝ่าย/ตัวตน
 */
/**
 * เปลี่ยน **ภาษาเอกสาร** ของใบสั่งขายได้ไหม — คู่ขนานกับ `canSwitchQuotationDocLanguage`
 *
 * ⭐ มติผู้ใช้ 2026-08-27: ภาษาเปลี่ยนแค่กระดาษที่พิมพ์ ไม่ใช่ข้อเสนอ ⇒ ใบที่อนุมัติแล้ว
 * ก็เปลี่ยนได้ ไม่ต้องออก Rev. · ระบบตรึงเอกสารฉบับใหม่ให้เอง
 *
 * ⚠️ ต่างจากใบเสนอราคาตรงที่ SO **มี `supersededById` จริง** — ฉบับที่ถูก Rev. ทับแล้ว
 * ไม่ใช่ใบที่มีชีวิต ห้ามงอกเอกสารใหม่จากมัน (กติกาเดียวกับ handoffQueue)
 * ⚠️ `pending_approval` ห้ามเปลี่ยน — ผู้อนุมัติกำลังเปิดใบนั้นอยู่
 */
const SWITCHABLE_SO_STATUSES = new Set(['draft', 'rejected', 'approved', 'approval_revoked']);

export function canSwitchSalesOrderDocLanguage(order) {
  return Boolean(order)
    && SWITCHABLE_SO_STATUSES.has(order.status)
    && !order.supersededById
    // ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคา/ฉบับตรึงให้ออกเอกสารใหม่ — P1 ปิดทางออกเอกสารไว้ที่ด่านนี้
    && !isHistoricalOrder(order);
}

export function salesOrderActionNeedsEditScope(action) {
  const name = String(action || '');
  if (name === 'withdraw') return false;
  // ขั้นบัญชีตรวจใบ (mig 0250/0251) — บัญชีไม่มี `salesplan:edit` โดยเจตนา
  if (name.startsWith('finance_')) return false;
  return true;
}

/* ── ยกเลิกใบสั่งขาย — ปุ่มบนจอต้องพูดเรื่องเดียวกับ API (มติผู้ใช้ 2026-08-18) ──
 *
 * 🐞 เดิมปุ่มบนหน้า SO ตั้ง `visible: approved && reviewer` ⇒ **โผล่เฉพาะใบที่อนุมัติ
 * แล้ว** ทั้งที่ API ยอมให้ยกเลิกได้เกือบทุกสถานะ · ผลคือใบที่ **ถอนอนุมัติแล้ว**
 * (`approval_revoked`) เหลือปุ่มเดียวคือ "ออก Rev." ⇒ ทางเดียวออกจากสถานะนั้นคือ
 * เดินหน้าไปสร้างฉบับใหม่ · เคสจริงที่ตัน: ถอนอนุมัติเพราะจะแก้ยอด แล้วรู้ทีหลังว่า
 * ต้องกลับไปแก้ที่ใบเสนอราคา ⇒ อยากทิ้งใบนี้แต่ไม่มีปุ่มให้กด
 * ใบร่าง/ใบที่ถูกตีกลับก็ไม่มีปุ่มเหมือนกัน (เดิมเหลือทางเดียวคือให้ admin ลบถาวร)
 *
 * ⚠️ `revised` ไม่ให้ยกเลิก — ใบที่ถูกแทนที่ไปแล้วเป็น **ประวัติ** ของสายโซ่ Rev.
 * (`supersededById` ชี้อยู่) ยกเลิกย้อนหลังคือแก้ประวัติ ไม่ใช่หยุดงานที่กำลังเดิน
 *
 * ⚠️ สิทธิ์ตรงกับที่ route บังคับอยู่แล้ว: `pending_approval` / `approved` ต้องเป็น
 * ผู้ตรวจสอบ (ยกเลิกใบที่อนุมัติแล้ว = ถอนยอด Actual ⇒ สมมาตรกับตอนอนุมัติ) ·
 * สถานะที่เหลือใช้สิทธิ์แก้งานขายตามขอบเขตปกติ
 * ⚠️ ตัวบล็อกอื่น (งวดที่บัญชีคอนเฟิร์มแล้ว/รอตรวจของใบย้อนหลัง · ใบยื่นสรรพสามิต) อยู่ที่ route ตามเดิม
 *   — ใบ pipeline ที่มีเงินรับแล้วยกเลิกได้ตั้งแต่ PR3 (mig 0378 · เงินค้างอยู่กับใบ → ยกเข้าใบใหม่/บันทึกคืนเงิน) —
 * ที่นี่ตอบแค่ "ปุ่มควรโผล่ไหม" ไม่ใช่ "กดแล้วจะผ่านไหม"
 */
export function canCancelSalesOrder(order, { reviewer = false, canEdit = false, installments = [] } = {}) {
  const status = order?.status;
  if (!order || !canEdit) return false;
  if (['cancelled', 'revised'].includes(status)) return false;
  if (salesOrderCancelNeedsReviewer(order, installments)) return reviewer;
  return true;
}

/**
 * ยกเลิกใบนี้ต้องเป็นผู้ตรวจสอบ (AE Sup/admin) ไหม — ปุ่ม (`canCancelSalesOrder`) กับ route ยกเลิกถามตัวเดียวกัน
 * ⭐ รออนุมัติ/อนุมัติแล้ว (มติ 2026-07-16 — ถอนยอด Actual ต้องสมมาตรกับตอนอนุมัติ)
 * ⭐ **ใบที่ถือเงิน** — มีงวด confirmed/reported ในสถานะใดก็ตาม (review MONEY-2)
 *   🐞 PR3 ปลดด่าน "มีงวดที่บัญชีรับรองแล้ว" ของใบ pipeline ⇒ ใบที่ย้อนการอนุมัติ (มติ D3 รับเงินต่อได้) และใบ Rev. ร่างที่งวดเงิน
 *     ย้ายมา (0376) เหลือด่านแค่สิทธิ์แก้งานขาย — AE เจ้าของดีลคนเดียวยกเลิกได้ แล้วเงินที่รับรองแล้วกลายเป็นเงินค้างจากใบที่ยกเลิก
 *     โดยไม่มี AE Sup เกี่ยว (ทั้งที่ปรับแผน/ยกเงินเป็นของ AE Sup/admin/บัญชี)
 *   ⚠️ route ส่งงวดที่อ่านสดแบบโยน error (อ่านไม่ขึ้น = ไม่ยกเลิก) · ปุ่มใช้งวดของหน้า (loadOrder กลืน error — ปุ่มผิดได้ API ไม่ผิด)
 *   ⚠️ งวดร่างที่บันทึกการจ่ายไว้ (pending + สลิป) ไม่ใช่ "เงิน" ที่นี่ — ยังไม่ถึงบัญชี (ยกเลิกแล้วเป็นโมฆะ · โมดัลบอก)
 */
export function salesOrderCancelNeedsReviewer(order, installments = []) {
  if (['pending_approval', 'approved'].includes(order?.status)) return true;
  return (Array.isArray(installments) ? installments : []).some((r) => ['confirmed', 'reported'].includes(r?.status));
}

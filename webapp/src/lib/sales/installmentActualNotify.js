// ── กระดิ่งของ "นับ Actual รายงวด" (mig 0412 · docs/so-installment-actual.md) ─────────────────────────────
//
// ⭐ ค่าตั้งต้นของมติ 26/10: "แจ้งผู้อนุมัติตอนยื่น · แจ้งผู้ยื่นตอนอนุมัติ/ตีกลับ"
//   · ยื่นขอนับงวด = **คิวงานของตำแหน่ง** (AE Supervisor) — การกระจายตาม role สงวนไว้ให้คิวงาน (กติกาผู้รับของ mig 0185 ·
//     แพตเทิร์นเดียวกับ FM-SA-04 ขั้น AE Sup อนุมัติ): ผู้รับ = `SALES_BELL_ROLES` ที่บัญชียังเปิดอยู่ · ไม่มีเลย = admin
//     (CD/CM อนุมัติงวดได้แต่ไม่รับกระดิ่ง — มติ 2026-09-24 ข้อ 6 · เข้าไปดูคิวเอง)
//   · อนุมัติ/ตีกลับ = **แจ้งผลลัพธ์** รายบุคคล: ผู้ยื่นงวด + เจ้าของดีลปัจจุบัน (คนที่แจ้งสลิป/ยื่นใหม่ต่อ)
// ⚠️ การยื่น/อนุมัติใบสั่งขายทั้งใบวันนี้ไม่มีกระดิ่ง (มีแต่คอมเมนต์ใน route) ⇒ ไฟล์นี้เป็นกระดิ่งแรกของสาย "รออนุมัติ" ของใบสั่งขาย
//   (งวดรออนุมัติค้างได้นานกว่าใบมาก — 12 งวดรายเดือน = 12 รอบ ⇒ ป้ายบนเมนูอย่างเดียวไม่พอ)
// ⚠️ **กันแจ้งตัวเองที่นี่** — `notifyUsers` ไม่มี actorId (เหตุผลเดียวกับ taxInvoiceNotify)
// ⚠️ **kind ประกาศเป็นค่าคงที่ตรง ๆ** (`_KIND = 'sales_order_…'`) — ยามใน notifications.test.mjs กวาด src หาแล้วเทียบกับ
//   `SALES_ORDER_BELL_KINDS` · ประกอบจาก template string = ยามมองไม่เห็น แล้วแถวไม่ขึ้นกระดิ่งเงียบ ๆ
// ⚠️ fire-and-forget หลังบันทึกสำเร็จแล้ว — กระดิ่งพลาดต้องไม่ทำให้การยื่น/อนุมัติตอบ error
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { loadUserDirectory } from '@/lib/usersRepo';
import { SALES_BELL_ROLES } from '@/lib/permissions';
import { fmtMoney } from '@/lib/format';

export const INSTALLMENT_ACTUAL_SUBMITTED_KIND = 'sales_order_installment_actual_submitted';
export const INSTALLMENT_ACTUAL_APPROVED_KIND = 'sales_order_installment_actual_approved';
export const INSTALLMENT_ACTUAL_REJECTED_KIND = 'sales_order_installment_actual_rejected';
export const INSTALLMENT_ACTUAL_ENTITY_TYPE = 'sales_order';

/** ปลายทาง — แท็บการชำระของใบ (ที่เดียวที่มีปุ่มยื่น/อนุมัติ/ตีกลับงวด) */
const hrefOf = (orderId) => `/sa/sales-orders/${orderId}?tab=payment`;

/* ผู้อนุมัติที่รับกระดิ่ง — AE Sup ที่บัญชีเปิดอยู่ · ไม่มีเลย = admin (ไม่มีใครรับคือความเงียบแบบที่กระดิ่งนี้เกิดมาแก้)
   ⭐ **ตัดผู้ยื่นออกก่อนตัดสินว่าจะถอยไป admin** (review 26/10): AE Sup คนเดียวที่เปิดอยู่ยื่นงวดเอง (ผู้จัดการยื่นได้) = ตัวเขาอนุมัติเอง
     ไม่ได้ (self_approval) · ถ้าตัดทีหลัง ผู้รับว่าง = ไม่มีใครได้กระดิ่ง ⇒ ถอยไป admin (ไม่ใช่ CD/CM — มติ 24/09 ข้อ 6) */
export function installmentActualReviewerIds(directory, actorId = null) {
  const actor = actorId ? String(actorId) : null;
  const active = [...(directory?.values?.() || [])].filter((u) => u && !u.disabled && String(u.id) !== actor);
  const primary = active.filter((u) => SALES_BELL_ROLES.includes(u.role)).map((u) => String(u.id));
  return primary.length ? primary : active.filter((u) => u.role === 'admin').map((u) => String(u.id));
}

/* กุญแจกันยิงซ้ำ — หนึ่งงวด หนึ่งรอบ (เวลายื่น/อนุมัติ/ตีกลับของรอบนั้น) · ยื่นใหม่หลังตีกลับ = รอบใหม่ = แจ้งอีกครั้ง */
export const installmentActualDedupeKey = (action, installment) => {
  const at = { actual_submit: installment?.actualSubmittedAt, actual_approve: installment?.actualApprovedAt,
    actual_reject: installment?.actualRejectedAt }[action];
  return installment?.id && at ? `INSTACT-${action}-${installment.id}-${at}` : null;
};

/**
 * ใครต้องรู้ + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ คืน payload ของ `notifyUsers` หรือ null
 *
 * @param action      actual_submit | actual_approve | actual_reject (ดึงกลับไม่แจ้ง — ผู้ยื่นทำเอง ผู้อนุมัติเห็นคิวหายเอง)
 * @param order       แถวใบ (id · orderNumber · customerName · deal.ownerId)
 * @param installment แถวงวด **หลัง** บันทึก (seq · label · actualAmount · actual*At)
 * @param before      แถวงวด **ก่อน** บันทึก — ผู้ยื่นของรอบนั้น (`actualSubmittedById`)
 * @param reviewerIds ผู้อนุมัติที่รับกระดิ่ง (installmentActualReviewerIds) — ใช้กับ actual_submit
 * @param estimate    ยอดประมาณก่อน VAT ของงวดที่ยื่น (ส่วนแบ่งที่จะนับถ้าอนุมัติ) — ไม่ส่ง = ไม่บอกยอด
 */
export function installmentActualNotice({
  action, order, installment, before = null, reviewerIds = [], actorId = null, reason = '', estimate = null,
} = {}) {
  if (!order?.id || !order?.orderNumber || !installment?.id) return null;
  const actor = actorId ? String(actorId) : null;
  const without = (ids) => [...new Set(ids.filter(Boolean).map(String))].filter((id) => id !== actor);
  const seq = installment.seq ? `งวดที่ ${installment.seq}` : 'งวดชำระ';
  const label = installment.label ? ` ${installment.label}` : '';
  const customer = order.customerName ? ` · ${order.customerName}` : '';
  const base = {
    entityType: INSTALLMENT_ACTUAL_ENTITY_TYPE,
    entityId: order.id,
    dedupeKey: installmentActualDedupeKey(action, installment),
    href: hrefOf(order.id),
  };

  if (action === 'actual_submit') {
    const userIds = without(reviewerIds || []);
    if (!userIds.length) return null;
    const amount = estimate === null || estimate === undefined ? '' : ` · ประมาณ ${fmtMoney(estimate)} (ก่อน VAT)`;
    return {
      ...base,
      userIds,
      kind: INSTALLMENT_ACTUAL_SUBMITTED_KIND,
      /* ⚠️ หัวข้อประกอบจากเลขที่ใบซึ่งมีค่าเสมอ — หัวข้อว่างตก CHECK ของ 0185 แล้ว insert ล้มทั้ง batch เงียบ ๆ */
      title: `งวดรออนุมัตินับ Actual · ${order.orderNumber}`,
      body: `${seq}${label}${amount}${customer} — ฝ่ายขายยื่นขอนับ Actual งวดนี้ รอ AE Supervisor อนุมัติ`,
    };
  }

  // ผลการตัดสิน → ผู้ยื่นของรอบนั้น + เจ้าของดีลปัจจุบัน (คนที่แจ้งสลิป/ยื่นใหม่ต่อ)
  const submitter = before?.actualSubmittedById || installment.actualSubmittedById || null;
  const userIds = without([submitter, order.deal?.ownerId]);
  if (!userIds.length) return null;

  if (action === 'actual_approve') {
    /* review รอบสาม 26/10: งวดที่แจ้งสลิป/รับรองไว้แล้ว (แถวที่ยกมา · จ่ายก่อนอนุมัติใบ) ไม่ชวนไปแจ้งสลิปซ้ำ — แถวนั้นไม่มีปุ่มแจ้งแล้ว */
    const slipDone = ['reported', 'confirmed'].includes(installment.status);
    return {
      ...base,
      userIds,
      kind: INSTALLMENT_ACTUAL_APPROVED_KIND,
      title: `อนุมัตินับ Actual แล้ว · ${order.orderNumber}`,
      body: `${seq}${label} · ${fmtMoney(installment.actualAmount)} (ก่อน VAT) เข้า Actual แล้ว${customer}`
        + (slipDone
          ? (installment.status === 'confirmed' ? ' — งวดนี้บัญชีรับรองเงินแล้ว' : ' — สลิปงวดนี้แจ้งไว้แล้ว รอบัญชีรับรอง')
          : ' — แจ้งสลิปงวดนี้ได้ที่แท็บการชำระ'),
    };
  }
  if (action === 'actual_reject') {
    const why = String(reason || installment.actualRejectedReason || '').trim().slice(0, 300);
    return {
      ...base,
      userIds,
      kind: INSTALLMENT_ACTUAL_REJECTED_KIND,
      title: `คำขอนับ Actual ถูกตีกลับ · ${order.orderNumber}`,
      body: `${seq}${label}${customer}${why ? ` — ${why}` : ''} · แก้แล้วยื่นใหม่ได้ที่แท็บการชำระ`,
    };
  }
  return null;
}

/**
 * ยิงจริง — fire-and-forget (เรียกได้ทุกครั้งหลังบันทึกสำเร็จ · เงียบเองเมื่อไม่มีใครต้องรู้)
 * ⭐ ทะเบียนผู้ใช้อ่านเฉพาะตอนยื่น (หาผู้อนุมัติ) และอ่าน **ใน** `after()` — คนกดไม่ต้องรอไล่บัญชีทั้งระบบ
 * @param loadDirectory ฉีดตัวอ่านทะเบียนผู้ใช้ (เทสต์) — ค่าตั้งต้น loadUserDirectory
 */
export function notifyInstallmentActual(supabase, {
  action, order, installment, before = null, actor = null, reason = '', estimate = null,
  loadDirectory = loadUserDirectory,
} = {}) {
  if (!['actual_submit', 'actual_approve', 'actual_reject'].includes(action)) return false;
  const deliver = async () => {
    const reviewerIds = action === 'actual_submit'
      ? installmentActualReviewerIds(await loadDirectory(supabase).catch(() => new Map()), actor?.id)
      : [];
    const notice = installmentActualNotice({
      action, order, installment, before, reviewerIds, actorId: actor?.id, reason, estimate,
    });
    if (!notice) return { sent: 0 };
    return notifyUsers(supabase, { ...notice, actorName: actor?.name || actor?.email || null });
  };
  try {
    after(deliver);
  } catch {
    // นอกบริบท request ของ Next (สคริปต์/เทสต์) — ยิงตรงแล้วปล่อย error หายไปเอง
    deliver().catch(() => {});
  }
  return true;
}

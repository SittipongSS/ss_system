/* ── เอกสารทั้งหมดของใบสั่งขาย — แท็บ "เอกสาร" (GET · มติเจ้าของ 25/09/2569) ──────────────
 *
 * รวมสี่บ้านของไฟล์ (แนบเพิ่ม · ยืนยันคำสั่งซื้อ · การชำระ · สัญญา) ให้จออ่านครั้งเดียว — ตัวรวมอยู่ที่
 * `lib/sales/salesOrderDocuments.js` (ทดสอบได้) · ที่นี่อ่านข้อมูลดิบ + ตัดสินสิทธิ์
 *
 * ⚠️ **อ่านพังทุกตัว = 500 ไม่ใช่กลุ่มว่าง** — กลุ่มว่างบนจออ่านว่า "ใบนี้ไม่มีไฟล์" ทั้งที่มีครบ
 *   แล้วคนไปขอเอกสารจากลูกค้าซ้ำ (บทเรียนเดียวกับการ์ดเอกสารบังคับของลูกค้า)
 * ⚠️ ไฟล์สัญญาผ่านด่านของ **สัญญาเอง** ก่อนเข้ากลุ่ม — คนเห็นใบสั่งขายไม่ได้แปลว่าเห็นสัญญาได้
 * ⚠️ การแนบ/ลบไม่อยู่ที่นี่ — ไปทาง `/api/attachments` ทางเดียวของทั้งระบบ (entity `sales_order`) ·
 *   ไฟล์ยืนยันคำสั่งซื้อลบผ่าน action `remove_confirm_file` ของ SO PATCH (มติ 29/10) — ที่นี่บอกแค่ว่าลบได้ไหม
 */
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { inSalesDocScope, loadScoped, salesDocScopeDeal } from '@/lib/scopedRow';
import { listAttachments } from '@/lib/master/attachments';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import { canViewSalesAttachment } from '@/lib/sales/salesAttachmentAccess';
import {
  SALES_ORDER_ATTACHMENT, salesOrderAttachBlock, salesOrderConfirmRemoveBlock,
} from '@/lib/sales/salesOrderAttachmentAccess';
import { buildSalesOrderDocuments } from '@/lib/sales/salesOrderDocuments';
import { loadInstallments } from '@/lib/sales/salesOrderInstallmentsStore';

export const dynamic = 'force-dynamic';

/* แก้ใบได้ไหม — ชุดเดียวกับ `canEdit` ของ SO GET และด่านต้น PATCH
   ใบค่าสรรพสามิต (mig 0414) ไม่มีดีล — ถอยไปดีลของ SO ต้นทาง (`loadScoped` เติม `sourceDeal` ให้แล้ว) */
function canEditOrder(order, user) {
  return canEditSalesPlanning(user)
    && (salesDocScopeDeal(order) ? inSalesDocScope(user, order, 'edit') : user?.role === 'admin');
}

/* แนบ/ลบไฟล์แนบเพิ่มได้ไหม + เหตุ — แก้ใบได้ = แนบ/ลบได้ (มติ 29/10) แล้วค่อยด่านสถานะ
   แอดมินข้ามด่านสถานะได้ (API POST ปล่อยเหมือนกัน) แต่ยังเห็นเหตุ — รู้ตัวว่ากำลังแนบลงใบที่ปิดแล้ว */
function attachState(order, user) {
  const reason = salesOrderAttachBlock(order);
  return { allowed: canEditOrder(order, user) && (!reason || user?.role === 'admin'), reason };
}

/* ลบไฟล์ยืนยันคำสั่งซื้อได้ไหม (มติ 29/10 · action `remove_confirm_file` ของ SO PATCH) — คนแก้ใบไม่ได้ = ไม่มีเหตุให้เห็น
   (ไม่มีสิทธิ์ = ไม่โชว์) · แก้ได้แต่ติดด่านสถานะ (รออนุมัติ) = โชว์เหตุ */
function confirmRemoveState(order, user) {
  if (!canEditOrder(order, user)) return { allowed: false, reason: null };
  const reason = salesOrderConfirmRemoveBlock(order, user);
  return { allowed: !reason, reason };
}

/* แถวที่ผูกใบนี้ผ่าน `loadScoped` (ด่านขอบเขตตัวเดียวของทั้งระบบ · กฎ 6 ใน systemRules) —
   ไม่พบ/ไม่มีสิทธิ์ = ไม่มีแถว (กลุ่มนั้นว่าง) · อ่านฐานพัง (500) = ส่ง response ต่อ ไม่กลืนเป็นว่าง */
async function linkedRow(supabase, table, id, user) {
  if (!id) return { row: null };
  const { row, response } = await loadScoped(supabase, table, id, user, 'view');
  if (!response) return { row };
  return response.status >= 500 ? { response } : { row: null };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;

  try {
    // ⚠️ งวดอ่านผ่านตัวอ่านกลางของงวด (ตัวเดียวกับแท็บการชำระ · โยนเมื่ออ่านพัง) — ไม่เขียน query ชุดที่สอง
    //   ของตารางเดียวกัน (ด่าน check:rowcap นับจุดอ่านไร้ขอบเขตรายตาราง)
    const [extra, quotationRes, installments, contractRes] = await Promise.all([
      listAttachments(SALES_ORDER_ATTACHMENT, order.id, supabase),
      linkedRow(supabase, 'quotations', order.quotationId, user),
      loadInstallments(supabase, order.id),
      linkedRow(supabase, 'sales_contracts', order.serviceContractId, user),
    ]);
    if (quotationRes.response) return quotationRes.response;
    if (contractRes.response) return contractRes.response;
    /* ⚠️ ด่านที่สองของสัญญา = ด่านเดียวกับ proxy ไฟล์ (`canViewSalesAttachment` อ่าน team/ownerId ของแถวสัญญา)
       — ผ่านขอบเขตดีลแต่ตกด่านนี้ = ลิสต์ไฟล์ที่กดเปิดแล้วเจอ 403 */
    const contract = contractRes.row && canViewSalesAttachment(contractRes.row, user) ? contractRes.row : null;
    const contractFiles = contract ? await listAttachments('contract', contract.id, supabase) : [];

    const { groups, total, installments: installmentFiles } = buildSalesOrderDocuments({
      order,
      quotation: quotationRes.row,
      installments,
      extra,
      contract,
      contractFiles,
    });
    return ok({
      groups, total, installments: installmentFiles,
      attach: attachState(order, user),
      confirmRemove: confirmRemoveState(order, user),
    });
  } catch (error) {
    // `listAttachments` / `loadInstallments` โยนเมื่ออ่านไม่สำเร็จ — ตอบ 500 ให้จอบอก ไม่ใช่กลุ่มว่าง
    return fail(`อ่านเอกสารของใบนี้ไม่สำเร็จ: ${error?.message || error}`, 500);
  }
});

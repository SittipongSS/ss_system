import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { sanitizeWonAttachments } from '@/lib/sales/quotationWonEvidence';
import { installmentActionError } from '@/lib/sales/salesOrderPayments';
import {
  ensureInstallments, loadInstallment, loadInstallments, updateInstallment,
} from '@/lib/sales/salesOrderInstallmentsStore';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

/* สิทธิ์ **อ่าน** ของงวด = สิทธิ์อ่านใบสั่งขายใบนั้น (view-scope ของดีลเจ้าของ)
   ⚠️ ฝ่ายบัญชีถือ `salesplan:view` แบบ scope กว้าง จึงเห็นทุกใบตามที่ควรเป็น —
   ด่านที่แคบคือ **คำสั่ง** ไม่ใช่การอ่าน (installmentActionError คุมอีกชั้น) */
async function loadOrderForUser(supabase, user, id) {
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return { error: notFound('ไม่พบใบสั่งขาย') };

  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select('*').eq('id', order.dealId).maybeSingle();
  if (dealError) throw dealError;
  if (!deal || !inSalesViewScope(user, deal)) return { error: forbidden() };

  const { data: quotation, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, paymentPlan, wonDocType, wonDocDate, wonAttachments')
    .eq('id', order.quotationId)
    .maybeSingle();
  if (quoteError) throw quoteError;

  return { order: { ...order, quotation: quotation || null } };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    return ok({ installments: await loadInstallments(supabase, order.id) });
  } catch (loadError) {
    return fail(loadError.message, 500);
  }
});

/* POST — เริ่มติดตามการชำระของใบนี้
   ใช้สองทาง: เรียกอัตโนมัติหลังอนุมัติ · และปุ่มบนใบเก่าที่อนุมัติไปก่อนมีระบบนี้
   (มติผู้ใช้ 2026-08-13: ไม่ generate ย้อนหลังทั้งระบบ ให้เปิดทีละใบ) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    // ⚠️ ยอดยังเปลี่ยนได้จนกว่าจะอนุมัติ — สร้างงวดก่อนหน้านั้นยอดต่องวดจะผิดเงียบ ๆ
    if (order.status !== 'approved') return badRequest('เริ่มติดตามการชำระได้หลังใบสั่งขายอนุมัติแล้ว');

    const { rows, created } = await ensureInstallments(supabase, { order, user });
    if (!rows.length) return badRequest('ใบเสนอราคาต้นทางไม่มีแผนการชำระให้ยกมา');
    if (created) {
      await recordAudit({
        user,
        action: 'create',
        entityType: 'sales_order_installments',
        entityId: order.id,
        summary: `เริ่มติดตามการชำระ ${order.orderNumber} — ${rows.length} งวด`,
        request: req,
      });
    }
    return ok({ installments: rows, created });
  } catch (postError) {
    return fail(postError.message, 500);
  }
});

/* PATCH — เดินสถานะของงวดเดียว
   pending/rejected ──report──> reported ──confirm──> confirmed
                        ↑                    └─reject──> rejected
                        └────── withdraw ────┘
   ⭐ ด่านทั้งหมดอยู่ที่ `installmentActionError` ตัวเดียวกับที่หน้าเว็บใช้ซ่อน/จางปุ่ม
      ⇒ ปุ่มกับ API ขัดกันไม่ได้ */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  const installmentId = String(body.installmentId || '').trim();
  if (!installmentId) return badRequest('ไม่ได้ระบุงวดที่ต้องการ');

  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;

    const row = await loadInstallment(supabase, installmentId);
    if (!row || row.salesOrderId !== order.id) return notFound('ไม่พบงวดในใบสั่งขายนี้');

    const paidOn = body.paidOn || null;
    if (paidOn && !isDate(paidOn)) return badRequest('รูปแบบวันที่ชำระไม่ถูกต้อง');
    const reason = String(body.reason || '').trim();

    const gate = installmentActionError(row, action, user, { paidOn, reason });
    if (gate) return badRequest(gate);

    const now = new Date().toISOString();
    const actorName = user.name || user.email || null;
    let patch = null;

    if (action === 'schedule') {
      const dueDate = body.dueDate || null;
      if (dueDate && !isDate(dueDate)) return badRequest('รูปแบบกำหนดชำระไม่ถูกต้อง');
      patch = { dueDate };
    } else if (action === 'report') {
      // หลักฐานผ่าน sanitize ตัวเดียวกับหลักฐาน Won — รับเฉพาะ ref ที่อัปผ่าน /api/upload แล้ว
      const evidence = sanitizeWonAttachments(body.evidence);
      if (!evidence.length) return badRequest('ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');
      patch = {
        status: 'reported',
        paidOn,
        evidence,
        reportedById: user.id,
        reportedByName: actorName,
        reportedAt: now,
        // เคลียร์ร่องรอยการตีกลับรอบก่อน — งวดนี้กลับเข้าคิวตรวจใหม่แล้ว
        rejectedById: null, rejectedByName: null, rejectedAt: null, rejectedReason: null,
      };
    } else if (action === 'withdraw') {
      patch = {
        status: 'pending',
        reportedById: null, reportedByName: null, reportedAt: null, paidOn: null, evidence: [],
      };
    } else if (action === 'confirm') {
      patch = {
        status: 'confirmed',
        confirmedById: user.id, confirmedByName: actorName, confirmedAt: now,
      };
    } else if (action === 'reject') {
      patch = {
        status: 'rejected',
        rejectedById: user.id, rejectedByName: actorName, rejectedAt: now, rejectedReason: reason,
      };
    } else if (action === 'unconfirm') {
      /* ถอนคำรับรองของบัญชี (มติผู้ใช้ 2026-08-13)
         ⭐ กลับไป `reported` ไม่ใช่ `pending` — คำแจ้งของฝ่ายขายและหลักฐานยังอยู่ครบ
         สิ่งที่ถูกถอนคือคำรับรองของบัญชี งวดจึงกลับไปอยู่ในคิวตรวจของบัญชีเอง
         ⚠️ CHECK ของ mig 0245 ยังผ่าน: `reported` ต้องมี `reportedAt` ซึ่งไม่ถูกแตะ
         ⇒ **ไม่ต้องมี migration ใหม่**
         ⚠️ เหตุผลลง `note` ให้เห็นบนการ์ด — audit เก็บอีกชั้นพร้อม before/after */
      patch = {
        status: 'reported',
        confirmedById: null, confirmedByName: null, confirmedAt: null,
        note: `ถอนคำรับรอง (${actorName || 'บัญชี'}): ${reason}`,
      };
    }

    const updated = await updateInstallment(supabase, installmentId, patch);
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order_installments',
      entityId: installmentId,
      before: row,
      after: updated,
      summary: `${action} งวด ${row.seq} ของ ${order.orderNumber}`,
      request: req,
    });
    return ok({ installment: updated, installments: await loadInstallments(supabase, order.id) });
  } catch (patchError) {
    return fail(patchError.message, 500);
  }
});

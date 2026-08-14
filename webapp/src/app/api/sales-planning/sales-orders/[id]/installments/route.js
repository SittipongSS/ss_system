import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { sanitizeWonAttachments } from '@/lib/sales/quotationWonEvidence';
import { installmentActionError, withLiveAmounts } from '@/lib/sales/salesOrderPayments';
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
    /* ยอดของงวดร่างมาจากแผนของ QT สด ๆ (B-4) — ที่เก็บไว้เป็นค่าตอนกด "เริ่มติดตาม"
       ซึ่งอาจไม่ตรงกับแผนวันนี้ · ทับตอนอ่าน ไม่ใช่เขียนทับใน DB (write-on-read) */
    return ok({
      installments: withLiveAmounts(
        await loadInstallments(supabase, order.id),
        order.quotation?.paymentPlan, order.totalAmount,
      ),
    });
  } catch (loadError) {
    return fail(loadError.message, 500);
  }
});

/* POST — เริ่มติดตามการชำระของใบนี้
   ใช้สามทาง: กดตั้งแต่ใบยังเป็นร่าง (B-4) · ปุ่มบนใบเก่าที่อนุมัติไปก่อนมีระบบนี้ ·
   เรียกอัตโนมัติตอนอนุมัติสำหรับใบที่ไม่เคยกด
   (มติผู้ใช้ 2026-08-13: ไม่ generate ย้อนหลังทั้งระบบ ให้เปิดทีละใบ) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    /* ⭐ **ด่าน "ต้องอนุมัติก่อน" ถูกถอดแล้ว** (B-4 · มติผู้ใช้ 2026-08-15) —
       เหตุผลเดิม ("ยอดยังเปลี่ยนได้") ย้ายไปอยู่ที่ `freezeInstallments` ซึ่งเขียนยอด
       ทับครั้งสุดท้ายตอนอนุมัติ · แถวที่สร้างตอนนี้ยังไม่ freeze ⇒ ยังแจ้งชำระไม่ได้
       และยังไม่เข้าทะเบียนของบัญชี · สิ่งที่ได้คือ **ช่องกำหนดชำระให้ SA กรอกตอนที่
       กำลังคุยเงื่อนไขกับลูกค้าอยู่พอดี** แทนที่จะต้องรอใบผ่านอนุมัติแล้วย้อนกลับมา
       ⚠️ ใบที่ยกเลิกแล้วไม่ต้องมีอะไรให้ติดตาม */
    if (['cancelled', 'rejected'].includes(order.status)) {
      return badRequest('ใบสั่งขายนี้ถูกยกเลิก/ตีกลับแล้ว — ไม่มีอะไรให้ติดตาม');
    }

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

    const billingRequestId = String(body.billingRequestId || '').trim();
    const gate = installmentActionError(row, action, user, { paidOn, reason, billingRequestId });
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
    } else if (action === 'unlink') {
      patch = { billingRequestId: null };
    } else if (action === 'link') {
      /* ── ผูกงวดเข้ากับคำร้องขอเอกสารการเงิน (B-5) ────────────────────────
         ⚠️ ตรวจจาก **แถวจริงของคำร้อง** ไม่ใช่เชื่อ id ที่ส่งมา — สามข้อนี้ถ้าไม่ตรวจ
         จะได้ใบวางบิลของลูกค้าอีกรายไปแขวนบนงวดนี้โดยไม่มีอะไรทัก */
      const { data: request, error: reqError } = await supabase
        .from('dept_requests')
        .select('id, kind, "docNo", "quotationId"')
        .eq('id', billingRequestId).maybeSingle();
      if (reqError) return fail(reqError.message, 500);
      if (!request) return badRequest('ไม่พบคำร้องที่เลือก');
      if (request.kind !== 'billing_doc') return badRequest('ผูกได้เฉพาะคำร้องขอเอกสารการเงิน');
      /* ⭐ **ต้องเป็นคำร้องของใบเสนอราคาเดียวกับใบสั่งขายนี้** — ทั้งสองฝั่งยึด QT
         เป็นต้นทางอยู่แล้ว (ม-ค) ⇒ นี่คือเส้นเดียวที่พิสูจน์ได้ว่าเป็นงานเดียวกัน
         ⚠️ ใบสั่งขายที่ไม่ได้มาจาก QT ผูกไม่ได้ — บอกให้ตรงว่าเพราะอะไร */
      if (!order.quotationId) {
        return badRequest('ใบสั่งขายนี้ไม่ได้อ้างใบเสนอราคา — ผูกคำร้องขอเอกสารการเงินไม่ได้');
      }
      if (request.quotationId !== order.quotationId) {
        return badRequest('คำร้องนี้เป็นของใบเสนอราคาคนละใบกับใบสั่งขายนี้');
      }
      /* ⚠️ คำร้องใบเดียวแขวนได้งวดเดียว — ของจริงหนึ่งคำร้องคือการวางบิลหนึ่งรอบ
         (ยอดอยู่ที่ใบคำร้อง ไม่ใช่รายบรรทัด · ดู 0257) ⇒ แขวนสองงวดแปลว่ายอดถูก
         นับซ้ำตอนตอบว่า "งวดนี้ขอเอกสารไปหรือยัง" */
      const { data: taken, error: takenError } = await supabase
        .from('sales_order_installments')
        .select('id, seq').eq('billingRequestId', request.id).neq('id', installmentId);
      if (takenError) return fail(takenError.message, 500);
      if (taken?.length) {
        return badRequest(`คำร้อง ${request.docNo || ''} ถูกผูกกับงวดที่ ${taken[0].seq} ไปแล้ว`);
      }
      patch = { billingRequestId: request.id };
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
    return ok({
      installment: updated,
      installments: withLiveAmounts(
        await loadInstallments(supabase, order.id),
        order.quotation?.paymentPlan, order.totalAmount,
      ),
    });
  } catch (patchError) {
    return fail(patchError.message, 500);
  }
});

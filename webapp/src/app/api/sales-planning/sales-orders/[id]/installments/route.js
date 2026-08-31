import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { sanitizeEvidenceAttachments } from '@/lib/sales/orderConfirmationDocs';
import { orderHasServiceRounds } from '@/lib/sales/serviceOrders';
import {
  installmentActionError, installmentReportOutcome, withLiveAmounts,
} from '@/lib/sales/salesOrderPayments';
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

  /* ⭐ บรรทัดของใบ + ดีล — ด่านรับรองงวดต้องรู้ว่า **ใบนี้เป็นงานบริการไหม**
     (ดีลสาย SERVICE + บรรทัดหมวด 02-001 ≥1 ⇒ ทั้งใบ) เพราะใบบริการต้องมีช่วงครอบ
     ก่อนบัญชีจะรับรองได้ (มติผู้ใช้ 2026-08-31)
     ⚠️ เอาเฉพาะ `fgCode` — เกณฑ์อ่านแค่หมวดของรหัส ไม่ต้องลากราคามาทั้งแถว */
  const { data: lines, error: lineError } = await supabase
    .from('sales_order_lines').select('id, fgCode').eq('salesOrderId', order.id);
  if (lineError) throw lineError;

  return { order: { ...order, quotation: quotation || null, deal, lines: lines || [] } };
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
   ⭐ **ทางปกติไม่ผ่านที่นี่แล้ว** (มติผู้ใช้ 2026-08-19) — งวดเกิดตอนออกใบจาก QT
   เส้นนี้เหลือเป็น **ทางกู้**: ใบเก่าที่อนุมัติไปก่อนมีระบบนี้ · ใบที่ตอนออกยังไม่มีแผน
   ชำระใน QT แล้วมาเพิ่มทีหลัง · และใบที่การสร้างตอนออกใบล้ม (ตรงนั้นกลืน error ไว้)
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
    /* งวดอื่นของใบเดียวกัน — ด่าน "ไล่ลำดับงวด" ต้องเห็นทั้งใบ ไม่ใช่แค่แถวที่กด
       (อ่านสดที่นี่ ไม่เชื่อค่าที่ client ส่งมา) */
    const siblings = await loadInstallments(supabase, order.id);
    /* ช่วงบริการที่งวดนี้ครอบ (mig 0320) — อ่านก่อนด่าน เพราะด่านต้องตรวจว่าช่วงกลับหัวไหม */
    const coversFrom = body.coversFrom || null;
    const coversTo = body.coversTo || null;
    /* ⚠️ ต้องส่ง `serviceRounds` เสมอ — ด่านรับรองงวดใช้ตัดสินว่าต้องมีช่วงครอบก่อนไหม
       (ไม่ส่ง = ไม่บล็อก ⇒ ใบบริการรับรองได้ทั้งที่ช่วงครอบว่าง ซึ่งคือกับดักเดิม) */
    const gate = installmentActionError(row, action, user, {
      paidOn, reason, billingRequestId, coversFrom, coversTo,
      rows: siblings, orderTotal: order.totalAmount,
      serviceRounds: orderHasServiceRounds(order, order.lines, { project: order.project }),
    });
    if (gate) return badRequest(gate);

    const now = new Date().toISOString();
    const actorName = user.name || user.email || null;
    let patch = null;

    if (action === 'schedule') {
      const dueDate = body.dueDate || null;
      if (dueDate && !isDate(dueDate)) return badRequest('รูปแบบกำหนดชำระไม่ถูกต้อง');
      patch = { dueDate };
    } else if (action === 'coverage') {
      /* ⭐ ช่วงบริการที่งวดนี้จ่ายค่าให้ (mig 0320 · มติผู้ใช้ 2026-08-30 "จ่ายก่อนบริการเสมอ")
         max(coversTo) ของงวดที่ confirmed = ค่า "จ่ายถึง" ที่ด่านเข้าไซต์ใช้ตัดสิน
         ⚠️ ล้างช่องได้ (ส่ง null ทั้งคู่) — ใบที่ไม่ใช่สายบริการไม่ควรถูกบังคับให้มีค่าค้าง */
      if (coversFrom && !isDate(coversFrom)) return badRequest('รูปแบบวันเริ่มช่วงครอบไม่ถูกต้อง');
      if (coversTo && !isDate(coversTo)) return badRequest('รูปแบบวันสิ้นสุดช่วงครอบไม่ถูกต้อง');
      patch = { coversFrom, coversTo };
    } else if (action === 'report') {
      // หลักฐานผ่าน sanitize ตัวเดียวกับหลักฐาน Won — รับเฉพาะ ref ที่อัปผ่าน /api/upload แล้ว
      const evidence = sanitizeEvidenceAttachments(body.evidence);
      if (!evidence.length) return badRequest('ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');
      /* ⭐ ปลายทางขึ้นกับว่าใครกด (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
         ฝ่ายขายแจ้ง → `reported` เข้าคิวบัญชี · **บัญชีแจ้งเอง → `confirmed` เลย**
         ⇒ คิว `reported` เหลือเฉพาะของที่ฝ่ายขายแจ้ง = บัญชีรู้ทันทีว่าอันไหนต้องมาตรวจ
         ⚠️ เก็บ `reportedBy*` ไว้ด้วยแม้บัญชีจะกดเอง — ต้องรู้ว่าใครเป็นคนบันทึก
         ไม่ใช่เห็นแต่ชื่อผู้รับรองแล้วเดาว่าหลักฐานมาจากไหน

         ⭐ **งวดร่างจอดที่ `pending`** (มติผู้ใช้ 2026-08-19) — วันจ่ายและสลิปถูกเก็บ
         ครบเหมือนกัน ต่างแค่ยังไม่เข้าคิวบัญชี เพราะงานถึงบัญชีต่อเมื่อ AE Supervisor
         อนุมัติใบแล้วเท่านั้น · `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ
         ⇒ ไม่มีใครต้องถือสลิปไว้เองอีก และกติกาของบัญชีไม่ถูกแตะ */
      const outcome = installmentReportOutcome(user, row);
      /* 🐞 **UAT 2026-09-01: ช่วงครอบที่ส่งมากับการแจ้งชำระเคยหายเงียบ** — ด่านยอมให้ผ่าน
         เพราะเห็นค่าใน payload แต่ patch ไม่เคยเก็บมันลงแถว ⇒ งวดกลายเป็น `confirmed`
         โดย `coversFrom/To` ยังว่าง = "จ่ายถึง" ไม่ขยับ ซึ่งเป็นอาการเดียวกับกับดักที่
         ด่านนี้เกิดมาปิดพอดี · บัญชีที่แจ้งเองจบในก้าวเดียว จึงไม่มีจังหวะไหนให้กรอกอีก
         ⚠️ รับเฉพาะตอนส่งมาจริง — ไม่ส่ง = ไม่แตะค่าเดิม (ฝ่ายขายอาจกรอกไว้ก่อนแล้ว) */
      if (coversFrom && !isDate(coversFrom)) return badRequest('รูปแบบวันเริ่มช่วงครอบไม่ถูกต้อง');
      if (coversTo && !isDate(coversTo)) return badRequest('รูปแบบวันสิ้นสุดช่วงครอบไม่ถูกต้อง');
      patch = {
        status: outcome,
        paidOn,
        evidence,
        ...(coversFrom || coversTo ? { coversFrom, coversTo } : {}),
        reportedById: user.id,
        reportedByName: actorName,
        reportedAt: now,
        ...(outcome === 'confirmed'
          ? { confirmedById: user.id, confirmedByName: actorName, confirmedAt: now }
          : {}),
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

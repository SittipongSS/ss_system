import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';
import { isSalesOrderReviewer, isSalesOrderWaitingOnMe } from '@/lib/sales/salesOrderWorkflow';
import { salesOrderPaymentCell } from '@/lib/sales/salesOrderPayments';
import { ensureInstallments, loadInstallments, updateInstallment } from '@/lib/sales/salesOrderInstallmentsStore';
import { validateOrderConfirmation, sanitizeEvidenceAttachments, DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';
import { missingStoredEvidence } from '@/lib/upload/privateEvidence';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { data: orders, error } = await supabase
    .from('sales_orders')
    .select('*')
    .order('orderDate', { ascending: false })
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);

  // 🐞 **บรรทัดของใบต้องมาด้วย** — หน้าเปิดคำร้องพัฒนากลิ่นอ่าน `so.lines` เพื่อรู้ว่า
  // ใบไหนเป็นงานออกแบบกลิ่น (ชุดหมวดอยู่ที่ `SCENT_DESIGN_CATEGORIES`) และขายกี่กลิ่น
  // ⚠️ อย่าไล่เขียนรหัสหมวดซ้ำในคอมเมนต์อีก — เพิ่ม 03-010 (แก้ไขกลิ่น) เมื่อ 2026-08-10
  // แล้วบรรทัดนี้ตกยุคทันที · ก่อนหน้านี้ API
  // ไม่เคยส่งมา ⇒ `lines` เป็น undefined เสมอ ⇒ จำนวนกลิ่นไม่ขึ้นและบล็อกบรีฟไม่งอก
  // สักก้อน = เลือกใบสั่งขายแล้วทำอะไรต่อไม่ได้เลย (ผู้ใช้เจอเองบนจอ)
  //
  // ⚠️ เอาเฉพาะช่องที่ผู้เรียกใช้จริง — ทั้งแถวมีราคาต่อหน่วยและส่วนลดซึ่งไม่เกี่ยวกับ
  // คำร้อง ยิ่งดึงมามาก ยิ่งมีของให้หลุดออกทาง response โดยไม่ตั้งใจ
  const todayIso = businessDate();
  const orderIds = (orders || []).map((row) => row.id);
  const { data: lines, error: lineError } = orderIds.length
    ? await supabase.from('sales_order_lines')
      .select('id, salesOrderId, qty, fgCode, description, sortOrder')
      .in('salesOrderId', orderIds)
      .order('sortOrder', { ascending: true })
    : { data: [], error: null };
  if (lineError) return fail(lineError.message, 500);
  const linesByOrder = new Map();
  for (const line of lines || []) {
    const list = linesByOrder.get(line.salesOrderId) || [];
    list.push(line);
    linesByOrder.set(line.salesOrderId, list);
  }

  // ⭐ ใบไหนถูกเปิดคำร้องพัฒนากลิ่นไปแล้ว — ฟอร์มเปิดคำร้องใช้กรอง dropdown
  // ให้ตรงกับป้าย "ใบสั่งขายออกแบบกลิ่น" · ไม่มีข้อมูลนี้ ผู้ใช้จะเลือกใบที่ใช้ไปแล้ว
  // กรอก PDR จนจบ แล้วโดนปฏิเสธตอนกดส่ง
  //
  // ⚠️ **เงื่อนไขต้องตรงกับ `dept_requests_pdr_so_uk` (mig 0219) เป๊ะ ๆ** — เหมือนที่
  // route ของ SO รายใบทำ · หลวมกว่านี้ = ใบที่ยกเลิกแล้วหายจากลิสต์ทั้งที่เปิดใหม่ได้
  //
  // ⚠️ อ่านด้วย service-role โดยตั้งใจ — ทะเบียนคำร้องมีขอบเขตของตัวเอง (ผู้ขอเห็น
  // เฉพาะของตัวเอง) ⇒ ถามผ่านทางนั้นจะได้ "ว่าง" ทั้งที่เพื่อนร่วมทีมเปิดไปแล้ว
  // · คืนออกไปแค่ id/docNo/status เท่าที่ลิสต์ต้องใช้
  const { data: scentRequests, error: scentRequestError } = orderIds.length
    ? await supabase.from('dept_requests').select('id, docNo, status, "salesOrderId"')
      .in('salesOrderId', orderIds).eq('kind', 'scent_dev').neq('status', 'cancelled')
    : { data: [], error: null };
  if (scentRequestError) return fail(scentRequestError.message, 500);
  const scentRequestByOrder = new Map(
    (scentRequests || []).map((row) => [row.salesOrderId, row]),
  );

  // รหัส AR โชว์เหนือชื่อลูกค้าในตาราง (มติผู้ใช้ 2026-08-12) — พ่วงจากทะเบียน
  // แพตเทิร์นเดียวกับ QT route · ids ว่างไม่ยิง query
  const customerIds = [...new Set((orders || []).map((row) => row.customerId).filter(Boolean))];
  let arById = new Map();
  if (customerIds.length) {
    const { data: customers, error: customerError } = await supabase
      .from('customers').select('id, "arCode"').in('id', customerIds);
    if (customerError) return fail(customerError.message, 500);
    arById = new Map((customers || []).map((c) => [c.id, String(c.arCode || '').trim() || null]));
  }

  const dealIds = [...new Set((orders || []).map((row) => row.dealId).filter(Boolean))];
  const quoteIds = [...new Set((orders || []).map((row) => row.quotationId).filter(Boolean))];
  const [{ data: deals, error: dealError }, { data: quotes, error: quoteError }] = await Promise.all([
    dealIds.length
      ? supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      // paymentPlan มาด้วยเพื่อบอกจำนวนงวด **ตามแผน** ของใบที่ยังไม่เริ่มติดตาม
      // (ไม่งั้นคอลัมน์งวดจะว่างทั้งที่ใบเสนอราคาระบุไว้แล้วว่าแบ่งกี่งวด)
      ? supabase.from('quotations').select('id, quoteNumber, status, paymentPlan').in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (dealError || quoteError) return fail((dealError || quoteError).message, 500);

  /* ── งวดชำระของแต่ละใบ (mig 0245) — คอลัมน์ "เก็บแล้ว x/y" ในตาราง ────────
     ⚠️ ยิงรวดเดียวทั้งหน้าแล้วจัดกลุ่มใน JS — ห้ามยิงรายใบในลูป (N+1)
     ⚠️ ดึงแค่ 3 คอลัมน์ที่ใช้จริง ไม่เอา evidence/เหตุผลมาทั้งก้อน
     (`orderIds` ประกาศไว้ข้างบนแล้วตอนดึงบรรทัดของใบ) */
  const installmentsByOrder = new Map();
  if (orderIds.length) {
    const { data: rows, error: installmentError } = await supabase
      .from('sales_order_installments')
      .select('salesOrderId, status, "dueDate"')
      .in('salesOrderId', orderIds);
    // ตารางยังไม่ถูกสร้าง (ยังไม่รัน mig 0245) ต้องไม่ทำให้ทั้งหน้าพัง — คอลัมน์ว่างแทน
    if (installmentError) console.error('[sales-orders] โหลดงวดชำระไม่สำเร็จ:', installmentError.message);
    for (const row of rows || []) {
      const list = installmentsByOrder.get(row.salesOrderId) || [];
      list.push(row);
      installmentsByOrder.set(row.salesOrderId, list);
    }
  }

  const dealById = new Map((deals || []).map((row) => [row.id, row]));
  const quoteById = new Map((quotes || []).map((row) => [row.id, row]));
  const visible = (orders || [])
    .map((row) => ({
      ...row,
      customerArCode: arById.get(row.customerId) ?? null,
      lines: linesByOrder.get(row.id) || [],
      deal: dealById.get(row.dealId) || null,
      quotation: quoteById.get(row.quotationId) || null,
      scentRequest: scentRequestByOrder.get(row.id) || null,
      // สรุปงวดพอให้ตารางวาดได้ — รายละเอียดเต็มอยู่ที่หน้ารายละเอียดใบ
      payment: salesOrderPaymentCell(
        installmentsByOrder.get(row.id) || [],
        quoteById.get(row.quotationId)?.paymentPlan,
        todayIso,
        row.totalAmount,
      ),
      // ธงเดียวกับที่ป้ายตัวเลขบนเมนูนับ (ม-114) — ติดที่ server ด้วย helper ตัวเดียวกัน
      // ไม่ให้จอเดาเอง ไม่งั้นเลขบนเมนูกับลิสต์ที่กรองแล้วไม่ตรงกัน
      _waitingOnMe: isSalesOrderWaitingOnMe(row, { userId: user.id, reviewer: isSalesOrderReviewer(user.role) }),
    }))
    .filter((row) => row.deal && inSalesViewScope(user, row.deal));

  return ok(visible);
});

/* ── ออกใบสั่งขายจากฟอร์มหน้าสร้าง (มติผู้ใช้ 2026-08-24) ──────────────────
   ⭐ **คำขอเดียวจบ** — ฟอร์มถือทุกอย่างไว้ในเครื่องแล้วยิงทีเดียวตอนกด "สร้าง"
   เพราะเลขที่ใบมาจากเคาน์เตอร์ที่ **ใช้ซ้ำไม่ได้** (mig 0241) ⇒ ห้ามสร้างใบเปล่า
   รอไว้แล้วค่อยเติมข้อมูล · ไฟล์ที่แนบพักไว้ใต้ใบเสนอราคาต้นทางก่อน (ยังไม่มี orderId)
   แล้ว ref ตามเข้าใบตอนสร้างสำเร็จ

   payload: { quotationId, referenceDoc?, notes?, confirmation?, installments?, firstPayment? }
   ⚠️ **เอกสารยืนยันไม่บังคับตอนสร้าง** — AE ที่ยังรอ PO ต้องตั้งใบร่างไว้ก่อนได้
   ด่านจริงคือตอนยื่นอนุมัติ (`salesOrderConfirmationGate`) */
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const quotationId = String(body.quotationId || '').trim();
  if (!quotationId) return badRequest('กรุณาระบุใบเสนอราคา Won');

  const { data: quote, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, paymentPlan, totalAmount, deal:sales_deals(*)')
    .eq('id', quotationId)
    .maybeSingle();
  if (quoteError) return fail(quoteError.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (quote.status !== 'accepted') return badRequest('สร้างใบสั่งขายได้เฉพาะ QT ที่ Won แล้ว');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();
  // โครงการปิดแล้ว = ออก SO ใบใหม่ไม่ได้ (มติ B3). SO ที่ออกไปแล้วยังยื่น/อนุมัติต่อได้
  const closedProject = await closedProjectBlock(supabase, quote.deal.projectId, 'ออกใบสั่งขายใบใหม่');
  if (closedProject) return badRequest(closedProject);

  /* หลักฐานส่วนตัวต้องชี้เข้าโฟลเดอร์ของใบเสนอราคาใบนี้เท่านั้น (ref เก่าแบบ URL/Drive
     ยังผ่านได้) — กันแนบไฟล์ของใบอื่นมาเป็นหลักฐานของใบนี้ */
  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
  const safeQuoteId = String(quote.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const attachmentOptions = {
    allowedStorageBucket: privateBucket,
    allowedStoragePathPrefix: `quotations/${safeQuoteId}/order-confirmation/`,
  };
  const confirmCheck = validateOrderConfirmation(body.confirmation || {}, attachmentOptions);
  if (!confirmCheck.ok) return badRequest(confirmCheck.error);
  const confirmation = confirmCheck.confirmation;

  // เงินงวดแรกที่ลูกค้าจ่ายมาแล้ว (ไม่บังคับ) — ลงเป็น "งวดร่างที่บันทึกเงินไว้"
  // สถานะยังเป็น pending ตาม CHECK ของ 0259 แล้วขึ้นเป็นคำแจ้งตอนใบอนุมัติ
  const firstPaidOn = String(body.firstPayment?.paidOn || '').trim() || null;
  const firstEvidence = sanitizeEvidenceAttachments(body.firstPayment?.evidence, attachmentOptions);
  if (firstPaidOn && !/^\d{4}-\d{2}-\d{2}$/.test(firstPaidOn)) return badRequest('รูปแบบวันที่ชำระงวดแรกไม่ถูกต้อง');
  if (firstPaidOn && !firstEvidence.length) return badRequest('บันทึกว่าลูกค้าจ่ายงวดแรกแล้ว ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');
  if (!firstPaidOn && firstEvidence.length) return badRequest('แนบหลักฐานการชำระงวดแรกแล้ว ต้องระบุวันที่ลูกค้าจ่ายด้วย');

  const storageMiss = await missingStoredEvidence(supabase, privateBucket, [
    ...(confirmation?.attachments || []), ...firstEvidence,
  ]);
  if (storageMiss) return badRequest(storageMiss);

  const orderId = genId('SOR');
  const { data: order, error } = await supabase.rpc('create_sales_order_draft', {
    p_quote_id: quotationId,
    p_order_id: orderId,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
    p_overrides: {
      referenceDoc: String(body.referenceDoc || '').trim() || null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      confirmDocType: confirmation?.docType || null,
      confirmDocNo: confirmation?.docNo || null,
      confirmDocDate: confirmation?.docDate || null,
      confirmAttachments: confirmation?.attachments || [],
    },
  });
  if (error) {
    if (error.code === '23505' || error.message?.includes('already_exists')) {
      return conflict('ใบเสนอราคาใบนี้ออกใบสั่งขายไปแล้ว');
    }
    return fail(error.message, /quotation_|sales_order_/.test(error.message || '') ? 400 : 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'sales_order', entityId: orderId, before: null, after: order, summary: `create SO draft from ${quote.quoteNumber}`, request: req });

  /* ── งวดชำระเกิดพร้อมใบ ไม่ต้องรอใครกดปุ่ม (มติผู้ใช้ 2026-08-19) ─────────
     เดิม B-4 ปลดด่าน "ต้องอนุมัติก่อน" แล้ว แต่ยังต้องกด "เริ่มติดตามการชำระ" ก่อน
     ถึงจะมีแถวให้กรอกกำหนดชำระ · ปุ่มนั้นไม่รับ input และไม่มีการตัดสินใจอยู่ข้างหลัง
     (`ensureInstallments` idempotent · ด่านเดียวคือใบต้องไม่ถูกยกเลิก ซึ่งใบที่เพิ่งเกิด
     เป็นไปไม่ได้) ⇒ เป็นก้าวที่ไม่ได้ถามอะไรผู้ใช้ ยกมาทำให้ตรงนี้เลย

     ⚠️ **ไม่ส่ง `frozenAt`** — แถวที่ได้เป็นงวดร่าง ยอดยังเดินตามแผนของ QT
     ไม่เข้าทะเบียนการชำระของบัญชี และแจ้งชำระไม่ได้จนกว่าใบจะอนุมัติ (กติกาเดิมของ 0259)
     ⚠️ **ล้มแล้วไม่ล้มทั้งคำขอ** — ใบเกิดแล้วใน RPC ที่ commit ไปแล้ว ตอบ error กลับไป
     เท่ากับผู้ใช้เห็น "สร้างไม่สำเร็จ" ทั้งที่ใบมีอยู่จริง · งวดเป็นของที่ derive จาก QT
     กู้ได้ด้วยปุ่ม "เริ่มติดตามการชำระ" ที่ยังอยู่บนการ์ด และตอนอนุมัติก็สร้างให้อยู่ดี */
  let installmentWarning = null;
  try {
    await ensureInstallments(supabase, {
      order: { ...order, quotation: { paymentPlan: quote.paymentPlan } },
      user,
    });
    await applyCreateFormPayments(supabase, {
      orderId, dues: body.installments, firstPaidOn, firstEvidence,
    });
  } catch (installmentError) {
    console.error('create SO: installments failed', orderId, installmentError);
    installmentWarning = 'ออกใบสำเร็จ แต่ตั้งงวดชำระตามที่กรอกไม่สำเร็จ — ตรวจการ์ด "การชำระ" บนใบ';
  }

  return ok(installmentWarning ? { ...order, warning: installmentWarning } : order, 201);
});

/**
 * กำหนดชำระรายงวด + เงินงวดแรกที่กรอกมาจากฟอร์มหน้าสร้าง
 *
 * ⚠️ เขียนหลังงวดเกิดแล้วเท่านั้น (จับคู่ด้วย `seq`) · สถานะไม่ถูกแตะเลย — งวดร่าง
 * ต้องเป็น `pending` ตาม CHECK `sales_order_installments_draft_pending` (0259)
 * `paidOn` + `evidence` บนแถว pending = "งวดร่างที่บันทึกเงินไว้" (installmentPrepaid)
 * ซึ่งจะกลายเป็นคำแจ้งให้บัญชีเองตอนใบอนุมัติ (freezeInstallments)
 */
async function applyCreateFormPayments(supabase, { orderId, dues, firstPaidOn, firstEvidence }) {
  const rows = await loadInstallments(supabase, orderId);
  if (!rows.length) return;
  const bySeq = new Map(rows.map((row) => [row.seq, row]));

  for (const item of Array.isArray(dues) ? dues : []) {
    const row = bySeq.get(Number(item?.seq));
    const dueDate = String(item?.dueDate || '').trim();
    if (!row || !dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) continue;
    await updateInstallment(supabase, row.id, { dueDate });
  }

  if (!firstPaidOn) return;
  const first = bySeq.get(1);
  if (!first) return;
  await updateInstallment(supabase, first.id, {
    paidOn: firstPaidOn,
    evidence: firstEvidence,
    note: first.note || 'ลูกค้าจ่ายมาก่อนออกใบ — บันทึกจากฟอร์มสร้างใบสั่งขาย',
  });
}

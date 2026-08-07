import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';

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
  // ใบไหนเป็นงานออกแบบกลิ่น (หมวด 03-001/002/005) และขายกี่กลิ่น · ก่อนหน้านี้ API
  // ไม่เคยส่งมา ⇒ `lines` เป็น undefined เสมอ ⇒ จำนวนกลิ่นไม่ขึ้นและบล็อกบรีฟไม่งอก
  // สักก้อน = เลือกใบสั่งขายแล้วทำอะไรต่อไม่ได้เลย (ผู้ใช้เจอเองบนจอ)
  //
  // ⚠️ เอาเฉพาะช่องที่ผู้เรียกใช้จริง — ทั้งแถวมีราคาต่อหน่วยและส่วนลดซึ่งไม่เกี่ยวกับ
  // คำร้อง ยิ่งดึงมามาก ยิ่งมีของให้หลุดออกทาง response โดยไม่ตั้งใจ
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

  const dealIds = [...new Set((orders || []).map((row) => row.dealId).filter(Boolean))];
  const quoteIds = [...new Set((orders || []).map((row) => row.quotationId).filter(Boolean))];
  const [{ data: deals, error: dealError }, { data: quotes, error: quoteError }] = await Promise.all([
    dealIds.length
      ? supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      ? supabase.from('quotations').select('id, quoteNumber, status').in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (dealError || quoteError) return fail((dealError || quoteError).message, 500);

  const dealById = new Map((deals || []).map((row) => [row.id, row]));
  const quoteById = new Map((quotes || []).map((row) => [row.id, row]));
  const visible = (orders || [])
    .map((row) => ({
      ...row,
      lines: linesByOrder.get(row.id) || [],
      deal: dealById.get(row.dealId) || null,
      quotation: quoteById.get(row.quotationId) || null,
      scentRequest: scentRequestByOrder.get(row.id) || null,
    }))
    .filter((row) => row.deal && inSalesViewScope(user, row.deal));

  return ok(visible);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const quotationId = String(body.quotationId || '').trim();
  if (!quotationId) return badRequest('กรุณาระบุใบเสนอราคา Won');

  const { data: quote, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, deal:sales_deals(*)')
    .eq('id', quotationId)
    .maybeSingle();
  if (quoteError) return fail(quoteError.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (quote.status !== 'accepted') return badRequest('สร้างใบสั่งขายได้เฉพาะ QT ที่ Won แล้ว');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();
  // โครงการปิดแล้ว = ออก SO ใบใหม่ไม่ได้ (มติ B3). SO ที่ออกไปแล้วยังยื่น/อนุมัติต่อได้
  const closedProject = await closedProjectBlock(supabase, quote.deal.projectId, 'ออกใบสั่งขายใบใหม่');
  if (closedProject) return badRequest(closedProject);

  const orderId = genId('SOR');
  const { data: order, error } = await supabase.rpc('create_sales_order_draft', {
    p_quote_id: quotationId,
    p_order_id: orderId,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
  });
  if (error) {
    if (error.code === '23505' || error.message?.includes('already_exists')) {
      return conflict('ใบเสนอราคาใบนี้ออกใบสั่งขายไปแล้ว');
    }
    return fail(error.message, /quotation_|sales_order_/.test(error.message || '') ? 400 : 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'sales_order', entityId: orderId, before: null, after: order, summary: `create SO draft from ${quote.quoteNumber}`, request: req });
  return ok(order, 201);
});

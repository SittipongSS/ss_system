// ── ทะเบียนการชำระรวมทุกใบสั่งขาย — ของฝ่ายบัญชีและการเงิน ──────────────────
//
// คำสั่งผู้ใช้ 2026-08-13: *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว
// ซึ่งราคาต้องมีการอ้างอิง QT SO และสามารถดาวน์โหลด"*
//
// ⭐ **อ่านอย่างเดียว** — ทางกดคอนเฟิร์ม/ตีกลับงวดยังอยู่ที่ใบ SO ที่เดิม
// (`/api/sales-planning/sales-orders/[id]/installments`) ซึ่งมีด่าน `installmentActionError`
// ครบอยู่แล้ว · เปิดทางเขียนที่นี่อีกชุดเมื่อไรก็ได้ด่านสองชุดที่เพี้ยนหากันแน่นอน
//
// ⚠️ exceljs ต้องใช้ Node runtime — ห้ามเป็น edge
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canAccessFinance } from '@/lib/permissions';
import { filterLedger, ledgerReport, ledgerRow, ledgerSummary, orderStateIndex, sortLedger } from '@/lib/finance/paymentLedger';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';
import { businessDate } from '@/lib/businessDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ดึงทีละก้อนด้วย `.in()` ไม่ใช่ไล่ยิงต่อแถว — ทะเบียนนี้โตตามจำนวนงวดทั้งระบบ
   (ใบละ 1–4 งวด) ยิงต่อแถวเมื่อไรหน้าเดียวก็หลายร้อยรีเควสต์ */
async function loadLedger(supabase, todayIso) {
  const { data: installments, error } = await supabase
    .from('sales_order_installments').select('*');
  if (error) throw error;
  const rows = installments || [];
  if (!rows.length) return [];

  const orderIds = [...new Set(rows.map((r) => r.salesOrderId).filter(Boolean))];
  const { data: orders, error: orderError } = await supabase
    .from('sales_orders')
    /* 🐞 เคยใส่ team/ownerName ไว้ด้วย แล้ว PostgREST ตอบ 500 ทั้งหน้า:
       `column sales_orders.team does not exist` — ทีมกับผู้ดูแลอยู่ที่ **ดีล** ไม่ใช่ที่ใบ
       ⇒ ดึง `dealId` มาแล้วไป join `sales_deals` เอาชื่อ AE (จัดกลุ่มตามผู้ดูแล) */
    /* `status` + `financeStatus` = สองขั้นแรกของรางสามขั้น (ดู salesOrderListTrack)
       ทะเบียนนี้ต้องพูดภาษาเดียวกับตารางรายการ SO ⇒ ต้องมีข้อมูลชุดเดียวกัน */
    .select('id, "orderNumber", "quotationId", "dealId", "customerId", "customerName", status, "financeStatus"')
    .in('id', orderIds);
  if (orderError) throw orderError;
  const orderById = new Map((orders || []).map((o) => [o.id, o]));

  /* ดีลของใบ — เอาแค่ผู้ดูแลกับทีม ไม่ลากทั้งแถวมา (ทะเบียนนี้โตตามจำนวนงวดทั้งระบบ)
     ⚠️ ใบที่ไม่ได้มาจากดีลมี `dealId` ว่างได้ ⇒ ต้องรอดโดยไม่มีผู้ดูแล ไม่ใช่พัง */
  const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
  const dealById = new Map();
  if (dealIds.length) {
    const { data: deals, error: dealError } = await supabase
      .from('sales_deals').select('id, "ownerId", "ownerName", team').in('id', dealIds);
    if (dealError) throw dealError;
    (deals || []).forEach((d) => dealById.set(d.id, d));
  }

  const quoteIds = [...new Set((orders || []).map((o) => o.quotationId).filter(Boolean))];
  const quoteById = new Map();
  if (quoteIds.length) {
    const { data: quotes, error: quoteError } = await supabase
      .from('quotations').select('id, "quoteNumber"').in('id', quoteIds);
    if (quoteError) throw quoteError;
    (quotes || []).forEach((q) => quoteById.set(q.id, q));
  }

  const customerIds = [...new Set((orders || []).map((o) => o.customerId).filter(Boolean))];
  const customerById = new Map();
  if (customerIds.length) {
    const { data: customers, error: customerError } = await supabase
      .from('customers').select('id, name, "arCode"').in('id', customerIds);
    if (customerError) throw customerError;
    (customers || []).forEach((c) => customerById.set(c.id, c));
  }

  return rows
    .map((installment) => {
      const order = orderById.get(installment.salesOrderId);
      if (!order) return null; // ใบถูกลบไปแล้วแต่แถวยังค้าง — ไม่ให้หลุดเป็นแถวไร้เลขที่
      return ledgerRow({
        installment,
        order,
        quotation: quoteById.get(order.quotationId) || null,
        customer: customerById.get(order.customerId) || null,
        deal: dealById.get(order.dealId) || null,
        todayIso,
      });
    })
    .filter(Boolean);
}

const listParam = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  /* ⭐ ด่านเดียวกับที่การ์ดระบบและแถบเมนูใช้ — แยกสองที่เมื่อไรก็ได้การ์ดที่กดแล้ว
     ไปเจอหน้าที่โหลดไม่ขึ้น (บั๊กที่โมดูล RD เคยเป็นมา ดูคอมเมนต์ใน config/systems.js) */
  if (!canAccessFinance(user)) return forbidden();

  const url = new URL(req.url);
  const todayIso = businessDate();
  try {
    const all = await loadLedger(supabase, todayIso);
    /* ⚠️ ดัชนีสถานะระดับใบคิดจาก **ก่อนกรอง** — ดูเหตุผลที่ `orderStateIndex` */
    const orderStates = orderStateIndex(all);
    const filtered = sortLedger(filterLedger(all, {
      status: listParam(url.searchParams.get('status')),
      from: url.searchParams.get('from') || null,
      to: url.searchParams.get('to') || null,
      q: url.searchParams.get('q') || '',
      overdueOnly: url.searchParams.get('overdue') === '1',
      orderState: listParam(url.searchParams.get('orderState')),
      orderStates,
    }));

    if (url.searchParams.get('format') === 'xlsx') {
      /* ⚠️ ไฟล์ที่ดาวน์โหลด = **สิ่งที่กรองไว้บนจอ** ไม่ใช่ทั้งทะเบียนเสมอ —
         คนกดปุ่มขณะกรองอยู่ คาดหวังได้ของที่เห็น ไม่ใช่ 3,000 แถว
         ⚠️ ชื่อไฟล์ประทับวันเวลาไว้ เพราะบัญชีจะดาวน์โหลดซ้ำหลายรอบในวันเดียว
         แล้วไฟล์ชื่อเดียวกันในโฟลเดอร์ดาวน์โหลดคือของที่หยิบผิดไฟล์ */
      const buf = await reportToXlsxBuffer(ledgerReport(filtered));
      const stamp = todayIso.replaceAll('-', '');
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${stamp}_payment-ledger.xlsx"`,
        },
      });
    }

    return ok({
      rows: filtered,
      summary: ledgerSummary(filtered),
      // สรุปของ **ทั้งทะเบียน** ไว้ให้หน้าภาพรวมบอกได้ว่ากรองอยู่เห็นไม่ครบ
      totalRows: all.length,
      todayIso,
    });
  } catch (loadError) {
    return fail(loadError.message, 500);
  }
});

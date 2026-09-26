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
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { canAccessFinance } from '@/lib/permissions';
import {
  filterLedger, ledgerBillingTally, ledgerReport, ledgerRow, ledgerSummary, ledgerVoidInstallment, orderStateIndex,
  sortLedger, stampConfirmOutlook, stampOrderInstallmentCount, stampOrderPaidThrough, stampOrderReplanned, undatedHiddenBy,
} from '@/lib/finance/paymentLedger';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';
import { businessDate } from '@/lib/businessDate';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';
import { orderHasServiceRounds } from '@/lib/sales/serviceOrders';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { customerNameIn } from '@/lib/master/customerName';
import { billingDueCandidates } from '@/lib/sales/billingDueNotify';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ลูกค้าของใบ + รอบวางบิล (mig 0389) — ยิงทีละก้อน: id ลูกค้าเป็น 'CUS-'+uuid ยาว 40 ตัวอักษร ⇒ URL เกิน 16 KB
   ที่ ~330 ราย (เหตุผลเต็มที่ lib/supabaseInChunks.js) · ไล่หน้าด้วย fetchAllResult + `.order('id')` ที่นิ่ง
   ⚠️ ก่อนรัน 0389 ไม่มีคอลัมน์ "billingRule" (42703) ⇒ ถอยไปอ่านชุดเดิม — ทะเบียนต้องเปิดได้ก่อนรันมิก
     (ทุกลูกค้าอ่านเป็น "ยังไม่ตั้งรอบวางบิล" ซึ่งตรงความจริงของวันนั้น) · แพตเทิร์นเดียวกับ loadListInstallments */
async function loadLedgerCustomers(supabase, customerIds) {
  const withRule = await fetchInChunks(customerIds, (chunk) => fetchAllResult(() => supabase
    .from('customers').select('id, name, "nameEn", "arCode", "billingRule"')
    .in('id', chunk).order('id', { ascending: true })));
  if (withRule.error?.code !== '42703') return withRule;
  return fetchInChunks(customerIds, (chunk) => fetchAllResult(() => supabase
    .from('customers').select('id, name, "nameEn", "arCode"')
    .in('id', chunk).order('id', { ascending: true })));
}

/* ดึงทีละก้อนด้วย `.in()` ไม่ใช่ไล่ยิงต่อแถว — ทะเบียนนี้โตตามจำนวนงวดทั้งระบบ
   (ใบละ 1–4 งวด) ยิงต่อแถวเมื่อไรหน้าเดียวก็หลายร้อยรีเควสต์ */
async function loadLedger(supabase, todayIso) {
  /* ⭐ **เฉพาะงวดที่ยอดหยุดแล้ว** (B-4 · mig 0259) — งวดของใบร่างมีตัวตนใน DB แล้ว
     แต่ยอดยังเดินตามแผนของ QT ⇒ ปล่อยเข้าทะเบียนเมื่อไร บัญชีเปิดมาเจอ **คิวเงินที่
     ยังไม่มีอยู่จริง** และยอดรวมทั้งหน้าผิดทันที
     ⚠️ กรองที่ query ไม่ใช่หลังโหลด — ทะเบียนนี้โตตามจำนวนงวดทั้งระบบ */
  const { data: installments, error } = await fetchAllResult(() => supabase
    .from('sales_order_installments').select('*').not('frozenAt', 'is', null)
    .order('salesOrderId', { ascending: true })
    .order('seq', { ascending: true })
    .order('id', { ascending: true }));
  if (error) throw error;
  const rows = installments || [];
  if (!rows.length) return [];

  const orderIds = [...new Set(rows.map((r) => r.salesOrderId).filter(Boolean))];
  /* 🐞 เคยใส่ team/ownerName ไว้ด้วย แล้ว PostgREST ตอบ 500 ทั้งหน้า:
     `column sales_orders.team does not exist` — ทีมกับผู้ดูแลอยู่ที่ **ดีล** ไม่ใช่ที่ใบ
     ⇒ ดึง `dealId` มาแล้วไป join `sales_deals` เอาชื่อ AE (จัดกลุ่มตามผู้ดูแล) */
  /* `status` + `financeStatus` = สองขั้นแรกของรางสามขั้น (ดู salesOrderListTrack)
     ทะเบียนนี้ต้องพูดภาษาเดียวกับตารางรายการ SO ⇒ ต้องมีข้อมูลชุดเดียวกัน */
  /* `projectId` เพิ่มมาเพื่อถามสายธุรกิจ — โครงการเป็นเจ้าของค่าสายจริง ดีลเป็นสำเนา
     (ดู `orderBusinessLineOf` · มติ 2026-08-30 ตัวกรอง "สายบริการ" ของฝ่ายบัญชี) */
  /* `referenceDoc` = เอกสารอ้างอิงของใบ (PO ลูกค้า) — บัญชีถูกถามด้วยเลข PO
     บ่อยกว่าเลข SO เสียอีก ("PO ใบนี้เก็บเงินถึงไหนแล้ว") · หน้ารายการ SO ของ
     ฝ่ายขายค้นด้วยเลขนี้ได้ตั้งแต่ IS-26080017 แต่ทะเบียนนี้ยังไม่มีให้ค้น */
  /* คอมเมนต์ทั้งหมดอยู่เหนือคำสั่ง ไม่แทรกระหว่าง `.from()` กับ `.select()` (2026-09-15) —
     ตอนนั้นเป็นข้อบังคับ เพราะ `check:columns` มองหา select ไม่เกิน 200 ตัวอักษรหลัง `.from()`
     คอมเมนต์ที่เคยคั่นตรงนั้น (~830 ตัวอักษร) ทำให้ select นี้ (รวม `origin` + เลขเอกสารเดิมของ mig 0360)
     หลุดจากด่านมาตลอด
     · 2026-09-23 ด่านเลิกใช้หน้าต่างแล้ว (ไล่หา `.select(` ตัวแรกก่อน `.from(` ตัวถัดไป)
     ⇒ ไม่ใช่ข้อบังคับอีก แต่ยังอ่านง่ายกว่า จึงคงรูปนี้ไว้ */
  /* `approvedAt` + `approvedByName` = บรรทัด "อนุมัติใบ: <AE Sup> · <วัน> · ไม่นับ Actual" ในโมดัลรับรองงวดของ
     ใบย้อนหลัง (มติ 22/09 · mock FnConfirm) — บัญชีต้องเห็นว่าใบผ่าน AE Sup แล้วก่อนรับรองเงินก้อนแรก */
  const { data: orders, error: orderError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "referenceDoc", "dealId", "projectId", "customerId", "customerName", status, "financeStatus", "totalAmount", "approvedAt", "approvedByName", origin, "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef"')
    .in('id', chunk)
    .order('id', { ascending: true })));
  if (orderError) throw orderError;
  const orderById = new Map((orders || []).map((o) => [o.id, o]));

  /* ดีลของใบ — เอาแค่ผู้ดูแลกับทีม ไม่ลากทั้งแถวมา (ทะเบียนนี้โตตามจำนวนงวดทั้งระบบ)
     ⚠️ ใบที่ไม่ได้มาจากดีลมี `dealId` ว่างได้ ⇒ ต้องรอดโดยไม่มีผู้ดูแล ไม่ใช่พัง */
  const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
  const dealById = new Map();
  if (dealIds.length) {
    const { data: deals, error: dealError } = await fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase
      // `line` = สายธุรกิจ (สำเนาที่ดีลถือ) — ครึ่งหนึ่งของเกณฑ์ "ใบมีรอบบริการ"
      .from('sales_deals').select('id, "ownerId", "ownerName", team, line').in('id', chunk).order('id', { ascending: true })));
    if (dealError) throw dealError;
    (deals || []).forEach((d) => dealById.set(d.id, d));
  }

  /* ── เกณฑ์ "ใบมีรอบบริการ" (มติผู้ใช้ 2026-08-30) ─────────────────────────
     สาย SERVICE **และ** มีบรรทัดหมวด 02-001 อย่างน้อยหนึ่งบรรทัด ⇒ ต้องรู้สองอย่าง:
     สายจากโครงการ/ดีล และบรรทัดของใบ · ตัวตัดสินคือ `orderHasServiceRounds` ตัวกลาง
     ⚠️ ห่อ `fetchAllResult` ทั้งสองก้อน — PostgREST ตัดที่ 1,000 แถวเงียบ ๆ และ
     `check:rowcap` เต็มเพดานพอดีทุกตาราง จุดอ่านไร้ขอบเขตใหม่เพิ่มไม่ได้แล้ว */
  const projectIds = [...new Set((orders || []).map((o) => o.projectId).filter(Boolean))];
  const projectsById = new Map();
  if (projectIds.length) {
    /* ⚠️ `.order('id')` บังคับ — `fetchAll` ไล่ทีละหน้าด้วย `.range()` ซึ่ง PostgREST
       ไม่การันตีลำดับถ้าไม่สั่ง ⇒ เกิน 1,000 แถวเมื่อไรได้แถวซ้ำและแถวหายพร้อมกัน
       ซึ่งแย่กว่าถูกตัด เพราะมันดูเหมือนข้อมูลครบ (ดูหัวไฟล์ lib/supabaseFetchAll.js) */
    const { data: projects, error: projectError } = await fetchAllResult(() => supabase
      .from('projects').select('id, line').in('id', projectIds).order('id'));
    if (projectError) throw projectError;
    (projects || []).forEach((p) => projectsById.set(p.id, p));
  }
  const dealsById = new Map([...dealById.entries()]);

  /* ⚠️ ก้อนนี้ใหญ่แน่ — ใบจริงมีได้ถึง 10 บรรทัดต่อใบ คูณทุกใบที่มีงวดตรึงแล้วทั้งระบบ
     ⇒ เกิน 1,000 แถวเป็นเรื่องปกติ ต้องมี `.order()` ที่นิ่ง ไม่งั้นบรรทัดหมวด 02-001
     ของบางใบจะหายไปในหน้าที่สอง แล้วใบนั้นกลายเป็น "ไม่ใช่ใบบริการ" แบบสุ่มทุกครั้งที่รีเฟรช */
  const { data: orderLines, error: lineError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_lines').select('id, "salesOrderId", "fgCode"').in('salesOrderId', chunk).order('id')));
  if (lineError) throw lineError;
  const linesByOrder = new Map();
  for (const line of orderLines || []) {
    const list = linesByOrder.get(line.salesOrderId) || [];
    list.push(line);
    linesByOrder.set(line.salesOrderId, list);
  }
  const serviceRoundsByOrder = new Map((orders || []).map((o) => [
    o.id,
    orderHasServiceRounds(o, linesByOrder.get(o.id) || [], { projectsById, dealsById }),
  ]));

  /* `paymentPlan` = แผนของ QT — ป้าย "ปรับแผนหลังอนุมัติ" (0377 · มติ D5) เทียบงวดจริงกับแผนนี้ (ไม่เก็บข้อมูลเพิ่ม) */
  const quoteIds = [...new Set((orders || []).map((o) => o.quotationId).filter(Boolean))];
  const quoteById = new Map();
  if (quoteIds.length) {
    const { data: quotes, error: quoteError } = await fetchInChunks(quoteIds, (chunk) => fetchAllResult(() => supabase
      .from('quotations').select('id, "quoteNumber", "paymentPlan", status').in('id', chunk).order('id', { ascending: true })));
    if (quoteError) throw quoteError;
    (quotes || []).forEach((q) => quoteById.set(q.id, q));
  }
  const planByQuotation = new Map([...quoteById.values()].map((q) => [q.id, q.paymentPlan ?? null]));

  const customerIds = [...new Set((orders || []).map((o) => o.customerId).filter(Boolean))];
  const customerById = new Map();
  if (customerIds.length) {
    const { data: customers, error: customerError } = await loadLedgerCustomers(supabase, customerIds);
    if (customerError) throw customerError;
    /* 🐞 ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้แถวไร้ชื่อทั้งบนจอและในไฟล์ Excel ที่บัญชีโหลดไป
       ⇒ ตัดสินชื่อที่จะวาดตั้งแต่ตรงนี้ ทางเดียวกันทั้งสองปลายทาง */
    (customers || []).forEach((c) => customerById.set(c.id, { ...c, name: customerNameIn(c) }));
  }

  /* ── คำร้องขอใบวางบิลที่งวดผูกอยู่ (0260) — ตัดสิน "ขอใบแล้ว" ของรอบวางบิล (0389) ─────────────────
     ⚠️ ยกเลิกคำร้องไม่ล้าง `billingRequestId` บนงวด ⇒ ต้องอ่านสถานะคำร้องจริง (`billingRequestAlive`)
       ไม่งั้นงวดที่คำร้องตายแล้วหลุดจาก "เลยรอบ ยังไม่ขอใบวางบิล" เงียบ ๆ
     ⚠️ เอาแค่ id + สถานะ · ไล่หน้า + ซอยก้อน (dept_requests อยู่ใน check:rowcap) · อ่านไม่ขึ้น = โยน (แบบทุกก้อนข้างบน)
       ไม่ใช่ถือว่า "ยังไม่ขอ" ทุกงวด ซึ่งจะทำให้การ์ด/ตัวกรองนับเลยรอบเกินจริงโดยไม่มีอะไรบอก */
  const requestIds = [...new Set(rows.map((r) => r.billingRequestId).filter(Boolean))];
  const billingRequestById = new Map();
  if (requestIds.length) {
    const { data: requests, error: requestError } = await fetchInChunks(requestIds, (chunk) => fetchAllResult(() => supabase
      .from('dept_requests').select('id, status').in('id', chunk).order('id', { ascending: true })));
    if (requestError) throw requestError;
    (requests || []).forEach((r) => billingRequestById.set(r.id, r));
  }

  /* ── ตัวกรอง `?billing=soon` = ชุดของกระดิ่ง "ถึงรอบวางบิล" เป๊ะ (รอบสอง 26/09 · มติเจ้าของ ข้อ 4) ─────────────────
     ⭐ ถาม `billingDueCandidates` **ตัวเดียวกับ cron daily-digest** ด้วยวัตถุดิบชุดเดียวกัน (ใบ + สถานะ QT · ลูกค้า ·
       คำร้องที่ผูก · ข้ามสหมิตรด้วยค่าคงที่บ้านเดียว) ⇒ หัวข้อ "N งวด" บนกระดิ่ง FN = แถวที่ลิงก์เปิดมาเจอ
       เคยคิดเองจากสถานะงวดอย่างเดียวไม่ได้: ตัวคัดตัดร่างที่ QT ถูกถอด Won · ใบย้อนหลังที่ยังไม่อนุมัติ · ลูกค้าสหมิตร ด้วย
     ⚠️ ใบต้องพก `quotation` ({ status }) — ไม่มี = ด่านร่างที่ QT ตายไม่ตัดสิน (แบบเดียวกับที่ cron แนบ)
     ⚠️ งวดที่ตัวคัดเลือกเป็นเซตย่อยของทะเบียนเสมอ (ตัวคัดตัดใบยอด 0 · งวดโมฆะ · งวดร่าง เหมือนทะเบียน) */
  const remindIds = new Set(billingDueCandidates(rows, {
    todayIso,
    ordersById: new Map([...orderById.values()].map((o) => [o.id, { ...o, quotation: quoteById.get(o.quotationId) || null }])),
    customersById: customerById,
    requestsById: billingRequestById,
    skipArCodes: [SAHAMIT_AR_CODE],
  }).map(({ installment }) => installment.id));

  const ledger = rows
    .map((installment) => {
      const order = orderById.get(installment.salesOrderId);
      if (!order) return null; // ใบถูกลบไปแล้วแต่แถวยังค้าง — ไม่ให้หลุดเป็นแถวไร้เลขที่
      /* ใบยอด 0 ไม่มีขั้นยืนยันการชำระแล้ว (มติผู้ใช้ 2026-08-18) ⇒ ไม่ต้องเข้าทะเบียน
         ของบัญชี · ใบเก่ายังมีแถวค้างอยู่จริง (prod 13 ใบ) — **ไม่ลบ** แค่ไม่เอามาโชว์
         เป็นคิวงาน ไม่งั้นบัญชีเปิดมาเจอของที่ไม่มีวันมีเงินให้ตรวจ */
      if (paymentNotRequired(order.totalAmount)) return null;
      /* ⭐ งวดที่ยังไม่มีเงินของใบยกเลิก/ถูกออก Rev. ทับ = โมฆะ ไม่ใช่ยอดค้างรับ (PR0 · แผน so-payment-unlock-replan)
         🐞 23/09 ทะเบียนนับยอดค้างรับเทียม ฿577,667.32 บนใบที่ยกเลิกแล้ว · reported/confirmed ยังอยู่ครบ
         ⚠️ ตัดก่อน `orderStateIndex`/"จ่ายถึง" (ประทับจาก `all`) — งวดโมฆะไม่ใช่งวดของใบอีกต่อไป */
      if (ledgerVoidInstallment(installment, order)) return null;
      return ledgerRow({
        installment,
        order,
        quotation: quoteById.get(order.quotationId) || null,
        customer: customerById.get(order.customerId) || null,
        deal: dealById.get(order.dealId) || null,
        todayIso,
        serviceRounds: serviceRoundsByOrder.get(order.id) || false,
        billingRequest: billingRequestById.get(installment.billingRequestId) || null,
        billingRemind: remindIds.has(installment.id),
      });
    })
    .filter(Boolean);
  /* ป้ายระดับใบ — ประทับที่นี่ = ชุดก่อนกรองเสมอ (ตัวกรองของ GET ทำงานหลังฟังก์ชันนี้คืนค่า) */
  stampOrderReplanned(ledger, planByQuotation);
  return ledger;
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
    /* ⚠️ "จ่ายถึง" ก็เป็นค่าระดับใบเหมือนกัน ⇒ ต้องประทับจากชุดก่อนกรองด้วยเหตุผลเดียวกัน
       (กรองสถานะงวดแล้วงวด confirmed หลุด ค่าจะกลายเป็น "ยังไม่ครอบ" ทั้งที่เงินครอบอยู่) */
    stampOrderPaidThrough(all);
    /* จำนวนงวดของทั้งใบ ("แสดง n จาก m งวด" · "แบ่ง m งวด") — ค่าระดับใบ ประทับก่อนกรองด้วยเหตุผลเดียวกัน
       (กระดิ่ง FN เปิด `?billing=soon` แล้วใบ 12 งวดเหลือหนึ่งงวด ⇒ นับหลังกรอง = "ชำระครั้งเดียว" ทั้งที่ไม่ใช่) */
    stampOrderInstallmentCount(all);
    /* ภาพหลังรับรอง (จ่ายถึง · เก็บแล้ว · งวดถัดไป) ของงวดในคิว — ค่าระดับใบเหมือนกัน ประทับก่อนกรองด้วยเหตุผลเดียวกัน */
    stampConfirmOutlook(all);
    const filters = {
      status: listParam(url.searchParams.get('status')),
      from: url.searchParams.get('from') || null,
      to: url.searchParams.get('to') || null,
      q: url.searchParams.get('q') || '',
      overdueOnly: url.searchParams.get('overdue') === '1',
      orderState: listParam(url.searchParams.get('orderState')),
      // service | other — เกณฑ์เต็มของ "ใบมีรอบบริการ" (มติผู้ใช้ 2026-08-30)
      line: listParam(url.searchParams.get('line')),
      /* missing | issued — ใบกำกับภาษีของงวด (mig 0348)
         ⚠️ ต้องอยู่ใน literal นี้ ไม่งั้น API เมินพารามิเตอร์เงียบ ๆ **ทั้งจอและไฟล์**
         (ไฟล์ Excel ใช้ query ชุดเดียวกัน) แล้วชิปตัวกรองจะติดอยู่โดยข้อมูลไม่ถูกกรอง */
      taxInvoice: url.searchParams.get('taxInvoice') || '',
      /* soon | 7d | month | late — รอบวางบิล (mig 0389 · ม็อก D) · กระดิ่งฝั่ง FN ลิงก์มาที่ `?billing=soon` (ชุดของกระดิ่ง)
         ⚠️ เหตุผลเดียวกับ taxInvoice ข้างบน: ไม่อยู่ใน literal นี้ = API เมินเงียบทั้งจอและไฟล์ */
      billing: url.searchParams.get('billing') || '',
      orderStates,
    };
    const filtered = sortLedger(filterLedger(all, filters));
    /* ⭐ งวดที่ยังไม่มีกำหนดชำระถูกตัดออกโดยตัวกรองช่วงวัน (ถูกต้องตามความหมายของ
       ตัวกรอง) — แต่ยอดสรุปคิดจากแถวที่เหลือ ⇒ ต้องบอกด้วยว่าซ่อนไปเท่าไร
       ไม่งั้นบัญชีกรองดูเดือนหนึ่งแล้วเชื่อว่ายอดค้างมีเท่าที่เห็น */
    const undatedHidden = undatedHiddenBy(all, filters);
    /* ตัวนับบนตัวเลือกของกลุ่ม "รอบวางบิล" + งวดที่ยังไม่มีวันวางบิลซึ่งตัวกรองนั้นซ่อน — กติกาเดียวกับ undatedHidden */
    const billingTally = ledgerBillingTally(all, filters);

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
      undatedHidden,
      billingTally,
      todayIso,
    });
  } catch (loadError) {
    return fail(loadError.message, 500);
  }
});

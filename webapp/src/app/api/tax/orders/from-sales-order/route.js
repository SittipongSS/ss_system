import { genId } from "@/lib/id";
import { fetchAllInChunks, fetchInChunks } from "@/lib/supabaseInChunks";
import { fetchAllResult } from "@/lib/supabaseFetchAll";
import { recordAudit } from "@/lib/audit";
import { withUser, badRequest, conflict, fail, forbidden, notFound, ok, unauthorized } from "@/lib/http";
import { can, caretakerTeamsOf } from "@/lib/permissions";
import { canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from "@/lib/salesPlanning";
import { insertOrder, insertOrderItems } from "@/lib/tax/orders";
import { resolveSoFiling } from "@/lib/excise/soFiling";
import { customerTaxSiblingIdMap } from "@/lib/master/customerTaxSiblings";
import { filingItemRows, resolveSalesOrderFiling } from "@/lib/excise/soFilingItems";
import { dealTypeOf } from "@/lib/salesPlanning";
import { NA } from "@/lib/format";
import { exciseHandledOrderIds } from "@/lib/excise/exciseQuotation";
import { findFilingFor, loadFilingSource } from "@/lib/excise/raFiling";
import { notBilledLabel } from "@/lib/excise/raFilingRules";
import { isHistoricalOrder, pipelineRowsOnly } from "@/lib/sales/historicalOrders";

// ค่าที่ลงคอลัมน์ต้องเป็น null เมื่อไม่มีข้อมูล — ขีดกับสตริงว่างเป็นเรื่องของการแสดงผล
// (dealTypeOf คืน "-" เมื่อดีลไม่มีประเภท)
const refOrNull = (value) => {
  const v = String(value ?? '').trim();
  return v && v !== '-' ? v : null;
};

export const dynamic = "force-dynamic";

const missingSalesOrderColumn = (error) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || (error.message || "").includes("salesOrderId"));

// ทีมที่ดูแลลูกค้า ใช้เป็นเจ้าภาพสำรองของใบยื่น — เอาเฉพาะกรณีมีทีมเดียว ลูกค้าที่หลายทีม
// ดูแลแปลว่าเดาไม่ได้ว่าใบนี้เป็นของใคร ตรึงผิดทีมแย่กว่าปล่อยเป็นของกลาง
const soCaretakerTeam = (customer) => {
  const teams = caretakerTeamsOf(customer);
  return teams.length === 1 ? teams[0] : null;
};

async function findExistingFiling(supabase, salesOrderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, totalTax, amountToCollect, salesOrderId, createdAt")
    .eq("salesOrderId", salesOrderId)
    .maybeSingle();
  if (missingSalesOrderColumn(error)) return { filing: null, schemaReady: false };
  if (error) throw error;
  return { filing: data || null, schemaReady: true };
}

async function loadSalesOrderContext(supabase, salesOrderId) {
  const { data: salesOrder, error } = await supabase
    .from("sales_orders")
    .select("*, lines:sales_order_lines(*)")
    .eq("id", salesOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!salesOrder) return null;

  // ทะเบียนลูกค้าอ่านรายตัวด้วย id (ไม่ผ่านลิสต์ที่กรองทีม) — ค่าที่ได้จะถูกตรึงลงใบยื่น
  // เพื่อให้เอกสารพิมพ์เหมือนกันทุกคนที่กด (mig 0167)
  const [{ data: deal }, { data: quotation }, { data: customer }] = await Promise.all([
    // title/dealType ต้องมาด้วย — ใช้ตรึง "โครงการย่อย" ลงใบ (mig 0208) ไม่ใช่แค่เช็คสิทธิ์
    supabase.from("sales_deals").select("id, team, ownerId, ownerName, title, dealType").eq("id", salesOrder.dealId).maybeSingle(),
    supabase.from("quotations").select("id, quoteNumber, customerTaxId, billingAddress").eq("id", salesOrder.quotationId).maybeSingle(),
    salesOrder.customerId
      // team/teams ต้องอยู่ใน select ด้วย — ใช้ถอยหาทีมเจ้าภาพของใบยื่นเมื่อดีลแม่ไม่มีทีม
      // (ถ้าไม่ดึงมา caretakerTeamsOf จะได้ [] เงียบ ๆ แล้ว fallback กลายเป็นโค้ดตาย)
      ? supabase.from("customers").select("id, taxId, address, team, teams").eq("id", salesOrder.customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // โครงการผูกกับ SO ตรง ๆ (sales_orders.projectId, mig 0107)
  const { data: project } = salesOrder.projectId
    ? await supabase.from("projects").select("id, code, name").eq("id", salesOrder.projectId).maybeSingle()
    : { data: null };
  return {
    ...salesOrder,
    deal: deal || null,
    project: project || null,
    quotation: quotation || null,
    customer: customer || null,
  };
}

async function listAvailableSalesOrders(supabase, user, customerId) {
  /* 🐞 เดิม `.limit(200)` ก่อนกรอง "ยื่นแล้ว/นอกขอบเขต/ไม่เข้าเกณฑ์" — ใบอนุมัติใหม่ ๆ กิน 200 ช่อง
     แล้วใบเก่าที่ยังรอยื่นหลุดจากตัวเลือกเงียบ ๆ ทั้งที่คิวรอยื่น (handoffQueueData) ยังนับอยู่
     ⇒ คีย์ใบสั่งขายย้อนหลัง ~220 ใบ (เกิดเป็นอนุมัติแล้ว) = ใบจริงที่รอยื่นหายจากตัวเลือกทั้งหมด
     ⇒ ไล่หน้าอ่านครบ แล้วค่อยกรอง */
  const { data: salesOrders, error } = await fetchAllResult(() => {
    let query = supabase
      .from("sales_orders")
      // ⚠️ ต้องมี status ในลิสต์คอลัมน์: resolveSoFiling ตัดสิน eligible ด้วย
      // salesOrder.status === 'approved' — ไม่ดึงมา = undefined = ลิสต์ว่างเสมอ
      // (บั๊กจริงที่ทำให้ปุ่ม "สร้างใบยื่นจาก Sale Order" ไม่เคยมีตัวเลือกให้เลือก)
      .select("id, orderNumber, status, customerId, customerName, orderDate, totalAmount, actualAmount, dealId, quotationId, createdAt, exciseNotBilledKind")
      .eq("status", "approved")
      .order("createdAt", { ascending: false })
      .order("id", { ascending: true });
    // ⛔ ใบสั่งขายย้อนหลัง (mig 0360) ออกบิลนอกระบบไปแล้ว — ไม่ใช่ตัวเลือกยื่นภาษี
    query = pipelineRowsOnly(query);
    if (customerId) query = query.eq("customerId", customerId);
    return query;
  });
  if (error) throw error;
  const dealIds = [...new Set((salesOrders || []).map((row) => row.dealId).filter(Boolean))];
  const [{ data: deals, error: dealError }, filingResult] = await Promise.all([
    fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase
      .from("sales_deals").select("id, team, ownerId, ownerName").in("id", chunk)
      .order("id", { ascending: true }))),
    supabase.from("orders").select("salesOrderId").not("salesOrderId", "is", null),
  ]);
  if (dealError) throw dealError;
  if (missingSalesOrderColumn(filingResult.error)) return { salesOrders: [], schemaReady: false };
  if (filingResult.error) throw filingResult.error;

  const dealById = new Map((deals || []).map((deal) => [deal.id, deal]));
  const used = new Set((filingResult.data || []).map((filing) => filing.salesOrderId).filter(Boolean));
  /* แผนรื้อสรรพสามิต PR3: SO ที่ออกใบค่าสรรพสามิตแล้ว/ตัดสินไม่เรียกเก็บแล้ว ไม่ใช่งานค้างของฝ่ายขาย (แถบเตือนทะเบียน SO นับจากลิสต์นี้) */
  for (const orderId of await exciseHandledOrderIds(supabase, salesOrders || [])) used.add(orderId);
  const available = (salesOrders || [])
    .filter((salesOrder) => {
      const deal = dealById.get(salesOrder.dealId);
      return deal && inSalesEditScope(user, deal) && !used.has(salesOrder.id);
    })
    .map((salesOrder) => ({ ...salesOrder, deal: dealById.get(salesOrder.dealId) }));
  if (!available.length) return { schemaReady: true, salesOrders: [] };

  const { data: lines, error: lineError } = await fetchInChunks(available.map((salesOrder) => salesOrder.id), (chunk) => fetchAllResult(() => supabase
    .from("sales_order_lines")
    .select("id, salesOrderId, productId, fgCode, description, qty, packQty")
    .in("salesOrderId", chunk)
    .order("salesOrderId", { ascending: true })
    .order("id", { ascending: true })));
  if (lineError) throw lineError;
  const productIds = [...new Set((lines || []).map((line) => line.productId).filter(Boolean))];
  const [{ data: products, error: productError }, { data: productTypes, error: typeError }, registrationResult] = await Promise.all([
    /* ยิงทีละก้อน — id สินค้าเป็น 'PRD-'+uuid ยาว 40 ตัวอักษร ⇒ URL เกิน 16 KB ที่ ~330 ใบ
       ทะเบียนสินค้าวันนี้ 435 ใบ · รูปเดียวกับบั๊กที่ทำ /api/products ล่มไปแล้ว */
    fetchInChunks(productIds, (chunk) => supabase.from("products").select("*").in("id", chunk)),
    supabase.from("product_types").select("mainCategoryCode, typeCode, isExcise, requiresFdaNotice"),
    fetchInChunks(productIds, (chunk) => supabase.from("excise_registrations")
      .select("id, productId, customerId, status, isExciseTaxable").eq("status", "approved").in("productId", chunk)),
  ]);
  if (productError) throw productError;
  if (typeError) throw typeError;
  if (registrationResult.error) throw registrationResult.error;
  const linesByOrder = new Map();
  (lines || []).forEach((line) => {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId).push(line);
  });
  // ทะเบียนของ "นิติบุคคล" ไม่ใช่ของใบลูกค้าใบเดียว — โหลดชุดเดียวสองคิวรี ห้าม N+1
  const ownerIdsByCustomer = await customerTaxSiblingIdMap(
    supabase,
    available.map((salesOrder) => salesOrder.customerId),
  );

  /* เลขใบเสนอราคาต้นทางของแต่ละ SO — จอตอนสร้างใบยื่นต้องบอกได้ว่ากำลังยื่นตาม
     ใบเสนอราคาใบไหน (มติผู้ใช้ 2026-09-07) · ยิงทีละก้อนด้วยเหตุผลเดียวกับสินค้า
     ข้างบน: id ของ QT ยาว 40 ตัวอักษร ลิสต์โตตามจำนวน SO ที่ค้างยื่น
     ไม่ต้องส่ง `sort` — ผลเข้า Map ลำดับไม่มีความหมาย (`.order()` ที่นี่มีไว้ให้การ
     ไล่หน้าในก้อนมีลำดับนิ่ง ไม่ใช่เพื่อเรียงผลลัพธ์) */
  const quoteRows = await fetchAllInChunks(
    available.map((salesOrder) => salesOrder.quotationId),
    (chunk) => supabase.from("quotations").select("id, quoteNumber").in("id", chunk)
      .order("id", { ascending: true }),
  );
  const quoteNumberById = new Map(quoteRows.map((row) => [row.id, row.quoteNumber]));

  return {
    schemaReady: true,
    salesOrders: available
      .map((salesOrder) => {
        const resolved = resolveSoFiling({
          salesOrder,
          lines: linesByOrder.get(salesOrder.id) || [],
          products: products || [],
          productTypes: productTypes || [],
          registrations: registrationResult.data || [],
          ownerCustomerIds: ownerIdsByCustomer.get(salesOrder.customerId) || null,
        });
        return {
          ...salesOrder,
          quoteNumber: quoteNumberById.get(salesOrder.quotationId) || null,
          filingItemCount: resolved.lines.length,
          filingTotalTax: resolved.totalTax,
          filingAmountToCollect: resolved.amountToCollect,
          filingWarningCount: resolved.warnings.length,
          eligible: resolved.eligible,
        };
      })
      .filter((salesOrder) => salesOrder.eligible),
  };
}

// ตัวคิดย้ายไป lib/excise/soFilingItems ให้ทางคิดภาษีใหม่จากใบสั่งขาย (PATCH /api/orders/[id]) ใช้ตัวเดียวกัน
const resolveContext = (supabase, salesOrder) => resolveSalesOrderFiling(supabase, salesOrder);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const url = new URL(req.url);
  const salesOrderId = url.searchParams.get("salesOrderId")?.trim();
  if (url.searchParams.get("available") === "1") {
    if (!can(user.role, "sales:act")) return forbidden();
    try {
      return ok(await listAvailableSalesOrders(supabase, user, url.searchParams.get("customerId")?.trim()));
    } catch (error) {
      return fail(`โหลด ใบสั่งขายที่รอยื่นไม่สำเร็จ: ${error.message}`, 500);
    }
  }
  if (!salesOrderId) return badRequest("กรุณาระบุ salesOrderId");

  let salesOrder;
  try {
    salesOrder = await loadSalesOrderContext(supabase, salesOrderId);
    if (!salesOrder) return notFound("ไม่พบ ใบสั่งขาย");
    if (!salesOrder.deal || !inSalesViewScope(user, salesOrder.deal)) return forbidden();
    /* ⛔ ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีงานยื่นภาษีในระบบ — ตอบ "ไม่เข้าเกณฑ์" ก่อนคำนวณสินค้า
       ไม่งั้นเส้นเดินงานของใบชวนกด "สร้างใบยื่น" ให้งานที่ออกบิลนอกระบบไปแล้ว */
    if (isHistoricalOrder(salesOrder)) {
      return ok({
        filing: null, schemaReady: true, eligible: false, historical: true, lines: [], warnings: [],
        source: { orderNumber: salesOrder.orderNumber || null, orderDate: salesOrder.orderDate || null, quotationId: null, quoteNumber: null },
      });
    }
    const existing = await findExistingFiling(supabase, salesOrderId);
    if (!existing.schemaReady) {
      return ok({ filing: null, eligible: false, schemaReady: false, warnings: [] });
    }
    /* ⚠️ ใบที่ยื่นแล้วก็ยัง resolve บริบท — เส้นเดินงานของ SO ต้องวาดจุด "ขึ้นทะเบียน"
       ให้ถูกต่อให้ใบยื่นเกิดแล้ว (ระบบยอมให้สร้างใบยื่นทั้งที่ทะเบียนยังไม่อนุมัติ)
       คืนลิสต์เปล่าเหมือนเดิมเท่ากับบอกว่า "ใบนี้ไม่มีสินค้าสรรพสามิต" ซึ่งตรงข้ามกับความจริง
       ⚠️ `eligible` ต้องเป็น false เสมอเมื่อมีใบยื่นแล้ว — คิวส่งต่อ (handoffQueue) กรองด้วยค่านี้ */
    const resolved = await resolveContext(supabase, salesOrder);
    /* ต้นทางที่จอต้องโชว์ก่อนกดสร้าง (มติผู้ใช้ 2026-09-07): เลข SO + **เลข QT ที่เกี่ยวข้อง**
       — `loadSalesOrderContext` โหลด quotation มาอยู่แล้วสำหรับตรึงลงใบ ใช้ต่อได้เลย */
    const source = {
      orderNumber: salesOrder.orderNumber || null,
      orderDate: salesOrder.orderDate || null,
      quotationId: salesOrder.quotationId || null,
      quoteNumber: salesOrder.quotation?.quoteNumber || null,
    };
    if (existing.filing) return ok({ ...resolved, source, filing: existing.filing, eligible: false, schemaReady: true });
    return ok({ filing: null, schemaReady: true, source, ...resolved });
  } catch (error) {
    return fail(`ตรวจการยื่นชำระไม่สำเร็จ: ${error.message}`, 500);
  }
});

/* ⭐ แผนรื้อสรรพสามิต PR5 (มติ 28/10 · D7 29/10 ยื่นทีละ SO): **ฝ่าย RA สร้างใบยื่นจากคิว "รอยื่นกรม"** ทางเดียว
   body = `{ exciseSalesOrderId }` (SO ค่าสรรพสามิตที่อนุมัติแล้ว · รายการ = ยอดที่ลูกค้าจ่ายจริง)
        หรือ `{ salesOrderId }` (SO ลูกค้าที่ตัดสินไม่เรียกเก็บ แบบเก็บนอกระบบ/รวมในราคา · รายการคิดจาก SO ลูกค้า)
   ใบยื่นผูก SO ลูกค้าเสมอ ("salesOrderId" · unique ⇒ SO ลูกค้าล็อกย้อน/Rev./ยกเลิกตามเดิม) + SO ค่าสรรพสามิต (0417)
   ⚠️ ทางสร้างเดิมของฝ่ายขาย (ปุ่มบนเส้นเดินงาน SO · ReceiveDialog) ถอดแล้ว — proxy เปิดการเขียน /api/orders ให้ ra:approve เท่านั้น */
const LINK_ERRORS = {
  orders_excise_link_invalid: 'ใบสั่งขายค่าสรรพสามิตไม่ได้ออกจากใบสั่งขายลูกค้าใบนี้ — สร้างใบยื่นไม่ได้',
};

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, "ra:approve")) return forbidden();
  const body = await req.json().catch(() => ({}));
  const exciseSalesOrderId = String(body.exciseSalesOrderId || "").trim();
  const requestedSalesOrderId = exciseSalesOrderId ? "" : String(body.salesOrderId || "").trim();
  if (!exciseSalesOrderId && !requestedSalesOrderId) return badRequest("กรุณาระบุใบสั่งขาย");

  let loaded;
  let context;
  try {
    loaded = await loadFilingSource(supabase, { exciseSalesOrderId, salesOrderId: requestedSalesOrderId });
    if (loaded.error) return fail(loaded.error.message, loaded.error.status);
    const existing = await findFilingFor(supabase, {
      salesOrderId: loaded.salesOrder.id, exciseSalesOrderId: loaded.exciseOrder?.id,
    });
    if (existing) return conflict(`ใบสั่งขาย ${loaded.salesOrder.orderNumber || loaded.salesOrder.id} มีใบยื่น ${existing.id} แล้ว`);
    if (!loaded.resolved.lines.length) return badRequest("ใบสั่งขายนี้ไม่มีรายการสินค้าสรรพสามิตให้ยื่น");
    // ข้อมูลที่ตรึงลงหัวใบ (ลูกค้า · ใบเสนอราคาลูกค้า · ดีล/โครงการ) — โหลดชุดเดิมของเส้นนี้
    context = await loadSalesOrderContext(supabase, loaded.salesOrder.id);
  } catch (error) {
    return fail(`เตรียมข้อมูลการยื่นชำระไม่สำเร็จ: ${error.message}`, 500);
  }
  const { exciseOrder, resolved } = loaded;
  const salesOrder = context;

  const orderId = genId("TAX");
  const now = new Date().toISOString();
  const filing = {
    id: orderId,
    salesOrderId: salesOrder.id,
    exciseSalesOrderId: exciseOrder?.id || null,
    /* ⭐ ใบเสนอราคาต้นทางของ SO ลูกค้า (mig 0349 · ความหมายเดิม) — ใบค่าสรรพสามิตหาได้จาก exciseSalesOrderId → quotationId
       ⚠️ อ่านจาก `sales_orders."quotationId"` ตรง ๆ — ค่า FK ต้องเป็นของจริงจากสาย QT→SO */
    quotationId: salesOrder.quotationId || null,
    customerId: salesOrder.customerId || null,
    customerName: salesOrder.customerName || null,
    // ตรึงข้อมูลลูกค้าลงใบ: snapshot บนใบเสนอราคามาก่อน แล้วจึงตกมาที่ทะเบียนลูกค้าสด (mig 0167)
    customerTaxId: salesOrder.quotation?.customerTaxId || salesOrder.customer?.taxId || null,
    customerAddress: salesOrder.quotation?.billingAddress || salesOrder.customer?.address || null,
    quotationRef: salesOrder.quotation?.quoteNumber || salesOrder.orderNumber,
    poReference: salesOrder.orderNumber,
    // ตรึงโครงการลงใบ (mig 0211) — เก็บ null เมื่อไม่มีต้นทาง ไม่ใช่ "-"
    projectCode: refOrNull(salesOrder.project?.code),
    dealTitle: refOrNull(salesOrder.deal?.title),
    dealType: refOrNull(dealTypeOf(salesOrder.deal)),
    deliveryDate: NA,
    remarks: exciseOrder
      ? `สร้างจากใบสั่งขายค่าสรรพสามิต ${exciseOrder.orderNumber} (ใบสั่งขายลูกค้า ${salesOrder.orderNumber})`
      : `ไม่เรียกเก็บในระบบ — ${notBilledLabel(salesOrder.exciseNotBilledKind)} · ใบสั่งขาย ${salesOrder.orderNumber}`,
    assignee: user.name || "RA",
    // ทีมเจ้าภาพ = ทีมของดีลลูกค้า (ฝ่ายขายทีมนั้นเห็นใบยื่นของลูกค้าตัวเอง) → ถอยมาที่ทีมที่ดูแลลูกค้า
    team: salesOrder.deal?.team || soCaretakerTeam(salesOrder.customer),
    ownerId: user.id || null,
    totalExciseTax: resolved.totalExciseTax,
    totalLocalTax: resolved.totalLocalTax,
    totalTax: resolved.totalTax,
    amountToCollect: resolved.amountToCollect,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  // แถวหน้าตาเดียวกับทางคิดใหม่จากใบสั่งขาย (lib/excise/soFilingItems) — ลิงก์ salesOrderLineId ติดไปเสมอ
  const itemRows = filingItemRows(orderId, resolved.lines);

  const { error: orderError } = await insertOrder(supabase, filing);
  if (orderError?.code === "23505") {
    const existing = await findFilingFor(supabase, { salesOrderId: salesOrder.id, exciseSalesOrderId: exciseOrder?.id }).catch(() => null);
    return conflict(existing ? `ใบสั่งขายนี้มีใบยื่น ${existing.id} แล้ว` : "ใบสั่งขายนี้มีใบยื่นแล้ว");
  }
  const linkError = Object.keys(LINK_ERRORS).find((code) => String(orderError?.message || "").includes(code));
  if (linkError) return badRequest(LINK_ERRORS[linkError]);
  if (orderError) return fail(`สร้างใบยื่นไม่สำเร็จ: ${orderError.message}`, 500);

  const { error: itemError } = await insertOrderItems(supabase, itemRows);
  if (itemError) {
    await supabase.from("orders").delete().eq("id", orderId);
    return fail(`สร้างรายการภาษีไม่สำเร็จ: ${itemError.message}`, 500);
  }

  await recordAudit({
    user,
    action: "create",
    entityType: "order",
    entityId: orderId,
    after: filing,
    summary: exciseOrder
      ? `RA สร้างใบยื่นกรมจาก ${exciseOrder.orderNumber} (SO ลูกค้า ${salesOrder.orderNumber})`
      : `RA สร้างใบยื่นกรมจาก ${salesOrder.orderNumber} (ไม่เรียกเก็บในระบบ)`,
    request: req,
  });
  return ok({ ...filing, items: itemRows, warnings: resolved.warnings }, 201);
});

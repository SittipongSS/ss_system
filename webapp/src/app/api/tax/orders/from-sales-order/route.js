import { genId } from "@/lib/id";
import { recordAudit } from "@/lib/audit";
import { withUser, badRequest, conflict, fail, forbidden, notFound, ok, unauthorized } from "@/lib/http";
import { can, caretakerTeamsOf } from "@/lib/permissions";
import { canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from "@/lib/salesPlanning";
import { insertOrder, insertOrderItems } from "@/lib/tax/orders";
import { billedTaxTotals } from "@/lib/tax/exciseBilling";
import { resolveSoFiling } from "@/lib/excise/soFiling";

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
    supabase.from("sales_deals").select("id, team, ownerId, ownerName").eq("id", salesOrder.dealId).maybeSingle(),
    supabase.from("quotations").select("id, quoteNumber, customerTaxId, billingAddress").eq("id", salesOrder.quotationId).maybeSingle(),
    salesOrder.customerId
      // team/teams ต้องอยู่ใน select ด้วย — ใช้ถอยหาทีมเจ้าภาพของใบยื่นเมื่อดีลแม่ไม่มีทีม
      // (ถ้าไม่ดึงมา caretakerTeamsOf จะได้ [] เงียบ ๆ แล้ว fallback กลายเป็นโค้ดตาย)
      ? supabase.from("customers").select("id, taxId, address, team, teams").eq("id", salesOrder.customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...salesOrder,
    deal: deal || null,
    quotation: quotation || null,
    customer: customer || null,
  };
}

async function listAvailableSalesOrders(supabase, user, customerId) {
  let query = supabase
    .from("sales_orders")
    // ⚠️ ต้องมี status ในลิสต์คอลัมน์: resolveSoFiling ตัดสิน eligible ด้วย
    // salesOrder.status === 'approved' — ไม่ดึงมา = undefined = ลิสต์ว่างเสมอ
    // (บั๊กจริงที่ทำให้ปุ่ม "สร้างใบยื่นจาก Sale Order" ไม่เคยมีตัวเลือกให้เลือก)
    .select("id, orderNumber, status, customerId, customerName, orderDate, totalAmount, actualAmount, dealId, quotationId, createdAt")
    .eq("status", "approved")
    .order("createdAt", { ascending: false })
    .limit(200);
  if (customerId) query = query.eq("customerId", customerId);

  const { data: salesOrders, error } = await query;
  if (error) throw error;
  const dealIds = [...new Set((salesOrders || []).map((row) => row.dealId).filter(Boolean))];
  const [{ data: deals, error: dealError }, filingResult] = await Promise.all([
    dealIds.length
      ? supabase.from("sales_deals").select("id, team, ownerId, ownerName").in("id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("orders").select("salesOrderId").not("salesOrderId", "is", null),
  ]);
  if (dealError) throw dealError;
  if (missingSalesOrderColumn(filingResult.error)) return { salesOrders: [], schemaReady: false };
  if (filingResult.error) throw filingResult.error;

  const dealById = new Map((deals || []).map((deal) => [deal.id, deal]));
  const used = new Set((filingResult.data || []).map((filing) => filing.salesOrderId).filter(Boolean));
  const available = (salesOrders || [])
    .filter((salesOrder) => {
      const deal = dealById.get(salesOrder.dealId);
      return deal && inSalesEditScope(user, deal) && !used.has(salesOrder.id);
    })
    .map((salesOrder) => ({ ...salesOrder, deal: dealById.get(salesOrder.dealId) }));
  if (!available.length) return { schemaReady: true, salesOrders: [] };

  const { data: lines, error: lineError } = await supabase
    .from("sales_order_lines")
    .select("id, salesOrderId, productId, fgCode, description, qty")
    .in("salesOrderId", available.map((salesOrder) => salesOrder.id));
  if (lineError) throw lineError;
  const productIds = [...new Set((lines || []).map((line) => line.productId).filter(Boolean))];
  const [{ data: products, error: productError }, { data: productTypes, error: typeError }, registrationResult] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("*").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("product_types").select("mainCategoryCode, typeCode, isExcise, requiresFdaNotice"),
    productIds.length
      ? supabase.from("excise_registrations").select("id, productId, customerId, status").eq("status", "approved").in("productId", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError) throw productError;
  if (typeError) throw typeError;
  if (registrationResult.error) throw registrationResult.error;
  const linesByOrder = new Map();
  (lines || []).forEach((line) => {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId).push(line);
  });

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
        });
        return {
          ...salesOrder,
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

async function resolveContext(supabase, salesOrder) {
  const productIds = [...new Set((salesOrder.lines || []).map((line) => line.productId).filter(Boolean))];
  const [{ data: products, error: productError }, { data: productTypes, error: typeError }, registrationResult] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("*").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("product_types").select("mainCategoryCode, typeCode, isExcise, requiresFdaNotice"),
    productIds.length && salesOrder.customerId
      ? supabase.from("excise_registrations").select("id, productId, customerId, status").eq("customerId", salesOrder.customerId).in("productId", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError) throw productError;
  if (typeError) throw typeError;
  if (registrationResult.error) throw registrationResult.error;
  return resolveSoFiling({
    salesOrder,
    lines: salesOrder.lines || [],
    products: products || [],
    productTypes: productTypes || [],
    registrations: registrationResult.data || [],
  });
}

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
    const existing = await findExistingFiling(supabase, salesOrderId);
    if (!existing.schemaReady) {
      return ok({ filing: null, eligible: false, schemaReady: false, warnings: [] });
    }
    if (existing.filing) return ok({ filing: existing.filing, eligible: false, schemaReady: true, warnings: [] });
    const resolved = await resolveContext(supabase, salesOrder);
    return ok({ filing: null, schemaReady: true, ...resolved });
  } catch (error) {
    return fail(`ตรวจการยื่นชำระไม่สำเร็จ: ${error.message}`, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, "sales:act")) return forbidden();
  const body = await req.json().catch(() => ({}));
  const salesOrderId = String(body.salesOrderId || "").trim();
  if (!salesOrderId) return badRequest("กรุณาระบุ ใบสั่งขาย");

  let salesOrder;
  let resolved;
  try {
    salesOrder = await loadSalesOrderContext(supabase, salesOrderId);
    if (!salesOrder) return notFound("ไม่พบ ใบสั่งขาย");
    if (!salesOrder.deal || !inSalesEditScope(user, salesOrder.deal)) return forbidden();
    if (salesOrder.status !== "approved") return badRequest("สร้างการยื่นชำระได้เมื่อใบสั่งขายอนุมัติแล้วเท่านั้น");

    const existing = await findExistingFiling(supabase, salesOrderId);
    if (!existing.schemaReady) return fail("ฐานข้อมูลยังไม่มี Migration 0160 กรุณารัน migration ก่อน", 503);
    if (existing.filing) return conflict(`ใบสั่งขายนี้มีใบยื่น ${existing.filing.id} แล้ว`);

    resolved = await resolveContext(supabase, salesOrder);
    if (!resolved.eligible) return badRequest("ใบสั่งขายนี้ไม่มีสินค้าสรรพสามิตที่พร้อมสร้างใบยื่น");
  } catch (error) {
    return fail(`เตรียมข้อมูลการยื่นชำระไม่สำเร็จ: ${error.message}`, 500);
  }

  const orderId = genId("TAX");
  const now = new Date().toISOString();
  const filing = {
    id: orderId,
    salesOrderId,
    customerId: salesOrder.customerId || null,
    customerName: salesOrder.customerName || null,
    // ตรึงข้อมูลลูกค้าลงใบ: snapshot บนใบเสนอราคามาก่อน (ค่าที่ลูกค้าเห็นบนเอกสารต้นทาง)
    // แล้วจึงตกมาที่ทะเบียนลูกค้าสดสำหรับใบเก่าที่ snapshot ไม่ครบ
    customerTaxId: salesOrder.quotation?.customerTaxId || salesOrder.customer?.taxId || null,
    customerAddress: salesOrder.quotation?.billingAddress || salesOrder.customer?.address || null,
    quotationRef: salesOrder.quotation?.quoteNumber || salesOrder.orderNumber,
    poReference: salesOrder.orderNumber,
    deliveryDate: "-",
    remarks: `สร้างจาก ใบสั่งขาย ${salesOrder.orderNumber}`,
    assignee: user.name || salesOrder.createdByName || "Sales",
    // ทีมเจ้าภาพของใบยื่น: ดีลแม่มาก่อน (แหล่งที่ตรงที่สุด) แล้วถอยมาที่ทีมที่ดูแลลูกค้า
    // เมื่อดีลไม่มีทีม/SO ไม่ผูกดีล — ใบที่ได้ team = null จะกลายเป็น "ของกลาง" ที่เห็นได้
    // ทุกทีมแต่ไม่มีใครใน scope 'team' แก้ได้เลย · ลูกค้าหลายทีม = เดาไม่ได้ ปล่อย null
    team: salesOrder.deal?.team || soCaretakerTeam(salesOrder.customer),
    ownerId: user.id || null,
    totalExciseTax: resolved.totalExciseTax,
    totalLocalTax: resolved.totalLocalTax,
    totalTax: resolved.totalTax,
    // ยอดที่เรียกเก็บจากลูกค้า = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26) คิดด้วยสูตร
    // เดียวกับที่เอกสารพิมพ์ ห้ามใช้ resolved.totalTax เปล่า ๆ (ต่างกัน 7%)
    amountToCollect: billedTaxTotals(resolved.lines).amountToCollect,
    status: "draft",
    createdAt: now,
  };
  const itemRows = resolved.lines.map((line) => ({
    id: genId("TXI"),
    orderId,
    salesOrderLineId: line.salesOrderLineId,
    registrationId: line.registrationId,
    productId: line.productId,
    quantity: line.quantity,
    exciseRatePerUnit: line.exciseRatePerUnit,
    localTaxRatePerUnit: line.localTaxRatePerUnit,
    totalExciseTax: line.totalExciseTax,
    totalLocalTax: line.totalLocalTax,
    totalTax: line.totalTax,
  }));

  const { error: orderError } = await insertOrder(supabase, filing);
  if (orderError?.code === "23505") {
    const existing = await findExistingFiling(supabase, salesOrderId).catch(() => ({ filing: null }));
    return conflict(existing.filing ? `ใบสั่งขายนี้มีใบยื่น ${existing.filing.id} แล้ว` : "ใบสั่งขายนี้มีใบยื่นแล้ว");
  }
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
    summary: `create excise filing from ${salesOrder.orderNumber}`,
    request: req,
  });
  return ok({ ...filing, items: itemRows, warnings: resolved.warnings }, 201);
});

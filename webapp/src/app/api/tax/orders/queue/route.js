// GET /api/tax/orders/queue — คิว "รอยื่นกรม" ของฝ่าย RA (แผนรื้อสรรพสามิต PR5)
//   (ไม่มีพารามิเตอร์)            → [แถวงาน] ที่ยังไม่มีใบยื่น เก่าสุดก่อน (ลิสต์ตรง ๆ — useApiList อ่านได้)
//   ?exciseSalesOrderId=… | ?salesOrderId=… → พรีวิวใบยื่นหนึ่งใบ (รายการ · คำเตือน · ด่านเริ่มยื่น) ก่อน RA กดสร้าง
// ⚠️ ไม่ผ่าน canViewSalesPlanning — RA ไม่มีสิทธิ์หน้าขาย · อ่านด้วยบัญชีระบบแล้วส่งเฉพาะช่องที่ใบยื่นใช้
import { withUser, fail, forbidden, ok, unauthorized } from "@/lib/http";
import { can } from "@/lib/permissions";
import { findFilingFor, loadFilingSource, loadRaFilingQueue } from "@/lib/excise/raFiling";
import { filingStartGates } from "@/lib/excise/raFilingRules";

export const dynamic = "force-dynamic";

const pickOrder = (row) => (row ? {
  id: row.id, orderNumber: row.orderNumber, status: row.status, customerId: row.customerId,
  customerName: row.customerName, orderDate: row.orderDate, approvedAt: row.approvedAt,
} : null);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, "ra:view") && !can(user.role, "ra:approve")) return forbidden();
  const url = new URL(req.url);
  const exciseSalesOrderId = url.searchParams.get("exciseSalesOrderId")?.trim() || "";
  const salesOrderId = url.searchParams.get("salesOrderId")?.trim() || "";
  try {
    if (!exciseSalesOrderId && !salesOrderId) return ok(await loadRaFilingQueue(supabase));
    const loaded = await loadFilingSource(supabase, { exciseSalesOrderId, salesOrderId: exciseSalesOrderId ? "" : salesOrderId });
    if (loaded.error) return fail(loaded.error.message, loaded.error.status);
    const { source, salesOrder, exciseOrder, resolved } = loaded;
    const existing = await findFilingFor(supabase, { salesOrderId: salesOrder.id, exciseSalesOrderId: exciseOrder?.id });
    return ok({
      source,
      salesOrder: pickOrder(salesOrder),
      exciseOrder: exciseOrder ? {
        ...pickOrder(exciseOrder),
        totalAmount: Number(exciseOrder.totalAmount) || 0,
        vatAmount: Number(exciseOrder.vatAmount) || 0,
        financeStatus: exciseOrder.financeStatus || null,
      } : null,
      lines: resolved.lines,
      warnings: resolved.warnings,
      totalExciseTax: resolved.totalExciseTax,
      totalLocalTax: resolved.totalLocalTax,
      totalTax: resolved.totalTax,
      amountToCollect: resolved.amountToCollect,
      gates: filingStartGates({
        order: { salesOrderId: salesOrder.id, exciseSalesOrderId: exciseOrder?.id || null, items: resolved.lines },
        exciseOrder,
        notBilledKind: salesOrder.exciseNotBilledKind || null,
      }),
      existing: existing || null,
    });
  } catch (error) {
    return fail(`โหลดคิวรอยื่นกรมไม่สำเร็จ: ${error.message}`, 500);
  }
});

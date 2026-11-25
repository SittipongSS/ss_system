import { withUser, fail, forbidden, ok, unauthorized } from "@/lib/http";
import { canUser } from "@/lib/permissions";
import { loadRaFilingTable } from "@/lib/excise/raFilingTable";

export const dynamic = "force-dynamic";

/* ตาราง "รายการชำระภาษีสรรพสามิต" (มติเจ้าของ 03/11 V20–V23) — รายการสินค้า + วันที่ส่งของของทุกงาน RA
   (คีย์เดียวกับแถวงานของหน้า /tax/filings) · สิทธิ์เดียวกับใบสรุปรายการยื่น (ra:view / ra:approve) */
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  /* canUser ไม่ใช่ can(role) — สิทธิ์เสริมรายคน ra:view ต้องเปิดได้เท่าที่จอ /tax/filings เปิดให้ (useCan) */
  if (!canUser(user, "ra:view") && !canUser(user, "ra:approve")) return forbidden();
  try {
    return ok(await loadRaFilingTable(supabase));
  } catch (error) {
    return fail(`เตรียมตารางรายการชำระไม่สำเร็จ: ${error.message}`, 500);
  }
});

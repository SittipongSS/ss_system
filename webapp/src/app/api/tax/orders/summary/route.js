// GET /api/tax/orders/summary?keys=excise:<id>,not_billed:<id>,order:<id> — ข้อมูลใบสรุปรายการยื่น (v3 · มติ 02/11 ข้อ V9)
//   คืนรายงานรูปกลาง `{ title, columns, rows, summary }` ⇒ จอส่งเข้า openReportPrintWindow (เปลือกรายงานของ /tax)
//   · order:<id>       = บันทึกการยื่น (เริ่มยื่นแล้ว) — รายการที่ตรึงไว้
//   · excise:/not_billed: = งานรอ RA — รายการสดจาก SO ตัวโหลดเดียวกับตอนเริ่มยื่น (loadFilingSource)
// ⚠️ ไม่ผ่าน canViewSalesPlanning — RA ไม่มีสิทธิ์หน้าขาย · อ่านด้วยบัญชีระบบแล้วส่งเฉพาะช่องที่ใบสรุปใช้
import { withUser, badRequest, fail, forbidden, ok, unauthorized } from "@/lib/http";
import { can } from "@/lib/permissions";
import { loadFilingSummaryItem } from "@/lib/excise/raFiling";
import { FILING_SUMMARY_MAX_KEYS, filingSummaryReport, parseFilingSummaryKey } from "@/lib/excise/filingSummary";

export const dynamic = "force-dynamic";

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, "ra:view") && !can(user.role, "ra:approve")) return forbidden();
  const keys = [...new Set((new URL(req.url).searchParams.get("keys") || "").split(",").map((key) => key.trim()).filter(Boolean))];
  if (!keys.length) return badRequest("เลือกงานอย่างน้อยหนึ่งงานก่อนพิมพ์ใบสรุป");
  if (keys.length > FILING_SUMMARY_MAX_KEYS) return badRequest(`พิมพ์ใบสรุปได้ครั้งละไม่เกิน ${FILING_SUMMARY_MAX_KEYS} งาน`);
  const parsed = keys.map(parseFilingSummaryKey);
  if (parsed.some((key) => !key)) return badRequest("คีย์งานไม่ถูกต้อง");
  try {
    // ทีละงานตามลำดับที่ติ๊ก — งานหนึ่งอ่านหลายตาราง ยิงพร้อมกันเป็นร้อยจะชนเพดานคอนเนกชัน
    const items = [];
    const missing = [];
    for (const key of parsed) {
      const item = await loadFilingSummaryItem(supabase, key);
      if (item.missing) missing.push(item.missing);
      else items.push(item);
    }
    if (!items.length) return badRequest(missing.join(" · ") || "ไม่พบงานที่เลือก");
    return ok({ ...filingSummaryReport(items), missing });
  } catch (error) {
    return fail(`เตรียมใบสรุปรายการยื่นไม่สำเร็จ: ${error.message}`, 500);
  }
});

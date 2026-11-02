// ── พิมพ์ใบสรุปรายการยื่น (ฝั่งจอ) — ดึงรายงานจาก GET /api/tax/orders/summary แล้วเปิดหน้าต่างพิมพ์ของเปลือกรายงาน ──
// ใช้ร่วม: ปุ่มบนรายการ (ติ๊กหลายงาน) · โมดัลงานรอ RA · หน้าบันทึกการยื่น — คีย์งานดูที่ lib/excise/filingSummary.js
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import { FILING_SUMMARY_MAX_KEYS } from "@/lib/excise/filingSummary";

/** @param keys คีย์งาน (`excise:` · `not_billed:` · `order:`) ตามลำดับที่จะพิมพ์ · คืน true เมื่อเปิดหน้าต่างพิมพ์แล้ว */
export async function printFilingSummary(keys = []) {
  const list = [...new Set((keys || []).filter(Boolean))];
  if (!list.length) {
    notifyToast.error("เลือกงานอย่างน้อยหนึ่งงานก่อนพิมพ์ใบสรุป");
    return false;
  }
  if (list.length > FILING_SUMMARY_MAX_KEYS) {
    notifyToast.error(`พิมพ์ใบสรุปได้ครั้งละไม่เกิน ${FILING_SUMMARY_MAX_KEYS} งาน — เลือกให้น้อยลง`);
    return false;
  }
  try {
    const report = await apiJson(`/api/tax/orders/summary?keys=${encodeURIComponent(list.join(","))}`, {
      fallbackError: "เตรียมใบสรุปรายการยื่นไม่สำเร็จ",
    });
    // งานที่หายระหว่างเลือก (ยกเลิกการเริ่มยื่น/SO ถูกยกเลิก) ไม่ทำให้ทั้งใบพัง — บอกให้รู้ว่าขาดตัวไหน
    if (report?.missing?.length) notifyToast.info(`ไม่อยู่ในใบสรุป: ${report.missing.join(" · ")}`);
    await openReportPrintWindow(report);
    return true;
  } catch (error) {
    notifyToast.error(error?.message || "เตรียมใบสรุปรายการยื่นไม่สำเร็จ");
    return false;
  }
}

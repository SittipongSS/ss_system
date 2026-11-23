import { actualNoneTitle } from "@/lib/sales/dealActualNone";

/* ป้าย "ไม่นับ Actual" ใต้ยอดของดีล Won (mig 0439 · มติเจ้าของ 20/11/2026 ข้อ 3 · ตรวจ 23/11)
   — รายการดีล · ลิ้นชักดีลของแดชบอร์ด · การ์ดดีลหน้าลีด วางชิ้นนี้ใต้ตัวเลข Actual ให้รู้ว่าทำไม ฿0.00
   ⭐ คำสั้น ("ไม่นับ Actual" / "… n ใบ") — ช่องเงินห้ามขึ้นบรรทัดใหม่ · เหตุผลเต็มอยู่ใน title
   ⭐ ไม่มีใบไม่นับ = ไม่เรนเดอร์ · ⛔ ป้ายอย่างเดียว ไม่ใช่ยอด
   props: summary = `deal.actualNone` จาก API (lib/sales/dealActualNone · summarizeActualNone) */
export default function ActualNoneNote({ summary, className = "" }) {
  if (!summary?.count) return null;
  return (
    <span className={["cell-sub", className].filter(Boolean).join(" ")} title={actualNoneTitle(summary)}>
      {summary.short}
    </span>
  );
}

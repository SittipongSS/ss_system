// ── แถวคิวงานของ RA (ยังไม่มีบันทึกการยื่น) → แถวของ WorkQueue / รายการหน้าการยื่นชำระ ─────────────────────
// แถวรอ RA (`ready`) = กดแล้วเปิดงาน (ข้อมูลจาก SO · พิมพ์ใบสรุป · เริ่มยื่น) · แถวกำลังมา (มติเจ้าของ 29/10) = บอกขั้นที่ถึง
// เปิดดูได้แต่เริ่มยื่นไม่ได้ (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") · v3 02/11: ไม่มีขั้น "สร้างใบยื่น" แล้ว
// ⚠️ ไฟล์บริสุทธิ์ (หน้า /tax และหน้าการยื่นชำระใช้ตัวเดียวกัน)
import { naText } from "@/lib/format";

export const UPCOMING_START_BLOCKER = "ยังเริ่มยื่นไม่ได้ — งานถึง RA เมื่อใบสั่งขายค่าสรรพสามิตอนุมัติแล้ว";

/** หน้าการยื่นชำระพร้อมเปิดงานนี้ (`?start=<คีย์งาน>`) — ทางเดียวของคิวบนภาพรวมและแถวในรายการ */
export const raWorkHref = (row) => `/tax/filings?start=${encodeURIComponent(row?.key || "")}`;

/** หัวเรื่อง/บรรทัดรองของแถวคิว — ตัวเดียวทั้งสองจอ */
export function raQueueText(row) {
  const title = `${row?.salesOrder?.orderNumber || ""} · ${naText(row?.salesOrder?.customerName)}`;
  if (row?.ready === false) {
    const doc = row.exciseOrder?.orderNumber || row.exciseQuote?.quoteNumber || "";
    return { title, subtitle: `${doc} · ${row.stageLabel || "กำลังมา"}`.replace(/^ · /, "") };
  }
  return {
    title,
    subtitle: row?.exciseOrder
      ? `ใบสั่งขายค่าสรรพสามิต ${row.exciseOrder.orderNumber} อนุมัติแล้ว — รอ RA ยื่นกรม`
      : `ไม่เรียกเก็บในระบบ (${row?.notBilled?.label || ""}) — รอ RA ยื่นกรม`,
  };
}

/** แถวของ WorkQueue จากแถวคิว · `onOpen` = เปิดงาน (ทั้งรอ RA และกำลังมา — กำลังมาเปิดดูได้ เริ่มยื่นไม่ได้) */
export function raQueueItem(row, { age = null, sortDays = null, onOpen } = {}) {
  const { title, subtitle } = raQueueText(row);
  const upcoming = row?.ready === false;
  return {
    id: `rq-${row?.key}`,
    status: upcoming ? "upcoming" : "queued",
    title,
    subtitle,
    cta: upcoming ? "ดูงาน" : "เปิดงาน",
    age,
    sortDays,
    onClick: onOpen,
  };
}

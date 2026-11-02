// ── แถวคิว "รอยื่นกรม" ของ RA → แถวของ WorkQueue (หน้า /tax และแผงบนหน้าการยื่นชำระใช้ตัวเดียวกัน) ──────────
// แถวพร้อม (`ready`) = กดแล้วเปิดโมดัลสร้างใบยื่น · แถวกำลังมา (มติเจ้าของ 29/10) = บอกขั้นที่ถึง กดแล้วบอกเหตุว่ายังสร้างไม่ได้
// (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") · ⚠️ ไฟล์บริสุทธิ์ + toast ฝั่งจอ
import { notifyToast } from "@/lib/feedback";
import { naText } from "@/lib/format";

export const UPCOMING_CREATE_BLOCKER = "ยังสร้างใบยื่นไม่ได้ — ใบยื่นผูกใบสั่งขายค่าสรรพสามิต จึงสร้างได้เมื่อใบนั้นอนุมัติแล้ว";

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
      ? `ใบสั่งขายค่าสรรพสามิต ${row.exciseOrder.orderNumber} อนุมัติแล้ว — รอสร้างใบยื่นกรม`
      : `ไม่เรียกเก็บในระบบ (${row?.notBilled?.label || ""}) — รอสร้างใบยื่นกรม`,
  };
}

/** แถวของ WorkQueue จากแถวคิว · `onCreate` = เปิดโมดัลสร้าง (เฉพาะแถวพร้อม) */
export function raQueueItem(row, { age = null, sortDays = null, onCreate } = {}) {
  const { title, subtitle } = raQueueText(row);
  const upcoming = row?.ready === false;
  return {
    id: `rq-${row?.key}`,
    status: upcoming ? "upcoming" : "queued",
    title,
    subtitle,
    cta: upcoming ? "ยังสร้างไม่ได้" : "สร้างใบยื่น",
    age,
    sortDays,
    onClick: upcoming
      ? () => notifyToast.info(`${UPCOMING_CREATE_BLOCKER} (ตอนนี้: ${row.stageLabel || "กำลังมา"})`)
      : onCreate,
  };
}

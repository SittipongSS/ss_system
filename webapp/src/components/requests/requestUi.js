// UI ชิ้นเล็กที่ใช้ร่วมกันของคำร้องข้ามฝ่าย (หน้าดีล / หน้าโครงการ / งานของฉัน /
// ภาพรวมฝ่าย RD) — ยกมาแทน components/salesPlanning/inquiryUi.js ที่ปลดระวางพร้อม
// ระบบสอบถามใน mig 0174
import StatusBadge from "@/components/ui/StatusBadge";
import { requestStatusView } from "@/lib/requests/statuses";

/* ⚠️ **ส่ง `request` ทั้งใบ ไม่ใช่ `status` เปล่า ๆ** (มติผู้ใช้ 2026-08-19) — ป้าย
   "รอกำหนดส่ง" เป็นสถานะที่ derive จาก `status` + `committedDueDate` คู่กัน ⇒ ที่ไหน
   ส่งมาแค่ค่า status ป้ายจะพูดว่า "กำลังดำเนินการ" ทั้งที่ฝ่ายยังไม่รับปากวันสักวัน
   (`status` รับไว้เป็นทางถอยของผู้เรียกที่มีแค่ค่าเดียวจริง ๆ) */
export function RequestStatusBadge({ request = null, status = null }) {
  const view = requestStatusView(request || { status });
  return <StatusBadge tone={view.tone} label={view.label} />;
}

// ป้ายกำหนดตอบ: แดง = เลยกำหนด · เหลือง = วันนี้/พรุ่งนี้ — เฉพาะเรื่องที่ยังเดินอยู่
// วัดจากวันที่ฝ่ายผู้ตอบรับปากไว้ตอนกด "แจ้งกำหนดส่ง" (committedDueDate) ไม่ใช่วันที่
// ผู้ขอต้องการรับงาน ซึ่งเป็นความคาดหวังฝ่ายเดียว · ยังไม่แจ้งวัน = ไม่มีกำหนด = ไม่มีป้าย
//
// ⚠️ คนละตัวกับ requestDueTone() ใน lib/deptRequests.js โดยตั้งใจ: ตัวนั้นทำป้าย
// ของ "คิว" (บอกว่ายังไม่มีใครรับด้วย) ส่วนตัวนี้ทำป้ายเตือนบนการ์ดที่แสดงคู่กับ
// วันที่อยู่แล้ว จึงเงียบเมื่อยังไม่ถึงกำหนด
export function requestDueTone(request, todayISO) {
  const due = request?.committedDueDate;
  const open = request?.status === "pending" || request?.status === "acknowledged";
  if (!due || !open || !todayISO) return null;
  if (due < todayISO) return { color: "var(--red)", label: "เลยกำหนด" };
  const t = new Date(`${todayISO}T00:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (due <= tomorrow) return { color: "var(--amber)", label: "ใกล้ครบกำหนด" };
  return null;
}

// UI ชิ้นเล็กที่ใช้ร่วมกันของคำร้องข้ามฝ่าย (หน้าดีล / หน้าโครงการ / งานของฉัน /
// ภาพรวมฝ่าย RD) — ยกมาแทน components/salesPlanning/inquiryUi.js ที่ปลดระวางพร้อม
// ระบบสอบถามใน mig 0174
import StatusBadge from "@/components/ui/StatusBadge";
import { requestStatusView } from "@/lib/requests/statuses";
import { requestDueOwed } from "@/lib/requests/queueBoard";

/* ⚠️ **ส่ง `request` ทั้งใบ ไม่ใช่ `status` เปล่า ๆ** (มติผู้ใช้ 2026-08-19) — ป้าย
   "รอกำหนดส่ง" เป็นสถานะที่ derive จาก `status` + `committedDueDate` คู่กัน ⇒ ที่ไหน
   ส่งมาแค่ค่า status ป้ายจะพูดว่า "กำลังดำเนินการ" ทั้งที่ฝ่ายยังไม่รับปากวันสักวัน
   (`status` รับไว้เป็นทางถอยของผู้เรียกที่มีแค่ค่าเดียวจริง ๆ) */
export function RequestStatusBadge({ request = null, status = null }) {
  const view = requestStatusView(request || { status });
  return <StatusBadge tone={view.tone} label={view.label} />;
}

// ป้ายกำหนดตอบ: แดง = เลยกำหนด · เหลือง = ครบกำหนดวันนี้ — เฉพาะวันที่ฝ่ายยังติดค้างอยู่
// วัดจากวันที่ฝ่ายผู้ตอบรับปากไว้ตอนกด "แจ้งกำหนดส่ง" (committedDueDate) ไม่ใช่วันที่
// ผู้ขอต้องการรับงาน ซึ่งเป็นความคาดหวังฝ่ายเดียว · ยังไม่แจ้งวัน = ไม่มีกำหนด = ไม่มีป้าย
//
// ⭐ **ตัวตัดสินเดียวกับคิว** (`requestDueOwed` · ตรวจทั้งระบบ 23/11/2026) — ตาผู้ขอ / มีฝั่งปิด / ใบจบ = ไม่มีป้าย
// 🐞 เดิมเหลือง "ใกล้ครบกำหนด" ครอบวันนี้ **และพรุ่งนี้** ขณะที่คิวเหลือง "ครบกำหนดวันนี้" วันเดียว ⇒ หน้าลูกค้า
//    (ซึ่งเขียนว่าใช้ตัวตัดสินเดียวกับคิว) กับ /pm/tasks ขึ้นป้ายที่คิวไม่มี · คำ/หน้าต่างตามคิว (คำชุด "เลยกำหนด" มติ 23/11)
// ⚠️ ส่งใบที่มี `items` (แถวทั้งใบ) — ตาใครตัดสินจากแถว
export function requestDueTone(request, todayISO) {
  const due = requestDueOwed(request);
  if (!due || !todayISO) return null;
  if (due < todayISO) return { color: "var(--red)", label: "เลยกำหนด" };
  if (due === todayISO) return { color: "var(--amber)", label: "ครบกำหนดวันนี้" };
  return null;
}

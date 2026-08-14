// UI ชิ้นเล็กที่ใช้ร่วมกันของคำร้องข้ามฝ่าย (หน้าดีล / หน้าโครงการ / งานของฉัน /
// ภาพรวมฝ่าย RD) — ยกมาแทน components/salesPlanning/inquiryUi.js ที่ปลดระวางพร้อม
// ระบบสอบถามใน mig 0174
import StatusBadge from "@/components/ui/StatusBadge";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from "@/lib/deptRequests";
import { naText } from "@/lib/format";

export function RequestStatusBadge({ status }) {
  return (
    <StatusBadge
      tone={REQUEST_STATUS_TONES[status] || "neutral"}
      label={REQUEST_STATUS_LABELS[status] || naText(status)}
    />
  );
}

// ป้ายกำหนดตอบ: แดง = เลยกำหนด · เหลือง = วันนี้/พรุ่งนี้ — เฉพาะเรื่องที่ยังเดินอยู่
// วัดจากวันที่ฝ่ายผู้ตอบรับปากไว้ตอนรับเรื่อง (committedDueDate) ไม่ใช่วันที่ผู้ขอ
// อยากได้ ซึ่งเป็นความคาดหวังฝ่ายเดียว · ยังไม่มีใครรับ = ยังไม่มีกำหนด = ไม่มีป้าย
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

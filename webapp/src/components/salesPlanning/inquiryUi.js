// UI ชิ้นเล็กที่ใช้ร่วมกันของระบบสอบถาม–ตอบกลับ (หน้า list / เธรด / ฟีดดีล / งานของฉัน)
import { INQUIRY_STATUS_LABELS } from "@/lib/inquiries";

export const INQUIRY_STATUS_COLORS = {
  open: "var(--amber)",
  answered: "var(--blue)",
  closed: "var(--green)",
};

export function InquiryStatusBadge({ status }) {
  const color = INQUIRY_STATUS_COLORS[status] || "var(--text-3)";
  return (
    <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      {INQUIRY_STATUS_LABELS[status] || status || "-"}
    </span>
  );
}

// ป้ายกำหนดตอบ (SLA): แดง = เลยกำหนด, เหลือง = วันนี้/พรุ่งนี้ — เฉพาะเรื่องที่ยังรอตอบ
export function inquiryDueTone(inquiry, todayISO) {
  if (!inquiry?.dueDate || inquiry.status !== "open" || !todayISO) return null;
  if (inquiry.dueDate < todayISO) return { color: "var(--red)", label: "เลยกำหนด" };
  const t = new Date(`${todayISO}T00:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (inquiry.dueDate <= tomorrow) return { color: "var(--amber)", label: "ใกล้ครบกำหนด" };
  return null;
}

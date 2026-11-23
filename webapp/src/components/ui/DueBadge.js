// ── ป้ายวันกำหนด — คำและสีจากตัวกลาง `lib/dueState` (งวด 2 · docs/due-overdue-system.md) ───────────────
//
// ⭐ จอไม่ประกอบคำ "เลยกำหนด/ครบกำหนดวันนี้/อีก N วัน" เอง — ส่งวัน + วันนี้มา ป้ายเลือกคำและสีให้
// ⚠️ `later` (ไกลกว่าช่วงเตือน) กับ `none` ไม่วาดอะไร — ป้ายมีไว้เตือน ไม่ใช่บอกวันซ้ำกับคอลัมน์วันที่
// ⚠️ ผู้เรียกตัดสินก่อนว่าวันนี้ "ยังเป็นคำสัญญา" ไหม (ใบจบ/ตาคนอื่น = ไม่ส่ง due) — ป้ายไม่รู้เรื่องสถานะของเอกสาร
import StatusBadge from "@/components/ui/StatusBadge";
import { DUE_SOON_DAYS, dueInfo } from "@/lib/dueState";

export default function DueBadge({ due, today, soonDays = DUE_SOON_DAYS, size = "sm", showLater = false, className = "" }) {
  const info = dueInfo(due, today, { soonDays });
  if (info.key === "none" || (info.key === "later" && !showLater)) return null;
  return <StatusBadge size={size} tone={info.tone} label={info.text} className={className} />;
}

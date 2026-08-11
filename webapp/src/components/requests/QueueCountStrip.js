"use client";
// ── แถบตัวเลข 4 ตัวของคิวคำร้อง — หน้าตาเดียวทั้งระบบ ────────────────────
//
// 🐞 **ของจริงที่ผู้ใช้เจอเอง (2026-08-08)**: ตัวเลขชุดเดียวกัน (`QUEUE_COUNT_META`)
// ถูกวาดคนละภาษาบนสองหน้าที่ห่างกันคลิกเดียว —
//   `/rd`          `MetricStrip` กล่องใหญ่ + โน้ต "กดเพื่อเปิดคิวที่กรองไว้แล้ว" ซ้ำ 4 บรรทัด
//   `/rd/requests` ป้ายเล็กเรียงแถวเดียว (คลาส chip ของกลาง)
// และโทนก็หลุดกันด้วย: "กำลังดำเนินการ" เป็นชิปฟ้าในคิว แต่ไม่มีสีบนภาพรวม เพราะ
// ตารางแปลงโทนของหน้านั้นทิ้ง `info`/`neutral` ไปเงียบ ๆ
// ⇒ ยกมาไว้ที่เดียว · **หน้าตาเดียวกันเสมอ ต่างกันได้แค่ว่ากดแล้วเกิดอะไร**
// (มติผู้ใช้: ใช้ MetricStrip ทั้งสองหน้า)
//
// ⭐ **ไอคอน + โน้ตตามต้นแบบหน้างานของฉัน** (มติผู้ใช้ 2026-08-08) — `Metric` ของ
// กลางรองรับทั้งคู่อยู่แล้ว · โน้ตบอกว่า *กดแล้วเกิดอะไร* ซึ่งต่างกันตามหน้า จึงรับ
// มาจากผู้เรียก ไม่ตั้งเอง · ตอนกดค้างอยู่เปลี่ยนเป็น "กำลังใช้ตัวกรองนี้"
import { AlarmClock, Clock, Hourglass, Inbox, Undo2 } from "lucide-react";
import { Metric, MetricStrip } from "@/components/ui/Workspace";
import { queueCountMeta } from "@/lib/requests/queueBoard";

// ⚠️ ไอคอนเป็นเรื่องของ **จอ** ไม่ใช่ของทะเบียน — ทะเบียนกลาง (`QUEUE_COUNT_META`)
// ถูกอ่านจากฝั่ง server ด้วย ยัด component ลงไปที่นั่นแล้วมันจะพังตอน import
const ICONS = {
  unacked: Inbox,
  overdue: AlarmClock,
  working: Clock,
  waitingRequester: Hourglass,
  // ตีกลับ — งานที่เด้งกลับมาที่ผู้ขอ (2026-08-11)
  bounced: Undo2,
};

export default function QueueCountStrip({
  counts = {},
  // โหมดตัวกรอง: ส่ง `activeKey` มาด้วย ⇒ ปุ่มขึ้นสถานะกดค้าง (aria-pressed)
  // โหมดพาไปหน้าอื่น: ไม่ต้องส่ง — ปุ่มเป็นทางลัดเฉย ๆ
  activeKey = null,
  filter = false,
  onSelect,
  note = null,
  ariaLabel = "ตัวเลขสรุปคิวคำร้อง",
  // มุมมองของหน้า — 'dept' ตัดตัวเลขที่เป็นงานของผู้ขอออก (ฝ่ายได้ 0 เสมอ)
  scope = "requester",
}) {
  const metas = queueCountMeta({ scope });
  return (
    // จำนวนช่องต่างกันตามมุมมอง — บอก CSS ตรง ๆ ไม่งั้นช่องที่ 5 ตกบรรทัดใหม่ตัวเดียว
    <MetricStrip aria-label={ariaLabel} data-count={metas.length}>
      {metas.map((meta) => {
        const on = filter && activeKey === meta.key;
        const Icon = ICONS[meta.key];
        return (
          <Metric
            key={meta.key}
            as="button" type="button"
            icon={Icon ? <Icon /> : null}
            label={meta.label}
            value={counts[meta.key] ?? 0}
            note={on ? "กำลังใช้ตัวกรองนี้" : note}
            // ⚠️ ส่งโทนของทะเบียนตรง ๆ — `neutral` ไม่มีคลาสของตัวเองโดยตั้งใจ
            // (ตัวเลขสีปกติ) ส่วน `info` มีแล้วใน globals ⇒ ไม่ต้องแปลงทิ้งอีก
            tone={meta.tone === "neutral" ? undefined : meta.tone}
            active={on}
            aria-pressed={filter ? on : undefined}
            onClick={() => onSelect?.(meta.key, on)}
          />
        );
      })}
    </MetricStrip>
  );
}

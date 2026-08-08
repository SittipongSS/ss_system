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
// ⚠️ **ไม่มีโน้ตใต้ตัวเลข** — ของเดิมเขียนประโยคเดียวกันสี่รอบ ซึ่งไม่ได้บอกอะไรที่
// ตัวเลขไม่ได้บอก · ปุ่มบอกว่ากดได้ด้วย hover + cursor อยู่แล้ว
import { Metric, MetricStrip } from "@/components/ui/Workspace";
import { QUEUE_COUNT_META } from "@/lib/requests/queueBoard";

export default function QueueCountStrip({
  counts = {},
  // โหมดตัวกรอง: ส่ง `activeKey` มาด้วย ⇒ ปุ่มขึ้นสถานะกดค้าง (aria-pressed)
  // โหมดพาไปหน้าอื่น: ไม่ต้องส่ง — ปุ่มเป็นทางลัดเฉย ๆ
  activeKey = null,
  filter = false,
  onSelect,
  ariaLabel = "ตัวเลขสรุปคิวคำร้อง",
}) {
  return (
    <MetricStrip aria-label={ariaLabel}>
      {QUEUE_COUNT_META.map((meta) => {
        const on = filter && activeKey === meta.key;
        return (
          <Metric
            key={meta.key}
            as="button" type="button"
            label={meta.label}
            value={counts[meta.key] ?? 0}
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

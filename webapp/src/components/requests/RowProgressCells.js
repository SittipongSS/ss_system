"use client";
// ── เซลล์ "ขั้น" + "ค้างมา" ของตารางสรุปทั้งใบ — ของกลางสามหัวข้อ ──────────
//
// ⭐ **สามตารางต้องเล่าเรื่องเดียวกัน** (มติผู้ใช้ 2026-08-25) — `BriefBoard` ·
// `FormulaDevBoard` · `DocumentBoard` เป็นไฟล์คนละตัวที่แสดงของอย่างเดียวกัน ⇒
// ปล่อยให้แต่ละไฟล์วาดเซลล์เองเมื่อไร มันจะเพี้ยนหากันแบบเดียวกับฟอร์มสร้าง/แก้
// ที่ AGENTS.md เตือนไว้ (คนละคำ คนละเกณฑ์สี คนละ tooltip)
//
// ⚠️ **วาดอย่างเดียว ตรรกะอยู่ที่ `lib/requests/rowTrack.js`** — ตัวสร้างแถวแนบ
// `track`/`idle` มาให้แล้ว ที่นี่แค่เลือกคำกับสี
import StepTrack from "@/components/ui/StepTrack";
import ReadableText from "@/components/ui/ReadableText";
import { idleFromStamps, idleLabel } from "@/lib/requests/rowTrack";
import { naText } from "@/lib/format";
import styles from "./briefBoard.module.css";

/* ⚠️ `compact` เสมอ — รางพร้อมป้ายคำกิน 320px ซึ่งกว้างกว่าคอลัมน์เนื้อทุกตัวของ
   ตารางนี้ · ชื่อขั้นไปอยู่ใน tooltip (กติกาเดียวกับตารางคิวคำร้อง) */
export function RowStageCell({ row }) {
  return (
    <td className={styles.trackCell}>
      <StepTrack steps={row.track || []} compact ariaLabel={`ความคืบหน้าของ ${row.name || "รายการ"}`} />
    </td>
  );
}

/* ⭐ **"ค้างมา" เป็นคอลัมน์ที่ไม่เคยมีที่ยืน** ทั้งที่เป็นตัวเดียวที่เรียงความเร่งด่วน
   ได้จริง — วัด 2026-08-25: แถวค้างเกิน 7 วันมี 4 แถว ยาวสุด 15 วัน โดยไม่มีจอไหนบอก
   ⚠️ `today` มาจากหน้า (จับใน effect) — ยังไม่รู้ = ขีด ไม่ใช่เดาเป็นวันนี้ */
export function RowIdleCell({ row, today = null }) {
  const idle = idleFromStamps(row.idle, today);
  const label = idleLabel(row.idle, today);
  return (
    <td className={`num ${styles.idleCell} ${idle?.late ? styles.idleLate : ""}`.trim()}>
      {naText(label)}
    </td>
  );
}

/* ── คอมเมนต์จากลูกค้า (มติผู้ใช้ 2026-08-25) ─────────────────────────────
   ⭐ **แถวของตัวเอง ไม่ใช่คอลัมน์** — `outcomeNote` เป็นข้อความยาวจริง (บังคับกรอก
   เมื่อ "ขอให้แก้"/"ไม่เอา") ⇒ ยัดลงคอลัมน์แล้วโดนตัดแน่ · ผู้ใช้สั่งตรง ๆ ว่า
   *"พัฒนากลิ่น สูตร มันจะมีคอมเมนต์จากลูกค้าด้วยนะ อยากให้โชว์ในตารางด้วย"*

   ⭐ **สองก้อน คนละความหมาย**:
     · "ลูกค้าบอกว่า" = สิ่งที่ลูกค้าพูดถึงของที่ส่งไป (ของแถวนี้)
     · "โจทย์รอบนี้"  = คอมเมนต์ที่ทำให้แถวนี้เกิด (ยกมาจากแถวต้นทางให้เอง) ⇒ RD
       เห็นโจทย์โดยไม่ต้องเลื่อนขึ้นไปหาแถวรอบก่อน
   ⚠️ ใช้คำว่า "ลูกค้าบอกว่า" ให้ตรงกับฟอร์มส่งงานของ RD ที่ใช้คำนี้อยู่แล้ว —
   คำเดียวกันคนละที่คือจุดเริ่มของ "งานเดียวกันสามชื่อในใบเดียว" */
export function CustomerSay({ note = null, brief = null }) {
  if (!note && !brief) return null;
  return (
    <>
      {brief && (
        <div className={`${styles.say} ${styles.brief}`}>
          <span className={styles.sayLabel}>โจทย์รอบนี้</span>
          <ReadableText text={brief} lines={3} />
        </div>
      )}
      {note && (
        <div className={styles.say}>
          <span className={styles.sayLabel}>ลูกค้าบอกว่า</span>
          <ReadableText text={note} lines={3} />
        </div>
      )}
    </>
  );
}

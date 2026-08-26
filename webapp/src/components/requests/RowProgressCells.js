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
      {/* ⚠️ **ต้องคุมความกว้างของราง ไม่ใช่ปล่อยตามคอลัมน์** — `.bar` ของ `StepTrack`
          เป็น `flex: 1` โดยตั้งใจ (รางบนตารางคิวต้องกว้างเท่าคอลัมน์ ไม่ลอยกลาง) ·
          แต่คอลัมน์นี้กว้างกว่านั้นมาก ⇒ สามจุดกระจายห่างกันจนอ่านไม่ออกว่าเป็นราง
          เดียวกัน (ผู้ใช้ส่งภาพมา 2026-08-25) */}
      <StepTrack
        steps={row.track || []}
        compact
        className={styles.rowTrack}
        ariaLabel={`ความคืบหน้าของ ${row.name || "รายการ"}`}
      />
    </td>
  );
}

/* ⭐ เซลล์ "ก้าวถัดไป" — ของกลางเหมือนอีกสองเซลล์
   🐞 **เส้นใต้ลอยกลางแถว** (ผู้ใช้ส่งภาพมา 2026-08-25) — `.stepCell` เคยเป็น
   `display: flex` **บนตัว `<td>` เอง** ⇒ เซลล์หลุดจาก table layout ไม่ยืดตามความสูง
   ของแถว · `border-bottom` จึงวาดที่ก้นเนื้อหาของตัวเอง ไม่ใช่ก้นแถว ⇒ แถวที่เซลล์
   ชื่อสูงสองบรรทัดและเซลล์นี้ว่าง (ไม่มีปุ่มให้คนคนนี้กด) ได้เส้นขีดลอยกลางแถว
   ⇒ `<td>` กลับเป็นเซลล์ตามปกติ · flex ย้ายลงกล่องข้างใน ซึ่งยังได้ผลเดิมทุกข้อ
   (ปุ่มก้าว + เมนู ⋯ อยู่บรรทัดเดียวกัน ไม่ห่อบรรทัด) */
export function RowStepCell({ children }) {
  // ⚠️ `<td>` ไม่มีคลาสของตัวเอง — ระยะและการชิดบนมาจาก `cells="stacked"` ของตาราง
  // กลางอยู่แล้ว · คลาสเปล่าที่ไม่มีกฎอะไรคือของที่ `audit:ui` จับได้ถูกต้อง
  return (
    <td>
      <div className={styles.stepInner}>{children}</div>
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

/* ── เซลล์ "กำหนดส่ง" (มติผู้ใช้ 2026-08-26) ──────────────────────────────
   ⭐ **วันของทั้งใบ โชว์เฉพาะแถวที่ยังเดินอยู่** — แถวที่จบแล้วไม่ผูกกับกำหนดนี้แล้ว
   ⇒ เว้นว่าง · นี่คือสิ่งเดียวที่ทำให้คอลัมน์ค่าซ้ำไม่กลายเป็นกำแพงเลขเดิม 25 บรรทัด
   และทำให้มันตอบคำถามที่มีความหมาย: "เหลืออะไรที่ต้องส่งภายในวันนี้บ้าง"
   ⚠️ `due` คิดครั้งเดียวที่เปลือก (`requestDueCell`) ไม่ใช่รายแถว — `dueIsStale`
   ไล่ทุกแถวในใบ เรียกรายแถวแล้วเป็น O(n²) */
export function RowDueCell({ row, due = null, show = true }) {
  if (!due || row.settled || !show) return <td />;
  return (
    <td className={`${styles.dueCell} ${due.tone ? styles[`due_${due.tone}`] : ""}`.trim()}>
      {due.text}
      {due.note ? <div className={styles.note}>{due.note}</div> : null}
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

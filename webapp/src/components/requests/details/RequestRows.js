"use client";
// ── การ์ดรายแถว — ของกลางที่ทุกหัวข้อที่มีบรรทัดใช้ร่วมกัน (P3b) ─────────
//
// ⚠️ **ห้ามให้หัวข้อไหนโคลนไฟล์นี้ไปแก้เอง** (ม-34) — สิ่งที่ต่างกันรายหัวข้อคือ
// *เนื้อของแถว* ซึ่งมาทาง `renderExtra` · โครงการ์ด/ป้ายขั้น/ไฟล์แนบเหมือนกันหมด
// โคลนเมื่อไรก็ได้สี่ก้อนที่เพี้ยนกันภายในสามเดือน
//
// ⚠️ ประวัติของก้าวอยู่ใน **เธรด** ที่เดียว (ม-49) — การ์ดนี้จึงไม่มีราง ไม่มีปุ่ม
// เหลือเฉพาะของที่เธรดเล่าแทนไม่ได้: สเปกที่ขอ กับไฟล์แนบของแถวนั้น
//
// ⭐ **แถวกางได้ (มติผู้ใช้ 2026-08-12 · IS-26080021)** — Admin ส่งภาพหน้าจอมาว่า
// "หน้าตาไม่สวยงาม ข้อความเบียด" · ที่วัดได้จากภาพ:
//   · กล่องไฟล์แนบกางเต็มก้อนเสมอ **แม้ยังไม่มีไฟล์สักใบ** ⇒ ใบที่เพิ่งเปิดได้การ์ด
//     สูงเท่าใบที่แนบครบ โดยเนื้อจริงมีสองบรรทัด
//   · ใบที่มีหลาย direction จึงกลายเป็นเสาการ์ดสูง ๆ ที่ต้องไถทั้งหน้า
// ⇒ ยุบ "สเปก + ไฟล์แนบ" ไว้ใต้แถว แล้วกางเมื่อกด
//
// ⚠️ **กางได้หลายแถวพร้อมกัน** (มติเดียวกัน) — ไม่ใช่ accordion ที่ปิดอันอื่นให้เอง
// เพราะงานจริงคือ "เทียบ direction สองตัว" ซึ่งต้องเห็นพร้อมกัน
// ⚠️ **แถวเดียว = กางอัตโนมัติ** — ไม่มีอะไรให้เลือก การบังคับกดอีกทีคือขั้นตอนเปล่า
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ReadableText from "@/components/ui/ReadableText";
import StatusBadge from "@/components/ui/StatusBadge";
import { ROW_STAGE_LABELS, ROW_STAGE_TONES, rowStage } from "@/lib/requests/rowStage";
import styles from "./details.module.css";

// attachLabel/attachHint — สายเอกสารใช้การ์ดนี้ "ดูไฟล์" อย่างเดียว (ม-90: แนบผ่าน
// โมดัลส่งเอกสารทางเดียว) จึงต้องเปลี่ยนหัวข้อกับคำอธิบายได้โดยไม่โคลนการ์ด (ม-34)
export default function RequestRows({
  rows = [], canEditAttachments = false, renderExtra,
  attachLabel = "รูป / สเปกแนบ", attachHint,
  /* ⭐ `bare` — เนื้อล้วน ไม่มีหัวแถว/ป้ายสถานะ/กรอบการ์ด
     ใช้ตอนถูกวางไว้ **ในแถวที่กางอยู่แล้ว** ของตารางอื่น (BriefBoard) ซึ่งมีชื่อกับ
     สถานะของ direction อยู่ในแถวข้างบนแล้ว — ไม่งั้นชื่อกลิ่นโผล่ซ้ำอีกรอบ ซึ่งเป็น
     อาการเดิมที่ IS-26080021 แจ้งมา แค่ย้ายที่ */
  bare = false,
}) {
  /* ⚠️ ตั้งต้นด้วยค่าเริ่มต้นของ useState ไม่ใช่ effect — sync ทีหลังจะกางแถวใต้มือ
     คนที่กำลังอ่านอยู่ตอนข้อมูลโหลดเสร็จ (บทเรียนเดียวกับแท็บของ ScentDevDetail) */
  const [open, setOpen] = useState(() => (rows.length === 1 ? [rows[0].id] : []));
  const toggle = (id) => setOpen((list) => (
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  ));

  /* ⚠️ โหมด `bare` **ไม่โชว์ `spec`** — แถวของตารางที่ครอบมันอยู่บอกชื่อ/สเปกไปแล้ว
     ทั้งบรรทัดหลักและบรรทัดรอง ⇒ โชว์ซ้ำที่นี่คือสำเนาที่สาม ซึ่งเป็นอาการเดิมที่
     IS-26080021 แจ้งมา แค่ย้ายที่ · `bare` มีหน้าที่เดียวคือให้ **ไฟล์แนบของแถว**
     กับของที่หัวข้อนั้นแปะเพิ่ม (`renderExtra`) */
  const body = (item) => (
    <>
      {!bare && item.spec && <ReadableText text={item.spec} lines={3} className={styles.rowSpec} />}
      {renderExtra?.(item)}
      <div className={styles.rowAttach}>
        <div className="toolbar-label">{attachLabel}</div>
        {attachHint && <p className={styles.rowAttachHint}>{attachHint}</p>}
        <AttachmentsPanel
          entityType="dept_request_item"
          entityId={item.id}
          canEdit={canEditAttachments}
          inlineUpload
        />
      </div>
    </>
  );

  /* 🐞 โหมด `bare` เคยไม่ห่อ `.rowBody` ⇒ **ไม่มีเพดานความกว้าง** · ในเซลล์ตารางที่
     กว้างเต็มการ์ด ปุ่มแนบไฟล์ (จัดชิดขวาโดย AttachmentsPanel) เลยไปอยู่ไกลจากป้าย
     "รูป / สเปกแนบ" กว่า 1,300px — ที่ว่างกลางแถวยาวจนอ่านไม่ออกว่าปุ่มเป็นของอะไร
     🐞 **แล้วแก้ผิดทางรอบหนึ่ง** — ไปใส่เพดาน 78ch (เพดานของ *บรรทัดข้อความ*) ครอบ
     ทั้งก้อน ⇒ ปุ่มไปชิดขวาของกล่อง 78ch แทนที่จะเป็นขวาของการ์ด = จอดกลางการ์ด
     ⇒ ในการ์ด **ไม่ต้องมีเพดาน** — การ์ดเป็นตัวคุมความกว้างอยู่แล้ว และข้อความยาว
     ก็มี `ReadableText` คุม measure ให้ในตัวเองอยู่แล้ว (`.readable-text` = 78ch) */
  if (bare) return rows.map((item) => <div key={item.id} className={styles.bareBody}>{body(item)}</div>);

  return rows.map((item) => {
    const expanded = open.includes(item.id);
    return (
      <div key={item.id} className={styles.rowCard} data-open={expanded ? "" : undefined}>
        {/* หัวแถวทั้งแถวเป็นปุ่ม — พื้นที่กดใหญ่กว่าไอคอนเล็ก ๆ มาก และคนคาดหวังว่า
            กดที่ชื่อแล้วต้องกางอยู่แล้ว */}
        <button
          type="button" className={styles.rowToggle}
          aria-expanded={expanded} onClick={() => toggle(item.id)}
        >
          <ChevronRight size={15} aria-hidden="true" className={styles.rowChevron} />
          <span className={styles.rowTitle}>
            <strong>{item.label}</strong>
            <StatusBadge
              tone={ROW_STAGE_TONES[rowStage(item)] || "neutral"}
              label={ROW_STAGE_LABELS[rowStage(item)] || "—"}
            />
          </span>
        </button>

        {expanded && <div className={styles.rowBody}>{body(item)}</div>}
      </div>
    );
  });
}

"use client";
// ── การ์ดที่พับเก็บได้ — หัวเป็นปุ่มทั้งแถว เนื้อซ่อนแต่ไม่ถูกถอด ────────────────
//
// ⭐ **ของกลางตัวแรกของบ้านที่ทำเรื่องนี้** — ก่อนหน้านี้ทุกหน้าที่อยากพับของเขียนเอง
//   (หน้าโครงการ · คิวคำร้อง · การ์ดควบคุมเอกสาร) แล้วได้กติกาคนละชุด: บางที่พับด้วย
//   `display:none` บางที่ **ถอดเนื้อออกจาก DOM** ซึ่งกินค่าที่ผู้ใช้พิมพ์ค้างไปด้วย
//
// 🔑 **สัญญาสี่ข้อของตัวนี้ (แบบที่อนุมัติ 2026-09-16 · จอประเมินพื้นที่)**
//   1. **หัวคือปุ่มเดียวทั้งแถว** `h3 > button[aria-expanded][aria-controls]` — ลูกศร
//      อยู่ *ในปุ่ม* · ปุ่มอื่นทั้งหมดอยู่ใน **เนื้อ** ห้ามวางบนหัว
//      ⚠️ ปุ่มซ้อนปุ่มไม่ใช่แค่ผิดสเปก HTML — บนจอสัมผัสมันคือปุ่มที่กดโดนกันเอง
//   2. **เนื้อซ่อนด้วยแอตทริบิวต์ `hidden` ไม่ใช่การถอดทิ้ง** — ค่าที่พิมพ์ค้าง ไฟล์ที่
//      กำลังอัปโหลด และ state ของลูกทุกตัวจึงอยู่ครบตอนกางกลับมา
//   3. **ช่องสรุป (`summary`) โชว์เฉพาะตอนพับ** — หัวที่พับต้องตอบคำถามของกล่องได้
//      โดยไม่ต้องกางออก (พับแล้วอ่านไม่ออกว่าข้างในมีอะไร = พับไปแล้วต้องกางทุกใบ)
//   4. **ป้ายสถานะ (`badges`) อยู่บนหัวเสมอ** — ของที่บอกว่า "กล่องนี้มีเรื่องค้าง"
//      ต้องอ่านได้ตอนพับ ไม่ใช่ซ่อนอยู่ข้างใน
//
// ⚠️ **เปิด/ปิดเป็นของผู้เรียก (controlled)** — ตัวนี้ไม่จำสถานะเอง เพราะหน้าที่มีหลาย
//   กล่องต้องมีปุ่ม "ขยายทุกอัน/ย่อทุกอัน" และต้องบังคับเปิดได้เมื่อบันทึกไม่สำเร็จ
//   ⇒ คนที่รู้เรื่องพวกนั้นคือหน้า ไม่ใช่การ์ด
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./CollapsibleCard.module.css";

/* id ของปุ่มหัว — หน้าที่ย้ายโฟกัสไปหากล่องถัดไปต้องเรียกตัวนี้ ไม่ใช่เดารูปแบบเอง
   (เดาเอง = วันที่รูปแบบเปลี่ยน โฟกัสจะหายเงียบ ๆ โดยไม่มี error) */
export const collapsibleHeadId = (id) => `${id}-head`;
export const collapsibleBodyId = (id) => `${id}-body`;

/**
 * @param id        id ของกล่อง (จุดจอดของลิงก์ที่เลื่อนมาหา) — ใช้ตั้ง id ของหัวและเนื้อด้วย
 * @param open      กางอยู่ไหม (controlled)
 * @param onToggle  `(next: boolean) => void` — ผู้เรียกเป็นคนเก็บสถานะ
 * @param lead      ของชิ้นเล็กหน้าชื่อ (เลขลำดับ · ไอคอนสถานะ)
 * @param eyebrow   บรรทัดเล็กเหนือชื่อ (รหัสของระเบียน)
 * @param title     ชื่อของกล่อง — เป็น heading ระดับ 3 เสมอ
 * @param summary   บรรทัดสรุป **โชว์เฉพาะตอนพับ** (ข้อ 3 ของสัญญา)
 * @param badges    ป้ายบนหัว — โชว์ทั้งตอนพับและตอนกาง
 * @param tone      neutral | info | success | warning | danger — แต่งวงของ `lead` และขอบ
 * @param alert     กล่องนี้มีเรื่องต้องแก้ (ขอบแดง) — ผู้เรียกเป็นคนตัดสิน
 */
export default function CollapsibleCard({
  id,
  open = false,
  onToggle,
  lead,
  eyebrow,
  title,
  summary,
  badges,
  tone = "neutral",
  alert = false,
  className = "",
  children,
}) {
  const headId = collapsibleHeadId(id);
  const bodyId = collapsibleBodyId(id);
  /* 🔴 **ยามของข้อ 1 ตอนรัน** — สัญญาบอกว่า "ปุ่มอื่นทั้งหมดอยู่ในเนื้อ" แต่ช่อง
     `lead/eyebrow/title/summary/badges` เรนเดอร์อยู่ *ในปุ่มหัว* ⇒ ผู้เรียกคนถัดไปที่
     ใส่ลิงก์ "ดูรูป" หรือปุ่มลบลงใน `badges` จะได้ปุ่มซ้อนปุ่มโดยไม่มีอะไรดัก
     (เทสต์ของ primitive อ่านแต่ซอร์สของตัวเอง · audit:ui มีแต่ด่าน "กดด้วยคีย์บอร์ด
     ไม่ได้" ไม่มีกฎ nested-interactive) ⇒ ตรวจของจริงที่ถูกวางลงไป แล้วตะโกนใส่
     คอนโซลตอน dev พร้อมชื่อกล่อง · ไม่มี dep array เพราะของในช่องเปลี่ยนได้ทุกเรนเดอร์ */
  const headRef = useRef(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const nested = headRef.current?.querySelector("a[href], button, input, select, textarea, [tabindex]");
    if (!nested) return;
    console.error(
      `[CollapsibleCard] กล่อง "${id}" มีของที่กดได้ (<${nested.tagName.toLowerCase()}>) ซ้อนอยู่ในปุ่มหัว`
      + " — ปุ่มซ้อนปุ่มบนจอสัมผัสคือปุ่มที่กดโดนกันเอง · ย้ายไปไว้ในเนื้อของกล่อง",
      nested,
    );
  });
  return (
    <section
      id={id}
      className={`${styles.card} ${className}`.trim()}
      data-open={open ? "1" : undefined}
      data-tone={tone}
      data-alert={alert ? "1" : undefined}
      aria-labelledby={headId}
    >
      {/* ⚠️ heading ต้องห่อปุ่ม ไม่ใช่ปุ่มห่อ heading — โปรแกรมอ่านหน้าจอไล่หัวข้อของหน้า
          จากผัง heading ถ้าเอา h3 ไว้ในปุ่ม รายการหัวข้อจะว่างเปล่าทั้งหน้า */}
      <h3 className={styles.heading}>
        <button
          type="button"
          id={headId}
          ref={headRef}
          className={styles.head}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle?.(!open)}
        >
          <span className={styles.chev}><ChevronRight size={18} aria-hidden="true" /></span>
          {lead ? <span className={styles.lead}>{lead}</span> : null}
          <span className={styles.ident}>
            <span className={styles.name}>
              {eyebrow ? <small className={styles.eyebrow}>{eyebrow}</small> : null}
              <span className={styles.title}>{title}</span>
            </span>
            {/* ข้อ 3: พับอยู่เท่านั้นถึงจะมีบรรทัดนี้ — ไม่ได้ซ่อนด้วย CSS เฉย ๆ
                เพราะกางอยู่แล้วของจริงอยู่ข้างล่างครบ บรรทัดย่อจะกลายเป็นข้อมูลซ้ำ
                ที่อ่านไม่ตรงกันได้ (ค่าที่พิมพ์ค้างยังไม่เข้าบรรทัดสรุป) */}
            {!open && summary ? <span className={styles.summary}>{summary}</span> : null}
          </span>
          {badges ? <span className={styles.badges}>{badges}</span> : null}
        </button>
      </h3>
      {/* 🔑 ข้อ 2 — `hidden` ไม่ใช่การถอดทิ้ง · `.body[hidden]` ประกาศ `display:none` ไว้เอง
          เพราะคลาสของเรามี `display` ของตัวเอง ซึ่งทับค่าปริยายของแอตทริบิวต์ `hidden` */}
      <div className={styles.body} id={bodyId} hidden={!open}>{children}</div>
    </section>
  );
}

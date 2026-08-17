"use client";
// ── รางขั้นของใบ — ใช้ร่วมทุกที่ที่ต้องบอก "ใบนี้ค้างที่ใคร" ─────────────────
//
// มติผู้ใช้ 2026-08-13: *"ให้พูดภาษาเดียวกับตาราง SO ที่เพิ่งรื้อ"*
//
// ⭐ **ยกเป็นคอมโพเนนต์ตั้งแต่ที่ใช้ที่สอง ไม่รอที่สาม** — ตอนแรกรางอยู่ในตารางรายการ SO
// ที่เดียว (CSS + แผนที่ state→class อยู่ในหน้า) · พอทะเบียนการชำระต้องใช้รางเดียวกัน
// ทางที่ง่ายกว่าคือก๊อป CSS ไปอีกไฟล์ ซึ่งคือจุดเริ่มของ "สองอันที่เพี้ยนหากัน"
// ที่ AGENTS.md เตือนไว้ (เคสฟอร์มสร้าง/แก้) ⇒ ยกออกมาก่อนที่มันจะแตกตัว
//
// ⭐ **ย้ายมา `components/ui` ตอนใช้ที่สาม** (2026-08-17) — ตารางคำร้องต้องการรางเดียวกัน
// แต่คำร้องไม่ใช่เรื่องของฝ่ายขาย · ชื่อเดิม (`salesPlanning/SalesOrderTrack`) จะทำให้
// หน้าอื่น "ไม่กล้าใช้" แล้วก๊อป CSS ไปอีกไฟล์ ซึ่งคือสิ่งที่คอมเมนต์บนกันไว้พอดี
// ⚠️ จำนวนขั้นไม่ตายตัว — SO เดินสามขั้น (AE Sup · บัญชีตรวจ · เก็บเงิน) คำร้องเดินสี่
// (ส่ง · รับเรื่อง · ตอบ · ปิด) · คอมโพเนนต์นี้ไม่รู้จักขั้นไหนเลย มันวาดตามที่ส่งมา
//
// ⚠️ **ตรรกะไม่ได้อยู่ที่นี่** — คอมโพเนนต์นี้วาดอย่างเดียว · การตัดสินว่าขั้นไหน
// `done`/`now`/`bad`/`todo` อยู่ที่ `lib/sales/salesOrderListTrack.js` (SO) และ
// `lib/requests/queueTrack.js` (คำร้อง) พร้อมเทสต์ของตัวเอง
// (แยกเพราะตรรกะต้องทดสอบได้โดยไม่ต้องเรนเดอร์ และมีที่เรียกที่ไม่ได้วาดราง เช่นป้ายสรุป)
import { Fragment } from "react";
import styles from "./StepTrack.module.css";

/* `skip` = **ขั้นที่ใบนี้ไม่มี** (เช่นใบยอด 0 ไม่มีขั้นเก็บเงิน — มติผู้ใช้ 2026-08-18)
   ⚠️ คนละเรื่องกับ `todo` (ยังไม่ถึงคิว) และ `done` (ผ่านมาแล้ว) — หมุดจึงเป็น
   **วงกลมกลวง** ซึ่งเป็นรูปเดียวที่ยังไม่ถูกใช้ ⇒ อ่านออกจากรูปก่อนอ่านจากสี */
const STEP_CLASS = { done: "stepDone", now: "stepNow", bad: "stepBad", skip: "stepSkip", todo: "" };

export default function StepTrack({ steps, className = "", ariaLabel = "ความคืบหน้าของใบ" }) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return null;
  return (
    <div className={`${styles.track} ${className}`.trim()} aria-label={ariaLabel}>
      {list.map((step, index) => (
        <Fragment key={step.key}>
          {/* ⚠️ เส้นที่ "ผ่านแล้ว" ย้อมเขียวด้วย ไม่ใช่ย้อมแค่หมุด — เส้นคือสิ่งที่ตากวาด
              ตามไป ถ้าเส้นสีเดียวกันหมดจะแยกไม่ออกว่าเดินมาถึงไหน */}
          {index > 0 ? (
            /* ⚠️ เส้นที่นำไปสู่ขั้นที่ข้าม = **เส้นประ** ไม่ใช่เขียว — เขียวแปลว่า
               "เดินผ่านมาแล้ว" แต่ช่วงนี้ไม่ได้เดินผ่าน มันไม่มีอยู่ */
            <span
              className={`${styles.bar} ${
                list[index].state === "skip"
                  ? styles.barSkip
                  : list[index - 1].state === "done" ? styles.barDone : ""
              }`.trim()}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={`${styles.step} ${STEP_CLASS[step.state] ? styles[STEP_CLASS[step.state]] : ""}`.trim()}
            title={step.note || undefined}
          >
            <span className={styles.dot} aria-hidden="true" />{step.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

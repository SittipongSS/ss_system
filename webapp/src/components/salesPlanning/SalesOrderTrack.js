"use client";
// ── รางสามขั้นของใบสั่งขาย — ใช้ร่วมทุกที่ที่ต้องบอก "ใบนี้ค้างที่ใคร" ────────
//
// มติผู้ใช้ 2026-08-13: *"ให้พูดภาษาเดียวกับตาราง SO ที่เพิ่งรื้อ"*
//
// ⭐ **ยกเป็นคอมโพเนนต์ตั้งแต่ที่ใช้ที่สอง ไม่รอที่สาม** — ตอนแรกรางอยู่ในตารางรายการ SO
// ที่เดียว (CSS + แผนที่ state→class อยู่ในหน้า) · พอทะเบียนการชำระต้องใช้รางเดียวกัน
// ทางที่ง่ายกว่าคือก๊อป CSS ไปอีกไฟล์ ซึ่งคือจุดเริ่มของ "สองอันที่เพี้ยนหากัน"
// ที่ AGENTS.md เตือนไว้ (เคสฟอร์มสร้าง/แก้) ⇒ ยกออกมาก่อนที่มันจะแตกตัว
//
// ⚠️ **ตรรกะไม่ได้อยู่ที่นี่** — คอมโพเนนต์นี้วาดอย่างเดียว · การตัดสินว่าขั้นไหน
// `done`/`now`/`bad`/`todo` อยู่ที่ `lib/sales/salesOrderListTrack.js` พร้อมเทสต์
// (แยกเพราะตรรกะต้องทดสอบได้โดยไม่ต้องเรนเดอร์ และมีที่เรียกที่ไม่ได้วาดราง เช่นป้ายสรุป)
import { Fragment } from "react";
import styles from "./SalesOrderTrack.module.css";

const STEP_CLASS = { done: "stepDone", now: "stepNow", bad: "stepBad", todo: "" };

export default function SalesOrderTrack({ steps, className = "", ariaLabel = "ความคืบหน้าของใบ" }) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return null;
  return (
    <div className={`${styles.track} ${className}`.trim()} aria-label={ariaLabel}>
      {list.map((step, index) => (
        <Fragment key={step.key}>
          {/* ⚠️ เส้นที่ "ผ่านแล้ว" ย้อมเขียวด้วย ไม่ใช่ย้อมแค่หมุด — เส้นคือสิ่งที่ตากวาด
              ตามไป ถ้าเส้นสีเดียวกันหมดจะแยกไม่ออกว่าเดินมาถึงไหน */}
          {index > 0 ? (
            <span
              className={`${styles.bar} ${list[index - 1].state === "done" ? styles.barDone : ""}`.trim()}
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

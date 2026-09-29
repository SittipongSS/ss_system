"use client";
// ── ที่วางตัวแก้วันงวดตามความกว้างจอ (ตัดสินใน useInstallmentDateMode) ──
//
// · ≥1000px `InstallmentDateFrame` — ป๊อปโอเวอร์ **อยู่ในกรอบของตาราง** (absolute) ข้างแถวที่เปิด ⇒ ไม่มีทางบังหัวใบ SO
//   หรือปุ่มบนหัวการ์ด (ข้อ 7 ของกรรมการ) · วางขวาของช่องกำหนดชำระ ไม่พอ = ซ้ายของช่องวันแรก ไม่พอทั้งคู่ = ใต้แถว
//   (ไม่ทับช่องวันของแถวที่กำลังแก้) · กรอบยืดตามก้นป๊อปโอเวอร์ ⇒ ใบงวดเดียวไม่ทับแถบบันทึก
// · 641–999px `InstallmentDateExpandRow` — กางเป็นแถวใต้งวดนั้นในตารางเดียวกัน (ติดขอบซ้ายของกล่องเลื่อน)
// · ≤640px แผ่นเต็มจอ (InstallmentDateSheet ใน InstallmentDateChrome.js)
// ⚠️ ตำแหน่งมาจากการวัดจริง ตั้งเป็นตัวแปร CSS (`--date-pop-*`) — ไม่ใช้ style={{}} (เพดาน inlineStyle ของโมดูลเต็มพอดี)
// ⚠️ แถวต้องติด `data-date-row={row.id}` · เซลล์วันติด `data-date-cell` (ตัวแก้ปิดแล้วโฟกัสกลับเซลล์เดิม)
import { useEffect, useLayoutEffect, useRef } from "react";
import InstallmentDateEditor from "./InstallmentDateEditor";
import styles from "./InstallmentDates.module.css";

const GAP = 8;
const rowSelector = (id) => `[data-date-row="${String(id).replace(/["\\]/g, "\\$&")}"]`;

/* ตัวแก้ปิด (X · Escape · เลือกแล้วไม่มีงวดว่างเหลือ) = โฟกัสกลับเซลล์วันของงวดที่เพิ่งแก้ — คีย์บอร์ดไม่หลุดไปต้นหน้า */
function useReturnFocus(mode, rootRef) {
  const lastRef = useRef(null);
  useEffect(() => {
    if (mode.openId) {
      lastRef.current = mode.openId;
      return;
    }
    const last = lastRef.current;
    lastRef.current = null;
    if (!last || !mode.active) return;
    const cell = rootRef.current?.querySelector(`${rowSelector(last)} [data-date-cell]`);
    if (cell && !cell.contains(document.activeElement)) cell.focus({ preventScroll: true });
  }, [mode.openId, mode.active, rootRef]);
}

export default function InstallmentDateFrame({ mode, children }) {
  const frameRef = useRef(null);
  const popRef = useRef(null);
  const row = mode.active && mode.placement === "popover" ? mode.openRow : null;
  useReturnFocus(mode, frameRef);

  /* วัดทุกครั้งที่วาด (ร่างเปลี่ยนความสูงแถว) + เมื่อเลื่อนตารางแนวนอน/ย่อขยายจอ/ตัวแก้เปลี่ยนความสูง */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const pop = popRef.current;
    if (!frame) return undefined;
    if (!row || !pop) {
      frame.style.removeProperty("--date-pop-bottom");
      return undefined;
    }
    const place = () => {
      const tr = frame.querySelector(rowSelector(row.id));
      if (!tr) return;
      const box = frame.getBoundingClientRect();
      const rowBox = tr.getBoundingClientRect();
      const cells = [...tr.querySelectorAll("[data-date-cell]")].map((cell) => cell.closest("td") || cell);
      const first = (cells[0] || tr).getBoundingClientRect();
      const last = (cells[cells.length - 1] || tr).getBoundingClientRect();
      const width = pop.offsetWidth;
      let left = last.right - box.left + GAP;
      let top = rowBox.top - box.top;
      if (left + width > box.width) {
        const before = first.left - box.left - GAP - width;
        if (before >= 0) left = before;
        else {
          /* ข้างแถวไม่พอ — ลงใต้แถว ชิดช่องวันแรก (ไม่ทับช่องวันของแถวที่กำลังแก้) */
          left = Math.max(0, Math.min(first.left - box.left, box.width - width));
          top = rowBox.bottom - box.top + GAP / 2;
        }
      }
      pop.style.setProperty("--date-pop-left", `${Math.round(left)}px`);
      pop.style.setProperty("--date-pop-top", `${Math.round(top)}px`);
      frame.style.setProperty("--date-pop-bottom", `${Math.round(top + pop.offsetHeight + GAP)}px`);
      pop.dataset.placed = "yes";
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(pop);
    window.addEventListener("resize", place);
    /* scroll ไม่ bubble — ฟังแบบ capture ที่กรอบ ⇒ ได้ของกล่องเลื่อนของ TableScroll ข้างใน */
    frame.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      frame.removeEventListener("scroll", place, true);
    };
  });

  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    mode.close();
  };

  return (
    <div ref={frameRef} className={styles.frame} data-pop={row ? "open" : undefined}>
      {children}
      {row ? (
        <div ref={popRef} className={styles.pop} role="dialog" aria-label={`ตั้งวัน งวดที่ ${row.seq}`} onKeyDown={onKeyDown}>
          {/* key = งวด + ชนิดของกติกา ⇒ เดือนที่เลื่อนปฏิทินไป · "ดูรอบถัดไปอีก" · วิธีที่เปิด ไม่ติดข้ามไปงวดถัดไป (review R-UI)
              และไม่ติดข้ามกติกา — ตั้ง/ล้างกำหนดวางบิลของลูกค้าระหว่างตัวแก้เปิดอยู่ = ตัวแก้เปิดใหม่ตามชนิดใหม่ (review 28/09) */}
          <InstallmentDateEditor key={`${row.id}:${mode.kind}`} mode={mode} row={row} variant="popover" />
        </div>
      ) : null}
    </div>
  );
}

/* 641–999px: แถวกางใต้งวดที่เปิด (ผู้เรียกวางต่อจาก <tr> ของงวดนั้น) · `colSpan` = จำนวนคอลัมน์ของตาราง
   · หน้าสร้าง SO ใช้ที่วางนี้ทุกความกว้างที่ไม่ใช่มือถือ (`create`) — `className` = คลาสของหน้าให้แถวนี้เต็มการ์ดตอนตารางเป็นการ์ดต่องวด */
export function InstallmentDateExpandRow({ mode, row, colSpan, className = "" }) {
  if (!mode.active || mode.placement !== "inline" || mode.openId !== row?.id) return null;
  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    mode.close();
  };
  return (
    <tr className={`${styles.expandRow} ${className}`.trim()}>
      <td colSpan={colSpan} className={styles.expandCell}>
        <div className={styles.expandBox} role="group" aria-label={`ตั้งวัน งวดที่ ${row.seq}`} onKeyDown={onKeyDown}>
          {/* key เดียวกับป๊อปโอเวอร์/แผ่นมือถือ — งวด + ชนิดของกติกา (review 28/09: เดิมที่วางนี้ไม่มี key เลย) */}
          <InstallmentDateEditor key={`${row.id}:${mode.kind}`} mode={mode} row={row} variant="inline" />
        </div>
      </td>
    </tr>
  );
}

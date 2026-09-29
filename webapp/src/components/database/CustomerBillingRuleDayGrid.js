"use client";
// ── ตารางวันที่ 1–30 + "31 · สิ้นเดือน" ของโมดัลเครดิตและรอบวางบิล (ม็อก modal-v2 แบบแนะนำ) ─────────
//
// ⭐ **ไม่ใช่ปฏิทินรายสัปดาห์** (มติเจ้าของ 26/09) — เป็นแค่เลขวันที่ของ "ทุกเดือน" ไม่มีวันในสัปดาห์
//    ⇒ ห้ามวาง 7 ช่องต่อแถว (อ่านเป็นสัปดาห์ทันที) · จอกว้าง 8 คอลัมน์ · มือถือ 6 คอลัมน์ (ดู .days ใน css)
// แตะเลือก ไม่พิมพ์ (ม็อก: ช่องพิมพ์ที่ซ่อนหลังแผ่นคือเหตุที่ AR-267 ต้อง 5 จังหวะ)
// · `multiple` = ตารางวางบิล: แตะ = เพิ่ม/ถอดรอบ (aria-pressed) · ไม่ส่ง = ตารางเงินเข้า: เลือกหนึ่ง (radio)
// · `stateOf(day)` = `{ blocked, invalid, isBill, title }` จาก payDayState — วันที่กดไม่ได้ **โฟกัสได้แต่เลือกไม่ได้**
//   (aria-disabled + เหตุใน title และในบรรทัดคำใบ้ใต้ตาราง — ไม่ใช่จางเฉย ๆ)
// ใช้ `.choice-chip` ของระบบ ห่อด้วยคลาสของจอ (ไม่สร้าง primitive ใหม่) · คีย์บอร์ด: ลูกศรเดินในตาราง (roving tabindex)
import { MONTH_END_DAY } from "@/lib/sales/billingRule";
import styles from "./CustomerBillingRule.module.css";

const DAYS = Array.from({ length: MONTH_END_DAY }, (_, i) => i + 1);
const END_TITLE = "เดือนที่ไม่มีวันที่ 31 ใช้วันสุดท้ายของเดือน";

export default function CustomerBillingRuleDayGrid({
  ariaLabel,
  multiple = false,
  value,            // multiple: number[] · เดี่ยว: number | null
  onPick,
  stateOf,
  dim = false,      // "ได้ทุกวัน" — ตารางจาง แต่ยังแตะได้ (แตะ = เปลี่ยนเป็นรายเดือน)
  className = "",
}) {
  const isOn = (day) => (multiple ? (value || []).includes(day) : value === day);
  const stateFor = (day) => (stateOf ? stateOf(day) : null) || {};
  /* roving tabindex — ช่องที่เลือกไว้ตัวแรก หรือช่องแรกที่กดได้ */
  const focusDay = DAYS.find((day) => isOn(day) && !dim) ?? DAYS.find((day) => !stateFor(day).blocked) ?? 1;

  const onKeyDown = (event) => {
    const cells = [...event.currentTarget.querySelectorAll("button")];
    const index = cells.indexOf(document.activeElement);
    if (index < 0) return;
    const cols = getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").filter(Boolean).length || 8;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
    if (!step) return;
    event.preventDefault();
    cells[Math.max(0, Math.min(cells.length - 1, index + step))].focus();
  };

  return (
    <div
      className={`${styles.days} ${dim ? styles.daysDim : ""} ${className}`.trim()}
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {DAYS.map((day) => {
        const on = isOn(day) && !dim;
        const state = stateFor(day);
        const end = day === MONTH_END_DAY;
        const classes = [
          "choice-chip",
          end ? styles.dayEnd : "",
          state.invalid ? styles.dayInvalid : "",
          state.isBill ? styles.dayBill : "",
        ].filter(Boolean).join(" ");
        return (
          <button
            key={day}
            type="button"
            className={classes}
            data-on={on ? "1" : undefined}
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            aria-disabled={state.blocked ? "true" : undefined}
            aria-label={end ? "วันที่ 31 หรือสิ้นเดือน" : `วันที่ ${day}`}
            title={state.title || (end ? END_TITLE : undefined)}
            tabIndex={day === focusDay ? 0 : -1}
            onClick={() => { if (!state.blocked) onPick?.(day); }}
          >
            {end ? "31 · สิ้นเดือน" : day}
          </button>
        );
      })}
    </div>
  );
}

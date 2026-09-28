"use client";
// ── ปฏิทินรายเดือนในตัวแก้วันงวด — เริ่มวันอาทิตย์ (มติ 26/09 · ทุกปฏิทิน อา–ส) ──
//
// ⭐ เห็นผลก่อนแตะ (ข้อ 3 ของกรรมการ) — บรรทัด `peek` ใต้ปฏิทินบอกผลของวันที่ชี้ **หรือโฟกัส** (คีย์บอร์ด) และหลังแตะ
//   บอกผลของวันที่เลือก · บนจอสัมผัสไม่มี hover ⇒ ผู้เรียกไม่เลื่อนไปงวดถัดไปหลังแตะวันจากปฏิทินวันวางบิล (คนเห็นกำหนดชำระก่อน)
// ⭐ เสาร์-อาทิตย์เป็นวันปกติ (ไม่จางแบบวันที่ผ่านแล้ว) — เตือนเป็นคำ "ตรงวันเสาร์/อาทิตย์" ในบรรทัดผล (ข้อ 4)
// ⭐ วันของงวดอื่นติดเลขงวดมุมช่อง — เห็นเพื่อนบ้านระหว่างเลือก (บรีฟ: "เห็นงวดอื่นของใบระหว่างตั้ง")
// ⚠️ ไม่ใช่ DateInput — ช่องนั้นเปิดปฏิทินลอยทีละครั้ง ที่นี่ต้องแตะได้ทันทีในตัวแก้ · ไม่อ่านนาฬิกาเอง (todayIso จากผู้เรียก)
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { formatBillingDate } from "@/lib/sales/billingRule";
import { shiftMonth, sundayFirstCells } from "@/lib/sales/installmentDateDrafts";
import styles from "./InstallmentDates.module.css";

const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * @param month     'YYYY-MM' ที่เปิดอยู่ (ผู้เรียกถือ) · onMonth(next)
 * @param selected  วันที่เลือกอยู่ ('' = ยังไม่เลือก)
 * @param marks     Map(iso → เลขงวดอื่นที่อยู่วันนั้น)
 * @param peekOf    (iso) => ReactNode — ผลของวันนั้น (เช่น "○ วางบิล … → ● กำหนดชำระ …")
 */
export default function InstallmentCalendar({
  month, onMonth, selected = "", todayIso = "", marks = new Map(), onPick, peekOf, ariaLabel, disabled = false,
}) {
  const [peek, setPeek] = useState("");
  const [y, m] = String(month).split("-").map(Number);
  const cells = sundayFirstCells(month);
  const shown = peek || selected;

  /* ลูกศรเดินในเดือน (±1 วัน · ±1 สัปดาห์) — ช่องเดียวที่อยู่ใน tab order (roving tabindex) */
  const focusDay = cells.includes(selected) ? selected : cells.includes(todayIso) ? todayIso : cells.find(Boolean);
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[event.key];
    if (!step) return;
    const days = cells.filter(Boolean);
    const at = days.indexOf(document.activeElement?.dataset?.iso);
    if (at < 0) return;
    event.preventDefault();
    const next = days[Math.max(0, Math.min(days.length - 1, at + step))];
    event.currentTarget.querySelector(`[data-iso="${next}"]`)?.focus();
  };

  return (
    <div className={styles.cal}>
      <div className={styles.calHead}>
        <Button iconOnly size="sm" variant="quiet" aria-label="เดือนก่อน" disabled={disabled}
          icon={<ChevronLeft size={16} aria-hidden="true" />} onClick={() => onMonth?.(shiftMonth(month, -1))} />
        <strong aria-live="polite">{MONTHS_TH[m - 1]} {y}</strong>
        <Button iconOnly size="sm" variant="quiet" aria-label="เดือนถัดไป" disabled={disabled}
          icon={<ChevronRight size={16} aria-hidden="true" />} onClick={() => onMonth?.(shiftMonth(month, 1))} />
      </div>
      <div className={styles.calWeek} aria-hidden="true">{DAYS_TH.map((day) => <span key={day}>{day}</span>)}</div>
      <div className={styles.calGrid} role="group" aria-label={ariaLabel} onKeyDown={onKeyDown}
        onMouseLeave={() => setPeek("")}>
        {cells.map((iso, index) => {
          if (!iso) return <span key={`pad-${index}`} className={styles.calPad} aria-hidden="true" />;
          const mark = marks.get(iso);
          return (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              className={styles.calDay}
              data-past={todayIso && iso < todayIso ? "yes" : undefined}
              data-today={iso === todayIso ? "yes" : undefined}
              aria-pressed={iso === selected}
              aria-label={`${formatBillingDate(iso)}${iso === todayIso ? " · วันนี้" : ""}${mark ? ` · งวด ${mark} อยู่วันนี้` : ""}`}
              tabIndex={iso === focusDay ? 0 : -1}
              disabled={disabled}
              onMouseEnter={() => setPeek(iso)}
              onFocus={() => setPeek(iso)}
              onBlur={() => setPeek("")}
              onClick={() => onPick?.(iso)}
            >
              {Number(iso.slice(8))}
              {mark ? <span className={styles.calMark} aria-hidden="true">{mark}</span> : null}
            </button>
          );
        })}
      </div>
      {peekOf ? <p className={styles.peek} aria-live="polite">{shown ? peekOf(shown) : null}</p> : null}
    </div>
  );
}

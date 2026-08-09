"use client";

import styles from "./MonthGrid.module.css";

/* กริดปฏิทินรายเดือนกลาง — pattern เดียวของทั้งระบบ (มติผู้ใช้ 2026-08-08:
   เลือกแบบ A "ตารางร่วมเส้น" จาก mock 3 แบบ · artifact 42c896ea)

   ก่อนหน้านี้ปฏิทินสามหน้าเขียนกริดเองคนละชุด (mgmt/calendar เขียน inline
   ทั้งก้อน · sa/calendar และ settings/holidays มี CSS module ของตัวเอง) จังหวะ
   จึงไม่ตรงกันเลย: สูงช่อง 74 / 92 / 104px · มุม 8 / 10px · ช่องไฟ 6px
   ⇒ ตัวนี้ถือ **โครงกับสถานะของช่อง** ไว้ที่เดียว ส่วน "ของที่อยู่ในช่อง"
   ยังเป็นของหน้าเรียก (นัด/งาน/ป้ายวันหยุด) เพราะแต่ละหน้าคนละเรื่องจริง

   ⚠️ หน้า service/schedule เป็นกริด **ช่าง×วัน** ไม่ใช่เดือน — ใช้ตัวนี้ไม่ได้
   โดยเจตนา (มันมีจังหวะเส้นร่วมแบบเดียวกันอยู่แล้ว) */

export const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** ช่องของเดือน: null = ช่องเว้น · เลข = วันที่
    เติมท้ายให้ครบสัปดาห์ด้วย — ไม่งั้นแถวสุดท้ายไม่มีเส้นกริดครบ กลายเป็น
    ช่องว่างไร้ขอบ (เห็นจริงตอนย้าย mgmt/calendar) */
export function monthCells(year, month) {
  const startPad = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const pad2 = (n) => String(n).padStart(2, "0");
export const isoOf = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;

/**
 * @param {number} year
 * @param {number} month 0-based
 * @param {string} [todayISO] วันนี้ (คำนวณจากผู้เรียกเพื่อไม่ให้ SSR/CSR ต่างกัน)
 * @param {(iso: string) => string | undefined} [holidayOf] คืนชื่อวันหยุดของวันนั้น
 * @param {(ctx) => React.ReactNode} [children] เนื้อในช่อง — รับ { iso, day, dow, isWeekend, isHoliday, isToday }
 * @param {(iso: string) => void} [onDayClick] ใส่แล้วช่องกลายเป็น <button>
 * @param {(ctx) => boolean} [dayDisabled] ช่องที่กดไม่ได้ (ใช้กับ onDayClick)
 * @param {(ctx) => string} [dayLabel] aria-label ของช่องที่กดได้
 * @param {boolean} [showHolidayName=true] โชว์ชื่อวันหยุดมุมขวาของหัวช่อง
 */
export default function MonthGrid({
  year,
  month,
  todayISO,
  holidayOf,
  onDayClick,
  dayDisabled,
  dayLabel,
  showHolidayName = true,
  weekdayLabels = WEEKDAYS_TH,
  className = "",
  children,
}) {
  const cells = monthCells(year, month);
  const Cell = onDayClick ? "button" : "div";

  return (
    <div className={`${styles.shell} ${className}`.trim()}>
      <div className={styles.dow}>
        {weekdayLabels.map((label, i) => (
          <span key={label} className={i === 0 || i === 6 ? styles.dowWeekend : undefined}>{label}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <div key={`pad-${index}`} className={`${styles.cell} ${styles.pad}`} />;

          const iso = isoOf(year, month, day);
          const dow = new Date(year, month, day).getDay();
          const isWeekend = dow === 0 || dow === 6;
          const holidayName = holidayOf?.(iso);
          const isHoliday = Boolean(holidayName) || holidayOf?.(iso) === "";
          const isToday = iso === todayISO;
          const ctx = { iso, day, dow, isWeekend, isHoliday, holidayName, isToday };

          const cls = [
            styles.cell,
            isHoliday ? styles.holiday : isWeekend ? styles.weekend : "",
            isToday ? styles.today : "",
          ].filter(Boolean).join(" ");

          const numCls = [
            styles.num,
            isToday ? styles.numToday : isHoliday ? styles.numHoliday : isWeekend ? styles.numMuted : "",
          ].filter(Boolean).join(" ");

          const disabled = onDayClick ? Boolean(dayDisabled?.(ctx)) : undefined;

          return (
            <Cell
              key={iso}
              className={cls}
              {...(onDayClick
                ? {
                  type: "button",
                  disabled,
                  onClick: () => onDayClick(iso),
                  "aria-label": dayLabel?.(ctx),
                }
                : null)}
            >
              <span className={styles.head}>
                <span className={numCls}>{day}</span>
                {showHolidayName && holidayName
                  ? <span className={styles.note} title={holidayName}>{holidayName}</span>
                  : null}
              </span>
              {children?.(ctx)}
            </Cell>
          );
        })}
      </div>
    </div>
  );
}

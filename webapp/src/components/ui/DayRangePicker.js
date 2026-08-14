"use client";

/* ตัวเลือก "ช่วงวัน" — ปุ่มแสดงช่วง + แผงปฏิทินสองเดือน (IS-26080023)
 *
 * ทำไมไม่ใช้ `DateInput` สองช่องวางคู่กัน: คนที่ใช้คือ Marketing ที่ต้องการ
 * "สัปดาห์นี้" / "7 วันล่าสุด" เป็นหลัก การพิมพ์วันสองครั้งเพื่อได้ช่วงเดิมทุกสัปดาห์
 * คือการทำงานซ้ำที่ใบนี้ขอให้เลิกทำ · ชิปทางลัดจึงเป็นของหลัก ปฏิทินเป็นของรอง
 *
 * แพตเทิร์นแผงลอย (portal + จัดตำแหน่งเอง) ลอกจาก `MonthPicker` ทั้งดุ้น — แถบ
 * เครื่องมือที่ตัวนี้ไปอยู่มัก `overflow: hidden` ถ้าเรนเดอร์ในที่ตัวเองแผงจะโดนตัด
 *
 * ⚠️ ทุกค่าเป็นสตริง `YYYY-MM-DD` ล้วน ไม่แปลงเป็น Date ก่อนเทียบ — เหตุผลอยู่ที่
 * `lib/datePeriods.js` (ใช้ Date แล้วเจอ timezone จนวันเลื่อน)
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { addDays, daysInRange, isDayValue, lastDayOfMonth, weekStartOf } from "@/lib/datePeriods";
import { fmtDate } from "@/lib/format";

const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// สัปดาห์เริ่มวันอาทิตย์ — มติผู้ใช้ 2026-07-15 ให้ตรงกับปฏิทินหน้าวันหยุด/mgmt
// (คนละเรื่องกับ "ถังรายสัปดาห์" ของกราฟซึ่งเป็น จ.–อา. ตามที่ Marketing นับจริง)
const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 340;

const monthOf = (day) => String(day || "").slice(0, 7);
const startOfMonth = (month) => `${month}-01`;
const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** ช่องปฏิทินหนึ่งเดือน — เติมช่องว่างหน้า/หลังให้ครบสัปดาห์ (คอลัมน์แรก = อาทิตย์) */
function cellsOfMonth(month) {
  const first = startOfMonth(month);
  const last = lastDayOfMonth(month);
  if (!first || !last) return [];
  const [y, m] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const out = Array.from({ length: lead }, (_, i) => ({ key: `blank-${i}`, day: null }));
  for (const day of daysInRange(first, last)) out.push({ key: day, day });
  return out;
}

/** ทางลัดที่ Marketing ใช้จริง — อิง `today` ที่ส่งเข้ามา ไม่ใช่นาฬิกาเครื่อง
 *  (หน้าจอส่งวันไทยมาให้ ไม่งั้นช่วงเลื่อนตาม timezone ของเบราว์เซอร์) */
export function quickRanges(today) {
  const monday = weekStartOf(today);
  const lastMonday = addDays(monday, -7);
  return [
    { key: "7", label: "7 วันล่าสุด", from: addDays(today, -6), to: today },
    { key: "14", label: "14 วัน", from: addDays(today, -13), to: today },
    { key: "thisWeek", label: "สัปดาห์นี้", from: monday, to: addDays(monday, 6) },
    { key: "lastWeek", label: "สัปดาห์ก่อน", from: lastMonday, to: addDays(lastMonday, 6) },
    { key: "thisMonth", label: "เดือนนี้", from: startOfMonth(monthOf(today)), to: today },
  ];
}

export default function DayRangePicker({
  from,
  to,
  today,
  onChange,
  /** วันที่มีข้อมูลจริง — โชว์เป็นจุดใต้ตัวเลข เพื่อให้เห็นว่ากำลังลากคลุมวันว่างกี่วัน */
  markedDays = [],
  disabled = false,
  ariaLabel = "เลือกช่วงวัน",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(from || today));
  // วันแรกที่กดค้างไว้ระหว่างเลือก — ยังไม่คอมมิตจนกว่าจะกดวันที่สอง
  const [pending, setPending] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);

  const marked = useMemo(() => new Set(markedDays || []), [markedDays]);
  const quick = useMemo(() => quickRanges(today), [today]);
  const activeQuick = quick.find((q) => q.from === from && q.to === to)?.key || null;

  useEffect(() => { if (open) setView(monthOf(from || today)); }, [open, from, today]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setOpen(false);
        setPending(null);
      }
    };
    const key = (event) => { if (event.key === "Escape") { setOpen(false); setPending(null); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw <= 640) {
        setPanelStyle({ position: "fixed", left: 12, right: 12, top: 12, width: "auto", maxHeight: "calc(100vh - 24px)", overflowY: "auto" });
        return;
      }
      const gap = 6;
      const left = Math.max(8, Math.min(rect.left, vw - PANEL_WIDTH - 8));
      const opensUp = rect.bottom + gap + PANEL_HEIGHT > vh && rect.top > PANEL_HEIGHT + gap;
      const top = opensUp ? Math.max(8, rect.top - PANEL_HEIGHT - gap) : Math.min(rect.bottom + gap, vh - PANEL_HEIGHT - 8);
      setPanelStyle({ position: "fixed", left, top: Math.max(8, top), width: PANEL_WIDTH });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const pick = (day) => {
    if (!pending) { setPending(day); return; }
    const [a, b] = day < pending ? [day, pending] : [pending, day];
    setPending(null);
    onChange?.({ from: a, to: b });
    setOpen(false);
  };

  const applyQuick = (q) => {
    setPending(null);
    onChange?.({ from: q.from, to: q.to });
    setOpen(false);
  };

  const label = isDayValue(from) && isDayValue(to)
    ? `${fmtDate(from)} – ${fmtDate(to)}`
    : "เลือกช่วงวัน";
  const dayCount = isDayValue(from) && isDayValue(to) ? daysInRange(from, to).length : 0;

  const renderMonth = (month, side) => (
    <div className="dayrange-month">
      <span className="date-calendar-header">
        {side === "left"
          ? <button type="button" onClick={() => setView(shiftMonth(view, -1))} aria-label="เดือนก่อน"><ChevronLeft size={18} /></button>
          : <span />}
        <strong>{MONTHS_TH[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}</strong>
        {side === "right"
          ? <button type="button" onClick={() => setView(shiftMonth(view, 1))} aria-label="เดือนถัดไป"><ChevronRight size={18} /></button>
          : <span />}
      </span>
      <span className="date-calendar-weekdays">{DAYS_TH.map((d) => <span key={d}>{d}</span>)}</span>
      <span className="date-calendar-grid dayrange-grid">
        {cellsOfMonth(month).map((cell) => {
          if (!cell.day) return <span key={cell.key} />;
          const isEdge = pending ? cell.day === pending : (cell.day === from || cell.day === to);
          const inside = !pending && from && to && cell.day > from && cell.day < to;
          const classes = [
            isEdge && "selected",
            inside && "dayrange-in",
            !pending && cell.day === from && "dayrange-start",
            !pending && cell.day === to && "dayrange-end",
            cell.day === today && "today",
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={cell.key}
              className={classes}
              onClick={() => pick(cell.day)}
              aria-label={`${fmtDate(cell.day)}${marked.has(cell.day) ? " มีลีดเข้า" : ""}`}
            >
              {Number(cell.day.slice(8))}
              {marked.has(cell.day) && <i className="dayrange-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </span>
    </div>
  );

  const panel = open && panelStyle ? (
    <div ref={panelRef} className="date-calendar dayrange-panel" role="dialog" aria-label={ariaLabel} style={panelStyle}>
      <div className="dayrange-quick">
        {quick.map((q) => (
          <button
            type="button"
            key={q.key}
            className={`dayrange-chip${activeQuick === q.key ? " is-on" : ""}`}
            onClick={() => applyQuick(q)}
          >{q.label}</button>
        ))}
      </div>
      <div className="dayrange-months">
        {renderMonth(view, "left")}
        {renderMonth(shiftMonth(view, 1), "right")}
      </div>
      <span className="date-calendar-footer">
        {/* ผู้เรียกที่ไม่ได้ส่ง `markedDays` มา (เช่นแถบหัวหน้าภาพรวมซึ่งยังไม่มีข้อมูล
            ตอนวาดปุ่ม) ต้องไม่โฆษณาจุดที่ไม่มีอยู่จริง */}
        <span>
          {marked.size ? "จุดใต้วันที่ = วันที่มีลีดเข้า · " : ""}
          {pending ? "เลือกวันสุดท้าย" : "เลือกวันแรก"}
        </span>
        {pending && <button type="button" onClick={() => setPending(null)}>ยกเลิกที่เลือกค้าง</button>}
      </span>
    </div>
  ) : null;

  return (
    <span ref={rootRef} className={`dayrange ${className}`.trim()}>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <CalendarDays size={15} />
        <span>{label}</span>
        {dayCount > 0 && <span className="dayrange-count">({dayCount} วัน)</span>}
        <ChevronDown size={14} />
      </Button>
      {panel && createPortal(panel, document.body)}
    </span>
  );
}

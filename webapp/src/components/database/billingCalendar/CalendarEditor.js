"use client";
// ── ตารางรอบจ่ายรายปีของลูกค้า (ข้อ ② "ตามปฏิทินลูกค้า" · รุ่นห้า · มติเจ้าของ 29/09) ───────────────────────────────
//
// ม็อก: mockups/billing-cycle/calendar-v3/recommended.html (แบบที่กรรมการทั้งสองเลือก) — ตารางเดือน × รอบ (≤4) ช่องละคู่
//   ○ วันตัดรอบ (Cutoff) → ● วันจ่าย (Paydate) · แท็บปี (ปีนี้ · ปีหน้า "ยังไม่มี") · เดือนที่ผ่านแล้วพับไว้ ·
//   "ร่างจากรอบประจำ" ลงเฉพาะช่องว่าง · "ตรงกับรูป" รายเดือนก่อนบันทึก · ปฏิทินเล็ก อา–ส ใต้รูปของลูกค้า (แตะวัน = ใส่ช่องที่เลือก)
//   · จอกว้าง: ตาราง | รูป + ปฏิทินเล็ก (ตรึง) · ≤900: รูปอยู่หลังปุ่ม "รูปปฏิทิน" · ปฏิทินเล็กลงใต้เดือนที่กำลังกรอก ·
//   ≤640: เดือนละการ์ด
// ⭐ สถานะทั้งหมดเป็นของ lib/sales/billingCalendarEdit (CORE) — ไฟล์นี้วาด + ส่งการกดกลับ (`onUpdate(prev => next)`)
//    ห้ามแปลงข้อความ ⇄ วันที่เองที่นี่ (parse/วันข้ามเดือน/ด่านบันทึกอยู่ที่ lib ตัวเดียว — โมดัลกับ API ตัดสินด้วยตัวเดียวกัน)
// ⚠️ วันที่ในตาราง = วันจริงที่ลูกค้าประกาศ — ตรงเสาร์/อาทิตย์/วันหยุดในระบบ **เตือนอย่างเดียว ไม่เลื่อน** · ร่างที่ตกวันหยุด
//    มีชิปวันทำงานก่อน/หลังให้คน **เลือก**
// ⚠️ ไม่มี "ประมาณการ" (Q3 หยุดรอปฏิทินใหม่) — ปีที่ยังไม่มีปฏิทินเป็นตารางว่าง + คำ "ยังไม่มีปฏิทิน YYYY" ไม่ใช่ช่องเส้นประเดาวัน ·
//    รอบประจำใช้ร่างเท่านั้น ไม่เก็บ
// ⚠️ กริดเดือนมาจาก `ui/MonthGrid` ตัวเดียวของระบบ (monthGridSingleSource.test) — ที่นี่แค่ทำให้เล็กลงด้วยคลาส
import { useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, CalendarX2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, History, Image as ImageIcon,
  Info, Minus, Plus, TriangleAlert, WandSparkles, X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MonthGrid from "@/components/ui/MonthGrid";
import Segmented from "@/components/ui/Segmented";
import { NA } from "@/lib/format";
import { fmtDate } from "@/lib/sales/billingRule";
import { daysBetween, weekdayOf } from "@/lib/sales/billingRuleV4";
import {
  CALENDAR_WEEKDAY_HEADS, addCalendarRound, calendarCellInfo, calendarDraftPreview, calendarMonthGrid, calendarNextRunMonth,
  calendarPastMonths, calendarPatternOf, calendarRowWarnings, calendarYearRuns, calendarYearTabs, confirmCalendarMonth,
  draftCalendarFromPattern, fillCalendarCellFromDay, pickCalendarAlternative, removeCalendarRound, setCalendarCell, setCalendarFile,
} from "@/lib/sales/billingCalendarEdit";
import CalendarPicture from "./CalendarPicture";
import styles from "./CalendarEditor.module.css";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const KIND_WORD = { c: "วันตัดรอบ", p: "วันจ่าย" };
const cellKeyOf = (year, mi, ri, kind) => `${year}-${mi}-${ri}-${kind}`;
const yearOfIso = (iso) => Number(String(iso || "").slice(0, 4)) || null;
const shortDate = (iso) => fmtDate(iso, { withYear: false });

/* รอบประจำของแผงร่าง: ข้อความที่พิมพ์ → รูปของ draftCalendarFromPattern
   ⭐ ไม่มีค่าตั้งต้นของ "เดือนของวันจ่าย" เมื่อวันจ่ายอยู่หลังวันตัดรอบ (เดือนเดียวกันหรือเดือนถัดไปก็ได้) · วันจ่าย ≤ วันตัดรอบ =
      เดือนถัดไปทางเดียว (flow ตัดสิน) — ท่าเดียวกับข้อ ③ "ตามรอบจ่าย" ของโมดัล
   @returns `{ rounds, why }` — why = เหตุที่ยังร่างไม่ได้ */
export function patternRoundsOf(rows) {
  const rounds = [];
  for (const [i, row] of (rows || []).entries()) {
    const c = Number(row.c);
    const p = Number(row.p);
    if (!row.c && !row.p) continue;
    if (!Number.isInteger(c) || c < 1 || c > 31 || !Number.isInteger(p) || p < 1 || p > 31) return { rounds: [], why: `รอบ ${i + 1}: ใส่วันที่ 1–31 ทั้งสองช่อง` };
    if (p <= c) rounds.push({ cutoffDay: c, payDay: p, payMonthOffset: 1 });
    else if (row.off === 0 || row.off === 1) rounds.push({ cutoffDay: c, payDay: p, payMonthOffset: row.off });
    else return { rounds: [], why: `รอบ ${i + 1}: วันจ่ายเดือนเดียวกันหรือเดือนถัดไป — เลือกก่อน` };
  }
  return rounds.length ? { rounds, why: "" } : { rounds, why: "ใส่วันตัดรอบและวันจ่ายอย่างน้อยหนึ่งรอบ" };
}

/* ป้ายวันใต้ช่อง: "พฤ." + เดือน (ถ้าไม่ใช่เดือนแถว) — วันจ่ายข้ามเดือนต้องเห็นเดือนเสมอ */
function DayTag({ iso, rowYear, rowMonth }) {
  if (!iso) return <span className={styles.wd} aria-hidden="true">{" "}</span>;
  const [y, m] = iso.split("-").map(Number);
  const other = y !== rowYear || m !== rowMonth;
  return (
    <span className={styles.wd} aria-hidden="true">
      <span>{CALENDAR_WEEKDAY_HEADS[weekdayOf(iso)]}</span>
      {other ? <span className={styles.wdMonth}>{MONTHS[m - 1]}{y !== rowYear ? ` ${y}` : ""}</span> : null}
    </span>
  );
}

/**
 * @param state     สถานะตัวแก้ (calendarEditorOf) — ของโมดัล
 * @param onUpdate  `(fn: prev => next) => void` — ตัวปรับสถานะ (กดซ้อนกันไม่ทับกัน)
 * @param holidays  Map<iso, ชื่อ> (useHolidayMap) — คำเตือนเท่านั้น
 * @param initialYear  แท็บปีที่เปิดก่อน (การ์ด "ใส่ปฏิทิน 2027")
 */
export default function CalendarEditor({ state, onUpdate, todayIso, holidays = null, customerId, initialYear = null, flagged = false }) {
  const rootRef = useRef(null);
  const tabs = calendarYearTabs(state, todayIso);
  const thisYear = yearOfIso(todayIso);
  const pickInitial = () => {
    const wanted = Number(initialYear);
    if (wanted && tabs.some((t) => t.year === wanted)) return wanted;
    return tabs.find((t) => t.year === thisYear)?.year ?? tabs[0]?.year ?? thisYear;
  };
  const [year, setYear] = useState(pickInitial);
  const [target, setTarget] = useState(null);
  const [gridOff, setGridOff] = useState(0);
  const [showPast, setShowPast] = useState(false);
  const [picOpen, setPicOpen] = useState(false);
  const [draft, setDraft] = useState(null);         // null = ปิด · { rows: [{ c, p, off }], overwrite }
  const [notice, setNotice] = useState(null);       // { tone, text }

  const ys = state?.years?.[String(year)];
  const roundsN = state?.roundsN || 1;
  const pastN = calendarPastMonths(year, todayIso);
  const yearRuns = calendarYearRuns(state, year);
  const anyText = Boolean(ys?.cells.some((row) => row.some((cell) => cell.c || cell.p)));
  const nextRun = calendarNextRunMonth(state, todayIso);
  const fromMonth = pastN >= 12 ? 1 : pastN + 1;
  const warningsOf = (mi) => calendarRowWarnings(state, year, mi, { holidays });
  const blocking = (list) => list.some((w) => w.kind === "bad" || w.kind === "half" || w.kind === "draft");
  /* เดือนที่ผ่านแล้วพับไว้ — แต่ถ้ามีช่องผิด/ร่างที่ยังไม่เทียบ ต้องกางให้เห็น (ด่านบันทึกอ่านทุกเดือน ห้ามซ่อนเหตุที่บันทึกไม่ได้) */
  const pastIssue = Array.from({ length: pastN }, (_, mi) => blocking(warningsOf(mi))).some(Boolean);
  /* ปีที่ผ่านไปทั้งปี (แท็บ 2026 ตอน ม.ค. 2027) = กางทั้งปีเสมอ — พับหมดแล้วตารางว่างทั้งที่ท้ายตารางบอก "24 รอบ" และไม่มีปุ่มกาง
     (รอบ ธ.ค. ที่จ่าย ม.ค. ยังต้องแก้ได้) */
  const wholeYearPast = pastN >= 12;
  const pastOpen = showPast || pastIssue || wholeYearPast;

  const say = (tone, text) => setNotice(text ? { tone, text } : null);
  const focusCell = (key) => {
    const el = rootRef.current?.querySelector(`[data-cell="${key}"]`);
    if (el) el.focus();
  };

  const pickYear = (next) => {
    setYear(next);
    setTarget(null);
    setGridOff(0);
    setDraft(null);
    say(null, "");
  };

  const typeCell = (mi, ri, kind, text) => {
    onUpdate((prev) => setCalendarCell(prev, year, mi, ri, kind, text));
  };
  const focusTarget = (mi, ri, kind, info) => {
    setTarget({ year, mi, ri, kind });
    setGridOff(kind === "p" && info?.p?.rolled ? 1 : 0);
  };
  const cellKeyDown = (event, mi, ri) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (mi < 11) focusCell(cellKeyOf(year, mi + 1, ri, "c"));
  };

  /* แตะวันในปฏิทินเล็ก = ใส่ช่องที่เลือก แล้วชี้ช่องถัดไป (ไม่ยกโฟกัส — คีย์บอร์ดมือถือไม่เด้งบัง) */
  const tapDay = (iso) => {
    if (!target || target.year !== year) { say("warn", "แตะช่องในตารางก่อน แล้วแตะวันในปฏิทินเล็ก"); return; }
    const res = fillCalendarCellFromDay(state, target, iso);
    if (res.error) { say("warn", res.error); return; }
    onUpdate(() => res.state);
    say(null, "");
    setTarget(res.next);
    if (!res.next || res.next.mi !== target.mi) setGridOff(0);
  };

  const addRound = () => { onUpdate((prev) => addCalendarRound(prev)); say(null, ""); };
  const dropRound = () => {
    const res = removeCalendarRound(state);
    if (res.error) { say("warn", res.error); return; }
    onUpdate(() => res.state);
    say(null, "");
  };
  /* ปุ่มเพิ่ม/ลดคอลัมน์รอบ — หัวตาราง (จอกว้าง) กับแถบใต้การ์ด (≤640) ใช้ชุดเดียวกัน */
  const roundActs = (
    <>
      {roundsN < 4 ? <Button variant="quiet" size="sm" icon={<Plus size={13} aria-hidden="true" />} onClick={addRound}>รอบ {roundsN + 1}</Button> : null}
      {roundsN > 1 ? <Button variant="quiet" size="sm" icon={<Minus size={13} aria-hidden="true" />} aria-label={`เอาคอลัมน์รอบ ${roundsN} ออก`} onClick={dropRound}>รอบ {roundsN}</Button> : null}
    </>
  );

  /* ── แผงร่างจากรอบประจำ ── */
  const openDraft = () => {
    if (draft) { setDraft(null); return; }
    const base = calendarPatternOf(state, year);
    const rows = base?.length
      ? base.map((r) => ({ c: String(r.cutoffDay), p: String(r.payDay), off: r.payMonthOffset }))
      : [{ c: "", p: "", off: null }];
    setDraft({ rows, overwrite: false });
    say(null, "");
  };
  const patchDraftRow = (i, patch) => setDraft((prev) => ({ ...prev, rows: prev.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const pattern = draft ? patternRoundsOf(draft.rows) : null;
  const draftOpts = { holidays, fromMonth, overwrite: Boolean(draft?.overwrite) };
  const draftSummary = pattern && !pattern.why ? calendarDraftPreview(state, year, pattern.rounds, draftOpts) : null;
  const applyDraft = () => {
    if (!pattern || pattern.why) { say("warn", pattern?.why || "ใส่รอบประจำก่อน"); return; }
    const res = draftCalendarFromPattern(state, year, pattern.rounds, draftOpts);
    if (res.error) { say("warn", res.error); return; }
    onUpdate(() => res.state);
    setDraft(null);
    say("info", res.filled
      ? `ร่างลงตาราง ${res.filled} คู่ — เทียบกับรูปทีละเดือน แก้เฉพาะวันที่ต่าง แล้วแตะ "ตรงกับรูป"`
      : "ไม่มีช่องว่างให้ร่าง — ถ้าจะร่างทับวันที่มีอยู่ เลือก \"ทับทั้งปี\"");
  };

  /* ── ปฏิทินเล็ก (เดือนของช่องที่เลือก · วันจ่ายข้ามเดือน = เลื่อนไปเดือนถัดไปได้) ── */
  const gridMonth = (() => {
    if (target && target.year === year) return target.mi + 1 + gridOff;
    if (nextRun && nextRun.year === year) return nextRun.mi + 1;
    return year === thisYear ? Math.min(12, pastN + 1) : 1;
  })();
  const grid = calendarMonthGrid(state, year, gridMonth, { holidays, todayIso });
  const marks = new Map(grid.weeks.flat().filter((d) => d?.mark).map((d) => [d.iso, d.mark]));
  const miniGrid = (
    <div className={styles.mini}>
      <div className={styles.miniHead}>
        <b>{grid.title}</b>
        <small>
          {target && target.year === year
            ? <>แตะวันเพื่อใส่ <b>{target.kind === "c" ? "○ วันตัดรอบ" : "● วันจ่าย"} รอบ {target.ri + 1}</b> ของ {MONTHS[target.mi]}</>
            : "แตะช่องในตารางก่อน แล้วแตะวันตรงนี้"}
        </small>
        {target && target.year === year && target.kind === "p" ? (
          <span className={styles.miniNav}>
            <Button variant="quiet" size="sm" iconOnly aria-label="เดือนของแถว" aria-pressed={gridOff === 0} onClick={() => setGridOff(0)} icon={<ChevronLeft size={14} aria-hidden="true" />} />
            <Button variant="quiet" size="sm" iconOnly aria-label="เดือนถัดไป (วันจ่ายข้ามเดือน)" aria-pressed={gridOff === 1} onClick={() => setGridOff(1)} icon={<ChevronRight size={14} aria-hidden="true" />} />
          </span>
        ) : null}
      </div>
      <MonthGrid
        className={styles.miniGrid}
        year={grid.year}
        month={grid.month - 1}
        todayISO={todayIso}
        showHolidayName={false}
        holidayOf={(iso) => (holidays?.has?.(iso) ? holidays.get(iso) || "" : undefined)}
        onDayClick={tapDay}
        dayLabel={(ctx) => {
          const mark = marks.get(ctx.iso);
          return [
            fmtDate(ctx.iso),
            mark ? `${KIND_WORD[mark.kind]} รอบ ${mark.ri + 1}${mark.draft ? " (ร่าง)" : ""}` : "",
            ctx.isHoliday ? `วันหยุดในระบบ${ctx.holidayName ? ` (${ctx.holidayName})` : ""}` : ctx.isWeekend ? "เสาร์/อาทิตย์" : "",
          ].filter(Boolean).join(" · ");
        }}
      >
        {(ctx) => {
          const mark = marks.get(ctx.iso);
          return mark ? <i className={styles.mk} data-kind={mark.kind} data-draft={mark.draft ? "1" : undefined} aria-hidden="true" /> : null;
        }}
      </MonthGrid>
      <p className={styles.miniKey}>
        <span><i className={styles.mk} data-kind="c" aria-hidden="true" />วันตัดรอบ</span>
        <span><i className={styles.mk} data-kind="p" aria-hidden="true" />วันจ่าย</span>
        <span>พื้นเทา = เสาร์/อาทิตย์ · พื้นแดงอ่อน = วันหยุดในระบบ — ระบบไม่เลื่อนวัน</span>
      </p>
    </div>
  );

  /* ── แถวเดือน ── */
  const unchecked = ys?.unchecked || [];
  const badCount = Array.from({ length: 12 }, (_, mi) => warningsOf(mi).filter((w) => w.kind === "bad" || w.kind === "half").length).reduce((a, b) => a + b, 0);
  const renderWarnings = (mi, list, isNext) => {
    const out = [];
    if (isNext) out.push(<span key="next" className={styles.flag} data-tone="next"><ArrowRight size={11} aria-hidden="true" />รอบถัดไป</span>);
    list.forEach((w, i) => {
      const key = `${w.kind}-${w.ri ?? "m"}-${w.field ?? ""}-${i}`;
      if (w.kind === "draft") {
        out.push(
          <span key={key} className={styles.check}>
            <span className={styles.flag} data-tone="draft"><WandSparkles size={11} aria-hidden="true" />{w.text}</span>
            <Button size="sm" tone="neutral" onClick={() => onUpdate((prev) => confirmCalendarMonth(prev, year, mi))}>ตรงกับรูป</Button>
          </span>,
        );
      } else if (w.kind === "alt") {
        out.push(
          <span key={key} className={styles.alt}>
            <TriangleAlert size={12} aria-hidden="true" />
            <span>{w.text}</span>
            <span className={styles.altChips}>
              {[w.before, w.after].filter(Boolean).map((iso) => (
                <button key={iso} type="button" className="choice-chip" onClick={() => onUpdate((prev) => pickCalendarAlternative(prev, year, mi, w.ri, w.field, iso))}>
                  {shortDate(iso)}
                </button>
              ))}
            </span>
          </span>,
        );
      } else {
        const tone = w.kind === "bad" ? "bad" : w.kind === "holiday" ? "hol" : "warn";
        out.push(
          <span key={key} className={styles.flag} data-tone={tone}>
            {w.kind === "bad" ? <CircleAlert size={11} aria-hidden="true" /> : <TriangleAlert size={11} aria-hidden="true" />}
            {w.text}
          </span>,
        );
      }
    });
    return out.length ? out : <span className={styles.none}>{NA}</span>;
  };

  const rows = [];
  for (let mi = 0; mi < 12; mi += 1) {
    if (mi < pastN && !pastOpen) continue;
    const m = mi + 1;
    const list = warningsOf(mi);
    const isNext = Boolean(nextRun && nextRun.year === year && nextRun.mi === mi);
    const focused = target && target.year === year && target.mi === mi;
    rows.push(
      <div
        key={mi}
        className={styles.row}
        role="group"
        aria-label={`${MONTHS[mi]} ${year}`}
        data-past={mi < pastN ? "1" : undefined}
        data-next={isNext ? "1" : undefined}
        data-focus={focused ? "1" : undefined}
      >
        <div className={styles.month}><b>{MONTHS[mi]}</b><small>{mi < pastN ? "ผ่านแล้ว" : year}</small></div>
        {Array.from({ length: roundsN }, (_, ri) => {
          const info = calendarCellInfo(state, year, mi, ri);
          const gap = info.c.iso && info.p.iso ? daysBetween(info.c.iso, info.p.iso) : null;
          const cell = (kind) => {
            const key = cellKeyOf(year, mi, ri, kind);
            const r = info[kind];
            const drafted = Boolean(ys?.draft.includes(`${mi}-${ri}-${kind}`));
            const isTarget = target && target.year === year && target.mi === mi && target.ri === ri && target.kind === kind;
            return (
              <label className={styles.cell} data-kind={kind} data-draft={drafted ? "1" : undefined} data-target={isTarget ? "1" : undefined}>
                <i className={kind === "c" ? styles.dotBill : styles.dotDue} aria-hidden="true" />
                <Input
                  data-cell={key}
                  className={styles.cellInput}
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="off"
                  maxLength={5}
                  invalid={Boolean(r.err)}
                  value={info.cell[kind]}
                  aria-label={`${KIND_WORD[kind]} รอบ ${ri + 1} ${MONTHS[mi]} ${year}${r.iso ? ` · ${fmtDate(r.iso)}` : ""}${drafted ? " · ร่าง" : ""}${r.err ? ` · ${r.err}` : ""}`}
                  onChange={(event) => typeCell(mi, ri, kind, event.target.value)}
                  onFocus={() => focusTarget(mi, ri, kind, info)}
                  onKeyDown={(event) => cellKeyDown(event, mi, ri)}
                />
                <DayTag iso={r.iso} rowYear={year} rowMonth={m} />
              </label>
            );
          };
          return (
            <div key={ri} className={styles.run}>
              <span className={styles.runNo}>รอบ {ri + 1}</span>
              {cell("c")}
              <span className={styles.gap} aria-hidden="true"><small>{gap !== null ? `${gap} วัน` : " "}</small><i /></span>
              {cell("p")}
            </div>
          );
        })}
        <div className={styles.flags}>{renderWarnings(mi, list, isNext)}</div>
        {focused ? <div className={styles.inlineGrid}>{miniGrid}</div> : null}
      </div>,
    );
  }

  const tabOptions = tabs.map((t) => ({
    value: t.year,
    ariaLabel: t.has ? `ปฏิทิน ${t.year} · ${t.count} รอบ` : `ปฏิทิน ${t.year} ยังไม่มี`,
    label: <span className={styles.yearTab}>{t.year}<small data-miss={t.has ? undefined : "1"}>{t.has ? `${t.count} รอบ` : "ยังไม่มี"}</small></span>,
  }));
  const future = thisYear !== null && year > thisYear;

  return (
    <div className={styles.cal} ref={rootRef} data-flag={flagged ? "1" : undefined}>
      <div className={styles.top}>
        <Segmented className={styles.years} ariaLabel="ปีของปฏิทิน" options={tabOptions} value={year} onChange={pickYear} />
        <div className={styles.topActs}>
          <Button size="sm" tone="neutral" icon={<WandSparkles size={14} aria-hidden="true" />} aria-expanded={Boolean(draft)} onClick={openDraft}>
            {draft ? "ปิดแผงร่าง" : `ร่าง ${year} จากรอบประจำ`}
          </Button>
          <Button size="sm" variant="quiet" className={styles.picToggle} icon={<ImageIcon size={14} aria-hidden="true" />} aria-expanded={picOpen} onClick={() => setPicOpen((v) => !v)}>
            {picOpen ? "ซ่อนรูปปฏิทิน" : "รูปปฏิทิน"}
          </Button>
        </div>
      </div>

      {draft ? (
        <div className={styles.tool}>
          <div className={styles.toolHead}>
            <h5><WandSparkles size={14} aria-hidden="true" />รอบประจำของลูกค้า · ร่างปี {year}</h5>
            <Button variant="quiet" size="sm" iconOnly aria-label="ปิดแผงร่าง" onClick={() => setDraft(null)} icon={<X size={14} aria-hidden="true" />} />
          </div>
          <p className={styles.toolHint}>
            ใส่ &quot;ราว ๆ วันที่&quot; ของแต่ละรอบ · ร่างแล้วเทียบกับรูปทีละเดือน แก้เฉพาะวันที่ต่าง แล้วแตะ <b>ตรงกับรูป</b> ·
            รอบประจำใช้ร่างเท่านั้น — ไม่เก็บ ไม่ใช้คิดวันของปีที่ยังไม่มีปฏิทิน
          </p>
          <div className={styles.draftRows}>
            {draft.rows.map((row, i) => {
              const forced = Number(row.p) && Number(row.c) && Number(row.p) <= Number(row.c);
              return (
                <div key={i} className={styles.draftRow}>
                  <span className={styles.draftNo}>รอบ {i + 1}</span>
                  <label><i className={styles.dotBill} aria-hidden="true" />ตัดรอบ
                    <Input className={styles.dayInput} inputMode="numeric" autoComplete="off" maxLength={2} value={row.c} aria-label={`วันตัดรอบ รอบ ${i + 1}`} onChange={(e) => patchDraftRow(i, { c: e.target.value.replace(/\D/g, "") })} />
                  </label>
                  <ArrowRight size={13} aria-hidden="true" />
                  <label><i className={styles.dotDue} aria-hidden="true" />วันจ่าย
                    <Input className={styles.dayInput} inputMode="numeric" autoComplete="off" maxLength={2} value={row.p} aria-label={`วันจ่าย รอบ ${i + 1}`} onChange={(e) => patchDraftRow(i, { p: e.target.value.replace(/\D/g, "") })} />
                  </label>
                  <Segmented
                    className={styles.miniSeg}
                    ariaLabel={`เดือนของวันจ่าย รอบ ${i + 1}`}
                    options={[
                      { value: 0, label: "เดือนเดียวกัน", disabled: Boolean(forced), title: forced ? "วันจ่ายไม่อยู่หลังวันตัดรอบ — เดือนถัดไปเท่านั้น" : undefined },
                      { value: 1, label: "เดือนถัดไป" },
                    ]}
                    value={forced ? 1 : row.off}
                    onChange={(off) => patchDraftRow(i, { off })}
                  />
                  {draft.rows.length > 1 ? (
                    <Button variant="quiet" size="sm" iconOnly aria-label={`เอารอบ ${i + 1} ออกจากรอบประจำ`} onClick={() => setDraft((prev) => ({ ...prev, rows: prev.rows.filter((_, j) => j !== i) }))} icon={<X size={13} aria-hidden="true" />} />
                  ) : null}
                </div>
              );
            })}
            {draft.rows.length < 4 ? (
              <Button variant="quiet" size="sm" className={styles.draftAdd} icon={<Plus size={13} aria-hidden="true" />} onClick={() => setDraft((prev) => ({ ...prev, rows: [...prev.rows, { c: "", p: "", off: null }] }))}>
                เพิ่มรอบ
              </Button>
            ) : null}
          </div>
          <Segmented
            className={styles.modeSeg}
            ariaLabel="ร่างลงที่ไหน"
            options={[
              { value: false, label: "ลงเฉพาะช่องที่ว่าง" },
              { value: true, label: fromMonth > 1 ? `ทับตั้งแต่ ${MONTHS[fromMonth - 1]} ${year}` : `ทับทั้งปี ${year}` },
            ]}
            value={Boolean(draft.overwrite)}
            onChange={(overwrite) => setDraft((prev) => ({ ...prev, overwrite }))}
          />
          <div className={styles.toolAct}>
            <p className={styles.toolHint} aria-live="polite">{pattern?.why || draftSummary?.text || ""}</p>
            <Button tone="neutral" icon={<ArrowDownToLine size={14} aria-hidden="true" />} onClick={applyDraft}>ร่างลงตาราง</Button>
          </div>
        </div>
      ) : null}

      {!anyText && !draft ? (
        <div className={styles.empty} data-tone={future ? "missing" : "start"}>
          <strong>{future ? <CalendarX2 size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}{future ? `ยังไม่มีปฏิทิน ${year}` : `กรอกปฏิทิน ${year}`}</strong>
          <p>
            {future
              ? `ระบบไม่เดาวันของปีที่ยังไม่มีปฏิทิน — งวดที่เลยปฏิทินที่มี ยังไม่มีกำหนดชำระ ใส่วันเองบนใบ SO ได้ · ได้ปฏิทิน ${year} จากลูกค้าเมื่อไร กรอกที่นี่ แล้วระบบเสนอวันให้ยืนยันทีละงวด`
              : "พิมพ์เลขวันลงตาราง (Tab = ช่องถัดไป · Enter = เดือนถัดไป · 5/1 = 5 ม.ค.) หรือแตะวันในปฏิทินเล็ก · หรือร่างจากรอบประจำแล้วแก้เฉพาะวันที่ต่างจากรูป · เดือนที่ผ่านแล้วไม่ต้องกรอก"}
          </p>
        </div>
      ) : null}

      <p className={styles.legend}>
        <span><i className={styles.dotBill} aria-hidden="true" /><b>วันตัดรอบ (Cutoff)</b> บัญชีลูกค้ารับเอกสารถึงวันนี้</span>
        <span><i className={styles.dotDue} aria-hidden="true" /><b>วันจ่าย (Paydate)</b></span>
        <span className={styles.kbd}>เลขน้อยกว่าวันตัดรอบ = เดือนถัดไป · 5/1 = 5 ม.ค. ปีถัดไป</span>
      </p>

      {notice ? (
        <p className={styles.notice} data-tone={notice.tone} role="status">
          {notice.tone === "warn" ? <TriangleAlert size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          <span>{notice.text}</span>
        </p>
      ) : null}

      <div className={styles.body}>
        <div className={styles.tableCol}>
          {pastN > 0 ? (
            <div className={styles.pastBar}>
              <span><History size={13} aria-hidden="true" />{MONTHS[0]}{pastN > 1 ? `–${MONTHS[pastN - 1]}` : ""} {year} ผ่านแล้ว · ไม่กรอกก็บันทึกได้ (ไม่มีผลกับงวดใหม่)</span>
              {pastIssue ? <small>มีช่องที่ต้องแก้ — กางไว้ให้</small> : wholeYearPast ? <small>ทั้งปีผ่านแล้ว — แก้ได้ถ้าวันไม่ตรงกับรูป</small> : (
                <Button variant="quiet" size="sm" icon={showPast ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />} onClick={() => setShowPast((v) => !v)}>
                  {showPast ? "ซ่อน" : `แสดง ${pastN} เดือน`}
                </Button>
              )}
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <div className={styles.table} data-runs={roundsN}>
              <div className={styles.head}>
                <div>เดือน</div>
                {Array.from({ length: roundsN }, (_, ri) => (
                  <div key={ri} className={styles.headRun}>
                    <b>รอบ {ri + 1}</b>
                    <span><i className={styles.dotBill} aria-hidden="true" />ตัดรอบ → <i className={styles.dotDue} aria-hidden="true" />วันจ่าย</span>
                  </div>
                ))}
                <div className={styles.headFlags}>
                  <span>ตรวจกับรูป · คำเตือน</span>
                  <span className={styles.headActs}>{roundActs}</span>
                </div>
              </div>
              {rows}
            </div>
          </div>
          {/* ≤640 หัวตารางซ่อน (เดือนละการ์ด) — ปุ่มเพิ่ม/ลดคอลัมน์รอบย้ายมาอยู่ใต้การ์ด ไม่งั้นมือถือเพิ่ม/ลดรอบไม่ได้ */}
          <div className={styles.roundActs}>
            <span>รอบต่อเดือน <b>{roundsN}</b></span>
            {roundActs}
          </div>
          <p className={styles.foot}>
            <span><b>{yearRuns.length}</b> รอบในปี {year}</span>
            {unchecked.length ? <span data-tone="warn"><WandSparkles size={12} aria-hidden="true" />ร่างที่ยังไม่ได้เทียบ <b>{unchecked.length}</b> เดือน</span> : null}
            {badCount ? <span data-tone="bad"><CircleAlert size={12} aria-hidden="true" /><b>{badCount}</b> ช่องที่ต้องแก้</span> : null}
            <span>ตรงเสาร์/อาทิตย์/วันหยุด = เตือนอย่างเดียว ระบบไม่เลื่อนวัน</span>
          </p>
        </div>

        <aside className={styles.side} data-open={picOpen ? "1" : undefined} aria-label={`รูปปฏิทิน ${year} ของลูกค้า และปฏิทินเล็ก`}>
          <CalendarPicture
            key={year}
            customerId={customerId}
            year={year}
            fileId={ys?.fileId || ""}
            onFile={(id) => onUpdate((prev) => setCalendarFile(prev, year, id))}
          />
          <div className={styles.sideGrid}>{miniGrid}</div>
        </aside>
      </div>
    </div>
  );
}

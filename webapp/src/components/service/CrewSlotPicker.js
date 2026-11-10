"use client";
// ── ตัวเลือกวัน + ช่าง แบบตาราง ช่าง × เวลา (P2 · มติเจ้าของ 10/11/2026 · แบบ ก) ───────────────────────────────
//
// ⭐ คำถามของช่องนี้คือ **"ใครไปวันไหนกี่โมง"** ในจังหวะเดียว — แทน DateInput + TimeInput คู่ + CrewLoadPicker
//    ม็อกฉบับสุดท้าย Final.dc.html / FinalPhone.dc.html (artifact MwnHQt5ELdwgnwAz6YwRjC) · มติ docs/ts-crew-slot-picker.md
//    · แถบวัน 14 วัน "ว่าง n/m" · ★ วันที่ฝ่ายขายขอ · อาทิตย์ = นอกเวลาทำการ (ยังกดได้)
//    · ตาราง 24 ชม. แถวละช่าง จัดกลุ่มตามทีม · เปิดมาที่ช่วงทำงานของวัน · ปุ่มเลื่อนบอกว่ามีงานนอกจอทางไหน
//    · ลากบนแถว = เลือกคน + เวลา (ปัด 30 นาที) · คลิกช่องเดียว = ยาวเท่าที่ฝ่ายขายขอ · พิมพ์เวลาเองได้ทุกนาที
//    · จอมือถือ (≤ 680px) = รายชื่อ ว่างช่วงนี้ก่อน + แถบวันย่อ 24 ชม. + ปุ่มช่วงเวลาสำเร็จรูป
// ⚠️ ทุกอย่างที่วาดมาจาก `crewSlotView` (lib/service/crewSlotView.js) — ไฟล์นี้วาดกับรับเมาส์/นิ้วอย่างเดียว
// ⚠️ ตำแหน่งเป็น `data-col`/`data-span` (ช่อง 15 นาที) ที่ CSS แปลงเป็น grid-column — ไม่มี inline style (audit:ui)
// ⚠️ ทับ / เกินภาระ / นอกช่วงไซต์ / นอกเวลาทำการ = **เตือน ไม่ห้าม** (กติกาเดิมของ TS)
// ⭐ คีย์บอร์ด/โปรแกรมอ่านจอ: แถวช่างเป็น radio จริงชื่อกลุ่มเดียว · เวลาเป็น TimeInput · วันเป็นปุ่ม —
//    การลากเป็นทางลัดเพิ่ม ไม่ใช่ทางเดียว (ตัวตารางจึง aria-hidden)
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMediaQuery } from "@/lib/ui/useMediaQuery";
import { NA, fmtDayMonth, naText } from "@/lib/format";
import {
  DAY_MINUTES, clickSlot, dayStripCounts, dragToSlot, slotScrollStart, slotTimes, snapDown,
} from "@/lib/service/crewSlotGrid";
import {
  crewSlotView, minuteAt, offscreenText, placeOf, slotPresets, slotStripDays, valueSlot,
} from "@/lib/service/crewSlotView";
import styles from "./CrewSlotPicker.module.css";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const PHONE_QUERY = "(max-width: 680px)";
/* ขยับเกินนี้ (px) = ลาก ไม่ใช่คลิก */
const DRAG_SLOP = 6;

export default function CrewSlotPicker({
  technicians = [],
  /* ก้อนภาระดิบ `{ status, visits, workload, closedSince, teams, members }` (`useCrewLoadData`) */
  load = null,
  /* `{ date, startTime, endTime, assigneeId }` */
  value = {},
  onChange,
  /* ที่ฝ่ายขายขอ (`askedSlot`) · null = ไม่มี */
  asked = null,
  /* ไซต์ `{ accessFrom, accessTo, accessDays }` · null = ไม่รู้ */
  site = null,
  siteLoad = null,
  excludeVisitId = null,
  allowUnassigned = false,
  currentName = "",
  rosterState = "ready",
  currentLength = null,
  todayIso = "",
  labelledBy,
  disabled = false,
  /* ข้อความที่ผู้เรียกเลื่อนเวลาให้เอง (เช่น เลื่อนตามไซต์) — บอกตรง ๆ ว่าไม่ใช่เวลาที่ขอ */
  note = "",
  /* นัดที่เก็บได้แค่เวลาเริ่ม (ลงคิวประเมิน · `committedDueTime`) — คลิก/ลาก = เวลาเริ่ม · ไม่มีช่องเวลาจบ */
  startOnly = false,
  /* ป้ายของแถว "ที่ขอ" บนหัวตาราง — ใบติดตั้ง = ฝ่ายขายขอ · ใบประเมิน = ผู้ขอต้องการ · ไม่มีที่ขอ = ไม่มีแถว */
  askedLabel = "ฝ่ายขายขอ",
  /* ที่ยึดของตัวพาโฟกัส (`focusFieldBox`) — กลุ่มปุ่มวัน / กลุ่มแถวช่าง (ลิงก์แก้บนแผงด่าน ③ ④) */
  dayRef = null,
  crewRef = null,
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const group = useId();
  const view = useMemo(() => crewSlotView({
    technicians, load, value, asked, site, siteLoad, excludeVisitId, allowUnassigned, currentName, rosterState, currentLength, startOnly,
  }), [technicians, load, value, asked, site, siteLoad, excludeVisitId, allowUnassigned, currentName, rosterState, currentLength, startOnly]);
  const strip = useMemo(
    () => slotStripDays(todayIso, { askedDate: asked?.date || null, value: value?.date || null }),
    [todayIso, asked, value?.date],
  );
  const counts = useMemo(() => {
    if (load?.status !== "ok") return null;
    const list = dayStripCounts({ visits: load.visits, technicians, dates: strip.days.map((d) => d.date), excludeVisitId });
    return new Map(list.map((c) => [c.date, c]));
  }, [load, technicians, strip, excludeVisitId]);

  const emit = (patch) => onChange?.({ ...value, ...patch });
  const pick = (assigneeId, slot) => emit({
    ...(assigneeId != null ? { assigneeId } : {}),
    ...(startOnly ? { startTime: slotTimes(slot).startTime, endTime: "" } : slotTimes(slot)),
  });

  if (view.roster.state !== "ready") {
    return <p className={styles.roster} role={view.roster.state === "error" ? "alert" : undefined}>{view.roster.text}</p>;
  }

  return (
    <div className={styles.picker} data-invalid={view.invalid ? "1" : undefined}>
      <div className={styles.head}>
        <span>{view.hint}</span>
        {view.head.aside ? <span className={styles.aside} data-tone={view.head.asideTone || undefined}>{view.head.aside}</span> : null}
      </div>

      <DayStrip days={strip.days} value={value?.date || ""} counts={counts} disabled={disabled} todayIso={todayIso} dayRef={dayRef} onPick={(date) => emit({ date })} />

      {view.notice ? <p className={styles.notice}>{view.notice}</p> : null}

      {phone ? (
        <PhoneList view={view} value={value} asked={asked} site={site} currentLength={currentLength} startOnly={startOnly} group={group} labelledBy={labelledBy} disabled={disabled} emit={emit} pick={pick} crewRef={crewRef} />
      ) : (
        <Board view={view} value={value} asked={asked} askedLabel={askedLabel} currentLength={currentLength} startOnly={startOnly} group={group} labelledBy={labelledBy} disabled={disabled} emit={emit} pick={pick} crewRef={crewRef} />
      )}

      <Summary view={view} value={value} startOnly={startOnly} disabled={disabled} emit={emit} note={note} />
    </div>
  );
}

/* ── แถบวัน ───────────────────────────────────────────────────────────────────────────── */
function DayStrip({ days, value, counts, disabled, todayIso, dayRef, onPick }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className={styles.strip}>
      <div className={styles.days} role="group" aria-label="วันนัด" ref={dayRef}>
        {days.map((day) => {
          const c = counts?.get(day.date) || null;
          const label = [
            `${day.weekdayText} ${fmtDayMonth(day.date)}`,
            day.asked ? "วันที่ฝ่ายขายขอ" : null,
            day.workday ? null : "นอกเวลาทำการ",
            c ? `ว่าง ${c.free} จาก ${c.total} คน` : "ยังไม่รู้ภาระ",
          ].filter(Boolean).join(" · ");
          const fill = c && c.total ? Math.round((c.free / c.total) * 10) : 0;
          return (
            <button
              key={day.date}
              type="button"
              className={styles.day}
              aria-pressed={day.date === value}
              aria-label={label}
              title={label}
              data-off={day.workday ? undefined : "1"}
              data-today={day.today ? "1" : undefined}
              data-asked={day.asked ? "1" : undefined}
              disabled={disabled}
              onClick={() => { setPicking(false); onPick(day.date); }}
            >
              <span className={styles.dayWeek}>{day.today ? "วันนี้" : day.weekdayText}{day.asked ? " ★" : ""}</span>
              <span className={styles.dayDate}>{fmtDayMonth(day.date)}</span>
              <span className={styles.meter} aria-hidden="true"><i data-fill={fill} data-low={c && c.free <= 2 ? "1" : undefined} /></span>
              <span className={styles.dayFree}>{c ? `ว่าง ${c.free}/${c.total}` : NA}</span>
            </button>
          );
        })}
        <button type="button" className={`${styles.day} ${styles.dayMore}`} aria-expanded={picking} disabled={disabled} onClick={() => setPicking((open) => !open)}>
          <CalendarDays size={15} aria-hidden="true" />
          <span>วันอื่น</span>
        </button>
      </div>
      {picking ? (
        <div className={styles.otherDay}>
          <span>เลือกวันที่ไกลกว่า 2 สัปดาห์</span>
          <DateInput
            value={value || ""}
            onChange={(date) => { if (date) { onPick(date); setPicking(false); } }}
            min={todayIso || undefined}
            disabled={disabled}
            ariaLabel="วันนัด"
            weekday
          />
        </div>
      ) : null}
    </div>
  );
}

/* ── จอกว้าง: ตาราง 24 ชม. ────────────────────────────────────────────────────────────── */
function Board({ view, value, asked, askedLabel, currentLength, startOnly, group, labelledBy, disabled, emit, pick, crewRef }) {
  const scrollRef = useRef(null);
  const cornerRef = useRef(null);
  const dragRef = useRef(null);
  const [win, setWin] = useState({ from: 0, to: DAY_MINUTES });
  const askedHere = asked && asked.date === value?.date ? asked : null;
  const clickOpts = { asked, currentLength };

  const visibleWidth = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    return Math.max(0, el.clientWidth - (cornerRef.current?.offsetWidth || 0));
  };
  const readWindow = () => {
    const el = scrollRef.current;
    if (!el) return;
    /* แถวกว้าง 1 px ต่อนาที ⇒ scrollLeft = นาทีแรกที่เห็นถัดจากคอลัมน์ชื่อ (ชื่อติดซ้ายแบบ sticky) */
    setWin({ from: Math.round(el.scrollLeft), to: Math.min(DAY_MINUTES, Math.round(el.scrollLeft + visibleWidth())) });
  };

  /* เปิดมา / เปลี่ยนวัน = เลื่อนไปช่วงทำงานของวันนั้น (มติ 10/11) · ช่วงที่เลือกอยู่นอกจอ = เลื่อนไปหาช่วงนั้นแทน */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let target = slotScrollStart({ rows: view.rows, asked: askedHere });
    const sel = view.selection;
    const width = visibleWidth();
    if (sel && (sel.start < target || sel.end > target + width)) target = Math.max(0, Math.floor((sel.start - 60) / 60) * 60);
    el.scrollLeft = target;
    readWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เลื่อนเฉพาะตอนเปลี่ยนวัน ไม่ใช่ทุกครั้งที่ลาก
  }, [value?.date]);

  const scrollStep = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, Math.round(visibleWidth() * 0.75)), behavior: "smooth" });
  };

  const down = (event, rowId) => {
    if (disabled || event.button > 0) return;
    const lane = event.currentTarget;
    const minute = minuteAt(event.clientX, lane.getBoundingClientRect());
    dragRef.current = { rowId, anchor: minute, x: event.clientX, moved: false, touch: event.pointerType === "touch" };
    /* นิ้ว = ไม่จับ pointer — ให้เบราว์เซอร์เลื่อนตารางได้ · แตะเฉย ๆ = คลิก */
    if (event.pointerType !== "touch") {
      event.preventDefault();
      lane.setPointerCapture?.(event.pointerId);
    }
  };
  const move = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.touch) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < DRAG_SLOP) return;
    drag.moved = true;
    const minute = minuteAt(event.clientX, event.currentTarget.getBoundingClientRect());
    pick(drag.rowId, dragToSlot(drag.anchor, minute));
  };
  const up = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.touch && Math.abs(event.clientX - drag.x) >= DRAG_SLOP) return;
    /* รู้แค่เวลาเริ่ม = คลิกตรงไหนเริ่มตรงนั้น (ไม่มีความยาวที่ขอให้ยึด) */
    if (!drag.moved) pick(drag.rowId, startOnly ? { start: snapDown(drag.anchor), end: snapDown(drag.anchor) + 30 } : clickSlot(drag.anchor, clickOpts));
  };
  const cancel = () => { dragRef.current = null; };

  const off = offscreenText(view.overview.jobs, { ...win, selection: view.selection });
  const frame = placeOf(win.from, win.to);
  const work = view.tracks.work;

  const lane = (row) => (
    <div
      className={`${styles.lane} ${styles.g}`}
      data-pick={disabled ? undefined : "1"}
      aria-hidden="true"
      onPointerDown={row ? (event) => down(event, row.id) : undefined}
      onPointerMove={row ? move : undefined}
      onPointerUp={row ? up : undefined}
      onPointerCancel={row ? cancel : undefined}
    >
      {work ? <span className={styles.work} data-col={work.col} data-span={work.span} /> : null}
      {(row?.blocks || []).map((b) => (
        <span key={b.key} className={styles.block} data-kind={b.kind} data-night={b.night ? "1" : undefined} data-col={b.col} data-span={b.span} title={b.title}>
          <b>{b.code}</b>
          <span>{b.time}</span>
        </span>
      ))}
      {row?.selected && view.selection ? (
        <span className={styles.sel} data-col={view.selection.col} data-span={view.selection.span}>
          <span>{view.selection.text}</span>
        </span>
      ) : null}
    </div>
  );

  return (
    <div className={styles.boardWrap}>
      <div className={styles.legend} aria-hidden="true">
        <span><i data-kind="live" />นัดบนตาราง</span>
        <span><i data-kind="reserved" />จองไว้ · รอฝ่ายขายคอนเฟิร์ม</span>
        <span><i data-kind="assist" />ไปช่วยคนอื่น</span>
        <span><i data-kind="night" />งานนอกเวลา</span>
        <span><i data-kind="off" />นอกเวลาทำการ จ–ส 08:30–17:30 (ยังเลือกได้)</span>
        <span><i data-kind="sel" />ช่วงที่เลือก</span>
      </div>

      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} data-flag={off.prev.flagged ? "1" : undefined} disabled={off.prev.disabled} onClick={() => scrollStep(-1)}>
          {off.prev.text}
        </button>
        <div className={`${styles.overview} ${styles.g}`} aria-hidden="true">
          {work ? <span className={styles.ovWork} data-col={work.col} data-span={work.span} /> : null}
          {view.overview.jobs.map((j) => <span key={j.key} className={styles.ovJob} data-night={j.night ? "1" : undefined} data-col={j.col} data-span={j.span} />)}
          {view.selection ? <span className={styles.ovSel} data-col={view.selection.col} data-span={view.selection.span} /> : null}
          <span className={styles.ovFrame} data-col={frame.col} data-span={frame.span} />
        </div>
        <button type="button" className={styles.navBtn} data-flag={off.next.flagged ? "1" : undefined} disabled={off.next.disabled} onClick={() => scrollStep(1)}>
          {off.next.text}
        </button>
      </div>

      <div className={styles.board} ref={scrollRef} onScroll={readWindow}>
        <div className={styles.sheet} ref={crewRef} role="radiogroup" aria-labelledby={labelledBy} aria-required={view.unassigned ? undefined : "true"} aria-invalid={view.invalid ? "true" : undefined}>
          <div className={styles.line} data-kind="head">
            <div className={styles.label} ref={cornerRef}>ช่าง · ภาระวันนั้น (เพดาน 12 จุด)</div>
            <div className={`${styles.hours} ${styles.g}`} aria-hidden="true">
              {HOURS.map((h) => <span key={h} data-col={h * 4} data-span={4}>{String(h).padStart(2, "0")}</span>)}
              {view.selection ? <i className={styles.hourSel} data-col={view.selection.col} data-span={view.selection.span} /> : null}
            </div>
          </div>
          <div className={styles.line} data-kind="track">
            <div className={styles.label}>เวลาทำการ / {view.tracks.accessLabel}</div>
            <div className={`${styles.track} ${styles.g}`} aria-hidden="true">
              {work ? <span className={styles.trackWork} data-col={work.col} data-span={work.span} /> : null}
              {view.tracks.access ? <span className={styles.trackAccess} data-col={view.tracks.access.col} data-span={view.tracks.access.span} title={view.tracks.access.text} /> : null}
            </div>
          </div>
          {asked ? (
            <div className={styles.line} data-kind="track">
              <div className={styles.label}>{askedLabel}</div>
              <div className={`${styles.track} ${styles.g}`}>
                {view.tracks.asked ? <span className={styles.trackAsked} data-col={view.tracks.asked.col} data-span={view.tracks.asked.span}>{view.tracks.asked.text}</span> : null}
                {!view.tracks.asked && view.tracks.askedElsewhere ? <span className={styles.trackNote} data-col={0} data-span={96}>{view.tracks.askedElsewhere}</span> : null}
              </div>
            </div>
          ) : null}

          {view.groups.map((g) => (
            <Fragment key={g.key || "none"}>
              <div className={styles.line} data-kind="group">
                <div className={styles.label}>{g.label} · {g.rows.length} คน</div>
                <div className={styles.groupLane} />
              </div>
              {g.rows.map((row) => (
                <div key={row.id} className={styles.line} data-kind="person" data-on={row.selected ? "1" : undefined}>
                  <label className={styles.label}>
                    <input type="radio" name={group} value={row.id} checked={row.selected} disabled={disabled} onChange={() => emit({ assigneeId: row.id })} />
                    <span className={styles.who}>
                      <b>{row.name}</b>
                      {row.loadText ? <small>{row.loadText}</small> : null}
                      {row.projection ? <small className={styles.proj} data-over={row.projection.over ? "1" : undefined}>{row.projection.text}</small> : null}
                      {row.allDay.map((c) => <span key={c.key} className={styles.chip}>{c.text}</span>)}
                      {row.a11y ? <span className={styles.srOnly}>{row.a11y}</span> : null}
                    </span>
                    {row.bar ? <LoadBar bar={row.bar} /> : null}
                  </label>
                  {lane(row)}
                </div>
              ))}
            </Fragment>
          ))}

          {view.pinned ? (
            <div className={styles.line} data-kind="person" data-on="1">
              <label className={styles.label}>
                <input type="radio" name={group} value={view.pinned.id} checked readOnly disabled={disabled} />
                <span className={styles.who}><b>{naText(view.pinned.name)}</b><small>{view.pinned.note}</small></span>
              </label>
              {lane(null)}
            </div>
          ) : null}
          {view.unassigned ? (
            <div className={styles.line} data-kind="person" data-on={view.unassigned.selected ? "1" : undefined}>
              <label className={styles.label}>
                <input type="radio" name={group} value="" checked={view.unassigned.selected} disabled={disabled} onChange={() => emit({ assigneeId: "" })} />
                <span className={styles.who}><b>{view.unassigned.label}</b><small>{view.unassigned.sub}</small></span>
              </label>
              {lane(null)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadBar({ bar }) {
  return (
    <span className={styles.bar} data-over={bar.over ? "1" : undefined} aria-hidden="true">
      {bar.cells.map((cell, index) => <i key={index} data-fill={cell.fill || undefined} data-cap={cell.cap ? "1" : undefined} />)}
    </span>
  );
}

/* ── จอมือถือ: รายชื่อ ว่างช่วงนี้ก่อน ───────────────────────────────────────────────── */
function PhoneList({ view, value, asked, site, currentLength, startOnly, group, labelledBy, disabled, emit, pick, crewRef }) {
  /* ⭐ ปุ่มช่วงเวลา = ทางลัดของจอที่ลากไม่ได้ · "กำหนดเอง" คือช่องพิมพ์เวลาในบรรทัดเลือกแล้ว (ไม่ใช่ปุ่มแยก) */
  const presets = slotPresets({ asked, site, currentLength, startOnly });
  const slot = valueSlot(value || {}, { startOnly });
  const active = presets.find((p) => slot && p.start === slot.start && (startOnly || p.end === slot.end))?.key || (slot ? "custom" : "");
  const work = view.tracks.work;
  return (
    <div className={styles.phone}>
      <div className={styles.presets} role="group" aria-label="ช่วงเวลา">
        {presets.map((p) => (
          <button key={p.key} type="button" className={styles.preset} aria-pressed={active === p.key} disabled={disabled} onClick={() => pick(null, p)}>
            {p.label}
          </button>
        ))}
      </div>
      {active === "custom" ? <small className={styles.note}>เวลาที่พิมพ์เอง — แก้ได้ที่ช่องเริ่ม/ถึงด้านล่าง</small> : null}

      <div className={styles.cards} ref={crewRef} role="radiogroup" aria-labelledby={labelledBy} aria-required={view.unassigned ? undefined : "true"} aria-invalid={view.invalid ? "true" : undefined}>
        {view.phoneRows.map((row) => (
          <label key={row.id} className={styles.card} data-on={row.selected ? "1" : undefined}>
            <span className={styles.cardHead}>
              <input type="radio" name={group} value={row.id} checked={row.selected} disabled={disabled} onChange={() => emit({ assigneeId: row.id })} />
              <span className={styles.who}>
                <b>{row.name}</b>
                <small>{[row.team, row.projection?.text || row.loadText].filter(Boolean).join(" · ")}</small>
              </span>
            </span>
            <span className={`${styles.mini} ${styles.g}`} aria-hidden="true">
              {work ? <span className={styles.ovWork} data-col={work.col} data-span={work.span} /> : null}
              {row.blocks.map((b) => <span key={b.key} className={styles.ovJob} data-kind={b.kind} data-night={b.night ? "1" : undefined} data-col={b.col} data-span={b.span} />)}
              {view.selection ? <span className={styles.ovSel} data-col={view.selection.col} data-span={view.selection.span} /> : null}
            </span>
            {row.tags.length ? (
              <span className={styles.tags}>
                {row.tags.map((t) => <StatusBadge key={t.key} size="sm" tone={t.tone} label={t.text} />)}
              </span>
            ) : null}
            {row.a11y ? <span className={styles.srOnly}>{row.a11y}</span> : null}
          </label>
        ))}
        {view.pinned ? (
          <label className={styles.card} data-on="1">
            <span className={styles.cardHead}>
              <input type="radio" name={group} value={view.pinned.id} checked readOnly disabled={disabled} />
              <span className={styles.who}><b>{naText(view.pinned.name)}</b><small>{view.pinned.note}</small></span>
            </span>
          </label>
        ) : null}
        {view.unassigned ? (
          <label className={styles.card} data-on={view.unassigned.selected ? "1" : undefined}>
            <span className={styles.cardHead}>
              <input type="radio" name={group} value="" checked={view.unassigned.selected} disabled={disabled} onChange={() => emit({ assigneeId: "" })} />
              <span className={styles.who}><b>{view.unassigned.label}</b><small>{view.unassigned.sub}</small></span>
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

/* ── บรรทัด "เลือกแล้ว" + พิมพ์เวลาเอง + เตือน ───────────────────────────────────────── */
function Summary({ view, value, startOnly, disabled, emit, note }) {
  const timed = Boolean(valueSlot(value || {}, { startOnly }));
  return (
    <div className={styles.summaryWrap}>
      <div className={styles.summary} data-warn={view.summary.warnings.length ? "1" : undefined}>
        <span className={styles.summaryText}>
          <b>เลือกแล้ว: {view.summary.text}</b>
          {view.summary.load || view.summary.clean ? (
            <small>{[view.summary.load, view.summary.clean].filter(Boolean).join(" · ")}</small>
          ) : null}
        </span>
        <span className={styles.times}>
          <label>
            <span>เริ่ม</span>
            <TimeInput value={value?.startTime || ""} onChange={(t) => emit({ startTime: t || "" })} ariaLabel="เวลาเริ่ม" disabled={disabled} />
          </label>
          {startOnly ? null : (
            <label>
              <span>ถึง</span>
              <TimeInput value={value?.endTime || ""} onChange={(t) => emit({ endTime: t || "" })} ariaLabel="เวลาจบ" disabled={disabled} />
            </label>
          )}
          {timed ? (
            <button type="button" className={styles.clear} disabled={disabled} onClick={() => emit({ startTime: "", endTime: "" })}>ไม่ระบุเวลา</button>
          ) : null}
        </span>
      </div>
      {view.summary.warnings.length ? (
        <span className={styles.warnings} role="status">
          {view.summary.warnings.map((w) => <StatusBadge key={w.key} size="sm" tone={w.tone} label={w.text} />)}
        </span>
      ) : null}
      {note ? <small className={styles.note}>{note}</small> : null}
    </div>
  );
}

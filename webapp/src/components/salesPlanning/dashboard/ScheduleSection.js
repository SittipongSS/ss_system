"use client";
// ── "กำหนดการของฉัน" บนแดชบอร์ดของฉัน (มติผู้ใช้ 2026-08-21 · ม็อกแบบ ก) ─────
//
// ⭐ **แดชบอร์ดนี้ไม่เคยตอบว่า "กี่โมง"** — คิวของฉันบอกว่าต้องทำอะไรก่อน แต่นัดลูกค้า
// ที่บันทึกจากคิวลีดไม่เคยโผล่ในหน้านี้เลย ทั้งที่เป็นของชิ้นเดียวของคนขายที่มีเวลาตายตัว
// ⇒ ส่วนนี้ = **การ์ดซ้ายสองใบ** (นัด · ถึงกำหนด) + **ปฏิทินขวา** ที่สลับ วัน/สัปดาห์/เดือน
//
// ⚠️ **การ์ดซ้ายผูกกับ "วันที่เลือก" ไม่ใช่กับมุมมอง** — ตั้งต้นเป็นวันนี้ · กดวันไหน
// บนปฏิทินหัวการ์ดเปลี่ยนตามวันนั้น · ปุ่ม "วันนี้" คืนค่าทั้งวันที่เลือกและช่วงที่กาง
//
// ⚠️ **สามแหล่งมีความละเอียดเวลาไม่เท่ากัน** นัดมีเวลาจริง · งาน/คำร้องเป็นวันล้วน
// ⇒ งานกับคำร้องอยู่แถว "ทั้งวัน" เท่านั้น ห้ามเดาเวลาให้มัน (กติกาอยู่ที่ lib/salesPlanning/mySchedule)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarRange,
  ChevronLeft, ChevronRight, Clock, ListTodo, MessageCircleQuestion, Monitor, Car, TriangleAlert,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import MonthGrid from "@/components/ui/MonthGrid";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import { WorkspaceSection } from "@/components/ui/Workspace";
import { useCan } from "@/lib/roleContext";
import { businessDate } from "@/lib/businessDate";
import { cachedFetchJson } from "@/lib/apiCache";
import { NA, fmtDate, fmtDayMonth } from "@/lib/format";
import { MEETING_MODE_LABELS } from "@/lib/sales/leads";
import {
  DAY_SLOT_COUNT, DAY_START_HOUR, DEFAULT_SCHEDULE_VIEW, SCHEDULE_VIEWS,
  SCHEDULE_VIEW_STORAGE_KEY, buildScheduleDueItems, clampSelected, clusterDayMeetings,
  daysBetween, localDayKey, localHhmm, normalizeScheduleView, scheduleByDay,
  scheduleRange, scheduleTotals, shiftAnchor, weekIndex,
} from "@/lib/salesPlanning/mySchedule";
import styles from "./ScheduleSection.module.css";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/* ไอคอนรูปแบบนัด — lucide เท่านั้น (ระบบไม่มีอิโมจิบนหน้าจอ) · คำเต็มยังอยู่ข้าง ๆ เสมอ
   เพราะไอคอนสามตัวนี้แยกกันด้วยสายตาอย่างเดียวไม่ได้ */
const MODE_ICON = { onsite_customer_visit: Car, onsite_at_office: Building2, online: Monitor };
const KIND_ICON = { task: ListTodo, request: MessageCircleQuestion };
const KIND_LABEL = { task: "งาน", request: "คำร้อง" };

/** ป้ายช่วงบนแถบปฏิทิน — บอกเสมอว่ากำลังดูช่วงไหน ไม่ใช่แค่ "วันนี้/สัปดาห์นี้" */
function rangeLabel(view, anchor, range) {
  if (view === "day") return `${WEEKDAYS_TH[weekIndex(anchor)]} ${fmtDate(anchor)}`;
  if (view === "month") return `${MONTHS_TH[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
  return `${fmtDayMonth(range.from)} – ${fmtDayMonth(range.to)} ${range.to.slice(0, 4)}`;
}

export default function ScheduleSection() {
  const today = businessDate();
  const canLead = useCan("salesplan:lead");
  const [view, setView] = useState(DEFAULT_SCHEDULE_VIEW);
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // เวลาปัจจุบัน (มิลลิวินาที) — ตั้งใน effect ทุกครั้งที่ข้อมูลชุดใหม่มาถึง
  const [nowMs, setNowMs] = useState(null);

  /* มุมมองล่าสุดที่จำไว้ (มติผู้ใช้ 2026-08-21) — อ่านใน effect ไม่ใช่ตอน useState
     เพราะ localStorage ไม่มีตอน SSR แล้ว markup สองฝั่งจะไม่ตรงกัน */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY);
      if (saved) setView(normalizeScheduleView(saved));
    } catch { /* โหมดส่วนตัวของเบราว์เซอร์ปิด storage ได้ — ตกมาที่ค่าตั้งต้นเงียบ ๆ */ }
  }, []);

  const changeView = useCallback((next) => {
    const safe = normalizeScheduleView(next);
    setView(safe);
    try { window.localStorage.setItem(SCHEDULE_VIEW_STORAGE_KEY, safe); } catch { /* เหมือนขาอ่าน */ }
  }, []);

  const range = useMemo(() => scheduleRange(view, anchor), [view, anchor]);

  // วันที่เลือกต้องอยู่ในช่วงที่กางเสมอ ไม่งั้นการ์ดซ้ายชี้วันที่ไม่มีบนปฏิทิน
  useEffect(() => {
    setSelected((current) => clampSelected(current, range, today));
  }, [range, today]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const response = await fetch(`/api/sales-planning/my-schedule?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดกำหนดการไม่สำเร็จ");
      setData(payload);
    } catch (loadError) {
      setError(loadError.message || "โหลดกำหนดการไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNowMs(Date.now()); }, [data]);

  useEffect(() => {
    cachedFetchJson("/api/holidays")
      .then((rows) => setHolidays(Array.isArray(rows) ? rows : []))
      .catch(() => { /* วันหยุดหาย = ปฏิทินยังอ่านได้ ไม่ต้องล้มทั้งส่วน */ });
  }, []);

  const holidayOf = useMemo(() => {
    const map = new Map(holidays.map((holiday) => [holiday.date, holiday.name || "วันหยุด"]));
    return (iso) => map.get(iso);
  }, [holidays]);

  const dueItems = useMemo(() => buildScheduleDueItems({
    tasks: data?.tasks || [], requests: data?.requests || [], todayIso: today,
  }), [data, today]);

  /* ของที่เลยกำหนดมาจากก่อนช่วงที่กาง — เข้าเฉพาะการ์ด "ถึงกำหนด" ของ **วันนี้**
     ไม่ใช่ทุกวัน · มันไม่มีวันของตัวเองในช่วงนี้ จะเอาไปแปะวันอื่นก็เป็นการโกหกวันที่ */
  const overdueItems = useMemo(() => buildScheduleDueItems({
    tasks: data?.overdueTasks || [], requests: data?.overdueRequests || [], todayIso: today,
  }), [data, today]);

  const byDay = useMemo(() => scheduleByDay({
    meetings: data?.meetings || [], due: dueItems, from: range?.from, to: range?.to,
  }), [data, dueItems, range]);

  const totals = useMemo(() => scheduleTotals(byDay), [byDay]);
  const day = byDay.get(selected) || { meetings: [], due: [], clashes: 0 };
  const dayOverdue = selected === today ? overdueItems : [];
  /* ⚠️ เทียบเป็น **เวลา** ไม่ใช่สตริง — `at` มี offset (+07:00) ส่วน `toISOString()`
     เป็น Z ⇒ เทียบสตริงแล้วนัดที่ผ่านไปแล้วโผล่เป็น "นัดถัดไป" ได้
     ⚠️ อ่านนาฬิกาใน effect ไม่ใช่ตอนเรนเดอร์ — เวลาเป็นค่าที่เปลี่ยนทุกครั้งที่เรียก
     (SSR กับ CSR จึงได้คนละค่า) */
  const nextMeeting = useMemo(() => {
    if (nowMs == null) return null;
    return (data?.meetings || [])
      .filter((meeting) => new Date(meeting.at).getTime() >= nowMs)
      .sort((a, b) => new Date(a.at) - new Date(b.at))[0] || null;
  }, [data, nowMs]);

  const go = (delta) => setAnchor((current) => shiftAnchor(view, current, delta));
  const goToday = () => { setAnchor(today); setSelected(today); };
  const pickDay = (iso) => {
    setSelected(iso);
    // กดวันในมุมมองเดือน/สัปดาห์ = อยากดูวันนั้น แต่ยังอยู่ในมุมมองเดิม (ไม่กระโดดมุมมองให้)
    if (view === "day") setAnchor(iso);
  };

  if (error) {
    return (
      <WorkspaceSection icon={<CalendarDays size={17} />} title="กำหนดการของฉัน">
        <StatusNotice tone="error" title="โหลดกำหนดการไม่สำเร็จ">{error}</StatusNotice>
      </WorkspaceSection>
    );
  }

  return (
    <WorkspaceSection
      icon={<CalendarDays size={17} />}
      title="กำหนดการของฉัน"
      subtitle="นัดลูกค้า · งานและคำร้องที่ถึงกำหนด"
      actions={canLead && (
        <Button as={Link} href="/sa/calendar" size="sm" icon={<CalendarRange size={13} />}>
          ปฏิทินนัด
        </Button>
      )}
    >
      <div className={styles.layout}>
        <div className={styles.cards}>
          <MeetingCard
            iso={selected} today={today} loading={loading}
            meetings={day.meetings} clashes={day.clashes} nextMeeting={nextMeeting}
          />
          <DueCard iso={selected} today={today} loading={loading} items={day.due} overdue={dayOverdue} />
        </div>

        <div className={styles.calendar}>
          <div className={styles.bar}>
            <div className={styles.nav}>
              <Button size="sm" iconOnly aria-label="ช่วงก่อนหน้า" title="ช่วงก่อนหน้า" onClick={() => go(-1)}>
                <ChevronLeft size={15} aria-hidden="true" />
              </Button>
              <span className={styles.range}>{range ? rangeLabel(view, anchor, range) : ""}</span>
              <Button size="sm" iconOnly aria-label="ช่วงถัดไป" title="ช่วงถัดไป" onClick={() => go(1)}>
                <ChevronRight size={15} aria-hidden="true" />
              </Button>
              <Button size="sm" onClick={goToday}>วันนี้</Button>
            </div>
            <Segmented
              ariaLabel="มุมมองปฏิทิน"
              value={view}
              onChange={changeView}
              options={SCHEDULE_VIEWS.map((option) => ({ value: option.key, label: option.label }))}
            />
          </div>

          {loading && !data ? (
            <div className={styles.loading}><SkeletonRows rows={4} /></div>
          ) : view === "day" ? (
            <DayRail day={byDay.get(anchor) || { meetings: [], due: [] }} iso={anchor} today={today} />
          ) : view === "week" ? (
            <WeekStrip
              range={range} byDay={byDay} today={today} selected={selected}
              holidayOf={holidayOf} onPick={pickDay}
            />
          ) : (
            <MonthView
              anchor={anchor} byDay={byDay} today={today} selected={selected}
              holidayOf={holidayOf} onPick={pickDay}
            />
          )}

          <div className={styles.foot}>
            <span>
              {view === "day" ? "วันที่กางอยู่" : view === "week" ? "สัปดาห์นี้" : "เดือนนี้"} {totals.meetings} นัด · ถึงกำหนด {totals.due}
            </span>
            {totals.clashes > 0 && (
              <span className={styles.warn}>
                <TriangleAlert size={14} aria-hidden="true" /> เวลาชนกัน {totals.clashes} คู่ (สมมติว่านัดละ 1 ชม.)
              </span>
            )}
          </div>
        </div>
      </div>
    </WorkspaceSection>
  );
}

/** หัวการ์ด — บอกวันที่เลือกเสมอ ไม่ใช่คำว่า "วันนี้" ลอย ๆ (วันที่เลือกเปลี่ยนได้) */
function cardDate(iso, today) {
  const label = `${WEEKDAYS_TH[weekIndex(iso)]} ${fmtDayMonth(iso)}`;
  return iso === today ? `วันนี้ · ${label}` : label;
}

function MeetingCard({ iso, today, loading, meetings, clashes, nextMeeting }) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.cardTitle}>
          <CalendarClock size={15} aria-hidden="true" />
          <b>นัด · {cardDate(iso, today)}</b>
        </span>
        <em className={styles.cardCount}>
          {meetings.length ? `${meetings.length} นัด` : NA}
          {clashes > 0 ? " · ชนกัน" : ""}
        </em>
      </header>

      {loading ? <div className={styles.loading}><SkeletonRows rows={2} /></div>
        : meetings.length === 0 ? (
          <div className={styles.empty}>
            <b>ไม่มีนัดในวันที่เลือก</b>
            <span>นัดที่บันทึกจากคิวลีดของคุณจะมาอยู่ที่นี่</span>
          </div>
        ) : meetings.map((meeting) => {
          const Icon = MODE_ICON[meeting.meetingMode];
          return (
            <Link key={meeting.id} className={styles.row} href={`/sales-planning/leads/${meeting.leadId}`}>
              <span className={styles.rowTime}>{localHhmm(meeting.at)}</span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  <span className={`${styles.dot} ${styles.dotMeeting}`} aria-hidden="true" />
                  <span>{[meeting.company, meeting.contactName].filter(Boolean).join(" — ") || "ลีด"}</span>
                </span>
                <span className={styles.rowMeta}>
                  {Icon && <Icon size={12} aria-hidden="true" />}
                  {MEETING_MODE_LABELS[meeting.meetingMode] || "นัดลูกค้า"}
                  {meeting.bookedByName ? ` · บันทึกโดย ${meeting.bookedByName}` : ""}
                </span>
              </span>
            </Link>
          );
        })}

      {!loading && nextMeeting && (
        <footer className={styles.cardFoot}>
          <Clock size={14} aria-hidden="true" />
          นัดถัดไป {localHhmm(nextMeeting.at)} น. {localDayKey(nextMeeting.at) === iso ? "" : `(${fmtDayMonth(localDayKey(nextMeeting.at))}) `}
          — {nextMeeting.company || nextMeeting.contactName || "ลีด"}
        </footer>
      )}
    </section>
  );
}

function DueCard({ iso, today, loading, items, overdue }) {
  const total = items.length + overdue.length;
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.cardTitle}>
          <CalendarCheck size={15} aria-hidden="true" />
          <b>ถึงกำหนด · {cardDate(iso, today)}</b>
        </span>
        <em className={styles.cardCount}>
          {items.length ? `${items.length} รายการ` : NA}
          {overdue.length ? ` · เลยกำหนด ${overdue.length}` : ""}
        </em>
      </header>

      {loading ? <div className={styles.loading}><SkeletonRows rows={2} /></div>
        : total === 0 ? (
          <div className={styles.empty}>
            <b>ไม่มีงานหรือคำร้องถึงกำหนดในวันที่เลือก</b>
            <span>งานที่ตั้งวันครบกำหนดไว้ และคำร้องที่ฝ่ายผู้รับแจ้งวันส่งกลับมา จะมาอยู่ที่นี่</span>
          </div>
        ) : (
          <>
            {items.map((item) => <DueRow key={item.key} item={item} />)}
            {overdue.map((item) => <DueRow key={item.key} item={item} carried />)}
          </>
        )}
    </section>
  );
}

/** แถวของงาน/คำร้อง — `carried` = ค้างมาจากวันก่อน (ไม่ใช่ของวันที่เลือก) */
function DueRow({ item, carried = false }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Link className={styles.row} href={item.href}>
      <span className={`${styles.rowTime} ${carried || item.overdue ? styles.rowTimeOver : styles.rowTimeAllDay}`}>
        {carried || item.overdue ? "เลยกำหนด" : KIND_LABEL[item.kind]}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>
          <span className={`${styles.dot} ${item.kind === "task" ? styles.dotTask : styles.dotRequest}`} aria-hidden="true" />
          <span>{item.title}</span>
          {item.urgent && <span className="ui-badge danger">ด่วน</span>}
        </span>
        <span className={styles.rowMeta}>
          {Icon && <Icon size={12} aria-hidden="true" />}
          {[
            item.sub,
            carried ? `${item.dateNote} ${fmtDate(item.date)} (ค้าง ${Math.abs(item.days)} วัน)` : item.dateNote,
            item.statusLabel,
          ].filter(Boolean).join(" · ")}
        </span>
      </span>
    </Link>
  );
}

/* ── มุมมองวัน: รางชั่วโมง 09:00–18:00 ──────────────────────────────────────
   ⚠️ **ตำแหน่งบล็อกมาจาก `data-slot`/`data-span` ไม่ใช่ inline style** — ค่าพวกนี้
   ไปเป็น `grid-row` ใน CSS module (`audit:ui` นับ `style={{` เป็นหนี้ชั้นเก่า และ
   เพดานของโมดูลขายขึ้นไม่ได้) */
function DayRail({ day, iso, today }) {
  const { clusters, outside } = useMemo(() => clusterDayMeetings(day.meetings), [day.meetings]);
  const hours = Array.from({ length: DAY_SLOT_COUNT / 2 }, (_, index) => DAY_START_HOUR + index);
  /* แถบ "ตอนนี้" อ่านนาฬิกาใน effect — ค่าที่เปลี่ยนตลอดเวลาห้ามอ่านตอนเรนเดอร์
     (SSR กับ CSR จะได้คนละค่าแล้ว hydrate ไม่ตรง) */
  const [nowSlot, setNowSlot] = useState(null);
  useEffect(() => { setNowSlot(iso === today ? currentSlot() : null); }, [iso, today]);

  return (
    <div className={styles.rail}>
      <div className={styles.railAllDayLabel}>ทั้งวัน</div>
      <div className={styles.railAllDay}>
        {outside.map((meeting) => (
          <Link key={meeting.id} className={`${styles.pill} ${styles.pillMeeting}`} href={`/sales-planning/leads/${meeting.leadId}`}>
            <span className={`${styles.dot} ${styles.dotMeeting}`} aria-hidden="true" />
            <b>{localHhmm(meeting.at)}</b>
            <span>{meeting.company || meeting.contactName}</span>
          </Link>
        ))}
        {day.due.map((item) => (
          <Link key={item.key} className={`${styles.pill} ${item.kind === "task" ? styles.pillTask : styles.pillRequest} ${item.overdue ? styles.pillOverdue : ""}`.trim()} href={item.href}>
            <span className={`${styles.dot} ${item.kind === "task" ? styles.dotTask : styles.dotRequest}`} aria-hidden="true" />
            <span>{item.title}</span>
          </Link>
        ))}
        {!outside.length && !day.due.length && <span className={styles.railEmpty}>{NA}</span>}
      </div>

      {hours.map((hour, index) => (
        <div key={hour} className={styles.railHour} data-slot={index * 2}>{`${String(hour).padStart(2, "0")}:00`}</div>
      ))}

      <div className={styles.railColumn}>
        {nowSlot != null && <div className={styles.railNow} data-slot={nowSlot} aria-hidden="true" />}
        {clusters.map((cluster) => (
          <div
            key={cluster.key}
            className={`${styles.block} ${cluster.clash ? styles.blockClash : ""}`.trim()}
            data-slot={cluster.slot}
            data-span={cluster.span}
          >
            {cluster.clash && (
              <span className={styles.blockClashMark}>
                <TriangleAlert size={11} aria-hidden="true" /> เวลาชนกัน
              </span>
            )}
            {/* ⚠️ ก้อนที่ชนกันต้องเห็น **ทุกใบ** — ตอนแรกซ้อนกันในบล็อกเดียวแล้วใบที่สอง
                ถูก overflow ตัดทิ้ง ซึ่งแปลว่า "ชนกัน" แต่ไม่บอกว่าชนกับอะไร */}
            <span className={styles.blockItems}>
              {cluster.items.map((meeting) => (
                <Link key={meeting.id} className={styles.blockItem} href={`/sales-planning/leads/${meeting.leadId}`}>
                  <b>{[meeting.company, meeting.contactName].filter(Boolean).join(" — ") || "ลีด"}</b>
                  <em>{[localHhmm(meeting.at), MEETING_MODE_LABELS[meeting.meetingMode]].filter(Boolean).join(" · ")}</em>
                </Link>
              ))}
            </span>
          </div>
        ))}
        {!clusters.length && <div className={styles.railFree}>ไม่มีนัดในช่วง 09:00–18:00 ของวันนี้</div>}
      </div>
    </div>
  );
}

/** ช่อง 30 นาทีที่เวลาปัจจุบันตกอยู่ — null = นอกช่วงที่ราง 09:00–18:00 วาด */
function currentSlot() {
  const now = new Date();
  const offset = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
  const slot = Math.floor(offset / 30);
  return slot >= 0 && slot < DAY_SLOT_COUNT ? slot : null;
}

function WeekStrip({ range, byDay, today, selected, holidayOf, onPick }) {
  const days = daysBetween(range?.from, range?.to);
  return (
    <div className={styles.week}>
      {days.map((iso) => {
        const day = byDay.get(iso) || { meetings: [], due: [], clashes: 0 };
        const holiday = holidayOf(iso);
        const classes = [
          styles.weekCol,
          iso === today ? styles.isToday : "",
          holiday ? styles.isHoliday : "",
          iso === selected ? styles.isSelected : "",
        ].filter(Boolean).join(" ");
        return (
          <button
            key={iso} type="button" className={classes} onClick={() => onPick(iso)}
            aria-pressed={iso === selected}
            aria-label={`${WEEKDAYS_TH[weekIndex(iso)]} ${fmtDate(iso)} — ${day.meetings.length} นัด ถึงกำหนด ${day.due.length}`}
          >
            <span className={styles.weekHead}>
              <span className={styles.weekDay}>{WEEKDAYS_TH[weekIndex(iso)]}{iso === today ? " · วันนี้" : ""}</span>
              <span className={styles.weekDate}>{Number(iso.slice(8, 10))}</span>
            </span>
            {holiday && <span className={styles.weekHoliday}>{holiday}</span>}
            {day.meetings.slice(0, 2).map((meeting) => (
              <span key={meeting.id} className={`${styles.pill} ${styles.pillMeeting}`}>
                <span className={`${styles.dot} ${styles.dotMeeting}`} aria-hidden="true" />
                <b>{localHhmm(meeting.at)}</b>
                <span>{meeting.company || meeting.contactName}</span>
              </span>
            ))}
            {day.due.slice(0, 2).map((item) => (
              <span
                key={item.key}
                className={`${styles.pill} ${item.kind === "task" ? styles.pillTask : styles.pillRequest} ${item.overdue ? styles.pillOverdue : ""}`.trim()}
              >
                <span className={`${styles.dot} ${item.kind === "task" ? styles.dotTask : styles.dotRequest}`} aria-hidden="true" />
                <span>{item.title}</span>
              </span>
            ))}
            {/* ⚠️ ตัดที่ 2+2 แล้วต้องบอกว่าเหลืออีกเท่าไร — ช่องที่โชว์ไม่ครบโดยไม่บอก
                อ่านเป็น "วันนี้มีแค่นี้" ซึ่งเป็นคนละเรื่องกับความจริง */}
            {day.meetings.length + day.due.length > 4 && (
              <span className={styles.weekMore}>+{day.meetings.length + day.due.length - 4} รายการ</span>
            )}
            {day.clashes > 0 && <span className={styles.weekWarn}>เวลาชนกัน {day.clashes} คู่</span>}
            {!day.meetings.length && !day.due.length && <span className={styles.weekMore}>{NA}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MonthView({ anchor, byDay, today, selected, holidayOf, onPick }) {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  return (
    <MonthGrid
      year={year}
      month={month}
      todayISO={today}
      holidayOf={holidayOf}
      onDayClick={onPick}
      dayLabel={({ iso }) => {
        const day = byDay.get(iso);
        return `${fmtDate(iso)} — ${day?.meetings.length || 0} นัด ถึงกำหนด ${day?.due.length || 0}`;
      }}
      className={styles.month}
    >
      {({ iso }) => {
        const day = byDay.get(iso);
        if (!day || (!day.meetings.length && !day.due.length)) return null;
        const tasks = day.due.filter((item) => item.kind === "task").length;
        const requests = day.due.length - tasks;
        const overdue = day.due.filter((item) => item.overdue).length;
        /* ⚠️ ช่องเดือนแคบเกินกว่าจะใส่ชื่อ — เป็น **บรรทัดนับตามชนิด** แล้วกดวันเพื่อ
           อ่านของจริงในการ์ดซ้าย · ป้ายที่ถูกตัดกลางคำอ่านไม่ออกอยู่ดี */
        return (
          <span className={`${styles.monthCell} ${iso === selected ? styles.monthCellSelected : ""}`.trim()}>
            {day.meetings.length > 0 && (
              <span className={styles.monthLine}>
                <span className={`${styles.dot} ${styles.dotMeeting}`} aria-hidden="true" />
                {day.meetings.length} นัด
              </span>
            )}
            {tasks > 0 && (
              <span className={styles.monthLine}>
                <span className={`${styles.dot} ${styles.dotTask}`} aria-hidden="true" />
                {tasks} งาน
              </span>
            )}
            {requests > 0 && (
              <span className={styles.monthLine}>
                <span className={`${styles.dot} ${styles.dotRequest}`} aria-hidden="true" />
                {requests} คำร้อง
              </span>
            )}
            {(overdue > 0 || day.clashes > 0) && (
              <span className={`${styles.monthLine} ${styles.monthLineWarn}`}>
                <span className={`${styles.dot} ${styles.dotOver}`} aria-hidden="true" />
                {overdue > 0 ? `เลยกำหนด ${overdue}` : `เวลาชนกัน ${day.clashes}`}
              </span>
            )}
          </span>
        );
      }}
    </MonthGrid>
  );
}

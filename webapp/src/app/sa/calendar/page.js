"use client";

// ปฏิทินนัดของฝ่ายขาย (/sa/calendar) — นัดที่บันทึกจากคิวลีดทั้งหมดในภาพเดียว
//
// ทำไมไม่ไปอยู่ใน /mgmt/calendar ที่มีอยู่แล้ว: ปฏิทินตัวนั้นอ่าน `mgmt_meetings` +
// `mgmt_tasks` และ gate ด้วย `mgmt:view` ซึ่ง AE/Senior AE ไม่มี — คนที่นัดลูกค้าจริง
// เปิดไม่ได้เลย · และตามกฎเจ้าของโมดูล หน้าจอต้องอยู่กับฝ่ายที่ลงมือ (ดู docs/module-ownership-rule.md)
//
// ⚠️ **แบ่งช่องวันด้วยเวลาท้องถิ่นของเครื่องผู้ใช้** ไม่ใช่ `slice(0, 10)` ของ ISO
// `eventAt` เป็น UTC — นัดตีหนึ่งของวันที่ 1 คือ 18:00Z ของวันที่ 31 ตัดด้วยสตริงแล้ว
// นัดนั้นจะไปโผล่ผิดวัน (server จึงส่งช่วงเผื่อขอบมาให้ ดู calendarRange)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, CalendarRange } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import useMyTeamsFilter from "@/lib/useMyTeamsFilter";
import { useCan, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { leadScopes, TEAM_LABELS } from "@/lib/permissions";
import { LEAD_STATUS_LABELS, MEETING_MODE_LABELS } from "@/lib/sales/leads";
import { isInLocalMonth } from "@/lib/sales/leadCalendar";
import { SCOPE_LABELS } from "@/components/salesPlanning/ui";
import { cachedFetchJson } from "@/lib/apiCache";
import MonthGrid from "@/components/ui/MonthGrid";
import styles from "./page.module.css";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/* ไอคอนย่อของรูปแบบนัด — ช่องในตารางเดือนกว้างไม่พอสำหรับคำเต็ม
   คำเต็มยังอยู่ที่ `title` และในมุมมองรายการ */
const MODE_ICON = { onsite_customer_visit: "🚗", onsite_at_office: "🏢", online: "💻" };
/* จำนวนนัดที่โชว์ในช่องเดียวก่อนยุบเป็น "+N" — เกินนี้ช่องสูงจนตารางเสียรูป */
const MAX_PER_CELL = 3;

const pad = (n) => String(n).padStart(2, "0");
/** คีย์วันตาม **เวลาท้องถิ่น** — ห้ามใช้ toISOString().slice(0,10) (นั่นคือวัน UTC) */
const localDayKey = (value) => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};
const hhmm = (value) => {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

export default function SalesCalendarPage() {
  const canLead = useCan("salesplan:lead");
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  // อยู่หลายทีม → เลือกได้ว่าขอบเขต "ทีม" จะรวมทีมไหนบ้าง
  const myTeams = useMyTeamsFilter();
  const router = useRouter();

  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [entries, setEntries] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meId, setMeId] = useState(null);
  const [view, setView] = useState("month");
  const [scope, setScope] = useState(null);

  useEffect(() => { if (role && !canLead) router.replace("/home"); }, [role, canLead, router]);

  /* มือถือเริ่มที่มุมมองรายการ — ตาราง 7 คอลัมน์บนจอ 375px อ่านไม่ออก
     ตั้งครั้งเดียวตอน mount แล้วปล่อยให้ผู้ใช้สลับเอง (ไม่บังคับซ้ำตอนหมุนจอ) */
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setView("list");
  }, []);

  useEffect(() => {
    fetch("/api/users/me").then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null)).catch(() => setMeId(null));
  }, []);

  useEffect(() => {
    cachedFetchJson("/api/holidays").then((rows) => setHolidays(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const from = `${cursor.y}-${pad(cursor.m + 1)}-01`;
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const to = `${cursor.y}-${pad(cursor.m + 1)}-${pad(last)}`;
    try {
      const res = await fetch(`/api/sales-planning/calendar?from=${from}&to=${to}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "โหลดปฏิทินไม่สำเร็จ");
      setEntries(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e.message); setEntries([]);
    } finally { setLoading(false); }
  }, [cursor]);

  useEffect(() => { load(); }, [load]);

  /* ขอบเขต "ของฉัน / ทีม / ทุกทีม" — กรองภายในสิ่งที่ API คืนมาแล้วเท่านั้น
     ด่านจริงอยู่ที่ applyLeadScope ฝั่ง server · ตั้งต้นที่ตัวกว้างสุดเหมือนหน้าคิวลีด */
  const scopes = useMemo(() => leadScopes(role), [role]);
  const activeScope = scope && scopes.includes(scope) ? scope : scopes[scopes.length - 1];
  const visible = useMemo(() => entries.filter((entry) => {
    // ตัดวันที่ server ถ่างเผื่อขอบมาให้ก่อน — ดู isInLocalMonth ว่าทำไมต้องตัดที่นี่
    if (!isInLocalMonth(entry.at, cursor.y, cursor.m)) return false;
    if (activeScope === "mine") return !!meId && entry.assigneeId === meId;
    // "ทีมของฉัน" = ทุกทีมที่สังกัด (คนเดียวอยู่ได้หลายทีม)
    if (activeScope === "team") return teams.includes(entry.team) && myTeams.matches(entry.team);
    return true;
  }), [entries, activeScope, meId, teams, myTeams, cursor]);

  const holidayByDay = useMemo(() => {
    const map = new Map();
    for (const holiday of holidays) map.set(holiday.date, holiday.name || "วันหยุด");
    return map;
  }, [holidays]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const entry of visible) {
      const key = localDayKey(entry.at);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.at) - new Date(b.at));
    return map;
  }, [visible]);

  const goMonth = (delta) => setCursor((current) => {
    const m = current.m + delta;
    if (m < 0) return { y: current.y - 1, m: 11 };
    if (m > 11) return { y: current.y + 1, m: 0 };
    return { y: current.y, m };
  });

  const todayKey = localDayKey(now);
  const nowMs = now.getTime();
  const openLead = (leadId) => router.push(`/sa/leads/${leadId}`);
  const describe = (entry) => [
    hhmm(entry.at),
    entry.contactName,
    entry.company,
    MEETING_MODE_LABELS[entry.meetingMode] || null,
    entry.assigneeName,
    TEAM_LABELS[entry.team] || entry.team,
    LEAD_STATUS_LABELS[entry.status] || entry.status,
  ].filter(Boolean).join(" · ");

  if (role && !canLead) return null;

  return (
    <Workspace
      icon={<CalendarDays size={22} />}
      title="ปฏิทินนัด"
      subtitle="นัดประชุมทั้งหมดที่บันทึกจากคิวลีด พร้อมวันหยุด — ขอบเขตเท่ากับที่เห็นในคิวลีด"
      loading={loading}
      headerRight={(
        <Segmented
          ariaLabel="มุมมองปฏิทิน"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "เดือน", icon: CalendarRange },
            { value: "list", label: "รายการ", icon: List },
          ]}
        />
      )}
    >
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.bar}>
        <Button variant="quiet" aria-label="เดือนก่อนหน้า" onClick={() => goMonth(-1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span className={styles.barTitle}>{MONTHS_TH[cursor.m]} {cursor.y}</span>
        <Button variant="quiet" aria-label="เดือนถัดไป" onClick={() => goMonth(1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <Button onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>วันนี้</Button>
        <div className={styles.barRight}>
          {scopes.length > 1 && (
            <Segmented
              ariaLabel="ขอบเขตของปฏิทิน"
              value={activeScope}
              onChange={setScope}
              options={scopes.map((key) => ({ value: key, label: SCOPE_LABELS[key] }))}
            />
          )}
          {activeScope === "team" && (
            <MyTeamsFilter teams={myTeams.teams} selected={myTeams.selected} onChange={myTeams.setSelected} />
          )}
          <span className="ui-badge">{visible.length} นัด</span>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid
          year={cursor.y}
          month={cursor.m}
          todayISO={todayKey}
          holidayOf={(iso) => holidayByDay.get(iso)}
        >
          {({ iso }) => {
            const items = byDay.get(iso) || [];
            if (!items.length) return null;
            return (
              <>
                {items.slice(0, MAX_PER_CELL).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${styles.event} ${new Date(entry.at).getTime() < nowMs ? styles.eventPast : ""}`.trim()}
                    title={describe(entry)}
                    onClick={() => openLead(entry.leadId)}
                  >
                    <span className={styles.eventTime}>{hhmm(entry.at)}</span>
                    {" "}{MODE_ICON[entry.meetingMode] || ""} {entry.contactName}
                  </button>
                ))}
                {items.length > MAX_PER_CELL && (
                  <span className={styles.more}>+ อีก {items.length - MAX_PER_CELL} นัด</span>
                )}
              </>
            );
          }}
        </MonthGrid>
      ) : (
        <div className={styles.list}>
          {[...byDay.keys()].sort().map((key) => {
            const items = byDay.get(key);
            const at = new Date(`${key}T00:00:00`);
            const holiday = holidayByDay.get(key);
            return (
              <div key={key} className={styles.listDay}>
                <div className={`${styles.listDate} ${holiday ? styles.listDateHoliday : ""}`.trim()}>
                  {at.getDate()} {MONTHS_TH[at.getMonth()]}
                  <span className={styles.listDateSub}>
                    {WEEKDAYS_TH[at.getDay()]}{holiday ? ` · ${holiday}` : ""}
                  </span>
                </div>
                <div className={styles.listItems}>
                  {items.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${styles.card} ${new Date(entry.at).getTime() < nowMs ? styles.cardPast : ""}`.trim()}
                      onClick={() => openLead(entry.leadId)}
                    >
                      <span className={styles.cardTop}>
                        <span className={styles.cardTime}>{hhmm(entry.at)}</span>
                        <span className="ui-badge">
                          {MODE_ICON[entry.meetingMode] || ""} {MEETING_MODE_LABELS[entry.meetingMode] || "ไม่ระบุรูปแบบ"}
                        </span>
                      </span>
                      <span className={styles.cardName}>
                        {entry.contactName}{entry.company ? ` · ${entry.company}` : ""}
                      </span>
                      <span className={styles.cardMeta}>
                        <span>{entry.assigneeName || "ยังไม่มอบหมาย"}</span>
                        <span>{TEAM_LABELS[entry.team] || entry.team || "-"}</span>
                        <span>{LEAD_STATUS_LABELS[entry.status] || entry.status}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!byDay.size && !loading && (
            <p className="empty">เดือนนี้ยังไม่มีนัด — นัดที่บันทึกจากหน้าลีดจะขึ้นที่นี่อัตโนมัติ</p>
          )}
        </div>
      )}

      <div className={styles.legend}>
        <span><span className={`${styles.swatch} ${styles.swatchMeeting}`} /> นัดที่ยังไม่ถึง</span>
        <span><span className={`${styles.swatch} ${styles.swatchPast}`} /> นัดที่ผ่านมาแล้ว</span>
        <span><span className={`${styles.swatch} ${styles.swatchHoliday}`} /> วันหยุด</span>
        <span>🚗 ออกไปหาลูกค้า · 🏢 ลูกค้าเข้ามา · 💻 Online</span>
      </div>
    </Workspace>
  );
}

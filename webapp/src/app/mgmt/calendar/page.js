"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Users, ListTodo } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function MgmtCalendarPage() {
  const role = useRole();
  const canMgmt = useCan("mgmt:view");
  const router = useRouter();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [holidays, setHolidays] = useState([]);

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);

  // holidays (ทั้งหมด) โหลดครั้งเดียว
  useEffect(() => {
    fetch("/api/holidays").then((r) => (r.ok ? r.json() : [])).then((d) => setHolidays(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // tasks + meetings ตามปีของ cursor
  useEffect(() => {
    const y = cursor.y;
    fetch(`/api/mgmt/tasks?year=${y}`).then((r) => (r.ok ? r.json() : [])).then((d) => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/mgmt/meetings?year=${y}`).then((r) => (r.ok ? r.json() : [])).then((d) => setMeetings(Array.isArray(d) ? d : [])).catch(() => {});
  }, [cursor.y]);

  const holidaySet = useMemo(() => {
    const m = new Map();
    for (const h of holidays) m.set(h.date, h.name || "วันหยุด");
    return m;
  }, [holidays]);

  // จัดกลุ่มตามวัน (ISO)
  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks) if (t.dueDate) (map[t.dueDate] ||= { tasks: [], meetings: [] }).tasks.push(t);
    for (const mt of meetings) if (mt.meetingDate) (map[mt.meetingDate] ||= { tasks: [], meetings: [] }).meetings.push(mt);
    return map;
  }, [tasks, meetings]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < startPad; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const goMonth = (delta) => setCursor((c) => {
    const m = c.m + delta;
    if (m < 0) return { y: c.y - 1, m: 11 };
    if (m > 11) return { y: c.y + 1, m: 0 };
    return { y: c.y, m };
  });

  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  if (role && !canMgmt) return null;

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><CalendarDays size={22} /></span> ปฏิทิน</h1>
          <p>การประชุม + งาน (ตามกำหนดส่ง) พร้อมวันหยุด — ในภาพเดียว</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => goMonth(-1)} className="btn btn-secondary" style={{ padding: "6px 10px" }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{MONTHS_TH[cursor.m]} {cursor.y + 543}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }}>วันนี้</button>
            <button onClick={() => goMonth(1)} className="btn btn-secondary" style={{ padding: "6px 10px" }}><ChevronRight size={16} /></button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
          {WEEKDAYS_TH.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 || i === 6 ? "var(--red)" : "var(--text-3)", padding: "4px 0" }}>{w}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const iso = toISO(cursor.y, cursor.m, d);
            const dow = new Date(cursor.y, cursor.m, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const hol = holidaySet.get(iso);
            const isToday = iso === todayISO;
            const day = byDay[iso];
            const bg = hol ? "color-mix(in srgb, var(--red) 12%, transparent)" : isWeekend ? "var(--panel-2)" : "var(--panel)";
            return (
              <div key={iso} style={{ minHeight: 92, borderRadius: 10, padding: "6px 7px", background: bg, border: `${isToday ? "2px" : "1px"} solid ${isToday ? "var(--accent)" : hol ? "color-mix(in srgb, var(--red) 35%, transparent)" : "var(--border)"}`, display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: isToday ? 700 : 500, color: isWeekend && !hol ? "var(--text-3)" : hol ? "var(--red)" : "var(--text)" }}>{d}</span>
                  {hol && <span title={hol} style={{ fontSize: 9, color: "var(--red)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 60 }}>{hol}</span>}
                </div>
                {day?.meetings?.map((m) => (
                  <div key={m.id} onClick={() => router.push("/mgmt/meetings")} title={m.title} style={{ fontSize: 10.5, background: "color-mix(in srgb, var(--blue) 16%, transparent)", color: "var(--blue)", borderRadius: 4, padding: "1px 5px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                    <Users size={10} className="shrink-0" /> {m.title}
                  </div>
                ))}
                {day?.tasks?.map((t) => (
                  <div key={t.id} onClick={() => router.push("/mgmt/tasks")} title={t.title} style={{ fontSize: 10.5, background: t.priority === "urgent" ? "color-mix(in srgb, var(--red) 14%, transparent)" : "var(--panel-2)", color: t.priority === "urgent" ? "var(--red)" : "var(--text-2)", borderRadius: 4, padding: "1px 5px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                    <ListTodo size={10} className="shrink-0" /> {t.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11.5, color: "var(--text-3)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Users size={12} style={{ color: "var(--blue)" }} /> การประชุม</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ListTodo size={12} /> งาน (กำหนดส่ง)</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "color-mix(in srgb, var(--red) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)" }} /> วันหยุด</span>
        </div>
      </div>
    </>
  );
}

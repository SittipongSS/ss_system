"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Users, ListTodo } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import Workspace from "@/components/ui/Workspace";
import MonthGrid, { isoOf } from "@/components/ui/MonthGrid";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";
import AccessDenied from "@/components/ui/AccessDenied";
import { accessState } from "@/lib/accessGate";
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

export default function MgmtCalendarPage() {
  const role = useRole();
  const canMgmt = useCan("mgmt:view");
  const router = useRouter();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  // holidays (ทั้งหมด) โหลดครั้งเดียว
  useEffect(() => {
    cachedFetchJson("/api/holidays").then((d) => setHolidays(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // tasks + meetings ตามปีของ cursor
  useEffect(() => {
    const y = cursor.y;
    apiFetch(`/api/mgmt/tasks?year=${y}`).then((r) => (r.ok ? r.json() : [])).then((d) => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch(`/api/mgmt/meetings?year=${y}`).then((r) => (r.ok ? r.json() : [])).then((d) => setMeetings(Array.isArray(d) ? d : [])).catch(() => {});
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

  const goMonth = (delta) => setCursor((c) => {
    const m = c.m + delta;
    if (m < 0) return { y: c.y - 1, m: 11 };
    if (m > 11) return { y: c.y + 1, m: 0 };
    return { y: c.y, m };
  });

  const todayISO = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  /* ⛔ ไม่มีสิทธิ์ = บอกให้รู้ พร้อมทางกลับ — เดิมเด้งไป /home เงียบ ๆ จนแยกไม่ออก
     ว่าเข้าไม่ได้หรือกดลิงก์ผิด (กฎ: docs/ui-visibility-rule.md) */
  if (accessState(role, canMgmt) === "denied") {
    return (
      <AccessDenied
        icon={<CalendarDays size={22} />}
        title="ปฏิทินงานบริหาร"
        message="งานบริหารเปิดให้ผู้บริหารและผู้ดูแลระบบเท่านั้น"
        back={{ href: "/mgmt", label: "กลับหน้าภาพรวมงานบริหาร" }}
      />
    );
  }
  return (
    <Workspace hideHeader back={{ href: "/mgmt", label: "กลับหน้าภาพรวมงานบริหาร" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><CalendarDays size={22} /></span> ปฏิทิน</h1>
          <p>การประชุม + งาน (ตามกำหนดส่ง) พร้อมวันหยุด — ในภาพเดียว</p>
        </div>
      </div>

      <div className={`glass-panel ${styles.card}`}>
        <div className={styles.bar}>
          <button onClick={() => goMonth(-1)} className="btn btn-secondary btn-icon" aria-label="เดือนก่อน"><ChevronLeft size={16} /></button>
          <div className={styles.month}>{MONTHS_TH[cursor.m]} {cursor.y}</div>
          <div className={styles.barActions}>
            <button onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })} className="btn btn-secondary sm">วันนี้</button>
            <button onClick={() => goMonth(1)} className="btn btn-secondary btn-icon" aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
          </div>
        </div>

        <MonthGrid
          year={cursor.y}
          month={cursor.m}
          todayISO={todayISO}
          holidayOf={(iso) => holidaySet.get(iso)}
        >
          {({ iso }) => {
            const day = byDay[iso];
            if (!day) return null;
            return (
              <>
                {day.meetings?.map((m) => (
                  <button type="button" key={m.id} onClick={() => router.push("/mgmt/meetings")} title={m.title}
                    className={`${styles.dayChip} ${styles.dayChipMeeting}`}>
                    <Users size={10} /> {m.title}
                  </button>
                ))}
                {day.tasks?.map((t) => (
                  <button type="button" key={t.id} onClick={() => router.push("/mgmt/tasks")} title={t.title}
                    className={`${styles.dayChip} ${t.priority === "urgent" ? styles.dayChipUrgent : ""}`.trim()}>
                    <ListTodo size={10} /> {t.title}
                  </button>
                ))}
              </>
            );
          }}
        </MonthGrid>

        <div className={styles.legend}>
          <span><Users size={12} className={styles.legendMeeting} /> การประชุม</span>
          <span><ListTodo size={12} /> งาน (กำหนดส่ง)</span>
          <span><i className={styles.legendHoliday} /> วันหยุด</span>
        </div>
      </div>
    </Workspace>
  );
}

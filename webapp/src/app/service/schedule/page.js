"use client";
// ── ตารางเข้าบริการ: ปฏิทินสัปดาห์ ช่าง × วัน (mig 0188 · S-2) ────────────
//
// ⭐ นี่คือ "ตาราง" ที่ผู้ใช้ขอตั้งแต่ต้น · แกนตั้ง = ช่าง · แกนนอน = วัน
// ⚠️ รอบแรก **ยังไม่ทำ time-grid พิกเซลต่อชั่วโมง** — งานวิ่งไซต์ 3–5 นัดต่อวัน
//    ไม่ต้องการความละเอียดระดับนั้น · ชิปเรียงตามเวลาในช่องวันพอแล้ว
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import ServiceVisitModal from "@/components/service/ServiceVisitModal";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { canBeServiceAssignee, canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import {
  VISIT_KIND_LABELS,
  VISIT_STATUS_LABELS,
  dayLoad,
  overlappingVisitIds,
  sortByTime,
  visitTimeText,
  visitWarnings,
  zoneSplit,
} from "@/lib/service/rounds";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";

const DAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const UNASSIGNED = "__unassigned__";

// จันทร์เป็นวันแรกของสัปดาห์ (ปฏิทินงานไทยอ่านแบบนี้)
function mondayOf(date) {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ServiceSchedulePage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [visits, setVisits] = useState([]);
  const [sites, setSites] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formVisit, setFormVisit] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formDefaults, setFormDefaults] = useState(null);
  const [toast, setToast] = useState(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { iso: toLocalISODate(d), date: d, weekend: d.getDay() === 0 || d.getDay() === 6 };
  }), [weekStart]);

  const range = useMemo(() => ({ from: days[0].iso, to: days[6].iso }), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/service/visits?from=${range.from}&to=${range.to}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดตารางไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ตารางเปล่า — "โหลดพัง" กับ "สัปดาห์นี้ไม่มีนัด"
      // หน้าตาเหมือนกันจนแยกไม่ออก แล้วช่างจะเชื่อว่าตัวเองว่าง
      setLoadError(e.message || "โหลดตารางไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  // รายชื่อช่าง + ไซต์ทั้งหมด โหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formVisit === undefined) return;
    if (!technicians.length) {
      (async () => {
        try {
          const res = await fetch("/api/pm/assignable-users");
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อช่างไม่สำเร็จ");
          // คนที่รับงานเข้าไซต์ได้ = ฝ่ายช่าง TS หรือทีมขาย SV (ดู canBeServiceAssignee)
          // 🐞 เดิมกรองเฉพาะ TS แต่ prod ยังไม่มีบัญชี TS สักคน → ช่องนี้ว่างเปล่า
          // ทุกนัดเลยไม่มีผู้รับผิดชอบ แล้ว "นัดของฉัน" ก็ว่างตลอดกาล
          setTechnicians((Array.isArray(data) ? data : []).filter(canBeServiceAssignee));
        } catch (e) {
          setToast({ kind: "error", msg: e.message });
        }
      })();
    }
    (async () => {
      try {
        const res = await fetch("/api/service/sites?includeInactive=0");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อไซต์ไม่สำเร็จ");
        setSites((prev) => {
          const merged = new Map(prev.map((s) => [s.id, s]));
          for (const site of Array.isArray(data) ? data : []) merged.set(site.id, site);
          return [...merged.values()];
        });
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [formVisit, technicians.length]);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const overlapIds = useMemo(() => overlappingVisitIds(visits), [visits]);

  // แถวของปฏิทิน = ช่างที่มีนัดในสัปดาห์นี้ + แถว "ยังไม่มอบหมาย" (ถ้ามี)
  const rows = useMemo(() => {
    const map = new Map();
    for (const visit of visits) {
      const key = visit.assigneeId || UNASSIGNED;
      if (!map.has(key)) {
        map.set(key, { key, name: visit.assigneeName || "ยังไม่มอบหมาย", visits: [] });
      }
      map.get(key).visits.push(visit);
    }
    const list = [...map.values()].sort((a, b) => {
      if (a.key === UNASSIGNED) return 1;
      if (b.key === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name, "th");
    });
    return list;
  }, [visits]);

  const loads = useMemo(() => {
    const map = new Map();
    for (const entry of dayLoad(visits)) {
      map.set(`${entry.assigneeId || UNASSIGNED}|${entry.date}`, entry);
    }
    return map;
  }, [visits]);

  const crossZone = useMemo(() => {
    const set = new Set();
    for (const entry of zoneSplit(visits, sitesById)) {
      if (entry.crossZone) set.add(`${entry.assigneeId || UNASSIGNED}|${entry.date}`);
    }
    return set;
  }, [visits, sitesById]);

  const saveVisit = async (form) => {
    const editing = !!formVisit;
    const res = await fetch(editing ? `/api/service/visits/${formVisit.id}` : "/api/service/visits", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");

    // ⭐ ปิดงานแล้ว server เสนอนัดรอบถัดไปมา — **ถามก่อนสร้าง** ไม่สร้างให้เอง
    const suggestion = data?.nextVisitSuggestion;
    if (suggestion) {
      setToast({ kind: "success", msg: `ปิดงานแล้ว · รอบถัดไปควรเข้า ${suggestion.scheduledDate}` });
      setFormDefaults(suggestion);
    } else {
      setToast({ kind: "success", msg: editing ? "บันทึกนัดแล้ว" : "สร้างนัดแล้ว" });
    }
    await load();
  };

  const openNew = (defaults) => {
    setFormDefaults(defaults);
    setFormVisit(null);
  };

  const weekLabel = `${days[0].date.getDate()} ${days[0].date.toLocaleDateString("th-TH", { month: "short" })} – ${days[6].date.getDate()} ${days[6].date.toLocaleDateString("th-TH", { month: "short" })} ${days[6].date.getFullYear()}`;
  const todayIso = businessDate();

  const shiftWeek = (weeks) => setWeekStart((prev) => {
    const next = new Date(prev);
    next.setDate(next.getDate() + weeks * 7);
    return next;
  });

  return (
    <Workspace
      icon={<CalendarDays size={20} aria-hidden="true" />}
      title="ตารางเข้าบริการ"
      subtitle="นัดของช่างรายสัปดาห์ · เตือนเวลาทับกัน วิ่งข้ามโซน และนัดนอกช่วงที่ไซต์ให้เข้า"
      headerRight={canEdit ? (
        <Button tone="primary" onClick={() => openNew({ scheduledDate: todayIso })} icon={<Plus size={15} aria-hidden="true" />}>
          นัดเข้าบริการ
        </Button>
      ) : null}
      toolbar={(
        <div className={styles.toolbar}>
          <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ก่อนหน้า" onClick={() => shiftWeek(-1)} icon={<ChevronLeft size={16} aria-hidden="true" />} />
          <strong className={styles.weekLabel}>{weekLabel}</strong>
          <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ถัดไป" onClick={() => shiftWeek(1)} icon={<ChevronRight size={16} aria-hidden="true" />} />
          <Button tone="neutral" variant="quiet" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>สัปดาห์นี้</Button>
          <span className={styles.count}>{visits.length} นัด</span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        <TableScroll family="grid" minWidth={900}>
          <table className={styles.board}>
            <thead>
              <tr>
                <th scope="col" className={styles.techCol}>ช่าง</th>
                {days.map((day) => (
                  <th key={day.iso} scope="col" className={day.weekend ? styles.weekend : undefined}>
                    <span className={styles.dayName}>{DAY_LABELS[day.date.getDay()]}</span>
                    <span className={day.iso === todayIso ? styles.today : undefined}>{day.date.getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyRow}>
                    สัปดาห์นี้ยังไม่มีนัดเข้าบริการ
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className={styles.techCol}>{row.name}</th>
                  {days.map((day) => {
                    const cellVisits = sortByTime(row.visits.filter((v) => v.scheduledDate === day.iso));
                    const loadKey = `${row.key}|${day.iso}`;
                    const load = loads.get(loadKey);
                    return (
                      <td key={day.iso} className={day.weekend ? styles.weekend : undefined}>
                        <div className={styles.cell}>
                          {(load?.over || crossZone.has(loadKey)) && (
                            <p className={styles.cellWarn}>
                              <AlertTriangle size={12} aria-hidden="true" />
                              {load?.over ? `${load.count} นัด` : null}
                              {load?.over && crossZone.has(loadKey) ? " · " : null}
                              {crossZone.has(loadKey) ? "ข้ามโซน" : null}
                            </p>
                          )}
                          {cellVisits.map((visit) => {
                            const site = sitesById.get(visit.siteId);
                            const warnings = visitWarnings(visit, { site, overlapIds });
                            return (
                              <button
                                key={visit.id}
                                type="button"
                                className={`${styles.visitChip} ${styles[`kind_${visit.kind}`] || ""} ${visit.status === "cancelled" || visit.status === "rescheduled" ? styles.visitMuted : ""}`}
                                onClick={() => setFormVisit(visit)}
                                title={[
                                  site?.name,
                                  site?.zone,
                                  VISIT_KIND_LABELS[visit.kind],
                                  VISIT_STATUS_LABELS[visit.status],
                                  ...warnings.map((w) => `⚠ ${w.message}`),
                                ].filter(Boolean).join(" · ")}
                              >
                                <span className={styles.visitTime}>{visitTimeText(visit)}</span>
                                <span className={styles.visitSite}>{site?.name || visit.siteId}</span>
                                {warnings.length > 0 && <AlertTriangle size={11} aria-hidden="true" />}
                              </button>
                            );
                          })}
                          {canEdit && (
                            <button
                              type="button"
                              className={styles.addCell}
                              aria-label={`เพิ่มนัดให้ ${row.name} วันที่ ${day.iso}`}
                              onClick={() => openNew({
                                scheduledDate: day.iso,
                                assigneeId: row.key === UNASSIGNED ? "" : row.key,
                                assigneeName: row.key === UNASSIGNED ? "" : row.name,
                              })}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <ServiceVisitModal
        open={formVisit !== undefined}
        visit={formVisit}
        sites={sites}
        technicians={technicians}
        defaults={formDefaults}
        onClose={() => { setFormVisit(undefined); setFormDefaults(null); }}
        onSave={saveVisit}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

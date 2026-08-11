"use client";
// ── บอร์ดตารางผลิต: ไลน์ × วัน (P-3) ──────────────────────────────────────
//
// ⭐ หน้าที่ตอบว่า **โรงงานรับไหวไหม** — คิวงาน (P-2) ตอบว่าต้องผลิตอะไรก่อน
// บอร์ดตอบว่าวางลงไปแล้วชนกันตรงไหน
// ⚠️ ช่องที่เกินกำลัง **เตือน ไม่บล็อก** — โรงงานจริงมี OT · ระบบที่บล็อกจะถูก
//    เลี่ยงไปวางนอกระบบ แล้วบอร์ดก็ตายทั้งใบ
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import Workspace from "@/components/ui/Workspace";
import ProductionJobModal from "@/components/pm/ProductionJobModal";
import Toast from "@/components/ui/Toast";
import { isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { capacityOn, overridesByDate } from "@/lib/pm/productionLines";
import { lineLoad } from "@/lib/pm/productionPlan";
import { canEditProduction } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtMonthShort, fmtNumber } from "@/lib/format";

const DAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const WEEKS = 4;

function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ProductionBoardPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditProduction({ role, team, teams, department }), [role, team, teams, department]);

  const [start, setStart] = useState(() => mondayOf(new Date()));
  const [lines, setLines] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [capacityDays, setCapacityDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formJob, setFormJob] = useState(undefined);
  const [toast, setToast] = useState(null);

  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { iso: toLocalISODate(d), date: d, off: !isBusinessDay(d) };
  }), [start]);

  const range = useMemo(() => ({ from: days[0].iso, to: days[days.length - 1].iso }), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/production/board?from=${range.from}&to=${range.to}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดบอร์ดไม่สำเร็จ");
      setLines(Array.isArray(data?.lines) ? data.lines : []);
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setCapacityDays(Array.isArray(data?.capacityDays) ? data.capacityDays : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์บอร์ดว่าง — "โหลดพัง" กับ "ไลน์ว่างทั้งเดือน"
      // หน้าตาเหมือนกันจนแยกไม่ออก แล้ว PC จะวางงานทับของที่มีอยู่
      setLoadError(e.message || "โหลดบอร์ดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  // override กำลังรายวัน แยกตามไลน์ — ใช้ทั้งตอนคำนวณโหลดและตอนวาดช่องว่าง
  const overridesByLine = useMemo(() => {
    const map = new Map();
    for (const line of lines) {
      map.set(line.id, overridesByDate(capacityDays.filter((c) => c.lineId === line.id)));
    }
    return map;
  }, [lines, capacityDays]);

  const load2 = useMemo(
    () => lineLoad(jobs, lines, { from: range.from, to: range.to, overridesByLine }),
    [jobs, lines, range.from, range.to, overridesByLine],
  );

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const saveJob = async (form) => {
    const res = await fetch(`/api/production/jobs/${formJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: "บันทึกงานผลิตแล้ว" });
    await load();
  };

  const shiftWeeks = (n) => setStart((prev) => {
    const next = new Date(prev);
    next.setDate(next.getDate() + n * 7);
    return next;
  });

  const todayIso = businessDate();
  const rangeLabel = `${days[0].date.getDate()} ${fmtMonthShort(days[0].date)} – ${days[days.length - 1].date.getDate()} ${fmtMonthShort(days[days.length - 1].date)} ${days[days.length - 1].date.getFullYear()}`;

  // จำนวนช่องที่จองเกินกำลัง — ตัวเลขที่ต้องเห็นก่อนเลื่อนดูทั้งบอร์ด
  const overloaded = useMemo(
    () => [...load2.values()].filter((c) => c.capacity != null && c.capacity > 0 && c.planned > c.capacity).length,
    [load2],
  );

  return (
    <Workspace
      icon={<CalendarRange size={20} aria-hidden="true" />}
      title="บอร์ดตารางผลิต"
      subtitle="ไลน์ × วัน · เห็นทันทีว่าวันไหนจองเกินกำลัง และงานไหนวางก่อนของมาถึง"
      toolbar={(
        <div className={styles.toolbar}>
          <Button tone="neutral" variant="quiet" iconOnly aria-label="ย้อน 1 สัปดาห์" onClick={() => shiftWeeks(-1)} icon={<ChevronLeft size={16} aria-hidden="true" />} />
          <strong className={styles.rangeLabel}>{rangeLabel}</strong>
          <Button tone="neutral" variant="quiet" iconOnly aria-label="ถัดไป 1 สัปดาห์" onClick={() => shiftWeeks(1)} icon={<ChevronRight size={16} aria-hidden="true" />} />
          <Button tone="neutral" variant="quiet" size="sm" onClick={() => setStart(mondayOf(new Date()))}>สัปดาห์นี้</Button>
          <span className={styles.counts}>
            {overloaded > 0 && <strong className={styles.overCount}>เกินกำลัง {overloaded} ช่อง</strong>}
            {jobs.length} งานบนบอร์ด
          </span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={5} /> : loadError ? null : lines.length === 0 ? (
        <EmptyState icon={CalendarRange}>
          ยังไม่มีไลน์ผลิต — ตั้งค่าไลน์ก่อนที่เมนู &quot;ไลน์ผลิต&quot; แล้วบอร์ดจะมีแถวให้วางงาน
        </EmptyState>
      ) : (
        <TableScroll family="matrix" minWidth={1400}>
          <table className={styles.board}>
            <thead>
              <tr>
                <th scope="col" className={styles.lineCol}>ไลน์ผลิต</th>
                {days.map((day) => (
                  <th key={day.iso} scope="col" className={day.off ? styles.off : undefined}>
                    <span className={styles.dayName}>{DAY_LABELS[day.date.getDay()]}</span>
                    <span className={day.iso === todayIso ? styles.today : undefined}>{day.date.getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={line.isActive === false ? styles.inactive : undefined}>
                  <th scope="row" className={styles.lineCol}>
                    {line.name}
                    <span className={styles.lineMeta}>
                      {line.code}
                      {line.capacityPerDay ? ` · ${fmtNumber(line.capacityPerDay)} ${line.unit || ""}/วัน` : " · ยังไม่กรอกกำลัง"}
                    </span>
                  </th>
                  {days.map((day) => {
                    const cell = load2.get(`${line.id}|${day.iso}`);
                    const capacity = capacityOn(line, day.iso, overridesByLine.get(line.id) || new Map());
                    // ⚠️ กำลัง null = "ยังไม่กรอก" ไม่ใช่ 0 — ช่องนั้นต้องไม่ขึ้นแดง
                    const over = cell && capacity != null && capacity > 0 && cell.planned > capacity;
                    const closed = capacity === 0;
                    return (
                      <td key={day.iso} className={[
                        day.off ? styles.off : "",
                        closed ? styles.closed : "",
                        over ? styles.over : "",
                      ].filter(Boolean).join(" ")}>
                        {cell ? (
                          <div className={styles.cell}>
                            <span className={styles.pct}>
                              {cell.pct == null ? "—" : `${cell.pct}%`}
                              {over && <AlertTriangle size={11} aria-hidden="true" />}
                            </span>
                            {cell.jobs.map((chip) => {
                              const job = jobsById.get(chip.id);
                              // ⚠️ ยกออกมาเป็นตัวแปร ไม่ใช่แทรกจำนวนของหมุดในเทมเพลตตรง ๆ —
                              // ตัวนับคลาสของหน้าต้นแบบ (badgeFamilies.test.mjs) นับสตริงที่มี
                              // ชื่อคลาสอยู่ข้างใน แล้วเทมเพลตแบบนั้นถูกนับเป็นจุดใช้งานทั้งที่ไม่ใช่
                              const qtyToday = fmtNumber(chip.qty);
                              const late = job?.readiness && job.readiness.lastDue
                                && String(job.plannedStart) < String(job.readiness.lastDue);
                              return (
                                <button
                                  key={chip.id}
                                  type="button"
                                  className={`${styles.chipJob} ${late ? styles.chipLate : ""}`}
                                  onClick={() => canEdit && setFormJob(job)}
                                  disabled={!canEdit}
                                  title={[
                                    chip.code,
                                    chip.productName,
                                    `${qtyToday} วันนี้`,
                                    job?.readiness?.label,
                                    late ? "⚠ วางก่อนของมาถึง" : null,
                                  ].filter(Boolean).join(" · ")}
                                >
                                  {chip.productName || chip.code}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={styles.cell}>
                            {/* ช่องว่าง: บอกกำลังที่เหลือ เพื่อให้ PC เห็นที่ว่างโดยไม่ต้องเปิดหน้าไลน์
                                ⚠️ วันหยุด/เสาร์-อาทิตย์ไม่ต้องเขียน "ปิด" — พื้นเทาบอกอยู่แล้ว
                                และสัปดาห์ที่มีวันหยุดยาวจะกลายเป็นกำแพงคำว่า "ปิด" เต็มแถว
                                จนมองไม่เห็นวันที่ว่างจริง · เขียนเฉพาะไลน์ที่ถูกสั่งปิดในวันทำการ */}
                            <span className={styles.free}>
                              {capacity == null ? "" : capacity === 0 ? (day.off ? "" : "ปิดไลน์") : fmtNumber(capacity)}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <ProductionJobModal
        open={formJob !== undefined}
        job={formJob}
        lines={lines}
        onClose={() => setFormJob(undefined)}
        onSave={saveJob}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

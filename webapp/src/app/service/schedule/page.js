"use client";
// ── ตารางเข้าบริการ: ปฏิทินสัปดาห์ ช่าง × วัน (mig 0188 · S-2) ────────────
//
// ⭐ นี่คือ "ตาราง" ที่ผู้ใช้ขอตั้งแต่ต้น · แกนตั้ง = ช่าง · แกนนอน = วัน
// ⚠️ รอบแรก **ยังไม่ทำ time-grid พิกเซลต่อชั่วโมง** — งานวิ่งไซต์ 3–5 นัดต่อวัน
//    ไม่ต้องการความละเอียดระดับนั้น · ชิปเรียงตามเวลาในช่องวันพอแล้ว
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
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
  VISIT_KINDS,
  VISIT_KIND_LABELS,
  VISIT_STATUS_LABELS,
  dayLoad,
  overlappingVisitIds,
  sortByTime,
  visitTimeText,
  visitWarnings,
  routeZoneSplit,
} from "@/lib/service/rounds";
import { evaluateVisitGate, gateBlocker, gatePassed } from "@/lib/service/visitGate";
import { isDraftVisit } from "@/lib/service/visitStatus";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtMonthShort } from "@/lib/format";

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

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/service/visits?from=${range.from}&to=${range.to}`);
      const data = await res.json().catch(() => null);
      if (!isLatest()) return; // เลื่อนสัปดาห์ระหว่างรอ — ตารางต้องเป็นของช่วงที่ค้างอยู่
      if (!res.ok) throw new Error(data?.error || "โหลดตารางไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ตารางเปล่า — "โหลดพัง" กับ "สัปดาห์นี้ไม่มีนัด"
      // หน้าตาเหมือนกันจนแยกไม่ออก แล้วช่างจะเชื่อว่าตัวเองว่าง
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดตารางไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [range.from, range.to, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

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
          // ทุกนัดเลยไม่มีผู้รับผิดชอบ แล้ว "งานวันนี้" ของช่างก็ว่างตลอดกาล
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

  /* ⭐ ร่างไม่ขึ้นกริดและ **ไม่นับภาระของช่าง** (มติผู้ใช้ 2026-08-28) — ถ้านับ
     ตัวเลข "เกินภาระ" จะเตือนจากงานที่ยังไม่แน่ว่าจะได้ไป และหัวหน้าจะเลิกเชื่อคำเตือน
     ⚠️ ตัวตัดสินคือ `isDraftVisit` ตัวเดียวกับที่ server ใช้ ห้ามเทียบสตริงตรงนี้ */
  const drafts = useMemo(() => visits.filter(isDraftVisit), [visits]);
  const boardVisits = useMemo(() => visits.filter((v) => !isDraftVisit(v)), [visits]);

  const overlapIds = useMemo(() => overlappingVisitIds(boardVisits), [boardVisits]);

  // แถวของปฏิทิน = ช่างที่มีนัดในสัปดาห์นี้ + แถว "ยังไม่มอบหมาย" (ถ้ามี)
  const rows = useMemo(() => {
    const map = new Map();
    for (const visit of boardVisits) {
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
  }, [boardVisits]);

  const loads = useMemo(() => {
    const map = new Map();
    for (const entry of dayLoad(boardVisits)) {
      map.set(`${entry.assigneeId || UNASSIGNED}|${entry.date}`, entry);
    }
    return map;
  }, [boardVisits]);

  const crossRouteZone = useMemo(() => {
    const set = new Set();
    for (const entry of routeZoneSplit(boardVisits, sitesById)) {
      if (entry.crossRouteZone) set.add(`${entry.assigneeId || UNASSIGNED}|${entry.date}`);
    }
    return set;
  }, [boardVisits, sitesById]);

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

  const weekLabel = `${days[0].date.getDate()} ${fmtMonthShort(days[0].date)} – ${days[6].date.getDate()} ${fmtMonthShort(days[6].date)} ${days[6].date.getFullYear()}`;
  const todayIso = businessDate();

  const shiftWeek = (weeks) => setWeekStart((prev) => {
    const next = new Date(prev);
    next.setDate(next.getDate() + weeks * 7);
    return next;
  });

  /* ⚠️ ปุ่มบนหัวหน้านี้เป็น **ปุ่มรอง** โดยเจตนา (มติผู้ใช้ 2026-08-28):
     *TS ไม่ใช่ต้นทางของงาน* — นัดเกิดจากรอบบริการของไซต์ หรือจากงานนอกรอบที่มี
     ต้นเรื่อง (ลูกค้าแจ้งเสีย · ติดตั้งตามใบสั่งขาย) แล้วทุกใบต้องผ่านด่านก่อน
     ขึ้นตาราง · หน้านี้ทำหน้าที่ **วาง** งานที่มีอยู่แล้ว ไม่ใช่ **สร้าง** งาน
     จึงไม่มีปุ่มสีแบรนด์ (สีแบรนด์ = เริ่มของใหม่ หน้าละหนึ่งปุ่ม) */
  return (
    <Workspace
      icon={<CalendarDays size={20} aria-hidden="true" />}
      title="จัดคิวช่าง"
      subtitle="นัดของช่างรายสัปดาห์ · เตือนเวลาทับกัน วิ่งข้ามเขต และนัดนอกช่วงที่ไซต์ให้เข้า"
      headerRight={canEdit ? (
        <Button tone="neutral" onClick={() => openNew({ scheduledDate: todayIso })} icon={<Plus size={15} aria-hidden="true" />}>
          งานนอกรอบ
        </Button>
      ) : null}
      toolbar={(
        <div className="toolbar">
          <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ก่อนหน้า" onClick={() => shiftWeek(-1)} icon={<ChevronLeft size={16} aria-hidden="true" />} />
          <strong className={styles.weekLabel}>{weekLabel}</strong>
          <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ถัดไป" onClick={() => shiftWeek(1)} icon={<ChevronRight size={16} aria-hidden="true" />} />
          <Button tone="neutral" variant="quiet" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>สัปดาห์นี้</Button>
          <span className={styles.count}>{boardVisits.length} นัด</span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {/* ⭐ คิวรอจัด — ร่างที่ยังไม่ผ่านด่าน อยู่ **ข้างกริด ไม่ใช่ในกริด**
          ถ้าวางปนกับนัดจริง ช่างจะอ่านว่าเป็นงานของตัวเองแล้วออกไปทำ ทั้งที่ยังไม่ผ่านด่าน
          แยกสองกลุ่ม (ผ่านแล้ว / ติดอะไรอยู่) เพราะสองกลุ่มนี้ต้องการคนละการกระทำ */}
      {!loading && !loadError && drafts.length > 0 && (
        <section className={styles.queue} aria-label="คิวรอจัด">
          <h2 className={styles.queueTitle}>
            คิวรอจัด {drafts.length} ใบ
            <span>ร่างยังไม่ขึ้นตาราง ไม่นับภาระของช่าง และไม่โผล่ในงานวันนี้</span>
          </h2>
          <ul className={styles.queueList}>
            {drafts.map((visit) => {
              const site = sitesById.get(visit.siteId);
              const gate = evaluateVisitGate(visit, { site });
              const ready = gatePassed(gate);
              return (
                <li key={visit.id} data-ready={ready ? "yes" : "no"}>
                  <button type="button" className={styles.queueRow} onClick={() => setFormVisit(visit)}>
                    <b>{site?.name || visit.siteId}</b>
                    <span>{visit.scheduledDate} · {VISIT_KIND_LABELS[visit.kind]}</span>
                    <span className={styles.queueReason}>
                      {ready ? "ผ่านด่านแล้ว — เปิดเพื่อปล่อยเข้าคิว" : gateBlocker(gate)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        /* 🐞 เดิมส่งตระกูล grid ซึ่ง **ไม่มีอยู่จริง** ในระบบตาราง (Table.module.css
           ไม่มีกฎของมันเลย และทั้งเว็บใช้ที่นี่ที่เดียว) ⇒ ได้กฎกลางของ [data-family]
           มาครึ่งเดียว: คอลัมน์ชื่อช่างไม่ตรึง · vertical-align: top ที่ไฟล์นี้เขียนไว้
           ถูกกฎกลาง (0,2,1) ทับ · หัววัน/ชื่อช่างเหลือ 9.5px จนเลขวันที่เป็นตัวเล็กสุด
           ในหน้า · ตัวที่ตรึงคอลัมน์แรกคือ matrix · ชิดบนทั้งแถวคือ cells stacked */
        <TableScroll family="matrix" cells="stacked" minWidth={900}>
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
                  {/* ชื่อช่างกดได้ → หน้า "งานวันนี้" ของคนนั้น (?user=) — ทางเข้า
                      มุมมอง "ไปแทนกัน" หลังตัดปุ่มทั้งทีมออกจากหน้าช่าง (มติ 2026-08-02 ข้อ 2)
                      แถว "ยังไม่มอบหมาย" ไม่มีเจ้าของ จึงไม่มีลิงก์ */}
                  <th scope="row" className={styles.techCol}>
                    {row.key === UNASSIGNED ? row.name : (
                      <Link href={`/service/today?user=${encodeURIComponent(row.key)}`} className={styles.techLink}>
                        {row.name}
                      </Link>
                    )}
                  </th>
                  {days.map((day) => {
                    const cellVisits = sortByTime(row.visits.filter((v) => v.scheduledDate === day.iso));
                    const loadKey = `${row.key}|${day.iso}`;
                    const load = loads.get(loadKey);
                    return (
                      <td key={day.iso} className={day.weekend ? styles.weekend : undefined}>
                        <div className={styles.cell}>
                          {(load?.over || crossRouteZone.has(loadKey)) && (
                            <p className={styles.cellWarn}>
                              <AlertTriangle size={12} aria-hidden="true" />
                              {load?.over ? `${load.count} นัด` : null}
                              {load?.over && crossRouteZone.has(loadKey) ? " · " : null}
                              {crossRouteZone.has(loadKey) ? "ข้ามเขต" : null}
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
                                  site?.routeZone,
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
                          {/* 🔴 เดิมมีปุ่ม "+" อยู่ **ทุกช่องว่าง** ของกริด ซึ่งอ่านได้ว่า
                              จิ้มตรงไหนก็สร้างงานได้ตามใจ — ขัดกติกา "TS ไม่ใช่ต้นทางของงาน"
                              (มติผู้ใช้ 2026-08-28) · ถอดออกแล้ว การวางงานลงช่องจะมาจาก
                              คิวรอจัดเท่านั้น ซึ่งแสดงเฉพาะร่างที่ผ่านด่านแล้ว */}
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

      {/* ชิปนัดสื่อชนิดงานด้วยสีอย่างเดียว และรายละเอียดที่เหลืออยู่ใน `title=` ซึ่ง
          บนจอสัมผัสไม่มีอยู่จริง — คำอธิบายสีจึงเป็นทางเดียวที่อ่านสีออกโดยไม่ต้องเปิดทีละใบ */}
      {!loading && !loadError && visits.length > 0 && (
        <ul className={styles.legend} aria-label="คำอธิบายสีของชนิดงาน">
          {VISIT_KINDS.map((kind) => (
            <li key={kind} className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles[`kind_${kind}`] || ""}`} aria-hidden="true" />
              {VISIT_KIND_LABELS[kind] || kind}
            </li>
          ))}
        </ul>
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

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
import EmptyState from "@/components/ui/EmptyState";
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
  overlappingVisitIds,
  sortByTime,
  visitTimeText,
  visitWarnings,
  routeZoneSplit,
} from "@/lib/service/rounds";
import { evaluateVisitGate, gatePassed, gateReasons } from "@/lib/service/visitGate";
import { isDraftVisit } from "@/lib/service/visitStatus";
import {
  ALL_TEAMS,
  filterRowsByTeam,
  teamByUser,
  teamFilterOptions,
  teamLoad,
} from "@/lib/service/crewTeams";
import Segmented from "@/components/ui/Segmented";
import { dayWorkload, overloaded, workloadText } from "@/lib/service/visitLoad";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtMonthShort, fmtNumber, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

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
  const [workload, setWorkload] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formVisit, setFormVisit] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formDefaults, setFormDefaults] = useState(null);
  const [toast, setToast] = useState(null);
  /* ⭐ ทีมช่าง (mig 0310 · T-4) — โหลดทะเบียนทีมของฝ่าย TS มาใช้ **เป็นมุมมอง**
     ⚠️ ไม่ใช่ด่านสิทธิ์: กรองแล้วยังกดดูทีมอื่นได้เสมอ ตัวกั้นจริงยังเป็น canEditService */
  const [crew, setCrew] = useState({ teams: [], members: [] });
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);
  /* ⭐ มุมมอง (F-6) — กริดสัปดาห์อ่านภาพรวมได้ดี แต่ **บนมือถือกับตอนแจกงานรายวัน
     มันคือตารางที่ต้องเลื่อนสองแกน** · "รายการ" คือมุมมองเดียวที่ใช้ได้จริงบนจอแคบ */
  const [view, setView] = useState("week");

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
      const res = await apiFetch(`/api/service/visits?from=${range.from}&to=${range.to}`);
      const data = await res.json().catch(() => null);
      if (!isLatest()) return; // เลื่อนสัปดาห์ระหว่างรอ — ตารางต้องเป็นของช่วงที่ค้างอยู่
      if (!res.ok) throw new Error(data?.error || "โหลดตารางไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
      // ภาระรายไซต์ (เครื่อง/แพ็ค) — server นับมาให้แล้ว ไม่ต้องไล่ยิงรายไซต์
      setWorkload(data?.workload && typeof data.workload === "object" ? data.workload : {});
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

  /* ทะเบียนทีมช่างโหลดครั้งเดียว — ไม่ผูกกับสัปดาห์ที่เลื่อนไปมา
     ⚠️ โหลดไม่ได้ = ไม่มีตัวกรองทีม ไม่ใช่หน้าพัง (ทีมเป็นมุมมอง ไม่ใช่ด่าน) */
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/teams?department=TS");
        const body = await res.json().catch(() => null);
        if (res.ok) setCrew({ teams: body?.teams || [], members: body?.members || [] });
      } catch { /* เงียบได้ — ตารางยังใช้งานได้เต็มที่โดยไม่มีทีม */ }
    })();
  }, []);

  // รายชื่อช่าง + ไซต์ทั้งหมด โหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formVisit === undefined) return;
    if (!technicians.length) {
      (async () => {
        try {
          const res = await apiFetch("/api/pm/assignable-users");
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
        const res = await apiFetch("/api/service/sites?includeInactive=0");
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

  const crewByUser = useMemo(() => teamByUser(crew.members), [crew.members]);
  const teamOptions = useMemo(
    () => teamFilterOptions(crew.teams, rows, crewByUser),
    [crew.teams, rows, crewByUser],
  );
  const teamRows = useMemo(
    () => filterRowsByTeam(rows, teamFilter, crewByUser),
    [rows, teamFilter, crewByUser],
  );
  const crewLoad = useMemo(
    () => teamLoad({ teams: crew.teams, rows, members: crew.members, byUser: crewByUser }),
    [crew.teams, crew.members, rows, crewByUser],
  );

  /* ⭐ ภาระนับเป็น **เครื่อง + แพ็ค** ไม่ใช่จำนวนนัด (F-6) — ไซต์หนึ่งมีเครื่องตัวเดียว
     อีกไซต์มี 12 ตัว "วันนี้ 5 นัด" จึงบอกไม่ได้เลยว่าช่างคนนั้นทำไหวไหม
     ⚠️ `dayLoad` เดิม (นับนัด/คน/วัน) ยังใช้อยู่ที่อื่น — ที่นี่เปลี่ยนมาใช้ตัวที่
     รู้จักของหน้างาน แล้วเตือน "เกินภาระ" จากจำนวนเครื่อง */
  const loads = useMemo(
    () => dayWorkload(boardVisits, (siteId) => workload[siteId]),
    [boardVisits, workload],
  );

  const crossRouteZone = useMemo(() => {
    const set = new Set();
    for (const entry of routeZoneSplit(boardVisits, sitesById)) {
      if (entry.crossRouteZone) set.add(`${entry.assigneeId || UNASSIGNED}|${entry.date}`);
    }
    return set;
  }, [boardVisits, sitesById]);

  const saveVisit = async (form) => {
    const editing = !!formVisit;
    const res = await apiFetch(editing ? `/api/service/visits/${formVisit.id}` : "/api/service/visits", {
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
          {/* ⭐ ตัวกรองทีมช่าง — โผล่เฉพาะเมื่อฝ่ายมีทีมจริง (มากกว่า "ทุกทีม" อย่างเดียว)
              ตัวกรองที่มีตัวเลือกเดียวคือของประดับ */}
          <Segmented
            value={view}
            onChange={setView}
            ariaLabel="มุมมองตาราง"
            options={[
              { value: "week", label: "สัปดาห์" },
              { value: "list", label: "รายการ" },
            ]}
          />
          {teamOptions.length > 1 && (
            <Segmented
              value={teamFilter}
              onChange={setTeamFilter}
              options={teamOptions}
              ariaLabel="กรองตามทีมช่าง"
            />
          )}
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {/* ⭐ กติกาที่ตัดสินไปแล้วต้องอ่านได้จากบนจอ ไม่ใช่อยู่แต่ในคอมเมนต์โค้ด
          (มติผู้ใช้ 2026-08-28: TS ไม่ใช่ต้นทางของงาน) */}
      <p className={styles.placeNote}>
        หน้านี้ <b>“วาง”</b> งาน ไม่ได้ <b>“สร้าง”</b> งาน — นัดเกิดจากรอบบริการของไซต์
        หรือจากงานนอกรอบที่มีต้นเรื่อง และขึ้นตารางไม่ได้จนกว่าจะผ่านด่าน
      </p>

      {/* ⭐ ภาระรายทีมของสัปดาห์ที่เปิดอยู่ — ทีมที่มีคนแต่ไม่มีนัดขึ้นเป็น 0
          ไม่ใช่หายไป เพราะทีมว่างคือทีมที่รับงานเพิ่มได้ ซึ่งเป็นสิ่งที่คนจัดคิวหาอยู่ */}
      {!loading && !loadError && crewLoad.length > 0 && (
        <ul className={styles.teamLoad} aria-label="ภาระรายทีม">
          {crewLoad.map((team) => (
            <li key={team.code} data-empty={team.visits === 0 ? "yes" : undefined}>
              <b>{team.name}</b>
              <span>{fmtNumber(team.visits)} นัด</span>
              <span>{team.people ? `${fmtNumber(team.people)} คน` : naText(null)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ⭐ คิวรอจัด — ร่างที่ยังไม่ผ่านด่าน อยู่ **ข้างกริด ไม่ใช่ในกริด**
          ถ้าวางปนกับนัดจริง ช่างจะอ่านว่าเป็นงานของตัวเองแล้วออกไปทำ ทั้งที่ยังไม่ผ่านด่าน
          แยกสองกลุ่ม (ผ่านแล้ว / ติดอะไรอยู่) เพราะสองกลุ่มนี้ต้องการคนละการกระทำ */}
      {!loading && !loadError && drafts.length > 0 && (
        <section className={styles.queue} aria-label="คิวรอจัด">
          <h2 className={styles.queueTitle}>
            คิวรอจัด {drafts.length} ใบ
            <span>ร่างยังไม่ขึ้นตาราง ไม่นับภาระของช่าง และไม่โผล่ในงานวันนี้</span>
          </h2>
          {/* ⭐ แยกสองกลุ่ม (F-6) — "ผ่านด่านแล้ว" กับ "ติดด่าน" ต้องการคนละการกระทำ:
              กลุ่มแรกแค่กดปล่อย · กลุ่มหลังต้องไปแก้อะไรบางอย่างก่อน
              ⚠️ กองรวมกันเมื่อไร คนจัดคิวจะไล่กดทีละใบเพื่อหาว่าอันไหนกดได้ */}
          {["ready", "blocked"].map((bucket) => {
            const rows = drafts
              .map((visit) => {
                const site = sitesById.get(visit.siteId);
                const gate = evaluateVisitGate(visit, { site });
                return { visit, site, gate, ready: gatePassed(gate) };
              })
              .filter((row) => (bucket === "ready" ? row.ready : !row.ready));
            if (!rows.length) return null;
            return (
              <div key={bucket} className={styles.queueGroup}>
                <h3 className={styles.queueGroupTitle} data-bucket={bucket}>
                  {bucket === "ready"
                    ? `ผ่านด่านแล้ว ${rows.length} ใบ — กดเพื่อปล่อยเข้าคิว`
                    : `ติดด่าน ${rows.length} ใบ — ต้องแก้ก่อน`}
                </h3>
                <ul className={styles.queueList}>
                  {rows.map(({ visit, site, gate, ready }) => (
                    <li key={visit.id} data-ready={ready ? "yes" : "no"}>
                      <button type="button" className={styles.queueRow} onClick={() => setFormVisit(visit)}>
                        <b>{site?.name || visit.siteId}</b>
                        <span>{visit.scheduledDate} · {VISIT_KIND_LABELS[visit.kind]}</span>
                        <span className={styles.queueReason}>
                          {ready ? "ผ่านด่านแล้ว — เปิดเพื่อปล่อยเข้าคิว" : gateReasons(gate).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {loading ? <SkeletonRows rows={4} /> : loadError || view !== "week" ? null : (
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
              {teamRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyRow}>
                    สัปดาห์นี้ยังไม่มีนัดเข้าบริการ
                  </td>
                </tr>
              ) : teamRows.map((row) => (
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
                          {(overloaded(load) || crossRouteZone.has(loadKey)) && (
                            <p className={styles.cellWarn}>
                              <AlertTriangle size={12} aria-hidden="true" />
                              {overloaded(load) ? workloadText(load) : null}
                              {overloaded(load) && crossRouteZone.has(loadKey) ? " · " : null}
                              {crossRouteZone.has(loadKey) ? "ข้ามเขต" : null}
                            </p>
                          )}
                          {/* วันที่ยังไม่เกินภาระก็ต้องอ่านออกว่าหนักแค่ไหน — ไม่ใช่
                              เห็นตัวเลขเฉพาะตอนที่สายไปแล้ว */}
                          {!overloaded(load) && load?.assets > 0 && (
                            <p className={styles.cellLoad}>{workloadText(load)}</p>
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
                                {/* งานที่ไปกันหลายคน — คนจัดคิวต้องเห็นว่านัดนี้กินช่างไปกี่คน
                                    ก่อนจะแจกงานอื่นให้คนที่ถูกดึงไปช่วยแล้ว */}
                                {visit.assistantIds?.length > 0 && (
                                  <span className={styles.visitCrew}>+{visit.assistantIds.length}</span>
                                )}
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

      {/* ⭐ มุมมองรายการ (F-6) — เรียงตามวันแล้วตามเวลา · ใช้ได้จริงบนจอแคบซึ่งกริด
          สัปดาห์ทำไม่ได้ (ต้องเลื่อนสองแกน) · ข้อมูลชุดเดียวกับกริดทุกอย่าง
          รวมทั้งตัวกรองทีมและการซ่อนร่าง */}
      {!loading && !loadError && view === "list" && (
        teamRows.length === 0 ? (
          <EmptyState icon={CalendarDays}>สัปดาห์นี้ยังไม่มีนัดเข้าบริการ</EmptyState>
        ) : (
          <ul className={styles.listView}>
            {days.map((day) => {
              const dayVisits = sortByTime(
                teamRows.flatMap((row) => row.visits.filter((v) => v.scheduledDate === day.iso)),
              );
              if (!dayVisits.length) return null;
              return (
                <li key={day.iso}>
                  <h3 className={styles.listDay} data-today={day.iso === todayIso ? "yes" : undefined}>
                    {DAY_LABELS[day.date.getDay()]} {day.date.getDate()} {fmtMonthShort(day.iso)}
                    <span>{dayVisits.length} นัด</span>
                  </h3>
                  <ul className={styles.listRows}>
                    {dayVisits.map((visit) => {
                      const site = sitesById.get(visit.siteId);
                      const warnings = visitWarnings(visit, { site, overlapIds });
                      const load = workload[visit.siteId];
                      return (
                        <li key={visit.id}>
                          <button type="button" className={styles.listRow} onClick={() => setFormVisit(visit)}>
                            <span className={styles.listTime}>{visitTimeText(visit) || "ทั้งวัน"}</span>
                            <span className={styles.listSite}>
                              <b>{site?.name || visit.siteId}</b>
                              <span>
                                {VISIT_KIND_LABELS[visit.kind]}
                                {site?.routeZone ? ` · ${site.routeZone}` : ""}
                                {load?.assets ? ` · ${load.assets} เครื่อง` : ""}
                              </span>
                            </span>
                            <span className={styles.listWho}>
                              {naText(visit.assigneeName)}
                              {visit.assistantIds?.length > 0 ? ` +${visit.assistantIds.length}` : ""}
                            </span>
                            {warnings.length > 0 && <AlertTriangle size={13} aria-hidden="true" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* ชิปนัดสื่อชนิดงานด้วยสีอย่างเดียว และรายละเอียดที่เหลืออยู่ใน `title=` ซึ่ง
          บนจอสัมผัสไม่มีอยู่จริง — คำอธิบายสีจึงเป็นทางเดียวที่อ่านสีออกโดยไม่ต้องเปิดทีละใบ */}
      {!loading && !loadError && view === "week" && visits.length > 0 && (
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

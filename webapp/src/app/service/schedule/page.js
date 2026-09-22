"use client";
// ── จัดคิวเจ้าหน้าที่: รายการงาน (ข้ามสัปดาห์) คู่กับตารางสัปดาห์ เจ้าหน้าที่ × วัน ──
//
// ⭐ มติผู้ใช้ 2026-09-22 (หลังดูม็อก https://claude.ai/artifact/2XYyCYY3i12yCCUBb6BteY):
//    1. มีแผง "รายการงาน" — รอจัด · ค้าง · จัดแล้ว · ปิดแล้ว — **ไม่ผูกกับสัปดาห์ที่เปิด**
//    2. วาง **คู่กัน** รายการซ้าย ตารางขวา (ทางเลือก B) · จอแคบถอยเป็นบน-ล่าง
//    3. ทีม = ขอบเขตของทั้งหน้า · สัปดาห์ = ของตารางเท่านั้น (แทนมติ 15/09 "สัปดาห์กับทีมคุมทุกบล็อก")
//    4. ปุ่มปล่อยร่างเรียกว่า "ปล่อยขึ้นตาราง" (เดิม "ปล่อยเข้าคิว" — คำว่าคิวซ้อนสามความหมาย)
// 🐞 ที่มา: ของเดิมมีแต่ปฏิทิน · "คิวรอจัด" โผล่เฉพาะร่างในสัปดาห์ที่เปิด (ร่างของรอบบริการสร้าง
//    ล่วงหน้า 90 วัน ⇒ ส่วนใหญ่มองไม่เห็น) · นัดค้างต้องกดย้อนสัปดาห์หาเอง
//
// ⚠️ รอบแรก **ยังไม่ทำ time-grid พิกเซลต่อชั่วโมง** — งานวิ่งไซต์ 3–5 นัดต่อวัน
//    ไม่ต้องการความละเอียดระดับนั้น · ชิปเรียงตามเวลาในช่องวันพอแล้ว
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Hourglass, Plus, Search, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import GatedAction from "@/components/ui/GatedAction";
import Pager from "@/components/ui/Pager";
import thaiText from "@/components/ThaiText";
import StatusNotice from "@/components/ui/StatusNotice";
import Toast from "@/components/ui/Toast";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import ServiceVisitModal from "@/components/service/ServiceVisitModal";
import ScheduleQueueCard from "@/components/service/ScheduleQueueCard";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { canAnswerServiceRequests, canBeServiceAssignee, canEditService, isFieldCrewRole } from "@/lib/permissions";
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
import { gateBlocker } from "@/lib/service/visitGate";
import { mergeGateContext, gateContextForSite } from "@/lib/service/gateContext";
import { isDraftVisit, isLiveVisit, isOpenVisit } from "@/lib/service/visitStatus";
import {
  ALL_TEAMS,
  NO_TEAM,
  teamByUser,
  teamFilterOptions,
  teamLoad,
  teamViewRows,
} from "@/lib/service/crewTeams";
import Segmented from "@/components/ui/Segmented";
import { MAX_ASSETS_PER_DAY, dayWorkload, overloaded, workloadText } from "@/lib/service/visitLoad";
import {
  QUEUE_BUCKETS,
  QUEUE_BUCKET_LABELS,
  QUEUE_BUCKET_UNITS,
  QUEUE_RANGES,
  QUEUE_RANGE_LABELS,
  addDaysIso,
  freeCrewOn,
  queueBucketOf,
  queueWindow,
  staffLoadOn,
} from "@/lib/service/scheduleQueue";
import { buildScheduleQueue, dayText, draftsInRange, weekChipText } from "@/lib/service/scheduleQueueView";
import { usePagination } from "@/lib/usePagination";
import { navCountFor, useNavCountsState } from "@/lib/nav/useNavCounts";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtMonthShort, fmtNumber, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

const DAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const UNASSIGNED = "__unassigned__";
/* การ์ดสูงกว่าแถวตาราง ⇒ หน้าละ 10 ใบ (ท่าเดียวกับ /service/intake มุมมองการ์ด)
   คอลัมน์ข้างตารางยาวไม่เกินตารางมากนัก */
const QUEUE_PAGE_SIZE = 10;
const COLLAPSE_KEY = "schedule.queue.collapsed";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// จันทร์เป็นวันแรกของสัปดาห์ (ปฏิทินงานไทยอ่านแบบนี้)
function mondayOf(date) {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}
/* ⚠️ วันนี้มาจากนาฬิกาไทย (businessDate) ไม่ใช่นาฬิกาเครื่อง — สตริงวันที่ล้วนแปลงเป็น
   Date เที่ยงคืนของเครื่องเพื่อหาวันจันทร์เท่านั้น ไม่ย้อนกลับไปเป็นเวลาสากล */
const mondayIsoOf = (iso) => toLocalISODate(mondayOf(new Date(`${iso}T00:00:00`)));

const arrayOf = (value) => (Array.isArray(value) ? value : []);
const objectOf = (value) => (value && typeof value === "object" ? value : {});
const mergeById = (...lists) => {
  const map = new Map();
  for (const list of lists) for (const item of list || []) if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  return [...map.values()];
};

export default function ServiceSchedulePage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const viewer = useMemo(() => ({ role, team, teams, department }), [role, team, teams, department]);
  const canEdit = useMemo(() => canEditService(viewer), [viewer]);
  const canSeeRequests = useMemo(() => canAnswerServiceRequests(viewer), [viewer]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayIso = businessDate();

  /* ── สถานะใน URL (เปิดลิงก์แล้วได้หน้าเดิม · KPI ของหน้าภาพรวมลิงก์ตรงมาที่ถัง) ── */
  const bucketParam = searchParams.get("tab");
  const bucket = QUEUE_BUCKETS.includes(bucketParam) ? bucketParam : "waiting";
  const rangeParam = searchParams.get("range");
  const range = QUEUE_RANGES.includes(rangeParam) ? rangeParam : "all";
  const weekParam = searchParams.get("week");
  const weekIso = weekParam && ISO_DATE.test(weekParam) ? mondayIsoOf(weekParam) : mondayIsoOf(todayIso);
  const visitParam = searchParams.get("visit");
  const setQuery = useCallback((patch) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.replace(`/service/schedule${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);
  const goToWeek = useCallback((iso) => {
    const monday = mondayIsoOf(iso);
    setQuery({ week: monday === mondayIsoOf(todayIso) ? null : monday });
  }, [setQuery, todayIso]);

  const [visits, setVisits] = useState([]);
  const [sites, setSites] = useState([]);
  const [workload, setWorkload] = useState({});
  const [gateContext, setGateContext] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formVisit, setFormVisit] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formDefaults, setFormDefaults] = useState(null);
  const [formFocus, setFormFocus] = useState(null);
  const [toast, setToast] = useState(null);
  /* ⭐ ทีมเจ้าหน้าที่บริการ (mig 0310 · T-4) — โหลดทะเบียนทีมของฝ่าย TS มาใช้ **เป็นมุมมอง**
     ⚠️ ไม่ใช่ด่านสิทธิ์: กรองแล้วยังกดดูทีมอื่นได้เสมอ ตัวกั้นจริงยังเป็น canEditService */
  const [crew, setCrew] = useState({ teams: [], members: [], people: [] });
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);
  /* ⭐ มุมมอง (F-6) — กริดสัปดาห์อ่านภาพรวมได้ดี แต่ **บนมือถือกับตอนแจกงานรายวัน
     มันคือตารางที่ต้องเลื่อนสองแกน** · "รายการ" คือมุมมองเดียวที่ใช้ได้จริงบนจอแคบ */
  const [view, setView] = useState("week");
  /* 🐞 เดิมเปิดกริดสัปดาห์ทุกขนาดจอ ⇒ มือถือเห็นวันเดียวครึ่งแถว · จอแคบเริ่มที่ "รายการ"
     เลือกครั้งเดียวตอนเปิดหน้า (ปุ่มสลับยังพากลับกริดได้) · ⚠️ ห้ามย้ายไป initializer
     ของ useState — server ไม่รู้ขนาดจอ ได้ hydration mismatch · กริดไม่กะพริบเพราะ
     loading เริ่มเป็น true */
  useEffect(() => {
    if (window.matchMedia("(max-width: 768px)").matches) setView("list");
  }, []);

  const weekStart = useMemo(() => new Date(`${weekIso}T00:00:00`), [weekIso]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { iso: toLocalISODate(d), date: d, weekend: d.getDay() === 0 || d.getDay() === 6 };
  }), [weekStart]);

  const range7 = useMemo(() => ({ from: days[0].iso, to: days[6].iso }), [days]);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่
       ⭐ `{ background, keep }` = โหลดซ้ำหลังบันทึก: ไม่ขึ้นโครงโหลด (ตำแหน่งเลื่อน/โฟกัสไม่หลุด)
          แต่ **ยังรายงาน error** (คนเพิ่งกดบันทึก ต้องรู้ถ้าจอยังเป็นของเก่า)
       🐞 รอบเบื้องหลังเคยล้าง error ทิ้งตอนเริ่ม ⇒ พังซ้ำแล้วเงียบ จอกลายเป็น "ว่าง" ทั้งที่ยังโหลดไม่ได้ */
    if (!opts?.background) setLoading(true);
    if (!opts?.background) setLoadError("");
    try {
      const res = await apiFetch(`/api/service/visits?from=${range7.from}&to=${range7.to}`);
      const data = await res.json().catch(() => null);
      if (!isLatest()) return; // เลื่อนสัปดาห์ระหว่างรอ — ตารางต้องเป็นของช่วงที่ค้างอยู่
      if (!res.ok) throw new Error(data?.error || "โหลดตารางไม่สำเร็จ");
      setVisits(arrayOf(data?.visits));
      setSites(arrayOf(data?.sites));
      // ภาระรายไซต์ (เครื่อง/แพ็ค) — server นับมาให้แล้ว ไม่ต้องไล่ยิงรายไซต์
      setWorkload(objectOf(data?.workload));
      /* ⚠️ บริบทด่านต้องมาคู่กับนัดเสมอ — ไม่มี = ทุกนัดขึ้นว่าติด ซึ่งดังพอให้รู้ตัว
         (ดีกว่าปล่อยผ่านเงียบ ๆ แล้วส่งคนไปที่ที่ยังไม่จ่าย) */
      setGateContext(objectOf(data?.gateContext));
      setLoadError("");
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ตารางเปล่า — "โหลดพัง" กับ "สัปดาห์นี้ไม่มีนัด"
      // หน้าตาเหมือนกันจนแยกไม่ออก แล้วเจ้าหน้าที่จะเชื่อว่าตัวเองว่าง
      if (isLatest() && (!opts?.background || opts?.keep)) setLoadError(e.message || "โหลดตารางไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [range7.from, range7.to, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  /* ── รายการงานข้ามสัปดาห์ (มติ 2026-09-22) — ร่างทุกวัน + นัดที่ยังเปิด + ปิดใน 14 วัน
     ⚠️ ตัวโหลดแยกจากตาราง: เลื่อนสัปดาห์แล้วรายการต้องไม่กะพริบ และพังคนละที่ต้องบอกคนละที่ */
  const [queue, setQueue] = useState({ visits: [], sites: [], workload: {}, gateContext: {} });
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  /* ภาระในตัวเลือกเจ้าหน้าที่ต้องรอรายการงานโหลดสำเร็จอย่างน้อยครั้งแรก — ก่อนนั้นเลขศูนย์คือ "ไม่รู้" ไม่ใช่ "ว่าง" */
  const [queueLoadedOnce, setQueueLoadedOnce] = useState(false);
  const startQueueRun = useLatestRun();
  const loadQueue = useCallback(async (opts) => {
    const isLatest = startQueueRun();
    if (!opts?.background) setQueueLoading(true);
    if (!opts?.background) setQueueError("");
    try {
      const res = await apiFetch("/api/service/visits/queue");
      const data = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(data?.error || "โหลดรายการงานไม่สำเร็จ");
      setQueue({
        visits: arrayOf(data?.visits),
        sites: arrayOf(data?.sites),
        workload: objectOf(data?.workload),
        gateContext: objectOf(data?.gateContext),
      });
      setQueueError("");
      setQueueLoadedOnce(true);
    } catch (e) {
      if (isLatest() && (!opts?.background || opts?.keep)) setQueueError(e.message || "โหลดรายการงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setQueueLoading(false);
    }
  }, [startQueueRun]);
  useEffect(() => { loadQueue(); }, [loadQueue]);
  useRevalidateOnFocus(loadQueue);

  /* ทะเบียนทีมเจ้าหน้าที่บริการโหลดครั้งเดียว — ไม่ผูกกับสัปดาห์ที่เลื่อนไปมา
     ⚠️ โหลดไม่ได้ = ไม่มีตัวกรองทีม ไม่ใช่หน้าพัง (ทีมเป็นมุมมอง ไม่ใช่ด่าน) */
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/teams?department=TS");
        const body = await res.json().catch(() => null);
        if (res.ok) {
          setCrew({
            teams: body?.teams || [],
            members: body?.members || [],
            // `people` = คนของฝ่ายพร้อม role (บัญชีที่ปิดแล้วถูกกรองออกที่ API)
            people: body?.people || [],
          });
        }
      } catch { /* เงียบได้ — ตารางยังใช้งานได้เต็มที่โดยไม่มีทีม */ }
    })();
  }, []);

  // รายชื่อเจ้าหน้าที่บริการ + ไซต์ทั้งหมด โหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formVisit === undefined) return;
    if (!technicians.length) {
      (async () => {
        try {
          const res = await apiFetch("/api/pm/assignable-users");
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ");
          // คนที่รับงานเข้าไซต์ได้ = ฝ่ายบริการ TS หรือทีมขาย SV (ดู canBeServiceAssignee)
          // 🐞 เดิมกรองเฉพาะ TS แต่ prod ยังไม่มีบัญชี TS สักคน → ช่องนี้ว่างเปล่า
          // ทุกนัดเลยไม่มีผู้รับผิดชอบ แล้ว "งานวันนี้" ของเจ้าหน้าที่ก็ว่างตลอดกาล
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

  /* ไซต์/ภาระ/บริบทด่านของสองตัวโหลดรวมกัน — โมดัลเปิดนัดข้ามสัปดาห์ได้ (ร่างเดือนหน้า)
     ⚠️ ไม่รวมบริบทด่าน ⇒ ร่างนอกสัปดาห์เปิดโมดัลแล้วขึ้นว่าติดทุกข้อ */
  const allSites = useMemo(() => mergeById(queue.sites, sites), [queue.sites, sites]);
  const sitesById = useMemo(() => new Map(allSites.map((s) => [s.id, s])), [allSites]);
  const workloadAll = useMemo(() => ({ ...queue.workload, ...workload }), [queue.workload, workload]);
  const gateContextAll = useMemo(() => mergeGateContext(queue.gateContext, gateContext), [queue.gateContext, gateContext]);

  /* ⭐ ร่างไม่ขึ้นกริดและ **ไม่นับภาระของเจ้าหน้าที่** (มติผู้ใช้ 2026-08-28) — ถ้านับ
     ตัวเลข "เกินภาระ" จะเตือนจากงานที่ยังไม่แน่ว่าจะได้ไป และหัวหน้าจะเลิกเชื่อคำเตือน
     ⚠️ ตัวตัดสินคือ `isDraftVisit` ตัวเดียวกับที่ server ใช้ ห้ามเทียบสตริงตรงนี้ */
  const boardVisits = useMemo(() => visits.filter((v) => !isDraftVisit(v)), [visits]);

  const overlapIds = useMemo(() => overlappingVisitIds(boardVisits), [boardVisits]);

  /* แถวของปฏิทิน = **เจ้าหน้าที่หน้างานทุกคน** + คนอื่นที่มีนัดในสัปดาห์นี้
     + แถว "ยังไม่มอบหมาย" (ถ้ามี)

     ⭐ **แถวของ Operation/Senior ขึ้นเสมอ แม้สัปดาห์นั้นยังไม่มีนัดสักใบ**
        (มติผู้ใช้ 2026-09-02) — ของเดิมสร้างแถวจาก *นัดที่มีอยู่* อย่างเดียว ⇒ คนที่ว่าง
        ทั้งสัปดาห์ **หายไปจากตารางทั้งคน** ซึ่งเป็นข้อมูลที่คนจัดคิวต้องการมากที่สุด:
        ตารางบอกได้แค่ "ใครยุ่ง" แต่ตอบไม่ได้ว่า "เหลือใครว่าง"
     ⚠️ ตำแหน่งอื่นของฝ่าย (Planner · Audit · ผู้ช่วยผู้จัดการ) ยังโผล่ได้ตามปกติเมื่อมี
        นัดจริง — แค่ไม่ถูกจองแถวไว้ล่วงหน้า (ดู `FIELD_CREW_ROLES`) */
  const rows = useMemo(() => {
    const map = new Map();
    for (const person of crew.people) {
      if (!isFieldCrewRole(person.role) || !person.id) continue;
      map.set(person.id, { key: person.id, name: person.name || person.id, visits: [] });
    }
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
  }, [boardVisits, crew.people]);

  const crewByUser = useMemo(() => teamByUser(crew.members), [crew.members]);
  /* ตัวเลือกทีมไม่นับแถว "ยังไม่มอบหมาย" — งานที่ยังไม่มีคนขึ้นให้ทุกทีมเห็นอยู่แล้ว
     (มติ 2026-09-22) ⇒ ถัง "ยังไม่อยู่ทีมไหน" เหลือความหมายเดียว: คนที่ยังไม่ได้จัดทีม */
  /* ⚠️ ทีมเป็นขอบเขตของ **ทั้งหน้า** ⇒ ตัวเลือกต้องไม่ขึ้นกับสัปดาห์ที่ตารางเปิด — นับคนที่มีงานใน
     รายการงาน (ข้ามสัปดาห์) ด้วย ไม่งั้นถัง "ยังไม่อยู่ทีมไหน" โผล่/หายตามการเลื่อนสัปดาห์ */
  const teamOptions = useMemo(() => {
    const keys = new Set(rows.filter((row) => row.key !== UNASSIGNED).map((row) => row.key));
    for (const visit of queue.visits) if (visit.assigneeId) keys.add(visit.assigneeId);
    return teamFilterOptions(crew.teams, [...keys].map((key) => ({ key })), crewByUser);
  }, [crew.teams, rows, queue.visits, crewByUser]);
  /* ทีมที่เลือกไว้หายจากตัวเลือก (ถังว่างลง/ทีมถูกปิด) ⇒ กลับไป "ทุกทีม" ไม่ค้างตัวกรองที่มองไม่เห็น */
  useEffect(() => {
    if (teamFilter !== ALL_TEAMS && teamOptions.length > 1 && !teamOptions.some((o) => o.value === teamFilter)) {
      setTeamFilter(ALL_TEAMS);
    }
  }, [teamOptions, teamFilter]);
  /* ⭐ เลือกทีม = คนในทีม + แถว "ยังไม่มอบหมาย" (ทุกทีมหยิบได้) — ความหมายเดียวกับแผงรายการงาน */
  const teamRows = useMemo(
    () => teamViewRows(rows, teamFilter, crewByUser, UNASSIGNED),
    [rows, teamFilter, crewByUser],
  );
  /* 🪤 **"ว่าง" ต้องวัดจากจำนวนนัด ไม่ใช่จำนวนแถว** — พอแถวของเจ้าหน้าที่หน้างานขึ้น
     เสมอแล้ว `teamRows.length` แทบไม่มีวันเป็นศูนย์ ⇒ ใช้ตัวเดิมต่อ ข้อความ
     "สัปดาห์นี้ยังไม่มีนัด" จะไม่มีวันโผล่อีกเลย ทั้งที่สัปดาห์นั้นว่างจริง */
  const visibleVisitCount = useMemo(
    () => teamRows.reduce((sum, row) => sum + row.visits.length, 0),
    [teamRows],
  );

  /* ⚠️ แถว "ยังไม่มอบหมาย" ไม่ใช่ "คนที่ยังไม่อยู่ทีมไหน" — ส่งเข้า teamLoad แล้วมันตกถัง NO_TEAM
     ขึ้นเป็น "ยังไม่อยู่ทีมไหน 1 นัด" ทั้งที่งานนั้นไม่มีเจ้าของ (ทุกทีมหยิบได้ มติ 2026-09-22) */
  /* นับเฉพาะนัดที่อยู่บนตารางจริง (isLiveVisit) — ชิปที่ยกเลิก/เลื่อนแล้วยังขึ้นจาง ๆ บนกริด แต่ไม่ใช่ภาระ */
  const crewLoad = useMemo(
    () => teamLoad({
      teams: crew.teams,
      rows: rows.filter((row) => row.key !== UNASSIGNED).map((row) => ({ ...row, visits: row.visits.filter(isLiveVisit) })),
      members: crew.members,
      byUser: crewByUser,
    }),
    [crew.teams, crew.members, rows, crewByUser],
  );

  /* ⭐ ภาระนับเป็น **เครื่อง + แพ็ค** ไม่ใช่จำนวนนัด (F-6) — ไซต์หนึ่งมีเครื่องตัวเดียว
     อีกไซต์มี 12 ตัว "วันนี้ 5 นัด" จึงบอกไม่ได้เลยว่าเจ้าหน้าที่คนนั้นทำไหวไหม */
  const loads = useMemo(
    () => dayWorkload(boardVisits.filter(isLiveVisit), (siteId) => workloadAll[siteId]),
    [boardVisits, workloadAll],
  );

  const crossRouteZone = useMemo(() => {
    const set = new Set();
    for (const entry of routeZoneSplit(boardVisits, sitesById)) {
      if (entry.crossRouteZone) set.add(`${entry.assigneeId || UNASSIGNED}|${entry.date}`);
    }
    return set;
  }, [boardVisits, sitesById]);

  /* ── แผงรายการงาน ── */
  const [search, setSearch] = useState("");
  const [farOn, setFarOn] = useState(false);
  const [within, setWithin] = useState(null);   // { from, to } — ชิป "วันเสนอ …" จากบรรทัดร่างของตาราง
  /* กลุ่ม "รอฝ่ายอื่น" พับไว้ตั้งต้น — TS แก้เองไม่ได้ ถ้ากางไว้จะดันงานที่ทำได้ลงไปข้างล่าง
     ⚠️ จำต่อคนดูด้วย localStorage แบบกันพัง (โหมดส่วนตัว/บล็อกข้อมูลไซต์ = ใช้ค่าตั้งต้น) */
  const [collapsed, setCollapsed] = useState({ others: true });
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) || "null");
      if (saved && typeof saved === "object") setCollapsed((prev) => ({ ...prev, ...saved }));
    } catch { /* ใช้ค่าตั้งต้น */ }
  }, []);
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ไม่จำก็ได้ */ }
    return next;
  });

  const crewPeople = useMemo(
    () => crew.people.filter((p) => p?.id && isFieldCrewRole(p.role)).map((p) => ({ id: p.id, name: p.name || p.id })),
    [crew.people],
  );
  const teamNames = useMemo(() => new Map(crew.teams.map((t) => [t.code, t.name])), [crew.teams]);

  const queueView = useMemo(() => buildScheduleQueue({
    visits: queue.visits,
    sitesById,
    gateContext: queue.gateContext,
    workload: queue.workload,
    todayIso,
    teamFilter,
    crewByUser,
    crewPeople,
    teamNames,
    bucket,
    range,
    search,
    farOn,
    within: bucket === "waiting" ? within : null,
  }), [queue, sitesById, todayIso, teamFilter, crewByUser, crewPeople, teamNames, bucket, range, search, farOn, within]);

  /* 🐞 กลุ่มที่พับไว้ต้อง **ไม่กินที่ในหน้า** — เดิมแบ่งหน้าจากทุกแถวแล้วซ่อนตอนวาด ⇒ "รอฝ่ายอื่น" 30 ใบ
     ทำให้หน้า 2–4 เหลือแต่หัวกลุ่มเปล่า ๆ · กลุ่มที่พับเป็นหนึ่งรายการ (หัวกลุ่ม) · ค้นหาอยู่ = ไม่พับ */
  const searching = !!search.trim();
  const isCollapsed = useCallback(
    (group) => !!group.collapsible && !!collapsed[group.key] && !searching,
    [collapsed, searching],
  );
  const flatRows = useMemo(
    () => queueView.groups.flatMap((group) => (isCollapsed(group)
      ? [{ head: true, groupKey: group.key }]
      : group.rows.map((row) => ({ row, groupKey: group.key })))),
    [queueView.groups, isCollapsed],
  );
  const groupByKey = useMemo(() => new Map(queueView.groups.map((g) => [g.key, g])), [queueView.groups]);
  const groupStart = useMemo(() => {
    const map = new Map();
    flatRows.forEach((item, index) => { if (!map.has(item.groupKey)) map.set(item.groupKey, index); });
    return map;
  }, [flatRows]);
  const pagination = usePagination(flatRows, {
    defaultSize: QUEUE_PAGE_SIZE,
    resetKey: `${bucket}|${range}|${search}|${teamFilter}|${farOn}|${within?.from || ""}|${JSON.stringify(collapsed)}`,
  });
  /* หน้าหนึ่งตัดกลางกลุ่มได้ — หัวกลุ่มต้องบอกยอดทั้งกลุ่มเสมอ (ท่าเดียวกับคิวคำร้อง #1640)
     และบอก "(ต่อ)" เมื่อกลุ่มเริ่มมาจากหน้าก่อน ไม่งั้นอ่านเป็นกลุ่มใหม่ที่ยอดไม่ตรงกับแถว */
  const pageGroups = useMemo(() => {
    const out = [];
    const pageStart = (pagination.page - 1) * pagination.pageSize;
    for (const item of pagination.pageRows) {
      let group = out[out.length - 1];
      if (!group || group.key !== item.groupKey) {
        const source = groupByKey.get(item.groupKey);
        group = { ...source, pageRows: [], folded: isCollapsed(source), continued: (groupStart.get(item.groupKey) ?? 0) < pageStart };
        out.push(group);
      }
      if (item.row) group.pageRows.push(item.row);
    }
    return out;
  }, [pagination.pageRows, pagination.page, pagination.pageSize, groupByKey, groupStart, isCollapsed]);

  const queueReady = !queueLoading && !queueError;
  const bucketOptions = QUEUE_BUCKETS.map((key) => ({
    value: key,
    label: QUEUE_BUCKET_LABELS[key],
    count: queueReady ? queueView.counts[key] : null,
  }));
  const rangeOptions = QUEUE_RANGES.map((key) => ({
    value: key,
    label: QUEUE_RANGE_LABELS[key],
    count: queueReady ? queueView.rangeCounts[key] : null,
  }));
  const queueSubtitle = queueError ? null : {
    waiting: "ร่างที่ยังไม่ขึ้นตาราง — ไม่นับภาระ และยังไม่โผล่ในงานวันนี้ของใคร",
    overdue: "นัดที่เลยวันแล้วยังไม่ปิดงาน",
    scheduled: "นัดที่ขึ้นตารางแล้ว ตั้งแต่วันนี้ไป — เรียงตามวัน",
    closed: "ปิดงานใน 14 วันที่ผ่านมา — ทำไม่ครบ/ทำไม่ได้อยู่บนสุด",
  }[bucket];
  const queueColdStart = queueReady && !queue.visits.length;
  const draftsThisWeek = useMemo(
    () => draftsInRange(queue.visits, range7, teamFilter, crewByUser),
    [queue.visits, range7, teamFilter, crewByUser],
  );

  /* ⭐ ภาระรายคนของวันหนึ่ง — ให้โมดัลเลือกเจ้าหน้าที่โดยเห็นว่าใครว่าง (ไม่นับร่าง)
     ⚠️ นับจากชุดเดียว (รายการงาน ⊇ นัดเปิดทุกวัน) บวกนัดสัปดาห์ที่เปิดที่ยังไม่อยู่ในชุดนั้น
     (นัดที่ปิดแล้วเกิน 14 วัน) — รวมด้วย id ไม่งั้นนัดเดียวถูกนับสองครั้ง */
  const liveForLoad = useMemo(
    () => mergeById(queue.visits.filter(isLiveVisit), boardVisits.filter(isLiveVisit)),
    [queue.visits, boardVisits],
  );
  const staffLoadFor = useCallback((dateIso) => {
    if (!dateIso) return null;
    /* ⚠️ ไม่รู้ = บอกว่าไม่รู้ ไม่ใช่ขึ้นศูนย์ว่า "ว่างทั้งวัน": รายการงานยังไม่เคยโหลดสำเร็จ · โหลดพัง ·
       หรือวันที่เก่ากว่าที่รายการงานเก็บ (ปิดแล้วเกิน 14 วัน) และไม่อยู่ในสัปดาห์ที่ตารางเปิด */
    const inWeek = dateIso >= range7.from && dateIso <= range7.to;
    const tooOld = dateIso < queueWindow(todayIso).closedSince && !inWeek;
    if (queueError || !queueLoadedOnce || tooOld) return { state: "unknown", people: [] };
    /* นัดที่กำลังแก้ไม่นับภาระของตัวเอง — ทุกแถวอ่านว่า "ถ้าไม่มีนัดนี้ คนนี้มีงานเท่าไร" */
    const editingId = formVisit?.id;
    const others = editingId ? liveForLoad.filter((v) => v.id !== editingId) : liveForLoad;
    const load = staffLoadOn(others, dateIso, workloadAll);
    const people = technicians.map((tech) => {
      const row = load.get(tech.id) || { visits: 0, assets: 0, packs: 0, assisting: 0 };
      const teamCode = crewByUser.get(tech.id);
      const notes = [];
      if (row.assisting > 0) notes.push(`ไปช่วย ${row.assisting} นัด`);
      if (row.assets > MAX_ASSETS_PER_DAY) notes.push(`เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`);
      return {
        id: tech.id,
        name: tech.name,
        team: teamCode && teamCode !== NO_TEAM ? teamNames.get(teamCode) || "" : "",
        visits: row.visits,
        assets: row.assets,
        packs: row.packs,
        assisting: row.assisting,
        note: notes.join(" · "),
      };
    });
    return { state: "ok", people };
  }, [queueError, queueLoadedOnce, range7.from, range7.to, todayIso, formVisit, liveForLoad, workloadAll, technicians, crewByUser, teamNames]);

  /* รายชื่อในตัวเลือกเจ้าหน้าที่ — คนของทีมที่กรองอยู่ขึ้นก่อน แล้วเรียงตามชื่อ
     (ตัวเลือกเรียงตามลำดับที่ส่งให้ ไม่เรียงเอง) */
  const pickerTechnicians = useMemo(() => {
    const inTeam = (id) => teamFilter !== ALL_TEAMS && (crewByUser.get(id) || NO_TEAM) === teamFilter;
    return [...technicians].sort((a, b) => (Number(inTeam(b.id)) - Number(inTeam(a.id)))
      || String(a.name || "").localeCompare(String(b.name || ""), "th"));
  }, [technicians, teamFilter, crewByUser]);

  /* ── เปิดโมดัล ── */
  const openVisit = (visit, field = null) => {
    setFormFocus(field);
    setFormDefaults(null);
    setFormVisit(visit);
  };
  const openNew = (defaults) => {
    setFormFocus(null);
    setFormDefaults(defaults);
    setFormVisit(null);
  };

  /* 🐞 เดิมเก็บรอบถัดไปไว้ใน formDefaults แล้ว onClose ล้างทิ้งทันที ⇒ คำแนะนำไม่เคยเปิด
     ฟอร์มให้ใครเลย เหลือแต่ toast ที่หายไปเอง · ตอนนี้เก็บแยกและ **ถามก่อนสร้าง** เหมือนเดิม */
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
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
      setPendingSuggestion({
        ...suggestion,
        fromCode: formVisit?.code || "",
        fromId: formVisit?.id || null,
        after: form.actualDate || formVisit?.scheduledDate || todayIso,
      });
      setToast({ kind: "success", msg: "ปิดงานแล้ว" });
    } else {
      setToast({ kind: "success", msg: editing ? "บันทึกนัดแล้ว" : "สร้างนัดแล้ว" });
    }
    await Promise.all([load({ background: true, keep: true }), loadQueue({ background: true, keep: true })]);
  };
  const suggestionExisting = useMemo(() => {
    if (!pendingSuggestion?.planId) return null;
    /* ⚠️ เทียบกับ "หลังนัดที่เพิ่งปิด" ไม่ใช่กับวันที่แนะนำ — รอบบริการสร้างร่างล่วงหน้า 90 วันไว้แล้ว
       ร่างถัดไปที่วันก่อนวันแนะนำก็คือรอบถัดไปตัวจริง ⇒ ถ้าเทียบวันแนะนำจะชวนสร้างซ้ำ */
    return queue.visits
      .filter((v) => v.planId === pendingSuggestion.planId && v.id !== pendingSuggestion.fromId
        && v.scheduledDate > pendingSuggestion.after && (isDraftVisit(v) || isOpenVisit(v)))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] || null;
  }, [pendingSuggestion, queue.visits]);

  /* แถบบอกตำแหน่งบนตาราง (ปุ่ม "ปฏิทิน" ของการ์ด) — ประกาศก่อนเพราะการปล่อยร่างอัปเดตมันด้วย */
  const [focus, setFocus] = useState(null);

  /* ── ปล่อยร่างจากการ์ด: ยืนยันก่อน บอกช่องที่จะลงและภาระวันนั้น ──
     ⚠️ ยิง PATCH ตัวเดียวกับปุ่มในโมดัล (ด่านฝั่ง server ตรวจซ้ำจากค่าหลังแก้) · ไม่มีทางเขียนใหม่ */
  const [releaseRow, setReleaseRow] = useState(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const askRelease = (row) => {
    if (row.stale) {
      /* ร่างที่วันเสนอผ่านไปแล้ว ปล่อยตรง ๆ = ได้นัดที่ค้างทันที ⇒ พาไปเลือกวันใหม่ในโมดัล */
      openVisit(row.visit, "scheduledDate");
      setToast({ kind: "info", msg: "วันเสนอผ่านไปแล้ว — เลือกวันใหม่ก่อนปล่อยขึ้นตาราง" });
      return;
    }
    setReleaseRow(row);
  };
  const confirmRelease = async () => {
    const row = releaseRow;
    /* ข้อมูลอาจโหลดใหม่ระหว่างที่กล่องยืนยันเปิดอยู่ — ใบที่ไม่ใช่ร่างแล้วห้ามยิงซ้ำ */
    const live = queue.visits.find((v) => v.id === row.visit.id);
    if (live && !isDraftVisit(live)) throw new Error("ใบนี้ไม่ใช่ร่างแล้ว — มีคนปล่อยหรือแก้ไปก่อน");
    setReleaseBusy(true);
    try {
      /* 🐞 เดิมส่งทั้งฟอร์มจากสำเนาแถว ⇒ ถ้าร่างถูกแก้หลังการ์ดวาด ค่าเก่าเขียนทับของใหม่
         ⇒ ส่งแค่สถานะ · server รวมกับแถวปัจจุบันในฐาน (`{...before, ...body}`) แล้วตรวจด่านซ้ำเอง */
      const res = await apiFetch(`/api/service/visits/${row.visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ปล่อยขึ้นตารางไม่สำเร็จ");
      setReleaseRow(null);
      setToast({
        kind: "success",
        msg: `ปล่อย ${row.code} ขึ้นตารางแล้ว — ${row.visit.assigneeName || "ยังไม่มอบหมาย"} · ${dayText(row.visit.scheduledDate)}`,
      });
      if (focus?.visitId === row.visit.id) setFocus((prev) => ({ ...prev, released: true }));
      await Promise.all([load({ background: true, keep: true }), loadQueue({ background: true, keep: true })]);
    } finally {
      setReleaseBusy(false);
    }
  };
  const releaseLoad = useMemo(() => {
    if (!releaseRow?.visit?.assigneeId) return null;
    const row = staffLoadOn(liveForLoad, releaseRow.visit.scheduledDate, workloadAll).get(releaseRow.visit.assigneeId)
      || { visits: 0, assets: 0, packs: 0 };
    const add = workloadAll[releaseRow.visit.siteId]?.assets || 0;
    return { visits: row.visits + 1, assets: row.assets + add, over: row.assets + add > MAX_ASSETS_PER_DAY };
  }, [releaseRow, liveForLoad, workloadAll]);

  /* ── "ปฏิทิน" จากการ์ด: ตารางเลื่อนไปสัปดาห์นั้น + แถบบอกตำแหน่ง ──
     ⭐ ร่าง **ไม่ถูกวาดลงช่อง** (มติ 2026-08-28) — ขีดเส้นใต้หัววันกับชื่อคนเท่านั้น
     และบอกภาระ "ถ้าปล่อย" เป็นข้อความนอกกริด */
  const boardRef = useRef(null);
  const stripRef = useRef(null);
  /* ⚠️ แถบเก็บแค่ **id ของนัด** แล้วอ่านของสดทุกครั้งที่วาด — 🐞 รอบแรกเก็บสำเนาแถวทั้งก้อนไว้
     ⇒ แก้ร่างในโมดัลแล้วกด "ปล่อยขึ้นตาราง" จากแถบ = ยิงค่าเก่าทับค่าที่เพิ่งบันทึก (รีวิวก่อน merge จับได้) */
  const revealRef = useRef(null);
  const showOnCalendar = (row) => {
    setFocus({ visitId: row.visit.id, released: false });
    revealRef.current = row.visit.id;   // เลื่อนจอ/ย้ายโฟกัส **ครั้งเดียว** ต่อการกด ไม่ใช่ทุกครั้งที่ตารางโหลดใหม่
    goToWeek(row.visit.scheduledDate);
  };
  const focusVisit = useMemo(() => {
    if (!focus) return null;
    return queue.visits.find((v) => v.id === focus.visitId) || visits.find((v) => v.id === focus.visitId) || null;
  }, [focus, queue.visits, visits]);
  const focusRow = useMemo(
    () => (focus ? queueView.rows.find((r) => r.id === focus.visitId) || null : null),
    [focus, queueView.rows],
  );
  const focusInfo = useMemo(() => {
    if (!focusVisit) return null;
    return {
      visitId: focusVisit.id,
      code: focusVisit.code || focusVisit.id,
      date: focusVisit.scheduledDate,
      assigneeId: focusVisit.assigneeId || null,
      assigneeName: focusVisit.assigneeName || "",
      isDraft: isDraftVisit(focusVisit),
      siteId: focusVisit.siteId,
      siteName: sitesById.get(focusVisit.siteId)?.name || focusVisit.siteId,
      kindLabel: VISIT_KIND_LABELS[focusVisit.kind] || focusVisit.kind,
      timeText: visitTimeText(focusVisit),
    };
  }, [focusVisit, sitesById]);
  /* นัดหายไปจากข้อมูลที่โหลดแล้ว (ถูกลบ/ยกเลิก) ⇒ แถบปิดเอง ไม่ค้างชี้ของที่ไม่มีอยู่ */
  useEffect(() => {
    if (focus && !focusVisit && !queueLoading && !loading) setFocus(null);
  }, [focus, focusVisit, queueLoading, loading]);
  useEffect(() => {
    if (!focusInfo || loading || revealRef.current !== focusInfo.visitId) return;
    revealRef.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    boardRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    stripRef.current?.focus({ preventScroll: true });
  }, [focusInfo, loading]);
  const focusQueue = (id) => {
    const card = id ? document.getElementById(`queue-row-${id}`) : null;
    const panel = document.getElementById("schedule-queue");
    (card || panel)?.scrollIntoView({ block: "start" });
    /* การ์ดไม่อยู่ในหน้านี้ (ย้ายถัง/อยู่อีกหน้า) ⇒ โฟกัสการ์ดแรกของรายการแทน ไม่ปล่อยโฟกัสค้างที่เดิม */
    const target = card?.querySelector("[data-queue-code]") || panel?.querySelector("[data-queue-code]");
    target?.focus({ preventScroll: true });
  };
  const backToList = () => focusQueue(focus?.visitId);
  const focusText = useMemo(() => {
    if (!focusInfo) return null;
    const where = `${dayText(focusInfo.date)}${focusInfo.timeText ? ` ${focusInfo.timeText}` : ""}`;
    if (!focusInfo.isDraft) {
      return {
        title: `${focus?.released ? "ปล่อยขึ้นตารางแล้ว" : "กำลังดู"} ${focusInfo.code} · ${focusInfo.kindLabel} · ${focusInfo.siteName} → ${where}`,
        body: focusInfo.assigneeName ? `อยู่ช่อง ${focusInfo.assigneeName}` : "ยังไม่มีเจ้าหน้าที่ — อยู่แถว “ยังไม่มอบหมาย”",
      };
    }
    const title = `กำลังดู ร่าง ${focusInfo.code} · ${focusInfo.kindLabel} · ${focusInfo.siteName} → ${where}${focusInfo.assigneeName ? ` · ตั้งไว้ ${focusInfo.assigneeName}` : ""}`;
    if (focusInfo.assigneeId) {
      const load = loads.get(`${focusInfo.assigneeId}|${focusInfo.date}`) || { visits: 0, assets: 0, packs: 0 };
      const projected = (load.assets || 0) + (workloadAll[focusInfo.siteId]?.assets || 0);
      const name = focusInfo.assigneeName.split(/\s+/)[0];
      return {
        title,
        body: `วันนั้น${name}มี ${load.visits} นัด · ${load.assets} จุด · ${load.packs} แพ็ค · ถ้าปล่อยจะเป็น ${projected} จุด${projected > MAX_ASSETS_PER_DAY ? ` (เกิน ${MAX_ASSETS_PER_DAY})` : ""} · ร่างไม่ขึ้นตารางจนกว่าจะปล่อย`,
        over: projected > MAX_ASSETS_PER_DAY,
      };
    }
    const people = crewPeople.filter((p) => teamFilter === ALL_TEAMS || (crewByUser.get(p.id) || NO_TEAM) === teamFilter);
    const { free, total } = freeCrewOn(boardVisits, focusInfo.date, people);
    return {
      title,
      body: `ยังไม่มีเจ้าหน้าที่ — วันนั้นว่าง ${free.length} จาก ${total} คน${free.length ? `: ${free.map((p) => p.name).join(" · ")}` : ""}`,
    };
  }, [focusInfo, focus?.released, loads, workloadAll, crewPeople, teamFilter, crewByUser, boardVisits]);

  /* ── ลิงก์ตรงมาที่นัด (?visit=) — จาก "ต้องจัดการก่อน" ของหน้าภาพรวม ── */
  const consumedVisit = useRef(null);
  useEffect(() => {
    if (!visitParam || consumedVisit.current === visitParam || queueLoading) return;
    consumedVisit.current = visitParam;
    const hit = queue.visits.find((v) => v.id === visitParam);
    if (hit) {
      const target = queueBucketOf(hit, queueWindow(todayIso));
      if (target && target !== bucket) setQuery({ tab: target });
      openVisit(hit);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/service/visits/${encodeURIComponent(visitParam)}`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.visit) throw new Error(data?.error || "ไม่พบนัดนี้");
        goToWeek(data.visit.scheduledDate);
        openVisit(data.visit);
      } catch {
        setToast({ kind: "error", msg: "ไม่พบนัดนี้แล้ว — อาจถูกลบ" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitParam, queueLoading, queue.visits]);

  const closeModal = () => {
    setFormVisit(undefined);
    setFormDefaults(null);
    setFormFocus(null);
    if (visitParam) setQuery({ visit: null });
  };

  /* ── ต้นทางของงาน (ลิงก์ + ตัวเลขเดียวกับป้ายเมนู) ──
     ⚠️ อ่านจาก context ที่ AppLayout โหลดอยู่แล้ว — เรียก useNavCounts() ตรง ๆ = ยิงซ้ำอีกชุด */
  const navState = useNavCountsState();
  const intakeCount = navCountFor(navState?.counts, "/service/intake");
  const requestsCount = navCountFor(navState?.counts, "/service/requests");

  const weekLabel = `${days[0].date.getDate()} ${fmtMonthShort(days[0].date)} – ${days[6].date.getDate()} ${fmtMonthShort(days[6].date)} ${days[6].date.getFullYear()}`;
  /* 🐞 ข้อความว่างเคยเขียน "สัปดาห์นี้" ตายตัว — เลื่อนไปสัปดาห์หน้าแล้วยังบอกว่าสัปดาห์นี้
     ⚠️ วัดจาก todayIso (วันทำการไทย) ตัวเดียวกับเม็ดวันนี้ ไม่ใช่นาฬิกาเครื่อง */
  const isThisWeek = days.some((d) => d.iso === todayIso);
  const weekText = isThisWeek ? "สัปดาห์นี้" : `ช่วง ${weekLabel} `;
  const teamFilterLabel = teamOptions.find((option) => option.value === teamFilter)?.label || "";
  /* ⚠️ ใช้ตัวแปรชื่อ ไม่ใช่ `teamRows.length === 0 ? (<EmptyState` — ยามใน crewTeams.test
     ห้ามรูปนั้นเพราะ *มุมมองรายการ* ต้องนับว่างจากนัด · กริดต่างกัน: ไม่มีแถว = ไม่มีตารางให้วาด */
  const gridHasNoRows = teamRows.length === 0;
  const emptyGridTitle = teamFilter === ALL_TEAMS
    ? `ยังไม่มีเจ้าหน้าที่หน้างานในทะเบียน และ${weekText}ยังไม่มีนัดเข้าบริการ`
    : `${teamFilter === NO_TEAM ? "คนที่ยังไม่อยู่ทีมไหน" : `ทีม ${teamFilterLabel}`} ${weekText}ยังไม่มีนัดเข้าบริการ`;
  const emptyGridHint = teamFilter === ALL_TEAMS
    ? null
    : "ตารางขึ้นแถวล่วงหน้าเฉพาะเจ้าหน้าที่หน้างาน ตำแหน่งอื่นขึ้นเมื่อมีนัด";

  const shiftWeek = (weeks) => {
    setFocus(null);
    goToWeek(addDaysIso(weekIso, weeks * 7));
  };

  /* ข้อความว่างของแผงรายการงาน — ต้องบอกว่า "ไม่มีงาน" หรือ "ตัวกรองกลืน" ให้ออก */
  const queueEmpty = (() => {
    if (queueColdStart) {
      return {
        title: "ยังไม่มีงานให้วาง",
        hint: "งานเริ่มที่หน้า งานเข้าใหม่: ผูกใบสั่งขายเข้าไซต์ แล้วตั้งรอบบริการ — นัดจะเกิดเองพร้อมเจ้าหน้าที่ประจำรอบ",
        action: canEdit ? { label: "ไปที่งานเข้าใหม่", href: "/service/intake" } : null,
      };
    }
    if (search.trim()) return { title: `ไม่พบรายการที่ตรงกับ “${search.trim()}” ในกลุ่ม ${QUEUE_BUCKET_LABELS[bucket]}`, clearSearch: true };
    if (bucket === "waiting" && within) return { title: `ไม่มีร่างที่${weekChipText(within.from)}`, clearWithin: true };
    const teamNote = teamFilter !== ALL_TEAMS ? ` (${teamFilterLabel} · งานที่ยังไม่มีเจ้าหน้าที่ขึ้นให้ทุกทีมเห็น)` : "";
    if (bucket === "waiting") {
      return queueView.farCount
        ? { title: `ไม่มีร่างที่ต้องจัดใน 14 วันข้างหน้า${teamNote}` }
        : { title: `ไม่มีร่างรอจัด${teamNote}`, hint: "นัดที่ผ่านด่านตั้งแต่เกิดขึ้นตารางเองแล้ว · ร่างจะมาที่นี่เมื่อรอบยังไม่มีเจ้าหน้าที่ประจำ งานนอกรอบติดด่าน หรือมีงานถอนเครื่อง" };
    }
    if (bucket === "overdue") return { title: `ไม่มีนัดค้าง — นัดที่เลยวันปิดงานครบแล้ว${teamNote}` };
    if (bucket === "scheduled") {
      if (range === "7d") return { title: `ยังไม่มีนัดใน 7 วันข้างหน้า${teamNote}` };
      if (range === "unassigned") return { title: "นัดใน 7 วันข้างหน้ามีเจ้าหน้าที่ครบแล้ว", hint: "นัดที่ไกลกว่านั้นยังไม่ต้องมอบหมายก็ได้" };
      return { title: `ยังไม่มีนัดข้างหน้า${teamNote}`, hint: "นัดเกิดเมื่อตั้งรอบบริการที่ งานเข้าใหม่ › รอตั้งรอบ" };
    }
    return { title: `14 วันที่ผ่านมายังไม่มีนัดที่ปิดงาน${teamNote}` };
  })();

  /* ⚠️ ปุ่มบนหัวหน้านี้เป็น **ปุ่มรอง** โดยเจตนา (มติผู้ใช้ 2026-08-28):
     *TS ไม่ใช่ต้นทางของงาน* — นัดเกิดจากรอบบริการของไซต์ หรือจากงานนอกรอบที่มี
     ต้นเรื่อง (ลูกค้าแจ้งเสีย · ติดตั้งตามใบสั่งขาย) แล้วทุกใบต้องผ่านด่านก่อน
     ขึ้นตาราง · หน้านี้ทำหน้าที่ **วาง** งานที่มีอยู่แล้ว ไม่ใช่ **สร้าง** งาน
     จึงไม่มีปุ่มสีแบรนด์ (สีแบรนด์ = เริ่มของใหม่ หน้าละหนึ่งปุ่ม) */
  return (
    <Workspace
      icon={<CalendarDays size={20} aria-hidden="true" />}
      title="จัดคิวเจ้าหน้าที่"
      subtitle="วางงานที่รออยู่ลงตารางเจ้าหน้าที่ · รายการงานข้ามสัปดาห์คู่กับตารางรายสัปดาห์ · เตือนเวลาทับกัน วิ่งข้ามเขต และนัดนอกช่วงที่ไซต์ให้เข้า"
      headerRight={canEdit ? (
        <Button tone="neutral" onClick={() => openNew({ scheduledDate: todayIso })} icon={<Plus size={15} aria-hidden="true" />}>
          งานนอกรอบ
        </Button>
      ) : null}
    >
      {/* ⭐ ทีม = ขอบเขตของหน้า คุมรายการงาน ตาราง และภาระรายทีม · งานที่ยังไม่มีเจ้าหน้าที่ขึ้นให้
          ทุกทีมเห็นทั้งสองแผง · สัปดาห์ = ของตารางเท่านั้น (ลูกศรอยู่ในแถบของแผงตาราง) เพราะ
          คิวรอจัดถาวรข้ามสัปดาห์โดยนิยาม (F-6) · มติ 2026-09-22 แทนประโยค "สัปดาห์กับทีมคุม
          ทุกบล็อก" ของ 2026-09-15
          ⭐ ตัวกรองทีมโผล่เฉพาะเมื่อฝ่ายมีทีมจริง — ตัวกรองที่มีตัวเลือกเดียวคือของประดับ */}
      {teamOptions.length > 1 && (
        <div className="scope-row">
          <Segmented
            value={teamFilter}
            onChange={setTeamFilter}
            options={teamOptions}
            ariaLabel="กรองตามทีมเจ้าหน้าที่บริการ"
            className={styles.segWrap}
          />
          {teamFilter !== ALL_TEAMS && (
            <small className={styles.scopeNote}>งานที่ยังไม่มีเจ้าหน้าที่ขึ้นให้ทุกทีมเห็น</small>
          )}
        </div>
      )}

      {pendingSuggestion && (
        <StatusNotice
          tone="success"
          title={`ปิดงาน ${pendingSuggestion.fromCode} แล้ว · รอบถัดไปควรเข้า ${dayText(pendingSuggestion.scheduledDate)}`}
          action={(
            <div className={styles.noticeActions}>
              {suggestionExisting ? (
                <Button size="sm" tone="neutral" onClick={() => {
                  /* ล้างตัวกรองที่อาจซ่อนใบนั้น (ชิปสัปดาห์ · ช่วงนัด) ก่อนค้นด้วยรหัส */
                  const target = queueBucketOf(suggestionExisting, queueWindow(todayIso)) || "waiting";
                  setWithin(null);
                  setFarOn(true);
                  setSearch(suggestionExisting.code || "");
                  setQuery({ tab: target === "waiting" ? null : target, range: null });
                  setPendingSuggestion(null);
                  window.requestAnimationFrame(() => focusQueue(suggestionExisting.id));
                }}>
                  ดูในรายการงาน
                </Button>
              ) : canEdit ? (
                <Button size="sm" tone="neutral" onClick={() => { openNew(pendingSuggestion); setPendingSuggestion(null); }}>
                  ตั้งนัดรอบถัดไป
                </Button>
              ) : null}
              <Button size="sm" variant="quiet" onClick={() => setPendingSuggestion(null)}>ไม่ต้อง</Button>
            </div>
          )}
        >
          {suggestionExisting
            ? `มีนัดรอบนั้นแล้ว: ${suggestionExisting.code || suggestionExisting.id} (${VISIT_STATUS_LABELS[suggestionExisting.status] || suggestionExisting.status})`
            : "ระบบไม่สร้างนัดให้เอง — กด “ตั้งนัดรอบถัดไป” ถ้าจะเข้ารอบถัดไป"}
        </StatusNotice>
      )}

      {/* ⭐ กติกาที่ตัดสินไปแล้วต้องอ่านได้จากบนจอ ไม่ใช่อยู่แต่ในคอมเมนต์โค้ด
          (มติผู้ใช้ 2026-08-28: TS ไม่ใช่ต้นทางของงาน) · บรรทัดสองพาไปคิวต้นทาง (ไม่ก๊อปมาไว้ที่นี่ —
          หนึ่งงานหนึ่งคิวของฝ่าย · SO-centric) */}
      <div className={styles.placeNote}>
        <p>
          หน้านี้ <b>“วาง”</b> งาน ไม่ได้ <b>“สร้าง”</b> งาน — นัดเกิดจากรอบบริการของไซต์
          หรือจากงานนอกรอบที่มีต้นเรื่อง และขึ้นตารางไม่ได้จนกว่าจะผ่านด่าน
        </p>
        <p className={styles.upstream}>
          <span className={styles.upstreamLabel}>ต้นทางของงาน:</span>
          <span>
            <Link href="/service/intake" className="linklike">งานเข้าใหม่</Link> · รอตั้งไซต์/โซน
            {intakeCount != null && <span className={styles.upCount}>{fmtNumber(intakeCount)}</span>}
          </span>
          {canSeeRequests && (
            <span>
              <Link href="/service/requests" className="linklike">คิวคำร้อง</Link> · รอฝ่าย TS
              {requestsCount != null && <span className={styles.upCount}>{fmtNumber(requestsCount)}</span>}
            </span>
          )}
        </p>
      </div>

      {/* ⭐ วางคู่กัน (มติ 2026-09-22 ทางเลือก B) — วัดจากความกว้างกล่อง ไม่ใช่จอ (@container)
          จอแคบกว่าที่ตารางรับไหว ⇒ ถอยเป็นรายการบน ตารางล่าง อัตโนมัติ */}
      <div className={styles.layout}>
        <div className={styles.layoutGrid}>
          {/* ═══ แผง 1: รายการงาน (ไม่ผูกกับสัปดาห์) ═══ */}
          <ListPanel
            id="schedule-queue"
            icon={<Hourglass size={17} aria-hidden="true" />}
            title="รายการงาน"
            subtitle={queueSubtitle}
            count={queueReady ? `${fmtNumber(queueView.listedCount)} ${QUEUE_BUCKET_UNITS[bucket]}` : null}
            loading={queueLoading}
            skeletonRows={5}
            toolbar={(
              <>
                <Segmented
                  value={bucket}
                  onChange={(next) => { setWithin(null); setQuery({ tab: next === "waiting" ? null : next, range: null }); }}
                  options={bucketOptions}
                  ariaLabel="กลุ่มงาน"
                  className={styles.segWrap}
                />
                {bucket === "scheduled" && (
                  <Segmented
                    value={range}
                    onChange={(next) => setQuery({ range: next === "all" ? null : next })}
                    options={rangeOptions}
                    ariaLabel="ช่วงของนัดที่จัดแล้ว"
                    className={styles.segWrap}
                  />
                )}
                {bucket === "waiting" && within && (
                  <Button size="sm" tone="neutral" onClick={() => setWithin(null)} icon={<X size={13} aria-hidden="true" />}
                    aria-label={`ล้างตัวกรอง ${weekChipText(within.from)}`}>
                    {weekChipText(within.from)}
                  </Button>
                )}
                <label className={`search-glass ${styles.search}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหา รหัสนัด ไซต์ ลูกค้า เจ้าหน้าที่ เหตุที่ติด"
                    aria-label="ค้นหารายการงาน"
                    autoComplete="off"
                  />
                </label>
              </>
            )}
          >
            {queueError && (
              <StatusNotice tone="error" title="โหลดรายการงานไม่สำเร็จ"
                action={<Button size="sm" variant="ghost" onClick={() => loadQueue()}>ลองใหม่</Button>}>
                {queueError} — ยังไม่รู้ว่ามีงานรอจัดหรือค้างอยู่เท่าไร ไม่ได้แปลว่าคิวว่าง
              </StatusNotice>
            )}

            {!queueError && flatRows.length === 0 && (
              <EmptyState plain icon={Hourglass}>
                {thaiText(queueEmpty.title)}
                {queueEmpty.hint && <small>{thaiText(queueEmpty.hint)}</small>}
                {queueEmpty.action && (
                  <Button as={Link} href={queueEmpty.action.href} size="sm" tone="neutral">{queueEmpty.action.label}</Button>
                )}
                {queueEmpty.clearSearch && <Button size="sm" variant="quiet" onClick={() => setSearch("")}>ล้างคำค้น</Button>}
                {queueEmpty.clearWithin && <Button size="sm" variant="quiet" onClick={() => setWithin(null)}>ล้างตัวกรองสัปดาห์</Button>}
              </EmptyState>
            )}

            {!queueError && flatRows.length > 0 && (
              <div className={styles.queueGroups}>
                {pageGroups.map((group) => {
                  const folded = group.folded;
                  return (
                    <section key={group.key} className={styles.group} data-tone={group.tone || undefined} aria-label={group.label}>
                      <div className={styles.groupHead}>
                        {/* พับได้เฉพาะกลุ่มที่ตั้งใจให้พับ ("รอฝ่ายอื่น") — หัวกลุ่มอื่นเป็นป้ายเฉย ๆ ไม่ใช่ปุ่มที่กดแล้วไม่มีอะไร */}
                        {group.collapsible ? (
                          <button type="button" className={styles.groupToggle} aria-expanded={!folded} onClick={() => toggleGroup(group.key)} disabled={searching}>
                            {folded
                              ? <ChevronRight size={15} aria-hidden="true" />
                              : <ChevronDown size={15} aria-hidden="true" />}
                            <strong>{group.label}{group.continued ? " (ต่อ)" : ""}</strong>
                          </button>
                        ) : (
                          <strong className={styles.groupLabel}>{group.label}{group.continued ? " (ต่อ)" : ""}</strong>
                        )}
                        <span className={styles.groupTotal}>{group.total}</span>
                        {group.sub && <span className={styles.groupSub}>{group.sub}</span>}
                        {group.personId && (
                          <Link href={`/service/today?user=${encodeURIComponent(group.personId)}`} className={`linklike ${styles.groupLink}`}>
                            งานวันนี้ของ{group.personName}
                          </Link>
                        )}
                      </div>
                      {!folded && (
                        <ul className={styles.cards}>
                          {group.pageRows.map((row) => (
                            <ScheduleQueueCard
                              key={row.id}
                              row={row}
                              canEdit={canEdit}
                              releasing={releaseBusy && releaseRow?.id === row.id}
                              onOpen={openVisit}
                              onRelease={askRelease}
                              onCalendar={showOnCalendar}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            {/* ร่างไกลที่ยังติดด่าน — พับเป็นบรรทัดเดียว ไม่ให้ท่วมงานที่ต้องจัดสัปดาห์นี้ */}
            {queueReady && bucket === "waiting" && queueView.farCount > 0 && !search.trim() && !within && (
              <p className={styles.farLine}>
                <Hourglass size={13} aria-hidden="true" />
                <span>
                  {farOn
                    ? <>แสดงร่างล่วงหน้าเกิน 14 วันอยู่ {fmtNumber(queueView.farCount)} ใบ · </>
                    : <>ร่างล่วงหน้าเกิน 14 วันอีก {fmtNumber(queueView.farCount)} ใบ ยังติดด่านอยู่ — รอบบริการสร้างล่วงหน้า 90 วัน ยังไม่ต้องรีบ · </>}
                  <button type="button" className="text-action" onClick={() => setFarOn((v) => !v)}>{farOn ? "ซ่อน" : "แสดง"}</button>
                </span>
              </p>
            )}

            {!queueError && (
              <Pager
                page={pagination.page}
                pageCount={pagination.pageCount}
                total={pagination.total}
                onPage={pagination.setPage}
                pageSize={pagination.pageSize}
                onPageSize={pagination.setPageSize}
                pageSizeOptions={[10, 25, 50]}
                itemLabel={QUEUE_BUCKET_UNITS[bucket]}
                ariaLabel="แบ่งหน้ารายการงาน"
              />
            )}
          </ListPanel>

          {/* ═══ แผง 2: ตารางนัดเข้าบริการ (รายสัปดาห์) ═══
              · ลูกศรสัปดาห์อยู่ในแถบของแผงนี้ (ขยับแค่ตาราง) · ตัวสลับ สัปดาห์/รายการ อยู่ข้างกัน
              · `loading` แทนที่เฉพาะเนื้อ — หัวแผงกับแถบเครื่องมือยืนอยู่ระหว่างเลื่อนสัปดาห์ */}
          <div ref={boardRef} className={styles.boardAnchor}>
            <ListPanel
              id="schedule-board"
              icon={<CalendarDays size={17} aria-hidden="true" />}
              title="ตารางนัดเข้าบริการ"
              subtitle={view === "week"
                ? "เจ้าหน้าที่ × วัน ของสัปดาห์ที่เลือก — ร่างไม่ขึ้นตารางนี้ · กดนัดเพื่อเปิดดูหรือแก้"
                : "เรียงตามวันแล้วตามเวลา — ร่างไม่ขึ้นตารางนี้ · กดนัดเพื่อเปิดดูหรือแก้"}
              /* 🐞 เดิมนับ boardVisits ทั้งฝ่าย — เลือกทีมที่ว่างแล้วกริดว่างแต่ยังบอก "1 นัด" */
              count={loading || loadError ? null : `${visibleVisitCount} นัด`}
              loading={loading}
              toolbar={(
                <>
                  <div className={styles.weekNav}>
                    <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ก่อนหน้า" onClick={() => shiftWeek(-1)} icon={<ChevronLeft size={16} aria-hidden="true" />} />
                    <strong className={styles.weekLabel}>{weekLabel}</strong>
                    <Button tone="neutral" variant="quiet" iconOnly aria-label="สัปดาห์ถัดไป" onClick={() => shiftWeek(1)} icon={<ChevronRight size={16} aria-hidden="true" />} />
                    <Button tone="neutral" variant="quiet" size="sm" onClick={() => { setFocus(null); goToWeek(todayIso); }}>สัปดาห์นี้</Button>
                  </div>
                  <div className="spacer" />
                  <Segmented
                    value={view}
                    onChange={setView}
                    ariaLabel="มุมมองตาราง"
                    options={[
                      { value: "week", label: "สัปดาห์" },
                      { value: "list", label: "รายการ" },
                    ]}
                  />
                </>
              )}
            >
              {loadError && (
                <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}>
                  {loadError}
                </StatusNotice>
              )}

              {/* ⭐ ภาระรายทีมของสัปดาห์ที่เปิดอยู่ — ทีมที่มีคนแต่ไม่มีนัดขึ้นเป็น 0
                  ไม่ใช่หายไป เพราะทีมว่างคือทีมที่รับงานเพิ่มได้ ซึ่งเป็นสิ่งที่คนจัดคิวหาอยู่ */}
              {!loadError && crewLoad.length > 0 && (
                <ul className={styles.teamLoad} aria-label="ภาระรายทีม">
                  {crewLoad.map((row) => (
                    <li key={row.code}>
                      <b>{row.name}</b>
                      {/* ทีมว่าง = มีคนแต่ยังไม่มีนัด — เขียนเป็นคำ ไม่ใช่จุดสี (จุดเขียวเคยชนสี "ประเมินพื้นที่"
                          ในคำอธิบายสีชนิดงาน) · ทีมที่ไม่มีคนเลยรับงานไม่ได้ จึงไม่ติดป้ายว่าง */}
                      {row.visits === 0 && row.people > 0 && <span className={styles.teamFree}>รับงานได้</span>}
                      <span>{fmtNumber(row.visits)} นัด</span>
                      <span>{row.people ? `${fmtNumber(row.people)} คน` : naText(null)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* ⭐ แถบบอกตำแหน่ง — มาจากปุ่ม "ปฏิทิน" ของการ์ด · ข้อความล้วน ไม่วาดอะไรลงช่อง */}
              {!loadError && focusInfo && focusText && (
                <div ref={stripRef} tabIndex={-1} role="region" aria-label="ตำแหน่งที่กำลังดู" className={styles.strip}>
                  <StatusNotice
                    tone={focus?.released ? "success" : "info"}
                    title={focusText.title}
                    onDismiss={() => setFocus(null)}
                    dismissLabel="ปิดแถบตำแหน่ง"
                    action={(
                      <div className={styles.noticeActions}>
                        {focusInfo.isDraft && canEdit && focusRow && (
                          <GatedAction
                            tone="neutral" size="sm"
                            blocker={focusRow.ready ? "" : gateBlocker(focusRow.gate || [])}
                            onClick={() => askRelease(focusRow)}
                          >
                            ปล่อยขึ้นตาราง
                          </GatedAction>
                        )}
                        {focusVisit && (
                          <Button size="sm" tone="neutral" onClick={() => openVisit(focusVisit)}>
                            {focusInfo.isDraft ? "เปิดร่าง" : "เปิดนัด"}
                          </Button>
                        )}
                        <button type="button" className="text-action" onClick={backToList}>กลับไปที่รายการ</button>
                      </div>
                    )}
                  >
                    <span className={focusText.over ? styles.warnText : undefined}>{focusText.body}</span>
                  </StatusNotice>
                </div>
              )}

              {/* ร่างของสัปดาห์นี้ไม่อยู่บนกริด — บอกเป็นข้อความพร้อมทางไปดูในรายการ */}
              {!loadError && !loading && !queueError && draftsThisWeek > 0 && (
                <p className={styles.draftsLine}>
                  <Hourglass size={13} aria-hidden="true" />
                  <span>
                    มีร่างที่เสนอวันใน{weekText.trim()} {fmtNumber(draftsThisWeek)} ใบ (ไม่อยู่บนตารางจนกว่าจะปล่อย) —{" "}
                    <button
                    type="button"
                    className="text-action"
                    onClick={() => {
                      setWithin({ from: range7.from, to: range7.to });
                      setQuery({ tab: null, range: null });
                      document.getElementById("schedule-queue")?.scrollIntoView({ block: "start" });
                    }}
                  >
                    ดูในรายการงาน
                    </button>
                  </span>
                </p>
              )}

              {loadError || view !== "week" ? null : gridHasNoRows ? (
                /* ไม่มีแถวเลย = ไม่มีทั้งเจ้าหน้าที่หน้างานและนัด — คนละเรื่องกับ "สัปดาห์นี้ว่าง"
                   ซึ่งเห็นได้จากแถวที่ว่างเปล่าอยู่แล้ว */
                <EmptyState plain icon={CalendarDays}>
                  {thaiText(emptyGridTitle)}
                  {emptyGridHint && <small>{thaiText(emptyGridHint)}</small>}
                </EmptyState>
              ) : (
                /* 🐞 เดิมส่งตระกูล grid ซึ่ง **ไม่มีอยู่จริง** ในระบบตาราง (Table.module.css
                   ไม่มีกฎของมันเลย และทั้งเว็บใช้ที่นี่ที่เดียว) ⇒ ได้กฎกลางของ [data-family]
                   มาครึ่งเดียว: คอลัมน์ชื่อเจ้าหน้าที่ไม่ตรึง · vertical-align: top ที่ไฟล์นี้เขียนไว้
                   ถูกกฎกลาง (0,2,1) ทับ · หัววัน/ชื่อเจ้าหน้าที่เหลือ 9.5px จนเลขวันที่เป็นตัวเล็กสุด
                   ในหน้า · ตัวที่ตรึงคอลัมน์แรกคือ matrix · ชิดบนทั้งแถวคือ cells stacked */
                <TableScroll family="matrix" cells="stacked" minWidth={900}>
                  <table className={styles.board}>
                    <thead>
                      <tr>
                        {/* ข้อความต้องอยู่ใน span — ที่ th โดนกฎหัวตารางกลางกดเหลือ 9.5px ข้างหัววัน 11.5px */}
                        <th scope="col" className={styles.techCol}><span className={styles.headLabel}>เจ้าหน้าที่</span></th>
                        {days.map((day) => (
                          <th key={day.iso} scope="col" className={day.weekend ? styles.weekend : undefined}
                            data-focus={focusInfo && focusInfo.date === day.iso ? "yes" : undefined}>
                            <span className={styles.dayName}>{DAY_LABELS[day.date.getDay()]}</span>
                            <span className={`${styles.dayNum} ${day.iso === todayIso ? styles.today : ""}`.trim()}>{day.date.getDate()}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map((row) => (
                        <tr key={row.key}>
                          {/* ชื่อเจ้าหน้าที่กดได้ → หน้า "งานวันนี้" ของคนนั้น (?user=) — ทางเข้า
                              มุมมอง "ไปแทนกัน" หลังตัดปุ่มทั้งทีมออกจากหน้าเจ้าหน้าที่ (มติ 2026-08-02 ข้อ 2)
                              แถว "ยังไม่มอบหมาย" ไม่มีเจ้าของ จึงไม่มีลิงก์ */}
                          <th scope="row" className={styles.techCol}
                            data-focus={focusInfo && (focusInfo.assigneeId || UNASSIGNED) === row.key ? "yes" : undefined}>
                            {row.key === UNASSIGNED ? row.name : (
                              <Link href={`/service/today?user=${encodeURIComponent(row.key)}`} className={styles.techLink}>
                                {row.name}
                              </Link>
                            )}
                          </th>
                          {days.map((day) => {
                            const cellVisits = sortByTime(row.visits.filter((v) => v.scheduledDate === day.iso));
                            const loadKey = `${row.key}|${day.iso}`;
                            const dayLoad = loads.get(loadKey);
                            const focused = focusInfo && focusInfo.date === day.iso && (focusInfo.assigneeId || UNASSIGNED) === row.key;
                            return (
                              <td key={day.iso} className={day.weekend ? styles.weekend : undefined}>
                                <div className={styles.cell}>
                                  {(overloaded(dayLoad) || crossRouteZone.has(loadKey)) && (
                                    <p className={styles.cellWarn}>
                                      <AlertTriangle size={12} aria-hidden="true" />
                                      {overloaded(dayLoad) ? workloadText(dayLoad) : null}
                                      {overloaded(dayLoad) && crossRouteZone.has(loadKey) ? " · " : null}
                                      {crossRouteZone.has(loadKey) ? "ข้ามเขต" : null}
                                    </p>
                                  )}
                                  {/* วันที่ยังไม่เกินภาระก็ต้องอ่านออกว่าหนักแค่ไหน — ไม่ใช่
                                      เห็นตัวเลขเฉพาะตอนที่สายไปแล้ว */}
                                  {!overloaded(dayLoad) && dayLoad?.assets > 0 && (
                                    <p className={`${styles.cellLoad} ${focused ? styles.cellLoadFocus : ""}`.trim()}>{workloadText(dayLoad)}</p>
                                  )}
                                  {cellVisits.map((visit) => {
                                    const site = sitesById.get(visit.siteId);
                                    const warnings = visitWarnings(visit, { site, overlapIds });
                                    return (
                                      <button
                                        key={visit.id}
                                        type="button"
                                        className={`${styles.visitChip} ${styles[`kind_${visit.kind}`] || ""} ${visit.status === "cancelled" || visit.status === "rescheduled" ? styles.visitMuted : ""}`}
                                        data-focus={focus?.visitId === visit.id ? "yes" : undefined}
                                        onClick={() => openVisit(visit)}
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
                                        {/* งานที่ไปกันหลายคน — คนจัดคิวต้องเห็นว่านัดนี้กินเจ้าหน้าที่ไปกี่คน
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
                                      (มติผู้ใช้ 2026-08-28) · ถอดออกแล้ว การวางงานลงช่องมาจาก
                                      รายการงานเท่านั้น ซึ่งปล่อยได้เฉพาะร่างที่ผ่านด่านแล้ว */}
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
              {!loadError && view === "list" && (
                visibleVisitCount === 0 ? (
                  <EmptyState plain icon={CalendarDays}>{`${weekText}ยังไม่มีนัดเข้าบริการ`}</EmptyState>
                ) : (
                  <ul className={styles.listView}>
                    {days.map((day) => {
                      const dayVisits = sortByTime(
                        teamRows.flatMap((row) => row.visits.filter((v) => v.scheduledDate === day.iso)),
                      );
                      if (!dayVisits.length) return null;
                      return (
                        <li key={day.iso}>
                          <h3 className={styles.listDay} data-today={day.iso === todayIso ? "yes" : undefined}
                            data-focus={focusInfo && focusInfo.date === day.iso ? "yes" : undefined}>
                            {DAY_LABELS[day.date.getDay()]} {day.date.getDate()} {fmtMonthShort(day.iso)}
                            <span>{dayVisits.length} นัด</span>
                          </h3>
                          <ul className={styles.listRows}>
                            {dayVisits.map((visit) => {
                              const site = sitesById.get(visit.siteId);
                              const warnings = visitWarnings(visit, { site, overlapIds });
                              const siteLoad = workloadAll[visit.siteId];
                              return (
                                <li key={visit.id}>
                                  <button type="button" className={styles.listRow} onClick={() => openVisit(visit)}
                                    data-focus={focus?.visitId === visit.id ? "yes" : undefined}>
                                    <span className={styles.listTime}>{visitTimeText(visit) || "ทั้งวัน"}</span>
                                    <span className={styles.listSite}>
                                      <b>{site?.name || visit.siteId}</b>
                                      <span>
                                        {VISIT_KIND_LABELS[visit.kind]}
                                        {site?.routeZone ? ` · ${site.routeZone}` : ""}
                                        {siteLoad?.assets ? ` · ${siteLoad.assets} จุด` : ""}
                                      </span>
                                      {/* คำเตือนเคยอยู่ใน title= อย่างเดียว ซึ่งจอสัมผัสไม่มี — แถวรายการมีที่พอเขียนเต็ม */}
                                      {warnings.length > 0 && (
                                        <span className={styles.listWarn}>{warnings.map((w) => w.message).join(" · ")}</span>
                                      )}
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
              {/* ไม่มีชิปบนจอ (ทีมที่เลือกไม่มีแถว/ไม่มีนัด) = ไม่มีอะไรให้คำอธิบายสี */}
              {!loadError && view === "week" && !gridHasNoRows && visibleVisitCount > 0 && (
                <ul className={styles.legend} aria-label="คำอธิบายสีของชนิดงาน">
                  {VISIT_KINDS.map((kind) => (
                    <li key={kind} className={styles.legendItem}>
                      <span className={`${styles.legendSwatch} ${styles[`kind_${kind}`] || ""}`} aria-hidden="true" />
                      {VISIT_KIND_LABELS[kind] || kind}
                    </li>
                  ))}
                </ul>
              )}
            </ListPanel>
          </div>
        </div>
      </div>

      <ServiceVisitModal
        open={formVisit !== undefined}
        visit={formVisit}
        sites={allSites}
        technicians={pickerTechnicians}
        defaults={formDefaults}
        focusField={formFocus}
        /* ⚠️ ส่งภาระเมื่อรายชื่อเจ้าหน้าที่โหลดแล้วเท่านั้น — ก่อนนั้นตัวเลือกจะเข้าใจว่าคนที่ตั้งไว้
           "ไม่อยู่ในรายชื่อแล้ว" และโชว์ศูนย์เหมือนว่างจริง (ยังเป็นดรอปดาวน์เดิมจนกว่าจะโหลดเสร็จ) */
        staffLoadFor={technicians.length ? staffLoadFor : null}
        /* ⭐ บริบทด่าน ①② หั่นตามไซต์ของนัดที่กำลังแก้ — โมดัลประเมินสดตอนคนเปลี่ยน
           วัน/ผู้รับผิดชอบ ด้วยตัวประเมินตัวเดียวกับ server · รวมบริบทของรายการงานด้วย
           (ร่างเดือนหน้าไม่อยู่ในบริบทของสัปดาห์ที่เปิด) */
        gateContext={gateContextForSite(gateContextAll, formVisit?.siteId || formDefaults?.siteId)}
        onClose={closeModal}
        onSave={saveVisit}
      />

      {/* ⭐ ปล่อยจากการ์ด = ยืนยันก่อนเสมอ บอก "ลงช่องไหน" และ "ใครจะเห็น" (มติ #1223:
          ทุกการอนุมัติต้องบอกผลลัพธ์) · ภาระเกินเตือนเท่านั้น ไม่ห้าม */}
      <ConfirmDialog
        open={!!releaseRow}
        title={releaseRow ? `ปล่อย ${releaseRow.code} ขึ้นตาราง?` : ""}
        message={releaseRow
          ? (releaseRow.visit.assigneeId
            ? `จะขึ้นช่อง ${releaseRow.visit.assigneeName} · ${dayText(releaseRow.visit.scheduledDate)} ${visitTimeText(releaseRow.visit)} บนตาราง และโผล่ในงานวันนี้ของ${(releaseRow.visit.assigneeName || "").split(/\s+/)[0]}วันนั้น`
            : `จะขึ้นแถว “ยังไม่มอบหมาย” · ${dayText(releaseRow.visit.scheduledDate)}`)
          : ""}
        confirmLabel="ปล่อยขึ้นตาราง"
        busy={releaseBusy}
        busyLabel="กำลังปล่อย…"
        onConfirm={confirmRelease}
        onClose={() => { if (!releaseBusy) setReleaseRow(null); }}
      >
        {releaseLoad?.over && (
          <StatusNotice tone="warning" title={`วันนั้นจะมี ${releaseLoad.visits} นัด · ${releaseLoad.assets} จุด — เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`}>
            เตือนเท่านั้น ไม่ห้าม · ถ้าจะแบ่งงานให้คนอื่น กด “ยกเลิก” แล้วเปิดร่างเพื่อเปลี่ยนเจ้าหน้าที่
          </StatusNotice>
        )}
      </ConfirmDialog>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

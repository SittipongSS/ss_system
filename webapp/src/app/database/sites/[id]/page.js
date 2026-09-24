"use client";
// ── รายละเอียดไซต์: เครื่อง + รอบบริการ + ประวัติการเข้า (mig 0187/0188) ──
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtNumber, fmtPhone, naText, NA } from "@/lib/format";
import { floorLabel } from "@/lib/service/zoneCode";
import { use } from "react";
import { AirVent, Boxes, CalendarClock, History, Layers, MapPin, Navigation, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import GatedAction from "@/components/ui/GatedAction";
import Pager from "@/components/ui/Pager";
import Segmented from "@/components/ui/Segmented";
import { TableScroll } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import StatusNotice from "@/components/ui/StatusNotice";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import ServiceAssetModal from "@/components/service/ServiceAssetModal";
import ServicePlanModal from "@/components/service/ServicePlanModal";
import ServiceZoneModal from "@/components/service/ServiceZoneModal";
import {
  ASSET_STATUS_LABELS,
  accessWindowText,
  assetRollup,
} from "@/lib/service/sites";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { refillStatus } from "@/lib/service/refill";
import {
  ALL_BUILDINGS,
  assetBuildingKey,
  assetModelSummary,
  buildingChipOptions,
  filterSiteAssets,
  filterZones,
  sortSiteAssets,
  sortZones,
  zoneBuildingKey,
} from "@/lib/service/siteDetailLists";
import { usePagination } from "@/lib/usePagination";
import {
  VISIT_KIND_LABELS,
  VISIT_STATUS_LABELS,
  visitTimeText,
} from "@/lib/service/rounds";
import { visitDeleteBlocker, visitDeleteButton } from "@/lib/service/visitDelete";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canBeServiceAssignee, canEditService, canViewVisitReport } from "@/lib/permissions";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { apiFetch } from "@/lib/apiFetch";
import { deleteWithForce } from "@/lib/forceDeleteClient";

export default function ServiceSiteDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);
  /* ⭐ หน้านี้เป็นของ **ทะเบียน** (ทุกคนที่เข้าฐานข้อมูลได้เปิดอ่าน · มติผู้ใช้ 2026-09-24) แต่ใบส่งงาน
     (`/service/visits/[id]`) เปิดได้เฉพาะฝ่ายบริการ + ฝ่ายขาย (`canViewVisitReport` · มติเดียวกัน)
     ⇒ ลิงก์ไปใบส่งงานโชว์เฉพาะคนที่เปิดได้จริง (กติกา "ไม่มีสิทธิ์ = ไม่โชว์" — ลิงก์ที่กดแล้ว Forbidden คือทางตัน) */
  const canOpenVisit = useMemo(() => canViewVisitReport({ role, team, teams, department }), [role, team, teams, department]);
  /* ⚠️ ตรงกับ `canForceDelete` ที่ server (role === 'admin') เป๊ะ — สองฝั่งไม่ตรงกัน
     เมื่อไร จอจะโชว์ปุ่มที่กดแล้วเด้ง หรือซ่อนปุ่มที่จริง ๆ กดได้ */
  const isAdmin = role === "admin";

  const [site, setSite] = useState(null);
  const [zones, setZones] = useState([]);
  const [assets, setAssets] = useState([]);
  // เข้าเติมล่าสุด + นัดครั้งหน้า — ตัวตั้งของการประเมินว่าน้ำหอมจะหมดวันไหน (S-4)
  const [schedule, setSchedule] = useState({ lastRefillDate: null, nextVisitDate: null });
  // ข้อผูกพันจำนวนรอบจากใบเสนอราคา (mig 0326) — ฟอร์มวางรอบเทียบกับความถี่ที่กำลังตั้ง
  const [roundsSold, setRoundsSold] = useState(null);
  // ใบสั่งขายที่ลงของไว้ที่ไซต์นี้ — ตัวเลือกของช่อง "ใบที่ครอบรอบนี้" ในโมดัลรอบ
  const [siteOrders, setSiteOrders] = useState([]);

  const [plans, setPlans] = useState([]);
  const [visits, setVisits] = useState([]);
  /* นัด → เลขที่ใบสั่งขาย ผ่านรอบที่โหลดมาแล้ว — ไม่ต้องยิง API เพิ่ม
     ⚠️ `service_visits` ไม่มีคอลัมน์ `salesOrderId` (mig 0188) · ข้อผูกพันของนัด
     อ่านผ่าน `planId → service_plans."salesOrderId"` เสมอ
     ⚠️ นัดที่ไม่มี `planId` (งานซ่อมนอกรอบ) ไม่ใช่รอบตามข้อผูกพันของใบไหน */
  const orderByPlanId = useMemo(
    () => new Map(plans.map((p) => [p.id, p.salesOrderNumber || null])),
    [plans],
  );
  const orderOfVisit = (visit) => (visit?.planId ? orderByPlanId.get(visit.planId) : null) || null;

  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  /* รอบบริการ/นัด พังได้แยกจากตัวไซต์ — ของรองโหลดไม่ได้ห้ามลากทั้งหน้าล่ม
     🐞 เดิม `throw` รวมกับตัวไซต์ ⇒ คนนอกฝ่ายบริการ (เส้นนัด/รอบยังเป็นของ TS) เปิดหน้าไซต์แล้วเจอ
        Forbidden ทั้งหน้า ทั้งที่ข้อมูลไซต์ · โซน · เครื่อง อ่านได้ครบ (ผู้ใช้แจ้ง 2026-09-24) */
  const [planError, setPlanError] = useState("");
  const [visitError, setVisitError] = useState("");
  // 404 ≠ โหลดพัง — ไซต์ที่ถูกลบต้องไม่อ่านเป็นเน็ตสะดุดที่กดลองใหม่แล้วจะหาย · ทรงเดียวกับหน้าเครื่อง
  const [notFound, setNotFound] = useState(false);
  const [editingSite, setEditingSite] = useState(false);
  const [formAsset, setFormAsset] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formZone, setFormZone] = useState(undefined);
  const [formPlan, setFormPlan] = useState(undefined);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setPlanError("");
    setVisitError("");
    try {
      const [siteRes, planRes, visitRes] = await Promise.all([
        apiFetch(`/api/service/sites/${id}`),
        apiFetch(`/api/service/plans?siteId=${id}`),
        apiFetch(`/api/service/visits?siteId=${id}`),
      ]);
      const siteData = await siteRes.json().catch(() => null);
      setNotFound(siteRes.status === 404);
      if (!siteRes.ok) throw new Error(siteData?.error || "โหลดข้อมูลไซต์ไม่สำเร็จ");
      setSite(siteData?.site || null);
      setZones(Array.isArray(siteData?.zones) ? siteData.zones : []);
      setAssets(Array.isArray(siteData?.assets) ? siteData.assets : []);
      setSchedule(siteData?.schedule || { lastRefillDate: null, nextVisitDate: null });
      setRoundsSold(siteData?.roundsSold ?? null);
      setSiteOrders(siteData?.salesOrders || []);

      const planData = await planRes.json().catch(() => null);
      setPlans(planRes.ok && Array.isArray(planData) ? planData : []);
      if (!planRes.ok) setPlanError(planData?.error || "โหลดรอบบริการไม่สำเร็จ");

      const visitData = await visitRes.json().catch(() => null);
      setVisits(visitRes.ok && Array.isArray(visitData?.visits) ? visitData.visits : []);
      if (!visitRes.ok) setVisitError(visitData?.error || "โหลดนัดและประวัติการเข้าไม่สำเร็จ");
    } catch (e) {
      setLoadError(e.message || "โหลดข้อมูลไซต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // รายชื่อเจ้าหน้าที่บริการโหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formPlan === undefined || technicians.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/pm/assignable-users");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ");
        setTechnicians((Array.isArray(data) ? data : []).filter(canBeServiceAssignee));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [formPlan, technicians.length]);

  useEffect(() => {
    if (!editingSite || customers.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/customers");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อลูกค้าไม่สำเร็จ");
        setCustomers(Array.isArray(data) ? data : (data?.rows || []));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [editingSite, customers.length]);

  const saveSite = async (form) => {
    const res = await apiFetch(`/api/service/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: "บันทึกข้อมูลไซต์แล้ว" });
    await load();
  };

  const saveAsset = async (form) => {
    const editing = !!formAsset;
    const url = editing
      ? `/api/service/sites/${id}/assets/${formAsset.id}`
      : `/api/service/sites/${id}/assets`;
    const res = await apiFetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกเครื่อง ${data.code || data.label} แล้ว` : `เพิ่มเครื่อง ${data.code || data.label} แล้ว` });
    await load();
  };

  const saveZone = async (form) => {
    const editing = !!formZone;
    const url = editing
      ? `/api/service/sites/${id}/zones/${formZone.id}`
      : `/api/service/sites/${id}/zones`;
    const res = await apiFetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกโซน ${data.name} แล้ว` : `เพิ่มโซน ${data.name} แล้ว` });
    await load();
  };

  const removeZone = async () => {
    setBusy(true);
    try {
      const result = await deleteWithForce(`/api/service/sites/${id}/zones/${pendingDelete.row.id}`, { isAdmin });
      if (result.cancelled) return;
      setToast({ kind: "success", msg: `ลบโซน ${pendingDelete.row.name} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async () => {
    setBusy(true);
    try {
      const result = await deleteWithForce(`/api/service/sites/${id}/assets/${pendingDelete.row.id}`, { isAdmin });
      if (result.cancelled) return;
      setToast({ kind: "success", msg: `ลบเครื่อง ${pendingDelete.row.code || pendingDelete.row.label} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async (form) => {
    const editing = !!formPlan;
    // ⚠️ แก้รอบ **ไม่ลบนัดที่ gen ไปแล้ว** — เติมเพิ่มอย่างเดียว (generate=1)
    // นัดที่คนย้ายวัน/มอบหมายไปแล้วต้องไม่ถูก gen ทับ
    const res = await apiFetch(editing ? `/api/service/plans/${formPlan.id}?generate=1` : "/api/service/plans", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    const count = Array.isArray(data?.generated) ? data.generated.length : 0;
    setToast({
      kind: "success",
      msg: count ? `บันทึกรอบแล้ว · สร้างนัดให้ ${count} ครั้ง` : "บันทึกรอบแล้ว · ยังไม่มีนัดใหม่ที่ต้องสร้าง",
    });
    await load();
  };

  /* ลบนัด — เส้นนี้มี route มาตลอดแต่ **ไม่เคยมีปุ่มไหนเรียกเลย** (ผู้ใช้แจ้ง 2026-09-02
     "แอดมินลบแล้วติดนู่นนี่") · นัดที่ยังไม่เกิดขึ้นลบได้ตามปกติ ส่วนนัดที่ปิดงานแล้ว
     เป็นประวัติการเข้าไซต์ ⇒ ต้องเป็นแอดมินและส่ง ?force=1 มาโดยตั้งใจ
     ⭐ **ตั้งแต่ 24/09 ด่านของ API คือ `visitDeleteBlock`** (กติกาเดียวกับปุ่ม "ลบนัด" บนหน้าจัดคิว ·
        มติเจ้าของ 24/09) — ลบได้เฉพาะงานนอกรอบที่ยังไม่มีใครไปถึงไซต์ · นัดของรอบ/ใบคำร้อง/นัดถอนจาก
        เรื่องไม่ต่อสัญญา ต้องยกเลิกแทน ⇒ แถว "นัดที่จะถึง" ถามด่านตัวเดียวกัน · แอดมิน = เดินเส้น ?force=1
        พร้อมกล่องที่บอกว่ากำลังข้ามกติกาข้อไหน
     ⭐ **โชว์ถังขยะด้วยกติกาเดียวกับหน้าจัดคิว** (`visitDeleteButton` · รีวิว 24/09) — คนที่ไม่ใช่แอดมินเห็นถังขยะ
        เฉพาะงานนอกรอบ (ติดด่าน = โชว์แล้วบอกเหตุตอนกด) · นัดของรอบ/ใบคำร้องไม่มีถังขยะ
        🐞 เดิมโชว์ทุกแถวแล้วติดด่าน ⇒ แถวส่วนใหญ่ (นัดของรอบ) มีถังขยะที่กดแล้วได้แต่ toast "ลบไม่ได้"
           และสองจอพูดคนละแบบกับนัดใบเดียวกัน (หน้าจัดคิวไม่มีปุ่ม · หน้าไซต์มีปุ่มที่ใช้ไม่ได้)
        ⚠️ **ต้องให้เจ้าของยืนยัน** — ก่อน 24/09 ผู้จัดคิวลบนัดของรอบที่ยังไม่ถึงวันจากตารางนี้ได้ (ดู F-6d ③)
     ⚠️ ตารางลูกของนัดเป็น CASCADE ทั้งคู่ ⇒ ลบแล้วผลรายเครื่อง/ของที่ใช้หายตามเอง */
  const removeVisit = async () => {
    setBusy(true);
    try {
      const visit = pendingDelete.row;
      const url = `/api/service/visits/${visit.id}${pendingDelete.force ? "?force=1" : ""}`;
      const res = await apiFetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: `ลบนัด ${visit.code || visit.scheduledDate} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const removeSite = async () => {
    setBusy(true);
    try {
      /* ⭐ `deleteWithForce` ลบตามปกติก่อน · ถูกบล็อกด้วยกฎธุรกิจแล้วเป็นแอดมิน
         จะดึงพรีวิว (?dryRun=1) มาบอกว่าจะลบอะไรพ่วง แล้วถามยืนยันก่อนยิง ?force=1
         ⚠️ คนที่ไม่ใช่แอดมินยังเจอข้อความเดิม ("ปิดใช้งานแทนการลบ") ไม่เปลี่ยน */
      const result = await deleteWithForce(`/api/service/sites/${id}`, { isAdmin });
      if (result.cancelled) return;
      setPendingDelete(null);
      // toast ของหน้าที่กำลังจะออกจากมันไม่มีความหมาย — บอกที่ทะเบียนแทนหลังย้ายหน้า
      router.push("/database/sites?deleted=" + encodeURIComponent(site?.name || id));
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  /* ⭐ รอบที่มีนัดปิดงานแล้วถูกด่านกันไว้ (ดู `planDeleteBlocker`) — แอดมินยังบังคับ
     ลบได้ผ่านเส้น `?force=1` เดียวกับโซน/เครื่อง/ไซต์ · `deleteWithForce` จะดึงพรีวิว
     มาบอกก่อนว่าบังคับลบแล้วจะเกิดอะไร แล้วค่อยถามยืนยัน */
  const removePlan = async () => {
    setBusy(true);
    try {
      const result = await deleteWithForce(`/api/service/plans/${pendingDelete.row.id}`, { isAdmin });
      if (result.cancelled) return;
      setToast({
        kind: "success",
        msg: result.forced || result.data?.forced
          ? "ลบรอบแล้ว (บังคับลบ) — นัดที่ปิดงานแล้วขาดจากรอบ ไม่ถูกนับเป็นรอบตามข้อผูกพันอีก"
          : "ลบรอบแล้ว — นัดที่สร้างไว้ยังอยู่ในฐานะงานนอกรอบ",
      });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const rollup = useMemo(() => assetRollup(assets), [assets]);
  const accessText = site ? accessWindowText(site) : "";
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  // เครื่องที่ยังใช้งานแต่ไม่สังกัดโซน — แถบ backfill: ของเก่าเกิดก่อนมีโซน (mig 0298)
  const unzonedActive = useMemo(
    () => assets.filter((a) => a.status !== "removed" && !a.zoneId).length,
    [assets],
  );

  /* ── ตารางโซน/อุปกรณ์ — ค้นหา · ชิปอาคาร · แบ่งหน้า (ผู้ใช้ทัก "มันยาวไปมั้ย" 25/09/2026) ──────────
     🐞 The Empire ลงจาก Excel แล้วมี 247 โซน · 292 เครื่อง ⇒ สองตารางยาวต่อกัน 539 แถวไม่มีเครื่องมือเลย
     ⭐ ตัวคิดอยู่ lib/service/siteDetailLists.js (เทสต์ได้) · ไซต์เล็กหน้าตาแทบเท่าเดิม: ไม่ถึงหน้า Pager ไม่ขึ้น ·
        อาคารเดียว ชิปไม่ขึ้น
     ⚠️ เลขบนชิปอาคาร = จำนวนที่จะเห็นถ้ากด (กรองคำค้น/รุ่น/สถานะแล้ว ยกเว้นอาคาร) · ชิปที่เลือกไว้หายไป
        (แก้ชื่ออาคาร) ⇒ กลับเป็น "ทุกอาคาร" ไม่ใช่ค้างตัวกรองที่มองไม่เห็น */
  const [zoneQuery, setZoneQuery] = useState("");
  const [zoneBuilding, setZoneBuilding] = useState(ALL_BUILDINGS);
  const [assetQuery, setAssetQuery] = useState("");
  const [assetBuilding, setAssetBuilding] = useState(ALL_BUILDINGS);
  const [assetModels, setAssetModels] = useState([]);
  const [assetStatuses, setAssetStatuses] = useState([]);

  const buildingNames = useMemo(() => zones.map((z) => z.building), [zones]);
  // นับเครื่องต่อโซนครั้งเดียว — เดิม filter ทั้งกองต่อแถว (247 โซน × 292 เครื่องทุกเรนเดอร์)
  const assetCountByZone = useMemo(() => {
    const counts = new Map();
    for (const a of assets) {
      if (a.zoneId && a.status !== "removed") counts.set(a.zoneId, (counts.get(a.zoneId) || 0) + 1);
    }
    return counts;
  }, [assets]);
  const zonesByQuery = useMemo(() => filterZones(sortZones(zones), { query: zoneQuery }), [zones, zoneQuery]);
  const zoneBuildingOptions = useMemo(
    () => buildingChipOptions(zonesByQuery.map(zoneBuildingKey), buildingNames),
    [zonesByQuery, buildingNames],
  );
  const zoneBuildingShown = zoneBuildingOptions.some((o) => o.value === zoneBuilding) ? zoneBuilding : ALL_BUILDINGS;
  const shownZones = useMemo(
    () => filterZones(zonesByQuery, { building: zoneBuildingShown }),
    [zonesByQuery, zoneBuildingShown],
  );
  const zonePaging = usePagination(shownZones, { resetKey: `${zoneQuery}|${zoneBuildingShown}` });

  const modelSummary = useMemo(() => assetModelSummary(assets), [assets]);
  const assetStatusOptions = useMemo(
    () => [...new Set(assets.map((a) => a.status))].map((value) => ({ value, label: ASSET_STATUS_LABELS[value] || value })),
    [assets],
  );
  const assetsByFilters = useMemo(
    () => filterSiteAssets(sortSiteAssets(assets, zones), zonesById, { query: assetQuery, models: assetModels, statuses: assetStatuses }),
    [assets, zones, zonesById, assetQuery, assetModels, assetStatuses],
  );
  const assetBuildingOptions = useMemo(
    () => buildingChipOptions(
      assetsByFilters.map((a) => assetBuildingKey(a, zonesById)),
      // เครื่องที่ยังไม่อยู่ในโซนไหนเป็นกลุ่ม "ไม่ระบุอาคาร" ด้วย (null → กลุ่มนั้น)
      [...buildingNames, ...(assets.some((a) => !a.zoneId) ? [null] : [])],
    ),
    [assetsByFilters, zonesById, buildingNames, assets],
  );
  const assetBuildingShown = assetBuildingOptions.some((o) => o.value === assetBuilding) ? assetBuilding : ALL_BUILDINGS;
  const shownAssets = useMemo(
    () => filterSiteAssets(assetsByFilters, zonesById, { building: assetBuildingShown }),
    [assetsByFilters, zonesById, assetBuildingShown],
  );
  const assetPaging = usePagination(shownAssets, {
    resetKey: JSON.stringify([assetQuery, assetBuildingShown, assetModels, assetStatuses]),
  });
  // รุ่น/สถานะมีตัวเลือกเดียว = ไม่มีอะไรให้กรอง ⇒ ไม่วาดกลุ่มนั้น (ทั้งปุ่มหายเมื่อไม่เหลือกลุ่มไหน)
  const assetFilterGroups = [
    ...(modelSummary.length > 1 ? [{
      key: "model", label: "รุ่น", icon: Boxes,
      options: modelSummary.map((s) => ({ value: s.key, label: s.label })),
      selected: assetModels, onChange: setAssetModels,
    }] : []),
    ...(assetStatusOptions.length > 1 ? [{
      key: "status", label: "สถานะ", icon: Navigation,
      options: assetStatusOptions, selected: assetStatuses, onChange: setAssetStatuses,
    }] : []),
  ];

  // นัดที่จะถึง / ประวัติ — แยกกันเพราะคนละคำถาม ("เจ้าหน้าที่จะมาเมื่อไหร่" กับ "ที่ผ่านมาทำอะไรบ้าง")
  const todayIso = businessDate();
  const upcoming = useMemo(
    () => visits.filter((v) => v.scheduledDate >= todayIso && v.status === "scheduled"),
    [visits, todayIso],
  );
  const history = useMemo(
    () => [...visits].filter((v) => v.scheduledDate < todayIso || v.status !== "scheduled")
      .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)))
      .slice(0, 20),
    [visits, todayIso],
  );

  /* ⭐ เปลือกโหลด/ไม่พบ/พัง เป็น hideHeader เหมือนหน้าที่โหลดเสร็จ — ทรงเดียวกันทั้งสี่หน้า
     (เครื่อง · ไซต์ · โซน · ใบส่งงาน) · ลำดับ: ไม่พบ (404) มาก่อนโหลดพัง
     🐞 เดิม `!siteRes.ok` โยนทิ้งก่อน setSite ⇒ ไซต์ที่ถูกลบขึ้นการ์ดหัว "ไซต์บริการ" +
        "โหลดข้อมูลไซต์ไม่สำเร็จ" + ปุ่มลองใหม่ อ่านเหมือนเน็ตสะดุด · สาขา "ไม่พบ" ไม่เคยถูกเรียก */
  /* ♿ hideHeader ถอด h1 ของ Workspace ออกด้วย — หน้าที่โหลดเสร็จได้ h1 จาก DetailOverview
     แต่สามเปลือกนี้ไม่มีหัวเรื่องเลย (StatusNotice ใช้ <strong>) ⇒ คนใช้โปรแกรมอ่านจอกระโดดหาหัวเรื่องไม่เจอ
     ⇒ h1 ซ่อนตา (sr-only) ชื่อเดียวกับการ์ดหัวเดิม · หน้าตาไม่เปลี่ยน */
  const shellBack = { href: "/database/sites", label: "ทะเบียนไซต์" };
  const shell = (body) => (
    <Workspace hideHeader back={shellBack}>
      <h1 className="sr-only">ไซต์บริการ</h1>
      {body}
    </Workspace>
  );
  /* ⭐ โครงโหลดเฉพาะ **ครั้งแรก** (ยังไม่มีไซต์ในมือ) · โหลดซ้ำหลังบันทึกค้างหน้าเดิมไว้จนข้อมูลใหม่มา
     ⚠️ ห้ามกลับไปเป็น `if (loading) return <SkeletonRows/>` — หน้านี้มี ListPanel ที่มีช่องค้นหา ⇒ ถอดทั้งหน้า
        ทุกครั้งที่บันทึก = ช่องค้นหาหลุดโฟกัส/ตารางวูบ (ด่าน LIST_PANEL_SHAPE LP6) · โครงโหลดจึงเป็น
        ListPanel loading แบบเดียวกับหน้าโครงการ */
  // ⚠️ ไซต์ในมือเป็นคนละใบกับ URL (กดลิงก์ข้ามไซต์) = ยังไม่มีของใบนี้ ⇒ โครงโหลด ไม่ใช่ข้อมูลใบเก่าค้าง
  if (loading && (!site || site.id !== id)) {
    return shell(
      <ListPanel
        icon={<MapPin size={17} aria-hidden="true" />}
        title="ไซต์บริการ"
        subtitle="กำลังโหลดข้อมูลไซต์ โซน และอุปกรณ์"
        count={null}
        loading
      />,
    );
  }
  if (notFound || (!loadError && !site)) {
    return shell(
      <EmptyState icon={MapPin}>
        ไม่พบไซต์บริการนี้
        <small>อาจถูกลบไปแล้ว หรือรหัสในลิงก์ไม่ถูกต้อง</small>
      </EmptyState>,
    );
  }
  if (loadError) {
    return shell(
      <StatusNotice tone="error" title="โหลดข้อมูลไซต์ไม่สำเร็จ"
        action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
        {loadError}
      </StatusNotice>,
    );
  }

  /* ข้อความของกล่องยืนยันลบ — **ตารางเดียว ไม่ใช่ ternary ซ้อน**
     ⚠️ ของเดิมเป็น ternary ซ้อน 4 ชั้นคูณ 4 prop ⇒ เพิ่มชนิดที่ห้า (นัด) แล้วอ่านไม่ออก
        และแก้ข้อความผิดช่องได้ง่ายมาก เพราะสี่ชั้นนั้นต้องเรียงตรงกันเป๊ะทุกอัน */
  const DELETE_COPY = {
    plan: {
      title: "ลบรอบบริการ",
      message: (row) => `ลบรอบทุก ${row.everyDays} วัน?`,
      /* ⚠️ ข้อความเดิมบอกครึ่งเดียว — นัดอยู่ต่อจริง แต่มัน **ขาดจากรอบ** ซึ่งทำให้
         จำนวนรอบที่เดินตามข้อผูกพันของใบสั่งขายกลายเป็นศูนย์ · ตอนนี้รอบที่มีนัด
         ปิดงานแล้วถูกกันไว้ ⇒ คำต้องบอกทางออกที่ถูก ไม่ใช่แค่ผลข้างเคียง */
      detail: "รอบที่มีนัดปิดงานแล้วจะลบไม่ได้ — เอาเครื่องหมายถูก “เปิดใช้งาน” ออกในหน้าแก้รอบ แทน (หยุดสร้างนัดใหม่เหมือนกัน แต่ประวัติไม่ขาด) · รอบที่ยังไม่มีประวัติลบได้ตามปกติ และนัดที่สร้างไว้จะอยู่ต่อในฐานะงานนอกรอบ",
      confirmLabel: "ลบรอบ",
      onConfirm: removePlan,
    },
    zone: {
      title: "ลบโซนออกจากไซต์",
      message: (row) => `ลบโซน ${row.name}?`,
      detail: "โซนที่มีรอบขายผูกอยู่จะลบไม่ได้ (ปิดใช้งานแทนเพื่อเก็บประวัติ) · อุปกรณ์ในโซนไม่หาย แต่จะกลับไปกอง 'ยังไม่ระบุโซน'",
      confirmLabel: "ลบโซน",
      onConfirm: removeZone,
    },
    site: {
      title: "ลบไซต์บริการ",
      message: (row) => `ลบไซต์ ${row?.name}?`,
      detail: "ลบได้เฉพาะไซต์ที่ยังไม่มีเครื่อง/โซน/ประวัตินัด — มีของค้างอยู่จะลบไม่ผ่านพร้อมบอกว่าติดอะไร ถ้าไซต์นี้เลิกใช้แล้วให้ปิดใช้งานแทน (แก้ไขไซต์ → สถานะ)",
      confirmLabel: "ลบไซต์",
      onConfirm: removeSite,
    },
    asset: {
      title: "ลบอุปกรณ์ออกจากไซต์",
      message: (row) => `ลบ ${row.code || row.label} ออกจากไซต์นี้?`,
      detail: "ถ้าอุปกรณ์ถูกถอดออกจริง ให้ใช้คำสั่ง 'ถอดออกจากไซต์' หรือ 'ปลดระวาง' บนหน้าเครื่องแทนการลบ เพื่อไม่ให้ประวัติการเข้าบริการหาย",
      confirmLabel: "ลบอุปกรณ์",
      onConfirm: removeAsset,
    },
    visit: {
      title: "ลบนัดเข้าบริการ",
      message: (row) => `ลบนัด ${row.code || row.scheduledDate}?`,
      /* ⚠️ ข้อความเปลี่ยนตามว่าเป็นการลบธรรมดา หรือแอดมินข้ามด่านประวัติ —
         สองอย่างนี้มีน้ำหนักต่างกันมาก คนกดต้องรู้ว่ากำลังทำอันไหน */
      detail: "งานนอกรอบที่ยังไม่มีใครไปถึงไซต์ลบได้ · นัดหายจากตารางและรายการงาน พร้อมความเคลื่อนไหวของนัดนี้ — กู้คืนเองไม่ได้",
      confirmLabel: "ลบนัด",
      onConfirm: removeVisit,
    },
    /* ⚠️ กล่องของแอดมิน **บอกกติกาที่กำลังข้าม** จากด่านตัวเดียวกับ API (`visitDeleteBlocker`) —
       เดิมเขียนตายตัวว่า "ลบนัดที่ปิดงานแล้ว" ซึ่งผิดทันทีที่แอดมินลบนัดของรอบที่ยังไม่ถึงวัน (24/09) */
    visitForce: {
      title: "ลบนัดถาวร (ผู้ดูแลระบบ)",
      message: (row) => `ลบนัด ${row.code || row.scheduledDate} ถาวร?`,
      detail: (row) => {
        const rule = visitDeleteBlocker(row);
        return `${rule ? `🔴 กติกาปกติ: ${rule}\n` : ""}ลบแล้วผลรายเครื่อง ของที่ใช้ และความเคลื่อนไหวของนัดนี้หายถาวร · ใช้สิทธิ์ผู้ดูแลระบบ และจะถูกบันทึกไว้ว่าข้ามด่าน`;
      },
      confirmLabel: "ลบถาวร",
      onConfirm: removeVisit,
    },
  };
  const deleteCopy = pendingDelete
    ? (() => {
      const key = pendingDelete.type === "visit" && pendingDelete.force ? "visitForce" : pendingDelete.type;
      const copy = DELETE_COPY[key];
      return copy ? {
        ...copy,
        message: copy.message(pendingDelete.row),
        detail: typeof copy.detail === "function" ? copy.detail(pendingDelete.row) : copy.detail,
      } : null;
    })()
    : null;

  /* ── Control Panel ของไซต์ ────────────────────────────────────────────────
     ไซต์ไม่มีแกนอนุมัติแบบลูกค้า/สินค้า — มีแกนเดียวคือใช้งาน/ปิดใช้งาน จึงให้แกนนั้น
     เป็น status ของการ์ด control ไปเลย (ไม่มี workflowSteps ให้ส่ง)
     ⚠️ ปุ่มระดับไซต์ (แก้ไข/ลบ) ย้ายเข้า Control Panel ทั้งชุด — ห้ามวางแยกไว้ในแถวหัว
     อีก เหมือนที่หน้าลูกค้า/สินค้าห้ามไว้ (ม-49/ม-57) */
  const siteAside = (
    <>
      {/* สรุปเฉพาะของที่การ์ด "ข้อมูลไซต์" ไม่มี
          🐞 เดิมซ้ำผู้ติดต่อ · เขตวิ่งงาน · ช่วงเวลา กับการ์ดข้าง ๆ ครบสามแถว — แท็บเล็ต/มือถือ
             ยังดันการ์ด "จัดการไซต์" (ที่เดียวที่แก้/ลบไซต์ได้) ลงไปอีกก้อน */}
      <DocumentSummaryCard
        title="สรุปไซต์"
        rows={[
          { id: "lastRefill", label: "เข้าเติมล่าสุด", value: schedule.lastRefillDate },
          { id: "nextVisit", label: "นัดครั้งหน้า", value: schedule.nextVisitDate || upcoming.map((v) => v.scheduledDate).sort()[0] },
          ...(roundsSold != null ? [{ id: "roundsSold", label: "รอบที่ขายไว้", value: `${fmtNumber(roundsSold)} รอบ` }] : []),
        ]}
      />

      <DocumentControlCard
        eyebrow="SITE CONTROL"
        title="จัดการไซต์"
        status={site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}
        statusColor={site.isActive === false ? "var(--text-3)" : "var(--green)"}
        statusDescription={site.isActive === false
          ? "ไซต์นี้ถูกปิดใช้งาน — ไม่ขึ้นในรายการเลือกของระบบอื่น"
          : "ไซต์พร้อมใช้งาน — รับรอบบริการและนัดใหม่ได้"}
        primaryAction={canEdit ? { id: "edit", kind: "edit", label: "แก้ไขไซต์", onClick: () => setEditingSite(true) } : null}
        /* API มีด่านครบอยู่แล้ว (เครื่อง/โซน/ประวัตินัด บล็อกการลบ) — ปุ่มโชว์เสมอ
           ติดด่านค่อยบอกเหตุตอนกด ไม่ซ่อนปุ่มไว้ล่วงหน้า (เหตุผลเดียวกับทีม) */
        dangerActions={canEdit ? [{ id: "delete", kind: "delete", label: "ลบไซต์", onClick: () => setPendingDelete({ type: "site", row: site }) }] : []}
      />
    </>
  );

  return (
    <Workspace hideHeader back={{ href: "/database/sites", label: "ทะเบียนไซต์" }}>
      <DetailOverview
        eyebrow="SERVICE SITE"
        title={`${site.code ? `${site.code} · ` : ""}${site.name}`}
        description={<><span>{naText(site.customerName)}</span><span>{naText(site.province)}</span></>}
        badges={<DetailStateBadge label={site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"} color={site.isActive === false ? "var(--text-3)" : "var(--green)"} />}
        facts={[
          { key: "zones", icon: Layers, label: "โซน", value: `${zones.length} โซน` },
          { key: "assets", icon: AirVent, label: "อุปกรณ์", value: `${rollup.active} ใช้งาน${assets.length !== rollup.active ? ` / ${assets.length}` : ""}` },
          { key: "plans", icon: RefreshCw, label: "รอบบริการ", value: `${plans.length} รอบ` },
          { key: "upcoming", icon: CalendarClock, label: "นัดที่จะถึง", value: `${upcoming.length} นัด` },
        ]}
      />

      <DetailPageLayout asideLabel="สรุปไซต์และการดำเนินการ" aside={siteAside}>
      <DetailCard icon={MapPin} eyebrow="Site profile" title="ข้อมูลไซต์">
        <dl className={styles.info}>
          <div><dt>เขตวิ่งงาน</dt><dd>{naText(site.routeZone)}</dd></div>
          {/* จังหวัด (mig 0315) — ตัวตนถาวรของไซต์ ตรึงอยู่ในรหัส · คนละช่องกับที่อยู่
              ซึ่งเป็นข้อความหน้างาน (ไซต์เก่าก่อน 0315 ยังไม่มีค่า จึงขึ้นขีด) */}
          <div><dt>จังหวัด</dt><dd>{naText(site.province)}</dd></div>
          <div><dt>ที่อยู่</dt><dd>{naText(site.address)}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>{naText(site.contactName)}{site.contactPhone ? ` · ${fmtPhone(site.contactPhone)}` : ""}</dd></div>
          <div>
            <dt>ช่วงเวลาที่เข้าได้</dt>
            <dd>{accessText || <span className={styles.muted}>ไม่จำกัด</span>}</dd>
          </div>
          <div><dt>เงื่อนไขการเข้า</dt><dd>{naText(site.accessNote)}</dd></div>
          {site.mapUrl && (
            <div>
              <dt>แผนที่</dt>
              {/* ลิงก์ออกนอกระบบ — เปิดแท็บใหม่ + rel กัน tabnabbing */}
              <dd><a className="linklike" href={site.mapUrl} target="_blank" rel="noreferrer noopener">เปิดแผนที่</a></dd>
            </div>
          )}
          {site.note && <div className={styles.wide}><dt>หมายเหตุ</dt><dd>{site.note}</dd></div>}
        </dl>
      </DetailCard>

      {/* แผงรายการ (มติผู้ใช้ 2026-09-15: รายการที่มีช่องค้นหาของตัวเองในหน้ารายละเอียด = ListPanel)
          ป้ายจำนวน = จำนวนหลังค้นหา/กรอง (เท่ายอดของ Pager) */}
      <ListPanel
        icon={<Layers size={17} aria-hidden="true" />}
        title="โซนในไซต์"
        subtitle="พื้นที่ย่อยที่ติดตามการใช้/รอบบริการแยกกัน — โซนอยู่ถาวร ใบสั่งขายใหม่มาผูกโซนเดิมได้"
        count={`${fmtNumber(shownZones.length)} โซน`}
        actions={canEdit ? (
          /* ปุ่มเพิ่มระดับการ์ด = สีกลาง — primary สงวนให้การยืนยัน (Page contract §8) */
          <Button tone="neutral" onClick={() => setFormZone(null)} icon={<Plus size={15} aria-hidden="true" />}>
            เพิ่มโซน
          </Button>
        ) : null}
        toolbar={zones.length ? (
          <>
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={zoneQuery} onChange={(e) => setZoneQuery(e.target.value)}
                placeholder="ค้นหารหัสโซน ชื่อ อาคาร ชั้น หรือจุด" aria-label="ค้นหาโซนในไซต์" />
            </div>
            {zoneBuildingOptions.length > 0 && (
              <Segmented ariaLabel="กรองโซนตามอาคาร" value={zoneBuildingShown} onChange={setZoneBuilding} options={zoneBuildingOptions} />
            )}
          </>
        ) : null}
      >
        {zones.length === 0 ? (
          <EmptyState icon={Layers} dashed={canEdit} onClick={canEdit ? () => setFormZone(null) : undefined} plain>
            {canEdit ? "ยังไม่มีโซนในไซต์นี้ — เช่น Lobby · Reception · ห้องน้ำชั้น 2" : "ยังไม่มีโซนในไซต์นี้"}
          </EmptyState>
        ) : shownZones.length === 0 ? (
          <EmptyState icon={Layers} plain>ไม่พบโซนที่ตรงกับคำค้นหรืออาคารที่เลือก</EmptyState>
        ) : (
          <>
          {/* ⚠️ ในการ์ดใช้ TableScroll ตรง ๆ + minWidth (ทุกตารางในหน้านี้)
             🐞 เดิมเป็น TableShell = กรอบซ้อนสามชั้น กินที่ 36px บนมือถือ และไม่มี minWidth
                ⇒ ตารางบีบจนรหัสโซนตัดทีละท่อน ป้ายสถานะแตกสองบรรทัด ปุ่มลบหลุดขอบขวา
             📏 minWidth ต้อง ≤ กล่องที่แคบสุดตอนรางข้างยังอยู่ (612px ที่จอ 1051) ไม่ใช่แค่กล่องแท็บเล็ต
                🐞 เคยตั้ง 680 ⇒ จอ 1051–1119 ประวัติเลื่อนข้างเงียบ ๆ ปุ่มลบของแอดมินหลุดขอบ
             📱 จอ ≤ 680 ตารางโซนไม่ใช้ minWidth นี้ — พับเหลือ โซน · ปุ่ม (ดู .foldTable ใน page.module.css)
                🐞 560 ในกล่อง 326px ⇒ ป้ายสถานะกับปุ่มแก้/ลบอยู่พ้นขอบขวาทั้งชุด ไม่มีอะไรบอกว่าเลื่อนได้ */}
          <TableScroll family="list" cells="stacked" minWidth={560}>
            <table className={styles.foldTable}>
              <thead>
                <tr>
                  <th>โซน</th>
                  {/* จุดติดตั้ง (mig 0354) — ตำแหน่งวางเครื่องข้างในโซน · แก้ที่ปุ่มแก้ไขโซน */}
                  <th className={`num ${styles.numCol} ${styles.wideCol}`}>จุดติดตั้ง</th>
                  <th className={`num ${styles.numCol} ${styles.wideCol}`}>อุปกรณ์</th>
                  <th className={styles.wideCol}>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {zonePaging.pageRows.map((zone) => {
                  const zoneAssetCount = assetCountByZone.get(zone.id) || 0;
                  const spotCount = Array.isArray(zone.spots) ? zone.spots.length : 0;
                  // ชั้น/อาคาร (mig 0315) — ชั้นไม่อยู่ในรหัสแล้ว (mig 0384) บรรทัดล่างจึงเป็นที่เดียวที่บอกชั้น
                  const zoneSub = [zone.code ? zone.name : null, zone.building, floorLabel(zone.floor), zone.note]
                    .filter(Boolean).join(" · ");
                  const statusBadge = (
                    <span className={`ui-badge ${zone.isActive === false ? "" : "success"}`.trim()}>{zone.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                  );
                  return (
                    <tr key={zone.id} className={zone.isActive === false ? styles.inactive : undefined}>
                      <td>
                        {/* ⭐ รหัสบน · ชื่อล่าง — กดเข้าหน้าโซน (รอบขาย/ยอดใช้จริง/ประวัติของโซนนั้น
                            อยู่ในฐานข้อมูลมาตั้งแต่ mig 0297 แต่ไม่มีทางเข้ามาก่อนหน้านี้) */}
                        {/* 📱 จอแคบ: ป้ายสถานะ + จำนวนจุด/เครื่องย้ายมาอยู่ในเซลล์นี้ (คอลัมน์ของมันซ่อน)
                            .cellHead = บล็อกธรรมดา (ลิงก์ยัง inline เหมือนเดิม) · ระยะห่างอยู่ท้ายลิงก์
                            ⇒ ป้ายที่ขึ้นบรรทัดใหม่ (จอ 320) ชิดซ้ายตรงกับรหัส ไม่เยื้อง */}
                        <div className={styles.cellHead}>
                          <Link href={`/database/sites/${site.id}/zones/${zone.id}`} className={`table-row-link${zone.code ? " mono" : ""}`}>
                            {zone.code || zone.name}
                          </Link>
                          <span className={styles.narrowStatus}>{statusBadge}</span>
                        </div>
                        <div className={styles.muted}>
                          {zoneSub}
                          <span className={styles.narrowOnly}>
                            {zoneSub ? " · " : ""}
                            {/* ตัวเลขกับหน่วยห้ามแยกบรรทัด ("0 / เครื่อง" ที่จอ 320) */}
                            <span className={styles.nowrap}>{fmtNumber(spotCount)} จุด</span>
                            {" · "}
                            <span className={styles.nowrap}>{fmtNumber(zoneAssetCount)} เครื่อง</span>
                          </span>
                        </div>
                      </td>
                      <td className={`num ${styles.numCol} ${styles.wideCol}`}>{spotCount}</td>
                      <td className={`num ${styles.numCol} ${styles.wideCol}`}>{zoneAssetCount}</td>
                      <td className={styles.wideCol}>{statusBadge}</td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Button iconOnly tone="neutral" variant="quiet" aria-label={`แก้ไขโซน ${zone.name}`} onClick={() => setFormZone(zone)} icon={<Pencil size={14} aria-hidden="true" />} />
                            <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบโซน ${zone.name}`} onClick={() => setPendingDelete({ type: "zone", row: zone })} icon={<Trash2 size={14} aria-hidden="true" />} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <Pager page={zonePaging.page} pageCount={zonePaging.pageCount} total={zonePaging.total}
            onPage={zonePaging.setPage} pageSize={zonePaging.pageSize} onPageSize={zonePaging.setPageSize} itemLabel="โซน" />
          </>
        )}
      </ListPanel>

      <ListPanel
        /* ไอคอนเครื่อง = AirVent ตามเมนู "ทะเบียนเครื่อง" (Boxes สงวนให้วัสดุ) */
        icon={<AirVent size={17} aria-hidden="true" />}
        title="อุปกรณ์ในไซต์"
        /* ⚠️ ต้องครบทุกกอง ไม่งั้นตัวเลขไม่รวมกันเป็น total แล้วคนอ่านเห็นเป็นบั๊ก
           (mig 0332 เพิ่ม in_stock เข้ามา) · กองที่เป็นศูนย์ตัดทิ้งเพื่อไม่ให้แถวยาวเปล่า ๆ */
        subtitle={[
          `ใช้งาน ${rollup.active}`,
          rollup.inStock ? `อยู่ในคลัง ${rollup.inStock}` : null,
          `ส่งซ่อม ${rollup.repair}`,
          rollup.removed ? `ปลดระวาง ${rollup.removed}` : null,
          rollup.broken ? `ชำรุด ${rollup.broken}` : null,
        ].filter(Boolean).join(" · ")}
        count={`${fmtNumber(shownAssets.length)} เครื่อง`}
        actions={canEdit ? (
          <Button tone="neutral" onClick={() => setFormAsset(null)} icon={<Plus size={15} aria-hidden="true" />}>
            เพิ่มอุปกรณ์
          </Button>
        ) : null}
        toolbar={assets.length ? (
          <>
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)}
                placeholder="ค้นหารหัสเครื่อง รุ่น สี โซน หรือจุด" aria-label="ค้นหาอุปกรณ์ในไซต์" />
            </div>
            {assetBuildingOptions.length > 0 && (
              <Segmented ariaLabel="กรองอุปกรณ์ตามอาคาร" value={assetBuildingShown} onChange={setAssetBuilding} options={assetBuildingOptions} />
            )}
            {assetFilterGroups.length > 0 && (
              <FilterPopover
                groups={assetFilterGroups}
                count={assetModels.length + assetStatuses.length}
                onClear={() => { setAssetModels([]); setAssetStatuses([]); }}
              />
            )}
          </>
        ) : null}
      >
        {/* แถบ backfill — อุปกรณ์เก่าเกิดก่อนมีโซน (mig 0298) ต้องมีคนไล่จัดเข้าโซน
            โชว์เฉพาะเมื่อไซต์เริ่มมีโซนแล้ว (ไซต์ที่ยังไม่ใช้โซนไม่ต้องโดนทวง) */}
        {zones.length > 0 && unzonedActive > 0 && (
          <p className={styles.backfillNote} role="status">
            อุปกรณ์ {unzonedActive} รายการยังไม่ระบุโซน — กดแก้ไขรายตัวเพื่อเลือกโซน
            แล้วการใช้ต่อรอบจะเริ่มนับเป็นของโซนนั้น
          </p>
        )}
        {/* สรุปตามรุ่น/สีทั้งไซต์ (ไม่นับปลดระวาง · ไม่ขยับตามตัวกรอง) — ตอบ "ไซต์นี้มีอะไรกี่ตัว"
            โดยไม่ต้องไล่ทุกหน้า · ตัวเลขชิ้นเดียวกับตัวเลือก "รุ่น" ในตัวกรอง */}
        {modelSummary.length > 0 && (
          <p className={styles.modelSummary}>
            {modelSummary.map((item, index) => (
              <span key={item.key} className={styles.nowrap}>
                {index > 0 ? " · " : ""}{item.label} <strong>{fmtNumber(item.count)}</strong>
              </span>
            ))}
          </p>
        )}
        {assets.length === 0 ? (
          <EmptyState icon={AirVent} dashed={canEdit} onClick={canEdit ? () => setFormAsset(null) : undefined} plain>
            {canEdit ? "ยังไม่มีอุปกรณ์ในไซต์นี้ — กดเพื่อเพิ่มรายการแรก" : "ยังไม่มีอุปกรณ์ในไซต์นี้"}
          </EmptyState>
        ) : shownAssets.length === 0 ? (
          <EmptyState icon={AirVent} plain>ไม่พบอุปกรณ์ที่ตรงกับคำค้นหรือตัวกรอง</EmptyState>
        ) : (
          <>
          {/* 640 ≈ เนื้อ 8 คอลัมน์ที่บีบสุดแล้วยังไม่ตัดกลางคำ (วัดได้ 638) · จอ ≥ 1200 หน้าตาเท่า 960
             🐞 960 เดิมบังคับเลื่อนข้างทุกจอ 1051–1399 (โน้ตบุ๊ก 1280/1366) และแท็บเล็ต ปุ่มแก้/ลบหลุดขอบ */}
          <TableScroll family="list" cells="stacked" minWidth={640}>
            <table>
              <thead>
                <tr>
                  <th>อุปกรณ์</th>
                  <th>โซน</th>
                  <th>รุ่น / Serial</th>
                  <th>กลิ่นที่ใช้</th>
                  <th className={`num ${styles.numCol}`}>ขวด / อัตราใช้</th>
                  <th>คาดว่าหมด</th>
                  <th>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {assetPaging.pageRows.map((asset) => {
                  const refill = refillStatus(asset, {
                    lastSiteRefillDate: schedule.lastRefillDate,
                    nextVisitDate: schedule.nextVisitDate,
                  });
                  /* 🔄 เคยต่อท้ายด้วย "· N จุด" สำหรับชนิดแถวรวม — ถอดออกแล้ว
                     (มติผู้ใช้ 2026-09-03: ทุกชนิดนับรายตัว ไม่มีแถวรวมทั้งชุด) */
                  const kindText = ASSET_KIND_LABELS[asset.kind] || asset.kind || "";
                  // ⭐ รหัสบน · ชื่อล่าง — ชื่อ (`label`) ของเครื่องที่เพิ่มจากทะเบียนคือชื่อรุ่น ⇒ ไซต์ที่มีรุ่นเดียว
                  //    242 ตัวเคยขึ้น "M240" ซ้ำทุกแถว แยกไม่ออกว่าแถวไหนเครื่องไหน · เครื่องเก่าที่ไม่มีรหัสใช้ชื่อแทน
                  const assetName = asset.code || asset.label;
                  const subLine = [asset.code ? asset.label : null, kindText].filter(Boolean).join(" · ");
                  return (
                    <tr key={asset.id} className={asset.status === "removed" ? styles.inactive : undefined}>
                      <td>
                        {/* กดเข้าหน้าอุปกรณ์ — ค่าตั้งเครื่องกับประวัติรายตัว
                            (ติดตั้ง · ถูกเปลี่ยน · เอาไปแทนตัวอื่น) อยู่ที่นั่น */}
                        {/* รหัสห้ามตัดกลาง ("MC-SMV1-" / "260900083" ที่จอ 375) — ตารางนี้เลื่อนข้างในกล่องของมันอยู่แล้ว */}
                        <Link href={`/database/assets/${asset.id}`} className={`table-row-link${asset.code ? ` mono ${styles.nowrap}` : ""}`}>
                          {assetName}
                        </Link>
                        {subLine ? <div className={styles.muted}>{subLine}</div> : null}
                      </td>
                      <td>
                        {asset.zoneId ? naText(zonesById.get(asset.zoneId)?.name) : <span className={styles.muted}>ยังไม่ระบุ</span>}
                        {/* จุดติดตั้งของเครื่อง (ข้อความ) — ห้องน้ำชาย/หญิงของชั้นเดียวกันแยกกันได้ด้วยบรรทัดนี้ */}
                        {asset.spot ? <div className={styles.muted}>{asset.spot}</div> : null}
                      </td>
                      <td>
                        {naText(asset.model)}
                        {asset.colour ? ` (${asset.colour})` : ""}
                        {asset.serial ? <span className={styles.serial}> · {asset.serial}</span> : null}
                      </td>
                      <td>{naText(asset.productName)}</td>
                      <td className={`num ${styles.numCol}`}>
                        {asset.bottleMl ? `${fmtNumber(asset.bottleMl)} ml` : NA}
                        {asset.mlPerDay ? ` / ${fmtNumber(asset.mlPerDay)} ต่อวัน` : ""}
                      </td>
                      {/* ⚠️ ข้อมูลไม่พอ = ไม่เดา · ป้ายที่มั่วจะทำให้ป้ายจริงถูกเมินไปด้วย */}
                      <td className={refill.state === "overdue" ? styles.overdue : refill.state === "soon" ? styles.soon : undefined}>
                        {refill.state === "unknown"
                          ? <span className={styles.muted}>{refill.label}</span>
                          : refill.label}
                      </td>
                      {/* 🐞 คอลัมน์แรกเป็นรหัส MC (ยาวกว่าชื่อรุ่น) ⇒ ตารางบีบจนป้าย "ใช้งานอยู่" แตกสองบรรทัดที่จอ 1366 */}
                      <td className={styles.nowrap}><span className="ui-badge">{ASSET_STATUS_LABELS[asset.status] || asset.status}</span></td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Button iconOnly tone="neutral" variant="quiet" aria-label={`แก้ไขเครื่อง ${assetName}`} onClick={() => setFormAsset(asset)} icon={<Pencil size={14} aria-hidden="true" />} />
                            <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบเครื่อง ${assetName}`} onClick={() => setPendingDelete({ type: "asset", row: asset })} icon={<Trash2 size={14} aria-hidden="true" />} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <Pager page={assetPaging.page} pageCount={assetPaging.pageCount} total={assetPaging.total}
            onPage={assetPaging.setPage} pageSize={assetPaging.pageSize} onPageSize={assetPaging.setPageSize} itemLabel="เครื่อง" />
          </>
        )}
      </ListPanel>

      <DetailCard
        icon={RefreshCw}
        eyebrow="Service rounds"
        title="รอบบริการ"
        meta="ระบบสร้างนัดล่วงหน้า 90 วันตามรอบ แล้วต่อรอบให้เมื่อปิดงานจริง"
        actions={canEdit ? (
          <Button tone="neutral" onClick={() => setFormPlan(null)} icon={<Plus size={15} aria-hidden="true" />}>
            สร้างรอบ
          </Button>
        ) : null}
      >
        {planError ? (
          <StatusNotice tone="warning" title="โหลดรอบบริการไม่สำเร็จ"
            action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
            {planError}
          </StatusNotice>
        ) : plans.length === 0 ? (
          <EmptyState icon={RefreshCw} dashed={canEdit} onClick={canEdit ? () => setFormPlan(null) : undefined} plain>
            {canEdit
              ? "ยังไม่มีรอบบริการ — สร้างรอบแล้วระบบจะวางนัดให้เอง"
              : "ยังไม่มีรอบบริการ"}
          </EmptyState>
        ) : (
          <TableScroll family="list" minWidth={600}>
            <table>
              <thead>
                <tr>
                  <th>ชนิดงาน</th>
                  <th>รอบ</th>
                  {/* ⭐ รอบเป็นข้อผูกพันของ *ใบสั่งขาย* และไซต์เดียวถือรอบของหลายใบ
                      พร้อมกันได้ (ขายเพิ่ม · ออก Rev.) ⇒ ไม่มีคอลัมน์นี้ = แยกไม่ออกว่า
                      แถวไหนของใบไหน แล้วแก้/ลบผิดแถวได้ง่ายมาก */}
                  <th>ใบสั่งขาย</th>
                  <th>ช่วงเวลา</th>
                  <th>เจ้าหน้าที่ประจำ</th>
                  <th>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className={plan.isActive === false ? styles.inactive : undefined}>
                    <td>{VISIT_KIND_LABELS[plan.kind] || plan.kind}</td>
                    <td>ทุก {plan.everyDays} วัน</td>
                    <td className="mono">
                      {plan.salesOrderNumber || (
                        <span className={styles.muted}>ไม่ผูกใบ</span>
                      )}
                    </td>
                    <td>{plan.startDate}{plan.endDate ? ` – ${plan.endDate}` : " – ไม่มีกำหนดสิ้นสุด"}</td>
                    <td>{plan.assigneeName || <span className={styles.muted}>ยังไม่กำหนด</span>}</td>
                    <td><span className={`ui-badge ${plan.isActive === false ? "" : "success"}`.trim()}>{plan.isActive === false ? "ปิดรอบ" : "ใช้งาน"}</span></td>
                    {canEdit && (
                      <td>
                        <div className={styles.rowActions}>
                          <Button iconOnly tone="neutral" variant="quiet" aria-label="แก้รอบบริการ" onClick={() => setFormPlan(plan)} icon={<Pencil size={14} aria-hidden="true" />} />
                          <Button iconOnly tone="danger" variant="quiet" aria-label="ลบรอบบริการ" onClick={() => setPendingDelete({ type: "plan", row: plan })} icon={<Trash2 size={14} aria-hidden="true" />} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </DetailCard>

      <DetailCard icon={CalendarClock} eyebrow="Upcoming visits" title="นัดที่จะถึง" meta={`${upcoming.length} นัด`}>
        {visitError ? (
          <StatusNotice tone="warning" title="โหลดนัดไม่สำเร็จ"
            action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
            {visitError}
          </StatusNotice>
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} plain>ยังไม่มีนัดที่จะถึงของไซต์นี้</EmptyState>
        ) : (
          /* 📱 จอ ≤ 680 (กล่อง < 600) พับเหลือ วันที่ · ปุ่มลบ — เวลา/งาน/ใบสั่งขาย/เจ้าหน้าที่/รหัส
                ลงบรรทัดรองในเซลล์แรก (ดู .foldTable) · ข้อมูลครบเท่าเดิม แค่ย้ายที่
             🐞 minWidth 600 ในกล่อง 326px (จอ 390) ⇒ ปุ่มลบนัดพ้นขอบขวาทุกจอตั้งแต่ 641 ลงไป
                และไม่มีอะไรบอกว่าตารางเลื่อนได้ */
          <TableScroll family="list" cells="stacked" minWidth={600}>
            <table className={styles.foldTable}>
              <thead>
                <tr><th>วันที่</th><th className={styles.wideCol}>เวลา</th><th className={styles.wideCol}>งาน</th>
                  {/* 🔴 **สองนัดวันเดียวกันที่ไซต์เดียวกันเป็นเรื่องปกติ** (มติผู้ใช้
                      2026-09-02: "2 SO ก็ต้อง 2 รอบ") — รอบเป็นข้อผูกพันของใบสั่งขาย
                      ⇒ ไซต์ที่ขายไว้สองใบเดินสองรอบ · ไม่มีคอลัมน์นี้ = สองแถวพิมพ์
                      เหมือนกันทุกช่อง แล้วคนอ่านนึกว่าระบบสร้างซ้ำ แล้วไปลบทิ้งใบหนึ่ง
                      ⇒ ใบนั้นนับรอบขาดตลอดสัญญา */}
                  <th className={styles.wideCol}>ใบสั่งขาย</th><th className={styles.wideCol}>เจ้าหน้าที่</th><th className={styles.wideCol}>รหัส</th>
                  {canEdit && <th aria-label="การทำงาน" />}</tr>
              </thead>
              <tbody>
                {upcoming.map((visit) => {
                  const kindLabel = VISIT_KIND_LABELS[visit.kind] || visit.kind;
                  const order = orderOfVisit(visit);
                  /* ด่านลบตัวเดียวกับ API — แอดมินข้ามได้ (เส้น force) · คนอื่นเห็นถังขยะตามกติกาเดียวกับหน้าจัดคิว */
                  const deleteRule = visitDeleteBlocker(visit);
                  const forceDelete = isAdmin && !!deleteRule;
                  const showDelete = isAdmin || !!visitDeleteButton(visit);
                  return (
                  <tr key={visit.id}>
                    {/* วันที่ · เวลา · รหัส ห้ามตัดกลาง — ตารางเลื่อนข้างแทนการบีบ (ดู .nowrap) */}
                    <td>
                      <span className={styles.nowrap}>{visit.scheduledDate}</span>
                      {/* 📱 จอแคบ: คอลัมน์ที่ซ่อนมาอยู่บรรทัดนี้ ลำดับเดียวกับหัวตาราง */}
                      <div className={`${styles.muted} ${styles.narrowLine}`}>
                        {/* ป้ายสั้นห้ามตัดกลางคำ ("ยังไม่มอบ|หมาย" ที่จอ 320) — ชื่อคนยังตัดได้ */}
                        <span className={styles.nowrap}>{visitTimeText(visit)}</span>
                        {" · "}<span className={styles.nowrap}>{kindLabel}</span>
                        {" · "}{order ? <span className={`mono ${styles.nowrap}`}>{order}</span> : <span className={styles.nowrap}>นอกรอบ</span>}
                        {" · "}{visit.assigneeName || <span className={styles.nowrap}>ยังไม่มอบหมาย</span>}
                        {visit.code ? <>{" · "}<span className={`mono ${styles.nowrap}`}>{visit.code}</span></> : null}
                      </div>
                    </td>
                    <td className={`${styles.nowrap} ${styles.wideCol}`}>{visitTimeText(visit)}</td>
                    <td className={styles.wideCol}>{kindLabel}</td>
                    <td className={`mono ${styles.wideCol}`}>
                      {order || <span className={styles.muted}>นอกรอบ</span>}
                    </td>
                    <td className={styles.wideCol}>{visit.assigneeName || <span className={styles.muted}>ยังไม่มอบหมาย</span>}</td>
                    <td className={`mono ${styles.nowrap} ${styles.wideCol}`}>{naText(visit.code)}</td>
                    {/* ปุ่มลบนัด (ผู้ใช้แจ้ง 2026-09-02) — ตั้งแต่ 24/09 ถามด่าน `visitDeleteBlocker` ตัวเดียวกับ API
                        และโชว์ตาม `visitDeleteButton` ตัวเดียวกับหน้าจัดคิว: งานนอกรอบเท่านั้น (ติดด่าน = บอกเหตุตอนกด)
                        · แอดมินเห็นทุกแถว (เส้น force) · เซลล์ยังอยู่เมื่อไม่มีปุ่ม (คอลัมน์ไม่เหลื่อม) */}
                    {canEdit && (
                      <td>
                        {showDelete && (
                          <div className={styles.rowActions}>
                            <GatedAction iconOnly tone="danger" variant="quiet"
                              aria-label={`ลบนัด ${visit.code || visit.scheduledDate}`}
                              blocker={forceDelete ? "" : deleteRule}
                              onClick={() => setPendingDelete({ type: "visit", row: visit, force: forceDelete })}
                              icon={<Trash2 size={14} aria-hidden="true" />} />
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </DetailCard>

      <DetailCard icon={History} eyebrow="Visit history" title="ประวัติการเข้า" meta="20 ครั้งล่าสุด">
        {visitError ? (
          <StatusNotice tone="warning" title="โหลดประวัติการเข้าไม่สำเร็จ"
            action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
            {visitError}
          </StatusNotice>
        ) : history.length === 0 ? (
          <EmptyState icon={History} plain>ยังไม่มีประวัติการเข้าไซต์นี้</EmptyState>
        ) : (
          /* 📱 จอ ≤ 680 (กล่อง < 600) พับเหลือ นัด · ใบส่งงาน · ปุ่มลบ — ป้ายสถานะขึ้นข้างวันที่
                เข้าจริง/งาน/เจ้าหน้าที่/สรุปงาน ลงบรรทัดรองในเซลล์แรก (ดู .foldTable)
             🐞 minWidth 600 ในกล่อง 326px (จอ 390) ⇒ สถานะ · ใบส่งงาน · ปุ่มลบ อยู่พ้นขอบขวา
                ไม่มีอะไรบอกว่าตารางเลื่อนได้ */
          <TableScroll family="list" cells="stacked" minWidth={600}>
            <table className={styles.foldTable}>
              <thead>
                <tr><th>วันที่นัด</th><th className={styles.wideCol}>เข้าจริง</th><th className={styles.wideCol}>งาน</th><th className={styles.wideCol}>เจ้าหน้าที่</th><th className={styles.wideCol}>สถานะ</th><th className={styles.wideCol}>สรุปงาน</th>
                  {canOpenVisit && <th aria-label="ใบส่งงาน" />}
                  {isAdmin && <th aria-label="การทำงาน" />}</tr>
              </thead>
              <tbody>
                {history.map((visit) => {
                  const kindLabel = VISIT_KIND_LABELS[visit.kind] || visit.kind;
                  const statusBadge = <span className="ui-badge">{VISIT_STATUS_LABELS[visit.status] || visit.status}</span>;
                  /* สรุปงานตัดที่ 3 บรรทัด ข้อความเต็มอยู่ใน title และในใบส่งงาน (ลิงก์ท้ายแถว)
                     🐞 พอวันที่/ป้าย/ลิงก์ห้ามตัดคำ คอลัมน์นี้เหลือช่องเดียวที่ยอมบีบ ⇒ สรุป 90 ตัวอักษร
                        กลายเป็นหอคอย 10 บรรทัด แถวสูง 204px ที่จอ 1052 */
                  const summary = visit.summary
                    ? <span className={styles.summaryClamp} title={visit.summary}>{visit.summary}</span>
                    : null;
                  return (
                  <tr key={visit.id} className={visit.status === "cancelled" ? styles.inactive : undefined}>
                    {/* วันที่ · ป้ายสถานะ · ลิงก์ใบส่งงาน ห้ามตัดกลาง — ตารางเลื่อนข้างแทนการบีบ (ดู .nowrap) */}
                    <td>
                      <div className={styles.cellHead}>
                        <span className={styles.nowrap}>{visit.scheduledDate}</span>
                        <span className={styles.narrowStatus}>{statusBadge}</span>
                      </div>
                      {/* 📱 จอแคบ: คอลัมน์ที่ซ่อนมาอยู่สองบรรทัดนี้ ลำดับเดียวกับหัวตาราง */}
                      <div className={`${styles.muted} ${styles.narrowLine}`}>
                        <span className={styles.nowrap}>{visit.actualDate ? `เข้าจริง ${visit.actualDate}` : "ยังไม่ปิดงาน"}</span>
                        {" · "}<span className={styles.nowrap}>{kindLabel}</span>
                        {visit.assigneeName ? <>{" · "}{visit.assigneeName}</> : null}
                      </div>
                      {summary && <div className={styles.narrowLine}>{summary}</div>}
                    </td>
                    {/* ช่องว่างตรงนี้มีความหมาย: นัดที่เลยวันแล้วแต่ไม่มีวันเข้าจริง = ยังไม่มีใครปิดงาน */}
                    <td className={`${styles.nowrap} ${styles.wideCol}`}>{visit.actualDate || <span className={styles.muted}>ยังไม่ปิดงาน</span>}</td>
                    <td className={styles.wideCol}>{kindLabel}</td>
                    <td className={styles.wideCol}>{naText(visit.assigneeName)}</td>
                    <td className={`${styles.nowrap} ${styles.wideCol}`}>{statusBadge}</td>
                    <td className={styles.wideCol}>{summary || naText(visit.summary)}</td>
                    {/* ประวัติต้องกดเข้าใบได้ — ไม่งั้นคอลัมน์ "สรุปงาน" ที่ตัดสั้น
                        คือทั้งหมดที่คนอ่านย้อนหลังได้ */}
                    {canOpenVisit && (
                      <td className={styles.nowrap}><a className="linklike" href={`/service/visits/${visit.id}`}>ใบส่งงาน</a></td>
                    )}
                    {/* ⭐ **เฉพาะแอดมิน** — นัดที่ปิดงานแล้วคือประวัติการเข้าไซต์
                        กติกาปกติห้ามลบ · แอดมินข้ามได้ด้วย ?force=1 ตามมติ #1501
                        ("ขอสิทธิ์ทุกอย่างให้แอดมิน รวมลบด้วย") ซึ่งเส้นนัดตกหล่นมาตลอด
                        ⚠️ ไม่มีสิทธิ์ = ไม่โชว์ (ไม่ใช่โชว์แล้วกดไม่ได้) เพราะมันไม่ใช่
                           ด่านที่คนธรรมดาแก้ได้ */}
                    {isAdmin && (
                      <td>
                        <div className={styles.rowActions}>
                          <Button iconOnly tone="danger" variant="quiet"
                            aria-label={`ลบนัด ${visit.code || visit.scheduledDate} ถาวร`}
                            title="ลบถาวร — สิทธิ์ผู้ดูแลระบบ"
                            onClick={() => setPendingDelete({ type: "visit", row: visit, force: true })}
                            icon={<Trash2 size={14} aria-hidden="true" />} />
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </DetailCard>
      </DetailPageLayout>

      <ServiceSiteModal
        open={editingSite}
        site={site}
        customers={customers}
        onClose={() => setEditingSite(false)}
        onSave={saveSite}
      />

      <ServicePlanModal
        open={formPlan !== undefined}
        siteId={id}
        plan={formPlan}
        technicians={technicians}
        roundsSold={roundsSold}
        salesOrders={siteOrders}
        onClose={() => setFormPlan(undefined)}
        onSave={savePlan}
      />

      <ServiceAssetModal
        open={formAsset !== undefined}
        asset={formAsset}
        zones={zones}
        onClose={() => setFormAsset(undefined)}
        onSave={saveAsset}
      />

      <ServiceZoneModal
        open={formZone !== undefined}
        zone={formZone}
        knownFloors={zones.map((z) => z.floor)}
        onClose={() => setFormZone(undefined)}
        onSave={saveZone}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title={deleteCopy?.title}
        message={deleteCopy?.message || ""}
        detail={deleteCopy?.detail}
        confirmLabel={deleteCopy?.confirmLabel}
        busy={busy}
        onConfirm={deleteCopy?.onConfirm}
        onClose={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

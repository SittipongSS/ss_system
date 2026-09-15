"use client";
// ── งานเข้าใหม่ (เฟส 4) — ทางที่งานขายเดินมาถึงฝ่าย TS ───────────────────
//
// ⭐ **ที่มาเป็นตัวเลข**: ชีตของทีมมี 102 จุดที่ลูกค้าจ่ายเงินแล้วแต่ไม่มีคิวบริการ
//   งานพวกนั้นไม่ได้หายไป — มันไม่เคยเดินมาถึงฝ่าย TS เลย เพราะไม่มีหน้าไหนพา
//   ใบสั่งขายมาให้ · หน้านี้คือทางนั้น
//
// ⚠️ **หน้านี้ไม่ใช่ที่สร้างงาน** — ทุกแถวมีต้นเรื่องเป็นใบสั่งขายที่อนุมัติแล้ว
//   ไม่มีปุ่ม "สร้างใหม่" ที่ไหนในหน้านี้โดยตั้งใจ (มติ 2026-08-28 · กติกาเดียวกับ
//   ที่ถอดปุ่ม + ออกจากทุกช่องว่างของหน้าจัดคิวเจ้าหน้าที่)
//
// ⚠️ ใบที่ตอบไม่ได้ว่าสายอะไรขึ้นแถบของมันเอง ระบบไม่เดาให้ — เดาเมื่อไร ใบสายสินค้า
//   จะไหลเข้าคิวบริการ หรือใบบริการจะหายเงียบ ทั้งสองทางแย่พอกัน
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, Building2, CalendarPlus, LayoutGrid, MapPin } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { DEFAULT_PAGE_SIZE, usePagination } from "@/lib/usePagination";
import Button from "@/components/ui/Button";
import Pager from "@/components/ui/Pager";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import Tabs from "@/components/ui/Tabs";
import Toast from "@/components/ui/Toast";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import IntakeWizard from "@/components/service/IntakeWizard";
import { VISIT_KIND_LABELS } from "@/lib/service/rounds";
import { INTAKE_TABS, INTAKE_TAB_HINTS, INTAKE_TAB_LABELS } from "@/lib/service/intake";
import { isHistoricalOrder } from "@/lib/sales/historicalOrders";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const LOAD_ERROR_TITLE = "โหลดคิวงานเข้าใหม่ไม่สำเร็จ";

/* 🐞 จอการ์ดใช้ขนาดหน้าเท่าตาราง (25) — การ์ดหนึ่งใบสูงกว่าแถวสามเท่า แถบแบ่งหน้าจึงไปอยู่
   ลึก 5,000px บนมือถือ ⇒ มุมมองการ์ดเริ่มที่ 10 ใบ (ตัวเลือกเดิมของ Pager) */
const CARD_PAGE_SIZE = 10;

// ข้อความ/ป้ายของแถวคิว "รอตั้งไซต์/โซน" — ใช้ทั้งตารางและการ์ด ให้สองมุมมองพูดตรงกัน
const fgText = (row) => (row.fgKinds
  ? `${fmtNumber(row.fgKinds)} ชนิด · ${fmtNumber(row.remainingQty)} หน่วย`
  : naText(null));
/* 🐞 เดิมตัดสตริง ISO ตรง ๆ — ขึ้น "2026-08-14" ข้างป้าย "จ่ายถึง 14/08/2026" ในแถวเดียวกัน
   และอนุมัติหลังเที่ยงคืนเวลาไทยจะขึ้นวันก่อนหน้า · fmtDate คิดวันไทยให้ */
const approvedText = (row) => {
  const value = row.approvedAt || row.orderDate;
  return value ? fmtDate(value) : naText(null);
};

/* แถบแท็บล้นกล่อง (จอ 320: เนื้อ 351px ในกล่อง 292px) — ลูกศรขวาย้ายโฟกัสไปแท็บที่ถูกตัด
   แต่แถบไม่เลื่อนตาม ⇒ แท็บที่โฟกัสอยู่ครึ่งตัวใต้ขอบจาง วงโฟกัสขาดที่ขอบขวา
   ⇒ โฟกัสลงแท็บไหน เลื่อนแถบให้แท็บนั้นเข้ากล่องเต็มตัว (แท็บสุดท้าย = เลื่อนสุด ขอบจางหายเอง)
   ⚠️ เลื่อนเฉพาะแกนนอนของแถบ — `scrollIntoView` ลากทั้งหน้าขึ้นลงตามไปด้วย
   ⚠️ พฤติกรรมนี้ควรอยู่ใน components/ui/Tabs.js ให้ทุกแถบแท็บได้เท่ากัน — ย้ายเข้าไปเมื่อไร ลบตัวนี้ทิ้ง */
function revealFocusedTab(event) {
  const tab = event.target;
  if (tab.getAttribute?.("role") !== "tab") return;
  revealTab(tab);
  /* 🪤 ลูกศรทั้งย้ายโฟกัสและ "เลือก" แท็บ (Tabs โหมด automatic) — วาดใหม่แล้วแถบกว้างขึ้นอีกเศษพิกเซล
     วัดจริงที่ 320: ตอนโฟกัสเลื่อนได้สุดแค่ 58 หลังวาดสุดเป็น 59 ⇒ ค้างที่ 58 ขอบจาง 3.6px ทับท้ายแท็บ
     ⇒ วัดซ้ำหลัง React commit · setTimeout ไม่ใช่ rAF เหตุผลเดียวกับ lib/ui/scrollToTopOf.js */
  setTimeout(() => revealTab(tab), 0);
}

function revealTab(tab) {
  const list = tab.parentElement;
  if (!list || list.scrollWidth <= list.clientWidth) return;
  // แท็บหัว/ท้าย = เลื่อนสุดทางไปเลย ไม่คิดจากระยะที่มีเศษ sub-pixel · ค่าเกินสุดแถบ เบราว์เซอร์ตัดให้เอง
  if (!tab.nextElementSibling) { list.scrollLeft = list.scrollWidth; return; }
  if (!tab.previousElementSibling) { list.scrollLeft = 0; return; }
  const tabBox = tab.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  if (tabBox.right > listBox.right) list.scrollLeft += Math.ceil(tabBox.right - listBox.right);
  else if (tabBox.left < listBox.left) list.scrollLeft -= Math.ceil(listBox.left - tabBox.left);
}

function ContractBadge({ readiness }) {
  return (
    <span className={`ui-badge ${readiness?.hasContract ? "success" : "warning"}`}>
      {readiness?.hasContract ? readiness.contractNo : "ยังไม่ผูกสัญญา"}
    </span>
  );
}

function PaidBadge({ readiness }) {
  /* ⭐ ใบย้อนหลังที่ยกเว้นด่านเงินรายใบ (mig 0360) — ตัวตัดสินเดียวกับ visitGate ข้อ②
     (ป้าย "ยังไม่มีงวดที่รับรอง" จะส่ง TS ไปทวงเงินที่ไม่ต้องเก็บ) */
  if (readiness?.paymentGateExempt) return <StatusBadge tone="info" label="ยกเว้นด่านเงิน" />;
  return (
    <span className={`ui-badge ${readiness?.coveredToday ? "success" : "warning"}`}>
      {readiness?.paidThrough ? `จ่ายถึง ${fmtDate(readiness.paidThrough)}` : "ยังไม่มีงวดที่รับรอง"}
    </span>
  );
}

export default function ServiceIntakePage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [tab, setTab] = useState("bind");
  const [data, setData] = useState(null);
  const [sites, setSites] = useState([]);
  const [zonesBySite, setZonesBySite] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [wizardOrder, setWizardOrder] = useState(null);
  const [toast, setToast] = useState(null);

  const startRun = useLatestRun();
  // ของที่โหลดสำเร็จล่าสุด — ให้รอบเบื้องหลังรู้ว่ามีของเดิมยืนอยู่บนจอไหม (อ่านใน callback เท่านั้น)
  const dataRef = useRef(null);
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    /* 🐞 เคยล้าง loadError ตรงนี้ทุกรอบ รวมรอบเบื้องหลังตอนกลับมามองแท็บ ⇒ กล่องแจ้งโหลดพัง
       หายระหว่างรอ แล้วรอบนั้นพังซ้ำก็ไม่ตั้งคืน ⇒ จอเหลือ "ไม่มีใบสั่งขายรอผูกโซน" = คิวว่างปลอม
       ⇒ error ล้างได้ทางเดียวคือโหลดสำเร็จ */
    try {
      const res = await apiFetch("/api/service/intake");
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || LOAD_ERROR_TITLE);
      dataRef.current = body;
      setData(body);
      setLoadError("");
    } catch (e) {
      /* ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "ไม่มีงานค้าง" หน้าตาเหมือนกัน
         จนแยกไม่ออก แล้วฝ่าย TS จะเชื่อว่าไม่มีอะไรต้องทำ ซึ่งคือรูเดิมที่หน้านี้มาปิด
         รอบเบื้องหลังเงียบได้เฉพาะตอนมีของเดิมยืนอยู่บนจอ — ไม่มีของเดิม = ต้องบอกว่าพัง */
      if (isLatest() && (!opts?.background || !dataRef.current)) {
        setLoadError(e.message || LOAD_ERROR_TITLE);
      }
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  // ทะเบียนไซต์/โซนโหลดตอนจะ "เลือก" เท่านั้น — คิวอย่างเดียวไม่ต้องใช้
  const loadRegistry = useCallback(async (siteId = null) => {
    const res = await apiFetch("/api/service/sites");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "โหลดทะเบียนไซต์ไม่สำเร็จ");
    /* ⚠️ /api/service/sites คืน **อาร์เรย์ตรง ๆ** ไม่ได้ห่อใน { sites } — ต่างจาก
       /api/service/visits ที่ห่อ · เดาผิดแล้วรายการไซต์ว่างเปล่าโดยไม่มี error */
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.sites) ? body.sites : []);
    setSites(rows);
    if (siteId) {
      const zoneRes = await apiFetch(`/api/service/sites/${siteId}/zones`);
      const zoneBody = await zoneRes.json().catch(() => null);
      if (zoneRes.ok) {
        /* 🐞 **เคยอ่าน `zoneBody.zones` ตัวเดียว** ทั้งที่ endpoint คืนอาร์เรย์ตรง ๆ
           (คอมเมนต์เหนือบรรทัด 79 เตือนเรื่องนี้ไว้เองแล้วสำหรับไซต์ แต่ท่อนโซนพลาด)
           ⇒ สร้างโซนใหม่ใน wizard แล้วดรอปดาวน์โซน **ว่างเปล่า** จัดสรรของต่อไม่ได้ */
        const zoneRows = Array.isArray(zoneBody)
          ? zoneBody
          : (Array.isArray(zoneBody?.zones) ? zoneBody.zones : []);
        setZonesBySite((prev) => new Map(prev).set(siteId, zoneRows));
      }
    }
    return rows;
  }, []);

  const openWizard = async (order) => {
    try {
      await loadRegistry();
      /* ⚠️ **เลิกโหลดที่อยู่ลูกค้าที่นี่แล้ว** (มติ 2026-08-30) — มันมีไว้ทำไทล์
         "ตั้งจากที่อยู่ไหน" ของฟอร์มสร้างไซต์ ซึ่งถูกถอดออกจาก wizard นี้แล้ว
         (ไซต์เกิดจากใบคำร้องประเมินพื้นที่ทางเดียว) · `addresses` เป็น jsonb ก้อนใหญ่
         — วัดจริง 136 KB บนลูกค้า 191 ราย ⇒ ไม่ดึงของที่ไม่มีใครใช้ */
      setWizardOrder(order);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
  };

  // โหลดโซนของไซต์ที่ถูกเลือกใน wizard (ไม่โหลดทุกไซต์ล่วงหน้า — ไซต์ 200 แห่ง
  // = 200 คำขอ) · ใช้ตัวอ้างอิงจาก state ปัจจุบันผ่าน setter เพื่อไม่ให้ callback
  // เปลี่ยนตัวตนทุกครั้งที่ zonesBySite ขยับ (ไม่งั้น useEffect ใน wizard วนไม่จบ)
  const ensureZones = useCallback(async (siteId) => {
    if (!siteId) return;
    let known = false;
    setZonesBySite((prev) => { known = prev.has(siteId); return prev; });
    if (known) return;
    const res = await apiFetch(`/api/service/sites/${siteId}/zones`);
    const body = await res.json().catch(() => null);
    if (!res.ok) return;
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.zones) ? body.zones : []);
    setZonesBySite((prev) => new Map(prev).set(siteId, rows));
  }, []);

  /* ⚠️ **ไม่มี `createSite` แล้ว** (มติผู้ใช้ 2026-08-30) — ไซต์เกิดจากใบคำร้อง
     "ประเมินพื้นที่" ทางเดียว · เหลือเฉพาะโซน ซึ่งเป็นรายละเอียดของไซต์ที่มีต้นเรื่องแล้ว */
  const registryActions = useMemo(() => ({
    ensureZones,
    createZone: async (siteId, form) => {
      const res = await apiFetch(`/api/service/sites/${siteId}/zones`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "สร้างโซนไม่สำเร็จ");
      await loadRegistry(siteId);
      return body;
    },
  }), [loadRegistry, ensureZones]);

  const bindOrder = async (payload) => {
    await ensureZones(payload.siteId);
    const res = await apiFetch("/api/service/intake/bind", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "ผูกโซนไม่สำเร็จ");
    setToast({ kind: "success", msg: `ผูกแล้ว ${body?.terms?.length || 0} บรรทัด — ขั้นต่อไปคือตั้งรอบเข้าบริการ` });
    setTab("plan");
    await load({ background: true });
  };

  const counts = data?.counts || { bind: 0, plan: 0, visit: 0, unknownLine: 0 };

  /* 🐞 จอตั้งเคยได้ตาราง 720px ในกล่อง 360px — ปุ่ม "รับเข้าไซต์" อยู่นอกจอทุกแถว
     ⇒ จอตั้ง/จอแคบเป็นการ์ด จอนอนเป็นตาราง (ทรงเดียวกับ /service/sites) สลับเองได้ที่หัวหน้า */
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });
  const tabRows = useMemo(() => data?.[tab] || [], [data, tab]);
  const viewPageSize = view === "cards" ? CARD_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(tabRows, { resetKey: tab, defaultSize: viewPageSize });
  /* มุมมองตัดสินหลัง mount (ก่อน mount ถือเป็นจอนอน = ตาราง) ⇒ `defaultSize` ตอนเริ่มไม่พอ
     ต้องตามมุมมองที่เปลี่ยน · แต่ถ้าคนเลือกจำนวนต่อหน้าเองแล้ว สลับมุมมองต้องไม่ทับค่าที่เลือก */
  const pageSizePicked = useRef(false);
  /* 🐞 เปลี่ยนขนาดหน้า = usePagination พากลับหน้า 1 ⇒ สลับมุมมองจากการ์ดหน้า 4 (ใบที่ 31–33)
     ไปตารางแล้วตกหน้า 1 หลงที่ · จำ "แถวแรกที่เห็นอยู่" ไว้ แล้วไปหน้าที่มีแถวนั้นหลังรีเซ็ต
     ⚠️ effect ตัวที่สองต้องประกาศ **หลัง** usePagination — effect รันตามลำดับประกาศ
        setPage(1) ของ hook มาก่อน ค่าที่ตั้งตรงนี้จึงชนะ */
  const keepFirstRow = useRef(null);
  useEffect(() => {
    if (pageSizePicked.current || pageSize === viewPageSize) return;
    keepFirstRow.current = (page - 1) * pageSize;
    setPageSize(viewPageSize);
  }, [viewPageSize, page, pageSize, setPageSize]);
  useEffect(() => {
    if (keepFirstRow.current === null) return;
    setPage(Math.floor(keepFirstRow.current / pageSize) + 1);
    keepFirstRow.current = null;
  }, [pageSize, setPage]);
  const pickPageSize = useCallback((size) => {
    pageSizePicked.current = true;
    setPageSize(size);
  }, [setPageSize]);
  // โหลดพัง = ไม่รู้ตัวเลข ⇒ ไม่โชว์ตัวเลขเก่าหรือศูนย์บนแท็บ/ถังใบไม่ระบุสาย
  const showCounts = Boolean(data) && !loadError;

  return (
    <Workspace
      icon={<ArrowDownToLine size={20} aria-hidden="true" />}
      title="งานเข้าใหม่"
      subtitle="ใบสั่งขายสายบริการที่อนุมัติแล้ว รอผูกกับไซต์/โซน แล้วตั้งรอบเข้าบริการ"
      /* ตัวสลับมุมมองอยู่หัวหน้า ไม่ใช่ท้ายแถบเครื่องมือแบบ /service/sites · /service/assets
         — หน้านี้ไม่มีแถบเครื่องมือ (ไม่มีค้นหา/ตัวกรอง) · ทรงเดียวกับคิวพี่น้อง /service/requests
         ที่ไม่มีแถบเครื่องมือเหมือนกัน (ตรวจรอบสอง 2026-09-15: ยอมรับสองตำแหน่งนี้ตามชนิดหน้า) */
      headerRight={(
        <ViewSwitcher
          value={view} onChange={setView} ariaLabel="มุมมองคิวงานเข้าใหม่"
          modes={["table", { value: "cards", icon: LayoutGrid, label: "การ์ด" }]}
        />
      )}
    >
      {/* แท็บกับคำอธิบายของแท็บเป็นก้อนเดียว — ห่อไว้ ไม่งั้นช่องไฟของ Workspace
          วางคำอธิบายลอยกลางระหว่างแท็บกับตาราง */}
      <div className={styles.tabBlock} onFocus={revealFocusedTab}>
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="คิวงานเข้าใหม่"
          tabs={INTAKE_TABS.map((key) => ({
            key,
            /* 🐞 ยังโหลดไม่เสร็จ/โหลดพัง เคยขึ้น "0 · 0 · 0" = อ่านเป็นคิวว่าง
               ⇒ ไม่มีข้อมูล = ไม่มีตัวเลข */
            label: showCounts ? `${INTAKE_TAB_LABELS[key]} ${counts[key] ?? 0}` : INTAKE_TAB_LABELS[key],
          }))}
        />
        {/* คำอธิบายพูดถึง "ของที่อยู่ในคิว" — โหลดพังแล้วยังขึ้นคำอธิบาย อ่านเหมือนคิวว่างปกติ */}
        {!loadError && <p className={styles.hint}>{INTAKE_TAB_HINTS[tab]}</p>}
      </div>

      {/* ⭐ ถังที่ระบบตอบไม่ได้ — ขึ้นเหนือคิวเสมอ ไม่ว่าจะอยู่แท็บไหน
          ฝ่าย TS แก้เองไม่ได้ (สายธุรกิจเป็นของโครงการ) จึงบอกว่าต้องไปหาใคร */}
      {showCounts && counts.unknownLine > 0 && (
        <section className={styles.unknown} aria-label="ใบที่ยังไม่ระบุสายธุรกิจ">
          <p className={styles.unknownHead}>
            <AlertTriangle size={14} aria-hidden="true" />
            <b>{counts.unknownLine} ใบยังไม่ระบุสายธุรกิจ</b> — ระบบไม่เดาให้ ต้องให้ฝ่ายขายระบุสายที่โครงการก่อน
          </p>
          <ul className={styles.unknownList}>
            {(data?.unknownLine || []).map((row) => (
              <li key={row.orderId}>
                <b>{row.code}</b>
                <span>{naText(row.customerName)}</span>
                <span>{row.pendingLines} บรรทัด</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 🐞 โหลดพังเคยเป็นข้อความเล็กสีปกติเหนือแท็บ ไม่มีทรงข้อผิดพลาด ไม่มีทางไปต่อ
          ⇒ ขึ้นกล่องแจ้งข้อผิดพลาดตรงที่คิวควรอยู่ + ปุ่มลองใหม่ (ทรงเดียวกับ /service/assets) */}
      {loading ? <SkeletonRows rows={4} /> : loadError ? (
        <StatusNotice tone="error" title={LOAD_ERROR_TITLE}
          action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
          {loadError === LOAD_ERROR_TITLE
            ? "ยังไม่รู้ว่ามีงานค้างอยู่เท่าไร — ไม่ได้แปลว่าคิวว่าง"
            : loadError}
        </StatusNotice>
      ) : (
        <>
          {tab === "bind" && (
            (data?.bind || []).length === 0 ? (
              <EmptyState icon={ArrowDownToLine}>
                ไม่มีใบสั่งขายรอผูกโซน — ใบสายบริการที่อนุมัติใหม่จะมาโผล่ที่นี่เอง
              </EmptyState>
            ) : view === "cards" ? (
              <ul className={styles.cardList} aria-label="ใบสั่งขายที่รอตั้งไซต์/โซน">
                {pageRows.map((row) => (
                  <li key={row.orderId} className={styles.card}>
                    <div className={styles.cardHead}>
                      <span className={`mono ${styles.cardCode}`}>{row.code}</span>
                      <strong className={styles.cardTitle}>{naText(row.customerName)}</strong>
                    </div>
                    {/* ใบย้อนหลัง — ป้าย + เลขเดิม + จุดติดตั้งตามใบ ชุดเดียวกับมุมมองตาราง (mig 0360 · มติข้อ 17) */}
                    {isHistoricalOrder(row) && (
                      <p className={styles.cardSub}>
                        <StatusBadge tone="info" size="sm" label="ย้อนหลัง" />
                        {row.historicalRefs?.length ? ` เลขเดิม ${row.historicalRefs.join(" · ")}` : null}
                      </p>
                    )}
                    <p className={styles.cardMeta}>
                      {fgText(row)} · อนุมัติ <span className="mono">{approvedText(row)}</span>
                      {row.roundsSold ? ` · ขายไว้ ${fmtNumber(row.roundsSold)} รอบ` : null}
                      {isHistoricalOrder(row) && row.installationPoints?.length
                        ? ` · จุดติดตั้งตามใบ ${row.installationPoints.join(" · ")}`
                        : null}
                    </p>
                    <div className={styles.cardFoot}>
                      <ContractBadge readiness={row.readiness} />
                      <PaidBadge readiness={row.readiness} />
                      {canEdit && (
                        <Button tone="neutral" className={styles.cardAction} onClick={() => openWizard(row)}
                          icon={<Building2 size={15} aria-hidden="true" />}>
                          รับเข้าไซต์
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              /* ⚠️ วันที่ · จำนวน · ป้าย · ปุ่ม เป็น nowrap ถือความกว้างเองแล้ว เหลือช่องชื่อลูกค้า
                 ช่องเดียวที่ตัดบรรทัด ⇒ `minWidth` มีไว้แค่กันช่องนั้นแคบเกิน ไม่ใช่ความกว้างของเนื้อ
                 🐞 เคยตั้ง 900 ⇒ จอนอน 821–935px กล่องแคบกว่าเนื้อ ปุ่ม "รับเข้าไซต์" โดนตัดขอบ
                 (กล่องแคบสุดของจอนอน 783px ที่จอ 821 · 760 เผื่อ scrollbar 15px ของ Windows) */
              <TableScroll family="list" minWidth={760} cells="stacked">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ใบสั่งขาย · ลูกค้า</th>
                      <th scope="col" className="num">อนุมัติเมื่อ</th>
                      <th scope="col"><span className={styles.qtyInset}>ของที่ต้องจัดสรร</span></th>
                      <th scope="col">สัญญา</th>
                      <th scope="col">จ่ายถึง</th>
                      <th scope="col" className={styles.actionCell} aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.orderId}>
                        {/* รหัสบน · ชื่อล่าง — ทรงเดียวกับทุกตารางในระบบ */}
                        <th scope="row">
                          <span className="mono">{row.code}</span>
                          <span className={`cell-sub ${styles.rowHeadSub}`}>{naText(row.customerName)}</span>
                          {/* ⭐ ใบสั่งขายย้อนหลัง (mig 0360 · มติข้อ 17) — TS ต้องรู้ว่าจุดติดตั้งมาจากชีตของฝ่ายขาย
                              (ตรงงานจริงแค่ 25%) ไม่ใช่จากใบประเมินพื้นที่ · เลขเอกสารเดิมไว้ถามฝ่ายขายต่อ */}
                          {isHistoricalOrder(row) && (
                            <span className="cell-sub">
                              <StatusBadge tone="info" size="sm" label="ย้อนหลัง" />
                              {row.historicalRefs?.length ? ` เลขเดิม ${row.historicalRefs.join(" · ")}` : null}
                            </span>
                          )}
                        </th>
                        <td className={`num ${styles.nowrap}`}>{approvedText(row)}</td>
                        {/* ⭐ นับ **FG + จำนวน** ไม่ใช่จำนวนบรรทัด (มติผู้ใช้ 2026-08-29)
                            บรรทัดเป็นรูปร่างของเอกสารขาย ไม่ใช่ขนาดของงาน — ใบจริงใบหนึ่ง
                            มี 10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย */}
                        <td className={styles.nowrap}>
                          <div className={styles.qtyInset}>
                            {fgText(row)}
                            {/* ⭐ ข้อผูกพันจำนวนรอบที่ฝ่ายขายระบุไว้ (mig 0326) — TS ต้องเห็น
                                ตั้งแต่ตอนรับงาน จะได้ตั้งความถี่ให้ได้จำนวนนัดตรงกับที่ขาย
                                ⚠️ ไม่ขึ้นเลยเมื่อยังไม่กรอก — "ยังไม่ระบุ" ไม่ใช่ "ขายศูนย์รอบ" */}
                            {row.roundsSold
                              ? <span className={styles.rowNote}>ขายไว้ {fmtNumber(row.roundsSold)} รอบ</span>
                              : null}
                            {/* ⭐ จุดติดตั้งตามชีตของใบย้อนหลัง — เบาะแสว่าต้องไปหาไซต์ไหน (FG เดียวกันคนละจุดแยกกลุ่มแล้ว) */}
                            {isHistoricalOrder(row) && row.installationPoints?.length
                              ? <span className={styles.rowNote}>จุดติดตั้งตามใบ {row.installationPoints.join(" · ")}</span>
                              : null}
                          </div>
                        </td>
                        {/* ⭐ ชิปความพร้อม (PR-C) — TS ต้องรู้ **ตั้งแต่ตอนรับงาน** ว่าใบนี้
                            พอจัดสรรแล้วจะเดินต่อได้ไหม · ของเดิมเห็นแต่ขนาดงาน แล้วไปเจอ
                            ด่านตอนจัดคิวทีหลัง ซึ่งเป็นตอนที่เสียเวลาไปแล้ว
                            ⚠️ นี่คือ *ป้ายบอกสถานะ* ไม่ใช่ด่าน — ใบที่ยังไม่พร้อมก็ยัง
                               รับเข้าไซต์/จัดสรรลงโซนได้ (คนละขั้นกัน)
                            แยกเป็นสองคอลัมน์ ป้ายจะได้เรียงเป็นแนว ไม่ซ้อนกันตอนจอแคบ */}
                        <td className="ui-badge-cell ui-badge-w-contract-no"><ContractBadge readiness={row.readiness} /></td>
                        <td className="ui-badge-cell ui-badge-w-paid"><PaidBadge readiness={row.readiness} /></td>
                        <td className={styles.actionCell}>
                          {canEdit && (
                            <div className={styles.rowAction}>
                              <Button tone="neutral" size="sm" onClick={() => openWizard(row)}
                                icon={<Building2 size={15} aria-hidden="true" />}>
                                รับเข้าไซต์
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}

          {tab === "plan" && (
            (data?.plan || []).length === 0 ? (
              <EmptyState icon={CalendarPlus}>
                ทุกไซต์ที่ขายแล้วมีรอบครบ — โซนที่ผูกใบสั่งขายแล้วแต่ยังไม่มีรอบจะมาอยู่ที่นี่
              </EmptyState>
            ) : view === "cards" ? (
              <ul className={styles.cardList} aria-label="ไซต์ที่รอตั้งรอบ">
                {pageRows.map((row) => (
                  <li key={row.key || row.siteId} className={styles.card}>
                    <div className={styles.cardHead}>
                      <strong className={styles.cardTitle}>{naText(row.site?.name)}</strong>
                      <span className={styles.cardSub}>{naText(row.site?.customerName)}</span>
                    </div>
                    {row.unboundPlans > 0 && (
                      <p className={styles.cardMeta}>
                        มีรอบที่ยังไม่ผูกใบ {fmtNumber(row.unboundPlans)} รอบ — ผูกใบให้รอบเดิมก่อนสร้างใหม่
                      </p>
                    )}
                    <p className={styles.cardMeta}>
                      <span className="mono">{naText(row.orderNumber)}</span>
                      {" · "}ขายไว้ {row.roundsSold ? `${fmtNumber(row.roundsSold)} รอบ` : naText(null)}
                    </p>
                    <p className={styles.cardMeta}>โซน: {row.zones.map((z) => z.name).join(" · ")}</p>
                    <Link href={`/service/sites/${row.siteId}`} className={`linklike ${styles.cardLink}`}>
                      ตั้งรอบที่หน้าไซต์
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              /* 🔴 **หนึ่งแถว = (ไซต์, ใบสั่งขาย)** ไม่ใช่หนึ่งไซต์ — ไซต์เดียวโผล่ได้
                  หลายแถวเมื่อมีหลายใบ (ขายเพิ่ม/ออก Rev.) ⇒ ต้องมีคอลัมน์ใบ ไม่งั้น
                  สองแถวพิมพ์ข้อความเหมือนกันเป๊ะ · และคีย์ต้องเป็น `row.key`
                  (เดิมเป็น `row.siteId` ซึ่งซ้ำทันทีที่มีสองใบ) */
              <TableScroll family="list" minWidth={860} cells="stacked">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      <th scope="col">ลูกค้า</th>
                      <th scope="col">ใบสั่งขาย</th>
                      <th scope="col">โซนที่ขายแล้ว</th>
                      <th scope="col">ขายไว้</th>
                      <th scope="col" className={styles.actionCell} aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.key || row.siteId}>
                        <th scope="row">
                          {naText(row.site?.name)}
                          {/* ⚠️ คำเตือนพิมพ์ทุกแถวที่เข้าเงื่อนไข ไม่ใช่แถวแรกแถวเดียว —
                              รอบที่ยังไม่ผูกใบเดินอยู่จริงที่ไซต์นี้ กดสร้างทับ = นัดซ้อน */}
                          {row.unboundPlans > 0 && (
                            <span className={`cell-sub ${styles.rowHeadSub}`}>
                              มีรอบที่ยังไม่ผูกใบ {fmtNumber(row.unboundPlans)} รอบ — ผูกใบให้รอบเดิมก่อนสร้างใหม่
                            </span>
                          )}
                        </th>
                        <td>{naText(row.site?.customerName)}</td>
                        <td className="mono">{naText(row.orderNumber)}</td>
                        <td>{row.zones.map((z) => z.name).join(" · ")}</td>
                        <td>{row.roundsSold ? `${fmtNumber(row.roundsSold)} รอบ` : naText(null)}</td>
                        <td className={styles.actionCell}>
                          <div className={styles.rowAction}>
                            <Link href={`/service/sites/${row.siteId}`} className="linklike">
                              ตั้งรอบที่หน้าไซต์
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}

          {tab === "visit" && (
            (data?.visit || []).length === 0 ? (
              <EmptyState icon={MapPin}>
                ทุกรอบมีนัดข้างหน้าแล้ว — รอบที่เดินอยู่แต่ไม่มีนัดล่วงหน้าเลยจะมาอยู่ที่นี่
              </EmptyState>
            ) : view === "cards" ? (
              <ul className={styles.cardList} aria-label="รอบที่ยังไม่มีนัด">
                {pageRows.map((row) => (
                  <li key={row.planId} className={styles.card}>
                    <div className={styles.cardHead}>
                      <strong className={styles.cardTitle}>{naText(row.site?.name)}</strong>
                      <span className={styles.cardSub}>
                        {VISIT_KIND_LABELS[row.kind] || row.kind} · ทุก {fmtNumber(row.everyDays)} วัน
                      </span>
                    </div>
                    <p className={styles.cardMeta}>
                      <span className="mono">{naText(row.salesOrderNumber)}</span>
                      {" · "}เจ้าหน้าที่ประจำ {naText(row.assigneeName)}
                    </p>
                    <Link href={`/service/sites/${row.siteId}`} className={`linklike ${styles.cardLink}`}>
                      เติมนัดที่หน้าไซต์
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <TableScroll family="list" minWidth={900}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      {/* ⚠️ ไซต์เดียวมีได้หลายรอบ (คนละใบ/คนละชนิดงาน) ⇒ "ทุก N วัน"
                          อย่างเดียวแยกแถวไม่ออก · ค่าพวกนี้ `visitQueue` คืนมาอยู่แล้ว
                          แต่จอไม่เคยวาด */}
                      <th scope="col">ชนิดงาน</th>
                      <th scope="col">รอบ</th>
                      <th scope="col">ใบสั่งขาย</th>
                      <th scope="col">เจ้าหน้าที่ประจำ</th>
                      <th scope="col" className={styles.actionCell} aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.planId}>
                        <th scope="row">{naText(row.site?.name)}</th>
                        <td>{VISIT_KIND_LABELS[row.kind] || row.kind}</td>
                        <td>ทุก {fmtNumber(row.everyDays)} วัน</td>
                        <td className="mono">{naText(row.salesOrderNumber)}</td>
                        <td>{naText(row.assigneeName)}</td>
                        <td className={styles.actionCell}>
                          <div className={styles.rowAction}>
                            <Link href={`/service/sites/${row.siteId}`} className="linklike">
                              เติมนัดที่หน้าไซต์
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}

          {/* คิวยาวขึ้นทุกครั้งที่มีใบอนุมัติใหม่ — แบ่งหน้าแทนการปักหัวตาราง
              (ของเหนือตารางสูง ปักแล้วได้สกรอลล์สองชั้น ดู `pinned` ใน Table.js) */}
          {tabRows.length > 0 && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={pickPageSize}
              itemLabel={tab === "visit" ? "รอบ" : "ใบ"}
            />
          )}
        </>
      )}

      <IntakeWizard
        open={!!wizardOrder}
        order={wizardOrder}
        sites={sites}
        zonesBySite={zonesBySite}
        onClose={() => setWizardOrder(null)}
        onDone={bindOrder}
        onReloadRegistry={registryActions}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

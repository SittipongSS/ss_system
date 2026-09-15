"use client";
// ── ทะเบียนไซต์บริการ (mig 0187 · S-1) ───────────────────────────────────
//
// ⭐ ก่อนหน้านี้ **ไม่มีที่เก็บเลย** — ทีม SV ขายระบบกระจายกลิ่นได้ แต่พอปิดการขาย
// แล้วไม่มีตารางไหนรู้ว่าไปติดตั้งที่ไหน · `customers` มีที่อยู่ช่องเดียว ลูกค้าที่มี
// 12 สาขาเก็บไม่ได้ตั้งแต่ต้น
//
// ⭐ รื้อหน้า (มติผู้ใช้ 2026-09-01): เดิมมีแค่ค้นหา — ยกมาตรฐาน "มาตรฐานทั้งระบบ
// มติ 2026-07-18" ของหน้ารายการสินค้า/ลูกค้ามาใช้ทั้งชุด (ตัวกรอง + จัดเรียง +
// แบ่งหน้า + สลับมุมมองการ์ด/ตาราง) — ค่าจำ (ค้นหา/ตัวกรอง) ผ่าน useStickyState
// ตัวเดียวกับหน้าอื่น ไม่ใช่ useState ธรรมดา
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive, Building2, History, LayoutGrid, MapPin, Navigation, Search, Table2, Upload,
} from "lucide-react";
import Button from "@/components/ui/Button";
import LegacySiteModal from "@/components/service/LegacySiteModal";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import DetailRow from "@/components/ui/DetailRow";
import { TableScroll } from "@/components/ui/Table";
import { SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import Toast from "@/components/ui/Toast";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import useStickyState from "@/lib/ui/useStickyState";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { compareSortValues } from "@/lib/useSortableTable";
import { accessWindowText } from "@/lib/service/sites";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService, canImportServiceData } from "@/lib/permissions";
import styles from "./page.module.css";
import { naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

/* ── เรียงลำดับ: ย้ายจากหัวตารางมาอยู่บนแถบเครื่องมือ (มติผู้ใช้ 2026-09-15 · ต้นแบบ = ใบเสนอราคา)
   ⭐ ได้สองอย่างที่หัวตารางให้ไม่ได้: มุมมองการ์ด (จอแนวตั้ง) เรียงได้ด้วย และเรียงตาม
      **ชื่อไซต์** ได้อีกครั้ง (หายไปตอนรวมรหัส+ชื่อเป็นคอลัมน์เดียว)
   `dir` = ทิศตั้งต้นเมื่อเลือกหัวข้อนั้น — จำนวนเครื่องมากไปน้อยคือสิ่งที่คนมองหา
   ⚠️ ป้ายสั้นโดยตั้งใจ — ปุ่มโชว์ป้ายที่เลือกอยู่ในชิป · วัดที่จอ 360px ก้อนเรียงต้องกว้าง ≤ 212px
      ถึงอยู่แถวเดียวกับปุ่มตัวกรองได้ ("เขตวิ่งงาน" 216 · "จำนวนเครื่อง" 229 ⇒ ตกไปแถวสาม)
      "เขต" = คำเดียวกับบนการ์ด · "เครื่อง" = คำเดียวกับหัวคอลัมน์ */
const SORT_OPTIONS = [
  { value: "code", label: "รหัสไซต์", dir: "asc" },
  { value: "name", label: "ชื่อไซต์", dir: "asc" },
  { value: "customer", label: "ลูกค้า", dir: "asc" },
  { value: "routeZone", label: "เขต", dir: "asc" },
  { value: "assets", label: "เครื่อง", dir: "desc" },
];
const SORT_DEFAULT = "code";
const SORT_VALUE = {
  code: (s) => s.code || "",
  name: (s) => s.name || "",
  customer: (s) => s.customerName || "",
  routeZone: (s) => s.routeZone || "",
  assets: (s) => s.activeAssetCount ?? null,
};
const sortDirOf = (key) => SORT_OPTIONS.find((option) => option.value === key)?.dir || "asc";

export default function ServiceSitesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  // ⚠️ cap อย่างเดียวไม่พอ — service:edit ถือกว้างทั้ง staff และ sales role
  // ฝ่าย TS / ทีม SV คือตัวกั้นจริง (เหมือนที่ server ทำใน requireService)
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);
  // นำเข้าเป็นก้อนแคบกว่าการแก้รายใบ — **แอดมินเท่านั้น** (F-8 · มติ 2026-08-30)
  const canImport = useMemo(
    () => canImportServiceData({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  /* toast "ลบไซต์แล้ว" ข้ามหน้ามาจากหน้ารายละเอียด (ลบสำเร็จแล้วไม่มีข้อมูลเหลือให้
     อยู่หน้านั้นต่อ) — อ่านครั้งเดียวตอน mount แล้วเคลียร์ query ทิ้ง ไม่งั้น refresh
     หน้านี้ซ้ำจะเห็น toast เดิมค้าง */
  useEffect(() => {
    const deleted = searchParams.get("deleted");
    if (!deleted) return;
    setToast({ kind: "success", msg: `ลบไซต์ ${deleted} แล้ว` });
    router.replace("/service/sites", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useStickyState("search", "");
  const [provinceFilter, setProvinceFilter] = useStickyState("provinceFilter", EMPTY);
  const [customerFilter, setCustomerFilter] = useStickyState("customerFilter", EMPTY);
  const [zoneFilter, setZoneFilter] = useStickyState("zoneFilter", EMPTY);
  // ปิดใช้งาน = ซ่อนไว้ก่อนเป็นค่าตั้งต้น (แพตเทิร์นเดียวกับหน้าสินค้า/ลูกค้า) — ไซต์
  // ที่เลิกใช้ไม่ใช่สิ่งที่คนเปิดหน้านี้มาหาโดยปริยาย
  const [showInactive, setShowInactive] = useStickyState("showInactive", false);
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  /* `silent` = ดึงใหม่เงียบ ๆ ไม่สลับเป็นโครงร่าง — ใช้หลังบันทึกจากโมดัล
     🐞 เดิม Workspace วาด `loading ? โครงร่าง : children` ⇒ load() ธรรมดาหลังบันทึกไซต์ย้อนหลัง
        ถอดโมดัลออกจากจอกลางคัน (state หาย) ⇒ จอผลที่มีรหัสจริง / "ส่งส่วนที่เหลืออีกครั้ง" ไม่เคยขึ้น
     ⚠️ วันนี้โครงร่างอยู่ในเนื้อ ListPanel เท่านั้น (โมดัลอยู่นอก Workspace) แต่ยังดึงเงียบหลังบันทึก —
        ตารางที่มีแถวอยู่แล้วไม่ควรกะพริบเป็นโครงร่าง (กติกา `loading` ของ ListPanel) */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/service/sites");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดทะเบียนไซต์ไม่สำเร็จ");
      setSites(Array.isArray(data) ? data : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีไซต์" — โหลดพังกับยังไม่มีข้อมูล
      // หน้าตาเหมือนกันจนแยกไม่ออก
      setLoadError(e.message || "โหลดทะเบียนไซต์ไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ⚠️ **หน้านี้ไม่มีฟอร์มไซต์แล้ว** (มติ 2026-08-30) — สร้างไม่ได้ (ไซต์เกิดจาก
     ใบคำร้อง) และ *แก้* อยู่ที่หน้ารายละเอียดของไซต์นั้น ⇒ ทะเบียนลูกค้า · โมดัล ·
     ตัวบันทึก ถูกถอดออกทั้งชุด ไม่ใช่ปล่อยไว้เป็นโค้ดที่ไม่มีทางถูกเรียก
     🐞 โค้ดตายแบบนั้นคือสิ่งที่ทำให้คนอ่านเชื่อว่าหน้านี้ยังแก้ไซต์ได้
     ⭐ **ข้อยกเว้นเดียว: "เพิ่มไซต์ย้อนหลัง"** (มติผู้ใช้ 2026-09-11) — คีย์ไซต์ที่มีอยู่ก่อน
     มีระบบ (ไซต์ · โซน · จุดติดตั้ง) ด้วยโมดัลของมันเอง ไม่ใช่ฟอร์มไซต์โหมดสร้าง
     (`LegacySiteModal` · ยาม `siteOrigin.test.mjs` บันทึกข้อยกเว้นนี้) */

  const activeCount = useMemo(() => sites.filter((s) => s.isActive !== false).length, [sites]);
  const inactiveCount = sites.length - activeCount;
  const totalActiveAssets = useMemo(
    () => sites.reduce((sum, s) => sum + (s.activeAssetCount || 0), 0),
    [sites],
  );

  // ตัวเลือกตัวกรอง — ยกจากไซต์ที่โหลดมาแล้วตรง ๆ ไม่ยิง API เพิ่ม (จำนวนไซต์ไม่ถึง
  // ระดับที่ต้องแบ่งหน้าฝั่ง server)
  const provinceOptions = useMemo(() => {
    const set = new Map();
    sites.forEach((s) => { if (s.province) set.set(s.province, s.province); });
    return [...set.values()].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({ value: v, label: v }));
  }, [sites]);
  const customerOptions = useMemo(() => {
    const map = new Map();
    sites.forEach((s) => { if (s.customerId) map.set(s.customerId, s.customerName || s.customerId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "th")).map(([value, label]) => ({ value, label }));
  }, [sites]);
  const zoneOptions = useMemo(() => {
    const set = new Map();
    sites.forEach((s) => { if (s.routeZone) set.set(s.routeZone, s.routeZone); });
    return [...set.values()].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({ value: v, label: v }));
  }, [sites]);

  const q = search.trim().toLocaleLowerCase("th");
  const filtered = useMemo(() => sites.filter((site) => {
    if (!showInactive && site.isActive === false) return false;
    if (provinceFilter.length && !provinceFilter.includes(site.province)) return false;
    if (customerFilter.length && !customerFilter.includes(site.customerId)) return false;
    if (zoneFilter.length && !zoneFilter.includes(site.routeZone)) return false;
    if (q) {
      // จังหวัดเข้าชุดค้นด้วย (mig 0315) — เป็นตัวตนถาวรของไซต์ คนถามหา "ไซต์ที่เชียงใหม่"
      // รหัสลูกค้า (AR) โชว์บนแถวแล้ว ⇒ ต้องค้นเจอด้วย (ตาเห็นบนแถว = ค้นเจอ)
      const hit = [site.name, site.customerName, site.customerArCode, site.routeZone, site.code, site.province]
        .filter(Boolean).some((field) => String(field).toLocaleLowerCase("th").includes(q));
      if (!hit) return false;
    }
    return true;
  }), [sites, showInactive, provinceFilter, customerFilter, zoneFilter, q]);

  const [storedSortKey, setSortKey] = useStickyState("sortKey", SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", sortDirOf(SORT_DEFAULT));
  // ค่าที่จำไว้จากหัวข้อที่ถูกถอดไปแล้ว ⇒ กลับไปค่าตั้งต้น ไม่ใช่เรียงด้วยตัวดึงค่าที่ไม่มีอยู่
  const sortKey = SORT_VALUE[storedSortKey] ? storedSortKey : SORT_DEFAULT;
  const sorted = useMemo(() => {
    const get = SORT_VALUE[sortKey];
    return [...filtered].sort((a, b) => compareSortValues(get(a), get(b), sortDir));
  }, [filtered, sortKey, sortDir]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sorted, {
      resetKey: `${q}|${provinceFilter.join(",")}|${customerFilter.join(",")}|${zoneFilter.join(",")}|${showInactive}|${sortKey}|${sortDir}`,
    });

  const filterCount = provinceFilter.length + customerFilter.length + zoneFilter.length + (showInactive ? 1 : 0);

  const headerRight = (
    <>
      {/* ป้ายจำนวนย้ายไปหัวแผงรายการ (มติผู้ใช้ 2026-09-15 · ListPanel) — เลขเดียวกันห้ามซ้ำบนหัวหน้า */}
      {/* 🔴 **ไม่มีปุ่ม "เพิ่มไซต์" ที่ทะเบียนอีกแล้ว** (มติผู้ใช้ 2026-08-30:
          "สร้างที่คำร้องเท่านั้น ห้ามสร้างผ่านทะเบียนไซต์")
          ⭐ เหตุผลเชิงระบบ: ไซต์ต้องมี **ต้นเรื่อง** เสมอ — เกิดจากใบประเมินพื้นที่ที่
             ฝ่ายขายเปิดให้ลูกค้ารายนั้น · ทะเบียนเป็นที่ *ดู* ไม่ใช่ที่ *เริ่ม*
             (กติกาเดียวกับที่หน้าจัดคิวเจ้าหน้าที่เป็นที่ "วาง" ไม่ใช่ "สร้าง") */}
      {canImport && (
        <Button tone="neutral" as={Link} href="/service/import"
          icon={<Upload size={15} aria-hidden="true" />}>
          นำเข้าข้อมูลเก่า
        </Button>
      )}
      {/* ⭐ **เพิ่มไซต์ย้อนหลัง** (มติผู้ใช้ 2026-09-11) — ของเก่าที่ติดตั้งอยู่ก่อนมีระบบ ทีละแห่ง
          · สีกลาง ไม่ใช่สีแบรนด์: งานย้ายข้อมูลเก่า ทะเบียนไม่ควรดูเหมือนที่ที่ไซต์ใหม่เกิด
          · ไอคอนนาฬิกาย้อนหลัง ไม่ยืมหมุดแผนที่ของ entity ไซต์
          · สิทธิ์ = canEditService (ไม่มีสิทธิ์ = ไม่เห็นปุ่มเลย) — ตรงกับด่านของ API */}
      {canEdit && (
        <Button tone="neutral" onClick={() => setLegacyOpen(true)}
          icon={<History size={15} aria-hidden="true" />}>
          เพิ่มไซต์ย้อนหลัง
        </Button>
      )}
    </>
  );

  /* เครื่องมือของรายการ = fragment เข้า `ListPanel toolbar` — แผงห่อ `.toolbar` ให้เอง ห้ามห่อซ้ำ
     (มติผู้ใช้ 2026-09-15 · เดิมส่งเข้า `Workspace toolbar` ที่ถูกถอด) */
  const toolbar = (
    <>
      {/* กล่องครอบ `.search-glass` ถือขอบ/พื้น/ไอคอน — ใส่ icon+input แยกกันดิบ ๆ
         (ไม่มีกล่องครอบ) ไอคอนจะลอยแยกจากกล่องข้อความ (แพตเทิร์นเดียวกับหน้าสินค้า/
         ลูกค้า ดูโน้ตที่ Input.js: เคยพังกลับด้าน — ใส่คลาสกล่องครอบไว้ที่ <input>
         ตรง ๆ จนไอคอนหาย) */}
      <div className={`search-glass ${styles.searchInput}`.trim()}>
        <Search size={15} aria-hidden="true" />
        <Input
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          /* 🐞 ย้ายเข้า ListPanel แล้วช่องแคบลง ~30px (ระยะขอบเนื้อแผง) — คำใบ้เต็ม 213px ขาดเป็น
             "…เขต หรือ" ที่จอ 390 (ช่องเหลือ 185px) ⇒ ตัด "จังหวัด" ออกจากคำใบ้ (170px)
             แต่ยังค้นจังหวัดได้ (haystack ด้านบน) · ชื่อเต็มอยู่ใน aria-label เรียงคำเดียวกัน */
          placeholder="ค้นหาไซต์ ลูกค้า เขต หรือรหัส"
          aria-label="ค้นหาไซต์ ลูกค้า จังหวัด เขต หรือรหัส"
        />
      </div>
      <FilterPopover
        count={filterCount}
        onClear={() => { setProvinceFilter([]); setCustomerFilter([]); setZoneFilter([]); setShowInactive(false); }}
        groups={[
          {
            key: "province", label: "จังหวัด", icon: MapPin,
            options: provinceOptions, selected: provinceFilter, onChange: setProvinceFilter,
          },
          {
            key: "customer", label: "ลูกค้า", icon: Building2,
            options: customerOptions, selected: customerFilter, onChange: setCustomerFilter,
          },
          {
            key: "routeZone", label: "เขตวิ่งงาน", icon: Navigation,
            options: zoneOptions, selected: zoneFilter, onChange: setZoneFilter,
          },
          /* ⚠️ ขึ้นเฉพาะตอนมีของค้างจริง — ตัวกรองที่กดแล้วได้ 0 เสมอคือขยะบนแถบ */
          ...(inactiveCount > 0 ? [{
            key: "inactive", label: "ที่ปิดใช้งาน", icon: Archive,
            options: [{ value: "show", label: `รวมไซต์ที่ปิดใช้งาน (${inactiveCount})` }],
            selected: showInactive ? ["show"] : [],
            onChange: (vals) => setShowInactive(vals.includes("show")),
          }] : []),
        ]}
      />
      {/* เรียง + ทิศทาง = ก้อนเดียว ตัดบรรทัดไปด้วยกัน (ไม่ใช่ `.spacer` + สองปุ่มลอย)
          🐞 จอ 360px ปุ่มลูกศรเคยหลุดไปแถวสามคนเดียว ห่างจากเมนูที่มันกลับทิศให้ */}
      <div className={`ui-sort-control ${styles.sortGroup}`}>
        <SortMenu
          title="เรียงลำดับไซต์"
          value={sortKey}
          defaultValue={SORT_DEFAULT}
          onChange={(value) => { setSortKey(value); setSortDir(sortDirOf(value)); }}
          options={SORT_OPTIONS}
        />
        <SortDirButton dir={sortDir} onToggle={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} />
      </div>
      {/* ตัวกลางถือ type=button · aria-pressed · ชื่อให้โปรแกรมอ่านจอ · ปุ่มลูกศร
          🐞 เดิมเขียนปุ่มเอง: ชื่อมาจาก title อย่างเดียว และบอกมุมมองที่เลือกด้วยสีพื้นเท่านั้น */}
      <Segmented
        ariaLabel="มุมมอง"
        className={styles.viewToggle}
        showLabels={false}
        value={view}
        onChange={setView}
        options={[
          { value: "table", label: "มุมมองตาราง", icon: Table2 },
          { value: "cards", label: "มุมมองการ์ด", icon: LayoutGrid },
        ]}
      />
    </>
  );

  return (
    <>
    <Workspace
      icon={<MapPin size={20} aria-hidden="true" />}
      title="ไซต์บริการ"
      subtitle="จุดติดตั้งระบบกระจายกลิ่นของลูกค้า และเครื่องที่อยู่หน้างาน"
      headerRight={headerRight}
      rail={(
        /* แถบตัวเลขกลาง (Page contract §2) — จอแคบยุบเหลือ 2 คอลัมน์เอง
           🐞 StatCards ตรึง 4 คอลัมน์ด้วย inline style ⇒ จอ 390px ช่องละ 83px ป้ายตัดบรรทัด ตัวเลขไม่ตรงแนว */
        <MetricStrip>
          <Metric label="ทั้งหมด" value={sites.length} />
          <Metric label="ใช้งาน" value={activeCount} tone="success" />
          <Metric label="ปิดใช้งาน" value={inactiveCount} tone={inactiveCount ? "warning" : undefined} />
          <Metric label="เครื่องที่ใช้งานอยู่" value={totalActiveAssets} />
        </MetricStrip>
      )}
    >
      {/* ⭐ ทะเบียน = ListPanel ใบเดียว (มติผู้ใช้ 2026-09-15 · ต้นแบบ /sa/quotations)
          · ป้ายนับไซต์ที่มองเห็นหลังค้นหา/กรอง = ยอดของ Pager · ยังไม่รู้ (โหลด/พัง) = ขีด ไม่ใช่ 0
          · `loading` แทนที่เฉพาะเนื้อ — ช่องค้นหาไม่หลุดโฟกัสระหว่างโหลด (เดิม `Workspace loading` ถอดทั้งหน้า) */}
      <ListPanel
        icon={<MapPin size={17} aria-hidden="true" />}
        title="ทะเบียนไซต์"
        subtitle="เปิดไซต์เพื่อดูโซน จุดติดตั้ง และเครื่องที่หน้างาน"
        count={loading || loadError ? null : `${sorted.length} ไซต์`}
        loading={loading}
        toolbar={toolbar}
      >
        {/* ⚠️ ห้ามกลืน error เป็น "ยังไม่มีไซต์" — โหลดพังกับยังไม่มีข้อมูลหน้าตาเหมือนกัน ⇒ ข้อความในเนื้อแผง + ทางลองใหม่ */}
        {loadError ? (
          <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}>
            {loadError}
          </StatusNotice>
        ) : sites.length === 0 ? (
          <EmptyState plain icon={MapPin}>
            ยังไม่มีไซต์บริการในระบบ — ไซต์เกิดจากใบคำร้อง &ldquo;ประเมินพื้นที่&rdquo; ที่ฝ่ายขายเปิดให้ลูกค้า
            {/* บอกทางของ "ของเก่า" เฉพาะคนที่กดปุ่มได้ — คนอื่นไม่เห็นปุ่ม ข้อความนี้จะชี้ไปที่ของที่ไม่มี */}
            {canEdit && <> · ไซต์ที่ติดตั้งอยู่ก่อนมีระบบ เพิ่มได้ที่ปุ่ม &ldquo;เพิ่มไซต์ย้อนหลัง&rdquo;</>}
          </EmptyState>
        ) : sorted.length === 0 ? (
          /* ⚠️ ค้นไม่เจอ ≠ ไม่มีไซต์ — ตารางว่างเปล่าโดยไม่มีคำอธิบายอ่านเหมือนข้อมูลหาย */
          <EmptyState plain icon={Search}>
            {q ? `ไม่มีไซต์ที่ตรงกับ “${search.trim()}”` : "ไม่มีไซต์ที่ตรงกับตัวกรองที่เลือก"} — ลองเปลี่ยนคำค้นหรือล้างตัวกรอง
          </EmptyState>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pageRows.map((site) => {
              const window = accessWindowText(site);
              const inactive = site.isActive === false;
              return (
                <Link
                  key={site.id}
                  href={`/service/sites/${site.id}`}
                  className={[styles.card, inactive && styles.cardInactive, "clickable-row p-4 flex-col gap-2"].filter(Boolean).join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`${styles.cardCode} font-mono`}>{naText(site.code)}</div>
                      <div className="font-semibold text-[var(--text)] text-sm truncate mt-0.5">{site.name}</div>
                      <div className={`${styles.cardCustomer} mt-0.5 truncate`}>{naText(site.customerName)}</div>
                    </div>
                    <span className={`ui-badge shrink-0 ${inactive ? "" : "success"}`.trim()}>{inactive ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    {/* ⚠️ ต้องมีป้าย — ค่าลอย ๆ ("—" หรือชื่อเขต) อ่านไม่ออกว่าคืออะไร */}
                    <span className="text-[var(--text-2)] truncate">
                      {site.routeZone ? `เขต ${site.routeZone}` : <span className={styles.muted}>ยังไม่ระบุเขต</span>}
                    </span>
                    <span className="font-mono text-[var(--text-2)]">
                      {site.activeAssetCount || 0}
                      {site.assetCount !== site.activeAssetCount ? ` / ${site.assetCount}` : ""} เครื่อง
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-3)]">
                    {window || "ช่วงเวลาที่เข้าได้ไม่จำกัด"}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* ⭐ ทรงเดียวกับตารางใบเสนอราคา (มติผู้ใช้ 2026-09-15 "ตารางไซต์ไม่สวย ใช้ใบเสนอราคาเป็นต้นแบบ")
             · กรอบชั้นเดียว `TableScroll surface="auto"` — เดิม TableShell = การ์ด + กรอบตารางซ้อนข้างใน
             · ทั้งแถวกดได้ (DetailRow) · ลิงก์ในเซลล์แรกคือทางเข้าของคีย์บอร์ด (href ตรงกันทุกตัวอักษร)
             · รหัสลูกค้า (AR) อยู่เหนือชื่อกิจการ · ป้ายสถานะกว้างเท่ากันทั้งคอลัมน์
             ⚠️ `minWidth` — รหัสรูปใหม่ยาว 19 ตัว (ST-0121-01-BKK-1001) ไม่ส่งค่านี้
             ตารางจะบีบคอลัมน์จนรหัสตัดบรรทัด แทนที่จะเลื่อนแนวนอน (Table.module.css) */
          <TableScroll aria-busy={loading} surface="auto" minWidth={860}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {/* รหัสบน · ชื่อล่าง · ค้นหาครอบทั้งสองอยู่แล้ว
                      🐞 เดิมแยกสองคอลัมน์: รหัสที่คนกวาดหาเป็นข้อความเฉย ๆ เป้ากดเหลือแค่ชื่อสั้น ๆ ("ชั้น 2" 23×18px) */}
                  <th>ไซต์</th>
                  <th>ลูกค้า</th>
                  <th>เขตวิ่งงาน</th>
                  <th className="num">เครื่อง</th>
                  <th>ช่วงเวลาที่เข้าได้</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((site) => {
                  const window = accessWindowText(site);
                  const inactive = site.isActive === false;
                  return (
                    <DetailRow
                      key={site.id}
                      href={`/service/sites/${site.id}`}
                      className={inactive ? `premium-row ${styles.inactive}` : "premium-row"}
                    >
                      <td>
                        {/* prefetch={false} ลิงก์ในแถว — กัน RSC prefetch ต่อแถวของลิสต์ยาว */}
                        <Link prefetch={false} href={`/service/sites/${site.id}`} className="linklike"><strong className="mono">{site.code || site.name}</strong></Link>
                        {site.code && site.name ? <span className={styles.subLine}>{site.name}</span> : null}
                      </td>
                      <td>
                        {site.customerArCode ? <span className="ar-code ar-code-block">{site.customerArCode}</span> : null}
                        {naText(site.customerName)}
                      </td>
                      <td>{naText(site.routeZone)}</td>
                      <td className={`num mono ${styles.numCol}`}>
                        {/* เครื่องที่ยังใช้งานคือตัวเลขที่เจ้าหน้าที่สนใจ · รวมทั้งหมดไว้ในวงเล็บ */}
                        {site.activeAssetCount || 0}
                        {site.assetCount !== site.activeAssetCount ? ` / ${site.assetCount}` : ""}
                      </td>
                      <td>{window || <span className={styles.muted}>ไม่จำกัด</span>}</td>
                      <td>
                        <span className={`ui-badge ui-badge-cell ${inactive ? "" : "success"}`.trim()}>{inactive ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                      </td>
                    </DetailRow>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}

        {!loadError && sorted.length > 0 && (
          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={setPageSize}
          />
        )}
      </ListPanel>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
    {/* ⚠️ อยู่ **นอก** Workspace โดยตั้งใจ — เดิม Workspace สลับ children เป็นโครงร่างตอน loading
        โมดัลที่อยู่ข้างในถูกถอดทิ้งพร้อม state ทุกครั้งที่หน้าโหลดใหม่ (เหตุผลเต็มที่ load ข้างบน)
        · วันนี้โครงร่างอยู่ในเนื้อ ListPanel แต่โมดัลก็ยังห้ามอยู่ในเนื้อแผง (กติกา ListPanel) · ยาม legacySite.test */}
    {canEdit && (
      <LegacySiteModal
        open={legacyOpen}
        onClose={() => setLegacyOpen(false)}
        onSaved={() => { load({ silent: true }); }}
      />
    )}
    </>
  );
}

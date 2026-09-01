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
  Archive, Building2, LayoutGrid, MapPin, Navigation, Search, Table2, Upload,
} from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import Input from "@/components/ui/Input";
import SkeletonRows from "@/components/ui/Skeleton";
import StatCards from "@/components/database/StatCards";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import useStickyState from "@/lib/ui/useStickyState";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { accessWindowText } from "@/lib/service/sites";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService, canImportServiceData } from "@/lib/permissions";
import styles from "./page.module.css";
import { naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

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
  // นำเข้าเป็นก้อนแคบกว่าการแก้รายใบ — หัวหน้าฝ่ายบริการขึ้นไปเท่านั้น (F-8)
  const canImport = useMemo(
    () => canImportServiceData({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
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

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ⚠️ **หน้านี้ไม่มีฟอร์มไซต์แล้ว** (มติ 2026-08-30) — สร้างไม่ได้ (ไซต์เกิดจาก
     ใบคำร้อง) และ *แก้* อยู่ที่หน้ารายละเอียดของไซต์นั้น ⇒ ทะเบียนลูกค้า · โมดัล ·
     ตัวบันทึก ถูกถอดออกทั้งชุด ไม่ใช่ปล่อยไว้เป็นโค้ดที่ไม่มีทางถูกเรียก
     🐞 โค้ดตายแบบนั้นคือสิ่งที่ทำให้คนอ่านเชื่อว่าหน้านี้ยังแก้ไซต์ได้ */

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
      const hit = [site.name, site.customerName, site.routeZone, site.code, site.province]
        .filter(Boolean).some((field) => String(field).toLocaleLowerCase("th").includes(q));
      if (!hit) return false;
    }
    return true;
  }), [sites, showInactive, provinceFilter, customerFilter, zoneFilter, q]);

  const sort = useSortableTable(filtered, {
    code: (s) => s.code || "",
    site: (s) => s.name || "",
    customer: (s) => s.customerName || "",
    routeZone: (s) => s.routeZone || "",
    assets: (s) => s.activeAssetCount ?? null,
  }, { key: "code", dir: "asc" });

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      resetKey: `${q}|${provinceFilter.join(",")}|${customerFilter.join(",")}|${zoneFilter.join(",")}|${showInactive}|${sort.sortKey}|${sort.sortDir}`,
    });

  const filterCount = provinceFilter.length + customerFilter.length + zoneFilter.length + (showInactive ? 1 : 0);

  const headerRight = (
    <>
      <span className="ui-badge">{sites.length} รายการ</span>
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
    </>
  );

  const toolbar = (
    <div className="toolbar">
      {/* กล่องครอบ `.search-glass` ถือขอบ/พื้น/ไอคอน — ใส่ icon+input แยกกันดิบ ๆ
         (ไม่มีกล่องครอบ) ไอคอนจะลอยแยกจากกล่องข้อความ (แพตเทิร์นเดียวกับหน้าสินค้า/
         ลูกค้า ดูโน้ตที่ Input.js: เคยพังกลับด้าน — ใส่คลาสกล่องครอบไว้ที่ <input>
         ตรง ๆ จนไอคอนหาย) */}
      <div className={`search-glass ${styles.searchInput}`.trim()}>
        <Search size={15} aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อไซต์ ลูกค้า จังหวัด เขตวิ่งงาน หรือรหัส"
          aria-label="ค้นหาไซต์บริการ"
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
      <div className="spacer" />
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <Workspace
      icon={<MapPin size={20} aria-hidden="true" />}
      title="ไซต์บริการ"
      subtitle="จุดติดตั้งระบบกระจายกลิ่นของลูกค้า และเครื่องที่อยู่หน้างาน"
      headerRight={headerRight}
      loading={loading}
      rail={(
        <StatCards
          items={[
            { label: "ทั้งหมด", value: sites.length },
            { label: "ใช้งาน", value: activeCount, tone: "success" },
            { label: "ปิดใช้งาน", value: inactiveCount, tone: inactiveCount ? "warn" : undefined },
            { label: "เครื่องที่ใช้งานอยู่", value: totalActiveAssets },
          ]}
        />
      )}
      toolbar={toolbar}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading || loadError ? (
        loading ? <SkeletonRows rows={5} /> : null
      ) : sites.length === 0 ? (
        <EmptyState icon={MapPin}>
          ยังไม่มีไซต์บริการในระบบ — ไซต์เกิดจากใบคำร้อง &ldquo;ประเมินพื้นที่&rdquo; ที่ฝ่ายขายเปิดให้ลูกค้า
        </EmptyState>
      ) : sort.sorted.length === 0 ? (
        /* ⚠️ ค้นไม่เจอ ≠ ไม่มีไซต์ — ตารางว่างเปล่าโดยไม่มีคำอธิบายอ่านเหมือนข้อมูลหาย */
        <EmptyState icon={Search}>
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
                className={`${styles.card} clickable-row p-4 flex-col gap-2`}
                style={inactive ? { opacity: "var(--op-muted)" } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--accent)] font-mono">{naText(site.code)}</div>
                    <div className="font-semibold text-[var(--text)] text-sm truncate mt-0.5">{site.name}</div>
                    <div className="text-[10px] text-[var(--text-3)] mt-0.5 truncate">{naText(site.customerName)}</div>
                  </div>
                  <span className="ui-badge">{inactive ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-2)] truncate">{naText(site.routeZone)}</span>
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
        /* ⚠️ `minWidth` — รหัสรูปใหม่ยาว 19 ตัว (ST-0121-01-BKK-1001) ไม่ส่งค่านี้
           ตารางจะบีบคอลัมน์จนรหัสตัดบรรทัด แทนที่จะเลื่อนแนวนอน (Table.module.css) */
        <TableShell minWidth={960}>
          <table>
            <thead>
              <tr>
                <SortTh label="รหัส" sortKey="code" sort={sort} />
                <SortTh label="ไซต์" sortKey="site" sort={sort} />
                <SortTh label="ลูกค้า" sortKey="customer" sort={sort} />
                <SortTh label="เขตวิ่งงาน" sortKey="routeZone" sort={sort} />
                <SortTh label="เครื่อง" sortKey="assets" sort={sort} className={styles.numCol} />
                <th>ช่วงเวลาที่เข้าได้</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((site) => {
                const window = accessWindowText(site);
                return (
                  <tr key={site.id} className={site.isActive === false ? styles.inactive : undefined}>
                    <td className="mono">{naText(site.code)}</td>
                    <td>
                      <Link href={`/service/sites/${site.id}`} className={styles.siteLink}>{site.name}</Link>
                    </td>
                    <td>{naText(site.customerName)}</td>
                    <td>{naText(site.routeZone)}</td>
                    <td className={styles.numCol}>
                      {/* เครื่องที่ยังใช้งานคือตัวเลขที่เจ้าหน้าที่สนใจ · รวมทั้งหมดไว้ในวงเล็บ */}
                      {site.activeAssetCount || 0}
                      {site.assetCount !== site.activeAssetCount ? ` / ${site.assetCount}` : ""}
                    </td>
                    <td>{window || <span className={styles.muted}>ไม่จำกัด</span>}</td>
                    <td>
                      <span className="ui-badge">{site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      {sort.sorted.length > 0 && (
        <Pager
          page={page}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={setPageSize}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

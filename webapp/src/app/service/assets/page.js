"use client";
// ── ทะเบียนเครื่องรวมทุกไซต์ (เฟส B · mig 0332) ──────────────────────────
//
// ⭐ **หน้าที่ยังไม่เคยมีในระบบ** — ก่อนหน้านี้ดูเครื่องได้เฉพาะเข้าไปในไซต์ทีละแห่ง
//   คำถามพื้นฐานที่สุดสองข้อจึงไม่มีจอไหนตอบได้เลย:
//     "เครื่อง OV08-0334 อยู่ไหน สถานะยังไง"  ·  "คลังเหลือ OV-08 กี่ตัว"
//
// ⭐ **หน้างานกับคลังอยู่หน้าเดียวกัน แยกด้วยตัวกรอง ไม่ใช่คนละเมนู** — ลิงก์ที่ส่ง
//   ให้กันจึงพาไปที่เดิมเสมอ และคนที่ไล่หาเครื่องไม่ต้องเดาว่าต้องเปิดเมนูไหน
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AirVent, Archive, Boxes, Building2, LayoutGrid, MapPin, Navigation, Plus, Search, Table2, Wrench } from "lucide-react";
import AssetReceiveModal from "@/components/service/AssetReceiveModal";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import Input from "@/components/ui/Input";
import SkeletonRows from "@/components/ui/Skeleton";
import StatCards from "@/components/database/StatCards";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService } from "@/lib/permissions";
import Pager from "@/components/ui/Pager";
import useStickyState from "@/lib/ui/useStickyState";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import {
  ASSET_CONDITION_LABELS, ASSET_STATUS_LABELS, isAssetOnSite,
} from "@/lib/service/sites";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { fmtDate, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import styles from "./page.module.css";

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function ServiceAssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [receiving, setReceiving] = useState(false);
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [toast, setToast] = useState(null);

  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(
    () => canEditService({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const [search, setSearch] = useStickyState("search", "");
  const [locationFilter, setLocationFilter] = useStickyState("locationFilter", EMPTY);
  const [modelFilter, setModelFilter] = useStickyState("modelFilter", EMPTY);
  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", EMPTY);
  const [conditionFilter, setConditionFilter] = useStickyState("conditionFilter", EMPTY);
  const [customerFilter, setCustomerFilter] = useStickyState("customerFilter", EMPTY);
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  /* ⚠️ กันคำตอบมาผิดลำดับ — หน้านี้มีตัวกรอง 5 มิติ คนกดรัว ๆ ได้ ถ้าไม่กัน
     คำตอบของรอบที่ตกไปแล้วจะเขียนทับเป็นตัวสุดท้าย โดยไม่มี error อะไรเลย */
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/service/assets");
      const data = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(data?.error || "โหลดทะเบียนเครื่องไม่สำเร็จ");
      setAssets(Array.isArray(data) ? data : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีเครื่อง" — โหลดพังกับยังไม่มีข้อมูล
      // หน้าตาเหมือนกันจนแยกไม่ออก
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดทะเบียนเครื่องไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  /* คลังโหลดตอนจะรับเครื่องเท่านั้น — ทะเบียนเครื่องไม่ต้องรู้จักคลังจนกว่าจะมีคนกด
     ⚠️ ต้องขอ `kind=warehouse` เพราะค่าตั้งต้นของ API ตัดคลังออกจากทะเบียนไซต์ */
  useEffect(() => {
    if (!receiving || warehouses.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/service/sites?kind=warehouse");
        const rows = await res.json().catch(() => null);
        if (!res.ok) throw new Error(rows?.error || "โหลดรายการคลังไม่สำเร็จ");
        setWarehouses(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [receiving, warehouses.length]);

  const runReceive = async (input) => {
    setReceiveBusy(true);
    try {
      const res = await apiFetch(`/api/service/sites/${input.siteId}/assets/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "รับเครื่องเข้าคลังไม่สำเร็จ");
      setReceiving(false);
      setToast({ kind: "success", msg: `รับเครื่องเข้าคลัง ${body.created} ตัวแล้ว` });
      await load({ background: true });
    } finally {
      setReceiveBusy(false);
    }
  };

  /* รหัสที่ถูกใช้ไปแล้ว — โมดัลใช้เดาเลขถัดไปและกันรหัสซ้ำตั้งแต่ก่อนกด
     ⚠️ เป็นชุดเดียวกับที่ API เอาไปตรวจซ้ำ — จอเดาไว้ก่อนเพื่อบอกเร็ว ไม่ใช่แทนด่าน */
  const knownSerials = useMemo(() => assets.map((a) => a.serial).filter(Boolean), [assets]);

  // ── ตัวเลขสรุป ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let onSite = 0; let inStock = 0; let broken = 0;
    for (const a of assets) {
      if (a.status === "in_stock") inStock += 1;
      else if (isAssetOnSite(a)) onSite += 1;
      if (a.condition === "broken") broken += 1;
    }
    return { total: assets.length, onSite, inStock, broken };
  }, [assets]);

  // ตัวเลือกตัวกรอง — ยกจากข้อมูลที่โหลดมาแล้ว ไม่ยิง API เพิ่ม
  const modelOptions = useMemo(() => {
    const set = new Set(assets.map((a) => a.model).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({ value: v, label: v }));
  }, [assets]);
  const customerOptions = useMemo(() => {
    const map = new Map();
    assets.forEach((a) => { if (a.customerId) map.set(a.customerId, a.customerName || a.customerId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "th")).map(([value, label]) => ({ value, label }));
  }, [assets]);

  const q = search.trim().toLocaleLowerCase("th");
  const filtered = useMemo(() => assets.filter((a) => {
    /* "อยู่ที่ไหน" อ่านจาก `siteKind` ของไซต์ที่เครื่องอยู่ ไม่ใช่เดาจากลูกค้า —
       บริษัทตัวเองมีทั้งไซต์ลูกค้าจริงและคลัง (mig 0332) */
    if (locationFilter.length) {
      const loc = a.siteKind === "warehouse" ? "stock" : "site";
      if (!locationFilter.includes(loc)) return false;
    }
    if (modelFilter.length && !modelFilter.includes(a.model)) return false;
    if (statusFilter.length && !statusFilter.includes(a.status)) return false;
    if (conditionFilter.length && !conditionFilter.includes(a.condition)) return false;
    if (customerFilter.length && !customerFilter.includes(a.customerId)) return false;
    if (q) {
      // ⭐ รหัสเครื่องเป็นตัวค้นหลัก — ช่องค้นของทะเบียนไซต์ไม่กิน serial เลย
      const hit = [a.serial, a.label, a.model, a.siteName, a.customerName, a.siteCode]
        .filter(Boolean).some((f) => String(f).toLocaleLowerCase("th").includes(q));
      if (!hit) return false;
    }
    return true;
  }), [assets, locationFilter, modelFilter, statusFilter, conditionFilter, customerFilter, q]);

  const sort = useSortableTable(filtered, {
    serial: (a) => a.serial || a.label || "",
    model: (a) => a.model || "",
    kind: (a) => ASSET_KIND_LABELS[a.kind] || a.kind || "",
    site: (a) => a.siteName || "",
    installedAt: (a) => a.installedAt || null,
    status: (a) => ASSET_STATUS_LABELS[a.status] || a.status || "",
  }, { key: "serial", dir: "asc" });

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      resetKey: `${q}|${locationFilter.join(",")}|${modelFilter.join(",")}|${statusFilter.join(",")}|${conditionFilter.join(",")}|${customerFilter.join(",")}|${sort.sortKey}|${sort.sortDir}`,
    });

  const filterCount = locationFilter.length + modelFilter.length + statusFilter.length
    + conditionFilter.length + customerFilter.length;

  const clearAll = () => {
    setLocationFilter([]); setModelFilter([]); setStatusFilter([]);
    setConditionFilter([]); setCustomerFilter([]);
  };

  const locationCell = (asset) => (asset.siteKind === "warehouse" ? (
    <span className={styles.stockLoc}><Archive size={14} aria-hidden="true" />{naText(asset.siteName)}</span>
  ) : (
    <>
      <Link href={`/service/sites/${asset.siteId}`} className={styles.siteLink}>{naText(asset.siteName)}</Link>
      <span className={styles.sub}>{naText(asset.customerName)}</span>
    </>
  ));

  const statusCell = (asset) => (
    <span className={styles.statePair}>
      <span className="ui-badge">{ASSET_STATUS_LABELS[asset.status] || asset.status}</span>
      {asset.condition === "broken" && <span className={styles.broken}>ชำรุด</span>}
    </span>
  );

  const toolbar = (
    <div className="toolbar">
      <div className={`search-glass ${styles.searchInput}`.trim()}>
        <Search size={15} aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัสเครื่อง รุ่น ไซต์ หรือลูกค้า"
          aria-label="ค้นหาเครื่อง"
        />
      </div>
      <FilterPopover
        count={filterCount}
        onClear={clearAll}
        groups={[
          {
            key: "location", label: "อยู่ที่ไหน", icon: MapPin,
            options: [
              { value: "site", label: "ที่ไซต์ลูกค้า" },
              { value: "stock", label: "อยู่ในคลัง" },
            ],
            selected: locationFilter, onChange: setLocationFilter,
          },
          {
            key: "model", label: "รุ่น", icon: Boxes,
            options: modelOptions, selected: modelFilter, onChange: setModelFilter,
          },
          {
            key: "status", label: "สถานะ", icon: Navigation,
            options: Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            selected: statusFilter, onChange: setStatusFilter,
          },
          {
            key: "condition", label: "สภาพ", icon: Wrench,
            options: Object.entries(ASSET_CONDITION_LABELS).map(([value, label]) => ({ value, label })),
            selected: conditionFilter, onChange: setConditionFilter,
          },
          {
            key: "customer", label: "ลูกค้า", icon: Building2,
            options: customerOptions, selected: customerFilter, onChange: setCustomerFilter,
          },
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
      icon={<AirVent size={20} aria-hidden="true" />}
      title="ทะเบียนเครื่อง"
      subtitle="เครื่องทุกตัวของฝ่ายบริการ — ที่หน้างานลูกค้าและที่อยู่ในคลัง"
      headerRight={(
        <>
          <span className="ui-badge">{assets.length} เครื่อง</span>
          {/* ⭐ จุดเกิดของเครื่อง — ไม่มีสิทธิ์แก้ = ไม่โชว์ปุ่ม (ไม่ใช่โชว์แล้วกดไม่ได้) */}
          {canEdit && (
            <Button tone="accent" onClick={() => setReceiving(true)}
              icon={<Plus size={15} aria-hidden="true" />}>
              รับเครื่องเข้าคลัง
            </Button>
          )}
        </>
      )}
      loading={loading}
      rail={(
        <StatCards
          items={[
            { label: "ทั้งหมด", value: stats.total },
            { label: "ที่ไซต์ลูกค้า", value: stats.onSite, tone: "success" },
            { label: "อยู่ในคลัง", value: stats.inStock },
            { label: "สภาพชำรุด", value: stats.broken, tone: stats.broken ? "danger" : undefined },
          ]}
        />
      )}
      toolbar={toolbar}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading || loadError ? (
        loading ? <SkeletonRows rows={6} /> : null
      ) : assets.length === 0 ? (
        <EmptyState icon={AirVent}>
          ยังไม่มีเครื่องในระบบ — เครื่องเกิดจากการรับเข้าคลัง หรือนำเข้าทะเบียนเก่า
        </EmptyState>
      ) : sort.sorted.length === 0 ? (
        /* ⚠️ ค้นไม่เจอ ≠ ไม่มีเครื่อง — ตารางว่างโดยไม่มีคำอธิบายอ่านเหมือนข้อมูลหาย */
        <EmptyState icon={Search}>
          {q ? `ไม่มีเครื่องที่ตรงกับ “${search.trim()}”` : "ไม่มีเครื่องที่ตรงกับตัวกรองที่เลือก"} — ลองเปลี่ยนคำค้นหรือล้างตัวกรอง
        </EmptyState>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pageRows.map((asset) => (
            <Link key={asset.id} href={`/service/assets/${asset.id}`} className={`${styles.card} clickable-row p-4 flex-col gap-2`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={styles.cardCode}>{naText(asset.serial || asset.label)}</div>
                  <div className={styles.sub}>{naText(asset.model)} · {ASSET_KIND_LABELS[asset.kind] || asset.kind}</div>
                </div>
                {statusCell(asset)}
              </div>
              <div className={styles.cardLoc}>{locationCell(asset)}</div>
              <div className={styles.cardFoot}>
                <span>{asset.installedAt ? `ติดตั้ง ${fmtDate(asset.installedAt)}` : "ยังไม่ได้ติดตั้ง"}</span>
                <span>{naText(asset.colour)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* ⚠️ `minWidth` — รหัสไซต์รูปใหม่ยาว 19 ตัว บวกคอลัมน์เครื่องอีกชุด
           ไม่ส่งค่านี้ตารางจะบีบจนรหัสตัดบรรทัดแทนที่จะเลื่อนแนวนอน */
        <TableShell minWidth={1080}>
          <table>
            <thead>
              <tr>
                <SortTh label="รหัสเครื่อง" sortKey="serial" sort={sort} />
                <SortTh label="รุ่น / สี" sortKey="model" sort={sort} />
                <SortTh label="ชนิด" sortKey="kind" sort={sort} />
                <SortTh label="อยู่ที่" sortKey="site" sort={sort} />
                <th>โซน / จุดติดตั้ง</th>
                <SortTh label="ติดตั้งเมื่อ" sortKey="installedAt" sort={sort} />
                <SortTh label="สถานะ / สภาพ" sortKey="status" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    {/* รหัสบน · ชื่อล่าง — ทรงเดียวกับทุกตารางในระบบ */}
                    <Link href={`/service/assets/${asset.id}`} className={`${styles.assetLink} mono`}>
                      {naText(asset.serial || asset.label)}
                    </Link>
                    {asset.serial && asset.label !== asset.serial
                      ? <span className={styles.sub}>{asset.label}</span> : null}
                  </td>
                  <td>{naText(asset.model)}<span className={styles.sub}>{naText(asset.colour)}</span></td>
                  <td>{ASSET_KIND_LABELS[asset.kind] || naText(asset.kind)}</td>
                  <td>{locationCell(asset)}</td>
                  <td>{naText(asset.spot)}</td>
                  <td>{asset.installedAt ? fmtDate(asset.installedAt) : naText(null)}</td>
                  <td>{statusCell(asset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      <AssetReceiveModal
        open={receiving}
        warehouses={warehouses}
        existingSerials={knownSerials}
        busy={receiveBusy}
        onClose={() => !receiveBusy && setReceiving(false)}
        onSubmit={runReceive}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />

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
    </Workspace>
  );
}

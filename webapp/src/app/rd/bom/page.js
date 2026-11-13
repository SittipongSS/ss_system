"use client";
// ── รอลง BOM — FG ที่ฝ่ายขายส่งมาให้ RD ลง BOM ใน Express (mig 0419 · มติเจ้าของ 03/11/2026) ──
//
// ⭐ **หน่วยของหน้านี้คือสินค้า** — สถานะอยู่บนแถวสินค้า (`bomStatus`) · ปุ่มส่ง/ดึงกลับของฝ่ายขายอยู่ที่หน้า FG
// ⭐ ใครใน RD ก็รับเรื่องได้ (มติข้อ 9) — คนกดรับ ชื่อติดแถว
// ⚠️ ไม่เขียนกติกาใหม่ — ทางเดินสถานะ/ข้อความเหตุมาจาก `lib/master/productBom.js` ตัวเดียวกับ API
// ⚠️ ด่านจอ = `canAccessRd` ตัวเดียวกับเมนู + API อ่าน + ฝั่ง RD ของ API เขียน
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Layers, Inbox, Printer, Search, Undo2 } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import Button from "@/components/ui/Button";
import ExcelDownloadButton from "@/components/ui/ExcelDownloadButton";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Segmented from "@/components/ui/Segmented";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";
import Input from "@/components/ui/Input";
import AccessDenied from "@/components/ui/AccessDenied";
import SkeletonRows from "@/components/ui/Skeleton";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, fmtNationalId, fmtNumber, naText } from "@/lib/format";
import { brandBoth } from "@/lib/master/brands";
import { branchValue } from "@/lib/master/thaiAddress";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment, useRole } from "@/lib/roleContext";
import { canAccessRd } from "@/lib/permissions";
import { accessState } from "@/lib/accessGate";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import useStickyState from "@/lib/ui/useStickyState";
import { allBucketsCollapsed, toggleBucketKey } from "@/lib/listGrouping";
import { keepVisibleSelection } from "@/lib/sales/salesOrderBundle";
import { BOM_CODE_MAX, BOM_NOTE_MAX } from "@/lib/master/productBom";
import { REJECTION_REASON_MAX } from "@/lib/master/approval";
import { BOM_BOARD_TABS, BOM_FORMULA_KIND_LABEL, bomBoardTotals, bomWaitingDays } from "@/lib/rd/bomBoard";
import { registryLabelParts, registryLabelSub } from "@/lib/master/registryLabel";
import {
  BOM_FILTER_DIMENSIONS, BOM_GROUP_OPTIONS, BOM_SORT_DEFAULT, BOM_SORT_DIR, BOM_SORT_OPTIONS, EMPTY_BOM_FILTERS,
  bomExportUrl, bomFilterCount, bomFilterOptions, bomOutputRows, bomViewOf,
} from "@/lib/rd/bomBoardView";
import { bomBoardPrintReport, bomTabLabel } from "@/lib/rd/bomBoardPrint";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import styles from "./page.module.css";


export default function RdBomPage() {
  const me = useCapUser();
  const department = useDepartment();
  const role = useRole();
  const allowed = useMemo(() => canAccessRd({ ...me, department }), [me, department]);
  const access = accessState(role, allowed);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("queued");
  /* มุมมองของตาราง (มติเจ้าของ 04/11: กรอง · จัดกลุ่ม · เรียง · เลือก แล้วพิมพ์/ดาวน์โหลดตามนั้น)
     ค้นหา/ตัวกรอง/กลุ่ม/เรียง จำไว้ตอนกดย้อนกลับมา (useStickyState) · ที่ติ๊กไม่จำ (งานของรอบนี้) */
  const [q, setQ] = useStickyState("q", "");
  const [filters, setFilters] = useStickyState("filters", EMPTY_BOM_FILTERS);
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [sortKey, setSortKey] = useStickyState("sortKey", BOM_SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", BOM_SORT_DIR[BOM_SORT_DEFAULT]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { mode: 'done' | 'return', row }
  const startRun = useLatestRun();

  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) { setLoading(true); setLoadError(""); }
    try {
      const data = await apiJson("/api/rd/bom-board", { cache: "no-store" });
      if (!isLatest()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setLoadError(e.message);
    }
    if (isLatest()) setLoading(false);
  }, [startRun]);

  useEffect(() => { if (access === "allowed") load(); }, [access, load]);
  useRevalidateOnFocus(load);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า "รอมาแล้ว" จะนับผิดไปหนึ่งวัน
  const today = businessDate();
  const totals = useMemo(() => bomBoardTotals(rows, { todayIso: today }), [rows, today]);
  /* ⭐ ตัวเดียวกับเอกสารพิมพ์และ route ไฟล์ Excel (`bomViewOf`) — แถวที่ตาเห็น = แถวที่ออก ลำดับเดียวกัน */
  const viewState = useMemo(() => ({ tab, q, filters, sortKey, sortDir, groupBy }), [tab, q, filters, sortKey, sortDir, groupBy]);
  const { rows: shown, groups } = useMemo(() => bomViewOf(rows, viewState), [rows, viewState]);
  const filterOptions = useMemo(() => bomFilterOptions(rows), [rows]);
  const filterCount = bomFilterCount(filters);
  const narrowed = Boolean(q.trim()) || filterCount > 0;
  const visibleIds = useMemo(() => shown.map((row) => row.id), [shown]);

  /* ที่ติ๊กไว้ — ตัดเฉพาะแถวที่หลุดจากจอ (สลับแท็บ/กรอง/รับเรื่องย้ายแท็บ) ไม่ล้างทั้งชุด · ไม่โหลดแถวที่มองไม่เห็น */
  useEffect(() => { setSelected((prev) => keepVisibleSelection(prev, visibleIds)); }, [visibleIds]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleRow = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* แถวที่พิมพ์/ส่งออก: ที่ติ๊กชนะ · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ (แท็บ + ค้นหา + ตัวกรอง) */
  const outputRows = useMemo(() => bomOutputRows(shown, selected), [shown, selected]);
  const exportLink = useMemo(
    () => bomExportUrl(viewState, { selectedIds: selected, visibleCount: shown.length }),
    [viewState, selected, shown.length],
  );
  const outputScope = selected.size
    ? `เฉพาะที่เลือก ${selected.size} รายการ`
    : `ทุกแถวที่แสดงอยู่ ${shown.length} รายการ (แท็บ "${bomTabLabel(tab)}"${narrowed ? " ตามคำค้น/ตัวกรอง" : ""})`;
  const setFilter = (key, values) => setFilters((prev) => ({ ...EMPTY_BOM_FILTERS, ...prev, [key]: values }));

  /* ยิงปุ่มหนึ่งครั้ง — ตีกลับ 409 (มีคนกดก่อน) = ดึงใหม่ · ⚠️ ล็อกปุ่มของแถวจนตารางใหม่มาถึง (กับดักเดียวกับหน้ารอใส่ราคา) */
  const post = async (row, json, okText) => {
    setBusyId(row.id);
    let saved = false;
    try {
      await apiJson(`/api/products/${row.id}/bom`, { method: "POST", json, fallbackError: "บันทึกสถานะ BOM ไม่สำเร็จ" });
      notifyToast(okText);
      saved = true;
    } catch (e) {
      notifyToast.error(e.message || "บันทึกสถานะ BOM ไม่สำเร็จ");
    }
    try { await load({ background: true }); } finally { setBusyId(null); }
    return saved;
  };

  const accept = async (row) => {
    const ok = await confirmAction({
      title: "รับเรื่องลง BOM",
      description: `รับ ${row.fgCode || "สินค้า"} ${naText(row.nameTh || row.nameEn)} มาลง BOM ใน Express`,
      detail: `ชื่อคุณจะติดแถวนี้ในฐานะคนรับเรื่อง · ฝ่ายขายดึงกลับไม่ได้แล้ว — ต้องแก้ ให้ตีกลับจากหน้านี้`,
      confirmLabel: "รับเรื่อง",
    });
    if (ok) await post(row, { action: "accept" }, "รับเรื่องแล้ว — ย้ายไปแท็บกำลังลง");
  };
  const reopen = async (row) => {
    const ok = await confirmAction({
      title: "ย้อนสถานะเป็นกำลังลง",
      description: `${row.fgCode || "สินค้า"} จะกลับไปอยู่แท็บกำลังลง`,
      detail: "รหัส BOM ที่ใส่ไว้ยังอยู่ · ฝ่ายขายยังแก้สูตร/ปริมาตรไม่ได้จนกว่าจะลงเสร็จหรือตีกลับ",
      confirmLabel: "ย้อนสถานะ",
    });
    if (ok) await post(row, { action: "reopen" }, "ย้อนเป็นกำลังลงแล้ว");
  };

  if (access === "loading") return <SkeletonRows rows={6} />;
  if (access === "denied") {
    return <AccessDenied icon={<Layers size={22} />} title="รอลง BOM" message="หน้านี้เป็นคิวงานของฝ่าย RD" />;
  }

  return (
    <Workspace
      icon={<Layers size={22} />}
      title="รอลง BOM"
      subtitle="FG ที่ฝ่ายขายส่งมาให้ลง BOM ใน Express — รับเรื่อง ลงเสร็จแล้วกดลงเสร็จ ฝ่ายขายเห็นสถานะที่หน้าสินค้า"
      /* ⭐ พิมพ์ + Excel อยู่หัวหน้า (มติเจ้าของ 04/11 — ที่เดียวกับปุ่มดาวน์โหลดของหน้ารายงาน)
         ⭐ ออก = ที่ติ๊กไว้ (ชนะทุกอย่าง) · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ · ลำดับ = ลำดับบนจอ (เรียง + จัดกลุ่ม)
         · ปุ่มบอกจำนวนเมื่อติ๊ก · ปิดตอนโหลด/โหลดพัง: ยังไม่รู้ว่าตารางมีอะไร เอกสารจะบอกว่า "ไม่มีรายการ" ทั้งที่อ่านไม่สำเร็จ */
      headerRight={(
        <>
          {/* เปลือกรายงานกลาง (A4 แนวนอน · หัวบริษัท · บันทึก PDF ได้) ตัวเดียวกับรายงาน /tax — ประกอบจากแถวบนจอ */}
          <Button
            variant="quiet"
            icon={<Printer size={15} aria-hidden="true" />}
            disabled={loading || !!loadError}
            title={`พิมพ์${outputScope} เป็นเอกสาร (บันทึกเป็น PDF ได้)`}
            onClick={() => openReportPrintWindow(bomBoardPrintReport(outputRows, { tab, todayIso: today }))}
          >
            {selected.size ? `พิมพ์ / PDF (${selected.size})` : "พิมพ์ / PDF"}
          </Button>
          {/* Excel: route กรอง/เรียง/จัดกลุ่มด้วย `bomViewOf` ตัวเดียวกับจอ + ส่ง id ที่ติ๊กไป · ปุ่มกลางตัวเดียวกับทะเบียนสูตร
              🪤 ลิงก์เป็น GET (proxy เปิด /api/rd แค่ทางอ่าน) ⇒ ติ๊กเยอะจนลิงก์ยาวเกิน = บอกทางออก ไม่ตัดแถวทิ้งเงียบ ๆ */}
          {exportLink.tooLong ? (
            <Button
              variant="quiet"
              disabled={loading || !!loadError}
              title="รายการที่เลือกยาวเกินไปสำหรับลิงก์ดาวน์โหลด"
              onClick={() => notifyToast.error(`เลือกไว้ ${selected.size} รายการ — ยาวเกินกว่าจะดาวน์โหลดทีเดียว · ล้างที่เลือกแล้วใช้ตัวกรอง/คำค้นแทน (ไม่เลือก = ได้ทุกแถวที่แสดงอยู่)`)}
            >
              {`ดาวน์โหลด Excel (${selected.size})`}
            </Button>
          ) : (
            <ExcelDownloadButton
              href={exportLink.url}
              fallbackName={`bom_${tab}.xlsx`}
              label={selected.size ? `ดาวน์โหลด Excel (${selected.size})` : undefined}
              disabled={loading || !!loadError}
              title={`ดาวน์โหลด${outputScope} เป็นไฟล์ Excel`}
              onError={(msg) => { if (msg) notifyToast.error(msg); }}
            />
          )}
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {/* ⚠️ 0 ก็เป็นข้อมูล — ซ่อนตอนว่างแยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {!loading && !loadError ? (
          <MetricStrip aria-label="ยอดงานลง BOM ของฝ่าย">
            <Metric label="รอรับเรื่อง" value={`${totals.queued} รายการ`} tone={totals.queued > 0 ? "warning" : undefined} />
            <Metric label="กำลังลง" value={`${totals.in_progress} รายการ`} />
            <Metric label="รอนานสุด" value={totals.maxDays != null ? `${totals.maxDays} วัน` : NA} note="นับจากวันที่ฝ่ายขายส่ง · เฉพาะที่ยังค้าง" />
            <Metric label="ตีกลับ รอฝ่ายขาย" value={`${totals.returned} รายการ`} />
          </MetricStrip>
        ) : null}

        <ListPanel
          icon={<Layers size={17} aria-hidden="true" />}
          title="รายการลง BOM"
          subtitle={sortKey !== BOM_SORT_DEFAULT
            ? `เรียงตาม${BOM_SORT_OPTIONS.find((o) => o.value === sortKey)?.label || ""} · ติ๊กเลือกแถวเพื่อพิมพ์/ดาวน์โหลดเฉพาะที่เลือก`
            : `${tab === "queued" || tab === "in_progress" ? "ส่งก่อนอยู่บนสุด" : "ขยับล่าสุดอยู่บนสุด"} · ติ๊กเลือกแถวเพื่อพิมพ์/ดาวน์โหลดเฉพาะที่เลือก`}
          /* กติกากลาง: กำลังเลือก = "เลือก x/y" · ไม่เลือก = จำนวนแถวที่เห็นหลังค้นหา/กรอง */
          count={loading || loadError ? null : selected.size ? `เลือก ${selected.size}/${shown.length} รายการ` : `${shown.length} รายการ`}
          loading={loading}
          toolbar={(
            /* แท็บสถานะก่อน แล้วตามลำดับกลางของ ViewMenus: ค้นหา · ตัวกรอง · จัดกลุ่ม · spacer · เรียง */
            <>
              <Segmented
                ariaLabel="สถานะลง BOM"
                value={tab}
                onChange={setTab}
                /* โหลดพัง = ไม่รู้ยอด ⇒ ไม่มีป้าย (เลข 0 จะอ่านว่า "ไม่มีงาน" ทั้งที่อ่านไม่สำเร็จ) */
                options={BOM_BOARD_TABS.map((t) => ({ value: t.key, label: t.label, count: loading || loadError ? null : totals[t.key] }))}
              />
              <div className="search-glass">
                <Search size={16} color="var(--text-3)" aria-hidden="true" />
                <input
                  autoComplete="off"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="FG / ลูกค้า / Tax ID / สูตร / กลิ่น / รหัส BOM"
                  aria-label="ค้นหารายการลง BOM"
                />
              </div>
              <FilterPopover
                count={filterCount}
                onClear={() => setFilters(EMPTY_BOM_FILTERS)}
                groups={BOM_FILTER_DIMENSIONS.map((dim) => ({
                  key: dim.key,
                  label: dim.label,
                  searchable: dim.searchable,
                  options: filterOptions[dim.key] || [],
                  selected: filters?.[dim.key] || [],
                  onChange: (values) => setFilter(dim.key, values),
                }))}
              />
              <GroupMenu
                title="จัดกลุ่มรายการ"
                value={groupBy}
                onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
                options={BOM_GROUP_OPTIONS}
              />
              {groups && groups.length > 0 ? (
                <CollapseAllButton
                  collapsed={allBucketsCollapsed(groups, collapsed)}
                  onToggle={() => setCollapsed(allBucketsCollapsed(groups, collapsed) ? new Set() : new Set(groups.map((g) => g.key)))}
                />
              ) : null}
              <span className="spacer" />
              {/* เปลี่ยนแบบเรียง = ตั้งทิศตั้งต้นของแบบนั้นให้ด้วย (กติกาเดียวกับรายงานยอดขาย) */}
              <SortMenu
                title="เรียงลำดับรายการ"
                value={sortKey}
                defaultValue={BOM_SORT_DEFAULT}
                onChange={(value) => { setSortKey(value); setSortDir(BOM_SORT_DIR[value] || "asc"); }}
                options={BOM_SORT_OPTIONS}
              />
              <SortDirButton dir={sortDir} onToggle={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} />
            </>
          )}
        >
          {loadError ? (
            <StatusNotice tone="error" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}>
              {loadError}
            </StatusNotice>
          ) : null}
          {!shown.length ? (
            loadError ? null : (
              <EmptyState plain icon={Inbox}>
                {narrowed ? "ไม่มีรายการที่ตรงกับคำค้น/ตัวกรองในแท็บนี้" : "ไม่มีรายการในแท็บนี้"}
              </EmptyState>
            )
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="w-9 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
                        aria-label="เลือกทุกแถวที่แสดงอยู่"
                      />
                    </th>
                    <th>สินค้า</th>
                    <th>ลูกค้า</th>
                    <th>สูตร / กลิ่น</th>
                    <th className="num">ปริมาตร</th>
                    <th>{tab === "done" ? "ลงเสร็จ" : tab === "returned" ? "ตีกลับ" : "ส่งโดย"}</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                {/* ไม่จัดกลุ่ม = ถังเดียวไม่มีหัว · จัดกลุ่ม = หนึ่ง <tbody> ต่อถัง หัวถังเป็น TableGroupRow (markup กลาง) */}
                {(groups || [{ key: "__all", label: null, items: shown }]).map((group) => {
                  const isCollapsed = Boolean(group.label) && collapsed.has(group.key);
                  return (
                    <tbody key={group.key}>
                      {group.label ? (
                        <TableGroupRow
                          colSpan={7}
                          label={group.label}
                          sub={group.sub}
                          badge={`${group.count} รายการ`}
                          collapsed={isCollapsed}
                          onToggle={() => setCollapsed((prev) => toggleBucketKey(prev, group.key))}
                        />
                      ) : null}
                      {!isCollapsed && group.items.map((row) => (
                        <BomRow
                          key={row.id}
                          row={row}
                          today={today}
                          busy={busyId === row.id}
                          selected={selected.has(row.id)}
                          onToggle={() => toggleRow(row.id)}
                          onAccept={() => accept(row)}
                          onDone={() => setDialog({ mode: "done", row })}
                          onReturn={() => setDialog({ mode: "return", row })}
                          onReopen={() => reopen(row)}
                        />
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </TableScroll>
          )}
        </ListPanel>
      </div>

      {dialog ? (
        <BomDialog
          dialog={dialog}
          busy={busyId === dialog.row.id}
          onClose={() => setDialog(null)}
          onSubmit={async (json, okText) => {
            const saved = await post(dialog.row, json, okText);
            if (saved) setDialog(null);
          }}
        />
      ) : null}
    </Workspace>
  );
}

/* หนึ่งแถว = FG หนึ่งตัว — รหัสบน·ชื่อล่าง (กติกาแสดง entity ของตาราง) · ลิงก์ไปหน้าสินค้าที่รหัส */
function BomRow({ row, today, busy, selected, onToggle, onAccept, onDone, onReturn, onReopen }) {
  const waited = bomWaitingDays(row, today);
  return (
    <tr>
      <td className="w-9 text-center">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`เลือก ${row.fgCode || naText(row.nameTh || row.nameEn)}`} />
      </td>
      <td>
        <Link className="linklike" href={`/database/products/${row.id}`}>{row.fgCode || NA}</Link>
        <div>{naText(row.nameTh)}</div>
        {row.nameEn ? <div className={styles.sub}>{row.nameEn}</div> : null}
        {row.round > 1 ? <div className={styles.sub}>ส่งรอบที่ {row.round}</div> : null}
      </td>
      {/* ลูกค้า — AR · ชื่อไทย/อังกฤษ · เลขผู้เสียภาษี + สาขา (รูปเดียวกับทะเบียนลูกค้า) · แบรนด์ของ FG (มติเจ้าของ 03/11) */}
      <td>
        <div className={styles.code}>{row.customerArCode || NA}</div>
        <div>{naText(row.customerNameTh)}</div>
        {row.customerNameEn ? <div className={styles.sub}>{row.customerNameEn}</div> : null}
        <div className={styles.sub}>Tax ID {row.customerTaxId ? fmtNationalId(row.customerTaxId) : NA} · สาขา {branchValue(row.customerBranchCode)}</div>
        {brandBoth(row.brandName, row.brandNameEn) ? <div className={styles.sub}>แบรนด์ {brandBoth(row.brandName, row.brandNameEn)}</div> : null}
      </td>
      <td>
        {/* ป้ายชนิดอยู่บนสุด — บอกก่อนว่าบรรทัดข้างล่างเป็นสูตร/กลิ่น/สูตรในชุด (เดิมอยู่ล่างสุด อ่านเหมือนเป็นของบรรทัดกลิ่น) */}
        {row.formula.items.length ? (
          <div className={styles.sub}>{BOM_FORMULA_KIND_LABEL[row.formula.kind]}{row.formula.kind === "set" ? ` (${row.formula.items.length})` : ""}</div>
        ) : null}
        {row.formula.items.length ? (
          <ul className={styles.items}>
            {row.formula.items.map((item, i) => (
              <li key={`${item.code || ""}-${i}`}>
                {/* PF · ชื่อ · วันที่ (มติเจ้าของ 13/11) — ไม่มีรหัสขึ้น "ไม่มี PF" ให้เห็นว่าขาด */}
                <span className={styles.code}>{registryLabelParts(item).code}</span>{` · ${registryLabelSub(item)}`}
                {item.note ? <div className={styles.sub}>{item.note}</div> : null}
                {/* ชื่อที่ลูกค้าเรียก **ของกลิ่น** (ถ้ามี · มติเจ้าของ 04/11) — ต่อจากบรรทัดกลิ่น รูปเดียวกับทะเบียนกลิ่น */}
                {item.tradeName ? <div className={styles.sub}>ลูกค้าเรียก “{item.tradeName}”</div> : null}
              </li>
            ))}
          </ul>
        ) : <span className={styles.dim}>ไม่มีสูตร</span>}
      </td>
      <td className="num">
        {row.volume != null ? `${fmtNumber(row.volume)}${row.volumeUnit ? ` ${row.volumeUnit}` : ""}` : NA}
        {row.saleUnit ? <div className={styles.sub}>ต่อ 1 {row.saleUnit}</div> : null}
      </td>
      <td>
        {row.status === "done" ? (
          <>
            <div>{row.bomCode ? <span className={styles.code}>{row.bomCode}</span> : <span className={styles.dim}>ไม่ระบุรหัส</span>}</div>
            <div className={styles.sub}>{[row.doneByName, row.doneAt ? fmtDate(row.doneAt) : null].filter(Boolean).join(" · ")}</div>
            {row.bomNote ? <div className={styles.sub}>{row.bomNote}</div> : null}
          </>
        ) : row.status === "returned" ? (
          <>
            <div>{naText(row.returnReason)}</div>
            <div className={styles.sub}>{[row.returnedByName, row.returnedAt ? fmtDate(row.returnedAt) : null].filter(Boolean).join(" · ")}</div>
          </>
        ) : (
          <>
            <div>{naText(row.sentByName)}</div>
            <div className={styles.sub}>
              {[row.sentAt ? fmtDate(row.sentAt) : null, waited != null ? `รอ ${waited} วัน` : null].filter(Boolean).join(" · ")}
            </div>
            {row.status === "in_progress" && row.acceptedByName ? <div className={styles.sub}>รับโดย {row.acceptedByName}</div> : null}
          </>
        )}
      </td>
      <td>
        <div className={styles.actions}>
          {row.status === "queued" ? (
            <>
              <Button size="sm" tone="primary" icon={<Check size={14} />} disabled={busy} onClick={onAccept}>รับเรื่อง</Button>
              <Button size="sm" variant="quiet" disabled={busy} onClick={onDone}>ลงเสร็จเลย</Button>
              <Button size="sm" variant="quiet" tone="danger" icon={<Undo2 size={14} />} disabled={busy} onClick={onReturn}>ตีกลับ</Button>
            </>
          ) : row.status === "in_progress" ? (
            <>
              <Button size="sm" tone="primary" icon={<Check size={14} />} disabled={busy} onClick={onDone}>ลงเสร็จ</Button>
              <Button size="sm" variant="quiet" tone="danger" icon={<Undo2 size={14} />} disabled={busy} onClick={onReturn}>ตีกลับ</Button>
            </>
          ) : row.status === "done" ? (
            <Button size="sm" variant="quiet" disabled={busy} onClick={onReopen}>ย้อนเป็นกำลังลง</Button>
          ) : <span className={styles.dim}>รอฝ่ายขายแก้แล้วส่งใหม่</span>}
        </div>
      </td>
    </tr>
  );
}

/* โมดัล "ลงเสร็จ" (รหัส BOM ไม่บังคับ · มติข้อ 7) และ "ตีกลับ" (เหตุผลบังคับ · มติข้อ 4) — บอกผลก่อนกดทั้งคู่ */
function BomDialog({ dialog, busy, onClose, onSubmit }) {
  const { mode, row } = dialog;
  const [code, setCode] = useState(row.bomCode || "");
  const [note, setNote] = useState(row.bomNote || "");
  const [reason, setReason] = useState("");
  const done = mode === "done";
  const subject = `${row.fgCode || "สินค้า"} ${naText(row.nameTh || row.nameEn)}`;
  return (
    <Modal open dismissible={!busy} onClose={onClose} size="sm" title={done ? "ลง BOM เสร็จ" : "ตีกลับเรื่องลง BOM"}>
      <p className={styles.hint}>{subject}</p>
      {done ? (
        <>
          <div className="form-group">
            <label htmlFor="bom-code">รหัส BOM ใน Express</label>
            <Input
              id="bom-code" mono value={code} maxLength={BOM_CODE_MAX}
              autoComplete="off" onChange={(e) => setCode(e.target.value)} disabled={busy}
            />
            <small className={styles.hint}>ไม่บังคับ — ใส่ไว้ให้ฝ่ายอื่นอ้างถึงได้จากหน้าสินค้า</small>
          </div>
          <div className="form-group">
            <label htmlFor="bom-note">หมายเหตุ</label>
            <Textarea id="bom-note" value={note} maxLength={BOM_NOTE_MAX} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </div>
          <p className={styles.hint}>
            กดแล้วฝ่ายขายคนที่ส่งได้กระดิ่ง · สูตร/กลิ่นและปริมาตรของสินค้านี้ล็อก (ต้องเปลี่ยน = สร้าง FG ใหม่ หรือแอดมิน) · กดผิดตัวย้อนได้จากแท็บลงเสร็จแล้ว
          </p>
        </>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="bom-reason">เหตุผลที่ตีกลับ <span className="text-[var(--red)]">*</span></label>
            <Textarea id="bom-reason" value={reason} maxLength={REJECTION_REASON_MAX} onChange={(e) => setReason(e.target.value)} disabled={busy} />
          </div>
          <p className={styles.hint}>
            กดแล้วแถวย้ายไปแท็บตีกลับ · ฝ่ายขายคนที่ส่งได้กระดิ่งพร้อมเหตุผล และแก้สูตร/ปริมาตรได้อีกครั้ง
          </p>
        </>
      )}
      <div className="action-bar">
        <Button variant="quiet" disabled={busy} onClick={onClose}>ยกเลิก</Button>
        {done ? (
          <Button tone="primary" disabled={busy} onClick={() => onSubmit({ action: "done", bomCode: code, note }, "บันทึกลง BOM เสร็จแล้ว")}>
            ลงเสร็จ
          </Button>
        ) : (
          <Button tone="danger" disabled={busy || !reason.trim()} onClick={() => onSubmit({ action: "return", reason }, "ตีกลับให้ฝ่ายขายแล้ว")}>
            ตีกลับ
          </Button>
        )}
      </div>
    </Modal>
  );
}

"use client";
// ── แท็บ "รอติดตั้ง" ของงานเข้าใหม่ TS (ขั้นเข้าติดตั้ง PR-3b · ม็อก B1/B1b · mig 0425) ─────────────────────────
//
// ⭐ ตารางชุดเดียวกับรายการอื่นในระบบ (มติเจ้าของ 09/11): ค้นหา · ตัวกรอง · จัดกลุ่ม + ย่อ/ขยาย · เรียง + ทิศ
//    ตั้งต้นจัดกลุ่มตามขั้น เรียงตามวันที่ต้องการ · จำค่ารายคน (useStickyState)
// ⭐ ทุกขั้นอยู่ในตารางเดียว คอลัมน์เดียวกัน · ชิปขั้นอยู่ทุกแถว (จัดกลุ่มแบบอื่นแล้วยังรู้ว่าแถวรออะไร)
// ⚠️ แถวมาจาก GET /api/service/install-queue (ขั้นคำนวณที่ server) — จอไม่คิดขั้นเอง
import { useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import { ListPanel } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import useStickyState from "@/lib/ui/useStickyState";
import { allBucketsCollapsed, toggleBucketKey } from "@/lib/listGrouping";
import { NA, fmtDate, naText } from "@/lib/format";
import {
  EMPTY_INSTALL_FILTERS, INSTALL_FILTER_DIMENSIONS, INSTALL_GROUP_DEFAULT, INSTALL_GROUP_OPTIONS,
  INSTALL_SORT_DEFAULT, INSTALL_SORT_DIR, INSTALL_SORT_OPTIONS,
  installFilterCount, installFilterOptions, installQueueViewOf,
} from "@/lib/service/installQueueTable";
import InstallConfirmModal from "./InstallConfirmModal";
import styles from "./InstallQueuePanel.module.css";

const STAGE_TONE = Object.freeze({
  awaiting_ts: "success", awaiting_deposit: "warning", awaiting_customer: "info", not_requested: "neutral", undecided: "neutral",
});

export default function InstallQueuePanel({ data, loading, error, onReload, technicians = [] }) {
  const [q, setQ] = useStickyState("installQ", "");
  const [filters, setFilters] = useStickyState("installFilters", EMPTY_INSTALL_FILTERS);
  const [groupBy, setGroupBy] = useStickyState("installGroupBy", INSTALL_GROUP_DEFAULT);
  const [sortKey, setSortKey] = useStickyState("installSortKey", INSTALL_SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("installSortDir", INSTALL_SORT_DIR[INSTALL_SORT_DEFAULT]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [confirmFor, setConfirmFor] = useState(null);

  const rows = useMemo(() => data?.rows || [], [data]);
  const todayIso = data?.todayIso || null;
  const { rows: shown, groups } = useMemo(
    () => installQueueViewOf(rows, { q, filters, groupBy, sortKey, sortDir, todayIso }),
    [rows, q, filters, groupBy, sortKey, sortDir, todayIso],
  );
  const options = useMemo(() => installFilterOptions(rows, { todayIso }), [rows, todayIso]);
  const filterCount = installFilterCount(filters);
  const narrowed = Boolean(String(q).trim()) || filterCount > 0;
  const setFilter = (key, values) => setFilters((prev) => ({ ...EMPTY_INSTALL_FILTERS, ...prev, [key]: values }));

  return (
    <>
      <ListPanel
        icon={<Wrench size={17} aria-hidden="true" />}
        title="รายการรอติดตั้ง"
        subtitle="คำขอคิวติดตั้งจากฝ่ายขาย — TS ยืนยันวันได้เมื่อมัดจำผ่าน แล้วส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า"
        count={loading || error ? null : `${shown.length} ไซต์`}
        loading={loading}
        toolbar={(
          <>
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ไซต์ · โซน · ใบสั่งขาย · ลูกค้า · ผู้ติดต่อ · ฝ่ายขาย"
                aria-label="ค้นหารายการรอติดตั้ง"
              />
            </div>
            <FilterPopover
              count={filterCount}
              onClear={() => setFilters(EMPTY_INSTALL_FILTERS)}
              groups={INSTALL_FILTER_DIMENSIONS.map((dim) => ({
                key: dim.key,
                label: dim.label,
                searchable: dim.searchable,
                options: options[dim.key] || [],
                selected: filters?.[dim.key] || [],
                onChange: (values) => setFilter(dim.key, values),
              }))}
            />
            <GroupMenu
              title="จัดกลุ่มรายการ"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={INSTALL_GROUP_OPTIONS}
            />
            {groups && groups.length > 0 ? (
              <CollapseAllButton
                collapsed={allBucketsCollapsed(groups, collapsed)}
                onToggle={() => setCollapsed(allBucketsCollapsed(groups, collapsed) ? new Set() : new Set(groups.map((g) => g.key)))}
              />
            ) : null}
            <span className="spacer" />
            <SortMenu
              title="เรียงลำดับรายการ"
              value={sortKey}
              defaultValue={INSTALL_SORT_DEFAULT}
              onChange={(value) => { setSortKey(value); setSortDir(INSTALL_SORT_DIR[value] || "asc"); }}
              options={INSTALL_SORT_OPTIONS}
            />
            <SortDirButton dir={sortDir} onToggle={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} />
          </>
        )}
      >
        <p className={styles.scope}>
          ก่อนติดตั้งมีข้อเดียว: มัดจำ &quot;ก่อนติดตั้ง&quot; ที่บัญชีรับรอง (SA → FN) · ใบที่ไม่มีงวดนี้ผ่านเลย · สัญญาทำหลังติดตั้ง
        </p>
        {error ? (
          <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={onReload}>ลองใหม่</Button>}>{error}</StatusNotice>
        ) : !shown.length ? (
          <EmptyState plain icon={Wrench}>{narrowed ? "ไม่มีรายการที่ตรงกับคำค้น/ตัวกรอง" : "ยังไม่มีคำขอคิวติดตั้ง"}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <th>ไซต์</th>
                  <th>ใบสั่งขาย / ลูกค้า</th>
                  <th>โซนที่ต้องติดตั้ง</th>
                  <th>วันที่ฝ่ายขายต้องการ</th>
                  <th>ผู้ติดต่อ</th>
                  <th>ขั้น · ก่อนติดตั้ง</th>
                  <th><span className="sr-only">การกระทำ</span></th>
                </tr>
              </thead>
              {(groups || [{ key: "__all", label: null, items: shown }]).map((group) => {
                const isCollapsed = Boolean(group.label) && collapsed.has(group.key);
                return (
                  <tbody key={group.key}>
                    {group.label ? (
                      <TableGroupRow
                        colSpan={7}
                        label={group.label}
                        sub={group.sub}
                        badge={`${group.count} ไซต์`}
                        collapsed={isCollapsed}
                        onToggle={() => setCollapsed((prev) => toggleBucketKey(prev, group.key))}
                      />
                    ) : null}
                    {!isCollapsed && group.items.map((row) => (
                      <InstallQueueRow key={row.key} row={row} canConfirm={Boolean(data?.canConfirm)} onConfirm={() => setConfirmFor(row)} />
                    ))}
                  </tbody>
                );
              })}
            </table>
          </TableScroll>
        )}
      </ListPanel>

      {confirmFor ? (
        <InstallConfirmModal
          row={confirmFor}
          technicians={technicians}
          todayIso={todayIso}
          onClose={() => setConfirmFor(null)}
          onSaved={async () => { setConfirmFor(null); await onReload?.(); }}
        />
      ) : null}
    </>
  );
}

function InstallQueueRow({ row, canConfirm, onConfirm }) {
  const timeText = row.requestedStartTime && row.requestedEndTime ? `${row.requestedStartTime}–${row.requestedEndTime}` : "ทั้งวัน";
  const blocked = row.deposit?.state === "blocked";
  return (
    <tr>
      <td><span className={styles.main}>{naText(row.siteCode)}</span><span className="cell-sub">{row.siteName || ""}</span></td>
      <td>
        <span className={styles.main}>{naText(row.orderNumber)}</span>
        <span className="cell-sub">{row.customerName || ""}</span>
        {row.requestedByName ? <span className="cell-sub">ฝ่ายขาย {row.requestedByName}</span> : null}
      </td>
      <td>
        <ul className={styles.zones}>
          {row.zones.map((z) => (
            <li key={z.zoneId}><b>{z.name || z.code}</b>{z.packsPerRound ? <span>{z.packsPerRound} แพ็ค/รอบ</span> : null}</li>
          ))}
        </ul>
      </td>
      <td>
        {row.requestedDate ? (
          <>
            <span className={styles.main}>{fmtDate(row.requestedDate)}</span>
            <span className="cell-sub">{timeText}</span>
            {row.requestedAt ? <span className="cell-sub">ขอคิว {fmtDate(row.requestedAt)}</span> : null}
          </>
        ) : <span className="cell-sub">{row.stage === "undecided" ? "ยังไม่ขอคิว" : NA}</span>}
        {row.visits.filter((v) => v.tsConfirmedAt).map((v) => (
          <span key={v.id} className="cell-sub">TS ยืนยัน {fmtDate(v.scheduledDate)}{v.startTime && v.endTime ? ` ${String(v.startTime).slice(0, 5)}–${String(v.endTime).slice(0, 5)}` : ""}</span>
        ))}
      </td>
      <td>
        <span className={styles.main}>{naText(row.contactName)}</span>
        {row.contactPhone ? <span className="cell-sub">{row.contactPhone}</span> : null}
        {row.note ? <span className="cell-sub">ฝากบอก: {row.note}</span> : null}
      </td>
      <td>
        <StatusBadge size="sm" dot tone={STAGE_TONE[row.stage] || "neutral"} label={row.stageLabel} />
        <span className={`cell-sub ${blocked ? styles.blocked : ""}`}>{row.deposit?.text || "มัดจำก่อนติดตั้งผ่านแล้ว"}</span>
      </td>
      <td className={styles.act}>
        {row.stage === "awaiting_ts" && canConfirm ? <Button size="sm" variant="primary" onClick={onConfirm}>ยืนยันวัน</Button> : null}
        {row.stage === "awaiting_deposit" ? <span className="cell-sub">รอมัดจำ · ยังยืนยันวันไม่ได้</span> : null}
        {["awaiting_customer", "not_requested", "undecided"].includes(row.stage) ? <span className="cell-sub">อ่านอย่างเดียว</span> : null}
      </td>
    </tr>
  );
}

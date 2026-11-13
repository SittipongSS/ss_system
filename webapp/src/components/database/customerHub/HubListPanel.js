"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ListPanel } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import DetailRow from "@/components/ui/DetailRow";
import Pager from "@/components/ui/Pager";
import useStickyState from "@/lib/ui/useStickyState";
import { usePagination } from "@/lib/usePagination";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { matchesQuery } from "@/lib/master/customerHub";
import { fmtMoney } from "@/lib/format";

/* ── แผงรายการของหน้าลูกค้าศูนย์รวม (มติเจ้าของ 13/11/2026 ข้อ 7 · docs/customer-hub-plan.md) ─────────────
 *
 * ⭐ ทรงเดียวกับทะเบียนใบเสนอราคา (ListPanel ต้นแบบ มติ 15/09): หัว → ค้นหา · ตัวกรอง · จัดกลุ่ม · เรียง → ตาราง → Pager
 * ⭐ **คำค้นช่องเดียวของทั้งหน้า** — `query` มาจากหน้าลูกค้า ทุกแท็บใช้ค่าเดียวกัน (ป้ายบนแท็บ = จำนวนที่เจอ)
 *    ช่องค้นอยู่ใน toolbar ของแผงที่เปิดอยู่ (ด่าน LP3: ตัวคุมรายการต้องอยู่ในแผง)
 * ⭐ ตัวกรอง/จัดกลุ่ม/เรียงต่อแท็บประกาศเป็นข้อมูล (filters · groups · sorts) — แท็บไม่ต้องประกอบเครื่องมือเอง
 * ⚠️ จัดกลุ่มแล้วไม่แบ่งหน้า (หัวกลุ่มถือยอดรวม · หั่นกลุ่มคาหน้าแล้วยอดไม่ตรงแถว) — กติกาเดียวกับทะเบียนใบเสนอราคา
 * ⚠️ แถวที่พาไปหน้าอื่น = DetailRow + <Link> ในเซลล์แรกด้วย `href` ตัวแปรเดียวกัน (ด่าน ROW_MIRROR)
 */
const NO_FILTER = [];

export default function HubListPanel({
  stateKey,
  icon,
  title,
  subtitle,
  unit,
  rows,
  query,
  onQuery,
  searchPlaceholder,
  textOf,
  filters = [],
  groups = null,
  sorts,
  columns,
  rowKey = (row) => row.id,
  rowHref = null,
  rowClassName = null,
  emptyText,
  extraToolbar = null,
  footer = null,
}) {
  const [selected, setSelected] = useStickyState(`${stateKey}:filters`, {});
  const [groupBy, setGroupBy] = useStickyState(`${stateKey}:group`, "none");
  const [sortKey, setSortKey] = useStickyState(`${stateKey}:sort`, sorts[0].value);
  const [sortDir, setSortDir] = useStickyState(`${stateKey}:dir`, sorts[0].dir);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const filterValues = (key) => selected?.[key] || NO_FILTER;
  const filterCount = filters.reduce((n, f) => n + filterValues(f.key).length, 0);

  const filtered = useMemo(() => (rows || []).filter((row) => {
    if (!matchesQuery(textOf(row), query)) return false;
    return filters.every((f) => {
      const values = selected?.[f.key] || NO_FILTER;
      return !values.length || f.test(row, values);
    });
  }), [rows, query, filters, selected, textOf]);

  const sorted = useMemo(() => {
    const sort = sorts.find((s) => s.value === sortKey) || sorts[0];
    const out = [...filtered].sort(sort.compare);
    return sortDir === "desc" ? out.reverse() : out;
  }, [filtered, sorts, sortKey, sortDir]);

  const groupOption = groups?.find((g) => g.value === groupBy && g.describe) || null;
  const buckets = useMemo(() => (groupOption ? bucketList(sorted, groupOption.describe) : null), [sorted, groupOption]);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = usePagination(sorted, {
    resetKey: `${query}|${JSON.stringify(selected)}|${sortKey}|${sortDir}`,
  });

  const renderRow = (row) => {
    const href = rowHref ? rowHref(row) : null;
    const extraClass = rowClassName ? rowClassName(row) : "";
    if (!href) {
      return (
        <tr key={rowKey(row)} className={`premium-row ${extraClass}`.trim()}>
          {columns.map((col) => <td key={col.key} className={col.className || undefined}>{col.render(row)}</td>)}
        </tr>
      );
    }
    return (
      <DetailRow key={rowKey(row)} href={href} className={`clickable-row ${extraClass}`.trim()}>
        {columns.map((col, index) => (
          <td key={col.key} className={col.className || undefined}>
            {index === 0 ? <Link prefetch={false} href={href} className="linklike">{col.render(row)}</Link> : col.render(row)}
          </td>
        ))}
      </DetailRow>
    );
  };

  return (
    <ListPanel
      icon={icon}
      title={title}
      subtitle={subtitle}
      count={`${filtered.length} ${unit}`}
      toolbar={(
        <>
          <div className="search-glass">
            <Search size={16} color="var(--text-3)" aria-hidden="true" />
            <input
              autoComplete="off"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`ค้นหา${title}`}
            />
          </div>
          {extraToolbar}
          {filters.length > 0 && (
            <FilterPopover
              count={filterCount}
              onClear={() => setSelected({})}
              groups={filters.map((f) => ({
                key: f.key,
                label: f.label,
                icon: f.icon,
                options: f.options,
                selected: filterValues(f.key),
                onChange: (values) => setSelected((cur) => ({ ...(cur || {}), [f.key]: values })),
              }))}
            />
          )}
          {groups && (
            <GroupMenu
              title={`จัดกลุ่ม${title}`}
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={groups.map(({ value, label }) => ({ value, label }))}
            />
          )}
          {!!buckets?.length && (
            <CollapseAllButton
              collapsed={allCollapsed}
              onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((b) => b.key)))}
            />
          )}
          <div className="spacer" />
          <SortMenu
            title={`เรียง${title}`}
            value={sortKey}
            defaultValue={sorts[0].value}
            onChange={(value) => { setSortKey(value); setSortDir(sorts.find((s) => s.value === value)?.dir || "asc"); }}
            options={sorts.map(({ value, label }) => ({ value, label }))}
          />
          <SortDirButton dir={sortDir} onToggle={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} />
        </>
      )}
    >
      <TableScroll surface="auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{columns.map((col) => <th key={col.key} className={col.className || undefined}>{col.label}</th>)}</tr>
          </thead>
          <tbody>
            {buckets ? buckets.map((bucket) => {
              const bucketCollapsed = collapsed.has(bucket.key);
              return (
                <Fragment key={bucket.key}>
                  <TableGroupRow
                    colSpan={columns.length}
                    label={bucket.label}
                    sub={bucket.sub}
                    badge={`${bucket.count} ${unit}`}
                    total={groupOption.weighted ? fmtMoney(bucket.total) : null}
                    totalTitle={groupOption.weighted || undefined}
                    collapsed={bucketCollapsed}
                    onToggle={() => setCollapsed((cur) => toggleBucketKey(cur, bucket.key))}
                  />
                  {!bucketCollapsed && bucket.items.map(renderRow)}
                </Fragment>
              );
            }) : pageRows.map(renderRow)}
            {!filtered.length && (
              /* มีของแต่กรองแล้วว่าง ≠ ยังไม่มีของ — คำว่า "ยังไม่มี" ตอนตัวกรองค้างอ่านเหมือนข้อมูลหาย */
              <tr>
                <td colSpan={columns.length} className="text-center text-[var(--text-3)] py-7">
                  {(rows || []).length ? "ไม่พบรายการที่ตรงกับคำค้น/ตัวกรอง" : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
      {footer}
      {filtered.length > 0 && !buckets && (
        <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
      )}
    </ListPanel>
  );
}

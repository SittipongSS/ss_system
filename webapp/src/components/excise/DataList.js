"use client";
import { useEffect, useMemo, useState } from "react";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import EmptyState from "@/components/ui/EmptyState";
import Pager from "./Pager";

// Core responsive list used by both excise tracks AND the reports page.
//   • landscape → sortable .premium-table
//   • portrait  → card grid (caller-supplied `card(row)`; falls back to columns)
//   • client-side pagination (pageSize) so big datasets don't bloat the DOM
//
// columns: [{ key, label, align?, render?(row), sortValue?(row), thStyle?, tdStyle? }]
//   render  — cell content (defaults to row[key])
//   sortValue — comparison value (defaults to row[key]); pass null to disable sort
export default function DataList({
  columns,
  rows,
  rowKey,
  onRowClick,
  card,
  pageSize = 50,
  initialSort = null,
  empty = "ไม่มีข้อมูล",
  emptyIcon,
}) {
  const [view] = useResponsiveView({ portrait: "card", landscape: "table" });

  const accessors = useMemo(() => {
    const acc = {};
    for (const c of columns) {
      if (c.sortValue === null) continue;
      acc[c.key] = c.sortValue || ((r) => r[c.key]);
    }
    return acc;
  }, [columns]);

  const sort = useSortableTable(rows, accessors, initialSort);

  const [page, setPage] = useState(1);
  const total = sort.sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp page when the result set shrinks (e.g. filter/search changes).
  useEffect(() => { setPage(1); }, [rows, sort.sortKey, sort.sortDir]);
  const start = (page - 1) * pageSize;
  const pageRows = sort.sorted.slice(start, start + pageSize);

  if (!rows.length) {
    return <EmptyState icon={emptyIcon}>{empty}</EmptyState>;
  }

  const key = (r, i) => (rowKey ? rowKey(r, i) : i);

  return (
    <div>
      {view === "table" ? (
        <div className="prod-table-wrap">
          <table className="premium-table">
            <thead>
              <tr>
                {columns.map((c) =>
                  accessors[c.key] ? (
                    <SortTh key={c.key} label={c.label} sortKey={c.key} sort={sort} style={c.thStyle} />
                  ) : (
                    <th key={c.key} style={c.thStyle}>{c.label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr
                  key={key(r, i)}
                  className={onRowClick ? "clickable-row" : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align, ...c.tdStyle }}>
                      {c.render ? c.render(r) : r[c.key] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pageRows.map((r, i) => (
            <div
              key={key(r, i)}
              className="glass-panel"
              style={{ padding: 14, cursor: onRowClick ? "pointer" : undefined }}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {card ? card(r) : (
                <div className="flex flex-col gap-1">
                  {columns.map((c) => (
                    <div key={c.key} className="flex justify-between gap-3" style={{ fontSize: 13 }}>
                      <span style={{ color: "var(--text-3)" }}>{c.label}</span>
                      <span>{c.render ? c.render(r) : r[c.key] ?? "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

/**
 * Generic client-side table sorting.
 *
 * @param {Array} rows      ข้อมูลดิบของตาราง
 * @param {Object} accessors map ของ columnKey -> (row) => ค่าที่ใช้เปรียบเทียบ
 *                           (คืน string | number | Date | null ได้)
 * @param {Object} [initial] ค่าเริ่มต้น { key, dir } (dir = "asc" | "desc")
 * @returns {{ sorted: Array, sortKey: string|null, sortDir: string, sortBy: (key)=>void }}
 */
export function useSortableTable(rows, accessors, initial = null) {
  const [sortKey, setSortKey] = useState(initial?.key ?? null);
  const [sortDir, setSortDir] = useState(initial?.dir ?? "asc");

  const sortBy = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const get = sortKey ? accessors[sortKey] : null;
    if (!get) return rows;
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      // ค่าว่างไว้ท้ายเสมอ (ไม่ว่าจะเรียงทางไหน)
      const ea = va == null || va === "";
      const eb = vb == null || vb === "";
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      if (va instanceof Date && vb instanceof Date) return (va - vb) * mul;
      return String(va).localeCompare(String(vb), "th", { numeric: true }) * mul;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, sortBy };
}

/**
 * หัวตารางที่กดเรียงได้ ใช้คู่กับ useSortableTable
 * <SortTh label="ชื่อ" sortKey="name" sort={sort} />
 */
export function SortTh({ label, sortKey: key, sort, className, style, children, ...rest }) {
  const active = sort.sortKey === key;
  const icon = active
    ? (sort.sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;
  return (
    <th
      onClick={() => sort.sortBy(key)}
      className={className}
      style={{ cursor: "pointer", userSelect: "none", ...style }}
      {...rest}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        {label ?? children} {icon}
      </span>
    </th>
  );
}

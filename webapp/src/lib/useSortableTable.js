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
 *
 * 📅 2026-09-02 — ย้าย `onClick` ออกจาก `<th>` ลง `<button>` ข้างในเซลล์ และให้ `<th>`
 *    ถือ `aria-sort` เอง (ก่อนหน้านี้ทั้งรีโปไม่มี `aria-sort` สักจุด: ตารางเรียงอยู่จริง
 *    แต่ไม่มีอะไรบอกตัวอ่านหน้าจอว่าเรียงตามคอลัมน์ไหน ทิศทางอะไร)
 *    เกณฑ์: WCAG 2.1.1 Keyboard (A) · 1.3.1 Info and Relationships (A) · 4.1.2 Name, Role, Value (A)
 *
 * ⭐ ทรงบังคับ (UI_DESIGN_SYSTEM.md §a11y): ตัวกดคือ <button type="button"> ที่อยู่
 *    **ข้างใน** <th> · <th> ถือ aria-sort เอง
 * 🚫 **ห้ามยัด role="button" + tabIndex ลงบน <th>** — มันทับ role="columnheader" ทิ้ง
 *    screen reader จะไม่รู้ว่าเซลล์นี้เป็นหัวคอลัมน์ (ตก 1.3.1 ทั้งที่ผ่าน 2.1.1)
 *    ด่าน ROLE_ON_TABLE_TAG_CAP ใน scripts/audit-ui.mjs ดักไว้อีกชั้น
 * 🪤 สไตล์ปุ่มอยู่ที่คลาส .th-sort / .th-sort-label ใน globals.css ไม่ใช่ inline style
 *    เพราะปุ่มต้อง **สืบทอดตัวอักษรจาก <th> ทีละพร็อพ** (`font: inherit` ล้าง
 *    font-variant-numeric ของตารางทิ้ง — ดูคอมเมนต์ที่ .th-sort)
 */
export function SortTh({ label, sortKey: key, sort, className, style, children, ...rest }) {
  const active = sort.sortKey === key;
  const icon = active
    ? (sort.sortDir === "asc"
        ? <ArrowUp size={12} aria-hidden="true" />
        : <ArrowDown size={12} aria-hidden="true" />)
    : <ArrowUpDown size={11} aria-hidden="true" style={{ opacity: 0.35 }} />;
  return (
    <th
      className={className}
      style={style}
      /* ⚠️ `{...rest}` ต้องอยู่ **ก่อน** aria-sort เสมอ — ไม่ใช่ความสวยงามของลำดับ:
         JSX ให้ตัวหลังชนะ ⇒ ถ้า spread อยู่ท้าย ผู้เรียกที่เผลอส่ง aria-sort เข้ามา
         จะทับสัญญาของ primitive ทิ้งได้เงียบ ๆ · วางไว้ก่อนแล้ว aria-sort ชนะเสมอ
         (className/style ถูก destructure ออกไปแล้ว จึงไม่ชนกันเอง)
         🔒 ผู้เรียกที่ส่ง role/tabIndex/onClick เข้ามายังทับได้อยู่ (สามตัวนั้น
            primitive ไม่ได้ตั้งไว้) — ด่านที่กันคือ sortableHeader.test.mjs
            เพราะ ROLE_ON_TABLE_TAG_CAP มองไม่เห็น: <SortTh role> เป็นคอมโพเนนต์
            ไม่ใช่แท็ก th ตัวเล็กที่ด่านนั้นสแกน */
      {...rest}
      /* คอลัมน์ที่เรียงได้ต้องประกาศ aria-sort **ทุกตัว** — ตัวที่ไม่ได้เรียงอยู่คือ "none"
         ส่วนหัวที่เรียงไม่ได้ต้อง **ไม่มีแอตทริบิวต์นี้เลย** จึงประกาศที่ SortTh ที่เดียว
         (หัวธรรมดายังเป็น <th> เปล่าเหมือนเดิม ห้ามไปเติม none ให้มัน)
         "ไม่ใช่ none ได้ตัวเดียวต่อตาราง" มาจากรูปของข้อมูล ไม่ใช่วินัยคนเขียน:
         sort.sortKey เป็นสตริงตัวเดียวใน useState ไม่ใช่รายการ */
      aria-sort={active ? (sort.sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="th-sort" onClick={() => sort.sortBy(key)}>
        <span className="th-sort-label">{label ?? children} {icon}</span>
      </button>
    </th>
  );
}

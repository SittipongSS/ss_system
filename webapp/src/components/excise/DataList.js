"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DetailRow from "@/components/ui/DetailRow";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination, DEFAULT_PAGE_SIZE } from "@/lib/usePagination";
import EmptyState from "@/components/ui/EmptyState";
import Pager from "@/components/ui/Pager";
import { TableScroll } from "@/components/ui/Table";
import { naText } from "@/lib/format";

// Core responsive list used by both excise tracks AND the reports page.
//   • landscape → sortable .premium-table
//   • portrait  → card grid (caller-supplied `card(row)`; falls back to columns)
//   • client-side pagination (pageSize) so big datasets don't bloat the DOM
//
// columns: [{ key, label, align?, render?(row), sortValue?(row), thStyle?, tdStyle?, link? }]
//   render  — cell content (defaults to row[key])
//   sortValue — comparison value (defaults to row[key]); pass null to disable sort
//   link    — เซลล์นี้คือ **ทางเข้าของคีย์บอร์ด** ⇒ ห่อเนื้อในด้วย <Link href={rowHref(row)}>
//
/* ── แถวพาไปหน้ารายละเอียด: `rowHref` ไม่ใช่ `onRowClick` (2026-09-02) ───────────
   เดิมแถวเป็น `<tr>` ที่แขวน handler ไว้เรียก `onRowClick(r)` ซึ่งเมาส์กดได้แต่
   **คีย์บอร์ดเข้าไม่ถึง**
   (WCAG 2.1.1) · ทั้งสองผู้เรียกมีแค่เช็กบ็อกซ์เลือกใบในเซลล์แรก ซึ่งเป็นคนละปลายทาง
   กับ "เปิดรายละเอียด" จึงยกเว้นให้แถวไม่ได้ (ดูหัวไฟล์ ui/DetailRow.js)
   ⇒ แถวเป็น <DetailRow> (คลิกทั้งแถว = ทางลัดของเมาส์) และคอลัมน์ที่ประกาศ `link: true`
   ห่อเนื้อในด้วย <Link href ตัวเดียวกับแถว> = ทางเข้าจริงของคีย์บอร์ด
   🪤 <Link> ต้องเขียนอยู่ **ในไฟล์นี้** ห้ามยกไปให้ผู้เรียก render เอง — ด่าน ROW_MIRROR
      อ่าน JSX ในไฟล์เดียวกับ <DetailRow> เท่านั้น (hard-zero)
   🪤 คอลัมน์ที่ `link: true` ต้องคาย `<strong>` เป็นลูกตรงของลิงก์เป็นบรรทัดแรก —
      `.linklike-block` ถอดเส้นใต้ออกจากตัวลิงก์แล้วขีดเฉพาะ `> strong` (ไม่งั้นได้
      "ลิงก์ที่ดูเหมือนข้อความธรรมดา" ซึ่งเป็นบั๊กที่ .linklike แก้ไปแล้ว) */
export default function DataList({
  columns,
  rows,
  rowKey,
  rowHref,
  card,
  pageSize = DEFAULT_PAGE_SIZE,
  initialSort = null,
  empty = "ไม่มีข้อมูล",
  emptyIcon,
}) {
  const [view] = useResponsiveView({ portrait: "card", landscape: "table" });
  const router = useRouter();

  const accessors = useMemo(() => {
    const acc = {};
    for (const c of columns) {
      if (c.sortValue === null) continue;
      acc[c.key] = c.sortValue || ((r) => r[c.key]);
    }
    return acc;
  }, [columns]);

  const sort = useSortableTable(rows, accessors, initialSort);

  const { page, setPage, pageSize: size, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      defaultSize: pageSize,
      resetKey: `${rows.length}|${sort.sortKey}|${sort.sortDir}`,
    });

  if (!rows.length) {
    return <EmptyState icon={emptyIcon}>{empty}</EmptyState>;
  }

  const key = (r, i) => (rowKey ? rowKey(r, i) : i);
  /* 🪤 เซลล์ของสองทรงแถว (<DetailRow> / <tr> เปล่า) ต้องเขียนซ้ำกันคนละก้อน **โดยจำใจ**
     — ด่าน ROW_MIRROR อ่าน JSX ที่อยู่ *ระหว่าง* `<DetailRow` กับ `</DetailRow>` ตรง ๆ
     ยกเซลล์ออกไปเป็นตัวแปรเมื่อไหร่ ด่านมองไม่เห็น <Link> แล้วฟ้องทั้งไฟล์ทันที
     (ข้อจำกัดข้อ 2 ที่ประกาศไว้เหนือ `const ROW_PRIMITIVE` ใน scripts/audit-ui.mjs)
     ⇒ ยกออกได้แค่ *ค่าสไตล์* ไม่ใช่ตัว JSX — ซึ่งก็ทำให้ไม่ต้องก๊อป `style={{…}}`
     ขึ้นมาอีกจุดด้วย (ratchet inlineStyle) */
  const tdStyleOf = (c) => ({ textAlign: c.align, ...c.tdStyle });

  return (
    <div>
      {view === "table" ? (
        <TableScroll className="prod-table-wrap" family="list">
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
              {pageRows.map((r, i) => (rowHref ? (
                <DetailRow key={key(r, i)} href={rowHref(r)} className="clickable-row">
                  {columns.map((c) => (
                    <td key={c.key} style={tdStyleOf(c)}>
                      {c.link ? (
                        /* prefetch={false}: ลิสต์ยาว — กัน RSC prefetch ต่อแถว */
                        <Link prefetch={false} href={rowHref(r)} className="linklike linklike-block" title="เปิดรายละเอียด">
                          {c.render ? c.render(r) : naText(r[c.key])}
                        </Link>
                      ) : (c.render ? c.render(r) : naText(r[c.key]))}
                    </td>
                  ))}
                </DetailRow>
              ) : (
                <tr key={key(r, i)}>
                  {columns.map((c) => (
                    <td key={c.key} style={tdStyleOf(c)}>
                      {c.render ? c.render(r) : naText(r[c.key])}
                    </td>
                  ))}
                </tr>
              )))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <div className="flex flex-col gap-3">
          {pageRows.map((r, i) => (
            /* 🪤 การ์ด (จอแนวตั้ง) ยังเป็น `<div onClick>` ที่คีย์บอร์ดเข้าไม่ถึง —
               อยู่ในกลุ่ม <div> ของด่าน A11Y_KEYBOARD_CAP ที่ยังไม่ถึงคิว รอบนี้แก้
               เฉพาะฝั่งตาราง · ทางแก้ของมันคือห่อการ์ดด้วย <Link> ทั้งใบ ซึ่งต้องไล่ดู
               ก่อนว่า `card(row)` ของผู้เรียกมีปุ่ม/ลิงก์ซ้อนอยู่ข้างในไหม */
            <div
              key={key(r, i)}
              className="glass-panel"
              style={{ padding: 14, cursor: rowHref ? "pointer" : undefined }}
              onClick={rowHref ? () => router.push(rowHref(r)) : undefined}
            >
              {card ? card(r) : (
                <div className="flex flex-col gap-1">
                  {columns.map((c) => (
                    <div key={c.key} className="flex justify-between gap-3" style={{ fontSize: "var(--fs-7)" }}>
                      <span style={{ color: "var(--text-3)" }}>{c.label}</span>
                      <span>{c.render ? c.render(r) : naText(r[c.key])}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pager
        page={page}
        pageCount={pageCount}
        total={total}
        onPage={setPage}
        pageSize={size}
        onPageSize={setPageSize}
      />
    </div>
  );
}

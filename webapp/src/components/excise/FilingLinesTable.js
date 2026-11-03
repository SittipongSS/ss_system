"use client";
/* ── ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบบตารางเดิม (มติเจ้าของ 03/11 V20–V23 · แผนรื้อสรรพสามิต หมวด 12.13) ──
   หัวเดือน (M.10/69 = เดือนที่ยื่นทำจ่าย · ยังไม่ยื่น = เดือนนี้ · V24) → หัวกลุ่ม = งานหนึ่งงาน (SO · ลูกค้า · ขั้น · ด่าน) → แถวละสินค้า
   คอลัมน์ตามตารางเดิม ยกเว้น "สถานะขึ้นทะเบียน" (ขาดทะเบียน = เริ่มยื่นไม่ได้ ⇒ บอกที่หัวกลุ่ม · V20) + "ภาษี" ที่ระบบคิดให้
   ⚠️ ข้อมูลรายการมาจาก `/api/tax/orders/table` ติดกับแถวงานด้วยคีย์ — แถวที่ยังไม่มีรายการ (กำลังมา · โหลดไม่ขึ้น) บอกเหตุในกลุ่ม */
import Link from "next/link";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/excise/StatusBadge";
import { fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { filingDateText, filingMonthLabel } from "@/lib/excise/raFilingMonth";
import styles from "./FilingLinesTable.module.css";

const COLUMNS = ["วันที่ส่งของ", "แบรนด์", "รายการ", "ปริมาณ", "จำนวน", "ราคาขายปลีกก่อน VAT", "ภาษี", "สถานะชำระ"];

/** ก้อนรายเดือน (ใหม่สุดก่อน · ยังไม่รู้เดือนไปท้าย) · ในเดือนเรียงตามวันที่ส่งของ (ไม่มีวันไปท้าย) */
function monthBuckets(rows) {
  const sorted = [...rows].sort((a, b) => String(b.detail?.month || "").localeCompare(String(a.detail?.month || ""))
    || String(a.detail?.deliveryDate || "9999").localeCompare(String(b.detail?.deliveryDate || "9999"))
    || String(a.salesOrderNumber || "").localeCompare(String(b.salesOrderNumber || "")));
  const buckets = [];
  for (const row of sorted) {
    const month = row.detail?.month || null;
    const last = buckets.at(-1);
    if (last && last.month === month) last.rows.push(row);
    else buckets.push({ month, rows: [row] });
  }
  return buckets;
}

export default function FilingLinesTable({ rows = [], selected, onToggle, allChecked, onToggleAll, selectable = true, detailLoading = false, empty }) {
  if (!rows.length) return <div className={styles.empty}>{empty}</div>;
  const span = COLUMNS.length + (selectable ? 1 : 0);
  return (
    <TableScroll surface="embedded" minWidth={980}>
      <table className={`w-full text-sm ${styles.table}`}>
        <thead>
          <tr>
            {selectable ? (
              <th className={styles.check}>
                <input type="checkbox" checked={allChecked} onChange={onToggleAll} aria-label="เลือกทุกงานที่พิมพ์ใบสรุปได้" />
              </th>
            ) : null}
            {COLUMNS.map((label, index) => <th key={label} className={index >= 4 && index <= 6 ? styles.num : undefined}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {monthBuckets(rows).map((bucket) => {
            const label = filingMonthLabel(bucket.month);
            return [
              <tr key={`month:${bucket.month || "none"}`} className={styles.monthRow}>
                <td colSpan={span}>
                  <strong>รายการชำระภาษีสรรพสามิต {label.short}</strong>
                  <span>{label.long} · {bucket.rows.length} งาน</span>
                </td>
              </tr>,
              ...bucket.rows.flatMap((row) => {
                const lines = row.detail?.lines || [];
                const blockers = row.detail?.blockers || [];
                const header = (
                  <tr key={`group:${row.key}`} className={styles.groupRow}>
                    {selectable ? (
                      <td className={styles.check}>
                        {row.printKey ? (
                          <input type="checkbox" checked={selected.has(row.key)} onChange={() => onToggle(row.key)} aria-label={`เลือก ${row.salesOrderNumber}`} />
                        ) : null}
                      </td>
                    ) : null}
                    <td colSpan={COLUMNS.length}>
                      <div className={styles.groupHead}>
                        <Link href={row.href} className="linklike"><strong className="mono">{row.salesOrderNumber}</strong></Link>
                        <span className={styles.customer}>{naText(row.customerName)}</span>
                        {row.subtitle ? <span className={styles.sub}>{row.subtitle}</span> : null}
                        <StatusBadge status={row.status} />
                        {blockers.map((text) => <span key={text} className={styles.blocker}>{text}</span>)}
                      </div>
                    </td>
                  </tr>
                );
                if (!lines.length) {
                  return [header, (
                    <tr key={`none:${row.key}`} className={styles.noLines}>
                      {selectable ? <td /> : null}
                      <td colSpan={COLUMNS.length}>
                        {row.detail ? "ใบนี้ไม่มีรายการค่าสรรพสามิต" : detailLoading ? "กำลังโหลดรายการสินค้า…" : "ยังโหลดรายการสินค้าไม่ได้"}
                      </td>
                    </tr>
                  )];
                }
                return [header, ...lines.map((line, index) => (
                  <tr key={`line:${row.key}:${index}`}>
                    {selectable ? <td /> : null}
                    <td className={styles.date}>{filingDateText(row.detail) || NA}</td>
                    <td>{line.brand || NA}</td>
                    <td title={line.fgCode || undefined}>{line.description || line.fgCode || NA}</td>
                    <td>{line.volume || NA}</td>
                    <td className={`${styles.num} mono`}>{fmtNumber(line.quantity)}</td>
                    <td className={`${styles.num} mono`}>{line.retailPriceExVat == null ? NA : fmtMoney(line.retailPriceExVat)}</td>
                    <td className={`${styles.num} mono ${styles.tax}`}>{fmtMoney(line.totalTax)}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))];
              }),
            ];
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

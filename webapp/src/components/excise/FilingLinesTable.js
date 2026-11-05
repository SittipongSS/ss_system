"use client";
/* ── ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบบตารางเดิม (มติเจ้าของ 03/11 V20–V23 · แผนรื้อสรรพสามิต หมวด 12.13) ──
   หัวเดือน (M.10/69 = เดือนที่ยื่นทำจ่าย · ยังไม่ยื่น = เดือนนี้ · V24) → หัวกลุ่ม = งานหนึ่งงาน (SO · ลูกค้า · ขั้น · ด่าน) → แถวละสินค้า
   คอลัมน์ตามตารางเดิม ยกเว้น "สถานะขึ้นทะเบียน" (ขาดทะเบียน = เริ่มยื่นไม่ได้ ⇒ บอกที่หัวกลุ่ม · V20) + ภาษีที่ระบบคิดให้
   ⭐ รีเช็คภาษี (เจ้าของ 03/11): ราคาขายปลีกรวม VAT · ถอด VAT · ภาษี/หน่วย · ภาษีรวม — ภาษี/หน่วยที่ไม่ตรงสูตร 8.8% ขึ้นเตือนในช่อง
   ⚠️ ข้อมูลรายการมาจาก `/api/tax/orders/table` ติดกับแถวงานด้วยคีย์ — แถวที่ยังไม่มีรายการ (กำลังมา · โหลดไม่ขึ้น) บอกเหตุในกลุ่ม
   ⭐ ย่อ/ขยาย (เจ้าของ 04/11): หัวเดือน = ย่อทั้งเดือน + ปุ่ม "ย่อทุกงาน/ขยายทุกงาน" ของเดือนนั้น · หัวงาน = ย่อรายการของงานนั้น
      — ปุ่มลูกศรแยกจากลิงก์เลข SO (ปุ่มซ้อนลิงก์ไม่ได้) · ป้ายสถานะ/ด่านอยู่บนหัวเสมอ · จำในจอเท่านั้น (เปิดหน้าใหม่ = กางหมด)
   ⭐ ยอดรวม (เจ้าของ 04/11): หัวเดือน = "n งาน · n รายการ · ภาษีรวม ฿…" ของแถวที่ผ่านตัวกรอง (ยอดที่ RA ยื่นชำระเดือนนั้น) ·
      หัวงาน = "n รายการ · ภาษีรวม ฿…" โชว์ตลอด (ไม่ใช่เฉพาะตอนย่อ) · ไม่รวมจำนวนชิ้น (หลายขนาดปนกัน รวมแล้วไม่มีความหมาย)
   ⭐ จัดแนว (เจ้าของ 05/11 "align ข้อมูล จะได้ตรวจง่าย"): หัวเดือน/หัวงานลงคอลัมน์เดียวกับแถวสินค้า — จำนวนรายการใต้ "ภาษี/หน่วย" ·
      ยอดรวมใต้ "ภาษีรวม" (ชิดขวา ทรงเดียวกับยอดของแถว) · ป้ายสถานะใต้ "สถานะชำระ" · ฝั่งซ้ายของหัวงานเป็นกริดคอลัมน์ตายตัว
      (ลูกศร · เลข SO · ลูกค้า · ขั้น/ด่าน) ⇒ เลข SO/ลูกค้า/ขั้นของทุกงานตั้งตรงกันลงมา ไม่ไหลต่อกันเป็นประโยค */
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/excise/StatusBadge";
import { fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { filingDateText, filingLinesTaxTotal, filingMonthLabel, filingMonthTotals } from "@/lib/excise/raFilingMonth";
import { raFilingMonthBuckets } from "@/lib/excise/raFilingExport";
import styles from "./FilingLinesTable.module.css";

const COLUMNS = ["วันที่ส่งของ", "แบรนด์", "รายการ", "ปริมาณ", "จำนวน", "ราคาขายปลีก (รวม VAT)", "ราคาขายปลีกก่อน VAT", "ภาษี/หน่วย (8.8%)", "ภาษีรวม", "สถานะชำระ"];
/* หัวงาน/หัวเดือน: ข้อความกินคอลัมน์ก่อน "ภาษี/หน่วย" · สามคอลัมน์ท้ายเป็นช่องของตัวเอง (จำนวนรายการ · ยอดรวม · สถานะ/ปุ่ม) */
const LEAD_SPAN = COLUMNS.indexOf("ภาษี/หน่วย (8.8%)");
const NUMERIC = new Set(["จำนวน", "ราคาขายปลีก (รวม VAT)", "ราคาขายปลีกก่อน VAT", "ภาษี/หน่วย (8.8%)", "ภาษีรวม"]);
const money = (value) => (value == null ? NA : fmtMoney(value));

/* ก้อนรายเดือน + ลำดับในเดือน = ตัวเดียวกับไฟล์ Excel/พิมพ์ (`raFilingMonthBuckets`) — จอกับไฟล์เรียงเหมือนกันเสมอ */
const monthBuckets = raFilingMonthBuckets;

export default function FilingLinesTable({ rows = [], selected, onToggle, allChecked, onToggleAll, selectable = true, detailLoading = false, empty }) {
  /* คีย์ที่ย่อไว้ — `month:<YYYY-MM>` (ทั้งเดือน) · คีย์งาน (รายการของงานนั้น) */
  const [collapsed, setCollapsed] = useState(() => new Set());
  if (!rows.length) return <div className={styles.empty}>{empty}</div>;
  const toggle = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const setMany = (keys, close) => setCollapsed((prev) => {
    const next = new Set(prev);
    for (const key of keys) {
      if (close) next.add(key);
      else next.delete(key);
    }
    return next;
  });
  return (
    <TableScroll surface="embedded" minWidth={1180}>
      <table className={`w-full text-sm ${styles.table}`}>
        <thead>
          <tr>
            {selectable ? (
              <th className={styles.check}>
                <input type="checkbox" checked={allChecked} onChange={onToggleAll} aria-label="เลือกทุกงานบนจอ (พิมพ์ / Excel)" />
              </th>
            ) : null}
            {COLUMNS.map((label) => <th key={label} className={NUMERIC.has(label) ? styles.num : undefined}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {monthBuckets(rows).map((bucket) => {
            const label = filingMonthLabel(bucket.month);
            const monthKey = `month:${bucket.month || "none"}`;
            const monthOpen = !collapsed.has(monthKey);
            const groupKeys = bucket.rows.map((row) => row.key);
            const allGroupsClosed = groupKeys.every((key) => collapsed.has(key));
            const totals = filingMonthTotals(bucket.rows);
            const hasTotals = totals.jobs > totals.missing;
            const monthHeader = (
              <tr key={monthKey} className={styles.monthRow}>
                <td colSpan={LEAD_SPAN + (selectable ? 1 : 0)}>
                  <div className={styles.monthHead}>
                    <button type="button" className={styles.toggle} aria-expanded={monthOpen} onClick={() => toggle(monthKey)}>
                      <ChevronRight className={styles.chev} data-open={monthOpen || undefined} size={16} aria-hidden="true" />
                      <strong>รายการชำระภาษีสรรพสามิต {label.short}</strong>
                    </button>
                    <span className={styles.monthMeta}>
                      {label.long} · {fmtNumber(totals.jobs)} งาน
                      {totals.missing && hasTotals ? <> (ไม่รวม {fmtNumber(totals.missing)} งานที่ยังไม่มีรายการ)</> : null}
                    </span>
                  </div>
                </td>
                <td className={`${styles.num} ${styles.monthMeta}`}>{hasTotals ? `${fmtNumber(totals.lines)} รายการ` : null}</td>
                <td className={`${styles.num} mono`}>
                  {hasTotals ? <strong className={styles.monthTotal}>{fmtMoney(totals.totalTax)}</strong> : null}
                </td>
                <td>
                  {monthOpen ? (
                    <button type="button" className={styles.bulk} onClick={() => setMany(groupKeys, !allGroupsClosed)}>
                      {allGroupsClosed ? "ขยายทุกงาน" : "ย่อทุกงาน"}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
            if (!monthOpen) return [monthHeader];
            return [
              monthHeader,
              ...bucket.rows.flatMap((row) => {
                const lines = row.detail?.lines || [];
                const blockers = row.detail?.blockers || [];
                const open = !collapsed.has(row.key);
                const header = (
                  <tr key={`group:${row.key}`} className={styles.groupRow}>
                    {selectable ? (
                      <td className={styles.check}>
                        <input type="checkbox" checked={selected.has(row.key)} onChange={() => onToggle(row.key)} aria-label={`เลือก ${row.salesOrderNumber}`} />
                      </td>
                    ) : null}
                    <td colSpan={LEAD_SPAN}>
                      <div className={styles.groupHead}>
                        <button
                          type="button"
                          className={styles.toggle}
                          aria-expanded={open}
                          aria-label={`${open ? "ย่อ" : "ขยาย"}รายการ ${row.salesOrderNumber}`}
                          onClick={() => toggle(row.key)}
                        >
                          <ChevronRight className={styles.chev} data-open={open || undefined} size={16} aria-hidden="true" />
                        </button>
                        <Link href={row.href} className="linklike"><strong className="mono">{row.salesOrderNumber}</strong></Link>
                        <span className={styles.customer} title={row.customerName || undefined}>{naText(row.customerName)}</span>
                        <span className={styles.stage}>
                          {row.subtitle ? <span className={styles.sub}>{row.subtitle}</span> : null}
                          {blockers.map((text) => <span key={text} className={styles.blocker}>{text}</span>)}
                        </span>
                      </div>
                    </td>
                    <td className={`${styles.num} ${styles.sub}`}>{lines.length ? `${fmtNumber(lines.length)} รายการ` : null}</td>
                    <td className={`${styles.num} mono ${styles.tax}`}>{lines.length ? fmtMoney(filingLinesTaxTotal(lines)) : null}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                );
                if (!open) return [header];
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
                    <td className={`${styles.num} mono`}>{money(line.retailPriceIncVat)}</td>
                    <td className={`${styles.num} mono`}>{money(line.retailPriceExVat)}</td>
                    <td className={`${styles.num} mono`}>
                      {money(line.taxPerUnit)}
                      {line.taxCheck && !line.taxCheck.ok ? (
                        <span className={styles.taxMismatch} role="note">ไม่ตรงสูตร · 8.8% = {fmtMoney(line.taxCheck.expected)}</span>
                      ) : null}
                    </td>
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

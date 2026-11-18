"use client";
import { History } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import { fmtDateTime, fmtMoneyOrDash, naText } from "@/lib/format";
import styles from "./productHub.module.css";

/* ── หน้าสินค้าศูนย์รวม · ประวัติราคา ในแท็บราคาและต้นทุน (งวด S3 · มติเจ้าของ 18/11/2026 ข้อ 6) ──────────────
 *
 * อ่าน `product_price_history` ที่ระบบเขียนทุกครั้งที่แก้ราคามาตลอด (ไม่เคยมีจอไหนอ่าน)
 * ⚠️ **ช่องที่ผู้ดูไม่มีสิทธิ์ถูกตัดที่ server แล้ว** (productPriceHistory · ราคาผลิต = ผู้เห็นราคาทุน · ภาษี = ผู้เห็นระบบภาษี)
 *    ⇒ จอวาดคอลัมน์ตามช่องที่มีในแถว ไม่ตัดสินสิทธิ์เอง
 * ⭐ ช่องที่เปลี่ยน = "ก่อน → หลัง" · ช่องที่ไม่เปลี่ยน = ค่าหลังแบบจาง (อ่านราคาทั้งชุด ณ ตอนนั้นได้ในแถวเดียว)
 */
const COLUMNS = [
  { key: "costPrice", label: (unit) => `ราคาผลิต/${unit}` },
  { key: "retailPriceIncVat", label: () => "ราคาขายปลีก รวม VAT" },
  { key: "exciseTax", label: (unit) => `ภาษีสรรพสามิต/${unit}` },
  { key: "localTax", label: (unit) => `ภาษีท้องถิ่น/${unit}` },
];

function Cell({ row, field }) {
  const before = row[`${field}Before`];
  const after = row[`${field}After`];
  if (!row.changed.includes(field)) return <span className={styles.priceSame}>{fmtMoneyOrDash(after)}</span>;
  return (
    <span className={styles.priceChange}>
      <span className={styles.priceBefore}>{fmtMoneyOrDash(before)}</span>
      <span aria-hidden="true">→</span>
      <strong>{fmtMoneyOrDash(after)}</strong>
    </span>
  );
}

export default function ProductPriceHistory({ rows = [], unit = "" }) {
  const columns = COLUMNS.filter((c) => rows.some((r) => `${c.key}After` in r));
  return (
    <DetailCard icon={History} eyebrow="HISTORY" title="ประวัติราคา" meta="บันทึกทุกครั้งที่แก้ราคาของสินค้านี้ · ใหม่ไปเก่า">
      {rows.length ? (
        <TableScroll family="list" surface="embedded">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ผู้แก้</th>
                {columns.map((c) => <th key={c.key} className="num">{c.label(unit)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(row.createdAt)}</td>
                  <td>{naText(row.changedByName)}</td>
                  {columns.map((c) => <td key={c.key} className="num"><Cell row={row} field={c.key} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <EmptyState plain>ยังไม่มีการแก้ราคาที่คุณดูได้</EmptyState>
      )}
    </DetailCard>
  );
}

"use client";
// ── ตาราง "ใบที่อาจซ้ำ" ของใบสั่งขายย้อนหลัง — ตัวเดียวของขั้น ④ (ผู้คีย์) และการ์ดหน้าใบ (ผู้อนุมัติ) · มติ 26/09 ─────────────
// ⭐ สองจอพูดคอลัมน์เดียวกัน คำเดียวกัน (`historicalMatchedOnText`) — ต่างแค่โหมด:
//   · `keyer`  = รายการของแผนตอนคีย์: เลขที่ใบ · สถานะ · วันเริ่มสัญญา · ตรงกันที่ · เลขเอกสารเดิม
//   · `review` = บันทึกของผู้คีย์เทียบตอนนี้: + สถานะตอนยืนยัน / สถานะตอนนี้ · แถวที่พบหลังผู้คีย์ยืนยันติดป้าย
// ⭐ เลขที่ใบเปิดแท็บใหม่ — ยามงานยังไม่บันทึกข้ามลิงก์ target=_blank ⇒ ฟอร์ม/หน้าต่างอนุมัติไม่หาย
// ⚠️ ไม่มี style={{…}} (งบ inlineStyle ของโมดูลขายเต็มเพดาน — audit:ui)
import { ExternalLink } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import { naText, NA } from "@/lib/format";
import { historicalDuplicateDate, historicalMatchedOnText } from "@/lib/sales/historicalDuplicates";
import { historicalStatusCopy } from "@/lib/sales/historicalOrderCopy";
import styles from "./HistoricalDuplicateTable.module.css";

const orderHref = (id) => `/sa/sales-orders/${encodeURIComponent(id)}`;

function OrderLink({ id, orderNumber }) {
  return (
    <a className={styles.link} href={orderHref(id)} target="_blank" rel="noopener noreferrer">
      {naText(orderNumber || id)} <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

/**
 * @param rows  keyer: `plan.duplicates` (`{ id, orderNumber, orderDate, status, refs, matchedOn }`)
 *              review: แถวของ `historicalDuplicateReviewView` (`{ id, orderNumber, orderDate, matched, refs, statusAtAck, statusNow, isNew, gone }`)
 */
export default function HistoricalDuplicateTable({ rows = [], mode = "keyer", newTag = "พบหลังผู้คีย์ยืนยัน" }) {
  const list = Array.isArray(rows) ? rows : [];
  const review = mode === "review";
  return (
    <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={review ? 720 : 560}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>เลขที่ใบ</th>
            {review ? <><th>สถานะตอนยืนยัน</th><th>สถานะตอนนี้</th></> : <th>สถานะ</th>}
            <th>วันเริ่มสัญญา</th>
            <th>ตรงกันที่</th>
            <th>เลขเอกสารเดิม</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.id}>
              <td>
                <OrderLink id={row.id} orderNumber={row.orderNumber} />
                {review && row.isNew ? <span className={styles.tagNew}>{newTag}</span> : null}
              </td>
              {review ? (
                <>
                  <td className={styles.muted}>{row.statusAtAck || NA}</td>
                  <td data-gone={row.gone ? "yes" : undefined} className={styles.now}>{row.statusNow || "ยังไม่รู้"}</td>
                </>
              ) : (
                <td>{historicalStatusCopy(row.status).label}</td>
              )}
              <td>{historicalDuplicateDate(row.orderDate)}</td>
              <td>{review ? row.matched : historicalMatchedOnText(row.matchedOn)}</td>
              <td>{naText((row.refs || []).join(" · "))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

"use client";
import { FileBadge, Images, ListChecks, Target } from "lucide-react";
import StatusNotice from "@/components/ui/StatusNotice";
import EmptyState from "@/components/ui/EmptyState";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, naText } from "@/lib/format";
import { liveIllustrationNote } from "@/lib/sales/productSpecDocView";
import styles from "./SpecDocumentContent.module.css";

/**
 * เนื้อเอกสาร FM-SA-04 แบบอ่านอย่างเดียว — การ์ดสี่ใบ (เนื้อ · checklist · เอกสารที่ขอได้ · ภาพประกอบ)
 *
 * ⭐ ยกออกมาจากหน้าเอกสาร (`/sales-planning/spec-documents/[id]`) ตอนทำหน้า "ออกเอกสาร" แบบใบเสนอราคา
 *    (มติเจ้าของ 23/09/2569) — สองหน้าวาดเนื้อชุดเดียวกัน · ก๊อปแยกเมื่อไร หน้าออกเอกสารจะโชว์คนละอย่างกับ
 *    ที่หน้าเอกสารโชว์หลังบันทึก (โรคเดียวกับฟอร์มสร้าง/แก้ที่ AGENTS.md ห้าม)
 * ⚠️ ไม่ใช่กระดาษ — กระดาษจริงอยู่ที่ปุ่มพิมพ์/ดูตัวอย่าง · ที่นี่ให้คนอ่านสิ่งที่กำลังจะเซ็น/บันทึกได้โดยไม่ต้องเปิดแท็บใหม่
 * ⚠️ ข้อมูลมาจาก `docContentSummary` เท่านั้น (ภาพนิ่ง หรือสเปคสด) — คอมโพเนนต์นี้ไม่ตัดสินว่าเนื้อมาจากไหน
 *    ผู้เรียกบอกผ่าน `meta` (บรรทัดใต้หัวการ์ดแรก)
 *
 * @param summary ผล `docContentSummary(...)` · `null` = ยังอ่านสเปคไม่เสร็จ (หรืออ่านไม่ขึ้น — ดู `liveError`)
 * @param meta บรรทัดใต้หัวการ์ด "เนื้อเอกสาร" — บอกว่าเนื้อบนจอมาจากไหน
 * @param liveError ข้อความเมื่ออ่านสเปคไม่ขึ้น
 * @param liveIllustrationCount จำนวนภาพในหน้าสเปคของสินค้าตอนนี้ — ใช้เฉพาะเนื้อแบบสด (ยังไม่มีภาพนิ่ง) · `null` = ผู้เรียกไม่ได้นับมา
 */
export default function SpecDocumentContent({ summary, meta, liveError = "", liveIllustrationCount = null }) {
  if (!summary) {
    return (
      <DetailCard icon={Target} eyebrow="CONTENT" title="เนื้อเอกสาร" meta={meta}>
        {liveError
          ? <StatusNotice tone="error">{liveError}</StatusNotice>
          : <EmptyState plain><strong>กำลังอ่านสเปคของสินค้า…</strong></EmptyState>}
      </DetailCard>
    );
  }
  const order = summary.order;
  return (
    <>
      <DetailCard icon={Target} eyebrow="CONTENT" title="เนื้อเอกสาร" meta={meta}>
        {order ? (
          <dl className={styles.facts}>
            <div><dt>ใบสั่งขาย</dt><dd>{naText(order.orderNumber)}</dd></div>
            <div><dt>ลูกค้า</dt><dd>{naText(order.customerName)}</dd></div>
            {/* ชื่อเดียวกับแถวบนกระดาษ "จำนวนผลิต (Quantity)" (มติ 22/09 — ย้ายจากกล่องอ้างอิงไป Product Overview) */}
            <div><dt>จำนวนผลิต</dt><dd>{order.qty === null ? naText(null) : `${order.qty}${order.unit ? ` ${order.unit}` : ""}`}</dd></div>
            <div><dt>กำหนดส่ง</dt><dd>{order.deliveryDueDate ? fmtDate(order.deliveryDueDate) : naText(null)}</dd></div>
            {/* ชื่อเดียวกับแถวบนกระดาษ — "Contact for Sales" ย้ายขึ้นกล่องอ้างอิงแล้ว (มติ 22/09) */}
            <div><dt>ผู้ติดต่อฝ่ายขาย</dt><dd>{naText(order.dealOwnerName)}</dd></div>
          </dl>
        ) : null}
        <dl className={styles.facts}>
          {summary.fields.map((field) => (
            <div key={field.key}><dt>{field.label}</dt><dd>{naText(field.value)}</dd></div>
          ))}
        </dl>
      </DetailCard>

      <DetailCard icon={ListChecks} eyebrow="CHECKLIST PROJECT" title={`Checklist บรรจุภัณฑ์ (${summary.items.length})`}>
        {summary.items.length ? (
          <TableScroll family="list" surface="embedded">
            <table>
              <thead>
                <tr>
                  <th className={`num ${styles.colNo}`}>ลำดับ</th>
                  <th className={styles.colItem}>สิ่งที่ต้องเตรียม</th>
                  <th>รายละเอียด</th>
                  <th className={styles.colBy}>ผู้จัดเตรียม</th>
                  <th className={styles.colNote}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((row) => (
                  <tr key={`${row.no}-${row.label}`}>
                    <td className="num">{row.no}</td>
                    <td>{naText(row.label)}</td>
                    <td>{naText(row.detail)}</td>
                    <td>{naText(row.preparedBy)}</td>
                    <td>{naText(row.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : <EmptyState plain><strong>ไม่มีแถว checklist</strong></EmptyState>}
      </DetailCard>

      <DetailCard icon={FileBadge} eyebrow="CERTIFICATION & DOCUMENTS" title="เอกสารที่ขอได้">
        {summary.certifications.length ? (
          <TableScroll family="list" surface="embedded">
            <table>
              <thead>
                <tr>
                  <th className={styles.colCert}>เอกสาร</th>
                  <th className={styles.colCertStatus}>สถานะ</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {summary.certifications.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td>{naText(row.label)}</td>
                    <td>{row.statusLabel}</td>
                    <td>{naText(row.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : <EmptyState plain><strong>ไม่มีรายการเอกสาร</strong></EmptyState>}
      </DetailCard>

      {/* ⚠️ **เนื้อแบบสดยังไม่มีภาพนิ่ง** (ถ่ายตอนยื่น) ⇒ ที่นี่บอกได้แค่ "กี่ภาพ" ไม่ใช่คำบรรยายรายภาพ ·
          ผู้เรียกที่เป็นจุดตัดสินใจ (หน้าออกเอกสาร) ต้องส่ง `liveIllustrationCount` มา ไม่งั้นคนกดบันทึกไม่เคยรู้ว่า
          จะมีภาพอะไรไปอยู่บนเอกสาร (🐞 ผลตรวจสด 23/09: จอเงียบ แต่กระดาษร่างพิมพ์ 5 ภาพ) */}
      <DetailCard icon={Images} eyebrow="ILLUSTRATIONS" title="ภาพประกอบ"
        meta={summary.illustrations
          ? `${summary.illustrations.length} ภาพในภาพนิ่ง`
          : `ภาพชุดปัจจุบัน${liveIllustrationCount === null ? "" : ` ${liveIllustrationCount} ภาพ`}อยู่ที่หน้าสเปคของสินค้า — ถ่ายลงเอกสารตอนยื่น`}>
        {summary.illustrations?.length ? (
          <ol className={styles.captionList}>
            {summary.illustrations.map((row) => (
              <li key={row.no}>{row.caption || <span className={styles.sub}>ไม่มีคำบรรยาย ({naText(row.fileName)})</span>}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.sub}>
            {summary.illustrations ? "ภาพนิ่งนี้ไม่มีภาพประกอบ" : liveIllustrationNote(liveIllustrationCount)}
          </p>
        )}
      </DetailCard>
    </>
  );
}

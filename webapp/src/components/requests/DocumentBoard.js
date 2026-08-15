"use client";
// ── ตารางสรุปเอกสารที่ขอ (P5) ───────────────────────────────────────────
//
// ⭐ **ของกลางสองฝ่าย** — RD ขอ IFRA/COA/MSDS · บัญชีขอใบวางบิล/ใบกำกับ · คนละชุด
// คำศัพท์ แต่กฎของบรรทัดเหมือนกันทุกข้อ ⇒ ตารางเดียว
//
// ⭐ **ก้าวถัดไปอยู่ติดแถว** (มติผู้ใช้ 2026-08-09: "ก้าวถัดไปก็อยากในรายการ
// เอกสารเลย") — คอลัมน์ที่สามรับปุ่มผ่าน `renderStep` จากหัวข้อ (RowStepActions
// ก้อนเดียวกับแถบท้ายเธรด — **ย้าย ไม่ก๊อป**: ใบที่ตารางนี้มีปุ่ม แถบท้ายเธรด
// ของแถวพวกนี้ต้องเงียบ ดูเปลือก /requests/[id])
//
// ⚠️ การนับอยู่ที่ `lib/requests/documentBoard.js` ทั้งหมด ไม่ประกอบใน JSX
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDate } from "@/lib/format";
import styles from "./briefBoard.module.css";

export default function DocumentBoard({ rows = [], renderStep = null }) {
  if (!rows.length) return null;

  return (
    <section className={styles.wrap} aria-label="สรุปเอกสารที่ขอ">
      <div className={styles.head}><strong>เอกสารที่ขอ</strong></div>
      <TableScroll surface="embedded" minWidth={renderStep ? 680 : 560}>
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>ชนิดเอกสาร</th>
              <th className={styles.colStage}>สถานะ</th>
              {renderStep && <th className={styles.colStep}>ก้าวถัดไป</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className={styles.name}>{r.name}</div>
                  {r.spec && <ReadableText text={r.spec} lines={2} className={styles.note} />}
                  {/* ⭐ ผลลัพธ์ของแถว (B-3 · R-6) — เลขที่เอกสารคือของที่ตกผลึกจาก
                      คำร้องใบนี้ · ต้องอยู่ติดแถวเดียวกับชนิด ไม่ใช่ให้ไปหาในเธรด
                      (เหตุผลเดียวกับเหตุผลที่ให้ไม่ได้ข้างล่าง) */}
                  {r.docNumber && (
                    <div className={styles.note}>
                      เลขที่ <strong>{r.docNumber}</strong>
                      {r.docDueDate && ` · ครบกำหนด ${fmtDate(r.docDueDate)}`}
                    </div>
                  )}
                  {/* เหตุผลที่ให้ไม่ได้ต้องอยู่ติดแถวนั้น ไม่ใช่ให้ไปหาในเธรด */}
                  {r.declineReason && (
                    <ReadableText text={r.declineReason} lines={2} className={styles.note} />
                  )}
                </td>
                <td><StatusBadge tone={r.stageTone} label={r.stageLabel} /></td>
                {renderStep && <td className={styles.stepCell}>{renderStep(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

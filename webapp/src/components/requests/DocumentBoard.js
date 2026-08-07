"use client";
// ── ตารางสรุปเอกสารที่ขอ (P5) ───────────────────────────────────────────
//
// ⭐ **ของกลางสองฝ่าย** — RD ขอ IFRA/COA/MSDS · บัญชีขอใบวางบิล/ใบกำกับ · คนละชุด
// คำศัพท์ แต่กฎของบรรทัดเหมือนกันทุกข้อ ⇒ ตารางเดียว
//
// ⭐ **ตารางนี้ไม่มีปุ่ม** — ปุ่มของแต่ละก้าวอยู่ท้ายเธรดที่เดียว (NextStepBar · ม-49)
//
// ⚠️ การนับอยู่ที่ `lib/requests/documentBoard.js` ทั้งหมด ไม่ประกอบใน JSX
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./briefBoard.module.css";

export default function DocumentBoard({ rows = [] }) {
  if (!rows.length) return null;

  return (
    <section className={styles.wrap} aria-label="สรุปเอกสารที่ขอ">
      <div className={styles.head}><strong>เอกสารที่ขอ</strong></div>
      <TableScroll surface="embedded" minWidth={560}>
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>ชนิดเอกสาร</th>
              <th className={styles.colStage}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className={styles.name}>{r.name}</div>
                  {r.spec && <ReadableText text={r.spec} lines={2} className={styles.note} />}
                  {/* เหตุผลที่ให้ไม่ได้ต้องอยู่ติดแถวนั้น ไม่ใช่ให้ไปหาในเธรด */}
                  {r.declineReason && (
                    <ReadableText text={r.declineReason} lines={2} className={styles.note} />
                  )}
                </td>
                <td><StatusBadge tone={r.stageTone} label={r.stageLabel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

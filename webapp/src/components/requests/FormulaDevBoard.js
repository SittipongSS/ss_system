"use client";
// ── ตารางสรุปทั้งใบของ "พัฒนาสูตร" (P4 · แบบ §04) ───────────────────────
//
// ⭐ **โครงสองชั้น** — คำร้อง → แถว (หมวด × กลิ่น) · ไม่มีชั้นบรีฟให้จัดกลุ่มเหมือน
// พัฒนากลิ่น ⇒ ตารางเป็นรายแถวตรง ๆ
//
// ⭐ **ตารางนี้ไม่มีปุ่ม** — ปุ่มของแต่ละก้าวอยู่ท้ายเธรดที่เดียว (NextStepBar · ม-49)
//
// ⚠️ การนับอยู่ที่ `lib/requests/formulaDevBoard.js` ทั้งหมด — ประกอบ array ของแถว
// ใน JSX เมื่อไร CI จะมองไม่เห็น แล้วผู้ใช้เป็นคนเจอบนจอ (กฎหลังบั๊กรางซ้ำ #1033)
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./briefBoard.module.css";

const qty = (n) => Number(n).toLocaleString("th-TH");

export default function FormulaDevBoard({ rows = [] }) {
  // ยังไม่มีแถว = ยังไม่มีอะไรให้สรุป · ตารางหัวเปล่าแย่กว่าไม่มีตาราง
  if (!rows.length) return null;

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">
      <div className={styles.head}><strong>สรุปทั้งใบ</strong></div>

      <TableScroll surface="embedded" minWidth={640}>
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>หมวดสินค้า × กลิ่น</th>
              <th className={styles.colOutcome}>ผลลัพธ์</th>
              <th className={styles.colStage}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className={styles.name}>
                    {r.name}
                    {/* รอบแก้อ่านออกจากตารางโดยไม่ต้องเปิดการ์ด */}
                    {r.rework && <span className="ui-badge">รอบแก้</span>}
                  </div>
                  {r.spec && <ReadableText text={r.spec} lines={2} className={styles.note} />}
                  <div className={styles.note}>
                    {/* ⚠️ ยังไม่มีสูตร = RD ยังไม่ส่ง — บอกตรง ๆ ดีกว่าเว้นว่างให้เดา */}
                    {r.formulaId ? "เข้าทะเบียนสูตรแล้ว" : "ยังไม่มีสูตรออกมาจากแถวนี้"}
                    {r.qty != null && ` · ขอ ${qty(r.qty)}${r.unit ? ` ${r.unit}` : ""}`}
                  </div>
                </td>
                <td>
                  {r.outcomeLabel
                    ? (
                      <>
                        <StatusBadge tone={r.outcomeTone} label={r.outcomeLabel} />
                        {r.confirmedQty != null && (
                          <div className={styles.note}>คอนเฟิร์ม {qty(r.confirmedQty)}</div>
                        )}
                        {r.outcomeNote && <ReadableText text={r.outcomeNote} lines={2} className={styles.note} />}
                      </>
                    )
                    : <span className={styles.note}>ยังไม่ถึงตาลูกค้า</span>}
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

"use client";
// ── ตารางสรุปทั้งใบ: บรีฟ → กลิ่น → ผลลัพธ์ → สถานะ (ม็อกอัพ ส่วน 07) ────
//
// ⭐ **อ่านครั้งเดียวรู้ทั้งใบ** — เดิมหน้ารายละเอียดมีแต่การ์ดรายแถวเรียงลงมา ⇒ ใบที่มี
// 3 บรีฟ × 2 direction = 6 การ์ด ต้องไถทั้งหน้าถึงจะตอบได้ว่าบรีฟไหนยังไม่มีอะไรเลย
//
// ⭐ **ตารางนี้ไม่มีปุ่ม** — ปุ่มของแต่ละก้าวอยู่บนรางในการ์ดของแถวนั้น (RowStageRail)
// ที่เดียว · ใส่ปุ่มซ้ำที่นี่จะได้ทางเข้าสองทางที่ต้องคอยดูแลให้ตรงกัน ซึ่งเป็นโรค
// เดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้
//
// ⚠️ การจัดกลุ่ม/นับ อยู่ที่ `lib/requests/briefBoard.js` ทั้งหมด — กฎที่ตั้งไว้หลัง
// บั๊กรางซ้ำ (#1033): ประกอบ array ของแถวใน JSX เมื่อไร CI จะมองไม่เห็น
import { Fragment } from "react";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./briefBoard.module.css";

const qty = (n) => Number(n).toLocaleString("th-TH");

/**
 * ⚠️ รับ `groups` ที่ประกอบมาแล้ว **ไม่ประกอบเอง** — แถบตัวเลขบนหน้ารายละเอียดอ่าน
 * `briefBoardTotals` จากก้อนเดียวกัน ⇒ ตัวเลขข้างบนกับตารางข้างล่างขัดกันไม่ได้
 * เชิงโครงสร้าง · ประกอบสองรอบเมื่อไรก็เปิดทางให้สองที่นับคนละแบบ
 */
export default function BriefBoard({ groups = [] }) {
  // ยังไม่มีทั้งบรีฟและ direction = ยังไม่มีอะไรให้สรุป · ตารางหัวเปล่าแย่กว่าไม่มีตาราง
  if (!groups.length) return null;

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">
      <div className={styles.head}><strong>สรุปทั้งใบ</strong></div>

      <TableScroll surface="embedded" minWidth={640}>
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>กลิ่น</th>
              <th className={styles.colOutcome}>ผลลัพธ์</th>
              <th className={styles.colStage}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id || "orphan"}>
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" colSpan={3}>
                    {g.label}
                    {g.brief && <span className={styles.groupBrief}>{g.brief}</span>}
                  </th>
                </tr>

                {/* ⭐ บรีฟที่ยังไม่มี direction ต้องมีแถวของตัวเอง ไม่ใช่หายไป —
                    "ยังไม่ได้ลงมือ" คือข้อมูลที่คนเปิดใบมาต้องเห็นก่อนอย่างอื่น */}
                {!g.directions.length ? (
                  <tr>
                    <td colSpan={3} className={styles.untouched}>ยังไม่มี direction ที่ส่งจากบรีฟก้อนนี้</td>
                  </tr>
                ) : g.directions.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className={styles.name}>{d.name}</span>
                      {d.rework && <span className={styles.rework}>รอบแก้</span>}
                    </td>
                    <td>
                      {d.outcomeLabel ? (
                        <>
                          <StatusBadge tone={d.outcomeTone} label={d.outcomeLabel} />
                          {d.confirmedQty != null && (
                            <span className={styles.qty}>{qty(d.confirmedQty)}</span>
                          )}
                          {d.outcomeNote && (
                            <ReadableText text={d.outcomeNote} lines={2} className={styles.note} />
                          )}
                        </>
                      ) : (
                        // ⚠️ ยังไม่ถึงตาลูกค้า ≠ ลูกค้าเงียบ — ขีดเฉย ๆ อ่านเป็นอย่างหลัง
                        <span className={styles.pending}>ยังไม่ถึงขั้นลูกค้าตอบ</span>
                      )}
                    </td>
                    <td><StatusBadge tone={d.stageTone} label={d.stageLabel} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

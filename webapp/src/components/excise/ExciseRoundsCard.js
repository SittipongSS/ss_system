"use client";

// ── รอบค่าสรรพสามิตของ SO ลูกค้า (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V1 · V10) ──
// ฝ่ายขายเห็นรายรอบว่าแต่ละรอบถึงขั้นไหน (ใบเสนอราคา → SO ค่าสรรพสามิต → RA) + ยอดคงเหลือรายบรรทัด — โดยไม่ต้องเข้า /tax (V7)
// ข้อมูล = GET /api/sales-planning/sales-orders/[id]/excise-quotation (`rounds` · `remaining`) · คำขั้น = exciseRoundStage (เส้นเดินงาน)
// ⚠️ วาดเฉพาะเมื่อแบ่งรอบจริง (หลายรอบ หรือรอบเดียวแต่ยังค้าง/ปิดยอดค้าง) — ยังไม่มีรอบ หรือรอบเดียวครบทุกรายการ
//    เส้นเดินงานบอกครบอยู่แล้ว (ช่วงที่ไม่ได้บอกอะไรเพิ่มต้องหายไปทั้งช่วง · กติกาเส้นเดินงาน 13/08)
import Link from "next/link";
import { TableScroll } from "@/components/ui/Table";
import { fmtNumber, naText } from "@/lib/format";
import { exciseRoundStage } from "@/lib/sales/salesOrderWorkTrack";
import styles from "./ExciseRoundsCard.module.css";

export default function ExciseRoundsCard({ rounds = [], remaining = null, remainderClosed = null }) {
  if (!rounds.length || (rounds.length === 1 && !remaining?.hasRemaining && !remainderClosed)) return null;
  const openRows = (remaining?.rows || []).filter((row) => row.remaining > 0);
  return (
    <section className={styles.card} aria-label="รอบค่าสรรพสามิตของใบนี้">
      <header className={styles.head}>
        <h2>รอบค่าสรรพสามิต</h2>
        <span>
          {rounds.length} รอบ
          {remainderClosed ? " · ปิดยอดค้างแล้ว" : remaining?.hasRemaining
            ? ` · ยังค้าง ${fmtNumber(remaining.remainingUnits)} หน่วย`
            : " · ออกครบทุกรายการแล้ว"}
        </span>
      </header>

      <ol className={styles.rounds}>
        {rounds.map((round) => {
          const stage = exciseRoundStage(round);
          return (
            <li key={round.quote.id} className={stage.done ? styles.done : undefined}>
              <span className={styles.roundNo}>รอบที่ {round.round}</span>
              <Link href={`/sa/quotations/${encodeURIComponent(round.quote.id)}`} className="linklike">
                {naText(round.quote.quoteNumber)}
              </Link>
              <span className={styles.units}>{fmtNumber(round.units)} หน่วย</span>
              {round.exciseOrder ? (
                <Link href={`/sa/sales-orders/${encodeURIComponent(round.exciseOrder.id)}`} className="linklike">
                  {naText(round.exciseOrder.orderNumber)}
                </Link>
              ) : null}
              <span className={styles.stage}>{stage.text}</span>
            </li>
          );
        })}
      </ol>

      {/* ยอดคงเหลือรายบรรทัด — แสดงเมื่อยังค้าง (ครบแล้วไม่ต้องมีตาราง) */}
      {openRows.length && !remainderClosed ? (
        <TableScroll family="list" surface="embedded" minWidth={520}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>รหัส / รายการที่ยังค้าง</th>
                <th className="num">สั่งใน SO</th>
                <th className="num">ออกแล้ว</th>
                <th className="num">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {openRows.map((row) => (
                <tr key={row.sourceSalesOrderLineId}>
                  <td>
                    <span className={styles.code}>{row.fgCode}</span>
                    <span className={styles.name}>{row.description}</span>
                  </td>
                  <td className="num mono">{fmtNumber(row.ordered)} {row.unit}</td>
                  <td className="num mono">{fmtNumber(row.issued)}</td>
                  <td className={`num mono ${styles.left}`}>{fmtNumber(row.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
      {remainderClosed ? (
        <p className={styles.closed}>
          ปิดยอดค้างแล้ว{remainderClosed.byName ? ` โดย ${remainderClosed.byName}` : ""}
          {remainderClosed.reason ? ` — ${remainderClosed.reason}` : ""}
        </p>
      ) : null}
    </section>
  );
}

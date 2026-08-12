"use client";
// ── ตารางสรุปทั้งใบของ "พัฒนาสูตร" (P4 · แบบ §04) ───────────────────────
//
// ⭐ **โครงสองชั้น** — คำร้อง → แถว (หมวด × กลิ่น) · ไม่มีชั้นบรีฟให้จัดกลุ่มเหมือน
// พัฒนากลิ่น ⇒ ตารางเป็นรายแถวตรง ๆ
//
// ⭐ **ก้าวถัดไปอยู่ติดแถว** (ม-94 — มติเดียวกับสายเอกสาร) — คอลัมน์ท้ายรับปุ่ม
// ผ่าน `renderStep` จากหัวข้อ (RowStepActions ก้อนเดียวกับแถบท้ายเธรด — ย้าย
// ไม่ก๊อป: โครง panel แถบท้ายเธรดของแถวพวกนี้เงียบ ดูเปลือก /requests/[id])
//
// ⚠️ การนับอยู่ที่ `lib/requests/formulaDevBoard.js` ทั้งหมด — ประกอบ array ของแถว
// ใน JSX เมื่อไร CI จะมองไม่เห็น แล้วผู้ใช้เป็นคนเจอบนจอ (กฎหลังบั๊กรางซ้ำ #1033)
import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDate, fmtNumber } from "@/lib/format";
import styles from "./briefBoard.module.css";

const qty = (n) => fmtNumber(n);
const money = (n) => fmtNumber(n, { minimumFractionDigits: 2 });

/* ⭐ `renderDetail` — เนื้อรายแถวที่ตารางไม่รู้จัก (สเปกที่ขอ · ไฟล์แนบของแถว)
   แพตเทิร์นเดียวกับ `renderStep` และกับ `BriefBoard` ของสายกลิ่น
   🐞 ที่มา (IS-26080021): หน้าพัฒนาสูตรวาง `RequestRows` ไว้เหนือตารางนี้ ⇒ ไล่แถว
   ชุดเดียวกันสองรอบ · ชื่อกลิ่นโผล่ซ้ำและป้ายสถานะซ้ำ เหมือนที่สายกลิ่นโดน */
export default function FormulaDevBoard({ rows = [], renderStep = null, renderDetail = null }) {
  /* กางได้หลายแถว · แถวเดียวกางอัตโนมัติ — กติกาเดียวกับ `BriefBoard` และ `RequestRows`
     (มติผู้ใช้ 2026-08-12) · ตั้งครั้งเดียวตอน mount ไม่งั้นแถวเด้งใต้มือตอนข้อมูลรีเฟรช */
  const [open, setOpen] = useState(() => new Set(rows.length === 1 ? [rows[0].id] : []));
  const toggleRow = (id) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // ยังไม่มีแถว = ยังไม่มีอะไรให้สรุป · ตารางหัวเปล่าแย่กว่าไม่มีตาราง
  if (!rows.length) return null;

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">

      <TableScroll surface="embedded" minWidth={renderStep ? 760 : 640}>
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>หมวดสินค้า × กลิ่น</th>
              <th className={styles.colOutcome}>ผลลัพธ์</th>
              <th className={styles.colStage}>สถานะ</th>
              {renderStep && <th className={styles.colStep}>ก้าวถัดไป</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr>
                <td>
                  <div className={styles.name}>
                    {renderDetail ? (
                      <button
                        type="button" className={styles.rowToggle}
                        aria-expanded={open.has(r.id)} onClick={() => toggleRow(r.id)}
                      >
                        <ChevronRight size={14} aria-hidden="true"
                          className={open.has(r.id) ? styles.chevOpen : styles.chev} />
                        {r.name}
                      </button>
                    ) : r.name}
                    {/* รอบแก้อ่านออกจากตารางโดยไม่ต้องเปิดการ์ด */}
                    {r.rework && <span className="ui-badge">รอบแก้</span>}
                  </div>
                  {/* 🐞 **สเปกที่ซ้ำกับชื่อแถวไม่ต้องโชว์** (IS-26080021) — สายพัฒนาสูตร `spec`
                      มักเป็นชื่อกลิ่นตัวเดียวกับที่อยู่ใน `name` อยู่แล้ว ⇒ ผู้ใช้เห็นชื่อเดียวกัน
                      สองบรรทัดติดกัน · เช็คแบบ "อยู่ในกันไหม" ไม่ใช่เท่ากันเป๊ะ เพราะ `name`
                      มักเป็น "หมวด · ชื่อกลิ่น" ซึ่งยาวกว่า `spec` */}
                  {r.spec && !String(r.name || "").includes(r.spec)
                    && <ReadableText text={r.spec} lines={2} className={styles.note} />}
                  <div className={styles.note}>
                    {/* ⚠️ ยังไม่มีสูตร = RD ยังไม่ส่ง — บอกตรง ๆ ดีกว่าเว้นว่างให้เดา
                        ⭐ มีสูตรแล้วเป็น **ลิงก์ไปทะเบียนที่กรองไว้** (ช่องว่างข้อ 4) —
                        เดิมเป็นข้อความเปล่า ต้องไปเปิดทะเบียนแล้วค้นเอง */}
                    {r.formulaId
                      ? (
                        <Link className="linklike" href={`/database/formulas?q=${encodeURIComponent(r.name.split(" → ").pop() || "")}`}>
                          เข้าทะเบียนสูตรแล้ว — เปิดดู
                        </Link>
                      )
                      : "ยังไม่มีสูตรออกมาจากแถวนี้"}
                    {r.qty != null && ` · ขอ ${qty(r.qty)}${r.unit ? ` ${r.unit}` : ""}`}
                  </div>
                  {/* ⭐ ราคาที่ตกลงแล้ว (ช่องว่างข้อ 5) — เดิม RD ใส่ราคาเสร็จ แถวขึ้น
                      "เสร็จ" แต่ในใบไม่มีตัวเลขให้เห็น ต้องไปเดาเอาในทะเบียนวัสดุ */}
                  {r.priced?.price != null && (
                    <div className={styles.note}>
                      ราคาเนื้อสาร <strong className="num">{money(r.priced.price)}</strong> บาท/{r.priced.perUnit || "กก."}
                      {r.priced.validUntil ? ` · ยืนราคาถึง ${fmtDate(r.priced.validUntil)}` : ""}
                    </div>
                  )}
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
                {renderStep && <td className={styles.stepCell}>{renderStep(r)}</td>}
              </tr>
              {renderDetail && open.has(r.id) && (
                <tr className={styles.detailRow}>
                  <td colSpan={renderStep ? 4 : 3}>{renderDetail(r)}</td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

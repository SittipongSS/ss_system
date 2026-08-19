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
import { Fragment } from "react";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDate } from "@/lib/format";
import styles from "./briefBoard.module.css";

/* ⭐ `renderDetail` — ของยาวรายแถว (ไฟล์เอกสารที่ส่งมา) มาเป็น **แถวขยายในตาราง**
   ไม่ใช่การ์ดชุดที่สองใต้ตาราง (มติผู้ใช้ 2026-08-20: *"ทำไมต้องแยกสองส่วน รวมได้มั้ย"*)
   🐞 ที่มาเดียวกับ IS-26080021 ของหน้าพัฒนากลิ่น: หน้านี้เคยวาง `RequestRows` ไว้ใต้
   ตาราง ⇒ ชนิดเอกสารกับป้ายสถานะโผล่สองรอบในจอเดียว และไฟล์อยู่ไกลจากแถวของมัน
   ⚠️ ขึ้นเสมอเมื่อมีเนื้อ ไม่มีปุ่มกาง — แพตเทิร์นเดียวกับ `BriefBoard` (สิ่งที่มติ
   2026-08-13 ไม่ยอมคือ *การซ่อน* ไม่ใช่ตาราง) */
export default function DocumentBoard({ rows = [], renderStep = null, renderDetail = null }) {
  if (!rows.length) return null;
  const cols = renderStep ? 3 : 2;

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
            {rows.map((r) => {
              const detail = renderDetail?.(r);
              return (
              <Fragment key={r.id}>
              <tr>
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
              {detail && (
                <tr className={styles.detailRow}>
                  <td colSpan={cols}>{detail}</td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

"use client";
// ── แถวของตาราง "สรุปทั้งใบ" สองสาย (พัฒนากลิ่น · พัฒนาสูตร) — ม-165 PR-2 · มติเจ้าของ 18/11/2026 ─────────────────
//
// ⭐ **แถวละบรรทัด** — ชื่อ (รหัสบน · ชื่อล่าง) | ผลลูกค้า (ป้าย + ก้าวต่อไป) | [คอลัมน์ของหัวข้อ] | ก้าวถัดไป
// ⭐ **ปุ่มลูกศรหน้าชื่อกางรายละเอียด** (ลูกค้าบอกว่า · โจทย์รอบนี้ · ไฟล์แนบ · ส่งเป็นสินค้า) — พับเป็นค่าตั้งต้น ·
//   แถวพับมีไอคอนบอกว่ามีคอมเมนต์ (ไม่ต้องกางเพื่อรู้ว่ามี) · ทับมติ 18/08 "ของยาวไม่ถูกซ่อน" เฉพาะสองตารางนี้
// ⭐ **แถวจบแล้วจาง** (ไม่เอา · เสร็จแล้ว · ขอแก้ที่แตกรอบแก้แล้ว) — แถวที่ยังเดินเด่นกว่า
// ⚠️ **ตัวเดียว สองตารางเรียก** (`BriefBoard` · `FormulaDevBoard` เป็นคู่แฝด — ห้ามโคลน) · ป้าย/การนับมาจาก
//   `lib/requests/devBoardRows.js` (กฎหลังบั๊กรางซ้ำ #1033) · รางจุดถูกถอดจากสองตารางนี้ (ตารางเอกสารยังใช้)
import { Fragment } from "react";
import { ChevronRight, MessageSquareText } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import RegistryCell from "./RegistryCell";
import { devRowResult, devRowSettled } from "@/lib/requests/devBoardRows";
import { idleFromStamps, idleLabel } from "@/lib/requests/rowTrack";
import styles from "./briefBoard.module.css";

/**
 * @param row       แถวของตาราง (`briefBoard` / `formulaDevBoard` — มี `depth` · `childCount` · `stage` · `outcome` · `idle`)
 * @param cells     เซลล์ของหัวข้อระหว่าง "ผลลูกค้า" กับ "ก้าวถัดไป" (จำนวน · ราคา · กำหนดส่ง)
 * @param step      เนื้อคอลัมน์ก้าวถัดไป (ปุ่มก้าว + เมนู ⋯) — null = ไม่มีคอลัมน์นี้
 * @param detail    เนื้อแถวที่กางได้ — null = แถวนี้ไม่มีอะไรให้กาง
 * @param today     วันไทยจากเปลือก (นับ "ค้าง n วัน" ของแถวที่ยังเดิน)
 */
export default function DevBoardRow({
  row, open = false, onToggle, colSpan, nameTitle, nameExtra = null, cells = null, step = null, detail = null, today = null,
}) {
  const result = devRowResult(row);
  const settled = devRowSettled(row);
  // อายุงานของแถวที่ยังเดิน (เดิมเป็นคอลัมน์ "ค้างมา") — แถวจบแล้วไม่ต้องนับ · ค้างเกิน 7 วันขึ้นแดง (เกณฑ์ที่ `rowTrack.js`)
  const idle = settled ? null : idleFromStamps(row.idle, today);
  const idleText = settled ? null : idleLabel(row.idle, today);
  const hasNote = !!(row.outcomeNote || row.reworkBrief);
  /* ⚠️ กางด้วยปุ่ม `aria-expanded` ในเซลล์ชื่อเท่านั้น — `<tr onClick>` คีย์บอร์ดเข้าไม่ถึง (ด่าน audit:ui hard-zero ·
     WCAG 2.1.1) และชื่อเป็นลิงก์ทะเบียนอยู่แล้ว ห้ามแย่งคลิกกัน */
  const canOpen = !!detail;

  return (
    <Fragment>
      <tr className={[settled ? styles.settledRow : "", open ? styles.rowOpen : ""].filter(Boolean).join(" ") || undefined}>
        {/* ⭐ รอบแก้เยื้องใต้ตัวต้นทาง — เยื้องที่เซลล์ ไม่ใช่ที่เนื้อใน (เส้นตารางลากเต็มแถว) */}
        <td className={row.depth ? styles.childCell : undefined}>
          <div className={styles.nameRow}>
            {canOpen ? (
              <button
                type="button"
                className={styles.expandBtn}
                aria-expanded={open}
                aria-label={`${open ? "พับ" : "กาง"}รายละเอียดของ ${row.registry?.code || row.name}`}
                onClick={onToggle}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : <span className={styles.expandSpacer} aria-hidden="true" />}
            <div className={styles.nameBody}>
              <RegistryCell
                registry={row.registry}
                fallback={row.name}
                title={nameTitle}
                extra={(
                  <>
                    {nameExtra}
                    {hasNote && !open ? (
                      <span className={styles.noteHint} role="img" aria-label="มีคอมเมนต์" title="มีคอมเมนต์ — กดลูกศรหน้าชื่อเพื่ออ่าน">
                        <MessageSquareText size={13} aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              />
            </div>
          </div>
        </td>
        <td className={styles.resultCell}>
          <StatusBadge tone={result.tone} label={result.label} />
          {result.sub ? <div className={styles.note}>{result.sub}</div> : null}
          {idleText ? <div className={`${styles.note} ${idle?.late ? styles.idleLateText : ""}`.trim()}>ค้าง {idleText}</div> : null}
        </td>
        {cells}
        {step}
      </tr>
      {open && canOpen ? (
        <tr className={styles.detailRow}>
          <td colSpan={colSpan}>{detail}</td>
        </tr>
      ) : null}
    </Fragment>
  );
}

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
// ⭐ **ทรงตาราง คอนเซปเดียวกับการ์ด "การชำระ" ของใบสั่งขาย** (มติผู้ใช้ 2026-08-18)
// ⚠️ ทับมติ 2026-08-13 (การ์ดรายแถว) — เหตุผลเต็มอยู่ที่ `BriefBoard` ซึ่งเป็นคู่แฝด
// ของไฟล์นี้ · สองสายต้องเป็นทรงเดียวกันเสมอ ใช้ CSS ก้อนเดียวกัน **ห้ามโคลน**
//
// ⚠️ การนับอยู่ที่ `lib/requests/formulaDevBoard.js` ทั้งหมด — ประกอบ array ของแถว
// ใน JSX เมื่อไร CI จะมองไม่เห็น แล้วผู้ใช้เป็นคนเจอบนจอ (กฎหลังบั๊กรางซ้ำ #1033)
import { useState } from "react";
import {
  CustomerSay, IngredientSay, RowDueCell, RowPriceCell, RowStepCell,
} from "./RowProgressCells";
import DevBoardRow from "./DevBoardRow";
import { dropInheritedSpec, liftSharedSpec } from "@/lib/requests/devBoardRows";
import ReadableText from "@/components/ui/ReadableText";
import { TableScroll } from "@/components/ui/Table";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { fmtDate, fmtNumber } from "@/lib/format";
import styles from "./briefBoard.module.css";
import { dueCellTracker } from "@/lib/requests/dueCell";

const qty = (n) => fmtNumber(n);
const money = (n) => fmtNumber(n, { minimumFractionDigits: 2 });

/* ⭐ `renderDetail` — เนื้อรายแถวที่ตารางไม่รู้จัก (สเปกที่ขอ · ไฟล์แนบของแถว)
   แพตเทิร์นเดียวกับ `renderStep` และกับ `BriefBoard` ของสายกลิ่น
   🐞 ที่มา (IS-26080021): หน้าพัฒนาสูตรวาง `RequestRows` ไว้เหนือตารางนี้ ⇒ ไล่แถว
   ชุดเดียวกันสองรอบ · ชื่อกลิ่นโผล่ซ้ำและป้ายสถานะซ้ำ เหมือนที่สายกลิ่นโดน */
/* ⭐ `onEditRegistry` / `canEditRegistry` — เหมือน `BriefBoard` แต่ตัวที่แก้คือ
   **ทะเบียนสูตร** (มติผู้ใช้ 2026-08-18) */
/* ⭐ **ดีไซน์ใหม่ (มติผู้ใช้ 2026-08-25)** — โครงเดียวกับอีกสองตาราง: รายการ ·
   [จำนวน] · ขั้น (ราง) · ค้างมา · ก้าวถัดไป
   ⚠️ **"จำนวน" โผล่เมื่อใบนี้มีค่าจริง ไม่ใช่เพราะหัวข้ออนุญาต** — ทั้งระบบมีแถวที่
   กรอกจำนวนแค่ 4% (วัด 2026-08-25) ⇒ คอลัมน์ว่างทั้งแถวในเกือบทุกใบ
   ⚠️ **"สถานะ" กับ "ผลลัพธ์จากลูกค้า" ถูกถอด** — ทั้งคู่คิดจาก `stage` ตัวเดียวกับ
   ที่รางวาด · ผลลัพธ์กลายเป็นชิปในเซลล์ชื่อเมื่อลูกค้าตอบจริง (ว่าง 97% ของแถว) */
/* ⭐ `onAddDirection` (ม-157) — "ส่ง direction เพิ่ม" ในเมนู ⋯ ของแถวที่ส่งสูตรแล้วและลูกค้ายังไม่ตอบ (ฝ่ายที่ตอบเท่านั้น ·
   ผู้เรียกส่ง null ให้คนอื่น) · แถวที่ลูกค้าตอบแล้ว = ไม่มีของให้ทำ (สูตรใหม่หลังจากนั้นคือรอบแก้) จึงไม่โชว์ ·
   ด่านที่เหลือ (คู่นี้คอนเฟิร์มไปแล้ว) บอกเหตุตอนกด */
/* ⭐ **ม-165 PR-2 (มติเจ้าของ 18/11/2026)** — คู่แฝดของ `BriefBoard`: แถวละบรรทัด (`DevBoardRow`) · คอลัมน์ "ผลลูกค้า" แทนรางจุด +
   "ค้างมา" · รอบแก้ (+ direction เพิ่ม ม-157) ซ้อนใต้ตัวแม่ · แถวจบแล้วจาง · รายละเอียดพับไว้ กดแถวเพื่อกาง ·
   **สเปกจาก PDR ที่ทุกแถวพูดเหมือนกันขึ้นครั้งเดียวเหนือตาราง** (เดิมพิมพ์ซ้ำใต้ทุกแถว) */
export default function FormulaDevBoard({
  rows: allRows = [], renderStep = null, renderDetail = null,
  onEditRegistry = null, onDeleteRow = null, onAddDirection = null, canEditRegistry = false, today = null, due = null,
}) {
  const [openRows, setOpenRows] = useState(() => new Set());
  const toggleRow = (id) => setOpenRows((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // ยังไม่มีแถว = ยังไม่มีอะไรให้สรุป
  if (!allRows.length) return null;
  const lifted = liftSharedSpec(allRows);
  const sharedSpec = lifted.shared;
  // ใบที่สเปกต่างกันตามกลุ่มกลิ่น — รอบแก้ไม่พิมพ์สเปกซ้ำกับตัวแม่
  const rows = dropInheritedSpec(lifted.rows);
  // ⚠️ ถามจาก **ค่าจริงในใบนี้** ไม่ใช่จากหัวข้อ — ใบที่ไม่กรอกจำนวนเลยไม่ควรมีคอลัมน์
  const showQty = rows.some((r) => r.qty != null);
  /* ⭐ **ราคาเป็นคอลัมน์ของตัวเอง** (ผู้ใช้ 2026-09-22: "เมื่อส่งราคาแล้ว อยากให้โชว์ราคาด้วย") — เดิมเบียดอยู่ใต้
     จำนวนเป็นบรรทัดจาง ๆ ซึ่งคนมองข้าม · โผล่เมื่อใบนี้มีแถวที่ใส่ราคาแล้วจริง (กติกาคอลัมน์เฉพาะหัวข้อ)
     ⚠️ เซลล์กลาง `RowPriceCell` ตัวเดียวกับตารางพัฒนากลิ่น */
  const showPrice = rows.some((r) => r.prices?.length);

  // ⭐ ปุ่มแก้อยู่ท้ายแถว รวมกับปุ่มลงมือ (มติผู้ใช้ 2026-08-18)
  const canEdit = !!(canEditRegistry && onEditRegistry);
  const canDelete = !!(canEditRegistry && onDeleteRow);
  const showActions = !!renderStep || canEdit || canDelete || !!onAddDirection;
  // ม-165 — ชื่อ · ผลลูกค้า · [จำนวน] · [ราคา] · [กำหนดส่ง] · [ก้าวถัดไป]
  const cols = 2 + (showQty ? 1 : 0) + (showPrice ? 1 : 0) + (showActions ? 1 : 0) + (due ? 1 : 0);
  /* ⚠️ **สร้างใหม่ทุกเรนเดอร์** — ตัวนี้จำว่าพิมพ์วันไปแล้วหรือยัง (กติกา "วันธรรมดา
     พิมพ์แถวแรกแถวเดียว") · ยกออกไปนอกฟังก์ชันเมื่อไร ตารางรอบสองจะไม่พิมพ์เลย */
  const showDue = dueCellTracker(due);

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">
      {sharedSpec ? (
        <div className={styles.sharedSpec}>
          <ReadableText text={sharedSpec} lines={2} className={styles.note} />
        </div>
      ) : null}
      <TableScroll
        family="editable" surface="embedded" cells="stacked"
        // ⚠️ เหตุผลเดียวกับ `BriefBoard` — ห้ามตั้งเกินความกว้างคอลัมน์เนื้อ
        minWidth={showActions ? 720 : 560}
      >
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>รายการ</th>
              <th className={styles.colResult}>ผลลูกค้า</th>
              {showQty && <th className={`${styles.colQty} num`}>จำนวน</th>}
              {showPrice && <th className={`${styles.colPrice} num`}>ราคา (บาท/กก.)</th>}
              {due && <th className={styles.colDue}>กำหนดส่ง</th>}
              {showActions && <th className={styles.colStep}>ก้าวถัดไป</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const detail = renderDetail?.(r);
              /* 🐞 สเปกที่ซ้ำกับชื่อไม่ต้องโชว์ — สายพัฒนาสูตร `spec` มักเป็นชื่อกลิ่น
                 ตัวเดียวกับที่อยู่ใน `name` อยู่แล้ว · เช็คแบบ "อยู่ในกันไหม" ไม่ใช่เท่ากันเป๊ะ
                 ⚠️ สเปกที่ทุกแถวพูดเหมือนกันถูกยกขึ้นหัวตารางแล้ว (`liftSharedSpec`) — ที่เหลือคือของเฉพาะแถว */
              const spec = r.spec && !String(r.name || "").includes(r.spec) ? r.spec : null;
              /* ⭐ ยังไม่ส่งสูตร = บรรทัดที่สองบอกสถานะงาน (เดิมอยู่ใต้ชื่อ) — แถวบรรทัดเดียวย้ายลงแถวที่กางได้ แต่ยังบอกในป้ายผลลูกค้า */
              const pendingNote = !r.registry
                ? (r.reworkOf ? `แก้จาก ${r.reworkOf} · ยังไม่ส่งสูตร` : "ยังไม่มีสูตรออกมาจากแถวนี้")
                : null;
              const body = (
                <>
                  {spec && <ReadableText text={spec} lines={2} className={styles.note} />}
                  {pendingNote && <div className={styles.note}>{pendingNote}</div>}
                  <CustomerSay note={r.outcomeNote} brief={r.reworkBrief} />
                  <IngredientSay text={r.ingredientList} />
                  {detail}
                </>
              );
              const hasBody = !!(detail || spec || pendingNote || r.outcomeNote || r.reworkBrief || r.ingredientList);
              return (
                <DevBoardRow
                  key={r.id}
                  row={r}
                  today={today}
                  colSpan={cols}
                  open={openRows.has(r.id)}
                  onToggle={() => toggleRow(r.id)}
                  // สิ่งที่ขอ (หมวด · กลิ่น) ของแถวที่ส่งสูตรแล้ว — ไม่พิมพ์เป็นบรรทัดที่สาม ชี้ค้างดูได้
                  nameTitle={r.registry ? r.name : undefined}
                  /* ⭐ direction ที่เท่าไรของชุด (ม-157) — โผล่เฉพาะชุดที่มี ≥ 2 ตัว · ป้าย "รอบแก้" ไม่ต้องแล้ว (ซ้อนใต้ตัวแม่) */
                  nameExtra={r.direction ? <span className="ui-badge">direction {r.direction.no}</span> : null}
                  detail={hasBody ? body : null}
                  cells={(
                    <>
                      {showQty && (
                        <td className="num">
                          {r.qty != null ? `${qty(r.qty)}${r.unit ? ` ${r.unit}` : ""}` : null}
                        </td>
                      )}
                      {showPrice && <RowPriceCell prices={r.prices} />}
                      {due && <RowDueCell row={r} due={due} show={showDue(r)} />}
                    </>
                  )}
                  step={showActions ? (
                    <RowStepCell>
                      {renderStep?.(r)}
                      {/* แก้/ลบ อยู่ในเมนู `⋯` — เหตุผลเดียวกับ `BriefBoard` */}
                      <RowActionMenu
                        className={styles.rowMenu}
                        label={`การจัดการอื่นของ ${r.registry?.code || r.name}`}
                        items={[
                          onAddDirection && r.formulaId && !r.outcome && !r.settled && {
                            id: "direction", icon: Plus, label: "ส่ง direction เพิ่ม",
                            onClick: () => onAddDirection(r),
                          },
                          canEdit && r.registry && {
                            id: "edit", icon: Pencil, label: "แก้ในทะเบียนสูตร",
                            onClick: () => onEditRegistry(r.registry),
                          },
                          canDelete && {
                            id: "delete", icon: Trash2, tone: "danger",
                            label: "ลบรายการนี้",
                            onClick: () => onDeleteRow(r),
                          },
                        ].filter(Boolean)}
                      />
                    </RowStepCell>
                  ) : null}
                />
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

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
import { Fragment } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import { CustomerSay, RowIdleCell, RowStageCell, RowStepCell } from "./RowProgressCells";
import ReadableText from "@/components/ui/ReadableText";
import { TableScroll } from "@/components/ui/Table";
import RegistryCell from "./RegistryCell";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { Pencil, Trash2 } from "lucide-react";
import { fmtDate, fmtNumber } from "@/lib/format";
import styles from "./briefBoard.module.css";

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
export default function FormulaDevBoard({
  rows = [], renderStep = null, renderDetail = null,
  onEditRegistry = null, onDeleteRow = null, canEditRegistry = false, today = null,
}) {
  // ยังไม่มีแถว = ยังไม่มีอะไรให้สรุป
  if (!rows.length) return null;
  // ⚠️ ถามจาก **ค่าจริงในใบนี้** ไม่ใช่จากหัวข้อ — ใบที่ไม่กรอกจำนวนเลยไม่ควรมีคอลัมน์
  const showQty = rows.some((r) => r.qty != null || r.priced?.price != null);

  // ⭐ ปุ่มแก้อยู่ท้ายแถว รวมกับปุ่มลงมือ (มติผู้ใช้ 2026-08-18)
  const canEdit = !!(canEditRegistry && onEditRegistry);
  const canDelete = !!(canEditRegistry && onDeleteRow);
  const showActions = !!renderStep || canEdit || canDelete;
  const cols = 3 + (showQty ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">
      <TableScroll
        family="editable" surface="embedded" cells="stacked"
        // ⚠️ เหตุผลเดียวกับ `BriefBoard` — ห้ามตั้งเกินความกว้างคอลัมน์เนื้อ
        minWidth={showActions ? 720 : 560}
      >
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>รายการ</th>
              {showQty && <th className={`${styles.colQty} num`}>จำนวน</th>}
              <th className={styles.colTrack}>ขั้น</th>
              <th className={`${styles.colIdle} num`}>ค้างมา</th>
              {showActions && <th className={styles.colStep}>ก้าวถัดไป</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const detail = renderDetail?.(r);
              /* 🐞 สเปกที่ซ้ำกับชื่อไม่ต้องโชว์ — สายพัฒนาสูตร `spec` มักเป็นชื่อกลิ่น
                 ตัวเดียวกับที่อยู่ใน `name` อยู่แล้ว · เช็คแบบ "อยู่ในกันไหม" ไม่ใช่เท่ากันเป๊ะ */
              const spec = r.spec && !String(r.name || "").includes(r.spec) ? r.spec : null;
              return (
                <Fragment key={r.id}>
                  <tr>
                    {/* 🐞 **ลิงก์ทะเบียนเคยเป็นการ "ค้นด้วยข้อความ"** (`/database/formulas?q=<ชื่อ>`)
                        ทั้งที่ `producedFormulaId` อยู่ในมือแล้ว ⇒ สูตรที่เปลี่ยนชื่อไปแล้ว
                        กดแล้วหาไม่เจอ · ตอนนี้ชี้รายตัวด้วย id และโชว์ค่าสดจากทะเบียน */}
                    <td>
                      <RegistryCell
                        registry={r.registry}
                        fallback={r.name}
                        extra={(
                          <>
                            {r.rework && <span className="ui-badge">รอบแก้</span>}
                            {/* ⭐ ผลลัพธ์จากลูกค้าเป็น **ชิปติดชื่อ** ไม่ใช่คอลัมน์
                                (มติผู้ใช้ 2026-08-25) — มีค่าจริงแค่ 3% ของแถว ·
                                คอลัมน์ที่ว่าง 97% กินที่ของสิ่งที่มีค่าทุกแถว */}
                            {r.outcomeLabel && <StatusBadge tone={r.outcomeTone} label={r.outcomeLabel} />}
                            {/* สิ่งที่ขอไว้ตอนเปิดใบ — สแนปช็อต ไม่ใช่ค่าทะเบียน
                                ⚠️ ยังไม่มีสูตร = RD ยังไม่ส่ง บอกตรง ๆ ดีกว่าเว้นว่างให้เดา */}
                            <div className={styles.note}>
                              {r.registry ? r.name : "ยังไม่มีสูตรออกมาจากแถวนี้"}
                            </div>
                          </>
                        )}
                      />
                    </td>
                    {showQty && (
                    <td className="num">
                      {r.qty != null ? `${qty(r.qty)}${r.unit ? ` ${r.unit}` : ""}` : null}
                      {/* ⭐ ราคาที่ตกลงแล้ว — เดิม RD ใส่ราคาเสร็จ แถวขึ้น "เสร็จ" แต่ในใบ
                          ไม่มีตัวเลขให้เห็น ต้องไปเดาเอาในทะเบียนวัสดุ
                          ⚠️ อยู่คอลัมน์เดียวกับจำนวนโดยตั้งใจ — ทั้งคู่เป็น "ตัวเลขของแถว"
                          และราคามีแค่บางแถว คอลัมน์แยกจะว่างเป็นส่วนใหญ่ */}
                      {r.priced?.price != null && (
                        <div className={styles.note}>
                          {money(r.priced.price)} บาท/{r.priced.perUnit || "กก."}
                          {r.priced.validUntil ? ` · ยืนราคาถึง ${fmtDate(r.priced.validUntil)}` : ""}
                        </div>
                      )}
                    </td>
                    )}
                    <RowStageCell row={r} />
                    <RowIdleCell row={r} today={today} />
                    {showActions && (
                      <RowStepCell>
                        {renderStep?.(r)}
                        {/* แก้/ลบ อยู่ในเมนู `⋯` — เหตุผลเดียวกับ `BriefBoard` */}
                        <RowActionMenu
                          label={`การจัดการอื่นของ ${r.registry?.code || r.name}`}
                          items={[
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
                    )}
                  </tr>

                  {/* แถวขยาย — ของยาวของแถวนี้ · ขึ้นเสมอเมื่อมีเนื้อ ไม่มีปุ่มกาง */}
                  {(detail || spec || r.outcomeNote || r.reworkBrief) && (
                    <tr className={styles.detailRow}>
                      <td colSpan={cols}>
                        {spec && <ReadableText text={spec} lines={2} className={styles.note} />}
                        <CustomerSay note={r.outcomeNote} brief={r.reworkBrief} />
                        {detail}
                      </td>
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

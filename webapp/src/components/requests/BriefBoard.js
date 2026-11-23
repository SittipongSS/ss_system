"use client";
// ── ตารางสรุปทั้งใบ: บรีฟ → กลิ่น → ผลลัพธ์ → สถานะ (ม็อกอัพ ส่วน 07) ────
//
// ⭐ **อ่านครั้งเดียวรู้ทั้งใบ** — เดิมหน้ารายละเอียดมีแต่การ์ดรายแถวเรียงลงมา ⇒ ใบที่มี
// 3 บรีฟ × 2 direction = 6 การ์ด ต้องไถทั้งหน้าถึงจะตอบได้ว่าบรีฟไหนยังไม่มีอะไรเลย
//
// ⭐ **ก้าวถัดไปอยู่ติดแถว direction** (ม-94 — มติเดียวกับสายเอกสาร/สูตร) —
// คอลัมน์ท้ายรับปุ่มผ่าน `renderStep` (RowStepActions ก้อนเดียวกับแถบท้ายเธรด —
// ย้าย ไม่ก๊อป: โครง panel แถบท้ายเธรดเงียบทั้งใบ ดูเปลือก /requests/[id])
//
// ⭐ **ทรงตาราง คอนเซปเดียวกับการ์ด "การชำระ" ของใบสั่งขาย** (มติผู้ใช้ 2026-08-18)
// — รายการเป็นแถวที่กวาดตาเทียบข้ามคอลัมน์ได้ · ปุ่มลงมืออยู่ **ในแถวของมันเอง** ·
// ของที่ยาว (สเปก · ไฟล์แนบ · หมายเหตุผลลัพธ์) อยู่แถวขยายใต้แถวนั้น ไม่ถูกซ่อน
// ⚠️ ทับมติ 2026-08-13 (IS-26080021 แบบ ข · การ์ดรายแถว) ซึ่งเกิดตอนตารางยังบีบ
// ทุกอย่างลงช่องแคบและซ่อนสเปก/ไฟล์แนบไว้หลังปุ่มกาง — รอบนี้ของยาวไม่ได้อยู่ในช่อง
// แคบอีกแล้ว มันอยู่แถวเต็มความกว้างใต้แถวหลัก จึงไม่ต้องแลกอะไรกับความแน่น
//
// ⚠️ การจัดกลุ่ม/นับ อยู่ที่ `lib/requests/briefBoard.js` ทั้งหมด — กฎที่ตั้งไว้หลัง
// บั๊กรางซ้ำ (#1033): ประกอบ array ของแถวใน JSX เมื่อไร CI จะมองไม่เห็น
import { Fragment, useState } from "react";
import Button from "@/components/ui/Button";
import {
  CustomerSay, IngredientSay, RowDueCell, RowPriceCell, RowStepCell,
} from "./RowProgressCells";
import DevBoardRow from "./DevBoardRow";
import { groupResultText } from "@/lib/requests/devBoardRows";
import ReadableText from "@/components/ui/ReadableText";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import Link from "next/link";
import { registryHref } from "./RegistryCell";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./briefBoard.module.css";
import { dueCellTracker } from "@/lib/requests/dueCell";
import { formulaLabel } from "@/lib/master/registryLabel";
import { categoryCodeLabel } from "@/lib/master/productCategoryOptions";
import { useProductCategories } from "@/lib/useProductCategories";

/**
 * ⚠️ รับ `groups` ที่ประกอบมาแล้ว **ไม่ประกอบเอง** — แถบตัวเลขบนหน้ารายละเอียดอ่าน
 * `briefBoardTotals` จากก้อนเดียวกัน ⇒ ตัวเลขข้างบนกับตารางข้างล่างขัดกันไม่ได้
 * เชิงโครงสร้าง · ประกอบสองรอบเมื่อไรก็เปิดทางให้สองที่นับคนละแบบ
 */
/* ⭐ `renderDetail` — เนื้อรายแถวที่ตารางไม่รู้จัก (สเปกที่ขอ · ไฟล์แนบของ direction)
   ⚠️ **รับเป็น prop ไม่ใช่ให้ตารางรู้เรื่องไฟล์แนบเอง** — แพตเทิร์นเดียวกับ `renderStep`
   ตารางนี้ถูกใช้ซ้ำหลายที่ ผูกไฟล์แนบเข้ามาตรง ๆ เมื่อไรก็ลากของสายอื่นเข้ามาด้วย
   🐞 ที่มา (IS-26080021): หน้าพัฒนากลิ่นเคยวาง `RequestRows` ไว้เหนือตารางนี้ ⇒ ไล่
   direction ชุดเดียวกันสองรอบ · ยุบเหลือตารางเดียวแล้วสเปก/ไฟล์แนบต้องมีที่อยู่ */
/* ⭐ `onEditRegistry` / `canEditRegistry` — ชื่อกับรหัสของ direction เป็นของ
   **ทะเบียนกลิ่น** ไม่ใช่ของแถวคำร้อง ⇒ ปุ่มแก้ยิงไปที่ทะเบียนตัวจริง (มติผู้ใช้
   2026-08-18) · ตารางไม่รู้เรื่องฟอร์มหรือ API เอง — หัวข้อเป็นคนส่งเข้ามา
   แพตเทิร์นเดียวกับ `renderStep` / `renderDetail` */
/* ⭐ `renderGroupStep` — ปุ่ม "ส่งงาน" **ของบรีฟก้อนนั้น** (มติผู้ใช้ 2026-08-18)
   บรีฟคือสิ่งที่ฝ่ายส่ง direction มาตอบ ⇒ ปุ่มอยู่ในแถวของบรีฟ ไม่ใช่ปุ่มระดับใบที่
   ไม่ได้บอกว่าหมายถึงก้อนไหน · Control Panel เหลือแต่ปุ่มปลายทาง (ปิดเรื่อง) */
/* ⭐ **ดีไซน์ใหม่ (มติผู้ใช้ 2026-08-25)** — โครงเดียวกับอีกสองตาราง: direction ·
   ขั้น (ราง) · ค้างมา · ก้าวถัดไป · สองชั้น (บรีฟ → direction) ยังอยู่เหมือนเดิม
   ⚠️ **"สถานะ" กับ "ผลลัพธ์จากลูกค้า" ถูกถอด ไม่ใช่ย่อ** — ทั้งคู่คิดจาก `stage`
   ตัวเดียวกับที่รางวาดอยู่แล้ว · ผลลัพธ์มีค่าจริงแค่ 2 จาก 68 แถวบน production
   (วัด 2026-08-25) ⇒ กลายเป็นชิปในเซลล์ชื่อเมื่อลูกค้าตอบจริง */
/* ⭐ **ม-165 PR-2 (มติเจ้าของ 18/11/2026) — ทับดีไซน์ 25/08 เฉพาะตารางนี้กับพัฒนาสูตร**: แถวละบรรทัด (`DevBoardRow`) ·
   คอลัมน์ "ผลลูกค้า" (ยืนยัน · ขอแก้ · ไม่เอา · รอลูกค้าตอบ — คำเดียวกับการ์ดสรุป) แทนรางจุด + "ค้างมา" ·
   รอบแก้ซ้อนใต้ตัวแม่ · แถวจบแล้วจาง · รายละเอียด (ลูกค้าบอกว่า · ส่งเป็นอะไร · ไฟล์แนบ) พับไว้ กดแถวเพื่อกาง */
export default function BriefBoard({
  groups = [], renderStep = null, renderDetail = null, renderGroupStep = null,
  // ม-164 PR-3 — รายการเพิ่มในเมนู ⋯ ของแถว (เปลี่ยนเป็นคอนเฟิร์ม · ระบุของแถม) · (d) => [{ id, label, onClick }]
  extraMenuItems = null,
  onEditRegistry = null, onDeleteRow = null, canEditRegistry = false, today = null, due = null,
}) {
  const productCategories = useProductCategories(); // "ส่งเป็นสินค้า" = รหัส + ชื่อหมวด (มติ 18/11)

  /* ⭐ **ก้อนที่ยังต้องลงมือกางไว้ ก้อนที่จบแล้วพับ** (ทางเลือก ก+ · มติผู้ใช้ 2026-08-10)
     ⚠️ ตั้งค่าเริ่มต้นครั้งเดียวตอน mount — คำนวณใหม่ทุกเรนเดอร์เมื่อไร ก้อนที่ผู้ใช้
     เพิ่งพับเองจะเด้งกางกลับทันทีที่ข้อมูลรีเฟรช */
  const [open, setOpen] = useState(() => new Set(
    groups.filter((g) => g.directions.length && g.summary?.needsAction).map((g) => g.id || 'orphan'),
  ));
  // ยุบ/กางระดับ "ก้อนบรีฟ" — สิ่งที่ทำให้ใบ 25 บรีฟไม่กลายเป็นกำแพง (มติ 2026-08-10)
  const toggle = (key) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  /* ⭐ ม-165 PR-2 — แถว direction พับรายละเอียดเป็นค่าตั้งต้น (กดแถวเพื่อกาง) · คนละชุดกับการพับก้อนบรีฟข้างบน */
  const [openRows, setOpenRows] = useState(() => new Set());
  const toggleRow = (id) => setOpenRows((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!groups.length) return null;

  /* ⭐ **ปุ่มแก้อยู่ท้ายแถว** (มติผู้ใช้ 2026-08-18) — รวมกับปุ่มลงมืออื่นในคอลัมน์
     สุดท้าย · เดิมอยู่ติดชื่อ ซึ่งแทรกอยู่กลางสิ่งที่คนกำลังกวาดตาอ่าน */
  const canEdit = !!(canEditRegistry && onEditRegistry);
  const canDelete = !!(canEditRegistry && onDeleteRow);
  const showActions = !!renderStep || canEdit || canDelete || !!extraMenuItems;
  /* ⭐ **คอลัมน์ราคา** (ผู้ใช้ 2026-09-22: "เมื่อส่งราคาแล้ว อยากให้โชว์ราคาด้วย") — โผล่เมื่อใบนี้มี direction ที่ใส่ราคาแล้ว
     · เซลล์กลาง `RowPriceCell` ตัวเดียวกับตารางพัฒนาสูตร */
  const showPrice = groups.some((g) => g.directions.some((d) => d.prices?.length));
  // ม-165 — ชื่อ · ผลลูกค้า · [ราคา] · [กำหนดส่ง] · [ก้าวถัดไป] (รางจุด + "ค้างมา" ถอด — ค้างกี่วันอยู่ใต้ป้ายผลลูกค้า)
  const cols = 2 + (showActions ? 1 : 0) + (due ? 1 : 0) + (showPrice ? 1 : 0);
  /* ⚠️ **สร้างใหม่ทุกเรนเดอร์** — ตัวนี้จำว่าพิมพ์วันไปแล้วหรือยัง (กติกา "วันธรรมดา
     พิมพ์แถวแรกแถวเดียว") · ยกออกไปนอกฟังก์ชันเมื่อไร ตารางรอบสองจะไม่พิมพ์เลย */
  const showDue = dueCellTracker(due);

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">
      {/* ⚠️ `family="editable"` + `cells="stacked"` — ตารางนี้มีปุ่มในแถวและมีเซลล์
          สองบรรทัด (ชื่อ + รอบแก้ / ผลลัพธ์ + จำนวนคอนเฟิร์ม) ⇒ ต้องชิดบนทั้งแถว
          ไม่งั้นบรรทัดแรกของแต่ละคอลัมน์ไม่อยู่ระดับเดียวกัน (กฎ 5 · UI_DESIGN_SYSTEM) */}
      <TableScroll
        family="editable" surface="embedded" cells="stacked"
        /* ⚠️ ความกว้างขั้นต่ำต้องพอดีกับ **คอลัมน์เนื้อของหน้ารายละเอียด** ไม่ใช่ตั้งเผื่อ
           — วัดจริง 2026-08-18: การ์ดกว้าง ~730px ตอนจอ ~780px แต่ตารางตั้งไว้ 760
           ⇒ ตารางเลื่อนแนวนอนตลอดเวลาและคอลัมน์ "ก้าวถัดไป" โดนตัดครึ่ง (ผู้ใช้ส่งภาพมา) */
        minWidth={showActions ? 700 : 520}
      >
        <table>
          <thead>
            <tr>
              <th className={styles.colNameBrief}>direction</th>
              <th className={styles.colResult}>ผลลูกค้า</th>
              {showPrice && <th className={`${styles.colPrice} num`}>ราคา (บาท/กก.)</th>}
              {due && <th className={styles.colDue}>กำหนดส่ง</th>}
              {showActions && <th className={styles.colStep}>ก้าวถัดไป</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const key = g.id || "orphan";
              const isOpen = open.has(key);
              const s = g.summary || {};
              return (
                <Fragment key={key}>
                  {/* ⚠️ หัวกลุ่มใช้ `TableGroupRow` ของกลาง — ห้ามเขียน `<tr>` หัวกลุ่ม
                      เอง (กฎที่ประกาศไว้ที่ `components/ui/Table.js`) · สิ่งที่หัวกลุ่ม
                      ต้องตอบให้ได้ **โดยไม่ต้องกาง** คือ "ก้อนนี้มีของค้างฝั่งเราไหม" */}
                  {/* ⚠️ **ข้อความบรีฟไม่ได้อยู่ในช่อง `sub`** — ช่องนั้นเรนเดอร์ด้วย
                      `.ar-code` (mono + nowrap) ซึ่งเป็นทรงของ "รหัส" ไม่ใช่ประโยค ⇒
                      บรีฟยาว ๆ จะไม่ตัดบรรทัดและดันแถวออกนอกจอ · บรีฟลงแถวใต้หัวกลุ่ม
                      ที่กว้างเต็มตารางแทน (mono สงวนไว้ให้ JSON/รหัสเท่านั้น) */}
                  <TableGroupRow
                    colSpan={cols}
                    label={g.label}
                    /* ⭐ ม-165 — หัวกลุ่มสรุปผลด้วยคำชุดเดียวกับการ์ด "สรุปใบนี้" (ยืนยัน · ขอแก้ · ไม่เอา) */
                    badge={groupResultText(s)}
                    /* ⭐ **สรุปของก้อนขึ้นเฉพาะตอนพับ** (มติผู้ใช้ 2026-08-18 — "รอลงมือ 1
                       ยังจำเป็นหรอ") · หน้าที่ของบรรทัดนี้คือตอบ "ก้อนนี้มีของค้างไหม"
                       **โดยไม่ต้องกาง** ⇒ พอกางแล้วทุกแถวมีคอลัมน์สถานะกับก้าวถัดไปของ
                       ตัวเองอยู่แล้ว มันกลายเป็นการนับซ้ำสิ่งที่เห็นอยู่ตรงหน้า
                       ⚠️ บรีฟที่ยังไม่มี direction ต้องอ่านออกว่า "ยังไม่ลงมือ" ไม่ใช่
                       "ไม่มีอะไรค้าง" — มันคือก้อนที่ค้างที่สุดในใบ */
                    total={isOpen ? undefined : (!s.total
                      ? "ยังไม่ลงมือ"
                      : s.needsAction ? `รอลงมือ ${s.waiting}` : "ไม่มีอะไรค้างฝั่งเรา")}
                    totalTitle={s.confirmed > 0 ? `คอนเฟิร์มแล้ว ${s.confirmed}` : undefined}
                    collapsed={!isOpen}
                    onToggle={() => toggle(key)}
                    actions={renderGroupStep?.(g) || null}
                    /* ⭐ ปุ่มของบรีฟนั่งคอลัมน์ "ก้าวถัดไป" เดียวกับปุ่มของ direction (ผู้ใช้ 23/11/2026 "อยาก align") */
                    actionsColSpan={showActions ? 1 : 0}
                    /* ⭐ ป้ายสรุปผลของบรีฟเริ่มที่คอลัมน์ "ผลลูกค้า" ตรงกับป้ายของแถว direction — ไม่เลื่อนตามความยาวชื่อบรีฟ (23/11/2026) */
                    labelColSpan={1}
                  />

                  {/* บรีฟที่ขอไว้ — เห็นว่าขออะไรโดยไม่ต้องข้ามไปแท็บ PDR */}
                  {isOpen && g.brief && (
                    <tr className={styles.detailRow}>
                      <td colSpan={cols}>
                        <ReadableText text={g.brief} lines={3} className={styles.note} />
                      </td>
                    </tr>
                  )}

                  {isOpen && g.directions.map((d) => {
                    const detail = renderDetail?.(d);
                    /* ⭐ ม-165 — แถวละบรรทัด (`DevBoardRow` ตัวเดียวกับตารางพัฒนาสูตร) · ของยาวอยู่ในแถวที่กางได้:
                       ลูกค้าบอกว่า/โจทย์รอบนี้ · Ingredient List · ส่งเป็นอะไร (ม-148) · ไฟล์แนบ (`renderDetail`) */
                    const body = (
                      <>
                        <CustomerSay note={d.outcomeNote} brief={d.reworkBrief} />
                        <IngredientSay text={d.ingredientList} />
                        {/* ⭐ ส่งเป็นอะไร (ม-148) — ราคาที่ตามมาเป็น F หรือ FB ขึ้นกับบรรทัดนี้ */}
                        {d.delivered && (
                          <div className={styles.note}>
                            {d.delivered.product ? (
                              <>
                                ส่งเป็นสินค้า {categoryCodeLabel(d.delivered.categoryCode, productCategories)}
                                {d.delivered.formula && (
                                  <>
                                    {" · สูตร "}
                                    <Link href={registryHref(d.delivered.formula)}>
                                      {formulaLabel(d.delivered.formula)}
                                    </Link>
                                  </>
                                )}
                              </>
                            ) : "ส่งเป็นหัวน้ำหอม"}
                          </div>
                        )}
                        {detail}
                      </>
                    );
                    const hasBody = !!(detail || d.outcomeNote || d.reworkBrief || d.ingredientList || d.delivered);
                    return (
                      <DevBoardRow
                        key={d.id}
                        row={d}
                        today={today}
                        colSpan={cols}
                        open={openRows.has(d.id)}
                        onToggle={() => toggleRow(d.id)}
                        detail={hasBody ? body : null}
                        cells={(
                          <>
                            {showPrice && <RowPriceCell prices={d.prices} />}
                            {due && <RowDueCell row={d} due={due} show={showDue(d)} />}
                          </>
                        )}
                        step={showActions ? (
                          <RowStepCell>
                            {renderStep?.(d)}
                            {/* ⭐ **แก้/ลบ อยู่ในเมนู `⋯`** (มติผู้ใช้ 2026-08-18) — ปุ่มก้าวถัดไป 1 ปุ่ม ที่เหลือยุบเข้าเมนู */}
                            <RowActionMenu
                              className={styles.rowMenu}
                              label={`การจัดการอื่นของ ${d.registry?.code || d.name}`}
                              items={[
                                canEdit && d.registry && {
                                  id: "edit", icon: Pencil, label: "แก้ในทะเบียนกลิ่น",
                                  onClick: () => onEditRegistry(d.registry),
                                },
                                canDelete && {
                                  id: "delete", icon: Trash2, tone: "danger",
                                  label: "ลบ direction นี้",
                                  onClick: () => onDeleteRow(d),
                                },
                                ...(extraMenuItems?.(d) || []),
                              ].filter(Boolean)}
                            />
                          </RowStepCell>
                        ) : null}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>

      {/* ⚠️ **แถบ "ยังไม่ลงมือ N บรีฟ" ถอดแล้ว** (มติผู้ใช้ 2026-08-18) — บรีฟทุกก้อน
          มีแถวหัวกลุ่มของตัวเองเพราะปุ่ม "ส่งงาน" อยู่ในแถวนั้น ⇒ แถบสรุปจะพูดซ้ำ
          กับแถวที่อยู่ข้างบนมันเอง
          ⚠️ กติกาเดิมที่ยังอยู่ (มติ 2026-08-10 · ใบ 25 บรีฟ): ก้อนที่ยังไม่ลงมือ **พับ**
          เหลือบรรทัดเดียว ไม่กางเป็นกำแพง — ที่เปลี่ยนคือมันเป็นบรรทัดในตาราง ไม่ใช่
          ตัวเลขรวมที่กดดูรายชื่อ */}
    </section>
  );
}

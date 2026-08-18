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
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import RegistryCell from "./RegistryCell";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./briefBoard.module.css";
import { fmtNumber } from "@/lib/format";

const qty = (n) => fmtNumber(n);

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
export default function BriefBoard({
  groups = [], renderStep = null, renderDetail = null, renderGroupStep = null,
  onEditRegistry = null, onDeleteRow = null, canEditRegistry = false,
}) {

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

  if (!groups.length) return null;

  /* ⭐ **ปุ่มแก้อยู่ท้ายแถว** (มติผู้ใช้ 2026-08-18) — รวมกับปุ่มลงมืออื่นในคอลัมน์
     สุดท้าย · เดิมอยู่ติดชื่อ ซึ่งแทรกอยู่กลางสิ่งที่คนกำลังกวาดตาอ่าน */
  const canEdit = !!(canEditRegistry && onEditRegistry);
  const canDelete = !!(canEditRegistry && onDeleteRow);
  const showActions = !!renderStep || canEdit || canDelete;
  const cols = showActions ? 4 : 3;

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
        minWidth={showActions ? 680 : 520}
      >
        <table>
          <thead>
            <tr>
              <th className={styles.colName}>direction</th>
              <th className={styles.colOutcome}>ผลลัพธ์จากลูกค้า</th>
              <th className={styles.colStage}>สถานะ</th>
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
                    badge={s.rework > 0
                      ? `${s.total} direction · รอบแก้ ${s.rework}`
                      : `${s.total} direction`}
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
                    return (
                      <Fragment key={d.id}>
                        <tr>
                          {/* ⭐ รอบแก้เยื้องใต้ตัวต้นทาง — ใช้สายพันธุ์ที่ฐานเก็บไว้แล้ว
                              (`derivedFromItemId`) ตอบว่า "ตัวนี้แก้มาจากตัวไหน"
                              ⚠️ เยื้องที่เซลล์ ไม่ใช่ที่เนื้อใน — เส้นตารางต้องลากเต็มแถว */}
                          <td className={d.depth ? styles.childCell : undefined}>
                            <RegistryCell
                              registry={d.registry}
                              fallback={d.name}
                              extra={d.rework ? <span className="ui-badge">รอบแก้</span> : null}
                            />
                          </td>
                          <td>
                            {d.outcomeLabel
                              ? <StatusBadge tone={d.outcomeTone} label={d.outcomeLabel} />
                              // ⚠️ ยังไม่ถึงตาลูกค้า ≠ ลูกค้าเงียบ — ขีดเฉย ๆ อ่านเป็นอย่างหลัง
                              : <span className={styles.pending}>ยังไม่ถึงขั้นลูกค้าตอบ</span>}
                            {d.confirmedQty != null && (
                              <div className={styles.note}>คอนเฟิร์ม {qty(d.confirmedQty)}</div>
                            )}
                          </td>
                          <td><StatusBadge tone={d.stageTone} label={d.stageLabel} /></td>
                          {showActions && (
                            <td className={styles.stepCell}>
                              {renderStep?.(d)}
                              {/* ⭐ **แก้/ลบ อยู่ในเมนู `⋯`** (มติผู้ใช้ 2026-08-18) —
                                  ทรงเดียวกับทุกตารางในระบบ: ปุ่มก้าวถัดไป 1 ปุ่ม
                                  ที่เหลือยุบเข้าเมนู ⇒ คอลัมน์ไม่บวมและอ่านออกว่า
                                  อันไหนคือสิ่งที่ต้องทำ */}
                              <RowActionMenu
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
                                ].filter(Boolean)}
                              />
                            </td>
                          )}
                        </tr>

                        {/* ⭐ แถวขยาย — ของยาวของ direction ตัวนี้ (หมายเหตุผลลัพธ์ ·
                            สเปก · ไฟล์แนบ) · **ไม่มีปุ่มกาง ขึ้นเสมอเมื่อมีเนื้อ**
                            เพราะสิ่งที่มติ 2026-08-13 ไม่ยอมคือ *การซ่อน* ไม่ใช่ตาราง */}
                        {(detail || d.outcomeNote) && (
                          <tr className={styles.detailRow}>
                            <td colSpan={cols}>
                              {d.outcomeNote && (
                                <ReadableText text={d.outcomeNote} lines={2} className={styles.note} />
                              )}
                              {detail}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

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
// ⚠️ การจัดกลุ่ม/นับ อยู่ที่ `lib/requests/briefBoard.js` ทั้งหมด — กฎที่ตั้งไว้หลัง
// บั๊กรางซ้ำ (#1033): ประกอบ array ของแถวใน JSX เมื่อไร CI จะมองไม่เห็น
import { Fragment, useState } from "react";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
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
export default function BriefBoard({ groups = [], renderStep = null, renderDetail = null }) {
  // ยังไม่มีทั้งบรีฟและ direction = ยังไม่มีอะไรให้สรุป · ตารางหัวเปล่าแย่กว่าไม่มีตาราง
  const active = groups.filter((g) => g.directions.length);
  const idle = groups.filter((g) => !g.directions.length);

  /* ⭐ **ก้อนที่ยังต้องลงมือกางไว้ ก้อนที่จบแล้วพับ** (ทางเลือก ก+ · มติผู้ใช้ 2026-08-10)
     ⚠️ ตั้งค่าเริ่มต้นครั้งเดียวตอน mount — คำนวณใหม่ทุกเรนเดอร์เมื่อไร ก้อนที่ผู้ใช้
     เพิ่งพับเองจะเด้งกางกลับทันทีที่ข้อมูลรีเฟรช */
  const [open, setOpen] = useState(() => new Set(
    active.filter((g) => g.summary?.needsAction).map((g) => g.id || 'orphan'),
  ));
  const [showIdle, setShowIdle] = useState(false);
  // ยุบ/กางระดับ "ก้อนบรีฟ" — สิ่งที่ทำให้ใบ 25 บรีฟไม่กลายเป็นกำแพง (มติ 2026-08-10)
  const toggle = (key) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (!groups.length) return null;

  /* ⭐ **ใบที่ยังไม่มี direction สักตัวจบใน 1 บรรทัด** — ของเดิมกางทุกก้อนเสมอ
     ⇒ ใบ 25 บรีฟได้ตาราง 50 แถว **ข้อมูลจริง 0** สูง 1,986px ที่บอกได้อย่างเดียวว่า
     "ยังไม่มี" (วัดจริง 2026-08-10) · ซึ่งเป็นสถานะที่พบบ่อยที่สุดของใบ */
  if (!active.length) {
    return (
      <section className={styles.wrap} aria-label="สรุปทั้งใบ">
        <div className={styles.restStrip}>
          <strong>{idle.length}</strong> บรีฟ · ยังไม่มี direction จากฝ่ายสักตัว
          <Button variant="quiet" size="sm" className={styles.restToggle}
            onClick={() => setShowIdle((v) => !v)} aria-expanded={showIdle}>
            {showIdle ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}
          </Button>
        </div>
        {showIdle && (
          <div className={styles.restNames}>
            {idle.map((g) => <span key={g.id} className="ui-badge">{g.label}</span>)}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={styles.wrap} aria-label="สรุปทั้งใบ">

      {active.map((g) => {
        const key = g.id || "orphan";
        const isOpen = open.has(key);
        const s = g.summary || {};
        return (
          <Fragment key={key}>
            {/* แถบสรุปของบรีฟ — อ่านได้โดยไม่ต้องกาง */}
            <button
              type="button" className={styles.rollBtn}
              aria-expanded={isOpen} onClick={() => toggle(key)}
            >
              <span className={styles.caret} aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              <strong>{g.label}</strong>
              <span className="ui-badge">{s.total} direction</span>
              {s.rework > 0 && <span className={styles.rework}>รอบแก้ {s.rework}</span>}
              {s.confirmed > 0 && <StatusBadge tone="success" label={`คอนเฟิร์ม ${s.confirmed}`} />}
              {s.needsAction
                ? <StatusBadge tone="warning" label={`รอลงมือ ${s.waiting}`} />
                : <StatusBadge tone="neutral" label="ไม่มีอะไรค้างฝั่งเรา" />}
              {g.brief && <span className={styles.groupBrief}>{g.brief}</span>}
            </button>

            {isOpen && (
              /* ⭐ **การ์ดรายแถว ไม่ใช่ตาราง** (มติผู้ใช้ 2026-08-13 · IS-26080021 แบบ ข)
                 สเปกเต็ม: docs/request-board-table-options.html หัวข้อ "แบบ ข"
                 🐞 ตารางเป็นทรงที่ผิดสำหรับข้อมูลชุดนี้ — บรีฟหนึ่งก้อนมี direction
                 1–3 ตัว ตารางจ่ายค่าหัวคอลัมน์ฟรีแล้วยังบีบเนื้อลงช่องแคบจนต้องซ่อน
                 สเปก/ไฟล์แนบไว้หลังปุ่มกาง ⇒ การ์ดเห็นครบโดยไม่ต้องกดสักครั้ง
                 ⚠️ **การยุบ/กางระดับ "ก้อนบรีฟ" ยังอยู่** — นั่นคือสิ่งที่ทำให้ใบ 25 บรีฟ
                 ไม่กลายเป็นกำแพง (มติ 2026-08-10) · ที่ตัดออกคือการกางรายแถวเท่านั้น */
              <div className={styles.cardList}>
                {g.directions.map((d) => (
                  <article key={d.id} className={styles.itemCard} data-child={d.depth ? "" : undefined}>
                    <div className={styles.itemTop}>
                      <div className={styles.itemName}>
                        {/* ⭐ รอบแก้เยื้องใต้ตัวต้นทาง — ใช้สายพันธุ์ที่ฐานเก็บไว้แล้ว
                            (`derivedFromItemId`) ตอบว่า "ตัวนี้แก้มาจากตัวไหน" */}
                        <strong>{d.name}</strong>
                        {d.rework && <span className={styles.rework}>รอบแก้</span>}
                      </div>
                      <StatusBadge tone={d.stageTone} label={d.stageLabel} />
                      {renderStep && <div className={styles.itemStep}>{renderStep(d)}</div>}
                    </div>

                    <div className={styles.facts}>
                      <span>
                        ผลลัพธ์{" "}
                        {d.outcomeLabel
                          ? <StatusBadge tone={d.outcomeTone} label={d.outcomeLabel} />
                          // ⚠️ ยังไม่ถึงตาลูกค้า ≠ ลูกค้าเงียบ — ขีดเฉย ๆ อ่านเป็นอย่างหลัง
                          : <strong>ยังไม่ถึงขั้นลูกค้าตอบ</strong>}
                        {d.confirmedQty != null && ` · คอนเฟิร์ม ${qty(d.confirmedQty)}`}
                      </span>
                    </div>
                    {d.outcomeNote && (
                      <ReadableText text={d.outcomeNote} lines={2} className={styles.note} />
                    )}

                    {renderDetail?.(d)}
                  </article>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}

      {/* ⚠️ บรีฟที่ยังไม่มี direction **ต้องยังนับได้** — คอมเมนต์เดิมของไฟล์นี้บอกว่า
          "ยังไม่ได้ลงมือ" คือข้อมูลที่คนเปิดใบมาต้องเห็นก่อนอย่างอื่น · เปลี่ยนแค่จาก
          กางทีละก้อนเป็นบรรทัดเดียวที่กางดูรายชื่อได้ */}
      {idle.length > 0 && (
        <>
          <div className={styles.restStrip}>
            ยังไม่ลงมือ <strong>{idle.length}</strong> บรีฟ
            <Button variant="quiet" size="sm" className={styles.restToggle}
              onClick={() => setShowIdle((v) => !v)} aria-expanded={showIdle}>
              {showIdle ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}
            </Button>
          </div>
          {showIdle && (
            <div className={styles.restNames}>
              {idle.map((g) => <span key={g.id} className="ui-badge">{g.label}</span>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

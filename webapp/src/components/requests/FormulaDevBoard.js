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
import Link from "next/link";
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
/* ⭐ **การ์ดรายแถว ไม่ใช่ตาราง** (มติผู้ใช้ 2026-08-13 · IS-26080021 แบบ ข)
   สเปกเต็มอยู่ที่ docs/request-board-table-options.html หัวข้อ "แบบ ข"

   🐞 ที่มา: ผู้ใช้ส่งภาพหน้าจอมาว่า "หน้าตาไม่สวยงาม ข้อความเบียด" แล้วไล่แก้ตารางอยู่
   หลายรอบ · สุดท้ายตัดสินว่าตารางเป็นทรงที่ผิดตั้งแต่แรกสำหรับข้อมูลชุดนี้ —
   **ใบจริงมี direction 1–3 ตัว ไม่ใช่หลายสิบ** ตารางออกแบบมาให้กวาดตาเทียบหลายแถว
   ถ้ามีสองแถวก็จ่ายค่าหัวคอลัมน์ไปฟรี แล้วยังบีบเนื้อลงช่องแคบจนต้องซ่อนไว้หลังปุ่มกาง

   ⇒ การ์ดละหนึ่ง direction · **เห็นครบทุกอย่างโดยไม่ต้องกดสักครั้ง**
   ⚠️ ไม่มี state กาง/ยุบอีกแล้ว — ของที่เคยซ่อน (สเปก · ไฟล์แนบ) อยู่ในการ์ดตรง ๆ
   ⚠️ `renderDetail` ยังชื่อเดิมเพื่อไม่ต้องแก้ผู้เรียก แต่ตอนนี้เรนเดอร์เสมอ ไม่ใช่ตอนกาง */
export default function FormulaDevBoard({ rows = [], renderStep = null, renderDetail = null }) {
  // ยังไม่มีแถว = ยังไม่มีอะไรให้สรุป
  if (!rows.length) return null;

  return (
    <div className={styles.cardList} aria-label="สรุปทั้งใบ">
      {rows.map((r) => (
        <article key={r.id} className={styles.itemCard}>
          <div className={styles.itemTop}>
            <div className={styles.itemName}>
              <strong>{r.name}</strong>
              {/* รอบแก้อ่านออกจากการ์ดโดยไม่ต้องเปิดอะไร */}
              {r.rework && <span className="ui-badge">รอบแก้</span>}
              <div className={styles.note}>
                {/* ⚠️ ยังไม่มีสูตร = RD ยังไม่ส่ง — บอกตรง ๆ ดีกว่าเว้นว่างให้เดา
                    ⭐ มีสูตรแล้วเป็นลิงก์ไปทะเบียนที่กรองไว้ */}
                {r.formulaId
                  ? (
                    <Link className="linklike" href={`/database/formulas?q=${encodeURIComponent(r.name.split(" → ").pop() || "")}`}>
                      เข้าทะเบียนสูตรแล้ว — เปิดดู
                    </Link>
                  )
                  : "ยังไม่มีสูตรออกมาจากแถวนี้"}
              </div>
            </div>
            <StatusBadge tone={r.stageTone} label={r.stageLabel} />
            {renderStep && <div className={styles.itemStep}>{renderStep(r)}</div>}
          </div>

          {/* ⭐ ข้อเท็จจริงเรียงแถวเดียว — เดิมกระจายอยู่คนละคอลัมน์จนต้องกวาดตาไปมา */}
          <div className={styles.facts}>
            {r.qty != null && <span>จำนวน <strong>{qty(r.qty)}{r.unit ? ` ${r.unit}` : ""}</strong></span>}
            <span>
              ผลลัพธ์{" "}
              {r.outcomeLabel
                ? <StatusBadge tone={r.outcomeTone} label={r.outcomeLabel} />
                : <strong>ยังไม่ถึงตาลูกค้า</strong>}
              {r.confirmedQty != null && ` · คอนเฟิร์ม ${qty(r.confirmedQty)}`}
            </span>
            {/* ⭐ ราคาที่ตกลงแล้ว — เดิม RD ใส่ราคาเสร็จ แถวขึ้น "เสร็จ" แต่ในใบไม่มี
                ตัวเลขให้เห็น ต้องไปเดาเอาในทะเบียนวัสดุ */}
            {r.priced?.price != null && (
              <span>
                ราคาเนื้อสาร <strong className="num">{money(r.priced.price)}</strong> บาท/{r.priced.perUnit || "กก."}
                {r.priced.validUntil ? ` · ยืนราคาถึง ${fmtDate(r.priced.validUntil)}` : ""}
              </span>
            )}
          </div>

          {/* 🐞 สเปกที่ซ้ำกับชื่อไม่ต้องโชว์ — สายพัฒนาสูตร `spec` มักเป็นชื่อกลิ่นตัวเดียว
              กับที่อยู่ใน `name` อยู่แล้ว · เช็คแบบ "อยู่ในกันไหม" ไม่ใช่เท่ากันเป๊ะ */}
          {r.spec && !String(r.name || "").includes(r.spec)
            && <ReadableText text={r.spec} lines={2} className={styles.note} />}
          {r.outcomeNote && <ReadableText text={r.outcomeNote} lines={2} className={styles.note} />}

          {renderDetail?.(r)}
        </article>
      ))}
    </div>
  );
}

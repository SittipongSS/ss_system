"use client";
// ── log ของระบบ — ครึ่งที่ไม่ใช่บทสนทนาของเธรดเดียวกัน ───────────────────
//
// ⭐ **ทำไมต้องมี** (ผลตรวจ 2026-08-17 · นับจริงทั้งระบบ): เธรดคำร้อง 132 แถว เป็น
// ข้อความคน 33 (25%) เหตุการณ์ระบบ 99 (75%) และ **16 ใบจาก 32 ไม่มีข้อความคนสักแถว**
// ⇒ การ์ดที่พาดหัวว่า "พูดคุยในคำร้องนี้" เป็น log ล้วน 100% บนครึ่งหนึ่งของใบทั้งระบบ
//
// ⚠️ **ไม่ยิง API เอง** — รับ `items` ก้อนดิบชุดเดียวกับที่ `UpdateThread` โหลดมาแล้ว
// (ผ่าน `onItemsChange`) · การเปิดเธรดมีผลข้างเคียงคือมาร์คแจ้งเตือนว่าอ่านแล้ว
// ซึ่งต้องเกิดครั้งเดียวต่อการเปิดหน้า ยิงซ้ำจากที่นี่ก็จะได้สองครั้ง
//
// ⚠️ **ไม่ใช่ทรงของ AUDIT TRAIL บนใบสั่งขาย** — ที่นั่นเป็น `<dl>` สามบรรทัด
// (ผู้จัดทำ/ผู้ยื่น/ผู้อนุมัติ) ไม่มีเวลา ไม่มีลำดับ ซึ่งพอสำหรับเอกสารที่มีการตัดสินใจ
// ของคนแค่สามจุด · คำร้องมีเหตุการณ์ 20+ ชนิดที่ *ลำดับ* คือเนื้อหา (เลื่อนวันสองรอบ ·
// ตีกลับแล้วส่งใหม่ · เปลี่ยนมือผู้รับผิดชอบ) ⇒ ต้องเป็นเส้นเวลา
import { useMemo, useState } from "react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import { fmtDayTime } from "@/lib/format";
import { isNarrativeUpdateItem, updateKindMeta } from "@/lib/master/updateTypes";
import styles from "./UpdateLog.module.css";

/**
 * @param entityType  ชนิดเอกสาร — ใช้แปลง kind เป็นป้าย/สีจากทะเบียนเดียวกับเธรด
 * @param items       แถวดิบจาก `/api/updates` (ทั้งก้อน — ที่นี่คัดเอง)
 * @param icon/title  หัวการ์ด (ให้หน้าเป็นคนตั้งคำ — สายงานต่างกันเรียกไม่เหมือนกัน)
 */
export default function UpdateLog({ entityType, items = [], icon, title = "ประวัติการทำรายการ" }) {
  const [open, setOpen] = useState(false);

  /* ⚠️ คัดด้วยฟังก์ชันตัวเดียวกับที่เธรดใช้ **กลับด้าน** — ไม่เขียนเงื่อนไขซ้ำที่นี่
     ไม่งั้นวันไหนมีคนติดธง `narrative` ให้ชนิดใหม่ แถวนั้นจะโผล่สองที่หรือหายทั้งคู่ */
  const rows = useMemo(() => (items || [])
    .map((row) => ({ row, kind: "own" }))
    .filter((item) => !isNarrativeUpdateItem(entityType, item))
    .map(({ row }) => ({ ...row, meta: updateKindMeta(entityType, row.kind) })), [items, entityType]);

  // ไม่มีเหตุการณ์เลย = ไม่ต้องมีการ์ด · การ์ดเปล่าบอกได้อย่างเดียวว่า "ไม่มี"
  if (!rows.length) return null;

  return (
    <DetailCard
      icon={icon}
      title={title}
      meta={`${rows.length} รายการ`}
      actions={(
        <Button variant="quiet" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "ซ่อน" : "ดู"}
        </Button>
      )}
    >
      {open ? (
        <ol className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              {/* ⚠️ จุดสีกลาง **ไม่ทาสีตามชนิด** — กล่องนี้ตั้งใจให้เงียบ (ข้อมูลเย็น)
                  และคำบอกชนิดอยู่ที่ป้ายข้าง ๆ เป็นตัวหนังสืออยู่แล้ว · ทาสีรายแถวต้อง
                  ใช้ inline style ซึ่งเป็นชั้นเก่าที่ `audit:ui` รูดเพดานลงอยู่ */}
              <span className={styles.mark} aria-hidden="true" />
              <div className={styles.copy}>
                <span className={styles.head}>
                  <strong>{row.meta.label}</strong>
                  <time dateTime={row.createdAt}>{fmtDayTime(row.createdAt)}</time>
                </span>
                {/* เนื้อเหตุการณ์เป็นประโยคที่ระบบประกอบไว้แล้ว (เช่น "เลื่อนวันกำหนดส่ง
                    08/09 → 15/09") — แสดงดิบ ไม่ต้องมี RichText เพราะไม่มี @ ไม่มีลิงก์ */}
                {row.body ? <p className={styles.body}>{row.body}</p> : null}
                {row.authorName ? <small>{row.authorName}</small> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        /* พับไว้ตั้งต้น — นี่คือข้อมูล "เย็น" ที่ไม่ใช่คำถามแรกของใคร · บรรทัดนี้ตอบ
           คำถามที่คนถามจริงตอนพับอยู่: ล่าสุดเกิดอะไรขึ้น */
        <p className={styles.peek}>
          ล่าสุด: {rows[rows.length - 1].meta.label} · {fmtDayTime(rows[rows.length - 1].createdAt)}
        </p>
      )}
    </DetailCard>
  );
}

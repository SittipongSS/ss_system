"use client";
// ── "เกี่ยวกับคำร้อง" ท้ายรายการพื้นที่ (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.8 · ม็อก A-1 · AT-1 · AO-2 · AW-1 · AW-2 · ชุด S9) ──
//
// ⭐ **ของที่หัวใบเดิมพูด ต้องยังอยู่ทุกขนาดจอ** — หัวใบ (`DetailOverview`: ชื่อเรื่อง · ลูกค้า) ถูกแทนด้วยหัวงานที่พูดเรื่อง
//   ไซต์/นัด ⇒ ลูกค้ากับชื่อเรื่องย้ายมาอยู่ใน "รายละเอียดคำร้อง" ที่กางในที่ (ไม่ใช่ลิงก์ — ช่าง role `ts` เปิดหน้าคำร้องไม่ได้)
// ⚠️ **ไม่มีสิทธิ์ = ไม่มีแถว** (กติกา ui-visibility) — แถวลิงก์ขึ้นตาม `canOpenRequest` ของ server เท่านั้น (ตัวตัดสินคิดให้)
// ⚠️ แถว "สรุปส่งผล" เป็นปุ่ม ไม่ใช่ลิงก์ `?tab=result` — สลับแท็บต้องผ่านตัวต่อสายประวัติ (ถามก่อนทิ้งค่าที่พิมพ์ค้าง)
// 🔑 วาดอย่างเดียว — คำทุกคำมาจาก `surveyAboutView`
import { useId, useState } from "react";
import Link from "next/link";
import { ChartBar, ChevronDown, ChevronRight, FileText, MessageCircleQuestion } from "lucide-react";
import styles from "./SurveyAboutRequest.module.css";

function RowText({ label, sub }) {
  return (
    <span className={styles.text}>
      <span className={styles.label}>{label}</span>
      {sub ? <span className={styles.sub}>{sub}</span> : null}
    </span>
  );
}

/**
 * @param view     `surveyAboutView(...)` — `{ detail, link, result }`
 * @param split    บานซ้ายของสองบาน (320px) — คอลัมน์เดียวเสมอ · หน้ารายการของแท็บเล็ตแนวตั้งวางสองคอลัมน์ (AT-1)
 * @param onResult ไปแท็บสรุปส่งผล (ผ่านตัวต่อสายประวัติ) · ไม่ส่ง = ไม่มีแถว
 */
export default function SurveyAboutRequest({ view, split = false, onResult }) {
  const bodyId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const { detail, link, result } = view;
  return (
    <section className={styles.about} data-layout={split ? "split" : "pages"} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>เกี่ยวกับคำร้อง</h2>
      <ul className={styles.rows}>
        <li className={styles.item}>
          <button
            type="button" className={styles.row} aria-expanded={open} aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            <FileText size={18} className={styles.icon} aria-hidden="true" />
            <RowText label={detail.label} sub={detail.sub} />
            <ChevronDown size={16} className={styles.chev} data-turn="" aria-hidden="true" />
          </button>
          <dl id={bodyId} className={styles.detail} hidden={!open}>
            {detail.facts.map((fact) => (
              <div key={fact.key} className={styles.fact}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </li>
        {link ? (
          <li className={styles.item}>
            <Link href={link.href} className={styles.row}>
              <MessageCircleQuestion size={18} className={styles.icon} aria-hidden="true" />
              <RowText label={link.label} sub={link.sub} />
              <ChevronRight size={16} className={styles.chev} aria-hidden="true" />
            </Link>
          </li>
        ) : null}
        {result && onResult ? (
          <li className={styles.item}>
            <button type="button" className={styles.row} onClick={onResult}>
              <ChartBar size={18} className={styles.icon} aria-hidden="true" />
              <RowText label={result.label} sub={result.sub} />
              <ChevronRight size={16} className={styles.chev} aria-hidden="true" />
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

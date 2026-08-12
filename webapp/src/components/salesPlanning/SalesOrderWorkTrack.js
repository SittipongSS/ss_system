"use client";
import Link from "next/link";
import styles from "./SalesOrderWorkTrack.module.css";

/* เส้นเดินงานของใบสั่งขาย — **เส้นเดียวสามช่วง** อ่านซ้ายไปขวาว่าใบนี้ติดอยู่ตรงไหน
   logic ทั้งหมด (ช่วงไหนโผล่ · จุดถึงไหน) อยู่ที่ `lib/sales/salesOrderWorkTrack.js`
   ที่มีเทสต์ — ไฟล์นี้วาดอย่างเดียว

   ⚠️ อ่านอย่างเดียวเสมอ — ทั้งสามช่วงแก้ที่หน้าเจ้าของงาน (คำร้อง · โครงการ · คิวผลิต)
   หน้า SO ไม่ตั้งสถานะให้ใคร
   ⚠️ อย่าสับสนกับรางก้าวใน "จัดการเอกสาร" — อันนั้นคือชีวิตของ *เอกสาร*
   อันนี้คือชีวิตของ *ของที่ขาย* */
export default function SalesOrderWorkTrack({ track }) {
  if (!track?.segments?.length) return null;
  const { segments, current } = track;

  return (
    <section className={styles.track} aria-label="เส้นเดินงานของใบนี้">
      <header className={styles.head}>
        <span className={styles.eyebrow}>เส้นเดินงานของใบนี้</span>
        {current ? (
          <span className={styles.now}>
            ตอนนี้อยู่ที่ <b>{current.label}</b>
            {current.statusLabel ? ` — ${current.statusLabel}` : ""}
            {!current.statusLabel && current.connect?.message ? ` — ${current.connect.message}` : ""}
          </span>
        ) : null}
      </header>

      <ol className={styles.segments}>
        {segments.map((segment, index) => (
          <li key={segment.key} className={`${styles.seg} ${styles[segment.state] || ""}`}>
            <div className={styles.segLabel}>
              <span className={styles.mark} aria-hidden="true">
                {segment.state === "done" ? "✓" : segment.state === "late" ? "!" : index + 1}
              </span>
              {segment.label}
              {segment.meta ? <small>{segment.meta}</small> : null}
            </div>

            {segment.steps ? (
              <ol className={styles.steps}>
                {segment.steps.map((step) => (
                  <li key={step.key} className={`${styles.step} ${styles[step.state] || ""}`}>
                    <i aria-hidden="true" />
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              /* ⚠️ "ยังไม่เชื่อม" ต้องบอกว่าต้องทำอะไรต่อ — จุดเปล่าไม่ได้บอกอะไรเลย */
              <div className={styles.connect}>
                <span>{segment.connect?.message}</span>
                {segment.connect?.actionLabel && segment.connect?.href ? (
                  <Link href={segment.connect.href} className={styles.link}>
                    {segment.connect.actionLabel} →
                  </Link>
                ) : null}
              </div>
            )}

            {segment.steps && segment.link ? (
              <Link href={segment.link.href} className={styles.link}>{segment.link.label} →</Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

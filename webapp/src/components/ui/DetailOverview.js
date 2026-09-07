"use client";

import { Children, useEffect, useRef } from "react";
import styles from "./DetailOverview.module.css";
import { naText } from "@/lib/format";
import { useDetailPin } from "@/lib/ui/detailPin";
import { cssLengthPx } from "@/lib/ui/cssLength";

export function DetailStateBadge({ label, color = "var(--accent)" }) {
  if (!label) return null;
  return <span className={styles.stateBadge} style={{ "--state-color": color }}>{label}</span>;
}

export default function DetailOverview({
  eyebrow,
  title,
  description,
  // แถวใต้คำอธิบาย — ของที่ "อ่านพร้อมชื่อเรื่อง" เช่นชิปคนสองฝั่งของใบคำร้อง (ม-101)
  // ⚠️ ไม่ใช่ที่วางปุ่ม — ปุ่มมี `actions` ของตัวเองที่ฝั่งขวาแล้ว
  meta,
  badges,
  actions,
  facts = [],
  children,
  className = "",
}) {
  const extra = Children.toArray(children);
  const cardRef = useRef(null);
  const pin = useDetailPin();
  const setRecord = pin?.setRecord;

  /* ── บอกเปลือกว่าใบนี้คือใบไหน และตอนนี้หัวใบยังอยู่ในสายตาหรือยัง ──────────
     ⚠️ ต้องเป็น IntersectionObserver ไม่ใช่ onScroll — หน้ารายละเอียดมีทั้งตาราง
     ที่เลื่อนเองและรางที่เลื่อนเอง (ทั้งคู่เพิ่งได้ scrollport ของตัวเองไปเมื่อวาน)
     ตัวจับ scroll ที่ผูกกับ window จะไม่รู้เรื่องพวกนั้นเลย

     เส้นตัด = `--scroll-anchor-top` ซึ่งรวมความสูงแถบเมนู + ความสูงแถบนี้แล้ว
     ⇒ แถบโผล่พอดีตอนที่หัวใบเลื่อนพ้นตำแหน่งที่แถบจะไปยืน ไม่เหลื่อมกัน */
  useEffect(() => {
    if (!setRecord) return undefined;
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") return undefined;

    /* 🐞 เดิมเขียน `Number.parseFloat(getPropertyValue("--scroll-anchor-top"))`
       ซึ่งได้ **NaN ทุกครั้ง** — โทเคนนั้นเป็น `calc()` ที่เบราว์เซอร์ไม่คลี่ให้ตอน
       อ่านผ่าน getPropertyValue (ได้สตริง "calc(52px + 0px + 49px + 12px)")
       ⇒ ตกไปใช้ค่าคงที่ 106 ตลอด · วัดจริงที่จอ 1100px ค่าจริงคือ 113 ⇒ เพี้ยน 7px
       และตัวผูกใหม่ตอน resize ข้างล่าง **ไม่มีความหมายเลย** เพราะค่าไม่เคยเปลี่ยน */
    const pinLine = () => cssLengthPx("--scroll-anchor-top", 106);

    let observer = null;
    const attach = () => {
      if (observer) observer.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => setRecord((prev) => (prev ? { ...prev, pinned: !entry.isIntersecting } : prev)),
        { rootMargin: `-${pinLine()}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(card);
    };
    attach();
    /* เส้นตัดเปลี่ยนตามความกว้างจอ (--sysbar-h เป็น 0 ที่ ≤1200px) จึงต้องผูกใหม่ */
    window.addEventListener("resize", attach);
    return () => {
      window.removeEventListener("resize", attach);
      if (observer) observer.disconnect();
    };
  }, [setRecord]);

  /* เนื้อของแถบ — แยก effect จากตัวจับสายตา เพราะเปลี่ยนคนละจังหวะ
     (เนื้อเปลี่ยนตอนโหลดข้อมูลเสร็จ · pinned เปลี่ยนตอนเลื่อน) */
  useEffect(() => {
    if (!setRecord) return undefined;
    setRecord((prev) => ({ pinned: prev?.pinned || false, eyebrow, title: naText(title), description }));
    return () => setRecord(null);
  }, [setRecord, eyebrow, title, description]);

  return (
    <section ref={cardRef} className={`ui-detail-overview ${styles.overviewCard} ${className}`.trim()}>
      <div className={styles.overviewHeading}>
        <div className={styles.titleBlock}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <h1>{naText(title)}</h1>
          {description ? <div className={styles.description}>{description}</div> : null}
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {(badges || actions) ? (
          <div className={styles.headingActions}>
            {badges ? <div className={styles.badgeRow}>{badges}</div> : null}
            {actions ? <div className={styles.actionRow}>{actions}</div> : null}
          </div>
        ) : null}
      </div>
      {facts.length ? (
        <div className={styles.quickFacts}>
          {facts.map((fact, index) => {
            const Icon = fact.icon;
            return (
              <div key={fact.key || `${fact.label}-${index}`} data-tone={fact.tone || undefined}>
                {Icon ? <Icon size={17} aria-hidden="true" /> : null}
                <span>
                  <small>{fact.label}</small>
                  <strong title={typeof fact.value === "string" ? fact.value : undefined}>
                    {naText(fact.value)}
                  </strong>
                  {/* บรรทัดรอง — ของที่อ่านคู่กับค่าหลักเสมอ (รหัสลูกค้าใต้ชื่อลูกค้า ·
                      เบอร์ใต้ชื่อผู้ติดต่อ) · ไม่ใช่ที่เก็บของที่ไม่มีช่องว่าง
                      กริดขึ้นแถวสองได้แล้ว ช่องใหม่จึงไม่ต้องเบียดมาอยู่ตรงนี้ */}
                  {fact.sub ? (
                    <small
                      className={styles.factSub}
                      title={typeof fact.sub === "string" ? fact.sub : undefined}
                    >
                      {fact.sub}
                    </small>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* 🐞 `children ? …` ไม่พอ — ผู้เรียกส่งลูกหลายตัวที่เป็นเงื่อนไข
          (`{cond && <X/>}`) ⇒ ได้อาเรย์ของ `false` ซึ่ง truthy ⇒ โซนนี้ยังถูกวาด
          เป็น **แถบว่างพร้อมเส้นคั่น** ใต้หัวใบ (ผู้ใช้เห็นบนจอ tablet 2026-08-09)
          · `Children.toArray` ทิ้ง null/undefined/boolean ให้แล้ว */}
      {extra.length ? <div className={styles.extra}>{extra}</div> : null}
    </section>
  );
}

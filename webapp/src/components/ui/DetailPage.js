import styles from "./DetailPage.module.css";
import Link from "next/link";
import { naText } from "@/lib/format";

export function ContextualRightRail({ children, label = "ข้อมูลสรุปและการดำเนินการ", className = "" }) {
  return <aside className={`${styles.aside} ${className}`.trim()} aria-label={label}>{children}</aside>;
}

/* ไม่มี aside = ต้องยุบเหลือคอลัมน์เดียวด้วย ไม่งั้น grid ยังกันที่ 330px ไว้ให้ช่องว่าง
   (หน้าที่สลับการ์ดเข้า-ออกตามแท็บ เช่นหน้าโครงการ จะเสียความกว้างไปเปล่า ๆ)

   ⭐ `controlFirst` — **จอแคบให้รางขวาขึ้นก่อนเนื้อ** (ผลตรวจ 2026-08-17)
   ที่ ≤1050px รางขวาเลิก sticky แล้วไหลลงไปต่อท้ายเนื้อ ⇒ หน้าที่เอาปุ่มระดับใบไป
   ไว้ในการ์ด control ที่รางขวา **ปุ่มเดียวของทั้งใบจะไปอยู่ก้นหน้า** · วัดจริงบนใบ
   คำร้องที่เบาที่สุด (0 direction · 3 ข้อความ) ที่ 1024px: ปุ่มอยู่ที่ y=1843 ในหน้าสูง
   2269 = เลื่อนสองหน้าจอกว่าจะเจอ · ใบที่คุยกัน 20 ข้อความยิ่งกว่านั้น
   ⚠️ **เป็นโหมด ไม่ใช่ค่าตั้งต้น** — ลำดับอ่านของจอแคบกลายเป็น หัวใบ → สถานะ+ปุ่ม →
   บริบท/สรุป → เนื้อ ซึ่งเหมาะกับหน้าที่ "สถานะกับก้าวถัดไป" คือคำถามแรก · หน้าที่
   เนื้อคือคำถามแรก (เช่น รายการสินค้าในใบ) ต้องไม่เปิดโหมดนี้จนกว่าจะไล่ดูเองแล้ว
   ⚠️ ห้ามแก้ด้วยการวาดปุ่มซ้ำอีกชุดตอนจอแคบ — ม-49/ม-57 บังคับว่าปุ่มระดับใบ
   อยู่ที่เดียว · ที่ย้ายคือ *ที่วาง* ไม่ใช่การก๊อป */
export function DetailPageLayout({ children, aside, asideLabel, controlFirst = false, className = "" }) {
  /* ⚠️ **สลับลำดับ DOM จริง ไม่ใช่ `order` อย่างเดียว** — `order` ขยับแค่ภาพ ส่วน Tab
     กับ screen reader ยังเดินตาม DOM ⇒ จอแคบจะเห็นปุ่มอยู่บนสุดแต่กด Tab แล้วโฟกัส
     ไปโผล่ท้ายหน้า (WCAG 2.4.3) · โหมดนี้จึงวางรางไว้ก่อนใน DOM แล้วดัน**กลับไป
     ขวา**ด้วย `order` เฉพาะตอนจอกว้าง ซึ่งเป็นจังหวะที่สองคอลัมน์อยู่ข้างกัน
     ลำดับอ่านจึงไม่มีความหมายอยู่แล้ว */
  const rail = aside ? <ContextualRightRail label={asideLabel}>{aside}</ContextualRightRail> : null;
  return <div className={`${styles.layout} ${aside ? "" : styles.layoutSolo} ${controlFirst ? styles.controlFirst : ""} ${className}`.trim()}>{controlFirst ? rail : null}<main className={styles.main}>{children}</main>{controlFirst ? null : rail}</div>;
}

export function ContextGrid({ children, className = "" }) {
  return <div className={`${styles.contextGrid} ${className}`.trim()}>{children}</div>;
}

/* `id` ใช้ทำ anchor ไปการ์ดใดการ์ดหนึ่งบนหน้ารายละเอียด (เช่น `#payment`) —
   ทะเบียนการชำระของฝ่ายบัญชีลิงก์มาที่การ์ดการชำระโดยตรง คนกดจะได้ไม่ต้อง
   เลื่อนหาเองทุกครั้งที่เปิดใบ (มติผู้ใช้ 2026-08-13 "ทำให้ลงมือได้เร็วขึ้น")
   ⚠️ `scroll-margin-top` อยู่ที่ `.card` ใน DetailPage.module.css — ไม่งั้นหัวการ์ด
   จะไปอยู่ใต้แถบเมนูที่ปักอยู่ด้านบน */
export function DetailCard({ id, icon: Icon, eyebrow, title, meta, actions, children, className = "" }) {
  return <section id={id} className={`${styles.card} ${className}`.trim()}>
    {(title || eyebrow || actions) ? <header className={styles.cardHeader}>
      <div className={styles.heading}>{Icon ? <Icon size={17} aria-hidden="true" /> : null}<div>{eyebrow ? <small>{eyebrow}</small> : null}{title ? <h2>{title}</h2> : null}{meta ? <p>{meta}</p> : null}</div></div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header> : null}
    <div className={styles.cardBody}>{children}</div>
  </section>;
}

export function ContextCard({ href, eyebrow, title, subtitle, badges, facts, icon: Icon }) {
  const content = <><div className={styles.contextTop}>{Icon ? <span className={styles.contextIcon}><Icon size={16} /></span> : null}<span><small>{eyebrow}</small><strong>{naText(title)}</strong></span></div>{subtitle ? <p className={styles.contextSubtitle}>{subtitle}</p> : null}{badges ? <div className={styles.contextBadges}>{badges}</div> : null}{facts?.length ? <dl className={styles.contextFacts}>{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{naText(fact.value)}</dd></div>)}</dl> : null}</>;
  return href ? <Link href={href} className={styles.contextCard}>{content}</Link> : <div className={styles.contextCard}>{content}</div>;
}

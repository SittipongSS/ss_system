import styles from "./DetailPage.module.css";
import Link from "next/link";
import { naText } from "@/lib/format";

export function ContextualRightRail({ children, label = "ข้อมูลสรุปและการดำเนินการ", className = "" }) {
  return <aside className={`${styles.aside} ${className}`.trim()} aria-label={label}>{children}</aside>;
}

/* ไม่มี aside = ต้องยุบเหลือคอลัมน์เดียวด้วย ไม่งั้น grid ยังกันที่ 330px ไว้ให้ช่องว่าง
   (หน้าที่สลับการ์ดเข้า-ออกตามแท็บ เช่นหน้าโครงการ จะเสียความกว้างไปเปล่า ๆ) */
export function DetailPageLayout({ children, aside, asideLabel, className = "" }) {
  return <div className={`${styles.layout} ${aside ? "" : styles.layoutSolo} ${className}`.trim()}><main className={styles.main}>{children}</main>{aside ? <ContextualRightRail label={asideLabel}>{aside}</ContextualRightRail> : null}</div>;
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

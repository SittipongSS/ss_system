import styles from "./DetailPage.module.css";
import Link from "next/link";

export function DetailPageLayout({ children, aside, className = "" }) {
  return <div className={`${styles.layout} ${className}`.trim()}><main className={styles.main}>{children}</main>{aside ? <aside className={styles.aside}>{aside}</aside> : null}</div>;
}

export function ContextGrid({ children, className = "" }) {
  return <div className={`${styles.contextGrid} ${className}`.trim()}>{children}</div>;
}

export function DetailCard({ icon: Icon, eyebrow, title, meta, actions, children, className = "" }) {
  return <section className={`${styles.card} ${className}`.trim()}>
    {(title || eyebrow || actions) ? <header className={styles.cardHeader}>
      <div className={styles.heading}>{Icon ? <Icon size={17} aria-hidden="true" /> : null}<div>{eyebrow ? <small>{eyebrow}</small> : null}{title ? <h2>{title}</h2> : null}{meta ? <p>{meta}</p> : null}</div></div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header> : null}
    <div className={styles.cardBody}>{children}</div>
  </section>;
}

export function ContextCard({ href, eyebrow, title, subtitle, badges, facts, icon: Icon }) {
  const content = <><div className={styles.contextTop}>{Icon ? <span className={styles.contextIcon}><Icon size={16} /></span> : null}<span><small>{eyebrow}</small><strong>{title || "-"}</strong></span></div>{subtitle ? <p className={styles.contextSubtitle}>{subtitle}</p> : null}{badges ? <div className={styles.contextBadges}>{badges}</div> : null}{facts?.length ? <dl className={styles.contextFacts}>{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value || "-"}</dd></div>)}</dl> : null}</>;
  return href ? <Link href={href} className={styles.contextCard}>{content}</Link> : <div className={styles.contextCard}>{content}</div>;
}

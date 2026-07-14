import styles from "./SalesDetailOverview.module.css";

export function SalesStateBadge({ label, color = "var(--accent)" }) {
  if (!label) return null;
  return <span className={styles.stateBadge} style={{ "--state-color": color }}>{label}</span>;
}

export default function SalesDetailOverview({ eyebrow, title, description, badges, actions, facts = [], children, className = "" }) {
  return (
    <section className={`${styles.overviewCard} ${className}`.trim()}>
      <div className={styles.overviewHeading}>
        <div className={styles.titleBlock}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <h1>{title || "-"}</h1>
          {description ? <div className={styles.description}>{description}</div> : null}
        </div>
        {(badges || actions) ? <div className={styles.headingActions}>
          {badges ? <div className={styles.badgeRow}>{badges}</div> : null}
          {actions ? <div className={styles.actionRow}>{actions}</div> : null}
        </div> : null}
      </div>
      {facts.length ? <div className={styles.quickFacts}>
        {facts.map((fact, index) => {
          const Icon = fact.icon;
          return <div key={fact.key || `${fact.label}-${index}`}>
            {Icon ? <Icon size={17} aria-hidden="true" /> : null}
            <span><small>{fact.label}</small><strong title={typeof fact.value === "string" ? fact.value : undefined}>{fact.value ?? "-"}</strong></span>
          </div>;
        })}
      </div> : null}
      {children ? <div className={styles.extra}>{children}</div> : null}
    </section>
  );
}

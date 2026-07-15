import Workspace from "@/components/ui/Workspace";
import styles from "./SaWorkspace.module.css";

export default function SaWorkspace(props) {
  return <div className={styles.page}><Workspace {...props} /></div>;
}

export function SaPageShell({ children, className = "" }) {
  return <div className={`${styles.page} ${className}`.trim()}>{children}</div>;
}

export function SaSection({ icon, title, subtitle, actions, children, bodyClassName = "" }) {
  return <section className={styles.section}>
    {(icon || title || actions) && <header className={styles.sectionHeader}>
      <div className={styles.sectionTitle}>{icon}<div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
      {actions && <div className={styles.sectionActions}>{actions}</div>}
    </header>}
    <div className={`${styles.sectionBody} ${bodyClassName}`.trim()}>{children}</div>
  </section>;
}

export function SaMetricStrip({ children }) {
  return <section className={styles.metricStrip}>{children}</section>;
}

export function SaMetric({ icon, label, value, note, tone }) {
  return <div className={`${styles.metric} ${tone ? styles[tone] : ""}`}>
    <span className={styles.metricIcon}>{icon}</span>
    <span><small>{label}</small><strong>{value ?? "-"}</strong>{note && <em>{note}</em>}</span>
  </div>;
}

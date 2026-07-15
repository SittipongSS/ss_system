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

export function SaMetricStrip({ children, className = "", ...props }) {
  return <section className={`${styles.metricStrip} ${className}`.trim()} {...props}>{children}</section>;
}

export function SaMetric({ as: Element = "div", icon, label, value, note, tone, active = false, className = "", ...props }) {
  return <Element className={`${styles.metric} ${tone ? styles[tone] : ""} ${active ? styles.metricActive : ""} ${className}`.trim()} {...props}>
    <span className={styles.metricIcon}>{icon}</span>
    <span><small>{label}</small><strong>{value ?? "-"}</strong>{note && <em>{note}</em>}</span>
  </Element>;
}

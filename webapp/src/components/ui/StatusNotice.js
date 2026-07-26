"use client";

import styles from "./StatusNotice.module.css";

export default function StatusNotice({
  tone = "info",
  role,
  children,
  action,
  className = "",
}) {
  const resolvedRole = role || (tone === "error" ? "alert" : "status");
  return (
    <div className={`${styles.notice} ${styles[tone] || styles.info} ${className}`.trim()} role={resolvedRole}>
      <div className={styles.copy}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

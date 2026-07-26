"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import styles from "./StatusNotice.module.css";
import Button from "./Button";

const TONES = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export default function StatusNotice({
  tone = "info",
  role,
  title,
  children,
  action,
  icon: CustomIcon,
  onDismiss,
  dismissLabel = "ปิดข้อความแจ้งเตือน",
  className = "",
}) {
  const resolvedRole = role || (tone === "error" ? "alert" : "status");
  const Icon = CustomIcon || TONES[tone] || TONES.info;
  return (
    <div className={`${styles.notice} ${styles[tone] || styles.info} ${className}`.trim()} role={resolvedRole}>
      <span className={styles.icon} aria-hidden="true"><Icon size={18} /></span>
      <div className={styles.copy}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.message}>{children}</div>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
      {onDismiss ? (
        <Button
          iconOnly
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
          icon={<X size={14} aria-hidden="true" />}
        />
      ) : null}
    </div>
  );
}

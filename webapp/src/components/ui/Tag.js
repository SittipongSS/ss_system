"use client";

import { X } from "lucide-react";
import styles from "./Badge.module.css";

export default function Tag({
  children,
  label,
  tone = "neutral",
  icon: Icon,
  onRemove,
  removeLabel,
  className = "",
}) {
  const content = label ?? children;
  return (
    <span className={`${styles.base} ${styles.tag} ${className}`.trim()} data-tone={tone}>
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      <span className={styles.label}>{content}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={removeLabel || `นำ ${String(content)} ออก`}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

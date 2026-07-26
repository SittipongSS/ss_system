"use client";

import Modal from "@/components/Modal";
import styles from "./ReasonDialog.module.css";
import Button from "./Button";

export default function ReasonDialog({
  open,
  title,
  description,
  detail,
  label = "เหตุผล",
  value = "",
  onChange,
  onConfirm,
  onClose,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  placeholder,
  helpText,
  error,
  minLength = 1,
  maxLength = 500,
  rows = 4,
  tone = "danger",
  busy = false,
}) {
  const normalized = String(value || "").trim();
  const invalid = normalized.length < minLength || normalized.length > maxLength || !!error;
  const helpId = "reason-dialog-help";
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" dismissible={!busy}>
      <div className={styles.body}>
        {description ? <p className={styles.description}>{description}</p> : null}
        {detail ? <div className={`${styles.detail} ${styles[tone] || styles.warning}`}>{detail}</div> : null}
        <label className="form-group">
          <span>{label} *</span>
          <textarea
            className="textarea-premium"
            rows={rows}
            required
            minLength={minLength}
            maxLength={maxLength}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            aria-describedby={helpId}
            aria-invalid={!!error || undefined}
            placeholder={placeholder}
            autoFocus
          />
          <small id={helpId} className={error ? styles.error : styles.help}>
            {error || helpText || `${normalized.length}/${maxLength}`}
          </small>
        </label>
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button
            tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "primary"}
            onClick={onConfirm}
            disabled={busy || invalid}
          >
            {busy ? "กำลังดำเนินการ…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import StatusNotice from "./StatusNotice";

export default function ConfirmDialog({
  open,
  title = "ยืนยันการดำเนินการ",
  description,
  message,
  detail,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "default",
  danger = false,
  busy = false,
  busyLabel = "กำลังดำเนินการ…",
  error,
  hideCancel = false,
  closeOnSuccess = false,
  onError,
  onConfirm,
  onClose,
}) {
  const [internalBusy, setInternalBusy] = useState(false);
  const [internalError, setInternalError] = useState("");
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const descriptionId = useId();
  const destructive = danger || tone === "danger";
  const pending = busy || internalBusy;
  const resolvedDescription = description ?? message;
  const resolvedError = error || internalError;
  const Icon = destructive ? Trash2 : AlertTriangle;

  useEffect(() => {
    if (!open) {
      setInternalBusy(false);
      setInternalError("");
    }
  }, [open]);

  const close = () => {
    if (!pending) onClose?.();
  };

  const confirm = async () => {
    if (pending) return;
    if (!onConfirm) {
      onClose?.();
      return;
    }

    setInternalBusy(true);
    setInternalError("");
    try {
      const result = await onConfirm();
      if (result !== false && closeOnSuccess) onClose?.();
    } catch (confirmError) {
      const messageText = confirmError?.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
      setInternalError(messageText);
      onError?.(confirmError);
    } finally {
      setInternalBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      dismissible={!pending && !hideCancel}
      initialFocusRef={hideCancel ? confirmRef : cancelRef}
      ariaDescribedBy={resolvedDescription || detail || resolvedError ? descriptionId : undefined}
    >
      <div className="confirm-dialog">
        <div className={`confirm-dialog-icon${destructive ? " danger" : ""}`} aria-hidden="true">
          <Icon size={20} />
        </div>
        <div className="confirm-dialog-copy" id={descriptionId}>
          {resolvedDescription && <p>{resolvedDescription}</p>}
          {detail && <p className="confirm-dialog-detail">{detail}</p>}
        </div>
        {resolvedError ? (
          <StatusNotice tone="error" role="alert">{resolvedError}</StatusNotice>
        ) : null}
        <div className="confirm-dialog-actions">
          {!hideCancel ? (
            <button ref={cancelRef} type="button" className="btn ghost" onClick={close} disabled={pending}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            className={destructive ? "btn btn-danger" : "btn btn-accent"}
            onClick={confirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

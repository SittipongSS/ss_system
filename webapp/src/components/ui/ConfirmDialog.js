"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import StatusNotice from "./StatusNotice";
import Button from "./Button";

const CONFIRM_EVENT = "ss-system:confirm";
const ConfirmContext = createContext(null);

export function confirmAction(input, options = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const request = typeof input === "string"
    ? { ...options, description: input }
    : { ...input, ...options };
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, {
      detail: { ...request, resolve },
    }));
  });
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const close = useCallback((result = false) => {
    setRequest((current) => {
      current?.resolve?.(result);
      return null;
    });
  }, []);

  const api = useMemo(() => ({ confirm: confirmAction }), []);

  useEffect(() => {
    const receiveConfirm = (event) => setRequest(event.detail);
    window.addEventListener(CONFIRM_EVENT, receiveConfirm);
    return () => window.removeEventListener(CONFIRM_EVENT, receiveConfirm);
  }, []);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={Boolean(request)}
        title={request?.title}
        description={request?.description ?? request?.message}
        detail={request?.detail}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        danger={request?.danger}
        onConfirm={() => close(true)}
        onClose={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within ConfirmProvider");
  return context.confirm;
}

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
            <Button ref={cancelRef} variant="quiet" onClick={close} disabled={pending}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            ref={confirmRef}
            tone={destructive ? "danger" : "accent"}
            onClick={confirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

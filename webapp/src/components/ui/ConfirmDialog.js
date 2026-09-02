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
  /* ⭐ **ของที่ต้องเลือกก่อนกดยืนยัน** (มติผู้ใช้ 2026-09-02) — กล่องยืนยันส่วนใหญ่
     ถามแค่ "แน่ใจไหม" แต่บางก้าวมีของ *ไม่บังคับ* ที่กรอกตรงนั้นได้พอดี (รับเรื่อง
     คำร้อง → เลือกผู้เซ็นบนเอกสาร PDR)
     ⚠️ **ไม่ใช่ทางลัดของฟอร์ม** — อะไรที่ *บังคับ* หรือมีด่านของตัวเอง ต้องเป็นโมดัล
     ฟอร์มจริง (เช่น "แจ้งกำหนดส่ง") ไม่ใช่ยัดลงกล่องยืนยันจนกลายเป็นฟอร์มปลอมที่
     ไม่มีใครตรวจค่า · ผู้เรียกที่ไม่ส่ง `children` ได้กล่องเดิมทุก px */
  children,
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
        {children ? <div className="confirm-dialog-extra">{children}</div> : null}
        {resolvedError ? (
          <StatusNotice tone="error" role="alert">{resolvedError}</StatusNotice>
        ) : null}
        <div className="confirm-dialog-actions">
          {!hideCancel ? (
            <Button ref={cancelRef} variant="quiet" onClick={close} disabled={pending}>
              {cancelLabel}
            </Button>
          ) : null}
          {/* 🔴 2026-09-02 เดิมเป็น `accent` — โมดัลยืนยันทุกใบในระบบ (confirmAction ถูก
              เรียกหลายสิบจุด) จึงได้ปุ่มยืนยันสี terracotta ที่ระบบใช้แปลว่า "เริ่มของใหม่"
              ทั้งที่มันคือ "ยืนยันสิ่งที่ทำอยู่" เป๊ะตามนิยามของ `TONES` ใน Button.js
              ⇒ `primary` · ฝั่งทำลายยังเป็น `danger` เหมือนเดิม
              จุดเดียวนี้ผิดมากกว่าหน้าที่ทา accent เองรวมกัน และ grep `tone="accent"`
              มองไม่เห็นเลยเพราะมันนับไฟล์ที่เรียกใช้ ไม่ได้นับจอที่เรนเดอร์ */}
          <Button
            ref={confirmRef}
            tone={destructive ? "danger" : "primary"}
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

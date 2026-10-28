"use client";

import thaiText from "@/components/ThaiText";
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
  /* ⭐ **ตัวเลือกที่เปลี่ยนรายการผลลัพธ์** — วางระหว่างคำถามกับ `detail` (ไม่ใช่ท้ายกล่องแบบ `children`)
     🐞 UAT 27/10 (โมดัลอนุมัติใบสั่งขาย · แผ่น "นับ Actual ทั้งใบ / รายงวด"): แผ่นอยู่ใต้รายการผลลัพธ์ เลือกแผ่นแล้วรายการยาวขึ้น
        ⇒ แผ่นเลื่อนหนีเคอร์เซอร์ ~53px ทุกครั้งที่สลับ · วางเหนือรายการ = สิ่งที่เปลี่ยนอยู่ใต้ตัวเลือกเสมอ แผ่นอยู่กับที่
     ⭐ กล่องที่มี `lead` ยึดขอบบนของจอ (`confirm-dialog-anchored`) ไม่ใช่กึ่งกลาง — กล่องกึ่งกลางที่สูงขึ้นจะเลื่อนขึ้นครึ่งหนึ่งของส่วนที่โต
       ตัวเลือกข้างบนก็ยังหนีเคอร์เซอร์ (วัดซ้ำ 27/10: −53px) · ยึดบน = ส่วนที่โตไหลลงล่างอย่างเดียว ตัวเลือกอยู่กับที่จริง
     ⚠️ ใช้กับตัวเลือกที่ผลลัพธ์ขึ้นกับมันเท่านั้น — ของกรอกอื่นยังเป็น `children` · ไม่ส่ง = DOM เดิมทุก px */
  lead = null,
  /* ความกว้างของกล่อง — ค่าเดียวกับ `Modal` · ไม่ส่ง = "sm" ตัวเดิมของทุกผู้เรียก (งวด S2b: กล่องส่งผลที่มีไทล์สองใบขอ "md") */
  size = "sm",
}) {
  const [internalBusy, setInternalBusy] = useState(false);
  const [internalError, setInternalError] = useState("");
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const bodyRef = useRef(null);
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

  /* ⭐ **ยืนยันแล้วล้ม = ข้อผิดพลาดกับแถวปุ่มต้องอยู่ในสายตา และโฟกัสต้องกลับเข้ากล่อง**
     🐞 UAT 2026-10-08 (กล่องส่งผล/ออกเอกสารของใบประเมิน · จอ 360): ข้อผิดพลาดต่อท้ายรายการที่ยาวเกินเนื้อกล่อง — กล่องแดงโผล่ครึ่งเดียว
        ที่ขอบล่าง แถวปุ่มอยู่ใต้จอ · และปุ่มยืนยันที่ถูก `disabled` ระหว่างรอทำโฟกัสหล่นไป `body` (กด Tab ต่อไม่ได้ ต้องแตะกล่องใหม่)
     ⇒ รอจนเลิก "กำลังทำงาน" (ปุ่มกลับมากดได้) แล้วเลื่อนกล่องแดงเข้ามา และคืนโฟกัสให้ปุ่มในกล่อง
     🔄 (S2b แก้หลังตรวจจอ head-r3-19) แถวปุ่มย้ายไปโซน `footer` ที่ตรึงท้ายกล่องแล้ว ⇒ ไม่ต้องเลื่อนหาปุ่มอีก ตัวที่ต้องเลื่อนเข้ามาคือ
        กล่องแดง (ชิ้นสุดท้ายของเนื้อ) — เลื่อนแล้วมันยืนติดเหนือแถวปุ่มพอดี จึงเห็นคู่กันเหมือนเดิม · `:scope >` = กล่องแดงของกล่องยืนยันเอง
        ไม่ใช่ `role="alert"` ที่ผู้เรียกใส่มาใน `children`
     ⚠️ คืนโฟกัสเฉพาะตอนโฟกัสหลุดออกนอกกล่องแล้วเท่านั้น (คนที่ย้ายโฟกัสเองไม่ถูกดึงกลับ) · ไม่เลื่อนซ้ำ (`preventScroll`) */
  useEffect(() => {
    if (!open || !resolvedError || pending) return;
    const body = bodyRef.current;
    if (!body) return;
    body.querySelector(':scope > [role="alert"]')?.scrollIntoView({ block: "nearest" });
    const dialog = body.closest('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) {
      (confirmRef.current || cancelRef.current)?.focus({ preventScroll: true });
    }
  }, [open, resolvedError, pending]);

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

  /* ⭐ **แถวปุ่มตรึงท้ายกล่อง เนื้อเลื่อนอย่างเดียว** (S2b แก้หลังตรวจจอ head-r3-19 · ตรงกับโครงสามชั้นของ `Modal` มติผู้ใช้ 2026-08-08)
     🐞 หัวหน้า UAT รอบ 3 ข้อ 19 (จอมือถือ · กล่องส่งผลของใบที่มีพื้นที่จากแบบ): ตัวเลือก "ยืนยันหน้างาน" สองช่องดันปุ่ม "ยกเลิก" / "ส่งผล"
        ตกใต้ขอบจอ — กล่องเปิดมาโดยไม่มีปุ่มให้เห็น ต้องเลื่อนในกล่องหาเอง · เดิมแถวปุ่มเป็นชิ้นสุดท้ายของ `.drawer-body` (โซนที่เลื่อน)
     ⇒ ส่งแถวปุ่มเป็น `footer` ของ `Modal` = โซน `.drawer-footer` ที่ไม่เลื่อน (พื้นทึบ · เส้นคั่นบน) ทุกกล่องยืนยันในระบบได้พร้อมกัน
     ⚠️ กล่องสั้นที่ไม่ต้องเลื่อน: ปุ่มอยู่แถบท้ายแบบเดียวกับโมดัลฟอร์ม (ขอบบน 1px · ปุ่มกว้างขั้นต่ำ 96px ของ `.drawer-footer .btn`) ·
        จอ ≤680 ปุ่มยังสูง 44px และยืดเต็มแถว (`.confirm-dialog-actions` กินเต็มกว้างของโซน — ดู globals.css) */
  const actions = (
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
  );

  /* มี `lead` = คำอธิบายคือคำถาม + รายการผลลัพธ์ (ไม่รวมป้ายของตัวเลือก — มันมีชื่อของมันเอง) */
  const describedBy = lead
    ? [resolvedDescription && `${descriptionId}-q`, detail && `${descriptionId}-d`].filter(Boolean).join(" ") || undefined
    : resolvedDescription || detail || resolvedError ? descriptionId : undefined;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size={size}
      className={lead ? "confirm-dialog-anchored" : ""}
      dismissible={!pending && !hideCancel}
      initialFocusRef={hideCancel ? confirmRef : cancelRef}
      /* กล่องเปิดที่บรรทัดแรกเสมอ (ดู `Modal`) — เดิมปุ่มที่ได้โฟกัสแรกอยู่ท้ายเนื้อ กล่องยาวจึงเปิดมากลางเนื้อ · ปุ่มย้ายไป `footer` แล้ว
         (head-r3-19) ยังคงไว้: โฟกัสแรกต้องไม่เลื่อนเนื้อไม่ว่าปุ่มจะอยู่โซนไหน */
      initialFocusScroll={false}
      ariaDescribedBy={describedBy}
      footer={actions}
    >
      <div className="confirm-dialog" ref={bodyRef}>
        <div className={`confirm-dialog-icon${destructive ? " danger" : ""}`} aria-hidden="true">
          <Icon size={20} />
        </div>
        {lead ? (
          <div className="confirm-dialog-copy">
            {resolvedDescription && <p id={`${descriptionId}-q`}>{thaiText(resolvedDescription)}</p>}
            <div className="confirm-dialog-lead">{lead}</div>
            {detail && <p className="confirm-dialog-detail" id={`${descriptionId}-d`}>{thaiText(detail)}</p>}
          </div>
        ) : (
          <div className="confirm-dialog-copy" id={descriptionId}>
            {resolvedDescription && <p>{thaiText(resolvedDescription)}</p>}
            {detail && <p className="confirm-dialog-detail">{thaiText(detail)}</p>}
          </div>
        )}
        {children ? <div className="confirm-dialog-extra">{children}</div> : null}
        {/* กล่องแดงเป็นชิ้นสุดท้ายของเนื้อ — เลื่อนเข้ามาแล้วยืนติดเหนือแถวปุ่มที่ตรึงอยู่ (effect ข้างบน) */}
        {resolvedError ? (
          <StatusNotice tone="error" role="alert">{resolvedError}</StatusNotice>
        ) : null}
      </div>
    </Modal>
  );
}

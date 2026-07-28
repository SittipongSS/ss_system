"use client";
// กล่องยืนยัน/กรอกข้อมูลของ transition หนึ่งตัว — ตัวเดียวที่ RecordControlCard และ
// RecordActionMenu ใช้ร่วมกัน
//
// ทางแยกตั้งใจให้มีแค่ 2 ทาง:
//   ไม่มี fields → เรียก ReasonDialog เดิมตรง ๆ ไม่ห่อ ไม่ปรับ (4 หน้าที่ใช้ ReasonDialog
//     อยู่แล้ว — QT/SO — จึงไม่กระทบ และหน้าใหม่ได้หน้าตาเดียวกับของเดิมฟรี)
//   มี fields → เรนเดอร์ช่องเพิ่มด้วย primitive ที่มีอยู่ (Select/PersonSelect/
//     DateTimeInput/MoneyInput) ไม่สร้าง input ใหม่
//
// ⚠️ ห้ามยัด "ฟอร์มหลายส่วน" ลงมาที่นี่ (มติผู้ใช้: modal ฟอร์มหลายส่วนไม่อยู่ในขอบเขต) —
// ถ้า transition ต้องกรอกเยอะกว่านี้ ให้พาไปหน้า/โมดัลของมันเอง

import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Select from "@/components/ui/Select";
import PersonSelect from "@/components/ui/PersonSelect";
import DateTimeInput from "@/components/ui/DateTimeInput";
import MoneyInput from "@/components/ui/MoneyInput";
import { validateTransitionValues } from "@/lib/recordLifecycle";
import styles from "./TransitionDialog.module.css";

function TransitionField({ field, value, onChange, disabled }) {
  const common = { disabled, "aria-label": field.label || field.name };
  if (field.type === "select") {
    return (
      <Select
        {...common}
        fullWidth
        value={value ?? ""}
        options={field.options || []}
        placeholder={field.placeholder || "— เลือก —"}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === "person") {
    return (
      <PersonSelect
        users={field.users || []}
        value={value ?? ""}
        by={field.by || "id"}
        disabled={disabled}
        ariaLabel={field.label || field.name}
        onChange={onChange}
      />
    );
  }
  if (field.type === "datetime") {
    return <DateTimeInput value={value ?? ""} onChange={onChange} disabled={disabled} />;
  }
  if (field.type === "money") {
    return (
      <MoneyInput
        {...common}
        value={value ?? ""}
        placeholder={field.placeholder}
        onChange={(parsed) => onChange(parsed)}
      />
    );
  }
  return (
    <input
      {...common}
      type="text"
      className="premium-input"
      value={value ?? ""}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function TransitionDialog({
  open,
  transition,
  values = {},
  onChange,
  onConfirm,
  onClose,
  busy = false,
}) {
  if (!open || !transition) return null;

  const { reason, reasonPolicy, fields, confirm, label } = transition;
  const title = confirm?.title || reasonPolicy.title || label;
  const description = confirm?.message || reasonPolicy.description || "";
  const setValue = (name, next) => onChange?.({ ...values, [name]: next });
  const invalidReason = validateTransitionValues(transition, values);

  // ไม่ขอเหตุผล และไม่มีช่องเพิ่ม → กล่องยืนยันล้วน
  if (reason === "none" && !fields.length) {
    return (
      <Modal open={open} onClose={onClose} title={title} size="sm" dismissible={!busy}>
        <div className={styles.body}>
          {description ? <p className={styles.description}>{description}</p> : null}
          <div className="action-bar">
            <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
            <Button
              tone={reasonPolicy.tone === "danger" ? "danger" : reasonPolicy.tone === "warning" ? "warning" : "primary"}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "กำลังดำเนินการ…" : confirm?.confirmLabel || label}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ขอเหตุผลอย่างเดียว → ส่งต่อให้ ReasonDialog เดิม ไม่แตะของที่ใช้อยู่ 4 หน้า
  if (!fields.length) {
    const text = String(values.reason || "");
    return (
      <ReasonDialog
        open={open}
        title={title}
        description={description}
        detail={reasonPolicy.detail}
        label={reasonPolicy.label}
        value={text}
        onChange={(next) => setValue("reason", next)}
        onClose={onClose}
        onConfirm={onConfirm}
        confirmLabel={reasonPolicy.confirmLabel || label}
        placeholder={reasonPolicy.placeholder}
        helpText={reasonPolicy.helpText
          || (reasonPolicy.minLength
            ? `อย่างน้อย ${reasonPolicy.minLength} ตัวอักษร · ${text.trim().length}/${reasonPolicy.maxLength}`
            : `ไม่บังคับ · ${text.trim().length}/${reasonPolicy.maxLength}`)}
        error={text ? invalidReason || "" : ""}
        minLength={reasonPolicy.minLength}
        maxLength={reasonPolicy.maxLength}
        tone={reasonPolicy.tone}
        busy={busy}
      />
    );
  }

  // มีช่องเพิ่ม → ประกอบเอง แต่ยังใช้ primitive เดิมทุกช่อง
  const reasonRequired = reason === "required";
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" dismissible={!busy}>
      <div className={styles.body}>
        {description ? <p className={styles.description}>{description}</p> : null}
        {reasonPolicy.detail ? (
          <div className={`${styles.detail} ${styles[reasonPolicy.tone] || styles.warning}`}>{reasonPolicy.detail}</div>
        ) : null}
        {fields.map((field) => (
          <label className="form-group" key={field.name}>
            <span>{field.label || field.name}{field.required ? " *" : ""}</span>
            <TransitionField
              field={field}
              value={values[field.name]}
              onChange={(next) => setValue(field.name, next)}
              disabled={busy}
            />
            {field.hint ? <small className={styles.help}>{field.hint}</small> : null}
          </label>
        ))}
        {reason !== "none" ? (
          <label className="form-group">
            <span>{reasonPolicy.label}{reasonRequired ? " *" : ""}</span>
            <textarea
              className="textarea-premium"
              rows={4}
              required={reasonRequired}
              minLength={reasonPolicy.minLength}
              maxLength={reasonPolicy.maxLength}
              value={values.reason || ""}
              placeholder={reasonPolicy.placeholder}
              onChange={(event) => setValue("reason", event.target.value)}
            />
            <small className={styles.help}>
              {reasonRequired
                ? `อย่างน้อย ${reasonPolicy.minLength} ตัวอักษร · ${String(values.reason || "").trim().length}/${reasonPolicy.maxLength}`
                : `ไม่บังคับ · ${String(values.reason || "").trim().length}/${reasonPolicy.maxLength}`}
            </small>
          </label>
        ) : null}
        {invalidReason ? <p className={styles.error}>{invalidReason}</p> : null}
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button
            tone={reasonPolicy.tone === "danger" ? "danger" : reasonPolicy.tone === "warning" ? "warning" : "primary"}
            onClick={onConfirm}
            disabled={busy || !!invalidReason}
          >
            {busy ? "กำลังดำเนินการ…" : reasonPolicy.confirmLabel || label}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";
// กล่องยืนยัน/กรอกข้อมูลของ transition หนึ่งตัว — ตัวเดียวที่ RecordControlCard และ
// RecordActionMenu ใช้ร่วมกัน
//
// ทางแยกตั้งใจให้มีแค่ 2 ทาง:
//   ไม่มี fields → เรียก ReasonDialog เดิมตรง ๆ ไม่ห่อ ไม่ปรับ (4 หน้าที่ใช้ ReasonDialog
//     อยู่แล้ว — QT/SO — จึงไม่กระทบ และหน้าใหม่ได้หน้าตาเดียวกับของเดิมฟรี)
//   มี fields → เรนเดอร์ช่องเพิ่มด้วย primitive ที่มีอยู่ (Select/PersonSelect/
//     DateTimeInput/DateInput/MoneyInput) ไม่สร้าง input ใหม่
//
// ⚠️ ห้ามยัด "ฟอร์มหลายส่วน" ลงมาที่นี่ (มติผู้ใช้: modal ฟอร์มหลายส่วนไม่อยู่ในขอบเขต) —
// ถ้า transition ต้องกรอกเยอะกว่านี้ ให้พาไปหน้า/โมดัลของมันเอง

import { Fragment } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Select from "@/components/ui/Select";
import PersonSelect from "@/components/ui/PersonSelect";
import PersonLoadSelect from "@/components/ui/PersonLoadSelect";
import DateTimeInput from "@/components/ui/DateTimeInput";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import OptionTiles from "@/components/ui/OptionTiles";
import {
  fieldOptions, fieldUsers, fieldVisible, resolveLabel, validateTransitionValues, visibleFieldValues,
} from "@/lib/recordLifecycle";
import styles from "./TransitionDialog.module.css";
import Textarea from "@/components/ui/Textarea";

function TransitionField({ field, record, value, onChange, disabled }) {
  const common = { disabled, "aria-label": field.label || field.name };
  if (field.type === "select") {
    return (
      <Select
        {...common}
        fullWidth
        value={value ?? ""}
        options={fieldOptions(field, record)}
        placeholder={field.placeholder || "— เลือก —"}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === "tiles") {
    /* ⚠️ ใช้ `fieldOptions` ตัวเดียวกับ select — ตัวเลือกที่ขึ้นกับแถวต้องเป็นฟังก์ชันได้
       ⚠️ ป้ายของตัวเลือกที่กดไม่ได้ต้องบอกเหตุผลในตัวเอง (Select/OptionTiles ไม่มีที่
       ให้ tooltip) — กติกาเดียวกับที่ล็อกทีมในโมดัลคัดกรอง */
    return (
      <OptionTiles
        value={value ?? ""}
        onChange={onChange}
        options={fieldOptions(field, record)}
        disabled={disabled}
        ariaLabel={field.label || field.name}
      />
    );
  }
  if (field.type === "person") {
    return (
      <PersonSelect
        /* รายชื่อบางชุดขึ้นกับตัวระเบียน ไม่ใช่ตัวคนที่เปิดหน้า — ดู fieldUsers() */
        users={fieldUsers(field, record)}
        value={value ?? ""}
        by={field.by || "id"}
        disabled={disabled}
        ariaLabel={field.label || field.name}
        onChange={onChange}
      />
    );
  }
  if (field.type === "person-load") {
    /* เลือกคนโดยเห็นภาระงานพร้อมกัน — ตัวเลขติดมากับ user แต่ละคนแล้ว (ดู withWorkload)
       `noteOf` รับ record ด้วย เพราะป้าย "เคยถือใบนี้มาแล้ว" ขึ้นกับใบ ไม่ใช่ตัวคน */
    return (
      <PersonLoadSelect
        users={fieldUsers(field, record)}
        value={value ?? ""}
        disabled={disabled}
        ariaLabel={field.label || field.name}
        noteOf={field.noteOf ? (user) => field.noteOf(record, user) : undefined}
        onChange={onChange}
      />
    );
  }
  if (field.type === "datetime") {
    return <DateTimeInput value={value ?? ""} onChange={onChange} disabled={disabled} />;
  }
  /* ⚠️ วันล้วน ๆ ต้องผ่าน `DateInput` เสมอ — `<input type="date">` ดิบแสดงตาม locale
     ของเครื่อง (en-US เห็น mm/dd/yyyy) และบังคับ ค.ศ. · ก่อนมีสาขานี้ field ชนิด
     "date" ตกไปที่ input ข้อความข้างล่างเงียบ ๆ ซึ่งอ่านเป็นวันไม่ได้เลย */
  if (field.type === "date") {
    return (
      <DateInput
        value={value ?? ""}
        onChange={onChange}
        disabled={disabled}
        min={field.min}
        ariaLabel={field.label || field.name}
      />
    );
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
  /* ตัวระเบียนที่กำลังทำรายการ — จำเป็นเฉพาะตอน field ประกาศตัวเลือกเป็นฟังก์ชัน
     (ดู fieldUsers) · ไม่ส่งมาก็ยังทำงานได้กับ field ที่ตัวเลือกตายตัว */
  record = null,
  values = {},
  onChange,
  onConfirm,
  onClose,
  busy = false,
}) {
  if (!open || !transition) return null;

  const { reason, reasonPolicy, fields, confirm } = transition;
  // ป้ายบางตัวเป็นฟังก์ชันของ record (ดู resolveLabel) — หัวกล่องกับปุ่มยืนยันต้องได้คำ
  // เดียวกับปุ่มที่ผู้ใช้เพิ่งกด ไม่งั้นกดปุ่ม "นัดเพิ่ม" แล้วกล่องขึ้นหัวว่า "บันทึกนัดประชุม"
  const label = resolveLabel(transition.label, record);
  const title = confirm?.title || reasonPolicy.title || label;
  const description = confirm?.message || reasonPolicy.description || "";
  const setValue = (name, next) => onChange?.({ ...values, [name]: next });
  const invalidReason = validateTransitionValues(transition, values, record);
  /* 🪤 ค่าของช่องที่ถูกซ่อนต้องไม่ถูกส่งไป — ผู้ใช้เลือก "ยังไม่พร้อม" กรอกวันกลับมาถาม
     แล้วเปลี่ยนใจไปเลือก "งบไม่ถึง" ค่าที่ค้างอยู่จะติดไปกับ payload โดยไม่มีใครเห็น */
  const submit = () => onConfirm?.(visibleFieldValues(transition, record, values));
  /* 🔴 ปุ่มยืนยันต้องพูดถึง **สิ่งที่กำลังจะเกิด** ไม่ใช่ชื่อปุ่มที่กดเข้ามา
     กล่องที่มีหลายปลายทาง (ดู `actionFrom`) เลือก "ไม่ไปต่อ" แล้วปุ่มยังเขียนว่า
     "บันทึกการติดต่อ" = ปิดลีดถาวรใต้ป้ายที่ฟังดูไม่มีพิษภัย */
  const outcome = transition.confirmFrom?.(values, record) || null;
  /* บรรทัดที่ค่าว่างถูกตัดทิ้งตั้งแต่ที่นี่ — กล่องบริบทที่ขึ้น "—" ครึ่งกล่อง
     อ่านเหมือนระบบพัง มากกว่าจะอ่านว่า "ใบนี้ยังไม่มีเรื่องพวกนั้น" */
  const contextRows = (transition.context?.(record) || []).filter((row) => row?.value);
  const outcomeTone = outcome?.tone || reasonPolicy.tone;

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
              onClick={submit}
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
        onConfirm={submit}
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
    <Modal open={open} onClose={onClose} title={title} size={transition.dialogSize || "sm"} dismissible={!busy}>
      <div className={styles.body}>
        {description ? <p className={styles.description}>{description}</p> : null}
        {reasonPolicy.detail ? (
          <div className={`${styles.detail} ${styles[reasonPolicy.tone] || styles.warning}`}>{reasonPolicy.detail}</div>
        ) : null}
        {contextRows.length > 0 && (
          <dl className={styles.context}>
            {contextRows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {fields.filter((field) => fieldVisible(field, record, values)).map((field) => (
          <label className="form-group" key={field.name}>
            <span>{field.label || field.name}{field.required ? " *" : ""}</span>
            <TransitionField
              field={field}
              record={record}
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
            <Textarea
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
            tone={outcomeTone === "danger" ? "danger" : outcomeTone === "warning" ? "warning" : "primary"}
            onClick={submit}
            disabled={busy || !!invalidReason}
          >
            {busy ? "กำลังดำเนินการ…" : outcome?.label || reasonPolicy.confirmLabel || label}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

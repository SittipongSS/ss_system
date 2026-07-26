"use client";
// ── Canonical action buttons (Change Request §1) ─────────────────────────────
// ปุ่ม action หลัก (อนุมัติ/ตีกลับ/แก้ไข/พัก/ลบ/ยื่น ...) ต้องหน้าตา + ตำแหน่ง
// เหมือนกันทุกโมดูล: "สีตามความหมาย + ไอคอน + ข้อความ" จัดชิดขวา gap เท่ากัน.
// ใช้ <ActionBar> ครอบกลุ่มปุ่ม แล้ววางปุ่มด้วย <ActionButton kind="...">.
import {
  Check, Undo2, Pencil, Unlock, Pause, Play, Trash2, Send, ExternalLink, Ban, ArrowRight,
  Copy, Download, Printer, RotateCcw, Save, XCircle,
} from "lucide-react";

// แต่ละ kind ผูกสี (คลาส .btn-*) + ไอคอน + ข้อความเริ่มต้นไว้ที่เดียว — แก้ที่นี่
// มีผลทั้งระบบ. ปุ่มที่ต้องใช้ข้อความ/ไอคอนเฉพาะบริบท ส่ง label/icon override ได้
// โดยยังคงสีตามความหมายเดิม (เช่น submit ที่เขียนว่า "เริ่มยื่น" / "บันทึกชำระภาษี").
const KINDS = {
  approve: { cls: "btn-primary", Icon: Check, label: "อนุมัติ" },
  reject: { cls: "btn-danger", Icon: Undo2, label: "ตีกลับ" },
  stop: { cls: "btn-danger", Icon: Ban, label: "ไม่ไปต่อ" },
  edit: { cls: "btn-secondary", Icon: Pencil, label: "แก้ไข" },
  reedit: { cls: "btn-secondary", Icon: Unlock, label: "ขอแก้ไข" },
  pause: { cls: "btn-warning", Icon: Pause, label: "พัก" },
  resume: { cls: "btn-secondary", Icon: Play, label: "เปิดงานต่อ" },
  delete: { cls: "btn-danger", Icon: Trash2, label: "ลบ" },
  open: { cls: "btn-secondary", Icon: ExternalLink, label: "เปิด" },
  goto: { cls: "btn-secondary", Icon: ArrowRight, label: "ไปที่" },
  submit: { cls: "btn-primary", Icon: Send, label: "ยื่น" },
  save: { cls: "btn-primary", Icon: Save, label: "บันทึก" },
  print: { cls: "btn-secondary", Icon: Printer, label: "ออกเอกสาร" },
  download: { cls: "btn-secondary", Icon: Download, label: "ดาวน์โหลด" },
  restore: { cls: "btn-secondary", Icon: RotateCcw, label: "คืนเป็นฉบับร่าง" },
  cancel: { cls: "btn-danger", Icon: XCircle, label: "ยกเลิก" },
  // ── workflow ของเอกสารควบคุม (มติ 2026-07-26) ──────────────────────────────
  // withdraw = ถอนคำขอของตัวเองก่อนได้รับอนุมัติ **ไม่ใช่การตีกลับ** จึงไม่ใช่ปุ่มแดง
  //   (เดิม QT ยืม kind:"reject" = แดง / SO ยืม kind:"restore" = เทา ปุ่มเดียวกันคนละสี)
  // revise = ออกฉบับใหม่จากใบที่อนุมัติแล้ว — ฉบับเดิมยังอยู่ครบ ไม่ใช่การทำลาย
  //   (SO เขียนทับ label เป็น "ถอดอนุมัติและออก Revision" เพราะพ่วงการถอดอนุมัติด้วย)
  withdraw: { cls: "btn-secondary", Icon: Undo2, label: "ถอนการยื่น" },
  revise: { cls: "btn-secondary", Icon: Copy, label: "ออก Revision" },
};

// กล่องครอบกลุ่มปุ่ม action — จัดชิดขวา, ระยะห่างเท่ากัน, ตัดบรรทัดเมื่อแคบ.
export function ActionBar({ children, className = "", ...props }) {
  return (
    <div className={`action-bar ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

// ปุ่ม action เดี่ยว. kind = ความหมาย (กำหนดสี+ไอคอน+ข้อความเริ่มต้น).
// label/icon ส่ง override ได้ (คงสีตาม kind), icon={null} = ซ่อนไอคอน.
export function ActionButton({ as: Component = "button", kind, label, icon, variant = "filled", iconOnly = false, className = "", children, ...props }) {
  const k = KINDS[kind] || {};
  const Icon = icon === undefined ? k.Icon : icon;
  const text = children ?? label ?? k.label;
  const defaultProps = Component === "button" && props.type === undefined ? { type: "button" } : {};
  return (
    <Component
      className={`${iconOnly ? "btn-icon" : "btn"} ${k.cls || "btn-secondary"} action-${variant} flex items-center gap-1.5 ${className}`.trim()}
      aria-label={props["aria-label"] || (iconOnly ? text : undefined)}
      {...defaultProps}
      {...props}
    >
      {Icon ? <Icon size={15} /> : null}
      {iconOnly ? null : text}
    </Component>
  );
}

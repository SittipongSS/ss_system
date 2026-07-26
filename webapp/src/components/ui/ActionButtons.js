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
  // คำศัพท์ที่ตกลงกันแล้ว — สองคำนี้ต่างกันที่ "ใครเป็นคนทำ" ไม่ใช่ผลลัพธ์ และตัวกริยา
  // บอกทิศทางเอง: **ตีกลับให้**แก้ไข = คนอื่นส่งมาให้เรา · **ดึงกลับมา**แก้ไข = เราดึงของเราเอง
  //   reject   = ผู้อนุมัติส่งเอกสารกลับให้ผู้จัดทำ พร้อมเหตุผลที่ผู้จัดทำมองเห็น (แดง)
  //   withdraw = ผู้ยื่นดึงคำขอของตัวเองคืนก่อนถูกอนุมัติ — **ไม่ใช่การตีกลับ** จึงไม่ใช่ปุ่มแดง
  // เลิกใช้คำว่า "ถอน/ถอด" ทั้งคู่: ต่างกันตัวสะกดเดียวแต่คนละความหมาย อ่านผิดกันตลอด
  // (ระวัง: "ถอด VAT" / "ถอด FG ออกจากโครงการ" เป็นคำละความหมาย ห้ามไปแก้)
  // revise = ออกฉบับใหม่จากใบที่อนุมัติแล้ว — ฉบับเดิมยังอยู่ครบ ไม่ใช่การทำลาย
  withdraw: { cls: "btn-secondary", Icon: Undo2, label: "ดึงกลับมาแก้ไข" },
  revise: { cls: "btn-secondary", Icon: Copy, label: "ออก Rev." },
  // ยกเลิกอนุมัติ (mig 0166) = ปลดล็อกเอกสารที่อนุมัติแล้วเพื่อออกฉบับใหม่ **ยอด Actual
  // หลุดที่ปุ่มนี้** จึงเป็น warning ไม่ใช่ secondary — แต่ไม่ใช่ danger เพราะไม่ได้ทำลาย
  // อะไร (คนละปุ่มกับ "ยกเลิก SO" ที่จบเอกสารทางธุรกิจ ซึ่งเป็น cancel/danger)
  revoke: { cls: "btn-warning", Icon: Unlock, label: "ยกเลิกอนุมัติ" },
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

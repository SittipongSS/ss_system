"use client";
// ── Canonical action buttons (Change Request §1) ─────────────────────────────
// ปุ่ม action หลัก (อนุมัติ/ตีกลับ/แก้ไข/พัก/ลบ/ยื่น ...) ต้องหน้าตา + ตำแหน่ง
// เหมือนกันทุกโมดูล: "สีตามความหมาย + ไอคอน + ข้อความ" จัดชิดขวา gap เท่ากัน.
// ใช้ <ActionBar> ครอบกลุ่มปุ่ม แล้ววางปุ่มด้วย <ActionButton kind="...">.
import {
  Check, Undo2, Pencil, Unlock, Pause, Play, Trash2, Send, ExternalLink, Ban, ArrowRight,
  Copy, Download, Printer, RotateCcw, RefreshCw, Save, XCircle, CornerUpLeft,
} from "lucide-react";
import Button from "@/components/ui/Button";

// แต่ละ kind ผูกสี (tone ของ Button) + ไอคอน + ข้อความเริ่มต้นไว้ที่เดียว — แก้ที่นี่
// มีผลทั้งระบบ. ปุ่มที่ต้องใช้ข้อความ/ไอคอนเฉพาะบริบท ส่ง label/icon override ได้
// โดยยังคงสีตามความหมายเดิม (เช่น submit ที่เขียนว่า "เริ่มยื่น" / "บันทึกชำระภาษี").
// ไฟล์นี้เป็น "ชั้นความหมาย" เท่านั้น การประกอบคลาสจริงอยู่ที่ components/ui/Button.js
const KINDS = {
  approve: { tone: "primary", Icon: Check, label: "อนุมัติ" },
  reject: { tone: "danger", Icon: Undo2, label: "ตีกลับ" },
  stop: { tone: "danger", Icon: Ban, label: "ไม่ไปต่อ" },
  edit: { tone: "neutral", Icon: Pencil, label: "แก้ไข" },
  reedit: { tone: "neutral", Icon: Unlock, label: "ขอแก้ไข" },
  pause: { tone: "warning", Icon: Pause, label: "พัก" },
  resume: { tone: "neutral", Icon: Play, label: "เปิดงานต่อ" },
  delete: { tone: "danger", Icon: Trash2, label: "ลบ" },
  open: { tone: "neutral", Icon: ExternalLink, label: "เปิด" },
  goto: { tone: "neutral", Icon: ArrowRight, label: "ไปที่" },
  submit: { tone: "primary", Icon: Send, label: "ยื่น" },
  save: { tone: "primary", Icon: Save, label: "บันทึก" },
  print: { tone: "neutral", Icon: Printer, label: "ออกเอกสาร" },
  download: { tone: "neutral", Icon: Download, label: "ดาวน์โหลด" },
  restore: { tone: "neutral", Icon: RotateCcw, label: "คืนเป็นฉบับร่าง" },
  cancel: { tone: "danger", Icon: XCircle, label: "ยกเลิก" },
  // ── workflow ของเอกสารควบคุม (มติ 2026-07-26) ──────────────────────────────
  // คำศัพท์ที่ตกลงกันแล้ว — สองคำนี้ต่างกันที่ "ใครเป็นคนทำ" ไม่ใช่ผลลัพธ์ และตัวกริยา
  // บอกทิศทางเอง: **ตีกลับให้**แก้ไข = คนอื่นส่งมาให้เรา · **ดึงกลับมา**แก้ไข = เราดึงของเราเอง
  //   reject   = ผู้อนุมัติส่งเอกสารกลับให้ผู้จัดทำ พร้อมเหตุผลที่ผู้จัดทำมองเห็น (แดง)
  //   withdraw = ผู้ยื่นดึงคำขอของตัวเองคืนก่อนถูกอนุมัติ — **ไม่ใช่การตีกลับ** จึงไม่ใช่ปุ่มแดง
  // เลิกใช้คำว่า "ถอน/ถอด" ทั้งคู่: ต่างกันตัวสะกดเดียวแต่คนละความหมาย อ่านผิดกันตลอด
  // (ระวัง: "ถอด VAT" / "ถอด FG ออกจากโครงการ" เป็นคำละความหมาย ห้ามไปแก้)
  // revise = ออกฉบับใหม่จากใบที่อนุมัติแล้ว — ฉบับเดิมยังอยู่ครบ ไม่ใช่การทำลาย
  withdraw: { tone: "neutral", Icon: Undo2, label: "ดึงกลับมาแก้ไข" },
  revise: { tone: "neutral", Icon: Copy, label: "ออก Rev." },
  // ย้อนการอนุมัติ (mig 0166) = ปลดล็อกเอกสารที่อนุมัติแล้วเพื่อออกฉบับใหม่ **ยอด Actual
  // หลุดที่ปุ่มนี้** จึงเป็น warning ไม่ใช่ secondary — แต่ไม่ใช่ danger เพราะไม่ได้ทำลาย
  // อะไร (คนละปุ่มกับ "ยกเลิก SO" ที่จบเอกสารทางธุรกิจ ซึ่งเป็น cancel/danger)
  revoke: { tone: "warning", Icon: Unlock, label: "ย้อนการอนุมัติ" },

  // ── kind ของ record ที่มี lifecycle (ลีด/ดีล/โครงการ) ──────────────────────
  // 🐞 5 ตัวนี้อยู่ใน BACKWARD_KINDS ของ lib/recordLifecycle.js มาตั้งแต่ต้น แต่ **ไม่เคย
  // มีในตารางนี้** → `KINDS[kind]` เป็น undefined → ปุ่มออกมา **ไม่มีไอคอนและไม่มีสี**
  // เงียบ ๆ (ผู้ใช้ทักจากภาพจริง 2026-08-01: "ตีกลับ"/"ไม่ไปต่อ" โล่งอยู่ปุ่มเดียวในกลุ่ม)
  // มี `recordActionKinds.test.mjs` บังคับให้สองไฟล์ตรงกันแล้ว เพิ่ม kind ใหม่ต้องมาที่นี่ด้วย
  //
  // ไล่ระดับความรุนแรง — ไม่ใช่ทาแดงหมดเพราะทั้งกลุ่มอยู่ช่อง danger:
  //   ยังกู้ได้ (warning) : bounce = ส่งกลับต้นทาง · revert = ย้อนสถานะ
  //   ปิดเส้นทาง (danger) : disqualify = ไม่ไปต่อ · drop = ยกเลิกดีล/โครงการ
  //   ไม่ได้ทำลาย (neutral): reopen = เปิดใหม่หลังปิด
  bounce: { tone: "warning", Icon: CornerUpLeft, label: "ตีกลับ" },
  revert: { tone: "warning", Icon: Undo2, label: "ย้อนสถานะ" },
  disqualify: { tone: "danger", Icon: Ban, label: "ไม่ไปต่อ" },
  drop: { tone: "danger", Icon: XCircle, label: "ยกเลิก" },
  reopen: { tone: "neutral", Icon: RefreshCw, label: "เปิดใหม่" },
};

/** ความหมายของ kind (ไอคอน/สี/ข้อความ) — ให้เมนูและที่อื่นหยิบไปใช้ได้โดยไม่ต้องรู้จัก KINDS */
export function kindMeta(kind) {
  return KINDS[kind] || null;
}

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
  return (
    <Button
      as={Component}
      tone={k.tone || "neutral"}
      variant={variant}
      iconOnly={iconOnly}
      icon={Icon ? <Icon size={15} /> : null}
      className={`flex items-center gap-1.5 ${className}`.trim()}
      aria-label={props["aria-label"] || (iconOnly ? text : undefined)}
      {...props}
    >
      {text}
    </Button>
  );
}

"use client";
// ปุ่มท้ายแถวตาราง สำหรับ record ที่มี lifecycle (ลีด/ดีล/โครงการ)
//
// **มติผู้ใช้ 2026-08-01 (แทนที่มติข้อ 2 เดิม)** — แถวเหลือ 2 ชิ้น:
//   1. ปุ่ม "ก้าวถัดไป" ปุ่มเดียว **มีสีตามขั้น** (= slot primary จาก lifecycle.available())
//   2. เมนู "…" รวมที่เหลือ: transition อื่น (ตีกลับ / ไม่ไปต่อ) + แก้ไข + ลบ
//
// ที่มา: รอบ #870 ตัดตีกลับ/ไม่ไปต่อ ออกจากแถวไปไว้บนการ์ดที่หน้ารายละเอียด ผู้ใช้บอกว่า
// คิวจริงต้องกดจากหน้ารายการได้ · แต่เอากลับมาเรียงเป็นปุ่มทั้งหมด (ของเดิม 3 ปุ่ม + 2
// ไอคอน ≈ 345px) ก็บีบคอลัมน์อื่นจนอ่านไม่ออก — เมนู "…" ได้ทั้งสองอย่าง
//
// ⚠️ ลิงก์ "จัดการ" (`manageHref`) ใส่เฉพาะตารางที่ยังไปหน้ารายละเอียดจากที่อื่นไม่ได้
// ถ้าชื่อในแถวเป็นลิงก์อยู่แล้ว ไม่ต้องส่งมา (มติ 2026-08-01)
// ⚠️ "คลิกทั้งแถว" ไม่นับว่าไปได้แล้ว — ใช้ได้เฉพาะเมาส์ ต้องมีลิงก์จริงเสมอ

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import RowActionMenu from "@/components/ui/RowActionMenu";
import TransitionDialog from "@/components/ui/TransitionDialog";
import styles from "./RecordActionMenu.module.css";

export default function RecordActionMenu({
  lifecycle,
  record,
  user,
  manageHref,
  onTransition,
  /* ดัก transition ก่อนเปิดกล่องกรอก — คืน true = หน้าจัดการเองแล้ว (ดู RecordControlCard) */
  onSelect,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = false,
  busy = false,
  manageLabel = "จัดการ",
  /* ข้อความอ้างอิงแถว เอาไปต่อท้าย aria-label ของปุ่ม "…" ให้โปรแกรมอ่านหน้าจอรู้ว่าแถวไหน */
  recordLabel = "",
  className = "",
}) {
  const [pending, setPending] = useState(null);

  if (!lifecycle || !record) return null;

  const entries = lifecycle.available(record, user);
  // ก้าวถัดไป = primary ตัวเดียว (available() การันตีไว้แล้วว่าไม่เกิน 1)
  const step = entries.find((entry) => entry.slot === "primary") || null;

  const openTransition = (entry) => {
    if (onSelect?.(entry.transition) === true) return;
    setPending({ transition: entry.transition, values: {} });
  };

  /* ทุกอย่างที่ไม่ใช่ก้าวถัดไป ลงเมนูหมด — เรียงตามน้ำหนัก: เดินหน้ารอง → แก้ไข → อันตราย
     `separatorBefore` ขีดเส้นแยก "จัดการตัวระเบียน" ออกจาก "ย้ายสถานะ" */
  const rest = entries.filter((entry) => entry !== step);
  const items = [
    ...rest.filter((entry) => entry.slot === "secondary").map((entry) => ({
      id: entry.id,
      label: entry.rowLabel || entry.label,
      icon: entry.icon,
      tone: "neutral",
      disabled: entry.disabled,
      disabledReason: entry.disabledReason,
      onClick: () => openTransition(entry),
    })),
    ...(onEdit && canEdit
      ? [{ id: "edit", label: "แก้ไขข้อมูล", icon: Pencil, tone: "neutral", separatorBefore: true, onClick: onEdit }]
      : []),
    ...rest.filter((entry) => entry.slot === "danger").map((entry, index) => ({
      id: entry.id,
      label: entry.rowLabel || entry.label,
      icon: entry.icon,
      tone: "danger",
      // ขีดเส้นก่อนกลุ่มอันตราย ถ้ายังไม่มีใครขีดไว้ก่อนหน้า
      separatorBefore: index === 0 && !(onEdit && canEdit),
      disabled: entry.disabled,
      disabledReason: entry.disabledReason,
      onClick: () => openTransition(entry),
    })),
    ...(onDelete && canDelete
      ? [{ id: "delete", label: "ลบรายการนี้", icon: Trash2, tone: "danger", onClick: onDelete }]
      : []),
  ];

  const run = async () => {
    if (!pending) return;
    const ok = await onTransition?.(pending.transition.id, pending.values);
    if (ok !== false) setPending(null);
  };

  return (
    <div className={`${styles.row} ${className}`.trim()}>
      {/* ช่องปุ่มก้าวถัดไปกว้างคงที่ทุกแถว — ไม่งั้นเมนู "…" จะขยับตามความยาวป้ายของ
          แต่ละแถว อ่านเป็นคอลัมน์ไม่ได้ · แถวที่ไม่มีก้าวถัดไปก็ยังกินที่เท่าเดิม */}
      <span className={styles.step}>
        {step ? (
          <ActionButton
            kind={step.kind}
            label={step.rowLabel || step.label}
            /* ทึบ + สีตามขั้น (rowTone) — กวาดตาลงคอลัมน์แล้วเห็นว่าแถวไหนค้างอยู่ขั้นไหน
               สีมาจากคลาสใน CSS module ที่แมป ROW_TONES ไว้ที่เดียว ไม่ใช่ inline style */
            variant="filled"
            className={`${styles.stepButton} ${styles[`tone-${step.rowTone || "navy"}`] || ""}`.trim()}
            disabled={busy || step.disabled}
            /* ป้ายในแถวถูกย่อ — เอาป้ายเต็มมาไว้ที่ tooltip ไม่ให้ความหมายหาย */
            title={step.disabledReason || step.label}
            onClick={() => openTransition(step)}
          />
        ) : null}
      </span>

      <RowActionMenu
        items={items}
        busy={busy}
        label={recordLabel ? `การจัดการอื่นของ ${recordLabel}` : "การจัดการอื่น"}
      />

      {manageHref ? (
        <Link href={manageHref} className={styles.manage}>{manageLabel}</Link>
      ) : null}

      <TransitionDialog
        open={!!pending}
        transition={pending?.transition}
        values={pending?.values || {}}
        onChange={(values) => setPending((current) => (current ? { ...current, values } : current))}
        onConfirm={run}
        onClose={() => setPending(null)}
        busy={busy}
      />
    </div>
  );
}

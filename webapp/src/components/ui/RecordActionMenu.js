"use client";
// ปุ่มท้ายแถวตาราง สำหรับ record ที่มี lifecycle (ลีด/ดีล/โครงการ)
//
// มติผู้ใช้ ข้อ 2 — แถวตารางเหลือเท่านี้:
//   1. ปุ่ม "ก้าวถัดไป" ปุ่มเดียว (= slot primary จาก lifecycle.available() ตัวเดียวกับการ์ด)
//   2. ไอคอนแก้ไข / ลบ
//   3. ลิงก์ "จัดการ" (`manageHref`) — **ใส่เฉพาะตารางที่ยังไปหน้ารายละเอียดจากที่อื่นไม่ได้**
//      มติผู้ใช้ 2026-08-01: ถ้าชื่อในแถวเป็นลิงก์อยู่แล้ว ลิงก์นี้คือทางที่สองไปที่เดิม
//      กินที่ท้ายแถวและแย่งสายตาจากปุ่มก้าวถัดไป — ไม่ต้องส่ง manageHref มา
//      ⚠️ "คลิกทั้งแถว" ไม่นับว่าไปได้แล้ว — มันใช้ได้เฉพาะเมาส์ ต้องมีลิงก์จริงเสมอ
//      ไม่ที่ชื่อก็ที่นี่ ไม่งั้นคีย์บอร์ด/โปรแกรมอ่านหน้าจอเข้าหน้ารายละเอียดไม่ได้เลย
//
// ทำไมไม่โชว์ทุกปุ่มในแถว: ตารางลีด/ดีลเคยมีปุ่มเรียงยาวจนอ่านไม่ออกว่าอันไหนคือก้าวถัดไป
// และแถวกับหน้ารายละเอียดคิดกติกาแยกกันจนปุ่มโผล่ไม่ตรงกัน. ที่นี่กินจาก available()
// ตัวเดียวกับการ์ด → เห็นปุ่มไหนในแถว แปลว่าในการ์ดก็กดได้ ไม่มีทางเถียงกัน

import { useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/ActionButtons";
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
  className = "",
}) {
  const [pending, setPending] = useState(null);

  if (!lifecycle || !record) return null;

  // ก้าวถัดไป = primary ตัวเดียว (available() การันตีไว้แล้วว่าไม่เกิน 1)
  const step = lifecycle.available(record, user).find((entry) => entry.slot === "primary") || null;

  const run = async () => {
    if (!pending) return;
    const ok = await onTransition?.(pending.transition.id, pending.values);
    if (ok !== false) setPending(null);
  };

  return (
    <div className={`${styles.row} ${className}`.trim()}>
      {/* ช่องปุ่มก้าวถัดไปกว้างคงที่ทุกแถว — ไม่งั้นไอคอนแก้ไข/ลบ กับลิงก์ "จัดการ"
          จะขยับตามความยาวป้ายของแต่ละแถว อ่านเป็นคอลัมน์ไม่ได้
          แถวที่ไม่มีก้าวถัดไปก็ยังกินที่เท่าเดิม (ช่องว่าง ไม่ใช่ปุ่มหาย) */}
      <span className={styles.step}>
        {step ? (
          <ActionButton
            kind={step.kind}
            label={step.rowLabel || step.label}
            /* ทึบ ไม่ใช่เส้นขอบ — ปุ่มนี้คือ "ก้าวถัดไป" ของแถว ต้องกวาดตาลงคอลัมน์แล้วเห็นว่า
               แถวไหนมีงานรออยู่ · สีมาจาก tone ที่ ActionButtons ผูกไว้กับ kind แล้ว
               (submit = primary/navy) **ไม่ใช่สีรายปุ่ม** — ของเดิมทาสีตาม *ชื่อ action*
               (คัดกรอง=ฟ้า มอบหมาย=ม่วง ติดต่อ=เขียวน้ำทะเล) ซึ่งขัดกฎ "สีตามความหมาย"
               ของระบบ และตอนนี้แถวเหลือปุ่มเดียว ไม่มีอะไรให้แยกสีจากกันอีกแล้ว */
            variant="filled"
            className={styles.stepButton}
            disabled={busy || step.disabled}
            /* ป้ายในแถวถูกย่อ — เอาป้ายเต็มมาไว้ที่ tooltip ไม่ให้ความหมายหาย */
            title={step.disabledReason || step.label}
            onClick={() => {
              if (onSelect?.(step.transition) === true) return;
              setPending({ transition: step.transition, values: {} });
            }}
          />
        ) : null}
      </span>
      {onEdit && canEdit ? (
        <ActionButton kind="edit" iconOnly variant="quiet" disabled={busy} onClick={onEdit} />
      ) : null}
      {onDelete && canDelete ? (
        <ActionButton kind="delete" iconOnly variant="quiet" disabled={busy} onClick={onDelete} />
      ) : null}
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

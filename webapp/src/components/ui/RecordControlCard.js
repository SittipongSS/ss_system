"use client";
// การ์ด "จัดการ<record>นี้" — จุดจัดการเดียวของ ลีด/ดีล/โครงการ
//
// ห่อ DocumentControlCard แบบเดียวกับ VersionControlCard (ห้ามแก้ DocumentControlPanel.js —
// เอกสาร QT/SO/ภาษี/ขอราคาผลิต ใช้อยู่ ยังไม่ต้องรู้เรื่อง lifecycle)
//
// หน้า feature ส่งมาแค่ lifecycle + record + user + onTransition(id, values) — การ์ดถือ
// state ของกล่อง dialog เอง เพราะถ้าให้แต่ละหน้าถือ ก็จะได้ state ปุ่มละก้อนเหมือนเดิม
// (หน้าโครงการเคยมี showDrop/closeReqForm/rejectForm/reopenForm แยกกัน 4 ชุด)

import { useState } from "react";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import TransitionDialog from "@/components/ui/TransitionDialog";
import { normalizeSlots } from "@/lib/recordLifecycle";

export default function RecordControlCard({
  lifecycle,
  record,
  user,
  onTransition,
  /* action ที่ **ไม่ใช่การย้ายสถานะ** — แก้ไข / ลบ / พิมพ์ ฯลฯ
     ทำไมต้องมี: lifecycle ตอบว่า "ใบนี้เดินไปไหนได้" ซึ่งไม่ครอบคลุมการจัดการตัว
     ระเบียนเอง แต่ผู้ใช้มองว่ามันคือ "การควบคุม" เหมือนกัน (มติผู้ใช้ 2026-08-01)
     และหน้าเอกสาร 6 จาก 7 หน้าก็วางแก้ไข/ลบไว้บนการ์ดอยู่แล้ว (secondary/danger)

     รูป: { id, label, kind, icon, slot, visible, disabled, disabledReason, onClick }
     ต่างจาก transition ตรงที่ **กด onClick ตรง ๆ ไม่เปิด TransitionDialog** —
     ของพวกนี้มีกล่องยืนยันของตัวเอง (confirmAction) หรือเป็นการสลับโหมดในหน้า */
  extraActions = [],
  /* ดัก transition ก่อนเปิดกล่องกรอก — คืน true = หน้าจัดการเองแล้ว การ์ดไม่ต้องเปิดกล่อง
     ใช้กับ transition ที่ "ลงมือที่อื่น" เช่น เปิดดีลจากลีด (สร้าง entity คนละตัว ต้องไป
     ฟอร์มดีล) ถ้าไม่ดัก ผู้ใช้จะเจอกล่องยืนยันเปล่า ๆ คั่นก่อนถึงฟอร์มจริงหนึ่งชั้น */
  onSelect,
  busy = false,
  notices,
  evidence,
  footer,
  children,
  className = "",
  title,
  statusDescription,
}) {
  // { transition, values } — กล่องที่เปิดอยู่ ปิด = null
  const [pending, setPending] = useState(null);

  if (!lifecycle || !record) return null;

  const meta = lifecycle.statusMeta(record);
  const entries = lifecycle.available(record, user);
  const toAction = (entry) => ({
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    icon: entry.icon,
    disabled: entry.disabled,
    disabledReason: entry.disabledReason,
    // extraActions มี onClick ของตัวเอง · transition เปิดกล่องให้กรอกก่อน (เว้นแต่ onSelect ดักไว้)
    onClick: entry.onClick || (() => {
      if (onSelect?.(entry.transition) === true) return;
      setPending({ transition: entry.transition, values: {} });
    }),
  });

  /* รวมสองแหล่งก่อนค่อยจัดช่อง — normalizeSlots คุมกติกา "primary ได้ตัวเดียว"
     ให้ทั้งชุด ไม่งั้นส่ง extraActions slot="primary" มาแล้วจะได้ปุ่มหลักสองปุ่ม
     ลำดับ: transition มาก่อน extraActions (ก้าวถัดไปสำคัญกว่าการจัดการตัวระเบียน)

     🪤 id ที่ชนกับ transition ถูกทิ้ง — lifecycle เป็นเจ้าของ id นั้น ปล่อยผ่านแล้วจะได้
     ปุ่มสอง key เดียวกัน React จะรวม/ตัดทิ้งเงียบ ๆ (เจอจริงที่หน้าต้นแบบ: transition
     `edit` ของ lifecycle ตัวอย่าง ชนกับ extraAction `edit` → ปุ่มหนึ่งหายไปโดยไม่มีใครรู้) */
  const takenIds = new Set(entries.map((entry) => entry.id));
  const all = normalizeSlots([
    ...entries,
    ...extraActions
      .filter((action) => action && action.visible !== false && !takenIds.has(action.id))
      .map((action) => ({ ...action, slot: action.slot || "secondary" })),
  ]);
  const inSlot = (slot) => all.filter((entry) => entry.slot === slot).map(toAction);

  const run = async () => {
    if (!pending) return;
    const ok = await onTransition?.(pending.transition.id, pending.values);
    // คืน false = ทำไม่สำเร็จ ให้กล่องค้างไว้พร้อมค่าที่กรอก ไม่ต้องพิมพ์เหตุผลใหม่
    if (ok !== false) setPending(null);
  };

  return (
    <>
      <DocumentControlCard
        eyebrow="RECORD CONTROL"
        title={title || `จัดการ${lifecycle.noun}นี้`}
        status={meta.label}
        statusColor={meta.color}
        statusDescription={statusDescription ?? meta.description}
        workflowSteps={lifecycle.railSteps(record)}
        notices={notices}
        evidence={evidence}
        primaryAction={inSlot("primary")[0] || null}
        secondaryActions={inSlot("secondary")}
        dangerActions={inSlot("danger")}
        busy={busy}
        footer={footer}
        className={className}
      >
        {children}
      </DocumentControlCard>

      <TransitionDialog
        open={!!pending}
        transition={pending?.transition}
        record={record}
        values={pending?.values || {}}
        onChange={(values) => setPending((current) => (current ? { ...current, values } : current))}
        onConfirm={run}
        onClose={() => setPending(null)}
        busy={busy}
      />
    </>
  );
}

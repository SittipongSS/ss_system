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

export default function RecordControlCard({
  lifecycle,
  record,
  user,
  onTransition,
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
    onClick: () => setPending({ transition: entry.transition, values: {} }),
  });

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
        primaryAction={entries.filter((entry) => entry.slot === "primary").map(toAction)[0] || null}
        secondaryActions={entries.filter((entry) => entry.slot === "secondary").map(toAction)}
        dangerActions={entries.filter((entry) => entry.slot === "danger").map(toAction)}
        busy={busy}
        footer={footer}
        className={className}
      >
        {children}
      </DocumentControlCard>

      <TransitionDialog
        open={!!pending}
        transition={pending?.transition}
        values={pending?.values || {}}
        onChange={(values) => setPending((current) => (current ? { ...current, values } : current))}
        onConfirm={run}
        onClose={() => setPending(null)}
        busy={busy}
      />
    </>
  );
}

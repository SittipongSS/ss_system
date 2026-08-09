"use client";
// ── เนื้อหน้ารายละเอียด · พัฒนากลิ่น (P3b · ม-34) ────────────────────────
//
// ⭐ **1 หัวข้อ = 1 component** — สิ่งที่ทำให้ *"แต่ละหัวข้อจุดประสงค์ไม่เหมือนกัน"*
// เป็นจริงเชิงโครงสร้าง ไม่ใช่เชิงตั้งใจ · เพิ่มของเฉพาะหัวข้อนี้ = แก้ไฟล์นี้ไฟล์เดียว
// ไม่ต้องไปแทรก `kind === 'scent_dev'` กลางหน้าที่ทุกหัวข้อใช้ร่วมกัน
//
// ⭐ **สองมุมมอง** (ม-94 ทาง ก · มติผู้ใช้ 2026-08-09): แท็บ [งาน | แบบฟอร์ม PDR]
//   · งาน = การ์ด direction + ตารางสรุป (+เธรดที่เปลือกวางต่อท้าย)
//   · แบบฟอร์ม PDR = **สองชั้นแบบด้านข้าง** — รายการหมวดซ้าย (ตัวนับครบ x/y)
//     เนื้อหมวดขวา · อ่าน/แก้อยู่ในแท็บนี้ ไม่เบียดเธรดอีก
//
// ⚠️ **แท็บกับรางใช้ของกลาง ไม่ใช่ของหน้านี้เอง** (2026-08-09) — เดิมหน้านี้เขียน
// แถบแท็บ (`.viewTabs` = ปุ่มสองปุ่มติด role="tab") และรางหมวด (`.pdrNav`) ของตัวเอง
// ในจังหวะเดียวกับที่ฟอร์มเปิดคำร้องได้ `ui/Tabs` + `ui/SectionRail` ⇒ ระบบมีแท็บ
// สองทรงและรางสองทรงพร้อมกัน ซึ่งเป็นสิ่งที่ `audit:ui` กับกฎ "primitive อยู่ที่
// components/ui เท่านั้น" ห้ามไว้ · ตอนนี้ฝั่งกรอกกับฝั่งอ่านหน้าตาเหมือนกันจริง
import { useState } from "react";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import SectionRail from "@/components/ui/SectionRail";
import BriefBoard from "@/components/requests/BriefBoard";
import PdrForm from "@/components/requests/PdrForm";
import PdrSummary from "@/components/requests/PdrSummary";
import { RowStepActions } from "@/components/requests/NextStepBar";
import { PDR_SECTIONS, pdrSectionProgress } from "@/lib/requests/pdrFields";
import RequestRows from "./RequestRows";
import styles from "./details.module.css";

export default function ScentDevDetail({
  request, board, canEditAttachments, saving, rowStep,
  pdrDraft, onPdrDraftChange, onPdrEdit, onPdrSave, onPdrCancel, onOpenDocument,
}) {
  const [view, setView] = useState("work");
  const [sectionKey, setSectionKey] = useState(PDR_SECTIONS[0].key);
  const active = PDR_SECTIONS.find((s) => s.key === sectionKey) || PDR_SECTIONS[0];
  const context = { ...(request.pdrContext || {}), briefs: request.briefs || [] };

  return (
    <>
      {/* ชั้นแรก: แท็บมุมมอง — `ui/Tabs` ตัวเดียวกับที่ฟอร์มเปิดคำร้องใช้ */}
      <Tabs
        tabs={[{ key: "work", label: "งาน" }, { key: "pdr", label: "แบบฟอร์ม PDR" }]}
        value={view} onChange={setView} ariaLabel="มุมมองของใบ"
        className={styles.viewTabs}
      />

      {view === "work" && (
        <>
          {/* ⚠️ ป้ายกระทบยอด SO กับแถบตัวเลข **ย้ายไปการ์ด panel ขวา** (ม-94 —
              ScentPanel) — ห้ามวาดซ้ำที่นี่อีก */}
          <RequestRows rows={request.items || []} canEditAttachments={canEditAttachments} />
          {/* ปุ่มก้าวติดแถว direction (ม-94) — แถวของ board ชี้กลับ item ดิบด้วย id */}
          <BriefBoard
            groups={board}
            renderStep={rowStep ? (d) => {
              const item = (request.items || []).find((it) => it.id === d.id);
              return item ? <RowStepActions row={item} {...rowStep} /> : null;
            } : null}
          />
        </>
      )}

      {view === "pdr" && (
        <div className={styles.pdrBlock}>
          {pdrDraft ? (
            <>
              {/* โหมดแก้ = ฟอร์มเต็มในแท็บ (มีทั้งหน้าให้แล้ว ไม่เบียดเธรด) —
                  ฟอร์มแก้=ฟอร์มสร้างตัวเดิม (กฎ AGENTS.md) · แบ่งหมวดฝั่งแก้
                  เป็นงวดถัดไปของแผน ถ้าใช้จริงแล้วยังยาวไป */}
              <PdrForm
                value={pdrDraft.pdr} onChange={(pdr) => onPdrDraftChange({ ...pdrDraft, pdr })}
                briefs={pdrDraft.briefs}
                onBriefsChange={(briefs) => onPdrDraftChange({ ...pdrDraft, briefs })}
                disabled={saving}
              />
              <div className={`action-bar ${styles.pdrActions}`}>
                <Button variant="quiet" disabled={saving} onClick={onPdrCancel}>ยกเลิก</Button>
                <Button tone="primary" disabled={saving} onClick={onPdrSave}>บันทึกแบบฟอร์ม</Button>
              </div>
            </>
          ) : (
            <SectionRail
              sections={PDR_SECTIONS.map((s, i) => ({
                key: s.key,
                // ⭐ เลขนำหน้าเฉพาะฝั่งอ่าน — ที่นี่หมวดตรงกับกระดาษ FM-RD-01 หนึ่งต่อหนึ่ง
                // (RD อ้างกันทางโทรศัพท์ด้วยเลขข้อ) · ฝั่งกรอกมี "บรีฟกลิ่น" ที่ไม่มีบน
                // กระดาษแทรกอยู่ ใส่เลขที่นั่นจะชี้ผิดข้อ
                label: `${i + 1} ${s.title}`,
                count: pdrSectionProgress(s, request, context),
              }))}
              value={active.key}
              onChange={setSectionKey}
              ariaLabel="หมวดของแบบฟอร์ม"
            >
              <PdrSummary request={request} briefs={request.briefs || []} sections={[active]} />
              {request._canEditPdr && (
                <div className={`action-bar ${styles.pdrActions}`}>
                  {/* ⚠️ "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด" — ฉบับออกเป็น HTML */}
                  <Button variant="quiet" onClick={onOpenDocument}>ดูฉบับที่ออกจริง</Button>
                  <Button variant="quiet" disabled={saving} onClick={onPdrEdit}>แก้แบบฟอร์ม PDR</Button>
                </div>
              )}
            </SectionRail>
          )}
        </div>
      )}
    </>
  );
}

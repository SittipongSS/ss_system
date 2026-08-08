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
import { useState } from "react";
import Button from "@/components/ui/Button";
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
      {/* ชั้นแรก: แท็บมุมมอง — ปุ่มเดียวกันทั้งสองสถานะ ไม่ก๊อปเนื้อ */}
      <div className={styles.viewTabs} role="tablist" aria-label="มุมมองของใบ">
        <Button
          variant={view === "work" ? undefined : "quiet"} tone={view === "work" ? "primary" : undefined}
          onClick={() => setView("work")} role="tab" aria-selected={view === "work"}
        >
          งาน
        </Button>
        <Button
          variant={view === "pdr" ? undefined : "quiet"} tone={view === "pdr" ? "primary" : undefined}
          onClick={() => setView("pdr")} role="tab" aria-selected={view === "pdr"}
        >
          แบบฟอร์ม PDR
        </Button>
      </div>

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
            <div className={styles.pdrSplit}>
              {/* ชั้นสอง: รายการหมวดด้านซ้าย + ตัวนับครบ — ตัวเลขชุดเดียวกับ
                  pdrSectionProgress ที่การ์ด panel จะใช้ (ม-94) */}
              <div className={styles.pdrNav} role="tablist" aria-label="หมวดของแบบฟอร์ม">
                {PDR_SECTIONS.map((s, i) => {
                  const p = pdrSectionProgress(s, request, context);
                  const on = s.key === active.key;
                  return (
                    <button
                      key={s.key} type="button" role="tab" aria-selected={on}
                      className={styles.pdrNavItem} data-on={on ? "1" : undefined}
                      onClick={() => setSectionKey(s.key)}
                    >
                      <span>{i + 1} {s.title}</span>
                      <span className={styles.pdrNavCount}>
                        {p.filled}/{p.total}{p.total > 0 && p.filled === p.total ? " ✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.pdrPane}>
                <PdrSummary request={request} briefs={request.briefs || []} sections={[active]} />
                {request._canEditPdr && (
                  <div className={`action-bar ${styles.pdrActions}`}>
                    {/* ⚠️ "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด" — ฉบับออกเป็น HTML */}
                    <Button variant="quiet" onClick={onOpenDocument}>ดูฉบับที่ออกจริง</Button>
                    <Button variant="quiet" disabled={saving} onClick={onPdrEdit}>แก้แบบฟอร์ม PDR</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

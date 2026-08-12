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
import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Tabs from "@/components/ui/Tabs";
import SectionRail from "@/components/ui/SectionRail";
import BriefBoard from "@/components/requests/BriefBoard";
import RequestRows from "./RequestRows";
import { ClipboardList } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import PdrForm, { pdrRailSections } from "@/components/requests/PdrForm";
import PdrSummary, { pdrReadRailSections } from "@/components/requests/PdrSummary";
import { RowStepActions } from "@/components/requests/NextStepBar";
import { PDR_SECTIONS } from "@/lib/requests/pdrFields";
import styles from "./details.module.css";

export default function ScentDevDetail({
  request, board, canEditAttachments, saving, rowStep,
  // ทะเบียนหมวดสินค้า — ฟอร์ม PDR ใช้เลือก "ประเภทสินค้า" หลายรายการ (0227)
  categories = [],
  pdrDraft, onPdrDraftChange,
}) {
  /* ⭐ **เปิดมาที่แท็บที่มีเนื้อ** (มติผู้ใช้ 2026-08-09) — ใบร่าง/ใบที่เพิ่งส่งยังไม่มี
     direction สักตัว เปิดมาเจอแท็บ "งาน" ที่ว่างเปล่าทุกครั้ง ⇒ ตั้งต้นที่แบบฟอร์ม
     ซึ่งเป็นเนื้อเดียวที่มีจริงในช่วงนั้น · พอ RD ส่งของแล้ว "งาน" กลับมาเป็นตัวตั้งต้น
     ⚠️ ใช้ค่าเริ่มต้นของ useState ไม่ใช่ effect — sync ทีหลังจะเด้งแท็บใต้มือคนที่
     กำลังอ่านอยู่ตอนข้อมูลโหลดเสร็จ */
  /* ⭐ **เข้าแท็บ "งาน" เสมอ** (มติผู้ใช้ 2026-08-12 · IS-26080021) — ทับมติ 2026-08-09
     ที่ให้ใบยังไม่มี direction เด้งไปแท็บ PDR
     เหตุผลที่ทับได้: มติเดิมเกิดเพราะแท็บงาน "ว่างเปล่าอ่านเหมือนระบบพัง" ซึ่งจริงตอนนั้น
     · ตอนนี้แท็บงานมีสถานะรออะไรอยู่บอกชัด (EmptyState ข้างล่าง) ⇒ เข้ามาแล้วรู้เรื่อง
     และการเด้งแท็บตามข้อมูลทำให้ผู้ใช้เจอหน้าคนละหน้ากันในใบที่ดูเหมือนกัน */
  const [view, setView] = useState("work");
  const [sectionKey, setSectionKey] = useState(PDR_SECTIONS[0].key);
  // รางของ **ฝั่งแก้** แยกตัวจำจากฝั่งอ่าน — คีย์ชุดเดียวกันแล้ว (ทั้งสองฝั่งมี
  // "บรีฟกลิ่น") แต่คนละ state โดยตั้งใจ: ปิดโหมดแก้แล้วต้องกลับไปที่หมวดที่กำลังอ่าน
  // ค้างไว้ ไม่ใช่กระโดดไปหมวดที่เพิ่งแก้เสร็จ
  const [draftSection, setDraftSection] = useState("request");

  // ⚠️ ปุ่ม "แก้แบบฟอร์ม PDR" อยู่ที่แผงจัดการ (นอก component นี้) — กดตอนอยู่แท็บ
  // "งาน" แล้วต้องพาไปแท็บที่แก้ได้เอง ไม่ใช่เปิดโหมดแก้ทิ้งไว้ในแท็บที่มองไม่เห็น
  useEffect(() => { if (pdrDraft) setView("pdr"); }, [pdrDraft]);
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
          {/* ⚠️ **แท็บนี้ว่างจนกว่า RD จะส่งของ** — direction เกิดตอนฝ่ายกด "ส่งกลิ่น"
              (lib/requests/delivery.js) ไม่ได้เกิดตอนเปิดใบ ⇒ ใบร่าง/ใบที่เพิ่งส่ง
              ยังไม่มีอะไรให้โชว์จริง ๆ · ต้องบอกว่ากำลังรออะไรอยู่ ไม่ใช่หน้าเปล่า
              ซึ่งอ่านเหมือนระบบพัง (มติผู้ใช้ 2026-08-09 — ถามว่า "แท็บงานแทบไม่มีอะไร") */}
          {!(request.items || []).length && (
            <EmptyState icon={FlaskConical}>
              ยังไม่มี direction จากฝ่าย {request.dept}
              <small>
                RD จะส่งกลิ่นเข้ามาทีละตัวหลังรับเรื่อง — แต่ละตัวขึ้นเป็นแถวที่เดินสถานะของตัวเอง
                · ระหว่างนี้ดูสิ่งที่ขอไว้ได้ที่แท็บ &ldquo;แบบฟอร์ม PDR&rdquo;
              </small>
            </EmptyState>
          )}
          {/* ⚠️ ป้ายกระทบยอด SO กับแถบตัวเลข **ย้ายไปการ์ด panel ขวา** (ม-94 —
              ScentPanel) — ห้ามวาดซ้ำที่นี่อีก
              🐞 **เคยมี `RequestRows` ตรงนี้ด้วย แล้วมันซ้ำกับ BriefBoard ข้างล่างเป๊ะ**
              (IS-26080021 · ผู้ใช้ส่งภาพมา): ทั้งคู่ไล่ direction ชุดเดียวกัน ⇒ ชื่อกลิ่น
              โผล่ 4 ครั้งในจอเดียว และป้ายสถานะซ้ำสองที่ · ใบที่มี 3 บรีฟ × 2 direction
              ได้การ์ด 6 ใบแล้วตามด้วยตาราง 6 แถวเดิม
              ⇒ เหลือ `BriefBoard` ตัวเดียว ซึ่งเป็นมุมที่ตอบได้ทั้งใบ (บรีฟ → กลิ่น →
              ผลลัพธ์ → สถานะ) ส่วนสเปก/ไฟล์แนบรายแถวไปอยู่ในแถวที่กางได้ของ board
              ⚠️ หัวข้ออื่น (พัฒนาสูตร/ขอเอกสาร/สอบถาม) ยังใช้ `RequestRows` ตามเดิม —
              พวกนั้นไม่มีตารางสรุป จึงไม่เคยซ้ำ */}
          {/* ปุ่มก้าวติดแถว direction (ม-94) — แถวของ board ชี้กลับ item ดิบด้วย id */}
          {/* ⭐ ครอบด้วย `DetailCard` ของระบบ ไม่ประกอบการ์ดเอง (มติผู้ใช้ 2026-08-12 ·
          IS-26080021 "ตารางกับไฟล์ ดีไซน์ไม่เหมือนอันอื่นเลย") — การ์ดอื่นทุกใบบนหน้านี้
          มีหัวไอคอน+ชื่อ+เส้นคั่นชุดเดียวกัน ส่วนตารางเคยมีหัวเป็นตัวหนาลอย ๆ
          ⇒ หัวข้อ "สรุปทั้งใบ" ย้ายมาเป็นหัวการ์ด ตัวตารางจึงไม่ต้องมีหัวของตัวเองอีก */}
      <DetailCard icon={ClipboardList} title="สรุปทั้งใบ">
      <BriefBoard
            groups={board}
            renderStep={rowStep ? (d) => {
              const item = (request.items || []).find((it) => it.id === d.id);
              return item ? <RowStepActions row={item} {...rowStep} /> : null;
            } : null}
            /* ⭐ สเปก + ไฟล์แนบของ direction — เนื้อที่เคยอยู่ในการ์ด `RequestRows`
               ที่วางซ้อนเหนือตารางนี้ · ย้ายมาอยู่ในแถวที่มันสังกัด ไม่ใช่ก๊อป
               ⚠️ ใช้ `RequestRows` ตัวเดิมส่งแถวเดียวเข้าไป — ห้ามวาดกล่องไฟล์แนบเอง
               (ม-34) ไม่งั้นได้ทรงที่สองของ "ไฟล์แนบรายแถว" ที่จะเพี้ยนจากกัน */
            renderDetail={(d) => {
              const item = (request.items || []).find((it) => it.id === d.id);
              return item
                ? <RequestRows bare rows={[item]} canEditAttachments={canEditAttachments} />
                : null;
            }}
          />
          </DetailCard>
        </>
      )}

      {view === "pdr" && (
        <div className={styles.pdrBlock}>
          {pdrDraft ? (
            <>
              {/* ⭐ **ฟอร์มแก้ = ฟอร์มสร้างตัวเดิม รวมถึงผังด้วย** (มติผู้ใช้ 2026-08-09)
                  — เดิมส่ง `PdrForm` แบบไม่มีรางออกมา ⇒ ฝั่งกรอกที่หน้าเปิดคำร้อง
                  เป็นรางข้าง แต่ฝั่งแก้ที่นี่เป็นลิ้นชักยาวทั้งหน้า · คนละหน้าตาทั้งที่
                  เป็นฟอร์มเดียวกัน ซึ่งเป็นโรคที่ AGENTS.md ห้ามไว้ตรง ๆ
                  ⚠️ รางใช้ `section`/`onChange` ชุดเดียวกับหน้าเปิดคำร้อง — ตัวนับ
                  ต่อหมวดมาจาก `pdrRailSections` ที่เดียว */}
              <SectionRail
                ariaLabel="หมวดของแบบฟอร์ม"
                value={draftSection}
                onChange={setDraftSection}
                sections={pdrRailSections(pdrDraft.pdr, pdrDraft.briefs, pdrDraft.targets)}
              >
                {/* 🐞 **ต้องส่ง `context` ด้วยเสมอ** — เดิมส่งแค่ 7 พร็อพแล้วลืมค่าที่ระบบ
                    เติมให้ทั้งก้อน ⇒ ช่อง "เติมจาก…" เป็นเส้นประทั้งแผง และปุ่มรวบ/แยก
                    บรีฟหายไปเลยเพราะ `scentCount` ว่าง · ข้อมูลมีอยู่แล้วที่ `context`
                    ด้านบนซึ่งฝั่งอ่านใช้อยู่ — เป็นการลืมเดินสายล้วน ๆ */}
                <PdrForm
                  section={draftSection}
                  categories={categories}
                  value={pdrDraft.pdr} onChange={(pdr) => onPdrDraftChange({ ...pdrDraft, pdr })}
                  briefs={pdrDraft.briefs}
                  onBriefsChange={(briefs) => onPdrDraftChange({ ...pdrDraft, briefs })}
                  targets={pdrDraft.targets || []}
                  onTargetsChange={(targets) => onPdrDraftChange({ ...pdrDraft, targets })}
                  disabled={saving}
                  context={context}
                />
              </SectionRail>
              {/* ⚠️ **ไม่มีปุ่มบันทึก/ยกเลิกตรงนี้** (มติผู้ใช้ 2026-08-09) — แผงจัดการ
                  คือศูนย์กลางการควบคุม · พอเปิดโหมดแก้ แผงจะสลับเป็น "บันทึกแบบฟอร์ม /
                  ยกเลิกการแก้" เอง ⇒ ปุ่มของใบอยู่ที่เดียวตลอดทุกโหมด */}
            </>
          ) : (
            <SectionRail
              // ⭐ รายชื่อหมวดมาจากที่เดียว (`pdrReadRailSections`) และมี "บรีฟกลิ่น"
              // เป็นหมวดของตัวเองเหมือนฝั่งกรอก — เดิมบรีฟถูกวาดค้างไว้บนสุดนอกราง
              // ⇒ เลือกหมวด 4 แล้วยังเห็นบรีฟอยู่ข้างบน อ่านเหมือนสองหน้ามาต่อกัน
              sections={pdrReadRailSections(request, request.briefs || [], context)}
              value={sectionKey}
              onChange={setSectionKey}
              ariaLabel="หมวดของแบบฟอร์ม"
            >
              {/* ⚠️ **ไม่มีปุ่มระดับใบตรงนี้แล้ว** (มติผู้ใช้ 2026-08-09) — "ออกเอกสาร"
                  กับ "แก้แบบฟอร์ม PDR" ทำอะไรกับ *ทั้งใบ* จึงย้ายไปแผงจัดการรวมกับ
                  ส่ง/แก้ข้อมูล/ลบ · ปุ่มระดับใบกระจายสองที่คือสิ่งที่ ม-49 ห้ามไว้ */}
              <PdrSummary request={request} briefs={request.briefs || []} section={sectionKey} />
            </SectionRail>
          )}
        </div>
      )}
    </>
  );
}

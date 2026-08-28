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
import { FlaskConical, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Tabs from "@/components/ui/Tabs";
import SectionRail from "@/components/ui/SectionRail";
import BriefBoard from "@/components/requests/BriefBoard";
// ⭐ แก้ทะเบียนกลิ่นจากในใบ (มติผู้ใช้ 2026-08-18) — โมดัลใช้ฟอร์มเดียวกับหน้าทะเบียน
import RegistryEditModal from "@/components/requests/RegistryEditModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import { isScentRegistrar } from "@/lib/master/scents";
import { useRole } from "@/lib/roleContext";
import RequestRows from "./RequestRows";
import { ListChecks } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import PdrSummary from "@/components/requests/PdrSummary";
import { OwnerTag, RowStepActions } from "@/components/requests/NextStepBar";
// ⚠️ รางหมวดของทั้งสองโหมดมาจากตัวเดียวกัน — โหมดแก้ส่งค่าฟอร์ม โหมดอ่านส่งแถวคำร้อง
// แล้วตัวลิบแปลงให้เอง ⇒ เลขบนรางก่อนกด "แก้ไข" กับหลังกดต้องตรงกันเสมอ
import {
  PDR_SECTIONS, pdrRailSectionsFromRequest,
} from "@/lib/requests/pdrFields";
import styles from "./details.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function ScentDevDetail({
  request, board, canEditAttachments, saving, rowStep, onReload, onDeliver, today = null, due = null,
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
  /* ⭐ ทะเบียนที่กำลังแก้อยู่ — ค่าคือก้อน `registry` ของแถวนั้น (id + kind)
     ⚠️ **ด่านจริงอยู่ที่ API** ที่นี่แค่ไม่โชว์ปุ่มให้คนที่แก้ไม่ได้ (รหัสกลิ่น = RD เท่านั้น) */
  const [editRegistry, setEditRegistry] = useState(null);
  const role = useRole();
  const registrar = isScentRegistrar({ role });
  const [error, setError] = useState("");
  /* ⭐ ลบรายการ + ของที่มันสร้างไว้ในทะเบียน (มติผู้ใช้ 2026-08-18) — ด่านจริงอยู่ที่
     `DELETE /api/sa/requests/[id]/items/[itemId]` (lib `rowDelete.js` มีเทสต์)
     ⚠️ **ต้องมีโมดัลยืนยันเสมอ** — ปุ่มนี้ลบของสองที่ในคลิกเดียว คนกดต้องอ่านออกก่อนว่า
     ทะเบียนจะถูกลบตามไปด้วย (กฎ approvalPrompt: ทุกการกระทำที่มีผลต่อของอื่นต้องบอกผล) */
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const removeRow = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/sa/requests/${request.id}/items/${deleteRow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "ลบรายการไม่สำเร็จ"); return; }
      setDeleteRow(null);
      await onReload?.();
    } finally { setDeleting(false); }
  };



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
              ยังไม่มี direction จาก {request.dept}
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
      <DetailCard icon={ListChecks} title="สรุปทั้งใบ">
      <BriefBoard
        today={today}
        due={due}
            groups={board}
            canEditRegistry={registrar}
            onEditRegistry={(registry) => setEditRegistry(registry)}
            onDeleteRow={(row) => setDeleteRow(row)}
            /* ⭐ **ปุ่มส่งงานอยู่ในแถวของบรีฟ** (มติผู้ใช้ 2026-08-18) — ย้ายมาจาก
               Control Panel · กดที่ก้อนไหน โมดัลผูกบรีฟก้อนนั้นให้เลย ไม่ต้องเลือกซ้ำ
               ⚠️ เงื่อนไขเดียวกับปุ่มเดิมเป๊ะ (`rowStep.canDept` = ฝ่ายปลายทางที่รับเรื่อง
               แล้ว) — ที่ย้ายคือ *ที่วาง* ไม่ใช่ด่าน */
            renderGroupStep={rowStep?.canDept && onDeliver ? (g) => (
              <>
                {/* ⚠️ ชิปตัวเดียวกับปุ่มรายแถว **และกติกาเดียวกัน** — ตารางเดียวมีปุ่ม
                    ติดชิปกับไม่ติดปนกันไม่ได้ ⇒ เงื่อนไขต้องตรงกับ `RowStepActions`
                    (ขึ้นเฉพาะตอนสองฝั่งสดพร้อมกัน · มติผู้ใช้ 2026-08-26) */}
                {rowStep.canDept && rowStep.canRequester && (
                  <OwnerTag owner="dept" deptLabel={rowStep.deptLabel} />
                )}
                <Button size="sm" tone="primary" disabled={saving} onClick={() => onDeliver(g.id)}>
                  <Send size={14} /> ส่งงาน
                </Button>
              </>
            ) : null}
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

      {/* ⭐ **แท็บนี้อ่านอย่างเดียวแล้ว** (มติผู้ใช้ 2026-08-24: "หน้าแก้ต้องเหมือน
          หน้าสร้าง ทุกๆหัวข้อ") — เดิมโหมดแก้ PDR ถูกวาดตรงนี้อีกชุดหนึ่ง ⇒ ใบพัฒนา
          กลิ่นมีพื้นที่แก้ **สองแห่งในหน้าเดียว**: การ์ด "แก้ข้อมูลคำร้อง" ข้างบน
          (ชื่อเรื่อง/วันที่/ด่วน) กับรางนี้ (แบบฟอร์ม) · คนกด "แก้ไข" ครั้งเดียวแล้ว
          ต้องไล่หาว่าของที่อยากแก้อยู่ตรงไหน
          ⇒ ตอนนี้แบบฟอร์มอยู่ในแท็บ "รายละเอียด" ของ `RequestForm` เหมือนตอนเปิดใบเป๊ะ
          ⚠️ ฝั่งอ่านยังอยู่ที่นี่ตามเดิม — มันคือ *เนื้อของใบ* ไม่ใช่โหมดแก้ */}
      {view === "pdr" && (
        <div className={styles.pdrBlock}>
          <SectionRail
            // ⭐ รายชื่อหมวดมาจากที่เดียว (`pdrRailSections`) และมี "บรีฟกลิ่น"
            // เป็นหมวดของตัวเองเหมือนฝั่งกรอก — เดิมบรีฟถูกวาดค้างไว้บนสุดนอกราง
            // ⇒ เลือกหมวด 4 แล้วยังเห็นบรีฟอยู่ข้างบน อ่านเหมือนสองหน้ามาต่อกัน
            sections={pdrRailSectionsFromRequest(request, request.briefs || [], request.targets || [])}
            value={sectionKey}
            onChange={setSectionKey}
            ariaLabel="หมวดของแบบฟอร์ม"
          >
            {/* ⚠️ **ไม่มีปุ่มระดับใบตรงนี้แล้ว** (มติผู้ใช้ 2026-08-09) — "ออกเอกสาร"
                กับ "แก้ไข" ทำอะไรกับ *ทั้งใบ* จึงอยู่ที่แผงจัดการ · ปุ่มระดับใบกระจาย
                สองที่คือสิ่งที่ ม-49 ห้ามไว้ */}
            <PdrSummary request={request} briefs={request.briefs || []} section={sectionKey} />
          </SectionRail>
        </div>
      )}
      {/* ⚠️ บอกผลลัพธ์ให้ครบก่อนกด — ลบทีเดียวหายสองที่ */}
      {/* ⚠️ บอกผลลัพธ์ให้ครบก่อนกด — ลบทีเดียวหายสองที่
          ⚠️ เนื้อความส่งทาง `description` ไม่ใช่ children — `ConfirmDialog` ไม่ได้
             เรนเดอร์ children (เจอจริงตอนเดินบนจอ: โมดัลขึ้นแต่หัวเรื่องกับปุ่ม) */}
      <ConfirmDialog
        open={!!deleteRow}
        tone="danger"
        title={`ลบ ${deleteRow?.registry?.code || deleteRow?.name || "directionนี้"}`}
        description={`${deleteRow?.registry
          ? `ลบออกจากคำร้อง และลบ ${deleteRow.registry.code || deleteRow.registry.name} ออกจากทะเบียนด้วย`
          : "ลบรายการนี้ออกจากคำร้อง"} · ย้อนกลับไม่ได้`}
        detail="ถ้าของในทะเบียนถูกอ้างที่อื่นแล้ว ระบบจะลบเฉพาะรายการในคำร้อง แล้วบอกไว้ในประวัติ"
        confirmLabel="ลบ"
        busy={deleting}
        onClose={() => setDeleteRow(null)}
        onConfirm={removeRow}
      />
      {error && <StatusNotice tone="error" onClose={() => setError("")}>{error}</StatusNotice>}

      {/* ⚠️ ปิดโมดัลแล้ว **ต้องรีโหลดใบ** — ตารางอ่านค่าทะเบียนจาก payload ของใบ */}
      {editRegistry && (
        <RegistryEditModal
          target={editRegistry}
          canSetCode={registrar}
          onClose={() => setEditRegistry(null)}
          onSaved={onReload}
        />
      )}
    </>
  );
}

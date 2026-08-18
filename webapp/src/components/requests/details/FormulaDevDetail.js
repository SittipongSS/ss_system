"use client";
// ── เนื้อหน้ารายละเอียด · พัฒนาสูตร (P4 · ม-34) ──────────────────────────
//
// ⭐ **1 หัวข้อ = 1 component** — ต่างจากพัฒนากลิ่นสี่อย่าง และทุกอย่างอยู่ในไฟล์นี้
// ไม่ใช่เป็น `kind === 'formula_dev'` แทรกกลางหน้าที่ทุกหัวข้อใช้ร่วมกัน:
//
//   1 **ไม่มี PDR** — บรีฟอยู่ในช่อง "รายละเอียด" ของใบและ `spec` รายแถว
//   2 **ไม่มีกระทบยอด SO** — หัวข้อนี้ไม่ผูกใบสั่งขาย (ม-40) ไม่มีตัวเลขให้เทียบ
//   3 **โครงสองชั้น** — คำร้อง → แถว (หมวด × กลิ่น) ไม่มีชั้นบรีฟ
//   4 **ปลายทางคือทะเบียนสูตร** — 1 แถว = สูตร 1 ตัว (`formulas_identity_uk`)
//
// ⚠️ การ์ดรายแถวใช้ `RequestRows` ของกลาง **ห้ามโคลน** (ม-34)
import { useState } from "react";
import FormulaDevBoard from "@/components/requests/FormulaDevBoard";
// ⭐ แก้ทะเบียนสูตรจากในใบ (มติผู้ใช้ 2026-08-18) — โมดัลใช้ฟอร์มเดียวกับหน้าทะเบียน
import RegistryEditModal from "@/components/requests/RegistryEditModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import { isScentRegistrar } from "@/lib/master/scents";
import { useRole } from "@/lib/roleContext";
import { RowStepActions } from "@/components/requests/NextStepBar";
import RequestRows from "./RequestRows";
import { ListChecks, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ (`formulaBoard`/`formulaTotals`) — เปลือก
// ส่งของทุกหัวข้อมาให้ครบ แล้วแต่ละหัวข้อหยิบของตัวเอง ⇒ เพิ่มหัวข้อใหม่ไม่ต้องแก้เปลือก
export default function FormulaDevDetail({
  request, formulaBoard: board = [], canEditAttachments,
  rowStep, onReload, bulkReady,
}) {
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
      const res = await fetch(`/api/sa/requests/${request.id}/items/${deleteRow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "ลบรายการไม่สำเร็จ"); return; }
      setDeleteRow(null);
      await onReload?.();
    } finally { setDeleting(false); }
  };

  // ปุ่มก้าวติดแถวในตาราง (ม-94 — มติเดียวกับสายเอกสาร: "ก้าวถัดไปในรายการ")
  // แถวของ board ชี้กลับ item ดิบด้วย id — RowStepActions ต้องอ่านช่องก้าวจริง
  const itemsById = new Map((request.items || []).map((it) => [it.id, it]));
  const renderStep = rowStep
    ? (boardRow) => {
      const item = itemsById.get(boardRow.id);
      return item ? <RowStepActions row={item} {...rowStep} /> : null;
    }
    : null;
  return (
    <>
      {/* 🐞 **เคยมี `RequestRows` ยืนเดี่ยวตรงนี้เหนือตาราง** ⇒ ไล่แถวชุดเดียวกันสองรอบ
          ชื่อกลิ่นและป้ายสถานะโผล่ซ้ำ (IS-26080021 — อาการเดียวกับสายกลิ่นเป๊ะ)
          ⇒ ย้ายเข้าไปเป็นเนื้อของแถวที่กางได้ ไม่ใช่ก้อนแยกข้างบน */}
      {/* ⭐ ครอบด้วย `DetailCard` ของระบบ ไม่ประกอบการ์ดเอง (มติผู้ใช้ 2026-08-12 ·
          IS-26080021 "ตารางกับไฟล์ ดีไซน์ไม่เหมือนอันอื่นเลย") — การ์ดอื่นทุกใบบนหน้านี้
          มีหัวไอคอน+ชื่อ+เส้นคั่นชุดเดียวกัน ส่วนตารางเคยมีหัวเป็นตัวหนาลอย ๆ
          ⇒ หัวข้อ "สรุปทั้งใบ" ย้ายมาเป็นหัวการ์ด ตัวตารางจึงไม่ต้องมีหัวของตัวเองอีก */}
      {/* ⭐ **ปุ่มส่งรวบอยู่กับตาราง ไม่ใช่ Control Panel** (มติผู้ใช้ 2026-08-18) —
          ปุ่มส่งงานทุกแบบอยู่ที่เดียวกับรายการที่มันส่ง · Control Panel เหลือปุ่มปลายทาง
          ⚠️ เงื่อนไขเดิม: โผล่เมื่อมีแถวพร้อมส่ง ≥ 2 (แถวเดียวใช้ปุ่มในแถวของมันเอง) */}
      <DetailCard
        icon={ListChecks} title="สรุปทั้งใบ"
        actions={rowStep?.canDept && bulkReady?.count >= 2 ? (
          <Button size="sm" tone="primary" onClick={bulkReady.onOpen}>
            <Send size={14} /> ส่งงาน {bulkReady.count} รายการ
          </Button>
        ) : null}
      >
      <FormulaDevBoard
        rows={board}
        canEditRegistry={registrar}
        onEditRegistry={(registry) => setEditRegistry(registry)}
        onDeleteRow={(row) => setDeleteRow(row)}
        renderStep={renderStep}
        renderDetail={(boardRow) => {
          const item = itemsById.get(boardRow.id);
          return item
            ? <RequestRows bare rows={[item]} canEditAttachments={canEditAttachments} />
            : null;
        }}
      />
      </DetailCard>

      {/* ⚠️ แถบตัวเลข **ย้ายไปการ์ด panel ขวา** (ม-94 — FormulaPanel) — โครง
          การ์ดจัดการมีทุกหัวข้อแล้ว (ม-123) · ห้ามวาดซ้ำที่นี่อีก */}

      {/* ⚠️ บอกผลลัพธ์ให้ครบก่อนกด — ลบทีเดียวหายสองที่ */}
      {/* ⚠️ บอกผลลัพธ์ให้ครบก่อนกด — ลบทีเดียวหายสองที่
          ⚠️ เนื้อความส่งทาง `description` ไม่ใช่ children — `ConfirmDialog` ไม่ได้
             เรนเดอร์ children (เจอจริงตอนเดินบนจอ: โมดัลขึ้นแต่หัวเรื่องกับปุ่ม) */}
      <ConfirmDialog
        open={!!deleteRow}
        tone="danger"
        title={`ลบ ${deleteRow?.registry?.code || deleteRow?.name || "รายการนี้"}`}
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

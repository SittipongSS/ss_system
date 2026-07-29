"use client";

import { Save } from "lucide-react";
import SaveStatus from "./SaveStatus";
import Button from "./Button";

export default function FormActions({ dirty, saving, error, onSave, onCancel, saveLabel = "บันทึก", children }) {
  const status = error ? "error" : saving ? "saving" : dirty ? "dirty" : "saved";
  return (
    <div className="form-actions form-action-bar is-page" aria-label="การบันทึกข้อมูล">
      <SaveStatus status={status} />
      <div className="form-actions-buttons">
        {children}
        {/* "ยกเลิก" คือ *การกระทำรอง* ไม่ใช่ปุ่มเงียบ — เดิมส่ง variant="quiet" (คลาส
            `ghost` = ไม่มีขอบ/พื้น/เงา) แล้ว globals ไปเขียนกฎ `.form-action-bar .btn.ghost`
            คืนขอบ+พื้น+เงาให้ทั้งหมด = ยกเลิกตัว variant ทิ้งด้วย descendant selector
            ผลคือคลาส `ghost` ให้หน้าตาคนละแบบในแถบนี้กับที่อื่น · ใช้ tone ที่ตรงความหมาย
            แทน แล้วกฎนั้นก็ไม่ต้องมี (ดู btnGhostSingleDefinition.test.mjs) */}
        {onCancel && <Button tone="neutral" onClick={onCancel} disabled={saving}>ยกเลิก</Button>}
        <Button tone="primary" onClick={onSave} disabled={saving || !dirty} icon={<Save size={14} aria-hidden="true" />}>
          {saving ? "กำลังบันทึก…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

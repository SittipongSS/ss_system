"use client";

import { Save } from "lucide-react";
import SaveStatus from "./SaveStatus";

export default function FormActions({ dirty, saving, error, onSave, onCancel, saveLabel = "บันทึก", children }) {
  const status = error ? "error" : saving ? "saving" : dirty ? "dirty" : "saved";
  return (
    <div className="form-actions form-action-bar page" aria-label="การบันทึกข้อมูล">
      <SaveStatus status={status} />
      <div className="form-actions-buttons">
        {children}
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>ยกเลิก</button>}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving || !dirty}>
          <Save size={14} aria-hidden="true" /> {saving ? "กำลังบันทึก…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

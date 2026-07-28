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
        {onCancel && <Button variant="quiet" onClick={onCancel} disabled={saving}>ยกเลิก</Button>}
        <Button tone="primary" onClick={onSave} disabled={saving || !dirty} icon={<Save size={14} aria-hidden="true" />}>
          {saving ? "กำลังบันทึก…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

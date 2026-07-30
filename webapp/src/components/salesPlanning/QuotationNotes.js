"use client";

// การ์ด "หมายเหตุ" ของใบเสนอราคา — component เดียวใช้ทั้งหน้าสร้างและหน้าแก้ (กฎ AGENTS.md)
// เลือกชุดหมายเหตุจากคลังได้ 1 ชุด เลือกแล้วทับทั้งช่อง แล้วแก้ทับได้เฉพาะใบนี้
import { FileText } from "lucide-react";
import ReadableText from "@/components/ui/ReadableText";
import { matchesRemarksPreset, remarksPresetToFormValue } from "@/lib/commercialPresets";
import CommercialPresetPicker from "./CommercialPresetPicker";
import styles from "./QuotationNotes.module.css";
import Textarea from "@/components/ui/Textarea";

export default function QuotationNotes({
  value = "",
  onChange,
  presetVersionId = null,
  onPresetVersionIdChange,
  disabled = false,
}) {
  const applyPreset = (option) => {
    if (!option) { onPresetVersionIdChange?.(null); return; }
    onChange?.(remarksPresetToFormValue(option));
    onPresetVersionIdChange?.(option.versionId);
  };

  return (
    <>
      <div className={styles.heading}>
        <div className={styles.title}>
          <FileText size={17} aria-hidden="true" />
          <h2>หมายเหตุ</h2>
        </div>
        <div className="spacer" />
        <CommercialPresetPicker
          kind="remarks"
          selectedVersionId={presetVersionId}
          disabled={disabled}
          hasContent={!!String(value || "").trim()}
          matchesCurrent={(option) => matchesRemarksPreset(value, option)}
          onApply={applyPreset}
        />
      </div>
      {disabled ? (
        <div className="readable-field">
          <ReadableText
            text={value}
            lines={5}
            empty={<span className="readable-field-empty">ไม่มีหมายเหตุ</span>}
          />
        </div>
      ) : (
        <Textarea
          rows={4}
          value={value}
          placeholder="หมายเหตุที่ต้องการแสดงในใบเสนอราคา"
          onChange={(event) => onChange?.(event.target.value)}
          style={{ width: "100%" }}
        />
      )}
    </>
  );
}

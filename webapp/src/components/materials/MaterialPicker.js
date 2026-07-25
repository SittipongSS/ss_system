"use client";
// ── เลือกวัสดุจากทะเบียน (mig 0157) ────────────────────────────────────
// ใช้ทั้งในเคสขอราคา (PR-2) และบรรทัดในใบขอราคาผลิต (PR-3) — เลือกด้วย **id**
// ไม่ใช่พิมพ์ชื่อ เพราะการจับคู่ตามชื่อคือต้นเหตุที่ราคาไม่เคยแมตช์กับบรรทัด
//
// ยังไม่มีในทะเบียน = เลือก "+ วัสดุใหม่" แล้วพิมพ์ชื่อ — ฝั่ง API จะสร้างวัสดุ
// "ร่าง" ให้รอ RD/PC รับ (คนใส่ราคายังเป็น RD/PC เท่านั้นเสมอ)
import { useMemo } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { MATERIAL_STATE_LABELS, materialPriceState } from "@/lib/materialPrices";
import { pmTypeLabel } from "@/lib/master/materialTypes";

export const NEW_MATERIAL = "__new__";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function MaterialPicker({
  materials = [], kind, pmType = "", customerId = null,
  value, onChange, disabled = false, allowCreate = true, ariaLabel = "เลือกวัสดุ",
}) {
  const options = useMemo(() => {
    const rows = materials
      .filter((m) => m.kind === kind && m.status !== "archived")
      // ราคาทับรายลูกค้าของลูกค้าอื่นไม่ควรโผล่ — ราคาเขาไม่ใช่ของงานนี้
      .filter((m) => !m.customerId || m.customerId === customerId)
      // บรรทัดที่รู้ประเภทอยู่แล้ว (ขวด/ฝา/กล่อง) กรองให้เหลือเฉพาะประเภทนั้น
      .filter((m) => !pmType || !m.pmType || m.pmType === pmType)
      .map((m) => {
        const state = materialPriceState(m, todayIso());
        const hints = [
          m.customerId ? "ราคาเฉพาะลูกค้า" : null,
          m.kind === "PM" && m.pmType ? pmTypeLabel(m.pmType) : null,
          m.formulaCode ? `สูตร ${m.formulaCode}` : null,
          state === "ready" ? null : MATERIAL_STATE_LABELS[state],
        ].filter(Boolean);
        return {
          value: m.id,
          label: hints.length ? `${m.label} — ${hints.join(" · ")}` : m.label,
          search: `${m.label} ${m.formulaCode || ""} ${m.supplierNote || ""}`,
        };
      });
    return allowCreate
      ? [...rows, { value: NEW_MATERIAL, label: "+ วัสดุใหม่ (ยังไม่มีในทะเบียน)" }]
      : rows;
  }, [materials, kind, pmType, customerId, allowCreate]);

  const isNew = !value?.materialId && (value?.isNew || !!value?.label);

  return (
    <>
      <SearchableSelect
        value={isNew ? NEW_MATERIAL : (value?.materialId || "")}
        options={options}
        disabled={disabled}
        placeholder="เลือกวัสดุจากทะเบียน"
        ariaLabel={ariaLabel}
        onChange={(v) => {
          if (v === NEW_MATERIAL) return onChange({ materialId: null, label: "", isNew: true });
          const picked = materials.find((m) => m.id === v);
          onChange({ materialId: v, label: picked?.label || "", isNew: false });
        }}
      />
      {isNew && (
        <input
          className="premium-input" style={{ marginTop: 6 }} disabled={disabled}
          placeholder="ชื่อวัสดุใหม่ เช่น ขวดแก้ว 30 ml สีชา"
          value={value?.label || ""}
          aria-label="ชื่อวัสดุใหม่"
          onChange={(e) => onChange({ materialId: null, label: e.target.value, isNew: true })}
        />
      )}
    </>
  );
}

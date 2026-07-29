"use client";
// ── ฟอร์มวัสดุในทะเบียน (mig 0157) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มวัสดุ" และ "แก้ข้อมูลวัสดุ" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → เลือกชนิดได้ + ใส่ราคา rev.1 ได้ (ถ้าเป็นฝ่ายเจ้าของ)
//   mode="edit"   → ชนิดล็อก (ฝ่ายเจ้าของและหน่วยราคาผูกกับชนิด rev เก่าจะเพี้ยน)
//                   และไม่มีช่องราคา เพราะ "แก้ราคา = ออก rev ใหม่" คนละ action
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PriceTierFields from "@/components/materials/PriceTierFields";
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, unitBasisForMaterialKind } from "@/lib/materialPrices";
import { pmTypeOptions } from "@/lib/master/materialTypes";

export const emptyMaterialForm = () => ({
  kind: "PM",
  label: "",
  pmType: "",
  // ⭐ ตัวตนของ F/FB คือ "สูตรในทะเบียน" ไม่ใช่รหัสที่พิมพ์เอง (mig 0181) —
  // ของเดิมเป็น text ซึ่งพิมพ์ต่างช่องว่าง/ตัวพิมพ์แล้วกลายเป็นวัสดุคนละตัวเงียบ ๆ
  formulaId: "",
  scope: "central", // central = ราคากลาง · customer = ทับรายลูกค้า
  customerId: "",
  supplierNote: "",
  tiers: [],
});

export function materialToForm(material) {
  return {
    kind: material.kind,
    label: material.label || "",
    pmType: material.pmType || "",
    formulaId: material.formulaId || "",
    scope: material.customerId ? "customer" : "central",
    customerId: material.customerId || "",
    supplierNote: material.supplierNote || "",
    tiers: [],
  };
}

export default function MaterialForm({
  mode = "create", value, onChange, customers = [], formulas = [], canPrice = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const isPm = value.kind === "PM";
  const unitLabel = unitBasisForMaterialKind(value.kind) === "per_kg" ? "฿/กก." : "฿/ชิ้น";

  return (
    <>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="mat-kind">ชนิดวัสดุ</label>
          <Select
            id="mat-kind" value={value.kind} disabled={disabled || mode === "edit"}
            onChange={(e) => set({
              kind: e.target.value,
              // ล้างช่องเฉพาะชนิดทิ้ง ไม่งั้นสูตรค้างบน PM หรือประเภทค้างบน RM
              pmType: "", formulaCode: "", formulaName: "",
            })}
            options={MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))}
          />
          {mode === "edit" && (
            <small style={{ color: "var(--text-3)" }}>ชนิดเปลี่ยนไม่ได้ — ประวัติราคาผูกกับหน่วยของชนิดนี้</small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="mat-label">ชื่อวัสดุ</label>
          <input
            id="mat-label" className="premium-input" value={value.label} disabled={disabled}
            placeholder={isPm ? "เช่น ขวดแก้ว 30 ml สีชา" : "เช่น หัวน้ำหอม Lavender"}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>

        {isPm ? (
          <div className="form-group">
            <label htmlFor="mat-pm-type">ประเภทบรรจุภัณฑ์</label>
            <Select
              id="mat-pm-type" value={value.pmType} disabled={disabled}
              onChange={(e) => set({ pmType: e.target.value })}
              options={pmTypeOptions(value.pmType)}
            />
            <small style={{ color: "var(--text-3)" }}>ใช้กรองตัวเลือกวัสดุตอนประกอบต้นทุน</small>
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="mat-formula">สูตร</label>
            {/* ⭐ เลือกจากทะเบียน ไม่ใช่พิมพ์รหัสเอง (mig 0181) — ตัวตนของ F/FB
                คือสูตร ถ้าเป็นข้อความ พิมพ์ต่างช่องว่างนิดเดียวก็กลายเป็นวัสดุ
                คนละตัวโดยไม่มีใครรู้ (บั๊กตระกูล "จับคู่ด้วยข้อความ") */}
            <SearchableSelect
              id="mat-formula" value={value.formulaId} disabled={disabled}
              onChange={(v) => set({ formulaId: v })}
              placeholder="— เลือกสูตรจากทะเบียน —"
              options={formulas.map((f) => ({
                value: f.id,
                label: `${f.code ? `${f.code} · ` : ""}${f.name}`,
              }))}
            />
            <small style={{ color: "var(--text-3)" }}>
              ตัวตนของ F/FB คือสูตร — ชื่อเดียวกันแต่คนละสูตร = คนละราคา
              {formulas.length ? "" : " · ยังไม่มีสูตรในทะเบียน เพิ่มที่ ฐานข้อมูล → ทะเบียนสูตร"}
            </small>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="mat-scope">ขอบเขตราคา</label>
          <Select
            id="mat-scope" value={value.scope} disabled={disabled}
            onChange={(e) => set({ scope: e.target.value, customerId: "" })}
            options={[
              { value: "central", label: "ราคากลาง (ใช้ได้ทุกลูกค้า)" },
              { value: "customer", label: "ทับรายลูกค้า" },
            ]}
          />
        </div>

        {value.scope === "customer" && (
          <div className="form-group">
            <label htmlFor="mat-customer">ลูกค้า</label>
            <SearchableSelect
              value={value.customerId} disabled={disabled} entity="customer"
              onChange={(v) => set({ customerId: v })}
              options={customers.map((c) => ({ value: c.id, label: c.name, search: `${c.name} ${c.id}` }))}
              placeholder="เลือกลูกค้า"
              ariaLabel="ลูกค้าที่ใช้ราคานี้"
            />
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="mat-supplier-note">หมายเหตุ / ผู้ขาย</label>
        <input
          id="mat-supplier-note" className="premium-input" value={value.supplierNote}
          disabled={disabled} placeholder="เช่น ผู้ขาย A · MOQ 1000 · lead time 30 วัน"
          onChange={(e) => set({ supplierNote: e.target.value })}
        />
      </div>

      {mode === "create" && canPrice && (
        <PriceTierFields
          value={value.tiers} unitLabel={unitLabel} disabled={disabled}
          onChange={(tiers) => set({ tiers })}
        />
      )}
    </>
  );
}

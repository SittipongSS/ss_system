"use client";
// ── ฟอร์มวัสดุในทะเบียน (mig 0157) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มวัสดุ" และ "แก้ข้อมูลวัสดุ" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → ใส่ราคา rev.1 ได้ (ถ้าเป็นฝ่ายเจ้าของ)
//   mode="edit"   → ไม่มีช่องราคา เพราะ "แก้ราคา = ออก rev ใหม่" คนละ action
//
// ⭐ **ทะเบียนวัสดุเหลือบรรจุภัณฑ์ (PM) อย่างเดียว** (มติผู้ใช้ 2026-08-10) —
// ราคา RM (หัวน้ำหอม F / เนื้อสาร FB) จัดการที่ทะเบียนกลิ่น/สูตรโดยตรง
// (ปุ่มใส่ราคาบนหน้ารายละเอียด ซึ่งลงเอย material_prices ก้อนเดียวกัน) ฟอร์มนี้
// จึงไม่มีช่องชนิด/สูตรแล้ว · แถว RM เดิมใน DB อยู่ครบ แค่ไม่จัดการจากหน้านี้
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PriceTierFields from "@/components/materials/PriceTierFields";
import { customerSelectOptions } from "@/components/master/customerOption";
import { pmTypeOptions } from "@/lib/master/materialTypes";

export const emptyMaterialForm = () => ({
  kind: "PM",
  label: "",
  pmType: "",
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
    scope: material.customerId ? "customer" : "central",
    customerId: material.customerId || "",
    supplierNote: material.supplierNote || "",
    tiers: [],
  };
}

export default function MaterialForm({
  mode = "create", value, onChange, customers = [], canPrice = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="mat-label">ชื่อวัสดุ</label>
          <input
            id="mat-label" className="premium-input" value={value.label} disabled={disabled}
            placeholder="เช่น ขวดแก้ว 30 ml สีชา"
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="mat-pm-type">ประเภทบรรจุภัณฑ์</label>
          <Select
            id="mat-pm-type" value={value.pmType} disabled={disabled}
            onChange={(e) => set({ pmType: e.target.value })}
            options={pmTypeOptions(value.pmType)}
          />
          <small style={{ color: "var(--text-3)" }}>ใช้กรองตัวเลือกวัสดุตอนประกอบต้นทุน</small>
        </div>

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
              options={customerSelectOptions(customers)}
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
        // PM อย่างเดียวแล้ว — หน่วยตายตัวต่อชิ้น (RM ต่อ กก. ไปอยู่ทะเบียนกลิ่น/สูตร)
        <PriceTierFields
          value={value.tiers} unitLabel="฿/ชิ้น" disabled={disabled}
          onChange={(tiers) => set({ tiers })}
        />
      )}
    </>
  );
}

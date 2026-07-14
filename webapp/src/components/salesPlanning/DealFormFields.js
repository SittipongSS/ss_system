"use client";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";

// ชุดช่องกรอกดีลมาตรฐาน (layout ตามมติ #283) — ใช้ร่วม 3 จุด: โมดัลหน้ารวมดีล /
// โมดัลหน้าดีล / ฟอร์มสร้างดีลจากลีด เพื่อไม่ให้ฟอร์มเพี้ยนหากันอีก
// แถว: ชื่อดีล (เต็ม) → ลูกค้า|แบรนด์ → ประเภท|หมวดสินค้า → สถานะ|FC% →
// เดือนคาดการณ์|มูลค่าคาดการณ์ → วันที่เริ่ม|วันที่สิ้นสุด → [extra] → รายละเอียด (เต็ม)
// ใช้ใน .form-grid (2 คอลัมน์) หรือ grid ใดๆ — ตัวเองไม่สร้าง form/grid ครอบ
import { brandSelectOptions } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import AddBrandButton from "@/components/master/AddBrandButton";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import { DEAL_TYPES, DEAL_TYPE_LABELS, STAGE_LABELS } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/components/salesPlanning/ui";

export default function DealFormFields({
  form,
  onPatch,               // (patchObject) => void
  customers = [],
  projects = [],
  showProject = false,
  categories = [],
  stages = [],           // ตัวเลือกสถานะ (caller กรอง won เอง)
  alreadyWon = false,    // ล็อก FC%/เดือน/มูลค่า หลังปิด Won
  onCustomersUpdated,    // ให้ AddBrandButton อัปเดตรายชื่อลูกค้าของ caller
  extra = null,          // ช่องเฉพาะจุด (เช่น มูลค่าปิดจริง/มัดจำ ของหน้าดีล) ก่อนรายละเอียด
}) {
  const set = (k) => (v) => onPatch({ [k]: v });
  return (
    <>
      <label className="deal-field" style={{ gridColumn: "1 / -1" }}>
        ชื่อดีล
        <input className="premium-input" value={form.title} onChange={(e) => set("title")(e.target.value)} required />
      </label>
      <label className="deal-field">
        {CUSTOMER_NAME_LABEL} (ไม่บังคับตอนแรก)
        <SearchableSelect
          entity="customer"
          value={form.customerId || ""}
          onChange={(customerId) => onPatch({ customerId, brand: "", ...(!form.lockedProjectId ? { projectId: "" } : {}) })}
          placeholder="ค้นหารหัส / ชื่อลูกค้า..."
          options={[
            { value: "", label: "— ยังไม่ผูกลูกค้า —" },
            ...customers.map((customer) => ({
              value: customer.id,
              label: customer.arCode ? `${customer.arCode} — ${customer.name}` : customer.name,
              search: `${customer.arCode || ""} ${customer.name || ""}`,
            })),
          ]}
        />
      </label>
      {showProject && <label className="deal-field">
        โครงการ
        <SearchableSelect
          entity="project"
          value={form.projectId || ""}
          onChange={(projectId) => {
            const project = projects.find((item) => item.id === projectId);
            onPatch({
              projectId,
              ...(!form.customerId && project?.customerId
                ? { customerId: project.customerId, customerName: project.customerName || "" }
                : {}),
            });
          }}
          disabled={!!form.lockedProjectId || alreadyWon}
          placeholder="ค้นหารหัส / ชื่อโครงการ..."
          options={[
            { value: "", label: "— ยังไม่เชื่อมโครงการ —" },
            ...projects
              .filter((project) => !form.customerId || !project.customerId || project.customerId === form.customerId || project.id === form.projectId)
              .map((project) => ({
                value: project.id,
                label: [project.code, project.name].filter(Boolean).join(" — ") || project.id,
                search: `${project.code || ""} ${project.name || ""} ${project.customerName || ""}`,
              })),
          ]}
        />
        {form.lockedProjectId && <small style={{ color: "var(--text-3)" }}>เชื่อมแล้ว หากต้องการเปลี่ยนโครงการให้จัดการจากหน้าโครงการ</small>}
      </label>}
      <label className="deal-field">
        แบรนด์
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <SearchableSelect
              entity="brand"
              value={form.brand || ""}
              onChange={set("brand")}
              disabled={!form.customerId}
              options={(() => {
                const options = brandSelectOptions(customers.find((c) => c.id === form.customerId)?.brands || []);
                if (form.brand && !options.some((option) => option.value === form.brand)) options.unshift({ value: form.brand, label: form.brand });
                return [{ value: "", label: form.customerId ? "— ไม่ระบุแบรนด์ —" : "เลือกลูกค้าก่อน" }, ...options];
              })()}
              placeholder={form.customerId ? "เลือกแบรนด์..." : "เลือกลูกค้าก่อน"}
            />
          </span>
          <AddBrandButton
            customerId={form.customerId}
            disabled={!form.customerId}
            onAdded={(b, updatedCustomer) => {
              onCustomersUpdated?.(updatedCustomer);
              onPatch({ brand: b.th || b.en });
            }}
          />
        </span>
      </label>
      <label className="deal-field">
        ประเภทดีล
        <Select className="premium-select" value={form.dealType} onChange={(e) => set("dealType")(e.target.value)}>
          {DEAL_TYPES.map((t) => <option key={t} value={t}>{t} · {DEAL_TYPE_LABELS[t]}</option>)}
        </Select>
      </label>
      <label className="deal-field">
        สถานะ
        <Select className="premium-select" value={form.stage} disabled={alreadyWon} onChange={(e) => set("stage")(e.target.value)}>
          {stages.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
        </Select>
      </label>
      <ProductCategorySelect
        categories={categories}
        value={form.categoryCode || ""}
        mainValue={form.categoryMainCode ?? String(form.categoryCode || "").split("-")[0] ?? ""}
        onChange={(categoryCode, meta) => onPatch({ categoryCode, categoryMainCode: meta.mainCode })}
      />
      <label className="deal-field">
        โอกาสที่จะปิดได้ (FC%)
        <Select className="premium-select" value={snapForecastLevel(form.probability)} disabled={alreadyWon} onChange={(e) => set("probability")(e.target.value)}>
          {FORECAST_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
      </label>
      <label className="deal-field">
        มูลค่าคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
        <MoneyInput value={form.projectValue} disabled={alreadyWon} onChange={(value) => set("projectValue")(value ?? "")} />
      </label>
      <label className="deal-field">
        เดือนคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
        <input type="month" className="premium-input" value={form.forecastMonth || ""} disabled={alreadyWon} onChange={(e) => set("forecastMonth")(e.target.value)} />
      </label>
      <label className="deal-field">
        วันที่คาดการณ์ปิด{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
        <DateInput value={form.expectedCloseDate || ""} disabled={alreadyWon} onChange={set("expectedCloseDate")} />
      </label>
      <label className="deal-field">
        วันที่เริ่ม
        <DateInput value={form.startDate || ""} onChange={set("startDate")} />
      </label>
      <label className="deal-field">
        วันที่สิ้นสุด
        <DateInput value={form.endDate || ""} onChange={set("endDate")} />
      </label>
      {extra}
      <label className="deal-field" style={{ gridColumn: "1 / -1" }}>
        รายละเอียด
        <textarea className="premium-input" rows={3} value={form.notes || ""} onChange={(e) => set("notes")(e.target.value)} />
      </label>
    </>
  );
}

"use client";

// ชุดช่องกรอกดีลมาตรฐาน (layout ตามมติ #283) — ใช้ร่วม 3 จุด: โมดัลหน้ารวมดีล /
// โมดัลหน้าดีล / ฟอร์มสร้างดีลจากลีด เพื่อไม่ให้ฟอร์มเพี้ยนหากันอีก
// แถว: ชื่อดีล (เต็ม) → ลูกค้า|แบรนด์ → ประเภท|หมวดสินค้า → สถานะ|FC% →
// เดือนคาดการณ์|มูลค่าคาดการณ์ → วันที่เริ่ม|วันที่สิ้นสุด → [extra] → รายละเอียด (เต็ม)
// ใช้ใน .form-grid (2 คอลัมน์) หรือ grid ใดๆ — ตัวเองไม่สร้าง form/grid ครอบ
import { brandThList } from "@/lib/master/brands";
import AddBrandButton from "@/components/master/AddBrandButton";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import { DEAL_TYPES, DEAL_TYPE_LABELS, STAGE_LABELS } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/components/salesPlanning/ui";

export default function DealFormFields({
  form,
  onPatch,               // (patchObject) => void
  customers = [],
  categories = [],
  stages = [],           // ตัวเลือกสถานะ (caller กรอง won เอง)
  alreadyWon = false,    // ล็อก FC%/เดือน/มูลค่า หลังปิด Won
  onCustomersUpdated,    // ให้ AddBrandButton อัปเดตรายชื่อลูกค้าของ caller
  extra = null,          // ช่องเฉพาะจุด (เช่น มูลค่าปิดจริง/มัดจำ ของหน้าดีล) ก่อนรายละเอียด
}) {
  const set = (k) => (v) => onPatch({ [k]: v });
  return (
    <>
      <label style={{ gridColumn: "1 / -1" }}>
        ชื่อดีล
        <input className="premium-input" value={form.title} onChange={(e) => set("title")(e.target.value)} required />
      </label>
      <label>
        ลูกค้า (ไม่บังคับตอนแรก)
        <select className="premium-select" value={form.customerId || ""} onChange={(e) => onPatch({ customerId: e.target.value, brand: "" })}>
          <option value="">— ยังไม่ผูกลูกค้า —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        แบรนด์
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select className="premium-select" style={{ flex: 1, minWidth: 0 }} value={form.brand || ""} onChange={(e) => set("brand")(e.target.value)} disabled={!form.customerId}>
            <option value="">{form.customerId ? "— ไม่ระบุแบรนด์ —" : "เลือกลูกค้าก่อน"}</option>
            {(() => {
              const opts = brandThList((customers.find((c) => c.id === form.customerId)?.brands) || []);
              const withCur = form.brand && !opts.includes(form.brand) ? [form.brand, ...opts] : opts;
              return withCur.map((b) => <option key={b} value={b}>{b}</option>);
            })()}
          </select>
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
      <label>
        ประเภทดีล
        <select className="premium-select" value={form.dealType} onChange={(e) => set("dealType")(e.target.value)}>
          {DEAL_TYPES.map((t) => <option key={t} value={t}>{t} · {DEAL_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label>
        หมวดสินค้า{form.dealType !== "SCENT" ? " (บังคับ)" : " (ไม่บังคับ)"}
        <select className="premium-select" required={form.dealType !== "SCENT"} value={form.categoryCode || ""} onChange={(e) => set("categoryCode")(e.target.value)}>
          <option value="">— เลือกหมวดสินค้า —</option>
          {categories.map((c) => {
            const code = `${c.mainCategoryCode}-${c.typeCode}`;
            return <option key={code} value={code}>{code} · {c.nameTh || c.nameEn || ""}</option>;
          })}
        </select>
      </label>
      <label>
        สถานะ
        <select className="premium-select" value={form.stage} onChange={(e) => set("stage")(e.target.value)}>
          {stages.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
        </select>
      </label>
      <label>
        โอกาสที่จะปิดได้ (FC%)
        <select className="premium-select" value={snapForecastLevel(form.probability)} disabled={alreadyWon} onChange={(e) => set("probability")(e.target.value)}>
          {FORECAST_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <label>
        เดือนคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
        <input type="month" className="premium-input" value={form.forecastMonth || ""} disabled={alreadyWon} onChange={(e) => set("forecastMonth")(e.target.value)} />
      </label>
      <label>
        มูลค่าคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
        <MoneyInput value={form.projectValue} disabled={alreadyWon} onChange={(value) => set("projectValue")(value ?? "")} />
      </label>
      <label>
        วันที่เริ่ม
        <DateInput value={form.startDate || ""} onChange={set("startDate")} />
      </label>
      <label>
        วันที่สิ้นสุด
        <DateInput value={form.endDate || ""} onChange={set("endDate")} />
      </label>
      {extra}
      <label style={{ gridColumn: "1 / -1" }}>
        รายละเอียด
        <textarea className="premium-input" rows={3} value={form.notes || ""} onChange={(e) => set("notes")(e.target.value)} />
      </label>
    </>
  );
}

"use client";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";

// ชุดช่องกรอกดีลมาตรฐาน (layout ตามมติ #283) — ใช้ร่วม 3 จุด: โมดัลหน้ารวมดีล /
// โมดัลหน้าดีล / ฟอร์มสร้างดีลจากลีด เพื่อไม่ให้ฟอร์มเพี้ยนหากันอีก
// แถว: ชื่อดีล (เต็ม) → ลูกค้า|โครงการ → แบรนด์|ประเภท → สถานะ|FC% →
// หมวดสินค้า (เต็ม) → มูลค่าคาดการณ์|วันที่คาดปิด → วันที่เริ่ม|วันที่สิ้นสุด →
// รายละเอียด (เต็ม)
// ไม่มีช่อง "เดือนคาดการณ์" แล้ว (มติผู้ใช้ 2026-07-16) — เดือน FC อนุมานจากวันที่คาดปิด
// ฝั่ง server เสมอ ฟอร์มโชว์เดือนที่จะได้เป็น hint ใต้ช่องวันที่
// ใช้ใน .form-grid (2 คอลัมน์) หรือ grid ใดๆ — ตัวเองไม่สร้าง form/grid ครอบ
//
// ไม่มี prop `extra` แล้ว (มติผู้ใช้ 2026-07-17): เดิมหน้ารายละเอียดดีลใช้ยัด
// checkbox "ได้รับมัดจำแล้ว" เข้ามาที่เดียว ฟอร์มแก้ดีลเลยหน้าตาไม่ตรงกับหน้ารวม
// — ผิดกฎ "แก้ = ฟอร์มเดียวกับสร้าง" (ดู AGENTS.md). ช่องเฉพาะจุดแบบนี้คือรูรั่ว
// ของกฎ เปิดไว้เมื่อไรฟอร์มก็เพี้ยนกันเมื่อนั้น — ถ้าต้องมีช่องต่างจริง ใช้ props
// แบบโหมด (เช่น alreadyWon) ไม่ใช่ช่องเสียบอิสระ
import { brandSelectOptions } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import { DEAL_TYPES, DEAL_TYPE_LABELS, STAGE_LABELS, monthKey } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/components/salesPlanning/ui";

// จับช่องเป็นคู่ซ้าย-ขวาเองแทนปล่อยไหลตาม grid แม่ (มติผู้ใช้ 2026-07-17).
// ปล่อยไหลแล้วคุมไม่ได้: จำนวนช่องเปลี่ยนตาม showProject และ ProductCategorySelect
// กินเต็มแถว (grid-column: 1/-1) — พอ parity พลิก คู่ก็เลื่อนทั้งแถบ ผลคือวันที่เริ่ม/
// สิ้นสุดหลุดคนละบรรทัด และมีรูโหว่ข้างสถานะ.
// แถวที่เหลือช่องเดียว (จำนวนคี่) กินเต็มแถวแทนการทิ้งรูไว้ข้าง ๆ
function pairRows(fields) {
  const items = fields.filter(Boolean);
  const out = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out.map((pair, i) => (
    <div className="deal-row" data-single={pair.length === 1 ? "" : undefined} key={i}>
      {pair}
    </div>
  ));
}

export default function DealFormFields({
  form,
  onPatch,               // (patchObject) => void
  customers = [],
  projects = [],
  showProject = false,
  categories = [],
  stages = [],           // ตัวเลือกสถานะ (caller กรอง won เอง)
  alreadyWon = false,    // ล็อก FC%/เดือน/มูลค่า หลังปิด Won
}) {
  const set = (k) => (v) => onPatch({ [k]: v });

  const customerField = (
    <label className="deal-field" key="customer">
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
  );

  const projectField = showProject && (
    <label className="deal-field" key="project">
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
    </label>
  );

  const brandField = (
    <label className="deal-field" key="brand">
      แบรนด์
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
      <small style={{ color: "var(--text-3)" }}>เพิ่มแบรนด์ใหม่ได้ที่หน้าข้อมูลลูกค้า</small>
    </label>
  );

  const dealTypeField = (
    <label className="deal-field" key="dealType">
      ประเภทดีล
      <Select className="premium-select" value={form.dealType} onChange={(e) => set("dealType")(e.target.value)}>
        {DEAL_TYPES.map((t) => <option key={t} value={t}>{t} · {DEAL_TYPE_LABELS[t]}</option>)}
      </Select>
    </label>
  );

  const stageField = (
    <label className="deal-field" key="stage">
      สถานะ
      <Select className="premium-select" value={form.stage} disabled={alreadyWon} onChange={(e) => set("stage")(e.target.value)}>
        {stages.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
      </Select>
    </label>
  );

  const fcField = (
    <label className="deal-field" key="fc">
      โอกาสที่จะปิดได้ (FC%)
      <Select className="premium-select" value={snapForecastLevel(form.probability)} disabled={alreadyWon} onChange={(e) => set("probability")(e.target.value)}>
        {FORECAST_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </Select>
    </label>
  );

  const valueField = (
    <label className="deal-field" key="value">
      มูลค่าคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
      <MoneyInput value={form.projectValue} disabled={alreadyWon} onChange={(value) => set("projectValue")(value ?? "")} />
    </label>
  );

  const closeDateField = (
    <label className="deal-field" key="closeDate">
      วันที่คาดการณ์ปิด{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
      <DateInput value={form.expectedCloseDate || ""} disabled={alreadyWon} onChange={set("expectedCloseDate")} />
      <small style={{ color: "var(--text-3)" }}>
        {form.expectedCloseDate
          ? `เดือน FC: ${monthKey(form.expectedCloseDate) || "-"} (จากวันที่คาดปิด)`
          : "ไม่ระบุ = เดือน FC ตกเป็นเดือนปัจจุบัน"}
      </small>
    </label>
  );

  const startField = (
    <label className="deal-field" key="start">
      วันที่เริ่ม
      <DateInput value={form.startDate || ""} onChange={set("startDate")} />
    </label>
  );

  const endField = (
    <label className="deal-field" key="end">
      วันที่สิ้นสุด
      <DateInput value={form.endDate || ""} onChange={set("endDate")} />
    </label>
  );

  return (
    <>
      <label className="deal-field" style={{ gridColumn: "1 / -1" }}>
        ชื่อดีล
        <input className="premium-input" value={form.title} onChange={(e) => set("title")(e.target.value)} required />
      </label>

      {/* ก่อนหมวดสินค้า: 6 ช่อง (มีโครงการ) หรือ 5 ช่อง (ไม่มี) — pairRows จัดคู่ให้
          และดันช่องที่เหลือเดี่ยวให้เต็มแถว จึงไม่มีรูไม่ว่ากรณีไหน */}
      {pairRows([customerField, projectField, brandField, dealTypeField, stageField, fcField])}

      {/* กินเต็มแถวเองอยู่แล้ว (grid-column: 1/-1 ใน globals.css) */}
      <ProductCategorySelect
        categories={categories}
        value={form.categoryCode || ""}
        mainValue={form.categoryMainCode ?? String(form.categoryCode || "").split("-")[0] ?? ""}
        onChange={(categoryCode, meta) => onPatch({ categoryCode, categoryMainCode: meta.mainCode })}
      />

      {/* หลังหมวดสินค้า: 4 ช่องคงที่ → วันที่เริ่ม/สิ้นสุดอยู่คู่กันเสมอ ไม่ขึ้นกับ showProject */}
      {pairRows([valueField, closeDateField, startField, endField])}

      <label className="deal-field" style={{ gridColumn: "1 / -1" }}>
        รายละเอียด
        <textarea className="premium-input" rows={3} value={form.notes || ""} onChange={(e) => set("notes")(e.target.value)} />
      </label>
    </>
  );
}

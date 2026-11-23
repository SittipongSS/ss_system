"use client";
// ── ฟอร์มส่งงานของแถวพัฒนาสูตรหมวดหัวน้ำหอม (02-020) = ฟอร์มทะเบียนกลิ่น (ม-166 · 23/11/2026) ─────────────────
//
// ⭐ เจ้าของ: *"PF85901010301 · THE MOMENT OF TEA TIME #3.1 REV1 · 10/09/2026 มันคือกลิ่นนะ"* — ของที่ส่งเข้าทะเบียนกลิ่น
//   ⇒ ฟอร์มต้องเป็น `ScentForm` ตัวเดียวกับทะเบียนกลิ่น/ส่งงานพัฒนากลิ่น (กฎ "ฟอร์มเดียว" ของ AGENTS.md) ไม่ใช่ฟอร์มสูตรเปลี่ยนป้าย
// ⚠️ **ร่างยังเป็นทรงก้อน `formula`** (ชื่อ · รหัส · formulaDate · หมายเหตุ) — ด่านของจอ/server (`normalizeFormulaDelivery`
//   `{ scent: true }`) อ่านก้อนเดียวกันทุกทางเข้า (โมดัลรายแถว · แท็บ direction · ส่งรวบ) · แปลงทรงที่นี่ที่เดียว
//   วันที่ผลิตกลิ่น (`producedAt`) ↔ `formulaDate`
// ⚠️ ลูกค้ากับ "แก้มาจากกลิ่น" ล็อก — server ยกจากใบ/แถวเอง (ไม่เชื่อ client)
import ScentForm, { emptyScentForm } from "@/components/database/ScentForm";

export default function OilScentDeliveryForm({
  value, onChange, customers = [], scents = [], customerId = "", parentScentId = "", disabled = false, idPrefix = "oil",
}) {
  const scentValue = {
    ...emptyScentForm(),
    name: value?.name || "",
    code: value?.code || "",
    producedAt: value?.formulaDate || "",
    note: value?.note || "",
    customerTradeName: value?.customerTradeName || "",
    customerId: customerId || "",
    derivedFromScentId: parentScentId || "",
  };
  return (
    <ScentForm
      mode="create" canSetCode canSetLegacy codeRequired
      idPrefix={idPrefix}
      value={scentValue}
      disabled={disabled}
      customers={customers}
      scents={scents}
      locked={["customerId", "derivedFromScentId"]}
      lockedNote="ยกมาจากรายการในคำร้อง — แก้ที่นี่ไม่ได้"
      hide={["sentAt", "status"]}
      historyTitle="วันของกลิ่นตัวนี้"
      historyNote="วันผลิตจริงของกลิ่น — วันส่งมอบระบบประทับให้ตอนกดส่ง"
      onChange={(next) => onChange({
        ...value,
        name: next.name,
        code: next.code,
        formulaDate: next.producedAt,
        note: next.note,
        customerTradeName: next.customerTradeName,
      })}
    />
  );
}

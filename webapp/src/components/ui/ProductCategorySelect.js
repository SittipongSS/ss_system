"use client";
// ── ตัวเลือกหมวดสินค้ากลาง — ช่องเดียว สองชั้นอยู่ข้างใน ────────────────────
//
// ⭐ เดิมเป็นดรอปดาวน์ **สองช่อง** วางคู่กัน (หมวดหลัก | หมวดรอง) ซึ่งใช้ได้ดีในฟอร์ม
// แต่ลงเซลล์ตารางไม่ได้เลย — และตารางบรรทัด "พัฒนาผลิตภัณฑ์" ต้องเลือกหมวดในเซลล์
// เดียว ⇒ ถ้าไม่ยุบตอนนี้ จะได้ตัวเลือกหมวดสองเวอร์ชันที่ต้องคอยดูแลให้ตรงกันตลอดไป
//
// ยุบแล้ว **ยังเป็นสองชั้นเหมือนเดิม** — หมวดหลักกลายเป็นหัวกลุ่มในลิสต์เดียว
// และหายไปหนึ่งจังหวะที่เคยสะดุด: "เลือกหมวดหลักแล้วค้างรอเลือกหมวดรองอีกที"
//
// ⚠️ **สัญญาเดิมกับผู้เรียกไม่เปลี่ยนแม้แต่ข้อเดียว** — รับ value/mainValue/subValue
// และคืน `onChange(code, { mainCode, typeCode, category })` เหมือนเดิมเป๊ะ ๆ
// ผู้เรียก 3 จุด (DealFormFields · ProjectFormModal · SalesProjectCreateModal) เก็บ
// mainCode/typeCode ลงช่องของตัวเองคนละแบบ — เปลี่ยนรูป meta เมื่อไรพังเงียบทั้งสามที่
import { useMemo } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { findCategoryByCode, productCategoryOptions } from "@/lib/master/productCategoryOptions";

export default function ProductCategorySelect({
  categories = [],
  value = "",
  mainValue,
  subValue,
  onChange,
  onMainChange,
  onSubChange,
  disabled = false,
  required = false,
  label = "หมวดสินค้า",
  className = "",
}) {
  const [valueMain = "", valueSub = ""] = String(value || "").split("-");
  const mainCode = mainValue ?? valueMain;
  const typeCode = subValue ?? valueSub;
  const currentCode = value || (mainCode && typeCode ? `${mainCode}-${typeCode}` : "");

  const options = useMemo(
    () => productCategoryOptions(categories, { currentCode }),
    [categories, currentCode],
  );

  // ⚠️ ยังยิง onMainChange/onSubChange ให้ครบ — ผู้เรียกบางจุดผูกกับสองตัวนี้
  // ไม่ใช่กับ meta (ProjectFormModal เก็บ mainCode/typeCode เป็นคนละ state)
  const choose = (code) => {
    const [nextMain = "", nextType = ""] = String(code || "").split("-");
    const category = findCategoryByCode(categories, code);
    onMainChange?.(nextMain);
    onSubChange?.(nextType, category);
    onChange?.(code || "", { mainCode: nextMain, typeCode: nextType, category });
  };

  return (
    <div className={`ui-product-category-select ${className}`.trim()}>
      <label>
        <span>{label}{required ? <span className="required-mark"> *</span> : null}</span>
        <SearchableSelect
          entity="productCategory"
          value={currentCode}
          onChange={choose}
          options={[{ value: "", label: "— ไม่ระบุ —" }, ...options]}
          placeholder="เลือกหมวดสินค้า"
          searchPlaceholder="ค้นด้วยรหัส · ชื่อไทย · ชื่ออังกฤษ"
          disabled={disabled}
          ariaLabel={label}
          // ⚠️ emptyText ต้องบอก **ทำไมว่างและใครแก้ได้** ไม่ใช่ "ไม่พบรายการ" เฉย ๆ
          emptyText={(q) => (q
            ? `ไม่พบหมวดที่ตรงกับ "${q}" — ค้นได้ทั้งรหัส ชื่อไทย และชื่ออังกฤษ`
            : "ยังไม่มีหมวดสินค้าในระบบ — เพิ่มได้ที่ ตั้งค่า › หมวดสินค้า")}
        />
      </label>
    </div>
  );
}

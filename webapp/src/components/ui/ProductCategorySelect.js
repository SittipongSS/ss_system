"use client";

import { useMemo } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { isProductCategorySelectable } from "@/lib/master/productCategory";

const mainName = (row) => row.mainCategoryName || row.mainCategoryNameTh || row.mainCategoryNameEn || "";
const subName = (row) => row.nameTh || row.nameEn || "";

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
  className = "",
}) {
  const [valueMain = "", valueSub = ""] = String(value || "").split("-");
  const mainCode = mainValue ?? valueMain;
  const typeCode = subValue ?? valueSub;
  const currentCode = value || (mainCode && typeCode ? `${mainCode}-${typeCode}` : "");
  const selectableCategories = useMemo(
    () => categories.filter((row) => isProductCategorySelectable(row, currentCode)),
    [categories, currentCode],
  );
  const mainOptions = useMemo(() => {
    const rows = new Map();
    for (const category of selectableCategories) {
      if (!category.mainCategoryCode || rows.has(category.mainCategoryCode)) continue;
      rows.set(category.mainCategoryCode, mainName(category));
    }
    return [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({
      value: code,
      label: `${code} ${name}`.trim(),
      search: `${code} ${name}`.trim(),
    }));
  }, [selectableCategories]);
  const subOptions = useMemo(() => selectableCategories
    .filter((row) => row.mainCategoryCode === mainCode && row.typeCode)
    .sort((a, b) => String(a.typeCode).localeCompare(String(b.typeCode)))
    .map((row) => ({
      value: row.typeCode,
      label: `${row.typeCode} ${subName(row)}${row.isActive === false ? " (พักใช้งาน)" : ""}`.trim(),
      search: `${row.typeCode} ${subName(row)}`.trim(),
    })), [selectableCategories, mainCode]);

  const changeMain = (nextMain) => {
    onMainChange?.(nextMain);
    onChange?.("", { mainCode: nextMain, typeCode: "", category: null });
  };
  const changeSub = (nextType) => {
    const category = selectableCategories.find((row) => row.mainCategoryCode === mainCode && row.typeCode === nextType) || null;
    onSubChange?.(nextType, category);
    onChange?.(nextType ? `${mainCode}-${nextType}` : "", { mainCode, typeCode: nextType, category });
  };

  return (
    <div className={`ui-product-category-select ${className}`.trim()}>
      <label>
        <span>หมวดหลัก{required ? <span className="required-mark"> *</span> : null}</span>
        <SearchableSelect
          entity="mainCategory"
          value={mainCode}
          onChange={changeMain}
          options={[{ value: "", label: "— ไม่ระบุ —" }, ...mainOptions]}
          placeholder="ค้นหาหมวดหลัก..."
          disabled={disabled}
          ariaLabel="หมวดหลัก"
        />
      </label>
      <label>
        <span>หมวดรอง{required ? <span className="required-mark"> *</span> : null}</span>
        <SearchableSelect
          entity="subCategory"
          value={typeCode}
          onChange={changeSub}
          options={[{ value: "", label: mainCode ? "— เลือกหมวดรอง —" : "เลือกหมวดหลักก่อน" }, ...subOptions]}
          placeholder={mainCode ? "ค้นหาหมวดรอง..." : "เลือกหมวดหลักก่อน"}
          disabled={disabled || !mainCode}
          ariaLabel="หมวดรอง"
        />
      </label>
    </div>
  );
}

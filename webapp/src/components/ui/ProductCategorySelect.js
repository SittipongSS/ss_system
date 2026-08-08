"use client";
// ── ตัวเลือกหมวดสินค้ากลาง — แผงสองชั้นของระบบ (TwoPanePicker) ────────────
//
// ⭐ มติผู้ใช้ 2026-08-08 (เลือก "แบบ B" จาก mock 3 ทาง — artifact 83d209ac และสั่ง
// "เอาไว้เป็นดีไซน์กลาง"): หมวดหลัก 4 ตัวเป็น rail ซ้ายเห็นครบตามกติกาคอนโทรล
// หมวดรอง ~105 แถวเป็นลิสต์ขวา + ช่องค้น · ของสองชั้นทั้งระบบใช้ **TwoPanePicker**
// ตัวเดียว (มติเดิม 2026-08-06 ของตัวเลือกดีล/โครงการ) — ไฟล์นี้จึงเป็นแค่ adapter
// แปลงทะเบียนหมวด ไม่มีแผงของตัวเอง
//
// ทำไมไม่ใช่ดรอปดาวน์กลุ่มแบน (ของเดิม): 105 บรรทัดในลิสต์เดียว หัวกลุ่มเลื่อนหาย
// ระหว่างไล่ · rail ทำให้ "อยู่หมวดไหน" ค้างตาตลอด และป้ายภาษี/อย. ขึ้นรายแถวได้
//
// ⚠️ **สัญญาเดิมกับผู้เรียกไม่เปลี่ยนแม้แต่ข้อเดียว** — รับ value/mainValue/subValue
// และคืน `onChange(code, { mainCode, typeCode, category })` เหมือนเดิมเป๊ะ ๆ
// ผู้เรียก 3 จุด (DealFormFields · ProjectFormModal · SalesProjectCreateModal) เก็บ
// mainCode/typeCode ลงช่องของตัวเองคนละแบบ — เปลี่ยนรูป meta เมื่อไรพังเงียบทั้งสามที่
import { useMemo } from "react";
import TwoPanePicker from "@/components/ui/TwoPanePicker";
import { isProductCategorySelectable, productCategoryCode } from "@/lib/master/productCategory";
import {
  categoryOptionLabel, findCategoryByCode, mainCategoryName,
} from "@/lib/master/productCategoryOptions";

// กลุ่มรวม "ทั้งหมด" — ปลายทางของปุ่ม "ค้นต่อในทั้งหมด" เมื่อค้นในหมวดเดียวไม่เจอ
const ALL_KEY = "__all";

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

  const groups = useMemo(() => {
    const rows = (categories || []).filter((row) => isProductCategorySelectable(row, currentCode));
    const byMain = new Map();
    for (const row of rows) {
      if (!row?.mainCategoryCode || !row?.typeCode) continue;
      if (!byMain.has(row.mainCategoryCode)) byMain.set(row.mainCategoryCode, []);
      byMain.get(row.mainCategoryCode).push(row);
    }
    const item = (row) => {
      const code = productCategoryCode(row);
      const headName = mainCategoryName(row);
      // ธงภาษี/อย. ติดมากับหมวด — ขึ้นเป็น meta รายแถวให้เห็นตั้งแต่ตอนเลือก
      const flags = [row.isExcise && "สรรพสามิต", row.requiresFdaNotice && "แจ้ง อย."]
        .filter(Boolean).join(" · ");
      return {
        value: code,
        label: categoryOptionLabel(row),
        meta: flags || undefined,
        // ค้นได้ทั้งไทย อังกฤษ รหัส และชื่อหมวดหลัก — พิมพ์ `candle` ต้องเจอ "เทียนหอม"
        search: [code, row.nameTh, row.nameEn, headName, row.mainCategoryCode]
          .filter(Boolean).join(" "),
      };
    };
    const out = [];
    for (const code of [...byMain.keys()].sort((a, b) => String(a).localeCompare(String(b)))) {
      const children = byMain.get(code)
        .slice()
        .sort((a, b) => String(a.typeCode).localeCompare(String(b.typeCode)));
      const headName = mainCategoryName(children[0]);
      out.push({
        key: code,
        label: headName ? `${code} ${headName}` : code,
        search: [code, headName].filter(Boolean).join(" "),
        items: children.map(item),
      });
    }
    // "ทั้งหมด" อยู่ท้ายราง — ให้กลุ่มจริงชนะตอนหา "กลุ่มของค่าที่เลือกอยู่"
    out.push({
      key: ALL_KEY,
      label: "ทั้งหมด",
      alwaysVisible: true,
      items: out.flatMap((group) => group.items),
    });
    return out;
  }, [categories, currentCode]);

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
        <TwoPanePicker
          groups={groups}
          value={currentCode}
          onChange={(code) => choose(code)}
          disabled={disabled}
          clearable
          clearLabel="— ไม่ระบุ —"
          placeholder="เลือกหมวดสินค้า"
          groupSearchPlaceholder="ค้นหมวดหลัก…"
          itemSearchPlaceholder="ค้นด้วยรหัส · ชื่อไทย · ชื่ออังกฤษ"
          allGroupKey={ALL_KEY}
          ariaLabel={label}
          // ⚠️ emptyText ต้องบอก **ทำไมว่างและใครแก้ได้** ไม่ใช่ "ไม่พบรายการ" เฉย ๆ
          itemEmptyText="ไม่พบหมวดที่ตรงกับคำค้น — ค้นได้ทั้งรหัส ชื่อไทย และชื่ออังกฤษ"
          groupEmptyText="ยังไม่มีหมวดสินค้าในระบบ — เพิ่มได้ที่ ตั้งค่า › หมวดสินค้า"
        />
      </label>
    </div>
  );
}

"use client";
// ฟอร์มสินค้า — ใช้ร่วม 2 จุด: โมดัลเพิ่มสินค้า (/database/products) กับโมดัล
// แก้ไขสินค้า (EditProductModal) ตามกฎ [[edit-reuses-create-form]]
//
// เดิมเป็นฟอร์มคนละชุด — EditProductModal เขียนคอมเมนต์สารภาพไว้เองว่า "Layout/
// styling mirrors the add product form so both forms feel like one system" คือ
// ก๊อปกันมาแล้วต้องคอยซิงก์มือ (ตอนเพิ่มช่องสูตร mig 0112 ก็ต้องแก้ 2 ไฟล์)
//
// ต่างกันได้แค่ "โหมด" ผ่าน props:
//   creatorName    — ป้าย "ผู้สร้าง" มีเฉพาะตอนสร้าง
//   factoryPrice   — "input" (สร้าง: กรอกได้) | "readonly" (แก้: ดูอย่างเดียว
//                    ต้องกดปุ่มอัปเดตราคาผลิตแยก เพราะกระทบประวัติราคา/ต้นทุน)
//   onCodeMode     — มีสวิตช์ "ระบบใหม่" (โหมดสร้าง) · ไม่ส่ง = โหมดแก้
//                    เปิด = ไม่มีช่องพิมพ์รหัส มีตัวเลือกหมวด + แถบรหัสที่ประกอบให้
//                    ปิด = ช่องพิมพ์รหัสแบบเดิม หมวดอ่านย้อนจากรหัส (mig 0230)
import { useEffect, useState } from "react";
import CodeStrip from "@/components/ui/CodeStrip";
import MoneyInput from "@/components/ui/MoneyInput";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  RETAIL_PRICE_MAIN_CATEGORY, categoryInfoOf, categoryOf, showsRetailPriceForCategory,
} from "@/lib/master/categoryOf";
import { categoryNameBoth } from "@/lib/master/productCategoryOptions";
import {
  CODE_MODE_AUTO, CODE_MODE_MANUAL, FG_MANUAL_HINT, codeModeOf, customerCodeSegment,
  fgCodeHasRunNo, fgCodeParts,
} from "@/lib/master/masterCodes";
import {
  productDuplicateWarning, productOtherSizeHint, splitProductMatches,
} from "@/lib/master/productDuplicate";
import { brandBoth, hasBrandField } from "@/lib/master/brands";
import {
  DEFAULT_SALE_UNIT,
  DEFAULT_VOLUME_UNIT,
  SALE_UNITS,
  VOLUME_UNITS,
  hasPackagingFields,
  packagingSummary,
  unitOptions,
} from "@/lib/master/units";
import { fmtMoney, naText } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { customerSelectOptions } from "@/components/master/customerOption";

export const EMPTY_PRODUCT = {
  customerId: "", fgCode: "", productDescription: "", productDescriptionEn: "",
  // หมวดสินค้า (mig 0230): โหมดระบบใหม่เลือกจากตัวเลือกหมวดแล้วรหัสประกอบตาม ·
  // โหมดกรอกเองอ่านย้อนจากรหัสที่พิมพ์ — ทั้งสองทางเขียนลงช่องนี้ช่องเดียว
  categoryCode: "",
  brandName: "", brandNameEn: "",
  // สูตรมาจากทะเบียน (mig 0171) — formulaName/Code/Date เป็น snapshot ที่ server
  // เติมให้จาก formulaId ฟอร์มไม่ต้องส่ง (เก็บไว้ใน state เพื่อโชว์ค่าเดิมของ
  // สินค้าที่ยังไม่ผูกทะเบียนเท่านั้น)
  formulaId: "", formulaName: "", formulaCode: "", formulaDate: "",
  volume: "", volumeUnit: DEFAULT_VOLUME_UNIT, saleUnit: DEFAULT_SALE_UNIT, piecesPerCase: "", costPrice: "", retailPriceIncVat: "",
};

// ช่องที่โมดัลแก้ดึงจากสินค้าเดิม (costPrice ไม่อยู่ในนี้ — อัปเดตผ่าน action แยก)
export const PRODUCT_EDIT_FIELDS = [
  "customerId", "fgCode", "categoryCode", "productDescription", "productDescriptionEn",
  "brandName", "brandNameEn", "formulaId", "formulaName", "formulaCode", "formulaDate",
  "volume", "volumeUnit", "saleUnit", "piecesPerCase", "retailPriceIncVat",
];

export const productToForm = (p) => {
  const seed = { ...EMPTY_PRODUCT };
  for (const k of PRODUCT_EDIT_FIELDS) seed[k] = p[k] ?? "";
  return seed;
};

// กล่องบอกหมวดหมู่/ภาษีสรรพสามิต/จดแจ้ง อย. — ธงมาจากช่องติ๊กบนหมวดสินค้า
// (product_types.isExcise / requiresFdaNotice, mig 0131)
//
// รับ **รหัสหมวด** ตรง ๆ (โหมดระบบใหม่: มาจากตัวเลือกหมวด) หรืออ่านย้อนจากรหัส FG
// ที่พิมพ์ (โหมดกรอกเอง) — สองทางนี้คือสองโหมดของฟอร์ม ไม่ใช่กล่องคนละใบ
function CategoryBox({ categoryCode, fgCode, productTypes }) {
  const code = categoryCode || categoryOf(fgCode);
  const cat = categoryInfoOf(code, productTypes);
  if (!categoryCode && !fgCode) {
    return <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวดที่ติ๊ก &quot;เสียภาษีสรรพสามิต&quot; เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>;
  }
  if (!cat.code) {
    return <div className="mt-2 text-xs text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
  }
  if (!cat.found) {
    if (!productTypes.length) return null; // ยังโหลดไม่เสร็จ — อย่าเพิ่งฟ้องว่าไม่มีหมวด
    return <div className="mt-2 text-xs text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">พบหมวดหมู่ <strong>{cat.code}</strong> แต่ไม่มีในฐานข้อมูล (อาจพิมพ์ผิด หรือเป็นหมวดใหม่)</div>;
  }
  if (cat.typeInfo.isActive === false) {
    return (
      <div className="mt-2 text-xs text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">
        หมวด <strong>{cat.code}</strong> ถูกพักใช้งานแล้ว ข้อมูลเดิมยังดูได้ แต่ไม่สามารถใช้กับสินค้าใหม่หรือเปลี่ยนสินค้าอื่นมาเป็นหมวดนี้
      </div>
    );
  }
  const isExcise = !!cat.typeInfo.isExcise;
  const requiresFda = !!cat.typeInfo.requiresFdaNotice;
  return (
    <div className={`mt-2 p-3 text-xs rounded-lg border border-[var(--border)] flex flex-col gap-1 ${isExcise ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--text-2)]"}`}>
      <div className="flex items-center gap-2">
        {/* พื้นชิปเคยเป็น bg-white/50 — บนธีมมืดกลายเป็นขาวจาง ๆ ทับตัวอักษรสีส้ม
            อ่านแทบไม่ออก · ใช้พื้นของระบบแทนเพื่อให้อ่านได้ทั้งสองธีม */}
        <span className="font-mono px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--panel)]">{cat.code}</span>
        <span className="font-semibold">{categoryNameBoth(cat.typeInfo) || cat.code}</span>
      </div>
      <div className="text-[11px] opacity-80 pl-1">กลุ่มหลัก: {cat.typeInfo.mainCategoryName}</div>
      {/* เตือนเฉพาะหมวดที่ติ๊กธง (ส่วนน้อย) — หมวดอื่นไม่ต้องพูดถึงภาษี/อย. เลย */}
      {isExcise && (
        <div className="mt-1 pl-1 font-semibold">⚠️ สินค้านี้ต้องขึ้นทะเบียนและชำระภาษีสรรพสามิต (ระบบจะคิดภาษีอัตโนมัติ)</div>
      )}
      {requiresFda && (
        <div className={`mt-1 pl-1 font-semibold ${isExcise ? "" : "text-[var(--blue)]"}`}>📋 หมวดนี้ต้องจดแจ้ง อย. — โปรดตรวจว่าสินค้าได้จดแจ้งก่อนวางจำหน่าย</div>
      )}
    </div>
  );
}

export default function ProductForm({
  form,
  onForm,                    // (patch) => void
  productTypes = [],
  customers = [],
  formulas = [],             // ทะเบียนสูตร (mig 0171) — ที่มาเดียวของข้อมูลสูตร
  brandOptions = [],         // [{th,en}] ของลูกค้าที่เลือก
  onCustomerChange,          // (customerId) => void — caller ล้างแบรนด์/โหลดใหม่
  creatorName = null,        // ป้าย "ผู้สร้าง" (เฉพาะตอนสร้าง)
  factoryPrice = "input",    // "input" | "readonly"
  currentCostPrice = null,   // โชว์ตอน readonly
  // ── โหมดรหัสสินค้า (มติผู้ใช้ 2026-08-12 "แบบ A") ────────────────────────
  // onCodeMode = null (ค่าตั้งต้น) แปลว่าไม่มีสวิตช์ = โหมดแก้
  codeMode = CODE_MODE_MANUAL,
  onCodeMode = null,
  nextFgRunNo = null,        // เลขรันถัดไปสำหรับแถบรหัส (พรีวิว ไม่ใช่เลขที่จองแล้ว)
  fgLocked = false,          // รหัสที่ระบบออกให้ = ล็อกตอนแก้ (API บังคับซ้ำอยู่แล้ว)
  selfId = null,             // โหมดแก้: id ของใบนี้เอง — กันรายงานว่า "ซ้ำกับตัวเอง"
}) {
  const set = (k) => (e) => onForm({ [k]: e?.target ? e.target.value : e });
  const money = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "-" : fmtMoney(v));
  const mode = codeModeOf(codeMode);
  const autoCode = !!onCodeMode && mode === CODE_MODE_AUTO;

  // หมวดสินค้า: โหมดระบบใหม่เลือกจากตัวเลือกหมวดกลาง · โหมดกรอกเอง**อ่านจากรหัสที่พิมพ์
  // เท่านั้น** — ไม่ถอยไปใช้ form.categoryCode เพราะค่านั้นอาจเป็นของที่เลือกไว้ก่อนกด
  // ปิดสวิตช์ แล้วกล่องหมวดจะประกาศหมวดที่ยังไม่มีรหัสรองรับ (เห็นตอนพรีวิว: ช่องรหัส
  // ว่าง แต่กล่องยังบอกว่า 01-002 ต้องเสียภาษีสรรพสามิต)
  const categoryCode = autoCode ? (form.categoryCode || "") : (categoryOf(form.fgCode) || "");

  // ── เช็คสินค้าซ้ำของลูกค้ารายนี้ (มติผู้ใช้ 2026-08-12) ────────────────────
  // โหลด FG ของลูกค้าที่เลือกครั้งเดียวต่อ 1 ลูกค้า แล้วเทียบชื่อ/ขนาดในเครื่องระหว่าง
  // พิมพ์ — ลิสต์ต่อลูกค้าสั้น (หลักสิบ) และคนกรอกแก้ชื่อ/ขนาดหลายรอบกว่าจะลงตัว
  // ยิงทุกครั้งที่พิมพ์คือยิงเปล่า
  const [customerProducts, setCustomerProducts] = useState([]);
  useEffect(() => {
    if (!form.customerId) { setCustomerProducts([]); return undefined; }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/master/products/by-customer?customerId=${encodeURIComponent(form.customerId)}`, { signal: controller.signal });
        setCustomerProducts(res.ok ? await res.json() : []);
      } catch {
        // โหลดไม่ได้ = ไม่เตือน (ไม่ใช่เตือนผิด) — รหัส FG ยังกันซ้ำที่ระดับ DB อยู่
        setCustomerProducts([]);
      }
    })();
    return () => controller.abort();
  }, [form.customerId]);

  const { sameSize, otherSize } = splitProductMatches(customerProducts, form, { excludeId: selfId });
  const duplicateWarning = productDuplicateWarning(sameSize);
  const otherSizeHint = productOtherSizeHint(otherSize);
  const selectedCustomer = customers.find((c) => c.id === form.customerId) || null;

  // ราคาขายปลีกโผล่เฉพาะกลุ่มหลัก 01 · **แต่ถ้าสินค้าตัวนี้มีราคาค้างอยู่ ต้องโชว์เสมอ**
  // ไม่ว่าหมวดไหน — ซ่อนช่องที่ยังมีค่า = ค่าติดอยู่ในฐานข้อมูลโดยไม่มีทางเห็นหรือลบ
  // (ราคาขายปลีกเป็นฐานคิดภาษีสรรพสามิต ค่าค้างที่มองไม่เห็นจึงอันตรายกว่าช่องเกินมา)
  // หน่วยขายที่กรอกอยู่ — ใช้พูดในคำอธิบายช่องอื่นให้เป็นภาษาของสินค้าตัวนี้จริง ๆ
  // ("ขนาดของ 1 ขวด" ชัดกว่า "ขนาดของ 1 หน่วยขาย")
  const saleUnitLabel = form.saleUnit || DEFAULT_SALE_UNIT;
  // กลุ่ม 03/04 ไม่มีของให้วัดขนาด ⇒ ไม่มีช่องปริมาตร/หน่วยบรรจุ/ต่อลังเลย (ดู units.js)
  // ⚠️ ต้องอ่านจาก categoryCode ตัวเดียวกับที่ฟอร์มใช้ตัดสินใจเรื่องอื่น ไม่ใช่ form.categoryCode
  // ดิบ ๆ (โหมดพิมพ์รหัสเองไม่ได้อัปเดตช่องนั้น — ดูคอมเมนต์ที่ประกาศ categoryCode)
  const showPackaging = hasPackagingFields(categoryCode);
  // กลุ่ม 03/04 ไม่ได้ขายใต้แบรนด์ของลูกค้า ⇒ ไม่มีช่องแบรนด์เลย (ดู brands.js)
  // อ่านจาก categoryCode ตัวเดียวกับช่องอื่น ไม่ใช่ form.categoryCode ดิบ ๆ
  const showBrand = hasBrandField(categoryCode);
  const packaging = showPackaging ? packagingSummary(form) : "";

  const inRetailCategory = showsRetailPriceForCategory(categoryCode, productTypes);
  const hasRetailValue = form.retailPriceIncVat !== "" && form.retailPriceIncVat != null;
  const showRetail = inRetailCategory || hasRetailValue;

  // สูตรที่เก็บเข้ากรุแล้วไม่ให้เลือกใหม่ แต่ตัวที่สินค้านี้ผูกอยู่ต้องคงอยู่ในลิสต์
  // เสมอ ไม่งั้นแค่เปิดฟอร์มแก้ชื่อสินค้าแล้วกดบันทึก สูตรจะหลุดเงียบ ๆ
  // ⭐ 1 สูตร : 1 FG (mig 0231) — สูตรที่ FG อื่นถือแล้ว (`usedByProduct` จาก
  // loadFormulas) ตัดออกจากลิสต์ · ของตัวเองไม่นับ (productId) · server มีด่านซ้ำ
  // อีกชั้นใน productFormulaSnapshot — ลิสต์นี้แค่กันเจอ error ตั้งแต่ปลายนิ้ว
  const pickedFormula = formulas.find((f) => f.id === form.formulaId) || null;
  const formulaOptions = formulas
    .filter((f) => f.status !== "archived" || f.id === form.formulaId)
    .filter((f) => !f.usedByProduct || f.usedByProduct.id === selfId || f.id === form.formulaId)
    .map((f) => ({
      value: f.id,
      label: `${f.code ? `${f.code} · ` : ""}${f.name}`
        + (f.customerName ? ` · ${f.customerName}` : "")
        + (f.status === "archived" ? " (เก็บเข้ากรุแล้ว)" : ""),
    }));

  return (
    <>
      {/* ── รหัสสินค้า + สวิตช์โหมด — อยู่เหนือทุก section (มติผู้ใช้ 2026-08-12 แบบ A)
          โหมดระบบใหม่: รหัสไม่ใช่ช่องกรอก แต่เป็น **ผลของสามคำตอบด้านล่าง** จึงโชว์
          เป็นแถบที่โตขึ้นทีละท่อนตามที่ตอบ — ท่อนไหนยังว่างคือยังไม่ได้ตอบข้อนั้น ── */}
      <div className="mb-[22px]">
        <div className="form-group">
          <label className="flex items-center gap-2 flex-wrap">
            <span>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></span>
            {onCodeMode && (
              <button
                type="button"
                className="ui-switch ml-auto"
                data-on={mode === CODE_MODE_AUTO ? "1" : undefined}
                aria-pressed={mode === CODE_MODE_AUTO}
                onClick={() => onCodeMode(mode === CODE_MODE_AUTO ? CODE_MODE_MANUAL : CODE_MODE_AUTO)}
              >
                <i aria-hidden="true" />ระบบใหม่ — ออกรหัสให้เอง
              </button>
            )}
          </label>
          {autoCode ? (
            <>
              <CodeStrip
                parts={fgCodeParts({
                  arCode: selectedCustomer?.arCode,
                  categoryCode,
                  runNo: nextFgRunNo,
                })}
                ariaLabel="รหัสสินค้าที่ระบบจะออกให้"
              />
              {/* คำกำกับใต้แถบต้องเปลี่ยนตามหมวดด้วย — หมวด 03/04 ไม่มีเลขรัน
                  ถ้ายังเขียนว่า "เลขรันจองตอนกดบันทึก" คนกรอกจะรอท่อนที่ไม่มีวันมา
                  และไม่รู้ว่าคู่ลูกค้า+หมวดรองนี้สร้างซ้ำไม่ได้จนกว่าจะโดนตีกลับ */}
              <span className="text-xs text-[var(--text-3)] mt-1">
                {selectedCustomer && selectedCustomer.arCode && !customerCodeSegment(selectedCustomer.arCode)
                  ? `ลูกค้ารายนี้มีรหัส ${selectedCustomer.arCode} ซึ่งไม่ใช่รูปแบบ AR ที่ระบบรู้จัก — ปิดสวิตช์แล้วกรอกรหัสสินค้าเอง`
                  : categoryCode && !fgCodeHasRunNo(categoryCode)
                    ? "หมวดนี้ออกรหัสโดยไม่มีเลขรัน — ลูกค้าหนึ่งรายมีได้หนึ่งรายการต่อหมวดรอง"
                    : "เลือกลูกค้าและหมวดด้านล่างให้ครบ แล้วรหัสจะประกอบเอง · เลขรันจองตอนกดบันทึก"}
              </span>
            </>
          ) : (
            <>
              <input
                type="text"
                name="fgCode"
                value={form.fgCode}
                onChange={(e) => {
                  // โหมดกรอกเอง: หมวดอ่านย้อนจากรหัสที่พิมพ์ — เก็บลงช่องเดียวกับที่
                  // ตัวเลือกหมวดเขียน (form.categoryCode) เพื่อไม่ให้มีสองแหล่งความจริง
                  const fgCode = e.target.value;
                  onForm({ fgCode, categoryCode: categoryOf(fgCode) || "" });
                }}
                required
                readOnly={fgLocked}
                placeholder={FG_MANUAL_HINT}
                className="premium-input w-full font-mono text-base"
                style={fgLocked ? { color: "var(--text-3)", background: "var(--panel-2)", cursor: "not-allowed" } : undefined}
              />
              {fgLocked ? (
                <span className="text-xs text-[var(--text-3)] mt-1">
                  รหัสนี้ออกโดยระบบ (เลขรันอัตโนมัติ) จึงแก้ไม่ได้ — ต้องการรหัสอื่นต้องสร้างรายการใหม่
                </span>
              ) : (
                <span className="text-xs text-[var(--text-3)] mt-1">
                  กรอกเอง {FG_MANUAL_HINT} — ระบบอ่านหมวด BB-CCC จากรหัสให้เอง
                </span>
              )}
              <CategoryBox fgCode={form.fgCode} productTypes={productTypes} />
            </>
          )}
        </div>
      </div>

      {/* Section 1: product */}
      <div className="mb-[22px]">
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลหลักสินค้า (Product Details)</h3>
          {creatorName && (
            <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
              ผู้สร้าง: {creatorName}
            </span>
          )}
        </div>
        <div className="form-grid cols-2">
          {/* ⭐ ลูกค้าขึ้นก่อนทุกช่อง — เป็นตัวกำหนดทั้ง **ท่อน AAAA ของรหัส** และชุด
              แบรนด์ที่เลือกได้ (กฎ "ตัวกำหนดบริบทอยู่บนสุด") · ของเดิมอยู่ใต้รหัสที่
              ต้องพิมพ์เอง ทั้งที่รหัสนั้นมีรหัสลูกค้าฝังอยู่ข้างใน
              ⭐ **ลูกค้า | แบรนด์ อยู่แถวเดียวกัน** (มติผู้ใช้ 2026-08-12) — เป็นคู่ที่
              อ่านคู่กันและขึ้นต่อกัน (แบรนด์มาจากลูกค้าที่เลือก ก่อนเลือกลูกค้าช่องขวา
              กดไม่ได้) · เอกสารวิธีคิดออกแบบฟอร์ม §1 ยกคู่นี้เป็นตัวอย่างไว้ตรง ๆ */}
          <div className={showBrand ? "form-group" : "form-group col-span-2"}>
            <label>{CUSTOMER_NAME_LABEL} (เจ้าของสินค้า) <span className="text-[var(--red)]">*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={onCustomerChange}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              emptyText="ไม่พบลูกค้า"
              options={customerSelectOptions(customers)}
            />
            <span className="text-xs text-[var(--text-3)] mt-1">
              {creatorName
                ? (showBrand
                  ? "FG ทุกตัวต้องผูกกับลูกค้า — แบรนด์จะมาจากลูกค้าที่เลือก"
                  : "FG ทุกตัวต้องผูกกับลูกค้า — หมวดนี้เป็นค่าบริการ จึงไม่มีแบรนด์")
                : "เปลี่ยนเจ้าของแล้ว สินค้าจะกลับเป็น “รออนุมัติ” ให้ตรวจซ้ำ"}
            </span>
          </div>
          {/* แบรนด์: กลุ่ม 03 ค่าออกแบบ / 04 รายได้อื่นๆ ไม่มีช่องนี้ (มติ 2026-08-21 ·
              ดู brands.js) — ช่องหายพร้อมกับค่าที่ server ล้างให้ ไม่ใช่ซ่อนทับค่าเดิม */}
          {showBrand && (
          <div className="form-group">
            <label>ชื่อแบรนด์ <span className="text-[var(--red)]">*</span></label>
            <SearchableSelect
              entity="brand"
              disabled={!form.customerId}
              options={brandOptions.map((b) => ({ value: b.th || b.en, label: brandBoth(b.th, b.en), search: `${b.th} ${b.en}` }))}
              value={form.brandName || form.brandNameEn || ""}
              onChange={(v) => {
                const hit = brandOptions.find((b) => (b.th || b.en) === v || b.en === v);
                onForm({ brandName: hit ? hit.th || "" : v, brandNameEn: hit ? hit.en || "" : "" });
              }}
              placeholder={form.customerId ? "เลือกแบรนด์ของลูกค้า..." : "เลือกลูกค้าก่อน"}
              emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ — เพิ่มที่หน้าข้อมูลลูกค้า"
            />
            <span className="text-xs text-[var(--text-3)] mt-1">แบรนด์มาจากข้อมูลลูกค้า (โชว์ EN · TH) — เพิ่ม/แก้ชื่อได้ที่หน้าลูกค้า</span>
          </div>
          )}
          {/* หมวดสินค้า: ตัวเลือกหมวดกลางตัวเดียวกับฟอร์มดีล/โครงการ (TwoPanePicker
              105 หมวด/4 กลุ่ม) — โผล่เฉพาะโหมดระบบใหม่ เพราะโหมดกรอกเองหมวดฝังอยู่ใน
              รหัสที่พิมพ์แล้ว การมีตัวเลือกซ้ำอีกช่องคือการพูดเรื่องเดียวกันสองทาง */}
          {autoCode && (
            <div className="form-group col-span-2">
              {/* ป้ายมากับตัวคอนโทรลเอง — ผู้เรียกใส่ป้ายซ้อนอีกชั้นเมื่อไร จะได้
                  "หมวดสินค้า *" สองบรรทัดติดกัน (เจอตอนพรีวิวรอบแรก) */}
              <ProductCategorySelect
                categories={productTypes}
                value={categoryCode}
                onChange={(code) => onForm({ categoryCode: code || "" })}
                required
              />
              <CategoryBox categoryCode={categoryCode} productTypes={productTypes} />
            </div>
          )}
          {/* ชื่อ TH/EN อยู่แถวเดียวกัน — เดิมกินคนละแถวเต็มทั้งที่ช่องสั้น และเงื่อนไข
              "อย่างน้อย 1 ภาษา" ไปแปะใต้ช่อง EN ช่องเดียว คนที่กรอก TH แล้วข้ามจึงไม่เห็น
              ตอนนี้ดาวอยู่ที่ป้ายทั้งสองช่อง + คำอธิบายกินเต็มแถวใต้ทั้งคู่ */}
          <div className="form-group">
            <label>ชื่อสินค้า / รายละเอียด (ไทย) <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="productDescription" value={form.productDescription} onChange={set("productDescription")} placeholder="เช่น มิดไนท์บลูม" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>ชื่อสินค้า / รายละเอียด (อังกฤษ) <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="productDescriptionEn" value={form.productDescriptionEn} onChange={set("productDescriptionEn")} placeholder="e.g. Midnight Bloom" className="premium-input w-full" />
          </div>
          <div className="form-group col-span-2">
            <span className="text-xs text-[var(--text-3)]">กรอกอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ) — ไม่ต้องครบทั้งสอง</span>
            {/* ด่านซ้ำของสินค้า = ลูกค้า + ชื่อ + ขนาดบรรจุ (ขนาดอยู่ section 2 แต่คำเตือน
                อยู่ตรงนี้ เพราะ "ชื่อ" คือช่องที่คนกำลังตัดสินใจว่าจะตั้งซ้ำหรือไม่)
                · ตรงทั้งชื่อและขนาด = เตือน (บันทึกต่อได้ตามมติ — มีเคสที่ตั้งใจซ้ำจริง)
                · ชื่อเดียวกันคนละขนาด = เรื่องปกติของตระกูลสินค้า บอกเฉย ๆ ไม่ใช่เตือน */}
            {duplicateWarning && (
              <span className="text-xs text-[var(--amber)] mt-1">{duplicateWarning}</span>
            )}
            {!duplicateWarning && otherSizeHint && (
              <span className="text-xs text-[var(--text-3)] mt-1">{otherSizeHint}</span>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: สูตร + บรรจุภัณฑ์ + ราคาผลิต (มติผู้ใช้ 2026-08-05 — เดิมสูตรเป็น
          section ของตัวเองที่มีช่องเดียว) · ราคาผลิตอยู่ที่นี่เพราะเป็นต้นทุนของสิ่งที่
          บรรจุจริง คนละเรื่องกับราคาขายปลีกที่แยกไปข้างล่าง */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">2. สูตรและบรรจุภัณฑ์ (Formula &amp; Packaging)</h3>
        </div>
        <div className="form-grid cols-2">
          {/* ⭐ เลือกจากทะเบียนสูตร ไม่ใช่พิมพ์เอง (PR-5) — เดิมเป็นสามช่องข้อความ
              (ชื่อ/รหัส/วันที่) ซึ่งเป็นสาเหตุที่บน prod มี **สินค้า 10 แถวที่เอา
              ชื่อกลิ่นไปกรอกช่องชื่อสูตร** เพราะตอนนั้นระบบยังไม่มีที่เก็บกลิ่น
              · ชื่อ/รหัส/วันที่ตอนนี้ derive จากทะเบียน server เติมให้เอง */}
          <div className="form-group col-span-2">
            <label>สูตร</label>
            <SearchableSelect
              value={form.formulaId ?? ""}
              onChange={(v) => onForm({ formulaId: v })}
              placeholder="— เลือกสูตรจากทะเบียน —"
              options={formulaOptions}
            />
            <span className="text-xs text-[var(--text-3)] mt-1">
              {!formulas.length
                ? "ยังไม่มีสูตรในทะเบียน — เพิ่มที่ ฐานข้อมูล → ทะเบียนสูตร ก่อน"
                : pickedFormula
                  ? `กลิ่น: ${pickedFormula.scentName || "— สูตรยังไม่ผูกกลิ่น —"} · วันที่สูตร ${pickedFormula.formulaDate || "— ยังไม่ระบุ —"} · ดึงจากทะเบียนอัตโนมัติ`
                  : "1 สูตรผูกได้ 1 FG — สูตรที่มีสินค้าอื่นถือแล้วไม่แสดงในลิสต์ · กลิ่นของสินค้าจะตามสูตรที่เลือก"}
            </span>
          </div>
          {/* สินค้าเก่าที่ยังไม่ผูกทะเบียน (prod เหลือ 1 แถว) — โชว์ค่าเดิมไว้ให้เห็น
              ว่ามีอะไรค้างอยู่ ไม่ใช่ทำหายไปเฉย ๆ แต่แก้ไม่ได้แล้ว ต้องผูกทะเบียนแทน */}
          {!form.formulaId && (form.formulaName || form.formulaCode) && (
            <div className="form-group col-span-2">
              <label>ข้อมูลสูตรเดิม (ยังไม่ผูกทะเบียน)</label>
              <div className="text-sm text-[var(--text-2)]">
                {naText(form.formulaName)}
                {form.formulaCode ? ` · ${form.formulaCode}` : ""}
                {form.formulaDate ? ` · ${form.formulaDate}` : ""}
              </div>
              <span className="text-xs text-[var(--text-3)] mt-1">
                เลือกสูตรจากทะเบียนด้านบนเพื่อแทนที่ข้อความเดิม
              </span>
            </div>
          )}
          {/* ⚠️ "หน่วยขาย" กับ "หน่วยปริมาตร" สลับกันได้ง่ายเพราะชื่อคล้ายกัน — ตัวแรกคือ
              หน่วยที่นับขายบนเอกสาร (ไปเป็น quotation_lines.unit) ตัวหลังคือขนาดของหนึ่ง
              หน่วยขาย · ลำดับช่องในบล็อกนี้ผู้ใช้เป็นคนกำหนด (มติ 2026-08-05):
              ปริมาตร | จำนวนต่อลัง · ราคาผลิต | หน่วยขาย
              ประโยคสรุปปิดท้ายประกอบจากค่าที่กรอกจริง กรอกสลับช่องเมื่อไหร่จะอ่านแล้ว
              ผิดทันที ('1 ml = 50 ขวด') */}
          {showPackaging && (
          <div className="form-group">
            <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
            <input type="number" name="volume" value={form.volume} onChange={set("volume")} required min="0.01" step="0.01" className="premium-input w-full font-mono" />
            {/* ⚠️ ทั้งสองช่องเป็น **ดรอปดาวน์** ตามกติกาคอนโทรล v2 (docs/form-design-rules.md):
                ChoiceChips ใช้กับชุด ≤6 เท่านั้น · รอบเพิ่มหน่วย 2026-08-20 รอบสอง ทำให้
                หน่วยบรรจุเป็น 8 ตัว และหน่วยขายเป็น 7 ตัว = เกินเกณฑ์ทั้งคู่
                (เคยเป็นชิปอยู่ช่วงที่ลิสต์สั้นกว่านี้ — ถ้าวันหลังตัดลงเหลือ ≤6 ค่อยกลับไปกางใหม่) */}
            <div className="mt-1.5">
              <Select
                name="volumeUnit"
                value={form.volumeUnit || DEFAULT_VOLUME_UNIT}
                onChange={set("volumeUnit")}
                aria-label="หน่วยปริมาตร/น้ำหนักบรรจุ"
                fullWidth
              >
                {unitOptions(VOLUME_UNITS, form.volumeUnit).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
            <span className="text-xs text-[var(--text-3)] mt-1"><strong>ขนาดของ 1 {saleUnitLabel}</strong> — ไม่ใช่หน่วยที่ใช้นับขาย</span>
          </div>
          )}
          {showPackaging && (
          <div className="form-group">
            <label>จำนวนต่อลัง</label>
            <input type="number" name="piecesPerCase" value={form.piecesPerCase ?? ""} onChange={set("piecesPerCase")} min="1" step="1" placeholder="เช่น 12" className="premium-input w-full font-mono" />
            <span className="text-xs text-[var(--text-3)] mt-1">1 ลังมีกี่{saleUnitLabel} (เว้นว่างได้ถ้าไม่ได้ขายยกลัง)</span>
          </div>
          )}
          <div className="form-group">
            <label>ราคาผลิต (บาท)</label>
            {factoryPrice === "readonly" ? (
              <>
                <input
                  type="text"
                  value={money(currentCostPrice)}
                  readOnly
                  className="premium-input w-full font-mono tabular-nums"
                  style={{ color: "var(--text-3)", background: "var(--panel-2)", cursor: "not-allowed" }}
                />
              </>
            ) : (
              <MoneyInput name="costPrice" value={form.costPrice} onChange={(v) => onForm({ costPrice: v ?? "" })} className="w-full" />
            )}
          </div>
          <div className="form-group">
            <label>หน่วยขาย <span className="text-[var(--red)]">*</span></label>
            <Select
              name="saleUnit"
              value={form.saleUnit || DEFAULT_SALE_UNIT}
              onChange={set("saleUnit")}
              aria-label="หน่วยขาย"
              fullWidth
            >
              {unitOptions(SALE_UNITS, form.saleUnit).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <span className="text-xs text-[var(--text-3)] mt-1">หน่วยที่ <strong>นับขาย</strong> บนใบเสนอราคา/ใบสั่งขาย — ลูกค้าสั่ง 10 หมายถึง 10 หน่วยนี้</span>
          </div>
          {packaging && (
            <div className="form-group col-span-2">
              {/* ⚠️ ท่อนคำใบ้ต้องขึ้นต้นด้วย "ถ้า" และอยู่คนละบรรทัดกับประโยคสรุป
                  เดิมเขียนว่า "— อ่านแล้วไม่ตรงความจริง แปลว่ากรอกสลับช่อง" ต่อท้ายบรรทัดเดียวกัน
                  ซึ่งเป็น **ประโยคบอกเล่า** และขึ้นทุกครั้งไม่ว่ากรอกถูกหรือผิด ⇒ คนอ่านเข้าใจว่า
                  ระบบกำลังบอกว่าตัวเองกรอกสลับช่องแล้ว ทั้งที่มันแค่แขวนคำใบ้ไว้เฉย ๆ
                  (ผู้ใช้ส่งภาพมาถามว่าป้ายนี้จะสื่ออะไร 2026-08-20) */}
              <div className="text-xs rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text-2)]">
                <div>สรุปบรรจุภัณฑ์: <strong className="text-[var(--text)]">{packaging}</strong></div>
                <div className="text-[var(--text-3)] mt-1">ถ้าประโยคนี้อ่านแล้วไม่ตรงกับของจริง แปลว่ากรอกสลับช่อง</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: ราคาขายปลีก — เฉพาะกลุ่มหลัก 01 (มติผู้ใช้ 2026-08-05)
          แยกจากราคาผลิตเพราะเป็นราคาคนละฝั่ง: ผลิต = ต้นทุนเรา · ขายปลีก = ราคาหน้าร้าน
          ของลูกค้า ซึ่งเป็นฐานคิดภาษีสรรพสามิต */}
      {showRetail && (
        <div className="mb-[22px]">
          <div className="border-b border-[var(--border)] pb-3 mb-5">
            <h3 className="font-semibold text-[var(--text)]">3. ราคาขายปลีก (Retail Price)</h3>
            {!inRetailCategory && (
              <span className="text-[11px] text-[var(--amber)]">
                หมวดนี้ไม่ได้ใช้ราคาขายปลีก (ไม่ใช่กลุ่ม {RETAIL_PRICE_MAIN_CATEGORY} และไม่ได้ติ๊กสรรพสามิต) แต่สินค้าตัวนี้มีราคาค้างอยู่ — โชว์ไว้ให้เห็นและลบได้ ไม่ใช่ซ่อนทั้งที่ยังมีค่า
              </span>
            )}
          </div>
          <div className="form-grid cols-2">
            <div className="form-group">
              <label>ราคาขายปลีก <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">รวม VAT</span></label>
              <MoneyInput name="retailPriceIncVat" value={form.retailPriceIncVat ?? ""} onChange={(v) => onForm({ retailPriceIncVat: v ?? "" })} className="w-full" />
              <span className="text-xs text-[var(--text-3)] mt-1">ราคาที่ลูกค้าตั้งขายหน้าร้าน — ระบบใช้เป็นฐานคิดภาษีสรรพสามิต</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

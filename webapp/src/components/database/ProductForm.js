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
import ChoiceChips from "@/components/ui/ChoiceChips";
import CodeStrip from "@/components/ui/CodeStrip";
import MoneyInput from "@/components/ui/MoneyInput";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  RETAIL_PRICE_MAIN_CATEGORY, categoryInfoOf, categoryOf, showsRetailPriceForCategory,
} from "@/lib/master/categoryOf";
import {
  CODE_MODE_AUTO, CODE_MODE_MANUAL, FG_MANUAL_HINT, codeModeOf, customerCodeSegment, fgCodeParts,
} from "@/lib/master/masterCodes";
import {
  productDuplicateWarning, productOtherSizeHint, splitProductMatches,
} from "@/lib/master/productDuplicate";
import { brandBoth } from "@/lib/master/brands";
import {
  DEFAULT_SALE_UNIT,
  DEFAULT_VOLUME_UNIT,
  SALE_UNITS,
  VOLUME_UNITS,
  packagingSummary,
  unitOptions,
} from "@/lib/master/units";
import { fmtMoney } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

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
        <span className="font-semibold">{cat.typeInfo.nameTh || cat.typeInfo.nameEn}</span>
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
  const packaging = packagingSummary(form);

  const inRetailCategory = showsRetailPriceForCategory(categoryCode, productTypes);
  const hasRetailValue = form.retailPriceIncVat !== "" && form.retailPriceIncVat != null;
  const showRetail = inRetailCategory || hasRetailValue;

  // สูตรที่เก็บเข้ากรุแล้วไม่ให้เลือกใหม่ แต่ตัวที่สินค้านี้ผูกอยู่ต้องคงอยู่ในลิสต์
  // เสมอ ไม่งั้นแค่เปิดฟอร์มแก้ชื่อสินค้าแล้วกดบันทึก สูตรจะหลุดเงียบ ๆ
  const pickedFormula = formulas.find((f) => f.id === form.formulaId) || null;
  const formulaOptions = formulas
    .filter((f) => f.status !== "archived" || f.id === form.formulaId)
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
              <span className="text-xs text-[var(--text-3)] mt-1">
                {selectedCustomer && selectedCustomer.arCode && !customerCodeSegment(selectedCustomer.arCode)
                  ? `ลูกค้ารายนี้มีรหัส ${selectedCustomer.arCode} ซึ่งไม่ใช่รูปแบบ AR ที่ระบบรู้จัก — ปิดสวิตช์แล้วกรอกรหัสสินค้าเอง`
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
          <div className="form-group">
            <label>{CUSTOMER_NAME_LABEL} (เจ้าของสินค้า) <span className="text-[var(--red)]">*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={onCustomerChange}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              emptyText="ไม่พบลูกค้า"
              options={customers.map((c) => ({
                value: c.id,
                label: c.arCode ? `${c.arCode} — ${c.name}` : c.name,
                search: `${c.arCode || ""} ${c.name}`,
              }))}
            />
            <span className="text-xs text-[var(--text-3)] mt-1">
              {creatorName
                ? "FG ทุกตัวต้องผูกกับลูกค้า — แบรนด์จะมาจากลูกค้าที่เลือก"
                : "เปลี่ยนเจ้าของแล้ว สินค้าจะกลับเป็น “รออนุมัติ” ให้ตรวจซ้ำ"}
            </span>
          </div>
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
                  ? `วันที่สูตร ${pickedFormula.formulaDate || "— ยังไม่ระบุ —"} · ชื่อ/รหัส/วันที่ ดึงจากทะเบียนอัตโนมัติ`
                  : "ชื่อ · รหัส · วันที่สูตร มาจากทะเบียนสูตรอัตโนมัติ — แก้ตัวสูตรที่ ฐานข้อมูล → ทะเบียนสูตร"}
            </span>
          </div>
          {/* สินค้าเก่าที่ยังไม่ผูกทะเบียน (prod เหลือ 1 แถว) — โชว์ค่าเดิมไว้ให้เห็น
              ว่ามีอะไรค้างอยู่ ไม่ใช่ทำหายไปเฉย ๆ แต่แก้ไม่ได้แล้ว ต้องผูกทะเบียนแทน */}
          {!form.formulaId && (form.formulaName || form.formulaCode) && (
            <div className="form-group col-span-2">
              <label>ข้อมูลสูตรเดิม (ยังไม่ผูกทะเบียน)</label>
              <div className="text-sm text-[var(--text-2)]">
                {form.formulaName || "—"}
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
          <div className="form-group">
            <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
            <input type="number" name="volume" value={form.volume} onChange={set("volume")} required min="0.01" step="0.01" className="premium-input w-full font-mono" />
            {/* หน่วยปริมาตรมี 6 ตัว = กางให้เห็นตามกติกาคอนโทรล (≤6 ไม่ต้องซ่อนในดรอปดาวน์)
                ⚠️ หน่วยขายด้านล่างยังเป็นดรอปดาวน์เพราะมี 8 ตัว — เกินเกณฑ์ */}
            <div className="mt-1.5">
              <ChoiceChips
                value={form.volumeUnit || DEFAULT_VOLUME_UNIT}
                onChange={(v) => onForm({ volumeUnit: v })}
                options={unitOptions(VOLUME_UNITS, form.volumeUnit)}
                ariaLabel="หน่วยปริมาตร/น้ำหนักบรรจุ"
              />
            </div>
            <span className="text-xs text-[var(--text-3)] mt-1"><strong>ขนาดของ 1 {saleUnitLabel}</strong> — ไม่ใช่หน่วยที่ใช้นับขาย</span>
          </div>
          <div className="form-group">
            <label>จำนวนต่อลัง</label>
            <input type="number" name="piecesPerCase" value={form.piecesPerCase ?? ""} onChange={set("piecesPerCase")} min="1" step="1" placeholder="เช่น 12" className="premium-input w-full font-mono" />
            <span className="text-xs text-[var(--text-3)] mt-1">1 ลังมีกี่{saleUnitLabel} (เว้นว่างได้ถ้าไม่ได้ขายยกลัง)</span>
          </div>
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
            <Select name="saleUnit" value={form.saleUnit || DEFAULT_SALE_UNIT} onChange={set("saleUnit")} className="premium-input w-full">
              {unitOptions(SALE_UNITS, form.saleUnit).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <span className="text-xs text-[var(--text-3)] mt-1">หน่วยที่ <strong>นับขาย</strong> บนใบเสนอราคา/ใบสั่งขาย — ลูกค้าสั่ง 10 หมายถึง 10 หน่วยนี้</span>
          </div>
          {packaging && (
            <div className="form-group col-span-2">
              <div className="text-xs rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text-2)]">
                สรุปบรรจุภัณฑ์: <strong className="text-[var(--text)]">{packaging}</strong>
                <span className="text-[var(--text-3)]"> — อ่านแล้วไม่ตรงความจริง แปลว่ากรอกสลับช่อง</span>
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

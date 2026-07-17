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
//                    ต้องกดปุ่มอัปเดตราคาโรงงานแยก เพราะกระทบประวัติราคา/ต้นทุน)
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import AddBrandButton from "@/components/master/AddBrandButton";
import { categoryInfo } from "@/lib/master/categoryOf";
import { brandBoth } from "@/lib/master/brands";
import { fmtMoney } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

export const EMPTY_PRODUCT = {
  customerId: "", fgCode: "", productDescription: "", productDescriptionEn: "",
  brandName: "", brandNameEn: "",
  formulaName: "", formulaCode: "", formulaDate: "",
  volume: "", volumeUnit: "ml", piecesPerCase: "", costPrice: "", retailPriceIncVat: "",
};

// ช่องที่โมดัลแก้ดึงจากสินค้าเดิม (costPrice ไม่อยู่ในนี้ — อัปเดตผ่าน action แยก)
export const PRODUCT_EDIT_FIELDS = [
  "customerId", "fgCode", "productDescription", "productDescriptionEn",
  "brandName", "brandNameEn", "formulaName", "formulaCode", "formulaDate",
  "volume", "volumeUnit", "piecesPerCase", "retailPriceIncVat",
];

export const productToForm = (p) => {
  const seed = { ...EMPTY_PRODUCT };
  for (const k of PRODUCT_EDIT_FIELDS) seed[k] = p[k] ?? "";
  return seed;
};

// กล่องบอกหมวดหมู่/ภาษีสรรพสามิตใต้ช่อง FG Code
function CategoryBox({ fgCode, productTypes }) {
  const cat = categoryInfo(fgCode, productTypes);
  if (!fgCode) {
    return <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย) เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>;
  }
  if (!cat.code) {
    return <div className="mt-2 text-xs text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
  }
  if (!cat.found) {
    if (!productTypes.length) return null; // ยังโหลดไม่เสร็จ — อย่าเพิ่งฟ้องว่าไม่มีหมวด
    return <div className="mt-2 text-xs text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">พบหมวดหมู่ <strong>{cat.code}</strong> แต่ไม่มีในฐานข้อมูล (อาจพิมพ์ผิด หรือเป็นหมวดใหม่)</div>;
  }
  const isExcise = cat.code === "01-002";
  return (
    <div className={`mt-2 p-3 text-xs rounded-lg border border-[var(--border)] flex flex-col gap-1 ${isExcise ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--text-2)]"}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono bg-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold">{cat.code}</span>
        <span className="font-semibold">{cat.typeInfo.nameTh || cat.typeInfo.nameEn}</span>
      </div>
      <div className="text-[11px] opacity-80 pl-1">กลุ่มหลัก: {cat.typeInfo.mainCategoryName}</div>
      <div className={`mt-1 pl-1 font-semibold ${isExcise ? "" : "text-[var(--green)]"}`}>
        {isExcise ? "⚠️ สินค้านี้เข้าข่ายต้องเสียภาษีสรรพสามิต (ระบบจะคิดภาษีอัตโนมัติ)" : "✓ สินค้านี้ได้รับการยกเว้นภาษีสรรพสามิต"}
      </div>
    </div>
  );
}

export default function ProductForm({
  form,
  onForm,                    // (patch) => void
  productTypes = [],
  customers = [],
  brandOptions = [],         // [{th,en}] ของลูกค้าที่เลือก
  onBrandAdded,              // (brand, updatedCustomer) => void — caller อัปเดตลิสต์ลูกค้าเอง
  onCustomerChange,          // (customerId) => void — caller ล้างแบรนด์/โหลดใหม่
  creatorName = null,        // ป้าย "ผู้สร้าง" (เฉพาะตอนสร้าง)
  factoryPrice = "input",    // "input" | "readonly"
  currentCostPrice = null,   // โชว์ตอน readonly
}) {
  const set = (k) => (e) => onForm({ [k]: e?.target ? e.target.value : e });
  const money = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "-" : fmtMoney(v));

  return (
    <>
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
          <div className="form-group col-span-2">
            <label>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="fgCode" value={form.fgCode} onChange={set("fgCode")} required placeholder="FG-AAA-BB-CCC-DDDD" className="premium-input w-full font-mono text-base" />
            <CategoryBox fgCode={form.fgCode} productTypes={productTypes} />
          </div>
          <div className="form-group col-span-2">
            <label>ชื่อสินค้า / รายละเอียด (ไทย)</label>
            <input type="text" name="productDescription" value={form.productDescription} onChange={set("productDescription")} placeholder="เช่น มิดไนท์บลูม 50ml" className="premium-input w-full" />
          </div>
          <div className="form-group col-span-2">
            <label>ชื่อสินค้า / รายละเอียด (อังกฤษ)</label>
            <input type="text" name="productDescriptionEn" value={form.productDescriptionEn} onChange={set("productDescriptionEn")} placeholder="e.g. Midnight Bloom 50ml" className="premium-input w-full" />
            <span className="text-xs text-[var(--text-3)] mt-1">กรอกอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ) <span className="text-[var(--red)]">*</span></span>
          </div>
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
            <div className="flex gap-1.5 items-center">
              <div className="flex-1 min-w-0">
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
                  emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ — กด + เพื่อเพิ่ม"
                />
              </div>
              <AddBrandButton
                customerId={form.customerId}
                disabled={!form.customerId}
                onAdded={(b, updatedCustomer) => {
                  onBrandAdded?.(b, updatedCustomer);
                  onForm({ brandName: b.th, brandNameEn: b.en });
                }}
              />
            </div>
            <span className="text-xs text-[var(--text-3)] mt-1">แบรนด์มาจากข้อมูลลูกค้า (โชว์ EN · TH) — เพิ่มใหม่ด้วยปุ่ม +, แก้ชื่อได้ที่หน้าลูกค้า</span>
          </div>
        </div>
      </div>

      {/* Section 2: formula (ข้อมูลฝ่าย RD — ไม่บังคับ: FG ที่ไม่มีสูตรก็มี) */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">2. ข้อมูลสูตร (Formula)</h3>
        </div>
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <label>ชื่อสูตร</label>
            <input type="text" name="formulaName" value={form.formulaName ?? ""} onChange={set("formulaName")} placeholder="เช่น มิดไนท์บลูม v2" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>รหัสสูตร</label>
            <input type="text" name="formulaCode" value={form.formulaCode ?? ""} onChange={set("formulaCode")} placeholder="เช่น F-2569-014" className="premium-input w-full font-mono" />
          </div>
          <div className="form-group">
            <label>วันที่สูตร</label>
            <DateInput value={form.formulaDate ?? ""} onChange={(v) => onForm({ formulaDate: v || "" })} className="w-full" />
            <span className="text-xs text-[var(--text-3)] mt-1">วันที่ของตัวสูตร (เวอร์ชันที่ RD ออกให้) ไม่ใช่วันที่บันทึกเข้าระบบ</span>
          </div>
        </div>
      </div>

      {/* Section 3: packaging & pricing */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">3. ข้อมูลบรรจุภัณฑ์และราคา (Packaging & Pricing)</h3>
        </div>
        <div className="form-grid cols-2">
          <div className="form-group">
            <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
            <div className="flex gap-2">
              <input type="number" name="volume" value={form.volume} onChange={set("volume")} required min="0.01" step="0.01" className="premium-input flex-1 font-mono" />
              <Select name="volumeUnit" value={form.volumeUnit || "ml"} onChange={set("volumeUnit")} style={{ width: "80px" }}>
                <option value="ml">ml</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="oz">oz</option>
                <option value="L">L</option>
                <option value="pcs">pcs</option>
              </Select>
            </div>
          </div>
          <div className="form-group">
            <label>จำนวนชิ้นต่อลัง</label>
            <input type="number" name="piecesPerCase" value={form.piecesPerCase ?? ""} onChange={set("piecesPerCase")} min="1" step="1" placeholder="เช่น 12" className="premium-input w-full font-mono" />
          </div>
          <div className="form-group">
            <label>ราคาโรงงาน (บาท)</label>
            {factoryPrice === "readonly" ? (
              <>
                <input
                  type="text"
                  value={money(currentCostPrice)}
                  readOnly
                  className="premium-input w-full font-mono tabular-nums"
                  style={{ color: "var(--text-3)", background: "var(--panel-2)", cursor: "not-allowed" }}
                  aria-describedby="factory-price-readonly-help"
                />
                <span id="factory-price-readonly-help" className="text-xs text-[var(--text-3)] mt-1">
                  ช่องนี้ดูอย่างเดียว ต้องกด “อัปเดตราคาโรงงาน” ด้านล่างเพื่อแก้ราคา
                </span>
              </>
            ) : (
              <MoneyInput name="costPrice" value={form.costPrice} onChange={(v) => onForm({ costPrice: v ?? "" })} className="w-full" />
            )}
          </div>
          <div className="form-group">
            <label>ราคาขายปลีก <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">รวม VAT</span></label>
            <MoneyInput name="retailPriceIncVat" value={form.retailPriceIncVat ?? ""} onChange={(v) => onForm({ retailPriceIncVat: v ?? "" })} className="w-full" />
          </div>
        </div>
      </div>
    </>
  );
}

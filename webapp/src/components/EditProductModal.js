"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Factory } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { categoryInfo } from "@/lib/master/categoryOf";
import { brandTh, brandEn, brandBoth, normalizeBrands } from "@/lib/master/brands";
import { fmtMoney } from "@/lib/format";

// Edit a master product's catalog/spec fields, including its owning customer.
// (Excise APPROVAL still lives on the registration.) Layout/styling mirrors the
// "add product" form on /database/products so both forms feel like one system.
const FIELDS = [
  "customerId",
  "fgCode", "productDescription", "productDescriptionEn", "brandName", "brandNameEn",
  "volume", "volumeUnit", "piecesPerCase", "retailPriceIncVat",
];

export default function EditProductModal({ open, onClose, onSaved, product, brandOptions = [], customers = [] }) {
  const [form, setForm] = useState({});
  const [productTypes, setProductTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [factoryPriceDraft, setFactoryPriceDraft] = useState("");
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [priceSubmitting, setPriceSubmitting] = useState(false);
  const [priceError, setPriceError] = useState(null);
  const [priceSaved, setPriceSaved] = useState(false);

  useEffect(() => {
    if (open && product) {
      const seed = {};
      for (const k of FIELDS) seed[k] = product[k] ?? "";
      setForm(seed);
      setFactoryPriceDraft(product.costPrice ?? "");
      setPriceEditorOpen(false);
      setPriceConfirmed(false);
      setError(null);
      setPriceError(null);
      setPriceSaved(false);

      // Fetch product types if not already fetched
      if (productTypes.length === 0) {
        fetch("/api/master/product-types")
          .then(res => res.json())
          .then(data => setProductTypes(data))
          .catch(err => console.error("Failed to fetch product types", err));
      }
    }
  }, [open, product?.id]);

  const getCategoryInfo = (fgCode) => categoryInfo(fgCode, productTypes);

  if (!product) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Brand suggestions follow the selected customer's brands[] (fall back to the
  // parent-supplied list while customers aren't loaded). Changing the customer
  // clears the brand — the brand list is scoped per customer, same as the add form.
  const selCustomer = customers.find((c) => c.id === form.customerId);
  // แบรนด์ = ช่องเดียว โชว์ EN · TH; ไม่มี selCustomer ใช้ prop เดิม (string[]) แปลงเป็น {th,en}.
  const brandOptionList = selCustomer
    ? normalizeBrands(selCustomer.brands || [])
    : (brandOptions || []).map((b) => ({ th: b, en: "" }));

  const handleCustomerChange = (v) => setForm((f) => ({ ...f, customerId: v, brandName: "", brandNameEn: "" }));
  // เลือก/พิมพ์แบรนด์ → เก็บทั้ง TH+EN จากแบรนด์ของลูกค้า (match ด้วย th หรือ en);
  // พิมพ์ใหม่ → ถือเป็นชื่อไทย, EN ว่าง.
  const handleBrandChange = (v) => {
    const hit = (selCustomer?.brands || []).find((b) => brandTh(b) === v || brandEn(b) === v);
    setForm((f) => ({ ...f, brandName: hit ? brandTh(hit) : v, brandNameEn: hit ? brandEn(hit) : "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    // customerId/brandName ใช้ SearchableSelect (ไม่ใช่ native input) — ตรวจ required เองที่นี่
    if (!form.customerId) { setError("กรุณาเลือกลูกค้าเจ้าของสินค้า"); return; }
    if (!form.brandName?.trim() && !form.brandNameEn?.trim()) { setError("กรุณาระบุชื่อแบรนด์"); return; }
    // ชื่อสินค้าไม่บังคับภาษาไทย แต่ต้องมีอย่างน้อย 1 ภาษา
    if (!form.productDescription?.trim() && !form.productDescriptionEn?.trim()) {
      setError("กรุณากรอกชื่อสินค้าอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ)"); return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      ...form,
      volume: form.volume === "" ? null : parseFloat(form.volume),
      retailPriceIncVat: form.retailPriceIncVat === "" ? null : parseFloat(form.retailPriceIncVat),
    };
    try {
      const res = await fetch(`/api/master/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved?.();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  const submitFactoryPrice = async () => {
    const nextPrice = factoryPriceDraft === "" ? NaN : Number(factoryPriceDraft);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setPriceError("กรุณาระบุราคาโรงงานใหม่เป็นตัวเลข 0 หรือมากกว่า");
      return;
    }
    if (!priceConfirmed) {
      setPriceError("กรุณายืนยันว่ากำลังอัปเดตราคาโรงงาน");
      return;
    }

    setPriceSubmitting(true);
    setPriceError(null);
    setPriceSaved(false);
    try {
      const res = await fetch(`/api/master/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: nextPrice }),
      });
      if (res.ok) {
        setPriceEditorOpen(false);
        setPriceConfirmed(false);
        setPriceSaved(true);
        onSaved?.();
      } else {
        const d = await res.json().catch(() => ({}));
        setPriceError(d.error || "อัปเดตราคาโรงงานไม่สำเร็จ");
      }
    } catch {
      setPriceError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setPriceSubmitting(false);
  };

  const field = (k, label, type = "text", extra = {}) => (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        value={form[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        className={`premium-input w-full ${type === "number" ? "font-mono" : ""}`}
        {...extra}
      />
    </div>
  );

  const money = (v) =>
    v == null || v === "" || Number.isNaN(Number(v)) ? "-" : fmtMoney(v);

  const cat = getCategoryInfo(form.fgCode);
  const catBox = (() => {
    if (!form.fgCode) {
      return <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย) เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>;
    }
    if (!cat.code) {
      return <div className="mt-2 text-xs text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
    }
    if (!cat.found) {
      if (productTypes.length === 0) return null; // ยังโหลดไม่เสร็จ
      return <div className="mt-2 text-xs text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">พบหมวดหมู่ <strong>{cat.code}</strong> แต่ไม่มีในฐานข้อมูล (อาจพิมพ์ผิด หรือเป็นหมวดใหม่)</div>;
    }

    const isExcise = cat.code === "01-002";
    return (
      <div className={`mt-2 p-3 text-xs rounded-lg border border-[var(--border)] flex flex-col gap-1 ${isExcise ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--text-2)]"}`}>
        <div className="flex items-center gap-2">
          <span className="font-mono bg-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold">{cat.code}</span>
          <span className="font-semibold">{cat.typeInfo.nameTh || cat.typeInfo.nameEn}</span>
        </div>
        <div className="text-[11px] opacity-80 pl-1">
          กลุ่มหลัก: {cat.typeInfo.mainCategoryName}
        </div>
        <div className={`mt-1 pl-1 font-semibold ${isExcise ? "" : "text-[var(--green)]"}`}>
          {isExcise ? "⚠️ สินค้านี้เข้าข่ายต้องเสียภาษีสรรพสามิต (ระบบจะคิดภาษีอัตโนมัติ)" : "✓ สินค้านี้ได้รับการยกเว้นภาษีสรรพสามิต"}
        </div>
      </div>
    );
  })();

  return (
    <Modal open={open} onClose={() => !(submitting || priceSubmitting) && onClose()} title={`แก้ไขสินค้า — ${product.fgCode}`} size="lg">
      <form onSubmit={submit}>
        {/* Section 1: product */}
        <div className="mb-[22px]">
          <div className="border-b border-[var(--border)] pb-3 mb-5">
            <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลหลักสินค้า (Product Details)</h3>
          </div>
          <div className="form-grid cols-2">
            <div className="form-group col-span-2">
              <label>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></label>
              <input type="text" value={form.fgCode ?? ""} onChange={(e) => set("fgCode", e.target.value)} required placeholder="FG-AAA-BB-CCC-DDDD" className="premium-input w-full font-mono text-base" />
              {catBox}
            </div>
            <div className="form-group col-span-2">
              <label>ชื่อสินค้า / รายละเอียด (ไทย)</label>
              <input type="text" value={form.productDescription ?? ""} onChange={(e) => set("productDescription", e.target.value)} placeholder="เช่น มิดไนท์บลูม 50ml" className="premium-input w-full" />
            </div>
            <div className="form-group col-span-2">
              <label>ชื่อสินค้า / รายละเอียด (อังกฤษ)</label>
              <input type="text" value={form.productDescriptionEn ?? ""} onChange={(e) => set("productDescriptionEn", e.target.value)} placeholder="e.g. Midnight Bloom 50ml" className="premium-input w-full" />
              <span className="text-xs text-[var(--text-3)] mt-1">กรอกอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ) <span className="text-[var(--red)]">*</span></span>
            </div>
            <div className="form-group">
              <label>ลูกค้าเจ้าของสินค้า <span className="text-[var(--red)]">*</span></label>
              <SearchableSelect
                value={form.customerId ?? ""}
                onChange={handleCustomerChange}
                placeholder="ค้นหารหัส / ชื่อลูกค้า..."
                emptyText="ไม่พบลูกค้า"
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.arCode ? `${c.arCode} — ${c.name}` : c.name,
                  search: `${c.arCode || ""} ${c.name}`,
                }))}
              />
              <span className="text-xs text-[var(--text-3)] mt-1">เปลี่ยนเจ้าของแล้ว สินค้าจะกลับเป็น “รออนุมัติ” ให้ตรวจซ้ำ</span>
            </div>
            <div className="form-group">
              <label>ชื่อแบรนด์ <span className="text-[var(--red)]">*</span></label>
              <SearchableSelect
                allowFreeText
                disabled={!form.customerId}
                options={brandOptionList.map((b) => ({ value: b.th || b.en, label: brandBoth(b.th, b.en), search: `${b.th} ${b.en}` }))}
                value={form.brandName || form.brandNameEn || ""}
                onChange={handleBrandChange}
                placeholder={form.customerId ? "เลือกแบรนด์ หรือพิมพ์ใหม่" : "เลือกลูกค้าก่อน"}
                emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ (พิมพ์เพื่อเพิ่มใหม่)"
              />
              <span className="text-xs text-[var(--text-3)] mt-1">แบรนด์มาจากข้อมูลลูกค้า (โชว์ EN · TH) — แก้ชื่อแบรนด์ได้ที่หน้าลูกค้า</span>
            </div>
          </div>
        </div>

        {/* Section 2: packaging & pricing */}
        <div className="mb-[22px]">
          <div className="border-b border-[var(--border)] pb-3 mb-5">
            <h3 className="font-semibold text-[var(--text)]">2. ข้อมูลบรรจุภัณฑ์และราคา (Packaging & Pricing)</h3>
          </div>
          <div className="form-grid cols-2">
            <div className="form-group">
              <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
              <div className="flex gap-2">
                <input type="number" value={form.volume ?? ""} onChange={(e) => set("volume", e.target.value)} required min="0.01" step="0.01" className="premium-input flex-1 font-mono" />
                <Select value={form.volumeUnit || "ml"} onChange={(e) => set("volumeUnit", e.target.value)} style={{ width: "80px" }}>
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
              <input type="number" value={form.piecesPerCase ?? ""} onChange={(e) => set("piecesPerCase", e.target.value)} min="1" step="1" placeholder="เช่น 12" className="premium-input w-full font-mono" />
            </div>
            <div className="form-group">
              <label>ราคาโรงงาน (บาท)</label>
              <input
                type="text"
                value={money(product.costPrice)}
                readOnly
                className="premium-input w-full font-mono tabular-nums"
                style={{ color: "var(--text-3)", background: "var(--panel-2)", cursor: "not-allowed" }}
                aria-describedby="factory-price-readonly-help"
              />
              <span id="factory-price-readonly-help" className="text-xs text-[var(--text-3)] mt-1">
                ช่องนี้ดูอย่างเดียว ต้องกด “อัปเดตราคาโรงงาน” ด้านล่างเพื่อแก้ราคา
              </span>
            </div>
            <div className="form-group">
              <label>ราคาขายปลีก <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">รวม VAT</span></label>
              <input type="number" value={form.retailPriceIncVat ?? ""} onChange={(e) => set("retailPriceIncVat", e.target.value)} min="0" step="0.01" className="premium-input w-full font-mono" />
            </div>
          </div>

          <div className="glass-panel mt-5" style={{ padding: "16px 18px", borderLeft: "3px solid var(--amber)" }}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="brand-logo" style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "var(--panel-2)", color: "var(--amber)" }}>
                <Factory size={19} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>ราคาโรงงาน</h4>
                  <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>อัปเดตแยก</span>
                </div>
                <p style={{ margin: "6px 0 0", color: "var(--text-3)", fontSize: 13, lineHeight: 1.65 }}>
                  ราคานี้คือราคาโรงงานต่อหน่วยและมีผลต่อประวัติราคา/ต้นทุนสินค้า จึงต้องอัปเดตผ่าน action แยกเท่านั้น
                </p>
              </div>
              <div style={{ textAlign: "right", minWidth: 150 }}>
                <div style={{ color: "var(--text-3)", fontSize: 12 }}>ราคาปัจจุบัน</div>
                <div className="font-mono tabular-nums" style={{ color: "var(--text)", fontWeight: 800, fontSize: 18 }}>
                  {money(product.costPrice)}
                </div>
              </div>
            </div>

            {!priceEditorOpen ? (
              <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
                <div className="flex items-center gap-2" style={{ minHeight: 32 }}>
                  {priceSaved && (
                    <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--green)" }}>
                      <CheckCircle2 size={15} aria-hidden="true" /> บันทึกราคาโรงงานแล้ว
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => {
                    setFactoryPriceDraft(product.costPrice ?? "");
                    setPriceEditorOpen(true);
                    setPriceConfirmed(false);
                    setPriceError(null);
                    setPriceSaved(false);
                  }}
                >
                  อัปเดตราคาโรงงาน
                </button>
              </div>
            ) : (
              <div className="mt-4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-grid cols-2">
                  <div className="form-group">
                    <label htmlFor="factory-price-update">ราคาโรงงานใหม่ (บาท)</label>
                    <input
                      id="factory-price-update"
                      type="number"
                      min="0"
                      step="0.01"
                      value={factoryPriceDraft}
                      onChange={(e) => setFactoryPriceDraft(e.target.value)}
                      className="premium-input w-full font-mono tabular-nums"
                      aria-describedby="factory-price-help factory-price-error"
                      aria-invalid={!!priceError}
                    />
                    <span id="factory-price-help" className="text-xs text-[var(--text-3)] mt-1">
                      ช่องนี้อัปเดตเฉพาะราคาโรงงาน ไม่ใช่ราคาขายปลีกหรือข้อมูลสเปคสินค้า
                    </span>
                  </div>
                  <div style={{ padding: "12px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                    <div className="flex items-center gap-2" style={{ color: "var(--amber)", fontWeight: 700, fontSize: 13 }}>
                      <AlertTriangle size={15} aria-hidden="true" /> ยืนยันก่อนบันทึก
                    </div>
                    <label className="flex items-start gap-2 mt-3" style={{ cursor: "pointer", color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>
                      <input
                        type="checkbox"
                        checked={priceConfirmed}
                        onChange={(e) => setPriceConfirmed(e.target.checked)}
                        style={{ marginTop: 3 }}
                      />
                      <span>ฉันยืนยันว่ากำลังอัปเดต <strong>ราคาโรงงาน</strong> ของสินค้านี้</span>
                    </label>
                  </div>
                </div>
                {priceError && (
                  <div id="factory-price-error" className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2" role="alert">
                    {priceError}
                  </div>
                )}
                <div className="flex justify-end gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn"
                    disabled={priceSubmitting}
                    onClick={() => {
                      setPriceEditorOpen(false);
                      setFactoryPriceDraft(product.costPrice ?? "");
                      setPriceConfirmed(false);
                      setPriceError(null);
                    }}
                  >
                    ยกเลิกอัปเดตราคา
                  </button>
                  <button type="button" className="btn btn-warning" disabled={priceSubmitting || !priceConfirmed} onClick={submitFactoryPrice}>
                    {priceSubmitting ? "กำลังบันทึกราคา..." : "บันทึกราคาโรงงานใหม่"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2 mb-4">{error}</div>}

        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting || priceSubmitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

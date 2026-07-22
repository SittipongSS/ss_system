"use client";
import MoneyInput from "@/components/ui/MoneyInput";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Factory } from "lucide-react";
import Modal from "@/components/Modal";
import ProductForm, { PRODUCT_EDIT_FIELDS } from "@/components/database/ProductForm";
import { brandTh, brandEn, normalizeBrands } from "@/lib/master/brands";
import { fmtMoney } from "@/lib/format";

// Edit a master product's catalog/spec fields, including its owning customer.
// (Excise APPROVAL still lives on the registration.) Layout/styling mirrors the
// "add product" form on /database/products so both forms feel like one system.
// (ช่องที่ดึงจากสินค้าเดิม = PRODUCT_EDIT_FIELDS ใน ProductForm — ที่เดียว)

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
  // แบรนด์ที่เพิ่งเพิ่มผ่านปุ่ม "+" ในโมดัลนี้ (customers prop ยังไม่รีเฟรช)

  useEffect(() => {
    if (open && product) {
      const seed = {};
      for (const k of PRODUCT_EDIT_FIELDS) seed[k] = product[k] ?? "";
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


  if (!product) return null;

  // Brand suggestions follow the selected customer's brands[] (fall back to the
  // parent-supplied list while customers aren't loaded). Changing the customer
  // clears the brand — the brand list is scoped per customer, same as the add form.
  const selCustomer = customers.find((c) => c.id === form.customerId);
  // แบรนด์ = ช่องเดียว โชว์ EN · TH; ไม่มี selCustomer ใช้ prop เดิม (string[]) แปลงเป็น {th,en}.
  const customerBrands = [
    ...(selCustomer ? normalizeBrands(selCustomer.brands || []) : (brandOptions || []).map((b) => ({ th: b, en: "" }))),
  ];
  // แบรนด์เดิมของสินค้าที่ไม่อยู่ในลิสต์ลูกค้า (free-text ยุคเก่า) — แทรกไว้ไม่ให้ค่าหาย
  const currentBrandValue = form.brandName || form.brandNameEn || "";
  const brandOptionList = currentBrandValue && !customerBrands.some((b) => brandTh(b) === currentBrandValue || brandEn(b) === currentBrandValue)
    ? [{ th: form.brandName || "", en: form.brandNameEn || "" }, ...customerBrands]
    : customerBrands;

  const handleCustomerChange = (v) => setForm((f) => ({ ...f, customerId: v, brandName: "", brandNameEn: "" }));


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
      setPriceError("กรุณาระบุราคาผลิตใหม่เป็นตัวเลข 0 หรือมากกว่า");
      return;
    }
    if (!priceConfirmed) {
      setPriceError("กรุณายืนยันว่ากำลังอัปเดตราคาผลิต");
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
        setPriceError(d.error || "อัปเดตราคาผลิตไม่สำเร็จ");
      }
    } catch {
      setPriceError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setPriceSubmitting(false);
  };



  const money = (v) =>
    v == null || v === "" || Number.isNaN(Number(v)) ? "-" : fmtMoney(v);



  return (
    <Modal open={open} onClose={() => !(submitting || priceSubmitting) && onClose()} title={`แก้ไขสินค้า — ${product.fgCode}`} size="lg">
      <form onSubmit={submit}>
        {/* ฟอร์มเดียวกับโมดัลเพิ่มสินค้า (/database/products) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง.
            ต่างแค่โหมด: ไม่มีป้ายผู้สร้าง และราคาผลิตดูอย่างเดียว (แก้ผ่านแผงด้านล่าง) */}
        <ProductForm
          form={form}
          onForm={(patch) => setForm((f) => ({ ...f, ...patch }))}
          productTypes={productTypes}
          customers={customers}
          brandOptions={brandOptionList}
          factoryPrice="readonly"
          currentCostPrice={product.costPrice}
          onCustomerChange={handleCustomerChange}
        />

        {/* แผงอัปเดตราคาผลิต — action แยกจากการบันทึกสเปค (กระทบประวัติราคา/ต้นทุน) */}
        <div className="mb-[22px]">
          <div className="glass-panel mt-5" style={{ padding: "16px 18px", borderLeft: "3px solid var(--amber)" }}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="brand-logo" style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "var(--panel-2)", color: "var(--amber)" }}>
                <Factory size={19} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>ราคาผลิต</h4>
                  <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>อัปเดตแยก</span>
                </div>
                <p style={{ margin: "6px 0 0", color: "var(--text-3)", fontSize: 13, lineHeight: 1.65 }}>
                  ราคานี้คือราคาผลิตต่อหน่วยและมีผลต่อประวัติราคา/ต้นทุนสินค้า จึงต้องอัปเดตผ่าน action แยกเท่านั้น
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
                      <CheckCircle2 size={15} aria-hidden="true" /> บันทึกราคาผลิตแล้ว
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
                  อัปเดตราคาผลิต
                </button>
              </div>
            ) : (
              <div className="mt-4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-grid cols-2">
                  <div className="form-group">
                    <label htmlFor="factory-price-update">ราคาผลิตใหม่ (บาท)</label>
                    <MoneyInput
                      id="factory-price-update"
                      value={factoryPriceDraft}
                      onChange={(value) => setFactoryPriceDraft(value ?? "")}
                      className="w-full"
                      aria-describedby="factory-price-help factory-price-error"
                      aria-invalid={!!priceError}
                    />
                    <span id="factory-price-help" className="text-xs text-[var(--text-3)] mt-1">
                      ช่องนี้อัปเดตเฉพาะราคาผลิต ไม่ใช่ราคาขายปลีกหรือข้อมูลสเปคสินค้า
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
                      <span>ฉันยืนยันว่ากำลังอัปเดต <strong>ราคาผลิต</strong> ของสินค้านี้</span>
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
                    {priceSubmitting ? "กำลังบันทึกราคา..." : "บันทึกราคาผลิตใหม่"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2 mb-4">{error}</div>}

        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={submitting || priceSubmitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

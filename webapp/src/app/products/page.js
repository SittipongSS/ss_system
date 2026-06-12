"use client";
import { useState, useEffect, useMemo } from "react";
import { Package, Plus, Search } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import Modal from "@/components/Modal";

// Master product catalog. FG products are CREATED here, independent of any
// customer. Linking a product to a customer + excise approval happens in the
// excise registration flow (/excise).
export default function ProductRegistry() {
  const canEdit = useCan("products:edit");
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [productTypes, setProductTypes] = useState(() => apiCache.get("/api/product-types") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/products"));
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    fgCode: "",
    productDescription: "",
    brandName: "",
    volume: "",
    volumeUnit: "ml",
    costPrice: "",
    retailPriceIncVat: "",
  };
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState("");
  const [search, setSearch] = useState("");

  const formatMoney = (a) =>
    a == null ? "-" : a.toLocaleString("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        apiCache.set("/api/products", data);
        setProducts(data);
      }
      const typeRes = await fetch("/api/product-types");
      if (typeRes.ok) {
        const typeData = await typeRes.json();
        apiCache.set("/api/product-types", typeData);
        setProductTypes(typeData);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const getCategoryInfo = (fgCode) => {
    if (!fgCode) return null;
    const m = fgCode.match(/(\d{2})-(\d{3})/);
    if (!m) return { found: false, code: null };
    const code = `${m[1]}-${m[2]}`;
    const typeInfo = productTypes.find(t => `${t.mainCategoryCode}-${t.typeCode}` === code);
    return { found: !!typeInfo, code, typeInfo };
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    fetchProducts();
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ดึงมาเป็นรายการแนะนำของช่องแบรนด์
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set("/api/customers", d || []); setCustomers(d || []); })
      .catch(() => {});
  }, []);

  // รายการแบรนด์แนะนำ = แบรนด์ที่ไม่ซ้ำจากลูกค้าทุกราย (ยังพิมพ์แบรนด์ใหม่ได้)
  const brandOptions = useMemo(
    () => [...new Set(customers.flatMap((c) => c.brands || []).map((b) => (b || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [customers],
  );

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const openForm = () => {
    setFormData(emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fgCode.includes("01-002")) {
      if (
        !confirm(
          "⚠️ แจ้งเตือน:\nรหัสสินค้า (FG) ไม่ได้อยู่ในหมวด 01-002 (น้ำหอมฉีดผิวกาย)\n\nระบบจะตีความว่าสินค้านี้ 'ไม่ต้องเสียภาษีสรรพสามิต'\nต้องการบันทึกต่อหรือไม่?",
        )
      )
        return;
    }
    setSubmitting(true);
    const payload = {
      ...formData,
      assignee: userName,
      volume: parseFloat(formData.volume),
      volumeUnit: formData.volumeUnit || "ml",
      costPrice: parseFloat(formData.costPrice),
      retailPriceIncVat: parseFloat(formData.retailPriceIncVat),
    };
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        await fetchProducts();
      } else {
        const err = await res.json();
        alert(err.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      alert("Error submitting form");
    } finally {
      setSubmitting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    if (!q) return true;
    return [p.fgCode, p.productDescription, p.brandName].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <>
      <div
        className="premium-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <Package size={22} />
            </span>{" "}
            ข้อมูลสินค้า
          </h1>
          <p>ฐานข้อมูลสินค้ากลาง (Master Data) — รหัส FG สเปค และต้นทุน/ภาษีต่อหน่วย</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill ok">ทั้งหมด {products.length} รายการ</div>
          {canEdit && (
            <button onClick={openForm} className="btn btn-primary flex items-center gap-1.5">
              <Plus size={16} /> เพิ่มสินค้า
            </button>
          )}
        </div>
      </div>

      {/* แถบเครื่องมือ: ค้นหา */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div className="search-glass" style={{ width: "240px" }}>
          <Search size={18} color="var(--text-3)" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..." />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <div className="glass-panel">
          <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-sm text-[var(--text)]">
              ฐานข้อมูลสินค้า ({filteredProducts.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รายละเอียดสินค้า (FG Code)</th>
                  <th>แบรนด์</th>
                  <th className="num">ปริมาตร</th>
                  <th className="num">ราคาขายปลีก</th>
                  <th className="num">ภาษี/ชิ้น</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-10 text-[var(--text-3)]">
                      {search.trim() ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้าในระบบ"}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isExempt = p.isExciseTaxable === false;
                    const taxRate = isExempt ? 0 : (p.exciseTax || 0) + (p.localTax || 0);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => (window.location.href = `/products/${p.id}`)}
                        className="clickable-row"
                      >
                        <td>
                          <div className="font-semibold text-[var(--text)]">{p.productDescription}</div>
                          <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">{p.fgCode}</div>
                        </td>
                        <td className="text-[var(--text-2)]">{p.brandName || "-"}</td>
                        <td className="num font-mono text-[var(--text-2)]">{p.volume} {p.volumeUnit || "ml"}</td>
                        <td className="num mono text-[var(--text-2)]">{formatMoney(p.retailPriceIncVat)}</td>
                        <td className="num mono text-[var(--text-2)]">
                          {isExempt ? <span className="status-pill success text-[10px]">ยกเว้น</span> : formatMoney(taxRate)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add product modal — catalog only (no customer). */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="เพิ่มสินค้าใหม่ (New Product)" size="lg">
        <form onSubmit={handleSubmit}>
          {/* Section 1: product */}
          <div className="mb-[22px]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลหลักสินค้า (Product Details)</h3>
              <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
                ผู้สร้าง: {userName}
              </span>
            </div>
            <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="form-group col-span-2">
                <label>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="fgCode" value={formData.fgCode} onChange={handleChange} required placeholder="FG-AAA-BB-CCC-DDDD" className="premium-input w-full font-mono text-base" />
                
                {(() => {
                  const cat = getCategoryInfo(formData.fgCode);
                  if (!formData.fgCode) {
                    return <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย) เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>;
                  }
                  if (!cat.code) {
                    return <div className="mt-2 text-xs text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
                  }
                  if (!cat.found) {
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
                })()}
              </div>
              <div className="form-group">
                <label>รายละเอียดสินค้า <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="productDescription" value={formData.productDescription} onChange={handleChange} required placeholder="เช่น Midnight Bloom 50ml" className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>ชื่อแบรนด์ <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="brandName" value={formData.brandName} onChange={handleChange} required list="brand-options" placeholder="เลือกแบรนด์ของลูกค้า หรือพิมพ์ใหม่" className="premium-input w-full" />
                <datalist id="brand-options">
                  {brandOptions.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
            </div>
          </div>

          {/* Section 2: packaging & pricing */}
          <div className="mb-[22px]">
            <div className="border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)]">2. ข้อมูลบรรจุภัณฑ์และราคา (Packaging & Pricing)</h3>
            </div>
            <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="form-group">
                <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
                <div className="flex gap-2">
                  <input type="number" name="volume" value={formData.volume} onChange={handleChange} required min="0.01" step="0.01" className="premium-input flex-1 font-mono" />
                  <select name="volumeUnit" value={formData.volumeUnit} onChange={handleChange} className="premium-select" style={{ width: "80px" }}>
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="oz">oz</option>
                    <option value="L">L</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>ราคาโรงงาน (บาท) <span className="text-[var(--red)]">*</span></label>
                <input type="number" name="costPrice" value={formData.costPrice} onChange={handleChange} required min="0" step="0.01" className="premium-input w-full font-mono" />
              </div>
              <div className="form-group">
                <label>ราคาขายปลีก <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">รวม VAT</span> <span className="text-[var(--red)]">*</span></label>
                <input type="number" name="retailPriceIncVat" value={formData.retailPriceIncVat} onChange={handleChange} required min="0" step="0.01" placeholder="ถอด VAT 7% ให้เอง" className="premium-input w-full font-mono" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={submitting} className="btn btn-primary px-8">
              {submitting ? "กำลังบันทึก..." : "บันทึกสินค้า"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

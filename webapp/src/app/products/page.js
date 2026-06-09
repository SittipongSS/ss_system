"use client";
import { useState, useEffect } from "react";
import { Package, Plus } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import Modal from "@/components/Modal";
import ProductStatusPill from "@/components/ProductStatusPill";

export default function ProductRegistry() {
  const canEdit = useCan("products:edit");
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/products"));
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    fgCode: "",
    productDescription: "",
    brandName: "",
    customerName: "",
    taxId: "",
    address: "",
    volume: "",
    costPrice: "",
    retailPriceIncVat: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

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
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    fetchProducts();
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCustomers(d || []))
      .catch(() => {});
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleCustomerSelect = (e) => {
    const arCode = e.target.value;
    if (!arCode) return setSelectedCustomer(null);
    const customer = customers.find((c) => c.arCode === arCode);
    setSelectedCustomer(customer || null);
    if (customer) {
      setFormData({
        ...formData,
        customerName: customer.name,
        taxId: customer.taxId,
        address: customer.address,
        brandName: "",
      });
    }
  };

  const openForm = () => {
    setFormData({
      fgCode: "",
      productDescription: "",
      brandName: "",
      customerName: "",
      taxId: "",
      address: "",
      volume: "",
      costPrice: "",
      retailPriceIncVat: "",
    });
    setSelectedCustomer(null);
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
      mapFileUrl: selectedCustomer ? selectedCustomer.mapFileUrl : null,
      volume: parseFloat(formData.volume),
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
            ทะเบียนสินค้า
          </h1>
          <p>ฐานข้อมูลสินค้า (Master Data) และการขึ้นทะเบียนสรรพสามิต</p>
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

      {loading ? (
        <div className="flex justify-center p-12">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <div className="glass-panel">
          <div className="px-4 py-3.5 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm text-[var(--text)]">
              ฐานข้อมูลสินค้า ({products.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รายละเอียดสินค้า (FG Code)</th>
                  <th>แบรนด์</th>
                  <th>ลูกค้า</th>
                  <th className="num">ปริมาตร</th>
                  <th className="num">ราคาขายปลีก</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-[var(--text-3)]">
                      ยังไม่มีสินค้าในระบบ
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
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
                      <td className="text-[var(--text-2)]">{p.customerName}</td>
                      <td className="num font-mono text-[var(--text-2)]">{p.volume} ml</td>
                      <td className="num mono text-[var(--text-2)]">{formatMoney(p.retailPriceIncVat)}</td>
                      <td><ProductStatusPill status={p.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add product modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="เพิ่มสินค้าใหม่ (New Product)" size="lg">
        <form onSubmit={handleSubmit}>
          {/* Section 1: customer */}
          <div className="mb-[22px]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลลูกค้า (Customer Info)</h3>
              {customers.length > 0 && (
                <select
                  onChange={handleCustomerSelect}
                  className="premium-select"
                  style={{ width: "220px", height: "32px", fontSize: "12.5px" }}
                >
                  <option value="">⚡ เลือกรหัสลูกค้า (Auto-fill)</option>
                  {customers.map((c) => (
                    <option key={c.arCode} value={c.arCode}>
                      {c.arCode} : {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="form-group">
                <label>ชื่อบริษัท / ลูกค้า <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} required className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>เลขประจำตัวผู้เสียภาษี <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="taxId" value={formData.taxId} onChange={handleChange} required className="premium-input w-full font-mono" />
              </div>
              <div className="form-group col-span-2">
                <label>ที่อยู่ลูกค้า <span className="text-[var(--red)]">*</span></label>
                <textarea name="address" value={formData.address} onChange={handleChange} required className="premium-input w-full" style={{ height: "80px", padding: "10px 12px", resize: "none" }}></textarea>
              </div>
            </div>
          </div>

          {/* Section 2: product */}
          <div className="mb-[22px]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)]">2. ข้อมูลหลักสินค้า (Product Details)</h3>
              <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
                Assignee: {userName}
              </span>
            </div>
            <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="form-group col-span-2">
                <label>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="fgCode" value={formData.fgCode} onChange={handleChange} required placeholder="FG-AAA-BB-CCC-DDDD" className="premium-input w-full font-mono text-base" />
                <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย) เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>
                {formData.fgCode && !formData.fgCode.includes("01-002") && (
                  <div className="mt-2 p-3 bg-[var(--amber-soft)] text-[var(--amber)] text-xs rounded-lg border border-[var(--border)]">
                    <strong>หมายเหตุ:</strong> รหัสนี้ไม่อยู่ในหมวด 01-002 จะถูกประเมินว่า <strong>“ไม่ต้องเสียภาษีสรรพสามิต”</strong>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>รายละเอียดสินค้า <span className="text-[var(--red)]">*</span></label>
                <input type="text" name="productDescription" value={formData.productDescription} onChange={handleChange} required placeholder="เช่น Midnight Bloom 50ml" className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>ชื่อแบรนด์ <span className="text-[var(--red)]">*</span></label>
                {selectedCustomer && selectedCustomer.brands && selectedCustomer.brands.length > 0 ? (
                  <select name="brandName" value={formData.brandName} onChange={handleChange} required className="premium-select w-full">
                    <option value="">-- เลือกแบรนด์ของลูกค้านี้ --</option>
                    {selectedCustomer.brands.map((b, i) => (
                      <option key={i} value={b}>{b}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" name="brandName" value={formData.brandName} onChange={handleChange} required placeholder="Brand Name" className="premium-input w-full" />
                )}
              </div>
            </div>
          </div>

          {/* Section 3: excise */}
          <div className="mb-[22px]">
            <div className="border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)]">3. ข้อมูลสำหรับสรรพสามิต (Excise Metrics)</h3>
            </div>
            <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="form-group">
                <label>ปริมาตรบรรจุ (ml) <span className="text-[var(--red)]">*</span></label>
                <input type="number" name="volume" value={formData.volume} onChange={handleChange} required min="1" className="premium-input w-full font-mono" />
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
              {submitting ? "กำลังบันทึก..." : "บันทึกและส่งข้อมูล"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

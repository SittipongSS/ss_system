"use client";
import { useState, useEffect } from "react";
import { SquarePen } from "lucide-react";
export default function SAPortal() {
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
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userName, setUserName] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const fetchCustomers = async () => {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    };
    fetchCustomers();
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleCustomerSelect = (e) => {
    const selectedArCode = e.target.value;
    if (!selectedArCode) {
      setSelectedCustomer(null);
      return;
    }

    const customer = customers.find((c) => c.arCode === selectedArCode);
    setSelectedCustomer(customer || null);
    if (customer) {
      setFormData({
        ...formData,
        customerName: customer.name,
        taxId: customer.taxId,
        address: customer.address,
        brandName: "", // Reset brand when customer changes
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.fgCode.includes("01-002")) {
      if (
        !confirm(
          "⚠️ แจ้งเตือน:\nรหัสสินค้า (FG) ที่คุณระบุ ไม่ได้อยู่ในหมวด 01-002 (น้ำหอมฉีดผิวกาย)\n\nระบบจะตีความว่าสินค้านี้ 'ไม่ต้องเสียภาษีสรรพสามิต'\nคุณต้องการบันทึกข้อมูลนี้ต่อไปหรือไม่?",
        )
      ) {
        return;
      }
    }

    setLoading(true);
    setSuccess(false);

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
        setSuccess(true);
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
        setTimeout(() => setSuccess(false), 4000);
      } else {
        const errorData = await res.json();
        alert(errorData.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      alert("Error submitting form");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <SquarePen size={22} />
            </span>{" "}
            สร้าง/แก้ไขรหัสสินค้าใหม่
          </h1>
          <p>ระบบตรวจสอบและบันทึกข้อมูล Master Data สินค้า (SA)</p>
        </div>
      </div>

      <div className="glass-panel p-[18px]">
        {success && (
          <div className="mb-6 px-4 py-3 bg-[var(--green-soft)] text-[var(--green)] rounded-lg border border-[var(--border)] flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <strong>สำเร็จ!</strong> ส่งข้อมูลให้ Legal ขึ้นทะเบียนเรียบร้อยแล้ว
            (ผู้รับผิดชอบ: {userName})
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Section 1 */}
          <div className="mb-[22px]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)] ">
                1. ข้อมูลลูกค้า (Customer Info)
              </h3>
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

            <div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
            >
              <div className="form-group">
                <label>
                  ชื่อบริษัท / ลูกค้า{" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleChange}
                  required
                  className="premium-input w-full"
                />
              </div>
              <div className="form-group">
                <label>
                  เลขประจำตัวผู้เสียภาษี{" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                  required
                  className="premium-input w-full font-mono"
                />
              </div>
              <div className="form-group col-span-2">
                <label>
                  ที่อยู่ลูกค้า <span className="text-[var(--red)]">*</span>
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  className="premium-input w-full"
                  style={{
                    height: "80px",
                    padding: "10px 12px",
                    resize: "none",
                  }}
                ></textarea>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="mb-[22px]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)] ">
                2. ข้อมูลหลักสินค้า (Product Details)
              </h3>
              <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
                Assignee: {userName}
              </span>
            </div>

            <div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
            >
              <div className="form-group col-span-2">
                <label>
                  รหัสสินค้า (FG Code){" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="fgCode"
                  value={formData.fgCode}
                  onChange={handleChange}
                  required
                  placeholder="FG-AAA-BB-CCC-DDDD"
                  className="premium-input w-full font-mono text-base"
                />
                <span className="text-xs text-[var(--text-3)] mt-1">
                  เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย)
                  เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต
                </span>
                {formData.fgCode && !formData.fgCode.includes("01-002") && (
                  <div className="mt-2 p-3 bg-[var(--amber-soft)] text-[var(--amber)] text-xs rounded-lg border border-[var(--border)] flex items-center gap-2 transition-all">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 flex-shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>
                      <strong>หมายเหตุ:</strong> รหัสสินค้าไม่อยู่ในหมวด 01-002
                      (น้ำหอมฉีดผิวกาย) สินค้านี้จะได้รับการประเมินว่า{" "}
                      <strong>"ไม่ต้องเสียภาษีสรรพสามิต"</strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>
                  รายละเอียดสินค้า <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="productDescription"
                  value={formData.productDescription}
                  onChange={handleChange}
                  required
                  placeholder="เช่น Midnight Bloom 50ml"
                  className="premium-input w-full"
                />
              </div>

              <div className="form-group">
                <label>
                  ชื่อแบรนด์ <span className="text-[var(--red)]">*</span>
                </label>
                {selectedCustomer &&
                selectedCustomer.brands &&
                selectedCustomer.brands.length > 0 ? (
                  <select
                    name="brandName"
                    value={formData.brandName}
                    onChange={handleChange}
                    required
                    className="premium-select w-full"
                  >
                    <option value="">-- เลือกแบรนด์ของลูกค้านี้ --</option>
                    {selectedCustomer.brands.map((b, i) => (
                      <option key={i} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    name="brandName"
                    value={formData.brandName}
                    onChange={handleChange}
                    required
                    placeholder="Brand Name"
                    className="premium-input w-full"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="mb-[22px]">
            <div className="border-b border-[var(--border)] pb-3 mb-5">
              <h3 className="font-semibold text-[var(--text)] ">
                3. ข้อมูลสำหรับสรรพสามิต (Excise Metrics)
              </h3>
            </div>

            <div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
            >
              <div className="form-group">
                <label>
                  ปริมาตรบรรจุ (ml) <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="number"
                  name="volume"
                  value={formData.volume}
                  onChange={handleChange}
                  required
                  min="1"
                  className="premium-input w-full font-mono"
                />
              </div>
              <div className="form-group">
                <label>
                  ราคาโรงงาน (บาท) <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="number"
                  name="costPrice"
                  value={formData.costPrice}
                  onChange={handleChange}
                  required
                  min="0"
                  step="0.01"
                  className="premium-input w-full font-mono"
                />
              </div>
              <div className="form-group">
                <label>
                  ราคาขายปลีก{" "}
                  <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">
                    รวม VAT
                  </span>{" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="number"
                  name="retailPriceIncVat"
                  value={formData.retailPriceIncVat}
                  onChange={handleChange}
                  required
                  min="0"
                  step="0.01"
                  placeholder="ระบบจะถอด VAT 7% ให้เอง"
                  className="premium-input w-full font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-8 pt-6 border-t border-[var(--border)] ">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary px-8"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  กำลังบันทึกข้อมูล...
                </>
              ) : (
                "บันทึกและส่งข้อมูล"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

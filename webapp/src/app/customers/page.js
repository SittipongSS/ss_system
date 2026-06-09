"use client";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
export default function CustomerDirectory() {
  const canEdit = useCan("customers:edit");
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/customers"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("list");

  const [mapFile, setMapFile] = useState(null);
  const [formData, setFormData] = useState({
    arCode: "",
    name: "",
    taxId: "",
    address: "",
    brandsStr: "",
  });

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        apiCache.set("/api/customers", data);
        setCustomers(data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let mapFileUrl = null;
    if (mapFile) {
      try {
        const uploadData = new FormData();
        uploadData.append("file", mapFile);
        uploadData.append("customerName", formData.name);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });
        if (uploadRes.ok) {
          const result = await uploadRes.json();
          mapFileUrl = result.url;
        } else {
          alert("คำเตือน: อัปโหลดไฟล์แผนที่ไม่สำเร็จ");
        }
      } catch (err) {
        console.error("Upload error", err);
      }
    }

    const payload = {
      arCode: formData.arCode,
      name: formData.name,
      taxId: formData.taxId,
      address: formData.address,
      brands: formData.brandsStr
        .split(",")
        .map((b) => b.trim())
        .filter((b) => b),
      mapFileUrl,
    };

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setFormData({
          arCode: "",
          name: "",
          taxId: "",
          address: "",
          brandsStr: "",
        });
        setMapFile(null);
        fetchCustomers();
        setActiveTab("list");
      } else {
        const errorData = await res.json();
        alert(errorData.error || "เกิดข้อผิดพลาด");
      }
    } catch (err) {
      alert("Error adding customer");
    }
    setIsSubmitting(false);
  };

  return (
    <>
      <div
        className="premium-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1>
            <span className="premium-header-icon">
              <Building2 size={22} />
            </span>{" "}
            ทะเบียนลูกค้า
          </h1>
          <p>จัดการฐานข้อมูลลูกค้าและแบรนด์ในระบบ (AR Code & Brands)</p>
        </div>
        <div className="pill ok">ทั้งหมด {customers.length} รายการ</div>
      </div>

      <div className="tabs-header">
        <button
          onClick={() => setActiveTab("list")}
          className={`tab-btn ${activeTab === "list" ? "active" : ""}`}
        >
          ทะเบียนลูกค้าทั้งหมด
        </button>
        {canEdit && (
          <button
            onClick={() => setActiveTab("create")}
            className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
          >
            + เพิ่มลูกค้าใหม่
          </button>
        )}
      </div>

      {activeTab === "create" && (
        <div className="glass-panel p-[18px]">
          <h3 className="font-semibold text-[var(--text)] border-b border-[var(--border)] pb-3 mb-6">
            เพิ่มลูกค้าใหม่ (New Customer)
          </h3>
          <form onSubmit={handleSubmit}>
            <div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
            >
              <div className="form-group">
                <label>
                  รหัสลูกค้า (AR Code){" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="arCode"
                  value={formData.arCode}
                  onChange={handleChange}
                  required
                  placeholder="เช่น AR-001"
                  className="premium-input w-full font-mono"
                />
              </div>
              <div className="form-group">
                <label>
                  ชื่อบริษัท / ลูกค้า{" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="ชื่อบริษัท..."
                  className="premium-input w-full"
                />
              </div>
              <div className="form-group col-span-2">
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
                  placeholder="เลข 13 หลัก"
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
                  rows={2}
                  placeholder="ที่อยู่สำหรับออกเอกสาร..."
                  className="premium-input w-full"
                  style={{
                    height: "80px",
                    padding: "10px 12px",
                    resize: "none",
                  }}
                ></textarea>
              </div>
              <div className="form-group col-span-2">
                <label>
                  ชื่อแบรนด์สินค้า (Brands){" "}
                  <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  name="brandsStr"
                  value={formData.brandsStr}
                  onChange={handleChange}
                  required
                  placeholder="คั่นด้วยลูกน้ำ (,) เช่น Brand A, Brand B"
                  className="premium-input w-full"
                />
                <span className="text-[11px] text-[var(--text-3)] mt-1">
                  ใส่ได้หลายแบรนด์ คั่นด้วยลูกน้ำ (,)
                </span>
              </div>

              <div className="form-group col-span-2">
                <label>อัปโหลดแผนที่ลูกค้า (Map PDF/Image)</label>
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(e) => setMapFile(e.target.files[0])}
                  className="premium-input w-full"
                  style={{ padding: "6px" }}
                />
                <span className="text-[11px] text-[var(--text-3)] mt-1">
                  รองรับไฟล์ .pdf, .png, .jpg
                </span>
              </div>
            </div>

            <div className="flex justify-end mt-8 pt-6 border-t border-[var(--border)] ">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary px-8"
              >
                {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูลลูกค้า"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer List */}
      {activeTab === "list" &&
        (loading ? (
          <div className="flex justify-center p-12">
            <svg
              className="animate-spin h-8 w-8 text-[var(--accent)]"
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
          </div>
        ) : (
          <div className="glass-panel">
            <div className="px-4 py-3.5 border-b border-[var(--border)] ">
              <h3 className="font-semibold text-sm text-[var(--text)] ">
                ฐานข้อมูลลูกค้า ({customers.length} รายการ)
              </h3>
            </div>
            <div className="premium-table-wrapper border-none rounded-t-none">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รหัสลูกค้า</th>
                    <th>ชื่อลูกค้า / บริษัท</th>
                    <th>แบรนด์ทั้งหมด</th>
                    <th>ที่อยู่ / แผนที่</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="text-center py-10 text-[var(--text-3)]"
                      >
                        ยังไม่มีข้อมูลลูกค้าในระบบ
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() =>
                          (window.location.href = `/customers/${c.id}`)
                        }
                        className="clickable-row"
                      >
                        <td className="font-semibold font-mono text-[var(--accent)] ">
                          {c.arCode}
                        </td>
                        <td>
                          <div className="font-medium text-[var(--text)] ">
                            {c.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-3)] font-mono mt-1">
                            Tax ID: {c.taxId}
                          </div>
                        </td>
                        <td className="text-[var(--text-2)] ">
                          <div className="flex flex-wrap gap-1.5">
                            {c.brands?.map((b, i) => (
                              <span
                                key={i}
                                className="bg-[var(--panel-2)] px-2 py-0.5 rounded text-[11px] text-[var(--text-2)] "
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-[var(--text-2)] max-w-[250px]">
                          <div className="text-[11px] mb-1 whitespace-normal leading-relaxed">
                            {c.address}
                          </div>
                          {c.mapFileUrl && (
                            <a
                              href={c.mapFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className="w-3 h-3"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                />
                              </svg>
                              ดูแผนที่
                            </a>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}

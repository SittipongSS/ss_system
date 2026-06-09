"use client";
import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
export default function LegalDashboard() {
  const canApprove = useCan("legal:approve");
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/products"));
  const [activeTab, setActiveTab] = useState("pending");

  const fetchProducts = async () => {
    const res = await fetch("/api/products");
    if (res.ok) {
      const data = await res.json();
      apiCache.set("/api/products", data);
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const formatMoney = (amount) =>
    amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });

  const handleRegister = async (id) => {
    if (
      !confirm(
        "ยืนยันอนุมัติรหัสสินค้านี้เข้าสู่ระบบ (พร้อมให้ Sales เปิดบิลได้)?",
      )
    )
      return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) fetchProducts();
    } catch (err) {
      alert("Error updating status");
    }
  };

  const pendingProducts = products.filter((p) => p.status === "pending_legal");
  const approvedProducts = products.filter((p) => p.status === "approved");

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
              <Scale size={22} />
            </span>{" "}
            Legal Dashboard
          </h1>
          <p>ตรวจสอบคำนวณราคาและขึ้นทะเบียนสินค้า (Master Data)</p>
        </div>
        <div className="pill warn">
          <span className="relative flex h-2.5 w-2.5 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--amber)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--amber)]"></span>
          </span>
          รออนุมัติ{" "}
          <strong className="font-mono ml-1">{pendingProducts.length}</strong>{" "}
          รายการ
        </div>
      </div>

      <div className="tabs-header">
        <button
          onClick={() => setActiveTab("pending")}
          className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
        >
          สินค้าใหม่รออนุมัติ ({pendingProducts.length})
        </button>
        <button
          onClick={() => setActiveTab("approved")}
          className={`tab-btn ${activeTab === "approved" ? "active" : ""}`}
        >
          คลังสินค้าที่อนุมัติแล้ว ({approvedProducts.length})
        </button>
      </div>

      {loading ? (
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
        <>
          {activeTab === "pending" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)] ">
                <h3 className="font-semibold text-sm text-[var(--text)] ">
                  สินค้าใหม่รออนุมัติ (Pending Approval)
                </h3>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>รหัสสินค้า (FG Code)</th>
                      <th>ปริมาตร</th>
                      <th className="num">กำไร/ชิ้น</th>
                      <th className="num">ภาษี/ชิ้น</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="text-center py-10 text-[var(--text-3)]"
                        >
                          ไม่มีรายการค้าง
                        </td>
                      </tr>
                    ) : (
                      pendingProducts.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() =>
                            (window.location.href = `/products/${p.id}`)
                          }
                          className="clickable-row"
                        >
                          <td>
                            <div className="font-semibold text-[var(--text)] font-mono">
                              {p.fgCode}
                            </div>
                            <div className="text-[11px] text-[var(--text-3)] mt-1">
                              {p.productDescription} ({p.brandName})
                            </div>
                            {p.mapFileUrl && (
                              <a
                                href={p.mapFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded"
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
                                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                                  />
                                </svg>
                                ดูไฟล์แผนที่
                              </a>
                            )}
                          </td>
                          <td className="text-[var(--text-2)] font-mono">
                            {p.volume} ml
                          </td>
                          <td className="num mono">
                            {formatMoney(p.factoryProfit)}
                          </td>
                          <td className="num mono">
                            {p.isExciseTaxable !== false ? (
                              formatMoney(p.exciseTax + p.localTax)
                            ) : (
                              <span className="status-pill">
                                ไม่ต้องเสียภาษี
                              </span>
                            )}
                          </td>
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canApprove ? (
                              <button
                                onClick={() => handleRegister(p.id)}
                                className="btn btn-primary px-4"
                              >
                                อนุมัติสินค้า
                              </button>
                            ) : (
                              <span className="text-[var(--text-3)] text-xs">
                                รอฝ่ายกฎหมาย
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "approved" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)] ">
                <h3 className="font-semibold text-sm text-[var(--text)] ">
                  คลังสินค้าที่อนุมัติแล้ว (Approved Master Data)
                </h3>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>รหัสสินค้า (FG)</th>
                      <th>ลูกค้า</th>
                      <th className="num">อัตราภาษี/ชิ้น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedProducts.slice(0, 10).map((p) => (
                      <tr
                        key={p.id}
                        onClick={() =>
                          (window.location.href = `/products/${p.id}`)
                        }
                        className="clickable-row"
                      >
                        <td className="font-mono text-[var(--text-2)] ">
                          {p.fgCode}{" "}
                          <span className="font-sans ml-2 text-[var(--text-3)] ">
                            {p.productDescription}
                          </span>
                        </td>
                        <td className="text-[var(--text-2)] ">
                          {p.customerName}
                        </td>
                        <td className="num font-mono text-[var(--text-2)] ">
                          {p.isExciseTaxable === false
                            ? "-"
                            : formatMoney(p.exciseTax + p.localTax)}
                        </td>
                      </tr>
                    ))}
                    {approvedProducts.length === 0 && (
                      <tr>
                        <td
                          colSpan="3"
                          className="text-center py-10 text-[var(--text-3)]"
                        >
                          ยังไม่มีสินค้าที่อนุมัติ
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

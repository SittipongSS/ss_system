"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { apiCache } from "@/lib/apiCache";

export default function TrackingHistory() {
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/products") && apiCache.has("/api/orders")),
  );
  const [activeTab, setActiveTab] = useState("products");

  const fetchData = async () => {
    try {
      const [resProducts, resOrders] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/orders"),
      ]);
      if (resProducts.ok && resOrders.ok) {
        const [p, o] = await Promise.all([resProducts.json(), resOrders.json()]);
        apiCache.set("/api/products", p);
        apiCache.set("/api/orders", o);
        setProducts(p);
        setOrders(o);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatMoney = (amount) =>
    amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <Clock size={22} />
            </span>{" "}
            Tracking History
          </h1>
          <p>ประวัติการขึ้นทะเบียนสินค้าและประวัติรอบจัดส่งทั้งหมด</p>
        </div>
      </div>

      <div className="tabs-header">
        <button
          onClick={() => setActiveTab("products")}
          className={`tab-btn ${activeTab === "products" ? "active" : ""}`}
        >
          ประวัติการขึ้นทะเบียนสินค้า (Products)
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
        >
          ประวัติรอบจัดส่ง (Shipments)
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <svg
            className="animate-spin h-8 w-8 text-[var(--text-3)]"
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
          {activeTab === "products" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)] ">
                <h3 className="font-semibold text-sm text-[var(--text)] ">
                  ประวัติสินค้าในระบบ ({products.length} รายการ)
                </h3>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>วันที่ส่งคำขอ</th>
                      <th>สินค้า (FG Code)</th>
                      <th>สถานะล่าสุด</th>
                      <th>ผู้สร้างคำขอ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="text-center py-10 text-[var(--text-3)]"
                        >
                          ไม่มีข้อมูล
                        </td>
                      </tr>
                    ) : (
                      products.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() =>
                            (window.location.href = `/products/${p.id}`)
                          }
                          className="clickable-row"
                        >
                          <td className="text-[var(--text-2)] text-xs font-mono">
                            {new Date(p.createdAt).toLocaleString("th-TH")}
                          </td>
                          <td>
                            <div className="font-semibold text-[var(--text)] font-mono">
                              {p.fgCode}
                            </div>
                            <div className="text-[11px] text-[var(--text-3)] mt-1">
                              {p.productDescription}
                            </div>
                          </td>
                          <td>
                            {p.status === "approved" ? (
                              <span className="status-pill success flex items-center gap-1 w-fit">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Approved (Master Data)
                              </span>
                            ) : (
                              <span className="status-pill info flex items-center gap-1 w-fit">
                                Pending Legal
                              </span>
                            )}
                          </td>
                          <td className="text-[var(--text-2)] text-xs">
                            {p.assignee || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)] ">
                <h3 className="font-semibold text-sm text-[var(--text)] ">
                  ประวัติจัดส่งและชำระภาษีทั้งหมด ({orders.length} รายการ)
                </h3>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>วันที่สร้าง Order</th>
                      <th>Ref. Quotation / วันเคลียร์ภาษี</th>
                      <th>สินค้า (FG Code)</th>
                      <th className="num">ยอดเก็บภาษีรวม</th>
                      <th className="text-center">สถานะชำระเงิน</th>
                      <th>ผู้รับผิดชอบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="text-center py-10 text-[var(--text-3)]"
                        >
                          ไม่มีข้อมูล
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => {
                        const p = o.product;
                        const isExempt = p?.isExciseTaxable === false;
                        return (
                          <tr
                            key={o.id}
                            onClick={() =>
                              (window.location.href = `/products/${o.productId}`)
                            }
                            className="clickable-row"
                          >
                            <td className="text-[var(--text-2)] text-xs font-mono">
                              {new Date(o.createdAt).toLocaleString("th-TH")}
                            </td>
                            <td>
                              <div className="font-semibold text-[var(--text)] ">
                                {o.quotationRef}
                              </div>
                              {o.status === "cleared" && o.clearedAt && (
                                <div className="text-[10px] text-[var(--green)] mt-1 font-mono">
                                  เคลียร์:{" "}
                                  {new Date(o.clearedAt).toLocaleString(
                                    "th-TH",
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="font-semibold text-[var(--text)] font-mono">
                                {p?.fgCode || "-"}
                              </div>
                              <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                                จำนวน:{" "}
                                <span className="font-mono font-bold text-[var(--text-2)] ">
                                  {o.quantity}
                                </span>{" "}
                                ชิ้น
                              </div>
                            </td>
                            <td className="num font-bold font-mono text-[var(--text-2)] ">
                              {isExempt ? (
                                <span className="status-pill success text-xs font-sans">
                                  ยกเว้นภาษี
                                </span>
                              ) : (
                                formatMoney(o.totalTax)
                              )}
                            </td>
                            <td className="text-center">
                              {o.status === "cleared" ? (
                                <span className="status-pill success flex items-center gap-1 mx-auto w-fit">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2.5}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                  ชำระแล้ว (ปล่อยของได้)
                                </span>
                              ) : (
                                <span className="status-pill danger flex items-center gap-1 mx-auto w-fit">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2.5}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                  ค้างชำระ (ห้ามปล่อยของ)
                                </span>
                              )}
                            </td>
                            <td className="text-[var(--text-2)] text-xs font-semibold">
                              {o.assignee || "-"}
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
        </>
      )}
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Scale, Search } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import ProductStatusPill from "@/components/ProductStatusPill";
import ApproveProductModal from "@/components/ApproveProductModal";
import RejectModal from "@/components/RejectModal";

// LG product-registration workspace. Tax filing now lives on /legal/tax.
export default function LegalRegistration() {
  const canApprove = useCan("legal:approve");
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/products"));
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const p = await res.json();
        apiCache.set("/api/products", p);
        setProducts(p);
      }
    } catch (err) {
      console.error("Error fetching products", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReject = async (reason) => {
    const res = await fetch(`/api/products/${rejectTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
    if (res.ok) {
      setRejectTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      alert("เกิดข้อผิดพลาด: " + (d.error || "ไม่สามารถทำรายการได้"));
    }
  };

  const pendingProducts = products.filter((p) => p.status === "pending_legal");
  const approvedProducts = products.filter((p) => p.status === "approved");
  const rejectedProducts = products.filter((p) => p.status === "rejected");

  const q = search.trim().toLowerCase();
  const filteredApproved = q
    ? approvedProducts.filter((p) =>
        [p.fgCode, p.productDescription, p.brandName, p.customerName, p.approvalNumber]
          .some((v) => (v || "").toLowerCase().includes(q)),
      )
    : approvedProducts;

  const taxPerUnit = (p) => (p.isExciseTaxable === false ? 0 : (p.exciseTax || 0) + (p.localTax || 0));

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>
            <span className="premium-header-icon"><Scale size={22} /></span> ขึ้นทะเบียนสินค้า
          </h1>
          <p>ตรวจสอบและอนุมัติสินค้าใหม่เข้าสู่ระบบภาษีสรรพสามิต</p>
        </div>
        <div className="pill warn">
          <span className="relative flex h-2.5 w-2.5 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--amber)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--amber)]"></span>
          </span>
          รออนุมัติ <strong className="font-mono ml-1">{pendingProducts.length}</strong> รายการ
        </div>
      </div>

      <div className="tabs-header">
        <button onClick={() => setActiveTab("pending")} className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}>
          สินค้าใหม่รออนุมัติ ({pendingProducts.length})
        </button>
        <button onClick={() => setActiveTab("approved")} className={`tab-btn ${activeTab === "approved" ? "active" : ""}`}>
          คลังสินค้าที่อนุมัติแล้ว ({approvedProducts.length})
        </button>
        <button onClick={() => setActiveTab("rejected")} className={`tab-btn ${activeTab === "rejected" ? "active" : ""}`}>
          ตีกลับให้แก้ไข ({rejectedProducts.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {/* ── Pending approval ── */}
          {activeTab === "pending" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)]">
                <h3 className="font-semibold text-sm text-[var(--text)]">สินค้าใหม่รออนุมัติ (Pending Approval)</h3>
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
                      <tr><td colSpan="5" className="text-center py-10 text-[var(--text-3)]">ไม่มีรายการค้าง</td></tr>
                    ) : (
                      pendingProducts.map((p) => (
                        <tr key={p.id} onClick={() => (window.location.href = `/products/${p.id}`)} className="clickable-row">
                          <td>
                            <div className="font-semibold text-[var(--text)] font-mono">{p.fgCode}</div>
                            <div className="text-[11px] text-[var(--text-3)] mt-1">{p.productDescription} ({p.brandName})</div>
                            {p.mapFileUrl && (
                              <a href={p.mapFileUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded">
                                ดูไฟล์แผนที่
                              </a>
                            )}
                          </td>
                          <td className="text-[var(--text-2)] font-mono">{p.volume} ml</td>
                          <td className="num mono">{fmtMoney(p.factoryProfit)}</td>
                          <td className="num mono">
                            {p.isExciseTaxable !== false ? fmtMoney(taxPerUnit(p)) : <span className="status-pill">ไม่ต้องเสียภาษี</span>}
                          </td>
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            {canApprove ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => setApproveTarget(p)} className="btn btn-primary px-4">อนุมัติ</button>
                                <button onClick={() => setRejectTarget(p)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
                              </div>
                            ) : (
                              <span className="text-[var(--text-3)] text-xs">รอฝ่ายกฎหมาย</span>
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

          {/* ── Approved master data (searchable) ── */}
          {activeTab === "approved" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm text-[var(--text)]">คลังสินค้าที่อนุมัติแล้ว ({filteredApproved.length})</h3>
                <div className="search-bar" style={{ maxWidth: 280 }}>
                  <Search size={15} className="icon-l" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา FG / ลูกค้า / เลขอนุมัติ..." />
                </div>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>รหัสสินค้า (FG)</th>
                      <th>ลูกค้า</th>
                      <th>เลขที่อนุมัติ</th>
                      <th className="num">อัตราภาษี/ชิ้น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApproved.length === 0 ? (
                      <tr><td colSpan="4" className="text-center py-10 text-[var(--text-3)]">{q ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีสินค้าที่อนุมัติ"}</td></tr>
                    ) : (
                      filteredApproved.map((p) => (
                        <tr key={p.id} onClick={() => (window.location.href = `/products/${p.id}`)} className="clickable-row">
                          <td className="font-mono text-[var(--text-2)]">
                            {p.fgCode} <span className="font-sans ml-2 text-[var(--text-3)]">{p.productDescription}</span>
                          </td>
                          <td className="text-[var(--text-2)]">{p.customerName}</td>
                          <td className="font-mono text-[var(--text-3)] text-xs">{p.approvalNumber || "-"}</td>
                          <td className="num font-mono text-[var(--text-2)]">
                            {p.isExciseTaxable === false ? "-" : fmtMoney(taxPerUnit(p))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Rejected ── */}
          {activeTab === "rejected" && (
            <div className="glass-panel">
              <div className="px-4 py-3.5 border-b border-[var(--border)]">
                <h3 className="font-semibold text-sm text-[var(--text)]">สินค้าที่ตีกลับให้แก้ไข ({rejectedProducts.length})</h3>
              </div>
              <div className="premium-table-wrapper border-none rounded-t-none">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>รหัสสินค้า (FG)</th>
                      <th>ลูกค้า</th>
                      <th>เหตุผลที่ตีกลับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectedProducts.length === 0 ? (
                      <tr><td colSpan="3" className="text-center py-10 text-[var(--text-3)]">ไม่มีรายการตีกลับ</td></tr>
                    ) : (
                      rejectedProducts.map((p) => (
                        <tr key={p.id} onClick={() => (window.location.href = `/products/${p.id}`)} className="clickable-row">
                          <td className="font-mono text-[var(--text-2)]">
                            {p.fgCode} <span className="font-sans ml-2 text-[var(--text-3)]">{p.productDescription}</span>
                          </td>
                          <td className="text-[var(--text-2)]">{p.customerName}</td>
                          <td className="text-xs text-[var(--red)]">{p.rejectionReason || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <ApproveProductModal
        open={!!approveTarget}
        product={approveTarget}
        onClose={() => setApproveTarget(null)}
        onApproved={fetchData}
      />
      <RejectModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="ตีกลับสินค้าให้แก้ไข"
        entityLabel="สินค้านี้"
      />
    </>
  );
}

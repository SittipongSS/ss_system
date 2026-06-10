"use client";
import { useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDate } from "@/lib/format";
import OrderDetailModal from "@/components/OrderDetailModal";
import FileTaxModal from "@/components/FileTaxModal";
import RejectModal from "@/components/RejectModal";

// LG tax-filing workspace: received → filing → complete (+ rejected).
export default function LegalTax() {
  const canApprove = useCan("legal:approve");
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/orders"));
  const [activeTab, setActiveTab] = useState("received");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [fileTarget, setFileTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const o = await res.json();
        apiCache.set("/api/orders", o);
        setOrders(o);
      }
    } catch (err) {
      console.error("Error fetching orders", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const patch = async (id, body, errMsg) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      fetchData();
      return true;
    }
    const d = await res.json().catch(() => ({}));
    alert("เกิดข้อผิดพลาด: " + (d.error || errMsg || "ไม่สามารถทำรายการได้"));
    return false;
  };

  const handleStartFiling = (id) => {
    if (!confirm("เริ่มดำเนินการยื่นภาษีสำหรับรายการนี้?")) return;
    patch(id, { status: "filing" });
  };

  const handleSetDue = (id, value) => patch(id, { taxDueDate: value });

  const handleReject = async (reason) => {
    const ok = await patch(rejectTarget.id, { status: "rejected", rejectionReason: reason });
    if (ok) setRejectTarget(null);
  };

  const received = orders.filter((o) => o.status === "received");
  const filing = orders.filter((o) => o.status === "filing");
  const complete = orders.filter((o) => o.status === "complete");
  const rejected = orders.filter((o) => o.status === "rejected");

  const TABS = [
    { key: "received", label: "รอยื่น", list: received },
    { key: "filing", label: "กำลังยื่น", list: filing },
    { key: "complete", label: "ชำระแล้ว", list: complete },
    { key: "rejected", label: "ตีกลับ", list: rejected },
  ];

  const taxCell = (o) =>
    (o.totalTax || 0) === 0 ? (
      <span className="status-pill success text-xs font-sans">ยกเว้นภาษี</span>
    ) : (
      <span className="num font-bold text-[var(--red)] font-mono">{fmtMoney(o.totalTax)}</span>
    );

  const rowHeader = (o) => (
    <td>
      <div className="font-semibold text-[var(--text)]">{o.quotationRef}</div>
      {o.poReference && <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>}
    </td>
  );

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>
            <span className="premium-header-icon"><ReceiptText size={22} /></span> อนุมัติชำระภาษี
          </h1>
          <p>ตรวจอนุมัติและยื่นชำระภาษีสรรพสามิต พร้อมบันทึกใบเสร็จกรมสรรพสามิต</p>
        </div>
        <div className="pill warn">
          รอดำเนินการ <strong className="font-mono ml-1">{received.length + filing.length}</strong> รายการ
        </div>
      </div>

      <div className="tabs-header">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`tab-btn ${activeTab === t.key ? "active" : ""}`}>
            {t.label} ({t.list.length})
          </button>
        ))}
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
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>เลขที่ใบเสนอราคา</th>
                  <th className="text-center">รายการ</th>
                  <th className="num">ยอดภาษีรวม</th>
                  {activeTab === "received" && <th>กำหนดยื่น</th>}
                  {activeTab === "complete" && <th>ใบเสร็จสรรพสามิต</th>}
                  {activeTab === "rejected" && <th>เหตุผล</th>}
                  {activeTab !== "rejected" && <th className="text-center">Action</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const list = TABS.find((t) => t.key === activeTab).list;
                  const cols = activeTab === "received" || activeTab === "complete" ? 5 : 4;
                  if (list.length === 0) {
                    return <tr><td colSpan={cols} className="text-center py-10 text-[var(--text-3)]">ไม่มีรายการ</td></tr>;
                  }
                  return list.map((o) => {
                    const isExempt = (o.totalTax || 0) === 0;
                    return (
                      <tr key={o.id} className="clickable-row" onClick={() => setSelectedOrder(o)}>
                        {rowHeader(o)}
                        <td className="text-center font-mono font-semibold">{o.items?.length || 0}</td>
                        <td className="num">{taxCell(o)}</td>

                        {activeTab === "received" && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="date"
                              value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""}
                              onChange={(e) => handleSetDue(o.id, e.target.value)}
                              disabled={!canApprove}
                              className="premium-input text-xs"
                              style={{ maxWidth: 150 }}
                            />
                          </td>
                        )}
                        {activeTab === "complete" && (
                          <td className="font-mono text-xs text-[var(--text-2)]">
                            {o.exciseReceiptNumber || (isExempt ? "ยกเว้น" : "-")}
                            {o.filedAt && <div className="text-[var(--text-3)]">{fmtDate(o.filedAt)}</div>}
                          </td>
                        )}
                        {activeTab === "rejected" && (
                          <td className="text-xs text-[var(--red)]">{o.rejectionReason || "-"}</td>
                        )}

                        {activeTab === "received" && (
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            {canApprove ? (
                              <div className="flex items-center justify-center gap-2">
                                {isExempt ? (
                                  <button onClick={() => setFileTarget(o)} className="btn btn-primary px-4">ยืนยันชำระ</button>
                                ) : (
                                  <button onClick={() => handleStartFiling(o.id)} className="btn btn-primary px-4">เริ่มยื่น</button>
                                )}
                                <button onClick={() => setRejectTarget(o)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
                              </div>
                            ) : <span className="text-[var(--text-3)] text-xs">รอฝ่ายกฎหมาย</span>}
                          </td>
                        )}
                        {activeTab === "filing" && (
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            {canApprove ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => setFileTarget(o)} className="btn btn-primary px-4">บันทึกชำระภาษี</button>
                                <button onClick={() => setRejectTarget(o)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
                              </div>
                            ) : <span className="text-[var(--text-3)] text-xs">รอฝ่ายกฎหมาย</span>}
                          </td>
                        )}
                        {activeTab === "complete" && (
                          <td className="text-center"><span className="status-pill success text-xs">ชำระแล้ว</span></td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
      <FileTaxModal open={!!fileTarget} order={fileTarget} onClose={() => setFileTarget(null)} onFiled={fetchData} />
      <RejectModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="ตีกลับใบสั่งซื้อให้แก้ไข"
        entityLabel="ใบสั่งซื้อนี้"
      />
    </>
  );
}

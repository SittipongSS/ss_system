"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck, Search, LayoutGrid, Table2, ChevronRight } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import ApproveProductModal from "@/components/ApproveProductModal";
import RejectModal from "@/components/RejectModal";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import TaxStageRail from "@/components/tax/TaxStageRail";
import StagePill from "@/components/tax/StagePill";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { TRACK1, deptOf } from "@/lib/tax/status";

// LG registration-approval workspace (Track 1). SA submits product+customer
// registrations; LG approves or bounces them here. Redesigned: stage rail
// (LG lane highlighted) + card/table responsive list. Modals/API unchanged.
export default function LegalRegistration() {
  const role = useRole();
  const dept = deptOf(role);
  const canApprove = useCan("legal:approve");
  const [regs, setRegs] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/excise-registrations"));
  const [statusFilter, setStatusFilter] = useState("pending_legal");
  const [search, setSearch] = useState("");
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/excise-registrations");
      if (res.ok) {
        const p = await res.json();
        apiCache.set("/api/excise-registrations", p);
        setRegs(p);
      }
    } catch (err) {
      console.error("Error fetching registrations", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleReject = async (reason) => {
    const res = await fetch(`/api/excise-registrations/${rejectTarget.id}`, {
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

  const counts = {
    rejected: regs.filter((r) => r.status === "rejected").length,
    pending_legal: regs.filter((r) => r.status === "pending_legal").length,
    approved: regs.filter((r) => r.status === "approved").length,
  };

  const q = search.trim().toLowerCase();
  const list = regs.filter((r) => {
    if (r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.fgCode, r.productName, r.brandName, r.customerName, r.approvalNumber].some((v) => (v || "").toLowerCase().includes(q));
  });
  const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));
  const sort = useSortableTable(list, {
    fgCode: (r) => r.fgCode || "",
    customer: (r) => r.customerName || "",
    tax: taxPerUnit,
    approval: (r) => r.approvalNumber || "",
    rejectionReason: (r) => r.rejectionReason || "",
  });

  const open = (r) => (window.location.href = `/tax/register/${r.id}`);

  const rowActions = (r) => {
    if (r.status !== "pending_legal") return null;
    if (!canApprove) return <span className="text-[var(--text-3)] text-xs">รอฝ่ายกฎหมาย</span>;
    return (
      <>
        <button onClick={() => setApproveTarget(r)} className="btn btn-primary px-4">อนุมัติ</button>
        <button onClick={() => setRejectTarget(r)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
      </>
    );
  };

  const FILTERS = [
    { key: "pending_legal", label: `รออนุมัติ (${counts.pending_legal})` },
    { key: "approved", label: `อนุมัติแล้ว (${counts.approved})` },
    { key: "rejected", label: `ตีกลับ (${counts.rejected})` },
  ];

  const headerRight = (
    <span className="ui-badge warn">
      รออนุมัติ <strong className="font-mono ml-1">{counts.pending_legal}</strong>
    </span>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="segmented">
        {FILTERS.map((f) => (
          <button key={f.key} className={statusFilter === f.key ? "active" : ""} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="spacer" />
      <div className="search-glass" style={{ width: "220px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา FG / ลูกค้า / เลขอนุมัติ..." />
      </div>
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <TaxWorkspace
      icon={<ClipboardCheck size={22} />}
      title="อนุมัติขึ้นทะเบียน"
      subtitle="ตรวจสอบและอนุมัติการขึ้นทะเบียนภาษีสรรพสามิต (สินค้า + ลูกค้า)"
      headerRight={headerRight}
      loading={loading}
      rail={<TaxStageRail track={TRACK1} dept={dept} counts={counts} onStage={(k) => setStatusFilter(k)} />}
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {search ? "ไม่พบรายการที่ค้นหา" : "ไม่มีรายการในสถานะนี้"}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sort.sorted.map((r) => (
            <div key={r.id} onClick={() => open(r)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text)] font-mono text-sm">{r.fgCode}</div>
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5 truncate">{r.productName} ({r.brandName})</div>
                </div>
                <StagePill status={r.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-2)] truncate">{r.customerName}</span>
                <span className="font-mono text-[var(--text-2)]">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</span>
              </div>
              {r.status === "approved" && r.approvalNumber && (
                <div className="text-[11px] font-mono text-[var(--text-3)]">เลขอนุมัติ: {r.approvalNumber}</div>
              )}
              {r.status === "rejected" && r.rejectionReason && (
                <div className="text-[11px] text-[var(--red)] bg-[var(--red-soft)] rounded px-2 py-1">{r.rejectionReason}</div>
              )}
              {r.status === "pending_legal" && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
                  {rowActions(r)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel">
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="รหัสสินค้า (FG Code)" sortKey="fgCode" sort={sort} />
                  <SortTh label="ลูกค้า" sortKey="customer" sort={sort} />
                  {statusFilter !== "rejected" && <SortTh label="ภาษี/ชิ้น" sortKey="tax" sort={sort} className="num" />}
                  {statusFilter === "approved" && <SortTh label="เลขที่อนุมัติ" sortKey="approval" sort={sort} />}
                  {statusFilter === "rejected" && <SortTh label="เหตุผลที่ตีกลับ" sortKey="rejectionReason" sort={sort} />}
                  {statusFilter === "pending_legal" && <th className="text-center">Action</th>}
                </tr>
              </thead>
              <tbody>
                {sort.sorted.map((r) => (
                  <tr key={r.id} onClick={() => open(r)} className="clickable-row">
                    <td>
                      <div className="font-semibold text-[var(--text)] font-mono">{r.fgCode}</div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5">{r.productName} ({r.brandName})</div>
                    </td>
                    <td className="text-[var(--text-2)]">{r.customerName}</td>
                    {statusFilter !== "rejected" && (
                      <td className="num font-mono text-[var(--text-2)]">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</td>
                    )}
                    {statusFilter === "approved" && <td className="font-mono text-[var(--text-3)] text-xs">{r.approvalNumber || "-"}</td>}
                    {statusFilter === "rejected" && <td className="text-xs text-[var(--red)] max-w-[260px] whitespace-normal">{r.rejectionReason || "-"}</td>}
                    {statusFilter === "pending_legal" && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">{rowActions(r)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ApproveProductModal open={!!approveTarget} registration={approveTarget} onClose={() => setApproveTarget(null)} onApproved={fetchData} />
      <RejectModal open={!!rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={handleReject} title="ตีกลับการขึ้นทะเบียนให้แก้ไข" entityLabel="ทะเบียนนี้" />
    </TaxWorkspace>
  );
}

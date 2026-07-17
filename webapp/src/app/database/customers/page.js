"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Search, Filter, LayoutGrid, Table2, ChevronRight } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import CustomerForm, { EMPTY_CUSTOMER } from "@/components/database/CustomerForm";
import Workspace from "@/components/ui/Workspace";
import StatCards from "@/components/database/StatCards";
import ApprovalQueue from "@/components/database/ApprovalQueue";
import { brandTh, brandEn, brandBothOf } from "@/lib/master/brands";
import { fmtPhone, fmtNationalId } from "@/lib/format";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";
import { ApprovalBadge, ApprovalActions, approvalStatusOf } from "@/components/ApprovalStatus";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

// Management view sees every status (pending/approved/rejected); the default
// GET (used everywhere else) returns only approved rows.
const MANAGE_KEY = "/api/master/customers?manage=1";

// Caretaker teams of a customer (migration 0037). Falls back to the single
// `team` for rows not yet migrated.
const teamsOf = (c) => (c?.teams?.length ? c.teams : c?.team ? [c.team] : []);

export default function CustomerDirectory() {
  const canEdit = useCan("customers:edit");
  const role = useRole();
  const myTeam = useTeam();
  // May this user approve THIS record? Senior AE only own team; supervisor/admin
  // any team. Customers are a central registry (all teams shown in manage view),
  // so the team check matters here — hide the buttons for other teams' records.
  const canApproveRow = (rec) =>
    canApproveMasterData(role) && (isSuperuser(role) || teamsOf(rec).includes(myTeam));
  const [customers, setCustomers] = useState(() => apiCache.get(MANAGE_KEY) ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has(MANAGE_KEY));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  const [formData, setFormData] = useState(EMPTY_CUSTOMER);

  const fetchCustomers = async () => {
    try {
      const res = await fetch(MANAGE_KEY);
      if (res.ok) {
        const data = await res.json();
        apiCache.set(MANAGE_KEY, data);
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

  // Approve / reject a pending customer (Senior AE+ only — enforced server-side too).
  const decide = async (id, status) => {
    let rejectionReason = null;
    if (status === "rejected") {
      rejectionReason = window.prompt("เหตุผลที่ไม่อนุมัติ (ใส่หรือเว้นว่างก็ได้):", "");
      if (rejectionReason === null) return; // ยกเลิก
    }
    try {
      const res = await fetch(`/api/master/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: status, rejectionReason }),
      });
      if (res.ok) fetchCustomers();
      else alert((await res.json()).error || "ดำเนินการไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาดในการอนุมัติ");
    }
  };

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // แผนที่/เอกสารแนบเพิ่มทีหลังที่หน้าลูกค้า (ส่วน "เอกสารของลูกค้า").
    const payload = {
      arCode: formData.arCode,
      name: formData.name,
      customerType: formData.customerType || "company",
      taxId: formData.taxId,
      branchCode: formData.branchCode || "00000",
      phone: formData.phone,
      address: formData.address,
      shippingAddress: formData.shippingAddress || null,
      brands: formData.brands || [], // [{th,en}] — API normalize อีกชั้น (0059)
      contacts: formData.contacts || [],
      creditTerms: formData.creditTerms || null,
    };

    try {
      const res = await fetch("/api/master/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setFormData(EMPTY_CUSTOMER);
        setShowForm(false);
        fetchCustomers();
        if (created?.approvalStatus === "pending") {
          alert("บันทึกแล้ว — รอ Senior AE ขึ้นไปอนุมัติก่อนจึงจะนำลูกค้ารายนี้ไปใช้งานได้");
        }
      } else {
        const errorData = await res.json();
        alert(errorData.error || "เกิดข้อผิดพลาด");
      }
    } catch (err) {
      alert("Error adding customer");
    }
    setIsSubmitting(false);
  };

  const q = search.trim().toLowerCase();
  const counts = {
    pending: customers.filter((c) => approvalStatusOf(c) === "pending").length,
    approved: customers.filter((c) => approvalStatusOf(c) === "approved").length,
    rejected: customers.filter((c) => approvalStatusOf(c) === "rejected").length,
    inactive: customers.filter((c) => c.isActive === false).length,
  };

  // Distinct teams present — the team filter only appears when this user can see
  // more than one (supervisor/admin); team-scoped roles see a single team.
  const teams = useMemo(
    () => [...new Set(customers.flatMap((c) => teamsOf(c)).filter(Boolean))].sort(),
    [customers],
  );
  const filteredCustomers = customers.filter((c) => {
    if (!showInactive && c.isActive === false) return false;
    if (statusFilter !== "all" && approvalStatusOf(c) !== statusFilter) return false;
    if (teamFilter !== "all" && !teamsOf(c).includes(teamFilter)) return false;
    if (!q) return true;
    return [c.arCode, c.name, c.taxId, c.phone, ...(c.brands || []).flatMap((b) => [brandTh(b), brandEn(b)])]
      .some((v) => (v || "").toLowerCase().includes(q));
  });

  // Pending records this user may approve — surfaced at the top as a queue.
  const approvalQueue = customers.filter(
    (c) => approvalStatusOf(c) === "pending" && canApproveRow(c),
  );

  const sort = useSortableTable(filteredCustomers, {
    arCode: (c) => c.arCode || "",
    name: (c) => c.name || "",
    brands: (c) => c.brands?.length || 0,
    address: (c) => c.address || "",
  });

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      resetKey: `${q}|${statusFilter}|${teamFilter}|${showInactive}|${sort.sortKey}|${sort.sortDir}`,
    });

  const open = (c) => (window.location.href = `/database/customers/${c.id}`);

  const headerRight = (
    <>
      <span className="ui-badge">{customers.length} รายการ</span>
      {canEdit && (
        <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={16} /> เพิ่มลูกค้า
        </button>
      )}
    </>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="search-glass" style={{ width: "240px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า / AR / แบรนด์..." />
      </div>
      <div className="spacer" />
      <span className="toolbar-label"><Filter size={14} /> กรอง</span>
      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" style={{ width: "auto" }}>
        <option value="all">ทุกสถานะ</option>
        <option value="pending">รออนุมัติ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="rejected">ไม่อนุมัติ</option>
      </Select>
      {teams.length > 1 && (
        <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="premium-select" style={{ width: "auto" }}>
          <option value="all">ทุกทีม</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      )}
      {counts.inactive > 0 && (
        <button type="button" onClick={() => setShowInactive((v) => !v)} className={`btn ${showInactive ? "btn-primary" : ""}`} title="แสดง/ซ่อนลูกค้าที่เลิกใช้">
          {showInactive ? "ซ่อนที่เลิกใช้" : `แสดงที่เลิกใช้ (${counts.inactive})`}
        </button>
      )}
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <Workspace
      icon={<Building2 size={22} />}
      title="ข้อมูลลูกค้า"
      subtitle="ฐานข้อมูลลูกค้าและแบรนด์กลาง (AR Code & Brands)"
      headerRight={headerRight}
      loading={loading}
      rail={
        <>
          <StatCards
            items={[
              { label: "ทั้งหมด", value: customers.length },
              { label: "รออนุมัติ", value: counts.pending, tone: counts.pending ? "warn" : undefined },
              { label: "อนุมัติแล้ว", value: counts.approved, tone: "success" },
              { label: "ไม่อนุมัติ", value: counts.rejected, tone: counts.rejected ? "danger" : undefined },
            ]}
          />
          <ApprovalQueue
            items={approvalQueue}
            onDecide={decide}
            primary={(c) => c.arCode}
            secondary={(c) => `${c.name}${teamsOf(c).length ? ` · ทีม ${teamsOf(c).join("/")}` : ""}`}
            onOpen={open}
          />
        </>
      }
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {q || statusFilter !== "all" || teamFilter !== "all" ? "ไม่พบลูกค้าที่ค้นหา" : "ยังไม่มีข้อมูลลูกค้าในระบบ"}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pageRows.map((c) => {
            const status = approvalStatusOf(c);
            const showActions = status === "pending" && canApproveRow(c);
            const inactive = c.isActive === false;
            return (
              <div key={c.id} onClick={() => open(c)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2" style={inactive ? { opacity: 0.6 } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--accent)] font-mono text-sm">{c.arCode}</div>
                    <div className="text-[13px] font-medium text-[var(--text)] mt-0.5 truncate">{c.name}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ApprovalBadge status={status} />
                    {inactive && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                  </div>
                </div>
                <div className="text-[11px] text-[var(--text-3)] font-mono">
                  Tax {c.taxId ? fmtNationalId(c.taxId) : "-"}{teamsOf(c).length ? ` · ทีม ${teamsOf(c).join(", ")}` : ""}
                </div>
                {c.brands?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.brands.slice(0, 4).map((b, i) => (
                      <span key={i} className="bg-[var(--panel-2)] px-2 py-0.5 rounded text-[11px] text-[var(--text-2)]">{brandBothOf(b)}</span>
                    ))}
                    {c.brands.length > 4 && <span className="text-[11px] text-[var(--text-3)] px-1">+{c.brands.length - 4}</span>}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <span className="text-[11px] text-[var(--text-3)] truncate max-w-[70%]">{c.address || "—"}</span>
                  {showActions ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <ApprovalActions onDecide={(s) => decide(c.id, s)} />
                    </div>
                  ) : <ChevronRight size={16} className="text-[var(--text-3)]" />}
                </div>
                {status === "rejected" && c.rejectionReason && (
                  <div className="text-[11px] text-[var(--text-3)] whitespace-normal">เหตุผล: {c.rejectionReason}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel">
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="รหัสลูกค้า" sortKey="arCode" sort={sort} />
                  <SortTh label={CUSTOMER_NAME_LABEL} sortKey="name" sort={sort} />
                  <SortTh label="แบรนด์ (EN/TH)" sortKey="brands" sort={sort} />
                  <SortTh label="ที่อยู่" sortKey="address" sort={sort} />
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => (
                  <tr key={c.id} onClick={() => open(c)} className="clickable-row" style={c.isActive === false ? { opacity: 0.55 } : undefined}>
                    <td className="font-semibold font-mono text-[var(--accent)]">{c.arCode}</td>
                    <td>
                      <div className="font-medium text-[var(--text)]">{c.name}</div>
                      <div className="text-[11px] text-[var(--text-3)] font-mono mt-1">Tax ID: {c.taxId ? fmtNationalId(c.taxId) : "-"}</div>
                      {c.phone && <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">โทร: {fmtPhone(c.phone)}</div>}
                    </td>
                    <td className="text-[var(--text-2)]">
                      <div className="flex flex-wrap gap-1.5">
                        {c.brands?.map((b, i) => (
                          <span key={i} className="bg-[var(--panel-2)] px-2 py-0.5 rounded text-[11px] text-[var(--text-2)]">{brandBothOf(b)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-[var(--text-2)] max-w-[250px]">
                      <div className="text-[11px] whitespace-normal leading-relaxed">{c.address}</div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {approvalStatusOf(c) === "pending" && canApproveRow(c) ? (
                        <ApprovalActions onDecide={(status) => decide(c.id, status)} />
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <ApprovalBadge status={approvalStatusOf(c)} />
                          {c.isActive === false && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                          {approvalStatusOf(c) === "rejected" && c.rejectionReason && (
                            <div className="text-[11px] text-[var(--text-3)] mt-1 max-w-[200px] whitespace-normal">เหตุผล: {c.rejectionReason}</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sort.sorted.length > 0 && (
        <Pager
          page={page}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={setPageSize}
        />
      )}

      {/* Add customer modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="เพิ่มลูกค้าใหม่ (New Customer)"
        size="md"
      >
        <form onSubmit={handleSubmit}>
          {/* ฟอร์มเดียวกับโมดัลแก้ไข (หน้า [id]) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง.
              ไม่มีช่อง "ทีมดูแล" ตอนสร้าง เพราะ server ตั้งทีมให้จากคนสร้าง */}
          <CustomerForm form={formData} onForm={(patch) => setFormData((f) => ({ ...f, ...patch }))} />
          <div className="form-action-bar">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary px-8"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูลลูกค้า"}
            </button>
          </div>
        </form>
      </Modal>
    </Workspace>
  );
}

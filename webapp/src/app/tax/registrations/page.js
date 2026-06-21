"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";

const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));

export default function RegistrationsPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("products:edit");   // SA: create / edit / resubmit / delete

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations");
  const { data: products } = useApiList("/api/products");
  const { data: customers } = useApiList("/api/customers");

  const [userName, setUserName] = useState("");
  // LG lands on their queue; everyone else sees all. A ?status= deep-link
  // (from the dashboard) overrides the default after mount.
  const [filter, setFilter] = useState(() => (deptOf(role) === "LG" ? "pending_legal" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && REGISTRATION_FILTERS.some((f) => f.key === s)) setFilter(s);
    // Legacy ?open=<id> deep-link → go straight to the detail page.
    const openId = params.get("open");
    if (openId) router.replace(`/tax/registrations/${openId}`);
  }, [router]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.approvalNumber]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search]);

  // After saving the form: a freshly created draft opens its full detail page so
  // the user lands on the attachment cards and can submit once they're complete.
  const handleSaved = async (saved, { created } = {}) => {
    await reload();
    if (created && saved?.id) router.push(`/tax/registrations/${saved.id}`);
  };

  const columns = [
    {
      key: "fgCode", label: "รหัสสินค้า (FG)",
      render: (r) => (
        <div>
          <div className="font-semibold font-mono">{r.fgCode}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.productName} ({r.brandName})</div>
        </div>
      ),
    },
    { key: "customerName", label: "ลูกค้า", render: (r) => <span style={{ color: "var(--text-2)" }}>{r.customerName}</span> },
    {
      key: "tax", label: "ภาษี/ชิ้น", align: "right",
      sortValue: (r) => taxPerUnit(r),
      render: (r) => <span className="font-mono">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</span>,
    },
    { key: "approvalNumber", label: "เลขที่อนุมัติ", render: (r) => <span className="font-mono" style={{ fontSize: 12, color: "var(--text-3)" }}>{r.approvalNumber || "-"}</span> },
    { key: "status", label: "สถานะ", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const card = (r) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold font-mono text-sm">{r.fgCode}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }} className="truncate">{r.productName} ({r.brandName})</div>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-2)" }} className="truncate">{r.customerName}</span>
        <span className="font-mono">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</span>
      </div>
    </div>
  );

  const headerRight = (
    <>
      <span className="ui-badge">{regs.length} รายการ</span>
      {canEdit && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus size={16} /> สร้างทะเบียน
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="การขึ้นทะเบียนสรรพสามิต"
      subtitle="ยื่น ตรวจสอบ และอนุมัติการขึ้นทะเบียนภาษีสรรพสามิต (สินค้า + ลูกค้า)"
      headerRight={headerRight}
      loading={loading}
      toolbar={
        <FilterBar
          filters={REGISTRATION_FILTERS}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา FG / ลูกค้า / เลขอนุมัติ..."
        />
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/tax/registrations/${r.id}`)}
        card={card}
        initialSort={{ key: "fgCode", dir: "asc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        emptyIcon={ClipboardCheck}
      />

      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        registration={null}
        products={products}
        customers={customers}
        userName={userName}
      />
    </Workspace>
  );
}

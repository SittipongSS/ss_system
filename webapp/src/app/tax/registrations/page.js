"use client";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, Pencil, Trash2, Send } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RecordDrawer, { Field } from "@/components/excise/RecordDrawer";
import Timeline from "@/components/excise/Timeline";
import ConfirmDialog from "@/components/excise/ConfirmDialog";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import ApproveDialog from "@/components/excise/ApproveDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { requiredDocKeys, attachmentTypeLabel } from "@/lib/master/attachmentTypes";

const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));

// Required registration documents (must be attached before submitting a draft).
const REQUIRED_REG_DOCS = requiredDocKeys("registration");

// Build the timeline for a registration. A draft hasn't been submitted yet.
function regSteps(r) {
  const created = { label: "สร้างทะเบียน (ร่าง)", at: r.createdAt, by: r.assignee, state: "done" };
  if (r.status === "draft") {
    return [created, { label: "ยื่นขึ้นทะเบียน", state: "current", note: "แนบเอกสารให้ครบก่อนยื่น" }];
  }
  const submitted = { label: "ยื่นขึ้นทะเบียน", at: r.createdAt, by: r.assignee, state: "done" };
  if (r.status === "rejected") {
    return [submitted, { label: "ตีกลับให้แก้ไข", state: "rejected", note: r.rejectionReason }];
  }
  const approved = {
    label: "อนุมัติขึ้นทะเบียน",
    at: r.approvedAt, by: r.approvedByName,
    state: r.status === "approved" ? "done" : "current",
  };
  return [submitted, approved];
}

export default function RegistrationsPage() {
  const role = useRole();
  const dept = deptOf(role);
  const canEdit = useCan("products:edit");   // SA: create / edit / resubmit / delete
  const canApprove = useCan("legal:approve"); // LG: approve / reject

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations");
  const { data: products } = useApiList("/api/products");
  const { data: customers } = useApiList("/api/customers");

  const [userName, setUserName] = useState("");
  // LG lands on their queue; everyone else sees all. A ?status= deep-link
  // (from the dashboard) overrides the default after mount.
  const [filter, setFilter] = useState(() => (deptOf(role) === "LG" ? "pending_legal" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && REGISTRATION_FILTERS.some((f) => f.key === s)) setFilter(s);
  }, []);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { setOpenId(new URLSearchParams(window.location.search).get("open")); }, []);
  useEffect(() => {
    if (!openId || !regs.length) return;
    const r = regs.find((x) => x.id === openId);
    if (r) { setSelected(r); setOpenId(null); }
  }, [openId, regs]);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Attachments of the open record (reported by AttachmentsPanel) — used to
  // enforce the required documents before a draft can be submitted.
  const [attachItems, setAttachItems] = useState([]);
  useEffect(() => { setAttachItems([]); }, [selected?.id]);
  const missingDocs = useMemo(() => {
    const present = new Set(attachItems.map((a) => a.docType));
    return REQUIRED_REG_DOCS.filter((k) => !present.has(k));
  }, [attachItems]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.approvalNumber]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search]);

  const refreshAll = async () => { await reload(); };

  // After saving the form: a freshly created draft opens straight into the drawer
  // so the user lands on the attachment cards and can submit once they're complete.
  const handleSaved = async (saved, { created } = {}) => {
    await reload();
    if (created && saved?.id) setSelected(saved);
  };

  // Submit a draft (or resubmit a rejected one) for LG approval. The server
  // hard-blocks if the required documents are missing; we also guard client-side.
  const submitDraft = async (r) => {
    const res = await fetch(`/api/excise-registrations/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_legal" }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ยื่นไม่สำเร็จ");
    await refreshAll();
    setSelected(null);
  };

  const resubmit = async (r) => {
    const res = await fetch(`/api/excise-registrations/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_legal" }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ส่งกลับไม่สำเร็จ");
    await refreshAll();
    setSelected(null);
  };
  const doDelete = async () => {
    const res = await fetch(`/api/excise-registrations/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    await refreshAll();
    setSelected(null);
  };
  const rejectReg = async (reason) => {
    const res = await fetch(`/api/excise-registrations/${rejectTarget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await refreshAll();
    setSelected(null);
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
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus size={16} /> สร้างทะเบียน
        </button>
      )}
    </>
  );

  const s = selected;
  const drawerFooter = s && (
    <>
      {canApprove && s.status === "pending_legal" && (
        <>
          <button className="btn btn-danger" onClick={() => setRejectTarget(s)}>ตีกลับ</button>
          <button className="btn btn-primary" onClick={() => setApproveTarget(s)}>อนุมัติ</button>
        </>
      )}
      {canEdit && s.status === "draft" && (
        <button
          className="btn btn-primary flex items-center gap-1.5"
          disabled={missingDocs.length > 0}
          title={missingDocs.length ? `ต้องแนบ: ${missingDocs.map((k) => attachmentTypeLabel("registration", k)).join(", ")}` : ""}
          onClick={() => submitDraft(s).catch((e) => alert(e.message))}
        >
          <Send size={15} /> ยื่นขึ้นทะเบียน
        </button>
      )}
      {canEdit && s.status === "rejected" && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => resubmit(s).catch((e) => alert(e.message))}>
          <Send size={15} /> ส่งกลับให้ตรวจ
        </button>
      )}
      {canEdit && s.status !== "approved" && (
        <button className="btn btn-secondary flex items-center gap-1.5" onClick={() => { setEditTarget(s); setFormOpen(true); }}>
          <Pencil size={15} /> แก้ไข
        </button>
      )}
      {canEdit && (
        <button className="btn btn-danger flex items-center gap-1.5" onClick={() => setDeleteTarget(s)}>
          <Trash2 size={15} /> ลบ
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
        onRowClick={setSelected}
        card={card}
        initialSort={{ key: "fgCode", dir: "asc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        emptyIcon={ClipboardCheck}
      />

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={s?.fgCode}
        subtitle={s ? `${s.productName} (${s.brandName})` : ""}
        badge={s && <StatusBadge status={s.status} />}
        footer={drawerFooter}
      >
        {s && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="ลูกค้า" full>{s.customerName}</Field>
              <Field label="เลขผู้เสียภาษี">{s.taxId || "-"}</Field>
              <Field label="ภาษี/ชิ้น">{s.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(s))}</Field>
              <Field label="เลขที่อนุมัติ">{s.approvalNumber || "-"}</Field>
              <Field label="ผู้ยื่น">{s.assignee || "-"}</Field>
            </div>

            <div>
              <div className="drawer-section-title" style={{ marginBottom: 10 }}>สถานะการดำเนินการ</div>
              <Timeline steps={regSteps(s)} />
            </div>

            {s.status === "draft" && (
              <div
                className="rounded p-2.5"
                style={{ fontSize: 12.5, border: "1px solid var(--border)", background: missingDocs.length ? "var(--amber-soft)" : "var(--green-soft)", color: missingDocs.length ? "var(--amber)" : "var(--green)" }}
              >
                {missingDocs.length
                  ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.map((k) => attachmentTypeLabel("registration", k)).join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                  : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่ายกฎหมายตรวจ"}
              </div>
            )}

            <AttachmentsPanel
              entityType="registration"
              entityId={s.id}
              canEdit={canEdit || canApprove}
              title="เอกสารการขึ้นทะเบียน"
              onItemsChange={setAttachItems}
            />
          </div>
        )}
      </RecordDrawer>

      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        registration={editTarget}
        products={products}
        customers={customers}
        userName={userName}
      />
      <ApproveDialog open={!!approveTarget} onClose={() => setApproveTarget(null)} onDone={refreshAll} registration={approveTarget} />
      <RejectDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={rejectReg} title="ตีกลับการขึ้นทะเบียน" entityLabel="ทะเบียนนี้" />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="ลบรายการขึ้นทะเบียน"
        message={`ยืนยันการลบทะเบียนของ ${deleteTarget?.fgCode || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
    </Workspace>
  );
}

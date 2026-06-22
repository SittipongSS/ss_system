"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck, ArrowLeft, Pencil, Trash2, Send } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import Timeline from "@/components/excise/Timeline";
import ConfirmDialog from "@/components/excise/ConfirmDialog";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import ApproveDialog from "@/components/excise/ApproveDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { requiredDocKeys, attachmentTypeLabel, customerDocTypes } from "@/lib/master/attachmentTypes";

const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));
const REQUIRED_REG_DOCS = requiredDocKeys("registration");

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

export default function RegistrationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const role = useRole();
  const canEdit = useCan("products:edit");
  const canApprove = useCan("legal:approve");

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations");
  const { data: products } = useApiList("/api/products");
  const { data: customers } = useApiList("/api/customers");

  const s = useMemo(() => regs.find((r) => r.id === id) || null, [regs, id]);
  const customer = customers.find((c) => c.id === s?.customerId) || {};

  const [formOpen, setFormOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [attachItems, setAttachItems] = useState([]);   // registration docs
  const [custItems, setCustItems] = useState([]);        // customer docs (shared)
  useEffect(() => { setAttachItems([]); setCustItems([]); }, [id]);
  // Required-doc labels still missing before the draft can be submitted:
  // registration docs (ฉลาก/Artwork) + the company map pulled from the customer.
  const missingDocs = useMemo(() => {
    const out = [];
    const regPresent = new Set(attachItems.map((a) => a.docType));
    for (const k of REQUIRED_REG_DOCS) if (!regPresent.has(k)) out.push(attachmentTypeLabel("registration", k));
    const custPresent = new Set(custItems.map((a) => a.docType));
    if (!custPresent.has("address_map")) out.push(attachmentTypeLabel("customer", "address_map"));
    return out;
  }, [attachItems, custItems]);

  const submitDraft = async () => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_legal" }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ยื่นไม่สำเร็จ");
    await reload();
  };
  const resubmit = async () => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_legal" }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ส่งกลับไม่สำเร็จ");
    await reload();
  };
  const doDelete = async () => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    router.push("/tax/registrations");
  };
  const rejectReg = async (reason) => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await reload();
  };

  const back = (
    <button className="btn btn-secondary flex items-center gap-1.5" onClick={() => router.push("/tax/registrations")}>
      <ArrowLeft size={16} /> กลับ
    </button>
  );

  if (!loading && !s) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ไม่พบรายการ" subtitle="ทะเบียนนี้อาจถูกลบไปแล้ว" headerRight={back}>
        <div style={{ color: "var(--text-3)" }}>ไม่พบทะเบียนที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {s && <StatusBadge status={s.status} />}
      {back}
    </div>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={s?.fgCode || "..."}
      subtitle={s ? `${s.productName} (${s.brandName})` : ""}
      headerRight={headerRight}
      loading={loading && !s}
    >
      {s && (
        <div className="flex flex-col gap-5" style={{ maxWidth: 880 }}>
          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ลูกค้า" full>{s.customerName}</Field>
              <Field label="เลขผู้เสียภาษี">{s.taxId || "-"}</Field>
              <Field label="ภาษี/ชิ้น">{s.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(s))}</Field>
              <Field label="เลขที่อนุมัติ">{s.approvalNumber || "-"}</Field>
              <Field label="ผู้ยื่น">{s.assignee || "-"}</Field>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>สถานะการดำเนินการ</div>
            <Timeline steps={regSteps(s)} />
          </div>

          {s.status === "draft" && (
            <div
              className="rounded p-2.5"
              style={{ fontSize: 12.5, border: "1px solid var(--border)", background: missingDocs.length ? "var(--amber-soft)" : "var(--green-soft)", color: missingDocs.length ? "var(--amber)" : "var(--green)" }}
            >
              {missingDocs.length
                ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่ายกฎหมายตรวจ"}
            </div>
          )}

          <div className="glass-panel" style={{ padding: 16 }}>
            <AttachmentsPanel
              entityType="registration"
              entityId={s.id}
              canEdit={canEdit || canApprove}
              title="เอกสารการขึ้นทะเบียน"
              onItemsChange={setAttachItems}
              cardColumns={1}
            />
          </div>

          {/* Customer documents (incl. แผนที่บริษัท) — same shared customer record.
              The map is pulled from here; if missing, SA can attach it and it is
              saved to the customer (not duplicated on the registration). */}
          {s.customerId && (
            <div className="glass-panel" style={{ padding: 16 }}>
              <AttachmentsPanel
                entityType="customer"
                entityId={s.customerId}
                canEdit={canEdit}
                docTypes={customerDocTypes(customer.customerType)}
                title={`เอกสารลูกค้า${customer.name ? ` — ${customer.name}` : ""} (ฐานข้อมูลเดียวกับหน้าลูกค้า)`}
                onItemsChange={setCustItems}
                cardColumns={1}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 flex-wrap">
            {canApprove && s.status === "pending_legal" && (
              <>
                <button className="btn btn-danger" onClick={() => setRejectOpen(true)}>ตีกลับ</button>
                <button className="btn btn-primary" onClick={() => setApproveOpen(true)}>อนุมัติ</button>
              </>
            )}
            {canEdit && s.status === "draft" && (
              <button
                className="btn btn-primary flex items-center gap-1.5"
                disabled={missingDocs.length > 0}
                title={missingDocs.length ? `ต้องแนบ: ${missingDocs.join(", ")}` : ""}
                onClick={() => submitDraft().catch((e) => alert(e.message))}
              >
                <Send size={15} /> ยื่นขึ้นทะเบียน
              </button>
            )}
            {canEdit && s.status === "rejected" && (
              <button className="btn btn-primary flex items-center gap-1.5" onClick={() => resubmit().catch((e) => alert(e.message))}>
                <Send size={15} /> ส่งกลับให้ตรวจ
              </button>
            )}
            {canEdit && s.status !== "approved" && (
              <button className="btn btn-secondary flex items-center gap-1.5" onClick={() => setFormOpen(true)}>
                <Pencil size={15} /> แก้ไข
              </button>
            )}
            {canEdit && (
              <button className="btn btn-danger flex items-center gap-1.5" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={15} /> ลบ
              </button>
            )}
          </div>
        </div>
      )}

      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        registration={s}
        products={products}
        customers={customers}
      />
      <ApproveDialog open={approveOpen} onClose={() => setApproveOpen(false)} onDone={reload} registration={s} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={rejectReg} title="ตีกลับการขึ้นทะเบียน" entityLabel="ทะเบียนนี้" />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="ลบรายการขึ้นทะเบียน"
        message={`ยืนยันการลบทะเบียนของ ${s?.fgCode || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
    </Workspace>
  );
}

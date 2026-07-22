"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { ActionBar, ActionButton } from "@/components/ui/ActionButtons";
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
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import { brandLabel } from "@/lib/master/brands";

const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));

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
  const [reviseOpen, setReviseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [attachItems, setAttachItems] = useState([]);   // registration docs
  const [custItems, setCustItems] = useState([]);        // customer docs (shared)
  useEffect(() => { setAttachItems([]); setCustItems([]); }, [id]);

  // Completeness checklist comes from the server (single source of truth with the
  // submit-gate). Refetch whenever attachments change so it stays live as the user
  // uploads/removes docs. attachItems/custItems update via AttachmentsPanel.
  const [req, setReq] = useState(null);
  useEffect(() => {
    if (!s?.id) { setReq(null); return; }
    let alive = true;
    fetch(`/api/excise-registrations/${s.id}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReq(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [s?.id, attachItems, custItems]);
  const missingDocs = (req?.missing || []).map((m) => m.label);
  const warnings = req?.warnings || [];

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
  const requestRevise = async () => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถขอแก้ไขได้");
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

  const back = { href: "/tax/registrations", label: "กลับไปหน้าทะเบียน" };

  if (!loading && !s) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ไม่พบรายการ" subtitle="ทะเบียนนี้อาจถูกลบไปแล้ว" back={back}>
        <div style={{ color: "var(--text-3)" }}>ไม่พบทะเบียนที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {s && <StatusBadge status={s.status} />}
    </div>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={s?.fgCode || "..."}
      subtitle={s ? `${s.productName} (${brandLabel(s.metadata?.brandNameTh, s.metadata?.brandNameEn || s.brandName) || "-"})` : ""}
      headerRight={headerRight}
      back={back}
      // แก้ไข/ขอแก้ไข/ลบ = action ระดับ entity — ไอคอนแถวเดียวกับปุ่มย้อนกลับ ตามกติกา Page Header
      backActions={s ? (
        <>
          {canEdit && s.status !== "approved" && <ActionButton kind="edit" iconOnly title="แก้ไข" onClick={() => setFormOpen(true)} />}
          {canEdit && s.status === "approved" && <ActionButton kind="reedit" iconOnly title="ขอแก้ไข" onClick={() => setReviseOpen(true)} />}
          {/* ลบ: ยึด s.canDelete จาก server (อำนาจราย record — scope 'own' เทียบ
              user.id ที่ client ไม่มี) ไม่ใช่ products:edit ซึ่งกว้างกว่าจริง */}
          {s.canDelete && s.status === "draft" && <ActionButton kind="delete" iconOnly title="ลบ" onClick={() => setDeleteOpen(true)} />}
        </>
      ) : null}
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

          {s.status === "draft" && req && (
            <div className="flex flex-col gap-2">
              <div
                className="rounded p-2.5"
                style={{ fontSize: 12.5, border: "1px solid var(--border)", background: missingDocs.length ? "var(--amber-soft)" : "var(--green-soft)", color: missingDocs.length ? "var(--amber)" : "var(--green)" }}
              >
                {missingDocs.length
                  ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                  : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่ายกฎหมายตรวจ"}
              </div>
              {warnings.length > 0 && (
                <div
                  className="rounded p-2.5"
                  style={{ fontSize: 12.5, border: "1px solid var(--border)", background: "var(--amber-soft)", color: "var(--amber)" }}
                >
                  ข้อมูลที่ควรเติม (ไม่บังคับ): {warnings.map((w) => w.message).join(", ")}
                </div>
              )}
            </div>
          )}

          <div className="glass-panel" style={{ padding: 16 }}>
            <AttachmentsPanel
              entityType="registration"
              entityId={s.id}
              canEdit={(canEdit && s.status !== "approved") || canApprove}
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

          {/* Actions — เฉพาะปุ่ม workflow; แก้ไข/ลบ ย้ายไปแถวปุ่มย้อนกลับด้านบนแล้ว */}
          {((canApprove && s.status === "pending_legal") || (canEdit && ["draft", "rejected"].includes(s.status))) && <ActionBar>
            {canApprove && s.status === "pending_legal" && (
              <>
                <ActionButton kind="reject" onClick={() => setRejectOpen(true)} />
                <ActionButton kind="approve" onClick={() => setApproveOpen(true)} />
              </>
            )}
            {canEdit && s.status === "draft" && (
              <ActionButton
                kind="submit"
                label="ยื่นขึ้นทะเบียน"
                disabled={!req?.ready}
                title={!req?.ready ? `ต้องแนบ: ${missingDocs.join(", ")}` : ""}
                onClick={() => submitDraft().catch((e) => alert(e.message))}
              />
            )}
            {canEdit && s.status === "rejected" && (
              <ActionButton kind="submit" label="ส่งกลับให้ตรวจ" onClick={() => resubmit().catch((e) => alert(e.message))} />
            )}
          </ActionBar>}
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
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        onConfirm={requestRevise}
        title="ขอแก้ไขทะเบียนที่อนุมัติแล้ว"
        message={`ทะเบียน ${s?.fgCode || "นี้"} อนุมัติแล้ว การขอแก้ไขจะปลดล็อกกลับเป็น “ฉบับร่าง” และต้องยื่นขออนุมัติใหม่อีกครั้ง ต้องการดำเนินการต่อหรือไม่?`}
        confirmLabel="ขอแก้ไข (กลับเป็นร่าง)"
      />
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

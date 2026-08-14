"use client";
import { notifyToast } from "@/components/ui/Toast";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck, ExternalLink, MessagesSquare, Send, Undo2 } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import { ActionButton } from "@/components/ui/ActionButtons";
import Workspace from "@/components/ui/Workspace";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentReadinessList, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, naText } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import ApproveDialog from "@/components/excise/ApproveDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import { useCustomerRecord } from "@/lib/master/useCustomerRecord";
import { brandLabel } from "@/lib/master/brands";
import { productDisplayName } from "@/lib/master/productIdentity";
import { statusMeta } from "@/lib/excise/workflow";
import { exciseTaxLineForRegistration } from "@/lib/tax/exciseBilling";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";

// ภาษี/ชิ้น อ่านจากทะเบียนสินค้าเสมอ (ดูเหตุผลเต็มที่หน้ารายการทะเบียน) — ทะเบียน
// สรรพสามิตตัดสินแค่ว่า "เสียภาษีไหม" ส่วนตัวเลขอัตรามาจากราคาขายปลีกของ FG
const taxPerUnit = (r, product) =>
  exciseTaxLineForRegistration({ registration: r, product, quantity: 1 }).totalTax;

export default function RegistrationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("products:edit");
  const canApprove = useCan("legal:approve");

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations");
  const { data: products } = useApiList("/api/products");
  const { data: customers } = useApiList("/api/customers");

  const s = useMemo(() => regs.find((r) => r.id === id) || null, [regs, id]);
  // อัตราภาษีมาจากสินค้า ไม่ใช่สำเนาบนทะเบียน (ราคาขายปลีกอัปเดตได้ อัตราจึงขยับตาม)
  const taxProduct = useMemo(
    () => products.find((p) => p.id === s?.productId) || null,
    [products, s?.productId],
  );
  // ลิสต์ customers มีไว้ให้ picker ของ RegistrationFormModal — ลูกค้าของทะเบียนใบนี้
  // อ่านรายตัว ไม่งั้นชื่อ/ประเภทลูกค้าหายเมื่อผู้เปิดไม่ได้ดูแลลูกค้ารายนั้น
  const customer = useCustomerRecord(s?.customerId, customers.find((c) => c.id === s?.customerId));

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
  // ปลดอนุมัติ = สิทธิ์ฝ่ายกฎหมาย + ต้องมีเหตุผล (มติ B2 2026-07-27) — ทะเบียนคือหลักฐาน
  // ที่ใบยื่นชำระภาษีอ้างถึง การปลดจึงต้องหนักเท่ากับด่านอื่นในระบบ ไม่ใช่กดผ่านเงียบ ๆ
  const revokeApproval = async (reason) => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft", reason }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถปลดอนุมัติได้");
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
  const status = s ? statusMeta(s.status) : statusMeta();
  const workflowIndex = s?.status === "approved" ? 2 : s?.status === "pending_legal" ? 1 : 0;
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "จัดเตรียมทะเบียน", hint: s?.status === "rejected" ? "แก้ไขตามเหตุผลที่ตีกลับ" : "แนบเอกสารให้ครบ" },
    { id: "review", label: "ฝ่ายกฎหมายตรวจ", hint: "ตรวจข้อมูลและเอกสารประกอบ" },
    { id: "approved", label: "ขึ้นทะเบียนแล้ว", hint: "มีเลขที่อนุมัติพร้อมใช้งาน" },
  ], workflowIndex);

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={s?.fgCode || "..."}
      subtitle={s ? `${productDisplayName(s)} (${naText(brandLabel(s.metadata?.brandNameTh, s.metadata?.brandNameEn || s.brandName))})` : ""}
      headerRight={headerRight}
      back={back}
      // แก้ไข/ขอแก้ไข/ลบ = action ระดับ entity — ไอคอนแถวเดียวกับปุ่มย้อนกลับ ตามกติกา Page Header
      backActions={s ? (
        <>
          {canEdit && s.status !== "approved" && <ActionButton kind="edit" iconOnly title="แก้ไข" onClick={() => setFormOpen(true)} />}
          {/* ลบ: ยึด s.canDelete จาก server (อำนาจราย record — scope 'own' เทียบ
              user.id ที่ client ไม่มี) ไม่ใช่ products:edit ซึ่งกว้างกว่าจริง */}
          {s.canDelete && s.status === "draft" && <ActionButton kind="delete" iconOnly title="ลบ" onClick={() => setDeleteOpen(true)} />}
        </>
      ) : null}
      loading={loading && !s}
    >
      {s && (
        <DetailPageLayout
          asideLabel="สรุปและจัดการทะเบียนสรรพสามิต"
          aside={(
            <>
              <DocumentSummaryCard
                title="สรุปทะเบียน"
                total={s.isExciseTaxable === false ? "ยกเว้นภาษี" : fmtMoney(taxPerUnit(s, taxProduct))}
                rows={[
                  { id: "fg", label: "รหัสสินค้า", value: naText(s.fgCode) },
                  { id: "customer", label: "ลูกค้า", value: naText(s.customerName) },
                  { id: "approval", label: "เลขที่อนุมัติ", value: naText(s.approvalNumber) },
                  { id: "documents", label: "เอกสารบังคับ", value: req ? (req.ready ? "ครบ" : `ขาด ${missingDocs.length}`) : "กำลังตรวจ" },
                ]}
                status={status.label}
                statusColor={toneColor(status.tone)}
              />
              <DocumentControlCard
                status={status.label}
                statusColor={toneColor(status.tone)}
                statusDescription="การดำเนินการระดับทะเบียน"
                workflowSteps={workflowSteps}
                notices={req ? (
                  <DocumentReadinessList
                    items={req.ready
                      ? [{ id: "ready", label: "เอกสารที่จำเป็นครบแล้ว", ready: true }]
                      : (req.missing || []).map((item) => ({
                        id: `${item.entity}-${item.docType}`,
                        label: item.label,
                        detail: "ต้องแนบหรือเติมข้อมูลก่อนยื่น",
                        ready: false,
                      }))}
                  />
                ) : null}
                primaryAction={canApprove && s.status === "pending_legal"
                  ? { id: "approve", label: "อนุมัติขึ้นทะเบียน", kind: "approve", onClick: () => setApproveOpen(true) }
                  : canEdit && s.status === "draft"
                    ? {
                      id: "submit", label: "ยื่นขึ้นทะเบียน", kind: "submit", icon: Send,
                      onClick: () => submitDraft().catch((error) => notifyToast.error(error.message)),
                      disabled: !req?.ready,
                      disabledReason: !req?.ready ? `ต้องแนบ: ${missingDocs.join(", ")}` : undefined,
                    }
                    : canEdit && s.status === "rejected"
                      ? {
                        id: "resubmit", label: "ส่งกลับให้ตรวจ", kind: "submit", icon: Send,
                        onClick: () => resubmit().catch((error) => notifyToast.error(error.message)),
                      }
                      : null}
                secondaryActions={[
                  {
                    id: "revise", label: "ปลดอนุมัติ (กลับเป็นร่าง)", kind: "revise", icon: Undo2,
                    onClick: () => setReviseOpen(true),
                    visible: canApprove && s.status === "approved",
                  },
                ]}
                dangerActions={[
                  {
                    id: "reject", label: "ตีกลับให้แก้ไข", kind: "reject",
                    onClick: () => setRejectOpen(true),
                    visible: canApprove && s.status === "pending_legal",
                  },
                ]}
              />
              <RelatedDocumentCard
                title="ข้อมูลต้นทาง"
                meta="สินค้าและลูกค้าที่ใช้ขึ้นทะเบียน"
                actions={(
                  <div className="flex flex-col gap-2">
                    {s.productId ? <Link href={`/database/products/${s.productId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิดสินค้า</Link> : null}
                    {s.customerId ? <Link href={`/database/customers/${s.customerId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิดลูกค้า</Link> : null}
                  </div>
                )}
              >
                ข้อมูลทะเบียนเชื่อมกับฐานข้อมูลกลางโดยไม่คัดลอกเอกสารลูกค้าซ้ำ
              </RelatedDocumentCard>
            </>
          )}
        >
          <div className="flex flex-col gap-5">
          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ลูกค้า" full>{s.customerName}</Field>
              <Field label="เลขผู้เสียภาษี">{naText(s.taxId)}</Field>
              <Field label="ภาษี/ชิ้น">{s.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(s, taxProduct))}</Field>
              <Field label="เลขที่อนุมัติ">{naText(s.approvalNumber)}</Field>
              <Field label="ผู้ยื่น">{naText(s.assignee)}</Field>
            </div>
          </div>

          {s.status === "draft" && req && (
            <div className="flex flex-col gap-2">
              <div
                className="rounded p-2.5"
                style={{ fontSize: "var(--fs-6)", border: "1px solid var(--border)", background: missingDocs.length ? "var(--amber-soft)" : "var(--green-soft)", color: missingDocs.length ? "var(--amber)" : "var(--green)" }}
              >
                {missingDocs.length
                  ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                  : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่ายกฎหมายตรวจ"}
              </div>
              {warnings.length > 0 && (
                <div
                  className="rounded p-2.5"
                  style={{ fontSize: "var(--fs-6)", border: "1px solid var(--border)", background: "var(--amber-soft)", color: "var(--amber)" }}
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

          {/* เธรดกลาง (mig 0163) — เธรดสองฝ่าย SA ↔ LG · `rejectionReason` ถูกล้าง
              เป็น null ตอนอนุมัติ และเหตุผลปลดอนุมัติไปอยู่ใน metadata ที่หน้าจอ
              ไม่แสดง → รอบก่อน ๆ หายหมด ทั้งที่คนแก้รอบถัดไปคือคนที่ต้องอ่านที่สุด */}
          <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
            <UpdateThread
              entityType="excise_registration"
              entityId={s.id}
              order="desc"
              placeholder="พิมพ์ข้อความ เช่น แนบฉลากฉบับแก้ไขแล้ว..."
              emptyText="ยังไม่มีความเคลื่อนไหว"
            />
          </DetailCard>

          </div>
        </DetailPageLayout>
      )}

      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        registration={s}
        products={products}
        customers={customers}
        registrations={regs}
      />
      <ApproveDialog open={approveOpen} onClose={() => setApproveOpen(false)} onDone={reload} registration={s} product={taxProduct} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={rejectReg} title="ตีกลับการขึ้นทะเบียน" entityLabel="ทะเบียนนี้" />
      <RejectDialog
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        onConfirm={revokeApproval}
        title="ปลดอนุมัติทะเบียนที่อนุมัติแล้ว"
        reasonLabel={`เหตุผลที่ปลดอนุมัติทะเบียน ${s?.fgCode || "นี้"} (กลับเป็นร่าง ต้องยื่นขออนุมัติใหม่)`}
        placeholder="เช่น ข้อมูลบนฉลากเปลี่ยน / กรมสรรพสามิตให้แก้ไข..."
        confirmLabel="ยืนยันปลดอนุมัติ"
      />
      <ConfirmDialog
        closeOnSuccess
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

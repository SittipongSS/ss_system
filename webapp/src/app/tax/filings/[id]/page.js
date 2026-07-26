"use client";
import { TableScroll } from "@/components/ui/Table";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReceiptText, Pencil, Wallet, FileCheck, Printer, ExternalLink } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/excise/ConfirmDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import OrderFormModal from "@/components/excise/OrderFormModal";
import ReceiveDialog from "@/components/excise/ReceiveDialog";
import StartFilingDialog from "@/components/excise/StartFilingDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { openBillPrintWindow } from "@/lib/tax/billPrint";
import { orderAmountToCollect } from "@/lib/tax/exciseBilling";
import { productDisplayName } from "@/lib/master/productIdentity";
import { statusMeta } from "@/lib/excise/workflow";
import { useCustomerRecord } from "@/lib/master/useCustomerRecord";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));
// ยอดเรียกเก็บ = ค่าภาษี + VAT 7% ตรงกับ "ยอดแจ้งชำระสุทธิ" บนเอกสารที่พิมพ์เสมอ
// (มติผู้ใช้ 2026-07-26) — คิดจาก lib/tax/exciseBilling ที่เดียว
const amountToCollectText = (o) => ((o.totalTax || 0) === 0
  ? "ยกเว้นภาษี"
  : fmtMoney(orderAmountToCollect(o)));
const ORDER = ["draft", "pending", "received", "filing", "complete", "delivered"];
const TONE_COLOR = {
  neutral: "var(--text-3)", warning: "var(--amber)", danger: "var(--red)",
  info: "var(--blue)", success: "var(--green)",
};

export default function FilingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canAct = useCan("sales:act");        // SA: receive / edit
  const canApprove = useCan("legal:approve"); // LG: file / reject / due date
  const canDelete = useCan("sales:delete");  // Senior AE+ / admin: delete

  const { data: orders, loading, reload } = useApiList("/api/orders");
  const { data: registrations } = useApiList("/api/excise-registrations");
  const { data: customers } = useApiList("/api/customers");
  const { data: products } = useApiList("/api/products");

  const o = useMemo(() => orders.find((x) => x.id === id) || null, [orders, id]);
  const isExempt = (o?.totalTax || 0) === 0;
  const unregisteredItemCount = (o?.items || []).filter((item) => !item.registrationId).length;
  // ลิสต์ customers ข้างบนมีไว้ให้ picker ของ OrderFormModal — ลูกค้าของใบยื่นใบนี้
  // ต้องอ่านรายตัว ไม่ใช่ find จากลิสต์ที่กรองทีม (ดู lib/master/useCustomerRecord.js)
  const customer = useCustomerRecord(o?.customerId, customers.find((c) => c.id === o?.customerId));

  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  const transition = async (status) => {
    const res = await fetch(`/api/orders/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถเปลี่ยนสถานะได้");
    await reload();
  };
  const setDue = async (value) => {
    await fetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxDueDate: value }) });
    await reload();
  };
  const reject = async (reason) => {
    const res = await fetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected", rejectionReason: reason }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await reload();
  };
  const doDelete = async () => {
    const res = await fetch(`/api/orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    router.push("/tax/filings");
  };

  const back = { href: "/tax/filings", label: "กลับไปหน้าการยื่นชำระ" };

  if (!loading && !o) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="ไม่พบรายการ" subtitle="ใบยื่นนี้อาจถูกลบไปแล้ว" back={back}>
        <div style={{ color: "var(--text-3)" }}>ไม่พบใบยื่นที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {o && <StatusBadge status={o.status} />}
    </div>
  );
  const status = o ? statusMeta(o.status) : statusMeta();
  const workflowIndex = o?.status === "rejected"
    ? 0
    : Math.max(ORDER.indexOf(o?.status), 0);
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "เตรียมใบยื่น", hint: "ตรวจรายการและยอดที่ดึงจาก Sale Order" },
    { id: "pending", label: "รอรับเงิน", hint: o?.status === "rejected" ? "แก้ไขตามเหตุผลที่ตีกลับ" : "ฝ่ายขายตรวจยอดและหลักฐาน" },
    { id: "received", label: "รับเงินแล้ว", hint: "ฝ่ายกฎหมายเตรียมแบบยื่น" },
    { id: "filing", label: "กำลังยื่น", hint: "ยื่นกรมสรรพสามิต" },
    { id: "complete", label: "ชำระแล้ว", hint: "บันทึกเลขที่และวันที่ชำระ" },
    { id: "delivered", label: "ส่งเอกสารแล้ว", hint: "ส่งหลักฐานการชำระให้ลูกค้าแล้ว" },
  ], workflowIndex);
  const primaryAction = canAct && o?.status === "draft"
    ? {
      id: "queue", label: "ส่งเข้าคิวเก็บเงิน",
      kind: "submit", icon: Wallet, onClick: () => transition("pending"),
    }
    : canAct && o?.status === "pending"
      ? {
        id: "receive", label: isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว",
        kind: "submit", icon: Wallet, onClick: () => setReceiveOpen(true),
      }
      : canAct && o?.status === "rejected"
        ? {
          id: "resubmit", label: "แก้ไขและส่งกลับ",
          kind: "submit", icon: Pencil, onClick: () => setFormOpen(true),
        }
        : canApprove && o?.status === "received"
          ? (isExempt
            ? {
              id: "file-exempt", label: "ยืนยันชำระ",
              kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
            }
            : {
              id: "start", label: "เริ่มยื่น",
              kind: "submit", onClick: () => setStartOpen(true),
            })
          : canApprove && o?.status === "filing"
            ? {
              id: "file", label: "บันทึกชำระภาษี",
              kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
            }
            : canAct && o?.status === "complete"
          ? {
            id: "deliver", label: "ยืนยันส่งเอกสารให้ลูกค้า",
            kind: "submit", icon: FileCheck, onClick: () => setDeliverOpen(true),
          }
          : null;

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title={o?.taxNoticeNumber || o?.id || "..."}
      subtitle={o?.customerName || ""}
      headerRight={headerRight}
      back={back}
      loading={loading && !o}
    >
      {o && (
        <DetailPageLayout
          asideLabel="สรุปและจัดการใบยื่นชำระสรรพสามิต"
          aside={(
            <>
              <DocumentSummaryCard
                title="ยอดที่ต้องเรียกเก็บ (รวม VAT 7%)"
                total={amountToCollectText(o)}
                rows={[
                  { id: "tax-before-vat", label: "ค่าภาษี (ก่อน VAT)", value: taxText(o) },
                  { id: "items", label: "รายการสินค้า", value: `${o.items?.length || 0} รายการ` },
                  { id: "due", label: "กำหนดยื่น", value: o.taxDueDate ? fmtDate(o.taxDueDate) : "-" },
                  { id: "invoice", label: "ใบกำกับภาษี", value: o.taxInvoiceNumber || "-" },
                  { id: "receipt", label: "ใบเสร็จสรรพสามิต", value: o.exciseReceiptNumber || "-" },
                ]}
                status={status.label}
                statusColor={TONE_COLOR[status.tone]}
              />
              <DocumentControlCard
                status={status.label}
                statusColor={TONE_COLOR[status.tone]}
                statusDescription="การดำเนินการระดับใบยื่นชำระ"
                workflowSteps={workflowSteps}
                primaryAction={primaryAction}
                secondaryActions={[
                  {
                    id: "edit", label: "แก้ไขข้อมูล", kind: "edit", icon: Pencil,
                    onClick: () => setFormOpen(true),
                    visible: canAct && ["pending", "rejected"].includes(o.status),
                  },
                  {
                    id: "print-notice", label: "ออกใบแจ้งชำระค่าภาษี",
                    kind: "print", icon: Printer, onClick: () => openBillPrintWindow(o, customer),
                  },
                ]}
                dangerActions={[
                  {
                    id: "reject", label: "ตีกลับให้แก้ไข", kind: "reject",
                    onClick: () => setRejectOpen(true),
                    visible: canApprove && ["received", "filing"].includes(o.status),
                  },
                  {
                    id: "delete", label: "ลบเอกสาร", kind: "delete",
                    onClick: () => setDeleteOpen(true),
                    visible: canDelete,
                  },
                ]}
              />
              <RelatedDocumentCard
                title={o.salesOrderId ? "Sale Order ต้นทาง" : "เอกสารต้นทาง"}
                meta={o.poReference || o.quotationRef || "ข้อมูลลูกค้าและทะเบียนสินค้า"}
                actions={o.salesOrderId ? (
                  <Link href={`/sa/sales-orders/${o.salesOrderId}`} className="btn ghost sm">
                    <ExternalLink size={13} /> เปิด Sale Order
                  </Link>
                ) : o.customerId ? (
                  <Link href={`/database/customers/${o.customerId}`} className="btn ghost sm">
                    <ExternalLink size={13} /> เปิดลูกค้า
                  </Link>
                ) : null}
              >
                {o.salesOrderId
                  ? (
                    <>
                      <div>รายการและอัตราภาษีถูก snapshot จาก Sale Order ตอนสร้างใบยื่น โมดูลภาษีเป็นเจ้าของข้อมูลใบยื่นนี้</div>
                      {unregisteredItemCount > 0 && (
                        <div style={{ marginTop: 8, color: "var(--amber)" }}>
                          มี {unregisteredItemCount} รายการที่ยังไม่มีทะเบียนสรรพสามิตอนุมัติ เป็นคำเตือนและไม่บล็อก workflow
                        </div>
                      )}
                    </>
                  )
                  : "ใบยื่นเดิมที่สร้างในโมดูลภาษีโดยตรง รายการสินค้าผูกกับข้อมูลลูกค้าและทะเบียนสรรพสามิต"}
              </RelatedDocumentCard>
            </>
          )}
        >
          <div className="flex flex-col gap-5">
          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PO Reference">{o.poReference || "-"}</Field>
              <Field label="วันที่คาดว่าจะส่ง">{o.deliveryDate && o.deliveryDate !== "-" ? o.deliveryDate : "-"}</Field>
              <Field label="ยอดภาษีรวม">{taxText(o)}</Field>
              <Field label="เลขที่ใบกำกับภาษี">{o.taxInvoiceNumber || "-"}</Field>
              <Field label="ใบเสร็จสรรพสามิต">{o.exciseReceiptNumber || "-"}</Field>
              {o.taxPaidDate && <Field label="วันที่ชำระจริง">{fmtDate(o.taxPaidDate)}</Field>}
              {o.taxFormRef && <Field label="แบบ ภส.">{o.taxFormRef}</Field>}
            </div>

            {canApprove && o.status === "received" && (
              <div className="form-group" style={{ margin: "12px 0 0" }}>
                <label>กำหนดยื่น (Due date)</label>
                <DateInput style={{ maxWidth: 180 }}
                  value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""}
                  onChange={setDue} />
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>รายการสินค้า ({o.items?.length || 0})</div>
            <TableScroll surface="embedded"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--text-3)", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0 0 6px", fontWeight: 600, textAlign: "left" }}>รายการสินค้า</th>
                  <th style={{ padding: "0 8px 6px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>จำนวน</th>
                  <th style={{ padding: "0 0 6px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>รวมภาษี</th>
                </tr>
              </thead>
              <tbody>
                {(o.items || []).map((it) => {
                  const p = it.product || it.registration || {};
                  return (
                    <tr key={it.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                        <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.fgCode || "-"}</div>
                        <div>{productDisplayName(p)}</div>
                      </td>
                      <td className="font-mono" style={{ padding: "8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{(it.quantity || 0).toLocaleString("th-TH")}</td>
                      <td className="font-mono" style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{fmtMoney(it.totalTax || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: "8px 8px 0 0", textAlign: "right" }}>รวมภาษี</td>
                  <td className="font-mono" style={{ padding: "8px 0 0", textAlign: "right", color: "var(--red)" }}>{taxText(o)}</td>
                </tr>
              </tfoot>
            </table></TableScroll>
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <AttachmentsPanel
              entityType="order"
              entityId={o.id}
              canEdit={canAct || canApprove}
              title="เอกสารการชำระสรรพสามิต"
              cardColumns={1}
            />
          </div>

          </div>
        </DetailPageLayout>
      )}

      <OrderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        order={o}
        registrations={registrations}
        customers={customers}
        products={products}
      />
      <ReceiveDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} onDone={reload} order={o} />
      <StartFilingDialog open={startOpen} onClose={() => setStartOpen(false)} onDone={reload} order={o} />
      <FileTaxDialog open={fileOpen} onClose={() => setFileOpen(false)} onDone={reload} order={o} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={reject} title="ตีกลับใบยื่นชำระ" entityLabel="ใบยื่นนี้" />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="ลบใบยื่นชำระ"
        message={`ยืนยันการลบใบยื่นชำระ ${o?.quotationRef || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
      <ConfirmDialog
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() => transition("delivered")}
        title="ยืนยันส่งเอกสารให้ลูกค้า"
        message={`ยืนยันว่าได้ส่งเอกสารการชำระ ${o?.quotationRef || "รายการนี้"} ให้ลูกค้าเรียบร้อยแล้ว`}
        confirmLabel="ยืนยันส่งเอกสารแล้ว"
      />
    </Workspace>
  );
}

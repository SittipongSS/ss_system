"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReceiptText, Pencil, Wallet, FileCheck, Printer } from "lucide-react";
import { ActionBar, ActionButton } from "@/components/ui/ActionButtons";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import Timeline from "@/components/excise/Timeline";
import ConfirmDialog from "@/components/excise/ConfirmDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import OrderFormModal from "@/components/excise/OrderFormModal";
import ReceiveDialog from "@/components/excise/ReceiveDialog";
import StartFilingDialog from "@/components/excise/StartFilingDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { openBillPrintWindow } from "@/lib/tax/billPrint";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));
const ORDER = ["pending", "received", "filing", "complete"];

function orderSteps(o) {
  const idx = ORDER.indexOf(o.status);
  const stateFor = (stage) => {
    if (o.status === "rejected") return ORDER.indexOf(stage) <= 0 ? "done" : "todo";
    const si = ORDER.indexOf(stage);
    if (si < idx) return "done";
    if (si === idx) return o.status === "complete" ? "done" : "current";
    return "todo";
  };
  const steps = [
    { label: "สร้างใบยื่นชำระ", at: o.createdAt, by: o.assignee, state: "done" },
    { label: "รับเงินแล้ว", state: stateFor("received") },
    { label: "ยื่นกรมสรรพสามิต", state: stateFor("filing") },
    { label: "ชำระภาษีแล้ว", at: o.filedAt, by: o.filedByName, state: stateFor("complete") },
  ];
  if (o.status === "rejected") steps.splice(1, 0, { label: "ตีกลับให้แก้ไข", state: "rejected", note: o.rejectionReason });
  return steps;
}

export default function FilingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const role = useRole();
  const canAct = useCan("sales:act");        // SA: receive / edit
  const canApprove = useCan("legal:approve"); // LG: file / reject / due date
  const canDelete = useCan("sales:delete");  // Senior AE+ / admin: delete

  const { data: orders, loading, reload } = useApiList("/api/orders");
  const { data: registrations } = useApiList("/api/excise-registrations");
  const { data: customers } = useApiList("/api/customers");
  const { data: products } = useApiList("/api/products");

  const o = useMemo(() => orders.find((x) => x.id === id) || null, [orders, id]);
  const isExempt = (o?.totalTax || 0) === 0;
  const customer = customers.find((c) => c.id === o?.customerId) || {};

  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title={o?.quotationRef || "..."}
      subtitle={o?.customerName || ""}
      headerRight={headerRight}
      back={back}
      loading={loading && !o}
    >
      {o && (
        <div className="flex flex-col gap-5" style={{ maxWidth: 880 }}>
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
                <input type="date" className="premium-input" style={{ maxWidth: 180 }}
                  value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""}
                  onChange={(e) => setDue(e.target.value)} />
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>รายการสินค้า ({o.items?.length || 0})</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                        <div>{p.productDescriptionEn || p.productDescription || p.productName || ""}</div>
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
            </table>
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>สถานะการดำเนินการ</div>
            <Timeline steps={orderSteps(o)} />
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

          {/* Actions */}
          <ActionBar>
            <button className="btn btn-secondary flex items-center gap-1.5" style={{ marginRight: "auto" }} onClick={() => openBillPrintWindow(o, customer)}>
              <Printer size={15} /> ออกใบวางบิลภาษี
            </button>
            {canAct && o.status === "pending" && (
              <>
                <ActionButton kind="edit" onClick={() => setFormOpen(true)} />
                <ActionButton kind="submit" icon={Wallet} label={isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว"} onClick={() => setReceiveOpen(true)} />
              </>
            )}
            {canAct && o.status === "rejected" && (
              <ActionButton kind="submit" icon={Pencil} label="แก้ไขและส่งกลับ" onClick={() => setFormOpen(true)} />
            )}
            {canApprove && o.status === "received" && (
              <>
                <ActionButton kind="reject" onClick={() => setRejectOpen(true)} />
                {isExempt
                  ? <ActionButton kind="submit" icon={FileCheck} label="ยืนยันชำระ" onClick={() => setFileOpen(true)} />
                  : <ActionButton kind="submit" label="เริ่มยื่น" onClick={() => setStartOpen(true)} />}
              </>
            )}
            {canApprove && o.status === "filing" && (
              <>
                <ActionButton kind="reject" onClick={() => setRejectOpen(true)} />
                <ActionButton kind="submit" icon={FileCheck} label="บันทึกชำระภาษี" onClick={() => setFileOpen(true)} />
              </>
            )}
            {canDelete && (
              <ActionButton kind="delete" onClick={() => setDeleteOpen(true)} />
            )}
          </ActionBar>
        </div>
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
    </Workspace>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BadgeCheck, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  ClipboardList, ExternalLink, FileCheck2, FileText, FolderKanban,
  Printer, RotateCcw, Save, Send, Trash2, Undo2, UserRound, XCircle,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SaveStatus from "@/components/ui/SaveStatus";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openSalesOrderPrintWindow, prepareSalesOrderPrintWindow, showSalesOrderPrintError } from "@/lib/sales/salesOrderPrint";
import styles from "./page.module.css";

const STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)", description: "ตรวจสอบข้อมูลและรายการก่อนยื่นอนุมัติ" },
  pending_approval: { label: "รอ AE Supervisor อนุมัติ", color: "var(--amber)", description: "เอกสารถูกล็อกระหว่างรอตรวจ" },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)", description: "ยอดถูกนับเป็น Actual แล้ว" },
  rejected: { label: "ตีกลับให้แก้ไข", color: "var(--red)", description: "แก้ไขตามเหตุผลแล้วส่งอนุมัติใหม่" },
  cancelled: { label: "ยกเลิก", color: "var(--red)", description: "เอกสารนี้ไม่ถูกนับเป็น Actual" },
};

const ACTION_MESSAGE = {
  save: "บันทึกร่างเรียบร้อยแล้ว",
  submit: "ยื่นอนุมัติเรียบร้อยแล้ว",
  approve: "อนุมัติ SO และอัปเดต Actual แล้ว",
  reject: "ตีกลับให้ผู้จัดทำแก้ไขแล้ว",
  cancel: "ยกเลิก SO และคำนวณ Actual ใหม่แล้ว",
  restore: "คืน SO เป็นฉบับร่างแล้ว",
};

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("salesplan:edit");
  const role = useRole();
  const reviewer = ["admin", "ae_supervisor"].includes(role);
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ orderDate: "", paymentDueDate: "", notes: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "โหลด Sale Order ไม่สำเร็จ");
      setSaveState("error");
      return false;
    }
    setOrder(data);
    setForm({ orderDate: data.orderDate || "", paymentDueDate: data.paymentDueDate || "", notes: data.notes || "" });
    setDirty(false);
    return true;
  }, [id]);
  useEffect(() => { load(); }, [load]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaveState("dirty");
    setNotice("");
  }

  async function requestAction(action, payload = {}) {
    setBusy(action);
    setError("");
    setNotice("");
    if (action === "save") setSaveState("saving");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy("");
      setError(data.error || "อัปเดต Sale Order ไม่สำเร็จ");
      if (action === "save") setSaveState("error");
      return false;
    }
    await load();
    setBusy("");
    setNotice(ACTION_MESSAGE[action] || "อัปเดตเรียบร้อยแล้ว");
    if (action === "save") setSaveState("saved");
    return true;
  }

  async function save(submitAfter = false) {
    const saved = await requestAction("save", form);
    if (!saved || !submitAfter) return;
    if (window.confirm("ยืนยันยื่น SO ให้ AE Supervisor ตรวจอนุมัติ? หลังยื่นแล้วจะแก้ไขไม่ได้จนกว่าจะถูกตีกลับ")) {
      await requestAction("submit");
    }
  }

  async function review(action) {
    if (action === "approve") {
      if (!window.confirm("อนุมัติ SO ใบนี้? ยอด Actual จะถูกนับเข้าระบบทันที")) return;
      const note = window.prompt("หมายเหตุการอนุมัติ (ไม่บังคับ)") || "";
      await requestAction("approve", { note });
      return;
    }
    const reason = window.prompt("เหตุผลที่ตีกลับให้ผู้จัดทำแก้ไข")?.trim() || "";
    if (reason) await requestAction("reject", { reason });
  }

  async function cancel() {
    const reason = window.prompt("เหตุผลที่ยกเลิก Sale Order")?.trim() || "";
    if (!reason || !window.confirm("ยืนยันยกเลิก SO? หากอนุมัติแล้ว ยอด Actual จะถูกนำออกทันที")) return;
    await requestAction("cancel", { reason });
  }

  async function remove() {
    if (!window.confirm("ลบ SO ถาวร? ยอด Actual จะถูกคำนวณใหม่และไม่สามารถย้อนกลับได้")) return;
    setBusy("delete");
    setError("");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); setError(data.error || "ลบ Sale Order ไม่สำเร็จ"); return; }
    router.push("/sa/sales-orders");
  }

  async function printDocument() {
    const printWindow = prepareSalesOrderPrintWindow();
    if (!printWindow) return;
    if (dirty) {
      printWindow.close();
      setError("กรุณาบันทึกข้อมูลล่าสุดก่อนออกเอกสาร");
      return;
    }
    try {
      const res = await fetch(`/api/sales-planning/sales-orders/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ไม่สามารถโหลดข้อมูลใบสั่งขายได้");
      openSalesOrderPrintWindow(data, printWindow);
    } catch (printError) {
      showSalesOrderPrintError(printWindow, printError.message);
    }
  }

  const sortedLines = useMemo(
    () => (order?.lines || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [order?.lines],
  );

  if (!order) {
    return <Workspace icon={<ClipboardList size={22} />} title="Sale Order" back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }} loading={!error}>{error && <div className="glass-panel" style={{ padding: 14, color: "var(--red)" }}>{error}</div>}</Workspace>;
  }

  const approved = order.status === "approved";
  // แบ่งแยกหน้าที่: ผู้ตรวจสอบที่เป็นผู้สร้าง/ผู้ยื่น SO เอง อนุมัติ/ตีกลับใบนี้ไม่ได้
  const ownSalesOrder = !!order.meId && (order.meId === order.createdBy || order.meId === order.submittedBy);
  const canReviewThis = reviewer && !ownSalesOrder;
  const editable = canEdit && ["draft", "rejected"].includes(order.status);
  const status = STATUS[order.status] || { label: order.status, color: "var(--text-3)", description: "" };
  const workflowIndex = order.status === "approved" ? 3 : order.status === "pending_approval" ? 1 : 0;
  const workflow = [
    { label: "จัดทำร่าง", hint: order.createdByName || "ผู้จัดทำ" },
    { label: "ยื่นอนุมัติ", hint: order.submittedAt ? fmtDate(order.submittedAt) : "รอผู้จัดทำ" },
    { label: "AE Supervisor ตรวจ", hint: order.status === "rejected" ? "ตีกลับแล้ว" : order.approvedByName || "รอตรวจ" },
    { label: "นับ Actual", hint: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
  ];

  return (
    <Workspace hideHeader back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }} backActions={<><SaveStatus status={saveState} /><button type="button" className="btn btn-primary" onClick={printDocument}><Printer size={14} /> ออกเอกสาร</button></>}>
      <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="SALE ORDER · COMMERCIAL APPROVAL"
          title={order.orderNumber}
          description={`${order.customerName || "ไม่ระบุลูกค้า"} · ${order.deal?.title || "ไม่ระบุดีล"}`}
          badges={<SalesStateBadge label={status.label} color={status.color} />}
          facts={[
            { icon: CalendarDays, label: "วันที่ SO", value: fmtDate(order.orderDate) },
            { icon: FileText, label: "อ้างอิง QT", value: order.quotation?.quoteNumber || "-" },
            { icon: CircleDollarSign, label: "ยอดก่อน VAT", value: fmtMoney(order.actualAmount) },
            { icon: BadgeCheck, label: "Actual ในระบบ", value: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
          ]}
        >
          <p className={styles.statusDescription}>{status.description}</p>
        </SalesDetailOverview>

        {error && <div className={styles.alertError} role="alert">{error}</div>}
        {notice && <div className={styles.alertSuccess} role="status">{notice}</div>}
        {order.rejectionReason && <div className={styles.rejection}><Undo2 size={17} /><div><strong>ตีกลับโดย {order.rejectedByName || "AE Supervisor"}</strong><p>{order.rejectionReason}</p></div></div>}

        <section className={styles.workflowCard} aria-label="สถานะการอนุมัติ Sale Order">
          <div className={styles.workflowHeader}><div><small>APPROVAL WORKFLOW</small><h2>เส้นทางเอกสาร</h2></div><span>{status.label}</span></div>
          <div className={styles.workflowRail}>
            {workflow.map((step, index) => {
              const state = order.status === "cancelled" ? "cancelled" : index < workflowIndex ? "done" : index === workflowIndex ? "current" : "pending";
              return <div key={step.label} className={`${styles.workflowStep} ${styles[state]}`}><span className={styles.stepMarker}>{state === "done" ? <CheckCircle2 size={16} /> : index + 1}</span><div><strong>{step.label}</strong><small>{step.hint}</small></div></div>;
            })}
          </div>
        </section>

        <ContextGrid>
          <ContextCard icon={Building2} href={order.customerId ? `/database/customers/${order.customerId}` : undefined} eyebrow="ลูกค้า" title={order.customerName || "-"} subtitle="ข้อมูลลูกค้าของเอกสาร" facts={[{ label: "สถานะ SO", value: status.label }]} />
          <ContextCard icon={FolderKanban} href={`/sa/deals/${order.dealId}`} eyebrow="ดีล" title={order.deal?.title || "-"} subtitle={`${order.deal?.team || "-"} · ${order.deal?.ownerName || "-"}`} facts={[{ label: "Stage", value: order.deal?.stage || "-" }]} />
          <ContextCard icon={FileText} href={`/sa/quotations/${order.quotationId}`} eyebrow="ใบเสนอราคา Won" title={order.quotation?.quoteNumber || "-"} subtitle={`วันที่หลักฐาน ${fmtDate(order.quotation?.wonDocDate)}`} facts={[{ label: "ไฟล์หลักฐาน", value: `${order.quotation?.wonAttachments?.length || 0} ไฟล์` }]} />
          <ContextCard icon={Building2} href={order.projectId ? `/sa/projects/${order.projectId}` : undefined} eyebrow="โครงการ" title={order.project?.name || order.project?.code || "-"} subtitle={order.project?.code || "ข้อมูลโครงการที่ผูกกับดีล"} facts={[{ label: "การเชื่อมโยง", value: order.projectId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม" }]} />
        </ContextGrid>

        <DetailPageLayout
          aside={<>
            <DetailCard icon={FileCheck2} eyebrow="DOCUMENT CONTROL" title="ตรวจข้อมูลเอกสาร" meta={editable ? "แก้ไขได้ก่อนยื่นอนุมัติ" : "เอกสารถูกล็อกตามสถานะ"}>
              <div className={styles.formStack}>
                <label><span>วันที่ SO</span><input className="premium-input" type="date" value={form.orderDate} disabled={!editable} onChange={(event) => updateField("orderDate", event.target.value)} /></label>
                <label><span>กำหนดชำระ</span><input className="premium-input" type="date" value={form.paymentDueDate} disabled={!editable} onChange={(event) => updateField("paymentDueDate", event.target.value)} /></label>
                <label><span>หมายเหตุ</span><textarea className="premium-input" rows={4} value={form.notes} disabled={!editable} onChange={(event) => updateField("notes", event.target.value)} /></label>
              </div>
            </DetailCard>

            {(canEdit || reviewer) && <DetailCard icon={UserRound} eyebrow="ACTIONS" title="จัดการเอกสาร" meta="สิทธิ์เปลี่ยนตามสถานะและบทบาท">
              <div className={styles.actionStack}>
                {editable && <><button type="button" className="btn" disabled={!!busy} onClick={() => save(false)}><Save size={15} /> {busy === "save" ? "กำลังบันทึก…" : "บันทึกร่าง"}</button><button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}><Send size={15} /> บันทึกและยื่นอนุมัติ</button></>}
                {canReviewThis && order.status === "pending_approval" && <><button type="button" className="btn btn-success" disabled={!!busy} onClick={() => review("approve")}><CheckCircle2 size={15} /> อนุมัติและนับ Actual</button><button type="button" className="btn danger" disabled={!!busy} onClick={() => review("reject")}><Undo2 size={15} /> ตีกลับให้แก้ไข</button></>}
                {reviewer && ownSalesOrder && order.status === "pending_approval" && <span className="ui-badge" style={{ color: "var(--text-3)" }}>SO ที่คุณสร้าง/ยื่นเอง ต้องให้ผู้ตรวจสอบคนอื่นอนุมัติ</span>}
                {approved && reviewer && <button type="button" className="btn danger" disabled={!!busy} onClick={cancel}><XCircle size={15} /> ยกเลิก SO</button>}
                {order.status === "cancelled" && role === "admin" && <button type="button" className="btn" disabled={!!busy} onClick={() => requestAction("restore")}><RotateCcw size={15} /> คืนเป็นฉบับร่าง</button>}
                {role === "admin" && <button type="button" className="btn danger" disabled={!!busy} onClick={remove}><Trash2 size={15} /> ลบถาวร</button>}
              </div>
            </DetailCard>}

            <DetailCard icon={ClipboardList} eyebrow="DOCUMENT INFO" title="ข้อมูลควบคุม">
              <dl className={styles.auditList}>
                <div><dt>ผู้จัดทำ</dt><dd>{order.createdByName || "-"}</dd></div>
                <div><dt>ผู้ยื่น</dt><dd>{order.submittedByName || "-"}</dd></div>
                <div><dt>ผู้อนุมัติ</dt><dd>{order.approvedByName || "-"}</dd></div>
                <div><dt>กำหนดชำระ</dt><dd>{fmtDate(order.paymentDueDate)}</dd></div>
              </dl>
            </DetailCard>
          </>}
        >
          <DetailCard icon={ClipboardList} eyebrow="ORDER LINES" title="รายการสินค้าและบริการ" meta={`${sortedLines.length} รายการ · snapshot จาก QT Won`} actions={<Link href={`/sa/quotations/${order.quotationId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด QT ต้นทาง</Link>}>
            <div className={styles.tableWrap}>
              <table className={styles.linesTable}>
                <thead><tr><th>#</th><th>รหัส / รายละเอียด</th><th className={styles.num}>จำนวน</th><th className={styles.num}>ราคาต่อหน่วย</th><th className={styles.num}>ส่วนลด</th><th className={styles.num}>รวม</th></tr></thead>
                <tbody>{sortedLines.map((line, index) => <tr key={line.id}><td>{index + 1}</td><td><div className={styles.lineDescription}>{line.fgCode ? <small>{line.fgCode}</small> : null}<strong>{line.description || "-"}</strong></div></td><td className={`${styles.num} mono`}>{line.qty}</td><td className={`${styles.num} mono`}>{fmtMoney(line.unitPrice)}</td><td className={`${styles.num} mono`}>{fmtMoney(line.discountAmount)}</td><td className={`${styles.num} mono`}>{fmtMoney(line.lineTotal)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className={styles.totals}>
              <div><span>ยอดก่อนส่วนลด</span><strong>{fmtMoney(order.subtotal)}</strong></div>
              <div><span>ส่วนลดท้ายใบ</span><strong>{fmtMoney(order.discountAmount)}</strong></div>
              <div><span>VAT</span><strong>{fmtMoney(order.vatAmount)}</strong></div>
              <div className={styles.grandTotal}><span>ยอดรวมทั้งสิ้น</span><strong>{fmtMoney(order.totalAmount)}</strong></div>
              <div className={styles.actualTotal}><span>Actual ก่อน VAT</span><strong>{fmtMoney(order.actualAmount)}</strong></div>
            </div>
          </DetailCard>
        </DetailPageLayout>
      </div>
    </Workspace>
  );
}

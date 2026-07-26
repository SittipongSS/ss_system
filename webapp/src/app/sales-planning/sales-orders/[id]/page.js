"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BadgeCheck, Building2, CalendarDays, CircleDollarSign, ClipboardList,
  ExternalLink, FileCheck2, FileText, FolderKanban, Pencil, ShieldAlert,
  Trash2, Undo2, XCircle,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import ReadableText from "@/components/ui/ReadableText";
import StatusNotice from "@/components/ui/StatusNotice";
import Toast from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import SignatureReadyNotice from "@/components/account/SignatureReadyNotice";
import { useCan, useRole } from "@/lib/roleContext";
import {
  SALES_ORDER_CANCEL_REASONS,
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canWithdrawSalesOrderSubmission,
  cancelReasonLabel,
  isCustomerCancelReason,
} from "@/lib/sales/salesOrderWorkflow";
import { isSalesOrderSelfApproval } from "@/lib/sales/salesOrderApprovalOverride";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openSalesOrderPrintWindowPreferIssued, prepareSalesOrderPrintWindow, showSalesOrderPrintError } from "@/lib/sales/salesOrderPrint";
import { getCompanyProfileForPrint } from "@/lib/companyProfile";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import styles from "./page.module.css";

const STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)", description: "ตรวจสอบข้อมูลและรายการก่อนยื่นอนุมัติ" },
  pending_approval: { label: "รอ AE Supervisor อนุมัติ", color: "var(--amber)" },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)", description: "ยอดถูกนับเป็น Actual แล้ว" },
  rejected: { label: "ตีกลับให้แก้ไข", color: "var(--red)", description: "แก้ไขตามเหตุผลแล้วส่งอนุมัติใหม่" },
  approval_revoked: { label: "ยกเลิกอนุมัติแล้ว", color: "var(--red)", description: "ยอดหลุดจาก Actual แล้ว · แก้ฉบับเดิมไม่ได้ ต้องออก Rev." },
  revised: { label: "ออก Rev. แล้ว", color: "var(--amber)", description: "เก็บเป็นประวัติและมีฉบับแก้ไขใหม่แล้ว" },
  cancelled: { label: "ยกเลิก", color: "var(--red)", description: "เอกสารนี้ไม่ถูกนับเป็น Actual" },
};

const ACTION_MESSAGE = {
  save: "บันทึกร่างเรียบร้อยแล้ว",
  submit: "ยื่นอนุมัติเรียบร้อยแล้ว",
  approve: "อนุมัติ SO และอัปเดต Actual แล้ว",
  reject: "ตีกลับให้ผู้จัดทำแก้ไขแล้ว",
  withdraw: "ดึงกลับแล้ว",
  revoke: "ยกเลิกอนุมัติแล้ว — ยอดหลุดจาก Actual · ขั้นถัดไปคือออก Rev.",
  revise: "ออก Rev. ใหม่แล้ว",
  cancel: "ยกเลิก SO และคำนวณ Actual ใหม่แล้ว",
  restore: "คืน SO เป็นฉบับร่างแล้ว",
};

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("salesplan:edit");
  const canCreateFiling = useCan("sales:act");
  const role = useRole();
  const reviewer = ["admin", "ae_supervisor"].includes(role);
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ orderDate: "", paymentDueDate: "", notes: "" });
  const [error, setError] = useState("");
  const [errorActionUrl, setErrorActionUrl] = useState("");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [overrideForm, setOverrideForm] = useState(null);
  const [rejectForm, setRejectForm] = useState(null);
  const [workflowForm, setWorkflowForm] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [filingState, setFilingState] = useState({
    loading: true,
    filing: null,
    eligible: false,
    schemaReady: true,
    warnings: [],
    totalTax: 0,
    error: "",
  });
  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    const [res, filingRes] = await Promise.all([
      fetch(`/api/sales-planning/sales-orders/${id}`),
      fetch(`/api/tax/orders/from-sales-order?salesOrderId=${encodeURIComponent(id)}`),
    ]);
    const data = await res.json().catch(() => ({}));
    const filingData = await filingRes.json().catch(() => ({}));
    setFilingState(filingRes.ok
      ? {
        loading: false,
        filing: filingData.filing || null,
        eligible: !!filingData.eligible,
        schemaReady: filingData.schemaReady !== false,
        warnings: filingData.warnings || [],
        totalTax: Number(filingData.totalTax || filingData.filing?.amountToCollect || filingData.filing?.totalTax || 0),
        error: "",
      }
      : {
        loading: false,
        filing: null,
        eligible: false,
        schemaReady: true,
        warnings: [],
        totalTax: 0,
        error: filingData.error || "ตรวจสอบใบยื่นสรรพสามิตไม่สำเร็จ",
      });
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

  async function createFiling() {
    setBusy("filing");
    setError("");
    setToast(null);
    const res = await fetch("/api/tax/orders/from-sales-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salesOrderId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy("");
      setError(data.error || "สร้างใบยื่นสรรพสามิตไม่สำเร็จ");
      return false;
    }
    setFilingState({
      loading: false,
      filing: data,
      eligible: false,
      schemaReady: true,
      warnings: data.warnings || [],
      totalTax: Number(data.amountToCollect || data.totalTax || 0),
      error: "",
    });
    setBusy("");
    setToast({ kind: "success", msg: "สร้างใบยื่นสรรพสามิตจาก Sale Order เรียบร้อยแล้ว" });
    return true;
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaveState("dirty");
    setToast(null);
  }

  async function requestAction(action, payload = {}) {
    setBusy(action);
    setError("");
    setErrorActionUrl("");
    setToast(null);
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
      setErrorActionUrl(data.accountUrl || "");
      if (action === "save") setSaveState("error");
      return false;
    }
    if (action === "revise" && data?.id) {
      setBusy("");
      setToast({ kind: "success", msg: ACTION_MESSAGE.revise });
      router.push(`/sa/sales-orders/${data.id}`);
      return data;
    }
    await load();
    setBusy("");
    setToast({
      kind: action === "withdraw" ? "info" : "success",
      msg: ACTION_MESSAGE[action] || "อัปเดตเรียบร้อยแล้ว",
    });
    if (action === "save") setSaveState("saved");
    return data || true;
  }

  async function save() {
    const saved = await requestAction("save", form);
    if (!saved) return;
    setEditMode(false);
  }

  function openSubmitConfirm() {
    setConfirmState({
      title: "ยื่นอนุมัติ Sale Order",
      description: `ยืนยันยื่น ${order.orderNumber} ให้ AE Supervisor ตรวจอนุมัติหรือไม่`,
      detail: "หลังยื่นแล้วเอกสารจะถูกล็อก ผู้ยื่นดึงเอกสารของตัวเองกลับได้",
      confirmLabel: "ยื่นอนุมัติ",
      action: () => requestAction("submit"),
    });
  }

  function leaveEditMode() {
    setForm({ orderDate: order.orderDate || "", paymentDueDate: order.paymentDueDate || "", notes: order.notes || "" });
    setDirty(false);
    setSaveState("idle");
    setEditMode(false);
  }

  async function review(action) {
    if (action === "approve") {
      setConfirmState({
        title: "อนุมัติ Sale Order",
        description: `ยืนยันอนุมัติใบสั่งขาย ${order.orderNumber} หรือไม่`,
        detail: `ยอด Actual ${fmtMoney(order.actualAmount)} จะถูกนับเข้าระบบทันที`,
        confirmLabel: "อนุมัติและนับ Actual",
        action: () => requestAction("approve"),
      });
      return;
    }
    setRejectForm({ reason: "" });
  }

  async function submitReject() {
    const reason = rejectForm?.reason.trim();
    if (!reason) return;
    const ok = await requestAction("reject", { reason });
    if (ok) setRejectForm(null);
  }

  async function submitWorkflowAction() {
    const action = workflowForm?.action;
    const reason = String(workflowForm?.reason || "").trim();
    if (!action || reason.length < 10) return;
    // ส่งเวอร์ชันที่หน้านี้เห็นไปด้วยเสมอ — ไม่งั้นด่านกันแท็บค้างฝั่ง RPC เป็น no-op
    // (server จะปฏิเสธคำขอที่ไม่มีค่านี้)
    const result = await requestAction(action, { reason, expectedUpdatedAt: order?.updatedAt });
    if (result) setWorkflowForm(null);
  }

  async function runConfirmed() {
    const action = confirmState?.action;
    if (!action) return;
    setConfirmBusy(true);
    try {
      const completed = await action();
      if (completed !== false) setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  // เหตุผล override เป็น optional แล้ว (มติ 2026-07-25) — โมดัลเหลือหน้าที่ "ยืนยัน" อย่างเดียว
  // ระบบยังบันทึกหลักฐานว่าใครอนุมัติใบตัวเองเมื่อไหร่ (approvalMode=admin_override + contextSnapshot)
  async function approveWithAdminOverride() {
    const ok = await requestAction("approve", { overrideReason: "" });
    if (ok) setOverrideForm(null);
  }

  // ยกเลิก SO ผ่าน modal (มติ 2026-07-18): เลือกเหตุผลมาตรฐาน + หมายเหตุ (บังคับเมื่อ "อื่น ๆ")
  // เหตุกลุ่มลูกค้า + SO อนุมัติแล้ว → เสนอ "ย้อน Won" (ถอยดีลออกจาก Won).
  const [cancelForm, setCancelForm] = useState(null); // null = ปิด; { code, note, reverseTo, lostReason } = เปิด
  const openCancel = () => setCancelForm({ code: "", note: "", reverseTo: "", lostReason: "" });
  const showReversal = !!cancelForm && order?.status === "approved" && isCustomerCancelReason(cancelForm.code);
  async function doCancel() {
    if (!cancelForm?.code) { setError("กรุณาเลือกเหตุผลที่ยกเลิก"); return; }
    if (cancelForm.code === "other" && !cancelForm.note.trim()) { setError('เลือก "อื่น ๆ" ต้องระบุหมายเหตุ'); return; }
    const payload = { reasonCode: cancelForm.code, reason: cancelForm.note.trim() };
    if (showReversal && cancelForm.reverseTo) {
      if (cancelForm.reverseTo === "lost" && !cancelForm.lostReason.trim()) { setError('เลือก "Lost" ต้องระบุเหตุผล'); return; }
      payload.reverseTo = cancelForm.reverseTo;
      payload.lostReason = cancelForm.lostReason.trim();
    }
    const ok = await requestAction("cancel", payload);
    if (ok) setCancelForm(null);
  }

  async function deleteOrder(url) {
    setBusy("delete");
    setError("");
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); setError(data.error || "ลบ Sale Order ไม่สำเร็จ"); return false; }
    router.push("/sa/sales-orders");
    return true;
  }

  function remove() {
    setConfirmState({
      title: "ลบ Sale Order ฉบับร่าง",
      description: `ต้องการลบ ${order.orderNumber} ถาวรหรือไม่`,
      detail: "การลบไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบฉบับร่าง",
      tone: "danger",
      action: () => deleteOrder(`/api/sales-planning/sales-orders/${id}`),
    });
  }

  // บังคับลบ (break-glass ผู้ดูแลระบบ, mig 0152): ใบที่มีหลักฐานลายเซ็น/ฉบับตรึงลบทางปกติไม่ได้
  // ขั้นตอน: ขอพรีวิวว่าจะทำลายอะไร → ให้ยืนยันโดยเห็นรายการจริง → ค่อยลบ
  async function forceRemove() {
    setBusy("delete");
    setError("");
    const preview = await fetch(`/api/sales-planning/sales-orders/${id}?dryRun=1`, { method: "DELETE" })
      .then((r) => r.json()).catch(() => null);
    setBusy("");
    if (!preview) { setError("ขอพรีวิวการลบไม่สำเร็จ"); return; }
    const lines = (preview.cascade || []).map((c) => `· ${c.label}: ${c.count}`).join("\n");
    const notes = (preview.notes || []).join("\n");
    setConfirmState({
      title: "บังคับลบ Sale Order พร้อมหลักฐาน",
      description: `ต้องการบังคับลบ ${order.orderNumber} ถาวรหรือไม่`,
      detail: <span style={{ whiteSpace: "pre-line" }}>สิ่งที่จะถูกทำลาย:{"\n"}{lines || "· (ไม่มีข้อมูลพ่วง)"}{notes ? `\n\n${notes}` : ""}</span>,
      confirmLabel: "ยืนยันบังคับลบ",
      tone: "danger",
      action: () => deleteOrder(`/api/sales-planning/sales-orders/${id}?force=1`),
    });
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
      const [res, company] = await Promise.all([
        fetch(`/api/sales-planning/sales-orders/${id}`),
        getCompanyProfileForPrint(),
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ไม่สามารถโหลดข้อมูลใบสั่งขายได้");
      // ฉบับตรึงก่อน (approved) — มี company + ลายเซ็นฝังจากตอนอนุมัติ; ไม่มี snapshot → เรนเดอร์สดพร้อม company profile
      await openSalesOrderPrintWindowPreferIssued(data, printWindow, company);
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
  const ownSalesOrder = isSalesOrderSelfApproval(order, order.meId);
  const canReviewThis = reviewer && !ownSalesOrder;
  const canAdminOverride = role === "admin" && ownSalesOrder && order.status === "pending_approval";
  const canEditDocument = canEdit && ["draft", "rejected"].includes(order.status);
  const editable = canEditDocument && editMode;
  // ดึงกลับ = ของผู้ยื่นเท่านั้น (มติ 2026-07-26) — เงื่อนไขเดียวกับด่านฝั่ง API
  const canWithdraw = canWithdrawSalesOrderSubmission(order, { userId: order.meId });
  // สองขั้น (mig 0166): ยกเลิกอนุมัติ → สถานะกลางที่แก้ไม่ได้ → ออก Rev.
  const canRevoke = canRevokeSalesOrderApproval(order, { reviewer });
  const canRevise = canIssueSalesOrderRevision(order, { reviewer });
  const status = STATUS[order.status] || { label: order.status, color: "var(--text-3)", description: "" };
  const workflowIndex = order.status === "approved" ? 3
    : ["pending_approval", "approval_revoked"].includes(order.status) ? 1 : 0;
  const workflow = [
    { label: "จัดทำร่าง", hint: order.createdByName || "ผู้จัดทำ" },
    { label: "ยื่นอนุมัติ", hint: order.submittedAt ? fmtDate(order.submittedAt) : "รอผู้จัดทำ" },
    { label: "AE Supervisor ตรวจ", hint: order.status === "rejected" ? "ตีกลับแล้ว" : order.approvedByName ? `${order.approvedByName}${order.approvalMode === "admin_override" ? " · Admin Override" : ""}` : "รอตรวจ" },
    { label: "นับ Actual", hint: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
  ];
  const workflowSteps = workflowStepsFromIndex(workflow, workflowIndex, order.status === "cancelled");
  const primaryAction = editable
    ? {
        id: "save",
        kind: "save",
        label: busy === "save" ? "กำลังบันทึก…" : "บันทึกร่าง",
        disabled: !dirty,
        disabledReason: !dirty ? "ยังไม่มีข้อมูลที่เปลี่ยนแปลง" : undefined,
        onClick: save,
      }
    : canEditDocument
      ? { id: "submit", kind: "submit", label: "ยื่นอนุมัติ", onClick: openSubmitConfirm }
    : canReviewThis && order.status === "pending_approval"
      ? { id: "approve", kind: "approve", label: "อนุมัติและนับ Actual", onClick: () => review("approve") }
    // สถานะกลางหลังยกเลิกอนุมัติ: ออก Rev. เป็นทางเดียวที่เดินต่อได้ จึงเป็นปุ่มหลัก
    : canRevise
      ? { id: "revise", kind: "revise", label: "ออก Rev.", onClick: () => setConfirmState({
          title: "ออก Rev. ใหม่",
          description: `ระบบจะสร้างร่าง Rev. ใหม่จาก ${order.orderNumber} และเก็บฉบับนี้เป็นประวัติ`,
          detail: order.revisionReason ? `เหตุผลที่บันทึกไว้ตอนยกเลิกอนุมัติ: ${order.revisionReason}` : undefined,
          confirmLabel: "สร้างร่าง Rev. ใหม่",
          action: () => requestAction("revise", { expectedUpdatedAt: order?.updatedAt }),
        }) }
      : null;
  const secondaryActions = [
    { id: "edit", kind: "edit", icon: Pencil, label: "แก้ไขข้อมูล", variant: "outline", visible: canEditDocument && !editMode, onClick: () => setEditMode(true) },
    { id: "leave-edit", kind: "cancel", label: "ยกเลิกแก้ไข", variant: "ghost", visible: editable, onClick: leaveEditMode },
    { id: "withdraw", kind: "withdraw", variant: "outline", visible: canWithdraw, onClick: () => setWorkflowForm({ action: "withdraw", reason: "" }) },
    // ขั้นที่ 1 — ยอด Actual หลุดที่ปุ่มนี้ จึงต้องกรอกเหตุผล (ใช้ต่อในขั้นออก Rev.)
    { id: "revoke", kind: "revoke", variant: "outline", visible: canRevoke, disabled: !!filingState.filing, disabledReason: filingState.filing ? "มีใบยื่นสรรพสามิตแล้ว ต้องจัดการใบยื่นก่อน" : undefined, onClick: () => setWorkflowForm({ action: "revoke", reason: "" }) },
    { id: "override", kind: "approve", label: "อนุมัติแบบ Admin Override", variant: "outline", visible: canAdminOverride, onClick: () => setOverrideForm({ reason: "" }) },
    // label ชัดเจนว่าเป็นการกู้ SO ที่ "ยกเลิก" แล้ว — เดิมใช้ default "คืนเป็นฉบับร่าง"
    // ซึ่งความหมายชนกับ "ดึงกลับ" ที่เคยยืม kind:"restore" ตัวเดียวกัน (B8)
    { id: "restore", kind: "restore", label: "กู้คืนจากการยกเลิก", visible: order.status === "cancelled" && role === "admin", onClick: () => requestAction("restore") },
    { id: "print", kind: "print", label: "ออกเอกสาร", variant: "ghost", disabled: dirty, disabledReason: dirty ? "บันทึกข้อมูลล่าสุดก่อนออกเอกสาร" : undefined, onClick: printDocument },
  ];
  const dangerActions = [
    { id: "reject", kind: "reject", label: "ตีกลับให้แก้ไข", visible: canReviewThis && order.status === "pending_approval", onClick: () => review("reject") },
    { id: "delete", kind: "delete", icon: Trash2, label: "ลบฉบับร่างถาวร", visible: role === "admin" && canHardDeleteSalesOrder(order), onClick: remove },
    { id: "force-delete", kind: "delete", icon: ShieldAlert, label: "บังคับลบพร้อมหลักฐาน", visible: role === "admin" && !canHardDeleteSalesOrder(order), onClick: forceRemove },
    {
      id: "cancel",
      kind: "cancel",
      label: "ยกเลิก SO",
      visible: approved && reviewer,
      disabled: !!filingState.filing,
      disabledReason: filingState.filing ? "มีใบยื่นสรรพสามิตแล้ว ต้องจัดการใบยื่นก่อน" : undefined,
      onClick: openCancel,
    },
  ];

  return (
    <Workspace hideHeader back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }}>
      <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="SALE ORDER · COMMERCIAL APPROVAL"
          title={order.orderNumber}
          description={`${order.customerName || "ไม่ระบุลูกค้า"} · ${order.deal?.title || "ไม่ระบุดีล"}`}
          badges={<><SalesStateBadge label={status.label} color={status.color} />{order.signatureEvidenceId && <span className="ui-badge" style={{ color: "var(--green)" }}>มีหลักฐานลายเซ็น</span>}{order.approvalMode === "admin_override" && <span className="ui-badge" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>Admin Override</span>}</>}
          facts={[
            { icon: CalendarDays, label: "วันที่ SO", value: fmtDate(order.orderDate) },
            { icon: FileText, label: "อ้างอิง QT", value: order.quotation?.quoteNumber || "-" },
            { icon: CircleDollarSign, label: "ยอดก่อน VAT", value: fmtMoney(order.actualAmount) },
            { icon: BadgeCheck, label: "Actual ในระบบ", value: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
          ]}
        >
          <p className={styles.statusDescription}>{status.description}</p>
        </SalesDetailOverview>

        {error && (
          <StatusNotice
            tone="error"
            action={errorActionUrl ? <Link href={errorActionUrl} className="btn ghost sm">ไปบัญชีของฉัน</Link> : null}
          >
            {error}
          </StatusNotice>
        )}
        {order.rejectionReason && <div className={styles.rejection}><Undo2 size={17} /><div><strong>ตีกลับโดย {order.rejectedByName || "AE Supervisor"}</strong><ReadableText text={order.rejectionReason} lines={4} /></div></div>}

        <ContextGrid>
          <ContextCard icon={Building2} href={order.customerId ? `/database/customers/${order.customerId}` : undefined} eyebrow="ลูกค้า" title={order.customerName || "-"} subtitle="ข้อมูลลูกค้าของเอกสาร" facts={[{ label: "สถานะ SO", value: status.label }]} />
          <ContextCard icon={FolderKanban} href={`/sa/deals/${order.dealId}`} eyebrow="ดีล" title={order.deal?.title || "-"} subtitle={`${order.deal?.team || "-"} · ${order.deal?.ownerName || "-"}`} facts={[{ label: "Stage", value: order.deal?.stage || "-" }]} />
          <ContextCard icon={FileText} href={`/sa/quotations/${order.quotationId}`} eyebrow="ใบเสนอราคา Won" title={order.quotation?.quoteNumber || "-"} subtitle={`วันที่หลักฐาน ${fmtDate(order.quotation?.wonDocDate)}`} facts={[{ label: "ไฟล์หลักฐาน", value: `${order.quotation?.wonAttachments?.length || 0} ไฟล์` }]} />
          <ContextCard icon={Building2} href={order.projectId ? `/sa/projects/${order.projectId}` : undefined} eyebrow="โครงการ" title={order.project?.name || order.project?.code || "-"} subtitle={order.project?.code || "ข้อมูลโครงการที่ผูกกับดีล"} facts={[{ label: "การเชื่อมโยง", value: order.projectId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม" }]} />
        </ContextGrid>

        <DetailPageLayout
          asideLabel="สรุปและจัดการ Sale Order"
          aside={<>
            <DocumentSummaryCard
              title="ยอดสุทธิ Sale Order"
              total={fmtMoney(order.totalAmount)}
              status={status.label}
              statusColor={status.color}
              rows={[
                { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(order.subtotal) },
                { id: "discount", label: "ส่วนลดท้ายใบ", value: fmtMoney(order.discountAmount) },
                { id: "vat", label: "VAT", value: fmtMoney(order.vatAmount) },
                { id: "actual", label: "Actual ก่อน VAT", value: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
              ]}
            />

            <DocumentControlCard
              status={status.label}
              statusColor={status.color}
              statusDescription={status.description}
              workflowSteps={workflowSteps}
              primaryAction={primaryAction}
              secondaryActions={secondaryActions}
              dangerActions={dangerActions}
              busy={!!busy}
              notices={<>
                {editable ? <SaveStatus status={saveState} /> : null}
                {canAdminOverride
                  ? <span className="ui-badge" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>ไม่มีผู้ตรวจสอบคนที่สอง — ใช้สิทธิ์ฉุกเฉินได้</span>
                  : reviewer && ownSalesOrder && role !== "admin" && order.status === "pending_approval"
                    ? <span className="ui-badge" style={{ color: "var(--text-3)" }}>SO ที่คุณสร้าง/ยื่นเอง ต้องให้ผู้ตรวจสอบคนอื่นอนุมัติ</span>
                    : null}
              </>}
              evidence={(
                <SignatureReadyNotice
                  active={(canReviewThis && order.status === "pending_approval") || canAdminOverride || editable}
                  docLabel="Sale Order นี้"
                />
              )}
            />

            <DetailCard icon={FileCheck2} eyebrow="DOCUMENT CONTROL" title="ตรวจข้อมูลเอกสาร">
              <div className={styles.formStack}>
                <label><span>วันที่ SO</span><input className="premium-input" type="date" value={form.orderDate} disabled={!editable} onChange={(event) => updateField("orderDate", event.target.value)} /></label>
                <label><span>กำหนดชำระ</span><input className="premium-input" type="date" value={form.paymentDueDate} disabled={!editable} onChange={(event) => updateField("paymentDueDate", event.target.value)} /></label>
                {editable
                  ? <label><span>หมายเหตุ</span><textarea className="premium-input" rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
                  : <div className={styles.readonlyFormField}><span>หมายเหตุ</span><div className="readable-field"><ReadableText text={form.notes} lines={5} empty={<span className="readable-field-empty">ไม่มีหมายเหตุ</span>} /></div></div>}
              </div>
            </DetailCard>

            <DetailCard icon={ClipboardList} eyebrow="DOCUMENT INFO" title="ข้อมูลควบคุม">
              <dl className={styles.auditList}>
                <div><dt>ผู้จัดทำ</dt><dd>{order.createdByName || "-"}</dd></div>
                <div><dt>ผู้ยื่น</dt><dd>{order.submittedByName || "-"}</dd></div>
                <div><dt>ผู้อนุมัติ</dt><dd>{order.approvedByName || "-"}</dd></div>
                {order.approvalMode === "admin_override" && <div><dt>รูปแบบอนุมัติ</dt><dd><span className="ui-badge" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>Admin Override</span></dd></div>}
                {order.approvalOverrideReason && <div><dt>เหตุผล Override</dt><dd><ReadableText text={order.approvalOverrideReason} lines={3} /></dd></div>}
                <div><dt>กำหนดชำระ</dt><dd>{fmtDate(order.paymentDueDate)}</dd></div>
                {order.status === "cancelled" && <div><dt>เหตุยกเลิก</dt><dd><ReadableText text={`${cancelReasonLabel(order.cancelReasonCode)}${order.cancelReason ? ` — ${order.cancelReason}` : ""}`} lines={3} /></dd></div>}
              </dl>
            </DetailCard>

            {order.revisionHistory?.length > 1 ? (
              <DetailCard icon={FileText} eyebrow="REVISION HISTORY" title="ประวัติฉบับแก้ไข">
                <div className={styles.revisionList}>
                  {order.revisionHistory.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/sa/sales-orders/${revision.id}`}
                      className={styles.revisionLink}
                      aria-current={revision.id === order.id ? "page" : undefined}
                    >
                      <span>
                        <strong>{revision.orderNumber}</strong>
                        <small>{fmtDate(revision.orderDate)} · {STATUS[revision.status]?.label || revision.status}</small>
                      </span>
                      {revision.id === order.id ? <span className="ui-badge">ฉบับนี้</span> : <ExternalLink size={13} />}
                    </Link>
                  ))}
                </div>
              </DetailCard>
            ) : null}

            <RelatedDocumentCard
              icon={FileCheck2}
              title="การยื่นชำระสรรพสามิต"
              meta={filingState.filing
                ? `${filingState.filing.status || "draft"} · ${fmtMoney(filingState.filing.amountToCollect ?? filingState.filing.totalTax)}`
                : filingState.loading
                  ? "กำลังตรวจสอบเอกสารปลายทาง"
                  : filingState.eligible
                    ? `ยอดที่ต้องเรียกเก็บ ${fmtMoney(filingState.totalTax)}`
                    : "ยังไม่มีใบยื่นที่เชื่อมกับ Sale Order นี้"}
              actions={filingState.filing ? (
                <Link href={`/tax/filings/${filingState.filing.id}`} className="btn ghost sm">
                  <ExternalLink size={13} /> เปิดใบยื่น
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={
                    filingState.loading
                    || !filingState.schemaReady
                    || !filingState.eligible
                    || !canCreateFiling
                    || busy === "filing"
                  }
                  onClick={createFiling}
                >
                  <FileCheck2 size={13} />
                  {busy === "filing" ? "กำลังสร้าง…" : "สร้างใบยื่นชำระ"}
                </button>
              )}
            >
              {filingState.error
                ? filingState.error
                : !filingState.schemaReady
                  ? "ระบบเชื่อมเอกสารยังไม่พร้อมใช้งาน"
                  : filingState.filing
                    ? "ใบยื่นนี้สร้างและดูแลโดยโมดูลภาษี รายการและยอดภาษีถูก snapshot จาก SO ตอนสร้าง"
                    : order.status !== "approved"
                      ? "สร้างได้หลัง Sale Order อนุมัติแล้ว"
                      : !filingState.eligible
                        ? "Sale Order นี้ไม่มีรายการสินค้าสรรพสามิตที่พร้อมสร้างใบยื่น"
                        : filingState.warnings.length
                          ? `${filingState.warnings.length} รายการควรตรวจทะเบียนสรรพสามิตเพิ่มเติม แต่ยังสร้างใบยื่นได้`
                          : "พร้อมสร้างใบยื่นจากรายการสินค้าสรรพสามิตใน Sale Order"}
            </RelatedDocumentCard>
          </>}
        >
          <DetailCard icon={ClipboardList} eyebrow="ORDER LINES" title="รายการสินค้าและบริการ" meta={`${sortedLines.length} รายการ · snapshot จาก QT Won`} actions={<Link href={`/sa/quotations/${order.quotationId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด QT ต้นทาง</Link>}>
            <QuotationReadOnlyLineItems
              lines={sortedLines}
              summaryRows={[
                { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(order.subtotal) },
                { id: "discount", label: "ส่วนลดท้ายใบ", value: Number(order.discountAmount || 0) > 0 ? `-${fmtMoney(order.discountAmount)}` : "-" },
                { id: "vat", label: "VAT", value: fmtMoney(order.vatAmount) },
              ]}
              grandTotal={fmtMoney(order.totalAmount)}
              highlightRows={[{ id: "actual", label: "Actual ก่อน VAT", value: fmtMoney(order.actualAmount), tone: "success" }]}
            />
          </DetailCard>
        </DetailPageLayout>
      </div>

      {overrideForm && (
        <Modal open onClose={() => setOverrideForm(null)} title="อนุมัติแบบ Admin Override" size="sm" dismissible={!busy}>
          <div className="drawer-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="glass-panel" style={{ padding: "10px 12px", borderColor: "var(--amber)", background: "var(--amber-soft)", display: "flex", gap: 10 }}>
              <ShieldAlert size={20} color="var(--amber)" aria-hidden="true" />
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>
                <strong style={{ color: "var(--text)" }}>กรณีพิเศษเมื่อยังไม่มีผู้ตรวจสอบคนที่สอง</strong>
                <p style={{ margin: "4px 0 0" }}>คุณเป็นผู้สร้างหรือผู้ยื่นใบนี้ — การอนุมัติจะนับ Actual {fmtMoney(order.actualAmount)} ทันที และบันทึกไว้กับหลักฐานลายเซ็นถาวรว่าเป็นการอนุมัติแบบ Admin Override</p>
              </div>
            </div>
            <div className="action-bar" style={{ marginTop: 0 }}>
              <button type="button" className="btn ghost" onClick={() => setOverrideForm(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-warning" onClick={approveWithAdminOverride} disabled={!!busy}><ShieldAlert size={15} /> {busy === "approve" ? "กำลังอนุมัติ…" : "ยืนยัน Override และนับ Actual"}</button>
            </div>
          </div>
        </Modal>
      )}

      <ReasonDialog
        open={!!workflowForm}
        title={workflowForm?.action === "revoke" ? "ยกเลิกอนุมัติ Sale Order" : "ดึงกลับ Sale Order"}
        description={workflowForm?.action === "revoke"
          ? `SO ${order.orderNumber} จะหลุดจากยอด Actual ทันที และแก้ฉบับเดิมไม่ได้ — ขั้นถัดไปคือกด "ออก Rev."`
          : `SO ${order.orderNumber} จะกลับเป็นฉบับร่างและแก้ไขได้`}
        detail={workflowForm?.action === "revoke"
          ? `ยอด Actual ${fmtMoney(order.actualAmount)} จะถูกนำออกจนกว่า Rev. ใหม่จะอนุมัติ · เหตุผลนี้จะใช้ต่อในขั้นออก Rev. ไม่ต้องกรอกซ้ำ`
          : "หลักฐานการยื่นเดิมยังคงอยู่ในประวัติ หลังแก้ไขต้องยื่นและลงนามใหม่"}
        label="เหตุผล"
        value={workflowForm?.reason || ""}
        onChange={(reason) => setWorkflowForm((current) => ({ ...current, reason }))}
        onClose={() => setWorkflowForm(null)}
        onConfirm={submitWorkflowAction}
        confirmLabel={workflowForm?.action === "revoke" ? "ยืนยันยกเลิกอนุมัติ" : "ยืนยันดึงกลับ"}
        placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร"
        minLength={10}
        maxLength={500}
        tone={workflowForm?.action === "revoke" ? "danger" : "warning"}
        busy={busy === workflowForm?.action}
      />

      <ReasonDialog
        open={!!rejectForm}
        title="ตีกลับให้ผู้จัดทำแก้ไข"
        label="เหตุผลที่ตีกลับ"
        value={rejectForm?.reason || ""}
        onChange={(reason) => setRejectForm({ reason })}
        onClose={() => setRejectForm(null)}
        onConfirm={submitReject}
        confirmLabel="ยืนยันตีกลับ"
        placeholder="ระบุสิ่งที่ต้องแก้ไข"
        maxLength={500}
        busy={busy === "reject"}
      />

      {cancelForm && (
        <Modal open onClose={() => setCancelForm(null)} title="ยกเลิก Sale Order" size="sm" dismissible={!busy}>
          <div className="p-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--text-2)", margin: 0 }}>หากอนุมัติแล้ว ยอด Actual จะถูกนำออกทันที — เลือกเหตุผลที่ยกเลิก</p>
            <label style={{ display: "block", fontSize: 13 }}>
              <span style={{ color: "var(--text-2)" }}>เหตุผล</span>
              <Select value={cancelForm.code} onChange={(e) => setCancelForm((f) => ({ ...f, code: e.target.value }))}>
                <option value="">— เลือกเหตุผล —</option>
                {SALES_ORDER_CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </Select>
            </label>
            <label style={{ display: "block", fontSize: 13 }}>
              <span style={{ color: "var(--text-2)" }}>หมายเหตุ {cancelForm.code === "other" ? "(บังคับ)" : "(ไม่บังคับ)"}</span>
              <textarea className="textarea-premium" rows={2} value={cancelForm.note} onChange={(e) => setCancelForm((f) => ({ ...f, note: e.target.value }))} placeholder="รายละเอียดเพิ่มเติม" />
            </label>
            {showReversal && (
              <div className="glass-panel" style={{ padding: "10px 12px", borderColor: "var(--amber)", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text)" }}>เหตุนี้เป็นฝั่งลูกค้า — ต้องการ <strong>ย้อน Won</strong> (ถอยดีลออกจาก Won + ถอนยอด Actual) ด้วยไหม?</span>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === ""} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "" }))} /> ไม่ย้อน (ยกเลิกเฉพาะ SO — ดีลคง Won)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === "reopen"} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "reopen" }))} /> ย้อน → เปิดดีลใหม่ (กลับสถานะก่อน Won)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === "lost"} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "lost" }))} /> ย้อน → ปิดดีลเป็น Lost (ลูกค้าเลิกถาวร)
                </label>
                {cancelForm.reverseTo === "lost" && (
                  <textarea className="textarea-premium" rows={2} value={cancelForm.lostReason} onChange={(e) => setCancelForm((f) => ({ ...f, lostReason: e.target.value }))} placeholder="เหตุผลที่ดีลไม่สำเร็จ (บังคับ)" />
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setCancelForm(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-danger" onClick={doCancel} disabled={!!busy || !cancelForm.code}><XCircle size={15} /> ยืนยันยกเลิก SO</button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onClose={() => { if (!confirmBusy) setConfirmState(null); }}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

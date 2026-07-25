"use client";

// Editor ใบเสนอราคา FM-SA-01 (/sa/quotations/[id] — เฟส D):
// แก้รายการ+ส่วนลดรายบรรทัด · ส่วนลดท้ายใบ · VAT · เงื่อนไขชำระ · หมายเหตุ (เลือกจาก
// template ต่อบริการ) · ส่ง/รับ/Revise/พิมพ์. ยอดเงินคิดจริงที่ server —
// หน้านี้พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, ExternalLink, FileClock, MapPin, Plus, Undo2, UserRound } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ContextualRightRail } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard } from "@/components/ui/DocumentControlPanel";
import Modal from "@/components/Modal";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationNotes from "@/components/salesPlanning/QuotationNotes";
import QuotationPeopleFields, { quotationPeopleFromMetadata } from "@/components/salesPlanning/QuotationPeopleFields";
import QuotationLineItems, { newManualLine, newProductLine } from "@/components/salesPlanning/QuotationLineItems";
import SignatureReadyNotice from "@/components/account/SignatureReadyNotice";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import { UNACCEPT_REASON_MAX, canUnacceptQuotation, normalizeUnacceptReason, unacceptReasonError } from "@/lib/sales/quotationUnaccept";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { DEAL_TYPE_LABELS, dealTypeOf, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openQuotePrintWindowPreferIssued, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { cachedFetchJson } from "@/lib/apiCache";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import styles from "./page.module.css";

const money = (v) => fmtMoney(v);
const EDITABLE = new Set(["draft", "sent", "rejected"]);

export default function QuotationEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";
  const canEditCap = useCan("salesplan:edit");
  const role = useRole();

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState({ quoteDate: "", validUntil: "", validityDays: "", notes: "", discountType: "", discountValue: "", vatRate: 0 });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorActionUrl, setErrorActionUrl] = useState("");
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  // ย้อนการรับ (มติ 2026-07-21): null = ปิด; { reason } = เปิดฟอร์มเหตุผลบังคับ
  const [unacceptForm, setUnacceptForm] = useState(null);
  const [products, setProducts] = useState([]);
  const [payment, setPayment] = useState({ type: "full", paymentMethod: "", paymentTerms: "", installments: [], presetVersionId: null });
  const [notesPresetVersionId, setNotesPresetVersionId] = useState(null);
  // ผู้รับผิดชอบเอกสาร (เหมือนไทม์ไลน์ — มติผู้ใช้ 2026-07-15) เก็บใน metadata
  const [people, setPeople] = useState({ aeOwner: "", preparedBy: "", aeSupervisor: "" });

  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดใบเสนอราคาไม่สำเร็จ");
      const q = await res.json();
      setQuote(q);
      setLines((q.lines || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((line) => ({
        ...line,
        _lineKind: line.productId || line.fgCode ? "product" : "manual",
      })));
      setForm({
        quoteDate: q.quoteDate || "",
        validUntil: q.validUntil || "",
        validityDays: validityDaysBetween(q.quoteDate, q.validUntil),
        notes: q.notes || "",
        discountType: q.discountType || "",
        discountValue: q.discountValue ?? "",
        vatRate: Number(q.vatRate || 0),
      });
      const pp = q.paymentPlan;
      setPayment({
        type: pp?.type === "installment" ? "installment" : "full",
        paymentMethod: pp?.paymentMethod || "",
        paymentTerms: q.paymentTerms || "",
        installments: pp?.type === "installment" && Array.isArray(pp.installments)
          ? pp.installments.map((r) => ({ label: r.label || "", percent: r.percent ?? 0, note: r.note || "" }))
          : [],
        presetVersionId: q.metadata?.paymentPresetVersionId || null,
      });
      setNotesPresetVersionId(q.metadata?.remarksPresetVersionId || null);
      setPeople(quotationPeopleFromMetadata(q.metadata));
      setDirty(false);
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    cachedFetchJson("/api/products").then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const canEditDocument = !!quote && canEditCap && EDITABLE.has(quote.status);
  // สองขั้นแยกกัน (mig 0155): needsSubmit = ร่างที่ผู้จัดทำยังไม่กดยื่น ·
  // awaitingApproval = ยื่นแล้วรอเจ้าของดีล. ทั้งคู่บล็อกปุ่มส่ง/Won เหมือนกัน แต่ปุ่มที่
  // ต้องกดต่อคนละตัว — เดิมมีสถานะเดียว (pending) ทำให้อนุมัติใบที่ยังกรอกไม่เสร็จได้
  const needsSubmit = !!quote && quote.approvalStatus === "not_submitted";
  const awaitingApproval = !!quote && quote.approvalStatus === "pending";
  // ใบ grandfather (not_required) และใบที่อนุมัติแล้ว (approved) ไม่บล็อก
  const needsApproval = needsSubmit || awaitingApproval;
  // ลบ: draft ทุกคนที่แก้ได้ / แอดมิน (superuser) ลบได้ทุกสถานะ (มติผู้ใช้ 2026-07-15)
  const canDeleteDocument = !!quote && (role === "admin" || (canEditCap && quote.status !== "accepted"
    && (quote.status === "draft" || isSuperuser(role))));
  const editable = canEditDocument && editMode;
  const editDisabledReason = canEditDocument && !editMode
    ? "อยู่ในโหมดอ่านอย่างเดียว — กด “แก้ไขข้อมูล” ในกล่องจัดการเอกสารก่อน"
    : !canEditDocument
      ? "เอกสารสถานะนี้ไม่อนุญาตให้แก้ไข"
      : "";

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate || 0,
  }), [lines, form.discountType, form.discountValue, form.vatRate]);

  const updateLines = (nextLines) => { setLines(nextLines); setDirty(true); };
  const addLine = () => updateLines([...lines, newManualLine()]);
  const addProductLine = () => updateLines([...lines, newProductLine()]);
  const setF = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const paymentPlanPayload = () => (payment.type === "installment"
    ? { type: "installment", paymentMethod: payment.paymentMethod.trim() || null, installments: payment.installments.map((row) => ({ label: row.label, percent: Number(row.percent) || 0, note: row.note })) }
    : { type: "full", paymentMethod: payment.paymentMethod.trim() || null });
  const updatePayment = (nextPayment) => { setPayment(nextPayment); setDirty(true); };

  const quotationPayload = (extra = {}) => ({
    lines: lines.map((line) => {
      const payloadLine = { ...line };
      delete payloadLine._lineKind;
      delete payloadLine._noteOpen;
      // หมายเหตุรายบรรทัดเก็บใน metadata.note — ตัดช่องว่าง/คีย์เปล่าก่อนส่ง
      const note = (payloadLine.metadata?.note || "").trim();
      payloadLine.metadata = { ...(payloadLine.metadata || {}) };
      if (note) payloadLine.metadata.note = note; else delete payloadLine.metadata.note;
      return payloadLine;
    }),
    quoteDate: form.quoteDate,
    validUntil: form.validUntil || null,
    paymentTerms: payment.paymentTerms,
    notes: form.notes,
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate,
    paymentPlan: paymentPlanPayload(),
    // ชุดเงื่อนไขการค้าที่ใบนี้ตั้งต้นมาจาก — server ตรวจว่ามีจริง+เผยแพร่ก่อนตรึง
    metadata: {
      ...people,
      paymentPresetVersionId: payment.presetVersionId || null,
      remarksPresetVersionId: notesPresetVersionId || null,
    },
    ...extra,
  });

  const save = async (extra = {}) => {
    const paymentValidation = validatePaymentPlan(paymentPlanPayload());
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return false;
    }
    setBusy("save");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload(extra)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      await load();
      router.replace(`/sa/quotations/${id}`);
      return true;
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  // ยื่นอนุมัติ (ผู้จัดทำ) — not_submitted → pending + ลงนามผู้เสนอราคา (mig 0155).
  // ต้องบันทึกก่อนเหมือนการอนุมัติ เพราะหลักฐานผูก fingerprint ของเนื้อหาที่บันทึกแล้ว
  const submitForApproval = () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อนยื่นอนุมัติ"); return; }
    setConfirmState({
      title: "ยื่นอนุมัติใบเสนอราคา",
      description: `ยืนยันยื่นอนุมัติ ${quote.quoteNumber} หรือไม่`,
      detail: "การยื่นถือเป็นการลงนามของผู้เสนอราคา ระบบจะบันทึกลายเซ็นและวันที่บนเอกสาร หากแก้เนื้อหาภายหลังต้องยื่นใหม่",
      confirmLabel: "ยื่นอนุมัติ",
      action: async () => {
        const data = await act("submit", `/api/sales-planning/quotations/${id}/submit`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        });
        if (data) await load();
        return !!data;
      },
    });
  };

  // อนุมัติใบ (เจ้าของดีล/superuser) — pending → approved. ต้องบันทึกก่อน (ไม่ค้าง dirty)
  // เพราะ fingerprint อนุมัติจะ snapshot เนื้อหาที่บันทึกแล้ว.
  const approve = () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อนอนุมัติ"); return; }
    setConfirmState({
      title: "อนุมัติใบเสนอราคา",
      description: `ยืนยันอนุมัติ ${quote.quoteNumber} หรือไม่`,
      detail: "หลังอนุมัติจะส่งลูกค้าได้ และหากแก้เนื้อหาภายหลังต้องยื่นอนุมัติใหม่",
      confirmLabel: "อนุมัติ",
      action: async () => {
        const data = await act("approve", `/api/sales-planning/quotations/${id}/approval`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        });
        if (data) await load();
        return !!data;
      },
    });
  };

  const act = async (label, url, opts = { method: "POST" }) => {
    setBusy(label);
    setError("");
    setErrorActionUrl("");
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "ทำรายการไม่สำเร็จ");
        setErrorActionUrl(data.accountUrl || "");
        return null;
      }
      return data;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setBusy("");
    }
  };

  const runConfirmed = async () => {
    const action = confirmState?.action;
    if (!action) return;
    setConfirmBusy(true);
    try {
      const completed = await action();
      if (completed !== false) setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // เปิดฟอร์มหลักฐาน Won (บังคับแนบไฟล์ + วันที่เอกสาร — validate ใน dialog/route/RPC)
  const doAccept = () => setWonOpen(true);
  // ย้อนการรับ = เครื่องมือ supervisor/แอดมินกรณีรับใบผิดก่อนมี SO — มี SO ที่ยังไม่
  // ยกเลิกอยู่ต้องไปทางฝั่ง SO (route/RPC บล็อกซ้ำ); เหตุผลบังคับ 10–500 ตัวอักษร
  const canUnaccept = quote?.status === "accepted" && canUnacceptQuotation(role)
    && (!quote.salesOrder || quote.salesOrder.status === "cancelled");
  const unacceptReasonValidation = unacceptForm ? unacceptReasonError(unacceptForm.reason) : "";
  const doUnaccept = async () => {
    if (unacceptReasonValidation) return;
    const data = await act("unaccept", `/api/sales-planning/quotations/${id}/unaccept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: normalizeUnacceptReason(unacceptForm.reason) }),
    });
    if (data) {
      setUnacceptForm(null);
      await load();
    }
  };
  const createSalesOrder = async () => {
    setBusy("sales-order");
    setError("");
    try {
      const res = await fetch("/api/sales-planning/sales-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotationId: quote.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้าง Sale Order ไม่สำเร็จ");
      router.push(`/sa/sales-orders/${data.id}`);
    } catch (err) {
      setError(err.message || "สร้าง Sale Order ไม่สำเร็จ");
      setBusy("");
    }
  };
  const doDelete = () => {
    const elevatedDelete = quote.status !== "draft";
    setConfirmState({
      title: elevatedDelete ? "ลบใบเสนอราคา (สิทธิ์ผู้ดูแลระบบ)" : "ลบใบเสนอราคาฉบับร่าง",
      description: `ต้องการลบ ${quote.quoteNumber} ใช่หรือไม่`,
      detail: elevatedDelete ? "ใบนี้ไม่ใช่ฉบับร่าง การลบด้วยสิทธิ์ผู้ดูแลระบบจะลบหลักฐานการค้าและไม่สามารถเรียกคืนจากหน้าจอนี้ได้" : "ใบเสนอราคาฉบับนี้จะถูกลบและไม่สามารถเรียกคืนจากหน้าจอนี้ได้",
      confirmLabel: elevatedDelete ? "ยืนยันลบใบเสนอราคา" : "ลบฉบับร่าง",
      tone: "danger",
      action: async () => {
        // admin: ใบ accepted โดนบล็อก → deleteWithForce จะพรีวิว Sale Order + ถามยืนยันบังคับลบ
        setBusy("delete");
        setError("");
        try {
          const result = await deleteWithForce(`/api/sales-planning/quotations/${id}`, { isAdmin: role === "admin" });
          if (!result.ok) return false;
          router.push("/sa/quotations");
          return true;
        } catch (e) {
          setError(e.message || "ลบใบเสนอราคาไม่สำเร็จ");
          return false;
        } finally {
          setBusy("");
        }
      },
    });
  };

  const saveAsRevision = async () => {
    const paymentValidation = validatePaymentPlan(paymentPlanPayload());
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return false;
    }
    setBusy("revise");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ออก Revision ไม่สำเร็จ");
      setDirty(false);
      setSaveChoiceOpen(false);
      router.push(`/sa/quotations/${data.id}`);
      return true;
    } catch (e) {
      setError(e.message || "ออก Revision ไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };
  const doPrint = async () => {
    const printWindow = prepareQuotePrintWindow();
    if (!printWindow) return;
    try {
      if (dirty && editable) {
        printWindow.close();
        setError("กรุณาเลือกบันทึกฉบับเดิมหรือออก Revision ใหม่ก่อนพิมพ์");
        setSaveChoiceOpen(true);
        return;
      }
      const res = await fetch(`/api/sales-planning/quotations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลใบเสนอราคาได้");
      await openQuotePrintWindowPreferIssued(data, printWindow);
    } catch (error) {
      showQuotePrintError(printWindow, error.message);
    }
  };
  const leaveEditMode = () => {
    const leave = async () => {
      if (dirty) await load();
      router.replace(`/sa/quotations/${id}`);
      return true;
    };
    if (!dirty) {
      leave();
      return;
    }
    setConfirmState({
      title: "ยกเลิกการแก้ไข",
      description: "ต้องการทิ้งข้อมูลที่ยังไม่ได้บันทึกหรือไม่",
      detail: "การเปลี่ยนแปลงในหน้านี้จะไม่ถูกบันทึก",
      confirmLabel: "ทิ้งการเปลี่ยนแปลง",
      tone: "danger",
      action: leave,
    });
  };

  const dealType = quote?.deal ? dealTypeOf(quote.deal) : null;

  const statusMeta = {
    draft: { label: "ฉบับร่าง", color: "var(--text-3)" },
    sent: { label: "ส่งลูกค้าแล้ว", color: "var(--blue)" },
    accepted: { label: "Won", color: "var(--green)" },
    rejected: { label: "ถูกปฏิเสธ", color: "var(--red)" },
    cancelled: { label: "ยกเลิก", color: "var(--red)" },
    revised: { label: "มีฉบับแก้ไขใหม่", color: "var(--amber)" },
    closed: { label: "ปิด (ดีลจบด้วยใบอื่น)", color: "var(--text-3)" },
  }[quote?.status] || { label: quote?.status || "-", color: "var(--text-3)" };
  const approvalWorkflowIndex = ["approved", "not_required"].includes(quote?.approvalStatus)
    ? 3
    : awaitingApproval
      ? 1
      : 0;
  const approvalWorkflowSteps = quote?.approvalStatus === "not_required"
    ? [{ id: "legacy", label: "เอกสารเดิม", hint: "ไม่อยู่ใน workflow อนุมัติแบบใหม่", state: "done" }]
    : workflowStepsFromIndex([
        { id: "prepare", label: "จัดทำเอกสาร", hint: quote?.createdByName || people.preparedBy || "ผู้จัดทำ" },
        { id: "submit", label: "ยื่นอนุมัติ", hint: quote?.approvalRequestedByName || "รอผู้จัดทำ" },
        { id: "approve", label: "เจ้าของดีลอนุมัติ", hint: quote?.approvedByName || "รออนุมัติ" },
      ], approvalWorkflowIndex);
  const controlDescription = needsSubmit
    ? "บันทึกข้อมูลให้เรียบร้อย แล้วจึงยื่นอนุมัติ"
    : awaitingApproval
      ? "รอเจ้าของดีลตรวจและอนุมัติเอกสาร"
      : quote?.approvalStatus === "approved"
        ? "ผ่านการอนุมัติและพร้อมดำเนินการขั้นถัดไป"
        : "เอกสารนี้ไม่ต้องผ่านการอนุมัติแบบใหม่";
  const primaryAction = editable
    ? {
        id: "save",
        kind: "save",
        label: ["save", "revise"].includes(busy) ? "กำลังบันทึก…" : "บันทึก",
        disabled: !dirty,
        disabledReason: !dirty ? "ยังไม่มีข้อมูลที่เปลี่ยนแปลง" : undefined,
        onClick: () => setSaveChoiceOpen(true),
      }
    : needsSubmit && canEditDocument
      ? {
          id: "submit",
          kind: "submit",
          label: "ยื่นอนุมัติ",
          disabled: dirty,
          disabledReason: dirty ? "บันทึกการแก้ไขก่อนยื่นอนุมัติ" : undefined,
          onClick: submitForApproval,
        }
      : awaitingApproval && quote?.canApprove && ["draft", "sent", "rejected"].includes(quote?.status)
        ? {
            id: "approve",
            kind: "approve",
            label: "อนุมัติ",
            disabled: dirty,
            disabledReason: dirty ? "บันทึกการแก้ไขก่อนอนุมัติ" : undefined,
            onClick: approve,
          }
        : null;
  const secondaryActions = [
    {
      id: "edit",
      kind: "edit",
      label: "แก้ไขข้อมูล",
      variant: "outline",
      visible: canEditDocument && !editMode,
      href: `/sa/quotations/${id}?edit=1`,
    },
    { id: "leave-edit", kind: "cancel", label: "ยกเลิกแก้ไข", variant: "ghost", visible: editable, onClick: leaveEditMode },
    {
      id: "send-customer",
      kind: "submit",
      label: "ส่งให้ลูกค้า",
      variant: "outline",
      visible: editable && quote?.status === "draft" && !needsApproval,
      onClick: async () => { await save({ status: "sent" }); },
    },
    {
      id: "won",
      kind: "approve",
      label: "Won",
      variant: "outline",
      visible: ["sent", "draft"].includes(quote?.status) && canEditCap && !needsApproval,
      disabled: dirty,
      disabledReason: dirty ? "บันทึกการแก้ไขก่อนปิด Won" : undefined,
      title: "ปิด Won ผ่านใบเสนอราคานี้",
      onClick: doAccept,
    },
    { id: "print", kind: "print", label: "ออกเอกสาร", variant: "ghost", visible: !editMode, onClick: doPrint },
    {
      id: "download",
      kind: "download",
      label: "ดาวน์โหลด PDF",
      variant: "ghost",
      visible: quote?.approvalStatus === "approved",
      href: quote ? `/api/sales-planning/quotations/${quote.id}/issued/pdf?render=latest` : undefined,
      external: true,
    },
  ];
  const dangerActions = [
    {
      id: "delete",
      kind: "delete",
      label: "ลบใบเสนอราคา",
      visible: canDeleteDocument && !editMode,
      onClick: doDelete,
    },
    {
      id: "unaccept",
      kind: "reject",
      label: "ย้อนการรับ",
      visible: canUnaccept && !editMode,
      title: "ย้อนการรับใบเสนอราคา (หัวหน้าทีม/แอดมิน)",
      onClick: () => setUnacceptForm({ reason: "" }),
    },
  ];

  return (
    <Workspace
      back={{ href: "/sa/quotations", label: "กลับหน้าใบเสนอราคา" }}
      hideHeader
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>
          <span>{error}</span>
          {errorActionUrl && <Link href={errorActionUrl} className="btn ghost sm">ไปบัญชีของฉัน</Link>}
        </div>
      )}

      {quote && (
        <div className={styles.detailLayout}>
          <div className={styles.documentColumn}>
          <SalesDetailOverview
            eyebrow="FM-SA-01 · QUOTATION"
            title={quote.quoteNumber}
            description={`${quote.customerName || "ไม่ระบุลูกค้า"} · โครงการ ${quote.deal?.project?.name || quote.deal?.project?.code || "ไม่ระบุ"} · ดีล ${quote.deal?.title || "ไม่ระบุ"}`}
            badges={<><SalesStateBadge label={statusMeta.label} color={statusMeta.color} />{quote.revisionNo > 0 ? <span className="ui-badge">Revision {quote.revisionNo}</span> : null}</>}
            facts={[
              { icon: CalendarDays, label: "วันที่ออกใบ", value: form.quoteDate ? fmtDate(form.quoteDate) : "-" },
              { icon: CalendarDays, label: "ยืนราคาถึง", value: form.validUntil ? fmtDate(form.validUntil) : "ไม่ระบุ" },
              { icon: CircleDollarSign, label: "ภาษี", value: form.vatRate > 0 ? `+ VAT ${form.vatRate}%` : "รวม VAT แล้ว" },
              { icon: ClipboardList, label: "รายการ", value: `${lines.length} รายการ` },
            ]}
          >
            <span>ประเภทดีล: {dealType} · {DEAL_TYPE_LABELS[dealType]}</span>
          </SalesDetailOverview>

          {/* ข้อมูลลูกค้าที่แช่แข็งบนใบ (Q3) — อ่านอย่างเดียว แก้ที่ฐานข้อมูลลูกค้า */}
          {(quote.billingAddress || quote.contactName || quote.shippingAddress) && (
            <section className={`${styles.card} ${styles.customerCard}`}>
              <div className={styles.sectionHeading}>
                <UserRound size={17} aria-hidden="true" />
                <h2>ข้อมูลลูกค้าในเอกสาร</h2>
                <span className="ui-badge" style={{ color: "var(--text-3)" }}>อ่านอย่างเดียว</span>
                <div className="spacer" />
                {quote.customerId && (
                  <Link href={`/database/customers/${quote.customerId}`} className="btn ghost sm" target="_blank">
                    <ExternalLink size={13} aria-hidden="true" /> แก้ที่ฐานข้อมูลลูกค้า
                  </Link>
                )}
              </div>
              <div className={styles.customerGrid}>
                <div className={styles.infoBlock}><Building2 size={16} /><span><small>ลูกค้า</small>{quote.customerName || "-"}{quote.branchCode ? ` · สาขา ${quote.branchCode}` : ""}</span></div>
                <div className={styles.infoBlock}><UserRound size={16} /><span><small>ผู้ติดต่อ</small>{[quote.contactName, quote.contactPhone].filter(Boolean).join(" · ") || "-"}</span></div>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่ออกบิล</small>{quote.billingAddress || "-"}</span></div>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่จัดส่ง</small>{quote.shippingAddress || quote.billingAddress || "-"}</span></div>
              </div>
            </section>
          )}

          {/* หัวใบ */}
          <section className={`${styles.card} ${styles.documentMeta}`}>
            <label>วันที่ออกใบ
              <DateInput className={styles.documentDateInput} value={form.quoteDate} disabled={!editable} onChange={(value) => setF({ quoteDate: value, validUntil: addValidityDays(value, form.validityDays) })} />
            </label>
            <label>ยืนราคาถึง
              <DateInput className={styles.documentDateInput} value={form.validUntil || ""} min={form.quoteDate || undefined} disabled={!editable} onChange={(value) => setF({ validUntil: value, validityDays: validityDaysBetween(form.quoteDate, value) })} />
            </label>
            <label>กำหนดยืนราคา (จำนวนวัน)
              <input type="number" min="1" step="1" className={`premium-input ${styles.documentDateInput}`} value={form.validityDays} disabled={!editable} onChange={(event) => {
                const validityDays = event.target.value;
                setF({ validityDays, validUntil: addValidityDays(form.quoteDate, validityDays) });
              }} />
            </label>
          </section>

          {/* ผู้รับผิดชอบเอกสาร — ชุดเดียวกับไทม์ไลน์ (ผู้ดูแล/ผู้ประสานงาน/ผู้ตรวจสอบ) */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}><UserRound size={17} aria-hidden="true" /><h2>ผู้รับผิดชอบเอกสาร</h2></div>
            <div className={styles.documentMeta}>
              <QuotationPeopleFields value={people} disabled={!editable} onChange={(next) => { setPeople(next); setDirty(true); }} />
            </div>
          </section>

          {/* รายการ */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <ClipboardList size={17} aria-hidden="true" />
              <h2>รายการสินค้า/บริการ</h2>
              {editable && (
                <div className={styles.lineActions}>
                  <button type="button" className="btn btn-primary sm" onClick={addProductLine}><Plus size={13} aria-hidden="true" /> เพิ่มสินค้า</button>
                  <button type="button" className="btn ghost sm" onClick={addLine}><Plus size={13} aria-hidden="true" /> เพิ่มรายการเอง</button>
                </div>
              )}
            </div>
            <QuotationLineItems
              lines={lines}
              onChange={updateLines}
              editable={editable}
              products={products}
              discountType={form.discountType}
              discountValue={form.discountValue}
              vatRate={form.vatRate}
              onDiscountChange={({ type, value }) => setF({ discountType: type, discountValue: value })}
              onVatRateChange={(rate) => setF({ vatRate: rate })}
            />
          </section>

          {/* เงื่อนไขการชำระเงิน — รูปแบบเดียวกับหน้าสร้าง + เปิด/ปิดแบ่งชำระ */}
          <section className={styles.card}>
            <QuotationPaymentTerms
              value={payment}
              onChange={updatePayment}
              totalAmount={totals.totalAmount}
              disabled={!editable}
              disabledReason={editDisabledReason}
            />
          </section>

          {/* หมายเหตุ — การ์ดตัวเดียวกับหน้าสร้างใบ (กฎ AGENTS.md) */}
          <section className={styles.card}>
            <QuotationNotes
              value={form.notes}
              onChange={(next) => setF({ notes: next })}
              presetVersionId={notesPresetVersionId}
              onPresetVersionIdChange={(next) => { setNotesPresetVersionId(next); setDirty(true); }}
              disabled={!editable}
              disabledReason={editDisabledReason}
            />
          </section>

          </div>

          <ContextualRightRail className={styles.sidebar} label="สรุปและจัดการใบเสนอราคา">
            <DocumentSummaryCard
              title="ยอดสุทธิใบเสนอราคา"
              total={money(totals.totalAmount)}
              status={statusMeta.label}
              statusColor={statusMeta.color}
              rows={[
                { id: "subtotal", label: "รวมรายการ", value: money(totals.subtotal) },
                { id: "discount", label: "ส่วนลด", value: totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : "-" },
                ...(form.vatRate > 0 ? [{ id: "vat", label: `VAT ${form.vatRate}%`, value: money(totals.vatAmount) }] : []),
              ]}
            />

            <DocumentControlCard
              status={statusMeta.label}
              statusColor={statusMeta.color}
              statusDescription={controlDescription}
              workflowSteps={approvalWorkflowSteps}
              primaryAction={primaryAction}
              secondaryActions={secondaryActions}
              dangerActions={dangerActions}
              busy={!!busy}
              notices={<>
                {editable ? <SaveStatus status={error ? "error" : ["save", "revise"].includes(busy) ? "saving" : dirty ? "dirty" : "saved"} /> : null}
                {needsSubmit ? <span className="ui-badge" style={{ color: "var(--text-2)" }}>รอผู้จัดทำยื่นอนุมัติ</span> : null}
                {awaitingApproval ? <span className="ui-badge" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>รอเจ้าของดีลอนุมัติ{quote.approvalRequestedByName ? ` · ยื่นโดย ${quote.approvalRequestedByName}` : ""}</span> : null}
                {quote.approvalStatus === "approved" && quote.approvedByName ? <span className="ui-badge" style={{ color: "var(--green)", background: "var(--green-soft)" }}>อนุมัติโดย {quote.approvedByName}</span> : null}
              </>}
              evidence={<>
                {(quote.proposerSignatureEvidenceId || quote.signatureEvidenceId) ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {quote.proposerSignatureEvidenceId ? <span className="ui-badge" style={{ color: "var(--teal)" }}>ลงนามผู้เสนอราคาแล้ว</span> : null}
                    {quote.signatureEvidenceId ? <span className="ui-badge" style={{ color: "var(--green)" }}>บันทึกหลักฐานลายเซ็นแล้ว</span> : null}
                  </div>
                ) : null}
                <SignatureReadyNotice
                  active={["draft", "sent", "rejected"].includes(quote.status)
                    && ((needsSubmit && canEditDocument) || (awaitingApproval && !!quote.canApprove))}
                  docLabel="ใบเสนอราคานี้"
                />
              </>}
              footer={quote.status === "closed"
                ? "ใบนี้ถูกปิดเพราะดีลจบด้วยใบเสนอราคาฉบับอื่น — แก้ไข/ลบไม่ได้"
                : canEditDocument && !editMode
                  ? "ขณะนี้เป็นโหมดอ่านอย่างเดียว — กด “แก้ไขข้อมูล” ด้านบนเพื่อแก้เงื่อนไขการชำระ หมายเหตุ และข้อมูลในใบ"
                  : !canEditDocument
                    ? "ใบนี้แก้ไขไม่ได้ หากต้องเปลี่ยนข้อมูลให้สร้างฉบับแก้ไขใหม่"
                    : null}
            />

            {quote.deal ? (
              <RelatedDocumentCard
                icon={Building2}
                eyebrow="RELATED DEAL"
                title={quote.deal.title || "ดีลที่เกี่ยวข้อง"}
                meta="เอกสารต้นทางของใบเสนอราคา"
                actions={<Link href={`/sa/deals/${quote.deal.id}`} className="btn ghost sm">เปิดดีล <ExternalLink size={13} /></Link>}
              >
                โครงการ {quote.deal.project?.name || quote.deal.project?.code || "ไม่ระบุ"}
              </RelatedDocumentCard>
            ) : null}

            {/* หลักฐานการปิด Won (mig 0102) — โชว์บนใบที่ accept แล้ว */}
            {quote.status === "accepted" && Array.isArray(quote.wonAttachments) && quote.wonAttachments.length > 0 && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <h2>หลักฐานการปิด Won</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>ประเภทเอกสาร</small>{WON_DOC_TYPE_LABELS[quote.wonDocType] || quote.wonDocType || "-"}</div>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>วันที่เอกสาร</small>{quote.wonDocDate ? fmtDate(quote.wonDocDate) : "-"}</div>
                  {quote.wonPaymentDueDate && <div><small style={{ color: "var(--text-3)", display: "block" }}>กำหนดชำระ</small>{fmtDate(quote.wonPaymentDueDate)}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <small style={{ color: "var(--text-3)" }}>ไฟล์แนบ</small>
                    {quote.wonAttachments.map((att, i) => (
                      <a key={`${att.fileUrl}-${i}`} href={`/api/sales-planning/quotations/${quote.id}/file?i=${i}`} target="_blank" rel="noreferrer" className={styles.relatedLink}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.fileName || `ไฟล์ ${i + 1}`}</span>
                        <span>→</span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {quote.salesOrder && (
              <RelatedDocumentCard
                icon={ClipboardList}
                eyebrow="DOWNSTREAM DOCUMENT"
                title="Sale Order"
                meta="เอกสารปลายทางจากใบเสนอราคานี้"
                actions={<Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด SO</Link>}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="linklike mono" style={{ fontWeight: 700 }}>{quote.salesOrder.orderNumber}</Link>
                  <span className="ui-badge" style={{ color: quote.salesOrder.status === "approved" ? "var(--green)" : quote.salesOrder.status === "pending_approval" ? "var(--amber)" : "var(--text-3)" }}>{({ draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" })[quote.salesOrder.status] || quote.salesOrder.status}</span>
                  <span style={{ color: "var(--text-2)" }}>Actual ก่อน VAT {fmtMoney(quote.salesOrder.status === "approved" ? quote.salesOrder.actualAmount : 0)}</span>
                </div>
              </RelatedDocumentCard>
            )}

            {quote.status === "accepted" && !quote.salesOrder && canEditCap && (
              <RelatedDocumentCard
                icon={ClipboardList}
                eyebrow="DOWNSTREAM DOCUMENT"
                title="Sale Order"
                meta="ยังไม่ได้สร้างเอกสารปลายทาง"
                actions={<button type="button" className="btn btn-primary" onClick={createSalesOrder} disabled={!!busy}><Plus size={14} /> {busy === "sales-order" ? "กำลังสร้าง…" : "สร้างร่าง Sale Order"}</button>}
              >
                <p style={{ color: "var(--text-2)", marginTop: 0 }}>สร้างร่าง SO จาก QT ใบนี้เพื่อตรวจสอบข้อมูลและยื่นให้ AE Supervisor อนุมัติ</p>
              </RelatedDocumentCard>
            )}
            {quote.revisionHistory?.length > 1 && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <FileClock size={17} aria-hidden="true" />
                  <h2>ประวัติ Revision</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {quote.revisionHistory.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/sa/quotations/${revision.id}`}
                      className={styles.relatedLink}
                      aria-current={revision.id === quote.id ? "page" : undefined}
                      style={revision.id === quote.id ? { color: "var(--blue)", fontWeight: 700 } : undefined}
                    >
                      <span>
                        {revision.quoteNumber}
                        {revision.id === quote.id ? " · ฉบับนี้" : ""}
                        <small style={{ display: "block", color: "var(--text-3)", fontWeight: 400 }}>
                          {fmtDate(revision.quoteDate)} · {revision.status === "revised" ? "ฉบับเก่า" : "ฉบับล่าสุด"}
                        </small>
                      </span>
                      <span>→</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </ContextualRightRail>
        </div>
      )}

      <QuotationWonDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        quote={quote}
        customerId={quote?.customerId || quote?.deal?.customerId}
        customerName={quote?.customerName || quote?.deal?.customerName}
        onDone={async () => { setWonOpen(false); await load(); }}
      />

      {/* ย้อนการรับ (มติ 2026-07-21) — เหตุผลบังคับ แบบเดียวกับ Admin Override ของ SO */}
      {unacceptForm && (
        <Modal open onClose={() => !busy && setUnacceptForm(null)} title="ย้อนการรับใบเสนอราคา" size="sm" dismissible={!busy}>
          <div className="drawer-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="glass-panel" style={{ padding: "10px 12px", borderColor: "var(--red)", display: "flex", gap: 10 }}>
              <Undo2 size={20} color="var(--red)" aria-hidden="true" />
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>
                <strong style={{ color: "var(--text)" }}>เครื่องมือแก้กรณีรับใบผิด (ยังไม่มี Sale Order)</strong>
                <p style={{ margin: "4px 0 0" }}>ใบ {quote?.quoteNumber} จะกลับเป็น &ldquo;ส่งลูกค้าแล้ว&rdquo; และดีลถอยออกจาก Won — หลักฐานการรับเดิมคงไว้เป็นประวัติ</p>
              </div>
            </div>
            <label className="form-group" htmlFor="unaccept-reason">
              <span>เหตุผลที่ย้อนการรับ</span>
              <textarea
                id="unaccept-reason"
                className="textarea-premium"
                rows={4}
                required
                maxLength={UNACCEPT_REASON_MAX}
                value={unacceptForm.reason}
                onChange={(event) => setUnacceptForm({ reason: event.target.value })}
                aria-describedby="unaccept-reason-help"
                placeholder="เช่น กดรับใบผิดฉบับ — ดีลนี้ต้องปิดด้วยใบเสนอราคาอีกใบ"
              />
              <small id="unaccept-reason-help" style={{ color: unacceptForm.reason && unacceptReasonValidation ? "var(--red)" : "var(--text-3)" }}>
                {unacceptForm.reason && unacceptReasonValidation ? unacceptReasonValidation : `บังคับอย่างน้อย 10 ตัวอักษร · ${unacceptForm.reason.length}/${UNACCEPT_REASON_MAX}`}
              </small>
            </label>
            <div className="action-bar" style={{ marginTop: 0 }}>
              <button type="button" className="btn ghost" onClick={() => setUnacceptForm(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-danger" onClick={doUnaccept} disabled={!!busy || !!unacceptReasonValidation}>
                <Undo2 size={15} aria-hidden="true" /> {busy === "unaccept" ? "กำลังย้อน…" : "ยืนยันย้อนการรับ"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal open={saveChoiceOpen} onClose={() => !busy && setSaveChoiceOpen(false)} title="เลือกวิธีบันทึกใบเสนอราคา" size="sm">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
            บันทึกฉบับเดิมเพื่อแก้ข้อมูลในเลขที่ปัจจุบัน หรือออก Revision ใหม่เพื่อเก็บฉบับเดิมไว้เป็นประวัติ
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost" onClick={() => setSaveChoiceOpen(false)} disabled={!!busy}>ยกเลิก</button>
            <button type="button" className="btn" onClick={async () => { if (await save()) setSaveChoiceOpen(false); }} disabled={!!busy}>
              บันทึกฉบับเดิม
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAsRevision} disabled={!!busy}>
              ออก Revision ใหม่
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirmState(null)}
        onConfirm={runConfirmed}
      />
    </Workspace>
  );
}

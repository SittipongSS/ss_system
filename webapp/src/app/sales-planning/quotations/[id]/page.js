"use client";

// Editor ใบเสนอราคา FM-SA-01 (/sa/quotations/[id] — เฟส D):
// แก้รายการ+ส่วนลดรายบรรทัด · ส่วนลดท้ายใบ · VAT · เงื่อนไขชำระ · หมายเหตุ (เลือกจาก
// template ต่อบริการ) · ส่ง/รับ/Revise/พิมพ์. ยอดเงินคิดจริงที่ server —
// หน้านี้พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, ExternalLink, FileClock, Package, Plus, UserRound } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import QuotationCustomerFields from "@/components/salesPlanning/QuotationCustomerFields";
import Input from "@/components/ui/Input";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import Toast from "@/components/ui/Toast";
import { ContextualRightRail } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard } from "@/components/ui/DocumentControlPanel";
import QuotationInstallments from "@/components/salesPlanning/QuotationInstallments";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationNotes from "@/components/salesPlanning/QuotationNotes";
import QuotationLineItems, { newManualLine, newProductLine } from "@/components/salesPlanning/QuotationLineItems";
import SignatureReadyNotice from "@/components/account/SignatureReadyNotice";
import ContractCreateModal from "@/components/salesPlanning/ContractCreateModal";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { CONFIRM_DOC_TYPE_LABELS } from "@/lib/sales/orderConfirmationDocs";
import { UNACCEPT_REASON_MAX, canUnacceptQuotation, normalizeUnacceptReason, unacceptReasonError } from "@/lib/sales/quotationUnaccept";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { DEAL_TYPE_LABELS, dealTypeOf, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import {
  pickDocumentAddresses,
} from "@/lib/master/addresses";
import { customerHeadline } from "@/lib/master/customerAr";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openQuotePrintWindowPreferIssued, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import {
  canRejectQuotationSubmission,
  isRevisableQuotation,
  canWithdrawQuotationSubmission,
  isEditableQuotation,
  isQuotationAwaitingApproval,
  quotationRejectionNotice,
} from "@/lib/sales/quotationWorkflow";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { cachedFetchJson } from "@/lib/apiCache";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { approvalPrompt } from "@/lib/approvalPrompt";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const money = (v) => fmtMoney(v);

export default function QuotationEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ⚠️ **URL ขอโหมดแก้ไขได้ แต่ไม่ได้แปลว่าได้** — ตัวจริงคือ `editMode` ข้างล่าง
  // ซึ่งคูณกับ `canEditDocument` (ดูเหตุผลเต็มที่บรรทัดนั้น · IS-26080011)
  const editRequested = searchParams.get("edit") === "1";
  const canEditCap = useCan("salesplan:edit");
  const role = useRole();

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState({
    quoteDate: "", validUntil: "", validityDays: "", notes: "", discountType: "", discountValue: "", vatRate: 0,
    // เอกสารอ้างอิง (mig 0267) — ข้อความอิสระ ไม่ผูกกับเอกสารจริงในระบบ (มติผู้ใช้)
    referenceNote: "",
    // ที่อยู่ที่ใบนี้เลือก (0203) — เปลี่ยนได้เฉพาะร่างที่ยังไม่ยื่น (canEditDocument)
    billingAddressId: "", shippingAddressId: "", contactIndex: "",
  });
  // ทะเบียนลูกค้าสด — โหลดมาเพื่อ "ตัวเลือกที่อยู่" เท่านั้น ตัวเอกสารยังใช้ snapshot บนใบ
  const [customer, setCustomer] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorActionUrl, setErrorActionUrl] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [workflowForm, setWorkflowForm] = useState(null);
  const [rejectForm, setRejectForm] = useState(null);
  const [revisionForm, setRevisionForm] = useState(null);
  // สัญญา (mig 0278) — เปิดโมดัลออกสัญญาจากใบที่อนุมัติแล้ว
  const [contractOpen, setContractOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [wonOpen, setWonOpen] = useState(false);
  // ย้อนการรับ (มติ 2026-07-21): null = ปิด; { reason } = เปิดฟอร์มเหตุผลบังคับ
  const [unacceptForm, setUnacceptForm] = useState(null);
  const [products, setProducts] = useState([]);
  const [payment, setPayment] = useState({ type: "full", paymentMethod: "", paymentTerms: "", installments: [], presetVersionId: null });
  const [notesPresetVersionId, setNotesPresetVersionId] = useState(null);

  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/quotations/${id}`);
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
        referenceNote: q.referenceNote || "",
        discountType: q.discountType || "",
        discountValue: q.discountValue ?? "",
        vatRate: Number(q.vatRate || 0),
        billingAddressId: q.billingAddressId || "",
        shippingAddressId: q.shippingAddressId || "",
        // "" = ยังไม่แตะ ⇒ ไม่ส่ง contactIndex ไป server ⇒ ผู้ติดต่อบนใบไม่ขยับ
        contactIndex: "",
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
      setDirty(false);
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // ตัวเลือกที่อยู่ของลูกค้ารายนี้ — โหลดแยกจากใบเพราะใบเก็บแค่ snapshot (ข้อความ+id)
  // โหลดไม่ได้ = ตกไปเป็นการ์ดอ่านอย่างเดียวแบบเดิม ไม่บล็อกทั้งหน้า
  useEffect(() => {
    const customerId = quote?.customerId;
    if (!customerId) { setCustomer(null); return; }
    let alive = true;
    (async () => {
      const res = await apiFetch(`/api/customers/${customerId}`).catch(() => null);
      if (!alive) return;
      const data = res?.ok ? await res.json() : null;
      const next = data?.customer || data || null;
      setCustomer(next);
      // ใบที่ออกก่อน 0203 ไม่มี id ที่อยู่ — เติมให้เท่ากับตัวที่ server จะเลือกให้อยู่ดี
      // (ไม่ใช่การแก้ใบ จึงไม่ตั้ง dirty) ไม่งั้นช่องจะว่างทั้งที่ข้างล่างโชว์ที่อยู่อยู่
      setForm((f) => {
        if (f.billingAddressId && f.shippingAddressId) return f;
        const seed = pickDocumentAddresses(next, f);
        return {
          ...f,
          billingAddressId: f.billingAddressId || seed.billing?.id || "",
          shippingAddressId: f.shippingAddressId || seed.shipping?.id || "",
        };
      });
    })();
    return () => { alive = false; };
  }, [quote?.customerId]);
  // FG ของ **ลูกค้าบนใบนี้** เท่านั้น (มติผู้ใช้ 2026-08-17) — กติกาเดียวกับหน้าสร้าง
  // ⚠️ บรรทัดเดิมที่ผูก FG ของลูกค้ารายอื่น (ใบเก่าก่อนมีด่านนี้) จะไม่อยู่ในลิสต์แล้ว
  // แต่ยังแสดง/บันทึกได้ปกติ: ตารางอ่านคำอธิบายจาก snapshot ในบรรทัดเอง และด่าน
  // ฝั่ง server ยกเว้นสินค้าที่ใบนี้ถืออยู่ก่อนแล้ว
  useEffect(() => {
    const customerId = quote?.customerId;
    if (!customerId) { setProducts([]); return; }
    cachedFetchJson(`/api/products?customerId=${encodeURIComponent(customerId)}`)
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [quote?.customerId]);

  // ด่าน "เอกสารเปิดให้แก้ไหม" อยู่ที่ `lib/sales/quotationWorkflow.js` ที่เดียว —
  // หน้ารายการใช้ตัวเดียวกันตัดสินว่าจะโชว์ดินสอไหม (เดิมเขียนแยกกันแล้วหลุดจากกัน)
  const canEditDocument = !!quote && canEditCap && isEditableQuotation(quote);
  // ⭐ **โหมดแก้ไข = URL ขอมา *และ* ใบนี้แก้ได้จริง** (IS-26080011)
  //
  // 🐞 เดิมอ่านจาก URL ล้วน ⇒ `?edit=1` ที่ค้างอยู่บนใบที่อนุมัติแล้ว (จากปุ่มดินสอใน
  // หน้ารายการ · bookmark · ปุ่ม back) ทำให้ปุ่ม **ทุกตัว** ในการ์ดหาย เพราะทั้งลิสต์
  // กั้นด้วย `!editMode` ส่วนปุ่ม "บันทึก" ก็ไม่ขึ้นเพราะ `editable` เป็น false
  // ⇒ ผู้ใช้เหลือปุ่ม "Won" ปุ่มเดียว ออก Rev. ไม่ได้ พิมพ์ไม่ได้ และไม่มีทางออกจาก
  // โหมดนี้นอกจากลบพารามิเตอร์ทิ้งเองในแถบ URL (ผู้ใช้แจ้งเข้ามาเอง 2026-08-11)
  const editMode = editRequested && canEditDocument;
  // สองขั้นแยกกัน (mig 0155): needsSubmit = ร่างที่ผู้จัดทำยังไม่กดยื่น ·
  // awaitingApproval = ยื่นแล้วรอเจ้าของดีล. ทั้งคู่บล็อกปุ่มส่ง/Won เหมือนกัน แต่ปุ่มที่
  // ต้องกดต่อคนละตัว — เดิมมีสถานะเดียว (pending) ทำให้อนุมัติใบที่ยังกรอกไม่เสร็จได้
  const needsSubmit = !!quote && quote.approvalStatus === "not_submitted";
  const awaitingApproval = !!quote && quote.approvalStatus === "pending";
  // ใบ grandfather (not_required) และใบที่อนุมัติแล้ว (approved) ไม่บล็อก
  const needsApproval = needsSubmit || awaitingApproval;
  // ดึงกลับ = ของผู้ยื่นเท่านั้น (มติ 2026-07-26) — เงื่อนไขเดียวกับด่านฝั่ง API
  const canWithdrawSubmission = canWithdrawQuotationSubmission(quote, { userId: quote?.meId });
  // ตีกลับ = ผู้อนุมัติส่งใบกลับพร้อมเหตุผลที่ผู้จัดทำเห็น (mig 0164) — คู่ตรงข้ามของ
  // ดึงกลับซึ่งเป็นการกระทำของผู้ยื่นเอง
  const canRejectSubmission = canRejectQuotationSubmission(quote, {
    approver: !!quote?.canApprove,
    userId: quote?.meId,
  });
  const rejectionNotice = quotationRejectionNotice(quote);
  // ใบ approved + ใบ grandfather (not_required) — ทั้งคู่แก้ทับไม่ได้ ต้องออก Rev.
  // (มติ 2026-07-26); เงื่อนไขเดียวกับด่านฝั่ง API เพื่อไม่ให้ปุ่มกับ server เพี้ยนหากัน
  const canReviseDocument = !!quote && canEditCap && isRevisableQuotation(quote);
  // ดีล Lost = จบแล้ว ฝั่ง API ปฏิเสธการออก Rev. (revise/route.js) — ปุ่มต้องรู้ด้วย
  // ไม่งั้นมันชวนผู้ใช้เดินเข้าทางตัน: กรอกเหตุผล กดยืนยัน แล้วโดนตีกลับ 400
  const reviseBlocker = quote?.deal?.stage === "lost"
    ? "ดีลนี้ Lost แล้ว — ออก Rev. ใหม่ไม่ได้ (ถ้าดีลยังไม่จบจริง ให้ย้อนสถานะดีลก่อน)"
    : "";
  // ปิด Won ได้เมื่อใบผ่านการอนุมัติแล้ว (หรือใบ grandfather) และยังไม่ถูกรับ/ปิด —
  // หลัง mig 0165 ใบพวกนี้เป็น 'sent' เสมอ ส่วน 'draft' เหลือไว้รองรับใบเก่าที่อนุมัติ
  // ก่อน migration และใบ grandfather ที่ไม่เคยผ่านเส้นทางอนุมัติ
  const canCloseWon = !!quote && canEditCap && !needsApproval
    && ["sent", "draft"].includes(quote.status);
  // ลบ: draft ทุกคนที่แก้ได้ / แอดมิน (superuser) ลบได้ทุกสถานะ (มติผู้ใช้ 2026-07-15)
  // ใบที่รออนุมัติลบไม่ได้ — ต้องดึงกลับหรือให้ผู้อนุมัติตีกลับก่อน (มติผู้ใช้ 2026-08-05)
  // admin ยังเห็นปุ่มไว้ใช้ทาง break-glass (deleteWithForce) ที่ยืนยันซ้ำอีกชั้น
  const canDeleteDocument = !!quote && (role === "admin" || (canEditCap
    && !isQuotationAwaitingApproval(quote)
    && quote.status !== "accepted"
    && (quote.status === "draft" || isSuperuser(role))));
  // เท่ากับ `editMode` แล้วตั้งแต่ `editMode` คูณ `canEditDocument` เข้าไป — คงชื่อไว้
  // เพราะ JSX ทั้งหน้าอ่านว่า "ช่องนี้แก้ได้ไหม" ไม่ใช่ "อยู่ในโหมดไหน"
  const editable = editMode;

  // ตัวเลือกที่อยู่ (0202) — แยกตามหน้าที่เหมือนหน้าสร้างใบ · preview ใช้กติกาเดียวกับ
  // ฝั่ง server (pickDocumentAddresses) จะได้ไม่โชว์คนละอย่างกับที่บันทึกจริง
  const pickedAddresses = pickDocumentAddresses(customer, {
    billingAddressId: form.billingAddressId,
    shippingAddressId: form.shippingAddressId,
  });

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
      // ลบหมายเหตุทิ้ง = ทิ้งคู่ภาษาของสินค้าไปด้วย (mig 0317)
      if (note) payloadLine.metadata.note = note;
      else { delete payloadLine.metadata.note; delete payloadLine.metadata.noteEn; delete payloadLine.metadata.noteAuto; }
      return payloadLine;
    }),
    quoteDate: form.quoteDate,
    validUntil: form.validUntil || null,
    paymentTerms: payment.paymentTerms,
    notes: form.notes,
    referenceNote: form.referenceNote,
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate,
    // ที่อยู่: ส่งแค่ "เลือกอันไหน" — ข้อความ server อ่านสดจากทะเบียนลูกค้าเอง (0203)
    billingAddressId: form.billingAddressId || null,
    shippingAddressId: form.shippingAddressId || null,
    ...(form.contactIndex === "" ? {} : { contactIndex: form.contactIndex }),
    paymentPlan: paymentPlanPayload(),
    // ชุดเงื่อนไขการค้าที่ใบนี้ตั้งต้นมาจาก — server ตรวจว่ามีจริง+เผยแพร่ก่อนตรึง
    metadata: {
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
      const res = await apiFetch(`/api/sales-planning/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload(extra)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      await load();
      router.replace(`/sa/quotations/${id}`);
      setToast({ kind: "success", msg: "บันทึกใบเสนอราคาแล้ว" });
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
      detail: "การยื่นถือเป็นการลงนามของผู้เสนอราคา ระบบจะล็อกการแก้ไขและบันทึกลายเซ็นกับวันที่บนเอกสาร หากต้องแก้ก่อนอนุมัติให้ดึงกลับก่อน",
      confirmLabel: "ยื่นอนุมัติ",
      action: async () => {
        const data = await act("submit", `/api/sales-planning/quotations/${id}/submit`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        });
        if (data) {
          await load();
          setToast({ kind: "success", msg: "ยื่นอนุมัติใบเสนอราคาแล้ว" });
        }
        return !!data;
      },
    });
  };

  // อนุมัติใบ (เจ้าของดีล/superuser) — pending → approved. ต้องบันทึกก่อน (ไม่ค้าง dirty)
  // เพราะ fingerprint อนุมัติจะ snapshot เนื้อหาที่บันทึกแล้ว.
  const approve = () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อนอนุมัติ"); return; }
    setConfirmState({
      ...approvalPrompt({
        title: "อนุมัติใบเสนอราคา",
        subject: `ใบเสนอราคา ${quote.quoteNumber}`,
        effects: [
          "ใบพร้อมส่งลูกค้าและออกเอกสารได้",
          "ตรึงลายเซ็นผู้อนุมัติกับ fingerprint ของเนื้อหา ณ ตอนนี้",
          "เอกสารถูกล็อก แก้ไขต่อได้เฉพาะการออก Rev. ใหม่",
        ],
        confirmLabel: "อนุมัติ",
      }),
      action: async () => {
        const data = await act("approve", `/api/sales-planning/quotations/${id}/approval`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        });
        if (data) {
          await load();
          setToast({ kind: "success", msg: "อนุมัติใบเสนอราคาแล้ว" });
        }
        return !!data;
      },
    });
  };

  /* ดึงกลับมาเฉพาะ "ตัวใบ" — สถานะ/ขั้นอนุมัติ/สิทธิ์ ซึ่งเป็นสิ่งที่ปุ่มทุกตัวอ่าน
     ⚠️ **ห้ามใช้ `load()` แทน** — `load` เขียนทับ `form` กับ `lines` ด้วย ซึ่งคือร่างที่
     ผู้ใช้กำลังพิมพ์อยู่ (หน้านี้มี `useUnsavedChanges(dirty)` เฝ้าอยู่) ⇒ การรีเฟรช
     ตอนทำรายการไม่ผ่านจะกลายเป็นการกลืนงานที่ยังไม่บันทึก */
  const refreshQuote = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sales-planning/quotations/${id}`);
      if (!res.ok) return;
      const fresh = await res.json().catch(() => null);
      if (fresh) setQuote(fresh);
    } catch { /* รีเฟรชเงียบ — ข้อความจริงที่ผู้ใช้ต้องอ่านคือ error ของ action */ }
  }, [id]);

  const act = async (label, url, opts = { method: "POST" }) => {
    setBusy(label);
    setError("");
    setErrorActionUrl("");
    try {
      const res = await apiFetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "ทำรายการไม่สำเร็จ");
        setErrorActionUrl(data.accountUrl || "");
        /* ⭐ **ตีกลับ = จอไม่ตรงกับของจริงแล้ว** — route อนุมัติอ่านแถวสดแล้วตรวจสถานะ
           ซ้ำทุกครั้ง (`api/.../approval/route.js`) ⇒ "ใบนี้อนุมัติแล้ว" แปลว่ามีคนกด
           ไปก่อน ไม่ใช่ผู้ใช้กดผิด · ของเดิมปล่อยให้ปุ่มเดิมค้างอยู่ครบ คนจึงกดซ้ำ
           ได้ข้อความเดิมไปเรื่อย ๆ จนต้อง F5 เอง */
        refreshQuote();
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

  const withdrawSubmission = async () => {
    const reason = workflowForm?.reason?.trim() || "";
    if (reason.length < 10) return;
    const data = await act("withdraw", `/api/sales-planning/quotations/${id}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, expectedUpdatedAt: quote.updatedAt }),
    });
    if (data) {
      setWorkflowForm(null);
      await load();
      setToast({ kind: "info", msg: "ดึงกลับแล้ว ใบเสนอราคากลับเป็นฉบับร่าง" });
    }
  };

  const rejectSubmission = async () => {
    const reason = rejectForm?.reason?.trim() || "";
    if (reason.length < 10) return;
    const data = await act("reject", `/api/sales-planning/quotations/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, expectedUpdatedAt: quote.updatedAt }),
    });
    if (data) {
      setRejectForm(null);
      await load();
      setToast({ kind: "info", msg: "ตีกลับให้ผู้จัดทำแก้ไขแล้ว" });
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
  /* ⭐ ออกใบสั่งขาย = **ไปหน้าฟอร์ม** ไม่ใช่ยิงสร้างทันที (มติผู้ใช้ 2026-08-24)
     เอกสารยืนยันคำสั่งซื้อ กำหนดชำระรายงวด และเงินที่ลูกค้าจ่ายมาแล้ว ถูกกรอกที่นั่น
     แล้วออกใบทีเดียว — เลขที่ใบใช้ซ้ำไม่ได้ (0241) จึงห้ามสร้างใบเปล่ารอไว้ก่อน */
  const salesOrderFormHref = `/sa/sales-orders/new?quotationId=${id}&returnTo=${encodeURIComponent(`/sa/quotations/${id}`)}`;

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
    const revisionReason = revisionForm?.reason?.trim() || "";
    if (revisionReason.length < 10) return false;
    const paymentValidation = validatePaymentPlan(paymentPlanPayload());
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return false;
    }
    setBusy("revise");
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/quotations/${id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload({
          metadata: {
            paymentPresetVersionId: payment.presetVersionId || null,
            remarksPresetVersionId: notesPresetVersionId || null,
            revisionReason,
          },
        })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ออก Rev. ไม่สำเร็จ");
      setDirty(false);
      setRevisionForm(null);
      setToast({ kind: "success", msg: `สร้าง Revision ${data.quoteNumber || ""} แล้ว` });
      router.push(`/sa/quotations/${data.id}`);
      return true;
    } catch (e) {
      setError(e.message || "ออก Rev. ไม่สำเร็จ");
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
        setError("กรุณาบันทึกการแก้ไขก่อนออกเอกสาร");
        return;
      }
      const res = await apiFetch(`/api/sales-planning/quotations/${id}`);
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
    // sent = "อนุมัติแล้ว" (มติผู้ใช้ 2026-08-17) — ดูเหตุผลที่ QUOTE_STATUS_LABELS
    sent: { label: "อนุมัติแล้ว", color: "var(--blue)" },
    accepted: { label: "Won", color: "var(--green)" },
    rejected: { label: "ถูกปฏิเสธ", color: "var(--red)" },
    cancelled: { label: "ยกเลิก", color: "var(--red)" },
    revised: { label: "มีฉบับแก้ไขใหม่", color: "var(--amber)" },
    closed: { label: "ปิด (ดีลจบด้วยใบอื่น)", color: "var(--text-3)" },
  }[quote?.status] || { label: naText(quote?.status), color: "var(--text-3)" };
  const approvalWorkflowIndex = ["approved", "not_required"].includes(quote?.approvalStatus)
    ? 3
    : awaitingApproval
      ? 1
      : 0;
  const approvalWorkflowSteps = quote?.approvalStatus === "not_required"
    ? [{ id: "legacy", label: "เอกสารเดิม", hint: "ออกก่อนระบบอนุมัติ — แก้ไขผ่าน Rev.", state: "done" }]
    : workflowStepsFromIndex([
        // รางนี้คือที่เดียวที่บอกว่า "ใครทำอะไรกับใบนี้" — ใบไม่มีบล็อกผู้รับผิดชอบแล้ว
        // (มติผู้ใช้ 2026-08-18) · ผู้จัดทำ = คนที่กดยื่น = ขั้นถัดไป ไม่ใช่คนเปิดร่าง
        { id: "prepare", label: "เปิดร่าง", hint: quote?.createdByName || "ผู้เปิดร่าง" },
        { id: "submit", label: "ผู้จัดทำยื่นอนุมัติ", hint: quote?.approvalRequestedByName || "รอผู้จัดทำ" },
        { id: "approve", label: "เจ้าของดีลอนุมัติ", hint: quote?.approvedByName || "รออนุมัติ" },
      ], approvalWorkflowIndex);
  const controlDescription = needsSubmit
    ? "บันทึกข้อมูลให้เรียบร้อย แล้วจึงยื่นอนุมัติ"
    : awaitingApproval
      ? "ยื่นอนุมัติแล้ว เอกสารถูกล็อกจนกว่าจะดึงกลับหรือได้รับอนุมัติ"
      : quote?.approvalStatus === "approved"
        ? "อนุมัติแล้ว — ส่งให้ลูกค้าได้ รอลูกค้าตอบรับแล้วปิด Won · หากต้องแก้ไขให้ออก Rev. ใหม่"
        : "เอกสารฉบับเดิมที่ออกก่อนระบบอนุมัติ — แก้ทับฉบับเดิมไม่ได้ หากต้องแก้ไขให้ออก Rev. ใหม่";
  const primaryAction = editable
    ? {
        id: "save",
        kind: "save",
        label: ["save", "revise"].includes(busy) ? "กำลังบันทึก…" : "บันทึก",
        disabled: !dirty,
        disabledReason: !dirty ? "ยังไม่มีข้อมูลที่เปลี่ยนแปลง" : undefined,
        onClick: () => setConfirmState({
          title: "บันทึกใบเสนอราคา",
          description: `ยืนยันบันทึกการแก้ไข ${quote.quoteNumber} หรือไม่`,
          detail: "ระบบจะอัปเดตข้อมูลฉบับร่างปัจจุบัน",
          confirmLabel: "บันทึก",
          action: save,
        }),
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
        // อนุมัติแล้ว = ถือว่าส่งลูกค้าแล้ว (mig 0165) → ขั้นถัดไปคือรอลูกค้าตอบรับแล้วปิด Won
        // เดิมใบที่อนุมัติแล้วไม่มีปุ่มหลักเลย เหลือปุ่ม outline 5 ปุ่มเท่ากันหมด
        : canCloseWon
          ? {
              id: "won",
              kind: "approve",
              label: "Won",
              disabled: dirty,
              disabledReason: dirty ? "บันทึกการแก้ไขก่อนปิด Won" : undefined,
              title: "ปิด Won ผ่านใบเสนอราคานี้",
              onClick: doAccept,
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
      id: "withdraw",
      kind: "withdraw",
      variant: "outline",
      visible: canWithdrawSubmission && !editMode,
      onClick: () => { setError(""); setWorkflowForm({ reason: "" }); },
    },
    {
      id: "reject",
      kind: "reject",
      label: "ตีกลับให้แก้ไข",
      variant: "outline",
      visible: canRejectSubmission && !editMode,
      onClick: () => { setError(""); setRejectForm({ reason: "" }); },
    },
    {
      id: "revise",
      kind: "revise",
      variant: "outline",
      visible: canReviseDocument && !editMode,
      disabled: !!reviseBlocker,
      disabledReason: reviseBlocker || undefined,
      onClick: () => { setError(""); setRevisionForm({ reason: "" }); },
    },
    // "ส่งให้ลูกค้า" ถูกถอดออก (mig 0165): การอนุมัติตั้ง status='sent' ให้เองแล้ว —
    // ปุ่มเดิมไม่ได้ส่งอีเมลหรือแจ้งเตือนอะไร แค่เปลี่ยนตัวอักษรบนป้ายสถานะ
    // Won ย้ายขึ้นไปเป็นปุ่มหลักของใบที่อนุมัติแล้ว (ดู primaryAction ด้านบน)
    { id: "print", kind: "print", label: "ออกเอกสาร", variant: "ghost", visible: !editMode, onClick: doPrint },
    {
      /* ⭐ ออกสัญญาจากใบนี้ (mig 0278) — ทางลัดจากใบที่ "อนุมัติแล้ว" ซึ่งเป็นด่านของสัญญาพอดี
         ⚠️ ไม่ตรวจชนิดสัญญาที่นี่ — โมดัลถามด่านตัวเดียวกับ API แล้วบอกเหตุผลถ้าออกไม่ได้
            (ดีลที่ยังไม่ระบุสายธุรกิจ ฯลฯ) · ซ่อนปุ่มเงียบ ๆ = คนถามว่าปุ่มอยู่ไหน */
      id: "contract",
      kind: "goto",
      label: "ออกสัญญาจากใบนี้",
      variant: "outline",
      visible: quote?.approvalStatus === "approved" && !editMode && canEditCap,
      onClick: () => setContractOpen(true),
    },
    {
      id: "download",
      kind: "download",
      label: "ดาวน์โหลด PDF",
      variant: "ghost",
      // !editMode เหมือนปุ่มอื่นทั้งลิสต์ — เดิมตกหล่นปุ่มเดียว เข้าโหมดแก้ไขแล้วเหลือปุ่มนี้ลอย
      visible: quote?.approvalStatus === "approved" && !editMode,
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
      onClick: () => { setError(""); setUnacceptForm({ reason: "" }); },
    },
  ];

  return (
    <Workspace
      back={{ href: "/sa/quotations", label: "กลับหน้าใบเสนอราคา" }}
      hideHeader
    >
      {error && (
        <StatusNotice
          tone="error"
          action={errorActionUrl ? <Link href={errorActionUrl} className="btn ghost sm">ไปบัญชีของฉัน</Link> : null}
        >
          {error}
        </StatusNotice>
      )}

      {/* ตีกลับแล้ว = ผู้จัดทำต้องรู้ว่าต้องแก้อะไร ก่อนจะยื่นใหม่ (mig 0164) —
          trigger ล้างเหตุผลให้เองเมื่อยื่นซ้ำ กล่องนี้จึงหายไปเองไม่ต้องมีปุ่มปิด */}
      {rejectionNotice && (
        <StatusNotice tone="error">
          <strong>ตีกลับโดย {rejectionNotice.byName}</strong>
          {rejectionNotice.at ? ` · ${fmtDate(rejectionNotice.at)}` : ""}
          <div style={{ marginTop: 4 }}>{rejectionNotice.reason}</div>
        </StatusNotice>
      )}

      {quote && (
        <div className={styles.detailLayout}>
          <div className={styles.documentColumn}>
          <SalesDetailOverview
            eyebrow="FM-SA-01 · QUOTATION"
            title={quote.quoteNumber}
            /* รหัส AR นำหน้าชื่อลูกค้า (มติผู้ใช้ 2026-08-21) — อ่านสดจากทะเบียนที่หน้านี้
               โหลดไว้อยู่แล้วสำหรับที่อยู่เอกสาร ไม่ใช่ค่าที่ประทับไว้ในใบ */
            description={`${customerHeadline(quote.customerName, customer?.arCode) || "ไม่ระบุลูกค้า"} · โครงการ ${quote.deal?.project?.name || quote.deal?.project?.code || "ไม่ระบุ"} · ดีล ${quote.deal?.title || "ไม่ระบุ"}`}
            badges={<><SalesStateBadge label={statusMeta.label} color={statusMeta.color} />{quote.revisionNo > 0 ? <span className="ui-badge">Revision {quote.revisionNo}</span> : null}</>}
            facts={[
              { icon: CalendarDays, label: "วันที่ออกใบ", value: form.quoteDate ? fmtDate(form.quoteDate) : NA },
              { icon: CalendarDays, label: "ยืนราคาถึง", value: form.validUntil ? fmtDate(form.validUntil) : "ไม่ระบุ" },
              { icon: CircleDollarSign, label: "ภาษี", value: form.vatRate > 0 ? `+ VAT ${form.vatRate}%` : "รวม VAT แล้ว" },
              { icon: Package, label: "รายการ", value: `${lines.length} รายการ` },
            ]}
          >
            <span>ประเภทดีล: {dealType} · {DEAL_TYPE_LABELS[dealType]}</span>
          </SalesDetailOverview>

          {/* ข้อมูลลูกค้าที่แช่แข็งบนใบ (Q3) — อ่านอย่างเดียว แก้ที่ฐานข้อมูลลูกค้า
              ยกเว้น "ใช้ที่อยู่ไหน" ซึ่งเป็นข้อมูลของเอกสารเอง เลือกใหม่ได้ตราบใบยังเป็น
              ร่างที่ยังไม่ยื่นอนุมัติ (editable) — เปลี่ยนแล้วต้องกดบันทึกเหมือนช่องอื่น */}
          {(quote.billingAddress || quote.contactName || quote.shippingAddress || editable) && (
            <section className={`${styles.card} ${styles.customerCard}`}>
              <div className={styles.sectionHeading}>
                <UserRound size={17} aria-hidden="true" />
                <h2>ข้อมูลลูกค้าในเอกสาร</h2>
                <div className="spacer" />
                {quote.customerId && (
                  <Link href={`/database/customers/${quote.customerId}`} className="btn ghost sm" target="_blank">
                    <ExternalLink size={13} aria-hidden="true" /> แก้ที่ฐานข้อมูลลูกค้า
                  </Link>
                )}
              </div>
              {/* ชื่อลูกค้าอยู่นอก component เพราะเป็นของ "ใบ" ไม่ใช่ช่องที่เลือกได้
                  (หน้าสร้างยังไม่มีใบ จึงไม่มีบรรทัดนี้) */}
              <div className={styles.infoBlock}><UserRound size={16} /><span><small>ลูกค้า</small>{naText(quote.customerName)}</span></div>
              <QuotationCustomerFields
                mode="edit"
                editable={editable}
                customer={customer}
                value={{
                  billingAddressId: form.billingAddressId,
                  shippingAddressId: form.shippingAddressId,
                  contactIndex: form.contactIndex,
                }}
                picked={pickedAddresses}
                snapshot={quote}
                onChange={setF}
              />
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
            {/* เอกสารอ้างอิง (mig 0267) — ข้อความอิสระ ขึ้นเป็นแถวหนึ่งในบล็อกอ้างอิงบน
                เอกสาร · บรรทัดเดียวโดยเจตนา: เอกสารเรนเดอร์เป็นแถว label/value แถวเดียว
                ช่องหลายบรรทัดจะสัญญาสิ่งที่เอกสารทำไม่ได้ */}
            <label className={styles.referenceField}>เอกสารอ้างอิง
              <Input
                value={form.referenceNote || ""}
                disabled={!editable}
                placeholder="เช่น อ้างถึง PO-1234 ลว. 5 ส.ค. 69"
                onChange={(event) => setF({ referenceNote: event.target.value })}
              />
            </label>
            {/* ⚠️ ภาษาเอกสาร (IS-26080005) **ไม่ได้อยู่ในฟอร์มนี้** — อยู่ที่แถบเครื่องมือ
                ของหน้าพรีวิว/พิมพ์ (มติผู้ใช้ 2026-08-12: คนนึกถึงภาษาตอนกำลังจะส่งเอกสาร
                ไม่ใช่ตอนกรอกหัวใบ) · สวิตช์ตรงนั้นสลับมุมมองแล้วบันทึกกลับลงใบเอง
                ห้ามเพิ่มช่องซ้ำที่นี่ — สองที่เมื่อไรก็เพี้ยนหากันเมื่อนั้น */}
          </section>

          {/* รายการ */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <Package size={17} aria-hidden="true" />
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

          {/* งวดการชำระ — แยกจากเทมเพลตและเงื่อนไขการชำระ */}
          <section className={styles.card}>
            <QuotationInstallments
              value={payment}
              onChange={updatePayment}
              totalAmount={totals.totalAmount}
              disabled={!editable}
            />
          </section>

          {/* เงื่อนไขการชำระ — เทมเพลตเติมเฉพาะวิธีและข้อความ */}
          <section className={styles.card}>
            <QuotationPaymentTerms
              value={payment}
              onChange={updatePayment}
              disabled={!editable}
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
            />
          </section>

          {/* ใบไม่มีเธรดของตัวเองแล้ว (มติผู้ใช้ 2026-08-04) — ความเคลื่อนไหวของใบ
              ทุกอย่างไปอยู่ในเธรดของ **ดีลแม่** ที่เดียว (และไหลต่อขึ้นหน้าโครงการ)
              เหตุผลเต็มใน lib/sales/documentUpdates.js */}

          </div>

          <ContextualRightRail className={styles.sidebar} label="สรุปและจัดการใบเสนอราคา">
            <DocumentSummaryCard
              title="ยอดสุทธิใบเสนอราคา"
              total={money(totals.totalAmount)}
              status={statusMeta.label}
              statusColor={statusMeta.color}
              rows={[
                { id: "subtotal", label: "รวมรายการ", value: money(totals.subtotal) },
                { id: "discount", label: "ส่วนลด", value: totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : NA },
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
                {awaitingApproval ? <span className="ui-badge ui-badge-warn">รอเจ้าของดีลอนุมัติ{quote.approvalRequestedByName ? ` · ยื่นโดย ${quote.approvalRequestedByName}` : ""}</span> : null}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-7)" }}>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>ประเภทเอกสาร</small>{CONFIRM_DOC_TYPE_LABELS[quote.wonDocType] || naText(quote.wonDocType)}</div>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>วันที่เอกสาร</small>{quote.wonDocDate ? fmtDate(quote.wonDocDate) : NA}</div>
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
                title="ใบสั่งขาย"
                meta="เอกสารปลายทางจากใบเสนอราคานี้"
                actions={<Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด SO</Link>}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="linklike mono" style={{ fontWeight: "var(--fw-bold)" }}>{quote.salesOrder.orderNumber}</Link>
                  <span className="ui-badge" style={{ color: quote.salesOrder.status === "approved" ? "var(--green)" : quote.salesOrder.status === "pending_approval" ? "var(--amber)" : "var(--text-3)" }}>{({ draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" })[quote.salesOrder.status] || quote.salesOrder.status}</span>
                  <span style={{ color: "var(--text-2)" }}>Actual ก่อน VAT {fmtMoney(quote.salesOrder.status === "approved" ? quote.salesOrder.actualAmount : 0)}</span>
                </div>
              </RelatedDocumentCard>
            )}

            {quote.status === "accepted" && !quote.salesOrder && canEditCap && (
              <RelatedDocumentCard
                icon={ClipboardList}
                eyebrow="DOWNSTREAM DOCUMENT"
                title="ใบสั่งขาย"
                meta="ยังไม่ได้สร้างเอกสารปลายทาง"
                actions={<Link href={salesOrderFormHref} className="btn btn-primary"><Plus size={14} /> สร้างใบสั่งขาย</Link>}
              >
                <p style={{ color: "var(--text-2)", marginTop: 0 }}>กรอกเอกสารยืนยันคำสั่งซื้อ กำหนดชำระรายงวด และเงินที่ลูกค้าจ่ายมาแล้ว ในหน้าเดียว แล้วออกใบเพื่อยื่นให้ AE Supervisor อนุมัติ</p>
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
                      style={revision.id === quote.id ? { color: "var(--blue)", fontWeight: "var(--fw-bold)" } : undefined}
                    >
                      <span>
                        {revision.quoteNumber}
                        {revision.id === quote.id ? " · ฉบับนี้" : ""}
                        <small style={{ display: "block", color: "var(--text-3)", fontWeight: "var(--fw-normal)" }}>
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
        deal={quote?.deal}
        customerId={quote?.customerId || quote?.deal?.customerId}
        customerName={quote?.customerName || quote?.deal?.customerName}
        onDone={async () => { setWonOpen(false); await load(); }}
      />

      {/* ย้อนการรับ (มติ 2026-07-21) — ใช้ reason dialog กลาง แต่คง validation ของ QT */}
      <ReasonDialog
        open={!!unacceptForm}
        title="ย้อนการรับใบเสนอราคา"
        description={`ใบ ${naText(quote?.quoteNumber)} จะกลับเป็น “อนุมัติแล้ว” และดีลถอยออกจาก Won`}
        detail="ใช้สำหรับแก้กรณีรับใบผิดก่อนมีใบสั่งขายโดยหลักฐานการรับเดิมยังคงอยู่ในประวัติ"
        label="เหตุผลที่ย้อนการรับ"
        value={unacceptForm?.reason || ""}
        onChange={(reason) => setUnacceptForm({ reason })}
        onClose={() => setUnacceptForm(null)}
        onConfirm={doUnaccept}
        confirmLabel="ยืนยันย้อนการรับ"
        placeholder="เช่น กดรับใบผิดฉบับ — ดีลนี้ต้องปิดด้วยใบเสนอราคาอีกใบ"
        helpText={`บังคับอย่างน้อย 10 ตัวอักษร · ${unacceptForm?.reason.length || 0}/${UNACCEPT_REASON_MAX}`}
        error={unacceptForm?.reason ? unacceptReasonValidation : ""}
        minLength={10}
        maxLength={UNACCEPT_REASON_MAX}
        submitError={unacceptForm ? error : ""}
        busy={busy === "unaccept"}
      />

      <ReasonDialog
        open={!!workflowForm}
        title="ดึงกลับใบเสนอราคา"
        description={`ใบ ${naText(quote?.quoteNumber)} จะกลับเป็นสถานะยังไม่ยื่นอนุมัติ`}
        detail="ผู้ยื่นดึงเอกสารของตัวเองกลับได้ขณะที่ยังรออนุมัติ จากนั้นผู้มีสิทธิ์แก้ไขจึงเปิดแก้เอกสารได้"
        label="เหตุผลที่ดึงกลับ"
        value={workflowForm?.reason || ""}
        onChange={(reason) => setWorkflowForm({ reason })}
        onClose={() => setWorkflowForm(null)}
        onConfirm={withdrawSubmission}
        confirmLabel="ยืนยันดึงกลับ"
        placeholder="ระบุเหตุผลที่ต้องนำเอกสารกลับไปแก้ไข"
        helpText={`อย่างน้อย 10 ตัวอักษร · ${workflowForm?.reason?.length || 0}/500`}
        error={workflowForm?.reason && workflowForm.reason.trim().length < 10 ? "กรุณาระบุอย่างน้อย 10 ตัวอักษร" : ""}
        minLength={10}
        maxLength={500}
        submitError={workflowForm ? error : ""}
        busy={busy === "withdraw"}
      />

      <ReasonDialog
        open={!!rejectForm}
        title="ตีกลับให้ผู้จัดทำแก้ไข"
        description={`ใบ ${naText(quote?.quoteNumber)} จะกลับไปให้ผู้จัดทำแก้ พร้อมเหตุผลที่คุณระบุ`}
        detail="ผู้จัดทำจะเห็นเหตุผลนี้บนใบเสนอราคาและได้รับแจ้งเตือน แก้เสร็จต้องยื่นและลงนามใหม่"
        label="เหตุผลที่ตีกลับ"
        value={rejectForm?.reason || ""}
        onChange={(reason) => setRejectForm({ reason })}
        onClose={() => setRejectForm(null)}
        onConfirm={rejectSubmission}
        confirmLabel="ยืนยันตีกลับ"
        placeholder="ระบุสิ่งที่ต้องแก้ให้ชัดเจน เช่น ราคาบรรทัดที่ 3 ไม่ตรงกับที่ตกลงกับลูกค้า"
        helpText={`อย่างน้อย 10 ตัวอักษร · ${rejectForm?.reason?.length || 0}/500`}
        error={rejectForm?.reason && rejectForm.reason.trim().length < 10 ? "กรุณาระบุอย่างน้อย 10 ตัวอักษร" : ""}
        minLength={10}
        maxLength={500}
        tone="danger"
        submitError={rejectForm ? error : ""}
        busy={busy === "reject"}
      />

      <ReasonDialog
        open={!!revisionForm}
        title="ออก Rev. ใบเสนอราคา"
        description={`ระบบจะเก็บ ${naText(quote?.quoteNumber)} เป็นฉบับเดิม และสร้างฉบับร่างใหม่`}
        detail="เอกสารที่อนุมัติแล้วแก้ไขตรงไม่ได้ Revision ใหม่จะต้องตรวจข้อมูลและยื่นอนุมัติอีกครั้ง"
        label="เหตุผลที่ออก Rev."
        value={revisionForm?.reason || ""}
        onChange={(reason) => setRevisionForm({ reason })}
        onClose={() => setRevisionForm(null)}
        onConfirm={saveAsRevision}
        confirmLabel="สร้าง Revision"
        placeholder="ระบุสิ่งที่ต้องแก้ไขในฉบับใหม่"
        helpText={`อย่างน้อย 10 ตัวอักษร · ${revisionForm?.reason?.length || 0}/500`}
        error={revisionForm?.reason && revisionForm.reason.trim().length < 10 ? "กรุณาระบุอย่างน้อย 10 ตัวอักษร" : ""}
        minLength={10}
        maxLength={500}
        submitError={revisionForm ? error : ""}
        busy={busy === "revise"}
      />

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
      <ContractCreateModal
        open={contractOpen}
        dealId={quote?.dealId}
        quotationId={quote?.id}
        onClose={() => setContractOpen(false)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

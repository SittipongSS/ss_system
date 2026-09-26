"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Building2, CalendarDays, CircleDollarSign, ClipboardList, Package,
  ExternalLink, FileCheck2, FileClock, FileSignature, FileText, FolderKanban, Handshake, History, MapPin,
  Pencil, Repeat, ShieldAlert, Trash2, Undo2, XCircle,
} from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import Workspace from "@/components/ui/Workspace";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import ReadableText from "@/components/ui/ReadableText";
import StatusNotice from "@/components/ui/StatusNotice";
import Toast, { notifyToast } from "@/components/ui/Toast";
import { RESPONSE_WARNING_TOAST, responseWarningText } from "@/lib/apiWarnings";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { customerHeadline } from "@/lib/master/customerAr";
import SalesOrderConfirmationFields from "@/components/salesPlanning/SalesOrderConfirmationFields";
import SalesOrderFollowUpDocs from "@/components/salesPlanning/SalesOrderFollowUpDocs";
import SalesOrderDeliveryDueField from "@/components/salesPlanning/SalesOrderDeliveryDueField";
import { orderConfirmationOf, salesOrderConfirmationGate } from "@/lib/sales/orderConfirmationDocs";

/* ค่าตั้งต้นของฟอร์ม "ยืนยันคำสั่งซื้อ" — **อ่านสองบ้านเหมือนตอนแสดงผล**
 *
 * 🐞 เดิม seed จาก `order.confirm*` อย่างเดียว ⇒ ใบที่ออกก่อน mig 0285 (61 จาก 72 ใบ
 * บน prod) กดแก้แล้วการ์ดไฟล์ว่างเปล่า ทั้งที่หลักฐานอยู่ครบที่ใบเสนอราคาต้นทาง
 * · แย่กว่านั้น: แค่กรอกช่อง "ชนิดเอกสาร" แล้วบันทึก `orderConfirmationOf` ก็พลิกไป
 * อ่านบ้านของใบสั่งขายซึ่งไม่มีไฟล์ ⇒ หลักฐานหายจากจอ และด่านยื่นอนุมัติเด้งว่า
 * "ยังไม่มีไฟล์แนบ" ทั้งที่ไฟล์ยังอยู่ที่เดิม
 *
 * ⭐ seed จากบ้านที่ระบบอ่านจริง ⇒ ไฟล์ที่เห็นตอนแก้คือไฟล์ชุดเดียวกับตอนอ่าน และ
 * บันทึกแล้ว ref ตามเข้าใบ ทำให้ใบเป็นเจ้าของหลักฐานของตัวเองตั้งแต่นั้น
 * (ด่านอ่าน `confirm-file` รับ path ของโฟลเดอร์ `won/` ด้วยแล้ว — ดู privateEvidence) */
function confirmationDraft(order) {
  const onFile = orderConfirmationOf(order, order?.quotation);
  return {
    docType: order?.confirmDocType || onFile?.docType || "",
    docNo: order?.confirmDocNo || onFile?.docNo || "",
    docDate: order?.confirmDocDate || onFile?.docDate || "",
    attachments: Array.isArray(order?.confirmAttachments) && order.confirmAttachments.length
      ? order.confirmAttachments
      : (onFile?.attachments || []),
  };
}
import {
  DocumentControlCard, DocumentSummaryCard,
} from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import SignatureReadyNotice from "@/components/account/SignatureReadyNotice";
import { useCan, useRole } from "@/lib/roleContext";
import {
  PENDING_APPROVAL_LABEL,
  SALES_ORDER_CANCEL_REASONS,
  canCancelSalesOrder,
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canSubmitSalesOrder,
  canWithdrawSalesOrderSubmission,
  cancelReasonLabel,
  isCustomerCancelReason,
  salesOrderAmountKind,
  salesOrderRestoreBlock,
  isSalesOrderReviewer,
} from "@/lib/sales/salesOrderWorkflow";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { currentMonth, formatMonthLabel } from "@/lib/datePeriods";
import { isSalesOrderSelfApproval } from "@/lib/sales/salesOrderApprovalOverride";
// ⚠️ ป้ายขั้นดีลมาจาก STAGE_LABELS ที่เดียว — ของเดิมพิมพ์ค่าดิบจาก DB ("won")
// ลงจอ ทั้งที่หน้าดีล/คิวใช้ป้ายไทยกันหมด (ดู lib/salesPlanning.js)
import { STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { branchLabel } from "@/lib/master/thaiAddress";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openSalesOrderPrintWindowPreferIssued, prepareSalesOrderPrintWindow, showSalesOrderPrintError } from "@/lib/sales/salesOrderPrint";
import { getCompanyProfileForPrint } from "@/lib/companyProfile";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { orderAmountToCollect } from "@/lib/tax/exciseBilling";
import styles from "./page.module.css";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import { scentCountForOrder, scentDesignLines, scentDesignOrderError } from "@/lib/requests/scentDesignOrders";
import { productionReadiness } from "@/lib/pm/deliveries";
import { salesOrderPlanSummary } from "@/lib/pm/productionPlan";
import Textarea from "@/components/ui/Textarea";
import Input from "@/components/ui/Input";
import { businessDate } from "@/lib/businessDate";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import SalesOrderWorkTrack from "@/components/salesPlanning/SalesOrderWorkTrack";
import SalesOrderPaymentPanel from "@/components/salesPlanning/SalesOrderPaymentPanel";
import ServiceContractCard from "@/components/salesPlanning/ServiceContractCard";
import DealContractsCard from "@/components/salesPlanning/DealContractsCard";
import Tabs from "@/components/ui/Tabs";
import SalesOrderServiceTab from "@/components/salesPlanning/SalesOrderServiceTab";
import SalesOrderDocumentsPanel, { installmentFilesKey, useSalesOrderDocuments } from "@/components/salesPlanning/SalesOrderDocumentsPanel";
import { orderHasServiceRounds, orderOnServiceLine, serviceRoundsSold } from "@/lib/sales/serviceOrders";
import { serviceContractHeadline } from "@/lib/sales/serviceContractLink";
import { salesOrderWorkTrack } from "@/lib/sales/salesOrderWorkTrack";
import {
  cancelledMoneyRestoreBlock, installmentReportDoneMessage, installmentVoid, paymentRollup, salesOrderMoneyOutcome,
} from "@/lib/sales/salesOrderPayments";
import { REPLAN_DONE_MESSAGE } from "@/lib/sales/installmentReplan";
import { CARRY_DONE_MESSAGE } from "@/lib/sales/installmentCarry";
import { approvalPrompt, historicalApprovalPrompt } from "@/lib/approvalPrompt";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { liveSpecDocumentCount, salesOrderSpecDocEffect } from "@/lib/sales/productSpecDocView";
import {
  FINANCE_REVIEW_POINTS, FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES,
  financeActionError, financeStatusOf, financeStepOwnerError, financeWorkflowStep,
  salesOrderWorkflowIndex,
} from "@/lib/sales/salesOrderFinanceApproval";
import {
  HISTORICAL_EDITABLE_STATUSES, HISTORICAL_STATUS_NOTE, OPENING_INSTALLMENT_LABEL,
  historicalCancelBlock, historicalCancelNoteError, historicalEditPath, historicalRefsOf, isHistoricalOrder,
} from "@/lib/sales/historicalOrders";
/* ⭐ ถ้อยคำ/ตรรกะของใบย้อนหลังอยู่ที่ `historicalOrderCopy` ทั้งชุด — หน้านี้ยาว ~1,600 บรรทัด
   และใบย้อนหลังพูดคนละเรื่องกับใบปกติแทบทุกจุด ⇒ ที่นี่แตกกิ่ง JSX อย่างเดียว ไม่เขียนคำเอง */
import {
  HISTORICAL_APPROVE_TOAST, historicalApprovalFacts, historicalCancelEffect, historicalCancelPrompt, historicalCancelToast,
  historicalCoverageSegments, historicalOverrideNote, historicalRejectDetail, historicalServiceProgress, historicalStatusCopy,
  historicalWithdrawDetail, historicalWorkflowSteps,
} from "@/lib/sales/historicalOrderCopy";
import HistoricalZonesCard from "@/components/salesPlanning/HistoricalZonesCard";
import HistoricalDuplicateReviewCard from "@/components/salesPlanning/HistoricalDuplicateReviewCard";
import { historicalDuplicateReviewOf, historicalDuplicateReviewView } from "@/lib/sales/historicalDuplicates";
import CoverageTimeline from "@/components/salesPlanning/historicalWizard/CoverageTimeline";

/* โทนของ `historicalStatusCopy` → สีของป้ายสถานะบนหัวใบ/การ์ดจัดการ (ชิ้นพวกนั้นรับ `color` ไม่ใช่ tone)
   ⚠️ แผนที่ของ **การแสดงผล** เท่านั้น — ตัวตัดสินว่าสถานะไหนโทนอะไรอยู่ที่ historicalOrderCopy ที่เดียว */
const HISTORICAL_TONE_COLOR = Object.freeze({
  muted: "var(--text-3)",
  warning: "var(--amber)",
  danger: "var(--red)",
  success: "var(--green)",
});

const STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)", description: "ตรวจสอบข้อมูลและรายการก่อนยื่นอนุมัติ" },
  /* ⭐ ใบรออนุมัติมีคำอธิบายของตัวเองแล้ว (มติผู้ใช้ 2026-09-11 · mig 0353) — ยอดของใบนี้
     ขึ้นบนภาพรวม/ดีล/โครงการเป็น "รออนุมัติ" แยกจาก Actual · เดิมว่างเปล่า ทั้งที่สถานะอื่น
     ทุกตัวบอกผลต่อ Actual ของมัน */
  pending_approval: {
    label: "รอ AE Supervisor อนุมัติ",
    color: "var(--amber)",
    description: `ยอดขึ้นเป็น "${PENDING_APPROVAL_LABEL}" บนดีลและโครงการ — ยังไม่นับเป็น Actual จนกว่าจะอนุมัติ (อนุมัติแล้วเข้า Actual ของเดือนที่อนุมัติ)`,
  },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)", description: "ยอดถูกนับเป็น Actual แล้ว" },
  rejected: { label: "ตีกลับให้แก้ไข", color: "var(--red)", description: "แก้ไขตามเหตุผลแล้วส่งอนุมัติใหม่" },
  approval_revoked: { label: "ย้อนการอนุมัติแล้ว", color: "var(--red)", description: "ยอดหลุดจาก Actual แล้ว · แก้ฉบับเดิมไม่ได้ ต้องออก Rev. (AE เจ้าของดีลหรือ AE Supervisor กดได้)" },
  revised: { label: "ออก Rev. แล้ว", color: "var(--amber)", description: "เก็บเป็นประวัติและมีฉบับแก้ไขใหม่แล้ว" },
  cancelled: { label: "ยกเลิก", color: "var(--red)", description: "เอกสารนี้ไม่ถูกนับเป็น Actual" },
};

const ACTION_MESSAGE = {
  save: "บันทึกร่างเรียบร้อยแล้ว",
  submit: "ยื่นอนุมัติเรียบร้อยแล้ว",
  approve: "อนุมัติ SO และอัปเดต Actual แล้ว",
  reject: "ตีกลับให้ผู้จัดทำแก้ไขแล้ว",
  withdraw: "ดึงกลับแล้ว",
  revoke: "ย้อนการอนุมัติแล้ว — ยอดหลุดจาก Actual · ขั้นถัดไปคือออก Rev.",
  revise: "ออก Rev. ใหม่แล้ว",
  cancel: "ยกเลิก SO และคำนวณ Actual ใหม่แล้ว",
  restore: "คืน SO เป็นฉบับร่างแล้ว",
  /* ขั้นบัญชี (mig 0250) — ไม่มีข้อความไหนพูดถึง Actual เพราะบัญชีไม่แตะยอด
     ⚠️ `finance_reject`/`finance_resubmit` ถอดออกแล้ว (มติ 2026-08-30: ไม่มีตีกลับทั้งใบ) */
  finance_approve: "ปิดใบสั่งขายแล้ว",
  // ⚠️ ข้อความเดียวใช้ได้ทั้งผูกและถอด — ตัวการ์ดโชว์ผลลัพธ์จริงอยู่แล้วหลังโหลดใหม่
  set_service_contract: "อัปเดตสัญญาของใบแล้ว",
  set_service_rounds: "บันทึกจำนวนรอบบริการแล้ว",
};

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEditCap = useCan("salesplan:edit");
  const canCreateFiling = useCan("sales:act");
  // เปิดคำร้องได้ = สาขาฝ่ายขายของด่าน POST /api/sa/requests (costing:edit) —
  // RD/PC ผ่านด่านนั้นทางสาขา "รับคำร้องของฝ่ายตนได้" ซึ่งไม่ใช่งานของหน้า SO
  const canOpenRequest = useCan("costing:edit");
  const role = useRole();
  // ผู้ตรวจ/อนุมัติ = ตัวเดียวกับ route และ RPC (admin · CD · CM · AE Sup)
  const reviewer = isSalesOrderReviewer(role);
  const [order, setOrder] = useState(null);
  const directory = usePeopleDirectory(); // แปลง ownerId ของดีล → ชื่อปัจจุบัน
  /* แก้ได้เหลือสองช่อง (มติผู้ใช้ 2026-08-18) — วันที่ SO ล็อกเป็นวันที่สร้าง
     และกำหนดชำระย้ายไปอยู่ที่งวดทั้งหมด */
  const [form, setForm] = useState({ referenceDoc: "", notes: "", deliveryDueDate: "" });
  /* เอกสารยืนยันคำสั่งซื้อ (mig 0285) — ใบเก่าหลักฐานอยู่ที่ใบเสนอราคา `orderConfirmationOf`
     อ่านสองบ้านให้แล้ว · ไฟล์ใหม่ที่เพิ่งเลือกยังไม่ได้อัป จึงถือเป็น File[] แยกไว้ */
  const [confirmation, setConfirmation] = useState({ docType: "", docNo: "", docDate: "", attachments: [] });
  const [confirmFiles, setConfirmFiles] = useState([]);
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
  /* เหตุผล Admin Override ของใบย้อนหลัง — ไม่บังคับ (พาริตี้กับสาย pipeline · มติ 2026-07-25)
     ⚠️ เก็บคู่กับ ref เพราะ `confirmState.action` ถูกสร้างตอน *เปิด* โมดัล ⇒ closure ของมันเห็นค่าตอนนั้น
     ถ้าอ่านจาก state ตรง ๆ จะส่งค่าว่างเสมอ (คนพิมพ์แล้วเหตุผลหายเงียบ) */
  const [overrideReason, setOverrideReason] = useState("");
  const overrideReasonRef = useRef("");
  const [filingState, setFilingState] = useState({
    loading: true,
    filing: null,
    eligible: false,
    schemaReady: true,
    // บรรทัดสรรพสามิตของใบนี้พร้อมสถานะทะเบียนราย FG — เส้นเดินงานวาดจุดจากตรงนี้
    lines: [],
    warnings: [],
    amountToCollect: 0,
    error: "",
  });
  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    const [res, filingRes] = await Promise.all([
      apiFetch(`/api/sales-planning/sales-orders/${id}`),
      apiFetch(`/api/tax/orders/from-sales-order?salesOrderId=${encodeURIComponent(id)}`),
    ]);
    const data = await res.json().catch(() => ({}));
    const filingData = await filingRes.json().catch(() => ({}));
    setFilingState(filingRes.ok
      ? {
        loading: false,
        filing: filingData.filing || null,
        eligible: !!filingData.eligible,
        schemaReady: filingData.schemaReady !== false,
        lines: filingData.lines || [],
        warnings: filingData.warnings || [],
        // ยอดเรียกเก็บรวม VAT 7% แล้ว (มติ 2026-07-26) — ตรงกับยอดสุทธิบนเอกสาร
        amountToCollect: filingData.filing
          ? orderAmountToCollect(filingData.filing)
          : Number(filingData.amountToCollect || 0),
        error: "",
      }
      : {
        loading: false,
        filing: null,
        eligible: false,
        schemaReady: true,
        lines: [],
        warnings: [],
        amountToCollect: 0,
        error: filingData.error || "ตรวจสอบใบยื่นสรรพสามิตไม่สำเร็จ",
      });
    if (!res.ok) {
      setError(data.error || "โหลดใบสั่งขายไม่สำเร็จ");
      setSaveState("error");
      return false;
    }
    setOrder(data);
    setForm({ referenceDoc: data.referenceDoc || "", notes: data.notes || "", deliveryDueDate: data.deliveryDueDate || "" });
    setConfirmation(confirmationDraft(data));
    setConfirmFiles([]);
    setDirty(false);
    return true;
  }, [id]);
  useEffect(() => { load(); }, [load]);

  /* ดึงกลับมาเฉพาะ "ตัวใบ" — สถานะ/ขั้นอนุมัติ/ขั้นบัญชี ซึ่งเป็นสิ่งที่ปุ่มทุกตัวอ่าน
     ⚠️ **ห้ามใช้ `load()` แทน** — `load` เขียนทับ `form` · `confirmation` · `confirmFiles`
     และสั่ง `setDirty(false)` ⇒ ถ้าเรียกตอนทำรายการไม่ผ่าน มันจะกลืนสิ่งที่ผู้ใช้
     พิมพ์ค้างไว้ แล้วยังบอกว่า "ไม่มีอะไรค้าง" ต่อหน้าเขาอีกที */
  const refreshOrder = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${id}`);
      if (!res.ok) return;
      const fresh = await res.json().catch(() => null);
      if (fresh) setOrder(fresh);
    } catch { /* รีเฟรชเงียบ — ข้อความที่ผู้ใช้ต้องอ่านคือ error ของ action */ }
  }, [id]);

  async function createFiling() {
    setBusy("filing");
    setError("");
    setToast(null);
    const res = await apiFetch("/api/tax/orders/from-sales-order", {
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
    setFilingState((prev) => ({
      loading: false,
      filing: data,
      eligible: false,
      schemaReady: true,
      // บรรทัดสรรพสามิตไม่ได้เปลี่ยนเพราะสร้างใบยื่น — ทิ้งไปแล้วจุด "ขึ้นทะเบียน" บนเส้นเดินงาน
      // จะหายทั้งช่วงทันทีที่กดสร้าง ทั้งที่ทะเบียนอาจยังค้างอยู่
      lines: prev.lines,
      warnings: data.warnings || [],
      amountToCollect: orderAmountToCollect(data),
      error: "",
    }));
    setBusy("");
    setToast({ kind: "success", msg: "สร้างใบยื่นสรรพสามิตจากใบสั่งขายเรียบร้อยแล้ว" });
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
    const res = await apiFetch(`/api/sales-planning/sales-orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy("");
      setError(data.error || "อัปเดตใบสั่งขายไม่สำเร็จ");
      setErrorActionUrl(data.accountUrl || "");
      if (action === "save") setSaveState("error");
      /* ⭐ **ตีกลับ = จอไม่ตรงกับของจริงแล้ว ⇒ ดึงตัวใบกลับมา** — ด่านของ SO อ่านแถวสด
         ทุกครั้ง (ขั้นยื่น/อนุมัติ/บัญชีตรวจใช้ RPC ที่ตรวจ `expectedUpdatedAt` ซ้ำอีกชั้น)
         ⇒ ข้อความอย่าง "ใบนี้อนุมัติแล้ว" แปลว่ามีคนกดไปก่อน ไม่ใช่ผู้ใช้กดผิด
         ของเดิมปุ่มค้างอยู่ครบ คนกดซ้ำได้ข้อความเดิมจนต้อง F5 เอง */
      refreshOrder();
      return false;
    }
    /* ⚠️ สำเร็จแต่ของที่ตามหลังไม่ครบ (เช่นยกเลิก/ย้ายเอกสาร FM-SA-04 ของใบนี้ไม่สำเร็จ · mig 0370)
       — API ตอบ 2xx พร้อม `warning` ⇒ ต้องขึ้นบนจอ ไม่ใช่กลืนไปกับ "อัปเดตเรียบร้อย" (lib/apiWarnings)
       · ใช้ทักกลางของแอป เพราะทาง revise พาไปหน้าใบใหม่ทันที ทักของหน้านี้จะหายไปกับหน้า */
    const warning = responseWarningText(data);
    if (warning) notifyToast.warning(warning, RESPONSE_WARNING_TOAST);
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
      /* ⚠️ ข้อความของใบปกติพูดว่า "อัปเดต Actual แล้ว" ซึ่งไม่จริงกับใบย้อนหลังสักตัวอักษร —
         ของใบนี้บอกสิ่งที่เกิดจริง (อนุมัติ: เอกสารแทนสัญญาได้เลข CT · งวดขึ้นคิวบัญชี · โซนขึ้นคิว TS ·
         ยกเลิก: สัญญาถูกยกเลิกตาม · งวดยกมาเป็นโมฆะ · ทางคีย์ใหม่ — จากคำตอบของ route · มติ 24/09) */
      msg: (action === "approve" && isHistoricalOrder(order)
        ? HISTORICAL_APPROVE_TOAST
        : action === "cancel" && isHistoricalOrder(order)
          ? historicalCancelToast(data)
          : ACTION_MESSAGE[action]) || "อัปเดตเรียบร้อยแล้ว",
    });
    if (action === "save") setSaveState("saved");
    return data || true;
  }

  async function save() {
    /* ⚠️ ไฟล์เอกสารยืนยันอัปก่อนบันทึก แล้วส่งไปทั้งก้อน — ที่เก็บของมันคือโฟลเดอร์ของ
       **ใบเสนอราคาต้นทาง** (ไฟล์ถูกอัปตั้งแต่ตอนสร้างใบซึ่งใบยังไม่มี id) จึงใช้
       entityType เดียวกับหน้าสร้าง เพื่อให้ทั้งสองทางลงที่เดียวกัน */
    let attachments = confirmation.attachments || [];
    if (confirmFiles.length) {
      setBusy("save");
      try {
        const uploaded = [];
        for (const file of confirmFiles) {
          const ref = await uploadFileBytes({
            file, entityType: "sales_order_confirmation", entityId: order.quotationId,
          });
          uploaded.push({
            fileUrl: ref.url || null,
            driveFileId: ref.driveFileId || null,
            storageBucket: ref.storageBucket || null,
            storagePath: ref.storagePath || null,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          });
        }
        attachments = [...attachments, ...uploaded];
      } catch (uploadError) {
        setBusy("");
        setError(uploadError.message || "อัปโหลดเอกสารยืนยันไม่สำเร็จ");
        return;
      }
    }
    const saved = await requestAction("save", { ...form, confirmation: { ...confirmation, attachments } });
    if (!saved) return;
    setConfirmFiles([]);
    setEditMode(false);
  }

  /* ⭐ จังหวะที่ยอดกลายเป็น "รออนุมัติ" คือปุ่มนี้ (มติผู้ใช้ 2026-09-11 · mig 0353) — โมดัล
     ต้องบอกว่าเงินไปอยู่ไหน ไม่ใช่บอกแค่ว่าเอกสารถูกล็อก (กติกา approval-confirm-modals #1223) */
  function openSubmitConfirm() {
    // เปิดโมดัลที่โชว์ error ของหน้า ⇒ ล้างของรอบก่อนทิ้ง (ดูคอมเมนต์ที่ `showsError` ข้างล่าง)
    setError("");
    setConfirmState({
      title: "ยื่นอนุมัติ ใบสั่งขาย",
      description: `ยืนยันยื่น ${order.orderNumber} ให้ AE Supervisor ตรวจอนุมัติหรือไม่`,
      detail: [
        "หลังยื่นแล้วเอกสารจะถูกล็อก ผู้ยื่นดึงเอกสารของตัวเองกลับได้",
        `ยอด ${fmtMoney(order.actualAmount)} (ก่อน VAT) จะขึ้นเป็น "${PENDING_APPROVAL_LABEL}" บนภาพรวม ดีล และโครงการ — ยังไม่นับเป็น Actual จนกว่าจะอนุมัติ`,
      ].join("\n"),
      confirmLabel: "ยื่นอนุมัติ",
      /* 🐞 เหตุที่ API ปฏิเสธการยื่นต้องอ่านได้ **ในโมดัลที่ยังเปิดอยู่** — แถบ error ของหน้าอยู่บนสุด
         ของคอลัมน์ ⇒ โมดัลบังไว้หมด · ด่านของ `submit` ตอบหลายข้อจริง ๆ (ใบขยับไปแล้ว · ยังไม่มี
         หลักฐานยืนยันคำสั่งซื้อ · บรรทัดไม่ครบ) ⇒ เงียบแล้วคนกดจะกดซ้ำโดยไม่รู้ว่าติดอะไร */
      showsError: true,
      action: () => requestAction("submit"),
    });
  }

  /* ── งวดชำระ (mig 0245) ────────────────────────────────────────────────
     ⭐ หลักฐานปิด Won ย้ายไปอยู่ **หัวการ์ด "การชำระ"** แล้ว (มติผู้ใช้ 2026-08-13)
     เพราะเป็นเรื่องเดียวกัน: ตกลงซื้อด้วยเอกสารอะไร แล้วจ่ายมากี่งวดแล้ว
     ⚠️ ยังเป็นการ **ยืมมาโชว์ ไม่ย้ายข้อมูล** — `wonAttachments` เป็น audit trail
     ของการกด Won ซึ่งเป็นของ QT (mig 0138 เก็บไว้แม้ถูก unaccept) */
  async function uploadPaymentEvidence(file) {
    // ไบต์ขึ้น bucket ส่วนตัวตรงจากเบราว์เซอร์ (signed URL จาก /api/upload/session)
    let ref;
    try {
      ref = await uploadFileBytes({
        file, entityType: "sales_order_payment_evidence", entityId: id,
      });
    } catch (err) {
      throw new Error(err?.message || `อัปโหลด ${file.name} ไม่สำเร็จ`);
    }
    return {
      fileUrl: ref.url || null,
      storageBucket: ref.storageBucket || null,
      storagePath: ref.storagePath || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  async function startPaymentTracking() {
    setBusy("start-payments");
    setError("");
    const res = await apiFetch(`/api/sales-planning/sales-orders/${id}/installments`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setError(data.error || "เริ่มติดตามการชำระไม่สำเร็จ"); return false; }
    setOrder((current) => ({ ...current, installments: data.installments || [] }));
    setToast({ kind: "success", msg: `สร้างงวดชำระ ${data.installments?.length || 0} งวดแล้ว` });
    return true;
  }

  /* ด่านของแต่ละคำสั่งอยู่ที่ `installmentActionError` ซึ่งการ์ดใช้ซ่อนปุ่มและ API ใช้ปฏิเสธ
     ที่นี่จึงเหลือแค่ "อัปไฟล์ (ถ้ามี) แล้วยิง" — ไม่ตัดสินสิทธิ์ซ้ำ
     ⭐ optimistic lock (PR0) — ส่ง `updatedAt` ของแถวที่ตาเห็น (แผงส่งแถวล่าสุดของตารางมาเสมอ)
       ⇒ แถวถูกแก้จากอีกหน้าต่าง = 409 แล้วดึงใบสดมา (`refreshOrder` ไม่แตะฟอร์มที่พิมพ์ค้าง) ให้กดใหม่ได้ */
  async function runInstallmentAction(row, action, options = {}) {
    setBusy(`installment-${action}`);
    setError("");
    setToast(null);
    try {
      let evidence;
      if (action === "report") {
        evidence = [];
        for (const file of options.files || []) evidence.push(await uploadPaymentEvidence(file));
      }
      const res = await apiFetch(`/api/sales-planning/sales-orders/${id}/installments`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installmentId: row.id, action, ...options, files: undefined, evidence,
          expectedUpdatedAt: row.updatedAt || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) refreshOrder();
        setError(data.error || "อัปเดตงวดชำระไม่สำเร็จ");
        return false;
      }
      setOrder((current) => ({ ...current, installments: data.installments || [] }));
      setToast({
        kind: action === "reject" ? "info" : "success",
        msg: {
          // ตามปลายทางจริงของแถว — บัญชีบันทึกเองจบที่ "ชำระแล้ว" · งวดร่างยังไม่ถึงบัญชี
          report: installmentReportDoneMessage(data.installment?.status),
          withdraw: "ดึงกลับแล้ว",
          confirm: "บัญชีรับรองการชำระแล้ว",
          reject: "ตีกลับให้ฝ่ายขายแก้แล้ว",
          schedule: "บันทึกกำหนดชำระแล้ว",
          coverage: "บันทึกช่วงครอบบริการแล้ว",
          link: "แนบคำร้องขอเอกสารกับงวดนี้แล้ว",
          unlink: "ถอดคำร้องออกจากงวดแล้ว",
          "tax-invoice": "บันทึกใบกำกับภาษีของงวดแล้ว",
          "tax-invoice-clear": "ลบใบกำกับภาษีของงวดแล้ว",
          // เงินค้างจากใบที่ยกเลิก (PR3 · 0378)
          refund: "บันทึกคืนเงินแล้ว — งวดออกจากเงินค้างของใบที่ยกเลิก",
          "refund-clear": "ถอนการบันทึกคืนเงินแล้ว — งวดกลับเป็นเงินค้าง",
        }[action] || "อัปเดตเรียบร้อยแล้ว",
      });
      return true;
    } catch (uploadError) {
      setError(uploadError.message || "อัปโหลดหลักฐานไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  }

  /* ── ปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377 · มติ D1) — คำสั่งของทั้งใบ (ไม่มี installmentId) ──────────────────
     ⭐ แผงประกอบ body ครบแล้ว (แถวเปิดเป็นบาท + expected ของแถวที่ตาเห็นตอนเปิดตัวแก้ + เหตุผล) — ที่นี่แค่ยิงแล้วบอกผล
     ⭐ 409 (มีคนแก้งวดจากอีกหน้าต่าง) = ดึงใบสด ⇒ แผงเห็นว่า base เก่าแล้วขึ้นปุ่ม "เริ่มใหม่จากงวดล่าสุด"
     ⚠️ ไม่ลองซ้ำเอง (apiFetch ไม่ retry PATCH) — ยิงซ้ำหลังเขียนสำเร็จแล้วจะได้ 409 ที่ทำให้คนเข้าใจผิดว่าไม่สำเร็จ */
  async function runInstallmentReplan({ rows, expected, reason }) {
    setBusy("installment-replan");
    setError("");
    setToast(null);
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${id}/installments`, {
        method: "PATCH",
        json: { action: "replan", rows, expected, reason },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) refreshOrder();
        setError(data.error || "ปรับแผนงวดไม่สำเร็จ");
        return false;
      }
      setOrder((current) => ({ ...current, installments: data.installments || [] }));
      setToast({ kind: "success", msg: REPLAN_DONE_MESSAGE });
      return true;
    } catch (replanError) {
      setError(replanError.message || "ปรับแผนงวดไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  }

  /* ── ยกเงินจากใบที่ยกเลิก (PR3 · mig 0378 · มติ D4) — คำสั่งของทั้งใบ (ใบนี้ = ใบปลายทาง · ไม่มี installmentId) ──────────
     ⭐ แผงประกอบ body ครบแล้ว (ใบต้นทาง + งวดที่เลือก + expected ของแถวที่ตาเห็นตอนเปิดโมดัล + เหตุผล) — ที่นี่แค่ยิงแล้วบอกผล
     ⭐ 409 (มีคนแก้งวด/ยกไปก่อนจากอีกหน้าต่าง) = ดึงใบสด ⇒ แผงเห็นว่า base เก่าแล้วบอกให้เปิดโมดัลใหม่
     ⚠️ ไม่ลองซ้ำเอง (apiFetch ไม่ retry PATCH) — ยิงซ้ำหลังเขียนสำเร็จแล้วจะได้ 409 ที่ทำให้คนเข้าใจผิดว่าไม่สำเร็จ */
  async function runInstallmentCarry({ sourceOrderId, installmentIds, expected, reason }) {
    setBusy("installment-carry");
    setError("");
    setToast(null);
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${id}/installments`, {
        method: "PATCH",
        json: { action: "carry", sourceOrderId, installmentIds, expected, reason },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) refreshOrder();
        setError(data.error || "ยกเงินจากใบที่ยกเลิกไม่สำเร็จ");
        return false;
      }
      /* ตัวใบต้องสดด้วย — ต้นทางที่ยกหมดแล้วต้องหายจากปุ่ม (`carrySources` มากับ GET ของใบ) */
      await refreshOrder();
      setToast({ kind: "success", msg: CARRY_DONE_MESSAGE });
      return true;
    } catch (carryError) {
      setError(carryError.message || "ยกเงินจากใบที่ยกเลิกไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  }

  function leaveEditMode() {
    setForm({ referenceDoc: order.referenceDoc || "", notes: order.notes || "", deliveryDueDate: order.deliveryDueDate || "" });
    setConfirmation(confirmationDraft(order));
    setConfirmFiles([]);
    setDirty(false);
    setSaveState("idle");
    setEditMode(false);
  }

  async function review(action) {
    if (action === "approve") {
      /* ⚠️ การกดครั้งนี้ทำ 4 อย่างพร้อมกัน ไม่ใช่แค่ปั๊มสถานะ — เดิมโมดัลบอกแต่ยอด Actual
         ทั้งที่ตอนเพิ่ม mig 0245/0250 มันเริ่มสร้างงวดชำระและส่งใบเข้าคิวบัญชีไปด้วย
         ⭐ ข้อแรกบอกทางของเงิน (มติผู้ใช้ 2026-09-11 · mig 0353): ยอดย้ายออกจาก "รออนุมัติ"
         เข้า Actual ของ **เดือนที่กด** — Actual ลงเดือนของ approvedAt เวลาไทย
         (`currentMonth()` เวลาไทย · ห้าม businessMonthKey ที่คืน YYMM ของเลขเอกสาร) */
      // เปิดโมดัลที่โชว์ error ของหน้า ⇒ ล้างของรอบก่อนทิ้ง
      setError("");
      setConfirmState({
        ...approvalPrompt({
          title: "อนุมัติ ใบสั่งขาย",
          subject: `ใบสั่งขาย ${order.orderNumber}`,
          effects: [
            `ยอด ${fmtMoney(order.actualAmount)} ย้ายจาก "${PENDING_APPROVAL_LABEL}" เข้าเป็น Actual ของเดือน ${formatMonthLabel(currentMonth())} (เดือนที่อนุมัติ) — ขึ้นบนดีลทันที`,
            /* งวด + ขั้นบัญชี (PR1 · mig 0376): ใบ Rev. ที่ยกงวดมา = ใช้งวดเดิม ไม่สร้างจาก QT (freeze ไม่แตะแถวที่ตรึงแล้ว)
               · เก็บครบแล้ว = เข้าคิวปิดใบของบัญชีทันที (financeStatus ของใบ Rev. เกิดเป็น NULL → pending · มติ D2) */
            /* PR3 (มติ D4): ดีลนี้มีเงินค้างจากใบที่ยกเลิก = เตือนให้ยกเข้าหลังอนุมัติ (RPC 0378 รับเฉพาะใบ approved) */
            ...salesOrderMoneyOutcome(order, installments, "approve", { strandedSources: order.carrySources }),
            "ตรึงลายเซ็นและสำเนาเอกสารฉบับที่อนุมัติ",
          ],
          confirmLabel: "อนุมัติและนับ Actual",
        }),
        /* 🐞 เหตุที่ RPC ตีกลับการอนุมัติต้องอ่านได้ในโมดัล — แถบของหน้าอยู่ใต้โมดัล · ด่านของ
           `approve` อ่านแถวสดทุกครั้ง (`expectedUpdatedAt` · ใบขยับไปแล้ว · ลายเซ็นไม่พร้อม)
           ⇒ ข้อความ "ใบนี้อนุมัติแล้ว" ต้องขึ้นตรงที่ผู้อนุมัติเพิ่งกด ไม่ใช่หลังปิดโมดัล */
        showsError: true,
        action: () => requestAction("approve"),
      });
      return;
    }
    // เหตุที่ API ตีกลับจะไปโผล่ใน `submitError` ของโมดัล (แถบของหน้าอยู่ใต้โมดัล) — ล้างของรอบก่อนตอนเปิด
    setError("");
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
    // ⚠️ ขั้นบัญชีไม่ได้ผ่าน RPC และกันแท็บค้างด้วย `.eq('financeStatus', …)` แทน
    // ⇒ ไม่ต้องส่ง expectedUpdatedAt (ส่งไปก็ไม่มีใครอ่าน แต่ไม่ส่งชัดเจนกว่า)
    const result = action.startsWith("finance_")
      ? await requestAction(action, { reason })
      : await requestAction(action, { reason, expectedUpdatedAt: order?.updatedAt });
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
  /* ⭐ เอกสาร FM-SA-04 ของใบนี้ (mig 0370) — ยกเลิก/ออก Rev. ของ SO ลากเอกสารไปด้วย (hook ใน API:
     ยกเลิก = void ทุกใบ เลขที่ไม่คืน · ออก Rev. = ย้ายไปใบใหม่ ฉบับที่อนุมัติแล้วต้องเดินด่านใหม่)
     ⇒ โมดัลยืนยันทั้งสองต้องบอกผลนี้ (กฎ approval-confirm-modals) · นับจากเส้นเดียวกับการ์ดเอกสารต่อเนื่อง
     ⚠️ อ่านตอนเปิดโมดัล ไม่ใช่ตอนโหลดหน้า — ตัวเลขต้องสดตอนคนกำลังจะกด ไม่ใช่ตอนเปิดหน้าไว้เมื่อชั่วโมงก่อน
     ⚠️ อ่านไม่ขึ้น = `null` ⇒ ข้อความแบบ "ถ้ามี" (salesOrderSpecDocEffect) ดีกว่าเงียบ */
  const [cancelSpecDocCount, setCancelSpecDocCount] = useState(null);
  const loadSpecDocCount = async () => {
    if (isHistoricalOrder(order)) return 0; // ใบย้อนหลังออกใบสเปคไม่ได้ (เส้นนั้นตอบ 400)
    try {
      return liveSpecDocumentCount(await apiJson(`/api/sales-planning/sales-orders/${id}/spec-documents`));
    } catch {
      return null;
    }
  };
  /* 🐞 แถบ error ของหน้าอยู่บนสุดของคอลัมน์ ⇒ **โมดัลบังไว้หมด** (บทเรียนเดิมของแผงงวดชำระ 2026-08-27)
     ⇒ โมดัลนี้โชว์ error ของคำขอเอง (ข้างล่าง) · เปิด/ปิดโมดัลล้างของรอบก่อนทิ้ง ไม่งั้นข้อความเก่า
     ทักคนที่เพิ่งกดเปิด ทั้งที่ยังไม่ได้กดยืนยันอะไรเลย */
  const openCancel = () => {
    setError("");
    setCancelForm({ code: "", note: "", reverseTo: "", lostReason: "" });
    setCancelSpecDocCount(null);
    loadSpecDocCount().then(setCancelSpecDocCount);
  };
  const closeCancel = () => {
    setCancelForm(null);
    setError("");
  };
  const cancelSpecDocEffect = salesOrderSpecDocEffect("cancel", cancelSpecDocCount);
  /* ผลต่อเอกสารแทนสัญญาเมื่อยกเลิก/ลบใบย้อนหลัง — ใบปกติคืน null (การ์ดหายเอง) */
  const cancelContractEffect = historicalCancelEffect(order, order?.serviceContract);
  // ใบสั่งขายย้อนหลัง (mig 0360) ยกเลิกได้อย่างเดียว — ไม่เสนอย้อน Won (API ปฏิเสธซ้ำ)
  const showReversal = !!cancelForm && order?.status === "approved" && !isHistoricalOrder(order) && isCustomerCancelReason(cancelForm.code);
  async function doCancel() {
    if (!cancelForm?.code) { setError("กรุณาเลือกเหตุผลที่ยกเลิก"); return; }
    if (cancelForm.code === "other" && !cancelForm.note.trim()) { setError('เลือก "อื่น ๆ" ต้องระบุหมายเหตุ'); return; }
    /* ใบย้อนหลังที่งวดยกมารับรองแล้ว: หมายเหตุบังคับ ≥ 10 ตัวอักษร (บัญชีเห็นในประวัติ · มติ 24/09) — ตัวเดียวกับ route
       ⚠️ คำใบ้ก่อนส่ง ไม่ใช่ตัวตัดสิน — งวดของจออาจเก่า · route อ่านงวดสดแล้วถามซ้ำ (400 ขึ้นในโมดัล) */
    const noteError = historicalCancelNoteError(order, order?.installments, cancelForm.note);
    if (noteError) { setError(noteError); return; }
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
    const res = await apiFetch(url, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); setError(data.error || "ลบใบสั่งขายไม่สำเร็จ"); return false; }
    // ลบแล้วแต่ของที่ตามหลังไม่ครบ (ปลดรอบบริการ · ยกเลิกเอกสาร FM-SA-04) — ทักกลางของแอปอยู่รอดข้ามหน้า
    const warning = responseWarningText(data);
    if (warning) notifyToast.warning(warning, RESPONSE_WARNING_TOAST);
    router.push("/sa/sales-orders");
    return true;
  }

  function remove() {
    setError("");
    setConfirmState({
      title: "ลบใบสั่งขายฉบับร่าง",
      description: `ต้องการลบ ${order.orderNumber} ถาวรหรือไม่`,
      // ใบย้อนหลัง: ฐานยกเลิกเอกสารแทนสัญญาตามใบในทรานแซกชันเดียวกัน (trigger ของ 0374) — ต้องบอกก่อนกด
      detail: ["การลบไม่สามารถย้อนกลับได้", historicalCancelEffect(order, order?.serviceContract)].filter(Boolean).join(" · "),
      confirmLabel: "ลบฉบับร่าง",
      tone: "danger",
      /* 🐞 เหตุที่ API ปฏิเสธการลบต้องอ่านได้ในโมดัล — แถบ error ของหน้าอยู่ใต้โมดัล และด่านลบของ
         ใบย้อนหลัง (`historicalDeleteBlock`: เปิดโซนให้ TS แล้ว · งวดที่บัญชีคอนเฟิร์ม ฯลฯ) ตอบ 400 */
      showsError: true,
      action: () => deleteOrder(`/api/sales-planning/sales-orders/${id}`),
    });
  }

  // บังคับลบ (break-glass ผู้ดูแลระบบ, mig 0152): ใบที่มีหลักฐานลายเซ็น/ฉบับตรึงลบทางปกติไม่ได้
  // ขั้นตอน: ขอพรีวิวว่าจะทำลายอะไร → ให้ยืนยันโดยเห็นรายการจริง → ค่อยลบ
  async function forceRemove() {
    setBusy("delete");
    setError("");
    const preview = await apiFetch(`/api/sales-planning/sales-orders/${id}?dryRun=1`, { method: "DELETE" })
      .then((r) => r.json()).catch(() => null);
    setBusy("");
    if (!preview) { setError("ขอพรีวิวการลบไม่สำเร็จ"); return; }
    /* ด่านที่บังคับลบก็ข้ามไม่ได้ (สายโซ่ Rev. · งวดที่ย้ายไปจากใบนี้ · ใบยื่นภาษี) — บอกเหตุ ไม่เปิดโมดัลยืนยันที่ลบไม่ได้จริง (review UI-6) */
    if (preview.blocked) {
      setError(preview.notes?.[0] || "บังคับลบใบนี้ไม่ได้");
      return;
    }
    const lines = (preview.cascade || []).map((c) => `· ${c.label}: ${c.count}`).join("\n");
    const notes = (preview.notes || []).join("\n");
    // ใบย้อนหลัง: เอกสารแทนสัญญาถูกยกเลิกตามใบด้วย (trigger ของ 0374) — ไม่ได้อยู่ในรายการ cascade ของพรีวิว
    const contractEffect = historicalCancelEffect(order, order?.serviceContract);
    setConfirmState({
      title: "บังคับลบใบสั่งขายพร้อมหลักฐาน",
      description: `ต้องการบังคับลบ ${order.orderNumber} ถาวรหรือไม่`,
      detail: <span className="pre-line">สิ่งที่จะถูกทำลาย:{"\n"}{lines || "· (ไม่มีข้อมูลพ่วง)"}{contractEffect ? `\n· ${contractEffect}` : ""}{notes ? `\n\n${notes}` : ""}</span>,
      confirmLabel: "ยืนยันบังคับลบ",
      tone: "danger",
      // 🐞 เหมือนกับโมดัลลบฉบับร่าง — ลบไม่ผ่าน (FK โซน · ของพ่วงที่ปลดไม่ได้) ต้องอ่านได้ในโมดัล
      showsError: true,
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
        apiFetch(`/api/sales-planning/sales-orders/${id}`),
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

  // ของเข้าที่สั่งมาเพื่อผลิตใบนี้ (mig 0177) — สรุปเป็น "พร้อมผลิตหรือยัง"
  const deliveries = useMemo(() => order?.deliveries || [], [order?.deliveries]);
  const todayIso = businessDate();
  const readiness = useMemo(
    () => productionReadiness(deliveries, todayIso),
    [deliveries, todayIso],
  );

  // ── แผนผลิตของใบนี้ (P-3) ────────────────────────────────────────────
  // ⭐ คำถามที่ SA เปิดหน้านี้มาตอบลูกค้าทางโทรศัพท์คือ **"ผลิตวันไหน"**
  // ⚠️ อ่านอย่างเดียว — วางคิวจริงทำที่ระบบวางแผนผลิต ซึ่ง PC เป็นเจ้าของงาน
  //    (สองทางแก้ = สองชุดกฎที่เพี้ยนหากันเสมอ)
  const [production, setProduction] = useState({ jobs: [], lines: [] });
  useEffect(() => {
    if (!order?.id) return;
    apiFetch(`/api/production/jobs?salesOrderId=${order.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProduction({ jobs: d?.jobs || [], lines: d?.lines || [] }))
      .catch(() => {});
  }, [order?.id]);
  const plan = useMemo(
    () => salesOrderPlanSummary(production.jobs, production.lines),
    [production],
  );

  /* ── ฝั่งบริการของใบย้อนหลัง: ไซต์ไหนที่ฝ่าย TS ตั้งรอบแล้ว ───────────────────
     ⭐ รางก้าวกับการ์ด "โซนในใบนี้" ต้องตอบว่า "ตั้งรอบหรือยัง" แต่ GET ของใบ **ไม่ได้**
        โหลดรอบขายของโซน/รอบบริการมาด้วยโดยตั้งใจ (คิวรี 5 ตาราง · ใบส่วนใหญ่เป็นสายสินค้า)
        ⇒ ยิงเส้นสรุปงานบริการของใบเองเฉพาะ **ใบย้อนหลังที่อนุมัติแล้ว** — ก่อนอนุมัติยังไม่มี
        รอบขายของโซนสักแถว (RPC อนุมัติเป็นคนสร้าง) จึงไม่มีอะไรให้ถาม
     ⚠️ โหลดไม่ขึ้น = สถานะรายโซนบอกว่าตรวจไม่ขึ้น ไม่ใช่เดาว่า "ยังไม่ตั้งรอบ" */
  const historicalApproved = isHistoricalOrder(order) && order?.status === "approved";
  const [serviceProgress, setServiceProgress] = useState({ status: "idle", data: null });
  useEffect(() => {
    if (!order?.id || !historicalApproved) { setServiceProgress({ status: "idle", data: null }); return undefined; }
    let alive = true;
    setServiceProgress({ status: "loading", data: null });
    apiFetch(`/api/sales-planning/sales-orders/${order.id}/service`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (alive) setServiceProgress({ status: body ? "ready" : "error", data: body || null }); })
      .catch(() => { if (alive) setServiceProgress({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [order?.id, historicalApproved]);
  const historicalProgress = useMemo(
    () => (serviceProgress.status === "ready"
      ? historicalServiceProgress(serviceProgress.data, order?.id || null)
      : { terms: [], plans: [], plannedSiteIds: null }),
    [serviceProgress, order?.id],
  );

  // ── บรีฟกลิ่นของใบนี้ ────────────────────────────────────────────────
  // ⭐ งานเริ่มที่ SO ไม่ใช่ที่หน้าคำร้อง — คนที่เพิ่งอนุมัติใบเสร็จควรกดต่อได้เลย
  // ไม่ต้องจำเลขที่แล้วไปไล่หาใน dropdown ของหน้าเปิดคำร้อง
  //
  // ⚠️ **ด่านเดียวกับ server** (`scentDesignOrderError`) — ปุ่มกับ API จึงขัดกันไม่ได้
  // ⚠️ ไม่มี `order` = ยังโหลดไม่เสร็จ ไม่ใช่ "เปิดไม่ได้" — memo นี้อยู่เหนือ early
  //    return ตามกฎ hooks จึงต้องกันเองด้วย `order?.` ทุกจุด
  const scentBrief = useMemo(() => {
    if (!order) return null;
    const lines = order.lines || [];
    const blocked = scentDesignOrderError(order, lines, {
      usedByRequestNo: order.scentRequest?.docNo || (order.scentRequest ? order.scentRequest.id : null),
    });
    return {
      blocked,
      existing: order.scentRequest || null,
      // ⚠️ **การ์ดโชว์เมื่อมีบรรทัดออกแบบกลิ่น ไม่ใช่เมื่อนับจำนวนได้** — ใบที่มี
      // บรรทัดแต่ `qty` อ่านไม่ออก (ทศนิยม/ศูนย์) คือเคสที่ต้องบอกผู้ใช้มากที่สุด
      // ผูกการ์ดกับตัวนับแล้วใบนั้นจะเงียบหายไปทั้งที่เป็นใบที่ต้องแก้
      hasDesignLines: scentDesignLines(lines).length > 0,
      // จำนวนกลิ่นที่ใบนี้ขาย — โชว์ให้เห็นว่าบรีฟจะงอกกี่ก้อนก่อนกดเข้าไป
      count: scentCountForOrder(lines),
    };
  }, [order]);

  /* ── เส้นเดินงานของใบนี้ (มติผู้ใช้ 2026-08-13) ────────────────────────
     ⭐ **เส้นเดียว** แทนการ์ดเต็มหลายใบ — บรีฟกลิ่นจบก่อนถึงสั่งของ
     ของครบก่อนถึงผลิต ⇒ มันต่อกัน ไม่ได้เดินพร้อมกัน · วัดจากหน้าจริงก่อนรื้อ:
     สามการ์ดเดิมกิน ~600px เพื่อบอกสิ่งที่อ่านจบได้ในแถบเดียว
     ⚠️ ช่วงที่ไม่เกี่ยวกับใบนี้เลยต้อง **หายไปทั้งช่วง** ไม่ใช่ขึ้นว่า "ไม่มี"

     ⭐ **สรรพสามิตเข้ามาอยู่บนเส้นเดียวกันด้วย** (มติผู้ใช้ 2026-08-17) — เดิมเป็นการ์ด
     แยกล่างสุดของหน้า ทั้งที่ตอบคำถามเดียวกับเส้นนี้คือ "ใบนี้ติดอยู่ตรงไหน"
     และเรื่องทะเบียนถูกยุบเหลือตัวนับในบรรทัดเทาบรรทัดเดียวที่ไม่บอกว่า FG ตัวไหนค้าง */
  const exciseTrack = useMemo(() => ({
    ...filingState,
    onCreateFiling: createFiling,
    createLabel: busy === "filing" ? "กำลังสร้าง…" : "สร้างใบยื่นชำระ",
    createDisabled: busy === "filing" || !canCreateFiling,
    createDisabledReason: canCreateFiling ? null : "ต้องมีสิทธิ์งานขายจึงสร้างใบยื่นได้",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createFiling ประกาศเป็น function ธรรมดา อ้างอิงคงที่ต่อ render
  }), [filingState, busy, canCreateFiling]);

  const workTrack = useMemo(
    () => salesOrderWorkTrack({
      scent: scentBrief,
      readiness,
      plan,
      excise: exciseTrack,
      orderId: order?.id || id,
      projectId: order?.projectId || null,
      // ⭐ รูปของเส้นมาจากประเภทดีลแม่ — SCENT ไม่มีของเข้า/ผลิต · OTHER ยังไม่นิยามสาย
      dealType: order?.deal ? dealTypeOf(order.deal) : null,
      approved: order?.status === "approved",
    }),
    [scentBrief, readiness, plan, exciseTrack, order?.id, id, order?.projectId, order?.deal, order?.status],
  );

  const installments = useMemo(() => order?.installments || [], [order?.installments]);

  /* 🪤 **ส่วนลดท้ายใบมีที่แสดงสองที่บนหน้าเดียว** — การ์ดสรุปข้างและท้ายตารางรายการ
     ของเดิมเขียนแยกกันแล้วเพี้ยน: ข้างเป็น `฿1.00` ท้ายตารางเป็น `-฿1.00` และมีแต่
     ท้ายตารางที่ขึ้น N/A ตอนไม่มีส่วนลด ⇒ ตัวเลขเดียวกันอ่านได้สองความหมาย
     ⚠️ ส่วนลดคือยอด **หัก** เครื่องหมายลบจึงเป็นความหมาย ไม่ใช่การตกแต่ง
     ⇒ ประกอบที่นี่ที่เดียว แล้วสองที่ spread ไปใช้ ห้ามเขียนค่าเองซ้ำ */
  const discountRow = useMemo(() => ({
    id: "discount",
    label: "ส่วนลดท้ายใบ",
    value: Number(order?.discountAmount || 0) > 0 ? `-${fmtMoney(order.discountAmount)}` : NA,
  }), [order?.discountAmount]);
  /* ตัวเลข "เก็บเงินแล้ว x/y" ของภาพรวม/หัวแท็บ — กติกาเดียวกับแผงงวด (review UI-2/UI-3): งวดโมฆะของใบยกเลิกไม่ใช่งวดที่ต้องเก็บ
     · งวดที่คืนเงินแล้วไม่ใช่เงินที่เก็บได้ (paymentRollup) */
  const paymentSummary = useMemo(
    () => paymentRollup(installments.filter((row) => !installmentVoid(row, { status: order?.status })), todayIso),
    [installments, todayIso, order?.status],
  );

  /* ใบนี้มีรอบบริการไหม — เกณฑ์เดียวกับด่านเงิน (สาย SERVICE + บรรทัดหมวด 02-001)
     ⚠️ เดิมส่ง `{ project }` เข้า ctx ซึ่ง **ตัวรับไม่เคยอ่านคีย์นี้** (มันรับ `projectsById`)
       ⇒ เป็นอาร์กิวเมนต์ตายที่อ่านแล้วเข้าใจผิดว่าทำงาน · ตัวถอยของฟังก์ชันอ่าน
       `order.project` ให้อยู่แล้ว จึงตัดทิ้ง ไม่ใช่แก้ชื่อคีย์ */
  const hasServiceRounds = orderHasServiceRounds(order, order?.lines);
  /* ใบที่ยกเลิกแล้วเงินยกไป/คืนลูกค้าแล้ว = กู้คืนไม่ได้ (PR3 · mig 0378) — ตัวเดียวกับที่ route ใช้ปฏิเสธ (คำใบ้ของปุ่ม) */
  const restoreMoneyBlock = cancelledMoneyRestoreBlock(installments, order?.carriedAway);
  /* QT ต้องยัง Won (ตัวเดียวกับที่ route ใช้ · ใบพี่น้องของ QT เดียวกัน route อ่านสดเอง — หน้าไม่มีรายการนั้น) */
  const restoreBlock = restoreMoneyBlock || salesOrderRestoreBlock(order);
  /* 🔑 **เส้นบริการ — กว้างกว่า และตั้งใจให้กว้าง** (ดูเหตุผลเต็มที่ `orderOnServiceLine`)
     วัดจริง 08/09: ใบบนเส้นบริการ 30 ใบ แต่เข้าเกณฑ์แคบแค่ 8 ⇒ อีก 22 ใบเปิดแท็บสัญญา
     ไม่ได้เลย ทั้งที่เป็นงานบริการจริง และสัญญาคือด่านแรกของทั้งเส้น */
  const onServiceLine = orderOnServiceLine(order);
  // รวมรอบทั้งใบ — คำนวณจากบรรทัดที่มีอยู่แล้ว ไม่ยิง API (ตัวเลขรายบรรทัดอยู่ในตาราง
  // แต่ยอดรวมทั้งใบไม่เคยมีที่ไหนบอก)
  const roundsSold = serviceRoundsSold(order?.lines);

  /* ── แท็บของหน้าใบ (PR-F · มติผู้ใช้ 2026-08-31 "ทาง ก") ──────────────────
     ⭐ **ไม่มีแถบสถานะเส้นที่สอง** — แผนเดิมให้เพิ่มเส้น 4 ช่อง (ยืนยัน SO · สัญญา ·
     จ่ายถึง · งานบริการ) เหนือเส้นเดินงาน · ผู้ใช้เลือกทาง ก จากม็อกเทียบสามทรง:
     ป้ายบนหัวแท็บบอกสถานะครบอยู่แล้ว และกดครั้งเดียวเจอเหตุเต็มในแท็บนั้น
     ⇒ ไม่ต้องมีที่ที่สองมาเขียนเรื่องเดียวกันแล้วคอยดูแลให้ตรงกัน
     ⚠️ **เส้นเดินงานเดิมอยู่ครบ** (บรีฟกลิ่น/ขึ้นทะเบียน/ของเข้า/ผลิต/ยื่นภาษี) —
     ใบส่วนใหญ่ในระบบเป็นสายสินค้า ถอดเส้นนั้นคือเสียมากกว่าได้

     ⚠️ แท็บ "งานบริการ" ขึ้นเฉพาะใบที่มีรอบบริการ · แท็บ "สัญญา" ขึ้นทุกใบตั้งแต่ 25/09 (ดู `showDealContracts`) */
  /* ⚠️ **สองแท็บใช้คนละเกณฑ์โดยตั้งใจ** — "สัญญา" มีสัญญาทุกฉบับของดีล (ทุกสาย) + เป็นด่านแรกของเส้นบริการ
     ⇒ เปิดทุกใบ · ส่วน "งานบริการ" มีตารางกรอกจำนวนรอบที่ตีกลับ
     บรรทัดนอกหมวด 02-001 (`validateServiceRoundsPatch`) ⇒ เปิดกว้างจะได้แท็บที่เปิดได้
     แต่ไม่มีแถวให้กรอก */
  /* ⭐ แท็บ "เอกสาร" (มติเจ้าของ 25/09/2569) — ทุกใบมี · อยู่ถัดภาพรวม · ตัวเลขบนหัวแท็บ = ไฟล์ทุกบ้านของใบ
     ⇒ ตัวโหลดอยู่ที่หน้า ไม่ใช่ในแผง (หัวแท็บต้องรู้ก่อนเปิดแท็บ) · โหลดใหม่เมื่อสถานะ/เวลาแก้ของใบขยับ */
  const salesOrderDocs = useSalesOrderDocuments(
    order?.id,
    `${order?.status || ""}|${order?.updatedAt || ""}|${order?.serviceContractId || ""}|${installmentFilesKey(installments)}`,
  );
  /* ⭐ **แท็บ "สัญญา" ขึ้นทุกใบ** (มติเจ้าของ 25/09/2569 "เพิ่มสัญญาในหน้า SO" → เลือก "ทุกใบ") —
     ของเดิมขึ้นเฉพาะใบบนเส้นบริการ ⇒ สัญญาออกแบบกลิ่นบนดีลที่มี SO (8 ใบวันนั้น · 4 ใบเป็นสายสินค้า)
     เปิดดูจาก SO ไม่ได้เลย · ในแท็บ: การ์ดผูกสัญญาบริการ (เฉพาะเส้นบริการ) + การ์ดสัญญาทุกฉบับของดีล
     ⚠️ ใบย้อนหลังที่ไม่อยู่เส้นบริการไม่มีอะไรให้แสดง (ไม่มีการ์ดสัญญาของดีล — ดู `showDealContracts`) */
  const showDealContracts = !isHistoricalOrder(order);
  const tabKeys = ["overview", "documents", ...(onServiceLine || showDealContracts ? ["contract"] : []), "payment",
    ...(hasServiceRounds ? ["service"] : []), "history"];
  const urlTab = searchParams.get("tab");
  /* 🪤 `#payment` จากทะเบียนการชำระของฝ่ายบัญชี — ของเดิมเป็น anchor ไปการ์ดกลางหน้า
     พอการ์ดย้ายเข้าแท็บ ลิงก์เดิมจะพาไปหน้าที่ไม่มีการ์ดนั้นอยู่เลย ⇒ ต้องแปลเป็นแท็บ
     (ลิงก์ที่ส่งไปแล้วในอีเมล/แชตแก้ย้อนหลังไม่ได้) */
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    const asked = urlTab || (typeof window !== "undefined" && window.location.hash === "#payment" ? "payment" : null);
    if (asked && tabKeys.includes(asked)) setTab(asked);
    /* 🐞 **ต้องผูก `order?.id` ไว้ในรายการพึ่งพาด้วย** — เอฟเฟกต์รอบแรกเกิดตอนใบยัง
       โหลดไม่เสร็จ ซึ่งเป็นจังหวะที่ `window.location.hash` ยังอ่านไม่ได้จริง (วัดเอง
       บนพรีวิว: `?tab=payment` เข้าแท็บถูก แต่ `#payment` ไม่เข้า ทั้งที่ hash อยู่ครบ
       ตอนตรวจทีหลัง) ⇒ ถามซ้ำอีกครั้งเมื่อใบมาถึง
       ⚠️ ห้ามตัด `urlTab` ออก — ลิงก์ `?tab=` ต้องยังทำงานตอนสลับใบไปมาด้วย */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, hasServiceRounds, onServiceLine, order?.id]);
  // ใบเปลี่ยนสายกลางคัน (Rev./แก้บรรทัด) แล้วแท็บที่เลือกอยู่หายไป = จอว่างเปล่า
  const activeTab = tabKeys.includes(tab) ? tab : "overview";
  const selectTab = (next) => {
    setTab(next);
    /* เขียนลง URL ให้คิว FN/TS และกระดิ่งลิงก์ตรงแท็บได้ — replace ไม่ push
       (สลับแท็บไม่ใช่การเดินทาง ปุ่ม back ต้องกลับไปหน้าก่อนหน้า ไม่ใช่แท็บก่อนหน้า) */
    router.replace(next === "overview" ? `/sa/sales-orders/${order.id}` : `/sa/sales-orders/${order.id}?tab=${next}`, { scroll: false });
  };


  if (!order) {
    return <Workspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย" back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }} loading={!error}>{error && <div className="glass-panel" style={{ padding: 14, color: "var(--red)" }}>{error}</div>}</Workspace>;
  }

  const approved = order.status === "approved";
  /* ⭐ ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — เกือบทุกกิ่งของหน้านี้ถามตัวนี้ตัวเดียว */
  const historical = isHistoricalOrder(order);
  /* ⭐ ยอดของใบนี้อยู่กองไหน (มติผู้ใช้ 2026-09-11 · mig 0353) — ตัวตัดสินกลางตัวเดียวกับ
     ตาราง SO ทุกจอ: 'actual' | 'pending_approval' | 'excluded' */
  const amountKind = salesOrderAmountKind(order);
  /* 🐞 แถบเน้นท้ายตารางรายการเคยเขียน "Actual ก่อน VAT" สีเขียว **ทุกสถานะ** ขณะที่การ์ดสรุป
     ข้าง ๆ บอก "ยังไม่นับ" ⇒ ใบเดียวกันพูดสองเรื่อง · ป้ายและสีเดินตามกองของยอดแล้ว:
     อนุมัติ = เขียว Actual · รออนุมัติ = amber (ห้ามเขียว) · ที่เหลือ = ยอดของใบเฉย ๆ สีกลาง */
  const amountHighlight = {
    id: "actual",
    value: fmtMoney(order.actualAmount),
    ...(amountKind === "actual"
      ? { label: "Actual ก่อน VAT", tone: "success" }
      : amountKind === "pending_approval"
        ? { label: `${PENDING_APPROVAL_LABEL} (ก่อน VAT)`, tone: "warning" }
        : { label: "ยอดก่อน VAT", tone: "neutral" }),
  };
  /* ⭐ **สิทธิ์แก้ = cap ของคน × ขอบเขตของใบ** — `canEdit` ที่ server ส่งมาคิด
     `canEditSalesPlanning(user) && inSalesEditScope(user, deal)` ตัวเดียวกับที่ทุก action
     ใน PATCH ใช้ปฏิเสธ ⇒ ปุ่มกับหลังบ้านขัดกันไม่ได้ (แพตเทิร์นเดียวกับหน้าสัญญา)
     ⚠️ ยังคูณ cap ฝั่งจอด้วย — คนที่ถูกถอด cap ระหว่างเปิดหน้าค้างไว้ต้องไม่เห็นปุ่ม */
  const canEdit = !!order.canEdit && canEditCap;
  // แบ่งแยกหน้าที่: ผู้ตรวจสอบที่เป็นผู้สร้าง/ผู้ยื่น SO เอง อนุมัติ/ตีกลับใบนี้ไม่ได้
  const ownSalesOrder = isSalesOrderSelfApproval(order, order.meId);
  const canReviewThis = reviewer && !ownSalesOrder;
  const canAdminOverride = role === "admin" && ownSalesOrder && order.status === "pending_approval";
  /* ⚠️ **ใบย้อนหลังไม่มีโหมดแก้ในหน้านี้** — ทั้งใบ (สัญญา · โซน · งวด · หลักฐาน) แก้ที่ฟอร์มคีย์ใบ
     หน้าเต็มตัวเดียวกับตอนสร้าง (กฎ AGENTS.md "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง")
     ⇒ ปุ่มหลักของใบร่าง/ตีกลับคือลิงก์ไปฟอร์มนั้น ไม่ใช่ `setEditMode(true)` ที่แก้ได้แค่หมายเหตุ */
  const canEditDocument = canEdit && !historical && ["draft", "rejected"].includes(order.status);
  const canEditHistorical = canEdit && historical && HISTORICAL_EDITABLE_STATUSES.includes(order.status);
  /* ⭐ **ออกสัญญาจากใบนี้** — ปุ่มบนการ์ด "สัญญา" ในแท็บสัญญา (เดิมอยู่การ์ดจัดการ · ย้าย 25/09)
     ⚠️ **ไม่ตรวจชนิด/ความพร้อมที่นี่** — โมดัลถามด่านตัวเดียวกับ API แล้วบอกเหตุถ้าออกไม่ได้
        (ดีลไม่มีใบเสนอราคาที่อนุมัติ ฯลฯ) · ซ่อนเงียบ = คนถามว่าปุ่มอยู่ไหน
     ⚠️ **สัญญาที่เพิ่งสร้างผูกเข้าใบนี้ไม่ได้ทันที** — ร่างใหม่เป็น `draft` ส่วนการ์ดผูกรับเฉพาะ `signed`
        ⇒ เส้นทางจริงคือ ออกสัญญา → ออกเลข → ลงนาม → AE Sup รับรอง → กลับมาผูก (โมดัลพาไปหน้าสัญญาเอง)
     ⚠️ ใบย้อนหลังไม่มีปุ่มนี้ — ออกฉบับที่สองจากใบนี้ = ฉบับที่ผูกไม่ได้ (ด่าน serviceContractLinkError ปิดอยู่)
        · ใบยกเลิก/ถูกแทนด้วย Rev. ไม่มีปุ่ม · ระหว่างโหมดแก้ไม่มีปุ่ม (เงื่อนไขเดิมของปุ่มบนการ์ดจัดการ) */
  const canCreateContract = canEdit && !historical && !editMode && !["cancelled", "revised"].includes(order.status);
  // ยื่น = ลงนามช่อง "ฝ่ายขาย" ซึ่งเป็นของ AE เจ้าของดีล — AC สร้างใบแทนได้ แต่ต้องส่งต่อ
  // ให้เจ้าของดีลกดยื่นเอง (มติผู้ใช้ 2026-08-05) · server บังคับซ้ำที่ action submit
  const canSubmitThis = canSubmitSalesOrder({ id: order.meId, role }, order.deal);
  // ชื่อเจ้าของดีลที่ต้องเป็นคนกดยื่น — ใช้ตัวเดียวกับที่การ์ดดีลแสดง
  const dealOwnerName = livePersonName(directory, order.deal?.ownerId, order.deal?.ownerName);
  const editable = canEditDocument && editMode;
  // ดึงกลับ = ของผู้ยื่นเท่านั้น (มติ 2026-07-26) — เงื่อนไขเดียวกับด่านฝั่ง API
  const canWithdraw = canWithdrawSalesOrderSubmission(order, { userId: order.meId });
  // สองขั้น (mig 0166): ย้อนการอนุมัติ → สถานะกลางที่แก้ไม่ได้ → ออก Rev.
  const canRevoke = canRevokeSalesOrderApproval(order, { reviewer });
  /* ⭐ ออก Rev. = AE เจ้าของดีล + ผู้รีวิว (มติ 24/09) · คนอื่นที่แก้ใบนี้ได้ (เช่น AC ผู้สร้าง) เห็นปุ่มจาง
     พร้อมชื่อคนที่ต้องกด — แพตเทิร์นเดียวกับปุ่ม "ยื่นอนุมัติ" (ติดด่าน = โชว์แล้วบอกเหตุ)
     🐞 เดิมผู้รีวิวคนเดียวและไม่โชว์อะไรเลย ⇒ AE เปิดใบที่ถูกย้อนอนุมัติแล้วไม่มีทางไปต่อ (SO-26080138-0) */
  const canRevise = canEdit && canIssueSalesOrderRevision(order, { reviewer, userId: order.meId, deal: order.deal });
  const reviseBlocked = !canRevise && canEdit && !historical && order.status === "approval_revoked";
  /* ผู้รีวิวที่ไม่ใช่เจ้าของดีลกดเอง ⇒ ใบ Rev. มีเขาเป็นผู้สร้าง แล้วเขาอนุมัติใบนั้นเองไม่ได้ (แบ่งแยกหน้าที่ ·
     admin ข้ามได้ด้วย Admin Override) — บอกในโมดัลก่อนกด ไม่ใช่ไปเจอตอนจะอนุมัติ */
  const reviseMakesMeCreator = canRevise && role !== "admin" && order.meId !== order.deal?.ownerId;
  /* ใบสั่งขายย้อนหลัง (mig 0374) พูดคนละเรื่องกับใบปกติทุกสถานะ — ของใบปกติบอกผลต่อ Actual ทุกบรรทัด
     ⇒ ป้าย/คำอธิบายมาจาก `historicalStatusCopy` ที่เดียว (พร้อมเทสต์ว่าไม่มีประโยคไหนบอกว่า "นับ Actual") */
  const historicalCopy = historical ? historicalStatusCopy(order.status) : null;
  const status = historicalCopy
    ? {
      label: historicalCopy.label,
      color: HISTORICAL_TONE_COLOR[historicalCopy.tone] || "var(--text-3)",
      description: historicalCopy.description,
    }
    : STATUS[order.status] || { label: order.status, color: "var(--text-3)", description: "" };
  const workflowIndex = order.status === "approved" ? 3
    : ["pending_approval", "approval_revoked"].includes(order.status) ? 1 : 0;
  const workflow = [
    { label: "จัดทำร่าง", hint: order.createdByName || "ผู้จัดทำ" },
    { label: "ยื่นอนุมัติ", hint: order.submittedAt ? fmtDate(order.submittedAt) : "รอผู้จัดทำ" },
    { label: "AE Supervisor ตรวจ", hint: order.status === "rejected" ? "ตีกลับแล้ว" : order.approvedByName ? `${order.approvedByName}${order.approvalMode === "admin_override" ? " · Admin Override" : ""}` : "รอตรวจ" },
    {
      label: "นับ Actual",
      // เดินตามกองของยอด ไม่ใช่สถานะเปล่า ๆ — ใบย้อนหลังอนุมัติแล้วแต่ "ยังไม่นับ" (mig 0360)
      hint: amountKind === "actual" ? fmtMoney(order.actualAmount)
        : amountKind === "pending_approval" ? `${PENDING_APPROVAL_LABEL} ${fmtMoney(order.actualAmount)}`
          : "ยังไม่นับ",
    },
  ];
  /* ⭐ ขั้นบัญชีตรวจใบ (mig 0250) — ต่อท้ายรางก้าว **หลัง "นับ Actual"** โดยตั้งใจ
     เพราะ Actual เข้าไปแล้วตั้งแต่ AE Supervisor กด บัญชีไม่ได้กั้นยอด (มติ 2026-08-13)
     ⚠️ ใบเก่าที่อนุมัติก่อนมี mig 0250 ไม่มีธง ⇒ ขั้นนี้ไม่โผล่เลย ไม่ใช่ขึ้นว่า "รอ" */
  const financeStatus = financeStatusOf(order);
  const financeStep = financeWorkflowStep(order);
  if (financeStep) workflow.push({ label: financeStep.label, hint: financeStep.hint });
  /* หมุด: ✓ = เรียบร้อย · ตัวเลข = อยู่ขั้นนั้นรอดำเนินการ — ตรรกะอยู่ในลิบพร้อมเทสต์ */
  const workflowIndexResolved = salesOrderWorkflowIndex(order, {
    baseIndex: workflowIndex,
    stepCount: workflow.length,
  });
  /* ⭐ รางก้าวของใบย้อนหลังเป็นคนละเส้น 5 ขั้น (คีย์ใบ → AE Sup อนุมัติ → บัญชีรับรองงวดยกมา →
     TS ตั้งรอบ → เข้าบริการ · ไม่มีขั้น "นับ Actual" และไม่มีขั้นบัญชีปิดใบ) ⇒ สลับทั้งเส้น ณ จุดเดียว
     ⚠️ ของใบปกติข้างบนยังคำนวณเหมือนเดิมทุกบรรทัด — ไม่แตะ */
  const historicalRail = historical
    ? historicalWorkflowSteps(order, installments, historicalProgress.terms, historicalProgress.plans, todayIso)
    : null;
  const workflowSteps = historicalRail
    ? workflowStepsFromIndex(historicalRail.steps, historicalRail.index, order.status === "cancelled")
    : workflowStepsFromIndex(workflow, workflowIndexResolved, order.status === "cancelled");
  /* ช่วงบริการของใบย้อนหลัง = ช่วงของ **เอกสารแทนสัญญา** (ใบนี้ไม่มีสัญญาฉบับอื่น) — ไม่มีช่วง = ไม่มีแถบ */
  const historicalCoverage = historical
    ? historicalCoverageSegments(installments, {
      start: order.serviceContract?.effectiveDate || order.serviceContract?.contractDate,
      end: order.serviceContract?.expiryDate,
    })
    : null;
  // เอกสารยืนยันที่ใบนี้มีจริง (ของใบเอง ถ้าไม่มีถอยไปดูหลักฐาน Won ของใบเสนอราคา)
  const confirmationOnFile = orderConfirmationOf(order, order.quotation);
  /* 🐞 ปุ่มเปิดไฟล์ต้องเลือก proxy ตาม **บ้านที่ไฟล์อยู่จริง** ไม่ใช่ยิง confirm-file ตายตัว —
     ใบเก่ายังไม่ได้บันทึกทับ ไฟล์ยังอยู่ที่ใบเสนอราคา ⇒ confirm-file อ่าน
     `order.confirmAttachments` ที่ว่างแล้วตอบ "ไม่พบไฟล์แนบ" · แผงงวดชำระเลือกถูกอยู่แล้ว
     (SalesOrderPaymentPanel) แต่หน้านี้เขียนไว้อีกชุด — ยกมาเป็นตัวเดียว */
  // ⚠️ ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคา — ห้ามถอยไป /quotations/null/file
  const confirmFileHref = (index) => (confirmationOnFile?.source === "order" || !order.quotationId
    ? `/api/sales-planning/sales-orders/${order.id}/confirm-file?i=${index}`
    : `/api/sales-planning/quotations/${order.quotationId}/file?i=${index}`);
  /* ⚠️ ใบย้อนหลังไม่มีขั้น "ยืนยันคำสั่งซื้อ" — เอกสารแทนสัญญาที่คีย์ในฟอร์มทำหน้าที่นั้นแทน
     (ปล่อยด่านเดิมไว้ = ใบร่างทุกใบติด "ยังไม่มีเอกสารยืนยัน" ที่ไม่มีที่ให้แนบบนหน้านี้) */
  const confirmationGate = !historical && ["draft", "rejected"].includes(order.status)
    ? salesOrderConfirmationGate(order, order.quotation)
    : null;
  /* ⚠️ ต้องส่ง `installments` เข้าด่านเสมอ (มติ 2026-08-30) — ด่านปิดใบตัดสินจาก
     "เก็บครบทุกงวดหรือยัง" ไม่ส่ง = ด่านปฏิเสธ ⇒ ปุ่มบนจอกับ API พูดตรงกันเสมอ */

  const setServiceContract = async (contractId) => {
    await requestAction("set_service_contract", { contractId: contractId || null });
  };

  /* จำนวนรอบบริการรายบรรทัด (mig 0326) — ด่านอยู่ที่ serviceRoundsEditError ฝั่ง API
     ⚠️ requestAction โหลดใบใหม่ให้เองเมื่อสำเร็จ ⇒ ค่าบนการ์ดกลับมาจากบรรทัดจริงเสมอ */
  const setServiceRounds = async (map) => {
    await requestAction("set_service_rounds", { serviceRounds: map });
  };

  const financeGate = (action, options) => financeActionError(
    order, action, { id: order.meId, role, department: order.meDepartment },
    { ...options, installments },
  );

  /* ── AE Sup อนุมัติใบย้อนหลัง — **โมดัลเดียว** ทั้งผู้ตรวจปกติและ Admin Override ────────────────
     ⭐ ไฟล์ที่ AE Sup เห็นในโมดัลคือไฟล์ที่จะกลายเป็น `signedFileId` ของเอกสารแทนสัญญาจริง ๆ (D4)
        ⇒ ส่ง id ของไฟล์นั้นไปกับคำขอ ไม่ปล่อยให้ฐานหยิบ "ไฟล์แรกที่หาเจอ" เอง
     ⚠️ **ไม่ใช่โมดัลมือของใบ pipeline** (`overrideForm` ข้างล่าง) — ตัวนั้นพูดแต่ยอด Actual ซึ่งใบนี้ไม่มี
        และไม่ส่ง `expectedUpdatedAt` · ทั้งสองทางที่นี่ส่งเวอร์ชันของใบที่จอเห็นเสมอ
     ⚠️ ของเสริมโหลดไม่ขึ้น (`extrasError`) ไม่ซ่อนแถว — `historicalApprovalFacts` เขียน "โหลดไม่ขึ้น" ให้ */
  const contractFiles = order.serviceContractFiles || [];
  const signedFileCandidate = contractFiles.find((file) => file.signedFileCandidate) || null;
  const historicalApproveBlocked = signedFileCandidate
    ? null
    : "ยังไม่เห็นไฟล์เอกสารแทนสัญญาของใบนี้ — อนุมัติไม่ได้จนกว่าไฟล์จะขึ้น";
  const openHistoricalApprove = (override = false) => {
    /* ⚠️ เปิดโมดัลไหนที่โชว์ error ของหน้า (`showsError`) ก็ต้องล้างของรอบก่อนทิ้ง — ไม่งั้นข้อความค้าง
       จากคำขออื่น (แผงงวดชำระ · set_service_contract ที่ได้ 409) จะไปโผล่ในกล่องอนุมัติ
       อ่านเหมือนว่า "การอนุมัติครั้งนี้" ล้มเหลวทั้งที่ยังไม่ได้กดด้วยซ้ำ */
    setError("");
    setOverrideReason("");
    overrideReasonRef.current = "";
    const facts = historicalApprovalFacts(order, {
      installments,
      contract: order.serviceContract,
      contractFiles,
      lineZones: order.lineZones,
      liveTermWarnings: order.liveTermWarnings,
      signedFile: signedFileCandidate,
      extrasError: order.extrasError,
      duplicateCheck: order.duplicateCheck || null,
    });
    /* ใบที่อาจซ้ำ (ที่ผู้คีย์ยืนยัน + ที่พบเพิ่มตอนเปิดใบ) — ลิงก์เปิดแท็บใหม่ให้ผู้อนุมัติเทียบก่อนกด (มติ 26/09) */
    const duplicateRows = historicalDuplicateReviewView(historicalDuplicateReviewOf(order), order.duplicateCheck || null).rows;
    setConfirmState({
      ...historicalApprovalPrompt({ ...facts, override: override ? { note: historicalOverrideNote } : null }),
      /* ลิงก์ ไม่ใช่พรีวิวฝัง — ผู้อนุมัติเปิดไฟล์จริงได้จากในโมดัล ไม่ต้องปิดโมดัลไปตามเอง */
      children: (
        <div className="form-field">
          <span className="form-field-label">เปิดดูก่อนกดอนุมัติ</span>
          {signedFileCandidate ? (
            <a className="linklike" href={`/api/master/attachments/${signedFileCandidate.id}/file`} target="_blank" rel="noopener noreferrer">
              เอกสารแทนสัญญา · {signedFileCandidate.fileName || "ไฟล์ไม่มีชื่อ"}
            </a>
          ) : (
            <span className="readable-field-empty">ยังไม่มีไฟล์เอกสารแทนสัญญาให้เปิด</span>
          )}
          {(order.openingEvidence || []).map((ref) => (
            <a
              key={`${ref.installmentId}-${ref.index}`}
              className="linklike"
              href={`/api/sales-planning/sales-orders/${order.id}/payment-file?installment=${encodeURIComponent(ref.installmentId)}&i=${ref.index}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              หลักฐาน{OPENING_INSTALLMENT_LABEL} · {ref.fileName || "ไฟล์ไม่มีชื่อ"}
            </a>
          ))}
          {duplicateRows.map((row) => (
            <a key={`dup-${row.id}`} className="linklike" href={`/sa/sales-orders/${encodeURIComponent(row.id)}`} target="_blank" rel="noopener noreferrer">
              ใบที่อาจซ้ำ{row.isNew ? " (พบเพิ่ม)" : ""} · {row.orderNumber || row.id}
            </a>
          ))}
        </div>
      ),
      overrideReason: override,
      /* 🐞 แถบ error ของหน้าอยู่บนสุดของคอลัมน์ ⇒ **โมดัลบังไว้หมด** (บทเรียนเดิมของแผงงวดชำระ
         2026-08-27) · เหตุที่ RPC ตีกลับใบย้อนหลังมีหลายข้อจริง ๆ (ใบขยับไปแล้ว · ไฟล์ไม่ตรง ·
         ยอด/ช่วงครอบไม่ผ่าน) ⇒ ต้องอ่านได้ในโมดัลที่ยังเปิดค้างอยู่ ไม่ใช่หลังปิดโมดัล */
      showsError: true,
      action: () => requestAction("approve", {
        expectedUpdatedAt: order.updatedAt,
        signedFileId: signedFileCandidate?.id,
        ...(override ? { overrideReason: overrideReasonRef.current } : {}),
      }),
    });
  };

  const primaryAction = editable
    ? {
        id: "save",
        kind: "save",
        label: busy === "save" ? "กำลังบันทึก…" : "บันทึกร่าง",
        disabled: !dirty,
        disabledReason: !dirty ? "ยังไม่มีข้อมูลที่เปลี่ยนแปลง" : undefined,
        onClick: save,
      }
    /* ใบย้อนหลังร่าง/ตีกลับ — กลับเข้าฟอร์มคีย์ใบหน้าเต็ม (ฟอร์มแก้ = ฟอร์มสร้าง) แล้วกด
       "บันทึกและส่งอนุมัติ" ที่นั่น ⇒ ไม่มีปุ่ม "ยื่นอนุมัติ" แยกบนหน้านี้ */
    : canEditHistorical
      ? {
          id: "historical-edit",
          kind: "edit",
          label: "แก้ไขและส่งอนุมัติ",
          href: historicalEditPath(order.id),
        }
    : canEditDocument
      ? {
          id: "submit",
          kind: "submit",
          label: "ยื่นอนุมัติ",
          disabled: !canSubmitThis || !!confirmationGate,
          /* ⭐ เอกสารยืนยันคำสั่งซื้อเป็นด่านของ "ยื่นอนุมัติ" ไม่ใช่ของการสร้างใบ
             (มติ 2026-08-24) — เหตุผลขึ้นติดปุ่มเป็นตัวหนังสือ ไม่ใช่ tooltip
             ⭐ **บอกชื่อเจ้าของดีลไปเลย** — AC สร้างใบแทนได้แต่ยื่นเองไม่ได้ (มติ
             2026-08-05) ⇒ คนที่เจอปุ่มจางคือคนที่ต้องไปตามอีกคน ถ้าไม่บอกว่าใคร
             เขาต้องเปิดการ์ดดีลไปหาเอง · ชื่อมาจาก directory สด (ชื่อในแถวเป็นสำเนา
             ที่ค้างได้เมื่อผู้ใช้เปลี่ยนชื่อ) แล้วถอยไปชื่อที่เก็บไว้ */
          disabledReason: !canSubmitThis
            ? (dealOwnerName
              ? `ยื่นได้เฉพาะ AE เจ้าของดีล — ส่งต่อให้ ${dealOwnerName} กดยื่น`
              : "ยื่นได้เฉพาะ AE เจ้าของดีล — ส่งต่อให้เจ้าของดีลกดยื่น")
            : (confirmationGate || undefined),
          onClick: openSubmitConfirm,
        }
    : historical && canReviewThis && order.status === "pending_approval"
      ? {
          id: "approve",
          kind: "approve",
          label: "อนุมัติใบย้อนหลัง",
          disabled: !!historicalApproveBlocked,
          disabledReason: historicalApproveBlocked || undefined,
          onClick: () => openHistoricalApprove(false),
        }
    : canReviewThis && order.status === "pending_approval"
      ? { id: "approve", kind: "approve", label: "อนุมัติและนับ Actual", onClick: () => review("approve") }
    // สถานะกลางหลังย้อนการอนุมัติ: ออก Rev. เป็นทางเดียวที่เดินต่อได้ จึงเป็นปุ่มหลัก
    : canRevise || reviseBlocked
      ? { id: "revise", kind: "revise", label: "ออก Rev.",
        disabled: reviseBlocked,
        disabledReason: reviseBlocked
          ? (dealOwnerName
            ? `ออก Rev. ได้เฉพาะ AE เจ้าของดีลหรือ AE Supervisor — ส่งต่อให้ ${dealOwnerName} กดออก Rev.`
            : "ออก Rev. ได้เฉพาะ AE เจ้าของดีลหรือ AE Supervisor — ส่งต่อให้เจ้าของดีลกดออก Rev.")
          : undefined,
        onClick: async () => {
        // เอกสาร FM-SA-04 ย้ายตามใบ Rev. ใหม่ (hook ใน API) — นับก่อนเปิดโมดัลให้บอกผลได้ครบ
        const specDocEffect = salesOrderSpecDocEffect("revise", await loadSpecDocCount());
        // เปิดโมดัลที่โชว์ error ของหน้า ⇒ ล้างของรอบก่อนทิ้ง
        setError("");
        setConfirmState({
          title: "ออก Rev. ใหม่",
          description: `ระบบจะสร้างร่าง Rev. ใหม่จาก ${order.orderNumber} และเก็บฉบับนี้เป็นประวัติ`,
          /* ⭐ ชี้ทางตั้งแต่ก่อนกด (มติผู้ใช้ 2026-08-18) — Rev. ของใบสั่งขาย **คัดลอก
             รายการมาทั้งดุ้น** (`revise_approved_sales_order_atomic` INSERT ... SELECT
             จากบรรทัดใบเดิม) และหน้า SO ไม่มีที่ให้แก้ `qty`/ราคาเลยสักจุด
             ⇒ คนที่กดเพราะคิดว่าจะแก้จำนวนได้ จะไปเจอใบใหม่ที่แก้อะไรไม่ได้
             ยอดต้องแก้ที่ต้นทางคือใบเสนอราคา (บรรทัด SO ผูก `quotationLineId` ไว้) */
          detail: [
            [
              "รายการและยอดจะถูกคัดลอกมาทั้งหมด — แก้จำนวน/ราคาในฉบับ Rev. ไม่ได้",
              "ถ้าต้องแก้ยอด ให้ออก Rev. ที่ใบเสนอราคาแล้วออกใบสั่งขายใหม่แทน",
              specDocEffect,
              order.revisionReason ? `เหตุผลที่บันทึกไว้ตอนย้อนการอนุมัติ: ${order.revisionReason}` : null,
            ].filter(Boolean).join(" · "),
            reviseMakesMeCreator
              ? `ใบ Rev. จะมีคุณเป็นผู้สร้าง — คุณอนุมัติใบนั้นเองไม่ได้ ต้องให้ AE Supervisor คนอื่นอนุมัติ · ถ้าจะอนุมัติเอง ให้ ${dealOwnerName || "AE เจ้าของดีล"} กดออก Rev. แทน`
              : null,
            /* ⭐ งวดชำระ **ย้ายไปใบ Rev. ทั้งชุด** (mig 0376) — บรรทัดของตัวเอง (detail เป็น pre-line) · ใบไม่มีงวด = ไม่พูด */
            ...salesOrderMoneyOutcome(order, installments, "revise"),
          ].filter(Boolean).join("\n"),
          confirmLabel: "สร้างร่าง Rev. ใหม่",
          /* 🐞 ออก Rev. ไม่ผ่านต้องอ่านได้ในโมดัล — ด่านกันแท็บค้าง (`expectedUpdatedAt`) ของ
             `revise_approved_sales_order_atomic` ตีกลับเมื่อมีคนออก Rev. ไปก่อน ⇒ ถ้าเงียบ
             คนกดจะกดซ้ำแล้วได้ข้อความเดิมจนต้อง F5 เอง */
          showsError: true,
          action: () => requestAction("revise", { expectedUpdatedAt: order?.updatedAt }),
        });
      } }
      : null;
  const secondaryActions = [
    { id: "edit", kind: "edit", icon: Pencil, label: "แก้ไขข้อมูล", variant: "outline", visible: canEditDocument && !editMode, onClick: () => setEditMode(true) },
    { id: "leave-edit", kind: "cancel", label: "ยกเลิกแก้ไข", variant: "ghost", visible: editable, onClick: leaveEditMode },
    // ⚠️ เปิดโมดัลไหนก็ล้าง error ของรอบก่อน — โมดัลโชว์เหตุที่ API ตีกลับเอง (แถบของหน้าอยู่ใต้โมดัล)
    { id: "withdraw", kind: "withdraw", variant: "outline", visible: canWithdraw, onClick: () => { setError(""); setWorkflowForm({ action: "withdraw", reason: "" }); } },
    // ขั้นที่ 1 — ยอด Actual หลุดที่ปุ่มนี้ จึงต้องกรอกเหตุผล (ใช้ต่อในขั้นออก Rev.)
    { id: "revoke", kind: "revoke", variant: "outline", visible: canRevoke, disabled: !!filingState.filing, disabledReason: filingState.filing ? "มีใบยื่นสรรพสามิตแล้ว ต้องจัดการใบยื่นก่อน" : undefined, onClick: () => { setError(""); setWorkflowForm({ action: "revoke", reason: "" }); } },
    /* ⚠️ ใบย้อนหลังใช้ **โมดัลเดียวกับผู้ตรวจปกติ** (historicalApprovalPrompt + บรรทัด override) —
       โมดัลมือของใบ pipeline ข้างล่างไม่บอกผลลัพธ์และไม่ส่งเวอร์ชันของใบ ⇒ ห้ามใช้กับใบนี้ */
    {
      id: "override", kind: "approve", label: "อนุมัติแบบ Admin Override", variant: "outline",
      visible: canAdminOverride,
      disabled: historical && !!historicalApproveBlocked,
      disabledReason: historical ? (historicalApproveBlocked || undefined) : undefined,
      onClick: () => (historical ? openHistoricalApprove(true) : setOverrideForm({ reason: "" })),
    },
    // label ชัดเจนว่าเป็นการกู้ SO ที่ "ยกเลิก" แล้ว — เดิมใช้ default "คืนเป็นฉบับร่าง"
    // ซึ่งความหมายชนกับ "ดึงกลับ" ที่เคยยืม kind:"restore" ตัวเดียวกัน (B8)
    // ใบสั่งขายย้อนหลังคืนเป็นร่างไม่ได้ (mig 0360 · API ปฏิเสธซ้ำ)
    /* ⛔ PR3 (mig 0378): เงินของใบยกไปใบใหม่/คืนลูกค้าแล้ว = กู้คืนไม่ได้ — ปุ่มโชว์แล้วบอกเหตุ (ตัวเดียวกับที่ API ปฏิเสธ)
       ⚠️ คำใบ้จากข้อมูลที่หน้าโหลดมา · route อ่านสดแบบโยน error อีกชั้น */
    { id: "restore", kind: "restore", label: "กู้คืนจากการยกเลิก", visible: order.status === "cancelled" && role === "admin" && !isHistoricalOrder(order),
      disabled: !!restoreBlock,
      disabledReason: restoreBlock || undefined,
      onClick: () => requestAction("restore") },
    { id: "print", kind: "print", label: "ออกเอกสาร", variant: "ghost", disabled: dirty, disabledReason: dirty ? "บันทึกข้อมูลล่าสุดก่อนออกเอกสาร" : undefined, onClick: printDocument },
    /* ── ขั้นบัญชีตรวจใบ (mig 0250) ────────────────────────────────────────
       ⚠️ **ไม่ใช่ปุ่มหลัก** — ปุ่มหลักของใบยังเป็นสายอนุมัติเอกสาร บัญชีเป็นคนละแกน
       ⚠️ ทั้งการโผล่และการกดได้ มาจากด่านตัวเดียวกับที่ API ใช้ปฏิเสธ ⇒ ขัดกันไม่ได้ */
    {
      id: "finance-approve", kind: "approve", label: "ปิดใบสั่งขาย", variant: "outline",
      /* ⭐ **โชว์เสมอกับคนที่เป็นเจ้าของขั้น** แล้วบอกเหตุตอนกด (กติกา GatedAction) —
         ถ้าเอาด่านเงินมาคุมการมองเห็นด้วย บัญชีจะเปิดใบที่ยังเก็บไม่ครบแล้วไม่เจอ
         อะไรเลย ไม่รู้ว่าต้องรออะไร · เจ้าของขั้น = ฝ่ายบัญชี + ใบผ่าน AE Sup + ยังไม่ปิด */
      visible: !financeStepOwnerError(order, { id: order.meId, role, department: order.meDepartment }),
      disabled: !!financeGate("finance_approve"),
      disabledReason: financeGate("finance_approve") || undefined,
      /* ⚠️ ขั้นบัญชีเป็นปลายทาง — อนุมัติแล้วบัญชีตีกลับเองไม่ได้ และ AE Sup ส่งตรวจใหม่
         ก็ไม่ได้ (ทั้งสองทาง API ตอบ "บัญชีอนุมัติใบนี้ไปแล้ว") ⇒ ต้องบอกว่าบัญชีย้อนเองไม่ได้
         ⭐ มติ D2 (23/09 · PR1): AE Sup **ย้อนการอนุมัติ/ออก Rev. ใบที่บัญชีปิดแล้วได้** — ใบ Rev. กลับเข้าคิวให้บัญชี
           ปิดใหม่ (ไม่สืบสถานะปิดจากใบเดิม) ⇒ คำเดิมที่สัญญาว่าใบจบถาวรเป็นเท็จ ต้องบอกทางนั้นแทน */
      onClick: () => {
        // เปิดโมดัลที่โชว์ error ของหน้า ⇒ ล้างของรอบก่อนทิ้ง
        setError("");
        setConfirmState({
          ...approvalPrompt({
            title: "ปิดใบสั่งขาย",
            subject: `ใบสั่งขาย ${order.orderNumber}`,
            irreversible: true,
            checklist: FINANCE_REVIEW_POINTS,
            effects: [
              "ลงลายเซ็นของคุณในช่อง “ฝ่ายบัญชี” บนเอกสาร แล้วออกเอกสารฉบับใหม่ทับ",
              "**ปิดใบสั่งขายใบนี้** — เป็นขั้นสุดท้ายของใบ · ถ้า AE Sup ย้อนการอนุมัติภายหลัง ใบ Rev. จะกลับเข้าคิวให้บัญชีปิดใหม่",
              "ยอด Actual ไม่เปลี่ยนจากการกดนี้ (ยอดเข้าตั้งแต่ AE Supervisor อนุมัติ)",
            ],
            confirmLabel: "ยืนยันปิดใบ",
          }),
          /* 🐞 เหตุที่ขั้นบัญชีตีกลับต้องอ่านได้ในโมดัล — ด่าน `finance_approve` อ่านงวดสดทุกครั้ง
             (ยังเก็บไม่ครบทุกงวด · AE Sup ยังไม่อนุมัติ · บัญชีปิดไปแล้ว) และปุ่มนี้ **โชว์เสมอกับ
             เจ้าของขั้น** ⇒ เหตุคือสิ่งเดียวที่บอกว่าต้องรออะไร · แถบของหน้าอยู่ใต้โมดัล */
          showsError: true,
          action: () => requestAction("finance_approve"),
        });
      },
    },
  ];
  /* ⛔ ด่านยกเลิกใบย้อนหลังที่งวดปกติรับเงินแล้ว/รอตรวจ — **ตัวเดียวกับที่ API ใช้ปฏิเสธ** (historicalCancelBlock)
     ⇒ ปุ่มกับ API ถามตัวเดียวกัน คนกดเห็นเหตุ (และขั้นของบัญชีครบ "ถอนคำรับรองแล้วตีกลับ" · review 25/09) ตั้งแต่ก่อนเปิดโมดัล
     ⚠️ ด่านความพร้อมของฐาน (0387 · historicalCancelSettleBlock) ถามที่ route เท่านั้น — จอไม่รู้ว่ารันมิกแล้วหรือยัง (503 ขึ้นในโมดัล)
     ⭐ มติ 24/09 (mig 0387): งวดยกมาไม่ปิดปุ่มแล้ว — เป็นโมฆะตามใบ (โมดัลบอกผลก่อนกด)
     ⚠️ ค่านี้เป็น **คำใบ้ ไม่ใช่ตัวตัดสิน** — `order.installments` มาจาก loadOrder ซึ่งกลืนการอ่านพังเป็น
        รายการว่าง (ด่านจริงที่ route อ่านงวดสดแบบโยน error) · จอที่เปิดค้างไว้ก็ยังได้ 400 ⇒ โมดัลยังต้อง
        โชว์ error ของคำขอเองอยู่ดี */
  const historicalCancelBlocked = historicalCancelBlock(order, installments);
  /* ⭐ โมดัลยกเลิกของใบย้อนหลัง (มติเจ้าของ 24/09 · mig 0387) — หัว · คำนำ · เงิน · ผลหลังยกเลิก · ป้ายหมายเหตุ · ปุ่ม
     มาจาก historicalCancelPrompt ตัวเดียว (ผู้จัดการฝ่ายขายยกเลิกได้แม้งวดยกมารับรองแล้ว — ต้องเห็นก่อนกดว่าอะไรหายไปพร้อมใบ)
     🐞 คำนำเดิมเป็นของใบปกติ ("ยอด Actual จะถูกนำออก") ซึ่งไม่จริงกับใบย้อนหลังทุกสถานะ · ใบ pipeline = null (โมดัลเดิมทุกตัวอักษร) */
  const historicalCancel = historical
    ? historicalCancelPrompt(order, { installments, reasonCode: cancelForm?.code })
    : null;
  /* ผลเรื่องเงินของการยกเลิก (PR3 · mig 0378) — StatusNotice ในโมดัลยกเลิก · ใบย้อนหลังพูดชุดของตัวเอง (งวดยกมาเป็นโมฆะ) */
  const cancelMoneyLines = historicalCancel
    ? historicalCancel.money
    : salesOrderMoneyOutcome(order, installments, "cancel");
  const dangerActions = [
    { id: "reject", kind: "reject", label: "ตีกลับให้แก้ไข", visible: canReviewThis && order.status === "pending_approval", onClick: () => review("reject") },
    { id: "delete", kind: "delete", icon: Trash2, label: "ลบฉบับร่างถาวร", visible: role === "admin" && canHardDeleteSalesOrder(order), onClick: remove },
    { id: "force-delete", kind: "delete", icon: ShieldAlert, label: "บังคับลบพร้อมหลักฐาน", visible: role === "admin" && !canHardDeleteSalesOrder(order), onClick: forceRemove },
    {
      id: "cancel",
      kind: "cancel",
      label: "ยกเลิก SO",
      // ปุ่มพูดเรื่องเดียวกับ API แล้ว (มติผู้ใช้ 2026-08-18) — เดิม `approved && reviewer`
      // ทำให้ใบที่ถอนอนุมัติแล้ว/ใบร่าง/ใบตีกลับ ไม่มีทางยกเลิกจากหน้าจอเลย
      /* ใบที่ถือเงิน (งวดรับรองแล้ว/รอตรวจ) ยกเลิกได้เฉพาะผู้ตรวจสอบ ทุกสถานะ — ตัวเดียวกับ route (review MONEY-2) */
      visible: canCancelSalesOrder(order, { reviewer, canEdit, installments }),
      disabled: !!filingState.filing || !!historicalCancelBlocked,
      disabledReason: filingState.filing
        ? "มีใบยื่นสรรพสามิตแล้ว ต้องจัดการใบยื่นก่อน"
        : (historicalCancelBlocked || undefined),
      onClick: openCancel,
    },
  ];

  return (
    <Workspace hideHeader back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }}>
      <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="SALES ORDER · COMMERCIAL APPROVAL"
          title={order.orderNumber}
          /* รหัส AR นำหน้าชื่อลูกค้า (มติผู้ใช้ 2026-08-21) — API แนบ `customer` ที่อ่านสด
             จากทะเบียนมาให้ ไม่ใช่ค่าที่ประทับไว้ในใบ */
          description={`${customerHeadline(order.customerName, order.customer?.arCode) || "ไม่ระบุลูกค้า"} · ${order.deal?.title || "ไม่ระบุดีล"}`}
          /* ⭐ ป้าย "ย้อนหลัง" + "ไม่นับ Actual" บนหัวใบ (ม็อก SoStatus) — โทน info ตัวเดียวกับชิปในทะเบียน
             และคิวงานเข้าใหม่ของ TS · คนที่เปิดใบมาต้องรู้ตั้งแต่บรรทัดแรกว่ายอดนี้ไม่เข้า Actual/FC/เป้า */
          badges={<><SalesStateBadge label={status.label} color={status.color} />{historical && <StatusBadge size="sm" tone="info" label="ย้อนหลัง" />}{historical && <StatusBadge size="sm" tone="neutral" label="ไม่นับ Actual" />}{order.signatureEvidenceId && <span className="ui-badge" style={{ color: "var(--green)" }}>มีหลักฐานลายเซ็น</span>}{order.approvalMode === "admin_override" && <span className="ui-badge ui-badge-warn">Admin Override</span>}{financeStatus && <StatusBadge size="sm" tone={FINANCE_STATUS_TONES[financeStatus]} label={FINANCE_STATUS_LABELS[financeStatus]} />}</>}
          facts={[
            { icon: CalendarDays, label: "วันที่ SO", value: fmtDate(order.orderDate) },
            // กำหนดชำระขึ้นแถบหัวแทน "Actual ในระบบ" ที่พูดซ้ำกับการ์ดสรุปฝั่งขวา
            // (ที่นั่นมี "Actual ก่อน VAT" พร้อมกองของยอด — Actual/รออนุมัติ/ยังไม่นับ) — วันครบกำหนด
            // เป็นสิ่งที่คนเปิดใบอยากรู้ทันทีมากกว่า
            { icon: CalendarDays, label: "กำหนดชำระ", value: fmtDate(order.paymentDueDate) },
            { icon: FileText, label: "อ้างอิง QT", value: naText(order.quotation?.quoteNumber) },
            { icon: CircleDollarSign, label: "ยอดก่อน VAT", value: fmtMoney(order.actualAmount) },
            /* ⭐ **สัญญาบริการอยู่บนหัวใบ ไม่ใช่หลังแท็บ** — งานบริการทั้งเส้นเดินได้ก็ต่อ
               เมื่อใบนี้มีสัญญาที่มีผล ⇒ เป็นคำถามแรกของคนเปิดใบ ไม่ใช่ของที่ต้องไปตาม
               ข้อมูลมากับ GET ของใบอยู่แล้ว (`order.serviceContract`) ไม่ต้องยิงเพิ่ม
               ⚠️ ขึ้นเฉพาะใบบนเส้นบริการ — ใบสายสินค้าไม่มีสัญญาบริการให้พูดถึง */
            ...(onServiceLine ? [{ icon: FileSignature, label: "สัญญาบริการ", ...serviceContractHeadline(order.serviceContract, { linkedId: order.serviceContractId }) }] : []),
            /* "รอบที่ขาย" อ่านจากคอลัมน์รายบรรทัดซึ่งกรอกได้เฉพาะบรรทัดหมวด 02-001
               ⇒ ผูกกับเกณฑ์แคบ ไม่ใช่เส้นบริการ (ไม่งั้นได้ขีดลอย ๆ บนใบที่กรอกไม่ได้) */
            ...(hasServiceRounds ? [{
              icon: Repeat,
              label: "รอบบริการที่ขาย",
              value: roundsSold == null ? NA : `${roundsSold} รอบ`,
              tone: roundsSold == null ? "muted" : undefined,
            }] : []),
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
        {/* ⚠️ บัญชีตีกลับ **ไม่ถอน Actual** — ใบยังอนุมัติอยู่ ป้ายจึงต้องไม่พูดถึงยอด
            แต่ต้องเห็นชัดเพราะเป็นสิ่งที่ AE Supervisor ต้องแก้ก่อนส่งตรวจใหม่ */}
        {financeStatus === "rejected" && order.financeRejectReason && (
          <div className={styles.rejection}>
            <Undo2 size={17} />
            <div>
              <strong>บัญชีตีกลับโดย {order.financeRejectedByName || "ฝ่ายบัญชี"}</strong>
              <ReadableText text={order.financeRejectReason} lines={4} />
            </div>
          </div>
        )}

        {/* ⭐ ลำดับ ลูกค้า › โครงการ › ดีล › QT (มติผู้ใช้ 2026-08-13) — ไล่จาก
            "ใครซื้อ" ไป "งานอยู่ในโครงการไหน" ไป "รอบขายไหน" ไป "ใบไหนเป็นต้นทาง"
            ⚠️ การ์ดลูกค้าไม่พูดสถานะ SO ซ้ำแล้ว — ป้ายบนหัวใบกับการ์ดจัดการเอกสาร
            พูดอยู่แล้ว ของเดิมพูดซ้ำสี่ที่ */}
        <ContextGrid>
          <ContextCard icon={Building2} href={order.customerId ? `/database/customers/${order.customerId}` : undefined} eyebrow="ลูกค้า" title={naText(customerHeadline(order.customerName, order.customer?.arCode))} subtitle="ข้อมูลลูกค้าของเอกสาร" facts={[{ label: "ผู้ติดต่อ", value: naText(order.quotation?.contactName) }]} />
          <ContextCard icon={FolderKanban} href={order.projectId ? `/sa/projects/${order.projectId}` : undefined} eyebrow="โครงการ" title={order.project?.name || naText(order.project?.code)} subtitle={order.project?.code || "ข้อมูลโครงการที่ผูกกับดีล"} facts={[{ label: "การเชื่อมโยง", value: order.projectId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม" }]} />
          {/* ชื่อเจ้าของดีลอ่านจาก id — `order.approvedByName` ด้านบนไม่แตะ เพราะเป็น
              snapshot ของการอนุมัติ (ใครเซ็น ณ ตอนนั้น) ไม่ใช่สถานะปัจจุบัน */}
          <ContextCard icon={Handshake} href={`/sa/deals/${order.dealId}`} eyebrow="ดีล" title={naText(order.deal?.title)} subtitle={`${naText(order.deal?.team)} · ${naText(livePersonName(directory, order.deal?.ownerId, order.deal?.ownerName))}`} facts={[{ label: "สถานะ", value: naText(STAGE_LABELS[order.deal?.stage] || order.deal?.stage) }]} />
          {/* ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคา — การ์ดนี้บอกเลขเอกสารเดิมที่คีย์ไว้แทน (ลิงก์ไป /quotations/null ไม่ได้) */}
          {order.quotationId ? (
            <ContextCard icon={FileText} href={`/sa/quotations/${order.quotationId}`} eyebrow="ใบเสนอราคา Won" title={naText(order.quotation?.quoteNumber)} subtitle={`วันที่หลักฐาน ${fmtDate(order.quotation?.wonDocDate)}`} facts={[{ label: "ไฟล์หลักฐาน", value: `${order.quotation?.wonAttachments?.length || 0} ไฟล์` }]} />
          ) : (
            <ContextCard icon={FileText} eyebrow="เลขเอกสารเดิม" title={historicalRefsOf(order).join(" · ")} subtitle={HISTORICAL_STATUS_NOTE} facts={[{ label: "ใบเสนอราคาเดิม", value: order.historicalQuoteRef }, { label: "Express", value: order.historicalExpressRef }, { label: "ใบกำกับ", value: order.historicalInvoiceRef }]} />
          )}
        </ContextGrid>

        <SalesOrderWorkTrack track={workTrack} />

        {/* 🪤 เส้นเดินงานซ่อนช่วงสรรพสามิตเมื่อระบบเชื่อมเอกสารไม่พร้อม/โหลดพัง —
            เงียบไปเฉย ๆ จะอ่านเหมือน "ใบนี้ไม่มีสินค้าสรรพสามิต" ⇒ ต้องดังตรงนี้แทน */}
        {filingState.error || (!filingState.loading && !filingState.schemaReady) ? (
          <AlertBanner tone="danger" icon={ShieldAlert}>
            {filingState.error || "ระบบเชื่อมเอกสารสรรพสามิตยังไม่พร้อมใช้งาน — ช่วงสรรพสามิตบนเส้นเดินงานจึงยังไม่ขึ้น"}
          </AlertBanner>
        ) : null}

        <DetailPageLayout
          asideLabel="สรุปและจัดการ ใบสั่งขาย"
          aside={<>
            <DocumentSummaryCard
              title="ยอดสุทธิ ใบสั่งขาย"
              total={fmtMoney(order.totalAmount)}
              status={status.label}
              statusColor={status.color}
              rows={[
                { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(order.subtotal) },
                discountRow,
                { id: "vat", label: "VAT", value: fmtMoney(order.vatAmount) },
                /* ⭐ ใบรออนุมัติโชว์ยอดพร้อมคำว่า "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353)
                   — เดิม "ยังไม่นับ" เฉย ๆ จนอ่านเหมือนใบไม่มีมูลค่า · ผ่านชิ้นกลาง
                   PendingApprovalAmount ให้หน้าตาเดียวกับทุกจอ · ร่าง/ตีกลับ/ยกเลิก คงเดิม */
                {
                  id: "actual",
                  label: "Actual ก่อน VAT",
                  value: amountKind === "actual" ? fmtMoney(order.actualAmount)
                    : amountKind === "pending_approval"
                      ? (
                        <>
                          <PendingApprovalAmount amount={order.actualAmount} count={1} />
                          <span className={styles.pendingSummaryNote}>ยังไม่นับเป็น Actual</span>
                        </>
                      )
                      : "ยังไม่นับ",
                },
                /* 🔴 บรรทัดนี้คือ **ยอดที่เก็บเงินได้** ไม่ใช่ Actual — Actual เป็นยอดเต็ม
                   ของใบเสมอ ต่อให้แบ่งจ่ายกี่งวด (ยืนยันกับผู้ใช้ 2026-08-13)
                   วางไว้ใต้ Actual โดยตั้งใจ ให้เห็นคู่กันว่าคนละตัว */
                ...(paymentSummary.count
                  ? [{
                    id: "collected",
                    label: `เก็บเงินแล้ว ${paymentSummary.confirmedCount}/${paymentSummary.count} งวด`,
                    value: fmtMoney(paymentSummary.confirmedAmount),
                  }]
                  : []),
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
                  ? <span className="ui-badge ui-badge-warn">ไม่มีผู้ตรวจสอบคนที่สอง — ใช้สิทธิ์ฉุกเฉินได้</span>
                  : reviewer && ownSalesOrder && role !== "admin" && order.status === "pending_approval"
                    ? <span className="ui-badge" style={{ color: "var(--text-3)" }}>SO ที่คุณสร้าง/ยื่นเอง ต้องให้ผู้ตรวจสอบคนอื่นอนุมัติ</span>
                    : null}
              </>}
              /* ⚠️ ใบย้อนหลัง **ไม่เก็บลายเซ็น** เลยสักขั้น (CHECK ของ 0374 ตรึง signature id เป็น NULL)
                 ⇒ ป้ายชวนตั้งลายเซ็นบนใบนี้คือการไล่คนไปทำของที่ระบบไม่ได้ขอ */
              evidence={(
                <SignatureReadyNotice
                  active={!historical && ((canReviewThis && order.status === "pending_approval") || canAdminOverride || editable)}
                  docLabel="ใบสั่งขายนี้"
                />
              )}
            />


            {/* 🪤 การ์ด "การยื่นชำระสรรพสามิต" ถอดออกแล้ว (มติผู้ใช้ 2026-08-17) —
                ทั้งสถานะ ยอดเรียกเก็บ ปุ่มสร้าง และลิงก์เปิดใบยื่น ย้ายขึ้นไปเป็นช่วงบนเส้นเดินงาน
                ⚠️ อย่าเอากลับมา จะกลายเป็นสองที่ที่ตอบคำถามเดียวกันแล้วเพี้ยนหากัน */}
          </>}
        >
          {/* ป้ายบนหัวแท็บ = สถานะย่อของเรื่องนั้น (มติ "ทาง ก") — ห้ามคิดเลขใหม่ที่นี่
              ทุกตัวมาจากของที่หน้านี้คำนวณไว้แล้วด้วยตัวตัดสินกลาง */}
          <Tabs
            value={activeTab}
            onChange={selectTab}
            ariaLabel="ส่วนต่าง ๆ ของใบสั่งขาย"
            tabs={tabKeys.map((key) => ({
              key,
              label: key === "overview" ? "ภาพรวม"
                : key === "documents" ? (salesOrderDocs.data?.total ? `เอกสาร ${salesOrderDocs.data.total}` : "เอกสาร")
                : key === "contract" ? (onServiceLine && !order.serviceContract ? "สัญญา · ยังไม่ผูก" : "สัญญา")
                  : key === "payment" ? (paymentSummary.count ? `การชำระ ${paymentSummary.confirmedCount}/${paymentSummary.count}` : "การชำระ")
                    : key === "service" ? "งานบริการ"
                      : "ประวัติ",
            }))}
          />

          {activeTab === "overview" && <>
          {/* ใบสั่งขายย้อนหลัง (mig 0360) คีย์บรรทัดจากเอกสารเดิม — ไม่มี QT ต้นทางให้เปิด */}
          {/* 🚫 การ์ด "ตัดสินจุดที่ TS ไม่พบ" (มติข้อ 23 · mig 0362) ถอดแล้ว (มติ 22/09) — บรรทัดของใบย้อนหลัง
              ผูกโซนจากทะเบียนตั้งแต่ตอนคีย์ใบ ⇒ ไม่มีชื่อจุดลอย ๆ ให้ TS "หาไม่เจอ" อีก · โซนของใบอยู่ที่
              การ์ด "โซนที่บริการ" ข้างล่างแทน */}
          <DetailCard icon={Package} eyebrow="ORDER LINES" title="รายการสินค้าและบริการ" meta={order.quotationId ? `${sortedLines.length} รายการ · snapshot จาก QT Won` : `${sortedLines.length} รายการ · คีย์จากเอกสารเดิม`} actions={order.quotationId ? <Link href={`/sa/quotations/${order.quotationId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด QT ต้นทาง</Link> : undefined}>
            <QuotationReadOnlyLineItems
              lines={sortedLines}
              showServiceRounds
              /* ใบย้อนหลัง: หนึ่งบรรทัด = หนึ่งโซน ⇒ บอกไซต์ · โซนใต้คำอธิบาย (บรรทัดของโซนต่าง ๆ หน้าตาเหมือนกันทุกช่อง) */
              showInstallationPoint={historical}
              summaryRows={[
                { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(order.subtotal) },
                discountRow,
                { id: "vat", label: "VAT", value: fmtMoney(order.vatAmount) },
              ]}
              grandTotal={fmtMoney(order.totalAmount)}
              highlightRows={[amountHighlight]}
            />
          </DetailCard>

          {/* ⭐ โซนที่ใบนี้ขาย (mig 0374) — ใบย้อนหลังผูกโซนตั้งแต่ตอนคีย์ ⇒ ตารางรายการข้างบน
              ไม่มีคอลัมน์ไซต์/โซนให้ดูเลย · การ์ดนี้บอกด้วยว่าฝ่าย TS ตั้งรอบไปถึงไหนแล้ว */}
          {historical ? (
            <HistoricalZonesCard
              order={order}
              lineZones={order.lineZones}
              plannedSiteIds={historicalProgress.plannedSiteIds}
              loadingPlans={serviceProgress.status === "loading"}
              extrasError={order.extrasError}
            />
          ) : null}
          {/* ⭐ ใบที่อาจซ้ำ — ผู้คีย์ยืนยันใบไหน ใคร เมื่อไร + ที่พบเพิ่มตอนเปิดใบ (มติ 26/09 ข้อ 4 · ขึ้นเฉพาะใบที่มี) */}
          {historical ? <HistoricalDuplicateReviewCard order={order} duplicateCheck={order.duplicateCheck || null} /> : null}

          {/* ⭐ "ช่วงบริการ" (ม็อก SoStatus) — เงินที่บัญชีรับรองแล้วเป็นตัวเปิดด่านของนัดบริการ
              ⇒ คำถามที่ฝ่ายขายถามจริงคือ "นัดเดือนไหนขึ้นได้แล้วบ้าง" ซึ่งตารางงวดตอบเป็นตัวเลข
              แต่ไม่ตอบเป็นเวลา · แถบเป็น SVG ล้วน (ไม่มี style={{…}} — งบ inlineStyle เต็มเพดาน) */}
          {historicalCoverage ? (
            <DetailCard
              icon={CalendarDays}
              eyebrow="SERVICE COVERAGE"
              title="ช่วงบริการ"
              meta={historicalCoverage.through
                ? `ตามสัญญา ${fmtDate(historicalCoverage.start)} – ${fmtDate(historicalCoverage.end)} · เปิดบริการถึง ${fmtDate(historicalCoverage.through)} — นัดที่ตกหลังจากนี้ติดด่านเงินจนกว่าบัญชีรับรองงวดถัดไป`
                : `ตามสัญญา ${fmtDate(historicalCoverage.start)} – ${fmtDate(historicalCoverage.end)} · ยังไม่มีงวดที่บัญชีรับรอง — นัดบริการยังติดด่านเงินทั้งช่วง`}
            >
              <CoverageTimeline
                startDate={historicalCoverage.start}
                endDate={historicalCoverage.end}
                segments={historicalCoverage.segments}
                todayIso={todayIso}
              />
            </DetailCard>
          ) : null}

          {/* ⭐ การ์ดเดียว "ข้อมูลบนเอกสาร" (มติผู้ใช้ 2026-08-13) — ของเดิมแตกเป็น
              สองการ์ดในราง 330px: "ตรวจข้อมูลเอกสาร" (ฟอร์ม) กับ "ข้อมูลลูกค้าในเอกสาร"
              (ที่อยู่) ทั้งที่ตอบคำถามเดียวกันว่า "ใบนี้เขียนว่าอะไรบ้าง"
              วัดจากหน้าจริงก่อนรื้อ: ที่อยู่อยู่ที่ระยะ 2167px และกว้างแค่ 330px
              ⚠️ ที่อยู่/ผู้ติดต่อ **อ่านอย่างเดียวเสมอ** — ตาราง sales_orders ไม่มี
              คอลัมน์ที่อยู่ด้วยซ้ำ (กฎผู้ใช้ 2026-08-05) ส่วนวันที่/เอกสารอ้างอิง/หมายเหตุ
              แก้ที่นี่ได้ตอนใบยังเป็นร่าง */}
          <DetailCard
            icon={MapPin}
            eyebrow="ON THIS DOCUMENT"
            title="ข้อมูลบนเอกสาร"
            meta={`ที่อยู่และผู้ติดต่อยึดตามใบเสนอราคา ${naText(order.quotation?.quoteNumber)}`}
          >
            <div className={styles.docGrid}>
              <div className={styles.docAddress}>

              <dl className={styles.addressList}>
                <div>
                  {/* ผ่าน branchLabel — '00000' คือ "สำนักงานใหญ่" ไม่ใช่เลขสาขาที่ต้องอ่าน
                      (ดู lib/master/thaiAddress.js · หน้าทะเบียนลูกค้าใช้ตัวเดียวกันอยู่แล้ว) */}
                  <dt>ที่อยู่ออกบิล{order.quotation?.branchCode ? ` · ${branchLabel(order.quotation.branchCode)}` : ""}</dt>
                  <dd>{naText(order.quotation?.billingAddress)}</dd>
                </div>
                <div>
                  <dt>ที่อยู่จัดส่ง</dt>
                  <dd>{order.quotation?.shippingAddress || naText(order.quotation?.billingAddress)}</dd>
                </div>
                <div>
                  <dt>ผู้ติดต่อ</dt>
                  <dd>{naText([order.quotation?.contactName, order.quotation?.contactPhone].filter(Boolean).join(" · "))}</dd>
                </div>
              </dl>
              <p className={styles.snapshotNote}>
                ตามใบเสนอราคา {naText(order.quotation?.quoteNumber)} — แก้ที่นี่ไม่ได้ ต้องแก้ที่ใบเสนอราคา (ใบที่อนุมัติแล้วต้องออก Rev.)
              </p>
              </div>
              <div className={styles.formStack}>
                {/* ⚠️ วันที่ SO ไม่ใช่ช่องกรอก — เป็นวันที่สร้างใบ แก้ไม่ได้ (มติ 2026-08-18)
                    กำหนดชำระย้ายไปอยู่ที่งวดในการ์ด "การชำระ" ทั้งหมด · ทั้งสองค่ายังโชว์
                    อยู่ที่แถบหัวใบ จึงไม่ได้หายไปจากสายตา แค่ไม่มีใครแก้ได้ */}
                <label>
                  <span>วันที่ SO</span>
                  <div className="readable-field is-compact">{fmtDate(order.orderDate)}</div>
                </label>
                {/* ⭐ กำหนดส่งสินค้า (0363) — วางติดวันที่ SO เพราะคนอ่านเทียบสองค่านี้กันเอง
                    ⚠️ **ช่องกรอกใช้ component เดียวกับหน้าสร้างใบ** (กฎ AGENTS.md) */}
                <SalesOrderDeliveryDueField
                  mode={editable ? "edit" : "read"}
                  value={form.deliveryDueDate}
                  onChange={(next) => updateField("deliveryDueDate", next)}
                  readonlyClassName={styles.readonlyFormField}
                />
                {/* ⭐ เอกสารอ้างอิงฝั่งลูกค้า (IS-26080017 · mig 0235) — PO/สัญญา/เลขในระบบ
                    จัดซื้อของเขา · **ไม่ใช่หมายเหตุ**: ช่องนี้ค้นได้และขึ้นเป็นคอลัมน์ในตาราง
                    ส่วนหมายเหตุเป็นข้อความอิสระที่พิมพ์ลงเอกสาร · ปนกันเมื่อไรก็ค้นเจอขยะ
                    ⚠️ ช่องบรรทัดเดียว ไม่ใช่ Textarea — เพดาน 200 และมันคือ "ตัวชี้ไปเอกสาร
                    อีกใบ" ไม่ใช่ข้อความยาว (กติกาข้อความยาวใน form-design-rules §3) */}
                {editable
                  ? (
                    <label>
                      <span>เอกสารอ้างอิง</span>
                      <Input
                        value={form.referenceDoc} maxLength={200}
                        placeholder="เช่น PO-2569-00123 · สัญญาเลขที่ ABC/2569"
                        onChange={(event) => updateField("referenceDoc", event.target.value)}
                      />
                    </label>
                  )
                  : (
                    <div className={styles.readonlyFormField}>
                      <span>เอกสารอ้างอิง</span>
                      <div className="readable-field">
                        {form.referenceDoc || <span className="readable-field-empty">ไม่มีเอกสารอ้างอิง</span>}
                      </div>
                    </div>
                  )}
                {editable
                  ? <label><span>หมายเหตุ</span><Textarea rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
                  : <div className={styles.readonlyFormField}><span>หมายเหตุ</span><div className="readable-field"><ReadableText text={form.notes} lines={5} empty={<span className="readable-field-empty">ไม่มีหมายเหตุ</span>} /></div></div>}
              </div>
            </div>
          </DetailCard>

          {/* ⭐ เอกสารยืนยันคำสั่งซื้อ (mig 0285) — ย้ายมาจากขั้นปิด Won
              ⚠️ **ช่องกรอกใช้ component เดียวกับหน้าสร้างใบ** (กฎ AGENTS.md: ฟอร์มสร้าง
              กับฟอร์มแก้ต้องเป็นตัวเดียวกัน ต่างกันได้แค่โหมด) — ที่นี่คือโหมด `saved`
              เพราะไฟล์ที่บันทึกแล้วเปิดผ่าน proxy ได้ ส่วนไฟล์ใหม่ยังเป็น File[] ที่รออัป
              ⚠️ ใบเก่าที่หลักฐานอยู่ที่ใบเสนอราคา อ่านจากที่นั่น + บอกว่ามาจากไหน
              ⚠️ **ใบย้อนหลังไม่มีการ์ดนี้** (มติ 22/09) — ขั้นนี้ถามว่า "ลูกค้ายืนยันคำสั่งซื้อด้วยเอกสารอะไร"
                 ซึ่งใบย้อนหลังตอบด้วย *เอกสารแทนสัญญา* (PO/อีเมล/สัญญาเก่า/ใบเสนอราคาที่ลูกค้าเซ็น) ที่
                 คีย์ในฟอร์มและอนุมัติพร้อมใบอยู่แล้ว ⇒ ปล่อยไว้ = ขอเอกสารชุดที่สองที่ไม่มีใครมี */}
          {historical ? null : (
          <DetailCard
            icon={FileCheck2}
            eyebrow="ORDER CONFIRMATION"
            title="ยืนยันคำสั่งซื้อ"
            meta={confirmationOnFile?.source === "quotation"
              ? `หลักฐานอยู่ที่ใบเสนอราคา ${naText(order.quotation?.quoteNumber)} (ใบที่ออกก่อนย้ายขั้นนี้มาที่ใบสั่งขาย)`
              : "เอกสารที่ลูกค้ายืนยันคำสั่งซื้อ — ต้องมีก่อนยื่นอนุมัติ"}
          >
            {confirmationOnFile?.source === "quotation" && !editable ? (
              <SalesOrderConfirmationFields
                mode="read"
                value={confirmationOnFile}
                fileHref={confirmFileHref}
              />
            ) : (
              <SalesOrderConfirmationFields
                mode={editable ? "saved" : "read"}
                value={editable ? confirmation : (confirmationOnFile || confirmation)}
                onChange={(next) => { setConfirmation(next); setDirty(true); setSaveState("dirty"); }}
                files={confirmFiles}
                onFilesChange={setConfirmFiles}
                onOversize={setError}
                disabled={!!busy}
                fileHref={confirmFileHref}
              />
            )}
            {confirmationGate && !editable && (
              <p className="form-note" role="status" style={{ marginTop: 12 }}>{confirmationGate}</p>
            )}
          </DetailCard>
          )}

          {/* ⭐ เอกสารต่อเนื่อง (mig 0370) — ใบที่ออกต่อจากใบสั่งขายที่อนุมัติแล้ว
              วางถัดจากการ์ดยืนยันคำสั่งซื้อเพราะใบพวกนั้นใช้ PO/วันที่จากการ์ดนี้
              ⚠️ **หน้านี้เป็นทางเข้า ไม่ใช่บ้านของใบ** — FM-SA-04 หนึ่งใบต่อหนึ่งบรรทัด SO
                 เส้นอนุมัติอยู่ที่หน้าเอกสาร (มติเจ้าของ 21/09/2569)
              🐞 ส่ง `orderStatus` เสมอ — อนุมัติใบบนหน้านี้แล้วการ์ดต้องดึงใหม่เอง ไม่งั้นปุ่ม
                 "ออกเอกสาร" ค้างเหตุ "ยังไม่อนุมัติ" จนกด F5
              ⚠️ การ์ดคืน null เองเมื่อใบไม่มีบรรทัดหมวด 01/02 เลย (ใบที่ขายแต่ค่าออกแบบ) */}
          <SalesOrderFollowUpDocs orderId={order.id} orderStatus={order.status} />

          {/* ⭐ การ์ดสัญญาบริการ (mig 0324) — ย้ายเข้าแท็บ "สัญญา" แล้ว (PR-F) · ขึ้นเฉพาะใบบนเส้นบริการ
              ⚠️ สัญญามาก่อนเงิน ทั้งในลำดับงานจริง และในด่าน "จ่ายก่อนบริการ" ที่อ่านทั้งสองอย่างประกอบกัน
                 ⇒ แท็บ "สัญญา" อยู่ก่อนแท็บ "การชำระ" */}
          </>}

          {activeTab === "documents" && (
            <SalesOrderDocumentsPanel
              orderId={order.id}
              docs={salesOrderDocs}
              meId={order.meId}
              isAdmin={role === "admin"}
              onOpenTab={selectTab}
              tabKeys={tabKeys}
            />
          )}

          {activeTab === "contract" && (
            <>
              {/* การ์ดผูกสัญญาบริการ — เฉพาะใบบนเส้นบริการ (ด่านแรกของงานบริการทั้งเส้น) */}
              {onServiceLine ? (
                <ServiceContractCard
                  order={order}
                  canEdit={canEdit}
                  busy={!!busy}
                  onLink={setServiceContract}
                  onSaveRounds={setServiceRounds}
                  canCreateBelow={showDealContracts && canCreateContract}
                  editMode={editMode}
                />
              ) : null}
              {/* ⭐ **สัญญาทุกฉบับของดีล + ทางออกสัญญา/เอกสารแทน อยู่ในแท็บนี้** (มติ 15/09 + 25/09)
                  การ์ดตัวเดียวกับหน้าดีล (โมดัลตัวเดียวกัน ไม่มีฟอร์มที่สอง) · เห็นร่าง/รอลงนาม/รอ AE Sup ด้วย
                  🐞 ของเดิมการ์ดผูกเห็นแต่ใบที่ `signed` ⇒ ร่างเอกสารแทนสัญญาที่แนบไฟล์แล้วรอ AE Sup
                     มองไม่เห็นจากใบนี้เลย
                  ⭐ ปุ่ม "ออกสัญญา" ย้ายมาจากการ์ดจัดการ (เดิม "ออกสัญญาจากใบนี้") — แท็บขึ้นทุกใบแล้ว
                     จึงไม่ต้องมีทางเข้าที่สองบนหน้าเดียวกัน · เงื่อนไขปุ่มเดิมทุกข้อ (`canCreateContract`)
                  ⚠️ ใบย้อนหลังไม่มีการ์ดนี้ — สัญญาของใบคือ "เอกสารแทนสัญญา" ที่ฟอร์มคีย์ใบสร้างและอนุมัติ
                     พร้อมใบ (การ์ดผูกข้างบนแสดงให้) · ดีลของใบย้อนหลังเป็นดีลภาชนะ ⇒ ลิสต์ทั้งดีลจะพาเอกสาร
                     แทนสัญญาของใบพี่น้องมาปน */}
              {showDealContracts ? (
                <DealContractsCard dealId={order.dealId} quotationId={order.quotationId} canEdit={canCreateContract} />
              ) : null}
            </>
          )}

          {activeTab === "service" && (
            <SalesOrderServiceTab orderId={order.id} />
          )}

          {/* ⭐ การ์ด "การชำระ" (mig 0245/0246) — หลักฐานปิดการขายอยู่หัว งวดอยู่ล่าง
              ⚠️ **ยอด Actual ไม่เกี่ยวกับการ์ดนี้** — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ
              ต่อให้แบ่งจ่ายกี่งวด (ยืนยันกับผู้ใช้ 2026-08-13) */}
          {activeTab === "payment" && (
          <SalesOrderPaymentPanel
            order={order}
            installments={installments}
            user={{ id: order.meId, role }}
            todayIso={todayIso}
            canStart={canEdit}
            busy={busy}
            onStart={startPaymentTracking}
            onAction={runInstallmentAction}
            onReplan={runInstallmentReplan}
            onCarry={runInstallmentCarry}
            /* 🐞 แถบ error ของหน้าอยู่บนสุดของคอลัมน์ ⇒ **โมดัลบังไว้หมด** — กดบันทึก
               งวดแล้วโมดัลค้างเงียบ ไม่มีอะไรบอกว่าทำไมไม่ผ่าน (ผู้ใช้แจ้ง 2026-08-27)
               อาการเดียวกับที่ `ReasonDialog.submitError` แก้ไว้เมื่อ 2026-08-19 —
               รอบนี้ยกให้ครบทุกโมดัลของแผงนี้ ⇒ ส่งข้อความเข้าไปในโมดัลด้วย */
            error={error}
            onClearError={() => setError("")}
          />
          )}

          {/* ข้อมูลควบคุม + ประวัติฉบับแก้ไข — ข้อมูล "เย็น" ที่ไม่ใช่คำถามแรกของใคร
              จึงอยู่ท้ายคอลัมน์ ของเดิมอยู่กลางรางขวาที่ระยะ 2537px */}
  {activeTab === "history" && <>
  <DetailCard icon={History} eyebrow="AUDIT TRAIL" title="ใครทำอะไรกับใบนี้">
                <dl className={styles.auditList}>
                  <div><dt>ผู้จัดทำ</dt><dd>{naText(order.createdByName)}</dd></div>
                  <div><dt>ผู้ยื่น</dt><dd>{naText(order.submittedByName)}</dd></div>
                  <div><dt>ผู้อนุมัติ</dt><dd>{naText(order.approvedByName)}</dd></div>
                  {order.approvalMode === "admin_override" && <div><dt>รูปแบบอนุมัติ</dt><dd><span className="ui-badge ui-badge-warn">Admin Override</span></dd></div>}
                  {order.approvalOverrideReason && <div><dt>เหตุผล Override</dt><dd><ReadableText text={order.approvalOverrideReason} lines={3} /></dd></div>}
                  {order.status === "cancelled" && <div><dt>เหตุยกเลิก</dt><dd><ReadableText text={`${cancelReasonLabel(order.cancelReasonCode)}${order.cancelReason ? ` — ${order.cancelReason}` : ""}`} lines={3} /></dd></div>}
                </dl>
              </DetailCard>
  {order.revisionHistory?.length > 1 ? (
                <DetailCard icon={FileClock} eyebrow="REVISION HISTORY" title="ประวัติฉบับแก้ไข">
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
  </>}

          {/* ใบไม่มีเธรดของตัวเองแล้ว (มติผู้ใช้ 2026-08-04) — ความเคลื่อนไหวของใบ
              ทุกอย่างไปอยู่ในเธรดของ **ดีลแม่** ที่เดียว (และไหลต่อขึ้นหน้าโครงการ)
              เหตุผลเต็มใน lib/sales/documentUpdates.js */}
        </DetailPageLayout>
      </div>

      {overrideForm && (
        <Modal open onClose={() => setOverrideForm(null)} title="อนุมัติแบบ Admin Override" size="sm" dismissible={!busy}>
          <div className="drawer-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="glass-panel" style={{ padding: "10px 12px", borderColor: "var(--amber)", background: "var(--amber-soft)", display: "flex", gap: 10 }}>
              <ShieldAlert size={20} color="var(--amber)" aria-hidden="true" />
              <div style={{ color: "var(--text-2)", fontSize: "var(--fs-7)" }}>
                <strong style={{ color: "var(--text)" }}>กรณีพิเศษเมื่อยังไม่มีผู้ตรวจสอบคนที่สอง</strong>
                <p style={{ margin: "4px 0 0" }}>คุณเป็นผู้สร้างหรือผู้ยื่นใบนี้ — การอนุมัติจะย้ายยอด {fmtMoney(order.actualAmount)} จาก “{PENDING_APPROVAL_LABEL}” เข้า Actual ของเดือน {formatMonthLabel(currentMonth())} ทันที และบันทึกไว้กับหลักฐานลายเซ็นถาวรว่าเป็นการอนุมัติแบบ Admin Override</p>
              </div>
            </div>
            <div className="action-bar" style={{ marginTop: 0 }}>
              <button type="button" className="btn ghost" onClick={() => setOverrideForm(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-warning" onClick={approveWithAdminOverride} disabled={!!busy}><ShieldAlert size={15} /> {busy === "approve" ? "กำลังอนุมัติ…" : "ยืนยัน Override และนับ Actual"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* โมดัลใส่เหตุผลใช้ร่วมสองคำสั่ง — ย้อนการอนุมัติ · ดึงกลับ
          (เดิมมี "บัญชีตีกลับใบ" ด้วย · ถอดออกตามมติ 2026-08-30 — ตีกลับเหลือรายงวด) */}
      <ReasonDialog
        open={!!workflowForm}
        title={{
          revoke: "ย้อนการอนุมัติ ใบสั่งขาย",
        }[workflowForm?.action] || "ดึงกลับ ใบสั่งขาย"}
        description={{
          revoke: `SO ${order.orderNumber} จะหลุดจากยอด Actual ทันที และแก้ฉบับเดิมไม่ได้ — ขั้นถัดไปคือกด "ออก Rev."`,
        }[workflowForm?.action] || `SO ${order.orderNumber} จะกลับเป็นฉบับร่างและแก้ไขได้`}
        /* ดึงกลับ = ใบออกจากกอง "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353) — บอกยอดที่หายไป
           จากภาพรวม/ดีล/โครงการ ให้คนกดรู้ก่อน ไม่ต้องไปงงทีหลังว่ายอดหายไปไหน */
        detail={{
          /* ⭐ เรื่องเงินของการย้อน (PR1 · mig 0376): เงินที่รับแล้วยังนับว่ารับแล้ว + ย้ายไปใบ Rev. ทั้งชุดตอนออก Rev. ·
             สลิปรอตรวจยังอยู่ในคิว · ใบที่บัญชีปิดแล้ว (มติ D2) · ใบบริการ (ด่านนัดช่าง/ผูกโซนใหม่) — บรรทัดละข้อ (pre-line) */
          revoke: [
            `ยอด Actual ${fmtMoney(order.actualAmount)} จะถูกนำออกจนกว่า Rev. ใหม่จะอนุมัติ · เหตุผลนี้จะใช้ต่อในขั้นออก Rev. ไม่ต้องกรอกซ้ำ`,
            ...salesOrderMoneyOutcome(order, installments, "revoke", { serviceRounds: hasServiceRounds }),
          ].join("\n"),
        }[workflowForm?.action]
          /* ใบย้อนหลังไม่มียอดในกอง "รออนุมัติ" และไม่มีลายเซ็นให้ยื่นใหม่ — พูดเรื่องนั้นคือพูดของที่ไม่มี */
          || (historical ? historicalWithdrawDetail(order)
            : `ยอด ${fmtMoney(order.actualAmount)} จะออกจาก "${PENDING_APPROVAL_LABEL}" จนกว่าจะยื่นใหม่ · หลักฐานการยื่นเดิมยังคงอยู่ในประวัติ หลังแก้ไขต้องยื่นและลงนามใหม่`)}
        label="เหตุผล"
        value={workflowForm?.reason || ""}
        onChange={(reason) => setWorkflowForm((current) => ({ ...current, reason }))}
        onClose={() => setWorkflowForm(null)}
        onConfirm={submitWorkflowAction}
        confirmLabel={{
          revoke: "ยืนยันย้อนการอนุมัติ",
        }[workflowForm?.action] || "ยืนยันดึงกลับ"}
        placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร"
        minLength={10}
        maxLength={500}
        tone={workflowForm?.action === "withdraw" ? "warning" : "danger"}
        busy={busy === workflowForm?.action}
        /* 🐞 เหตุที่ API ตีกลับต้องอ่านได้ในโมดัลที่ยังเปิดอยู่ (แถบ error ของหน้าอยู่ใต้โมดัล) —
           ของใบย้อนหลังมีจริงหลายข้อ: ใบขยับไปแล้ว · ดึงกลับได้เฉพาะผู้ยื่น · ย้อนการอนุมัติไม่ได้ */
        submitError={error}
      />

      <ReasonDialog
        open={!!rejectForm}
        title="ตีกลับให้ผู้จัดทำแก้ไข"
        /* ตีกลับ = ยอดออกจากกอง "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353) — เดิมไม่มีบรรทัดผลลัพธ์เลย
           ⚠️ ใบย้อนหลังไม่เคยเข้ากองไหน ⇒ บอกสิ่งที่เกิดจริง: ใบกลับไปที่ฟอร์มคีย์ใบ เอกสารแทนสัญญายังเป็นร่าง */
        detail={historical
          ? historicalRejectDetail(order)
          : `ยอด ${fmtMoney(order.actualAmount)} จะออกจาก "${PENDING_APPROVAL_LABEL}" — ใบกลับไปให้ผู้จัดทำแก้ไขแล้วยื่นใหม่ ยังไม่นับเป็น Actual`}
        label="เหตุผลที่ตีกลับ"
        value={rejectForm?.reason || ""}
        onChange={(reason) => setRejectForm({ reason })}
        onClose={() => setRejectForm(null)}
        onConfirm={submitReject}
        confirmLabel="ยืนยันตีกลับ"
        placeholder="ระบุสิ่งที่ต้องแก้ไข"
        maxLength={500}
        busy={busy === "reject"}
        /* 🐞 เช่นเดียวกับโมดัลข้างบน — RPC ตีกลับใบย้อนหลังตอบได้หลายข้อ (ใบขยับไปแล้ว · ไม่ใช่ผู้ตรวจ) */
        submitError={error}
      />

      {cancelForm && (
        <Modal open onClose={closeCancel} title={historicalCancel?.title || "ยกเลิก ใบสั่งขาย"} size="sm" dismissible={!busy}>
          <div className="p-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* ใบรออนุมัติที่ผู้ตรวจยกเลิก = ยอดออกจากกอง "รออนุมัติ" ไม่ใช่จาก Actual (มติ 2026-09-11)
                · ใบย้อนหลังไม่เคยนับกองไหน — คำนำของตัวเองทุกสถานะ (มติ 24/09) */}
            <p style={{ color: "var(--text-2)", margin: 0 }}>
              {historicalCancel
                ? historicalCancel.lead
                : amountKind === "pending_approval"
                  ? `ยอด ${fmtMoney(order.actualAmount)} จะออกจาก "${PENDING_APPROVAL_LABEL}" ทันที — เลือกเหตุผลที่ยกเลิก`
                  : "หากอนุมัติแล้ว ยอด Actual จะถูกนำออกทันที — เลือกเหตุผลที่ยกเลิก"}
            </p>
            {/* เอกสาร FM-SA-04 ของใบนี้ถูก void ตามไปด้วย (ย้อนกลับไม่ได้) — ต้องบอกก่อนกด ไม่ใช่รู้ทีหลัง */}
            {cancelSpecDocEffect ? <StatusNotice tone="warning">{cancelSpecDocEffect}</StatusNotice> : null}
            {/* ⭐ ใบย้อนหลัง: ฐานยกเลิก **เอกสารแทนสัญญา** ตามใบในทรานแซกชันเดียวกัน (trigger ของ 0374)
                ⇒ คนกดต้องรู้ก่อนว่าสัญญาหายไปด้วย และเลข CT ของฉบับที่ลงนามแล้วไม่คืน */}
            {cancelContractEffect ? <StatusNotice tone="warning">{cancelContractEffect}</StatusNotice> : null}
            {/* ⭐ เรื่องเงินของการยกเลิก (PR3 · mig 0378 · มติ D4) — ใบที่มีเงินรับแล้วยกเลิกได้ เงินอยู่กับใบนี้เป็น
                "เงินค้างจากใบที่ยกเลิก" (ยกเข้าใบใหม่/คืนเงิน) · สลิปรอตรวจ · งวดที่หลุดจากค้างรับ · ใบกำกับที่ต้องลดหนี้ถ้าคืน */}
            {cancelMoneyLines.length ? (
              <StatusNotice tone="warning" title="เงินของใบนี้">
                <span className="pre-line">{cancelMoneyLines.join("\n")}</span>
              </StatusNotice>
            ) : null}
            {/* ⭐ ใบย้อนหลังที่อนุมัติแล้ว (มติ 24/09): รอบขายของโซนหยุด — ด่านนัดช่างรอใบใหม่อนุมัติและบัญชีรับรองงวดยกมา · ทางคีย์ใหม่ */}
            {historicalCancel?.notices?.length ? (
              <StatusNotice tone="warning" title="หลังยกเลิก">
                <span className="pre-line">{historicalCancel.notices.join("\n")}</span>
              </StatusNotice>
            ) : null}
            <label style={{ display: "block", fontSize: "var(--fs-7)" }}>
              <span style={{ color: "var(--text-2)" }}>เหตุผล</span>
              <Select value={cancelForm.code} onChange={(e) => setCancelForm((f) => ({ ...f, code: e.target.value }))}>
                <option value="">— เลือกเหตุผล —</option>
                {SALES_ORDER_CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </Select>
            </label>
            <label style={{ display: "block", fontSize: "var(--fs-7)" }}>
              {/* ใบย้อนหลังที่งวดยกมารับรองแล้ว: บังคับ ≥ 10 ตัวอักษร (historicalCancelNoteError — ตัวเดียวกับ route) */}
              <span style={{ color: "var(--text-2)" }}>{historicalCancel ? historicalCancel.noteLabel : `หมายเหตุ ${cancelForm.code === "other" ? "(บังคับ)" : "(ไม่บังคับ)"}`}</span>
              <Textarea rows={2} value={cancelForm.note} onChange={(e) => setCancelForm((f) => ({ ...f, note: e.target.value }))} placeholder="รายละเอียดเพิ่มเติม" />
            </label>
            {showReversal && (
              <div className="glass-panel" style={{ padding: "10px 12px", borderColor: "var(--amber)", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: "var(--fs-7)", color: "var(--text)" }}>เหตุนี้เป็นฝั่งลูกค้า — ต้องการ <strong>ย้อน Won</strong> (ถอยดีลออกจาก Won + ถอนยอด Actual) ด้วยไหม?</span>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--fs-7)" }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === ""} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "" }))} /> ไม่ย้อน (ยกเลิกเฉพาะ SO — ดีลคง Won)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--fs-7)" }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === "reopen"} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "reopen" }))} /> ย้อน → เปิดดีลใหม่ (กลับสถานะก่อน Won)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--fs-7)" }}>
                  <input type="radio" name="rev" checked={cancelForm.reverseTo === "lost"} onChange={() => setCancelForm((f) => ({ ...f, reverseTo: "lost" }))} /> ย้อน → ปิดดีลเป็น Lost (ลูกค้าเลิกถาวร)
                </label>
                {cancelForm.reverseTo === "lost" && (
                  <Textarea rows={2} value={cancelForm.lostReason} onChange={(e) => setCancelForm((f) => ({ ...f, lostReason: e.target.value }))} placeholder="เหตุผลที่ดีลไม่สำเร็จ (บังคับ)" />
                )}
              </div>
            )}
            {/* 🐞 เหตุที่ API ตีกลับต้องอ่านได้ **ในโมดัลที่ยังเปิดอยู่** — แถบ error ของหน้าอยู่ใต้โมดัล
                (ใบย้อนหลัง: งวดปกติที่รับเงินแล้ว/รอตรวจ · หมายเหตุของงวดยกมาที่รับรองแล้ว · trigger 0387 ตอนแข่งกับบัญชี —
                ใบ pipeline ไม่ติดเรื่องเงินแล้วตั้งแต่ PR3 · ใบยื่นสรรพสามิต · สิทธิ์ผู้ตรวจ)
                ของเดิมกดแล้วโมดัลค้างเงียบ ปุ่มกลับมากดได้ โดยไม่มีอะไรบอกว่าทำไมไม่ผ่าน */}
            {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" onClick={closeCancel} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-danger" onClick={doCancel} disabled={!!busy || !cancelForm.code}><XCircle size={15} /> {historicalCancel?.confirmLabel || "ยืนยันยกเลิก SO"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ⭐ `children` = ของที่ต้อง **เปิดดู/กรอก** ในโมดัลยืนยัน (ConfirmDialog รองรับอยู่แล้ว) —
          โมดัลอนุมัติใบย้อนหลังใส่ลิงก์ไฟล์เอกสารแทนสัญญา + หลักฐานงวดยกมาเข้ามาทางนี้
          ⚠️ ช่องเหตุผล Admin Override **ไม่บังคับ** จึงอยู่ในกล่องยืนยันได้ (กติกา ConfirmDialog)
             ถ้าวันไหนเจ้าของสั่งให้บังคับ ต้องย้ายไปเป็น ReasonDialog ไม่ใช่เติมด่านที่นี่ */}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        error={confirmState?.showsError ? error : undefined}
        onConfirm={runConfirmed}
        onClose={() => { if (!confirmBusy) setConfirmState(null); }}
      >
        {confirmState?.children || confirmState?.overrideReason ? (
          <>
            {confirmState?.children}
            {confirmState?.overrideReason ? (
              <label className="form-field">
                <span className="form-field-label">เหตุผลของ Admin Override (ไม่บังคับ)</span>
                <Textarea
                  rows={2}
                  maxLength={500}
                  value={overrideReason}
                  placeholder="บันทึกไว้กับใบว่าทำไมต้องอนุมัติใบของตัวเอง"
                  onChange={(event) => { overrideReasonRef.current = event.target.value; setOverrideReason(event.target.value); }}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </ConfirmDialog>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

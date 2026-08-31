"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2, CalendarDays, CircleDollarSign, ClipboardList, Package,
  ExternalLink, FileCheck2, FileClock, FileText, FolderKanban, Handshake, History, MapPin, Pencil, ShieldAlert,
  Trash2, Undo2, XCircle,
} from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
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
import { customerHeadline } from "@/lib/master/customerAr";
import SalesOrderConfirmationFields from "@/components/salesPlanning/SalesOrderConfirmationFields";
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
  SALES_ORDER_CANCEL_REASONS,
  canCancelSalesOrder,
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canSubmitSalesOrder,
  canWithdrawSalesOrderSubmission,
  cancelReasonLabel,
  isCustomerCancelReason,
} from "@/lib/sales/salesOrderWorkflow";
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
import { orderHasServiceRounds } from "@/lib/sales/serviceOrders";
import { salesOrderWorkTrack } from "@/lib/sales/salesOrderWorkTrack";
import { paymentRollup } from "@/lib/sales/salesOrderPayments";
import { approvalPrompt } from "@/lib/approvalPrompt";
import { apiFetch } from "@/lib/apiFetch";
import {
  FINANCE_REVIEW_POINTS, FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES,
  financeActionError, financeStatusOf, financeStepOwnerError, financeWorkflowStep,
  salesOrderWorkflowIndex,
} from "@/lib/sales/salesOrderFinanceApproval";

const STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)", description: "ตรวจสอบข้อมูลและรายการก่อนยื่นอนุมัติ" },
  pending_approval: { label: "รอ AE Supervisor อนุมัติ", color: "var(--amber)" },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)", description: "ยอดถูกนับเป็น Actual แล้ว" },
  rejected: { label: "ตีกลับให้แก้ไข", color: "var(--red)", description: "แก้ไขตามเหตุผลแล้วส่งอนุมัติใหม่" },
  approval_revoked: { label: "ย้อนการอนุมัติแล้ว", color: "var(--red)", description: "ยอดหลุดจาก Actual แล้ว · แก้ฉบับเดิมไม่ได้ ต้องออก Rev." },
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
};

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("salesplan:edit");
  const canCreateFiling = useCan("sales:act");
  // เปิดคำร้องได้ = สาขาฝ่ายขายของด่าน POST /api/sa/requests (costing:edit) —
  // RD/PC ผ่านด่านนั้นทางสาขา "รับคำร้องของฝ่ายตนได้" ซึ่งไม่ใช่งานของหน้า SO
  const canOpenRequest = useCan("costing:edit");
  const role = useRole();
  const reviewer = ["admin", "ae_supervisor"].includes(role);
  const [order, setOrder] = useState(null);
  const directory = usePeopleDirectory(); // แปลง ownerId ของดีล → ชื่อปัจจุบัน
  /* แก้ได้เหลือสองช่อง (มติผู้ใช้ 2026-08-18) — วันที่ SO ล็อกเป็นวันที่สร้าง
     และกำหนดชำระย้ายไปอยู่ที่งวดทั้งหมด */
  const [form, setForm] = useState({ referenceDoc: "", notes: "" });
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
    setForm({ referenceDoc: data.referenceDoc || "", notes: data.notes || "" });
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

  function openSubmitConfirm() {
    setConfirmState({
      title: "ยื่นอนุมัติ ใบสั่งขาย",
      description: `ยืนยันยื่น ${order.orderNumber} ให้ AE Supervisor ตรวจอนุมัติหรือไม่`,
      detail: "หลังยื่นแล้วเอกสารจะถูกล็อก ผู้ยื่นดึงเอกสารของตัวเองกลับได้",
      confirmLabel: "ยื่นอนุมัติ",
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
     ที่นี่จึงเหลือแค่ "อัปไฟล์ (ถ้ามี) แล้วยิง" — ไม่ตัดสินสิทธิ์ซ้ำ */
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
        body: JSON.stringify({ installmentId: row.id, action, ...options, files: undefined, evidence }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "อัปเดตงวดชำระไม่สำเร็จ"); return false; }
      setOrder((current) => ({ ...current, installments: data.installments || [] }));
      setToast({
        kind: action === "reject" ? "info" : "success",
        msg: {
          report: "ส่งให้บัญชีตรวจแล้ว",
          withdraw: "ดึงกลับแล้ว",
          confirm: "บัญชีรับรองการชำระแล้ว",
          reject: "ตีกลับให้ฝ่ายขายแก้แล้ว",
          schedule: "บันทึกกำหนดชำระแล้ว",
          coverage: "บันทึกช่วงครอบบริการแล้ว",
          link: "แนบคำร้องขอเอกสารกับงวดนี้แล้ว",
          unlink: "ถอดคำร้องออกจากงวดแล้ว",
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

  function leaveEditMode() {
    setForm({ referenceDoc: order.referenceDoc || "", notes: order.notes || "" });
    setConfirmation(confirmationDraft(order));
    setConfirmFiles([]);
    setDirty(false);
    setSaveState("idle");
    setEditMode(false);
  }

  async function review(action) {
    if (action === "approve") {
      /* ⚠️ การกดครั้งนี้ทำ 4 อย่างพร้อมกัน ไม่ใช่แค่ปั๊มสถานะ — เดิมโมดัลบอกแต่ยอด Actual
         ทั้งที่ตอนเพิ่ม mig 0245/0250 มันเริ่มสร้างงวดชำระและส่งใบเข้าคิวบัญชีไปด้วย */
      setConfirmState({
        ...approvalPrompt({
          title: "อนุมัติ ใบสั่งขาย",
          subject: `ใบสั่งขาย ${order.orderNumber}`,
          effects: [
            `ยอด Actual ${fmtMoney(order.actualAmount)} เข้าดีลทันที`,
            "สร้างงวดชำระตามแผนการชำระที่ระบุไว้ใน QT",
            "เปิดขั้นของบัญชีบนใบนี้ — บัญชีปิดใบได้เมื่อเก็บเงินครบทุกงวด",
            "ตรึงลายเซ็นและสำเนาเอกสารฉบับที่อนุมัติ",
          ],
          confirmLabel: "อนุมัติและนับ Actual",
        }),
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
    const res = await apiFetch(url, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); setError(data.error || "ลบใบสั่งขายไม่สำเร็จ"); return false; }
    router.push("/sa/sales-orders");
    return true;
  }

  function remove() {
    setConfirmState({
      title: "ลบใบสั่งขายฉบับร่าง",
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
    const preview = await apiFetch(`/api/sales-planning/sales-orders/${id}?dryRun=1`, { method: "DELETE" })
      .then((r) => r.json()).catch(() => null);
    setBusy("");
    if (!preview) { setError("ขอพรีวิวการลบไม่สำเร็จ"); return; }
    const lines = (preview.cascade || []).map((c) => `· ${c.label}: ${c.count}`).join("\n");
    const notes = (preview.notes || []).join("\n");
    setConfirmState({
      title: "บังคับลบใบสั่งขายพร้อมหลักฐาน",
      description: `ต้องการบังคับลบ ${order.orderNumber} ถาวรหรือไม่`,
      detail: <span className="pre-line">สิ่งที่จะถูกทำลาย:{"\n"}{lines || "· (ไม่มีข้อมูลพ่วง)"}{notes ? `\n\n${notes}` : ""}</span>,
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
  const paymentSummary = useMemo(
    () => paymentRollup(installments, todayIso),
    [installments, todayIso],
  );

  if (!order) {
    return <Workspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย" back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }} loading={!error}>{error && <div className="glass-panel" style={{ padding: 14, color: "var(--red)" }}>{error}</div>}</Workspace>;
  }

  const approved = order.status === "approved";
  // แบ่งแยกหน้าที่: ผู้ตรวจสอบที่เป็นผู้สร้าง/ผู้ยื่น SO เอง อนุมัติ/ตีกลับใบนี้ไม่ได้
  const ownSalesOrder = isSalesOrderSelfApproval(order, order.meId);
  const canReviewThis = reviewer && !ownSalesOrder;
  const canAdminOverride = role === "admin" && ownSalesOrder && order.status === "pending_approval";
  const canEditDocument = canEdit && ["draft", "rejected"].includes(order.status);
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
  const workflowSteps = workflowStepsFromIndex(workflow, workflowIndexResolved, order.status === "cancelled");
  // เอกสารยืนยันที่ใบนี้มีจริง (ของใบเอง ถ้าไม่มีถอยไปดูหลักฐาน Won ของใบเสนอราคา)
  const confirmationOnFile = orderConfirmationOf(order, order.quotation);
  /* 🐞 ปุ่มเปิดไฟล์ต้องเลือก proxy ตาม **บ้านที่ไฟล์อยู่จริง** ไม่ใช่ยิง confirm-file ตายตัว —
     ใบเก่ายังไม่ได้บันทึกทับ ไฟล์ยังอยู่ที่ใบเสนอราคา ⇒ confirm-file อ่าน
     `order.confirmAttachments` ที่ว่างแล้วตอบ "ไม่พบไฟล์แนบ" · แผงงวดชำระเลือกถูกอยู่แล้ว
     (SalesOrderPaymentPanel) แต่หน้านี้เขียนไว้อีกชุด — ยกมาเป็นตัวเดียว */
  const confirmFileHref = (index) => (confirmationOnFile?.source === "order"
    ? `/api/sales-planning/sales-orders/${order.id}/confirm-file?i=${index}`
    : `/api/sales-planning/quotations/${order.quotationId}/file?i=${index}`);
  const confirmationGate = ["draft", "rejected"].includes(order.status)
    ? salesOrderConfirmationGate(order, order.quotation)
    : null;
  /* ⚠️ ต้องส่ง `installments` เข้าด่านเสมอ (มติ 2026-08-30) — ด่านปิดใบตัดสินจาก
     "เก็บครบทุกงวดหรือยัง" ไม่ส่ง = ด่านปฏิเสธ ⇒ ปุ่มบนจอกับ API พูดตรงกันเสมอ */
  /* ใบนี้มีรอบบริการไหม — เกณฑ์เดียวกับทุกที่ในระบบ (ดีลสาย SERVICE + บรรทัด 02-001) */
  const hasServiceRounds = orderHasServiceRounds(order, order.lines, { project: order.project });

  const setServiceContract = async (contractId) => {
    await requestAction("set_service_contract", { contractId: contractId || null });
  };

  const financeGate = (action, options) => financeActionError(
    order, action, { id: order.meId, role, department: order.meDepartment },
    { ...options, installments },
  );
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
    : canReviewThis && order.status === "pending_approval"
      ? { id: "approve", kind: "approve", label: "อนุมัติและนับ Actual", onClick: () => review("approve") }
    // สถานะกลางหลังย้อนการอนุมัติ: ออก Rev. เป็นทางเดียวที่เดินต่อได้ จึงเป็นปุ่มหลัก
    : canRevise
      ? { id: "revise", kind: "revise", label: "ออก Rev.", onClick: () => setConfirmState({
          title: "ออก Rev. ใหม่",
          description: `ระบบจะสร้างร่าง Rev. ใหม่จาก ${order.orderNumber} และเก็บฉบับนี้เป็นประวัติ`,
          /* ⭐ ชี้ทางตั้งแต่ก่อนกด (มติผู้ใช้ 2026-08-18) — Rev. ของใบสั่งขาย **คัดลอก
             รายการมาทั้งดุ้น** (`revise_approved_sales_order_atomic` INSERT ... SELECT
             จากบรรทัดใบเดิม) และหน้า SO ไม่มีที่ให้แก้ `qty`/ราคาเลยสักจุด
             ⇒ คนที่กดเพราะคิดว่าจะแก้จำนวนได้ จะไปเจอใบใหม่ที่แก้อะไรไม่ได้
             ยอดต้องแก้ที่ต้นทางคือใบเสนอราคา (บรรทัด SO ผูก `quotationLineId` ไว้) */
          detail: [
            "รายการและยอดจะถูกคัดลอกมาทั้งหมด — แก้จำนวน/ราคาในฉบับ Rev. ไม่ได้",
            "ถ้าต้องแก้ยอด ให้ออก Rev. ที่ใบเสนอราคาแล้วออกใบสั่งขายใหม่แทน",
            order.revisionReason ? `เหตุผลที่บันทึกไว้ตอนย้อนการอนุมัติ: ${order.revisionReason}` : null,
          ].filter(Boolean).join(" · "),
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
         ก็ไม่ได้ (ทั้งสองทาง API ตอบ "บัญชีอนุมัติใบนี้ไปแล้ว") ⇒ ต้องบอกว่าย้อนไม่ได้ */
      onClick: () => setConfirmState({
        ...approvalPrompt({
          title: "ปิดใบสั่งขาย",
          subject: `ใบสั่งขาย ${order.orderNumber}`,
          irreversible: true,
          checklist: FINANCE_REVIEW_POINTS,
          effects: [
            "ลงลายเซ็นของคุณในช่อง “ฝ่ายบัญชี” บนเอกสาร แล้วออกเอกสารฉบับใหม่ทับ",
            "**ปิดใบสั่งขายใบนี้** — เป็นขั้นสุดท้ายของใบ ไม่มีการตีกลับหลังจากนี้",
            "ยอด Actual ไม่เปลี่ยนจากการกดนี้ (ยอดเข้าตั้งแต่ AE Supervisor อนุมัติ)",
          ],
          confirmLabel: "ยืนยันปิดใบ",
        }),
        action: () => requestAction("finance_approve"),
      }),
    },
  ];
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
      visible: canCancelSalesOrder(order, { reviewer, canEdit }),
      disabled: !!filingState.filing,
      disabledReason: filingState.filing ? "มีใบยื่นสรรพสามิตแล้ว ต้องจัดการใบยื่นก่อน" : undefined,
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
          badges={<><SalesStateBadge label={status.label} color={status.color} />{order.signatureEvidenceId && <span className="ui-badge" style={{ color: "var(--green)" }}>มีหลักฐานลายเซ็น</span>}{order.approvalMode === "admin_override" && <span className="ui-badge ui-badge-warn">Admin Override</span>}{financeStatus && <StatusBadge size="sm" tone={FINANCE_STATUS_TONES[financeStatus]} label={FINANCE_STATUS_LABELS[financeStatus]} />}</>}
          facts={[
            { icon: CalendarDays, label: "วันที่ SO", value: fmtDate(order.orderDate) },
            // กำหนดชำระขึ้นแถบหัวแทน "Actual ในระบบ" ที่พูดซ้ำกับการ์ดสรุปฝั่งขวา
            // (ที่นั่นมี "Actual ก่อน VAT" พร้อมสถานะ "ยังไม่นับ" อยู่แล้ว) — วันครบกำหนด
            // เป็นสิ่งที่คนเปิดใบอยากรู้ทันทีมากกว่า
            { icon: CalendarDays, label: "กำหนดชำระ", value: fmtDate(order.paymentDueDate) },
            { icon: FileText, label: "อ้างอิง QT", value: naText(order.quotation?.quoteNumber) },
            { icon: CircleDollarSign, label: "ยอดก่อน VAT", value: fmtMoney(order.actualAmount) },
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
          <ContextCard icon={FileText} href={`/sa/quotations/${order.quotationId}`} eyebrow="ใบเสนอราคา Won" title={naText(order.quotation?.quoteNumber)} subtitle={`วันที่หลักฐาน ${fmtDate(order.quotation?.wonDocDate)}`} facts={[{ label: "ไฟล์หลักฐาน", value: `${order.quotation?.wonAttachments?.length || 0} ไฟล์` }]} />
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
                { id: "actual", label: "Actual ก่อน VAT", value: approved ? fmtMoney(order.actualAmount) : "ยังไม่นับ" },
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
              evidence={(
                <SignatureReadyNotice
                  active={(canReviewThis && order.status === "pending_approval") || canAdminOverride || editable}
                  docLabel="ใบสั่งขายนี้"
                />
              )}
            />


            {/* 🪤 การ์ด "การยื่นชำระสรรพสามิต" ถอดออกแล้ว (มติผู้ใช้ 2026-08-17) —
                ทั้งสถานะ ยอดเรียกเก็บ ปุ่มสร้าง และลิงก์เปิดใบยื่น ย้ายขึ้นไปเป็นช่วงบนเส้นเดินงาน
                ⚠️ อย่าเอากลับมา จะกลายเป็นสองที่ที่ตอบคำถามเดียวกันแล้วเพี้ยนหากัน */}
          </>}
        >
          <DetailCard icon={Package} eyebrow="ORDER LINES" title="รายการสินค้าและบริการ" meta={`${sortedLines.length} รายการ · snapshot จาก QT Won`} actions={<Link href={`/sa/quotations/${order.quotationId}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด QT ต้นทาง</Link>}>
            <QuotationReadOnlyLineItems
              lines={sortedLines}
              summaryRows={[
                { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(order.subtotal) },
                discountRow,
                { id: "vat", label: "VAT", value: fmtMoney(order.vatAmount) },
              ]}
              grandTotal={fmtMoney(order.totalAmount)}
              highlightRows={[{ id: "actual", label: "Actual ก่อน VAT", value: fmtMoney(order.actualAmount), tone: "success" }]}
            />
          </DetailCard>

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
              ⚠️ ใบเก่าที่หลักฐานอยู่ที่ใบเสนอราคา อ่านจากที่นั่น + บอกว่ามาจากไหน */}
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

          {/* ⭐ การ์ดสัญญาบริการ (mig 0324) — ขึ้นเฉพาะใบที่มีรอบบริการ
              (ดีลสาย SERVICE **และ** มีบรรทัดหมวด 02-001 อย่างน้อย 1 รายการ ⇒ ทั้งใบ)
              ⚠️ วางเหนือการ์ดการชำระโดยตั้งใจ — สัญญามาก่อนเงิน ทั้งในลำดับงานจริง
                 และในด่าน "จ่ายก่อนบริการ" ที่อ่านทั้งสองอย่างประกอบกัน */}
          {hasServiceRounds && (
            <ServiceContractCard
              order={order}
              canEdit={canEdit}
              busy={!!busy}
              onLink={setServiceContract}
            />
          )}

          {/* ⭐ การ์ด "การชำระ" (mig 0245/0246) — หลักฐานปิดการขายอยู่หัว งวดอยู่ล่าง
              ⚠️ **ยอด Actual ไม่เกี่ยวกับการ์ดนี้** — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ
              ต่อให้แบ่งจ่ายกี่งวด (ยืนยันกับผู้ใช้ 2026-08-13) */}
          <SalesOrderPaymentPanel
            order={order}
            installments={installments}
            user={{ id: order.meId, role }}
            todayIso={todayIso}
            canStart={canEdit}
            busy={busy}
            onStart={startPaymentTracking}
            onAction={runInstallmentAction}
            /* 🐞 แถบ error ของหน้าอยู่บนสุดของคอลัมน์ ⇒ **โมดัลบังไว้หมด** — กดบันทึก
               งวดแล้วโมดัลค้างเงียบ ไม่มีอะไรบอกว่าทำไมไม่ผ่าน (ผู้ใช้แจ้ง 2026-08-27)
               อาการเดียวกับที่ `ReasonDialog.submitError` แก้ไว้เมื่อ 2026-08-19 —
               รอบนี้ยกให้ครบทุกโมดัลของแผงนี้ ⇒ ส่งข้อความเข้าไปในโมดัลด้วย */
            error={error}
            onClearError={() => setError("")}
          />

          {/* ข้อมูลควบคุม + ประวัติฉบับแก้ไข — ข้อมูล "เย็น" ที่ไม่ใช่คำถามแรกของใคร
              จึงอยู่ท้ายคอลัมน์ ของเดิมอยู่กลางรางขวาที่ระยะ 2537px */}
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
        detail={{
          revoke: `ยอด Actual ${fmtMoney(order.actualAmount)} จะถูกนำออกจนกว่า Rev. ใหม่จะอนุมัติ · เหตุผลนี้จะใช้ต่อในขั้นออก Rev. ไม่ต้องกรอกซ้ำ`,
        }[workflowForm?.action] || "หลักฐานการยื่นเดิมยังคงอยู่ในประวัติ หลังแก้ไขต้องยื่นและลงนามใหม่"}
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
        <Modal open onClose={() => setCancelForm(null)} title="ยกเลิก ใบสั่งขาย" size="sm" dismissible={!busy}>
          <div className="p-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--text-2)", margin: 0 }}>หากอนุมัติแล้ว ยอด Actual จะถูกนำออกทันที — เลือกเหตุผลที่ยกเลิก</p>
            <label style={{ display: "block", fontSize: "var(--fs-7)" }}>
              <span style={{ color: "var(--text-2)" }}>เหตุผล</span>
              <Select value={cancelForm.code} onChange={(e) => setCancelForm((f) => ({ ...f, code: e.target.value }))}>
                <option value="">— เลือกเหตุผล —</option>
                {SALES_ORDER_CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </Select>
            </label>
            <label style={{ display: "block", fontSize: "var(--fs-7)" }}>
              <span style={{ color: "var(--text-2)" }}>หมายเหตุ {cancelForm.code === "other" ? "(บังคับ)" : "(ไม่บังคับ)"}</span>
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

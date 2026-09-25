"use client";
import { Fragment, useState } from "react";
import {
  ArrowRightLeft, CalendarClock, CalendarRange, FileText, HandCoins, Link2, Paperclip, Receipt, Undo2, Unlink, Wallet, XCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import GatedAction from "@/components/ui/GatedAction";
import Textarea from "@/components/ui/Textarea";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDate, fmtMoney, fmtPercent, naText, NA } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import InstallmentConfirmDialog, { installmentConfirmPrompt } from "./InstallmentConfirmDialog";
import TaxInvoiceDialog from "./TaxInvoiceDialog";
import InstallmentRefundDialog from "./InstallmentRefundDialog";
import QuotationInstallments from "./QuotationInstallments";
import { paymentCarryPrompt, paymentPlanEditPrompt, paymentRefundClearPrompt } from "@/lib/approvalPrompt";
import {
  CARRY_BUTTON, applyCarryIn, carriedAwayGroups, carriedFromOf, carryBlocker, carryExpected, carryPromptFacts,
} from "@/lib/sales/installmentCarry";
import {
  REPLANNED_BADGE, REPLANNED_BADGE_TITLE, REPLAN_MAX_REASON, REPLAN_STALE_MESSAGE, buildReplanRows,
  installmentReplanBlocker, installmentsReplanned, replanDraftFrom, replanExpected, replanPromptFacts,
  replanReasonError, replanRequestRows, replanStale,
} from "@/lib/sales/installmentReplan";
import { CONFIRM_DOC_TYPE_LABELS, orderConfirmationOf } from "@/lib/sales/orderConfirmationDocs";
import {
  INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES, MIN_REJECT_REASON,
  installmentActionError, installmentConfirmOutlook, installmentDisplayStatus, installmentPlanDrift,
  installmentPrepaid, installmentRefunded, installmentReportOutcome, installmentStartBlock, installmentUnconfirmOutcome,
  installmentVoid, installmentVoidNote, openingCoverageEnd, paymentNotRequired, paymentRollup, pipelineInstallmentLock, previewInstallments,
  revisedInstallmentsNote, strandedInstallment,
} from "@/lib/sales/salesOrderPayments";
import { coverageRollup, coverageWarnings } from "@/lib/sales/paymentCoverage";
import { orderHasServiceRounds, orderOnServiceLine } from "@/lib/sales/serviceOrders";
import { HISTORICAL_APPROVER_LABEL, historicalInstallmentLock, isHistoricalOrder, isOpeningInstallment } from "@/lib/sales/historicalOrders";
import { historicalOpeningRejectNote } from "@/lib/sales/historicalOrderCopy";
import { openingInvoiceNote } from "@/lib/sales/taxInvoice";
import styles from "./SalesOrderPaymentPanel.module.css";

/* ค่าหลอกให้ด่าน `refund` ตรวจเฉพาะ "ใคร/งวดไหน/ใบไหน" (เมนูแถว) — ค่าจริงตรวจในโมดัลด้วย refundValueError ตัวเดียวกับ API
   ⚠️ เลขใบลดหนี้หลอกไว้ด้วย ไม่งั้นงวดที่มีใบกำกับจะไม่มีเมนูให้เปิดโมดัลไปกรอกเลขนั้น (ทางตัน) */
const REFUND_PROBE = Object.freeze({ refundedOn: "2026-01-01", reason: "x".repeat(MIN_REJECT_REASON), creditNoteNo: "x" });

/* การ์ด "การชำระ" ของใบสั่งขาย (mig 0245/0246) — **แบบ ข** (มติผู้ใช้ 2026-08-13)
   เทียบสามแบบไว้ที่ `docs/so-payment-panel-options-mockup.html`
   หลักฐานปิดการขายอยู่หัว · แถบสัดส่วนเงิน · ตารางแน่นที่เทียบข้ามงวดได้ด้วยตากวาดคอลัมน์

   ⭐ **แก้ข้อแลกของแบบ ข ที่รู้ตั้งแต่ตอนเทียบ** — mockup วางปุ่มไว้ในเมนู `⋯`
   ซึ่งแปลว่าคลิกเพิ่มหนึ่งครั้งทุกครั้งที่จะแจ้ง/คอนเฟิร์ม และแถวเดียวใส่หลักฐาน+
   เหตุผลตีกลับไม่ลง ⇒ ที่นี่ใช้ **แถวขยาย** แทน: งวดที่ต้องลงมือกางเองอัตโนมัติ
   ที่เหลือกดกางได้ · ได้ความแน่นของตารางโดยไม่ต้องซ่อนปุ่มไว้ในเมนู

   ⚠️ **หลักฐาน Won ≠ หลักฐานการชำระ** — PO ที่ลงนามแล้วคือหลักฐานว่า *สั่งซื้อ*
   ⚠️ ยอด Actual ไม่เกี่ยวกับการ์ดนี้ — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ
   ⚠️ ยอด "เก็บแล้ว" นับเฉพาะที่บัญชีคอนเฟิร์ม — `reported` ไม่นับ */
export default function SalesOrderPaymentPanel({
  order, installments, user, todayIso, canStart, busy, onStart, onAction, onReplan, onCarry,
  error = "", onClearError,
}) {
  const [reportFor, setReportFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [unconfirmFor, setUnconfirmFor] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  // ใบกำกับภาษีของงวด (mig 0348) — โมดัลตัวเดียวกับที่ทะเบียนการชำระของบัญชีใช้
  const [invoiceFor, setInvoiceFor] = useState(null);
  /* ⭐ ร่างช่วงครอบที่ยังไม่บันทึก (มติผู้ใช้ 2026-08-30 รอบสอง — แก้ในตารางแทนโมดัล)
     ⚠️ **ไม่ auto-save** ตามกฎฟอร์มของ repo — พิมพ์ลงร่างก่อน แล้วกดปุ่มบันทึกรวมทีเดียว
     ท่าเดียวกับตารางไทม์ไลน์ของดีล (`DealTimelineTable`: drafts → saveDrafts) */
  const [coverDrafts, setCoverDrafts] = useState({});
  const [savingCover, setSavingCover] = useState(false);
  /* ⭐ ตัวปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377) — `base` = งวดที่ตาเห็นตอนเปิด (ตัวล็อกข้อมูลเก่า = expected ของ RPC)
     · `draft` = แถวเปิดในตัวแก้ · `unit` = บาท/% · `confirming` = โมดัลยืนยันเปิดอยู่ (กัน Escape ปิดสองชั้น) */
  const [replan, setReplan] = useState(null);
  /* ⭐ ยกเงินจากใบที่ยกเลิก (PR3 · mig 0378) — `base` = งวดของใบนี้ที่ตาเห็นตอนเปิด · `sources` = ต้นทางที่ตาเห็นตอนเปิด
     (ตัวล็อกข้อมูลเก่า = expected ของ RPC) · `sourceId` + `ids` = ใบ/งวดที่เลือกยก */
  const [carry, setCarry] = useState(null);
  // บันทึกคืนเงินของงวดใบที่ยกเลิก (PR3) — โมดัลตัวเดียวกับคิวเงินค้างบนทะเบียนการชำระ
  const [refundFor, setRefundFor] = useState(null);

  /* ⭐ **ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374)** — งวดมาจากฟอร์มคีย์ใบทั้งชุด (งวดยกมา + ที่ยังต้องเก็บ)
     ไม่มีใบเสนอราคาให้คำนวณแผน ⇒ ไม่มี preview · ไม่มี "แผนเปลี่ยน" · ไม่มีปุ่มเริ่มติดตาม
     ⚠️ ต่อ preview ให้ใบนี้เมื่อไร `paymentScheduleRows(null)` คืน "ชำระเต็มจำนวน 100%" ปลอมหนึ่งแถว
     · ล็อกทั้งใบ (`historicalInstallmentLock`) = ตัวเดียวกับที่ route PATCH ใช้ ⇒ ปุ่มกับ API ตอบคำเดียวกัน */
  const historical = isHistoricalOrder(order);
  const orderLock = historicalInstallmentLock(order);
  /* ⭐ ล็อกทั้งใบของใบ pipeline (PR0 · แผน so-payment-unlock-replan) — ถามระดับใบ (ไม่ส่งคำสั่ง) เพื่อบอกเหตุที่ปุ่มหาย
     · ตัวตัดสินรายคำสั่งอยู่ใน `gate` (ตัวเดียวกับ route PATCH) ⇒ ข้อความบนแผงกับคำตอบของ API เป็นประโยคเดียวกัน */
  const pipelineLock = pipelineInstallmentLock(order);
  const saved = Array.isArray(installments) ? installments : [];
  /* ⭐ แถวล่าสุดของตาราง — โมดัลจำแถวไว้ตอนเปิด แต่ต้อง **วาดและส่งแถวล่าสุด** เสมอ (PR0 · optimistic lock)
     PATCH งวดส่ง `updatedAt` ของแถวที่ตาเห็น ⇒ ได้ 409 แล้วหน้าดึงข้อมูลสดมา โมดัลต้องวาดของสดและส่งตัวล็อกใหม่
     ไม่งั้นกดใหม่ในโมดัลเดิม = 409 ซ้ำไม่รู้จบ (ส่ง updatedAt เก่าของสำเนาเดิมทุกรอบ) */
  const live = (row) => (row ? saved.find((r) => r.id === row.id) || row : row);
  /* ⭐ ใบที่ถูกออก Rev. ทับ (PR1 · mig 0376) — งวด **ย้ายไปใบ Rev. ทั้งแถว** ⇒ ใบนี้เหลือ 0 แถว
     ต้องบอกว่าเงินไปอยู่ใบไหน · ห้ามถอยไปวาดแผนจาก QT (อ่านเหมือน "ยังไม่เริ่มติดตาม" ทั้งที่รับเงินไปแล้ว)
     ⚠️ ขึ้นเฉพาะตอนไม่มีแถวจริง — ใบ revised ที่ยังถือแถว (ออก Rev. ก่อน 0376) ใช้ข้อความล็อกของ PR0 ตามเดิม */
  const movedAway = saved.length ? null : revisedInstallmentsNote(order);
  /* ⭐ ใบ pipeline ที่ยกเลิก (review UI-4) — ไม่มีงวด (ยกเงินออกไปหมดแล้ว · ไม่เคยมีงวด) = ห้ามถอยไปวาดแผนจาก QT
     (คลาสเดียวกับใบ revised ข้างบน: แถว "ยังไม่เริ่มติดตาม" ปลอมใต้ลิงก์ "ยกไป {SO}") */
  const cancelledPipeline = !historical && order?.status === "cancelled";
  /* ใบที่ตายแล้ว (ยกเลิก/ถูกออก Rev. ทับ) — แถบ "เก็บแล้ว/ทั้งใบ" กับประกาศ "จ่ายถึง" ของนัดบริการเป็นเรื่องของใบที่ยังเดินอยู่
     (UAT 23/09: ใบยกเลิกขึ้น "ทั้งใบ ฿0.00" ข้างยอดใบ ฿250,380 และเตือนว่านัดบริการลงคิวไม่ได้) ⇒ หัวการ์ดบอกเงินค้างแทนแล้ว */
  const deadPipeline = cancelledPipeline || (!historical && order?.status === "revised");
  const rows = saved.length
    ? saved
    : (historical || movedAway || cancelledPipeline ? [] : previewInstallments(order?.quotation?.paymentPlan, order?.totalAmount));
  const isPreview = !saved.length;
  const single = rows.length === 1;
  /* ⭐ ยอด/เตือนนับจากงวดที่ไม่โมฆะ (review UI-3) — งวดที่ยังไม่ชำระของใบยกเลิก/ถูกแทน = โมฆะ (installmentVoid ตัวเดียวกับทะเบียนบัญชี)
     🐞 เดิมใบที่ยกเลิกขึ้น "ค้างรับ ฿… · เลยกำหนด n งวด" ทั้งที่โมดัลยกเลิกสัญญาว่า "หลุดจากยอดค้างรับทันที" และทะเบียนตัดทิ้งแล้ว */
  const liveRows = saved.filter((r) => !installmentVoid(r, order));
  const rollup = paymentRollup(liveRows, todayIso);
  /* ⭐ **งวดร่าง** (B-4) — มีตัวตนจริง กรอกกำหนดชำระได้ และ **บันทึกเงินที่ลูกค้าจ่าย
     มาแล้วได้** (มติผู้ใช้ 2026-08-19) ⇒ สิ่งเดียวที่ยังทำไม่ได้คือส่งให้บัญชีตรวจ
     เพราะงานถึงบัญชีต่อเมื่อ AE Supervisor อนุมัติใบแล้วเท่านั้น
     ⚠️ ต่างจาก `isPreview` ซึ่งคือ "ยังไม่มีแถวเลย" — สองสถานะนี้หน้าตาใกล้กันมาก
     แต่กดได้คนละอย่าง จึงต้องแยกชื่อให้ชัดตั้งแต่ตัวแปร */
  const draftRows = saved.filter((r) => !r.frozenAt);
  const isDraftPlan = saved.length > 0 && draftRows.length === saved.length;
  const drift = historical ? null : installmentPlanDrift(saved, order?.quotation?.paymentPlan, order?.totalAmount);
  // มีเงินบันทึกไว้แล้ว = freeze จะไม่ตั้งงวดใหม่ทับ (ดู `freezeInstallments`) ⇒ คำเตือนคนละใจความ
  const hasPrepaid = saved.some(installmentPrepaid);
  // ใบที่ยกเลิก/ตีกลับ/ถูกออก Rev. ทับไม่มีอะไรให้ติดตาม — ด่านเดียวกับที่ route POST ของงวดใช้
  const canTrackPayments = !installmentStartBlock(order);

  /* ── คำร้องขอเอกสารการเงินของใบเสนอราคาเดียวกัน (B-5) ────────────────────
     ⚠️ **ไม่จับคู่ให้อัตโนมัติ** — คำร้องเกิดตั้งแต่ตอนมีแค่ QT ส่วนงวดเกิดจาก SO
     เดาจาก % ที่ใกล้เคียงเมื่อไร ใบวางบิลจะไปแขวนผิดงวดโดยไม่มีใครรู้ (ม-ค) */
  const billingRequests = Array.isArray(order?.billingRequests) ? order.billingRequests : [];
  const requestById = new Map(billingRequests.map((r) => [r.id, r]));
  const linkedIds = new Set(saved.map((r) => r.billingRequestId).filter(Boolean));
  const linkableRequests = billingRequests.filter((r) => !linkedIds.has(r.id));
  /* ลิงก์เปิดคำร้องใหม่แบบเติมค่าให้แล้ว — ⚠️ **เติมค่าไม่ใช่ปลดด่าน** ฟอร์มกับ POST
     ยังตรวจครบทุกข้อ (ใบต้องอนุมัติแล้ว · ยอดต้องไม่เกินใบ) เหมือนเปิดเองจาก /requests */
  const newBillingRequestHref = (row) => {
    const params = new URLSearchParams({
      kind: "billing_doc",
      quotationId: order?.quotationId || "",
      salesOrderId: order?.id || "",
      billAmount: String(row?.amount ?? ""),
      returnTo: `/sales-planning/sales-orders/${order?.id || ""}`,
    });
    return `/requests/new?${params.toString()}`;
  };

  const quotation = order?.quotation;
  /* เอกสารยืนยันคำสั่งซื้อของใบ — ใบใหม่ถืออยู่ที่ตัวเอง (mig 0285) ใบเก่าอยู่ที่
     ใบเสนอราคาต้นทาง ⇒ อ่านสองบ้านผ่านตัวเดียว แล้วเลือก proxy ไฟล์ตามแหล่งที่ได้มา */
  const confirmation = orderConfirmationOf(order, quotation);
  const confirmFiles = confirmation?.attachments || [];
  const confirmFileHref = (index) => (confirmation?.source === "order"
    ? `/api/sales-planning/sales-orders/${order.id}/confirm-file?i=${index}`
    : `/api/sales-planning/quotations/${order.quotationId}/file?i=${index}`);
  // ⚠️ ส่ง `rows` เข้าไปด้วยเสมอ — ด่าน "งวดต้องไล่ลำดับ" (2026-08-18) ต้องเห็นงวดอื่น
  // ไม่ส่ง = ปุ่มบนจอจะเปิดให้กดงวดที่ API จะตีกลับ
  /* ⚠️ ประกาศ **ก่อน** `gate` โดยตั้งใจ — `gate` อ่านค่านี้ ถ้าวันหนึ่งมีใครเรียก
     `gate()` ระหว่างสองบรรทัด จะได้ ReferenceError จาก TDZ แทนที่จะเงียบ */
  const hasServiceRounds = orderHasServiceRounds(order, order?.lines);
  /* 🔑 **โชว์ช่องกว้างกว่าด่านเงิน โดยตั้งใจ** — ใบบนเส้นบริการที่บรรทัดยังไม่มีรหัส FG
     (บรรทัด "พิมพ์เอง" ของใบเสนอราคา) ต้องกรอกช่วงครอบได้ ไม่งั้น "จ่ายถึง" ว่างตลอดกาล
     ⚠️ **ห้ามเอาตัวนี้ไปแทน `hasServiceRounds` ที่ `gate`** — นั่นคือด่านที่บล็อกการรับรอง
       เปลี่ยนเมื่อไร ใบจริง 22 ใบรับรองงวดไม่ได้ทันที (หยุดรับเงิน) */
  const showCoverage = orderOnServiceLine(order);

  /* ⚠️ `serviceRounds` ต้องส่งเสมอ — ด่านรับรองงวดใช้ตัดสินว่าต้องมีช่วงครอบก่อนไหม
     (ไม่ส่ง = ไม่บล็อก ⇒ ใบบริการจะรับรองได้ทั้งที่ช่วงครอบว่าง ซึ่งคือกับดักเดิม) */
  /* ⚠️ `orderLock` + `historical` ต้องส่งทุกครั้งเหมือน route — ล็อกทั้งใบชนะทุกคำสั่ง · งวดยกมาไม่มีกำหนดชำระ/
     ถอนไม่ได้ · ช่วงครอบของใบย้อนหลังแก้ได้เฉพาะบัญชี ⇒ เมนู/ช่องที่ทำไม่ได้หายเองผ่านตัวนี้ตัวเดียว
     ⭐ `contractEnd` = ปลายช่วงที่งวดยกมาครอบได้ — ด่านใช้กันไม่ให้บัญชีเลื่อนปลายช่วงเลยอายุสัญญา
       ⇒ "จ่ายถึง" ไม่เปิดให้รอบที่ไม่มีใครจ่าย
       🔴 **คิดด้วย `openingCoverageEnd` เท่านั้น ห้ามอ่าน `serviceContract.expiryDate` เองที่นี่** —
         route ของงวดเรียกตัวเดียวกันนี้ด้วยสัญญาที่มันโหลดมา ⇒ ปุ่มกับ API ได้วันเดียวกันเสมอ
         (เขียนสูตรเองที่จอเมื่อไร = แถบบันทึกเงียบ แล้ว API ตีกลับด้วยวันคนละวัน — review 23/09) */
  const contractEnd = openingCoverageEnd(order, rows);
  /* ⭐ `orderLock` ต่อด้วยล็อกของใบ pipeline รายคำสั่ง (PR0) — รูปเดียวกับ route PATCH:
     `historicalInstallmentLock(order) || pipelineInstallmentLock(order, action)` */
  const gate = (row, action, options) => installmentActionError(row, action, user, {
    ...options, rows, orderTotal: order?.totalAmount, serviceRounds: hasServiceRounds,
    orderLock: orderLock || pipelineInstallmentLock(order, action), historical, contractEnd,
    /* PR3 (mig 0378): คืนเงินได้เฉพาะงวดของใบ pipeline ที่ยกเลิก — ค่าเดียวกับที่ route PATCH ส่ง */
    orderCancelled: order?.status === "cancelled" && !historical,
  });
  /* ── ปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D1/D5) ──────────
     ⭐ ปุ่มกับ route ถามด่านตัวเดียวกัน (`installmentReplanBlocker`) — ไม่ใช่ AE Sup/admin · ใบย้อนหลัง · ใบที่ไม่ใช่
       approved = ไม่มีปุ่ม · บัญชีปิดใบ/ยังไม่มีงวด/ทุกงวดล็อก = ปุ่มอยู่ กดแล้วบอกเหตุ (GatedAction)
     ⭐ พรีวิว/ยอดวิ่ง/ข้อผิดพลาดมาจาก `buildReplanRows` ตัวเดียวกับที่ route ใช้สร้างชุดสุดท้าย ⇒ จอกับ API ตัดสินคำเดียวกัน
     ⭐ ป้าย "ปรับแผนหลังอนุมัติ" (D5): งวดจริงต่างจากแผนของ QT — ฉบับพิมพ์ยังแสดงแผน QT จึงต้องเห็นว่าไม่ตรงกัน
       ⚠️ เฉพาะชุดที่ตรึงยอดครบ (งวดร่างเดินตาม QT สด ๆ อยู่แล้ว) · ใบย้อนหลังไม่มี QT */
  const replanGate = installmentReplanBlocker(order, saved, user);
  const replanned = !historical && saved.length > 0 && saved.every((r) => r.frozenAt)
    && installmentsReplanned(saved, order?.quotation?.paymentPlan, order?.totalAmount);
  const replanBuild = replan ? buildReplanRows(order, replan.base, replan.draft, {
    unit: replan.unit, serviceRounds: hasServiceRounds, requestById,
  }) : null;
  /* หลัง 409 หน้าโหลดงวดใหม่มา — แผนที่แก้ค้างอยู่อิง `base` เดิม ⇒ บอกตรง ๆ และให้เริ่มใหม่จากงวดล่าสุด
     (ห้ามแอบเปลี่ยน expected เป็นของใหม่ใต้มือคนกด — เท่ากับยืนยันแผนที่ตัดสินจากข้อมูลเก่า) */
  const replanBaseStale = replan ? replanStale(saved, replanExpected(replan.base)) : false;
  const replanReasonProblem = replan ? replanReasonError(replan.reason) : null;
  const openReplan = () => {
    onClearError?.();
    setReplan({ base: saved, draft: replanDraftFrom(saved, { requestById }), unit: "amount", reason: "", confirming: false });
  };
  const resetReplan = () => {
    onClearError?.();
    setReplan((current) => (current
      ? { ...current, base: saved, draft: replanDraftFrom(saved, { requestById }), unit: "amount" }
      : current));
  };
  const patchReplan = (patch) => setReplan((current) => (current ? { ...current, ...patch } : current));
  /* ⭐ โมดัลยืนยันบอกผลที่ตรวจได้ (approvalPrompt · กติกา #1223): รายงวดก่อน→หลัง · งวดล็อกไม่ถูกแตะ · Actual ไม่เปลี่ยน
     (ยอด + เดือนไทย) · ฉบับพิมพ์ยังแสดงแผน QT (D5) — แล้วจึงยิง · body เป็นบาทเสมอ (route สร้างชุดเดิมซ้ำ) */
  const submitReplan = async () => {
    if (!replan || !replanBuild || replanBuild.error || replanReasonProblem || replanBaseStale) return;
    patchReplan({ confirming: true });
    const confirmed = await confirmAction(paymentPlanEditPrompt(replanPromptFacts(order, replan.base, replanBuild.rows, {
      serviceRounds: hasServiceRounds,
    })));
    patchReplan({ confirming: false });
    if (!confirmed) return;
    const done = await onReplan({
      rows: replanRequestRows(replanBuild), expected: replanExpected(replan.base), reason: replan.reason.trim(),
    });
    if (done) setReplan(null);
  };
  /* ── ยกเงินจากใบที่ยกเลิก (PR3 · mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ─────────────────
     ⭐ ต้นทาง = ใบที่ยกเลิกของดีลเดียวกันที่มีเงินค้าง (route ของหน้าใบโหลดมาให้ `order.carrySources`)
     ⭐ ปุ่มกับ route ถามด่านตัวเดียวกัน (`carryBlocker`) — ไม่มีสิทธิ์/ดีลไม่มีเงินค้าง = ไม่มีปุ่ม · ยังไม่อนุมัติ/บัญชีปิด/
       ยังไม่มีงวด = ปุ่มอยู่ กดแล้วบอกเหตุ (GatedAction)
     ⭐ พรีวิวก่อน/หลังมาจาก `applyCarryIn` ตัวเดียวกับที่ route ใช้สร้างชุดสุดท้าย (หักงวดเปิดแรก ๆ ก่อน) ⇒ จอกับ API ตรงกัน
     ⚠️ ความเสี่ยงของแผน: บัญชีเป็นคนกดแล้วแผนของฝ่ายขายขยับ ⇒ โมดัลโชว์แผนก่อน/หลังเต็ม ๆ + โมดัลยืนยันบอกผลทุกงวด */
  const carrySources = Array.isArray(order?.carrySources) ? order.carrySources : [];
  const carryGate = carryBlocker(order, saved, user, carrySources);
  const carrySource = carry ? carry.sources.find((src) => src.id === carry.sourceId) || null : null;
  const carryRows = carrySource ? carrySource.rows.filter((r) => carry.ids.includes(r.id)) : [];
  const carryBuild = carry ? applyCarryIn(order, carry.base, carryRows, { requestById }) : null;
  /* ⭐ ข้อมูลเก่า = งวดของใบนี้ **หรือแถวของใบที่ยกเลิก** เปลี่ยนจากตอนเปิดโมดัล (review carry-modal-stale-source-409-loop)
     🐞 เดิมเทียบแค่งวดของใบนี้ ทั้งที่ expected ที่ส่งขึ้น RPC รวม updatedAt ของแถวต้นทางด้วย ⇒ บัญชีรับรองแถวต้นทางจากอีกหน้าต่าง
       = 409 ทุกครั้งที่กดซ้ำ (หน้าดึง carrySources ใหม่แล้ว แต่โมดัลถือสำเนาเดิม) โดยไม่มีป้ายบอกและปุ่มไม่ดับ */
  const freshCarrySource = carry ? carrySources.find((src) => src.id === carry.sourceId) || null : null;
  const carryBaseStale = carry
    ? replanStale(saved, replanExpected(carry.base))
      || replanStale((freshCarrySource?.rows || []).filter((r) => carry.ids.includes(r.id)), replanExpected(carryRows))
    : false;
  const carryReasonProblem = carry ? replanReasonError(carry.reason) : null;
  const openCarry = () => {
    onClearError?.();
    const first = carrySources[0];
    setCarry({
      base: saved, sources: carrySources, sourceId: first?.id || null,
      ids: (first?.rows || []).map((r) => r.id), reason: "", confirming: false,
    });
  };
  const patchCarry = (patch) => setCarry((current) => (current ? { ...current, ...patch } : current));
  /* เริ่มใหม่จากข้อมูลล่าสุด — งวดของใบนี้ + ต้นทางชุดสด · คงใบ/งวดที่เลือกไว้เท่าที่ยังเป็นเงินค้างอยู่ (ห้ามแอบเปลี่ยน expected ใต้มือ) */
  const resetCarry = () => {
    onClearError?.();
    setCarry((current) => {
      if (!current) return current;
      const src = carrySources.find((candidate) => candidate.id === current.sourceId) || carrySources[0] || null;
      const stillThere = (src?.rows || []).map((r) => r.id).filter((rowId) => current.ids.includes(rowId));
      return {
        ...current, base: saved, sources: carrySources, sourceId: src?.id || null,
        ids: stillThere.length ? stillThere : (src?.rows || []).map((r) => r.id),
      };
    });
  };
  const pickCarrySource = (sourceId) => {
    const src = carry?.sources.find((s) => s.id === sourceId);
    patchCarry({ sourceId, ids: (src?.rows || []).map((r) => r.id) });
  };
  /* ⭐ โมดัลยืนยันบอกผลที่ตรวจได้ (paymentCarryPrompt): งวดที่ยก (สถานะ · ยอด) · แผนที่เหลือก่อน→หลัง · Actual ไม่เปลี่ยน ·
     เงินค้างที่เหลือของใบเดิม — แล้วจึงยิง · expected มาจากชุดที่ตาเห็นตอนเปิดโมดัล (ห้ามแอบเปลี่ยนเป็นของใหม่) */
  const submitCarry = async () => {
    if (!carry || !carrySource || !carryBuild || carryBuild.error || carryReasonProblem || carryBaseStale) return;
    patchCarry({ confirming: true });
    const confirmed = await confirmAction(paymentCarryPrompt(carryPromptFacts(order, carrySource, carry.base, carryRows,
      carryBuild, { sourceRows: carrySource.rows })));
    patchCarry({ confirming: false });
    if (!confirmed) return;
    const done = await onCarry({
      sourceOrderId: carrySource.id,
      installmentIds: carryRows.map((r) => r.id),
      expected: carryExpected(carry.base, carryRows),
      reason: carry.reason.trim(),
    });
    if (done) setCarry(null);
  };

  const cardActions = replanned || replanGate.visible || carryGate.visible ? (
    <>
      {replanned ? (
        <StatusBadge size="sm" tone="info" label={REPLANNED_BADGE} title={REPLANNED_BADGE_TITLE} />
      ) : null}
      {carryGate.visible ? (
        <GatedAction size="sm" variant="ghost" icon={<ArrowRightLeft size={13} aria-hidden="true" />}
          blocker={carryGate.blocker} disabled={!!busy} onClick={openCarry}>
          {CARRY_BUTTON}
        </GatedAction>
      ) : null}
      {replanGate.visible ? (
        <GatedAction size="sm" variant="ghost" icon={<CalendarRange size={13} aria-hidden="true" />}
          blocker={replanGate.blocker} disabled={!!busy} onClick={openReplan}>
          ปรับแผนงวด
        </GatedAction>
      ) : null}
    </>
  ) : null;

  /* ── เงินค้างของใบที่ยกเลิก (PR3) — บอกยอดที่ค้าง + ทางออก · แถวที่ยกไปแล้วมีลิงก์ไปใบที่ถือเงินอยู่ตอนนี้ ── */
  const strandedRows = saved.filter((r) => strandedInstallment(r, order));
  const strandedAmount = strandedRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const carriedAway = carriedAwayGroups(order?.carriedAway);

  /* งวดร่าง = บันทึกเก็บไว้ ยังไม่ส่งให้บัญชี (มติผู้ใช้ 2026-08-19)
     ⚠️ ตัดสินจากฟังก์ชันเดียวกับที่ route ใช้เขียนสถานะจริง — เขียนเงื่อนไข
     `!row.frozenAt` ซ้ำที่นี่เมื่อไร คำบนจอกับผลของ API แยกกันเดินทันที */
  const prepayMode = (row) => installmentReportOutcome(user, row) === "pending";
  /* ⭐ **บัญชี/แอดมินกด "บันทึกการรับชำระ" = แจ้ง + รับรองในก้าวเดียว** (มติผู้ใช้ 2026-08-18 · ทางเลือก ก.)
     🐞 เดิมโมดัลของทางนี้พูดเหมือนฝ่ายขายแจ้ง ("บัญชีจะตรวจหลักฐานก่อนรับรอง" · ปุ่ม "ส่งให้บัญชีตรวจ") ทั้งที่งวด
       ลง `confirmed` ทันที ⇒ โมดัลต้องบอกผลเท่ากับโมดัลรับรอง — ตัวสร้างข้อความตัวเดียวกัน (`installmentConfirmPrompt`
       → `paymentConfirmPrompt`) ไม่เขียนคำเอง (กติกา approvalPrompt: ทุกการรับรองบอกผลลัพธ์ที่ตรวจได้) */
  const confirmsNow = (row) => installmentReportOutcome(user, row) === "confirmed";
  const reportPrompt = (row) => (confirmsNow(row)
    ? installmentConfirmPrompt({
      row, multi: rows.length > 1, historical, outlook: installmentConfirmOutlook(row, saved), orderStatus: order?.status,
    })
    : null);

  const refundedAmount = rollup.refundedAmount;
  const headline = isPreview
    ? (movedAway ? "งวดย้ายไปใบ Rev. แล้ว"
      : cancelledPipeline ? (carriedAway.length ? "งวดยกไปใบใหม่แล้ว" : "ใบยกเลิกแล้ว — ไม่มีงวด")
      : historical ? "ยังไม่มีงวด" : `แผนจากใบเสนอราคา${single ? "" : ` · ${rows.length} งวด`}`)
    /* ใบ pipeline ที่ยกเลิก (review UI-3): ไม่มีอะไรให้ตามเก็บ — เรื่องเดียวที่เหลือคือเงินค้าง/คืนเงินแล้ว (ไม่ใช่ "ค้างรับ") */
    : cancelledPipeline
      ? (strandedRows.length ? `ใบยกเลิกแล้ว · เงินค้าง ${fmtMoney(strandedAmount)}`
        : refundedAmount > 0 ? `ใบยกเลิกแล้ว · คืนเงินแล้ว ${fmtMoney(refundedAmount)}` : "ใบยกเลิกแล้ว — ไม่มีเงินค้าง")
    : historical && isDraftPlan
      ? `งวดของใบย้อนหลัง${single ? "" : ` · ${rows.length} งวด`} — ${order?.status === "cancelled" ? "ใบยกเลิกแล้ว" : `ขึ้นคิวบัญชีหลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ`}`
    : isDraftPlan
      ? `ร่างกำหนดชำระ${single ? "" : ` · ${rows.length} งวด`} — ยอดยืนยันตอนใบอนุมัติ`
      : rollup.complete
      ? `เก็บครบแล้ว ${fmtMoney(rollup.totalAmount)}`
      : single
        ? `ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`
        : `เก็บแล้ว ${rollup.confirmedCount}/${rollup.count} งวด · ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`;

  // เตือนเฉพาะตอนมีเรื่อง — สถานะปกติอ่านจากป้ายในตารางได้อยู่แล้ว
  const rejectedCount = liveRows.filter((r) => r.status === "rejected").length;
  const alert = !isPreview && (rollup.overdueCount || rejectedCount)
    ? [
      rollup.overdueCount ? `เลยกำหนดแล้ว ${rollup.overdueCount} งวด` : null,
      rejectedCount ? `บัญชีตีกลับ ${rejectedCount} งวด` : null,
    ].filter(Boolean).join(" · ")
    : null;

  const pct = rollup.totalAmount > 0 ? Math.round((rollup.confirmedAmount / rollup.totalAmount) * 100) : 0;

  /* ── ใบสายบริการ: งวดต้องบอกด้วยว่าครอบ "ช่วงบริการ" ไหน (mig 0320) ──────
     ⭐ มติผู้ใช้ 2026-08-30 — จ่ายก่อนบริการเสมอ ⇒ ค่า "จ่ายถึง" (สูงสุดของ coversTo
     ในงวดที่บัญชีรับรองแล้ว) คือด่านที่ TS ใช้ตัดสินว่านัดวันนั้นลงคิวได้ไหม
     ⚠️ **โผล่เฉพาะใบที่เข้าเกณฑ์** (สาย SERVICE + มีบรรทัดหมวด 02-001) — ใบสายสินค้า
     ต้องเห็นการ์ดนี้เหมือนเดิมเป๊ะ ไม่มีคอลัมน์ใหม่มากวน
     ⚠️ เกณฑ์อ่านจากตัวตัดสินกลาง ไม่เขียนเงื่อนไขซ้ำที่นี่ (`orderHasServiceRounds`) */
  const coverage = coverageRollup(saved, todayIso);
  /* ช่วงซ้อน/เว้น = เตือน ไม่บล็อก (แผนชำระจริงมี 29 รูปแบบพิมพ์มือ) ⇒ สรุปเป็นบรรทัดเดียว
     ไม่ไล่ทีละงวด — คนอ่านต้องรู้ว่า "มีเรื่องต้องดู" แล้วไปดูที่คอลัมน์เอง */
  const coverageAlert = !hasServiceRounds || isPreview ? null : (() => {
    const notes = [];
    const warnings = coverageWarnings(saved);
    if (warnings.some((w) => w.kind === "overlap")) notes.push("มีช่วงครอบที่ซ้อนทับกัน");
    if (warnings.some((w) => w.kind === "gap")) notes.push("มีช่วงบริการที่ไม่มีงวดไหนครอบ");
    if (warnings.some((w) => w.kind === "half_range")) notes.push("มีงวดที่กรอกช่วงครอบมาข้างเดียว");
    return notes.length ? notes.join(" · ") : null;
  })();

  /* ── ช่องแก้ช่วงครอบในตาราง ────────────────────────────────────────────
     ค่าที่โชว์ = ร่าง (ถ้ามี) ไม่งั้นค่าจากฐาน · ร่างที่เท่าของเดิมถูกถอดออกเอง
     เพื่อให้ "มีของค้าง" นับจากความต่างจริง ไม่ใช่จากการที่เคยแตะช่อง */
  const coverOf = (row) => coverDrafts[row.id]
    || { coversFrom: row.coversFrom || "", coversTo: row.coversTo || "" };
  const setCover = (row, patch) => setCoverDrafts((current) => {
    const next = { ...coverOf(row), ...patch };
    const same = next.coversFrom === (row.coversFrom || "") && next.coversTo === (row.coversTo || "");
    const out = { ...current };
    if (same) delete out[row.id]; else out[row.id] = next;
    return out;
  });
  const coverDirty = Object.keys(coverDrafts).length;
  /* ร่างที่ API จะตีกลับ ห้ามส่งขึ้นไป — ด่านตีกลับอยู่แล้ว แต่บอกตั้งแต่บนจอเร็วกว่า
     ⭐ **ถามด่านตัวเดียวกับที่จะยิงจริง ด้วยค่าที่จะส่งจริง** (`|| null` เหมือน `saveCoverDrafts`)
       ⇒ เหตุผลบนแถบกับเหตุผลของ API เป็นประโยคเดียวกันเสมอ · เดิมเขียนเงื่อนไข "ช่วงกลับหัว" ซ้ำเอง
       ที่นี่ ซึ่งครอบไม่ถึงข้ออื่นของงวดยกมา (ล้างวันสิ้นสุด · เลยอายุสัญญา) = ปุ่มเปิดให้กดแล้ว API ตีกลับ
     ⚠️ ตรวจ "ค่าที่ร่างไว้" ที่นี่ที่เดียว — **ห้ามย้ายไปถามตอนวาดเซลล์** ไม่งั้นพิมพ์ผิดกลางคันแล้ว
       ช่องกรอกหายไปทั้งเซลล์ คนแก้ค่าผิดของตัวเองไม่ได้ (เหลือแต่ปุ่ม "ยกเลิกที่แก้")
     ⭐ **เก็บเป็นรายงวด ไม่ใช่ข้อแรกข้อเดียว** — เซลล์ต้องบอกเหตุ *ตรงที่คนกำลังพิมพ์* ได้
       (เดิมเซลล์กันด้วย `min`/`max` ของ `DateInput` ซึ่งกลืนค่าที่พิมพ์เงียบ ๆ — ดูคอมเมนต์ที่เซลล์)
       แถบบันทึกยังพูดข้อเดียวเหมือนเดิม เพราะมันเป็นสรุปของทั้งตาราง ไม่ใช่ที่อ่านรายช่อง */
  const coverDraftErrors = Object.entries(coverDrafts).reduce((map, [rowId, draft]) => {
    const row = saved.find((r) => r.id === rowId);
    if (!row) return map;
    const why = gate(row, "coverage", {
      coversFrom: draft.coversFrom || null, coversTo: draft.coversTo || null,
    });
    if (why) map[rowId] = why;
    return map;
  }, {});
  const coverDraftError = (() => {
    const [rowId] = Object.keys(coverDraftErrors);
    if (!rowId) return "";
    const why = coverDraftErrors[rowId];
    const row = saved.find((r) => r.id === rowId);
    return single ? why : `งวดที่ ${row?.seq}: ${why}`;
  })();
  const coverInvalid = Boolean(coverDraftError);

  const saveCoverDrafts = async () => {
    const entries = Object.entries(coverDrafts);
    if (!entries.length || coverInvalid) return;
    setSavingCover(true);
    const failed = {};
    for (const [rowId, draft] of entries) {
      const row = saved.find((r) => r.id === rowId);
      if (!row) continue;
      /* ทีละงวดตามลำดับโดยตั้งใจ — ด่านของ API อ่านงวดพี่น้องสดทุกครั้ง ยิงพร้อมกันแล้วผลไม่นิ่ง */
      const done = await onAction(row, "coverage", {
        coversFrom: draft.coversFrom || null,
        coversTo: draft.coversTo || null,
      });
      if (!done) failed[rowId] = draft;
    }
    setCoverDrafts(failed);
    setSavingCover(false);
  };

  /* ── ใบยอด 0 จบที่อนุมัติใบ (มติผู้ใช้ 2026-08-18) ────────────────────────
     ไม่มีเงินให้เก็บ ⇒ ไม่มีงวด ไม่มีการแจ้ง/ยืนยัน · การ์ดยังอยู่เพื่อ **บอกว่าทำไม
     ไม่มีอะไรให้ทำ** ไม่ใช่ซ่อนทั้งการ์ด — การ์ดที่หายไปเฉย ๆ อ่านเหมือนระบบลืม
     ⚠️ ใบเก่าที่มีงวดค้างอยู่แล้ว (สร้างก่อนมติ) ยังโชว์ตารางตามเดิม ไม่กลืนของเดิมทิ้ง */
  const noPaymentStep = paymentNotRequired(order?.totalAmount);
  if (noPaymentStep && !saved.length) {
    return (
      <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta="ยอด 0 — ไม่ต้องยืนยันการชำระ">
        <StatusNotice tone="info">
          ใบนี้ยอดรวม 0 บาท จึงไม่มีงวดชำระให้ติดตาม — จบที่ขั้นอนุมัติใบสั่งขาย
        </StatusNotice>
      </DetailCard>
    );
  }

  return (
    <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={headline}
      actions={cardActions}>
      {/* แถบสัดส่วนเงิน — เฉพาะใบที่แบ่งงวดจริง ใบงวดเดียวไม่มีอะไรให้เทียบ */}
      {!isPreview && !single && !deadPipeline ? (
        <div className={styles.progress}>
          {/* แถบกลางของระบบ (.progress ใน globals.css) — ความกว้างของ fill ตั้ง inline
              ตามที่คอมเมนต์ของคลาสนั้นระบุไว้เอง ไม่ใช่ทรงใหม่ */}
          <div className="progress" role="progressbar"
            aria-valuenow={rollup.confirmedAmount} aria-valuemax={rollup.totalAmount}
            aria-label="สัดส่วนเงินที่เก็บได้แล้ว">
            <span className={rollup.complete ? "done" : undefined} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.barMeta}>
            <span>เก็บแล้ว {fmtMoney(rollup.confirmedAmount)}</span>
            <span>ทั้งใบ {fmtMoney(rollup.totalAmount)}</span>
          </div>
        </div>
      ) : null}

      {/* เอกสารยืนยันคำสั่งซื้อ — แถวเดียว
          ⚠️ ใบย้อนหลังไม่มีขั้นยืนยันคำสั่งซื้อ (เอกสารแทนสัญญาทำหน้าที่นี้ · อยู่แท็บสัญญา) — แถว "ยืนยันด้วย —" อ่านเหมือนขาดของ */}
      {historical ? null : <div className={styles.won}>
        <span className={styles.wonLabel}>ยืนยันด้วย</span>
        <span className={styles.wonValue}>
          {CONFIRM_DOC_TYPE_LABELS[confirmation?.docType] || naText(confirmation?.docType)}
          {confirmation?.docNo ? <> · <b>{confirmation.docNo}</b></> : null}
          {confirmation?.docDate ? ` · ${fmtDate(confirmation.docDate)}` : ""}
        </span>
        {confirmFiles.map((att, i) => (
          <a
            key={`${att.storagePath || att.fileUrl || "f"}-${i}`}
            href={confirmFileHref(i)}
            target="_blank" rel="noreferrer" className={styles.fileLink}
            title={att.fileName || `ไฟล์ ${i + 1}`}
          >
            <Paperclip size={13} aria-hidden="true" />
            <span className="cell-ellipsis">{att.fileName || `ไฟล์ ${i + 1}`}</span>
          </a>
        ))}
      </div>}

      {/* ⭐ ใบยอด 0 ที่ออกก่อนมติ 2026-08-18 ยังมีงวดค้างอยู่ — **ไม่ลบประวัติทิ้ง**
          แต่ปุ่มทุกตัวถูกปิดที่ `installmentActionError` แล้ว ⇒ ต้องบอกว่าทำไมกดอะไรไม่ได้
          ไม่งั้นคนจะคิดว่าสิทธิ์ตัวเองหาย */}
      {noPaymentStep ? (
        <StatusNotice tone="info">
          ใบนี้ยอดรวม 0 บาท — ไม่มีขั้นยืนยันการชำระแล้ว (จบที่การอนุมัติใบ)
          · งวดด้านล่างเก็บไว้เป็นประวัติของใบที่ออกก่อนหน้านี้
        </StatusNotice>
      ) : null}

      {alert ? <StatusNotice tone="error">{alert}</StatusNotice> : null}

      {/* ⭐ "จ่ายถึง" — ค่าที่ทั้งเส้นบริการห้อยอยู่ (มติผู้ใช้ 2026-08-30 "จ่ายก่อนบริการเสมอ")
          บอกตรง ๆ ว่านัดหลังวันนี้จะลงคิวไม่ได้ เพื่อให้ฝ่ายขายรู้ก่อนที่ TS จะมาถาม
          ⚠️ นับเฉพาะงวดที่ **บัญชีรับรองแล้ว** — "แจ้งแล้ว" ไม่ขยับค่านี้แม้แต่วันเดียว */}
      {showCoverage && !isPreview && !deadPipeline ? (
        <StatusNotice tone={coverage.paidThrough ? "success" : "warning"}>
          {coverage.paidThrough ? (
            <>
              เงินครอบบริการถึง <b>{fmtDate(coverage.paidThrough)}</b> — นัดบริการหลังวันดังกล่าวจะลงคิวไม่ได้จนกว่าบัญชีจะรับรองงวดถัดไป
              {coverage.confirmedWithoutCoverage
                ? ` · ยังมีอีก ${coverage.confirmedWithoutCoverage} งวดที่รับรองแล้วแต่ไม่ได้ระบุช่วงครอบ จึงยังไม่ถูกนับ`
                : ""}
            </>
          ) : coverage.confirmedWithoutCoverage ? (
            /* ⚠️ เคสนี้ต่างจาก "ยังไม่มีใครรับรอง" คนละเรื่องกันเลย — เงินเข้าแล้ว
               แต่ไม่มีใครบอกว่าซื้อบริการช่วงไหน ระบบจึงตอบแทนไม่ได้ · เขียนรวมกัน
               เมื่อไรฝ่ายขายจะไปตามบัญชีทั้งที่บัญชีทำงานเสร็จแล้ว (เจอตอนดูใบจริง) */
            <>
              งวดที่บัญชีรับรองแล้ว <b>{coverage.confirmedWithoutCoverage} งวด</b> ยังไม่ได้ระบุช่วงครอบบริการ
              — ระบบจึงยังบอกไม่ได้ว่าเงินครอบถึงวันไหน และนัดบริการจะยังลงคิวไม่ได้
            </>
          ) : (
            <>ยังไม่มีงวดที่บัญชีรับรอง — เงินยังไม่ครอบบริการช่วงไหนเลย นัดบริการทุกใบจะยังลงคิวไม่ได้</>
          )}
        </StatusNotice>
      ) : null}

      {coverageAlert ? <StatusNotice tone="warning">{coverageAlert}</StatusNotice> : null}

      {/* ⭐ บอกให้ตรงว่างวดร่างทำอะไรได้/ไม่ได้ — ไม่งั้นคนจะหาปุ่ม "แจ้งลูกค้าจ่ายแล้ว"
          ที่หายไปแล้วสรุปเองว่าระบบพัง (ด่านที่ไม่บอกเหตุผลคือด่านที่คนหาทางอ้อม) */}
      {/* ⭐ ใบย้อนหลังที่ยังไม่อนุมัติ/ยกเลิกแล้ว: ทุกปุ่มของแผงถูกปิดที่ `gate` ⇒ บอกเหตุผลตัวเดียวกับที่ API ตอบ
          (ล็อกดีกว่าซ่อนเงียบ ๆ) · ⚠️ ข้อความของงวดร่างใบปกติ (กรอกกำหนด/บันทึกเงินได้) ไม่จริงกับใบนี้ จึงไม่ขึ้น */}
      {orderLock ? (
        <StatusNotice tone="info">
          {orderLock}
          {order?.status === "cancelled" ? "" : " — ยอด ช่วงครอบ และหลักฐานงวดยกมาแก้ที่ฟอร์มคีย์ใบ"}
        </StatusNotice>
      ) : null}

      {/* ⭐ ใบ pipeline ที่ยกเลิก/ถูกออก Rev. ทับ (PR0): ปุ่มที่หายไปถูกปิดที่ `gate` — บอกเหตุตัวเดียวกับที่ API ตอบ
          ⚠️ ข้อความงวดร่างข้างล่าง ("บันทึกเงินได้เลย") ไม่จริงกับใบนี้ จึงไม่ขึ้นคู่กัน
          ⭐ ใบ revised ที่งวดย้ายไปแล้ว (PR1 · 0376) บอกว่าไปอยู่ใบไหนแทน — ไม่ขึ้นสองข้อความที่พูดเรื่องเดียวกัน */}
      {movedAway ? <StatusNotice tone="info">{movedAway}</StatusNotice>
        : pipelineLock ? <StatusNotice tone="info">{pipelineLock}</StatusNotice> : null}

      {/* ⭐ เงินค้างจากใบที่ยกเลิก (PR3 · mig 0378 · มติ D4) — เงินไม่หาย · ทางออกสองทางต้องเห็นจากที่นี่ */}
      {strandedRows.length ? (
        <StatusNotice tone="warning" title={`เงินค้างจากใบที่ยกเลิก ${fmtMoney(strandedAmount)} (${strandedRows.length} งวด)`}>
          ยกเข้าใบใหม่ของดีลนี้ได้ที่แท็บการชำระของใบใหม่หลังอนุมัติ (ปุ่ม “{CARRY_BUTTON}”)
          · หรือบัญชีบันทึกคืนเงินลูกค้าจากเมนูของงวด
        </StatusNotice>
      ) : null}
      {carriedAway.length ? (
        <StatusNotice tone="info" title="เงินของใบนี้ยกไปใบใหม่แล้ว">
          {carriedAway.map((group, index) => (
            <Fragment key={group.salesOrderId || group.orderNumber}>
              {index ? " · " : ""}
              ยกไป{" "}
              <a className="linklike mono" href={`/sa/sales-orders/${group.salesOrderId}#payment`}>
                {group.orderNumber || "ใบใหม่"}
              </a>
              {` ${group.count} งวด ${fmtMoney(group.amount)}`}
            </Fragment>
          ))}
        </StatusNotice>
      ) : null}
      {order?.moneyLinksError ? <StatusNotice tone="error">{order.moneyLinksError}</StatusNotice> : null}

      {isDraftPlan && !historical && !pipelineLock ? (
        <StatusNotice tone="info">
          กรอกกำหนดชำระและบันทึกเงินที่ลูกค้าจ่ายมาแล้วได้เลยตั้งแต่ตอนนี้ —
          ยอดต่องวดยังเดินตามใบเสนอราคาและจะถูกยืนยันตอนใบสั่งขายอนุมัติ ·
          ที่บันทึกไว้จะถูกส่งให้บัญชีตรวจเองตอนนั้น
        </StatusNotice>
      ) : null}

      {/* ⚠️ จำนวนงวดไม่ตรงแผนล่าสุด — ทับยอดอย่างเดียวแก้ไม่ได้ ต้องบอกว่าจะเกิดอะไร */}
      {drift ? (
        <StatusNotice tone="warning">
          ใบเสนอราคาถูกแก้เป็น {drift.planned} งวด แต่ที่ตั้งไว้มี {drift.tracked} งวด —
          {hasPrepaid
            ? " มีงวดที่บันทึกการจ่ายไว้แล้ว ระบบจะไม่ตั้งงวดใหม่ทับ (ไม่ทำหลักฐานหาย) ⇒ ต้องแก้จำนวนงวดให้ตรงกันเอง ก่อนอนุมัติใบ"
            : " ตอนใบอนุมัติ ระบบจะตั้งงวดใหม่ตามแผนล่าสุด (กำหนดชำระที่กรอกไว้จะหายไป)"}
        </StatusNotice>
      ) : null}

      {!rows.length ? (movedAway || (cancelledPipeline && carriedAway.length) ? null : (
        <p className="form-note">
          {historical
            ? "ใบนี้ยังไม่มีงวด — งวดของใบย้อนหลังมาจากฟอร์มคีย์ใบ"
            : cancelledPipeline
              ? "ใบนี้ยกเลิกแล้ว — ไม่มีงวดให้ติดตาม"
              : "ใบเสนอราคาต้นทางไม่ได้ระบุแผนการชำระ — ไม่มีงวดให้ติดตาม"}
        </p>
      )) : (
        /* surface="auto" = ตารางมีขอบ/มุมมน/พื้นของตัวเอง (ตัวแปรกลางใน Table.module.css)
           เดิมใช้ "embedded" ซึ่งไม่มีขอบ ⇒ ตารางลอยอยู่ในการ์ดโดยไม่มีกรอบ (ผู้ใช้ขอเพิ่มขอบ)
           ⚠️ ใช้ตัวแปรของ primitive ไม่เขียน border ทับเองในโมดูลนี้ — ไม่งั้นได้ทรงที่สอง */
        <TableScroll family="editable" surface="auto" cells="stacked" minWidth={showCoverage ? 980 : 840}>
          <table className={`${styles.table} ${isPreview ? styles.preview : ""}`.trim()}>
            <thead>
              <tr>
                {single ? null : <th className={styles.seqCol}>งวด</th>}
                <th>รายละเอียด</th>
                <th>กำหนด / จ่ายจริง</th>
                {showCoverage ? <th>ครอบคลุมบริการ</th> : null}
                <th className="num">ยอด</th>
                <th>หลักฐาน</th>
                {/* ⭐ ใบกำกับภาษีของงวด (mig 0348) — ฝ่ายขายเปิดไฟล์จากที่นี่ไปส่งลูกค้า
                    ได้เลย (โปรเซสจริง: FN ใส่ใบกำกับ แล้ว SA มาเอาไป) */}
                <th>ใบกำกับภาษี</th>
                <th>สถานะ</th>
                <th aria-label="การจัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // งวดโมฆะของใบยกเลิก/ถูกแทน ไม่ใช่ "เลยกำหนด" (review UI-3 · installmentVoid)
                const overdue = !installmentVoid(row, order) && row.status !== "confirmed" && row.dueDate && String(row.dueDate) < String(todayIso);
                const evidence = Array.isArray(row.evidence) ? row.evidence : [];

                /* ⭐ **ปุ่มก้าวถัดไป 1 ปุ่ม + เมนู "…"** (มติผู้ใช้ 2026-08-01 · RowActionMenu)
                   "ก้าวถัดไป" = action ที่ทำให้งวดนี้เดินหน้า **สำหรับคนที่กำลังดูอยู่**
                     · รอชำระ / ถูกตีกลับ → ฝ่ายขายแจ้งชำระ
                     · รอบัญชีตรวจ       → บัญชีคอนเฟิร์ม
                   ⚠️ ฝ่ายขายเปิดดูงวดที่ "รอบัญชีตรวจ" จะ **ไม่มีปุ่มหลัก** โดยตั้งใจ —
                   สิ่งเดียวที่เขาทำได้คือ "ดึงกลับ" ซึ่งเป็นการถอย ไม่ใช่ก้าวถัดไป
                   เอามาเป็นปุ่มเด่นจะกลายเป็นชวนให้ถอย */
                const canReport = !row.preview && !gate(row, "report", { paidOn: "placeholder" });
                /* งวดที่ยกมาจากใบที่ยกเลิก (PR3) — ลิงก์กลับไปใบเดิม (ประวัติของเงินก้อนนี้อยู่ที่นั่น) */
                const carriedFrom = carriedFromOf(row);
                const canConfirm = !row.preview && !gate(row, "confirm");
                const rowStatus = installmentDisplayStatus(row);
                /* บัญชีกดปุ่มเดียวกันแต่จบในก้าวเดียว (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
                   ⇒ คำบนปุ่มต้องบอกผลจริง ไม่ใช่ "แจ้ง" ที่แปลว่ารอคนอื่นมาตรวจ
                   ⭐ งวดร่างจอดที่ `pending` ไม่ว่าใครกด (มติผู้ใช้ 2026-08-19) ⇒ คำบนปุ่ม
                   ต้องไม่สัญญาว่าส่งให้บัญชีแล้ว มันแค่ **บันทึกไว้** รอใบอนุมัติ */
                const outcome = installmentReportOutcome(user, row);
                const reportsAsConfirmed = outcome === "confirmed";
                const parksAsDraft = outcome === "pending";
                const primary = canReport
                  ? { label: parksAsDraft
                        ? "บันทึกว่าลูกค้าจ่ายแล้ว"
                        : reportsAsConfirmed
                          ? "บันทึกการรับชำระ"
                          : row.status === "rejected" ? "แจ้งใหม่" : "แจ้งลูกค้าจ่ายแล้ว",
                      onClick: () => { onClearError?.(); setReportFor({ row, paidOn: todayIso, files: [] }); } }
                  : canConfirm
                    ? {
                      label: "บัญชีคอนเฟิร์ม",
                      /* ⚠️ ถอยได้ทางเดียวคือบัญชี "ถอนคำรับรอง" พร้อมเหตุผล (action `unconfirm` · มติผู้ใช้ 2026-08-13)
                         · ย้อนการอนุมัติ/ออก Rev. ไม่ถูกล็อกด้วยงวดที่คอนเฟิร์มแล้วอีก (PR1 · mig 0376 — งวดย้ายไปกับใบ Rev.)
                           และยกเลิกใบ pipeline ได้ด้วย (PR3 · mig 0378 — เงินค้างอยู่กับใบ → ยกเข้าใบใหม่/คืนเงิน) ·
                           ใบย้อนหลัง: งวดปกติที่รับรองแล้วล็อกการยกเลิก · งวดยกมาไม่ล็อก (โมฆะตามใบ — มติ 24/09 · historicalCancelBlock)
                         ⇒ ต้องถามก่อนเสมอ (มติผู้ใช้ 2026-08-13) */
                      /* ⭐ โมดัลตัวเดียวกับคิวบนทะเบียนการชำระ (มติผู้ใช้ 2026-08-13) —
                         และมัน **โชว์หลักฐานก่อนกด** ซึ่งของเดิมไม่มี ทั้งที่หน้านี้เป็น
                         ที่ที่หลักฐานอยู่ · เขียนสองชุดเมื่อไรมันเพี้ยนหากัน (AGENTS.md) */
                      onClick: () => { onClearError?.(); setConfirmFor({ row }); },
                    }
                    : null;

                const menu = row.preview ? [] : [
                  !gate(row, "schedule") && {
                    id: "schedule", icon: CalendarClock,
                    label: row.dueDate ? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ",
                    onClick: () => { onClearError?.(); setScheduleFor({ row, dueDate: row.dueDate || "" }); },
                  },
                  !gate(row, "withdraw") && {
                    id: "withdraw", icon: Undo2, tone: "warning",
                    // งวดร่างยังไม่ได้ส่งให้ใคร ⇒ "ดึงกลับ" ไม่ตรงกับสิ่งที่เกิดจริง
                    label: installmentPrepaid(row) ? "ลบบันทึกการจ่าย" : "ดึงกลับการแจ้งชำระ",
                    onClick: () => onAction(row, "withdraw"),
                  },
                  !gate(row, "reject", { reason: "x".repeat(MIN_REJECT_REASON) }) && {
                    id: "reject", icon: XCircle, tone: "danger", label: "ตีกลับให้แก้",
                    onClick: () => { onClearError?.(); setRejectFor({ row, reason: "" }); },
                  },
                  /* ถอนคำรับรอง (มติผู้ใช้ 2026-08-13) — **อยู่ในเมนู `⋯` ไม่ใช่ปุ่มหลัก**
                     งวดที่คอนเฟิร์มแล้วคือ "จบแล้ว" ปุ่มหลักของแถวจึงต้องไม่มี ·
                     การถอยเป็นทางออกฉุกเฉิน ไม่ใช่ก้าวถัดไปที่ชวนให้กด */
                  !gate(row, "unconfirm", { reason: "x".repeat(MIN_REJECT_REASON) }) && {
                    id: "unconfirm", icon: Undo2, tone: "warning", label: "ถอนคำรับรอง",
                    onClick: () => { onClearError?.(); setUnconfirmFor({ row, reason: "" }); },
                  },
                  /* ── คำร้องขอเอกสารการเงิน (B-5) ────────────────────────────
                     ⭐ **สองทางเข้า คนละสถานการณ์** — ยังไม่เคยขอ = เปิดใบใหม่ ·
                     ขอไปแล้วตั้งแต่ตอนมีแค่ QT = แนบใบที่มีอยู่ (คำร้องเกิดก่อนงวดเสมอ)
                     ⚠️ ทั้งคู่อยู่ในเมนู `⋯` ไม่ใช่ปุ่มหลัก — ก้าวถัดไปของงวดคือเรื่องเงิน
                     ส่วนเอกสารเป็นแกนคู่ขนานที่ไม่ได้ทำให้งวดเดินหน้า */
                  !row.billingRequestId && !gate(row, "link", { billingRequestId: "x" }) && {
                    id: "ask-doc", icon: Receipt, label: "ขอใบวางบิลงวดนี้",
                    href: newBillingRequestHref(row),
                  },
                  !row.billingRequestId && linkableRequests.length > 0
                    && !gate(row, "link", { billingRequestId: "x" }) && {
                    id: "link-doc", icon: Link2, label: "แนบคำร้องที่ขอไว้แล้ว",
                    onClick: () => { onClearError?.(); setLinkFor({ row, billingRequestId: "" }); },
                  },
                  !gate(row, "unlink") && {
                    id: "unlink-doc", icon: Unlink, tone: "warning", label: "ถอดคำร้องออกจากงวด",
                    onClick: () => onAction(row, "unlink"),
                  },
                  /* ── ใบกำกับภาษีของงวด (mig 0348 · มติผู้ใช้ 2026-09-07) ────────
                     ⭐ **ของฝ่ายบัญชี** — ด่านคือ `canConfirmPayment` ⇒ ฝ่ายขายเห็นข้อมูล
                     บนคอลัมน์และเปิดไฟล์ได้ แต่ไม่มีรายการนี้ในเมนู
                     ⚠️ ส่งค่าหลอกให้ด่านตรวจรูปแบบผ่าน (เหมือนที่ `report`/`reject` ทำ) —
                     ด่านจริงตอนกดอยู่ในโมดัล */
                  !gate(row, "tax-invoice", { taxInvoiceNo: "x", taxInvoiceDate: todayIso }) && {
                    id: "tax-invoice", icon: FileText,
                    label: row.taxInvoiceNo ? "แก้ไขใบกำกับภาษี" : "บันทึกใบกำกับภาษี",
                    onClick: () => { onClearError?.(); setInvoiceFor(row); },
                  },
                  /* ── คืนเงินของงวดใบที่ยกเลิก (PR3 · mig 0378) — **ของฝ่ายบัญชี** (ด่าน canConfirmPayment) ────────
                     ส่งค่าหลอกให้ด่านตรวจเฉพาะ "ใคร/งวดไหน" (ค่าจริงตรวจในโมดัลด้วย refundValueError ตัวเดียวกับ API) */
                  !gate(row, "refund", REFUND_PROBE) && {
                    id: "refund", icon: HandCoins, tone: "danger", label: "บันทึกคืนเงิน",
                    onClick: () => { onClearError?.(); setRefundFor(row); },
                  },
                  !gate(row, "refund-clear") && {
                    id: "refund-clear", icon: Undo2, tone: "warning", label: "ถอนการบันทึกคืนเงิน",
                    onClick: async () => {
                      onClearError?.();
                      const ok = await confirmAction(paymentRefundClearPrompt({
                        label: row.label || `งวดที่ ${row.seq}`, amount: fmtMoney(row.amount),
                        creditNoteNo: row.refundCreditNoteNo || "",
                      }));
                      if (ok) await onAction(live(row), "refund-clear");
                    },
                  },
                ].filter(Boolean);

                return (
                  <Fragment key={row.id || `preview-${row.seq}`}>
                  <tr>
                    {single ? null : <td className={styles.seqCol}>{row.seq}</td>}
                    <td>
                      <strong>{row.label}</strong>
                      {/* งวดยกมา = เงินที่เก็บก่อนเข้าระบบ บัญชีรับรองครั้งเดียว — ป้ายเดียวกับคิวของบัญชี */}
                      {isOpeningInstallment(row) ? (
                        <StatusBadge size="sm" tone="info" label="ยกมา" title="เงินที่เก็บก่อนเข้าระบบ — บัญชีรับรองครั้งเดียว" />
                      ) : null}
                      {single ? null : <small>{fmtPercent(row.percent)}</small>}
                      {carriedFrom ? (
                        <small>
                          ยกมาจาก{" "}
                          <a className="linklike mono" href={`/sa/sales-orders/${carriedFrom.salesOrderId}#payment`}>
                            {carriedFrom.orderNumber || "ใบที่ยกเลิก"}
                          </a>
                        </small>
                      ) : null}
                      {/* ⭐ คำร้องขอเอกสารที่ครอบงวดนี้ (B-5) — โชว์ **เลขที่เอกสารที่บัญชี
                          ออกให้จริง** ไม่ใช่แค่เลขคำร้อง เพราะสิ่งที่ SA เอาไปคุยกับลูกค้า
                          คือเลขใบวางบิล · ตามกลับไม่เจอ = คำร้องถูกลบ ต้องบอกตรง ๆ */}
                      {row.billingRequestId ? (() => {
                        const linked = requestById.get(row.billingRequestId);
                        /* อ่านคำร้องไม่ขึ้น ≠ ถูกลบ (review F3) — บอกตามจริง ไม่ชวนออกคำร้องซ้ำ */
                        if (!linked) {
                          return (
                            <small className={styles.overdue}>
                              {order?.billingRequestsError ? "อ่านคำร้องขอเอกสารไม่สำเร็จ" : "คำร้องขอเอกสารถูกลบไปแล้ว"}
                            </small>
                          );
                        }
                        const issued = (linked.items || [])
                          .map((it) => it.docNumber).filter(Boolean);
                        return (
                          <small>
                            <a className="linklike" href={`/requests/${linked.id}`}>
                              {linked.docNo || "คำร้องขอเอกสาร"}
                            </a>
                            {issued.length ? ` · ${issued.join(" · ")}` : " · รอบัญชีออกเอกสาร"}
                          </small>
                        );
                      })() : null}
                    </td>
                    <td>
                      <span className={overdue ? styles.overdue : undefined}>
                        {row.dueDate ? fmtDate(row.dueDate) : row.preview ? "กำหนดหลังอนุมัติ" : "ยังไม่กำหนด"}
                        {overdue ? " · เลยกำหนด" : ""}
                      </span>
                      {row.paidOn ? <small>จ่าย {fmtDate(row.paidOn)}</small> : null}
                      {row.reportedByName || row.confirmedByName ? (
                        <small>
                          {row.confirmedByName ? `บัญชีรับรอง ${row.confirmedByName}` : `แจ้งโดย ${row.reportedByName}`}
                        </small>
                      ) : null}
                    </td>
                    {/* ⭐ ช่วงบริการที่งวดนี้จ่ายค่าให้ (mig 0320) — **ผูกเป็นวันที่ ไม่ใช่เลขรอบ**
                        (มติ 2026-08-30: รอบเลื่อน/งดได้ตลอดอายุสัญญา ผูกเลขรอบแล้วเพี้ยนเงียบ)
                        ⚠️ งวดที่บัญชีรับรองแล้วแต่ช่องนี้ว่าง = ไม่ถูกนับเข้า "จ่ายถึง" ⇒ ต้องเห็นว่าว่าง
                        ไม่ใช่เงียบ ๆ (ขีดของระบบผ่าน NA ไม่ใช่ "-" ดิบ) */}
                    {showCoverage ? (() => {
                      /* ⭐ แก้ได้ในตารางเลย (มติผู้ใช้ 2026-08-30 รอบสอง) — ท่าเดียวกับ
                         ตารางไทม์ไลน์ของดีล: `DateInput compact` ในเซลล์ + ร่าง + ปุ่มบันทึกรวม
                         ⚠️ **ด่านเดียวกับ API** (`gate(row,"coverage")`) ⇒ งวดที่บัญชีรับรองแล้ว
                         ฝ่ายขายจะเห็นเป็นข้อความล็อกพร้อมเหตุ ไม่ใช่ช่องหาย (ล็อกดีกว่าซ่อน)
                         🔴 **ถามด่านแบบไม่ส่งค่า โดยเจตนา** — คำถามตรงนี้คือ "ใครแก้เซลล์นี้ได้"
                         ไม่ใช่ "ค่านี้ผ่านไหม" · ส่งค่าเข้าไปเมื่อไร (ค่าจากฐานหรือค่าร่างก็ตาม) เซลล์จะ
                         ยุบเป็นข้อความทันทีที่ค่าไม่ผ่านสักข้อ = คนแก้ค่าที่ผิดของตัวเองไม่ได้ · ค่าที่ร่างไว้
                         ถูกตรวจที่ `coverDraftErrors` ก่อนบันทึก (ด่านตัวเดียวกัน ค่าชุดเดียวกับที่ยิงขึ้น API)
                         🐞 **ห้ามใส่ `min`/`max` ให้ `DateInput` ที่นี่อีก** (review 23/09) — `update()` ของ
                           `DateInput` **ไม่เรียก `onChange` เลย** เมื่อค่าที่พิมพ์หลุดขอบ แล้ว `onBlur` เด้ง
                           กลับค่าเดิม **โดยไม่มีข้อความสักบรรทัด** ⇒ บัญชีพิมพ์วันแล้วมันหายไปเฉย ๆ
                           (อาการเดียวกับที่เพิ่งถอดออกจากฟอร์มคีย์ใบย้อนหลังทั้งห้าช่อง)
                           ⇒ **กฎอยู่ใต้เซลล์ ไม่ใช่ที่ขอบของช่อง** · ค่าที่พิมพ์เข้าร่างได้เสมอ แล้วด่านตัวเดียวกับ
                             API เป็นคนบอกเหตุ (`coverDraftErrors[row.id]`) ทั้งใต้เซลล์และบนแถบบันทึก */
                      const lock = row.preview ? "ยังไม่เริ่มติดตามการชำระ" : gate(row, "coverage");
                      const draft = row.preview ? { coversFrom: "", coversTo: "" } : coverOf(row);
                      const edited = !row.preview && !!coverDrafts[row.id];
                      /* งวดยกมา: วันเริ่มล็อกที่วันเริ่มสัญญาจริง ๆ ⇒ วาดเป็นช่องกรอกไม่ได้ ไม่งั้นบัญชี
                         พิมพ์วันใหม่ได้แล้วไปเด้งตอนกดบันทึก (ทางตันเดิมย้ายไปอยู่หลังปุ่มแทน)
                         ⭐ **เหตุผลมาจากด่านเอง** — ถามด้วยค่าหลอกว่า "ถ้าขยับวันเริ่มจะเกิดอะไร"
                           (แพตเทิร์นเดียวกับ `link`/`tax-invoice` ข้างบน) ⇒ คำบนจอกับคำที่ API
                           ตอบเป็นประโยคเดียวกันเสมอ ไม่ต้องเขียนคำซ้ำไว้ที่จอ */
                      const startLock = !row.preview && isOpeningInstallment(row)
                        ? gate(row, "coverage", { coversFrom: "", coversTo: row.coversTo || "" })
                        : "";
                      /* บรรทัดใต้เซลล์ = เหตุจากด่าน (ถ้าร่างไม่ผ่าน) ไม่งั้นเป็น **กฎที่เดาจากจอไม่ได้**
                         ⭐ เหลือข้อเดียวที่เข้าเกณฑ์นั้น: เพดานอายุสัญญาของงวดยกมา — วันมาจากสัญญา
                           (หรือจากงวดอื่นของใบ) ซึ่งไม่ได้อยู่บนแถวนี้เลย ⇒ ไม่บอกก็ไม่มีทางรู้
                         ⚠️ "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" **ไม่ต้องเขียนกำกับ** — อ่านออกจากสองช่องที่อยู่
                           ติดกัน และด่านพูดเองตอนร่างผิด · เขียนไว้ทุกแถวของทุกใบ = บรรทัดที่ทุกคนข้าม
                         ⚠️ `startLock` เป็นตัวชี้ "แถวนี้คืองวดยกมาของใบย้อนหลัง" (ด่านตอบเรื่องวันเริ่มที่
                           ล็อกไว้) — เงื่อนไขเดียวกับที่ด่านใช้กั้นเพดาน ⇒ คำบนจอกับด่านไม่แยกกันเดิน */
                      const coverNote = coverDraftErrors[row.id]
                        || (startLock && contractEnd
                          ? `ครอบได้ถึง ${fmtDate(contractEnd)} (วันสิ้นสุดสัญญา)`
                          : "");
                      return (
                        <td className={edited ? styles.coverEdited : undefined}>
                          {lock ? (
                            /* ⚠️ **ล็อกต้องบอกเหตุตอนกด ไม่ใช่เซลล์ตาย** (กติกาเดียวกับ `GatedAction`) —
                               tooltip อย่างเดียวมือถืออ่านไม่ได้ และเซลล์ที่กดแล้วเงียบอ่านเหมือนระบบพัง
                               ⚠️ สีอยู่ที่ `<span>` ครอบ ไม่ใช่ที่ปุ่ม — `td > * > .text-action` บังคับ
                               `color: inherit` ทับคลาสของเซลล์ (globals.css) ⇒ ใส่ที่ปุ่มแล้วสีแดงหาย */
                            <span className={row.status === "confirmed" && !row.coversTo ? styles.overdue : styles.none}>
                              <button type="button" className={`text-action ${styles.coverLocked}`} title={lock}
                                aria-label={`ช่วงครอบบริการ งวดที่ ${row.seq} — ${lock}`}
                                onClick={() => notifyToast.info(lock)}>
                                {row.coversFrom || row.coversTo
                                  ? `${row.coversFrom ? fmtDate(row.coversFrom) : "…"} – ${row.coversTo ? fmtDate(row.coversTo) : "…"}`
                                  : row.status === "confirmed" ? "ยังไม่ระบุ" : NA}
                              </button>
                            </span>
                          ) : (
                            <span className={styles.coverCell}>
                              {startLock ? (
                                <button type="button" className={`text-action ${styles.coverDate} ${styles.coverLocked}`} title={startLock}
                                  aria-label={`ครอบบริการตั้งแต่ · งวดที่ ${row.seq} — ${startLock}`}
                                  onClick={() => notifyToast.info(startLock)}>
                                  {draft.coversFrom ? fmtDate(draft.coversFrom) : NA}
                                </button>
                              ) : (
                                <DateInput compact value={draft.coversFrom} className={styles.coverDate}
                                  ariaLabel={`ครอบบริการตั้งแต่ · งวดที่ ${row.seq}`}
                                  disabled={!!busy || savingCover}
                                  onChange={(iso) => setCover(row, { coversFrom: iso })} />
                              )}
                              <DateInput compact value={draft.coversTo} className={styles.coverDate}
                                ariaLabel={`ครอบบริการถึง · งวดที่ ${row.seq}`}
                                disabled={!!busy || savingCover}
                                onChange={(iso) => setCover(row, { coversTo: iso })} />
                              {/* กฎ/เหตุของเซลล์ — กินทั้งบรรทัดใต้สองช่อง (`.coverNote` ใน module css)
                                  ⚠️ `role="alert"` เฉพาะตอนเป็นเหตุจริง ไม่ใช่ตอนเป็นกฎที่ขึ้นค้างอยู่แล้ว */}
                              {coverNote ? (
                                <small className={styles.coverNote}
                                  data-bad={coverDraftErrors[row.id] ? "yes" : undefined}
                                  role={coverDraftErrors[row.id] ? "alert" : undefined}>
                                  {coverNote}
                                </small>
                              ) : null}
                            </span>
                          )}
                        </td>
                      );
                    })() : null}
                    <td className="num">{fmtMoney(row.amount)}</td>
                    <td>
                      {evidence.length ? (
                        <span className={styles.evidence}>
                          {evidence.map((att, i) => (
                            <a
                              key={`${att.storagePath || "e"}-${i}`}
                              href={`/api/sales-planning/sales-orders/${order.id}/payment-file?installment=${encodeURIComponent(row.id)}&i=${i}`}
                              target="_blank" rel="noreferrer" className={styles.fileLink}
                              title={att.fileName || `หลักฐาน ${i + 1}`}
                            >
                              <Paperclip size={13} aria-hidden="true" />
                              <span className="cell-ellipsis">{att.fileName || `หลักฐาน ${i + 1}`}</span>
                            </a>
                          ))}
                        </span>
                      ) : <span className={styles.none}>{NA}</span>}
                    </td>
                    <td>
                      {row.taxInvoiceNo ? (
                        <>
                          <span className="mono">{row.taxInvoiceNo}</span>
                          {row.taxInvoiceDate ? <small>{fmtDate(row.taxInvoiceDate)}</small> : null}
                          {row.taxInvoiceFile?.storagePath ? (
                            <a
                              href={`/api/sales-planning/sales-orders/${order.id}/payment-file?installment=${encodeURIComponent(row.id)}&doc=tax_invoice`}
                              target="_blank" rel="noreferrer" className={styles.fileLink}
                              title={row.taxInvoiceFile.fileName || "ไฟล์ใบกำกับภาษี"}
                            >
                              <Paperclip size={13} aria-hidden="true" />
                              <span className="cell-ellipsis">{row.taxInvoiceFile.fileName || "ไฟล์ใบกำกับ"}</span>
                            </a>
                          ) : null}
                        </>
                      ) : isOpeningInstallment(row) ? (
                        /* งวดยกมา: ใบกำกับออกในระบบเดิมแล้ว (taxInvoicePending ไม่นับ) — "ยังไม่ออกใบ" สีแดงชวนให้ออกซ้ำ */
                        <span className={styles.none}>
                          {openingInvoiceNote}
                          {order?.historicalInvoiceRef ? <small className="mono">{order.historicalInvoiceRef}</small> : null}
                        </span>
                      ) : (
                        /* งวดที่เงินเข้าแล้วแต่ยังไม่มีใบ = ของค้างจริง (บริษัทเก็บ VAT)
                           ⇒ ต้องเห็นว่าค้าง ไม่ใช่ขีดเงียบ ๆ เหมือนช่องที่ไม่เกี่ยว */
                        /* งวดที่คืนเงินแล้ว (0378) ไม่ใช่ของค้างเอกสาร (review UI-2 · กติกาเดียวกับทะเบียนบัญชี) */
                        ["reported", "confirmed"].includes(row.status) && !installmentRefunded(row)
                          ? <span className={styles.overdue}>ยังไม่ออกใบ</span>
                          : <span className={styles.none}>{NA}</span>
                      )}
                    </td>
                    <td>
                      {/* ⚠️ อ่านจาก `installmentDisplayStatus` ไม่ใช่ `row.status` ตรง ๆ —
                          งวดร่างที่บันทึกเงินไว้แล้วยังเป็น `pending` ใน DB (CHECK ของ 0259)
                          ป้าย "รอชำระ" บนงวดที่มีสลิปแนบอยู่คือจอที่โกหก */}
                      <StatusBadge
                        size="sm"
                        tone={row.preview ? "neutral" : (INSTALLMENT_STATUS_TONES[rowStatus] || "neutral")}
                        label={row.preview ? "ยังไม่เริ่มติดตาม" : (INSTALLMENT_STATUS_LABELS[rowStatus] || rowStatus)}
                      />
                      {/* งวดโมฆะของใบที่ยกเลิก/ถูกแทน (review UI-3) — ป้าย "รอชำระ" ต้องไม่อ่านว่ายังต้องตามเก็บ
                          · งวดยกมาของใบย้อนหลังที่ยกเลิก (มติ 24/09 · mig 0387): ป้าย "ชำระแล้ว"/"บัญชีตีกลับ" ตามค่าในฐาน
                            ต้องบอกว่าโมฆะตามใบ ไม่งั้นอ่านว่าเงินยังนับอยู่ หรือบัญชีเป็นคนตีกลับ */}
                      {!row.preview && installmentVoid(row, order) ? <small>{installmentVoidNote(row, order)}</small> : null}
                      {/* คืนเงินแล้ว (0378) — วันคืน + ใบลดหนี้ต้องเห็นบนแถว (บัญชีถูกถามด้วยเลขนี้) */}
                      {rowStatus === "refunded" ? (
                        <small>
                          คืน {row.refundedOn ? fmtDate(row.refundedOn) : NA}
                          {row.refundCreditNoteNo ? ` · ใบลดหนี้ ${row.refundCreditNoteNo}` : ""}
                        </small>
                      ) : null}
                    </td>
                    <td className={styles.actionCell}>
                      {primary ? (
                        <Button tone="primary" size="sm" disabled={!!busy} onClick={primary.onClick}>
                          {primary.label}
                        </Button>
                      ) : null}
                      {menu.length ? (
                        <RowActionMenu items={menu} busy={!!busy}
                          label={single ? "การจัดการอื่นของงวดนี้" : `การจัดการอื่นของงวดที่ ${row.seq}`} />
                      ) : null}
                    </td>
                  </tr>
                  {/* เหตุผลที่บัญชีตีกลับ — **โชว์เสมอ ไม่ซ่อนในเมนู** เพราะมันคือสิ่งที่
                      บอกว่าต้องแก้อะไรก่อนแจ้งใหม่ (กฎเดียวกับใบสั่งขายที่ถูกตีกลับ) */}
                  {row.status === "rejected" && row.rejectedReason ? (
                    <tr className={styles.detailRow}>
                      {/* ⚠️ ตัวเลขนี้ต้องขยับทุกครั้งที่เพิ่ม/ลดคอลัมน์ — ไม่งั้นแถวเหตุผลตีกลับ
                          กินความกว้างผิดเฉพาะแถวที่ถูกตีกลับ (เคสที่ไม่ได้เจอทุกวัน) */}
                      <td className={styles.detail} colSpan={(single ? 7 : 8) + (showCoverage ? 1 : 0)}>
                        <div className={styles.rejected}>
                          <strong>บัญชีตีกลับ · {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                          <ReadableText text={row.rejectedReason} lines={3} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      {/* ⭐ แถบบันทึกช่วงครอบที่แก้ค้าง — **ไม่ auto-save** (กฎฟอร์มของ repo)
          ขึ้นเฉพาะตอนมีของค้างจริง ⇒ ตารางที่ไม่ได้แตะจะไม่มีแถบนี้มากินที่
          ⚠️ บันทึกทีละงวดตามลำดับ เพราะด่านของ API อ่านงวดพี่น้องสดทุกครั้ง
          ⚠️ งวดที่บันทึกไม่ผ่านจะ **ค้างไว้ในร่างต่อ** ไม่ถูกล้างทิ้งพร้อมของที่สำเร็จ */}
      {coverDirty ? (
        <div className={styles.coverBar}>
          <span>
            แก้ช่วงครอบบริการค้างไว้ {coverDirty} งวด
            {coverDraftError ? ` — ${coverDraftError}` : ""}
          </span>
          <Button variant="ghost" size="sm" disabled={savingCover || !!busy}
            onClick={() => setCoverDrafts({})}>ยกเลิกที่แก้</Button>
          <Button tone="primary" size="sm" disabled={savingCover || !!busy || coverInvalid}
            onClick={saveCoverDrafts}>
            {savingCover ? "กำลังบันทึก…" : "บันทึกช่วงครอบ"}
          </Button>
        </div>
      ) : null}

      {/* ⭐ **ปุ่มนี้เป็นทางกู้ ไม่ใช่ก้าวปกติ** (มติผู้ใช้ 2026-08-19) — งวดถูกสร้างให้
          ตั้งแต่ตอนออกใบจาก QT แล้ว (ดู POST `/api/sales-planning/sales-orders`)
          ⇒ ปกติจะไม่เห็นปุ่มนี้เลย · ที่ยังเหลือไว้เพราะมีสามทางที่ทำให้ใบไม่มีแถว:
          ใบเก่าที่อนุมัติไปก่อน B-4 · QT ที่ยังไม่มีแผนชำระตอนออกใบแล้วมาเพิ่มทีหลัง ·
          และตอนออกใบสร้างไม่สำเร็จ (ตรงนั้นกลืน error ไว้ไม่ให้ล้มทั้งการออกใบ)
          ⚠️ ใบที่ยกเลิก/ตีกลับไม่มีอะไรให้ติดตาม — ด่านเดียวกับที่ route ใช้ */}
      {/* ⚠️ ใบย้อนหลังไม่มีทางกู้นี้ — งวดมาจากฟอร์มคีย์ใบเท่านั้น (route POST ของงวดตีกลับอยู่แล้ว) */}
      {isPreview && canStart && canTrackPayments && !historical ? (
        <>
          <Button tone="accent" size="sm" className={styles.start} onClick={onStart} disabled={!!busy}>
            {busy === "start-payments" ? "กำลังสร้าง…" : "เริ่มติดตามการชำระ"}
          </Button>
          {order?.status !== "approved" ? (
            <p className="form-note">
              ใบนี้ยังไม่มีงวดให้ติดตาม — กดเพื่อยกแผนชำระจากใบเสนอราคามาตั้งเป็นงวด
              แล้วจะได้ช่องกำหนดชำระรายงวดไว้กรอกตอนคุยกับลูกค้า
            </p>
          ) : null}
        </>
      ) : null}

      {reportFor ? (() => {
        /* แถวล่าสุดของตาราง (`live`) — ทั้งคำบนโมดัลและตัวล็อกที่ส่งขึ้น API มาจากแถวเดียวกัน */
        const reportRow = live(reportFor.row);
        const prompt = reportPrompt(reportRow);
        return (
        <Modal open onClose={() => setReportFor(null)}
          title={prepayMode(reportRow)
            ? (single ? "บันทึกว่าลูกค้าจ่ายแล้ว" : `บันทึกการจ่าย งวดที่ ${reportRow.seq}`)
            : prompt
              ? (single ? "บันทึกการรับชำระ" : `บันทึกการรับชำระ งวดที่ ${reportRow.seq}`)
              : (single ? "แจ้งลูกค้าจ่ายแล้ว" : `แจ้งชำระ งวดที่ ${reportRow.seq}`)}
          size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
            {/* ⭐ งวดร่างต้องบอกให้ครบว่า "เก็บไว้แล้วเกิดอะไรต่อ" — ไม่งั้นคนกดจะรอคิว
                บัญชีที่ยังไม่มี แล้วโทรตามว่าทำไมบัญชีไม่ตรวจสักที (มติผู้ใช้ 2026-08-19)
                ⭐ บัญชีบันทึกเอง = จบที่ "ชำระแล้ว" ทันที ไม่มีคิวตรวจ — บอกตรง ๆ แล้วตามด้วยผลลัพธ์ชุดเดียวกับโมดัลรับรอง */}
            <p className="form-note">
              {prepayMode(reportRow)
                ? `ยอด ${fmtMoney(reportRow.amount)} (ยังไม่ยืนยันจนกว่าใบจะอนุมัติ) — เก็บวันจ่ายกับหลักฐานไว้ก่อน ระบบจะส่งให้บัญชีตรวจเองตอนใบสั่งขายอนุมัติ`
                : prompt
                  ? `ยอด ${fmtMoney(reportRow.amount)} — คุณรับรองการชำระได้เอง บันทึกแล้วงวดนี้ขึ้น “ชำระแล้ว” ทันที ไม่ผ่านคิวตรวจของบัญชี`
                  : `ยอด ${fmtMoney(reportRow.amount)} — บัญชีจะตรวจหลักฐานก่อนรับรอง`}
            </p>
            {prompt ? <p className="form-note pre-line">{prompt.detail}</p> : null}
            <label className={styles.field}>
              <span>วันที่ลูกค้าชำระ *</span>
              <DateInput value={reportFor.paidOn} ariaLabel="วันที่ลูกค้าชำระ"
                onChange={(iso) => setReportFor((f) => ({ ...f, paidOn: iso }))} />
            </label>
            <div className={styles.field}>
              <span>หลักฐานการชำระ * (สลิป/ใบนำฝาก)</span>
              <PendingFiles files={reportFor.files} disabled={!!busy} max={8}
                onChange={(files) => setReportFor((f) => ({ ...f, files }))} />
            </div>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setReportFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="primary" disabled={!!busy || !reportFor.paidOn || !reportFor.files.length}
                onClick={async () => {
                  const done = await onAction(live(reportFor.row), "report", { paidOn: reportFor.paidOn, files: reportFor.files });
                  if (done) setReportFor(null);
                }}>
                {busy ? "กำลังบันทึก…" : (prepayMode(reportRow) ? "บันทึกไว้" : prompt ? prompt.confirmLabel : "ส่งให้บัญชีตรวจ")}
              </Button>
            </div>
          </div>
        </Modal>
        );
      })() : null}

      {scheduleFor ? (
        <Modal open onClose={() => setScheduleFor(null)} title="กำหนดชำระ" size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
            <p className="form-note">ใบเสนอราคาระบุแค่สัดส่วนของแต่ละงวด ไม่มีวัน — กรอกที่นี่</p>
            <label className={styles.field}>
              <span>วันครบกำหนด</span>
              <DateInput value={scheduleFor.dueDate} ariaLabel="วันครบกำหนด"
                onChange={(iso) => setScheduleFor((f) => ({ ...f, dueDate: iso }))} />
            </label>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setScheduleFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="primary" disabled={!!busy}
                onClick={async () => {
                  const done = await onAction(live(scheduleFor.row), "schedule", { dueDate: scheduleFor.dueDate || null });
                  if (done) setScheduleFor(null);
                }}>บันทึก</Button>
            </div>
          </div>
        </Modal>
      ) : null}


      {/* ⭐ แนบคำร้องที่ขอไว้แล้ว (B-5) — โชว์ **ยอดของคำร้อง** คู่กับยอดของงวดเสมอ
          เพราะสองอย่างนี้ไม่จำเป็นต้องเท่ากัน (ขอวางบิลรวมสองงวดก็มี) ⇒ คนกดต้องเห็น
          ทั้งคู่ก่อนตัดสิน ไม่ใช่ให้ระบบเดาว่าอันไหนคู่กัน */}
      {linkFor ? (
        <Modal open onClose={() => setLinkFor(null)} title="แนบคำร้องขอเอกสารการเงิน" size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
            <p className="form-note">
              งวดที่ {linkFor.row.seq} · {fmtMoney(linkFor.row.amount)} — เลือกคำร้องของใบเสนอราคาเดียวกันนี้
            </p>
            <label className={styles.field}>
              <span>คำร้อง</span>
              <SearchableSelect
                value={linkFor.billingRequestId}
                onChange={(v) => setLinkFor((f) => ({ ...f, billingRequestId: v }))}
                options={linkableRequests.map((r) => ({
                  value: r.id,
                  label: [r.docNo || "ร่าง", r.title, r.billAmount ? fmtMoney(r.billAmount) : null]
                    .filter(Boolean).join(" · "),
                  search: `${r.docNo || ""} ${r.title || ""}`,
                }))}
                placeholder="เลือกคำร้อง"
                emptyText="ไม่มีคำร้องที่ยังไม่ถูกแนบ"
                ariaLabel="คำร้องขอเอกสารการเงินที่จะแนบ"
              />
            </label>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setLinkFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="primary" disabled={!!busy || !linkFor.billingRequestId}
                onClick={async () => {
                  const done = await onAction(live(linkFor.row), "link", { billingRequestId: linkFor.billingRequestId });
                  if (done) setLinkFor(null);
                }}>แนบ</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ⚠️ ถอนคำรับรอง = กลับคำเรื่องเงินที่เคยบอกว่ารับแล้ว (ยอดเก็บแล้วลด · "จ่ายถึง" อาจถอย) และเป็นก้าวแรกของการปลดล็อก
          การยกเลิกใบย้อนหลังที่งวดปกติรับรองแล้ว (historicalCancelBlock — ใบ pipeline ยกเลิกได้อยู่แล้วตั้งแต่ PR3)
          ⇒ ต้องมีเหตุผลเท่ากับตอนตีกลับ ไม่ใช่กดแล้วจบ */}
      <InstallmentConfirmDialog
        open={!!confirmFor}
        row={live(confirmFor?.row)}
        order={order}
        multi={rows.length > 1}
        /* ใบย้อนหลัง = โหมดของโมดัลตัวเดิม · ภาพหลังรับรองคิดจากงวดทั้งใบ (แผงนี้ถือครบอยู่แล้ว) */
        historical={historical}
        outlook={confirmFor ? installmentConfirmOutlook(live(confirmFor.row), saved) : null}
        busy={!!busy}
        error={error}
        onClose={() => setConfirmFor(null)}
        onConfirm={async (target) => {
          const done = await onAction(target, "confirm");
          if (done) setConfirmFor(null);
        }}
      />

      {/* ⭐ ปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377) — โมดัลอยู่ในแผง (ไม่ใช่ page.js) · ตัวแก้คือ QuotationInstallments
          โหมด replan (ฟอร์มงวดตัวเดียวของระบบ) · error ของ API ขึ้นในโมดัล (แถบของหน้าอยู่ใต้โมดัล)
          ⚠️ ปุ่ม "ตรวจผลก่อนบันทึก" เปิดโมดัลยืนยันที่บอกผลก่อน แล้วจึงยิง */}
      {replan ? (
        <Modal open onClose={() => setReplan(null)} title="ปรับแผนงวดชำระ" size="xl"
          dismissible={!busy && !replan.confirming}>
          <div className={styles.dialog}>
            {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
            {replanBaseStale ? (
              <StatusNotice tone="warning">
                {REPLAN_STALE_MESSAGE}{" "}
                <Button size="sm" variant="quiet" onClick={resetReplan}>เริ่มใหม่จากงวดล่าสุด</Button>
              </StatusNotice>
            ) : null}
            <p className="form-note">
              {order?.orderNumber} · ยอดใบ {fmtMoney(order?.totalAmount)} (รวม VAT) — งวดที่รับเงินแล้ว รอบัญชีตรวจ
              หรือมีเอกสารผูกถูกล็อกไว้ ปรับได้เฉพาะงวดที่ยังไม่มีการชำระ · ใบยังอนุมัติอยู่ ยอด Actual ไม่เปลี่ยน
            </p>
            <QuotationInstallments
              mode="replan"
              view={replanBuild.view}
              value={replan.draft}
              onChange={(draft) => patchReplan({ draft })}
              entryUnit={replan.unit}
              onEntryUnitChange={(unit) => patchReplan({ unit })}
              totals={replanBuild.totals}
              showCoverage={showCoverage}
              disabled={!!busy || replan.confirming}
            />
            {replanBuild.error ? <StatusNotice tone="warning">{replanBuild.error}</StatusNotice> : null}
            {replanBuild.warnings.length ? <StatusNotice tone="info">{replanBuild.warnings.join(" · ")}</StatusNotice> : null}
            <label className={styles.field}>
              <span>เหตุผลที่ปรับแผน *</span>
              <Textarea rows={3} value={replan.reason} maxLength={REPLAN_MAX_REASON} disabled={!!busy || replan.confirming}
                placeholder={`เช่น ลูกค้าขอแบ่งงวดที่เหลือเป็นรายเดือน — อย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
                onChange={(event) => patchReplan({ reason: event.target.value })} />
            </label>
            {replan.reason && replanReasonProblem ? <p className="form-note">{replanReasonProblem}</p> : null}
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setReplan(null)} disabled={!!busy || replan.confirming}>ยกเลิก</Button>
              <Button tone="primary"
                disabled={!!busy || replan.confirming || !!replanBuild.error || !!replanReasonProblem || replanBaseStale}
                title={replanBuild.error || replanReasonProblem || undefined}
                onClick={submitReplan}>
                {busy === "installment-replan" ? "กำลังบันทึก…" : "ตรวจผลก่อนบันทึก"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ⭐ ยกเงินจากใบที่ยกเลิก (PR3 · mig 0378) — โมดัลอยู่ในแผง (ไม่ใช่ page.js) · แผนก่อน/หลังจาก applyCarryIn ตัวเดียวกับ route
          ⚠️ ปุ่ม "ตรวจผลก่อนยก" เปิดโมดัลยืนยันที่บอกผลก่อน แล้วจึงยิง · error ของ API ขึ้นในโมดัล (แถบของหน้าอยู่ใต้โมดัล) */}
      {carry ? (
        <Modal open onClose={() => setCarry(null)} title={CARRY_BUTTON} size="lg"
          dismissible={!busy && !carry.confirming}>
          <div className={styles.dialog}>
            {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
            {carryBaseStale ? (
              <StatusNotice tone="warning">
                งวดของใบนี้หรือใบที่ยกเลิกเพิ่งถูกแก้จากอีกหน้าต่าง — แผนที่เห็นอิงข้อมูลเก่า{" "}
                <Button size="sm" variant="quiet" onClick={resetCarry}>เริ่มใหม่จากงวดล่าสุด</Button>
              </StatusNotice>
            ) : null}
            <p className="form-note">
              {order?.orderNumber} · ยอดใบ {fmtMoney(order?.totalAmount)} (รวม VAT) — งวดที่ยกมาย้ายมาทั้งแถว (สลิป · คำรับรอง ·
              ใบกำกับคงเดิม) · แผนที่เหลือของใบนี้หักงวดที่ยังไม่มีการชำระงวดแรก ๆ ก่อน · ยอด Actual ไม่เปลี่ยน
            </p>
            {carry.sources.length > 1 ? (
              <div className={styles.field}>
                <span>ใบที่ยกเลิก (ดีลเดียวกัน)</span>
                <ChoiceChips value={carry.sourceId} onChange={pickCarrySource} ariaLabel="ใบที่ยกเลิกที่จะยกเงินมา"
                  disabled={!!busy || carry.confirming}
                  options={carry.sources.map((src) => ({ value: src.id, label: `${src.orderNumber} · ${fmtMoney(src.amount)}` }))} />
              </div>
            ) : null}
            {carrySource ? (
              <div className={styles.field}>
                <span>งวดที่ยกจาก {carrySource.orderNumber}</span>
                <ChoiceChips multiple value={carry.ids} onChange={(ids) => patchCarry({ ids })} ariaLabel="งวดที่จะยกมา"
                  disabled={!!busy || carry.confirming}
                  options={carrySource.rows.map((r) => ({
                    value: r.id,
                    label: `${r.label || `งวดที่ ${r.seq}`} · ${fmtMoney(r.amount)} · ${INSTALLMENT_STATUS_LABELS[r.status] || r.status}`,
                  }))} />
              </div>
            ) : null}
            {carryBuild && !carryBuild.error ? (
              <TableScroll surface="auto" cells="stacked" minWidth={560}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.seqCol}>งวด</th>
                      <th>รายละเอียด</th>
                      <th className="num">ก่อน</th>
                      <th className="num">หลังยก</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carryBuild.view.map((r) => (
                      <tr key={r.id} className={r.carried ? styles.carriedRow : undefined}>
                        <td className={styles.seqCol}>{r.seq}</td>
                        <td>
                          <strong>{r.label}</strong>
                          <small>{r.carried ? `ยกมาจาก ${carrySource?.orderNumber}` : fmtPercent(r.percent)}</small>
                        </td>
                        <td className="num">{r.carried ? NA : fmtMoney(r.beforeAmount)}</td>
                        <td className="num">{fmtMoney(r.amount)}</td>
                        <td>
                          <StatusBadge size="sm" tone={INSTALLMENT_STATUS_TONES[r.status] || "neutral"}
                            label={INSTALLMENT_STATUS_LABELS[r.status] || r.status} />
                        </td>
                      </tr>
                    ))}
                    {carryBuild.removed.map((r) => (
                      <tr key={`removed-${r.id}`} className={styles.removedRow}>
                        <td className={styles.seqCol}>{r.seq}</td>
                        <td><strong>{r.label || `งวดที่ ${r.seq}`}</strong><small>ลบ — เงินที่ยกมาครอบแทน</small></td>
                        <td className="num">{fmtMoney(r.amount)}</td>
                        <td className="num">{NA}</td>
                        <td><StatusBadge size="sm" tone="neutral" label="ลบ" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : null}
            {carryBuild?.error ? <StatusNotice tone="warning">{carryBuild.error}</StatusNotice> : null}
            {/* สลิปชื่อซ้ำกับงวดของใบนี้ (review MONEY-1 · carryDuplicates) — ไม่บล็อก แต่ต้องเห็นก่อนกด */}
            {carryBuild?.warnings?.length ? <StatusNotice tone="info">{carryBuild.warnings.join(" · ")}</StatusNotice> : null}
            <label className={styles.field}>
              <span>เหตุผลที่ยกเงิน *</span>
              <Textarea rows={3} value={carry.reason} maxLength={REPLAN_MAX_REASON} disabled={!!busy || carry.confirming}
                placeholder={`เช่น ลูกค้ายกเลิกใบเดิมแล้วออกใบใหม่แทน — อย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
                onChange={(event) => patchCarry({ reason: event.target.value })} />
            </label>
            {carry.reason && carryReasonProblem ? <p className="form-note">{carryReasonProblem}</p> : null}
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setCarry(null)} disabled={!!busy || carry.confirming}>ยกเลิก</Button>
              <Button tone="primary"
                disabled={!!busy || carry.confirming || !carryBuild || !!carryBuild.error || !!carryReasonProblem || carryBaseStale}
                title={carryBuild?.error || carryReasonProblem || undefined}
                onClick={submitCarry}>
                {busy === "installment-carry" ? "กำลังยก…" : "ตรวจผลก่อนยก"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ⭐ บันทึกคืนเงินของงวดใบที่ยกเลิก (PR3) — โมดัลตัวเดียวกับคิว "เงินค้างจากใบที่ยกเลิก" บนทะเบียนการชำระ */}
      <InstallmentRefundDialog
        open={!!refundFor}
        row={live(refundFor)}
        order={order}
        todayIso={todayIso}
        busy={!!busy}
        error={error}
        onClose={() => setRefundFor(null)}
        onSubmit={async (values) => {
          const done = await onAction(live(refundFor), "refund", values);
          if (done) setRefundFor(null);
        }}
      />

      {/* ⭐ โมดัลใบกำกับตัวเดียวกับคิวบนทะเบียนการชำระ — หนึ่งฟอร์ม สองทางเรียก
          ⚠️ ปุ่ม "ลบใบกำกับ" มีที่นี่ด้วย เพราะแนบผิดใบแล้วต้องถอนได้จากที่ที่เห็นของ */}
      <TaxInvoiceDialog
        open={!!invoiceFor}
        row={live(invoiceFor)}
        order={order}
        todayIso={todayIso}
        busy={!!busy}
        error={error}
        onClose={() => setInvoiceFor(null)}
        onSubmit={async (values) => {
          const done = await onAction(live(invoiceFor), "tax-invoice", values);
          if (done) setInvoiceFor(null);
        }}
        onClear={async () => {
          const done = await onAction(live(invoiceFor), "tax-invoice-clear");
          if (done) setInvoiceFor(null);
        }}
      />

      <ReasonDialog
        open={!!unconfirmFor}
        title="ถอนคำรับรองการชำระ"
        /* ผลที่ตรวจได้ (PR1): ยอดเก็บแล้วของใบที่ลด · ใบบริการบอก "จ่ายถึง" ที่ถอย — ตัวเดียวกับ paidThrough ของด่านนัด
           🐞 คำเดิมสัญญาว่าถอนแล้วใบจะกลับมาย้อนการอนุมัติได้ — ตั้งแต่ 0376 ด่านนั้นไม่ถามงวดที่รับรองแล้ว (เป็นเท็จ) */
        description={unconfirmFor ? installmentUnconfirmOutcome(live(unconfirmFor.row), saved, { serviceRounds: showCoverage }) : ""}
        label="เหตุผลที่ถอนคำรับรอง"
        value={unconfirmFor?.reason || ""}
        onChange={(reason) => setUnconfirmFor((f) => ({ ...f, reason }))}
        submitError={error}
        onClose={() => setUnconfirmFor(null)}
        onConfirm={async () => {
          const done = await onAction(live(unconfirmFor.row), "unconfirm", { reason: unconfirmFor.reason });
          if (done) setUnconfirmFor(null);
        }}
        confirmLabel="ยืนยันถอนคำรับรอง"
        placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
        minLength={MIN_REJECT_REASON}
        maxLength={500}
        tone="danger"
        busy={!!busy}
      />

      <ReasonDialog
        open={!!rejectFor}
        title="ตีกลับการแจ้งชำระ"
        description="งวดนี้จะกลับไปให้ฝ่ายขายแก้แล้วแจ้งใหม่"
        /* งวดยกมา: บอกทางออกทั้งสองแบบก่อนกด — ตัวเดียวกับคิวบนทะเบียนการชำระ */
        detail={rejectFor && isOpeningInstallment(rejectFor.row) ? historicalOpeningRejectNote : undefined}
        label="เหตุผลที่ตีกลับ"
        value={rejectFor?.reason || ""}
        onChange={(reason) => setRejectFor((f) => ({ ...f, reason }))}
        submitError={error}
        onClose={() => setRejectFor(null)}
        onConfirm={async () => {
          const done = await onAction(live(rejectFor.row), "reject", { reason: rejectFor.reason });
          if (done) setRejectFor(null);
        }}
        confirmLabel="ยืนยันตีกลับ"
        placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
        minLength={MIN_REJECT_REASON}
        maxLength={500}
        tone="danger"
        busy={!!busy}
      />
    </DetailCard>
  );
}

"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft, ArrowUpRight, CalendarClock, CalendarDays, CalendarRange, Columns3, FileText, HandCoins, Link2,
  Paperclip, Receipt, TriangleAlert, Undo2, Unlink, Wallet, XCircle,
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
import thaiText from "@/components/ThaiText";
import { fmtDate, fmtMoney, fmtPercent, naText, NA } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import InstallmentConfirmDialog, { installmentConfirmPrompt } from "./InstallmentConfirmDialog";
import TaxInvoiceDialog from "./TaxInvoiceDialog";
import InstallmentRefundDialog from "./InstallmentRefundDialog";
import QuotationInstallments from "./QuotationInstallments";
import BillingStateBadge from "./BillingStateBadge";
import useInstallmentDateMode from "./installmentDates/useInstallmentDateMode";
import InstallmentDateCell, { InstallmentDateEntry } from "./installmentDates/InstallmentDateCell";
import InstallmentDateFrame, { InstallmentDateExpandRow } from "./installmentDates/InstallmentDateFrame";
import InstallmentDateFill from "./installmentDates/InstallmentDateFill";
import {
  InstallmentDateBar, InstallmentDateButton, InstallmentDateHint, InstallmentDateSheet,
} from "./installmentDates/InstallmentDateChrome";
import BillingPolicyStrip from "./installmentDates/BillingPolicyStrip";
import RequireBillingModal from "./installmentDates/RequireBillingModal";
import CoverageSplitModal from "./CoverageSplitModal";
import CoverageTimeline from "./historicalWizard/CoverageTimeline";
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
  NO_BILLING_TEXT, SKIP_TEXT, billingNeed, billingState, canRequestBilling, dateModeOf, formatBillingDate, installmentNeed,
  ledgerFlags, needExceptionActions, weekendNote,
} from "@/lib/sales/billingRule";
import {
  billingCutoffNote, calendarGapHead, dateLockView, dueSourceOf, fillInputRows, fillTargetsOf,
} from "@/lib/sales/installmentDateDrafts";
import { billingRequestHref } from "@/lib/sales/billingRequestHref";
import {
  INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES, MIN_REJECT_REASON,
  billingRequestDead, billingRequestedIds, installmentActionError, installmentBillingRequested, installmentConfirmOutlook,
  installmentDisplayStatus, installmentPlanDrift,
  installmentPrepaid, installmentRefunded, installmentReportOutcome, installmentScheduleAllowed, installmentStartBlock,
  installmentUnconfirmOutcome,
  installmentVoid, installmentVoidNote, openingCoverageEnd, paymentNotRequired, paymentRollup, pipelineInstallmentLock, previewInstallments,
  revisedInstallmentsNote, strandedInstallment,
} from "@/lib/sales/salesOrderPayments";
import { COVERAGE_SPLIT_ERRORS, coverageRollup, coverageWarnings, splitCoverageByPeriod } from "@/lib/sales/paymentCoverage";
import { orderHasServiceRounds, orderOnServiceLine } from "@/lib/sales/serviceOrders";
import {
  SERVICE_KIND_NOT_SERVICE, periodSpan, serviceLineRole, servicePeriodOf, serviceSetupEditError, serviceSetupFieldId,
  serviceSetupFlow,
} from "@/lib/sales/serviceSetup";
import { HISTORICAL_APPROVER_LABEL, historicalInstallmentLock, isHistoricalOrder, isOpeningInstallment } from "@/lib/sales/historicalOrders";
import { historicalOpeningRejectNote } from "@/lib/sales/historicalOrderCopy";
import { openingInvoiceNote } from "@/lib/sales/taxInvoice";
import styles from "./SalesOrderPaymentPanel.module.css";

/* ค่าหลอกให้ด่าน `refund` ตรวจเฉพาะ "ใคร/งวดไหน/ใบไหน" (เมนูแถว) — ค่าจริงตรวจในโมดัลด้วย refundValueError ตัวเดียวกับ API
   ⚠️ เลขใบลดหนี้หลอกไว้ด้วย ไม่งั้นงวดที่มีใบกำกับจะไม่มีเมนูให้เปิดโมดัลไปกรอกเลขนั้น (ทางตัน) */
const REFUND_PROBE = Object.freeze({ refundedOn: "2026-01-01", reason: "x".repeat(MIN_REJECT_REASON), creditNoteNo: "x" });

/* สถานะวางบิลที่ "ยังต้องวางบิล" (billingState ของ billingRule.js) — ป้าย/ปุ่มขอใบวางบิลของงวดถัดไปอ่านชุดนี้ */
const BILLING_OPEN = Object.freeze(["late", "today", "soon", "upcoming"]);

/* ป้ายเตือนวันหยุดสุดสัปดาห์ — **เตือนอย่างเดียว ไม่เลื่อนวัน** (มติเจ้าของ 26/09 ข้อ 1) · คำมาจาก weekendNote ตัวเดียวกับตัวเลือกรอบ */
function WeekendBadge({ iso }) {
  const note = weekendNote(iso);
  return note ? <StatusBadge size="sm" tone="warning" icon={TriangleAlert} iconSize={11} label={note} /> : null;
}

/* ชื่องวดสั้น ๆ ("งวดสุดท้าย" · "มัดจำ 50%" · "งวดที่ 12") ห้ามแตกบรรทัด — กำหนดวางบิลรอบสอง 26/09
   🐞 สถานะ "เลยรอบวางบิล" คอลัมน์วันวางบิลกว้างขึ้น (ป้าย + ปุ่มขอใบวางบิล) ⇒ ตารางบีบคอลัมน์ชื่อจนขึ้น "งวด / สุดท้าย"
     สองบรรทัด · ICU ตัดตรงรอยคำถูกแล้ว (thaiWrap ไม่ช่วย — ไม่ใช่คำทับศัพท์) แต่คนอ่านเห็นเป็นชื่อเดียวที่ขาดกลาง
   ⭐ ท่าเดียวกับ `.nowrap` ของทั้งระบบ (วันที่ · รหัส · ป้าย): ชิ้นที่ตัดแล้วอ่านไม่ออกห้ามตัด ที่เหลือบีบได้ตามปกติ
   ⚠️ เฉพาะชื่อสั้น — ชื่องวดพิมพ์เองจากใบเสนอราคายาวได้ ("ชำระส่วนที่เหลือหลังส่งมอบงานครบ…") ถ้า nowrap ทั้งหมด
     คอลัมน์จะกว้างตามชื่อที่ยาวที่สุดแล้วดันทั้งตาราง ⇒ ชื่อยาวตัดตามรอยคำเหมือนเดิม (thaiText กันคำทับศัพท์) */
const LABEL_NOWRAP_MAX = 16;
function InstallmentLabel({ label }) {
  const text = String(label || "");
  return text.length <= LABEL_NOWRAP_MAX
    ? <strong className={styles.nowrap}>{text}</strong>
    : <strong>{thaiText(text)}</strong>;
}

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
  error = "", onClearError, onDatesDirty, onRefreshOrder,
  /* ── งานบริการรายบรรทัด (mig 0392 · แผน §2.8) ─────────────────────────────────────────────────────────
     `servicePeriod` `{from,to}|null` = ช่วงบริการของใบ (ตั้งที่ตารางรายการ) · `setupFlow` = `setup.data.flow` ของหน้าใบ
     ⭐ ไม่ส่งสองตัวนี้ (undefined — GET งานบริการยังโหลดไม่เสร็จ) = คิดจากใบเองด้วยตัวตัดสินชุดเดียวกับ GET
       (`servicePeriodOf` · `serviceSetupFlow`) ⇒ แผงไม่กะพริบหายระหว่างรอ และตอบตรงกับ GET เสมอ
     `highlight` Map `fieldId → ข้อความ` ของข้อที่ติดหลังกดยื่น (กติกา: แดงหลังกดเท่านั้น — หน้าใบส่งมาเฉพาะตอนนั้น)
     `onFillCoverage({ mode, plan })` → Promise<boolean> = PATCH …/installments `{action:'fill-coverage'}` ของหน้าใบ
     `canEditSetup` = สิทธิ์แก้ใบนี้ (`canEditSalesPlanning && inSalesEditScope`) — ไม่ส่ง = ใช้ `canStart` (หน้าใบส่ง canEdit ตัวเดียวกัน)
     `onOpenTab(key)` (ไม่บังคับ) = สลับแท็บของหน้าใบ — ลิงก์ "แก้ที่แท็บภาพรวม" ข้างบรรทัดช่วงบริการ
     `dateFillRequest` (ออบเจกต์ใหม่ต่อการกด · null = ไม่มี) = "ไปแก้" ของข้อวันงวดที่รวมหลายงวดในแผงแดง ⇒ เข้าโหมดตั้งวันงวดแล้วเปิดแผง
       "เติมวันงวดที่ว่าง…" (#1846) · `includeDated: true` = เปิดพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย"
       · ตอบทุกคำขอด้วย `onDateFillRequestDone(opened)` (หน้าล้างคำขอ · เปิดไม่ได้ = หน้าไปที่ช่องแทน) */
  servicePeriod, setupFlow, highlight = null, onFillCoverage, canEditSetup = canStart, onOpenTab,
  dateFillRequest = null, onDateFillRequestDone,
}) {
  const [reportFor, setReportFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [unconfirmFor, setUnconfirmFor] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  // ใบกำกับภาษีของงวด (mig 0348) — โมดัลตัวเดียวกับที่ทะเบียนการชำระของบัญชีใช้
  const [invoiceFor, setInvoiceFor] = useState(null);
  /* โมดัลขอบเขต "งวดนี้ต้องวางบิล…" (รุ่นสี่ · ลูกค้าไม่ต้องวางบิลแต่ขอใบงวดเดียว) — งวดที่เปิดเมนู */
  const [needFor, setNeedFor] = useState(null);
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
  // แบ่งช่วงครอบตามช่วงบริการ (mig 0392) — พรีวิวคิดสดทุกครั้งที่วาด (409 แล้วหน้าดึงงวดสด พรีวิวเปลี่ยนตาม)
  const [splitOpen, setSplitOpen] = useState(false);

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
     ยังตรวจครบทุกข้อ (ใบต้องอนุมัติแล้ว · ยอดต้องไม่เกินใบ) เหมือนเปิดเองจาก /requests
     ⭐ ประกอบที่ `lib/sales/billingRequestHref.js` ที่เดียว (กำหนดวางบิลรอบสอง) — ปุ่ม "ขอใบวางบิลงวดนี้" ในแถวกระดิ่ง
       ใช้ตัวเดียวกัน · เดิมเป็น closure ในไฟล์นี้ ถ้าเก็บไว้สองที่ ชื่อพารามิเตอร์เพี้ยนหากันได้โดยไม่มีเทสต์ตัวไหนแดง
       (เทสต์ปุ่มในกระดิ่งเทียบกับ lib อย่างเดียว) */
  const newBillingRequestHref = (row) => billingRequestHref(order, row);
  /* เลขเอกสารที่บัญชีออกให้จริงของคำร้อง — สิ่งที่ SA เอาไปคุยกับลูกค้าคือเลขใบวางบิล ไม่ใช่เลขคำร้อง */
  const requestDocsNote = (linked) => {
    const issued = (linked?.items || []).map((it) => it.docNumber).filter(Boolean);
    return issued.length ? issued.join(" · ") : "รอบัญชีออกเอกสาร";
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

  /* ── กำหนดวางบิล (mig 0389 · มติเจ้าของ 25–26/09 · ม็อก mockups/billing-cycle จอ C) ─────────────────────────────
     ⭐ **สองช่องแยกกัน** — วันวางบิล (`billingDate` · คอลัมน์ใหม่) ≠ กำหนดชำระ (`dueDate`) · ป้ายแดง "เลยกำหนด" ของแถว
       การ์ด และด่านช่าง (visitGate) อ่าน dueDate ช่องเดียวเหมือนเดิม · วันวางบิลที่ผ่านไปแล้ว = "เลยรอบวางบิล" โทนเตือน
       (คำ/สีมาจาก billingRule.js ผ่าน BillingStateBadge — ห้ามเขียนเองที่นี่)
     ⭐ รอบของลูกค้าอ่านสดจากทะเบียน (route ของหน้าใบ) · ยังไม่ตั้ง = กรอกได้ทั้งสองช่อง (ไม่มีอะไรคิดให้) + ข้อความชวนตั้ง
       (มติข้อ 7: ไม่บังคับเลือกรอบ — บางที่ไม่มีรอบวาง)
     ⭐ (28/09 ข้อ 17) **ใช้เหมือนกันทุกลูกค้า ทุกใบ ทุกสาย** — ไม่มีโค้ดดูสายของใบ · คอลัมน์วันวางบิลขึ้นทุกใบที่ยังเดิน
     ⚠️ ฐานยังไม่รัน 0389 (`billingSchemaReady === false`) = ไม่วาดของใหม่เลย — ชวนตั้งรอบ/เลือกรอบที่ยังบันทึกไม่ได้คือทางตัน
     ⚠️ ใบที่ตาย (ยกเลิก/ถูกออก Rev. ทับ) ไม่มีอะไรให้วางบิล — คอลัมน์และบรรทัดรอบไม่ขึ้น (แถวของมันโมฆะแล้ว)
       · **รวมใบย้อนหลังที่ยกเลิก** (review S3 26/09) — `deadPipeline` ไม่นับใบย้อนหลัง (แถบเงิน/จ่ายถึงของมันยังขึ้นตามเดิม)
         แต่รอบวางบิลของใบที่ยกเลิกแล้วไม่มีความหมาย และคอลัมน์ที่ค้างอยู่ทำให้ลิงก์คำร้องของงวดโมฆะหายจากทั้งสองคอลัมน์ */
  const deadOrder = deadPipeline || (historical && order?.status === "cancelled");
  const billingOn = order?.billingSchemaReady !== false && !deadOrder && !movedAway;
  /* ⭐ กติกาของลูกค้า **ค่าดิบ** จากทะเบียน (รุ่นสี่ · มติเจ้าของ 29/09 แบบ A "ต้องวางบิลไหม") — ทุกตัวถามของ billingRule.js
       รับค่าดิบทุกรุ่น (null = ยังไม่ระบุ · { credit:false } รูปเดิม · รุ่นสอง · { v:4, need, … })
       ⚠️ ห้ามผ่าน `pickerRuleOf`/`effectiveBillingRule` (ตัวอ่านรุ่นสอง — รุ่นสี่ที่เขียนแทนไม่ได้กลายเป็น null = "ยังไม่ระบุ" เงียบ ๆ)
     · ตัวแก้วันของงวดเปิดตาม `dateModeOf` (ไม่ต้องวางบิล = กำหนดชำระนำ · รูปเดิม/ยังไม่ระบุ = กำหนดชำระนำ วันวางบิลไม่บังคับ ·
       มีรอบ/ทุกวัน = วันวางบิลนำเหมือนเดิม)
     ⚠️ ห้ามอ่านช่องในของกติกาตรง ๆ — ถามตัวช่วย (billingNeed · installmentNeed · canRequestBilling · needExceptionActions) */
  const billingRule = billingOn ? (order?.customer?.billingRule ?? null) : null;
  /* ฐานรัน 0393 แล้ว (ธงของ GET ใบ · billingPolicySchema) — ก่อนนั้นไม่มีติ๊ก "งวดนี้ไม่ต้องวางบิล" และตอบ "ต้องวางบิลไหม" ไม่ได้ */
  const billingSkipReady = billingOn && order?.billingSkipReady === true;
  /* ลูกค้าไม่ต้องวางบิล — หัวคอลัมน์บอกครั้งเดียว "(ไม่ต้องวางบิล)" แถวเป็นขีด (§3.4) */
  const billingNeedOf = billingNeed(billingRule);
  /* คอลัมน์ "วันวางบิล" — **ขึ้นทุกใบที่ยังเดิน** (มติ 28/09 ข้อ 17) · ว่าง = ขีด · ไม่ขึ้นกับรอบของลูกค้าหรือว่ามีงวดไหนมีวันแล้ว
     🐞 เดิมซ่อนเมื่อลูกค้าไม่มีรอบ/ไม่มีเครดิตและยังไม่มีงวดไหนมีวัน ⇒ ใบสินค้าเกือบทั้งหมดไม่มีช่องวันวางบิลให้เห็นหรือแตะเลย
       ("ดูเหมือนใช้กับบริการอย่างเดียว" — ใบที่มีวันวางบิลวันนั้นมีแค่ใบบริการ 4 ใบ) */
  const billingColumn = billingOn;
  const billingColumnNote = !billingColumn ? ""
    : { notNeeded: NO_BILLING_TEXT, optional: "ไม่บังคับ" }[dateModeOf(billingRule).billingColumn] || "";
  /* สิทธิ์ตั้งรอบของลูกค้า — ธงจาก GET ของหน้าใบ (`canEditCustomerBillingRule` ตัวเดียวกับ API ตั้งรอบ)
     ⇒ ไม่มีสิทธิ์ = ไม่มีลิงก์ "ตั้งกำหนดวางบิล" (กติกา "ไม่มีสิทธิ์ = ไม่วาด") · เห็นแค่ข้อความชวน */
  const canSetBillingRule = order?.canEditBillingRule === true;
  const customerHref = order?.customerId ? `/database/customers/${order.customerId}` : "";
  /* ลิงก์ "ตั้งกำหนดวางบิล" เปิดแท็บใหม่ (ร่างวันงวดของโหมดตั้งวันต้องไม่หาย) ⇒ กลับมาที่แท็บนี้ (focus / visibilitychange)
     หลังเคยกดลิงก์นั้น = ดึงใบสด (`onRefreshOrder` = `refreshOrder` ของหน้า — ไม่แตะฟอร์มที่พิมพ์ค้าง · ร่างวันงวดผูกด้วย id อยู่ต่อ)
     ท่าเดียวกับหน้าสร้าง SO (`registryOpened` + `termsBusy`) · สองเหตุการณ์มาพร้อมกันตอนสลับแท็บ — `refreshing` กันยิงซ้ำ */
  const registryOpened = useRef(false);
  const refreshing = useRef(false);
  const markRegistryOpened = () => { registryOpened.current = true; };
  const refreshRef = useRef(onRefreshOrder);
  refreshRef.current = onRefreshOrder;
  useEffect(() => {
    const onReturn = async () => {
      if (!registryOpened.current || refreshing.current || document.visibilityState !== "visible") return;
      refreshing.current = true;
      try { await refreshRef.current?.(); } finally { refreshing.current = false; }
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);
  const customerCode = String(order?.customer?.arCode || "").trim();
  /* "ขอใบวางบิลแล้ว" = ผูกคำร้องที่ยังมีชีวิต (ยกเลิกคำร้องไม่ล้างลิงก์ — ตัวตัดสินตัดใบที่ตายทิ้งเอง) */
  const billingRequested = (row) => installmentBillingRequested(row, requestById);
  const billingStateOf = (row) => billingState(row, { todayIso, requested: billingRequested(row) });
  /* อ่านคำร้องของงวดไม่ขึ้น (`billingRequestsError`) — งวดที่ผูกคำร้องที่หาไม่เจอ **ไม่รู้** ว่าขอแล้วหรือยัง
     ⇒ ห้ามตัดสินว่า "ยังไม่ขอ" (ประกาศ/ป้าย "เลยรอบวางบิล … ยังไม่ขอใบวางบิล" ข้างบรรทัด "อ่านคำร้องไม่สำเร็จ" = เตือนผิด)
     · ไม่นับเข้าเลยรอบ/งวดถัดไป และไม่ขึ้นป้ายสถานะ — บรรทัดใต้ชื่องวดบอกเหตุแทน */
  const billingUnknown = (row) => Boolean(order?.billingRequestsError && row?.billingRequestId
    && !requestById.has(row.billingRequestId));
  /* งวดถัดไปที่ต้องวางบิล — ป้าย "อีก n วัน" กับปุ่ม "ขอใบวางบิลงวดนี้" ขึ้นที่งวดนี้งวดเดียว (ม็อก C: ใบ 12 งวดไม่ขึ้นป้าย
     ทั้งตาราง) · งวดที่ถึงรอบวันนี้/ใกล้ถึง/เลยรอบ ขึ้นเสมอ เพราะเป็นเรื่องที่ต้องทำตอนนี้ */
  const nextBillingId = billingOn
    ? liveRows
      .filter((r) => r.billingDate && !billingUnknown(r) && BILLING_OPEN.includes(billingStateOf(r).key))
      .sort((a, b) => String(a.billingDate).localeCompare(String(b.billingDate)) || Number(a.seq) - Number(b.seq))[0]?.id || null
    : null;
  const lateBilling = billingOn ? liveRows.filter((r) => !billingUnknown(r) && billingStateOf(r).key === "late") : [];
  /* ปุ่ม "ขอใบวางบิลงวดนี้" ในเซลล์วันวางบิล — งวดที่มีวันวางบิลและยังต้องวาง (ม็อก C) · ด่านเดียวกับเมนูแถว (`link`)
     ⇒ ฝ่ายบัญชีไม่เห็น (ขอใบวางบิลเป็นงานของฝ่ายขาย) · มีคำร้องผูกอยู่แล้ว (แม้ตายแล้ว) = ถอดก่อน ไม่ขอซ้อน */
  const billingAskInCell = (row) => {
    if (!billingOn || row.preview || row.billingRequestId || !row.billingDate || !canRequestBilling(row, billingRule)) return false;
    const key = billingStateOf(row).key;
    if (!BILLING_OPEN.includes(key) || (key === "upcoming" && row.id !== nextBillingId)) return false;
    return !gate(row, "link", { billingRequestId: "x" });
  };
  /* คำขอใบวางบิลในเซลล์วันวางบิล (รุ่นสี่ · ม็อกแบบแนะนำ) — งวดที่มีวันวางบิลและยังรอเงิน:
     'draft' = ผูกร่างที่ยังไม่ส่ง (ย้ายมาจากใต้ชื่องวด — ไม่พูดซ้ำสองที่) · 'none' = ต้องวางบิลแต่ยังไม่ขอ (ไม่ซ้ำกับปุ่มในเซลล์)
     · ขอแล้ว = ป้าย "ขอใบวางบิลแล้ว" เดิม · ไม่ต้องวางบิล = ไม่ชวน (`canRequestBilling`) · คำร้องอ่านไม่ขึ้น/งวดโมฆะ = ไม่พูด */
  const billingRequestNote = (row) => {
    if (!billingColumn || row.preview || !row.billingDate || installmentVoid(row, order) || billingUnknown(row)) return null;
    if (!["pending", "rejected"].includes(row.status || "pending")) return null;
    const linked = row.billingRequestId ? requestById.get(row.billingRequestId) || null : null;
    if (linked?.status === "draft") return { kind: "draft", linked };
    if (row.billingRequestId || billingAskInCell(row) || !canRequestBilling(row, billingRule)) return null;
    return { kind: "none" };
  };
  /* ── โหมดตั้งวันงวดในตาราง (แบบ C · มติเจ้าของ 28/09 · ม็อก mockups/billing-cycle/installment-v2) ─────────────────
     ⭐ **ทางเข้าเดียว** — ปุ่ม "ตั้งวันงวด" บนการ์ด · แตะเซลล์วันวางบิล/กำหนดชำระในตาราง · เมนูแถว "ตั้งวันงวด" ⇒ เข้าโหมดเดียวกัน
       แทนโมดัลรายงวด ("กำหนดวันงวด"/"ตั้ง-แก้กำหนดชำระ") ลิงก์ "เลือกรอบ" ในเซลล์ และปุ่ม "เติมตามรอบ เดือนละงวด…" /
       "จัดวันใหม่ตามรอบปัจจุบัน…" (งานสองปุ่มนั้นย้ายไปแผง "เติมวันงวดที่ว่าง…" ในโหมด — ร่างลงตารางก่อนบันทึกเสมอ)
     ⭐ แตะวัน = ร่าง · บันทึกครั้งเดียว `schedule-many` ผ่าน onAction ของหน้า (หน้าโหลดงวดสดเองเมื่อ 409 — ร่างที่ยังใช้ได้ค้างอยู่)
     ⭐ ใครแก้ได้ = ด่าน `schedule` ตัวเดียวกับ route (ฝ่ายขายที่แก้ใบได้ + FN) · ไม่มีสิทธิ์/ไม่มีงวดที่แก้ได้ = ไม่มีทางเข้าเลย
       (ตารางอ่านอย่างเดียวเหมือนเดิม) · งวดที่ล็อกอ่านอย่างเดียวพร้อมเหตุ — ประโยคเดียวกับที่ route ตีกลับ (`dateLockView`)
     ⭐ ล็อกทั้งใบ (`scheduleOrderLock`) + มีสิทธิ์ = ปุ่ม "ตั้งวันงวด" ยังอยู่ กดแล้วบอกเหตุ (กติกา "ติดด่าน = โชว์แล้วบอกเหตุ" —
       ปุ่ม "จัดวันใหม่…" เดิมบอกผ่าน GatedAction · review R-UI) · เซลล์/เมนูแถวไม่มีทางเข้า (ทุกงวดล็อกด้วย gate อยู่แล้ว)
     ⚠️ ร่างของโหมดนี้กับร่างช่วงครอบ (coverDrafts) **เปิดพร้อมกันไม่ได้** — ร่างช่วงครอบค้าง = เข้าโหมดไม่ได้ (บอกเหตุ) ·
       อยู่ในโหมด = ช่องช่วงครอบล็อก (บอกเหตุ) · สองแถบบันทึกไม่ขึ้นซ้อนกัน
     ⚠️ ฐานยังไม่รัน 0389 (`billingOn` เท็จ) = ไม่มีโหมด — คำขอ schedule-many พาวันวางบิลไปด้วยเสมอ */
  const requestedIds = billingRequestedIds(saved, requestById);
  const scheduleOrderLock = orderLock || pipelineInstallmentLock(order, "schedule");
  const dateLockOf = (row) => dateLockView(row, {
    order,
    requested: requestedIds.has(row.id),
    requestNo: requestById.get(row.billingRequestId)?.docNo || "",
    requestUnknown: billingUnknown(row),
    gateError: gate(row, "schedule") || "",
  });
  const dateModeOpen = !isPreview && billingOn && installmentScheduleAllowed(user)
    && (Boolean(scheduleOrderLock) || saved.some((row) => !dateLockOf(row)));
  const coverDraftCount = Object.keys(coverDrafts).length;
  const saveDates = useCallback((rows) => onAction(null, "schedule-many", { rows }), [onAction]);
  const dateMode = useInstallmentDateMode({
    rows: isPreview ? [] : saved,
    ruleValue: billingRule,
    todayIso,
    available: dateModeOpen,
    blocker: scheduleOrderLock || (coverDraftCount
      ? `แก้ช่วงครอบบริการค้างไว้ ${coverDraftCount} งวด — บันทึกหรือยกเลิกช่วงครอบก่อนตั้งวันงวด`
      : ""),
    lockOf: dateLockOf,
    onSave: saveDates,
    busy: busy === "installment-schedule-many",
    onDirtyChange: onDatesDirty,
    onClearError,
    /* ⭐ ข้อยกเว้นรายงวด (รอบกรรมการ 29/09) — ติ๊ก "งวดนี้ไม่ต้องวางบิล" เฉพาะฐานที่รัน 0393 แล้ว ·
       "งวดนี้ต้องวางบิล…" เปิดโมดัลขอบเขตของแผง (ไม่มีค่าตั้งต้น) */
    skipReady: billingSkipReady,
    onAskRequireBilling: (row) => { onClearError?.(); setNeedFor(row); },
  });
  /* อยู่ในโหมดตั้งวัน = ช่องช่วงครอบล็อก (ร่างสองชุดไม่ซ้อนกัน) — เหตุขึ้นตอนแตะ เหมือนเซลล์ล็อกอื่นของตาราง */
  const coverModeLock = dateMode.active ? "อยู่ในโหมดตั้งวันงวด — บันทึกหรือยกเลิกวันงวดก่อนแก้ช่วงครอบบริการ" : "";
  /* ── "ไปแก้" ของแผงแดง (งานบริการ · PR-A) ที่ข้อวันงวดรวมหลายงวด → โหมดตั้งวันงวด + แผง "เติมวันงวดที่ว่าง…" ─────────────
     ⭐ ทางเข้าของ #1846 ตัวเดียว `openFill` (เข้าโหมด + เปิดแผงเติม · ติดด่าน = toast บอกเหตุเอง · ไม่มีสิทธิ์ = ไม่ทำอะไร)
       ไม่ตั้ง state ของโหมดเองที่นี่ · แผงเติมเปิดอยู่แล้ว = ไม่เปิดซ้ำ (เปิดใหม่ = ตัวเลือกที่กำลังเลือกถูกตั้งต้นทิ้ง)
     ⭐ ตอบทุกคำขอ (`opened` = เปิดได้จริง) — หน้าใบล้างคำขอ · เปิดไม่ได้ = หน้าใบโฟกัสช่องของงวดแรกแทน
     ⚠️ อ่านโหมด/ตัวตอบผ่าน ref (ค่าของ render ล่าสุด) — effect ผูกกับคำขออย่างเดียว · คำขอเดียวทำครั้งเดียว (StrictMode รัน effect ซ้ำ) */
  const dateModeRef = useRef(dateMode);
  dateModeRef.current = dateMode;
  const dateFillDoneRef = useRef(onDateFillRequestDone);
  dateFillDoneRef.current = onDateFillRequestDone;
  const dateFillSeen = useRef(null);
  useEffect(() => {
    if (!dateFillRequest || dateFillSeen.current === dateFillRequest) return;
    dateFillSeen.current = dateFillRequest;
    const mode = dateModeRef.current;
    /* `includeDated` = เปิดพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย" (กลุ่มที่ด่านบอก 'dated' — backfill ลูกค้าเครดิต) · true จริงเท่านั้น
       แผงเติมไม่มีงวดให้แตะ (ตรวจด้วยสวิตช์เดียวกับที่จะเปิด — `fillTargetsOf` ตัวเดียวกับแผง) = ไม่เปิดแผงที่บอก "ไม่มีงวดที่ว่าง"
       ตอบ "เปิดไม่ได้" ให้หน้าใบไปที่ช่องของงวดแรกแทน · ด่านคัดไว้ก่อนแล้ว (`dateFill`) — ที่นี่กันร่าง/ล็อกบนจอที่ด่านไม่เห็น
       (ขอใบวางบิลแล้ว — ด่านไม่มีคำร้องในก้อน ctx · งวดที่ล็อกส่งเป็น 'locked' ไม่อยู่ในเป้าทั้งสองแบบ)
       ⚠️ แผงเติมเปิดอยู่แล้ว = ไม่แตะ (รวมสวิตช์) — เปิดใหม่/สลับสวิตช์ = ตัวเลือกที่กำลังเลือกถูกย้อนทิ้ง · สวิตช์อยู่บนแผงให้กดเอง */
    const includeDated = dateFillRequest.includeDated === true;
    const fillable = fillTargetsOf(mode.fillKind, fillInputRows(mode.rows, mode.current, mode.isLocked), { includeDated }).length > 0;
    const opened = fillable && mode.available && !mode.busy && !mode.blocker;
    if (fillable && !mode.fill) mode.openFill({ includeDated });
    dateFillDoneRef.current?.(opened);
  }, [dateFillRequest]);
  /* ที่มาของกำหนดชำระใต้วันที่ (ลูกค้าตั้งกำหนดวางบิลแล้ว · ม็อก C) — คำจาก `dueSourceOf` ตัวเดียวกับป้ายในตัวแก้:
     "ตามรอบ" / "ตามเครดิต N วัน" / "ชำระวันวางบิล" (ไม่มีเครดิต — ห้ามพูด "เครดิต 0 วัน") = เท่ากับที่คิดจากวันวางบิลของงวด ·
     "แก้ทับ" = คนแก้ทับไว้ · "กรอกเอง" = มีกำหนดชำระแต่ยังไม่มีวันวางบิล (ข้อมูลก่อนมีรอบ — ใบเก่าไม่ถูกเติมเอง มติข้อ 10)
     · เฉพาะงวดที่ยังรอเงิน — งวดที่แจ้ง/รับเงินแล้ว ที่มาของวันไม่ใช่เรื่องที่ต้องตัดสินอะไรอีก */
  /* วันในเซลล์ "กำหนดชำระ / จ่ายจริง" — **รูปเดียวทั้งเซลล์** (review S3): มีคอลัมน์วันวางบิลข้าง ๆ = แบบมีวันในสัปดาห์
     ให้เทียบกันได้ ("อา. 25 ต.ค. 2026") · ไม่มีคอลัมน์นั้น (ฐานยังไม่รัน 0389 · ใบที่ตาย) = รูปตัวเลขเดิมของระบบ */
  const cellDay = (iso) => (billingOn ? formatBillingDate(iso) || fmtDate(iso) : fmtDate(iso));
  const dueSourceNote = (row) => {
    if (!billingRule || row.preview || isOpeningInstallment(row)) return "";
    if (!["pending", "rejected"].includes(row.status || "pending")) return "";
    /* ⭐ รอบห้า (มติ 29/09 หยุดรอปฏิทินใหม่): มีวันวางบิลแต่ปีนั้นปฏิทินของลูกค้ายังไม่มี = ไม่มีกำหนดชำระคิดให้ ⇒ บอกเหตุใต้
       "ยังไม่กำหนด" ("ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้") · ใส่เองแล้ว = "ใส่เอง · ยังไม่มีปฏิทิน 2027" */
    if (!row.dueDate) {
      const missing = row.billingDate ? dueSourceOf(billingRule, row) : null;
      return missing?.key === "calendarMissing" ? missing.label : "";
    }
    /* ไม่ต้องวางบิล (ลูกค้า/ติ๊กงวดนี้) = กำหนดชำระตั้งตรงตัว ไม่มีที่มาให้บอก (`dueSourceOf` 'direct') */
    if (installmentNeed(row, billingRule) === "none" && !row.billingDate) return "";
    if (!row.billingDate) return "กรอกเอง";
    const source = dueSourceOf(billingRule, row);
    if (source.key === "manual" && source.gap) return `${source.label} · ${calendarGapHead(source.gap)}`;
    return source.key === "override" ? "แก้ทับ" : source.label;
  };
  /* เซลล์ "วันวางบิล" (ม็อก C) — วัน + ป้ายเสาร์-อาทิตย์ · ป้ายสถานะ (BillingStateBadge: คำ/สีจาก billingRule.js ·
     "เลยรอบวางบิล" โทนเตือน ไม่แดง) · ปุ่มขอใบวางบิลของงวดที่ถึงคิว
     ⭐ ตัววันเป็นทางเข้าโหมดตั้งวัน (`InstallmentDateEntry` — แทนลิงก์ "เลือกรอบ" เดิม · เซลล์คือทางเข้า มติ 28/09)
       ไม่มีสิทธิ์/งวดล็อก = ตัวอักษรเฉย ๆ เหมือนเดิม · ป้าย/ปุ่มขอใบวางบิลอยู่นอกปุ่ม (ตัวกดไม่ซ้อนตัวกด)
     ⚠️ งวดยกมาไม่มีวันวางบิลเสมอ (มติข้อ 10 · CHECK ของ 0389) · แถวพรีวิว (ยังไม่เริ่มติดตาม) ยังไม่มีอะไรให้ตั้ง */
  const billingCell = (row) => {
    if (row.preview || isOpeningInstallment(row)) return <span className={styles.none}>{NA}</span>;
    /* ⭐ ไม่ต้องวางบิล (ลูกค้า · หรือติ๊ก "งวดนี้ไม่ต้องวางบิล") และยังไม่มีวันวางบิล = ขีด (หัวคอลัมน์บอก "ไม่ต้องวางบิล" ครั้งเดียว) ·
       ติ๊กรายงวด = บอกว่าเฉพาะงวดนี้ · ไม่ใช่ทางเข้าโหมด (ไม่มีอะไรให้ตั้ง — ทางได้วันวางบิลคือเมนู "งวดนี้ต้องวางบิล…")
       · รอเหตุการณ์ของลูกค้าไม่ต้องวางบิลพูดที่ช่องกำหนดชำระ · คำร้องที่ขอไปแล้ว (ก่อนลูกค้าเปลี่ยน) ยังขึ้นป้ายตามเดิม */
    if (!row.billingDate && installmentNeed(row, billingRule) === "none" && !billingRequested(row)) {
      return (
        <span className={styles.billCell}>
          <span className={styles.none}>{NA}</span>
          {row.billingSkip === true && billingNeedOf !== "none" ? <small>{NO_BILLING_TEXT} · เฉพาะงวดนี้</small> : null}
        </span>
      );
    }
    const state = billingStateOf(row);
    const requested = state.key === "requested";
    const linked = row.billingRequestId ? requestById.get(row.billingRequestId) || null : null;
    /* งวดโมฆะไม่มีอะไรให้วางบิล (ใบที่ตายไม่มีคอลัมน์นี้อยู่แล้ว — กันอีกชั้น) · คำร้องอ่านไม่ขึ้น = ไม่รู้สถานะ ไม่ขึ้นป้าย */
    const showBadge = !installmentVoid(row, order) && !billingUnknown(row)
      && (state.key !== "upcoming" || row.id === nextBillingId);
    const requestNote = billingRequestNote(row);
    return (
      <span className={styles.billCell}>
        {row.billingDate ? (
          <span className={styles.dateLine}>
            <InstallmentDateEntry mode={dateMode} row={row} field="bill">
              <span className={styles.dateText}>{formatBillingDate(row.billingDate)}</span>
            </InstallmentDateEntry>
            <WeekendBadge iso={row.billingDate} />
          </span>
        ) : state.key === "waiting" || requested ? null : (
          <InstallmentDateEntry mode={dateMode} row={row} field="bill">
            <span className={styles.none}>{NA}</span>
          </InstallmentDateEntry>
        )}
        {/* ⭐ รอบห้า: วันวางบิลที่เป็นวันตัดรอบของลูกค้าที่มีเวลา = "ส่งก่อน 16:00 น." (ชำระรอบเดียวกัน · เครดิต N ไม่พูดเวลา) —
            เฉพาะงวดที่ยังรอวางบิล (เปิดอยู่ · ยังไม่ขอใบวางบิล · วันยังไม่ผ่าน) */}
        {row.billingDate && !requested && ["pending", "rejected"].includes(row.status || "pending")
          && String(row.billingDate) >= String(todayIso) && billingCutoffNote(billingRule, row.billingDate)
          ? <small>{billingCutoffNote(billingRule, row.billingDate)}</small> : null}
        {/* ต้องวางบิล (ตอบแล้ว) แต่งวดยังไม่มีวันวางบิล — คำเดียวกับทะเบียนบัญชี (`ledgerFlags().missingBilling` · รูปเดิม/ติ๊ก/รอเหตุการณ์ไม่ชวน) */}
        {!row.billingDate && !installmentVoid(row, order) && ledgerFlags(row, billingRule, { todayIso }).missingBilling
          ? <small className={styles.billMissing}>ยังไม่มีวันวางบิล</small> : null}
        {showBadge ? (
          <BillingStateBadge row={row} todayIso={todayIso} requested={billingRequested(row)}
            requestCode={linked?.docNo || ""} requestHref={requested && linked ? `/requests/${linked.id}` : ""} />
        ) : null}
        {requested ? <small>{requestDocsNote(linked)}</small> : null}
        {/* คำขอใบวางบิลของงวดในเซลล์ (ม็อกแบบแนะนำ) — ร่าง = ยังไม่ส่งบัญชี · ยังไม่ขอ (งวดที่ต้องวางบิลและมีวันแล้ว) */}
        {requestNote?.kind === "draft" ? (
          <small>
            {"คำขอใบวางบิล: "}
            <a className="linklike" href={`/requests/${requestNote.linked.id}`}>{requestNote.linked.docNo || "ฉบับร่าง"}</a>
            {" · ร่าง ยังไม่ส่งบัญชี"}
          </small>
        ) : requestNote?.kind === "none" ? <small>ยังไม่ขอใบวางบิล</small> : null}
        {billingAskInCell(row) ? (
          <Button as={Link} href={newBillingRequestHref(row)} prefetch={false} tone="neutral" variant="outline" size="sm"
            icon={<Receipt size={13} aria-hidden="true" />}>
            ขอใบวางบิลงวดนี้
          </Button>
        ) : null}
      </span>
    );
  };
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

  const cardActions = replanned || replanGate.visible || carryGate.visible || (dateMode.available && !dateMode.active) ? (
    <>
      {/* ⭐ ทางเข้าโหมดตั้งวันงวด (มติ 28/09) — ร่างช่วงครอบค้าง = กดแล้วบอกเหตุ (GatedAction) */}
      <InstallmentDateButton mode={dateMode} disabled={!!busy} />
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

  /* ── งานบริการรายบรรทัด: ช่วงบริการ + แบ่งช่วงครอบ (mig 0392 · แผน §2.8 · r2 S7) ─────────────────────────────
     ⭐ ขึ้นเฉพาะใบที่ต้องตั้งงานบริการ (`setupFlow` ≠ 'none' — ใบ pipeline สาย SERVICE) ที่มีช่วงบริการแล้ว หรือยังมีบรรทัดที่
       อาจเป็นแพ็คเกจ (ช่วงบริการบังคับเมื่อมีแพ็คเกจ · D6) — ใบสายสินค้า/ใบย้อนหลัง/ใบที่ทุกบรรทัด "ไม่ใช่งานบริการ" เห็นการ์ดเดิมเป๊ะ
     ⭐ ปุ่ม "แบ่งช่วงครอบตามช่วงบริการ…" (กติกาการโชว์ UI): **ไม่มีสิทธิ์แก้ใบ = ไม่มีปุ่ม** · **ติดเงื่อนไขของใบ = ปุ่มอยู่
       แต่ดับ พร้อมเหตุเป็นตัวหนังสือข้าง ๆ** (จอสัมผัสไม่เห็น title) — เหตุมาจากตัวเดียวกับที่ route ตอบ 409:
       `serviceSetupEditError` (รออนุมัติ/อนุมัติแล้ว/ยื่นตรวจแล้ว/ปิดแล้ว) → ไม่มีช่วงบริการ → ไม่มีงวดที่ยังไม่รับรองให้แบ่ง
       ⚠️ **ห้ามย้ายเหตุพวกนี้ไปเป็นเงื่อนไขการโชว์** — ใบที่รออนุมัติต้องเห็นว่าปุ่มอยู่ที่นี่และทำไมกดไม่ได้
     ⚠️ พรีวิวคิดจาก `saved` = งวดตามที่ GET ของงวดส่งมา (`installmentsForScreen` — ยอดของงวดร่างเดินตามแผน QT สด)
       ชุดเดียวกับที่ route คิดซ้ำ ⇒ "ตามสัดส่วนงวด" ได้ชุดเดียวกันทั้งสองฝั่ง */
  const flow = setupFlow === undefined ? serviceSetupFlow(order, { lines: order?.lines }) : setupFlow;
  const setupShown = Boolean(flow) && flow !== "none";
  const period = servicePeriod === undefined ? servicePeriodOf(order) : servicePeriod;
  const periodReady = Boolean(period?.from && period?.to);
  // บรรทัดที่อาจเป็นแพ็คเกจ (แพ็คเกจ หรือยังไม่เลือกชนิด) — ตัวตัดสินชนิดบรรทัดตัวเดียวกับตาราง/ด่าน (ไม่ใช่ตัวแคบของด่านเงิน)
  const needsPeriod = (Array.isArray(order?.lines) ? order.lines : [])
    .some((line) => serviceLineRole(line) !== SERVICE_KIND_NOT_SERVICE);
  const periodLineShown = setupShown && (periodReady || needsPeriod);
  /* ใบยอด 0 ที่ไม่มีงวด = ไม่มีอะไรให้แบ่งตลอดไป (ไม่ใช่เงื่อนไขที่รอแก้) ⇒ ไม่มีปุ่ม — ต่างจาก "ยังไม่มีงวด" ของใบที่มียอด */
  const zeroWithoutRows = paymentNotRequired(order?.totalAmount) && !saved.length;
  const coverageSplitVisible = periodLineShown && !zeroWithoutRows && Boolean(canEditSetup) && Boolean(onFillCoverage);
  /* ⚠️ อยู่ในโหมดตั้งวันงวด (#1846) = ช่องช่วงครอบทุกงวดล็อกพร้อมเหตุ (`coverModeLock` — ร่างสองชุดไม่ซ้อนกัน) ⇒ ปุ่มแบ่ง
       ช่วงครอบทั้งใบก็ดับด้วยเหตุเดียวกัน (ปุ่มยังอยู่ · เหตุเป็นตัวหนังสือ) — ท้ายสุด: เหตุของใบ/ช่วงบริการสำคัญกว่าโหมดชั่วคราว */
  const coverageSplitBlocker = !coverageSplitVisible ? ""
    : serviceSetupEditError(order, { canEdit: true })
      || (!periodReady ? COVERAGE_SPLIT_ERRORS.noPeriod : "")
      || (splitCoverageByPeriod(period, saved, "monthly").error === COVERAGE_SPLIT_ERRORS.noRows ? COVERAGE_SPLIT_ERRORS.noRows : "")
      || coverModeLock;
  const openCoverageSplit = () => {
    if (coverageSplitBlocker || !onFillCoverage) return;
    onClearError?.();
    setSplitOpen(true);
  };
  const submitCoverageSplit = async ({ mode, plan }) => {
    if (!onFillCoverage) return;
    const done = await onFillCoverage({ mode, plan });
    if (done) setSplitOpen(false);
  };
  /* ด่านรายงวดของพรีวิว — `coverage` ตัวเดียวกับเซลล์ช่วงครอบและ route (ค่าชุดที่จะส่งจริง) */
  const coverageSplitRowGate = (planned) => gate(saved.find((r) => r.id === planned.id), "coverage", {
    coversFrom: planned.coversFrom, coversTo: planned.coversTo,
  });
  const periodText = periodReady ? `${fmtDate(period.from)}–${fmtDate(period.to)}` : "";
  /* บรรทัด "ช่วงบริการ" ใต้หัวการ์ด — เมตาของใบ (พื้นอ่อนเหมือนบรรทัดรอบวางบิล) · ยังไม่ใส่ = เส้นประ ไม่แดง (แดงหลังกดยื่นเท่านั้น) */
  const periodLine = periodLineShown ? (
    <div className={styles.ruleLine} data-empty={periodReady ? undefined : "yes"}>
      <CalendarDays size={16} aria-hidden="true" className={styles.ruleIcon} />
      <span className={styles.ruleText}>
        {periodReady
          ? <>ช่วงบริการ <b>{periodText}</b> (ตั้งที่ตารางรายการ)</>
          : <>ยังไม่ใส่ช่วงบริการ (ตั้งที่ตารางรายการ)</>}
        {periodReady && periodSpan(period).label ? <small>{periodSpan(period).label}</small> : null}
      </span>
      {coverageSplitVisible || onOpenTab ? (
        <span className={styles.ruleActions}>
          {coverageSplitVisible ? (
            <span className={styles.gatedAction}>
              <Button size="sm" variant="ghost" icon={<Columns3 size={13} aria-hidden="true" />}
                disabled={!!busy || !!coverageSplitBlocker} onClick={openCoverageSplit}>
                แบ่งช่วงครอบตามช่วงบริการ…
              </Button>
              {/* เหตุต้องเป็นตัวหนังสือ ไม่ใช่ tooltip อย่างเดียว — จอสัมผัสไม่มีทางเห็น title */}
              {coverageSplitBlocker ? <small className={styles.gateNote} role="status">{coverageSplitBlocker}</small> : null}
            </span>
          ) : null}
          {onOpenTab ? (
            <button type="button" className={`text-action ${styles.ruleLink}`} onClick={() => onOpenTab("overview")}>
              แก้ที่แท็บภาพรวม<ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  ) : null;

  /* ── ช่องที่ติดหลังกดยื่น (แผงแดง "ไปแก้" ชี้มาที่นี่) — id จาก `serviceSetupFieldId` ตัวเดียวกับที่หน้าใบโฟกัส ──────
     ⭐ id อยู่ที่เซลล์ (`tabIndex=-1` ให้โฟกัสได้) เฉพาะใบที่ต้องตั้งงานบริการ + แถวงวดจริง — ใบอื่นไม่เปลี่ยน markup
     🔴 กรอบแดงขึ้นเฉพาะช่องที่อยู่ใน `highlight` (หน้าใบส่งมาหลังกดยื่นเท่านั้น) — ห้ามคิดแดงเองจากข้อมูลงวดที่นี่ */
  const cellId = (row, field) => (setupShown && row?.id && !row.preview
    ? serviceSetupFieldId({ installmentId: row.id, field }) : undefined);
  const issueOf = (row, field) => {
    const id = cellId(row, field);
    if (!id || !highlight) return "";
    return String((highlight instanceof Map ? highlight.get(id) : highlight[id]) || "");
  };
  const cellProps = (row, field, className = "") => {
    const id = cellId(row, field);
    const classes = [className, id && issueOf(row, field) ? styles.cellIssue : ""].filter(Boolean).join(" ");
    return { ...(id ? { id, tabIndex: -1 } : {}), className: classes || undefined };
  };
  /* ข้อความของข้อที่ติด ใต้ค่าในเซลล์ — ตัวหนังสือบอกเหตุคู่กรอบแดง (สีอย่างเดียวไม่พอ · WCAG 1.4.1) */
  const issueNote = (row, field) => {
    const why = issueOf(row, field);
    return why ? <small className={styles.issueNote}>{why}</small> : null;
  };

  /* ── แถบช่วงครอบของงวดเทียบช่วงบริการ (CoverageTimeline · import เท่านั้น) ──────────────────────────────────────
     ⚠️ ชนิดท่อนมีแค่ paid/due/planned/overdue ⇒ **ช่องโหว่ไม่ขึ้นแดงบนแถบ** (ท่อนว่างเป็นพื้นเฉย ๆ) — ช่องโหว่ถึงคนผ่าน
       แผงแดงหลังกดยื่น + กรอบแดงของเซลล์ช่วงครอบ · แถบนี้ตอบแค่ "งวดไหนครอบช่วงไหน สถานะอะไร" */
  const timelineRows = setupShown && periodReady && showCoverage && !deadPipeline
    ? liveRows.filter((row) => row.coversFrom && row.coversTo && row.coversFrom <= row.coversTo)
    : [];
  const timelineKind = (row) => (row.status === "confirmed" ? "paid"
    : row.dueDate && String(row.dueDate) < String(todayIso) ? "overdue" : "planned");
  const timelineSegments = timelineRows.map((row) => ({
    key: row.id, kind: timelineKind(row), from: row.coversFrom, to: row.coversTo,
    label: `งวด ${row.seq} · ${fmtDate(row.coversFrom)}–${fmtDate(row.coversTo)}`,
  }));
  const timelineLegend = [
    ["paid", "บัญชีรับรองแล้ว"], ["planned", "ยังไม่รับรอง"], ["overdue", "เลยกำหนดชำระ"],
  ].map(([kind, text]) => ({ kind, count: timelineSegments.filter((segment) => segment.kind === kind).length, text }))
    .filter((item) => item.count > 0)
    .map((item) => ({ kind: item.kind, text: `${item.text} ${item.count} งวด` }));
  const uncoveredCount = setupShown && periodReady && showCoverage && !deadPipeline
    ? liveRows.length - timelineRows.length : 0;

  /* ── ใบยอด 0 จบที่อนุมัติใบ (มติผู้ใช้ 2026-08-18) ────────────────────────
     ไม่มีเงินให้เก็บ ⇒ ไม่มีงวด ไม่มีการแจ้ง/ยืนยัน · การ์ดยังอยู่เพื่อ **บอกว่าทำไม
     ไม่มีอะไรให้ทำ** ไม่ใช่ซ่อนทั้งการ์ด — การ์ดที่หายไปเฉย ๆ อ่านเหมือนระบบลืม
     ⚠️ ใบเก่าที่มีงวดค้างอยู่แล้ว (สร้างก่อนมติ) ยังโชว์ตารางตามเดิม ไม่กลืนของเดิมทิ้ง */
  const noPaymentStep = paymentNotRequired(order?.totalAmount);
  if (noPaymentStep && !saved.length) {
    return (
      <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta="ยอด 0 — ไม่ต้องยืนยันการชำระ">
        {/* ใบงานบริการยอด 0 (D7): ไม่มีงวด แต่ช่วงบริการยังบังคับ — TS ใช้วางรอบ ⇒ บรรทัดช่วงบริการยังอยู่ (ไม่มีปุ่มแบ่ง: ไม่มีงวดให้แบ่ง) */}
        {periodLineShown ? periodLine : null}
        <StatusNotice tone="info">
          {periodLineShown
            ? "ใบยอด 0 บาท — ไม่มีงวด · ยังต้องใส่ช่วงบริการ (TS ใช้วางรอบ)"
            : "ใบนี้ยอดรวม 0 บาท จึงไม่มีงวดชำระให้ติดตาม — จบที่ขั้นอนุมัติใบสั่งขาย"}
        </StatusNotice>
      </DetailCard>
    );
  }

  return (
    <>
    <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={headline}
      actions={cardActions}>
      {/* ⭐ ช่วงบริการของใบ (mig 0392) — บรรทัดแรกของเมตา (ม็อก SoSubmitBlocked: ช่วงบริการก่อน รอบวางบิลตามมา)
          · ปุ่ม "แบ่งช่วงครอบตามช่วงบริการ…" อยู่บนบรรทัดนี้ เพราะเป็นผลของช่วงบริการ ไม่ใช่ของงวดใดงวดหนึ่ง */}
      {periodLine}
      {/* ⭐ นโยบายการวางบิลของลูกค้า (รุ่นสี่ · มติเจ้าของ 29/09 แบบ A "ประโยคนโยบาย") — แถบเมตาใต้หัวการ์ด ไม่ใช่คำเตือน
          · ตอบแล้ว = ประโยคเดียว (`describeRule`) + งวดยกเว้นบนใบนี้ + ลิงก์ทะเบียนลูกค้า (แท็บใหม่ · กลับมา = ดึงใบสด)
          · ยังไม่ระบุ / รูปเดิม { credit:false } = แถบถาม "ลูกค้ารายนี้ต้องวางบิลไหม?" — ตอบได้เฉพาะคนที่ตั้งกติกาได้ (`canEditBillingRule`)
            ผ่านโมดัลยืนยันที่บอกขอบเขต (ไม่มีค่าตั้งต้น) · คนอื่นเห็นอ่านอย่างเดียวพร้อมบอกว่าใครตอบได้
          · หมายเหตุการวางบิล (แนบ PO ฯลฯ) ต้องเห็นตอนขอใบวางบิล */}
      {billingOn && order?.customer ? (
        <BillingPolicyStrip
          ruleValue={billingRule}
          customer={order.customer}
          canEdit={canSetBillingRule}
          v4Ready={billingSkipReady}
          mode={dateMode}
          openCount={saved.filter((row) => !dateLockOf(row)).length}
          customerHref={customerHref}
          onRegistryOpened={markRegistryOpened}
          onSaved={onRefreshOrder}
          ownerName={String(order?.deal?.ownerName || "").trim()}
        />
      ) : null}

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

      {/* ⭐ เลยรอบวางบิล (กำหนดวางบิล) — **โทนเตือน ไม่ใช่แดง**: เงินยังไม่ถึงกำหนดชำระ แค่ถึงวันวางบิลแล้วยังไม่ขอใบวางบิล
          (แดง "เลยกำหนด" ข้างบนสงวนให้ dueDate ช่องเดียว · ด่านช่างไม่เกี่ยว) */}
      {lateBilling.length ? (
        /* ⚠️ ส่งเป็นสตริงเดียว — StatusNotice ตัดคำไทย (thaiText) ให้เฉพาะลูกที่เป็นสตริง · อาร์เรย์ = ไม่ได้ตัดบรรทัด */
        <StatusNotice tone="warning">
          {`เลยรอบวางบิล ${lateBilling.length} งวด — ถึงวันวางบิลแล้วแต่ยังไม่ขอใบวางบิล${lateBilling.length === 1
            ? ` · ${single ? "" : `งวดที่ ${lateBilling[0].seq} `}วางบิล ${formatBillingDate(lateBilling[0].billingDate)}`
            : ""}`}
        </StatusNotice>
      ) : null}

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
            /* 🐞 คำเดิม "(กำหนดชำระที่กรอกไว้จะหายไป)" ไม่จริงตั้งแต่ 07/09 — freezeInstallments อุ้มวันที่คนกรอกข้ามการตั้งใหม่
               ตามลำดับงวด (วันวางบิลด้วยตั้งแต่ 0389) · ที่หลุดจริงคือคำร้องที่แนบไว้ (ยอดของงวดเปลี่ยน ต้องแนบใหม่) */
            : " ตอนใบอนุมัติ ระบบจะตั้งงวดใหม่ตามแผนล่าสุด (วันที่กรอกไว้ยกไปตามลำดับงวด · คำร้องที่แนบไว้ต้องแนบใหม่)"}
        </StatusNotice>
      ) : null}

      {/* ⭐ โหมดตั้งวันงวด (มติ 28/09) — บรรทัดบอกโหมด + แผง "เติมวันงวดที่ว่าง…" อยู่ในการ์ดเหนือตาราง (ไม่ลอยทับ) */}
      <InstallmentDateHint mode={dateMode} />
      <InstallmentDateFill mode={dateMode} />

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
        /* คอลัมน์วันวางบิล (กำหนดวางบิล) กว้างขึ้น ~170px — วัน + ป้ายสถานะ + ปุ่มขอใบวางบิล ตกบรรทัดในเซลล์เอง
           ⭐ กรอบของโหมดตั้งวัน (InstallmentDateFrame) ห่อตาราง — ป๊อปโอเวอร์ของงวดอยู่ในกรอบนี้ ไม่บังหัวใบ/ปุ่มของการ์ด */
        <InstallmentDateFrame mode={dateMode}>
        <TableScroll family="editable" surface="auto" cells="stacked"
          minWidth={(showCoverage ? 980 : 840) + (billingColumn ? 170 : 0)}>
          <table className={`${styles.table} ${isPreview ? styles.preview : ""}`.trim()}>
            <thead>
              <tr>
                {single ? null : <th className={styles.seqCol}>งวด</th>}
                <th>รายละเอียด</th>
                {/* ⭐ วันวางบิล (mig 0389) — คนละช่องกับกำหนดชำระเสมอ (ข้างกันให้เทียบได้ แต่ไม่รวมเป็นช่องเดียว) */}
                {/* รุ่นสี่: ไม่ต้องวางบิล = บอกครั้งเดียวที่หัวคอลัมน์ (แถวเป็นขีด) · ยังไม่ระบุ/รูปเดิม = วันวางบิลไม่บังคับ */}
                {billingColumn ? (
                  <th>
                    วันวางบิล
                    {billingColumnNote ? <span className={styles.colNote}> ({billingColumnNote})</span> : null}
                  </th>
                ) : null}
                <th>กำหนดชำระ / จ่ายจริง</th>
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
                  /* ⭐ "ตั้งวันงวด" = เข้าโหมดตั้งวันที่งวดนี้ (มติ 28/09 — แทน "กำหนดวันงวด"/"ตั้ง-แก้กำหนดชำระ" ของโมดัลรายงวดเดิม)
                     · ด่านเดียวกับเซลล์วัน (สิทธิ์ schedule + ล็อกของโหมด) — งวดที่ล็อกไม่มีรายการนี้ · ฝ่ายบัญชีเห็นด้วย (มติข้อ 4)
                     · อยู่ในโหมดแล้วไม่ต้องมี (แตะเซลล์วันได้เลย) */
                  dateMode.available && !dateMode.active && !dateMode.isLocked(row) && {
                    id: "dates", icon: CalendarClock, label: "ตั้งวันงวด",
                    onClick: () => dateMode.enter(row.id),
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
                  /* ปุ่มเดียวกันขึ้นในเซลล์วันวางบิลแล้ว (งวดที่ถึงคิววาง) = ไม่ซ้ำในเมนู */
                  /* ⭐ รุ่นสี่: ไม่ต้องวางบิล (ลูกค้า/ติ๊กงวดนี้) = ไม่ชวนขอใบวางบิล (§1 "ไม่ชวน") — ยังขอได้จาก /requests ตามปกติ */
                  !row.billingRequestId && !billingAskInCell(row) && canRequestBilling(row, billingRule)
                    && !gate(row, "link", { billingRequestId: "x" }) && {
                    id: "ask-doc", icon: Receipt, label: "ขอใบวางบิลงวดนี้",
                    href: newBillingRequestHref(row),
                  },
                  /* ⭐ ข้อยกเว้นรายงวดสองทาง (รอบกรรมการ 29/09 · §2.3) — ด่านเดียวกับเซลล์วัน (สิทธิ์ schedule + ล็อกของงวด) ·
                     ลงร่างของโหมดตั้งวัน บันทึกครั้งเดียวที่แถบล่าง (API ลงประวัติ "ยกเว้น: …") */
                  ...(dateMode.available && !dateMode.isLocked(row) ? (() => {
                    const ex = needExceptionActions({ ...row, ...dateMode.current(row) }, billingRule);
                    return [
                      ex.requireBilling && !dateMode.exceptionIds.has(row.id) && {
                        id: "require-billing", icon: Receipt, label: "งวดนี้ต้องวางบิล…",
                        onClick: () => { onClearError?.(); setNeedFor(row); },
                      },
                      billingSkipReady && (ex.skip || ex.unskip) && {
                        id: "skip-billing", icon: HandCoins,
                        label: ex.unskip ? `เอาติ๊กออก: ${SKIP_TEXT}` : `${SKIP_TEXT} (เช่น โอนก่อน)`,
                        onClick: () => dateMode.toggleSkip(row.id),
                      },
                    ];
                  })() : []),
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
                  {/* `data-date-row` = ที่ยึดของป๊อปโอเวอร์ตั้งวัน (InstallmentDateFrame วัดตำแหน่งจากแถวนี้) */}
                  <tr data-date-row={row.preview ? undefined : row.id}>
                    {single ? null : <td className={styles.seqCol}>{row.seq}</td>}
                    <td>
                      {/* ชื่องวดสั้นห้ามแตกบรรทัด ("งวด / สุดท้าย" ตอนคอลัมน์วันวางบิลกว้าง) — ดู InstallmentLabel */}
                      <InstallmentLabel label={row.label} />
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
                      {/* ⭐ กำหนดวางบิล: คำร้องที่ยังมีชีวิตของงวดที่ยังรอวางบิลย้ายไปอยู่คอลัมน์วันวางบิล (ป้าย "ขอใบวางบิลแล้ว")
                          — ไม่พูดซ้ำสองที่ (ม็อก C) · งวดที่เงินเข้าแล้ว (ใบเสร็จหลังจ่าย) / คำร้องที่ตาย ยังบอกที่นี่ตามเดิม */}
                      {/* ⚠️ งวดโมฆะไม่ส่งต่อให้คอลัมน์วันวางบิล — เซลล์นั้นซ่อนป้ายของงวดโมฆะ ⇒ ลิงก์คำร้องจะหายจากทั้งสองที่ */}
                      {row.billingRequestId && !(billingColumn && !installmentVoid(row, order) && billingStateOf(row).key === "requested")
                        && billingRequestNote(row)?.kind !== "draft" ? (() => {
                        const linked = requestById.get(row.billingRequestId);
                        /* อ่านคำร้องไม่ขึ้น ≠ ถูกลบ (review F3) — บอกตามจริง ไม่ชวนออกคำร้องซ้ำ */
                        if (!linked) {
                          return (
                            <small className={styles.overdue}>
                              {order?.billingRequestsError ? "อ่านคำร้องขอเอกสารไม่สำเร็จ" : "คำร้องขอเอกสารถูกลบไปแล้ว"}
                            </small>
                          );
                        }
                        /* ยกเลิกแล้ว ≠ ถูกลบ — route ของหน้าใบโหลดคำร้องที่งวดผูกอยู่รวมใบที่ยกเลิก (กำหนดวางบิล 26/09)
                           ⇒ บอกตามจริง · งวดนี้นับว่า "ยังไม่ขอใบวางบิล" (installmentBillingRequested) */
                        if (billingRequestDead(linked)) {
                          return (
                            <small className={styles.none}>
                              <a className="linklike" href={`/requests/${linked.id}`}>{linked.docNo || "คำร้องขอเอกสาร"}</a>
                              {!gate(row, "unlink") ? " · ยกเลิกแล้ว — ถอดออกจากงวด (เมนูของงวด) แล้วขอใหม่ได้" : " · ยกเลิกแล้ว"}
                            </small>
                          );
                        }
                        /* ร่างที่ยังไม่ส่ง = ยังไม่ขอ (billingRequestLive) — บอกให้ส่ง ไม่ปล่อยให้เข้าใจว่าขอไปแล้ว */
                        if (linked.status === "draft") {
                          return (
                            <small className={styles.none}>
                              <a className="linklike" href={`/requests/${linked.id}`}>{linked.docNo || "ร่างคำร้องขอเอกสาร"}</a>
                              {" · ร่าง ยังไม่ส่งบัญชี"}
                            </small>
                          );
                        }
                        return (
                          <small>
                            <a className="linklike" href={`/requests/${linked.id}`}>
                              {linked.docNo || "คำร้องขอเอกสาร"}
                            </a>
                            {` · ${requestDocsNote(linked)}`}
                          </small>
                        );
                      })() : null}
                    </td>
                    {/* ⭐ ในโหมดตั้งวัน สองคอลัมน์วันเป็นเซลล์ร่าง (InstallmentDateCell — แตะแล้วเปิดตัวแก้ของงวดนั้น) ·
                        นอกโหมดเป็นตารางอ่านอย่างเดียวเดิม ตัววันเป็นทางเข้าโหมด (InstallmentDateEntry)
                        ⭐ งานบริการ (mig 0392): id/กรอบแดงของช่องที่ติดหลังกดยื่นอยู่ที่ <td> — ทั้งสองโหมด (เซลล์ร่างในโหมดก็ได้กรอบ)
                          · เหตุเป็นตัวหนังสือใต้ค่า (`issueNote`) */}
                    {billingColumn ? (
                      <td {...cellProps(row, "billingDate")}>
                        {dateMode.active && !row.preview
                          ? <InstallmentDateCell mode={dateMode} row={row} field="bill" />
                          : billingCell(row)}
                        {issueNote(row, "billingDate")}
                      </td>
                    ) : null}
                    <td {...cellProps(row, "dueDate")}>
                      {/* ⚠️ ธงแดง "เลยกำหนด" อ่าน dueDate ช่องเดียว (ไม่แตะเพราะกำหนดวางบิล) · วันเขียนแบบมีวันในสัปดาห์
                          ให้ตรงกับคอลัมน์วันวางบิลข้าง ๆ (ป้ายเสาร์-อาทิตย์เตือนอย่างเดียว ไม่เลื่อนวัน) */}
                      {dateMode.active && !row.preview ? (
                        <InstallmentDateCell mode={dateMode} row={row} field="due" billColumn={billingColumn} />
                      ) : (
                        <>
                          <span className={styles.dateLine}>
                            <InstallmentDateEntry mode={dateMode} row={row} field="due">
                              <span className={overdue ? styles.overdue : undefined}>
                                {row.dueDate ? cellDay(row.dueDate) : row.preview ? "กำหนดหลังอนุมัติ"
                                  /* ไม่ต้องวางบิล: รอเหตุการณ์คุมกำหนดชำระ ⇒ พูดที่ช่องนี้ (ช่องวันวางบิลเป็นขีด) */
                                  : row.billingEvent && !row.billingDate && installmentNeed(row, billingRule) === "none"
                                    ? `รอเหตุการณ์ · ${row.billingEvent}` : "ยังไม่กำหนด"}
                                {overdue ? " · เลยกำหนด" : ""}
                              </span>
                            </InstallmentDateEntry>
                            {billingOn && !overdue && !row.preview && ["pending", "rejected"].includes(row.status || "pending")
                              ? <WeekendBadge iso={row.dueDate} /> : null}
                          </span>
                          {dueSourceNote(row) ? <small>{dueSourceNote(row)}</small> : null}
                        </>
                      )}
                      {row.paidOn ? <small>จ่าย {cellDay(row.paidOn)}</small> : null}
                      {row.reportedByName || row.confirmedByName ? (
                        <small>
                          {row.confirmedByName ? `บัญชีรับรอง ${row.confirmedByName}` : `แจ้งโดย ${row.reportedByName}`}
                        </small>
                      ) : null}
                      {issueNote(row, "dueDate")}
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
                      /* อยู่ในโหมดตั้งวันงวด = ล็อกพร้อมเหตุ (ร่างสองชุดไม่ซ้อนกัน · มติ 28/09) */
                      const lock = row.preview ? "ยังไม่เริ่มติดตามการชำระ" : coverModeLock || gate(row, "coverage");
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
                      const coverIssue = issueOf(row, "coverage");
                      return (
                        <td {...cellProps(row, "coverage", edited ? styles.coverEdited : "")}>
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
                                  disabled={!!busy || savingCover} invalid={Boolean(coverIssue)}
                                  onChange={(iso) => setCover(row, { coversFrom: iso })} />
                              )}
                              <DateInput compact value={draft.coversTo} className={styles.coverDate}
                                ariaLabel={`ครอบบริการถึง · งวดที่ ${row.seq}`}
                                disabled={!!busy || savingCover} invalid={Boolean(coverIssue)}
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
                          {issueNote(row, "coverage")}
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
                      <td className={styles.detail} colSpan={(single ? 7 : 8) + (showCoverage ? 1 : 0) + (billingColumn ? 1 : 0)}>
                        <div className={styles.rejected}>
                          <strong>บัญชีตีกลับ · {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                          <ReadableText text={row.rejectedReason} lines={3} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {/* 641–999px: ตัวแก้วันของงวดนี้กางใต้แถว (≥1000px ลอยข้างแถว · ≤640px แผ่นเต็มจอ) */}
                  <InstallmentDateExpandRow mode={dateMode} row={row}
                    colSpan={(single ? 7 : 8) + (showCoverage ? 1 : 0) + (billingColumn ? 1 : 0)} />
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        </InstallmentDateFrame>
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

      <InstallmentDateSheet mode={dateMode} error={error}
        subtitle={[order?.orderNumber, customerCode].filter(Boolean).join(" · ")} />

      {/* ⭐ ช่วงครอบของงวดเทียบช่วงบริการ (mig 0392 · r2 S7) — ใต้ตาราง · เฉพาะใบงานบริการที่มีช่วงบริการและมีงวดแล้ว
          ⚠️ ท่อนว่างบนแถบ = ช่วงที่ยังไม่มีงวดครอบ แต่ไม่ขึ้นแดง (แดงหลังกดยื่นเท่านั้น — ผ่านแผงแดง + กรอบเซลล์) */}
      {timelineRows.length || uncoveredCount ? (
        <section className={styles.timeline} aria-label="ช่วงครอบของงวด เทียบช่วงบริการ">
          <div className={styles.timelineHead}>
            <b>ช่วงครอบของงวด เทียบช่วงบริการ</b>
            <span>{[periodText, periodSpan(period).label].filter(Boolean).join(" · ")}</span>
          </div>
          <CoverageTimeline startDate={period.from} endDate={period.to} segments={timelineSegments}
            todayIso={todayIso} label="ช่วงครอบของงวด เทียบช่วงบริการ" legend={timelineLegend} />
          {uncoveredCount ? (
            <p className="form-note">{`อีก ${uncoveredCount} งวดยังไม่มีช่วงครอบ — ไม่อยู่บนแถบนี้ (ดูคอลัมน์ “ครอบคลุมบริการ”)`}</p>
          ) : null}
        </section>
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

      {/* ⭐ แบ่งช่วงครอบตามช่วงบริการ (mig 0392 · แผน §2.8) — พรีวิวทุกงวดก่อนใช้ · แผนคิดสดทุกครั้งที่วาดจาก `saved`
          (409 แล้วหน้าดึงงวดสด พรีวิวเปลี่ยนตามทันที) · error ของ API ขึ้นในโมดัล (แถบของหน้าอยู่ใต้โมดัล)
          ⚠️ ใบเลิกแก้ได้ระหว่างเปิดค้าง (409 แล้วหน้าดึงใบสด — อีกหน้าต่างยื่นอนุมัติไปแล้ว) = โมดัลบอกเหตุตัวเดียวกับปุ่มบนการ์ด
            แทนพรีวิว และเหลือแค่ปุ่มปิด (ไม่ปิดตัวเองเงียบ ๆ) */}
      {splitOpen && coverageSplitVisible ? (
        <CoverageSplitModal open onClose={() => setSplitOpen(false)} period={period} rows={saved}
          rowGate={coverageSplitRowGate} onApply={submitCoverageSplit} blockedReason={coverageSplitBlocker}
          busy={!!busy} error={error}
          subtitle={[order?.orderNumber, customerCode].filter(Boolean).join(" · ")} />
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

      {/* ⭐ "งวดนี้ต้องวางบิล…" (รุ่นสี่ · ลูกค้าไม่ต้องวางบิล) — เลือกขอบเขต ไม่มีค่าตั้งต้น → ตัวแก้เปิดที่ปฏิทินวันวางบิลของงวด */}
      {needFor ? (
        <RequireBillingModal
          row={live(needFor)}
          orderCode={order?.orderNumber || ""}
          customerCode={customerCode}
          openCount={dateMode.editable.filter((r) => r.id === needFor.id
            || needExceptionActions({ ...r, ...dateMode.current(r) }, billingRule).requireBilling).length}
          onClose={() => setNeedFor(null)}
          onConfirm={(scope) => {
            const target = needFor;
            setNeedFor(null);
            dateMode.requireBilling(target.id, scope);
          }}
          onCustomer={() => {
            setNeedFor(null);
            markRegistryOpened();
            if (customerHref) window.open(`${customerHref}#billing-rule`, "_blank", "noopener,noreferrer");
          }}
        />
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
    {/* ⭐ แถบบันทึกวันงวด (โหมดตั้งวัน · มติ 28/09) — ปุ่ม navy ปุ่มเดียว "บันทึก N งวด" = คำขอเดียว `schedule-many`
        · อยู่ **นอกการ์ด** โดยตั้งใจ: `.card` ของ DetailCard เป็น overflow:hidden (= scroll container) ⇒ sticky ข้างในยึดกับการ์ด
          ที่ไม่เคยเลื่อน แถบไม่ติดขอบจอ (บทเรียน stickyScrollport.test) · คอลัมน์ `.main` ของหน้าไม่ตัดขอบ ⇒ ติดขอบล่างของจอได้จริง
        · error ของ API ขึ้นในแถบ (แถบ error ของหน้าอยู่บนสุด มองไม่เห็นตอนกดจากท้ายตาราง) · มือถือ: แผ่นเต็มจอมีปุ่มเดียวกันท้ายแผ่น */}
    <InstallmentDateBar mode={dateMode} error={error} />
    </>
  );
}

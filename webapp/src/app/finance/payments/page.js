"use client";
// ── ทะเบียนการชำระ รวมทุกใบสั่งขาย (โมดูลบัญชีและการเงิน) ─────────────────
//
// > *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว ซึ่งราคาต้องมีการอ้างอิง
// >  QT SO และสามารถดาวน์โหลด"* (มติผู้ใช้ 2026-08-13)
//
// ⭐ **สองส่วน: คิวงานอยู่บน · ทะเบียนอยู่ล่าง** (มติผู้ใช้ 2026-08-13)
// หน้านี้ถูกใช้เป็น "คิว" มาตลอดทั้งที่ชื่อ "ทะเบียน" ⇒ แยกของที่ **ต้องทำวันนี้**
// ออกมาไว้บนสุดและกดรับรองได้จากตรงนั้น ส่วนทะเบียนเต็มไว้ค้นและดาวน์โหลด
//
// ⚠️ **เดิมหน้านี้อ่านอย่างเดียว** โดยตั้งใจ (กฎสามชั้น: ทางลงมืออยู่บนเอกสารต้นทาง)
// ผู้ใช้ตัดสินให้เปิดทางกดที่นี่ด้วย · ความเสี่ยงสองข้อที่ยกไว้ตอนนั้นถูกปิดแล้ว:
//   · **ด่านยังชุดเดียว** — ปุ่มเรียก API ตัวเดิม (`installmentActionError` ที่ route ของใบ)
//     ไม่มีทางเขียนที่สอง ไม่มีด่านที่สอง
//   · **คนกดเห็นหลักฐานก่อน** — `InstallmentConfirmDialog` โชว์ไฟล์/วันจ่าย/ผู้แจ้ง
//     และเป็นโมดัล **ตัวเดียวกับ**ที่การ์ดบนใบ SO ใช้ (AGENTS.md: หนึ่งฟอร์ม สองทางเรียก)
// ⇒ กฎในเอกสารถูกแก้ให้ตรงกับของจริงแล้ว (docs/module-ownership-rule.md §ข้อ 3)
//
// ⚠️ ตัวกรองเก็บใน URL — บัญชีส่งลิงก์ "งวดที่เลยกำหนดของเดือนนี้" ให้กันได้ และ
// ปุ่มดาวน์โหลดใช้ query ชุดเดียวกัน ⇒ ไฟล์ที่ได้ตรงกับที่เห็นบนจอเสมอ
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock, CalendarClock, CircleDollarSign, ExternalLink, FileSpreadsheet, FileText, Flag, HandCoins, Receipt, Search,
  Wallet, Wrench,
} from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableEmpty, TableGroupRow, TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { allBucketsCollapsed, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import {
  LEDGER_BILLING_FILTERS, LEDGER_BILLING_REQUESTED_TAG, LEDGER_BILLING_RULE_UNSET, LEDGER_BILLING_UNREQUESTED_TAG,
  LEDGER_BILLING_WAITING_TAG, LEDGER_BILLING_WINDOW_DAYS,
  LEDGER_CANCELLED_TAG, LEDGER_GROUP_OPTIONS, LEDGER_HISTORICAL_TAG, LEDGER_ORDER_STATES, LEDGER_SORT_DEFAULT, LEDGER_SORT_OPTIONS,
  LEDGER_STATUS, LEDGER_STATUS_KEYS, LEDGER_STRANDED_TITLE, groupAsOrder, groupInstallmentNote, groupLedgerBuckets,
  groupLedgerByOrder, groupNote, ledgerBillingFilter, ledgerBillingWhen, ledgerRowLock, ledgerSortDir, pendingConfirmations,
  pendingStranded, pendingTaxInvoices, sortLedgerGroups,
} from "@/lib/finance/paymentLedger";
import { billingStateTone, formatBillingDate, weekendNote } from "@/lib/sales/billingRule";
import { canConfirmPayment } from "@/lib/permissions";
import { useCan, useCapUser, useDepartment } from "@/lib/roleContext";
import { salesOrderListTrack } from "@/lib/sales/salesOrderListTrack";
import StepTrack from "@/components/ui/StepTrack";
import StatusBadge from "@/components/ui/StatusBadge";
import InstallmentConfirmDialog from "@/components/salesPlanning/InstallmentConfirmDialog";
import TaxInvoiceDialog from "@/components/salesPlanning/TaxInvoiceDialog";
import InstallmentRefundDialog from "@/components/salesPlanning/InstallmentRefundDialog";
import { CARRY_BUTTON } from "@/lib/sales/installmentCarry";
import ReasonDialog from "@/components/ui/ReasonDialog";
import { MIN_REJECT_REASON } from "@/lib/sales/salesOrderPayments";
import { REPLANNED_BADGE, REPLANNED_BADGE_TITLE } from "@/lib/sales/installmentReplan";
/* ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — ตัดสินด้วยตัวกลางเท่านั้น (literal ของ origin มีบ้านเดียว) */
import { isHistoricalOrder, isOpeningInstallment } from "@/lib/sales/historicalOrders";
import { historicalOpeningRejectNote } from "@/lib/sales/historicalOrderCopy";
import { openingInvoiceNote } from "@/lib/sales/taxInvoice";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

/* คีย์ที่เป็น "ตัวกรองของข้อมูล" — ชุดนี้ตัวเดียวที่ส่งขึ้น API และที่ปุ่มล้างจะลบ
   (ที่เหลือ `group` `sort` `dir` เป็นมุมมองบนจอ ล้างตัวกรองแล้วต้องยังอยู่) */
/* ⚠️ ตัวกรองใหม่ต้องต่อสายครบหกที่ (FILTER_KEYS · query useMemo + dep array · filterCount · `filterValues` ·
   literal `filters` ของ route · clause ใน filterLedger) — ยาม paymentLedgerFilterWiring.test.mjs ไล่ตรวจทุกคีย์ในชุดนี้ */
const FILTER_KEYS = ["status", "orderState", "line", "from", "to", "q", "overdue", "taxInvoice", "billing"];

/* ── เซลล์ "วางบิลถัดไป" (mig 0389 · ม็อก D) ─────────────────────────────────────────────────────────
   วันวางบิล · "งวด n · ระยะ" · ป้ายขอใบแล้ว/ยังไม่ขอ — ค่าระดับใบมาจาก `groupLedgerByOrder` (nextBilling ฯลฯ)
   ⚠️ **ไม่มีสีแดงในเซลล์นี้** — เลยรอบ/ใกล้ถึงรอบ = โทนเตือน (`billingStateTone`) · แดงสงวนให้ "เลยกำหนด"
     ซึ่งอ่านกำหนดชำระ (คอลัมน์ถัดไป) เท่านั้น
   ⚠️ วันเสาร์/อาทิตย์ไม่เลื่อนวัน (มติข้อ 6) — เตือนเป็นบรรทัดรองที่ตาเห็น ไม่ใช่แค่ title (จอสัมผัส/คีย์บอร์ดไม่เคยเห็น title)
   ⚠️ คำป้ายมาจากค่าคงที่ของ lib — ชุดค้นใช้คำเดียวกัน (ตาเห็นบนแถว = ต้องค้นเจอ) */
function NextBillingCell({ group }) {
  const next = group.nextBilling;
  if (next) {
    const warn = !next.requested && billingStateTone(next.state) === "warning";
    const when = ledgerBillingWhen(next.state);
    const weekend = weekendNote(next.billingDate);
    return (
      <>
        <span className={`${styles.billDate} ${warn ? styles.billWarn : ""}`.trim()}>
          {formatBillingDate(next.billingDate)}
        </span>
        <span className={`cell-sub ${warn ? styles.billWarn : ""}`.trim()}>
          งวด {next.seq}{when ? ` · ${when}` : ""}
        </span>
        {weekend ? <span className="cell-sub">{weekend}</span> : null}
        <span className={styles.billBadge}>
          {next.requested
            ? <StatusBadge size="sm" tone="info" label={LEDGER_BILLING_REQUESTED_TAG} title="มีคำร้องขอใบวางบิลของงวดนี้แล้ว" />
            : <StatusBadge size="sm" tone={warn ? "warning" : "neutral"} label={LEDGER_BILLING_UNREQUESTED_TAG} title="ยังไม่มีคำร้องขอใบวางบิลของงวดนี้" />}
        </span>
      </>
    );
  }
  /* ไม่มีรอบถัดไป — บอกเหตุเท่าที่รู้ (ม็อก D) · ลูกค้าที่ไม่มีรอบ และไม่มีงวดไหนเลือกวัน = ขีด (สถานะปกติ)
     ⚠️ "มีรอบ" = `billingRuleActive` ไม่ใช่ความว่างของข้อความ — ลูกค้าไม่มีเครดิตมีข้อความ ("ไม่มีเครดิต") แต่ไม่มีรอบให้เลือก (mig 0390) */
  if (group.billingUnset && group.billingRuleActive) {
    return (
      <>
        <span className="cell-quiet">ยังไม่กำหนด</span>
        <span className="cell-sub">{group.billingUnset} งวดไม่มีวันวางบิล</span>
      </>
    );
  }
  if (group.billingWaiting) {
    return (
      <>
        <span className="cell-quiet">{LEDGER_BILLING_WAITING_TAG}</span>
        <span className="cell-sub">งวด {group.billingWaiting.seq} · {group.billingWaiting.event}</span>
      </>
    );
  }
  if (group.billingBilled) {
    return (
      <>
        <span className="cell-quiet">วางบิลแล้ว</span>
        <span className="cell-sub">รอเงินเข้า</span>
      </>
    );
  }
  return <span className="cell-quiet">{NA}</span>;
}

export default function FinancePaymentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  /* ลิงก์ "ตั้งรอบ" ไปหน้าทะเบียนลูกค้า — วาดเฉพาะคนที่ตั้งรอบได้จริง (กติกา "ไม่มีสิทธิ์ = ไม่โชว์")
     ⚠️ ด่านจริงของการตั้งรอบคือ `canEditCustomerBillingRule` (API) — คนที่เข้าหน้านี้ได้ (แอดมิน/ฝ่าย FN) ผ่านด่านนั้น
       ทางเดียวคือ `canConfirmPayment` (payments:confirm + ฝ่าย FN) · ถามแค่ customers:view = FN ที่ไม่มี payments:confirm
       เห็นปุ่มที่กดไปแล้วทำต่อไม่ได้ (review S5) · ทางของ customers:edit ต้องรู้ทีมของลูกค้า ซึ่งแถวนี้ไม่มี — ไม่เดา */
  const capUser = useCapUser();
  const department = useDepartment();
  const canSetBillingRule = useCan("customers:view") && canConfirmPayment({ ...capUser, department });
  const [data, setData] = useState({ rows: [], summary: null, totalRows: 0, undatedHidden: null, billingTally: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  /* ── ตัวกรองอยู่ใน URL ─────────────────────────────────────────────────
     ⭐ **สองชั้นแยกกัน** (มติผู้ใช้ 2026-08-15)
     · `FILTER_KEYS` = ตัวกรองของข้อมูล ⇒ ส่งขึ้น API ⇒ **ไฟล์ Excel ได้ชุดเดียวกัน**
     · `group` `sort` `dir` = มุมมองบนจอเท่านั้น ⇒ **ห้ามหลุดเข้า query ของ API**
       ไม่งั้นทุกครั้งที่สลับการเรียง หน้าจะยิงโหลดใหม่ทั้งชุดโดยได้ข้อมูลเท่าเดิม
     ทั้งสองชั้นอยู่ใน URL เหมือนกัน — ลิงก์ที่บัญชีส่งให้กันจึงเปิดมาเห็นภาพเดียวกัน */
  const status = params.get("status") || "";
  const orderState = params.get("orderState") || "";
  /* สายของงาน (มติผู้ใช้ 2026-08-30) — "service" = ใบที่เข้าเกณฑ์มีรอบบริการ
     (สาย SERVICE + มีบรรทัดหมวด 02-001) · เกณฑ์ตัดสินฝั่ง server ที่ตัวกลางตัวเดียว */
  const line = params.get("line") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const q = params.get("q") || "";
  const overdue = params.get("overdue") === "1";
  /* ใบกำกับภาษีของงวด (mig 0348) — "missing" = เงินเข้าแล้วยังไม่ออกใบ · "issued" = ออกแล้ว
     ⚠️ บริษัทเก็บ VAT ⇒ ทุกงวดที่จ่ายแล้วต้องมีใบ ตัวกรองนี้จึงเป็น **ของค้างจริง**
     ไม่ใช่มุมมองเสริม (มติผู้ใช้ 2026-09-07) */
  const taxInvoice = params.get("taxInvoice") || "";
  /* รอบวางบิล (mig 0389 · ม็อก D) — soon | 7d | month | late · กระดิ่งฝั่ง FN เปิดหน้านี้ด้วย `?billing=soon`
     (= ชุดที่หัวข้อกระดิ่งนับเป๊ะ · รอบสอง 26/09 — ตัวคัดของกระดิ่งตัดสินที่ API) · ตัวเลือกในเมนูมาจาก `LEDGER_BILLING_FILTERS`
     ค่าที่ไม่รู้จัก = '' (ไม่ส่งขึ้น API · ไม่นับบนปุ่ม) — ตัวตัดสินชุดเดียวกับ filterLedger */
  const billing = ledgerBillingFilter(params.get("billing") || "");
  const groupBy = params.get("group") || "none";
  const sortKey = params.get("sort") || LEDGER_SORT_DEFAULT;
  const sortDir = params.get("dir") || ledgerSortDir(sortKey);

  const statusFilter = useMemo(() => (status ? status.split(",").filter(Boolean) : []), [status]);
  const orderStateFilter = useMemo(() => (orderState ? orderState.split(",").filter(Boolean) : []), [orderState]);
  const lineFilter = useMemo(() => (line ? line.split(",").filter(Boolean) : []), [line]);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (orderState) sp.set("orderState", orderState);
    if (line) sp.set("line", line);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (q) sp.set("q", q);
    if (overdue) sp.set("overdue", "1");
    /* ⚠️ **บรรทัดนี้คือเส้นเลือด** — `download()` ใช้ `query` ตัวเดียวกัน ⇒ ลืมเติม
       ที่นี่ = ชิปตัวกรองติดอยู่บนจอแต่ทั้งจอทั้งไฟล์ Excel ไม่ถูกกรอง (และลืมใน
       dep array = query ค้างค่าเก่า fetch ไม่ยิงใหม่) */
    if (taxInvoice) sp.set("taxInvoice", taxInvoice);
    if (billing) sp.set("billing", billing);
    return sp;
  }, [status, orderState, line, from, to, q, overdue, taxInvoice, billing]);

  /* เขียนกลับจาก **params ทั้งชุด** ไม่ใช่จาก `query` — เขียนจาก query เมื่อไร
     การกดตัวกรองหนึ่งครั้งจะลบ group/sort/dir ทิ้งเงียบ ๆ */
  const setParam = useCallback((key, value) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    router.replace(`/finance/payments${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }, [params, router]);

  const setFilter = setParam;
  const setListFilter = useCallback((key, values) => setParam(key, values.join(",")), [setParam]);

  /* ⚠️ อ่านค่าที่ผ่านตัวตัดสินแล้ว ไม่ใช่พารามิเตอร์ดิบ — `?billing=bogus` ไม่ได้กรองอะไร (API เมิน) ⇒ ต้องไม่ขึ้น "จาก N"
     หรือปุ่ม "ล้างตัวกรอง" ทั้งที่ไม่มีอะไรให้ล้าง · ทุกคีย์ใน FILTER_KEYS ต้องมีค่าในก้อนนี้ (ยามต่อสายตรวจ) */
  const filterValues = { status, orderState, line, from, to, q, overdue, taxInvoice, billing };
  const activeFilterKeys = FILTER_KEYS.filter((key) => Boolean(filterValues[key]));
  const filtering = activeFilterKeys.length > 0;
  /* ⚠️ ผลบวกเขียนมือ — `FILTER_KEYS` ให้ฟรีแค่ `filtering` กับ `clearFilters` ตัวนับบนปุ่มต้องบวกเอง */
  const filterCount = statusFilter.length + orderStateFilter.length + lineFilter.length
    + (overdue ? 1 : 0) + (taxInvoice ? 1 : 0) + (billing ? 1 : 0);

  /* ล้างตัวกรอง = ล้างเฉพาะชั้นข้อมูล **แต่คงมุมมองไว้** — คนกดล้างอยากเห็นของครบ
     ไม่ได้อยากให้การจัดกลุ่ม/การเรียงที่เพิ่งตั้งไว้หายไปด้วย */
  /* ⚠️ ล้างสองคีย์พร้อมกันต้องเป็น **replace เดียว** — เรียก `setFilter` สองครั้งติดกัน
     ไม่ได้ผล เพราะทั้งสองครั้งอ่าน `params` ก้อนเดิมของ render นี้ ⇒ ครั้งหลังเขียนทับ
     ครั้งแรก (เจอตอนกดปุ่มจริงบนหน้า: กดแล้วช่วงวันไม่หายสักช่อง) */
  const clearDateRange = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("from"); sp.delete("to");
    router.replace(`/finance/payments${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }, [params, router]);

  const clearFilters = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((key) => sp.delete(key));
    router.replace(`/finance/payments${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }, [params, router]);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/finance/payments?${query}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!isLatest()) return; // ตัวกรองขยับระหว่างรอ — ทะเบียนต้องตรงกับตัวกรองที่เห็นอยู่
      if (!res.ok) throw new Error(body?.error || "โหลดทะเบียนการชำระไม่สำเร็จ");
      setData({
        rows: body.rows || [], summary: body.summary, totalRows: body.totalRows || 0,
        undatedHidden: body.undatedHidden || null,
        // ตัวนับของกลุ่มตัวกรองรอบวางบิล + งวดไม่มีวันวางบิลที่ตัวกรองนั้นซ่อน (คิดที่ API จากชุดที่ถอดตัวกรองนี้ออก)
        billingTally: body.billingTally || null,
        /* ⚠️ "วันนี้" มาจาก server (นาฬิกาไทย) ไม่ใช่จากเครื่องผู้ใช้ — คอลัมน์ "จ่ายถึง"
           เทียบกับค่านี้ ถ้าอ่านนาฬิกาเบราว์เซอร์ คนที่ตั้งโซนเวลาอื่นจะเห็นสีคนละแบบ */
        todayIso: body.todayIso || null,
      });
    } catch (loadError) { if (isLatest() && !opts?.background) setError(loadError.message); }
    if (isLatest()) setLoading(false);
  }, [query, startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const rows = data.rows;
  const summary = data.summary;
  const todayIso = data.todayIso;
  const undatedHidden = data.undatedHidden;
  const billingTally = data.billingTally;
  const billingOption = LEDGER_BILLING_FILTERS.find((option) => option.value === billing) || null;
  /* คำของตารางว่างแบบ "รอบวางบิล" ใช้ได้เฉพาะตอนที่มันเป็นตัวกรองเดียว — มีคำค้น/ตัวกรองอื่นด้วยแล้วว่าง
     อาจเป็นตัวอื่นที่ตัดจนหมด ⇒ ถอยไปคำกลาง ๆ (review S5) */
  const onlyBillingFilter = Boolean(billingOption) && activeFilterKeys.length === 1;

  /* ⭐ **จับกลุ่มตามใบ แล้วแบ่งหน้าที่ระดับ "ใบ" ไม่ใช่ระดับ "งวด"** (มติผู้ใช้ 2026-08-13)
     ⭐ **หนึ่งใบ = หนึ่งแถว ไม่มีแถวย่อย** (มติผู้ใช้ 2026-08-15) — ทะเบียนตอบคำถาม
     "ใบไหนต้องตามบ้าง" ซึ่งอ่านจบที่แถวหัวใบแล้ว · รายละเอียดรายงวด (ชื่องวด %
     ผู้รับรอง วันจ่ายจริง สถานะรายงวด) อยู่ที่ **การ์ดการชำระบนใบ SO** ซึ่งเป็น
     ที่เดียวที่ลงมือกับงวดได้ และอยู่ในไฟล์ Excel ที่ดาวน์โหลดจากหน้านี้ */
  const groups = useMemo(() => groupLedgerByOrder(rows), [rows]);

  /* เรียงตามที่ผู้ใช้เลือก แล้วค่อยยุบเป็นถัง — ตรรกะทั้งสองอยู่ใน
     `lib/finance/paymentLedger.js` (มีเทสต์คุม) หน้านี้เป็นคนวาดอย่างเดียว */
  const sortedGroups = useMemo(() => sortLedgerGroups(groups, sortKey, sortDir), [groups, sortKey, sortDir]);
  const buckets = useMemo(() => groupLedgerBuckets(sortedGroups, groupBy), [sortedGroups, groupBy]);

  /* ⚠️ แบ่งหน้าเฉพาะตอน **ไม่จัดกลุ่ม** — แบ่งหน้าทับการจัดกลุ่มจะหั่นถังคาหน้า
     แล้วยอดที่หัวถังไม่ตรงกับแถวที่เห็น (กติกาเดียวกับตารางไปป์ไลน์ดีล)
     ⇒ โหมดจัดกลุ่มใช้ย่อ/ขยายถังคุมความยาวแทน */
  const { page, setPage, pageCount, pageSize, setPageSize, pageRows, total } = usePagination(sortedGroups, {
    resetKey: `${query}|${sortKey}|${sortDir}`,
  });

  /* ถังที่ย่ออยู่ · รีเซ็ตเมื่อเปลี่ยนหัวข้อจัดกลุ่มหรือผลลัพธ์เปลี่ยน — ไม่งั้นกุญแจ
     ของถังเก่าค้างอยู่แล้วไปย่อถังที่คนไม่ได้สั่งย่อ (บทเรียนเดียวกับ Set ของแถวที่กาง) */
  const [collapsed, setCollapsed] = useState(() => new Set());
  useEffect(() => { setCollapsed(new Set()); }, [groupBy, query]);
  const toggleBucket = useCallback((key) => setCollapsed((current) => toggleBucketKey(current, key)), []);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);

  /* ⚠️ ดาวน์โหลดผ่าน blob ไม่ใช่เปิดแท็บใหม่ — endpoint ต้องการ cookie เซสชัน
     และแท็บใหม่ที่ถูกเด้งไปหน้า login จะดูเหมือนปุ่มพัง */
  const download = async () => {
    setDownloading(true); setError("");
    try {
      const sp = new URLSearchParams(query);
      sp.set("format", "xlsx");
      const res = await apiFetch(`/api/finance/payments?${sp}`, { cache: "no-store" });
      if (!res.ok) throw new Error("ดาวน์โหลดไม่สำเร็จ");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1]
        || "payment-ledger.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); }
    setDownloading(false);
  };

  /* ── คิวงานของบัญชี ────────────────────────────────────────────────────
     ⚠️ นับจาก **แถวที่กรองแล้ว** — ตัวกรองบนหน้าคุมทั้งคิวและทะเบียน ไม่งั้นกรองดู
     ลูกค้ารายเดียวแล้วคิวยังโชว์ของคนอื่น = สองส่วนบนหน้าเดียวพูดคนละเรื่อง */
  const queue = useMemo(() => pendingConfirmations(rows), [rows]);
  /* ⭐ **คิวที่สอง: เงินเข้าแล้วแต่ยังไม่ออกใบกำกับ** (มติผู้ใช้ 2026-09-07)
     บริษัทเก็บ VAT ⇒ ทุกงวดที่ลูกค้าจ่ายต้องมีใบกำกับ ⇒ ของค้างชุดนี้เคลียร์ได้จริง
     ⚠️ **แยกจากคิวแรก** — ป้ายตัวเลขบนเมนูนับ `reported` อยู่ · เอามารวมกันเมื่อไร
     เลขบนเมนูจะไม่ตรงกับของที่เห็นตอนกดเข้ามา */
  const invoiceQueue = useMemo(() => pendingTaxInvoices(rows), [rows]);
  /* ⭐ **คิวที่สาม: เงินค้างจากใบที่ยกเลิก** (PR3 · mig 0378 · มติเจ้าของ 23/09 D4) — ใบยกเลิกแล้วแต่มีเงินรับแล้ว/รอตรวจ
     ทางออก: ยกเข้าใบใหม่ของดีลเดียวกัน (ที่ใบใหม่) หรือบันทึกคืนเงินลูกค้า (ที่นี่/ที่ใบเดิม) · นับจากแถวที่กรองแล้ว (กติกาเดียวกับคิวอื่น)
     ⚠️ งวด reported ของใบยกเลิกอยู่ทั้งคิวรับรองและคิวนี้ — รับรอง/ตีกลับก่อนแล้วจึงตัดสินเรื่องคืน/ยก */
  const strandedQueue = useMemo(() => pendingStranded(rows), [rows]);
  const [strandedOpen, setStrandedOpen] = useState(false);
  const [refundFor, setRefundFor] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);   // "ดูอีก n งวด"
  const [invoiceQueueOpen, setInvoiceQueueOpen] = useState(false);
  const [confirmFor, setConfirmFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");

  /* ⭐ เรียก **API ตัวเดิมของใบ** — ด่านจริงคือ `installmentActionError` ใน route นั้น
     ไม่สร้างเส้นเขียนที่สองให้ทะเบียน (ดูหัวไฟล์)
     ⭐ optimistic lock (PR0) — ส่ง `updatedAt` ของแถวที่ตาเห็น · แถวถูกแก้จากอีกหน้าต่าง = 409 แล้วดึงทะเบียนสด
       (โหมดเบื้องหลัง — ตารางไม่หายแล้วโผล่ใหม่) ⇒ โมดัลวาดแถวล่าสุด (`liveRow`) แล้วกดใหม่ได้ */
  const runAction = useCallback(async (row, action, extra = {}) => {
    setActing(true); setActionError("");
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${row.orderId}/installments`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installmentId: row.id, action, ...extra,
          expectedUpdatedAt: row.updatedAt || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) load({ background: true });
        setActionError(body.error || "ดำเนินการไม่สำเร็จ");
        return false;
      }
      await load();
      return true;
    } catch (runError) {
      setActionError(runError.message);
      return false;
    } finally {
      setActing(false);
    }
  }, [load]);

  /* แถวล่าสุดของทะเบียน — โมดัลจำแถวไว้ตอนเปิด แต่ต้องวาดและส่งแถวล่าสุดเสมอ (ตัวล็อกคือ updatedAt ของแถวที่ตาเห็น)
     ⚠️ หาไม่เจอ (ตัวกรองตัดแถวนั้นออกหลังดึงสด) = ใช้สำเนาเดิม — API ตอบ 409 เองถ้ามันเก่า */
  const liveRow = (row) => (row ? rows.find((r) => r.id === row.id) || row : null);
  const confirmRow = liveRow(confirmFor);
  const invoiceRow = liveRow(invoiceFor);
  const refundRow = liveRow(refundFor);

  const QUEUE_PREVIEW = 3;
  const queueShown = queueOpen ? queue : queue.slice(0, QUEUE_PREVIEW);
  const queueTotal = queue.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const invoiceShown = invoiceQueueOpen ? invoiceQueue : invoiceQueue.slice(0, QUEUE_PREVIEW);
  const invoiceTotal = invoiceQueue.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const strandedShown = strandedOpen ? strandedQueue : strandedQueue.slice(0, QUEUE_PREVIEW);
  const strandedTotal = strandedQueue.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  /* ── แถวของ "ใบ" หนึ่งใบ — ใช้ทั้งโหมดปกติและโหมดจัดกลุ่ม ────────────────
     ⚠️ ยกออกมาเป็นฟังก์ชันตัวเดียว ไม่ใช่เขียนซ้ำในสองสาขาของ tbody
     (AGENTS.md: สองสำเนาของสิ่งเดียวกันจะเพี้ยนหากันเสมอ) */
  const orderRow = (group) => {
    const note = groupNote(group);
    const shaped = groupAsOrder(group);
    const track = shaped ? salesOrderListTrack(shaped) : null;
    return (
      <tr key={group.key}>
        <td>
          {/* เลขที่ SO เป็นข้อความ ไม่ใช่ลิงก์ — ทางไปใบมีทางเดียวคือปุ่ม
              "เปิดใบ" ท้ายแถว · สองทางไปที่เดียวกันในแถวเดียวกดพลาดกันเอง */}
          <span className="mono"><strong>{naText(group.orderNumber)}</strong></span>
          {/* อ้างอิง QT เป็นบรรทัดรอง — เป็นที่มาของใบ ไม่ใช่ตัวใบเอง
              (เลิกเป็นคอลัมน์ของตัวเองตอนยุบ 9 → 6)
              ⭐ เอกสารอ้างอิง (PO ลูกค้า) ต่อท้ายบรรทัดเดียวกัน ทรงเดียวกับตาราง
              รายการ SO — บัญชีค้นด้วยเลข PO ได้แล้ว ก็ต้องเห็นว่าแถวไหนคือเลขนั้น
              ⚠️ ไม่มี PO = ไม่ขึ้นทั้งจุดคั่นและช่องว่าง ไม่ใช่ขีด — ขีดตรงนี้จะอ่าน
              เหมือนเลข QT มีสองท่อน (กติกา N/A → ขีด ใช้กับ **ช่องของตัวเอง**) */}
          <span className="cell-sub mono" title={group.referenceDoc || undefined}>
            {naText(group.quoteNumber)}
            {group.referenceDoc ? ` · ${group.referenceDoc}` : ""}
          </span>
          {/* ⭐ รางสามขั้นชุดเดียวกับตารางรายการ SO (`salesOrderListTrack`)
              — สองหน้านี้ตอบคำถามเดียวกัน จึงต้องใช้ตรรกะตัวเดียวกัน */}
          {track ? <StepTrack steps={track.steps} /> : null}
        </td>
        <td>
          {group.customerCode ? <span className="ar-code ar-code-block">{group.customerCode}</span> : null}
          {naText(group.customerName)}
          {/* ⭐ รอบวางบิลของลูกค้าแบบย่อ (mig 0389 · ม็อก D) — FN รู้ทันทีว่าใบนี้วางบิลวันไหน เงินเข้าวันไหน
              ⚠️ ยังไม่ตั้ง = บอกตรง ๆ (ข้อความเดียวกับชุดค้น) + ลิงก์ไปตั้งที่ทะเบียนลูกค้า (FN แก้รอบได้ · มติ 25/09 ข้อ 4)
                เปิดแท็บใหม่แบบปุ่ม "เปิดใบ" — เด้งออกแล้วย้อนกลับ = เสียตัวกรอง */}
          {group.billingRuleText ? (
            <span className="cell-sub">
              <CalendarClock size={12} aria-hidden="true" className={styles.billRuleIcon} />
              {group.billingRuleText}
            </span>
          ) : (
            <span className="cell-sub">
              {LEDGER_BILLING_RULE_UNSET}
              {canSetBillingRule && group.customerId ? (
                <>
                  {" · "}
                  <Link
                    prefetch={false}
                    href={`/database/customers/${group.customerId}`}
                    target="_blank" rel="noreferrer"
                    className="linklike"
                    title="ตั้งรอบวางบิลที่ทะเบียนลูกค้า (แท็บใหม่)"
                  >
                    ตั้งรอบ
                  </Link>
                </>
              ) : null}
            </span>
          )}
        </td>
        {/* เก็บแล้ว x/y — นับเฉพาะงวดที่บัญชีคอนเฟิร์ม (กติกา mig 0245) */}
        <td className="num mono">
          {group.paidCount}/{group.count}
          {/* ⚠️ ตัวเลขบน (x/y) นับงวดที่ตาเห็น · คำรองบอกทั้งใบ — กรองอยู่แล้วเห็นไม่ครบ = "แสดง n จาก m งวด" (ม็อก D)
              ไม่งั้นทางเข้าจากกระดิ่ง (`?billing=soon`) ทำใบ 12 งวดขึ้น "ชำระครั้งเดียว" (review S5) */}
          <span className="cell-sub">{groupInstallmentNote(group, { filtering })}</span>
          {/* ⭐ งวดจริงต่างจากแผนของ QT (ปรับแผนหลังอนุมัติ · 0377 · มติ D5) — ฉบับพิมพ์ SO ที่ลูกค้าถือยังแสดงแผน QT
              ⇒ บัญชีต้องรู้ก่อนโทรตามเงินว่ายอดต่องวดบนกระดาษไม่ใช่ยอดในทะเบียน · ค่าระดับใบประทับจากชุดก่อนกรอง */}
          {group.replanned ? <StatusBadge size="sm" tone="info" label={REPLANNED_BADGE} title={REPLANNED_BADGE_TITLE} /> : null}
        </td>
        {/* ⭐ **ยอดค้างรับเป็นตัวเด่น** — เลขที่บัญชีตามจริง ของเดิมมีแต่
            ยอดรวมกับเก็บแล้ว ต้องลบเอาเอง · แถบสัดส่วนอ่านความคืบหน้าด้วยตาเดียว */}
        <td className="num mono">
          {group.complete
            ? <span className="cell-num-ok">เก็บครบ</span>
            : <strong>{fmtMoney(group.summary.outstandingAmount)}</strong>}
          <span className="cell-sub">
            {fmtMoney(group.summary.collectedAmount)} / {fmtMoney(group.summary.totalAmount)}
          </span>
          {/* ⚠️ ใช้ <progress> ไม่ใช่ div+`style={{width}}` แบบที่อื่นในระบบ —
              สัดส่วนมาทาง attribute ⇒ ไม่เพิ่มชั้น inlineStyle ที่ audit:ui
              ล็อกเพดานไว้ (ratchet ขึ้นไม่ได้) และ semantic ตรงกว่า
              ⚠️ ใบยอด 0 ไม่มีแถบ — รางเปล่าที่เติมไม่ได้อ่านเหมือนระบบค้าง */}
          {group.summary.totalAmount > 0 ? (
            <progress className={styles.mbar} aria-hidden="true"
              value={group.summary.collectedAmount} max={group.summary.totalAmount} />
          ) : null}
        </td>
        {/* ใบหนึ่งมีหลายงวดจึงมีหลายวัน — สิ่งที่ตอบ "ต้องตามใบนี้เมื่อไร"
            คือวันของงวดที่ **ยังเก็บไม่ได้** ที่ใกล้ที่สุด (`nextDue`)
            ⚠️ **เปิดแท็บใหม่** (มติผู้ใช้ 2026-08-13 · "ทำให้ลงมือได้เร็วขึ้น") —
            บัญชีไล่ทีละใบจากหน้านี้ เด้งออกแล้วกดย้อนกลับทุกครั้งคือเสียตัวกรอง
            · `#payment` พาไปยืนที่การ์ดการชำระพอดี ไม่ต้องเลื่อนหา */}
        {/* ⭐ "จ่ายถึง" — เงินที่รับรองแล้วครอบบริการถึงวันไหน (mig 0320 · มติ 2026-08-30)
            บัญชีกดรับรองงวดแล้ววันนี้ขยับ = คิวช่างของ TS ปลดตาม ⇒ ต้องเห็นบนทะเบียนนี้
            ⚠️ โชว์ทุกแถวเพื่อให้ตารางมีทรงเดียว — ใบที่ไม่มีรอบบริการขึ้นขีดตามปกติ
            ⚠️ ขาดแล้ว (จ่ายถึง < วันนี้) = แดง เพราะแปลว่าบริการหยุดอยู่ ณ ตอนนี้ */}
        <td className={`num ${group.serviceRounds && group.paidThrough && String(group.paidThrough) < String(todayIso) ? "cell-num-bad" : ""}`.trim()}>
          {group.serviceRounds
            ? (group.paidThrough
              ? fmtDate(group.paidThrough)
              : <span className="cell-quiet">ยังไม่ครอบ</span>)
            : <span className="cell-quiet">{NA}</span>}
        </td>
        {/* ⭐ วางบิลถัดไป (mig 0389) — วางก่อน "กำหนดถัดไป" ตามลำดับจริงของงาน: วางบิลก่อน เงินเข้าทีหลัง */}
        <td className="num">
          <NextBillingCell group={group} />
        </td>
        <td className={`num ${group.overdue ? "cell-num-bad" : ""}`.trim()}>
          {group.nextDue ? fmtDate(group.nextDue) : <span className="cell-quiet">{NA}</span>}
          {note ? <span className="cell-sub">{note.label}</span> : null}
        </td>
        {/* ออกใบกำกับไปกี่งวดแล้ว — ค้างเมื่อไรเป็นตัวเลขเตือน เพราะทุกงวดที่จ่ายแล้ว
            ต้องมีใบ (บริษัทเก็บ VAT · มติผู้ใช้ 2026-09-07)
            ⭐ งวดยกมาของใบย้อนหลังไม่อยู่ในตัวนับ (ใบกำกับออกในระบบเดิมแล้ว · มติ 22/09) — บอกแยกเป็นบรรทัดรอง
            แทนที่จะขึ้น "ค้าง" ซึ่งชวนให้ออกใบซ้ำ */}
        <td className={`num mono ${group.invoicePending ? "cell-num-bad" : ""}`.trim()}>
          {group.invoiced}/{group.count - group.openingCount}
          {group.invoicePending
            ? <span className="cell-sub">ค้าง {group.invoicePending} งวด</span>
            : null}
          {group.openingCount
            ? <span className="cell-sub">ยกมา: {openingInvoiceNote}{group.historicalInvoiceRef ? ` · ${group.historicalInvoiceRef}` : ""}</span>
            : null}
        </td>
        <td>
          <Link
            prefetch={false}
            href={`/sa/sales-orders/${group.orderId}#payment`}
            target="_blank" rel="noreferrer"
            className={`linklike ${styles.openLink}`}
            title="เปิดใบในแท็บใหม่ ไปที่การ์ดการชำระ"
          >
            เปิดใบ<ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
          </Link>
        </td>
      </tr>
    );
  };

  return (
    <Workspace
      icon={<Wallet size={22} />}
      title="ทะเบียนการชำระ"
      subtitle="งวดชำระของทุกใบสั่งขายในที่เดียว — อ้างอิงเลขที่ SO และ QT ทุกยอด"
      headerRight={(
        <Button onClick={download} disabled={downloading || !rows.length}>
          <FileSpreadsheet size={16} /> {downloading ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลด Excel"}
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error" role="alert" action={<Button size="sm" onClick={load}>ลองใหม่</Button>}>{error}</StatusNotice>}

        {/* ⚠️ **แยก "เก็บได้แล้ว" ออกจาก "รอบัญชีรับรอง"** — ยอดที่ SA แจ้งว่าเข้าแล้ว
            แต่บัญชียังไม่คอนเฟิร์ม ไม่ใช่เงินที่เก็บได้ (กติกาจาก mig 0245) · รวมช่อง
            เดียวเมื่อไรเท่ากับให้ฝ่ายขายกดเองแล้วตัวเลขขึ้นเอง */}
        {summary && (
          <MetricStrip aria-label="สรุปยอดของงวดที่กำลังแสดง">
            <Metric icon={<CircleDollarSign />} label="เก็บได้แล้ว" value={fmtMoney(summary.collectedAmount)} note="เฉพาะงวดที่บัญชีคอนเฟิร์ม" tone="good" />
            <Metric
              as="button" type="button"
              icon={<Wallet />} label="รอบัญชีรับรอง" value={fmtMoney(summary.awaitingAmount)}
              note={`${summary.awaitingCount} งวดที่ฝ่ายขายแจ้งแล้ว`}
              tone={summary.awaitingCount ? "warning" : undefined}
              onClick={() => setFilter("status", "reported")}
            />
            <Metric icon={<Wallet />} label="ค้างรับทั้งหมด" value={fmtMoney(summary.outstandingAmount)} note="ทุกงวดที่ยังไม่ถูกคอนเฟิร์ม" />
            {/* ⭐ ของค้างของ **เอกสาร** ไม่ใช่ของเงิน (มติผู้ใช้ 2026-09-07 — เก็บ VAT
                ⇒ ทุกงวดที่จ่ายแล้วต้องมีใบกำกับ) · กดแล้วกรองให้เลยเหมือนการ์ดอื่น */}
            <Metric
              as="button" type="button"
              icon={<FileText />} label="ยังไม่ออกใบกำกับ" value={`${summary.missingInvoiceCount} งวด`}
              note={fmtMoney(summary.missingInvoiceAmount)}
              tone={summary.missingInvoiceCount ? "warning" : "good"}
              onClick={() => setFilter("taxInvoice", taxInvoice === "missing" ? "" : "missing")}
            />
            <Metric
              as="button" type="button"
              icon={<AlarmClock />} label="เลยกำหนด" value={`${summary.overdueCount} งวด`}
              note={fmtMoney(summary.overdueAmount)}
              tone={summary.overdueCount ? "danger" : "good"}
              onClick={() => setFilter("overdue", overdue ? "" : "1")}
            />
            {/* ⭐ ถึงรอบวางบิล 7 วัน (mig 0389 · ม็อก D) — การ์ดใบที่หก (แถบรองรับสูงสุด 6 · globals.css)
                กดแล้วกรองแบบเดียวกับการ์ด "เลยกำหนด" · กดซ้ำ = ถอด · ⚠️ โทน info ไม่ใช่ danger — ยังไม่มีอะไรเลย */}
            <Metric
              as="button" type="button"
              icon={<CalendarClock />} label={`ถึงรอบวางบิล ${LEDGER_BILLING_WINDOW_DAYS} วัน`}
              value={`${summary.billingIn7DaysCount ?? 0} งวด`}
              note={fmtMoney(summary.billingIn7DaysAmount ?? 0)}
              tone={summary.billingIn7DaysCount ? "info" : undefined}
              active={billing === "7d"}
              aria-pressed={billing === "7d"}
              title={`งวดที่วันวางบิลอยู่ในวันนี้ถึงอีก ${LEDGER_BILLING_WINDOW_DAYS} วัน และยังไม่แจ้งชำระ — กดเพื่อกรอง`}
              onClick={() => setFilter("billing", billing === "7d" ? "" : "7d")}
            />
          </MetricStrip>
        )}

        {/* ⚠️ **ตัวเลขที่หายต้องมีที่อยู่** — ตัวกรองช่วงวันตัดงวดที่ยังไม่กำหนดวันชำระ
            ออกตามความหมายของมัน ("ครบกำหนดในช่วงนี้") แต่ยอดสรุปด้านบนคิดจากแถวที่
            เหลือ ⇒ ถ้าไม่บอก บัญชีจะเชื่อว่ายอดค้างมีเท่าที่เห็น · งวดไม่มีกำหนดเป็น
            สถานะปกติ (QT ไม่มีวันมาให้ SA กรอกเองทีละงวด) ไม่ใช่ข้อมูลเสีย */}
        {undatedHidden?.count > 0 && (
          <StatusNotice tone="info" action={<Button size="sm" variant="ghost" onClick={clearDateRange}>ล้างช่วงวัน</Button>}>
            ตัวกรองช่วงวันซ่อนงวดที่ยังไม่กำหนดวันชำระไว้ {undatedHidden.count} งวด · {fmtMoney(undatedHidden.amount)} — ยอดสรุปด้านบนยังไม่รวมส่วนนี้
          </StatusNotice>
        )}
        {/* ⚠️ กติกาเดียวกันกับตัวกรองรอบวางบิล (0389) — งวดที่ยังไม่มีวันวางบิล (ยังไม่เลือกรอบ/รอเหตุการณ์) หลุดตามความหมาย
            ของตัวกรอง แต่ยอดสรุปคิดจากแถวที่เหลือ ⇒ บอกส่วนที่ซ่อน · ปุ่มถอดเฉพาะตัวกรองนี้ ตัวกรองอื่นคงไว้
            ⚠️ นับเฉพาะงวดที่ "ควรมีวันแต่ไม่มี" (`ledgerBillingTally`) — ลูกค้าไม่มีรอบคือสถานะปกติ ไม่ใช่เงินหาย */}
        {billing && billingTally?.hidden?.count > 0 && (
          <StatusNotice tone="info" action={<Button size="sm" variant="ghost" onClick={() => setFilter("billing", "")}>ล้างตัวกรองรอบวางบิล</Button>}>
            ยังมีอีก {billingTally.hidden.count} งวด · {fmtMoney(billingTally.hidden.amount)} ที่ยังไม่มีวันวางบิล (รอเหตุการณ์ หรือลูกค้ามีรอบแล้วแต่งวดยังไม่ได้เลือกวัน) — ตัวกรองนี้และยอดสรุปด้านบนไม่นับส่วนนี้
          </StatusNotice>
        )}

        {/* ── คิวงาน: สิ่งที่ต้องทำวันนี้ (มติผู้ใช้ 2026-08-13 · แบบ ข) ──────────
            ⚠️ ขึ้นเฉพาะตอนมีของให้ทำ — คิวว่างที่โชว์อยู่ตลอดคือเสียงรบกวน
            ⚠️ อยู่ **เหนือ** ทะเบียน เพราะคนเปิดหน้ามาเพื่อทำงาน ไม่ได้มาค้น */}
        {queue.length > 0 && (
          <WorkspaceSection
            icon={<Wallet size={17} />}
            title={`รอคุณรับรอง ${queue.length} งวด · ${fmtMoney(queueTotal)}`}
            subtitle="ฝ่ายขายแจ้งว่าเงินเข้าแล้ว รอบัญชียืนยัน — กดดูหลักฐานก่อนรับรองได้"
          >
            {actionError ? <StatusNotice tone="error" role="alert">{actionError}</StatusNotice> : null}
            <div className={styles.queue}>
              {queueShown.map((row) => {
                const confirmLock = ledgerRowLock(row, "confirm");
                return (
                <div key={row.id} className={`${styles.qrow} ${row.overdue ? styles.qrowLate : ""}`.trim()}>
                  <div className={styles.qmain}>
                    <div>
                      <Link
                        prefetch={false}
                        href={`/sa/sales-orders/${row.orderId}#payment`}
                        target="_blank" rel="noreferrer"
                        className={`linklike mono ${styles.openLink}`}
                        title="เปิดใบในแท็บใหม่"
                      >
                        <strong>{row.orderNumber}</strong>
                        <ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
                      </Link>
                      <span className={styles.qsep}>·</span>
                      <span>{row.label || `งวดที่ ${row.seq}`}</span>
                      {/* ⭐ งวดยกมา = เงินที่เก็บก่อนเข้าระบบ รับรองครั้งเดียว (mock FnConfirm) — ต้องแยกจากงวดปกติด้วยตา */}
                      {isOpeningInstallment(row) ? (
                        <StatusBadge size="sm" tone="info" label="ยกมา" className={styles.qbadge}
                          title="เงินที่เก็บก่อนเข้าระบบ — บัญชีรับรองครั้งเดียว" />
                      ) : null}
                      {row.overdue ? <span className={styles.qlate}>เลยกำหนด</span> : null}
                    </div>
                    {/* ช่วงครอบ = สิ่งที่คำรับรองนี้ปลดให้ TS ("จ่ายถึง") ⇒ ต้องเห็นตั้งแต่ในคิว ไม่ใช่เฉพาะในโมดัล */}
                    <span className="cell-sub">
                      {row.customerName}
                      {isHistoricalOrder({ origin: row.origin }) ? ` · ${LEDGER_HISTORICAL_TAG}` : ""}
                      {/* ใบที่ยกเลิก (review UI-1) — รับรองแล้วเงินเป็น "เงินค้างจากใบที่ยกเลิก" ไม่ใช่เงินของใบที่เดินอยู่ */}
                      {row.orderStatus === "cancelled" ? ` · ${LEDGER_CANCELLED_TAG}` : ""}
                      {row.coversFrom && row.coversTo ? ` · ครอบ ${fmtDate(row.coversFrom)}–${fmtDate(row.coversTo)}` : ""}
                      {row.reportedByName ? ` · แจ้งโดย ${row.reportedByName}` : ""}
                      {row.paidOn ? ` · จ่ายจริง ${fmtDate(row.paidOn)}` : ""}
                      {` · หลักฐาน ${row.evidenceCount} ไฟล์`}
                    </span>
                  </div>
                  <span className={styles.qamt}>{fmtMoney(row.amount)}</span>
                  <Button size="sm" tone="primary" disabled={acting || !!confirmLock} title={confirmLock || undefined} onClick={() => setConfirmFor(row)}>
                    ยืนยันว่าเงินเข้า
                  </Button>
                  {/* ตีกลับเป็นการถอย ไม่ใช่ก้าวถัดไป ⇒ ปุ่มรอง ไม่ใช่ปุ่มเด่น */}
                  <Button size="sm" variant="quiet" disabled={acting} onClick={() => setRejectFor({ row, reason: "" })}>
                    ตีกลับ
                  </Button>
                </div>
                );
              })}
              {queue.length > QUEUE_PREVIEW && (
                <div className={styles.qmore}>
                  <Button size="sm" variant="quiet" onClick={() => setQueueOpen((v) => !v)}>
                    {queueOpen ? "ย่อคิว" : `ดูอีก ${queue.length - QUEUE_PREVIEW} งวด`}
                  </Button>
                </div>
              )}
            </div>
          </WorkspaceSection>
        )}

        {/* ── คิวที่สอง: เอกสารที่ยังค้าง (มติผู้ใช้ 2026-09-07) ──────────────────
            ⚠️ อยู่ **ใต้** คิวรับรอง เพราะเงินมาก่อนเอกสารเสมอ — งวดที่ยังไม่รับรอง
            จะโผล่ที่คิวบนอยู่แล้ว และจะไหลลงมาคิวนี้เองหลังกดรับรอง
            ⚠️ ขึ้นเฉพาะตอนมีของค้าง — คิวว่างที่โชว์ตลอดคือเสียงรบกวน */}
        {invoiceQueue.length > 0 && (
          <WorkspaceSection
            icon={<FileText size={17} />}
            title={`ยังไม่ออกใบกำกับ ${invoiceQueue.length} งวด · ${fmtMoney(invoiceTotal)}`}
            subtitle="เงินเข้าแล้วแต่ยังไม่ได้บันทึกใบกำกับภาษี — บันทึกเลขที่ วันที่ และแนบไฟล์ได้จากที่นี่"
          >
            <div className={styles.queue}>
              {invoiceShown.map((row) => {
                const invoiceLock = ledgerRowLock(row, "tax-invoice");
                return (
                <div key={row.id} className={styles.qrow}>
                  <div className={styles.qmain}>
                    <div>
                      <Link
                        prefetch={false}
                        href={`/sa/sales-orders/${row.orderId}#payment`}
                        target="_blank" rel="noreferrer"
                        className={`linklike mono ${styles.openLink}`}
                        title="เปิดใบในแท็บใหม่"
                      >
                        <strong>{row.orderNumber}</strong>
                        <ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
                      </Link>
                      <span className={styles.qsep}>·</span>
                      <span>{row.label || `งวดที่ ${row.seq}`}</span>
                    </div>
                    <span className="cell-sub">
                      {row.customerName}
                      {row.paidOn ? ` · จ่ายจริง ${fmtDate(row.paidOn)}` : ""}
                      {` · ${LEDGER_STATUS[row.status]?.label || row.status}`}
                    </span>
                  </div>
                  <span className={styles.qamt}>{fmtMoney(row.amount)}</span>
                  <Button size="sm" tone="primary" disabled={acting || !!invoiceLock} title={invoiceLock || undefined} onClick={() => setInvoiceFor(row)}>
                    บันทึกใบกำกับ
                  </Button>
                </div>
                );
              })}
              {invoiceQueue.length > QUEUE_PREVIEW && (
                <div className={styles.qmore}>
                  <Button size="sm" variant="quiet" onClick={() => setInvoiceQueueOpen((v) => !v)}>
                    {invoiceQueueOpen ? "ย่อคิว" : `ดูอีก ${invoiceQueue.length - QUEUE_PREVIEW} งวด`}
                  </Button>
                </div>
              )}
            </div>
          </WorkspaceSection>
        )}

        {/* ── คิวที่สาม: เงินค้างจากใบที่ยกเลิก (PR3 · mig 0378 · มติ D4) ──────────────────────────────
            ⚠️ ขึ้นเฉพาะตอนมีของค้าง — คิวว่างที่โชว์ตลอดคือเสียงรบกวน · อยู่ใต้คิวเอกสาร (เคสไม่บ่อย) */}
        {strandedQueue.length > 0 && (
          <WorkspaceSection
            icon={<HandCoins size={17} />}
            title={`${LEDGER_STRANDED_TITLE} ${strandedQueue.length} งวด · ${fmtMoney(strandedTotal)}`}
            subtitle={`ใบยกเลิกแล้วแต่มีเงินรับแล้ว — ยกเข้าใบใหม่ของดีลเดียวกันได้ที่ใบใหม่ (ปุ่ม “${CARRY_BUTTON}”) หรือบันทึกคืนเงินลูกค้าจากที่นี่`}
          >
            <div className={styles.queue}>
              {strandedShown.map((row) => (
                <div key={row.id} className={styles.qrow}>
                  <div className={styles.qmain}>
                    <div>
                      <Link
                        prefetch={false}
                        href={`/sa/sales-orders/${row.orderId}#payment`}
                        target="_blank" rel="noreferrer"
                        className={`linklike mono ${styles.openLink}`}
                        title="เปิดใบในแท็บใหม่"
                      >
                        <strong>{row.orderNumber}</strong>
                        <ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
                      </Link>
                      <span className={styles.qsep}>·</span>
                      <span>{row.label || `งวดที่ ${row.seq}`}</span>
                    </div>
                    <span className="cell-sub">
                      {row.customerName}
                      {` · ${row.statusLabel}`}
                      {row.paidOn ? ` · จ่ายจริง ${fmtDate(row.paidOn)}` : ""}
                      {row.taxInvoiceNo ? ` · ใบกำกับ ${row.taxInvoiceNo}` : ""}
                    </span>
                  </div>
                  <span className={styles.qamt}>{fmtMoney(row.amount)}</span>
                  {/* คืนเงินได้เฉพาะงวดที่รับรองแล้ว — งวดรอตรวจอยู่ในคิวรับรองข้างบน (รับรอง/ตีกลับก่อน) */}
                  {row.status === "confirmed" ? (
                    <Button size="sm" tone="danger" variant="ghost" disabled={acting}
                      onClick={() => { setActionError(""); setRefundFor(row); }}>
                      บันทึกคืนเงิน
                    </Button>
                  ) : <span className="cell-sub">รับรอง/ตีกลับที่คิวข้างบนก่อน</span>}
                </div>
              ))}
              {strandedQueue.length > QUEUE_PREVIEW && (
                <div className={styles.qmore}>
                  <Button size="sm" variant="quiet" onClick={() => setStrandedOpen((v) => !v)}>
                    {strandedOpen ? "ย่อคิว" : `ดูอีก ${strandedQueue.length - QUEUE_PREVIEW} งวด`}
                  </Button>
                </div>
              )}
            </div>
          </WorkspaceSection>
        )}

        {/* แผงรายการ (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ) — ป้ายจำนวนข้อความเดิมทุกตัวอักษร
            (ใบ · งวด · "จาก N" ตอนกรอง) · คิวสองก้อนข้างบนยังเป็น WorkspaceSection เพราะเป็นงานให้ทำ ไม่ใช่ทะเบียน */}
        <ListPanel
          icon={<Wallet size={17} aria-hidden="true" />}
          title="งวดชำระทั้งหมด"
          subtitle="หนึ่งใบหนึ่งแถว รวมทุกงวดของใบนั้นไว้ด้วยกัน — ตั้งต้นเรียงใบที่ต้องตามก่อน · รายงวดดูที่ใบหรือในไฟล์ Excel"
          count={`${groups.length} ใบ · ${rows.length} งวด${filtering && data.totalRows ? ` จาก ${data.totalRows}` : ""}`}
          toolbar={(
          <>
          {/* ── แถบควบคุม: ค้นหา · ตัวกรอง · ช่วงวัน · จัดกลุ่ม | เรียง ────────────
              ⭐ ทรงเดียวกับตารางไปป์ไลน์ดีล (มติผู้ใช้ 2026-08-08) — ปุ่มตัวกรองยุบ
              ทุกหมวดไว้ในปุ่มเดียว · จัดกลุ่ม/เรียงเป็นปุ่มทรงเดียวกัน ชื่ออยู่ในปุ่ม
              ⚠️ ช่วงวันอยู่นอกปุ่มตัวกรอง เพราะเป็นช่วงค่าต่อเนื่อง ไม่ใช่ชุดตัวเลือก */}
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off"
                defaultValue={q}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="ค้นหาเลข SO / QT / เอกสารอ้างอิง / ลูกค้า / ชื่องวด / เลขใบกำกับ / รอบวางบิล"
                aria-label="ค้นหางวดชำระ"
              />
            </div>
            <FilterPopover
              count={filterCount}
              onClear={clearFilters}
              groups={[
                {
                  key: "orderState", label: "สถานะของใบ", icon: Receipt,
                  options: Object.entries(LEDGER_ORDER_STATES).map(([value, label]) => ({ value, label })),
                  selected: orderStateFilter, onChange: (values) => setListFilter("orderState", values),
                },
                {
                  /* ⭐ สายของงาน (มติผู้ใช้ 2026-08-30) — บัญชีต้องแยกใบที่ "เงินคุมคิวช่าง"
                     ออกจากใบขายทั่วไปได้ · เกณฑ์เต็ม: สาย SERVICE + มีบรรทัดหมวด 02-001
                     ⚠️ ใบที่ยังไม่ระบุสาย และใบสาย SERVICE ที่ไม่มีแพ็คเกจบริการ อยู่ถัง
                     "ใบอื่น" ทั้งคู่ — ไม่มีถังที่สามโดยเจตนา เพราะคำถามของบัญชีคือ
                     "ใบไหนที่เงินไปคุมคิวช่าง" ไม่ใช่ "สายธุรกิจของใบคืออะไร" */
                  key: "line", label: "สายของงาน", icon: Wrench,
                  options: [
                    { value: "service", label: "ใบมีรอบบริการ" },
                    { value: "other", label: "ใบอื่น" },
                  ],
                  selected: lineFilter, onChange: (values) => setListFilter("line", values),
                },
                {
                  key: "status", label: "สถานะงวด", icon: Flag,
                  options: LEDGER_STATUS_KEYS.map((key) => ({ value: key, label: LEDGER_STATUS[key].label })),
                  selected: statusFilter, onChange: (values) => setListFilter("status", values),
                },
                {
                  /* ใบกำกับภาษี (mig 0348) — สองถังพอ: ค้าง กับ ออกแล้ว
                     ⚠️ "ค้าง" นับเฉพาะงวดที่แจ้ง/รับรองแล้ว — งวดที่ยังไม่ถึงกำหนดจ่าย
                     ไม่ใช่ของค้าง มันยังไม่มีเงินให้ออกใบ */
                  key: "taxInvoice", label: "ใบกำกับภาษี", icon: FileText,
                  options: [
                    { value: "missing", label: `ยังไม่ออกใบ${summary?.missingInvoiceCount ? ` (${summary.missingInvoiceCount})` : ""}` },
                    { value: "issued", label: "ออกใบแล้ว" },
                  ],
                  selected: taxInvoice ? [taxInvoice] : [],
                  /* ถังเดียวเลือกได้ทีละอัน — เลือกทั้งสองพร้อมกันไม่มีความหมาย
                     (ค้าง ∪ ออกแล้ว = ทั้งหมด) ⇒ เอาค่าสุดท้ายที่กด */
                  onChange: (values) => setFilter("taxInvoice", values[values.length - 1] || ""),
                },
                {
                  key: "overdue", label: "ความด่วน", icon: AlarmClock,
                  options: [{ value: "1", label: `เฉพาะงวดที่เลยกำหนด${summary?.overdueCount ? ` (${summary.overdueCount})` : ""}` }],
                  selected: overdue ? ["1"] : [], onChange: (values) => setFilter("overdue", values.length ? "1" : ""),
                },
                {
                  /* ⭐ รอบวางบิล (mig 0389 · ม็อก D) — เลือกได้ทีละอัน (ช่วงซ้อนกันได้ ถ้าเลือกหลายอันจะอ่านไม่ออกว่า และ/หรือ)
                     ตัวเลขในวงเล็บนับจากตัวกรองอื่นที่ตั้งอยู่ **ไม่รวมตัวกรองนี้เอง** (`billingTally` จาก API)
                     ⚠️ "เลยรอบ" = วันวางบิลผ่านแล้ว + ยังไม่ขอใบวางบิล + ยังไม่แจ้งชำระ — คนละเรื่องกับ "เลยกำหนด" ข้างบน */
                  key: "billing", label: "รอบวางบิล", icon: CalendarClock, single: true,
                  options: LEDGER_BILLING_FILTERS.map((option) => {
                    const n = billingTally?.counts?.[option.value];
                    return { value: option.value, label: `${option.label}${n ? ` (${n})` : ""}` };
                  }),
                  selected: billing ? [billing] : [],
                  onChange: (values) => setFilter("billing", values[0] || ""),
                },
              ]}
            />
            {/* ⚠️ ช่วงวันกรองที่ **กำหนดชำระ** ไม่ใช่วันจ่ายจริง — คำถามของบัญชีคือ
                "เดือนนี้ต้องเก็บอะไรบ้าง" · ป้ายจึงต้องบอกให้ชัดว่ากรองอะไรอยู่ */}
            <DateInput value={from} onChange={(v) => setFilter("from", v)} ariaLabel="กำหนดชำระตั้งแต่" title="กรองที่กำหนดชำระ — ตั้งแต่" />
            <DateInput value={to} onChange={(v) => setFilter("to", v)} ariaLabel="กำหนดชำระถึง" title="กรองที่กำหนดชำระ — ถึง" />
            {filtering && (
              <Button size="sm" variant="quiet" onClick={clearFilters}>
                ล้างตัวกรอง ×
              </Button>
            )}

            <GroupMenu
              title="จัดกลุ่มใบตามหัวข้อ"
              value={groupBy}
              onChange={(value) => setParam("group", value === "none" ? "" : value)}
              options={LEDGER_GROUP_OPTIONS}
            />
            {!!buckets?.length && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((bucket) => bucket.key)))}
              />
            )}

            <div className="spacer" />
            {/* ⚠️ เปลี่ยนแบบเรียง = ตั้งทิศทางตั้งต้นของแบบนั้นให้ด้วย — ยอดเงินคนอ่าน
                คาดหวังมากไปน้อย ส่วนวันคาดหวังใกล้ไปไกล การคงทิศเดิมข้ามแบบทำให้
                กดครั้งแรกได้ลำดับที่ไม่มีใครอยากได้เกือบทุกครั้ง */}
            <SortMenu
              title="เรียงลำดับใบ"
              value={sortKey}
              defaultValue={LEDGER_SORT_DEFAULT}
              onChange={(value) => {
                const sp = new URLSearchParams(params.toString());
                if (value === LEDGER_SORT_DEFAULT) sp.delete("sort"); else sp.set("sort", value);
                sp.delete("dir");
                router.replace(`/finance/payments${sp.size ? `?${sp}` : ""}`, { scroll: false });
              }}
              options={LEDGER_SORT_OPTIONS}
            />
            <SortDirButton dir={sortDir} onToggle={() => setParam("dir", sortDir === "asc" ? "desc" : "asc")} />
          </>
          )}
        >
          <TableScroll surface="embedded" cells="stacked" minWidth={1460} aria-busy={loading}>
              <table className="w-full text-sm">
                <thead>
                  {/* ⭐ 9 → 6 คอลัมน์ (มติผู้ใช้ 2026-08-13 · แบบ ก)
                      · "งวด" กับ "ยอดงวด" เคยพูดเรื่องเดียวกันสองครั้ง ⇒ ยุบเป็นช่องเดียว
                        ที่ **ยอดค้างรับเป็นตัวเด่น** ซึ่งเป็นเลขที่บัญชีตามจริง
                      · "จ่ายจริง" กับ "ผู้รับรอง" เป็นของ **รายงวด** ⇒ ไม่อยู่บนหน้านี้เลย
                        (มติผู้ใช้ 2026-08-15 ถอดแถวย่อย) อยู่ที่ใบ SO และในไฟล์ Excel
                      · ตัดคอลัมน์ "สถานะ" — สเตจบอกอยู่แล้ว สองอย่างซ้อนกันอ่านเหมือนขัดกัน */}
                  <tr>
                    <th>เอกสาร / ความคืบหน้า</th>
                    <th>ลูกค้า</th>
                    <th className="num">งวด</th>
                    <th className="num">ค้างรับ</th>
                    <th className="num">จ่ายถึง</th>
                    {/* วันวางบิล (mig 0389) — ค่าระดับใบ = งวดถัดไปที่ต้องไปวางบิล · รายงวดครบอยู่ในไฟล์ Excel */}
                    <th className="num">วางบิลถัดไป</th>
                    <th className="num">กำหนดถัดไป</th>
                    {/* ใบกำกับภาษี (mig 0348) — ตารางเป็น **หนึ่งใบหนึ่งแถว** ⇒ ใส่ได้แค่
                        ตัวนับ ไม่ใช่เลขใบ · เลขรายงวดอยู่ในไฟล์ Excel และบนใบ SO */}
                    <th className="num">ใบกำกับ</th>
                    <th aria-label="เปิดใบ" />
                  </tr>
                </thead>
                <tbody>
                  {/* โหมดจัดกลุ่ม: หัวถังเป็นแถวเต็มความกว้าง กดที่แถบเพื่อย่อ/ขยาย
                      แถวใบข้างในเป็น `orderRow` ตัวเดียวกับโหมดปกติ — ห้ามก๊อปสองสำเนา
                      (AGENTS.md: ของที่ควรเป็นชุดเดียวกันแต่เขียนสองที่จะเพี้ยนหากัน) */}
                  {buckets ? buckets.map((bucket) => {
                    const bucketCollapsed = collapsed.has(bucket.key);
                    return (
                      <Fragment key={bucket.key}>
                        {/* ยอดของกลุ่ม = **ค้างรับ** ไม่ใช่ยอดรวม — เลขเดียวกับที่เป็น
                            ตัวเด่นในแถวใบ ⇒ หัวกลุ่มกับแถวข้างในพูดเรื่องเดียวกัน */}
                        <TableGroupRow
                          colSpan={9}
                          label={bucket.label}
                          sub={bucket.sub}
                          badge={`${bucket.count} ใบ`}
                          total={fmtMoney(bucket.total)}
                          totalTitle="ยอดค้างรับรวมของกลุ่มนี้"
                          collapsed={bucketCollapsed}
                          onToggle={() => toggleBucket(bucket.key)}
                        />
                        {!bucketCollapsed && bucket.items.map(orderRow)}
                      </Fragment>
                    );
                  }) : pageRows.map(orderRow)}
                  {!rows.length && !loading && (
                    <TableEmpty
                      colSpan={9}
                      /* ตัวกรองรอบวางบิลบอกนิยามของตัวเองตอนว่าง — "ว่าง" ของ "เลยรอบ" ต้องอ่านออกว่านับอะไร (ม็อก D) */
                      title={onlyBillingFilter ? billingOption.empty : filtering ? "ไม่มีงวดที่ตรงกับตัวกรอง" : "ยังไม่มีงวดชำระในระบบ"}
                      description={onlyBillingFilter
                        ? billingOption.hint
                        : filtering
                          ? "ลองขยายช่วงวันหรือล้างตัวกรอง"
                          : "งวดเกิดขึ้นเองตอน AE Supervisor อนุมัติใบสั่งขาย"}
                      action={filtering
                        ? <Button size="sm" onClick={clearFilters}>ล้างตัวกรอง</Button>
                        : undefined}
                    />
                  )}
                </tbody>
              </table>
          </TableScroll>

          {/* โหมดจัดกลุ่มไม่แบ่งหน้า — เหตุผลอยู่ที่ `usePagination` ด้านบน */}
          {rows.length > 0 && !buckets && (
            <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          )}
        </ListPanel>

        {/* ⭐ ใบย้อนหลัง = โหมดของโมดัลตัวเดิม (ผลลัพธ์ไม่มี Rev./Actual · อนุมัติใบ · เก็บแล้ว · หมายเหตุจาก SA)
            ⚠️ ภาพหลังรับรอง (`confirmOutlook`) ประทับมาจาก API จากงวดทั้งใบก่อนกรอง — ห้ามคิดจาก `rows` ของจอ
            (กรอง "รอบัญชีรับรอง" แล้วงวดถัดไป/งวดที่รับรองแล้วหลุด) */}
        <InstallmentConfirmDialog
          open={!!confirmFor}
          row={confirmRow}
          order={confirmFor ? {
            id: confirmFor.orderId, orderNumber: confirmFor.orderNumber, customerName: confirmFor.customerName,
            totalAmount: confirmFor.orderTotal, approvedByName: confirmFor.orderApprovedByName,
            approvedAt: confirmFor.orderApprovedAt, historicalInvoiceRef: confirmFor.historicalInvoiceRef,
            status: confirmFor.orderStatus,
          } : null}
          historical={isHistoricalOrder({ origin: confirmFor?.origin })}
          outlook={confirmRow?.confirmOutlook || null}
          /* จำนวนงวดของทั้งใบ (`planCount` · ประทับก่อนกรอง) — กดการ์ด "รอบัญชีรับรอง" แล้วใบสามงวดเหลือหนึ่งแถว
             ต้องยังเป็น "งวดที่ n" ไม่ใช่ชื่องวดของใบจ่ายครั้งเดียว */
          multi={Boolean(confirmFor && groups.find((g) => g.orderId === confirmFor.orderId)?.planCount > 1)}
          busy={acting}
          error={actionError}
          onClose={() => { setConfirmFor(null); setActionError(""); }}
          onConfirm={async (row) => { if (await runAction(row, "confirm")) setConfirmFor(null); }}
        />

        {/* ⭐ โมดัลใบกำกับตัวเดียวกับที่การ์ดงวดบนใบ SO ใช้ — หนึ่งฟอร์ม สองทางเรียก
            ⚠️ **แยกจากโมดัลรับรอง** โดยตั้งใจ (ดูหัวไฟล์ TaxInvoiceDialog) */}
        <TaxInvoiceDialog
          open={!!invoiceFor}
          row={invoiceRow}
          order={invoiceFor ? { id: invoiceFor.orderId, orderNumber: invoiceFor.orderNumber, customerName: invoiceFor.customerName } : null}
          todayIso={todayIso}
          busy={acting}
          error={actionError}
          onClose={() => { setInvoiceFor(null); setActionError(""); }}
          onSubmit={async (values) => {
            if (await runAction(invoiceRow, "tax-invoice", values)) setInvoiceFor(null);
          }}
          onClear={async () => {
            if (await runAction(invoiceRow, "tax-invoice-clear")) setInvoiceFor(null);
          }}
        />

        {/* ⭐ บันทึกคืนเงิน (PR3 · mig 0378) — โมดัลตัวเดียวกับเมนูงวดบนใบที่ยกเลิก · สิทธิ์ตัดสินที่ API (ฝ่ายบัญชี) */}
        <InstallmentRefundDialog
          open={!!refundFor}
          row={refundRow}
          order={refundFor ? { orderNumber: refundFor.orderNumber, customerName: refundFor.customerName } : null}
          todayIso={todayIso}
          busy={acting}
          error={actionError}
          onClose={() => { setRefundFor(null); setActionError(""); }}
          onSubmit={async (values) => {
            if (await runAction(refundRow, "refund", values)) setRefundFor(null);
          }}
        />

        {/* ตีกลับใช้ ReasonDialog ตัวเดียวกับการ์ดบนใบ — เหตุผลบังคับชุดเดียวกัน
            ⭐ งวดยกมา: ตีกลับแก้ได้แค่หลักฐาน/วันรับเงิน — ยอดหรือช่วงที่ AE Sup อนุมัติไปผิดต้องยกเลิกใบแล้วคีย์ใหม่
            ⇒ บอกทางออกทั้งสองแบบก่อนกด (historicalOpeningRejectNote) ไม่ใช่ให้ฝ่ายขายเดาเองทีหลัง */}
        <ReasonDialog
          open={!!rejectFor}
          title="ตีกลับการแจ้งชำระ"
          description="งวดนี้จะกลับไปให้ฝ่ายขายแก้แล้วแจ้งใหม่"
          detail={rejectFor && isOpeningInstallment(rejectFor.row) ? historicalOpeningRejectNote : undefined}
          label="เหตุผลที่ตีกลับ"
          value={rejectFor?.reason || ""}
          onChange={(reason) => setRejectFor((f) => ({ ...f, reason }))}
          onClose={() => { setRejectFor(null); setActionError(""); }}
          onConfirm={async () => {
            if (await runAction(liveRow(rejectFor.row), "reject", { reason: rejectFor.reason })) setRejectFor(null);
          }}
          confirmLabel="ยืนยันตีกลับ"
          placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
          minLength={MIN_REJECT_REASON}
          maxLength={500}
          tone="danger"
          busy={acting}
          error={actionError}
        />

        {/* ⚠️ บอกตรง ๆ ว่าไฟล์ที่ได้คือของที่กรองไว้ — คนกดปุ่มขณะกรองอยู่แล้วได้ทั้ง
            ทะเบียนมาคือไฟล์ที่เอาไปกระทบยอดผิด และไม่มีอะไรบนจอบอกว่าต่างกัน */}
        <p className="form-note">
          ไฟล์ Excel ที่ดาวน์โหลดคือ<strong>รายการที่กรองไว้ตอนนี้</strong> ({rows.length} งวด)
          — ไฟล์เป็นรายงวด มีวันวางบิลและกำหนดชำระของทุกงวด
        </p>
      </div>
    </Workspace>
  );
}

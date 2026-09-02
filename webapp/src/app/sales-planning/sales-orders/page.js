"use client";
import { TableEmpty, TableGroupRow, TableScroll } from "@/components/ui/Table";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CircleDollarSign, ClipboardCheck, ClipboardList, Flag, Search, UserRound, Wallet } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import FilterPopover from "@/components/ui/FilterPopover";
import ApprovalQueue from "@/components/ui/ApprovalQueue";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import { useCan, useShellSystem } from "@/lib/roleContext";
import { fmtDate, fmtMoney, fmtName, naText, NA } from "@/lib/format";
import { salesOrderPaymentNote } from "@/lib/sales/salesOrderPayments";
import { salesOrderListTrack } from "@/lib/sales/salesOrderListTrack";
import StepTrack from "@/components/ui/StepTrack";
import Segmented from "@/components/ui/Segmented";
import { BUSINESS_LINE_LABELS } from "@/lib/master/businessLines";
import { apiFetch } from "@/lib/apiFetch";

const STATUS = { draft: "ฉบับร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" };
function statusBadge(status, className = "") {
  const color = { draft: "var(--text-3)", pending_approval: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--red)" }[status] || "var(--text-3)";
  // ขอบ/พื้นมาจาก .ui-badge ที่ derive จาก currentColor อยู่แล้ว — ตั้ง color พอ
  return <span className={["ui-badge", className].filter(Boolean).join(" ")} style={{ color }}>{STATUS[status] || status}</span>;
}

/* เซลล์ "งวดชำระ" ของตารางรายการ — เก็บแล้ว/ทั้งหมด
   สีบอกเรื่องเดียว: เขียว = ครบ · แดง = เลยกำหนดหรือถูกตีกลับ · จาง = ยังไม่เริ่มติดตาม
   ⚠️ ไม่ใช้ป้าย (badge) เพราะเป็น **ตัวเลขที่คนกวาดตาเทียบข้ามแถว** ⇒ ต้องชิดขวา
   และเป็น tabular (กฎ 3 · UI_DESIGN_SYSTEM §ป้ายในตาราง) */
function paymentCell(payment) {
  if (!payment) return <span className="cell-num-idle">{NA}</span>;
  const { tracked, paid, count, complete, overdue, rejected } = payment;
  const tone = !tracked ? "cell-num-idle"
    : complete ? "cell-num-ok"
      : (overdue || rejected) ? "cell-num-bad"
        : undefined;
  const why = !tracked ? "ยังไม่เริ่มติดตาม — จำนวนงวดมาจากแผนในใบเสนอราคา"
    : complete ? "เก็บเงินครบทุกงวดแล้ว"
      : overdue ? `เลยกำหนดแล้ว ${overdue} งวด`
        : rejected ? `บัญชีตีกลับ ${rejected} งวด`
          : "นับเฉพาะงวดที่บัญชีคอนเฟิร์มแล้ว";
  /* ⭐ **บรรทัดสถานะใต้ตัวเลข** (มติผู้ใช้ 2026-08-13) — `0/2` เหมือนกันเป๊ะอาจเป็นได้
     ทั้ง "ลูกค้ายังไม่จ่าย" และ "จ่ายแล้วรอบัญชีรับรอง" ซึ่งเป็นงานคนละฝ่าย
     ⚠️ ตัวเลขยังเป็นพระเอกของช่อง (ชิดขวา tabular กวาดตาเทียบข้ามแถวได้) บรรทัดสถานะ
     จึงเล็กและจางกว่า ไม่ใช่ป้ายเต็มตัว — ไม่งั้นคอลัมน์นี้จะแย่งสายตาจากคอลัมน์สถานะเอกสาร */
  const note = salesOrderPaymentNote(payment);
  return (
    <>
      <span className={tone} title={why}>{paid}/{count}</span>
      {note ? <span className={`cell-sub ${NOTE_TONE[note.tone] || ""}`.trim()}>{note.label}</span> : null}
    </>
  );
}

/* ── เซลล์ของมุมมอง "สายบริการ" (PR-D) ────────────────────────────────────
   ⚠️ ทั้งสามช่องต้องแยก "ไม่มีข้อมูล" ออกจาก "มีข้อมูลว่าไม่มี" ให้ได้:
     สัญญา     — ยังไม่ผูก ≠ ใบนี้ไม่ต้องมีสัญญา ⇒ บอกตรง ๆ ว่า "ยังไม่ผูก"
     จ่ายถึง    — ยังไม่มีงวดที่รับรอง = ขีด ไม่ใช่วันที่ว่าง ๆ
     รอบ n/N   — N ว่าง (ยังไม่กรอกที่ใบเสนอราคา) = ขีด ไม่ใช่ n/0 ที่อ่านเหมือนขายศูนย์รอบ */
function serviceContractCell(service) {
  if (!service) return <span className="cell-num-idle">{NA}</span>;
  if (!service.contract) return <span className="cell-num-idle">ยังไม่ผูกสัญญา</span>;
  return (
    <>
      <span className="mono">{service.contract.contractNo || NA}</span>
      {service.contract.status !== "signed"
        ? <span className="cell-sub">{CONTRACT_STATUS_NOTE[service.contract.status] || service.contract.status}</span>
        : null}
    </>
  );
}

/* ป้ายสถานะสัญญาที่ยังไม่มีผล — ใบที่ผูกสัญญาซึ่งยังไม่ลงนามคือ "ผูกแล้วแต่ยังใช้ไม่ได้"
   ซึ่งต่างจากทั้งสองขั้วข้างบน · ชื่อขั้นอ่านจากทะเบียนสัญญา ไม่ตั้งคำใหม่ที่นี่ */
const CONTRACT_STATUS_NOTE = {
  draft: "ยังเป็นฉบับร่าง",
  awaiting_signature: "รอลงนาม",
  awaiting_approval: "รอหัวหน้ารับรอง",
  cancelled: "ยกเลิกแล้ว",
};

function roundsCell(service) {
  if (!service || !service.roundsSold) return <span className="cell-num-idle">{NA}</span>;
  const done = service.roundsDone || 0;
  const complete = done >= service.roundsSold;
  return (
    <span
      className={complete ? "cell-num-ok" : undefined}
      title={`เดินไปแล้ว ${done} รอบ จากที่ขายไว้ ${service.roundsSold} รอบ (นับเฉพาะนัดที่ปิดงานแล้ว)`}
    >
      {done}/{service.roundsSold}
    </span>
  );
}

// โทนของบรรทัดสถานะการชำระ — ใช้คลาสกลางชุดเดียวกับตัวเลขในตาราง
const NOTE_TONE = { danger: "cell-num-bad", success: "cell-num-ok", warning: "", idle: "" };

/* ── มุมมองของตาราง: เรียง · จัดกลุ่ม (มติผู้ใช้ 2026-08-15) ────────────────
   ทรงเดียวกับทะเบียนการชำระและตารางไปป์ไลน์ดีล — ปุ่มอยู่ใน `ui/ViewMenus`
   ตัวจัดถังอยู่ใน `lib/listGrouping` · ที่นี่ประกาศแค่ "หัวข้อของหน้านี้" */
const SORT_OPTIONS = [
  { value: "recent", label: "ล่าสุด", dir: "asc" },
  { value: "order", label: "เลขที่ใบ", dir: "desc" },
  { value: "customer", label: "ลูกค้า", dir: "asc" },
  { value: "actual", label: "Actual", dir: "desc" },
  { value: "due", label: "กำหนดชำระ", dir: "asc" },
];
const SORT_DEFAULT = "recent";
const sortDirOf = (key) => SORT_OPTIONS.find((option) => option.value === key)?.dir || "asc";

/* ── มุมมองตามสายธุรกิจ (PR-D · มติผู้ใช้ 2026-08-27) ───────────────────────
   ⭐ **ไม่ใช่ตัวกรองในกล่องกรอง แต่เป็นตัวสลับ "มุมมอง"** — สายบริการตอบคำถามคนละชุด
   กับสายสินค้า (สัญญาผูกหรือยัง · จ่ายครอบถึงเมื่อไร · เดินไปกี่รอบแล้ว) ⇒ เลือกสาย
   แล้วคอลัมน์ท้ายตารางเปลี่ยนตาม ไม่ใช่แค่แถวหายไป
   ⚠️ "ยังไม่ระบุสาย" เป็นสถานะที่ถูกต้องและมีจริงเยอะ ⇒ ต้องอยู่ใน "ทุกสาย" เสมอ
   ไม่ใช่ถูกกลืนหายไปกับ SCENT/SERVICE (เจอมาแล้วกับตัวกรองปีที่กลืนแถวไม่มีวันที่) */
const LINE_VIEWS = [
  { value: "all", label: "ทุกสาย" },
  { value: "PRODUCT", label: BUSINESS_LINE_LABELS.PRODUCT },
  { value: "SERVICE", label: BUSINESS_LINE_LABELS.SERVICE },
];

const GROUP_OPTIONS = [
  { value: "none", label: "ไม่จัดกลุ่ม" },
  { value: "customer", label: "ลูกค้า" },
  { value: "owner", label: "ผู้ดูแล (AE)" },
  { value: "status", label: "สถานะเอกสาร" },
];

/* สถานะการชำระของใบ — คำถามที่ตารางสถานะเอกสารตอบไม่ได้ ("ใบไหนเงินยังไม่ครบ")
   ⚠️ `tracked` เท็จ = ยังไม่เริ่มติดตาม ไม่ใช่ "ยังไม่จ่าย" — คนละเรื่องกัน */
const PAYMENT_FILTERS = {
  complete: { label: "เก็บเงินครบแล้ว", match: (row) => row.payment?.complete },
  overdue: { label: "มีงวดเลยกำหนด", match: (row) => (row.payment?.overdue || 0) > 0 },
  rejected: { label: "มีงวดถูกตีกลับ", match: (row) => (row.payment?.rejected || 0) > 0 },
  untracked: { label: "ยังไม่เริ่มติดตาม", match: (row) => !row.payment?.tracked },
};

/* ⚠️ **ใบที่ยังไม่มีกำหนดชำระอยู่ท้ายเสมอ ไม่ว่าเรียงขึ้นหรือลง** — กติกาเดียวกับ
   ทะเบียนการชำระ: ยังไม่ถูกนัดวัน = ยังไม่ใช่งานของสัปดาห์นี้ */
function compareOrders(a, b, key, dir) {
  const mul = dir === "desc" ? -1 : 1;
  const text = (value) => String(value || "");
  if (key === "due") {
    const aDue = a.paymentDueDate || null;
    const bDue = b.paymentDueDate || null;
    if (!aDue !== !bDue) return aDue ? -1 : 1;
    if (aDue !== bDue) return (String(aDue) < String(bDue) ? -1 : 1) * mul;
  } else if (key === "actual") {
    const diff = (Number(a.actualAmount) || 0) - (Number(b.actualAmount) || 0);
    if (diff) return diff * mul;
  } else if (key === "customer") {
    const byName = text(a.customerName).localeCompare(text(b.customerName), "th");
    if (byName) return byName * mul;
  }
  const byOrder = text(a.orderNumber).localeCompare(text(b.orderNumber), "th");
  return key === "order" ? byOrder * mul : byOrder;
}


/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function SalesOrdersPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useStickyState("query", "");
  /* ตัวกรองรวมในปุ่มเดียว (FilterPopover) — เลือกได้หลายค่าต่อหมวด ต่างจาก
     dropdown เดิมที่เลือกสถานะได้ทีละค่า ("รออนุมัติ + ตีกลับ" คือคำถามจริงของ AE Sup) */
  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", EMPTY);
  const [lineView, setLineView] = useStickyState("lineView", "all");
  const [paymentFilter, setPaymentFilter] = useStickyState("paymentFilter", EMPTY);
  /* ⭐ `?count=salesOrders` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายนับ "ใบของฉันที่ถูก
     ตีกลับ" ⇒ กรองด้วยธง `_waitingOnMe` จาก server ไม่ใช่ status='rejected' เฉย ๆ
     (ใบที่คนอื่นโดนตีกลับก็ status เดียวกัน แต่ไม่ใช่ของค้างของเรา) */
  const navCountParam = useSearchParams().get("count") || "";
  const router = useRouter();
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(navCountParam === "salesOrders");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/sales-planning/sales-orders");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โหลดใบสั่งขายไม่สำเร็จ");
      setRows(data);
    } catch (err) {
      setError(err.message || "โหลดใบสั่งขายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // รอยต่อ SO อนุมัติ → ใบยื่นชำระภาษี. ใช้ endpoint เดิมของโมดูลภาษี (?available=1)
  // ซึ่งกรอง "อนุมัติแล้ว + ยังไม่มีใบยื่น + มีสินค้าสรรพสามิตจริง" ให้ครบแล้ว —
  // ห้ามนับเองที่นี่ ไม่งั้น SO ที่ขายของนอกพิกัดจะค้างในตัวเลขตลอดกาล
  // ไม่มีสิทธิ์ sales:act (403) หรือยิงไม่ผ่าน = ไม่ต้องมีแถบเตือน ไม่ใช่เรื่องของคนดูอย่างเดียว
  const [awaitingFiling, setAwaitingFiling] = useState(0);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/tax/orders/from-sales-order?available=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && data?.schemaReady) setAwaitingFiling((data.salesOrders || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [sortKey, setSortKey] = useStickyState("sortKey", SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", sortDirOf(SORT_DEFAULT));
  const [collapsed, setCollapsed] = useState(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (waitingOnMeOnly && !row._waitingOnMe) return false;
      if (lineView !== "all" && row.businessLine !== lineView) return false;
      if (statusFilter.length && !statusFilter.includes(row.status)) return false;
      // หลายหมวดการชำระ = "อย่างใดอย่างหนึ่ง" (เลยกำหนด **หรือ** ถูกตีกลับ = ใบที่ต้องตาม)
      if (paymentFilter.length && !paymentFilter.some((key) => PAYMENT_FILTERS[key]?.match(row))) return false;
      // ⭐ เอกสารอ้างอิงอยู่ในชุดค้นด้วย (IS-26080017) — เหตุผลหลักที่ช่องนี้เกิดคือ
      // "ลูกค้าถามถึง PO เลขนี้ ใบไหน" ซึ่งตอบไม่ได้ตอนที่เลขไปกองอยู่ในหมายเหตุ
      return !q || [row.orderNumber, row.customerName, row.deal?.title, row.quotation?.quoteNumber, row.referenceDoc]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [query, rows, statusFilter, paymentFilter, waitingOnMeOnly, lineView]);

  /* `recent` = ลำดับที่ API ส่งมา (ล่าสุดก่อน) — ไม่คิดใหม่ที่นี่ ไม่งั้นมีกติกา
     "ล่าสุด" สองชุดที่เพี้ยนหากันได้ · สลับทิศคือกลับลำดับเดิม */
  const sorted = useMemo(() => {
    if (sortKey === SORT_DEFAULT) return sortDir === "desc" ? [...filtered].reverse() : filtered;
    return [...filtered].sort((a, b) => compareOrders(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const buckets = useMemo(() => {
    if (groupBy === "none") return null;
    return bucketList(sorted, (row) => {
      if (groupBy === "customer") {
        return {
          key: row.customerArCode || String(row.customerName || "").trim(),
          label: row.customerName || "ไม่ระบุลูกค้า",
          sub: row.customerArCode || null,
          weight: row.status === "approved" ? Number(row.actualAmount) || 0 : 0,
        };
      }
      if (groupBy === "owner") {
        // ⚠️ ผู้ดูแลอยู่ที่ **ดีล** ของใบ · กุญแจใช้ id ก่อนชื่อ (ชื่อซ้ำกันได้)
        const name = String(row.deal?.ownerName || "").trim();
        return {
          key: row.deal?.ownerId || name,
          label: name ? fmtName(name) : "ไม่ระบุผู้ดูแล",
          sub: row.deal?.team || null,
          weight: row.status === "approved" ? Number(row.actualAmount) || 0 : 0,
        };
      }
      return {
        key: row.status,
        label: STATUS[row.status] || row.status,
        weight: row.status === "approved" ? Number(row.actualAmount) || 0 : 0,
      };
    });
  }, [sorted, groupBy]);

  /* ⚠️ colSpan ต้องเดินตามจำนวนคอลัมน์จริง ไม่ใช่เลข 4 ที่พิมพ์ค้างไว้ — หัวกลุ่ม/แถวว่าง
     ที่ colSpan สั้นกว่าตารางจะเปิดช่องว่างท้ายแถวให้เห็นเลย */
  const serviceView = lineView === "SERVICE";
  const columnCount = serviceView ? 7 : 4;

  const toggleBucket = useCallback((key) => setCollapsed((current) => toggleBucketKey(current, key)), []);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);
  const filterCount = statusFilter.length + paymentFilter.length + (waitingOnMeOnly ? 1 : 0);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sorted, { resetKey: `${query}|${statusFilter.join()}|${paymentFilter.join()}|${waitingOnMeOnly}|${lineView}|${sortKey}|${sortDir}` });

  /* ⭐ **คิวบนหัวหน้าเดินตามเปลือกของคนดู** (มติผู้ใช้ 2026-08-25)
     ทะเบียนใบสั่งขายอยู่ในเมนูของทั้งสายขายและฝ่ายบัญชี (มติ 2026-08-22 · SHARED_DOC_ITEMS)
     และหน้าเดียวกันสวมเปลือกคนละอันตามคนดู ⇒ การ์ดต้องพูดงานของคนที่ยืนอยู่
       เปลือกบัญชี  → ใบที่เก็บเงินครบทุกงวดแล้วและรอบัญชีปิด (แกน `financeStatus`)
       เปลือกอื่น   → ใบที่รอคนดูอนุมัติ (แกน `status`)
     ⚠️ ตัดสินด้วย `useShellSystem(pathname)` ซึ่งถาม **ทั้งบ้านของคนดูและลิสต์
     เส้นทางที่บ้านนั้นรับไป** (`ADOPTED_SHARED_PATHS`) — ชุดเดียวกับที่เมนูใช้
     ห้ามเช็ค role/department เองตรงนี้ และห้ามใช้ "บ้านของคนดู" ลอย ๆ เพราะ RD
     รับแค่ `/requests` ⇒ RD ที่เปิดหน้านี้ยังอยู่ในเปลือกงานขาย ไม่ใช่เปลือก RD
     ⚠️ ปุ่มยังเป็น "เปิดใบ" ทั้งสองโหมด — ด่านตรวจ/อนุมัติอยู่ที่หน้าเอกสารที่เดียว
     (กฎความเป็นเจ้าของโมดูล ข้อ 3: "ด่านเดียว ไม่ใช่จอเดียว") */
  const financeShell = useShellSystem(usePathname()) === "finance";
  const approvalQueue = useMemo(
    () => rows.filter((row) => (financeShell ? row._awaitingFinanceReview : row._awaitingMyApproval)),
    [rows, financeShell],
  );

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending_approval").length,
    approved: rows.filter((row) => row.status === "approved").length,
    actual: rows.reduce((sum, row) => sum + (row.status === "approved" ? Number(row.actualAmount) || 0 : 0), 0),
  }), [rows]);

  /* ── แถวของใบสั่งขายหนึ่งใบ — ใช้ทั้งโหมดปกติและโหมดจัดกลุ่ม ────────────
     ⚠️ ฟังก์ชันตัวเดียว ไม่ใช่ markup สองสำเนาในสองสาขาของ tbody (AGENTS.md) */
  /* ⚠️ **หน้านี้ไม่มี CSS module ของตัวเองแล้ว** (2026-08-18) — เคยมีกฎเดียวคือ
     "จอ ≤1200px ซ่อนรางแล้วโชว์ป้ายสรุป" · ถอดออกตามมติผู้ใช้ ("อยากเห็นเส้นถึงระดับ
     แท็บเล็ต เลื่อนแนวนอนไม่ติด ดีกว่าข้อมูลหาย") แล้วลดคอลัมน์แทน:
     "กำหนดชำระ" ยุบเข้าเซลล์ "งวดชำระ" (วันครบกำหนดเป็นคุณสมบัติของงวด ไม่ใช่แกนแยก)
     ⚠️ ตารางคิวคำร้องถอดกฎเดียวกันไปพร้อมกัน — สองตารางต้องอ่านเหมือนกัน */
  const orderRow = (row) => {
    const track = salesOrderListTrack(row);
    return (
                <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                  <td>
                    <Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono"><strong>{row.orderNumber}</strong></Link>
                    {/* อ้างอิง QT อยู่บรรทัดรอง — เป็น "ที่มาของใบ" ไม่ใช่ตัวใบเอง
                        เอกสารฝั่งลูกค้า (PO/สัญญา) ต่อท้ายเมื่อมี · ยาวได้ 200 ตัวอักษร
                        จึงตัดด้วย ellipsis และเก็บเต็มไว้ใน title (บทเรียนจาก IS-26080004) */}
                    <span className="cell-sub" title={row.referenceDoc || undefined}>
                      <span className="cell-ellipsis">
                        {naText(row.quotation?.quoteNumber)}
                        {row.referenceDoc ? ` · ${row.referenceDoc}` : ""}
                      </span>
                    </span>
                    {track.cancelled ? (
                      <span className="cell-sub">{statusBadge(row.status, "ui-badge-cell ui-badge-w-doc")}</span>
                    ) : (
                      /* ⭐ **รางขึ้นทุกความกว้าง** (มติผู้ใช้ 2026-08-18) — เดิมจอ ≤1200px
                         สลับเป็นป้ายสรุป · ผู้ใช้เลือก "เห็นเส้นจนถึงแท็บเล็ต เลื่อนแนวนอน
                         ไม่ติด ดีกว่าข้อมูลหาย" ⇒ ถอดกติกาสลับทิ้ง แล้วลดคอลัมน์แทน
                         (กำหนดชำระยุบเข้าเซลล์งวดชำระ) ให้ตารางแคบลงจริง ๆ */
                      <StepTrack steps={track.steps} />
                    )}
                  </td>
                  <td>
                    {/* AR บน · ชื่อล่าง (มติผู้ใช้ 2026-08-12 — ทรงเดียวกับตาราง QT) */}
                    {row.customerArCode ? <span className="ar-code ar-code-block">{row.customerArCode}</span> : null}
                    {naText(row.customerName)}
                    <span className="cell-sub">{naText(row.deal?.title)}</span>
                  </td>
                  {/* ใบที่ยังไม่อนุมัติเคยโชว์ 0.00 เฉย ๆ ซึ่งอ่านเหมือน "ใบนี้ไม่มีมูลค่า"
                      ⇒ หรี่สีลง + บอกเหตุเป็นบรรทัดรอง ไม่ใช่ปล่อยให้เดาเอง */}
                  <td className={`num mono ${row.status === "approved" ? "" : "cell-num-idle"}`.trim()}>
                    {fmtMoney(row.actualAmount)}
                    {row.status === "approved" ? null : <span className="cell-sub">ยังไม่นับเป็น Actual</span>}
                  </td>
                  {/* ⭐ งวดชำระ — นับเฉพาะงวดที่ **บัญชีคอนเฟิร์ม** (กฎเดียวกับทั้งระบบ)
                      บรรทัดรองบอกเรื่องที่ด่วนที่สุดเรื่องเดียว (ดู salesOrderPaymentNote) */}
                  {/* ⚠️ `paymentCell` วาดบรรทัดสถานะให้ในตัวแล้ว — เติมซ้ำที่นี่จะได้
                      คำเดียวกันสองบรรทัด (เจอตอนกดดูรอบแรก) */}
                  <td className="num mono">
                    {paymentCell(row.payment)}
                    {/* วันครบกำหนดเป็นบรรทัดรองของงวด — แดงเมื่อเลยกำหนด (โทนเดิม) */}
                    <span className={`cell-sub ${row.payment?.overdue ? "cell-num-bad" : ""}`.trim()}>
                      กำหนด {fmtDate(row.paymentDueDate)}
                    </span>
                  </td>
                  {/* ⭐ สามคอลัมน์ท้ายขึ้นเฉพาะมุมมองสายบริการ — คำถามที่คอลัมน์ชุดเดิม
                      ตอบไม่ได้: สัญญาผูกหรือยัง · เงินครอบบริการถึงเมื่อไร · เดินไปกี่รอบ */}
                  {serviceView && <td>{serviceContractCell(row.service)}</td>}
                  {serviceView && (
                    <td className="num mono">
                      {row.service?.paidThrough
                        ? fmtDate(row.service.paidThrough)
                        : <span className="cell-num-idle">{NA}</span>}
                    </td>
                  )}
                  {serviceView && <td className="num mono">{roundsCell(row.service)}</td>}
                </DetailRow>
    );
  };

  if (!canView) return <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย"><div className="glass-panel" style={{ padding: 16 }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div></SaWorkspace>;

  return (
    <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย" subtitle="สร้างจาก QT Won ตรวจสอบเอกสาร และนับ Actual หลัง AE Supervisor อนุมัติเท่านั้น">
      <div className="flex flex-col gap-4">
        {error && <div className="glass-panel" role="alert" style={{ padding: 14, color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}

        {awaitingFiling > 0 && (
          <StatusNotice
            tone="warning"
            title={`ใบสั่งขาย ${awaitingFiling} ใบรอออกใบยื่นชำระภาษี`}
            /* 🐞 เดิมเป็น `<Link className="linklike">` ตัวเดียวในระบบที่นั่งในสล็อต
               `action` ของ StatusNotice — กฎ `.action :global(.btn)` แจก width:100%
               + `--ctl-h-touch` (44px, WCAG §2.5.5) ให้เฉพาะ `.btn` ⇒ ลิงก์ตัวนี้
               ไม่ได้เป้าสัมผัสตามเกณฑ์ที่ระบบตั้งเอง · ยังเป็น <a href> เหมือนเดิม */
            action={<Button as={Link} href="/tax/filings" size="sm" variant="ghost">เปิดหน้ายื่นชำระ</Button>}
          >
            อนุมัติแล้วและมีสินค้าสรรพสามิตอยู่ในใบ แต่ยังไม่ได้สร้างใบยื่นต่อกรมสรรพสามิต
          </StatusNotice>
        )}

        <SaMetricStrip>
          <SaMetric icon={<ClipboardList />} label="ใบสั่งขายทั้งหมด" value={summary.total} note="เอกสารในขอบเขตที่คุณดูได้" />
          <SaMetric icon={<ClipboardCheck />} label="รอตรวจอนุมัติ" value={summary.pending} note="รอ AE Supervisor ดำเนินการ" tone={summary.pending ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="อนุมัติแล้ว" value={summary.approved} note="เอกสารที่ถูกนับเป็น Actual" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="Actual ก่อน VAT" value={fmtMoney(summary.actual)} note="รวมเฉพาะ SO ที่อนุมัติแล้ว" tone="good" />
        </SaMetricStrip>

        {/* คิว "รออนุมัติจากคุณ" — เหตุผลและทรงเดียวกับทะเบียนใบเสนอราคา/ลูกค้า/สินค้า
            ⚠️ ตัดใบที่ตัวเองสร้างหรือยื่นออกที่ server แล้ว (อนุมัติเองไม่ได้) */}
        <ApprovalQueue
          items={approvalQueue}
          unit="ใบ"
          title={financeShell ? "ต้องทำตอนนี้ — ใบที่เก็บครบแล้ว รอปิด" : "ต้องทำตอนนี้ — รออนุมัติจากคุณ"}
          primary={(o) => o.orderNumber}
          secondary={(o) => `${naText(o.customerName)} · ${fmtMoney(o.totalAmount)}`}
          onOpen={(o) => router.push(`/sa/sales-orders/${o.id}`)}
          renderAction={(o) => (
            <Button as={Link} href={`/sa/sales-orders/${o.id}`} tone="primary" size="sm">
              {financeShell ? "เปิดใบเพื่อตรวจ" : "เปิดใบเพื่ออนุมัติ"}
            </Button>
          )}
        />

        <SaSection icon={<ClipboardList size={17} />} title="รายการใบสั่งขาย" subtitle="ค้นหา ตรวจเอกสาร และติดตามขั้นตอนอนุมัติจากจุดเดียว" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          {/* แถบควบคุมทรงเดียวกับทุกตารางในระบบ: ค้นหา · ตัวกรอง · จัดกลุ่ม | เรียง */}
          <div className="toolbar">
            <Segmented
              ariaLabel="มุมมองตามสายธุรกิจ"
              options={LINE_VIEWS}
              value={lineView}
              onChange={setLineView}
            />
            <div className="search-glass" style={{ width: 330 }}><Search size={16} color="var(--text-3)" /><input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข SO / QT / ลูกค้า / ดีล / เอกสารอ้างอิง" /></div>
            <FilterPopover
              count={filterCount}
              onClear={() => { setStatusFilter([]); setPaymentFilter([]); setWaitingOnMeOnly(false); }}
              groups={[
                {
                  key: "status", label: "สถานะเอกสาร", icon: Flag,
                  options: Object.entries(STATUS).map(([value, label]) => ({ value, label })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "payment", label: "การชำระ", icon: Wallet,
                  options: Object.entries(PAYMENT_FILTERS).map(([value, { label }]) => ({ value, label })),
                  selected: paymentFilter, onChange: setPaymentFilter,
                },
                {
                  key: "mine", label: "งานของฉัน", icon: UserRound,
                  options: [{ value: "waiting", label: "รอฉันลงมือ" }],
                  selected: waitingOnMeOnly ? ["waiting"] : [],
                  onChange: (values) => setWaitingOnMeOnly(values.length > 0),
                },
              ]}
            />
            <GroupMenu
              title="จัดกลุ่มใบสั่งขาย"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={GROUP_OPTIONS}
            />
            {!!buckets?.length && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((bucket) => bucket.key)))}
              />
            )}
            <div className="spacer" />
            {/* เปลี่ยนแบบเรียง = ตั้งทิศตั้งต้นของแบบนั้นให้ด้วย (เงินมากไปน้อย · วันใกล้ไปไกล) */}
            <SortMenu
              title="เรียงลำดับใบสั่งขาย"
              value={sortKey}
              defaultValue={SORT_DEFAULT}
              onChange={(value) => { setSortKey(value); setSortDir(sortDirOf(value)); }}
              options={SORT_OPTIONS}
            />
            <SortDirButton dir={sortDir} onToggle={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} />
          </div>
          {/* ── ตารางรายการ: รื้อใหม่แบบ ข (มติผู้ใช้ 2026-08-13) ──────────────
              9 → 5 คอลัมน์ · **ตัดคอลัมน์ที่ไม่มีข้อมูลจริงทิ้ง**:
                · "เอกสารอ้างอิง" เป็น `-` แทบทุกแถว ⇒ ย้ายไปเป็นบรรทัดรองใต้เลข SO
                  โผล่เฉพาะใบที่มีจริง (ของที่มีน้อยแต่กินคอลัมน์เต็มคือของที่ควรเป็นบรรทัดรอง)
                · "วันที่ SO" ตรงกับ "กำหนดชำระ" แทบทุกใบ ⇒ เหลือกำหนดชำระซึ่งเป็นวันที่คนใช้จริง
                · "สถานะ" ป้ายเดียวบอกได้แค่จุดปัจจุบัน ⇒ แทนด้วย **รางสามขั้น**
              ⚠️ รางไม่ใช่การตกแต่ง — สามขั้นคือสามแกนคนละคอลัมน์ใน DB ที่เดินไม่พร้อมกัน
              (`status` · `financeStatus` · งวดชำระ) ตรรกะอยู่ใน `salesOrderListTrack` พร้อมเทสต์ */}
          <TableScroll surface="embedded" cells="stacked" minWidth={serviceView ? 1060 : 820} aria-busy={loading}>
            <table className="w-full text-sm">
              {/* ⚠️ **4 คอลัมน์** — "กำหนดชำระ" ยุบเข้าเซลล์ "งวดชำระ" (มติผู้ใช้ 2026-08-18)
                  ทั้งคู่เป็นเรื่องการชำระของใบเดียวกัน และวันครบกำหนดคือคุณสมบัติของงวด
                  ไม่ใช่แกนแยก ⇒ คอลัมน์ของมันว่างครึ่งคอลัมน์และกินความกว้างที่รางต้องการ */}
              <thead><tr>
                <th>เอกสาร / ความคืบหน้า</th><th>ลูกค้า</th>
                <th className="num">Actual ก่อน VAT</th><th className="num">งวดชำระ · กำหนด</th>
                {serviceView && <th>สัญญา</th>}
                {serviceView && <th className="num">จ่ายถึง</th>}
                {serviceView && <th className="num">รอบที่เดิน</th>}
              </tr></thead>
              <tbody>
                {/* โหมดจัดกลุ่ม: หัวกลุ่มเต็มแถว แถวใบข้างในเป็น `orderRow` ตัวเดียว
                    กับโหมดปกติ — ห้ามก๊อปสองสำเนา (AGENTS.md) */}
                {buckets ? buckets.map((bucket) => {
                  const bucketCollapsed = collapsed.has(bucket.key);
                  return (
                    <Fragment key={bucket.key}>
                      <TableGroupRow
                        colSpan={columnCount}
                        label={bucket.label}
                        sub={bucket.sub}
                        badge={`${bucket.count} ใบ`}
                        total={fmtMoney(bucket.total)}
                        totalTitle="Actual รวมของกลุ่ม (นับเฉพาะใบที่อนุมัติแล้ว)"
                        collapsed={bucketCollapsed}
                        onToggle={() => toggleBucket(bucket.key)}
                      />
                      {!bucketCollapsed && bucket.items.map(orderRow)}
                    </Fragment>
                  );
                }) : pageRows.map(orderRow)}
                {!filtered.length && !loading && (
                  <TableEmpty
                    colSpan={columnCount}
                    title={serviceView ? "ยังไม่มีใบสั่งขายสายบริการ" : "ยังไม่มีใบสั่งขาย"}
                    description={serviceView
                      ? "ใบจะขึ้นที่นี่เมื่อดีล/โครงการต้นทางเป็นสายบริการ"
                      : "เปิด QT ที่ Won แล้วกดสร้าง SO เพื่อตรวจสอบและยื่นอนุมัติ"}
                  />
                )}
              </tbody>
            </table>
          </TableScroll>
          {/* โหมดจัดกลุ่มไม่แบ่งหน้า — แบ่งหน้าจะหั่นกลุ่มคาหน้าแล้วยอดหัวกลุ่มไม่ตรงกับแถวที่เห็น */}
          {filtered.length > 0 && !buckets && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
      </div>
    </SaWorkspace>
  );
}


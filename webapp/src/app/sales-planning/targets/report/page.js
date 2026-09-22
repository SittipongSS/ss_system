"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChartColumn, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Download, PencilLine, Search,
} from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import Segmented from "@/components/ui/Segmented";
import SkeletonRows, { Skeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import Pager from "@/components/ui/Pager";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Tooltip from "@/components/ui/Tooltip";
import DayRangePicker from "@/components/ui/DayRangePicker";
import { MonthPicker, businessLineBadge, dealTypeBadge } from "@/components/salesPlanning/ui";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { salesTeamLabel, useSalesTeams } from "@/lib/master/salesTeamRegistry";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import useStickyState from "@/lib/ui/useStickyState";
import { usePagination } from "@/lib/usePagination";
import { useCan, useRole } from "@/lib/roleContext";
import { apiFetch } from "@/lib/apiFetch";
import { historyYearOptions } from "@/lib/sales/historyEntry";
import { NO_TEAM_LABEL } from "@/lib/sales/personSlice";
import { BUSINESS_LINES, businessLineLabel } from "@/lib/master/businessLines";
import { DEAL_TYPES } from "@/lib/salesPlanning";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";
import {
  FINANCE_STATE_BADGE,
  FINANCE_STATE_OPTIONS,
  NONE_VALUE,
  ORDER_GROUP_OPTIONS,
  ORDER_KIND_OPTIONS,
  ORDER_SORT_DEFAULT,
  ORDER_SORT_DIR,
  ORDER_SORT_OPTIONS,
  activeFilterCount,
  drillCheck,
  filterOrders,
  financeStateOf,
  groupOrders,
  ordersForDrill,
  sortOrders,
} from "@/lib/sales/reportOrderView";
import {
  MAX_RANGE_DAYS,
  defaultDayRange,
  parseReportPeriod,
  reportPeriodLabel,
  reportPeriodQuery,
} from "@/lib/sales/reportPeriod";
import { businessDayKey, currentMonth, daysInRange, formatMonthLabel } from "@/lib/datePeriods";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent, NA } from "@/lib/format";
import styles from "./page.module.css";

/* รายงานยอดขาย — เป้าเทียบยอดจริงตามงวด แล้วไล่ลงถึงใบสั่งขาย
 *
 * ⭐ **หน้าของตัวเอง ไม่ใช่ส่วนขยายของแท็บผลงานขาย** (มติผู้ใช้ 2026-08-26)
 * 🔒 `salesplan:target` เท่านั้น (หัวหน้าฝ่ายขาย + admin) เพราะกางยอดรายคนทั้งฝ่ายในหน้าเดียว
 *
 * ⭐ รื้อรอบ 2026-09-22 (มติผู้ใช้ "จัด layout ใหม่ · ตัวเลือกช่วงแบบ KPI ลีด · โหลด Excel ได้"):
 *   - หัวหน้าถือตัวเลือกงวดทรงเดียวกับหน้าลีด: รายเดือน (เดือนเดียว / ติ๊ก "ทุกเดือน" = ทั้งปี) | ช่วงวัน
 *     กติกางวดอยู่ที่ lib/sales/reportPeriod (ช่วงวันปันเป้าตามวัน · เดือนเดียวทบยอดตั้งแต่ ม.ค.)
 *   - โซ่เดียวบนลงล่าง: แถบตัวเลข → "แยกยอด" (ตามเดือน/ทีม/คน) → ใบที่รวมเป็นยอดนั้น
 *     กดขายจริงในตาราง = กรองรายการใบให้เหลือใบของยอดนั้น แล้วบอกว่ารวมตรงกับตาราง (✓/✗)
 *   - **ตัวเลขทุกตัวมาจาก `summary` ที่ API คิดด้วย lib/sales/reportSummary** — ตัวเดียวกับไฟล์ Excel
 *     หน้านี้ไม่คิดยอดสรุปเอง (เดิมคิดใน page.js ทั้งหมด → เพิ่มไฟล์แล้วเลขจะแยกทางกันสักวัน)
 *   - รายการใบกางทันทีแบบแบ่งหน้า 10 แถว แทนด่าน "กดค้นหาก่อน" (มติ 2026-08-27 แก้ปัญหาหน้าสูง 6,000px —
 *     Pager แก้ปัญหาเดียวกันโดยไม่ต้องกดก่อนเห็น)
 *
 * ⚠️ ไทม์ไลน์ข้อมูลจริง: 2023–2025 ยอดบริษัทกรอกมือ ไม่มีเป้า · ม.ค. 2026 เป้าบริษัทเริ่ม ·
 *    ก.ค. 2026 แบ่งทีม · ส.ค. 2026 ย้ายเข้าระบบ (ยอดรายคนมาจากใบ) — ข้อความบนจออิงไทม์ไลน์นี้
 */

const LENSES = [
  { value: "month", label: "ตามเดือน" },
  { value: "team", label: "ตามทีม" },
  { value: "person", label: "ตามคน" },
];

const PERIOD_MODES = [{ value: "month", label: "รายเดือน" }, { value: "range", label: "ช่วงวัน" }];

const EMPTY_FILTERS = { owners: [], teams: [], finance: [], months: [], kinds: [], lines: [], dealTypes: [] };

/* ประเภทธุรกิจ/ประเภทดีลของดีลของใบ (มติผู้ใช้ 2026-09-22) — ป้ายกลางชุดเดียวกับหน้ารวมดีล
   ⚠️ ค่าว่างต้องเป็นขีด — `dealTypeBadge(null)` ตีเป็น NPD (normalizeDealType) จะโกหกว่าดีลเป็น NPD */
const lineCell = (line) => businessLineBadge(line, "ui-badge-cell") || NA;
const dealTypeCell = (type) => (DEAL_TYPES.includes(type) ? dealTypeBadge(type, "ui-badge-cell ui-badge-w-deal-type") : NA);

const money = (v) => fmtMoney(v);
const pctText = (v) => (v == null ? NA : fmtPercent(v));
/* สีเขียว/แดงต้องอยู่บน <span> ใน <td> — `.…scroll[data-family] td` กับ `.ui-metric strong` จำเพาะกว่าคลาสสีเดี่ยว ๆ */
const toneOf = (diff) => (diff >= 0 ? "cell-num-ok" : "cell-num-bad");

function Money({ value, tone = false }) {
  if (value == null) return NA;
  return <span className={`${styles.money} ${tone ? toneOf(value) : ""}`.trim()}>{money(value)}</span>;
}

/* ช่วงเดือนแบบอ่านง่าย "ต.ค.–ธ.ค. 2026" */
function monthSpan(months) {
  if (!months?.length) return "";
  if (months.length === 1) return formatMonthLabel(months[0]);
  const first = months[0];
  const last = months.at(-1);
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${formatMonthLabel(first, { includeYear: false })}–${formatMonthLabel(last)}`
    : `${formatMonthLabel(first)} – ${formatMonthLabel(last)}`;
}

export default function SalesReportPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();

  const now = useMemo(() => new Date(), []);
  const todayTh = businessDayKey(now.toISOString());
  const thisMonth = currentMonth(now);
  /* ขอบล่างของ MonthPicker = ปีเก่าสุดที่หน้ากรอกยอดย้อนหลังยอมให้กรอก (กติกาเดียวกัน ไม่ฝังเลขปี) */
  const minMonth = `${historyYearOptions(now).at(-1)}-01`;

  /* งวด — จำไว้เฉพาะตอนกดย้อน (useStickyState) ⇒ เปิดใบแล้วกดกลับมาเจองวดเดิม
     ค่าตั้งต้น = ทุกเดือนของปีนี้ (นิสัยเดิมของหน้านี้ "ปีนี้") */
  const [periodMode, setPeriodMode] = useStickyState("periodMode", "month");
  const [month, setMonth] = useStickyState("month", thisMonth);
  const [allMonths, setAllMonths] = useStickyState("allMonths", true);
  const [range, setRange] = useStickyState("range", defaultDayRange(todayTh));
  const [lens, setLens] = useStickyState("lens", "month");
  const [drill, setDrill] = useState(null);

  const period = useMemo(() => {
    const input = periodMode === "range"
      ? { mode: "range", from: range?.from, to: range?.to }
      : allMonths ? { mode: "year", year: String(month || thisMonth).slice(0, 4) } : { mode: "month", month };
    const parsed = parseReportPeriod(input, { today: todayTh });
    return parsed.error ? parseReportPeriod({ mode: "year", year: thisMonth.slice(0, 4) }, { today: todayTh }) : parsed;
  }, [periodMode, range?.from, range?.to, allMonths, month, thisMonth, todayTh]);
  const query = reportPeriodQuery(period);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [rangeError, setRangeError] = useState("");

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) {
      /* 🐞 ต้องล้างก่อนโหลด — เดิมโหลดพลาดแล้วตัวเลขของงวดเก่าค้างใต้หัวงวดใหม่ (ตรวจ 2026-08-28/09-22) */
      setData(null);
      setLoading(true);
    }
    if (!opts?.background) setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/report?${query}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดรายงานไม่สำเร็จ");
      const json = await res.json();
      if (!isLatest()) return; // งวดเปลี่ยนระหว่างรอ — ทิ้งคำตอบรอบเก่าทั้งก้อน
      setData(json);
      setError("");
      setStale(false);
    } catch (e) {
      if (!isLatest()) return;
      /* รอบเบื้องหลัง (กลับมามองแท็บ) พลาด = คงตัวเลขเดิมไว้แต่บอกว่าอาจไม่ใช่ล่าสุด — ทุกหน้าในระบบทำแบบนี้
         ล้างทิ้งเหมือนรอบที่ผู้ใช้สั่งเองจะลบตัวกรองที่ตั้งไว้ทั้งหมด (ตรวจ 2026-09-22) */
      if (opts?.background) { setStale(true); return; }
      setData(null);
      setError(e.message || "โหลดรายงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [query, startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);
  // เปลี่ยนงวด = ตัวกรองจากตารางแยกยอดหมดความหมาย (เดือน/เจ้าของอาจไม่มีในงวดใหม่)
  useEffect(() => { setDrill(null); }, [query]);

  const summary = data?.summary || null;
  const ordersRef = useRef(null);
  const breakdownRef = useRef(null);
  const chipRef = useRef(null);

  const openDrill = useCallback((next) => {
    setDrill(next);
    requestAnimationFrame(() => {
      ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      chipRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const switchToRange = useCallback((from, to) => {
    setPeriodMode("range");
    setRange({ from, to });
  }, [setPeriodMode, setRange]);

  if (!canTarget) {
    return (
      <Workspace icon={<ChartColumn size={22} />} title="รายงานยอดขาย" back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}>
        <StatusNotice tone="warning" title="ไม่มีสิทธิ์เปิดรายงานนี้">
          เปิดได้เฉพาะหัวหน้าฝ่ายขายและผู้ดูแลระบบ{role ? ` — บัญชีนี้เป็น ${role}` : ""}
        </StatusNotice>
      </Workspace>
    );
  }

  const periodLabel = reportPeriodLabel(period);

  return (
    <Workspace
      icon={<ChartColumn size={22} />}
      title="รายงานยอดขาย"
      subtitle="ยอดขายจริงจากใบสั่งขายที่อนุมัติแล้ว เทียบเป้า · กดยอดขายจริงในตารางเพื่อดูใบที่รวมเป็นยอดนั้น · ใบรออนุมัติแยกไว้ ไม่นับเป็นยอดขาย"
      back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}
      headerRight={(
        <>
          {/* ทรงเดียวกับหน้าลีด (มติผู้ใช้ 2026-09-22 "ปุ่มเลือกช่วงอยากได้เหมือน KPI ลีด") */}
          <Segmented ariaLabel="หน่วยของงวด" value={periodMode} onChange={setPeriodMode} options={PERIOD_MODES} />
          {periodMode === "range" ? (
            <DayRangePicker
              from={period.from}
              to={period.to}
              today={todayTh}
              markedDays={Object.keys(data?.byDay || {})}
              markedLabel="มีใบอนุมัติ"
              onChange={(next) => {
                /* เกินเพดาน = บอก แล้วคงช่วงเดิม — เดิมงวดเงียบ ๆ ตกไปเป็นทั้งปีทั้งที่ปุ่มยังเป็น "ช่วงวัน" */
                if (daysInRange(next.from, next.to).length > MAX_RANGE_DAYS) {
                  setRangeError("ช่วงวันยาวเกิน 5 ปี — เลือกให้สั้นลง (ดูยาวกว่านั้นให้ใช้ \"รายเดือน · ทุกเดือน\" ทีละปี)");
                  return;
                }
                setRangeError("");
                setRange(next);
              }}
            />
          ) : (
            <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} min={minMonth} />
          )}
          {/* ไฟล์ = ทั้งรายงานของงวด (มติผู้ใช้ "ทั้งรายงาน") · ตัวเลขจากตัวคิดเดียวกับจอ
              ⚠️ `Button as="a" download` ไม่ใช่ `<a className="btn">` (ratchet ของ audit:ui) และไม่ใช่ Link —
              Link ของ Next ยิงคำขอ RSC ไปที่ปลายทางก่อนแล้วค่อยโหลดจริง = สร้างไฟล์ทั้งรายงานสองรอบต่อคลิก */}
          <Button
            as="a"
            download
            variant="quiet"
            icon={<Download size={15} aria-hidden="true" />}
            href={`/api/sales-planning/report/export?${query}`}
            title={`ดาวน์โหลดทั้งรายงานของ ${periodLabel} — ไม่ขึ้นกับการค้นหาและตัวกรองในรายการใบ`}
          >
            ดาวน์โหลด Excel
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <StatusNotice tone="error" title="โหลดรายงานไม่สำเร็จ" action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
            {error}
          </StatusNotice>
        )}

        {rangeError && (
          <StatusNotice tone="warning" onDismiss={() => setRangeError("")}>{rangeError}</StatusNotice>
        )}
        {stale && !error && (
          <StatusNotice tone="warning" title="รีเฟรชไม่สำเร็จ — ตัวเลขบนจออาจไม่ใช่ล่าสุด" action={<Button size="sm" onClick={() => load()}>โหลดใหม่</Button>}>
            ข้อมูลที่เห็นเป็นของรอบก่อน
          </StatusNotice>
        )}

        {!error && <HeadlineStrip loading={loading} summary={summary} period={period} />}

        {!loading && summary && (
          <Notices
            summary={summary}
            period={period}
            thisMonth={thisMonth}
            todayTh={todayTh}
            onRange={switchToRange}
            onPersonLens={() => {
              setLens("person");
              requestAnimationFrame(() => breakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
          />
        )}

        <div ref={breakdownRef} className="scroll-anchor">
          <Breakdown
            loading={loading}
            error={Boolean(error)}
            lens={lens}
            onLens={setLens}
            summary={summary}
            data={data}
            period={period}
            todayTh={todayTh}
            onDrill={openDrill}
            onRange={switchToRange}
          />
        </div>

        {!loading && Number(data?.pendingApproval?.count || 0) > 0 && (
          <PendingPanel pendingApproval={data.pendingApproval} />
        )}

        <div ref={ordersRef} className="scroll-anchor">
          <OrdersPanel
            orders={data?.orders || []}
            summary={summary}
            period={period}
            loading={loading}
            error={Boolean(error)}
            drill={drill}
            onClearDrill={() => setDrill(null)}
            chipRef={chipRef}
          />
        </div>
      </div>
    </Workspace>
  );
}

/* ── แถบตัวเลขบนหัว ─────────────────────────────────────────────────────────
   ⭐ ไม่มีไอคอน (เดิมไอคอนเดียวกันสี่ใบ ไม่มีความหมาย และกินที่จนเงินเต็มหลักโดนตัด "฿81,620,000...." ที่ 390px)
   ⭐ งวดที่ยังไม่มีเดือนจบ (เดือนนี้เดือนเดียว) สลับเป็นชุด "ระหว่างเดือน" แทนที่จะขึ้นขีดทั้งแถบ */
function HeadlineStrip({ loading, summary, period }) {
  if (loading || !summary) {
    return (
      <MetricStrip aria-busy="true">
        {["ขายจริง", "เป้า", "% ทำได้", "ส่วนต่าง"].map((label) => (
          <Metric key={label} label={label} value={<Skeleton width="70%" />} note={<Skeleton width="50%" />} />
        ))}
      </MetricStrip>
    );
  }
  const m = summary.metrics;
  const range = period.mode === "range";
  const pending = m.pendingApproval ? (
    <Metric
      as="a"
      href="#sales-report-pending"
      label={<><span className="so-pending-approval-tag">{PENDING_APPROVAL_LABEL}</span> · {formatMonthLabel(m.pendingApproval.month)}</>}
      value={money(m.pendingApproval.amount)}
      note={`${m.pendingApproval.count} ใบ · ยังไม่นับ`}
      aria-label={`ดูใบสั่งขายรออนุมัติ ${m.pendingApproval.count} ใบ`}
    />
  ) : null;

  /* ทั้งปีที่ยังไม่มีเดือนจบ (ทุกเดือนของเดือน ม.ค. หรือปีอนาคต) — บอกเป็นยอดสะสม/เป้าทั้งปี
     🐞 เดิมตกไปกิ่ง "เดือนเดียว" แล้วเอาเป้าทั้งปีไปใส่ป้าย "เป้าเต็มเดือน · ถึงสิ้นเดือน" (ตรวจ 2026-09-22) */
  if (period.mode === "year" && m.countedMonths === 0 && m.open) {
    const future = m.open.months[0] > currentMonth();
    return (
      <MetricStrip>
        <Metric label="ขายจริง" value={future ? NA : money(m.open.actual)} note={future ? "ยังไม่ถึงงวดนี้" : "ถึงวันนี้ · ยังไม่มีเดือนที่จบ"} />
        <Metric label="เป้าทั้งปี" value={m.open.target ? money(m.open.target) : NA} note={m.open.target ? `${m.open.months.length} เดือน` : "ยังไม่ได้ตั้งเป้า"} />
        <Metric label="% ทำได้" value={NA} note="คิดเมื่อจบเดือนแรก" />
        <Metric label="ส่วนต่าง" value={NA} note="คิดเมื่อจบเดือนแรก" />
        {pending}
      </MetricStrip>
    );
  }

  /* เดือนเดียวที่ยังไม่จบ/ยังไม่ถึง — ไม่มีอะไรเทียบเป้าได้ ⇒ ตอบคำถาม "ยังต้องปิดอีกเท่าไร" แทน */
  const running = period.mode === "month" && m.countedMonths === 0 && m.open;
  if (running) {
    const row = summary.monthRows.find((r) => r.month === m.open.months[0]) || null;
    const future = m.open.months[0] > currentMonth();
    const mustClose = summary.monthRows.filter((r) => !r.closed).reduce((s, r) => s + r.mustClose, 0);
    const left = Math.max(0, mustClose - m.open.actual);
    return (
      <MetricStrip>
        <Metric label="ขายจริง" value={future ? NA : money(m.open.actual)} note={future ? "ยังไม่ถึงงวดนี้" : "ยังไม่จบเดือน"} />
        <Metric
          label={row && row.carry > 0 ? "ต้องปิดทั้งเดือน" : "เป้า"}
          value={mustClose ? money(mustClose) : NA}
          note={row && row.carry > 0 ? "เป้า + ทบยกมา" : (mustClose ? "เป้าเต็มเดือน" : "ยังไม่ได้ตั้งเป้า")}
        />
        <Metric label="% ทำได้" value={NA} note="คิดเมื่อจบเดือน" />
        <Metric label="ต้องปิดอีก" value={mustClose ? money(left) : NA} note={left > 0 ? "ถึงสิ้นเดือน" : (mustClose ? "ปิดครบแล้ว" : "ไม่มีเป้าให้เทียบ")} />
        {pending}
      </MetricStrip>
    );
  }

  const hasTarget = m.target > 0;
  /* ป้ายต้องพูดตรงกับสิ่งที่อยู่ในผลรวม (ตรวจ 2026-09-22) — "ปัน 22/30 วัน" ใช้ได้เฉพาะตอนเป้าทั้งก้อนมาจากเดือนเดียวที่ปัน
     เป้า 0 เพราะเดือนกรอกมือถูกตัด ≠ "ยังไม่ได้ตั้งเป้า" */
  const basis = m.targetBasis || { state: hasTarget ? "set" : "none", months: m.targetMonths, prorated: 0, full: m.targetMonths };
  const prorated = range ? summary.monthRows.filter((r) => r.prorated && r.target > 0) : [];
  const targetNote = basis.state === "excluded" ? "ไม่เทียบ · ยอดกรอกรายเดือน"
    : basis.state === "notYet" ? "ยังไม่ถึงวันที่นับเป้า"
      : !hasTarget ? "ยังไม่ได้ตั้งเป้า"
        : !range ? `ตั้งเป้าไว้ ${m.targetMonths} เดือน`
          : basis.full === 0 && prorated.length === 1 ? `ปัน ${prorated[0].prorated.days}/${prorated[0].prorated.total} วัน`
            : basis.prorated === 0 ? `เต็มเดือน ${basis.full} เดือน`
              : `เต็มเดือน ${basis.full} + ปันตามวัน ${basis.prorated} เดือน`;
  const noCompare = basis.state === "excluded" ? "ไม่เทียบ · ยอดกรอกรายเดือน"
    : basis.state === "notYet" ? "ยังไม่ถึงวันที่นับเป้า" : "ไม่มีเป้าให้เทียบ";
  const historyMonths = summary.sourceSplit?.history?.months || 0;
  return (
    <MetricStrip>
      <Metric
        label="ขายจริง"
        value={money(m.actual)}
        note={range
          ? (historyMonths ? `รวมยอดกรอกย้อนหลัง ${historyMonths} เดือน` : "อนุมัติในช่วงนี้")
          : `${m.countedMonths} เดือนที่จบแล้ว`}
      />
      <Metric
        label={range ? (
          <>
            <Tooltip label="เป้าปันตามวัน" note={`เป้าเดือน × วันที่นับ ÷ วันทั้งเดือน · นับถึงวันนี้ (${fmtDate(period.today)}) · วันหลังจากนี้ยังไม่นับเป้า`}>
              <span className={styles.tipLabel} aria-hidden="true">เป้าปันตามวัน ⓘ</span>
            </Tooltip>
            {/* คำอธิบายสูตรสำหรับโปรแกรมอ่านหน้าจอ — กล่อง tooltip เป็น aria-hidden และป้ายนี้ไม่ใช่จุดโฟกัส */}
            <span className="sr-only">เป้าปันตามวัน: เป้าเดือน คูณวันที่นับ หารวันทั้งเดือน นับถึงวันนี้</span>
          </>
        ) : "เป้า"}
        value={hasTarget ? money(m.target) : NA}
        note={targetNote}
      />
      <Metric
        label="% ทำได้"
        value={pctText(m.pct)}
        tone={m.pct == null ? undefined : (m.pct >= 100 ? "success" : "danger")}
        note={m.pct == null ? noCompare : (m.pct >= 100 ? "ถึงเป้า" : "ต่ำกว่าเป้า")}
      />
      <Metric
        label="ส่วนต่าง"
        value={m.diff == null ? NA : <span className={toneOf(m.diff)}>{money(m.diff)}</span>}
        note={m.diff == null ? noCompare : (range ? "เทียบเป้าปันตามวัน" : `เทียบเป้า ${m.targetMonths} เดือนนั้น`)}
      />
      {pending}
    </MetricStrip>
  );
}

/* ── ข้อความกำกับข้อมูล (แทน .alert-banner ที่ไม่มี CSS แล้ว) ── วางติดเหนือตัวเลขที่มันกำกับ */
function Notices({ summary, period, thisMonth, todayTh, onRange, onPersonLens }) {
  const notes = [];
  const m = summary.metrics;
  const rec = summary.reconciliation;

  if (period.mode === "month" && period.month === thisMonth) {
    notes.push(
      <StatusNotice
        key="running"
        tone="info"
        title={`${formatMonthLabel(thisMonth)} ยังไม่จบเดือน`}
        action={<Button size="sm" variant="quiet" onClick={() => onRange(`${thisMonth}-01`, todayTh)}>เทียบเป้าปันตามวันถึงวันนี้</Button>}
      >
        ยอดถึงวันนี้ยังไม่เทียบเป้าเต็มเดือน — % และส่วนต่างคิดเมื่อจบเดือน
      </StatusNotice>,
    );
  }
  if (period.mode === "month" && period.month > thisMonth) {
    notes.push(<StatusNotice key="future" tone="neutral">ยังไม่ถึงงวดนี้ — มีแต่เป้า ยังไม่มียอดขาย</StatusNotice>);
  }
  if (rec.mismatch) {
    const bad = rec.byMonth.filter((r) => r.mismatch);
    const ok = rec.byMonth.length - bad.length;
    const fromHistory = bad.some((r) => r.source === "history");
    notes.push(
      <StatusNotice
        key="reconcile"
        tone="warning"
        title="ยอดบริษัทไม่ตรงกับผลรวมรายคน — ยังไม่ควรใช้คิดคอมมิชชั่น"
        action={(
          <span className={styles.noticeActions}>
            <Button size="sm" onClick={onPersonLens}>ดูตามคน</Button>
            {fromHistory && <Button as={Link} size="sm" variant="quiet" href="/sa/targets/history">ไปแก้ที่ยอดขายย้อนหลัง</Button>}
          </span>
        )}
      >
        <span className={styles.noticeLines}>
          {bad.map((r) => (
            <span key={r.month}>
              {formatMonthLabel(r.month)} · บริษัท <Money value={r.company} /> · รวมรายคน <Money value={r.people} />
              {" "}· ต่าง <Money value={Math.abs(r.gap)} /> · ที่มา: {r.source === "history" ? "กรอกย้อนหลัง" : "ใบสั่งขาย"}
              {r.ownerless.count > 0 && <> · ใบไม่มีเจ้าของ {r.ownerless.count} ใบ <Money value={r.ownerless.amount} /></>}
            </span>
          ))}
          {ok > 0 && <span>เดือนอื่นที่แยกยอดรายคนตรงกันแล้ว</span>}
        </span>
      </StatusNotice>,
    );
  }
  if (summary.historyDropped?.length) {
    notes.push(
      <StatusNotice key="dropped" tone="info" title={`ช่วงนี้คลุม ${summary.historyDropped.map((x) => formatMonthLabel(x)).join(", ")} ไม่เต็มเดือน`}>
        ยอดของเดือนนั้นกรอกย้อนหลังเป็นรายเดือน แยกรายวันไม่ได้ — เดือนนั้นนับเฉพาะใบสั่งขายที่อนุมัติในช่วง และไม่เทียบเป้า
      </StatusNotice>,
    );
  }
  if (!notes.length || !m) return null;
  return <>{notes}</>;
}

/* ── แยกยอด ── การ์ดเดียว สลับมุมมองในหัวการ์ด (ตัวคุมอยู่ติดกับของที่มันคุม · มติ 2026-08-27) */
function Breakdown({ loading, error, lens, onLens, summary, data, period, todayTh, onDrill, onRange }) {
  const range = period.mode === "range";
  const scope = !summary ? null
    : lens === "month"
      ? (range
        ? `${reportPeriodLabel(period)} · เป้าปันตามวัน`
        : period.mode === "month"
          ? `${formatMonthLabel(period.month)} · ทบยอดนับตั้งแต่ ม.ค.`
          : `${monthSpan(summary.months)} · จบแล้ว ${summary.countedMonths.length} เดือน`)
      : (range
        ? `${reportPeriodLabel(period)} · เป้าปันตามวัน · ทีมตามดีล`
        : summary.splitMonths.length
          ? `คิดเฉพาะ ${summary.splitMonths.length} เดือนที่จบแล้วและแยกยอดรายคน (${monthSpan(summary.splitMonths)}) · ทีมตามดีล`
          : "ทีมตามดีล");
  return (
    <WorkspaceSection
      id="sales-report-breakdown"
      icon={<ChartColumn size={17} aria-hidden="true" />}
      title="แยกยอด"
      subtitle={loading ? null : scope}
      actions={<Segmented ariaLabel="มุมมองแยกยอด" options={LENSES} value={lens} onChange={onLens} />}
    >
      {loading ? <SkeletonRows rows={6} /> : error || !summary ? (
        <EmptyState plain>
          <strong>ยังไม่มีข้อมูลของงวดนี้ — โหลดรายงานไม่สำเร็จ</strong>
        </EmptyState>
      ) : lens === "month" ? (
        <MonthLens summary={summary} period={period} onDrill={onDrill} />
      ) : (
        <GroupLens
          kind={lens}
          summary={summary}
          orders={data?.orders || []}
          period={period}
          todayTh={todayTh}
          onDrill={onDrill}
          onRange={onRange}
        />
      )}
    </WorkspaceSection>
  );
}

/* ── ตามเดือน ─────────────────────────────────────────────────────────── */
function MonthLens({ summary, period, onDrill }) {
  const range = period.mode === "range";
  const [futureOpen, setFutureOpen] = useState(false);
  const thisMonth = currentMonth();
  const rows = summary.monthRows;
  /* พับเดือนอนาคตเฉพาะโหมดทั้งปี — เดือนเดียวที่ยังไม่ถึงต้องเห็นแถวของมันเลย ไม่ใช่แถวพับแถวเดียว */
  const foldFuture = period.mode === "year";
  const past = rows.filter((r) => !foldFuture || r.month <= thisMonth);
  const future = foldFuture ? rows.filter((r) => r.month > thisMonth) : [];
  const m = summary.metrics;
  const mismatch = new Set(summary.reconciliation.byMonth.filter((r) => r.mismatch).map((r) => r.month));
  const cols = range ? 6 : 8;
  const split = summary.sourceSplit;
  const totalOrders = rows.filter((r) => r.closed && r.source === "orders").reduce((s, r) => s + r.orderCount, 0);
  const [howOpen, setHowOpen] = useState(false);

  const actualCell = (r) => {
    const drillable = r.source === "orders" && r.orderCount > 0;
    const value = <Money value={r.actual} />;
    return (
      <>
        {drillable ? (
          <button
            type="button"
            className="table-metric-button"
            aria-label={`ดูใบสั่งขายที่รวมเป็นยอด ${formatMonthLabel(r.month)} ${money(r.actual)}`}
            onClick={() => onDrill({ kind: "month", month: r.month, label: formatMonthLabel(r.month), expected: r.actual, historyMonths: [] })}
          >{value}</button>
        ) : value}
        {r.pending && <PendingApprovalAmount amount={r.pending.amount} count={r.pending.count} />}
      </>
    );
  };

  const monthRow = (r) => {
    const running = !range && !r.closed && r.month === thisMonth;
    const left = running && r.mustClose > r.actual ? r.mustClose - r.actual : 0;
    return (
      <tr key={r.month}>
        <td>
          {formatMonthLabel(r.month)}
          {running && <span className="cell-sub">ยังไม่จบ · ถึง {fmtDate(period.today)}</span>}
          {r.prorated && <span className="cell-sub">ปัน {r.prorated.days}/{r.prorated.total} วัน</span>}
          {mismatch.has(r.month) && <span className={`cell-sub ${styles.warnSub}`}>⚠ ไม่ตรงรายคน</span>}
        </td>
        <td className="num">{actualCell(r)}</td>
        <td className="num">{pctText(r.pct)}</td>
        <td className="num"><Money value={r.diff} tone /></td>
        {!range && (
          <td className="num">
            {r.mustClose ? <Money value={r.mustClose} /> : NA}
            {left > 0 && <span className="cell-sub">ต้องปิดอีก <Money value={left} /></span>}
          </td>
        )}
        <td className="num">
          {r.noDaily ? NA : (r.target ? <Money value={r.target} /> : NA)}
          {range && r.noDaily && <span className="cell-sub">ไม่เทียบเป้า · ยอดกรอกรายเดือน</span>}
          {range && !r.noDaily && r.prorated && r.fullTarget ? <span className="cell-sub">เต็มเดือน <Money value={r.fullTarget} /></span> : null}
        </td>
        {!range && <td className="num">{r.carry ? <Money value={r.carry} /> : NA}</td>}
        <td>
          {r.source === "history" ? (
            <span className={styles.source}><PencilLine size={13} aria-hidden="true" /> กรอกย้อนหลัง</span>
          ) : r.source === "orders" ? (
            <span className={styles.source}><ClipboardList size={13} aria-hidden="true" /> ใบสั่งขาย {r.orderCount} ใบ</span>
          ) : NA}
          {r.overridden && <span className="cell-sub">มีใบ {r.overridden.count} ใบที่ไม่นับ</span>}
        </td>
      </tr>
    );
  };

  return (
    <>
      <TableScroll surface="embedded" family="list" cells="stacked">
        <table>
          <thead>
            <tr>
              <th>{range ? "เดือน" : "งวด"}</th>
              <th className="num">ขายจริง</th>
              <th className="num">% ทำได้{!range && <span className="cell-sub">เทียบต้องปิด</span>}</th>
              <th className="num">ส่วนต่าง{!range && <span className="cell-sub">เทียบต้องปิด</span>}</th>
              {!range && <th className="num">ต้องปิด</th>}
              <th className="num">{range ? "เป้าปันตามวัน" : "เป้า"}</th>
              {!range && <th className="num">ทบยกมา</th>}
              <th>ที่มาของยอด</th>
            </tr>
          </thead>
          <tbody>
            {past.map(monthRow)}
          </tbody>
          {future.length > 0 && (
            <tbody>
              <TableGroupRow
                colSpan={cols}
                label="ยังไม่ถึงงวด"
                sub={monthSpan(future.map((r) => r.month))}
                badge={`${future.length} เดือน`}
                total={`เป้า ${money(future.reduce((s, r) => s + r.target, 0))}`}
                collapsed={!futureOpen}
                onToggle={() => setFutureOpen((v) => !v)}
              />
              {futureOpen && future.map((r) => (
                <tr key={r.month}>
                  <td>{formatMonthLabel(r.month)}</td>
                  <td className="num">{NA}</td>
                  <td className="num">{NA}</td>
                  <td className="num">{NA}</td>
                  <td className="num">{r.mustClose ? <Money value={r.mustClose} /> : NA}</td>
                  <td className="num">{r.target ? <Money value={r.target} /> : NA}</td>
                  <td className="num">{r.carry ? <Money value={r.carry} /> : NA}</td>
                  <td>{NA}</td>
                </tr>
              ))}
            </tbody>
          )}
          {summary.countedMonths.length > 0 && (
            <tfoot>
              <tr>
                <td>
                  {range ? "รวมช่วงที่เลือก" : `รวม ${summary.countedMonths.length} เดือนที่จบ`}
                  {!range && <span className="cell-sub">เทียบเป้า ไม่รวมทบ</span>}
                </td>
                <td className="num">
                  {totalOrders > 0 ? (
                    <button
                      type="button"
                      className="table-metric-button"
                      aria-label={`ดูใบสั่งขายทั้งหมดที่รวมเป็นยอด ${money(m.actual)}`}
                      onClick={() => onDrill({
                        kind: "total",
                        /* เดือนที่ยอดมาจากการกรอกมือไม่มีใบให้ไล่ — ใบที่อนุมัติในเดือนนั้นถูกยอดกรอกทับ ไม่อยู่ในขายจริง
                           ⇒ เจาะเฉพาะเดือนที่ยอดมาจากใบ ไม่งั้นรวมใบเกินยอด แล้วโทษ "ไม่มีใบ" ผิดตัว (ตรวจ 2026-09-22) */
                        months: rows.filter((r) => r.closed && r.source === "orders").map((r) => r.month),
                        label: range ? "รวมช่วงที่เลือก" : `รวม ${summary.countedMonths.length} เดือนที่จบ`,
                        expected: m.actual,
                        historyMonths: rows.filter((r) => r.closed && r.source === "history").map((r) => r.month),
                      })}
                    ><Money value={m.actual} /></button>
                  ) : <Money value={m.actual} />}
                </td>
                <td className="num">{pctText(m.pct)}</td>
                <td className="num"><Money value={m.diff} tone /></td>
                {!range && <td className="num">{NA}</td>}
                <td className="num">{m.target ? <Money value={m.target} /> : NA}</td>
                {!range && <td className="num">{NA}</td>}
                <td>{totalOrders > 0 ? <span className={styles.source}><ClipboardList size={13} aria-hidden="true" /> ใบสั่งขาย {totalOrders} ใบ</span> : NA}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
      <div className={styles.footNote}>
        {summary.countedMonths.length > 0 && (
          <p>
            ขายจริง{range ? "" : ` ${summary.countedMonths.length} เดือน`} <Money value={m.actual} /> =
            {split.history.months > 0 && <> กรอกย้อนหลัง {split.history.months} เดือน <Money value={split.history.amount} /></>}
            {split.history.months > 0 && split.orders.months > 0 && " +"}
            {split.orders.months > 0 && <> ใบสั่งขาย {split.orders.months} เดือน <Money value={split.orders.amount} /></>}
            {!split.history.months && !split.orders.months && " —"}
          </p>
        )}
        {!range && !summary.anyCarry && summary.countedMonths.length > 0 && m.target > 0 && (
          <p>ไม่มียอดทบ — ขายสะสมตั้งแต่ ม.ค. ถึงเดือนก่อนหน้ายังไม่ต่ำกว่าเป้าสะสม</p>
        )}
        {range && <p>ช่วงวันไม่มีทบยอด (ทบยอดเป็นของรายเดือน)</p>}
        <p>
          ข้อมูล ณ {fmtDateTime(summary.generatedAt || new Date().toISOString())} น. ·{" "}
          <button type="button" className={`text-action ${styles.howToggle}`} aria-expanded={howOpen} onClick={() => setHowOpen((v) => !v)}>
            วิธีนับ {howOpen ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>
        </p>
        {howOpen && (
          <ul className={styles.howList}>
            {!range && <li>ทบยอดที่ขาดเข้างวดถัดไปและรีเซ็ตทุกต้นปี</li>}
            {!range && <li>% และส่วนต่างรายเดือนเทียบต้องปิด (เป้า + ทบยกมา) · แถวรวมและแถบบนสุดเทียบเป้าไม่รวมทบ</li>}
            {!range && <li>เดือนที่ยังไม่จบไม่คิด % และไม่เข้าผลรวม</li>}
            {range && <li>เป้าเดือน × วันที่ช่วงคลุมถึงวันนี้ ÷ วันทั้งเดือน — วันหลังจากวันนี้ยังไม่นับเป้า</li>}
            <li>เดือนที่ไม่ได้ตั้งเป้าเป็นขีด ไม่ใช่ 0%</li>
            <li>ใบรออนุมัติไม่นับในขายจริง ทบยอด ส่วนต่าง และ %</li>
            <li>ยอด = ยอดหน้าใบ − VAT ท้ายใบ · งวดคิดจากวันที่อนุมัติตามเวลาไทย</li>
          </ul>
        )}
      </div>
    </>
  );
}

/* ── ตามทีม / ตามคน ───────────────────────────────────────────────────── */
function GroupLens({ kind, summary, orders, period, todayTh, onDrill, onRange }) {
  const teamRegistry = useSalesTeams();
  const range = period.mode === "range";
  const group = kind === "team" ? summary.teams : summary.people;
  const label = kind === "team" ? "ทีม" : "คน";
  const teamName = (team) => (team ? salesTeamLabel(teamRegistry, team) : NO_TEAM_LABEL);
  const months = summary.splitMonths;
  const historyMonths = summary.monthRows.filter((r) => r.source === "history" && months.includes(r.month)).map((r) => r.month);
  const pendingCount = Number(summary.metrics.pendingApproval?.count || 0);

  if (!months.length || (!group.rows.length && !group.pendingOnly.length)) {
    /* เหตุผลต้องตรงกับงวดที่ดูอยู่ (ตรวจ 2026-09-22) — เดิมขึ้น "แบ่งทีม ก.ค. 2026" กับทุกงวด รวมเดือนนี้ที่แค่ยังไม่จบ */
    const thisMonth = currentMonth();
    const runningOnly = period.mode === "month" && period.month === thisMonth;
    const futureOnly = period.mode !== "range" && summary.months.every((mo) => mo > thisMonth);
    const beforeSplit = summary.months.every((mo) => mo < "2026-07");
    return (
      <EmptyState plain>
        <strong>ยังไม่มีเดือนที่แยกยอดราย{label}ในงวดนี้</strong>
        {runningOnly && <small>เดือนนี้ยังไม่จบ จึงยังไม่นับ — ดูแบบเทียบเป้าปันตามวันถึงวันนี้ได้</small>}
        {futureOnly && <small>ยังไม่ถึงงวดนี้</small>}
        {beforeSplit && !futureOnly && <small>ฝ่ายขายแบ่งทีม ก.ค. 2026 และย้ายเข้าระบบ ส.ค. 2026 — ก่อนหน้านั้นยอดอยู่ระดับบริษัทอย่างเดียว</small>}
        {!runningOnly && !futureOnly && !beforeSplit && <small>งวดนี้ยังไม่มียอดที่ลงรายคน</small>}
        {pendingCount > 0 && <small>ใบรออนุมัติ {pendingCount} ใบ ดูราย{label}ได้ที่ “ใบสั่งขาย{PENDING_APPROVAL_LABEL}” ด้านล่าง</small>}
        {runningOnly && (
          <span className={styles.emptyAction}>
            <Button size="sm" variant="quiet" onClick={() => onRange(`${period.month}-01`, todayTh)}>เทียบเป้าปันตามวันถึงวันนี้</Button>
          </span>
        )}
      </EmptyState>
    );
  }

  /* เดือนที่แถวนี้ใช้ยอดกรอกมือ ใบของแถวในเดือนนั้นถูกทับ ⇒ เจาะเฉพาะเดือนที่ยอดมาจากใบ */
  const drillOf = (row) => {
    const rowHistory = row.historyMonths || [];
    const base = { months: months.filter((mo) => !rowHistory.includes(mo)), expected: row.actual, historyMonths: rowHistory.length ? rowHistory : historyMonths };
    return kind === "team"
      ? { ...base, kind: "team", team: row.team || null, label: `ทีม ${teamName(row.team)}` }
      : { ...base, kind: "person", ownerId: row.ownerId, team: row.team || null, label: `${row.ownerName || row.ownerId} · ${teamName(row.team)}` };
  };
  const orderCountOf = (row) => ordersForDrill(orders, drillOf(row)).length;
  const orderSumOf = (row) => ordersForDrill(orders, drillOf(row)).reduce((s, o) => s + Number(o.amount || 0), 0);

  const t = group.total;
  const unassigned = summary.reconciliation.company - t.actual;
  const targetHead = range ? (
    <>
      <Tooltip label="เป้าปันตามวัน" note="เป้าเดือนของแถวนั้น × วันที่นับ ÷ วันทั้งเดือน · นับถึงวันนี้">
        <span className={styles.tipLabel} aria-hidden="true">เป้าปันตามวัน ⓘ</span>
      </Tooltip>
      <span className="sr-only">เป้าปันตามวัน</span>
    </>
  ) : "เป้า";

  return (
    <>
      <TableScroll surface="embedded" family="list" cells="stacked">
        <table>
          <thead>
            <tr>
              <th>{kind === "team" ? "ทีม" : "ผู้รับผิดชอบ"}</th>
              <th className="num">ขายจริง</th>
              <th className="num">% ทำได้</th>
              <th className="num">ส่วนต่าง</th>
              <th className="num">{targetHead}</th>
              <th className="num">ใบ</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => {
              const count = orderCountOf(row);
              const manual = row.actual - orderSumOf(row);
              return (
                <tr key={row.key}>
                  <td>
                    {kind === "team" ? teamName(row.team) : (row.ownerName || row.ownerId)}
                    {kind === "person" && <span className="cell-sub">{teamName(row.team)}</span>}
                  </td>
                  <td className="num">
                    {count > 0 ? (
                      <button
                        type="button"
                        className="table-metric-button"
                        aria-label={`ดูใบสั่งขาย ${count} ใบของ${kind === "team" ? `ทีม ${teamName(row.team)}` : ` ${row.ownerName || ""}`}`}
                        onClick={() => onDrill(drillOf(row))}
                      ><Money value={row.actual} /></button>
                    ) : <Money value={row.actual} />}
                    {row.pending && <PendingApprovalAmount amount={row.pending.amount} count={row.pending.count} />}
                  </td>
                  <td className="num">
                    {pctText(row.pct)}
                  </td>
                  <td className="num"><Money value={row.diff} tone /></td>
                  <td className="num">
                    {row.target ? <Money value={row.target} /> : NA}
                    {row.target > 0 && row.targetMonths < months.length && (
                      <span className="cell-sub">มีเป้า {row.targetMonths}/{months.length} เดือน</span>
                    )}
                  </td>
                  <td className="num">
                    {count ? `${count} ใบ` : NA}
                    {manual > 1 && <span className="cell-sub">+ กรอกย้อนหลัง <Money value={manual} /></span>}
                  </td>
                </tr>
              );
            })}
            {group.pendingOnly.map((row) => (
              <tr key={row.key}>
                <td>
                  {kind === "team" ? teamName(row.team) : (row.ownerName || row.ownerId)}
                  {kind === "person" && <span className="cell-sub">{teamName(row.team)}</span>}
                </td>
                <td className="num">{NA}<PendingApprovalAmount amount={row.pending.amount} count={row.pending.count} /></td>
                <td className="num">{NA}</td>
                <td className="num">{NA}</td>
                <td className="num">{NA}</td>
                <td className="num">{NA}</td>
              </tr>
            ))}
          </tbody>
          {/* แถวรวม + กระทบยอดกับบริษัท — คนอ่านต้องกระทบกับหัวรายงานได้ทันทีในที่ประชุม */}
          <tfoot>
            <tr>
              <td>รวม {t.count} {label}</td>
              <td className="num">
                <Money value={t.actual} />
                <PendingApprovalAmount amount={t.pendingAmount} count={t.pendingCount} />
              </td>
              <td className="num">{pctText(t.pct)}</td>
              <td className="num"><Money value={t.diff} tone /></td>
              <td className="num">{t.target ? <Money value={t.target} /> : NA}</td>
              <td className="num">{NA}</td>
            </tr>
            <tr>
              <td>ยอดบริษัท (เดือนเดียวกัน)</td>
              <td className="num"><Money value={summary.reconciliation.company} /></td>
              <td colSpan={4} />
            </tr>
            <tr>
              <td>ยังไม่ลง{label}</td>
              <td className="num">
                {Math.abs(unassigned) > 1
                  ? <span className="cell-num-bad"><Money value={unassigned} /></span>
                  : <span className="cell-num-ok">ตรงกัน</span>}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      <div className={styles.footNote}>
        <p>
          คิดเฉพาะเดือนที่แยกยอดรายคนจริง · % และส่วนต่างเทียบเฉพาะเดือนที่แถวนั้นมีเป้า ·
          {" "}แยกทีมตามทีมของดีล ไม่ใช่ทีมปัจจุบันของคน (ย้ายทีมแล้วยอดเดิมอยู่ทีมเดิม)
          {group.hasNoTeamRow && <> · <b>{NO_TEAM_LABEL}</b> = ดีลไม่ระบุทีม</>}
        </p>
        {kind === "team" && <p>เป้ารายทีมตั้งแยกจากเป้ารายคนและเป้าบริษัท — ผลรวมของสามระดับจึงไม่จำเป็นต้องเท่ากัน</p>}
        {group.pendingOutside.count > 0 && (
          <p>อีก {group.pendingOutside.count} ใบรออนุมัติ <Money value={group.pendingOutside.amount} /> ดีลไม่มีเจ้าของ จึงนับเฉพาะในยอดบริษัท</p>
        )}
      </div>
    </>
  );
}

/* ── ใบสั่งขายรออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) ─────────────────────
   แผงแยกจาก "ใบที่อนุมัติแล้ว" โดยตั้งใจ — ใบที่นับแล้วกับใบที่ยังไม่นับต้องไม่อยู่ในรายการเดียวกัน
   ผู้รับผิดชอบ = เจ้าของดีลปัจจุบัน (ใบยังไม่ถูกแช่เจ้าของจนกว่าจะอนุมัติ) · ทีม = ทีมของดีล */
function PendingPanel({ pendingApproval }) {
  const teamRegistry = useSalesTeams();
  const orders = pendingApproval?.orders || [];
  return (
    <ListPanel
      id="sales-report-pending"
      icon={<ClipboardList size={17} aria-hidden="true" />}
      title={`ใบสั่งขาย${PENDING_APPROVAL_LABEL}`}
      subtitle="ยังไม่นับเป็นขายจริง · อนุมัติแล้วยอดลงเดือนที่อนุมัติ"
      count={`${pendingApproval.count} ใบ`}
    >
      <TableScroll surface="embedded" family="list" cells="stacked">
        <table>
          <thead>
            <tr>
              <th>ใบสั่งขาย</th>
              <th className="num">ยอดก่อน VAT</th>
              <th>ลูกค้า</th>
              <th>ผู้รับผิดชอบ</th>
              <th>ประเภทธุรกิจ</th>
              <th>ประเภทดีล</th>
              <th className="num">ยื่นเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link className={`table-row-link ${styles.docNo}`} href={`/sa/sales-orders/${o.id}`}>{o.orderNumber}</Link>
                  {o.quoteNumber && <span className={`cell-sub ${styles.docNo}`}>{o.quoteNumber}</span>}
                </td>
                <td className="num"><Money value={o.amount} /></td>
                <td>{o.customerName || NA}</td>
                <td>
                  {o.ownerName || NA}
                  <span className="cell-sub">{o.team ? salesTeamLabel(teamRegistry, o.team) : (o.ownerId ? NO_TEAM_LABEL : NA)}</span>
                </td>
                <td>{lineCell(o.line)}</td>
                <td>{dealTypeCell(o.dealType)}</td>
                <td className="num">{o.submittedAt ? fmtDate(o.submittedAt) : NA}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>รวม {pendingApproval.count} ใบ</td>
              <td className="num"><Money value={pendingApproval.amount} /></td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </TableScroll>
    </ListPanel>
  );
}

/* ── ใบสั่งขายที่อนุมัติแล้ว ─────────────────────────────────────────────
   ⭐ กางทันที แบ่งหน้า 10 แถว (แทนด่าน "กดค้นหาก่อน" ของ 2026-08-27) · ค้นหา/กรองมีผลทันที
   ⚠️ ใบทั้งงวดมากับ response อยู่แล้ว การกรองจึงทำในหน้า — ตัวเลขตรงกับสรุปด้านบนเสมอเพราะมาจากก้อนเดียวกัน
   ⭐ กดขายจริงในตาราง "แยกยอด" = ชิป "จากแยกยอด: …" + บรรทัดเทียบยอด ✓/✗ */
function OrdersPanel({ orders, summary, period, loading, error, drill, onClearDrill, chipRef }) {
  const teamRegistry = useSalesTeams();
  const [q, setQ] = useStickyState("q", "");
  const [filters, setFilters] = useStickyState("filters", EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [sortKey, setSortKey] = useStickyState("sortKey", ORDER_SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", ORDER_SORT_DIR[ORDER_SORT_DEFAULT]);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const teamLabels = useMemo(() => Object.fromEntries((teamRegistry || []).map((t) => [t.code, t.name])), [teamRegistry]);
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const setFilter = (key, value) => setFilters((prev) => ({ ...EMPTY_FILTERS, ...(prev || {}), [key]: value }));

  // ตัวเลือกมาจากใบของงวดนี้ — เลือกค้างของงวดก่อนที่ไม่มีแล้วถูกตัดทิ้ง (ไม่งั้นกรองว่างโดยไม่รู้ตัว)
  const ownerOptions = useMemo(() => {
    const seen = new Map();
    for (const o of orders) if (o.ownerId && !seen.has(o.ownerId)) seen.set(o.ownerId, { value: o.ownerId, label: o.ownerName || o.ownerId });
    const list = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
    if (orders.some((o) => !o.ownerId)) list.push({ value: NONE_VALUE, label: "ไม่มีเจ้าของ" });
    return list;
  }, [orders]);
  const teamOptions = useMemo(() => {
    const list = [...new Set(orders.map((o) => o.team).filter(Boolean))]
      .map((team) => ({ value: team, label: salesTeamLabel(teamRegistry, team) }));
    if (orders.some((o) => !o.team)) list.push({ value: NONE_VALUE, label: NO_TEAM_LABEL });
    return list;
  }, [orders, teamRegistry]);
  const monthOptions = useMemo(() => [...new Set(orders.map((o) => o.month).filter(Boolean))].sort()
    .map((m) => ({ value: m, label: formatMonthLabel(m) })), [orders]);
  const lineOptions = useMemo(() => {
    const list = BUSINESS_LINES.filter((l) => orders.some((o) => o.line === l)).map((l) => ({ value: l, label: businessLineLabel(l) }));
    if (orders.some((o) => !o.line)) list.push({ value: NONE_VALUE, label: "ยังไม่ระบุ" });
    return list;
  }, [orders]);
  const dealTypeOptions = useMemo(() => {
    const list = DEAL_TYPES.filter((t) => orders.some((o) => o.dealType === t)).map((t) => ({ value: t, label: t }));
    if (orders.some((o) => !o.dealType)) list.push({ value: NONE_VALUE, label: "ยังไม่ระบุ" });
    return list;
  }, [orders]);
  const financeOptions = useMemo(() => (orders.some((o) => financeStateOf(o) === "rejected")
    ? [...FINANCE_STATE_OPTIONS, { value: "rejected", label: "บัญชีตีกลับ" }]
    : FINANCE_STATE_OPTIONS), [orders]);
  const monthGroupShown = period.mode !== "range" && monthOptions.length > 1;
  useEffect(() => {
    /* ไม่มีข้อมูล (กำลังโหลด/โหลดพลาด) = ห้ามตัด — ไม่งั้นตัวเลือกว่างทำให้ตัวกรองที่ตั้งไว้หายหมด */
    if (loading || error || !orders.length) return;
    const valid = {
      owners: new Set(ownerOptions.map((o) => o.value)),
      teams: new Set(teamOptions.map((o) => o.value)),
      months: new Set(monthOptions.map((o) => o.value)),
    };
    setFilters((prev) => {
      const cur = { ...EMPTY_FILTERS, ...(prev || {}) };
      const next = {
        ...cur,
        owners: cur.owners.filter((v) => valid.owners.has(v)),
        teams: cur.teams.filter((v) => valid.teams.has(v)),
        /* กลุ่ม "งวด" ซ่อนอยู่ (ช่วงวัน/เดือนเดียว) = ล้างทิ้ง — ตัวกรองที่มองไม่เห็นแต่ยังกรองอยู่คือกับดัก (ตรวจ 2026-09-22) */
        months: monthGroupShown ? cur.months.filter((v) => valid.months.has(v)) : [],
      };
      const same = ["owners", "teams", "months"].every((k) => next[k].length === cur[k].length);
      return same ? prev : next;
    });
  }, [loading, error, orders.length, ownerOptions, teamOptions, monthOptions, monthGroupShown, setFilters]);

  const drilled = useMemo(() => ordersForDrill(orders, drill), [orders, drill]);
  const filtered = useMemo(() => filterOrders(drilled, { q, ...f }), [drilled, q, f.owners, f.teams, f.finance, f.months, f.kinds, f.lines, f.dealTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => sortOrders(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const groups = useMemo(() => groupOrders(sorted, groupBy, {
    teamLabels, monthLabel: (m) => formatMonthLabel(m), lineLabel: businessLineLabel,
  }), [sorted, groupBy, teamLabels]);
  const grouped = groupBy !== "none";

  /* แบ่งหน้าตาม "ใบ" เสมอ แม้จัดกลุ่ม — เดิมแบ่งตามกลุ่ม ⇒ 3 ทีม/8 คน/2 งวด = ทุกใบอยู่หน้าเดียว (สูง 12,790px · ตรวจ 2026-09-22)
     หัวกลุ่มยังบอกจำนวน/ยอดของทั้งกลุ่ม (ข้ามหน้า) · ใบเรียงตามลำดับกลุ่มก่อนตัดหน้า */
  const ordered = useMemo(() => (grouped ? groups.flatMap((g) => g.orders) : sorted), [grouped, groups, sorted]);
  const resetKey = `${period.mode}|${period.from}|${period.to}|${q}|${JSON.stringify(f)}|${JSON.stringify(drill)}|${groupBy}|${sortKey}|${sortDir}`;
  const pager = usePagination(ordered, { defaultSize: 10, resetKey });
  const pageGroups = useMemo(() => {
    if (!grouped) return [{ key: "all", label: null, orders: pager.pageRows }];
    const onPage = new Set(pager.pageRows.map((o) => o.id));
    return groups
      .map((g) => ({ ...g, orders: g.orders.filter((o) => onPage.has(o.id)) }))
      .filter((g) => g.orders.length);
  }, [grouped, groups, pager.pageRows]);

  const filterCount = activeFilterCount(f);
  const extraFilters = filterCount > 0 || q.trim();
  const searchRef = useRef(null);
  const clearDrill = () => { onClearDrill(); searchRef.current?.focus(); };
  const clearAll = () => { setQ(""); setFilters(EMPTY_FILTERS); onClearDrill(); };
  const totals = useMemo(() => filtered.reduce((acc, o) => ({
    amount: acc.amount + Number(o.amount || 0),
    vat: acc.vat + Number(o.vatAmount || 0),
    total: acc.total + Number(o.totalAmount || 0),
    collected: acc.collected + Number(o.collectedAmount || 0),
  }), { amount: 0, vat: 0, total: 0, collected: 0 }), [filtered]);

  const check = drill && !extraFilters ? drillCheck(drill.expected, drilled, { historyMonths: drill.historyMonths || [] }) : null;
  const running = summary && period.mode !== "range"
    ? summary.monthRows.filter((r) => !r.closed && r.orderCount > 0) : [];
  const overridden = summary ? summary.monthRows.filter((r) => r.overridden) : [];
  const historyMonthsAll = summary ? summary.monthRows.filter((r) => r.source === "history").map((r) => r.month) : [];
  const overriddenMonths = new Set(overridden.map((r) => r.month));

  const orderRow = (o) => {
    const badge = FINANCE_STATE_BADGE[financeStateOf(o)];
    return (
      <tr key={o.id}>
        <td>
          <Link className={`table-row-link ${styles.docNo}`} href={`/sa/sales-orders/${o.id}`}>{o.orderNumber}</Link>
          {/* ใบที่ส่วนลดท้ายใบเต็มจำนวน — ต้องขึ้นครบทุกใบ ห้ามกรองทิ้ง (มติผู้ใช้) */}
          {o.free && <span className={`ui-badge warning ${styles.docNo}`}>ไม่คิดเงิน</span>}
          {o.quoteNumber && <span className={`cell-sub ${styles.docNo}`}>{o.quoteNumber}</span>}
        </td>
        <td className="num">
          <Money value={o.amount} />
          {overriddenMonths.has(o.month) && <span className="cell-sub">ไม่นับ · เดือนนี้ใช้ยอดกรอก</span>}
        </td>
        <td>{o.customerName || NA}</td>
        <td>
          {o.ownerName || NA}
          <span className="cell-sub">{o.team ? salesTeamLabel(teamRegistry, o.team) : (o.ownerId ? NO_TEAM_LABEL : NA)}</span>
        </td>
        <td className="num">{o.day ? fmtDate(o.day) : NA}</td>
        <td>{lineCell(o.line)}</td>
        <td>{dealTypeCell(o.dealType)}</td>
        <td>
          <StatusBadge className="ui-badge-cell ui-badge-w-finance" tone={badge.tone || "neutral"} label={badge.label} />
        </td>
        <td className="num">{o.lineCount}</td>
        <td className="num">{o.vatAmount ? <Money value={o.vatAmount} /> : NA}</td>
        <td className="num"><Money value={o.totalAmount} /></td>
        {/* ยอดเก็บจริง = งวดที่บัญชีรับรองแล้ว (รวม VAT) · ที่ SA แจ้งแต่บัญชียังไม่รับรองเป็นบรรทัดรอง ไม่นับ */}
        <td className="num">
          {o.free ? NA : <Money value={o.collectedAmount || 0} />}
          {Number(o.awaitingAmount || 0) > 0 && <span className="cell-sub">รอบัญชีรับรอง <Money value={o.awaitingAmount} /></span>}
          {!o.free && !o.installmentCount && <span className="cell-sub">ยังไม่มีงวด</span>}
        </td>
      </tr>
    );
  };

  return (
    <ListPanel
      id="sales-report-orders"
      icon={<ClipboardList size={17} aria-hidden="true" />}
      title="ใบสั่งขายที่อนุมัติแล้ว"
      subtitle="อนุมัติในช่วงที่เลือก · งวดคิดจากวันที่อนุมัติ เวลาไทย · ยอดที่นับ = ยอดหน้าใบ − VAT ท้ายใบ · ยอดเก็บจริง = งวดที่บัญชีรับรองแล้ว (รวม VAT)"
      count={loading || error ? null : `${filtered.length} ใบ`}
      loading={loading}
      toolbar={(
        /* ลำดับตามกติกากลางของ ViewMenus: ค้นหา · ตัวกรอง · จัดกลุ่ม · spacer · เรียง */
        <>
          <div className="search-glass">
            <Search size={16} color="var(--text-3)" aria-hidden="true" />
            <input
              ref={searchRef}
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เลขที่ใบ / ใบเสนอราคา / ลูกค้า / ผู้รับผิดชอบ"
              aria-label="ค้นหาใบสั่งขาย"
            />
          </div>
          {drill && (
            /* ชื่อที่โปรแกรมอ่านหน้าจออ่าน = ข้อความที่ตาเห็น + คำบอกว่ากดแล้วล้าง (WCAG 2.5.3) · ล้างแล้วโฟกัสไปช่องค้นหา */
            <Button ref={chipRef} size="sm" onClick={clearDrill} title="กดเพื่อล้างตัวกรองจากตารางแยกยอด">
              จากแยกยอด: {drill.label} <span aria-hidden="true">×</span><span className="sr-only">(กดเพื่อล้าง)</span>
            </Button>
          )}
          <FilterPopover
            count={filterCount}
            onClear={() => setFilters(EMPTY_FILTERS)}
            groups={[
              ...(monthGroupShown
                ? [{ key: "months", label: "งวด", options: monthOptions, selected: f.months, onChange: (v) => setFilter("months", v) }]
                : []),
              { key: "lines", label: "ประเภทธุรกิจ", options: lineOptions, selected: f.lines, onChange: (v) => setFilter("lines", v) },
              { key: "dealTypes", label: "ประเภทดีล", options: dealTypeOptions, selected: f.dealTypes, onChange: (v) => setFilter("dealTypes", v) },
              { key: "teams", label: "ทีม", options: teamOptions, selected: f.teams, onChange: (v) => setFilter("teams", v) },
              { key: "owners", label: "ผู้รับผิดชอบ", options: ownerOptions, selected: f.owners, onChange: (v) => setFilter("owners", v) },
              { key: "finance", label: "ขั้นบัญชี", options: financeOptions, selected: f.finance, onChange: (v) => setFilter("finance", v) },
              { key: "kinds", label: "ชนิดใบ", options: ORDER_KIND_OPTIONS, selected: f.kinds, onChange: (v) => setFilter("kinds", v) },
            ]}
          />
          <GroupMenu
            title="จัดกลุ่มใบ"
            value={groupBy}
            onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
            options={ORDER_GROUP_OPTIONS}
          />
          {grouped && groups.length > 0 && (
            <CollapseAllButton
              collapsed={groups.every((g) => collapsed.has(g.key))}
              onToggle={() => setCollapsed(groups.every((g) => collapsed.has(g.key)) ? new Set() : new Set(groups.map((g) => g.key)))}
            />
          )}
          <span className="spacer" />
          {/* เปลี่ยนแบบเรียง = ตั้งทิศตั้งต้นของแบบนั้นให้ด้วย (กติกาเดียวกับทะเบียนการชำระ) */}
          <SortMenu
            title="เรียงลำดับใบ"
            value={sortKey}
            defaultValue={ORDER_SORT_DEFAULT}
            onChange={(value) => { setSortKey(value); setSortDir(ORDER_SORT_DIR[value]); }}
            options={ORDER_SORT_OPTIONS}
          />
          <SortDirButton dir={sortDir} onToggle={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} />
        </>
      )}
    >
      {error ? (
        <EmptyState plain><strong>ยังไม่มีข้อมูลของงวดนี้ — โหลดรายงานไม่สำเร็จ</strong></EmptyState>
      ) : !orders.length ? (
        <EmptyState plain icon={Search}>
          <strong>ไม่มีใบสั่งขายที่อนุมัติในช่วงนี้</strong>
          {historyMonthsAll.length > 0 && <small>ยอดของ {monthSpan(historyMonthsAll)} มาจากการกรอกย้อนหลัง จึงไม่มีใบให้ไล่</small>}
        </EmptyState>
      ) : !filtered.length ? (
        <EmptyState plain icon={Search} action={{ label: "ล้างตัวกรอง", onClick: clearAll }}>
          <strong>ไม่พบใบที่ตรงกับเงื่อนไข</strong>
          <small>ลองลดตัวกรอง หรือค้นด้วยเลขที่ใบ/ชื่อลูกค้าแทน</small>
        </EmptyState>
      ) : (
        <>
          {/* ประกาศเฉพาะผลเทียบยอดตอนเจาะ — ป้ายจำนวนของแผงกับ Pager ประกาศจำนวนอยู่แล้ว ไม่ต้องซ้ำทุกตัวอักษรที่พิมพ์ */}
          <div className={styles.resultNote} role={check ? "status" : undefined}>
            {check ? (
              check.ok ? (
                <span className={`${styles.checkLine} cell-num-ok`}>
                  <CheckCircle2 size={15} aria-hidden="true" /> รวม <Money value={check.total} /> ตรงกับขายจริง {drill.label} ในตารางแยกยอด
                </span>
              ) : (
                <span className={`${styles.checkLine} cell-num-bad`}>
                  <AlertTriangle size={15} aria-hidden="true" /> ต่างจากขายจริง {drill.label} <Money value={Math.abs(check.gap)} />
                  {check.reason === "history"
                    ? ` — ส่วนนี้มาจากยอดกรอกย้อนหลัง (${monthSpan(drill.historyMonths)}) ซึ่งไม่มีใบให้ไล่`
                    : " ในตารางแยกยอด"}
                </span>
              )
            ) : (
              <>
                ยอดที่นับรวม <b><Money value={totals.amount} /></b>
                {!drill && !extraFilters && running.length > 0 && period.mode === "year" && (
                  <> · รวม {running.map((r) => formatMonthLabel(r.month)).join(", ")} ที่ยังไม่จบ <Money value={running.reduce((s, r) => s + r.actual, 0)} /> ซึ่งไม่อยู่ในแถบสรุป</>
                )}
                {!drill && !extraFilters && overridden.length > 0 && (
                  <> · ไม่นับ {overridden.reduce((s, r) => s + r.overridden.count, 0)} ใบ <Money value={overridden.reduce((s, r) => s + r.overridden.amount, 0)} /> (เดือนที่ใช้ยอดกรอกย้อนหลัง)</>
                )}
              </>
            )}
          </div>
          <TableScroll surface="embedded" family="list" cells="stacked">
            <table>
              <thead>
                <tr>
                  <th>ใบสั่งขาย</th>
                  <th className="num">ยอดที่นับ</th>
                  <th className={styles.colCustomer}>ลูกค้า</th>
                  <th>ผู้รับผิดชอบ</th>
                  <th className="num">อนุมัติเมื่อ</th>
                  <th>ประเภทธุรกิจ</th>
                  <th>ประเภทดีล</th>
                  <th>ขั้นบัญชี</th>
                  <th className="num">บรรทัด</th>
                  <th className="num">VAT</th>
                  <th className="num">ยอดหน้าใบ</th>
                  <th className="num">ยอดเก็บจริง</th>
                </tr>
              </thead>
              {pageGroups.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                return (
                  <tbody key={group.key}>
                    {group.label && (
                      <TableGroupRow
                        colSpan={12}
                        label={group.label}
                        badge={`${group.count} ใบ`}
                        total={money(group.total)}
                        collapsed={isCollapsed}
                        onToggle={() => setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                          return next;
                        })}
                      />
                    )}
                    {!isCollapsed && group.orders.map(orderRow)}
                  </tbody>
                );
              })}
              <tfoot>
                <tr>
                  <td>รวม {filtered.length} ใบ{pager.pageCount > 1 ? " (ทุกหน้า)" : ""}</td>
                  <td className="num"><Money value={totals.amount} /></td>
                  <td colSpan={7} />
                  <td className="num"><Money value={totals.vat} /></td>
                  <td className="num"><Money value={totals.total} /></td>
                  <td className="num"><Money value={totals.collected} /></td>
                </tr>
              </tfoot>
            </table>
          </TableScroll>
          <Pager
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            onPage={pager.setPage}
            pageSize={pager.pageSize}
            onPageSize={pager.setPageSize}
            itemLabel="ใบ"
          />
        </>
      )}
      <div className={styles.footNote}>
        <p>กดเลขที่ใบเพื่อเปิดดูสินค้า จำนวน และส่วนลดในใบ</p>
      </div>
    </ListPanel>
  );
}

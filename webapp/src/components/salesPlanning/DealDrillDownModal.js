"use client";
import { TableScroll } from "@/components/ui/Table";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { snapForecastLevel, forecastToneClass, stageBadge, money } from "@/components/salesPlanning/ui";
import { forecastAmount, monthKey } from "@/lib/salesPlanning";
import {
  isWonDeal, isOpenDeal, isRealLostDeal, wonAmountOf, wonMonthOf, dealMatchesOwner,
  pendingApprovalAmountOf, pendingApprovalCountOf, pendingApprovalMonthOf,
  WON_AWAITING_SO_LABEL, wonAwaitingSoAmountOf, isKpiDeal,
} from "@/lib/sales/dashboardMetrics";
import { wonAwaitingSoInPeriod } from "@/lib/sales/wonAwaitingSoRollup";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { fmtDateTime, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import { useRole } from "@/lib/roleContext";
import { salesPlanningViewScope } from "@/lib/salesPlanning";
import styles from "./DealDrillDownModal.module.css";

/* งวดของ drill: รายชื่อเดือนของงวด (filter.months — ไตรมาส/ช่วง) · เดือนเดียว (filter.month) ·
   ทั้งปี (filter.year) · ไม่ระบุ = ทุกงวด
   🐞 ตรวจ 2026-09-16: งวด "ไตรมาส" ส่ง month = null มา ⇒ ตกไปกิ่งปี ⇒ กดยอด Q3 แล้วได้รายการ
      ทั้ง 12 เดือน (ยอดในลิ้นชัก ~4 เท่าของช่องที่กด) · ตัวส่งจึงส่งเดือนของงวดมาตรง ๆ */
const periodMatcher = (filter) => (mk) => (Array.isArray(filter.months) && filter.months.length
  ? filter.months.includes(mk)
  : (filter.month ? mk === filter.month
    : (filter.year ? String(mk || "").startsWith(`${filter.year}-`) : true)));

/* ⭐ metric "pendingApproval" = ยอด SO รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353)
   กติกาชุดเดียวกับ API แดชบอร์ด (lib/sales/pendingApprovalRollup): ดีล Won ที่มีใบรออนุมัติ
   และเดือนของยอด = เดือนปัจจุบันเวลาไทยเสมอ ⇒ เดือนที่ปิดไปแล้ว/ปีก่อนได้รายการว่าง
   ยอดบนแถว = ยอดรออนุมัติ ไม่ใช่ Actual และไม่ใช่ FC */
const PENDING_APPROVAL_METRIC = "pendingApproval";

/* ⭐ metric "wonAwaitingSo" = ดีล "Won รอยื่น SO" (มติผู้ใช้ 2026-09-14)
   ดีลปิด Won แล้วแต่ยังไม่มีเงินจากใบสั่งขายเลย (Actual 0 และยอดใบรออนุมัติ 0) — ยอดคาดการณ์นับด้วยมูลค่าดีล
   กติกาชุดเดียวกับ API แดชบอร์ด (lib/sales/wonAwaitingSoRollup): เดือน = wonMonthOf
   (ถังเดียวกับที่ดีล Won นั้นอยู่) ⇒ ยอดบนแถว = มูลค่าดีล ไม่ใช่ Actual และไม่ใช่ยอดรออนุมัติ
   เปิดด้วย filter รูปเดียวกับ metric อื่น: { metric: "wonAwaitingSo", month | year, ownerId, ownerName, team, teamScoped, label } */
const WON_AWAITING_SO_METRIC = "wonAwaitingSo";

// ป้ายแถวทีมของดีลที่ไม่มีทีม — ต้องตรงกับคีย์ที่ buildMatrix (lib/sales/performanceMath) ตั้งให้ถัง null
const NO_TEAM_ROW = "ไม่ระบุทีม";

export default function DealDrillDownModal({ filter, onClose }) {
  const role = useRole();
  const [deals, setDeals] = useState([]);
  // เวลาที่ใช้ตัดสินเดือนของยอดรออนุมัติ — ตัวเดียวกับตอนกรอง ไม่ใช่ new Date() ตอนเรนเดอร์
  const [pendingAsOf, setPendingAsOf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
const res = await apiFetch(new URL("/api/sales-planning/deals", window.location.origin), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("โหลดข้อมูลผิดพลาด");
        const data = await res.json();

        const inPeriod = periodMatcher(filter);
        const now = new Date();

        /* ⛔ ตัวกรองฐานก่อนคน/ทีม — ดีลของใบสั่งขายย้อนหลัง (mig 0360) ไม่อยู่ในตัวเลขของแดชบอร์ด (API ตัดที่ query)
           ⇒ ลิ้นชักต้องตัดเหมือนกันทุกกิ่ง (Won · FC · Won รอยื่น SO · นับสถานะ) ไม่งั้นรายการไม่ตรงช่องที่กด */
        let filtered = (data || []).filter(isKpiDeal).filter((d) => {
          /* แถวคน = (ใคร, ทีมไหน) (มติผู้ใช้ 2026-09-14 "ทีมตามดีล") — ส่ง filter ทั้งก้อนเข้าตัวจับคู่กลาง
             ⇒ `teamScoped` (ตารางติดตามส่ง true ให้แถวคน) ไปถึง dealMatchesOwner ด้วย: นับเฉพาะดีลที่ทีมตรงแถว
             คนที่มีดีลหลายทีมจึงได้ลิ้นชักเท่าช่องที่กด · ผู้เรียกที่ไม่ส่ง teamScoped ได้กติกาเดิมทุกอย่าง */
          if (filter.ownerName || filter.ownerId) return dealMatchesOwner(d, filter);
          /* 🐞 แถวทีม "ไม่ระบุทีม" = ถัง null ของ API (ดีลที่ไม่มีทีม · teamKey = team || 'ไม่ระบุ')
             เดิมป้ายนี้หลุดไป `return true` ⇒ ลิ้นชักโชว์ดีลทุกทีมทั้งบริษัท ยอดรวมไม่ตรงช่องที่กด
             (2026-09-11: ช่องรออนุมัติของแถวนี้เปิดลิ้นชักได้ด้วย — ฿ไม่กี่พันกลายเป็นยอดทั้งบริษัท) */
          if (filter.team === NO_TEAM_ROW) return !d.team;
          if (filter.team) return d.team === filter.team;
          return true;
        });

        if (filter.metric === "won") {
          filtered = filtered.filter((d) => isWonDeal(d) && inPeriod(wonMonthOf(d)));
        } else if (filter.metric === WON_AWAITING_SO_METRIC) {
          // ตัวจับคู่ตัวเดียวกับที่เทสต์ล็อกไว้กับถังเดือนของ API (ดีลไม่มีเดือน = ไม่นับ แม้งวด "ทุกงวด")
          filtered = filtered.filter((d) => wonAwaitingSoInPeriod(d, inPeriod));
        } else if (filter.metric === PENDING_APPROVAL_METRIC) {
          /* "มีใบรออนุมัติ" ตัดสินที่ตัวช่วยกลางตัวเดียวกับ API (ยอด > 0 หรือมีใบ — ใบ 0 บาทก็นับ)
             ⚠️ ไม่มีเดือน = ไม่มีใบ ต้องกันเอง: งวด "ทุกงวด" ตอบ inPeriod(null) = true */
          filtered = filtered.filter((d) => {
            const pendingMonth = pendingApprovalMonthOf(d, now);
            return isWonDeal(d) && Boolean(pendingMonth) && inPeriod(pendingMonth);
          });
        } else if (filter.metric === "lost") {
          // แพ้จริงเท่านั้น (กติกาเดียวกับ KPI ฝั่ง server — ดีลสหมิตรที่ถูกยุบ/แทนที่ไม่นับ)
          filtered = filtered.filter((d) => isRealLostDeal(d) && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric === "fcTotal") {
          filtered = filtered.filter((d) =>
            (isWonDeal(d) && inPeriod(wonMonthOf(d)))
            || ((isOpenDeal(d) || isRealLostDeal(d)) && inPeriod(monthKey(d.forecastMonth))));
        } else if (filter.metric === "remaining" || filter.metric === "forecast") {
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric?.startsWith("fc")) {
          const level = Number(filter.metric.replace("fc", ""));
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth))
            && snapForecastLevel(d.probability) === level);
        } else {
          /* 🐞 metric ที่ไม่ได้ลงทะเบียน — เดิมหลุดทุกกิ่งแล้ว `filtered` ค้างเป็น "ดีลทุกใบ
             ทุกงวด" ในขอบเขตคน/ทีม (ยอดรวมเป็น FC ของทั้งหมด หัวเป็นชื่อคีย์ดิบ) ⇒ ปุ่มที่ส่ง
             คีย์สะกดผิดดูเหมือนทำงานแต่โชว์ตัวเลขผิด · ตอนนี้ได้รายการว่าง เห็นทันทีว่าผิด */
          filtered = [];
        }

        setDeals(filtered);
        setPendingAsOf(now);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error(err);
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [filter, reloadKey]);

  useEffect(() => {
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [onClose]);

  const metricLabel = {
    won: "ยอด Won",
    lost: "ดีลที่แพ้",
    forecast: "ยอดคาดการณ์รวม",
    fc100: "ยอดคาดการณ์ 100%",
    fc80: "ยอดคาดการณ์ 80%",
    fc50: "ยอดคาดการณ์ 50%",
    fc20: "ยอดคาดการณ์ 20%",
    fcTotal: "FC Total",
    remaining: "FC คงเหลือ",
    [PENDING_APPROVAL_METRIC]: PENDING_APPROVAL_LABEL,
    [WON_AWAITING_SO_METRIC]: WON_AWAITING_SO_LABEL,
  }[filter.metric] || filter.metric;

  const metricDescription = {
    won: "ยอดที่ปิดการขายแล้วในช่วงเวลาที่เลือก",
    lost: "มูลค่าคาดการณ์ของดีลที่แพ้ในช่วงเวลาที่เลือก",
    forecast: "ดีลที่ยังเปิดอยู่ในช่วงเวลาที่เลือก",
    fcTotal: "ยอดคาดการณ์เดิม: ดีลเปิด + Won + แพ้ ใช้ตรวจความแม่นยำของ FC",
    remaining: "เฉพาะดีลที่ยังเปิดอยู่ ใช้ติดตามยอดที่ยังมีโอกาสปิด",
    [PENDING_APPROVAL_METRIC]: "ใบสั่งขายยื่นแล้ว รอ AE Supervisor อนุมัติ — ยังไม่นับเป็น Actual · นับอยู่เดือนปัจจุบันจนกว่าจะอนุมัติ",
    [WON_AWAITING_SO_METRIC]: "ดีลปิด Won แล้ว แต่ยังไม่มีเงินจากใบสั่งขายเลย (ยังไม่ออก · ร่าง · ถูกยกเลิก · มีแต่ใบยอด 0 บาท ทั้งที่อนุมัติแล้วและที่ยื่นรออนุมัติ) — นับในยอดคาดการณ์ด้วยมูลค่าดีล ยังไม่ใช่ Actual",
  }[filter.metric] || "รายการดีลตามระดับโอกาสและช่วงเวลาที่เลือก";

  const isPendingMetric = filter.metric === PENDING_APPROVAL_METRIC;
  const isWonAwaitingSoMetric = filter.metric === WON_AWAITING_SO_METRIC;
  let summaryLabel = "มูลค่ารวม";
  let amountHeader = "มูลค่า (บาท)";
  if (isPendingMetric) {
    summaryLabel = "ยอดรออนุมัติรวม";
    amountHeader = "ยอดรออนุมัติ (บาท)";
  } else if (isWonAwaitingSoMetric) {
    summaryLabel = "มูลค่าดีลรวม";
    amountHeader = "มูลค่าดีล (บาท)";
  }
  const inPeriod = periodMatcher(filter);
  const amountOf = (deal) => {
    if (isPendingMetric) return pendingApprovalAmountOf(deal);
    if (isWonAwaitingSoMetric) return wonAwaitingSoAmountOf(deal);
    return isWonDeal(deal) && filter.metric === "won" ? wonAmountOf(deal) : forecastAmount(deal);
  };
  // ⛔ ยอดรวมของรายการ "ยอด Won" = Actual ล้วน — บรรทัดรองรออนุมัติบนแถวไม่ถูกบวกเข้ามา
  const totalValue = deals.reduce((sum, deal) => sum + amountOf(deal), 0);
  const pendingOrderCount = isPendingMetric
    ? deals.reduce((sum, deal) => sum + pendingApprovalCountOf(deal), 0) : 0;
  /* แถวในรายการ "ยอด Won" ที่เป็น "Won รอยื่น SO" — บรรทัดรองบอกว่าทำไม Actual ฿0.00 และยอด
     คาดการณ์นับมันด้วยมูลค่าดีลเท่าไร (มติผู้ใช้ 2026-09-14) · ไม่ซ้อนกับบรรทัดรออนุมัติ (มีใบรออนุมัติ
     = ไม่ใช่รอยื่น) · ⛔ ไม่ถูกบวกเข้ายอดรวมของรายการ (ยอดรวม "ยอด Won" = Actual ล้วน)
     ⚠️ ผ่านตัวจับคู่งวดตัวเดียวกับ metric wonAwaitingSo — ดีล Won ที่ไม่มีเดือนเลยหลุดเข้ารายการ Won
        ของงวด "ทุกงวด" ได้ (inPeriod(null) = true) แต่ API ไม่เคยนับมันในยอดคาดการณ์ ⇒ ห้ามโชว์ยอดให้ */
  const showAwaitingSoSubLine = (deal) => filter.metric === "won" && wonAwaitingSoInPeriod(deal, inPeriod);
  /* แถวในรายการ "ยอด Won" ที่มีใบรออนุมัติ — โชว์บรรทัดรองใต้ยอด Actual ให้เห็นว่าทำไม ฿0.00
     เฉพาะเมื่อเดือนของยอดรออนุมัติ (= เดือนปัจจุบัน) อยู่ในงวดที่ดู · เดือนที่ปิดไปแล้วไม่โชว์
     เพราะอนุมัติวันนี้ Actual ลงเดือนนี้ ไม่ย้อนไปเดือนนั้น
     ⚠️ ไม่มีเดือน (ดีลที่ API ไม่นับยอดรออนุมัติ) = ไม่โชว์ — inPeriod(null) ของงวด "ทุกงวด"
        ตอบ true ซึ่งจะโชว์บรรทัดให้ดีลที่ตัวเลขบนแดชบอร์ดไม่ได้นับ */
  const showPendingSubLine = (deal) => {
    if (filter.metric !== "won" || !pendingAsOf) return false;
    const pendingMonth = pendingApprovalMonthOf(deal, pendingAsOf);
    return Boolean(pendingMonth) && inPeriod(pendingMonth);
  };
  const viewScope = salesPlanningViewScope(role);
  const scopeNote = viewScope === 'team'
    ? "รายการนี้แสดงเฉพาะดีลของทีมคุณ — ตัวเลขบนแผงเป็นยอดทั้งบริษัท จึงมากกว่ายอดรวมด้านล่างได้"
    : viewScope === 'own'
      ? "รายการนี้แสดงเฉพาะดีลที่คุณเป็นเจ้าของ — ตัวเลขบนแผงเป็นยอดทั้งบริษัท จึงมากกว่ายอดรวมด้านล่างได้"
      : null;

  const statusCounts = deals.reduce((counts, deal) => {
    if (isWonDeal(deal)) counts.won += 1;
    else if (deal.stage === "lost") counts.lost += 1;
    else if (isOpenDeal(deal)) counts.open += 1;
    return counts;
  }, { open: 0, won: 0, lost: 0 });
  /* ป้ายงวด: คำที่แถบบนจอใช้อยู่ (filter.periodText) มาก่อนเสมอ — เดิมเดาจาก month/year เอง ⇒ งวดไตรมาส
     ขึ้นหัวว่า "ทั้งปี" ทั้งที่รายการเป็นแค่ไตรมาสเดียว */
  const periodLabel = filter.periodText || filter.month || (filter.year ? `ทั้งปี ${filter.year}` : "ทั้งปี");
  const ownerLabel = filter.label || filter.ownerId || filter.team || "รวมทุกทีม";

  return (
    <div className="fc-detail-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside
        ref={drawerRef}
        className="fc-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="fc-detail-header">
          <div className="fc-detail-heading">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id={titleId}>{metricLabel}</h2>
              <span className="ui-badge fc-detail-period">{periodLabel}</span>
            </div>
            <p>{ownerLabel}</p>
            {/* 🐞 ตัวเลขบนแท็บผลงานขายเป็นยอดทั้งบริษัท แต่ API รายการดีลกรองตามสิทธิ์ (ae = ของตัวเอง · senior_ae/ac = ทีม)
                ⇒ ยอดรวมในลิ้นชักน้อยกว่าช่องที่กดโดยไม่มีอะไรบอก · มติผู้ใช้: คงขอบเขตเดิม แต่ต้องเขียนบอกตรง ๆ */}
            {scopeNote && <p className="cell-sub">{scopeNote}</p>}
          </div>
          <button ref={closeButtonRef} type="button" className="fc-detail-close" onClick={onClose} aria-label="ปิดรายละเอียด FC">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <section className="fc-detail-summary" aria-label="สรุปรายละเอียด FC">
          <div>
            <span className="fc-detail-summary-label">{summaryLabel}</span>
            {loading ? <Skeleton width={180} height={30} /> : <strong>{money(totalValue)}</strong>}
          </div>
          <div>
            <span className="fc-detail-summary-label">จำนวนดีล</span>
            {loading ? <Skeleton width={72} height={24} /> : <strong className="fc-detail-count">{deals.length} รายการ</strong>}
            {/* จำนวน "ใบ" คู่กับตัวเลขบนแดชบอร์ด (รออนุมัติ ฿X · N ใบ) — ดีลหนึ่งมีได้หลายใบ */}
            {!loading && isPendingMetric && <span className="cell-sub">ใบสั่งขาย {pendingOrderCount} ใบ</span>}
          </div>
          <p>{metricDescription}</p>
          {!loading && !loadError && filter.metric === "fcTotal" && (
            <div className="fc-detail-statuses">
              <span className="ui-badge" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>เปิด {statusCounts.open}</span>
              <span className="ui-badge" style={{ background: "var(--green-soft)", color: "var(--green)" }}>Won {statusCounts.won}</span>
              <span className="ui-badge" style={{ background: "var(--red-soft)", color: "var(--red)" }}>แพ้ {statusCounts.lost}</span>
            </div>
          )}
        </section>

        <div className="fc-detail-body">
          {loading ? (
            <div className="fc-detail-skeleton" aria-label="กำลังโหลดรายละเอียด FC">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index}>
                  <Skeleton width={index % 2 ? "68%" : "82%"} />
                  <Skeleton width="42%" height={12} />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <EmptyState
              plain
              icon={AlertCircle}
              action={{ label: "ลองอีกครั้ง", onClick: () => setReloadKey((key) => key + 1) }}
            >
              โหลดรายละเอียด FC ไม่สำเร็จ
            </EmptyState>
          ) : deals.length > 0 ? (
            <TableScroll className="fc-detail-table-wrap">
              <table className="premium-table fc-detail-table">
                <thead>
                  <tr>
                    <th>โครงการ / ลูกค้า</th>
                    <th>สถานะ</th>
                    <th className="fc-detail-chance">โอกาส</th>
                    <th className="num">{amountHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <Link href={`/sales-planning/deals/${deal.id}`} className="fc-detail-project-link">
                          {deal.title}
                        </Link>
                        <div className="fc-detail-meta">{deal.customer?.name || deal.customerName || "ไม่ระบุลูกค้า"}</div>
                        <div className="fc-detail-meta">อัปเดตล่าสุด: {fmtDateTime(deal.updatedAt)}</div>
                      </td>
                      {/* ป้ายกว้างเท่ากันทั้งคอลัมน์ด้วย `ui-badge-cell` + `ui-badge-w-*`
                          (ชุดเดียวกับตารางดีล) — ขอบป้ายจึงเรียงเป็นเส้นตรงลงมา */}
                      <td>
                        <div className="fc-detail-badges">{stageBadge(deal.stage, "ui-badge-cell ui-badge-w-stage")}</div>
                      </td>
                      {/* โอกาสมีเฉพาะดีลที่ยังเปิด — Won/แพ้ จบไปแล้วจึงไม่มีเปอร์เซ็นต์ให้ถ่วง
                          (ขีดกลาง = ไม่มีค่า ไม่ใช่ 0%) · โชว์ % ดิบ ไม่ snap เป็นชั้น 20/50/80
                          เหมือน `forecastBadge` เพราะนี่คือหน้าที่ผู้ใช้กดเข้ามาตรวจตัวเลขจริง */}
                      <td className="fc-detail-chance">
                        {isOpenDeal(deal)
                          ? <span className={`ui-badge ui-badge-cell ui-badge-w-fc ${forecastToneClass(deal.probability)}`}>{deal.probability}%</span>
                          : <span className="ui-badge-w-fc fc-detail-nochance">{NA}</span>}
                      </td>
                      <td className="num fc-detail-amount">
                        {money(amountOf(deal))}
                        {/* ยอดรออนุมัติเป็นบรรทัดรองแยก ไม่รวมกับตัวเลข Actual ข้างบน
                            (ชิ้นกลาง PendingApprovalAmount — ไม่มีใบรออนุมัติ = ไม่เรนเดอร์) */}
                        {showPendingSubLine(deal) && (
                          <PendingApprovalAmount
                            amount={pendingApprovalAmountOf(deal)}
                            count={pendingApprovalCountOf(deal)}
                            className={styles.pendingSubLine}
                          />
                        )}
                        {/* "Won รอยื่น SO ฿มูลค่าดีล" — คำกำกับคือสัญญาณ ไม่ใช่สี · ไม่รวมกับ Actual ข้างบน */}
                        {showAwaitingSoSubLine(deal) && (
                          <span
                            className={styles.awaitingSoSubLine}
                            title="ดีลปิด Won แล้ว แต่ยังไม่มีเงินจากใบสั่งขายเลย (ยังไม่ออก · ร่าง · ถูกยกเลิก · มีแต่ใบยอด 0 บาท ทั้งที่อนุมัติแล้วและที่ยื่นรออนุมัติ) — นับในยอดคาดการณ์ด้วยมูลค่าดีล ยังไม่ใช่ Actual"
                          >
                            {WON_AWAITING_SO_LABEL} {money(wonAwaitingSoAmountOf(deal))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          ) : (
            <EmptyState plain>ไม่พบโครงการที่ตรงกับเงื่อนไข</EmptyState>
          )}
        </div>
      </aside>
    </div>
  );
}

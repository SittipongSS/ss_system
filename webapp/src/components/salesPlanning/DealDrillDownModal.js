"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { snapForecastLevel, stageBadge, money } from "@/components/salesPlanning/ui";
import { forecastAmount, monthKey } from "@/lib/salesPlanning";
import { isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner } from "@/lib/sales/dashboardMetrics";
import { fmtDateTime } from "@/lib/format";

export default function DealDrillDownModal({ filter, onClose }) {
  const [deals, setDeals] = useState([]);
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
        const res = await fetch(new URL("/api/sales-planning/deals", window.location.origin), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("โหลดข้อมูลผิดพลาด");
        const data = await res.json();

        const inPeriod = (mk) => (filter.month ? mk === filter.month
          : (filter.year ? String(mk || "").startsWith(`${filter.year}-`) : true));

        let filtered = (data || []).filter((d) => {
          if (filter.ownerName || filter.ownerId) return dealMatchesOwner(d, filter);
          if (filter.team && filter.team !== "ไม่ระบุทีม") return d.team === filter.team;
          return true;
        });

        if (filter.metric === "won") {
          filtered = filtered.filter((d) => isWonDeal(d) && inPeriod(wonMonthOf(d)));
        } else if (filter.metric === "lost") {
          filtered = filtered.filter((d) => d.stage === "lost" && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric === "fcTotal") {
          filtered = filtered.filter((d) =>
            (isWonDeal(d) && inPeriod(wonMonthOf(d)))
            || ((isOpenDeal(d) || d.stage === "lost") && inPeriod(monthKey(d.forecastMonth))));
        } else if (filter.metric === "remaining" || filter.metric === "forecast") {
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric?.startsWith("fc")) {
          const level = Number(filter.metric.replace("fc", ""));
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth))
            && snapForecastLevel(d.probability) === level);
        }

        setDeals(filtered);
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
  }[filter.metric] || filter.metric;

  const metricDescription = {
    won: "ยอดที่ปิดการขายแล้วในช่วงเวลาที่เลือก",
    lost: "มูลค่าคาดการณ์ของดีลที่แพ้ในช่วงเวลาที่เลือก",
    forecast: "ดีลที่ยังเปิดอยู่ในช่วงเวลาที่เลือก",
    fcTotal: "ยอดคาดการณ์เดิม: ดีลเปิด + Won + แพ้ ใช้ตรวจความแม่นยำของ FC",
    remaining: "เฉพาะดีลที่ยังเปิดอยู่ ใช้ติดตามยอดที่ยังมีโอกาสปิด",
  }[filter.metric] || "รายการดีลตามระดับโอกาสและช่วงเวลาที่เลือก";

  const amountOf = (deal) => (isWonDeal(deal) && filter.metric === "won"
    ? wonAmountOf(deal) : forecastAmount(deal));
  const totalValue = deals.reduce((sum, deal) => sum + amountOf(deal), 0);
  const statusCounts = deals.reduce((counts, deal) => {
    if (isWonDeal(deal)) counts.won += 1;
    else if (deal.stage === "lost") counts.lost += 1;
    else if (isOpenDeal(deal)) counts.open += 1;
    return counts;
  }, { open: 0, won: 0, lost: 0 });
  const periodLabel = filter.month || (filter.year ? `ทั้งปี ${filter.year}` : "ทั้งปี");
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
          </div>
          <button ref={closeButtonRef} type="button" className="fc-detail-close" onClick={onClose} aria-label="ปิดรายละเอียด FC">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <section className="fc-detail-summary" aria-label="สรุปรายละเอียด FC">
          <div>
            <span className="fc-detail-summary-label">มูลค่ารวม</span>
            {loading ? <Skeleton width={180} height={30} /> : <strong>{money(totalValue)}</strong>}
          </div>
          <div>
            <span className="fc-detail-summary-label">จำนวนดีล</span>
            {loading ? <Skeleton width={72} height={24} /> : <strong className="fc-detail-count">{deals.length} รายการ</strong>}
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
            <div className="premium-table-wrapper fc-detail-table-wrap">
              <table className="premium-table fc-detail-table">
                <thead>
                  <tr>
                    <th>โครงการ / ลูกค้า</th>
                    <th>สถานะ / โอกาส</th>
                    <th className="num">มูลค่า (บาท)</th>
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
                      <td>
                        <div className="fc-detail-badges">
                          {stageBadge(deal.stage)}
                          {isOpenDeal(deal) && <span className="ui-badge">FC {deal.probability}%</span>}
                        </div>
                      </td>
                      <td className="num fc-detail-amount">{money(amountOf(deal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState plain>ไม่พบโครงการที่ตรงกับเงื่อนไข</EmptyState>
          )}
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { snapForecastLevel, stageBadge, money } from "@/components/salesPlanning/ui";
import { forecastAmount, monthKey } from "@/lib/salesPlanning";
// กติกา Won/เดือน/ยอด/จับคู่คน — ชุดเดียวกับตัวรวมยอดแดชบอร์ด (ไม่งั้นรายการ
// ที่กดเข้ามาดูไม่ตรงกับตัวเลขบนการ์ด — ผลตรวจระบบขาย 2026-07-16)
import { isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner } from "@/lib/sales/dashboardMetrics";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";

export default function DealDrillDownModal({ filter, onClose }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // ดึงทั้งชุดแล้วกรองด้วยกติกากลางฝั่ง client — ?month ของ /deals กรองด้วย
        // forecastMonth อย่างเดียว ใช้กับยอด Won (นับตาม wonMonth) ไม่ได้
        const res = await fetch(new URL("/api/sales-planning/deals", window.location.origin));
        if (!res.ok) throw new Error("โหลดข้อมูลผิดพลาด");
        const data = await res.json();

        // ช่วงเวลา: เดือนที่กด หรือทั้งปีของช่อง "รวมปี"
        const inPeriod = (mk) => (filter.month ? mk === filter.month
          : (filter.year ? String(mk || "").startsWith(`${filter.year}-`) : true));

        let filtered = (data || []).filter((d) => {
          // แถวรายบุคคล: จับคู่ด้วยชื่อ+ทีม (แดชบอร์ดรวมคนด้วย name+team ไม่ใช่ id เดี่ยว)
          if (filter.ownerName || filter.ownerId) return dealMatchesOwner(d, filter);
          if (filter.team && filter.team !== "ไม่ระบุทีม") return d.team === filter.team;
          return true;
        });

        if (filter.metric === "won") {
          // Won = won + in_project, นับเดือนตาม wonMonth (ไม่ใช่ forecastMonth)
          filtered = filtered.filter((d) => isWonDeal(d) && inPeriod(wonMonthOf(d)));
        } else if (filter.metric === "lost") {
          filtered = filtered.filter((d) => d.stage === "lost" && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric === "fcTotal") {
          // FC Total = เปิด + Won + แพ้ (Won นับตาม wonMonth, เปิด/แพ้ ตาม forecastMonth)
          filtered = filtered.filter((d) =>
            (isWonDeal(d) && inPeriod(wonMonthOf(d)))
            || ((isOpenDeal(d) || d.stage === "lost") && inPeriod(monthKey(d.forecastMonth))));
        } else if (filter.metric === "remaining" || filter.metric === "forecast") {
          // FC คงเหลือ = ดีลที่ "ยังเปิด" ในงวด (= ผลรวม FC 20..100)
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth)));
        } else if (filter.metric?.startsWith("fc")) {
          // fc20/50/80/100 — ดีลเปิดที่ระดับโอกาสนั้น
          const level = Number(filter.metric.replace("fc", ""));
          filtered = filtered.filter((d) => isOpenDeal(d) && inPeriod(monthKey(d.forecastMonth))
            && snapForecastLevel(d.probability) === level);
        }

        setDeals(filtered);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  // Handle ESC
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const metricLabel = {
    won: "ยอด Won",
    lost: "ดีลที่แพ้ (มูลค่าคาดการณ์)",
    forecast: "ยอดคาดการณ์ (รวม)",
    fc100: "ยอดคาดการณ์ (100%)",
    fc80: "ยอดคาดการณ์ (80%)",
    fc50: "ยอดคาดการณ์ (50%)",
    fc20: "ยอดคาดการณ์ (20%)",
    fcTotal: "FC Total (เปิด + Won + แพ้)",
    remaining: "FC คงเหลือ (ดีลที่ยังเปิด)",
  }[filter.metric] || filter.metric;

  // Actual uses the SO-verified won amount. FC metrics always preserve the
  // original projectValue so FC Total can audit forecast accuracy.
  const amountOf = (d) => (isWonDeal(d) && filter.metric === "won"
    ? wonAmountOf(d) : forecastAmount(d));
  const totalValue = deals.reduce((sum, d) => sum + amountOf(d), 0);

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ maxWidth: 900, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <header className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {metricLabel}
              <span className="ui-badge" style={{ background: "var(--surface-3)", color: "var(--text)" }}>
                {filter.month || (filter.year ? `ทั้งปี ${filter.year}` : "ทั้งปี")}
              </span>
            </h2>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
              {filter.label || filter.ownerId || filter.team || "รวมทุกทีม"}
            </div>
          </div>
          <button type="button" className="btn ghost icon-only" onClick={onClose} aria-label="ปิด">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        
        <div style={{ padding: "0", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div className="flex items-center justify-center" style={{ padding: 60, color: "var(--text-3)" }}>
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : deals.length > 0 ? (
            <table className="w-full text-sm premium-glass-table" style={{ margin: 0, border: 0, borderRadius: 0, boxShadow: "none" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--panel)" }}>
                <tr>
                  <th style={{ padding: "12px 20px" }}>โครงการ</th>
                  <th style={{ padding: "12px 20px" }}>ลูกค้า</th>
                  <th style={{ padding: "12px 20px" }}>สถานะ / โอกาส</th>
                  <th className="num" style={{ padding: "12px 20px" }}>มูลค่า (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="premium-row">
                    <td style={{ padding: "12px 20px" }}>
                      <Link href={`/sales-planning/deals/${d.id}`} className="font-medium" style={{ color: "var(--text)", textDecoration: "none" }}>
                        {d.title}
                      </Link>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                        อัปเดตล่าสุด: {fmtDateTime(d.updatedAt)}
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px", color: "var(--text-2)" }}>
                      {d.customer?.name || d.customerName || "-"}
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {stageBadge(d.stage)}
                        {isOpenDeal(d) && (
                          <span className="ui-badge" style={{ color: "var(--text-3)" }}>FC {d.probability}%</span>
                        )}
                      </div>
                    </td>
                    <td className="num font-mono" style={{ padding: "12px 20px", fontWeight: 700, color: "var(--text)" }}>
                      {money(amountOf(d))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center flex-col" style={{ padding: 60, color: "var(--text-3)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👻</div>
              <div>ไม่พบโครงการที่ตรงกับเงื่อนไข</div>
            </div>
          )}
        </div>
        
        {!loading && deals.length > 0 && (
          <footer className="flex items-center justify-between" style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>รวม {deals.length} โครงการ</span>
            <span className="font-mono tabular-nums" style={{ fontSize: 18, fontWeight: 800 }}>
              {money(totalValue)}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}

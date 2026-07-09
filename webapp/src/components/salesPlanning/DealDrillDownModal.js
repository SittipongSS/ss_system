"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { snapForecastLevel, stageBadge, money } from "@/components/salesPlanning/ui";
import { forecastAmount } from "@/lib/salesPlanning";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";

export default function DealDrillDownModal({ filter, onClose }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const url = new URL("/api/sales-planning/deals", window.location.origin);
        if (filter.month) url.searchParams.set("month", filter.month);
        
        const res = await fetch(url);
        if (!res.ok) throw new Error("โหลดข้อมูลผิดพลาด");
        const data = await res.json();
        
        let filtered = data || [];
        
        // Filter by Owner or Team
        if (filter.ownerId) {
          filtered = filtered.filter(d => d.ownerId === filter.ownerId);
        } else if (filter.team && filter.team !== "ไม่ระบุทีม") {
          filtered = filtered.filter(d => d.team === filter.team);
        }
        
        // Filter by Metric
        if (filter.metric === "won") {
          filtered = filtered.filter(d => d.stage === "won");
        } else if (filter.metric === "forecast" || filter.metric?.startsWith("fc")) {
          filtered = filtered.filter(d => d.stage !== "won" && d.stage !== "lost");
          
          if (filter.metric.startsWith("fc")) {
            const level = Number(filter.metric.replace("fc", ""));
            filtered = filtered.filter(d => snapForecastLevel(d.probability) === level);
          }
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
    forecast: "ยอดคาดการณ์ (รวม)",
    fc100: "ยอดคาดการณ์ (100%)",
    fc80: "ยอดคาดการณ์ (80%)",
    fc50: "ยอดคาดการณ์ (50%)",
    fc20: "ยอดคาดการณ์ (20%)",
  }[filter.metric] || filter.metric;

  const totalValue = deals.reduce((sum, d) => sum + (filter.metric === "won" ? Number(d.wonValue || 0) : forecastAmount(d)), 0);

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ maxWidth: 900, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <header className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {metricLabel}
              <span className="ui-badge" style={{ background: "var(--surface-3)", color: "var(--text)" }}>
                {filter.month || "ทั้งปี"}
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
                        {d.stage !== "won" && d.stage !== "lost" && (
                          <span className="ui-badge" style={{ color: "var(--text-3)" }}>FC {d.probability}%</span>
                        )}
                      </div>
                    </td>
                    <td className="num font-mono" style={{ padding: "12px 20px", fontWeight: 700, color: "var(--text)" }}>
                      {money(filter.metric === "won" ? Number(d.wonValue || 0) : forecastAmount(d))}
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

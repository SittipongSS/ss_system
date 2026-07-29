"use client";
import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { buildReconMatrix } from "@/lib/sahamit/reconcileClient";
import { poRollupStatus } from "@/lib/sahamit/po";
import ChartCard, { ChartCanvas, ChartEmptyState, ChartTooltip } from "@/components/ui/ChartCard";

// --- Formatter Helpers ---
const formatNumber = (num) => Number(num || 0).toLocaleString("th-TH");
const formatShortMonth = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${thMonths[parseInt(m, 10) - 1]} ${(parseInt(y, 10) + 543).toString().slice(-2)}`;
};

// --- Charts Component ---
export default function DashboardCharts({ rounds, pos, coverages = [] }) {
  // 1. Bar Chart Data (FC vs PO)
  const barData = useMemo(() => {
    if (!rounds || !pos) return [];
    const matrix = buildReconMatrix(rounds, pos, coverages);
    // filter last 2 months and next 4 months for relevance, or just show all available up to 6-8 months
    // Let's just take all matrix months and slice the most recent/upcoming 6 months
    
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    
    let relevantMonths = matrix.months;
    // Find index of current month, or the closest one
    let idx = relevantMonths.findIndex(m => m >= currentMonthStr);
    if (idx === -1) idx = relevantMonths.length - 1; // if all are in past
    
    // Take 2 months before and 4 months after (total 6)
    const startIdx = Math.max(0, idx - 2);
    relevantMonths = relevantMonths.slice(startIdx, startIdx + 6);

    return relevantMonths.map((m) => {
      let fc = 0, po = 0;
      matrix.rows.forEach((r) => {
        if (r.cells[m]) {
          fc += r.cells[m].fcQty || 0;
          po += r.cells[m].poQty || 0;
        }
      });
      return { month: m, Forecast: fc, PO: po };
    });
  }, [rounds, pos, coverages]);

  // 2. Pie Chart Data (PO Status)
  const pieData = useMemo(() => {
    if (!pos) return [];
    const counts = pos.reduce((acc, po) => {
      const status = poRollupStatus(po);
      if (status !== "cancelled") {
        acc[status] = (acc[status] || 0) + 1;
      }
      return acc;
    }, {});
    
    return [
      { name: "รอดำเนินการ", value: counts.open || 0, color: "var(--amber)" },
      { name: "ทยอยส่ง", value: counts.partial || 0, color: "var(--blue)" },
      { name: "ส่งครบ (เสร็จสิ้น)", value: counts.delivered || 0, color: "var(--green)" },
    ].filter(d => d.value > 0);
  }, [pos]);

  return (
    <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr", gap: "24px", marginBottom: "24px" }}>
      {/* FC vs PO Bar Chart */}
      <ChartCard title="เปรียบเทียบ Forecast กับ PO (6 เดือน)" minHeight={260}>
        <div style={{ height: 260 }}>
          {barData.length > 0 ? (
            <ChartCanvas><ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={formatShortMonth} tick={{ fontSize: "var(--fs-5)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val} tick={{ fontSize: "var(--fs-5)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} dx={-10} />
                <RechartsTooltip
                  content={<ChartTooltip labelFormatter={formatShortMonth} valueFormatter={(value) => `${formatNumber(value)} ชิ้น`} />}
                  cursor={{ fill: "var(--panel-2)", opacity: 0.5 }}
                />
                <Legend wrapperStyle={{ fontSize: "var(--fs-7)", paddingTop: "10px" }} />
                <Bar dataKey="Forecast" name="ยอด Forecast" fill="var(--blue)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="PO" name="ยอด PO ที่ได้รับ" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer></ChartCanvas>
          ) : (
            <ChartEmptyState>ไม่มีข้อมูล Forecast หรือ PO</ChartEmptyState>
          )}
        </div>
      </ChartCard>

      {/* PO Status Pie Chart */}
      <ChartCard title="สัดส่วนสถานะ PO" minHeight={260}>
        <div style={{ height: 260 }}>
          {pieData.length > 0 ? (
            <ChartCanvas><ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<ChartTooltip valueFormatter={(value) => `${value} รายการ`} />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: "var(--fs-7)" }}
                />
              </PieChart>
            </ResponsiveContainer></ChartCanvas>
          ) : (
            <ChartEmptyState>ไม่มีข้อมูล PO</ChartEmptyState>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

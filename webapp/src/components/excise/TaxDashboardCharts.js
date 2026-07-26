"use client";
import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import { fmtMoney } from "@/lib/format";
import { CHART_LINE_TYPE } from "@/lib/chartTheme";
import { ChartCanvas, ChartEmptyState, ChartTooltip } from "@/components/ui/ChartCard";

// Colors mapped to our design system
const COLORS = {
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
  info: "var(--blue)",
  neutral: "var(--text-3)",
  accent: "var(--accent)",
};

export function RegsDonutChart({ regs = [] }) {
  const data = useMemo(() => {
    const counts = { draft: 0, pending_legal: 0, approved: 0, rejected: 0 };
    regs.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    
    return [
      { name: "ฉบับร่าง", value: counts.draft, color: COLORS.neutral },
      { name: "รออนุมัติ", value: counts.pending_legal, color: COLORS.warning },
      { name: "ขึ้นทะเบียนแล้ว", value: counts.approved, color: COLORS.success },
      { name: "ตีกลับให้แก้ไข", value: counts.rejected, color: COLORS.danger },
    ].filter(d => d.value > 0);
  }, [regs]);

  if (data.length === 0) {
    return <ChartEmptyState>ไม่มีข้อมูลทะเบียนในช่วงนี้</ChartEmptyState>;
  }

  return (
    <ChartCanvas><ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <RechartsTooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer></ChartCanvas>
  );
}

export function OrdersComposedChart({ orders = [] }) {
  const data = useMemo(() => {
    // Group orders by status
    const grouped = {
      draft: { name: "เตรียมใบยื่น", count: 0, tax: 0, color: COLORS.neutral },
      pending: { name: "รอรับเงิน", count: 0, tax: 0, color: COLORS.danger },
      received: { name: "รอยื่น", count: 0, tax: 0, color: COLORS.warning },
      filing: { name: "กำลังยื่น", count: 0, tax: 0, color: COLORS.info },
      complete: { name: "ชำระแล้ว", count: 0, tax: 0, color: COLORS.success },
      delivered: { name: "ส่งเอกสารแล้ว", count: 0, tax: 0, color: COLORS.accent },
    };

    orders.forEach(o => {
      if (grouped[o.status]) {
        grouped[o.status].count++;
        grouped[o.status].tax += (o.totalTax || 0);
      }
    });

    return Object.values(grouped).filter(d => d.count > 0);
  }, [orders]);

  if (data.length === 0) {
    return <ChartEmptyState>ไม่มีข้อมูลใบยื่นในช่วงนี้</ChartEmptyState>;
  }

  return (
    <ChartCanvas><ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis 
          dataKey="name" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: "var(--text-2)", fontSize: 12 }} 
          dy={10}
        />
        <YAxis 
          yAxisId="left" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: "var(--text-3)", fontSize: 12 }} 
        />
        <YAxis 
          yAxisId="right" 
          orientation="right" 
          axisLine={false} 
          tickLine={false} 
          tickFormatter={(val) => {
            if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
            if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
            return val;
          }}
          tick={{ fill: "var(--text-3)", fontSize: 12 }}
        />
        <RechartsTooltip
          content={(
            <ChartTooltip
              valueFormatter={(value, name) => name === "TaxAmount" ? fmtMoney(value) : value}
            />
          )}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
        <Bar 
          yAxisId="left" 
          dataKey="count" 
          name="จำนวนรายการ" 
          radius={[4, 4, 0, 0]} 
          barSize={40}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
        <Line 
          yAxisId="right" 
          type={CHART_LINE_TYPE}
          dataKey="tax" 
          name="TaxAmount" 
          stroke={COLORS.accent} 
          strokeWidth={3} 
          dot={{ r: 4, fill: COLORS.accent, strokeWidth: 2, stroke: "var(--panel)" }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer></ChartCanvas>
  );
}

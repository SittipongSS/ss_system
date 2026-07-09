"use client";
import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import { fmtMoney } from "@/lib/format";

// Colors mapped to our design system
const COLORS = {
  success: "#10b981", // var(--green)
  warning: "#f59e0b", // var(--amber)
  danger: "#ef4444",  // var(--red)
  info: "#3b82f6",    // var(--blue)
  neutral: "#9ca3af", // var(--text-3)
  accent: "#8b5cf6"   // var(--accent)
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
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-3)]">
        ไม่มีข้อมูล
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
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
        <RechartsTooltip 
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--bg-panel)" }}
          itemStyle={{ color: "var(--text-1)", fontWeight: 600 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OrdersComposedChart({ orders = [] }) {
  const data = useMemo(() => {
    // Group orders by status
    const grouped = {
      pending: { name: "รอรับเงิน", count: 0, tax: 0, color: COLORS.danger },
      received: { name: "รอยื่น", count: 0, tax: 0, color: COLORS.warning },
      filing: { name: "กำลังยื่น", count: 0, tax: 0, color: COLORS.info },
      complete: { name: "ชำระแล้ว", count: 0, tax: 0, color: COLORS.success },
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
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-3)]">
        ไม่มีข้อมูล
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
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
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--bg-panel)" }}
          formatter={(value, name) => {
            if (name === "TaxAmount") return [fmtMoney(value), "ยอดภาษี (฿)"];
            return [value, "จำนวนรายการ"];
          }}
          labelStyle={{ color: "var(--text-2)", marginBottom: 8 }}
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
          type="monotone" 
          dataKey="tax" 
          name="TaxAmount" 
          stroke={COLORS.accent} 
          strokeWidth={3} 
          dot={{ r: 4, fill: COLORS.accent, strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

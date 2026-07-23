"use client";
import { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { fcVsPoByMonth, unitMultiplier } from "@/lib/sahamit/dashboard";
import { fmtNumber, fmtMoneyCompact } from "@/lib/format";

// แท็บ "FC ซ้อน PO รายเดือน" — กราฟซ้อน: แท่ง PO ที่มาแล้ว + แท่ง FC ที่ยังรอ PO
// (ติดลบ = PO เกิน FC, สีแดง) + เส้น FC แต่ละรอบ. ต่อจาก peak engine (fcVsPoByMonth).
const ROUND_COLORS = ["var(--blue)", "var(--accent)", "var(--green)", "var(--violet)", "var(--amber)", "var(--teal)", "var(--text-3)"];
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const shortMonth = (ym) => {
  if (!ym) return "";
  const [y, m] = String(ym).split("-");
  return `${TH_M[parseInt(m, 10) - 1] || m} ${(parseInt(y, 10) + 543).toString().slice(-2)}`;
};

export default function FcVsPoView({ rounds, pos, coverages = [], products, unit = "qty", years = [] }) {
  const isValue = unit === "value";
  const fmtVal = (n) => (isValue ? fmtMoneyCompact(n) : fmtNumber(n));
  const axisFmt = (v) => (isValue ? (Math.abs(v) >= 1000 ? `฿${(v / 1000).toFixed(0)}k` : `฿${v}`) : (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v));
  const unitLbl = isValue ? "฿" : "ชิ้น";

  const mult = useMemo(() => unitMultiplier(products, unit), [products, unit]);
  const { data, rounds: roundMeta } = useMemo(() => fcVsPoByMonth(rounds, pos, coverages, { mult, years }), [rounds, pos, coverages, mult, years]);
  const roundColor = (i) => ROUND_COLORS[i % ROUND_COLORS.length];

  const nameMap = { PO: "PO (มาแล้ว)", waiting: "FC ที่รอ PO" };
  const tipFormatter = (v, n) => {
    if (v == null) return ["—", nameMap[n] || n];
    if (n === "waiting" && v < 0) return [`เกิน ${fmtVal(-v)}`, "PO เกิน FC"];
    return [fmtVal(v), nameMap[n] || (roundMeta.find((r) => r.key === n) ? `รอบ #${n.slice(1)}` : n)];
  };

  if (!data.length) {
    return <div className="glass-panel empty-state" style={{ padding: 40 }}>ไม่มีข้อมูล FC/PO ตามตัวกรองที่เลือก</div>;
  }

  return (
    <div className="glass-panel" style={{ padding: 20 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>FC ซ้อน PO รายเดือน ({unitLbl})</h3>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
          แท่ง = PO ที่มาแล้ว (เข้ม) + FC ที่ยังรอ PO (เทา) รวมกัน = FC ที่ commit ไว้ (peak) · แดง = PO เกิน FC · เส้น = FC แต่ละรอบมองเดือนนั้นไว้เท่าไร
        </div>
      </div>
      {/* legend สีแท่ง (นอกเหนือจากเส้นรอบที่ Legend ของ recharts จัดการ) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6, fontSize: 12, color: "var(--text-3)" }}>
        <Swatch color="var(--accent)" label="PO (มาแล้ว)" />
        <Swatch color="var(--panel-2)" label="FC ที่รอ PO" border />
        <Swatch color="var(--red)" label="PO เกิน FC" />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={8} />
          <YAxis tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={54} />
          <RTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13 }} labelFormatter={shortMonth} formatter={tipFormatter} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {/* แท่งซ้อน: PO ที่มาแล้ว + FC ที่ยังรอ = ความสูง FC ที่ commit (peak) */}
          <Bar dataKey="PO" stackId="fill" fill="var(--accent)" name="PO (มาแล้ว)" barSize={38} />
          <Bar dataKey="waiting" stackId="fill" name="FC ที่รอ PO" barSize={38} radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.waiting >= 0 ? "var(--panel-2)" : "var(--red)"} />)}
          </Bar>
          {/* เส้น FC แต่ละรอบ */}
          {roundMeta.map((r, i) => (
            <Line key={r.key} type="monotone" dataKey={r.key} name={`รอบ #${r.roundNo}`} stroke={roundColor(i)} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} strokeDasharray={i === 0 ? "5 3" : undefined} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Swatch({ color, label, border }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: 3, background: color, border: border ? "1px solid var(--border)" : "none" }} />
      {label}
    </span>
  );
}

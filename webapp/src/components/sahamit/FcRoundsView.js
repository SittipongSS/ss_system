"use client";
import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { fcEvolution, roundTotals, unitMultiplier } from "@/lib/sahamit/dashboard";
import { fmtNumber, fmtMoneyCompact, fmtDate } from "@/lib/format";

// แท็บ "FC แต่ละรอบ" — วิวัฒนาการ FC (เส้นละรอบ) + ยอดรวมต่อรอบ + %เปลี่ยนรอบต่อรอบ.
// รับ rounds ที่กรองสินค้าแล้ว (fg-filtered) + products (สำหรับราคา) + unit + years.
// ต่อจาก pure helpers ใน lib/sahamit/dashboard — ไม่มีตรรกะจับคู่ในนี้.

const ROUND_COLORS = ["var(--blue)", "var(--accent)", "var(--green)", "var(--violet)", "var(--amber)", "var(--teal)", "var(--red)", "var(--text-3)"];
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const shortMonth = (ym) => {
  if (!ym) return "";
  const [y, m] = String(ym).split("-");
  return `${TH_M[parseInt(m, 10) - 1] || m} ${(parseInt(y, 10) + 543).toString().slice(-2)}`;
};

export default function FcRoundsView({ rounds, products, unit = "qty", years = [] }) {
  const isValue = unit === "value";
  const fmtVal = (n) => (isValue ? fmtMoneyCompact(n) : fmtNumber(n));
  const axisFmt = (v) => (isValue ? (Math.abs(v) >= 1000 ? `฿${(v / 1000).toFixed(0)}k` : `฿${v}`) : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v));

  const mult = useMemo(() => unitMultiplier(products, unit), [products, unit]);
  const evo = useMemo(() => fcEvolution(rounds, { mult, years }), [rounds, mult, years]);
  const totals = useMemo(() => roundTotals(rounds, { mult, years }), [rounds, mult, years]);
  const unitLbl = isValue ? "฿" : "ชิ้น";

  const roundColor = (i) => ROUND_COLORS[i % ROUND_COLORS.length];
  const empty = !evo.data.length;

  const tip = (rows) => (rows ? { contentStyle: { borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13 } } : {});

  if (empty) {
    return <div className="glass-panel empty-state" style={{ padding: 40 }}>ไม่มีข้อมูล FC ตามตัวกรองที่เลือก</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* วิวัฒนาการ FC รายรอบ */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <div style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>วิวัฒนาการ FC แต่ละรอบ ต่อเดือนเป้าหมาย ({unitLbl})</h3>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>เส้นละรอบ · รอบใหม่ปรับขึ้น/ลง/เลื่อนเดือนได้ — เดือนที่รอบนั้นไม่ครอบจะเว้นเส้น</div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={evo.data} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={8} />
            <YAxis tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={54} />
            <RTooltip {...tip(true)} labelFormatter={shortMonth} formatter={(v, n) => [v == null ? "—" : fmtVal(v), n]} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {evo.rounds.map((r, i) => (
              <Line key={r.key} type="monotone" dataKey={r.key} name={`รอบ #${r.roundNo}`} stroke={roundColor(i)} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* ยอดรวมต่อรอบ */}
        <div className="glass-panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ยอดรวม FC แต่ละรอบ ({unitLbl})</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={totals} margin={{ top: 8, right: 10, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="roundNo" tickFormatter={(n) => `#${n}`} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={54} />
              <RTooltip {...tip(true)} labelFormatter={(n) => `รอบ #${n}`} formatter={(v) => [fmtVal(v), `ยอดรวม (${unitLbl})`]} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={54}>
                {totals.map((_, i) => <Cell key={i} fill={roundColor(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* การเปลี่ยนแปลงรอบต่อรอบ */}
        <div className="glass-panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>การเปลี่ยนแปลงรอบต่อรอบ</h3>
          <div>
            {totals.map((r, i) => (
              <div key={r.roundNo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: i < totals.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>รอบ #{r.roundNo}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>รับ {r.receivedDate ? fmtDate(r.receivedDate) : "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtVal(r.total)}</div>
                  {r.prevPct != null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: r.prevPct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {r.prevPct > 0 ? "+" : ""}{r.prevPct.toFixed(1)}% vs รอบก่อน
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

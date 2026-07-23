"use client";
import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Info } from "lucide-react";
import { poGrowth, unitMultiplier } from "@/lib/sahamit/dashboard";
import { fmtNumber, fmtMoneyCompact } from "@/lib/format";

// แท็บ "การเติบโต" — ยอด PO จริงต่อช่วง (เดือน/ไตรมาส/ปี) + %เติบโต. YoY เปิดเมื่อมี
// ข้อมูลปีก่อน (ตอนนี้ prod มีปีเดียว → โชว์หมายเหตุ). ต่อ pure helper poGrowth.
const LEVELS = [["month", "รายเดือน", "MoM"], ["quarter", "รายไตรมาส", "QoQ"], ["year", "รายปี", "YoY"]];
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmtPeriod = (p, level) => {
  if (level === "year") return `${Number(p) + 543}`;
  if (level === "quarter") { const [y, q] = String(p).split("-"); return `${q}/${(Number(y) + 543).toString().slice(-2)}`; }
  const [y, m] = String(p).split("-");
  return `${TH_M[parseInt(m, 10) - 1] || m} ${(Number(y) + 543).toString().slice(-2)}`;
};

export default function GrowthView({ pos, products, unit = "qty", years = [] }) {
  const [level, setLevel] = useState("month");
  const isValue = unit === "value";
  const unitLbl = isValue ? "฿" : "ชิ้น";
  const fmtVal = (n) => (isValue ? fmtMoneyCompact(n) : fmtNumber(n));
  const axisFmt = (v) => (isValue ? (Math.abs(v) >= 1000 ? `฿${(v / 1000).toFixed(0)}k` : `฿${v}`) : (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v));
  const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

  const mult = useMemo(() => unitMultiplier(products, unit), [products, unit]);
  const { rows, years: dataYears } = useMemo(() => poGrowth(pos, { level, mult, years }), [pos, level, mult, years]);
  const seqLabel = LEVELS.find((l) => l[0] === level)[2];
  const isYearLevel = level === "year";
  const showYoY = !isYearLevel && rows.some((r) => r.yoyGrowth != null);
  const singleYear = dataYears.length < 2;
  const latest = rows[rows.length - 1];

  const chartData = rows.map((r) => ({ ...r, label: fmtPeriod(r.period, level) }));

  return (
    <div className="flex flex-col gap-5">
      {/* ตัวเลือกระดับ */}
      <div style={{ display: "inline-flex", background: "var(--panel-2)", padding: 3, borderRadius: 9, gap: 2, width: "fit-content" }}>
        {LEVELS.map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setLevel(k)}
            style={{
              border: "none", cursor: "pointer", padding: "6px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              background: level === k ? "var(--bg)" : "transparent", color: level === k ? "var(--text)" : "var(--text-3)",
              boxShadow: level === k ? "0 1px 3px rgba(0,0,0,.12)" : "none",
            }}>{lbl}</button>
        ))}
      </div>

      {singleYear && (
        <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-2)" }}>
          <Info size={16} style={{ color: "var(--blue)" }} />
          ตอนนี้มีข้อมูลปี {dataYears.join(", ") || "—"} ปีเดียว — %เติบโตเทียบปีก่อน (YoY) และการเทียบปีทับกันจะเปิดเมื่อมีข้อมูลปีก่อนหน้า (backfill 2025 หรือเมื่อถึงปีถัดไป)
        </div>
      )}

      {!rows.length ? (
        <div className="glass-panel empty-state" style={{ padding: 40 }}>ไม่มี PO ตามตัวกรองที่เลือก</div>
      ) : (
        <>
          {/* การ์ดสรุป */}
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <Card label={`ยอดล่าสุด (${unitLbl})`} value={fmtVal(latest?.total)} sub={fmtPeriod(latest?.period, level)} accent="var(--accent)" />
            <Card label={`เติบโต ${seqLabel}`} value={pct(latest?.seqGrowth)} sub="เทียบช่วงก่อนหน้า" accent={latest?.seqGrowth >= 0 ? "var(--green)" : "var(--red)"} />
            {showYoY && <Card label="เติบโต YoY" value={pct(latest?.yoyGrowth)} sub="เทียบปีก่อน" accent={latest?.yoyGrowth >= 0 ? "var(--green)" : "var(--red)"} />}
            <Card label="จำนวนช่วง" value={fmtNumber(rows.length)} sub={LEVELS.find((l) => l[0] === level)[1]} accent="var(--text-3)" />
          </div>

          {/* กราฟ: แท่งยอด + เส้น %เติบโต */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>ยอด PO จริง {LEVELS.find((l) => l[0] === level)[1]} + %การเติบโต ({unitLbl})</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>แท่ง = ยอดสั่งจริงต่อช่วง (แกนซ้าย) · เส้น = %เติบโต {seqLabel}{showYoY ? " และ YoY" : ""} (แกนขวา)</div>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={8} />
                <YAxis yAxisId="l" tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={54} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={46} />
                <RTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13 }}
                  formatter={(v, n) => (n === "total" ? [fmtVal(v), `ยอด (${unitLbl})`] : [v == null ? "—" : `${v.toFixed(1)}%`, n])} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar yAxisId="l" dataKey="total" name={`ยอด (${unitLbl})`} fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={46} />
                <Line yAxisId="r" type="monotone" dataKey="seqGrowth" name={`%เติบโต ${seqLabel}`} stroke="var(--green)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                {showYoY && <Line yAxisId="r" type="monotone" dataKey="yoyGrowth" name="%เติบโต YoY" stroke="var(--amber)" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ตาราง */}
          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>ช่วง</th>
                  <th style={{ textAlign: "right" }}>ยอด ({unitLbl})</th>
                  <th style={{ textAlign: "right" }}>เปลี่ยนแปลง</th>
                  <th style={{ textAlign: "right" }}>%{seqLabel}</th>
                  {showYoY && <th style={{ textAlign: "right" }}>%YoY</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = i > 0 ? rows[i - 1].total : null;
                  const chg = prev == null ? null : r.total - prev;
                  return (
                    <tr key={r.period}>
                      <td style={{ fontWeight: 600 }}>{fmtPeriod(r.period, level)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtVal(r.total)}</td>
                      <td style={{ textAlign: "right", color: chg == null ? "var(--text-3)" : chg >= 0 ? "var(--green)" : "var(--red)" }}>
                        {chg == null ? "—" : `${chg > 0 ? "+" : ""}${fmtVal(chg)}`}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: r.seqGrowth == null ? "var(--text-3)" : r.seqGrowth >= 0 ? "var(--green)" : "var(--red)" }}>{pct(r.seqGrowth)}</td>
                      {showYoY && <td style={{ textAlign: "right", fontWeight: 700, color: r.yoyGrowth == null ? "var(--text-3)" : r.yoyGrowth >= 0 ? "var(--green)" : "var(--red)" }}>{pct(r.yoyGrowth)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub, accent }) {
  return (
    <div className="glass-panel ui-kpi-card" style={{ "--kpi-accent": accent }}>
      <div className="ui-kpi-heading"><span className="ui-kpi-label">{label}</span></div>
      <div className="ui-kpi-value-row"><div className="ui-kpi-value">{value}</div></div>
      <div className="ui-kpi-hint">{sub || " "}</div>
    </div>
  );
}

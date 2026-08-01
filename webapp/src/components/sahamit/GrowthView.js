"use client";
import { ChartCanvas } from "@/components/ui/ChartCard";
import { TableScroll } from "@/components/ui/Table";
import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { BarChart3, CalendarRange, History, Info, TrendingUp } from "lucide-react";
import UiKpiCard from "@/components/ui/KpiCard";
import { poGrowth, unitMultiplier } from "@/lib/sahamit/dashboard";
import { fmtNumber, fmtMoneyCompact } from "@/lib/format";
import { CHART_LINE_TYPE } from "@/lib/chartTheme";

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
      {/* ตัวเลือกระดับ — .segmented กลาง (สลับโหมด/กรอง) */}
      <div className="segmented" role="group" aria-label="ระดับการเติบโต" style={{ width: "fit-content" }}>
        {LEVELS.map(([k, lbl]) => (
          <button key={k} type="button" className={level === k ? "active" : ""} aria-pressed={level === k} onClick={() => setLevel(k)}>{lbl}</button>
        ))}
      </div>

      {singleYear && (
        <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", display: "flex", gap: 8, alignItems: "center", fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
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
            <UiKpiCard icon={BarChart3} label={`ยอดล่าสุด (${unitLbl})`} value={fmtVal(latest?.total)} hint={fmtPeriod(latest?.period, level)} color="var(--accent)" />
            <UiKpiCard icon={TrendingUp} label={`เติบโต ${seqLabel}`} value={pct(latest?.seqGrowth)} hint="เทียบช่วงก่อนหน้า" color={latest?.seqGrowth >= 0 ? "var(--green)" : "var(--red)"} />
            {showYoY && <UiKpiCard icon={History} label="เติบโต YoY" value={pct(latest?.yoyGrowth)} hint="เทียบปีก่อน" color={latest?.yoyGrowth >= 0 ? "var(--green)" : "var(--red)"} />}
            <UiKpiCard icon={CalendarRange} label="จำนวนช่วง" value={fmtNumber(rows.length)} hint={LEVELS.find((l) => l[0] === level)[1]} color="var(--text-3)" />
          </div>

          {/* กราฟ: แท่งยอด + เส้น %เติบโต */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: "var(--fs-9)", fontWeight: "var(--fw-semibold)", marginBottom: 2 }}>ยอด PO จริง {LEVELS.find((l) => l[0] === level)[1]} + %การเติบโต ({unitLbl})</h3>
            <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", marginBottom: 8 }}>แท่ง = ยอดสั่งจริงต่อช่วง (แกนซ้าย) · เส้น = %เติบโต {seqLabel}{showYoY ? " และ YoY" : ""} (แกนขวา)</div>
            <ChartCanvas><ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: "var(--fs-5)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} dy={8} />
                <YAxis yAxisId="l" tickFormatter={axisFmt} tick={{ fontSize: "var(--fs-5)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={54} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: "var(--fs-5)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={46} />
                <RTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-7)" }}
                  formatter={(v, n) => (n === "total" ? [fmtVal(v), `ยอด (${unitLbl})`] : [v == null ? "—" : `${v.toFixed(1)}%`, n])} />
                <Legend wrapperStyle={{ fontSize: "var(--fs-7)" }} />
                <Bar yAxisId="l" dataKey="total" name={`ยอด (${unitLbl})`} fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={46} />
                <Line yAxisId="r" type={CHART_LINE_TYPE} dataKey="seqGrowth" name={`%เติบโต ${seqLabel}`} stroke="var(--green)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                {showYoY && <Line yAxisId="r" type={CHART_LINE_TYPE} dataKey="yoyGrowth" name="%เติบโต YoY" stroke="var(--amber)" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer></ChartCanvas>
          </div>

          {/* ตาราง */}
          <TableScroll family="matrix" style={{ overflowX: "auto" }}>
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
                      <td style={{ fontWeight: "var(--fw-semibold)" }}>{fmtPeriod(r.period, level)}</td>
                      <td style={{ textAlign: "right", fontWeight: "var(--fw-bold)" }}>{fmtVal(r.total)}</td>
                      <td style={{ textAlign: "right", color: chg == null ? "var(--text-3)" : chg >= 0 ? "var(--green)" : "var(--red)" }}>
                        {chg == null ? "—" : `${chg > 0 ? "+" : ""}${fmtVal(chg)}`}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: r.seqGrowth == null ? "var(--text-3)" : r.seqGrowth >= 0 ? "var(--green)" : "var(--red)" }}>{pct(r.seqGrowth)}</td>
                      {showYoY && <td style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: r.yoyGrowth == null ? "var(--text-3)" : r.yoyGrowth >= 0 ? "var(--green)" : "var(--red)" }}>{pct(r.yoyGrowth)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </div>
  );
}

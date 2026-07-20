"use client";

import { Fragment } from "react";
import { Users } from "lucide-react";
import { money, pctFmt } from "./shared";

// สรุปรายคน / รายทีม — ใครปิดเป้าได้ ใครมียอดทบ (ระดับทั้งปี + YTD).
// ยอดทบสะสม = Actual YTD − Target YTD (ติดลบ = ต้องทบเข้าเดือนถัดไป)
// ต้องทำ/เดือน = เฉลี่ยต่อเดือนที่เหลือเพื่อปิดเป้าทั้งปี · คลิกแถวเพื่อเจาะคน/ทีมนั้น.

const sumTo = (arr, n) => arr.slice(0, n).reduce((a, b) => a + Number(b || 0), 0);

function summarize(row, { ytdCount, lastYearActual }) {
  const targetYear = sumTo(row.target, 12);
  const fcTotalYear = sumTo(row.fcTotal || [], 12);
  const forecastYear = sumTo(row.forecast, 12);
  const actualYtd = sumTo(row.actual, ytdCount);
  const targetYtd = sumTo(row.target, ytdCount);
  const gap = actualYtd - targetYtd;
  const achv = targetYtd > 0 ? (actualYtd / targetYtd) * 100 : null;
  const remain = 12 - ytdCount;
  const needPerMonth = remain > 0 ? Math.max(0, targetYear - actualYtd) / remain : null;
  const lastYtd = lastYearActual ? sumTo(lastYearActual, ytdCount) : 0;
  const yoy = lastYtd > 0 ? (actualYtd / lastYtd - 1) * 100 : null;
  return { targetYear, fcTotalYear, forecastYear, actualYtd, targetYtd, gap, achv, needPerMonth, yoy };
}

function SummaryRow({ label, sublabel, s, tone, onClick }) {
  const hasTarget = s.targetYear > 0;
  const isTotal = tone === "total";
  const cellClass = (base = "") => `${base}${isTotal ? " fz-foot" : ""}`.trim();
  return (
    <tr
      className="premium-row"
      style={{ cursor: onClick ? "pointer" : "default", ...(tone === "team" ? { background: "color-mix(in srgb, var(--accent) 6%, transparent)", fontWeight: 600 } : tone === "total" ? { background: "var(--panel-2)", fontWeight: 700, borderTop: "2px solid var(--border)" } : {}) }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? "คลิกเพื่อเจาะรายละเอียด" : undefined}
    >
      <td className={cellClass("fz-c1")} style={{ whiteSpace: "nowrap" }}>
        <strong>{label}</strong>
        {sublabel && <span style={{ display: "block", color: "var(--text-3)", fontSize: 11.5, fontWeight: 400 }}>{sublabel}</span>}
      </td>
      <td className={cellClass("num mono")}>{money(s.targetYear)}</td>
      <td className={cellClass("num mono")} style={{ color: "var(--blue)" }}>{money(s.fcTotalYear)}</td>
      <td className={cellClass("num mono")} style={{ color: "var(--amber)" }}>{money(s.forecastYear)}</td>
      <td className={cellClass("num mono")} style={{ color: "var(--green)", fontWeight: 600 }}>{money(s.actualYtd)}</td>
      <td className={cellClass("num")} style={{ minWidth: 110 }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{pctFmt(s.achv)}</span>
        {hasTarget && (
          <span style={{ display: "block", height: 5, borderRadius: 3, background: "var(--panel-2)", overflow: "hidden", marginTop: 4 }}>
            <i style={{ display: "block", height: "100%", width: `${Math.min(100, s.achv || 0)}%`, background: (s.achv || 0) >= 100 ? "var(--green)" : (s.achv || 0) >= 70 ? "var(--amber)" : "var(--red)", borderRadius: 3 }} />
          </span>
        )}
      </td>
      <td className={cellClass("num mono")} style={{ color: s.gap >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
        {hasTarget || s.actualYtd > 0 ? `${s.gap >= 0 ? "+" : ""}${money(s.gap)}` : "–"}
      </td>
      <td className={cellClass("num mono")}>{s.needPerMonth == null ? "—" : s.needPerMonth === 0 ? "ปิดแล้ว ✓" : money(s.needPerMonth)}</td>
      <td className={cellClass("num mono")} style={{ color: s.yoy == null ? "var(--text-3)" : s.yoy >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
        {s.yoy == null ? "–" : `${s.yoy >= 0 ? "+" : ""}${s.yoy.toFixed(1)}%`}
      </td>
      <td className={cellClass()}>
        {!hasTarget && s.actualYtd <= 0 ? (
          <span style={{ color: "var(--text-3)" }}>–</span>
        ) : s.gap >= 0 ? (
          <span className="ui-badge" style={{ color: "var(--green)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}>✓ ตามแผน</span>
        ) : (
          <span className="ui-badge" style={{ color: "var(--red)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}>ทบ {money(-s.gap)}</span>
        )}
      </td>
    </tr>
  );
}

export default function SummaryTable({ matrix, prevMatrix, year, ytdCount, carry, onDrill }) {
  const opts = (lastYearActual) => ({ ytdCount, lastYearActual });
  const gapHead = carry ? "ยอดทบสะสม" : "ผลต่างสะสม";

  // ตาข่ายกันคนหาย: byTeam ฝั่ง server ตัดถังทีม null ทิ้ง — คนที่ทีมไม่ตรงกับ
  // กลุ่มทีมไหนเลย (ไม่มีทีมในบัญชี / แถว legacy ไม่ระบุทีม) เดิมถูก filter ราย
  // กลุ่มเงียบ ๆ ทั้งที่อยู่ใน matrix.people ครบ → เก็บมาโชว์เป็นกลุ่มท้ายตาราง
  const teamNames = new Set(matrix.teams.map((t) => t.team));
  const orphans = matrix.people.filter((p) => !teamNames.has(p.team || "ไม่ระบุทีม"));
  const orphanTotal = orphans.length
    ? orphans.reduce((acc, p) => {
      for (let i = 0; i < 12; i += 1) {
        acc.target[i] += Number(p.target[i] || 0);
        acc.fcTotal[i] += Number(p.fcTotal?.[i] || 0);
        acc.forecast[i] += Number(p.forecast[i] || 0);
        acc.actual[i] += Number(p.actual[i] || 0);
      }
      return acc;
    }, { target: Array(12).fill(0), fcTotal: Array(12).fill(0), forecast: Array(12).fill(0), actual: Array(12).fill(0) })
    : null;

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
        <Users size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>สรุปรายคน / รายทีม — ใครปิดเป้าได้ ใครมียอดทบ</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-3)", fontSize: 12.5 }}>
        Actual = YTD · {gapHead} = Actual YTD − Target YTD (ติดลบ = ต้องทบเข้าเดือนถัดไป) · ต้องทำ/เดือน = เฉลี่ยที่เหลือเพื่อปิดเป้าทั้งปี · คลิกแถวเพื่อเจาะ
      </p>
      <div className="fz-box premium-glass-table performance-summary-table">
        <table className="fz-table w-full text-sm" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th className="fz-c1">พนักงาน / ทีม</th>
              <th className="num">Target ทั้งปี</th>
              <th className="num">FC Total ทั้งปี</th>
              <th className="num">FC คงเหลือ</th>
              <th className="num">Actual YTD</th>
              <th className="num">% Achv (YTD)</th>
              <th className="num">{gapHead}</th>
              <th className="num">ต้องทำ/เดือน</th>
              <th className="num">YoY</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {matrix.teams.map((t) => {
              const prevTeam = prevMatrix.teams.find((x) => x.team === t.team);
              const people = matrix.people.filter((p) => (p.team || "ไม่ระบุทีม") === t.team);
              return (
                <Fragment key={t.team}>
                  <SummaryRow
                    label={`ทีม ${t.team}`}
                    s={summarize(t, opts(prevTeam?.actual || null))}
                    tone="team"
                    onClick={() => onDrill({ scope: "team", team: t.team })}
                  />
                  {people.map((p) => {
                    const prevP = prevMatrix.people.find((x) => x.id === p.id);
                    return (
                      <SummaryRow
                        key={p.id}
                        label={p.name}
                        sublabel={p.team}
                        s={summarize(p, opts(prevP?.actual || null))}
                        onClick={() => onDrill({ scope: "person", person: p.id })}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
            {orphanTotal && (
              <Fragment key="__orphans__">
                <SummaryRow label="ไม่ระบุทีม" s={summarize(orphanTotal, opts(null))} tone="team" />
                {orphans.map((p) => {
                  const prevP = prevMatrix.people.find((x) => x.id === p.id);
                  return (
                    <SummaryRow
                      key={p.id}
                      label={p.name}
                      sublabel={p.team || "ไม่ระบุทีม"}
                      s={summarize(p, opts(prevP?.actual || null))}
                      onClick={() => onDrill({ scope: "person", person: p.id })}
                    />
                  );
                })}
              </Fragment>
            )}
          </tbody>
          <tfoot>
            <SummaryRow label="รวมทั้งบริษัท" s={summarize(matrix.company, opts(prevMatrix.company?.actual || null))} tone="total" />
          </tfoot>
        </table>
      </div>
    </section>
  );
}

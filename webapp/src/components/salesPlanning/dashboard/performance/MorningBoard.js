"use client";
import { TableScroll } from "@/components/ui/Table";

import { Fragment, useMemo } from "react";
import { Sun } from "lucide-react";
import { windowStat, yearSummary } from "@/lib/sales/performanceMath";
import { closedThroughLabel, money, pctFmt, periodLabel, ProgressBar } from "./shared";

// ☀️ บอร์ดประชุมเช้า — ทุกคน ทุกทีม ในตารางเดียว ตามยอดของงวดที่เลือก.
// "ต้องปิด" = เป้างวด + ยอดทบยกมา (ปิดโหมดทบ = เป้าปกติ คอลัมน์ทบหาย).
// คลิกชื่อ → เจาะรายละเอียดคน/ทีมนั้นด้านล่าง · คลิกยอด Actual → รายดีลที่ประกอบยอด.
//
// 🔗 **ตารางเดียวของแท็บนี้** (รวมกับ "สรุปรายคน/รายทีม" ที่ลบทิ้งแล้ว 2026-08-12) —
// ของเดิมเป็นสองตารางแถวเดียวกัน คอลัมน์ซ้ำกัน 6 จาก 9 ต่างกันแค่ตารางล่างล็อกงวด
// "ทั้งปี" ไว้ตายตัว · กดสวิตช์งวดเป็น "ปี" ที่นี่ได้ผลเท่ากัน จึงย้าย 3 คอลัมน์ที่มี
// เฉพาะตารางล่าง (ต้องทำ/เดือน · YoY · สถานะ) เข้ามาโผล่เฉพาะโหมดปี
//
// ⚠️ **สองนิยามของ "ขาด" อยู่ในแถวเดียวกัน** อย่าเอามารวมเป็นคอลัมน์เดียว:
// · "ขาด / เกิน" = Actual − เป้า**ทั้งงวด** (โหมดปี = เป้าทั้ง 12 เดือน) — เหลืออีกเท่าไรถึงปิดปี
// · "สถานะ" = Actual YTD − Target **YTD** — ตอนนี้ตามแผนอยู่ไหม (เดือนที่ยังไม่ถึงไม่นับ)
// ปี 2026 ณ ส.ค. ต่างกันราว 56 ล้าน — ป้ายกำกับคือสิ่งเดียวที่กันคนอ่านสลับกัน

/* `now` มากับ {...common} แต่บอร์ดนี้ไม่ได้ใช้แล้ว — เคยใช้ตัวเดียวคือหา periodKind
   ให้คอลัมน์สถานะ ซึ่งถอดออกไปแล้ว (มติผู้ใช้ 2026-08-03) จึงไม่รับไว้ในลายเซ็น
   งวด (`win`) ก็มาจากแถบคุมด้านบนแล้ว ไม่ได้คำนวณเองจาก `bp` อีก (2026-08-12) */
export default function MorningBoard({ matrix, prevMatrix, year, closedCount, ytdCount, carry, win, onDrill, onDealDrill }) {
  const kind = win.kind;

  const opts = { startIdx: win.startIdx, endIdx: win.endIdx, carryOn: carry, closedCount };
  const statOf = (row) => windowStat(row, opts);
  // คอลัมน์ ต้องทำ/เดือน · YoY · สถานะ เป็นตัวเลขระดับปี — งวดเล็กกว่าปีไม่มีความหมาย
  const isYear = kind === "year";
  // สามคอลัมน์นั้นเทียบเฉพาะเดือนที่จบแล้ว ป้ายหัวคอลัมน์ต้องบอกฐานให้ชัด
  const through = closedThroughLabel(closedCount);

  /* จัดคนตามทีม (matrix.people เรียง KA→ODM→SV มาแล้ว)
     คีย์กลุ่มมาจาก **สองทาง** รวมกัน: ทีมที่มีคน + ทีมที่มีแถวเป้าระดับทีม —
     ทีมที่ตั้งเป้าไว้แต่ยังไม่มีคน (คนย้ายออกหมด/ทีมเปิดใหม่) เดิมหายทั้งแถว
     เพราะวนจากรายคนอย่างเดียว · ส่วนคนที่ทีมไม่ตรงกับทีมไหนเลยได้กลุ่มของตัวเอง
     ที่ไม่มีแถวหัวทีม (ตาข่ายกันคนหายที่ยกมาจากตารางสรุปเดิม) */
  const grouped = useMemo(() => {
    const g = new Map();
    for (const p of matrix.people) {
      const key = p.team || "ไม่ระบุทีม";
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(p);
    }
    for (const t of matrix.teams) if (!g.has(t.team)) g.set(t.team, []);
    return g;
  }, [matrix.people, matrix.teams]);

  const teamRow = (team) => matrix.teams.find((t) => t.team === team);

  // Actual ปีก่อนของแถวเดียวกัน — ฐานของ YoY (ไม่มีฐาน = คอลัมน์แสดง "–")
  const lastYearActualOf = (row, isTeam, isTotal) => {
    if (isTotal) return prevMatrix?.company?.actual || null;
    if (isTeam) return prevMatrix?.teams.find((x) => x.team === row.team)?.actual || null;
    return prevMatrix?.people.find((x) => x.id === row.id)?.actual || null;
  };

  // เดือนที่ส่งให้ modal รายดีล: งวดเดือน = เดือนนั้น, งวดใหญ่กว่า = ทั้งปี (กรองปีแทน)
  const dealMonth = kind === "month" ? `${year}-${String(win.startIdx + 1).padStart(2, "0")}` : null;
  const openMetricDeals = (row, isTeam, metric) =>
    onDealDrill?.({
      month: dealMonth,
      year: String(year),
      ownerId: row.id !== "company" && !isTeam && row.id && !String(row.id).includes(":") ? row.id : null,
      ownerName: row.id !== "company" && !isTeam ? row.name : null,
      team: isTeam ? row.team : row.team || null,
      metric,
      label: row.id === "company" ? "รวมทั้งบริษัท" : isTeam ? `ทีม ${row.team}` : row.name,
    });

  const Row = ({ row, isTeam = false, isTotal = false }) => {
    const s = statOf(row);
    const y = isYear ? yearSummary(row, { closedCount, ytdCount, lastYearActual: lastYearActualOf(row, isTeam, isTotal) }) : null;
    const label = isTotal ? "รวมทั้งบริษัท" : isTeam ? `ทีม ${row.team}` : row.name;
    const clickable = !isTotal;
    const cellClass = (base = "") => `${base}${isTotal ? " fz-foot" : ""}`.trim();
    const metricButton = (value, metric, color, metricLabel) => value > 0 ? (
      <button
        type="button"
        className="table-metric-button mono"
        style={{ color }}
        onClick={() => openMetricDeals(row, isTeam, metric)}
        aria-label={`ดูรายละเอียด ${metricLabel} ${label} ${money(value)}`}
      >
        {money(value)}
      </button>
    ) : <span className="mono" style={{ color }}>{money(value)}</span>;
    return (
      <tr
        className="premium-row"
        style={isTotal
          ? { background: "var(--panel-2)", fontWeight: "var(--fw-bold)", borderTop: "2px solid var(--border)" }
          : isTeam
            ? { background: "color-mix(in srgb, var(--accent) 6%, transparent)", fontWeight: "var(--fw-semibold)" }
            : undefined}
      >
        <td className={cellClass("fz-c1")} style={{ whiteSpace: "nowrap" }}>
          {clickable ? (
            <button
              type="button"
              className="table-row-link"
              onClick={() => onDrill(isTeam ? { scope: "team", team: row.team } : { scope: "person", person: row.id })}
              aria-label={`เจาะรายละเอียด ${label}`}
            >
              {label}
            </button>
          ) : <strong>{label}</strong>}
          {!isTeam && !isTotal && row.team && (
            <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-4)", fontWeight: "var(--fw-normal)" }}>{row.team}</span>
          )}
        </td>
        <td className={cellClass("num mono")}>{money(s.target)}</td>
        {carry && <td className={cellClass("num mono")} style={{ color: s.carry > 0 ? "var(--red)" : "var(--text-3)" }}>{s.carry > 0 ? money(s.carry) : "—"}</td>}
        {carry && <td className={cellClass("num mono")} style={{ fontWeight: "var(--fw-semibold)" }}>{money(s.mustClose)}</td>}
        <td className={cellClass("num")}>{metricButton(s.fcTotal, "fcTotal", "var(--blue)", "FC Total")}</td>
        <td className={cellClass("num")}>{metricButton(s.forecast, "remaining", "var(--amber)", "FC คงเหลือ")}</td>
        <td className={cellClass("num")} style={{ fontWeight: "var(--fw-semibold)" }}>{metricButton(s.actual, "won", "var(--green)", "Actual")}</td>
        <td className={cellClass("num mono")} style={{ color: s.diff >= 0 ? "var(--green)" : "var(--red)" }}>
          {s.diff >= 0 ? "+" : ""}{money(s.diff)}
        </td>
        <td className={cellClass()} style={{ minWidth: 150 }}>
          <div className="flex items-center gap-2">
            <ProgressBar stat={s} />
            <span className="mono" style={{ fontSize: "var(--fs-5)", fontWeight: "var(--fw-semibold)", color: "var(--text-2)" }}>
              {s.pct == null ? "–" : `${Math.round(s.pct)}%`}
            </span>
          </div>
        </td>
        {y && <td className={cellClass("num mono")}>{y.needPerMonth == null ? "—" : y.needPerMonth === 0 ? "ปิดแล้ว ✓" : money(y.needPerMonth)}</td>}
        {y && (
          <td
            className={cellClass("num mono")}
            style={{ color: y.yoy == null ? "var(--text-3)" : y.yoy >= 0 ? "var(--green)" : "var(--red)", fontWeight: "var(--fw-semibold)" }}
          >
            {y.yoy == null ? "–" : `${y.yoy >= 0 ? "+" : ""}${y.yoy.toFixed(1)}%`}
          </td>
        )}
        {y && (
          <td className={cellClass()}>
            {y.targetYear <= 0 && y.actualYtd <= 0 ? (
              <span style={{ color: "var(--text-3)" }}>–</span>
            ) : y.gap >= 0 ? (
              <span className="ui-badge" style={{ color: "var(--green)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}>
                ✓ ตามแผน {pctFmt(y.achv)}
              </span>
            ) : (
              <span className="ui-badge" style={{ color: "var(--red)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}>
                {carry ? "ทบ" : "ขาด"} {money(-y.gap)}
              </span>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
        <Sun size={17} aria-hidden="true" style={{ color: "var(--amber)" }} />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ตารางติดตามยอดขาย — {periodLabel(win)}</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-3)", fontSize: "var(--fs-6)" }}>
        สรุป Target, FC Total, FC คงเหลือ และ Actual รายคน/รายทีม
        {carry ? ' · "ต้องปิด" = เป้า + ยอดทบยกมา' : " · โหมดเป้าปกติ (ไม่ทบยอด)"}
        {" "}· แถบ: เขียว = Actual · ส้ม = FC คงเหลือ · ขีดเข้ม = {carry ? "ต้องปิด" : "เป้า"} · คลิกตัวเลขเพื่อดูรายการดีล
        {isYear && ` · "ขาด / เกิน" เทียบเป้าทั้ง 12 เดือน ส่วน "สถานะ" เทียบเป้าเฉพาะเดือนที่จบแล้ว (${through}) — เดือนที่กำลังวิ่งไม่นับ`}
      </p>

      <div className="fz-box premium-glass-table performance-tracking-table" style={{ "--fz-c1w": "150px" }}>
        {/* พื้นล่างของความกว้าง — วัดจาก min-content จริงหลังถอดคอลัมน์สถานะแล้วเผื่อขึ้น
            เล็กน้อยกันหัวตารางไทยโดนบีบ: 7 คอลัมน์ = 858px · 9 คอลัมน์ (โหมดทบ) = 1026px
            โหมดปีเพิ่มอีก 3 คอลัมน์ (ต้องทำ/เดือน · YoY · สถานะ) ≈ +360px
            ⚠️ เลขนี้ไม่ใช่ค่าประดับ — ต่ำกว่านี้คอลัมน์จะเบียดจนตัวเลขตกบรรทัด */}
        <TableScroll surface="embedded" family="matrix"><table className="fz-table w-full text-sm" style={{ minWidth: (carry ? 1040 : 880) + (isYear ? 360 : 0) }}>
          <thead>
            <tr>
              <th className="fz-c1">พนักงาน / ทีม</th>
              <th className="num">Target</th>
              {carry && <th className="num">ทบยกมา</th>}
              {carry && <th className="num">ต้องปิด</th>}
              <th className="num">FC Total</th>
              <th className="num">FC คงเหลือ</th>
              <th className="num">Actual</th>
              <th className="num">ขาด / เกิน{isYear ? " (ทั้งปี)" : ""}</th>
              <th>% ปิดได้{carry ? " (เทียบต้องปิด)" : ""}</th>
              {isYear && <th className="num">ต้องทำ/เดือน</th>}
              {isYear && <th className="num">YoY ({through})</th>}
              {isYear && <th>สถานะ ({through})</th>}
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([team, people]) => {
              const t = teamRow(team);
              return (
                <Fragment key={team}>
                  {t && <Row row={t} isTeam />}
                  {people.map((p) => <Row key={p.id} row={p} />)}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <Row row={{ ...matrix.company, id: "company" }} isTotal />
          </tfoot>
        </table></TableScroll>
      </div>
    </section>
  );
}

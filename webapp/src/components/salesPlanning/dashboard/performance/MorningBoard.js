"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight, Sun } from "lucide-react";
import Select from "@/components/ui/Select";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { windowStat, windowForPeriod, prevPeriod, nextPeriod, periodKindOf } from "@/lib/sales/performanceMath";
import { money, StatusPill, ProgressBar } from "./shared";

// ☀️ บอร์ดประชุมเช้า — ทุกคน ทุกทีม ในตารางเดียว ตามยอดของงวดที่เลือก.
// "ต้องปิด" = เป้างวด + ยอดทบยกมา (ปิดโหมดทบ = เป้าปกติ คอลัมน์ทบหาย).
// คลิกชื่อ → เจาะรายละเอียดคน/ทีมนั้นด้านล่าง · คลิกยอด Actual → รายดีลที่ประกอบยอด.

const KINDS = [
  { key: "month", label: "เดือน" },
  { key: "quarter", label: "ไตรมาส" },
  { key: "year", label: "ปี" },
];

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

function periodLabel(win) {
  if (!win) return "";
  if (win.kind === "year") return `ปี ${win.year}`;
  if (win.kind === "quarter") return `${QUARTER_LABELS[win.startIdx / 3]} ${win.year}`;
  return `${MONTH_LABELS[win.startIdx]} ${win.year}`;
}

// สลับชนิดงวดโดยคงตำแหน่งเวลาเดิม (เดือน→ไตรมาสของเดือนนั้น ฯลฯ)
function toKind(bp, kind) {
  const w = windowForPeriod(bp);
  if (!w) return bp;
  if (kind === "year") return String(w.year);
  if (kind === "quarter") return `${w.year}-Q${Math.floor(w.startIdx / 3) + 1}`;
  return `${w.year}-${String(w.startIdx + 1).padStart(2, "0")}`;
}

function periodOptions(kind, year) {
  if (kind === "year") return [{ value: String(year), label: `ปี ${year}` }];
  if (kind === "quarter") {
    return QUARTER_LABELS.map((q, i) => ({ value: `${year}-Q${i + 1}`, label: `${q} ${year}` }));
  }
  return MONTH_LABELS.map((m, i) => ({ value: `${year}-${String(i + 1).padStart(2, "0")}`, label: `${m} ${year}` }));
}

export default function MorningBoard({ matrix, year, now, closedCount, carry, bp, onBpChange, onDrill, onDealDrill }) {
  // งวดต้องอยู่ในปีที่ดูเสมอ (ข้อมูล matrix เป็นรายปี) — ถ้าหลุด (เช่นเปลี่ยนปี) ดึงกลับ
  const win = useMemo(() => {
    const w = windowForPeriod(bp);
    return w && w.year === year ? w : windowForPeriod(String(year));
  }, [bp, year]);
  const kind = win.kind;
  const periodKind = periodKindOf(win, now);

  const prev = prevPeriod(bp);
  const next = nextPeriod(bp);
  const canPrev = windowForPeriod(prev)?.year === year;
  const canNext = windowForPeriod(next)?.year === year;

  const opts = { startIdx: win.startIdx, endIdx: win.endIdx, carryOn: carry, closedCount };
  const statOf = (row) => windowStat(row, opts);

  // จัดคนตามทีม (matrix.people เรียง KA→ODM→SV มาแล้ว)
  const grouped = useMemo(() => {
    const g = new Map();
    for (const p of matrix.people) {
      const key = p.team || "ไม่ระบุทีม";
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(p);
    }
    return g;
  }, [matrix.people]);

  const teamRow = (team) => matrix.teams.find((t) => t.team === team);

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
          ? { background: "var(--panel-2)", fontWeight: 700, borderTop: "2px solid var(--border)" }
          : isTeam
            ? { background: "color-mix(in srgb, var(--accent) 6%, transparent)", fontWeight: 600 }
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
            <span style={{ display: "block", color: "var(--text-3)", fontSize: 11.5, fontWeight: 400 }}>{row.team}</span>
          )}
        </td>
        <td className={cellClass("num mono")}>{money(s.target)}</td>
        {carry && <td className={cellClass("num mono")} style={{ color: s.carry > 0 ? "var(--red)" : "var(--text-3)" }}>{s.carry > 0 ? money(s.carry) : "—"}</td>}
        {carry && <td className={cellClass("num mono")} style={{ fontWeight: 600 }}>{money(s.mustClose)}</td>}
        <td className={cellClass("num")}>{metricButton(s.fcTotal, "fcTotal", "var(--blue)", "FC Total")}</td>
        <td className={cellClass("num")}>{metricButton(s.forecast, "remaining", "var(--amber)", "FC คงเหลือ")}</td>
        <td className={cellClass("num")} style={{ fontWeight: 600 }}>{metricButton(s.actual, "won", "var(--green)", "Actual")}</td>
        <td className={cellClass("num mono")} style={{ color: s.diff >= 0 ? "var(--green)" : "var(--red)" }}>
          {s.diff >= 0 ? "+" : ""}{money(s.diff)}
        </td>
        <td className={cellClass()} style={{ minWidth: 150 }}>
          <div className="flex items-center gap-2">
            <ProgressBar stat={s} />
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
              {s.pct == null ? "–" : `${Math.round(s.pct)}%`}
            </span>
          </div>
        </td>
        <td className={cellClass()}><StatusPill stat={s} periodKind={periodKind} /></td>
      </tr>
    );
  };

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
        <Sun size={17} aria-hidden="true" style={{ color: "var(--amber)" }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ตารางติดตามยอดขาย — {periodLabel(win)}</h2>
        <div className="spacer" />
        <div className="segmented" role="group" aria-label="ชนิดงวด">
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? "active" : ""} onClick={() => onBpChange(toKind(bp, k.key))}>
              {k.label}
            </button>
          ))}
        </div>
        {kind !== "year" && (
          <div className="flex items-center" style={{ gap: 4 }}>
            <button type="button" className="btn ghost sm icon-only" disabled={!canPrev} onClick={() => onBpChange(prev)} aria-label="งวดก่อนหน้า">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <Select className="premium-select" value={bp} onChange={(e) => onBpChange(e.target.value)} aria-label="เลือกงวด" style={{ width: 130 }}>
              {periodOptions(kind, year).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <button type="button" className="btn ghost sm icon-only" disabled={!canNext} onClick={() => onBpChange(next)} aria-label="งวดถัดไป">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-3)", fontSize: 12.5 }}>
        สรุป Target, FC Total, FC คงเหลือ และ Actual รายคน/รายทีม
        {carry ? ' · "ต้องปิด" = เป้า + ยอดทบยกมา' : " · โหมดเป้าปกติ (ไม่ทบยอด)"}
        {" "}· แถบ: เขียว = Actual · ส้ม = FC คงเหลือ · ขีดเข้ม = {carry ? "ต้องปิด" : "เป้า"} · คลิกตัวเลขเพื่อดูรายการดีล
      </p>

      <div className="fz-box premium-glass-table performance-tracking-table" style={{ "--fz-c1w": "150px" }}>
        <table className="fz-table w-full text-sm" style={{ minWidth: carry ? 1120 : 980 }}>
          <thead>
            <tr>
              <th className="fz-c1">พนักงาน / ทีม</th>
              <th className="num">Target</th>
              {carry && <th className="num">ทบยกมา</th>}
              {carry && <th className="num">ต้องปิด</th>}
              <th className="num">FC Total</th>
              <th className="num">FC คงเหลือ</th>
              <th className="num">Actual</th>
              <th className="num">ขาด / เกิน</th>
              <th>% ปิดได้{carry ? " (เทียบต้องปิด)" : ""}</th>
              <th>สถานะ</th>
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
        </table>
      </div>
    </section>
  );
}

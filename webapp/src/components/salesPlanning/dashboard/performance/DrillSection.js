"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import Select from "@/components/ui/Select";
import PerformanceKpiCards from "./PerformanceKpiCards";
import PerformanceCharts from "./PerformanceCharts";
import CarryPanel from "./CarryPanel";
import SummaryTable from "./SummaryTable";

// 🔍 เจาะรายละเอียด — เลือกมุมมอง (บริษัท/ทีม/คน) + ช่วงเวลา แล้วขับการ์ด KPI,
// กราฟทุกตัว, แผงทบยอด และตารางสรุปด้านล่างพร้อมกัน.

const SCOPES = [
  { key: "company", label: "รวมทั้งบริษัท" },
  { key: "team", label: "รายทีม" },
  { key: "person", label: "รายคน" },
];
const PERIODS = [
  { key: "month", label: "รายเดือน" },
  { key: "quarter", label: "รายไตรมาส" },
  { key: "year", label: "รายปี" },
];

const BLANK = { target: Array(12).fill(0), fcTotal: Array(12).fill(0), forecast: Array(12).fill(0), actual: Array(12).fill(0) };

export default function DrillSection({ matrix, prevMatrix, year, now, closedCount, ytdCount, carry, scope, team, person, period, onChange, onDrill }) {
  // แถวข้อมูลของมุมมองที่เลือก + Actual ปีก่อนของมุมมองเดียวกัน (ถ้ามี)
  const active = useMemo(() => {
    if (scope === "person") {
      const p = matrix.people.find((x) => x.id === person) || matrix.people[0] || null;
      if (!p) return { label: "รายคน", row: BLANK, lastYear: null, personId: "" };
      // ปีก่อนระดับรายคนมีเฉพาะยอดจากระบบ (ยอดกรอกเองรับแค่บริษัท/ทีม)
      const prev = prevMatrix.people.find((x) => x.id === p.id);
      return { label: `${p.name}${p.team ? ` (${p.team})` : ""}`, row: p, lastYear: prev?.actual || null, personId: p.id };
    }
    if (scope === "team") {
      const t = matrix.teams.find((x) => x.team === team) || matrix.teams[0] || null;
      if (!t) return { label: "รายทีม", row: BLANK, lastYear: null, teamKey: "" };
      const prev = prevMatrix.teams.find((x) => x.team === t.team);
      return { label: `ทีม ${t.team}`, row: t, lastYear: prev?.actual || null, teamKey: t.team };
    }
    return { label: "รวมทั้งบริษัท", row: matrix.company, lastYear: prevMatrix.company?.actual || null };
  }, [scope, team, person, matrix, prevMatrix]);

  const common = { row: active.row, lastYear: active.lastYear, label: active.label, year, now, closedCount, ytdCount, carry, period };

  return (
    <div className="flex flex-col gap-4">
      <section className="glass-panel" style={{ padding: "14px 16px" }}>
        <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
          <span className="flex items-center gap-1.5" style={{ fontWeight: 700, fontSize: 15 }}>
            <Search size={16} aria-hidden="true" /> เจาะรายละเอียด
          </span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>มุมมอง</span>
          <div className="segmented" role="group" aria-label="มุมมอง">
            {SCOPES.map((s) => (
              <button key={s.key} type="button" className={scope === s.key ? "active" : ""} onClick={() => onChange({ scope: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
          {scope === "team" && (
            <Select className="premium-select" value={active.teamKey || ""} onChange={(e) => onChange({ team: e.target.value })} aria-label="เลือกทีม" style={{ width: 120 }}>
              {matrix.teams.map((t) => <option key={t.team} value={t.team}>ทีม {t.team}</option>)}
            </Select>
          )}
          {scope === "person" && (
            <Select className="premium-select" value={active.personId || ""} onChange={(e) => onChange({ person: e.target.value })} aria-label="เลือกพนักงาน" style={{ width: 170 }}>
              {matrix.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.team ? ` · ${p.team}` : ""}</option>)}
            </Select>
          )}
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 6 }}>ช่วงเวลา</span>
          <div className="segmented" role="group" aria-label="ช่วงเวลา">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" className={period === p.key ? "active" : ""} onClick={() => onChange({ period: p.key })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
          ตัวเลือกนี้มีผลกับการ์ดสรุปและกราฟด้านล่างทั้งหมด · บอร์ดประชุมเช้าด้านบนแสดงทุกคนเสมอ
        </div>
      </section>

      <PerformanceKpiCards {...common} />
      <PerformanceCharts {...common} />
      {carry && <CarryPanel {...common} />}
      <SummaryTable matrix={matrix} prevMatrix={prevMatrix} year={year} closedCount={closedCount} ytdCount={ytdCount} carry={carry} onDrill={onDrill} />
    </div>
  );
}

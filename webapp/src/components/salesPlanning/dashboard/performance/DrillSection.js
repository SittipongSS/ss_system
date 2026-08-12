"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import PerformanceKpiCards from "./PerformanceKpiCards";
import PerformanceCharts from "./PerformanceCharts";
import CarryPanel from "./CarryPanel";

// 🔍 เจาะรายละเอียด — เลือกมุมมอง (บริษัท/ทีม/คน) + ช่วงเวลา แล้วขับการ์ด KPI,
// กราฟ และแผงทบยอดพร้อมกัน.
//
// ตาราง "สรุปรายคน/รายทีม" เคยอยู่ท้ายส่วนนี้ — ลบแล้ว (2026-08-12) เพราะเป็นตาราง
// ติดตามยอดขายด้านบนในโหมดงวด "ปี" ทุกประการ (แถวชุดเดียวกัน คอลัมน์ซ้ำ 6 จาก 9)
// และแถวรวมท้ายตารางก็คือการ์ด KPI 6 ใบที่อยู่เหนือมันซ้ำอีกชั้น

const SCOPES = [
  { value: "company", label: "รวมทั้งบริษัท" },
  { value: "team", label: "รายทีม" },
  { value: "person", label: "รายคน" },
];

/* ⚠️ **ไม่ใช่หน้าต่างเวลา** — ตัวนี้คือความถี่ของแกน X ของกราฟ (12 จุด / 4 จุด / 1 จุด)
   ไม่ได้ตัดช่วงข้อมูล · เดิมใช้ป้าย "ช่วงเวลา · รายเดือน/รายไตรมาส/รายปี" ซึ่งชนกับ
   ตัวคุมงวดจริงบนหัวแท็บจนอ่านเป็นตัวเดียวกัน (2026-08-12) */
const CHART_BUCKETS = [
  { value: "month", label: "เดือน" },
  { value: "quarter", label: "ไตรมาส" },
  { value: "year", label: "ปี" },
];

const BLANK = { target: Array(12).fill(0), fcTotal: Array(12).fill(0), forecast: Array(12).fill(0), actual: Array(12).fill(0) };

export default function DrillSection({ matrix, prevMatrix, year, now, closedCount, ytdCount, carry, scope, team, person, period, onChange }) {
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
          <span className="flex items-center gap-1.5" style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)" }}>
            <Search size={16} aria-hidden="true" /> เจาะรายละเอียด
          </span>
          <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>มุมมอง</span>
          <Segmented ariaLabel="มุมมอง" options={SCOPES} value={scope} onChange={(v) => onChange({ scope: v })} />
          {/* ทีมมี 3 ตัวเลือกและเป็นรหัสสั้น — โชว์ให้เห็นทั้งหมด ไม่ต้องกดเปิดถึงจะรู้ว่ามีอะไร */}
          {scope === "team" && (
            <Segmented
              ariaLabel="เลือกทีม"
              options={matrix.teams.map((t) => ({ value: t.team, label: t.team }))}
              value={active.teamKey || ""}
              onChange={(v) => onChange({ team: v })}
            />
          )}
          {/* พนักงานยัง**คง**เป็นดรอปดาวน์ — ชื่อยาวและมีหลายคน (กติกาเดียวกับช่อง AE
              ของฟอร์มดีล ที่ผู้ใช้เคยให้ถอยจาก chips กลับมาเป็นดรอปดาวน์) */}
          {scope === "person" && (
            <Select className="premium-select" value={active.personId || ""} onChange={(e) => onChange({ person: e.target.value })} aria-label="เลือกพนักงาน" style={{ width: 170 }}>
              {matrix.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.team ? ` · ${p.team}` : ""}</option>)}
            </Select>
          )}
          <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", marginLeft: 6 }}>แกนกราฟ</span>
          <Segmented ariaLabel="ความถี่แกนกราฟ" options={CHART_BUCKETS} value={period} onChange={(v) => onChange({ period: v })} />
        </div>
        <div style={{ marginTop: 8, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
          <b>มุมมอง</b> เปลี่ยนการ์ดสรุป กราฟ และแผงทบยอดในส่วนนี้ · <b>แกนกราฟ</b> คุมเฉพาะความถี่แกน X ของกราฟ
          ไม่ได้ตัดช่วงข้อมูล (งวดอยู่ที่แถบบนสุด) · ตารางติดตามด้านบนแสดงทุกคนเสมอ
        </div>
      </section>

      <PerformanceKpiCards {...common} />
      <PerformanceCharts {...common} />
      {carry && <CarryPanel {...common} />}
    </div>
  );
}

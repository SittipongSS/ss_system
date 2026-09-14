"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import PerformanceKpiCards from "./PerformanceKpiCards";
import PerformanceCharts from "./PerformanceCharts";
import CarryPanel from "./CarryPanel";
import { resolvePersonDrill } from "@/lib/sales/performanceMath";
import { NO_TEAM_LABEL } from "@/lib/sales/personSlice";

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

// แถวว่างต้องมีทุกเส้นที่ matrix มี — รวมยอด SO รออนุมัติ (มติ 2026-09-11) ไม่งั้นการ์ด/กราฟ
// ที่อ่านเส้นนั้นได้ undefined
const BLANK = {
  target: Array(12).fill(0),
  fcTotal: Array(12).fill(0),
  forecast: Array(12).fill(0),
  actual: Array(12).fill(0),
  pendingApproval: Array(12).fill(0),
  pendingApprovalCount: Array(12).fill(0),
  // Won รอยื่น SO (มติ 2026-09-14) — เส้นเดียวกับที่ blankRow ของ performanceMath มี
  wonAwaitingSo: Array(12).fill(0),
  wonAwaitingSoCount: Array(12).fill(0),
};

export default function DrillSection({ matrix, prevMatrix, year, now, closedCount, ytdCount, carry, scope, team, person, period, loading, onChange }) {
  // แถวข้อมูลของมุมมองที่เลือก + Actual ปีก่อนของมุมมองเดียวกัน (ถ้ามี)
  const active = useMemo(() => {
    if (scope === "person") {
      /* แถวคน = (ใคร, ทีมไหน) (มติ 2026-09-14 "ทีมตามดีล") — ?person= เป็นได้ทั้งคีย์แถวเต็มและ user id เปล่า
         ตัวตัดสินอยู่ที่ resolvePersonDrill (เทสต์ได้) · id เปล่าของคนหลายทีมได้แถวของทีมที่เรียงก่อน
         ป้ายจึงบอกทีมเสมอ ให้เห็นว่าเป็นยอดของทีมนั้น ไม่ใช่ยอดรวมทุกทีมของคนนั้น
         ⚠️ เลือกไว้แต่หาไม่เจอ (เช่นสลับไปปีที่คนนั้นไม่มีแถว) = การ์ดว่าง ไม่ถอยไปโชว์คนแรกของรายชื่อ
         🪤 ป้าย "ไม่พบ" รอโหลดเสร็จก่อน — เปิดลิงก์ "ดูผลงานเต็ม" ครั้งแรก (ยังไม่มี cache) matrix ว่างระหว่างโหลด
            ถ้าไม่รอ ช่องเลือกจะบอก "ไม่พบพนักงานที่เลือก" ทั้งที่อีกครู่เดียวก็เจอ */
      const { row: p, prev } = resolvePersonDrill(matrix, prevMatrix, person);
      if (!p) return { label: "รายคน", row: BLANK, lastYear: null, personId: "", personMissing: Boolean(person) && !loading };
      // ปีก่อน = แถว (คน, ทีม) เดียวกันของปีก่อน — รวมยอดรายคนที่กรอกย้อนหลังแล้ว (overlayHistory)
      return { label: `${p.name} (${p.team || NO_TEAM_LABEL})`, row: p, lastYear: prev?.actual || null, personId: p.id };
    }
    if (scope === "team") {
      const t = matrix.teams.find((x) => x.team === team) || matrix.teams[0] || null;
      if (!t) return { label: "รายทีม", row: BLANK, lastYear: null, teamKey: "" };
      const prev = prevMatrix.teams.find((x) => x.team === t.team);
      return { label: `ทีม ${t.team}`, row: t, lastYear: prev?.actual || null, teamKey: t.team };
    }
    return { label: "รวมทั้งบริษัท", row: matrix.company, lastYear: prevMatrix.company?.actual || null };
  }, [scope, team, person, loading, matrix, prevMatrix]);

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
            <Select
              className="premium-select"
              value={active.personId || ""}
              placeholder={active.personMissing ? "ไม่พบพนักงานที่เลือก" : undefined}
              onChange={(e) => onChange({ person: e.target.value })}
              aria-label="เลือกพนักงาน"
              style={{ width: 170 }}
            >
              {/* ค่า = คีย์แถว (คน, ทีม) · ป้ายมีทีมเสมอ — คนหลายทีมมีชื่อซ้ำได้ ต้องแยกออกด้วยตา */}
              {matrix.people.map((p) => <option key={p.id} value={p.id}>{`${p.name} · ${p.team || NO_TEAM_LABEL}`}</option>)}
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

"use client";

import { Target } from "lucide-react";
import { windowStat, periodKindOf } from "@/lib/sales/performanceMath";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";
import { WON_AWAITING_SO_LABEL } from "@/lib/sales/dashboardMetrics";
import {
  barBreakdown,
  FC_REMAINING_LABEL,
  money,
  pctFmt,
  periodLabel,
  PROJECTION_BASIS,
  projectionText,
  SeriesLegend,
  WonAwaitingSoAmount,
} from "./shared";

// แถบความคืบหน้าเทียบเป้า — ทั้งบริษัท (ส่วนบนสุดของแท็บผลงานขาย).
// ส่วนในแถบเรียงตามความแน่นอน: Actual (เขียว) | รออนุมัติ (เขียวจางลายเฉียง) |
// Won รอยื่น SO (ส้มลายเฉียง) | FC คงเหลือ (ส้มจาง) — เทียบตำแหน่งขีด "เป้า(+ทบ)".
//
// งวดมาจากแถบคุมด้านบน (`PeriodBar`) — การ์ดนี้ไม่มีตัวคุมเวลาของตัวเองแล้ว
// (2026-08-12) ของเดิมเป็น `useState` แยกที่ล็อกอยู่ที่ "ตอนนี้" และไม่เข้า URL
// จึงแสดงคนละงวดกับตารางที่อยู่ใต้มันได้โดยไม่มีอะไรบอก
//
// ⭐ ยอด SO รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) ต่อท้ายส่วนเขียวเป็นเขียวจาง
// ลายเฉียง + มีคำกำกับใน legend / aria-label / บรรทัดตัวเลข · % ยังเป็น Actual ล้วน
//
// ⭐ Won รอยื่น SO (มติผู้ใช้ 2026-09-14) — ดีลที่ปิด Won แล้วแต่ยังไม่ยื่น SO เคยหายจากทั้ง
// FC คงเหลือและรออนุมัติ ⇒ "คาดขาด" พุ่งเต็มมูลค่าดีลช่วงรับใบเสนอราคา → กดยื่น SO
// · งวดที่ยังไม่จบ **โชว์ยอดคาดพร้อมคำตัดสินเสมอ** ("คาดจบงวด ฿X — คาดขาด ฿Y" / "— คาดถึงเป้า")
//   เดิมเงียบเมื่อถึงเป้า คนอ่านจึงไม่รู้ว่ายอดคาดนับอะไรไปบ้าง · และมีบรรทัดฐานของยอดคาดกำกับ
// · ป้าย "Forecast" เดิมเป็น "FC คงเหลือ" — เลขตัวเดียวกับคอลัมน์ FC คงเหลือของตารางติดตาม
//   (API `weightedForecast` = มูลค่าเต็มของดีลที่ยังเปิด ไม่ได้ถ่วงน้ำหนักตามชื่อ)

export default function YearProgressBar({ matrix, year, now, closedCount, carry, win }) {
  const range = { startIdx: win.startIdx, endIdx: win.endIdx };
  const stat = windowStat(matrix.company, { ...range, carryOn: carry, closedCount });
  const kind = periodKindOf({ year, ...range }, now);
  const hasPending = stat.pendingApproval > 0 || stat.pendingApprovalCount > 0;
  const hasWonAwaiting = stat.wonAwaitingSo > 0 || stat.wonAwaitingSoCount > 0;
  // งวดที่จบแล้วไม่มีอะไรให้ "คาด" — งวดที่วิ่ง/ยังไม่ถึงพูดยอดคาดเสมอ ทั้งตอนขาดและตอนถึง
  const showProjection = kind !== "past";
  const scale = Math.max(stat.mustClose, stat.projected, 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const projectionAria = showProjection ? ` · ${projectionText(stat)}` : "";

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <Target size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>
          ความคืบหน้าเทียบเป้า — ทั้งบริษัท · {periodLabel(win)}
        </h2>
        <div className="spacer" />
        <SeriesLegend
          items={[
            { label: "Actual", color: "var(--green)" },
            ...(hasPending ? [{ label: PENDING_APPROVAL_LABEL, swatchClass: "perf-swatch-pending" }] : []),
            ...(stat.wonAwaitingSo > 0 ? [{ label: WON_AWAITING_SO_LABEL, swatchClass: "perf-swatch-won" }] : []),
            { label: FC_REMAINING_LABEL, color: "var(--amber)" },
          ]}
        />
      </div>

      <div style={{ position: "relative", marginTop: 22 }}>
        <div
          role="img"
          aria-label={`${barBreakdown(stat)} เทียบต้องปิด ${money(stat.mustClose)}${projectionAria}`}
          style={{
            display: "flex", overflow: "hidden", height: 14,
            borderRadius: 8, background: "var(--panel-2)", border: "1px solid var(--border)",
            "--perf-pending-w": w(stat.pendingApproval),
            "--perf-won-w": w(stat.wonAwaitingSo),
          }}
        >
          <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)", transition: "width var(--motion-slow)" }} />
          {stat.pendingApproval > 0 && <i className="perf-seg-pending perf-seg-animated" />}
          {stat.wonAwaitingSo > 0 && <i className="perf-seg-won perf-seg-animated" />}
          <i style={{ display: "block", height: "100%", width: w(stat.forecast), background: "var(--amber)", opacity: 0.75, transition: "width var(--motion-slow)" }} />
        </div>
        {stat.mustClose > 0 && (
          <span style={{ position: "absolute", top: -5, height: 24, width: 3, left: w(stat.mustClose), transform: "translateX(-50%)", background: "var(--text)", borderRadius: 2 }}>
            <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: "var(--fs-3)", color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {carry && stat.carry > 0 ? "เป้า+ทบ" : "เป้า"}
            </span>
          </span>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
        Actual {money(stat.actual)} ({pctFmt(stat.pct)})
        {hasPending && <> · <PendingApprovalAmount inline className="perf-pending-inline" amount={stat.pendingApproval} count={stat.pendingApprovalCount} /></>}
        {hasWonAwaiting && <> · <WonAwaitingSoAmount inline amount={stat.wonAwaitingSo} count={stat.wonAwaitingSoCount} /></>}
        {" "}· {FC_REMAINING_LABEL} {money(stat.forecast)} · ต้องปิด {money(stat.mustClose)}
        {carry && stat.carry > 0 && <> (เป้า {money(stat.target)} + ทบยกมา {money(stat.carry)})</>}
        {showProjection && <> · <span className="perf-projection">{projectionText(stat, " — ")}</span></>}
      </div>
      {showProjection && (
        <p className="perf-projection-basis">
          {PROJECTION_BASIS} · ยอดคาดยังไม่ใช่ยอดขาย — % และตัวเลขเทียบเป้าอื่นนับ Actual อย่างเดียว
        </p>
      )}
    </section>
  );
}

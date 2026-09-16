"use client";
import { TableScroll } from "@/components/ui/Table";

import { Fragment, useMemo } from "react";
import { Sun } from "lucide-react";
import { periodKindOf, rowHasValue, unallocatedRow, windowStat, yearSummary } from "@/lib/sales/performanceMath";
import { currentMonth } from "@/lib/datePeriods";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";
import { WON_AWAITING_SO_LABEL } from "@/lib/sales/dashboardMetrics";
import { closedThroughLabel, money, pctFmt, periodLabel, ProgressBar, WonAwaitingSoAmount } from "./shared";
import { NA } from "@/lib/format";
import { NO_TEAM_LABEL } from "@/lib/sales/personSlice";

// ☀️ บอร์ดประชุมเช้า — ทุกคน ทุกทีม ในตารางเดียว ตามยอดของงวดที่เลือก.
// "ต้องปิด" = เป้างวด + ยอดทบยกมา (ปิดโหมดทบ = เป้าปกติ คอลัมน์ทบหาย).
// คลิกชื่อ → เจาะรายละเอียดคน/ทีมนั้นด้านล่าง · คลิกยอด Actual → รายดีลที่ประกอบยอด.
//
// 🔗 **ตารางเดียวของแท็บนี้** (รวมกับ "สรุปรายคน/รายทีม" ที่ลบทิ้งแล้ว 2026-08-12) —
// ของเดิมเป็นสองตารางแถวเดียวกัน คอลัมน์ซ้ำกัน 6 จาก 9 ต่างกันแค่ตารางล่างล็อกงวด
// "ทั้งปี" ไว้ตายตัว · กดสวิตช์งวดเป็น "ปี" ที่นี่ได้ผลเท่ากัน จึงย้าย 3 คอลัมน์ที่มี
// เฉพาะตารางล่าง (ต้องทำ/เดือน · YoY · สถานะ) เข้ามาโผล่เฉพาะโหมดปี
//
// 🧮 **แถวทีมทั้งหมด + "ยังไม่ได้แยกทีม" = แถวรวมบริษัทเป๊ะ** (เพิ่ม 2026-08-27)
// ของเดิมวางแถวทีมกับแถวรวมไว้ด้วยกันโดยที่สองระดับกระทบกันไม่ได้ (prod 27/08:
// เป้าทั้งปี บริษัท 137.35M vs ผลรวมทีม 72.35M · Actual สะสม 90.68M vs 12.19M)
// ⇒ ส่วนต่างเป็นแถวของตัวเองจาก `unallocatedRow` ไม่ใช่ตัวเลขที่หายไปเฉย ๆ
// ⚠️ ห้ามยัดส่วนต่างเข้าทีมไหนเป็นการเดา — ข้อมูลว่าเป็นของทีมไหนไม่มีอยู่จริง
//
// ⚠️ **สองนิยามของ "ขาด" อยู่ในแถวเดียวกัน** อย่าเอามารวมเป็นคอลัมน์เดียว:
// · "ขาด / เกิน" = Actual − เป้า**ทั้งงวด** (โหมดปี = เป้าทั้ง 12 เดือน) — เหลืออีกเท่าไรถึงปิดปี
// · "สถานะ" = Actual YTD − Target **YTD** — ตอนนี้ตามแผนอยู่ไหม (เดือนที่ยังไม่ถึงไม่นับ)
// ปี 2026 ณ ส.ค. ต่างกันราว 56 ล้าน — ป้ายกำกับคือสิ่งเดียวที่กันคนอ่านสลับกัน
//
// 🧾 **ยอด SO รออนุมัติ** (มติผู้ใช้ 2026-09-11 · mig 0353) — บรรทัดรองใต้ตัวเลข Actual
// ไม่ใช่คอลัมน์ใหม่ (minWidth ด้านล่างวัดมือไว้) · กดแล้วเปิดรายดีล metric 'pendingApproval'
// ของ **เดือนปัจจุบันเวลาไทยเสมอ** (ยอดนี้อยู่เดือนนั้นเดือนเดียว ไม่ว่างวดที่ดูจะกว้างแค่ไหน)
// ⛔ ขาด/เกิน · % ปิดได้ · YoY · สถานะ ยังเป็น Actual ล้วน — แถบใน % ปิดได้ แค่วาดต่อท้ายให้เห็น
//
// 🏁 **Won รอยื่น SO** (มติผู้ใช้ 2026-09-14) — บรรทัดรองถัดจากรออนุมัติ · ดีลปิด Won แล้วแต่ยังไม่ยื่น SO
// กดแล้วเปิดรายดีล metric 'wonAwaitingSo' ของ **งวดที่ดูอยู่** (เดือน/ทั้งปี ตามปุ่มตัวเลขอื่น)
// ⚠️ ไม่บังคับเดือนปัจจุบันแบบรออนุมัติ — ยอดนี้อยู่ที่เดือนที่ปิด Won ของดีล (wonMonthOf)
// แถบใน % ปิดได้ วาดเป็นส่วนส้มลายเฉียง ⇒ ช่องว่างถึงขีด = คาดขาด ที่นับทั้งรออนุมัติ + Won รอยื่น SO + FC คงเหลือ

/* `now` มากับ {...common} — ใช้หา periodKind อย่างเดียว: งวดที่จบแล้วแถบเล็กไม่พูด
   "คาดจบงวด/คาดขาด" (กติกาเดียวกับแถบบนสุด · 2026-09-14) · คอลัมน์สถานะเดิมที่เคยใช้
   periodKind ถอดไปแล้ว (มติผู้ใช้ 2026-08-03)
   งวด (`win`) ก็มาจากแถบคุมด้านบนแล้ว ไม่ได้คำนวณเองจาก `bp` อีก (2026-08-12) */
export default function MorningBoard({ matrix, prevMatrix, year, now, closedCount, ytdCount, carry, win, onDrill, onDealDrill }) {
  const kind = win.kind;
  const showProjection = periodKindOf({ year, startIdx: win.startIdx, endIdx: win.endIdx }, now) !== "past";

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
     ที่ไม่มีแถวหัวทีม (ตาข่ายกันคนหายที่ยกมาจากตารางสรุปเดิม)
     ⭐ p.team = ทีมที่ประทับบนยอด (มติ 2026-09-14) ไม่ใช่ทีมในบัญชี ⇒ คนหลายทีมโผล่ใต้ทุกทีมที่มียอด
        แถวละทีม (key = p.id ไม่ซ้ำกันต่อ (คน, ทีม)) และแถวหัวทีม = ผลรวมแถวคนใต้มัน */
  const grouped = useMemo(() => {
    const g = new Map();
    for (const p of matrix.people) {
      const key = p.team || NO_TEAM_LABEL;
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(p);
    }
    for (const t of matrix.teams) if (!g.has(t.team)) g.set(t.team, []);
    return g;
  }, [matrix.people, matrix.teams]);

  const teamRow = (team) => matrix.teams.find((t) => t.team === team);

  /* ส่วนที่ยังไม่ได้แตกลงทีม — โชว์เฉพาะเมื่อมีจริงในงวดที่ดู (บริษัทที่แยกครบไม่ต้องเห็น) */
  const rest = useMemo(() => unallocatedRow(matrix), [matrix]);
  const prevRest = useMemo(() => (prevMatrix ? unallocatedRow(prevMatrix) : null), [prevMatrix]);
  const showRest = rowHasValue(rest, win.startIdx, win.endIdx);
  // คำอธิบายเรื่องรออนุมัติโผล่เฉพาะงวดที่มีใบจริง (ยอดบริษัทครอบทุกแถวอยู่แล้ว)
  const companyStat = statOf(matrix.company);
  const anyPending = companyStat.pendingApproval > 0 || companyStat.pendingApprovalCount > 0;
  /* Won รอยื่น SO ต้องไล่ทุกแถว ไม่ใช่ดูแค่บริษัท — เดือนที่บริษัทกรอก Actual มือ เส้นของบริษัท
     ถูกล้างเป็น 0 (overlayHistory) ขณะที่แถวทีม/คนยังโชว์ส่วนนี้อยู่ ⇒ คำอธิบายต้องยังโผล่ */
  const anyWonAwaiting = [matrix.company, ...matrix.teams, ...matrix.people].some((r) => {
    const st = statOf(r);
    return st.wonAwaitingSo > 0 || st.wonAwaitingSoCount > 0;
  });

  // Actual ปีก่อนของแถวเดียวกัน — ฐานของ YoY (ไม่มีฐาน = คอลัมน์แสดง "–")
  const lastYearActualOf = (row, isTeam, isTotal, isRest) => {
    if (isTotal) return prevMatrix?.company?.actual || null;
    if (isRest) return prevRest?.actual || null;
    if (isTeam) return prevMatrix?.teams.find((x) => x.team === row.team)?.actual || null;
    return prevMatrix?.people.find((x) => x.id === row.id)?.actual || null;
  };

  /* เดือนที่ส่งให้ modal รายดีล: งวดเดือน = เดือนนั้น · งวดที่กว้างกว่า = **รายชื่อเดือนของงวดนั้น**
     🐞 เดิมงวดไตรมาสส่ง month = null แล้วลิ้นชักตกไปกิ่ง "ทั้งปี" ⇒ กด Q3 ได้รายการ 12 เดือน
        ยอดในลิ้นชักไม่ตรงกับช่องที่กด (ตรวจ 2026-09-16) */
  const dealMonth = kind === "month" ? `${year}-${String(win.startIdx + 1).padStart(2, "0")}` : null;
  const winMonths = (matrix.company?.months || []).slice(win.startIdx, win.endIdx + 1);
  // ยอดรออนุมัติอยู่ที่เดือนปัจจุบันเวลาไทยเท่านั้น ⇒ เจาะที่เดือนนั้นเสมอ ไม่ใช่ทั้งปี/ไตรมาส
  const pendingMonth = currentMonth();
  /* แถวคน = (ใคร, ทีมไหน) (มติผู้ใช้ 2026-09-14 "ทีมตามดีล") — ตัวตนส่งจากช่อง `row.ownerId`
     (id ของแถวเป็นคีย์ผสม ห้ามแกะ/ห้ามส่งเป็น ownerId ไม่งั้นลิ้นชักว่างทั้งที่ช่องมียอด) ·
     `teamScoped` ให้ลิ้นชักนับเฉพาะดีลของทีมแถวนั้น ⇒ คนที่มีดีลหลายทีม ยอดในลิ้นชัก = ช่องที่กด
     แถว legacy ที่ไม่มี ownerId ยังจับด้วยชื่อ + ทีม · แถวทีม/บริษัทส่งเหมือนเดิม */
  const openMetricDeals = (row, isTeam, metric, { month = dealMonth, dealYear = String(year), months = winMonths } = {}) => {
    const isPerson = !isTeam && row.id !== "company";
    onDealDrill?.({
      month,
      months,
      // คำของงวดที่ตาเห็นบนแถบ (เดือน · Q3 2026 · ปี 2026) — ลิ้นชักเคยเดาเองจากปี ⇒ งวดไตรมาสขึ้นหัวว่า "ทั้งปี"
      periodText: month === pendingMonth && months?.length === 1 ? month : periodLabel(win),
      year: dealYear,
      ownerId: isPerson ? row.ownerId || null : null,
      ownerName: isPerson ? row.name : null,
      team: isTeam ? row.team : row.team || null,
      teamScoped: isPerson,
      metric,
      label: row.id === "company" ? "รวมทั้งบริษัท" : isTeam ? `ทีม ${row.team}` : row.name,
    });
  };

  /* เป้าทีมกับผลรวมเป้ารายคนไม่ตรงกัน — ต้องเทียบ **รายเดือนในงวด** และ **ทั้งสองทาง**
     🐞 เทียบจากยอดรวมทั้งงวดทางเดียว: เดือนที่ทีมตั้งสูงกว่าไปหักล้างเดือนที่ต่ำกว่า ⇒ คำเตือนเงียบทั้งที่แถวไม่ตรงกัน */
  const targetMismatch = (row) => {
    const person = row.targetPersonSum || [];
    for (let i = win.startIdx; i <= win.endIdx; i += 1) {
      const p = Number(person[i] || 0);
      if (p > 0 && Math.abs(p - Number(row.target?.[i] || 0)) > 0.5) return true;
    }
    return false;
  };

  const Row = ({ row, isTeam = false, isTotal = false, isRest = false }) => {
    const s = statOf(row);
    const y = isYear ? yearSummary(row, { closedCount, ytdCount, lastYearActual: lastYearActualOf(row, isTeam, isTotal, isRest) }) : null;
    const label = isTotal ? "รวมทั้งบริษัท" : isRest ? "ยังไม่ได้แยกทีม" : isTeam ? `ทีม ${row.team}` : row.name;
    const clickable = !isTotal && !isRest;
    const cellClass = (base = "") => `${base}${isTotal ? " fz-foot" : ""}`.trim();
    // แถว "ยังไม่ได้แยกทีม" กดดูรายดีลไม่ได้ — มันคือส่วนต่างของยอดที่กรอกมือ ไม่ใช่ดีล
    const metricButton = (value, metric, color, metricLabel) => value > 0 && !isRest ? (
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
    // บรรทัดรองใต้ Actual: ยอด SO รออนุมัติของงวด — โผล่เฉพาะแถวที่มีใบ (ชิ้นแสดงผลกลางชิ้นเดียวทุกจอ)
    const hasPending = s.pendingApproval > 0 || s.pendingApprovalCount > 0;
    const pendingAmount = hasPending ? (
      <PendingApprovalAmount amount={s.pendingApproval} count={s.pendingApprovalCount} className="perf-pending-sub" />
    ) : null;
    // ชื่อปุ่มต้องมีข้อความที่ตาเห็นครบทั้งท่อน "รออนุมัติ ฿X · N ใบ" (WCAG 2.5.3 Label in Name —
    // สั่งด้วยเสียงตามที่อ่านบนจอได้) · "· N ใบ" โผล่เมื่อ > 1 ใบ ตามชิ้นกลาง PendingApprovalAmount
    const pendingName = `${PENDING_APPROVAL_LABEL} ${money(s.pendingApproval)}${s.pendingApprovalCount > 1 ? ` · ${s.pendingApprovalCount} ใบ` : ""}`;
    const pendingLine = !hasPending || isRest ? pendingAmount : (
      <button
        type="button"
        className="perf-pending-drill"
        onClick={() => openMetricDeals(row, isTeam, "pendingApproval", { month: pendingMonth, months: [pendingMonth], dealYear: pendingMonth.slice(0, 4) })}
        aria-label={`ดูรายละเอียด ${label} · ${pendingName}`}
      >
        {pendingAmount}
      </button>
    );
    // บรรทัดรองที่สองใต้ Actual: ดีล Won ที่ยังไม่ยื่น SO ของงวด (มติ 2026-09-14) — กติกาชื่อปุ่มเดียวกับบรรทัดบน
    const hasWonAwaiting = s.wonAwaitingSo > 0 || s.wonAwaitingSoCount > 0;
    const wonAwaitingAmount = hasWonAwaiting ? (
      <WonAwaitingSoAmount amount={s.wonAwaitingSo} count={s.wonAwaitingSoCount} />
    ) : null;
    const wonAwaitingName = `${WON_AWAITING_SO_LABEL} ${money(s.wonAwaitingSo)}${s.wonAwaitingSoCount > 0 ? ` · ${s.wonAwaitingSoCount} ดีล` : ""}`;
    const wonAwaitingLine = !hasWonAwaiting || isRest ? wonAwaitingAmount : (
      <button
        type="button"
        className="perf-pending-drill"
        onClick={() => openMetricDeals(row, isTeam, "wonAwaitingSo")}
        aria-label={`ดูรายละเอียด ${label} · ${wonAwaitingName}`}
      >
        {wonAwaitingAmount}
      </button>
    );
    return (
      <tr
        className={`premium-row${isRest ? " perf-rest-row" : ""}`}
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
          ) : isRest ? (
            <>
              <strong className="perf-rest-label">{label}</strong>
              <span className="perf-rest-note">ยอดระดับบริษัทที่ยังไม่ได้ลงทีม</span>
            </>
          ) : <strong>{label}</strong>}
          {!isTeam && !isTotal && !isRest && row.team && (
            <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-4)", fontWeight: "var(--fw-normal)" }}>{row.team}</span>
          )}
        </td>
        <td className={cellClass("num mono")}>
          {money(s.target)}
          {/* เป้าระดับทีมชนะเป้ารายคนเสมอ (มติผู้ใช้ 2026-09-16 · api dashboard) — แต่ต้องบอกบนจอ
              ไม่งั้นแถวทีมไม่เท่าผลรวมแถวคนใต้มันโดยไม่มีคำอธิบาย (ของจริง ต.ค.–ธ.ค. 2026 ต่างทีมละ ~7 แสน) */}
          {isTeam && targetMismatch(row) && (
            <span className="perf-rest-note" title={`เป้าที่ตั้งรายคนในทีมนี้รวมกันได้ ${money(s.targetPersonSum)} แต่แถวนี้ใช้เป้าระดับทีมที่ตั้งไว้ ${money(s.target)} — แก้ได้ที่หน้าวางเป้า`}>
              รายคนรวม {money(s.targetPersonSum)}
            </span>
          )}
        </td>
        {carry && <td className={cellClass("num mono")} style={{ color: s.carry > 0 ? "var(--red)" : "var(--text-3)" }}>{s.carry > 0 ? money(s.carry) : NA}</td>}
        {carry && <td className={cellClass("num mono")} style={{ fontWeight: "var(--fw-semibold)" }}>{money(s.mustClose)}</td>}
        <td className={cellClass("num")}>{metricButton(s.fcTotal, "fcTotal", "var(--blue)", "FC Total")}</td>
        <td className={cellClass("num")}>{metricButton(s.forecast, "remaining", "var(--amber)", "FC คงเหลือ")}</td>
        <td className={cellClass("num")} style={{ fontWeight: "var(--fw-semibold)" }}>{metricButton(s.actual, "won", "var(--green)", "Actual")}{pendingLine}{wonAwaitingLine}</td>
        <td className={cellClass("num mono")} style={{ color: s.diff >= 0 ? "var(--green)" : "var(--red)" }}>
          {s.diff >= 0 ? "+" : ""}{money(s.diff)}
        </td>
        <td className={cellClass()} style={{ minWidth: 150 }}>
          <div className="flex items-center gap-2">
            <ProgressBar stat={s} showProjection={showProjection} />
            <span className="mono" style={{ fontSize: "var(--fs-5)", fontWeight: "var(--fw-semibold)", color: "var(--text-2)" }}>
              {pctFmt(s.pct)}
            </span>
          </div>
        </td>
        {y && <td className={cellClass("num mono")}>{y.needPerMonth == null ? "—" : y.needPerMonth === 0 ? "ปิดแล้ว ✓" : money(y.needPerMonth)}</td>}
        {y && (
          <td
            className={cellClass("num mono")}
            style={{ color: y.yoy == null ? "var(--text-3)" : y.yoy >= 0 ? "var(--green)" : "var(--red)", fontWeight: "var(--fw-semibold)" }}
          >
            {y.yoy == null ? "–" : `${y.yoy >= 0 ? "+" : ""}${pctFmt(y.yoy)}`}
          </td>
        )}
        {y && (
          <td className={cellClass()}>
            {y.targetYear <= 0 && y.actualYtd <= 0 ? (
              <span style={{ color: "var(--text-3)" }}>{NA}</span>
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
        {" "}· แถบ: เขียว = Actual{anyPending ? ` · เขียวจางลายเฉียง = ${PENDING_APPROVAL_LABEL}` : ""}{anyWonAwaiting ? ` · ส้มลายเฉียง = ${WON_AWAITING_SO_LABEL}` : ""} · ส้ม = FC คงเหลือ · ขีดเข้ม = {carry ? "ต้องปิด" : "เป้า"}
        {` · ช่องว่างจากปลายแถบถึงขีด = คาดขาด ซึ่งนับ Actual + ${PENDING_APPROVAL_LABEL} + ${WON_AWAITING_SO_LABEL} + FC คงเหลือ (มูลค่าดีลเต็ม ไม่ถ่วงโอกาสปิด) — ส่วน "ขาด / เกิน" และ "% ปิดได้" นับ Actual อย่างเดียว`}
        {" "}· คลิกตัวเลขเพื่อดูรายการดีล
        {anyPending && ` · "${PENDING_APPROVAL_LABEL}" ใต้ Actual = ใบสั่งขายที่ยื่นแล้ว รอ AE Supervisor อนุมัติ — ยังไม่นับใน Actual, ขาด / เกิน และ % ปิดได้`}
        {anyWonAwaiting && ` · "${WON_AWAITING_SO_LABEL}" ใต้ Actual = ดีลที่ปิด Won แล้วแต่ยังไม่มียอดจากใบสั่งขาย (มูลค่าดีลเต็ม นับที่เดือนที่ปิด Won — ดีลที่มีแค่ใบอนุมัติ 0 บาทนับที่เดือนที่อนุมัติใบนั้น) — ยังไม่นับใน Actual, ขาด / เกิน และ % ปิดได้`}
        {isYear && ` · "ขาด / เกิน" เทียบเป้าทั้ง 12 เดือน ส่วน "สถานะ" เทียบเป้าเฉพาะเดือนที่จบแล้ว (${through}) — เดือนที่กำลังวิ่งไม่นับ`}
        {showRest && ' · แถว "ยังไม่ได้แยกทีม" คือเป้า/ยอดที่กรอกไว้ระดับบริษัทแต่ยังไม่ได้ลงรายทีม — แถวทีมทุกแถวบวกกับแถวนี้จะได้แถวรวมท้ายตารางพอดี'}
      </p>

      {/* พื้นล่างของความกว้าง — วัดจาก min-content จริงหลังถอดคอลัมน์สถานะแล้วเผื่อขึ้น
          เล็กน้อยกันหัวตารางไทยโดนบีบ: 7 คอลัมน์ = 858px · 9 คอลัมน์ (โหมดทบ) = 1026px
          โหมดปีเพิ่มอีก 3 คอลัมน์ (ต้องทำ/เดือน · YoY · สถานะ) ≈ +360px
          ⚠️ เลขนี้ไม่ใช่ค่าประดับ — ต่ำกว่านี้คอลัมน์จะเบียดจนตัวเลขตกบรรทัด */}
      <TableScroll surface="embedded" family="matrix" className="premium-glass-table performance-tracking-table fz-box" style={{ "--fz-c1w": "150px" }}><table className="fz-table w-full text-sm" style={{ minWidth: (carry ? 1040 : 880) + (isYear ? 360 : 0) }}>
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
          {showRest && <Row row={rest} isRest />}
        </tbody>
        <tfoot>
          <Row row={{ ...matrix.company, id: "company" }} isTotal />
        </tfoot>
      </table></TableScroll>
    </section>
  );
}

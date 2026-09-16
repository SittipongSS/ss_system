"use client";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";
import { WON_AWAITING_SO_LABEL } from "@/lib/sales/dashboardMetrics";
import { projectionGap } from "@/lib/sales/performanceMath";

// ชิ้นส่วนเล็กที่ใช้ร่วมกันในแท็บผลงานขาย — เก็บที่เดียวให้แถบคุมงวด/แถบความคืบหน้า/
// ตารางติดตาม/แผงทบยอด พูดถึงงวดเดียวกันด้วยคำเดียวกันและฟอร์แมตตัวเลขเหมือนกัน

/* ⭐ เงินในแท็บนี้ **เต็มหลักอย่างเดียว** — `moneyCompact` ถูกถอดทิ้งแล้ว
   (ผู้ใช้รายสุดท้ายคือแผนที่ความร้อนรายปี · มติเจ้าของระบบ 2026-09-01)
   ถ้าจะย่อ M/K ที่ไหนอีกต้องเป็นมติใหม่ ไม่ใช่เติม helper กลับเงียบ ๆ */
export const money = (v) => fmtMoney(v);
export const pctFmt = (v) =>
  v == null ? "–" : `${fmtNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
/* ---- ภาษาของ "งวด" ---- */
/* ทั้งแท็บใช้งวดเดียวกัน (URL param `bp`) — เดิมมีตัวคุมเวลาสามชุดคำศัพท์คนละแบบ
   ("เดือนนี้" ของแถบความคืบหน้า · "เดือน" ของตาราง · "รายเดือน" ของส่วนเจาะ)
   ที่ไม่ซิงก์กันเลย · เหลือชุดเดียวแล้ว (2026-08-12) — ตัวที่ยังแยกคือ "แกนกราฟ"
   ของส่วนเจาะ ซึ่งเป็นความถี่ของแกน X ไม่ใช่หน้าต่างเวลา จึงตั้งชื่อไม่ให้ชนกัน */

export const PERIOD_KINDS = [
  { value: "month", label: "เดือน" },
  { value: "quarter", label: "ไตรมาส" },
  { value: "year", label: "ปี" },
];

export const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

export function periodLabel(win) {
  if (!win) return "";
  if (win.kind === "year") return `ปี ${win.year}`;
  if (win.kind === "quarter") return `${QUARTER_LABELS[win.startIdx / 3]} ${win.year}`;
  return `${MONTH_LABELS[win.startIdx]} ${win.year}`;
}
// `bpOfWindow` / `toKind` เป็นคณิตล้วน อยู่ที่ lib/sales/performanceMath พร้อมเทสต์

/* ป้ายบอก "ฐาน" ของตัวเลขที่เทียบเป้า/ปีก่อน — นับเฉพาะเดือนที่จบแล้ว
   ⚠️ ตัวเลขเทียบทุกตัวต้องมีป้ายนี้กำกับ ไม่งั้นคนอ่านนึกว่ารวมเดือนปัจจุบันด้วย
   แล้วสงสัยว่าทำไมยอดที่เพิ่งปิดวันนี้ไม่ขยับเลข */
export function closedThroughLabel(closedCount) {
  if (closedCount >= 12) return "ทั้งปี";
  if (closedCount <= 0) return "ยังไม่มีเดือนที่จบ";
  return `ถึง ${MONTH_LABELS[closedCount - 1]}`;
}

export function periodOptions(kind, year) {
  if (kind === "year") return [{ value: String(year), label: `ปี ${year}` }];
  if (kind === "quarter") return QUARTER_LABELS.map((q, i) => ({ value: `${year}-Q${i + 1}`, label: `${q} ${year}` }));
  return MONTH_LABELS.map((m, i) => ({ value: `${year}-${String(i + 1).padStart(2, "0")}`, label: `${m} ${year}` }));
}

/* `StatusPill` (ป้ายสถานะงวดจาก `statusOf`) ถูกถอดออกพร้อมคอลัมน์สถานะของ
   ตารางติดตามยอดขาย (มติผู้ใช้ 2026-08-03) — บอร์ดเช้าเป็นผู้ใช้รายเดียวของมัน
   ⚠️ ตารางสรุปรายคน/รายทีมมีคอลัมน์ "สถานะ" ของตัวเองที่คำนวณคนละกติกา (Achv YTD)
   ไม่เคยใช้ StatusPill — อย่าสับสนว่าลบตัวนี้แล้วตารางนั้นจะพัง
   กติกา `statusOf` ยังอยู่ที่ lib/sales/performanceMath.js พร้อมเทสต์ ถ้าจะเอาป้าย
   กลับมาให้เรียกจากที่นั่น อย่าเขียนกติกาสถานะขึ้นใหม่ */

// แถบงวด: เขียว = Actual · เขียวจางลายเฉียง = รออนุมัติ · ส้มลายเฉียง = Won รอยื่น SO · ส้ม = FC คงเหลือ · ขีดเข้ม = ต้องปิด
// สเกลครอบผลรวมทุกส่วน · ช่องว่างถึงขีด = คาดขาด · % ข้างแถบเป็น Actual ล้วน (2026-09-14 · ดู barTotal ใต้ไฟล์)
// `showProjection` = งวดยังไม่จบ — งวดที่จบแล้วไม่พูด "คาดจบงวด/คาดขาด" (กติกาเดียวกับแถบบนสุด)
export function ProgressBar({ stat, height = 8, showProjection = true }) {
  const scale = Math.max(stat.mustClose, barTotal(stat), 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div
      role="img"
      aria-label={showProjection ? progressBarLabel(stat) : `${barBreakdown(stat)} · ต้องปิด ${money(stat?.mustClose)}`}
      title={showProjection ? projectionText(stat) : undefined}
      style={{ position: "relative", minWidth: 110 }}
    >
      <div
        style={{
          display: "flex", overflow: "hidden", height,
          borderRadius: height / 2, background: "var(--panel-2)",
          border: "1px solid var(--border)", "--perf-pending-w": w(stat.pendingApproval || 0),
          "--perf-won-w": w(nonNegative(stat.wonAwaitingSo)),
        }}
      >
        <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)" }} />
        {/* ยอด SO รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) — ต่อท้าย Actual ด้วยสีเดียวกัน
            แต่จาง + ลายเฉียง (.perf-seg-pending) ไม่ใช่ Actual · ความกว้างมาทางตัวแปร CSS
            ของรางด้านบน · ตัวเลข % ข้างแถบยังเป็น Actual ล้วน */}
        {stat.pendingApproval > 0 && <i className="perf-seg-pending" title={`${PENDING_APPROVAL_LABEL} ${money(stat.pendingApproval)}`} />}
        {/* Won รอยื่น SO (มติผู้ใช้ 2026-09-14) — ดีล Won ที่ยังไม่ยื่น SO · ส้มลายเฉียง (.perf-seg-won)
            คั่นระหว่างรออนุมัติกับ FC คงเหลือ ตามลำดับความแน่นอน · ความกว้างมาทาง --perf-won-w */}
        {stat.wonAwaitingSo > 0 && <i className="perf-seg-won" title={`${WON_AWAITING_SO_LABEL} ${money(stat.wonAwaitingSo)}`} />}
        <i style={{ display: "block", height: "100%", width: w(stat.forecast), background: "var(--amber)", opacity: 0.75 }} />
      </div>
      {stat.mustClose > 0 && (
        <span
          title="ต้องปิด"
          style={{
            position: "absolute", top: -3, height: height + 6, width: 2,
            left: w(stat.mustClose), transform: "translateX(-50%)",
            background: "var(--text)", borderRadius: 1,
          }}
        />
      )}
    </div>
  );
}

// legend สีสามค่า — ใช้หัวการ์ด/แผงต่าง ๆ
// `swatchClass` = ตัวอย่างที่สีเดียวแทนไม่ได้ (รออนุมัติ = เขียวจางลายเฉียง) — ไม่ส่ง `color`
// คู่กับมัน ไม่งั้น background ของ style ทับลายของคลาส
export function SeriesLegend({ items }) {
  return (
    <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5" style={{ fontSize: "var(--fs-5)", color: "var(--text-2)" }}>
          <span
            aria-hidden="true"
            className={s.swatchClass}
            style={{
              width: 11, height: s.line ? 3 : 11, borderRadius: 3, display: "inline-block",
              background: s.dashed ? "none" : s.color,
              borderTop: s.dashed ? `3px dashed ${s.color}` : "none",
            }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ── ภาษาของ "ยอดคาด" (มติผู้ใช้ 2026-09-14) ─────────────────────────────────────
   ⭐ ยอดคาดจบงวด = Actual + รออนุมัติ + Won รอยื่น SO + FC คงเหลือ (`windowStat().projected`)
      ทุกส่วนเป็น **มูลค่าดีลเต็ม** — FC คงเหลือไม่ได้ถ่วงโอกาสปิด ⇒ ทุกจุดที่พูดยอดคาดต้องบอกฐานนี้
   ⭐ ป้ายส่วนส้มทึบคือ "FC คงเหลือ" คำเดียวทั้งแท็บ (เดิมแถบบนสุดเรียก "Forecast" ส่วนตารางเรียก
      "FC คงเหลือ" ทั้งที่เป็นเลขตัวเดียวกัน)
   ⛔ ยอดคาดไม่ใช่ยอดขาย — % · ขาด/เกิน · ทบยอด ยังนับ Actual อย่างเดียว */
export const PROJECTION_LABEL = "คาดจบงวด";
export const FC_REMAINING_LABEL = "FC คงเหลือ";
export const PROJECTION_BASIS =
  `${PROJECTION_LABEL} = Actual + ${PENDING_APPROVAL_LABEL} + ${WON_AWAITING_SO_LABEL} + ${FC_REMAINING_LABEL} (มูลค่าดีลเต็ม ไม่ถ่วงโอกาสปิด)`;

const nonNegative = (v) => Math.max(0, Number(v) || 0);

/** ผลรวมทุกส่วนที่แถบวาด — สเกลของแถบต้องครอบทั้งหมด ไม่งั้นส่วนท้ายถูกตัดทิ้งเงียบ ๆ
 *  (แถว "ยังไม่ได้แยกทีม" มีเส้นติดลบได้ ส่วนที่ติดลบไม่ถูกวาดจึงไม่นับเข้าสเกล) */
export const barTotal = (stat) =>
  nonNegative(stat?.actual) + nonNegative(stat?.pendingApproval) + nonNegative(stat?.wonAwaitingSo) + nonNegative(stat?.forecast);

/** "คาดขาด ฿X" / "คาดถึงเป้า" / "ยังไม่มีเป้าให้เทียบ" — คำตัดสินจาก projectionGap ตัวเดียว */
export function projectionVerdict(stat) {
  const gap = projectionGap(stat);
  if (!gap.hasTarget) return "ยังไม่มีเป้าให้เทียบ";
  return gap.reached ? "คาดถึงเป้า" : `คาดขาด ${money(gap.shortfall)}`;
}

/** "คาดจบงวด ฿X · คาดขาด ฿Y" — `sep` ให้แถบบนสุดใช้ขีดยาวคั่นแทนจุด */
export const projectionText = (stat, sep = " · ") =>
  `${PROJECTION_LABEL} ${money(projectionGap(stat).projected)}${sep}${projectionVerdict(stat)}`;

/** รายการส่วนของแถบเป็นข้อความ (ส่วนเสริมที่เป็นศูนย์ไม่พูดถึง) — ใช้กับ aria-label ของแถบทั้งสองแบบ
 *  ⚠️ ส่วนเสริมที่ **ติดลบ** ต้องพูดด้วย — แถว "ยังไม่ได้แยกทีม" มี Won รอยื่น SO ติดลบในเดือนที่บริษัท
 *  กรอก Actual มือ (ดู unallocatedRow) และ `projected` นับค่าติดลบนั้น ถ้าข้ามไป ชื่อของแถบจะพูด
 *  ส่วนต่าง ๆ ที่บวกกันไม่เท่า "คาดจบงวด" ท้ายประโยค (แถวปกติไม่มีค่าติดลบ ผลเหมือนเดิม) */
const nonZero = (v) => Math.abs(Number(v) || 0) > 1e-9;
export function barBreakdown(stat) {
  const hasPending = nonZero(stat?.pendingApproval) || nonZero(stat?.pendingApprovalCount);
  const hasWonAwaiting = nonZero(stat?.wonAwaitingSo) || nonZero(stat?.wonAwaitingSoCount);
  return [
    `Actual ${money(stat?.actual)}`,
    ...(hasPending ? [`${PENDING_APPROVAL_LABEL} ${money(stat.pendingApproval)}`] : []),
    ...(hasWonAwaiting ? [`${WON_AWAITING_SO_LABEL} ${money(stat.wonAwaitingSo)}`] : []),
    `${FC_REMAINING_LABEL} ${money(stat?.forecast)}`,
  ].join(" · ");
}

/** ชื่อที่โปรแกรมอ่านจอพูดของแถบในตารางติดตาม — แถบเล็กไม่มีบรรทัดตัวเลขกำกับ ต้องพูดครบในตัว */
export const progressBarLabel = (stat) =>
  `${barBreakdown(stat)} · ต้องปิด ${money(stat?.mustClose)} · ${projectionText(stat)}`;

/* ยอด "Won รอยื่น SO" — หน้าตาคู่กับชิ้นกลางของรออนุมัติ (PendingApprovalAmount)
   ⭐ คำกำกับมาก่อนตัวเลขเสมอ (สีไม่ใช่สัญญาณเดียว) + title อธิบายว่ายังไม่นับเป็น Actual
   ⭐ "· N ดีล" โชว์ทุกครั้งที่มีดีล (ต่างจากรออนุมัติที่โชว์เมื่อ > 1 ใบ) — ดีลมูลค่าว่าง
      ยังนับเป็นหนึ่งดีล จำนวนจึงเป็นข้อมูลที่ต้องเห็น
   ⭐ ไม่มีดีล = ไม่เรนเดอร์
   props: amount · count · inline (true = ต่อท้ายในบรรทัดเดียวกัน ขนาดตามบรรทัดนั้น) */
export function WonAwaitingSoAmount({ amount, count, inline = false }) {
  const value = Number(amount) || 0;
  const deals = Math.max(0, Math.trunc(Number(count) || 0));
  if (value <= 0 && deals <= 0) return null;
  return (
    <span
      className={inline ? "perf-won-inline" : "perf-won-sub"}
      title="ดีลปิด Won แล้ว แต่ยังไม่มียอดจากใบสั่งขาย (ยังไม่ออก SO · มีแค่ร่าง · ถูกตีกลับหรือยกเลิก · มีแต่ใบที่ยื่นรออนุมัติยอด 0 บาท — ใบที่อนุมัติแล้วแม้ 0 บาทถือว่าจบ) — ยังไม่นับเป็น Actual นับแค่ในยอดคาดจบงวด ด้วยมูลค่าดีลเต็ม"
    >
      <span className="perf-won-main">
        <span className="perf-won-tag">{WON_AWAITING_SO_LABEL}</span>{" "}
        {money(value)}
      </span>
      {deals > 0 ? <span className="perf-won-count"> · {deals} ดีล</span> : null}
    </span>
  );
}

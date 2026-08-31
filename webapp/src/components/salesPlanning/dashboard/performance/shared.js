"use client";

import { fmtMoney, fmtNumber } from "@/lib/format";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";

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

// แถบความคืบหน้าของงวด: เขียว = Actual, ส้ม = Forecast (ต่อท้าย), ขีดเข้ม = ต้องปิด.
// สเกล = ค่ามากสุดของ (ต้องปิด, Actual+Forecast) เพื่อให้ทุกส่วนอยู่ในกรอบเสมอ.
export function ProgressBar({ stat, height = 8 }) {
  const scale = Math.max(stat.mustClose, stat.actual + stat.forecast, 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div style={{ position: "relative", minWidth: 110 }}>
      <div
        style={{
          display: "flex", overflow: "hidden", height,
          borderRadius: height / 2, background: "var(--panel-2)",
          border: "1px solid var(--border)",
        }}
      >
        <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)" }} />
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
export function SeriesLegend({ items }) {
  return (
    <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5" style={{ fontSize: "var(--fs-5)", color: "var(--text-2)" }}>
          <span
            aria-hidden="true"
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

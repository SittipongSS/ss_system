"use client";
// ── แถบช่วงบริการของใบย้อนหลัง (ม็อก Step3 `.tl` · การ์ด "ช่วงบริการ" บนหน้าใบ) ────────────
//
// ⭐ เห็นทีเดียวว่า "เงินที่เก็บแล้วครอบถึงไหน · ที่เหลือครอบถึงไหน · วันนี้อยู่ตรงไหน"
//   ซึ่งเป็นสามข้อที่ตัวเลขในตารางตอบไม่ได้ (ผู้คีย์ต้องเทียบวันเองทุกครั้ง)
//
// ⚠️ **ไม่มี style={{…}} แม้แต่ที่เดียว** — งบ inlineStyle ของโมดูลขายเต็มเพดาน (audit:ui สองทาง)
//   ⇒ ความกว้างของแต่ละท่อนเป็น **แอตทริบิวต์ของ <rect>** ใน viewBox 0–100 (เปอร์เซ็นต์ของช่วงสัญญา)
//     และสีมาจากคลาสใน .module.css ⇒ ยืดตามความกว้างจริงด้วย preserveAspectRatio="none"
// ⚠️ presentational ล้วน — ไม่คิดว่าอะไรคือ "จ่ายแล้ว" เอง ผู้เรียกส่ง segments มาให้
import { fmtDate } from "@/lib/format";
import { daysBetween } from "@/lib/sales/paymentCoverage";
import styles from "./HistoricalOrderWizard.module.css";

const LEGEND = { paid: "เก็บแล้ว", due: "ยังต้องเก็บ", planned: "ยังไม่ถึงกำหนด", overdue: "เลยกำหนด" };

/**
 * @param segments `[{ key, kind: 'paid'|'due'|'planned'|'overdue', from, to, label }]` — ช่วงที่ทับกันเองก็วาดได้ (ซ้อนตามลำดับ)
 *   ⭐ 'planned' / 'overdue' (ฟอร์มคีย์ใบย้อนหลังขั้น ③ · มติ 25/09) แยกงวดที่ยังไม่ถึงกำหนดออกจากงวดที่เลยกำหนดแล้ว
 *   ⚠️ 'due' คงความหมายเดิม ("รอชำระ" ของหน้าใบสั่งขาย — `historicalCoverageSegments`) ไม่แตะสี/คำ
 * @param todayIso  วันไทยของผู้เรียก (businessDate) — ไม่ส่ง = ไม่มีเส้นวันนี้
 * @param legend    `[{ kind, text }]` คำอธิบายที่ผู้เรียกประกอบเอง (ยอด/จำนวนงวด) · ไม่ส่ง = คำตามชนิด + ป้ายท่อนแรก (แบบเดิม)
 */
export default function CoverageTimeline({ startDate, endDate, segments = [], todayIso = null, label = "ช่วงบริการตามสัญญา", legend = null }) {
  const span = daysBetween(startDate, endDate);
  if (!Number.isFinite(span) || span < 0) return null;
  const total = span + 1;
  const at = (iso) => {
    const offset = daysBetween(startDate, iso);
    if (!Number.isFinite(offset)) return null;
    return Math.min(100, Math.max(0, (offset / total) * 100));
  };

  const bars = (Array.isArray(segments) ? segments : []).map((segment, index) => {
    const from = at(segment?.from);
    const toOffset = daysBetween(startDate, segment?.to);
    if (from === null || !Number.isFinite(toOffset)) return null;
    const to = Math.min(100, Math.max(0, ((toOffset + 1) / total) * 100));
    const width = Math.max(0.6, to - from);   // ท่อนสั้นกว่านี้มองไม่เห็นเลย
    return { key: segment?.key || `${segment?.kind}-${index}`, kind: segment?.kind || "paid", from, width, label: segment?.label || "" };
  }).filter(Boolean);
  const today = todayIso ? at(todayIso) : null;
  const kinds = [...new Set(bars.map((bar) => bar.kind))];

  return (
    <div>
      <svg
        className={styles.timeline}
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} ${fmtDate(startDate)} ถึง ${fmtDate(endDate)}`}
      >
        <rect className={styles.tlBase} x="0" y="0" width="100" height="8" />
        {bars.map((bar) => (
          <rect key={bar.key} className={styles.tlSeg} data-kind={bar.kind} x={bar.from} y="0" width={bar.width} height="8">
            <title>{bar.label}</title>
          </rect>
        ))}
        {today === null ? null : (
          <rect className={styles.tlToday} x={Math.min(99.6, today)} y="0" width="0.4" height="8">
            <title>{`วันนี้ ${fmtDate(todayIso)}`}</title>
          </rect>
        )}
      </svg>
      <div className={styles.tlAxis}>
        <span>{fmtDate(startDate)}</span>
        <span>{fmtDate(endDate)}</span>
      </div>
      <div className={styles.tlLegend}>
        {Array.isArray(legend) ? legend.map((item) => (
          <span key={item.kind}>
            <i className={styles.tlDot} data-kind={item.kind} aria-hidden="true" />
            {item.text}
          </span>
        )) : kinds.map((kind) => (
          <span key={kind}>
            <i className={styles.tlDot} data-kind={kind} aria-hidden="true" />
            {LEGEND[kind] || kind}
            {bars.filter((bar) => bar.kind === kind).map((bar) => bar.label).filter(Boolean).slice(0, 1).map((text) => ` · ${text}`)}
          </span>
        ))}
        {today === null ? null : (
          <span><i className={styles.tlDot} data-kind="today" aria-hidden="true" />วันนี้ {fmtDate(todayIso)}</span>
        )}
      </div>
    </div>
  );
}

"use client";
// ── รอบถัดไปของ "เครดิตและรอบวางบิล" — ชิ้นร่วมของการ์ดบนหน้าลูกค้ากับโมดัล (รุ่นสอง · mig 0390) ──
//
// ⭐ ตัวคิดวันทั้งหมดอยู่ที่ `lib/sales/billingRule.js` — ไฟล์นี้แค่เลือกว่าจะโชว์อะไรแล้ววาด
//    (ห้ามคิดวันวางบิล/กำหนดชำระซ้ำตรงนี้ ไม่งั้นการ์ด/โมดัล/ชิปรอบบนใบสั่งขายจะพูดคนละวัน)
//    ข้อยกเว้นเดียว: ความกว้างของเดือนบนเส้นเวลา (เลขคณิตปฏิทินล้วนของภาพ ไม่ใช่วันที่ที่ไปถึงงวด)
// ⚠️ "วันนี้" = `businessDate()` นาฬิกาไทย — ผู้เรียกส่งเข้ามา
// ⚠️ ตรงเสาร์/อาทิตย์ = ป้ายเตือนอย่างเดียว **ไม่เลื่อนวัน** (มติเจ้าของ 26/09 ข้อ 1)
// ⚠️ หลายรอบต่อเดือน (มติ 26/09 ข้อ 3) — แถวรอบบอกว่าเป็นรอบไหน (`roundIndex` จาก billingRounds)
// ⚠️ เส้นเวลาเป็น SVG พิกัดเปอร์เซ็นต์ ไม่ใช่ `style={{ left }}` — เพดาน inline style ของโมดูลฐานข้อมูลขึ้นไม่ได้ (audit:ui)
//    (`<svg x="37%">` ซ้อนข้างใน = จุดเริ่มพิกัดของชิ้นนั้น ⇒ วงกลม/หัวลูกศร/ป้ายวางเป็นพิกเซลรอบจุดนั้นได้)
import { TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { TableScroll } from "@/components/ui/Table";
import { NA } from "@/lib/format";
import {
  billingRoundCount, billingRoundLabels, billingRounds, billingRuleOf, dueDateForBilling, formatBillingDate, formatRoundChip,
  weekendNote,
} from "@/lib/sales/billingRule";
import { daysBetween } from "@/lib/sales/paymentCoverage";
import styles from "./CustomerBillingRule.module.css";

/**
 * แถวที่จะโชว์ของรอบ
 * · รายเดือน = รอบถัดไปนับจากวันนี้ (ชิปชุดเดียวกับที่ SA แตะบนงวดของใบสั่งขาย) · หลายรอบต่อเดือนเรียงตามวัน
 *   จำนวน = อย่างน้อย `count` และไม่น้อยกว่าจำนวนรอบต่อเดือน (ลูกค้า 4 รอบต้องเห็นครบทุกรอบ)
 * · วางบิลได้ทุกวัน = ไม่มีรอบให้คิดล่วงหน้า (`billingRounds` คืน []) ⇒ "ถ้าวางบิลวันนี้" หนึ่งแถว
 * · ไม่มีเครดิต / ยังไม่ตั้ง = ไม่มีแถว (ผู้เรียกบอกเหตุเอง)
 * @returns `{ kind: 'unset'|'none'|'anyday'|'monthly', rows: [{ billingDate, dueDate, gap, roundIndex }] }`
 */
export function billingPreviewOf(value, todayIso, count = 3) {
  const rule = billingRuleOf(value);
  if (!rule) return { kind: "unset", rows: [] };
  if (rule.credit === false) return { kind: "none", rows: [] };
  if (!todayIso) return { kind: rule.billing.mode === "monthly" ? "monthly" : "anyday", rows: [] };
  const anyday = rule.billing.mode !== "monthly";
  const base = anyday
    ? [{ billingDate: todayIso, dueDate: dueDateForBilling(rule, todayIso), roundIndex: 0 }]
    : billingRounds(rule, todayIso, Math.max(count, billingRoundCount(rule)));
  return {
    kind: anyday ? "anyday" : "monthly",
    rows: base.map((row) => ({ ...row, gap: row.dueDate ? daysBetween(row.billingDate, row.dueDate) : null })),
  };
}

/* ป้ายของรอบบนแถว — เฉพาะลูกค้าหลายรอบ ("รอบวันที่ 10") · รอบเดียว = '' */
export function roundTagOf(value, roundIndex) {
  const labels = billingRoundLabels(value);
  return labels.length > 1 && labels[roundIndex] ? `รอบ${labels[roundIndex]}` : "";
}

/* ป้ายเตือนวันหยุดสุดสัปดาห์ — โทน warning (ไม่ใช่แดง: แดงสงวนให้ "เลยกำหนด" เท่านั้น) */
export function WeekendBadge({ date }) {
  const note = weekendNote(date);
  if (!note) return null;
  return <StatusBadge tone="warning" size="sm" icon={TriangleAlert} iconSize={11} label={note} />;
}

/* ตารางรอบถัดไปบนการ์ด — รอบ · วันวางบิล · เงินเข้า/กำหนดชำระ · ห่าง (หลายรอบ = ป้ายรอบใต้เลข) */
export function BillingRoundsTable({ rows, rule }) {
  return (
    <TableScroll family="list" surface="embedded" className={styles.roundsTable}>
      <table>
        <thead>
          <tr>
            <th>รอบ</th>
            <th>วันวางบิล</th>
            <th>เงินเข้า / กำหนดชำระ</th>
            <th className="num">ห่าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tag = roundTagOf(rule, row.roundIndex);
            return (
              <tr key={row.billingDate}>
                <td className={styles.roundNo}>
                  {index + 1}
                  {tag ? <span className={styles.roundNoTag}>{tag}</span> : null}
                </td>
                <td>
                  <span className={styles.dateCell}>{formatBillingDate(row.billingDate)}<WeekendBadge date={row.billingDate} /></span>
                </td>
                <td>
                  <span className={styles.dateCell}>{row.dueDate ? formatBillingDate(row.dueDate) : NA}<WeekendBadge date={row.dueDate} /></span>
                </td>
                <td className={`num ${styles.gap}`}>{row.gap === null ? NA : `${row.gap} วัน`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

/* รายการรอบในโมดัล (ม็อก modal-v2): ○ วันวางบิล ──ห่าง n วัน──→ ● วันเงินเข้า · กล่องแคบซ้อนสองบรรทัด
   `ghost` = ยังไม่ได้เลือกอะไร (โครงเปล่าบอกว่าผลจะขึ้นตรงนี้) · เงินเข้ายังไม่ครบ = ขีด
   ⚠️ ไม่มีป้ายรอบบนแถว — วันที่ของวันวางบิลบอกรอบอยู่แล้ว (ป้ายเพิ่มทำให้แถวตกสองบรรทัดชนเส้นเชื่อม) */
export function BillingRoundsList({ rows, ghost = false }) {
  if (ghost) {
    return (
      <ol className={styles.rounds} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span className={styles.rn}>{i + 1}</span>
            <span className={`${styles.rline} ${styles.rb}`}><span className={`${styles.node} ${styles.nodeGhost}`} /><span className={styles.sk} /></span>
            <span className={styles.rg}><span>{NA}</span><i className={styles.arr} /></span>
            <span className={`${styles.rline} ${styles.rp}`}><span className={`${styles.node} ${styles.nodeGhost}`} /><span className={`${styles.sk} ${styles.skWide}`} /></span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={styles.rounds}>
      {rows.map((row, i) => (
        <li key={row.billingDate}>
          <span className={styles.rn}>{rows.length > 1 ? i + 1 : ""}</span>
          <span className={`${styles.rline} ${styles.rb}`}>
            <span className={styles.node} aria-hidden="true" />
            <span className="sr-only">วางบิล</span>
            <b>{formatBillingDate(row.billingDate)}</b>
            <WeekendBadge date={row.billingDate} />
          </span>
          <span className={styles.rg}>
            <span>{row.gap === null || row.gap === undefined ? NA : `ห่าง ${row.gap} วัน`}</span>
            <i className={styles.arr} />
          </span>
          <span className={`${styles.rline} ${styles.rp}`}>
            <span className={`${styles.node} ${styles.nodeFill}`} aria-hidden="true" />
            <span className="sr-only">เงินเข้า</span>
            {row.dueDate ? <><b>{formatBillingDate(row.dueDate)}</b><WeekendBadge date={row.dueDate} /></> : <span className={styles.dash}>{NA}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ── เส้นเวลา ○ วางบิล → ● เงินเข้า บนแกนเดือน (ม็อก C) ────────────────────────────────── */
const partsOf = (iso) => iso.split("-").map(Number);
/* จำนวนวันของเดือน — ความกว้างของแถบเดือนบนภาพเท่านั้น (เลขคณิตปฏิทิน ไม่มีโซนเวลา) */
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const monthName = (iso) => formatRoundChip(iso).split(" ")[1] || "";

/* แถบเดือนที่คลุมสองวัน (อย่างน้อยสองเดือน ให้เห็นเส้นแบ่งเดือน) + ตำแหน่ง % ของวันบนแถบ */
function timelineOf(bill, pay) {
  const [ya, ma] = partsOf(bill);
  const [yb, mb] = partsOf(pay || bill);
  let start = ya * 12 + ma - 1;
  let end = yb * 12 + mb - 1;
  if (end < start) [start, end] = [end, start];
  if (end === start) end = start + 1;
  const months = [];
  for (let k = start; k <= end; k += 1) {
    const year = Math.floor(k / 12);
    const month = (k % 12) + 1;
    months.push({ year, month, days: daysInMonth(year, month) });
  }
  const total = months.reduce((sum, m) => sum + m.days, 0);
  let acc = 0;
  const bands = months.map((m) => {
    const band = { ...m, left: (acc / total) * 100, width: (m.days / total) * 100 };
    acc += m.days;
    return band;
  });
  const x = (iso) => {
    const [y, m, d] = partsOf(iso);
    const band = bands.find((b) => b.year === y && b.month === m);
    return band ? band.left + ((d - 0.5) / band.days) * band.width : 0;
  };
  return { bands, x };
}

const pct = (n) => `${n.toFixed(2)}%`;

/* ป้ายใต้เส้น: ○ วางบิล จ. 5 ต.ค. — ชิดขวาเมื่อจุดอยู่เกินครึ่งค่อนขวา (ไม่ล้นกล่อง) */
function Mark({ x, y, kind, label, date }) {
  const right = x > 58;
  const nodeClass = kind === "pay" ? styles.svgNodeFill : kind === "bad" ? styles.svgNodeBad : kind === "ghost" ? styles.svgNodeGhost : styles.svgNode;
  return (
    <svg x={pct(x)} y={y} overflow="visible">
      <circle cx={0} cy={-4} r={4} className={nodeClass} />
      <text x={right ? -9 : 9} y={0} textAnchor={right ? "end" : "start"} className={styles.svgMark}>
        <tspan className={styles.svgMarkKey}>{label}</tspan>{date ? ` ${date}` : ""}
      </text>
    </svg>
  );
}

/**
 * @param billingDate วันวางบิลของรอบที่โชว์ · `dueDate` เงินเข้า ('' = ยังไม่ครบ → เส้นประ "เงินเข้า ?")
 * @param back   เงินเข้าก่อนวันวางบิล (เหตุข้ามช่อง) → เส้นแดงย้อนหลัง
 * @param sample วางบิลได้ทุกวัน — ป้าย "เช่น วางบิล" (วันนี้เป็นตัวอย่าง ไม่ใช่รอบ)
 * @param ghost  ยังไม่ได้เลือกอะไร — โครงจาง
 */
export function BillingTimeline({ billingDate, dueDate = "", back = false, sample = false, ghost = false }) {
  if (ghost || !billingDate) {
    return (
      <svg className={styles.strip} width="100%" height="104" aria-hidden="true">
        <text x="0" y="12" className={styles.svgMonth}>เดือนที่วางบิล</text>
        <text x="50%" y="12" dx="6" className={styles.svgMonth}>เดือนถัดไป</text>
        <line x1="50%" x2="50%" y1="2" y2="54" className={styles.svgEdge} />
        <rect x="0" y="45" width="100%" height="6" rx="3" className={styles.svgTrack} />
        <line x1="16%" x2="16%" y1="48" y2="28" className={styles.svgSpanGhost} />
        <line x1="16%" x2="60%" y1="28" y2="28" className={styles.svgSpanGhost} />
        <line x1="60%" x2="60%" y1="28" y2="44" className={styles.svgSpanGhost} />
        <text x="38%" y="24" textAnchor="middle" className={`${styles.svgSpanLabel} ${styles.svgSpanLabelMuted}`}>ห่างกี่วัน</text>
        <circle cx="16%" cy="48" r="6" className={styles.svgNodeGhost} />
        <circle cx="60%" cy="48" r="6" className={styles.svgNodeGhost} />
        <Mark x={16} y={78} kind="ghost" label="วางบิล" />
        <Mark x={60} y={98} kind="ghost" label="เงินเข้า" />
      </svg>
    );
  }
  const { bands, x } = timelineOf(billingDate, dueDate || billingDate);
  const x1 = x(billingDate);
  const x2 = dueDate ? x(dueDate) : null;
  const gap = dueDate ? daysBetween(billingDate, dueDate) : null;
  const many = bands.length > 3;
  const lead = sample ? "เช่น วางบิล" : "วางบิล";
  let span;
  if (x2 === null) {
    const to = Math.min(x1 + 26, 96);
    span = (
      <>
        <line x1={pct(x1)} x2={pct(x1)} y1="48" y2="28" className={styles.svgSpanPending} />
        <line x1={pct(x1)} x2={pct(to)} y1="28" y2="28" className={styles.svgSpanPending} />
        <text x={pct(to)} y="24" textAnchor="middle" className={`${styles.svgSpanLabel} ${styles.svgSpanLabelMuted}`}>เงินเข้า ?</text>
      </>
    );
  } else {
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2, lo + 0.6);
    const cls = back ? styles.svgSpanBack : styles.svgSpan;
    const label = back ? `ก่อนวางบิล ${-gap} วัน` : gap === 0 ? "วันเดียวกัน" : `${gap} วัน`;
    /* หัวลูกศรชี้ลงที่ปลายทาง (เงินเข้า) — ย้อนหลัง = ปลายทางอยู่ซ้าย */
    const headX = back ? lo : hi;
    span = (
      <>
        <line x1={pct(lo)} x2={pct(lo)} y1={back ? "40" : "48"} y2="28" className={cls} />
        <line x1={pct(lo)} x2={pct(hi)} y1="28" y2="28" className={cls} />
        <line x1={pct(hi)} x2={pct(hi)} y1="28" y2={back ? "48" : "40"} className={cls} />
        <svg x={pct(headX)} y="40" overflow="visible">
          <path d="M-5 0 L5 0 L0 7 Z" className={back ? styles.svgHeadBack : styles.svgHead} />
        </svg>
        <text x={pct((lo + hi) / 2)} y="23" textAnchor="middle" className={`${styles.svgSpanLabel} ${back ? styles.svgSpanLabelBack : ""}`}>{label}</text>
      </>
    );
  }
  const title = `เส้นเวลา: ${lead} ${formatBillingDate(billingDate)}${dueDate ? ` เงินเข้า ${formatBillingDate(dueDate)}` : ""}`;
  return (
    <svg className={styles.strip} width="100%" height="104" role="img" aria-label={title}>
      {bands.map((band, i) => (
        <g key={`${band.year}-${band.month}`}>
          {i > 0 ? <line x1={pct(band.left)} x2={pct(band.left)} y1="2" y2="54" className={styles.svgEdge} /> : null}
          {band.width > 7 ? (
            <text x={pct(band.left)} y="12" dx={i > 0 ? 6 : 0} className={styles.svgMonth}>
              {many ? monthName(`${band.year}-${String(band.month).padStart(2, "0")}-01`) : `${monthName(`${band.year}-${String(band.month).padStart(2, "0")}-01`)} ${band.year}`}
            </text>
          ) : null}
          <rect x={pct(band.left)} y="45" width={pct(band.width)} height="6" className={i % 2 ? styles.svgTrackAlt : styles.svgTrack} />
        </g>
      ))}
      {span}
      <circle cx={pct(x1)} cy="48" r="6" className={styles.svgNode} />
      {x2 !== null ? <circle cx={pct(x2)} cy="48" r="6" className={back ? styles.svgNodeBad : styles.svgNodeFill} /> : null}
      <Mark x={x1} y={78} kind="bill" label={lead} date={formatBillingDate(billingDate, { withYear: false })} />
      {x2 !== null ? <Mark x={x2} y={98} kind={back ? "bad" : "pay"} label="เงินเข้า" date={formatBillingDate(dueDate, { withYear: false })} /> : null}
    </svg>
  );
}

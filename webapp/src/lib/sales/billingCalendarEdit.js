// ── ตัวช่วยจอแก้ "ปฏิทินรายปีของลูกค้า" (ตารางรอบจ่าย เดือน × รอบ · มติเจ้าของ 29/09) — JS ล้วน ไม่อ่านนาฬิกา ไม่แตะฐาน ──
//
// แบบที่ตามคือม็อก mockups/billing-cycle/calendar-v3/recommended.html (+ recommended.js) ที่กรรมการทั้งสองเลือก:
//   · ตารางเดือน × รอบ (≤4) ช่องละคู่ วันตัดรอบ (Cutoff) → วันจ่าย (Paydate) · พิมพ์เลขวัน "15" = วันที่ 15 ของเดือนแถว ·
//     วันจ่ายเลขน้อยกว่าวันตัดรอบ = เดือนถัดไป (ข้ามเดือน → มีคำเตือนถ้าผิดจากรอบอื่น) · "5/1" = 5 ม.ค. (จ่ายข้ามปี)
//   · "ร่างจากรอบประจำ" ลง **เฉพาะช่องที่ว่าง** (ไม่ทับที่คนพิมพ์) · วันร่างที่ตรงเสาร์/อาทิตย์/วันหยุดในระบบ = ธง + วันทำงาน
//     ก่อน/หลังให้แตะ — ระบบไม่เลื่อนเอง · เดือนที่ร่างลงต้องแตะ "ตรงกับรูป" ก่อนบันทึก (ร่างที่ยังไม่เทียบ = บันทึกไม่ได้)
//   · ปฏิทินเล็ก อา–ส (มติ 26/09) ใต้รูปของลูกค้า — แตะวันเพื่อใส่ช่องที่เลือก แล้วเลื่อนไปช่องถัดไป
//   · แท็บปี (2026 · 2027 ยังไม่มี) · เดือนที่ผ่านแล้วพับได้ ไม่กรอกก็บันทึกได้
// ⚠️ ไม่มี "สูตรประมาณการ" (มติ 29/09 Q3 หยุดรอปฏิทินใหม่) — รอบประจำใช้ร่างเท่านั้น **ไม่เก็บ** ไม่ใช้คิดวันของปีที่ยังไม่มี
//    (คำในม็อก "รูปแบบนี้เก็บไว้เป็นประมาณการของปีที่ยังไม่มีปฏิทินด้วย" เลิกแล้ว)
// ⚠️ ตัวคิดวัน/ตัวตรวจรูปอยู่ที่ billingRuleV4.js ตัวเดียว (validateCalendarYear · draftCalendarYear · deriveFormula) — ไฟล์นี้แปลง
//    "สิ่งที่คนพิมพ์ในตาราง" ⇄ runs และถือสถานะของจอ (ร่าง · ยังไม่เทียบ) · ผลสุดท้ายส่งเข้า ruleFromForm({ calendar }) → normalizeRule
//
// สถานะของตัวแก้ (ค่าธรรมดา — ใช้เป็น React state ได้ ทุกฟังก์ชันคืนก้อนใหม่ ไม่แก้ของเดิม):
//   {
//     roundsN: 1..4,                                   // จำนวนคอลัมน์รอบที่โชว์ (ทุกปีเท่ากัน)
//     years: { 'YYYY': {
//       cells: [12][roundsN] { c: '9', p: '15' },      // ข้อความที่พิมพ์ (ไม่ใช่วันที่) · ว่าง = ''
//       draft: ['mi-ri-c' | 'mi-ri-p'],                // ช่องที่มาจากร่างและยังไม่มีคนแตะ
//       flags: { 'mi-ri-c': { field, text, before, after } },  // ร่างที่ตรงวันหยุด — ตัวเลือกวันทำงานก่อน/หลัง
//       unchecked: [mi],                               // เดือนที่ร่างลงแล้วยังไม่แตะ "ตรงกับรูป"
//       fileId: '' } }                                 // รูปปฏิทินปีนั้น (attachments.id) — ruleFromForm ส่งเป็น years[YYYY].fileId
//   }
import {
  PAY_GAP_MAX_DAYS, ROUNDS_MAX, dateOf, daysBetween, deriveFormula, draftCalendarYear, fmtDate, iso, lastDayOf, ruleOf,
  validateCalendarYear, weekdayOf, weekendNote,
} from './billingRuleV4.js';

export const CALENDAR_EDIT_ROUNDS_DEFAULT = 2;   // ปฏิทินใหม่เปิดมาสองรอบต่อเดือน (มีเมตตา · ลูกค้าส่วนใหญ่ที่มีปฏิทิน) — เพิ่ม/ลดได้
/* วันจ่ายข้ามเดือนต่างจากรอบอื่นเกินกี่วัน = เตือน "ตรวจกับรูป" (พิมพ์ 5 แทน 25) */
export const ROLLOVER_GAP_TOLERANCE = 7;
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const CALENDAR_WEEKDAY_HEADS = Object.freeze([...WEEKDAYS_TH]);   // หัวปฏิทินเล็ก อา–ส (มติ 26/09)

const partsOf = (day) => day.split('-').map(Number);
const monthOf = (y, m) => { const k = y * 12 + (m - 1); return { year: Math.floor(k / 12), month: (((k % 12) + 12) % 12) + 1 }; };
const cellKey = (mi, ri, kind) => `${mi}-${ri}-${kind}`;
const blank = () => ({ c: '', p: '' });
const holidayNameOf = (holidays, day) => {
  if (holidays instanceof Map) return holidays.has(day) ? String(holidays.get(day) || '') : null;
  if (holidays instanceof Set) return holidays.has(day) ? '' : null;
  return null;
};
const clampRounds = (n) => Math.min(ROUNDS_MAX, Math.max(1, Number(n) || CALENDAR_EDIT_ROUNDS_DEFAULT));

/* ── ช่องของตาราง: ข้อความ ⇄ วันจริง ─────────────────────────────────────────────────────────────── */
/**
 * ข้อความในช่อง → วันจริง (สำเนา parseCell ของม็อก)
 * @param kind 'c' วันตัดรอบ (ต้องอยู่ในเดือนแถว) · 'p' วันจ่าย (`cutIso` = วันตัดรอบของคู่ — เลขน้อยกว่า = เดือนถัดไป · rolled:true)
 * @returns `{ iso: null }` (ว่าง) · `{ iso, rolled }` · `{ iso: null, err }`
 */
export function parseCalendarCell(year, month, raw, kind, cutIso = null) {
  const t = String(raw ?? '').trim();
  if (!t) return { iso: null };
  const mt = t.match(/^(\d{1,2})(?:\s*[/.-]\s*(\d{1,2}))?$/);
  if (!mt) return { iso: null, err: 'พิมพ์เลขวัน เช่น 15 หรือ 5/1' };
  const d = Number(mt[1]);
  let yy = year;
  let mo = month;
  let rolled = false;
  if (mt[2]) {
    mo = Number(mt[2]);
    if (mo < 1 || mo > 12) return { iso: null, err: 'เดือนต้องเป็น 1–12' };
    if (kind === 'c' && mo !== month) return { iso: null, err: `วันตัดรอบต้องอยู่ใน ${MONTHS_TH[month - 1]}` };
    if (kind === 'p' && mo < month) yy = year + 1;
  } else if (kind === 'p' && cutIso && d < partsOf(cutIso)[2]) {
    ({ year: yy, month: mo } = monthOf(year, month + 1));
    rolled = true;
  }
  if (d < 1 || d > lastDayOf(yy, mo)) return { iso: null, err: `${MONTHS_TH[mo - 1]} มี ${lastDayOf(yy, mo)} วัน` };
  const out = iso(yy, mo, d);
  if (kind === 'p' && cutIso && out < cutIso) return { iso: null, err: 'ก่อนวันตัดรอบ' };
  /* ด่านเดียวกับ validateCalendarYear (ตัดรอบ → จ่าย ≤ 120 วัน) แต่ชี้ที่ช่อง — "15/3" ที่ตั้งใจพิมพ์ "15" ต้องแดงที่ช่องนั้น
     ไม่ใช่แค่ "ตารางมี 1 ช่องที่ต้องแก้" โดยไม่มีช่องไหนแดง */
  if (kind === 'p' && cutIso && daysBetween(cutIso, out) > PAY_GAP_MAX_DAYS) return { iso: null, err: `ห่างวันตัดรอบเกิน ${PAY_GAP_MAX_DAYS} วัน — ตรวจเดือน` };
  return { iso: out, rolled };
}
/**
 * วันจริง → ข้อความในช่องของแถว (year, month) — วันตัดรอบ = เลขวัน · วันจ่ายเดือนเดียวกัน = เลขวัน · ข้ามเดือน = "d/m"
 * @returns `{ text, err }` (วันตัดรอบนอกเดือนแถว = err)
 */
export function cellTextOf(dayIso, year, month, kind) {
  const day = dateOf(dayIso);
  if (!day) return { text: '', err: 'วันที่ไม่ถูกต้อง' };
  const [y, m, d] = partsOf(day);
  if (kind === 'c' && (y !== year || m !== month)) return { text: '', err: `วันตัดรอบต้องอยู่ใน ${MONTHS_TH[month - 1]}` };
  return { text: y === year && m === month ? String(d) : `${d}/${m}`, err: null };
}

/* ── สร้างสถานะ ────────────────────────────────────────────────────────────────────────────── */
export function emptyCalendarYear(roundsN = CALENDAR_EDIT_ROUNDS_DEFAULT) {
  const n = clampRounds(roundsN);
  return { cells: Array.from({ length: 12 }, () => Array.from({ length: n }, blank)), draft: [], flags: {}, unchecked: [], fileId: '' };
}
const withRounds = (yearState, n) => ({
  ...yearState,
  cells: yearState.cells.map((row) => (row.length >= n ? row.slice(0, n) : [...row, ...Array.from({ length: n - row.length }, blank)])),
});
/**
 * สถานะเริ่มของตัวแก้จากกติกาที่เก็บ (หรือ null = ปฏิทินใหม่) — มีปีของวันนี้ + ปีหน้าเสมอ (แท็บ "2027 ยังไม่มี")
 * @param value กติกาที่เก็บ (ทุกรุ่น) — ไม่ใช่ปฏิทิน = ตารางว่าง
 */
export function calendarEditorOf(value, { todayIso, roundsN = CALENDAR_EDIT_ROUNDS_DEFAULT } = {}) {
  const rule = ruleOf(value);
  const years = rule?.runs?.kind === 'calendar' ? rule.runs.years : {};
  let n = clampRounds(roundsN);
  for (const key of Object.keys(years)) {
    const perMonth = new Map();
    for (const r of years[key].runs) perMonth.set(r.cutoff.slice(5, 7), (perMonth.get(r.cutoff.slice(5, 7)) || 0) + 1);
    n = Math.max(n, ...perMonth.values());
  }
  n = Math.min(ROUNDS_MAX, n);
  const state = { roundsN: n, years: {} };
  for (const key of Object.keys(years)) {
    const y = Number(key);
    const ys = emptyCalendarYear(n);
    const used = new Map();
    for (const r of years[key].runs) {
      const mi = partsOf(r.cutoff)[1] - 1;
      const ri = used.get(mi) || 0;
      used.set(mi, ri + 1);
      ys.cells[mi][ri] = { c: cellTextOf(r.cutoff, y, mi + 1, 'c').text, p: cellTextOf(r.pay, y, mi + 1, 'p').text };
    }
    ys.fileId = years[key].fileId || '';
    state.years[key] = ys;
  }
  const today = dateOf(todayIso);
  if (today) {
    const ty = partsOf(today)[0];
    for (const y of [ty, ty + 1]) if (!state.years[String(y)]) state.years[String(y)] = emptyCalendarYear(n);
  }
  return state;
}
const yearOf = (state, year) => state?.years?.[String(year)] || emptyCalendarYear(state?.roundsN);
const putYear = (state, year, next) => ({ ...state, years: { ...state.years, [String(year)]: next } });

/* ── อ่านสถานะ ─────────────────────────────────────────────────────────────────────────────── */
/**
 * ช่องหนึ่งคู่ → วันจริงสองวัน + ข้อผิดพลาด (วันตัดรอบต้องหลังรอบก่อนหน้าในเดือนเดียวกัน)
 * @returns `{ c: {iso, err?}, p: {iso, rolled?, err?}, cell }`
 */
export function calendarCellInfo(state, year, mi, ri) {
  const ys = yearOf(state, year);
  const y = Number(year);
  const m = mi + 1;
  const cell = ys.cells[mi]?.[ri] || blank();
  const c = parseCalendarCell(y, m, cell.c, 'c');
  if (c.iso && ri > 0) {
    const prev = parseCalendarCell(y, m, ys.cells[mi][ri - 1]?.c, 'c');
    if (prev.iso && c.iso <= prev.iso) Object.assign(c, { iso: null, err: `ต้องหลังวันตัดรอบ รอบ ${ri}` });
  }
  const p = parseCalendarCell(y, m, cell.p, 'p', c.iso);
  return { c, p, cell };
}
/* คู่วันที่ครบและอ่านได้ของปีนั้น (เรียงวันตัดรอบ) — รูปเดียวกับ `years[YYYY].runs` ของกติกา */
export function calendarYearRuns(state, year) {
  const ys = yearOf(state, year);
  const out = [];
  ys.cells.forEach((row, mi) => row.forEach((_, ri) => {
    const { c, p } = calendarCellInfo(state, year, mi, ri);
    if (c.iso && p.iso) out.push({ cutoff: c.iso, pay: p.iso });
  }));
  return out.sort((a, b) => (a.cutoff < b.cutoff ? -1 : a.cutoff > b.cutoff ? 1 : 0));
}
/**
 * แท็บปี — ปีที่มีในสถานะ (รวมปีนี้/ปีหน้า) · `label` "2026" หรือ "2027 ยังไม่มี"
 * @returns `[{ year, count, has, label, current }]`
 */
export function calendarYearTabs(state, todayIso) {
  const ty = dateOf(todayIso) ? partsOf(todayIso)[0] : null;
  return Object.keys(state?.years || {}).map(Number).sort((a, b) => a - b).map((year) => {
    const count = calendarYearRuns(state, year).length;
    return { year, count, has: count > 0, label: count > 0 ? String(year) : `${year} ยังไม่มี`, current: year === ty };
  });
}
/* เดือนที่ผ่านแล้วของปีนั้น (พับได้ · ไม่กรอกก็บันทึกได้) — ปีก่อน = 12 · ปีนี้ = เดือนก่อนเดือนนี้ · ปีหน้า = 0 */
export function calendarPastMonths(year, todayIso) {
  const today = dateOf(todayIso);
  if (!today) return 0;
  const [ty, tm] = partsOf(today);
  const y = Number(year);
  return y < ty ? 12 : y === ty ? tm - 1 : 0;
}

/* ── แก้ ─────────────────────────────────────────────────────────────────────────────────── */
/* คนแตะช่องเอง = ช่องนั้นไม่ใช่ร่างแล้ว + เดือนนั้นถือว่าคนดูแล้ว (ม็อก touchCell) */
function touch(ys, mi, ri, kind) {
  const key = cellKey(mi, ri, kind);
  const flags = { ...ys.flags };
  delete flags[key];
  return { ...ys, draft: ys.draft.filter((k) => k !== key), flags, unchecked: ys.unchecked.filter((x) => x !== mi) };
}
/** พิมพ์ในช่อง (ข้อความดิบ · ตรวจตอนอ่าน) */
export function setCalendarCell(state, year, mi, ri, kind, textValue) {
  const ys = yearOf(state, year);
  if (!ys.cells[mi] || ri >= ys.cells[mi].length || !['c', 'p'].includes(kind)) return state;
  const cells = ys.cells.map((row, i) => (i === mi ? row.map((cell, j) => (j === ri ? { ...cell, [kind]: String(textValue ?? '').trim().slice(0, 5) } : cell)) : row));
  return putYear(state, year, touch({ ...ys, cells }, mi, ri, kind));
}
/* ช่องถัดไปหลังใส่ (ตัด → จ่าย → รอบถัดไป → เดือนถัดไป) · หมดปี = null · target = { year, mi, ri, kind } */
export function nextCalendarCell(state, target) {
  if (!target) return null;
  if (target.kind === 'c') return { ...target, kind: 'p' };
  if (target.ri + 1 < (state?.roundsN || 1)) return { ...target, ri: target.ri + 1, kind: 'c' };
  if (target.mi < 11) return { ...target, mi: target.mi + 1, ri: 0, kind: 'c' };
  return null;
}
/**
 * แตะวันในปฏิทินเล็ก → ใส่ช่องที่เลือก แล้วชี้ช่องถัดไป
 * @returns `{ state, error, next }` (error = ไม่แก้สถานะ เช่น วันตัดรอบนอกเดือนแถว)
 */
export function fillCalendarCellFromDay(state, target, dayIso) {
  if (!target) return { state, error: 'แตะช่องในตารางก่อน แล้วแตะวันในเดือน', next: null };
  const { text: t, err } = cellTextOf(dayIso, Number(target.year), target.mi + 1, target.kind);
  if (err) return { state, error: err, next: target };
  return { state: setCalendarCell(state, target.year, target.mi, target.ri, target.kind, t), error: null, next: nextCalendarCell(state, target) };
}
/* เพิ่มคอลัมน์รอบ (≤4) — ทุกปีพร้อมกัน */
export function addCalendarRound(state) {
  if ((state?.roundsN || 1) >= ROUNDS_MAX) return state;
  const n = state.roundsN + 1;
  const years = {};
  for (const [key, ys] of Object.entries(state.years)) years[key] = withRounds(ys, n);
  return { ...state, roundsN: n, years };
}
/* เอาคอลัมน์รอบสุดท้ายออก — ได้เฉพาะเมื่อว่างทุกปี (ไม่ลบวันที่คนพิมพ์เงียบ ๆ) · @returns `{ state, error }` */
export function removeCalendarRound(state) {
  const n = state?.roundsN || 1;
  if (n <= 1) return { state, error: 'ต้องมีอย่างน้อยหนึ่งรอบ' };
  const used = Object.values(state.years).some((ys) => ys.cells.some((row) => row[n - 1] && (row[n - 1].c || row[n - 1].p)));
  if (used) return { state, error: `รอบ ${n} ยังมีวันที่อยู่ — ล้างช่องก่อน` };
  const years = {};
  for (const [key, ys] of Object.entries(state.years)) {
    years[key] = {
      ...withRounds(ys, n - 1),
      draft: ys.draft.filter((k) => !k.includes(`-${n - 1}-`)),
      flags: Object.fromEntries(Object.entries(ys.flags).filter(([k]) => !k.includes(`-${n - 1}-`))),
    };
  }
  return { state: { ...state, roundsN: n - 1, years }, error: null };
}
export function setCalendarFile(state, year, fileId) {
  return putYear(state, year, { ...yearOf(state, year), fileId: String(fileId || '').slice(0, 64) });
}

/* ── ร่างจาก "รอบประจำ" ─────────────────────────────────────────────────────────────────────── */
/**
 * รอบประจำตั้งต้นของแผงร่าง — สูตรที่ใกล้ปฏิทินที่สุด (deriveFormula) ของปีที่มีวันมากที่สุด (เท่ากัน = ปีที่ใกล้ `year` · ปีหลังก่อน)
 * ⇒ ร่างปี 2027 ได้รอบประจำจากปี 2026 ทั้งปี ไม่ใช่จากสองสามช่องที่เพิ่งพิมพ์ในปี 2027 · ไม่มีวันเลย = null (คนใส่เอง)
 * @returns null | `[{ cutoffDay, payDay, payMonthOffset }]` (มีเมตตา 2026 → ตัด 8 → 15 · ตัด 22 → 30)
 */
export function calendarPatternOf(state, year = null) {
  const target = year === null || year === undefined ? null : Number(year);
  const ranked = Object.keys(state?.years || {}).map(Number)
    .map((y) => ({ y, runs: calendarYearRuns(state, y) }))
    .filter((x) => x.runs.length)
    .sort((a, b) => b.runs.length - a.runs.length
      || (target === null ? 0 : Math.abs(a.y - target) - Math.abs(b.y - target))
      || b.y - a.y);
  return ranked.length ? deriveFormula(ranked[0].runs) : null;
}
/**
 * ร่างปีหนึ่งลงตาราง — ⭐ **ลงเฉพาะคู่ที่ว่างทั้งสองช่อง** (ค่าตั้งต้น) · `overwrite:true` = ทับทั้งปี (ปุ่มแยก · คนเลือกเอง)
 * ช่องที่ลงได้เครื่องหมายร่าง + เดือนนั้นต้องแตะ "ตรงกับรูป" · วันที่ตรงเสาร์/อาทิตย์/วันหยุดได้ธง + วันทำงานก่อน/หลัง (ไม่เลื่อนเอง)
 * @param pattern `[{ cutoffDay, payDay, payMonthOffset }]` (payDay < cutoffDay ในเดือนเดียวกัน = ถือว่าเดือนถัดไป)
 * @param fromMonth 1..12 — ไม่ร่างเดือนก่อนหน้านี้ (เดือนที่ผ่านแล้ว)
 * @returns `{ state, filled, flagged, error }` · filled = จำนวนคู่ที่ลง
 */
export function draftCalendarFromPattern(state, year, pattern, { holidays = null, fromMonth = 1, overwrite = false } = {}) {
  const rounds = (pattern || [])
    .filter((r) => Number(r?.cutoffDay) && Number(r?.payDay))
    .map((r) => {
      const cutoffDay = Number(r.cutoffDay);
      const payDay = Number(r.payDay);
      const off = Number(r.payMonthOffset) ? 1 : 0;
      return { cutoffDay, payDay, payMonthOffset: off === 0 && payDay < cutoffDay ? 1 : off };
    });
  if (!rounds.length) return { state, filled: 0, flagged: 0, error: 'ใส่วันตัดรอบและวันจ่ายอย่างน้อยหนึ่งรอบ' };
  const { runs, error } = draftCalendarYear(year, rounds, { holidays, fromMonth });
  if (error) return { state, filled: 0, flagged: 0, error };
  const byMonth = Array.from({ length: 12 }, () => []);
  for (const r of runs) byMonth[partsOf(r.cutoff)[1] - 1].push(r);
  const need = Math.min(ROUNDS_MAX, Math.max(state.roundsN, ...byMonth.map((list) => list.length)));
  let next = state;
  while (next.roundsN < need) next = addCalendarRound(next);
  const y = Number(year);
  const ys = yearOf(next, y);
  const draft = new Set(ys.draft);
  const flags = { ...ys.flags };
  const unchecked = new Set(ys.unchecked);
  let filled = 0;
  let flagged = 0;
  const m0 = Math.min(12, Math.max(1, Number(fromMonth) || 1));
  const cells = ys.cells.map((row, mi) => row.map((cell, ri) => {
    if (mi + 1 < m0) return cell;
    const r = byMonth[mi][ri];
    const touched = Boolean(cell.c || cell.p);
    if (touched && !overwrite) return cell;
    if (!r) return overwrite ? blank() : cell;
    filled += 1;
    for (const kind of ['c', 'p']) {
      draft.add(cellKey(mi, ri, kind));
      delete flags[cellKey(mi, ri, kind)];
    }
    for (const f of r.flags) {
      flags[cellKey(mi, ri, f.field === 'cutoff' ? 'c' : 'p')] = f;
      flagged += 1;
    }
    unchecked.add(mi);
    return { c: cellTextOf(r.cutoff, y, mi + 1, 'c').text, p: cellTextOf(r.pay, y, mi + 1, 'p').text };
  }));
  const out = putYear(next, y, { ...ys, cells, draft: [...draft], flags, unchecked: [...unchecked].sort((a, b) => a - b) });
  return { state: out, filled, flagged, error: null };
}
/* สรุปก่อนกด "ร่างลงตาราง" — "ร่าง 24 รอบ · ลงช่องว่าง 6 คู่ · 3 วันตรงเสาร์/อาทิตย์/วันหยุด" */
export function calendarDraftPreview(state, year, pattern, opts = {}) {
  const { filled, flagged, error } = draftCalendarFromPattern(state, year, pattern, opts);
  if (error) return { filled: 0, flagged: 0, error, text: error };
  return { filled, flagged, error: null, text: `ร่างลง${opts.overwrite ? 'ทั้งปี' : 'ช่องว่าง'} ${filled} คู่ · ${flagged} วันตรงเสาร์/อาทิตย์/วันหยุด มีวันทำงานก่อน/หลังให้แตะ — ระบบไม่เลื่อนเอง` };
}
/* แตะ "ตรงกับรูป" ของเดือน — ช่องร่างของเดือนนั้นกลายเป็นวันที่ยืนยันแล้ว */
export function confirmCalendarMonth(state, year, mi) {
  const ys = yearOf(state, year);
  const flags = Object.fromEntries(Object.entries(ys.flags).filter(([k]) => !k.startsWith(`${mi}-`)));
  return putYear(state, year, { ...ys, draft: ys.draft.filter((k) => !k.startsWith(`${mi}-`)), flags, unchecked: ys.unchecked.filter((x) => x !== mi) });
}
/* แตะวันทำงานก่อน/หลังของร่างที่ตรงวันหยุด = คนเลือกเอง (เท่ากับพิมพ์) */
export function pickCalendarAlternative(state, year, mi, ri, kind, dayIso) {
  const { text: t, err } = cellTextOf(dayIso, Number(year), mi + 1, kind);
  return err ? state : setCalendarCell(state, year, mi, ri, kind, t);
}

/* ── ตรวจ + คำเตือน ─────────────────────────────────────────────────────────────────────────── */
/**
 * วันจ่ายที่ "ข้ามเดือนเอง" (พิมพ์เลขน้อยกว่าวันตัดรอบ) แล้วดูผิดจากรอบอื่นของปี = เตือนให้ตรวจกับรูป (พิมพ์ 5 แทน 25)
 * เตือนเมื่อ ลูกค้าปกติจ่ายเดือนเดียวกัน (รอบที่ข้ามเดือน < ครึ่ง) หรือระยะตัด→จ่ายต่างจากค่ากลางเกิน 7 วัน
 * @returns `[{ mi, ri, cutoff, pay, gap, median, text }]`
 */
export function calendarRollovers(state, year) {
  const runs = calendarYearRuns(state, year);
  if (!runs.length) return [];
  const gaps = runs.map((r) => daysBetween(r.cutoff, r.pay)).sort((a, b) => a - b);
  const median = gaps[Math.floor((gaps.length - 1) / 2)];
  const share = runs.filter((r) => r.pay.slice(0, 7) !== r.cutoff.slice(0, 7)).length / runs.length;
  const out = [];
  yearOf(state, year).cells.forEach((row, mi) => row.forEach((_, ri) => {
    const { c, p } = calendarCellInfo(state, year, mi, ri);
    if (!c.iso || !p.iso || !p.rolled) return;
    const gap = daysBetween(c.iso, p.iso);
    if (share < 0.5 || Math.abs(gap - median) > ROLLOVER_GAP_TOLERANCE) {
      out.push({ mi, ri, cutoff: c.iso, pay: p.iso, gap, median, text: `วันจ่ายรอบ ${ri + 1} ข้ามไป ${fmtDate(p.iso, { withYear: false })} ห่าง ${gap} วัน (รอบอื่น ~${median} วัน) — ตรวจกับรูป` });
    }
  }));
  return out;
}
/**
 * คำเตือนของแถวเดือนหนึ่ง (คอลัมน์ "ตรวจกับรูป · คำเตือน") — ตัวเดียวของตาราง/การ์ดมือถือ
 * @returns `[{ kind: 'bad'|'half'|'draft'|'alt'|'weekend'|'holiday'|'rolled', ri?, field?, text, before?, after? }]`
 *   'draft' = เดือนนี้ร่างแล้วยังไม่ได้เทียบ (ปุ่ม "ตรงกับรูป") · 'alt' = ร่างตรงวันหยุด มี before/after ให้แตะ
 */
export function calendarRowWarnings(state, year, mi, { holidays = null } = {}) {
  const ys = yearOf(state, year);
  const y = Number(year);
  const m = mi + 1;
  const out = [];
  if (ys.unchecked.includes(mi)) out.push({ kind: 'draft', text: 'ร่าง · ยังไม่ได้เทียบกับรูป' });
  const rolled = new Map(calendarRollovers(state, year).filter((r) => r.mi === mi).map((r) => [r.ri, r]));
  ys.cells[mi].forEach((_, ri) => {
    const info = calendarCellInfo(state, year, mi, ri);
    if (Boolean(info.cell.c) !== Boolean(info.cell.p) && !info.c.err && !info.p.err) {
      out.push({ kind: 'half', ri, text: `รอบ ${ri + 1}: ใส่${info.cell.c ? 'วันจ่าย' : 'วันตัดรอบ'}ด้วย` });
    }
    for (const kind of ['c', 'p']) {
      const r = info[kind];
      const who = kind === 'c' ? 'วันตัดรอบ' : 'วันจ่าย';
      if (r.err) { out.push({ kind: 'bad', ri, field: kind, text: `${who} รอบ ${ri + 1}: ${r.err}` }); continue; }
      if (!r.iso) continue;
      const flag = ys.flags[cellKey(mi, ri, kind)];
      if (flag && ys.draft.includes(cellKey(mi, ri, kind))) {
        /* ชิปที่ใส่ลงช่องนี้ไม่ได้ (วันตัดรอบข้ามเดือนแถว: สิ้นเดือนตรงอาทิตย์ → "จ. 1 ก.พ." · วันจ่ายก่อนวันตัดรอบ) ไม่โชว์
           — เคยแตะแล้วเงียบ ไม่มีอะไรเกิด */
        const fits = (alt) => {
          if (!alt) return false;
          const { text: t, err } = cellTextOf(alt, y, m, kind);
          return !err && parseCalendarCell(y, m, t, kind, kind === 'p' ? info.c.iso : null).iso === alt;
        };
        const before = fits(flag.before) ? flag.before : null;
        const after = fits(flag.after) ? flag.after : null;
        out.push({ kind: 'alt', ri, field: kind, text: `ร่าง ${fmtDate(r.iso, { withYear: false })} ${flag.text} · ระบบไม่เลื่อนให้${before || after ? ' เลือก:' : ' — ตรวจกับรูป'}`, before, after });
        continue;
      }
      const we = weekendNote(r.iso);
      if (we) out.push({ kind: 'weekend', ri, field: kind, text: `${who} ${fmtDate(r.iso, { withYear: false })} ${we}` });
      const hol = holidayNameOf(holidays, r.iso);
      if (hol !== null) out.push({ kind: 'holiday', ri, field: kind, text: `${who} ${fmtDate(r.iso, { withYear: false })} ตรงวันหยุดในระบบ${hol ? ` (${hol})` : ''} — ลูกค้าประกาศเอง ใช้ตามรูป` });
    }
    if (rolled.has(ri)) out.push({ kind: 'rolled', ri, field: 'p', text: rolled.get(ri).text });
  });
  return out;
}
/**
 * ด่านก่อนบันทึก (ปุ่มยืนยันของโมดัลถามตัวนี้ — ตัวเดียวกับที่ normalizeRule จะตีกลับ + สถานะของจอ)
 * @returns `{ ok, errors: [{ year, mi, ri, text }], unchecked: [{ year, mi, label }], messages: string[] }`
 *   ok:false เมื่อ: ช่องอ่านไม่ได้ · คู่ครึ่งเดียว · ร่างที่ยังไม่ได้เทียบ · ปีที่ validateCalendarYear ตีกลับ · ไม่มีวันเลยสักปี
 */
export function calendarEditorIssues(state) {
  const errors = [];
  const unchecked = [];
  const messages = [];
  let total = 0;
  for (const key of Object.keys(state?.years || {}).sort()) {
    const ys = state.years[key];
    ys.cells.forEach((row, mi) => row.forEach((_, ri) => {
      const info = calendarCellInfo(state, key, mi, ri);
      if (info.c.err) errors.push({ year: Number(key), mi, ri, text: `${MONTHS_TH[mi]} ${key} รอบ ${ri + 1}: วันตัดรอบ ${info.c.err}` });
      if (info.p.err) errors.push({ year: Number(key), mi, ri, text: `${MONTHS_TH[mi]} ${key} รอบ ${ri + 1}: วันจ่าย ${info.p.err}` });
      if (!info.c.err && !info.p.err && Boolean(info.cell.c) !== Boolean(info.cell.p)) {
        errors.push({ year: Number(key), mi, ri, text: `${MONTHS_TH[mi]} ${key} รอบ ${ri + 1}: ใส่${info.cell.c ? 'วันจ่าย' : 'วันตัดรอบ'}ด้วย` });
      }
    }));
    for (const mi of ys.unchecked) unchecked.push({ year: Number(key), mi, label: `${MONTHS_TH[mi]} ${key}` });
    const runs = calendarYearRuns(state, key);
    total += runs.length;
    if (runs.length) {
      const v = validateCalendarYear(key, runs);
      for (const text of v.errors) errors.push({ year: Number(key), mi: null, ri: null, text });
    }
  }
  if (!total) messages.push('ใส่วันในตารางปฏิทินอย่างน้อยหนึ่งรอบ');
  /* ข้อผิดระดับช่อง = นับ (ช่องแดงอยู่ในตารางแล้ว) · ข้อผิดระดับปี (วันตัดรอบซ้ำ · เกินรอบต่อเดือน …) ไม่มีช่องให้แดง ⇒ บอกข้อความเต็ม */
  const cellErrors = errors.filter((e) => e.mi !== null);
  const yearErrors = errors.filter((e) => e.mi === null);
  if (cellErrors.length) messages.push(`ตารางปฏิทินมี ${cellErrors.length} ช่องที่ต้องแก้`);
  if (yearErrors.length) messages.push(`${yearErrors[0].text}${yearErrors.length > 1 ? ` (และอีก ${yearErrors.length - 1} ข้อ)` : ''}`);
  if (unchecked.length) messages.push(`ร่างที่ยังไม่ได้เทียบกับรูป ${unchecked.length} เดือน (${unchecked.map((u) => u.label).join(' · ')}) — แตะ "ตรงกับรูป" หรือแก้วัน`);
  return { ok: !messages.length, errors, unchecked, messages };
}
/**
 * สถานะ → ส่วน `calendar` ของฟอร์มโมดัล (ruleFromForm) — ปีที่ไม่มีวันไม่ส่ง · รูปแนบส่งเฉพาะปีที่มีวัน
 * @returns `{ years: { YYYY: [{ cutoff, pay }] }, files: { YYYY: fileId } }`
 */
export function calendarFormYears(state) {
  const years = {};
  const files = {};
  for (const key of Object.keys(state?.years || {}).sort()) {
    const runs = calendarYearRuns(state, key);
    if (!runs.length) continue;
    years[key] = runs;
    if (state.years[key].fileId) files[key] = state.years[key].fileId;
  }
  return { years, files };
}

/* ── ปฏิทินเล็ก อา–ส (ใต้รูปของลูกค้า · แตะวันเพื่อใส่ช่องที่เลือก) ─────────────────────────────────────── */
/**
 * @param month 1..12 (เลื่อนข้ามปีได้ เช่น 13 = ม.ค. ปีถัดไป — วันจ่ายข้ามเดือน)
 * @returns `{ year, month, title, heads, weeks: [[null | { iso, day, weekend, holiday, holidayName, today, mark }] ×7] }`
 *   mark = null | `{ kind: 'c'|'p', ri, draft }` (วันตัดรอบ/วันจ่ายของรอบไหนในตาราง — ร่างที่ยังไม่เทียบ = draft)
 */
export function calendarMonthGrid(state, year, month, { holidays = null, todayIso = null } = {}) {
  const { year: y, month: m } = monthOf(Number(year), Number(month));
  const marks = new Map();
  for (const key of [String(y), String(y - 1)]) {
    const ys = state?.years?.[key];
    if (!ys) continue;
    ys.cells.forEach((row, mi) => row.forEach((_, ri) => {
      const { c, p } = calendarCellInfo(state, key, mi, ri);
      if (c.iso && !marks.has(c.iso)) marks.set(c.iso, { kind: 'c', ri, draft: ys.draft.includes(cellKey(mi, ri, 'c')) });
      if (p.iso && !marks.has(p.iso)) marks.set(p.iso, { kind: 'p', ri, draft: ys.draft.includes(cellKey(mi, ri, 'p')) });
    }));
  }
  const first = iso(y, m, 1);
  const lead = weekdayOf(first);
  const days = [...Array.from({ length: lead }, () => null)];
  for (let d = 1; d <= lastDayOf(y, m); d += 1) {
    const day = iso(y, m, d);
    const hol = holidayNameOf(holidays, day);
    days.push({ iso: day, day: d, weekend: Boolean(weekendNote(day)), holiday: hol !== null, holidayName: hol || '', today: day === dateOf(todayIso), mark: marks.get(day) || null });
  }
  while (days.length % 7) days.push(null);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { year: y, month: m, title: `${MONTHS_TH[m - 1]} ${y}`, heads: CALENDAR_WEEKDAY_HEADS, weeks };
}
/* วันที่ของแถวถัดไปหลังวันนี้ (ไฮไลต์ "รอบถัดไป" ในตาราง) — `{ year, mi }` หรือ null */
export function calendarNextRunMonth(state, todayIso) {
  const today = dateOf(todayIso);
  if (!today) return null;
  const all = Object.keys(state?.years || {}).flatMap((key) => calendarYearRuns(state, key)).filter((r) => r.cutoff >= today).sort((a, b) => (a.cutoff < b.cutoff ? -1 : 1));
  if (!all.length) return null;
  const [y, m] = partsOf(all[0].cutoff);
  return { year: y, mi: m - 1, cutoff: all[0].cutoff };
}

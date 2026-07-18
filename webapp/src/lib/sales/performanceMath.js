// คณิตของแท็บ "ผลงานขาย" (/sa/dashboard?tab=performance) — pure module ไม่แตะ React/DB
// เพื่อให้เทสต์ด้วย node:test ได้ตรง ๆ (แพตเทิร์นเดียวกับ lib/salesForecast.js).
//
// แนวคิด "ทบยอด" (carry-over — นโยบายบริษัท ยืนยันโดยผู้ใช้ 2026-07-18):
// เดือนไหนปิดต่ำกว่าเป้า ยอดที่ขาดทบเข้างวดถัดไป — "ต้องปิด" ของงวด = เป้างวด + ทบยกมา.
// ยอดเกินเป้าหักล้างยอดทบสะสมได้ (คิดจากผลต่างสะสม ไม่ใช่ max รายเดือน) แต่ทบยกมา
// ไม่ติดลบ (เกินสะสมไม่ทำให้ "ต้องปิด" งวดหน้าต่ำกว่าเป้า).
//
// เดือนที่ยังไม่จบ (รวมเดือนปัจจุบัน) ไม่ถูกนับเป็นยอดขาด — ตัดสินเฉพาะเดือนที่ปิดแล้ว
// (closedCount = จำนวนเดือนที่จบไปแล้วของปีนั้น).

import { teamRank } from '@/lib/salesPlanning';

const ZERO12 = () => Array(12).fill(0);

function monthIdxOf(monthKey) {
  const i = Number(String(monthKey || '').slice(5, 7)) - 1;
  return i >= 0 && i < 12 ? i : null;
}

// แปลง response ของ GET /api/sales-planning/dashboard?year= (data.months 12 ก้อน
// แต่ละก้อนมี totals / byOwner / byTeam) เป็น matrix 12 ช่องต่อแถว.
// team/company อ่านจาก byTeam/totals ตรง ๆ — ห้าม sum จากรายคน เพราะเป้าระดับทีม
// (ownerId null) ไม่อยู่ใน byOwner และจะนับซ้ำ/ขาดเงียบ ๆ.
export function buildMatrix(yearDashboards) {
  const company = { target: ZERO12(), forecast: ZERO12(), actual: ZERO12() };
  const people = new Map();
  const teams = new Map();

  for (const dashboard of yearDashboards || []) {
    const mi = monthIdxOf(dashboard.month);
    if (mi == null) continue;
    const totals = dashboard.totals || {};
    company.target[mi] += Number(totals.targetAmount || 0);
    company.forecast[mi] += Number(totals.weightedForecast || 0);
    company.actual[mi] += Number(totals.wonValue || 0);

    for (const row of dashboard.byOwner || []) {
      // คีย์เดียวกับ buildYearRows เดิมของหน้า /sa — ownerId ก่อน, ไม่มีก็ team+ชื่อ
      const key = row.ownerId || `${row.team || 'none'}:${row.ownerName || 'ไม่ระบุ'}`;
      if (!people.has(key)) {
        people.set(key, {
          id: key,
          name: row.ownerName || 'ไม่ระบุ',
          team: row.team || null,
          target: ZERO12(),
          forecast: ZERO12(),
          actual: ZERO12(),
        });
      }
      const p = people.get(key);
      p.target[mi] += Number(row.target || 0);
      p.forecast[mi] += Number(row.weighted || 0);
      p.actual[mi] += Number(row.won || 0);
    }

    for (const row of dashboard.byTeam || []) {
      const key = row.team || 'ไม่ระบุทีม';
      if (!teams.has(key)) {
        teams.set(key, { team: key, target: ZERO12(), forecast: ZERO12(), actual: ZERO12() });
      }
      const t = teams.get(key);
      t.target[mi] += Number(row.target || 0);
      t.forecast[mi] += Number(row.weighted || 0);
      t.actual[mi] += Number(row.won || 0);
    }
  }

  const sortedPeople = [...people.values()].sort(
    (a, b) => teamRank(a.team) - teamRank(b.team) || a.name.localeCompare(b.name, 'th'),
  );
  const sortedTeams = [...teams.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team));
  return { people: sortedPeople, teams: sortedTeams, company };
}

// จำนวนเดือนที่ "จบแล้ว" ของปีหนึ่ง ๆ (เดือนปัจจุบันยังไม่จบ ไม่นับ) —
// ใช้ตัดสินยอดทบ/สถานะ. now = { year, monthIdx } (monthIdx 0-11).
export function closedMonths(year, now) {
  if (year < now.year) return 12;
  if (year > now.year) return 0;
  return now.monthIdx;
}

// จำนวนเดือนที่ "มียอดแล้ว" (รวมเดือนปัจจุบันที่กำลังวิ่ง) — ใช้กับ YTD/กราฟสะสม.
export function ytdMonths(year, now) {
  if (year < now.year) return 12;
  if (year > now.year) return 0;
  return now.monthIdx + 1;
}

const sumRange = (arr, s, e) => {
  let total = 0;
  for (let i = s; i <= e && i < 12; i += 1) total += Number(arr[i] || 0);
  return total;
};

// ยอดทบยกมาเข้า "งวดที่เริ่ม startIdx" = ยอดขาดสะสมของเดือนที่จบแล้วก่อนหน้างวด.
// เกิน/ขาดหักล้างกันสะสม แล้ว clamp ไม่ให้ติดลบตอนยกเข้า.
export function carryIn(target, actual, startIdx, closedCount = 12) {
  const upTo = Math.min(startIdx, closedCount) - 1;
  if (upTo < 0) return 0;
  const shortfall = sumRange(target, 0, upTo) - sumRange(actual, 0, upTo);
  return shortfall > 1e-9 ? shortfall : 0;
}

// สถิติของงวด [startIdx..endIdx] ของแถวหนึ่ง (คน/ทีม/บริษัท).
export function windowStat(row, { startIdx, endIdx, carryOn = true, closedCount = 12 }) {
  const target = sumRange(row.target, startIdx, endIdx);
  const carry = carryOn ? carryIn(row.target, row.actual, startIdx, closedCount) : 0;
  const mustClose = target + carry;
  const forecast = sumRange(row.forecast, startIdx, endIdx);
  const actual = sumRange(row.actual, startIdx, endIdx);
  return {
    target,
    carry,
    mustClose,
    forecast,
    actual,
    projected: actual + forecast,
    diff: actual - mustClose,
    pct: mustClose > 0 ? (actual / mustClose) * 100 : null,
    fcPct: mustClose > 0 ? (forecast / mustClose) * 100 : null,
  };
}

// สถานะ pill ของงวด — periodKind: 'past' (งวดจบแล้ว) | 'current' | 'future'.
// tone แม็ปเป็นโทเคนสีฝั่ง UI: green / amber / red / muted.
export function statusOf(stat, { periodKind }) {
  // amount = ตัวเลขดิบแนบท้ายป้าย (ยอดที่ขาด) — UI ฟอร์แมตเงินเอง
  const short = stat.mustClose - stat.actual;
  if (periodKind === 'past') {
    if (stat.actual >= stat.mustClose - 1e-9) {
      return { key: 'cleared', label: stat.carry > 0 ? '✓ ปิดครบ + ล้างทบ' : '✓ ปิดครบ', tone: 'green', amount: 0 };
    }
    if (stat.actual >= stat.target - 1e-9) {
      return { key: 'met_with_carry', label: 'ถึงเป้า เหลือทบ', tone: 'amber', amount: short };
    }
    return { key: 'missed', label: '✗ ขาด', tone: 'red', amount: short };
  }
  if (periodKind === 'current') {
    if (stat.projected >= stat.mustClose - 1e-9) {
      return { key: 'running_on_track', label: 'กำลังวิ่ง · คาดจบถึงเป้า', tone: 'green', amount: 0 };
    }
    return { key: 'running_behind', label: 'กำลังวิ่ง · คาดขาด', tone: 'amber', amount: stat.mustClose - stat.projected };
  }
  // future — ยังไม่มียอดจริง ตัดสินจาก Forecast ล้วน
  if (stat.forecast <= 0) return { key: 'pending', label: 'รอปิดยอด', tone: 'muted', amount: 0 };
  if (stat.forecast >= stat.mustClose - 1e-9) {
    return { key: 'pending_fc_ok', label: 'รอปิด · Forecast ถึง', tone: 'muted', amount: 0 };
  }
  return { key: 'pending_fc_short', label: 'รอปิด · Forecast ขาด', tone: 'amber', amount: stat.mustClose - stat.forecast };
}

// ตารางทบยอดรายเดือน (แผง Carry-over): ทบยกมา/ต้องปิด/±เดือน/สะสมหลังเดือน.
// เดือนที่ยังไม่จบ actual = null (UI แสดง "–"), สะสมหยุดที่เดือนจบล่าสุด.
export function carryTable(row, { closedCount = 12 } = {}) {
  const out = [];
  let cum = 0; // ผลต่างสะสม (+เกิน / −ขาด) เฉพาะเดือนที่จบแล้ว
  for (let i = 0; i < 12; i += 1) {
    const target = Number(row.target[i] || 0);
    const carry = cum < -1e-9 ? -cum : 0;
    const closed = i < closedCount;
    const actual = closed ? Number(row.actual[i] || 0) : null;
    if (closed) cum += actual - target;
    out.push({
      monthIdx: i,
      target,
      carryIn: carry,
      mustClose: target + carry,
      actual,
      diff: closed ? actual - target : null,
      cumAfter: closed ? cum : null,
    });
  }
  return out;
}

// % เติบโต YoY รายเดือน — เฉพาะเดือนที่มียอดปีนี้แล้วและปีก่อนมีฐาน (>0), ที่เหลือ null.
export function yoySeries(actual, lastYear, ytdCount = 12) {
  return Array.from({ length: 12 }, (_, i) => {
    if (i >= ytdCount) return null;
    const base = Number(lastYear?.[i] || 0);
    if (base <= 0) return null;
    return (Number(actual[i] || 0) / base - 1) * 100;
  });
}

// เส้นสะสม: Actual ปีนี้ (หยุดที่เดือนล่าสุด) vs เส้นทางเป้า vs Actual ปีก่อน.
export function cumulativeSeries(target, actual, lastYear, ytdCount = 12) {
  const cum = (arr, stopAt = 12) => {
    let s = 0;
    return Array.from({ length: 12 }, (_, i) => {
      if (i >= stopAt) return null;
      s += Number(arr?.[i] || 0);
      return s;
    });
  };
  return {
    targetCum: cum(target),
    actualCum: cum(actual, ytdCount),
    lastYearCum: lastYear ? cum(lastYear) : null,
  };
}

/* ---------- งวด (period) — '2026' | '2026-Q3' | '2026-07' ---------- */

export function windowForPeriod(period) {
  const s = String(period || '');
  let m = s.match(/^(\d{4})$/);
  if (m) return { year: Number(m[1]), startIdx: 0, endIdx: 11, kind: 'year' };
  m = s.match(/^(\d{4})-Q([1-4])$/);
  if (m) {
    const q = Number(m[2]);
    return { year: Number(m[1]), startIdx: (q - 1) * 3, endIdx: q * 3 - 1, kind: 'quarter' };
  }
  m = s.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) {
    const i = Number(m[2]) - 1;
    return { year: Number(m[1]), startIdx: i, endIdx: i, kind: 'month' };
  }
  return null;
}

function shiftPeriod(period, dir) {
  const w = windowForPeriod(period);
  if (!w) return period;
  if (w.kind === 'year') return String(w.year + dir);
  if (w.kind === 'quarter') {
    const q = w.startIdx / 3 + dir;
    if (q < 0) return `${w.year - 1}-Q4`;
    if (q > 3) return `${w.year + 1}-Q1`;
    return `${w.year}-Q${q + 1}`;
  }
  const i = w.startIdx + dir;
  if (i < 0) return `${w.year - 1}-12`;
  if (i > 11) return `${w.year + 1}-01`;
  return `${w.year}-${String(i + 1).padStart(2, '0')}`;
}

export const prevPeriod = (period) => shiftPeriod(period, -1);
export const nextPeriod = (period) => shiftPeriod(period, 1);

// งวดนี้เป็นอดีต/ปัจจุบัน/อนาคต เทียบ now = { year, monthIdx } — ใช้เลือกกติกา statusOf.
export function periodKindOf(window_, now) {
  if (!window_) return 'current';
  if (window_.year < now.year) return 'past';
  if (window_.year > now.year) return 'future';
  if (window_.endIdx < now.monthIdx) return 'past';
  if (window_.startIdx > now.monthIdx) return 'future';
  return 'current';
}

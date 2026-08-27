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
import { monthsForYear } from '@/lib/datePeriods';

/* ── แกนเวลาของ matrix ────────────────────────────────────────────────────
   ⭐ เดิมทุกแถวเป็นอาเรย์ 12 ช่องที่ **index = เดือนของปีเดียว** — รายงานจึงดูข้ามปี
   ปฏิทินไม่ได้เลย (มติผู้ใช้ 2026-08-25 ให้ดูช่วงข้ามปีได้)
   ตอนนี้แถวถือ `months` (รายชื่องวด `YYYY-MM` เรียงเวลา) แล้วอาเรย์ทั้งหมดยาวเท่านั้น
   ⇒ คณิตที่เดินด้วย index ช่วง [startIdx..endIdx] ใช้ต่อได้ทั้งชุดโดยไม่ต้องแก้สูตร
   ⚠️ ผู้เรียกที่ยังส่งแค่ dashboards ของปีเดียวได้ผลเหมือนเดิมเป๊ะ (ยังเป็น 12 ช่อง) */

const zeros = (n) => Array(n).fill(0);

/** ปีของงวดเดือน — ใช้ตัดรอบทบยอด (ทบไม่ข้ามปีปฏิทิน) */
const yearOfKey = (monthKey) => String(monthKey || '').slice(0, 4);

/** รายชื่องวดเดือนที่ dashboards ก้อนนี้ครอบคลุม เรียงเวลา ไม่ซ้ำ */
export function monthsOfDashboards(dashboards) {
  const keys = [...new Set((dashboards || [])
    .map((d) => String(d?.month || ''))
    .filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k)))];
  return keys.sort();
}

// แปลง response ของ GET /api/sales-planning/dashboard?year= (data.months 12 ก้อน
// แต่ละก้อนมี totals / byOwner / byTeam) เป็น matrix ที่มีช่องละหนึ่งงวดเดือน.
// team/company อ่านจาก byTeam/totals ตรง ๆ — ห้าม sum จากรายคน เพราะเป้าระดับทีม
// (ownerId null) ไม่อยู่ใน byOwner และจะนับซ้ำ/ขาดเงียบ ๆ.
//
// `months` = แกนเวลาที่ต้องการ (ไม่ส่ง = ใช้ทั้ง 12 เดือนของปีที่พบใน dashboards
// เพื่อคงพฤติกรรมเดิมของผู้เรียกที่ยังคิดเป็นรายปี) · เดือนที่ไม่มีข้อมูลได้ 0
export function buildMatrix(yearDashboards, { months } = {}) {
  const axis = (Array.isArray(months) && months.length)
    ? months.slice()
    : monthsForYear(yearOfKey(monthsOfDashboards(yearDashboards)[0]) || '') ;
  const size = axis.length || 12;
  const axisIndex = new Map(axis.map((key, i) => [key, i]));
  const blank = () => ({ months: axis, target: zeros(size), fcTotal: zeros(size), forecast: zeros(size), actual: zeros(size) });

  const company = blank();
  const people = new Map();
  const teams = new Map();

  for (const dashboard of yearDashboards || []) {
    const mi = axisIndex.get(String(dashboard.month || ''));
    if (mi == null) continue;
    const totals = dashboard.totals || {};
    company.target[mi] += Number(totals.targetAmount || 0);
    company.fcTotal[mi] += Number(totals.fullForecast || 0);
    company.forecast[mi] += Number(totals.weightedForecast || 0);
    company.actual[mi] += Number(totals.wonValue || 0);

    for (const row of dashboard.byOwner || []) {
      // คีย์เดียวกับ buildYearRows เดิมของหน้า /sa — ownerId ก่อน, ไม่มีก็ team+ชื่อ
      const key = row.ownerId || `${row.team || 'none'}:${row.ownerName || 'ไม่ระบุ'}`;
      if (!people.has(key)) {
        people.set(key, { id: key, name: row.ownerName || 'ไม่ระบุ', team: row.team || null, ...blank() });
      }
      const p = people.get(key);
      p.target[mi] += Number(row.target || 0);
      p.fcTotal[mi] += Number(row.fcTotal || 0);
      p.forecast[mi] += Number(row.weighted || 0);
      p.actual[mi] += Number(row.won || 0);
    }

    for (const row of dashboard.byTeam || []) {
      const key = row.team || 'ไม่ระบุทีม';
      if (!teams.has(key)) {
        teams.set(key, { team: key, ...blank() });
      }
      const t = teams.get(key);
      t.target[mi] += Number(row.target || 0);
      t.fcTotal[mi] += Number(row.fcTotal || 0);
      t.forecast[mi] += Number(row.weighted || 0);
      t.actual[mi] += Number(row.won || 0);
    }
  }

  const sortedPeople = [...people.values()].sort(
    (a, b) => teamRank(a.team) - teamRank(b.team) || a.name.localeCompare(b.name, 'th'),
  );
  const sortedTeams = [...teams.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team));
  return { people: sortedPeople, teams: sortedTeams, company, months: axis };
}

/* ── ทับเส้น Actual ด้วยยอดที่กรอกย้อนหลัง (sales_history periodType='month') ──────
   ยกมาจาก `PerformanceTab` (2026-08-27) — เป็นคณิต ไม่ใช่การประกอบ UI จึงต้องอยู่ที่นี่
   พร้อมเทสต์ ตามกติกาเดิมของแท็บ ("คณิตทั้งหมดอยู่ใน performanceMath")

   ⚠️ สามระดับเป็น *เส้นแยกกัน* ใน matrix (บริษัทมาจาก totals · ทีมจาก byTeam ·
   คนจาก byOwner) ไม่ได้บวกกันขึ้นไป — เขียนทับทีละระดับจึงไม่นับซ้ำ

   🐞 **แต่เดิมทับได้แค่บริษัทกับรายคน** ⇒ เดือนที่กรอกมือแล้วแถวทีมยังเป็นยอดจากดีล
   (= 0 ถ้าเดือนนั้นยังไม่ได้ใช้ระบบ) · ของจริงบน prod 27/08/2026: บริษัทสะสม
   90,682,633 แต่ผลรวมรายทีมได้ 12,188,720 และคอลัมน์ "สถานะ" ของ **ทุกทีม** ขึ้น
   0.00% ทั้งที่บริษัททำได้ 112.75% — อ่านแล้วเข้าใจว่าทุกทีมไม่ทำยอดเลยครึ่งปี

   ⭐ กติกาที่ใช้แทน — "แถวที่กรอกละเอียดกว่าเป็นคำตอบสุดท้ายของเดือนนั้น":
   1. แถวรายคน/รายทีม/บริษัท ที่กรอกไว้ตรง ๆ ชนะเสมอ (พฤติกรรมเดิม)
   2. เดือน+ทีมไหน **มีแถวรายคน** แต่ไม่มีแถวของทีมเอง ⇒ ยอดทีม = ผลรวมคนในทีมนั้น
   3. เดือนไหนมีระดับทีมขยับ แต่ไม่มีแถวบริษัท ⇒ ยอดบริษัท = ผลรวมทุกทีม
   ⚠️ ส่วนที่ยัง**ไม่**กระทบกัน (เช่น แถวบริษัทใหญ่กว่าผลรวมทีม เพราะครึ่งปีแรกกรอก
   มาแค่ระดับบริษัท) ไม่ถูกกลบเงียบ — `unallocatedRow` ดึงออกมาเป็นแถวของตัวเอง */
export function overlayHistory(matrix, rows) {
  const axis = matrix?.company?.months || [];
  const size = matrix?.company?.target?.length || axis.length || 12;
  const blank = () => ({ months: axis, target: zeros(size), fcTotal: zeros(size), forecast: zeros(size), actual: zeros(size) });
  // งวดของแถวประวัติ: หาในแกนก่อน แล้วค่อยถอยไปเลขเดือน (ผู้เรียกดึงประวัติทีละปีอยู่แล้ว)
  const indexOf = (period) => {
    const key = String(period || '').slice(0, 7);
    const onAxis = axis.indexOf(key);
    if (onAxis >= 0) return onAxis;
    if (axis.length) return -1;
    const mi = Number(key.slice(5, 7)) - 1;
    return mi >= 0 && mi < size ? mi : -1;
  };
  // คีย์ทีมต้องตรงกับที่ buildMatrix ใช้ ไม่งั้นแถวที่ roll up ขึ้นไปจะไปสร้างทีมซ้อน
  const teamKeyOf = (team) => team || 'ไม่ระบุทีม';
  const teamRowOf = (team) => {
    const key = teamKeyOf(team);
    let t = matrix.teams.find((x) => x.team === key);
    if (!t) { t = { team: key, ...blank() }; matrix.teams.push(t); }
    return t;
  };

  const personTouched = new Map(); // teamKey → Set(index) ที่มีแถวรายคนกรอกไว้
  const teamExplicit = new Map();  // teamKey → Set(index) ที่มีแถวของทีมเองกรอกไว้
  const companyExplicit = new Set();

  for (const row of rows || []) {
    const mi = indexOf(row.period);
    if (mi < 0) continue;
    const amt = Number(row.actualAmount || 0);

    if (row.ownerId) {
      let person = matrix.people.find((x) => x.id === row.ownerId);
      if (!person) {
        // คนที่ไม่มีดีลในปีนั้นเลย (เข้าใหม่/ลาออก) ยังต้องมีแถว ไม่งั้นยอดที่กรอกหาย
        person = { id: row.ownerId, name: row.ownerName || row.ownerId, team: row.team || null, ...blank() };
        matrix.people.push(person);
      }
      person.actual[mi] = amt;
      const key = teamKeyOf(person.team);
      if (!personTouched.has(key)) personTouched.set(key, new Set());
      personTouched.get(key).add(mi);
      continue;
    }

    if (!row.team) { matrix.company.actual[mi] = amt; companyExplicit.add(mi); continue; }
    teamRowOf(row.team).actual[mi] = amt;
    const key = teamKeyOf(row.team);
    if (!teamExplicit.has(key)) teamExplicit.set(key, new Set());
    teamExplicit.get(key).add(mi);
  }

  // 2. ทีมที่ไม่ได้กรอกเอง แต่มีคนในทีมกรอกไว้ ⇒ ยอดทีมของเดือนนั้น = ผลรวมคนในทีม
  const teamMoved = new Set();
  for (const [key, indexes] of personTouched) {
    const explicit = teamExplicit.get(key);
    const team = teamRowOf(key);
    for (const mi of indexes) {
      if (explicit?.has(mi)) continue;
      team.actual[mi] = matrix.people
        .filter((p) => teamKeyOf(p.team) === key)
        .reduce((sum, p) => sum + Number(p.actual[mi] || 0), 0);
      teamMoved.add(mi);
    }
  }
  for (const indexes of teamExplicit.values()) for (const mi of indexes) teamMoved.add(mi);

  // 3. เดือนที่ระดับทีมขยับแต่ไม่มีแถวบริษัท ⇒ ยอดบริษัท = ผลรวมทุกทีม
  for (const mi of teamMoved) {
    if (companyExplicit.has(mi)) continue;
    matrix.company.actual[mi] = matrix.teams.reduce((sum, t) => sum + Number(t.actual[mi] || 0), 0);
  }

  return matrix;
}

/* แถว "ยังไม่ได้แยกทีม" = ยอดบริษัท − ผลรวมรายทีม ของแต่ละงวด

   ⭐ ตารางติดตามวางแถวทีมกับแถวรวมบริษัทไว้ด้วยกัน คนอ่านจึงบวกแถวทีมแล้วคาดว่า
   จะได้แถวล่างสุด — ซึ่ง **ไม่จริง** และไม่เคยมีอะไรบอก สองทางที่ทำให้ต่าง:
   · เป้า: `saTarget` (เป้ารวมบริษัท ownerId/team ว่าง) ชนะเป้ารายทีมทั้งชุด
     (route: `saWideTarget > 0 ? saWideTarget : teamTargetSum`) — ปี 2026 ม.ค.–มิ.ย.
     กรอกไว้แค่ระดับบริษัท แถวทีมจึงเป็น 0 ทั้งหกเดือน
   · Actual: ยอดกรอกย้อนหลังระดับบริษัทที่ยังไม่ได้แตกลงทีม (`overlayHistory` ข้อ 3)
   ⇒ ดึงส่วนต่างออกมาเป็นแถวของตัวเอง แถวทีม + แถวนี้ = แถวรวมบริษัทเป๊ะทุกคอลัมน์
   ห้ามเอาไปบวกใส่ทีมไหนเป็นการเดา — ข้อมูลว่าเป็นของทีมไหนไม่มีอยู่จริง */
export function unallocatedRow(matrix) {
  const company = matrix?.company || {};
  const size = company.target?.length || 0;
  const minus = (key) => Array.from({ length: size }, (_, i) => (
    Number(company[key]?.[i] || 0) - (matrix.teams || []).reduce((sum, t) => sum + Number(t[key]?.[i] || 0), 0)
  ));
  return { team: null, months: company.months || null, target: minus('target'), fcTotal: minus('fcTotal'), forecast: minus('forecast'), actual: minus('actual') };
}

/** แถวนี้มีอะไรให้แสดงไหมในช่วง [startIdx..endIdx] (ทุกค่าเป็น 0 = ซ่อนแถวทิ้ง) */
export function rowHasValue(row, startIdx, endIdx) {
  const keys = ['target', 'fcTotal', 'forecast', 'actual'];
  for (let i = Math.max(0, startIdx); i <= endIdx; i += 1) {
    for (const key of keys) if (Math.abs(Number(row?.[key]?.[i] || 0)) > 1e-9) return true;
  }
  return false;
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
  const last = Math.min(e, (arr?.length ?? 0) - 1);
  for (let i = Math.max(0, s); i <= last; i += 1) total += Number(arr[i] || 0);
  return total;
};

/* ยอดทบยกมาเข้า "งวดที่เริ่ม startIdx" = ยอดขาดสะสมของเดือนที่จบแล้วก่อนหน้างวด.
   เกิน/ขาดหักล้างกันสะสม แล้ว clamp ไม่ให้ติดลบตอนยกเข้า.

   ⭐ **ทบยอดรีเซ็ตทุกต้นปีปฏิทิน** (มติผู้ใช้ 2026-08-26) — ยอดที่ขาดของ ธ.ค. ไม่ทบ
   ข้ามไป ม.ค. ปีถัดไป แม้ช่วงที่เลือกจะข้ามปี · ส่งรายชื่อเดือน (`months`) มาด้วยเมื่อ
   แกนเวลาข้ามปี ไม่งั้นจะสะสมยาวตั้งแต่ต้นแกน
   ⚠️ ไม่ส่ง `months` = พฤติกรรมเดิม (แกนเป็นปีเดียวอยู่แล้ว จุดตัดจึงตรงกันพอดี) */
export function carryIn(target, actual, startIdx, closedCount = 12, months = null) {
  const upTo = Math.min(startIdx, closedCount) - 1;
  if (upTo < 0) return 0;
  let from = 0;
  if (Array.isArray(months) && months.length) {
    const year = yearOfKey(months[Math.min(startIdx, months.length - 1)]);
    // ถอยขึ้นไปจนสุดเดือนแรกของ "ปีเดียวกับงวดที่กำลังดู"
    from = startIdx;
    while (from > 0 && yearOfKey(months[from - 1]) === year) from -= 1;
  }
  if (upTo < from) return 0;
  const shortfall = sumRange(target, from, upTo) - sumRange(actual, from, upTo);
  return shortfall > 1e-9 ? shortfall : 0;
}

/* ---------- ช่วงบนแกนเวลา (รายงานข้ามปี) ---------- */

/** index ของงวดเดือนบนแกน · -1 ถ้าไม่อยู่ในแกน */
export function indexOfMonth(months, monthKey) {
  return (months || []).indexOf(String(monthKey || ''));
}

/** ช่วง { from, to } → { startIdx, endIdx } บนแกน · ตัดให้อยู่ในแกนเสมอ
 *  คืน null เมื่อช่วงไม่ทับแกนเลย (ผู้เรียกต้องแยกเคสนี้ ไม่ใช่เผลอได้ทั้งแกน) */
export function rangeWindow(months, { from, to } = {}) {
  const axis = months || [];
  if (!axis.length) return null;
  const lo = String(from || '');
  const hi = String(to || '');
  if (!lo || !hi || lo > hi) return null;
  if (hi < axis[0] || lo > axis[axis.length - 1]) return null;
  let startIdx = axis.findIndex((k) => k >= lo);
  let endIdx = axis.length - 1;
  for (let i = axis.length - 1; i >= 0; i -= 1) { if (axis[i] <= hi) { endIdx = i; break; } }
  if (startIdx < 0) startIdx = 0;
  return startIdx > endIdx ? null : { startIdx, endIdx };
}

/** จำนวนงวดบนแกนที่ "จบแล้ว" — ใช้แทน closedMonths เมื่อแกนข้ามปี
 *  now = { year, monthIdx } (monthIdx 0-11) เหมือนที่ทั้งแท็บใช้อยู่ */
export function closedCountOnAxis(months, now) {
  const current = `${now.year}-${String(now.monthIdx + 1).padStart(2, '0')}`;
  return (months || []).filter((key) => key < current).length;
}

// สถิติของงวด [startIdx..endIdx] ของแถวหนึ่ง (คน/ทีม/บริษัท).
export function windowStat(row, { startIdx, endIdx, carryOn = true, closedCount = 12 }) {
  const target = sumRange(row.target, startIdx, endIdx);
  const carry = carryOn ? carryIn(row.target, row.actual, startIdx, closedCount, row.months || null) : 0;
  const mustClose = target + carry;
  const fcTotal = sumRange(row.fcTotal || [], startIdx, endIdx);
  const forecast = sumRange(row.forecast, startIdx, endIdx);
  const actual = sumRange(row.actual, startIdx, endIdx);
  return {
    target,
    carry,
    mustClose,
    fcTotal,
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

/* สรุประดับ "ทั้งปี + สะสม" ของแถวหนึ่ง — คู่หูของ `windowStat` ที่มองทั้งปีแทนงวด.
   ใช้ทั้งการ์ด KPI และคอลัมน์โหมดปีของตารางติดตาม **สูตรเดียวกันที่เดียว**
   ⚠️ เคยเขียนซ้ำสองไฟล์ (PerformanceKpiCards + SummaryTable) แล้วเลขชนกันเอง:
   การ์ดกับแถวรวมท้ายตารางเป็นตัวเลขชุดเดียวกัน แต่แก้ที่เดียวอีกที่ไม่ตาม

   ⭐ **สองฐานในฟังก์ชันเดียว — เลือกให้ถูกเรื่อง** (แก้ 2026-08-12)
   · `actualYtd` = เงินที่ได้มาแล้วจริง **รวมเดือนที่กำลังวิ่ง** — เป็นข้อเท็จจริง
     ไม่ได้เทียบกับอะไร ใช้ตอบ "ขายไปได้เท่าไรแล้ว"
   · `gap` · `achv` · `yoy` = เทียบเป้า/ปีก่อน **เฉพาะเดือนที่จบแล้ว** (`closedCount`)

   🐞 เดิมใช้ `ytdCount` (รวมเดือนที่วิ่งอยู่) ทั้งหมด ⇒ เอา **เป้าเต็มเดือน** ไปเทียบกับ
   **ยอดครึ่งเดือน** ของเดือนเดียวกัน · ของจริงบน prod วันที่ 12 ส.ค. 2026:
     % Achievement    96.24%  ← ที่ถูกคือ 112.7%  (78,493,913 / 69,620,000 ถึง ก.ค.)
     YoY              +25.9%  ← ที่ถูกคือ +48.2%  (2025 ส.ค. เป็นเดือนเต็ม 2026 มี 12 วัน)
   ทั้งสองตัวต่ำกว่าความจริงมากในช่วงต้นเดือน แล้วค่อย ๆ ไต่ขึ้นเมื่อเดือนเดินไป —
   อ่านในที่ประชุมเช้าแล้วเข้าใจว่าทีมกำลังพลาดเป้าทั้งที่เกินเป้าอยู่

   ⚠️ ระวังนิยาม: `gap` เทียบเป้า**เฉพาะเดือนที่จบแล้ว** ไม่ใช่เป้าทั้งปี — ต่างจาก
   `windowStat().diff` ของงวดปีที่เทียบเป้าทั้ง 12 เดือน สองเลขนี้อยู่ในตารางเดียวกันได้
   แต่ต้องติดป้ายให้ต่างกัน ไม่งั้นอ่านแล้วขัดกันเอง

   ปีที่จบไปแล้ว closedCount = ytdCount = 12 ⇒ สองฐานเท่ากัน ผลลัพธ์ไม่เปลี่ยนจากเดิม */
export function yearSummary(row, { closedCount = 12, ytdCount = closedCount, lastYearActual = null } = {}) {
  const targetYear = sumRange(row.target, 0, 11);
  const targetClosed = sumRange(row.target, 0, closedCount - 1);
  const actualClosed = sumRange(row.actual, 0, closedCount - 1);
  const actualYtd = sumRange(row.actual, 0, ytdCount - 1);
  /* เดือนที่ยังวิ่งอยู่นับเป็น "ยังเหลือ" — เดิมหาร 12 − ytdCount ทำให้เป้าที่เหลือของ
     เดือนปัจจุบันถูกโยนไปกองเดือนถัด ๆ ไปทั้งที่เดือนนี้ยังขายได้อยู่
     (12 ส.ค. เคยบอก "อีก 4 เดือน ๆ ละ 14.7 ล้าน" ทั้งที่ยังเหลือ ส.ค. อีก 19 วัน) */
  const remainMonths = 12 - closedCount;
  const lastClosed = lastYearActual ? sumRange(lastYearActual, 0, closedCount - 1) : 0;
  return {
    targetYear,
    fcTotalYear: sumRange(row.fcTotal || [], 0, 11),
    forecastYear: sumRange(row.forecast, 0, 11),
    closedCount,
    targetClosed,
    actualClosed,
    actualYtd,
    gap: actualClosed - targetClosed,
    achv: targetClosed > 0 ? (actualClosed / targetClosed) * 100 : null,
    remainMonths,
    // เหลือ 0 เดือน = ปีจบแล้ว ไม่มี "ต่อเดือน" ให้พูดถึง (null ⇒ UI แสดง "—")
    // หักด้วย actualYtd (เงินที่ได้มาแล้วทั้งหมด รวมเดือนที่วิ่ง) ไม่ใช่ actualClosed
    needPerMonth: remainMonths > 0 ? Math.max(0, targetYear - actualYtd) / remainMonths : null,
    yoy: lastClosed > 0 ? (actualClosed / lastClosed - 1) * 100 : null,
  };
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
/* ⚠️ หยุดที่ **เดือนที่จบแล้ว** ไม่ใช่เดือนที่มียอดแล้ว — จุดของเดือนที่กำลังวิ่งคือ
   ยอดครึ่งเดือนเทียบกับเดือนเต็มของปีก่อน ได้ค่าติดลบเกือบ −100% ทุกต้นเดือน
   แล้วไต่ขึ้นจนสิ้นเดือน (12 ส.ค. 2026: ฿60,000 เทียบ ฿9.42M ของ ส.ค. 2025 = −99.4%)
   เป็นหลุมที่ไม่ได้แปลว่ายอดตก แต่แปลว่าเดือนยังไม่จบ */
export function yoySeries(actual, lastYear, closedCount = 12) {
  return Array.from({ length: 12 }, (_, i) => {
    if (i >= closedCount) return null;
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

/* ผกผันของ `windowForPeriod` — คีย์ `bp` ของหน้าต่างหนึ่ง ๆ
   ⚠️ ตัวคุมงวดต้องอ่านค่าจากตัวนี้ ไม่ใช่จาก `bp` ดิบใน URL: bp ที่หลุดปี (สลับปีแล้ว
   พารามิเตอร์เก่าค้าง) ถูกดึงกลับเป็น "ทั้งปี" ตอนคำนวณหน้าต่าง แต่ URL ยังค้างค่าเดิม
   ⇒ เอา bp ดิบไปเป็น value ของตัวเลือกจะไม่ตรงกับตัวเลือกไหนเลย = ช่องว่าง */
export function bpOfWindow(win) {
  if (!win) return '';
  if (win.kind === 'year') return String(win.year);
  if (win.kind === 'quarter') return `${win.year}-Q${Math.floor(win.startIdx / 3) + 1}`;
  return `${win.year}-${String(win.startIdx + 1).padStart(2, '0')}`;
}

// สลับชนิดงวดโดยคงตำแหน่งเวลาเดิม (เดือน→ไตรมาสที่ครอบเดือนนั้น · ไตรมาส→เดือนแรกของไตรมาส)
export function toKind(period, kind) {
  const w = windowForPeriod(period);
  if (!w) return period;
  const startIdx = kind === 'quarter' ? Math.floor(w.startIdx / 3) * 3 : w.startIdx;
  return bpOfWindow({ ...w, kind, startIdx });
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

import { currentMonth } from '@/lib/datePeriods';
import { carryIn, closedCountOnAxis } from '@/lib/sales/performanceMath';
import { matchPendingApprovalRows, pendingApprovalRowKey } from '@/lib/sales/reportPendingApproval';
import { coveredDaysOf } from '@/lib/sales/reportPeriod';

/* ── ตัวคิดสรุปของรายงานยอดขาย — จอกับไฟล์ Excel ใช้ตัวเดียวกัน (2026-09-22) ─────────────
 * เดิมตัวเลขทุกตัวคิดใน page.js (rowStat · targetIdx · splitIdx · carryIn · GroupTable.pick)
 * ⇒ เพิ่มไฟล์ Excel โดยไม่ยกออกมา = คิดสองที่ แล้วสักวันไฟล์กับจอจะบอกคนละเลข
 *
 * กติกาที่คงไว้ (มติผู้ใช้เดิมทั้งหมด):
 *   - เดือนที่ยังไม่จบไม่เข้าผลรวม/%/ส่วนต่าง (โหมดรายเดือน/ทั้งปี) — เป้าเต็มเดือนเทียบยอดครึ่งเดือนอ่านผิดทุกครั้ง
 *     ช่วงวันไม่มีด่านนี้: เป้าถูกปันถึงวันนี้แล้ว (lib/sales/reportPeriod) จึงเทียบได้ทุกเดือน
 *   - % และส่วนต่างเทียบเฉพาะเดือนที่ "มีเป้า" (บั๊ก 2,367% · UAT 2026-08-27)
 *   - มุมรายทีม/รายคนคิดเฉพาะเดือนที่แยกยอดรายคนจริง (splitIdx) — ก่อน ส.ค. 2026 ยอดอยู่ระดับบริษัท
 *   - ทบยอดรีเซ็ตทุกต้นปี · ช่วงวันไม่มีทบยอด
 *   - ยอดรออนุมัติเป็นก้อนแยก ⛔ ไม่เข้า actual / % / ส่วนต่าง / ทบยอด / แถบเตือนยอดไม่ตรง
 *
 * 🐞 แก้ในรอบนี้ (ตรวจ 2026-09-22): มุมรายทีม/รายคนเคยเอายอดของทุกเดือนใน splitIdx ไปเทียบกับ
 *    เป้าของบางเดือน (แถวที่ไม่มีเป้าบางเดือน) และแถวรวมคิด Σขาย − Σเป้า โดยไม่กันแถวที่ไม่มีเป้า
 *    ⇒ บั๊กพันธุ์เดียวกับ 2,367% · ตอนนี้ทุกแถวเทียบเฉพาะเดือนที่แถวนั้นมีเป้า เหมือนการ์ดบริษัท
 */

const sumAt = (arr, idx) => idx.reduce((s, i) => s + Number(arr?.[i] || 0), 0);
const ratio = (actual, target) => (target > 0 ? (actual / target) * 100 : null);

/** index บนแกนของเดือนที่ "โชว์" — ข้ามเดือนนำที่โหลดมาไว้คิดทบยอด */
export function shownIndexes(data) {
  const axis = data?.axis || data?.months || [];
  const lead = Number(data?.lead || 0);
  return axis.map((_, i) => i).filter((i) => i >= lead);
}

/** จำนวนเดือนบนแกนที่นับได้ — รายเดือน/ทั้งปี = เดือนที่จบแล้ว · ช่วงวัน = ทุกเดือน (เป้าปันถึงวันนี้แล้ว) */
export function countableCount(data, now = new Date()) {
  const axis = data?.axis || data?.months || [];
  if (data?.period?.mode === 'range') return axis.length;
  const month = currentMonth(now);
  return closedCountOnAxis(axis, { year: Number(month.slice(0, 4)), monthIdx: Number(month.slice(5, 7)) - 1 });
}

/** เทียบแถวหนึ่งกับเป้าเฉพาะเดือนที่แถวนั้นมีเป้า */
function compareRow(row, idx) {
  const targetIdx = idx.filter((i) => Number(row?.target?.[i] || 0) > 0);
  const target = sumAt(row?.target, targetIdx);
  const cmpActual = sumAt(row?.actual, targetIdx);
  return {
    actual: sumAt(row?.actual, idx),
    target,
    targetMonths: targetIdx.length,
    cmpActual,
    diff: target > 0 ? cmpActual - target : null,
    pct: ratio(cmpActual, target),
  };
}

/** ตารางรายทีม/รายคน + แถวรวม + ยอดรออนุมัติที่จับเข้าแถว */
function groupSummary(rows, kind, idx, pendingApproval, axis = []) {
  const { byKey, extra } = matchPendingApprovalRows(pendingApproval, rows, kind);
  const shaped = (rows || []).map((row) => ({
    key: row.key,
    ownerId: row.ownerId || null,
    ownerName: row.ownerName || null,
    team: row.team || null,
    ...compareRow(row, idx),
    pending: byKey.get(pendingApprovalRowKey(kind, row)) || null,
    /* เดือนที่ยอดของแถวนี้มาจากการกรอกมือ (ทับยอดใบของแถวนี้) — การเจาะลงใบต้องข้ามเดือนพวกนี้
       ไม่งั้นใบที่ถูกทับไปแล้วโผล่ในรายการแล้วรวมไม่ตรงกับแถว (ตรวจ 2026-09-22) */
    historyMonths: idx.filter((i) => row.history?.[i]).map((i) => axis[i]),
  }))
    // มากไปน้อยตามขายจริง — รายงานใช้ประชุมสรุปยอดและคิดคอมมิชชั่น
    .sort((a, b) => b.actual - a.actual);
  const pendingOnly = extra.map((group) => ({
    key: `pending-approval:${pendingApprovalRowKey(kind, group)}`,
    ownerId: group.ownerId || null,
    ownerName: group.ownerName || null,
    team: group.team || null,
    actual: 0, target: 0, targetMonths: 0, cmpActual: 0, diff: null, pct: null,
    pending: group,
    pendingOnly: true,
    historyMonths: [],
  }));
  const pendingGroups = [...byKey.values()];
  const pendingAmount = pendingGroups.reduce((s, g) => s + g.amount, 0);
  const pendingCount = pendingGroups.reduce((s, g) => s + g.count, 0);
  const target = shaped.reduce((s, r) => s + r.target, 0);
  const cmpActual = shaped.reduce((s, r) => s + r.cmpActual, 0);
  const all = [...shaped, ...pendingOnly];
  return {
    rows: shaped,
    pendingOnly,
    total: {
      // คนเดียวมีได้หลายแถว (ทีมละแถว) ⇒ "รวม N คน" นับคนไม่ซ้ำ
      count: kind === 'team' ? all.length : new Set(all.map((r) => r.ownerId)).size,
      actual: shaped.reduce((s, r) => s + r.actual, 0),
      target,
      cmpActual,
      diff: target > 0 ? cmpActual - target : null,
      pct: ratio(cmpActual, target),
      pendingAmount,
      pendingCount,
    },
    // ใบรออนุมัติที่ไม่มีแถวในตารางนี้ (ดีลไม่มีเจ้าของ) — นับเฉพาะในยอดบริษัท
    pendingOutside: {
      count: Math.max(0, Number(pendingApproval?.count || 0) - pendingCount),
      amount: Math.max(0, Number(pendingApproval?.amount || 0) - pendingAmount),
    },
    hasNoTeamRow: all.some((r) => !r.team),
  };
}

/**
 * @param data ผลของ loadSalesReportData (หรือ JSON ของ /api/sales-planning/report)
 * @param now  นาฬิกาที่ใช้ตัดสินเดือนที่จบแล้ว — จอกับไฟล์ต้องส่งนาฬิกาเดียวกัน (เวลาไทย)
 */
export function summarizeSalesReport(data, { now = new Date() } = {}) {
  const axis = data?.axis || data?.months || [];
  const company = data?.company || null;
  const people = data?.people || [];
  const period = data?.period || null;
  const rangeMode = period?.mode === 'range';
  const shown = shownIndexes(data);
  const countable = countableCount(data, now);
  /* ช่วงวันที่คลุมเดือนกรอกมือไม่ครบ (historyDropped): ตัวโหลดตั้งเป้าเดือนนั้นเป็น 0 แล้ว ("ไม่เทียบ")
     ⇒ ขายจริงจากใบยังนับ แต่ไม่เข้า %/ส่วนต่าง (กติกา "เทียบเฉพาะเดือนที่มีเป้า" จัดการให้เอง) */
  const unknown = new Set(data?.historyDropped || []);
  const counted = shown.filter((i) => i < countable);
  const orders = data?.orders || [];
  const ordersOfMonth = (month) => orders.filter((o) => o.month === month);
  const pendingApproval = data?.pendingApproval?.month ? data.pendingApproval : null;

  /* ── แถบตัวเลขบนหัว ── */
  const cmp = compareRow(company, counted);
  /* เดือนที่โชว์แต่ยังไม่จบ (รายเดือน/ทั้งปี) — แยกเป็น "ระหว่างเดือน" ไม่ปนผลรวม
     จอเดือนเดียวของเดือนนี้จึงยังมีตัวเลขให้ดู (ขายแล้วเท่าไร จากเป้าเต็มเดือนเท่าไร) */
  const openIdx = shown.filter((i) => i >= countable);
  const metrics = {
    target: cmp.target,
    targetMonths: cmp.targetMonths,
    actual: cmp.actual,
    countedMonths: counted.length,
    cmpActual: cmp.cmpActual,
    diff: cmp.diff,
    pct: cmp.pct,
    open: openIdx.length ? {
      months: openIdx.map((i) => axis[i]),
      target: sumAt(company?.target, openIdx),
      actual: sumAt(company?.actual, openIdx),
    } : null,
    /* ที่มาของเป้าในแถบหัว — ป้ายกำกับต้องพูดตรงกับสิ่งที่อยู่ในผลรวมจริง (ตรวจ 2026-09-22):
       set = มีเป้าเทียบ · excluded = มีเป้าแต่ไม่เทียบ (เดือนกรอกมือที่ช่วงวันคลุมไม่ครบ) ·
       notYet = มีเป้าแต่ยังไม่ถึงวันที่นับ (ช่วงวันในอนาคต) · none = ไม่ได้ตั้งเป้า */
    targetBasis: (() => {
      const withTarget = counted.filter((i) => Number(company?.target?.[i] || 0) > 0);
      const prorated = withTarget.filter((i) => Number(data?.targetFactor?.[i] ?? 1) < 1).length;
      const hasFull = shown.some((i) => Number(company?.targetFull?.[i] ?? company?.target?.[i] ?? 0) > 0);
      const state = withTarget.length ? 'set'
        : shown.some((i) => unknown.has(axis[i]) && Number(company?.targetFull?.[i] || 0) > 0) ? 'excluded'
          : hasFull && rangeMode ? 'notYet'
            : 'none';
      return { state, months: withTarget.length, prorated, full: withTarget.length - prorated };
    })(),
    pendingApproval: pendingApproval && Number(pendingApproval.count || 0) > 0
      ? { month: pendingApproval.month, amount: Number(pendingApproval.amount || 0), count: Number(pendingApproval.count || 0) }
      : null,
  };

  /* ── รายเดือน ── ทบยอด = ยอดที่ขาดสะสมตั้งแต่ ม.ค. ของปีเดียวกัน (carryIn ตัดรอบปีให้เอง) */
  const monthRows = shown.map((i) => {
    const month = axis[i];
    const target = Number(company?.target?.[i] || 0);
    const actual = Number(company?.actual?.[i] || 0);
    const closed = i < countable;
    const noDaily = unknown.has(month);
    /* ทบยอดเข้าเดือนที่ยังไม่จบด้วย — "ต้องปิด" ของเดือนที่กำลังวิ่งคือเลขที่ทีมต้องรู้ที่สุด
       (เดิมบังคับเป็นขีด ขัดกับแผงทบยอดของแท็บผลงานขาย · carryIn นับเฉพาะเดือนที่จบแล้วอยู่แล้ว) */
    const carry = !rangeMode && company ? carryIn(company.target, company.actual, i, countable, axis) : 0;
    const mustClose = target + carry;
    const factor = Number(data?.targetFactor?.[i] ?? 1);
    const monthOrders = ordersOfMonth(month);
    const fromHistory = Boolean(company?.history?.[i]);
    return {
      month,
      target,
      carry,
      mustClose,
      actual,
      diff: closed && !noDaily && mustClose > 0 ? actual - mustClose : null,
      pct: closed && !noDaily ? ratio(actual, mustClose) : null,
      closed,
      // ยอดเดือนนี้กรอกมือเป็นก้อนรายเดือน ช่วงวันคลุมไม่ครบ ⇒ นับเฉพาะใบในช่วง ไม่เทียบเป้า
      noDaily,
      // ช่วงวัน: เดือนที่เป้าถูกปัน (คลุมไม่ครบ/ยังไม่ถึงสิ้นเดือน) — ป้าย "ปัน 13/30 วัน"
      prorated: rangeMode && factor < 1 && !noDaily ? coveredDaysOf(period, month) : null,
      // เป้าเต็มเดือนก่อนปัน (ช่วงวันโชว์เป็นบรรทัดรอง)
      fullTarget: Number(company?.targetFull?.[i] ?? target),
      source: fromHistory ? 'history' : (actual || monthOrders.length ? 'orders' : null),
      orderCount: monthOrders.length,
      /* ใบที่อนุมัติในเดือนที่ยอดบริษัทมาจากการกรอกมือ — ยอดกรอกมือ **ทับ** ยอดใบ ใบพวกนี้จึงไม่อยู่ในขายจริง
         ต้องบอกไว้ ไม่งั้นรวมรายการใบแล้วไม่ตรงกับตารางโดยไม่มีคำอธิบาย */
      overridden: fromHistory && monthOrders.length
        ? { count: monthOrders.length, amount: monthOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0) }
        : null,
      pending: pendingApproval?.month === month && Number(pendingApproval.count || 0) > 0
        ? { amount: Number(pendingApproval.amount || 0), count: Number(pendingApproval.count) }
        : null,
    };
  });

  /* ── เดือนที่ "แยกยอดรายคน" จริง ── ก่อน ส.ค. 2026 แถวรายคนเป็น 0 ทั้งแถว
     เอา 0 ไปหารเป้าจะได้ "ทุกคนทำได้ 0%" ทั้งที่ความจริงคือไม่รู้ */
  const splitIdx = counted.filter((i) => people.some((p) => Number(p.actual?.[i] || 0) > 0));
  const peopleActual = people.reduce((s, p) => s + sumAt(p.actual, splitIdx), 0);
  const companySplitActual = sumAt(company?.actual, splitIdx);
  /* แถบเตือนต้องชี้เดือนที่ไม่ตรง ไม่ใช่แค่ผลรวม — คนแก้ต้องรู้ว่าไปแก้เดือนไหน ที่มาไหน */
  const byMonth = splitIdx.map((i) => {
    const month = axis[i];
    const companyActual = Number(company?.actual?.[i] || 0);
    const people_ = people.reduce((sum, p) => sum + Number(p.actual?.[i] || 0), 0);
    const ownerless = ordersOfMonth(month).filter((o) => !o.ownerId);
    return {
      month,
      company: companyActual,
      people: people_,
      gap: companyActual - people_,
      mismatch: Math.abs(companyActual - people_) > 1,
      source: company?.history?.[i] ? 'history' : 'orders',
      ownerless: { count: ownerless.length, amount: ownerless.reduce((sum, o) => sum + Number(o.amount || 0), 0) },
    };
  });

  /* สมการที่มาของขายจริง (บรรทัดใต้ตารางรายเดือน + หัวไฟล์ Excel):
     ขายจริง N เดือน = กรอกย้อนหลัง a เดือน ฿… + ใบสั่งขาย b เดือน ฿… */
  const historyIdx = counted.filter((i) => company?.history?.[i]);
  // เดือนที่ไม่มีทั้งยอดและใบ (ยังไม่เปิดระบบ/ไม่มีขาย) ไม่นับเป็น "เดือนจากใบสั่งขาย"
  const orderIdx = counted.filter((i) => !company?.history?.[i]
    && (Number(company?.actual?.[i] || 0) !== 0 || ordersOfMonth(axis[i]).length > 0));
  const sourceSplit = {
    history: { months: historyIdx.length, amount: sumAt(company?.actual, historyIdx) },
    orders: { months: orderIdx.length, amount: sumAt(company?.actual, orderIdx) },
  };

  return {
    months: shown.map((i) => axis[i]),
    sourceSplit,
    anyCarry: monthRows.some((r) => r.carry > 0),
    countedMonths: counted.map((i) => axis[i]),
    metrics,
    monthRows,
    splitMonths: splitIdx.map((i) => axis[i]),
    reconciliation: {
      months: splitIdx.length,
      company: companySplitActual,
      people: peopleActual,
      gap: companySplitActual - peopleActual,
      mismatch: splitIdx.length > 0 && Math.abs(companySplitActual - peopleActual) > 1,
      byMonth,
    },
    teams: groupSummary(data?.teams || [], 'team', splitIdx, pendingApproval, axis),
    people: groupSummary(people, 'person', splitIdx, pendingApproval, axis),
    historyDropped: data?.historyDropped || [],
    generatedAt: data?.generatedAt || null,
  };
}

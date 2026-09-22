// ── วาดรายงานยอดขายเป็นไฟล์ Excel (มติผู้ใช้ 2026-09-22 "ทั้งรายงาน") ──────────────────
//
// ⭐ ตัวเลขทุกตัวมาจาก `summarizeSalesReport` ตัวเดียวกับที่ API ส่งให้จอ — ไฟล์นี้ **วาดอย่างเดียว
//    ไม่คิดเลขเอง** ⇒ เปิดไฟล์คู่กับจอแล้วเลขตรงกันทุกช่อง (งวดเดียวกัน · นาฬิกาเดียวกัน)
// รูปแบบชีตลอกจาก `leadReportWorkbook.js` / `forecastReportWorkbook.js` ให้ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน
//
// ชีต: สรุปรายเดือน · รายทีม · รายคน · ใบสั่งขาย · รออนุมัติ (มีเฉพาะงวดที่มีใบค้าง)

import ExcelJS from 'exceljs';
import { businessDayKey, formatMonthLabel } from '@/lib/datePeriods';
import { fmtMoney, fmtPercent } from '@/lib/format';
import { NO_TEAM_LABEL } from '@/lib/sales/personSlice';
import { FINANCE_STATE_BADGE, financeStateOf } from '@/lib/sales/reportOrderView';
import { reportPeriodLabel } from '@/lib/sales/reportPeriod';
import { teamNameOf } from '@/lib/master/teams';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const INFO_FILL = 'FFF4E8DF';
const TOTAL_FILL = 'FFF7F4EE';
const MONEY = '#,##0.00';
const PCT = '0.00%';
const NA = '—';

/** ค่าเงินลงเซลล์ — ค่าว่าง (เทียบไม่ได้) เป็นขีด ไม่ใช่ 0 (กติกาเดียวกับจอ) */
const moneyOrDash = (v) => (v == null ? NA : Number(v));
const pctOrDash = (v) => (v == null ? NA : Number(v) / 100);
const dmy = (day) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : NA);

function addInfoRow(sheet, text, width) {
  const row = sheet.addRow([text]);
  row.font = { name: FONT, size: 10 };
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_FILL } };
  row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  sheet.mergeCells(row.number, 1, row.number, width);
  return row;
}

/**
 * วาดตารางหนึ่งชีต
 * @param columns [{ key, label, width, money?, pct? }]
 * @param rows    อ็อบเจกต์ตาม key
 * @param total   แถวรวม (อ็อบเจกต์ตาม key) หรือ null
 */
function writeTable(sheet, { info = [], columns, rows, total = null, filter = true }) {
  const width = columns.length;
  info.forEach((text) => addInfoRow(sheet, text, width));
  const header = sheet.addRow(columns.map((c) => c.label));
  header.font = { name: FONT, size: 11, bold: true, color: { argb: HEADER_TEXT } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  const headerRow = header.number;
  columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });

  const paint = (row) => {
    row.font = { name: FONT, size: 11 };
    columns.forEach((c, i) => {
      if (c.money) row.getCell(i + 1).numFmt = MONEY;
      if (c.pct) row.getCell(i + 1).numFmt = PCT;
    });
  };
  for (const r of rows) paint(sheet.addRow(columns.map((c) => r[c.key] ?? NA)));
  if (total) {
    const row = sheet.addRow(columns.map((c) => total[c.key] ?? ''));
    paint(row);
    row.font = { name: FONT, size: 11, bold: true };
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }; });
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  if (filter && rows.length) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: width } };
  }
}

/** แถวของชีต "สรุปรายเดือน" — ใช้ในเทสต์ได้โดยไม่ต้องสร้างไฟล์ */
export function monthSheetRows(summary, { rangeMode = false } = {}) {
  return summary.monthRows.map((row) => {
    const notes = [];
    if (!row.closed) notes.push('ยังไม่จบเดือน — ไม่นับในผลรวม/%');
    if (row.noDaily) notes.push('ยอดเดือนนี้กรอกย้อนหลังเป็นก้อนรายเดือน ช่วงวันคลุมไม่ครบ — ไม่นับในผลรวม/%');
    if (row.prorated) notes.push(`เป้าปันตามวัน ${row.prorated.days}/${row.prorated.total} วัน`);
    if (row.pending) notes.push(`รออนุมัติ ${row.pending.count} ใบ ${fmtMoney(Number(row.pending.amount))} (ไม่นับเป็นขายจริง)`);
    return {
      month: formatMonthLabel(row.month),
      days: row.prorated ? `${row.prorated.days}/${row.prorated.total}` : (row.noDaily ? 'ไม่เทียบ' : 'ทั้งเดือน'),
      fullTarget: row.fullTarget ? row.fullTarget : NA,
      target: row.target ? row.target : NA,
      carry: rangeMode ? undefined : (row.carry ? row.carry : NA),
      mustClose: rangeMode ? undefined : (row.mustClose ? row.mustClose : NA),
      actual: row.actual ? row.actual : NA,
      diff: moneyOrDash(row.diff),
      pct: pctOrDash(row.pct),
      source: row.source === 'history' ? 'กรอกย้อนหลัง' : row.source === 'orders' ? 'จากใบสั่งขาย' : NA,
      note: notes.join(' · ') || '',
    };
  });
}

/** แถวของชีตรายทีม/รายคน */
export function groupSheetRows(group, kind, teamLabel) {
  const teamName = (team) => (team ? teamLabel(team) : NO_TEAM_LABEL);
  return [...group.rows, ...group.pendingOnly].map((r) => ({
    name: kind === 'team' ? teamName(r.team) : (r.ownerName || r.ownerId || NA),
    team: teamName(r.team),
    target: r.target ? r.target : NA,
    actual: r.pendingOnly ? NA : r.actual,
    cmpActual: r.target ? r.cmpActual : NA,
    diff: moneyOrDash(r.diff),
    pct: pctOrDash(r.pct),
    targetMonths: r.targetMonths || NA,
    pending: r.pending ? Number(r.pending.amount) : NA,
    pendingCount: r.pending ? Number(r.pending.count) : NA,
  }));
}

/**
 * @param data    ผลของ loadSalesReportData
 * @param summary ผลของ summarizeSalesReport (ตัวเดียวกับที่ API ส่งให้จอ)
 * @param meta    { generatedAt, by, teamNames: Map รหัสทีม→ชื่อ, origin: 'https://…' (ลิงก์ไปหน้าใบ) }
 */
export async function buildSalesReportBuffer(data, summary, meta = {}) {
  const period = data.period;
  const rangeMode = period?.mode === 'range';
  const teamLabel = (code) => teamNameOf(meta.teamNames || null, code) || code;
  const span = reportPeriodLabel(period);
  const stamp = [
    `รายงานยอดขาย · งวด ${span}`,
    meta.by ? `ดาวน์โหลดโดย ${meta.by}` : null,
    meta.generatedAt || null,
  ].filter(Boolean).join(' · ');
  const basis = 'ยอดขาย = ยอดก่อน VAT ของใบสั่งขายที่อนุมัติแล้ว (ยอดหน้าใบ − VAT ท้ายใบ) · งวดคิดจากวันที่อนุมัติตามเวลาไทย'
    + ' · ใบรออนุมัติแยกไว้ ไม่นับเป็นยอดขาย';

  const book = new ExcelJS.Workbook();
  book.creator = 'Scent & Sense';

  /* ── สรุปรายเดือน ── */
  const m = summary.metrics;
  const monthCols = [
    { key: 'month', label: 'งวด', width: 14 },
    ...(rangeMode ? [
      { key: 'days', label: 'วันที่นับ', width: 11 },
      { key: 'fullTarget', label: 'เป้าเต็มเดือน', width: 16, money: true },
    ] : []),
    { key: 'target', label: rangeMode ? 'เป้า (ปันตามวัน)' : 'เป้า', width: 16, money: true },
    ...(rangeMode ? [] : [
      { key: 'carry', label: 'ทบยกมา', width: 15, money: true },
      { key: 'mustClose', label: 'ต้องปิด', width: 16, money: true },
    ]),
    { key: 'actual', label: 'ขายจริง', width: 16, money: true },
    { key: 'diff', label: 'ส่วนต่าง', width: 16, money: true },
    { key: 'pct', label: '% ทำได้', width: 10, pct: true },
    { key: 'source', label: 'ที่มาของยอด', width: 14 },
    { key: 'note', label: 'หมายเหตุ', width: 44 },
  ];
  const monthSheet = book.addWorksheet('สรุปรายเดือน');
  const headline = [
    `เป้าที่เทียบ ${m.target ? fmtMoney(m.target) : NA} (${m.targetMonths} เดือนที่ตั้งเป้า)`,
    `ขายจริง ${fmtMoney(m.actual)} (${m.countedMonths} เดือนที่นับ)`,
    `% ทำได้ ${m.pct == null ? NA : fmtPercent(m.pct)}`,
    `ส่วนต่าง ${m.diff == null ? NA : fmtMoney(m.diff)}`,
    m.pendingApproval ? `รออนุมัติ ${m.pendingApproval.count} ใบ ${fmtMoney(m.pendingApproval.amount)} (ไม่นับเป็นขายจริง)` : null,
  ].filter(Boolean).join(' · ');
  const split = summary.sourceSplit;
  const equation = split && (split.history.months || split.orders.months)
    ? `ขายจริง ${fmtMoney(m.actual)} = `
      + [
        split.history.months ? `กรอกย้อนหลัง ${split.history.months} เดือน ${fmtMoney(split.history.amount)}` : null,
        split.orders.months ? `ใบสั่งขาย ${split.orders.months} เดือน ${fmtMoney(split.orders.amount)}` : null,
      ].filter(Boolean).join(' + ')
    : null;
  const monthNotes = [stamp, headline, basis, equation].filter(Boolean);
  for (const r of summary.reconciliation.byMonth || []) {
    if (!r.mismatch) continue;
    monthNotes.push(`⚠ ${formatMonthLabel(r.month)} ยอดบริษัท ${fmtMoney(r.company)} ไม่ตรงกับผลรวมรายคน ${fmtMoney(r.people)}`
      + ` (ต่าง ${fmtMoney(Math.abs(r.gap))} · ที่มา: ${r.source === 'history' ? 'กรอกย้อนหลัง' : 'ใบสั่งขาย'}) — ยังไม่ควรใช้คิดคอมมิชชั่น`);
  }
  if (rangeMode) monthNotes.push('ช่วงวัน: เป้าเดือนปันตามจำนวนวันที่ช่วงคลุมและถึงวันนี้แล้ว · ไม่มีทบยอด (ทบยอดเป็นของรายเดือน)');
  else monthNotes.push('ทบยอดที่ขาดเข้างวดถัดไปและรีเซ็ตทุกต้นปี · เดือนที่ยังไม่จบไม่คิด % และไม่เข้าผลรวม · เดือนที่ไม่ได้ตั้งเป้าเป็นขีด ไม่ใช่ 0%');
  if (summary.historyDropped?.length) {
    monthNotes.push(`เดือนที่มียอดกรอกย้อนหลังรายเดือนแต่ช่วงคลุมไม่ครบ (${summary.historyDropped.map((x) => formatMonthLabel(x)).join(', ')}) นับจากใบสั่งขายอย่างเดียว`);
  }
  writeTable(monthSheet, {
    info: monthNotes,
    columns: monthCols,
    rows: monthSheetRows(summary, { rangeMode }),
    total: {
      month: 'รวมเดือนที่นับ',
      target: m.target || NA,
      actual: m.actual,
      diff: moneyOrDash(m.diff),
      pct: pctOrDash(m.pct),
      note: m.targetMonths ? `% และส่วนต่างเทียบเฉพาะ ${m.targetMonths} เดือนที่ตั้งเป้า` : 'ยังไม่ได้ตั้งเป้าในงวดนี้',
    },
    filter: false,
  });

  /* ── รายทีม / รายคน ── */
  const splitNote = summary.splitMonths.length
    ? `คิดเฉพาะ ${summary.splitMonths.length} เดือนที่แยกยอดรายคนจริง (${summary.splitMonths.map((x) => formatMonthLabel(x)).join(', ')})`
      + ' · % และส่วนต่างเทียบเฉพาะเดือนที่แถวนั้นมีเป้า · แยกทีมตามทีมของดีล ไม่ใช่ทีมปัจจุบันของคน'
    : 'งวดนี้ยังไม่มีเดือนที่แยกยอดรายคน (ฝ่ายขายแบ่งทีม ก.ค. 2026 · ย้ายเข้าระบบ ส.ค. 2026)';
  const reconcile = summary.reconciliation.mismatch
    ? `⚠ ยอดบริษัท ${fmtMoney(summary.reconciliation.company)} ไม่ตรงกับผลรวมรายคน `
      + `${fmtMoney(summary.reconciliation.people)} (ต่าง ${fmtMoney(Math.abs(summary.reconciliation.gap))})`
    : null;
  for (const [kind, group, title] of [['team', summary.teams, 'รายทีม'], ['person', summary.people, 'รายคน']]) {
    const sheet = book.addWorksheet(title);
    const columns = [
      { key: 'name', label: kind === 'team' ? 'ทีม' : 'ผู้รับผิดชอบ', width: 26 },
      ...(kind === 'person' ? [{ key: 'team', label: 'ทีม', width: 18 }] : []),
      { key: 'target', label: 'เป้า', width: 16, money: true },
      { key: 'actual', label: 'ขายจริง', width: 16, money: true },
      { key: 'cmpActual', label: 'ขายจริงเฉพาะเดือนที่มีเป้า', width: 18, money: true },
      { key: 'diff', label: 'ส่วนต่าง', width: 16, money: true },
      { key: 'pct', label: '% ทำได้', width: 10, pct: true },
      { key: 'targetMonths', label: 'เดือนที่มีเป้า', width: 10 },
      { key: 'pending', label: 'รออนุมัติ (ยอด)', width: 16, money: true },
      { key: 'pendingCount', label: 'รออนุมัติ (ใบ)', width: 10 },
    ];
    const t = group.total;
    writeTable(sheet, {
      info: [stamp, splitNote, reconcile].filter(Boolean),
      columns,
      rows: summary.splitMonths.length || group.pendingOnly.length ? groupSheetRows(group, kind, teamLabel) : [],
      total: {
        name: `รวม ${t.count} ${kind === 'team' ? 'ทีม' : 'คน'}`,
        target: t.target || NA,
        actual: t.actual,
        cmpActual: t.target ? t.cmpActual : NA,
        diff: moneyOrDash(t.diff),
        pct: pctOrDash(t.pct),
        pending: t.pendingCount ? t.pendingAmount : NA,
        pendingCount: t.pendingCount || NA,
      },
    });
    if (group.pendingOutside.count > 0) {
      addInfoRow(sheet, `ใบรออนุมัติอีก ${group.pendingOutside.count} ใบ (${fmtMoney(group.pendingOutside.amount)}) ดีลไม่มีเจ้าของ จึงนับเฉพาะในยอดบริษัท`, columns.length);
    }
  }

  /* ── ใบสั่งขาย ── ทุกใบในงวด (ไม่ใช่เฉพาะที่ค้นบนจอ — ตัวกรองของ Excel ทำหน้าที่นั้น) */
  const overriddenMonths = new Set(summary.monthRows.filter((r) => r.overridden).map((r) => r.month));
  const orders = [...(data.orders || [])].sort((a, b) => String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')) || String(a.orderNumber).localeCompare(String(b.orderNumber)));
  const orderSheet = book.addWorksheet('ใบสั่งขาย');
  const orderTotal = (key) => orders.reduce((s, o) => s + Number(o[key] || 0), 0);
  writeTable(orderSheet, {
    info: [stamp, `${orders.length} ใบ · เฉพาะใบที่อนุมัติแล้ว`, 'ยอดที่นับ = ยอดหน้าใบ − VAT ท้ายใบ · ใบ "ไม่คิดเงิน" = ส่วนลดท้ายใบเต็มจำนวน นับรวมในจำนวนใบ'],
    columns: [
      { key: 'day', label: 'วันที่อนุมัติ', width: 13 },
      { key: 'month', label: 'งวด', width: 11 },
      { key: 'orderNumber', label: 'ใบสั่งขาย', width: 16 },
      { key: 'quoteNumber', label: 'ใบเสนอราคา', width: 16 },
      { key: 'customerName', label: 'ลูกค้า', width: 34 },
      { key: 'ownerName', label: 'ผู้รับผิดชอบ', width: 22 },
      { key: 'team', label: 'ทีม', width: 16 },
      { key: 'lineCount', label: 'บรรทัด', width: 8 },
      { key: 'amount', label: 'ยอดที่นับ', width: 16, money: true },
      { key: 'vatAmount', label: 'VAT', width: 14, money: true },
      { key: 'totalAmount', label: 'ยอดหน้าใบ', width: 16, money: true },
      { key: 'finance', label: 'ขั้นบัญชี', width: 11 },
      { key: 'free', label: 'หมายเหตุ', width: 12 },
      { key: 'counted', label: 'นับในยอด', width: 30 },
      { key: 'link', label: 'ลิงก์', width: 40 },
    ],
    rows: orders.map((o) => ({
      day: dmy(o.day),
      month: o.month || NA,
      orderNumber: o.orderNumber,
      quoteNumber: o.quoteNumber || NA,
      customerName: o.customerName || NA,
      ownerName: o.ownerName || NA,
      team: o.team ? teamLabel(o.team) : (o.ownerId ? NO_TEAM_LABEL : NA),
      lineCount: o.lineCount,
      amount: o.amount,
      vatAmount: o.vatAmount,
      totalAmount: o.totalAmount,
      finance: FINANCE_STATE_BADGE[financeStateOf(o)].label,
      free: o.free ? 'ไม่คิดเงิน' : '',
      // ยอดกรอกมือของเดือนนั้นทับยอดใบ ⇒ ใบนี้ไม่อยู่ในขายจริง (บอกไว้ ไม่งั้นรวมคอลัมน์แล้วไม่ตรง)
      counted: overriddenMonths.has(o.month) ? 'ไม่นับ · เดือนนี้ใช้ยอดกรอกย้อนหลัง' : '',
      link: meta.origin ? { text: o.orderNumber, hyperlink: `${meta.origin}/sa/sales-orders/${o.id}` } : '',
    })),
    total: {
      day: `รวม ${orders.length} ใบ`,
      amount: orderTotal('amount'),
      vatAmount: orderTotal('vatAmount'),
      totalAmount: orderTotal('totalAmount'),
    },
  });

  /* ── รออนุมัติ ── ก้อนแยก ไม่ใช่ยอดขาย */
  const pending = data.pendingApproval;
  if (Number(pending?.count || 0) > 0) {
    const sheet = book.addWorksheet('รออนุมัติ');
    writeTable(sheet, {
      info: [stamp, `ใบสั่งขายที่ยื่นแล้วรอ AE Supervisor อนุมัติ · ${pending.count} ใบ · ยังไม่นับเป็นขายจริง — อนุมัติแล้วยอดลงเดือนที่อนุมัติ`],
      columns: [
        { key: 'orderNumber', label: 'ใบสั่งขาย', width: 16 },
        { key: 'quoteNumber', label: 'ใบเสนอราคา', width: 16 },
        { key: 'customerName', label: 'ลูกค้า', width: 34 },
        { key: 'ownerName', label: 'ผู้รับผิดชอบ (เจ้าของดีล)', width: 22 },
        { key: 'team', label: 'ทีม', width: 16 },
        { key: 'submittedAt', label: 'ยื่นเมื่อ', width: 13 },
        { key: 'amount', label: 'ยอดก่อน VAT', width: 16, money: true },
      ],
      rows: pending.orders.map((o) => ({
        orderNumber: o.orderNumber,
        quoteNumber: o.quoteNumber || NA,
        customerName: o.customerName || NA,
        ownerName: o.ownerName || NA,
        team: o.team ? teamLabel(o.team) : (o.ownerId ? NO_TEAM_LABEL : NA),
        submittedAt: o.submittedAt ? dmy(businessDayKey(o.submittedAt)) : NA,
        amount: o.amount,
      })),
      total: { orderNumber: `รวม ${pending.count} ใบ`, amount: Number(pending.amount || 0) },
    });
  }

  return book.xlsx.writeBuffer();
}

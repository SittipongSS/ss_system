function monthKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function localIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isBusinessDay(date, holidays = new Set()) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const iso = localIsoDate(date);
  return !holidays.has(iso);
}

export function subtractBusinessDays(dateInput, days, holidays = new Set()) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  let remaining = Math.max(0, Number(days) || 0);
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    if (isBusinessDay(date, holidays)) remaining -= 1;
  }
  return localIsoDate(date);
}

export function requiredConfirmDateForNeedMonth(warehouseNeedMonth, leadTimeDays = 90, holidays = new Set()) {
  const month = monthKey(warehouseNeedMonth);
  if (!month) return null;
  return subtractBusinessDays(`${month}-01T00:00:00`, leadTimeDays, holidays);
}

export function buildSahamitReverseRiskRows(rounds = [], holidays = new Set(), leadTimeDays = 90) {
  const ownerRoundByMonth = new Map();
  for (const round of rounds || []) {
    const roundNo = Number(round.roundNo || 0);
    const covered = Array.isArray(round.coverMonths) && round.coverMonths.length
      ? round.coverMonths
      : [...new Set((round.lines || []).map((line) => monthKey(line.month)).filter(Boolean))];
    for (const month of covered) {
      const current = ownerRoundByMonth.get(month);
      if (current === undefined || roundNo > current) ownerRoundByMonth.set(month, roundNo);
    }
  }

  const aggregate = new Map();
  for (const round of rounds || []) {
    const roundNo = Number(round.roundNo || 0);
    for (const line of round.lines || []) {
      const warehouseNeedMonth = monthKey(line.month);
      if (!warehouseNeedMonth || ownerRoundByMonth.get(warehouseNeedMonth) !== roundNo) continue;
      const qty = Number(line.qty || 0);
      if (!line.fgCode || !Number.isFinite(qty) || qty <= 0) continue;
      const key = `${line.fgCode}||${warehouseNeedMonth}`;
      const row = aggregate.get(key) || {
        fgCode: line.fgCode,
        productName: line.productName || null,
        warehouseNeedMonth,
        qty: 0,
        latestRoundNo: roundNo,
        latestFcReceivedDate: round.receivedDate || null,
      };
      row.qty += qty;
      row.productName ||= line.productName || null;
      aggregate.set(key, row);
    }
  }

  return [...aggregate.values()]
    .map((row) => {
      const requiredConfirmDate = requiredConfirmDateForNeedMonth(row.warehouseNeedMonth, leadTimeDays, holidays);
      const requiredConfirmMonth = monthKey(requiredConfirmDate);
      const latestFcReceivedMonth = monthKey(row.latestFcReceivedDate);
      const risk = !!(latestFcReceivedMonth && requiredConfirmMonth && latestFcReceivedMonth > requiredConfirmMonth);
      return { ...row, requiredLeadTimeDays: leadTimeDays, requiredConfirmDate, requiredConfirmMonth, latestFcReceivedMonth, risk };
    })
    .sort((a, b) => String(a.requiredConfirmDate || '').localeCompare(String(b.requiredConfirmDate || '')) || String(a.fgCode).localeCompare(String(b.fgCode)));
}

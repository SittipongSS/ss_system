const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date;
}

export function addValidityDays(quoteDate, days) {
  const date = parseDateOnly(quoteDate);
  const count = Math.max(0, Math.trunc(Number(days) || 0));
  if (!date || !count) return "";
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function validityDaysBetween(quoteDate, validUntil) {
  const start = parseDateOnly(quoteDate);
  const end = parseDateOnly(validUntil);
  if (!start || !end) return "";
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

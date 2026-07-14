export const BUSINESS_TIME_ZONE = 'Asia/Bangkok';

function dateParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function businessDate(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const { year, month, day } = dateParts(value, timeZone);
  return `${year}-${month}-${day}`;
}

export function businessMonthKey(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const { year, month } = dateParts(value, timeZone);
  return `${year.slice(-2)}${month}`;
}

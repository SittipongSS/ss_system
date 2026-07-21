// Shared (client-safe) helpers for the versioned holiday calendar
// (Decision 0012, migration 0132). A version's payload is the WHOLE holiday
// set: an array of { date: 'YYYY-MM-DD', name: string } entries.

export const HOLIDAY_CALENDAR_LIMITS = Object.freeze({
  entries: 1000,
  name: 200,
  changeNote: 500,
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidHolidayDate(value) {
  const text = String(value || '');
  if (!DATE_PATTERN.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  // ปัดวันที่ไม่มีจริง (เช่น 2026-02-30 ซึ่ง Date เลื่อนเป็นเดือนถัดไปเงียบ ๆ)
  const pad = (n) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` === text;
}

// Normalize a whole calendar payload: trim names, validate every date,
// reject duplicates, and return entries sorted by date.
export function normalizeHolidayEntries(input) {
  const errors = [];
  if (!Array.isArray(input)) {
    return { value: [], errors: ['รูปแบบข้อมูลวันหยุดไม่ถูกต้อง'] };
  }
  if (input.length > HOLIDAY_CALENDAR_LIMITS.entries) {
    errors.push(`วันหยุดต้องไม่เกิน ${HOLIDAY_CALENDAR_LIMITS.entries} รายการ`);
  }

  const seen = new Set();
  const value = [];
  for (const entry of input) {
    const date = String(entry?.date || '').trim();
    const name = String(entry?.name || '').trim();
    if (!isValidHolidayDate(date)) {
      errors.push(`วันที่ "${date || '-'}" ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD และเป็นวันที่ที่มีจริง)`);
      continue;
    }
    if (name.length > HOLIDAY_CALENDAR_LIMITS.name) {
      errors.push(`ชื่อวันหยุดของ ${date} ต้องไม่เกิน ${HOLIDAY_CALENDAR_LIMITS.name} ตัวอักษร`);
    }
    if (seen.has(date)) {
      errors.push(`วันที่ ${date} ซ้ำกันในชุดข้อมูล`);
      continue;
    }
    seen.add(date);
    value.push({ date, name });
  }
  value.sort((a, b) => a.date.localeCompare(b.date));
  return { value, errors: [...new Set(errors)] };
}

// Parse pasted lines "YYYY-MM-DD ชื่อวันหยุด" (one per line) — the fast path
// for entering a whole new year's holiday set at once.
export function parseHolidayLines(text) {
  const entries = [];
  const errors = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(\S+)\s*(.*)$/);
    const date = match?.[1] || '';
    const name = (match?.[2] || '').trim();
    if (!isValidHolidayDate(date)) {
      errors.push(`บรรทัด "${line}" ต้องขึ้นต้นด้วยวันที่ YYYY-MM-DD`);
      continue;
    }
    entries.push({ date, name });
  }
  return { entries, errors };
}

export function holidayCalendarStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'เก็บถาวร';
  return 'ฉบับร่าง';
}

export function hasPublishableChangeNote(version) {
  return !!String(version?.changeNote || '').trim();
}

// ── นำเข้าวันหยุดจากปฏิทินสาธารณะของ Google (ตรรกะบริสุทธิ์) ──────────
// ไม่แตะ network/DB/env เลย — ส่วนที่ยิงออกเน็ตอยู่ที่ lib/master/holidayCalendarFeed.js
// เพื่อให้ไฟล์นี้เทสต์ได้ offline ใน CI (scripts/test-loader.mjs ไม่ต่อเครือข่าย)
//
// ทำไมต้อง parse ICS เอง: ปฏิทินวันหยุดไทยของ Google เปิดสาธารณะเป็น .ics อ่านได้โดย
// ไม่ต้อง auth — ต่างจาก Calendar API ที่ต้องเปิด API ใน GCP + เพิ่ม scope ให้ service
// account ที่ถือสิทธิ์ Drive ทั้งบริษัท และทดสอบบนเครื่องไม่ได้ (WIF ทำงานเฉพาะบน Vercel)

// DESCRIPTION ของอีเวนต์บอกเองว่าเป็นวันหยุดราชการหรือแค่ "วันสำคัญ" (ตรุษจีน/วาเลนไทน์/
// คริสต์มาส) — ข้อมูลจริงปี 2026 ยืนยันว่าบริษัทไม่ได้หยุดวันสำคัญเลยสักวัน
export const PUBLIC_HOLIDAY_HINT = 'วันหยุดนักขัตฤกษ์';
export const MAX_IMPORT_ROWS = 60;
export const MAX_HOLIDAY_NAME = 120;
// อีเวนต์เดียวยาวเกินหนึ่งปี = ข้อมูลเพี้ยน — กันลูปไม่จบ
const MAX_RANGE_DAYS = 366;

const INVISIBLE_CHARS = new RegExp('[\u200B-\u200D\uFEFF]', 'g');

const pad2 = (n) => String(n).padStart(2, '0');

// RFC 5545 §3.1: บรรทัดยาวถูกตัดแล้วขึ้นบรรทัดใหม่โดยนำหน้าด้วย space/tab — ต้องต่อคืน
// ก่อนอ่าน ไม่งั้นชื่อวันหยุดยาว ๆ (ของจริงมีถึง 90 ตัวอักษร) จะขาดกลางคัน
export function unfoldIcsLines(text) {
  if (typeof text !== 'string' || !text) return [];
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

// คลาย escape ของ ICS: \, \; \\ และ \n (ชื่อวันหยุดใช้บรรทัดเดียว จึงแปลง \n เป็นช่องว่าง)
export function unescapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\[nN]/g, ' ')
    .replace(/\\([,;\\])/g, '$1');
}

// ⚠️ ของจริงจาก Google มีอักขระล่องหนปนมา — "วันรัฐธรรมนูญ" ปี 2026 ขึ้นต้นด้วย
// zero-width space (U+200B) ทำให้ชื่อที่ "ดูเหมือนตรงกัน" ถูกตัดสินว่าไม่ตรงและโผล่เป็น
// รายการชื่อไม่ตรงปลอมทุกครั้งที่นำเข้า
export function sanitizeHolidayName(value) {
  return unescapeIcsText(value)
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_HOLIDAY_NAME);
}

// 'YYYYMMDD' (หรือ 'YYYYMMDDThhmmssZ') → มิลลิวินาที UTC · รูปแบบผิด = null
function ymdToUtc(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(value || '').trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const dt = new Date(ms);
  // กันวันที่ที่ไม่มีจริง (เช่น 20270231 ที่ JS จะเลื่อนเป็น 3 มี.ค. เงียบ ๆ)
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1) return null;
  return ms;
}

function isoFromUtc(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// ⚠️ DTEND ของอีเวนต์ all-day เป็น **exclusive** — 31 ธ.ค. 2027 มี DTEND เป็น 1 ม.ค. 2028
// เผลอนับตรง ๆ จะได้วันหยุดเกินมาหนึ่งวันทุกอีเวนต์
// ⚠️ ห้ามใช้ Date ท้องถิ่นที่ไหนเลย: new Date('2027-12-31').getDate() ได้ 30 ใน timezone ลบ
export function expandDateRange(startYmd, endYmdExclusive) {
  const start = ymdToUtc(startYmd);
  if (start === null) return [];
  const end = ymdToUtc(endYmdExclusive);
  const dates = [isoFromUtc(start)];
  if (end === null || end <= start) return dates;
  for (let ms = start + 86400000; ms < end && dates.length < MAX_RANGE_DAYS; ms += 86400000) {
    dates.push(isoFromUtc(ms));
  }
  return dates;
}

function readProp(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const rawName = line.slice(0, idx);
  const name = rawName.split(';')[0].toUpperCase();
  return { name, value: line.slice(idx + 1) };
}

function eventToRows(event) {
  if (!event.DTSTART) return [];
  // อีเวนต์ที่ถูกยกเลิก หรือ recurring (วันหยุดไทยไม่มี — ถ้ามีก็ตีความเองไม่ได้) ให้ข้าม
  if ((event.STATUS || '').toUpperCase() === 'CANCELLED') return [];
  if (event.RRULE) return [];

  const name = sanitizeHolidayName(event.SUMMARY);
  const description = sanitizeHolidayName(event.DESCRIPTION);
  // ไม่มี DESCRIPTION = ถือเป็นวันหยุดราชการ (ปฏิทินต้นทางคือปฏิทินวันหยุด) — คนยังต้อง
  // ติ๊กยืนยันอยู่ดี ค่านี้แค่ตัดสินว่าจะติ๊กให้ล่วงหน้าหรือไม่
  const kind = !description || description.startsWith(PUBLIC_HOLIDAY_HINT) ? 'public' : 'observance';

  return expandDateRange(event.DTSTART, event.DTEND).map((date) => ({ date, name, kind }));
}

// ICS ทั้งก้อน → [{ date, name, kind }] เรียงตามวัน · ไม่ throw ไม่ว่าข้อมูลจะพังแค่ไหน
// (ฟีเจอร์นี้เป็นของเสริมของหน้าตั้งค่า ห้ามทำให้หน้าพัง)
export function parseHolidayIcs(text) {
  const lines = unfoldIcsLines(text);
  const rows = [];
  let event = null;
  let nestedDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'BEGIN:VEVENT') {
      event = {};
      nestedDepth = 0;
      continue;
    }
    if (!event) continue; // นอก VEVENT ไม่สนใจเลย → VTIMEZONE ที่มี DTSTART ของตัวเองจึงไม่หลุดเข้ามา

    if (trimmed === 'END:VEVENT') {
      rows.push(...eventToRows(event));
      event = null;
      nestedDepth = 0;
      continue;
    }
    // sub-component ใน VEVENT (เช่น VALARM) มี property ชื่อซ้ำได้ — ข้ามทั้งบล็อก
    if (trimmed.startsWith('BEGIN:')) { nestedDepth += 1; continue; }
    if (trimmed.startsWith('END:')) { nestedDepth = Math.max(0, nestedDepth - 1); continue; }
    if (nestedDepth > 0) continue;

    const prop = readProp(trimmed);
    if (!prop) continue;
    if (['DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION', 'STATUS', 'RRULE'].includes(prop.name)) {
      event[prop.name] = prop.value;
    }
  }

  // วันเดียวกันซ้ำ (เช่นวันหยุดชดเชยที่ประกาศทับ) — เอาแถวแรกไว้ ผลลัพธ์คงที่เสมอ
  const seen = new Map();
  for (const row of rows) if (row.date && !seen.has(row.date)) seen.set(row.date, row);
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function filterByYear(rows = [], year) {
  const prefix = `${String(year)}-`;
  return rows.filter((row) => String(row?.date || '').startsWith(prefix));
}

// เทียบของจาก Google กับที่มีในระบบ → รายการให้คนติ๊ก
//
// ⚠️ **additive อย่างเดียว**: วันหยุดที่มีในระบบแต่ไม่มีในปฏิทิน Google (ของจริงคือ
// "วันเข้าพรรษา" ที่บริษัทหยุดแต่ Google ไม่มี) ต้องไม่โผล่ในผลลัพธ์และไม่ถูกแตะเลย
// การนำเข้าไม่มีวันเสนอให้ลบอะไรทั้งสิ้น
export function diffHolidayYear(googleRows = [], existingRows = [], year) {
  const existing = new Map();
  for (const row of existingRows) {
    const date = String(row?.date || '');
    if (date) existing.set(date, sanitizeHolidayName(row?.name));
  }

  const rows = filterByYear(googleRows, year).map((row) => {
    const name = sanitizeHolidayName(row.name);
    const current = existing.has(row.date) ? existing.get(row.date) : null;
    const action = current === null ? 'new' : current === name ? 'same' : 'renamed';
    return { date: row.date, name, current, action, kind: row.kind === 'observance' ? 'observance' : 'public' };
  });

  const summary = { new: 0, renamed: 0, same: 0, total: rows.length };
  for (const row of rows) summary[row.action] += 1;
  return { rows, summary };
}

// ตรวจแถวก่อนบันทึกจริง — ใช้ทั้งฝั่ง preview และ commit (commit ห้ามเชื่อ client)
export function normalizeImportRows(rows, year) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows: [], error: 'ไม่มีรายการที่เลือกไว้' };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], error: `เลือกได้ไม่เกิน ${MAX_IMPORT_ROWS} วันต่อครั้ง` };
  }

  const prefix = `${String(year)}-`;
  const out = new Map();
  for (const row of rows) {
    const date = String(row?.date || '').trim();
    // holidays.date เป็น text PK — '2027-1-1' กับ '2027-01-01' เป็นคนละแถว จึงต้องเข้มรูปแบบ
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { rows: [], error: `รูปแบบวันที่ไม่ถูกต้อง: ${date || '(ว่าง)'}` };
    }
    if (!date.startsWith(prefix)) {
      return { rows: [], error: `วันที่ ${date} ไม่ได้อยู่ในปี ${year}` };
    }
    out.set(date, { date, name: sanitizeHolidayName(row?.name) });
  }
  return { rows: [...out.values()].sort((a, b) => a.date.localeCompare(b.date)), error: null };
}

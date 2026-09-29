// ── ยาม: สัปดาห์ของทั้งระบบเริ่มวันอาทิตย์ (อา–ส) ────────────────────────────────
//
// ⭐ มติเจ้าของ 2026-09-26: "ปฏิทินทั้งระบบเริ่มวันอาทิตย์" — ก่อนหน้านั้นระบบมีสองสัปดาห์
//    ปนกัน: กริดปฏิทิน (MonthGrid · DateInput · DayRangePicker · กำหนดการของฉัน) ขึ้นต้น อา.
//    แต่ตารางจัดคิวบริการ · บอร์ดผลิต · ปฏิทินคำสัญญา RD · แกนแกนต์ · ถังรายสัปดาห์ของ KPI ลีด
//    ขึ้นต้น จ. ⇒ แผงเดียวกัน (DayRangePicker) เคยไฮไลต์ "สัปดาห์นี้" เริ่มกลางแถวของกริดตัวเอง
//
// ยามนี้กันสองทาง:
//   1. ป้ายวันเจ็ดตัวที่เขียนเป็นอาร์เรย์ ต้องขึ้นต้นวันอาทิตย์ (ไม่มีอาร์เรย์ไหนขึ้นต้น จ.)
//   2. สูตรเลื่อนไปวันจันทร์ที่เคยกระจายอยู่ห้าไฟล์ (datePeriods · requests/dueCalendar ·
//      service/schedule · production/board · pm/ProjectDocumentView — รูป `(getDay() + 6) % 7` ·
//      `mondayOf` · `=== 0 ? -6 : 1 -`) รวมถึงรูปอื่นที่นิยม (`getDay() || 7` · `getDay() - 1`)
//      ต้องไม่งอกกลับ — ต้นสัปดาห์ให้ถาม `weekStartOf` (lib/datePeriods.js) ที่เดียว
//   3. ข้อความบนจอที่บอกว่าสัปดาห์เริ่มวันจันทร์ ("เริ่มวันจันทร์" · "จ.–อา.") ต้องไม่กลับมา —
//      เคยหลุดมาแล้วหนึ่งครั้ง: ถังรายสัปดาห์ของ KPI ลีดเปลี่ยนเป็น อา.–ส. แต่โน้ตใต้กราฟยัง
//      บอก Marketing ว่า "เริ่มวันจันทร์" บนจอที่ตัวเลขเพิ่งขยับพอดี
// และทาบตัวหาต้นสัปดาห์ทุกตัวที่มีอยู่ว่าตอบวันเดียวกัน
//
// ⚠️ ไม่ได้ห้ามการ "เรียงวันแบบอื่น" ทุกกรณี — อาร์เรย์ที่ไม่ใช่ป้ายวันครบเจ็ดตัว (เช่น
//    ['ส.', 'อา.'] ของวันหยุด หรือ ['จังหวัด', 'จ.'] ของที่อยู่) ไม่เข้าเงื่อนไข
// ⚠️ ไม่ตรวจไฟล์เทสต์ — เทสต์ต้องเขียนลำดับผิดไว้เป็นตัวอย่างค้านได้
// ⚠️ ตัดคอมเมนต์ออกก่อนตรวจสูตร — คอมเมนต์ที่เล่าว่าเคยเริ่มวันจันทร์ต้องไม่ทำเทสต์แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, dayOfWeek, daysInRange, weekStartOf } from './datePeriods.js';
import { weekStart as dueWeekStart, weekDays as dueWeekDays } from './requests/dueCalendar.js';
import { startOfWeek as scheduleWeekStart, scheduleRange } from './salesPlanning/mySchedule.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (/\.(m?js|jsx)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const SOURCES = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).replaceAll('\\', '/'),
  text: readFileSync(file, 'utf8'),
}));

// ตัดคอมเมนต์แบบหยาบ — `//` ต้องนำด้วยช่องว่าง/ต้นบรรทัด (ไม่งั้น URL ในสตริงโดนตัด)
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/[^\n]*/g, '$1');

/* ป้ายวันที่ระบบใช้จริง (ย่อ มี/ไม่มีจุด · เต็ม · อังกฤษ) — ตัดจุดท้ายก่อนเทียบ */
const SUNDAY = new Set(['อา', 'อาทิตย์', 'วันอาทิตย์', 'Sun', 'Sunday', 'Su', 'S']);
const WEEKDAY_TOKENS = new Set([
  ...SUNDAY,
  'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส',
  'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
  'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'M', 'T', 'W', 'F',
]);
const norm = (label) => label.trim().replace(/\.$/, '');

/** อาร์เรย์ป้ายวันครบเจ็ดตัวในข้อความ — คืน [{ labels, line }] */
function weekdayArrays(text) {
  const out = [];
  for (const match of text.matchAll(/\[([^[\]]*)\]/g)) {
    const body = match[1];
    const literals = [...body.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
    if (literals.length !== 7) continue;
    // เนื้ออาร์เรย์ต้องมีแต่สตริง — กันไปจับ `[a, 'จ', b]` ที่ไม่ใช่ป้าย
    if (body.replace(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g, '').replace(/[\s,]/g, '') !== '') continue;
    if (!literals.every((label) => WEEKDAY_TOKENS.has(norm(label)))) continue;
    out.push({ labels: literals, line: text.slice(0, match.index).split('\n').length });
  }
  return out;
}

test('ตัวจับอาร์เรย์ป้ายวันจับถูกตัว — ไม่งั้นยามข้างล่างเขียวเพราะมองไม่เห็นอะไรเลย', () => {
  assert.deepEqual(
    weekdayArrays(`const A = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];`).map((a) => a.labels[0]),
    ['จ.'],
  );
  assert.equal(weekdayArrays(`const B = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];`).length, 1);
  assert.equal(weekdayArrays(`const C = ['จังหวัด', 'จ.'];`).length, 0, 'คำนำหน้าจังหวัดไม่ใช่ป้ายวัน');
  assert.equal(weekdayArrays(`const D = ['ส.', 'อา.'];`).length, 0, 'ไม่ครบเจ็ดวัน = ไม่ใช่หัวปฏิทิน');
  // ระบบมีป้ายวันเขียนเป็นอาร์เรย์หลายสิบไฟล์ — ถ้าจับได้น้อยกว่านี้แปลว่าตัวจับหรือตัวตัดคอมเมนต์พัง
  const found = SOURCES.flatMap(({ text }) => weekdayArrays(stripComments(text)));
  assert.ok(found.length >= 10, `จับอาร์เรย์ป้ายวันได้แค่ ${found.length} ตัว — ตัวจับน่าจะพัง`);
});

test('🔴 ไม่มีอาร์เรย์ป้ายวันไหนขึ้นต้นวันจันทร์ — ทุกตัวขึ้นต้นวันอาทิตย์ (มติ 2026-09-26)', () => {
  const offenders = [];
  for (const { rel, text } of SOURCES) {
    for (const { labels, line } of weekdayArrays(stripComments(text))) {
      if (!SUNDAY.has(norm(labels[0]))) offenders.push(`${rel}:${line} [${labels.join(', ')}]`);
    }
  }
  assert.deepEqual(offenders, [], `ป้ายวันต้องเรียง อา.–ส. (index = getDay()):\n${offenders.join('\n')}`);
});

/* สูตรที่ทำให้สัปดาห์เริ่มวันจันทร์ — รูปที่เคยมีจริงในระบบก่อน 2026-09-26 */
const MONDAY_SHIFTS = [
  { re: /\+\s*6\s*\)\s*%\s*7/, why: '(getDay() + 6) % 7 = เลื่อนให้จันทร์เป็น 0' },
  { re: /\bmonday(?:Of|IsoOf)\b|\bbackToMonday\b/i, why: 'ตัวหาวันจันทร์ต้นสัปดาห์' },
  { re: /===\s*0\s*\?\s*-6\s*:\s*1\s*-/, why: 'อาทิตย์ถอย 6 วัน = สัปดาห์เริ่มจันทร์' },
  { re: /get(?:UTC)?Day\(\)\s*\|\|\s*7\b|get(?:UTC)?Day\(\)\s*-\s*1\b/, why: 'getDay() || 7 / getDay() - 1 = นับจันทร์เป็นวันแรก' },
  // ⚠️ ตรวจหลังตัดคอมเมนต์ — คอมเมนต์ที่เล่าว่า "เดิมเริ่มวันจันทร์" ไม่โดน · คำใบ้เวลาทำการแบบพิมพ์เอง
  //    'จ-อา 07:00' (ServiceAssetModal) ใช้ขีดสั้นไม่มีจุด จึงไม่เข้าข่าย
  { re: /เริ่มวันจันทร์|จ\.\s*[–-]\s*อา\./, why: 'ข้อความบนจอบอกว่าสัปดาห์เริ่มวันจันทร์' },
];

test('ตัวจับสูตร/ข้อความวันจันทร์จับของจริงที่เคยหลุด และไม่จับคำใบ้ที่ถูก', () => {
  const hits = (code) => MONDAY_SHIFTS.filter(({ re }) => re.test(stripComments(code))).length;
  // ของจริงที่เคยอยู่บนจอ /sa/dashboard (KPI ลีด รายสัปดาห์) ก่อนแก้
  assert.equal(hits(`<p>{"สัปดาห์เริ่มวันจันทร์ · สัปดาห์หัวท้ายงวดไม่ครบเจ็ดวัน"}</p>`), 1);
  assert.equal(hits(`const note = 'ชิปคลุม จ.–อา.';`), 1);
  assert.equal(hits(`const dow = d.getDay() || 7;`), 1);
  assert.equal(hits(`const idx = date.getUTCDay() - 1;`), 1);
  // ไม่ควรจับ
  assert.equal(hits(`// เดิมเริ่มวันจันทร์\nconst a = 1;`), 0, 'คอมเมนต์เล่าประวัติ');
  assert.equal(hits(`{/* เดิมนับ จ.–อา. */}`), 0, 'คอมเมนต์ JSX');
  assert.equal(hits(`hint: "เช่น จ-อา 07:00-19:00 หรือ 3 ช่วง"`), 0, 'คำใบ้เวลาทำการของเครื่อง');
  assert.equal(hits(`"สัปดาห์เริ่มวันอาทิตย์ (อา.–ส.)"`), 0);
  assert.equal(hits(`const back = d.getDay() - 10;`), 0);
});

test('🔴 ไม่มีสูตรหรือข้อความเลื่อนต้นสัปดาห์ไปวันจันทร์ — ถาม weekStartOf ที่เดียว', () => {
  const offenders = [];
  for (const { rel, text } of SOURCES) {
    const code = stripComments(text);
    for (const { re, why } of MONDAY_SHIFTS) {
      const hit = code.match(re);
      if (hit) offenders.push(`${rel}: "${hit[0]}" — ${why}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('ตัวหาต้นสัปดาห์ทุกตัวในระบบตอบวันอาทิตย์วันเดียวกัน', () => {
  // สองเดือนเต็ม ข้ามเดือนและข้ามปี
  const days = [...daysInRange('2026-09-01', '2026-10-31'), ...daysInRange('2026-12-25', '2027-01-08')];
  for (const day of days) {
    const sunday = weekStartOf(day);
    assert.equal(dayOfWeek(sunday), 0, `${day} → ${sunday} ต้องเป็นวันอาทิตย์`);
    assert.ok(sunday <= day && addDays(sunday, 6) >= day, `${day} ต้องอยู่ในสัปดาห์ ${sunday}`);
    assert.equal(dueWeekStart(day), sunday, `ปฏิทินคำสัญญา RD: ${day}`);
    assert.equal(scheduleWeekStart(day), sunday, `กำหนดการของฉัน: ${day}`);
    assert.deepEqual(scheduleRange('week', day), { from: sunday, to: addDays(sunday, 6) });
  }
});

test('หัวตารางสัปดาห์ของปฏิทินคำสัญญา RD เรียง อา.–ส.', () => {
  const labels = dueWeekDays(weekStartOf('2026-09-26')).map((d) => d.label);
  assert.deepEqual(labels, ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
});

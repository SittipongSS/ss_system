// ⭐ ยามเสริมของ lib/weekStartsSunday.test.mjs (#1841) — ตัวนั้นคุมชื่อวัน 7 ตัว · ชื่อฟังก์ชันวันจันทร์ · สูตร +6)%7 ทุกไฟล์
//    และพฤติกรรมของตัวหาต้นสัปดาห์ · ไฟล์นี้เติมสิ่งที่ตัวนั้นไม่ดู: ช่องวันของเบราว์เซอร์ · ช่องที่ชนิดมาจากข้อมูล ·
//    date_trunc('week') ใน migration ใหม่ · ลิสต์ชื่อวันสั้น/หลายบรรทัด · ตัวแปร === 0 ? 6 :
//
// ── ด่านกันถอยหลัง: สัปดาห์/ปฏิทินทั้งระบบเริ่มวันอาทิตย์ (อา.–ส.) ─────────────────────────────
//
// ⭐ มติเจ้าของ 26/09 สัปดาห์เริ่มวันอาทิตย์ — "การเรียงวันปฏิทิน ต้อง อา-ส ทั้งระบบ" · ทุกปฏิทิน หัวสัปดาห์
//    ตารางรายสัปดาห์ ช่วงสัปดาห์ และถังรายสัปดาห์ เรียง อาทิตย์ → เสาร์
//    ต้นสัปดาห์หาที่เดียว: `weekStartOf` / `dayOfWeek` ใน lib/datePeriods.js (0 = อาทิตย์ … 6 = เสาร์)
//
// 🐞 ก่อนมติ ระบบมีสองแบบปนกัน — MonthGrid · DateInput · กำหนดการของฉัน เริ่มอาทิตย์ แต่จัดคิวช่าง ·
//    บอร์ดผลิต · ปฏิทินคำสัญญา RD · แกนต์โครงการ · ถังลีดรายสัปดาห์ เริ่มจันทร์ ด้วยสูตรที่ก๊อปต่อกันมา
//    `(getDay() + 6) % 7` — จอใหม่ลอกสูตรนี้กลับมาเมื่อไหร่ก็ไม่มีอะไรตก ⇒ ไฟล์นี้
//
// ยามสี่ตัว (ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์เล่าถึงสูตรเก่าได้ เหมือน datePeriods.js):
//   1. สูตรถอยไปวันจันทร์ ในไฟล์ที่ถามวันในสัปดาห์ (getDay/getUTCDay/dayOfWeek)
//      `+ 6) % 7` · `=== 0 ? -6 :` / `=== 0 ? 6 :` · `getDay() || 7`
//   2. ลิสต์ชื่อวันที่ขึ้นต้นด้วยจันทร์แล้วต่อด้วยอังคาร — ['จ.', 'อ.', …] · ['จันทร์', 'อังคาร', …] · ['Mon', 'Tue', …]
//   3. `type="date"` ดิบ (รวม datetime-local/week) — ปฏิทินที่เบราว์เซอร์วาดเรียงตาม locale ของเครื่อง
//      แอปบังคับไม่ได้ ⇒ วันล้วนใช้ `DateInput` · วัน+เวลาใช้ `DateTimeInput` (ปฏิทินของเราเอง เรียง อา.–ส.)
//   4. `date_trunc('week', …)` ใน migration ใหม่ (> 0389) — Postgres ตัดสัปดาห์แบบ ISO = วันจันทร์
//      ⇒ SQL ที่ต้องการต้นสัปดาห์ใช้ `d - extract(dow from d)::int` (dow ของ Postgres 0 = อาทิตย์)
//
// ⚠️ **หน้าต่าง 7 วันแบบเลื่อน (วันนี้ … วันนี้ + 6) ไม่ใช่เลขสัปดาห์** — "นัดสัปดาห์นี้" (lib/service/overview.js) ·
//    "กำลังผลิตสัปดาห์นี้" (app/production/page.js) นับจากวันนี้ไปหกวัน ไม่ขึ้นกับว่าสัปดาห์เริ่มวันไหน
//    ⇒ ยามไม่จับ `+ 6` เดี่ยว ๆ · จับเฉพาะ `+ 6) % 7` (แปลงเลขวันให้จันทร์เป็น 0) และเฉพาะไฟล์ที่ถามวันในสัปดาห์
//    — `(i + 6) % 7` ที่หมุนดัชนีอย่างอื่นในไฟล์ที่ไม่แตะวันในสัปดาห์จึงไม่โดน
// ⚠️ ไม่จับเลขวันที่เก็บในฐาน — service_sites."accessDays" เก็บตาม getDay() (0 = อาทิตย์) อยู่แล้ว ไม่ต้องย้ายข้อมูล
// ⚠️ migration ≤ 0389 เป็นประวัติที่รันไปแล้ว แก้ไม่ได้ (และตรวจแล้วไม่มี date_trunc('week') สักไฟล์ ณ 26/09)
// ⚠️ ยาม 3 มองไม่เห็น `type={field.type}` ที่ค่าเป็น "date" ตอนรัน — ฟอร์มที่สร้างจากนิยามช่องต้องแยกสาขา
//    date ไปที่ DateInput เอง (แบบ TransitionDialog.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.resolve(srcRoot, '..', 'supabase', 'migrations');

/* migration ที่รันไปแล้วตอนมีมติ — ใหม่กว่านี้ต้องผ่านยาม 4 */
const LAST_MIGRATION_BEFORE_RULE = 389;

/* ข้อยกเว้นรายไฟล์ (path จาก src/ → เหตุผล) — ต้องมีเหตุผลด้านข้อมูล ไม่ใช่ความสะดวก
   ณ 26/09 ไม่มีสักไฟล์: ทุกจอ/ถัง/ปฏิทินที่เคยเริ่มจันทร์ย้ายไปเรียก weekStartOf แล้ว
   (ถ้าวันหนึ่งต้องออกรายงานเลขสัปดาห์ ISO ให้ภายนอก ให้ลงชื่อไฟล์ที่นี่พร้อมเหตุผล) */
const EXCEPTIONS = new Map([
]);

function sourceFiles(dir = srcRoot) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    // เทสต์ใช้วันจันทร์เป็นข้อมูลตัวอย่างได้ (และไฟล์นี้เองก็ต้องมีตัวอย่างสูตรเก่า) — ยามดูโค้ดที่รันจริง
    if (/\.(js|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(full);
  }
  return out;
}

/* ตัดคอมเมนต์ทิ้งก่อนตรวจ — แทนด้วยช่องว่างให้เลขบรรทัดยังตรง (สูตรเดียวกับ salesRoleRatchet.test.mjs)
   `(^|[^:'"`\\])` กัน `https://` ในสตริงไม่ให้โดนตัดเป็นคอมเมนต์ */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));

const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

/* ไฟล์นี้ถามวันในสัปดาห์ไหม — ไม่ถาม = `+ 6) % 7` ในไฟล์เป็นการหมุนดัชนีอย่างอื่น ไม่ใช่สัปดาห์ */
const ASKS_WEEKDAY = /\.get(?:UTC)?Day\(\)|\bdayOfWeek\(/;
const MONDAY_SHIFTS = [
  { rule: '(วัน + 6) % 7', pattern: /\+\s*6\s*\)\s*%\s*7/ },
  { rule: 'อาทิตย์ถอย 6 วัน', pattern: /===\s*0\s*\?\s*-?\s*6\s*:/ },
  { rule: 'getDay() || 7 (เลขวันแบบ ISO)', pattern: /\.get(?:UTC)?Day\(\)\s*\|\|\s*7\b/ },
];
const Q = `['"\`]`;
const MONDAY_FIRST_LIST = new RegExp(
  `\\[\\s*(${Q})(?:จ\\.?|จันทร์|วันจันทร์|Mon(?:day)?\\.?)\\1\\s*,\\s*(${Q})(?:อ\\.?|อังคาร|วันอังคาร|Tue(?:s|sday)?\\.?)\\2`,
  'gi',
);
const NATIVE_DATE_PICKER = /\btype\s*=\s*(?:(["'])(?:date|datetime-local|week)\1|\{\s*(["'`])(?:date|datetime-local|week)\2\s*\})/g;
const SQL_WEEK_TRUNC = /\bdate_trunc\s*\(\s*'week'/gi;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** ข้อความซอร์ส → รายการจุดที่เริ่มสัปดาห์วันจันทร์ `{ line, rule }` (ยาม 1 + 2) */
function mondayFirstOffenders(source) {
  const text = stripComments(source);
  const out = [];
  if (ASKS_WEEKDAY.test(text)) {
    text.split('\n').forEach((line, i) => {
      for (const { rule, pattern } of MONDAY_SHIFTS) {
        if (pattern.test(line)) out.push({ line: i + 1, rule });
      }
    });
  }
  for (const m of text.matchAll(MONDAY_FIRST_LIST)) out.push({ line: lineOf(text, m.index), rule: 'ชื่อวันเริ่มจันทร์' });
  return out.sort((a, b) => a.line - b.line);
}

/** ข้อความซอร์ส → เลขบรรทัดของช่องวันแบบ native (ยาม 3) */
function nativeDatePickerLines(source) {
  const text = stripComments(source);
  return [...text.matchAll(NATIVE_DATE_PICKER)].map((m) => lineOf(text, m.index));
}

/** ข้อความ SQL → เลขบรรทัดที่ตัดสัปดาห์แบบ ISO (ยาม 4) */
function sqlWeekTruncLines(sql) {
  const text = stripSqlComments(sql);
  return [...text.matchAll(SQL_WEEK_TRUNC)].map((m) => lineOf(text, m.index));
}

const rel = (file) => path.relative(srcRoot, file);

test('🔒 ไม่มีโค้ดไหนหาต้นสัปดาห์เป็นวันจันทร์ หรือเรียงชื่อวันเริ่มจันทร์ — ใช้ weekStartOf/dayOfWeek (datePeriods.js)', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (EXCEPTIONS.has(rel(file))) continue;
    for (const { line, rule } of mondayFirstOffenders(readFileSync(file, 'utf8'))) {
      offenders.push(`${rel(file)}:${line}: ${rule}`);
    }
  }
  assert.deepEqual(offenders, [], `สัปดาห์ต้องเริ่มวันอาทิตย์ (มติเจ้าของ 26/09) — เรียก weekStartOf/dayOfWeek ของ lib/datePeriods.js · ชื่อวันเรียง อา. จ. อ. … ส.:\n${offenders.join('\n')}`);
});

test('🔒 ไม่มีช่องวันแบบ native (type="date") — ปฏิทินเบราว์เซอร์เรียงตาม locale ใช้ DateInput แทน', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (EXCEPTIONS.has(rel(file))) continue;
    for (const line of nativeDatePickerLines(readFileSync(file, 'utf8'))) offenders.push(`${rel(file)}:${line}`);
  }
  assert.deepEqual(offenders, [], `ช่องวันดิบ — เปลี่ยนเป็น <DateInput value={iso} onChange={(iso) => …} /> (ค่ายังเป็น ISO เดิม):\n${offenders.join('\n')}`);
});

test('🔒 ช่องที่ชนิดมาจากตัวแปร (`type={f.type …}`) ต้องแยกกิ่งวันไปหา DateInput — ยามข้อ 3 มองไม่เห็นชนิดที่มาจากข้อมูล', () => {
  /* 🐞 review 26/09: AttachmentsPanel วาดช่องข้อมูลเสริมของไฟล์แนบด้วย `type={f.type || "text"}` ⇒ ช่อง "วันที่ชำระ" (ชนิด date)
     กลายเป็นปฏิทินเบราว์เซอร์ดิบ ทั้งที่ยามข้อ 3 เขียว · ไฟล์ที่ใช้ชนิดจากตัวแปรต้องมีกิ่ง `.type === "date"` ในไฟล์เดียวกัน */
  const offenders = [];
  for (const file of sourceFiles()) {
    if (EXCEPTIONS.has(rel(file))) continue;
    const src = readFileSync(file, 'utf8');
    if (!/\btype=\{\s*[\w.]+\.type\b/.test(src)) continue;
    if (/\.type\s*===\s*["']date["']/.test(src)) continue;
    // รายการชนิดประกาศอยู่ในไฟล์เดียวกันและไม่มี "date" (ServiceAssetModal · SETTING_INPUTS มีแค่ number/text) = ปลอดภัย
    const localTypes = [...src.matchAll(/\btype:\s*["'](\w+)["']/g)].map((m) => m[1]);
    if (localTypes.length && !localTypes.includes('date')) continue;
    offenders.push(rel(file));
  }
  assert.deepEqual(offenders, [], `ช่องชนิดจากตัวแปรไม่มีกิ่งวัน → DateInput:\n${offenders.join('\n')}`);
});

test(`🔒 migration ใหม่ (> ${String(LAST_MIGRATION_BEFORE_RULE).padStart(4, '0')}) ไม่ใช้ date_trunc('week') — Postgres ตัดสัปดาห์ที่วันจันทร์`, () => {
  const offenders = [];
  for (const name of readdirSync(migrationsDir)) {
    const m = name.match(/^(\d{4})_.*\.sql$/);
    if (!m || Number(m[1]) <= LAST_MIGRATION_BEFORE_RULE) continue;
    for (const line of sqlWeekTruncLines(readFileSync(path.join(migrationsDir, name), 'utf8'))) {
      offenders.push(`supabase/migrations/${name}:${line}`);
    }
  }
  assert.deepEqual(offenders, [], `ต้นสัปดาห์ใน SQL ใช้ (d - extract(dow from d)::int) — อาทิตย์เป็นวันแรก:\n${offenders.join('\n')}`);
});

test('ข้อยกเว้นทุกตัวยังจำเป็นอยู่จริง — ไฟล์หาย/ไม่ติดยามแล้ว ต้องเอาชื่อออก', () => {
  for (const [file, reason] of EXCEPTIONS) {
    assert.ok(reason && reason.length > 10, `${file}: ข้อยกเว้นต้องมีเหตุผล`);
    const source = readFileSync(path.join(srcRoot, file), 'utf8');
    const stillTrips = mondayFirstOffenders(source).length > 0 || nativeDatePickerLines(source).length > 0;
    assert.ok(stillTrips, `${file}: ไม่ติดยามแล้ว — ลบออกจาก EXCEPTIONS`);
  }
});

test('ยาม 1 จับสูตรเริ่มจันทร์ที่เคยมีจริงในรีโป (ก่อนมติ 26/09)', () => {
  const cases = [
    // lib/datePeriods.js dayOfWeek เดิม — ต้นเรื่องของถังลีดรายสัปดาห์
    ['const [y, m, d] = day.split("-").map(Number);\nreturn (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;', [2]],
    // app/service/schedule/page.js + app/production/board/page.js mondayOf เดิม
    ['function mondayOf(date) {\n  const d = new Date(date);\n  const shift = (d.getDay() + 6) % 7;\n  d.setDate(d.getDate() - shift);\n}', [3]],
    ['d.setDate(d.getDate() - ((d.getDay() + 6) % 7));', [1]],
    // lib/requests/dueCalendar.js weekStart เดิม — เลขวันแยกตัวแปรก่อนแปลง ก็ยังจับ
    ['const dow = new Date(base).getUTCDay();\nconst backToMonday = (dow + 6) % 7;', [2]],
    // components/pm/ProjectDocumentView.js mondayOf เดิม
    ['const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));', [1]],
    // สำนวนอื่นที่ได้ผลเดียวกัน
    ['const sinceMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;', [1]],
    ['const isoDow = d.getDay() || 7;', [1]],
    ['const i = (dayOfWeek(day) + 6) % 7;', [1]],
    ['const dowOf = (d) => (d.getUTCDay()+6)%7;', [1]],
  ];
  for (const [source, lines] of cases) {
    assert.deepEqual(mondayFirstOffenders(source).map((o) => o.line), lines, source);
  }
});

test('ยาม 2 จับลิสต์ชื่อวันที่เริ่มจันทร์ (บรรทัดเดียวหรือหลายบรรทัด)', () => {
  // lib/requests/dueCalendar.js WEEKDAY_LABELS เดิม
  assert.deepEqual(mondayFirstOffenders("export const WEEKDAY_LABELS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];").map((o) => o.line), [1]);
  assert.equal(mondayFirstOffenders('const DAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];').length, 1);
  assert.equal(mondayFirstOffenders("const NAMES = [\n  'จันทร์',\n  'อังคาร',\n];").length, 1);
  assert.equal(mondayFirstOffenders("const EN = ['Mon', 'Tue', 'Wed'];").length, 1);
});

test('ยาม 1–2 ไม่โดนของที่ถูกอยู่แล้ว — ปล่อยให้แคบ ไม่ใช่ห้ามทุกอย่างที่มีเลข 6', () => {
  for (const source of [
    // DateInput / MonthGrid — อาทิตย์เป็นคอลัมน์แรก
    'const sundayOffset = firstDay.getUTCDay(); // 0=อาทิตย์ ตรงคอลัมน์แรกพอดี',
    'const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];',
    "export const WEEKDAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];",
    // datePeriods.weekStartOf ตัวใหม่
    'const dow = dayOfWeek(day);\nreturn dow === null ? null : addDays(day, -dow);',
    // หน้าต่าง 7 วันแบบเลื่อน — ไม่ใช่สัปดาห์ปฏิทิน
    'const weekEnd = addDays(today, 6);',
    'const until = new Date(today.getTime() + 6 * DAY_MS); const dow = until.getDay();',
    // หมุนดัชนีในไฟล์ที่ไม่ถามวันในสัปดาห์
    'const prev = (index + 6) % 7;',
    // สูตรเก่าในคอมเมนต์ (บันทึกเหตุผล) ไม่นับ
    '/* ⇒ ห้ามหาต้นสัปดาห์เองด้วย `(getDay() + 6) % 7` */\nconst dow = d.getDay();',
    "// เดิม ['จ.', 'อ.', …] เริ่มจันทร์\nconst x = 1;",
    // วันทำการของไซต์เป็นข้อความเรียงวัน ไม่ใช่ลิสต์หัวสัปดาห์
    "const label = 'จ. อ. พ. พฤ. ศ.';",
  ]) {
    assert.deepEqual(mondayFirstOffenders(source), [], source);
  }
});

test('ยาม 3 จับช่องวัน native ทั้งบรรทัดเดียวและ props หลายบรรทัด — ไม่โดนคอมเมนต์ นิยามช่อง หรือช่องเดือน', () => {
  // components/service/AssetMoveModal.js + MachineAddModal.js เดิม (ก่อนเปลี่ยนเป็น DateInput 26/09)
  assert.deepEqual(nativeDatePickerLines('<Input type="date" value={form.movedAt || ""} onChange={(e) => patch({ movedAt: e.target.value })} />'), [1]);
  assert.deepEqual(nativeDatePickerLines('<Input\n  type="date" value={form.receivedAt || ""} max={businessDate()}\n  onChange={(e) => patch({ receivedAt: e.target.value })}\n/>'), [2]);
  assert.deepEqual(nativeDatePickerLines("<input type={'datetime-local'} />"), [1]);
  for (const source of [
    '/* ⚠️ วันล้วน ๆ ต้องผ่าน `DateInput` เสมอ — `<input type="date">` ดิบแสดงตาม locale */',
    '{ key: "wantedAt", label: "วันที่ต้องการสินค้า", type: "date" }',
    '<input type="month" className="premium-input" value={startMonth} />',
    '<DateInput value={form.movedAt || ""} onChange={(iso) => patch({ movedAt: iso })} />',
  ]) {
    assert.deepEqual(nativeDatePickerLines(source), [], source);
  }
});

test("ยาม 4 จับ date_trunc('week') ทุกตัวพิมพ์ — ไม่โดนคอมเมนต์ SQL หรือ date_trunc รายเดือน", () => {
  assert.deepEqual(sqlWeekTruncLines("select\n  date_trunc('week', v.\"scheduledDate\") as wk\nfrom service_visits v;"), [2]);
  assert.deepEqual(sqlWeekTruncLines("SELECT DATE_TRUNC( 'WEEK', now());"), [1]);
  assert.deepEqual(sqlWeekTruncLines("-- ห้าม date_trunc('week', d) เพราะเริ่มจันทร์\nselect date_trunc('month', d);"), []);
  assert.deepEqual(sqlWeekTruncLines("select d - extract(dow from d)::int as week_start;"), []);
});

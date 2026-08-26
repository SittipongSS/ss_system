#!/usr/bin/env node
/* ── ด่านกัน "วันแบบ UTC" ─────────────────────────────────────────────────────
 *
 * 🐞 บั๊กจริง (2026-08-26 ตอนตี 3): `fmtDate(createdAt)` ขึ้นวันที่ 25 ทั้งที่เวลาไทย
 * เป็นวันที่ 26 แล้ว — โค้ดตัดตัวอักษรจากสตริง ISO ซึ่งคือ **วันตามนาฬิกา UTC**
 * ไทยเร็วกว่า UTC 7 ชั่วโมง ⇒ **ทุกวันช่วงเที่ยงคืนถึง 7 โมงเช้า วันที่จะย้อนหลังไปหนึ่งวัน**
 * ไม่มีใครเจอเพราะแทบไม่มีใครทำงานช่วงนั้น และเมื่อเจอก็หาสาเหตุยากเพราะพอสาย ๆ มันก็หายเอง
 *
 * ที่แย่กว่าคือมันไม่ได้ผิดแค่บนจอ: เดือน Actual · SLA · ตีกลับอัตโนมัติ · อายุราคาวัตถุดิบ
 * ล้วนคิดจาก "วันนี้" ⇒ วันผิดหนึ่งวันแปลว่าเลขในรายงานผิด หรือด่านกั้นเปิดให้ของหลุดผ่าน
 *
 * **กติกาของระบบนี้: จุดเวลา → วันไทยเสมอ**
 *   ใช้ `businessDate()` (lib/businessDate.js) หรือ `businessDayKey()` (lib/datePeriods.js)
 *   ห้ามตัด `toISOString().slice(0, 10)` จากจุดเวลา
 *
 * ⚠️ สิ่งที่ **ไม่ผิด** และด่านนี้ต้องไม่จับ: การประกอบ *วันในปฏิทิน* จากตัวเลข
 * หรือจากสตริงวันล้วนที่ตรึงไว้ที่ `T00:00:00Z` แล้วบวกลบด้วย `setUTCDate` —
 * นั่นคือเลขคณิตของปฏิทิน ไม่มีโซนเวลาเข้ามาเกี่ยว (เช่น `addValidityDays`, `shiftDays`)
 *
 * เพดานเป็น ratchet: **ขึ้นไม่ได้ ลงได้อย่างเดียว**
 *
 * รัน: npm run check:thaitime
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative } from 'node:path';

const ROOT = process.cwd();

/* จุดที่ยังเหลือ — แต่ละบรรทัดต้องมีเหตุผลว่าทำไมยังไม่แก้ ไม่ใช่รายชื่อเงียบ ๆ
 * เอาออกได้เมื่อแก้แล้ว · เพิ่มเข้ามาไม่ได้ (ด่านจะตกถ้าเจอจุดใหม่) */
const ALLOWED = new Map([
  // ⏸ มติผู้ใช้ 2026-08-26: พักไว้ก่อน — เป็น **ด่านกั้นการส่งใบต้นทุน** ไม่ใช่แค่การแสดงผล
  // แก้แล้วต้องทดสอบเส้นทางอนุมัติทั้งเส้น จึงแยกเป็นงานของตัวเอง
  ['src/app/api/sa/costing/[id]/submit/route.js', 1],
  ['src/app/api/sa/costing/[id]/components/route.js', 1],
]);

const FILES = execSync('git ls-files "src/**/*.js" "src/**/*.jsx"', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.includes('.test.'));

/* จับสองรูปที่เป็นบั๊กจริง:
 *   1. `new Date().toISOString().slice(0, 10|7)` — "วันนี้/เดือนนี้" ตามนาฬิกา UTC
 *   2. `<ตัวแปรที่เป็นจุดเวลา>.slice(0, 10|7)` — ตัดวันออกจาก timestamp ตรง ๆ
 * ไม่จับ `.toISOString().slice()` ที่ตามหลัง `Date.UTC(` หรือ `setUTCDate(` ในบรรทัดเดียวกัน
 * (ประกอบวันในปฏิทินจากตัวเลข — ไม่เกี่ยวกับโซนเวลา) */
const NOW_UTC = /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(0,\s*(?:10|7)\)/;
const TS_SLICE = /\b(?:now|nowIso|iso|createdAt|updatedAt|\w+At)\s*\.slice\(0,\s*(?:10|7)\)/;
const CALENDAR_MATH = /Date\.UTC\(|setUTCDate\(|T00:00:00Z/;

const hits = new Map();
for (const file of FILES) {
  const src = readFileSync(`${ROOT}/${file}`, 'utf8');
  let count = 0;
  src.split('\n').forEach((line, index) => {
    if (CALENDAR_MATH.test(line)) return;
    if (!NOW_UTC.test(line) && !TS_SLICE.test(line)) return;
    count += 1;
    if (!hits.has(file)) hits.set(file, []);
    hits.get(file).push(`${file}:${index + 1}  ${line.trim().slice(0, 96)}`);
  });
  if (count) hits.get(file).count = count;
}

let failed = false;
const lines = [];
for (const [file, found] of hits) {
  const cap = ALLOWED.get(file) ?? 0;
  if (found.length > cap) {
    failed = true;
    lines.push(`❌ ${relative('.', file)} — เจอ ${found.length} จุด เพดาน ${cap}`);
    found.forEach((l) => lines.push(`     ${l}`));
  }
}
for (const [file, cap] of ALLOWED) {
  const found = hits.get(file)?.length ?? 0;
  if (found < cap) {
    failed = true;
    lines.push(`❌ ${file} — เหลือ ${found} จุด แต่เพดานยังเป็น ${cap} · รูดเพดานลงใน ALLOWED ด้วย`);
  }
}

if (failed) {
  console.error('check:thaitime ไม่ผ่าน — "วันนี้" ต้องมาจากนาฬิกาไทย ไม่ใช่ UTC\n');
  console.error(lines.join('\n'));
  console.error('\nใช้ businessDate() (lib/businessDate.js) หรือ businessDayKey() (lib/datePeriods.js) แทน');
  console.error('ถ้าเป็นการประกอบวันในปฏิทินจากตัวเลข ให้เขียนผ่าน Date.UTC(...) ซึ่งด่านนี้ยกเว้นให้');
  process.exit(1);
}

const total = [...ALLOWED.values()].reduce((sum, n) => sum + n, 0);
console.log(`check:thaitime ผ่าน — ตรวจ ${FILES.length} ไฟล์ · จุดที่ยังพักไว้: ${total} (เพดาน ขึ้นไม่ได้)`);

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
  // ⏸ หัวกระดาษรายงานภาษี — เวลาที่พิมพ์บนกระดาษ ไม่ได้ถูกเก็บลง DB และไม่มีด่านไหน
  // คิดจากมัน · แก้พร้อมงานสายภาษีรอบหน้า (เจอตอนขยายด่านนี้ 2026-08-28)
  ['src/lib/tax/reportPrint.js', 1],
]);

const FILES = execSync('git ls-files "src/**/*.js" "src/**/*.jsx"', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.includes('.test.'));

/* จับสี่รูปที่เป็นบั๊กจริง:
 *   1. `new Date().toISOString().slice(0, 10|7)` — "วันนี้/เดือนนี้" ตามนาฬิกา UTC
 *   2. `<ตัวแปรที่เป็นจุดเวลา>.slice(0, 10|7)` — ตัดวันออกจาก timestamp ตรง ๆ
 *   3. `.slice(11, 16)` — ตัด **เวลา** HH:MM ออกจาก ISO = เวลา UTC ช้ากว่าไทย 7 ชม.
 *   4. `new Date().getHours()/getMinutes()` — **นาฬิกาของเครื่องผู้ใช้** ไม่ใช่เวลาไทย
 *      (เปลี่ยนโซนเวลาในมือถือแล้วเวลาที่บันทึกเพี้ยนโดยไม่มีอะไรจับได้)
 * ⇒ เวลาของจุดเวลาต้องมาจาก `businessTimeKey()` (lib/datePeriods.js) เสมอ คู่กับวันไทย
 *
 * 🐞 เพิ่มข้อ 3–4 เมื่อ 2026-08-28 ตอนทำปุ่ม "เริ่มงาน/ปิดงาน" ของช่าง — ก่อนหน้านั้น
 * `CloseVisitSheet` ประทับเวลาเข้าไซต์ด้วย `d.getHours()` มาตลอดและ **CI เขียว**
 * ซึ่งเป็นอาการเดียวกับบั๊กตี 3 ข้างบนเป๊ะ แค่ย้ายจาก "วัน" มาเป็น "เวลา"
 *
 * ไม่จับ `.toISOString().slice()` ที่ตามหลัง `Date.UTC(` หรือ `setUTCDate(` ในบรรทัดเดียวกัน
 * (ประกอบวันในปฏิทินจากตัวเลข — ไม่เกี่ยวกับโซนเวลา) */
const NOW_UTC = /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(0,\s*(?:10|7)\)/;
const TS_SLICE = /\b(?:now|nowIso|iso|createdAt|updatedAt|\w+At)\s*\.slice\(0,\s*(?:10|7)\)/;
const TIME_SLICE = /\.slice\(11,\s*(?:16|19)\)/;
const LOCAL_CLOCK = /new Date\(\)\s*\.get(?:Hours|Minutes)\(\)|\bd\.get(?:Hours|Minutes)\(\)/;
const CALENDAR_MATH = /Date\.UTC\(|setUTCDate\(|T00:00:00Z/;
/* ตัวแปลงกลางเองต้องไม่ถูกจับ — `businessDayKey`/`businessTimeKey` บวก offset ไทย
   ก่อนแล้วค่อยตัด ซึ่งคือวิธีที่ถูก · และคอมเมนต์ที่ *พูดถึง* รูปผิดก็ไม่ใช่โค้ดผิด */
const SANCTIONED = /BUSINESS_OFFSET_MS/;
const LINE_COMMENT = /^\s*\/\//;

const hits = new Map();
for (const file of FILES) {
  const src = readFileSync(`${ROOT}/${file}`, 'utf8');
  let count = 0;
  /* คอมเมนต์ที่ **พูดถึง** รูปผิด (เช่นคอมเมนต์ที่อธิบายว่าทำไมถึงเลิกใช้ getHours)
     ไม่ใช่โค้ดผิด — ลอกส่วนที่เป็นคอมเมนต์ออกก่อนตรวจ แทนการเดาจากตัวอักษรตัวแรก
     ⚠️ ลอกเฉพาะส่วนคอมเมนต์ ไม่ทิ้งทั้งบรรทัด — โค้ดที่อยู่ซ้ายของ // ยังต้องถูกตรวจ */
  let inBlock = false;
  const codeOnly = (raw) => {
    let out = '';
    let i = 0;
    while (i < raw.length) {
      if (inBlock) {
        const end = raw.indexOf('*/', i);
        if (end === -1) return out;
        inBlock = false; i = end + 2; continue;
      }
      const block = raw.indexOf('/*', i);
      const line = raw.indexOf('//', i);
      if (line !== -1 && (block === -1 || line < block)) return out + raw.slice(i, line);
      if (block === -1) return out + raw.slice(i);
      out += raw.slice(i, block);
      inBlock = true; i = block + 2;
    }
    return out;
  };
  src.split('\n').forEach((raw, index) => {
    const line = codeOnly(raw);
    if (!line.trim()) return;
    if (CALENDAR_MATH.test(line) || SANCTIONED.test(line)) return;
    if (!NOW_UTC.test(line) && !TS_SLICE.test(line)
        && !TIME_SLICE.test(line) && !LOCAL_CLOCK.test(line)) return;
    count += 1;
    if (!hits.has(file)) hits.set(file, []);
    hits.get(file).push(`${file}:${index + 1}  ${raw.trim().slice(0, 96)}`);
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

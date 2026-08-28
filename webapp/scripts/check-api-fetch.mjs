#!/usr/bin/env node
/* ── ด่านกัน "fetch ดิบ" ในโค้ดฝั่งเบราว์เซอร์ ────────────────────────────────
 *
 * 🐞 บั๊กจริง (2026-08-28): ผู้ใช้กด "เพิ่มงาน" ที่ /pm/tasks แล้ว toast ขึ้นคำว่า
 * `Failed to fetch` เฉย ๆ — งานทั้งใบที่พิมพ์ไว้เด้งกลับ และไม่มีแถวลงฐานข้อมูลเลย
 * สาเหตุคือคอนเนกชันสะดุดหนึ่งครั้ง แล้ว fetch โยน TypeError ดิบ ๆ ออกมา
 *
 * **กติกาของระบบนี้: โค้ดที่รันในเบราว์เซอร์เรียก API ผ่าน `apiFetch`/`apiJson`
 * (lib/apiFetch) เท่านั้น** — ตัวห่อนั้นทำสองอย่างที่ทุกหน้าต้องได้เท่ากัน:
 *   · เปลี่ยน `TypeError: Failed to fetch` เป็นข้อความไทยที่คนอ่านรู้เรื่อง
 *   · ลองใหม่ให้ 1 ครั้ง **เฉพาะ GET/HEAD** (เมธอดที่เขียนข้อมูลต้องขอ `retry: true` เอง
 *     — ดูเหตุผลเรื่องของซ้ำ/404 ที่หัวไฟล์ lib/apiFetch.js)
 *
 * ⚠️ สิ่งที่ **ไม่ผิด** และด่านนี้ต้องไม่จับ:
 *   · `fetch` ในโค้ดฝั่ง server (route handler / lib ที่ไม่ใช่ "use client") — ไม่มี
 *     ผู้ใช้รออยู่หน้าจอ และหลายเส้นยิงออกไปนอกระบบพร้อมกติกา timeout ของตัวเอง
 *   · การยิงไป URL เต็ม (https://…) เช่นอัปไบต์ขึ้น Drive ตรงจากเบราว์เซอร์
 *   · ตัว lib/apiFetch.js เอง ซึ่งเป็นคนเรียก fetch จริง
 *
 * รัน: npm run check:apifetch
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SELF = 'src/lib/apiFetch.js';

// อ่าน arg list ของ fetch( แบบนับวงเล็บให้สมดุล — init ที่เขียนคร่อมหลายบรรทัดจึงไม่หลุด
function argsOf(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) { depth--; if (!depth) return src.slice(open + 1, i); }
  }
  return '';
}

// -i เพราะไฟล์ที่ย้ายมาใช้ตัวห่อแล้วมีแต่คำว่า `apiFetch(` (ตัว F ใหญ่) — ถ้า grep
// แบบตรงตัวพิมพ์ ด่านจะเห็นไฟล์แค่หยิบมือแล้วผ่านทั้งที่ไม่ได้ตรวจอะไรเลย
const files = execSync('grep -rli "fetch(" src --include="*.js"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter((f) => !f.startsWith('src/app/api/') && f !== SELF);

const offenders = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // ไฟล์ฝั่งเบราว์เซอร์ = คอมโพเนนต์/หน้าที่ประกาศ "use client" (lib ที่ถูก import
  // เข้าไปในนั้นถูกจับผ่านไฟล์ที่ประกาศเองว่าเป็น client เช่นกัน)
  if (!/["']use client["']/.test(src)) continue;
  const re = /(^|[^.\w])fetch\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const args = argsOf(src, open);
    if (/https?:\/\//.test(args.slice(0, 80))) continue;
    offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
  }
}

if (offenders.length) {
  console.error(
    'check:apifetch ตก — โค้ดฝั่งเบราว์เซอร์ยังเรียก fetch ดิบ ให้เปลี่ยนเป็น apiFetch/apiJson (@/lib/apiFetch):\n  '
    + offenders.join('\n  '),
  );
  process.exit(1);
}
console.log(`check:apifetch ผ่าน — ตรวจ ${files.length} ไฟล์ · ไม่มี fetch ดิบในโค้ดฝั่งเบราว์เซอร์`);

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { BUSINESS_TIME_ZONE, businessDate, businessMonthKey } from './businessDate.js';

// ── "วันนี้" ต้องมาจากที่เดียว ──────────────────────────────────────────
//
// 🐞 ตรวจ 2026-08-09 พบว่าระบบมี "วันนี้" **4 สำนวน** ที่ให้คำตอบไม่ตรงกัน:
//   · `new Date().toISOString().slice(0, 10)`  24 จุด → **วัน UTC** ⇒ เวลาไทย
//     00:00–07:00 น. ได้เมื่อวาน
//   · `toLocalISODate(new Date())`             → ถูกบนเบราว์เซอร์ แต่ **ผิดบน
//     เซิร์ฟเวอร์** ซึ่งรันที่ UTC (โค้ดเบสยืนยันเองที่ lib/sales/handoffQueue.js)
//   · `new Date().toLocaleDateString('en-CA')` → ขึ้นกับ locale ของเครื่อง
//   · `businessDate()`                         → ✅ ผูก Asia/Bangkok ตายตัว
//
// ฝั่งเซิร์ฟเวอร์หนักที่สุดเพราะผู้ใช้แก้ค่าบนจอไม่ได้ และ **ผิดทั้งวัน** ไม่ใช่แค่
// เช้ามืด — จุดที่โดนคือ KPI งานเลยกำหนด · ราคาที่ยังไม่หมดอายุ · คิวผลิต/บริการ
//
// ทีมเคยแก้เป็นราย ๆ มาสองรอบแล้ว (sa/calendar และ lib/service/sites เขียนคอมเมนต์
// เตือนไว้ตรงจุด) แต่ไม่เคยรวมศูนย์ ⇒ เทสต์ชุดนี้ทำให้ "แก้แล้วไหลกลับ" เป็นไปไม่ได้

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

const BANNED = [
  {
    re: /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/,
    why: 'คืนวัน **UTC** — เวลาไทยตี 0 ถึง 7 โมงเช้าจะได้เมื่อวาน',
  },
  {
    re: /toLocalISODate\(new Date\(\)\)/,
    why: 'อิงโซนของเครื่องที่รัน — ถูกบนเบราว์เซอร์ไทย แต่ผิดบนเซิร์ฟเวอร์ที่รันที่ UTC',
  },
  {
    re: /new Date\(\)\.toLocaleDateString\(/,
    why: 'อิง locale ของเครื่อง — เครื่องคนละภาษาได้คนละรูปและคนละวัน',
  },
];

test('⭐ ไม่มีใครคิด "วันนี้" เองอีก — ต้องผ่าน businessDate() ที่เดียว', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    // ⚠️ ตัดคอมเมนต์ก่อนเสมอ — คอมเมนต์ที่ **เตือนห้ามใช้** ท่าเหล่านี้ต้องเขียน
    //    ชื่อท่าลงไปตรง ๆ ได้ ไม่งั้นเอกสารในโค้ดจะทำให้เทสต์ของตัวเองแดง
    //    (เจอจริงตอนเขียนคำเตือนใน lib/pm/dateHelpers.js)
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ''));
    for (const rule of BANNED) {
      source.forEach((line, index) => {
        if (rule.re.test(line)) {
          offenders.push(`${path.relative(SRC, file)}:${index + 1} — ${rule.why}`);
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `พบการคิด "วันนี้" เองนอก businessDate():\n${offenders.join('\n')}\n`
      + 'ใช้ `import { businessDate } from "@/lib/businessDate"` แล้วเรียก businessDate() แทน',
  );
});

test('businessDate ผูกกับเวลาไทย ไม่ใช่โซนของเครื่องที่รัน', () => {
  assert.equal(BUSINESS_TIME_ZONE, 'Asia/Bangkok');
  // 2026-08-09 17:30 UTC = 2026-08-10 00:30 เวลาไทย ⇒ ต้องได้ "วันพรุ่งนี้" ฝั่ง UTC
  const lateUtc = new Date('2026-08-09T17:30:00.000Z');
  assert.equal(businessDate(lateUtc), '2026-08-10');
  assert.equal(lateUtc.toISOString().slice(0, 10), '2026-08-09'); // ของเดิมจะได้ค่านี้ = ผิด
  // 2026-08-09 16:59 UTC = 23:59 เวลาไทยของวันเดิม
  assert.equal(businessDate(new Date('2026-08-09T16:59:00.000Z')), '2026-08-09');
});

test('businessMonthKey ใช้เดือนตามเวลาไทยเช่นกัน (YYMM)', () => {
  // 2026-07-31 17:00 UTC = 2026-08-01 เวลาไทย ⇒ ต้องข้ามเดือนไปแล้ว
  assert.equal(businessMonthKey(new Date('2026-07-31T17:00:00.000Z')), '2608');
  assert.equal(businessMonthKey(new Date('2026-07-31T16:00:00.000Z')), '2607');
});

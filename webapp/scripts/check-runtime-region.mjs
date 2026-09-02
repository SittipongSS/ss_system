#!/usr/bin/env node
/* ── ด่านกัน "ฟังก์ชันย้ายไปรันอีกทวีปเงียบ ๆ" ──────────────────────────────────
 *
 * ฐานข้อมูล Supabase ของระบบนี้อยู่ที่ **สิงคโปร์ (ap-southeast-1)** และทุกหน้าจอ
 * อ่านเขียนผ่าน API route ฝั่ง server ⇒ ระยะทางระหว่างฟังก์ชันกับฐานข้อมูลคือ
 * ค่าหน่วงของทั้งเว็บ ไม่ใช่แค่ของ query เดียว
 *
 * `regions: ["sin1"]` ใน `webapp/vercel.json` เป็น **ตัวเดียว** ที่ตรึงไว้ได้:
 *
 * 🪤 หน้า Vercel → Settings → Functions → Function Regions ตั้งเป็น `iad1`
 *    (เวอร์จิเนีย) อยู่ และในตัวเลือก Asia Pacific ของหน้านั้น **ไม่มี sin1 ให้เลือก
 *    เลย** มีแค่ hkg1 กับ hnd1 ⇒ แก้จาก dashboard ไม่ได้ ต้องมาจากไฟล์นี้เท่านั้น
 *    ป้าย "Overridden" บนหน้านั้นคือร่องรอยว่า vercel.json กำลังทับค่าอยู่
 *
 * ⇒ วันไหนมีคนลบบรรทัดนี้ทิ้ง ฟังก์ชันทั้งระบบย้ายไป `iad1` ทันทีโดย build ยังเขียว
 *   ไม่มี error ไม่มี warning มีแค่ทุกหน้าช้าลงข้ามมหาสมุทรแปซิฟิก
 *
 * ตรวจของจริงบน production ได้ด้วย (ท่อนที่ **สอง** คือ region ของฟังก์ชัน):
 *   curl -sI https://ss-team.vercel.app/api/version | grep x-vercel-id
 *   → x-vercel-id: sin1::sin1::…   ✅
 *
 * รัน: npm run check:region
 */
import { readFileSync } from 'node:fs';

const EXPECTED = 'sin1';
const FILE = 'vercel.json';

let config;
try {
  config = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (error) {
  console.error(`✗ อ่าน ${FILE} ไม่ได้: ${error.message}`);
  process.exit(1);
}

const regions = config.regions;

if (!Array.isArray(regions) || regions.length === 0) {
  console.error(
    `✗ ${FILE} ไม่มี "regions" — ฟังก์ชันจะไปรันตามค่าใน Vercel dashboard ซึ่งคือ iad1 (เวอร์จิเนีย)\n` +
    `  ฐานข้อมูลอยู่สิงคโปร์ ⇒ ทุก query ข้ามแปซิฟิก · ใส่กลับเป็น "regions": ["${EXPECTED}"]`
  );
  process.exit(1);
}

if (regions.length !== 1 || regions[0] !== EXPECTED) {
  console.error(
    `✗ ${FILE} → regions = ${JSON.stringify(regions)} แต่ต้องเป็น ["${EXPECTED}"]\n` +
    `  ฐานข้อมูล Supabase อยู่ ap-southeast-1 (สิงคโปร์) · region อื่นเพิ่มค่าหน่วงทุก request\n` +
    `  ถ้าตั้งใจย้ายจริง แก้ค่า EXPECTED ในสคริปต์นี้พร้อมกันในคอมมิตเดียว จะได้เห็นในรีวิว`
  );
  process.exit(1);
}

console.log(`Runtime region OK: ${FILE} → regions = ["${EXPECTED}"]`);

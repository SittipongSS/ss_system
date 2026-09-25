import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

// @babel/traverse เป็น CJS — ใต้ ESM ตัวฟังก์ชันอยู่ที่ .default
const traverse = traverseModule.default ?? traverseModule;

/* ── จอที่อ่านลิสต์ผ่าน `useApiList` ต้องทำให้ "โหลดไม่สำเร็จ" มองเห็นได้ ──────────
 *
 * 🐞 อาการจริงที่ด่านนี้กันไว้ (26 วัน): `ORDER_SELECT_SLIM` เลือกคอลัมน์ที่ไม่มีอยู่จริง
 * (`orders.updatedAt`) ⇒ `/api/orders?slim=1` ตอบ 500 · `useApiList` จับ error ไว้ใน
 * `error` เรียบร้อยแล้ว **แต่หน้า /tax แกะมาแค่ `{ data, loading }`** ⇒ `data` ค้างที่
 * ค่าตั้งต้น `[]` แล้วจอโชว์ "ยังไม่มีใบยื่นชำระภาษีในระบบ" + คิวงาน "0 งาน · ไม่มีงานค้าง 🎉"
 * ทุกวัน — อ่านได้ว่างานหมดแล้ว ไม่ใช่ระบบพัง จึงไม่มีใครแจ้งเลยตลอดเดือน
 *
 * ⭐ **กติกาสามข้อที่ด่านนี้ล็อกไว้**
 *   1. โหลดพังต้องขึ้น `StatusNotice tone="error"` พร้อมทางกลับ ("ลองใหม่")
 *   2. **ขึ้นป้าย** ตัดสินด้วย `error` เดี่ยว ๆ · **ซ่อน/บล็อกเนื้อ** ตัดสินด้วย error
 *      คู่กับความว่าง — คนละคำถาม ห้ามยุบเป็นตัวเดียว (ดูเหตุผลที่เทสต์ข้อนั้น)
 *   3. ว่างเพราะไม่มีแถว ต้องยังอ่านว่าว่าง — และตรงข้าม: พังแล้ว **ห้าม** มีตัวเลข 0
 *      หรือข้อความ "ยังไม่มี…" อยู่ข้างข้อความ error (0 ที่มาจากความไม่รู้คือคำตอบผิด)
 *
 * ⚠️ **ลิสต์นี้เพิ่มได้อย่างเดียว** — จอที่หลุดออกไปแปลว่ามีคนถอดการแจ้ง error ทิ้ง
 * ⚠️ ตรวจจากตัวหนังสือในซอร์ส เพราะโปรเจกต์นี้ไม่มี test runner ฝั่ง React
 *    (กติกาเดียวกับ revalidateWiring.test.mjs / staleScreenRefresh.test.mjs)
 *    ⇒ เขียน regex ให้จับ **เจตนา** ไม่ใช่การจัดบรรทัด: ด่านที่แดงเพราะจัดโค้ดใหม่
 *    โดยพฤติกรรมไม่เปลี่ยน คือด่านที่จะโดนลบทิ้งในอีกสามเดือน
 */
const SCREENS = [
  // ศูนย์บัญชาการภาษีสรรพสามิต — จอที่เงียบไป 26 วัน
  "app/tax/page.js",
  // สหมิตร: แดชบอร์ดรวม + ฟอร์มลงรอบ/แก้รอบ FC (ฟอร์มตัวเดียวกันสองทางเข้า)
  "app/sahamit/page.js",
  "app/sahamit/forecast/new/page.js",
  "app/sahamit/forecast/[id]/edit/page.js",
  /* ภาพรวมฐานข้อมูล — ทิ้ง error ทั้งสองสายอยู่หลัง #1796 โดยด่านนี้เขียวตลอด เพราะตัวสแกนความครบ
     เดิมจับเฉพาะไฟล์ที่ **แกะ** error แล้วลืมเข้าทะเบียน (ดูตัวสแกนรายการเรียกท้ายไฟล์) */
  "app/database/page.js",
  /* หน้ารายละเอียดที่หาใบของตัวเองด้วย `list.find(...)` — ลิสต์ล้มแล้วจอเคยตอบ "ไม่พบ…" (อ่านว่าถูกลบ)
     ทรงเดียวกับ "ไม่พบรอบ FC นี้" ที่ #1796 แก้ · เคยอยู่บัญชีหนี้ KNOWN_SILENT (7 รายการเรียก) */
  "app/tax/filings/[id]/page.js",
  "app/sahamit/po/[id]/edit/page.js",
  /* ✅ 25/09 ("ทำอีก 18 จุดต่อ") — 18 รายการเรียกสุดท้ายในบัญชีหนี้ KNOWN_SILENT: ลิสต์รองที่ป้อนมูลค่า/ล็อก/สถานะ
     (ล้มแล้วค่าเพี้ยนเงียบ) และลิสต์ของ picker (ล้มแล้ว "ตัวเลือกว่าง") · ทุกจอข้างล่างได้ก้อน sources ครบทุกสาย
     (ลิสต์หลักด้วย) ⇒ กติการายไฟล์ของทะเบียนนี้ใช้ได้ทั้งหมด · มติรายสายอยู่ที่คอมเมนต์ก้อน sources ของแต่ละจอ
     และเทสต์รายจอท้ายส่วน DETAIL_PAGES */
  "app/sahamit/po/page.js",
  "app/sahamit/po/new/page.js",
  "app/sahamit/po/[id]/page.js",
  "app/sahamit/reconcile/page.js",
  "app/sahamit/material/page.js",
  "app/sahamit/forecast/page.js",
  /* สองหน้ารายการภาษีเคยอยู่ทะเบียนแยก (ALREADY_REPORTING) เพราะ picker ของตัวกรอง (`customersReady ? url : null` /
     `pickerReady ? url : null`) ยังเงียบ — ตอนนี้ picker รับความล้มครบแล้ว จึงย้ายเข้ากติกาเต็มชุด แล้วลบทะเบียนแยกทิ้ง
     ⚠️ อย่าสร้างทะเบียนผ่อนปรนขึ้นใหม่ — จอใหม่ที่ยังทำไม่ครบคือจอที่ยังไม่เสร็จ ไม่ใช่จอที่ได้กติกาอ่อนกว่า */
  "app/tax/filings/page.js",
  "app/tax/registrations/page.js",
  "app/tax/registrations/[id]/page.js",
];

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");
/* คอมเมนต์ไทยในไฟล์เหล่านี้พูดถึงชื่อตัวแปรตรง ๆ ⇒ ถ้าไม่ตัดออกก่อน คอมเมนต์จะ
   "สอบผ่าน" แทนโค้ดจริงได้ (และคอมเมนต์ที่ถูกลบจะทำให้ด่านแดงทั้งที่โค้ดไม่ขยับ) */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
/* ก้อน `const sources = [...]` ของจอนั้น — กติกาข้างล่างหลายข้อพูดถึง "ทุกแหล่งในจอ"
   ไม่ใช่ข้อความไหนก็ได้ในไฟล์ ⇒ ต้องจำกัดขอบเขตก่อนตรวจ */
const sourcesBlock = (rel) => {
  const text = code(rel);
  const start = text.indexOf("const sources = [");
  const end = text.indexOf("\n  ];", start);
  assert.ok(start !== -1 && end !== -1, `${rel}: ไม่พบก้อน sources — ทุกจอในทะเบียนต้องประกาศแหล่งข้อมูลเป็นลิสต์เดียวกัน`);
  return text.slice(start, end);
};

/* ทุกการเรียกในจอเหล่านี้ต้องแกะ `error` ออกมาทุกตัว ไม่ใช่แค่ตัวแรก — รวมลิสต์ของ picker ที่โหลดตอนกางตัวกรอง/เปิดโมดัล
   (`pickerReady ? url : null`) ด้วย: ล้มแล้ว "ตัวเลือกว่าง" อ่านว่าไม่มีลูกค้า/สินค้าให้เลือก = ทรงเงียบตัวเดียวกัน (ปิดครบ 25/09) */
test("ทุก useApiList ในจอทะเบียนต้องแกะ error ออกมา", () => {
  for (const rel of SCREENS) {
    const text = code(rel);
    const calls = [...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*useApiList\(/g)];
    assert.ok(calls.length > 0, `${rel}: ไม่พบการเรียก useApiList เลย — ลิสต์ทะเบียนล้าสมัย?`);
    for (const [, bindings] of calls) {
      assert.match(bindings, /\berror\b/, `${rel}: ยังมี useApiList ที่แกะแค่ { ${bindings.trim()} } ⇒ โหลดพังจะเงียบ`);
    }
  }
});

test("โหลดพังต้องขึ้น StatusNotice โทน error พร้อมปุ่มลองใหม่", () => {
  for (const rel of SCREENS) {
    const text = read(rel);
    assert.match(text, /import StatusNotice from "@\/components\/ui\/StatusNotice"/,
      `${rel}: ไม่ได้ import StatusNotice (กล่องแจ้งกลางของระบบ — ห้ามประกอบกล่องเอง)`);
    assert.match(text, /<StatusNotice[\s\S]{0,400}?tone="error"/,
      `${rel}: ไม่มี StatusNotice โทน error`);
    assert.match(text, /ลองใหม่/, `${rel}: แจ้ง error แล้วไม่มีทางกลับ — ต้องมีปุ่ม "ลองใหม่" ที่เรียก reload`);
    assert.match(text, /reload/, `${rel}: ปุ่มลองใหม่ต้องผูกกับ reload ของ useApiList`);
  }
});

/* ── ข้อ 2: ป้าย = `error` เดี่ยว · ซ่อน/บล็อก = error คู่กับความว่าง ────────────────
 * 🪤 `apiCache` อยู่ระดับโมดูล อายุเท่าแท็บ (lib/apiCache.js) และ `reload()` ตอน mount
 * ไม่ใช่รอบเบื้องหลัง ⇒ เดินออกจากหน้าแล้วกดกลับเข้ามา จอวาดของเก่าจากแคชได้ครบ
 * แล้วรอบใหม่ค่อยล้ม · ถ้าเอา "ว่างด้วย" มาเป็นเงื่อนไขของ **ป้าย** ป้ายจะเงียบสนิท
 * ทั้งที่ตัวเลขบนจอเป็นของเมื่อวาน = บั๊กตัวเดิมที่งานนี้ตั้งใจฆ่า กลับมาทางประตูหลัง
 * ⇒ ทุกจอในทะเบียนต้องใช้สำนวนเดียวกันเป๊ะ เพื่อให้ "พัง" มีนิยามเดียวทั้งชุด */
test("ทุกจอในทะเบียนต้องแยก 'ขึ้นป้าย' (error เดี่ยว) ออกจาก 'ซ่อนเนื้อ' (error + ว่าง)", () => {
  for (const rel of SCREENS) {
    const text = code(rel);
    assert.match(text, /const failing = sources\.filter\(\s*\(s\)\s*=>\s*s\.error\s*\)/,
      `${rel}: ป้ายต้องขึ้นเมื่อมี error เท่านั้น — ถ้าพ่วงความว่างเข้าไปด้วย แคชอุ่น ๆ จะกลบความพังอีกครั้ง`);
    assert.match(text, /const blocked = failing\.filter\(\s*\(s\)\s*=>\s*s\.empty\s*\)/,
      `${rel}: การซ่อน/บล็อกต้องมาจาก error คู่กับความว่าง — มีของในมือก็ให้ทำงานต่อได้`);
    assert.match(text, /loadError\s*=\s*failing\.length/,
      `${rel}: ข้อความบนป้ายต้องมาจาก failing (ทุกก้อนที่ล้ม) ไม่ใช่ก้อนที่ถูกบล็อกอย่างเดียว`);
    // 🪤 สองสายล้มพร้อมกันมักคนละเหตุ — ตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
    assert.match(text, /new Set\(failing\.map\(\s*\(s\)\s*=>\s*s\.error\s*\)\)/,
      `${rel}: ต้องพ่วงข้อความ error ทุกก้อน ไม่ใช่ failing[0] — สาเหตุจริงมักอยู่ก้อนหลัง`);
  }
});

/* ── ข้อ 3: พังแล้วห้ามโชว์ 0 / "ยังไม่มี…" คู่กับข้อความ error ──────────────────
 * ตรงนี้ตรวจรายจอ เพราะ "ตัวเลขที่โกหก" ของแต่ละจอคนละชิ้นกัน */

test("/tax: ว่างจริงกับโหลดพังต้องคนละข้อความ และคิวงานต้องไม่บอกว่าเคลียร์หมดแล้ว", () => {
  const text = code("app/tax/page.js");
  // 🐞 หน้าตาเดิมตอน API ตอบ 500: EmptyState "ยังไม่มีใบยื่นชำระภาษีในระบบ"
  assert.match(text, /const noFilingsAtAll = [^;]*!ordersFailed/,
    "สถานะ 'ยังไม่มีใบยื่นในระบบ' ต้องตัดกรณีโหลดพังออกก่อน");
  assert.match(text, /<WorkQueue[\s\S]{0,200}?incomplete=\{[^}]*Failed/,
    "คิวงานผสมสองแหล่ง — ต้องบอก WorkQueue ว่าข้อมูลไม่ครบ ไม่งั้นได้ '0 งาน · ไม่มีงานค้าง 🎉'");
  /* การ์ด KPI ทั้งสองสายต้องหายไปพร้อมกับแหล่งที่พัง ไม่ใช่ขึ้นเลข 0 ข้างข้อความ error
     — แต่ห้ามหายจนเหลือหัวข้อลอยเหนือที่ว่าง ซึ่งอ่านเป็น "จอเรนเดอร์ไม่ครบ" ⇒ ทั้งสองสาย
     ต้องมีบรรทัดแทนที่ ไม่ใช่ `null` เปล่า ๆ */
  for (const flag of ["regsFailed", "ordersFailed"]) {
    assert.match(text, new RegExp(`\\{${flag}\\s*\\?[\\s\\S]{0,300}?ยังแสดงไม่ได้`),
      `${flag}: ต้องซ่อนตัวเลขของสายที่พัง และวางบรรทัดแทน ไม่ปล่อยให้เหลือหัวข้อลอย`);
  }
});

test("WorkQueue: ข้อมูลไม่ครบ ต้องไม่อ้างยอดเต็ม แต่ก็ไม่ขีดทับแถวที่เห็นอยู่", () => {
  const text = code("components/excise/WorkQueue.js");
  assert.match(text, /incomplete/, "WorkQueue ต้องรู้ว่าแหล่งข้อมูลของคิวไม่ครบ");
  assert.match(text, /items\.length\s*\?[\s\S]{0,120}?อย่างน้อย/,
    "คิวที่ยังมีแถวโชว์อยู่ ต้องบอก 'อย่างน้อย n งาน' — ขีดทับแถวที่ตาเห็นอ่านเป็นป้ายเสีย");
  assert.match(text, /:\s*null/,
    "ไม่มีแถวและข้อมูลไม่ครบ = ขีด (ListPanel แปลง null เป็น —) ไม่ใช่ '0 งาน'");
  assert.match(text, /incomplete \?[\s\S]{0,200}?คิวงานยังไม่ครบ/,
    "ช่องว่างตอนคิวไม่ครบ ต้องไม่ใช่ข้อความยินดีว่าไม่มีงานค้าง");
});

test("/sahamit: ตัวเลขฟิวส์กันทั้งจอ ⇒ ไม่มีของในมือเลยต้องซ่อนทั้งก้อน", () => {
  const text = code("app/sahamit/page.js");
  assert.match(text, /\{blocked\.length \? \([\s\S]{0,200}?ยังแสดงไม่ได้[\s\S]{0,200}?\) : \(<>/,
    "KPI / ป้ายสถานะ / กราฟ / แท็บ ต้องหายไปพร้อมกัน ไม่ใช่ขึ้น 0 และ 0.00% ข้างข้อความ error — แต่ต้องมีบรรทัดแทนที่ ไม่ใช่แถบแจ้งลอยเหนือที่ว่างครึ่งจอ");
});

test("แก้รอบ FC: โหลดลิสต์ไม่ขึ้น ห้ามตอบว่า 'ไม่พบรอบ FC นี้'", () => {
  const text = code("app/sahamit/forecast/[id]/edit/page.js");
  const errorBranch = text.search(/if \(blocked\.length\) return shell\(/);
  const notFound = text.indexOf("ไม่พบรอบ FC นี้");
  assert.ok(errorBranch !== -1, "ต้องคืนค่าทันทีเมื่อไม่มีของในมือ — ป้ายอย่างเดียวไม่พอ ฟอร์มยังเปิดต่อได้");
  assert.ok(errorBranch < notFound,
    "ต้องตัดสินก่อน — `rounds` ที่โหลดไม่ขึ้นทำให้ round เป็น null แล้วจอโกหกว่ารอบถูกลบ");
  /* 🪤 "มีของในมือ" ของหน้านี้คือ **รอบใบนี้** ไม่ใช่ `rounds.length` — แคชเก่าที่ถ่ายไว้
     ก่อนมีรอบใหม่ จะมีรอบอื่นเต็มลิสต์แต่ไม่มีใบที่เปิดอยู่ แล้วหลุดไป "ไม่พบรอบ FC นี้" */
  assert.match(text, /error: roundsError[^,]*,\s*empty: !round\b/,
    "ต้องวัดด้วยรอบใบนี้ ไม่ใช่ความยาวลิสต์ — แคชเก่าที่ยังไม่มีรอบนี้ก็คือ 'ไม่มีของในมือ'");
});

test("ลงรอบ FC ใหม่: ลิสต์ไม่ครบ ต้องไม่ปล่อยให้กรอกแล้วบันทึก", () => {
  const text = code("app/sahamit/forecast/new/page.js");
  const errorBranch = text.search(/if \(blocked\.length\) return shell\(/);
  const form = text.indexOf("<ForecastForm", errorBranch === -1 ? 0 : errorBranch);
  assert.ok(errorBranch !== -1,
    "ต้อง `return` ออกไปเลย — ป้ายที่ลอยอยู่เหนือฟอร์มยังปล่อยให้กรอกแล้วกดบันทึกได้");
  assert.ok(errorBranch < form,
    "ฟอร์มต้องอยู่หลังทางแยก — ฟอร์มที่ขาดสินค้า/รอบเดิม บันทึกได้แต่ได้ข้อมูลผิดเงียบ ๆ");
});

/* นับ `<tag …>` (หรือข้อความ JSX ที่มี `text` · หรือการเรียก `call(…)` ตรงชื่อ) ในไฟล์ และตัวที่ **ไม่มีทางแยก `guard` คุ้มอยู่** — คุ้มได้สองทรง:
     (1) อยู่ในกิ่ง else (`alternate`) ของ `guard ? … : …` — ไล่ขึ้นทุกชั้น ⇒ ทางแยกซ้อน (`พัง ? … : ว่าง ? … : กราฟ`) ผ่าน
     (2) อยู่หลัง `if (guard) return …;` ในฟังก์ชันเดียวกัน (บล็อกเดียวกันหรือบล็อกที่ครอบอยู่) — ทรงของหน้ารายละเอียด
         ที่ `return` ป้ายออกไปก่อนถึงบรรทัด "ไม่พบ…"
   🐞 ทำไมไม่เทียบตำแหน่งตัวอักษร (`indexOf(ทางแยก) < indexOf("ไม่พบ…")`): ทางแยกที่ **ไม่ return** (แค่วาดป้าย) ก็อยู่
      ก่อนได้ แล้วจอยังไหลลงไปตอบ "ไม่พบ…" ต่อ · ทางแยกที่ return อยู่ในฟังก์ชันอื่น (`const shell = …`) ก็อยู่ก่อนได้
      ⇒ ถามโครงสร้างว่า **ถึงบรรทัดนั้นได้ก็ต่อเมื่อ guard เป็นเท็จ** · หยุดที่ขอบฟังก์ชัน: `if` ของฟังก์ชันอื่นคุ้มใครไม่ได้
   · `branch = "consequent"` = ถามกลับด้าน: **ถึงได้ก็ต่อเมื่อ guard เป็นจริง** (กิ่ง then ของ `guard ? … : …` เท่านั้น — early return
     คุ้มกิ่งนี้ไม่ได้) · ใช้กับคำเตือนที่จริงได้แค่ตอนมีของในมือ เช่น "n SKU ไม่มีราคา" ต้องอยู่ใต้ `productsLoaded ? … :`
     🐞 assertGates ตอบคำถามนี้ไม่ได้: `(!productsLoaded || unpriced) && "(มูลค่า = 0)"` อ่าน productsLoaded ก็จริง แต่กลับด้าน
   · `match.literal` = สตริงลิเทอรัล/ท่อนของ template (คำเตือนที่ประกอบใน template ไม่ใช่ JSXText) */
const guardedIn = (source, match, guard, branch = "alternate") => {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const textOf = (node) => source.slice(node.start, node.end).replace(/\s+/g, " ");
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(path) {
      if (match.tag && path.node.name.type === "JSXIdentifier" && path.node.name.name === match.tag) hits.push(path);
    },
    JSXText(path) {
      if (match.text && path.node.value.includes(match.text)) hits.push(path);
    },
    /* ⭐ ของที่ "พูดเป็นคำตอบ" บางชิ้นเป็นฟังก์ชัน ไม่ใช่แท็ก/ข้อความ (`matCell(…)` ของ PO วาดขีด = "ยังไม่มีกำหนด")
       ⇒ ตรวจที่จุดเรียก ไม่ใช่ที่ prop ของผู้เรียก — ส่ง prop ถูกแต่ตัวแถวไม่อ่านมัน ก็คือขีดเดิม */
    CallExpression(path) {
      if (match.call && path.get("callee").isIdentifier({ name: match.call })) hits.push(path);
    },
    StringLiteral(path) { if (match.literal && path.node.value.includes(match.literal)) hits.push(path); },
    TemplateElement(path) { if (match.literal && path.node.value.cooked.includes(match.literal)) hits.push(path); },
  });
  // `find` (นับตัวเองด้วย) ไม่ใช่ `findParent` — จุดเรียกที่ **เป็น** กิ่งนั้นเอง (`u ? U : cell()`) ไม่มีพ่อที่เป็นกิ่งนั้น
  const inBranch = (path) => !!path.find((p) => p.key === branch
    && p.parentPath?.isConditionalExpression() && textOf(p.parentPath.node.test) === guard);
  // ออกจากฟังก์ชันแน่ ๆ — `return …;` เดี่ยว หรือบล็อกที่คำสั่งสุดท้ายคือ return
  const exits = (node) => node.type === "ReturnStatement"
    || (node.type === "BlockStatement" && node.body.at(-1)?.type === "ReturnStatement");
  const afterEarlyReturn = (path) => {
    for (let p = path; p && !p.isFunction(); p = p.parentPath) {
      if (p.inList && typeof p.key === "number" && p.container.slice(0, p.key).some((stmt) =>
        stmt.type === "IfStatement" && textOf(stmt.test) === guard && exits(stmt.consequent))) return true;
    }
    return false;
  };
  const unguarded = hits.filter((path) => !inBranch(path) && !(branch === "alternate" && afterEarlyReturn(path)));
  return { hits: hits.length, unguarded: unguarded.length };
};
const guardedBy = (rel, match, guard, branch) => guardedIn(read(rel), match, guard, branch);

/* ทางแยก **ทุกชั้น** ที่ต้องผ่านก่อนถึงของชิ้นหนึ่ง ⇒ ชื่อตัวแปรที่ทางแยกเหล่านั้นอ่าน (หนึ่ง Set ต่อหนึ่งชิ้นที่เจอ)
   นับทั้ง `test ? … : …` (ทั้งสองกิ่ง) · `test && …` / `test || …` (ฝั่งขวา) · `if (test)` ที่ครอบ · และ `if (test) return …;`
   ที่อยู่ก่อนหน้าในบล็อกเดียวกันหรือบล็อกที่ครอบ (ทรงหน้ารายละเอียด)
   ⭐ ใช้ตอบคำถามที่ guardedIn ตอบไม่ได้: "ตารางหลัก **ไม่** ถูกซ่อนด้วยธงของสายรอง" — ทุกทรงที่เอาธงไปคุมตาราง
      (`flag ? null : <ตาราง/>` · `!flag && <ตาราง/>` · `if (flag) return …`) ทำให้ชื่อธงโผล่ใน Set
   · `match.literal` = สตริงลิเทอรัล/ท่อนของ template (เช่นตัวเลือก `"— ไม่มี AE —"` ที่อยู่ในนิพจน์ ไม่ใช่ JSXText) */
const gatesIn = (source, match) => {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(path) {
      if (match.tag && path.node.name.type === "JSXIdentifier" && path.node.name.name === match.tag) hits.push(path);
    },
    JSXText(path) { if (match.text && path.node.value.includes(match.text)) hits.push(path); },
    StringLiteral(path) { if (match.literal && path.node.value.includes(match.literal)) hits.push(path); },
    TemplateElement(path) { if (match.literal && path.node.value.cooked.includes(match.literal)) hits.push(path); },
  });
  const namesIn = (p, into) => {
    const visit = (q) => { if (q.isReferencedIdentifier()) into.add(q.node.name); };
    if (p.isIdentifier()) visit(p);
    p.traverse({ Identifier: visit });
  };
  const exits = (node) => node.type === "ReturnStatement"
    || (node.type === "BlockStatement" && node.body.at(-1)?.type === "ReturnStatement");
  return hits.map((hit) => {
    const names = new Set();
    for (let p = hit; p.parentPath; p = p.parentPath) {
      const parent = p.parentPath;
      if (parent.isConditionalExpression() && p.key !== "test") namesIn(parent.get("test"), names);
      if (parent.isLogicalExpression() && p.key === "right") namesIn(parent.get("left"), names);
      if (parent.isIfStatement() && p.key !== "test") namesIn(parent.get("test"), names);
      if (p.inList && typeof p.key === "number") {
        for (let i = 0; i < p.key; i += 1) {
          const stmt = p.getSibling(i);
          if (stmt.isIfStatement() && exits(stmt.node.consequent)) namesIn(stmt.get("test"), names);
        }
      }
    }
    return names;
  });
};
const gatesBy = (rel, match) => gatesIn(read(rel), match);

test("ตัวตรวจทางแยก (guardedIn) เห็นทั้งสองทรง — และไม่นับทางแยกที่ไม่ได้กันจริง", () => {
  const notFound = { text: "ไม่พบ" };
  const g = (s) => guardedIn(s, notFound, "blocked.length");
  // ทรง early return — ต้องอยู่ **ก่อน** และต้อง **return** จริง
  assert.deepEqual(g("function P() {\n  if (blocked.length) return <N />;\n  if (!po) return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 0 });
  assert.deepEqual(g("function P() {\n  if (blocked.length) { log(); return <N />; }\n  return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 0 });
  assert.deepEqual(g("function P() {\n  if (!po) return <div>ไม่พบ</div>;\n  if (blocked.length) return <N />;\n}"), { hits: 1, unguarded: 1 },
    "ทางแยกที่อยู่หลังบรรทัด 'ไม่พบ' = จอตอบ 'ไม่พบ' ไปก่อนแล้ว");
  assert.deepEqual(g("function P() {\n  if (blocked.length) warn();\n  return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 1 },
    "ทางแยกที่ไม่ return (แค่วาดป้าย) ไม่ได้กันบรรทัดข้างล่าง — ตัวเทียบตำแหน่งตัวอักษรเคยผ่านทรงนี้");
  assert.deepEqual(g("function P() {\n  if (blocked.length) { log(); }\n  return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 1 });
  assert.deepEqual(g("function P() {\n  if (!blocked.length) return <N />;\n  return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 1 }, "guard คนละตัว");
  assert.deepEqual(g("const shell = () => { if (blocked.length) return null; };\nfunction P() {\n  return <div>ไม่พบ</div>;\n}"), { hits: 1, unguarded: 1 },
    "`if` ในฟังก์ชันอื่นคุ้มใครไม่ได้");
  // ทรงเดิม (กิ่ง else ของ ternary) ยังทำงานเท่าเดิม
  assert.deepEqual(g("const x = blocked.length ? <N /> : <div>ไม่พบ</div>;"), { hits: 1, unguarded: 0 });
  assert.deepEqual(g("const x = blocked.length ? <div>ไม่พบ</div> : <N />;"), { hits: 1, unguarded: 1 });
  // จุดเรียกฟังก์ชันที่วาดคำตอบ — ต้องอยู่กิ่ง else ของทางแยกทุกจุด ตัวประกาศฟังก์ชันไม่นับ
  const c = (s) => guardedIn(s, { call: "cell" }, "unknown");
  assert.deepEqual(c("function cell() {}\nconst x = <td>{unknown ? U : cell(1)}</td>;"), { hits: 1, unguarded: 0 });
  assert.deepEqual(c("const x = <td>{false ? U : cell(1)}</td>;"), { hits: 1, unguarded: 1 }, "ทางแยกที่ไม่ได้ถาม unknown ไม่ได้คุ้ม");
  assert.deepEqual(c("const x = unknown ? U : cell(1);\nconst y = cell(2);"), { hits: 2, unguarded: 1 });
  // กิ่ง then — คำเตือนที่จริงได้แค่ตอนมีของ · ทางแยกกลับด้าน / เงื่อนไขรอบนอกที่อ่านธงตัวเดียวกัน ไม่นับ
  const t = (s) => guardedIn(s, { literal: "ไม่มีราคา" }, "ok", "consequent");
  assert.deepEqual(t("const x = ok ? `${n} ไม่มีราคา` : note;"), { hits: 1, unguarded: 0 });
  assert.deepEqual(t("const x = ok ? note : `${n} ไม่มีราคา`;"), { hits: 1, unguarded: 1 }, "กิ่ง else ของ ok = ตอนไม่มีของ");
  assert.deepEqual(t("const x = (!ok || n) && `${n} ไม่มีราคา`;"), { hits: 1, unguarded: 1 }, "อ่าน ok ก็จริง แต่ไม่ใช่กิ่ง then");
  assert.deepEqual(t("function P() {\n  if (ok) return null;\n  return \"ไม่มีราคา\";\n}"), { hits: 1, unguarded: 1 }, "early return คุ้มกิ่ง then ไม่ได้");
});

test("ตัวอ่านทางแยก (gatesIn) เห็นธงทุกทรงที่คุมของชิ้นหนึ่ง — และไม่นับธงที่แค่ส่งเป็น prop", () => {
  const gates = (s, match = { tag: "T" }) => gatesIn(s, match).map((set) => [...set].sort());
  assert.deepEqual(gates("const x = a ? <N /> : b ? <M /> : <T />;"), [["a", "b"]], "ternary ซ้อน — ทุกชั้นที่ครอบ");
  assert.deepEqual(gates("const x = <div>{!flag && <T />}</div>;"), [["flag"]], "`!flag && …` คือการซ่อนด้วยธง");
  assert.deepEqual(gates("function P() {\n  if (flag) return null;\n  return <T />;\n}"), [["flag"]], "early return ก่อนหน้า");
  assert.deepEqual(gates("function P() {\n  if (flag) log();\n  return <T />;\n}"), [[]], "`if` ที่ไม่ return ไม่ได้กันอะไร");
  assert.deepEqual(gates("const x = page ? null : <T value={flag ? 1 : 2} />;"), [["page"]],
    "ธงที่อยู่ **ใน** แอตทริบิวต์ของแท็กไม่ได้คุมว่าแท็กจะถูกวาดไหม");
  assert.deepEqual(gates("const x = page ? null : rows.map((r) => <T key={r} />);"), [["page"]], "ทะลุ .map() ขึ้นไปหาทางแยกที่ครอบ");
  assert.deepEqual(gates('const o = ok ? "— ไม่มี AE —" : "x";', { literal: "ไม่มี AE" }), [["ok"]], "สตริงลิเทอรัลในนิพจน์");
});

/* /database — สองสายสลับกันอยู่บนแผงเดียวกัน (ไทล์แถวเดียว · กราฟแนวโน้ม · คิวรออนุมัติ)
   ⇒ ตัวเลขที่ต้องเลิกพูดตอนพังคนละชิ้นกับ /tax: ไทล์เป็นขีดรายใบตามสายของมัน ไม่ใช่ซ่อนทั้งแถว */
test("/database: สายที่ไม่มีของในมือห้ามขึ้นเลข 0 — ไทล์เป็นขีดตามสายของตัวเอง กราฟวางบรรทัดแทน คิวบอกว่าไม่ครบ", () => {
  const rel = "app/database/page.js";
  const text = code(rel);
  // ไทล์แต่ละใบต้องผูกกับ **สายของตัวเอง** — ไทล์ลูกค้าที่ถามแต่ productsFailed ยังขึ้น 0 ตอนลูกค้าล้ม
  for (const [label, flag] of [
    ["สินค้าทั้งหมด", "productsFailed"], ["สินค้ารออนุมัติ", "productsFailed"],
    ["ลูกค้าทั้งหมด", "customersFailed"], ["ลูกค้ารออนุมัติ", "customersFailed"],
  ]) {
    assert.match(text, new RegExp(`<KpiCard label="${label}" value=\\{${flag} \\? NA :`),
      `ไทล์ "${label}" ต้องเป็นขีด (NA) เมื่อ ${flag} — 0 ที่มาจากความไม่รู้คือคำตอบผิด`);
  }
  assert.match(text, /productsFailed = !!\(productsError \|\| productsStale\) && !productsLoaded/,
    "สายสินค้า 'ไม่มีของในมือ' = ล้ม และไม่เคยโหลดสำเร็จ (loaded) — ไม่ใช่ความยาวลิสต์");
  assert.match(text, /customersFailed = !!\(customersError \|\| customersStale\) && !customersLoaded/);
  /* กราฟต้องอยู่ **ในกิ่ง else** ของทางแยก ไม่ใช่แค่ "อยู่หลังทางแยก"
     🐞 ตัวตรวจรุ่นแรกเทียบตำแหน่งตัวอักษร ⇒ เขียนทางแยกเป็น `? (…) : null}` แล้ววาดกราฟต่อข้างล่างทุกกรณี
        ก็ผ่าน ทั้งที่เส้นของสายที่ล้มนอนที่ 0 ตลอดแกน ⇒ ตรวจจากโครงสร้าง (AST) ว่าทุกตัวอยู่ใต้ `alternate` */
  for (const [what, match, guard] of [
    // กินสองสาย — ทางแยกต้องถามทั้งสอง ไม่งั้นเส้นของสายที่ล้มนอนที่ 0
    ["กราฟแนวโน้ม", { tag: "AreaChart" }, "productsFailed || customersFailed"],
    // นับจากแถวสินค้าล้วน — ลูกค้าล้มไม่เกี่ยว
    ["Top 5 ลูกค้า (นับจากแถวสินค้า)", { tag: "BarChart" }, "productsFailed"],
    ["กราฟวงกลมหมวดสินค้า", { tag: "PieChart" }, "productsFailed"],
    // 🐞 ทรงที่ต้องไม่กลับมา: สินค้าไม่เคยโหลดขึ้น ⇒ categoryData ว่าง ⇒ "ไม่มีข้อมูลสินค้าตามตัวกรองนี้" (โทษตัวกรอง)
    ["ข้อความ 'ไม่มีข้อมูลสินค้าตามตัวกรองนี้'", { text: "ไม่มีข้อมูลสินค้าตามตัวกรองนี้" }, "productsFailed"],
  ]) {
    const { hits, unguarded } = guardedBy(rel, match, guard);
    assert.ok(hits > 0, `${what}: หาไม่เจอในไฟล์ — ตัวตรวจล้าสมัย?`);
    assert.equal(unguarded, 0,
      `${what}: ทุกตัวต้องอยู่ในกิ่ง else ของ \`{${guard} ? … : …}\` — สายที่ไม่มีของในมือต้องได้บรรทัดแทน ไม่ใช่กราฟที่นอนที่ 0`);
  }
  // คิวรออนุมัติผสมสองสาย — ไม่ซ่อน แต่ต้องไม่อ้างยอดเต็มและไม่ยินดีกับคิวว่าง
  assert.match(text, /queueIncomplete = productsFailed \|\| customersFailed/);
  assert.match(text, /<ActionQueue[^>]*\bincomplete=\{queueIncomplete\}/,
    "คิวที่ขาดสายหนึ่งไปต้องไม่ขึ้น 'ไม่มีรายการรออนุมัติตอนนี้ 🎉'");
  assert.match(text, /queueIncomplete \? `อย่างน้อย \$\{queue\.length\}`/,
    "ป้ายจำนวนของคิวที่ไม่ครบต้องเป็น 'อย่างน้อย n' ไม่ใช่ยอดเต็ม");
});

test("ActionQueue: คิวไม่ครบ ต้องไม่ยินดีกับช่องว่าง", () => {
  const text = code("components/ui/ActionQueue.js");
  assert.match(text, /incomplete = false/, "ActionQueue ต้องรู้ว่าแหล่งข้อมูลของคิวไม่ครบ (ค่าตั้งต้น = ครบ ⇒ ผู้เรียกเดิมไม่ขยับ)");
  assert.match(text, /if \(incomplete\) \{[\s\S]{0,200}?icon=\{AlertCircle\}[\s\S]{0,120}?คิวยังไม่ครบ/,
    "ช่องว่างตอนคิวไม่ครบต้องเป็นคำบอกว่ายังไม่ครบ (ไอคอนเตือน) ไม่ใช่เครื่องหมายถูก + 🎉");
  const incompleteBranch = text.indexOf("if (incomplete)");
  assert.ok(incompleteBranch !== -1 && incompleteBranch < text.indexOf("{empty}</EmptyState>"),
    "ต้องตัดสิน 'ไม่ครบ' ก่อนข้อความว่างของผู้เรียก");
});

/* ── ตัวอ่าน AST สำหรับกติการายจอของหน้ารายละเอียด ─────────────────────────────────────────────
   ถามโครงสร้าง ไม่ใช่ตัวอักษร: ค่าแต่ละช่องคืนเป็นข้อความของนิพจน์ (ยุบช่องว่างแล้ว) — สตริงคืนค่าจริง และชื่อตัวแปร
   ที่ชี้ไปหา `const X = "…"` ถูกแกะเป็นค่าสตริงนั้น (ประโยคที่ใช้ร่วมหลายสายประกาศเป็นค่าคงที่ ต้องตรวจเนื้อได้)
   ⭐ การผูกสาย ↔ ฮุก ตัดสินด้วย **binding** ของ babel (ตัวแปรที่แกะจาก `useApiList(url)` ตัวไหน) ไม่ใช่ชื่อหรือ regex
      ⇒ `error: ordersError || null` · `error: ordersError || x` (x = ของฮุกอื่น) · ปุ่มลองใหม่ที่ไม่เรียก reload = แดงทุกทรง */
const astReader = (rel) => {
  const source = read(rel);
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const textOf = (node) => source.slice(node.start, node.end).replace(/\s+/g, " ");
  const keyOf = (node) => (node.type === "Identifier" ? node.name : node.type === "StringLiteral" ? node.value : null);
  const valueOf = (path) => {
    if (path.isStringLiteral()) return path.node.value;
    if (path.isIdentifier()) {
      const init = path.scope.getBinding(path.node.name)?.path.node.init;
      if (init?.type === "StringLiteral") return init.value;
    }
    return textOf(path.node);
  };
  const entriesOf = (objPath) => Object.fromEntries(objPath.get("properties")
    .filter((p) => p.isObjectProperty() && !p.node.computed && keyOf(p.node.key))
    .map((p) => [keyOf(p.node.key), valueOf(p.get("value"))]));
  const propOf = (objPath, key) => objPath.get("properties")
    .find((p) => p.isObjectProperty() && !p.node.computed && keyOf(p.node.key) === key)?.get("value") ?? null;
  const bindingOf = (path) => (path?.isIdentifier() ? path.scope.getBinding(path.node.name) ?? null : null);
  // binding ทุกตัวที่ถูกอ่านใน subtree (รวมตัวราก)
  const bindingsIn = (path) => {
    const out = new Set();
    const visit = (p) => { if (p.isReferencedIdentifier()) { const b = p.scope.getBinding(p.node.name); if (b) out.add(b); } };
    if (path.isIdentifier()) visit(path);
    path.traverse({ Identifier: visit });
    return out;
  };
  const declarator = (name) => {
    let found = null;
    traverse(ast, {
      VariableDeclarator(path) { if (path.node.id.type === "Identifier" && path.node.id.name === name) found = path; },
    });
    return found;
  };
  const bindingNamed = (name) => { const d = declarator(name); return d ? d.scope.getBinding(name) : null; };
  /* คอมโพเนนต์ของจอ — ตั้งต้นคือ default export · ส่งชื่อมาเมื่อ default export เป็นแค่ตัวห่อ
     (sahamit/forecast: `ForecastPage` = `<Suspense>` ห่อ `ForecastPageInner` ที่วาดจอจริง) */
  const component = (name) => {
    let fn = null;
    if (name) traverse(ast, { FunctionDeclaration(path) { if (path.node.id?.name === name) fn = path; } });
    else traverse(ast, { ExportDefaultDeclaration(path) { fn = path.get("declaration"); } });
    return fn;
  };
  // ออกจากฟังก์ชันแน่ ๆ — `return …;` เดี่ยว หรือบล็อกที่คำสั่งสุดท้ายคือ return ⇒ path ของค่าที่คืน
  const returnedBy = (stmt) => {
    if (stmt.isReturnStatement()) return stmt.get("argument");
    if (stmt.isBlockStatement()) { const last = stmt.get("body").at(-1); return last?.isReturnStatement() ? last.get("argument") : null; }
    return null;
  };
  return {
    // ทุกสายในก้อน `const sources = [ … ]` ⇒ [{ label, error, empty, blocks, blockedNote, … }]
    sources() {
      return this.sourcePaths().map(entriesOf);
    },
    sourcePaths() {
      const out = [];
      traverse(ast, {
        VariableDeclarator(path) {
          if (path.node.id.type !== "Identifier" || path.node.id.name !== "sources" || !path.get("init").isArrayExpression()) return;
          for (const el of path.get("init.elements")) if (el.isObjectExpression()) out.push(el);
        },
      });
      return out;
    },
    // ทุก `const { … } = useApiList(url)` ⇒ [{ url, b: { error, staleError, errorDetail, loading, loaded, reload } (Binding) }]
    hooks() {
      const out = [];
      traverse(ast, {
        CallExpression(path) {
          if (!path.get("callee").isIdentifier({ name: "useApiList" })) return;
          const decl = path.parentPath;
          if (!decl.isVariableDeclarator() || decl.node.id.type !== "ObjectPattern") return;
          const b = {};
          for (const p of decl.node.id.properties) {
            if (p.type !== "ObjectProperty" || p.computed) continue;
            const local = p.value.type === "AssignmentPattern" ? p.value.left : p.value;
            if (local.type === "Identifier") b[keyOf(p.key)] = decl.scope.getBinding(local.name);
          }
          out.push({ url: textOf(path.node.arguments[0]), b });
        },
      });
      return out;
    },
    /* `error` ของสายหนึ่ง ⇒ { gate, left, right } เป็น Binding — แกะทางแยก `cond ? A || B : null` ออกก่อน
       (สายที่พูดเฉพาะบางเงื่อนไข เช่นสายรองของใบยื่นที่พูดเฉพาะตอนคนดูมีปุ่มแก้ไข) */
    failureOf(objPath) {
      let p = propOf(objPath, "error");
      if (!p) return { gate: null, left: null, right: null };
      let gate = null;
      if (p.isConditionalExpression() && p.get("alternate").isNullLiteral()) { gate = textOf(p.node.test); p = p.get("consequent"); }
      if (!p.isLogicalExpression({ operator: "||" })) return { gate, left: null, right: null };
      return { gate, left: bindingOf(p.get("left")), right: bindingOf(p.get("right")) };
    },
    // สายที่ `error` ของมันคือ error ของฮุกตัวนี้
    sourceFor(hook) {
      return this.sourcePaths().find((s) => this.failureOf(s).left === hook.b.error) ?? null;
    },
    prop: propOf,
    field: (objPath, key) => { const p = propOf(objPath, key); return p ? valueOf(p) : undefined; },
    bindingsOf: (objPath, key) => { const p = propOf(objPath, key); return p ? bindingsIn(p) : new Set(); },
    bindingNamed,
    // `if (<guard>) return <X>;` ตัวแรกของไฟล์ ⇒ path ของ X (null = ไม่มีทางแยกนี้ หรือไม่ได้ return)
    earlyReturn(guard) {
      let found = null;
      traverse(ast, {
        IfStatement(path) { if (!found && textOf(path.node.test) === guard) found = returnedBy(path.get("consequent")); },
      });
      return found;
    },
    // ค่าที่คืนจากคำสั่งสุดท้ายของคอมโพเนนต์ (default export หรือฟังก์ชันชื่อ `name`) — ทางปกติของจอ
    mainReturn(name) {
      const last = component(name)?.get("body.body").at(-1);
      return last?.isReturnStatement() ? last.get("argument") : null;
    },
    rendersIn(path, binding) {
      return !!path && bindingsIn(path).has(binding);
    },
    // มี `{X}` (JSXExpressionContainer ที่เป็นตัวแปรนี้ตรง ๆ) อยู่ใน subtree
    rendersAsChild(path, binding) {
      if (!path) return false;
      let hit = false;
      path.traverse({ JSXExpressionContainer(p) { if (bindingOf(p.get("expression")) === binding) hit = true; } });
      return hit;
    },
    /* ปุ่ม `<Button …>` ตัวที่มีคำว่า "ลองใหม่" ใน `const notice = …` ⇒ { onClick, disabled, labelTest } เป็น path
       · `name` = ป้ายอีกตัวของจอที่มีปุ่มลองใหม่ของตัวเอง (ทะเบียนรายละเอียด: `reqNotice` ของผลตรวจเอกสารบังคับ) */
    retryButton(name = "notice") {
      let out = null;
      declarator(name)?.traverse({
        JSXElement(path) {
          if (out || path.node.openingElement.name.name !== "Button" || !textOf(path.node).includes("ลองใหม่")) return;
          const attr = (name) => path.get("openingElement.attributes")
            .find((a) => a.isJSXAttribute() && a.node.name.name === name)?.get("value.expression") ?? null;
          const cond = path.get("children").map((c) => (c.isJSXExpressionContainer() ? c.get("expression") : null))
            .find((e) => e?.isConditionalExpression());
          out = { onClick: attr("onClick"), disabled: attr("disabled"), labelTest: cond ? cond.get("test") : null };
        },
      });
      return out;
    },
    /* onClick = `() => <failing>.forEach((s) => s.reload())` — เรียก reload ของ **สมาชิกของ failing** ทุกตัว
       ⇒ `() => {}` · เรียก reload ตัวเดียว · วนลิสต์อื่น = false */
    retriesEveryFailing(onClick, failingBinding) {
      if (!onClick?.isArrowFunctionExpression()) return false;
      const body = onClick.get("body");
      if (!body.isCallExpression()) return false;
      const callee = body.get("callee");
      if (!callee.isMemberExpression() || bindingOf(callee.get("object")) !== failingBinding
        || callee.node.property.name !== "forEach") return false;
      const cb = body.get("arguments")[0];
      if (!cb?.isArrowFunctionExpression() || cb.node.params.length !== 1 || cb.node.params[0].type !== "Identifier") return false;
      const call = cb.get("body");
      if (!call.isCallExpression()) return false;
      const reloadCallee = call.get("callee");
      return reloadCallee.isMemberExpression() && reloadCallee.node.property.name === "reload"
        && bindingOf(reloadCallee.get("object"))?.identifier === cb.node.params[0];
    },
    // ข้อความคงที่ที่อยู่ **ตรงหน้า** นิพจน์ที่มี `needle` ใน template literal ของ `const <name> = …`
    textBefore(name, needle) {
      const out = [];
      declarator(name)?.traverse({
        TemplateLiteral(path) {
          path.node.expressions.forEach((e, i) => { if (textOf(e).includes(needle)) out.push(path.node.quasis[i].value.cooked); });
        },
      });
      return out;
    },
    // ปุ่มบน DocumentControlCard ประกาศเป็น object `{ id: "<id>", … }` ⇒ ทุกก้อนที่มี id นี้
    actions(id) {
      const out = [];
      traverse(ast, {
        ObjectExpression(path) {
          const entries = entriesOf(path);
          if (entries.id === id) out.push(entries);
        },
      });
      return out;
    },
    // ชื่อตัวแปรทุกตัวที่ถูกอ่านใน initializer ของ `const <name> = …`
    readsIn(name) {
      const names = new Set();
      traverse(ast, {
        VariableDeclarator(path) {
          if (path.node.id.type !== "Identifier" || path.node.id.name !== name) return;
          path.get("init").traverse({ Identifier(p) { if (p.isReferencedIdentifier()) names.add(p.node.name); } });
        },
      });
      return names;
    },
    // ข้อความของ initializer ของ `const <name> = …` (ยุบช่องว่างแล้ว) — ใช้เทียบนิยามทั้งก้อน ไม่ใช่หาคำในไฟล์
    initText(name) {
      const init = declarator(name)?.node.init;
      return init ? textOf(init) : null;
    },
    // path ของ initializer ของ `const <name> = …` — ใช้ถามโครงสร้างข้างใน (ทางแยก · if · การเรียก) ของตัวแปรตัวเดียว
    initPath(name) {
      const d = declarator(name);
      return d?.node.init ? d.get("init") : null;
    },
    /* `const <name> = useMemo(() => …, deps)` ⇒ ชื่อที่ **ตัว callback** อ่าน (ไม่นับ deps)
       🪤 readsIn นับ deps ด้วย ⇒ ถอดตัวแปรออกจากตัวคำนวณแต่ลืมถอดจาก deps = readsIn ยังเจอ ด่านเขียวทั้งที่ไม่ได้ใช้แล้ว */
    memoReads(name) {
      const names = new Set();
      const init = this.initPath(name);
      if (!init?.isCallExpression() || !init.node.arguments.length) return names;
      init.get("arguments.0").traverse({ Identifier(p) { if (p.isReferencedIdentifier()) names.add(p.node.name); } });
      return names;
    },
    // ชื่อ property ทุกตัวที่ถูกอ่านแบบ `x.prop` / `x?.prop` ใน initializer ของ `const <name> = …` (readsIn เห็นแต่ตัวแปร)
    membersIn(name) {
      const names = new Set();
      this.initPath(name)?.traverse({
        "MemberExpression|OptionalMemberExpression"(p) { if (!p.node.computed) names.add(p.node.property.name); },
      });
      return names;
    },
    // ทุกจุดเรียก `name(…)` ในไฟล์ (callee เป็นชื่อตรง ๆ)
    calls(name) {
      const out = [];
      traverse(ast, { CallExpression(path) { if (path.get("callee").isIdentifier({ name })) out.push(path); } });
      return out;
    },
    // path อยู่ใน initializer ของ `const <name> = …`
    within: (path, name) => !!path.findParent((p) => p.isVariableDeclarator() && p.node.id.type === "Identifier" && p.node.id.name === name),
    textOf,
    // ทุก object literal ที่มี `<prop>: "<value>"` ⇒ entries (ทรงเดียวกับ actions(id) แต่เลือกคีย์เองได้)
    objectsWhere(prop, value) {
      const out = [];
      traverse(ast, {
        ObjectExpression(path) {
          const entries = entriesOf(path);
          if (entries[prop] === value) out.push(entries);
        },
      });
      return out;
    },
    /* ทุก `<tag …>…</tag>` ที่ข้อความลูก (JSXText ต่อกัน ตัดช่องว่าง) เท่ากับ `text` (ไม่ส่ง = ทุกตัว)
       หรือ (`where`) ที่แอตทริบิวต์หนึ่งเป็นสตริง/นิพจน์ตามที่ให้ ⇒ [{ path, attr(name) → path ของค่า | null }]
       ⭐ ผูกด้วยโครงสร้าง (แท็ก + ข้อความ/แอตทริบิวต์) ไม่ใช่ตำแหน่ง — จัดบรรทัด/สลับลำดับแอตทริบิวต์ได้ไม่แดง */
    elements(tag, { text, where } = {}) {
      const out = [];
      traverse(ast, {
        JSXElement(path) {
          const open = path.node.openingElement;
          if (open.name.type !== "JSXIdentifier" || open.name.name !== tag) return;
          const own = path.node.children.filter((c) => c.type === "JSXText").map((c) => c.value).join("").trim();
          if (text !== undefined && own !== text) return;
          const attr = (name) => {
            const a = path.get("openingElement.attributes").find((x) => x.isJSXAttribute() && x.node.name.name === name);
            if (!a) return null;
            const v = a.get("value");
            return v.isJSXExpressionContainer() ? v.get("expression") : v;
          };
          if (where && !Object.entries(where).every(([name, want]) => {
            const v = attr(name);
            return v && (v.isStringLiteral() ? v.node.value : textOf(v.node)) === want;
          })) return;
          out.push({ path, attr });
        },
      });
      return out;
    },
    // ชื่อตัวแปรทุกตัวที่ถูกอ่านในแอตทริบิวต์ JSX ชื่อนี้ (ทุกแท็ก)
    readsInAttr(attr) {
      const names = new Set();
      traverse(ast, {
        JSXAttribute(path) {
          if (path.node.name.name !== attr) return;
          path.traverse({ Identifier(p) { if (p.isReferencedIdentifier()) names.add(p.node.name); } });
        },
      });
      return names;
    },
    bindingsIn,
  };
};

/* ── ทรงร่วมของหน้ารายละเอียด: ป้ายต้อง **ถูกวาด** จริง และทางกลับต้องต่อสายจริง ─────────────────────────────
   🐞 ช่องที่ด่านรุ่นก่อนปล่อย (ตรวจด้วยการกลายพันธุ์บนสำเนา): ถอด `{notice}` ออกจากทางปกติ · ทางบล็อกคืน `shell(null)` ·
      onClick ของปุ่มลองใหม่เป็น `() => {}` · `error: ordersError || null` — ด่านเขียวหมดทุกทรง เพราะตรวจแค่ว่า "มีคำว่า reload
      ในไฟล์" / "error มี `||`" ⇒ แคชอุ่นที่รอบใหม่ล้มกลับไปเงียบ (ของรอบก่อนไม่มีป้ายบอก) หรือปุ่มลองใหม่กดแล้วไม่มีอะไรเกิด
   ⇒ ตรวจตาม binding: ทางบล็อกคืนค่าที่อ่าน `notice` · ทางปกติมี `{notice}` · ปุ่มเรียก `.reload()` ของสมาชิก `failing` ·
      ทุกสายอ่าน error/staleError/errorDetail/reload ของ **ฮุกตัวเดียวกัน** และฮุกทุกตัวในไฟล์มีสายของตัวเองครบ */
const DETAIL_PAGES = [
  // ต้นแบบ (#1796/#1799) — ทรงเดียวกัน ด่านเดียวกัน
  { rel: "app/sahamit/forecast/[id]/edit/page.js", blockedGuards: ["blocked.length"] },
  { rel: "app/tax/filings/[id]/page.js", blockedGuards: ["pageBlocked"] },
  { rel: "app/sahamit/po/[id]/edit/page.js", blockedGuards: ["pageBlocked", "blocked.length"] },
  /* 25/09 "ทำอีก 18 จุดต่อ" — ทรงเดียวกันทั้งชุด (ป้ายตัวเดียว · ปุ่มลองใหม่ต่อสายครบ · ทุกฮุกมีสายของตัวเอง)
     `blockedGuards: []` = จอที่ซ่อนเนื้อด้วย ternary ในตัว JSX ไม่ใช่ `if (…) return` — ทางแยกพวกนั้นตรวจรายจอข้างล่าง */
  { rel: "app/sahamit/po/page.js", blockedGuards: [] },
  { rel: "app/sahamit/po/new/page.js", blockedGuards: ["blocked.length"] },
  { rel: "app/sahamit/po/[id]/page.js", blockedGuards: ["pageBlocked"] },
  { rel: "app/sahamit/reconcile/page.js", blockedGuards: [] },
  { rel: "app/sahamit/material/page.js", blockedGuards: [] },
  // default export เป็นแค่ `<Suspense>` ห่อ — จอจริงคือ ForecastPageInner
  { rel: "app/sahamit/forecast/page.js", blockedGuards: [], component: "ForecastPageInner" },
  { rel: "app/tax/filings/page.js", blockedGuards: [] },
  { rel: "app/tax/registrations/page.js", blockedGuards: [] },
  { rel: "app/tax/registrations/[id]/page.js", blockedGuards: ["pageBlocked"] },
];

test("หน้ารายละเอียด: ป้ายถูกวาดทั้งทางบล็อกและทางปกติ · ปุ่มลองใหม่เรียก reload ของทุกสายที่ล้ม · ทุกสายนับ staleError ของฮุกตัวเอง", () => {
  for (const { rel, blockedGuards, component } of DETAIL_PAGES) {
    const ast = astReader(rel);
    const notice = ast.bindingNamed("notice");
    assert.ok(notice, `${rel}: ไม่พบ \`const notice = …\``);
    for (const guard of blockedGuards) {
      const returned = ast.earlyReturn(guard);
      assert.ok(returned, `${rel}: ไม่พบ \`if (${guard}) return …\``);
      assert.ok(ast.rendersIn(returned, notice),
        `${rel}: \`if (${guard}) return …\` ต้องคืนป้าย (notice) — คืน null/ที่ว่าง = จอขาวที่ไม่บอกอะไร`);
    }
    assert.ok(ast.rendersAsChild(ast.mainReturn(component), notice),
      `${rel}: ทางปกติ (return สุดท้าย) ต้องมี {notice} — แคชอุ่นที่รอบใหม่ล้มต้องขึ้นว่า "ของรอบก่อน" ไม่ใช่เงียบ`);

    const button = ast.retryButton();
    assert.ok(button, `${rel}: ไม่พบปุ่ม "ลองใหม่" ในป้าย`);
    assert.ok(ast.retriesEveryFailing(button.onClick, ast.bindingNamed("failing")),
      `${rel}: onClick ของปุ่มลองใหม่ต้องเป็น \`() => failing.forEach((s) => s.reload())\` — ปุ่มที่ไม่ต่อสาย = กดแล้วไม่มีอะไรเกิด`);
    const retrying = ast.bindingNamed("retrying");
    assert.ok(retrying && ast.rendersIn(button.disabled, retrying) && ast.rendersIn(button.labelTest, retrying),
      `${rel}: ปุ่มลองใหม่ต้องพัก (disabled) และเปลี่ยนป้ายตาม \`retrying\` — กดแล้วจอนิ่ง = คนกดซ้ำรัว ๆ`);

    const hooks = ast.hooks();
    assert.ok(hooks.length > 0, `${rel}: ไม่พบ useApiList — ตัวตรวจล้าสมัย?`);
    const retryReads = ast.bindingsIn(retrying.path.get("init"));
    for (const hook of hooks) {
      const s = ast.sourceFor(hook);
      assert.ok(s, `${rel}: ${hook.url} ไม่มีสายในก้อน sources (error ของมันไม่ถึงป้าย)`);
      const { right } = ast.failureOf(s);
      assert.equal(right, hook.b.staleError,
        `${rel}: สาย ${hook.url} ต้องเป็น \`error || staleError\` ของฮุกตัวเดียวกัน — รอบเบื้องหลังที่ล้มต้องถึงป้าย`);
      assert.ok(hook.b.errorDetail && ast.bindingsOf(s, "detail").has(hook.b.errorDetail),
        `${rel}: สาย ${hook.url} ต้องพก errorDetail ของฮุกตัวเอง (บรรทัดรองของป้าย)`);
      assert.ok(hook.b.reload && ast.bindingsOf(s, "reload").has(hook.b.reload),
        `${rel}: สาย ${hook.url} ต้องพก reload ของฮุกตัวเอง — ลองใหม่แล้วยิงผิดลิสต์`);
      assert.ok(hook.b.loading && retryReads.has(hook.b.loading),
        `${rel}: \`retrying\` ต้องอ่าน loading ของ ${hook.url} — ลองสายนี้แล้วปุ่มไม่บอกว่ากำลังลอง`);
    }
  }
});

/* ใบยื่นชำระ — จออ่านเป็นหลัก: สายใบยื่นบล็อกทั้งหน้า · สามสายรองพักแค่ฟอร์มแก้ไข (มติในคอมเมนต์ก้อน sources ของจอ) */
test("ใบยื่นชำระ: โหลดใบไม่ขึ้นห้ามตอบ 'ไม่พบรายการ' · สายรองล้มพักปุ่มแก้ไข ไม่ใช่ปล่อยฟอร์มขาดข้อมูล", () => {
  const rel = "app/tax/filings/[id]/page.js";
  const ast = astReader(rel);
  // 🐞 ทรงเดิม: `/api/orders` ล้ม ⇒ `o` เป็น null ⇒ "ไม่พบรายการ · ใบยื่นนี้อาจถูกลบไปแล้ว"
  const notFound = guardedBy(rel, { text: "ไม่พบใบยื่นที่ต้องการ" }, "pageBlocked");
  assert.ok(notFound.hits > 0, "หาบรรทัด 'ไม่พบใบยื่นที่ต้องการ' ไม่เจอ — ตัวตรวจล้าสมัย?");
  assert.equal(notFound.unguarded, 0,
    "บรรทัด 'ไม่พบ…' ต้องอยู่หลัง `if (pageBlocked) return …` — โหลดใบไม่ขึ้นแล้วจอโกหกว่าใบถูกลบ");

  const hook = (url) => ast.hooks().find((h) => h.url === url);
  const sources = ast.sources();
  const ordersHook = hook('"/api/orders"');
  const ordersPath = ast.sourceFor(ordersHook);
  assert.ok(ordersPath, "ไม่พบสายใบยื่น (/api/orders) ในก้อน sources");
  const orders = { label: ast.field(ordersPath, "label"), blocks: ast.field(ordersPath, "blocks") };
  assert.equal(orders.blocks, "page", "สายใบยื่นต้องบล็อกทั้งหน้า — ไม่มีใบในมือก็ไม่มีอะไรให้โชว์");
  /* 🪤 "ไม่มีใบในมือ" = ใบนี้ (`!o` — แคชเก่าที่ถ่ายไว้ก่อนใบนี้เกิดมีใบอื่นเต็มลิสต์) **และรอบหน้าบ้านล่าสุดล้ม**
     ⇒ รอบเบื้องหลังที่ล้มหลัง "ไม่พบ" ที่ยืนยันแล้ว ต้องไม่พลิกจอเป็น "(ไม่ได้แปลว่าใบยื่นนี้ถูกลบไปแล้ว)" */
  const ordersEmpty = ast.prop(ordersPath, "empty");
  assert.ok(ordersEmpty?.isLogicalExpression({ operator: "&&" }) && ast.field(ordersPath, "empty").startsWith("!o &&"),
    "empty ของสายใบยื่นต้องเป็น `!o && <รอบหน้าบ้านล้ม>`");
  const emptyReads = ast.bindingsOf(ordersPath, "empty");
  assert.ok(emptyReads.has(ordersHook.b.error) && !emptyReads.has(ordersHook.b.staleError),
    "ความว่างของสายใบยื่นต้องอ่าน error (รอบหน้าบ้าน) ไม่ใช่ staleError — รอบเบื้องหลังล้มได้หลังรอบที่ยืนยันว่าไม่มีใบนี้แล้วเท่านั้น");
  // ทุกสายต้องประกาศว่าบล็อกอะไร — สายที่ไม่ประกาศ = ล้มแล้วไม่มีใครพักอะไร (ป้ายขึ้นแต่ของที่กินมันยังเปิดอยู่)
  for (const s of sources) assert.ok(["page", "edit"].includes(s.blocks), `${s.label}: blocks ต้องเป็น "page" หรือ "edit"`);
  assert.deepEqual(sources.filter((s) => s.blocks === "page").map((s) => s.label), [orders.label],
    "สายที่บล็อกทั้งหน้ามีได้สายเดียว คือตัวใบเอง");
  assert.ok(ast.readsIn("editAvailable").has("canAct") && ast.readsIn("editAvailable").has("o"),
    "editAvailable ต้องมาจากสิทธิ์ (canAct) + สถานะใบ — เงื่อนไขเดียวกับปุ่มที่เปิดฟอร์มแก้ไข");
  for (const url of ['"/api/excise-registrations"', '"/api/customers"', '"/api/products"']) {
    const h = hook(url);
    const s = h && ast.sourceFor(h);
    assert.ok(s, `ไม่พบสาย ${url} ในก้อน sources`);
    assert.equal(ast.field(s, "blocks"), "edit", `${url}: สายรองป้อนแค่ฟอร์มแก้ไข — ซ่อนทั้งหน้าเพราะมันล้ม = เสียจอที่ยังถูกอยู่`);
    assert.ok(ast.bindingsOf(s, "empty").has(h.b.loaded) && ast.field(s, "empty").startsWith("!"), `${url}: ความว่างต้องมาจาก !loaded`);
    /* 🐞 RA / ใบที่รับเงินแล้ว ไม่มีปุ่มแก้ไขเลย — ป้ายแดง "ยังแก้ไขใบยื่นนี้ไม่ได้ เพราะ…" คือเหตุผลปลอมของสิ่งที่ไม่มีอยู่
       ⇒ สายรองพูดเฉพาะตอน editAvailable (ของบนหน้าที่เหลือไม่ได้อ่านสามลิสต์นี้) */
    assert.equal(ast.failureOf(s).gate, "editAvailable",
      `${url}: ความล้มของสายรองต้องพูดเฉพาะตอนคนดูมีปุ่มแก้ไข (\`editAvailable ? error || staleError : null\`)`);
    // ยังโหลดอยู่ = ฟอร์มที่เปิดตอนนี้ขาดข้อมูลเท่าตอนล้ม ⇒ ปุ่มต้องพักรอ
    const pending = ast.bindingsOf(s, "pending");
    assert.ok(pending.has(h.b.loading) && pending.has(h.b.loaded), `${url}: pending ต้องมาจาก loading + !loaded ของฮุกตัวเอง`);
  }
  // ประโยค "(ไม่ได้แปลว่า…ถูกลบไปแล้ว)" เป็นของสายใบยื่นเท่านั้น — ทุกสายต้องมี blockedNote ของตัวเอง
  for (const s of sources) assert.ok(s.blockedNote, `${s.label}: ไม่มี blockedNote`);
  assert.deepEqual(sources.filter((s) => s.blockedNote.includes("ถูกลบ")).map((s) => s.label), [orders.label],
    "ประโยค 'ไม่ได้แปลว่าถูกลบ' ต้องอยู่กับสายใบยื่นเท่านั้น — สายรองล้มแล้วพูดเรื่องใบถูกลบ = ตอบคำถามที่ไม่มีใครถาม");
  assert.ok(ast.readsIn("pageBlocked").has("blocked") && ast.readsIn("editBlocked").has("blocked"),
    "pageBlocked/editBlocked ต้องมาจาก blocked (error + ไม่มีของในมือ) ไม่ใช่ error เดี่ยว ๆ");
  // "ยังแก้ไขไม่ได้" คู่กับ "ฟอร์มแก้ไขจะใช้รายการรอบก่อน" ขัดกันเอง ⇒ ตัวเลือกประโยคต้องรู้ว่ามีสายรองถูกบล็อก
  assert.ok(ast.readsIn("said").has("editBlocked"), "said ต้องตัด staleNote ของสายรองทิ้งเมื่อมีสายรองพักฟอร์มไปแล้ว");

  // ปุ่มที่เปิดฟอร์มแก้ไข: โชว์เสมอ แต่พักพร้อมเหตุผล (ติดด่าน = โชว์แล้วบอกเหตุ)
  assert.ok(ast.readsIn("editPaused").has("editBlocked") && ast.readsIn("editPaused").has("editPending"),
    "editPaused ต้องมาจากสายรองที่ถูกบล็อก **และ** สายรองที่ยังโหลดไม่เสร็จ");
  // สำนวนเดียวกับป้าย: ชื่อสายอยู่หลัง "ดึงข้อมูลไม่ได้:" — แทรกกลาง "ดึง…ไม่สำเร็จ" จุดคั่นตกกลางกริยา
  const before = ast.textBefore("editPausedReason", "editBlocked.map");
  assert.ok(before.length > 0 && before.every((t) => t.endsWith("ดึงข้อมูลไม่ได้: ")),
    `เหตุผลที่ปุ่มพักต้องขึ้นชื่อสายหลัง "ดึงข้อมูลไม่ได้: " (เจอ: ${JSON.stringify(before)})`);
  for (const id of ["edit", "resubmit"]) {
    const actions = ast.actions(id);
    assert.equal(actions.length, 1, `ปุ่ม "${id}" หาไม่เจอ/เจอซ้ำ — ตัวตรวจล้าสมัย?`);
    assert.equal(actions[0].disabled, "editPaused", `ปุ่ม "${id}" เปิดฟอร์มแก้ไข ⇒ ต้องพักเมื่อสายรองไม่มีของในมือ`);
    assert.equal(actions[0].disabledReason, "editPausedReason", `ปุ่ม "${id}" พักแล้วต้องบอกเหตุ ไม่ใช่ดับเงียบ`);
  }
  // หัวจอ (รหัส AR) ต้องไม่อ่านลิสต์ลูกค้า — ลิสต์ล้มแล้วหัวจอแหว่งโดยไม่มีอะไรบอก
  assert.ok(!ast.readsInAttr("subtitle").has("customers"), "subtitle อ่านจาก `customer` รายตัว ไม่ใช่ find จากลิสต์ `customers`");
});

test("แก้ PO: โหลดลิสต์ไม่ขึ้นห้ามตอบ 'ไม่พบ PO นี้' และห้ามเปิดฟอร์มที่ขาดสินค้า/สถานะวัสดุ", () => {
  const rel = "app/sahamit/po/[id]/edit/page.js";
  const ast = astReader(rel);
  const notFound = { text: "ไม่พบ PO นี้" };
  // 🐞 ทรงเดิม: `/api/sahamit/po` ล้ม ⇒ `po` เป็น null ⇒ "ไม่พบ PO นี้" ตัวแดง (อ่านว่าถูกลบ)
  const byPage = guardedBy(rel, notFound, "pageBlocked");
  assert.ok(byPage.hits > 0, "หาบรรทัด 'ไม่พบ PO นี้' ไม่เจอ — ตัวตรวจล้าสมัย?");
  assert.equal(byPage.unguarded, 0, "บรรทัด 'ไม่พบ PO นี้' ต้องอยู่หลัง `if (pageBlocked) return …`");
  /* …แต่ต้อง **ไม่** อยู่หลังทางแยกของสายรอง — ลิสต์ PO ตอบแล้วว่าไม่มีใบนี้ = ไม่มีจริง · ป้าย "ยังแก้ไม่ได้เพราะไม่มี
     รายการสินค้า" ใต้หัว "แก้ไข PO" แทนที่ "ไม่พบ PO นี้" อ่านว่ามี PO ให้แก้ */
  assert.equal(guardedBy(rel, notFound, "blocked.length").unguarded, byPage.hits,
    "'ไม่พบ PO นี้' ต้องมาก่อน `if (blocked.length) return …` — สายรองล้มต้องไม่กลบคำตอบที่ลิสต์ PO ยืนยันแล้ว");
  for (const guard of ["blocked.length", "formPending"]) {
    // ฟอร์มที่ไม่มีสถานะวัสดุ = บรรทัดที่ต้องล็อกดูเหมือนแก้ได้ แล้วเซิร์ฟเวอร์ตีกลับ 409 ทั้งใบ — ล้มหรือยังโหลดอยู่ก็เท่ากัน
    const { hits, unguarded } = guardedBy(rel, { tag: "PoForm" }, guard);
    assert.ok(hits > 0, "ฟอร์ม PoForm: หาไม่เจอ — ตัวตรวจล้าสมัย?");
    assert.equal(unguarded, 0, `ฟอร์ม PoForm: ต้องอยู่หลัง \`if (${guard}) return …\` — ป้ายที่ลอยเหนือฟอร์มไม่พอ`);
  }
  const hook = (url) => ast.hooks().find((h) => h.url === url);
  const posHook = hook('"/api/sahamit/po"');
  const pos = ast.sourceFor(posHook);
  assert.ok(pos, "ไม่พบสาย PO ในก้อน sources");
  assert.equal(ast.field(pos, "blocks"), "page", "สาย PO ตัดสินว่ามีใบนี้ไหม ⇒ บล็อกทั้งหน้า");
  // 🪤 "มีของในมือ" ของสาย PO คือ PO ใบนี้ (แคชเก่ามี PO อื่นเต็มลิสต์) และนับเฉพาะรอบหน้าบ้านที่ล้ม
  assert.ok(ast.field(pos, "empty").startsWith("!po &&"), "สาย PO ต้องวัดด้วยใบนี้ (`!po && …`) ไม่ใช่ความยาวลิสต์");
  const posEmpty = ast.bindingsOf(pos, "empty");
  assert.ok(posEmpty.has(posHook.b.error) && !posEmpty.has(posHook.b.staleError),
    "ความว่างของสาย PO ต้องอ่าน error (รอบหน้าบ้าน) ไม่ใช่ staleError — 'ไม่พบ' ที่ยืนยันแล้วต้องไม่พลิกเพราะรอบเบื้องหลังสะดุด");
  for (const url of ['"/api/sahamit/products"', '"/api/sahamit/material"']) {
    const h = hook(url);
    const s = h && ast.sourceFor(h);
    assert.ok(s, `ไม่พบสาย ${url} ในก้อน sources`);
    assert.equal(ast.field(s, "blocks"), "form", `${url}: สายรองพักแค่ฟอร์ม`);
    assert.ok(ast.bindingsOf(s, "empty").has(h.b.loaded) && ast.field(s, "empty").startsWith("!"),
      `${url}: ต้องบล็อกเมื่อไม่เคยโหลดสำเร็จ (!loaded) — สถานะวัสดุคือตัวล็อกบรรทัด`);
    const pending = ast.bindingsOf(s, "pending");
    assert.ok(pending.has(h.b.loading) && pending.has(h.b.loaded), `${url}: pending ต้องมาจาก loading + !loaded ของฮุกตัวเอง`);
  }
  assert.ok(ast.readsIn("pageBlocked").has("blocked"), "pageBlocked ต้องมาจาก blocked (error + ไม่มีของในมือ)");
  assert.ok(ast.readsIn("formPending").has("sources"), "formPending ต้องมาจาก pending ของสายรอง");
  const sources = ast.sources();
  for (const s of sources) assert.ok(s.blockedNote, `${s.label}: ไม่มี blockedNote`);
  assert.deepEqual(sources.filter((s) => s.blockedNote.includes("ถูกลบ")).map((s) => s.label), [ast.field(pos, "label")],
    "ประโยค 'ไม่ได้แปลว่า PO นี้ถูกลบ' ต้องอยู่กับสาย PO เท่านั้น");
  assert.ok(ast.readsIn("loadError").has("blocked"), "ประโยคท้ายป้ายต้องมาจากสายที่ถูกบล็อก");
});

/* ── 25/09 "ทำอีก 18 จุดต่อ" — มติรายจอของ 18 รายการเรียกสุดท้ายในบัญชีหนี้ ─────────────────────────────────
 * สามคำถามเดียวกันทุกจอ ตรวจตามโครงสร้าง (AST · binding) ไม่ใช่ตำแหน่งตัวอักษร:
 *   1. **สายรองล้ม ต้องไม่ซ่อนรายการหลัก** — ตารางหลักถูกคุมด้วยธงของสายหลักเท่านั้น (gatesIn) และนิยามธงนั้นกรอง
 *      เฉพาะ `blocks` ของสายหลัก (initText) · 🪤 `const pageBlocked = blocked.length > 0` ดูเหมือนถูก แต่สายรองล้มแล้วตารางหาย
 *   2. **ของที่จะทำงานบนข้อมูลครึ่งเดียว ต้องพักพร้อมเหตุ** — disabled / ด่านตอนกด อ่านตัวแปรเหตุผลตัวเดียวกับที่โชว์ให้เห็น
 *   3. **picker ล้ม ต้องบอกตรงที่ใช้มัน** — ในโมดัล / ที่หัวหมวดของตัวกรอง ไม่ใช่ตัวเลือกว่างที่อ่านว่า "ไม่มี…"
 * ⚠️ แต่ละข้อผ่านการกลายพันธุ์บนสำเนา src นอก worktree แล้ว (ถอดทางแยก/ถอด disabled/เปลี่ยนนิยามธง = แดง) */
const hookFor = (ast, url) => ast.hooks().find((h) => h.url === url) ?? null;
const sourceForUrl = (ast, url) => {
  const h = hookFor(ast, url);
  const s = h && ast.sourceFor(h);
  assert.ok(s, `ไม่พบสาย ${url} ในก้อน sources — error ของมันไม่ถึงป้าย`);
  return s;
};
// ทุกชิ้นที่เจอ: ธงที่คุมต้องมี `must` ครบ และห้ามมี `mustNot` สักตัว
const assertGates = (rel, match, { must = [], mustNot = [] }, what) => {
  const all = gatesBy(rel, match);
  assert.ok(all.length > 0, `${rel}: ${what} หาไม่เจอ — ตัวตรวจล้าสมัย?`);
  for (const names of all) {
    for (const n of must) assert.ok(names.has(n), `${rel}: ${what} ต้องอยู่ใต้ทางแยกของ \`${n}\``);
    for (const n of mustNot) {
      assert.ok(!names.has(n), `${rel}: ${what} ถูกคุมด้วย \`${n}\` — สายรองล้มแล้วของที่อ่านได้อยู่หายไปด้วย`);
    }
  }
};
// ธงบล็อกของสายหนึ่งต้องกรองด้วย `blocks` ของสายนั้นเท่านั้น
const assertFlag = (ast, name, blocks) => assert.equal(ast.initText(name), `blocked.some((s) => s.blocks === "${blocks}")`,
  `${name} ต้องเป็น \`blocked.some((s) => s.blocks === "${blocks}")\` — นับสายอื่นปนเข้ามา = สายรองล้มแล้วซ่อน/พักของที่ไม่เกี่ยว`);
const reads = (ast, path, name) => ast.rendersIn(path, ast.bindingNamed(name));
const elseOf = (rel, text, guard) => {
  const { hits, unguarded } = guardedBy(rel, { text }, guard);
  assert.ok(hits > 0, `${rel}: หา '${text}' ไม่เจอ — ตัวตรวจล้าสมัย?`);
  assert.equal(unguarded, 0, `${rel}: '${text}' ต้องอยู่หลังทางแยก \`${guard}\` — โหลดไม่ขึ้นแล้วจอตอบว่าไม่มี`);
};
// คำเตือนที่จริงได้แค่ตอนมีของในมือ ("n SKU ไม่มีราคา") — ทุกตัวต้องอยู่กิ่ง then ของ `guard ? … : …`
const thenOf = (rel, literal, guard) => {
  const { hits, unguarded } = guardedBy(rel, { literal }, guard, "consequent");
  assert.ok(hits > 0, `${rel}: หา '${literal}' ไม่เจอ — ตัวตรวจล้าสมัย?`);
  assert.equal(unguarded, 0, `${rel}: '${literal}' ต้องอยู่กิ่ง then ของ \`${guard} ? … :\` — ไม่มีของในมือแล้วขึ้นคำนี้ = คำเตือนปลอม`);
};
/* ปุ่ม "ลัง" (สหมิตร FC + กระทบยอด) — ไม่รู้ชิ้นต่อลัง displayQty คืนเลขชิ้นใต้หัว "ลัง" ⇒ ต้องพัก และบอกเหตุตอนกด
   (ท่า GatedAction: ไม่ `disabled` — title ของปุ่มที่ปิดอยู่ คีย์บอร์ดโฟกัสไม่ถึง และตอนเต็มจอป้ายหัวจอถูกบัง) */
const assertUnitGate = (ast, rel, unitVar) => {
  const [caseBtn, ...extra] = ast.elements("button", { text: "ลัง" });
  assert.ok(caseBtn && !extra.length, `${rel}: ปุ่ม "ลัง" ต้องมีตัวเดียว — ตัวตรวจล้าสมัย?`);
  assert.ok(reads(ast, caseBtn.attr("onClick"), "unitBlocker"), `${rel}: ปุ่ม "ลัง" กดแล้วต้องบอกเหตุ (onClick อ่าน unitBlocker) ไม่ใช่สลับเงียบ ๆ`);
  assert.ok(reads(ast, caseBtn.attr("title"), "unitBlocker"), `${rel}: ปุ่ม "ลัง" ต้องมีเหตุใน title ด้วย`);
  // ⚠️ ถามเป็น boolean — ส่ง NodePath เข้า assert.equal แล้วแดง ตัวรายงานของ node:test จะพยายาม serialize ทั้ง AST จนโปรเซสลูกล้ม
  assert.ok(!caseBtn.attr("disabled"), `${rel}: ปุ่ม "ลัง" ห้าม disabled — ปุ่มที่ปิดอยู่บอกเหตุไม่ได้ (ดู GatedAction)`);
  assert.ok(ast.readsIn(unitVar).has("unitBlocker"), `${rel}: หน่วยที่ตารางใช้จริง (${unitVar}) ต้องถอยเป็นชิ้นเมื่อติดด่าน — ไม่งั้นหัวบอก "ลัง" แต่เลขเป็นชิ้น`);
};

test("PO (รายการ): สายรองล้มไม่ซ่อนรายการ PO · มูลค่า/สถานะเลิกพูดเป็นคำตอบ · 'ยังไม่มี PO' มาจากลิสต์ที่โหลดสำเร็จเท่านั้น", () => {
  const rel = "app/sahamit/po/page.js";
  const ast = astReader(rel);
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/po"'), "blocks"), "page");
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/material"'), "blocks"), "status");
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/products"'), "blocks"), "value");
  assertFlag(ast, "pageBlocked", "page");
  assertFlag(ast, "statusBlocked", "status");
  assertFlag(ast, "valueBlocked", "value");
  elseOf(rel, "ยังไม่มี PO", "pageBlocked");
  for (const tag of ["PoGroup", "PoLinesTable"]) {
    assertGates(rel, { tag }, { must: ["pageBlocked"], mustNot: ["statusBlocked", "valueBlocked"] }, `<${tag}>`);
  }
  // 🐞 ทรงเดิม: รายการสินค้าล้ม ⇒ "฿0.00 · n รายการไม่มีราคา" ทุกใบ · สถานะวัสดุล้ม ⇒ "ไม่มีรายการที่ต้องติดตาม"
  elseOf(rel, "รายการไม่มีราคา", "valueBlocked");
  assertGates(rel, { literal: "ไม่มีรายการที่ต้องติดตาม" }, { must: ["statusBlocked"] }, "'ไม่มีรายการที่ต้องติดตาม'");
  const [group] = ast.elements("PoGroup");
  assert.ok(reads(ast, group.attr("statusBlocked"), "statusBlocked") && reads(ast, group.attr("valueBlocked"), "valueBlocked"),
    "PoGroup ต้องได้ธงของสายรองทั้งสอง — ไม่งั้นแถวยังพูด ฿0.00 / 'ไม่มีรายการที่ต้องติดตาม'");
  // รอบแรกรอสายรองด้วย — `firstLoad = loading` เฉย ๆ = วาบ "฿0.00 · n รายการไม่มีราคา" ก่อนรายการสินค้ามาถึง
  assert.ok(ast.readsIn("firstLoad").has("sources"), "firstLoad ต้องรอ pending ของทุกสาย (ก้อน sources) ไม่ใช่ loading ของสาย PO อย่างเดียว");
  // ค้นด้วยชื่อสินค้าต้องอ่านชื่อที่บันทึกกับบรรทัด PO ด้วย — รายการสินค้าล้มแล้ว "ไม่มี PO ตรงเงื่อนไข" ทั้งที่ใบอยู่ครบ
  assert.ok(ast.membersIn("filteredPos").has("productName"), "คำค้นของ filteredPos ต้องรวม productName ของบรรทัด PO (ไม่พึ่งรายการสินค้าอย่างเดียว)");
});

test("PO (ใหม่): รายการสินค้าไม่เคยโหลดขึ้น = ฟอร์มไม่เปิด (ป้ายแทนฟอร์ม) ไม่ใช่ picker ว่างที่อ่านว่าไม่มีสินค้า", () => {
  const rel = "app/sahamit/po/new/page.js";
  const ast = astReader(rel);
  const products = sourceForUrl(ast, '"/api/sahamit/products"');
  const h = hookFor(ast, '"/api/sahamit/products"');
  assert.ok(ast.bindingsOf(products, "empty").has(h.b.loaded), "ความว่างของรายการสินค้าต้องมาจาก loaded");
  const pending = ast.bindingsOf(products, "pending");
  assert.ok(pending.has(h.b.loading) && pending.has(h.b.loaded), "pending ต้องมาจาก loading + !loaded — รอบแรกที่ยังไม่มา = ฟอร์มได้ ⚠ 'ไม่รู้จัก' ทุกแถวเหมือนตอนล้ม");
  for (const guard of ["blocked.length", "formPending"]) {
    const { hits, unguarded } = guardedBy(rel, { tag: "PoForm" }, guard);
    assert.ok(hits > 0, "หา <PoForm> ไม่เจอ — ตัวตรวจล้าสมัย?");
    assert.equal(unguarded, 0, `<PoForm> ต้องอยู่หลัง \`if (${guard}) return …\` — ป้ายลอยเหนือฟอร์มยังปล่อยให้กรอกแล้วบันทึกด้วย ⚠ 'ไม่รู้จัก' ปลอม`);
  }
});

test("PO (รายละเอียด): โหลดใบไม่ขึ้นห้ามตอบ 'ไม่พบ PO นี้' · สถานะวัสดุ/ราคาล้มไม่ซ่อนบรรทัด แต่ช่องที่กินมันเลิกพูดเป็นคำตอบ", () => {
  const rel = "app/sahamit/po/[id]/page.js";
  const ast = astReader(rel);
  elseOf(rel, "ไม่พบ PO นี้", "pageBlocked");
  const posHook = hookFor(ast, '"/api/sahamit/po"');
  const pos = sourceForUrl(ast, '"/api/sahamit/po"');
  assert.equal(ast.field(pos, "blocks"), "page");
  assert.ok(ast.field(pos, "empty").startsWith("!po &&"), "สาย PO ต้องวัดด้วยใบนี้ (`!po && …`) ไม่ใช่ความยาวลิสต์");
  const posEmpty = ast.bindingsOf(pos, "empty");
  assert.ok(posEmpty.has(posHook.b.error) && !posEmpty.has(posHook.b.staleError),
    "ความว่างของสาย PO อ่าน error (รอบหน้าบ้าน) ไม่ใช่ staleError — 'ไม่พบ' ที่ยืนยันแล้วต้องไม่พลิกเพราะรอบเบื้องหลังสะดุด");
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/material"'), "blocks"), "tracking");
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/products"'), "blocks"), "value");
  assertFlag(ast, "pageBlocked", "page");
  assertFlag(ast, "trackingBlocked", "tracking");
  assertFlag(ast, "valueBlocked", "value");
  assertGates(rel, { tag: "PoLineRow" }, { mustNot: ["trackingBlocked", "valueBlocked"] }, "<PoLineRow>");
  // ช่อง PM/RM: ขีด = "ยังไม่มีกำหนด" ⇒ ไม่รู้ต้องพูดว่าดึงไม่ได้
  const [row] = ast.elements("PoLineRow");
  assert.ok(reads(ast, row.attr("trackingUnknown"), "trackingBlocked"), "PoLineRow ต้องรู้ว่าสถานะวัสดุไม่มีในมือ (trackingUnknown)");
  // …และตัวแถวต้อง **อ่าน** มันจริง — ทุกจุดที่วาดช่อง PM/RM (`matCell`) อยู่กิ่ง else ของ `trackingUnknown ? … : …`
  const pmRm = guardedBy(rel, { call: "matCell" }, "trackingUnknown");
  assert.ok(pmRm.hits >= 2, "หาจุดเรียก matCell (ช่อง PM · RM) ไม่ครบ — ตัวตรวจล้าสมัย?");
  assert.equal(pmRm.unguarded, 0, "ช่อง PM/RM ทุกจุดต้องอยู่หลัง `trackingUnknown ? … :` — ขีดของ matCell อ่านว่า 'ยังไม่มีกำหนด'");
  assert.ok(ast.readsIn("firstLoad").has("sources"), "firstLoad ต้องรอ pending ของทุกสาย — ไม่งั้น PM/RM วาบเป็นขีดก่อนสถานะวัสดุมาถึง");
  // การ์ดสรุป: ไม่รู้ราคา = ขีดพร้อมเหตุ ไม่ใช่ซ่อนยอดเงียบ ๆ (อ่านเหมือน PO ที่ยังไม่ตั้งราคา)
  const [summary] = ast.elements("DocumentSummaryCard");
  assert.ok(summary && reads(ast, summary.attr("total"), "valueBlocked") && reads(ast, summary.attr("totalCaption"), "valueBlocked"),
    "ยอดบนการ์ดสรุปต้องขึ้นขีด + เหตุ เมื่อไม่มีราคาในมือ");
});

test("กระทบยอด: สี่สายที่ป้อน buildReconMatrix บล็อกกริดทั้งใบ · รายการสินค้าล้มกริดยังอ่านได้ — มูลค่า/ตัวกรอง/ลัง พักพร้อมเหตุ", () => {
  const rel = "app/sahamit/reconcile/page.js";
  const ast = astReader(rel);
  for (const url of ['"/api/sahamit/forecast/rounds"', '"/api/sahamit/po"', '"/api/sahamit/coverage"', '"/api/sahamit/flags"']) {
    const s = sourceForUrl(ast, url);
    assert.equal(ast.field(s, "blocks"), "grid", `${url}: วัตถุดิบของกริด — ขาดก้อนไหนก็เพี้ยนทั้งใบแบบดูไม่ออก`);
    // 🐞 coverage ตอบ 200 [] ทุกวันบน prod — วัดด้วยความยาว = กริดหายทุกวัน
    assert.ok(ast.bindingsOf(s, "empty").has(hookFor(ast, url).b.loaded), `${url}: ความว่างต้องมาจาก loaded`);
  }
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/products"'), "blocks"), "lookup", "รายการสินค้าเป็นของประกอบ — ห้ามซ่อนกริด");
  assertFlag(ast, "gridBlocked", "grid");
  elseOf(rel, "ยังไม่มีข้อมูลให้กระทบยอด", "gridBlocked");
  assertGates(rel, { tag: "TableScroll" }, { must: ["gridBlocked"], mustNot: ["productsBlocked", "productsGap"] }, "กริด (<TableScroll>)");
  assert.ok(ast.readsIn("productsGap").has("ld4"), "ช่องว่างของรายการสินค้าต้องวัดด้วย loaded (ld4) ไม่ใช่ความยาวลิสต์");
  // มูลค่า: ขีด ไม่ใช่ ฿0.00 + "N SKU ไม่มีราคา"
  assert.ok(ast.readsIn("money").has("productsGap") && ast.readsIn("valueNote").has("productsGap"), "มูลค่า/หมายเหตุท้ายแถวต้องรู้ว่าไม่มีราคาในมือ");
  assertUnitGate(ast, rel, "shownUnit");
  // ตัวกรองแบรนด์/ปริมาตร/หมวด (ทุกกลุ่มมาจากรายการสินค้า) — พักให้เห็นพร้อมเหตุข้างปุ่ม ท่าเดียวกับหน้า FC
  assertGates(rel, { tag: "FilterPopover" }, { must: ["productsGap"] }, "<FilterPopover>");
  const [paused, ...more] = ast.elements("Button", { text: "ตัวกรอง" });
  assert.ok(paused && !more.length && paused.attr("disabled"), "ตัวกรองที่พักต้องเป็นปุ่ม disabled ให้เห็น (ไม่ใช่หายไปเฉย ๆ)");
  assertGates(rel, { literal: "กรองตามแบรนด์/ปริมาตร/หมวดยังไม่ได้" }, { must: ["productsGap"] }, "เหตุข้างตัวกรองที่พัก");
  // หัวก้อนหมวดตอนไม่มีรายการสินค้า = "ยังจัดหมวดไม่ได้" ไม่ใช่ "ไม่ระบุหมวด" (อ่านว่าทะเบียนไม่ได้ตั้งหมวด)
  assert.ok(ast.readsIn("noCategoryLabel").has("productsGap") && ast.memoReads("catGroups").has("noCategoryLabel"),
    "หัวก้อนหมวดของแถวที่หาหมวดไม่เจอต้องมาจาก noCategoryLabel ที่รู้ว่ารายการสินค้าไม่มีในมือ (ตัว callback ของ useMemo ไม่ใช่ deps)");
  // "N SKU ไม่มีราคา" (ทุก SKU ถูกนับว่าไม่มีราคาตอนรายการสินค้าไม่มา) ได้แค่กิ่ง else ของ productsGap
  const skuNote = guardedBy(rel, { literal: "SKU ไม่มีราคา" }, "productsGap");
  assert.ok(skuNote.hits > 0 && skuNote.unguarded === 0, "'N SKU ไม่มีราคา' ต้องอยู่หลัง `productsGap ? … :` — ไม่มีราคาในมือ ≠ ไม่มีราคา");
  // สปินเนอร์รอบแรกรอวัตถุดิบครบ (ไม่งั้นช่องชดเชยวาบเป็น "รอ PO") แต่รอเฉพาะตอนยังไม่เคยมีของ (ไม่งั้นกดชดเชยแล้วกริดกระพริบ)
  const waits = ast.readsIn("gridLoading");
  for (const n of ["l3", "ld3", "l5", "ld5", "l4", "ld4"]) assert.ok(waits.has(n), `gridLoading ต้องอ่าน ${n} — รอบแรกรอการชดเชย/ผลตรวจ/รายการสินค้า เฉพาะตอนยังไม่เคยมีของ`);

  /* 🐞 ลิ้นชักรายละเอียดช่องทับหัวจอทั้งแผ่น: กดยืนยันชดเชย ⇒ รอบโหลดการชดเชยล้ม ⇒ ลิ้นชักยังเสนอคำแนะนำเดิม โดยไม่มีป้าย
        ⇒ กดซ้ำ = POST ใบที่สอง (ตารางไม่มี unique) FC ย้ายซ้ำ · ป้ายต้องตามเข้าไป และปุ่มยืนยัน/ลบพักพร้อมเหตุ */
  const [drawer, ...moreDrawers] = ast.elements("CellDetailModal");
  assert.ok(drawer && !moreDrawers.length, "หา <CellDetailModal> ไม่เจอ/เจอซ้ำ — ตัวตรวจล้าสมัย?");
  assert.ok(reads(ast, drawer.attr("notice"), "notice"), "ลิ้นชักต้องได้ป้ายตัวเดียวกับหัวจอ (มีปุ่มลองใหม่) — ป้ายที่อยู่หลังลิ้นชักไม่มีใครเห็น");
  assert.ok(reads(ast, drawer.attr("coveragePausedReason"), "coveragePausedReason"), "ลิ้นชักต้องได้เหตุที่ปุ่มยืนยัน/ลบการชดเชยพัก");
  const pausedBy = ast.readsIn("coveragePausedReason");
  for (const n of ["e3", "s3", "l3"]) {
    assert.ok(pausedBy.has(n), `coveragePausedReason ต้องอ่าน ${n} — ล้มทั้งสองรอบ และช่วงรอรอบใหม่หลังกดยืนยัน = รายการชดเชยในมือเก่า`);
  }
  const drawerAst = astReader("components/sahamit/CellDetailModal.js");
  const [sheet] = drawerAst.elements("Modal");
  assert.ok(sheet && drawerAst.rendersAsChild(sheet.path, sheet.path.scope.getBinding("notice")), "CellDetailModal ต้องวาด {notice} ในลิ้นชัก");
  const [panelEl] = drawerAst.elements("CoveragePanel");
  assert.ok(panelEl && drawerAst.rendersIn(panelEl.attr("pausedReason"), sheet.path.scope.getBinding("coveragePausedReason")),
    "CoveragePanel ต้องได้ coveragePausedReason ต่อจากลิ้นชัก");
  const panelAst = astReader("components/sahamit/CoveragePanel.js");
  const [confirmBtn] = panelAst.elements("button", { text: "ยืนยัน" });
  const [removeBtn] = panelAst.elements("button", { text: "✕" });
  assert.ok(confirmBtn && removeBtn, "หาปุ่มยืนยัน/ลบการชดเชยไม่เจอ — ตัวตรวจล้าสมัย?");
  const pausedReason = confirmBtn.path.scope.getBinding("pausedReason");
  for (const [what, btn] of [["ยืนยัน", confirmBtn], ["ลบ (✕)", removeBtn]]) {
    assert.ok(panelAst.rendersIn(btn.attr("disabled"), pausedReason) && panelAst.rendersIn(btn.attr("title"), pausedReason),
      `ปุ่ม${what}การชดเชยต้องพัก (disabled) และบอกเหตุ (title) จาก pausedReason`);
  }
  assert.ok(panelAst.rendersAsChild(panelAst.mainReturn(), pausedReason), "เหตุที่ปุ่มพักต้องมองเห็นในแผง ไม่ใช่แค่ title (ติดด่าน = โชว์แล้วบอกเหตุ)");
  assert.ok(panelAst.readsIn("applyCoverage").has("pausedReason") && panelAst.readsIn("remove").has("pausedReason"),
    "applyCoverage/remove ต้องมีด่านซ้ำ — คลิกที่ค้างมาก่อนสายล้มต้องไม่ยิงบนรายการเก่า");

  // 🐞 โหมดเต็มจอ (`.recon-fs` fixed เต็มจอ) บังป้ายหัวจอ ⇒ staleError ระหว่างเต็มจอเงียบ — ป้ายต้องอยู่ในแผ่นเต็มจอด้วย
  const [fs, ...moreFs] = ast.elements("div", { where: { className: 'expanded ? "recon-fs" : undefined' } });
  assert.ok(fs && !moreFs.length, "หาแผ่นเต็มจอ (.recon-fs) ไม่เจอ — ตัวตรวจล้าสมัย?");
  assert.ok(ast.rendersIn(fs.path, ast.bindingNamed("notice")), "แผ่นเต็มจอต้องวาดป้าย (notice) — ป้ายหัวจออยู่ใต้แผ่นนี้");
});

test("วัสดุ: รายการสินค้าล้มไม่ซ่อนตาราง/การ์ดนับ · บรรทัด PO ไม่เคยโหลดขึ้นห้ามตอบ 'ยังไม่มีบรรทัด PO'", () => {
  const rel = "app/sahamit/material/page.js";
  const ast = astReader(rel);
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/material"'), "blocks"), "page");
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/products"'), "blocks"), "lookup");
  assertFlag(ast, "pageBlocked", "page");
  elseOf(rel, "ยังไม่มีบรรทัด PO ให้ติดตาม", "pageBlocked");
  // ตัวแปรทุกตัวของฮุกรายการสินค้า — ตาราง/การ์ดห้ามถูกคุมด้วยตัวไหนเลย (บันทึก PM/RM ไม่ได้อ่านรายการสินค้า)
  const productNames = Object.values(hookFor(ast, '"/api/sahamit/products"').b).map((b) => b.identifier.name);
  for (const tag of ["MaterialRow", "Stat"]) assertGates(rel, { tag }, { must: ["pageBlocked"], mustNot: productNames }, `<${tag}>`);
});

test("FC: รอบ FC ไม่ขึ้นห้ามตอบ 'ยังไม่มีรอบ' · สายรองล้มไม่ซ่อนแท็บ — ติ๊กเลือก/สร้างดีล/ลัง/ตัวกรอง พักพร้อมเหตุ · picker AE บอกในโมดัล", () => {
  const rel = "app/sahamit/forecast/page.js";
  const ast = astReader(rel);
  assert.equal(ast.field(sourceForUrl(ast, '"/api/sahamit/forecast/rounds"'), "blocks"), "page");
  for (const url of ['"/api/sahamit/products"', '"/api/sahamit/forecast/mapped-lines"', '"/api/pm/assignable-users"']) {
    assert.equal(ast.field(sourceForUrl(ast, url), "blocks"), "deal", `${url}: สายรอง — พักการสร้างดีล ไม่ใช่ซ่อนจอ`);
  }
  // คนดูอย่างเดียวไม่มีโมดัลสร้างแผน ⇒ ป้ายแดงเรื่อง AE = เหตุผลปลอมของสิ่งที่ไม่มีอยู่ (กติกาเดียวกับ editAvailable ของใบยื่นชำระ)
  assert.equal(ast.failureOf(sourceForUrl(ast, '"/api/pm/assignable-users"')).gate, "canEdit");
  assertFlag(ast, "pageBlocked", "page");
  elseOf(rel, "ยังไม่มีรอบ FC", "pageBlocked");
  assertGates(rel, { tag: "Tabs" }, {
    must: ["pageBlocked"],
    mustNot: ["productsFailed", "mappedFailed", "usersFailed", "dealBlocked", "dealPaused", "productsLoaded", "mappedLoaded", "usersLoaded"],
  }, "<Tabs>");

  // ช่องติ๊ก: ไม่รู้ว่ารายการไหนสร้างดีลแล้ว = ไม่รู้ว่าแถวไหนต้องล็อก ⇒ พักทุกแถว พร้อมเหตุ (หัวตาราง + title)
  const boxes = ast.elements("input", { where: { type: "checkbox" } });
  assert.equal(boxes.length, 3, "ช่องติ๊ก (ทั้งหมด · รายหมวด · รายแถว) — ตัวตรวจล้าสมัย?");
  for (const box of boxes) {
    assert.ok(reads(ast, box.attr("disabled"), "selectPausedReason") && reads(ast, box.attr("title"), "selectPausedReason"),
      "ช่องติ๊กทุกตัวต้องพัก (disabled) และบอกเหตุ (title) จาก selectPausedReason ตัวเดียวกัน");
  }
  assert.ok(ast.readsIn("selectPausedReason").has("mappedLoaded"), "ช่องติ๊กพักตาม loaded ของรายการที่สร้างดีลแล้ว — ไม่ใช่ความยาวลิสต์");
  /* null (= ติ๊กได้) ได้ทางเดียวคือ mappedLoaded — กิ่งอื่นทุกกิ่ง (ล้ม · ยังโหลด) ต้องเป็นเหตุจริง
     🐞 กลายพันธุ์ที่ readsIn ข้างบนปล่อย: กิ่ง "ยังโหลด" คืน null ⇒ ช่องติ๊กเปิดก่อนรู้ว่าแถวไหนสร้างดีลแล้ว */
  const sel = ast.initPath("selectPausedReason");
  assert.ok(sel?.isConditionalExpression() && sel.get("test").isIdentifier({ name: "mappedLoaded" }) && sel.get("consequent").isNullLiteral(),
    "selectPausedReason ต้องเป็น `mappedLoaded ? null : <เหตุ>`");
  const leaves = (p) => (p.isConditionalExpression() ? [...leaves(p.get("consequent")), ...leaves(p.get("alternate"))] : [p]);
  assert.ok(leaves(sel.get("alternate")).every((p) => (p.isStringLiteral() && p.node.value.trim()) || p.isTemplateLiteral()),
    "ทุกกิ่งตอนยังไม่มีรายการที่สร้างดีลแล้วในมือ ต้องเป็นข้อความเหตุ — null/ว่าง = ช่องติ๊กเปิดบนตัวล็อกที่ไม่รู้");
  assertGates(rel, { literal: "ติ๊กเลือกรายการ (สินค้า×เดือน)" }, { must: ["selectPausedReason"] }, "คำแนะนำการติ๊ก (ที่ของเหตุผลตอนพัก)");

  // ปุ่มสร้างดีลในโมดัล: พัก (disabled) + เหตุที่มองเห็นในโมดัลเดียวกัน + ด่านซ้ำในตัวฟังก์ชัน
  const [submit, ...extraSubmit] = ast.elements("button", { where: { onClick: "createDeal" } });
  assert.ok(submit && !extraSubmit.length, "ปุ่มสร้างดีลต้องมีตัวเดียว — ตัวตรวจล้าสมัย?");
  assert.ok(reads(ast, submit.attr("disabled"), "dealPaused"), "ปุ่มสร้างดีลต้องพักเมื่อสายที่ใช้สร้างไม่มีในมือ");
  assert.ok(ast.readsIn("dealPaused").has("dealBlocked") && ast.readsIn("dealPaused").has("dealPending"), "พักทั้งตอนล้มและตอนยังโหลดไม่เสร็จ");
  assert.ok(ast.readsIn("submitPausedReason").has("dealPausedReason"), "เหตุผลที่โชว์ต้องเป็นตัวเดียวกับที่พักปุ่ม");
  assert.ok(ast.readsIn("createDeal").has("dealPaused"), "createDeal ต้องมีด่านซ้ำ — ทางเข้าอื่น (Enter) ต้องไม่ยิงด้วยข้อมูลครึ่งเดียว");
  const [modal] = ast.elements("Modal", { where: { title: "สร้างแผนการขายจาก Forecast" } });
  assert.ok(modal, "หาโมดัลสร้างแผนไม่เจอ — ตัวตรวจล้าสมัย?");
  assert.ok(ast.rendersAsChild(modal.path, ast.bindingNamed("notice")),
    "โมดัลทับป้ายหัวจอ และเป็นที่เดียวที่ใช้รายชื่อ AE ⇒ ป้าย (+ ปุ่มลองใหม่) ต้องอยู่ในโมดัลด้วย");
  assert.ok(ast.rendersAsChild(modal.path, ast.bindingNamed("submitPausedReason")), "เหตุที่ปุ่มสร้างพักต้องมองเห็นในโมดัล");
  // 🐞 ทรงเดิม: รายชื่อ AE ล้ม ⇒ "— ไม่มี AE —" (อ่านว่าไม่มีคนให้เลือก)
  assertGates(rel, { literal: "— ไม่มี AE —" }, { must: ["usersLoaded"] }, "ตัวเลือก '— ไม่มี AE —'");

  // ของที่อ่านจากทะเบียนสินค้า: มูลค่า/ไม่มีราคา · ลัง · ตัวกรองหมวด
  /* แถวรวม + แถบที่เลือก + โมดัล — "(มูลค่า = 0)" ทุกแถวข้างปุ่มสร้างดีล คือคำเตือนปลอมเมื่อทะเบียนไม่มา
     ⚠️ กิ่ง then ของ `productsLoaded ? … :` ไม่ใช่แค่ "มีทางแยกที่อ่าน productsLoaded" — ทุกตัวอยู่ใต้ `(!productsLoaded || …) &&`
        ซึ่งอ่านธงตัวเดียวกันแต่กลับด้าน (กลายพันธุ์ "ขึ้นคำเตือนเสมอ" เคยเขียว) */
  for (const literal of ["SKU ไม่มีราคา", "รายการไม่มีราคา", "(มูลค่า = 0)"]) thenOf(rel, literal, "productsLoaded");
  /* ยอดเงินทุกจุดผ่าน `money` ตัวเดียว (ท่าเดียวกับหน้ากระทบยอด) — 🐞 ทางแยก `productsLoaded ? nfBaht(…) : NA` ที่เขียนซ้ำ
     ห้าจุด ถอดจุดไหนก็กลับเป็น ฿0.00 โดยด่านเขียว ⇒ ตรึงว่า nfBaht ถูกเรียกใน money เท่านั้น */
  assert.ok(ast.readsIn("money").has("productsLoaded"), "money ต้องเป็นขีดเมื่อไม่มีทะเบียนสินค้าในมือ");
  const baht = ast.calls("nfBaht");
  assert.ok(baht.length > 0, "หาจุดเรียก nfBaht ไม่เจอ — ตัวตรวจล้าสมัย?");
  assert.deepEqual(baht.filter((c) => !ast.within(c, "money")).map((c) => ast.textOf(c.node)), [],
    "ยอดเงินต้องผ่าน money(…) — nfBaht(…) ตรง ๆ = ฿0.00 ตอนทะเบียนสินค้าไม่มา");
  // หมวด/คำค้นที่อ่านทะเบียนสินค้า — ไม่รู้ ≠ "ไม่ระบุหมวด" / "ไม่พบสินค้า"
  assert.ok(ast.readsIn("missingCategory").has("productsLoaded"), "หมวดที่หาไม่เจอต้องรู้ว่าทะเบียนสินค้าไม่มีในมือ (ยังไม่รู้หมวด ≠ ไม่ระบุหมวด)");
  // lineList เป็น useMemo — ถามตัว callback ไม่ใช่ deps (ชื่อใน deps ไม่ได้แปลว่าถูกใช้)
  assert.ok(ast.readsIn("catOf").has("missingCategory") && ast.memoReads("lineList").has("missingCategory"),
    'catOf / lineList ต้องตกหมวดผ่าน missingCategory ไม่ใช่ค่าคงที่ "ไม่ระบุหมวด"');
  assert.ok(ast.readsIn("noMatchText").has("productsLoaded"), "ค้นไม่เจอตอนทะเบียนไม่มา ต้องบอกว่าค้นชื่อจากทะเบียนไม่ได้ ไม่ใช่ 'ไม่พบสินค้า'");
  assertUnitGate(ast, rel, "unit");
  assertGates(rel, { tag: "FilterPopover" }, { must: ["productsLoaded"] }, "<FilterPopover> (ตัวเลือกหมวดมาจากทะเบียนสินค้า)");
  const [paused] = ast.elements("Button", { text: "ตัวกรอง" });
  assert.ok(paused && paused.attr("disabled"), "ตัวกรองหมวดที่พักต้องเป็นปุ่ม disabled ให้เห็น พร้อมเหตุข้างปุ่ม");
  assertGates(rel, { literal: "กรองตามหมวดยังไม่ได้" }, { must: ["productsLoaded"] }, "เหตุข้างตัวกรองที่พัก");
});

/* สองหน้ารายการภาษี — picker ลูกค้าโหลดตอนกางตัวกรอง (508 แถว) · ล้มแล้วแผงขึ้น "ไม่มีตัวเลือก" เอง
   (FilterPopover ยังไม่มีช่องบอกเหตุรายกลุ่ม) ⇒ หัวหมวดต้องบอกสถานะแทน และตารางต้องไม่หลบเพราะ picker */
const assertCustomerFilter = (ast, rel) => {
  const [group, ...more] = ast.objectsWhere("key", "customer");
  assert.ok(group && !more.length, `${rel}: หากลุ่มตัวกรองลูกค้าไม่เจอ — ตัวตรวจล้าสมัย?`);
  assert.equal(group.label, "customerGroupLabel", `${rel}: หัวหมวดลูกค้าต้องบอกสถานะ (ดึงไม่ได้/กำลังโหลด) — แผงลอยทับป้ายตอนกาง`);
  const label = ast.readsIn("customerGroupLabel");
  assert.ok(label.has("customersLoaded") && label.has("filterBlocked"), `${rel}: หัวหมวดต้องอ่าน loaded + ธงของสาย picker`);
};

test("ใบยื่นชำระ (รายการ): picker ลูกค้าล้มไม่ซ่อนตาราง · หัวหมวดตัวกรองบอกเหตุ · จำนวนไม่อ้าง 0 ตอนไม่เคยโหลดขึ้น", () => {
  const rel = "app/tax/filings/page.js";
  const ast = astReader(rel);
  assert.equal(ast.field(sourceForUrl(ast, '"/api/orders"'), "blocks"), "list");
  assert.equal(ast.field(sourceForUrl(ast, 'customersReady ? "/api/customers" : null'), "blocks"), "filter");
  assertFlag(ast, "listBlocked", "list");
  assertFlag(ast, "filterBlocked", "filter");
  assertGates(rel, { tag: "DataList" }, { must: ["listBlocked"], mustNot: ["filterBlocked", "customersLoaded", "customersError", "customersStale"] }, "<DataList>");
  assertCustomerFilter(ast, rel);
  // ป้ายจำนวน: ขีด = ไม่เคยโหลดสำเร็จ · `200 []` = 0 ใบจริง ⇒ ห้ามกลับไปนับความยาวลิสต์
  assert.ok(ast.readsIn("noData").has("ordersLoaded") && !ast.readsIn("noData").has("orders"), "noData ต้องมาจาก loaded ไม่ใช่ orders.length");
});

test("ขึ้นทะเบียน (รายการ): picker ล้มไม่ซ่อนตาราง · ฟอร์มสร้างไม่เปิดบนข้อมูลครึ่งเดียว — โมดัลหัวเดียวกันบอกเหตุ + ลองใหม่", () => {
  const rel = "app/tax/registrations/page.js";
  const ast = astReader(rel);
  assert.equal(ast.field(sourceForUrl(ast, '"/api/excise-registrations?view=queue"'), "blocks"), "list");
  const products = sourceForUrl(ast, 'pickerReady ? "/api/products" : null');
  assert.equal(ast.field(products, "blocks"), "form");
  // pickerReady ตัวเดียวกันเปิดตอนกางตัวกรอง ⇒ คนดูอย่างเดียวต้องไม่เจอ "ยังสร้างทะเบียนไม่ได้" ของปุ่มที่ตัวเองไม่มี
  assert.equal(ast.failureOf(products).gate, "canEdit");
  assert.equal(ast.field(sourceForUrl(ast, 'pickerReady ? "/api/customers" : null'), "blocks"), "filter");
  assertFlag(ast, "listBlocked", "list");
  assertFlag(ast, "filterBlocked", "filter");
  assertGates(rel, { tag: "DataList" }, { must: ["listBlocked"], mustNot: ["filterBlocked", "formReady", "customersLoaded", "productsLoaded"] }, "<DataList>");
  assertCustomerFilter(ast, rel);
  assert.ok(ast.readsIn("noData").has("regsLoaded") && !ast.readsIn("noData").has("regs"), "noData ต้องมาจาก loaded ไม่ใช่ regs.length");
  // ฟอร์มจริงเปิดเมื่อทุกสายที่มันกินเคยโหลดสำเร็จ · ระหว่างนั้นโมดัลหัวเดียวกันวางป้าย (ปุ่มบันทึกไม่มีให้กด)
  /* ตรึงนิยามทั้งก้อน ไม่ใช่แค่ "อ่าน sources" — 🐞 กลายพันธุ์ที่ readsIn ปล่อย: `s.empty && s.error` (ฟอร์มเปิดระหว่าง picker
     ยังโหลด = บั๊กเดิม "ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน") · `s.empty && s.blocks === "form"` (ลูกค้าล้มแล้วฟอร์มยังเปิด) */
  assert.equal(ast.initText("formReady"), "!sources.some((s) => s.empty)",
    "formReady = ไม่มีสายไหนไม่เคยโหลดสำเร็จ (ทั้งล้มและยังโหลด) — ทุกสายของจอนี้ป้อนฟอร์มสร้าง");
  // บรรทัด "กำลังโหลด…" ของโมดัลแทนฟอร์ม ได้แค่กิ่ง else ของความล้ม — ล้มแล้วต้องเป็นป้าย (มีลองใหม่) ไม่ใช่ "กำลังโหลด" ตลอดกาล
  elseOf(rel, "กำลังโหลดข้อมูลที่ฟอร์ม", "blocked.length");
  const [form] = ast.elements("RegistrationFormModal");
  assert.ok(form && reads(ast, form.attr("open"), "formReady"), "RegistrationFormModal ต้องเปิดเมื่อ formReady เท่านั้น — เดิมเปิดทันทีแล้วขึ้น 'ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน'");
  const [gate] = ast.elements("Modal", { where: { title: "สร้างทะเบียน (ร่าง)" } });
  assert.ok(gate && reads(ast, gate.attr("open"), "formReady"), "ต้องมีโมดัลหัวเดียวกับฟอร์มที่เปิดแทนตอนยังไม่ครบ");
  assert.ok(ast.rendersIn(gate.path, ast.bindingNamed("notice")), "โมดัลแทนต้องวางป้ายตัวเดียวกัน (มีปุ่มลองใหม่) — picker ล้มต้องบอกตรงที่ใช้มัน");
});

test("ขึ้นทะเบียน (รายละเอียด): โหลดใบไม่ขึ้นห้ามตอบ 'ไม่พบ' · picker ล้มไม่ซ่อนหน้า แต่ฟอร์มแก้ไขไม่เปิดบนข้อมูลครึ่งเดียว", () => {
  const rel = "app/tax/registrations/[id]/page.js";
  const ast = astReader(rel);
  // 🐞 ทรงเดิม: 500/เน็ตหลุด ⇒ "ไม่พบรายการ · ทะเบียนนี้อาจถูกลบไปแล้ว" + ข้อความดิบเป็นตัวเนื้อ
  elseOf(rel, "ไม่พบทะเบียนที่ต้องการ", "pageBlocked");
  const pages = ast.sourcePaths().filter((s) => ast.field(s, "blocks") === "page");
  assert.equal(pages.length, 1, "สายที่บล็อกทั้งหน้ามีได้สายเดียว คือตัวใบเอง");
  assert.ok(ast.field(pages[0], "empty").startsWith("!s &&"), "สายใบต้องวัดด้วยใบนี้ (`!s && …`)");
  const recordEmpty = ast.bindingsOf(pages[0], "empty");
  assert.ok(recordEmpty.has(ast.bindingNamed("recordError")) && !recordEmpty.has(ast.bindingNamed("recordStale")),
    "ความว่างของสายใบอ่านรอบหน้าบ้าน (recordError) ไม่ใช่รอบเบื้องหลัง — 404 ที่ยืนยันแล้วต้องไม่พลิกเป็น 'ไม่ได้แปลว่าถูกลบ'");
  /* ── ตัวโหลดใบ (`load` · apiFetch ไม่ใช่ useApiList) — ด่านรายฮุกของ DETAIL_PAGES มองไม่เห็นมัน
     🐞 สามกลายพันธุ์ที่เคยเขียว: ถอดกิ่ง 404 (ใบที่ถูกลบจริงได้ "ไม่ได้แปลว่าถูกลบ" = เท็จ) · รอบเบื้องหลังล้มแล้วทิ้ง
        (`if (!opts?.background) setRecordFault(fault)` = ทรงเงียบ 26 วันตัวเดิม) · `recordDetail = null` (ข้อความดิบหาย) */
  const { left: recordLeft, right: recordRight } = ast.failureOf(pages[0]);
  assert.ok(recordLeft === ast.bindingNamed("recordError") && recordRight === ast.bindingNamed("recordStale"),
    "สายใบต้องเป็น `recordError || recordStale` — รอบเบื้องหลังที่ล้มต้องถึงป้าย");
  assert.ok(ast.readsIn("recordError").has("recordFault") && ast.readsIn("recordStale").has("recordStaleFault"),
    "recordError/recordStale ต้องมาจากสองช่องของตัวโหลด (รอบหน้าบ้าน · รอบเบื้องหลัง)");
  const recordDetailReads = ast.readsIn("recordDetail");
  assert.ok(recordDetailReads.has("recordFault") && recordDetailReads.has("recordStaleFault")
    && ast.bindingsOf(pages[0], "detail").has(ast.bindingNamed("recordDetail")),
    "บรรทัดรองของสายใบต้องมาจากความล้มทั้งสองช่อง — ข้อความดิบคือตัวไขคดี");
  const loadIfs = [];
  ast.initPath("load")?.traverse({ IfStatement(p) { loadIfs.push(p); } });
  const gone = loadIfs.filter((p) => ast.textOf(p.node.test).includes("404"));
  assert.equal(gone.length, 1, "ตัวโหลดต้องมีกิ่ง 404 กิ่งเดียว — 404 = ไม่มีใบนี้จริง ไม่ใช่ความล้ม");
  assert.equal(ast.textOf(gone[0].node.test), "res.status === 404 && !opts?.background",
    "404 ของรอบเบื้องหลัง (ใบถูกลบระหว่างเปิดค้าง) ต้องไม่พลิกจอทิ้ง — ของบนจอยังอยู่ ป้ายบอกว่าเป็นรอบก่อน");
  const faultSets = [];
  gone[0].get("consequent").traverse({
    CallExpression(p) { if (/^setRecord(Stale)?Fault$/.test(p.node.callee.name ?? "")) faultSets.push(p); },
  });
  assert.ok(faultSets.length > 0 && faultSets.every((c) => c.get("arguments")[0]?.isNullLiteral()),
    "กิ่ง 404 ต้องล้างความล้ม (null) ไม่ใช่ตั้ง — จอไปทาง 'ไม่พบรายการ' ไม่ใช่ป้ายแดง");
  assert.ok(loadIfs.some((p) => ast.textOf(p.node.test) === "opts?.background"
    && ast.textOf(p.node.consequent) === "setRecordStaleFault(fault);"
    && p.node.alternate && ast.textOf(p.node.alternate) === "setRecordFault(fault);"),
    "ความล้มต้องลงช่องตามรอบ: `if (opts?.background) setRecordStaleFault(fault); else setRecordFault(fault);` (ทรงเดียวกับ useApiList)");
  for (const url of ['pickerReady ? "/api/products" : null', 'pickerReady ? "/api/customers" : null', 'pickerReady ? "/api/excise-registrations" : null']) {
    const h = hookFor(ast, url);
    const s = sourceForUrl(ast, url);
    assert.equal(ast.field(s, "blocks"), "edit", `${url}: ป้อนแค่ฟอร์มแก้ไข — ซ่อนหน้าเพราะมันล้ม = เสียจอที่ยังถูกอยู่`);
    assert.equal(ast.failureOf(s).gate, "editAvailable", `${url}: พูดเฉพาะตอนคนดูมีปุ่มแก้ไขจริง`);
    const pending = ast.bindingsOf(s, "pending");
    assert.ok(pending.has(h.b.loading) && pending.has(h.b.loaded), `${url}: pending ต้องมาจาก loading + !loaded ของฮุกตัวเอง`);
  }
  assertFlag(ast, "pageBlocked", "page");
  assertGates(rel, { tag: "DetailPageLayout" }, { mustNot: ["editBlocked", "editReady", "editAvailable"] }, "<DetailPageLayout>");
  assert.ok(ast.readsIn("editAvailable").has("canEdit") && ast.readsIn("editAvailable").has("s"), "editAvailable = สิทธิ์ + สถานะใบ (เงื่อนไขเดียวกับปุ่มแก้ไข)");
  assert.ok(ast.readsIn("said").has("editBlocked"), "said ต้องตัด staleNote ของสายรองเมื่อมีสายรองพักฟอร์มแล้ว — 'ยังแก้ไม่ได้' คู่ 'จะใช้รอบก่อน' ขัดกันเอง");
  const [form] = ast.elements("RegistrationFormModal");
  assert.ok(form && reads(ast, form.attr("open"), "editReady"), "ฟอร์มแก้ไขต้องเปิดเมื่อ editReady เท่านั้น");
  // ตรึงนิยามทั้งก้อน (เหตุผลเดียวกับ formReady ของหน้ารายการ) — `… && s.error` = ฟอร์มเปิดระหว่าง picker ยังโหลด
  assert.equal(ast.initText("editReady"), '!sources.some((s) => s.blocks === "edit" && s.empty)',
    "editReady = ไม่มีสาย picker ของฟอร์มแก้ไขที่ไม่เคยโหลดสำเร็จ (ทั้งล้มและยังโหลด)");
  elseOf(rel, "กำลังโหลดข้อมูลที่ฟอร์ม", "editBlocked.length");
  const [gate] = ast.elements("Modal", { where: { title: "แก้ไขการขึ้นทะเบียน" } });
  assert.ok(gate && reads(ast, gate.attr("open"), "editReady") && reads(ast, gate.attr("open"), "editAvailable"),
    "โมดัลแทนต้องเปิดเฉพาะตอนมีปุ่มแก้ไขจริงและฟอร์มยังไม่พร้อม");
  assert.ok(ast.rendersIn(gate.path, ast.bindingNamed("notice")), "โมดัลแทนต้องวางป้ายตัวเดียวกัน (มีปุ่มลองใหม่)");
});

/* ── ขึ้นทะเบียน (รายละเอียด): ผลตรวจเอกสารบังคับ (`/requirements`) ─────────────────────────────────────────
   ยิงด้วย apiFetch ตรง ๆ ไม่ผ่าน useApiList ⇒ ด่านรายฮุกข้างบนมองไม่เห็นมันเลย
   🐞 ทรงเดิม (25/09 "แก้หน้าทะเบียนต่อ"): `.then((r) => (r.ok ? r.json() : null)) … .catch(() => {})` ⇒ 500/เน็ตหลุดเงียบสนิท
      · แถว "เอกสารบังคับ" ค้าง "กำลังตรวจ" ตลอดไป — หรือเคยตรวจได้แล้ว ยืนยันผลรอบก่อนเหมือนเป็นผลล่าสุด
      · ปุ่ม "ยื่นขึ้นทะเบียน" พักด้วยเหตุ `ต้องแนบ: ` ที่ว่างเปล่า (ลิสต์ที่ขาดมาจากผลที่ไม่มีอยู่)
      · checklist ของฉบับร่างหายไปด้วย (`req &&`) = ความล้มลบคำอธิบายเดียวที่จอมีทิ้ง
   ⚠️ ผ่านการกลายพันธุ์บนสำเนา src นอก worktree แล้ว (30 ทรง แดงครบ ด้วยข้อความของข้อที่ตั้งใจจับ):
      · ทรงเดิม — คืน `.catch(() => {})` · คืนเหตุ `!req?.ready ? "ต้องแนบ: …"` · ถอด `if (!isLatest()) return;` หรือย้าย setState
        ขึ้นไปก่อนมัน · ปุ่มลองใหม่ยิงเองไม่ผ่าน checkRequirements · แถวสรุปกลับเป็น `req ? … : "กำลังตรวจ"` · checklist กลับไปอ่าน `req` ·
        ป้ายผูกกับ `s.status === "draft"` · ถอดตัวตรวจรูปผล · httpLoadFailure ไม่อ่าน body
      · แยกแล้วไม่เก็บ (รีวิวรอบสองจับได้ — ด่านเดิมเขียว): `thrownLoadFailure(e);` · `void httpLoadFailure(…)` · `setReqFault(null)` ·
        `fault = null` ก่อนด่านรอบ · `setReq(req)` · ถอด `verdict = body`
      · ปุ่มยื่นหลวม (ด่านเดิมเขียว): เหตุของกิ่งไม่รู้ผลเป็น `null`/`""` · ทั้งกิ่ง `!reqCurrent ?` เป็น null · `disabled: !submitBlocker` ·
        `disabledReason: undefined` · `!reqCurrent.ready ? null` · reqCurrent ไม่ดู/กลับด้าน reqChecking
      · รอบใหม่ไม่ติดสถานะบิน (ด่านเดิมเขียว): ถอด `setReqChecking(true);` · ถอด attachItems/custItems จาก deps ของ effect ·
        ถอด regId จาก deps ของ useCallback */
test("ขึ้นทะเบียน (รายละเอียด): ตรวจเอกสารบังคับไม่ได้ต้องบอก — ไม่ค้าง 'กำลังตรวจ' · ไม่พัก 'ต้องแนบ: ' เปล่า · คำตอบเก่าไม่ทับรอบใหม่", () => {
  const rel = "app/tax/registrations/[id]/page.js";
  const source = read(rel);
  const ast = astReader(rel);
  const check = ast.initPath("checkRequirements");
  assert.ok(check?.isCallExpression(), `${rel}: ไม่พบ \`const checkRequirements = useCallback(…)\` — ตัวตรวจล้าสมัย?`);
  // state ที่แกะด้วย `const [x, setX] = useState(…)` — bindingNamed เห็นแต่ `const x = …` ⇒ หา binding จาก scope ของคอมโพเนนต์
  const readsState = (path, name) => ast.rendersIn(path, check.scope.getBinding(name) ?? null);
  // ข้อความที่จริงได้เฉพาะตอน `guard` เป็นจริง — ทุกตัวต้องอยู่กิ่ง then ของ `guard ? … :` (ทรงเดียวกับ thenOf แต่บอกเหตุของจอนี้)
  const onlyWhen = (literal, guard, why) => {
    const { hits, unguarded } = guardedBy(rel, { literal }, guard, "consequent");
    assert.ok(hits > 0, `${rel}: หา '${literal}' ไม่เจอ — ตัวตรวจล้าสมัย?`);
    assert.equal(unguarded, 0, `'${literal}' ต้องอยู่กิ่ง then ของ \`${guard} ? … :\` — ${why}`);
  };

  // ① ไม่มีที่กลืนความล้มทิ้งเงียบ ๆ ทั้งจอ — `.catch(() => {})` · `catch {}` ว่าง (ทรงที่ทำให้แถวสรุปค้าง "กำลังตรวจ")
  const swallowed = [];
  traverse(parse(source, { sourceType: "module", plugins: ["jsx"] }), {
    CallExpression(p) {
      const { callee, arguments: [cb] } = p.node;
      if (callee.type === "MemberExpression" && !callee.computed && callee.property.name === "catch"
        && (cb?.type === "ArrowFunctionExpression" || cb?.type === "FunctionExpression")
        && cb.body.type === "BlockStatement" && !cb.body.body.length) swallowed.push(source.slice(p.node.start, p.node.end).slice(0, 60));
    },
    CatchClause(p) { if (!p.node.body.body.length) swallowed.push("catch {}"); },
  });
  assert.deepEqual(swallowed, [], `${rel}: มีจุดกลืนความล้มทิ้งเงียบ ๆ — ตรวจเอกสารบังคับไม่ได้ต้องถึงป้าย ไม่ใช่ค้าง "กำลังตรวจ"`);

  // ② ยิงที่เดียว (checkRequirements) · ความล้มผ่านตัวแยกกลาง (ไทยนำ + ดิบเป็นบรรทัดรอง) · อ่าน body ของคำตอบที่ไม่ ok
  const fetches = ast.calls("apiFetch").filter((c) => ast.textOf(c.node.arguments[0]).includes("/requirements"));
  assert.ok(fetches.length === 1 && ast.within(fetches[0], "checkRequirements"),
    "ผลตรวจเอกสารบังคับต้องยิงที่ checkRequirements ที่เดียว — ทางเข้าที่สอง (ลองใหม่/effect แยก) ไม่ผ่านตัวนับรอบ");
  const inCheck = (name) => ast.calls(name).filter((c) => ast.within(c, "checkRequirements"));
  const [http] = inCheck("httpLoadFailure");
  let readsBody = false;
  if (http?.node.arguments[1]) {
    http.get("arguments.1").traverse({ CallExpression(c) { if (c.node.callee.property?.name === "json") readsBody = true; } });
  }
  assert.ok(readsBody, "คำตอบที่ไม่ ok ต้องผ่าน httpLoadFailure(status, <ช่อง error ของ body>) — ข้อความดิบของ server คือตัวไขคดี");
  const thrown = inCheck("thrownLoadFailure");
  assert.ok(thrown.length && thrown.every((c) => c.findParent((p) => p.isCatchClause())),
    "ของที่ถูกโยน (เน็ตหลุด · body อ่านไม่ได้) ต้องผ่าน thrownLoadFailure ใน catch");
  /* ความล้มที่แยกแล้วต้อง **ถูกเก็บ** — เรียกตัวแยกทิ้งเปล่า ๆ (`thrownLoadFailure(e);` · `void httpLoadFailure(…)`) ผ่านสองข้อบนได้
     ทั้งที่ 500/เน็ตหลุดไม่ตั้งอะไรเลย ⇒ มีผลในมือ = ผลรอบก่อนกลับมาอ่านเป็นผลปัจจุบัน (บั๊กตัวเดิม) · ไม่มีผล = ปุ่มยื่นชี้ไปหาป้ายที่ไม่ขึ้น
     ⇒ `let fault` ของตัวตรวจเขียนได้จากตัวแยกสองตัวนี้เท่านั้น และทุกการเรียกตัวแยกต้องเป็นฝั่งขวาของ `fault = …` */
  const checkFn = check.get("arguments.0");
  const faultBinding = checkFn.scope.getBinding("fault");
  assert.ok(faultBinding?.kind === "let" && ast.within(faultBinding.path, "checkRequirements"),
    "checkRequirements ต้องเก็บความล้มของรอบไว้ใน `let fault` ของตัวเอง — ตัวตรวจล้าสมัย?");
  const classified = [http, ...thrown].filter(Boolean);
  for (const c of classified) {
    const assign = c.parentPath;
    assert.ok(c.key === "right" && assign.isAssignmentExpression({ operator: "=" }) && assign.get("left").isIdentifier()
      && assign.scope.getBinding(assign.node.left.name) === faultBinding,
      `\`${ast.textOf(c.node).slice(0, 40)}…\` ต้องเป็น \`fault = …\` — แยกแล้วทิ้ง = ความล้มไม่ถึงป้าย`);
  }
  assert.ok(inCheck("httpLoadFailure").length === 1 && faultBinding.constantViolations.length === classified.length
    && faultBinding.constantViolations.every((v) => classified.some((c) => c.parent === v.node)),
    "`fault` เขียนได้จาก httpLoadFailure/thrownLoadFailure เท่านั้น — `fault = null` ตรงไหนก็ลบความล้มของรอบนี้ทิ้ง");
  // ผลที่ ready ไม่ตรงกับลิสต์ที่ขาด (`{ ready: false, missing: [] }` ของใบที่หายระหว่างตรวจ) ห้ามผ่านเป็นผล
  const usable = ast.initText("usable") ?? "";
  assert.ok(usable.includes("body.ready === (body.missing.length === 0)"),
    "ต้องตรวจรูปผลก่อนใช้: ready ต้องตรงกับลิสต์ที่ขาด — ไม่งั้น 'ต้องแนบ: ' เปล่ากลับมาอีกทาง");
  let rejectsUnusable = false;
  check.traverse({ IfStatement(p) { if (ast.textOf(p.node.test) === "!usable" && p.get("consequent").isThrowStatement()) rejectsUnusable = true; } });
  assert.ok(rejectsUnusable, "ผลที่รูปไม่ครบต้องโยนเข้า catch (กลายเป็นความล้มที่ป้ายบอก) ไม่ใช่ข้ามเงียบ ๆ");

  // ③ คำตอบเก่าห้ามทับรอบใหม่ — จองรอบกับตัวนับกลางก่อนยิง แล้วทิ้งคำตอบที่ไม่ใช่รอบล่าสุดก่อนทุก setState ของผล
  assert.equal(ast.initText("startCheckRun"), "useLatestRun()", "ตัวนับรอบต้องเป็นของกลาง (useLatestRun) — ธง alive ของ effect ไม่คุ้มรอบลองใหม่");
  const body = check.get("arguments.0.body");
  assert.ok(body.isBlockStatement(), "checkRequirements ต้องเป็น useCallback(async () => { … }) — ตัวตรวจล้าสมัย?");
  const stmts = body.get("body");
  const reserveAt = stmts.findIndex((st) => ast.textOf(st.node) === "const isLatest = startCheckRun();");
  const fetchAt = stmts.findIndex((st) => {
    let hit = false;
    st.traverse({ CallExpression(c) { if (c.get("callee").isIdentifier({ name: "apiFetch" })) hit = true; } });
    return hit;
  });
  const guardAt = stmts.findIndex((st) => st.isIfStatement() && ast.textOf(st.node.test) === "!isLatest()"
    && st.get("consequent").isReturnStatement());
  assert.ok(reserveAt !== -1 && fetchAt !== -1 && reserveAt < fetchAt, "ต้องจองรอบ (`const isLatest = startCheckRun();`) ก่อนยิง");
  assert.ok(guardAt > fetchAt, "ต้องมี `if (!isLatest()) return;` หลังได้คำตอบ");
  /* ทุกรอบต้องติด "กำลังตรวจ" เองก่อนยิง — `useState(true)` ติดให้แค่รอบแรก ⇒ ถอดบรรทัดนี้ = ตรวจรอบใหม่ (หลังแนบ/ลบไฟล์ · กดลองใหม่)
     ไม่มีสถานะบินเลย: ปุ่มลองใหม่ไม่พัก ไม่ขึ้น "กำลังลองใหม่…" และ reqCurrent ถือผลของไฟล์ชุดก่อนเป็นผลปัจจุบัน (ปุ่มยื่นเดินตามผลเก่า) */
  const armAt = stmts.findIndex((st) => ast.textOf(st.node) === "setReqChecking(true);");
  assert.ok(armAt > reserveAt && armAt < fetchAt,
    "ต้องมี `setReqChecking(true);` ระดับบนสุดของตัวตรวจ ระหว่างจองรอบกับยิง — ไม่งั้นรอบที่สองเป็นต้นไปไม่มีสถานะ 'กำลังตรวจ'");
  const settles = [];
  check.traverse({
    CallExpression(c) {
      const name = c.node.callee.name;
      if (name === "setReq" || name === "setReqFault"
        || (name === "setReqChecking" && c.get("arguments.0").isBooleanLiteral({ value: false }))) settles.push(c);
    },
  });
  assert.ok(new Set(settles.map((c) => c.node.callee.name)).size === 3, "หา setReq / setReqFault / setReqChecking(false) ไม่ครบ — ตัวตรวจล้าสมัย?");
  for (const c of settles) {
    const top = c.find((p) => p.parentPath?.node === body.node);
    assert.ok(top && top.key > guardAt,
      `\`${ast.textOf(c.node)}\` ต้องอยู่หลัง \`if (!isLatest()) return;\` — คำตอบที่มาช้าทับผลของรอบที่ใหม่กว่า (รวมรอบลองใหม่) หรือดับ "กำลังตรวจ" ของรอบที่ยังบินอยู่`);
  }
  // นอก checkRequirements เขียนผลได้แค่การล้าง (ใบเปลี่ยน) — เขียนผลจริงจากที่อื่น = ข้ามตัวนับรอบ
  for (const name of ["setReq", "setReqFault"]) {
    const outside = ast.calls(name).filter((c) => !ast.within(c, "checkRequirements"));
    assert.ok(outside.every((c) => c.get("arguments.0").isNullLiteral()), `${name} นอก checkRequirements ต้องเป็นการล้าง (null) เท่านั้น`);
  }
  /* ของที่ส่งเข้า state ต้องเป็นผลของรอบนี้จริง — ด่านลำดับข้างบนดูแค่ "อยู่หลัง isLatest" ⇒ `setReqFault(null)` / `setReq(req)` ผ่านได้
     ทั้งที่ทิ้งผลทิ้ง: 500 แล้วจอยืนยันผลรอบก่อนเป็นผลปัจจุบัน (บั๊กตัวเดิม) ⇒ ตัวละหนึ่งจุด และอาร์กิวเมนต์คือตัวแปรของรอบนี้ตรง ๆ */
  const handsOver = (setter, name) => {
    const calls = ast.calls(setter).filter((c) => ast.within(c, "checkRequirements"));
    const arg = calls[0]?.get("arguments.0");
    const binding = checkFn.scope.getBinding(name);
    assert.ok(calls.length === 1 && arg?.isIdentifier() && binding && arg.scope.getBinding(arg.node.name) === binding,
      `ตัวตรวจต้องเรียก \`${setter}(${name})\` ที่เดียว — ส่งอย่างอื่นเข้า state = ผลของรอบนี้ไม่ถึงจอ`);
    return binding;
  };
  handsOver("setReqFault", "fault");
  const verdictBinding = handsOver("setReq", "verdict");
  assert.ok(verdictBinding.constantViolations.some((v) => v.isAssignmentExpression() && !v.get("right").isNullLiteral()),
    "`verdict` ต้องได้ค่าจากคำตอบที่ ok — ไม่มีการเขียน = ตรวจผ่านแล้วจอไม่เคยได้ผล");
  // ตรวจใหม่ทุกครั้งที่ไฟล์แนบเปลี่ยน — ถอด attachItems/custItems ออกจาก deps = checklist + ปุ่มยื่นยึดผลก่อนแนบ/ลบไฟล์ไว้จน F5
  const runners = ast.calls("useEffect").filter((c) => {
    let hit = false;
    c.get("arguments.0").traverse({ CallExpression(p) { if (p.get("callee").isIdentifier({ name: "checkRequirements" })) hit = true; } });
    return hit;
  });
  const depsOf = (call) => {
    const deps = call?.get("arguments.1");
    return deps?.isArrayExpression() ? deps.node.elements.map((e) => (e?.type === "Identifier" ? e.name : null)) : [];
  };
  assert.equal(runners.length, 1, "ต้องมี useEffect ตัวเดียวที่เรียก checkRequirements — ตัวตรวจล้าสมัย?");
  for (const name of ["checkRequirements", "attachItems", "custItems"]) {
    assert.ok(depsOf(runners[0]).includes(name), `useEffect ที่เรียก checkRequirements ต้องมี ${name} ใน deps — ไฟล์แนบเปลี่ยนแล้วผลตรวจต้องตามทัน`);
  }
  // ใบเปลี่ยน/ได้ใบมาช้ากว่ารอบแรก — useCallback ที่ไม่ผูก regId จำ `regId = null` ของ commit แรกไว้ตลอด ⇒ ไม่เคยยิง = ค้าง "กำลังตรวจ"
  assert.ok(depsOf(check).includes("regId"), "checkRequirements ต้องมี regId ใน deps — ไม่งั้นตัวตรวจจำใบของ commit แรก (ยังไม่มีใบ) ไว้ตลอด");

  // ④ แถว "เอกสารบังคับ": "กำลังตรวจ" เฉพาะตอนมีรอบบินอยู่ · ล้มแล้วไม่มีผล = "ตรวจไม่ได้" · ผลรอบก่อนบอกว่ารอบก่อน
  const [docsRow] = ast.objectsWhere("id", "documents");
  assert.equal(docsRow?.value, "reqSummary", "แถว 'เอกสารบังคับ' ต้องมาจาก reqSummary");
  onlyWhen("กำลังตรวจ", "reqChecking", "ตรวจล้มแล้วยังขึ้น 'กำลังตรวจ' = ค้างตลอดไป (ทรงเดิม)");
  onlyWhen("ตรวจไม่ได้", "reqFault", "ยังไม่ล้มแล้วขึ้น 'ตรวจไม่ได้' = ความล้มปลอม");
  onlyWhen("ผลรอบก่อน", "reqFault", "ป้าย 'ผลรอบก่อน' ต้องมาจากรอบล่าสุดที่ล้ม");
  assert.equal(ast.initText("reqStale"), "!!req && !!reqFault", "ผลรอบก่อน = มีผลในมือ + รอบล่าสุดล้ม");

  // ⑤ ปุ่มยื่น: อยู่เสมอ พักด้วยเหตุจริง · "ต้องแนบ: …" พูดได้เฉพาะจากผลปัจจุบันที่ไม่ ready (มีรายการขาดเสมอ)
  const [submit] = ast.objectsWhere("id", "submit");
  // ทั้งสองช่องตรงตัว — `!submitBlocker` (กลับด้าน) = กดได้ตอนติด และพักแบบไม่มีเหตุตอนพร้อม · อ่านแค่ชื่อจับทรงนั้นไม่ได้
  assert.equal(submit?.disabled, "!!submitBlocker", "ปุ่ม 'ยื่นขึ้นทะเบียน' ต้องพักเมื่อมีเหตุเท่านั้น (disabled: !!submitBlocker)");
  assert.equal(submit?.disabledReason, "submitBlocker || undefined", "ปุ่มที่พักต้องบอกเหตุตัวเดียวกับที่ทำให้พัก (disabledReason: submitBlocker || undefined)");
  /* ไม่รู้ผล (`!reqCurrent`) = พักพร้อมเหตุเสมอ — ทุกใบของกิ่งนี้ (รวมทางแยกซ้อน) ต้องเป็นประโยคที่ไม่ว่าง
     🐞 `null`/`""` ตรงนี้ = ตรวจล้มแล้วปุ่มยื่น **กดได้** ไม่มีเหตุ (ด่านฝั่งจอหลวมกว่าเดิม) · กดได้ (null) มีทางเดียว: ผลปัจจุบันที่ ready */
  const blocker = ast.initPath("submitBlocker");
  assert.ok(blocker?.isConditionalExpression() && ast.textOf(blocker.node.test) === "!reqCurrent",
    "ต้องมี `const submitBlocker = !reqCurrent ? <เหตุที่ไม่รู้ผล> : …` — ตัวตรวจล้าสมัย?");
  const leavesOf = (p) => (p.isConditionalExpression() ? [...leavesOf(p.get("consequent")), ...leavesOf(p.get("alternate"))] : [p]);
  const saysSomething = (p) => (p.isStringLiteral() && p.node.value.trim() !== "")
    || (p.isTemplateLiteral() && p.node.quasis.some((q) => q.value.cooked.trim() !== ""));
  const unknownLeaves = leavesOf(blocker.get("consequent"));
  assert.ok(unknownLeaves.every(saysSomething),
    `ไม่รู้ผลแล้วปุ่มยื่นต้องพักพร้อมประโยค — เจอ ${unknownLeaves.filter((p) => !saysSomething(p)).map((p) => ast.textOf(p.node)).join(", ")}`);
  assert.ok(unknownLeaves.some((p) => p.isStringLiteral() && p.node.value.includes("ตรวจเอกสารบังคับไม่ได้")),
    "ตรวจล้มแล้วไม่มีผล ปุ่มยื่นต้องบอกว่า 'ตรวจเอกสารบังคับไม่ได้' (พร้อมทางกลับ) ไม่ใช่เงียบ/เหตุอื่น");
  {
    const { hits, unguarded } = guardedBy(rel, { literal: "ตรวจเอกสารบังคับไม่ได้" }, "reqChecking");
    assert.ok(hits > 0 && unguarded === 0, "'ตรวจเอกสารบังคับไม่ได้' ต้องอยู่กิ่ง else ของ `reqChecking ? … :` — รอบที่ยังบินอยู่ไม่ใช่รอบที่ล้ม");
  }
  const opens = leavesOf(blocker).filter((p) => !saysSomething(p));
  assert.ok(opens.length === 1 && opens[0].isNullLiteral() && opens[0].key === "consequent"
    && ast.textOf(opens[0].parentPath.node.test) === "reqCurrent.ready" && opens[0].parentPath.parent === blocker.node,
    "ปุ่มยื่นกดได้ (submitBlocker = null) ทางเดียว: กิ่ง then ของ `reqCurrent.ready ?` ใต้กิ่ง else ของ `!reqCurrent ?`");
  for (const guard of ["!reqCurrent", "reqCurrent.ready"]) {
    const { hits, unguarded } = guardedBy(rel, { literal: "ต้องแนบ:" }, guard);
    assert.ok(hits > 0, `${rel}: หา 'ต้องแนบ:' ไม่เจอ — ตัวตรวจล้าสมัย?`);
    assert.equal(unguarded, 0, `'ต้องแนบ: …' ต้องอยู่กิ่ง else ของ \`${guard} ? … :\` — ไม่รู้ผลแล้วขึ้น "ต้องแนบ: " เปล่า`);
  }
  // นิยามทั้งก้อน ไม่ใช่แค่ "อ่านสองธง" — `… && reqChecking ? req : null` ก็อ่านครบแต่กลับด้าน
  assert.equal(ast.initText("reqCurrent"), "req && !reqFault && !reqChecking ? req : null",
    "ผลปัจจุบัน (reqCurrent) ต้องไม่ใช่ผลของรอบที่ล้ม และไม่ใช่ผลเดิมระหว่างตรวจรอบใหม่");

  // ⑥ ป้ายผลตรวจ: โทน error · ข้อความดิบทางบรรทัดรอง · ลองใหม่ = checkRequirements (ตัวนับรอบเดียวกัน) พร้อมสถานะกำลังลอง
  const reqNotice = ast.bindingNamed("reqNotice");
  const noticeInit = ast.initPath("reqNotice");
  assert.ok(reqNotice && noticeInit?.isConditionalExpression() && ast.textOf(noticeInit.node.test) === "reqFault",
    "ต้องมี `const reqNotice = reqFault ? (…) : null`");
  const [box] = ast.elements("StatusNotice", { where: { tone: "error" } }).filter((e) => ast.within(e.path, "reqNotice"));
  assert.ok(box && readsState(box.attr("detail"), "reqFault"), "ป้ายผลตรวจต้องส่งข้อความดิบทางบรรทัดรอง (detail={reqFault.detail})");
  onlyWhen("ผลตรวจที่มีอยู่", "reqStale", "ไม่มีผลในมือแล้วพูดถึง 'ผลที่มีอยู่' = อ้างผลที่ไม่มี");
  const retry = ast.retryButton("reqNotice");
  assert.ok(retry && reads(ast, retry.onClick, "checkRequirements"), "ปุ่มลองใหม่ต้องเรียก checkRequirements — ยิงเองนอกตัวนับรอบ = คำตอบเก่าทับได้");
  assert.ok(readsState(retry.disabled, "reqChecking") && readsState(retry.labelTest, "reqChecking"),
    "ปุ่มลองใหม่ต้องพัก + เปลี่ยนป้ายตาม reqChecking — กดแล้วป้ายนิ่ง = คนกดซ้ำรัว ๆ");
  // วาดในทางปกติ และไม่ผูกกับสถานะใบ — แถวสรุป/รายการบนการ์ดจัดการอ่านผลนี้ทุกสถานะ
  const slots = [];
  ast.mainReturn()?.traverse({ JSXExpressionContainer(p) { if (p.get("expression").isIdentifier({ name: "reqNotice" })) slots.push(p); } });
  assert.ok(slots.length > 0, "ทางปกติ (return สุดท้าย) ต้องมี {reqNotice}");
  for (const slot of slots) {
    const tests = [];
    for (let p = slot; p.parentPath; p = p.parentPath) {
      if (p.parentPath.isConditionalExpression() && p.key !== "test") tests.push(ast.textOf(p.parentPath.node.test));
      if (p.parentPath.isLogicalExpression() && p.key === "right") tests.push(ast.textOf(p.parentPath.node.left));
    }
    assert.ok(!tests.some((t) => t.includes("status")), `{reqNotice} ถูกคุมด้วย \`${tests.join(" / ")}\` — ต้องขึ้นทุกสถานะ ไม่ใช่เฉพาะฉบับร่าง`);
  }

  // ⑦ checklist (ฉบับร่าง + การ์ดจัดการ) วาดจากผลที่ไม่ใช่ของรอบที่ล้ม — ผลรอบก่อนห้ามวาดเป็นรายการปัจจุบัน
  assert.equal(ast.initText("reqShown"), "reqFault ? null : req", "checklist ต้องวาดจาก reqShown (ผลที่ไม่ใช่ของรอบที่ล้ม)");
  for (const [match, what] of [[{ literal: "ยังขาดเอกสารที่จำเป็น" }, "checklist ของฉบับร่าง"], [{ tag: "DocumentReadinessList" }, "<DocumentReadinessList>"]]) {
    const all = gatesBy(rel, match);
    assert.ok(all.length > 0, `${rel}: ${what} หาไม่เจอ — ตัวตรวจล้าสมัย?`);
    for (const names of all) {
      assert.ok(names.has("reqShown") && !names.has("req"),
        `${what} ต้องวาดจาก reqShown ไม่ใช่ req — ผลของรอบที่ล้มไปแล้ววาดเป็นรายการ = อ่านเป็นผลปัจจุบัน`);
    }
  }
});

/* ── "ไม่มีของในมือ" ≠ "ลิสต์ยาวศูนย์" ────────────────────────────────────────
 * 🐞 ของจริงบน prod: `/api/sahamit/coverage` ตอบ `200 []` ทุกวัน ⇒ ตอนวัดความว่างด้วย
 * `!list.length` แดชบอร์ดสหมิตร **หายทั้งใบ** ทันทีที่มันตอบ 500 — ทั้งที่ตัวเลขชุดเดียว
 * กันเป๊ะ (คำนวณด้วย coverage ศูนย์แถว) ถูกวาดเต็มใบอย่างมั่นใจตอนมันตอบ [] ⇒ ผู้ใช้จ่าย
 * ทั้งจอไปโดยไม่ได้ความถูกต้องกลับมาเลย · และแคชระดับโมดูลยิ่งแย่: เดินกลับเข้าจอทั้งที่
 * ของครบอยู่ในมือ ก็ยังโดนซ่อนทิ้ง
 * ⇒ ความว่างที่ใช้บล็อกต้องมาจาก `loaded` (เคยโหลดสำเร็จไหม) หรือ "ของชิ้นที่หน้านี้
 *    ต้องใช้จริง ๆ" (เช่น `!round`) — ห้ามกลับไปนับความยาวลิสต์อีก */
test("ความว่างที่ใช้บล็อกต้องมาจาก loaded ไม่ใช่ความยาวลิสต์", () => {
  for (const rel of SCREENS) {
    const block = sourcesBlock(rel);
    const empties = [...block.matchAll(/empty:\s*([^,\n]+)/g)].map(([, v]) => v.trim());
    assert.ok(empties.length, `${rel}: ไม่พบ empty: ในก้อน sources`);
    for (const v of empties) {
      assert.doesNotMatch(v, /\.length/,
        `${rel}: empty: ${v} — ลิสต์ที่โหลดสำเร็จแล้วตอบ [] คือคำตอบที่ใช้ได้ ไม่ใช่ความไม่รู้`);
    }
    assert.match(code(rel), /loaded:/,
      `${rel}: ไม่ได้แกะ loaded จาก useApiList ⇒ วัด "มีของในมือ" ไม่ได้`);
  }
});

/* ── รอบเบื้องหลังที่ล้ม ต้องไปโผล่บนป้ายด้วย ───────────────────────────────────
 * 🐞 แท็บที่เปิดค้างไว้ทั้งวัน (เคสที่ `useRevalidateOnFocus` มีไว้รับ) เคยยืนยันตัวเลข
 * ของเมื่อวานต่อไปทุกรอบที่ revalidate ล้ม โดยไม่มีอะไรบอกเลย — ต้อง F5 ถึงจะรู้ นั่นคือ
 * บั๊ก 26 วันตัวเดิมที่เข้าทางประตูหลัง · สิ่งที่ห้ามขึ้นกลางที่ผู้ใช้กำลังอ่านคือแบนเนอร์
 * ที่ **บล็อก** ไม่ใช่ประโยค "ของที่เห็นเป็นรอบก่อน" ⇒ ทุกแหล่งต้องอ่านทั้งสองช่อง */
test("ทุกแหล่งต้องนับรอบเบื้องหลังที่ล้ม (staleError) เข้าป้ายด้วย", () => {
  for (const rel of SCREENS) {
    assert.match(code(rel), /staleError:/,
      `${rel}: ไม่ได้แกะ staleError ⇒ revalidate ที่ล้มจะเงียบ และจอยืนยันตัวเลขรอบก่อนแทน`);
    for (const [, value] of sourcesBlock(rel).matchAll(/error:\s*([^,\n]+)/g)) {
      assert.match(value, /\|\|/,
        `${rel}: แหล่งที่อ่านแค่ ${value.trim()} — รอบเบื้องหลังที่ล้มยังไม่ถึงป้าย`);
    }
  }
});

/* ทุกจอในทะเบียนพูดประโยคเดียวกัน: ชื่อสายอยู่ **หลัง** "ดึงข้อมูลไม่ได้:" — แบบที่แทรกชื่อไว้
   กลาง "ดึงข้อมูล…ไม่ได้" ทำให้จุดคั่นสองสายตกกลางกริยา ("การขึ้นทะเบียน · การยื่นชำระ
   ภาษีไม่ได้") แล้วต้องอ่านซ้ำถึงจะแยกออกว่าอะไรคือชื่อสาย อะไรคือกริยา */
test("ทุกจอในทะเบียนใช้สำนวนเดียวกัน — ชื่อสายอยู่หลัง 'ดึงข้อมูลไม่ได้:'", () => {
  for (const rel of SCREENS) {
    assert.match(code(rel), /`ดึงข้อมูลไม่ได้: \$\{failing\.map\(\(s\) => s\.label\)\.join\(" · "\)\}/,
      `${rel}: ข้อความป้ายไม่ตรงสำนวนกลาง`);
  }
});

/* ── เหตุผลที่ "ยังทำไม่ได้" ต้องเป็นของสายที่ล้ม ──────────────────────────────
 * 🐞 หน้าแก้รอบ FC เคยพูดประโยคเดียวคลุมทุกกรณี: รายการสินค้าล้ม (รอบยังอยู่ หัวจอโชว์
 * "แก้ FC รอบที่ 8" ชัด ๆ) แต่ป้ายกลับตอบว่า "(ไม่ได้แปลว่ารอบนี้ถูกลบไปแล้ว)" = ตอบ
 * คำถามที่ไม่มีใครถาม แถมดันสาเหตุจริง (ไม่มีรายการสินค้า) ออกไปอยู่ท้ายประโยค */
test("แก้รอบ FC: เหตุผลที่ยังแก้ไม่ได้ต้องผูกกับสายที่ล้ม ไม่ใช่ประโยคเดียวคลุมทุกสาย", () => {
  const rel = "app/sahamit/forecast/[id]/edit/page.js";
  const text = code(rel);
  const block = sourcesBlock(rel);
  assert.match(text, /blocked\.map\(\(s\) => s\.blockedNote\)/,
    "ข้อความท้ายต้องมาจาก blockedNote ของสายที่ถูกบล็อก");
  assert.equal((block.match(/blockedNote:/g) || []).length, (block.match(/label:/g) || []).length,
    "ทุกสายต้องมี blockedNote ของตัวเอง");
  assert.ok(block.includes("ไม่ได้แปลว่ารอบนี้ถูกลบไปแล้ว"),
    "ประโยค '(ไม่ได้แปลว่ารอบนี้ถูกลบไปแล้ว)' ต้องอยู่กับสายรอบ FC เท่านั้น");
});

/* ── มติเจ้าของ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก" ─────────────────────────────────────
 *
 * 🐞 กล่องแจ้งของจอเหล่านี้เคยขึ้นข้อความดิบของเซิร์ฟเวอร์เป็นตัวเนื้อ (`column orders.updatedAt does
 *    not exist`) — คนหน้างานอ่านไม่ออก · แต่ **สตริงนั้นคือสิ่งที่ไขคดี orders.updatedAt ได้ในไม่กี่นาที**
 * ⭐ ทำที่เดียว: `useApiList` แยก `error` (ประโยคไทย) กับ `errorDetail` (ข้อความดิบ) ด้วย lib/ui/loadFailure
 *    และ `StatusNotice` มีบรรทัดรอง `detail` ที่ขึ้นป้าย "รายละเอียดสำหรับแจ้งปัญหา:" ให้เอง
 * 🔴 ช่องโหว่ที่ต้องปิด: `error` เป็นไทยแล้ว ⇒ จอไหนแสดง `error` โดยไม่ส่ง `detail` = **ข้อความดิบหายเงียบ**
 *    ⇒ ทะเบียนข้างล่างคือ "ทุกจอที่แสดงความล้มของ useApiList" และเทสต์ความครบบังคับให้จอใหม่ต้องเข้าทะเบียน
 * ⚠️ ทะเบียนนี้เพิ่มได้อย่างเดียว — จอที่หลุดออกไปแปลว่ามีคนถอดบรรทัดรองทิ้ง
 */
const DETAIL_SCREENS = [
  ...SCREENS,
  /* สหมิตร: เดิมเป็นกล่อง glass-panel สีแดงที่ขึ้นแต่ข้อความดิบ (ไม่มีประโยคไทยเลย) — ย้ายมาใช้กล่องกลาง
     (forecast · material · po · po/[id] · reconcile ย้ายขึ้นไปอยู่ใน SCREENS แล้วเมื่อ 25/09 — ยังอยู่ในทะเบียนนี้ผ่าน `...SCREENS`) */
  "app/sahamit/review/page.js",
];

const hookSource = () => read("lib/excise/useApiList.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

test("useApiList: error/staleError เป็นประโยคไทยจาก loadFailure · ข้อความดิบออกทาง errorDetail เท่านั้น", () => {
  const hook = hookSource();
  assert.match(hook, /import \{ httpLoadFailure, thrownLoadFailure \} from "@\/lib\/ui\/loadFailure"/);
  assert.match(hook, /httpLoadFailure\(r\.status,/, "คำตอบไม่ ok ต้องผ่านตัวแยกไทย/ดิบ");
  assert.match(hook, /thrownLoadFailure\(e\)/, "ของที่ถูกโยน (เน็ตหลุด/อ่าน body ไม่ได้) ต้องผ่านตัวแยกเหมือนกัน");
  // 🐞 ทรงเดิมที่ต้องไม่กลับมา: เอา `body.error` ดิบ ๆ ยัดเป็นข้อความของ Error แล้วส่งขึ้นจอเป็นตัวเนื้อ
  assert.doesNotMatch(hook, /throw new Error\([^)]*\?\.error/, "ข้อความดิบห้ามกลับไปเป็นตัวเนื้อของ error");
  assert.match(hook, /error: failure\?\.message \?\? null/);
  assert.match(hook, /staleError: staleFailure\?\.message \?\? null/);
  // ⭐ บรรทัด "ของรอบก่อน" ของ #1796 ได้บรรทัดรองด้วย — detail ตามตัวที่ `error || staleError` ชี้
  assert.match(hook, /const shown = failure \|\| staleFailure/);
  assert.match(hook, /errorDetail: shown\?\.detail \?\? null/);
  assert.match(hook, /if \(opts\?\.background\) setStaleFailure\(fault\); else setFailure\(fault\);/);
});

test("StatusNotice: บรรทัดรอง detail มีป้ายกลาง ใช้คลาสของโมดูล ไม่มี inline style", () => {
  const notice = read("components/ui/StatusNotice.js");
  assert.match(notice, /detailLabel = LOAD_FAILURE_DETAIL_LABEL/, "ป้ายมาจากที่เดียว — ผู้เรียกไม่ประกอบป้ายเอง");
  assert.match(notice, /\{detail \? \(\s*<p className=\{styles\.detail\}>/);
  assert.match(notice, /<span className=\{styles\.detailLabel\}>\{detailLabel\}:<\/span>/);
  assert.match(notice, /translate="no"/, "ข้อความดิบห้ามถูกตัวแปลของเบราว์เซอร์แก้ — คนก๊อปไปค้นในโค้ดต้องเจอ");
  assert.doesNotMatch(notice, /style=\{\{/);
  const css = read("components/ui/StatusNotice.module.css");
  assert.match(css, /\.detail \{[^}]*font-size: var\(--fs-5\)/, "บรรทัดรองต้องเล็กกว่าข้อความ (--fs-7) — 'บรรทัดเล็ก'");
  assert.match(css, /\.detail \{[^}]*color: var\(--text-2\)/, "--text-3 บนพื้นแดงอ่อนต่ำกว่า AA");
  /* StatusNotice ดึงป้ายจาก loadFailure.js ⇒ ไฟล์นั้นต้องไม่ import อะไร ไม่งั้นทุกผู้เรียกกล่องกลางพ่วงของนั้นไปด้วย
     (รอบแรกพ่วง apiFetch มาเพื่อ instanceof ตัวเดียว — primitive ของจอไม่ควรขึ้นกับตัวห่อเครือข่าย) */
  assert.doesNotMatch(code("lib/ui/loadFailure.js"), /^\s*import\b/m, "loadFailure.js ต้องไม่มี import");
});

test("ทุกจอในทะเบียนส่งข้อความดิบให้ StatusNotice ทางบรรทัดรอง (detail=) — ไม่มีจอไหนทิ้งมัน", () => {
  for (const rel of DETAIL_SCREENS) {
    const text = code(rel);
    assert.match(text, /import StatusNotice from "@\/components\/ui\/StatusNotice"/, `${rel}: ต้องใช้กล่องกลาง`);
    assert.match(text, /errorDetail/, `${rel}: ไม่ได้แกะ errorDetail จาก useApiList ⇒ ข้อความดิบหายจากจอ`);
    assert.match(text, /<StatusNotice[^>]*?\bdetail=\{/, `${rel}: กล่องแจ้งโหลดพังต้องมี detail= (บรรทัดรอง)`);
    // กล่อง glass-panel สีแดงแบบเดิมต้องไม่กลับมา — มันขึ้นแต่ข้อความดิบ ไม่มีประโยคไทย ไม่มีบรรทัดรอง
    assert.doesNotMatch(text, /<AlertCircle[^>]*\/>\s*\{error\}/, `${rel}: กล่องแจ้งประกอบเองแบบเดิมยังอยู่`);
  }
});

test("จอที่อ่านหลายแหล่ง: ทุกแหล่งพก detail · บรรทัดรองมาจาก sourcesFailureDetail(failing) (ทุกสายที่ล้ม)", () => {
  for (const rel of SCREENS) {
    const block = sourcesBlock(rel);
    const labels = (block.match(/label:/g) || []).length;
    assert.equal((block.match(/\bdetail:/g) || []).length, labels, `${rel}: ทุกสายต้องพก detail ของตัวเอง`);
    const text = code(rel);
    assert.match(text, /const loadErrorDetail = sourcesFailureDetail\(failing\)/,
      `${rel}: บรรทัดรองต้องพ่วงทุกสายที่ล้ม (ตัวที่ไขคดีมักอยู่ก้อนหลัง) ไม่ใช่ประกอบเองรายจอ`);
    assert.match(text, /detail=\{loadErrorDetail\}/);
  }
});

/* ความครบของทะเบียน — จอใหม่ที่แกะ `error` ออกจาก useApiList แล้ววาดมัน ต้องเข้าทะเบียนข้างบน
   (และจึงโดนบังคับให้ส่ง detail) · จอที่แกะแค่ data/loading (ลิสต์ของ picker) ไม่เกี่ยว
   ⚠️ ความล้มออกจากฮุกได้สองช่อง (`error` · `staleError`) และสองทรง (แกะ `{ … }` · เก็บทั้งก้อนแล้วอ่าน `list.error`)
      — ตัวสแกนต้องเห็นครบทั้งสี่แบบ: `\berror\b` ไม่ติดคำว่า `staleError` และจอที่ไม่แกะก็ไม่มี `{ … }` ให้จับเลย
      ⇒ หลุดแบบใดแบบหนึ่ง = จอขึ้นประโยคไทยแต่ข้อความดิบหายเงียบ โดยด่านนี้ยังเขียว */
const takesFailure = (text) => {
  const destructured = [...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*useApiList\(/g)]
    .some(([, bindings]) => /\b(error|staleError)\b/.test(bindings));
  const whole = [...text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useApiList\(/g)]
    .some(([, name]) => new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\s*\\??\\.\\s*(?:error|staleError)\\b`).test(text));
  return destructured || whole;
};

test("ตัวสแกนความครบเห็นทั้ง staleError และจอที่ไม่แกะ useApiList", () => {
  assert.equal(takesFailure("const { data, error } = useApiList(url);"), true);
  assert.equal(takesFailure("const { data, error: loadError } = useApiList(url);"), true);
  assert.equal(takesFailure("const { data, staleError } = useApiList(url);"), true, "แกะแค่ staleError ก็คือแสดงความล้ม");
  assert.equal(takesFailure("const list = useApiList(url);\nreturn list.error ? 1 : 0;"), true, "อ่าน list.error โดยไม่แกะ");
  assert.equal(takesFailure("const list = useApiList(url);\nreturn list?.staleError;"), true);
  assert.equal(takesFailure("const { data, errorDetail } = useApiList(url);"), false, "errorDetail อย่างเดียวไม่ใช่การแสดงความล้ม");
  assert.equal(takesFailure("const { data: products } = useApiList(url);"), false, "ลิสต์ของ picker ไม่เกี่ยว");
  assert.equal(takesFailure("const list = useApiList(url);\nreturn list.data;"), false);
});

test("ทะเบียนครบ: ทุกไฟล์ที่แกะ error จาก useApiList อยู่ใน DETAIL_SCREENS", () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.js$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
  const offenders = [];
  for (const file of [...walk(join(src, "app")), ...walk(join(src, "components"))]) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    const rel = relative(src, file).split(sep).join("/");
    if (takesFailure(text) && !DETAIL_SCREENS.includes(rel)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "จอเหล่านี้แสดงความล้มของ useApiList แต่ไม่อยู่ในทะเบียนบรรทัดรอง");
});

/* ── ความครบรายการเรียก: ทุก `useApiList(…)` ใน src ต้องรับความล้ม ────────────────────────────
 *
 * 🐞 ช่องที่ปล่อย /database หลุดมาหลัง #1796: ด่าน "ทะเบียนครบ" ข้างบนจับเฉพาะไฟล์ที่ **แกะ** error
 *    แล้วลืมเข้าทะเบียน — จอที่ **ไม่แกะเลย** (ทรงเดียวกับ /tax ก่อน #1796 · คือทรงที่อันตรายที่สุด)
 *    ผ่านด่านนั้นได้สบาย ⇒ /database ขึ้น "สินค้าทั้งหมด 0 · ไม่มีรายการรออนุมัติ 🎉" ตอน API ล้มได้ทุกวัน
 *    โดยด่านเขียว
 * ⇒ ด่านนี้นับ **รายการเรียก** ไม่ใช่รายไฟล์ (ไฟล์ที่แกะ error ของลิสต์แรกแล้วทิ้งของลิสต์ที่สอง ก็คือ
 *    ลิสต์ที่สองเงียบ) · รายการเรียกต้องแกะ `error` หรือ `staleError` **แล้วอ่านมันจริง** (หรือเก็บทั้งก้อน
 *    แล้วอ่าน `.error`) — แกะมาทิ้งไว้เฉย ๆ (`error: _ignored`) ก็คือเงียบ
 *
 * ⚠️ อ่านด้วย @babel/parser + @babel/traverse ไม่ใช่ regex — regex ตัดคอมเมนต์ด้วย `/*` ในสตริงแล้ว
 *    กลืนรายการเรียกทิ้งได้เงียบ ๆ (= ศูนย์ปลอม) · "อ่านจริง" ตัดสินด้วย scope ของ babel ⇒ `catch (error)`
 *    ที่อื่นในไฟล์ไม่นับแทน `error` ของฮุก
 * ⚠️ พาร์สไม่ผ่าน / ทรงที่ไม่รู้จัก = **แดง** ไม่ใช่ข้าม — ด่านที่ข้ามสิ่งที่อ่านไม่ออกคือด่านที่ปิดตัวเองได้:
 *    ไม่ได้อยู่ใน `const … = useApiList(…)` · import ด้วยชื่ออื่น (`useApiList as useList`) หรือทั้งโมดูล
 *    (`import * as H`) · เรียกผ่าน member (`H.useApiList(…)`) · ส่งฮุกไปเป็นค่า (`const f = useApiList`)
 *    — ทุกทรงนี้พาการเรียกหนีตัวสแกนที่ตามชื่อ `useApiList` ได้
 */
const ALL_EXT = /\.(m?js|jsx)$/;
const walkSrc = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walkSrc(full);
  return ALL_EXT.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
});

const HOOK = "useApiList";
const HOOK_MODULE = /(^|\/)useApiList(\.js)?$/;
const FAILURE_KEY = /^(error|staleError)$/;
const keyName = (node) => (node?.type === "Identifier" ? node.name : node?.type === "StringLiteral" ? node.value : null);
const memberKey = (node) => (node.computed ? (node.property.type === "StringLiteral" ? node.property.value : null) : node.property.name);

/* ทุกรายการเรียกในซอร์สหนึ่งไฟล์ ⇒ `{ call: "<ไฟล์> :: <อาร์กิวเมนต์>", surfaces, problem }`
   กุญแจเป็น **อาร์กิวเมนต์ตามตัวอักษร** (URL / นิพจน์) ไม่ใช่ชื่อตัวแปร — ผูกกับการใช้งาน ไม่ใช่ชื่อที่เปลี่ยนหนีได้ */
function apiListCalls(source, rel) {
  let ast;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  } catch (e) {
    return [{ call: `${rel} :: (พาร์สไม่ผ่าน)`, surfaces: false, problem: `พาร์สไม่ผ่าน: ${e.message}` }];
  }
  const textOf = (node) => source.slice(node.start, node.end).replace(/\s+/g, " ");
  const out = [];
  const odd = (path, why) => out.push({ call: `${rel} :: (บรรทัด ${path.node.loc.start.line})`, surfaces: false, problem: why });
  // ก้อนทั้งก้อน (`list` / `...rest`) ถูกอ่าน `.error` / `?.staleError` ที่ไหนสักแห่ง — ตาม binding ไม่ใช่ตามชื่อ
  const readsFailure = (binding) => !!binding?.referencePaths.some((ref) =>
    (ref.parentPath.isMemberExpression() || ref.parentPath.isOptionalMemberExpression())
    && ref.parentPath.node.object === ref.node && FAILURE_KEY.test(memberKey(ref.parentPath.node) ?? ""));

  const analyse = (callPath) => {
    const node = callPath.node;
    const call = `${rel} :: ${node.arguments[0] ? textOf(node.arguments[0]) : "(ไม่มีอาร์กิวเมนต์)"}`;
    const decl = callPath.parentPath;
    if (!decl.isVariableDeclarator() || decl.node.init !== node) {
      return { call, surfaces: false, problem: `ทรงที่ตัวสแกนไม่รู้จัก (${decl.node.type}) — ต้องเป็น const { … } = useApiList(…) หรือ const x = useApiList(…)` };
    }
    const id = decl.node.id;
    const bindingOf = (name) => decl.scope.getBinding(name);
    if (id.type === "Identifier") return { call, surfaces: readsFailure(bindingOf(id.name)) };
    if (id.type === "ObjectPattern") {
      const surfaces = id.properties.some((p) => {
        if (p.type === "RestElement") return p.argument.type === "Identifier" && readsFailure(bindingOf(p.argument.name));
        if (p.computed || !FAILURE_KEY.test(keyName(p.key) ?? "")) return false;
        const local = p.value.type === "AssignmentPattern" ? p.value.left : p.value;
        // 🪤 แกะแล้วไม่อ่าน = เงียบเท่ากับไม่แกะ
        return local.type === "Identifier" && (bindingOf(local.name)?.referencePaths.length ?? 0) > 0;
      });
      return { call, surfaces };
    }
    return { call, surfaces: false, problem: `ทรงที่ตัวสแกนไม่รู้จัก (${id.type})` };
  };

  try {
    traverse(ast, {
      ImportDeclaration(path) {
        if (!HOOK_MODULE.test(path.node.source.value)) return;
        for (const s of path.node.specifiers) {
          if (s.type === "ImportSpecifier" && keyName(s.imported) !== HOOK) continue; // ชื่ออื่นจากโมดูลเดียวกัน
          if (s.type === "ImportSpecifier" && s.local.name === HOOK) continue;
          odd(path, `import ฮุกด้วยชื่ออื่นหรือทั้งโมดูล (${textOf(s)}) — ตัวสแกนตามชื่อ ${HOOK} ⇒ ต้อง import { ${HOOK} } ตรง ๆ`);
        }
      },
      "MemberExpression|OptionalMemberExpression"(path) {
        if (memberKey(path.node) === HOOK) odd(path, `เรียกฮุกผ่าน member (${textOf(path.node)}) — ต้องเรียก ${HOOK}(…) ตรง ๆ`);
      },
      Identifier(path) {
        if (path.node.name !== HOOK || !path.isReferencedIdentifier()) return;
        const parent = path.parentPath;
        if (parent.isCallExpression() && parent.node.callee === path.node) out.push(analyse(parent));
        else odd(path, `ใช้ ${HOOK} เป็นค่า (${textOf(parent.node)}) ไม่ใช่เรียกตรง ๆ — ตัวสแกนตามไปไม่ได้`);
      },
    });
  } catch (e) {
    return [{ call: `${rel} :: (สแกนไม่ผ่าน)`, surfaces: false, problem: `สแกนไม่ผ่าน: ${e.message}` }];
  }
  return out;
}

test("ตัวสแกนรายการเรียกเห็นทุกทรง — และจับทรงที่ /database เคยเป็น", () => {
  const scan = (s) => apiListCalls(s, "x.js").map(({ surfaces, problem }) => problem ? "problem" : surfaces);
  // 🐞 ทรงของ /database ก่อนงานนี้ — ตัวสแกนความครบรุ่นเดิม (takesFailure) ตอบ false ⇒ ไม่มีใครถูกฟ้อง
  assert.deepEqual(scan('const { data: rawProducts, loading: l1 } = useApiList("/api/master/products?manage=1");'), [false]);
  assert.equal(takesFailure('const { data: rawProducts, loading: l1 } = useApiList("/api/master/products?manage=1");'), false,
    "หลักฐานว่าตัวสแกนรุ่นเดิมมองไม่เห็น /database — มันถามแค่ 'ไฟล์ที่แกะ error อยู่ในทะเบียนไหม'");
  assert.deepEqual(scan("const { data, error } = useApiList(u);\nf(error);"), [true]);
  assert.deepEqual(scan("const { data, error: loadError } = useApiList(u);\nf(loadError);"), [true]);
  assert.deepEqual(scan("const { data, staleError } = useApiList(u);\nf(staleError);"), [true]);
  assert.deepEqual(scan("const { data, error = null } = useApiList(u);\nf(error);"), [true]);
  assert.deepEqual(scan("const { data, errorDetail } = useApiList(u);\nf(errorDetail);"), [false], "errorDetail อย่างเดียวไม่ใช่การรับความล้ม");
  assert.deepEqual(scan("const { data: error } = useApiList(u);\nf(error);"), [false], "ตัวแปรชื่อ error ที่จริงคือ data ไม่นับ");
  // 🪤 แกะแล้วไม่อ่าน = เงียบ · และ "อ่าน" ต้องเป็นตัวเดียวกันตาม scope ไม่ใช่ชื่อซ้ำที่อื่นในไฟล์
  assert.deepEqual(scan("const { data, error: _ignored } = useApiList(u);"), [false], "แกะ error มาทิ้งไว้ ไม่ใช่การรับความล้ม");
  assert.deepEqual(scan("const { data, error } = useApiList(u);"), [false]);
  assert.deepEqual(scan("const { data, error } = useApiList(u);\ntry { g(); } catch (error) { f(error); }"), [false],
    "`catch (error)` เป็นคนละตัว — อ่านมันไม่ได้แปลว่าอ่าน error ของฮุก");
  assert.deepEqual(scan("const list = useApiList(u);\nconst x = list.error;"), [true]);
  assert.deepEqual(scan("const list = useApiList(u);\nconst x = list?.staleError;"), [true]);
  assert.deepEqual(scan("const list = useApiList(u);\nconst x = list.data;"), [false]);
  assert.deepEqual(scan("const list = useApiList(u);\nfunction g(list) { return list.error; }"), [false], "list ของพารามิเตอร์เป็นคนละตัว");
  assert.deepEqual(scan("const { data, ...rest } = useApiList(u);\nf(rest.error);"), [true]);
  // สองรายการในไฟล์เดียว: ตัวแรกรับ ตัวที่สองทิ้ง — รายไฟล์จะผ่าน รายการเรียกต้องจับได้
  assert.deepEqual(scan("const { data, error } = useApiList(a);\nf(error);\nconst { data: b } = useApiList(b);"), [true, false]);
  // ทรงที่อ่านไม่ออก = แดง ไม่ใช่ข้าม
  assert.deepEqual(scan("const rows = useApiList(u).data;"), ["problem"]);
  assert.deepEqual(scan("function useX() { return useApiList(u); }"), ["problem"]);
  assert.deepEqual(scan("const { data } = useApiList(u"), ["problem"], "พาร์สไม่ผ่าน = แดง");
  // ทางหนีตัวสแกนที่ตามชื่อ — alias / ทั้งโมดูล / member / ส่งเป็นค่า = แดงทุกทรง
  const flagged = (s) => apiListCalls(s, "x.js").some((c) => c.problem);
  assert.ok(flagged('import { useApiList as useList } from "@/lib/excise/useApiList";\nconst { data: x } = useList(u);'), "import ด้วยชื่ออื่น");
  assert.ok(flagged('import * as H from "@/lib/excise/useApiList";\nconst { data: x } = H.useApiList(u);'), "import ทั้งโมดูล");
  assert.ok(flagged("const { data: x } = api.useApiList(u);"), "เรียกผ่าน member");
  assert.ok(flagged('const { data: x } = api["useApiList"](u);'), "เรียกผ่าน member แบบ computed");
  assert.ok(flagged("const f = useApiList;\nconst { data: x } = f(u);"), "ส่งฮุกไปเป็นค่า");
  assert.equal(flagged('import { useApiList } from "@/lib/excise/useApiList";\nconst { data, error } = useApiList(u);\nf(error);'), false,
    "import ตรงชื่อ = ทรงปกติ ไม่แดง");
  assert.equal(flagged("export function useApiList(url) { return url; }"), false, "ตัวประกาศฮุกเองไม่ใช่การเรียก");
  // 🪤 `/*` ในสตริงเคยพาตัวตัดคอมเมนต์แบบ regex กลืนรายการเรียกทิ้ง — AST ไม่โดน
  assert.deepEqual(scan('const g = "src/**/*.js";\nconst { data } = useApiList(u);\nconst h = "*/";'), [false]);
  assert.equal(apiListCalls('const { data } = useApiList(ready ? "/api/x" : null);', "f.js")[0].call, 'f.js :: ready ? "/api/x" : null');
});

/* ⭐ **บัญชีหนี้ — ลดได้อย่างเดียว** · รายการเรียกที่ยังทิ้งความล้มอยู่ ณ วันที่ด่านนี้เกิด (25/09/2569)
   ไม่ใช่ข้อยกเว้นตามกติกา: ไม่มีทรงไหน "ได้รับอนุญาต" ให้เงียบ (แม้แต่ลิสต์ของ picker `ready ? url : null`
   — ถ้าปล่อยเป็นกติกา ใครก็ห่อ URL ด้วย ternary แล้วหลุดด่านได้) · ทุกบรรทัดคือของที่ **ต้องแก้**
   ⚠️ แก้รายการไหนแล้ว **ต้องลบบรรทัดนั้นทิ้ง และลดเพดาน KNOWN_SILENT_CAP ลงตาม** — ด่านแดงถ้าบรรทัดในบัญชี
      ไม่เงียบแล้ว (บัญชีหมดอายุเงียบ = สวิตช์ปิด)
   ⚠️ ห้ามเพิ่มบรรทัด — รายการเรียกใหม่ต้องรับ error ตั้งแต่เกิด */
const KNOWN_SILENT = [
  /* ✅ ปิดแล้ว (25/09): ลิสต์หลักของหน้ารายละเอียดที่ล้มแล้วจอโกหกว่า "ไม่พบ…" — tax/filings/[id] (4 รายการเรียก)
     และ sahamit/po/[id]/edit (3 รายการเรียก) ย้ายเข้าทะเบียน SCREENS แล้ว · เพดาน 25 → 18
     ✅ ปิดครบ (25/09 "ทำอีก 18 จุดต่อ"): ลิสต์รองที่ป้อนการคำนวณ/ล็อกของจอ (po · po/[id] · po/new · reconcile ·
     forecast · material — 12 รายการเรียก) และลิสต์ของ picker (tax/filings · tax/registrations · tax/registrations/[id]
     — 6 รายการเรียก) ย้ายเข้าทะเบียน SCREENS ทั้งหมด · เพดาน 18 → 0
     ⚠️ บัญชีว่างแล้วแต่ **กลไกยังอยู่**: รายการเรียกใหม่ที่ทิ้ง error จะแดงที่เทสต์ข้างล่างทันที (ไม่มีที่ให้เติม) */
];

/* เพดานของบัญชีหนี้ — เทียบสองทางแบบเพดานของ audit-ui.mjs
   🐞 เดิมบัญชีบังคับแค่ขาลง (บรรทัดที่แก้แล้วต้องลบ) ⇒ เติมบรรทัดเดียวในลิสต์ รายการเรียกเงียบตัวใหม่ก็ผ่านด่าน
      โดยดิฟดูเหมือนงานทำบัญชีธรรมดา · เลขนี้ทำให้การเพิ่มต้องขึ้นเพดานให้เห็นในรีวิว
   ⇒ แก้หนี้แล้ว: ลบบรรทัด + **ลด** เลขนี้ · ห้ามขึ้นเลขนี้ */
const KNOWN_SILENT_CAP = 0;

test("บัญชีหนี้ KNOWN_SILENT มีเพดาน — เพิ่มบรรทัดไม่ได้โดยไม่ขึ้นเลขให้เห็น", () => {
  assert.equal(KNOWN_SILENT.length, KNOWN_SILENT_CAP,
    KNOWN_SILENT.length > KNOWN_SILENT_CAP
      ? "บัญชีหนี้ยาวกว่าเพดาน — ห้ามเพิ่มรายการเรียกเงียบ: แกะ error/staleError/errorDetail/loaded แล้วขึ้น StatusNotice แทน"
      : "บัญชีหนี้สั้นลงแล้ว (ดีมาก) — ลด KNOWN_SILENT_CAP ลงให้ตรง ไม่งั้นเพดานเหลือที่ว่างให้เติมรายการเงียบกลับเข้ามาได้");
});

test("ทุก useApiList ใน src รับความล้ม — ยกเว้นบัญชีหนี้ KNOWN_SILENT ที่ลดได้อย่างเดียว", () => {
  const found = walkSrc(src).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    if (!text.includes("useApiList")) return [];
    return apiListCalls(text, relative(src, file).split(sep).join("/"));
  });
  /* กันตัวสแกนตาบอด: ตัวเดินไฟล์/ตัวพาร์สพังแล้วหาไม่เจออะไรเลย = ด่านเขียวเพราะไม่ได้ดูอะไร
     ⚠️ ผูกกับจอในทะเบียน ไม่ใช่เพดานจำนวน — จำนวนรายการเรียกลดลงได้ตามงานปกติ (รื้อสหมิตรทั้งเส้นอยู่ในแผน) */
  const scannedFiles = new Set(found.map((c) => c.call.split(" :: ")[0]));
  const unseen = DETAIL_SCREENS.filter((rel) => !scannedFiles.has(rel));
  assert.deepEqual(unseen, [], "จอในทะเบียนที่ตัวสแกนรายการเรียกมองไม่เห็น — ตัวเดินไฟล์/ตัวพาร์สพังหรือเปล่า");
  const problems = found.filter((c) => c.problem).map((c) => `${c.call} — ${c.problem}`);
  assert.deepEqual(problems, [], "รายการเรียกที่ตัวสแกนอ่านไม่ออก = แดง (ไม่ข้าม)");
  /* เทียบแบบนับซ้ำ (multiset) ไม่ใช่ `includes` — 🐞 กุญแจคือ ไฟล์ + อาร์กิวเมนต์ ⇒ รายการเรียกเงียบตัวที่สอง
     ที่ URL ซ้ำกับบรรทัดในบัญชี (เช่น `useApiList("/api/orders")` อีกตัวใน tax/filings/[id]) เคยผ่านเงียบ */
  const silent = found.filter((c) => !c.surfaces).map((c) => c.call);
  const tally = (list) => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const have = tally(silent);
  const owed = tally(KNOWN_SILENT);
  const newlySilent = [...have].filter(([k, n]) => n > (owed.get(k) ?? 0))
    .map(([k, n]) => (owed.has(k) ? `${k} (เงียบ ${n} รายการ · บัญชีมี ${owed.get(k)})` : k));
  assert.deepEqual(newlySilent, [],
    "รายการเรียกเหล่านี้ทิ้ง error ของ useApiList ⇒ API ล้มเมื่อไร จอจะวาดลิสต์ว่างเป็นคำตอบ — แกะ error/staleError/errorDetail/loaded แล้วขึ้น StatusNotice (ดู app/tax/page.js) · ห้ามเพิ่มเข้า KNOWN_SILENT");
  const paidOff = [...owed].filter(([k, n]) => n > (have.get(k) ?? 0)).map(([k]) => k);
  assert.deepEqual(paidOff, [],
    "บรรทัดเหล่านี้ในบัญชีหนี้ไม่เงียบแล้ว (แก้แล้ว/ย้าย/ลบ) — ลบออกจาก KNOWN_SILENT และลด KNOWN_SILENT_CAP ให้บัญชีตรงของจริง");
  assert.equal(new Set(KNOWN_SILENT).size, KNOWN_SILENT.length, "บัญชีหนี้ห้ามมีบรรทัดซ้ำ");
});

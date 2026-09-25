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
];

/* จอที่แจ้ง error ของลิสต์หลักอยู่แล้วและต้องแจ้งต่อไป — อยู่ทะเบียนนี้แทน SCREENS เพราะกติกา
   **รายไฟล์** ของ SCREENS (ทุก useApiList ในไฟล์แกะ error · ก้อน sources · staleError) ยังไม่ตรงกับจอพวกนี้:
   มีลิสต์ของ picker ที่โหลดตอนกางตัวกรอง (`pickerReady ? url : null`) ปนอยู่ด้วย
   ⚠️ ไม่ใช่ใบอนุญาตให้ลิสต์ของ picker เงียบ — รายการเรียกพวกนั้นเป็น **หนี้** ในบัญชี KNOWN_SILENT
      ของด่านรายการเรียกท้ายไฟล์ (ล้มแล้ว "ตัวเลือกว่าง" โดยไม่มีอะไรบอก = ยังต้องแก้) */
const ALREADY_REPORTING = [
  "app/tax/filings/page.js",
  "app/tax/registrations/page.js",
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

/* ทุกการเรียกในจอเหล่านี้เป็นข้อมูลที่จอวาดจริง (ไม่ใช่ลิสต์ของ picker ที่โหลดตอนกางเมนู)
   ⇒ ต้องแกะ `error` ออกมาทุกตัว ไม่ใช่แค่ตัวแรก */
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
  for (const rel of [...SCREENS, ...ALREADY_REPORTING]) {
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

/* นับ `<tag …>` (หรือข้อความ JSX ที่มี `text`) ในไฟล์ และตัวที่ **ไม่มีทางแยก `guard` คุ้มอยู่** — คุ้มได้สองทรง:
     (1) อยู่ในกิ่ง else (`alternate`) ของ `guard ? … : …` — ไล่ขึ้นทุกชั้น ⇒ ทางแยกซ้อน (`พัง ? … : ว่าง ? … : กราฟ`) ผ่าน
     (2) อยู่หลัง `if (guard) return …;` ในฟังก์ชันเดียวกัน (บล็อกเดียวกันหรือบล็อกที่ครอบอยู่) — ทรงของหน้ารายละเอียด
         ที่ `return` ป้ายออกไปก่อนถึงบรรทัด "ไม่พบ…"
   🐞 ทำไมไม่เทียบตำแหน่งตัวอักษร (`indexOf(ทางแยก) < indexOf("ไม่พบ…")`): ทางแยกที่ **ไม่ return** (แค่วาดป้าย) ก็อยู่
      ก่อนได้ แล้วจอยังไหลลงไปตอบ "ไม่พบ…" ต่อ · ทางแยกที่ return อยู่ในฟังก์ชันอื่น (`const shell = …`) ก็อยู่ก่อนได้
      ⇒ ถามโครงสร้างว่า **ถึงบรรทัดนั้นได้ก็ต่อเมื่อ guard เป็นเท็จ** · หยุดที่ขอบฟังก์ชัน: `if` ของฟังก์ชันอื่นคุ้มใครไม่ได้ */
const guardedIn = (source, match, guard) => {
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
  });
  const inElse = (path) => !!path.findParent((p) => p.key === "alternate"
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
  const unguarded = hits.filter((path) => !inElse(path) && !afterEarlyReturn(path));
  return { hits: hits.length, unguarded: unguarded.length };
};
const guardedBy = (rel, match, guard) => guardedIn(read(rel), match, guard);

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
  const component = () => {
    let fn = null;
    traverse(ast, { ExportDefaultDeclaration(path) { fn = path.get("declaration"); } });
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
    // ค่าที่คืนจากคำสั่งสุดท้ายของคอมโพเนนต์ (default export) — ทางปกติของจอ
    mainReturn() {
      const last = component()?.get("body.body").at(-1);
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
    // ปุ่ม `<Button …>` ตัวที่มีคำว่า "ลองใหม่" ใน `const notice = …` ⇒ { onClick, disabled, labelTest } เป็น path
    retryButton() {
      let out = null;
      declarator("notice")?.traverse({
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
];

test("หน้ารายละเอียด: ป้ายถูกวาดทั้งทางบล็อกและทางปกติ · ปุ่มลองใหม่เรียก reload ของทุกสายที่ล้ม · ทุกสายนับ staleError ของฮุกตัวเอง", () => {
  for (const { rel, blockedGuards } of DETAIL_PAGES) {
    const ast = astReader(rel);
    const notice = ast.bindingNamed("notice");
    assert.ok(notice, `${rel}: ไม่พบ \`const notice = …\``);
    for (const guard of blockedGuards) {
      const returned = ast.earlyReturn(guard);
      assert.ok(returned, `${rel}: ไม่พบ \`if (${guard}) return …\``);
      assert.ok(ast.rendersIn(returned, notice),
        `${rel}: \`if (${guard}) return …\` ต้องคืนป้าย (notice) — คืน null/ที่ว่าง = จอขาวที่ไม่บอกอะไร`);
    }
    assert.ok(ast.rendersAsChild(ast.mainReturn(), notice),
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
  ...ALREADY_REPORTING,
  // สหมิตร: เดิมเป็นกล่อง glass-panel สีแดงที่ขึ้นแต่ข้อความดิบ (ไม่มีประโยคไทยเลย) — ย้ายมาใช้กล่องกลาง
  "app/sahamit/forecast/page.js",
  "app/sahamit/material/page.js",
  "app/sahamit/po/page.js",
  "app/sahamit/po/[id]/page.js",
  "app/sahamit/reconcile/page.js",
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
     และ sahamit/po/[id]/edit (3 รายการเรียก) ย้ายเข้าทะเบียน SCREENS แล้ว · เพดาน 25 → 18 */
  // ลิสต์รองที่ป้อนการคำนวณ/ล็อกของจอ — ล้มแล้วค่าเพี้ยนเงียบ ไม่ใช่แค่ตัวเลือกว่าง
  'app/sahamit/po/[id]/page.js :: "/api/sahamit/material"',
  'app/sahamit/po/[id]/page.js :: "/api/sahamit/products"',
  'app/sahamit/po/page.js :: "/api/sahamit/material"',
  'app/sahamit/po/page.js :: "/api/sahamit/products"',
  'app/sahamit/po/new/page.js :: "/api/sahamit/products"',
  'app/sahamit/reconcile/page.js :: "/api/sahamit/coverage"',
  'app/sahamit/reconcile/page.js :: "/api/sahamit/products"',
  'app/sahamit/reconcile/page.js :: "/api/sahamit/flags"',
  'app/sahamit/forecast/page.js :: "/api/sahamit/products"',
  'app/sahamit/forecast/page.js :: "/api/pm/assignable-users"',
  'app/sahamit/forecast/page.js :: "/api/sahamit/forecast/mapped-lines"',
  'app/sahamit/material/page.js :: "/api/sahamit/products"',
  // ลิสต์ของ picker ที่โหลดตอนกางตัวกรอง/เปิดโมดัล — ล้มแล้ว "ตัวเลือกว่าง" โดยไม่มีอะไรบอก
  'app/tax/filings/page.js :: customersReady ? "/api/customers" : null',
  'app/tax/registrations/page.js :: pickerReady ? "/api/products" : null',
  'app/tax/registrations/page.js :: pickerReady ? "/api/customers" : null',
  'app/tax/registrations/[id]/page.js :: pickerReady ? "/api/products" : null',
  'app/tax/registrations/[id]/page.js :: pickerReady ? "/api/customers" : null',
  'app/tax/registrations/[id]/page.js :: pickerReady ? "/api/excise-registrations" : null',
];

/* เพดานของบัญชีหนี้ — เทียบสองทางแบบเพดานของ audit-ui.mjs
   🐞 เดิมบัญชีบังคับแค่ขาลง (บรรทัดที่แก้แล้วต้องลบ) ⇒ เติมบรรทัดเดียวในลิสต์ รายการเรียกเงียบตัวใหม่ก็ผ่านด่าน
      โดยดิฟดูเหมือนงานทำบัญชีธรรมดา · เลขนี้ทำให้การเพิ่มต้องขึ้นเพดานให้เห็นในรีวิว
   ⇒ แก้หนี้แล้ว: ลบบรรทัด + **ลด** เลขนี้ · ห้ามขึ้นเลขนี้ */
const KNOWN_SILENT_CAP = 18;

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

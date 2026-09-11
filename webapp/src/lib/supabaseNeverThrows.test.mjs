import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── supabase ไม่ throw — try/catch ที่ล้อมมันไว้จึงดักไม่ได้ (2026-09-09) ────
   `await supabase.from(...).insert(...)` **ไม่โยน exception** มันคืน
   `{ data, error }` ⇒ `try { … } catch { log }` ที่เขียนล้อมไว้ **ไม่เคยทำงาน**
   ⇒ ความล้มเหลวหายเงียบสนิท ไม่มีแม้แต่บรรทัด log ที่ผู้เขียนตั้งใจให้มี

   🐞 ของจริงที่เจอ (ไล่จากลายเดียวกับ #1687):

   ① `lib/audit.js` — หัวไฟล์เขียนกฎไว้เองว่า
        "audit ต้องไม่มีวันทำให้ action ของผู้ใช้พัง — insert ห่อ try/catch เสมอ
         action สำเร็จไปแล้วก่อนถึงตรงนี้; log พลาดก็แค่ log.error ทิ้ง"
      แต่ `console.error('[audit] record failed', …)` **ไม่เคยพิมพ์สักครั้ง**
      ⚠️ แพงที่สุดในชุดนี้: `audit_logs.before` คือ **ทางเดียว** ที่กู้ข้อมูลที่ถูกลบได้
      (ระบบไม่มีถังขยะ) ⇒ audit ที่เขียนไม่ลง = ของที่ลบไปแล้วกู้ไม่ได้ตลอดกาล

   ② `lib/master/priceHistory.js` — ทรงเดียวกัน ประวัติราคาหายเงียบ

   ③ `api/mgmt/trash` — อ่านรายการที่ soft-delete ไว้ · อ่านไม่ได้แล้วคืน []
      = "ถังขยะว่าง" ซึ่งแปลว่าไม่มีอะไรให้กู้ ทั้งที่ของอยู่ครบ

   ④ `api/sales-planning/my-dashboard` — 7 query ใน Promise.all เดียว ก้อนไหนพัง
      ก็กลายเป็น [] ⇒ แดชบอร์ดขึ้น "ไม่มีดีล/ไม่มีลีด/ไม่มีงาน" ทั้งที่ของอยู่ครบ
      (ไฟล์นั้นมีคอมเมนต์บันทึกโรคเดียวกันไว้แล้ว: `.single()` เคยทำให้จอขึ้น
       "ยังไม่ตั้งเป้า" ทั้งที่ตั้งไว้)

   ⚠️ ด่านนี้ล็อก **จุดที่ตาข่ายต้องทำงานจริง** ไม่ใช่เพดานที่โตตามงาน — ไล่นับ
   `const { data }` ทั้งรีโปแล้วตั้งเพดานคือการนับของที่ส่วนใหญ่ไม่ผิด */

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/* ตาข่ายสองตัวที่ "ห้ามพังเงียบ" — ทั้งคู่จงใจกลืน error ไว้ไม่ให้ล้มงานผู้ใช้
   แต่ต้อง **ได้ log** · ถ้าไม่รับ error มาเอง catch จะไม่มีวันทำงาน */
for (const [file, table] of [
  ["src/lib/audit.js", "audit_logs"],
  ["src/lib/master/priceHistory.js", "product_price_history"],
]) {
  test(`${path.basename(file)} — insert ต้องรับ error มาเอง ไม่งั้น catch ที่เขียนไว้ตายสนิท`, () => {
    const source = read(file);
    const insert = new RegExp(`const \\{ error \\} = await supabase\\.from\\('${table}'\\)\\.insert\\(`);
    assert.match(source, insert, `ต้องอ่าน error จาก insert ของ ${table}`);
    assert.match(source, /if \(error\) throw error;/,
      "ต้องโยนเข้า catch เดิม — catch นั้นคือที่ที่ log ถูกเขียนไว้แล้ว");
    assert.match(source, /catch[\s\S]{0,120}console\.error/,
      "catch ต้องยัง log อยู่ · เจตนาคือ 'ไม่ล้มงานผู้ใช้ แต่ต้องรู้ว่าพลาด'");
  });
}

test("ถังขยะ mgmt ต้องไม่กลายเป็น 'ว่าง' เพราะ query พัง", () => {
  const source = read("src/app/api/mgmt/trash/route.js");
  assert.match(source, /if \(res\.error\) throw res\.error/,
    "อ่านไม่ได้ต้องเป็น error ไม่ใช่ถังขยะว่าง — หน้านี้คือทางกู้ทางเดียวของ mgmt");
});

test("แดชบอร์ดส่วนตัวต้องเช็ค error ทุกก้อนใน Promise.all", () => {
  const source = read("src/app/api/sales-planning/my-dashboard/route.js");
  const guard = source.match(/for \(const res of \[([^\]]*)\]\)[\s\S]{0,80}res\?\.error/);
  assert.ok(guard, "ต้องมีลูปเช็ค error ของทุกผลลัพธ์");
  /* ทุกตัวที่ถูกอ่าน `.data` ต้องอยู่ในลูปตรวจ — เพิ่ม query ใหม่แล้วลืมใส่
     = ก้อนนั้นกลับไปพังเงียบคนเดียว */
  const checked = new Set(guard[1].split(",").map((s) => s.trim()));
  const readVars = new Set([...source.matchAll(/(\w+)\.data\s*(?:\|\||\?\?)/g)].map((m) => m[1]));
  const missing = [...readVars].filter((v) => !checked.has(v));
  assert.deepEqual(missing, [], `ผลลัพธ์เหล่านี้ถูกอ่าน .data แต่ไม่ได้เช็ค error: ${missing}`);
});

/* ── ความล้มเหลวที่ถูกอ่านเป็น "ไม่มี" (2026-09-11) ──────────────────────────
   error ของ supabase มาเป็นค่าที่คืน ⇒ ทิ้งมันแล้ว `count` เป็น null · `data` เป็น null
   ซึ่ง **หน้าตาเหมือนคำตอบว่า "ไม่มี" ทุกประการ** — ด่านที่ถามว่า "มีอยู่ไหม" จึงเปิดเอง

   🐞 ของจริงที่เจอ:
   ⑤ ลบดีล — ด่าน "มีใบเสนอราคาที่รับแล้วไหม" นับไม่ขึ้น = 0 = ผ่าน ⇒ FK cascade
      พาใบ accepted + SO หายเงียบ (คอมเมนต์เหนือด่านเขียนผลนี้ไว้เองแล้ว)
   ⑥ ลบโครงการ — ด่าน "ยังผูกดีลไหม" นับไม่ขึ้น = ผ่าน ⇒ ดีลหลุดจากโครงการ (SET NULL)
   ⑦ สร้างไทม์ไลน์ดีล — ด่านกันซ้ำนับไม่ขึ้น = ผ่าน ⇒ ไทม์ไลน์ซ้อนสองชุด
   ⑧ ลบ/แก้ไฟล์แนบ — อ่านแถวแม่ไม่ขึ้น = ถือว่า "แม่ถูกลบแล้ว" ⇒ ข้ามด่านสิทธิ์รายใบ
      เหลือด่านระบบล้วน · GET รายการไฟล์แนบตอบ [] ⇒ การ์ดเอกสารบังคับขึ้น "ยังไม่แนบ"
   ⑨ `supabase.from(…).delete().eq(…).catch(() => {})` — builder **ไม่มี `.catch`**
      ⇒ TypeError ก่อนคำขอจะถูกยิง ⇒ ตาข่ายย้อนข้อมูลไม่เคยทำงานสักครั้ง
   ⑩ `await supabase.rpc('force_delete_dept_request', …)` เปล่า ๆ ในเส้นลบโครงการ ⇒
      ลบคำร้องไม่ลงแล้วเดินต่อจนลบโครงการ (ตัวเดียวใน `.rpc()` 51 จุดทั้งรีโป) */

const SRC_FILES = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(WEBAPP, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.js$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(rel);
    }
  };
  walk("src");
  return out;
})();
// ลอกคอมเมนต์แต่คงบรรทัดไว้ — เลขบรรทัดในข้อความตกต้องชี้ตรงไฟล์จริง
const readKeepLines = (p) => fs.readFileSync(path.join(WEBAPP, p), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

test("ด่านนับ (count) ที่บล็อกงาน ต้องแยก error ออกก่อน — นับไม่ขึ้นไม่ใช่ 0", () => {
  const offenders = [];
  for (const file of SRC_FILES) {
    const source = readKeepLines(file);
    for (const m of source.matchAll(/const \{ count: (\w+) \} = await[\s\S]*?;\n([\s\S]{0,400})/g)) {
      const [, name, after] = m;
      const gate = new RegExp(`if \\(\\(?${name}(?: \\|\\| 0\\))? >=? ?\\d*\\)?[^\\n]*\\)?\\s*(?:\\{\\s*)?return (?:conflict|badRequest|forbidden|fail|Response\\.json)`);
      if (gate.test(after.split("\n").slice(0, 3).join("\n"))) offenders.push(`${file}:${lineOf(source, m.index)} (${name})`);
    }
  }
  assert.deepEqual(offenders, [], `ด่านเหล่านี้จะเปิดเองเมื่อ query พัง:\n${offenders.join("\n")}`);
});

test("ห้าม `.catch()` ต่อท้าย builder ของ supabase — มันไม่มีเมธอดนี้", () => {
  const offenders = [];
  for (const file of SRC_FILES) {
    const source = readKeepLines(file);
    /* builder มีแค่ `then` ⇒ `.catch` คือ TypeError แบบ synchronous ก่อนคำขอจะถูกยิง
       ผ่าน `.then(...)` แล้วได้ Promise จริง ⇒ `.catch` หลังนั้นใช้ได้ จึงยกเว้น */
    for (const m of source.matchAll(/\b(?:supabase|client|db|sb)\s*\.(?:from|rpc)\((?:(?!;|\.then\(|=>)[\s\S])*?\.catch\(/g)) {
      offenders.push(`${file}:${lineOf(source, m.index)}`);
    }
  }
  assert.deepEqual(offenders, [], `builder ของ supabase ถูกเรียก .catch():\n${offenders.join("\n")}`);
});

test("`.rpc()` ต้องรับผลเสมอ — ห้าม await เปล่า ๆ", () => {
  const offenders = [];
  for (const file of SRC_FILES) {
    const source = readKeepLines(file);
    for (const m of source.matchAll(/^\s*await (?:supabase|client|db|sb)\.rpc\(/gm)) {
      offenders.push(`${file}:${lineOf(source, m.index)}`);
    }
  }
  assert.deepEqual(offenders, [], `RPC ที่ทิ้งผล (supabase ไม่ throw — พังแล้วเดินต่อเงียบ):\n${offenders.join("\n")}`);
});

test("ด่านสิทธิ์ไฟล์แนบ: อ่านแถวแม่พังต้องหยุด ไม่ใช่ถือว่าแม่ถูกลบแล้ว", () => {
  const source = read("src/app/api/attachments/[id]/route.js");
  const guard = source.match(/async function guardAttachmentWrite[\s\S]*?\n}\n/);
  assert.ok(guard, "หา guardAttachmentWrite ไม่เจอ");
  const reads = [...guard[0].matchAll(/\{ data: (\w+)(?:, error: (\w+))? \} = await supabase/g)];
  assert.ok(reads.length >= 3, `คาดว่ามีอ่านแถวแม่ 3 ทาง เจอ ${reads.length}`);
  for (const [, name, errorName] of reads) {
    assert.ok(errorName, `อ่าน ${name} โดยไม่รับ error — พังแล้วได้ null = ข้ามด่านรายใบ`);
    assert.match(guard[0], new RegExp(`if \\(${errorName}\\) return`), `ต้องหยุดเมื่อ ${errorName}`);
  }
  const list = read("src/app/api/attachments/route.js");
  assert.match(list, /async function loadParent[\s\S]*?if \(error\) throw error;[\s\S]*?\n}/,
    "loadParent คืน null เมื่ออ่านพัง = GET ตอบ [] ('ยังไม่แนบ' ทั้งที่แนบครบ)");
});

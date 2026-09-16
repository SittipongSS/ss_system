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

/* ── เขียนแล้วไม่ดูผล: `await supabase.from(t).update(…)` เปล่า ๆ (2026-09-11) ─────
   ไล่ครบ 33 จุด (workflow ตรวจแบบแย้งทุกกลุ่ม) — ของจริงที่เจอ เช่น
   · ผูก/ย้ายดีลเข้าโครงการ: ถอนไทม์ไลน์ไม่ลงแล้วลบโครงการต่อ ⇒ FK cascade พาไทม์ไลน์
     ทั้งชุดของดีลหายถาวร · ตีดีลกลับไม่ลง ⇒ ดีลชี้โครงการใหม่ ไทม์ไลน์อยู่โครงการเก่า
   · แก้ประเภท/หมวดดีล: ลบไทม์ไลน์ชุดเดิมก่อนแล้ว insert ชุดใหม่ไม่ลง ⇒ ดีลไม่เหลือไทม์ไลน์
   · ปิดนัดช่าง "เปลี่ยนเครื่อง": ทะเบียนยังโชว์ตัวเก่าใช้งานอยู่ ตัวใหม่ไม่มีวันติดตั้ง
   · ลบงานส่วนตัว: ปลดล็อกงานต่อเนื่องไม่ลง ⇒ ใบถัดไปรองานที่ไม่มีอยู่แล้วตลอดไป
   · สัญญาที่ออกเลขแล้ว: ตรึงเนื้อไม่ลงแต่ส่งเนื้อสดไปพิมพ์ ⇒ ฉบับที่ลูกค้าเซ็นไม่ถูกเก็บ
   ทุกจุดตอนนี้อ่าน error แล้วหยุด / เตือนกลับจอ (ดู lib/apiWarnings) / log ตามผลที่เสีย

   ด่านสองชั้น:
   ① update/insert/upsert ที่ทิ้งผล = **ศูนย์** (ยกเว้นโมดูลสหมิตรที่พักรื้อไว้ทั้งเส้น)
   ② ที่เหลือ (ลบย้อนข้อมูลหลังตอบ error ไปแล้ว + สหมิตร) = เพดานสองทาง: เพิ่มไม่ได้ ·
      ลดแล้วต้องลดตัวเลขตาม ไม่งั้นช่องว่างถูกเติมกลับเงียบ ๆ */
const BARE_WRITE_BUDGET = 49;

function bareWrites() {
  const found = [];
  for (const file of SRC_FILES) {
    const lines = readKeepLines(file).split("\n");
    lines.forEach((line, i) => {
      if (!/^\s*await (?:supabase|client|db|sb|getSupabaseAdmin\(\))(?:\s*$|\s*\.)/.test(line)) return;
      let stmt = "";
      for (let j = i; j < lines.length && j < i + 40; j += 1) {
        stmt += `${lines[j]}\n`;
        if (/;\s*(\/\/.*)?$/.test(lines[j])) break;
      }
      const op = (stmt.match(/\.(insert|update|upsert|delete)\(/) || [])[1];
      if (op) found.push({ where: `${file}:${i + 1}`, op, sahamit: /sahamit/.test(file) });
    });
  }
  return found;
}

test("update/insert/upsert ต้องรับผลเสมอ — ห้าม await เปล่า ๆ", () => {
  const offenders = bareWrites()
    .filter((w) => w.op !== "delete" && !w.sahamit)
    .map((w) => `${w.where} (${w.op})`);
  assert.deepEqual(offenders, [], `เขียนแล้วไม่ดูผล (supabase ไม่ throw — พังแล้วตอบสำเร็จ):\n${offenders.join("\n")}`);
});

test(`ลบที่ทิ้งผล + สหมิตร: เพดานสองทาง = ${BARE_WRITE_BUDGET}`, () => {
  const rest = bareWrites().filter((w) => w.op === "delete" || w.sahamit);
  assert.ok(rest.length <= BARE_WRITE_BUDGET,
    `เพิ่มขึ้นเป็น ${rest.length} — รับ { error } ของคำสั่งใหม่ อย่าขยับเพดาน`);
  assert.equal(rest.length, BARE_WRITE_BUDGET,
    `ลดลงเหลือ ${rest.length} แล้ว — แก้ BARE_WRITE_BUDGET ให้ตรง ไม่งั้นช่องว่างถูกเติมกลับเงียบ ๆ`);
});

/* ── หน้ารวม/รายละเอียดโครงการ — อ่านไม่ขึ้นแล้วตัวเลขเป็นศูนย์ (2026-09-15) ────────
   ⑪ `api/pm/projects` เคย `const [{ data: tasks }, { data: deals }]` ⇒ อ่านดีลไม่ขึ้น
      ทุกโครงการบน /sa/projects ขึ้น FC Total / Actual / FC คงเหลือ / รออนุมัติ เป็น 0
      ⇒ หน้าตาเหมือน "ยังไม่มีดีล" ทุกประการ · หน้ารายละเอียดโครงการ (ProjectDealsHub)
      เป็นทรงเดียวกันทั้งดีล SO ใบเสนอราคา เธรด งาน สินค้า
   ⚠️ ด่านนี้ล็อกทั้ง handler GET ของสองไฟล์ — การอ่านใหม่ที่ลืมรับ error ตกทันที */
const getHandlerOf = (source) => {
  const start = source.indexOf("export const GET = withUser(");
  assert.ok(start >= 0, "หา handler GET ไม่เจอ");
  const next = source.indexOf("\nexport const ", start + 10);
  // `read` ลอกแค่คอมเมนต์ก้อน — คอมเมนต์บรรทัดที่เล่าบั๊กเก่า (`const { data }` ทิ้ง error) ต้องลอกด้วย
  return source.slice(start, next === -1 ? undefined : next).replace(/(^|\s)\/\/.*$/gm, "$1");
};

/* ตัวตรวจ: ทุก `{ data… }` ต้องรับ error ของ **ตัวเอง** และมี `if (…ชื่อนั้น…) return fail/throw`
   **หลังจุดอ่านนั้น** — เช็คที่อยู่ก่อนหน้า (ของอีกการอ่าน) ไม่นับ
   ⚠️ ชื่อ error ห้ามซ้ำใน handler — `const { data: a, error }` สองจุด เช็คตัวเดียวก็ผ่านทั้งคู่ได้ */
const uncheckedReads = (get) => {
  const reads = [...get.matchAll(/\{\s*data(?::\s*(\w+))?\s*(?:,\s*error(?::\s*(\w+))?\s*)?\}/g)];
  const problems = [];
  const errNames = reads.filter((m) => /error/.test(m[0])).map((m) => m[2] || "error");
  for (const [i, n] of errNames.entries()) if (errNames.indexOf(n) !== i) problems.push(`${n} (ชื่อ error ซ้ำ)`);
  for (const m of reads) {
    const [whole, alias, errAlias] = m;
    const name = alias || "data";
    if (!/error/.test(whole)) { problems.push(`${name} (ไม่รับ error)`); continue; }
    const errName = errAlias || "error";
    const after = get.slice(m.index + whole.length);
    const check = new RegExp(`if\\s*\\([^)]*\\b${errName}\\b[^)]*\\)\\s*\\{?\\s*(?:return fail|throw)`);
    if (!check.test(after)) problems.push(`${name} (รับ ${errName} แต่ไม่เช็คหลังจุดอ่าน)`);
  }
  return problems;
};

test("ตัวตรวจการอ่านใน GET — จับได้ทั้งลืมรับ error · เช็คไว้ก่อนจุดอ่าน · ชื่อซ้ำ และไม่ตกโค้ดที่ถูก", () => {
  const ok = [
    "const { data: a, error: aError } = await q;\nif (aError) return fail(aError.message, 500);",
    "const [{ data: t, error: tError }, { data: l, error: lError }] = await Promise.all([x, y]);\nif (tError || lError) return fail((tError || lError).message, 500);",
    "const { data: a, error: aError } = await q;\nif (aError) {\n  return fail(aError.message, 500);\n}",
    "const { data, error: reqError } = await q;\nif (reqError) throw reqError;",
  ];
  for (const snippet of ok) assert.deepEqual(uncheckedReads(snippet), [], snippet);
  assert.deepEqual(uncheckedReads("const { data: a } = await q;"), ["a (ไม่รับ error)"]);
  assert.deepEqual(uncheckedReads("if (bError) return fail(bError.message, 500);\nconst { data: b, error: bError } = await q;"),
    ["b (รับ bError แต่ไม่เช็คหลังจุดอ่าน)"]);
  assert.ok(uncheckedReads("const { data: a, error } = await q;\nif (error) return fail(error.message, 500);\nconst { data: b, error } = await r;")
    .includes("error (ชื่อ error ซ้ำ)"));
});

/* ⭐ `api/nav/counts` เข้ากองเดียวกัน (ADR 0016 · PR0) — ตัวนับที่กลืน error
   ไม่ได้ "เงียบ" เฉย ๆ มันตอบ **0** ซึ่งอ่านว่า "ไม่มีงานค้าง" แล้วหน้าแรกจะพูดตามนั้น
   (ADR 0016 ห้ามหน้าแรกแสดงตัวนับที่พังเป็น 0) */
for (const file of ["src/app/api/pm/projects/route.js", "src/app/api/pm/projects/[id]/route.js",
  "src/app/api/nav/counts/route.js"]) {
  test(`${file} — ทุกการอ่านใน GET ต้องรับ error และเช็คก่อนใช้`, () => {
    const problems = uncheckedReads(getHandlerOf(read(file)));
    assert.deepEqual(problems, [], `อ่านแล้วอาจกลายเป็น "ไม่มี" เงียบ ๆ: ${problems.join(", ")}`);
  });
}

test("หน้ารวมโครงการ — งาน/ดีลของทุกโครงการอ่านเป็นก้อน ไม่ใช่ .in() ทั้งลิสต์", () => {
  const get = getHandlerOf(read("src/app/api/pm/projects/route.js"));
  /* ids = ทุกโครงการที่มองเห็น ⇒ .in() ทั้งลิสต์ยาวเกิน 16 KB ได้ และ project_tasks เกิน 1,000 แถว */
  assert.doesNotMatch(get, /\.in\('projectId', ids\)/);
  for (const table of ["project_tasks", "sales_deals"]) {
    assert.match(get, new RegExp(`fetchInChunks\\(ids, \\(chunk\\) => fetchAllResult\\(\\(\\) => supabase\\s*\\.from\\('${table}'\\)[\\s\\S]*?\\.in\\('projectId', chunk\\)`),
      `${table} ต้องซอยก้อน + ไล่หน้า`);
  }
});

/* ── ตัวนับบนเมนู: "พัง" ต้องไม่กลายเป็น "ศูนย์" (ADR 0016 · PR0) ────────────
   uncheckedReads ข้างบนจับเฉพาะรูป `{ data }` — ตัวนับส่วนใหญ่ของไฟล์นี้เป็น
   head-count ที่รับแค่ `{ count }` และมีสองจุดที่ทิ้ง error ด้วย `.then((r) => r.data)`
   ซึ่งไม่มีรูป `{ data }` ให้จับเลย จึงต้องล็อกเพิ่มที่นี่ */
const countsGet = getHandlerOf(read("src/app/api/nav/counts/route.js"));

test("ตัวนับบนเมนู — ทุก head-count ต้องรับ error ของตัวเอง", () => {
  const heads = [...countsGet.matchAll(/\{\s*count(?:,\s*error(?::\s*(\w+))?)?\s*\}/g)];
  assert.ok(heads.length >= 8, `หา head-count ไม่เจอ (${heads.length}) — ตัวตรวจนี้ตายแล้วหรือรูปแบบเปลี่ยน`);
  const bare = heads.filter((m) => !/error/.test(m[0]));
  assert.deepEqual(bare.map((m) => m[0]), [], "รับแค่ { count } = query พังแล้วป้ายขึ้น 0 เงียบ ๆ");
  for (const m of heads) {
    const errName = m[1] || "error";
    const after = countsGet.slice(m.index + m[0].length);
    assert.match(after, new RegExp(`if \\(${errName}\\)\\s*throw ${errName}`),
      `${errName} รับมาแล้วแต่ไม่โยนต่อ — attempt() จะไม่มีวันรู้ว่าคีย์นี้พัง`);
  }
});

test("ตัวนับบนเมนู — ห้ามทิ้ง error ด้วย .then((r) => r.data)", () => {
  // 🐞 งานเข้าใหม่ (serviceIntake) เคยอ่านสี่ก้อนแบบนี้ ⇒ ก้อนที่พังกลายเป็นชุดว่าง
  // แล้ว bindQueue ตอบว่า "ไม่มีใบค้าง" ทั้งที่ยังไม่รู้ด้วยซ้ำว่ามีหรือไม่มี
  assert.doesNotMatch(countsGet, /\.then\(\(r\) => r\.data/);
});

test("ตัวนับบนเมนู — คีย์ที่นับไม่สำเร็จต้องถูกส่งออกไปให้จอรู้", () => {
  assert.match(countsGet, /failed\.push\(key\)/, "catch ต้องจดคีย์ที่พัง");
  assert.match(countsGet, /attempted\.push\(key\)/, "ต้องจดทุกคีย์ที่เริ่มนับ (ศูนย์ถูกตัดทิ้งทีหลัง)");
  assert.match(countsGet, /withCountStatus\(counts, attempted, failed\)/);
});

test("ตัวนับที่มาจากดีลทั้งกอง — ซอยก้อน + ไล่หน้า ไม่ใช่ .in() ทั้งลิสต์", () => {
  /* dealIds โตตามใบเสนอราคาที่อนุมัติแล้ว + ดีลที่ผูก FC กับใบ ⇒ ชนเพดาน URL ได้เอง
     และผลลัพธ์ของดีลหนึ่งใบมีได้หลายฉบับ ⇒ เกิน 1,000 แถวได้ด้วย */
  assert.doesNotMatch(countsGet, /\.in\('id', dealIds\)/);
  assert.doesNotMatch(countsGet, /\.in\('dealId', dealIds\)/);
  for (const column of ["id", "dealId"]) {
    assert.match(countsGet, new RegExp(`fetchInChunks\\(dealIds, \\(chunk\\) => fetchAllResult\\([\\s\\S]*?\\.in\\('${column}', chunk\\)`));
  }
});

test("ป้ายภาษี — นับด้วยตัวกรองขอบเขตตัวเดียวกับลิสต์", () => {
  /* 🐞 senior_ae / ac / ae มี scope 'team' ⇒ ลิสต์เห็นเฉพาะทีมตัวเอง + แถวไร้ทีม
     แต่ป้ายเคยนับทั้งตาราง ⇒ กดเข้าไปเจอน้อยกว่าที่ป้ายบอก */
  assert.match(countsGet, /applyExciseListScope\(\s*supabase\.from\(table\)/);
});

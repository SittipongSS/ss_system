import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ── `backdrop-filter` ต้องเขียน **บรรทัดมาตรฐานบรรทัดเดียว** — ห้ามเติม `-webkit-backdrop-filter` เอง ──────
   🐞 2026-10-08 — กฎที่เขียนคู่สองบรรทัด (มาตรฐานก่อน แล้วตามด้วย `-webkit-` = ลำดับที่คนเขียนกันปกติ) ตัว build
      (Lightning CSS) ยุบเหลือบรรทัด `-webkit-` บรรทัดเดียวใน CSS ที่ขึ้น production · Chrome ไม่รู้จัก property
      ที่มี prefix (`CSS.supports("-webkit-backdrop-filter", …)` = false) ⇒ **ไม่เบลอเลย** ทั้งที่ Safari เบลอ
      โดนสามกฎใน globals.css: .overlay (ฉากหลังโมดัลทุกใบ) · .topnav · .glass-panel (การ์ดที่ใช้อยู่ 80 กว่าไฟล์)
      ส่วนกฎที่เขียนบรรทัดมาตรฐานบรรทัดเดียว ตัว build เติม prefix ให้เอง ออกครบสองบรรทัด เบลอทุกเบราว์เซอร์
      ไม่มีอะไรฟ้อง: build ผ่าน · lint ผ่าน · เทสต์หน้าตาอ่านแต่ซอร์สซึ่ง "เขียนถูก" ทั้งสองบรรทัด
   มติเจ้าของ 08/10 (หลังวัด 96 เส้นทาง × จอกว้าง/มือถือ ใน Chrome):
      · .overlay — **คืนเบลอ** (จุดเดียวที่ตาเห็นความต่าง) ⇒ Chrome เท่า Safari
      · .topnav / .glass-panel — **ถอดเบลอ** (เปิดกลับแล้วพิกเซลต่างมากสุด 0.023% ตามองไม่เห็น) ⇒ Chrome เท่าเดิม
        Safari เลิกคำนวณเบลอที่ไม่มีใครเห็น
   ไฟล์นี้ล็อกทั้งมติและต้นเหตุ · อ่านซอร์สเท่านั้น — สิ่งที่ build ส่งออกจริงต้องดูจาก CSS ใต้ .next หลัง `npm run build`
   🪤 คอมเมนต์ในรีโปนี้เล่าบั๊กด้วยการยกโค้ดเดิมมาแปะ (ที่กฎทั้งสามมีคำว่า `-webkit-backdrop-filter` อยู่ในคอมเมนต์)
      ⇒ ต้องตัดคอมเมนต์ก่อนตรวจเสมอ และมีเทสต์ของตัวจับเองข้างล่างกันทั้ง "ฟ้องคอมเมนต์" และ "ศูนย์ปลอม" */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(HERE, "../../..");
const SRC = path.join(WEBAPP, "src");
const rel = (file) => path.relative(WEBAPP, file).replaceAll("\\", "/");

/** ตัดคอมเมนต์บล็อกแบบคงเลขบรรทัด (แทนด้วยช่องว่าง เก็บ \n ไว้ครบ) */
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
const readCss = (file) => blankComments(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** บรรทัด (เริ่มที่ 1) ของทุก declaration `-webkit-backdrop-filter:` ใน CSS ที่ตัดคอมเมนต์แล้ว
    จับเฉพาะ **declaration** (ขึ้นต้นบล็อก/หลัง `;`/หลังช่องว่าง แล้วตามด้วย `:`) — ไม่จับชื่อ property ที่เป็นค่า
    (`transition: -webkit-backdrop-filter …`) และไม่จับเงื่อนไข `@supports (-webkit-backdrop-filter: …)`
    ⚠️ ชื่อ property ของ CSS **ไม่สนตัวพิมพ์** — ตัว build ยุบ `-WEBKIT-BACKDROP-FILTER` เหมือนตัวพิมพ์เล็กทุกอย่าง
       (ลองกับ lightningcss 1.32.0 แล้ว 2026-10-08) ⇒ ตัวจับต้องมีธง `i` ไม่งั้นบรรทัดตัวใหญ่ลอดด่านแล้ว Chrome ไม่เบลอ */
function handWrittenPrefixLines(css) {
  return [...css.matchAll(/(?:^|[;{\s])-webkit-backdrop-filter\s*:/gi)]
    .map((m) => css.slice(0, m.index + m[0].length).split("\n").length);
}

/** แยกด้วยตัวคั่น เฉพาะที่อยู่นอกวงเล็บ */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.replace(/\s+/g, " ").trim());
}

/** กฎสไตล์ทุกตัวของสไตล์ชีต ตามลำดับในไฟล์ — { selectors[], body } · เดินเข้า @media/@supports/@container/@layer
    ข้าม at-rule ที่ข้างในไม่ใช่กฎสไตล์ (@keyframes · @font-face · @property · @page · @theme)
    ⚠️ วงเล็บปีกกาไม่สมดุล = พาร์สพัง ⇒ โยน error ให้เทสต์ตก ไม่ใช่คืนลิสต์สั้น ๆ แล้วผ่านเงียบ */
function styleRules(css) {
  const out = [];
  const scan = (from, to) => {
    let head = from;
    let i = from;
    while (i < to) {
      const ch = css[i];
      if (ch === ";") { head = i + 1; i += 1; continue; }
      if (ch === "}") throw new Error(`วงเล็บปีกกาปิดเกินที่ตำแหน่ง ${i}`);
      if (ch !== "{") { i += 1; continue; }
      const prelude = css.slice(head, i).trim();
      let depth = 1;
      let j = i + 1;
      while (j < to && depth > 0) {
        if (css[j] === "{") depth += 1;
        else if (css[j] === "}") depth -= 1;
        j += 1;
      }
      if (depth !== 0) throw new Error(`วงเล็บปีกกาไม่ปิด: ${prelude.slice(0, 60)}`);
      if (/^@(?:media|supports|container|layer)\b/.test(prelude)) scan(i + 1, j - 1);
      else if (!prelude.startsWith("@")) out.push({ selectors: splitTop(prelude, ","), body: css.slice(i + 1, j - 1) });
      head = j;
      i = j;
    }
  };
  scan(0, css.length);
  return out;
}

/** ค่าของ declaration ชื่อ `prop` ในบล็อก (ชื่อต้องตรงทั้งคำ — `backdrop-filter` ไม่นับ `-webkit-backdrop-filter`)
    เทียบชื่อแบบไม่สนตัวพิมพ์ — `Backdrop-Filter: blur()` บน .glass-panel คือเบลอที่กลับมาเหมือนกัน */
function declared(body, prop) {
  return body.split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl.includes(":") && decl.slice(0, decl.indexOf(":")).trim().toLowerCase() === prop)
    .map((decl) => decl.slice(decl.indexOf(":") + 1).trim());
}

/** ตัวประธานของ selector = compound ตัวท้ายสุด (หลัง combinator ตัวสุดท้ายที่อยู่นอกวงเล็บ) */
function subject(selector) {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) last = i + 1;
  }
  return selector.slice(last);
}
const hasClass = (compound, cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound);

const GLOBALS_FILE = path.join(SRC, "app", "globals.css");
const TOAST_FILE = path.join(HERE, "Toast.module.css");
const GLOBALS = styleRules(readCss(GLOBALS_FILE));
const TOAST = styleRules(readCss(TOAST_FILE));

/** กฎที่ selector เป็นคลาสนี้ **ล้วน ๆ** (กฎฐานของมัน) — ต้องมีอย่างน้อยหนึ่ง ไม่งั้นเทสต์ที่เรียกจะผ่านเงียบ */
function baseRules(rules, cls, where) {
  const hits = rules.filter((rule) => rule.selectors.includes(`.${cls}`));
  assert.ok(hits.length > 0, `หากฎ .${cls} ใน ${where} ไม่เจอ — ถ้าเปลี่ยนชื่อคลาส ต้องย้ายเทสต์นี้ตามไปด้วย`);
  return hits;
}

test("ตัวจับ: เห็น `-webkit-backdrop-filter` ที่เขียนมือ · ไม่ฟ้องคอมเมนต์ ค่า และ @supports", () => {
  const sheet = blankComments([
    "/* เดิมเขียน `-webkit-backdrop-filter: blur(4px);` คู่กัน */",
    ".a { backdrop-filter: blur(4px); }",
    ".b {",
    "  backdrop-filter: blur(4px);",
    "  -webkit-backdrop-filter: blur(4px);",
    "}",
    ".c{-webkit-backdrop-filter:blur(2px)}",
    ".d { transition: -webkit-backdrop-filter .2s; will-change: backdrop-filter; }",
    "@supports (-webkit-backdrop-filter: none) { .e { color: red; } }",
    ".f { backdrop-filter: blur(4px); -WEBKIT-BACKDROP-FILTER: blur(4px); }",
    ".g { Backdrop-Filter: blur(4px); }",
  ].join("\n"));
  assert.deepEqual(handWrittenPrefixLines(sheet), [5, 7, 10], "บรรทัดตัวพิมพ์ใหญ่ (10) ต้องโดนจับด้วย — ตัว build ยุบมันเหมือนกัน");

  const rules = styleRules(sheet);
  assert.deepEqual(rules.map((rule) => rule.selectors.join()), [".a", ".b", ".c", ".d", ".e", ".f", ".g"]);
  assert.deepEqual(declared(rules[5].body, "-webkit-backdrop-filter"), ["blur(4px)"], "ชื่อ property ไม่สนตัวพิมพ์");
  assert.deepEqual(declared(rules[6].body, "backdrop-filter"), ["blur(4px)"], "ชื่อ property ไม่สนตัวพิมพ์");
  assert.deepEqual(declared(rules[1].body, "backdrop-filter"), ["blur(4px)"]);
  assert.deepEqual(declared(rules[1].body, "-webkit-backdrop-filter"), ["blur(4px)"]);
  assert.deepEqual(declared(rules[2].body, "backdrop-filter"), [], "บรรทัด -webkit- ไม่นับเป็นบรรทัดมาตรฐาน");
  assert.deepEqual(declared(rules[3].body, "backdrop-filter"), [], "ชื่อ property ที่เป็นค่า ไม่ใช่ declaration");
  assert.equal(subject(".overlay > .glass-panel"), ".glass-panel");
  assert.equal(subject('[data-theme="dark"] .app:not(.x .y) .topnav:hover'), ".topnav:hover");
  assert.ok(hasClass(".topnav:hover", "topnav"));
  assert.ok(!hasClass(".topnav-system", "topnav"), ".topnav-system เป็นคนละคลาสกับ .topnav");
  assert.throws(() => styleRules(".a { color: red;"), /ไม่ปิด/);
});

test("ไม่มีสไตล์ชีตไหนใต้ src เขียน `-webkit-backdrop-filter` เอง", () => {
  const sheets = walk(SRC);
  /* กันศูนย์ปลอม — ถ้าเดินไฟล์ผิดที่ ลิสต์ว่างก็ "ไม่เจอ" เหมือนกัน */
  assert.ok(sheets.includes(GLOBALS_FILE) && sheets.includes(TOAST_FILE), "เดินไม่เจอ globals.css / Toast.module.css");
  assert.ok(sheets.filter((file) => file.endsWith(".module.css")).length >= 100, "เดินเจอ *.module.css น้อยผิดปกติ");

  const hits = sheets.flatMap((file) => handWrittenPrefixLines(readCss(file)).map((line) => `${rel(file)}:${line}`));
  assert.deepEqual(hits, [],
    "พบ `-webkit-backdrop-filter` ที่เขียนมือ:\n  " + hits.join("\n  ") + "\n"
    + "ลบบรรทัดนี้ทิ้ง เหลือ `backdrop-filter` บรรทัดเดียว — เมื่อกฎเดียวกันมีบรรทัดมาตรฐานแล้วตามด้วยบรรทัด `-webkit-`\n"
    + "ตัว build จะ **ทิ้งบรรทัดมาตรฐาน** ส่งออกแต่ `-webkit-backdrop-filter` ⇒ Chrome (ไม่รู้จัก prefix นี้) ไม่เบลอเลย\n"
    + "ส่วนกฎที่เขียนบรรทัดมาตรฐานบรรทัดเดียว ตัว build เติม prefix ให้ Safari เอง (วัดจาก CSS production 2026-10-08)");
});

test(".overlay (ฉากหลังโมดัล) ประกาศ backdrop-filter — มติ 08/10 คืนเบลอ", () => {
  const blur = baseRules(GLOBALS, "overlay", "globals.css").flatMap((rule) => declared(rule.body, "backdrop-filter"));
  assert.equal(blur.length, 1, "กฎฐาน .overlay ต้องมี backdrop-filter บรรทัดเดียว");
  assert.match(blur[0], /^blur\(/);
});

for (const cls of ["topnav", "glass-panel"]) {
  test(`.${cls} ไม่ประกาศ backdrop-filter — มติ 08/10 ถอดเบลอ`, () => {
    baseRules(GLOBALS, cls, "globals.css");
    /* ทุกกฎที่ **ตัวประธาน** เป็นคลาสนี้ ไม่ใช่แค่กฎฐาน — กัน `[data-theme="dark"] .glass-panel { backdrop-filter }`
       หรือ `.overlay > .glass-panel { … }` พาเบลอกลับเข้ามาทางข้าง */
    const back = GLOBALS
      .filter((rule) => rule.selectors.some((selector) => hasClass(subject(selector), cls)))
      .filter((rule) => declared(rule.body, "backdrop-filter").length + declared(rule.body, "-webkit-backdrop-filter").length > 0)
      .map((rule) => rule.selectors.join(", "));
    assert.deepEqual(back, [],
      `.${cls} ได้ backdrop-filter กลับมา — วัดแล้ว (2026-10-08) ไม่มีอะไรอยู่ข้างหลังให้เบลอ: เปิดเบลอแล้วพิกเซลต่างมากสุด 0.023%\n`
      + "เบลอที่มองไม่เห็นยังมีราคา: เบราว์เซอร์คำนวณทุกเฟรม และสร้าง stacking context + containing block ให้ลูก fixed/absolute\n"
      + "ถ้าพื้นผิวนี้จะไปลอยทับเนื้อหาจริง ให้ใช้พื้นทึบ (--panel-float / --panel-solid) ไม่ใช่เติมเบลอ");
  });
}

for (const [cls, rules, where] of [
  ["form-actions", GLOBALS, "globals.css"],             // แถบบันทึกลอยท้ายฟอร์ม (sticky · --panel)
  ["mobile-nav-sheet-header", GLOBALS, "globals.css"],  // หัวแผ่นเมนูมือถือ (sticky · อยู่ใน @media)
  ["chart-tooltip", GLOBALS, "globals.css"],            // ทูลทิปกราฟ
  ["toast", TOAST, "Toast.module.css"],                 // Toast (พื้น --panel 96% ลอยทับทุกหน้า)
]) {
  test(`.${cls} ยังประกาศ backdrop-filter บรรทัดมาตรฐาน (${where})`, () => {
    const blur = baseRules(rules, cls, where).flatMap((rule) => declared(rule.body, "backdrop-filter"));
    assert.equal(blur.length, 1,
      `.${cls} ต้องมี \`backdrop-filter\` บรรทัดเดียว — พื้นผิวนี้ลอยทับเนื้อหาและพึ่งเบลอ (ตัว build เติม -webkit- ให้เอง)`);
    assert.match(blur[0], /^blur\(/);
  });
}

/* ── ข้อยกเว้นของ audit:ui ที่มากับการถอดเบลอ .topnav ──────────────────────────────────────────
   กฎแผงลอยของ scripts/audit-ui.mjs: พื้น var(--panel) ที่ sticky/fixed ต้องคู่ backdrop-filter · .topnav เข้ากฎ
   ตามตัวอักษรทันทีที่ถอดเบลอ แต่พื้นของมันไม่เคยโผล่ (ลูกสองชั้นพื้น --navy ทึบปิดเต็ม) จึงยกเว้นไว้รายตัว
   โดย audit ตรวจทุกรอบว่าลูกยังประกาศพื้น var(--navy) · ที่นี่ล็อกสองด้านที่ audit ไม่ได้ดู — ลิสต์ยกเว้น **ห้ามโต**
   (ข้อยกเว้นที่ขยายได้เงียบ ๆ = สวิตช์ปิดด่าน) และ --navy **ทึบจริงทุกธีม** — แล้วตรวจพื้นของลูกซ้ำด้วยตัวพาร์สที่
   เดินเข้า @media ได้ (ตัวแบ่งบล็อกของ audit มองไม่เห็นกฎตัวแรกในแต่ละ @media) */
test("audit:ui ยกเว้นกฎแผงลอยให้ .topnav ตัวเดียว และลูกที่ปิดพื้นอยู่ทึบทุกธีม", () => {
  const audit = fs.readFileSync(path.join(WEBAPP, "scripts", "audit-ui.mjs"), "utf8");
  const from = audit.indexOf("const FLOATING_SURFACE_COVERED = new Map([");
  assert.notEqual(from, -1, "หา FLOATING_SURFACE_COVERED ใน scripts/audit-ui.mjs ไม่เจอ");
  const block = audit.slice(from, audit.indexOf("]);", from));
  const entries = [...block.matchAll(/\[\s*"([^"]+)"\s*,\s*\[([^\]]*)\]\s*\]/g)]
    .map((m) => ({ surface: m[1], coveredBy: [...m[2].matchAll(/"([^"]+)"/g)].map((c) => c[1]) }));
  /* ลบรายการออกได้ (วันที่ .topnav เปลี่ยนเป็นพื้นทึบ audit จะสั่งให้ลบเอง) — เพิ่มไม่ได้ */
  assert.ok(entries.length <= 1, "FLOATING_SURFACE_COVERED โตขึ้น — แผงลอยตัวใหม่ต้องใช้ --panel-float ไม่ใช่ขอยกเว้น");
  for (const entry of entries) {
    assert.deepEqual(entry, { surface: "src/app/globals.css .topnav", coveredBy: [".topnav-system", ".topnav-systems"] });

    const navy = [...readCss(GLOBALS_FILE).matchAll(/(?:^|[;{\s])--navy:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.ok(navy.length >= 2, "ต้องเจอ --navy ทั้งธีมสว่างและธีมมืด");
    for (const value of navy) assert.match(value, /^#[0-9a-f]{6}$/i, `--navy ต้องเป็นสีทึบ ไม่ใช่ ${value}`);
    for (const selector of entry.coveredBy) {
      const backgrounds = baseRules(GLOBALS, selector.slice(1), "globals.css")
        .flatMap((rule) => [...declared(rule.body, "background"), ...declared(rule.body, "background-color")]);
      assert.deepEqual(backgrounds, ["var(--navy)"],
        `${selector} ต้องปิดพื้น header ด้วย var(--navy) ทึบ (และไม่มีกฎไหนทับเป็นค่าอื่น) — นี่คือเหตุที่ .topnav ไม่ต้องมีเบลอ`);
    }
  }
});

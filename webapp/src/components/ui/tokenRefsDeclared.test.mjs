import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ── ทางกลับของ tokenUsage.test.mjs ────────────────────────────────────────
   ไฟล์ข้าง ๆ (`tokenUsage.test.mjs`) ถามว่า "ประกาศไว้แล้วมีใครใช้ไหม"
   ไฟล์นี้ถามทางกลับ: **อ้างชื่อไว้แล้วมีใครประกาศไหม** ซึ่งเป็นด้านที่ไม่เคยมียาม

   🔴 ทำไมต้องมี — `var(--ชื่อที่ไม่มีใครประกาศ)` **ไม่ error และไม่มีอะไรฟ้อง**
   ทั้ง build และ lint ผ่านหมด แต่เบราว์เซอร์ทิ้งทั้ง declaration ("invalid at
   computed-value time") แล้วผลลัพธ์แยกเป็นสองแบบที่หลอกตาคนละทาง:
     · พร็อพที่ **ไม่สืบทอด** ตกไปที่ค่าตั้งต้น — `background` = โปร่งใส ·
       `border-radius` = 0 · `border-top: 1px solid var(--line)` ทั้ง shorthand
       ตกเป็น `border-style: none` ⇒ **เส้นไม่ถูกวาดเลย** ไม่ใช่แค่สีเพี้ยน
     · พร็อพที่ **สืบทอด** ตกไปที่ค่าของพ่อแม่ — `font-weight: var(--fw-regular)`
       บนป้ายรองที่อยู่ในหัวข้อ --fw-semibold จึงได้ semibold = ตรงข้ามกับที่สั่ง
   ทั้งสองแบบ "ดูเหมือนตั้งใจ" จนไม่มีใครรายงานเป็นบั๊ก

   ของจริงที่เคยเกิด (ทั้งหมดเจอด้วยตาเปล่าทีหลัง ไม่ใช่ด้วยด่าน):
     · `--radius-md` — คอมเมนต์ที่ globals.css บันทึกไว้เอง: ใช้ 5 ที่ มุมเหลี่ยมมาตลอด
     · ชุด `--surface-*` ของ M3 ถูกถอดทิ้ง แต่เหลือคนอ้างอยู่ 12 จุด (กวาด 2026-09-16)
     · `TeamManager.module.css` จดบั๊กนี้ไว้ที่หัวไฟล์ตั้งแต่ 2026-09-06 แล้วไม่มีใคร
       ไล่ที่เหลือต่อ — เพราะไม่มีด่าน มันจึงเป็นแค่โน้ตของคนที่บังเอิญเห็น

   🪤 ห้าม "แก้ให้ผ่าน" ด้วยการประกาศชื่อที่ขาดเพิ่มเข้า globals.css โดยไม่คิด —
   บันได `--radius-*` / `--fw-*` / `--lh-*` ถูกล็อกชุดชื่อไว้ด้วยเทสต์ของมันเอง
   (radiusScale · fontWeightScale · lineHeightScale) และ `--radius-*` ยังเป็น
   namespace ที่ Tailwind v4 อ่านเองอีกชั้น ⇒ เพิ่มชื่อ = เปลี่ยน utility ทั้งระบบ
   ทางที่ถูกคือ **หยิบขั้นที่มีอยู่แล้วให้ตรงเจตนา** */

const WEBAPP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(WEBAPP, "src");

/* ชื่อที่ "มาจากที่อื่นจริง ๆ" — อ้างในรีโปนี้ได้ทั้งที่ไม่มีบรรทัดประกาศ
   ⚠️ เติมชื่อเข้าลิสต์นี้ได้เฉพาะเมื่อบอกได้ว่า **ใครเป็นคนตั้งค่าให้ตอนรัน**
   "ยังไม่ได้แก้" ไม่ใช่เหตุผล — ถ้าแก้ไม่ทันให้แก้ call site ไม่ใช่ขยายลิสต์
   (ว่างอยู่ตั้งแต่กวาดรอบ 2026-09-16 — ตั้งใจให้ว่าง) */
const FROM_ELSEWHERE = new Map([
  // ["--ชื่อ", "ใครตั้งค่าให้ และตั้งที่ไหน"],
]);

/* 🪤 ไฟล์เทสต์ไม่นับ — เทสต์ชั้นโทเคนเขียน CSS ปลอมเป็นสตริงไว้ป้อนตัวตรวจของตัวเอง
   (`--fs-N` · `--token` · `--dur-fast` ใน typeScale/utilityScaleSurface ฯลฯ) และ
   บางอันเป็น *ข้อความในคำฟ้อง* ไม่ใช่โค้ดที่เรนเดอร์ ⇒ ถ้านับด้วยจะฟ้องผิดตัวทุกรอบ */
const isTestFile = (rel) => /\.test\.mjs$/.test(rel);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/* คอมเมนต์ต้องถูกตัดก่อนเสมอ — คอมเมนต์ในรีโปนี้ *อธิบายบั๊กด้วยการยกโค้ดเดิมมาแปะ*
   เช่น "เคยเขียน `var(--warn-ink, var(--text-2))`" หรือบล็อก 🪦 ที่เล่าว่ากฎไหนถูกถอด
   ถ้าไม่ตัด ตัวตรวจจะไปฟ้องชื่อที่ "ตายไปแล้วและคอมเมนต์ก็บอกว่าตายแล้ว"
   แทนที่ด้วยช่องว่างจำนวนเท่าเดิม เพื่อให้เลขบรรทัดในคำฟ้องยังตรงกับไฟล์จริง */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    // `//` ท้ายบรรทัด แต่ต้องไม่กิน `https://` — ตัวนำหน้าห้ามเป็น `:` หรืออักษร
    .replace(/(^|[^:\w\\])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length));
}

const DECLARATION_PATTERNS = [
  /(?:^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g,        // CSS:  --x: value
  /["'`](--[a-zA-Z0-9_-]+)["'`]\s*:/g,          // JSX:  style={{ "--x": value }}
  /@property\s+(--[a-zA-Z0-9_-]+)/g,            // @property --x { … }
  /setProperty\(\s*["'`](--[a-zA-Z0-9_-]+)/g,   // el.style.setProperty("--x", v)
];

/* ชื่อที่ JS ประกอบตอนรัน เช่น SystemMenuSheet.js:125 `[`--x${fit}`, p.x]`
   เก็บเป็น "คำนำหน้า" แล้วยอมเฉพาะหางที่เป็น **ตัวเลขล้วน** (--x2 · --used-3 · --n-4)
   จงใจแคบกว่าที่ template literal ทำได้จริง เพราะคำนำหน้าสั้น ๆ อย่าง `--x` `--o`
   ถ้าปล่อยให้แมตช์หางเป็นตัวอักษรด้วย จะกลายเป็นใบเบิกทางให้ `--opacity-อะไรก็ได้`
   ที่พิมพ์ผิดหลุดด่านตามไป · ถ้าวันหนึ่งมีคนประกอบชื่อด้วยคำ (ไม่ใช่เลข) ด่านนี้จะ
   **ตกก่อน** แล้วค่อยมาขยายกติกาตรงนี้ — ตกผิดทางที่ปลอดภัยกว่า */
const DYNAMIC_PATTERN = /["'`](--[a-zA-Z0-9_-]*?)\$\{/g;
const DYNAMIC_TAIL = /^[0-9]{1,3}$/;

const REFERENCE_PATTERN = /var\(\s*(--[a-zA-Z0-9_-]+)/g;

/** หัวใจของด่าน — แยกออกมาเป็นฟังก์ชันเพื่อให้เทสต์ข้างล่างป้อนของปลอมเข้ามาพิสูจน์ได้
 *  @param files  [[ชื่อไฟล์, เนื้อไฟล์], …]
 *  @returns      ["--ชื่อ  ← ไฟล์:บรรทัด", …] เรียงตามชื่อ */
export function danglingTokenRefs(files, allowlist = FROM_ELSEWHERE) {
  const declared = new Set();
  const dynamicPrefixes = new Set();
  const referenced = new Map();

  for (const [name, raw] of files) {
    const source = stripComments(raw);
    source.split(/\r?\n/).forEach((line, index) => {
      const at = `${name}:${index + 1}`;
      for (const pattern of DECLARATION_PATTERNS) {
        for (const hit of line.matchAll(pattern)) declared.add(hit[1]);
      }
      for (const hit of line.matchAll(DYNAMIC_PATTERN)) {
        if (hit[1] !== "--") dynamicPrefixes.add(hit[1]);
      }
      for (const hit of line.matchAll(REFERENCE_PATTERN)) {
        if (!referenced.has(hit[1])) referenced.set(hit[1], at);
      }
    });
  }

  const builtDynamically = (token) =>
    [...dynamicPrefixes].some(
      (prefix) => token.startsWith(prefix) && DYNAMIC_TAIL.test(token.slice(prefix.length)),
    );

  const dangling = [];
  for (const [token, at] of referenced) {
    if (declared.has(token) || allowlist.has(token) || builtDynamically(token)) continue;
    dangling.push(`${token}  ← ${at}`);
  }
  return dangling.sort();
}

function repoFiles() {
  return walk(SRC)
    .map((full) => [path.relative(WEBAPP, full).replaceAll("\\", "/"), full])
    .filter(([rel]) => !isTestFile(rel))
    .map(([rel, full]) => [rel, fs.readFileSync(full, "utf8")]);
}

test("ทุก var(--…) ต้องมีคนประกาศชื่อนั้นไว้จริง", () => {
  const dangling = danglingTokenRefs(repoFiles());
  assert.deepEqual(
    dangling,
    [],
    "ชื่อพวกนี้ไม่มีใครประกาศ ⇒ ทั้ง declaration ถูกทิ้งเงียบ ๆ (พื้นโปร่ง · มุมเหลี่ยม · " +
      "เส้นหาย · น้ำหนักตัวอักษรกลับด้าน) — หยิบขั้นที่ประกาศไว้แล้วให้ตรงเจตนา " +
      "อย่าเพิ่งประกาศชื่อใหม่ บันไดหลายชั้นถูกล็อกชุดชื่อไว้ด้วยเทสต์ของมันเอง",
  );
});

/* ด่านที่ฟ้องว่า "ตัวด่านเองยังทำงานอยู่ไหม" — ถ้าใครแก้ regex หรือตัวตัดคอมเมนต์
   จนตัวตรวจตาบอด เทสต์จริงข้างบนจะผ่านเพราะไม่เจออะไรเลย ไม่ใช่เพราะสะอาด */
test("ตัวตรวจจับของปลอมได้จริง (ไม่ใช่ผ่านเพราะตาบอด)", () => {
  const declaredSomewhere = [
    ["globals.css", ":root { --panel-2: #f7f4ee; }"],
    ["card.module.css", ".card { background: var(--panel-2); }"],
  ];
  assert.deepEqual(danglingTokenRefs(declaredSomewhere), [], "ชื่อที่ประกาศแล้วต้องไม่ถูกฟ้อง");

  const broken = [
    ["globals.css", ":root { --panel-2: #f7f4ee; }"],
    ["card.module.css", ".card {\n  background: var(--surface-2);\n}"],
  ];
  assert.deepEqual(
    danglingTokenRefs(broken),
    ["--surface-2  ← card.module.css:2"],
    "ต้องฟ้องชื่อที่ไม่มีใครประกาศ พร้อมเลขบรรทัดที่อ้างถึงจริง",
  );

  /* ตัวสำรองไม่ใช่การประกาศ — `var(--x, var(--y))` ยังนับว่า --x ตายอยู่ดี
     (เคสจริง: audit/page.js เขียน `var(--surface-2, rgba(0,0,0,0.04))` จนไม่มีใครเห็น
     ว่าโทเคนตัวหลักตายไปแล้ว เพราะ "หน้ามันดูปกติ" ในธีมสว่าง) */
  const hiddenByFallback = [["x.css", ".a { color: var(--warn-ink, var(--text-2)); }"], ["t.css", ":root { --text-2: #555; }"]];
  assert.deepEqual(danglingTokenRefs(hiddenByFallback), ["--warn-ink  ← x.css:1"]);

  /* คอมเมนต์ที่ยกโค้ดเดิมมาเล่า ต้องไม่ถูกนับเป็นการอ้างจริง */
  const insideComment = [["y.css", "/* เคยเขียน var(--surface-2) ตรงนี้ */\n.a { color: var(--text-2); }"], ["t.css", ":root { --text-2: #555; }"]];
  assert.deepEqual(danglingTokenRefs(insideComment), []);

  /* ชื่อที่ JS ประกอบตอนรัน (`--x${n}`) ผ่านได้ แต่เฉพาะหางที่เป็นตัวเลขล้วน
     ไม่งั้นคำนำหน้าสั้น ๆ จะบังชื่อที่พิมพ์ผิดทั้งตระกูล */
  const dynamic = [
    ["sheet.js", "const vars = [[`--x${fit}`, p.x]];"],
    ["sheet.module.css", ".a { left: var(--x2); }\n.b { left: var(--xtra); }"],
  ];
  assert.deepEqual(danglingTokenRefs(dynamic), ["--xtra  ← sheet.module.css:2"]);
});

/* ลิสต์ยกเว้นต้องไม่บวมเกินจริง — กติกาเดียวกับ KNOWN_DEBT ใน tokenUsage.test.mjs */
test("ชื่อในลิสต์ยกเว้นต้องยังมีคนอ้างอยู่จริง", () => {
  const files = repoFiles();
  for (const [token, reason] of FROM_ELSEWHERE) {
    assert.ok(reason && reason.length > 10, `${token} ต้องเขียนเหตุผลว่าใครตั้งค่าให้`);
    const used = files.some(([, raw]) => new RegExp(`var\\(\\s*${token}\\b`).test(stripComments(raw)));
    assert.ok(used, `${token} ไม่มีใครอ้างแล้ว — เอาออกจาก FROM_ELSEWHERE`);
  }
});

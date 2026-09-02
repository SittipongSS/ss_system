import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── ผิวที่สอง: สเกลที่เขียนใน `style={{…}}` (2026-09-02) ─────────────────────
   `inlineTypeScale.test.mjs` คุม **ขนาดตัวอักษร** ในผิวนี้อยู่แล้ว · ไฟล์นี้คือสเกลที่
   ด่านเดิม **มองไม่เห็นเลย** เพราะ regex เขียนเป็น kebab-case ของ CSS ล้วน:
     `border-radius:` ไม่มีวันแมตช์ `borderRadius:` · `box-shadow:` ไม่แมตช์ `boxShadow:` ·
     `letter-spacing:` ไม่แมตช์ `letterSpacing:`
   ⇒ เลข 21/7/4 ที่ audit พิมพ์มาตลอดเป็นของฝั่ง CSS ล้วน ไม่ใช่ยอดรวมทั้งระบบ

   และรูที่สองซึ่งลึกกว่า: **กิ่งของ ternary** — `cond ? "50%" : "4px"` regex บรรทัดเดียว
   อ่านไม่เจอเลย · วัด 2026-09-02: borderRadius 3 จาก 73 · boxShadow 2 จาก 6 ·
   fontWeight **8 จาก 8** ซ่อนอยู่ในกิ่งทั้งหมด ⇒ `fontWeightViolations` ซึ่งเป็น
   hard-zero พิมพ์ 0 มาตลอดทั้งที่มีของจริง 8 จุด (สายพันธุ์เดียวกับศูนย์ปลอมของชั้นพิมพ์)

   ⚠️ แยกไฟล์จาก `utilityScaleSurface.test.mjs` (ผิว className) ตามกติกาเดิม —
   คนละภาษา คนละวิธีตัดคอมเมนต์ คนละงบประมาณในการยกเข้าโทเคน */

const root = path.join(process.cwd(), "src");
const AUDIT = fs.readFileSync(path.join(process.cwd(), "scripts", "audit-ui.mjs"), "utf8");

function uiFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:js|css)$/.test(entry.name)) out.push(full);
      }
    })(path.join(root, dir));
  }
  return out;
}

const rel = (file) => path.relative(process.cwd(), file).replaceAll("\\", "/");
const blankBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""));

/* ── ตัวอ่านค่า/แตกกิ่ง — ต้องทำงานเหมือน readStyleValue() + styleValueBranches()
   ใน audit-ui.mjs เป๊ะ ๆ ไม่งั้นเลขที่นับได้จะไม่ตรงเพดาน (มีเทสต์ผูกชื่อฟังก์ชันไว้
   ข้างล่างด้วย เพื่อให้รู้ทันทีว่าฝั่งโน้นถูกรื้อ) ─────────────────────────── */
function readStyleValue(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if ("([{".includes(ch)) { depth += 1; continue; }
    if (")]}".includes(ch)) {
      if (depth === 0) return source.slice(start, i);
      depth -= 1;
      continue;
    }
    if (ch === "," && depth === 0) return source.slice(start, i);
  }
  return source.slice(start);
}

function styleValueBranches(value) {
  const segments = [];
  const separators = [];
  let depth = 0;
  let quote = null;
  let last = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if ("([{".includes(ch)) { depth += 1; continue; }
    if (")]}".includes(ch)) { depth -= 1; continue; }
    if (depth === 0 && (ch === "?" || ch === ":")) {
      if (ch === "?" && value[i + 1] === "?") { i += 1; continue; }
      segments.push(value.slice(last, i));
      separators.push(ch);
      last = i + 1;
    }
  }
  segments.push(value.slice(last));
  const branches = [];
  segments.forEach((segment, index) => {
    if (separators[index] === "?") return;
    const text = segment.trim();
    const asString = text.match(/^(["'])((?:\\.|(?!\1)[^\\])*)\1$/);
    if (asString) branches.push({ kind: "string", text: asString[2] });
    else if (/^-?\d+(?:\.\d+)?$/.test(text)) branches.push({ kind: "number", text });
    else branches.push({ kind: "other", text });
  });
  return branches;
}

function styleDeclarations(source, prop) {
  const found = [];
  const pattern = new RegExp(`(?<![\\w$.])${prop}\\s*:\\s*`, "g");
  for (const match of source.matchAll(pattern)) {
    const value = readStyleValue(source, match.index + match[0].length);
    found.push({
      line: source.slice(0, match.index).split(/\r?\n/).length,
      value: value.trim(),
      branches: styleValueBranches(value),
    });
  }
  return found;
}

function collect(prop, keep) {
  const found = [];
  for (const file of uiFiles()) {
    const source = blankBlockComments(fs.readFileSync(file, "utf8"));
    for (const declaration of styleDeclarations(source, prop)) {
      for (const branch of declaration.branches) {
        if (keep(branch)) found.push(`${rel(file)}:${declaration.line} ${prop}: ${declaration.value}`);
      }
    }
  }
  return found;
}

/* กติกา "อะไรคือดิบ" ลอกจากฝั่ง CSS มาให้ตรงกันทุกข้อ รวมข้อที่รู้ว่าหลวม
   (ค่าที่มี var() อยู่ข้างในถูกข้ามทั้งสองผิวเท่ากัน — จะอุดต้องอุดพร้อมกัน) */
const rawRadius = (branch) => {
  if (branch.kind === "number") return Number(branch.text) !== 0;
  if (branch.kind !== "string") return false;
  const value = branch.text.trim();
  if (/\s/.test(value) || value.includes("var(") || value.endsWith("%")) return false;
  if (/^0[a-z]*$/.test(value) || value === "inherit") return false;
  return /^[0-9.]+(?:px|rem|em)$/.test(value);
};
const rawShadow = (branch) => {
  if (branch.kind !== "string") return false;
  const value = branch.text.trim();
  if (!value || value.includes("var(") || /^none$/i.test(value) || value === "inherit") return false;
  return true;
};
const rawLetterSpacing = (branch) => {
  if (branch.kind === "number") return Number(branch.text) !== 0;
  if (branch.kind !== "string") return false;
  const value = branch.text.trim();
  return !(value.includes("var(") || value === "0" || value === "normal");
};

test("audit:ui มีเพดานของผิว style object ครบและตกทั้งสองทาง", () => {
  for (const [cap, counter] of [
    ["RAW_RADIUS_JSX_CAP", "rawRadiusJsxCount"],
    ["RAW_SHADOW_JSX_CAP", "rawShadowJsxCount"],
    ["RAW_LETTER_SPACING_JSX_CAP", "rawLetterSpacingJsxCount"],
    ["JSX_FONT_WEIGHT_BRANCH_CAP", "jsxFontWeightBranchCount"],
  ]) {
    assert.match(AUDIT, new RegExp(`const ${cap} = \\d+;`), `หา ${cap} ไม่เจอ`);
    assert.match(AUDIT, new RegExp(`${counter} > ${cap}`), `${cap} ต้องฟ้องตอนเพิ่ม`);
    assert.match(AUDIT, new RegExp(`${counter} < ${cap}`), `${cap} ต้องฟ้องตอนลืมรูดเพดานลง`);
  }
});

/* ผูกกลไกไว้ตรง ๆ — ถ้ามีคนรื้อตัวแตกกิ่งทิ้งแล้วกลับไปใช้ regex บรรทัดเดียว
   ตัวเลขจะร่วงเองเงียบ ๆ (73 → 70 · 6 → 4 · 8 → 0) แล้วดูเหมือน "หนี้ลดลง" */
test("audit:ui ยังอ่านกิ่งของ ternary ในผิว style object", () => {
  for (const fn of ["blankBlockComments", "readStyleValue", "styleValueBranches", "styleDeclarations"]) {
    assert.match(AUDIT, new RegExp(`function ${fn}\\(`), `audit-ui.mjs ไม่มี ${fn}() แล้ว`);
  }
});

test("เพดาน RAW_RADIUS_JSX_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const RAW_RADIUS_JSX_CAP = (\d+);/) || [])[1]);
  const found = collect("borderRadius", rawRadius);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

test("เพดาน RAW_SHADOW_JSX_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const RAW_SHADOW_JSX_CAP = (\d+);/) || [])[1]);
  const found = collect("boxShadow", rawShadow);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

/* 🪤 จุดเดียวของระบบคือ `letterSpacing: -1` ที่ DealTimelineTable.js — react-dom
   ไม่มี letterSpacing ในลิสต์ unitlessNumbers ⇒ เรนเดอร์เป็น `letter-spacing: -1px`
   ซึ่งเป็นความผิดชนิดที่ฝั่ง CSS ตั้งเป็น **ข้อห้าม** (px ไม่ขยับตามขนาดตัวอักษร)
   ไม่ใช่รายการในเพดาน · ทางแก้ที่วัดไว้แล้ว: --fs-17 = 36px ⇒ -1px = -0.028em พอดี
   ⚠️ regex หน่วยของฝั่ง CSS มองไม่เห็นหน่วยใน `-1` — ใครยกมาใช้ตรง ๆ จะได้เพดานที่
   ผ่านด่านทั้งที่เป็นข้อห้าม (เทสต์นี้จึงล็อกไว้ว่า "ตัวเลขเปล่าต้องถูกนับ") */
test("เพดาน RAW_LETTER_SPACING_JSX_CAP ยังผูกกับของจริง และนับตัวเลขเปล่าเป็น px", () => {
  const cap = Number((AUDIT.match(/const RAW_LETTER_SPACING_JSX_CAP = (\d+);/) || [])[1]);
  const found = collect("letterSpacing", rawLetterSpacing);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
  assert.ok(rawLetterSpacing({ kind: "number", text: "-1" }),
    "ตัวเลขเปล่าในผิวนี้คือ px ต้องถูกนับ ไม่ใช่ปล่อยผ่านเพราะ 'ไม่มีหน่วย'");
});

/* น้ำหนักตัวอักษร: นับเป็น declaration ไม่ใช่จำนวนกิ่ง เพื่อให้เลขตรงกับ ledger
   ที่ระบุไฟล์+บรรทัดไว้ในคอมเมนต์เหนือ JSX_FONT_WEIGHT_BRANCH_CAP หนึ่งต่อหนึ่ง */
function fontWeightBranchDeclarations() {
  const found = [];
  for (const file of uiFiles()) {
    const source = blankBlockComments(fs.readFileSync(file, "utf8"));
    for (const declaration of styleDeclarations(source, "fontWeight")) {
      if (!declaration.branches.some((branch) => branch.kind === "number")) continue;
      found.push(`${rel(file)}:${declaration.line}`);
    }
  }
  return found;
}

test("เพดาน JSX_FONT_WEIGHT_BRANCH_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const JSX_FONT_WEIGHT_BRANCH_CAP = (\d+);/) || [])[1]);
  const found = fontWeightBranchDeclarations();
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)\n${found.join("\n")}`);
});

/* ledger เหนือ JSX_FONT_WEIGHT_BRANCH_CAP เขียนไฟล์+บรรทัดของทั้ง 8 จุดไว้ —
   ตัวเลขในคอมเมนต์ที่ผิดคือบั๊กตามกติกาของรีโปนี้ จึงผูกไว้ว่ามันต้องตรงกับของจริง
   (บรรทัดใน ledger เป็นของ **ไฟล์จริง** เพราะด่านใหม่ใช้ blankBlockComments) */
test("ledger ของ JSX_FONT_WEIGHT_BRANCH_CAP ตรงกับบรรทัดจริงทุกจุด", () => {
  for (const place of fontWeightBranchDeclarations()) {
    assert.ok(AUDIT.includes(place), `${place} ไม่ได้อยู่ใน ledger เหนือ JSX_FONT_WEIGHT_BRANCH_CAP`);
  }
});

/* จังหวะในผิว style object เป็น hard-zero — 4 จุดที่มีอยู่เป็น `spin 0.7s` (700ms)
   ซึ่งกติกาเดิมยกเว้นแอนิเมชัน ≥ 500ms ให้อยู่แล้ว ⇒ หนี้จริง 0 ตั้งได้ฟรี */
test("จังหวะในผิว style object ต้องเป็น 0", () => {
  const violations = [];
  for (const file of uiFiles()) {
    if (!file.endsWith(".js")) continue;
    const source = blankBlockComments(fs.readFileSync(file, "utf8"));
    for (const prop of ["transition", "transitionDuration", "transitionDelay", "animation", "animationDuration"]) {
      for (const declaration of styleDeclarations(source, prop)) {
        for (const branch of declaration.branches) {
          if (branch.kind !== "string") continue;
          if (/prefers-reduced-motion|0\.01ms/.test(branch.text)) continue;
          for (const hit of branch.text.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
            const ms = hit[2] === "ms" ? Number(hit[1]) : Number(hit[1]) * 1000;
            if (ms >= 500) continue;
            violations.push(`${rel(file)}:${declaration.line} ${prop}: ${hit[0]}`);
          }
        }
      }
    }
  }
  assert.deepEqual(violations, [], "เวลาใน style object ต้องมาจาก var(--motion-…)");
});

/* ── ตัวแตกกิ่งเองต้องถูกต้อง ไม่งั้นทุกเลขข้างบนผิดพร้อมกัน ────────────────── */
test("ตัวแตกกิ่งอ่าน ternary ได้ และไม่เก็บเลขในเงื่อนไขมาเป็นค่า", () => {
  assert.deepEqual(styleValueBranches('cond ? "50%" : "4px"').map((b) => b.text), ["50%", "4px"]);
  assert.deepEqual(styleValueBranches("a ? 800 : b ? 650 : 400").map((b) => b.text), ["800", "650", "400"]);
  /* เลข 2 อยู่ใน *เงื่อนไข* ไม่ใช่ค่า — ถ้าเก็บมาด้วยจะได้ borderRadius ปลอมเพิ่มทันที */
  assert.deepEqual(styleValueBranches('w > 2 ? "8px" : "4px"').map((b) => b.text), ["8px", "4px"]);
  assert.deepEqual(styleValueBranches("height / 2").map((b) => b.kind), ["other"]);
  assert.deepEqual(styleValueBranches('"var(--radius)"').map((b) => b.kind), ["string"]);
  assert.deepEqual(styleValueBranches("value ?? 8").map((b) => b.kind), ["other"]);
});

test("ตัวอ่านค่าไม่ตัดกลาง rgba() และหยุดที่คอมมาระดับนอกสุด", () => {
  const source = 'x = { boxShadow: "0 4px 12px rgba(0,0,0,0.1)", color: "red" }';
  const start = source.indexOf("boxShadow:") + "boxShadow:".length;
  assert.equal(readStyleValue(source, start).trim(), '"0 4px 12px rgba(0,0,0,0.1)"');
});

/* 2 จุดที่ regex ใดก็นับไม่ได้ — เขียนไว้ใน ledger ของ RAW_RADIUS_JSX_CAP แล้ว
   การมีของนับไม่ได้แล้วไม่บอก คือวิธีที่ "0" กลายเป็นคำโกหกรอบที่แล้ว */
test("จุดที่คำนวณตอนรันถูกบันทึกไว้ใน ledger ว่านับไม่ได้", () => {
  for (const place of [
    "src/components/salesPlanning/dashboard/performance/shared.js:71",
    "src/components/ui/Skeleton.js:5",
  ]) {
    assert.ok(AUDIT.includes(place), `${place} หายไปจาก ledger ของ RAW_RADIUS_JSX_CAP`);
  }
});

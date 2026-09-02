import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ── ด่านการเข้าถึงตัวแรกของระบบ: onClick ที่คีย์บอร์ดกดไม่ได้ (2026-09-02) ─────
   คู่กับ A11Y_KEYBOARD_CAP ใน scripts/audit-ui.mjs · เกณฑ์คือ **WCAG 2.1.1 Keyboard
   (ระดับ A)** — "ทุกฟังก์ชันสั่งงานด้วยคีย์บอร์ดได้" (docs/wcag-2.2-reference.md)

   ทำไมต้องมีไฟล์นี้: ก่อน 2026-09-02 CI มีด่าน 9 ตัวและเทสต์ 4,769 ตัว แต่ **ไม่มี
   ตัวไหนตรวจการเข้าถึงเลยสักตัว** ทุกด่านที่มีวัด "สไตล์ตรงโทเคนไหม" ซึ่งเป็นเรื่อง
   ความสม่ำเสมอของหน้าตา · ด่านนี้วัดคนละแกน: ใช้งานได้ไหมถ้าไม่มีเมาส์

   ⚠️ ต่างจากเทสต์คู่ตัวอื่นในโฟลเดอร์นี้ตรงที่ **ไม่ได้ก๊อป regex มาเทียบด้วย
   `AUDIT.includes(...)`** — ตัวจับของด่านนี้เป็นฟังก์ชันยาว ๆ ไม่ใช่ regex บรรทัดเดียว
   ก๊อปแล้วเทียบด้วย includes() จะจับได้แค่ว่า "มีอยู่" ไม่ใช่ "เหมือนกัน" · ที่นี่จึง
   ตัดฟังก์ชันทั้งก้อนออกมาจากทั้งสองไฟล์แล้วเทียบ **ตัวอักษรต่อตัวอักษร** ⇒ แก้ฝั่งใด
   ฝั่งหนึ่งแล้วไม่ยกไปอีกฝั่ง เทสต์แดงทันที ไม่ใช่รอให้เลขเพดานเพี้ยนแล้วค่อยรู้ */

const AUDIT_PATH = path.join(process.cwd(), "scripts", "audit-ui.mjs");
const AUDIT = fs.readFileSync(AUDIT_PATH, "utf8");
const SELF = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");

/* ตัดฟังก์ชันระดับบนสุดทั้งก้อน — หยุดที่ `}` ที่อยู่ต้นบรรทัด ไม่ใช่การนับวงเล็บ
   เพราะตัวจับพวกนี้มี `"{"` เป็น *สตริง* อยู่ในตัว (นับวงเล็บแล้วได้ก้อนยาว 1,248 บรรทัด) */
function topLevelFunction(source, name) {
  const start = source.indexOf(`\nfunction ${name}(`) + 1;
  assert.ok(start > 0, `หา function ${name}() ไม่เจอ`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `function ${name}() ไม่จบด้วย } ต้นบรรทัด`);
  return source.slice(start, end + 2);
}

/* ── สำเนาของตัวจับ ต้องเหมือน audit-ui.mjs ทุกตัวอักษร (มีเทสต์ล็อกไว้ข้างล่าง) ── */
const JSX_TAG_START = /[A-Za-z]/;
const JSX_NAME_CHAR = /[\w$:.-]/;
const HOST_TAG = /^[a-z][a-z0-9-]*$/;
const NATIVELY_CLICKABLE = new Set(["button", "input", "select", "textarea", "summary", "option", "label"]);
const CLICK_STOPPER = /^\{\s*\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>\s*\{?\s*(?:[A-Za-z_$][\w$]*\.(?:stopPropagation|preventDefault)\(\)\s*;?\s*)+\}?\s*\}$/;

function jsxTagEnd(source, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{" || ch === "(" || ch === "[") { depth += 1; continue; }
    if (ch === "}" || ch === ")" || ch === "]") { depth -= 1; if (depth < 0) return -1; continue; }
    if (ch === ">" && depth === 0) return i;
    if (ch === "<" && depth === 0) return -1;
  }
  return -1;
}

function jsxOpeningTags(source) {
  const tags = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue;
    if (!JSX_TAG_START.test(source[i + 1] || "")) continue;
    let j = i + 1;
    while (j < source.length && JSX_NAME_CHAR.test(source[j])) j += 1;
    const end = jsxTagEnd(source, j);
    if (end === -1) continue;
    tags.push({
      tag: source.slice(i + 1, j),
      line: source.slice(0, i).split(/\r?\n/).length,
      attrText: source.slice(j, source[end - 1] === "/" ? end - 1 : end),
    });
    i = j - 1;
  }
  return tags;
}

function jsxAttributes(attrText) {
  const attrs = new Map();
  let i = 0;
  while (i < attrText.length) {
    const ch = attrText[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "{") { // {...spread}
      const close = jsxBalancedEnd(attrText, i);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (!/[A-Za-z_$]/.test(ch)) { i += 1; continue; }
    let j = i;
    while (j < attrText.length && /[\w$:.-]/.test(attrText[j])) j += 1;
    const name = attrText.slice(i, j);
    let k = j;
    while (k < attrText.length && /\s/.test(attrText[k])) k += 1;
    if (attrText[k] !== "=") { attrs.set(name, ""); i = j; continue; } // แอตทริบิวต์เปล่า
    k += 1;
    while (k < attrText.length && /\s/.test(attrText[k])) k += 1;
    if (attrText[k] === "{") {
      const close = jsxBalancedEnd(attrText, k);
      if (close === -1) break;
      attrs.set(name, attrText.slice(k, close + 1));
      i = close + 1;
    } else if (attrText[k] === '"' || attrText[k] === "'") {
      const quote = attrText[k];
      let m = k + 1;
      while (m < attrText.length && attrText[m] !== quote) m += 1;
      attrs.set(name, attrText.slice(k, m + 1));
      i = m + 1;
    } else {
      i = k;
    }
  }
  return attrs;
}

function jsxBalancedEnd(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function classifyClickable(tag, attrs) {
  if (!attrs.has("onClick")) return "none";
  if (NATIVELY_CLICKABLE.has(tag)) return "native";
  if (tag === "a" && attrs.has("href")) return "native";
  if (CLICK_STOPPER.test((attrs.get("onClick") || "").replace(/\s+/g, " "))) return "stopper";
  const tabIndex = attrs.get("tabIndex") ?? "";
  const tabbable = /(?<![\w.-])0(?![\w.])/.test(tabIndex) && !/-\s*1(?![\d.])/.test(tabIndex);
  const takesKeys = attrs.has("onKeyDown") || attrs.has("onKeyUp") || attrs.has("onKeyPress");
  if (attrs.has("role") && tabbable && takesKeys) return "compliant";
  return "violation";
}
/* ── ตัวจับสองฝั่งต้องเป็นตัวเดียวกัน ─────────────────────────────────────── */
test("ตัวแยกแท็ก JSX + ตัวตัดสิน ต้องเหมือน audit-ui.mjs ทุกตัวอักษร", () => {
  for (const name of ["jsxTagEnd", "jsxOpeningTags", "jsxAttributes", "jsxBalancedEnd", "classifyClickable"]) {
    assert.equal(topLevelFunction(SELF, name), topLevelFunction(AUDIT, name),
      `${name}() ในเทสต์กับใน audit-ui.mjs ไม่เหมือนกันแล้ว — ก๊อปฝั่งที่แก้ไปทับอีกฝั่ง`);
  }
});

test("ค่าคงที่ของด่านต้องเป็นชุดเดียวกับ audit-ui.mjs", () => {
  for (const line of [
    "const JSX_TAG_START = /[A-Za-z]/;",
    "const JSX_NAME_CHAR = /[\\w$:.-]/;",
    "const HOST_TAG = /^[a-z][a-z0-9-]*$/;",
    'const NATIVELY_CLICKABLE = new Set(["button", "input", "select", "textarea", "summary", "option", "label"]);',
    `const CLICK_STOPPER = /${CLICK_STOPPER.source}/;`,
  ]) {
    assert.ok(AUDIT.includes(line), `audit-ui.mjs ไม่มีบรรทัด: ${line}`);
  }
});

/* ── เพดานต้องเป็น ratchet สองทาง ────────────────────────────────────────── */
test("A11Y_KEYBOARD_CAP ตกทั้งตอนเพิ่มและตอนลืมรูดลง", () => {
  assert.match(AUDIT, /a11yKeyboardCount > A11Y_KEYBOARD_CAP/, "เพดานต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /a11yKeyboardCount < A11Y_KEYBOARD_CAP/, "เพดานต้องฟ้องตอนลืมรูดเพดานลง");
});

/* ── ตัวแยกแท็กต้องทน `>` ในนิพจน์ ─────────────────────────────────────────
   นี่คือเหตุผลทั้งหมดที่ไม่ใช้ `<div\b([^>]*?)>` — วัด 2026-09-02: รูปนั้นตัดก่อนจบ
   แท็กจริง 700 จาก 11,522 แท็ก (6.1%) และใน 8 อันนั้น onClick อยู่หลังรอยตัด */
const TAG_FIXTURES = [
  ["arrow function ในแอตทริบิวต์ก่อนหน้า (ตัวการหลักของจริง)",
    '<div ref={(node) => { box = node; }} onClick={go}>x</div>', ["div"], true],
  ["เครื่องหมายมากกว่าในนิพจน์",
    '<div className="a" onClick={() => count > 1 && go()}>x</div>', ["div"], true],
  ["ลูกศรอยู่หลัง onClick ก็ยังต้องเจอแท็กถัดไป",
    '<tr onClick={() => go()}><td onClick={(e) => e.stopPropagation()}>x</td></tr>', ["tr", "td"], true],
  ["JSX ซ้อนอยู่ในแอตทริบิวต์ ต้องถูกนับด้วย",
    '<Table renderCell={(x) => <span onClick={go}>{x}</span>} />', ["span"], true],
  ["สตริงในแอตทริบิวต์ที่มี > อยู่ข้างใน",
    '<div title="a > b" onClick={go}>x</div>', ["div"], true],
  ["เทมเพลตที่มี ${} ซ้อน",
    '<div className={`a ${on ? "b" : "c"}`} onClick={go}>x</div>', ["div"], true],
  ["การเปรียบเทียบใน JS ธรรมดา ไม่ใช่แท็ก",
    "const small = items.filter((x) => x<y).length;", [], false],
];

for (const [label, code, expected, hasClick] of TAG_FIXTURES) {
  test(`ตัวแยกแท็ก: ${label}`, () => {
    const found = jsxOpeningTags(code)
      .filter((t) => HOST_TAG.test(t.tag) && jsxAttributes(t.attrText).has("onClick"))
      .map((t) => t.tag);
    assert.deepEqual(found, expected);
    assert.equal(found.length > 0, hasClick);
  });
}

test("เลขบรรทัดต้องตรงกับไฟล์จริง (ด่านที่ชี้ผิดบรรทัดคือด่านที่ไม่มีใครแก้ตาม)", () => {
  const code = ["const a = 1;", "", "<div", '  className="x"', "  onClick={go}", ">y</div>"].join("\n");
  const [tag] = jsxOpeningTags(code).filter((t) => jsxAttributes(t.attrText).has("onClick"));
  assert.equal(tag.line, 3, "ต้องรายงานบรรทัดที่ `<div` เปิด ไม่ใช่บรรทัดที่ onClick อยู่");
});

/* ── ต้องจับ / ห้ามจับ ─────────────────────────────────────────────────────
   ทุกบรรทัดข้างล่างมาจากรูปที่อยู่ในรีโปจริง ไม่ได้แต่งขึ้น */
const VERDICTS = [
  // ── ผ่านเพราะเป็น element จริง ─────────────────────────────────────────
  ["<button onClick={go}>", "native", "ปุ่มจริง ไม่ต้องเติมอะไรเลย"],
  ['<a href="/x" onClick={go}>', "native", "ลิงก์ที่มี href อยู่ในลำดับ Tab อยู่แล้ว"],
  ["<summary onClick={go}>", "native", "<summary> กดด้วย Enter/Space ได้เอง"],
  ["<input onClick={go}>", "native", "ช่องกรอกโฟกัสได้เอง"],
  // ── ตกเพราะ <a> ไม่มี href ─────────────────────────────────────────────
  ["<a onClick={go}>", "violation", "<a> ที่ไม่มี href ไม่อยู่ในลำดับ Tab เลย"],
  // ── ตัวกันคลิกทะลุ = ไม่มีฟังก์ชันให้เข้าถึง ───────────────────────────
  ["<td onClick={(e) => e.stopPropagation()}>", "stopper", null],
  ["<td onClick={(e) => { e.stopPropagation(); }}>", "stopper", null],
  ["<div onClick={(event) => event.stopPropagation()}>", "stopper", null],
  ["<div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>", "stopper", null],
  // 🪤 ของจริงที่ต้องไม่หลุด: stopPropagation นำหน้า แล้วทำงานจริงต่อ (pm/tasks/page.js:672)
  ['<span onClick={(e) => { e.stopPropagation(); router.push("/x"); }}>', "violation",
    "มี stopPropagation นำหน้า แต่ยังพาไปหน้าอื่นต่อ = มีฟังก์ชันให้เข้าถึง"],
  // ── ประกอบครบชุด ────────────────────────────────────────────────────────
  ['<div role="button" tabIndex={0} onKeyDown={onKey} onClick={go}>', "compliant", null],
  // รูปของ DetailRow.js:10 — role/tabIndex เป็นกิ่ง ต้องอ่านออก
  ['<tr role={href ? "link" : undefined} tabIndex={href ? 0 : undefined} onKeyDown={onKey} onClick={go}>',
    "compliant", "ค่าที่เป็นกิ่ง ternary ต้องนับว่าผ่าน ไม่งั้น DetailRow โดนฟ้องทั้งที่ถูก"],
  // ── tabIndex={-1} ไม่ใช่การอยู่ในลำดับ Tab ──────────────────────────────
  ['<div role="button" tabIndex={-1} onKeyDown={onKey} onClick={go}>', "violation",
    "tabIndex={-1} = โฟกัสด้วยโปรแกรมเท่านั้น กด Tab ไปไม่ถึง"],
  // ── ประกอบไม่ครบ ────────────────────────────────────────────────────────
  ['<div role="button" tabIndex={0} onClick={go}>', "violation", "มี role+tabIndex แต่ไม่มีตัวรับปุ่ม"],
  ["<div tabIndex={0} onKeyDown={onKey} onClick={go}>", "violation", "ไม่มี role (ข้อนี้ตก 4.1.2 ไม่ใช่ 2.1.1)"],
  // ── รูปที่เจอจริงในรีโป ─────────────────────────────────────────────────
  ['<th style={{ cursor: "pointer" }} onClick={() => onSort(col)}>', "violation", "หัวตารางเรียงลำดับ"],
  ['<tr className="clickable-row" onClick={() => router.push(`/x/${id}`)}>', "violation",
    ".clickable-row เป็นสัญญาณสายตา ไม่ใช่ทางเข้าด้วยคีย์บอร์ด"],
  ['<td onClick={() => onDrill(p)} title="คลิกเพื่อเจาะรายคน">', "violation",
    "title ไม่ขึ้นตอนโฟกัสด้วยคีย์บอร์ด"],
  ["<div onClick={onRowClick ? () => onRowClick(r) : undefined}>", "violation", null],
  // ── ไม่มี onClick = ไม่ใช่เรื่องของด่านนี้ ──────────────────────────────
  ["<div className=\"card\">", "none", null],
];

for (const [code, expected, why] of VERDICTS) {
  test(`ตัดสิน ${expected}: ${code}`, () => {
    const [tag] = jsxOpeningTags(`${code}x</x>`);
    assert.ok(tag, `แยกแท็กจาก ${code} ไม่ออก`);
    assert.equal(classifyClickable(tag.tag, jsxAttributes(tag.attrText)), expected, why || code);
  });
}

/* ── เพดานยังผูกกับของจริง ────────────────────────────────────────────────
   เดินไฟล์ชุดเดียวกับ `uiFiles` ของ audit-ui.mjs (.js ใต้ src/app + src/components)
   และล้างคอมเมนต์แบบเดียวกัน (`lined`) ไม่งั้นเลขไม่มีวันตรงเพดาน */
const blankBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""));
/* ⚠️ ต้องเป็นตัวเดียวกับใน audit-ui.mjs — รุ่น regex เดิมกิน `//` ในค่าสตริงของ
   แอตทริบิวต์แล้วกลืน `>` ที่ปิดแท็กไปด้วย ⇒ แท็กหายจากสายตาทั้งอัน (แก้ 2026-09-02) */
function blankLineComments(source) {
  let out = "";
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += source[i + 1] ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      } else if (ch === "\n" && quote !== "`") {
        /* สตริงเดี่ยว/คู่ปิดที่ท้ายบรรทัดเสมอ — กันสถานะค้างข้ามบรรทัดเวลาเจอโค้ดที่พังอยู่ */
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = source.length;
      out += " ".repeat(end - i);
      i = end - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function uiJsFiles() {
  const out = [];
  /* ⚠️ ต้องตรงกับขอบเขตของ scanA11y() ใน audit-ui.mjs เป๊ะ ๆ — **รวม src/lib ด้วย**
     ด่านนี้กว้างกว่า uiFiles หนึ่งชั้นโดยเจตนา เพราะ SortTh (หัวตารางเรียงลำดับที่
     12 ไฟล์ · 68 จุดเรียกใช้ · วัด 2026-09-02) อยู่ที่ src/lib/useSortableTable.js ถ้าเทสต์เดินแคบกว่าด่าน
     เลขจะไม่มีวันตรงเพดาน แล้วข้อความจะสั่งให้ "รูดเพดานลง" ซึ่งชี้ผิดที่
     📅 2026-09-02 SortTh ย้าย onClick ลง <button> ในเซลล์แล้ว ⇒ กลุ่ม `th` หายทั้งกลุ่ม
     (19 จุด · เพดาน 58 → 39) · ทรงของ primitive ถูกล็อกที่ src/lib/sortableHeader.test.mjs */
  for (const dir of ["app", "components", "lib"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js")) out.push(full);
      }
    })(path.join(process.cwd(), "src", dir));
  }
  return out;
}

function scan() {
  const counts = { native: 0, stopper: 0, compliant: 0, violation: 0 };
  const hits = new Map();
  for (const file of uiJsFiles()) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const lined = blankLineComments(blankBlockComments(fs.readFileSync(file, "utf8")));
    for (const { tag, line, attrText } of jsxOpeningTags(lined)) {
      if (!HOST_TAG.test(tag)) continue;
      const verdict = classifyClickable(tag, jsxAttributes(attrText));
      if (verdict === "none") continue;
      counts[verdict] += 1;
      if (verdict !== "violation") continue;
      if (!hits.has(rel)) hits.set(rel, []);
      hits.get(rel).push(`${rel}:${line} <${tag}>`);
    }
  }
  /* ⚠️ ต้องอ่านเฉพาะ *ในบล็อก* dismissScrimExempt — audit-ui.mjs มีตารางรายไฟล์ตัวอื่น
     ที่หน้าตาเหมือนกันเป๊ะ (nativeFeedbackDebt) กวาดทั้งไฟล์เมื่อไหร่ วันที่มีคนเติม
     หนี้ prompt() เข้าไป ด่านนี้จะหักโควตาให้ไฟล์ผิดตัวโดยไม่มีอะไรฟ้อง */
  const block = AUDIT.slice(AUDIT.indexOf("const dismissScrimExempt = {"));
  const scrim = Object.fromEntries(
    [...block.slice(0, block.indexOf("\n};")).matchAll(/^\s*"(src\/[^"]+)":\s*(\d+),$/gm)]
      .map((m) => [m[1], Number(m[2])]),
  );
  const violations = [...hits].flatMap(([rel, list]) => list.slice(scrim[rel] || 0));
  return { counts, violations, scrim };
}

test("เพดาน A11Y_KEYBOARD_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const A11Y_KEYBOARD_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา A11Y_KEYBOARD_CAP ไม่เจอ");
  const { violations } = scan();
  assert.equal(violations.length, cap,
    `ของจริงเหลือ ${violations.length} จุด แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

/* 🪤 เทสต์นี้คือตัวกัน "ด่านกลวง" — ด่านที่ยกเว้นทุกอย่างจนเหลือ 0 ก็ผ่านเพดานได้
   เหมือนกัน · ล็อกไว้ว่า **ทางยกเว้น** ยังกว้างเท่าเดิม ไม่ได้ถูกขยายเงียบ ๆ เพื่อกดเลขลง
   (ถ้าตัวเลขพวกนี้ขยับ ต้องมีคนอธิบายว่าทำไมในคอมมิตเดียวกัน)

   🐞 2026-09-02 รอบแรกล็อก `counts.native` (จำนวน <button> ทั้งระบบ) ไว้ที่ 553 ด้วย
   **ซึ่งผิด** — main เดินหน้าไป 8 คอมมิตแล้วมีคนเพิ่มปุ่มจริงอีก 2 ตัว เทสต์ก็ตกทันที
   ทั้งที่นั่นคือ *งานปกติที่ถูกต้อง* · `<button>` ไม่ใช่ "ทางยกเว้น" ของด่านนี้ — มันคือ
   โค้ดที่ไม่เคยเป็นความผิดตั้งแต่ต้น ⇒ ล็อกค่าตายตัวเท่ากับสั่งห้ามเพิ่มปุ่ม
   บทเรียน: ด่านต้องล็อก *ช่องที่ใช้โกงได้* ไม่ใช่ล็อกตัวเลขที่โตตามงานปกติ
   ไม่งั้นทีมจะเรียนรู้ว่า "เทสต์ตัวนี้ตกประจำ แก้เลขให้ผ่านไปก่อน" ซึ่งฆ่าด่านทั้งชุด
   เหลือไว้เป็นพื้นขั้นต่ำแทน: ปุ่มหายเป็นกลุ่มก้อน = มีคนแปลง <button> เป็น <div>

   ⬇️ 2026-09-02 รูดพื้นลง 553 → 550: สี่จุดย้ายจาก `<button className="linklike">`
   ดิบ ไปเป็น `<Button>` ของ primitive กลาง (ซึ่งยังเรนเดอร์ `<button>` จริง แค่ตัวสแกน
   นับเฉพาะ **แท็กตัวเล็ก** จึงมองไม่เห็น) — เป็นทิศทางที่ระบบต้องการ ไม่ใช่ปุ่มหาย
   ⚠️ ก่อนรูดพื้นลงครั้งหน้า ให้ยืนยันก่อนว่าจุดที่หายไป *ยังกดด้วยคีย์บอร์ดได้* จริง
   (ไปอยู่ใน `Button` / `ActionButton` / `<a href>`) ไม่ใช่กลายเป็น `<div onClick>` */
const NATIVE_BUTTON_FLOOR = 550;

test("ทางยกเว้นยังกว้างเท่าเดิม (กันด่านกลวง)", () => {
  const { counts } = scan();
  assert.equal(counts.stopper, 22, "ตัวกันคลิกทะลุที่ยกเว้นไป");
  assert.equal(counts.compliant, 2, "จุดที่ประกอบครบชุดอยู่แล้ว (DetailRow.js + deals/[id])");
  assert.ok(counts.native >= NATIVE_BUTTON_FLOOR,
    `<button> ทั้งระบบเหลือ ${counts.native} ต่ำกว่าพื้น ${NATIVE_BUTTON_FLOOR} — `
    + "ปุ่มจริงหายเป็นกลุ่ม แปลว่ามีคนแปลง <button> เป็นแท็กที่กดด้วยคีย์บอร์ดไม่ได้");
});

test("โควตาฉากหลังปิดกล่องต้องไม่ยกเว้นเกินของจริง", () => {
  const { scrim } = scan();
  assert.deepEqual(Object.keys(scrim).sort(), [
    "src/components/AppLayout.js",
    "src/components/Modal.js",
    "src/components/excise/RecordDrawer.js",
    "src/components/pm/PredecessorPicker.js",
  ], "ทะเบียน dismissScrimExempt เปลี่ยนไปจากที่ตรวจไว้ 2026-09-02");
  assert.equal(Object.values(scrim).reduce((sum, n) => sum + n, 0), 4, "รวมโควตาต้องเป็น 4");
});

/* ⚠️ ยังไม่ครอบ: วงโฟกัสของ .clickable-row (22 จุด ไม่มีกฎ :focus-visible ของตัวเอง
   ทั้งระบบ) และป้ายกำกับช่องกรอก · ทั้งสองเป็นคนละเกณฑ์ (2.4.7 Focus Visible ระดับ AA
   และ 3.3.2 Labels) รอบ 2026-09-02 จงใจไม่ตั้งด่านทับ — เทสต์นี้ไม่ได้ห้ามอะไร
   มันล็อกไว้ว่าด่านคีย์บอร์ด **ไม่ได้ครอบสองเรื่องนั้น** เพื่อไม่ให้ใครอ่านผลแล้วเข้าใจว่าครบ */
test("ด่านนี้ยังไม่ครอบวงโฟกัสและป้ายกำกับ (จงใจ)", () => {
  const focusRing = '<div className="clickable-row" role="button" tabIndex={0} onKeyDown={onKey} onClick={go}>';
  const [tag] = jsxOpeningTags(`${focusRing}x</div>`);
  assert.equal(classifyClickable(tag.tag, jsxAttributes(tag.attrText)), "compliant",
    "ด่านคีย์บอร์ดผ่านได้โดยยังไม่มีวงโฟกัส — เรื่องวงโฟกัสเป็น 2.4.7 ต้องตั้งด่านของมันเอง");
});

/* ── จุดบอดของการล้างคอมเมนต์ — ล็อกไว้ ไม่ใช่ทำเป็นไม่เห็น ────────────────────
   `blankBlockComments()` ไม่รู้จักสตริง ⇒ `"image/*"` เปิดคอมเมนต์บล็อกปลอมแล้ว
   **กลืนโค้ดจริง** ไปจนถึงตัวปิดคอมเมนต์ตัวถัดไป · ด่านคีย์บอร์ดอ่าน `lined` เหมือนกฎอื่นทั้งรอบ
   จึงมองไม่เห็นโค้ดช่วงนั้น (วัด 2026-09-02: 12 แท็กในไฟล์เดียว)

   เทสต์นี้ไม่ได้ห้ามให้มีจุดบอด — มันเป็น **สายสะดุด**: ล็อกรายชื่อ `onClick` ที่หายไป
   จากสายตาด่านไว้เท่าที่ตรวจด้วยมือแล้ว ถ้ามีรายการใหม่โผล่ ต้องมีคนเปิดดูว่ามันเกาะอยู่บน
   แท็กอะไร · ที่ต้องมีเพราะถ้าจุดบอดขยายจนกลืน `<div onClick>` สักตัว **เลขเพดานจะลดลง
   เองเงียบ ๆ ทั้งที่ไม่มีใครแก้อะไร** = "ศูนย์ปลอม" รูปแบบที่แนบเนียนที่สุด — ตัวเลขดูดีขึ้น
   เพราะด่านตาบอดลง ไม่ใช่เพราะโค้ดดีขึ้น

   ⚠️ จงใจ **ไม่** เดาชื่อแท็กด้วยโค้ด — ลองแล้วพัง: บรรทัดที่ปิดท้ายด้วย `</Button>`
   ทำให้ `<` ตัวสุดท้ายเป็นแท็กปิด และบรรทัดที่อยู่ใน JSDoc ไม่มีแท็กให้หาเลย
   ⇒ ตัวเดาจะให้คำตอบผิดอย่างมั่นใจ ซึ่งแย่กว่าการบังคับให้คนมาอ่าน 3 บรรทัดนี้เอง */
const SWALLOWED_ONCLICK = [
  /* สองจุดนี้โดนกลืนเพราะ `accept: "image/*"` ที่บรรทัด 74 ของไฟล์เดียวกัน
     อ่านด้วยมือแล้ว 2026-09-02: ทั้งคู่อยู่บน <Button> = คอมโพเนนต์ ไม่ใช่ host element
     จึงอยู่นอกขอบเขตด่านนี้อยู่แล้ว ต่อให้ด่านมองเห็นก็ไม่นับ */
  "src/components/service/CloseVisitSheet.js:369",
  "src/components/service/CloseVisitSheet.js:382",
  // JSDoc ที่เขียนว่า "href แทน onClick = รายการที่พาไปหน้าอื่น" — คอมเมนต์จริง ล้างถูกแล้ว
  "src/components/ui/RowActionMenu.js:25",
];

test("รายการ onClick ที่การล้างคอมเมนต์กลืนไป ต้องเท่าที่ตรวจด้วยมือไว้แล้ว", () => {
  const swallowed = [];
  for (const file of uiJsFiles()) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const raw = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const lined = blankLineComments(blankBlockComments(raw.join("\n"))).split(/\r?\n/);
    raw.forEach((line, index) => {
      if (!/onClick\s*=/.test(line) || /onClick\s*=/.test(lined[index] || "")) return;
      swallowed.push(`${rel}:${index + 1}`);
    });
  }
  assert.deepEqual(swallowed.sort(), [...SWALLOWED_ONCLICK].sort(),
    "รายการเปลี่ยนไปจากที่ตรวจไว้ 2026-09-02 — เปิดบรรทัดที่เพิ่มมาแล้วดูว่า onClick นั้นเกาะอยู่บนแท็กอะไร\n"
    + "ถ้าเป็นแท็ก HTML ตัวพิมพ์เล็ก (<div> <tr> <th> …) แปลว่าด่านตาบอดกับจุดนั้น เลขเพดานเชื่อไม่ได้แล้ว");
});

/* ⭐ **1.3.1 คนละข้อกับ 2.1.1 — ต้องนับแยก ห้ามให้ด่านหนึ่งลดเลขอีกด่านหนึ่งได้**
   🐞 เจอตอนรีวิว 2026-09-02: ตัวจัดกลุ่มถือว่า role + tabIndex + ตัวรับคีย์ = ผ่าน
   (ถูกตามเกณฑ์ 2.1.1) แต่ข้อความ error กับ UI_DESIGN_SYSTEM.md เขียนว่าห้ามใส่ role
   บน tr/th/td ⇒ เครื่องกับเอกสารพูดคนละเรื่อง และตัวที่ได้รับพรคือ DetailRow.js
   ซึ่ง 9 หน้าใช้อยู่ · ทางที่ไม่ขัดกันเองคือ **ยอมรับว่ามันผ่าน 2.1.1 จริง** แล้วนับ
   1.3.1 แยกเป็นเพดานของตัวเอง ⇒ ใครแก้ด่านคีย์บอร์ดด้วยการเติม role จะไปชนเพดานนี้แทน */
test("role บนแท็กตารางมีเพดานของตัวเอง และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /ROLE_ON_TABLE_TAG_CAP/);
  assert.match(AUDIT, /roleOnTableTagCount > ROLE_ON_TABLE_TAG_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /roleOnTableTagCount < ROLE_ON_TABLE_TAG_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});

test("เพดาน ROLE_ON_TABLE_TAG_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const ROLE_ON_TABLE_TAG_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา ROLE_ON_TABLE_TAG_CAP ไม่เจอ");
  const TABLE_TAG = /^(?:table|thead|tbody|tfoot|tr|th|td)$/;
  let found = 0;
  for (const file of uiJsFiles()) {
    const lined = blankLineComments(blankBlockComments(fs.readFileSync(file, "utf8")));
    for (const { tag, attrText } of jsxOpeningTags(lined)) {
      if (TABLE_TAG.test(tag) && jsxAttributes(attrText).has("role")) found += 1;
    }
  }
  assert.equal(found, cap, `ของจริงเหลือ ${found} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

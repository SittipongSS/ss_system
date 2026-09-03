import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ── ด่านการเข้าถึงตัวแรกของระบบ: onClick ที่คีย์บอร์ดกดไม่ได้ (2026-09-02) ─────
   คู่กับด่านคีย์บอร์ดใน scripts/audit-ui.mjs (บล็อกเต็มอยู่เหนือ `const HOST_TAG`)
   เกณฑ์คือ **WCAG 2.1.1 Keyboard (ระดับ A)** — "ทุกฟังก์ชันสั่งงานด้วยคีย์บอร์ดได้"
   (docs/wcag-2.2-reference.md)

   🏁 **2026-09-03 ด่านนั้นกลายเป็น hard-zero** — `A11Y_KEYBOARD_CAP` ถูกถอดทิ้งหลัง
   ไต่ลงมา 58 → 39 → 29 → 12 → 0 ⇒ เทสต์ในไฟล์นี้เปลี่ยนหน้าที่ตามไปด้วย: จากเดิม
   "เลขจริงต้องเท่าเพดาน" (ratchet สองทาง) เป็น **"เลขจริงต้องเป็น 0"** และเพิ่มด่าน
   กันคนเอาเพดานกลับมาใส่ · ที่ไม่เปลี่ยนคือหน้าที่หลักของไฟล์นี้ ซึ่งคือ **กันด่านกลวง**:
   ล็อกความกว้างของทางยกเว้นไว้ ไม่ให้ 0 มาจากการขยายข้อยกเว้นแทนการแก้โค้ด

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

/* สำเนาของ ROW_MIRROR / CARD_MIRROR — เงื่อนไขที่ทำให้ `<tr onClick>` ของ DetailRow และ
   `<div onClick>` ของ ClickableCard ถูกหักออกจากเพดานคีย์บอร์ดได้ · ทะเบียนการยกเว้น
   เต็ม ๆ (พร้อม 5 ข้อที่ตรวจไม่ได้) อยู่เหนือ `const ROW_PRIMITIVE` ใน scripts/audit-ui.mjs
   — ที่นี่เก็บแค่ตัวจับ เพราะต้องเทียบตัวอักษรต่อตัวอักษรกับฝั่งโน้น
   (ดูเทสต์ "ตัวแยกแท็ก JSX + ตัวตัดสิน …")
   ⭐ **ตัวจับมีชุดเดียวรับ `tag` เป็นพารามิเตอร์** ไม่ใช่สองก๊อป — ก๊อปที่สองคือก๊อปที่
   ไม่มีใครล็อกไว้กับใคร แล้วมันจะเดินหนีตัวแรกภายในไม่กี่คอมมิต */
const ROW_PRIMITIVE = "src/components/ui/DetailRow.js";
const CARD_PRIMITIVE = "src/components/ui/ClickableCard.js";

function mirrorMisses(rel, lined, tag) {
  const misses = [];
  const words = tag === "DetailRow"
    ? { unit: "แถว", where: "ในเซลล์", plain: "<tr className=\"premium-row\"> ธรรมดา" }
    : { unit: "การ์ด", where: "ในการ์ด", plain: "<div> ธรรมดา" };
  const opener = `<${tag}`;
  for (let at = lined.indexOf(opener); at !== -1; at = lined.indexOf(opener, at + opener.length)) {
    const line = lined.slice(0, at).split(/\r?\n/).length;
    const [open] = jsxOpeningTags(lined.slice(at));
    if (open?.tag !== tag) {
      misses.push(`${rel}:${line} อ่านแท็ก <${tag}> ไม่ออก — ด่านตรวจ${words.unit}นี้ไม่ได้ ต้องจัดรูปให้อ่านออกก่อน`);
      continue;
    }
    const href = jsxAttributes(open.attrText).get("href");
    if (!href) {
      misses.push(`${rel}:${line} <${tag}> ไม่มี href — ${words.unit}ที่ไม่พาไปไหนต้องเป็น ${words.plain}`);
      continue;
    }
    const close = lined.indexOf(`</${tag}>`, at);
    const body = close === -1 ? "" : lined.slice(at, close);
    const mirrored = jsxOpeningTags(body).some(({ tag: inner, attrText }) =>
      (inner === "a" || inner === "Link") && jsxAttributes(attrText).get("href") === href);
    if (!mirrored) {
      misses.push(`${rel}:${line} <${tag} href=${href}> ไม่มี <Link href=…> ปลายทางเดียวกัน${words.where}`);
    }
  }
  return misses;
}
/* ── ตัวจับสองฝั่งต้องเป็นตัวเดียวกัน ─────────────────────────────────────── */
test("ตัวแยกแท็ก JSX + ตัวตัดสิน ต้องเหมือน audit-ui.mjs ทุกตัวอักษร", () => {
  for (const name of ["jsxTagEnd", "jsxOpeningTags", "jsxAttributes", "jsxBalancedEnd", "classifyClickable", "mirrorMisses"]) {
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
    `const ROW_PRIMITIVE = "${ROW_PRIMITIVE}";`,
    `const CARD_PRIMITIVE = "${CARD_PRIMITIVE}";`,
  ]) {
    assert.ok(AUDIT.includes(line), `audit-ui.mjs ไม่มีบรรทัด: ${line}`);
  }
});

/* ── ด่านต้องเป็น hard-zero ไม่ใช่ ratchet (2026-09-03) ─────────────────────
   🪤 เทสต์นี้คือสิ่งที่กัน **การถอยกลับที่เนียนที่สุด**: วันหน้ามีคนเขียน `<div onClick>`
   ใหม่ แล้ว CI แดง · ทางที่ง่ายที่สุดสำหรับคนนั้นคือ "ตั้งเพดานไว้ที่ 1 ก่อน เดี๋ยวค่อยแก้"
   ซึ่งพอทำครั้งเดียวได้ ก็จะทำได้ทุกครั้ง แล้วด่านกลับไปเป็นโควตาเหมือนเดิม
   ⇒ ล็อกไว้ตรงนี้ว่า **ห้ามมีค่าคงที่เพดานของด่านนี้อยู่ในไฟล์เลย** */
test("ด่านคีย์บอร์ดต้องไม่มีเพดาน — ห้ามเอา ratchet กลับมา", () => {
  assert.doesNotMatch(AUDIT, /A11Y_KEYBOARD_CAP\s*=/,
    "มีคนเอาเพดานคีย์บอร์ดกลับมาใส่ — ด่านนี้เป็น hard-zero ตั้งแต่ 2026-09-03 "
    + "(ไต่ลงมา 58 → 39 → 29 → 12 → 0 แล้ว) · ของใหม่ไม่มีโควตา ต้องแก้โค้ดอย่างเดียว");
  assert.doesNotMatch(AUDIT, /a11yKeyboardCount\s*[<>]/,
    "ยังมีการเทียบ a11yKeyboardCount กับเพดานอยู่ — hard-zero ไม่เทียบกับอะไรทั้งนั้น");
});

test("ความผิดต้อง spread เข้า failures ตรง ๆ เหมือนด่าน hard-zero ตัวอื่น", () => {
  const failures = AUDIT.slice(AUDIT.indexOf("const failures = ["));
  assert.ok(failures.includes("\n  ...a11yFailureGroups(),"),
    "`failures` ต้อง spread `a11yFailureGroups()` ตรง ๆ (ไม่มี ternary/เพดานคั่น) — "
    + "ทรงเดียวกับ nestedInteractiveViolations / ROW_MIRROR / CARD_MIRROR");
  /* 🪤 ที่ต้องเช็กคู่กัน: ฟังก์ชันต้องคืน [] ตอนสะอาด ไม่งั้น spread ตรง ๆ จะทำให้
     audit แดงตลอดเวลาแม้ไม่มีความผิด แล้วคนจะรีบเอาเพดานกลับมาใส่เพื่อให้เงียบ */
  const body = topLevelFunction(AUDIT, "a11yFailureGroups");
  assert.match(body, /if \(!a11yKeyboardViolations\.length\) return \[\];/,
    "a11yFailureGroups() ต้องคืน [] เมื่อไม่มีความผิด — นั่นคือเงื่อนไขที่ทำให้ spread ตรง ๆ ได้");
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
  const rowMirror = [];
  const cardMirror = [];
  /* จำนวน **ที่เรียก** ของ primitive สองตัว — ไม่ได้ใช้ตัดสินความผิด แต่ใช้กัน
     "ด่านกลวงเพราะไม่มีใครเรียก": ด่าน MIRROR ทั้งคู่ผ่านฉลุยเมื่อ callers = 0
     (ลิสต์ misses ว่างเปล่าเท่ากันทั้งกรณีถูกและกรณีไม่มีของ) — ดู test ข้างล่าง */
  const primitiveUses = { DetailRow: 0, ClickableCard: 0 };
  for (const file of uiJsFiles()) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const lined = blankLineComments(blankBlockComments(fs.readFileSync(file, "utf8")));
    rowMirror.push(...mirrorMisses(rel, lined, "DetailRow"));
    cardMirror.push(...mirrorMisses(rel, lined, "ClickableCard"));
    for (const name of ["DetailRow", "ClickableCard"]) {
      primitiveUses[name] += (lined.match(new RegExp(`<${name}[\\s>]`, "g")) || []).length;
    }
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
  const scrimmed = [...hits].flatMap(([rel, list]) => list.slice(scrim[rel] || 0));
  /* ยกเว้นทางลัดเมาส์บนแถว — **สูตรเดียวกับ audit-ui.mjs เป๊ะ**: ยกเว้นได้ก็ต่อเมื่อ
     ROW_MIRROR ว่างทั้งระบบ และไฟล์ primitive เหลือจุดที่ต้องตัดสิน 1 จุดพอดี
     (จุดที่สองในไฟล์นั้นต้องถูกนับตามปกติ ไม่ใช่ยกทั้งไฟล์แบบ dismissScrimExempt) */
  const rowShortcutExempt = rowMirror.length === 0 && (hits.get(ROW_PRIMITIVE) || []).length === 1 ? 1 : 0;
  const cardShortcutExempt = cardMirror.length === 0 && (hits.get(CARD_PRIMITIVE) || []).length === 1 ? 1 : 0;
  const violations = scrimmed.filter((item) =>
    !(rowShortcutExempt && item.startsWith(`${ROW_PRIMITIVE}:`))
    && !(cardShortcutExempt && item.startsWith(`${CARD_PRIMITIVE}:`)));
  return { counts, violations, scrim, rowMirror, cardMirror, rowShortcutExempt, cardShortcutExempt, primitiveUses };
}

/* ── ⭐ เทสต์หลักของไฟล์นี้: ของจริงต้องเป็น 0 (2026-09-03) ───────────────────
   **นี่คือตัวที่ตกทันทีที่มีคนเติม `onClick` ลงบน host element ตัวใหม่** — ไม่ต้องรอ
   ให้ใครไปแตะเพดานหรือทะเบียนใด ๆ · `scan()` เดินไฟล์ชุดเดียวกับด่านจริงเป๊ะ
   (src/app + src/components + src/lib) และตัดสินด้วยฟังก์ชันสำเนาที่ถูกล็อกให้
   เหมือน audit-ui.mjs ตัวอักษรต่อตัวอักษร ⇒ เห็นสิ่งเดียวกับที่ CI เห็น

   ข้อความ error จงใจ **พิมพ์จุดที่ผิดออกมาทั้งหมด** ไม่ใช่บอกแค่จำนวน เพราะคนที่โดน
   เทสต์นี้ตกส่วนใหญ่ไม่รู้ตัวว่าไปแตะอะไร (เขียน `<div onClick>` ในการ์ดใบใหม่
   ก็โดนแล้ว) · การให้เลขเปล่า ๆ แปลว่าเขาต้องไปรัน audit ซ้ำอีกรอบเพื่อหาว่าตรงไหน */
test("ด่านคีย์บอร์ดของจริงต้องเป็น 0 (ตกทันทีที่มี onClick บน host element ตัวใหม่)", () => {
  const { violations } = scan();
  assert.deepEqual(violations, [],
    `พบ onClick ที่คีย์บอร์ดกดไม่ได้ ${violations.length} จุด — ด่านนี้เป็น hard-zero\n`
    + "แก้: พาไปหน้าอื่น → <Link href> · สั่งงานในหน้า → <button type=\"button\">\n"
    + "     แถวตาราง → <DetailRow href> + <Link href ตัวเดียวกัน> ในเซลล์ (ROW_MIRROR บังคับ)\n"
    + "     การ์ด → ครอบทั้งใบด้วย <Link>/<button> ถ้าข้างในไม่มีตัวกด · ถ้ามี ใช้ <ClickableCard href>\n"
    + "     สวิตช์พับ/กรอง → <button aria-expanded> / <button aria-pressed>\n"
    + "🚫 ห้ามแก้ด้วย role=\"button\"+tabIndex บน tr/th/td — ROLE_ON_TABLE_TAG_CAP (ก็ 0) ดักอีกชั้น\n"
    + "🚫 ห้ามแก้ด้วยการเติมทางยกเว้น — ความกว้างของทุกทางยกเว้นถูกล็อกไว้ในไฟล์นี้แล้ว");
});

/* ── กลุ่มที่ปิดไปแล้วต้องไม่ฟื้น — แยกรายแท็ก ไม่ใช่แค่ยอดรวม ────────────────
   🪤 ยอดรวมเป็น 0 อยู่แล้วก็จริง และ 0 ปิดช่อง "สลับที่กันใต้ยอดรวม" ไปโดยปริยาย
   (แลก div ออก 1 เขียน tr เข้า 1 แล้วยอดเท่าเดิม — ทำไม่ได้อีกแล้วเมื่อยอดต้องเป็น 0)
   ⇒ เทสต์นี้จึงไม่ได้มีไว้คุมตัวเลข แต่มีไว้ **คุมข้อความ**: มันบอกชื่อกลุ่มที่ฟื้นคืนชีพ
   ออกมาตรง ๆ พร้อมประวัติว่ากลุ่มนั้นเคยปิดด้วยท่าอะไร ⇒ คนที่โดนตกอ่านแล้วรู้ทันทีว่า
   ต้องไปเรียก primitive ตัวไหน ไม่ใช่ไปประดิษฐ์ท่าใหม่
   ⚠️ ห้ามลบกลุ่มออกจากตารางนี้ — ทุกกลุ่มปิดจบไปแล้วทั้งหมด รายการนี้คือ *ประวัติ*
      ที่ยังทำงานอยู่ ไม่ใช่รายการค้าง */
const CLOSED_GROUPS = {
  th: "SortTh (src/lib/useSortableTable.js) — ปุ่มอยู่ใน <th> · <th> ถือ aria-sort · ปิด 2026-09-02 (−19)",
  tr: "DetailRow (src/components/ui/DetailRow.js) + ด่าน ROW_MIRROR · ปิดหมด 2026-09-03",
  div: "ครอบทั้งใบด้วย <Link>/<button> · หรือ ClickableCard + ด่าน CARD_MIRROR · ปิด 2026-09-03 (−17)",
  span: "ชิปที่พาไปหน้าอื่น = <Link> จริง (ไม่ใช่ <span> ที่แขวนตัวรับคลิก) · ปิด 2026-09-03",
  td: "ห่อเนื้อในเซลล์ด้วย <button type=\"button\"> แล้วย้ายตัวรับคลิกไปที่ปุ่ม · ปิด 2026-09-03",
};

test("กลุ่มที่ปิดไปแล้วต้องไม่ฟื้นคืนชีพ (บอกชื่อกลุ่ม + ท่าที่ใช้ปิด)", () => {
  const { violations } = scan();
  const byTag = {};
  for (const spot of violations) {
    const tag = (spot.match(/<([a-z][\w-]*)>$/) || [])[1];
    assert.ok(tag, `อ่านแท็กจาก "${spot}" ไม่ออก — รูปของ hits เปลี่ยนไป`);
    (byTag[tag] ||= []).push(spot);
  }
  const revived = Object.keys(byTag).map((tag) =>
    `<${tag}> ${byTag[tag].length} จุด — ท่าที่กลุ่มนี้ใช้ปิด: ${CLOSED_GROUPS[tag] || "กลุ่มใหม่ที่ไม่เคยมีมาก่อน ต้องมีคนอ่านก่อน"}\n`
    + byTag[tag].map((spot) => `      ❌ ${spot}`).join("\n"));
  assert.deepEqual(byTag, {},
    `กลุ่มที่ปิดจบไปแล้วกลับมา:\n${revived.join("\n")}`);
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

/* ✅ **ตรวจซ้ำทั้งทะเบียน 2026-09-03 ตอนปิดด่านเป็น hard-zero** — พอยอดรวมเป็น 0
   เทสต์ตัวนี้กลายเป็น *ตัวเดียว* ที่ยังพิสูจน์ว่า 0 นั้นมาจากการแก้โค้ด ไม่ใช่จากการ
   ขยายข้อยกเว้น ⇒ ตัวเลขสี่ตัวข้างล่างคือของกลางที่ห้ามขยับโดยไม่มีคำอธิบาย
   วัดวันนี้: onClick บนแท็กตัวพิมพ์เล็กทั้งระบบ 593 จุด · เป็น <button> 565
   ⇒ เหลือให้ตัดสิน 28 = กันคลิกทะลุ 21 + ครบเกณฑ์ 1 + ดิบ 6
   (6 ดิบ = ฉากหลัง 4 + <tr> ของ DetailRow 1 + <div> ของ ClickableCard 1 ⇒ หักครบพอดี) */
test("ทางยกเว้นยังกว้างเท่าเดิม (กันด่านกลวง)", () => {
  const { counts, rowShortcutExempt, cardShortcutExempt } = scan();
  /* ⬇️ 2026-09-02 ลด 22 → 21: `<div onClick={(e) => e.stopPropagation()}>` ที่ห่อปุ่มท้ายแถว
     ของ ui/ApprovalQueue.js **กลายเป็นโค้ดตาย** พอแถวไม่มี onClick ให้ต้องกันคลิกทะลุแล้ว
     ⇒ ถอดออกในคอมมิตเดียวกัน · ไม่ใช่ "ทางยกเว้นแคบลง" แต่เป็นของที่ไม่มีงานทำแล้วจริง ๆ
     (ตัวกันของ `ApprovalActions` เองยังอยู่ครบ — มันห่อปุ่มของตัวเองในไฟล์ ApprovalStatus.js) */
  /* ⏸️ 2026-09-03 **ไม่ขยับ** ทั้งที่รอบนี้ถอด stopPropagation ออกไป 5 จุด — เพราะทั้งห้า
     เกาะอยู่บน `<Link>` (คอมโพเนนต์ตัวใหญ่) ซึ่งอยู่นอกสายตาด่านนี้ตั้งแต่ต้น ไม่เคยถูกนับ
     ⇒ 21 จุดที่นับได้ยังเป็นชุดเดิมเป๊ะ: td 11 · div 7 · span 2 · aside 1 (วัดซ้ำ 2026-09-03)

     🔍 **ตรวจ "ตัวกันที่กลายเป็นโค้ดตาย" ครบทั้ง 21 จุดแล้ว** — ตัวกันคลิกทะลุจำเป็นก็ต่อเมื่อ
     *แม่ยังกดได้อยู่* · รอบก่อนมีของจริงที่ตายไป 1 จุด (ตัวห่อปุ่มท้ายแถวของ `ui/ApprovalQueue`
     พอแถวเลิกรับคลิก) จึงต้องไล่ซ้ำทุกครั้งที่มีแม่เลิกเป็นตัวกด
     รอบนี้มีแม่เลิกเป็นตัวกด 2 จุด (`customers/[id]` แถวใบสั่งซื้อ · `ProjectDocumentView`
     แถบหัวเฟส) แต่ **ทั้งสองไฟล์ไม่มีตัวกันคลิกทะลุอยู่เลย** ⇒ ไม่มีอะไรตาย
     ส่วน 6 จุดใน `pm/tasks` ยังอยู่ใต้แม่ที่กดได้ทั้งหมด: 3 จุดใน `<ClickableCard>`
     (`miniCard` + การ์ดจอแคบ) · 3 จุดใน `<DetailRow>` ของ `taskRow` — ทั้งสอง primitive
     ยังถือทางลัดเมาส์ไว้ ⇒ ตัวกันยังมีงานทำจริง */
  assert.equal(counts.stopper, 21, "ตัวกันคลิกทะลุที่ยกเว้นไป");
  /* ⬇️ 2026-09-02 ลด 2 → 1: DetailRow.js **ออกจากช่องนี้** เพราะถอด role/tabIndex/onKeyDown
     ออกจาก <tr> แล้ว (`role="link"` ทับ `role="row"` ทิ้ง = ตก 1.3.1 · ROLE_ON_TABLE_TAG_CAP
     จึงรูดจาก 1 เหลือ 0 ได้ในคอมมิตเดียวกัน) · มันไม่ได้หายไปเฉย ๆ แต่ย้ายไปอยู่ช่องใหม่
     "ทางลัดเมาส์บนแถว" ซึ่งถูกล็อกด้วย rowShortcutExempt ข้างล่างและด่าน ROW_MIRROR
     ⇒ เพดานคีย์บอร์ดจึงไม่ขยับ (39 → 39): ดิบขึ้น 1 แล้วหักคืน 1
     เหลือ 1 คือ sales-planning/deals/[id] ที่เป็น <div role="button"> — คนละเรื่องกับตาราง */
  assert.equal(counts.compliant, 1, "จุดที่ประกอบครบชุดอยู่แล้ว (deals/[id] — <div role=\"button\")");
  /* 🔒 ทะเบียนการยกเว้นตัวใหม่ต้องไม่บวมเงียบ ๆ: ยกเว้นได้ **1 จุด** เท่านั้นทั้งระบบ */
  assert.equal(rowShortcutExempt, 1,
    "ทางลัดเมาส์บนแถวต้องถูกยกเว้น 1 จุดพอดี — 0 แปลว่า ROW_MIRROR ไม่ว่าง หรือ DetailRow.js "
    + "มีจุดที่ต้องตัดสินมากกว่า 1 (ทั้งสองกรณีต้องมีคนเปิดดู ไม่ใช่แก้เลขให้ผ่าน)");
  /* 🔒 ฝาแฝดฝั่งการ์ด — เงื่อนไขเดียวกันเป๊ะ ผูกกับ CARD_MIRROR แทน ROW_MIRROR */
  assert.equal(cardShortcutExempt, 1,
    "ทางลัดเมาส์บนการ์ดต้องถูกยกเว้น 1 จุดพอดี — 0 แปลว่า CARD_MIRROR ไม่ว่าง หรือ ClickableCard.js "
    + "มีจุดที่ต้องตัดสินมากกว่า 1");
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
  /* คอมเมนต์ไทยของรอบการ์ด 2026-09-02 ที่ **ยกโค้ดเก่ามาอ้าง** ว่าเดิมเขียนอะไรไว้
     (`เดิมทุกแถวเป็น <div onClick={() => router.push("/mgmt/tasks")}>`) — เป็นคอมเมนต์จริง
     ล้างถูกแล้ว · ของจริงบนหน้านั้นตอนนี้เป็น <Link> ที่หัวกล่อง + แถวเป็นข้อความล้วน
     🪤 บทเรียนของรายการนี้: **การอธิบายของเก่าด้วยการก๊อปโค้ดมาแปะ ทำให้ชื่อ prop
        โผล่ในสายตาของด่านทุกตัวที่อ่านไฟล์ดิบ** — ไม่ใช่แค่รายการนี้ อีกจุดในรอบเดียวกัน
        เขียน `className="ui-badge"` ในคอมเมนต์แล้วไปบวกตัวนับ .ui-badge ของหน้าต้นแบบ
        (badgeFamilies.test.mjs) จน "จำนวนจุดที่ใช้งานจริง" เพี้ยนไป 1 ⇒ เขียนอ้างของเก่า
        ให้เลี่ยงรูปที่เป็นโค้ดจริง เช่น `<div>` ที่แขวน onClick ไว้ (ไม่มีเครื่องหมาย =) */
  "src/app/mgmt/page.js:132",
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

/* ── ROW_MIRROR: ทางเข้าของคีย์บอร์ดต้องอยู่ในเซลล์ (2026-09-02) ────────────────
   ⭐ นี่คือ **เงื่อนไขของการยกเว้น** ไม่ใช่ด่านสวยงามแยกต่างหาก · `<tr onClick>` ของ
   DetailRow ถูกหักออกจากด่านคีย์บอร์ดได้ก็เพราะด่านนี้ยืนยันว่าทุกที่เรียกมี <Link>
   ปลายทางเดียวกันอยู่ในเซลล์ ⇒ ผ่อนด่านนี้เมื่อไหร่ `<tr onClick>` ของ DetailRow กลับมา
   เป็นความผิด 1 จุดทันที และด่านคีย์บอร์ดเป็น **hard-zero** แล้ว ⇒ CI แดงสองด่านพร้อมกัน

   🪤 **กับดักที่ชุดฟิกซ์เจอร์นี้มีไว้กัน**: เขียนเงื่อนไขเป็น "แถวมีอะไรโฟกัสได้ข้างในก็พอ"
   แล้วมันจะดูเหมือนทำงาน — แต่แถวที่มีแค่ปุ่ม "ลบ" ก็ผ่าน ทั้งที่ *การเปิดรายละเอียด*
   ยังเข้าไม่ถึงด้วยคีย์บอร์ด · ด่านที่ปล่อยของผิดผ่านเงียบ ๆ แย่กว่าไม่มีด่าน
   ⇒ ทุกบรรทัดข้างล่างเทียบ **ปลายทาง** ไม่ใช่ "ความมีอยู่ของสิ่งที่โฟกัสได้" */
const ROW_MIRROR_FIXTURES = [
  ["ลิงก์ในเซลล์ href เหมือนกันเป๊ะ = ผ่าน (ทรงของ 8 หน้าจริง)",
    "<DetailRow href={`/sa/deals/${deal.id}`}>"
    + "<td><Link prefetch={false} href={`/sa/deals/${deal.id}`} className=\"linklike\">x</Link></td>"
    + "</DetailRow>", 0],
  ["<a href> ธรรมดาก็นับ ไม่ได้บังคับว่าต้องเป็น <Link>",
    '<DetailRow href="/x/1"><td><a href="/x/1">x</a></td></DetailRow>', 0],
  ["🪤 แถวที่มีแค่ปุ่มลบ = ตก (มีของโฟกัสได้ แต่ 'เปิดรายละเอียด' ยังเข้าไม่ถึง)",
    "<DetailRow href={`/sa/deals/${deal.id}`}>"
    + "<td>{deal.title}</td><td><button type=\"button\" onClick={del}>ลบ</button></td>"
    + "</DetailRow>", 1],
  ["🪤 ลิงก์ดินสอ 'แก้ไข' ไม่ใช่ทางเข้าของการเปิดรายละเอียด — คนละปลายทาง",
    "<DetailRow href={`/sa/quotations/${r.id}`}>"
    + "<td><Link href={`/sa/quotations/${r.id}?edit=1`}>แก้</Link></td>"
    + "</DetailRow>", 1],
  ["🪤 ทรงของ RenewalsPanel เดิม: ลิงก์ไป SO แต่แถวหมายถึงไซต์ = ตก",
    "<DetailRow href={`/sa/service-sites/${row.siteId}`}>"
    + "<td><Link href={`/sa/sales-orders/${row.order.id}`}>x</Link></td>"
    + "</DetailRow>", 1],
  ["<DetailRow> ที่ไม่ส่ง href เลย = ตก (แถวที่ไม่พาไปไหนต้องเป็น <tr> ธรรมดา)",
    '<DetailRow className="premium-row"><td><Link href="/x/1">x</Link></td></DetailRow>', 1],
  ["เขียน href คนละข้อความแต่ปลายทางเดียวกัน = ตก (ตั้งใจให้เข้ม — ยกเป็น detailHref)",
    "<DetailRow href={`/x/${row.id}`}><td><Link href={\"/x/\" + row.id}>x</Link></td></DetailRow>", 1],
  ["สองแถวในไฟล์เดียว ตรวจแยกกันคนละใบ",
    '<DetailRow href="/a"><td><Link href="/a">a</Link></td></DetailRow>'
    + '<DetailRow href="/b"><td>b</td></DetailRow>', 1],
];

for (const [label, code, expected] of ROW_MIRROR_FIXTURES) {
  test(`ROW_MIRROR: ${label}`, () => {
    assert.equal(mirrorMisses("fixture.js", code, "DetailRow").length, expected, code);
  });
}

/* ── CARD_MIRROR: ชุดเดียวกันทุกข้อ แค่เปลี่ยนแท็ก (2026-09-02) ──────────────────
   ⭐ เก็บครบทั้งชุดโดยเจตนา **ไม่ใช่ก๊อปมาเผื่อสวย** — นี่คือข้อพิสูจน์ว่าด่านฝั่งการ์ด
   เข้มเท่าฝั่งแถวจริง ไม่ได้หลวมลงเพราะเป็นของใหม่ · โดยเฉพาะสองข้อ "การ์ดที่มีแค่ปุ่มลบ"
   กับ "ลิงก์ดินสอ ?edit=1" ซึ่งเป็นสองรูปที่ด่านหลวมกว่านี้จะปล่อยผ่านเงียบ ๆ
   🪤 ข้อ self-closing มีเพิ่มมาจากฝั่งแถว: ClickableCard รับเนื้อผ่าน children (ต่างจาก
   RelationRow เดิมที่รับผ่าน props) ⇒ ต้องยืนยันว่าท่าที่ซ่อนลิงก์ไว้ใน props ตกจริง */
const CARD_MIRROR_FIXTURES = [
  ["ลิงก์ที่หัวการ์ด href เหมือนกันเป๊ะ = ผ่าน (ทรงของท่า C)",
    "<ClickableCard href={`/sa/tasks/${t.id}`} className=\"glass-panel\">"
    + "<Link href={`/sa/tasks/${t.id}`} className=\"linklike-block\"><strong>{t.title}</strong></Link>"
    + "<button type=\"button\" onClick={done}>เสร็จ</button>"
    + "</ClickableCard>", 0],
  ["<a href> ธรรมดาก็นับ ไม่ได้บังคับว่าต้องเป็น <Link>",
    '<ClickableCard href="/x/1"><a href="/x/1">x</a></ClickableCard>', 0],
  ["🪤 การ์ดที่มีแค่ปุ่มลบ = ตก (มีของโฟกัสได้ แต่ 'เปิดรายละเอียด' ยังเข้าไม่ถึง)",
    "<ClickableCard href={`/sa/tasks/${t.id}`}>"
    + "<div>{t.title}</div><button type=\"button\" onClick={del}>ลบ</button>"
    + "</ClickableCard>", 1],
  ["🪤 ลิงก์ดินสอ 'แก้ไข' ไม่ใช่ทางเข้าของการเปิดรายละเอียด — คนละปลายทาง",
    "<ClickableCard href={`/sa/tasks/${t.id}`}>"
    + "<Link href={`/sa/tasks/${t.id}?edit=1`}>แก้</Link>"
    + "</ClickableCard>", 1],
  ["<ClickableCard> ที่ไม่ส่ง href เลย = ตก (การ์ดที่ไม่พาไปไหนต้องเป็น <div> ธรรมดา)",
    '<ClickableCard className="glass-panel"><Link href="/x/1">x</Link></ClickableCard>', 1],
  ["เขียน href คนละข้อความแต่ปลายทางเดียวกัน = ตก (ตั้งใจให้เข้ม — ยกเป็น detailHref)",
    "<ClickableCard href={`/x/${row.id}`}><Link href={\"/x/\" + row.id}>x</Link></ClickableCard>", 1],
  ["🪤 self-closing (ซ่อนลิงก์ไว้ใน props) = ตกเสมอ — หาแท็กปิดไม่เจอ body เลยว่าง",
    '<ClickableCard href="/x/1" title={<Link href="/x/1">x</Link>} />', 1],
  ["สองใบในไฟล์เดียว ตรวจแยกกันคนละใบ",
    '<ClickableCard href="/a"><Link href="/a">a</Link></ClickableCard>'
    + '<ClickableCard href="/b">b</ClickableCard>', 1],
];

for (const [label, code, expected] of CARD_MIRROR_FIXTURES) {
  test(`CARD_MIRROR: ${label}`, () => {
    assert.equal(mirrorMisses("fixture.js", code, "ClickableCard").length, expected, code);
  });
}

test("ROW_MIRROR เป็น hard-zero และผูกกับการยกเว้นทางลัดเมาส์บนแถว", () => {
  assert.match(AUDIT, /rowMirrorMissViolations\.length\s*\n?\s*\?/,
    "audit-ui.mjs ต้องฟ้องทันทีที่ ROW_MIRROR ไม่เป็น 0 (ไม่มีเพดานให้ไต่)");
  /* สูตรการยกเว้นต้องอ่านออกว่าผูกกับ **สองเงื่อนไข**: ROW_MIRROR ว่าง + จุดเดียวพอดี
     ถ้าใครตัดเงื่อนไขใดออก ด่านจะกลายเป็น "ยกเว้นเพราะประกาศไว้" ซึ่งคือสิ่งที่ตั้งใจเลี่ยง */
  assert.match(AUDIT, /rowMirrorMissViolations\.length === 0 && \(a11yKeyboardHits\.get\(ROW_PRIMITIVE\) \|\| \[\]\)\.length === 1 \? 1 : 0/,
    "สูตร rowShortcutExempt เปลี่ยนไป — ต้องยกเว้นเมื่อ ROW_MIRROR ว่าง **และ** DetailRow.js เหลือ 1 จุดพอดี");
});

test("CARD_MIRROR เป็น hard-zero และผูกกับการยกเว้นทางลัดเมาส์บนการ์ด", () => {
  assert.match(AUDIT, /cardMirrorMissViolations\.length\s*\n?\s*\?/,
    "audit-ui.mjs ต้องฟ้องทันทีที่ CARD_MIRROR ไม่เป็น 0 (ไม่มีเพดานให้ไต่)");
  assert.match(AUDIT, /cardMirrorMissViolations\.length === 0 && \(a11yKeyboardHits\.get\(CARD_PRIMITIVE\) \|\| \[\]\)\.length === 1 \? 1 : 0/,
    "สูตร cardShortcutExempt เปลี่ยนไป — ต้องยกเว้นเมื่อ CARD_MIRROR ว่าง **และ** ClickableCard.js เหลือ 1 จุดพอดี");
  /* หักจาก **รายการ** ไม่ใช่หักแต่ตัวเลข (เหตุผลเดียวกับฝั่งแถว: รายงานต้องไม่ขัดกันเอง) */
  assert.match(AUDIT, /!\(cardShortcutExempt && rel === CARD_PRIMITIVE\)/,
    "ต้องกรอง CARD_PRIMITIVE ออกจาก **รายการ** ความผิด ไม่ใช่หักแต่ยอดรวม");
});

test("CARD_MIRROR ยังผูกกับของจริง (ทุกที่เรียก ClickableCard ต้องผ่าน)", () => {
  const { cardMirror } = scan();
  assert.deepEqual(cardMirror, [],
    "มีที่เรียก ClickableCard ที่ไม่มี <Link> ปลายทางเดียวกันในการ์ด — ยกเป็น const detailHref "
    + "ตัวเดียวแล้วส่งให้ทั้งสองที่ · การ์ดที่ข้างในไม่มีปุ่ม/ลิงก์เลย ไม่ต้องใช้ ClickableCard "
    + "ตั้งแต่ต้น ให้ห่อทั้งใบด้วย <Link> แล้วเติมคลาส card-link แทน");
});

test("ROW_MIRROR ยังผูกกับของจริง (ทุกที่เรียก DetailRow ต้องผ่าน)", () => {
  const { rowMirror } = scan();
  assert.deepEqual(rowMirror, [],
    "มีที่เรียก DetailRow ที่ไม่มี <Link> ปลายทางเดียวกันในเซลล์ — ยกเป็น const detailHref "
    + "ตัวเดียวแล้วส่งให้ทั้งสองที่ (แถวที่ไม่พาไปไหนใช้ <tr className=\"premium-row\"> ธรรมดา)");
});

/* 🪤 **สองเทสต์ MIRROR ข้างบนผ่านฉลุยตอนไม่มีใครเรียก primitive เลย** — ลิสต์ misses
   ว่างเปล่าเหมือนกันทั้งกรณี "ทุกที่เรียกถูกต้อง" และกรณี "ไม่มีที่เรียกให้ตรวจ"
   ⇒ ของจริงที่เพิ่งเกิด: ตอนตั้งด่าน CARD_MIRROR (เฟสที่ 1 · 2026-09-02) `ClickableCard`
   **ยังไม่มีใครเรียกสักจุด** เทสต์จึงเขียวมาทั้งวันโดยไม่ได้ตรวจอะไรเลย และเพิ่งมามีของ
   จริงให้ตรวจตอนเฟสที่ 2 · ถ้าวันหน้ามี redesign ถอดที่เรียกออกจนหมด ด่านจะกลับไปกลวง
   แบบเดิมเงียบ ๆ พร้อมกับที่ `cardShortcutExempt` ร่วงเป็น 0 (ซึ่งฟ้องคนละเรื่อง)

   ⚖️ **เป็นพื้น ไม่ใช่ค่าตายตัว** — ตั้งไว้ที่ 1 เพราะบทเรียนของ NATIVE_BUTTON_FLOOR
   ข้างบน: ล็อกเลขที่โตตามงานปกติ (จำนวนที่เรียก) = เทสต์ที่ตกประจำจนคนชินกับการแก้เลข
   ให้ผ่าน · ที่นี่ต้องการแค่คำตอบว่า "ยังมีของจริงให้ตรวจอยู่ไหม" */
test("ด่าน MIRROR ทั้งคู่ยังมีของจริงให้ตรวจ (กันด่านกลวงเพราะไม่มีที่เรียก)", () => {
  const { primitiveUses } = scan();
  assert.ok(primitiveUses.DetailRow >= 1,
    "ไม่มีที่เรียก DetailRow เหลือแล้ว — ROW_MIRROR กลายเป็นด่านกลวง (ผ่านเพราะไม่มีอะไรให้ตรวจ) "
    + "ถ้าตั้งใจเลิกใช้ primitive ตัวนี้จริง ต้องถอดด่านกับทางยกเว้นของมันออกในคอมมิตเดียวกัน");
  assert.ok(primitiveUses.ClickableCard >= 1,
    "ไม่มีที่เรียก ClickableCard เหลือแล้ว — CARD_MIRROR กลายเป็นด่านกลวง (เหตุผลเดียวกับบรรทัดบน)");
});

/* 🪤 สายสะดุดของการยกเว้น: ถ้าวันหน้า DetailRow.js มี `<div onClick>` ตัวที่สองโผล่มา
   `rowShortcutExempt` จะกลายเป็น 0 เอง (เงื่อนไข `=== 1`) แล้วเพดานคีย์บอร์ดจะแดง
   ⇒ ต้องมีคนมาดูว่าจุดใหม่นั้นคืออะไร ไม่ใช่ให้มันไหลเข้าไปในโควตาของแถวเงียบ ๆ */
test("การยกเว้นเป็นของ <tr> ของ DetailRow จุดเดียว ไม่ใช่ทั้งไฟล์", () => {
  const src = fs.readFileSync(path.join(process.cwd(), ROW_PRIMITIVE), "utf8");
  const clicks = (src.match(/onClick=/g) || []).length;
  assert.equal(clicks, 1,
    `${ROW_PRIMITIVE} มี onClick ${clicks} ที่ — โควตาที่ยกเว้นให้คือ **แถวเดียว** `
    + "ถ้ามีตัวที่สองต้องแยกให้ชัดก่อน ห้ามให้มันแอบใช้โควตาเดียวกัน");
  assert.ok(!/\brole=|\btabIndex=|\bonKeyDown=/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
    "DetailRow คืน role/tabIndex/onKeyDown ขึ้น <tr> แล้ว — ทับ role=\"row\" ทิ้ง (ตก 1.3.1) "
    + "และการยกเว้นนี้ตั้งอยู่บนสมมติฐานว่าแถว **ไม่ใช่** control");
});

/* 🪤 สายสะดุดเดียวกันของฝั่งการ์ด · มีข้อที่แถวไม่ต้องมีเพิ่มมาหนึ่งข้อ: **ต้องส่ง
   currentTarget เป็นขอบเขตให้ isInteractiveTarget** — ลืมแล้วคลิกการ์ดจะไม่ทำงานเลยสักใบ
   (บั๊กเดียวกับที่ DetailRow เคยเจอ · คอมเมนต์ของ isInteractiveTarget ใน lib/uiRules.js) */
test("การยกเว้นเป็นของ <div> ของ ClickableCard จุดเดียว ไม่ใช่ทั้งไฟล์", () => {
  const src = fs.readFileSync(path.join(process.cwd(), CARD_PRIMITIVE), "utf8");
  const clicks = (src.match(/onClick=/g) || []).length;
  assert.equal(clicks, 1,
    `${CARD_PRIMITIVE} มี onClick ${clicks} ที่ — โควตาที่ยกเว้นให้คือ **การ์ดเดียว** `
    + "ถ้ามีตัวที่สองต้องแยกให้ชัดก่อน ห้ามให้มันแอบใช้โควตาเดียวกัน");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\brole=|\btabIndex=|\bonKeyDown=/.test(code),
    "ClickableCard ใส่ role/tabIndex/onKeyDown บน <div> แล้ว — ได้ tab stop เกินมาการ์ดละ 1 จุด "
    + "ที่กด Enter แล้วผลเหมือนลิงก์ถัดไป 1 tab พอดี (เหตุผลเดียวกับที่ถอดออกจาก <tr>)");
  assert.match(code, /isInteractiveTarget\(event\.target, event\.currentTarget\)/,
    "ต้องส่ง currentTarget เป็นขอบเขต ไม่งั้น closest() ไล่ขึ้นไปเจอการ์ดเองแล้วคืน true ทุกครั้ง "
    + "⇒ คลิกการ์ดไม่ทำงานเลยสักใบ (บั๊กที่เคยทำให้คลิกแถวตายทั้งระบบ)");
});

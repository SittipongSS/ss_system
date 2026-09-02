import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── หัวตารางเรียงลำดับ: ทรงบังคับของ SortTh (2026-09-02) ──────────────────────
   คู่กับกลุ่ม `<th>` ที่ปิดจบไปแล้วใน A11Y_KEYBOARD_CAP (scripts/audit-ui.mjs)
   และกับหัวข้อ "หัวตารางเรียงลำดับ" ใน UI_DESIGN_SYSTEM.md

   ทรงที่ WCAG กำหนด (2.1.1 Keyboard A · 1.3.1 Info and Relationships A ·
   4.1.2 Name Role Value A · สรุปไทยที่ docs/wcag-2.2-reference.md):
     · ตัวกดคือ <button type="button"> ที่อยู่ **ข้างใน** <th>
     · <th> ถือ aria-sort="ascending" | "descending" | "none"
     · ตารางหนึ่งตัวมีคอลัมน์ที่ไม่ใช่ none ได้ **ตัวเดียว**
     · 🚫 ห้าม role/tabIndex บน <th> — ทับ role="columnheader" ทิ้ง

   ⚠️ **ทำไมด่านใน audit-ui.mjs ไม่พอ และต้องมีไฟล์นี้** — สามข้อที่ด่านนั้นมองไม่เห็น:
   1) A11Y_KEYBOARD_CAP นับแค่ "มี onClick บน <th> ไหม" ⇒ วันที่ใครถอด aria-sort ทิ้ง
      หรือย้ายปุ่มออกไปไว้ *ข้าง* <th> แทนที่จะอยู่ข้างใน เลขเพดานไม่ขยับเลยสักหน่วย
   2) ROLE_ON_TABLE_TAG_CAP สแกนเฉพาะ **แท็กตัวพิมพ์เล็ก** ⇒ `<SortTh role="button">`
      เป็นคอมโพเนนต์ ด่านมองไม่เห็น แต่ปลายทางมันไปโผล่บน <th> จริงผ่าน `{...rest}`
   3) ไม่มีด่านไหนในระบบรู้จักคำว่า aria-sort เลย (ก่อนวันนี้ทั้งรีโปมี 0 จุด)

   ⚠️ **จงใจไม่ก๊อปตัวพาร์ส JSX มาไว้ที่นี่เป็นสำเนาที่สาม** — วันนี้มีสองสำเนาที่
   ถูกล็อกให้เท่ากันตัวอักษรต่อตัวอักษร (audit-ui.mjs ↔ keyboardClickable.test.mjs)
   สำเนาที่สามจะไม่มีใครล็อกแล้วดริฟต์เงียบ · ขอบเขตของไฟล์นี้คือ **ฟังก์ชันเดียว
   ยาว ~25 บรรทัดที่เราเป็นเจ้าของเอง** จึงตรวจด้วยลำดับตำแหน่งของแท็กได้ตรง ๆ
   ซึ่งอ่านออกและพังยากกว่า regex ที่พยายามเลียนแบบพาร์สเซอร์ */

const WEBAPP = process.cwd();
const SORTABLE_PATH = path.join(WEBAPP, "src", "lib", "useSortableTable.js");
const SORTABLE = fs.readFileSync(SORTABLE_PATH, "utf8");
const GLOBALS_RAW = fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8");

/* คอมเมนต์ในไฟล์นี้ยกตัวอย่าง "ของผิด" ไว้สอนคนเยอะ (`role="button"` ฯลฯ)
   ถ้าตรวจบนซอร์ซดิบ เทสต์จะจับคอมเมนต์ของตัวเองแล้วแดงทั้งที่โค้ดถูก
   — กับดักเดียวกับที่ audit-ui.mjs เขียนบันทึกไว้ตอนทำด่านผิว className */
const blankBlockComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""));

/* 🐞 ต้องล้างคอมเมนต์ของ globals.css ก่อนตรวจ **สองเหตุผล ไม่ใช่เหตุผลเดียว**:
   1) คอมเมนต์ที่ .th-sort ยกตัวอย่างของผิดไว้ตรง ๆ (`ห้ามใช้ font: inherit`)
      ⇒ ตรวจบนซอร์ซดิบแล้วเทสต์จับคำสอนของตัวเองแดง ทั้งที่ CSS ถูก
   2) คอมเมนต์ในบล็อกนั้นมี `}` อยู่ข้างใน (`style={{textAlign:"right"}}`)
      ⇒ ตัวตัดบล็อกที่หา `}` ตัวแรกจะตัดกลางกฎ แล้วพร็อพครึ่งท้ายหายจากสายตา */
const GLOBALS = blankBlockComments(GLOBALS_RAW);

/* ตัด JSX ที่ SortTh คืน — ตั้งแต่ `return (` ของฟังก์ชันจนจบฟังก์ชัน */
function sortThJsx() {
  const start = SORTABLE.indexOf("export function SortTh(");
  assert.ok(start > 0, "หา export function SortTh() ไม่เจอ — เปลี่ยนชื่อ/ย้ายไฟล์แล้วต้องแก้เทสต์ตาม");
  return blankBlockComments(SORTABLE.slice(start));
}

/* ── โครงของ primitive ──────────────────────────────────────────────────── */

test("SortTh: ตัวกดเป็น <button> ที่อยู่ *ข้างใน* <th> ไม่ใช่ onClick บน <th>", () => {
  const jsx = sortThJsx();
  const th = jsx.indexOf("<th");
  const button = jsx.indexOf("<button");
  const buttonClose = jsx.indexOf("</button>");
  const thClose = jsx.indexOf("</th>");

  assert.ok(th >= 0, "SortTh ต้องเรนเดอร์ <th> จริง (หัวคอลัมน์ต้องเป็น th เท่านั้น)");
  assert.ok(button > th, "<button> ต้องเปิดหลัง <th> — ปุ่มที่อยู่นอกเซลล์ไม่ใช่หัวคอลัมน์");
  assert.ok(buttonClose > button, "<button> ต้องปิดด้วย </button>");
  assert.ok(thClose > buttonClose,
    "</th> ต้องมาหลัง </button> ⇒ ปุ่มซ้อนอยู่ข้างในเซลล์จริง ไม่ใช่วางคู่กัน");
});

test("SortTh: ปุ่มต้องเป็น type=\"button\" (ไม่งั้นกดแล้ว submit ฟอร์มที่ครอบอยู่)", () => {
  const jsx = sortThJsx();
  const button = jsx.slice(jsx.indexOf("<button"), jsx.indexOf(">", jsx.indexOf("<button")) + 1);
  assert.match(button, /type="button"/,
    "หัวตารางที่อยู่ในฟอร์ม (ตัวกรอง/ค้นหา) จะกลายเป็นปุ่ม submit ทันทีถ้าไม่ระบุ type");
});

test("SortTh: onClick อยู่บน <button> เท่านั้น ห้ามอยู่บน <th>", () => {
  const jsx = sortThJsx();
  const thOpenEnd = jsx.indexOf("<button");
  const thOpen = jsx.slice(jsx.indexOf("<th"), thOpenEnd);
  assert.ok(!/onClick/.test(thOpen),
    "onClick กลับขึ้นไปอยู่บน <th> แล้ว = กลุ่ม `th` ของ A11Y_KEYBOARD_CAP ฟื้นคืนชีพ\n"
    + "(เพดานนั้นรูดลง 58 → 39 เพราะกลุ่มนี้หายทั้งกลุ่ม — ดูคอมเมนต์ที่ A11Y_KEYBOARD_CAP)");
  assert.match(jsx.slice(thOpenEnd), /<button[^]*?onClick=\{[^]*?sortBy\(/,
    "ปุ่มต้องเป็นตัวเรียก sort.sortBy() เอง");
});

/* ── aria-sort: ชุดแรกของทั้งรีโป ห้ามหายไปเงียบ ๆ ────────────────────────── */

test("SortTh: <th> ต้องถือ aria-sort และครบทั้งสามค่าที่สเปกอนุญาต", () => {
  const jsx = sortThJsx();
  const thOpen = jsx.slice(jsx.indexOf("<th"), jsx.indexOf("<button"));
  assert.match(thOpen, /aria-sort=/,
    "aria-sort ต้องอยู่บน <th> เอง — วางบนปุ่มไม่ได้ สเปก ARIA ผูก aria-sort ไว้กับ columnheader");
  for (const value of ["ascending", "descending", "none"]) {
    assert.match(thOpen, new RegExp(`"${value}"`),
      `ขาดค่า "${value}" — คอลัมน์ที่เรียงได้แต่ยังไม่ถูกเรียงต้องประกาศ "none" ไม่ใช่ปล่อยว่าง`);
  }
  assert.ok(!/aria-sort=\{?"?(?:asc|desc)"?\}?/.test(thOpen),
    "ห้ามใช้คำย่อ asc/desc — ARIA รับเฉพาะ ascending/descending/none/other");
});

/* 🪤 "ไม่ใช่ none ได้ตัวเดียวต่อตาราง" — static analysis พิสูจน์ทั้งระบบไม่ได้
   (ต้องรู้ว่า <SortTh> ตัวไหนอยู่ตารางเดียวกันตอนรันจริง) · สิ่งที่ตรวจได้และเป็น
   **ต้นเหตุจริง** คือรูปของข้อมูล: คอลัมน์ที่ active มาจากการเทียบเท่ากับ
   `sort.sortKey` ซึ่งเป็นค่าเดี่ยว ⇒ ต่อให้วาง SortTh กี่ตัวก็ active ได้ทีละตัว
   วันที่ใครเปลี่ยน sortKey เป็นรายการ/เซ็ต ข้อรับประกันนี้พังทันที เทสต์จึงล็อกรูปนั้น */
test("SortTh: คอลัมน์ที่ไม่ใช่ none มีได้ตัวเดียว เพราะ sortKey เป็นค่าเดี่ยว", () => {
  const jsx = sortThJsx();
  assert.match(jsx, /const active = sort\.sortKey === key;/,
    "active ต้องมาจากการเทียบ *เท่ากัน* กับ sort.sortKey ค่าเดียว\n"
    + "ถ้าเปลี่ยนเป็น .includes() / Set / อาร์เรย์ = ตารางเดียวมี aria-sort ที่ไม่ใช่ none ได้หลายคอลัมน์ (ตก 1.3.1)");
  assert.match(jsx, /aria-sort=\{active \?/,
    "aria-sort ต้องถูกขับด้วย active ตัวเดียวกัน ไม่ใช่เงื่อนไขคนละชุด");

  /* ฝั่ง hook ที่ถือค่าจริง — useState เดี่ยว ไม่ใช่คอลเลกชัน */
  assert.match(SORTABLE, /const \[sortKey, setSortKey\] = useState\(/,
    "useSortableTable ต้องเก็บคีย์เดียว");
  assert.ok(!/setSortKey\(\s*\[/.test(SORTABLE), "sortKey ต้องไม่ถูกตั้งเป็นอาร์เรย์");
});

/* ── ข้อห้ามฝั่ง 1.3.1: role/tabIndex บนแท็กตาราง ────────────────────────── */

test("SortTh: ห้ามมี role/tabIndex บน <th> (ทับ role=\"columnheader\" ทิ้ง)", () => {
  const jsx = sortThJsx();
  const thOpen = jsx.slice(jsx.indexOf("<th"), jsx.indexOf("<button"));
  assert.ok(!/\brole=/.test(thOpen),
    "role บน <th> ทับ columnheader ⇒ screen reader ไม่รู้ว่าเซลล์นี้เป็นหัวคอลัมน์ (ตก 1.3.1)\n"
    + "ปุ่มข้างในให้ role=\"button\" มาฟรีอยู่แล้ว ไม่ต้องประกาศซ้ำที่เซลล์");
  assert.ok(!/\btabIndex=/.test(thOpen),
    "tabIndex บน <th> ไม่จำเป็น — ปุ่มข้างในอยู่ในลำดับ Tab เองอยู่แล้ว");
});

/* 🔴 ช่องที่ ROLE_ON_TABLE_TAG_CAP มองไม่เห็น: `{...rest}` ส่งอะไรก็ได้ลง <th>
   ด่านนั้นสแกนเฉพาะแท็กตัวพิมพ์เล็ก ⇒ `<SortTh role="button">` รอดสายตามันทั้งที่
   ปลายทางคือ role บน <th> จริง · เลขเพดานจะยัง 1 อยู่เหมือนไม่มีอะไรเกิดขึ้น */
const FORBIDDEN_PASSTHROUGH = ["role", "tabIndex", "onClick", "onKeyDown", "aria-sort"];

test("ผู้เรียก SortTh ห้ามส่ง role/tabIndex/onClick/aria-sort ทะลุ {...rest} ลง <th>", () => {
  const offenders = [];
  for (const file of jsFilesUnder(path.join(WEBAPP, "src"))) {
    const rel = path.relative(WEBAPP, file).replaceAll("\\", "/");
    if (rel === "src/lib/useSortableTable.js") continue;
    const source = blankBlockComments(fs.readFileSync(file, "utf8"));
    for (const call of source.matchAll(/<SortTh\b/g)) {
      /* อ่านถึงตัวปิดแท็กแรกที่อยู่นอกวงเล็บปีกกา — SortTh เป็นแท็กปิดตัวเอง
         และพร็อพทุกตัวเป็น `x={...}` หรือ `x="..."` จึงนับปีกกาพอ */
      const tag = readSelfClosingTag(source, call.index);
      const line = source.slice(0, call.index).split(/\r?\n/).length;
      for (const prop of FORBIDDEN_PASSTHROUGH) {
        if (new RegExp(`(?<![\\w-])${prop}\\s*=`).test(tag)) {
          offenders.push(`${rel}:${line} ส่ง ${prop} เข้า <SortTh>`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    "พร็อพพวกนี้ทะลุ {...rest} ไปเกาะ <th> จริง — role/tabIndex ทับ columnheader (ตก 1.3.1)\n"
    + "· onClick ทำให้กลุ่ม `th` ของ A11Y_KEYBOARD_CAP กลับมา\n"
    + "· aria-sort ทับสัญญาของ primitive (วันนี้ spread อยู่ก่อน aria-sort จึงทับไม่ได้ แต่ก็ไม่ควรส่ง)\n"
    + "ทั้งสี่ตัวนี้ ROLE_ON_TABLE_TAG_CAP มองไม่เห็น เพราะ <SortTh> เป็นคอมโพเนนต์ ไม่ใช่แท็ก th");
});

test("SortTh: {...rest} ต้องอยู่ก่อน aria-sort ⇒ ผู้เรียกทับสัญญาไม่ได้", () => {
  const jsx = sortThJsx();
  const thOpen = jsx.slice(jsx.indexOf("<th"), jsx.indexOf("<button"));
  assert.ok(thOpen.indexOf("{...rest}") < thOpen.indexOf("aria-sort="),
    "JSX ให้ตัวหลังชนะ — spread ที่อยู่ท้ายจะปล่อยให้ผู้เรียกทับ aria-sort ได้เงียบ ๆ");
});

/* ── สไตล์: กับดักที่เคยกัดมาแล้วในรีโปนี้ ────────────────────────────────── */

test("globals.css: .th-sort ห้ามใช้ `font: inherit` (shorthand ล้าง font-variant-numeric)", () => {
  const block = cssBlock(GLOBALS, ".th-sort");
  assert.ok(block, "หากฎ .th-sort ใน globals.css ไม่เจอ");
  assert.ok(!/(?<![\w-])font:\s*inherit/.test(block),
    "shorthand `font:` รีเซ็ต font-variant-numeric เป็น normal ⇒ tabular-nums ของหัวคอลัมน์ตัวเลขหลุด\n"
    + "บทเรียนเดิมของรีโปนี้: .linklike เคยล้าง .mono ทิ้ง 11 จุดด้วยกลไกเดียวกันเป๊ะ — คืนทีละพร็อพเท่านั้น");
  for (const prop of ["font-family", "font-size", "font-weight", "font-variant-numeric", "letter-spacing", "text-align"]) {
    assert.match(block, new RegExp(`${prop}:\\s*inherit`),
      `.th-sort ต้องคืน ${prop}: inherit — UA ของ <button> ตั้งค่าของตัวเองทับทุกตัวที่ไม่ได้คืน`);
  }
});

test("globals.css: .th-sort ต้องมีวงโฟกัสของตัวเอง และไม่ใช้ var(--accent)", () => {
  assert.ok(GLOBALS.includes(".th-sort:focus-visible"),
    "ปุ่มที่คีย์บอร์ดเข้าถึงได้แต่ไม่มีวงโฟกัส = เห็นไม่ออกว่าอยู่ตรงไหน (2.4.7)");
  const rule = cssBlock(GLOBALS, ".th-sort:focus-visible::after");
  assert.ok(rule, "วงโฟกัสต้องวาดบนแผ่นคลุม ::after ⇒ ล้อมทั้งช่องหัว ไม่ใช่แค่ตัวหนังสือ");
  assert.match(rule, /outline:\s*2px solid var\(--accent-ink\)/,
    "ต้องใช้ var(--accent-ink) — var(--accent) ได้ 2.75:1 บนพื้นหน้า ตก 1.4.11 ที่ต้องการ 3:1\n"
    + "(audit:ui มี hard-zero คุมเรื่องนี้อยู่ ห้ามสลับกลับ)");
});

/* ── ตัวช่วยเล็ก ๆ ─────────────────────────────────────────────────────────── */

function jsFilesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFilesUnder(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

/* อ่าน `<SortTh … />` ทั้งแท็ก — นับปีกกาเพื่อไม่ให้ `/>` ที่อยู่ *ในนิพจน์*
   (เช่น `label={<X />}`) ตัดกลางแท็ก */
function readSelfClosingTag(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start, start + 400);
}

/* ตัดบล็อกของ selector หนึ่งอันออกมาจาก CSS (ตัวแรกที่เจอ) */
function cssBlock(css, selector) {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return null;
  return css.slice(at, css.indexOf("}", at) + 1);
}

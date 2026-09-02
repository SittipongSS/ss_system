import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* ลิงก์ · ข้อความที่กดได้ · ปุ่ม — สามทรงที่ต้องแยกออกจากกันด้วยตา

   🔴 บทเรียน 2026-09-02 (ไฟล์นี้เดิมชื่อ `richLinkVisibility.test.mjs`)
   `.linklike` เคยเป็น `color: inherit` + เปลี่ยนสีเฉพาะตอน `:hover` — วัดบนหน้าจริง
   แล้วสีของลิงก์เท่ากับข้อความธรรมดาเป๊ะ ๆ ไม่มีเส้นใต้ ต้องเอาเมาส์ไปชี้ถึงจะรู้ว่ากดได้
   บนมือถือไม่มี hover จึงไม่มีทางรู้เลย · ตอนนั้นมีคนแก้ด้วยการ **สร้างคลาสที่สอง**
   (`.rich-link`) แทนที่จะแก้ตัวต้นเหตุ ⇒ ระบบมีลิงก์สองหน้าตาอยู่พร้อมกัน 52 : 6 จุด
   รอบนี้ยุบเหลือ `.linklike` ตัวเดียว แล้วแยก "ปุ่มที่ทำงานในหน้า" ออกเป็น `.text-action`

   🔴 สีตัวอักษรต้องเป็น `--accent-ink` ไม่ใช่ `--accent` วัดคอนทราสต์บนพื้นจริง:
        ธีมสว่าง  --accent 2.75:1 (ตก AA)  ·  --accent-ink 4.76:1 (ผ่าน)
        ธีมมืด    สองตัวนี้เป็นสีเดียวกัน (~5.7:1 บน --panel) จึงไม่เสียอะไร
      กฎเดียวกับปุ่ม: โทเคน `*-ink` มีไว้ใช้กับ `color:` เท่านั้น */

const here = new URL("./", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const RICH_TEXT = read("./RichText.js");
const PREVIEW = read("../../app/settings/design-preview/page.js");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** เนื้อในของ **ทุก** บล็อกที่ selector list มีตัวที่ขอ
    (selector เดียวโผล่ได้หลายบล็อก เช่น `.linklike:focus-visible` อยู่ทั้งในกลุ่ม
     ที่รวมกับ `:hover` และในบล็อกวงโฟกัสของตัวเอง — เอาแค่บล็อกแรกจะตรวจผิดตัว) */
function blocks(selector) {
  const css = stripComments(GLOBALS);
  const found = css.split("}").filter((chunk) => {
    const open = chunk.indexOf("{");
    if (open === -1) return false;
    return chunk.slice(0, open).split(",").map((s) => s.trim()).includes(selector);
  });
  assert.ok(found.length, `ไม่พบบล็อก ${selector} ใน globals.css`);
  return found.map((chunk) => chunk.slice(chunk.indexOf("{") + 1));
}

/** เนื้อในของบล็อกแรกที่ selector list มีตัวที่ขอ */
function block(selector) {
  return blocks(selector)[0];
}

/** ทุกประกาศของ selector รวมกัน — ใช้ตอนที่ไม่สนว่าอยู่บล็อกไหน */
function allDeclarations(selector) {
  return blocks(selector).join("\n");
}

/** ค่า className ทุกตัวในไฟล์ JSX (สตริง · template · นิพจน์ในปีกกา)
    ⚠️ ต้องดูเฉพาะ className ไม่ใช่ทั้งไฟล์ — คอมเมนต์และคำอธิบายบนหน้าต้นแบบ
       พูดถึงชื่อคลาสที่เลิกใช้ได้ตามปกติ นั่นคือบันทึกความจำ ไม่ใช่การเรียกใช้ */
const CLASS_NAME_VALUES = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
function classNamesOf(source) {
  return [...source.matchAll(CLASS_NAME_VALUES)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

test("ลิงก์เห็นได้ตั้งแต่ยังไม่เอาเมาส์ไปชี้", () => {
  const body = block(".linklike");
  assert.match(body, /text-decoration:\s*underline/,
    "เส้นใต้ต้องอยู่ในสถานะปกติ — ถ้าโผล่ตอน hover อย่างเดียว มือถือจะไม่มีทางรู้ว่ากดได้");
  assert.match(body, /color:\s*var\(--accent-ink\)/,
    "สีตัวอักษรต้องมาจาก --accent-ink");
  // สระล่างของไทย (ุ ู ฺ) กินพื้นที่ใต้บรรทัด เส้นใต้ชิดเกินไปจะทับ
  assert.match(body, /text-underline-offset:\s*[2-9]px/,
    "ต้องเว้นระยะเส้นใต้เผื่อสระล่างของไทย");
});

/* 🪤 **ด่านข้างบนดู `.linklike` เดี่ยว ๆ เท่านั้น — selector ผสมรอดหมด**
   `block(".linklike")` จับบล็อกที่หัวเป็น `.linklike` ตรง ๆ ⇒ `.linklike.step-cell-link`
   ซึ่งเขียน `color: inherit` + `text-decoration: none` กลับเข้ามา (globals.css:6636)
   ไม่เคยผ่านสายตาด่านเลย = ช่องที่ใช้ยกเลิกกฎนี้ได้ทั้งกฎโดยไม่มีอะไรฟ้อง
   ⇒ ตรวจทุกบล็อกที่ *มี* `.linklike` เป็นส่วนประกอบ แล้วประกาศข้อยกเว้นเป็นทะเบียน
   ไม่ใช่ปล่อยให้เกิดเงียบ ๆ

   ข้อยกเว้นที่รับรู้แล้ว (ต้องมีเหตุผลที่วัดได้ ไม่ใช่ความสะดวก):
   · `.linklike.step-cell-link` — ทั้งเซลล์เป็นเป้าเดียว และบรรทัดล่างมี `overflow: clip`
     จูนไว้พอดีกับหมึกไทยที่ล้น 0.44px ⇒ เส้นใต้ที่ offset 3px ตกเข้าเขต clip จนขาด
     🔴 **หนี้ที่รู้ตัว**: สถานะพักไม่มีสัญญาณอะไรเลย (สีเท่าข้อความธรรมดา) เห็นได้
     เฉพาะตอน hover ซึ่งคือบั๊กเดียวกับที่รอบนี้แก้ · ท่าเดียวกับ `.table-row-link`
     ที่ทั้งระบบใช้อยู่ ⇒ ต้องแก้เป็นชุดพร้อมกัน ไม่ใช่แก้จุดนี้จุดเดียว */
const LINKLIKE_COLOR_EXEMPT = new Set([".linklike.step-cell-link"]);

test("selector ผสมของ .linklike ก็ห้ามล้างสีทิ้ง (นอกทะเบียนข้อยกเว้น)", () => {
  const offenders = [];
  for (const m of GLOBALS.matchAll(/^([^\n{]*\.linklike[^\n{]*)\{([^}]*)\}/gm)) {
    const selector = m[1].trim().replace(/\s*,\s*/g, ", ");
    if (!/color:\s*inherit/.test(m[2])) continue;
    if (selector === ".linklike:disabled") continue;
    if (LINKLIKE_COLOR_EXEMPT.has(selector)) continue;
    offenders.push(selector);
  }
  assert.deepEqual(offenders, [],
    "selector ที่มี .linklike แล้วสั่ง color: inherit = ยกเลิกกฎลิงก์เงียบ ๆ "
    + "ถ้าจำเป็นจริงต้องขึ้นทะเบียน LINKLIKE_COLOR_EXEMPT พร้อมเหตุผลที่วัดได้");
});

test("ทะเบียนข้อยกเว้นต้องไม่มีชื่อที่ตายไปแล้ว", () => {
  for (const selector of LINKLIKE_COLOR_EXEMPT) {
    assert.ok(GLOBALS.includes(selector + " {") || GLOBALS.includes(selector + ","),
      `${selector} ไม่มีอยู่ใน globals.css แล้ว — ถอดออกจากทะเบียน`);
  }
});

/* ⭐ ด่านหลักของรอบนี้ — กันไม่ให้ใครรูดกลับไปเป็นข้อความธรรมดาอีก
   `color: inherit` คือรูปเดิมเป๊ะ ๆ ที่ทำให้ลิงก์ 52 จุดหายไปกับพื้น */
test(".linklike ห้ามกลับไปเป็น color: inherit", () => {
  const body = block(".linklike");
  assert.doesNotMatch(body, /color:\s*inherit/,
    "color: inherit = ลิงก์กลืนกับข้อความธรรมดา (บั๊กเดิมก่อน 2026-09-02)");
  assert.doesNotMatch(body, /color:\s*var\(--accent\)/,
    "--accent เป็นสีพื้น/เส้น ใช้เป็นสีตัวอักษรแล้วได้คอนทราสต์ 2.75:1 ในธีมสว่าง");
  assert.doesNotMatch(body, /text-decoration:\s*none/,
    "ถอดเส้นใต้ = เหลือสีเป็นตัวบอกความหมายตัวเดียว (WCAG §1.4.1)");
});

/* 🔴 วงโฟกัสต้องเป็น `--accent-ink` ไม่ใช่ `--accent` — `outline-offset: 2px` ดันวง
   ออกไปนั่งบนพื้นหน้า ⇒ พื้นที่ต้องเทียบคือ `--bg` ไม่ใช่ `--panel`
   วัด 2026-09-02: --accent #c9794d บน --bg #efe9dd = **2.75:1 ตก §1.4.11 (ต้อง 3:1)**
   ส่วน --accent-ink #9c5228 = 4.76:1 · ธีมมืดสองโทเคนเป็น #d38a61 ตัวเดียวกัน
   ⚠️ 2.75 คือเลขเดียวกับที่หัวไฟล์นี้ยกมาเป็นเหตุผลว่า --accent ใช้เป็นสีตัวอักษรไม่ได้
   ร่างแรกของกฎนี้ยังเผลอเขียน --accent เพราะ "ตามของหมู่" — อย่าให้เกิดซ้ำ */
test("โฟกัสด้วยคีย์บอร์ดแล้วเห็นวงโฟกัส", () => {
  for (const selector of [".linklike:focus-visible", ".text-action:focus-visible"]) {
    const body = allDeclarations(selector);
    assert.match(body, /outline:\s*2px solid var\(--accent-ink\)/,
      `${selector}: ลิงก์ตัดข้ามบรรทัดได้และครึ่งหนึ่งอยู่ในกล่อง overflow:hidden `
      + "— box-shadow ถูกกินหาย จึงต้องเป็น outline · สีต้องเป็น --accent-ink (3:1)");
    assert.doesNotMatch(body, /outline:[^;]*var\(--accent\)/,
      `${selector}: --accent ได้ 2.75:1 บนพื้นหน้า ตก WCAG 1.4.11`);
  }
});

test("ชี้แล้วเน้นที่เส้น ไม่ใช่ที่ตัวอักษร", () => {
  const hover = block(".linklike:hover:not(:disabled)");
  assert.doesNotMatch(hover, /font-weight|padding|font-size/,
    "เปลี่ยนความหนา/ระยะตอน hover = ข้อความรอบข้างไหลตามเมาส์");
});

test("ชิป @ชื่อคน ใช้โทเคนสีตัวอักษรตัวเดียวกัน", () => {
  const body = block(".mention-chip");
  assert.match(body, /color:\s*var\(--accent-ink\)/,
    "--accent บนพื้น --accent-soft ได้แค่ 2.78:1 ในธีมสว่าง");
});

/* `.rich-link` ยุบรวมเข้า `.linklike` แล้ว — ถ้าใครเผลอเขียนกลับมา ระบบจะมีลิงก์
   สองหน้าตาอีกครั้ง โดยที่ `uiOrphanCss` จับได้ก็ต่อเมื่อไม่มีใครใช้เลยเท่านั้น */
test("ไม่มีคลาสลิงก์ตัวที่สองกลับมา", () => {
  assert.doesNotMatch(stripComments(GLOBALS), /\.rich-link\b/,
    ".rich-link ถูกยุบเข้า .linklike แล้ว (2026-09-02) — อย่าตั้งคลาสลิงก์ตัวที่สองอีก");
  const jsFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) walk(next);
      else if (/\.jsx?$/.test(entry.name)) jsFiles.push(next);
    }
  };
  walk(new URL("../../", here));
  for (const file of jsFiles) {
    for (const value of classNamesOf(readFileSync(file, "utf8"))) {
      assert.doesNotMatch(value, /\brich-link\b/,
        `${file.pathname} ยังแปะ rich-link ที่ไม่มี selector แล้ว (ลิงก์กลายเป็นข้อความธรรมดาเงียบ ๆ)`);
    }
  }
});

test("ตัวเรนเดอร์ข้อความใช้คลาสลิงก์กลาง", () => {
  const linkTags = RICH_TEXT.match(/<(?:a|Link)\b[^>]*>/g) ?? [];
  assert.ok(linkTags.length >= 2, "ควรมีทั้ง <a> (URL ภายนอก) และ <Link> (รหัสเอกสาร)");
  for (const tag of linkTags) {
    assert.match(tag, /className="linklike/, `${tag} ต้องใช้คลาส linklike`);
  }
});

/* ── คู่ตรงข้าม: ข้อความที่ทำงานในหน้านี้ ──────────────────────────────────
   ถ้า `.text-action` หน้าตาเหมือน `.linklike` เมื่อไหร่ ระบบก็เลิกแยก
   "ไปที่อื่น" ออกจาก "เกิดอะไรขึ้นตรงนี้" ทันที */
test(".text-action ต้องไม่ปลอมเป็นลิงก์", () => {
  const body = block(".text-action");
  assert.match(body, /text-decoration:\s*underline dotted/,
    "เส้นประคือสิ่งที่แยกมันออกจากลิงก์ (ท่าเดียวกับ .table-metric-button)");
  assert.doesNotMatch(body, /var\(--accent-ink\)/,
    "สี accent-ink สงวนไว้ให้ 'มี URL ปลายทาง' เท่านั้น");
  // <button> ของ UA เป็น line-height: normal (~1.2) ซึ่งตัดหัวสระบนของไทย
  assert.match(body, /line-height:\s*var\(--lh-(?:text|thai|relaxed)\)/,
    "ต้องสั่งความสูงบรรทัดเอง ไม่งั้นกล่องบรรทัดของ <button> ตัดหัวสระไทย");
});

/* หน้าต้นแบบต้องพูดตรงความจริง — ของที่ไม่อยู่บนหน้านี้ไม่เคยถูกมองเลยสักครั้ง
   แล้วก็ลอกกันเองผิด ๆ ต่อไป (กติกาเดียวกับ buttonPrimitive.test.mjs) */
test("หน้าต้นแบบมีทั้งสามทรงให้เทียบกัน", () => {
  assert.match(PREVIEW, /className="linklike"/, "ต้องมีตัวอย่างลิงก์");
  assert.match(PREVIEW, /className="text-action"/, "ต้องมีตัวอย่างข้อความที่ทำงานในหน้า");
  assert.match(PREVIEW, /table-row-link/, "ต้องบอกด้วยว่าทั้งเซลล์เป็นเป้าเดียวใช้ท่าไหน");
});

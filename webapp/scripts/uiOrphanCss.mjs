/* กฎ "CSS ที่ไม่มีใครเรียก" — ทางกลับของ uiDeadClasses.mjs

   uiDeadClasses ตรวจทางเดียว: *JS เขียนคลาสที่ไม่มี selector จริงไหม*
   ไฟล์นี้ตรวจทางกลับ: *selector นี้ยังมี element ไหนกินอยู่ไหม*

   ที่มา (2026-07-30): ไม่มีใครตรวจทางกลับเลย `globals.css` จึงสะสมกฎของคอมโพเนนต์
   ที่ JS ถูกแทนไปนานแล้วไว้ 254 rule / 1,672 บรรทัด (26% ของไฟล์) โดย audit
   รายงาน `Dead CSS class usages: 0` มาตลอด — และ codemod ความสูงตัวควบคุม (#838)
   เพิ่งเสียแรงไล่แก้ `.prod-gantt-*` ที่ตายไปตั้งแต่คอมมิตแรกของโปรเจกต์

   ⚠️ แยกไฟล์ออกจาก audit-ui.mjs เพื่อให้เทสต์ยิงกฎตัวจริงได้ ไม่ใช่ก๊อป regex ไป
   เขียนซ้ำแล้วเพี้ยนจากกัน (แพตเทิร์นเดียวกับ uiLegacyBudget.mjs / uiDeadClasses.mjs) */

import fs from "node:fs";
import path from "node:path";

/* ตัวคั่นแทนที่ `${…}` ต้อง **ไม่ใช่ช่องว่าง**
   🪤 รอบแรกใช้ช่องว่างแล้วพังเงียบ: template literal ถูกหั่นเป็น "คลาสละชิ้น" ด้วย
   ช่องว่าง ตัวแทนจึงกลายเป็นตัวคั่นไปด้วย → `kind_${x}` เหลือชิ้น "kind_" ที่ไม่มี
   ตัวแทนหลงเหลือ = มองไม่เห็นว่าเป็นชื่อ dynamic */
const HOLE = "\u0000";

/** ชื่อคลาสทั้งหมดที่ปรากฏใน CSS (ตัดคอมเมนต์ออกแล้ว) */
export function classNamesIn(css) {
  return new Set([...stripComments(css).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

export function stripComments(css) {
  /* แทนคอมเมนต์ด้วยช่องว่างที่ยาวเท่ากัน เพื่อให้ index/เลขบรรทัดตรงกับไฟล์จริง */
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------------------------------------------------------------------------
   ชื่อคลาสที่ถูก "ประกอบ" ตอนรันไทม์ — หาไม่เจอด้วยการค้นสตริงตรงตัว

   ของจริงที่เกือบโดนลบ:
     `save-status save-status-${status}`  (components/ui/SaveStatus.js)
     styles[`kind_${visit.kind}`]         (app/service/schedule/page.js)
   ทั้งสองแบบต้องถือว่า "ยังมีชีวิต" ไม่งั้นลบแล้วตัวบอกสถานะ/สีชิปหายเงียบ ๆ
--------------------------------------------------------------------------- */
export function dynamicPatternsIn(sources) {
  const patterns = [];

  const add = (fragment, file, src) => {
    if (!fragment.includes(HOLE)) return;
    /* ต้องมีตัวอักษรจริงติดกัน ≥2 ตัว ไม่งั้น `[\w-]*` ล้วน ๆ จะกลืนทุกชื่อในระบบ
       แล้วกฎนี้จะไม่เคยฟ้องอะไรเลย */
    if (!/[a-zA-Z]{2}/.test(fragment.replaceAll(HOLE, ""))) return;
    const re = new RegExp(`^${fragment.split(HOLE).map(escapeRe).join("[\\w-]*")}$`);
    patterns.push({ re, file, src });
  };

  for (const { file, text } of sources) {
    for (const literal of templateLiteralsIn(text)) {
      if (!literal.includes("${")) continue;
      const holed = literal.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, HOLE);
      for (const fragment of holed.split(/\s+/)) add(fragment, file, trim("`" + literal + "`"));
    }
    /* string concat: "prefix-" + x   และ   x + "-suffix" */
    for (const m of text.matchAll(/(["'])([\w-]*[-_])\1\s*\+/g)) add(m[2] + HOLE, file, trim(m[0]));
    for (const m of text.matchAll(/\+\s*(["'])([-_][\w-]*)\1/g)) add(HOLE + m[2], file, trim(m[0]));
  }
  return patterns;
}

const trim = (s) => s.replace(/\s+/g, " ").slice(0, 80);

/* ดึง template literal ออกมาให้ครบ **รวมตัวที่ซ้อนกัน**

   🪤 ของจริงที่หลุด: service/schedule/page.js เขียน
       `${styles.visitChip} ${styles[`kind_${visit.kind}`] || ""} …`
   regex /`([^`]*)`/ ตัวเดียวจะจับ backtick นอกคู่กับ backtick ในทันที = ได้ชิ้นขยะ
   แล้ว `kind_${…}` หายไปเฉย ๆ → สีชิปตามชนิดงานทั้ง 6 คลาสถูกรายงานว่าตาย

   ⚠️ "ดึงตัวในสุดก่อนแล้ววนใหม่" ก็ยังผิด — regex จับจากซ้ายไปขวา จึงจับ backtick
   *เปิดนอก* คู่กับ *เปิดใน* อยู่ดี ต้องเดินอ่านทีละตัวอักษรและนับความลึกของ \`${…}\`
   เอง: เจอ backtick ตอนอยู่ใน interpolation = ขึ้นตัวซ้อน (เรียกซ้ำ) · เจอตอนอยู่นอก = ปิด */
export function templateLiteralsIn(source) {
  const found = [];

  /** อ่านตั้งแต่หลัง backtick เปิด คืนตำแหน่งถัดจาก backtick ปิด */
  const readLiteral = (start) => {
    let text = "";
    let i = start;
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        text += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "\`") {
        found.push(text);
        return i + 1;
      }
      if (ch === "$" && source[i + 1] === "{") {
        let depth = 1;
        let j = i + 2;
        while (j < source.length && depth > 0) {
          const c = source[j];
          if (c === "\\") { j += 2; continue; }
          if (c === "\`") { j = readLiteral(j + 1); continue; }
          if (c === "{") depth += 1;
          else if (c === "}") depth -= 1;
          j += 1;
        }
        text += "${}"; // ตัวยึด — ไม่ต้องรู้เนื้อใน รู้แค่ว่าตรงนี้เป็นค่าที่เปลี่ยนได้
        i = j;
        continue;
      }
      text += ch;
      i += 1;
    }
    found.push(text);
    return i;
  };

  let i = 0;
  while (i < source.length) {
    if (source[i] === "\`") i = readLiteral(i + 1);
    else i += 1;
  }
  return found;

}

/* ---------------------------------------------------------------------------
   เดิน rule ทุกความลึก (รวมที่อยู่ใน @media/@supports) แล้วคืน rule ที่
   **ทุกคลาสในตัวเลือก** ไม่มีใครเรียก — ถ้ามีคลาสที่ยังใช้อยู่แม้แต่ตัวเดียว
   ให้ถือว่ายังมีชีวิต (เช่น `.การ์ดที่ใช้อยู่ .ลูกที่ตายแล้ว` ไม่นับ เพราะการลบ
   ต้องดูบริบทว่าลูกนั้นควรมีอยู่ไหม ไม่ใช่งานของ ratchet)
--------------------------------------------------------------------------- */
export function orphanRulesIn(css, { isAlive, dynamic = [] }) {
  const clean = stripComments(css);
  const found = [];

  const scan = (text, offset) => {
    let depth = 0;
    let ruleStart = 0;
    let selStart = 0;
    let braceAt = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") {
        if (depth === 0) {
          selStart = ruleStart;
          braceAt = i;
        }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const selector = text.slice(selStart, braceAt).trim();
          if (selector.startsWith("@")) {
            scan(text.slice(braceAt + 1, i), offset + braceAt + 1);
          } else if (selector.includes(".") && !selector.startsWith(":root")) {
            const names = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
            const orphan =
              names.length > 0 &&
              names.every((n) => !isAlive(n) && !dynamic.some((p) => p.re.test(n)));
            if (orphan) {
              found.push({
                selector: selector.replace(/\s+/g, " "),
                names,
                index: offset + selStart,
                end: offset + i + 1,
                lines: text.slice(selStart, i + 1).split("\n").length,
              });
            }
          }
          ruleStart = i + 1;
        }
      }
    }
  };

  scan(clean, 0);
  return found;
}

/* ---------------------------------------------------------------------------
   ตัวห่อสำหรับ audit — นับ orphan แยก globals.css กับ CSS module

   globals.css     : คลาสถูกเขียนเป็นสตริงใน JSX ตรง ๆ → ค้นชื่อทั้งระบบ
   *.module.css    : อ้างผ่าน `styles.foo` / `styles["foo"]` / template literal
                     → ค้นชื่อแบบเดียวกันก็พอ (ชื่อคลาสปรากฏเป็นคำในไฟล์ JS อยู่ดี)
--------------------------------------------------------------------------- */
export function countOrphanCss(root, files) {
  const rel = (f) => path.relative(root, f).replaceAll("\\", "/");
  const jsFiles = files.filter((f) => /\.(?:js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
  const sources = jsFiles.map((f) => ({ file: rel(f), text: fs.readFileSync(f, "utf8") }));
  const haystack = sources.map((s) => s.text).join("\n");
  const dynamic = dynamicPatternsIn(sources);

  const cache = new Map();
  const isAlive = (name) => {
    if (!cache.has(name)) {
      cache.set(name, new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`).test(haystack));
    }
    return cache.get(name);
  };

  const cssFiles = files.filter((f) => f.endsWith(".css"));
  const result = { globals: [], modules: [] };
  for (const file of cssFiles) {
    const relPath = rel(file);
    if (EXEMPT_CSS.some((prefix) => relPath.startsWith(prefix))) continue;
    const css = fs.readFileSync(file, "utf8");
    const orphans = orphanRulesIn(css, { isAlive, dynamic });
    if (!orphans.length) continue;
    const bucket = relPath.endsWith("globals.css") ? result.globals : result.modules;
    for (const o of orphans) {
      bucket.push(`${relPath}:${css.slice(0, o.index).split("\n").length} ${o.selector}`);
    }
  }
  return result;
}

/* เอกสารพิมพ์มี CSS ของตัวเองและคลาสถูกประกอบใน HTML string ของ builder
   (เครื่องพิมพ์ไม่เห็น globals.css) — คนละกลไกกับ className ของ React */
export const EXEMPT_CSS = ["src/components/documents/", "src/lib/"];

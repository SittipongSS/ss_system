/* กฎ "styles.foo ต้องมีอยู่จริงในสไตล์ชีตที่ไฟล์นั้น import"

   uiDeadClasses  ตรวจ className สตริงตรงตัวเทียบ globals.css
   uiOrphanCss    ตรวจทางกลับ: selector นี้ยังมีใครกินอยู่ไหม
   ไฟล์นี้ปิดรูที่เหลือ: **ตัวอ้าง `styles.foo` / `base.foo` ชี้ไปที่คลาสที่ไม่มีอยู่จริง**

   ที่มา (2026-08-04): สองกฎเดิมมองข้าม import ข้ามโฟลเดอร์ทั้งคู่
   `settings/document-standards/page.js` เขียน `import base from "../company/page.module.css"`
   แล้ว b72701d8 (25 ก.ค. 2026) ออกแบบหน้าข้อมูลบริษัทใหม่ ตัดส่วนประวัติเวอร์ชันทิ้ง
   พร้อมลบ selector ที่ไม่มีใครใช้ *ในหน้านั้น* ออก 20 ตัว (.historyPanel .historyCards
   .panelHeader .historyTable .card .cardHead .drawerBody .drawerSection .detailGrid …)
   หน้ามาตรฐานเอกสารยังอ้างครบทุกตัวผ่าน `base` → การ์ดเวอร์ชันซ้อนใต้ตารางบนจอใหญ่
   (`.historyCards { display: none }` หายไป) และ detail grid ในลิ้นชักไม่มีสไตล์
   ตลอดเวลานั้น `npm run audit:ui` รายงาน `Dead CSS class usages: 0`

   ตรวจสองชั้น เพราะกันคนละอย่าง:
     1) missing         — อ้างคลาสที่ไม่มี selector ในชีตที่ import มา (อาการ)
     2) crossDirectory  — import *.module.css ข้ามโฟลเดอร์ตัวเอง (ต้นเหตุ)
   ชั้น 2 ไม่ซ้ำซ้อนกับชั้น 1: ชั้น 1 จับได้ตอน "พังแล้ว" ส่วนชั้น 2 กันไม่ให้ผูกกัน
   ตั้งแต่แรก — เจ้าของชีตไม่มีทางรู้ว่ามีหน้าอื่นแอบกินอยู่ ของที่ต้องใช้ร่วมกัน
   ให้ไปอยู่ globals.css หรือยกเป็นคอมโพเนนต์ใน components/ui/ ที่เป็นเจ้าของสไตล์เอง

   ⚠️ แยกไฟล์ออกจาก audit-ui.mjs เพื่อให้เทสต์ยิงกฎตัวจริงได้
   (แพตเทิร์นเดียวกับ uiLegacyBudget.mjs / uiDeadClasses.mjs / uiOrphanCss.mjs) */

import fs from "node:fs";
import path from "node:path";
import { classNamesIn, stripComments } from "./uiOrphanCss.mjs";

/* ใช้ตัวดึงชื่อคลาสตัวเดียวกับ uiOrphanCss — ห้ามก๊อป regex มาเขียนซ้ำ ไม่งั้นสองกฎ
   จะเพี้ยนจากกันแล้วชีตเดียวกันถูกอ่านคนละแบบ */
export { classNamesIn };

/** default import ของ *.module.css → [{ alias, specifier, line }]
    (`import "./x.module.css"` แบบไม่มีชื่อ ไม่มีตัวอ้างให้ตรวจ จึงข้าม) */
export function cssModuleImportsIn(source) {
  const clean = stripJsComments(source);
  const re = /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+\.module\.css)["']/g;
  return [...clean.matchAll(re)].map((m) => ({
    alias: m[1],
    specifier: m[2],
    line: lineAt(clean, m.index),
  }));
}

/* ---------------------------------------------------------------------------
   ตัวอ้างที่ "รู้ชื่อตั้งแต่ตอนเขียน" เท่านั้น — ตัวที่ประกอบตอนรันไทม์
   (`styles[`kind_${x}`]`, `styles[key]`) ตรวจไม่ได้และไม่ควรตรวจ ปล่อยผ่าน
   ให้ uiOrphanCss ดูจากอีกฝั่งแทน

   🪤 ต้องกัน `.` ข้างหน้าไว้ ไม่งั้น `props.styles.foo` / `theme.base.card`
   จะถูกอ่านเป็นตัวอ้างของ alias ทั้งที่เป็นคนละตัว
--------------------------------------------------------------------------- */
export function memberAccessesIn(source, alias) {
  const clean = stripJsComments(source);
  const a = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [];

  const dot = new RegExp(`(?<![\\w$.])${a}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  for (const m of clean.matchAll(dot)) found.push({ name: m[1], line: lineAt(clean, m.index) });

  /* `styles["foo-bar"]` — ชื่อคลาสแบบขีดกลางเรียกด้วยจุดไม่ได้ ต้องผ่านวงเล็บ
     รับเฉพาะสตริงล้วน: มี `${` เมื่อไหร่ = ชื่อประกอบตอนรันไทม์ → ข้าม */
  const bracket = new RegExp(`(?<![\\w$.])${a}\\s*\\??\\[\\s*(["'\`])((?:(?!\\1)[^\\\\$])*)\\1\\s*\\]`, "g");
  for (const m of clean.matchAll(bracket)) found.push({ name: m[2], line: lineAt(clean, m.index) });

  return found;
}

/** แปลง specifier เป็น path จริงเทียบ root (`@/…` = `src/…` ตาม jsconfig paths) */
export function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith("@/")) return path.join("src", specifier.slice(2));
  return path.join(path.dirname(fromFile), specifier);
}

/* ---------------------------------------------------------------------------
   แกนกลางที่ไม่แตะดิสก์ — เทสต์ยิงตรงนี้ได้โดยไม่ต้องวางไฟล์จริง
   `readCss(relPath)` คืนเนื้อ CSS หรือ null ถ้าไม่มีไฟล์นั้น
--------------------------------------------------------------------------- */
export function checkModuleUsage(file, text, readCss) {
  const missing = [];
  const crossDirectory = [];
  const unresolved = [];

  for (const { alias, specifier, line } of cssModuleImportsIn(text)) {
    const sheet = normalize(resolveSpecifier(file, specifier));
    const css = readCss(sheet);
    if (css == null) {
      unresolved.push(`${file}:${line} import ${alias} from "${specifier}" → ไม่มีไฟล์ ${sheet}`);
      continue;
    }
    if (path.posix.dirname(sheet) !== path.posix.dirname(normalize(file))) {
      crossDirectory.push(
        `${file}:${line} import ${alias} from "${specifier}" — ${sheet} เป็นของโฟลเดอร์อื่น`,
      );
    }
    const names = classNamesIn(css);
    for (const { name, line: at } of memberAccessesIn(text, alias)) {
      if (!names.has(name)) missing.push(`${file}:${at} ${alias}.${name} → ไม่มี .${name} ใน ${sheet}`);
    }
  }

  return { missing, crossDirectory, unresolved };
}

/** ตัวห่อสำหรับ audit — รับรายชื่อไฟล์ทั้งระบบแบบเดียวกับ countOrphanCss */
export function checkCssModuleImports(root, files) {
  const rel = (f) => path.relative(root, f).replaceAll("\\", "/");
  const jsFiles = files.filter((f) => /\.(?:js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
  const readCss = (relPath) => {
    const full = path.join(root, relPath);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  };

  const result = { missing: [], crossDirectory: [], unresolved: [] };
  for (const file of jsFiles) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(".module.css")) continue;
    const found = checkModuleUsage(rel(file), text, readCss);
    for (const key of Object.keys(result)) result[key].push(...found[key]);
  }
  return result;
}

const normalize = (p) => p.replaceAll("\\", "/");
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/* ตัดคอมเมนต์ JS โดยรักษาความยาว/เลขบรรทัดไว้ (แบบเดียวกับ stripComments ของ CSS)
   — คอมเมนต์ในโปรเจกต์นี้ยาวและอ้างชื่อคลาสบ่อย ปล่อยไว้จะฟ้องผิดตัว */
function stripJsComments(source) {
  return stripComments(source).replace(/(^|[^:])\/\/[^\n]*/g, (m, head) => head + " ".repeat(m.length - head.length));
}

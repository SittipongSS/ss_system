import test from "node:test";
import assert from "node:assert/strict";
import {
  checkModuleUsage,
  cssModuleImportsIn,
  memberAccessesIn,
  resolveSpecifier,
} from "../../../scripts/uiCssModuleImports.mjs";

/* สไตล์ชีตปลอมที่ readCss จะหยิบไปให้ — คีย์เป็น path เทียบ root แบบเดียวกับของจริง */
const sheets = (map) => (relPath) => (relPath in map ? map[relPath] : null);
const check = (file, text, map) => checkModuleUsage(file, text, sheets(map));

test("อ้างคลาสที่มีอยู่จริง ผ่าน — อ้างคลาสที่ไม่มี ฟ้อง", () => {
  const found = check("src/app/a/page.js", 'import styles from "./page.module.css";\nstyles.alive;\nstyles.gone;', {
    "src/app/a/page.module.css": ".alive { color: red; }",
  });
  assert.deepEqual(found.crossDirectory, []);
  assert.equal(found.missing.length, 1);
  assert.match(found.missing[0], /src\/app\/a\/page\.js:3 styles\.gone/);
});

/* 🪤 เหตุการณ์จริง 2026-08-04 ที่กฎนี้เกิดมาเพื่อกัน: document-standards ยืมชีตของ
   company มาใช้ แล้ว b72701d8 ลบ selector ที่ "ไม่มีใครใช้" ทิ้ง — หน้าที่ยืมพังเงียบ */
test("ยืมชีตข้ามโฟลเดอร์แล้วเจ้าของลบ selector ทิ้ง ต้องฟ้องทั้งอาการและต้นเหตุ", () => {
  const page = 'import base from "../company/page.module.css";\n<div className={base.historyCards} />';
  const found = check("src/app/settings/document-standards/page.js", page, {
    "src/app/settings/company/page.module.css": ".form { display: flex; }",
  });
  assert.equal(found.missing.length, 1, "ไม่เห็นว่า base.historyCards ไม่มี selector แล้ว");
  assert.match(found.missing[0], /base\.historyCards/);
  assert.equal(found.crossDirectory.length, 1, "ไม่เห็นว่า import ข้ามโฟลเดอร์");
  assert.match(found.crossDirectory[0], /settings\/company\/page\.module\.css เป็นของโฟลเดอร์อื่น/);
});

test("import ชีตของโฟลเดอร์ตัวเอง ไม่ใช่ crossDirectory", () => {
  const found = check("src/components/ui/Tag.js", 'import styles from "./Badge.module.css";\nstyles.tag;', {
    "src/components/ui/Badge.module.css": ".tag { color: red; }",
  });
  assert.deepEqual(found.crossDirectory, []);
  assert.deepEqual(found.missing, []);
});

test("specifier ที่ resolve ไม่ได้ ต้องฟ้อง ไม่ใช่เงียบว่า 'ไม่มีคลาสไหนหาย'", () => {
  const found = check("src/app/a/page.js", 'import styles from "./page.module.css";\nstyles.whatever;', {});
  assert.equal(found.unresolved.length, 1);
  assert.deepEqual(found.missing, [], "resolve ไม่ได้ = ยังไม่รู้ ห้ามเดาว่าคลาสหาย");
});

/* ---- ตัวอ้างแบบต่าง ๆ ---- */

test("ชื่อคลาสขีดกลางเรียกผ่านวงเล็บสตริง ต้องตรวจด้วย", () => {
  const js = 'import styles from "./page.module.css";\nstyles["is-open"];\nstyles["is-gone"];';
  const found = check("src/app/a/page.js", js, { "src/app/a/page.module.css": ".is-open { top: 0; }" });
  assert.equal(found.missing.length, 1);
  assert.match(found.missing[0], /styles\.is-gone/);
});

/* ชื่อที่ประกอบตอนรันไทม์ตรวจไม่ได้ — ปล่อยผ่าน ไม่ใช่เดาว่าหาย
   (ของจริง: service/schedule/page.js เขียน styles[`kind_${visit.kind}`]) */
test("ชื่อที่ประกอบตอนรันไทม์ ต้องไม่ถูกฟ้อง", () => {
  const js = "import styles from './page.module.css';\nstyles[`kind_${visit.kind}`];\nstyles[key];";
  const found = check("src/app/a/page.js", js, { "src/app/a/page.module.css": ".x { top: 0; }" });
  assert.deepEqual(found.missing, []);
});

/* 🪤 `props.styles.card` ไม่ใช่ตัวอ้างของ alias — ถ้าไม่กัน `.` ข้างหน้า กฎนี้จะฟ้อง
   ทุกหน้าที่ส่ง styles เป็น prop ต่อ */
test("จุดข้างหน้า = คนละตัว ห้ามอ่านเป็นตัวอ้างของ alias", () => {
  const js = 'import styles from "./page.module.css";\nprops.styles.card;\ntheme.styles["card"];';
  const found = check("src/app/a/page.js", js, { "src/app/a/page.module.css": ".x { top: 0; }" });
  assert.deepEqual(found.missing, []);
});

test("optional chaining ก็เป็นตัวอ้างเหมือนกัน", () => {
  const js = 'import styles from "./page.module.css";\nstyles?.gone;';
  const found = check("src/app/a/page.js", js, { "src/app/a/page.module.css": ".x { top: 0; }" });
  assert.equal(found.missing.length, 1);
});

test("selector ที่อยู่ใน @media หรือเขียนซ้อนกัน นับว่ามีอยู่จริง", () => {
  const css = "@media (max-width: 800px) { .compact { gap: 0; } }\n.row .cell { top: 0; }";
  const js = 'import styles from "./page.module.css";\nstyles.compact;\nstyles.cell;';
  assert.deepEqual(check("src/app/a/page.js", js, { "src/app/a/page.module.css": css }).missing, []);
});

/* คอมเมนต์ในโปรเจกต์นี้ยาวและอ้างชื่อคลาสบ่อย — ปล่อยไว้จะฟ้องชื่อที่ไม่มีใครเรียกจริง */
test("ชื่อในคอมเมนต์ทั้งสองแบบ ไม่นับเป็นตัวอ้าง", () => {
  const js = [
    'import styles from "./page.module.css";',
    "/* เลิกใช้ styles.legacyCard ไปแล้วตั้งแต่ #803 */",
    "// styles.alsoGone",
    "styles.alive;",
  ].join("\n");
  assert.deepEqual(check("src/app/a/page.js", js, { "src/app/a/page.module.css": ".alive { top: 0; }" }).missing, []);
});

/* ---- ส่วนย่อยที่ประกอบขึ้นเป็นกฎ ---- */

test("cssModuleImportsIn เก็บเฉพาะ default import ของ *.module.css", () => {
  const js = [
    'import styles from "./page.module.css";',
    "import base from '../company/page.module.css';",
    'import "./side-effect.module.css";', // ไม่มีชื่อ = ไม่มีตัวอ้างให้ตรวจ
    'import Table from "@/components/ui/Table";',
    'import "./globals.css";',
  ].join("\n");
  assert.deepEqual(
    cssModuleImportsIn(js).map((i) => [i.alias, i.specifier, i.line]),
    [
      ["styles", "./page.module.css", 1],
      ["base", "../company/page.module.css", 2],
    ],
  );
});

test("memberAccessesIn คืนชื่อพร้อมเลขบรรทัด", () => {
  assert.deepEqual(memberAccessesIn("\n\nstyles.card;", "styles"), [{ name: "card", line: 3 }]);
});

test("resolveSpecifier: relative เดินขึ้นโฟลเดอร์ได้ และ @/ ชี้ไป src/", () => {
  assert.equal(
    resolveSpecifier("src/app/settings/document-standards/page.js", "../company/page.module.css"),
    "src/app/settings/company/page.module.css",
  );
  assert.equal(
    resolveSpecifier("src/app/a/page.js", "@/components/ui/Table.module.css"),
    "src/components/ui/Table.module.css",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ชั้นขนาดตัวอักษร — ที่เดียวของทั้งระบบ

   ตรวจ 2026-07-29: ชั้นนี้เคยประกาศไว้ 9 ค่าแต่มีคนอ้างจริงแค่ 7 จุด ขณะที่ทั้งระบบ
   เขียนเลขดิบ 521 จุดใน 22 ค่าที่ต่างกัน = แก้ชั้นพิมพ์ทีเดียวทั้งระบบไม่ได้เลย
   เทสต์นี้กันไม่ให้ไหลกลับไปเป็นแบบนั้น (audit:ui จับ px ดิบอยู่แล้ว
   ตรงนี้กันโครงของตัวชั้นเอง) */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

const declarations = [...GLOBALS.matchAll(/^\s*(--fs-[a-z0-9-]+):\s*([^;]+);/gm)]
  .map(([, name, value]) => ({ name, value: value.trim() }));

const steps = declarations.filter((d) => /^--fs-\d+$/.test(d.name));
const aliases = declarations.filter((d) => !/^--fs-\d+$/.test(d.name));

test("ขั้นของชั้นพิมพ์เป็นตัวเลขล้วน เรียงจากเล็กไปใหญ่ ไม่ซ้ำค่า", () => {
  assert.ok(steps.length >= 10, `เจอขั้นแค่ ${steps.length} — น้อยผิดปกติ`);
  const px = steps.map((s) => {
    assert.match(s.value, /^[\d.]+px$/, `${s.name} ต้องเป็นค่า px ตรง ๆ ไม่ใช่ ${s.value}`);
    return Number(s.value.replace("px", ""));
  });
  for (let i = 1; i < px.length; i += 1) {
    assert.ok(px[i] > px[i - 1], `${steps[i].name} (${px[i]}px) ต้องใหญ่กว่าขั้นก่อนหน้า`);
  }
});

test("ชื่อตามหน้าที่ต้องชี้ไปที่ขั้น ห้ามใส่ px เอง", () => {
  assert.ok(aliases.length > 0, "ต้องมีชื่อตามหน้าที่อย่างน้อย 1 ตัว");
  for (const alias of aliases) {
    assert.match(alias.value, /^var\(--fs-\d+\)$/,
      `${alias.name} ต้องชี้ไปที่ขั้น (var(--fs-N)) ไม่ใช่ ${alias.value} — ไม่งั้นจะเกิดค่าที่แก้ไม่พร้อมกัน`);
  }
});

test("ไม่ประกาศชื่อตามหน้าที่ทิ้งไว้โดยไม่มีใครใช้", () => {
  const cssFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) cssFiles.push(full);
    }
  })(root);
  const allCss = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  for (const alias of aliases) {
    const uses = allCss.split(`var(${alias.name})`).length - 1;
    assert.ok(uses > 0,
      `${alias.name} ไม่มีใครใช้ — ลบทิ้ง (ชื่อที่ประกาศเผื่อไว้ทำให้เข้าใจผิดว่าชั้นนี้ถูกใช้จริง)`);
  }
});

test("ทุกโทเคนที่ถูกอ้างถึงมีประกาศอยู่จริง", () => {
  const cssFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) cssFiles.push(full);
    }
  })(root);

  const declared = new Set(declarations.map((d) => d.name));
  const missing = new Set();
  for (const file of cssFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const [, name] of source.matchAll(/var\((--fs-[a-z0-9-]+)\)/g)) {
      if (!declared.has(name)) missing.add(`${name} (${path.relative(process.cwd(), file)})`);
    }
  }
  assert.deepEqual([...missing], [],
    "โทเคนที่ไม่มีประกาศจะทำให้ font-size ตกไปใช้ค่าที่สืบทอดมาแบบเงียบ ๆ");
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* `.page` เป็น **คลาสวางเลย์เอาต์หน้า** ใน globals.css — `padding: 24px …` ·
   `max-width: var(--content-max)` · `margin: 0 auto`

   แถบบันทึกเคยใช้ชื่อเดียวกันนี้เป็น *modifier* (`class="form-action-bar page"`)
   แปลว่า "แถบของฟอร์มเต็มหน้า ไม่ใช่ในโมดัล" ผลคือกฎ `.page` ซึ่งประกาศทีหลัง
   ในไฟล์เดียวกันและ specificity เท่ากัน ทับ `margin-top: 20px` ของแถบทิ้งด้วย
   `margin: 0 auto` → แถบไปติดช่องกรอกแถวสุดท้ายพอดี และโดน max-width บีบความกว้าง
   (ผู้ใช้ส่งภาพมา 2026-07-29) เปลี่ยนเป็น `is-page` แล้ว

   เทสต์นี้กันไม่ให้ใครเผลอเอาคลาสเลย์เอาต์กลับมาใช้เป็น modifier อีก */

const root = path.join(process.cwd(), "src");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const runtimeFiles = walk(root).filter((f) => /\.(?:js|jsx)$/.test(f));

test("แถบบันทึกไม่ใช้คลาสเลย์เอาต์ `page` เป็น modifier", () => {
  const offenders = [];
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      // className ที่มีทั้ง form-action(s)-bar และคำว่า page เดี่ยว ๆ ในสตริงเดียวกัน
      for (const match of line.matchAll(/className="([^"]*)"/g)) {
        const classes = match[1].split(/\s+/);
        if (!classes.some((c) => c === "form-action-bar" || c === "form-actions")) continue;
        if (classes.includes("page")) {
          offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], `ใช้ \`is-page\` แทน — \`page\` เป็นคลาสวางเลย์เอาต์หน้า`);
});

test("globals.css ผูกสไตล์แถบเต็มหน้าไว้กับ is-page ไม่ใช่ page", () => {
  const css = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
  assert.match(css, /\.form-action-bar\.is-page\s*\{/);
  assert.doesNotMatch(css, /\.form-action-bar\.page\s*\{/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// อ่านเป็นข้อความแทน import — ไฟล์เหล่านี้เป็น client component ที่ import lucide-react
const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const BUTTON = src("./Button.js");
const ACTION_BUTTONS = src("./ActionButtons.js");
const PREVIEW = src("../../app/settings/design-preview/page.js");

test("Button เป็นที่เดียวที่ประกอบคลาสตระกูล btn", () => {
  assert.match(BUTTON, /iconOnly \? "btn-icon" : "btn"/);
  for (const cls of ["btn-secondary", "btn-primary", "btn-accent", "btn-danger", "btn-warning"]) {
    assert.match(BUTTON, new RegExp(cls), `Button ต้องรู้จัก tone ${cls}`);
  }
  // ไม่ระบุ tone = ปุ่มพื้นฐาน — ถ้าเผลอใส่ค่าเริ่มต้นเป็น neutral ปุ่มไอคอนจะโดนทับพื้น
  assert.doesNotMatch(BUTTON, /tone = "neutral"/);
});

test("ActionButton เหลือแค่ชั้นความหมาย ไม่ประกอบคลาสเอง", () => {
  assert.match(ACTION_BUTTONS, /import Button from "@\/components\/ui\/Button"/);
  assert.match(ACTION_BUTTONS, /<Button/);
  // KINDS ต้องพูดด้วยภาษา tone ไม่ใช่ชื่อคลาส CSS
  assert.doesNotMatch(ACTION_BUTTONS, /cls: "btn/);
});

/* หน้าต้นแบบต้องโชว์ทุก tone และปุ่มสองแบบที่ยังซ้ำกันอยู่ (quiet vs ghost)
   ไม่งั้นการตัดสินใจว่าจะยุบอันไหนทิ้งจะไม่มีที่ให้ดูเทียบ */
test("หน้าต้นแบบครอบคลุม primitive ที่ต้องตัดสินใจ", () => {
  assert.match(PREVIEW, /variant="quiet"/);
  assert.match(PREVIEW, /variant="ghost"/);
  assert.match(PREVIEW, /<TableShell/);
  assert.match(PREVIEW, /StatusNotice/);
  assert.match(PREVIEW, /EmptyState/);
  // ห้ามผูกกับข้อมูลจริง — หน้านี้ต้องเปิดได้แม้ระบบหลังบ้านล่ม
  assert.doesNotMatch(PREVIEW, /fetch\(|supabase/);
});

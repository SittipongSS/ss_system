import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEAD_CLASSES } from "../../../scripts/uiDeadClasses.mjs";

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

/* `.btn.danger` ไม่มีอยู่จริงในระบบ — เขียนแล้วได้ปุ่มเทาแทนปุ่มแดง หลุด prod มาแล้ว
   สองรอบ (PR #699 แล้วกลับมาที่หน้าทะเบียนกลิ่น/สูตรของ PR #778) กฎเดิมตรวจสตริง
   ตรงตัวจึงจับรอบสองไม่ได้ เทสต์นี้ยิงกฎจริงเพื่อกันไม่ให้แคบลงอีก */
test("audit:ui จับ btn+danger ได้ทุกลำดับคลาส และไม่จับคลาสที่มี selector จริง", () => {
  const flags = (code) => DEAD_CLASSES.some(({ pattern }) => pattern.test(code));

  for (const dead of [
    'className="btn danger"',
    'className="btn sm ghost danger"',      // รูปที่หลุดมาจริง
    'className="btn danger sm"',
    'className="input"',
  ]) {
    assert.ok(flags(dead), `ต้องจับได้: ${dead}`);
  }

  for (const alive of [
    'className="btn btn-danger"',           // ปุ่มเต็มสีแดง
    'className="btn-icon danger"',          // ปุ่มไอคอนสีแดง
    'className="btn action-ghost sm btn-danger"',
    'className="btn sm ghost"',
    'className="premium-input"',
  ]) {
    assert.ok(!flags(alive), `ต้องไม่จับ: ${alive}`);
  }
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

/* ⭐ ช่องกรอกเป็นกลุ่มที่หลุดหน้าต้นแบบมานานที่สุด — ผู้ใช้ตรวจดีไซน์ด้วยตาที่หน้านี้
   ของที่ไม่อยู่บนหน้านี้จึงไม่เคยถูกมองเลยสักครั้ง แล้วก็ลอกกันเองผิด ๆ ต่อไป
   (ตรวจ 2026-07-28: มี 29 จาก 47 primitive · ที่ขาดเกือบทั้งหมดคือช่องกรอก)
   เพิ่มชื่อในลิสต์นี้ทุกครั้งที่สร้าง primitive ใหม่ใน components/ui/ */
test("หน้าต้นแบบต้องมีช่องกรอกและตัวเลือกครบทุกตัว", () => {
  for (const primitive of [
    "MoneyInput",              // จัดลูกน้ำระหว่างพิมพ์ + คืนตำแหน่งเคอร์เซอร์
    "PhoneInput",
    "NationalIdInput",
    "SearchableSelect",
    "PersonSelect",
    "ProductCategorySelect",
    "MultiSelectFilter",
    "ViewSwitcher",
    "SaveStatus",
    "FormActions",
    "ReadableText",
    // ชั้นโครงหน้ารายละเอียด — ใช้ร่วมกันทุกหน้าเอกสาร (QT · SO · CR · ดีล · โครงการ)
    "DetailOverview",
    "DetailPageLayout",
    "DetailCard",
    "ContextCard",
    "DetailRow",
    "DocumentControlCard",
    "VersionControlCard",
    "ActionQueue",
    "AccessDenied",
  ]) {
    assert.match(PREVIEW, new RegExp(`<${primitive}\\b`), `หน้าต้นแบบต้องมีตัวอย่าง ${primitive}`);
  }
});

/* หน้าต้นแบบเคยเป็นหน้าเดียวยาว 19 ส่วน (วัดจริง 10,217px ≈ 12.8 จอ) — จัดเป็น 5 กลุ่ม
   ตามหน้าที่แล้วแสดงทีละกลุ่ม · เทสต์นี้กันไม่ให้ส่วนใหม่หลุดกลุ่ม (ซึ่งจะทำให้มันหายไป
   จากหน้าเงียบ ๆ เพราะไม่มี tab ไหนแสดงมัน) */
test("ทุกส่วนของหน้าต้นแบบอยู่ในกลุ่มที่ประกาศไว้", () => {
  // อ่านเฉพาะในบล็อก GROUPS — หน้านี้มี Tabs ตัวอย่างที่ใช้ {key,label} เหมือนกัน
  const groupsBlock = PREVIEW.match(/const GROUPS = \[([\s\S]*?)\n\];/);
  assert.ok(groupsBlock, "ต้องมี GROUPS ประกาศไว้");
  const declared = [...groupsBlock[1].matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(declared.length >= 4, `GROUPS มีแค่ ${declared.length} กลุ่ม`);

  const used = [...PREVIEW.matchAll(/<Section group="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 15, `เจอ <Section> แค่ ${used.length} — น้อยผิดปกติ`);
  for (const group of new Set(used)) {
    assert.ok(declared.includes(group), `group "${group}" ไม่มีใน GROUPS`);
  }
  // ทุกกลุ่มต้องมีของอยู่จริง ไม่งั้นกดแท็บแล้วเจอหน้าว่าง
  for (const group of declared) {
    assert.ok(used.includes(group), `กลุ่ม "${group}" ไม่มีส่วนไหนอยู่เลย`);
  }
  // ห้ามเหลือ WorkspaceSection ที่ไม่ผ่าน Section — มันจะโผล่ทุกแท็บ
  assert.doesNotMatch(PREVIEW, /^\s+<WorkspaceSection/m);
});

/* ช่องกรอกพวกนี้ใส่ `premium-input` ให้เองอยู่แล้ว — ส่งซ้ำจะได้คลาสซ้ำในสตริงเดียว
   และทำให้คนอ่านหน้าต้นแบบเข้าใจผิดว่าต้องส่งเอง */
test("หน้าต้นแบบไม่ส่ง premium-input ซ้ำให้ช่องที่ใส่คลาสเอง", () => {
  for (const primitive of ["MoneyInput", "PhoneInput", "NationalIdInput"]) {
    const usage = PREVIEW.match(new RegExp(`<${primitive}\\b[^>]*>`, "g")) || [];
    for (const tag of usage) {
      assert.doesNotMatch(tag, /premium-input/, `${primitive} ไม่ต้องรับ className="premium-input"`);
    }
  }
});

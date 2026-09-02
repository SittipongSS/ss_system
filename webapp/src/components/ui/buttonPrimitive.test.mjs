import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEAD_CLASSES } from "../../../scripts/uiDeadClasses.mjs";

// อ่านเป็นข้อความแทน import — ไฟล์เหล่านี้เป็น client component ที่ import lucide-react
const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const BUTTON = src("./Button.js");
const ACTION_BUTTONS = src("./ActionButtons.js");
const PREVIEW = src("../../app/settings/design-preview/page.js");
const CONFIRM_DIALOG = src("./ConfirmDialog.js");
const FORM_ACTIONS = src("./FormActions.js");

/* ── โทนปุ่มบอก "ความหมาย" ไม่ใช่ "อันดับ" (มติผู้ใช้ 2026-07-17 · ด่านนี้ 2026-09-02) ──
   `accent` (terracotta) = เริ่มของใหม่ · `primary` (navy) = ยืนยันสิ่งที่ทำอยู่
   สองตัวนี้ไม่ได้แข่งกันว่าใครสำคัญกว่า ⇒ ปุ่มยืนยันเป็น `primary` เสมอ **แม้เป็น
   ปุ่มทึบตัวเดียวบนจอนั้น**

   🔴 เหตุที่ต้องมีด่าน: `UI_DESIGN_SYSTEM.md` เคยเขียนกฎ "จอละ 1 accent" ผิดเป็น
   "ปุ่มทึบตัวเดียวคือ accent" แล้วคนเขียนหน้าก็ทำตามเอกสาร (เช่น `app/support/[id]`
   ที่อ้างเอกสารในคอมเมนต์ตรง ๆ แล้วทา accent ให้ปุ่ม "รับเรื่อง") ⇒ ดริฟต์มาจาก
   **สำเนาที่ผิด** ไม่ใช่ความเผลอของแต่ละหน้า
   🔴 และตัวที่ผิดหนักที่สุดคือ primitive กลาง: `ConfirmDialog` ตั้งปุ่มยืนยันเป็น
   `accent` ⇒ โมดัลยืนยัน **ทุกใบในระบบ** ได้สีที่แปลว่า "เริ่มของใหม่" ทั้งที่มันคือ
   "ยืนยันสิ่งที่ทำอยู่" เป๊ะ ๆ · grep `tone="accent"` มองไม่เห็นเลยเพราะมันนับไฟล์ที่
   เรียกใช้ ไม่ได้นับจอที่เรนเดอร์

   ⚠️ ห้ามทำด่าน "นับ accent ต่อไฟล์ ≤1" — กฎความถี่ตัดสินด้วยสิ่งที่ *เรนเดอร์พร้อมกัน*
   (โมดัลนับแยกใบ · กิ่ง ternary ที่ไม่มีทางเกิดพร้อมกันนับเป็น 1 · แถวตารางนับเป็น N)
   ซึ่ง static analysis ไม่รู้ ⇒ ได้ด่านที่ต้องใส่ข้อยกเว้นทุกอาทิตย์แล้วก็ตาย
   ด่านที่ยิงได้จริงคือ **กฎความหมาย** ที่ผูกกับ primitive กลางแบบข้างล่างนี้ */
const TONE_MEANINGS = {
  primary: "ยืนยันสิ่งที่ทำอยู่",
  accent: "เริ่มของใหม่",
};

/* 🚫 **อย่าตั้งด่านเชิงคำที่อ่านป้ายบนปุ่มแล้วเดาความหมาย** — ลองแล้ว 2026-09-02 และตกรอบ
   แนวคิดที่ลอง: ฟ้องเมื่อโทน = accent แต่ป้ายขึ้นต้นด้วย บันทึก/ยืนยัน/อนุมัติ/รับเข้า/…
   อ่านป้ายจากแท็กจริงด้วยตัวพาร์ส JSX ที่มีอยู่ ไม่ใช่ regex บรรทัดเดียว

   ผลยิงจริง: ฉีดปุ่ม accent 7 ตัวเข้าไฟล์จริง ⇒ **ฟ้องของถูก 2 · จับของผิด 0**
     ฟ้องผิด: "บันทึกรายการใหม่" (เริ่มของใหม่จริง) · "อนุมัติแล้ว" (ชิปตัวกรอง ไม่ใช่ปุ่ม)
     หลุด:    {busy ? "กำลังบันทึก…" : `บันทึก ${n} รายการ`} · {SAVE_LABEL} · "ส่งเรื่อง"
              · "ยื่นอนุมัติ" · <Button tone="accent" icon={<Plus/>}>ยืนยันการชำระเงิน</Button>
   และคุมงานของรอบตัวเองได้ 24 จาก 43 จุด (44% มองไม่เห็น)

   สามเหตุผลเชิงโครงสร้างที่ทำให้ท่านี้ใช้ไม่ได้ ไม่ใช่แค่ "regex ยังไม่ดีพอ":
   1) **ป้ายไม่ได้บอกความหมาย** — "บันทึกรายการใหม่" กับ "บันทึก" ขึ้นต้นเหมือนกัน
      แต่อันแรกเริ่มของใหม่ · ความหมายอยู่ที่ onClick ไม่ได้อยู่ที่คำ
   2) **ป้ายส่วนใหญ่ไม่ใช่ลิเทอรัล** — ปุ่มยืนยันเกือบทุกตัวมีสถานะ busy
      (`{busy ? "กำลังบันทึก…" : …}`) ⇒ สิ่งที่ด่านอ่านได้คือป้ายตอนกำลังทำงาน ไม่ใช่ป้ายจริง
      ยังไม่นับป้ายที่มาจากค่าคงที่ · template literal · i18n
   3) **ข้อยกเว้นกลายเป็นสวิตช์ปิดด่าน** — รุ่นที่ลองยกเว้นปุ่มที่มีไอคอน Plus
      (เพื่อไม่ให้ฟ้อง "+ เพิ่มดีล") ผลคือใครโดนฟ้องผิดแค่เติม <Plus/> ก็รอด
      = ด่านสอนวิธีมุดตัวเอง ซึ่งแย่กว่าไม่มีด่าน

   ถ้าจะทำจริง ต้องตัดสินจาก **ปลายทางของ onClick** ไม่ใช่จากคำ — เช่น
   ฟ้องเมื่อ accent อยู่บนปุ่มที่ onClick เรียกฟังก์ชันบันทึก/ส่ง แทนที่จะเปิดฟอร์มหรือ
   นำทางไป /new · นั่นต้องตามรอยการเรียกฟังก์ชันข้ามไฟล์ ซึ่งเป็นงานคนละขนาด
   ⚠️ ตราบใดที่ยังไม่มีด่าน กฎนี้ถูกคุมด้วยคนอ่านรีวิวเท่านั้น — เขียนไว้ให้รู้ตัว */

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
    "Input",                   // ช่องกรอกพื้นฐาน — ที่เดียวที่เขียน premium-input ได้
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

test("TONES เป็นเจ้าของความหมายของโทน — เขียนกำกับไว้ที่ค่าเลย", () => {
  const tones = BUTTON.match(/const TONES = \{([\s\S]*?)\n\};/);
  assert.ok(tones, "ต้องมี TONES ประกาศไว้ใน Button.js");
  for (const [tone, meaning] of Object.entries(TONE_MEANINGS)) {
    const line = tones[1].split("\n").find((row) => row.trim().startsWith(`${tone}:`));
    assert.ok(line, `TONES ต้องมี ${tone}`);
    assert.ok(line.includes(meaning),
      `คอมเมนต์ของ ${tone} ต้องบอกความหมาย "${meaning}" — ไฟล์นี้คือเจ้าของกฎ ไม่ใช่เอกสาร`);
  }
});

/* หน้าต้นแบบเคยพิมพ์แค่ *ชื่อ* tone เป็นป้ายปุ่ม ส่วนความหมายไปอยู่คนละ section
   บนช่องสี `--accent`/`--navy` (ผูกกับชื่อ *โทเคน* ไม่ใช่ชื่อ *tone*) ⇒ คนที่เปิด
   พรีวิวเพื่อหาคำตอบว่า "ปุ่มนี้ควร accent หรือ primary" หาไม่เจอ */
test("หน้าต้นแบบพูดความหมายของโทนตรงกับ TONES", () => {
  assert.match(PREVIEW, /const TONE_MEANING = \{/, "หน้าต้นแบบต้องประกาศความหมายของโทน");
  for (const meaning of Object.values(TONE_MEANINGS)) {
    assert.ok(PREVIEW.includes(meaning),
      `หน้าต้นแบบต้องเขียนความหมาย "${meaning}" ให้ตรงกับคอมเมนต์ใน TONES`);
  }
});

/* ⭐ จุดเดียวนี้คุมโมดัลยืนยันทั้งระบบ — `confirmAction` ถูกเรียกจากหลายสิบไฟล์
   และทุกใบได้ปุ่มยืนยันจากบรรทัดนี้บรรทัดเดียว */
test("ปุ่มยืนยันของ ConfirmDialog เป็น primary (ฝั่งทำลายยังเป็น danger)", () => {
  assert.match(CONFIRM_DIALOG, /tone=\{destructive \? "danger" : "primary"\}/,
    'ยืนยัน = "ยืนยันสิ่งที่ทำอยู่" ⇒ primary · accent แปลว่า "เริ่มของใหม่" คนละเรื่อง');
});

test("ปุ่มบันทึกของ FormActions เป็น primary", () => {
  assert.match(FORM_ACTIONS, /<Button tone="primary"[^>]*onClick=\{onSave\}/,
    "แถบท้ายฟอร์มคือปุ่มยืนยันของทั้งฟอร์ม — primitive กลางสองตัวต้องไม่ขัดกันเอง");
});

/* ปุ่มตาม workflow ผูกโทนไว้ที่ KINDS แล้ว หน้าไหนใช้ `kind=` จึงไม่ต้องรู้เรื่องโทน
   — และไม่มี kind ไหนที่แปลว่า "เริ่มของใหม่" เลยสักตัว (อนุมัติ/ยื่น/บันทึก/ตีกลับ/ลบ
   ล้วนกระทำกับของที่มีอยู่แล้ว) ⇒ accent ไม่ควรโผล่ในตารางนี้ */
test("KINDS ไม่มี tone accent", () => {
  const kinds = ACTION_BUTTONS.match(/const KINDS = \{([\s\S]*?)\n\};/);
  assert.ok(kinds, "ต้องมี KINDS ประกาศไว้");
  assert.doesNotMatch(kinds[1], /tone:\s*"accent"/,
    'ปุ่ม workflow กระทำกับของที่มีอยู่แล้วทั้งหมด — ไม่มีตัวไหนแปลว่า "เริ่มของใหม่"');
});

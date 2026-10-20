// ตัวอย่างในช่อง "ชื่องาน/ชื่อเรื่อง" ของทุกหัวข้อต้องจบในช่องที่จอมือถือ (UAT S4 · layout nits D2)
//
// 🐞 ประเมินพื้นที่: "เช่น ประเมินพื้นที่ ดิ เอ็มควอเทียร์ — ขยายโซนค้าปลีก" กว้าง 300.1px แต่ช่องที่จอ 375
//    เหลือที่ให้ข้อความ 287px ⇒ ถูกเฉือนกลางคำเหลือ "…ขยายโซนค้าป" (ช่อง input ไม่ขึ้นบรรทัดใหม่ให้)
// ⭐ วัดเป็น "ตัวที่กินที่" (ไม่นับสระบน/ล่างและวรรณยุกต์ซึ่งซ้อนอยู่บนตัวอื่น) — ของเดิม 42 ตัว = 300px
//    ⇒ ราว 7px ต่อตัว · ช่อง 287px รับได้ราว 40 ตัว · เพดาน 34 เผื่อจอ 360 และตัวละตินที่กว้างไม่เท่ากัน
//    ขีดยาว "—" กว้างราวสองตัวไทย จึงนับเป็นสอง
import test from 'node:test';
import assert from 'node:assert/strict';

import { REQUEST_KINDS } from './registry.js';

/* สระบน/ล่าง ไม้หันอากาศ วรรณยุกต์ การันต์ — ซ้อนบนพยัญชนะ ไม่กินที่ตามแนวนอน */
const STACKED_MARK = /[ัิ-ฺ็-๎]/u;
const TITLE_PLACEHOLDER_MAX = 34;

const spacingGlyphs = (text) => [...String(text || '')]
  .filter((ch) => !STACKED_MARK.test(ch))
  .reduce((n, ch) => n + (ch === '—' ? 2 : 1), 0);

test('ตัวนับนับเฉพาะตัวที่กินที่ — สระ/วรรณยุกต์ที่ซ้อนไม่นับ', () => {
  assert.equal(spacingGlyphs('ที่'), 1);
  assert.equal(spacingGlyphs('เอ็ม'), 3); // เ อ ม — ไม้ไต่คู้ซ้อนบน อ
  assert.equal(spacingGlyphs('a — b'), 6);
  // ของเดิมที่ถูกเฉือนต้องเกินเพดาน — ไม่งั้นเพดานนี้ไม่ได้กันอะไร
  assert.ok(spacingGlyphs('เช่น ประเมินพื้นที่ ดิ เอ็มควอเทียร์ — ขยายโซนค้าปลีก') > TITLE_PLACEHOLDER_MAX);
});

test('🔴 ตัวอย่างชื่อเรื่องทุกหัวข้อจบในช่องที่จอ 375 — ไม่ถูกเฉือนกลางคำ', () => {
  for (const [kind, meta] of Object.entries(REQUEST_KINDS)) {
    const text = meta.form?.titlePlaceholder;
    if (!text) continue; // ความครบของข้อความอยู่ที่ registry.test.mjs
    assert.ok(
      spacingGlyphs(text) <= TITLE_PLACEHOLDER_MAX,
      `${kind}: "${text}" ยาว ${spacingGlyphs(text)} ตัว (เพดาน ${TITLE_PLACEHOLDER_MAX}) — ช่องที่จอ 375 จะเฉือนท้าย`,
    );
  }
});

test('ประเมินพื้นที่: ตัวอย่างยังบอกทั้ง "ประเมินอะไร" และ "ที่ไหน"', () => {
  const text = REQUEST_KINDS.site_survey.form.titlePlaceholder;
  assert.match(text, /^เช่น ประเมิน/);
  assert.match(text, /เอ็มควอเทียร์/);
  assert.doesNotMatch(text, /—/, 'ขีดยาวต่อท้ายคือส่วนที่ถูกเฉือนเดิม');
});

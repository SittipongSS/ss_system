import test from 'node:test';
import assert from 'node:assert/strict';

import { DOCUMENT_ACCENT_THEMES, accentStyle, renderDocumentHTML } from './documentShell.js';

/* ⭐ ธีมสีเอกสารเหลือค่าเดียว (2026-09-23) — เดิมทุกใบประกาศ `--doc-accent-soft` / `--doc-accent-watermark`
   ที่ไม่มีกฎ CSS ไหนอ่าน (ลายน้ำเป็นกรมท่า `--doc-watermark` · accent เหลือที่ชื่อเอกสารแบบใบเสนอราคา)
   ⇒ ด่านนี้กันไม่ให้ค่าเผื่อไว้กลับมาเงียบ ๆ โดยไม่มีผู้อ่าน (คู่กับ tokenUsage.test ที่ KNOWN_DEBT ว่างแล้ว) */
test('ธีม accent มีแค่ค่า accent และสตริงสไตล์ประกาศแค่ --doc-accent', () => {
  for (const [key, theme] of Object.entries(DOCUMENT_ACCENT_THEMES)) {
    assert.deepEqual(Object.keys(theme), ['accent'], key);
    assert.match(theme.accent, /^#[0-9a-f]{6}$/, key);
    assert.equal(accentStyle(key), `--doc-accent:${theme.accent};`);
  }
  // คีย์ที่ไม่รู้จัก = terracotta (สีตั้งต้นของเปลือก) เหมือนเดิม
  assert.equal(accentStyle('ไม่มีสีนี้'), '--doc-accent:#ad5d43;');
});

test('เอกสารที่เรนเดอร์ไม่มี --doc-accent-soft / --doc-accent-watermark ทั้งใน style และ CSS', () => {
  for (const accentKey of ['terracotta', 'steel', 'amber', 'navy']) {
    const html = renderDocumentHTML({ title: 'x', accentKey, pages: '<article class="sheet"></article>' });
    assert.doesNotMatch(html, /--doc-accent-(soft|watermark)/, accentKey);
    assert.match(html, new RegExp(`style="--doc-accent:${DOCUMENT_ACCENT_THEMES[accentKey].accent};"`), accentKey);
  }
});

// ── สีของกระดาษเดินตามผู้อ่าน (มติเจ้าของ 08/10/2026) ─────────────────────────────────────────
//
// ⭐ ล็อกสามเรื่อง:
//   ① ที่มาของสองคีย์คือ "สีของใบเสนอราคา / สีของใบสั่งขาย" ⇒ เทียบกับ **สีตั้งต้น** ของสองชนิดนั้นใน `lib/documentStandards.js`
//      วันที่ใครเปลี่ยนสีตั้งต้นของ QT/SO โดยไม่แก้ไฟล์นี้ (หรือกลับกัน) เทสต์ล้ม
//      ⚠️ ล็อกได้แค่สีตั้งต้น — มาตรฐานที่เผยแพร่ของ QT/SO ยังเลือกสีอื่นได้ และคีย์ที่นี่ไม่ตาม (เทสต์ท้ายไฟล์ยืนยันว่าเป็นคีย์ตายตัว)
//   ② ค่าสีจริงที่มติระบุ (terracotta #ad5d43 · steel #1e6091) — คีย์ถูกแต่ธีมของเครื่องยนต์ถูกแก้เฉด ก็ล้มเหมือนกัน
//   ③ ไฟล์เป็นของกลาง: ไม่มี import · ไม่เอ่ยชื่อเอกสารชนิดไหน (งานถัดไปจะย้ายเอกสารทุกชนิดมาถามที่นี่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentAccentKeysFor, resolveDocumentAccentKey } from '../documentStandards.js';
import { DOCUMENT_AUDIENCES, documentAudienceAccentKey } from './documentAudience.js';
import { DOCUMENT_ACCENT_THEMES, accentStyle } from './documentShell.js';

test('⭐ ผู้อ่านนอกบริษัท = สีตั้งต้นของใบเสนอราคา · ผู้อ่านภายใน = สีตั้งต้นของใบสั่งขาย', () => {
  assert.deepEqual(DOCUMENT_AUDIENCES, ['external', 'internal']);
  assert.ok(Object.isFrozen(DOCUMENT_AUDIENCES));
  // สีตั้งต้นของชนิดเอกสาร = สิ่งที่ resolver คืนเมื่อไม่มีมาตรฐาน
  assert.equal(documentAudienceAccentKey('external'), resolveDocumentAccentKey(null, 'quotation'));
  assert.equal(documentAudienceAccentKey('internal'), resolveDocumentAccentKey(null, 'salesOrder'));
  // สองกลุ่มต้องได้คนละสี — สีเดียวกัน = กติกาไม่บอกอะไรเลย
  assert.notEqual(documentAudienceAccentKey('external'), documentAudienceAccentKey('internal'));
});

test('ค่าสีจริงตามมติ: นอกบริษัท #ad5d43 (terracotta) · ภายใน #1e6091 (steel) — ทุกกลุ่มมีธีมในเครื่องยนต์เอกสาร', () => {
  assert.equal(documentAudienceAccentKey('external'), 'terracotta');
  assert.equal(documentAudienceAccentKey('internal'), 'steel');
  assert.equal(DOCUMENT_ACCENT_THEMES[documentAudienceAccentKey('external')].accent, '#ad5d43');
  assert.equal(DOCUMENT_ACCENT_THEMES[documentAudienceAccentKey('internal')].accent, '#1e6091');
  for (const audience of DOCUMENT_AUDIENCES) {
    const key = documentAudienceAccentKey(audience);
    // ไม่มีธีม = เปลือกตกไป terracotta เงียบ ๆ แล้วกระดาษภายในออกมาหน้าตาเหมือนของลูกค้า
    assert.ok(DOCUMENT_ACCENT_THEMES[key], `${audience}: ไม่มีธีม ${key} ในเครื่องยนต์เอกสาร`);
    assert.equal(accentStyle(key), `--doc-accent:${DOCUMENT_ACCENT_THEMES[key].accent};`);
  }
  // teal เลิกใช้แล้ว (มติเดียวกัน) — ไม่มีผู้อ่านกลุ่มไหนได้สีนี้
  assert.ok(!DOCUMENT_AUDIENCES.map(documentAudienceAccentKey).includes('teal'));
});

test('ค่าที่ไม่รู้จัก = สีของกระดาษที่ออกนอกบริษัท (สีตั้งต้นเดียวกับเปลือก) — ไม่ระเบิด ไม่คืนค่าว่าง', () => {
  const fallback = documentAudienceAccentKey('external');
  for (const odd of [undefined, null, '', 'customer', 'EXTERNAL', 'constructor', 'toString', '__proto__', 0, {}]) {
    assert.equal(documentAudienceAccentKey(odd), fallback, String(odd));
  }
  // สีตั้งต้นของเปลือกเมื่อคีย์ไม่รู้จัก ก็เป็นตัวเดียวกัน — สองชั้นตกไปที่เดียวกัน
  assert.equal(accentStyle('ไม่มีสีนี้'), accentStyle(fallback));
});

/* 🔴 คีย์ของกลุ่มผู้อ่าน **ไม่เดินตามมาตรฐานที่เผยแพร่ของใบเสนอราคา/ใบสั่งขาย** — สองชนิดนั้นยังเลือกได้สี่สี (กระดาษของมันพิมพ์สีที่เผยแพร่)
   ⇒ "สีเดียวกับใบเสนอราคา" จริงแค่ตราบที่ไม่มีใครแก้ · เทสต์นี้ตรึงข้อเท็จจริงนั้นไว้ให้คนเขียนข้อความบนจอเห็น
   วันที่งานทั้งระบบล็อกสีของสองชนิดนั้น (ตัวเลือกเหลือค่าเดียว) เทสต์นี้ล้ม — ตอนนั้นค่อยกลับไปเขียน "เหมือนใบเสนอราคา" ได้ */
test('🔴 คีย์ตายตัว: ใบเสนอราคา/ใบสั่งขายที่เผยแพร่สีอื่น ไม่พาสีของกลุ่มผู้อ่านไปด้วย', () => {
  const sources = { external: 'quotation', internal: 'salesOrder' };
  for (const audience of DOCUMENT_AUDIENCES) {
    const key = documentAudienceAccentKey(audience);
    const options = documentAccentKeysFor(sources[audience]);
    const others = options.filter((accent) => accent !== key);
    assert.ok(others.length > 0, `${sources[audience]} ถูกล็อกสีแล้ว — ทบทวนข้อความ "เอ่ยชื่อสี ไม่เอ่ยชื่อเอกสาร" (ดูหัวเทสต์)`);
    for (const accent of others) {
      // ชนิดต้นสีพิมพ์สีที่เผยแพร่จริง …
      assert.equal(resolveDocumentAccentKey({ accentKey: accent }, sources[audience]), accent, `${sources[audience]} ← ${accent}`);
      // … แต่ฟังก์ชันนี้ไม่มีอินพุตอื่นนอกจากกลุ่มผู้อ่าน จึงยังคืนคีย์เดิม
      assert.equal(documentAudienceAccentKey(audience), key);
      assert.notEqual(documentAudienceAccentKey(audience), accent);
    }
  }
  assert.equal(documentAudienceAccentKey.length, 1, 'รับแค่กลุ่มผู้อ่าน — ไม่มีช่องให้ส่งมาตรฐานเข้ามา');
});

test('ไฟล์เป็นของกลาง: ไม่มี import · ไม่เอ่ยชื่อเอกสารชนิดไหน', () => {
  const source = readFileSync(new URL('./documentAudience.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bimport\b|\brequire\(/, 'ต้องไม่มี import — ทุกฝั่งเรียกได้โดยไม่ลากอะไรตามมา');
  // ทั้งไฟล์รวมคอมเมนต์: ไม่มีชื่อชนิดเอกสาร/รหัสแบบฟอร์ม — ชนิดเอกสารเป็นคนมาถาม ไม่ใช่ไฟล์นี้รู้จักชนิดเอกสาร
  assert.doesNotMatch(source, /survey|siteSurvey|FM-[A-Z]{2}-\d|ประเมินพื้นที่/i);
  assert.deepEqual(
    [...code.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map((m) => m[1]),
    ['DOCUMENT_AUDIENCES', 'documentAudienceAccentKey'],
  );
});

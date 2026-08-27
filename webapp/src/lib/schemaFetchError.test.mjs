// ── ด่านตรวจสคีมาต้องบอกสาเหตุ ไม่ใช่แค่ "401" ──────────────────────────────
//
// 🐞 บั๊กจริง (2026-08-26): `check:columns` / `check:refs` ทิ้ง body ของคำตอบ
// พิมพ์แค่รหัสสถานะ ⇒ CI ค้างแดงสามรอบ กว่าจะยิงเองด้วยมือถึงรู้ว่า Supabase ตอบ
// `PGRST303 JWT issued at future` มาให้ตั้งแต่แรก — ไม่ใช่ความผิดของโค้ดใน PR เลย
//
// เทสต์อยู่ที่ข้อความ เพราะข้อความคือทั้งหมดของสิ่งที่การแก้ครั้งนั้นให้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeSchemaError } from '../../scripts/schemaFetch.mjs';

test('เคสที่ทำให้เสีย CI ไปสามรอบ ต้องอ่านออกตั้งแต่บรรทัดแรก', () => {
  const { detail, hint } = describeSchemaError(401, JSON.stringify({
    code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future',
  }));
  assert.match(detail, /PGRST303/);
  assert.match(detail, /JWT issued at future/);
  // ต้องบอกด้วยว่าไม่ใช่เรื่องโค้ด ไม่งั้นคนอ่านจะไปไล่ diff ของตัวเองก่อนเสมอ
  assert.match(hint, /นาฬิกา/);
  assert.match(hint, /ไม่ใช่แก้โค้ด/);
});

test('คีย์ผิด/ใช้ anon key — บอกว่าต้องใช้ service role key', () => {
  const { detail, hint } = describeSchemaError(401, JSON.stringify({
    message: 'Invalid API key', hint: 'Double check your API key.',
  }));
  assert.match(detail, /Invalid API key/);
  assert.match(hint, /service role key/);
  assert.match(hint, /GitHub Secrets/);
});

test('ฝั่งฐานล่ม — บอกให้ลองใหม่ก่อนโทษโค้ด', () => {
  assert.match(describeSchemaError(503, '').hint, /ลองใหม่/);
});

/* 🪤 body ไม่ใช่ JSON เสมอไป (หน้า error ของ proxy/CDN) — พังตรงนี้แล้วจะกลับไป
   ไม่มีข้อความอีกครั้ง ซึ่งแย่กว่าเดิมเพราะคราวนี้เงียบสนิท */
test('body ที่ไม่ใช่ JSON ต้องไม่ทำให้ล้ม และยังพิมพ์อะไรออกมา', () => {
  const { detail } = describeSchemaError(502, '<html>Bad Gateway</html>');
  assert.match(detail, /Bad Gateway/);
  assert.doesNotThrow(() => describeSchemaError(500, ''));
  assert.doesNotThrow(() => describeSchemaError(500));
});

test('ข้อความยาวมากถูกตัด ไม่ท่วม log', () => {
  const { detail } = describeSchemaError(500, 'x'.repeat(5000));
  assert.ok(detail.length <= 300, `ยาว ${detail.length}`);
});

/* ⚠️ คีย์ต้องไม่หลุดลง log — CI เก็บ log ไว้และคนอ่านได้กว้างกว่าคนที่ถือคีย์ */
test('ตัวช่วยไม่เคยพิมพ์คีย์', () => {
  const src = readFileSync(new URL('../../scripts/schemaFetch.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /console\.(error|log)\([^)]*\bkey\b/);
});

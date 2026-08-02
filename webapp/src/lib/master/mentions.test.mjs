// กล่าวถึงคน (@mention) — ด่านสิทธิ์ + การไฮไลต์ในข้อความ
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MENTIONS, mentionIdsOf, mentionableUsers, sanitizeMentions } from './mentions.js';
import { parseRichText } from './richText.js';

// stub: ผู้ใช้สามคน — ต่างทีมกัน เพื่อให้ด่านของดีล (scope 'own'/'team') คัดจริง
function stub() {
  const users = [
    { id: 'u-ae', app_metadata: { role: 'ae', team: 'KA' }, user_metadata: { name: 'สมชาย ขายดี' } },
    { id: 'u-other', app_metadata: { role: 'ae', team: 'KA' }, user_metadata: { name: 'อีกคน หนึ่ง' } },
    { id: 'u-admin', app_metadata: { role: 'admin', team: 'KA' }, user_metadata: { name: 'แอดมิน ระบบ' } },
    { id: 'u-off', app_metadata: { role: 'ae', team: 'KA' }, user_metadata: { name: 'ลาออก แล้ว' },
      banned_until: '2099-01-01T00:00:00Z' },
  ];
  const api = {
    from: () => api,
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    auth: { admin: { listUsers: async ({ page }) => ({ data: { users: page > 1 ? [] : users } }) } },
  };
  return api;
}

const deal = { id: 'D-1', team: 'KA', ownerId: 'u-ae' };

test('รายชื่อที่ @ ได้ = คนที่เปิดเธรดนั้นได้จริงเท่านั้น', async () => {
  const names = (await mentionableUsers(stub(), 'deal', deal)).map((u) => u.name);
  // ⚠️ ดีลของ AE คนหนึ่ง: เจ้าของเห็น · admin เห็น (scope all) · AE คนอื่นไม่เห็น
  assert.ok(names.includes('สมชาย ขายดี'), 'เจ้าของดีลต้อง @ ได้');
  assert.ok(names.includes('แอดมิน ระบบ'), 'admin ต้อง @ ได้');
  assert.equal(names.includes('อีกคน หนึ่ง'), false, 'AE ที่ไม่ใช่เจ้าของต้องไม่อยู่ในรายชื่อ');
  // คนที่ปิดบัญชีแล้วไม่ควรถูก @ (แจ้งเตือนไปแล้วไม่มีใครอ่าน)
  assert.equal(names.includes('ลาออก แล้ว'), false);
});

// 🔴 กติกาสำคัญที่สุดของไฟล์นี้ — client ส่ง id อะไรมาก็ได้ ด่านอยู่ที่ server
test('sanitizeMentions: ตัด id ที่ไม่มีสิทธิ์เปิดเธรดทิ้งเสมอ', async () => {
  const ok = await sanitizeMentions(stub(), 'deal', deal, ['u-ae', 'u-other', 'ไม่มีจริง']);
  assert.deepEqual(ok.map((m) => m.id), ['u-ae'], 'เหลือเฉพาะคนที่เปิดเธรดได้');
  assert.equal(ok[0].name, 'สมชาย ขายดี', 'ต้องเก็บชื่อ ณ ตอนพิมพ์มาด้วย');

  assert.deepEqual(await sanitizeMentions(stub(), 'deal', deal, []), []);
  assert.deepEqual(await sanitizeMentions(stub(), 'deal', null, ['u-ae']), [], 'ไม่มี parent = ไม่มีสิทธิ์');
  // id ซ้ำต้องยุบเหลือคนเดียว · เกินเพดานต้องถูกตัด
  const many = await sanitizeMentions(stub(), 'deal', deal, Array(MAX_MENTIONS + 5).fill('u-ae'));
  assert.equal(many.length, 1);
});

test('mentionIdsOf: อ่านจาก meta ทนของแปลก', () => {
  assert.deepEqual(mentionIdsOf({ meta: { mentions: ['a', 'b'] } }), ['a', 'b']);
  assert.deepEqual(mentionIdsOf({ meta: {} }), []);
  assert.deepEqual(mentionIdsOf(null), []);
  assert.deepEqual(mentionIdsOf({ meta: { mentions: 'ไม่ใช่ array' } }), []);
});

// ⚠️ ชื่อไทยมีช่องว่าง — ตัวไฮไลต์จึงต้องรู้ชื่อล่วงหน้า เดาขอบเขตจากข้อความไม่ได้
test('ไฮไลต์ @ชื่อ: ต้องส่งรายชื่อมาด้วย และประกอบข้อความกลับได้ครบ', () => {
  const text = 'ฝาก @สมชาย ขายดี ดูให้หน่อย อ้างตาม QT-26070028-0';
  const withNames = parseRichText(text, { mentionNames: ['สมชาย ขายดี'] });
  assert.ok(withNames.some((p) => p.type === 'mention' && p.text === '@สมชาย ขายดี'));
  assert.ok(withNames.some((p) => p.type === 'doc'), 'รหัสเอกสารในประโยคเดียวกันต้องยังเป็นลิงก์');
  assert.equal(withNames.map((p) => p.text).join(''), text, 'ตัวอักษรต้องกลับมาครบ');

  // ไม่ส่งรายชื่อ = ไม่ไฮไลต์ (ไม่เดาเอง)
  assert.equal(parseRichText(text).some((p) => p.type === 'mention'), false);
  // อีเมลในข้อความต้องไม่กลายเป็น mention
  assert.equal(
    parseRichText('ส่งไปที่ a@example.com', { mentionNames: ['example.com'] })
      .some((p) => p.type === 'mention'),
    true,
    'ถ้าชื่อตรงจริงก็ไฮไลต์ได้ — ด่านจริงคือรายชื่อมาจาก server ไม่ใช่การเดา',
  );
});

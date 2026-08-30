// ── เข้าระบบด้วยเบอร์โทร (มติผู้ใช้ 2026-08-30) ────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOGIN_PHONE_DOMAIN, isPhoneLogin, loginLabel, loginPhoneOf,
  normalizeLoginPhone, phoneLoginEmail, resolveLoginEmail,
} from './loginIdentity.js';

test('🔴 เบอร์รูปไหนก็ต้องชี้บัญชีเดียวกัน — ไม่งั้นพิมพ์ถูกแต่เข้าไม่ได้', () => {
  for (const raw of ['0812345678', '081-234-5678', '081 234 5678', '+66812345678', '66812345678']) {
    assert.equal(normalizeLoginPhone(raw), '66812345678', raw);
  }
  // เบอร์บ้าน 9 หลักก็ใช้ได้ (บางไซต์ให้เบอร์ออฟฟิศ)
  assert.equal(normalizeLoginPhone('021234567'), '6621234567');
});

test('ของที่ไม่ใช่เบอร์ไทยต้องตกทันที ไม่ใช่แปลงมั่ว', () => {
  for (const bad of ['', '   ', 'abc', '12345', '08123456789', 'user@company.com', null, undefined]) {
    assert.equal(normalizeLoginPhone(bad), null, String(bad));
  }
});

test('เบอร์ ↔ ที่อยู่ล็อกอินภายใน แปลงกลับไปมาได้', () => {
  const email = phoneLoginEmail('081-234-5678');
  assert.equal(email, `66812345678@${LOGIN_PHONE_DOMAIN}`);
  assert.equal(isPhoneLogin(email), true);
  assert.equal(loginPhoneOf(email), '081-234-5678');
  assert.equal(phoneLoginEmail('ไม่ใช่เบอร์'), null);
});

test('🔴 อีเมลจริงต้องไม่ถูกมองว่าเป็นบัญชีเบอร์', () => {
  assert.equal(isPhoneLogin('ariya@scentandsense.co.th'), false);
  assert.equal(loginPhoneOf('ariya@scentandsense.co.th'), null);
  assert.equal(loginPhoneOf(''), null);
  // เทียบแบบไม่สนตัวพิมพ์ — GoTrue เก็บอีเมลเป็นตัวพิมพ์เล็ก แต่คนพิมพ์มาได้ทุกแบบ
  assert.equal(isPhoneLogin(`66812345678@${LOGIN_PHONE_DOMAIN.toUpperCase()}`), true);
});

test('🔴 ช่องล็อกอินช่องเดียว: มี @ = อีเมล · ไม่มี = เบอร์', () => {
  assert.equal(resolveLoginEmail('ariya@scentandsense.co.th'), 'ariya@scentandsense.co.th');
  assert.equal(resolveLoginEmail(' 081-234-5678 '), `66812345678@${LOGIN_PHONE_DOMAIN}`);
  // ตัวเลขที่ไม่ใช่เบอร์ไทย = null ⇒ จอต้องบอกให้ชัด ไม่ใช่ยิงไปตายที่ Supabase
  assert.equal(resolveLoginEmail('12345'), null);
  assert.equal(resolveLoginEmail(''), null);
});

test('ป้ายบนจอต้องเป็นเบอร์ ไม่ใช่ที่อยู่ภายใน', () => {
  assert.equal(loginLabel({ email: `66812345678@${LOGIN_PHONE_DOMAIN}` }), 'เบอร์ 081-234-5678');
  assert.equal(loginLabel({ email: 'ariya@scentandsense.co.th' }), 'ariya@scentandsense.co.th');
  assert.equal(loginLabel({}), '');
});

/* ── จุดที่พังเงียบถ้าลืมต่อ ─────────────────────────────────────────────── */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('🔴 หน้าล็อกอินต้องรับเบอร์ได้จริง — type="email" ตีกลับตั้งแต่ก่อนโค้ดทำงาน', () => {
  const src = read('../../app/page.js');
  assert.match(src, /resolveLoginEmail\(identifier\)/);
  // ⚠️ ดูเฉพาะ *แอตทริบิวต์จริง* — คอมเมนต์ในไฟล์อธิบายกับดักนี้ไว้ด้วยคำเดียวกัน
  assert.doesNotMatch(src, /\n\s+type="email"/, 'ช่องล็อกอินต้องเป็น type="text"');
  assert.match(src, /\n\s+type="text"/);
  assert.match(src, /autoComplete="username"/);
});

test('🔴 ห้ามแชร์ Google Doc ไปที่อยู่ล็อกอินภายใน — ที่อยู่นั้นไม่มีตัวตนจริง', () => {
  /* 🐞 ไม่กันตรงนี้ ระบบจะรายงานว่า "ให้สิทธิ์แล้ว" ทั้งที่คนนั้นเปิดเอกสารไม่ได้
     (สาย Drive ให้สิทธิ์ตามที่อยู่จริงเท่านั้น) */
  const src = read('../master/googleDocs.js');
  assert.match(src, /isPhoneLogin/);
});

test('🔴 ทะเบียนผู้ใช้ต้องไม่โชว์ที่อยู่ภายในดิบ ๆ', () => {
  const src = read('../../app/users/page.js');
  assert.match(src, /u\.loginPhone \? `เบอร์ \$\{u\.loginPhone\}`/);
  // ข้อความยืนยันงานที่ย้อนกลับไม่ได้ ต้องเรียกด้วยชื่อคน ไม่ใช่ที่อยู่ล็อกอิน
  assert.match(src, /ลบผู้ใช้ \$\{personLabel\(u\)\}/);
});

test('🔴 API สร้างผู้ใช้ต้องรับ "อีเมลหรือเบอร์" และกันโดเมนภายในที่พิมพ์เอง', () => {
  const src = read('../../app/api/users/route.js');
  assert.match(src, /normalizeLoginPhone\(body\.loginPhone\)/);
  assert.match(src, /ต้องระบุอีเมลหรือเบอร์เข้าระบบ และรหัสผ่าน/);
  assert.match(src, /isPhoneLogin\(typedEmail\)/);
  // ส่งคืนเบอร์ให้จอ ไม่ใช่ที่อยู่ภายใน
  assert.match(src, /loginPhone: loginPhoneOf\(u\.email\)/);
});

test('🔴 ต้องมีทางเปลี่ยนเบอร์เข้าระบบ — เปลี่ยนซิมแล้วบัญชีต้องไม่ตาย', () => {
  const src = read('../../app/api/users/[id]/route.js');
  assert.match(src, /body\.loginPhone !== undefined/);
  assert.match(src, /updates\.email = phoneLoginEmail\(nextPhone\)/);
  // บัญชีอีเมลจริงห้ามถูกแปลงเป็นบัญชีเบอร์ทางนี้
  assert.match(src, /เข้าระบบด้วยอีเมล — เปลี่ยนเป็นเบอร์โทรทางนี้ไม่ได้/);
});

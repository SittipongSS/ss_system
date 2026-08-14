// ขอบเขตที่มองเห็นในคิวคำร้อง (P6)
//
// ⚠️ กับดักข้อ 9 ของแผน: **กรองที่ API ไม่ใช่ที่จอ** — กรองที่จอแปลว่าข้อมูลของ
// ทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จากแท็บ Network
import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_SCOPES, canUseScope, resolveScope, scopeFilter } from './scope.js';

const ae = { id: 'u-ae', role: 'ae', team: 'KA' };
const loner = { id: 'u-rd', role: 'rd' };            // ไม่มีทีม
const boss = { id: 'u-admin', role: 'admin' };

test('ของฉันใช้ได้ทุกคน · ทั้งหมดเฉพาะผู้ดูแล · ทีมต้องมีทีม', () => {
  for (const u of [ae, loner, boss]) assert.equal(canUseScope(u, 'mine'), true);
  assert.equal(canUseScope(ae, 'team'), true);
  assert.equal(canUseScope(loner, 'team'), false, 'ไม่มีทีม = ไม่มี "ทีม" ให้ดู');
  assert.equal(canUseScope(ae, 'all'), false);
  assert.equal(canUseScope(boss, 'all'), true);
  assert.equal(canUseScope(boss, 'ไม่มีชนิดนี้'), false);
});

test('⭐ สิทธิ์ไม่พอให้ **ถอยลงมา ไม่ใช่ปฏิเสธ**', () => {
  // ปฏิเสธทั้งคำขอจะทำให้ลิงก์ที่แชร์กันไว้ (?scope=all) พังในมือคนที่สิทธิ์น้อยกว่า
  // ทั้งที่เจตนาคือ "ดูคิว"
  assert.equal(resolveScope(ae, 'all'), 'team', 'ถอยไปขั้นที่ใกล้ที่สุดที่ทำได้');
  assert.equal(resolveScope(loner, 'all'), 'mine');
  assert.equal(resolveScope(ae, 'team'), 'team');
  assert.equal(resolveScope(boss, 'all'), 'all');
  // ค่าที่ไม่รู้จักไม่ใช่ error — ถอยไปค่าที่ปลอดภัยที่สุด
  assert.equal(resolveScope(boss, 'อะไรก็ไม่รู้'), 'mine');
  assert.equal(resolveScope(boss, undefined), 'mine');
});

test('⚠️ ตัวกรองต้องแคบเสมอ — ไม่มีทางหลุดเป็น "ไม่กรอง" นอกจาก all', () => {
  assert.equal(scopeFilter(boss, 'all'), null);
  assert.deepEqual(scopeFilter(ae, 'team'), { team: ['KA'] });
  assert.deepEqual(scopeFilter(ae, 'mine'), { requestedById: 'u-ae' });
  // ไม่มีทีม + ขอ team → ถอยเป็นของตัวเอง **ไม่ใช่คืน null** (null = เห็นทั้งระบบ)
  assert.deepEqual(scopeFilter(loner, 'team'), { requestedById: 'u-rd' });
  // ผู้ใช้หาย (session ขาด) ต้องไม่กลายเป็นเห็นทุกอย่าง
  assert.deepEqual(scopeFilter(null, 'mine'), { requestedById: '—' });
  assert.deepEqual(scopeFilter(null, 'team'), { requestedById: '—' });
});

// คนหนึ่งคนอยู่ได้หลายทีม (มติผู้ใช้ 2026-08-11) — คิว "ทีม" ต้องรวมทุกทีมที่สังกัด
// ไม่ใช่แค่ทีมหลัก ไม่งั้นคำร้องของอีกทีมหายจากคิวทั้งที่เจ้าตัวเป็นคนดูแลอยู่
test('อยู่หลายทีม — คิวทีมรวมทุกทีมที่สังกัด', () => {
  const dual = { id: 'u-dual', role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] };
  assert.equal(canUseScope(dual, 'team'), true);
  assert.deepEqual(scopeFilter(dual, 'team'), { team: ['ODM', 'SV'] });
});

test('ชุดขอบเขตตรงกับที่ตัวสลับกลางของสายงานขายใช้อยู่', () => {
  // ⚠️ ป้ายอยู่ที่ components/salesPlanning/ui.js (SCOPE_LABELS) ที่เดียว —
  // ไฟล์นี้เป็น server-safe จึง import ตัวนั้นไม่ได้ · ล็อกได้แค่ว่า **คีย์ตรงกัน**
  // ซึ่งเป็นสิ่งที่พังจริงถ้ามันเลื่อนออกจากกัน (ป้ายหายไปตัวหนึ่ง = คีย์ดิบบนจอ)
  assert.deepEqual(REQUEST_SCOPES, ['mine', 'team', 'all']);
});

/* ── ใบที่คนไม่มีทีมเปิด ต้องเข้าคิวของทีมที่ต้องตามงาน ───────────────────────
   คิวทีมกรองด้วยคอลัมน์ `team` ของแถว ⇒ ใบที่ admin/หัวหน้าฝ่ายขาย/RD/PC เปิด
   เคยได้ team = null (attributionTeam คืน null ให้คนที่ไม่สังกัดทีมไหนเลย) แล้ว
   ไม่โผล่ในคิวทีมไหนเลย ทั้งที่ส่วนใหญ่เปิดคาดีลของทีมใดทีมหนึ่งอยู่ —
   ถอยไปใช้ทีมของดีลต้นทาง (กติกาเดียวกับโครงการ: ขอบเขตเดินตามงาน ไม่ใช่ตามคนกด) */
test('POST คำร้อง: ไม่มีทีมของตัวเอง → ใช้ทีมของดีลต้นทาง', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../app/api/sa/requests/route.js', import.meta.url), 'utf8');
  assert.match(src, /team: attributionTeam\(user, body\.team\) \|\| dealTeam/);
  // ทีมของดีลต้องถูกอ่านมาจริง ไม่ใช่ค้างเป็น null ตลอด
  assert.match(src, /\.select\('id, projectId, customerId, customerName, team'\)/);
  assert.match(src, /dealTeam = dealRow\.team \|\| null/);
});

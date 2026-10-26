// ── บล็อก "คำร้องจากฝ่ายขาย" บน /sa/tasks: ป้าย "n รอตอบ" = แถวของแท็บที่ "ดูทั้งหมด" พาไป (ตรวจตัวเลข M8d · 20/10/2026) ──
// 🐞 เดิมป้ายนับใบเปิดของฝ่าย แล้วลิงก์ไป /requests ซึ่งไม่มีคิวของ RD (ฝ่ายที่มีบ้านของตัวเองถูกตัดออกจากคิวรวม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { inquiryQueueCount, inquiryQueueHref } from './inquiryQueueLink.js';
import { deptRequestsTodoCount } from '../nav/navCounts.js';
import { deptQueueRows, queueTabRows } from '../requests/queueBoard.js';

const req = (over = {}) => ({ id: `r${Math.random()}`, status: 'pending', dept: 'RD', kind: 'inquiry', _mine: false, ...over });

const ROWS = [
  req({ dept: 'RD' }), // รอ RD
  req({ dept: 'RD', status: 'acknowledged', acknowledgedById: 'u-other' }), // คนอื่นรับไว้ ยังตาฝ่าย
  req({ dept: 'RD', status: 'answered', answeredAt: '2026-10-10T03:00:00Z' }), // ตอบแล้ว รอผู้ขอ
  req({ dept: 'RD', status: 'draft' }), // ร่าง — ยังไม่ใช่งานของฝ่าย
  req({ dept: 'PC' }),
  req({ dept: 'PC', status: 'acknowledged' }),
  req({ dept: 'PC', _mine: true, status: 'answered', answeredAt: '2026-10-10T03:00:00Z' }), // ใบที่ PC คนนี้เปิดเอง รอเขาปิด
];

test('ฝ่ายที่มีบ้านของตัวเอง (RD): ลิงก์ = แท็บ "รอตอบ" ของคิวฝ่าย · เลข = ป้ายเมนู "คิวคำร้อง" (deptRequestsTodoCount)', () => {
  assert.equal(inquiryQueueHref('RD'), '/rd/requests?tab=todo');
  assert.equal(inquiryQueueCount(ROWS, { dept: 'RD', myDepts: [] }), deptRequestsTodoCount(ROWS, 'RD'));
  assert.equal(inquiryQueueCount(ROWS, { dept: 'RD' }), deptQueueRows(ROWS, { dept: 'RD', tab: 'todo' }).length);
  assert.ok(inquiryQueueCount(ROWS, { dept: 'RD' }) > 0);
  // ใบที่ตอบแล้วรอผู้ขอ / ร่าง ไม่ใช่ "รอตอบ" ของฝ่าย
  assert.ok(inquiryQueueCount(ROWS, { dept: 'RD' }) < ROWS.filter((r) => r.dept === 'RD').length);
});

test('ฝ่ายที่ยังอยู่คิวรวม (PC): ลิงก์ = /requests แท็บ "รอฉันตอบ" · เลข = แถวของแท็บนั้น', () => {
  assert.equal(inquiryQueueHref('PC'), '/requests?tab=todo');
  const myDepts = ['PC'];
  assert.equal(inquiryQueueCount(ROWS, { dept: 'PC', myDepts }), queueTabRows(ROWS, { tab: 'todo', myDepts }).length);
});

test('ฝ่ายอื่นที่มีบ้าน (FN/TS) ก็ไปคิวของตัวเอง', () => {
  assert.equal(inquiryQueueHref('FN'), '/finance/requests?tab=todo');
  assert.equal(inquiryQueueHref('TS'), '/service/requests?tab=todo');
});

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('ยาม: my-work โหลดแถวชุดเดียวกับหน้าปลายทาง · หน้าคิวงานอ่านลิงก์และเลขจาก API', () => {
  const route = read('../../app/api/pm/my-work/route.js');
  assert.match(route, /\? await loadRequests\(supabase, \{ dept: myDept, lean: true \}\)/, 'คิวฝ่าย = ตัวโหลดเดียวกับ nav/counts');
  assert.match(route, /: \(await loadVisibleRequests\(supabase, user, \{ scopeParam: 'mine', lean: true \}\)\)\.rows;/);
  assert.match(route, /inquiryQueue = \{ href: inquiryQueueHref\(myDept\), count: null \};/);
  assert.match(route, /inquiryQueue\.count = inquiryQueueCount\(rows, \{ dept: myDept, myDepts: deptsInSharedQueue\(answerableDepts\(user\)\) \}\);/);
  const page = read('../../app/pm/tasks/page.js');
  assert.match(page, /\{inquiryQueue\.count\} รอตอบ/);
  assert.match(page, /href=\{inquiryQueue\?\.href \|\| "\/requests"\}/);
  assert.doesNotMatch(page, /REQUEST_OPEN_STATUSES\.includes\(q\.status\)\)\.length\} รอตอบ/, 'ห้ามนับจากลิสต์ตัวอย่าง');
  // นับไม่ได้ (`count: null`) = ไม่โชว์เลข — ห้ามขึ้น " รอตอบ" เปล่า ๆ หรือ 0
  assert.match(page, /\{Number\.isFinite\(inquiryQueue\?\.count\) && <span/);
});

test('ยาม: ตัวนับ "n รอตอบ" พังต้องไม่ล้ม /api/pm/my-work ทั้ง route (คิวงานว่างทั้งหน้า)', () => {
  const route = read('../../app/api/pm/my-work/route.js');
  // ตัวโหลดสองตัว throw เมื่อ PostgREST ตอบ error (fetchAll) และ withUser ไม่จับ ⇒ ต้องอยู่ใน try ของบล็อกนี้เอง
  const block = route.slice(route.indexOf('if (inquiries.length) {'), route.indexOf('// ── projects map'));
  assert.ok(block.length > 0, 'หาบล็อกตัวนับไม่เจอ');
  const tryAt = block.indexOf('try {');
  const catchAt = block.indexOf('} catch (countError) {');
  assert.ok(tryAt >= 0 && catchAt > tryAt, 'ตัวนับต้องอยู่ใน try/catch');
  for (const call of ['await loadRequests(', 'await loadVisibleRequests(', 'inquiryQueueCount(']) {
    const at = block.indexOf(call);
    assert.ok(at > tryAt && at < catchAt, `${call} ต้องอยู่ใน try`);
  }
  assert.doesNotMatch(block.slice(catchAt), /throw /, 'catch ห้ามโยนต่อ');
});

// ── H4 (ตรวจตัวเลข 2026-10-08): /audit ขึ้น "500 รายการ" ทุกช่วงเวลา — เพดาน limit ไม่ใช่ยอดจริง ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT, auditActorOptions, auditCountText, auditLimit, auditTruncated,
} from './auditList.js';

test('ป้ายจำนวน: โหลดครบ = ยอดเดียว · ชนเพดาน = "n ล่าสุด จาก ยอดจริง" (ไม่เรียกเพดานว่ายอดรวม)', () => {
  assert.equal(auditCountText({ shown: 8, total: 8 }), '8 รายการ');
  assert.equal(auditCountText({ shown: 500, total: 12345 }), '500 ล่าสุด จาก 12,345 รายการ');
  // 🐞 ของเดิม: "500 รายการ" ทั้งที่ยอดจริง 12,345
  assert.notEqual(auditCountText({ shown: 500, total: 12345 }), '500 รายการ');
  // ยอดจริงไม่รู้ (API เก่า/นับไม่ได้) = พูดเท่าที่เห็น ไม่เดาว่าขาด
  assert.equal(auditCountText({ shown: 500, total: null }), '500 รายการ');
  assert.equal(auditTruncated({ shown: 500, total: null }), false);
  assert.equal(auditTruncated({ shown: 500, total: 501 }), true);
  assert.equal(auditTruncated({ shown: 3, total: 3 }), false);
});

test('เพดานต่อคำขอ: ค่าตั้งต้น 500 · เพดาน 2000 · ค่าเพี้ยน = ค่าตั้งต้น', () => {
  assert.equal(auditLimit(null), AUDIT_DEFAULT_LIMIT);
  assert.equal(auditLimit('abc'), AUDIT_DEFAULT_LIMIT);
  assert.equal(auditLimit('-5'), AUDIT_DEFAULT_LIMIT);
  assert.equal(auditLimit('50'), 50);
  assert.equal(auditLimit('99999'), AUDIT_MAX_LIMIT);
});

test('ตัวเลือก "ผู้ทำ" มาจากทะเบียนผู้ใช้ทั้งระบบ ไม่ใช่แค่แถวที่ชนเพดาน', () => {
  const directory = [{ id: 'u-old', name: 'คนที่ทำรายการเก่า' }, { id: 'u1', name: 'ชื่อปัจจุบัน' }];
  const rows = [
    { actorId: 'u1', actorName: 'ชื่อเก่าที่ประทับไว้' },
    { actorId: 'gone', actorName: 'บัญชีที่ถูกลบ' },
    { actorId: null, actorName: 'ระบบ' },
  ];
  const opts = auditActorOptions(directory, rows);
  const ids = opts.map(([id]) => id);
  // คนที่ไม่อยู่ใน 500 แถวล่าสุดยังเลือกได้ · บัญชีที่ถูกลบ (มีแต่ในแถว) ก็ยังเลือกได้ · แถวไร้ผู้ทำไม่มีตัวเลือก
  assert.deepEqual(ids.sort(), ['gone', 'u-old', 'u1']);
  assert.equal(new Map(opts).get('u1'), 'ชื่อปัจจุบัน', 'ชื่อจากทะเบียนชนะชื่อที่ประทับในแถว');
  // ทะเบียนพัง ([]) = ถอยไปใช้ผู้ทำในแถวเหมือนเดิม
  assert.deepEqual(auditActorOptions([], rows).map(([id]) => id).sort(), ['gone', 'u1']);
});

test('API นับยอดจริงด้วยตัวกรองเดียวกับแถว และจอใช้ยอดนั้น ไม่ใช่ rows.length', () => {
  const route = readFileSync(new URL('../app/api/audit/route.js', import.meta.url), 'utf8');
  assert.match(route, /\.select\('\*', \{ count: 'exact' \}\)/);
  assert.match(route, /total: Number\.isFinite\(count\) \? count : null/);
  const page = readFileSync(new URL('../app/audit/page.js', import.meta.url), 'utf8');
  assert.match(page, /count=\{loading && rows\.length === 0 \? null : auditCountText\(\{ shown: rows\.length, total \}\)\}/);
  assert.match(page, /auditActorOptions\(directory, rows\)/);
  // ท้ายตารางต้องไม่เรียกแถวที่โหลดมาว่า "ทั้งหมด … รายการ" เฉย ๆ ตอนชนเพดาน
  assert.match(page, /itemLabel=\{truncated \? "รายการล่าสุดที่โหลดมา" : "รายการ"\}/);
});

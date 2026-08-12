// แจ้งเตือนของเรื่องแจ้งปัญหา — ช่องไหนแจ้งใคร และห้ามแจ้งพลาดแล้วล้มงานหลัก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UPDATE_KINDS } from '../master/updateTypes.js';
import { ISSUE_ACTIONS } from './model.js';

const here = dirname(fileURLToPath(import.meta.url));
const notifySrc = readFileSync(join(here, 'notify.js'), 'utf8');

// ⚠️ ชื่อ kind ต้องตรงกับชื่อ action ทุกตัว — route ส่ง `kind: action` ตรง ๆ
// หลุดกันเมื่อไร เหตุการณ์จะขึ้นป้าย "ข้อความ" เหมือนคนพิมพ์เอง แล้วยังหายไป
// ตอนกดซ่อนเหตุการณ์ระบบอีก (บั๊กเดิมของ customer/product kind='note' — 25 แถว)
test('ทุก action มี kind ในทะเบียนเธรด', () => {
  const kinds = UPDATE_KINDS.system_issue;
  assert.ok(kinds, 'ยังไม่ได้ประกาศ UPDATE_KINDS.system_issue');
  for (const action of ISSUE_ACTIONS) {
    assert.ok(kinds[action], `action "${action}" ไม่มี kind ในทะเบียน`);
    assert.ok(kinds[action].label, `kind "${action}" ไม่มีป้าย`);
  }
  assert.ok(kinds.auto_close, 'ปิดอัตโนมัติต้องมี kind ของตัวเอง');
});

// ชนิดที่คนพิมพ์เองได้ต้องมีตัวเดียว — ปล่อยให้ client ส่ง kind='resolve' มาเอง
// = ปลอมไทม์ไลน์ว่าแอดมินแก้แล้วได้
test('มีชนิดเดียวที่คนพิมพ์เองได้', () => {
  const authorable = Object.entries(UPDATE_KINDS.system_issue)
    .filter(([, meta]) => meta.authorable).map(([k]) => k);
  assert.deepEqual(authorable, ['comment']);
});

// 🪦 ท่อ Google Chat ถูกถอดออกทั้งระบบ 2026-08-12 — เรื่องใหม่เข้าคิวจึง **ไม่มี
// สัญญาณอัตโนมัติแล้ว** (แอดมินเปิดคิว /support เอง) · เทสต์นี้กันไม่ให้ใครเผลอ
// ต่อท่อกลับมาโดยไม่ตั้งใจ
test('ไม่เหลือร่องรอย Chat webhook ในสายเรื่องแจ้งปัญหา', () => {
  assert.doesNotMatch(notifySrc, /sendChat|chatCard|lib\/chat/);
});

// ⚠️ กติกาเหล็ก: แจ้งเตือนพลาดต้องไม่ทำให้เรื่องที่บันทึกสำเร็จแล้วตอบ error
// คนที่กำลังแจ้งบั๊กอยู่ต้องไม่เจอบั๊กซ้อนบั๊ก
test('ทางเดียวที่เหลือกลืน error เอง ไม่ throw ออกไปหาผู้เรียก', () => {
  assert.match(notifySrc, /export async function recordIssueEvent[\s\S]*?try \{[\s\S]*?\} catch/);
});

// 🐞 appendUpdate fan-out แจ้งเตือนให้เองอยู่แล้ว (ต่อไว้ที่นั่นที่เดียวโดยเจตนา)
// เรียก notifyThreadUpdate ซ้ำที่นี่ = ผู้ใช้ได้แจ้งเตือนสองใบต่อหนึ่งเหตุการณ์
test('ไม่เรียก notifyThreadUpdate ซ้ำหลัง appendUpdate', () => {
  // มองหา "การเรียก" ไม่ใช่คำในคอมเมนต์ (คำเตือนเรื่องนี้เขียนอยู่ในไฟล์)
  assert.ok(!/^\s*(await\s+)?notifyThreadUpdate\(/m.test(notifySrc),
    'appendUpdate fan-out ให้แล้ว ห้ามเรียกซ้ำ');
  assert.ok(!/from '@\/lib\/notifications'/.test(notifySrc), 'ไม่ควรต้อง import notifications ที่นี่');
});

// ⚠️ appendUpdate โหลดแถวแม่ใหม่เองเพื่อหาผู้รับ — เรียกก่อน update เสร็จเมื่อไร
// คนที่เพิ่งถูกมอบหมายจะไม่ได้รับแจ้งเตือนของก้าวที่มอบหมายเขาเอง
test('route เรียก recordIssueEvent หลัง update แถวเสร็จแล้ว', () => {
  const routeSrc = readFileSync(join(here, '../../app/api/issues/[id]/route.js'), 'utf8');
  const update = routeSrc.indexOf(".from('system_issues')");
  const notify = routeSrc.indexOf('recordIssueEvent(supabase');
  assert.ok(update > 0 && notify > 0, 'route ต้องทั้ง update และ recordIssueEvent');
  assert.ok(update < notify, 'recordIssueEvent ต้องอยู่หลัง update');
});

// เรื่องใหม่ไม่ยิง notification รายคน — ตอนนั้นยังไม่รู้ว่าแอดมินคนไหนจะรับ
// และมติ 14 ห้าม fan-out ให้ "ทุกคนในฝ่าย" · หลังถอด Chat ออกแล้วขั้นนี้จึงเงียบ
// โดยตั้งใจ (มติผู้ใช้ 2026-08-12) ไม่ใช่ลืมต่อสาย
test('POST เรื่องใหม่ไม่ fan-out รายคน', () => {
  const routeSrc = readFileSync(join(here, '../../app/api/issues/route.js'), 'utf8');
  assert.ok(!routeSrc.includes('notifyThreadUpdate'));
  assert.ok(!routeSrc.includes('recordIssueEvent'));
});

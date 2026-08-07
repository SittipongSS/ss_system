// ก้อนที่ 3 — คิวแอดมิน · ปิดอัตโนมัติ · ปุ่มบนหน้าที่พัง
//
// เทสต์ชุดนี้อ่านซอร์ส เพราะสิ่งที่ต้องกันคือ "การต่อสายผิด" ซึ่งไม่มี unit ให้เรียก
// (หน้า React + ไฟล์ตั้งค่า) — และทุกข้อคือของที่พังเงียบ ไม่มี error ให้เห็น
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AUTO_CLOSE_DAYS } from './model.js';
import { UPDATE_KINDS } from '../master/updateTypes.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

const cronSrc = read('../../app/api/cron/close-resolved-issues/route.js');
const listSrc = read('../../app/support/page.js');
const detailSrc = read('../../app/support/[id]/page.js');

// ── ปิดอัตโนมัติ ─────────────────────────────────────────────────────────
test('cron ปิดอัตโนมัติถูกลงทะเบียนใน vercel.json', () => {
  const vercel = JSON.parse(read('../../../vercel.json'));
  const job = (vercel.crons || []).find((c) => c.path === '/api/cron/close-resolved-issues');
  assert.ok(job, 'ไม่ลงทะเบียน = cron ไม่เคยทำงาน และไม่มีอะไรฟ้อง');
  assert.ok(job.schedule, 'ต้องมี schedule');
});

test('cron ใช้ด่านเดียวกับ daily-digest (CRON_SECRET หรือ master:manage)', () => {
  assert.match(cronSrc, /Bearer \$\{process\.env\.CRON_SECRET\}/);
  assert.match(cronSrc, /can\(user\?\.role, 'master:manage'\)/);
});

// ⚠️ ตัดสินด้วยฟังก์ชันที่เทสต์คุมอยู่ ไม่เขียนเงื่อนไขวันที่ซ้ำใน SQL —
// สองที่ที่ต้องตรงกันเองคือสองที่ที่จะเพี้ยนหากันวันหนึ่ง
test('cron ตัดสินด้วย isDueForAutoClose ไม่คำนวณวันเอง', () => {
  assert.match(cronSrc, /isDueForAutoClose\(row, now\)/);
  assert.ok(!/interval|7 \* 24|\* 60 \* 60 \* 1000/.test(cronSrc), 'ห้ามคำนวณ 7 วันซ้ำในไฟล์ cron');
  assert.equal(AUTO_CLOSE_DAYS, 7);
});

// 🐞 กับดัก: ระหว่าง cron อ่านแล้วเขียน ผู้แจ้งอาจกด "ยืนยัน"/"ยังไม่หาย" พอดี
// ถ้า update ไม่ล็อกสถานะเดิมไว้ cron จะทับสถานะที่ถูกต้องด้วย closed
test('cron ไม่ทับสถานะที่ผู้แจ้งเพิ่งเปลี่ยน (กันแข่ง)', () => {
  assert.match(cronSrc, /\.eq\('status', 'resolved'\)/);
});

test('ปิดอัตโนมัติมี kind ของตัวเอง แยกจากการยืนยันของผู้แจ้ง', () => {
  assert.ok(UPDATE_KINDS.system_issue.auto_close, 'ต้องมี kind auto_close');
  assert.notEqual(
    UPDATE_KINDS.system_issue.auto_close.label,
    UPDATE_KINDS.system_issue.confirm.label,
    'ปิดเองกับผู้แจ้งยืนยันต้องอ่านออกว่าคนละอย่าง',
  );
  assert.match(cronSrc, /kind: 'auto_close'/);
});

// ── คิวแอดมิน ────────────────────────────────────────────────────────────
// ⭐ หน้าเดียวสองบทบาท — ห้ามแยกหน้าแอดมิน (กฎของ repo: ของอย่างเดียวห้ามมีสองชุด)
test('คิวแอดมินอยู่ในหน้า /support เดิม ไม่ใช่หน้าใหม่', () => {
  assert.match(listSrc, /isSystemAdmin\(\{ role \}\)/);
  assert.match(listSrc, /const ADMIN_TABS/);
  for (const key of ['pending', 'acknowledged', 'resolved', 'mine', 'all']) {
    assert.match(listSrc, new RegExp(`key: "${key}"`), `ขาดแท็บ ${key}`);
  }
});

// ตัวเลขบนการ์ดกับรายการต้องมาจากข้อมูลชุดเดียวกัน ไม่งั้นมันจะขัดกันเองเป็นระยะ
test('ตัวนับกับสามแท็บแรกมาจากผลลัพธ์ก้อนเดียว', () => {
  assert.match(listSrc, /"\/api\/issues\?status=open"/);
  assert.match(listSrc, /open\.filter\(\(r\) => r\.status === tab\)/);
});

test('"รับเรื่อง" กดได้จากคิวโดยไม่ต้องเปิดเรื่องก่อน', () => {
  assert.match(listSrc, /action: "acknowledge"/);
});

// ── หน้ารายละเอียดฝั่งแอดมิน ─────────────────────────────────────────────
test('ปุ่มแอดมินโผล่ตามสถานะ ไม่ใช่ตาม role อย่างเดียว', () => {
  assert.match(detailSrc, /admin && \["pending", "acknowledged", "resolved"\]\.includes\(issue\.status\)/);
  assert.match(detailSrc, /act\("acknowledge"\)/);
  assert.match(detailSrc, /act\("resolve"\)/);
});

// มอบหมายให้คนที่ไม่ใช่ admin = แถวจะมี assignee ที่เปิดเรื่องตัวเองไม่ได้ด้วยซ้ำ
test('รายชื่อผู้รับมอบกรองเหลือ role admin เท่านั้น', () => {
  assert.match(detailSrc, /filter\(\(u\) => u\.role === "admin"\)/);
});

test('ปฏิเสธผ่าน ReasonDialog — เหตุผลบังคับ', () => {
  assert.match(detailSrc, /<ReasonDialog/);
  assert.match(detailSrc, /act\("reject", \{ reason \}\)/);
});

// ── หน้าที่พัง ───────────────────────────────────────────────────────────
// ⚠️ ส่งอัตโนมัติ = เรื่องซ้ำใบละสิบเวลา error เดียวกันเด้งซ้ำ และ stack อาจมี
// ข้อมูลใน state ติดไปโดยไม่มีใครดูก่อน
test('หน้าที่พังมีปุ่มแจ้ง แต่ไม่ส่งอัตโนมัติ', () => {
  const errorSrc = read('../../app/error.js');
  assert.match(errorSrc, /<ReportIssueModal[\s\S]*errorStack=\{stack\}/);
  assert.match(errorSrc, /setReporting\(true\)/, 'ต้องเป็นผู้ใช้กดเอง');
  assert.ok(!/useEffect/.test(errorSrc), 'ห้ามมี effect ที่ยิงเรื่องเองตอนหน้าพัง');
  assert.match(errorSrc, /error\?\.digest/, 'digest คือสิ่งเดียวที่ตามกลับไปหา log ฝั่ง server ได้');
});

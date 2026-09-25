// ปุ่มแอดมิน "บังคับรีเฟรชทุกคน" — logic + ด่าน proxy + ยามรูปโค้ดของการต่อสาย
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FORCE_REFRESH_SIGNAL, isNewerSignal } from './forceRefresh.js';
import { apiWriteAllowed, lockedOut } from '../../proxy.js';

const read = (rel) => fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('สั่งหลังจากที่หน้านี้เปิด = เด้ง · สั่งก่อน/พร้อมกัน = ไม่เด้ง', () => {
  const opened = '2026-09-25T07:00:00.000Z';
  assert.equal(isNewerSignal(opened, '2026-09-25T07:05:00.000Z'), true);
  assert.equal(isNewerSignal(opened, opened), false);
  assert.equal(isNewerSignal(opened, '2026-09-25T06:00:00.000Z'), false);
});

test('ไม่เคยมีใครสั่ง (null) แล้วมีคนสั่ง = เด้ง · ยังถามไม่สำเร็จสักครั้ง (undefined) = ไม่เด้ง', () => {
  assert.equal(isNewerSignal(null, '2026-09-25T07:05:00.000Z'), true);
  assert.equal(isNewerSignal(undefined, '2026-09-25T07:05:00.000Z'), false);
  assert.equal(isNewerSignal(null, null), false);
  assert.equal(isNewerSignal('2026-09-25T07:00:00Z', 'ไม่ใช่วันที่'), false);
});

test('proxy: ทุก role อ่านสัญญาณได้ · สั่งได้เฉพาะแอดมิน (users:manage)', () => {
  const url = '/api/users/force-refresh';
  for (const role of ['ae', 'senior_ae', 'ts', 'rd', 'finance', 'user']) {
    assert.equal(lockedOut({ role }, url, 'GET', true), false, `${role} ต้องอ่านได้ ไม่งั้นแท็บของเขาไม่มีวันเด้ง`);
    assert.equal(apiWriteAllowed('POST', url, role, []), false, `${role} ต้องสั่งไม่ได้`);
  }
  assert.equal(apiWriteAllowed('POST', url, 'admin', []), true);
  assert.equal(lockedOut({ role: 'admin' }, url, 'POST', true), false);
});

/* ── ยามรูปโค้ด ── */
const ROUTE = stripComments(read('../../app/api/users/force-refresh/route.js'));
const WATCHER = stripComments(read('../../components/ForceRefreshWatcher.js'));
const LAYOUT = read('../../components/AppLayout.js');
const USERS = read('../../app/users/page.js');

test('route: GET ต้องล็อกอิน · POST ตรวจ users:manage ซ้ำใน handler · เขียน audit_logs ตรง (ไม่ผ่าน recordAudit ที่กลืน error)', () => {
  assert.match(ROUTE, /export const GET = withUser\(async \(\{ user, supabase \}\) => \{\s*if \(!user\) return unauthorized\(\);/);
  assert.match(ROUTE, /if \(!can\(user\.role, 'users:manage'\)\) return forbidden\(/);
  assert.match(ROUTE, /\.from\('audit_logs'\)\s*\.insert\(/);
  assert.doesNotMatch(ROUTE, /recordAudit/);
  assert.equal(FORCE_REFRESH_SIGNAL.entityType, 'system');
  assert.equal(FORCE_REFRESH_SIGNAL.entityId, 'force-refresh');
});

test('ตัวเฝ้า: หน้าต่างปิดไม่ได้ · ถามผ่าน apiFetch · ไม่มีทางรีโหลดเองนอกปุ่ม', () => {
  assert.match(WATCHER, /dismissible=\{false\}/);
  assert.match(WATCHER, /apiFetch\("\/api\/users\/force-refresh"/);
  const reloads = WATCHER.split('\n').filter((l) => /window\.location\.reload\(\)/.test(l));
  assert.equal(reloads.length, 1, 'รีโหลดได้ทางเดียว = ปุ่มในหน้าต่าง');
  assert.match(reloads[0], /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.doesNotMatch(WATCHER, /location\.assign|location\.href\s*=/);
});

test('เปลือกแอปวาดตัวเฝ้าทุกหน้า · ตัวเช็กเวอร์ชันหลัง deploy (#1829) ถอดครบ — ทริกจากแอดมินเท่านั้น', () => {
  assert.match(LAYOUT, /import ForceRefreshWatcher from "@\/components\/ForceRefreshWatcher"/);
  assert.match(LAYOUT, /<ForceRefreshWatcher \/>/);
  assert.doesNotMatch(LAYOUT, /VersionWatcher/);
  assert.equal(fs.existsSync(path.resolve(import.meta.dirname, '../../components/VersionWatcher.js')), false);
  assert.doesNotMatch(read('../../../next.config.mjs'), /NEXT_PUBLIC_BUILD_SHA/);
});

test('หน้า /users: ปุ่มเฉพาะแอดมิน · ถามยืนยันแบบอันตรายก่อนยิง · แจ้งแท็บตัวเองว่ารู้แล้ว', () => {
  assert.match(USERS, /headerRight=\{canManage \? \(/);
  assert.match(USERS, /apiJson\("\/api\/users\/force-refresh", \{ method: "POST"/);
  assert.match(USERS, /confirmLabel: "บังคับรีเฟรช",\s*danger: true,/);
  assert.match(USERS, /new CustomEvent\(FORCE_REFRESH_ISSUED_EVENT/);
});

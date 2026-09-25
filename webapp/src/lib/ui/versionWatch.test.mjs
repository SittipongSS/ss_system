// แท็บที่เปิดค้างรู้ตัวเมื่อระบบอัปเดต — logic + ยามรูปโค้ดของการต่อสาย
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RELOAD_MARK_KEY, canAutoReload, isNewVersion, markAutoReload } from './versionWatch.js';

const read = (rel) => fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf8');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}
const brokenStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

test('มีเวอร์ชันใหม่ = รู้ครบสองฝั่งและไม่ตรงกัน', () => {
  assert.equal(isNewVersion('aaa111', 'bbb222'), true);
  assert.equal(isNewVersion('aaa111', 'aaa111'), false);
  assert.equal(isNewVersion(' aaa111 ', 'aaa111'), false);
  // เครื่อง dev ไม่มีเลข build · /api/version ตอบ null · ถามไม่สำเร็จ = ไม่ถือว่ามีของใหม่
  assert.equal(isNewVersion('', 'bbb222'), false);
  assert.equal(isNewVersion('aaa111', null), false);
  assert.equal(isNewVersion(undefined, undefined), false);
});

test('กันรีโหลดวน — รีโหลดเพื่อ sha เดิมไปแล้ว ไม่รีโหลดซ้ำ · sha ใหม่กว่านั้นรีโหลดได้อีก', () => {
  const s = memoryStorage();
  assert.equal(canAutoReload('bbb222', s), true);
  assert.equal(markAutoReload('bbb222', s), true);
  assert.equal(s.getItem(RELOAD_MARK_KEY), 'bbb222');
  assert.equal(canAutoReload('bbb222', s), false, 'ได้โค้ดเก่ากลับมาหลังรีโหลด = ห้ามวน');
  assert.equal(canAutoReload('ccc333', s), true, 'deploy รอบใหม่อีกรอบ ต้องรีโหลดได้');
});

test('storage ใช้ไม่ได้ = ไม่รีโหลดเอง (fail-closed) — รีโหลดวนแย่กว่าไม่รีโหลด', () => {
  assert.equal(canAutoReload('bbb222', null), false);
  assert.equal(canAutoReload('bbb222', brokenStorage), false);
  assert.equal(markAutoReload('bbb222', null), false);
  assert.equal(markAutoReload('bbb222', brokenStorage), false);
});

/* ── ยามรูปโค้ด — ต่อสายครบ และไม่ข้ามตัวกันงานหาย ── */
const WATCHER = read('../../components/VersionWatcher.js');
const LAYOUT = read('../../components/AppLayout.js');
const CONFIG = read('../../../next.config.mjs');

test('เลข build ฝังจาก VERCEL_GIT_COMMIT_SHA — ค่าเดียวกับที่ /api/version อ่าน', () => {
  assert.match(CONFIG, /NEXT_PUBLIC_BUILD_SHA:\s*process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(read('../../app/api/version/route.js'), /process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(WATCHER, /process\.env\.NEXT_PUBLIC_BUILD_SHA/);
});

test('เปลือกแอปวาดตัวเช็กเวอร์ชันทุกหน้า', () => {
  assert.match(LAYOUT, /import VersionWatcher from "@\/components\/VersionWatcher"/);
  assert.match(LAYOUT, /<VersionWatcher \/>/);
});

test('ตัวเช็กถามผ่าน apiFetch · ไม่ดักคลิกลิงก์เอง (ไม่ข้าม useUnsavedChanges) · รีโหลดหลังเปลี่ยนหน้าเท่านั้น', () => {
  const code = WATCHER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(code, /apiFetch\("\/api\/version"/);
  assert.doesNotMatch(code, /addEventListener\(\s*["']click["']/, 'ห้ามดักคลิก — ตัวกันงานหายดักอยู่แล้ว');
  assert.doesNotMatch(code, /location\.assign|location\.href\s*=/, 'ห้ามพาไปหน้าอื่นเอง');
  // รีโหลดเอง (ไม่ใช่ปุ่ม) มีจุดเดียว และต้องผ่านด่านกันวนก่อน
  const auto = code.split('\n').filter((l) => /window\.location\.reload\(\)/.test(l) && !/onClick/.test(l));
  assert.equal(auto.length, 1);
  assert.match(code, /canAutoReload\(latest, storage\) \|\| !markAutoReload\(latest, storage\)\) return;\s*window\.location\.reload\(\)/);
});

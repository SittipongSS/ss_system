// ── ไฟล์รายพื้นที่ชุดสด (แผน §10.5 S2) — กติกาสองข้อของตัวรวม + ยามอ่านซอร์สว่าหน้าต่อสายจริง ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveZoneFilesMerge, liveZoneFilesReport } from './useLiveZoneFiles.js';

const code = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const WIDE = { id: 'f1', docType: 'survey_wide' };
const PLAN = { id: 'f2', docType: 'survey_plan' };
const LOADED = { loaded: true };

test('รายงานที่แผงยังโหลดไม่เสร็จ (หรือโหลดไม่สำเร็จ) ไม่นับ — ไม่งั้นตัวนับกะพริบเป็น "ยังไม่มี"', () => {
  const base = { z1: [WIDE] };
  assert.equal(liveZoneFilesReport(null, { base, zoneId: 'z1', items: [], meta: { loaded: false } }), null);
  assert.equal(liveZoneFilesReport(null, { base, zoneId: 'z1', items: [] }), null);
  assert.deepEqual(liveZoneFilesMerge(null, base), base);
});

test('แผงรายงานมา = ทับค่าของ GET เฉพาะพื้นที่นั้น · พื้นที่อื่นยังเป็นของ GET', () => {
  const base = { z1: [WIDE], z2: [WIDE] };
  const state = liveZoneFilesReport(null, { base, zoneId: 'z1', items: [WIDE, PLAN], meta: LOADED });
  const merged = liveZoneFilesMerge(state, base);
  assert.deepEqual(merged.z1, [WIDE, PLAN], 'อัปผังแล้วด่านต้องเห็นทันที ไม่ต้องรอโหลดหน้าใหม่');
  assert.equal(merged.z2, base.z2);
  // ลบหมดจากที่อื่น = รายการว่างที่ "โหลดจบแล้ว" ต้องเชื่อ (ไม่ใช่ทิ้งเหมือนก้อนว่างก้อนแรก)
  const emptied = liveZoneFilesReport(state, { base, zoneId: 'z2', items: [], meta: LOADED });
  assert.deepEqual(liveZoneFilesMerge(emptied, base).z2, []);
});

test('GET ก้อนใหม่ = ล้างรายงานเก่าทั้งหมด — ก้อนใหม่อ่านจากฐานหลังการอัป/ลบแล้ว', () => {
  const first = { z1: [WIDE] };
  const state = liveZoneFilesReport(null, { base: first, zoneId: 'z1', items: [WIDE, PLAN], meta: LOADED });
  const second = { z1: [WIDE] };
  assert.equal(liveZoneFilesMerge(state, second), second, 'รายงานที่ผูกกับก้อนก่อนต้องไม่ทับก้อนใหม่');
  // รายงานหลังโหลดใหม่เริ่มนับจากศูนย์ ไม่พกของก้อนก่อนมาด้วย
  const after = liveZoneFilesReport(state, { base: second, zoneId: 'z2', items: [PLAN], meta: LOADED });
  assert.deepEqual(Object.keys(after.byZone), ['z2']);
  assert.equal(liveZoneFilesMerge(after, second).z1, second.z1);
});

test('รายการเดิมรายงานซ้ำ = คืนสถานะตัวเดิมเป๊ะ (ไม่งั้นแผงยิงซ้ำ → วาดใหม่ → ยิงซ้ำ ไม่รู้จบ)', () => {
  const base = { z1: [] };
  const items = [WIDE];
  const state = liveZoneFilesReport(null, { base, zoneId: 'z1', items, meta: LOADED });
  assert.equal(liveZoneFilesReport(state, { base, zoneId: 'z1', items, meta: LOADED }), state);
  assert.equal(liveZoneFilesReport(state, { base, zoneId: '', items, meta: LOADED }), state, 'ไม่รู้ว่าพื้นที่ไหน = ไม่แตะ');
});

test('ยาม: ตัวรายงานคงที่ · หน้าอ่านก้อนรวมก้อนเดียว · ตารางและหน้าพื้นที่รายงานขึ้นมา', () => {
  const hook = code('./useLiveZoneFiles.js');
  assert.match(hook, /const reportFiles = useCallback\([\s\S]*?\}, \[\]\);/,
    'ตัวรายงานต้องไม่เปลี่ยนตามก้อน GET — ไม่งั้นแผงยิงรายการเดิมซ้ำทันทีหลังโหลด');
  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /const \[filesByZone, reportFiles\] = useLiveZoneFiles\(data\?\.filesByZone\);/);
  assert.doesNotMatch(page, /data\?\.filesByZone \|\| \{\}/, 'ห้ามมีก้อน GET ดิบอีกก้อนให้บางที่อ่าน');
  assert.match(page, /onFiles=\{reportFiles\}/);
  assert.match(page, /onFilesChange=\{reportFiles\}/);
  // 🔄 §10.5 S7 — การ์ดพื้นที่กลายเป็นหน้าพื้นที่ (`SurveyZonePage`) · สายรายงานเส้นเดิม
  const zonePage = code('./SurveyZonePage.js');
  assert.match(zonePage, /onFilesChange\?\.\(zone\.id, items, meta\)/);
  const table = code('./SurveyResultTable.js');
  assert.match(table, /onFiles\?\.\(zoneId, items, meta\)/);
});

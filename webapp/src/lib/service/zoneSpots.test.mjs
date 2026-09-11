// ── จุดติดตั้งของโซน (mig 0354) — ตัวตรวจรูป + ยามของทางเขียน ──────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ZONE_SPOT_MAX, normalizeZoneInput, normalizeZoneSpots, spotBatchLabels,
} from './zones.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');

test('ไม่ส่งมา = รายการว่าง · ไม่ใช่ array = ตีกลับ (ไม่กลายเป็น object เงียบ ๆ)', () => {
  assert.deepEqual(normalizeZoneSpots(undefined), { value: [], error: null });
  assert.deepEqual(normalizeZoneSpots(null), { value: [], error: null });
  assert.match(normalizeZoneSpots({ a: 1 }).error, /ไม่ถูกต้อง/);
});

test('🔑 id เดิมคงอยู่ข้ามการแก้ — วันหนึ่งเครื่องจะชี้จุดด้วย id นี้', () => {
  const { value } = normalizeZoneSpots(
    [{ id: 'SPT-abc', label: ' ข้างประตู ', note: '' }, { id: 'new-3', label: 'หลังเคาน์เตอร์' }],
    { makeId: () => 'SPT-new' },
  );
  assert.deepEqual(value, [
    { id: 'SPT-abc', label: 'ข้างประตู', note: null },
    { id: 'SPT-new', label: 'หลังเคาน์เตอร์', note: null },
  ]);
});

test('id ซ้ำในรายการเดียว (ก๊อปแถว) ได้ id ใหม่ — สองจุดชี้ตัวเดียวกันไม่ได้', () => {
  let n = 0;
  const { value } = normalizeZoneSpots(
    [{ id: 'SPT-1', label: 'ก' }, { id: 'SPT-1', label: 'ข' }],
    { makeId: () => `SPT-x${++n}` },
  );
  assert.deepEqual(value.map((s) => s.id), ['SPT-1', 'SPT-x1']);
});

test('id รูปแปลก (ยาว/มีอักขระพิเศษ) ไม่ถูกเก็บ — ออกใหม่แทน', () => {
  const { value } = normalizeZoneSpots([{ id: 'a b;drop', label: 'ก' }], { makeId: () => 'SPT-ok' });
  assert.equal(value[0].id, 'SPT-ok');
});

test('ชื่อบังคับ · ยาวเกิน · หมายเหตุยาวเกิน · เกินจำนวนต่อโซน', () => {
  assert.match(normalizeZoneSpots([{ label: 'ก' }, { label: '' }]).error, /แถวที่ 2 ยังไม่มีชื่อ/);
  assert.match(normalizeZoneSpots([{ label: 'ก'.repeat(101) }]).error, /ยาวเกิน 100/);
  assert.match(normalizeZoneSpots([{ label: 'ก', note: 'ข'.repeat(501) }]).error, /ยาวเกิน 500/);
  const many = Array.from({ length: ZONE_SPOT_MAX + 1 }, (_, i) => ({ label: `จุด ${i}` }));
  assert.match(normalizeZoneSpots(many).error, /เกิน 200 จุด/);
});

test('⭐ "เพิ่มหลายจุด" นับต่อจากที่มี — กดสองรอบไม่ได้ "จุดที่ 1" ซ้ำ', () => {
  assert.deepEqual(spotBatchLabels(0, 3), ['จุดที่ 1', 'จุดที่ 2', 'จุดที่ 3']);
  assert.deepEqual(spotBatchLabels(3, 2), ['จุดที่ 4', 'จุดที่ 5']);
  assert.deepEqual(spotBatchLabels(2, 0), []);
  assert.deepEqual(spotBatchLabels(2, -4), []);
  assert.deepEqual(spotBatchLabels(0, '2'), ['จุดที่ 1', 'จุดที่ 2']);
});

test('🔴 normalizeZoneInput เขียน `spots` เฉพาะเมื่อส่งมา — ทางสร้างโซนอื่นไม่แตะคอลัมน์', () => {
  const base = { name: 'ล็อบบี้', floor: 'G' };
  assert.equal('spots' in normalizeZoneInput(base).value, false,
    'ใบประเมิน/งานเข้าใหม่/ตัวนำเข้าไม่มีจุดให้ส่ง ⇒ ต้องปล่อยค่าตั้งต้นของฐาน');
  assert.deepEqual(normalizeZoneInput({ ...base, spots: [] }).value.spots, []);
  assert.match(normalizeZoneInput({ ...base, spots: [{ label: '' }] }).error, /ยังไม่มีชื่อ/);
});

test('🔑 ทุกทางที่เขียนจุดลงฐานออก id ให้จุดใหม่ — ไม่มีจุดที่ id ว่าง', () => {
  for (const rel of [
    'app/api/service/sites/[id]/zones/route.js',
    'app/api/service/sites/[id]/zones/[zoneId]/route.js',
    'app/api/service/legacy-sites/route.js',
  ]) {
    const src = read(rel);
    assert.match(src, /makeSpotId/, `${rel}: ต้องส่งตัวออก id ของจุด`);
    assert.match(src, /genId\('SPT'\)/, `${rel}: id ของจุดมาจาก genId('SPT')`);
  }
});

test('migration 0354: คอลัมน์ spots เป็น array เสมอ (ค่าตั้งต้น + CHECK)', () => {
  const sql = readFileSync('supabase/migrations/0354_service_zone_spots.sql', 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS spots jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(sql, /CHECK \(jsonb_typeof\(spots\) = 'array'\)/);
});

test('🐞 ไทล์ที่อยู่สังเคราะห์ห้ามลงฐานเป็นที่มา — server ตีกลับ "ไม่พบที่อยู่ต้นทาง" ทุกครั้ง', () => {
  const src = read('components/service/ServiceSiteFields.js');
  assert.match(src, /SYNTHETIC_ADDRESS_IDS\.has\(id\) \? null : id/);
  assert.match(src, /customerAddressId: sourceId/);
});

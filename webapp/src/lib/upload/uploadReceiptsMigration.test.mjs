// ── ยามตัวหนังสือของ mig 0406 (ทะเบียนใบรับการอัปโหลด · มติเจ้าของ 08/10/2569) ─────────────────────────
//
// ⭐ ล็อกรูปของไฟล์ที่พิสูจน์บน PGlite นอก repo แล้ว ไม่ให้ไหลเงียบใน CI: ตารางฝั่ง server ล้วน (RLS เปิด ไม่มี policy ·
//    ถอนสิทธิ์ PUBLIC/anon/authenticated) · CHECK ตั้งชื่อเอง + DROP/ADD (รันซ้ำแล้วซ่อมได้) · รูปร่าง id ตรงกับฝั่ง JS
// ⚠️ อ่าน **ตัวหนังสือ SQL อย่างเดียว** — พฤติกรรมจริง (รันสามรอบ · สิทธิ์รายบทบาท · CHECK ทุกรูป · บล็อกตรวจ/ถอยของหัวไฟล์)
//    พิสูจน์บนฮาร์เนส PGlite นอก repo ก่อนเจ้าของรันบน SQL Editor
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DRIVE_FILE_ID_PATTERN } from './receipts.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0406_upload_receipts.sql';
const RAW = readFileSync(new URL(FILE, MIGRATIONS), 'utf8');
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = RAW.slice(0, SPLIT);
const CODE = RAW.slice(SPLIT).replace(/--[^\n]*/g, '');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const FLAT = flat(CODE);
const occurrences = (text, needle) => text.split(needle).length - 1;

test('0406: เลขไม่ซ้ำ · หัวไฟล์บอกมติ วิธีรัน ลำดับก่อน CI/deploy และรันซ้ำได้', () => {
  const same = readdirSync(MIGRATIONS).filter((name) => name.startsWith('0406_'));
  assert.deepEqual(same, [FILE]);
  assert.ok(SPLIT > 0, 'ต้องมี BEGIN;');
  assert.match(HEADER, /Migration 0406/);
  assert.match(HEADER, /มติเจ้าของ 08\/10\/2569/);
  assert.match(HEADER, /รันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /รันก่อนเปิด PR ให้ CI เขียว \/ ก่อน merge \/ ก่อน deploy/);
  assert.match(HEADER, /โค้ดเก่าไม่แตะตารางนี้/, 'ต้องบอกว่าเข้ากันได้กับโค้ดที่ deploy อยู่');
  assert.match(HEADER, /รันซ้ำได้/);
  assert.match(HEADER, /ไม่มี backfill/);
});

test('0406: ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ไม่มีคำสั่งทำลายข้อมูลนอกคอมเมนต์', () => {
  assert.equal(occurrences(CODE, 'BEGIN;'), 1);
  assert.equal(occurrences(CODE, 'COMMIT;'), 1);
  const commitAt = CODE.indexOf('COMMIT;');
  const notifyAt = CODE.indexOf("NOTIFY pgrst, 'reload schema';");
  assert.ok(notifyAt > commitAt, 'NOTIFY pgrst ต้องอยู่หลัง COMMIT');
  assert.equal(flat(CODE.slice(commitAt + 'COMMIT;'.length)), "NOTIFY pgrst, 'reload schema';", 'หลัง COMMIT มีแค่ NOTIFY');
  assert.doesNotMatch(CODE, /DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN/i);
});

test('0406: ตาราง — 7 ช่อง · primary key = id ไฟล์ · userId เป็น text NOT NULL · สองช่องประทับเติมได้บนตารางที่มีอยู่แล้ว', () => {
  const create = FLAT.match(/CREATE TABLE IF NOT EXISTS public\.upload_receipts \((.*?)\);/);
  assert.ok(create, 'ต้องเป็น CREATE TABLE IF NOT EXISTS');
  const columns = create[1].split(',').map((c) => flat(c));
  assert.deepEqual(columns, [
    '"driveFileId" text PRIMARY KEY',
    '"userId" text NOT NULL',
    '"entityType" text',
    '"entityId" text',
    '"createdAt" timestamptz NOT NULL DEFAULT now()',
    '"claimedBy" text',
    '"claimedAt" timestamptz',
  ]);
  assert.match(FLAT, /ALTER TABLE public\.upload_receipts ADD COLUMN IF NOT EXISTS "claimedBy" text, ADD COLUMN IF NOT EXISTS "claimedAt" timestamptz;/);
  assert.match(FLAT, /CREATE INDEX IF NOT EXISTS upload_receipts_created_idx ON public\.upload_receipts \("createdAt"\);/);
});

test('🔴 0406: CHECK ตั้งชื่อเอง + DROP IF EXISTS แล้ว ADD (ไม่ประกาศในบรรทัด CREATE TABLE) · รูปร่าง id ตรงกับฝั่ง JS', () => {
  for (const [name, body] of [
    ['upload_receipts_file_id_check', `CHECK ("driveFileId" ~ '^[A-Za-z0-9_-]{1,200}$')`],
    ['upload_receipts_user_check', 'CHECK (length("userId") BETWEEN 1 AND 200)'],
  ]) {
    const drop = FLAT.indexOf(`ALTER TABLE public.upload_receipts DROP CONSTRAINT IF EXISTS ${name};`);
    const add = FLAT.indexOf(`ALTER TABLE public.upload_receipts ADD CONSTRAINT ${name} ${body};`);
    assert.ok(drop > 0 && add > drop, `${name}: ต้อง DROP IF EXISTS ก่อนแล้ว ADD`);
  }
  assert.doesNotMatch(FLAT.match(/CREATE TABLE IF NOT EXISTS public\.upload_receipts \((.*?)\);/)[1], /CHECK/i,
    'CHECK ในบรรทัด CREATE TABLE IF NOT EXISTS ไม่ซ่อมตารางที่มีอยู่แล้ว');
  // ตัวหนังสือของ pattern ฝั่ง JS ต้องเป็นตัวเดียวกับใน SQL — ฝั่งใดฝั่งหนึ่งหลวมกว่า = ใบรับที่ออกแล้วอ่านไม่ได้ หรือค่าที่ไม่ควรลงตารางลงได้
  const sqlPattern = FLAT.match(/"driveFileId" ~ '([^']+)'/)[1];
  assert.equal(DRIVE_FILE_ID_PATTERN.source, sqlPattern);
  assert.equal(DRIVE_FILE_ID_PATTERN.flags, '');
});

test('🔴 0406: ตารางฝั่ง server ล้วน — เปิด RLS โดยไม่มี policy · ถอนสิทธิ์ PUBLIC/anon/authenticated · ให้ service_role เท่านั้น', () => {
  const rls = FLAT.indexOf('ALTER TABLE public.upload_receipts ENABLE ROW LEVEL SECURITY;');
  const revoke = FLAT.indexOf('REVOKE ALL ON TABLE public.upload_receipts FROM PUBLIC, anon, authenticated;');
  const grant = FLAT.indexOf('GRANT ALL ON TABLE public.upload_receipts TO service_role;');
  assert.ok(rls > 0 && revoke > rls && grant > revoke);
  assert.ok(grant < FLAT.indexOf('COMMIT;'), 'สิทธิ์ต้องอยู่ในทรานแซกชันเดียวกับการสร้างตาราง');
  assert.doesNotMatch(CODE, /CREATE POLICY/i, 'ไม่มี policy = anon/authenticated อ่านเขียนไม่ได้แม้มีใคร GRANT กลับ');
  assert.equal(occurrences(FLAT, 'GRANT '), 1, 'GRANT เดียว — ให้ service_role');
  assert.doesNotMatch(FLAT, /DISABLE ROW LEVEL SECURITY|TO (anon|authenticated|PUBLIC)\b/i);
});

test('0406: ท้ายไฟล์มีคำสั่งตรวจหลังรันและทางถอย (เป็นคอมเมนต์) — ทางถอยบอกให้ถอยโค้ดก่อน', () => {
  const tail = RAW.slice(RAW.indexOf("NOTIFY pgrst, 'reload schema';"));
  assert.match(tail, /-- ── ตรวจหลังรัน/);
  assert.match(tail, /-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public\.upload_receipts'::regclass;/);
  assert.match(tail, /-- SELECT has_table_privilege\('anon', 'public\.upload_receipts', 'SELECT'\)/);
  const rollback = tail.slice(tail.indexOf('-- ── Rollback'));
  assert.match(rollback, /ถอยโค้ดก่อนเสมอ/);
  assert.match(rollback, /-- DROP TABLE IF EXISTS public\.upload_receipts;/);
  for (const line of tail.split('\n').slice(1)) assert.ok(line === '' || line.startsWith('--'), `ท้ายไฟล์ต้องเป็นคอมเมนต์ล้วน: ${line}`);
});

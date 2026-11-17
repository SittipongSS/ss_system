// mig 0438 — ตาราง API ภายนอก · changeSeq · ร่องรอยใบที่ถูกลบ · ประวัติการเรียก (อ่านไฟล์ SQL — ไม่มี DB ในเทสต์)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = readdirSync(DIR).find((f) => f.startsWith('0438_'));
const CODE = readFileSync(new URL(FILE, DIR), 'utf8').replace(/--[^\n]*/g, '');

test('0438: backfill ก่อนสร้าง trigger · setval ต่อจากเลขสูงสุด · trigger ไม่แตะ updatedAt', () => {
  const backfill = CODE.indexOf('UPDATE public.sales_orders o');
  const setval = CODE.indexOf("SELECT setval('public.sales_orders_change_seq'");
  const trigger = CODE.indexOf('CREATE TRIGGER sales_orders_stamp_change_trg');
  assert.ok(backfill > 0 && setval > backfill && trigger > setval, 'ลำดับ: backfill → setval → trigger');
  assert.match(CODE, /WHERE "changeSeq" IS NULL/, 'backfill เฉพาะแถวที่ยังว่าง (รันซ้ำได้)');
  assert.match(CODE, /ORDER BY "updatedAt" NULLS FIRST, id/);
  const fn = CODE.slice(CODE.indexOf('FUNCTION public.sales_orders_stamp_change()'), CODE.indexOf('$$;', CODE.indexOf('FUNCTION public.sales_orders_stamp_change()')));
  assert.doesNotMatch(fn, /updatedAt/, 'updatedAt ใช้เป็น CAS — trigger ห้ามแตะ');
  assert.match(CODE, /BEFORE INSERT OR UPDATE ON public\.sales_orders\s+FOR EACH ROW EXECUTE FUNCTION public\.sales_orders_stamp_change\(\);/);
  // backfill SET แค่สองคอลัมน์ใหม่ — trigger UPDATE เดิม (ผูกคอลัมน์ทุกตัว) ไม่ทำงาน
  const set = CODE.slice(backfill, CODE.indexOf('FROM ordered, base'));
  assert.deepEqual([...set.matchAll(/"([A-Za-z]+)" =/g)].map((m) => m[1]), ['changeSeq', 'changedAt']);
});

test('0438: ร่องรอยใบที่ถูกลบ — เฉพาะ pipeline ในสถานะที่ส่งออก · เลขจาก sequence เดียวกัน', () => {
  assert.match(CODE, /AFTER DELETE ON public\.sales_orders\s+FOR EACH ROW EXECUTE FUNCTION public\.sales_orders_record_delete\(\);/);
  assert.match(CODE, /IF OLD\.origin = 'pipeline' AND OLD\.status IN \('approved', 'approval_revoked', 'revised', 'cancelled'\) THEN/);
  assert.match(CODE, /VALUES \(nextval\('public\.sales_orders_change_seq'\), OLD\."orderNumber"/);
});

test('0438: ตารางใหม่ปิด anon/authenticated ชัด ๆ + RLS · คีย์เก็บแค่ hash · ไม่มี policy', () => {
  for (const t of ['api_clients', 'sales_orders_deleted', 'api_client_calls']) {
    assert.match(CODE, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
    assert.match(CODE, new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM anon, authenticated;`), t);
  }
  assert.doesNotMatch(CODE, /CREATE POLICY/);
  assert.match(CODE, /"keyHash"\s+text NOT NULL CHECK \("keyHash" ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.doesNotMatch(CODE, /"secret"|"token"/);
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.sales_orders_stamp_change\(\) FROM PUBLIC, anon, authenticated;/);
});

test('0438: ทรานแซกชันเดียว · SELECT ตรวจอยู่หลัง COMMIT', () => {
  assert.equal(CODE.split('\nBEGIN;').length - 1, 1);
  assert.equal(CODE.split('\nCOMMIT;').length - 1, 1);
  assert.ok(CODE.indexOf('AS seq_ok') > CODE.indexOf('\nCOMMIT;'));
});

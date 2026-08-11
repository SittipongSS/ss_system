// เลขที่คำร้อง — ออกใหม่เฉพาะใบที่ยังไม่เคยส่ง
//
// ⚠️ เทสต์ชุดนี้เกิดจากบั๊กจริง (IS-26080010): ใบที่ถูกตีกลับส่งซ้ำไม่ได้เพราะ
// เส้นทางกดส่งออกเลขใหม่ทุกครั้ง แล้วชน trigger ที่ห้ามแก้ `docNo`
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRequestDocNo, generateRequestDocNo } from './docNo.js';

// supabase ปลอมที่นับว่ามีการยิง RPC กี่ครั้ง — จุดสำคัญของบั๊กนี้คือ "ยิงหรือไม่ยิง"
// ไม่ใช่แค่ค่าที่คืน (RPC เพิ่มตัวนับแบบ atomic ⇒ ยิงเปล่า = เลขหายจากระบบหนึ่งเลข)
function fakeSupabase(nextNo = 7) {
  const calls = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      return { data: nextNo, error: null };
    },
  };
}

const AUG = new Date('2026-08-11T09:00:00Z');

test('ใบใหม่ที่ยังไม่มีเลข — ออกเลขใหม่ตาม scope ของหัวข้อ', async () => {
  const supabase = fakeSupabase(7);
  const docNo = await ensureRequestDocNo(supabase, { kind: 'info', dept: 'RD' }, AUG);

  assert.equal(docNo, 'RQ-26080007');
  assert.equal(supabase.calls.length, 1, 'ต้องยิง next_entity_number หนึ่งครั้ง');
  assert.equal(supabase.calls[0].fn, 'next_entity_number');
});

test('ใบที่ถูกตีกลับ (draft ที่มีเลขแล้ว) — ใช้เลขเดิม ไม่ยิงตัวนับซ้ำ', async () => {
  const supabase = fakeSupabase(99);
  const bounced = {
    kind: 'info', dept: 'RD', status: 'draft',
    docNo: 'RQ-26080029',
    submittedAt: '2026-08-10T12:23:41.938+00:00',
    bouncedAt: '2026-08-11T08:03:29.826+00:00',
  };

  const docNo = await ensureRequestDocNo(supabase, bounced, AUG);

  // เลขเปลี่ยน = UPDATE ชน `dept_request_doc_no_immutable` ⇒ กดส่งไม่ได้ตลอดกาล
  assert.equal(docNo, 'RQ-26080029');
  // ยิงตัวนับ = เลขถูกกินทิ้งทุกครั้งที่ผู้ใช้กดส่งซ้ำ (ของจริง: RQ วิ่งไป 37 ทั้งที่ออกจริงถึง 29)
  assert.equal(supabase.calls.length, 0, 'ห้ามยิง next_entity_number ซ้ำ');
});

test('ตีกลับแล้วส่งซ้ำหลายรอบ ก็ยังเป็นใบเดิมเลขเดิม', async () => {
  const supabase = fakeSupabase(50);
  const row = { kind: 'scent_dev', dept: 'RD', docNo: 'SB-26080003' };

  const first = await ensureRequestDocNo(supabase, row, AUG);
  const second = await ensureRequestDocNo(supabase, row, AUG);

  assert.equal(first, 'SB-26080003');
  assert.equal(second, 'SB-26080003');
  assert.equal(supabase.calls.length, 0);
});

test('หัวข้อที่ไม่มี scope ของตัวเอง ตกไปที่ฝ่าย (PC ⇒ PM · ที่เหลือ ⇒ RM)', async () => {
  assert.equal(
    await generateRequestDocNo(fakeSupabase(3), 'ไม่รู้จัก', 'PC', AUG),
    'PM-26080003',
  );
  assert.equal(
    await generateRequestDocNo(fakeSupabase(3), 'ไม่รู้จัก', 'RD', AUG),
    'RM-26080003',
  );
});

test('RPC พัง = โยนข้อความไทย ไม่ปล่อยข้อความดิบของ postgres', async () => {
  const supabase = {
    async rpc() { return { data: null, error: { message: 'permission denied' } }; },
  };
  await assert.rejects(
    () => ensureRequestDocNo(supabase, { kind: 'info', dept: 'RD' }, AUG),
    /ออกเลขที่คำร้องไม่สำเร็จ/,
  );
});

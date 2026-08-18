// เลขที่คำร้อง — ออกพร้อมบันทึกแถวในทรานแซกชันเดียว (mig 0243)
//
// ⚠️ เทสต์ชุดนี้เกิดจากบั๊กจริง (IS-26080010): ใบที่ถูกตีกลับส่งซ้ำไม่ได้เพราะ
// เส้นทางกดส่งออกเลขใหม่ทุกครั้ง แล้วชน trigger ที่ห้ามแก้ `docNo` · ระหว่างทาง
// ตัวนับ RQ เดือน 2608 วิ่งไปถึง 37 ทั้งที่เลขที่ออกจริงสูงสุดคือ RQ-26080029
//
// ⚠️ การตัดสิน "ใบนี้มีเลขแล้วหรือยัง" ย้ายไปอยู่ใน SQL ใต้ `SELECT … FOR UPDATE` แล้ว
// (สองคนกดส่งพร้อมกันต้องไม่ได้คนละเลขบนใบเดียวกัน — เช็คฝั่ง JS ทำแบบนั้นไม่ได้)
// ฝั่งนี้จึงเหลือหน้าที่เดียว: ส่งชิ้นส่วนของเลขให้ถูก และ **ไม่ยัด docNo ไปเอง**
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRequestDocNo, insertRequestWithDocNo, requestDocNoParts } from './docNo.js';

function fakeSupabase() {
  const calls = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      return { data: { docNo: 'RQ-26080007' }, error: null };
    },
  };
}

const AUG = new Date('2026-08-11T09:00:00Z');

test('scope มาจากทะเบียนหัวข้อที่เดียว — ไม่มีค่าเดาจากฝ่ายแล้ว (ม-135)', () => {
  assert.deepEqual(requestDocNoParts('info', 'RD', AUG), {
    scope: 'RQ', month: '2608', prefix: 'RQ-2608', width: 4,
  });
  // ขอเอกสารสองสายแยกคำนำหน้ากัน (มติผู้ใช้ 2026-08-18)
  assert.equal(requestDocNoParts('document', 'RD', AUG).prefix, 'DC-2608');
  assert.equal(requestDocNoParts('billing_doc', 'FN', AUG).prefix, 'DF-2608');
  /* 🐞 เดิมหัวข้อที่ไม่รู้จักตกไปเป็น `PM-`/`RM-` ตามฝ่าย (ซากยุคขอราคาวัสดุ) ⇒
     ลืมประกาศ scope แล้วได้เลขคำนำหน้าผิดเงียบ ๆ และเลขที่ออกไปแล้วแก้ไม่ได้
     ⇒ ตอนนี้โยนทิ้งตั้งแต่ประกอบเลข ไม่ปล่อยไปให้ SQL ตายตอนผู้ใช้กดส่ง */
  assert.throws(() => requestDocNoParts('ไม่รู้จัก', 'PC', AUG), /ไม่มี scope/);
  assert.throws(() => requestDocNoParts('ไม่รู้จัก', 'RD', AUG), /ไม่มี scope/);
});

test('กดส่ง: ยิงฟังก์ชันเดียวพร้อม patch — ไม่จองเลขแยกก่อน', async () => {
  const supabase = fakeSupabase();
  const before = { id: 'DR-1', kind: 'info', dept: 'RD' };
  const patch = { status: 'pending', submittedAt: '2026-08-11T09:00:00.000Z' };

  const { data } = await assignRequestDocNo(supabase, before, patch, AUG);

  // ยิงครั้งเดียว = ไม่มีจังหวะที่เลขถูก commit ไปแล้วแต่แถวยังไม่ถูกเขียน
  assert.equal(supabase.calls.length, 1);
  assert.deepEqual(supabase.calls[0], {
    fn: 'assign_dept_request_doc_no',
    args: {
      p_id: 'DR-1', p_scope: 'RQ', p_month: '2608', p_prefix: 'RQ-2608', p_width: 4, p_patch: patch,
    },
  });
  // เลขจริงมาจากฟังก์ชัน ไม่ใช่จากที่ฝั่ง JS เดาไว้
  assert.equal(data.docNo, 'RQ-26080007');
  // patch ต้องไม่มีคีย์ docNo ติดไป — ใบที่ถูกตีกลับยังถือเลขเดิม การส่ง docNo ไปเอง
  // คือทางเดียวที่จะไปชน dept_request_doc_no_immutable อีก
  assert.equal('docNo' in supabase.calls[0].args.p_patch, false);
});

test('เปิดแล้วส่งในจังหวะเดียว: แถวที่ส่งไปต้องไม่มีคีย์ docNo', async () => {
  const supabase = fakeSupabase();
  const row = { id: 'DR-2', kind: 'material_eta', dept: 'PC', status: 'pending' };

  await insertRequestWithDocNo(supabase, row, AUG);

  assert.equal(supabase.calls[0].fn, 'create_dept_request_with_doc_no');
  // material_eta ส่งเข้าฝ่าย PC แต่ scope มาจาก **หัวข้อ** จึงเป็น RQ ไม่ใช่ PM
  // (PM/RM เป็น fallback ของหัวข้อที่ไม่ได้ประกาศ scope ไว้เท่านั้น)
  assert.equal(supabase.calls[0].args.p_prefix, 'RQ-2608');
  assert.equal(supabase.calls[0].args.p_width, 4);
  assert.equal('docNo' in supabase.calls[0].args.p_row, false);
});

test('error ส่งกลับตามเดิม ไม่กลืน — ผู้เรียกยังแปลเป็น HTTP status เองได้', async () => {
  const supabase = { async rpc() { return { data: null, error: { message: 'permission denied' } }; } };
  const { data, error } = await assignRequestDocNo(supabase, { id: 'DR-3', kind: 'info', dept: 'RD' }, {}, AUG);
  assert.equal(data, null);
  assert.equal(error.message, 'permission denied');
});

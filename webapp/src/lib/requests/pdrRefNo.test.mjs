// เลขที่เอกสาร PDR — DDMMYY-XXX (mig 0271)
//
// ⚠️ สองอย่างที่เทสต์ชุดนี้กันไว้เพราะพลาดแล้วเห็นยากบนกระดาษ:
//   · **YY เป็น พ.ศ.** — เขียน `YY` เฉย ๆ ได้ 26 ซึ่งอ่านเหมือนปีเดียวกับ `docNo`
//     (SB-2608xxxx ใช้ ค.ศ.) แล้วไม่มีใครสังเกตจนเทียบกับกระดาษเดิม
//   · **วันตัดตามเวลาไทย** — ใบที่รับเรื่องหลังห้าโมงเย็น UTC เป็นวันถัดไปที่ไทย
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignPdrRefNo, pdrRefNoError, pdrRefNoParts, issuesPdrRefNoOnAcknowledge,
} from './pdrRefNo.js';

test('รูปแบบเลข: DDMMYY (พ.ศ.) + ตัวนับรายเดือน', () => {
  assert.deepEqual(pdrRefNoParts(new Date('2026-08-20T09:00:00Z')), {
    month: '2608', prefix: '200869-', like: '__0869-%', width: 3,
  });
});

test('วันตัดตามเวลาไทย ไม่ใช่ UTC', () => {
  // 2026-08-20 17:30Z = 21 ส.ค. 00:30 ที่กรุงเทพ
  assert.equal(pdrRefNoParts(new Date('2026-08-20T17:30:00Z')).prefix, '210869-');
});

test('ข้ามปี: พ.ศ. เดินตาม ค.ศ. และตัวนับขึ้นเดือนใหม่', () => {
  assert.deepEqual(pdrRefNoParts(new Date('2026-12-31T09:00:00Z')), {
    month: '2612', prefix: '311269-', like: '__1269-%', width: 3,
  });
  assert.deepEqual(pdrRefNoParts(new Date('2027-01-01T09:00:00Z')), {
    month: '2701', prefix: '010170-', like: '__0170-%', width: 3,
  });
});

test('ส่งชิ้นส่วนให้ SQL ออกเลข — ไม่ประกอบเลขเองแล้วส่งไปเขียน', async () => {
  const calls = [];
  const supabase = {
    async rpc(fn, args) { calls.push({ fn, args }); return { data: {}, error: null }; },
  };
  const patch = { status: 'acknowledged', updatedAt: '2026-08-20T09:00:00.000Z' };
  await assignPdrRefNo(supabase, 'DR-1', patch, new Date('2026-08-20T09:00:00Z'));
  assert.deepEqual(calls, [{
    fn: 'assign_pdr_ref_no',
    args: {
      p_id: 'DR-1',
      p_month: '2608',
      p_prefix: '200869-',
      p_like: '__0869-%',
      p_width: 3,
      p_patch: patch,
    },
  }]);
  // เลขจริงประกอบใน SQL — ส่งไปเองเมื่อไรก็กินเลขทุกครั้งที่ UPDATE ไม่ผ่าน
  assert.equal('pdrRefNo' in calls[0].args.p_patch, false);
});

test('ด่านออกเลขย้อนหลัง: ต้องรับเรื่องแล้ว · ยังไม่มีเลข · เป็นหัวข้อที่มี PDR', () => {
  const acked = { kind: 'scent_dev', acknowledgedAt: '2026-08-20T09:00:00Z' };
  assert.equal(pdrRefNoError(acked), null);
  assert.match(pdrRefNoError({ kind: 'scent_dev' }), /ยังไม่ได้รับเรื่อง/);
  assert.match(pdrRefNoError({ ...acked, pdrRefNo: '200869-016' }), /มีเลขที่เอกสารแล้ว/);
  assert.match(pdrRefNoError({ kind: 'info', acknowledgedAt: '2026-08-20T09:00:00Z' }), /ไม่มีแบบฟอร์ม PDR/);
});

test('ใบที่เดินไปไกลแล้วยังออกเลขย้อนหลังได้ (ยึด acknowledgedAt ไม่ใช่ status)', () => {
  assert.equal(pdrRefNoError({
    kind: 'scent_dev', status: 'closed', acknowledgedAt: '2026-07-02T09:00:00Z',
  }), null);
});

test('รับเรื่อง: ออกเลขเฉพาะหัวข้อที่มี PDR และยังไม่มีเลข', () => {
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'scent_dev' }), true);
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'info' }), false);
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'scent_dev', pdrRefNo: '200869-016' }), false);
});

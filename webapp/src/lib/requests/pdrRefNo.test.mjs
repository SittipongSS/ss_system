// เลขที่เอกสาร PDR — DDMMYY-XXX (mig 0271)
//
// ⚠️ สองอย่างที่เทสต์ชุดนี้กันไว้เพราะพลาดแล้วเห็นยากบนกระดาษ:
//   · **YY เป็น พ.ศ.** — เขียน `YY` เฉย ๆ ได้ 26 ซึ่งอ่านเหมือนปีเดียวกับ `docNo`
//     (SB-2608xxxx ใช้ ค.ศ.) แล้วไม่มีใครสังเกตจนเทียบกับกระดาษเดิม
//   · **วันตัดตามเวลาไทย** — ใบที่รับเรื่องหลังห้าโมงเย็น UTC เป็นวันถัดไปที่ไทย
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDR_REF_AUTO_FROM_MONTH, assignPdrRefNo, canEditPdrRefManual, issuesPdrRefNoOnAcknowledge,
  normalizePdrRefNo, pdrRefManualError, pdrRefMode, pdrRefNoError, pdrRefNoParts,
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

// ── ช่วงเปลี่ยนผ่าน: เดือนนี้กรอกเอง เดือนหน้าระบบออกให้ (มติผู้ใช้ 2026-08-20) ──
//
// ⚠️ เกณฑ์คือ **เดือนของ `acknowledgedAt` ของใบ ไม่ใช่วันที่ตอนกด** — ยึดวันที่ตอนกด
// เมื่อไร ใบเดือน ส.ค. ที่ยังไม่ได้กรอกจะค้างไม่มีเลขถาวรตั้งแต่ 1 ก.ย.
const AUG = { kind: 'scent_dev', acknowledgedAt: '2026-08-20T09:00:00Z' };
const SEP = { kind: 'scent_dev', acknowledgedAt: '2026-09-02T09:00:00Z' };

test('เดือนตัดรอบอยู่ที่ค่าเดียว และแบ่งใบเป็นสองโหมด', () => {
  assert.equal(PDR_REF_AUTO_FROM_MONTH, '2609');
  assert.equal(pdrRefMode(AUG), 'manual');
  assert.equal(pdrRefMode(SEP), 'auto');
  // ยังไม่รับเรื่อง = ยังไม่มีวันให้ตัดสิน
  assert.equal(pdrRefMode({ kind: 'scent_dev' }), null);
});

test('รับเรื่องปลายเดือน ส.ค. ตามเวลาไทยยังเป็นโหมดกรอกเอง', () => {
  // 2026-08-31 17:30Z = 1 ก.ย. 00:30 ที่กรุงเทพ ⇒ ข้ามไปโหมดออโต้แล้ว
  assert.equal(pdrRefMode({ kind: 'scent_dev', acknowledgedAt: '2026-08-31T17:30:00Z' }), 'auto');
  assert.equal(pdrRefMode({ kind: 'scent_dev', acknowledgedAt: '2026-08-31T16:00:00Z' }), 'manual');
});

test('ด่านออกเลขอัตโนมัติย้อนหลัง: ต้องรับเรื่องแล้ว · ยังไม่มีเลข · มี PDR · อยู่โหมดออโต้', () => {
  assert.equal(pdrRefNoError(SEP), null);
  assert.match(pdrRefNoError({ kind: 'scent_dev' }), /ยังไม่ได้รับเรื่อง/);
  assert.match(pdrRefNoError({ ...SEP, pdrRefNo: '020969-001' }), /มีเลขที่เอกสารแล้ว/);
  assert.match(pdrRefNoError({ kind: 'info', acknowledgedAt: SEP.acknowledgedAt }), /ไม่มีแบบฟอร์ม PDR/);
  // 🪤 ตัวสำคัญที่สุด — ใบเดือน ส.ค. ห้ามออกอัตโนมัติ เพราะตัวนับเดือน 2608 ไม่เคย
  // ถูกใช้ (เดือนนั้นกรอกมือล้วน) ⇒ ปล่อยให้ออกจะได้เลขที่ RD พิมพ์ไปแล้วบนกระดาษ
  assert.match(pdrRefNoError(AUG), /ต้องกรอกเลขเอง/);
});

test('ใบที่เดินไปไกลแล้วยังออกเลขย้อนหลังได้ (ยึด acknowledgedAt ไม่ใช่ status)', () => {
  assert.equal(pdrRefNoError({
    kind: 'scent_dev', status: 'closed', acknowledgedAt: '2026-10-02T09:00:00Z',
  }), null);
});

test('รับเรื่อง: ออกเลขให้เองเฉพาะตั้งแต่เดือนตัดรอบเป็นต้นไป', () => {
  const sep = new Date('2026-09-02T09:00:00Z');
  const aug = new Date('2026-08-20T09:00:00Z');
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'scent_dev' }, sep), true);
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'scent_dev' }, aug), false);
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'info' }, sep), false);
  assert.equal(issuesPdrRefNoOnAcknowledge({ kind: 'scent_dev', pdrRefNo: '020969-001' }, sep), false);
});

test('กรอกเอง: บังคับรูปแบบ DDMMYY-XXX แต่ไม่บังคับว่าวันต้องตรงกับวันที่รับเรื่อง', () => {
  // ลอกเลขจากกระดาษที่ลงวันคนละวันกับที่ระบบบันทึก — ต้องผ่าน
  assert.equal(pdrRefManualError(AUG, '170869-016'), null);
  assert.match(pdrRefManualError(AUG, ''), /กรุณากรอก/);
  assert.match(pdrRefManualError(AUG, 'FM-RD-01-170869-016'), /DDMMYY-XXX/);
  assert.match(pdrRefManualError(AUG, '170869-16'), /DDMMYY-XXX/);
  assert.match(pdrRefManualError(SEP, '020969-001'), /ระบบออกเลขให้เอง/);
  assert.match(pdrRefManualError({ kind: 'scent_dev' }, '170869-016'), /ยังไม่ได้รับเรื่อง/);
});

test('กรอกเอง: เลขไทยแปลงให้เงียบ ๆ (พิมพ์บนแป้นไทยแล้วมองไม่ออกว่าต่างตรงไหน)', () => {
  assert.equal(normalizePdrRefNo('  ๒๐๐๘๖๙-๐๑๖ '), '200869-016');
  assert.equal(pdrRefManualError(AUG, '๒๐๐๘๖๙-๐๑๖'), null);
});

test('กรอกเอง: ใบที่ปิด/ยกเลิกแล้วแก้เลขเดิมไม่ได้ แต่ใบที่ยังไม่เคยมีเลขยังกรอกได้', () => {
  const closed = { ...AUG, status: 'closed' };
  assert.match(pdrRefManualError({ ...closed, pdrRefNo: '170869-016' }, '170869-017'), /ปิดแล้ว/);
  // 🪤 ใบเก่าที่ปิดไปแล้วโดยไม่เคยมีเลข ยังต้องกรอกได้ — ไม่งั้นเอกสารของใบนั้น
  // ไม่มีวันมีเลขเลย ทั้งที่กระดาษจริงมี
  assert.equal(pdrRefManualError(closed, '170869-016'), null);
});

test('ปุ่มเขียนว่า "แก้" เฉพาะเลขที่กรอกเองและใบยังไม่จบ', () => {
  assert.equal(canEditPdrRefManual({ pdrRefManual: true, status: 'acknowledged' }), true);
  assert.equal(canEditPdrRefManual({ pdrRefManual: true, status: 'closed' }), false);
  // เลขที่ระบบออกให้ล็อกทันที ไม่ว่าใบจะเดินไปถึงไหน
  assert.equal(canEditPdrRefManual({ pdrRefManual: false, status: 'acknowledged' }), false);
  assert.equal(canEditPdrRefManual({ status: 'acknowledged' }), false);
});

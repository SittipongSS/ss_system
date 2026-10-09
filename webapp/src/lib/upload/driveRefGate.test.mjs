// ── ด่านที่มาของไฟล์ Drive สำหรับเธรดอัปเดต/นัดช่าง (รอบสองของมติเจ้าของ 08/10/2569) ───────────────────────────
//
// 🐞 เธรดอัปเดตกับนัดช่างเคยรับ `driveFileId` / ลิงก์ Drive จาก client ทั้งดุ้น แล้ว proxy อ่านไฟล์สตรีมตาม id ที่เก็บไว้ ⇒
//    ส่ง id ของไฟล์คนอื่นมาแล้วเปิดอ่านผ่านข้อความ/นัดของตัวเองได้ · เทสต์ชุดนี้ล็อกแปดขั้นของด่าน **และลำดับของมัน**
//    (ตัวที่อยู่บนแถวเดิมไม่ถามฐาน · รูปร่างผิดไม่ถามฐาน · ตัวแรกที่ไม่ผ่านหยุดทั้งวง) กับลิงก์สองหน้าทุกแบบที่รู้จัก
// ⚠️ ตัวถามใบรับเป็นตัวปลอมล้วน — ไม่แตะฐานจริง · ตรรกะของใบรับเองรันจริงที่ receipts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FILE_REF_ERROR_CODE, REF_IN_USE_TEXT, REF_SHAPE_TEXT, claimDriveRefs, strictDriveId, verifyDriveRefs,
} from './driveRefGate.js';
import { parseDriveId } from '../driveId.js';
import { requireUploadReceipt } from './receipts.js';

const A = '1AbC_def-123456789';
const B = '1ZyX_wvu-987654321';
const C = '1QqQ_rst-555555555';
const ME = 'user-me';
const SUPABASE = { fake: true };
const view = (id) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
const ref = (id, over = {}) => ({ driveFileId: id, fileUrl: view(id), ...over });
const receipt = (id, over = {}) => ({
  driveFileId: id, userId: ME, createdAt: '2026-10-08T04:59:00.000Z', claimedBy: null, claimedAt: null, ...over,
});
const OWN = (id, over) => ({ ok: true, reason: null, receipt: receipt(id, over) });
const MISSING = { ok: false, reason: 'missing', receipt: null };
const UNVERIFIABLE = { ok: false, reason: 'unverifiable', receipt: null };
const FOREIGN = (id, over) => ({ ok: false, reason: 'foreign', receipt: receipt(id, { userId: 'user-other', ...over }) });
const EXPIRED = (id, over) => ({ ok: false, reason: 'expired', receipt: receipt(id, over) });

/* ตัวปลอมของสองตัวถามใบรับ — `statuses` = ผลต่อ id · ตัวตัดสินเลียนของจริง (ok = ผ่าน · unverifiable = 503 · อื่น = 400)
   `observe: true` = สวิตช์ฉุกเฉินเปิด (ปล่อยผ่านทุกเหตุยกเว้น invalid) · จดทุกการเรียกตามลำดับ */
function fakeReceipts(statuses = {}, { observe = false } = {}) {
  const calls = [];
  return {
    calls,
    lookups: () => calls.filter((c) => c.op === 'status').map((c) => c.driveFileId),
    deps: {
      uploadReceiptStatus: async (supabase, args) => {
        calls.push({ op: 'status', supabase, ...args });
        if (!args.userId) return { ok: false, reason: 'invalid', receipt: null };
        return statuses[args.driveFileId] || MISSING;
      },
      requireUploadReceipt: async (supabase, args) => {
        calls.push({ op: 'require', supabase, ...args });
        const verdict = args.status;
        if (verdict.ok) return null;
        const rejection = verdict.reason === 'unverifiable'
          ? { status: 503, error: 'ตรวจไม่ได้' }
          : { status: 400, error: 'ไม่มีใบรับ' };
        if (verdict.reason === 'invalid') return rejection;
        return observe ? null : rejection;
      },
    },
  };
}

// ── strictDriveId ───────────────────────────────────────────────────────────────────────────────────────────

test('strictDriveId: ลิงก์ Drive จริงทุกรูปได้ id เดียวกับ parseDriveId', () => {
  const links = [
    `https://drive.google.com/file/d/${A}/view?usp=drivesdk`,
    `https://drive.google.com/file/d/${A}/view`,
    `https://drive.google.com/file/d/${A}`,
    `https://docs.google.com/document/d/${A}/edit`,
    `https://docs.google.com/spreadsheets/d/${A}/edit#gid=0`,
    `https://drive.google.com/open?id=${A}`,
    `https://drive.google.com/uc?id=${A}&export=download`,
    `https://drive.google.com/uc?export=download&id=${A}`,
  ];
  for (const link of links) {
    assert.equal(strictDriveId(link), A, link);
    assert.equal(parseDriveId(link), A, link);
  }
});

test('🔴 strictDriveId: host ที่ไม่ใช่ของ Google · ไม่ใช่ https · user:pass@ · พอร์ต = null', () => {
  const links = [
    `https://evil.example/file/d/${A}/view`,
    `https://drive.google.com.evil.example/file/d/${A}/view`,
    `https://drive.google.com@evil.example/file/d/${A}`,
    `https://user@drive.google.com/file/d/${A}/view`,
    `https://user:pw@drive.google.com/file/d/${A}/view`,
    `https://drive.google.com:8443/file/d/${A}/view`,
    `http://drive.google.com/file/d/${A}/view`,
    `//drive.google.com/file/d/${A}/view`,
    `/file/d/${A}/view`,
    `javascript:alert(1)//drive.google.com/file/d/${A}/view`,
    `javascript:location='https://drive.google.com/file/d/${A}/view'`,
    `data:text/html,https://drive.google.com/file/d/${A}/view`,
    `blob:https://drive.google.com/file/d/${A}`,
    '',
    'ไม่ใช่ลิงก์',
  ];
  for (const link of links) assert.equal(strictDriveId(link), null, link);
});

test('🔴 strictDriveId: ลิงก์สองหน้า — id สองตัวในลิงก์เดียว = null ทุกแบบ', () => {
  const links = [
    // ด่านที่อ่าน `id` เห็นไฟล์เหยื่อ ตัวอ่านแบบ regex หยิบ /d/ ก่อน เห็นไฟล์ตัวเอง
    `https://drive.google.com/open?id=${A}&x=/d/${B}`,
    `https://drive.google.com/open?x=/d/${B}&id=${A}`,
    `https://drive.google.com/open?id=${A}#/d/${B}`,
    `https://drive.google.com/open?id=${A}#x=/d/${B}/view`,
    // ทั้งสองรูปพร้อมกัน
    `https://drive.google.com/file/d/${A}/view?id=${B}`,
    `https://drive.google.com/file/d/${A}/view?id=${A}`,
    // /d/ สองช่วงใน pathname
    `https://drive.google.com/file/d/${A}/d/${B}/view`,
    `https://drive.google.com/d/short/file/d/${A}/view`,
    // id สองตัวใน query
    `https://drive.google.com/open?id=${A}&id=${B}`,
    // /d/ ใน query แม้ id ใน pathname จะเป็นตัวเดียว
    `https://drive.google.com/file/d/${A}/view?next=/d/${B}`,
    `https://drive.google.com/file/d/${A}/view#/d/${B}`,
  ];
  for (const link of links) assert.equal(strictDriveId(link), null, link);
});

test('🔴 strictDriveId: ลิงก์ที่ตัวแกะสองตัวเห็นไม่ตรงกัน หรือไม่มี id ที่ใช้ได้ = null', () => {
  const links = [
    `https://drive.google.com/file/d/${A}!x/view`, // regex ตัดที่ ! ได้ id ส่วนหน้า แต่ช่วงของ pathname ไม่ใช่ id
    `https://drive.google.com/file/d/${A}%2F..%2F${B}/view`,
    `https://drive.google.com\\file\\d\\${A}\\view`, // URL แปลง \ เป็น / แต่ตัวอ่านแบบ regex ไม่เห็น /d/
    'https://drive.google.com/file/d/short/view', // สั้นกว่าที่ตัวอ่านยอมรับ
    'https://drive.google.com/open?id=short',
    `https://drive.google.com/file/d/${'a'.repeat(201)}/view`,
    'https://drive.google.com/file/d//view',
    'https://drive.google.com/file/d',
    'https://drive.google.com/open?id=',
    'https://drive.google.com/drive/folders/',
    'https://drive.google.com/',
    `https://drive.google.com/open?ID=${A}`,
    `https://drive.google.com/open?id=${A}%20`,
  ];
  for (const link of links) assert.equal(strictDriveId(link), null, link);
});

test('strictDriveId: ทุกลิงก์ที่ผ่าน ตัวอ่าน (parseDriveId) ต้องเห็นไฟล์ใบเดียวกัน — ไล่ทั้งชุดดี/ร้าย', () => {
  const corpus = [
    view(A), `https://drive.google.com/open?id=${A}`, `https://drive.google.com/open?id=${A}&x=/d/${B}`,
    `https://drive.google.com/file/d/${A}/view?id=${B}`, `https://drive.google.com/open?id=${A}#/d/${B}`,
    `https://docs.google.com/document/d/${A}/edit?tab=t.0#heading=h.1`, `https://drive.google.com/uc?id=${A}&export=download`,
  ];
  for (const link of corpus) {
    const id = strictDriveId(link);
    if (id !== null) assert.equal(parseDriveId(link), id, link);
  }
});

test('strictDriveId: ค่าที่ไม่ใช่ตัวหนังสือ = null ไม่ throw', () => {
  const url = new URL(view(A));
  for (const value of [undefined, null, 0, 42, true, {}, [], [view(A)], url, { toString: () => view(A) }, Symbol('x')]) {
    assert.equal(strictDriveId(value), null);
  }
  // ส่งเข้า map ได้ (อาร์กิวเมนต์ที่สอง/สามของ map ต้องไม่เปลี่ยนผล)
  assert.deepEqual([view(A), 'x', view(B)].map(strictDriveId), [A, null, B]);
});

// ── verifyDriveRefs ─────────────────────────────────────────────────────────────────────────────────────────

test('verifyDriveRefs: ชุดว่าง = ผ่าน ไม่ถามฐาน', async () => {
  const fake = fakeReceipts();
  assert.deepEqual(await verifyDriveRefs(SUPABASE, { refs: [], userId: ME }, fake.deps), { claimable: [] });
  assert.equal(fake.calls.length, 0);
});

test('🔴 verifyDriveRefs: refs ไม่ใช่ array / มีตัวที่ไม่ใช่ object = 400 ไม่ถามฐาน (ไม่กลายเป็น "ไม่มีอะไรให้ตรวจ")', async () => {
  for (const refs of [undefined, null, 'x', { driveFileId: A }, 3]) {
    const fake = fakeReceipts({ [A]: OWN(A) });
    const out = await verifyDriveRefs(SUPABASE, { refs, userId: ME }, fake.deps);
    assert.deepEqual(out, { error: { status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE, index: -1 } });
    assert.equal(fake.calls.length, 0);
  }
  for (const bad of [null, undefined, A, 7, false]) {
    const fake = fakeReceipts({ [A]: OWN(A) });
    const out = await verifyDriveRefs(SUPABASE, { refs: [bad], userId: ME }, fake.deps);
    assert.equal(out.error.status, 400);
    assert.equal(out.error.error, REF_SHAPE_TEXT);
    assert.equal(out.error.index, 0);
    assert.equal(fake.calls.length, 0);
  }
  const noArgs = await verifyDriveRefs(SUPABASE);
  assert.equal(noArgs.error.status, 400);
});

test('🔴 ขั้น ①: driveFileId ไม่ใช่ตัวหนังสือ/หลุดรูป = 400 พร้อม code ไม่ถามฐาน — แม้อยู่ใน storedIds', async () => {
  const bads = [undefined, null, '', 123, [A], { id: A }, `${A},x`, `${A})`, 'a.b', 'มีไทย', 'a'.repeat(201), ` ${A}`];
  for (const bad of bads) {
    const fake = fakeReceipts();
    const out = await verifyDriveRefs(SUPABASE, {
      refs: [{ driveFileId: bad }], userId: ME, storedIds: new Set([bad]),
    }, fake.deps);
    assert.deepEqual(out, { error: { status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE, index: 0 } }, String(bad));
    assert.equal(fake.calls.length, 0, String(bad));
  }
});

test('🔴 ขั้น ②: fileUrl ที่ไม่ได้ชี้ไฟล์ใบเดียวกับ driveFileId = 400 ไม่ถามฐาน — แม้อยู่ใน storedIds', async () => {
  const urls = [
    view(B), // คนละไฟล์
    `https://evil.example/file/d/${A}/view`, // host อื่น
    `https://drive.google.com/open?id=${A}&x=/d/${B}`, // สองหน้า
    `https://drive.google.com/file/d/${A}/view?id=${B}`,
    'https://drive.google.com/drive/folders/', // ไม่มี id
    '', 0, false, {}, [view(A)], // "มี" แต่ไม่ใช่ลิงก์
  ];
  for (const fileUrl of urls) {
    const fake = fakeReceipts({ [A]: OWN(A) });
    const out = await verifyDriveRefs(SUPABASE, {
      refs: [{ driveFileId: A, fileUrl }], userId: ME, storedIds: new Set([A]),
    }, fake.deps);
    assert.deepEqual(out, { error: { status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE, index: 0 } }, String(fileUrl));
    assert.equal(fake.calls.length, 0, String(fileUrl));
  }
});

test('ขั้น ②: ไม่ส่ง fileUrl (undefined/null) = ข้ามขั้นนี้ · ลิงก์ทุกรูปของไฟล์เดียวกันผ่าน', async () => {
  const fake = fakeReceipts({ [A]: OWN(A), [B]: OWN(B), [C]: OWN(C) });
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [
      { driveFileId: A },
      { driveFileId: B, fileUrl: null },
      { driveFileId: C, fileUrl: `https://drive.google.com/open?id=${C}` },
    ],
    userId: ME,
  }, fake.deps);
  assert.deepEqual(out, { claimable: [A, B, C] });
});

test('🔴 ขั้น ③: id ที่อยู่บนแถวเดิม (storedIds) ผ่านโดยไม่ถามฐาน ไม่ประทับ — แม้ไม่มีใบรับและไม่มีผู้ใช้', async () => {
  const fake = fakeReceipts({});
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A), ref(B)], userId: undefined, storedIds: new Set([A, B]), refuseClaimed: true, ownClaim: 'service_visits:V1',
  }, fake.deps);
  assert.deepEqual(out, { claimable: [] });
  assert.equal(fake.calls.length, 0);
});

test('ขั้น ③: ตัวที่อยู่บนแถวเดิมส่งซ้ำได้ (ไม่นับเป็น id ซ้ำ) · ไม่ส่ง storedIds / ส่งของที่ไม่ใช่ Set = ไม่มีตัวเดิม', async () => {
  const kept = fakeReceipts({ [B]: OWN(B) });
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A), ref(A), ref(B)], userId: ME, storedIds: new Set([A]),
  }, kept.deps);
  assert.deepEqual(out, { claimable: [B] });
  assert.deepEqual(kept.lookups(), [B]);

  for (const storedIds of [undefined, null, [A], { [A]: true }, 'x']) {
    const fake = fakeReceipts({});
    const refused = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME, storedIds }, fake.deps);
    assert.equal(refused.error.status, 400);
    assert.deepEqual(fake.lookups(), [A]);
  }
});

test('🔴 ขั้น ④: id ซ้ำในคำขอเดียวกัน = 400 ที่ตัวที่สอง · ถามฐานแค่ครั้งเดียว (ของตัวแรก)', async () => {
  const fake = fakeReceipts({ [A]: OWN(A), [B]: OWN(B) });
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A), ref(B), { driveFileId: A, fileUrl: `https://drive.google.com/open?id=${A}` }], userId: ME,
  }, fake.deps);
  assert.deepEqual(out, { error: { status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE, index: 2 } });
  assert.deepEqual(fake.lookups(), [A, B]);
});

test('ขั้น ⑤–⑥: ถามใบรับด้วย id + ผู้ใช้ของคำขอ แล้วส่งผลนั้นต่อให้ requireUploadReceipt พร้อม route/logContext', async () => {
  const status = OWN(A);
  const fake = fakeReceipts({ [A]: status });
  const logContext = { entityType: 'deal', entityId: 'D-1', rule: 'thread' };
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A)], userId: ME, route: 'POST /api/updates', logContext,
  }, fake.deps);
  assert.deepEqual(out, { claimable: [A] });
  assert.deepEqual(fake.calls, [
    { op: 'status', supabase: SUPABASE, driveFileId: A, userId: ME },
    { op: 'require', supabase: SUPABASE, driveFileId: A, userId: ME, status, route: 'POST /api/updates', logContext },
  ]);
  // ⚠️ ไม่ส่ง alreadyStored/env/now ให้ตัวตัดสิน — ตัวเดิมถูกตัดที่ขั้น ③ ไปแล้ว และโหมดเป็นเรื่องของตัวตัดสินเอง
  assert.deepEqual(Object.keys(fake.calls[1]).sort(), ['driveFileId', 'logContext', 'op', 'route', 'status', 'supabase', 'userId']);
});

test('🔴 ขั้น ⑥: ไม่มีใบรับ / ของคนอื่น / หมดอายุ = 400 พร้อม code · ข้อความมาจากตัวตัดสิน', async () => {
  for (const status of [MISSING, FOREIGN(A), EXPIRED(A)]) {
    const fake = fakeReceipts({ [A]: status });
    const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME }, fake.deps);
    assert.deepEqual(out, { error: { status: 400, error: 'ไม่มีใบรับ', code: FILE_REF_ERROR_CODE, index: 0 } }, status.reason);
  }
});

test('🔴 ขั้น ⑥: อ่านทะเบียนใบรับไม่ได้ = 503 **ไม่มี code** (ตัวอ้างอิงเดิมลองใหม่แล้วอาจผ่าน — จอต้องไม่ทิ้งไฟล์ที่จำไว้)', async () => {
  const fake = fakeReceipts({ [A]: UNVERIFIABLE });
  const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME, refuseClaimed: true }, fake.deps);
  assert.deepEqual(out, { error: { status: 503, error: 'ตรวจไม่ได้', index: 0 } });
  assert.equal('code' in out.error, false);
});

test('🔴 ไม่มี userId: ไม่แยกทางเอง — ตัวถามใบรับตอบ "ใช้ไม่ได้" แล้วได้ 400 (สวิตช์ฉุกเฉินก็ไม่ผ่อน)', async () => {
  for (const userId of [undefined, null, '']) {
    const fake = fakeReceipts({ [A]: OWN(A) }, { observe: true });
    const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId }, fake.deps);
    assert.equal(out.error.status, 400);
    assert.equal(out.error.code, FILE_REF_ERROR_CODE);
    assert.deepEqual(fake.calls.map((c) => c.op), ['status', 'require']);
  }
});

test('🔴 ลำดับ: ตัวแรกที่ไม่ผ่านหยุดทั้งวง — ตัวหลังไม่ถูกถามฐาน และไม่มี claimable คืนมา', async () => {
  const fake = fakeReceipts({ [A]: OWN(A), [B]: MISSING, [C]: OWN(C) });
  const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A), ref(B), ref(C)], userId: ME }, fake.deps);
  assert.equal(out.error.status, 400);
  assert.equal(out.error.index, 1);
  assert.equal('claimable' in out, false);
  assert.deepEqual(fake.lookups(), [A, B]);

  // รูปร่างผิดที่ตัวที่สอง: ตัวแรกถูกถามไปแล้ว ตัวที่สามไม่ถูกถาม
  const shape = fakeReceipts({ [A]: OWN(A), [C]: OWN(C) });
  const refused = await verifyDriveRefs(SUPABASE, { refs: [ref(A), { driveFileId: 'x,y' }, ref(C)], userId: ME }, shape.deps);
  assert.deepEqual(refused, { error: { status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE, index: 1 } });
  assert.deepEqual(shape.lookups(), [A]);
});

test('🔴 ขั้น ⑤: ใบรับที่ปลายทางนี้เองประทับไว้ (ownClaim) ผ่าน ไม่ประทับซ้ำ ไม่ถึงตัวตัดสิน — แม้เป็นของคนอื่น/หมดอายุ', async () => {
  const mine = 'service_visits:V1';
  for (const status of [OWN(A, { claimedBy: mine }), FOREIGN(A, { claimedBy: mine }), EXPIRED(A, { claimedBy: mine })]) {
    const fake = fakeReceipts({ [A]: status });
    const out = await verifyDriveRefs(SUPABASE, {
      refs: [ref(A)], userId: ME, ownClaim: mine, refuseClaimed: true,
    }, fake.deps);
    assert.deepEqual(out, { claimable: [] }, status.reason || 'own');
    assert.deepEqual(fake.calls.map((c) => c.op), ['status'], status.reason || 'own');
  }
});

test('🔴 ขั้น ⑤: ownClaim ไม่ตรง / ไม่ได้ส่ง / ค่าว่าง ไม่เปิดทางให้ใบรับที่ยังไม่ถูกประทับหรือประทับโดยที่อื่น', async () => {
  // ใบรับของคนอื่นที่นัดอื่นประทับไว้
  const other = fakeReceipts({ [A]: FOREIGN(A, { claimedBy: 'service_visits:V2' }) });
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A)], userId: ME, ownClaim: 'service_visits:V1', refuseClaimed: true,
  }, other.deps);
  assert.equal(out.error.status, 400);
  // ownClaim ว่าง/ไม่ส่ง กับใบรับที่ยังไม่ถูกประทับ (claimedBy null) ต้องไม่ถือว่า "ตรงกัน"
  for (const ownClaim of [undefined, null, '']) {
    const fake = fakeReceipts({ [A]: FOREIGN(A, { claimedBy: ownClaim ?? null }) });
    const refused = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME, ownClaim }, fake.deps);
    assert.equal(refused.error.status, 400, String(ownClaim));
    assert.deepEqual(fake.calls.map((c) => c.op), ['status', 'require']);
  }
});

test('🔴 ขั้น ⑦: refuseClaimed — ใบรับของตัวเองที่ปลายทางอื่นประทับไปแล้ว = 400 REF_IN_USE_TEXT พร้อม code', async () => {
  const fake = fakeReceipts({ [A]: OWN(A, { claimedBy: 'attachments:77' }) });
  const out = await verifyDriveRefs(SUPABASE, {
    refs: [ref(A)], userId: ME, ownClaim: 'service_visits:V1', refuseClaimed: true,
  }, fake.deps);
  assert.deepEqual(out, { error: { status: 400, error: REF_IN_USE_TEXT, code: FILE_REF_ERROR_CODE, index: 0 } });
  // ลำดับ: ตัวตัดสินใบรับถูกถามก่อนขั้นนี้
  assert.deepEqual(fake.calls.map((c) => c.op), ['status', 'require']);
});

test('ขั้น ⑦–⑧: refuseClaimed ไม่เปิด — ใบรับของตัวเองที่ถูกประทับแล้วเก็บได้ แต่ไม่เข้า claimable (ประทับแรกชนะอยู่แล้ว)', async () => {
  const fake = fakeReceipts({ [A]: OWN(A, { claimedBy: 'attachments:77' }), [B]: OWN(B) });
  const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A), ref(B)], userId: ME, refuseClaimed: false }, fake.deps);
  assert.deepEqual(out, { claimable: [B] });
});

test('🔴 ขั้น ⑧: ตัวที่ผ่านเพราะสวิตช์ฉุกเฉินเท่านั้น เก็บได้แต่ไม่เข้า claimable · ตัวที่มีใบรับจริงยังเข้า', async () => {
  const fake = fakeReceipts({ [A]: MISSING, [B]: OWN(B), [C]: FOREIGN(C) }, { observe: true });
  const out = await verifyDriveRefs(SUPABASE, { refs: [ref(A), ref(B), ref(C)], userId: ME, refuseClaimed: true }, fake.deps);
  assert.deepEqual(out, { claimable: [B] });
});

test('🔴 สวิตช์ฉุกเฉินผ่อนได้ขั้น ⑥ ขั้นเดียว — "ใบรับถูกใช้ไปแล้ว" · รูปร่าง · ลิงก์ · id ซ้ำ ยังบังคับ', async () => {
  const claimed = fakeReceipts({ [A]: FOREIGN(A, { claimedBy: 'attachments:77' }) }, { observe: true });
  const inUse = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME, refuseClaimed: true }, claimed.deps);
  assert.deepEqual(inUse, { error: { status: 400, error: REF_IN_USE_TEXT, code: FILE_REF_ERROR_CODE, index: 0 } });

  const cases = [
    [{ driveFileId: 'x,y' }],
    [{ driveFileId: A, fileUrl: view(B) }],
    [ref(A), ref(A)],
  ];
  for (const refs of cases) {
    const fake = fakeReceipts({}, { observe: true });
    const out = await verifyDriveRefs(SUPABASE, { refs, userId: ME }, fake.deps);
    assert.equal(out.error.error, REF_SHAPE_TEXT);
  }
});

test('ต่อกับ requireUploadReceipt ตัวจริง: สวิตช์ปิด = 400/503 ตามเหตุ (ข้อความไทยของรอบแรก) · ผลที่ส่งต่อไม่ทำให้ถามฐานซ้ำ', async () => {
  const supabase = { from() { throw new Error('ต้องไม่ถามฐานอีกรอบ — ผลของ uploadReceiptStatus ถูกส่งต่อแล้ว'); } };
  const withStatus = (status) => ({
    uploadReceiptStatus: async () => status,
    requireUploadReceipt: (db, args) => requireUploadReceipt(db, { ...args, env: {} }),
  });
  const missing = await verifyDriveRefs(supabase, { refs: [ref(A)], userId: ME }, withStatus(MISSING));
  assert.equal(missing.error.status, 400);
  assert.equal(missing.error.code, FILE_REF_ERROR_CODE);
  assert.match(missing.error.error, /24 ชั่วโมง/);
  const down = await verifyDriveRefs(supabase, { refs: [ref(A)], userId: ME }, withStatus(UNVERIFIABLE));
  assert.equal(down.error.status, 503);
  assert.equal('code' in down.error, false);
  assert.match(down.error.error, /ลองแนบอีกครั้ง/);
  assert.deepEqual(await verifyDriveRefs(supabase, { refs: [ref(A)], userId: ME }, withStatus(OWN(A))), { claimable: [A] });
});

test('deps: ตัวแกะลิงก์ที่ยัดเข้ามาถูกใช้จริง (ตัวอ่านเห็นคนละไฟล์ = ไม่ผ่าน · รายการ host ปฏิเสธ = ไม่ผ่าน)', async () => {
  const fake = fakeReceipts({ [A]: OWN(A) });
  const disagree = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME }, { ...fake.deps, parseDriveId: () => B });
  assert.equal(disagree.error.error, REF_SHAPE_TEXT);
  const badHost = await verifyDriveRefs(SUPABASE, { refs: [ref(A)], userId: ME }, { ...fake.deps, attachmentUrlError: () => 'ไม่ผ่าน' });
  assert.equal(badHost.error.error, REF_SHAPE_TEXT);
  assert.equal(fake.calls.length, 0);
});

// ── claimDriveRefs ──────────────────────────────────────────────────────────────────────────────────────────

function fakeClaim(results = {}) {
  const calls = [];
  const lines = [];
  return {
    calls,
    lines,
    deps: {
      claimUploadReceipt: async (supabase, args) => {
        calls.push({ supabase, ...args });
        const queue = results[args.driveFileId] || [];
        const next = queue.length ? queue.shift() : { error: null };
        if (next instanceof Error) throw next;
        return next;
      },
      log: (line) => { lines.push(line); },
    },
  };
}

test('claimDriveRefs: ประทับทุก id ครั้งเดียวด้วย claimedBy ของปลายทาง · ไม่มีอะไรพัง = ไม่ log', async () => {
  const fake = fakeClaim();
  const out = await claimDriveRefs(SUPABASE, { ids: [A, B], claimedBy: 'service_visits:V1' }, fake.deps);
  assert.equal(out, undefined);
  assert.deepEqual(fake.calls, [
    { supabase: SUPABASE, driveFileId: A, claimedBy: 'service_visits:V1' },
    { supabase: SUPABASE, driveFileId: B, claimedBy: 'service_visits:V1' },
  ]);
  assert.deepEqual(fake.lines, []);
});

test('claimDriveRefs: พังครั้งแรก ลองซ้ำหนึ่งครั้งแล้วสำเร็จ = ไม่ log · ตัวถัดไปยังถูกประทับ', async () => {
  const fake = fakeClaim({ [A]: [{ error: { message: 'timeout' } }, { error: null }] });
  await claimDriveRefs(SUPABASE, { ids: [A, B], claimedBy: 'service_visits:V1' }, fake.deps);
  assert.deepEqual(fake.calls.map((c) => c.driveFileId), [A, A, B]);
  assert.deepEqual(fake.lines, []);
});

test('🔴 claimDriveRefs: พังสองครั้ง = log บรรทัดแดงหนึ่งบรรทัด (มีปลายทาง + id ไฟล์) ไม่ลองครั้งที่สาม ไม่ throw เดินต่อ', async () => {
  const fake = fakeClaim({
    [A]: [{ error: { message: 'timeout' } }, { error: { message: 'relation does not exist' } }, { error: null }],
    [B]: [new Error('socket hang up'), new Error('socket hang up')],
  });
  await claimDriveRefs(SUPABASE, { ids: [A, B, C], claimedBy: 'service_visits:V1' }, fake.deps);
  assert.deepEqual(fake.calls.map((c) => c.driveFileId), [A, A, B, B, C]);
  assert.equal(fake.lines.length, 2);
  for (const [line, id] of [[fake.lines[0], A], [fake.lines[1], B]]) {
    assert.ok(line.startsWith('🔴'), line);
    assert.ok(line.includes('service_visits:V1'), line);
    assert.ok(line.includes(id), line);
  }
  assert.ok(fake.lines[0].includes('relation does not exist'));
});

test('claimDriveRefs: ไม่ส่งตัวเขียน log = console.error · ids ไม่ใช่ array / ไม่ส่งอะไรเลย / ตัว log พัง = เงียบ ไม่ throw', async () => {
  const original = console.error;
  const seen = [];
  console.error = (...args) => { seen.push(args); };
  try {
    const fake = fakeClaim({ [A]: [{ error: { message: 'x' } }, { error: { message: 'y' } }] });
    await claimDriveRefs(SUPABASE, { ids: [A], claimedBy: 'service_visits:V1' }, { claimUploadReceipt: fake.deps.claimUploadReceipt });
  } finally {
    console.error = original;
  }
  assert.equal(seen.length, 1);
  assert.ok(String(seen[0][0]).startsWith('🔴'));

  for (const ids of [undefined, null, A, { 0: A }]) {
    const fake = fakeClaim();
    await claimDriveRefs(SUPABASE, { ids, claimedBy: 'x' }, fake.deps);
    assert.equal(fake.calls.length, 0);
  }
  await claimDriveRefs(SUPABASE);
  const loud = fakeClaim({ [A]: [{ error: { message: 'x' } }, { error: { message: 'y' } }] });
  await claimDriveRefs(SUPABASE, { ids: [A, B], claimedBy: 'x' }, { ...loud.deps, log: () => { throw new Error('log พัง'); } });
  assert.deepEqual(loud.calls.map((c) => c.driveFileId), [A, A, B]);
});

test('claimDriveRefs ตัวจริง: id ผิดรูป/ไม่ระบุปลายทาง ไม่ยิงฐาน แค่ log · supabase ที่ throw ก็ไม่หลุดออกมา', async () => {
  const lines = [];
  const supabase = { from() { throw new Error('ฐานล่ม'); } };
  await claimDriveRefs(supabase, { ids: ['x,y', A], claimedBy: 'service_visits:V1' }, { log: (l) => lines.push(l) });
  await claimDriveRefs(supabase, { ids: [A] }, { log: (l) => lines.push(l) });
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(line.startsWith('🔴'), line);
});

// ── ตัวไฟล์เอง ──────────────────────────────────────────────────────────────────────────────────────────────

test('🔴 ไฟล์ด่าน: ไม่อ่านสวิตช์ฉุกเฉินเอง (ตัวตัดสินใบรับเป็นที่เดียว) และไม่ถาม driveFileReferenced', () => {
  const raw = readFileSync(fileURLToPath(new URL('./driveRefGate.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(raw, /uploadReceiptMode|UPLOAD_RECEIPT_MODE|observe/i);
  assert.doesNotMatch(raw, /driveFileReferenced|process\.env/);
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // ข้อความไทยสองตัวกับรหัสเป็นสัญญากับ route และจอ — ล็อกตัวหนังสือ
  assert.equal(REF_SHAPE_TEXT, 'ไฟล์แนบต้องเป็นไฟล์ที่อัปโหลดผ่านระบบ — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง');
  assert.equal(REF_IN_USE_TEXT, 'ไฟล์นี้ถูกใช้กับรายการอื่นไปแล้ว — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง');
  assert.equal(FILE_REF_ERROR_CODE, 'file_ref');
  // ลำดับในตัวไฟล์: ตัวเดิม → id ซ้ำ → ถามใบรับ → ตัวตัดสิน → ใช้ไปแล้ว → claimable
  const at = [
    'if (stored.has(driveFileId)) continue;',
    'if (seen.has(driveFileId)) return',
    'await use.uploadReceiptStatus(',
    'await use.requireUploadReceipt(',
    'if (refuseClaimed && claimedBy) return',
    'claimable.push(driveFileId)',
  ].map((needle) => code.indexOf(needle));
  at.forEach((i) => assert.ok(i >= 0));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k]);
});

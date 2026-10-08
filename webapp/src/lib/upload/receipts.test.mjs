// ── ใบรับการอัปโหลด (upload_receipts · mig 0406 · มติเจ้าของ 08/10/2569) ────────────────────────────────
//
// 🐞 `driveFileId` ตอนบันทึกแถวไฟล์แนบ/ตอนถอยการอัปมาจาก client ⇒ ส่ง id ของไฟล์คนอื่นมาแล้วเปิดอ่านหรือให้ระบบทิ้งได้
//    ทะเบียนนี้คือที่เดียวที่บอกว่า "ไฟล์ใบนี้คนเรียกอัปเองจริง" — เทสต์ชุดนี้ล็อกทุกเหตุปฏิเสธ · ขอบอายุ 24 ชั่วโมง ·
//    สวิตช์ฉุกเฉินที่หมดอายุเอง · และว่า "ตรวจไม่ได้" ไม่มีวันกลายเป็น "ผ่าน"
// ⚠️ supabase ปลอมล้วน + นาฬิกาที่ยัดเอง — ไม่แตะฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_FILE_ID_PATTERN, OBSERVE_LOG_PREFIX, OBSERVE_MAX_AHEAD_DAYS, UPLOAD_RECEIPT_TTL_MS,
  claimUploadReceipt, ledgerHealth, recordUploadReceipt, requireUploadReceipt, uploadReceiptMode, uploadReceiptStatus,
} from './receipts.js';

const NOW = Date.parse('2026-10-08T05:00:00.000Z');
const FILE = '1AbC_def-123456789';
const ME = 'user-me';
const iso = (ms) => new Date(ms).toISOString();
const receiptRow = (over = {}) => ({
  driveFileId: FILE, userId: ME, entityType: 'deal', entityId: 'D-1', createdAt: iso(NOW - 60_000), claimedBy: null, claimedAt: null, ...over,
});

/* ตัวปลอมของตาราง upload_receipts — จดทุกคำสั่งที่ถูกยิง (`calls`) · `insertErrors` = คิวผลของ insert ทีละครั้ง */
function fakeLedger({ rows = [], readError = null, insertErrors = [], updateError = null, throwOnRead = false } = {}) {
  const calls = [];
  const store = rows.map((r) => ({ ...r }));
  return {
    calls,
    store,
    from(table) {
      assert.equal(table, 'upload_receipts');
      return {
        insert(row) {
          calls.push({ op: 'insert', row });
          const error = insertErrors.length ? insertErrors.shift() : null;
          if (error instanceof Error) return Promise.reject(error);
          if (!error) store.push({ createdAt: iso(NOW), claimedBy: null, claimedAt: null, ...row });
          return Promise.resolve({ error });
        },
        select(columns) {
          const filters = {};
          const q = {
            eq(col, value) { filters[col] = value; return q; },
            maybeSingle() {
              calls.push({ op: 'select', columns, filters: { ...filters } });
              if (throwOnRead) return Promise.reject(new Error('socket hang up'));
              if (readError) return Promise.resolve({ data: null, error: readError });
              return Promise.resolve({ data: store.find((r) => r.driveFileId === filters.driveFileId) || null, error: null });
            },
            limit(n) {
              calls.push({ op: 'health', columns, limit: n });
              return Promise.resolve({ data: readError ? null : store.slice(0, n), error: readError });
            },
          };
          return q;
        },
        update(patch) {
          const filters = {};
          const q = {
            eq(col, value) { filters[col] = value; return q; },
            is(col, value) { filters[`is:${col}`] = value; return q; },
            then(resolve) {
              calls.push({ op: 'update', patch, filters: { ...filters } });
              if (!updateError) {
                for (const r of store) {
                  if (r.driveFileId === filters.driveFileId && r.claimedBy === null) Object.assign(r, patch);
                }
              }
              return resolve({ error: updateError });
            },
          };
          return q;
        },
      };
    },
  };
}
const noWait = { wait: async () => {} };

test('ค่าคงที่: อายุใบรับ 24 ชั่วโมง · รูปร่าง id ไม่รับตัวที่เขียนตัวกรองของฐานใหม่ได้', () => {
  assert.equal(UPLOAD_RECEIPT_TTL_MS, 24 * 60 * 60 * 1000);
  for (const ok of [FILE, 'a', 'A_b-9', 'x'.repeat(200)]) assert.equal(DRIVE_FILE_ID_PATTERN.test(ok), true, ok);
  for (const bad of ['', 'a,b', 'a)b', 'a.b', 'a b', 'ก', 'a\n', 'a/b', 'x'.repeat(201)]) {
    assert.equal(DRIVE_FILE_ID_PATTERN.test(bad), false, JSON.stringify(bad.slice(0, 8)));
  }
});

test('ออกใบรับ: เขียนหนึ่งแถวด้วย id ผู้ใช้ของคนเรียก · ระเบียนที่ส่งมาเก็บเฉพาะตัวหนังสือ (ค่าจากฟอร์มเป็น File ได้)', async () => {
  const db = fakeLedger();
  assert.deepEqual(await recordUploadReceipt(db, { driveFileId: FILE, userId: ME, entityType: 'deal', entityId: 'D-1' }, noWait), { error: null });
  assert.deepEqual(db.calls, [{ op: 'insert', row: { driveFileId: FILE, userId: ME, entityType: 'deal', entityId: 'D-1' } }]);
  const odd = fakeLedger();
  await recordUploadReceipt(odd, { driveFileId: FILE, userId: ME, entityType: { name: 'x.pdf' }, entityId: 'E'.repeat(300) }, noWait);
  assert.equal(odd.calls[0].row.entityType, null);
  assert.equal(odd.calls[0].row.entityId.length, 200);
  const bare = fakeLedger();
  await recordUploadReceipt(bare, { driveFileId: FILE, userId: ME }, noWait);
  assert.deepEqual(bare.calls[0].row, { driveFileId: FILE, userId: ME, entityType: null, entityId: null });
});

test('🔴 ออกใบรับ: ไม่มีผู้ใช้ / id ผิดรูป = error โดยไม่ยิงฐานเลย', async () => {
  for (const userId of [null, undefined, '', 0, 42, {}, 'u'.repeat(201)]) {
    const db = fakeLedger();
    const res = await recordUploadReceipt(db, { driveFileId: FILE, userId }, noWait);
    assert.ok(res.error?.message, JSON.stringify(userId));
    assert.equal(db.calls.length, 0, 'ต้องไม่ยิงฐาน');
  }
  for (const driveFileId of [null, undefined, '', 'a,b', 'a)b', ['x'], { id: 'x' }, 12345]) {
    const db = fakeLedger();
    const res = await recordUploadReceipt(db, { driveFileId, userId: ME }, noWait);
    assert.ok(res.error?.message, JSON.stringify(driveFileId));
    assert.equal(db.calls.length, 0, 'ต้องไม่ยิงฐาน');
  }
});

test('ออกใบรับ: ลองสองครั้งก่อนยอมแพ้ — ครั้งแรกพังครั้งสองผ่าน = สำเร็จ · พังสองครั้ง = คืน error (ไม่ throw) · id ซ้ำไม่ลองใหม่', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const flaky = fakeLedger({ insertErrors: [{ message: 'timeout' }] });
  assert.deepEqual(await recordUploadReceipt(flaky, { driveFileId: FILE, userId: ME }, { wait }), { error: null });
  assert.equal(flaky.calls.length, 2);
  assert.equal(waits.length, 1, 'หน่วงหนึ่งครั้งระหว่างสองครั้ง');

  const down = fakeLedger({ insertErrors: [{ message: 'relation "upload_receipts" does not exist', code: '42P01' }, { message: 'still down' }] });
  const res = await recordUploadReceipt(down, { driveFileId: FILE, userId: ME }, noWait);
  assert.equal(res.error.message, 'still down');
  assert.equal(down.calls.length, 2, 'สองครั้งพอดี ไม่วนต่อ');

  const thrown = fakeLedger({ insertErrors: [new Error('fetch failed'), new Error('fetch failed again')] });
  assert.equal((await recordUploadReceipt(thrown, { driveFileId: FILE, userId: ME }, noWait)).error.message, 'fetch failed again');

  // id ซ้ำ = มีใบรับของการอัปครั้งก่อนอยู่แล้ว — ลองใหม่ก็ซ้ำอีก และห้ามเขียนทับ (insert ไม่ใช่ upsert)
  const dup = fakeLedger({ rows: [receiptRow()], insertErrors: [{ message: 'duplicate key', code: '23505' }] });
  assert.equal((await recordUploadReceipt(dup, { driveFileId: FILE, userId: ME }, noWait)).error.code, '23505');
  assert.equal(dup.calls.length, 1);
  assert.deepEqual(dup.calls.map((c) => c.op), ['insert'], 'ซ้ำตั้งแต่ครั้งแรก = ไม่ลองใหม่ และไม่อ่านแถวกลับ (แม้ใบรับเดิมจะเป็นของคนเดียวกัน)');
});

// 🐞 ครั้งแรกเขียนลงฐานสำเร็จแต่คำตอบหาย (ต่อหลุด · หมดเวลา) ⇒ ครั้งที่สองชนแถวของตัวเอง (23505) — เดิมคืน error ทั้งที่ใบรับ
//    อยู่ครบ ⇒ route log แดง "จะแนบเป็นไฟล์แนบไม่ได้ (ตรวจว่ารัน migration 0406 แล้ว)" ซึ่งผิดทั้งสองข้อ
test('🔴 ออกใบรับ: ครั้งแรกไม่รู้ผล แล้วครั้งที่สองชน id ซ้ำ = อ่านแถวกลับหนึ่งครั้ง — ของผู้ใช้คนเดียวกัน = สำเร็จ · ของคนอื่น/อ่านไม่ได้/ไม่เจอ = 23505', async () => {
  const DUP = { message: 'duplicate key value violates unique constraint', code: '23505' };
  const record = (db) => recordUploadReceipt(db, { driveFileId: FILE, userId: ME }, noWait);
  // ครั้งแรกโยน error (คำตอบหาย) · ครั้งแรกคืน error ไม่มีรหัส — ทั้งสองแบบไม่ได้พิสูจน์ว่าฐานไม่ได้เขียน
  for (const first of [new Error('fetch failed'), { message: 'upstream timeout' }]) {
    const db = fakeLedger({ rows: [receiptRow()], insertErrors: [first, { ...DUP }] });
    assert.deepEqual(await record(db), { error: null }, first.message);
    assert.deepEqual(db.calls.map((c) => c.op), ['insert', 'insert', 'select'], 'สอง insert + อ่านกลับหนึ่งครั้ง');
    assert.deepEqual(db.calls[2].filters, { driveFileId: FILE }, 'อ่านด้วย primary key');
    assert.equal(db.calls[2].columns, '"userId"');
    assert.equal(db.store.length, 1, 'ไม่มีแถวใหม่ และไม่เขียนทับแถวเดิม');
    assert.equal(db.store[0].userId, ME);
  }
  // 🔴 แถวที่ชนเป็นของคนอื่น = ไม่ใช่ใบรับของเรา — ห้ามรายงานว่าสำเร็จ และห้ามแตะแถวนั้น
  const foreign = fakeLedger({ rows: [receiptRow({ userId: 'someone-else' })], insertErrors: [new Error('fetch failed'), { ...DUP }] });
  assert.equal((await record(foreign)).error.code, '23505');
  assert.equal(foreign.store[0].userId, 'someone-else');
  // อ่านกลับไม่ได้ (ฐานตอบ error · client โยน) / ไม่เจอแถว = ยังไม่รู้ว่าใบรับเป็นของใคร ⇒ 23505 ตามเดิม ไม่ throw
  const unreadable = fakeLedger({ rows: [receiptRow()], insertErrors: [new Error('fetch failed'), { ...DUP }], readError: { message: 'timeout' } });
  assert.equal((await record(unreadable)).error.code, '23505');
  const throwing = fakeLedger({ rows: [receiptRow()], insertErrors: [new Error('fetch failed'), { ...DUP }], throwOnRead: true });
  assert.equal((await record(throwing)).error.code, '23505');
  assert.deepEqual(throwing.calls.map((c) => c.op), ['insert', 'insert', 'select'], 'อ่านกลับพังแล้วไม่วนลองต่อ');
  const gone = fakeLedger({ insertErrors: [new Error('fetch failed'), { ...DUP }] });
  assert.equal((await record(gone)).error.code, '23505');
});

test('สถานะใบรับ: ใบรับของตัวเองที่ยังไม่หมดอายุ = ok · อ่านด้วย primary key แถวเดียว', async () => {
  const db = fakeLedger({ rows: [receiptRow()] });
  const res = await uploadReceiptStatus(db, { driveFileId: FILE, userId: ME, now: NOW });
  assert.deepEqual(res, { ok: true, reason: null, receipt: receiptRow() });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].filters, { driveFileId: FILE });
  assert.match(db.calls[0].columns, /"claimedBy"/, 'ผู้เรียกต้องอ่านช่องประทับต่อได้โดยไม่ถามซ้ำ');
});

test('🔴 สถานะใบรับ: ทุกเหตุปฏิเสธ — invalid (ไม่ยิงฐาน) · missing · foreign · expired · unverifiable', async () => {
  // invalid: id ผิดรูป / ไม่มีผู้ใช้ — ห้ามถึงฐาน
  for (const [driveFileId, userId] of [['a,b', ME], ['', ME], [null, ME], [['x'], ME], [{}, ME], [123, ME], [FILE, null], [FILE, ''], [FILE, undefined], [FILE, 7]]) {
    const db = fakeLedger({ rows: [receiptRow()] });
    assert.deepEqual(await uploadReceiptStatus(db, { driveFileId, userId, now: NOW }), { ok: false, reason: 'invalid', receipt: null });
    assert.equal(db.calls.length, 0, `ต้องไม่ยิงฐาน: ${JSON.stringify([driveFileId, userId])}`);
  }
  // missing
  assert.deepEqual(await uploadReceiptStatus(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW }), { ok: false, reason: 'missing', receipt: null });
  // foreign — คนอื่นอัป (ใบรับคืนมาด้วยเพื่อให้บรรทัด log ของโหมด observe มีข้อมูล)
  const foreign = await uploadReceiptStatus(fakeLedger({ rows: [receiptRow({ userId: 'someone-else' })] }), { driveFileId: FILE, userId: ME, now: NOW });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, 'foreign');
  assert.equal(foreign.receipt.userId, 'someone-else');
  // 🔴 id ผู้ใช้เทียบตรงตัว — ตัวพิมพ์/ช่องว่างต่างกัน = คนละคน
  for (const other of ['USER-ME', 'user-me ', ' user-me']) {
    assert.equal((await uploadReceiptStatus(fakeLedger({ rows: [receiptRow({ userId: other })] }), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'foreign');
  }
  // expired
  const old = fakeLedger({ rows: [receiptRow({ createdAt: iso(NOW - UPLOAD_RECEIPT_TTL_MS - 1) })] });
  assert.equal((await uploadReceiptStatus(old, { driveFileId: FILE, userId: ME, now: NOW })).reason, 'expired');
  // unverifiable — query ล้ม · ตารางยังไม่มี (ลืมรัน 0406) · client โยน error · เวลาในแถวอ่านไม่ออก
  for (const readError of [{ message: 'timeout' }, { message: 'relation "public.upload_receipts" does not exist', code: '42P01' }, { message: "Could not find the table 'public.upload_receipts' in the schema cache", code: 'PGRST205' }]) {
    assert.deepEqual(await uploadReceiptStatus(fakeLedger({ readError }), { driveFileId: FILE, userId: ME, now: NOW }), { ok: false, reason: 'unverifiable', receipt: null });
  }
  assert.equal((await uploadReceiptStatus(fakeLedger({ throwOnRead: true }), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'unverifiable');
  assert.equal((await uploadReceiptStatus(fakeLedger({ rows: [receiptRow({ createdAt: 'not-a-date' })] }), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'unverifiable');
});

test('ขอบอายุ: ครบ 24 ชั่วโมงพอดียังใช้ได้ · เกิน 1 มิลลิวินาที = หมดอายุ · เวลาในแถวล้ำหน้านาฬิกาเรา = ยังใช้ได้ · รับ now เป็น Date ได้', async () => {
  const at = (createdAt, now = NOW) => uploadReceiptStatus(fakeLedger({ rows: [receiptRow({ createdAt })] }), { driveFileId: FILE, userId: ME, now });
  assert.equal((await at(iso(NOW - UPLOAD_RECEIPT_TTL_MS))).ok, true);
  assert.equal((await at(iso(NOW - UPLOAD_RECEIPT_TTL_MS - 1))).reason, 'expired');
  assert.equal((await at(iso(NOW - UPLOAD_RECEIPT_TTL_MS + 1))).ok, true);
  assert.equal((await at(iso(NOW + 5 * 60_000))).ok, true, 'นาฬิกาสองเครื่องไม่ตรงกัน');
  assert.equal((await at(iso(NOW - 60_000), new Date(NOW))).ok, true);
  assert.equal((await at(iso(NOW - UPLOAD_RECEIPT_TTL_MS - 1), new Date(NOW))).reason, 'expired');
});

test('🔴 โหมด: enforce เป็นค่าตั้งต้น · observe เฉพาะรูป observe:YYYY-MM-DD ตรงตัว และเฉพาะก่อนสิ้นวันนั้น (เวลาไทย)', () => {
  const mode = (value, now = NOW) => uploadReceiptMode(value === undefined ? {} : { UPLOAD_RECEIPT_MODE: value }, now);
  assert.equal(mode(undefined), 'enforce');
  assert.equal(uploadReceiptMode(undefined, NOW) === 'enforce' || uploadReceiptMode(undefined, NOW) === 'observe', true, 'ค่าตั้งต้นอ่าน process.env ได้โดยไม่พัง');
  assert.equal(uploadReceiptMode(null, NOW), 'enforce');
  // NOW = 2026-10-08 12:00 เวลาไทย
  assert.equal(mode('observe:2026-10-08'), 'observe');
  assert.equal(mode('observe:2026-10-09'), 'observe');
  assert.equal(mode('observe:2026-10-07'), 'enforce', 'วันที่ผ่านไปแล้ว = หมดอายุเอง');
  // 🔴 พิมพ์ผิดต้องไม่เปิดด่าน — ทุกรูปที่ไม่ตรงเป๊ะ = enforce
  for (const bad of ['observe', 'OBSERVE:2026-10-09', 'Observe:2026-10-09', ' observe:2026-10-09', 'observe:2026-10-09 ', 'observe:2026-10-09\n',
    'observe: 2026-10-09', 'observe:2026-10-9', 'observe:26-10-09', 'observe:2026/10/09', 'observe:2026-10-09T23:59', 'observe:forever',
    'observe:9999', 'observe:2026-02-30', 'observe:2026-13-01', 'observe:2026-00-10', 'observe:2026-10-00', 'true', '1', 'on', 'off', 'enforce', '',
    'observe:2026-10-09,observe:2099-01-01']) {
    assert.equal(mode(bad), 'enforce', JSON.stringify(bad));
  }
  for (const bad of [true, 1, ['observe:2026-10-09'], { toString: () => 'observe:2026-10-09' }]) assert.equal(mode(bad), 'enforce');
});

// 🐞 เดิมรับวันในอนาคตไกลแค่ไหนก็ได้ ⇒ ค่าเดียว (พิมพ์ปีสลับหลัก · 9999-12-31) ปิดด่านใบรับไปตลอด — "หมดอายุเอง" ไม่จริง
test('🔴 โหมด: วันที่ไกลกว่า 7 วันนับจากวันนี้ (เวลาไทย) = enforce — สวิตช์ค่าเดียวปิดด่านค้างไม่ได้ · ครบ 7 วันพอดียัง observe', () => {
  const mode = (value, now = NOW) => uploadReceiptMode({ UPLOAD_RECEIPT_MODE: value }, now);
  assert.equal(OBSERVE_MAX_AHEAD_DAYS, 7);
  // NOW = 2026-10-08 12:00 เวลาไทย
  for (const far of ['observe:2062-10-10', 'observe:9999-12-31', 'observe:2099-12-31', 'observe:2027-10-08', 'observe:2026-11-08', 'observe:2026-10-16']) {
    assert.equal(mode(far), 'enforce', far);
  }
  assert.equal(mode('observe:2026-10-15'), 'observe', 'วันนี้ + 7 วัน = ขอบที่ยังรับ');
  assert.equal(mode('observe:2026-10-14'), 'observe');
  // 🔴 นับเป็นวันตามปฏิทินไทย ไม่ใช่ 168 ชั่วโมง: 00:00 กับ 23:59:59.999 ของวันเดียวกัน (ไทย) ได้ขอบเดียวกัน
  const startThai = Date.parse('2026-10-07T17:00:00.000Z'); // = 2026-10-08 00:00 เวลาไทย
  const lastMs = Date.parse('2026-10-08T16:59:59.999Z'); // = 2026-10-08 23:59:59.999 เวลาไทย
  for (const at of [startThai, lastMs]) {
    assert.equal(mode('observe:2026-10-15', at), 'observe');
    assert.equal(mode('observe:2026-10-16', at), 'enforce');
  }
  // ข้ามเที่ยงคืนไทยไปหนึ่งมิลลิวินาที = วันใหม่ ⇒ ขอบเลื่อนตามหนึ่งวัน (ค่าที่ไกลเกินเริ่มมีผลเมื่อเข้ามาในระยะ)
  assert.equal(mode('observe:2026-10-16', lastMs + 1), 'observe');
  assert.equal(mode('observe:2026-10-17', lastMs + 1), 'enforce');
  assert.equal(mode('observe:2026-10-07'), 'enforce', 'เพดานไม่ได้เปิดวันที่ผ่านไปแล้วกลับมา');
});

test('🔴 ด่านใบรับ: สวิตช์ที่ตั้งวันไกลเกิน 7 วัน ไม่ผ่อนอะไรเลย — ปฏิเสธจริง ไม่ใช่จดแล้วปล่อย', async () => {
  const lines = [];
  for (const value of ['observe:9999-12-31', 'observe:2062-10-10', 'observe:2026-10-16']) {
    assert.deepEqual(
      await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW, env: { UPLOAD_RECEIPT_MODE: value }, log: (l) => lines.push(l) }),
      { status: 400, error: ERR_400 }, value,
    );
  }
  assert.equal(lines.length, 0);
});

test('🔴 โหมด observe หมดอายุที่ "สิ้นวัน" ตามนาฬิกาไทย — 23:59:59.999 ยังอยู่ · เที่ยงคืนของวันถัดไป (ไทย) กลับมาบังคับเอง', () => {
  const env = { UPLOAD_RECEIPT_MODE: 'observe:2026-10-08' };
  const endThai = Date.parse('2026-10-08T17:00:00.000Z'); // = 2026-10-09 00:00 เวลาไทย
  assert.equal(uploadReceiptMode(env, endThai - 1), 'observe');
  assert.equal(uploadReceiptMode(env, endThai), 'enforce');
  assert.equal(uploadReceiptMode(env, new Date(endThai + 1)), 'enforce');
  // เช้ามืดเวลาไทยของวันที่ 8 (ยังเป็นวันที่ 7 ตาม UTC) — อยู่ในวันที่ระบุแล้ว
  assert.equal(uploadReceiptMode(env, Date.parse('2026-10-07T18:30:00.000Z')), 'observe');
  // ตั้งล่วงหน้าได้ — ยังไม่ถึงวันก็ observe (สวิตช์นับ "จนถึงสิ้นวัน" ไม่ใช่ "เฉพาะวันนั้น")
  assert.equal(uploadReceiptMode(env, Date.parse('2026-10-01T00:00:00.000Z')), 'observe');
});

const ERR_400 = 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณในช่วง 24 ชั่วโมงที่ผ่านมา — อัปโหลดไฟล์ใหม่แล้วแนบอีกครั้ง';
const ERR_503 = 'ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้ — ลองแนบอีกครั้ง';
const ENFORCE = {};
const OBSERVE = { UPLOAD_RECEIPT_MODE: 'observe:2026-10-08' };

test('🔴 ด่านใบรับ (enforce): ผ่าน = null · ไม่มี/ของคนอื่น/หมดอายุ/id ผิดรูป = 400 ข้อความไทย · ตรวจไม่ได้ = 503 — ไม่มีทางตกเป็นผ่าน', async () => {
  const ask = (db, over = {}) => requireUploadReceipt(db, { driveFileId: FILE, userId: ME, now: NOW, env: ENFORCE, route: 'POST /api/attachments', ...over });
  assert.equal(await ask(fakeLedger({ rows: [receiptRow()] })), null);
  assert.deepEqual(await ask(fakeLedger()), { status: 400, error: ERR_400 });
  assert.deepEqual(await ask(fakeLedger({ rows: [receiptRow({ userId: 'someone-else' })] })), { status: 400, error: ERR_400 });
  assert.deepEqual(await ask(fakeLedger({ rows: [receiptRow({ createdAt: iso(NOW - UPLOAD_RECEIPT_TTL_MS - 1) })] })), { status: 400, error: ERR_400 });
  assert.deepEqual(await ask(fakeLedger({ rows: [receiptRow()] }), { driveFileId: 'a,b' }), { status: 400, error: ERR_400 });
  assert.deepEqual(await ask(fakeLedger({ rows: [receiptRow()] }), { userId: null }), { status: 400, error: ERR_400 });
  assert.deepEqual(await ask(fakeLedger({ readError: { message: 'does not exist', code: '42P01' } })), { status: 503, error: ERR_503 });
  assert.deepEqual(await ask(fakeLedger({ throwOnRead: true })), { status: 503, error: ERR_503 });
  // ไม่ส่ง env = อ่าน process.env — ไม่มีสวิตช์ ⇒ ยังบังคับ · ถอดค่าของเครื่องที่รันเทสต์ออกก่อนแล้วคืนให้ (คนที่กำลังเปิดสวิตช์
  // ฉุกเฉินอยู่ใน shell/CI ต้องรันเทสต์ชุดนี้ผ่าน) · มีสวิตช์ใน process.env ⇒ ทางเดียวกันนี้ต้องผ่อนจริง (พิสูจน์ว่าอ่าน process.env)
  const saved = process.env.UPLOAD_RECEIPT_MODE;
  delete process.env.UPLOAD_RECEIPT_MODE;
  try {
    assert.deepEqual(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW }), { status: 400, error: ERR_400 });
    process.env.UPLOAD_RECEIPT_MODE = 'observe:2026-10-08';
    assert.equal(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW, log: () => {} }), null);
  } finally {
    if (saved === undefined) delete process.env.UPLOAD_RECEIPT_MODE; else process.env.UPLOAD_RECEIPT_MODE = saved;
  }
});

test('ด่านใบรับ: id ที่อยู่บนแถวเดิมอยู่แล้ว (alreadyStored) ข้ามด่านโดยไม่ถามฐาน — id อื่นในคำขอเดียวกันยังถูกตรวจ', async () => {
  const db = fakeLedger();
  const stored = new Set([FILE]);
  assert.equal(await requireUploadReceipt(db, { driveFileId: FILE, userId: ME, alreadyStored: stored, now: NOW, env: ENFORCE }), null);
  assert.equal(db.calls.length, 0);
  assert.deepEqual(await requireUploadReceipt(db, { driveFileId: 'OTHER_file-1', userId: ME, alreadyStored: stored, now: NOW, env: ENFORCE }), { status: 400, error: ERR_400 });
  // ของที่ไม่ใช่ Set (array จาก client) ไม่ถูกนับเป็นทางข้าม
  assert.deepEqual(await requireUploadReceipt(db, { driveFileId: FILE, userId: ME, alreadyStored: [FILE], now: NOW, env: ENFORCE }), { status: 400, error: ERR_400 });
});

test('ด่านใบรับ: รับผล uploadReceiptStatus ที่ผู้เรียกถามไว้แล้ว (status) — ไม่ถามฐานซ้ำ', async () => {
  const db = fakeLedger({ rows: [receiptRow()] });
  const status = await uploadReceiptStatus(db, { driveFileId: FILE, userId: ME, now: NOW });
  assert.equal(await requireUploadReceipt(db, { driveFileId: FILE, userId: ME, status, now: NOW, env: ENFORCE }), null);
  assert.equal(db.calls.length, 1);
  const missing = { ok: false, reason: 'missing', receipt: null };
  assert.deepEqual(await requireUploadReceipt(db, { driveFileId: FILE, userId: ME, status: missing, now: NOW, env: ENFORCE }), { status: 400, error: ERR_400 });
  assert.equal(db.calls.length, 1);
});

test('🔴 โหมด observe: คำขอที่จะถูกปฏิเสธถูกจดหนึ่งบรรทัด (คำนำหน้าคงที่ + JSON บรรทัดเดียว ไม่มีชื่อไฟล์/อีเมล) แล้วปล่อยผ่าน', async () => {
  const lines = [];
  const log = (line) => lines.push(line);
  const ctx = { entityType: 'customer', entityId: 'C-9', docType: 'id_card', fileName: 'บัตรประชาชน.pdf', email: 'a@x.co' };
  const ask = (db, over = {}) => requireUploadReceipt(db, {
    driveFileId: FILE, userId: ME, now: NOW, env: OBSERVE, route: 'POST /api/attachments', logContext: ctx, log, ...over,
  });

  // ผ่านอยู่แล้ว = ไม่จดอะไร
  assert.equal(await ask(fakeLedger({ rows: [receiptRow()] })), null);
  assert.equal(lines.length, 0);

  // ของคนอื่น — จดแล้วปล่อย
  const foreignAt = NOW - 90_000;
  assert.equal(await ask(fakeLedger({ rows: [receiptRow({ userId: 'someone-else', createdAt: iso(foreignAt) })] })), null);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes('\n'), false, 'บรรทัดเดียว');
  assert.equal(lines[0].startsWith('[upload-receipt] observe would-reject {'), true);
  assert.equal(OBSERVE_LOG_PREFIX, '[upload-receipt] observe would-reject');
  assert.deepEqual(JSON.parse(lines[0].slice(OBSERVE_LOG_PREFIX.length + 1)), {
    rule: 'upload-receipt', reason: 'foreign', route: 'POST /api/attachments', userId: ME,
    entityType: 'customer', entityId: 'C-9', docType: 'id_card', driveFileId: FILE,
    receiptUserId: 'someone-else', receiptAgeSeconds: 90,
  });
  assert.doesNotMatch(lines[0], /บัตรประชาชน|a@x\.co|fileName|email/, 'ห้ามมีชื่อไฟล์/อีเมลใน log');

  // ไม่มีใบรับ / หมดอายุ / ตรวจไม่ได้ (ตารางยังไม่มี = เหตุที่สวิตช์นี้มีไว้) — จดเหตุของตัวเอง แล้วปล่อย
  assert.equal(await ask(fakeLedger()), null);
  assert.equal(await ask(fakeLedger({ rows: [receiptRow({ createdAt: iso(NOW - UPLOAD_RECEIPT_TTL_MS - 5000) })] })), null);
  assert.equal(await ask(fakeLedger({ readError: { message: 'does not exist', code: '42P01' } })), null);
  const logged = lines.map((l) => JSON.parse(l.slice(OBSERVE_LOG_PREFIX.length + 1)));
  assert.deepEqual(logged.map((l) => l.reason), ['foreign', 'missing', 'expired', 'unverifiable']);
  assert.deepEqual([logged[1].receiptUserId, logged[1].receiptAgeSeconds], [null, null], 'ไม่มีใบรับ = null ทั้งคู่');
  assert.equal(logged[2].receiptAgeSeconds, 24 * 60 * 60 + 5);
  assert.deepEqual([logged[3].receiptUserId, logged[3].receiptAgeSeconds], [null, null]);

  // ค่าตั้งต้นของตัวเขียน log = console.warn (หนึ่งครั้งต่อคำขอ)
  const original = console.warn;
  const warned = [];
  console.warn = (...args) => warned.push(args);
  try {
    assert.equal(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW, env: OBSERVE, route: 'r' }), null);
  } finally {
    console.warn = original;
  }
  assert.equal(warned.length, 1);
  assert.equal(warned[0].length, 1);
  assert.equal(warned[0][0].startsWith(`${OBSERVE_LOG_PREFIX} {`), true);
});

test('🔴 โหมด observe ผ่อนได้แค่เรื่องใบรับ — id ผิดรูป/ไม่มีผู้ใช้ยัง 400 · สวิตช์หมดอายุ/พิมพ์ผิด = กลับมาปฏิเสธ', async () => {
  const lines = [];
  const log = (line) => lines.push(line);
  assert.deepEqual(await requireUploadReceipt(fakeLedger(), { driveFileId: 'a,b', userId: ME, now: NOW, env: OBSERVE, log }), { status: 400, error: ERR_400 });
  assert.deepEqual(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: null, now: NOW, env: OBSERVE, log }), { status: 400, error: ERR_400 });
  assert.equal(lines.length, 0);
  // พ้นสิ้นวันของสวิตช์ (เวลาไทย) = บังคับเอง แม้ env ยังค้างอยู่
  const after = Date.parse('2026-10-08T17:00:00.000Z');
  assert.deepEqual(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: after, env: OBSERVE, log }), { status: 400, error: ERR_400 });
  for (const value of ['observe', 'OBSERVE:2026-10-08', 'observe:2026-10-08 ']) {
    assert.deepEqual(await requireUploadReceipt(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW, env: { UPLOAD_RECEIPT_MODE: value }, log }), { status: 400, error: ERR_400 }, value);
  }
  assert.equal(lines.length, 0, 'ปฏิเสธจริง = ไม่ใช่บรรทัด would-reject');
});

test('🔴 สวิตช์ไม่แตะตัวอ่านสถานะ (ที่เส้นถอยการอัปใช้) — uploadReceiptStatus ตอบเหมือนเดิมทุกโหมด และไม่รับ env เลย', async () => {
  const saved = process.env.UPLOAD_RECEIPT_MODE;
  // วันเดียวกับ NOW — สวิตช์ต้อง "เปิดอยู่จริง" ตอนถาม (วันไกลเกิน 7 วัน = ไม่ได้เปิด เทสต์นี้จะไม่ได้พิสูจน์อะไร)
  process.env.UPLOAD_RECEIPT_MODE = 'observe:2026-10-08';
  try {
    assert.equal(uploadReceiptMode(process.env, NOW), 'observe', 'สวิตช์ของเทสต์นี้ต้องเปิดอยู่จริง');
    assert.equal((await uploadReceiptStatus(fakeLedger(), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'missing');
    assert.equal((await uploadReceiptStatus(fakeLedger({ rows: [receiptRow({ userId: 'x' })] }), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'foreign');
    assert.equal((await uploadReceiptStatus(fakeLedger({ readError: { message: 'x' } }), { driveFileId: FILE, userId: ME, now: NOW })).reason, 'unverifiable');
  } finally {
    if (saved === undefined) delete process.env.UPLOAD_RECEIPT_MODE; else process.env.UPLOAD_RECEIPT_MODE = saved;
  }
});

test('ประทับใบรับ: เขียนเฉพาะใบที่ยังไม่ถูกประทับ (claimedBy ว่าง) — ประทับแรกชนะ · ไม่มีใบรับ = ไม่ใช่ error', async () => {
  const db = fakeLedger({ rows: [receiptRow()] });
  assert.deepEqual(await claimUploadReceipt(db, { driveFileId: FILE, claimedBy: 'attachments:ATT-1', now: NOW }), { error: null });
  const call = db.calls.at(-1);
  assert.deepEqual(call.filters, { driveFileId: FILE, 'is:claimedBy': null }, 'ต้องกรอง claimedBy IS NULL ในคำสั่งเดียวกัน');
  assert.deepEqual(call.patch, { claimedBy: 'attachments:ATT-1', claimedAt: iso(NOW) });
  assert.equal(db.store[0].claimedBy, 'attachments:ATT-1');
  // ประทับซ้ำด้วยปลายทางอื่น = ไม่เขียนทับ
  assert.deepEqual(await claimUploadReceipt(db, { driveFileId: FILE, claimedBy: 'attachments:ATT-2', now: NOW + 1000 }), { error: null });
  assert.equal(db.store[0].claimedBy, 'attachments:ATT-1');
  assert.equal(db.store[0].claimedAt, iso(NOW));
  // ไม่มีใบรับให้ประทับ (โหมด observe ปล่อยไฟล์ที่ไม่มีใบรับผ่าน)
  assert.deepEqual(await claimUploadReceipt(fakeLedger(), { driveFileId: FILE, claimedBy: 'attachments:ATT-3', now: NOW }), { error: null });
});

test('ประทับใบรับ: id ผิดรูป/ไม่ระบุปลายทาง = error โดยไม่ยิงฐาน · ฐานพัง = คืน error (ไม่ throw)', async () => {
  for (const args of [{ driveFileId: 'a,b', claimedBy: 'attachments:1' }, { driveFileId: null, claimedBy: 'attachments:1' }, { driveFileId: FILE, claimedBy: '' }, { driveFileId: FILE, claimedBy: null }, { driveFileId: FILE, claimedBy: 5 }]) {
    const db = fakeLedger({ rows: [receiptRow()] });
    assert.ok((await claimUploadReceipt(db, args)).error?.message, JSON.stringify(args));
    assert.equal(db.calls.length, 0);
  }
  const down = fakeLedger({ rows: [receiptRow()], updateError: { message: 'permission denied' } });
  assert.equal((await claimUploadReceipt(down, { driveFileId: FILE, claimedBy: 'attachments:1', now: NOW })).error.message, 'permission denied');
});

test('ทะเบียนใบรับอ่านได้ไหม (ledgerHealth): อ่านหนึ่งแถวมีเพดาน · ตารางยังไม่มี = ok:false พร้อมเหตุ', async () => {
  const ok = fakeLedger({ rows: [receiptRow()] });
  assert.deepEqual(await ledgerHealth(ok), { ok: true, error: null });
  assert.deepEqual(ok.calls, [{ op: 'health', columns: '"driveFileId"', limit: 1 }]);
  assert.deepEqual(await ledgerHealth(fakeLedger()), { ok: true, error: null }, 'ตารางว่างก็ถือว่าอ่านได้');
  const missing = await ledgerHealth(fakeLedger({ readError: { message: 'relation does not exist', code: '42P01' } }));
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, '42P01');
  const broken = await ledgerHealth({ from() { throw new Error('no client'); } });
  assert.deepEqual([broken.ok, broken.error.message], [false, 'no client']);
});

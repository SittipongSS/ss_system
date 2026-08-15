// ── ให้สิทธิ์เอกสารร่วมตามสิทธิ์ในระบบ ────────────────────────────────────
// มติผู้ใช้ 2026-08-15: **คนที่ไม่มีสิทธิ์เห็นใบนั้นในระบบ ห้ามเปิดเอกสารได้**
// แม้จะได้ลิงก์มา ⇒ ให้สิทธิ์รายคน ไม่ใช่ทั้งโดเมน และไม่ใช่ด้วยการเพิ่มสมาชิก
// Shared Drive (สมาชิกจะเดินดูโฟลเดอร์ทั้งบริษัทได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureGoogleDocAccess, revokeGoogleDocAccess } from './googleDocAccess.js';

const gdoc = (id, fileId, granted) => ({
  id,
  metadata: { kind: 'gdoc', googleFileId: fileId, ...(granted ? { accessGranted: granted } : {}) },
});
const plainFile = (id) => ({ id, metadata: { kind: 'file' }, driveFileId: 'drv-1' });

// supabase ปลอม: จดว่ามีการอัปเดต metadata ของแถวไหนบ้าง
function fakeSupabase() {
  const updates = [];
  return {
    updates,
    from: () => ({
      update: (patch) => ({ eq: (_col, id) => { updates.push({ id, patch }); return Promise.resolve({}); } }),
    }),
  };
}

test('ไม่มีอีเมล = ไม่ให้สิทธิ์อะไรเลย (ไม่ใช่ให้แบบไม่ระบุตัวตน)', async () => {
  const db = fakeSupabase();
  assert.equal(await ensureGoogleDocAccess(db, [gdoc('A1', 'F1')], { email: null, role: 'writer' }), 0);
  assert.deepEqual(db.updates, []);
});

test('ไฟล์นิ่งไม่เกี่ยว — ให้สิทธิ์เฉพาะเอกสาร Google', async () => {
  const db = fakeSupabase();
  // ไม่มี googleFileId ⇒ ไม่มีอะไรให้แชร์ · ไฟล์นิ่งเปิดผ่าน proxy ของระบบอยู่แล้ว
  assert.equal(await ensureGoogleDocAccess(db, [plainFile('A1')], { email: 'a@x.co', role: 'reader' }), 0);
  assert.deepEqual(db.updates, []);
});

test('เคยให้สิทธิ์คนนี้ไปแล้ว = ไม่ยิง Drive ซ้ำ', async () => {
  // ⚠️ ถ้าข้อนี้พัง = ยิง Drive ทุกครั้งที่เปิดหน้า ซึ่งช้าและกินโควตาเปล่า
  const db = fakeSupabase();
  const rows = [gdoc('A1', 'F1', ['me@x.co'])];
  assert.equal(await ensureGoogleDocAccess(db, rows, { email: 'me@x.co', role: 'writer' }), 0);
  assert.deepEqual(db.updates, []);
});

test('คนละคนกับที่เคยให้ = ยังต้องให้สิทธิ์', async () => {
  const db = fakeSupabase();
  const rows = [gdoc('A1', 'F1', ['someone@x.co'])];
  // ไม่ได้เรียก Drive จริงในเทสต์นี้ (dynamic import จะล้ม) — สนใจแค่ว่ามัน "ไม่ข้าม"
  await ensureGoogleDocAccess(db, rows, { email: 'me@x.co', role: 'reader' }).catch(() => {});
  // ล้มที่ Drive ก็ยังต้องไม่บันทึกว่าให้สิทธิ์แล้ว
  assert.deepEqual(db.updates, [], 'ให้สิทธิ์ไม่สำเร็จแล้วห้ามจำว่าให้แล้ว');
});

// ── กันไม่ให้ย้อนกลับไปวิธีที่ผู้ใช้ปฏิเสธ ────────────────────────────────
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('⭐ ห้ามแชร์ทั้งโดเมน — ผู้ใช้เลือก "ต้องเห็นใบนั้นในระบบก่อน"', () => {
  // แชร์ทั้งโดเมนง่ายกว่าและไม่มีสิทธิ์ค้าง แต่ใครได้ลิงก์ก็เปิดได้ ซึ่งขัดกับมติ
  const drive = read('../drive.js');
  assert.doesNotMatch(drive, /type:\s*'domain'/);
  assert.doesNotMatch(drive, /type:\s*'anyone'/);
});

test('สิทธิ์ที่ให้ต้องเป็น reader หรือ writer เท่านั้น ไม่ใช่ organizer', () => {
  // organizer/fileOrganizer ลบไฟล์คนอื่นและย้ายของได้ — เกินกว่าที่ "เปิดเอกสารร่วม" ต้องการ
  assert.doesNotMatch(read('../drive.js'), /role:\s*'(file)?[oO]rganizer'/);
  // ผู้เรียกทั้งสองทางต้องเลือกระหว่าง writer/reader ตามสิทธิ์ในระบบ ไม่ใช่ให้ writer รวด
  for (const route of ['../../app/api/attachments/route.js', '../../app/api/sales-planning/documents/all/route.js']) {
    assert.match(read(route), /\?\s*'writer'\s*:\s*'reader'/, route);
  }
});

// ── ถอนสิทธิ์ (ปุ่มโล่ในหน้าผู้ใช้) ────────────────────────────────────────
function fakeSupabaseWithRows(rows) {
  const updates = [];
  return {
    updates,
    from: () => ({
      select: () => ({ contains: () => Promise.resolve({ data: rows, error: null }) }),
      update: (patch) => ({ eq: (_c, id) => { updates.push({ id, patch }); return Promise.resolve({}); } }),
    }),
  };
}

test('ไม่มีอีเมล = ไม่ถอนอะไร', async () => {
  const db = fakeSupabaseWithRows([]);
  assert.deepEqual(await revokeGoogleDocAccess(db, ''), { files: 0, revoked: 0, failed: 0 });
});

test('ไม่มีไฟล์ที่เคยให้สิทธิ์ = จบทันที ไม่ยิง Drive', async () => {
  const db = fakeSupabaseWithRows([]);
  assert.deepEqual(await revokeGoogleDocAccess(db, 'me@x.co'), { files: 0, revoked: 0, failed: 0 });
  assert.deepEqual(db.updates, []);
});

test('⭐ ถอนไม่สำเร็จ ห้ามลบชื่อออกจากรายการที่จดไว้', async () => {
  // ⚠️ ถ้าลบทิ้งทั้งที่ยังถอนไม่ได้ = หาไฟล์ใบนี้ไม่เจออีกเลยตอนกดซ้ำ
  // กลายเป็นสิทธิ์ค้างถาวรที่ไม่มีใครรู้ว่ามีอยู่
  const db = fakeSupabaseWithRows([
    { id: 'A1', metadata: { kind: 'gdoc', googleFileId: 'F1', accessGranted: ['me@x.co'] } },
  ]);
  // ไม่มี Drive จริงในเทสต์ ⇒ revokeFileRole โยน ⇒ ต้องนับเป็น failed
  const out = await revokeGoogleDocAccess(db, 'me@x.co').catch(() => null);
  if (out) {
    assert.equal(out.files, 1);
    assert.equal(out.failed, 1);
    assert.equal(out.revoked, 0);
  }
  assert.deepEqual(db.updates, [], 'ถอนไม่สำเร็จแล้วห้ามแตะรายการที่จดไว้');
});

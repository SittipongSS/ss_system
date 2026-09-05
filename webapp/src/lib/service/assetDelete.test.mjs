// ── ด่านลบเครื่อง (mig 0344) ──────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetDeleteError } from './assetDelete.js';

const asset = { id: 'A1', code: 'MC-OV08-260900013', label: 'OV-08' };

test('fail-closed — ไม่ส่งบริบทมา = ปฏิเสธ', () => {
  assert.match(assetDeleteError(asset, {}), /ไม่มีสิทธิ์/);
  assert.match(assetDeleteError(null, { canEdit: true }), /ไม่พบเครื่อง/);
});

test('เครื่องที่ไม่มีประวัติ ลบได้', () => {
  assert.equal(assetDeleteError(asset, { canEdit: true, used: 0 }), null);
});

/* 🔴 ลบเครื่องที่มีประวัติ = ข้อมูลหายเงียบสองชั้น (visit_items เป็น SET NULL ⇒
   ยอด ml ของโซนหาย · visit_assets เป็น RESTRICT ⇒ Postgres โยน 23503 ดิบ)
   ⇒ ด่านต้อง **บอกทางออก** ไม่ใช่แค่ห้าม */
test('🔴 มีประวัติ = ลบไม่ได้ และต้องบอกทางออก', () => {
  const err = assetDeleteError(asset, { canEdit: true, used: 3 });
  assert.match(err, /3 รายการ/);
  assert.match(err, /ถอดออกจากไซต์/);
  assert.match(err, /ปลดระวาง/);
});

/* 🐞 **รูที่เทสต์ฟังก์ชันมองไม่เห็น** — ด่านถูก แต่ถ้า route ไม่เรียกก็ไม่มีผล
   และเส้นทะเบียนรวมเพิ่งเกิดตอน mig 0344 (เครื่องที่ไม่มีไซต์ไม่มี URL เดิมให้ลบ) */
test('🐞 ทั้งสองเส้นต้องเรียกด่านตัวเดียวกัน · เส้นทะเบียนรวมต้องมี DELETE', () => {
  const registry = readFileSync(new URL('../../app/api/service/assets/[id]/route.js', import.meta.url), 'utf8');
  assert.match(registry, /export const DELETE/,
    'เครื่องที่ยังไม่ได้ติดตั้งไม่มีไซต์ให้ใส่ใน URL ⇒ ต้องลบผ่านเส้นนี้ได้');
  assert.match(registry, /assetDeleteError\(/);
  assert.match(registry, /assetHistoryCount\(/);
  /* ⚠️ ต้องไม่พึ่ง `before.siteId` แบบบังคับ — เครื่องที่ไม่มีไซต์ต้องลบได้ */
  assert.match(registry, /before\.siteId \? await findSite/);

  const bySite = readFileSync(
    new URL('../../app/api/service/sites/[id]/assets/[assetId]/route.js', import.meta.url), 'utf8');
  assert.match(bySite, /assetDeleteError\(/, 'เส้นเดิมต้องใช้ด่านตัวเดียวกัน ไม่ใช่เขียนเงื่อนไขซ้ำ');
});

/* ⚠️ จอต้องใช้ตัวตัดสินตัวเดียวกับ API — ไม่งั้นได้ปุ่มที่กดแล้วเด้ง
   หรือปุ่มที่หายทั้งที่กดได้ (กติกา GatedAction ของระบบ) */
test('จอเครื่องและจอทะเบียนรุ่นต้องถามด่านตัวเดียวกับ API', () => {
  const assetPage = readFileSync(new URL('../../app/service/assets/[id]/page.js', import.meta.url), 'utf8');
  assert.match(assetPage, /assetDeleteError\(/);
  assert.match(assetPage, /"\/api\/service\/assets\/\$\{id\}"|`\/api\/service\/assets\/\$\{id\}`/,
    'ต้องยิงเส้นทะเบียนรวม ไม่ใช่เส้นใต้ไซต์ (เครื่องอาจไม่มีไซต์)');

  const modelPage = readFileSync(new URL('../../app/service/models/page.js', import.meta.url), 'utf8');
  assert.match(modelPage, /assetModelError\(/);
});

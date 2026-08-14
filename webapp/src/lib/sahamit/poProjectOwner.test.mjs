// ── โครงการที่เกิดจาก PO สหมิตร ก็ต้องมีผู้ดูแล (AE) จริง ─────────────────────
//
// route นี้เคยตรึง `aeOwner`/`aeOwnerId`/`ownerId` เป็น **คนกดปุ่ม** เสมอ และทีม
// ถอยไปค่าคงที่ 'KA' ⇒ Admin/หัวหน้าฝ่ายขายกดสร้างเมื่อไร โครงการตกเป็นของคนที่
// ไม่ใช่ AE (ชื่อผิดบนเอกสาร ISO ที่พิมพ์จากโครงการด้วย) — อาการเดียวกับโครงการ
// ฝั่งขายที่ mig 0253 ตามเก็บ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const route = read('../../app/api/sahamit/po/[id]/create-project/route.js');
const page = read('../../app/sahamit/po/[id]/page.js');

test('create-project ตรวจผู้ดูแลด้วยตัวกลางตัวเดียวกับโครงการฝั่งขาย', () => {
  assert.match(route, /resolveProjectAeOwner\(supabase, body\.aeOwnerId, user, body\.team\)/);
  // ae/senior_ae ยังกดแล้วเป็นของตัวเอง — นอกนั้นปล่อยว่างไม่ได้ (กติกาเดียวกับดีล)
  assert.match(route, /else if \(!ownerLockedToSelf\(user\.role\)\)/);
});

test('ทีม/เจ้าของ/ชื่อผู้ดูแล มาจาก AE ที่เลือก ไม่ใช่คนกดปุ่ม', () => {
  assert.match(route, /aeOwner: owner\?\.aeOwner \|\| user\.name/);
  assert.match(route, /aeOwnerId: owner\?\.aeOwnerId \|\| user\.id/);
  assert.match(route, /ownerId: owner\?\.ownerId \|\| user\.id/);
  // โมดูลนี้เป็นลูกค้าของทีม KA ทีมเดียว จึงยังถอยไป 'KA' ได้เมื่อไม่มีทีมจากทั้งสองฝั่ง
  assert.match(route, /team: owner\?\.team \|\| primaryTeam\(user\) \|\| 'KA'/);
  // 🐞 ของเดิม: ทีมของคนกด (ตกเป็น KA เสมอสำหรับ admin) และเจ้าของ = คนกด
  assert.doesNotMatch(codeOnly(route), /team: user\.team \|\| 'KA'/, 'ทีมของคนกดห้ามกลับมา');
});

test('หน้าจอ PO ถามผู้ดูแลก่อนสร้าง และส่ง id ไปกับคำขอ', () => {
  assert.match(page, /body: JSON\.stringify\(\{ aeOwnerId \}\)/);
  // ล็อกไม่ใช่ซ่อน — ae/senior_ae เห็นชื่อตัวเองค้างไว้ ไม่ใช่ช่องหายไปเฉย ๆ
  assert.match(page, /lockedOwner \? \(/);
  // รายชื่อมาจาก hook กลาง ห้ามกรอง role เองซ้ำในหน้านี้
  assert.match(page, /useDealOwners\(meId\)/);
  assert.doesNotMatch(codeOnly(page), /\["ae", "senior_ae"\]/, 'ห้ามก๊อปกติกา role มาไว้ในหน้า');
});

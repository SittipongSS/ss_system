// ลิงก์หน้าโครงการเก่า → หน้าลูกค้าศูนย์รวม (ยุบดีล/โครงการ P2d · มติเจ้าของ 13/11/2026 ④)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProjectCode, oldProjectRedirectTarget } from './oldProjectLink.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('ทะเบียนเดิม → รายการดีล · รายใบ (ทุกแท็บ/หน้าย่อย) → /go/project/<id|รหัส>', () => {
  assert.equal(oldProjectRedirectTarget('/sa/projects'), '/sa/deals');
  assert.equal(oldProjectRedirectTarget('/sa/projects/'), '/sa/deals');
  assert.equal(oldProjectRedirectTarget('/sa/projects/PRJ-abc'), '/go/project/PRJ-abc');
  assert.equal(oldProjectRedirectTarget('/sa/projects/PRJ-abc/shipment-prep'), '/go/project/PRJ-abc');
  assert.equal(oldProjectRedirectTarget('/sa/projects/PJ-260900254'), '/go/project/PJ-260900254');
  assert.equal(oldProjectRedirectTarget('/pm/projects/PRJ-abc'), '/go/project/PRJ-abc');
});

test('ไม่ใช่หน้าโครงการ = ไม่แตะ (รวม path ที่ขึ้นต้นคล้ายกัน)', () => {
  for (const path of ['/sa/deals', '/sa/projectsx', '/sa/project/PRJ-1', '/database/customers/C1', '/pm/tasks', '/go/project/PRJ-1']) {
    assert.equal(oldProjectRedirectTarget(path), null, path);
  }
});

test('รหัส PJ แยกจาก id ได้', () => {
  assert.equal(isProjectCode('PJ-260900254'), true);
  assert.equal(isProjectCode('PRJ-mudqeiy05sdy'), false);
  assert.equal(isProjectCode(''), false);
});

test('proxy เรียกตัวกลาง เฉพาะหน้า (ไม่ใช่ API) · หน้า /go/project รับทั้ง id และรหัส · เมนูโครงการไม่กลับมา', () => {
  const proxy = read('../../proxy.js');
  assert.match(proxy, /const oldProjectTarget = isApi \? null : oldProjectRedirectTarget\(path\);/);
  const go = read('../../app/go/project/[id]/page.js');
  assert.match(go, /\.eq\(isProjectCode\(id\) \? 'code' : 'id', id\)/);
  assert.match(go, /redirect\(`\/database\/customers\/\$\{encodeURIComponent\(data\.customerId\)\}`\)/);
  assert.doesNotMatch(read('../../config/menuRegistry.js'), /href: '\/sa\/projects'/);
});

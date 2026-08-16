// Tests ขอบเขตทีมของแถวเป้าหมาย/ยอดย้อนหลัง (แก้ 2026-08-16). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolveTargetRowScope } from './salesPlanning.js';

const superUser = { role: 'admin' };
const head = { role: 'ae_supervisor' };
const lead = { role: 'senior_ae', team: 'ODM', teams: ['ODM'] };

test('ผู้มีขอบเขตทั้งระบบ: ตั้งทีมไหนก็ได้ รวมทั้งแถวไร้ทีม (ยอดบริษัท)', () => {
  assert.deepEqual(resolveTargetRowScope(superUser, { team: 'Services' }), { team: 'Services', ownerId: null });
  assert.deepEqual(resolveTargetRowScope(head, { team: 'KA' }), { team: 'KA', ownerId: null });
  assert.deepEqual(resolveTargetRowScope(superUser, {}), { team: null, ownerId: null });
});

test('ผู้ถูกจำกัดทีม: แตะทีมอื่นไม่ได้', () => {
  const res = resolveTargetRowScope(lead, { team: 'Services' });
  assert.equal(res.status, 403);
  assert.equal(res.error, 'forbidden');
});

test('ผู้ถูกจำกัดทีม: ไม่ส่งทีมมา = ทีมหลักของตัวเอง ไม่ใช่ null', () => {
  assert.deepEqual(resolveTargetRowScope(lead, {}), { team: 'ODM', ownerId: null });
});

test('ผู้ถูกจำกัดทีม: ทีมของตัวเองผ่าน', () => {
  assert.deepEqual(resolveTargetRowScope(lead, { team: 'ODM', ownerId: 'U-1' }), { team: 'ODM', ownerId: 'U-1' });
});

test('แถวรายบุคคลต้องมีทีม — ข้อความตามหน้าที่เรียก', () => {
  assert.equal(resolveTargetRowScope(superUser, { ownerId: 'U-1' }, { label: 'เป้า' }).error, 'เป้ารายบุคคลต้องมีทีม');
  assert.equal(resolveTargetRowScope(superUser, { ownerId: 'U-1' }, { label: 'ประวัติ' }).error, 'ประวัติรายบุคคลต้องมีทีม');
});

test('ผู้ถูกจำกัดทีมที่ไม่มีทีมเลย = บัญชีตั้งค่าไม่ครบ → ต้องบล็อก', () => {
  const res = resolveTargetRowScope({ role: 'senior_ae' }, {});
  assert.equal(res.status, 400);
  assert.equal(res.error, 'ต้องระบุทีม');
});

// 🐞 บั๊กที่แก้: history เอา item.team จาก payload ตรง ๆ ขณะที่ targets/bulk คุมทีมไว้
test('ทั้งสองเส้นทางต้องเรียกตัวช่วยตัวเดียวกัน — ห้ามก๊อปกติกาไปอีกที่', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  for (const route of [
    '../app/api/sales-planning/history/route.js',
    '../app/api/sales-planning/targets/bulk/route.js',
  ]) {
    const src = read(route);
    assert.match(src, /resolveTargetRowScope\(user, item/, `${route} ต้องเรียกตัวช่วย`);
    assert.doesNotMatch(src, /const team = item\.team \|\| null;/, `${route} ห้ามอ่าน team จาก payload ตรง ๆ`);
  }
});

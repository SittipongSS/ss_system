import test from 'node:test';
import assert from 'node:assert/strict';
import { productDevLabel, requestedLabel } from './rowLabel.js';
import { fmtDate, NA } from '../format.js';

test('ป้ายสิ่งที่ขอตัดหางลูกศรที่ต่อตอนส่งงาน — รวมลูกศรซ้อนจากรอบแก้', () => {
  assert.equal(requestedLabel('ระบบกระจายกลิ่น · PF9010103 FIRST PLATE → PF9010103-P1 → PF9010103-P1'), 'ระบบกระจายกลิ่น · PF9010103 FIRST PLATE');
  assert.equal(requestedLabel('เทียนหอม · SC-1 Amber'), 'เทียนหอม · SC-1 Amber');
  assert.equal(requestedLabel(null), '');
});

test('⭐ ป้ายพัฒนาสูตรใช้กลิ่นสดจากทะเบียน — รหัสกลิ่นเก่า "-" และรหัสสูตรเก่าหายไป', () => {
  const stale = 'ครีมทามือ · - CHAO PHRAYA THAI CONTEMPORARY 01 REV 3 → 6731108202601';
  assert.equal(
    productDevLabel(stale, { code: 'PF319010103', name: 'CHAO PHRAYA THAI CONTEMPORARY 01 REV 3', producedAt: '2026-09-01' }),
    `ครีมทามือ · PF319010103 · CHAO PHRAYA THAI CONTEMPORARY 01 REV 3 · ${fmtDate('2026-09-01')}`,
  );
  // กลิ่นไม่มีรหัส / รหัสเป็นขีด = "ไม่มี PF" · ไม่มีวันผลิต = ขีด (มติ 13/11: ครบสามท่อนเสมอ)
  assert.equal(productDevLabel('เทียนหอม · - Amber', { code: '-', name: 'Amber' }), `เทียนหอม · ไม่มี PF · Amber · ${NA}`);
  // ไม่มีกลิ่นสด = ป้ายเดิมตัดหาง
  assert.equal(productDevLabel(stale, null), 'ครีมทามือ · - CHAO PHRAYA THAI CONTEMPORARY 01 REV 3');
  assert.equal(productDevLabel('', null), '—');
});

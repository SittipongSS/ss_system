// ยามซอร์สของ GET /api/sales-planning/quotations — ทะเบียนใบเสนอราคาต้องได้ครบทุกใบ
// 🐞 28/10/2569 เดิม `.limit(500)` ⇒ มี 734 ใบ ใบที่สร้างก่อน 28/08 ไม่ถึงจอ ค้นเลข QT ก็ไม่เจอ
// (จอค้น/กรองฝั่งเบราว์เซอร์ทั้งหมด) · ตัวไล่หน้าเองมีเทสต์พฤติกรรมที่ supabaseFetchAll.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const route = readFileSync(join(SRC, 'app/api/sales-planning/quotations/route.js'), 'utf8');

test('🔴 ทะเบียนใบเสนอราคาไล่ทีละหน้าจนครบ ไม่มีเพดานจำนวนใบ', () => {
  const start = route.indexOf("fetchAllResult(() => supabase\n    .from('quotations')");
  assert.ok(start >= 0, 'query หลักของทะเบียนต้องห่อด้วย fetchAllResult');
  const query = route.slice(start, route.indexOf('if (error)', start));
  assert.doesNotMatch(query, /\.(limit|range)\(/, 'ห้ามตัดจำนวนใบเอง — fetchAll ใส่ range ให้ทีละหน้า');
  assert.match(query, /\.order\('createdAt', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: true \}\)/,
    'ต้องมี id ต่อท้ายเป็นลำดับที่นิ่ง ไม่งั้นไล่หน้าแล้วได้แถวซ้ำ/หาย');
});

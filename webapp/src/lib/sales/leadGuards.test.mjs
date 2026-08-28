// ── ด่านของระบบลีดที่ "หน้าจอกับ API ต้องพูดตรงกัน" ────────────────────────
//
// สองเรื่องจากการตรวจ flow LD (2026-08-04) ที่แก้ด้วยมติผู้ใช้:
//
//   1. KPI ลีดมีข้อมูลประเมินผลรายบุคคล (byAssignee = SLA รายคนทั้งฝ่าย,
//      byCreator = ยอดกรอกรายคน) หน้าจอซ่อนจาก AE/AC/Senior AE ผ่าน
//      `canSeeLeadKpi` มาตลอด แต่ API เช็คแค่ `canViewLeads` (หลวมกว่ามาก)
//      ⇒ ยิง URL ตรงอ่านตัวเลขของเพื่อนร่วมทีมได้
//
//   2. ลบลีดที่แตกดีลไปแล้วผ่านได้เงียบ ๆ ทั้งที่ `sales_deals.leadId` เป็น
//      SET NULL (metadata.leadId ค้าง = สองความจริง) และ `lead_events` เป็น
//      CASCADE (ประวัติ conversion ของดีลที่ยังอยู่หายตาม)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canSeeLeadKpi, ROLES } from '../permissions.js';
import { canViewLeads } from './leads.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('KPI ลีด: API ต้องใช้ด่านเดียวกับหน้าจอ (canSeeLeadKpi) ไม่ใช่ canViewLeads', () => {
  const src = read('src/app/api/sales-planning/leads/kpi/route.js');
  assert.match(src, /if \(!canSeeLeadKpi\(user\?\.role\)\) return forbidden\(\)/);
  assert.doesNotMatch(src, /canViewLeads\(user\)/, 'ห้ามกลับไปใช้ด่านที่หลวมกว่าหน้าจอ');
});

// ⭐ หัวใจของเรื่อง: ยืนยันว่ามันเคย**หลวมจริง** ไม่ใช่แก้ของที่ไม่ได้พัง —
// role ที่อ่าน KPI ได้ด้วยด่านเก่า แต่หน้าจอไม่เคยให้เห็น
test('มี role ที่ด่านเก่าปล่อยผ่านแต่หน้าจอซ่อน — ช่องโหว่มีอยู่จริง', () => {
  const leaked = ROLES.filter((role) => canViewLeads({ role }) && !canSeeLeadKpi(role));
  assert.ok(leaked.length > 0, 'ถ้าไม่มีเลยแปลว่าเทสต์นี้ตรวจของที่ไม่มีอยู่');
  for (const role of ['senior_ae', 'ac', 'ae']) {
    assert.ok(leaked.includes(role), `${role} ควรอยู่ในกลุ่มที่เคยรั่ว`);
  }
});

test('canSeeLeadKpi: ผู้กำกับดูแล + ทีม intake + ผู้สังเกตการณ์เท่านั้น', () => {
  for (const role of ['admin', 'ae_supervisor', 'marketing', 'viewer', 'executive']) {
    assert.equal(canSeeLeadKpi(role), true, `${role} ต้องเห็น KPI`);
  }
  for (const role of ['senior_ae', 'ac', 'ae', 'rd', 'ra', 'staff', 'secretary']) {
    assert.equal(canSeeLeadKpi(role), false, `${role} ต้องไม่เห็น KPI`);
  }
});

test('ลบลีด: ต้องบล็อกเมื่อยังมีดีลผูกอยู่ + มีทางบังคับของแอดมิน', () => {
  const src = read('src/app/api/sales-planning/leads/[id]/route.js');
  assert.match(src, /\.from\('sales_deals'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('leadId', id\)/);
  assert.match(src, /return conflict\(/, 'ต้องตอบ 409 พร้อมบอกทางออก ไม่ใช่ลบผ่าน');
  assert.match(src, /isForceRequest\(req\) && canForceDelete\(user\)/, 'แอดมินต้องมีทางบังคับลบ');
});

test('ลบลีด (บังคับ): ต้องล้าง metadata.leadId ของดีลที่ผูกอยู่ก่อน', () => {
  const src = read('src/app/api/sales-planning/leads/[id]/route.js');
  // คอลัมน์ถูก SET NULL ให้เองที่ระดับ DB แต่ metadata เป็น jsonb ไม่มีใครตามล้าง
  assert.match(src, /const \{ leadId: _dropped, \.\.\.rest \} = deal\.metadata \|\| \{\}/);
});

test('ปุ่มลบบนหน้ารายละเอียดต้องหายไปเมื่อลีดมีดีลแล้ว (ไม่ปล่อยให้กดแล้ว 409)', () => {
  const src = read('src/app/api/sales-planning/leads/[id]/route.js');
  assert.match(src, /canDelete: canDeleteLead\(user, lead\) && !\(relatedDeals \|\| \[\]\)\.length/);
});

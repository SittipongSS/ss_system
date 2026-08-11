// ── ตัวสลับขอบเขตบนคิวลีด: "ของฉัน / ทีม / ทั้งหมด" ────────────────────────
//
// กับดักของปุ่มแบบนี้คือ **เสนอขอบเขตที่กว้างกว่าที่ผู้ใช้เห็นได้จริง** — กดแล้ว
// ผลลัพธ์เท่าเดิม หรือแย่กว่านั้นคือป้าย "ทั้งหมด" ที่ไม่ได้แปลว่าทั้งบริษัท
// (Senior AE เห็นได้แค่ทีมตัวเอง ปุ่ม "ทั้งหมด" จึงโกหก)
//
// เทสต์นี้ผูกตัวเลือกเข้ากับ `applyLeadScope` ตัวจริง — เพิ่ม/แก้ scope ฝั่งไหน
// อีกฝั่งต้องขยับตาม ไม่งั้นแดง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROLES, leadScopes, isReadOnlyObserver, isSuperuser, salesDealScopes, pmTaskScopes } from '../permissions.js';
import { applyLeadScope, canViewLeads } from './leads.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/* จำลอง query builder แล้วดูว่า applyLeadScope เรียกอะไร → บอกได้ว่า role นั้น
   "เห็นกว้างแค่ไหนจริง ๆ" โดยไม่ต้องต่อฐานข้อมูล */
function actualBreadth(role) {
  const calls = [];
  const q = {
    eq: (col, val) => { calls.push(['eq', col, val]); return q; },
    // ขอบเขตทีมเป็น `.in()` แล้ว — คนหนึ่งคนอยู่ได้หลายทีม (มติผู้ใช้ 2026-08-11)
    in: (col, vals) => { calls.push(['in', col, vals]); return q; },
    or: (expr) => { calls.push(['or', expr]); return q; },
  };
  const out = applyLeadScope(q, { role, id: 'U-1', team: 'ODM', teams: ['ODM'] });
  if (out === q && !calls.length) return 'all';           // คืน query เดิม = ไม่กรอง
  const [kind, col, val] = calls[0];
  if (kind === 'or') return 'own';                        // assigneeId/createdBy
  if (col === 'team') return 'team';                      // in('team', [...])
  if (col === 'id' && val === '__no_lead_scope__') return 'none';
  return 'unknown';
}

test('ตัวอ่านขอบเขตจริงใช้งานได้ (กันเทสต์กลายเป็นเทสต์เปล่า)', () => {
  assert.equal(actualBreadth('admin'), 'all');
  assert.equal(actualBreadth('senior_ae'), 'team');
  assert.equal(actualBreadth('ae'), 'own');
  assert.equal(actualBreadth('rd'), 'none');
});

// ⭐ หัวใจ: ปุ่มต้องไม่กว้างเกินของจริง
test('ไม่มี role ไหนได้ตัวเลือกกว้างกว่าที่เห็นได้จริง', () => {
  const rank = { mine: 1, team: 2, all: 3 };
  const maxOf = { own: 1, team: 2, all: 3, none: 0 };
  for (const role of ROLES) {
    const widest = Math.max(0, ...leadScopes(role).map((s) => rank[s]));
    assert.ok(
      widest <= maxOf[actualBreadth(role)],
      `${role}: ปุ่มกว้างสุด=${widest} แต่ applyLeadScope ให้แค่ ${actualBreadth(role)}`,
    );
  }
});

test('role ที่มองไม่เห็นลีดเลย ต้องไม่มีปุ่มขอบเขต', () => {
  for (const role of ROLES) {
    if (actualBreadth(role) === 'none') {
      assert.deepEqual(leadScopes(role), [], `${role} ไม่เห็นลีด จึงต้องไม่มีตัวเลือก`);
    }
  }
});

test('ผู้สังเกตการณ์ได้ "ทั้งหมด" อย่างเดียว — กติกาเดียวกับดีล/งาน', () => {
  for (const role of ROLES.filter(isReadOnlyObserver)) {
    assert.deepEqual(leadScopes(role), ['all'], role);
    assert.deepEqual(salesDealScopes(role), ['all'], `${role}: ดีลต้องเหมือนกัน`);
    assert.deepEqual(pmTaskScopes(role), ['all'], `${role}: งานต้องเหมือนกัน`);
  }
});

test('ทีม intake (marketing) ได้ "ของฉัน" ไว้ดูยอดที่ตัวเองกรอก', () => {
  assert.deepEqual(leadScopes('marketing'), ['mine', 'all']);
});

test('หัวหน้าทีม/AC กว้างสุดแค่ทีม — ไม่มีปุ่ม "ทั้งหมด" ที่โกหก', () => {
  for (const role of ['senior_ae', 'ac']) {
    assert.deepEqual(leadScopes(role), ['mine', 'team'], role);
    assert.ok(!leadScopes(role).includes('all'), `${role} เห็นแค่ทีม ห้ามมีปุ่มทั้งหมด`);
  }
});

test('AE เหลือตัวเลือกเดียว → หน้าต้องซ่อนปุ่มไม่ให้กดของที่ไม่มีผล', () => {
  assert.deepEqual(leadScopes('ae'), ['mine']);
  const page = readFileSync(join(ROOT, 'src/app/sales-planning/leads/page.js'), 'utf8');
  assert.match(page, /scopes\.length > 1 && \(/, 'ตัวเลือกเดียวต้องไม่โชว์ปุ่ม');
});

/* ตั้งต้นที่ตัวกว้างสุด — ไม่งั้นคนที่เคยเห็นคิวทั้งทีมจะเปิดหน้ามาแล้วของหายไปเฉย ๆ
   (พฤติกรรมวันนี้คือเห็นทุกใบที่ API คืนมา) */
test('ตั้งต้นที่ขอบเขตกว้างสุด ไม่ใช่ "ของฉัน"', () => {
  const page = readFileSync(join(ROOT, 'src/app/sales-planning/leads/page.js'), 'utf8');
  assert.match(page, /scopes\[scopes\.length - 1\]/, 'ค่าตั้งต้นต้องเป็นตัวสุดท้าย (กว้างสุด)');
});

test('"ของฉัน" นับทั้งใบที่ถูกมอบให้ และใบที่ตัวเองกรอก — ตรงกับ applyLeadScope', () => {
  const page = readFileSync(join(ROOT, 'src/app/sales-planning/leads/page.js'), 'utf8');
  assert.match(page, /l\.assigneeId === meId \|\| l\.createdBy === meId/);
  // ฝั่ง server ก็ใช้สองช่องเดียวกัน (สาขา role === 'ae')
  const lib = readFileSync(join(ROOT, 'src/lib/sales/leads.js'), 'utf8');
  assert.match(lib, /assigneeId\.eq\.\$\{user\?\.id \?\? ''\},createdBy\.eq\./);
});

test('ทุก role ที่เปิดหน้าลีดได้ ต้องมีอย่างน้อย 1 ตัวเลือก (ไม่มีหน้าที่กดอะไรไม่ได้เลย)', () => {
  for (const role of ROLES) {
    if (!canViewLeads({ role }) || actualBreadth(role) === 'none') continue;
    assert.ok(leadScopes(role).length >= 1, `${role} เปิดหน้าได้แต่ไม่มีขอบเขตให้เลือก`);
  }
});

/* ── ตัวสลับขอบเขตต้องทำงานเหมือนกันทั้งคิวลีดและไปป์ไลน์ดีล ────────────────
   🐞 หน้าดีลเคยกรองแค่ตัวเลข KPI — ตารางข้างล่างไม่ขยับ ผู้ใช้กด "ของฉัน" แล้วเห็น
   ตัวเลขเปลี่ยนแต่รายการเท่าเดิม อ่านไม่ออกว่าปุ่มทำอะไร (พบตอนตรวจ DL 2026-08-05)
   และตั้งต้นที่ "ของฉัน" เสมอ ⇒ แอดมิน/หัวหน้าฝ่ายที่ไม่ได้เป็นเจ้าของดีลสักใบ
   เปิดหน้ามาเจอ KPI เป็น 0 ทุกช่องทั้งที่ตารางมีดีลเต็ม */
const dealsPage = () => readFileSync(join(ROOT, 'src/app/sales-planning/deals/page.js'), 'utf8');
const leadsPage = () => readFileSync(join(ROOT, 'src/app/sales-planning/leads/page.js'), 'utf8');

test('หน้าดีล: ขอบเขตกรองทั้ง KPI และตาราง ไม่ใช่ KPI อย่างเดียว', () => {
  const src = dealsPage();
  assert.match(src, /const kpiDeals = deals\.filter\(inScopeDeal\)/, 'KPI ต้องใช้ตัวกรองร่วม');
  assert.match(src, /if \(!inScopeDeal\(deal\)\) return false;/, 'ตารางต้องใช้ตัวกรองร่วมด้วย');
});

test('ทั้งสองหน้าตั้งต้นที่ขอบเขตกว้างสุด', () => {
  for (const [name, src] of [['ดีล', dealsPage()], ['ลีด', leadsPage()]]) {
    assert.match(src, /Scopes\[[a-zA-Z]+Scopes\.length - 1\]|scopes\[scopes\.length - 1\]/,
      `หน้า${name}: ค่าตั้งต้นต้องเป็นตัวสุดท้าย (กว้างสุด)`);
  }
});

test('ทั้งสองหน้าใช้ Segmented ตัวกลาง + ป้ายชุดเดียวกัน', () => {
  for (const [name, src] of [['ดีล', dealsPage()], ['ลีด', leadsPage()]]) {
    assert.match(src, /import Segmented from "@\/components\/ui\/Segmented"/, `หน้า${name}`);
    assert.match(src, /SCOPE_LABELS\[key\]/, `หน้า${name}: ต้องใช้ป้ายชุดกลาง`);
    // ปุ่มดิบใน div.segmented = หนี้ rawButtonClass ของชั้นเก่า
    assert.doesNotMatch(src, /className="segmented [a-z-]*"/, `หน้า${name}: ห้ามเขียน segmented เอง`);
  }
});

/* 🐞 ผู้ใช้ทักษ 2026-08-05: ตัวสลับของคิวลีดปุ่มเล็กกว่าและกว้างไม่เท่ากันเมื่อเทียบกับ
   หน้าดีล เพราะขนาดปุ่มอยู่ในคลาส `.deal-scope-toggle` ที่หน้าดีล/งาน PM ใส่ แต่คิวลีด
   ไม่ได้ใส่ (คิวลีดไปครอบ div ของตัวเองแทน ทำให้เยื้องคนละแนวอีกด้วย)
   คลาสถูกเปลี่ยนชื่อเป็น `.scope-toggle` เพราะไม่ใช่ของหน้าดีลคนเดียวแล้ว */
test('ตัวสลับขอบเขตทุกหน้าใช้คลาสขนาดเดียวกัน', () => {
  const globals = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
  assert.match(globals, /\.scope-toggle > button \{[^}]*min-width/, 'ต้องกำหนด min-width ที่ปุ่ม ไม่งั้นแต่ละป้ายกว้างไม่เท่ากัน');
  assert.doesNotMatch(globals, /\.deal-scope-toggle/, 'ชื่อเดิมที่ผูกกับหน้าดีลต้องไม่เหลือ');
  for (const rel of ['src/app/sales-planning/deals/page.js', 'src/app/sales-planning/leads/page.js', 'src/app/pm/tasks/page.js']) {
    assert.match(readFileSync(join(ROOT, rel), 'utf8'), /scope-toggle/, `${rel} ต้องใช้คลาสเดียวกัน`);
  }
  // คิวลีดต้องไม่ครอบ div ของตัวเองอีก — เยื้องต้องมาจากคอนเทนเนอร์เดียวกับหน้าดีล
  assert.doesNotMatch(leadsPage(), /styles\.scopeBar/, 'ห้ามมี wrapper เฉพาะหน้า');
});

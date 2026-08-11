import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTeamScope, asList } from './reportFilters.js';

// ตัว query ปลอมที่บันทึกว่ามีการต่อ filter อะไรลงไป — ตรวจ query ที่ *ประกอบได้จริง*
// ไม่ใช่ตัวอักษรในไฟล์ (ตัวกรองที่ผิดแล้วเงียบคือบั๊กตระกูลที่แพงที่สุดของโมดูลนี้)
const fakeQuery = () => {
  const calls = [];
  const q = {
    calls,
    or(expr) { calls.push(['or', expr]); return q; },
    in(col, vals) { calls.push(['in', col, vals]); return q; },
  };
  return q;
};

// 🐞 บั๊กจริง: รายงานกรองด้วย `.eq('team', X)` → แถว `team = null` หายจากรายงานของทุกทีม
// แถวพวกนี้เกิดทุกครั้งที่คนไม่มีทีม (แอดมิน/นิติกรรม/ธุรการ) เป็นคนสร้างเอกสาร
test('ขอบเขตของผู้ใช้: ทีมตัวเอง + แถวไร้ทีม (ของกลาง) — ห้ามเป็น eq เดี่ยว', () => {
  const q = applyTeamScope(fakeQuery(), { scopeTeam: 'KA' });
  assert.deepEqual(q.calls, [['or', 'team.in.(KA),team.is.null']]);
  // `is.null` เท่านั้นที่ทำงาน — `eq.null` PostgREST ตีเป็น `= NULL` = 0 แถว
  assert.match(q.calls[0][1], /team\.is\.null/);
});

// คนหนึ่งคนอยู่ได้หลายทีม (มติผู้ใช้ 2026-08-11) — ขอบเขตต้องครอบทุกทีมที่สังกัด
// ไม่งั้นรายงานของ AE ที่อยู่ ODM+SV จะขาดครึ่งหนึ่งไปเงียบ ๆ
test('ขอบเขตของผู้ใช้รับหลายทีม — ยังพ่วงแถวไร้ทีมเหมือนเดิม', () => {
  const q = applyTeamScope(fakeQuery(), { scopeTeam: ['ODM', 'SV'] });
  assert.deepEqual(q.calls, [['or', 'team.in.(ODM,SV),team.is.null']]);
  // อาร์เรย์ว่าง = ไม่มีทีม = scope ไม่ได้ → ไม่บังคับ (กติกาเดิม)
  assert.deepEqual(applyTeamScope(fakeQuery(), { scopeTeam: [] }).calls, []);
});

test('scopeTeam ว่าง = ไม่บังคับขอบเขต (role ที่เห็นทุกทีม / คนที่ไม่มีทีมจึง scope ไม่ได้)', () => {
  assert.deepEqual(applyTeamScope(fakeQuery(), { scopeTeam: null }).calls, []);
  assert.deepEqual(applyTeamScope(fakeQuery(), {}).calls, []);
  assert.deepEqual(applyTeamScope(fakeQuery()).calls, []);
});

// ⭐ หัวใจของการแยกสองความหมาย: ตัวกรองที่ผู้ใช้ *เลือก* ต้องได้เฉพาะทีมที่เลือก —
// ไม่พ่วงแถวไร้ทีม (ถ้าพ่วง แอดมินที่กรอง KA จะได้แถวที่ไม่ใช่ KA ติดมาด้วย = ผิด)
test('ตัวกรองที่ผู้ใช้เลือก: เฉพาะทีมที่เลือก ไม่พ่วงแถวไร้ทีม + รับหลายค่า', () => {
  assert.deepEqual(applyTeamScope(fakeQuery(), { team: 'KA' }).calls, [['in', 'team', ['KA']]]);
  assert.deepEqual(
    applyTeamScope(fakeQuery(), { team: 'KA,ODM' }).calls,
    [['in', 'team', ['KA', 'ODM']]],
  );
  assert.deepEqual(applyTeamScope(fakeQuery(), { team: ['KA', 'SV'] }).calls, [['in', 'team', ['KA', 'SV']]]);
  // ว่าง / 'all' = ไม่กรอง (มาตรฐานตัวกรองของบ้านนี้)
  assert.deepEqual(applyTeamScope(fakeQuery(), { team: '' }).calls, []);
  assert.deepEqual(applyTeamScope(fakeQuery(), { team: 'all' }).calls, []);
  assert.deepEqual(applyTeamScope(fakeQuery(), { team: [] }).calls, []);
});

// สองช่องนี้ AND กัน ผู้ใช้ที่ scope 'team' ส่ง ?team= มาได้แต่ทำให้ *แคบลง* เท่านั้น
// ห้ามให้ ?team= กลายเป็นทางขยายขอบเขตของตัวเอง
test('สองช่องทำงานร่วมกันแบบ AND — ?team= ขยายขอบเขตของผู้ใช้ไม่ได้', () => {
  const q = applyTeamScope(fakeQuery(), { scopeTeam: 'KA', team: 'ODM' });
  assert.deepEqual(q.calls, [['or', 'team.in.(KA),team.is.null'], ['in', 'team', ['ODM']]]);
  // ขอบเขตยังอยู่ครบ — คน KA ขอ ODM แล้ว AND กันได้ผลลัพธ์ว่าง ไม่ใช่ได้ ODM มา
  const scoped = applyTeamScope(fakeQuery(), { scopeTeam: 'KA', team: 'KA' });
  assert.deepEqual(scoped.calls, [['or', 'team.in.(KA),team.is.null'], ['in', 'team', ['KA']]]);
});

test('asList: comma / array / ว่าง / all', () => {
  assert.deepEqual(asList('a,b'), ['a', 'b']);
  assert.deepEqual(asList(['a', null, 'b']), ['a', 'b']);
  assert.deepEqual(asList('all'), []);
  assert.deepEqual(asList(''), []);
  assert.deepEqual(asList(null), []);
});

// ── สัญญาของ route + ผู้เรียกทั้งสองทาง (อ่าน source — ไม่มี harness เรียก handler ตรง ๆ)
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const reportsRoute = read('../../app/api/tax/reports/route.js');
const reportsLib = read('./reports.js');
const zipLib = read('./registrationFiles.js');

// เดิม `const team = viewScopeUser(user) === 'team' ? (user?.team ?? null) : searchParams.get('team')`
// = ตัวแปรเดียวแบกสองความหมาย ซึ่งเป็นเหตุผลที่บั๊กแถวไร้ทีมแก้ที่นี่ไม่ได้
test('route แยก ขอบเขตของผู้ใช้ ออกจาก ตัวกรองที่ผู้ใช้เลือก เป็นสองช่อง', () => {
  assert.match(reportsRoute, /const scopeTeam = viewScopeUser\(user\) === 'team' \? userTeams\(user\) : null/);
  assert.match(reportsRoute, /scopeTeam,/);
  assert.match(reportsRoute, /team: teamFilter,/);
  assert.doesNotMatch(
    codeOnly(reportsRoute),
    /viewScopeUser\(user\) === 'team' \? \(user\?\.team \?\? null\) : searchParams\.get\('team'\)/,
    'นิพจน์เดิมที่แบกสองความหมายห้ามกลับมา',
  );
});

// ทีมที่พิมพ์ผิดต้องเด้ง ไม่ใช่ถูกกรองทิ้งแล้วได้ "ทุกทีม" กลับไปเงียบ ๆ
test('route เด้งทีมที่ไม่รู้จัก ไม่กรองทิ้งเงียบ ๆ', () => {
  assert.match(reportsRoute, /const unknownTeams = teamFilter\.filter\(\(t\) => !TEAMS\.includes\(t\)\)/);
  assert.match(reportsRoute, /status: 400/);
});

// กฎต้องอยู่ที่เดียว: ตัวรายงานกับ ZIP อ่านตัวกรองชุดเดียวกัน ถ้าเขียนแยกกันจะเพี้ยนหากัน
// (เห็นตารางชุดหนึ่ง ดาวน์โหลดได้อีกชุด)
test('ทั้งตัวรายงานและ ZIP ใช้ applyTeamScope ตัวเดียวกัน — ห้ามมี .eq(team) ค้าง', () => {
  for (const [name, src] of [['reports', reportsLib], ['zip', zipLib]]) {
    assert.match(src, /applyTeamScope\(/, `${name} ต้องใช้ตัวกลาง`);
    assert.doesNotMatch(codeOnly(src), /\.eq\('team',/, `${name} ห้ามกรองทีมเองด้วย eq`);
  }
});

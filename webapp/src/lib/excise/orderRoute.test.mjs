// สัญญาของ route ใบยื่นภาษี (orders) — ตรรกะอยู่ใน handler ที่ยังไม่มี harness เรียกตรง ๆ
// ได้ จึงล็อกด้วยการอ่าน source (แพตเทิร์นเดียวกับ registrationRoute.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะโค้ดจริง — ไม่งั้นคอมเมนต์ที่อธิบายบั๊กเดิม
// (ซึ่งต้องพูดถึงนิพจน์เก่า) จะทำให้เทสต์แดงเอง
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const listRoute = read('../../app/api/orders/route.js');
const listCode = codeOnly(listRoute);
const customersRoute = read('../../app/api/customers/route.js');
const fromSalesOrderRoute = read('../../app/api/tax/orders/from-sales-order/route.js');

// 🐞 บั๊กจริง: `.eq('team', user?.team ?? null)` พลาดสองชั้นพร้อมกัน (ยืนยันกับ PostgREST จริง)
//  1. แถว team = null หายจากลิสต์ของ **ทุกทีม** — ซึ่งเกิดทุกครั้งที่คนไม่มีทีม
//     (admin/legal/staff · prod มี 10 บัญชี) เป็นคนสร้าง เพราะ POST ตรึง team = user.team
//  2. คนที่ scope 'team' แต่ไม่มีทีม จะได้ `team=eq.null` ซึ่ง PostgREST แปลเป็น `= NULL`
//     → 0 แถว (มีแต่ `is.null` ที่ทำงาน) = ลิสต์ว่างเปล่าโดยไม่มี error เตือน
test('ลิสต์ใบยื่น: ทีมตัวเอง + แถวไม่มีทีม (ของกลาง) — ห้ามใช้ eq(team, null)', () => {
  assert.match(
    listRoute,
    /if \(viewScopeUser\(user\) === 'team' && user\?\.team\) \{/,
    'คนที่ scope team แต่ไม่มีทีม scope ไม่ได้ → ต้องไม่กรองเลย',
  );
  assert.match(
    listRoute,
    /query\.or\(`team\.eq\.\$\{user\.team\},team\.is\.null`\)/,
    'ต้องรวมแถว team = null ด้วย และ null ต้องเทียบด้วย is.null',
  );
  assert.doesNotMatch(
    listCode,
    /\.eq\('team',\s*user\?\.team \?\? null\)/,
    'นิพจน์เดิมห้ามกลับมา — ซ่อนของกลางจากทุกทีม + ให้ 0 แถวกับคนไม่มีทีม',
  );
});

// กฎบ้านนี้เขียนไว้ที่ /api/customers GET: "ไม่มีทีม = ของกลาง" และ "scope ไม่ได้ = เห็นทั้งหมด"
// ล็อกไว้เพื่อให้เห็นว่าทั้งสองที่อ่านกฎฉบับเดียวกัน ไม่ใช่บังเอิญเขียนคล้ายกัน
test('กฎ team scope ของใบยื่นตรงกับต้นฉบับที่ /api/customers', () => {
  assert.match(customersRoute, /viewScopeUser\(user\) === 'team' && user\?\.team/);
  assert.match(customersRoute, /teams\.length === 0 \|\| teams\.includes\(user\.team\)/);
});

// ต้นตอของแถว team = null คือ POST ที่ตรึงทีมของคนกด — คนไม่มีทีมกดสร้างได้จริง จึงต้อง
// ถอยไปใช้ทีมที่ดูแลลูกค้าเจ้าของใบ · ลูกค้าหลายทีม = เดาไม่ได้ ปล่อย null (ของกลาง)
// ดีกว่าตรึงผิดทีมแล้วทีมจริงมองไม่เห็นใบของตัวเอง
test('POST ตรึงทีมจากลูกค้าเมื่อคนสร้างไม่มีทีม และไม่เดาเมื่อลูกค้าหลายทีม', () => {
  assert.match(listRoute, /import \{ caretakerTeamsOf, viewScopeUser \} from '@\/lib\/permissions'/);
  assert.match(listRoute, /const caretakerTeams = caretakerTeamsOf\(customer\)/);
  assert.match(
    listRoute,
    /const orderTeam = user\?\.team \?\? \(caretakerTeams\.length === 1 \? caretakerTeams\[0\] : null\)/,
    'ทีมเดียวเท่านั้นที่ถอยไปใช้ได้ — หลายทีมต้องเป็น null',
  );
  assert.match(listCode, /^\s*team: orderTeam,$/m);
  assert.doesNotMatch(listCode, /^\s*team: user\?\.team \?\? null,$/m, 'ห้ามกลับไปตรึงทีมของคนกดตรง ๆ');
  // customer ต้องถูกดึงมาแบบเต็มแถว ไม่งั้น teams[] (mig 0037) หายแล้ว caretakerTeamsOf
  // จะถอยไปอ่าน team เดี่ยวอย่างเงียบ ๆ
  assert.match(listRoute, /\.from\('customers'\)\s*\n\s*\.select\('\*'\)/);
});

// อีกทางที่สร้างใบยื่น (ออกจาก Sale Order) ตรึงทีมจากดีลแม่อยู่แล้ว — แหล่งที่ตรงกว่า
// ลูกค้า จึงไม่ต้องแก้ ล็อกไว้กันใครเปลี่ยนไปใช้ทีมของคนกดแทน
test('ทางออกใบยื่นจาก SO ยังตรึงทีมจากดีลแม่ ไม่ใช่ทีมของคนกด', () => {
  assert.match(fromSalesOrderRoute, /team: salesOrder\.deal\?\.team \|\| null/);
  assert.doesNotMatch(codeOnly(fromSalesOrderRoute), /team: user\?\.team/);
});

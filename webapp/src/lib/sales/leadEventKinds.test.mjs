// ── kind ที่โค้ดเขียนลง lead_events ต้องอยู่ใน CHECK ของตารางเสมอ ────────────
//
// อาการที่เจอตอนตรวจ flow LD → DL (2026-08-04): เปิดดีลจากลีดแล้วประวัติของลีด
// ไม่มีบรรทัด "สร้างดีล" เลย และลีดที่แตกดีลใบที่ 2 ขึ้นไปไม่ทิ้งร่องรอยอะไรไว้
//
// ต้นเหตุไม่ใช่ตรรกะ แต่เป็น **CHECK constraint กับโค้ดที่หลุดจากกัน**:
// mig 0091 ตั้งชุด kind ไว้โดยไม่มี 'create_deal' แต่ POST /deals เขียนค่านี้
// (transition route ปิด create_deal ของตัวเองแล้ว ทางนั้นจึงเป็นทางเดียว)
// ⇒ insert ชน constraint ทุกครั้ง + โค้ดไม่ได้อ่าน error ⇒ เงียบสนิท
//
// เทสต์นี้เทียบสองฝั่งตรง ๆ: ค่าที่ปรากฏใน `kind:` ของโค้ด ต้องอยู่ในชุดของ
// CHECK ล่าสุด (0289) — เพิ่ม kind ใหม่ในโค้ดโดยไม่แตะ migration แล้วจะแดงทันที
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEAD_TRANSITIONS } from './leads.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ⚠️ ต้องชี้ migration **ล่าสุด** ที่นิยาม CHECK นี้ — ชี้ไฟล์เก่าเมื่อไหร่เทสต์จะเขียว
// ทั้งที่ของจริงบน DB เป็นอีกชุด (บทเรียนเดียวกับ deal_probability_for_stage)
const KIND_CHECK_MIGRATION = 'supabase/migrations/0289_lead_follow_up.sql';

function allowedKinds() {
  const sql = read(KIND_CHECK_MIGRATION);
  // อ่านเฉพาะส่วนที่รันจริง — ท้ายไฟล์มีบล็อก Rollback ที่พิมพ์ CHECK **ชุดเก่า** ไว้
  // เป็นคอมเมนต์ ถ้าไปหยิบชุดนั้นมาเทียบ เทสต์จะตรวจของที่ไม่ได้ใช้จริง
  const body = sql.slice(0, sql.indexOf('COMMIT;'));
  const add = body.slice(body.indexOf('ADD CONSTRAINT lead_events_kind_check'));
  const list = add.slice(add.indexOf('IN ('), add.indexOf('));'));
  const kinds = [...list.matchAll(/'([a-z_]+)'/g)].map(([, kind]) => kind);
  assert.ok(kinds.length > 0, 'อ่านชุด kind จาก migration ไม่ได้ — เทสต์นี้จะกลายเป็นเทสต์เปล่า');
  return new Set(kinds);
}

// ทุกจุดในแอปที่ insert ลง lead_events
const WRITERS = [
  'src/app/api/sales-planning/leads/route.js',
  'src/app/api/sales-planning/leads/[id]/transition/route.js',
  'src/app/api/sales-planning/deals/route.js',
];

test('CHECK ของ lead_events.kind ต้องมี create_deal (mig 0199)', () => {
  assert.ok(allowedKinds().has('create_deal'), 'ไม่มี create_deal = ประวัติการเปิดดีลจากลีดจะล้มเงียบอีก');
});

test('kind ที่โค้ดเขียนตรง ๆ ต้องอยู่ใน CHECK ทุกค่า', () => {
  const allowed = allowedKinds();
  for (const rel of WRITERS) {
    const src = read(rel);
    for (const [, kind] of src.matchAll(/kind:\s*'([a-z_]+)'/g)) {
      assert.ok(allowed.has(kind), `${rel} เขียน kind='${kind}' ที่ CHECK ไม่ยอมรับ`);
    }
  }
});

// transition route เขียน `kind: action` ตรง ๆ จาก body — ทุก action ที่เดินถึง insert
// ได้ต้องอยู่ใน CHECK ด้วย (create_deal ถูกปฏิเสธก่อนถึง insert ที่ route นั้น แต่ตอนนี้
// อยู่ในชุดแล้วก็ไม่เป็นไร)
test('ทุก transition ของลีดมีที่ยืนใน CHECK — ไม่มี action ไหนเขียนแล้วชน', () => {
  const allowed = allowedKinds();
  const actions = new Set(Object.values(LEAD_TRANSITIONS).flat());
  for (const action of actions) {
    assert.ok(allowed.has(action), `transition "${action}" ไม่อยู่ในชุด kind ของ lead_events`);
  }
});

test('insert lead_event ตอนเปิดดีลต้องอ่าน error ไม่ใช่ทิ้ง', () => {
  const src = read('src/app/api/sales-planning/deals/route.js');
  assert.match(
    src,
    /const \{ error: leadEventError \} = await supabase\.from\('lead_events'\)\.insert\(/,
    'ต้องรับ error กลับมา',
  );
  assert.match(src, /if \(leadEventError\)/, 'ต้องมีทางจัดการเมื่อเขียนไม่สำเร็จ');
});

// Tests for the project cascade-delete helpers. The point of deleteProjectDeep
// is that personal_tasks, project_doc_revisions AND dept_requests (logical projectId
// links, no FK — migrations 0019/0040/0173) get cleared BEFORE the project row is
// deleted — otherwise they dangle. We drive it with a fake supabase that records
// the order of table operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deleteProjectDeep, projectHasExciseRegistrations } from './projectsRepo.js';

// Minimal chainable fake:
//   .from(t).select(..).eq(..)        → { count } (head-count query)
//   .from(t).select('id').eq(..)      → { data } (list query — dept_requests lookup)
//   .from(t).delete().eq(..)/.in(..)  → records op
// deleteProjectDeep นับด้วย select(...{head:true}) และดึงรายการคำร้องด้วย
// select('id') — fake นี้ตอบทั้ง count และ data พร้อมกันเลยใช้ได้ทั้งสองทาง.
// `errors` — คีย์ `select:<table>` · `delete:<table>` · `rpc:<fn>` ⇒ ตอบ { error } แทน
// (supabase ไม่ throw — ความล้มเหลวมาเป็นค่าที่คืน ไม่ใช่ exception)
function fakeSupabase({ counts = {}, rows = {}, ops = [], rpcArgs = [], errors = {} } = {}) {
  return {
    from(table) {
      return {
        select() {
          /* ⚠️ ต้อง chain `.eq()` ได้หลายชั้นและ `.in()` ด้วย — `listAttachments`
             (ที่ `purgeAttachments` เรียก) ใช้ `.eq().eq().order()` ส่วนการหางาน
             ใต้โครงการใช้ `.eq()` ชั้นเดียว · เดิม fake รองรับชั้นเดียวเลยพังทันที
             ที่ deleteProjectDeep เริ่มกวาดไฟล์แนบ (ซึ่งเป็นพฤติกรรมที่ต้องการ) */
          const failed = errors[`select:${table}`];
          const result = () => Promise.resolve(failed
            ? { count: null, data: null, error: failed }
            : { count: counts[table] ?? 0, data: rows[table] ?? [], error: null });
          /* ⚠️ `.order()` ต้องคืน chain ที่ไปต่อ `.range()` ได้ — `fetchAll` ไล่ทีละหน้า
             ด้วย `.range()` · 🪤 เดิม `.order` คืน promise ตรง ๆ ⇒ `.range is not a
             function` ⇒ `fetchAllResult` กลืนเป็น `{ error }` แล้ว deleteProjectDeep
             ทิ้ง error นั้น ⇒ **ช่วงกวาดไฟล์แนบของงานไม่เคยถูกรันในเทสต์นี้เลย** เทสต์
             ผ่านเพราะบั๊กตัวเดียวกับที่มันควรจับ */
          const chain = {
            eq: () => chain,
            in: () => chain,
            order: () => chain,
            range: result,
            then: (resolve, reject) => result().then(resolve, reject),
          };
          return chain;
        },
        delete() {
          // ⚠️ ต้อง chain ได้ทั้ง `.eq()` เดี่ยว และ `.eq(...).in(...)` (purgeUpdatesMany
          // + purgeNotificationsMany ใช้ท่าหลัง) · เดิม hardcode ชื่อ 'entity_updates'
          // ไว้ตัวเดียว พอเพิ่มตารางที่ใช้ท่าเดียวกันเทสต์ก็ล้มด้วย TypeError ทันที
          // → ทำเป็น chain ที่นับ op ตอนถูก await หรือตอนจบด้วย .in() แทน
          const done = () => { ops.push(table); return Promise.resolve({ error: errors[`delete:${table}`] || null }); };
          const chain = {
            eq: () => chain,
            in: done,
            then: (resolve, reject) => done().then(resolve, reject),
          };
          return chain;
        },
      };
    },
    // คำร้องลบผ่าน RPC เท่านั้น — guard_dept_request (0173) บล็อกการลบตรง
    rpc(fn, args) {
      ops.push(`rpc:${fn}`); rpcArgs.push(args);
      return Promise.resolve({ error: errors[`rpc:${fn}`] || null });
    },
  };
}

test('deleteProjectDeep clears logical-link children before deleting the project', async () => {
  const ops = [];
  const supabase = fakeSupabase({
    counts: { personal_tasks: 3, project_doc_revisions: 2 },
    rows: { dept_requests: [{ id: 'DR1' }, { id: 'DR2' }] },
    ops,
  });
  const removed = await deleteProjectDeep(supabase, 'PRJ-1');

  // projects must be deleted LAST (after the FK-less children are cleared).
  assert.equal(ops[ops.length - 1], 'projects');
  assert.ok(ops.indexOf('personal_tasks') < ops.indexOf('projects'));
  assert.ok(ops.indexOf('project_doc_revisions') < ops.indexOf('projects'));
  // 🪤 เดิมสองบรรทัดนี้เช็ค `inquiry_messages`/`inquiries` ซึ่ง mig 0174 DROP ไปแล้ว
  // และ repo เลิกแตะตั้งแต่ #790 → `indexOf` คืน -1 แล้ว `-1 < N` เป็นจริงตลอด
  // = **เทสต์ที่ไม่มีทางล้ม** ปล่อยไว้คือหลอกตัวเองว่ามีตาข่ายอยู่
  // ของจริงตอนนี้: คำร้องอยู่ที่ dept_requests (logical link ไม่มี FK) และเธรดกวาด
  // ผ่าน entity_updates → ต้องยืนยันว่า op **มีจริง** ก่อน แล้วค่อยเทียบลำดับ
  assert.ok(ops.includes('entity_updates'), 'ต้องกวาดเธรดของคำร้อง (polymorphic ไม่มี FK)');
  assert.ok(ops.indexOf('entity_updates') < ops.indexOf('projects'));
  // คำร้องลบผ่าน RPC เท่านั้น (guard_dept_request บล็อกการลบตรง) — ต้องเกิดก่อนโครงการ
  assert.ok(ops.includes('rpc:force_delete_dept_request'), 'ต้องลบคำร้องผ่าน RPC');
  assert.ok(ops.indexOf('rpc:force_delete_dept_request') < ops.indexOf('projects'));
  assert.deepEqual(removed, { personalTasks: 3, docRevisions: 2, inquiries: 2 });
});

test('deleteProjectDeep: ไม่มีคำร้องผูก → ยังต้องกวาดเธรดของตัวโครงการเอง', async () => {
  const ops = [];
  const supabase = fakeSupabase({ ops });
  const removed = await deleteProjectDeep(supabase, 'PRJ-2');
  // โครงการมีเธรดของตัวเองแล้ว (entity ที่ 14) — ไม่มีคำร้องไม่ได้แปลว่าไม่มีเธรด
  // เธรด/แจ้งเตือนเป็น polymorphic ไม่มี FK ถ้าไม่กวาดจะเหลือแถวชี้โครงการที่หายไป
  assert.ok(ops.includes('entity_updates'), 'ต้องกวาดเธรดของโครงการ');
  assert.equal(ops.includes('rpc:force_delete_dept_request'), false);
  assert.equal(ops[ops.length - 1], 'projects', 'ต้องกวาดของลูกให้หมดก่อนลบตัวโครงการ');
  assert.deepEqual(removed, { personalTasks: 0, docRevisions: 0, inquiries: 0 });
});

/* 🐞 ทุกขั้นของ cascade เคย "สั่งแล้วไม่ดูผล" — ขั้นไหนพังก็เดินต่อจนลบแถวโครงการ
   ⇒ โครงการหาย ลูกที่ไม่มี FK ค้างเป็นกำพร้า ระบบไม่มีถังขยะให้กู้ · ทุกกรณีข้างล่าง
   ต้อง **โยน และไม่แตะแถว projects เลย** */
for (const [label, errors, rows] of [
  ['RPC ลบคำร้องพัง', { 'rpc:force_delete_dept_request': { message: 'guard' } }, { dept_requests: [{ id: 'DR1' }] }],
  // อ่านรายการคำร้องไม่ขึ้น = เคยได้ลิสต์ว่าง = ข้ามทั้งช่วงไปลบโครงการเลย
  ['อ่านรายการคำร้องพัง', { 'select:dept_requests': { message: 'timeout' } }, {}],
  ['ลบงานใต้โครงการพัง', { 'delete:personal_tasks': { message: 'fk' } }, {}],
  ['ลบรายการของเข้าพัง', { 'delete:material_deliveries': { message: 'fk' } }, {}],
]) {
  test(`deleteProjectDeep: ${label} → หยุดก่อนถึงแถวโครงการ`, async () => {
    const ops = [];
    const supabase = fakeSupabase({ ops, errors, rows });
    await assert.rejects(deleteProjectDeep(supabase, 'PRJ-3'));
    assert.equal(ops.includes('projects'), false, `ลบแถวโครงการไปแล้วทั้งที่ขั้นก่อนหน้าพัง: ${ops.join(' → ')}`);
  });
}

test('projectHasExciseRegistrations reflects the count', async () => {
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 0 } }), 'PRJ-1'), false);
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 2 } }), 'PRJ-1'), true);
});

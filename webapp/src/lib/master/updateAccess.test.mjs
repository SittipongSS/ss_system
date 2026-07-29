// ทะเบียนสิทธิ์เธรดอัปเดตของกลาง (mig 0163)
//
// ⚠️ ของกลางแปลว่า "พังทีเดียวพังทุกโมดูล" — เทสต์ชุดนี้จึงต้องครอบทุก entity ที่
// ลงทะเบียน × ทุกด่าน (view/post/mutate) โดย **วน loop จากทะเบียนเอง** ไม่ใช่เขียน
// ทีละตัว: entity ใหม่ที่ลืมคิดเรื่องสิทธิ์จะตกเทสต์ทันทีตั้งแต่เพิ่มเข้ามา
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATE_ENTITIES, canMutateUpdate, canPostUpdate, canViewUpdates,
  isUpdateEntity, loadUpdateParent, updateEntityConfig,
} from './updateAccess.js';
import {
  authorableKinds, isKnownUpdateKind, redactDeleted, sanitizeUpdateAttachments,
  updateKindMeta, UPDATE_KINDS,
} from './updateTypes.js';

// stub supabase เท่าที่ทะเบียนใช้: from().select().eq().maybeSingle() +
// auth.admin.getUserById (personalTaskAccess อ่านทีม/ฝ่ายของผู้รับผิดชอบจาก app_metadata)
function stub(row, { error = null, appMeta = { team: 'KA', department: 'SA' } } = {}) {
  const api = {
    from: () => api,
    select: () => api,
    eq: () => api,
    in: () => api,
    maybeSingle: async () => ({ data: row, error }),
    single: async () => ({ data: row, error }),
    auth: { admin: { getUserById: async () => ({ data: { user: { app_metadata: appMeta } } }) } },
  };
  return api;
}

const task = (extra = {}) => ({
  id: 'T-1', ownerId: 'u-own', assigneeId: 'u-ass', team: 'KA', status: 'In Progress', ...extra,
});

test('ทุก entity ที่ลงทะเบียนต้องประกาศด่านครบ (กัน entity ใหม่ลืมคิดเรื่องสิทธิ์)', () => {
  const names = Object.keys(UPDATE_ENTITIES);
  assert.ok(names.length > 0);
  for (const name of names) {
    const conf = UPDATE_ENTITIES[name];
    assert.equal(typeof conf.table, 'string', `${name}: ต้องระบุตารางแม่`);
    assert.equal(typeof conf.canView, 'function', `${name}: ต้องมี canView`);
    assert.equal(typeof conf.canPost, 'function', `${name}: ต้องมี canPost`);
    // async เสมอ — ด่านของบาง entity ต้อง query ต่อ ถ้าใครเผลอเขียน sync
    // ผลลัพธ์จะเป็น truthy object แล้วสิทธิ์รั่วทั้ง entity
    assert.equal(conf.canView.constructor.name, 'AsyncFunction', `${name}: canView ต้องเป็น async`);
    assert.equal(conf.canPost.constructor.name, 'AsyncFunction', `${name}: canPost ต้องเป็น async`);
    // ทุก entity ต้องมีชุด kind ของตัวเอง ไม่งั้นป้ายบนหน้าจอตกเป็นค่า fallback เงียบ ๆ
    assert.ok(UPDATE_KINDS[name], `${name}: ต้องประกาศชุด kind ใน updateTypes`);
    // เดิมบังคับว่าต้องมี kind ชื่อ 'comment' — เลิกบังคับตั้งแต่ชนิดที่คนเลือกเองได้
    // เป็นชุดต่อ entity (ฟีดดีลใช้ note/call/meeting/email/next_step ไม่มี comment เลย)
    // สิ่งที่ต้องจริงคือ "มีอย่างน้อยหนึ่งชนิดที่คนพิมพ์เองได้" ไม่งั้นกล่องพิมพ์ส่งไม่ออก
    assert.ok(
      authorableKinds(name).length >= 1,
      `${name}: ต้องมีชนิดที่คนเลือกเองได้อย่างน้อยหนึ่ง (ธง authorable)`,
    );
  }
});

test('entityType ที่ไม่รู้จัก = ปิดตายทุกด่าน ไม่ใช่ปล่อยผ่าน', async () => {
  assert.equal(isUpdateEntity('ของแปลก'), false);
  assert.equal(updateEntityConfig('ของแปลก'), null);
  assert.equal(await loadUpdateParent(stub(task()), 'ของแปลก', 'X-1'), null);
  assert.equal(await canViewUpdates(stub(task()), 'ของแปลก', task(), { role: 'admin' }), false);
  assert.equal(await canPostUpdate(stub(task()), 'ของแปลก', task(), { role: 'admin' }), false);
});

test('loadUpdateParent: query พังต้อง throw ไม่ใช่กลายเป็น "ไม่พบ"', async () => {
  await assert.rejects(
    () => loadUpdateParent(stub(null, { error: { message: 'column x does not exist' } }), 'personal_task', 'T-1'),
    /อ่านข้อมูลต้นทางไม่สำเร็จ/,
  );
  // ไม่มีแถวจริง = null (คนละเรื่องกับ query พัง)
  assert.equal(await loadUpdateParent(stub(null), 'personal_task', 'T-1'), null);
});

test('งานของฉัน: เจ้าของ/ผู้รับผิดชอบโพสต์ได้ · คนนอกโพสต์ไม่ได้', async () => {
  const t = task();
  const owner = { id: 'u-own', role: 'ae', team: 'KA' };
  const outsider = { id: 'u-x', role: 'ae', team: 'ODM' };

  assert.equal(await canPostUpdate(stub(t), 'personal_task', t, owner), true);
  assert.equal(await canPostUpdate(stub(t), 'personal_task', t, outsider), false);
  // ไม่มี parent = ปิดตาย (กันเรียกด้วย id ลอย)
  assert.equal(await canPostUpdate(stub(t), 'personal_task', null, owner), false);
});

// ── ลีด ────────────────────────────────────────────────────────────────
const lead = (extra = {}) => ({
  id: 'LD-1', status: 'assigned', team: 'KA', assigneeId: 'u-ae', createdBy: 'u-mkt', ...extra,
});

test('ลีด: อ่านได้ตาม scope เดียวกับหน้ารายละเอียด (ไม่แคบกว่า ไม่กว้างกว่า)', async () => {
  const l = lead();
  const mine = { id: 'u-ae', role: 'ae', team: 'KA' };
  const otherAe = { id: 'u-ae2', role: 'ae', team: 'KA' };
  const otherTeamSenior = { id: 'u-sn', role: 'senior_ae', team: 'ODM' };

  assert.equal(await canViewUpdates(stub(l), 'lead', l, mine), true);
  // AE คนอื่นเห็นลีดที่ไม่ใช่ของตัวเองไม่ได้ (PII) — เธรดต้องปิดตามหน้า
  assert.equal(await canViewUpdates(stub(l), 'lead', l, otherAe), false);
  assert.equal(await canViewUpdates(stub(l), 'lead', l, otherTeamSenior), false);
  assert.equal(await canViewUpdates(stub(l), 'lead', l, { id: 'u-m', role: 'marketing' }), true);
});

test('⭐ ลีด: ติดต่อแล้วยังโพสต์ได้ — เธรดต้องไม่ตายพร้อมกับสิทธิ์แก้ข้อมูล', async () => {
  const ae = { id: 'u-ae', role: 'ae', team: 'KA' };
  // canEditLead ปิดตายทุกสถานะใน LEAD_LOCKED_STATUSES — ถ้าใครเผลอเอามาคุมเธรด
  // เคสพวกนี้จะ false ทั้งแถบ ทั้งที่เป็นช่วงที่มีเรื่องต้องเล่ามากที่สุด
  for (const status of ['contacted', 'meeting', 'qualified', 'disqualified']) {
    assert.equal(
      await canPostUpdate(stub(lead({ status })), 'lead', lead({ status }), ae), true,
      `${status}: ผู้รับมอบต้องยังโพสต์ได้`,
    );
  }
});

test('ลีด: ใครโพสต์ได้บ้าง — ทีมที่ถือลีด / supervisor / คนกรอกลีด · observer ไม่ได้', async () => {
  const l = lead();
  const post = (user, row = l) => canPostUpdate(stub(row), 'lead', row, user);

  assert.equal(await post({ id: 'u-ae', role: 'ae', team: 'KA' }), true);          // ผู้รับมอบ
  assert.equal(await post({ id: 'u-sn', role: 'senior_ae', team: 'KA' }), true);   // ทีมเดียวกัน
  assert.equal(await post({ id: 'u-s', role: 'ae_supervisor', team: 'KA' }), true); // คัดกรอง
  assert.equal(await post({ id: 'u-mkt', role: 'marketing' }), true);              // คนกรอกลีด
  // marketing คนอื่น: เห็นคิวรวมได้ แต่ไม่ใช่เจ้าของลีดนี้ = โพสต์ไม่ได้
  assert.equal(await post({ id: 'u-mkt2', role: 'marketing' }), false);
  // viewer อ่านได้ทุกใบแต่ห้ามเขียนอะไรทั้งระบบ
  assert.equal(await canViewUpdates(stub(l), 'lead', l, { id: 'u-v', role: 'viewer' }), true);
  assert.equal(await post({ id: 'u-v', role: 'viewer' }), false);
  // ไม่มี parent = ปิดตาย
  assert.equal(await canPostUpdate(stub(l), 'lead', null, { id: 'u-ae', role: 'ae', team: 'KA' }), false);
});

test('ลีด: ชุดชนิดต้องตรงกับดีลทุกตัว (ลีดที่ผ่านคัดกรองกลายเป็นดีล)', () => {
  assert.deepEqual(authorableKinds('lead'), authorableKinds('deal'));
  for (const kind of authorableKinds('lead')) {
    assert.equal(updateKindMeta('lead', kind).label, updateKindMeta('deal', kind).label, kind);
  }
});

test('แก้/ลบ: เจ้าของข้อความเท่านั้น · ข้อความระบบแก้ไม่ได้ · ลบแล้วแก้ต่อไม่ได้', async () => {
  const t = task();
  const owner = { id: 'u-own', role: 'ae', team: 'KA' };
  const other = { id: 'u-ass', role: 'ae', team: 'KA' };
  const mine = { id: 'E-1', kind: 'comment', authorId: 'u-own' };

  assert.equal(await canMutateUpdate(stub(t), 'personal_task', t, owner, mine), true);
  // คนอื่น (แม้จะโพสต์ในเธรดนี้ได้) แก้ข้อความเราไม่ได้
  assert.equal(await canMutateUpdate(stub(t), 'personal_task', t, other, mine), false);
  // ข้อความที่ระบบเขียน = บันทึกเหตุการณ์ ห้ามแก้แม้จะเป็น authorId ของเรา
  assert.equal(
    await canMutateUpdate(stub(t), 'personal_task', t, owner, { ...mine, kind: 'status' }),
    false,
  );
  // ลบไปแล้วแก้ซ้ำไม่ได้
  assert.equal(
    await canMutateUpdate(stub(t), 'personal_task', t, owner, { ...mine, deletedAt: '2026-07-26T00:00:00Z' }),
    false,
  );
  // admin break-glass ได้
  assert.equal(await canMutateUpdate(stub(t), 'personal_task', t, { id: 'a', role: 'admin' }, mine), true);
});

test('ชนิดรายการ: ป้ายของงานยกมาจากของเดิมครบ ไม่หล่นสี', () => {
  for (const kind of ['comment', 'status', 'due', 'late']) {
    assert.ok(isKnownUpdateKind('personal_task', kind), kind);
    assert.ok(updateKindMeta('personal_task', kind).label, kind);
    assert.match(updateKindMeta('personal_task', kind).color, /^var\(--/, `${kind} ต้องใช้ token ไม่ใช่ hex`);
  }
  // kind ที่ไม่รู้จักตกเป็น 'อัปเดต' ไม่ใช่พังหรือโชว์ค่าดิบ
  assert.equal(updateKindMeta('personal_task', 'ของแปลก').label, 'อัปเดต');
});

test('ไฟล์แนบในข้อความ: รับเฉพาะ ref ที่อัปแล้ว + จำกัดจำนวน', () => {
  assert.deepEqual(sanitizeUpdateAttachments(null), []);
  // ของที่ไม่มี fileUrl = ไม่ใช่ไฟล์ที่อัปผ่าน /api/upload ทิ้ง
  assert.deepEqual(sanitizeUpdateAttachments([{ fileName: 'a.jpg' }]), []);
  const ok = sanitizeUpdateAttachments([{ fileUrl: 'u', fileName: 'a.jpg', evil: 1 }]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].evil, undefined, 'ต้องไม่ยกฟิลด์แปลกปลอมเข้า DB');
  assert.equal(sanitizeUpdateAttachments(Array(20).fill({ fileUrl: 'u' })).length, 8);
});

test('ข้อความที่ลบแล้วต้องไม่หลุดเนื้อหา/ไฟล์ออกไปกับ API', () => {
  const row = { id: 'E-1', body: 'ความลับ', attachments: [{ fileUrl: 'u' }], meta: { a: 1 }, deletedAt: 'x' };
  const out = redactDeleted(row);
  assert.equal(out.body, null);
  assert.deepEqual(out.attachments, []);
  assert.deepEqual(out.meta, {});
  // ยังไม่ลบ = ไม่แตะ
  assert.equal(redactDeleted({ body: 'ปกติ' }).body, 'ปกติ');
});

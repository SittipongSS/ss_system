import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  draftFilesLeft, draftUploadFailureText, requestFormBlocker, requestPayload, uploadDraftFiles,
} from './requestCreate.js';

/* ══ ประเมินจากแบบ งวด 4 (S4 B-5/B-6) — ไฟล์ของฟอร์มสร้าง · payload วันเดียว · ด่านรายวิธี ══════════
   🔴 **กดซ้ำต้องไม่อัปซ้ำ** (memory retry-must-not-reupload) — ไฟล์ที่ขึ้น Drive แล้วได้ ref กลับมาทันทีทีละไฟล์
      รอบถัดไปข้ามตัวที่ถือ ref · ล้มที่ไฟล์ 3 ต้องไม่ทำให้ไฟล์ 1–2 ขึ้นซ้ำ
   ⚠️ เทสต์ไม่แตะเครือข่าย/ฐานข้อมูล — ตัวอัปส่งเข้าไปเป็นพารามิเตอร์ (`upload`) แทน `uploadAttachment` ตัวจริง */

const file = (name, type = 'application/pdf') => ({ name, type, size: 1000 });

// ตัวอัปจำลอง: จดทุกครั้งที่ถูกเรียก · ล้มตามชื่อไฟล์ที่สั่ง
function fakeUploader({ failOn = [] } = {}) {
  const calls = [];
  const upload = async ({ entityType, entityId, file: f, docType }) => {
    calls.push({ entityType, entityId, name: f.name, docType });
    if (failOn.includes(f.name)) return { ok: false, error: 'Drive ไม่ตอบ' };
    return { ok: true, error: null, attachment: { id: `ATT-${f.name}`, docType } };
  };
  return { calls, upload };
}

test('🔴 ล้มที่ไฟล์ 2 → บอกชื่อไฟล์ 2 · ไฟล์ 1 ได้ ref ทันที · กดซ้ำอัปแค่ไฟล์ 2 กับ 3', async () => {
  const [f1, f2, f3] = [file('a.pdf'), file('b.pdf'), file('c.png', 'image/png')];
  const first = fakeUploader({ failOn: ['b.pdf'] });
  const refs = [];
  const error = await uploadDraftFiles('REQ-1', [f1, f2, f3], {
    docType: 'spec', upload: first.upload, onUploaded: (f, attachment) => refs.push([f, attachment]),
  });
  assert.equal(error, 'แนบ "b.pdf" ไม่สำเร็จ: Drive ไม่ตอบ');
  assert.deepEqual(first.calls.map((c) => c.name), ['a.pdf', 'b.pdf'], 'หยุดที่ไฟล์แรกที่ล้ม');
  assert.equal(refs.length, 1, 'onUploaded ถูกเรียกครั้งเดียว (ไฟล์ 1) — ทันทีหลังอัปผ่าน ไม่ใช่รอจบทั้งชุด');
  assert.equal(refs[0][0], f1);
  assert.deepEqual(refs[0][1], { id: 'ATT-a.pdf', docType: 'spec' });

  // ผู้เรียกเขียน ref กลับลงตะกร้า → รอบสองส่ง { file, ref } มาแทนไฟล์ 1
  const second = fakeUploader();
  const again = await uploadDraftFiles('REQ-1', [{ file: f1, ref: refs[0][1] }, f2, f3], {
    docType: 'spec', upload: second.upload,
  });
  assert.equal(again, null);
  assert.deepEqual(second.calls.map((c) => c.name), ['b.pdf', 'c.png'], 'ไฟล์ที่ถือ ref ต้องไม่ถูกอัปซ้ำ');
});

test('🔴 ตัวอัปโยน (ขั้นบันทึกแถว reject ตอนเน็ตหลุด) = คืนข้อความบอกชื่อไฟล์ ไม่โยนต่อ · ไฟล์ก่อนหน้าได้ ref แล้ว', async () => {
  const [f1, f2, f3] = [file('plan1.pdf'), file('plan2.pdf'), file('plan3.pdf')];
  const calls = [];
  const refs = [];
  const upload = async ({ file: f }) => {
    calls.push(f.name);
    if (f.name === 'plan2.pdf') throw new TypeError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    return { ok: true, error: null, attachment: { id: `ATT-${f.name}` } };
  };
  const error = await uploadDraftFiles('REQ-1', [f1, f2, f3], {
    docType: 'spec', upload, onUploaded: (f, ref) => refs.push([f, ref]),
  });
  assert.equal(error, 'แนบ "plan2.pdf" ไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  assert.deepEqual(calls, ['plan1.pdf', 'plan2.pdf'], 'หยุดที่ไฟล์ที่ล้ม');
  assert.equal(refs.length, 1);
  assert.equal(refs[0][0], f1);
});

test('docType ส่งผ่านถึงตัวอัป · ไม่ระบุ = other เหมือนเดิม · entity เป็นคำร้องที่เพิ่งได้ id', async () => {
  const spec = fakeUploader();
  await uploadDraftFiles('REQ-9', [file('plan.pdf')], { docType: 'spec', upload: spec.upload });
  assert.deepEqual(spec.calls, [{ entityType: 'dept_request', entityId: 'REQ-9', name: 'plan.pdf', docType: 'spec' }]);

  const plain = fakeUploader();
  await uploadDraftFiles('REQ-9', [file('note.pdf')], { upload: plain.upload });
  assert.equal(plain.calls[0].docType, 'other');
  // docType ที่ผู้เรียกส่ง undefined มา (หัวข้อไม่มีช่องไฟล์บังคับ) = other
  const unset = fakeUploader();
  await uploadDraftFiles('REQ-9', [file('x.pdf')], { docType: undefined, upload: unset.upload });
  assert.equal(unset.calls[0].docType, 'other');
});

test('ผู้เรียกแบบเดิม (File ล้วน ไม่มีตัวเลือก) ยังใช้ได้ · ลิสต์ว่าง/null = ไม่มีอะไรให้ทำ', async () => {
  const plain = fakeUploader();
  assert.equal(await uploadDraftFiles('REQ-2', [file('a.pdf'), file('b.pdf')], { upload: plain.upload }), null);
  assert.deepEqual(plain.calls.map((c) => c.name), ['a.pdf', 'b.pdf']);
  // onUploaded ไม่ส่งมา = ไม่พัง
  assert.equal(await uploadDraftFiles('REQ-2', [], { upload: plain.upload }), null);
  assert.equal(await uploadDraftFiles('REQ-2', null, { upload: plain.upload }), null);
  assert.equal(plain.calls.length, 2);
});

test('อัปผ่านแต่อ่านแถวที่สร้างไม่ออก (attachment = null) → ref ยังต้องเป็นค่าจริง ไม่งั้นกดซ้ำจะอัปซ้ำ', async () => {
  const refs = [];
  await uploadDraftFiles('REQ-3', [file('a.pdf')], {
    upload: async () => ({ ok: true, error: null, attachment: null }),
    onUploaded: (f, ref) => refs.push(ref),
  });
  assert.equal(refs.length, 1);
  assert.ok(refs[0], 'ref ต้อง truthy');
});

/* ── payload ของใบจากแบบ — server ได้วันเดียว (กระจกของวันรับผล) ───────────────────────────── */
const SURVEY = {
  dept: 'TS', kind: 'site_survey', dealId: 'D-1', siteId: 'SVS-1', zones: [{ name: 'โซน 1' }],
  title: 'ประเมินพื้นที่', body: 'รายละเอียด', requestedResultDate: '2026-10-30',
};

test('requestPayload ใบจากแบบ: requestedDueDate = วันรับผล · ไม่มีช่วงเวลา · ไม่มีคีย์ไฟล์', () => {
  const p = requestPayload({
    ...SURVEY, variant: 'drawing',
    // ค่าค้างจากตอนเป็นลงหน้างาน — ต้องไม่หลุดไปเป็นวันเข้าพื้นที่
    requestedDueDate: '2026-10-20', requestedDueTime: '09:30',
    requiredFiles: [file('plan.pdf')], files: [file('x.pdf')],
  });
  assert.equal(p.variant, 'drawing');
  assert.equal(p.requestedDueDate, '2026-10-30');
  assert.equal(p.requestedDueDate, p.requestedResultDate);
  assert.equal(p.requestedDueTime, null);
  assert.equal('files' in p, false);
  assert.equal('requiredFiles' in p, false);
});

test('requestPayload ใบลงหน้างาน/ยังไม่เลือก: วันเข้าพื้นที่กับช่วงเวลาเป็นของที่กรอก (เหมือนเดิม)', () => {
  const p = requestPayload({ ...SURVEY, variant: 'standard', requestedDueDate: '2026-10-20', requestedDueTime: '09:30' });
  assert.equal(p.variant, 'standard');
  assert.equal(p.requestedDueDate, '2026-10-20');
  assert.equal(p.requestedDueTime, '09:30');
  assert.equal(p.requestedResultDate, '2026-10-30');
  // ยังไม่เลือก = ไม่ส่งค่า (server ตอบตามสวิตช์: ปิด = ลงหน้างาน · เปิด = ต้องเลือก)
  assert.equal(requestPayload({ ...SURVEY, variant: '' }).variant, null);
  // หัวข้ออื่นยังส่งรูปแบบเดิมเป๊ะ
  assert.equal(requestPayload({ dept: 'RD', kind: 'formula_dev', variant: 'npd' }).variant, 'npd');
  assert.equal(requestPayload({ dept: 'RD', kind: 'info', variant: '' }).variant, null);
});

/* ── ด่านฝั่งจอรายวิธี ───────────────────────────────────────────────────────────────────── */
test('requestFormBlocker: รายวิธีของประเมินพื้นที่ รวมยังไม่เลือก', () => {
  const standard = { ...SURVEY, variant: 'standard', requestedDueDate: '2026-10-20' };
  assert.equal(requestFormBlocker(standard), null);
  assert.equal(requestFormBlocker({ ...standard, variant: '' }), 'ต้องเลือกวิธีประเมิน — ลงหน้างาน หรือ ประเมินจากแบบ');

  const drawing = { ...SURVEY, variant: 'drawing', requiredFiles: [file('plan.pdf')] };
  assert.equal(requestFormBlocker(drawing), null, 'ใบจากแบบไม่ต้องมีวันเข้าพื้นที่');
  assert.match(requestFormBlocker({ ...drawing, requiredFiles: [] }), /แบบ \/ ผังพื้นที่ที่ให้ประเมิน/);
  assert.equal(requestFormBlocker({ ...drawing, requestedResultDate: '' }), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  // โหมดแก้: ตัวนับจากรายการที่บันทึกแล้ว
  assert.equal(requestFormBlocker({ ...drawing, requiredFiles: [] }, { requiredFileCount: 2 }), null);
  assert.equal(requestFormBlocker({ ...drawing, requiredFiles: [] }, { requiredFileCount: null }), null);
  assert.match(requestFormBlocker({ ...drawing, requiredFiles: [file('a.pdf')] }, { requiredFileCount: 0 }), /แบบ \/ ผัง/);
});

test('requestFormBlocker: หัวข้ออื่นไม่ได้รับผลจากวิธีประเมินหรือตัวนับไฟล์', () => {
  const info = { dept: 'RD', kind: 'info', dealId: 'D-1', title: 'ถาม', requestedDueDate: '2026-10-20' };
  assert.equal(requestFormBlocker(info), null);
  assert.equal(requestFormBlocker(info, { requiredFileCount: 0 }), null);
  const fd = { dept: 'RD', kind: 'formula_dev', dealId: 'D-1', title: 'สูตร', requestedDueDate: '2026-10-20', items: [{ categoryCode: '01-001', scentId: 'SC-1' }] };
  assert.equal(requestFormBlocker(fd), null, 'พัฒนาสูตรไม่บังคับเลือกรูปแบบ (ว่าง = Standard)');
  assert.equal(requestFormBlocker({ ...fd, requestedDueDate: '' }), 'ต้องระบุวันที่ต้องการรับงาน');
});

/* ══ UAT S4 รอบ 4 ข้อ 15 — toast ของทางอัปล้มหลังร่างเกิด บอกว่าไฟล์ไหนยังไม่เข้า ══════════════════════════════
   ตัวอัปหยุดที่ไฟล์แรกที่ล้ม ⇒ ไฟล์ที่ไม่เข้า = ตัวที่ล้ม + ทุกตัวที่ยังไม่ถึงคิว (ทั้งไฟล์แบบและไฟล์ทั่วไป) · นับจากชุดที่ขึ้นแล้วจริง */
test('รอบ 4: ไฟล์ที่ยังไม่เข้า = ไม่มี ref และไม่ได้ขึ้นในรอบนี้ — ลำดับเดิม (ไฟล์แบบก่อน) · ชื่อเป็นของผู้ใช้ตามที่เป็น', async () => {
  const [plan1, plan2, photo] = [file('ผัง ชั้น 1.pdf'), file('ผัง ชั้น 2.pdf'), file('หน้างาน.jpg', 'image/jpeg')];
  const fake = fakeUploader({ failOn: ['ผัง ชั้น 2.pdf'] });
  const uploaded = new Set();
  const required = [plan1, plan2];
  const general = [photo];
  const error = await uploadDraftFiles('REQ-1', required, { docType: 'spec', upload: fake.upload, onUploaded: (f) => uploaded.add(f) })
    || await uploadDraftFiles('REQ-1', general, { upload: fake.upload, onUploaded: (f) => uploaded.add(f) });
  assert.equal(error, 'แนบ "ผัง ชั้น 2.pdf" ไม่สำเร็จ: Drive ไม่ตอบ');
  assert.deepEqual(draftFilesLeft([...required, ...general], uploaded), ['ผัง ชั้น 2.pdf', 'หน้างาน.jpg']);
  // รายการที่ถือ ref มาก่อน (ขึ้นรอบที่แล้ว) ไม่นับว่าค้าง · รูป `{ file, ref }` อ่านชื่อจากตัวไฟล์
  assert.deepEqual(draftFilesLeft([{ file: plan1, ref: { id: 'ATT-1' } }, { file: plan2 }], new Set()), ['ผัง ชั้น 2.pdf']);
  assert.deepEqual(draftFilesLeft([], new Set()), []);
  assert.deepEqual(draftFilesLeft([{ size: 1 }], new Set()), ['ไฟล์ไม่มีชื่อ']);
});

test('รอบ 4: ข้อความ toast — จำนวน + ชื่อ (เกินสามชื่อ = "และอีก n ไฟล์") · ไม่รู้ว่าไฟล์ไหน = ท้ายประโยคเดิม', () => {
  const head = 'แนบ "b.pdf" ไม่สำเร็จ: Drive ไม่ตอบ';
  assert.equal(draftUploadFailureText(head, ['b.pdf', 'c.jpg']),
    'แนบ "b.pdf" ไม่สำเร็จ: Drive ไม่ตอบ — ยังไม่เข้า 2 ไฟล์: b.pdf, c.jpg · แนบซ้ำได้ที่หน้ารายละเอียด');
  assert.equal(draftUploadFailureText(head, ['a', 'b', 'c', 'd', 'e']),
    'แนบ "b.pdf" ไม่สำเร็จ: Drive ไม่ตอบ — ยังไม่เข้า 5 ไฟล์: a, b, c และอีก 2 ไฟล์ · แนบซ้ำได้ที่หน้ารายละเอียด');
  assert.equal(draftUploadFailureText(head, ['a', 'b', 'c']),
    'แนบ "b.pdf" ไม่สำเร็จ: Drive ไม่ตอบ — ยังไม่เข้า 3 ไฟล์: a, b, c · แนบซ้ำได้ที่หน้ารายละเอียด');
  // ไม่มีรายชื่อ = ประโยคของรอบก่อน (§15.4) ทุกตัวอักษร · ไม่มีเหตุ = "แนบไฟล์ไม่สำเร็จ"
  assert.equal(draftUploadFailureText(head, []), `${head} — แนบซ้ำได้ที่หน้ารายละเอียด`);
  assert.equal(draftUploadFailureText('', []), 'แนบไฟล์ไม่สำเร็จ — แนบซ้ำได้ที่หน้ารายละเอียด');
  assert.equal(draftUploadFailureText(null, ['x.pdf']), 'แนบไฟล์ไม่สำเร็จ — ยังไม่เข้า 1 ไฟล์: x.pdf · แนบซ้ำได้ที่หน้ารายละเอียด');
});

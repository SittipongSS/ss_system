// สิทธิ์ไฟล์แนบของดีล (P5c) + ด่านกันลืมต่อ 5 จุด
//
// ⚠️ เทสต์ครึ่งหลังอ่านซอร์ส เพราะ handler แตะ DB จึงรันตรงไม่ได้ — และ **การลืม
// ต่อจุดใดจุดหนึ่งคือความพังที่เงียบที่สุด**: build ผ่าน · eslint ผ่าน · เทสต์ผ่าน
// แต่ไฟล์ไม่ขึ้น / อัปไม่ได้ / ใครก็ลบได้ / พรีวิวไม่ขึ้น (เคยหลุดมาแล้วสองรอบ —
// costing_item โดนข้อ 1–3 · หัวคำร้องโดนข้อ 5)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SALES_ATTACHMENT_TABLE, canAttachToSalesEntity, canViewSalesAttachment, isSalesAttachment,
} from './salesAttachmentAccess.js';

const admin = { id: 'u-admin', role: 'admin' };
const viewer = { id: 'u-viewer', role: 'viewer' };
const deal = { id: 'D-1', ownerId: 'u-admin', team: 'KA' };

test('ดีลถูกจำแนกเป็น entity แนบไฟล์ของสายงานขาย', () => {
  assert.equal(isSalesAttachment('deal'), true);
  assert.equal(isSalesAttachment('customer'), false);
  assert.equal(SALES_ATTACHMENT_TABLE.deal, 'sales_deals');
});

test('ดีลที่ไม่มีอยู่ = ไม่มีสิทธิ์ ไม่ใช่ผ่านเพราะไม่มีอะไรให้เทียบ', () => {
  assert.equal(canViewSalesAttachment(null, admin), false);
  assert.equal(canAttachToSalesEntity(null, admin), false);
});

test('ผู้อ่านอย่างเดียวแนบไม่ได้ — แนบ = แก้ดีลได้ ไม่ใช่แค่เห็น', () => {
  // คนที่เห็นดีลของทีมอื่นได้ (หัวหน้าสาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่ม
  // หรือลบเอกสารในดีลที่ไม่ใช่ของตัวเอง
  assert.equal(canAttachToSalesEntity(deal, viewer), false);
});

// ── ⚠️ ด่านกันลืมต่อ 5 จุด ────────────────────────────────────────────────
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('จุด 1–2: GET/POST /api/attachments รู้จัก parent ของดีลและมีด่านของตัวเอง', () => {
  // ขาด → loadParent คืน null → GET ตอบ [] เสมอ · POST 404 "ไม่พบระเบียนที่จะแนบ"
  assert.match(read('../../app/api/attachments/route.js'), /SALES_ATTACHMENT_TABLE\[entityType\]/);

  // ⚠️ ตัวบันไดสิทธิ์ย้ายไป `lib/master/attachmentAccess.js` แล้ว (2026-08-15) ตอนที่
  // มีผู้ใช้รายที่สาม — route เรียก helper กลางแทนการเขียนบันไดเอง · เทสต์จึงตาม
  // ไปดูที่นั่น ไม่ใช่ปล่อยผ่านเพราะหาชื่อในไฟล์เดิมไม่เจอ
  const ladder = read('../master/attachmentAccess.js');
  assert.match(ladder, /canViewSalesAttachment/);
  assert.match(ladder, /canAttachToSalesEntity/);

  // และ route ต้องเรียกบันไดนั้นจริงทั้งสองทาง ไม่ใช่ import ทิ้งไว้เฉย ๆ
  const route = read('../../app/api/attachments/route.js');
  assert.match(route, /canViewAttachmentParent\(/);
  assert.match(route, /canEditAttachmentParent\(/);
});

test('จุด 3: DELETE ต้องดักดีล **นอก** บล็อก `if (table)` ไม่งั้นใครก็ลบได้', () => {
  const src = read('../../app/api/attachments/[id]/route.js');
  assert.match(src, /isSalesAttachment\(att\.entityType\)/);
  // ต้องมาก่อน `const table = PARENT_TABLE[...]` — บล็อกข้างล่างถูกข้ามทั้งก้อน
  // เมื่อ entityType ไม่อยู่ใน PARENT_TABLE ของไฟล์นั้น
  assert.ok(
    src.indexOf('isSalesAttachment(att.entityType)') < src.indexOf('const table = PARENT_TABLE'),
    'ด่านของดีลต้องอยู่ก่อนบล็อกที่ถูกข้าม',
  );
});

test('จุด 4: โฟลเดอร์ Drive ของดีล — ขาดแล้วปุ่มอัปโหลดพัง 500 ทั้งปุ่ม', () => {
  assert.match(read('../drive.js'), /type === 'deal'/);
});

test('จุด 5: PARENT_TABLE กลาง — ขาดแล้ว "แนบได้แต่เปิดดูไม่ได้สักไฟล์"', () => {
  // อาการนี้อ่านจากหน้าจอแล้วเหมือนไฟล์เสีย ไม่ใช่เหมือนสิทธิ์ (หัวคำร้องเคยโดน)
  assert.match(read('../master/attachments.js'), /deal: 'sales_deals'/);
});

test('ชนิดเอกสารของดีลตรงกับ sales_deal_documents.kind — ไม่ใช่สองชุดที่ต้องแมปกันเอง', async () => {
  const { ATTACHMENT_TYPES } = await import('../master/attachmentTypes.js');
  const keys = ATTACHMENT_TYPES.deal.map((t) => t.key);
  for (const kind of ['customer_brief', 'quotation', 'deposit_proof', 'po', 'tax_docs', 'other']) {
    assert.ok(keys.includes(kind), `${kind} ต้องมีในชุดของดีล`);
  }
});

// ── โครงการ (เฟส 2) — เดินเช็กลิสต์ 5 จุดชุดเดียวกัน ─────────────────────
const project = { id: 'PRJ-1', ownerId: 'u-admin', team: 'KA' };

test('โครงการใช้กฎเดียวกับดีล — ทั้งสองตารางมี team/ownerId ที่ inScope ต้องการ', () => {
  assert.equal(isSalesAttachment('project'), true);
  assert.equal(SALES_ATTACHMENT_TABLE.project, 'projects');
  assert.equal(canViewSalesAttachment(project, admin), true);
  assert.equal(canAttachToSalesEntity(project, admin), true);
  // ผู้อ่านอย่างเดียวเห็นได้แต่แนบไม่ได้ — เหมือนดีลทุกประการ
  assert.equal(canViewSalesAttachment(project, viewer), true);
  assert.equal(canAttachToSalesEntity(project, viewer), false);
});

test('จุด 4 ของโครงการ: มีสาขาโฟลเดอร์บน Drive ไม่งั้นไฟล์ตกถัง "_รอจัดที่"', () => {
  // โครงการไม่มี `type === 'project'` ของตัวเอง — มันเดินผ่าน SALES_THREAD_FOLDER
  assert.match(read('../drive.js'), /project: \{ folder: FOLDER\.salesProjects/);
  // และต้องอยู่ในทะเบียน entity ที่มีสาขาจริง ไม่งั้น hasFolderBranch() ปฏิเสธ
  assert.match(read('../master/driveEntityMap.js'), /'project',/);
});

test('จุด 5 ของโครงการ: PARENT_TABLE กลางต้องรู้จัก', () => {
  assert.match(read('../master/attachments.js'), /project: 'projects'/);
});

test('proxy ไฟล์แนบต้องมีสาขาของสายงานขาย — ไม่งั้น "แนบได้แต่เปิดดูไม่ได้"', () => {
  // ⚠️ ATTACHMENT_RESOURCE ไม่มีคีย์ของ deal/project ⇒ ถ้าตกไป canViewRecord
  // จะถูกปฏิเสธทุกใบ ทั้งที่ไฟล์อยู่ครบ
  //
  // 2026-08-16: เดิมข้อนี้ตรวจว่า route เขียนสาขา `isSalesAttachment(att.entityType)`
  // ไว้ในตัวเอง — ซึ่งเป็นการ **ก๊อปบันไดสิทธิ์เป็นชุดที่สอง** ตรงกับสิ่งที่หัวไฟล์
  // attachmentAccess.js เตือนไว้เองว่าจะเพี้ยนหากัน · ตอนนี้ route เรียกบันไดกลาง
  // ตัวเดียวกับ GET /api/attachments แล้ว ⇒ ตรวจว่ามัน **เรียกตัวกลาง** แทน
  // (สาขาของสายงานขายมีอยู่จริงในตัวกลาง — ตรวจไว้ที่ข้อ "จุด 2" ข้างบนแล้ว)
  const src = read('../../app/api/master/attachments/[id]/file/route.js');
  assert.match(src, /canViewAttachmentParent\(/);
  assert.doesNotMatch(src, /isSalesAttachment\(/,
    'ห้ามเขียนบันไดสาขาซ้ำในตัว route — ให้เรียก canViewAttachmentParent ตัวเดียว');
});

test('proxy ไฟล์แนบต้องผ่านด่านรายใบด้วย — เอกสารส่วนบุคคลของลูกค้าแคบกว่าตัวระเบียน', () => {
  const src = read('../../app/api/master/attachments/[id]/file/route.js');
  assert.match(src, /canViewAttachmentRow\(/);
  // และต้องลง audit ว่าใครเปิดเอกสารส่วนบุคคล (มติผู้ใช้ 2026-08-16)
  assert.match(src, /isPersonalDoc\(/);
  assert.match(src, /recordAudit\(/);
});

test('ลิงก์เปิดไฟล์ในลิสต์รวมต้องชี้ route ที่มีอยู่จริง', async () => {
  // 🐞 เดิมชี้ /api/attachments/<id>/file ซึ่งไม่มี route นั้น ⇒ 404 ทุกใบ
  const src = read('./entityDocuments.js');
  assert.doesNotMatch(src, /`\/api\/attachments\/\$\{/);
  assert.match(src, /`\/api\/master\/attachments\/\$\{/);
});

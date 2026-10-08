/* ตัวประกอบภาพของหน้าสเปคสินค้า (mig 0370 · มติ 21/09/2569)
 *
 * สเปคไม่มี Rev ไม่มีราง ไม่มีการอนุมัติแล้ว — เทสต์นี้ล็อกสามเรื่องที่พังได้เงียบ ๆ:
 * ก้อนที่ส่งบันทึก (คีย์ผิด = server ทิ้งทั้งก้อน) · ปุ่มตามสิทธิ์ (ui-visibility-rule) ·
 * และลำดับภาพประกอบตอนกดเลื่อน
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HIDDEN_ILLUSTRATION_FORBIDDEN, hiddenIllustrationDeleteOutcome,
  illustrationReorderPlan, isRetiredIllustration, liveIllustrations, retiredIllustrations,
  specControlActions, specControlDescription, specDeletePrompt, specDocumentRows,
  specDraftFrom, specFormFrom, specHeadline, specItemsFrom, specCertsFrom, specReadiness,
  specSamplePrintHref, specSaveBody, withRowUids, SPEC_ROW_UPLOADING_REASON,
} from './productSpecView.js';
import { normalizeProductSpecInput, SPEC_CONTENT_FIELDS } from './productSpecWorkflow.js';
import { PRODUCT_SPEC_CHECKLIST_TITLE } from './productSpecChecklist.js';

const spec = {
  id: 'PSP1', productId: 'PRD1', texture: 'เหลว', standardPackaging: null,
  certifications: [{ key: 'fda', label: 'เอกสารจดแจ้ง อย.', status: 'ready', note: '' }],
  items: [{ id: 'PSI1', specId: 'PSP1', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา', detail: 'ฝาทอง', preparedByS: true, preparedByCustomer: false, note: null }],
  updatedAt: '2026-09-21T03:00:00.000Z', updatedByName: 'ชลิตา',
};

test('ค่าฟอร์มเป็นสตริงทุกช่อง — ช่องที่ฐานเป็น null ต้องได้สตริงว่าง', () => {
  const form = specFormFrom(spec);
  assert.deepEqual(Object.keys(form), [...SPEC_CONTENT_FIELDS]);
  assert.equal(form.texture, 'เหลว');
  assert.equal(form.standardPackaging, '');
  assert.equal(specFormFrom(null).texture, '');
  assert.equal(specItemsFrom(spec).length, 1);
  assert.deepEqual(specItemsFrom({}), []);
  assert.equal(specCertsFrom(spec).length, 1);
  assert.deepEqual(specCertsFrom({ certifications: 'x' }), []);
});

test('ยังไม่มีสเปค = ร่างตั้งต้นเท่ากับที่ server เติมให้ (17 + 4 แถว) และผ่านตัวตรวจ', () => {
  const draft = specDraftFrom(null);
  assert.equal(draft.items.length, 17);
  assert.equal(draft.certs.length, 4);
  assert.equal(draft.form.texture, '');
  const normalized = normalizeProductSpecInput(specSaveBody(draft));
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.value.items.length, 17);
  // มีสเปคแล้ว = ค่าที่บันทึกไว้ ไม่เติมแถวตั้งต้นทับ
  assert.equal(specDraftFrom(spec).items.length, 1);
});

test('🪤 ก้อนบันทึกผ่านตัวตรวจของ server ได้จริง (คีย์ผิด = ถูกทิ้งเงียบ)', () => {
  const body = specSaveBody({
    form: specFormFrom(spec), items: specItemsFrom(spec), certs: specCertsFrom(spec),
  });
  // คีย์ชั้นบนไม่เปลี่ยน — ราคาทุน/รูปเป็นของแถว ไม่ใช่ของก้อน
  assert.deepEqual(Object.keys(body), ['content', 'certifications', 'items']);
  // ⭐ 08/10/2569: `id` ของแถวเดิมส่งกลับ (server ใช้จับคู่แถวเก่า) · ของที่ server ไม่อ่านยังไม่ลากไป
  assert.equal(body.items[0].id, 'PSI1');
  assert.equal('specId' in body.items[0], false);
  assert.equal('sortOrder' in body.items[0], false);
  const normalized = normalizeProductSpecInput(body);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.value.content.texture, 'เหลว');
  assert.equal(normalized.value.content.standardPackaging, null);
  assert.equal(normalized.value.items[0].itemKey, 'cap');
  assert.equal(normalized.value.items[0].detail, 'ฝาทอง');
  assert.equal(normalized.value.certifications[0].status, 'ready');
});

/* ── ราคาทุน + รูปของแถว checklist (มติ 08/10/2569 · ในระบบเท่านั้น) ─────────────────────────
   สามเรื่องที่พังเงียบได้: ผลแนบรูปลงผิดแถว (key ตามลำดับ) · คนไม่เห็นราคาส่ง null ไปล้างราคาของคนอื่น ·
   ช่องว่างกับ 0 บาทถูกยุบรวมกัน */
test('withRowUids: แถวจาก server ใช้ id ของตัวเอง (คงที่) · แถวใหม่ได้ค่าไม่ซ้ำ · เรียกซ้ำไม่ขยับ', () => {
  const rows = withRowUids([{ id: 'PSI1', itemKey: 'cap' }, { itemKey: null }, { itemKey: null }, null]);
  assert.equal(rows.length, 3, 'ค่าว่างถูกตัดทิ้ง');
  assert.equal(rows[0]._uid, 'PSI1');
  assert.equal(withRowUids([{ id: 'PSI1' }])[0]._uid, 'PSI1', 'โหลดใหม่ได้ค่าเดิม — รูปย่อของแถวไม่ถูกสร้างใหม่');
  assert.notEqual(rows[1]._uid, rows[2]._uid);
  // คำนำหน้าของแถวใหม่ไม่อยู่ในอักขระที่ id ของฐานใช้ได้ ⇒ ชนกับ id จริงไม่ได้
  for (const row of rows.slice(1)) assert.doesNotMatch(row._uid, /^[A-Za-z0-9_-]{1,64}$/);
  // เรียกซ้ำ = แถวตัวเดิม ค่าเดิม (ตัวตั้งของจอเรียกทุกครั้งที่แก้แถว)
  const again = withRowUids(rows);
  assert.deepEqual(again.map((r) => r._uid), rows.map((r) => r._uid));
  assert.equal(again[1], rows[1]);
  // ไม่แก้ของที่ส่งเข้ามา (ก้อนจาก API ต้องไม่ถูกเติมคีย์ของจอ)
  const source = [{ id: 'PSI9' }];
  withRowUids(source);
  assert.equal('_uid' in source[0], false);
  assert.deepEqual(withRowUids(null), []);
});

test('ร่างบนจอมี _uid ครบทุกแถว ทั้งสเปคที่มีแล้วและแถวตั้งต้น — และไม่ซ้ำกัน', () => {
  assert.equal(specDraftFrom(spec).items[0]._uid, 'PSI1');
  const seeded = specDraftFrom(null).items.map((row) => row._uid);
  assert.equal(seeded.every(Boolean), true);
  assert.equal(new Set(seeded).size, seeded.length);
  // โหลดร่างตั้งต้นสองรอบ = คนละชุด (ผลแนบรูปของร่างเก่าต้องหาแถวในร่างใหม่ไม่เจอ)
  assert.notEqual(specDraftFrom(null).items[0]._uid, seeded[0]);
});

test('ก้อนบันทึกของแถว: _uid ไม่ส่ง · imageAttachmentId ส่งเสมอ · costPrice เฉพาะคนที่แก้ราคาทุนได้', () => {
  const draft = {
    form: specFormFrom(spec),
    certs: [],
    items: withRowUids([
      { id: 'PSI1', itemKey: 'cap', itemLabel: 'ฝา', costPrice: 12.5, imageAttachmentId: '0b6f8a52-1111-4222-8333-444455556666' },
      { itemKey: null, itemLabel: 'เพิ่มเอง', costPrice: '', imageAttachmentId: null },
      { itemKey: null, itemLabel: 'ศูนย์บาท', costPrice: 0 },
      { itemKey: null, itemLabel: 'ยังไม่แตะ' },
    ]),
  };
  const plain = specSaveBody(draft);
  assert.deepEqual(Object.keys(plain), ['content', 'certifications', 'items']);
  for (const row of plain.items) {
    assert.equal('_uid' in row, false);
    assert.equal('imageAttachmentId' in row, true, 'คีย์ต้องมีทุกแถว — server อ่านว่า "จอนี้รู้จักช่องรูป"');
    assert.equal('costPrice' in row, false, 'คนไม่มีสิทธิ์ราคาทุน: ไม่ส่งคีย์เลย (ส่ง null = ล้างราคาของคนอื่น)');
  }
  assert.equal(plain.items[0].id, 'PSI1');
  assert.equal('id' in plain.items[1], false, 'แถวใหม่ไม่มี id — _uid ของจอห้ามหลุดไปเป็น id');
  assert.equal(plain.items[0].imageAttachmentId, '0b6f8a52-1111-4222-8333-444455556666');
  assert.equal(plain.items[1].imageAttachmentId, null);
  assert.equal(plain.items[3].imageAttachmentId, null);

  const priced = specSaveBody(draft, { canEditItemCost: true });
  assert.deepEqual(Object.keys(priced), ['content', 'certifications', 'items']);
  assert.deepEqual(priced.items.map((row) => row.costPrice), [12.5, null, 0, null], 'ว่าง = null · 0 = 0 ไม่ยุบรวมกัน');
  assert.equal(priced.items.every((row) => !('_uid' in row)), true);
  // ธงไม่จริงทุกแบบ = ไม่ส่ง (permissions จาก API รุ่นเก่าไม่มีคีย์นี้)
  assert.equal('costPrice' in specSaveBody(draft, { canEditItemCost: undefined }).items[0], false);
  assert.equal('costPrice' in specSaveBody(draft, {}).items[0], false);
});

test('รูปของแถวกำลังขึ้น: ปุ่มบันทึก/สร้างกดไม่ได้พร้อมเหตุ (ติดด่าน = โชว์แล้วบอกเหตุ)', () => {
  assert.equal(SPEC_ROW_UPLOADING_REASON, 'กำลังแนบรูปของแถว — รอให้เสร็จก่อนบันทึก');
  const saving = specControlActions({ spec, dirty: true, uploading: true, permissions: { canEdit: true } }).primaryAction;
  assert.equal(saving.id, 'save');
  assert.equal(saving.visible, true);
  assert.equal(saving.disabled, true);
  assert.equal(saving.disabledReason, SPEC_ROW_UPLOADING_REASON);
  const creating = specControlActions({ spec: null, uploading: true, permissions: { canEdit: true } }).primaryAction;
  assert.equal(creating.id, 'create');
  assert.equal(creating.disabled, true);
  assert.equal(creating.disabledReason, SPEC_ROW_UPLOADING_REASON);
  // นอกขอบเขตมาก่อน — เหตุที่แก้ไม่ได้ด้วยการรอ
  assert.equal(
    specControlActions({ spec: null, uploading: true, scopeReason: 'หมวด 03 ไม่ใช้ใบสเปค', permissions: { canEdit: true } }).primaryAction.disabledReason,
    'หมวด 03 ไม่ใช้ใบสเปค',
  );
  // ไม่ได้อัปอยู่ = ของเดิม (ไม่มีเหตุ · กดได้ตามมีของเปลี่ยน)
  const idle = specControlActions({ spec, dirty: true, permissions: { canEdit: true } }).primaryAction;
  assert.equal(idle.disabled, false);
  assert.equal(idle.disabledReason, null);
});

test('ส่ง expectedUpdatedAt เฉพาะเมื่อมี — สร้างสเปคใหม่ไม่มีค่าให้เทียบ', () => {
  assert.equal(specSaveBody({ form: {}, expectedUpdatedAt: spec.updatedAt }).expectedUpdatedAt, spec.updatedAt);
  assert.equal('expectedUpdatedAt' in specSaveBody({ form: {} }), false);
});

test('พาดหัว: ไม่มีสเปค · มีของค้างไม่บันทึก · บันทึกแล้วบอกใครแก้ล่าสุด', () => {
  assert.equal(specHeadline({ spec: null }).status, 'ยังไม่มีสเปค');
  const dirty = specHeadline({ spec, dirty: true });
  assert.match(dirty.status, /ยังไม่บันทึก/);
  assert.match(dirty.color, /^var\(--/);
  const saved = specHeadline({ spec });
  assert.equal(saved.status, 'บันทึกแล้ว');
  assert.match(saved.sub, /21\/09\/2026/);
  assert.match(saved.sub, /ชลิตา/);
});

test('ไม่มีสเปค: ปุ่มหลักคือสร้าง · คนไม่มีสิทธิ์ไม่เห็น · นอกขอบเขตโชว์พร้อมเหตุ', () => {
  const asAc = specControlActions({ spec: null, permissions: { canEdit: true } });
  assert.equal(asAc.primaryAction.id, 'create');
  assert.equal(asAc.primaryAction.visible, true);
  assert.equal(asAc.primaryAction.disabled, false);
  assert.deepEqual(asAc.dangerActions, []);

  assert.equal(specControlActions({ spec: null, permissions: { canEdit: false } }).primaryAction.visible, false);

  const out = specControlActions({ spec: null, permissions: { canEdit: true }, scopeReason: 'หมวด 03 ไม่ใช้ใบสเปค' });
  assert.equal(out.primaryAction.visible, true);
  assert.equal(out.primaryAction.disabled, true);
  assert.equal(out.primaryAction.disabledReason, 'หมวด 03 ไม่ใช้ใบสเปค');
});

test('มีสเปค: บันทึกกดได้เฉพาะตอนมีของเปลี่ยน · ไม่มีราง ไม่มียื่น/อนุมัติ', () => {
  const clean = specControlActions({ spec, permissions: { canEdit: true, delete: { visible: true, reason: null } } });
  assert.equal(clean.primaryAction.id, 'save');
  assert.equal(clean.primaryAction.disabled, true);
  assert.equal(clean.primaryAction.label, 'บันทึกแล้ว');
  const dirty = specControlActions({ spec, dirty: true, permissions: { canEdit: true } });
  assert.equal(dirty.primaryAction.disabled, false);
  assert.equal(dirty.primaryAction.label, 'บันทึกสเปค');
  const ids = [dirty.primaryAction, ...dirty.secondaryActions, ...dirty.dangerActions].map((a) => a.id);
  for (const gone of ['submit', 'approve', 'reject', 'withdraw', 'new-revision']) {
    assert.equal(ids.includes(gone), false, `${gone} ต้องไม่อยู่บนหน้าสเปคแล้ว`);
  }
});

test('พิมพ์ตัวอย่างตอนมีของค้าง = โชว์พร้อมเหตุ (กระดาษพิมพ์จากของที่บันทึกแล้ว)', () => {
  const print = specControlActions({ spec, dirty: true, permissions: { canEdit: true } })
    .secondaryActions.find((a) => a.id === 'print');
  assert.equal(print.disabled, true);
  assert.match(print.disabledReason, /บันทึกก่อน/);
  const clean = specControlActions({ spec, permissions: { canEdit: false } }).secondaryActions.find((a) => a.id === 'print');
  // อ่านอย่างเดียวก็พิมพ์ตัวอย่างได้ · เปิดแท็บใหม่จาก productId ของสเปค
  assert.equal(clean.disabled, false);
  assert.equal(clean.href, '/api/products/PRD1/spec/document');
  assert.equal(clean.external, true);
  assert.equal(specSamplePrintHref('PRD1'), '/api/products/PRD1/spec/document');
});

test('ปุ่มลบเดินตาม permissions.delete ของ API ตรง ๆ', () => {
  const hidden = specControlActions({ spec, permissions: { canEdit: true, delete: { visible: false, reason: null } } })
    .dangerActions.find((a) => a.id === 'delete');
  assert.equal(hidden.visible, false);
  const blocked = specControlActions({
    spec, permissions: { canEdit: true, delete: { visible: true, reason: 'ออกเอกสารจากสเปคนี้ไปแล้ว 1 ใบ' } },
  }).dangerActions.find((a) => a.id === 'delete');
  assert.equal(blocked.visible, true);
  assert.equal(blocked.disabled, true);
  assert.match(blocked.disabledReason, /ออกเอกสาร/);
  // permissions หาย (API เก่า) = ไม่โชว์ ดีกว่าโชว์ปุ่มที่ API ปฏิเสธ
  assert.equal(specControlActions({ spec }).dangerActions[0].visible, false);
});

test('กล่องลบใช้คีย์ของ ConfirmDialog และบอกผลลัพธ์จริง', () => {
  const prompt = specDeletePrompt({ productName: 'สเปรย์ปรับอากาศ' });
  assert.equal(prompt.danger, true);
  assert.match(prompt.description, /สเปรย์ปรับอากาศ/);
  assert.match(prompt.detail, /กู้คืนจากหน้าจอไม่ได้/);
  // ⭐ 08/10/2569: รูปของแต่ละแถว checklist ถูกลบตามสเปค · ภาพประกอบ (แผ่นท้ายกระดาษ) ยังอยู่กับสินค้า — สองประโยคนี้ต้องอยู่คู่กัน
  assert.match(prompt.detail, /เนื้อสเปค checklist รูปของแต่ละแถว และเอกสารที่ขอได้ของสินค้านี้ถูกลบทั้งหมด/);
  assert.match(prompt.detail, /รูปประกอบยังอยู่/);
  // 08/10/2569: ภาพประกอบไม่ขึ้นแผงเอกสารของหน้าสินค้าแล้ว ⇒ หลังลบสเปคไม่มีจอไหนโชว์รูปชุดนี้ — ต้องบอกว่ารูปกลับมาเมื่อสร้างสเปคใหม่
  assert.match(prompt.detail, /สร้างสเปคใหม่เมื่อไรรูปชุดเดิมกลับมา/);
  assert.ok(prompt.confirmLabel);
  assert.equal('onConfirm' in prompt, false, 'ตัวลงมืออยู่ที่จอ ไม่ใช่ในก้อนข้อความ');
});

test('ความพร้อมอ่านจากฟอร์มที่กำลังแก้ ไม่ใช่ของที่บันทึกไว้', () => {
  const ready = specReadiness({ form: { ...specFormFrom(spec), standardPackaging: 'ขวดแก้ว' }, items: spec.items });
  assert.equal(ready.find((r) => r.id === 'spec').ready, true);
  assert.equal(ready.find((r) => r.id === 'checklist').ready, true);
  assert.equal(specReadiness({ form: {}, items: [] }).find((r) => r.id === 'checklist').ready, false);
  // ป้ายเดียวกับหัวการ์ดบนฟอร์ม (ค่าคงที่ตัวเดียว) · id ของรายการไม่เปลี่ยน
  assert.equal(ready.find((r) => r.id === 'checklist').label, PRODUCT_SPEC_CHECKLIST_TITLE);
  assert.equal(PRODUCT_SPEC_CHECKLIST_TITLE, 'Checklist วัตถุดิบ/บรรจุภัณฑ์');
});

test('บรรทัดใต้หัวการ์ดนับเอกสารรวมใบที่ยกเลิก', () => {
  assert.match(specControlDescription({ spec: null }), /ไม่มีเลขที่/);
  assert.match(specControlDescription({ spec, documents: [] }), /ยังไม่เคย/);
  assert.equal(
    specControlDescription({ spec, documents: [{ status: 'active' }, { status: 'void' }] }),
    'ออกเอกสารจากสเปคนี้แล้ว 2 ใบ (ยกเลิก 1)',
  );
});

test('แถวเอกสาร: เลขที่ · Rev ล่าสุด · สถานะ · SO + ลิงก์ · ใบยกเลิกยังอยู่', () => {
  const rows = specDocumentRows([
    {
      id: 'PSD1', docNo: 'FM-SA-04-220969-001', status: 'active', currentRevNo: 0,
      latest: { revNo: 1, status: 'pending_ae' }, salesOrderId: 'SO1', orderNumber: 'SO-26090001-0', createdAt: '2026-09-22',
    },
    {
      id: 'PSD2', docNo: 'FM-SA-04-220969-002', status: 'void', currentRevNo: null,
      latest: { revNo: 0, status: 'draft' }, salesOrderId: null, orderNumber: null,
    },
  ]);
  assert.equal(rows[0].href, '/sales-planning/spec-documents/PSD1');
  assert.equal(rows[0].revLabel, 'Rev.01');
  // ⭐ เลขที่รูปเดียวกับกระดาษ DDMMYY-XXX-RR ของ Rev ล่าสุด (มติ 22/09)
  assert.equal(rows[0].docNoText, '220969-001-01');
  assert.equal(rows[1].docNoText, '220969-002-00');
  assert.equal(rows[0].inUseRevLabel, 'Rev.00', 'กำลังแก้ Rev.01 — ฉบับที่ใช้ยังเป็น Rev.00');
  assert.equal(rows[0].statusLabel, 'รอ AE อนุมัติ');
  assert.equal(rows[0].orderHref, '/sa/sales-orders/SO1');
  assert.equal(rows[1].statusLabel, 'ยกเลิกแล้ว');
  assert.equal(rows[1].isVoid, true);
  assert.equal(rows[1].orderHref, null, 'SO ถูกถอด (SET NULL) = ไม่มีลิงก์ ไม่ใช่ลิงก์เสีย');
  assert.equal(rows[1].inUseRevLabel, null);
});

const img = (id, sortOrder, extra = {}) => ({
  id, docType: 'spec_illustration', fileName: `${id}.jpg`, mimeType: 'image/jpeg',
  createdAt: `2026-09-0${id.slice(-1)}T00:00:00Z`,
  metadata: sortOrder === undefined ? {} : { sortOrder }, ...extra,
});

test('ภาพที่ปลดระวางแล้วไม่ขึ้นบนจอสเปคและไม่นับ', () => {
  const rows = [img('A1'), img('A2', undefined, { metadata: { retiredAt: '2026-09-22T00:00:00Z' } })];
  assert.equal(isRetiredIllustration(rows[1]), true);
  assert.deepEqual(liveIllustrations(rows).map((r) => r.id), ['A1']);
});

/* ⭐ 08/10/2569: ภาพประกอบไม่ขึ้นแผงเอกสารของหน้าสินค้าแล้ว — กอง "เอกสารอื่นๆ" ตรงนั้นเคยเป็นที่เดียวที่ยังลบภาพปลดระวางได้
      ⇒ การ์ดภาพประกอบต้องมีรายการ "ภาพที่ซ่อนไว้" ของตัวเอง · ตัวคัดนี้คือรายการนั้น */
test('ภาพที่ซ่อนไว้: เฉพาะภาพประกอบที่เป็นรูปและปลดระวางแล้ว · ไม่ปนไฟล์ชนิดอื่น · ไม่ทับกับภาพที่ยังใช้', () => {
  const retiredAt = { metadata: { retiredAt: '2026-09-22T00:00:00Z' } };
  const rows = [
    img('A1'),
    img('A2', undefined, retiredAt),
    { id: 'W1', docType: 'artwork', fileName: 'art.pdf', ...retiredAt },           // ไฟล์ชนิดอื่นที่บังเอิญมีคีย์ปลดระวาง
    { id: 'R1', docType: 'spec_item_image', fileName: 'row.png', ...retiredAt },    // รูปของแถว checklist ไม่ใช่ภาพประกอบ
    // ไฟล์รุ่นเก่าที่ไม่ใช่รูป: แผงไฟล์แนบวาดเป็นแถวไฟล์พร้อมปุ่มลบของมันเองอยู่แล้ว — ใส่ที่นี่ด้วย = สองทางลบ ลบทางนี้แล้วแถวของแผงค้างตาย
    { id: 'P1', docType: 'spec_illustration', fileName: 'old.pdf', mimeType: 'application/pdf', ...retiredAt },
    null,
  ];
  assert.deepEqual(retiredIllustrations(rows).map((r) => r.id), ['A2']);
  // สองตัวคัดแบ่งภาพประกอบออกเป็นสองกองที่ไม่ทับกัน
  const live = new Set(liveIllustrations(rows.filter(Boolean)).map((r) => r.id));
  assert.equal(retiredIllustrations(rows).some((r) => live.has(r.id)), false);
  assert.deepEqual(retiredIllustrations([]), []);
  assert.deepEqual(retiredIllustrations(null), []);
});

test('กด "ลบไฟล์" บนภาพที่ซ่อนไว้: ยังมีเอกสารใช้อยู่ = แถวคงอยู่ · ลบจริง/หายไปก่อนแล้ว = ออกจากรายการ · ไม่มีสิทธิ์ = บอกเป็นคำไทย', () => {
  // server ตอบ retired = ยังมีเอกสารที่ยื่นแล้วใช้อยู่ — ไม่ใช่ลบแล้ว และไม่ใช่ความผิดพลาด
  assert.deepEqual(hiddenIllustrationDeleteOutcome({ body: { success: true, retired: true, message: 'ยังใช้อยู่' } }), { kind: 'kept', message: 'ยังใช้อยู่' });
  assert.equal(hiddenIllustrationDeleteOutcome({ body: { retired: true } }).kind, 'kept');
  assert.match(hiddenIllustrationDeleteOutcome({ body: { retired: true } }).message, /คงซ่อนไว้ตามเดิม/);
  // ลบจริง
  assert.equal(hiddenIllustrationDeleteOutcome({ body: { success: true } }).kind, 'purged');
  assert.equal(hiddenIllustrationDeleteOutcome({ body: null }).kind, 'purged');
  // 404 = แถวหายไปก่อนแล้ว (ลบจากแท็บอื่น) — ปล่อยค้างในรายการ = ปุ่มที่กดกี่ครั้งก็ 404
  assert.equal(hiddenIllustrationDeleteOutcome({ error: { status: 404, message: 'ไม่พบเอกสารแนบ' } }).kind, 'gone');
  // 403 = ด่านแก้ไฟล์ของสินค้า (ทีมที่ดูแลลูกค้า/หัวหน้า) ไม่ใช่ด่านแก้สเปค — ห้ามโชว์คำว่า forbidden ดิบของ server
  const forbidden = hiddenIllustrationDeleteOutcome({ error: { status: 403, message: 'forbidden' } });
  assert.deepEqual(forbidden, { kind: 'failed', message: HIDDEN_ILLUSTRATION_FORBIDDEN });
  assert.doesNotMatch(forbidden.message, /forbidden/i);
  // อย่างอื่น = ล้ม แถวคงอยู่ · เครือข่ายล่ม (ไม่มี status) ห้ามเดาว่าลบไปแล้ว
  assert.deepEqual(hiddenIllustrationDeleteOutcome({ error: { status: 500, message: 'ตรวจซ้ำไม่ได้' } }), { kind: 'failed', message: 'ตรวจซ้ำไม่ได้' });
  assert.equal(hiddenIllustrationDeleteOutcome({ error: { message: 'เชื่อมต่อไม่ได้' } }).kind, 'failed');
  assert.equal(hiddenIllustrationDeleteOutcome({ error: {} }).message, 'ลบภาพที่ซ่อนไว้ไม่สำเร็จ');
  // มี error = ไม่อ่าน body (body ของคำตอบที่ล้มไม่ใช่คำตอบ)
  assert.equal(hiddenIllustrationDeleteOutcome({ body: { retired: true }, error: { status: 500 } }).kind, 'failed');
});

test('🐞 เลื่อนภาพเมื่อภาพก่อนหน้ายังไม่มีลำดับ — ต้องไม่มีภาพกระโดดไปท้าย', () => {
  // สามภาพเก่าไม่มี sortOrder (เรียงตามวันที่อัป) · กดเลื่อนภาพที่สามขึ้น
  const rows = [img('A1'), img('A2'), img('A3')];
  const plan = illustrationReorderPlan(rows, 2, -1);
  assert.deepEqual(plan, [
    { id: 'A1', sortOrder: 0 },
    { id: 'A3', sortOrder: 1 },
    { id: 'A2', sortOrder: 2 },
  ]);
});

test('เลื่อนภาพที่มีลำดับครบแล้ว = เขียนแค่สองแถวที่สลับ', () => {
  const rows = [img('A1', 0), img('A2', 1), img('A3', 2)];
  assert.deepEqual(illustrationReorderPlan(rows, 0, 1), [
    { id: 'A2', sortOrder: 0 },
    { id: 'A1', sortOrder: 1 },
  ]);
});

test('ลำดับเก็บเป็นสตริง (metadata jsonb) ก็นับว่าตรง — ไม่เขียนซ้ำเปล่า ๆ', () => {
  const rows = [img('A1', '0'), img('A2', '1')];
  assert.deepEqual(illustrationReorderPlan(rows, 1, -1), [
    { id: 'A2', sortOrder: 0 },
    { id: 'A1', sortOrder: 1 },
  ]);
});

test('เลื่อนเกินขอบ = ไม่มีอะไรให้เขียน', () => {
  const rows = [img('A1', 0), img('A2', 1)];
  assert.deepEqual(illustrationReorderPlan(rows, 0, -1), []);
  assert.deepEqual(illustrationReorderPlan(rows, 1, 1), []);
  assert.deepEqual(illustrationReorderPlan([], 0, 1), []);
});

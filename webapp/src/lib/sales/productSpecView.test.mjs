/* ตัวประกอบภาพของหน้าสเปคสินค้า (mig 0370 · มติ 21/09/2569)
 *
 * สเปคไม่มี Rev ไม่มีราง ไม่มีการอนุมัติแล้ว — เทสต์นี้ล็อกสามเรื่องที่พังได้เงียบ ๆ:
 * ก้อนที่ส่งบันทึก (คีย์ผิด = server ทิ้งทั้งก้อน) · ปุ่มตามสิทธิ์ (ui-visibility-rule) ·
 * และลำดับภาพประกอบตอนกดเลื่อน
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  illustrationReorderPlan, isRetiredIllustration, liveIllustrations,
  specControlActions, specControlDescription, specDeletePrompt, specDocumentRows,
  specDraftFrom, specFormFrom, specHeadline, specItemsFrom, specCertsFrom, specReadiness,
  specSamplePrintHref, specSaveBody,
} from './productSpecView.js';
import { normalizeProductSpecInput, SPEC_CONTENT_FIELDS } from './productSpecWorkflow.js';

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
  assert.deepEqual(Object.keys(body), ['content', 'certifications', 'items']);
  // ไม่ลาก id/specId ของแถวเดิมไป — server ออก id ใหม่ทั้งชุด
  assert.equal('id' in body.items[0], false);
  assert.equal('specId' in body.items[0], false);
  const normalized = normalizeProductSpecInput(body);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.value.content.texture, 'เหลว');
  assert.equal(normalized.value.content.standardPackaging, null);
  assert.equal(normalized.value.items[0].itemKey, 'cap');
  assert.equal(normalized.value.items[0].detail, 'ฝาทอง');
  assert.equal(normalized.value.certifications[0].status, 'ready');
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
  assert.match(prompt.detail, /รูปประกอบยังอยู่/);
  assert.ok(prompt.confirmLabel);
  assert.equal('onConfirm' in prompt, false, 'ตัวลงมืออยู่ที่จอ ไม่ใช่ในก้อนข้อความ');
});

test('ความพร้อมอ่านจากฟอร์มที่กำลังแก้ ไม่ใช่ของที่บันทึกไว้', () => {
  const ready = specReadiness({ form: { ...specFormFrom(spec), standardPackaging: 'ขวดแก้ว' }, items: spec.items });
  assert.equal(ready.find((r) => r.id === 'spec').ready, true);
  assert.equal(ready.find((r) => r.id === 'checklist').ready, true);
  assert.equal(specReadiness({ form: {}, items: [] }).find((r) => r.id === 'checklist').ready, false);
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

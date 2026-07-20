import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commercialPresetScopeLabel,
  normalizeCommercialPresetInput,
  resolveCommercialPreset,
} from './commercialPresets.js';

const valid = {
  documentKey: 'quotation',
  teamKey: 'odm',
  dealType: 'scent',
  serviceType: '',
  priority: 10,
  title: 'เงื่อนไขงานกลิ่น ODM',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: 'เครดิต 30 วัน',
  remarks: 'ราคานี้ไม่รวมค่าขนส่ง',
  installments: [
    { label: 'มัดจำ', percent: 50, trigger: 'เมื่ออนุมัติใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: '' },
    { label: 'ส่วนที่เหลือ', percent: 50, trigger: 'ก่อนส่งมอบ', dueRule: 'ก่อนส่งสินค้า', note: '' },
  ],
  changeNote: 'กำหนดเงื่อนไขเริ่มต้น',
};

test('normalizes scope and installment content', () => {
  const result = normalizeCommercialPresetInput(valid, { includeScope: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.teamKey, 'ODM');
  assert.equal(result.value.dealType, 'SCENT');
  assert.equal(result.value.installments[0].note, null);
});

test('rejects invalid scope and installment totals', () => {
  const result = normalizeCommercialPresetInput({
    ...valid,
    teamKey: 'UNKNOWN',
    installments: [{ label: 'มัดจำ', percent: 40 }],
  }, { includeScope: true });
  assert.match(result.errors.join(' | '), /ทีมไม่ถูกต้อง/);
  assert.match(result.errors.join(' | '), /รวมต้องเท่ากับ 100/);
});

test('resolver prefers the most specific published preset', () => {
  const candidates = [
    { id: 'general', presetKey: 'general', documentKey: 'quotation', priority: 0, published: { id: 'v1' } },
    { id: 'team', presetKey: 'team', documentKey: 'quotation', teamKey: 'ODM', priority: 0, published: { id: 'v2' } },
    { id: 'exact', presetKey: 'exact', documentKey: 'quotation', teamKey: 'ODM', dealType: 'SCENT', priority: 99, published: { id: 'v3' } },
  ];
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'quotation', teamKey: 'ODM', dealType: 'SCENT' }).id, 'exact');
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'quotation', teamKey: 'ODM', dealType: 'NPD' }).id, 'team');
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'quotation', teamKey: 'KA' }).id, 'general');
});

test('resolver tie-break is deterministic by priority then preset key', () => {
  const candidates = [
    { id: 'b', presetKey: 'b', documentKey: 'quotation', dealType: 'NPD', priority: 5, published: { id: 'v1' } },
    { id: 'a', presetKey: 'a', documentKey: 'quotation', dealType: 'NPD', priority: 5, published: { id: 'v2' } },
    { id: 'higher', presetKey: 'z', documentKey: 'quotation', dealType: 'NPD', priority: 10, published: { id: 'v3' } },
  ];
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'quotation', dealType: 'NPD' }).id, 'a');
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'salesOrder', dealType: 'NPD' }), null);
});

test('team default wins a same-specificity deal default before priority tie-break', () => {
  const candidates = [
    { id: 'deal', presetKey: 'deal', documentKey: 'quotation', dealType: 'NPD', priority: 0, published: { id: 'v1' } },
    { id: 'team', presetKey: 'team', documentKey: 'quotation', teamKey: 'ODM', priority: 999, published: { id: 'v2' } },
  ];
  assert.equal(resolveCommercialPreset(candidates, { documentKey: 'quotation', teamKey: 'ODM', dealType: 'NPD' }).id, 'team');
});

test('scope label is Thai-first and explains defaults', () => {
  assert.equal(commercialPresetScopeLabel({ documentKey: 'quotation', teamKey: null }), 'ใบเสนอราคา · ทุกทีม · ค่าเริ่มต้น');
});

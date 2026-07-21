import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commercialPresetScopeLabel,
  commercialPresetToQuotationDefaults,
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

test('quotation defaults: null when unresolved or without a published version', () => {
  assert.equal(commercialPresetToQuotationDefaults(null), null);
  assert.equal(commercialPresetToQuotationDefaults({ id: 'x', published: null }), null);
});

test('quotation defaults map published content and fold installment rules into note', () => {
  const resolved = {
    id: 'preset-odm',
    published: {
      id: 'ver-2',
      title: 'เงื่อนไขงานกลิ่น ODM',
      paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
      paymentTerms: 'เครดิต 30 วัน',
      remarks: 'ราคานี้ไม่รวมค่าขนส่ง',
      installments: [
        { label: 'มัดจำ', percent: 50, trigger: 'เมื่ออนุมัติใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: '' },
        { label: 'ส่วนที่เหลือ', percent: 50, trigger: '', dueRule: '', note: 'ก่อนส่งมอบ' },
      ],
    },
  };
  const defaults = commercialPresetToQuotationDefaults(resolved);
  assert.equal(defaults.versionId, 'ver-2');
  assert.equal(defaults.title, 'เงื่อนไขงานกลิ่น ODM');
  assert.equal(defaults.paymentMethod, 'โอนเงินเข้าบัญชีบริษัท');
  assert.equal(defaults.remarks, 'ราคานี้ไม่รวมค่าขนส่ง');
  assert.equal(defaults.installments.length, 2);
  // trigger + dueRule + note พับรวมด้วย ' · ' (ข้ามค่าว่าง)
  assert.equal(defaults.installments[0].note, 'เมื่ออนุมัติใบเสนอราคา · ภายใน 7 วัน');
  assert.equal(defaults.installments[1].note, 'ก่อนส่งมอบ');
  assert.deepEqual(defaults.installments.map((row) => row.percent), [50, 50]);
});

test('quotation defaults tolerate missing optional content fields', () => {
  const defaults = commercialPresetToQuotationDefaults({ id: 'p', published: { id: 'v', title: null } });
  assert.equal(defaults.versionId, 'v');
  assert.equal(defaults.title, null);
  assert.equal(defaults.paymentMethod, '');
  assert.equal(defaults.paymentTerms, '');
  assert.equal(defaults.remarks, '');
  assert.deepEqual(defaults.installments, []);
});

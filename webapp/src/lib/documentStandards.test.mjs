import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentStandardFormLine,
  normalizeDocumentStandardInput,
  numberingPatternExample,
  validateNumberingPattern,
} from './documentStandards.js';

const valid = {
  titleTh: 'ใบเสนอราคา',
  titleEn: 'Quotation',
  formCode: 'fm-sa-01',
  revision: '00',
  effectiveDate: '2025-05-08',
  accentKey: 'terracotta',
  numberingPattern: 'qt-{yy}{mm}{running:4}-{revision}',
  changeNote: 'ปรับมาตรฐาน',
};

test('normalizes a controlled document standard and guarded numbering pattern', () => {
  const result = normalizeDocumentStandardInput(valid);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.formCode, 'FM-SA-01');
  assert.equal(result.value.titleEn, 'QUOTATION');
  assert.equal(result.value.numberingPattern, 'QT-{YY}{MM}{RUNNING:4}-{REVISION}');
});

test('rejects invalid form identity, date, accent and numbering tokens', () => {
  const result = normalizeDocumentStandardInput({
    ...valid,
    formCode: 'FM SA 01',
    revision: '#1',
    effectiveDate: '2025-02-31',
    accentKey: 'pink',
    numberingPattern: 'QT-{TEAM}-{YY}',
  });
  assert.match(result.errors.join(' | '), /รหัสแบบฟอร์ม/);
  assert.match(result.errors.join(' | '), /Revision/);
  assert.match(result.errors.join(' | '), /วันที่มีผล/);
  assert.match(result.errors.join(' | '), /Accent/);
  assert.match(result.errors.join(' | '), /TEAM/);
});

test('numbering patterns require an approved running token', () => {
  assert.equal(validateNumberingPattern('QT-{YY}{MM}').ok, false);
  assert.equal(validateNumberingPattern('QT-{YY}{MM}{RUNNING:4}-{REVISION}').ok, true);
});

test('builds stable preview and controlled form line', () => {
  assert.equal(numberingPatternExample('QT-{YY}{MM}{RUNNING:4}-{REVISION}', '2'), 'QT-26070001-2');
  assert.equal(documentStandardFormLine({ formCode: 'FM-SA-01', revision: '00', effectiveDate: '2025-05-08' }), 'FM-SA-01 · Rev.00 · มีผล 2025-05-08');
});

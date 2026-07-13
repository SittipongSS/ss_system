import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOCUMENT_FORMS,
  SYSTEM_DOCUMENT_LOGO_URL,
  documentFormLine,
} from './documentBrand.js';

test('uses the supplied logo as the system document logo', () => {
  assert.equal(SYSTEM_DOCUMENT_LOGO_URL, '/crm-document-logo.jpg');
});

test('quotation and sales order headers match the approved form metadata', () => {
  assert.equal(DOCUMENT_FORMS.quotation.title, 'QUOTATION');
  assert.equal(
    documentFormLine(DOCUMENT_FORMS.quotation),
    'FM-SA-01: Rev. No.00. 08/05/2568',
  );
  assert.equal(DOCUMENT_FORMS.salesOrder.title, 'SALES ORDER');
  assert.equal(
    documentFormLine(DOCUMENT_FORMS.salesOrder),
    'FM-SA-03: Rev. No.00. 08/05/2568',
  );
  assert.equal(DOCUMENT_FORMS.projectTimeline.code, 'FM-PD-05');
  assert.equal(DOCUMENT_FORMS.projectTimeline.title, 'PROJECT TIMELINE');
});

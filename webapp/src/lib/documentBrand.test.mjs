import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPANY_ADDRESS,
  COMPANY_TAX_ID,
  COMPANY_WEBSITE,
  DOCUMENT_FORMS,
  SYSTEM_DOCUMENT_LOGO_URL,
  documentFormLine,
} from './documentBrand.js';

test('uses the supplied logo as the system document logo', () => {
  assert.equal(SYSTEM_DOCUMENT_LOGO_URL, '/scent-sense-logo.png');
});

test('company header details match the approved registration info', () => {
  assert.equal(COMPANY_ADDRESS, '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160');
  assert.equal(COMPANY_TAX_ID, '0105557081665');
  assert.equal(COMPANY_WEBSITE, 'www.scentandsense.co.th');
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

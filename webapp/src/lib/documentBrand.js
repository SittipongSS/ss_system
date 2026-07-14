// Single source of truth for documents issued by the system.
export const SYSTEM_DOCUMENT_LOGO_URL = '/scent-sense-logo.png';

export const COMPANY_LEGAL_NAME = 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด';
export const COMPANY_ADDRESS = '2/4 ซอย เพชรเกษม 35/1 แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160';
export const COMPANY_OFFICE_TEL = '02-000-7722';
export const COMPANY_LINE = '@perfumefactory';

export const DOCUMENT_FORMS = Object.freeze({
  quotation: Object.freeze({
    code: 'FM-SA-01',
    revision: '00',
    effectiveDate: '08/05/2568',
    title: 'QUOTATION',
  }),
  salesOrder: Object.freeze({
    code: 'FM-SA-03',
    revision: '00',
    effectiveDate: '08/05/2568',
    title: 'SALES ORDER',
  }),
  projectTimeline: Object.freeze({
    code: 'FM-PD-05',
    title: 'PROJECT TIMELINE',
  }),
});

export const documentFormLine = (form) =>
  `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;

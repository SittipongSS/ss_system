// Single source of truth for documents issued by the system.
export const SYSTEM_DOCUMENT_LOGO_URL = '/scent-sense-logo.png';

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

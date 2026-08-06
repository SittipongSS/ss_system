import { brandLogoSvg } from '@/lib/brandLogo';

// Single source of truth for documents issued by the system.
//
// เอกสารพิมพ์ลงกระดาษขาวเสมอ สีโลโก้จึงตรึงเป็นกรมท่า ไม่ผูกกับธีมของหน้าจอ
// (ฝังเป็น data URI เพราะหน้าต่างพิมพ์ถูกเขียนขึ้นเอง — และเพื่อให้สีติดไปกับภาพ
//  แทนที่จะกลายเป็นสีดำอย่างที่ currentColor ใน <img> จะเป็น)
export const SYSTEM_DOCUMENT_LOGO_COLOR = '#21385e';
export const SYSTEM_DOCUMENT_LOGO_URL =
  `data:image/svg+xml,${encodeURIComponent(brandLogoSvg({ color: SYSTEM_DOCUMENT_LOGO_COLOR }))}`;

// ค่าเริ่มต้นของบล็อกบริษัทบนเอกสาร = fallback ที่เดียวของทั้งระบบ เมื่อยังไม่มี
// ข้อมูลบริษัทที่เผยแพร่ (organization_settings) หรือโหลดไม่ได้ ค่าเหล่านี้ต้องตรงกับ
// baseline v1 ใน migration 0120 (organization-baseline-v1) เสมอ
export const COMPANY_LEGAL_NAME = 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด';
export const COMPANY_LEGAL_NAME_EN = 'SCENT & SENSE LABORATORY CO., LTD.';
export const COMPANY_ADDRESS = '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160';
export const COMPANY_TAX_ID = '0105557081665';
export const COMPANY_BRANCH_CODE = '00000';
export const COMPANY_OFFICE_TEL = '02-000-7722';
export const COMPANY_LINE = '@perfumefactory';
export const COMPANY_WEBSITE = 'www.scentandsense.co.th';

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
  exciseTaxNotice: Object.freeze({
    code: 'FM-TAX-01',
    revision: '00',
    effectiveDate: '26/07/2569',
    title: 'EXCISE TAX PAYMENT NOTICE',
  }),
  projectTimeline: Object.freeze({
    code: 'FM-PD-05',
    revision: '00',
    effectiveDate: '08/05/2568',
    title: 'PROJECT TIMELINE',
  }),
  // ⭐ แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ — ค่าจากกระดาษจริงที่ผู้ใช้ส่งมา (Rev.02 · 06/02/2569)
  pdr: Object.freeze({
    code: 'FM-RD-01',
    revision: '02',
    effectiveDate: '06/02/2569',
    title: 'PRODUCT DEVELOPMENT REQUEST (PDR)',
  }),
});

export const documentFormLine = (form) =>
  `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;

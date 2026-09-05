// ── ทะเบียนแม่แบบสัญญา ────────────────────────────────────────────────────
//
// ⚠️ **ไฟล์เดียวไม่ใช่โฟลเดอร์ + index** โดยเจตนา — ตัวโหลดของชุดทดสอบ
//    (`scripts/test-loader.mjs`) เติมนามสกุล `.js` ให้ path ที่ไม่มีนามสกุล แต่ไม่ได้
//    resolve `dir/index.js` แบบที่ Next ทำ ⇒ โมดูลที่เป็นโฟลเดอร์จะ import ไม่ได้ในเทสต์
//    ทั้งที่แอปรันได้ (เจอมาแล้วรอบหนึ่งกับไฟล์นี้) · แม่แบบแต่ละฉบับอยู่ไฟล์ของตัวเอง
//    ชื่อ `contractTemplate<ชนิด>.js`
//
// ⚠️ **สัญญาจ้างผลิตยังไม่มีต้นฉบับ** — สัญญาจ้างออกแบบกลิ่น (Ver.20260708) และ
//    สัญญาบริการ (Ver.20260701 · ผู้ใช้ส่งมา 2026-09-03) มีต้นฉบับแล้วทั้งคู่
//    ⇒ ระบบต้องบอกตรง ๆ ว่ายังไม่มีแม่แบบ ไม่ใช่แต่งข้อสัญญาขึ้นเอง
//    (เอกสารผูกพันตามกฎหมาย — ข้อความที่ไม่มีใครอนุมัติคือความเสียหาย ไม่ใช่ช่องว่าง)

import { customerNameIn } from '@/lib/master/customerName';
import { SCENT_DESIGN_TEMPLATE } from './contractTemplateScentDesign';
import { SERVICE_TEMPLATE } from './contractTemplateService';

const TEMPLATES = Object.freeze({
  scent_design: SCENT_DESIGN_TEMPLATE,
  manufacturing: null,
  service: SERVICE_TEMPLATE,
});

export const contractTemplate = (kind) => TEMPLATES[kind] || null;
export const hasContractTemplate = (kind) => !!TEMPLATES[kind];
export const contractTemplateFields = (kind) => contractTemplate(kind)?.fields || [];

export const MISSING_TEMPLATE_NOTE = 'ยังไม่มีแม่แบบของสัญญาชนิดนี้ในระบบ — ส่งต้นฉบับให้ผู้ดูแลเพิ่มก่อนจึงจะออกได้';

// ค่าตั้งต้นของช่องกรอกตามแม่แบบ + ค่าที่เติมจากลูกค้า/ใบเสนอราคา
// ⚠️ ค่าที่คนกรอกไว้แล้วชนะเสมอ — ฟังก์ชันนี้ **เติมช่องที่ว่าง** ไม่ใช่เขียนทับ
export function contractFieldDefaults(kind, { customer = null, quotation = null, current = {} } = {}) {
  const fields = contractTemplateFields(kind);
  const filled = { ...current };
  for (const field of fields) {
    if (filled[field.key] !== undefined && filled[field.key] !== null && filled[field.key] !== '') continue;
    if (field.source === 'customer' && customer) {
      // สัญญาเป็นเอกสารไทย ⇒ ชื่อไทยก่อน · อ่าน `.name` ดิบทำให้ลูกค้าที่มีแต่ชื่ออังกฤษได้ช่องว่าง
      if (field.key === 'clientName') { filled[field.key] = customerNameIn(customer, 'th') || ''; continue; }
      if (field.key === 'clientRegNo') { filled[field.key] = customer.taxId || ''; continue; }
      if (field.key === 'clientAddress') { filled[field.key] = customer.address || ''; continue; }
    }
    if (field.source === 'quotation' && quotation) {
      if (field.key === 'contractValue') { filled[field.key] = quotation.totalAmount ?? ''; continue; }
    }
    if (field.default !== undefined) filled[field.key] = field.default;
  }
  return filled;
}

// ช่องที่บังคับแล้วยังว่าง — คืนป้ายภาษาไทยเพื่อบอกคนกดว่าขาดอะไร (ทั้งจอและ API)
export function missingContractFields(kind, fields = {}) {
  return contractTemplateFields(kind)
    .filter((field) => field.required)
    .filter((field) => {
      const value = fields?.[field.key];
      return value === undefined || value === null || String(value).trim() === '';
    })
    .map((field) => field.label);
}

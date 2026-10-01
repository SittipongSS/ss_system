import 'server-only';
import { HTML_PDF_GENERATOR_VERSION, renderHtmlPdf } from '@/lib/documents/htmlPdf';

// ⭐ แกนพิมพ์ PDF ย้ายไป `lib/documents/htmlPdf.js` (ใช้ร่วมกับรายงานการประเมินพื้นที่ FM-TS-01) —
//   ไฟล์นี้เหลือเป็นตัวห่อที่ export ชื่อเดิมทุกตัว ผู้เรียกของใบเสนอราคา/ใบสั่งขายไม่ต้องแก้

// เวอร์ชันของ "เครื่องพิมพ์ PDF" — เก็บลง issued_document_pdf_artifacts.generatorVersion
// เพื่อ forensics (รู้ว่าไฟล์ถูกเรนเดอร์ด้วย pipeline ไหน). bump ที่ `HTML_PDF_GENERATOR_VERSION` เมื่อเปลี่ยน engine/ตัวเลือก.
export const QUOTATION_PDF_GENERATOR_VERSION = HTML_PDF_GENERATOR_VERSION;

// เรนเดอร์ HTML ใบเสนอราคาที่ตรึงแล้ว (self-contained: ฟอนต์ base64 + รูป data URI ฝังครบ)
// → PDF A4 buffer. ตัวเลือกการพิมพ์ (preferCSSPageSize · printBackground · รอฟอนต์) อยู่ที่ `renderHtmlPdf`.
export async function renderQuotationPdf(html) {
  if (!html || !String(html).trim()) throw new Error('renderQuotationPdf: empty html');
  const { buffer } = await renderHtmlPdf(html);
  return buffer;
}

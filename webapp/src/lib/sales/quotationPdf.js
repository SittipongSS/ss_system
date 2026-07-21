import 'server-only';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// เวอร์ชันของ "เครื่องพิมพ์ PDF" — เก็บลง issued_document_pdf_artifacts.generatorVersion
// เพื่อ forensics (รู้ว่าไฟล์ถูกเรนเดอร์ด้วย pipeline ไหน). bump เมื่อเปลี่ยน engine/ตัวเลือก.
export const QUOTATION_PDF_GENERATOR_VERSION = 'pdf-chromium-v1';

// เปิด headless chromium: บน Vercel/Lambda (sin1) ใช้ binary ของ @sparticuz/chromium;
// dev เครื่องตัวเอง override ด้วย env PUPPETEER_EXECUTABLE_PATH ชี้ Chrome ที่ติดตั้งไว้
// (การ generate จริงเกิดบน production — local เป็น best-effort สำหรับทดสอบ).
async function launchBrowser() {
  const devExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (devExecutable) {
    return puppeteer.launch({
      executablePath: devExecutable,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
}

// เรนเดอร์ HTML ใบเสนอราคาที่ตรึงแล้ว (self-contained: ฟอนต์ base64 + รูป data URI ฝังครบ)
// → PDF A4 buffer. ใช้ @page ของเอกสาร V4 (size A4, margin 0) ผ่าน preferCSSPageSize
// + printBackground เพื่อคง accent/พื้นหลัง; page.pdf() ใช้ media 'print' อยู่แล้ว
// → @media print ของเอกสารซ่อน toolbar และคุม page-break ของ .sheet ให้เอง.
export async function renderQuotationPdf(html) {
  if (!html || !String(html).trim()) throw new Error('renderQuotationPdf: empty html');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(String(html), { waitUntil: 'networkidle0', timeout: 30000 });
    // กันฟอนต์ยังไม่พร้อมตอนพิมพ์ (ฟอนต์ไทยฝัง base64 ต้องถูกโหลดก่อน)
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

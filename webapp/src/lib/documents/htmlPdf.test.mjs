// ── HTML → PDF ตัวกลาง (`htmlPdf.js`) กับตัวห่อของใบเสนอราคา (`quotationPdf.js`) ──────────────────
//
// ⭐ แกนพิมพ์ PDF ย้ายจาก `lib/sales/quotationPdf.js` มาไว้ที่ `lib/documents/htmlPdf.js` ให้รายงานการประเมินพื้นที่ใช้ร่วม
//   เทสต์นี้ล็อกว่าการย้าย **ไม่เปลี่ยนสัญญาเดิม**: ชื่อ export ของใบเสนอราคาเท่าเดิม · เวอร์ชันเครื่องพิมพ์ค่าเดิม
//   (เก็บลง issued_document_pdf_artifacts.generatorVersion — เปลี่ยนค่า = ไฟล์เก่ากับใหม่ดูเหมือนมาจากคนละ pipeline)
//   และตัวเลือกการพิมพ์ชุดเดิมยังอยู่ครบ (หาย = PDF ออกมาไม่มีพื้นหลัง/ขนาดกระดาษผิดแบบเงียบ ๆ บน production)
//
// ⚠️ ที่นี่ไม่เปิดเบราว์เซอร์ (CI ไม่มี Chrome) — การพิมพ์จริงทดสอบใน `surveyReportDocument.test.mjs` (เมื่อมี
//   `PUPPETEER_EXECUTABLE_PATH`) และ `scripts/render-survey-report.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as htmlPdf from './htmlPdf.js';
import * as quotationPdf from '../sales/quotationPdf.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('สัญญาเดิมของใบเสนอราคาไม่เปลี่ยน: export สองตัวเดิม · เวอร์ชันเครื่องพิมพ์ pdf-chromium-v1', () => {
  assert.deepEqual(Object.keys(quotationPdf).sort(), ['QUOTATION_PDF_GENERATOR_VERSION', 'renderQuotationPdf']);
  assert.equal(quotationPdf.QUOTATION_PDF_GENERATOR_VERSION, 'pdf-chromium-v1');
  assert.equal(htmlPdf.HTML_PDF_GENERATOR_VERSION, 'pdf-chromium-v1');
});

test('HTML ว่าง = ล้มก่อนเปิดเบราว์เซอร์ (ข้อความเดิมของใบเสนอราคาคงไว้)', async () => {
  await assert.rejects(() => quotationPdf.renderQuotationPdf(''), /renderQuotationPdf: empty html/);
  await assert.rejects(() => quotationPdf.renderQuotationPdf('   '), /renderQuotationPdf: empty html/);
  await assert.rejects(() => htmlPdf.renderHtmlPdf(null), /renderHtmlPdf: empty html/);
});

test('ตัวเลือกการพิมพ์ชุดเดิมอยู่ครบ และมีที่เดียว — ตัวห่อของใบเสนอราคาไม่เปิดเบราว์เซอร์เอง', () => {
  const core = source('./htmlPdf.js');
  for (const piece of [
    "waitUntil: 'networkidle0'", 'timeout: 30000', 'document.fonts.ready',
    'printBackground: true', 'preferCSSPageSize: true', 'PUPPETEER_EXECUTABLE_PATH', 'chromium.executablePath()',
    'img.decode()',
  ]) assert.ok(core.includes(piece), `htmlPdf.js ขาด ${piece}`);
  const wrapper = source('../sales/quotationPdf.js');
  for (const piece of ['puppeteer', 'chromium', 'page.pdf', 'launch(']) {
    assert.equal(wrapper.includes(piece), false, `quotationPdf.js ไม่ควรมี ${piece} แล้ว`);
  }
  assert.ok(wrapper.includes("from '@/lib/documents/htmlPdf'"));
  assert.deepEqual(
    Object.keys(htmlPdf).sort(),
    ['HTML_PDF_GENERATOR_VERSION', 'launchBrowser', 'measureSheets', 'openHtmlPage', 'renderHtmlPdf'],
  );
});

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
    // onceAsync · retryBusy = ด่านคำขอ PDF ซ้อนกัน (ETXTBSY · 27/10) — ส่งออกให้เทสต์ล่างยิงได้ตรง ๆ
    ['HTML_PDF_GENERATOR_VERSION', 'launchBrowser', 'measureSheets', 'onceAsync', 'openHtmlPage', 'renderHtmlPdf', 'retryBusy'],
  );
});

/* 🐞 27/10/2569 `spawn ETXTBSY` — คำขอ PDF ซ้อนกันใน instance เดียว: คำขอที่สองได้ /tmp/chromium ที่ยังเขียนไม่เสร็จ */
test('onceAsync: คำขอที่ซ้อนกันรอการแตกไฟล์ตัวเดียว · พลาดแล้วคำขอถัดไปลองใหม่', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const once = htmlPdf.onceAsync(async () => { calls += 1; await gate; return '/tmp/chromium'; });
  const both = Promise.all([once(), once(), once()]);
  release();
  assert.deepEqual(await both, ['/tmp/chromium', '/tmp/chromium', '/tmp/chromium']);
  assert.equal(calls, 1);

  let fails = 0;
  const flaky = htmlPdf.onceAsync(async () => { fails += 1; if (fails === 1) throw new Error('inflate failed'); return 'ok'; });
  await assert.rejects(flaky, /inflate failed/);
  assert.equal(await flaky(), 'ok');
});

test('retryBusy: ลองใหม่เฉพาะ ETXTBSY · ข้อผิดพลาดอื่นโยนทันที · ครบจำนวนแล้วโยนตัวจริง', async () => {
  let n = 0;
  const ok = await htmlPdf.retryBusy(async () => {
    n += 1;
    if (n < 3) throw Object.assign(new Error('spawn ETXTBSY'), { code: 'ETXTBSY' });
    return 'browser';
  }, { delayMs: 1 });
  assert.equal(ok, 'browser');
  assert.equal(n, 3);

  let other = 0;
  await assert.rejects(htmlPdf.retryBusy(async () => { other += 1; throw new Error('ENOENT'); }, { delayMs: 1 }), /ENOENT/);
  assert.equal(other, 1);

  await assert.rejects(htmlPdf.retryBusy(async () => { throw new Error('spawn ETXTBSY'); }, { tries: 2, delayMs: 1 }), /ETXTBSY/);
});

import 'server-only';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// ── HTML → PDF ด้วย headless chromium — ตัวเดียวของเอกสารทุกชนิด ──────────────────────────────
//
// ที่มา: เดิมอยู่ใน `lib/sales/quotationPdf.js` (ใบเสนอราคา/ใบสั่งขายที่ตรึงแล้ว) · รายงานการประเมินพื้นที่
// (FM-TS-01) ต้องพิมพ์ PDF ทางเดียวกัน ⇒ ยกแกนออกมาไว้ที่นี่ แล้ว `quotationPdf.js` เหลือเป็นตัวห่อที่ export เดิมทุกตัว
// (ก๊อปไปอีกชุด = วันหนึ่งสองเอกสารพิมพ์ด้วยตัวเลือกคนละชุดโดยไม่มีใครรู้ — บทเรียนเดียวกับเปลือกเอกสาร)
//
// เอกสารที่ส่งมาต้อง self-contained (ฟอนต์ base64 + รูป data URI ฝังครบ) และแบ่งหน้าเองด้วย `.sheet` + `@page`
// ของเปลือก (`documentShell.js`: size A4 · margin 0) — ที่นี่ไม่จัดหน้า ไม่ใส่หัวท้าย

// เวอร์ชันของ "เครื่องพิมพ์ PDF" — เก็บลงแถวของไฟล์ที่ออก (เช่น issued_document_pdf_artifacts.generatorVersion)
// เพื่อ forensics (รู้ว่าไฟล์ถูกเรนเดอร์ด้วย pipeline ไหน). bump เมื่อเปลี่ยน engine/ตัวเลือก.
export const HTML_PDF_GENERATOR_VERSION = 'pdf-chromium-v1';

// เปิด headless chromium: บน Vercel/Lambda (sin1) ใช้ binary ของ @sparticuz/chromium;
// dev เครื่องตัวเอง override ด้วย env PUPPETEER_EXECUTABLE_PATH ชี้ Chrome ที่ติดตั้งไว้
// (การ generate จริงเกิดบน production — local เป็น best-effort สำหรับทดสอบ).
export async function launchBrowser() {
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

/**
 * เปิด HTML ในแท็บใหม่แล้วรอจนพร้อมพิมพ์ — ฟอนต์ฝัง base64 โหลดเสร็จ และรูปทุกรูปถอดรหัสแล้ว
 * (รูป data URI ขนาดหลายร้อย KB ยังถอดรหัสไม่เสร็จตอน `load` ได้ ⇒ พิมพ์/วัดก่อน = กล่องรูปว่าง)
 * รูปที่ถอดรหัสไม่ได้ไม่ทำให้ล้ม — กระดาษยังออก (กล่องว่าง) แล้วผู้เรียกที่ต้องการเข้มตรวจเองจาก `brokenImages`
 * @returns `{ page, brokenImages }` — ผู้เรียกปิดเบราว์เซอร์เอง
 */
export async function openHtmlPage(browser, html) {
  const page = await browser.newPage();
  await page.setContent(String(html), { waitUntil: 'networkidle0', timeout: 30000 });
  // กันฟอนต์ยังไม่พร้อมตอนพิมพ์ (ฟอนต์ไทยฝัง base64 ต้องถูกโหลดก่อน)
  await page.evaluate(() => document.fonts.ready);
  const brokenImages = await page.evaluate(async () => {
    const results = await Promise.all([...document.images].map((img) => img.decode().then(() => true, () => false)));
    return results.filter((ok) => !ok).length;
  });
  return { page, brokenImages };
}

const DEFAULT_MEASURE = Object.freeze({
  sheet: '.sheet', rule: '.df', content: '.content', tail: '.cont', through: '.zpage, .zp', mark: '[data-m]',
});

/**
 * วัดทุกแผ่นหลังฟอนต์และรูปพร้อม ใต้ media `print` (สิ่งเดียวกับที่ `page.pdf()` พิมพ์) — "ด่านวัดจริง" ของกระดาษ
 * ที่แผ่นเป็น `overflow: hidden` (ของล้นถูกตัดเงียบ ต้องวัดถึงจะรู้)
 * @param selectors `{ sheet, rule, content, tail, through, mark }` — ไม่ส่ง = ของรายงานการประเมินพื้นที่
 *   (`.sheet` · `.df` · `.content` · `.cont` · `.zpage, .zp` · `[data-m]`)
 * @returns `[{ page, height, rule, last, lastBlock, body, marks }]` หน่วย px เทียบกับขอบบนของแผ่น
 *   · `rule` = ขอบบนของเส้นท้ายกระดาษ · `last` = ขอบล่างต่ำสุดของลูกหลานทุกตัวของเนื้อหา · `lastBlock` = ตัวที่ต่ำสุด
 *   · `body` = ขอบล่างของบล็อกสุดท้ายของเนื้อหา ไม่นับบรรทัด "ต่อหน้า n" (`tail`) และมองทะลุกล่องที่ยืดเต็มหน้า
 *     (`through`) — ค่าที่แผนหน้าประเมินไว้เป็น `bottom`
 *   · `marks` = `{ [data-m]: { top, bottom, height } }` จุดอ้างอิงที่ตัวเรนเดอร์ติดไว้ให้สอบเทียบกับแผนหน้า
 */
export async function measureSheets(page, selectors = DEFAULT_MEASURE) {
  await page.emulateMediaType('print');
  return page.evaluate((sel) => {
    const round = (n) => Math.round(n * 100) / 100;
    return [...document.querySelectorAll(sel.sheet)].map((sheet, index) => {
      const base = sheet.getBoundingClientRect();
      const rule = sheet.querySelector(sel.rule);
      let last = 0;
      let lastBlock = null;
      for (const content of sheet.querySelectorAll(sel.content)) {
        for (const el of content.querySelectorAll('*')) {
          const box = el.getBoundingClientRect();
          if (!box.width && !box.height) continue;
          const bottom = box.bottom - base.top;
          if (bottom > last) {
            last = bottom;
            lastBlock = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
          }
        }
      }
      let body = 0;
      for (const content of sheet.querySelectorAll(sel.content)) {
        let end = [...content.children].filter((el) => !(sel.tail && el.matches(sel.tail))).pop() || null;
        // กล่องที่ยืดเต็มความสูง (flex: 1) ไม่บอกว่าเนื้อหาจบตรงไหน — ลงไปหาลูกตัวสุดท้ายของมันแทน
        while (end && sel.through && end.matches(sel.through) && end.lastElementChild) end = end.lastElementChild;
        if (end) body = Math.max(body, end.getBoundingClientRect().bottom - base.top);
      }
      const marks = {};
      for (const el of sheet.querySelectorAll(sel.mark)) {
        const box = el.getBoundingClientRect();
        marks[el.getAttribute('data-m')] = { top: round(box.top - base.top), bottom: round(box.bottom - base.top), height: round(box.height) };
      }
      return {
        page: index + 1,
        height: round(base.height),
        rule: rule ? round(rule.getBoundingClientRect().top - base.top) : null,
        last: round(last),
        lastBlock,
        body: round(body),
        marks,
      };
    });
  }, { ...DEFAULT_MEASURE, ...selectors });
}

/**
 * เรนเดอร์ HTML เอกสาร (self-contained) → PDF A4. ใช้ @page ของเอกสาร (size A4, margin 0) ผ่าน preferCSSPageSize
 * + printBackground เพื่อคง accent/พื้นหลัง; page.pdf() ใช้ media 'print' อยู่แล้ว
 * → @media print ของเอกสารซ่อน toolbar และคุม page-break ของ .sheet ให้เอง.
 * @param opts.measure `true` หรือ `{ sheet, rule, content, tail, through, mark }` = วัดทุกแผ่นก่อนพิมพ์ (ดู `measureSheets`) · ไม่ส่ง = ไม่วัด
 * @param opts.browser เบราว์เซอร์ที่เปิดไว้แล้ว (พิมพ์หลายไฟล์ในรอบเดียว) — ไม่ส่ง = เปิดเองแล้วปิดเอง
 * @returns `{ buffer, fit, brokenImages }` — `fit` = ผลวัด หรือ `null` เมื่อไม่ได้ขอ
 */
export async function renderHtmlPdf(html, { measure = false, browser = null } = {}) {
  if (!html || !String(html).trim()) throw new Error('renderHtmlPdf: empty html');
  const own = !browser;
  const chrome = browser || await launchBrowser();
  let page = null;
  try {
    const opened = await openHtmlPage(chrome, html);
    page = opened.page;
    const fit = measure ? await measureSheets(page, measure === true ? DEFAULT_MEASURE : measure) : null;
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return { buffer: Buffer.from(pdf), fit, brokenImages: opened.brokenImages };
  } finally {
    if (own) await chrome.close();
    else if (page) await page.close().catch(() => {});
  }
}

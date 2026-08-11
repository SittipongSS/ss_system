// "เปลือกเอกสาร" ที่ใช้ร่วมกันทุกชนิดเอกสารพิมพ์ — โครงกระดาษ A4, หัวเอกสาร,
// กล่องข้อมูลสองช่อง, ท้ายกระดาษ, ลายน้ำ, ธีมสี accent, ขั้นบันได zoom บนจอ และ CSS
// ทั้งชุด
//
// ที่มา (2026-08-05): หน้าตาชุดนี้เขียนไว้ในเครื่องยนต์ใบเสนอราคา (Quotation Master V4)
// ที่เดียว ส่วนใบแจ้งชำระภาษีสรรพสามิต (lib/tax/billPrint.js) กับเอกสารไทม์ไลน์
// (lib/pm/ganttPrint.js) ต่างคนต่างเขียน CSS ของตัวเอง — ผลคือเอกสารสามชนิดของบริษัท
// เดียวกันใช้คนละฟอนต์ (ใบภาษีลิงก์ Google Fonts CDN ที่โหลดไม่ทันตอนพิมพ์แล้วหล่นไป
// ฟอนต์สำรอง) คนละหน่วย (pt/mm กับ px) คนละชุดสี และใบภาษีไม่มีขั้นบันได zoom จึงย่อ
// ไม่เหมือนกันตอนดูพรีวิว
//
// บทเรียนเดียวกับกฎ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ใน AGENTS.md และกับ
// บั๊กที่หน้ามาตรฐานเอกสารเพิ่งโดน (ยืม CSS ข้ามโฟลเดอร์แล้วอีกฝั่งลบทิ้ง): พอเป็น
// คนละชุด มันเพี้ยนหากันเสมอ · เอกสารชนิดใหม่ให้ประกอบจากที่นี่ อย่าก๊อป CSS ไปอีกชุด
import { SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';
import { DOCUMENT_FONT_FACE_CSS } from '@/lib/sales/quotationDocumentFonts';
import { PRINT_FONT_STACK } from '@/lib/printTheme';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (v) => Number(v || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const val = (v) => (v === null || v === undefined || v === '' ? '-' : esc(v));

/* ชื่อไฟล์เอกสาร = รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล (มติผู้ใช้ 2026-08-05) — เอกสารทุกชนิด
   ใช้รูปเดียวกัน ไฟล์ที่ลูกค้า/ฝ่ายบัญชีได้รับจะได้เรียงและค้นหาได้เหมือนกันหมด

   ใช้เป็น `<title>` ของหน้าเอกสารด้วย เพราะเบราว์เซอร์เอา document.title ไปตั้งเป็นชื่อ
   ไฟล์ตอน "พิมพ์ → บันทึกเป็น PDF" — ตั้งที่ header อย่างเดียวไม่พอ ทางนั้นไม่ผ่าน API

   ส่วนที่ว่างถูกข้ามไป (ใบที่ไม่ผูกดีล/ยังไม่มีลูกค้า) จะได้ไม่เหลือ "_" ลอย ๆ ท้ายชื่อ
   และตัดอักขระที่ตั้งเป็นชื่อไฟล์ไม่ได้ทิ้ง

   ⚠️ จำกัดความยาว "ต่อส่วน" อย่างเดียวไม่พอ — ระบบไฟล์ส่วนใหญ่จำกัด 255 ไบต์ แต่ภาษา
   ไทยกินที่ 3 ไบต์/ตัว สามส่วนที่ยาวเต็มเพดานรวมกันทะลุ 255 ได้สบาย จึงตัดตามไบต์รวม
   อีกชั้น และตัดทีละ "ตัวอักษร" ไม่ใช่ทีละไบต์ ไม่งั้นจะได้ตัวอักษรครึ่งตัวท้ายชื่อ */
const FILE_NAME_PART_MAX = 60;
// เผื่อที่ให้นามสกุลไฟล์ + ตัวเลขที่เบราว์เซอร์เติมเวลาชื่อชนกัน (" (1)")
const FILE_NAME_BYTES_MAX = 180;
const byteLength = (value) => new TextEncoder().encode(value).length;

const filePart = (value) => String(value ?? '')
  .replace(/[\\/:*?"<>|]/g, ' ')  // อักขระต้องห้ามของ Windows/POSIX
  .replace(/[\s_]+/g, ' ')
  .trim()
  .slice(0, FILE_NAME_PART_MAX)
  .trim();

export function documentFileName(...parts) {
  const joined = parts.map(filePart).filter((part) => part && part !== '-').join('_');
  if (!joined) return 'document';
  let out = joined;
  while (byteLength(out) > FILE_NAME_BYTES_MAX) out = [...out].slice(0, -1).join('');
  return out.replace(/[\s_]+$/, '') || 'document';
}

// สี accent ต่อชนิดเอกสาร — ค่าเป็น hex เพราะเอกสารพิมพ์เป็นไฟล์ self-contained
// ใช้ตัวแปรธีมของแอปไม่ได้ · --doc-accent คุมสีชื่อเอกสาร (h1) กับเส้นเน้น
export const DOCUMENT_ACCENT_THEMES = Object.freeze({
  terracotta: { accent: '#ad5d43', soft: '#f5ebe7', watermark: 'rgb(173 93 67 / 14%)' },
  steel: { accent: '#1e6091', soft: '#e6eef4', watermark: 'rgb(30 96 145 / 14%)' },
  // teal ยังไม่มีเอกสารชนิดไหนใช้ แต่เป็นคีย์ที่เลือกได้ใน DOCUMENT_ACCENT_KEYS
  // (settings/document-standards) — คงไว้เผื่อเอกสารชนิดถัดไป
  teal: { accent: '#0f766e', soft: '#e6f2f0', watermark: 'rgb(15 118 110 / 14%)' },
  amber: { accent: '#b45309', soft: '#fdf1e3', watermark: 'rgb(180 83 9 / 13%)' },
  green: { accent: '#15803d', soft: '#e8f3ec', watermark: 'rgb(21 128 61 / 13%)' },
  navy: { accent: '#1f3551', soft: '#eef1f5', watermark: 'rgb(31 53 81 / 13%)' },
});

export function accentStyle(accentKey) {
  const theme = DOCUMENT_ACCENT_THEMES[accentKey] || DOCUMENT_ACCENT_THEMES.terracotta;
  return `--doc-accent:${theme.accent};--doc-accent-soft:${theme.soft};--doc-accent-watermark:${theme.watermark};`;
}

// ระยะเยื้องของแถว <div> ใน <dl> — ต้องตรงกับที่ template เว้นไว้ ไม่งั้น HTML ที่ออก
// ต่างจากของเดิมโดยไม่มีเหตุผล (ทำให้ diff เทียบก่อน/หลังรีแฟกเตอร์อ่านไม่รู้เรื่อง)
const ROW_GAP = '\n          ';

// หัวเอกสาร: บล็อกแบรนด์ (โลโก้ + บริษัท) | บล็อกตัวตนเอกสาร (รหัสฟอร์ม ชื่อ เลขที่ ฯลฯ)
// formLine เว้นได้ — รายงานไม่ใช่เอกสารควบคุม ไม่มีรหัสแบบฟอร์ม/Revision ให้พิมพ์
// rows = [{ label, value }] — แต่ละชนิดเอกสารส่งแถวของตัวเอง (ใบเสนอราคาใช้ เลขที่/
// วันที่/ยืนราคาถึง · ใบภาษีใช้ เลขที่/วันที่เอกสาร/กำหนดส่งมอบ)
export function documentHeader({ company = {}, formLine, titleTh, titleEn, rows = [] }) {
  return `
    <header class="documentHeader">
      <div class="brandBlock">
        <img src="${SYSTEM_DOCUMENT_LOGO_URL}" width="160" height="54" alt="Scent and Sense" />
        <div>
          <strong>${val(company.nameTh)}</strong>
          <span>${val(company.nameEn)}</span>
          <p>${val(company.address)}</p>
          <p>เลขประจำตัวผู้เสียภาษี ${val(company.taxId)}</p>
          <p>โทร ${val(company.phone)} · Line ${val(company.line)}${company.website ? ` · ${esc(company.website)}` : ''}</p>
        </div>
      </div>
      <div class="identityBlock">
        ${formLine ? `<div class="formLine">${val(formLine)}</div>` : ''}
        <h1>${val(titleTh)}</h1>
        <div class="englishTitle">${val(titleEn)}</div>
        <dl>
          ${rows.filter(Boolean).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${val(r.value)}</dd></div>`).join(ROW_GAP)}
        </dl>
      </div>
    </header>`;
}

// กล่องข้อมูลสองช่อง: คู่สัญญา (ซ้าย) | ข้อมูลอ้างอิง (ขวา)
// party.rows / reference.rows = [{ label, value }] · แถวที่เป็น falsy ถูกข้าม เพื่อให้
// ผู้เรียกใส่เงื่อนไขในลิสต์ได้เลย (เช่น สาขาที่มีเฉพาะลูกค้านิติบุคคล)
// แถวรับได้ทั้ง { label, value } (ข้อความ escape ให้) และ { label, html } สำหรับช่องที่
// ต้องวางโครงเอง เช่น รายการ FG ของเอกสารไทม์ไลน์ — ผู้เรียกต้อง esc มาเองแล้ว
export function partyGrid({ party = {}, reference = {}, ariaLabel } = {}) {
  const cell = (r) => (r.html !== undefined ? r.html : val(r.value));
  const rowsHtml = (rows = []) => rows.filter(Boolean)
    .map((r) => `<div><dt>${esc(r.label)}</dt><dd>${cell(r)}</dd></div>`).join(ROW_GAP);
  const heading = (block) => `<h2>${esc(block.heading)}${block.headingEn ? ` <span>${esc(block.headingEn)}</span>` : ''}</h2>`;
  return `
    <section class="partyGrid" aria-label="${esc(ariaLabel || [party.heading, reference.heading].filter(Boolean).join('และ'))}">
      <div>
        ${heading(party)}
        ${party.name !== undefined ? `<strong>${val(party.name)}</strong>` : ''}
        ${party.address !== undefined ? `<p>${val(party.address)}</p>` : ''}
        <dl>
          ${rowsHtml(party.rows)}
        </dl>
      </div>
      <div>
        ${heading(reference)}
        <dl>
          ${rowsHtml(reference.rows)}
        </dl>
      </div>
    </section>`;
}

// ท้ายกระดาษ: ชื่อบริษัท · รหัสแบบฟอร์ม · เลขหน้า (ตรึงอยู่ล่างสุดของแผ่นเสมอ)
export function documentFooter({ left, center, right }) {
  return `
    <footer class="footer">
      <span>${val(left)}</span>
      <span>${val(center)}</span>
      <span>${val(right)}</span>
    </footer>`;
}

// ลายน้ำกลางหน้า (ฉบับร่าง / ยกเลิก) — ไม่ส่งข้อความมา = ไม่มีลายน้ำ
export function watermarkBlock(text) {
  return text ? `<div class="watermark">${esc(text)}</div>` : '';
}

// ขนาดกระดาษต่อการวางแนว — เอกสารพิมพ์เป็นไฟล์เดี่ยว จึงกำหนด @page ต่อไฟล์ได้ตรง ๆ
// scale ใช้เลื่อนขั้นบันได zoom: กระดาษแนวนอนกว้างกว่า 297/210 เท่า จอจึงต้องเริ่มย่อ
// ที่ความกว้างมากกว่าตามสัดส่วนเดียวกัน ไม่งั้นแนวนอนล้นจอก่อนที่ zoom จะทำงาน
const PAPER = Object.freeze({
  portrait: { width: '210mm', height: '297mm', page: 'A4 portrait', scale: 1 },
  landscape: { width: '297mm', height: '210mm', page: 'A4 landscape', scale: 297 / 210 },
});

/* ขั้นบันได zoom ตอนดูบนจอ (มติผู้ใช้ 2026-07-26): จอแคบกว่ากระดาษให้ "ย่อทั้งแผ่น"
   ไม่ใช่จัดหน้าใหม่ — สัดส่วน/การขึ้นหน้าจึงตรงกับที่พิมพ์จริง 100%
   ใช้ขั้นบันไดแทนการคำนวณจาก vw เพราะ zoom ต้องการ "ตัวเลขไม่มีหน่วย" ซึ่ง
   calc(100vw / n) ให้ค่าเป็นความยาว ไม่ใช่อัตราส่วน */
const ZOOM_LADDER = Object.freeze([
  [820, '.95'], [760, '.88'], [700, '.82'], [640, '.74'], [580, '.68'],
  [520, '.60'], [460, '.54'], [400, '.46'], [350, '.40'],
]);

// CSS ของเปลือก — ย้ายมาจาก quotationMasterDocument.DOCUMENT_CSS แบบคำต่อคำ
// (เทสต์ของใบเสนอราคาตรึงข้อความกฎบางข้อไว้ เช่น `.termsGrid p { font-size: 8.5pt; … }`
// การแก้ถ้อยคำในนี้จึงเท่ากับแก้เอกสารจริง ต้องตั้งใจเสมอ)
export function documentShellCss(orientation = 'portrait') {
  const paper = PAPER[orientation] || PAPER.portrait;
  const bp = (width) => Math.round(width * paper.scale);
  return `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eceff3; -webkit-font-smoothing: antialiased;
         -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
         font-family: ${PRINT_FONT_STACK}; }
  .toolbar { display: flex; justify-content: space-between; align-items: center;
             width: ${paper.width}; max-width: 100%; margin: 16px auto 0; padding: 0 4px;
             font-family: ${PRINT_FONT_STACK}; }
  .toolbar h1 { font-size: 15px; font-weight: 600; color: #1f3551; }
  .btn-print { background: #1f3551; color: #fff; border: 0; font: inherit; font-weight: 600;
               padding: 8px 18px; border-radius: 8px; cursor: pointer; }

  .document {
    --doc-accent: #ad5d43;
    --doc-accent-soft: #f5ebe7;
    --doc-accent-watermark: rgb(173 93 67 / 14%);
    --doc-navy: #1f3551;
    --doc-text: #202833;
    --doc-muted: #647080;
    --doc-line: #cfd5da;
    --doc-line-strong: #9da8b1;
    --doc-neutral-soft: #f7f8f9;
    --doc-neutral-subtle: #fafafa;
    --doc-watermark: rgb(31 53 81 / 10%);
    --doc-paper: #fff;
    display: grid;
    justify-content: center;
    gap: 20px;
    padding: 16px 0 40px;
    color: var(--doc-text);
    /* เอกสาร standalone ไม่มี --font-plex-sans (ตัวแปร next/font ที่มีเฉพาะในแอป) —
       จึงฝัง IBM Plex Sans Thai เป็น @font-face base64 ในตัว (DOCUMENT_FONT_FACE_CSS)
       = ฟอนต์เดียวกับที่ next/font เสิร์ฟให้แอป แสดงผลตรงกันทุกที่ แม้พิมพ์/ตรึง snapshot
       ออฟไลน์ (ไม่พึ่ง Google CDN ที่โหลดไม่ทัน/ไม่ได้แล้วหล่นไป Leelawadee) */
    font-family: ${PRINT_FONT_STACK};
    font-size: 9.5pt;
    line-height: 1.42;
    font-variant-numeric: tabular-nums;
  }
  .grayscale { filter: grayscale(1); }
  .sheet {
    position: relative; display: flex; flex-direction: column;
    width: ${paper.width}; height: ${paper.height}; min-height: ${paper.height}; box-sizing: border-box;
    padding: 11mm 12mm 10mm; overflow: hidden; background: var(--doc-paper);
    box-shadow: 0 8px 30px rgb(27 34 43 / 16%); break-after: page;
  }
  .sheet:last-child { break-after: auto; }
  .sheetContent { display: flex; flex: 1; flex-direction: column; min-height: 0; padding-bottom: 4mm; }
  .documentHeader { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(72mm, .9fr);
    gap: 8mm; padding-bottom: 4mm; border-bottom: 1.3px solid var(--doc-navy); }
  .brandBlock { display: flex; flex-direction: column; gap: 4.5mm; align-items: flex-start; }
  .brandBlock img { width: 40mm; height: auto; object-fit: contain; }
  .brandBlock strong { display: block; color: var(--doc-navy); font-size: 9pt; line-height: 1.25; }
  .brandBlock span { display: block; margin-top: .5mm; color: var(--doc-muted); font-size: 6.8pt; letter-spacing: .02em; }
  .brandBlock p { margin: .6mm 0 0; color: var(--doc-muted); font-size: 6.8pt; line-height: 1.3; }
  .identityBlock { text-align: right; }
  .formLine { color: var(--doc-navy); font-size: 8.5pt; font-weight: 600; }
  .identityBlock h1 { margin: 2mm 0 0; color: var(--doc-accent); font-size: 19pt; line-height: 1.05; }
  .englishTitle { color: var(--doc-muted); font-size: 9pt; font-weight: 600; letter-spacing: .09em; }
  .identityBlock dl { margin: 2.5mm 0 0; }
  .identityBlock dl div { display: grid; grid-template-columns: 22mm 1fr; gap: 2mm; padding-top: .8mm; }
  .identityBlock dt { color: var(--doc-muted); font-size: 8pt; }
  .identityBlock dd { margin: 0; color: var(--doc-text); font-weight: 600; }
  .partyGrid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 3mm; margin-top: 4mm; }
  .partyGrid > div { min-width: 0; padding: 3mm 3.5mm; background: var(--doc-neutral-soft); border-left: 1.5px solid var(--doc-line-strong); }
  .partyGrid h2, .installmentSection h2, .termsGrid h2 { margin: 0 0 1.5mm; color: var(--doc-navy); font-size: 8.7pt; text-transform: none; }
  .partyGrid h2 span, .installmentSection h2 span, .termsGrid h2 span { color: var(--doc-muted); font-size: 7.2pt; font-weight: 500; }
  .partyGrid strong { display: block; font-size: 9.4pt; line-height: 1.5; overflow-wrap: anywhere; }
  .partyGrid p { margin: .8mm 0; color: var(--doc-muted); font-size: 8pt; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .partyGrid dl { margin: 1.2mm 0 0; }
  .partyGrid dl div { display: grid; grid-template-columns: 24mm 1fr; gap: 2mm; margin-top: .5mm; }
  .partyGrid dt { color: var(--doc-muted); font-size: 7.7pt; }
  .partyGrid dd { min-width: 0; margin: 0; font-size: 8pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .continuation { margin: 3mm 0 1.8mm; color: var(--doc-muted); font-size: 8pt; font-weight: 600; }
  .sectionLead { display: flex; align-items: end; justify-content: space-between; gap: 6mm;
    margin-top: 6mm; padding-bottom: 2.2mm; border-bottom: 1.3px solid var(--doc-navy); }
  .sectionLead strong { color: var(--doc-navy); font-size: 13pt; }
  .sectionLead span { margin-left: 1.5mm; color: var(--doc-muted); font-size: 8pt; font-weight: 500; }
  .sectionLead small { color: var(--doc-muted); font-size: 7.5pt; font-weight: 600; }
  .itemTable, .installmentTable { width: 100%; border-collapse: collapse; }
  .itemTable { margin-top: 4mm; }
  .itemTable thead { display: table-header-group; }
  .itemTable th { padding: 2.1mm 1.5mm; color: #fff; background: var(--doc-navy); font-size: 8.4pt; font-weight: 600; }
  .itemTable td { padding: 2mm 1.5mm; vertical-align: top; border-bottom: 1px solid var(--doc-line); font-size: 8.8pt; }
  .itemTable tbody tr:nth-child(even) td { background: var(--doc-neutral-subtle); }
  .itemTable td:nth-child(1) { width: 11mm; }
  .itemTable td:nth-child(3) { width: 17mm; }
  .itemTable td:nth-child(4) { width: 13mm; }
  .itemTable td:nth-child(5), .itemTable td:nth-child(6) { width: 23mm; }
  /* ใบที่มีส่วนลดรายบรรทัด: แทรกคอลัมน์ส่วนลดก่อนจำนวนเงิน — บีบราคา/หน่วยลงเล็กน้อย
     แล้วให้ช่องรายละเอียด (คอลัมน์ 2 กว้างอัตโนมัติ) เสียพื้นที่เท่าที่จำเป็น */
  .itemTable.withLineDiscount td:nth-child(5) { width: 21mm; }
  .itemTable.withLineDiscount td:nth-child(6) { width: 19mm; }
  .itemTable.withLineDiscount td:nth-child(7) { width: 23mm; }
  .itemDiscountRate { display: block; margin-top: .3mm; color: var(--doc-muted); font-size: 7.4pt; line-height: 1.4; }
  .itemIdentity { display: block; color: var(--doc-navy); font-size: 7.6pt; font-weight: 600; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .itemName { display: block; margin-top: .35mm; color: var(--doc-text); font-weight: 500; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .itemNote { display: block; margin-top: .7mm; color: var(--doc-muted); font-size: 8pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .center { text-align: center; }
  .number { text-align: right; white-space: nowrap; }
  .totals { width: 74mm; margin: 3.5mm 0 0 auto; border-top: 1.3px solid var(--doc-navy); }
  .totals > div { display: grid; grid-template-columns: 1fr auto; gap: 4mm; padding: 1.2mm 1.5mm; font-size: 8.8pt; }
  .totals span { color: var(--doc-muted); }
  .totals strong { text-align: right; }
  .afterDiscount { border-top: 1px dashed var(--doc-line); }
  .grandTotal { margin-top: .5mm; color: var(--doc-navy); background: var(--doc-paper); border-top: 1.8px solid var(--doc-navy); border-bottom: 1px solid var(--doc-navy); font-size: 11.5pt !important; }
  .grandTotal span { color: var(--doc-navy); font-weight: 600; }
  .paymentContent { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .paymentDetails { break-inside: avoid; }
  .paymentDetails .installmentSection { margin-top: 3.5mm; }
  .installmentSection { margin-top: 3.5mm; break-inside: avoid; }
  .installmentTable th { padding: 1.5mm 1.2mm; color: var(--doc-navy); background: var(--doc-neutral-soft); border: 1px solid var(--doc-line); font-size: 7.8pt; }
  .installmentTable td { padding: 1.5mm 1.2mm; vertical-align: top; border: 1px solid var(--doc-line); font-size: 7.8pt; }
  /* ช่องรายละเอียด (คอลัมน์แรก) กว้างสุด: ให้ width:100% ดึงพื้นที่ที่เหลือทั้งหมด (auto layout
     ไม่ยุบต่ำกว่าเนื้อหา จึงไม่พังบนจอแคบ) ส่วน % แคบ (ไม่เกิน 100%) + จำนวนเงินพอดีตัวเลข */
  /* รายละเอียดกินที่เหลือทั้งหมด ส่วน % กับจำนวนเงินกว้างขึ้นให้ตัวเลขไม่อึดอัด
     (มติผู้ใช้ 2026-07-26) — ต้องใช้ table-layout: fixed ไม่งั้นความกว้างที่ตั้งไว้
     ไม่มีผล: คอลัมน์แรกที่ขอ 100% จะบีบอีกสองคอลัมน์ให้เหลือเท่าความกว้างเนื้อหา */
  .installmentTable { table-layout: fixed; }
  .installmentTable th:first-child, .installmentTable td:first-child { width: auto; }
  .installmentTable th:nth-child(2), .installmentTable td:nth-child(2) { width: 18mm; white-space: nowrap; }
  .installmentTable th:nth-child(3), .installmentTable td:nth-child(3) { width: 34mm; white-space: nowrap; }
  .installmentTable span { display: block; color: var(--doc-muted); font-size: 7.2pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .termsGrid { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 3mm; margin-top: 3mm; break-inside: avoid; }
  .termsGrid > div { min-width: 0; padding: 2.8mm 3mm; background: var(--doc-neutral-soft); border-top: 1px solid var(--doc-line-strong); }
  .termsGrid h2 { margin-bottom: 2mm; font-size: 9pt; line-height: 1.25; }
  .termsGrid h2 span { display: inline; font-size: 6.9pt; line-height: 1.2; letter-spacing: .04em; white-space: nowrap; }
  .termsGrid p { margin: 0; color: var(--doc-text); font-size: 8.5pt; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
  .termsGrid .remarks { grid-column: 1 / -1; }
  .termsGrid .remarks p { max-width: 168mm; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-top: auto; padding-top: 3mm; break-inside: avoid; }
  .signatures > div { min-height: 31mm; padding: 2mm; text-align: center; border: 1px solid var(--doc-line-strong); }
  .signatures h2 { margin: 0; color: var(--doc-navy); font-size: 8pt; }
  .signatures h2 span { display: block; color: var(--doc-muted); font-size: 6.8pt; font-weight: 400; }
  .signatureSpace, .signaturePreview { display: grid; height: 12mm; color: var(--doc-line-strong); font-size: 7pt; }
  .signatureSpace { box-sizing: border-box; place-items: end start; padding: 0 1mm .8mm; }
  .signaturePreview { place-items: center; color: var(--doc-navy); font-size: 9pt; font-weight: 600; font-style: italic; }
  .signatureImage { display: block; height: 12mm; max-width: 100%; margin: 0 auto; object-fit: contain; }
  .signatures strong { display: block; font-size: 7.8pt; }
  .signatures p { margin: .5mm 0 0; color: var(--doc-muted); font-size: 6.8pt; }
  .signatures small { display: block; margin-top: .5mm; color: var(--doc-muted); font-size: 6.3pt; }
  .signed { background: var(--doc-neutral-soft); }
  .footer { position: absolute; right: 12mm; bottom: 5mm; left: 12mm; display: grid;
    grid-template-columns: 1fr auto auto; gap: 8mm; padding-top: 1.5mm; color: var(--doc-muted);
    border-top: 1px solid var(--doc-line); font-size: 6.8pt; }
  .watermark { position: absolute; top: 48%; left: 50%; z-index: 2;
    transform: translate(-50%, -50%) rotate(-24deg); color: var(--doc-watermark);
    border: 4px solid currentcolor; padding: 3mm 8mm; font-size: 34pt; font-weight: 700;
    letter-spacing: .08em; pointer-events: none; }
  /* V4 = หน้าตาแบบ V2 (ไม่มี accent override) — ต่างที่การจัดหน้า: กลุ่มท้ายเอกสารชิดล่าง */
  .v4 .paymentContent { justify-content: flex-end; break-inside: avoid; }
  .v4 .signatures { margin-top: 3mm; }

  @page { size: ${paper.page}; margin: 0; }
  /* ของเดิมพอจอ < 900px จะเปลี่ยน .sheet เป็น width:100% + height:auto + คิดคอลัมน์
     ตารางใหม่เป็น % → พรีวิวออกมาคนละสัดส่วนกับที่พิมพ์จริง ดูแล้วตัดสินใจไม่ได้
     ตอนนี้ .sheet คงขนาดกระดาษเสมอ (794px = 210mm ที่ 96dpi) แล้วย่อด้วย zoom */
  @media screen and (max-width: ${bp(900)}px) { .toolbar { width: 100%; } }
${ZOOM_LADDER.map(([width, zoom]) => `  @media screen and (max-width: ${bp(width)}px) { .document { zoom: ${zoom}; } }`).join('\n')}
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .document { display: block; padding: 0; filter: none; }
    .grayscale { filter: grayscale(1); }
    .sheet { width: ${paper.width}; height: ${paper.height}; min-height: ${paper.height}; margin: 0; box-shadow: none;
      break-after: page; page-break-after: always; }
    .sheetContent { padding-bottom: 2vw; }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
  }`;
}

// ประกอบเป็นไฟล์ HTML เอกสารเต็ม — ฝังฟอนต์ + CSS เปลือก + CSS เฉพาะชนิด (extraCss)
// pages = HTML ของแผ่นกระดาษทั้งหมดที่ผู้เรียกประกอบมาแล้ว
export function renderDocumentHTML({
  title,
  accentKey,
  pages,
  grayscale = false,
  orientation = 'portrait',
  variantClass = '',
  dataAttrs = '',
  extraCss = '',
  toolbar = null,
} = {}) {
  const toolbarHtml = toolbar
    ? `<div class="toolbar no-print"><h1>${esc(toolbar.label)}</h1><button class="btn-print" type="button" onclick="window.print()">${esc(toolbar.button || 'พิมพ์เอกสาร')}</button></div>`
    : '';
  const classes = ['document', variantClass, grayscale ? 'grayscale' : ''].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${DOCUMENT_FONT_FACE_CSS}</style>
<style>${documentShellCss(orientation)}${extraCss}</style>
</head>
<body>
  ${toolbarHtml}
  <div class="${classes}" style="${accentStyle(accentKey)}"${dataAttrs}>
    ${pages}
  </div>
</body>
</html>`;
}

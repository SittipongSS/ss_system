// เอกสารใบเสนอราคา FM-SA-01 หน้าตา "Quotation Master Template V4" — เรนเดอร์เป็น
// HTML ไฟล์เดียวจบในตัว (ฝัง CSS) ฝั่ง server ได้ ใช้ทั้งพิมพ์จริง + ตรึง snapshot 7B
// + หน้า preview. Phase 7C (Direction B): V4 = เอกสารตัวจริง แทน quotePrint เดิม.
//
// ไฟล์นี้เป็น "แหล่งเดียว" ของหน้าตาเอกสารใบเสนอราคา V4 แล้ว (markup + CSS ฝังใน
// DOCUMENT_CSS) — component React เดิม (QuotationMasterDocument) ถูกปลดระวางแล้ว
// (Phase 7C 2026-07-21). ใช้ชื่อคลาสตรง ๆ ได้เพราะเป็นหน้าเดี่ยว self-contained.
import { SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';
import { buildQuotationMasterModelFromQuote } from '@/lib/sales/quotationMasterTemplate';
import { DOCUMENT_FONT_FACE_CSS } from '@/lib/sales/quotationDocumentFonts';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (v) => Number(v || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const val = (v) => (v === null || v === undefined || v === '' ? '-' : esc(v));

function documentHeader(model) {
  return `
    <header class="documentHeader">
      <div class="brandBlock">
        <img src="${SYSTEM_DOCUMENT_LOGO_URL}" width="160" height="54" alt="Scent and Sense" />
        <div>
          <strong>${val(model.company.nameTh)}</strong>
          <span>${val(model.company.nameEn)}</span>
          <p>${val(model.company.address)}</p>
          <p>เลขประจำตัวผู้เสียภาษี ${val(model.company.taxId)}</p>
          <p>โทร ${val(model.company.phone)} · Line ${val(model.company.line)}</p>
        </div>
      </div>
      <div class="identityBlock">
        <div class="formLine">${val(model.formLine)}</div>
        <h1>${val(model.standard.titleTh)}</h1>
        <div class="englishTitle">${val(model.standard.titleEn)}</div>
        <dl>
          <div><dt>เลขที่</dt><dd>${val(model.document.number)}</dd></div>
          <div><dt>${esc(model.document.dateLabel)}</dt><dd>${val(model.document.dateValue)}</dd></div>
          <div><dt>${esc(model.document.secondaryLabel)}</dt><dd>${val(model.document.secondaryValue)}</dd></div>
        </dl>
      </div>
    </header>`;
}

function partyGrid(model) {
  return `
    <section class="partyGrid" aria-label="ข้อมูลลูกค้าและข้อมูลอ้างอิง">
      <div>
        <h2>ผู้ซื้อ <span>/ CUSTOMER</span></h2>
        <strong>${val(model.customer.name)}</strong>
        <p>${val(model.customer.address)}</p>
        <dl>
          <div><dt>เลขผู้เสียภาษี</dt><dd>${val(model.customer.taxId)}</dd></div>
          <div><dt>ที่อยู่จัดส่ง</dt><dd>${val(model.customer.shippingAddress || model.customer.address)}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>${val(model.customer.contactName)}${model.customer.contactPhone ? ` · ${esc(model.customer.contactPhone)}` : ''}</dd></div>
        </dl>
      </div>
      <div>
        <h2>ข้อมูลอ้างอิง <span>/ REFERENCE</span></h2>
        <dl>
          ${(model.referenceRows || []).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${val(r.value)}</dd></div>`).join('')}
        </dl>
      </div>
    </section>`;
}

function itemTable(lines, startIndex) {
  const rows = lines.map((line, index) => `
        <tr>
          <td class="center">${startIndex + index + 1}</td>
          <td>
            <strong>${val(line.description)}</strong>
            <span class="itemCode">${esc(line.fgCode || '')}</span>
            ${line.note ? `<span class="itemNote">${esc(line.note)}</span>` : ''}
          </td>
          <td class="number">${Number(line.qty || 0).toLocaleString('th-TH')}</td>
          <td class="center">${val(line.unit)}</td>
          <td class="number">${money(line.unitPrice)}</td>
          <td class="number">${money(line.lineTotal)}</td>
        </tr>`).join('');
  return `
    <table class="itemTable">
      <thead>
        <tr>
          <th class="center">ลำดับ</th>
          <th>รายละเอียดสินค้า / บริการ</th>
          <th class="number">จำนวน</th>
          <th class="center">หน่วย</th>
          <th class="number">ราคา/หน่วย</th>
          <th class="number">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function totalsSection(model) {
  const { totals } = model;
  const hasDiscount = Number(totals.discountAmount) > 0;
  return `
    <section class="totals" aria-label="สรุปยอด">
      <div><span>รวมสินค้า / บริการ</span><strong>${money(totals.subtotal)}</strong></div>
      ${hasDiscount ? `
      <div><span>หัก ส่วนลด${model.discount.type === 'percent' ? ` ${Number(model.discount.value)}%` : ''}</span><strong>-${money(totals.discountAmount)}</strong></div>
      <div class="afterDiscount"><span>ยอดหลังหักส่วนลด</span><strong>${money(totals.afterDiscount)}</strong></div>` : ''}
      <div><span>ภาษีมูลค่าเพิ่ม ${Number(model.vatRate)}%</span><strong>${money(totals.vatAmount)}</strong></div>
      <div class="grandTotal"><span>ยอดรวมทั้งสิ้น</span><strong>${money(totals.totalAmount)} บาท</strong></div>
    </section>`;
}

function installmentSection(model) {
  const rows = model.installments.map((row, index) => `
          <tr>
            <td><strong>${index + 1}. ${esc(row.label || '')}</strong>${row.note ? `<span>${esc(row.note)}</span>` : ''}</td>
            <td class="number">${Number(row.percent || 0)}%</td>
            <td class="number">${money(row.amount)}</td>
          </tr>`).join('');
  return `
      <section class="installmentSection">
        <h2>งวดชำระเงิน <span>/ PAYMENT SCHEDULE</span></h2>
        <table class="installmentTable">
          <thead>
            <tr><th>รายละเอียด</th><th class="number">%</th><th class="number">จำนวนเงิน</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
}

function termsSection(model) {
  return `
      <section class="termsGrid">
        <div><h2>วิธีชำระเงิน <span>/ PAYMENT METHOD</span></h2><p>${val(model.paymentMethod)}</p></div>
        <div><h2>เงื่อนไขการชำระเงิน <span>/ PAYMENT TERMS</span></h2><p>${val(model.paymentTerms)}</p></div>
        <div class="remarks"><h2>หมายเหตุ <span>/ REMARKS</span></h2><p>${val(model.remarks)}</p></div>
      </section>`;
}

function sectionLead(kind, documentNumber) {
  const isAcceptance = kind === 'acceptance';
  return `
      <div class="sectionLead">
        <div>
          <strong>${isAcceptance ? 'การยืนยันเอกสาร' : 'รายละเอียดการชำระเงิน'}</strong>
          <span>${isAcceptance ? '/ DOCUMENT ACCEPTANCE' : '/ PAYMENT DETAILS'}</span>
        </div>
        <small>${val(documentNumber)}</small>
      </div>`;
}

function signBox(signer) {
  const body = signer.esignature
    ? `
        <div class="signaturePreview" aria-label="ตำแหน่งภาพลายเซ็นอิเล็กทรอนิกส์">ลายเซ็นอิเล็กทรอนิกส์</div>
        <strong>${val(signer.esignature.signerName)}</strong>
        <p>${val(signer.esignature.signerRole)}${signer.esignature.signedAt ? ` · ${esc(signer.esignature.signedAt)}` : ''}</p>
        ${signer.esignature.evidenceId ? `<small>Evidence ${esc(signer.esignature.evidenceId)}</small>` : ''}`
    : `
        <div class="signatureSpace">ลงชื่อ</div>
        <strong>${signer.name ? `(${esc(signer.name)})` : '(____________________________)'}</strong>
        <p>วันที่ ______ / ______ / ______</p>`;
  return `
        <div class="${signer.esignature ? 'signed' : ''}">
          <h2>${esc(signer.label)}${signer.role ? ` <span>${esc(signer.role)}</span>` : ''}</h2>${body}
        </div>`;
}

function signatures(model) {
  return `
      <section class="signatures" aria-label="ส่วนลงนาม">${(model.signers || []).map(signBox).join('')}</section>`;
}

function documentFooter(model, pageNumber, pageCount) {
  return `
    <footer class="footer">
      <span>${val(model.company.website)}</span>
      <span>${val(model.formLine)}</span>
      <span>หน้า ${pageNumber} / ${pageCount}</span>
    </footer>`;
}

function renderPages(model) {
  let lineOffset = 0;
  return model.pages.map((page, pageIndex) => {
    const startIndex = lineOffset;
    lineOffset += page.lines.length;
    const paymentBlock = (page.showPayment || page.showSignatures)
      ? `
      <div class="paymentContent">
        ${page.showPayment ? `<div class="paymentDetails">${installmentSection(model)}${termsSection(model)}</div>` : ''}
        ${page.showSignatures ? signatures(model) : ''}
      </div>`
      : '';
    return `
    <article class="sheet" data-page-kind="${esc(page.kind)}" aria-label="ใบเสนอราคา หน้า ${pageIndex + 1}">
      ${model.watermark ? `<div class="watermark">${esc(model.watermark)}</div>` : ''}
      ${documentHeader(model)}
      <div class="sheetContent">
        ${page.showParty ? partyGrid(model) : ''}
        ${page.kind === 'items' && pageIndex > 0 ? `<div class="continuation">รายการสินค้าและบริการต่อ · ${val(model.document.number)}</div>` : ''}
        ${(page.kind === 'payment' || page.kind === 'acceptance') ? sectionLead(page.kind, model.document.number) : ''}
        ${page.lines.length > 0 ? itemTable(page.lines, startIndex) : ''}
        ${page.showTotals ? totalsSection(model) : ''}
        ${paymentBlock}
      </div>
      ${documentFooter(model, pageIndex + 1, model.pages.length)}
    </article>`;
  }).join('');
}

// CSS คัดลอกจาก QuotationMasterDocument.module.css (verbatim) — ใช้ชื่อคลาสตรงเป็น global
// ในเอกสารเดี่ยว. เพิ่มเฉพาะโครง body/toolbar และ backdrop สำหรับพรีวิวบนจอ.
const DOCUMENT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eceff3; -webkit-font-smoothing: antialiased;
         -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
         font-family: 'IBM Plex Sans Thai', 'Leelawadee UI', sans-serif; }
  .toolbar { display: flex; justify-content: space-between; align-items: center;
             width: 210mm; max-width: 100%; margin: 16px auto 0; padding: 0 4px;
             font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif; }
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
    font-family: 'IBM Plex Sans Thai', 'Leelawadee UI', sans-serif;
    font-size: 9.5pt;
    line-height: 1.42;
    font-variant-numeric: tabular-nums;
  }
  .grayscale { filter: grayscale(1); }
  .sheet {
    position: relative; display: flex; flex-direction: column;
    width: 210mm; height: 297mm; min-height: 297mm; box-sizing: border-box;
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
  .partyGrid strong { display: block; font-size: 9.4pt; }
  .partyGrid p { margin: .8mm 0; color: var(--doc-muted); font-size: 8pt; }
  .partyGrid dl { margin: 1.2mm 0 0; }
  .partyGrid dl div { display: grid; grid-template-columns: 24mm 1fr; gap: 2mm; margin-top: .5mm; }
  .partyGrid dt { color: var(--doc-muted); font-size: 7.7pt; }
  .partyGrid dd { min-width: 0; margin: 0; font-size: 8pt; }
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
  .itemTable strong { display: block; font-weight: 500; }
  .itemCode { display: inline-block; margin-top: .7mm; color: var(--doc-navy); font-size: 7.6pt; font-weight: 600; }
  .itemNote { display: block; margin-top: .5mm; color: var(--doc-muted); font-size: 7.7pt; }
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
  .installmentTable th:first-child, .installmentTable td:first-child { width: 100%; }
  .installmentTable th:nth-child(2), .installmentTable td:nth-child(2) { width: 14mm; white-space: nowrap; }
  .installmentTable th:nth-child(3), .installmentTable td:nth-child(3) { width: 30mm; white-space: nowrap; }
  .installmentTable span { display: block; color: var(--doc-muted); font-size: 7pt; }
  .termsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-top: 3mm; break-inside: avoid; }
  .termsGrid > div { padding: 2.2mm 2.6mm; background: var(--doc-neutral-soft); border-top: 1px solid var(--doc-line-strong); }
  .termsGrid p { margin: 0; color: var(--doc-text); font-size: 7.8pt; }
  .termsGrid .remarks { grid-column: 1 / -1; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-top: auto; padding-top: 3mm; break-inside: avoid; }
  .signatures > div { min-height: 31mm; padding: 2mm; text-align: center; border: 1px solid var(--doc-line-strong); }
  .signatures h2 { margin: 0; color: var(--doc-navy); font-size: 8pt; }
  .signatures h2 span { display: block; color: var(--doc-muted); font-size: 6.8pt; font-weight: 400; }
  .signatureSpace, .signaturePreview { display: grid; height: 12mm; color: var(--doc-line-strong); font-size: 7pt; }
  .signatureSpace { box-sizing: border-box; place-items: end start; padding: 0 1mm .8mm; }
  .signaturePreview { place-items: center; color: var(--doc-navy); font-size: 9pt; font-weight: 600; font-style: italic; }
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

  @page { size: A4 portrait; margin: 0; }
  @media screen and (max-width: 900px) {
    .toolbar { width: 100%; }
    .sheet { width: 100%; height: auto; min-height: 0; aspect-ratio: auto;
      padding: 4.8vw 5vw 9vw; font-size: clamp(5px, 1.18vw, 9.5pt); }
    .documentHeader { grid-template-columns: 1.3fr .9fr; gap: 3vw; }
    .brandBlock img { width: 21vw; }
    .identityBlock h1 { font-size: clamp(12px, 3vw, 19pt); }
    .partyGrid { grid-template-columns: minmax(0, 1fr); }
    .partyGrid dl, .partyGrid dl div { min-width: 0; }
    .partyGrid dl div { grid-template-columns: minmax(0, 34%) minmax(0, 1fr); }
    .partyGrid dd { overflow-wrap: anywhere; }
    .itemTable { table-layout: fixed; }
    .itemTable th, .itemTable td { padding-right: .6mm; padding-left: .6mm; overflow-wrap: anywhere; }
    .itemTable th:nth-child(1), .itemTable td:nth-child(1) { width: 7%; }
    .itemTable th:nth-child(2), .itemTable td:nth-child(2) { width: 39%; }
    .itemTable th:nth-child(3), .itemTable td:nth-child(3) { width: 10%; }
    .itemTable th:nth-child(4), .itemTable td:nth-child(4) { width: 9%; }
    .itemTable th:nth-child(5), .itemTable td:nth-child(5) { width: 16%; }
    .itemTable th:nth-child(6), .itemTable td:nth-child(6) { width: 19%; }
    .signatures { grid-template-columns: minmax(0, 1fr); }
    .signatures > div { min-width: 0; }
    .footer { right: 5vw; bottom: 2vw; left: 5vw; }
  }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .document { display: block; padding: 0; filter: none; }
    .grayscale { filter: grayscale(1); }
    .sheet { width: 210mm; height: 297mm; min-height: 297mm; margin: 0; box-shadow: none;
      break-after: page; page-break-after: always; }
    .sheetContent { padding-bottom: 2vw; }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
  }`;

// เรนเดอร์ model (จาก buildQuotationMasterModelFromQuote หรือ buildQuotationMasterPreview)
// เป็น HTML เอกสารเต็มไฟล์เดียว. options.grayscale = โหมดขาวดำ; options.toolbar=false ปิดปุ่มพิมพ์
// สี accent ต่อชนิดเอกสาร (ตาม DOCUMENT_ACCENT_KEYS/LABELS ใน documentStandards):
// ใบเสนอราคา = terracotta, ใบสั่งขาย = teal, ฯลฯ. ค่าเป็น hex สำหรับเอกสารพิมพ์
// (self-contained ใช้ตัวแปร theme ของแอปไม่ได้). --doc-accent คุมสีชื่อเอกสาร (h1).
export const DOCUMENT_ACCENT_THEMES = Object.freeze({
  terracotta: { accent: '#ad5d43', soft: '#f5ebe7', watermark: 'rgb(173 93 67 / 14%)' },
  steel: { accent: '#1e6091', soft: '#e6eef4', watermark: 'rgb(30 96 145 / 14%)' },
  teal: { accent: '#0f766e', soft: '#e6f2f0', watermark: 'rgb(15 118 110 / 14%)' },
  amber: { accent: '#b45309', soft: '#fdf1e3', watermark: 'rgb(180 83 9 / 13%)' },
  green: { accent: '#15803d', soft: '#e8f3ec', watermark: 'rgb(21 128 61 / 13%)' },
  navy: { accent: '#1f3551', soft: '#eef1f5', watermark: 'rgb(31 53 81 / 13%)' },
});

function accentStyle(accentKey) {
  const theme = DOCUMENT_ACCENT_THEMES[accentKey] || DOCUMENT_ACCENT_THEMES.terracotta;
  return `--doc-accent:${theme.accent};--doc-accent-soft:${theme.soft};--doc-accent-watermark:${theme.watermark};`;
}

export function renderQuotationMasterDocumentHTML(model, options = {}) {
  const grayscale = options.grayscale === true;
  const showToolbar = options.toolbar !== false;
  const documentLabel = options.documentLabel || 'ใบเสนอราคา';
  const number = model.document?.number || '';
  const styleAttr = accentStyle(model.accentKey);
  const toolbar = showToolbar
    ? `<div class="toolbar no-print"><h1>${esc(documentLabel)} ${esc(number)}</h1><button class="btn-print" type="button" onclick="window.print()">พิมพ์เอกสาร</button></div>`
    : '';
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(number)} — ${esc(documentLabel)}</title>
<style>${DOCUMENT_FONT_FACE_CSS}</style>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
  ${toolbar}
  <div class="document v4${grayscale ? ' grayscale' : ''}" style="${styleAttr}" data-template-version="${esc(model.templateVersion || '')}">
    ${renderPages(model)}
  </div>
</body>
</html>`;
}

// สร้าง HTML เอกสารจาก quotation จริง — เครื่องยนต์เอกสาร V4 เดียวสำหรับการพิมพ์ + ตรึง snapshot
export function buildQuotationMasterHTML(quote, options = {}) {
  const model = buildQuotationMasterModelFromQuote(quote, options);
  return renderQuotationMasterDocumentHTML(model, options);
}

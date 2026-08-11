// เอกสารใบเสนอราคา FM-SA-01 หน้าตา "Quotation Master Template V4" — เรนเดอร์เป็น
// HTML ไฟล์เดียวจบในตัว (ฝัง CSS) ฝั่ง server ได้ ใช้ทั้งพิมพ์จริง + ตรึง snapshot 7B
// + หน้า preview. Phase 7C (Direction B): V4 = เอกสารตัวจริง แทน quotePrint เดิม.
//
// ไฟล์นี้เป็น "แหล่งเดียว" ของหน้าตาเอกสารใบเสนอราคา V4 แล้ว (markup + CSS ฝังใน
// DOCUMENT_CSS) — component React เดิม (QuotationMasterDocument) ถูกปลดระวางแล้ว
// (Phase 7C 2026-07-21). ใช้ชื่อคลาสตรง ๆ ได้เพราะเป็นหน้าเดี่ยว self-contained.
import { buildQuotationMasterModelFromQuote } from '@/lib/sales/quotationMasterTemplate';
import { fmtNumber, fmtPhone } from '@/lib/format';
import {
  DOCUMENT_ACCENT_THEMES,
  documentFileName,
  documentFooter as shellFooter,
  documentHeader as shellHeader,
  esc,
  money,
  partyGrid as shellPartyGrid,
  renderDocumentHTML,
  val,
  watermarkBlock,
} from '@/lib/documents/documentShell';

// หัวเอกสาร/กล่องคู่สัญญา/ท้ายกระดาษ/ลายน้ำ ย้ายไปอยู่ documentShell แล้ว — ที่นี่เหลือ
// เฉพาะการ "แปลง model ของใบเสนอราคา" เป็นรูปที่เปลือกรับ
function documentHeader(model) {
  return shellHeader({
    company: model.company,
    formLine: model.formLine,
    titleTh: model.standard.titleTh,
    titleEn: model.standard.titleEn,
    rows: [
      { label: 'เลขที่', value: model.document.number },
      { label: model.document.dateLabel, value: model.document.dateValue },
      { label: model.document.secondaryLabel, value: model.document.secondaryValue },
    ],
  });
}

function partyGrid(model) {
  // ประกอบเองเพื่อคงพฤติกรรมเดิมเป๊ะ: ไม่มีชื่อผู้ติดต่อแต่มีเบอร์ → "- · 08x…"
  // (ถ้าปล่อยให้เปลือกเติม "-" ให้ทั้งช่อง เบอร์จะหายไป)
  const contactName = model.customer.contactName;
  const contact = `${contactName === null || contactName === undefined || contactName === '' ? '-' : contactName}`
    // เบอร์บนกระดาษต้องอ่านเป็นรูปเดียวกับบนจอ — จัดรูปแบบผ่านตัวกลางเสมอ
    + (model.customer.contactPhone ? ` · ${fmtPhone(model.customer.contactPhone)}` : '');
  return shellPartyGrid({
    ariaLabel: 'ข้อมูลลูกค้าและข้อมูลอ้างอิง',
    party: {
      heading: 'ผู้ซื้อ',
      headingEn: '/ CUSTOMER',
      name: model.customer.name,
      address: model.customer.address,
      rows: [
        { label: 'เลขผู้เสียภาษี', value: model.customer.taxId },
        // 'สำนักงาน' ของลูกค้าถูกตัดออก (มติผู้ใช้ 2026-08-05) — สาขาอยู่ในที่อยู่อยู่แล้ว
        { label: 'ที่อยู่จัดส่ง', value: model.customer.shippingAddress || model.customer.address },
        { label: 'ผู้ติดต่อ', value: contact },
      ],
    },
    reference: { heading: 'ข้อมูลอ้างอิง', headingEn: '/ REFERENCE', rows: model.referenceRows || [] },
  });
}

// มีบรรทัดไหนถูกลดราคาบ้าง — ตัดสินจากทั้งใบ ไม่ใช่ทีละหน้า เพราะหัวตารางทุกหน้า
// ต้องมีจำนวนคอลัมน์เท่ากัน (ใบหลายหน้าไม่งั้นสลับหน้าละแบบ)
function hasLineDiscount(lines = []) {
  return lines.some((line) => Number(line.discountAmount || 0) > 0);
}

// ช่องส่วนลดของบรรทัด: **ยอดเงินอย่างเดียว** ไม่กำกับอัตรา % (มติผู้ใช้ 2026-08-11) —
// บนกระดาษลูกค้ากระทบยอดจากตัวเงิน: ราคา/หน่วย × จำนวน − ส่วนลด = จำนวนเงิน
// อัตราเป็นกติกาภายในของฝ่ายขาย ไม่ต้องขึ้นเอกสาร
function discountCell(line) {
  const amount = Number(line.discountAmount || 0);
  return `<td class="number">${amount > 0 ? `-${money(amount)}` : '-'}</td>`;
}

function itemTable(lines, startIndex, showDiscount) {
  const rows = lines.map((line, index) => {
    const identityMeta = [line.fgCode, line.brand].filter(Boolean).map(esc).join(' · ');
    return `
        <tr>
          <td class="center">${startIndex + index + 1}</td>
          <td>
            ${identityMeta ? `<span class="itemIdentity">${identityMeta}</span>` : ''}
            <strong class="itemName">${val(line.description)}</strong>
            ${line.note ? `<span class="itemNote">${esc(line.note)}</span>` : ''}
          </td>
          <td class="number">${fmtNumber(line.qty || 0)}</td>
          <td class="center">${val(line.unit)}</td>
          <td class="number">${money(line.unitPrice)}</td>
          ${showDiscount ? discountCell(line) : ''}
          <td class="number">${money(line.lineTotal)}</td>
        </tr>`;
  }).join('');
  return `
    <table class="itemTable${showDiscount ? ' withLineDiscount' : ''}">
      <thead>
        <tr>
          <th class="center">ลำดับ</th>
          <th>รายละเอียดสินค้า / บริการ</th>
          <th class="number">จำนวน</th>
          <th class="center">หน่วย</th>
          <th class="number">ราคา/หน่วย</th>
          ${showDiscount ? '<th class="number">ส่วนลด</th>' : ''}
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
  // มีรูปลายเซ็นจริง (data URI base64) → แสดงรูป; ไม่มี → กล่องข้อความ "ลายเซ็นอิเล็กทรอนิกส์"
  // (data URI base64 ไม่มีอักขระ " ‹ › & จึงใส่ใน src ได้ตรง ๆ ไม่ต้อง esc)
  const esigMark = signer.esignature?.imageDataUri
    ? `<img class="signatureImage" src="${signer.esignature.imageDataUri}" alt="ลายเซ็น ${esc(signer.esignature.signerName || '')}" />`
    : '<div class="signaturePreview" aria-label="ตำแหน่งภาพลายเซ็นอิเล็กทรอนิกส์">ลายเซ็นอิเล็กทรอนิกส์</div>';
  // แถวรายละเอียด: ตำแหน่ง + เวลาลงนาม (มีเฉพาะที่มีจริง) — ผู้อนุมัติ evidence-backed
  // มีครบ; ผู้เสนอราคาเป็น stamp เชิงภาพ ส่ง role/เวลาว่าง → โชว์แค่รูป+ชื่อ ไม่มี Evidence
  const esigMeta = [signer.esignature?.signerRole, signer.esignature?.signedAt].filter(Boolean).map(esc).join(' · ');
  const body = signer.esignature
    ? `
        ${esigMark}
        <strong>${val(signer.esignature.signerName)}</strong>
        ${esigMeta ? `<p>${esigMeta}</p>` : ''}
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

// ท้ายกระดาษ: ชื่อบริษัท · รหัสแบบฟอร์ม · เลขหน้า
// (เว็บไซต์ย้ายขึ้นไปอยู่แถวเดียวกับ โทร/Line บนหัวเอกสารแล้ว — มติผู้ใช้ 2026-07-26)
function documentFooter(model, pageNumber, pageCount) {
  return shellFooter({
    left: model.company.nameTh,
    center: model.formLine,
    right: `หน้า ${pageNumber} / ${pageCount}`,
  });
}

function renderPages(model) {
  let lineOffset = 0;
  // ดูจากบรรทัดที่ถูกพิมพ์จริง (ทุกหน้ารวมกัน) — ใบที่ไม่มีส่วนลดรายบรรทัดเลยไม่ต้องมี
  // คอลัมน์เปล่า ๆ กินความกว้างช่องรายละเอียด
  const showDiscount = hasLineDiscount(model.pages.flatMap((page) => page.lines || []));
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
      ${watermarkBlock(model.watermark)}
      ${documentHeader(model)}
      <div class="sheetContent">
        ${page.showParty ? partyGrid(model) : ''}
        ${page.kind === 'items' && pageIndex > 0 ? `<div class="continuation">รายการสินค้าและบริการต่อ · ${val(model.document.number)}</div>` : ''}
        ${(page.kind === 'payment' || page.kind === 'acceptance') ? sectionLead(page.kind, model.document.number) : ''}
        ${page.lines.length > 0 ? itemTable(page.lines, startIndex, showDiscount) : ''}
        ${page.showTotals ? totalsSection(model) : ''}
        ${paymentBlock}
      </div>
      ${documentFooter(model, pageIndex + 1, model.pages.length)}
    </article>`;
  }).join('');
}

// CSS + ธีมสี accent ย้ายไป lib/documents/documentShell.js แล้ว (ใช้ร่วมกับใบแจ้ง
// ชำระภาษี) — ที่นี่ re-export DOCUMENT_ACCENT_THEMES ไว้เพราะมีผู้เรียกอ้างจาก
// โมดูลนี้อยู่ก่อนแล้ว (lib/documentStandards.test.mjs)
export { DOCUMENT_ACCENT_THEMES };

// เรนเดอร์ model (จาก buildQuotationMasterModelFromQuote หรือ buildQuotationMasterPreview)
// เป็น HTML เอกสารเต็มไฟล์เดียว. options.grayscale = โหมดขาวดำ; options.toolbar=false ปิดปุ่มพิมพ์
// สี accent ต่อชนิดเอกสาร: ใบเสนอราคา = terracotta, ใบสั่งขาย = steel
// (มติผู้ใช้ 2026-07-21 — ดู salesOrderPrint.js)
export function renderQuotationMasterDocumentHTML(model, options = {}) {
  const documentLabel = options.documentLabel || 'ใบเสนอราคา';
  const number = model.document?.number || '';
  return renderDocumentHTML({
    // title = ชื่อไฟล์ที่ต้องการ เพราะเบราว์เซอร์ใช้ document.title ตั้งชื่อไฟล์ตอน
    // "พิมพ์ → บันทึกเป็น PDF" ซึ่งเป็นทางดาวน์โหลดหลักของเอกสารพวกนี้
    title: documentFileName(number, model.customer?.name, model.dealTitle),
    accentKey: model.accentKey,
    grayscale: options.grayscale === true,
    variantClass: 'v4',
    dataAttrs: ` data-template-version="${esc(model.templateVersion || '')}"`,
    toolbar: options.toolbar === false ? null : { label: `${documentLabel} ${number}` },
    pages: renderPages(model),
  });
}

// สร้าง HTML เอกสารจาก quotation จริง — เครื่องยนต์เอกสาร V4 เดียวสำหรับการพิมพ์ + ตรึง snapshot
export function buildQuotationMasterHTML(quote, options = {}) {
  const model = buildQuotationMasterModelFromQuote(quote, options);
  return renderQuotationMasterDocumentHTML(model, options);
}

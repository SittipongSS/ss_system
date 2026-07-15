// พิมพ์ใบเสนอราคา FM-SA-01 — ใช้ design system เดียวกับเอกสาร Project Timeline.
import { fmtDate } from '@/lib/format';
import {
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  COMPANY_LINE,
  COMPANY_OFFICE_TEL,
  COMPANY_TAX_ID,
  COMPANY_WEBSITE,
  DOCUMENT_FORMS,
  SYSTEM_DOCUMENT_LOGO_URL,
  documentFormLine,
} from '@/lib/documentBrand';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (v) => Number(v || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const value = (v) => (v === null || v === undefined || v === '' ? '-' : esc(v));
const printDate = (v) => (v ? fmtDate(v).replaceAll('/', '.') : '-');

// ต้องเปิด window ภายใน call stack ของ click โดยตรง มิฉะนั้น Chromium จะบล็อก popup
// เมื่อมี fetch/save ที่ await ก่อน window.open.
export function prepareQuotePrintWindow() {
  // ไม่ระบุ window features เพื่อให้ browser เปิดพรีวิวเป็นแท็บใหม่แทน popup window.
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
    return null;
  }
  try { printWindow.opener = null; } catch { /* browser บางรุ่นไม่อนุญาตให้แก้ opener */ }
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กำลังเตรียมใบเสนอราคา…</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:80vh;color:#555}p{padding:20px}</style></head><body><p>กำลังเตรียมเอกสารสำหรับพิมพ์…</p></body></html>`);
  printWindow.document.close();
  return printWindow;
}

export function showQuotePrintError(printWindow, message = 'ไม่สามารถโหลดข้อมูลใบเสนอราคาได้') {
  if (!printWindow || printWindow.closed) return;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ไม่สามารถพิมพ์ใบเสนอราคา</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#8b2f2f}button{padding:8px 14px}</style></head><body><h2>ไม่สามารถพิมพ์ใบเสนอราคา</h2><p>${esc(message)}</p><button onclick="window.close()">ปิดหน้าต่าง</button></body></html>`);
  printWindow.document.close();
}

// หัวเอกสารกลางของเอกสารขาย ใช้โครงและสีเดียวกับ Project Timeline.
export function printHeaderHtml({ form, docNumber, docDate }) {
  return `
    <div class="doc-top">
      <div class="brand">
        <div class="logo-wrap"><img src="${SYSTEM_DOCUMENT_LOGO_URL}" alt="Scent &amp; Sense" /></div>
        <div>
          <h2>${esc(COMPANY_LEGAL_NAME)}</h2>
          <div class="company-info">
            <div>${esc(COMPANY_ADDRESS)}</div>
            <div>เลขประจำตัวผู้เสียภาษี ${esc(COMPANY_TAX_ID)}</div>
            <div>โทร ${esc(COMPANY_OFFICE_TEL)} &nbsp; Line ${esc(COMPANY_LINE)} &nbsp; ${esc(COMPANY_WEBSITE)}</div>
          </div>
        </div>
      </div>
      <div class="doc-title">
        <div class="formno">${esc(documentFormLine(form))}</div>
        <div class="big">${esc(form.title)}</div>
        <div class="sub strong doc-number-line"><span>${value(docNumber)}</span><span>${value(docDate)}</span></div>
      </div>
    </div>`;
}

export function buildQuotePrintHTML(quote) {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const hasLineDiscount = lines.some((line) => Number(line.discountAmount) > 0);
  const rows = lines
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((line, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td class="description">${line.fgCode ? `<span class="fg-code">${esc(line.fgCode)}</span> · ` : ''}${value(line.description)}</td>
        <td class="n">${Number(line.qty || 0).toLocaleString('th-TH')}</td>
        <td class="n">${money(line.unitPrice)}</td>
        ${hasLineDiscount ? `<td class="n">${Number(line.discountAmount) > 0 ? money(line.discountAmount) : '-'}</td>` : ''}
        <td class="n">${money(line.lineTotal)}</td>
      </tr>`)
    .join('') || `<tr class="empty-row"><td colspan="${hasLineDiscount ? 6 : 5}">ไม่มีรายการสินค้า</td></tr>`;

  const paymentPlan = quote.paymentPlan;
  const installmentTable = paymentPlan?.type === 'installment'
    && Array.isArray(paymentPlan.installments)
    && paymentPlan.installments.length
    ? `<table class="pay">
        <thead><tr><th class="c" style="width:36px">งวด</th><th>รายละเอียด</th><th class="n" style="width:52px">%</th><th class="n" style="width:92px">จำนวนเงิน</th></tr></thead>
        <tbody>${paymentPlan.installments.map((row, index) => `
          <tr><td class="c">${index + 1}</td><td>${esc(row.label || `งวดที่ ${index + 1}`)}${row.note ? `<div class="muted">${esc(row.note)}</div>` : ''}</td><td class="n">${Number(row.percent || 0)}%</td><td class="n">${money(row.amount)}</td></tr>`).join('')}</tbody>
      </table>`
    : '';

  const totals = `
    <tr><td>รวมเป็นเงิน</td><td class="n">${money(quote.subtotal)}</td></tr>
    ${Number(quote.discountAmount) > 0 ? `<tr><td>ส่วนลด${quote.discountType === 'percent' ? ` ${Number(quote.discountValue)}%` : ''}</td><td class="n discount">-${money(quote.discountAmount)}</td></tr>` : ''}
    <tr><td>ภาษีมูลค่าเพิ่ม ${Number(quote.vatRate || 0)}%</td><td class="n">${money(quote.vatAmount)}</td></tr>
    <tr class="grand"><td>ยอดรวมทั้งสิ้น</td><td class="n">${money(quote.totalAmount)}</td></tr>`;

  const dealTitle = quote.deal?.title || quote.dealTitle || '-';
  const projectTitle = quote.project?.name || quote.projectName || '-';
  const branch = quote.branchCode ? `สาขา ${quote.branchCode}` : 'สำนักงานใหญ่';
  // ผู้รับผิดชอบเอกสาร (เลือกในฟอร์ม — ชุดเดียวกับไทม์ไลน์): ผู้ดูแลขึ้นหัวใบ,
  // ผู้จัดทำ/ผู้ตรวจสอบลงช่องลงชื่อ (fallback ใบเก่า: ผู้สร้างใบ)
  const aeOwner = quote.metadata?.aeOwner || '';
  const preparedBy = quote.metadata?.preparedBy || quote.createdByName || '';
  const reviewer = quote.metadata?.aeSupervisor || '';

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${value(quote.quoteNumber)} — ใบเสนอราคา</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; color: #21385e; font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif;
         -webkit-font-smoothing: antialiased; font-size: 12px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .toolbar { width: min(210mm, 100%); margin: 0 auto; padding: 16px 12px 0;
             display: flex; justify-content: space-between; align-items: center; }
  .toolbar h1 { font-size: 16px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: 0; font: inherit; font-weight: 600;
               padding: 8px 18px; border-radius: 8px; cursor: pointer; }
  .btn-print:hover { background: #2e2620; }
  .sheet { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff;
           box-shadow: 0 8px 32px rgba(40,33,24,.12); padding: 9mm 10mm; }
  .doc-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
             border-bottom: 2px solid #c17a52; padding-bottom: 7px; margin-bottom: 7px;
             page-break-after: avoid; break-after: avoid; }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .logo-wrap { height: 46px; flex-shrink: 0; display: flex; align-items: center; }
  .logo-wrap img { height: 46px; width: auto; max-width: 240px; display: block; }
  .brand h2 { color: #21385e; font-size: 13px; font-weight: 700; line-height: 1.25; }
  .company-info { font-size: 8.5px; color: #837868; line-height: 1.4; margin-top: 3px; }
  .doc-title { flex-shrink: 0; }
  .doc-title .formno { font-size: 9px; font-weight: 700; color: #837868; letter-spacing: .5px; text-align: right; }
  .doc-title .big { font-size: 17px; font-weight: 800; color: #c17a52; letter-spacing: 2px; text-align: right; white-space: nowrap; }
  .doc-title .sub { font-size: 9.5px; color: #837868; text-align: right; }
  .doc-title .strong { color: #21385e; font-weight: 700; }
  .doc-number-line { display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; white-space: nowrap; }
  .doc-number-line span + span { color: #837868; font-weight: 500; }
  .header-grid { display: grid; grid-template-columns: 1.25fr 1fr; border: 1px solid #dcd8d0;
                 border-radius: 6px; overflow: hidden; margin-bottom: 7px; page-break-inside: avoid; break-inside: avoid; }
  .hcol { padding: 7px 10px; min-width: 0; }
  .hcol.left { border-right: 1px solid #dcd8d0; background: #f7f3ec; }
  .hrow { display: flex; gap: 6px; font-size: 9.5px; line-height: 1.5; }
  .hrow .k { color: #000; min-width: 76px; flex-shrink: 0; }
  .hrow .v { color: #000; font-weight: 600; min-width: 0; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cfc9bf; }
  thead th { background: #e8e2d9; color: #000; font-size: 9px; font-weight: 700; padding: 4px 5px; text-align: center; line-height: 1.2; }
  tbody tr { page-break-inside: avoid; break-inside: avoid; }
  table.items { margin-bottom: 9px; }
  table.items td { color: #000; font-size: 9.5px; padding: 4px 6px; vertical-align: top; line-height: 1.35; }
  .c { text-align: center; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .description { word-break: break-word; }
  .fg, .muted { color: #837868; font-size: 8.5px; }
  /* รหัส FG นำหน้าคำอธิบายบรรทัด (รหัส · แบรนด์ · ชื่อสินค้า · ปริมาตร) */
  .fg-code { font-weight: 600; }
  .empty-row td { height: 32px; color: #837868; text-align: center; vertical-align: middle; }
  .commercial { display: flex; flex-direction: column; gap: 9px;
                page-break-inside: avoid; break-inside: avoid; }
  .totals-wrap { display: flex; justify-content: flex-end; }
  .totals-wrap table { width: 72mm; }
  .commercial-info { border: 1px solid #dcd8d0; border-radius: 6px; overflow: hidden; }
  .info-block { padding: 6px 9px; min-height: 40px; color: #000; white-space: pre-wrap; }
  .info-block + .info-block { border-top: 1px solid #dcd8d0; }
  .info-block .lbl { color: #837868; font-size: 8.5px; font-weight: 600; margin-bottom: 2px; }
  table.totals td { border: 0; border-bottom: 1px solid #dcd8d0; color: #000; padding: 5px 8px; font-size: 10px; }
  table.totals tr:first-child td { border-top: 1px solid #dcd8d0; }
  table.totals td:first-child { border-left: 1px solid #dcd8d0; }
  table.totals td:last-child { border-right: 1px solid #dcd8d0; }
  table.totals .discount { color: #b0483b; }
  table.totals tr.grand td { background: #f7f3ec; color: #21385e; font-size: 12px; font-weight: 800;
                            border-top: 2px solid #c17a52; border-bottom: 2px solid #c17a52; }
  table.pay { margin-top: 5px; }
  table.pay th, table.pay td { font-size: 8.5px; padding: 3px 5px; color: #000; }
  .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 25mm;
           page-break-inside: avoid; break-inside: avoid; }
  .sign { text-align: center; color: #21385e; }
  .sign .line { border-bottom: 1px dotted #837868; height: 10mm; margin: 0 8px 5px; }
  .sign .who { font-size: 9.5px; font-weight: 600; line-height: 1.4; }
  .sign .role { color: #837868; font-size: 8.5px; font-weight: 400; }
  @page { size: A4 portrait; margin: 9mm 8mm 12mm; }
  @media (max-width: 820px) {
    .toolbar { width: 100%; }
    .sheet { width: 100%; min-height: auto; margin: 12px 0; padding: 18px 14px; box-shadow: none; }
    .doc-top { flex-direction: column; }
    .doc-title { width: 100%; }
    .doc-title .formno, .doc-title .big, .doc-title .sub { text-align: left; }
    .header-grid { grid-template-columns: 1fr; }
    .totals-wrap table { width: 100%; }
    .hcol.left { border-right: 0; border-bottom: 1px solid #dcd8d0; }
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <h1>ใบเสนอราคา ${value(quote.quoteNumber)}</h1>
    <button class="btn-print" type="button" onclick="window.print()">พิมพ์เอกสาร</button>
  </div>
  <main class="sheet">
    ${printHeaderHtml({ form: DOCUMENT_FORMS.quotation, docNumber: quote.quoteNumber, docDate: printDate(quote.quoteDate) })}
    <section class="header-grid">
      <div class="hcol left">
        <div class="hrow"><span class="k">ลูกค้า</span><span class="v">${value(quote.customerName)}</span></div>
        <div class="hrow"><span class="k">สาขา</span><span class="v">${esc(branch)}</span></div>
        <div class="hrow"><span class="k">ที่อยู่ออกบิล</span><span class="v">${value(quote.billingAddress)}</span></div>
        ${quote.shippingAddress && quote.shippingAddress !== quote.billingAddress ? `<div class="hrow"><span class="k">ที่อยู่จัดส่ง</span><span class="v">${esc(quote.shippingAddress)}</span></div>` : ''}
        <div class="hrow"><span class="k">ผู้ติดต่อ</span><span class="v">${value(quote.contactName)}${quote.contactPhone ? ` · ${esc(quote.contactPhone)}` : ''}</span></div>
      </div>
      <div class="hcol">
        <div class="hrow"><span class="k">เลขที่</span><span class="v">${value(quote.quoteNumber)}</span></div>
        <div class="hrow"><span class="k">วันที่ออกใบ</span><span class="v">${value(fmtDate(quote.quoteDate))}</span></div>
        <div class="hrow"><span class="k">ยืนราคาถึง</span><span class="v">${quote.validUntil ? value(fmtDate(quote.validUntil)) : '-'}</span></div>
        <div class="hrow"><span class="k">โครงการ</span><span class="v">${value(projectTitle)}</span></div>
        <div class="hrow"><span class="k">ดีล</span><span class="v">${value(dealTitle)}</span></div>
        ${aeOwner ? `<div class="hrow"><span class="k">ผู้ดูแล (AE)</span><span class="v">${esc(aeOwner)}</span></div>` : ''}
        ${Number(quote.revisionNo) > 0 ? `<div class="hrow"><span class="k">ฉบับแก้ไข</span><span class="v">R${Number(quote.revisionNo)}</span></div>` : ''}
      </div>
    </section>
    <table class="items">
      <colgroup><col style="width:8mm"><col><col style="width:17mm"><col style="width:25mm">${hasLineDiscount ? '<col style="width:22mm">' : ''}<col style="width:27mm"></colgroup>
      <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th>${hasLineDiscount ? '<th>ส่วนลด</th>' : ''}<th>จำนวนเงิน</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="commercial">
      <div class="totals-wrap"><table class="totals"><tbody>${totals}</tbody></table></div>
      <div class="commercial-info">
        <div class="info-block"><div class="lbl">หมายเหตุ / REMARKS</div>${value(quote.notes)}</div>
        <div class="info-block"><div class="lbl">วิธีการชำระเงิน / PAYMENT METHOD</div>${value(paymentPlan?.paymentMethod)}</div>
        <div class="info-block"><div class="lbl">เงื่อนไขการชำระเงิน / PAYMENT TERMS</div>${value(quote.paymentTerms)}${installmentTable}</div>
      </div>
    </section>
    <section class="signs">
      <div class="sign"><div class="line"></div><div class="who">${value(preparedBy)}</div><div class="role">ผู้จัดทำ / ผู้เสนอราคา</div></div>
      <div class="sign"><div class="line"></div><div class="who">${reviewer ? esc(reviewer) : 'ผู้อนุมัติ'}</div><div class="role">ผู้ตรวจสอบ / ผู้อนุมัติ · Scent &amp; Sense</div></div>
      <div class="sign"><div class="line"></div><div class="who">ผู้ยืนยันสั่งซื้อ</div><div class="role">ลูกค้า · วันที่ ____/____/______</div></div>
    </section>
  </main>
</body>
</html>`;
}

export function openQuotePrintWindow(quote, preparedWindow = null) {
  const win = preparedWindow || prepareQuotePrintWindow();
  if (!win) return;
  win.document.open();
  win.document.write(buildQuotePrintHTML(quote));
  win.document.close();
  return win;
}

// พิมพ์ใบเสนอราคา FM-SA-01 (เฟส D) — เปิดหน้าต่างพิมพ์ A4 (pattern เดียวกับ ganttPrint).
// หัวเอกสารใช้โลโก้กลางของระบบบริหารงานลูกค้า (documentBrand.js).
import { fmtDate } from '@/lib/format';
import {
  DOCUMENT_FORMS,
  SYSTEM_DOCUMENT_LOGO_URL,
  documentFormLine,
} from '@/lib/documentBrand';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// หัวเอกสารกลาง: โลโก้ + ชื่อบริษัท + ชื่อฟอร์ม + เลขที่ — ใช้ซ้ำกับเอกสารขายตัวถัดไป (SO/ใบส่งของ)
export function printHeaderHtml({ form, docNumber, docDate }) {
  return `
  <div class="doc-head">
    <div class="brand">
      <div class="doc-logo"><img src="${SYSTEM_DOCUMENT_LOGO_URL}" alt="Scent &amp; Sense" /></div>
      <div>
        <div class="co">บริษัท เซ้นท์ แอนด์ เซนส์ จำกัด — Scent &amp; Sense Co., Ltd.</div>
        <div class="form">เอกสารระบบบริหารงานลูกค้า</div>
      </div>
    </div>
    <div class="docmeta">
      <div class="form-code">${esc(documentFormLine(form))}</div>
      <div class="form-title">${esc(form.title)}</div>
      <div class="form-number">${esc(docNumber)}</div>
      <div class="form-date"><span>วันที่:</span> ${esc(docDate)}</div>
    </div>
  </div>`;
}

export function openQuotePrintWindow(quote) {
  const lines = quote.lines || [];
  const hasLineDiscount = lines.some((l) => Number(l.discountAmount) > 0);
  const rows = lines
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(l.description)}${l.fgCode ? `<div class="fg">${esc(l.fgCode)}</div>` : ''}</td>
        <td class="n">${Number(l.qty || 0).toLocaleString('th-TH')}</td>
        <td class="n">${money(l.unitPrice)}</td>
        ${hasLineDiscount ? `<td class="n">${Number(l.discountAmount) > 0 ? money(l.discountAmount) : '-'}</td>` : ''}
        <td class="n">${money(l.lineTotal)}</td>
      </tr>`)
    .join('');

  const totals = `
    <tr><td>รวมเป็นเงิน</td><td class="n">${money(quote.subtotal)}</td></tr>
    ${Number(quote.discountAmount) > 0 ? `<tr><td>ส่วนลด${quote.discountType === 'percent' ? ` ${Number(quote.discountValue)}%` : ''}</td><td class="n">-${money(quote.discountAmount)}</td></tr>` : ''}
    ${Number(quote.vatRate) > 0 ? `<tr><td>ภาษีมูลค่าเพิ่ม ${Number(quote.vatRate)}%</td><td class="n">${money(quote.vatAmount)}</td></tr>` : ''}
    <tr class="grand"><td>ยอดรวมทั้งสิ้น${Number(quote.vatRate) > 0 ? '' : ' (รวมภาษีมูลค่าเพิ่ม)'}</td><td class="n">${money(quote.totalAmount)}</td></tr>`;

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
  <title>${esc(quote.quoteNumber)} — ใบเสนอราคา</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'IBM Plex Sans Thai', 'Sarabun', system-ui, sans-serif; font-size: 13px; color: #1c1e26; margin: 0; padding: 24px 28px; }
    .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #21385e; padding-bottom: 12px; margin-bottom: 14px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .doc-logo { width: 168px; height: 76px; flex-shrink: 0; border-radius: 8px; overflow: hidden; position: relative; background: #18234f; }
    .doc-logo img { position: absolute; width: 168px; height: 168px; max-width: none; left: 0; top: -50px; }
    .co { font-weight: 700; font-size: 14px; }
    .form { font-size: 13px; color: #444; margin-top: 2px; }
    .docmeta { text-align: right; font-size: 13px; white-space: nowrap; }
    .docmeta span { color: #666; }
    .form-code { color: #837868; font-size: 10px; font-weight: 700; letter-spacing: .4px; }
    .form-title { color: #c17a52; font-size: 18px; font-weight: 800; letter-spacing: 2px; }
    .form-number { color: #21385e; font-size: 11px; font-weight: 700; }
    .form-date { color: #555; font-size: 11px; margin-top: 1px; }
    .cust { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .cust .box { border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; flex: 1; }
    .cust .lbl { font-size: 11px; color: #666; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    table.items th { background: #21385e; color: #fff; padding: 6px 8px; font-size: 12px; }
    table.items td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
    td.c { text-align: center; } td.n { text-align: right; font-variant-numeric: tabular-nums; }
    .fg { font-size: 11px; color: #666; }
    .bottom { display: flex; gap: 16px; align-items: flex-start; }
    .notes { flex: 1; border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; min-height: 80px; white-space: pre-wrap; }
    .notes .lbl, .terms .lbl { font-size: 11px; color: #666; margin-bottom: 2px; }
    .terms { margin-top: 8px; }
    table.totals { width: 280px; border-collapse: collapse; }
    table.totals td { padding: 5px 10px; border-bottom: 1px solid #ddd; }
    table.totals td.n { text-align: right; font-variant-numeric: tabular-nums; }
    table.totals tr.grand td { font-weight: 800; border-top: 2px solid #21385e; border-bottom: 3px double #21385e; font-size: 14px; }
    .signs { display: flex; justify-content: space-around; gap: 24px; margin-top: 42px; }
    .sign { text-align: center; width: 200px; }
    .sign .line { border-bottom: 1px dotted #888; height: 36px; margin-bottom: 6px; }
    .sign .who { font-size: 12px; color: #444; }
    @page { size: A4 portrait; margin: 36mm 10mm 10mm; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-head { position: fixed; top: -29mm; left: 0; right: 0; height: 26mm; margin: 0; background: #fff; z-index: 20; }
    }
  </style></head><body>
  ${printHeaderHtml({ form: DOCUMENT_FORMS.quotation, docNumber: quote.quoteNumber, docDate: fmtDate(quote.quoteDate) })}
  <div class="cust">
    <div class="box">
      <div class="lbl">ลูกค้า / CUSTOMER</div>
      <strong>${esc(quote.customerName || '-')}</strong>
      ${quote.deal?.title ? `<div style="font-size:12px;color:#555">งาน: ${esc(quote.deal.title)}</div>` : ''}
    </div>
    <div class="box" style="max-width:240px">
      <div class="lbl">ยืนราคาถึง / VALID UNTIL</div>
      <strong>${quote.validUntil ? fmtDate(quote.validUntil) : '-'}</strong>
      ${quote.revisionNo > 0 ? `<div style="font-size:12px;color:#b0483b">ฉบับแก้ไข R${quote.revisionNo}</div>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr>
      <th style="width:36px">ลำดับ</th><th>รายการ</th><th style="width:70px">จำนวน</th>
      <th style="width:90px">ราคา/หน่วย</th>${hasLineDiscount ? '<th style="width:80px">ส่วนลด</th>' : ''}<th style="width:100px">จำนวนเงิน</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div style="flex:1">
      <div class="notes"><div class="lbl">หมายเหตุ / REMARKS</div>${esc(quote.notes || '-')}</div>
      <div class="terms"><div class="lbl">เงื่อนไขการชำระเงิน / PAYMENT TERMS</div>${esc(quote.paymentTerms || '-')}</div>
    </div>
    <table class="totals"><tbody>${totals}</tbody></table>
  </div>
  <div class="signs">
    <div class="sign"><div class="line"></div><div class="who">ผู้เสนอราคา<br>${esc(quote.createdByName || '')}</div></div>
    <div class="sign"><div class="line"></div><div class="who">ผู้อนุมัติ (Scent &amp; Sense)</div></div>
    <div class="sign"><div class="line"></div><div class="who">ผู้ยืนยันสั่งซื้อ (ลูกค้า)<br>วันที่ ____/____/______</div></div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
  </body></html>`;

  const win = window.open('', '_blank', 'noopener,width=900,height=1100');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

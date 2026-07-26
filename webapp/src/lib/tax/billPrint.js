import { notifyToast } from "@/lib/feedback";
import { SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';
import { resolveCompanyBlock, getCompanyProfileForPrint } from '@/lib/companyProfile';
import { productIdentity } from '@/lib/master/productIdentity';
import {
  getDocumentStandardsForPrint,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';

// Print-ready A4 (portrait) excise-tax BILLING document for a customer, built
// from a filing order (+ the customer record). Bills the EXCISE TAX ONLY
// (สรรพสามิต + ท้องถิ่น) that we paid on the customer's behalf — not the product
// price — plus VAT 7% on the billed tax. Visual format mirrors the Project
// Timeline document (lib/pm/ganttPrint.js): same fonts, colours, logo, layout.

const LOGO_URL = SYSTEM_DOCUMENT_LOGO_URL;
const VAT_RATE = 0.07;
const NOTICE_KEY = 'exciseTaxNotice';
const NOTICE_ACCENTS = Object.freeze({
  terracotta: { accent: '#ad5d43', soft: '#f5ebe7' },
  steel: { accent: '#1e6091', soft: '#e6eef4' },
  amber: { accent: '#b45309', soft: '#fdf1e3' },
});

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v) => (Number(v) || 0).toLocaleString("th-TH");
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`; // DD/MM/YYYY (ค.ศ.)
};

// หน้าที่ไม่มีบล็อกยอดรวมวางได้ 12 แถว · หน้าสุดท้ายต้องเหลือที่ให้ยอดรวม + ลายเซ็น
// จึงรับได้ 8 แถว
const BILL_LINES_PER_PAGE = 12;
const BILL_LINES_LAST_PAGE = 8;

// เดิม `take = min(12, remaining - 8)` กันที่หน้าสุดท้ายไว้ก่อน → เศษไปกองที่หน้าแรก/หน้ากลาง
// (9 แถวได้ [1, 8] · 21 แถวได้ [12, 1, 8] = หน้ากลางมีบรรทัดเดียว). ตอนนี้เติมหน้าจากหน้าแรก
// ไปเรื่อย ๆ แล้วให้เศษตกที่หน้าสุดท้าย — `remaining.length - 1` กันไม่ให้ตัดจนหน้าสุดท้าย
// ว่างเปล่า (ยอดรวมลอยอยู่หน้าเดียว). ผลลัพธ์: หน้าที่ไม่ใช่หน้าสุดท้าย 8–12 แถวเสมอ
// หน้าสุดท้าย 1–8 แถว (เอกสารที่มี ≤ 8 แถวยังจบในหน้าเดียวเหมือนเดิม)
export function paginateBillLines(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];
  const remaining = lines.slice();
  if (remaining.length <= BILL_LINES_LAST_PAGE) return [remaining];
  const pages = [];
  while (remaining.length > BILL_LINES_LAST_PAGE) {
    const take = Math.min(BILL_LINES_PER_PAGE, remaining.length - 1);
    pages.push(remaining.splice(0, take));
  }
  pages.push(remaining);
  return pages;
}

export function buildBillPrintHTML(order, customer = {}, company, activeStandard = null) {
  const co = resolveCompanyBlock(company);
  const standard = order.taxNoticeStandardSnapshot || activeStandard;
  const form = resolveDocumentForm(standard, NOTICE_KEY);
  const titleTh = resolveDocumentTitleTh(standard, NOTICE_KEY);
  const titleEn = String(standard?.titleEn || form.title || 'EXCISE TAX PAYMENT NOTICE').trim();
  const noticeNumber = order.taxNoticeNumber || order.id || '-';
  const theme = NOTICE_ACCENTS[standard?.accentKey] || NOTICE_ACCENTS.amber;
  const items = order.items || [];
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;   // round to 2 decimals
  // Tax-only: per line we bill the snapshot excise + local tax (already computed
  // from the VAT-excluded retail price at registration). The per-unit tax is
  // ROUNDED first, then multiplied by qty, so the printed document reconciles by
  // hand (ภาษี/ชิ้น × จำนวน = รวมภาษี exactly). VAT 7% added on the total.
  const lines = items.map((it, i) => {
    const p = it.product || {};
    const qty = Number(it.quantity) || 0;
    const incVat = p.retailPriceIncVat != null ? Number(p.retailPriceIncVat) : 0;
    const exVat = p.retailPriceExVat != null ? Number(p.retailPriceExVat) : (incVat ? incVat / (1 + VAT_RATE) : 0);
    const rawPerUnit = qty ? (Number(it.totalTax) || 0) / qty : 0;   // ภาษี/ชิ้น (สรรพสามิต + ท้องถิ่น)
    const perUnit = r2(rawPerUnit);
    const identity = productIdentity({
      ...(it.registration || {}),
      ...p,
      metadata: { ...(it.registration?.metadata || {}), ...(p.metadata || {}) },
    });
    return {
      i: i + 1,
      fgCode: identity.code || "-",
      brand: identity.brand,
      name: identity.detail || "-",
      qty, incVat, exVat, perUnit,
      tax: r2(perUnit * qty),         // line total from the rounded per-unit
    };
  });
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const totalTax = sum("tax");        // excise + local being billed (ก่อน VAT)
  const vat = r2(totalTax * VAT_RATE);
  const grand = r2(totalTax + vat);   // net total billed to the customer (incl VAT)

  const rowsForLines = (pageLines) => pageLines.map((l) => `<tr>
    <td class="c-no">${l.i}</td>
    <td class="c-desc">
      <div class="fg-code">${esc([l.fgCode, l.brand].filter(Boolean).join(" · "))}</div>
      <div class="p-name">${esc(l.name)}</div>
      <div class="c-sub">ราคาขาย/หน่วย: ${fmtMoney(l.incVat)} (รวม VAT) · ${fmtMoney(l.exVat)} (ถอด VAT)</div>
    </td>
    <td class="c-money">${fmtMoney(l.perUnit)}</td>
    <td class="c-num">${fmtInt(l.qty)}</td>
    <td class="c-money">${fmtMoney(l.tax)}</td>
  </tr>`).join("") || `<tr><td class="c-desc" colspan="5" style="text-align:center;color:#837868">ไม่มีรายการ</td></tr>`;

  // ค่าที่ตรึงไว้บนใบมาก่อนทะเบียนลูกค้าสดเสมอ (mig 0167): ทะเบียนที่ผู้กดพิมพ์ "มองเห็น"
  // ขึ้นกับทีมที่ดูแล/สถานะอนุมัติ — ถ้าให้ค่าสดชนะ เอกสารใบเดียวกันจะพิมพ์ออกมาไม่เหมือนกัน
  const taxId = order.customerTaxId || customer.taxId || "-";
  const address = order.customerAddress || customer.address || "-";
  const pages = paginateBillLines(lines);
  const documentPages = pages.map((pageLines, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === pages.length - 1;
    return `
  <main class="sheet explicit-page">
    <div class="doc-top">
      <div class="brand">
        <div class="logo-wrap"><img class="logo-img" src="${LOGO_URL}" alt="S&amp;S"/></div>
        <div>
          <h2>${esc(co.legalNameTh)}</h2>
          <div class="company-info">
            <div>${esc(co.address)}</div>
            <div>เลขประจำตัวผู้เสียภาษี ${esc(co.taxId)}</div>
            <div>โทร ${esc(co.phone)} · Line ${esc(co.line)} · ${esc(co.website)}</div>
          </div>
        </div>
      </div>
      <div class="doc-title">
        <div class="formno">${esc(form.code)}: Rev. No.${esc(form.revision)}. ${esc(form.effectiveDate)}</div>
        <div class="big">${esc(titleEn)}</div>
        <div class="title-th">${esc(titleTh)}</div>
        <div class="sub">${esc(noticeNumber)}</div>
      </div>
    </div>

    ${isFirstPage ? `<div class="header-grid">
      <div class="hcol left">
        <div class="hrow"><span class="k">ชื่อลูกค้า</span><span class="v">${esc(customer.name || order.customerName || "-")}</span></div>
        <div class="hrow"><span class="k">เลขประจำตัวผู้เสียภาษี</span><span class="v">${esc(taxId)}</span></div>
        <div class="hrow"><span class="k">ที่อยู่</span><span class="v">${esc(address)}</span></div>
      </div>
      <div class="hcol">
        <div class="hrow"><span class="k">เลขที่ใบเสนอราคา</span><span class="v">${esc(order.quotationRef || "-")}</span></div>
        <div class="hrow"><span class="k">เลขที่ใบสั่งซื้อ (PO)</span><span class="v">${esc(order.poReference || "-")}</span></div>
        <div class="hrow"><span class="k">วันที่เอกสาร</span><span class="v">${fmtDate(order.createdAt)}</span></div>
        <div class="hrow"><span class="k">กำหนดส่งมอบ</span><span class="v">${order.deliveryDate && order.deliveryDate !== "-" ? fmtDate(order.deliveryDate) : "-"}</span></div>
      </div>
    </div>` : ""}

    <table>
      <colgroup><col style="width:26px"/><col/><col style="width:78px"/><col style="width:66px"/><col style="width:104px"/></colgroup>
      <thead><tr><th>no.</th><th>รายการสินค้า</th><th>ภาษี/หน่วย</th><th>จำนวน</th><th>รวมภาษี</th></tr></thead>
      <tbody>${rowsForLines(pageLines)}</tbody>
      ${isLastPage ? `<tfoot><tr><td class="c-desc" colspan="4" style="text-align:right">รวม</td><td class="c-money">${fmtMoney(totalTax)}</td></tr></tfoot>` : ""}
    </table>

    ${isLastPage ? `<div class="page-tail">
      <div class="totals">
        <div class="row"><span>รวมค่าภาษี (ก่อน VAT)</span><span>${fmtMoney(totalTax)}</span></div>
        <div class="row"><span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span>${fmtMoney(vat)}</span></div>
        <div class="row grand"><span>ยอดแจ้งชำระสุทธิ (รวม VAT)</span><span>${fmtMoney(grand)}</span></div>
      </div>
      <div class="signs">
        <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้จัดทำ</div><div class="date">วันที่ ........./........./.........</div></div>
        <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้รับเอกสาร / ลูกค้า</div><div class="date">วันที่ ........./........./.........</div></div>
      </div>
      <div class="note-line">หมายเหตุ: เอกสารนี้เรียกเก็บเฉพาะค่าภาษีสรรพสามิตและภาษีบำรุงท้องถิ่น ไม่รวมราคาสินค้า</div>
    </div>` : ""}
    <div class="page-number">หน้า ${pageIndex + 1} / ${pages.length}</div>
  </main>`;
  }).join("");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>${esc(titleTh)} ${esc(noticeNumber)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --notice-accent: ${theme.accent}; --notice-soft: ${theme.soft}; }
  body { background: #eef0f3; color: #21385e; font-family: ${PRINT_FONT_STACK}; font-size: 12px; }
  .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 12px 0; display: flex; align-items: center; justify-content: space-between; }
  .toolbar h1 { font-size: 15px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: none; font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 7px; cursor: pointer; }
  .sheet { width: 210mm; height: 297mm; overflow: hidden; margin: 16px auto; background: #fff; padding: 12mm; box-shadow: 0 4px 24px rgba(0,0,0,.12); position: relative; }
  .explicit-page:not(:last-child) { break-after: page; page-break-after: always; }
  .page-tail { display: flex; flex-direction: column; }
  .page-number { position: absolute; right: 12mm; bottom: 7mm; color: #837868; font-size: 9px; }

  .doc-top { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid var(--notice-accent); padding-bottom: 8px; margin-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo-wrap { height: 46px; flex-shrink: 0; display: flex; align-items: center; }
  .logo-img { height: 46px; width: auto; max-width: 300px; display: block; }
  .brand h2 { font-size: 14px; font-weight: 700; line-height: 1.25; }
  .company-info { font-size: 8.5px; color: #837868; line-height: 1.4; margin-top: 2px; }
  .doc-title .formno { font-size: 10px; font-weight: 700; color: #837868; letter-spacing: 1px; text-align: right; }
  .doc-title .big { font-size: 14px; font-weight: 800; color: var(--notice-accent); letter-spacing: 1px; text-align: right; white-space: nowrap; }
  .doc-title .title-th { font-size: 11px; font-weight: 700; color: #21385e; text-align: right; }
  .doc-title .sub { font-size: 9.5px; color: #837868; text-align: right; }

  .header-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #dcd8d0; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
  .hcol { padding: 8px 10px; }
  .hcol.left { border-right: 1px solid #dcd8d0; background: #f7f3ec; }
  .hrow { display: flex; gap: 8px; font-size: 10px; padding: 2px 0; }
  .hrow .k { color: #837868; min-width: 90px; flex-shrink: 0; }
  .hrow .v { font-weight: 600; color: #21385e; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cfc9bf; padding: 5px 7px; word-break: break-word; }
  thead th { background: var(--notice-soft); color: #21385e; font-size: 9.5px; font-weight: 700; text-align: center; line-height: 1.2; }
  .c-no { text-align: center; font-size: 9.5px; width: 18px; }
  .c-desc { text-align: left; font-size: 10.5px; }
  .c-desc .fg-code { font-weight: 700; font-size: 10px; color: var(--notice-accent); letter-spacing: .3px; }
  .c-desc .p-name { font-weight: 600; color: #21385e; margin-top: 1px; }
  .c-desc .c-sub { font-size: 8.5px; color: #837868; margin-top: 2px; font-weight: 400; }
  .c-num { text-align: right; font-size: 10px; width: 48px; }
  .c-money { text-align: right; font-size: 10px; white-space: nowrap; width: 78px; }
  tfoot td { background: #f0ebe0; font-weight: 700; }

  .totals { margin-top: 14px; margin-left: auto; width: 56%; font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 2px; border-bottom: 1px solid #e6ddcf; }
  .totals .grand { font-weight: 800; font-size: 14px; color: var(--notice-accent); border-bottom: none; border-top: 2px solid var(--notice-accent); padding-top: 8px; margin-top: 4px; }
  .note-line { margin-top: 10px; font-size: 9.5px; color: #837868; }

  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding: 0 20px; }
  .sign { text-align: center; }
  .sign .sig-space { height: 40px; }
  .sign .line { border-top: 1px dotted #6b7a90; margin: 0 6px 4px; }
  .sign .lbl { font-size: 11px; font-weight: 700; color: #21385e; }
  .sign .date { font-size: 10px; color: #837868; margin-top: 6px; }

  .foot { margin-top: 16px; font-size: 9px; color: #837868; text-align: right; }

  @page { size: A4 portrait; margin: 10mm; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: 190mm; height: 277mm; padding: 0; }
    .page-number { right: 0; bottom: 0; }
    thead { display: table-header-group; }
  }
  @media screen and (max-width: 560px) {
    .sheet { width: 100%; padding: 6mm; }
    .doc-top { flex-direction: column; gap: 8px; }
    .doc-title .big, .doc-title .sub, .doc-title .formno { text-align: left; }
    .header-grid { grid-template-columns: 1fr; }
    .hcol.left { border-right: none; border-bottom: 1px solid #dcd8d0; }
    .totals { width: 100%; }
  }
</style></head><body>
  <div class="toolbar no-print">
    <h1>${esc(titleTh)} — ${esc(noticeNumber)}</h1>
    <button class="btn-print" onclick="window.print()">🖨 สั่งพิมพ์ / บันทึก PDF</button>
  </div>

  ${documentPages}
</body></html>`;
}

export async function openBillPrintWindow(order, customer = {}) {
  // เปิดหน้าต่างก่อน (ยังไม่ await) เพื่อไม่ให้ popup blocker บล็อก แล้วค่อยดึงข้อมูล
  // บริษัทที่เผยแพร่มาประกอบเอกสาร
  const w = window.open("", "_blank");
  if (!w) { notifyToast.error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้"); return; }
  w.document.open();
  w.document.write(printPlaceholderHtml({ title: "ใบแจ้งชำระภาษี", message: "กำลังเตรียมเอกสาร…" }));
  w.document.close();
  const [company, standards] = await Promise.all([
    getCompanyProfileForPrint(),
    getDocumentStandardsForPrint(),
  ]);
  const html = buildBillPrintHTML(order, customer, company, standards[NOTICE_KEY]);
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
import { PRINT_FONT_STACK, printPlaceholderHtml } from "@/lib/printTheme";

// Print-ready A4 (portrait) excise-tax BILLING document for a customer, built
// from a filing order (+ the customer record). Bills the EXCISE TAX ONLY
// (สรรพสามิต + ท้องถิ่น) that we paid on the customer's behalf — not the product
// price — plus VAT 7% on the billed tax. Visual format mirrors the Project
// Timeline document (lib/pm/ganttPrint.js): same fonts, colours, logo, layout.

const COMPANY = "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด";
const COMPANY_TEL = "02-000-7722, 092-646-8682";
const COMPANY_LINE = "@perfumefactory";
const LOGO_URL =
  "https://static.wixstatic.com/media/279c93_8f08407580cc4842ad6fae8b398eec3e~mv2.png/v1/fill/w_166,h_166,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/marque.png";
const VAT_RATE = 0.07;

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v) => (Number(v) || 0).toLocaleString("th-TH");
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};

export function buildBillPrintHTML(order, customer = {}) {
  const items = order.items || [];
  // Tax-only: per line we bill the snapshot excise + local tax (already computed
  // from the VAT-excluded retail price at registration). VAT 7% added on total.
  const lines = items.map((it, i) => {
    const p = it.product || {};
    return {
      i: i + 1,
      fgCode: p.fgCode || it.registration?.fgCode || "-",
      name: p.productDescription || it.registration?.productName || "-",
      qty: Number(it.quantity) || 0,
      excise: Number(it.totalExciseTax) || 0,
      local: Number(it.totalLocalTax) || 0,
      tax: Number(it.totalTax) || 0,
    };
  });
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const totalExcise = sum("excise");
  const totalLocal = sum("local");
  const totalTax = sum("tax");        // excise + local being billed (ก่อน VAT)
  const vat = totalTax * VAT_RATE;
  const grand = totalTax + vat;       // net total billed to the customer (incl VAT)

  const rows = lines.map((l) => `<tr>
    <td class="c-no">${l.i}</td>
    <td class="c-fg">${esc(l.fgCode)}</td>
    <td class="c-desc">${esc(l.name)}</td>
    <td class="c-num">${fmtInt(l.qty)}</td>
    <td class="c-money">${fmtMoney(l.excise)}</td>
    <td class="c-money">${fmtMoney(l.local)}</td>
    <td class="c-money">${fmtMoney(l.tax)}</td>
  </tr>`).join("") || `<tr><td class="c-desc" colspan="7" style="text-align:center;color:#837868">ไม่มีรายการ</td></tr>`;

  const taxId = customer.taxId || order.customerTaxId || "-";
  const address = customer.address || "-";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>ใบวางบิลค่าภาษีสรรพสามิต ${esc(order.quotationRef || order.id || "")}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #eef0f3; color: #21385e; font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif; font-size: 12px; }
  .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 12px 0; display: flex; align-items: center; justify-content: space-between; }
  .toolbar h1 { font-size: 15px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: none; font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 7px; cursor: pointer; }
  .sheet { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; padding: 14mm; box-shadow: 0 4px 24px rgba(0,0,0,.12); }

  .doc-top { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #c17a52; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo-wrap { width: 40px; height: 40px; background: #21385e; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .logo-img { width: 100%; height: 100%; object-fit: contain; }
  .brand h2 { font-size: 14px; font-weight: 700; line-height: 1.25; }
  .brand .doc-name { font-size: 10px; color: #837868; margin-top: 2px; }
  .doc-title .formno { font-size: 10px; font-weight: 700; color: #837868; letter-spacing: 1px; text-align: right; }
  .doc-title .big { font-size: 17px; font-weight: 800; color: #c17a52; letter-spacing: 2px; text-align: right; white-space: nowrap; }
  .doc-title .sub { font-size: 9.5px; color: #837868; text-align: right; }

  .header-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #dcd8d0; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
  .hcol { padding: 8px 10px; }
  .hcol.left { border-right: 1px solid #dcd8d0; background: #f7f3ec; }
  .hrow { display: flex; gap: 8px; font-size: 10px; padding: 2px 0; }
  .hrow .k { color: #837868; min-width: 90px; flex-shrink: 0; }
  .hrow .v { font-weight: 600; color: #21385e; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cfc9bf; padding: 5px 8px; }
  thead th { background: #e8e2d9; color: #21385e; font-size: 10px; font-weight: 700; text-align: center; }
  .c-no { text-align: center; font-size: 10px; width: 28px; }
  .c-fg { font-size: 10px; white-space: nowrap; }
  .c-desc { text-align: left; font-size: 11px; }
  .c-num { text-align: right; font-size: 10.5px; }
  .c-money { text-align: right; font-size: 10.5px; white-space: nowrap; }
  tfoot td { background: #f0ebe0; font-weight: 700; }

  .totals { margin-top: 14px; margin-left: auto; width: 56%; font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 2px; border-bottom: 1px solid #e6ddcf; }
  .totals .grand { font-weight: 800; font-size: 14px; color: #c17a52; border-bottom: none; border-top: 2px solid #c17a52; padding-top: 8px; margin-top: 4px; }
  .note-line { margin-top: 10px; font-size: 9.5px; color: #837868; }

  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding: 0 20px; }
  .sign { text-align: center; }
  .sign .sig-space { height: 40px; }
  .sign .line { border-top: 1px dotted #6b7a90; margin: 0 6px 4px; }
  .sign .lbl { font-size: 11px; font-weight: 700; color: #21385e; }
  .sign .date { font-size: 10px; color: #837868; margin-top: 6px; }

  .foot { margin-top: 16px; font-size: 9px; color: #837868; text-align: right; }

  @page { size: A4 portrait; margin: 12mm; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: 100%; min-height: auto; padding: 0; }
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
    <h1>ใบวางบิลค่าภาษีสรรพสามิต — ${esc(order.quotationRef || order.id || "")}</h1>
    <button class="btn-print" onclick="window.print()">🖨 สั่งพิมพ์ / บันทึก PDF</button>
  </div>

  <div class="sheet">
    <div class="doc-top">
      <div class="brand">
        <div class="logo-wrap"><img class="logo-img" src="${LOGO_URL}" alt="S&amp;S"/></div>
        <div>
          <h2>${esc(COMPANY)}</h2>
          <div class="doc-name">ใบวางบิลค่าภาษีสรรพสามิต · Excise Tax Billing</div>
        </div>
      </div>
      <div class="doc-title">
        <div class="formno">เลขที่อ้างอิง</div>
        <div class="big">EXCISE TAX</div>
        <div class="sub">${esc(order.quotationRef || order.id || "-")}</div>
      </div>
    </div>

    <div class="header-grid">
      <div class="hcol left">
        <div class="hrow"><span class="k">ลูกค้า</span><span class="v">${esc(customer.name || order.customerName || "-")}</span></div>
        <div class="hrow"><span class="k">เลขผู้เสียภาษี</span><span class="v">${esc(taxId)}</span></div>
        <div class="hrow"><span class="k">ที่อยู่</span><span class="v">${esc(address)}</span></div>
        <div class="hrow"><span class="k">เบอร์ติดต่อ</span><span class="v">${COMPANY_TEL}</span></div>
        <div class="hrow"><span class="k">Line Official</span><span class="v">${COMPANY_LINE}</span></div>
      </div>
      <div class="hcol">
        <div class="hrow"><span class="k">ใบเสนอราคา</span><span class="v">${esc(order.quotationRef || "-")}</span></div>
        <div class="hrow"><span class="k">เลขที่ PO</span><span class="v">${esc(order.poReference || "-")}</span></div>
        <div class="hrow"><span class="k">วันที่</span><span class="v">${fmtDate(order.createdAt)}</span></div>
        <div class="hrow"><span class="k">กำหนดส่ง</span><span class="v">${order.deliveryDate && order.deliveryDate !== "-" ? fmtDate(order.deliveryDate) : "-"}</span></div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>#</th>
        <th>รหัส FG</th>
        <th>รายการสินค้า</th>
        <th>จำนวน</th>
        <th>ภาษีสรรพสามิต</th>
        <th>ภาษีท้องถิ่น</th>
        <th>รวมภาษี</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td class="c-desc" colspan="4" style="text-align:right">รวม</td>
        <td class="c-money">${fmtMoney(totalExcise)}</td>
        <td class="c-money">${fmtMoney(totalLocal)}</td>
        <td class="c-money">${fmtMoney(totalTax)}</td>
      </tr></tfoot>
    </table>

    <div class="totals">
      <div class="row"><span>ภาษีสรรพสามิตรวม</span><span>${fmtMoney(totalExcise)}</span></div>
      <div class="row"><span>ภาษีบำรุงท้องถิ่นรวม</span><span>${fmtMoney(totalLocal)}</span></div>
      <div class="row"><span>รวมค่าภาษี (ก่อน VAT)</span><span>${fmtMoney(totalTax)}</span></div>
      <div class="row"><span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span>${fmtMoney(vat)}</span></div>
      <div class="row grand"><span>ยอดวางบิลสุทธิ (รวม VAT)</span><span>${fmtMoney(grand)}</span></div>
    </div>

    <div class="note-line">หมายเหตุ: เอกสารนี้เรียกเก็บเฉพาะค่าภาษีสรรพสามิตและภาษีบำรุงท้องถิ่นที่บริษัทสำรองจ่ายแทน ไม่รวมราคาสินค้า</div>

    <div class="signs">
      <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้จัดทำ</div><div class="date">วันที่ ........./........./.........</div></div>
      <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้รับเอกสาร / ลูกค้า</div><div class="date">วันที่ ........./........./.........</div></div>
    </div>

    <div class="foot">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")} · ${esc(COMPANY)}</div>
  </div>
</body></html>`;
}

export function openBillPrintWindow(order, customer = {}) {
  const html = buildBillPrintHTML(order, customer);
  const w = window.open("", "_blank");
  if (!w) { alert("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้"); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

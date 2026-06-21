// Print-ready A4 (portrait) excise-tax billing document for a customer, built
// from a filing order (+ the customer record for address/taxId). Mirrors
// lib/tax/reportPrint.js: build an HTML string and open it for print → PDF.
// Shows BOTH the product value (sale price × qty) and the excise/local tax.

const COMPANY = "Scent & Sense";
const LOGO_URL =
  "https://static.wixstatic.com/media/279c93_8f08407580cc4842ad6fae8b398eec3e~mv2.png/v1/fill/w_166,h_166,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/marque.png";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};
const fmtInt = (v) => (Number(v) || 0).toLocaleString("th-TH");

export function buildBillPrintHTML(order, customer = {}) {
  const items = order.items || [];
  // Per line: unit sale price (snapshot salePrice → master retail price), value,
  // and the snapshotted excise/local tax already stored on the order item.
  const lines = items.map((it, i) => {
    const p = it.product || {};
    const unit = it.salePrice != null ? Number(it.salePrice) : (p.retailPriceIncVat || 0);
    const qty = Number(it.quantity) || 0;
    const value = unit * qty;
    return {
      i: i + 1,
      fgCode: p.fgCode || it.registration?.fgCode || "-",
      name: p.productDescription || it.registration?.productName || "-",
      qty, unit, value,
      excise: Number(it.totalExciseTax) || 0,
      local: Number(it.totalLocalTax) || 0,
      tax: Number(it.totalTax) || 0,
    };
  });
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const totalValue = sum("value");
  const totalExcise = sum("excise");
  const totalLocal = sum("local");
  const totalTax = sum("tax");
  const grand = totalValue + totalTax;

  const rows = lines.map((l) => `<tr>
    <td style="text-align:center">${l.i}</td>
    <td class="mono">${esc(l.fgCode)}</td>
    <td>${esc(l.name)}</td>
    <td style="text-align:right">${fmtInt(l.qty)}</td>
    <td style="text-align:right">${fmtMoney(l.unit)}</td>
    <td style="text-align:right">${fmtMoney(l.value)}</td>
    <td style="text-align:right">${fmtMoney(l.excise)}</td>
    <td style="text-align:right">${fmtMoney(l.local)}</td>
    <td style="text-align:right">${fmtMoney(l.tax)}</td>
  </tr>`).join("");

  const taxId = customer.taxId || order.customerTaxId || "-";
  const address = customer.address || "-";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>ใบแจ้งภาษีสรรพสามิต ${esc(order.quotationRef || order.id || "")}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans Thai","Sarabun",sans-serif; color: #1a1e27; margin: 0; font-size: 12px; }
  header { display:flex; align-items:center; gap:12px; border-bottom:2px solid #c17a52; padding-bottom:10px; margin-bottom:14px; }
  header img { width:46px; height:46px; object-fit:contain; }
  .co { font-weight:700; font-size:15px; }
  h1 { font-size:18px; margin:2px 0 0; }
  .docmeta { text-align:right; margin-left:auto; font-size:11px; color:#5d6470; }
  .docmeta b { color:#1a1e27; font-size:13px; }
  .parties { display:flex; gap:24px; margin-bottom:14px; }
  .box { flex:1; border:1px solid #e6ddcf; border-radius:6px; padding:10px 12px; }
  .box .lbl { font-size:10px; color:#8a93a3; text-transform:uppercase; letter-spacing:.04em; }
  .box .v { font-size:12px; margin-top:2px; }
  .name { font-weight:700; font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#c17a52; color:#fff; padding:7px 8px; text-align:left; }
  td { padding:6px 8px; border-bottom:1px solid #e6ddcf; }
  .mono { font-family:"IBM Plex Mono",monospace; }
  tfoot td { font-weight:700; background:#f6efe3; border-top:2px solid #c17a52; }
  .totals { margin-top:14px; margin-left:auto; width:48%; font-size:12px; }
  .totals .row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #e6ddcf; }
  .totals .grand { font-weight:700; font-size:14px; color:#b3402f; border-bottom:none; border-top:2px solid #c17a52; padding-top:8px; margin-top:4px; }
  .sign { display:flex; gap:40px; margin-top:48px; }
  .sign div { flex:1; text-align:center; font-size:11px; color:#5d6470; }
  .sign .line { border-top:1px solid #1a1e27; margin:0 10px 6px; padding-top:6px; }
  .gen { margin-top:18px; font-size:10px; color:#8a93a3; text-align:right; }
</style></head><body>
  <header>
    <img src="${LOGO_URL}" alt="${esc(COMPANY)}"/>
    <div>
      <div class="co">${esc(COMPANY)}</div>
      <h1>ใบแจ้งภาษีสรรพสามิต</h1>
    </div>
    <div class="docmeta">
      เลขที่อ้างอิง: <b>${esc(order.quotationRef || order.id || "-")}</b><br/>
      วันที่: ${fmtDate(order.createdAt)}
    </div>
  </header>

  <div class="parties">
    <div class="box">
      <div class="lbl">ลูกค้า (ผู้รับใบแจ้ง)</div>
      <div class="v name">${esc(customer.name || order.customerName || "-")}</div>
      <div class="v">เลขผู้เสียภาษี: ${esc(taxId)}</div>
      <div class="v">${esc(address)}</div>
    </div>
    <div class="box">
      <div class="lbl">อ้างอิงเอกสาร</div>
      <div class="v">ใบเสนอราคา: ${esc(order.quotationRef || "-")}</div>
      <div class="v">PO ลูกค้า: ${esc(order.poReference || "-")}</div>
      <div class="v">กำหนดส่ง: ${order.deliveryDate && order.deliveryDate !== "-" ? fmtDate(order.deliveryDate) : "-"}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="text-align:center">#</th>
      <th>รหัส FG</th>
      <th>รายการสินค้า</th>
      <th style="text-align:right">จำนวน</th>
      <th style="text-align:right">ราคาขาย/หน่วย</th>
      <th style="text-align:right">มูลค่าสินค้า</th>
      <th style="text-align:right">ภาษีสรรพสามิต</th>
      <th style="text-align:right">ภาษีท้องถิ่น</th>
      <th style="text-align:right">รวมภาษี</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="9" style="text-align:center;color:#8a93a3">ไม่มีรายการ</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="5" style="text-align:right">รวม</td>
      <td style="text-align:right">${fmtMoney(totalValue)}</td>
      <td style="text-align:right">${fmtMoney(totalExcise)}</td>
      <td style="text-align:right">${fmtMoney(totalLocal)}</td>
      <td style="text-align:right">${fmtMoney(totalTax)}</td>
    </tr></tfoot>
  </table>

  <div class="totals">
    <div class="row"><span>มูลค่าสินค้ารวม</span><span class="mono">${fmtMoney(totalValue)}</span></div>
    <div class="row"><span>ภาษีสรรพสามิตรวม</span><span class="mono">${fmtMoney(totalExcise)}</span></div>
    <div class="row"><span>ภาษีบำรุงท้องถิ่นรวม</span><span class="mono">${fmtMoney(totalLocal)}</span></div>
    <div class="row"><span>รวมภาษีทั้งสิ้น</span><span class="mono">${fmtMoney(totalTax)}</span></div>
    <div class="row grand"><span>ยอดรวมสุทธิ (มูลค่า + ภาษี)</span><span class="mono">${fmtMoney(grand)}</span></div>
  </div>

  <div class="sign">
    <div><div class="line">ผู้จัดทำ</div></div>
    <div><div class="line">ผู้รับเอกสาร / ลูกค้า</div></div>
  </div>

  <div class="gen">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")} · ${esc(COMPANY)} — ระบบภาษีสรรพสามิต</div>
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
  setTimeout(() => w.print(), 400);
}

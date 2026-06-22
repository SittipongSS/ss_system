// Print-ready A4 (portrait) excise-tax BILLING document for a customer, built
// from a filing order (+ the customer record). Bills the EXCISE TAX ONLY
// (สรรพสามิต + ท้องถิ่น) that we paid on the customer's behalf — not the product
// price — plus VAT 7% on the billed tax. Visual format mirrors the Project
// Timeline document (lib/pm/ganttPrint.js): same fonts, colours, logo, layout.

const COMPANY = "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด";
// Brand logo embedded as a data URI (from public/brand-logo.png) so it always
// renders inside the about:blank print window — an external/public URL does not.
const LOGO_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAw1BMVEUYH0v///8VIUsXI0waIUwAAD8AAD0AADoVHUvo6eylqbMUH0wAADn7+/wAAECPlKMACT8QGUk+Q2MAD0Ly8/R/g5QmLFextcDU1t0AADYACUIOF0cAADMKFEbLzNMADUTBw8vd3uJ5e5Canaq7vcdrcIZTWHIAFESEiJhcYHgAAEM2PF1GSmirrbhMUW0gKE8AACwqMlcAACZhZ34xOFwjLVFaXXhLTm9GTGWYmqvc3OQ0O2FnbYVSVXEWGk49P2B1do7gSuhrAAARAklEQVR4nO1cC3uayhZF4wyD8giCUUFAxGd8HY8mJz03ve3//1V39p5BME1yUjH10Mv6vraJATpr9p79Jorye6N+c+0VfDYqhuVHxbD8qBiWHxXD8qNiWH5UDMuPimH5UTEsPyqG5UfFsPyoGJYfFcPyo2JYflQMy4+KYflRMSw/KoblR8Ww/KgYlh8Vw/KjYlh+VAzLj4ph+VExLD8qhuVHxbD8qBheDsx3PEJVlcBfKvGigP2S//fXMGQe1e+mI6s5DmNAb7hOOvv/EN38fJqfz5BFdLCxhppRewnDDZvPpk7sT2X5yQxZZB7m4Q/c8uglqxn1P28Jn8mw4ZPdvPcuPYE4WdHos1bxiQwjfTp08zzCIf97Pp0uFvvRvDmM8z/sjaj3Ocr6aQwd9Tk+rt8dWn81In3Fv9ybQeDPnIhQzz58X+eusSKz9QkL+SSGwf1eS+1JnLT7xPOZYq+4tRk5x4sYc/p74HbkqHiXX8qnMGyp0+z4bbixFB+zHecyPzlwdFyraQ+j1BZpHRJcejGfwTByunLFf/M/d9nxirhcmyR3JbvhnMdqRNpN6Ux6K/XCx/HyDBmdSLUbLhenDFUu2Z6aO2xRh18w4XprEyeRdzW9y7qOizMM6mOx0vBJ9Ub830bGiCT8sD3kZHTPDY1mwldMufcTIUdtRX54agFcmqG5ERZGm/R9IaIoYxQ8gzHNTlo04d9bKR+mLsXmGPNLauplGTK9IwSYBGAyPS4zQwcBsQh4MYdLqZtJSOeKaZhMaXm6GjVAVxdif8apcboALsqQqWvh29sEhUD4t9qAfxGt5nubL1rlQjL8VEB4tWU2WJTEcQeJOwNhpOI7563/5GdxSYb2bIjLWztCERkdgmXhsvwCVvKGKQGYnrl0eh7obOww5M2pCjeiCjvlrm4vtKoLMrQD4QRHNLUtlH8wptzTCyN5z7WYa6FG8YfBEqg8BkprJ06ulBrZYZzjTi/k/S/HkHl/48qezONHBPyfqTjicPaIdA9oW3wGRy7hEmZiA9yW1F7fQ1UwHi8jxYsxZAFuffyQi8pmNYxhgkfhHgl8xK8ylr7i7IDgUIfrCJqXIT3epzfxhsVFKF6KIXNE5JXQ7DPUzg333xH8zHgCT64m4CqJik6l56DYginX13iXmU+/LaQ6BQNbFJdiqKZ+nkulXme48mjOP4AvGUvC8QqESyZ4VXcEzj3eyuw+2D5OgzR45X+ckXiYu7uA07gQQ7UpI1GIUNiWOwBCAto9RiyEEJCgOall6AXH8IwFPmOBR3ncva0ryi34UXzafXHXfxmGBDc9tvjCvjGFxoYWh8mkEYNC5i9Dgl0RgHZpbvWtGW0srGFPc42NreghFDdQJWhhihdhGLRhx92HKf97EihUChSYWDmb7zzCZclgCv8MB7m18zxxLANvjd8AZnb9x/jluT4Pl2DYctCMTj3HxaAsmGaquFaj1DvaD0CiSRUPKX4/rt3XJ3F2g6n4cP8o8vDDRdHg5hIMKcZqc6Ko3JFpAVOIlXR7UibuyBTCaqmw4nWff+nhFrRlCG4+yXTZiMfNpG1jCmLsWjYkzJmbPBcXYIihGA+WpQ2cgnsgRHceExlG22gRCfqJPt5CwfHHwlfQudiJ7mTbp6YHUTrfih63yR4e27FabHkXYEiBiIZe4R4siFwR84kjtC9ucNIBFGm0GykQMLO1BKyQCLVda6um5W//K/+gA8opAvl9MT0tztBEozfFZRCwDrOjWjFHxYBN2/kKCfOHivl8W4yDzYQf7Sok08U+BG1oQ1sD3DynkJ4WZmijHR3r4psViibL6uvmMkYpRouceDkc/J6iHzVG/RwH+wDHVZihaFrcnhZlKIWg9UV8BZI6qVMoQR3syPCPIViP3A/6/EqDgIiNhZkPznR44FIEM9RCC1QotCnK0P9L2EFLpkR79BDpT21CZrYPUrRQZPkbNyAdTKAIo+R41oKv0mzBNTfSgxQp3BRlSNNS51QmsHCIptIPRKvu+Jn4dVkpPJyIgkofOCLOYT0eyZyLeT1IPvBKRlI3+VDgJBZk6GNuB4fJbSNF+xuYTFGeF24kuRdWvxbrJ7d6qIG1Yd/eGEc51emX1MgqzAR9HWovpf+TKMhQB5H9/SdYfBeLgC08Ol0ozijo4sFioh2V61YUWUBlbfFTpgo1WIHcHDAtMfZofALP1hRwl8b2fCEWY2hjAWISmbjIkQ7Jgg6WpQObToWKLXwRxj2i7ta9LyKxZZjk8yCOisBgNOOstnAw2z7UeA6wP8YmovBRYr6zis9kiHGKpvOsHAOvcKUGMvx89lpY4oYkjykgJi4tJOYZIyFM/HDJUxFRv1qyus2AVcfkJ1D5ghL+y1FMq5hPLMSQzWD7IX1gqqgCjqcqJQt0AUTxn+CAzbk4Tb5eDc8m07s194BHFmuNal2xl5rQYdvvodOM9IOFUa229MA/wlMmZwc2hRjOsDe2s9lt/5gdxEn7zwlSVFvB0ko2RJKJoUzjNPBwLXQmTI0Gmhs8zJNHnpJQ4TntzlAaXzeJqC1kPDzbYRRiSNHY9YkyT5uFYmFjpNtROSNR04cLodS2leWJWperLBQ5XAxUmeMFiicOXq5nCli3CcV9PNvWFGHIWkBstB+LLXc7T+OTgYusi4QMIQ6IsG8TT6ExgQyPCyf7fNO7Fo9W0tP25getiJoWYYiZatrBdZP6rU+XVn4yIV6SesZQODmeVWh3eA4zGfJHpXUBhNZdmI6vTtK8ESPfc11iEYZmtipt3sJE1/bMw6h7VDTD6qOLwHMokn1G3YlwF+IcwodMXR1v0YbWyqZ4l0On2aCKMbgCQ/3v9NxN+5kO2RFVB43NSMyZaAs6E00oTSqkJ9tpDYjZNehM0a3IEb90Fv9ReRacTRAF+vZLesTbZ4bfBRgyD49JsnfoSfMdpeI7nkgca+EjdTD5X4klsp1IruqQyo+pTXeiMxoe6CujbszTV3McWrHOrIAXYOiD39P+pC+Wxf46yPyQSt3rPfft2mnZjcNe8s/mfyzXeJCNjillFOxfDCvY0QD2anjmQSzAEFQPqyjM93IapI476biFTzrCDmmW9kPkjbGKJQ9ad+vJbWG2ZmZbxjzYP6xraP3zllmAoTkUgmGzp2RzLF97q5rGsu90K3MCmxPhqNkPhu1jWxu6MuvjMAOzm893gcIatRf580+gAMM+2ICvPrsB+cgN9lXosvQejmUXRhpWaivCfNUsSp2/0d3oRxWIVMye0gkwqAG4nZkCR7b2Uns/iPMZMhuEwA0k1s3mwts9iyjaWG+ycpQ3e5a6+DW3RlXwjq1dNpjIdlYstRpTLPu/BnTF6yLP7pw33Hc+QyxBaT5TmAJUsbWksH0s1O7k0oAGHVhjLzMWeArj5Jt+Mq/HbiwD3ajwLBiojm5lzTk5LzQ9nyGWZHpgH1HhtC2qWgBlDCtXO/NVNYI50wEscpSKgUGKpXkwchFQNRNO3Wy7PJcW/RiMc0LYFezTnRnVnM8QfZxoLRHQ054wgcx0hzQrJ3pfx6EF37M7V9aNcfHdVO3MxTCc56TjTWrPwvOpIGbRQgwgW+md2uKP4nyGYl95/iDr8FwHUYq31iIb2xLZ/VhtcCpwvSzDYUENA1VRy1nnxENkojTAaj90uplwvfGv1lKsJDUJtZnZsn04ivEONp/tcpUxkfvX0O4MYBs2PIZTWmiGsTOjC9PSzm6x8WtGMSIaESVy6qYDpUfNOWv89HyGWMFIBk1NW/ssaGOfaAEiYjnbIZ3eBHhhhRTbMQQOWKLmLtjnpvXg9ggzZajCmpNYC5dQtdLOm+g7nyFmFnPc6S5RnDZa/6Z6msZR0d4XRWtTWMQG2khNBHui0OZuT8TD+mL6q3PfEFqsLcFu/2qPj4KYY9Ds8ow9YCKX2Kt5x8y2sNSOiEh5QAZuxeeKfOwo4VRt7Xs+qrbJDvfFWPDTKctU4ES08zqJBRmi+6oZ3+xsqK336BAvcgJbltY61jItBTrgYGIKGj6mIjdW/Bm/QNYXfSfyPLqUw3EH2BdZTE2uxlC8S9ETFAaPwmzEiTXvTFaNPr3la3Ii+9h46WP4A+Mau+xB/AIYhKJ0N5105jIWNyzhJXGIqmZMrydDaLvEB1th3HHvE8FQwtXG8+WA+Ll12RHMWz7YwpykYA7Vvyahmy/yGMNkNYCECg6vMTlcjyFRdwfdts3WZFh7DW73q5MLzHBmNjwJTgKzPhkar92rNdtk1iKtNiXt6zH0lBZj5i7JUiHX1ThyhTONB9fHtaHlyNXNAnU6zt2r4b0Z3+Ejses2s6/IkNuIKEr5aaH1vDlsmU3aJ+86uc2bNL+30e4fW/b6/uStIXekB37rrr3Iqlkh2KmrMqyrC5nHJyubejC+ZfcTueB1R+quMe8Lf93A6o3opzLalvziL2kVMuTJPmOBQ727jvwoofY1GaqOsO3hYz99y87Z4dKMcNE3I92bC2nEbRlWwhCtAT7TdhK5D9weefquKQo2E3kdi/qHNeprb2lekSF2i2q9Rf/o552VGBdd9UUt1KMiZzQ6wgU6YGyaXIhb/Ni1bqiNF5q20HbrmEPY6k7UGR93V2PY1HDtXhbH+GKSaZJ7oWB2P8KlJ32kCDGbsbNbuDnrrODBOR7w+M6zagejU9wHqPZchyHq387Mwm2GM249dlpx8MSM+xrnUHBkmKdRXqemTU/frLB1bH3v5d3w0EDMlNWuyDB0uA0hra2QBaa24Q9vhLC+JSjiNdgvbbHGmL1st7RwxEj2ayi74w9l6vy6DEOIzEiiuSFU+/wnECp7ZSlithTapSLrTTyula9ch2PSTZ6AsPsv8FB4S6NzTYYaRFYe7jJUFFGEj682wkwIu0XNFNrfb/WtccTEbaWzGj1QWKG7V2K4BDd3LyqDU5/V3RezsRkaOEisgUtBc/pWQxATkJGDXqUmRh3FnNSVbCkeLE8s5tG3IY1/fqtyizYDj2LfFTPvr2Lg4lDUQDwUiz7+t2vGpUraSHRNUZ2K3loIvmyBsyR472unFQD1yFiVD9UaWBq+blzKEUEr8Cng2VwYDt/uoOBAIvSQcIZx/kYN25mHYZcq7FY+VPk3MGzR1gGrFwGlb9Zt+fr66dwhlB/Dt4Z/HUpBlRm9Ocho9voMTwtsr8P+xn3bUvp9uDnt4b+N40P/DQz/EfwQcsHAmxSu3hIl3smHm0mlYOhPoeSGzY49dAS5wUw+fHMpGHIzyw0kvp7eNEUxvPfhVkspGEL3ZuNjTArtbqiYa/94EFOUgiGMBCeRcssDMJdbkPx0xj+jDAyxF86j7RkP2AzODD3ih/vWpWAIFahOJMYqgNnMeNvn/4AyMMTG02MgmH53RGj64Rn8MjBEN8GjGezEwCs/MDL24aHRMjAEy2LwKBqb3cAQjGr4OzGErMPw8gx5iBp+dD69FAzhDVqqHBm2oBrQ+51kCDUJQ1VyMvzdGbKK4Qkqhu+hYvg2KoanqBi+j4rhe6gYvo2K4Skqhu+jYvgeKoZvo2J4iorh+6gYvoeK4dv4lQxZxfAdFGC4/lmGNSpf6TrW2j5aL8Xfg6Kd9xvbi7z3FIbh6KPdI+c7vxom/O6GYe/Zh9ejwnD90d8iwJbDMBz/aoZKpOv6x1/rdHQdZy8YlXd5uv7xV7WYquu//k3nkqBiWH5UDMuPimH5UTEsPyqG5UfFsPyoGJYfFcPyo2JYflQMy4+KYflRMSw/KoblR8Ww/KgYlh8Vw/KjYlh+VAzLj4ph+VExLD8qhuVHxbD8qBiWHxXD8qNiWH5UDMuP/wOGdaXxW4PL8H8lB2RPscniSQAAAABJRU5ErkJggg==";
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
    return {
      i: i + 1,
      fgCode: p.fgCode || it.registration?.fgCode || "-",
      name: p.productDescription || it.registration?.productName || "-",
      qty, incVat, exVat, perUnit,
      tax: r2(perUnit * qty),         // line total from the rounded per-unit
    };
  });
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const totalTax = sum("tax");        // excise + local being billed (ก่อน VAT)
  const vat = r2(totalTax * VAT_RATE);
  const grand = r2(totalTax + vat);   // net total billed to the customer (incl VAT)

  const rows = lines.map((l) => `<tr>
    <td class="c-no">${l.i}</td>
    <td class="c-desc">
      <div class="fg-code">${esc(l.fgCode)}</div>
      <div class="p-name">${esc(l.name)}</div>
      <div class="c-sub">ราคาขาย/หน่วย: ${fmtMoney(l.incVat)} (รวม VAT) · ${fmtMoney(l.exVat)} (ถอด VAT)</div>
    </td>
    <td class="c-money">${fmtMoney(l.perUnit)}</td>
    <td class="c-num">${fmtInt(l.qty)}</td>
    <td class="c-money">${fmtMoney(l.tax)}</td>
  </tr>`).join("") || `<tr><td class="c-desc" colspan="5" style="text-align:center;color:#837868">ไม่มีรายการ</td></tr>`;

  const taxId = customer.taxId || order.customerTaxId || "-";
  const address = customer.address || "-";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>ใบวางบิลค่าภาษีสรรพสามิต ${esc(order.quotationRef || order.id || "")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #eef0f3; color: #21385e; font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif; font-size: 12px; }
  .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 12px 0; display: flex; align-items: center; justify-content: space-between; }
  .toolbar h1 { font-size: 15px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: none; font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 7px; cursor: pointer; }
  .sheet { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; padding: 12mm; box-shadow: 0 4px 24px rgba(0,0,0,.12); }

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

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cfc9bf; padding: 5px 7px; word-break: break-word; }
  thead th { background: #e8e2d9; color: #21385e; font-size: 9.5px; font-weight: 700; text-align: center; line-height: 1.2; }
  .c-no { text-align: center; font-size: 9.5px; width: 18px; }
  .c-desc { text-align: left; font-size: 10.5px; }
  .c-desc .fg-code { font-weight: 700; font-size: 10px; color: #c17a52; letter-spacing: .3px; }
  .c-desc .p-name { font-weight: 600; color: #21385e; margin-top: 1px; }
  .c-desc .c-sub { font-size: 8.5px; color: #837868; margin-top: 2px; font-weight: 400; }
  .c-num { text-align: right; font-size: 10px; width: 48px; }
  .c-money { text-align: right; font-size: 10px; white-space: nowrap; width: 78px; }
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

  @page { size: A4 portrait; margin: 10mm; }
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
        <div class="big">EXCISE TAX</div>
        <div class="sub">${esc(order.quotationRef || order.id || "-")}</div>
      </div>
    </div>

    <div class="header-grid">
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
    </div>

    <table>
      <colgroup>
        <col style="width:26px"/>
        <col/>
        <col style="width:78px"/>
        <col style="width:66px"/>
        <col style="width:104px"/>
      </colgroup>
      <thead><tr>
        <th>no.</th>
        <th>รายการสินค้า</th>
        <th>ภาษี/หน่วย</th>
        <th>จำนวน</th>
        <th>รวมภาษี</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td class="c-desc" colspan="4" style="text-align:right">รวม</td>
        <td class="c-money">${fmtMoney(totalTax)}</td>
      </tr></tfoot>
    </table>

    <div class="totals">
      <div class="row"><span>รวมค่าภาษี (ก่อน VAT)</span><span>${fmtMoney(totalTax)}</span></div>
      <div class="row"><span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span>${fmtMoney(vat)}</span></div>
      <div class="row grand"><span>ยอดวางบิลสุทธิ (รวม VAT)</span><span>${fmtMoney(grand)}</span></div>
    </div>

    <div class="signs">
      <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้จัดทำ</div><div class="date">วันที่ ........./........./.........</div></div>
      <div class="sign"><div class="sig-space"></div><div class="line"></div><div class="lbl">ผู้รับเอกสาร / ลูกค้า</div><div class="date">วันที่ ........./........./.........</div></div>
    </div>

    <div class="note-line">หมายเหตุ: เอกสารนี้เรียกเก็บเฉพาะค่าภาษีสรรพสามิตและภาษีบำรุงท้องถิ่น ไม่รวมราคาสินค้า</div>
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

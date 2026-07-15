import { COMPANY_LEGAL_NAME, SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';

// Print-ready A4 (landscape) document for an excise report (the uniform shape
// from lib/tax/reports.js). Shares the visual language + logo of the billing
// document (ISO style): IBM Plex Sans Thai (loaded via Google Fonts so the
// about:blank print window renders the loopless font), navy + terracotta,
// brand + doc-title header. `multiline` cells ("main\nsub") render as two lines.
const COMPANY = COMPANY_LEGAL_NAME;
const LOGO_URL = SYSTEM_DOCUMENT_LOGO_URL;

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`; // DD/MM/YYYY (ค.ศ.)
};
// เวลาพิมพ์เอกสาร → DD/MM/YYYY HH:MM (ค.ศ.).
const genAt = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const cellText = (c, val) => {
  if (c.money) return fmtMoney(val);
  if (c.date) return fmtDate(val);
  if (c.num) return (Number(val) || 0).toLocaleString("th-TH");
  return esc(val ?? "-");
};
const cellHtml = (c, val) => {
  if (c.multiline) {
    const [main, ...rest] = String(val ?? "-").split("\n");
    return `${esc(main)}${rest.map((l) => `<div class="sub">${esc(l)}</div>`).join("")}`;
  }
  return cellText(c, val);
};
const align = (c) => (c.money || c.num ? "right" : "left");

export function buildReportPrintHTML(report, meta = {}) {
  const cols = report.columns || [];
  const head = cols.map((c) => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join("");
  const body = (report.rows || []).length
    ? (report.rows || []).map((row) =>
        `<tr>${cols.map((c) => `<td class="${c.multiline ? "ml" : ""}" style="text-align:${align(c)}">${cellHtml(c, row[c.key])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${cols.length}" style="text-align:center;color:#837868;padding:14px">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>`;

  const s = report.summary;
  const summaryRow = s
    ? `<tr class="sum">${cols.map((c, i) => {
        if (i === 0) return `<td>${esc(s._label || "รวม")}</td>`;
        const v = s[c.key];
        if (v == null) return `<td></td>`;
        return `<td style="text-align:${align(c)}">${typeof v === "number" ? (c.money ? fmtMoney(v) : (Number(v) || 0).toLocaleString("th-TH")) : esc(v)}</td>`;
      }).join("")}</tr>`
    : "";

  const filterLine = [
    meta.from || meta.to ? `ช่วงวันที่: ${meta.from || "..."} – ${meta.to || "..."}` : "",
    meta.customerName ? `ลูกค้า: ${esc(meta.customerName)}` : "",
  ].filter(Boolean).join("  ·  ");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>${esc(report.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #eef0f3; color: #21385e; font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif; font-size: 12px; }
  .toolbar { max-width: 297mm; margin: 0 auto; padding: 16px 12px 0; display: flex; align-items: center; justify-content: space-between; }
  .toolbar h1 { font-size: 15px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: none; font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 7px; cursor: pointer; }
  .sheet { width: 297mm; min-height: 210mm; margin: 16px auto; background: #fff; padding: 12mm; box-shadow: 0 4px 24px rgba(0,0,0,.12); }
  .doc-top { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #c17a52; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo-wrap { height: 46px; flex-shrink: 0; display: flex; align-items: center; }
  .logo-wrap img { height: 46px; width: auto; max-width: 300px; display: block; }
  .brand h2 { font-size: 14px; font-weight: 700; line-height: 1.25; }
  .doc-title .big { font-size: 16px; font-weight: 800; color: #c17a52; text-align: right; }
  .doc-title .sub { font-size: 9.5px; color: #837868; text-align: right; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cfc9bf; padding: 5px 7px; vertical-align: top; }
  thead th { background: #e8e2d9; color: #21385e; font-size: 10px; font-weight: 700; }
  td { font-size: 10.5px; }
  td.ml { line-height: 1.3; }
  td .sub { font-size: 8.5px; color: #837868; }
  tr.sum td { font-weight: 700; background: #f0ebe0; border-top: 2px solid #c17a52; }
  .gen { margin-top: 14px; font-size: 9px; color: #837868; text-align: right; }
  @page { size: A4 landscape; margin: 31mm 10mm 10mm; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: 100%; min-height: auto; padding: 0; }
    .doc-top { position: fixed; top: -29mm; left: 0; right: 0; height: 25mm; margin: 0; background: #fff; z-index: 20; }
    thead { display: table-header-group; }
  }
</style></head><body>
  <div class="toolbar no-print">
    <h1>${esc(report.title)}</h1>
    <button class="btn-print" onclick="window.print()">🖨 สั่งพิมพ์ / บันทึก PDF</button>
  </div>
  <div class="sheet">
    <div class="doc-top">
      <div class="brand">
        <div class="logo-wrap"><img src="${LOGO_URL}" alt="S&amp;S"/></div>
        <div>
          <h2>${esc(COMPANY)}</h2>
        </div>
      </div>
      <div class="doc-title">
        <div class="big">REPORT</div>
        <div class="sub">${esc(report.title)}</div>
        ${filterLine ? `<div class="sub">${filterLine}</div>` : ""}
      </div>
    </div>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}${summaryRow}</tbody>
    </table>
    <div class="gen">พิมพ์เมื่อ ${genAt()} · ${esc(COMPANY)}</div>
  </div>
</body></html>`;
}

export function openReportPrintWindow(report, meta = {}) {
  const html = buildReportPrintHTML(report, meta);
  const w = window.open("", "_blank");
  if (!w) { alert("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้"); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

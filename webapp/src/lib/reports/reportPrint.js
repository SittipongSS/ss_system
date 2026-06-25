// Print-ready A4 (landscape) document for the uniform report shape shared by
// every module (tax / master / pm). Shares the visual language + logo of the
// billing document (ISO style): IBM Plex Sans Thai (loaded via Google Fonts so
// the about:blank print window renders the loopless font), navy + terracotta,
// brand + doc-title header. `multiline` cells ("main\nsub") render as two lines.
const COMPANY = "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด";
const LOGO_URL = "data:image/png;base64,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";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
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
    meta.note ? esc(meta.note) : "",
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
  .logo-wrap { width: 40px; height: 40px; background: #21385e; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
  .brand h2 { font-size: 14px; font-weight: 700; line-height: 1.25; }
  .brand .doc-name { font-size: 10px; color: #837868; margin-top: 2px; }
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
  @page { size: A4 landscape; margin: 10mm; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: 100%; min-height: auto; padding: 0; }
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
          <div class="doc-name">${esc(report.title)}</div>
        </div>
      </div>
      <div class="doc-title">
        <div class="big">REPORT</div>
        ${filterLine ? `<div class="sub">${filterLine}</div>` : ""}
      </div>
    </div>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}${summaryRow}</tbody>
    </table>
    <div class="gen">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")} · ${esc(COMPANY)}</div>
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

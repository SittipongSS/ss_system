// Print-ready A4 document for an excise report (the uniform shape from
// lib/tax/reports.js). Mirrors the pattern of lib/pm/ganttPrint.js: build an HTML
// string and open it in a new window for the browser's print → Save as PDF.

const COMPANY = "Scent & Sense";
const LOGO_URL =
  "https://static.wixstatic.com/media/279c93_8f08407580cc4842ad6fae8b398eec3e~mv2.png/v1/fill/w_166,h_166,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/marque.png";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtMoney = (v) => (Number(v) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};
const cell = (c, val) => (c.money ? fmtMoney(val) : c.date ? fmtDate(val) : c.num ? (Number(val) || 0).toLocaleString("th-TH") : esc(val ?? "-"));

export function buildReportPrintHTML(report, meta = {}) {
  const cols = report.columns || [];
  const align = (c) => (c.money || c.num ? "right" : "left");

  const head = cols.map((c) => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join("");
  const body = (report.rows || [])
    .map((row) => `<tr>${cols.map((c) => `<td style="text-align:${align(c)}">${cell(c, row[c.key])}</td>`).join("")}</tr>`)
    .join("");

  const s = report.summary;
  const summaryRow = s
    ? `<tr class="sum">${cols.map((c, i) => {
        if (i === 0) return `<td>${esc(s._label || "รวม")}</td>`;
        const v = s[c.key];
        return `<td style="text-align:${align(c)}">${v == null ? "" : (typeof v === "number" ? (c.money ? fmtMoney(v) : (Number(v) || 0).toLocaleString("th-TH")) : esc(v))}</td>`;
      }).join("")}</tr>`
    : "";

  const filterLine = [
    meta.from || meta.to ? `ช่วงวันที่: ${meta.from || "..."} – ${meta.to || "..."}` : "",
    meta.customerName ? `ลูกค้า: ${esc(meta.customerName)}` : "",
  ].filter(Boolean).join(" · ");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<title>${esc(report.title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans Thai","Sarabun",sans-serif; color: #1a1e27; margin: 0; }
  header { display:flex; align-items:center; gap:12px; border-bottom:2px solid #c17a52; padding-bottom:10px; margin-bottom:14px; }
  header img { width:42px; height:42px; object-fit:contain; }
  .co { font-weight:700; font-size:15px; }
  h1 { font-size:17px; margin:2px 0 0; }
  .meta { font-size:11px; color:#5d6470; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; }
  th { background:#c17a52; color:#fff; padding:7px 8px; text-align:left; }
  td { padding:6px 8px; border-bottom:1px solid #e6ddcf; }
  tr.sum td { font-weight:700; border-top:2px solid #c17a52; background:#f6efe3; }
  .gen { margin-top:14px; font-size:10px; color:#8a93a3; text-align:right; }
</style></head><body>
  <header>
    <img src="${LOGO_URL}" alt="${esc(COMPANY)}"/>
    <div>
      <div class="co">${esc(COMPANY)} — ระบบภาษีสรรพสามิต</div>
      <h1>${esc(report.title)}</h1>
      ${filterLine ? `<div class="meta">${filterLine}</div>` : ""}
    </div>
  </header>
  <table><thead><tr>${head}</tr></thead><tbody>${body}${summaryRow}</tbody></table>
  <div class="gen">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</div>
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
  setTimeout(() => w.print(), 400);
}

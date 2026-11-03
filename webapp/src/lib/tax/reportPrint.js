import { notifyToast } from "@/lib/feedback";
import { resolveCompanyBlock, getCompanyProfileForPrint } from '@/lib/companyProfile';
import { fmtDate, fmtNumber } from "@/lib/format";
import { businessDayKey, businessTimeKey } from "@/lib/datePeriods";
import {
  documentFooter,
  documentHeader,
  esc,
  money,
  renderDocumentHTML,
} from '@/lib/documents/documentShell';
import { printPlaceholderHtml } from "@/lib/printTheme";

// รายงานสรรพสามิต (รูปแบบกลางจาก lib/tax/reports.js) — A4 แนวนอน
//
// 2026-08-05: เอกสารพิมพ์ตัวสุดท้ายที่ย้ายมาใช้เปลือกกลาง lib/documents/documentShell
// ชุดเดียวกับใบเสนอราคา/ใบแจ้งชำระภาษี/ไทม์ไลน์ · ที่ได้เพิ่มจากหน้าตาที่ตรงกัน
//   - ฟอนต์ฝัง base64 มาในไฟล์ แทนลิงก์ Google Fonts CDN (คอมเมนต์เดิมในไฟล์นี้เขียน
//     ไว้เองว่าโหลดผ่าน CDN "เพื่อให้หน้าต่าง about:blank เรนเดอร์ฟอนต์ได้" — ซึ่งกลับกัน
//     ฝังมาในไฟล์ต่างหากที่ไม่ต้องพึ่งเน็ตตอนสั่งพิมพ์)
//   - ขั้นบันได zoom ตอนดูบนจอ · ท้ายกระดาษแบบเดียวกับเอกสารอื่น
//
// ⚠️ รายงาน "ไม่ใช่เอกสารควบคุม" — ไม่มีรหัสแบบฟอร์ม/Revision/ลายเซ็น/ลายน้ำ และไม่ผูก
// กับมาตรฐานเอกสารในหน้าตั้งค่า จึงไม่ส่ง formLine เข้าเปลือก (หัวใบจะข้ามบรรทัดนั้นให้)

/* เวลาพิมพ์เอกสาร → DD/MM/YYYY HH:MM (ค.ศ.) **ตามเวลาไทย**
   🐞 ของเดิมใช้ `new Date().getHours()` = นาฬิกาของเครื่องผู้ใช้ ⇒ คนที่ตั้งโซนเวลา
   อื่น (หรือเปิดจากมือถือที่โรมมิ่ง) พิมพ์รายงานออกมาแล้วหัวกระดาษเป็นเวลาคนละที่
   กับที่ระบบบันทึก · เดิมพักไว้ที่เพดาน check:thaitime — รอบนี้คือ "งานสายภาษี
   รอบหน้า" ที่คอมเมนต์เดิมนัดไว้ */
const genAt = () => {
  const now = new Date().toISOString();
  const day = businessDayKey(now);              // YYYY-MM-DD ตามวันไทย
  const time = businessTimeKey(now);            // HH:MM ตามเวลาไทย
  if (!day || !time) return "";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year} ${time}`;
};
const cellText = (c, value) => {
  if (c.money) return money(value);
  if (c.date) return value ? fmtDate(value) : '-';
  if (c.num) return fmtNumber(value);
  return esc(value ?? "-");
};
const cellHtml = (c, value) => {
  if (c.multiline) {
    const [main, ...rest] = String(value ?? "-").split("\n");
    return `${esc(main)}${rest.map((l) => `<div class="sub">${esc(l)}</div>`).join("")}`;
  }
  return cellText(c, value);
};
const align = (c) => (c.money || c.num ? "right" : "left");

/* ── แบ่งหน้าตาม **ความสูงของแถว** ไม่ใช่จำนวนแถว (03/11/2026) ──────────────
   🐞 เดิมตัดหน้าละ 16 แถวตายตัว โดยคิดจากแถวสูงสองบรรทัด (7.8mm) · แต่ผู้ที่เห็นราคาผลิต
      (RA/แอดมิน) ได้คอลัมน์แจกแจงต้นทุนห้าบรรทัด = แถวสูง 16mm ⇒ ตารางยาว 322mm บนกระดาษ
      210mm แล้ว `.sheet { overflow: hidden }` ของเปลือก **ตัดทิ้งเงียบ ๆ หน้าละ ~7 แถว**
      (รายงาน 43 รายการ พิมพ์ออกมาเห็นราว 27) · จำนวนบรรทัดต่อแถวต่างกันตามสิทธิ์และตามรายงาน
      ⇒ ตัวเลขตายตัวตัวเดียวถูกได้แค่เคสเดียว
   ค่าวัดจากหน้าที่เรนเดอร์จริง (Chrome · A4 แนวนอน 297×210mm · เปลือกกลาง):
     ตารางเริ่ม 56.95mm (หัวใบสูงเท่าเดิมไม่ว่าแถวหัวขวาจะมี 1 หรือ 3 แถว — บล็อกบริษัทซ้ายสูงกว่า)
     หัวตาราง 6.51mm · ท้ายกระดาษเริ่ม 199.28mm ⇒ วางแถวได้ 135.8mm
     แถวบรรทัดเดียว 5.08mm · ทุกบรรทัดรอง (`.sub`) +2.74mm (สามบรรทัด 10.55–10.68mm) · แถวสรุป 5.99mm
   ⚠️ ปัดขึ้นทุกค่า และกันไว้อีกหนึ่งบรรทัดรองต่อหน้าเผื่อข้อความที่ตัดบรรทัดเอง — โมเดลนี้นับ
      แค่ "\n" ในค่า ไม่ได้วัดความยาวข้อความ (ข้อมูลจริง 43 แถว ณ 03/11 ไม่มีเซลล์ไหนตัดบรรทัดเอง) */
const REPORT_ROW_MM = 5.1;
const REPORT_SUB_LINE_MM = 2.8;
const REPORT_SUMMARY_MM = 6;
const REPORT_BODY_MM = 135.8 - REPORT_SUB_LINE_MM;

/** จำนวนบรรทัดของแถว = เซลล์ multiline ที่ยาวที่สุด (คอลัมน์อื่นบรรทัดเดียวเสมอ) */
export function reportRowLines(row, columns = []) {
  return columns
    .filter((c) => c.multiline)
    .reduce((max, c) => Math.max(max, String(row?.[c.key] ?? "").split("\n").length), 1);
}

const reportRowMm = (row, columns) => REPORT_ROW_MM + REPORT_SUB_LINE_MM * (reportRowLines(row, columns) - 1);

// เติมหน้าจากหน้าแรก · หน้าสุดท้ายต้องเหลือที่ให้แถวสรุป ⇒ ถ้าแถวสุดท้ายลงพอดีแต่สรุปไม่ลง
// แถวท้ายนั้นย้ายไปเปิดหน้าใหม่พร้อมสรุป (สรุปห้ามลอยอยู่หน้าเปล่าคนเดียว)
export function paginateReportRows(rows = [], columns = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [[]];
  const pages = [];
  let page = [];
  let used = 0;
  rows.forEach((row, index) => {
    const height = reportRowMm(row, columns);
    const isLast = index === rows.length - 1;
    const need = height + (isLast ? REPORT_SUMMARY_MM : 0);
    if (page.length && used + need > REPORT_BODY_MM) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(row);
    used += height;
  });
  pages.push(page);
  return pages;
}

// ตารางรายงานรับคอลัมน์อะไรก็ได้จากผู้เรียก จึงกำหนดความกว้างตายตัวแบบ .itemTable
// ของใบเสนอราคาไม่ได้ — เอาเฉพาะ "หน้าตา" มา (หัวสีกรมท่า แถวสลับสี เส้นคั่นบาง)
const REPORT_CSS = `
  .report .sheetContent { padding-bottom: 0; }
  .report .documentHeader { grid-template-columns: minmax(0, 1.4fr) minmax(70mm, .8fr); gap: 6mm; padding-bottom: 3mm; }
  .report .identityBlock h1 { font-size: 15pt; }
  .reportTable { width: 100%; margin-top: 4mm; border-collapse: collapse; }
  .reportTable thead { display: table-header-group; }
  /* รายงานเป็นตารางข้อมูลหนาแน่น ไม่ใช่เอกสารสำหรับอ่านทีละบรรทัด — คุมความสูงแถว
     ให้ใกล้ของเดิม (แถว 2 บรรทัดต้องไม่เกิน ~7mm) ไม่งั้นจำนวนแถวต่อหน้าหายไปครึ่งหนึ่ง */
  .reportTable th { padding: 1.1mm 1.2mm; color: #fff; background: var(--doc-navy); font-size: 7.4pt; font-weight: 600; }
  .reportTable td { padding: .8mm 1.2mm; vertical-align: top; border-bottom: 1px solid var(--doc-line); font-size: 7.6pt; line-height: 1.25; }
  .reportTable tbody tr:nth-child(even) td { background: var(--doc-neutral-subtle); }
  .reportTable td .sub { color: var(--doc-muted); font-size: 6.2pt; line-height: 1.25; }
  .reportTable .empty { padding: 8mm 1.5mm; color: var(--doc-muted); text-align: center; }
  /* แถวสรุปใช้โทนเดียวกับ .grandTotal ของใบเสนอราคา */
  .reportTable tr.sum td { color: var(--doc-navy); background: var(--doc-paper);
    border-top: 1.8px solid var(--doc-navy); border-bottom: 1px solid var(--doc-navy);
    font-size: 9.2pt; font-weight: 700; }`;

export function buildReportPrintHTML(report, meta = {}, company, options = {}) {
  const co = resolveCompanyBlock(company);
  const cols = report.columns || [];
  const head = cols.map((c) => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join("");
  const bodyForRows = (rows) => rows.length
    ? rows.map((row) =>
      `<tr>${cols.map((c) => `<td style="text-align:${align(c)}">${cellHtml(c, row[c.key])}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty" colspan="${cols.length}">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>`;

  const s = report.summary;
  const summaryRow = s
    ? `<tr class="sum">${cols.map((c, i) => {
        if (i === 0) return `<td>${esc(s._label || "รวม")}</td>`;
        const v = s[c.key];
        if (v == null) return `<td></td>`;
        return `<td style="text-align:${align(c)}">${typeof v === "number" ? (c.money ? money(v) : fmtNumber(v)) : esc(v)}</td>`;
      }).join("")}</tr>`
    : "";

  const pages = paginateReportRows(report.rows || [], cols);
  const printedAt = genAt();
  const header = documentHeader({
    // resolveCompanyBlock คืนคีย์ legalNameTh/legalNameEn ส่วนเปลือกรับ nameTh/nameEn
    company: {
      nameTh: co.legalNameTh,
      nameEn: co.legalNameEn,
      address: co.address,
      taxId: co.taxId,
      phone: co.phone,
      line: co.line,
      website: co.website,
    },
    titleTh: report.title,
    titleEn: 'REPORT',
    // เงื่อนไขที่กรองมาเป็น "ตัวตน" ของรายงานฉบับนี้ — รายงานชื่อเดียวกันคนละช่วงวันที่
    // คือคนละใบ ต้องอ่านออกจากหัวใบว่าใบที่ถืออยู่กรองอะไรมา
    rows: [
      meta.from || meta.to ? { label: 'ช่วงวันที่', value: `${meta.from || '...'} – ${meta.to || '...'}` } : null,
      // ชื่อลูกค้ายาวได้เกินคอลัมน์ ⇒ แถวเดียวของหัวใบที่ยอมให้ตัดบรรทัด (ไม่ใช่เลขที่)
      meta.customerName ? { label: 'ลูกค้า', value: meta.customerName, wrap: true } : null,
      { label: 'พิมพ์เมื่อ', value: printedAt },
    ],
  });

  // `explicit-page` = หน้าที่ตัดเองล่วงหน้าด้วย paginateReportRows
  const documentPages = pages.map((rows, pageIndex) => `
    <article class="sheet explicit-page" aria-label="${esc(report.title)} หน้า ${pageIndex + 1}">
      ${header}
      <div class="sheetContent">
        <table class="reportTable">
          <thead><tr>${head}</tr></thead>
          <tbody>${bodyForRows(rows)}${pageIndex === pages.length - 1 ? summaryRow : ""}</tbody>
        </table>
      </div>
      ${documentFooter({
        left: co.legalNameTh,
        center: `พิมพ์เมื่อ ${printedAt}`,
        right: `หน้า ${pageIndex + 1} / ${pages.length}`,
      })}
    </article>`).join("");

  return renderDocumentHTML({
    title: report.title,
    // รายงานไม่ผูกมาตรฐานเอกสาร จึงไม่มี accent ของตัวเอง — ใช้ navy ให้เป็นกลาง
    accentKey: 'navy',
    orientation: 'landscape',
    variantClass: 'report',
    extraCss: REPORT_CSS,
    toolbar: options.toolbar === false ? null : { label: report.title, button: '🖨 สั่งพิมพ์ / บันทึก PDF' },
    pages: documentPages,
  });
}

export async function openReportPrintWindow(report, meta = {}) {
  // เปิดหน้าต่างก่อน (ยังไม่ await) กัน popup blocker แล้วค่อยดึงข้อมูลบริษัทที่เผยแพร่
  const w = window.open("", "_blank");
  if (!w) { notifyToast.error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้"); return; }
  w.document.open();
  w.document.write(printPlaceholderHtml({ title: "REPORT", message: "กำลังเตรียมเอกสาร…" }));
  w.document.close();
  const company = await getCompanyProfileForPrint();
  const html = buildReportPrintHTML(report, meta, company);
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

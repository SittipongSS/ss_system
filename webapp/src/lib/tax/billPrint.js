import { notifyToast } from "@/lib/feedback";
import { resolveCompanyBlock, getCompanyProfileForPrint } from '@/lib/companyProfile';
import { productIdentity } from '@/lib/master/productIdentity';
import { fmtDate, fmtNumber } from '@/lib/format';
import {
  getDocumentStandardsForPrint,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { EXCISE_VAT_RATE, billedTaxLine, billedTaxTotals } from '@/lib/tax/exciseBilling';
import {
  documentFileName,
  documentFooter,
  documentHeader,
  esc,
  money,
  partyGrid,
  renderDocumentHTML,
  val,
  watermarkBlock,
} from '@/lib/documents/documentShell';
import { printPlaceholderHtml } from "@/lib/printTheme";

// เอกสารเรียกเก็บ "ค่าภาษีสรรพสามิต + ท้องถิ่น ที่ออกแทนลูกค้าไปก่อน" (ไม่ใช่ราคาสินค้า)
// พร้อม VAT 7% ของค่าภาษีที่เรียกเก็บ — A4 แนวตั้ง
//
// 2026-08-05: ย้ายมาใช้เปลือกกลาง lib/documents/documentShell (ชุดเดียวกับใบเสนอราคา
// Quotation Master V4) แทน CSS ของตัวเองที่ลอกหน้าตามาจากเอกสารไทม์ไลน์ · สิ่งที่ได้
// นอกจากหน้าตาตรงกัน
//   - ฟอนต์ฝัง base64 มาในไฟล์ แทนการลิงก์ Google Fonts CDN ที่โหลดไม่ทันตอนสั่งพิมพ์
//     แล้วเอกสารหล่นไปฟอนต์สำรอง (ออฟไลน์ยิ่งหล่นแน่นอน)
//   - ขั้นบันได zoom ตอนดูบนจอ — เดิมไม่มี พรีวิวในหน้าตั้งค่าจึงล้นกรอบ ไม่ย่อเหมือน QT
//   - ท้ายกระดาษ (บริษัท · รหัสแบบฟอร์ม · เลขหน้า) กับลายน้ำตามสถานะใบ
// ⚠️ ตัวเลขทุกตัวยังคิดด้วย lib/tax/exciseBilling.js เหมือนเดิม ห้ามคิดเองที่นี่
// ไม่งั้นเลขบนจอกับบนเอกสารจะเดินหนีกัน
const NOTICE_KEY = 'exciseTaxNotice';

const fmtInt = (v) => fmtNumber(v);

// สถานะใบที่ยังไม่ใช่ฉบับจริง → ขึ้นลายน้ำกลางหน้า (แพตเทิร์นเดียวกับใบเสนอราคา
// ที่ขึ้น "ฉบับร่าง" ตอนยังไม่อนุมัติ) · สถานะอื่นถือเป็นฉบับใช้งานจริง ไม่มีลายน้ำ
const STATUS_WATERMARKS = Object.freeze({
  draft: 'ฉบับร่าง',
  rejected: 'ตีกลับให้แก้ไข',
});

/* ความจุแถวต่อหน้า — วัดจากเอกสารที่เรนเดอร์จริงด้วยเปลือกกลาง (2026-08-05)
     แถวหนึ่ง 3 บรรทัด (รหัส/แบรนด์ · ชื่อสินค้า · ราคาขายต่อหน่วย) = สูง 17.5mm
     พื้นที่วางแถว: หน้าแรก 185mm (เสียให้กล่องข้อมูลลูกค้า 27mm) · หน้าถัดไป 216mm
     หน้าที่ถือท้ายเอกสารต้องกันไว้อีก ~60mm (ยอดรวม + หมายเหตุ + ช่องลงนาม)

   ⚠️ ค่าเดิมคือ 12/8 ซึ่งตั้งไว้ตอนเลย์เอาต์เก่าที่แถวเตี้ยกว่านี้มาก — พอเปลี่ยนมาใช้
   เปลือกเดียวกับใบเสนอราคาแล้วยังใช้ 12 อยู่ แถวที่ 11–12 ทับท้ายกระดาษและถูก
   `.sheet { overflow: hidden }` ตัดทิ้งเงียบ ๆ (เห็นจากการเรนเดอร์จริง ไม่ใช่คำนวณ)

   ⚠️ ข้อจำกัดที่ยังเหลือ: ค่าพวกนี้คิดจากชื่อสินค้าที่ยาวไม่เกินหนึ่งบรรทัด ถ้าชื่อยาว
   จนตัดสองบรรทัดทุกแถว หน้าก็ยังล้นได้ (ข้อจำกัดเดิมของโมเดลนับแถว) — เผื่อไว้หน้าละ
   หนึ่งแถวแล้ว ถ้าต้องการกันขาดจริงต้องยกโมเดล "หน่วยต้นทุนต่อแถว" ของใบเสนอราคา
   (v4RowCost ใน quotationMasterTemplate) มาใช้ ซึ่งคิดความยาวข้อความด้วย */
// เพิ่มแถวอ้างอิงจาก 4 เป็น 5 (mig 0211) ไม่กระทบค่าพวกนี้ — วัดจากหน้าที่เรนเดอร์จริง
// แล้วกล่องอ้างอิงยังอยู่ในความสูงขั้นต่ำของ .partyGrid (35mm) เท่าเดิม ทั้งตอนที่อยู่
// ลูกค้ายาวหลายบรรทัดและตอนสั้นบรรทัดเดียว ระยะเหลือท้ายหน้าเท่าเดิมทุกหน้า
const BILL_LINES_FIRST_PAGE = 9;
const BILL_LINES_PER_PAGE = 11;
// 8 แถวยังล้ำเส้นท้ายกระดาษ 0.7mm (วัดจากหน้าที่เรนเดอร์จริง) เพราะ .signatures ของ
// เปลือกใช้ margin-top:auto = ดันชิดล่างเสมอ พอเนื้อหาเต็มจึงเบียดท้ายกระดาษ
const BILL_LINES_LAST_PAGE = 7;
const BILL_LINES_SINGLE_PAGE = 6;

// เติมหน้าจากหน้าแรกไปเรื่อย ๆ แล้วให้เศษตกที่หน้าสุดท้าย — `remaining.length - 1`
// กันไม่ให้ตัดจนหน้าสุดท้ายว่างเปล่า (ยอดรวมกับลายเซ็นลอยอยู่หน้าเดียว ห้ามเกิด)
export function paginateBillLines(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];
  const remaining = lines.slice();
  const pages = [];
  for (;;) {
    const isFirst = pages.length === 0;
    // หน้าที่จบเอกสารมีท้ายเอกสารเกาะอยู่ด้วย จึงรับได้น้อยกว่าหน้าธรรมดา
    const closingCapacity = isFirst ? BILL_LINES_SINGLE_PAGE : BILL_LINES_LAST_PAGE;
    if (remaining.length <= closingCapacity) break;
    const capacity = isFirst ? BILL_LINES_FIRST_PAGE : BILL_LINES_PER_PAGE;
    pages.push(remaining.splice(0, Math.min(capacity, remaining.length - 1)));
  }
  pages.push(remaining);
  return pages;
}

// ปรับเฉพาะจุดที่ต่างจากใบเสนอราคาโดยธรรมชาติของเอกสาร: ตารางมี 5 คอลัมน์ (ไม่มี "หน่วย")
// จึงต้องตั้งความกว้างเอง และมีผู้ลงนาม 2 ช่องไม่ใช่ 3
const NOTICE_CSS = `
  /* ชื่อเอกสารยาวกว่า "ใบเสนอราคา" มาก — ที่ 19pt ของเปลือกจะตกบรรทัดกลางคำ
     ("…ค่าภาษีสรรพ / สามิต") 15pt ลงหนึ่งบรรทัดพอดีในบล็อกกว้าง 72mm */
  .tax .identityBlock h1 { font-size: 15pt; }
  /* ป้ายยอดสุทธิยาวกว่า "ยอดรวมทั้งสิ้น" ของใบเสนอราคา — 74mm ทำให้ป้ายตกบรรทัด
     แล้วตัวเลขลอยไปคนละแถวกับป้าย */
  .tax .totals { width: 94mm; }
  .tax .itemTable td:nth-child(3), .tax .itemTable th:nth-child(3) { width: 26mm; }
  .tax .itemTable td:nth-child(4), .tax .itemTable th:nth-child(4) { width: 16mm; }
  .tax .itemTable td:nth-child(5), .tax .itemTable th:nth-child(5) { width: 28mm; }
  .tax .signatures { grid-template-columns: repeat(2, 1fr); }
  .tax .noteLine { margin-top: 3mm; color: var(--doc-muted); font-size: 7.6pt; line-height: 1.5; }
  .tax .unitPrice { display: block; margin-top: .7mm; color: var(--doc-muted); font-size: 7.4pt; line-height: 1.45; }`;

function itemTable(pageLines, startIndex) {
  const rows = pageLines.map((l, index) => `
        <tr>
          <td class="center">${startIndex + index + 1}</td>
          <td>
            ${l.identity ? `<span class="itemIdentity">${esc(l.identity)}</span>` : ''}
            <strong class="itemName">${val(l.name)}</strong>
            <span class="unitPrice">ราคาขาย/หน่วย ${money(l.incVat)} (รวม VAT) · ${money(l.exVat)} (ถอด VAT)</span>
          </td>
          <td class="number">${money(l.perUnit)}</td>
          <td class="number">${fmtInt(l.qty)}</td>
          <td class="number">${money(l.tax)}</td>
        </tr>`).join('')
    || `
        <tr><td class="center" colspan="5">ไม่มีรายการ</td></tr>`;
  return `
    <table class="itemTable">
      <thead>
        <tr>
          <th class="center">ลำดับ</th>
          <th>รายการสินค้า</th>
          <th class="number">ภาษี/หน่วย</th>
          <th class="number">จำนวน</th>
          <th class="number">รวมภาษี</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function totalsSection({ totalTax, vat, grand }) {
  return `
    <section class="totals" aria-label="สรุปยอด">
      <div><span>รวมค่าภาษี (ก่อน VAT)</span><strong>${money(totalTax)}</strong></div>
      <div><span>ภาษีมูลค่าเพิ่ม ${Math.round(EXCISE_VAT_RATE * 100)}%</span><strong>${money(vat)}</strong></div>
      <div class="grandTotal"><span>ยอดแจ้งชำระสุทธิ (รวม VAT)</span><strong>${money(grand)} บาท</strong></div>
    </section>`;
}

function signatures() {
  const box = (label, labelEn) => `
        <div>
          <h2>${esc(label)} <span>${esc(labelEn)}</span></h2>
          <div class="signatureSpace">ลงชื่อ</div>
          <strong>(____________________________)</strong>
          <p>วันที่ ______ / ______ / ______</p>
        </div>`;
  return `
      <section class="signatures" aria-label="ส่วนลงนาม">${box('ผู้จัดทำ', '/ PREPARED BY')}${box('ผู้รับเอกสาร / ลูกค้า', '/ RECEIVED BY')}</section>`;
}

// options.toolbar = false → ไม่ใส่แถบปุ่มพิมพ์ (กติกาเดียวกับ renderQuotationMasterDocumentHTML)
// ใช้ตอนฝังเอกสารเป็นพรีวิวใน iframe ซึ่งปุ่มสั่งพิมพ์ไม่มีความหมาย
export function buildBillPrintHTML(order, customer = {}, company, activeStandard = null, options = {}) {
  const co = resolveCompanyBlock(company);
  const standard = order.taxNoticeStandardSnapshot || activeStandard;
  const form = resolveDocumentForm(standard, NOTICE_KEY);
  const titleTh = resolveDocumentTitleTh(standard, NOTICE_KEY);
  const titleEn = String(standard?.titleEn || form.title || 'EXCISE TAX PAYMENT NOTICE').trim();
  const noticeNumber = order.taxNoticeNumber || order.id || '-';
  const items = order.items || [];

  // Tax-only: ต่อบรรทัดเรียกเก็บภาษีสรรพสามิต + ท้องถิ่นตาม snapshot (คิดจากราคาขาย
  // ที่ถอด VAT แล้วตอนขึ้นทะเบียน)
  const lines = items.map((it) => {
    const p = it.product || {};
    const { quantity: qty, perUnit, tax } = billedTaxLine(it);
    const incVat = p.retailPriceIncVat != null ? Number(p.retailPriceIncVat) : 0;
    const exVat = p.retailPriceExVat != null ? Number(p.retailPriceExVat) : (incVat ? incVat / (1 + EXCISE_VAT_RATE) : 0);
    const identity = productIdentity({
      ...(it.registration || {}),
      ...p,
      metadata: { ...(it.registration?.metadata || {}), ...(p.metadata || {}) },
    });
    return {
      identity: [identity.code, identity.brand].filter(Boolean).join(' · '),
      name: identity.detail || '-',
      qty, incVat, exVat, perUnit, tax,
    };
  });
  const { totalTax, vat, amountToCollect: grand } = billedTaxTotals(items);

  // ค่าที่ตรึงไว้บนใบมาก่อนทะเบียนลูกค้าสดเสมอ (mig 0167): ทะเบียนที่ผู้กดพิมพ์ "มองเห็น"
  // ขึ้นกับทีมที่ดูแล/สถานะอนุมัติ — ถ้าให้ค่าสดชนะ เอกสารใบเดียวกันจะพิมพ์ออกมาไม่เหมือนกัน
  // (ตั้งเป็นตัวแปรมีชื่อ ไม่ใช่ inline ในบล็อกด้านล่าง — soFilingRoute.test ตรึงลำดับ
  // ความสำคัญนี้ไว้ด้วยการอ่านซอร์ส และมันคือกฎที่ต้องเห็นชัดตอนอ่านโค้ด)
  const taxId = order.customerTaxId || customer.taxId;
  const address = order.customerAddress || customer.address;
  const header = documentHeader({
    // resolveCompanyBlock คืนคีย์ legalNameTh/legalNameEn ส่วนเปลือกรับ nameTh/nameEn
    // (แม็ปแบบเดียวกับที่ quotationMasterTemplate ทำ) — ลืมแม็ปแล้วหัวเอกสารขึ้น "-"
    company: {
      nameTh: co.legalNameTh,
      nameEn: co.legalNameEn,
      address: co.address,
      taxId: co.taxId,
      phone: co.phone,
      line: co.line,
      website: co.website,
    },
    formLine: `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`,
    titleTh,
    titleEn,
    rows: [
      { label: 'เลขที่', value: noticeNumber },
      { label: 'วันที่เอกสาร', value: order.createdAt ? fmtDate(order.createdAt) : '-' },
      { label: 'กำหนดส่งมอบ', value: order.deliveryDate && order.deliveryDate !== '-' ? fmtDate(order.deliveryDate) : '-' },
    ],
  });
  const party = partyGrid({
    ariaLabel: 'ข้อมูลลูกค้าและข้อมูลอ้างอิง',
    party: {
      heading: 'ผู้ซื้อ',
      headingEn: '/ CUSTOMER',
      name: customer.name || order.customerName,
      address,
      rows: [{ label: 'เลขผู้เสียภาษี', value: taxId }],
    },
    reference: {
      heading: 'ข้อมูลอ้างอิง',
      headingEn: '/ REFERENCE',
      // ชุดคำและลำดับต้องตรงกับใบเสนอราคา/ใบสั่งขาย/ไทม์ไลน์ ไม่งั้นลูกค้าได้ชุดเอกสาร
      // ที่เรียกของอย่างเดียวกันคนละชื่อ — "โครงการ" บนเอกสาร = ดีล ส่วนเลขที่โครงการ
      // เป็นรหัส PJ ของโครงการแม่ (มติผู้ใช้ 2026-08-05)
      // ค่าตรึงอยู่บนใบตั้งแต่ตอนสร้าง (mig 0211) ไม่ได้ join สดตอนพิมพ์
      rows: [
        { label: 'เลขที่โครงการ', value: order.projectCode },
        { label: 'โครงการ', value: order.dealTitle },
        { label: 'ประเภทโครงการ', value: order.dealType },
        { label: 'เลขที่ใบเสนอราคา', value: order.quotationRef },
        { label: 'เลขที่ใบสั่งซื้อ (PO)', value: order.poReference },
      ],
    },
  });

  const watermark = watermarkBlock(order.watermark || STATUS_WATERMARKS[order.status]);
  const pages = paginateBillLines(lines);
  let lineOffset = 0;
  const documentPages = pages.map((pageLines, pageIndex) => {
    const startIndex = lineOffset;
    lineOffset += pageLines.length;
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === pages.length - 1;
    // `explicit-page` = หน้าที่ตัดเองล่วงหน้าด้วย paginateBillLines ไม่ได้ปล่อยให้
    // เบราว์เซอร์ตัด (ต่างจากเอกสารที่ไหลต่อเนื่อง) — เทสต์นับจำนวนหน้าจากคลาสนี้
    return `
    <article class="sheet explicit-page" aria-label="${esc(titleTh)} หน้า ${pageIndex + 1}">
      ${watermark}
      ${header}
      <div class="sheetContent">
        ${isFirstPage ? party : ''}
        ${!isFirstPage ? `<div class="continuation">รายการต่อ · ${val(noticeNumber)}</div>` : ''}
        ${itemTable(pageLines, startIndex)}
        ${isLastPage ? totalsSection({ totalTax, vat, grand }) : ''}
        ${isLastPage ? `<p class="noteLine">หมายเหตุ: เอกสารนี้เรียกเก็บเฉพาะค่าภาษีสรรพสามิตและภาษีบำรุงท้องถิ่นที่บริษัทชำระแทนลูกค้า ไม่รวมราคาสินค้า</p>` : ''}
        ${isLastPage ? signatures() : ''}
      </div>
      ${documentFooter({ left: co.legalNameTh, center: `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`, right: `หน้า ${pageIndex + 1} / ${pages.length}` })}
    </article>`;
  }).join('');

  return renderDocumentHTML({
    // title = ชื่อไฟล์ตอน "พิมพ์ → บันทึกเป็น PDF" (รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล)
    // ชื่อดีลใช้ค่าที่ตรึงบนใบ (mig 0211) ไม่ใช่ join สด — ชื่อไฟล์ของใบเก่าจะได้ไม่เปลี่ยน
    title: documentFileName(noticeNumber, customer.name || order.customerName, order.dealTitle),
    accentKey: resolveDocumentAccentKey(standard, NOTICE_KEY),
    variantClass: 'tax',
    extraCss: NOTICE_CSS,
    toolbar: options.toolbar === false ? null : { label: `${titleTh} ${noticeNumber}`, button: '🖨 สั่งพิมพ์ / บันทึก PDF' },
    pages: documentPages,
  });
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

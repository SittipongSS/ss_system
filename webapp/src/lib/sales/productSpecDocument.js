// ── เอกสารใบสเปคสินค้า FM-SA-04 — เปลือกเดียวกับใบเสนอราคา ─────────────────
//
// ⭐ **มติผู้ใช้ 2026-09-17: "เอกสาร 04/07 ต้องใช้ template เดียวกับใบเสนอราคา"**
// ⇒ ประกอบจาก `lib/documents/documentShell.js` ตัวเดียวกับที่ QT/SO/สัญญา/PDR/ใบภาษีใช้
// **ห้ามเขียน CSS ชุดใหม่** — คอมเมนต์หัวเปลือกเล่าไว้ว่าเอกสารสามชนิดเคยต่างคนต่างเขียน
// แล้วเพี้ยนหากันจนคนละฟอนต์คนละหน่วย
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มเขียนว่า "พิมพ์" ไม่ใช่ "ดาวน์โหลด"
//
// ── สามเลขบนกระดาษ อย่าสลับกัน ──────────────────────────────────────────
//   `FM-SA-04: Rev. No.00` มุมซ้าย = เวอร์ชันของ **แบบฟอร์ม** (document_standard_versions)
//   `Document No.`                  = เลขรันของ **การออกครั้งนี้** (product_spec_issues.docNo)
//   `Reversion No.`                 = เวอร์ชัน **สเปกของสินค้า** (product_spec_revisions.revNo)
import {
  documentFooter, documentHeader, esc, partyGrid, renderDocumentHTML,
} from '@/lib/documents/documentShell';
import {
  resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { PRODUCT_SPEC_CERT_STATUS_LABELS, productSpecCertPendingLabel } from '@/lib/sales/productSpecChecklist';
import { illustrationCaption, sortIllustrations } from '@/lib/sales/productSpecIllustrations';

const SPEC_KEY = 'productSpec';

const TICK_ON = '☑';
const TICK_OFF = '☐';

// ⭐ ช่องที่ไม่ได้กรอกพิมพ์ N/A (กติกาเดียวกับ PDR) — เส้นว่างอ่านกำกวมว่า "ยังไม่กรอก"
// หรือ "ไม่เกี่ยวกับใบนี้" · ยกเว้นช่องลายเซ็นซึ่งต้องเว้นไว้ให้เซ็นมือ
const NA = '<span class="na">N/A</span>';
const cell = (value) => (value == null || String(value).trim() === '' ? NA : esc(value));

/* ── ต้นทุนความสูงต่อบล็อก (มม. บนกระดาษ A4) ────────────────────────────
 *
 * ⚠️ **วัดจากหน้าที่เรนเดอร์จริง ไม่ใช่คำนวณจากสูตร** — วิธีวัดและกับดักอยู่ที่หัวไฟล์
 * `lib/requests/pdrDocument.js` (อ่าน `offsetHeight` ไม่ใช่ `getBoundingClientRect`
 * เพราะเปลือกย่อทั้งแผ่นด้วย `zoom`)
 *
 * ⚠️ ล้นหน้าแล้ว **เนื้อหาหายเงียบ** เพราะ `.sheet` ของเปลือกเป็น `overflow: hidden`
 * ⇒ ต้นทุนที่ตั้งต่ำเกินจริงกินข้อมูลทิ้ง ส่วนตั้งสูงเกินแค่ทำให้หน้าหลวม
 * ⇒ **เลือกทางประเมินสูงเสมอ**
 *
 * รอบวัด 2026-09-17 (headless Chrome · zoom 1 · อ่าน `offsetHeight` ของบล็อกจริง)
 *   หัวเอกสาร + เส้นคั่น                     54.8mm
 *   `.sheetContent` แผ่นที่มีหัว   clientHeight 221.2 ⇒ หัก padding เอง (5+4) = 212.2
 *   `.sheetContent` แผ่นที่ไม่มีหัว clientHeight 276.0 ⇒ หัก padding เอง (5+4) = 267.0
 *   กล่องคู่สัญญา/อ้างอิง (`.partyGrid`)      31.75mm — **อยู่แผ่นแรกแผ่นเดียว**
 *   หัวข้อ `h3`  6.09 + margin (5 + 1.6)     ⇒ 12.7
 *   แถว `table.kv` · แถว checklist            7.41
 *   หัวตาราง checklist (สองบรรทัด)           12.44
 *   หัวตาราง cert · แถว cert (สองบรรทัด)      7.41 · 12.44
 *   ผู้ประสานงาน 12.44 + ลายเซ็น 29.37 + h3 สองอัน
 *
 * ⇒ งบแผ่นแรก 212.2 − 31.75 (กล่องคู่สัญญา) = 180.4 ⇒ ตั้ง **173** (เผื่อ 7.4mm)
 * ⇒ งบแผ่นถัดไป 267.0 ⇒ ตั้ง **259** (เผื่อ 8mm · เท่ากับ PDR)
 *
 * 🪤 **กล่องคู่สัญญาไม่ได้อยู่ในลิสต์ที่ paginate เห็น** (ผู้เรียกวางไว้บนสุดของแผ่นแรก
 *   ตรง ๆ) ⇒ ต้องหักออกจากงบแผ่นแรก ไม่ใช่ปล่อยให้โมเดลมองไม่เห็น · รอบแรกลืมหัก
 *   แล้วแผ่นแรกล้น 230.7 > 221.2 ซึ่ง `.sheet` ตัดทิ้งเงียบ ๆ
 * 🪤 **หัวตารางก็กินที่** — ตารางที่ขึ้นหน้าใหม่พิมพ์หัวซ้ำเสมอ ⇒ คิดต้นทุนหัวให้แถวแรก
 *   ของทุกกลุ่ม และให้หัวข้อ "(ต่อ)" ด้วย
 */
const PAGE_MM = 173;
const PAGE_REST_MM = 259;
export const PRODUCT_SPEC_PAGE_BUDGET_MM = { first: PAGE_MM, rest: PAGE_REST_MM };

const COST = Object.freeze({
  heading: 12.7,       // หัวข้อ 6.09 + margin (5 + 1.6)
  row: 7.95,           // แถว kv / แถว checklist หนึ่งบรรทัด (วัดได้ 7.41)
  checklistHead: 13.2, // หัวตาราง checklist สองบรรทัด (วัดได้ 12.44)
  certHead: 8.2,       // หัวตาราง cert หนึ่งบรรทัด (วัดได้ 7.41)
  certRow: 13.2,       // แถว cert มีสองบรรทัดสถานะเสมอ (วัดได้ 12.44)
  signatures: 40,      // ตารางลายเซ็น 4 ช่อง (29.37) + หัวข้อของตัวเอง
  contact: 20,         // ตารางผู้ประสานงาน (12.44) + หัวข้อของตัวเอง
  /* แถวภาพ (สองภาพต่อแถว) — กรอบสูงคงที่ 70mm + คำบรรยายจองสองบรรทัด + ระยะแถว
     ⚠️ **กรอบสูงคงที่โดยตั้งใจ** — ถ้าปล่อยให้สูงตามสัดส่วนรูปที่ลูกค้าส่งมา
     ความสูงต่อแถวจะเดาไม่ได้ แล้วแผ่นล้นเงียบ ๆ ใต้ `overflow: hidden` */
  figureRow: 86,
});

// ข้อความยาวตกบรรทัด — ช่องค่ากว้าง ~118mm ที่ 8.4pt ≈ 75 ตัวอักษรไทยต่อบรรทัด
const wrapCost = (text, perLine = 75) => Math.max(0, Math.ceil(String(text || '').length / perLine) - 1) * 4.8;

const kvRow = (label, value) => `<tr><th>${esc(label)}</th><td>${cell(value)}</td></tr>`;

function checklistRows(items = []) {
  return items.map((row, index) => `
    <tr>
      <td class="no">${index + 1}</td>
      <td>${cell(row.itemLabel)}</td>
      <td>${cell(row.detail)}</td>
      <td class="tick">${row.preparedByS ? TICK_ON : TICK_OFF}</td>
      <td class="tick">${row.preparedByCustomer ? TICK_ON : TICK_OFF}</td>
      <td>${cell(row.note)}</td>
    </tr>`);
}

const CHECKLIST_HEAD = `<thead><tr>
  <th class="no">ลำดับ</th><th>สิ่งที่ต้องเตรียม</th><th>รายละเอียด</th>
  <th class="tick">S&amp;S</th><th class="tick">ลูกค้า</th><th>หมายเหตุ</th>
</tr></thead>`;

const CERT_HEAD = `<thead><tr>
  <th>เอกสารที่สามารถขอได้</th><th>สถานะ</th><th>หมายเหตุ</th>
</tr></thead>`;

function certRows(rows = []) {
  return rows.map((row) => {
    const ready = row.status === 'ready';
    const pending = row.status === 'in_progress';
    return `
    <tr>
      <td>${cell(row.label)}</td>
      <td class="status">
        <span>${ready ? TICK_ON : TICK_OFF} ${esc(PRODUCT_SPEC_CERT_STATUS_LABELS.ready)}</span>
        <span>${pending ? TICK_ON : TICK_OFF} ${esc(productSpecCertPendingLabel(row.key))}</span>
      </td>
      <td>${cell(row.note)}</td>
    </tr>`;
  });
}

/* ⚠️ ลายเซ็นพิมพ์ **ชื่อที่ระบบรู้** แต่เว้นช่องเซ็นไว้เสมอ — กระดาษใบนี้ต้องเซ็นมือ
   ⚠️ แถว Customer ไม่มีชื่อในระบบโดยตั้งใจ (ลูกค้าเซ็นนอกระบบแล้วอัปไฟล์กลับ)
   ⚠️ ช่อง Account Executive = **ผู้ยื่นอนุมัติ** ตั้งแต่ 0369 ที่ยุบขั้น "AE ตรวจ" ออก ·
      ถอยไปอ่าน `reviewedByName` ให้ฉบับเก่าที่เดินเส้นสี่ขั้นจริง (ชื่อคนตรวจของใบนั้น
      ยังอยู่ในฐาน — กระดาษที่พิมพ์ซ้ำต้องอ่านเหมือนวันที่ส่งไป) */
function signatureBlock(revision, issue) {
  const box = (role, name, date) => `
    <div class="sig">
      <b>${esc(role)}</b>
      <div class="sigSpace"></div>
      <span>${name ? esc(name) : '&nbsp;'}</span>
      <small>${date ? esc(date) : '&nbsp;'}</small>
    </div>`;
  return `<h3>Final Review &amp; Approval</h3>
    <div class="sigs">
      ${box('Account Coordinator', revision?.createdByName, issue?.createdDateText)}
      ${box('Account Executive', revision?.submittedByName || revision?.reviewedByName,
    issue?.submittedDateText || issue?.reviewedDateText)}
      ${box('Account Executive Supervisor', revision?.approvedByName, issue?.approvedDateText)}
      ${box('Customer', '', '')}
    </div>`;
}

/* กล่องภาพหนึ่งใบ — กรอบสูงคงที่ · คำบรรยายใต้ภาพ · เลขลำดับนำหน้าเสมอ
   ⚠️ ไม่มีคำบรรยาย = พิมพ์แค่เลขลำดับ ไม่ใช่ N/A — ใต้ภาพที่เห็นอยู่แล้วว่าเป็นรูปอะไร
   คำว่า N/A อ่านเหมือนภาพนั้นผิด */
function figureBlock(row, number) {
  const caption = illustrationCaption(row);
  return `
    <figure class="fig">
      <div class="figBox"><img src="/api/master/attachments/${esc(row.id)}/file" alt="${esc(caption || `ภาพประกอบที่ ${number}`)}" /></div>
      <figcaption>${esc(`${number}. ${caption}`.trim().replace(/\.$/, '.'))}</figcaption>
    </figure>`;
}

function contactBlock(contact) {
  return `<h3>Contact for Sales</h3>
    <table class="kv contact">
      <tr>
        <th>เจ้าหน้าที่ประสานงานลูกค้า</th>
        <td>${cell(contact?.name)}</td>
        <th>อีเมล</th>
        <td>${cell(contact?.email)}</td>
        <th>เบอร์โทร / LINE</th>
        <td>${cell(contact?.phone)}</td>
      </tr>
    </table>`;
}

/* แบ่งหน้า — กติกาเดียวกับ PDR: หัวข้อกินที่ของตัวเอง + แถวแรกที่ต้องตามไปด้วย
   และหน้าใหม่ที่ตัดกลางหัวข้อเปิดด้วยหัวข้อเดิม + "(ต่อ)" */
function paginate(items) {
  const pages = [];
  let page = [];
  let used = 0;
  const budget = () => (pages.length === 0 ? PAGE_MM : PAGE_REST_MM);
  for (const item of items) {
    const cost = item.cost + (item.type === 'heading' ? COST.row : 0);
    if (page.length && used + cost > budget()) {
      pages.push(page);
      page = [];
      used = 0;
      if (item.heading) {
        page.push({ type: 'heading', section: item.section, html: `<h3>${esc(item.heading)} (ต่อ)</h3>`, cost: COST.heading });
        // หน้าใหม่พิมพ์หัวตารางซ้ำ ⇒ ต้องคิดที่ของมันด้วย ไม่งั้นหน้าท้าย ๆ ล้นทีละนิด
        used += COST.heading + (item.headCost || 0);
      }
    }
    page.push(item);
    used += item.cost;
  }
  if (page.length) pages.push(page);
  return pages;
}

/* รวมแถวที่ติดกันของตารางเดียวกันให้อยู่ใน <table> เดียว — แถวลอยนอก <table> ไม่แสดงผล
   ⚠️ ต้องแยกตามชนิดตาราง (kv · checklist · cert) เพราะหัวตารางคนละชุด */
function renderPage(items) {
  const out = [];
  let open = null;
  let openKind = null;
  const close = () => { if (open) { out.push(`${open}</table>`); open = null; openKind = null; } };
  for (const item of items) {
    if (item.type === 'row') {
      if (open && openKind !== item.table) close();
      if (!open) {
        openKind = item.table;
        open = item.table === 'kv'
          ? '<table class="kv">'
          : `<table class="${item.table}">${item.table === 'checklist' ? CHECKLIST_HEAD : CERT_HEAD}`;
      }
      open += item.tr;
      continue;
    }
    close();
    out.push(item.html);
  }
  close();
  return out.join('');
}

/**
 * ประกอบเอกสาร FM-SA-04 หนึ่งฉบับ
 *
 * @param {object} input
 * @param {object} input.issue     แถว product_spec_issues (snapshot รอบขาย + docNo)
 * @param {object} input.revision  ฉบับสเปกที่กระดาษใบนี้อ้าง (พร้อม items)
 * @param {object} input.product   สินค้า (ชื่อ · หมวด · ขนาด · กลิ่น)
 * @param {object} input.company   บล็อกบริษัทจาก resolveCompanyBlock
 * @param {object|null} input.standard แถว document_standard_versions ที่เผยแพร่
 */
export function renderProductSpecDocument({
  issue, revision, product, company = {}, contact = null, standard = null,
  illustrations = [], toolbar = true,
}) {
  const form = resolveDocumentForm(standard, SPEC_KEY);
  const titleTh = resolveDocumentTitleTh(standard, SPEC_KEY);
  const formLine = `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;
  const revText = String(issue?.revNo ?? revision?.revNo ?? '').padStart(2, '0');

  const header = documentHeader({
    company,
    formLine,
    titleTh,
    titleEn: form.title,
    rows: [
      { label: 'Document No.', value: issue?.docNo },
      { label: 'Reversion No.', value: revText },
      { label: 'วันที่จัดทำ', value: issue?.createdDateText },
    ],
  });

  const party = partyGrid({
    party: {
      heading: 'ลูกค้า',
      headingEn: 'Customer',
      name: issue?.customerName || product?.customerName,
      rows: [
        { label: 'ชื่อแบรนด์', value: issue?.brandName || product?.brandName },
      ],
    },
    reference: {
      heading: 'อ้างอิง',
      headingEn: 'Reference',
      rows: [
        { label: 'ใบเสนอราคา / ใบสั่งขาย', value: [issue?.quotationNumber, issue?.orderNumber].filter(Boolean).join(' / ') },
        { label: 'กำหนดส่งสินค้า', value: issue?.deliveryDueDateText },
        { label: 'จำนวน', value: [issue?.qty, issue?.unit].filter(Boolean).join(' ') },
      ],
    },
  });

  const items = [];
  const pushRows = (section, heading, table, rows, costOf, headCost = 0) => {
    if (!rows.length) return;
    items.push({ type: 'heading', section, heading, html: `<h3>${esc(heading)}</h3>`, cost: COST.heading + headCost });
    rows.forEach((tr, index) => {
      items.push({ type: 'row', section, heading, table, tr, headCost, cost: costOf(index) });
    });
  };

  const overview = [
    kvRow('ชื่อผลิตภัณฑ์', product?.productDescription),
    kvRow('รหัสสินค้า', product?.fgCode),
    kvRow('ประเภทผลิตภัณฑ์', product?.categoryName),
    kvRow('กลิ่น / รหัสกลิ่น', product?.scentText),
    kvRow('ขนาดบรรจุ (Size)', product?.volumeText),
    kvRow('ลักษณะเนื้อสาร', revision?.texture),
    kvRow('บรรจุภัณฑ์มาตรฐาน', revision?.standardPackaging),
  ];
  const overviewTexts = [
    product?.productDescription, product?.fgCode, product?.categoryName, product?.scentText,
    product?.volumeText, revision?.texture, revision?.standardPackaging,
  ];
  pushRows('overview', 'Product Overview', 'kv', overview,
    (index) => COST.row + wrapCost(overviewTexts[index]));

  const market = [
    kvRow('กลุ่มเป้าหมาย (Target Group)', revision?.targetGroup),
    kvRow('จุดขายหลัก (Key Selling Point)', revision?.keySellingPoint),
    kvRow('ระดับราคา (Pricing Tier)', revision?.pricingTier),
  ];
  const marketTexts = [revision?.targetGroup, revision?.keySellingPoint, revision?.pricingTier];
  pushRows('market', 'Market Positioning', 'kv', market,
    (index) => COST.row + wrapCost(marketTexts[index]));

  const functional = [
    kvRow('ประสิทธิภาพหลัก (Product Benefit)', revision?.productBenefit),
    kvRow('ระยะเวลาการออกฤทธิ์กลิ่น', revision?.longevity),
    kvRow('ปริมาณแนะนำต่อการใช้งาน', revision?.dosagePerUse),
  ];
  const functionalTexts = [revision?.productBenefit, revision?.longevity, revision?.dosagePerUse];
  pushRows('functional', 'Functional Information', 'kv', functional,
    (index) => COST.row + wrapCost(functionalTexts[index]));

  const checkItems = revision?.items || [];
  pushRows('checklist', 'Checklist Project', 'checklist', checklistRows(checkItems),
    (index) => COST.row
      + wrapCost(checkItems[index]?.detail, 34)
      + wrapCost(checkItems[index]?.note, 24),
    COST.checklistHead);

  const certs = Array.isArray(revision?.certifications) ? revision.certifications : [];
  pushRows('cert', 'Certification & Documents', 'cert', certRows(certs),
    (index) => COST.certRow + wrapCost(certs[index]?.note, 40),
    COST.certHead);

  /* ── ภาพประกอบ (แผ่นท้าย) ────────────────────────────────────────────────
     ⚠️ **สองภาพต่อแถว และคิดต้นทุนเป็นแถว ไม่ใช่เป็นภาพ** — คิดเป็นภาพแล้วแถวที่มี
     ภาพเดียวจะถูกคิดครึ่งเดียวทั้งที่กินที่เต็มแถว
     ⚠️ ภาพดึงผ่าน `/api/master/attachments/[id]/file` ซึ่งเป็นทางเดียวที่ระบบเสิร์ฟ
     ไฟล์แนบ · รูปที่โหลดไม่ขึ้นต้องเหลือกรอบพร้อมข้อความ ไม่ใช่ช่องว่างเปล่า */
  const figures = sortIllustrations(illustrations);
  if (figures.length) {
    items.push({
      type: 'heading', section: 'figures', heading: 'ภาพประกอบรายละเอียดสินค้า',
      html: '<h3>ภาพประกอบรายละเอียดสินค้า</h3>', cost: COST.heading,
    });
    for (let index = 0; index < figures.length; index += 2) {
      const pair = figures.slice(index, index + 2);
      items.push({
        type: 'atom',
        section: 'figures',
        heading: 'ภาพประกอบรายละเอียดสินค้า',
        html: `<div class="figGrid">${pair.map((row, offset) => figureBlock(row, index + offset + 1)).join('')}</div>`,
        cost: COST.figureRow,
      });
    }
  }

  /* ⚠️ ผู้ประสานงานกับตารางลายเซ็นเป็น **ก้อนเดียว** — แยกกันเมื่อไรมีโอกาสที่ตาราง
     ลายเซ็นหลุดไปอยู่หน้าใหม่ตัวเดียว ซึ่งอ่านแล้วไม่รู้ว่าเซ็นรับรองอะไร */
  items.push({
    type: 'atom',
    section: 'signers',
    html: `${contactBlock(contact)}${signatureBlock(revision, issue)}`,
    cost: COST.contact + COST.signatures,
  });

  const pages = paginate(items);
  /* หัวเอกสารและกล่องคู่สัญญาอยู่แผ่นแรกแผ่นเดียว (กติกาเดียวกับ PDR หลัง IS-26080030)
     ⚠️ แผ่นที่ไม่มีหัวต้องบอกได้เองว่าเป็นใบไหนถ้าหลุดจากปึก ⇒ ท้ายกระดาษแบกหน้าที่นั้น */
  const footerCenter = [formLine, issue?.docNo].filter(Boolean).join(' · ');
  const sheets = pages.map((pageItems, index) => `
    <article class="sheet explicit-page" aria-label="${esc(titleTh)} หน้า ${index + 1}">
      ${index === 0 ? header : ''}
      <div class="sheetContent">${index === 0 ? party : ''}${renderPage(pageItems)}</div>
      ${documentFooter({
    left: company.legalNameTh,
    center: footerCenter,
    right: `หน้า ${index + 1} / ${pages.length}`,
  })}
    </article>`).join('');

  return renderDocumentHTML({
    title: `FM-SA-04 ${issue?.docNo || ''}`.trim(),
    accentKey: resolveDocumentAccentKey(standard, SPEC_KEY),
    variantClass: 'specsheet',
    pages: sheets,
    toolbar: toolbar === false ? null : { label: `${titleTh} (FM-SA-04)`, button: 'พิมพ์เอกสาร' },
    extraCss: `
      .specsheet .sheetContent { gap: 0; padding-top: 5mm; }
      .specsheet h3 { margin: 5mm 0 1.6mm; color: var(--doc-navy); font-size: 10.5pt; }
      .specsheet .sheetContent > h3:first-child { margin-top: 0; }
      .specsheet .na { color: var(--doc-muted); font-style: italic; }
      .specsheet .no { color: var(--doc-accent); font-weight: 600; text-align: center; }

      .specsheet table { width: 100%; table-layout: fixed; border-collapse: collapse; }
      .specsheet table th, .specsheet table td {
        padding: 1.2mm 2mm; border: 0.2mm solid var(--doc-line);
        font-size: 8.4pt; line-height: 1.65; text-align: left; vertical-align: top;
        overflow-wrap: anywhere;
      }
      .specsheet table.kv th { width: 38%; background: var(--doc-accent-soft); font-weight: 600; }
      .specsheet table.kv.contact th { width: 16%; }
      .specsheet table.checklist thead th, .specsheet table.cert thead th {
        background: var(--doc-accent-soft); font-weight: 600;
      }
      .specsheet table.checklist th.no, .specsheet table.checklist td.no { width: 9mm; }
      .specsheet table.checklist th.tick, .specsheet table.checklist td.tick { width: 12mm; text-align: center; }
      .specsheet table.cert th:first-child { width: 34%; }
      .specsheet table.cert .status span { display: block; }

      .specsheet .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 2mm; }
      .specsheet .sig {
        border: 0.2mm solid var(--doc-line); border-radius: 1mm; padding: 2mm;
        font-size: 8pt; line-height: 1.65;
      }
      .specsheet .sig b { display: block; color: var(--doc-accent); font-size: 7.2pt; letter-spacing: .02em; }
      .specsheet .sigSpace { height: 9mm; border-bottom: 0.2mm dotted var(--doc-muted); margin: 2mm 0 1.4mm; }
      .specsheet .sig small { display: block; color: var(--doc-muted); }

      /* แผ่นภาพประกอบ — กรอบสูงคงที่ ภาพย่อลงในกรอบโดยไม่บิดสัดส่วน */
      .specsheet .figGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm 5mm; margin: 2mm 0 4mm; }
      .specsheet .fig { margin: 0; }
      .specsheet .figBox {
        height: 70mm; border: 0.2mm solid var(--doc-line); border-radius: 1mm;
        background: var(--doc-accent-soft); display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .specsheet .figBox img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .specsheet .fig figcaption {
        margin-top: 1.6mm; min-height: 2.6em; font-size: 8.4pt; line-height: 1.65; color: var(--doc-text);
      }
    `,
  });
}

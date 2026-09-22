// ── เอกสารใบสเปคสินค้า FM-SA-04 — เปลือกเดียวกับใบเสนอราคา ─────────────────
//
// ⭐ **มติผู้ใช้ 2026-09-17: "เอกสาร 04/07 ต้องใช้ template เดียวกับใบเสนอราคา"**
// ⇒ ประกอบจาก `lib/documents/documentShell.js` ตัวเดียวกับที่ QT/SO/สัญญา/PDR/ใบภาษีใช้
// **ห้ามเขียน CSS ชุดใหม่** — คอมเมนต์หัวเปลือกเล่าไว้ว่าเอกสารสามชนิดเคยต่างคนต่างเขียน
// แล้วเพี้ยนหากันจนคนละฟอนต์คนละหน่วย
//
// ⭐ **มติเจ้าของ 21/09/2569 (docs/fm-sa-04-document-model.md)** — กระดาษพิมพ์จาก
// **ภาพนิ่ง** (`snapshot` ของ Rev) เท่านั้น ไม่อ่านฐานเอง · ตัวนี้เป็นฟังก์ชันบริสุทธิ์
//   · เอกสารที่ยื่นแล้ว = ภาพนิ่งที่ถ่ายตอนยื่น · ร่าง = ภาพนิ่งสดที่ผู้เรียกถ่ายให้ตอนนี้
//     (`buildDocumentSnapshot` ตัวเดียวกัน) · ตัวอย่างจากหน้าสินค้า = ภาพนิ่งสดที่ไม่มี SO
//   ⇒ ร่างกับฉบับอนุมัติพิมพ์จากก้อนรูปเดียวกัน หน้าตาจึงไม่ต่างกันเอง
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มเขียนว่า "พิมพ์" ไม่ใช่ "ดาวน์โหลด"
//
// ── สามเลขบนกระดาษ อย่าสลับกัน ──────────────────────────────────────────
//   `FM-SA-04: Rev. No.00` มุมซ้าย = เวอร์ชันของ **แบบฟอร์ม** (document_standard_versions)
//   `Document No.`                  = เลขที่ของ **เอกสาร** (product_spec_documents.docNo)
//                                     หนึ่งใบต่อบรรทัด SO · Rev ใหม่ยังเลขที่เดิม
//   `Reversion No.`                 = Rev ของ **เอกสาร** (product_spec_document_revisions.revNo)
//                                     ไม่ใช่ของสเปค — สเปคในฐานไม่มี Rev แล้วตั้งแต่ 0370
import {
  documentFileName, documentFooter, documentHeader, esc, partyGrid, renderDocumentHTML, watermarkBlock,
} from '@/lib/documents/documentShell';
import {
  resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { BUDDHIST_YEAR_OFFSET, fmtDateNumeric, fmtNumber } from '@/lib/format';
import { PRODUCT_SPEC_CERT_STATUS_LABELS, productSpecCertPendingLabel } from '@/lib/sales/productSpecChecklist';
import {
  illustrationCaption, snapshotIllustrationRows, sortIllustrations,
} from '@/lib/sales/productSpecIllustrations';
import { formatRevLabel } from '@/lib/sales/productSpecDocWorkflow';
import { productBrandName, productDisplayName } from '@/lib/master/productIdentity';

const SPEC_KEY = 'productSpec';

/* รุ่นของตัวเรนเดอร์ที่ประทับลง `rendererVersion` ตอนตรึงกระดาษ (0370 · ≤ 40 ตัวอักษร)
   ⚠️ **ขยับเมื่อหน้าตากระดาษเปลี่ยน** (ช่อง · ลำดับ · งบหน้า) — กระดาษที่ตรึงแล้วไม่เรนเดอร์ใหม่
   ค่านี้คือทางเดียวที่บอกได้ว่าแผ่นไหนออกจากตัวเรนเดอร์รุ่นไหน */
export const PRODUCT_SPEC_RENDERER_VERSION = 'fm-sa-04@2026-09-22';

const TICK_ON = '☑';
const TICK_OFF = '☐';

// ⭐ ช่องที่ไม่ได้กรอกพิมพ์ N/A (กติกาเดียวกับ PDR) — เส้นว่างอ่านกำกวมว่า "ยังไม่กรอก"
// หรือ "ไม่เกี่ยวกับใบนี้" · ยกเว้นช่องลายเซ็นซึ่งต้องเว้นไว้ให้เซ็นมือ
const NA = '<span class="na">N/A</span>';
const cell = (value) => (value == null || String(value).trim() === '' ? NA : esc(value));

/* ── ลายน้ำ (มติ 21/09) ───────────────────────────────────────────────────
 *   draft · pending_* · rejected = "ฉบับร่าง" · superseded = "ถูกแทนด้วย Rev.XX"
 *   เอกสาร void = "ยกเลิก" (ชนะทุกสถานะของ Rev) · approved = ไม่มี
 *   ตัวอย่างจากหน้าสินค้า (ยังไม่มีเอกสาร) = "ตัวอย่าง"
 * ⚠️ สถานะที่ไม่รู้จักได้ "ฉบับร่าง" — กระดาษเปล่าไร้ลายน้ำต้องเป็นฉบับอนุมัติเท่านั้น
 *    ตกหล่นทางไหนก็ต้องไม่กลายเป็นกระดาษที่อ่านเหมือนเซ็นรับรองแล้ว */
export const PRODUCT_SPEC_WATERMARKS = Object.freeze({
  draft: 'ฉบับร่าง',
  void: 'ยกเลิก',
  sample: 'ตัวอย่าง',
});

export function supersededWatermark(revNo) {
  const label = formatRevLabel(revNo);
  return label === '—' ? 'ถูกแทนด้วย Rev. ใหม่' : `ถูกแทนด้วย ${label}`;
}

/**
 * ข้อความลายน้ำของกระดาษหนึ่งแผ่น — `null` = ไม่มีลายน้ำ (ฉบับอนุมัติที่ยังใช้อยู่)
 *
 * @param {object} input
 * @param {boolean} [input.sample]            พิมพ์ตัวอย่างจากหน้าสินค้า (ยังไม่มีเอกสาร)
 * @param {object}  [input.document]          `{ status }` ของ product_spec_documents
 * @param {object}  [input.revision]          `{ status }` ของ Rev ที่พิมพ์
 * @param {number}  [input.supersededByRevNo] Rev ที่มาแทน (เมื่อ Rev นี้ superseded)
 */
export function productSpecWatermark({
  sample = false, document = null, revision = null, supersededByRevNo = null,
} = {}) {
  if (sample) return PRODUCT_SPEC_WATERMARKS.sample;
  if (document?.status === 'void') return PRODUCT_SPEC_WATERMARKS.void;
  if (revision?.status === 'approved') return null;
  if (revision?.status === 'superseded') return supersededWatermark(supersededByRevNo);
  return PRODUCT_SPEC_WATERMARKS.draft;
}

/* ช่องลายน้ำในแต่ละแผ่น — กระดาษที่ตรึงแล้ว (`frozenHtml`) ถูกเรนเดอร์ตอนอนุมัติจึงไม่มีลายน้ำ
   ⭐ พอ Rev ถูกแทน หรือเอกสารถูกยกเลิกทีหลัง ต้อง **ประทับลายน้ำทับ** โดยไม่แตะเนื้อที่ตรึงไว้
   ⇒ ทุกแผ่นมีช่องที่มีเครื่องหมายหัวท้าย ให้ `applyProductSpecWatermark` แทนที่ได้แม่นยำ
   ⚠️ ค่าที่มาจากผู้ใช้ถูก escape หมด (`<` → `&lt;`) ⇒ เครื่องหมายนี้ปลอมจากเนื้อหาไม่ได้ */
const WATERMARK_OPEN = '<!--psd:watermark-->';
const WATERMARK_CLOSE = '<!--/psd:watermark-->';
const WATERMARK_SLOT = /<!--psd:watermark-->[\s\S]*?<!--\/psd:watermark-->/g;
const SHEET_OPEN = /(<article class="sheet[^"]*"[^>]*>)/g;

const watermarkSlot = (text) => `${WATERMARK_OPEN}${watermarkBlock(text)}${WATERMARK_CLOSE}`;

/**
 * ประทับลายน้ำลงกระดาษที่เรนเดอร์แล้ว (ส่วนใหญ่คือ `frozenHtml`) — ไม่มีข้อความ = คืนของเดิมทุกไบต์
 *
 * ⚠️ แทน "ช่องลายน้ำ" เท่านั้น เนื้อกระดาษที่ลูกค้าเซ็นไม่ถูกแตะ · กระดาษที่ไม่มีช่อง (ตัวเรนเดอร์
 *    รุ่นอื่น) ถอยไปวางต่อจากแท็กเปิดของแต่ละแผ่นแทน — ลายน้ำหายเงียบแย่กว่าวางผิดที่เล็กน้อย
 */
export function applyProductSpecWatermark(html, text) {
  const source = String(html ?? '');
  if (!text) return source;
  if (source.includes(WATERMARK_OPEN)) return source.replace(WATERMARK_SLOT, watermarkSlot(text));
  return source.replace(SHEET_OPEN, `$1${watermarkBlock(text)}`);
}

/**
 * วันที่บนกระดาษ — **พ.ศ. ทั้งใบ** (มติ 21/09) · DD/MM/YYYY ตามนาฬิกาไทย
 *
 * ⚠️ ผ่าน `fmtDateNumeric` (วันไทยของจุดเวลา · วันในปฏิทินไม่ขยับโซน) แล้วค่อยบวกปี —
 *    ห้ามตัด `slice(0, 10)` จากจุดเวลาเอง ไม่งั้นกระดาษที่ยื่นช่วงตี 0–7 ได้วันที่ของเมื่อวาน
 * @returns {string|null} `null` = ไม่มีวันที่ (ช่องนั้นพิมพ์ขีด/ว่างตามบล็อก)
 */
export function productSpecDateText(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(fmtDateNumeric(value)).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[1]}/${match[2]}/${Number(match[3]) + BUDDHIST_YEAR_OFFSET}` : null;
}

/** Rev ของเอกสารบนหัวกระดาษ — เลขสองหลัก (`00`) · ไม่มี = `null` (หัวพิมพ์ขีด) */
export function productSpecRevText(revNo) {
  if (revNo === null || revNo === undefined || revNo === '' || !Number.isFinite(Number(revNo))) return null;
  return String(Number(revNo)).padStart(2, '0');
}

const qtyText = (qty, unit) => {
  if (qty === null || qty === undefined || qty === '') return null;
  const number = Number(qty);
  const text = Number.isFinite(number) ? fmtNumber(number) : String(qty);
  return [text, unit].filter(Boolean).join(' ');
};

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
 * ⭐ รอบรื้อ 0370 (2026-09-22) **ไม่เพิ่มแถว/บล็อก** — หัวยังสามแถว · กล่องคู่สัญญายังสามแถวอ้างอิง ·
 *   ช่องลายเซ็นยังชื่อ + วันที่ · ลายน้ำเป็น `position: absolute` ไม่กินที่ ⇒ ตัวเลขชุดวัดเดิมยังใช้ได้
 *   ⚠️ เพิ่มแถวในหัว/กล่องคู่สัญญาเมื่อไร ต้องวัดใหม่ ไม่ใช่เดา (เทสต์ตรึงเพดานไว้แล้ว)
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
  /* 🐞 สองตัวล่างเคยตั้ง 40 + 20 = 60 ทั้งที่ก้อนจริงสูง ~69.8 (วัด 2026-09-22: h3 12.7 + ตาราง
     ผู้ประสานงาน 12.7 · h3 12.7 + margin 2 + กล่องลายเซ็น 29.63) — ต่ำกว่าจริงเกินที่เผื่อไว้ต่อแผ่น
     (7–8mm) · ที่ยังไม่ล้นเพราะต้นทุนแถวอื่นเผื่อไว้ชดเชยพอดี ไม่ใช่เพราะตัวมันถูก
     ⚠️ ตาราง Contact for Sales **สองบรรทัดเป็นปกติ** — อีเมลบริษัทของเจ้าของดีล
     (`ชื่อ@scentandsense.co.th`) ล้นช่องกว้าง 16% ทุกครั้ง */
  signatures: 45,      // หัวข้อ 12.7 + margin 2 + ตารางลายเซ็น 4 ช่อง 29.63
  contact: 26,         // หัวข้อ 12.7 + ตารางผู้ประสานงานสองบรรทัด 12.7
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
   ⭐ สามช่องแรกคือราง 3 ขั้นของ Rev นี้ (มติ 21/09) — ชื่อ + วันที่มาจากตราประทับของ Rev เอง
      Account Coordinator = ผู้ยื่น (`submittedBy*`) · Account Executive = AE เจ้าของดีล
      (`aeApproved*`) · Account Executive Supervisor = `supApproved*`
   ⚠️ ขั้นที่ยังไม่ถึง = ชื่อว่าง ไม่ใช่ N/A — ช่องเซ็นต้องเว้นให้เซ็นมือเสมอ
   ⚠️ แถว Customer ไม่มีชื่อในระบบโดยตั้งใจ (ลูกค้าเซ็นนอกระบบ · ช่องเก็บไฟล์ที่เซ็นแล้วยังไม่มีจอ) */
function signatureBlock(revision) {
  const box = (role, name, at) => {
    const date = productSpecDateText(at);
    return `
    <div class="sig">
      <b>${esc(role)}</b>
      <div class="sigSpace"></div>
      <span>${name ? esc(name) : '&nbsp;'}</span>
      <small>${date ? esc(date) : '&nbsp;'}</small>
    </div>`;
  };
  return `<h3>Final Review &amp; Approval</h3>
    <div class="sigs">
      ${box('Account Coordinator', revision?.submittedByName, revision?.submittedAt)}
      ${box('Account Executive', revision?.aeApprovedByName, revision?.aeApprovedAt)}
      ${box('Account Executive Supervisor', revision?.supApprovedByName, revision?.supApprovedAt)}
      ${box('Customer', '', null)}
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
      <figcaption>${esc(`${number}. ${caption}`.trim())}</figcaption>
    </figure>`;
}

/* ⭐ Contact for Sales = **AE เจ้าของดีลของ SO** จากภาพนิ่ง (มติ 21/09) — ไม่ใช่คนที่เปิดดู
   🐞 เดิมพิมพ์ชื่อคนที่กดพิมพ์ ⇒ AC ที่พิมพ์ส่งลูกค้ากลายเป็นผู้ติดต่อฝ่ายขายบนกระดาษ
   ⚠️ ตัวอย่างจากหน้าสินค้ายังไม่มี SO ⇒ ไม่มีเจ้าของดีล ช่องพิมพ์ N/A */
function contactBlock(order) {
  return `<h3>Contact for Sales</h3>
    <table class="kv contact">
      <tr>
        <th>เจ้าหน้าที่ประสานงานลูกค้า</th>
        <td>${cell(order?.dealOwnerName)}</td>
        <th>อีเมล</th>
        <td>${cell(order?.dealOwnerEmail)}</td>
        <th>เบอร์โทร / LINE</th>
        <td>${cell(order?.dealOwnerPhone)}</td>
      </tr>
    </table>`;
}

/* แบ่งหน้า — กติกาเดียวกับ PDR: หัวข้อกินที่ของตัวเอง + แถวแรกที่ต้องตามไปด้วย
   และหน้าใหม่ที่ตัดกลางหัวข้อเปิดด้วยหัวข้อเดิม + "(ต่อ)"

   🐞 **"Checklist Project (ต่อ)" โผล่ทั้งที่ยังไม่มีแถวไหนถูกตัด** (พบตอนรื้อ 0370 · ใบมาตรฐาน
      17 แถวก็เจอ) — ของเดิมเติม "(ต่อ)" ให้ **ทุกชิ้น** ที่ขึ้นหน้าใหม่แล้วมี `heading` ติดมา
      ซึ่งรวมตัวหัวข้อเองด้วย ⇒ หัวข้อที่ขึ้นหน้าใหม่ได้ "Checklist Project (ต่อ)" ตามด้วย
      "Checklist Project" ซ้อนกัน · "(ต่อ)" ต้องเกิดเฉพาะตอนตัด **กลาง** หัวข้อเท่านั้น
   🐞 **หัวข้อค้างท้ายแผ่น** — ของเดิมเผื่อแถวแรกด้วยค่าคงที่ `COST.row` ทั้งที่แถวแรกจริง
      อาจสูงกว่ามาก (checklist ที่รายละเอียดยาว · แถวภาพ 86mm) ⇒ หัวข้อผ่านด่านแล้วแถวแรกไม่ผ่าน
      ได้หัวข้อลอยท้ายแผ่น + "(ต่อ)" บนแผ่นถัดไป · ตอนนี้เผื่อด้วย **ต้นทุนจริงของแถวแรก** */
function paginate(items) {
  const pages = [];
  let page = [];
  let used = 0;
  const budget = () => (pages.length === 0 ? PAGE_MM : PAGE_REST_MM);
  items.forEach((item, index) => {
    const next = items[index + 1];
    const keepWithNext = item.type === 'heading' && next && next.section === item.section ? next.cost : 0;
    if (page.length && used + item.cost + keepWithNext > budget()) {
      pages.push(page);
      page = [];
      used = 0;
      if (item.type !== 'heading' && item.heading) {
        page.push({ type: 'heading', section: item.section, html: `<h3>${esc(item.heading)} (ต่อ)</h3>`, cost: COST.heading });
        // หน้าใหม่พิมพ์หัวตารางซ้ำ ⇒ ต้องคิดที่ของมันด้วย ไม่งั้นหน้าท้าย ๆ ล้นทีละนิด
        used += COST.heading + (item.headCost || 0);
      }
    }
    page.push(item);
    used += item.cost;
  });
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
 * ประกอบกระดาษ FM-SA-04 หนึ่งฉบับจากภาพนิ่ง
 *
 * @param {object} input
 * @param {object} input.snapshot  ก้อนของ `buildDocumentSnapshot` (`spec` · `items` · `product` ·
 *                                 `order` · `illustrations` · `capturedAt`)
 * @param {object|null} input.document  แถว product_spec_documents (`docNo`) — `null` = ตัวอย่าง
 *                                      จากหน้าสินค้า (Document No. / Reversion No. พิมพ์ขีด)
 * @param {object|null} input.revision  Rev ที่พิมพ์ (`revNo` + ตราประทับสามขั้น)
 * @param {string|null} input.watermark ข้อความลายน้ำ (`productSpecWatermark`) · `null` = ไม่มี
 * @param {object} input.company   บล็อกบริษัทจาก `getPublishedCompanyProfile`/`resolveCompanyBlock`
 *                                 (คีย์ `legalNameTh`/`legalNameEn`)
 * @param {object|null} input.standard  แถว document_standard_versions ที่เผยแพร่
 */
export function renderProductSpecDocument({
  snapshot = {}, document = null, revision = null, watermark = null,
  company = {}, standard = null, toolbar = true,
} = {}) {
  const spec = snapshot?.spec || {};
  const product = snapshot?.product || {};
  const order = snapshot?.order || {};
  const checkItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const certs = Array.isArray(spec.certifications) ? spec.certifications : [];

  const form = resolveDocumentForm(standard, SPEC_KEY);
  const titleTh = resolveDocumentTitleTh(standard, SPEC_KEY);
  const formLine = `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;
  const docNo = document?.docNo || null;
  // ตัวอย่าง (ไม่มีเอกสาร) = Reversion No. เป็นขีด — Rev มีได้เฉพาะเอกสารที่ออกเลขแล้ว
  const revText = document ? productSpecRevText(revision?.revNo) : null;
  const revLabel = revText !== null ? formatRevLabel(revision?.revNo) : null;
  // วันที่จัดทำ = วันที่ AC ยื่น Rev นี้ · ร่าง/ตัวอย่าง = วันที่ถ่ายภาพนิ่งสด (วันนี้)
  const preparedText = productSpecDateText(revision?.submittedAt || snapshot?.capturedAt);

  const header = documentHeader({
    /* 🐞 **หัวกระดาษเคยพิมพ์ชื่อบริษัทเป็น "-"** — บล็อกกลาง (`resolveCompanyBlock`) คืนคีย์
       `legalNameTh`/`legalNameEn` แต่เปลือกอ่าน `nameTh`/`nameEn` · แม็ปที่นี่แบบเดียวกับ
       `pdrDocument.js` (เทสต์ใช้บล็อกรูปจริง ไม่ส่ง `nameTh` มาบังบั๊กแล้ว) */
    company: {
      nameTh: company.legalNameTh || company.nameTh,
      nameEn: company.legalNameEn || company.nameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    formLine,
    titleTh,
    titleEn: form.title,
    rows: [
      { label: 'Document No.', value: docNo },
      { label: 'Reversion No.', value: revText },
      { label: 'วันที่จัดทำ', value: preparedText },
    ],
  });

  const party = partyGrid({
    party: {
      heading: 'ลูกค้า',
      headingEn: 'Customer',
      name: order.customerName || product.customerName,
      rows: [
        // 🐞 สินค้าที่มีแบรนด์ภาษาอังกฤษอย่างเดียวเคยพิมพ์ N/A — ใช้กฎภาษาเดียวชุดกลางของแบรนด์
        { label: 'ชื่อแบรนด์', value: productBrandName(product) },
      ],
    },
    reference: {
      heading: 'อ้างอิง',
      headingEn: 'Reference',
      rows: [
        { label: 'ใบเสนอราคา / ใบสั่งขาย', value: [order.quotationNumber, order.orderNumber].filter(Boolean).join(' / ') },
        { label: 'กำหนดส่งสินค้า', value: productSpecDateText(order.deliveryDueDate) },
        { label: 'จำนวน', value: qtyText(order.qty, order.unit) },
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

  const overviewPairs = [
    // 🐞 ชื่อไทยว่าง (สินค้าหมวด 01/02 ราวครึ่งหนึ่งมีแต่ชื่ออังกฤษ) เคยพิมพ์ N/A — ไทยก่อน ไม่มีค่อยอังกฤษ
    ['ชื่อผลิตภัณฑ์', productDisplayName(product)],
    ['รหัสสินค้า', product.fgCode],
    ['ประเภทผลิตภัณฑ์', product.categoryName],
    ['กลิ่น / รหัสกลิ่น', product.scentText],
    ['ขนาดบรรจุ (Size)', product.volumeText],
    ['ลักษณะเนื้อสาร', spec.texture],
    ['บรรจุภัณฑ์มาตรฐาน', spec.standardPackaging],
  ];
  pushRows('overview', 'Product Overview', 'kv', overviewPairs.map(([label, value]) => kvRow(label, value)),
    (index) => COST.row + wrapCost(overviewPairs[index][1]));

  const marketPairs = [
    ['กลุ่มเป้าหมาย (Target Group)', spec.targetGroup],
    ['จุดขายหลัก (Key Selling Point)', spec.keySellingPoint],
    ['ระดับราคา (Pricing Tier)', spec.pricingTier],
  ];
  pushRows('market', 'Market Positioning', 'kv', marketPairs.map(([label, value]) => kvRow(label, value)),
    (index) => COST.row + wrapCost(marketPairs[index][1]));

  const functionalPairs = [
    ['ประสิทธิภาพหลัก (Product Benefit)', spec.productBenefit],
    ['ระยะเวลาการออกฤทธิ์กลิ่น', spec.longevity],
    ['ปริมาณแนะนำต่อการใช้งาน', spec.dosagePerUse],
  ];
  pushRows('functional', 'Functional Information', 'kv', functionalPairs.map(([label, value]) => kvRow(label, value)),
    (index) => COST.row + wrapCost(functionalPairs[index][1]));

  pushRows('checklist', 'Checklist Project', 'checklist', checklistRows(checkItems),
    (index) => COST.row
      + wrapCost(checkItems[index]?.detail, 34)
      + wrapCost(checkItems[index]?.note, 24),
    COST.checklistHead);

  pushRows('cert', 'Certification & Documents', 'cert', certRows(certs),
    (index) => COST.certRow + wrapCost(certs[index]?.note, 40),
    COST.certHead);

  /* ── ภาพประกอบ (แผ่นท้าย) ────────────────────────────────────────────────
     ⚠️ **สองภาพต่อแถว และคิดต้นทุนเป็นแถว ไม่ใช่เป็นภาพ** — คิดเป็นภาพแล้วแถวที่มี
     ภาพเดียวจะถูกคิดครึ่งเดียวทั้งที่กินที่เต็มแถว
     ⚠️ ภาพดึงผ่าน `/api/master/attachments/[id]/file` ซึ่งเป็นทางเดียวที่ระบบเสิร์ฟ
     ไฟล์แนบ · รูปที่ Rev ไม่ใช่ร่างอ้างอยู่ลบไฟล์ไม่ได้ (ปลดระวางแทน) ⇒ กระดาษเก่ายังเปิดรูปได้ */
  const figures = sortIllustrations(snapshotIllustrationRows(snapshot?.illustrations));
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
    html: `${contactBlock(order)}${signatureBlock(revision)}`,
    cost: COST.contact + COST.signatures,
  });

  const pages = paginate(items);
  /* หัวเอกสารและกล่องคู่สัญญาอยู่แผ่นแรกแผ่นเดียว (กติกาเดียวกับ PDR หลัง IS-26080030)
     ⚠️ แผ่นที่ไม่มีหัวต้องบอกได้เองว่าเป็นใบไหน **และ Rev ไหน** ถ้าหลุดจากปึก ⇒ ท้ายกระดาษแบกหน้าที่นั้น */
  const footerCenter = [formLine, [docNo, revLabel].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const sheets = pages.map((pageItems, index) => `
    <article class="sheet explicit-page" aria-label="${esc(titleTh)} หน้า ${index + 1}">
      ${watermarkSlot(watermark)}
      ${index === 0 ? header : ''}
      <div class="sheetContent">${index === 0 ? party : ''}${renderPage(pageItems)}</div>
      ${documentFooter({
    left: company.legalNameTh || company.nameTh,
    center: footerCenter,
    right: `หน้า ${index + 1} / ${pages.length}`,
  })}
    </article>`).join('');

  const identity = docNo ? [docNo, revLabel].filter(Boolean).join(' ') : `${form.code} ตัวอย่าง`;
  return renderDocumentHTML({
    // ชื่อไฟล์ตอน "บันทึกเป็น PDF" — รหัส_ลูกค้า_สินค้า (มติ 2026-08-05 ของเปลือก)
    title: documentFileName(identity, order.customerName || product.customerName, productDisplayName(product)),
    accentKey: resolveDocumentAccentKey(standard, SPEC_KEY),
    variantClass: 'specsheet',
    pages: sheets,
    toolbar: toolbar === false ? null : { label: `${titleTh} (${form.code}) · ${identity}`, button: 'พิมพ์เอกสาร' },
    extraCss: `
      .specsheet .sheetContent { gap: 0; padding-top: 5mm; }
      .specsheet h3 { margin: 5mm 0 1.6mm; color: var(--doc-navy); font-size: 10.5pt; }
      .specsheet .sheetContent > h3:first-child { margin-top: 0; }
      .specsheet .na { color: var(--doc-muted); font-style: italic; }
      /* ลายน้ำของ Rev ที่ถูกแทนยาวกว่า "ฉบับร่าง" — กล่อง absolute กว้างได้แค่ครึ่งแผ่นแล้วตัดกลางประโยค
         CSS นี้ตรึงไปกับ frozenHtml ด้วย ลายน้ำที่ประทับทับทีหลังจึงได้บรรทัดเดียวเหมือนกัน */
      .specsheet .watermark { white-space: nowrap; }
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

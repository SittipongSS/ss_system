// ── เอกสาร "รายละเอียดผลิตภัณฑ์" FM-SA-04 — เปลือกเดียวกับใบเสนอราคา ─────────────────
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
// ⭐ **มติผู้ใช้ 2026-09-22 — หัวกระดาษแบบใบเสนอราคา** (ภาพหัว QT-26090355-1 เป็นแบบ)
//   · ชื่อเอกสาร **ภาษาเดียวตามภาษาของใบ** — ใบไทย "รายละเอียดผลิตภัณฑ์" · ใบอังกฤษ "PRODUCT SPEC"
//     ภาษาของใบ = ภาษาของ SO (`snapshot.order.docLanguage`) · ตัวอย่างจากหน้าสินค้า = ไทย
//   · หัว: "เลขที่ / No." = `DDMMYY-XXX-RR` (`formatSpecDocNo`) · "วันที่ / Date" = วันที่จัดทำ
//   · กล่อง "ผู้ซื้อ / CUSTOMER" แถวเดียวกับใบเสนอราคา (ที่อยู่เอกสาร · เลขผู้เสียภาษี · สาขา ·
//     ที่อยู่จัดส่ง · ผู้ติดต่อ) · กล่อง "ข้อมูลอ้างอิง / REFERENCE": ใบเสนอราคา กับ ใบสั่งขาย **แยกแถว** ·
//     PO (ถ้ามี) · กำหนดส่ง · ผู้ติดต่อฝ่ายขาย/โทร/อีเมล (ย้ายมาจากส่วน Contact for Sales เดิม)
//
// ⭐ **มติผู้ใช้ 2026-09-22 รอบสาม**
//   · "ปริมาตรบรรจุ และ จำนวนผลิต ดึงมาจาก ข้อมูล FG และ QT SO" — Product Overview มี "ปริมาตรบรรจุ (Size)" (FG) และ
//     "จำนวนผลิต (Quantity)" (บรรทัด SO · ถอยบรรทัดใบเสนอราคา) · แถว "จำนวน" ในกล่องอ้างอิงถูกถอด
//   · "final review ต้องปรับให้เหมือน QT และ SO" + "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม" — ช่องลงนามเป็นกล่องของเปลือกชุดเดียวกับ
//     QT/SO (รูปลายเซ็นจริง · ตำแหน่งเต็มของคนที่เซ็นจริง · ชื่อเต็ม · วันที่) · ดู PRODUCT_SPEC_SIGN_STEPS
//   · ตัดหน้า **ทั้งหัวข้อ** และหัวข้อในเนื้อมีเลขข้อ ("1. Product Overview" …) — ดู `productSpecLayout.js`
//   ⚠️ **เนื้อสเปค (ป้ายในตาราง · หัวข้อ) ยังเป็นชุดเดียวทั้งสองภาษา** — มติรอบนี้เปลี่ยนเฉพาะหัว/กล่อง/วันที่
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มเขียนว่า "พิมพ์" ไม่ใช่ "ดาวน์โหลด"
//
// ── สามเลขบนกระดาษ อย่าสลับกัน ──────────────────────────────────────────
//   `FM-SA-04: Rev. No.00` มุมซ้าย = เวอร์ชันของ **แบบฟอร์ม** (document_standard_versions)
//   "เลขที่" `220969-001-00`      = เลขที่ของ **เอกสาร** (product_spec_documents.docNo ตัดรหัสแบบฟอร์ม)
//                                   + Rev ของ **เอกสาร** (product_spec_document_revisions.revNo) สองหลักท้าย
//                                   หนึ่งใบต่อบรรทัด SO · Rev ใหม่ยังเลขที่เดิม (ส่วนหน้าเท่าเดิม RR ขยับ)
//   ⚠️ Rev ไม่ใช่ของสเปค — สเปคในฐานไม่มี Rev แล้วตั้งแต่ 0370
//
// ── งบหน้า (วัดใหม่ 2026-09-22 · ตัวประเมินอยู่ `productSpecLayout.js` พร้อมตารางความกว้างตัวอักษร) ──────
//   วิธีวัด: headless Chrome (puppeteer-core) เปิด HTML ที่ไฟล์นี้คืนมา (ฟอนต์/โลโก้ฝังในไฟล์) · `.document`
//   zoom 1 · อ่าน `offsetHeight` ของแต่ละก้อน และ `scrollHeight` เทียบ `clientHeight` ของ `.sheetContent` —
//   **ห้าม `getBoundingClientRect`** (เปลือกย่อทั้งแผ่นด้วย zoom) · จับคู่ก้อนที่วาดกับก้อนที่ `planProductSpecPaper`
//   ประเมินทีละก้อน (หัว · กล่องผู้ซื้อ · ทุกแถว · ลายเซ็น)
//   `.sheetContent` แผ่นไม่มีหัว clientHeight 276.0 · แผ่นแรก 233.1 ⇒ หัวเอกสาร 42.86
//     (brandBlock 38.63 · identityBlock 33.34 เมื่อชื่อเอกสารบรรทัดเดียว — ทั้ง "รายละเอียดผลิตภัณฑ์" และ "PRODUCT SPEC"
//      บรรทัดเดียวในช่อง 72mm · ชื่อที่ยาวจนตกบรรทัดเพิ่ม 11.06 ต่อบรรทัด)
//   กล่องผู้ซื้อ + อ้างอิง (รวม margin 4 · รอบสาม อ้างอิงหกแถว): ที่อยู่สั้น ไทย/อังกฤษ 53.48 · ที่อยู่จริง 6 บรรทัด 104.54 ·
//     อังกฤษตัวใหญ่ 250 ตัว 90.78 · ทุกช่องยาวสุด 152.7 — **แปรตามข้อความ** ⇒ ประเมินจากข้อความที่พิมพ์จริงทุกใบ
//     (🐞 รอบก่อนหักค่าคงที่ 31.75 ที่วัดตอนกล่องมีสามแถว)
//   ระยะแถวตารางในตารางจริง (รอบสอง) 1 บรรทัด 7.55 · 2 บรรทัด 12.44 (กรอบ 2.65–2.69 + n × 4.89) · หัวตาราง
//     checklist 12.44 · cert 7.67 · h3 12.69 (ตัวแรกของแผ่นต่อไม่มี margin บน 5) · แถวภาพ (คำบรรยายบรรทัดเดียว) 85.37
//   ลายเซ็นแบบ QT/SO (รอบสาม): กล่องทุกบรรทัดเดียว 34.13 · ชื่อสองบรรทัด 38.63 · สามบรรทัด 43.13 · ทั้งก้อนรวมหัวข้อ
//     (margin บน 2.5) 44.32 / 48.81 / 53.31 — ตัวประเมิน `signaturesMm` เผื่อ 0.65–0.74 (วิธีวัดใน productSpecLayout)
//   สวีปรอบสอง (ตามผลตรวจ): 442 กรณี (ไทย/อังกฤษ × ที่อยู่สั้น/จริง 6 บรรทัด/ยาวมาก × checklist 0/17/30 × เอกสาร 0/4/8 ×
//     ภาพ 0/2/5/7 × ช่องยาวเต็มเพดาน เปิด/ปิด + 10 กรณีพิเศษ) × จอ/สื่อพิมพ์ = 1,962 แผ่นต่อสื่อ: **ไม่มีแผ่นไหนล้น**
//     (`.sheetContent` scrollHeight ≤ clientHeight ทุกแผ่น) · ไม่มีตาราง/ก้อนไหนประเมินต่ำกว่าที่วาด · ไม่มีหัวข้อที่ลง
//     แผ่นเปล่าได้ถูกตัด · ที่ว่างเหลือน้อยสุด 3.18mm (พิมพ์) / 3.38mm (จอ — แผ่นภาพ 5 รูปที่ใช้ความจุเต็ม) ·
//     ส่วนเผื่อต่ำสุดรายก้อน หัว +0.54 · กล่องผู้ซื้อ +3.07 · ลายเซ็น +0.08 · ตาราง +0.33 · แถวภาพ +0.08
//     + ฟัซข้อความประหลาด 36 ใบ (ไทยติด URL · NBSP · ZWSP · อีโมจิ · ตัวกว้าง) ไม่ล้น · ข้อมูลจริง 6 SO × 8 สถานะ + 5 ตัวอย่าง ไม่ล้น
//     ใบมาตรฐาน (checklist 17 · เอกสาร 4) = 2 แผ่น ลายเซ็นอยู่หน้า 2 (เหลือ 3.47mm พิมพ์)
//   สวีปรอบสาม (ช่องลงนามแบบ QT/SO + แถวจำนวนย้ายไป Product Overview): 442 กรณีเดิม × จอ/สื่อพิมพ์ = 2,002 แผ่นต่อสื่อ
//     (ขั้นที่เซ็นแล้วมีรูป 1,099 รูป) ไม่มีแผ่นไหนล้น · ไม่มีก้อนไหนประเมินต่ำ · ไม่มีหัวข้อถูกตัดทั้งที่ลงแผ่นเปล่าได้ ·
//     ที่ว่างเหลือน้อยสุดเท่ารอบสอง (3.18 พิมพ์ / 3.38 จอ) · ช่องลงนาม 146 แบบ (ไทย/อังกฤษ × 4 สถานะ × ชื่อยาว 1–3 บรรทัด ×
//     มี/ไม่มีรูป × ตำแหน่งของช่อง/admin/ยาวสุด) ไม่มีกล่องไหนประเมินต่ำ · ฟัซ 36 ใบไม่ล้น ·
//     ข้อมูลจริง 6 SO × 8 สถานะ + 5 ตัวอย่าง พร้อมลายเซ็นจริง (อ่านอย่างเดียว) ไม่ล้น · จำนวนหน้า PDF = จำนวนแผ่น
import {
  documentFileName, documentFooter, documentHeader, esc, headerText, partyGrid, renderDocumentHTML, signatureBoxText,
  signatureSection, watermarkBlock,
} from '@/lib/documents/documentShell';
import { positionTitle } from '@/lib/documents/positionTitles';
import {
  resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { BUDDHIST_YEAR_OFFSET, fmtDateNumeric, fmtNumber, fmtPhone } from '@/lib/format';
import { saleUnitLabel, volumeUnitLabel } from '@/lib/master/units';
import { PRODUCT_SPEC_CERT_STATUS_LABELS, productSpecCertPendingLabel } from '@/lib/sales/productSpecChecklist';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';
import {
  illustrationCaption, snapshotIllustrationRows, sortIllustrations,
} from '@/lib/sales/productSpecIllustrations';
import {
  PRODUCT_SPEC_COST_MM, certRowMm, checklistRowMm, figureRowMm, kvRowMm, paginateProductSpecSections,
  productSpecHeaderMm, productSpecPageBudgets, productSpecPartyMm, sectionOpenMm, signaturesMm,
} from '@/lib/sales/productSpecLayout';
import { docLanguageOf, quotationBranchText, quotationDocLabels } from '@/lib/sales/quotationMasterTemplate';
import { formatRevLabel } from '@/lib/sales/productSpecDocWorkflow';
import { productBrandName, productDisplayNameFor } from '@/lib/master/productIdentity';

const SPEC_KEY = 'productSpec';

/* รุ่นของตัวเรนเดอร์ที่ประทับลง `rendererVersion` ตอนตรึงกระดาษ (0370 · ≤ 40 ตัวอักษร)
   ⚠️ **ขยับเมื่อหน้าตากระดาษเปลี่ยน** (ช่อง · ลำดับ · งบหน้า) — กระดาษที่ตรึงแล้วไม่เรนเดอร์ใหม่
   ค่านี้คือทางเดียวที่บอกได้ว่าแผ่นไหนออกจากตัวเรนเดอร์รุ่นไหน
   · `@2026-09-22b` = หัวแบบใบเสนอราคา + ภาษาตาม SO + ตัดหน้าตามหัวข้อ + เลขข้อ
   · `@2026-09-22c` = ตัวตัดบรรทัดจำลองจุดตัดของ Chrome (ไทยติดละติน/URL/NBSP) + ความกว้างช่องที่วาดจริง +
     ระยะแถวตารางจริง + ก้อนเดี่ยว/ลายเซ็นใช้ความจุเต็มแผ่น (ใบมาตรฐานเหลือสองแผ่น)
   · `@2026-09-22d` = ช่องลงนามแบบ QT/SO (รูปลายเซ็นจริง · ตำแหน่งเต็ม · "ลงชื่อ"/วันที่ของช่องที่ยังไม่เซ็น) +
     Product Overview มี "ปริมาตรบรรจุ" (FG) และ "จำนวนผลิต" (SO/QT) · กล่องอ้างอิงถอดแถวจำนวน
   · `@2026-09-22e` = ใบอังกฤษแปลหน่วยปริมาตร (ขวด → Bottle) · ช่องลูกค้าใบอังกฤษมีบรรทัดตำแหน่ง (Authorized signature)
     ให้แถวตรงกับอีกสามช่อง · สี่คอลัมน์ผ่านตัวแปร --sig-cols ของเปลือก (แทนกฎ data-columns="4") ·
     ช่องลงนามกว้างเท่ากันเสมอ (ชื่อที่ไม่มีจุดตัดเคยถ่างช่องจนก้อนลายเซ็นสูงเกินที่จอง)
   · `@2026-09-22f` = ภาพประกอบขึ้นแผ่นใหม่เสมอ (`breakBefore` · มติผู้ใช้ 22/09) · ช่องลงนามชิดขอบล่าง (`.signTail`) */
export const PRODUCT_SPEC_RENDERER_VERSION = 'fm-sa-04@2026-09-22f';

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
 * ⭐ ใบอังกฤษ = DRAFT / CANCELLED / SUPERSEDED BY Rev.XX — ป้ายชุดกลาง (`quotationDocLabels`) แบบที่ QT/SO
 *    ภาษาอังกฤษพิมพ์ (ผลตรวจรอบสอง: ใบอังกฤษยังประทับ "ฉบับร่าง") · ตัวอย่างจากหน้าสินค้าเป็นใบไทยเสมอ
 * ⚠️ สถานะที่ไม่รู้จักได้ "ฉบับร่าง" — กระดาษเปล่าไร้ลายน้ำต้องเป็นฉบับอนุมัติเท่านั้น
 *    ตกหล่นทางไหนก็ต้องไม่กลายเป็นกระดาษที่อ่านเหมือนเซ็นรับรองแล้ว */
export const PRODUCT_SPEC_WATERMARKS = Object.freeze({
  draft: 'ฉบับร่าง',
  void: 'ยกเลิก',
  sample: 'ตัวอย่าง',
});

export function supersededWatermark(revNo, language = 'th') {
  const L = quotationDocLabels(language);
  const label = formatRevLabel(revNo);
  return label === '—' ? L.t('specSupersededNewer') : `${L.t('specSupersededBy')} ${label}`;
}

/**
 * ข้อความลายน้ำของกระดาษหนึ่งแผ่น — `null` = ไม่มีลายน้ำ (ฉบับอนุมัติที่ยังใช้อยู่)
 *
 * @param {object} input
 * @param {boolean} [input.sample]            พิมพ์ตัวอย่างจากหน้าสินค้า (ยังไม่มีเอกสาร)
 * @param {object}  [input.document]          `{ status }` ของ product_spec_documents
 * @param {object}  [input.revision]          `{ status }` ของ Rev ที่พิมพ์
 * @param {number}  [input.supersededByRevNo] Rev ที่มาแทน (เมื่อ Rev นี้ superseded)
 * @param {string}  [input.language]          ภาษาของใบ (`snapshot.order.docLanguage` ของกระดาษที่ประทับ) · ตั้งต้นไทย
 */
export function productSpecWatermark({
  sample = false, document = null, revision = null, supersededByRevNo = null, language = 'th',
} = {}) {
  const L = quotationDocLabels(language);
  if (sample) return PRODUCT_SPEC_WATERMARKS.sample;
  if (document?.status === 'void') return L.t('cancelled');
  if (revision?.status === 'approved') return null;
  if (revision?.status === 'superseded') return supersededWatermark(supersededByRevNo, language);
  return L.t('draft');
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
 * วันที่บนกระดาษ — DD/MM/YYYY ตามนาฬิกาไทย · **ใบไทย = พ.ศ. · ใบอังกฤษ = ค.ศ.** (มติ 22/09)
 *
 * ⚠️ ผ่าน `fmtDateNumeric` (วันไทยของจุดเวลา · วันในปฏิทินไม่ขยับโซน) แล้วค่อยบวกปี —
 *    ห้ามตัด `slice(0, 10)` จากจุดเวลาเอง ไม่งั้นกระดาษที่ยื่นช่วงตี 0–7 ได้วันที่ของเมื่อวาน
 * @param language ภาษาของใบ (`'th'` ตั้งต้น — ใบเดิมทุกใบเป็นไทย)
 * @returns {string|null} `null` = ไม่มีวันที่ (ช่องนั้นพิมพ์ขีด/ว่างตามบล็อก)
 */
export function productSpecDateText(value, language = 'th') {
  if (value === null || value === undefined || value === '') return null;
  const match = String(fmtDateNumeric(value)).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const year = docLanguageOf(language) === 'en' ? Number(match[3]) : Number(match[3]) + BUDDHIST_YEAR_OFFSET;
  return `${match[1]}/${match[2]}/${year}`;
}

/** Rev ของเอกสารสองหลัก (`00`) · ไม่มี = `null` */
export function productSpecRevText(revNo) {
  if (revNo === null || revNo === undefined || revNo === '' || !Number.isFinite(Number(revNo))) return null;
  return String(Number(revNo)).padStart(2, '0');
}

/* ปริมาตรบรรจุของสินค้า FG — ปริมาตร + หน่วยจากทะเบียนสินค้า (ภาพนิ่งถ่าย `volume`/`volumeUnit` ไว้)
   ตัวเลขจัดหลักพันแบบทั้งระบบ (1,200 ml) · ภาพนิ่งที่ไม่มีสองช่องนี้ (รุ่นเก่า) ถอยไป `volumeText` ที่ถ่ายไว้
   ⭐ หน่วยแปลตามภาษาของใบผ่าน `volumeUnitLabel` ชุดกลาง (lib/master/units — คู่อังกฤษของหน่วยบรรจุทุกตัว)
   🐞 (ตรวจรอบสาม) เดิมพิมพ์หน่วยตามทะเบียนตรง ๆ โดยเชื่อว่าเป็นสัญลักษณ์สากล — แต่ลิสต์หน่วยบรรจุมีคำไทย
      ('ขวด' 'แกลลอน' 'แผ่น') ⇒ ใบอังกฤษพิมพ์ "6 ขวด" ในแถวเดียวกับ "300 Piece" ที่แถวจำนวนแปลแล้ว
      (บั๊กชนิดเดียวกับ IS-26080025) · ml/g/kg แปลเป็นตัวเอง · `volumeText` ของภาพนิ่งเก่าเป็นข้อความรวม แปลไม่ได้ */
export function productSizeText(product = {}, language = 'th') {
  const volume = product?.volume;
  if (volume === null || volume === undefined || String(volume).trim() === '') return product?.volumeText || null;
  const number = Number(volume);
  const text = Number.isFinite(number) ? fmtNumber(number, { maximumFractionDigits: 3 }) : String(volume).trim();
  return [text, volumeUnitLabel(product.volumeUnit, docLanguageOf(language))].filter(Boolean).join(' ');
}

// หน่วยแปลตามภาษาของใบจากลิสต์ปิด (กติกาเดียวกับใบเสนอราคา) · ค่านอกลิสต์พิมพ์ตามเดิม
const qtyText = (qty, unit, language) => {
  if (qty === null || qty === undefined || qty === '') return null;
  const number = Number(qty);
  const text = Number.isFinite(number) ? fmtNumber(number) : String(qty);
  return [text, unit ? saleUnitLabel(unit, language) : null].filter(Boolean).join(' ');
};

/* ── หัวเอกสาร + กล่องผู้ซื้อ/อ้างอิง — เลือกภาษา **ที่นี่ที่เดียว** ─────────────────────
   ⚠️ ข้อความชุดเดียวกันใช้ทั้งวาดและประเมินความสูง (productSpecPartyMm) — เลือกภาษาซ้ำตอนวาดเมื่อไร
      ที่ที่จองไว้กับที่พิมพ์จริงหลุดจากกัน (บทเรียน v4FirstCapacity ของใบเสนอราคา) */

// ผู้ติดต่อ "ชื่อ · เบอร์" แบบใบเสนอราคา — ไม่มีชื่อแต่มีเบอร์ = "- · 08x…" (เบอร์ต้องไม่หาย)
const contactText = (name, phone) => {
  const who = String(name ?? '').trim();
  const tel = String(phone ?? '').trim();
  if (!who && !tel) return null;
  return `${who || '-'}${tel ? ` · ${fmtPhone(tel)}` : ''}`;
};

// เอกสารยืนยันคำสั่งซื้อของ SO — PO มีเลขที่บังคับ · เอกสารยืนยันอื่นมีเลขที่ได้ (orderConfirmationDocs)
const confirmLabelKey = (type) => (type === 'po' ? 'specPoNo' : 'specOrderConfirmation');

function paperIdentity({ snapshot, language, L }) {
  const order = snapshot?.order || {};
  const product = snapshot?.product || {};
  // ภาพนิ่ง v1 ไม่มีก้อน customer — ถอยไปชื่อที่ order/product แช่ไว้ (ช่องอื่นเป็นขีด)
  const customer = snapshot?.customer || {};
  const pick = (thai, english) => headerText(language, thai, english) || null;
  const billing = pick(customer.billingAddress, customer.billingAddressEn);
  const hasBranch = customer.branchCode !== null && customer.branchCode !== undefined;
  const confirmDate = productSpecDateText(order.confirmDocDate, language);
  const party = {
    name: pick(customer.name || order.customerName || product.customerName, customer.nameEn),
    address: billing,
    rows: [
      { label: L.t('customerTaxId'), value: customer.taxId || null },
      /* สาขาเป็นเลขล้วนจาก quotationBranchText ตัวเดียวกับใบเสนอราคา (สำนักงานใหญ่ = 00000)
         ⚠️ ไม่มีใบเสนอราคาให้อ่าน (ตัวอย่าง/ภาพนิ่ง v1) = ขีด ไม่ใช่เดาว่าสำนักงานใหญ่ */
      { label: L.t('branchRow'), value: hasBranch ? quotationBranchText(customer.branchCode) : null },
      // ไม่มีที่อยู่จัดส่งของตัวเอง = ส่งตามที่อยู่เอกสาร (ความหมายเดียวกับใบเสนอราคา)
      { label: L.t('shippingAddress'), value: pick(customer.shippingAddress, customer.shippingAddressEn) || billing },
      { label: L.t('contact'), value: contactText(customer.contactName, customer.contactPhone) },
    ],
  };
  const reference = [
    // ⭐ ใบเสนอราคากับใบสั่งขาย **คนละแถว** (มติผู้ใช้ 22/09 "แยกข้อ")
    { label: L.t('specQuotation'), value: order.quotationNumber || null },
    { label: L.t('specSalesOrder'), value: order.orderNumber || null },
    order.confirmDocNo
      ? {
        label: L.t(confirmLabelKey(order.confirmDocType)),
        value: [order.confirmDocNo, confirmDate].filter(Boolean).join(' · '),
      }
      : null,
    { label: L.t('specDeliveryDue'), value: productSpecDateText(order.deliveryDueDate, language) },
    // ⚠️ "จำนวน" ย้ายไป Product Overview เป็น "จำนวนผลิต (Quantity)" (มติผู้ใช้ 2026-09-22) — ไม่พิมพ์ซ้ำสองที่
    /* ⭐ ผู้ติดต่อฝ่ายขาย = **AE เจ้าของดีลของ SO** จากภาพนิ่ง (มติ 21/09) — ไม่ใช่คนที่เปิดดู
       🐞 เดิมพิมพ์ชื่อคนที่กดพิมพ์ ⇒ AC ที่พิมพ์ส่งลูกค้ากลายเป็นผู้ติดต่อฝ่ายขายบนกระดาษ
       ⚠️ ตัวอย่างจากหน้าสินค้ายังไม่มี SO ⇒ ไม่มีเจ้าของดีล ทั้งสามแถวเป็นขีด (แถวคงที่ ⇒ ความสูงกล่องเดาได้) */
    { label: L.t('salesContact'), value: order.dealOwnerName || null },
    { label: L.t('phone'), value: order.dealOwnerPhone ? fmtPhone(order.dealOwnerPhone) : null },
    { label: L.t('email'), value: order.dealOwnerEmail || null },
  ].filter(Boolean);
  return { party, reference };
}

/* ── ตาราง ───────────────────────────────────────────────────────────────── */

const kvRow = (label, value) => `<tr><th>${esc(label)}</th><td>${cell(value)}</td></tr>`;

const checklistRow = (row, index) => `
    <tr>
      <td class="no">${index + 1}</td>
      <td>${cell(row.itemLabel)}</td>
      <td>${cell(row.detail)}</td>
      <td class="tick">${row.preparedByS ? TICK_ON : TICK_OFF}</td>
      <td class="tick">${row.preparedByCustomer ? TICK_ON : TICK_OFF}</td>
      <td>${cell(row.note)}</td>
    </tr>`;

const CHECKLIST_HEAD = `<thead><tr>
  <th class="no">ลำดับ</th><th>สิ่งที่ต้องเตรียม</th><th>รายละเอียด</th>
  <th class="tick">S&amp;S</th><th class="tick">ลูกค้า</th><th>หมายเหตุ</th>
</tr></thead>`;

const CERT_HEAD = `<thead><tr>
  <th>เอกสารที่สามารถขอได้</th><th>สถานะ</th><th>หมายเหตุ</th>
</tr></thead>`;

function certRow(row) {
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
}

/* ── ช่องลงนาม "Final Review & Approval" ─────────────────────────────────────
   ⭐ มติผู้ใช้ 2026-09-22 "final review ต้องปรับให้เหมือน QT และ SO" — กล่องชุดเดียวกับใบเสนอราคา/ใบสั่งขาย
      (`signatureSection` ของเปลือก: ชื่อหน่วยงาน · ตำแหน่ง · รูปลายเซ็นจริง · ชื่อเต็ม · วันที่) ไม่ใช่กล่อง `.sig`
      ของตัวเองแบบเดิม · สี่ช่องตามลำดับ:
        1. ผู้ประสานงานฝ่ายขาย = ผู้ยื่น (`submitted*`)   2. ฝ่ายขาย = AE ที่อนุมัติ (`aeApproved*`)
        3. ผู้จัดการฝ่ายขาย = AE Sup ที่อนุมัติ (`supApproved*`)   4. ลูกค้า = ว่างเสมอ (เซ็นมือนอกระบบ)
   ⭐ "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม" — ตำแหน่งใต้ชื่อหน่วยงานคือ **ตำแหน่งเต็มของคนที่เซ็นจริง** (`positionTitle`
      ของ role ในบัญชี · admin กดแทนได้ทุกขั้น ⇒ ช่องนั้นพิมพ์ Administrator ไม่ใช่ตำแหน่งที่เขาไม่ได้ดำรง) ·
      ขั้นที่ยังไม่มีใครเซ็น/อ่าน role ไม่ได้ = ตำแหน่งของช่อง · ชื่อ = ชื่อที่ประทับลง Rev ตอนกด (ชื่อที่แสดงของบัญชี)
   ขั้นที่เซ็นแล้ว (มีตราประทับวันที่) = รูปลายเซ็นที่ใช้งานอยู่ของคนนั้น (ผู้เรียกฝั่ง server โหลดให้ ·
      ไม่มีรูป = กล่อง "ลายเซ็นอิเล็กทรอนิกส์" แบบ QT/SO) + ชื่อ + วันที่ · ยังไม่ถึง = "ลงชื่อ" + (____) + "วันที่ __/__/__"
   ⚠️ ขั้นที่ยังไม่ถึงไม่เดาชื่อ (แม้รู้ว่า AE เจ้าของดีลคือใคร) — admin อนุมัติแทนได้ ชื่อที่เดาไว้อาจไม่ใช่คนเซ็น
   ⚠️ **ไม่มีเลขข้อ** — ไม่ใช่หัวข้อเนื้อสเปค (มติ 22/09 ให้เลขเฉพาะหัวข้อในเนื้อ) */
export const PRODUCT_SPEC_SIGN_STEPS = Object.freeze([
  Object.freeze({ key: 'submit', labelKey: 'specSignCoordinator', role: 'ac', by: 'submittedBy', name: 'submittedByName', at: 'submittedAt' }),
  Object.freeze({ key: 'ae', labelKey: 'salesTeam', role: 'ae', by: 'aeApprovedBy', name: 'aeApprovedByName', at: 'aeApprovedAt' }),
  Object.freeze({ key: 'sup', labelKey: 'salesManager', role: 'ae_supervisor', by: 'supApprovedBy', name: 'supApprovedByName', at: 'supApprovedAt' }),
]);

/**
 * ขั้นที่เซ็นแล้วของ Rev (มีตราประทับวันที่) — ฝั่ง server ใช้รายการนี้โหลดรูปลายเซ็น + role ของคนที่เซ็น
 * @returns {{ key: 'submit'|'ae'|'sup', userId: string|null }[]}
 */
export function productSpecSignedSteps(revision) {
  return PRODUCT_SPEC_SIGN_STEPS
    .filter((step) => Boolean(revision?.[step.at]))
    .map((step) => ({ key: step.key, userId: revision?.[step.by] || null }));
}

/**
 * ช่องลงนามสี่ช่องในรูปที่ `signatureSection` รับ — ใช้ทั้งวาดและประเมินความสูง (ข้อความชุดเดียวกัน)
 *
 * @param revision   Rev ที่พิมพ์ (ตราประทับสามขั้น) · `null` = ตัวอย่าง (ว่างทั้งหมด)
 * @param signatures `{ submit|ae|sup: { imageDataUri?, role? } }` จาก `loadProductSpecSignatures` · ไม่ส่ง = ไม่มีรูป
 */
export function productSpecSigners(revision, signatures = null, language = 'th') {
  const L = quotationDocLabels(language);
  const steps = PRODUCT_SPEC_SIGN_STEPS.map((step) => {
    const label = L.t(step.labelKey);
    const seatTitle = positionTitle(step.role);
    const at = revision?.[step.at];
    if (!at) return { label, role: seatTitle, name: '' };
    const signature = signatures?.[step.key] || {};
    return {
      label,
      role: positionTitle(signature.role, seatTitle),
      esignature: {
        imageDataUri: signature.imageDataUri || null,
        signerName: revision?.[step.name] || '',
        // ตำแหน่งอยู่ใต้ชื่อหน่วยงานแล้ว — บรรทัดล่างเหลือวันที่ (แบบช่องของใบสั่งขาย)
        signerRole: '',
        signedAt: productSpecDateText(at, language) || '',
      },
    };
  });
  /* ช่องลูกค้า: ใบไทย "ลูกค้า" + "Customer" แบบคู่ป้ายของช่องอื่น · ใบอังกฤษป้ายเป็น "Customer" อยู่แล้ว
     ⇒ บรรทัดตำแหน่งเป็น "Authorized signature" (คำเดียวกับช่องผู้อนุมัติของใบเสนอราคา) ไม่พิมพ์ "Customer" ซ้ำ
     🐞 (ตรวจรอบสาม) เดิมใบอังกฤษไม่มีบรรทัดตำแหน่ง ⇒ "Signature / (____) / Date" ของช่องนี้ลอยสูงกว่าอีกสามช่อง
        หนึ่งบรรทัด · ทุกช่องต้องมีสองบรรทัดหัวเท่ากันแถวถึงจะตรงแบบ QT/SO */
  return [...steps, { label: L.t('specSignCustomer'), role: L.isEnglish ? 'Authorized signature' : 'Customer', name: '' }];
}

/* หัวข้อ "Final Review & Approval" ห่างก้อนบน 2.5mm (หัวข้อเนื้อ 5mm) — กล่องแบบ QT/SO สูงกว่ากล่องเดิม 2.5mm
   (ป้าย · ตำแหน่ง · ช่องเซ็น 12mm · ชื่อ · วันที่) · ระยะนี้ชดเชยให้ก้อนลายเซ็นทั้งก้อนสูงเท่าเดิม (44.32 วัดทั้งคู่)
   ⇒ ใบมาตรฐานยังสองแผ่น ไม่เกิดแผ่นที่มีแต่ลายเซ็น (ผลตรวจรอบสองเคยจับได้) */
/* ⭐ **ช่องลงนามชิดขอบล่างของแผ่น** (มติผู้ใช้ 2026-09-22 "ดึงขึ้นถ้าพอ แต่ชิดล่าง") — ก้อนท้ายห่อด้วย `.signTail`
   ที่ `margin-top: auto` ใน `.sheetContent` (flex column) ⇒ วางต่อหัวข้อสุดท้ายในแผ่นเดียวกันเมื่อที่พอ (ตัวแบ่งหน้า
   ตัดสินเหมือนเดิม) แต่ลงไปชิดล่างแบบกลุ่มท้ายของ QT/SO · ความสูงของก้อนไม่เปลี่ยน ⇒ งบหน้าไม่ต้องวัดใหม่ */
function signatureBlock(signers, L) {
  return `<div class="signTail"><h3 class="signHeading">Final Review &amp; Approval</h3>${signatureSection(signers, L)}</div>`;
}

/* กล่องภาพหนึ่งใบ — กรอบสูงคงที่ · คำบรรยายใต้ภาพ · เลขลำดับนำหน้าเสมอ
   ⚠️ ไม่มีคำบรรยาย = พิมพ์แค่เลขลำดับ ไม่ใช่ N/A — ใต้ภาพที่เห็นอยู่แล้วว่าเป็นรูปอะไร
   คำว่า N/A อ่านเหมือนภาพนั้นผิด */
const figureCaption = (row, number) => `${number}. ${illustrationCaption(row)}`.trim();

function figureBlock(row, number) {
  const caption = illustrationCaption(row);
  return `
    <figure class="fig">
      <div class="figBox"><img src="/api/master/attachments/${esc(row.id)}/file" alt="${esc(caption || `ภาพประกอบที่ ${number}`)}" /></div>
      <figcaption>${esc(figureCaption(row, number))}</figcaption>
    </figure>`;
}

/* ── หัวข้อในเนื้อ ─────────────────────────────────────────────────────────── */

/* หัวข้อทุกหัวข้อในเนื้อมีเลขข้อ (มติผู้ใช้ 22/09 "เพิ่มเลขที่ข้อด้วย") — เลขเรียงตามหัวข้อที่พิมพ์จริง
   ⚠️ หัวข้อที่ไม่มีแถว (ลบ checklist หมด · ไม่มีเอกสารที่ขอได้ · ไม่มีรูป) ไม่พิมพ์ ⇒ เลขข้อถัดไปเลื่อนขึ้น
      ไม่เว้นเลข — กระดาษที่ข้ามจาก 3 ไป 5 อ่านเหมือนหน้าหาย */
function buildSections({ spec, product, order, checkItems, certs, figures, language }) {
  const sections = [];
  const kvSection = (key, heading, pairs) => sections.push({
    key,
    heading,
    table: 'kv',
    headCost: 0,
    rows: pairs.map(([label, value]) => ({ html: kvRow(label, value), cost: kvRowMm(label, value) })),
  });

  kvSection('overview', 'Product Overview', [
    // ใบอังกฤษ = ชื่ออังกฤษก่อน ถอยไปไทย · ใบไทย = ไทยก่อน (สินค้าหมวด 01/02 ราวครึ่งหนึ่งมีแต่ชื่ออังกฤษ)
    ['ชื่อผลิตภัณฑ์', productDisplayNameFor(product, language)],
    /* ⭐ แบรนด์ย้ายจากกล่องลูกค้าเดิมมาอยู่ที่นี่ (มติ 22/09 — กล่องผู้ซื้อเหลือแถวแบบใบเสนอราคา)
       🐞 สินค้าที่มีแบรนด์ภาษาอังกฤษอย่างเดียวเคยพิมพ์ N/A — ใช้กฎภาษาเดียวชุดกลางของแบรนด์ */
    ['ชื่อแบรนด์', productBrandName(product)],
    ['รหัสสินค้า', product.fgCode],
    ['ประเภทผลิตภัณฑ์', product.categoryName],
    ['กลิ่น / รหัสกลิ่น', product.scentText],
    /* ⭐ มติผู้ใช้ 2026-09-22 "ปริมาตรบรรจุ และ จำนวนผลิต ดึงมาจาก ข้อมูล FG และ QT SO"
       · ปริมาตรบรรจุ = ปริมาตร + หน่วยของสินค้า FG ในทะเบียน (`products.volume/volumeUnit` ที่ภาพนิ่งถ่ายไว้)
       · จำนวนผลิต = จำนวน + หน่วยของบรรทัด SO (ไม่มี = บรรทัดใบเสนอราคาของสินค้าเดียวกัน) ที่ภาพนิ่งถ่ายไว้
         ตอนยื่น · ร่างอ่านสด — แถว "จำนวน" ในกล่องอ้างอิงถูกถอด ตัวเลขจึงพิมพ์ที่เดียว */
    ['ปริมาตรบรรจุ (Size)', productSizeText(product, language)],
    ['จำนวนผลิต (Quantity)', qtyText(order.qty, order.unit, language)],
    ['ลักษณะเนื้อสาร', spec.texture],
    ['บรรจุภัณฑ์มาตรฐาน', spec.standardPackaging],
  ]);
  kvSection('market', 'Market Positioning', [
    ['กลุ่มเป้าหมาย (Target Group)', spec.targetGroup],
    ['จุดขายหลัก (Key Selling Point)', spec.keySellingPoint],
    // ⭐ ระดับราคาตัดออก (มติผู้ใช้ 2026-09-22) — ดูหัว SPEC_CONTENT_FIELDS
  ]);
  kvSection('functional', 'Functional Information', [
    ['ประสิทธิภาพหลัก (Product Benefit)', spec.productBenefit],
    ['ระยะเวลาการออกฤทธิ์กลิ่น', spec.longevity],
    ['ปริมาณแนะนำต่อการใช้งาน', spec.dosagePerUse],
  ]);

  if (checkItems.length) {
    sections.push({
      key: 'checklist',
      heading: 'Checklist Project',
      table: 'checklist',
      headCost: PRODUCT_SPEC_COST_MM.checklistHead,
      rows: checkItems.map((row, index) => ({ html: checklistRow(row, index), cost: checklistRowMm(row) })),
    });
  }
  if (certs.length) {
    sections.push({
      key: 'cert',
      heading: 'Certification & Documents',
      table: 'cert',
      headCost: PRODUCT_SPEC_COST_MM.certHead,
      rows: certs.map((row) => ({ html: certRow(row), cost: certRowMm(row) })),
    });
  }
  /* ── ภาพประกอบ (หัวข้อท้าย) ──────────────────────────────────────────────
     ⚠️ **สองภาพต่อแถว และคิดต้นทุนเป็นแถว ไม่ใช่เป็นภาพ** — คิดเป็นภาพแล้วแถวที่มี
     ภาพเดียวจะถูกคิดครึ่งเดียวทั้งที่กินที่เต็มแถว · แถวสูงตามคำบรรยายที่ยาวที่สุดในแถว
     ⚠️ ภาพดึงผ่าน `/api/master/attachments/[id]/file` ซึ่งเป็นทางเดียวที่ระบบเสิร์ฟ
     ไฟล์แนบ · รูปที่ Rev ไม่ใช่ร่างอ้างอยู่ลบไฟล์ไม่ได้ (ปลดระวางแทน) ⇒ กระดาษเก่ายังเปิดรูปได้ */
  if (figures.length) {
    const rows = [];
    for (let index = 0; index < figures.length; index += 2) {
      const pair = figures.slice(index, index + 2);
      rows.push({
        html: `<div class="figGrid">${pair.map((row, offset) => figureBlock(row, index + offset + 1)).join('')}</div>`,
        cost: figureRowMm(pair.map((row, offset) => figureCaption(row, index + offset + 1))),
      });
    }
    // ⭐ ภาพประกอบขึ้นแผ่นใหม่เสมอ (มติผู้ใช้ 2026-09-22) — ตัวแบ่งหน้าอ่าน `breakBefore`
    sections.push({ key: 'figures', heading: 'ภาพประกอบรายละเอียดสินค้า', table: null, headCost: 0, rows, breakBefore: true });
  }
  return sections.map((section, index) => ({
    ...section,
    number: index + 1,
    openCost: sectionOpenMm(section),
  }));
}

/* แผ่นหนึ่ง → HTML · แถวติดกันของตารางเดียวกันรวมเป็น <table> เดียว (แถวลอยนอก <table> ไม่แสดงผล)
   ⚠️ ตารางที่เปิดใหม่ (รวมแผ่นต่อ) พิมพ์หัวตารางซ้ำเสมอ — ตัดหน้าคิดที่ให้แล้ว (`openCost`) */
function renderPage(entries, { tailHtml, continuedMark }) {
  const out = [];
  let open = null;
  const close = () => { if (open) { out.push(`${open.html}</table>`); open = null; } };
  const heading = (section, continued) => `<h3>${esc(`${section.number}. ${section.heading}${continued ? ` ${continuedMark}` : ''}`)}</h3>`;
  for (const entry of entries) {
    if (entry.kind === 'row' && entry.section.table) {
      if (open && open.section !== entry.section) close();
      if (!open) {
        const { table } = entry.section;
        const head = table === 'checklist' ? CHECKLIST_HEAD : table === 'cert' ? CERT_HEAD : '';
        open = { section: entry.section, html: `<table class="${table}">${head}` };
      }
      open.html += entry.row.html;
      continue;
    }
    close();
    if (entry.kind === 'open') out.push(heading(entry.section, false));
    else if (entry.kind === 'continue') out.push(heading(entry.section, true));
    else if (entry.kind === 'row') out.push(entry.row.html);
    else if (entry.kind === 'tail') out.push(tailHtml);
  }
  close();
  return out.join('');
}

/**
 * แผนของกระดาษหนึ่งฉบับ — ภาษา · ข้อความหัว/กล่อง · งบต่อแผ่น · หัวข้อ · การตัดหน้า (ยังไม่เป็น HTML ทั้งแผ่น)
 *
 * ⭐ แยกจาก `renderProductSpecDocument` ให้เทสต์ตรวจงบหน้าได้ตรง ๆ (ผลรวมต้นทุนต่อแผ่น ≤ งบ ·
 *    หัวข้อไม่ถูกตัดเมื่อไม่จำเป็น) และให้สวีปที่วัดด้วยเบราว์เซอร์จับคู่ "ที่ประเมิน" กับ "ที่วาดจริง" ทีละก้อน
 * @returns {{ language, L, title, titleTh, form, docNoText, preparedText, companyBlock, headerLabels,
 *   identity, headerMm, partyMm, budgets, sections, tailCost, pages }}
 */
export function planProductSpecPaper({
  snapshot = {}, document = null, revision = null, company = {}, standard = null, signatures = null,
} = {}) {
  const spec = snapshot?.spec || {};
  const product = snapshot?.product || {};
  const order = snapshot?.order || {};
  const checkItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const certs = Array.isArray(spec.certifications) ? spec.certifications : [];
  // ⭐ ภาษาของใบ = ภาษาของ SO ที่ภาพนิ่งถือ · ไม่มี (ตัวอย่าง · ภาพนิ่ง v1) = ไทย
  const language = docLanguageOf(order.docLanguage);
  const L = quotationDocLabels(language);

  const form = resolveDocumentForm(standard, SPEC_KEY);
  const titleTh = resolveDocumentTitleTh(standard, SPEC_KEY);
  const title = headerText(language, titleTh, form.title);
  // ตัวอย่าง (ไม่มีเอกสาร) = เลขที่เป็นขีด — เลขที่กับ Rev มีได้เฉพาะเอกสารที่ออกเลขแล้ว
  const docNoText = document?.docNo ? formatSpecDocNo(document.docNo, revision?.revNo) : null;
  // วันที่จัดทำ = วันที่ AC ยื่น Rev นี้ · ร่าง/ตัวอย่าง = วันที่ถ่ายภาพนิ่งสด (วันนี้)
  const preparedText = productSpecDateText(revision?.submittedAt || snapshot?.capturedAt, language);

  /* 🐞 **หัวกระดาษเคยพิมพ์ชื่อบริษัทเป็น "-"** — บล็อกกลาง (`resolveCompanyBlock`) คืนคีย์
     `legalNameTh`/`legalNameEn` แต่เปลือกอ่าน `nameTh`/`nameEn` · แม็ปที่นี่แบบเดียวกับ
     `pdrDocument.js` (เทสต์ใช้บล็อกรูปจริง ไม่ส่ง `nameTh` มาบังบั๊กแล้ว)
     ⭐ ใบอังกฤษใช้ที่อยู่อังกฤษ ถอยไปไทย (กติกาของใบเสนอราคา) */
  const companyBlock = {
    nameTh: company.legalNameTh || company.nameTh,
    nameEn: company.legalNameEn || company.nameEn,
    address: language === 'en' ? (company.addressEn || company.address) : company.address,
    taxId: company.taxId,
    phone: company.phone,
    line: company.line,
    website: company.website,
  };
  const headerLabels = { taxId: L.t('companyTaxId'), phone: L.t('companyPhone'), line: L.t('companyLine') };

  const identity = paperIdentity({ snapshot, language, L });

  /* งบแผ่นแรก = กล่องใน − หัวเอกสาร − กล่องผู้ซื้อ/อ้างอิง ประเมินจาก **ข้อความที่พิมพ์จริง** ชุดเดียวกับที่วาด
     🐞 รอบก่อนหักกล่องคู่สัญญาด้วยค่าคงที่ 31.75 ที่วัดตอนกล่องมีสามแถว — กล่องใหม่มีที่อยู่ที่ตกได้หลายบรรทัด
        และแถวอ้างอิงถึง 8 แถว (สูง 60–110) ค่าคงที่เดิมจะทำให้แผ่นแรกล้นทุกใบ */
  const headerMm = productSpecHeaderMm({
    title,
    companyName: headerText(language, companyBlock.nameTh, companyBlock.nameEn),
    companyLines: [
      companyBlock.address,
      `${headerLabels.taxId} ${companyBlock.taxId || '-'}`,
      `${headerLabels.phone} ${companyBlock.phone || '-'} · ${headerLabels.line} ${companyBlock.line || '-'}${companyBlock.website ? ` · ${companyBlock.website}` : ''}`,
    ],
  });
  const partyMm = productSpecPartyMm({
    name: identity.party.name,
    address: identity.party.address,
    partyRows: identity.party.rows,
    referenceRows: identity.reference,
  });
  const budgets = productSpecPageBudgets({ headerMm, partyMm });

  const figures = sortIllustrations(snapshotIllustrationRows(snapshot?.illustrations));
  const sections = buildSections({ spec, product, order, checkItems, certs, figures, language });
  // ลายเซ็น: ข้อความชุดเดียวกับที่วาด (ป้าย · ตำแหน่ง · ชื่อ · วันที่) ⇒ ความสูงที่จองกับที่วาดไม่หลุดจากกัน
  const signers = productSpecSigners(revision, signatures, language);
  const tailCost = signaturesMm(signers.map((signer) => signatureBoxText(signer, L)));
  const pages = paginateProductSpecSections(sections, { cost: tailCost }, budgets);
  return {
    language, L, title, titleTh, form, docNoText, preparedText, companyBlock, headerLabels,
    identity, headerMm, partyMm, budgets, sections, signers, tailCost, pages,
  };
}

/**
 * ประกอบกระดาษ FM-SA-04 หนึ่งฉบับจากภาพนิ่ง
 *
 * @param {object} input
 * @param {object} input.snapshot  ก้อนของ `buildDocumentSnapshot` (`spec` · `items` · `product` ·
 *                                 `order` · `customer` · `illustrations` · `capturedAt`)
 * @param {object|null} input.document  แถว product_spec_documents (`docNo`) — `null` = ตัวอย่าง
 *                                      จากหน้าสินค้า (เลขที่พิมพ์ขีด)
 * @param {object|null} input.revision  Rev ที่พิมพ์ (`revNo` + ตราประทับสามขั้น)
 * @param {string|null} input.watermark ข้อความลายน้ำ (`productSpecWatermark`) · `null` = ไม่มี
 * @param {object} input.company   บล็อกบริษัทจาก `getPublishedCompanyProfile`/`resolveCompanyBlock`
 *                                 (คีย์ `legalNameTh`/`legalNameEn` · `address`/`addressEn`)
 * @param {object|null} input.standard  แถว document_standard_versions ที่เผยแพร่
 * @param {object|null} input.signatures `{ submit|ae|sup: { imageDataUri, role } }` ของขั้นที่เซ็นแล้ว
 *                                 (`loadProductSpecSignatures` ฝั่ง server) · ไม่ส่ง = ช่องที่เซ็นแล้วเป็นกล่อง
 *                                 "ลายเซ็นอิเล็กทรอนิกส์" + ตำแหน่งของช่อง
 */
export function renderProductSpecDocument({
  snapshot = {}, document = null, revision = null, watermark = null,
  company = {}, standard = null, toolbar = true, signatures = null,
} = {}) {
  const plan = planProductSpecPaper({ snapshot, document, revision, company, standard, signatures });
  const {
    language, L, title, titleTh, form, docNoText, preparedText, companyBlock, headerLabels, identity, signers, pages,
  } = plan;
  const product = snapshot?.product || {};
  const formLine = `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;

  const header = documentHeader({
    company: companyBlock,
    language,
    formLine,
    titleTh,
    titleEn: form.title,
    labels: headerLabels,
    // ⭐ ป้ายชุดเดียวกับใบเสนอราคา (มติ 22/09) — "เลขที่ / No." · "วันที่ / Date"
    rows: [
      { label: L.t('number'), value: docNoText },
      { label: L.t('issueDate'), value: preparedText },
    ],
  });

  const customerHeading = L.pair('customer');
  const referenceHeading = L.pair('reference');
  const party = partyGrid({
    ariaLabel: L.isEnglish ? 'Customer and reference information' : 'ข้อมูลลูกค้าและข้อมูลอ้างอิง',
    party: {
      heading: customerHeading.text,
      headingEn: customerHeading.sub,
      name: identity.party.name,
      address: identity.party.address,
      rows: identity.party.rows,
    },
    reference: { heading: referenceHeading.text, headingEn: referenceHeading.sub, rows: identity.reference },
  });
  const tailHtml = signatureBlock(signers, L);

  /* หัวเอกสารและกล่องผู้ซื้อ/อ้างอิงอยู่แผ่นแรกแผ่นเดียว (กติกาเดียวกับ PDR หลัง IS-26080030)
     ⚠️ แผ่นที่ไม่มีหัวต้องบอกได้เองว่าเป็นใบไหน **และ Rev ไหน** ถ้าหลุดจากปึก ⇒ ท้ายกระดาษแบกหน้าที่นั้น
        (เลขที่รูปใหม่มี Rev อยู่ในตัวแล้ว) */
  const footerCenter = [formLine, docNoText].filter(Boolean).join(' · ');
  const footerLeft = headerText(language, companyBlock.nameTh, companyBlock.nameEn);
  const continuedMark = L.t('continuedMark');
  const sheets = pages.map((entries, index) => `
    <article class="sheet explicit-page" aria-label="${esc(title)} ${esc(L.t('page'))} ${index + 1}">
      ${watermarkSlot(watermark)}
      ${index === 0 ? header : ''}
      <div class="sheetContent">${index === 0 ? party : ''}${renderPage(entries, { tailHtml, continuedMark })}</div>
      ${documentFooter({
    left: footerLeft,
    center: footerCenter,
    right: `${L.t('page')} ${index + 1} / ${pages.length}`,
  })}
    </article>`).join('');

  // ชื่อไฟล์/แถบเครื่องมือ (ของคนในบริษัท) ยังพกรหัสแบบฟอร์ม — เลขที่รูปใหม่ไม่มี FM-SA-04 ในตัวแล้ว
  const fileIdentity = docNoText ? `${form.code} ${docNoText}` : `${form.code} ตัวอย่าง`;
  return renderDocumentHTML({
    lang: language,
    // ชื่อไฟล์ตอน "บันทึกเป็น PDF" — รหัส_ลูกค้า_สินค้า (มติ 2026-08-05 ของเปลือก) · ตามภาษาของใบ
    title: documentFileName(fileIdentity, identity.party.name, productDisplayNameFor(product, language)),
    accentKey: resolveDocumentAccentKey(standard, SPEC_KEY),
    variantClass: 'specsheet',
    pages: sheets,
    toolbar: toolbar === false ? null : { label: `${titleTh} (${form.code}) · ${docNoText || 'ตัวอย่าง'}`, button: 'พิมพ์เอกสาร' },
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
      .specsheet table.checklist thead th, .specsheet table.cert thead th {
        background: var(--doc-accent-soft); font-weight: 600;
      }
      .specsheet table.checklist th.no, .specsheet table.checklist td.no { width: 9mm; }
      .specsheet table.checklist th.tick, .specsheet table.checklist td.tick { width: 12mm; text-align: center; }
      .specsheet table.cert th:first-child { width: 34%; }
      .specsheet table.cert .status span { display: block; }

      /* ช่องลงนาม = .signatures ของเปลือกตัวเดียวกับ QT/SO (สี่คอลัมน์ผ่าน --sig-cols) — ที่นี่ปรับแค่ระยะ:
         อยู่ในเนื้อต่อจากหัวข้อ "Final Review" (ไม่ดันลงขอบล่างแบบกลุ่มท้ายของ QT) ห่างหัวข้อเท่าตาราง
         + **ช่องกว้างเท่ากันเสมอ** (minmax(0, 1fr)) ชื่อยาวตัดในช่องตัวเอง — ตัวจอง signaturesMm คิดทุกช่องกว้าง 40.18mm
         🐞 ตรวจรอบสาม: 1fr ของเปลือก (= minmax(auto, 1fr)) ให้ชื่อที่ไม่มีจุดตัด (อีเมลสำรองของบัญชีที่ไม่มีชื่อ) ถ่างช่องตัวเอง
            ช่องอื่นแคบจนตกหลายบรรทัด · วัดได้ก้อนลายเซ็นสูงกว่าที่จองถึง 30mm ⇒ แผ่นล้นเงียบ (.sheet ตัดทิ้ง)
         ⚠️ ไม่แก้ที่เปลือก — QT/SO จองความสูงแถวไว้ตามแบบถ่างช่อง (ตัดในช่องแล้วแถวสูง 140 → 157px เกินที่จอง 145px) */
      .specsheet .signatures { grid-template-columns: repeat(var(--sig-cols), minmax(0, 1fr)); margin-top: 0; padding-top: 0; }
      .specsheet .signatures strong { overflow-wrap: anywhere; }
      .specsheet h3.signHeading { margin-top: 2.5mm; }
      .specsheet .signTail { margin-top: auto; }

      /* แผ่นภาพประกอบ — กรอบสูงคงที่ ภาพย่อลงในกรอบโดยไม่บิดสัดส่วน */
      .specsheet .figGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm 5mm; margin: 2mm 0 4mm; }
      .specsheet .fig { margin: 0; min-width: 0; }
      .specsheet .figBox {
        height: 70mm; border: 0.2mm solid var(--doc-line); border-radius: 1mm;
        background: var(--doc-accent-soft); display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .specsheet .figBox img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .specsheet .fig figcaption {
        margin-top: 1.6mm; min-height: 2.6em; font-size: 8.4pt; line-height: 1.65; color: var(--doc-text);
        overflow-wrap: anywhere;
      }
    `,
  });
}

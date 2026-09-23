// ── เอกสาร PDR (FM-RD-01) — ใช้เปลือกเอกสารกลางเหมือน QT/SO ─────────────
//
// ⭐ **เนื้อหาตรงกับฟอร์มกระดาษเดิม** — คนที่เคยใช้กระดาษเปิดมาแล้วต้องอ่านได้ทันที
// ไม่ใช่เอกสารหน้าใหม่ที่ต้องเรียนรู้ซ้ำ ⇒ เลขข้อ (1.1, 2.8) · คำอังกฤษของหัวข้อ ·
// ช่องติ๊กที่พิมพ์ **ทุกตัวเลือก** ไม่ใช่เฉพาะที่เลือก ล้วนมาจากกระดาษจริงทั้งหมด
//
// ⭐ **หน้าตาแบบใบเสนอราคา / FM-SA-04** (มติผู้ใช้ 2026-09-23 "ปรับ เอกสาร PDR ให้ใช้ 04 / QT เป็นต้นแบบ")
//   · หัวข้อสองภาษา "ข้อมูลลูกค้า/แบรนด์ / CUSTOMER / BRAND INFORMATION" (ดู `PAPER_HEADINGS`)
//   · accent อยู่ที่ชื่อเอกสารที่เดียว · ตาราง kv เส้นบาง ป้ายแถว navy บนพื้น neutral (ดู extraCss)
//   · ช่องลงนามเป็นกล่องของเปลือก (`signatureSection`) ตัวเดียวกับ QT/SO/04 · ก้อนท้ายชิดล่างแผ่น
//   ⚠️ **ไม่มีกล่อง "ผู้ซื้อ / ข้อมูลอ้างอิง"** แบบ QT/04 — ข้อมูลลูกค้าอยู่ในข้อ 1.x ที่ RD ใช้อ้างเลขข้ออยู่แล้ว
//      ยกขึ้นกล่องแล้วเลขข้อขาดช่วง และแผ่นแรกเสียที่ 50–150mm (ขัด IS-26080030 ที่ขอให้ลดจำนวนหน้า)
//   ⚠️ **วันที่ยังเป็น ค.ศ.** ตามใบเสนอราคาตัวจริง (`fmtDate`) และมติ PDR 2026-08-10 — FM-SA-04 เป็นใบเดียวที่พิมพ์ พ.ศ.
//   ⚠️ PDR **ไม่ตรึงฉบับ** (เรนเดอร์สดทุกครั้งที่เปิด) ⇒ ใบเก่าที่เปิดพิมพ์ซ้ำได้หน้าตาใหม่ทันที เนื้อหาเท่าเดิม
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มต้องเขียนว่า
// "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด"
import {
  documentFooter, documentHeader, esc, renderDocumentHTML, signatureSection,
} from '@/lib/documents/documentShell';
import { quotationDocLabels } from '@/lib/sales/quotationMasterTemplate';
import {
  resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { SCENTOTYPES, SCENT_PERFORMANCE } from '@/lib/requests/kinds/rd/scentBriefTypes';
import {
  PDR_BRIEF_LABELS, PDR_SECTIONS, pdrFieldText, pdrSectionGroups,
} from '@/lib/requests/pdrFields';
import { PDR_TARGET_SPEC, pdrTargetFacts, pdrTargetSizeText } from '@/lib/requests/pdrTargets';
import { requestPdrScentSource, requestUsesScentBriefs } from '@/lib/master/requestTypes';
import { categoryLabel } from '@/lib/master/categoryOf';
import { estimateTextLines, lineMm } from '@/lib/sales/productSpecLayout';

const PDR_KEY = 'pdr';

// สถานะในระบบ → คำบนกระดาษ (มติผู้ใช้: ใช้สถานะของเราเป็นตัวจริง แล้วแปลตอนพิมพ์
// ⇒ คนอ่านกระดาษเห็นคำที่คุ้น คนใช้ระบบเห็นขั้นที่ละเอียดกว่า ไม่มีใครต้องติ๊กเอง)
const PAPER_STATUS = [
  ['Open', ['pending']],
  ['In Progress', ['acknowledged']],
  ['Sample Sent', ['answered']],
  ['Closed', ['closed']],
];

/* ── หัวข้อบนกระดาษ — **แบบใบเสนอราคา / FM-SA-04** (มติผู้ใช้ 2026-09-23 "ปรับเอกสาร PDR ให้ใช้ 04 / QT เป็นต้นแบบ")
   ⭐ หัวข้อสองภาษาแบบ "งวดชำระเงิน / PAYMENT SCHEDULE" ของใบเสนอราคา: คำไทยนำ + อังกฤษตัวเล็กสีจาง (`<span>`)
      · คำไทย = **ชื่อหมวดในทะเบียน** (`PDR_SECTIONS[].title` ตัวเดียวกับฟอร์ม/จอสรุป) ⇒ กระดาษกับจอเรียกหมวดเดียวกันคำเดียวกัน
      · คำอังกฤษ = หัวข้อของกระดาษ FM-RD-01 ต้นฉบับ (เดิมพิมพ์เป็นหัวข้อหลัก) ⇒ คนที่ชินกับกระดาษเดิมยังเจอคำที่คุ้น
      · เลขหมวด (1. · 2.) คงตามกระดาษเดิม — เลขข้อ 1.x / 2.x ของ RD อ้างอิงเลขนี้
   🐞 เดิม (ก่อน 23/09) หัวข้อเป็นอังกฤษล้วน 10.5pt มีคำไทยต่อท้ายเฉพาะหมวด 1 ("Customer / Brand Information ·
      ข้อมูลลูกค้า/แบรนด์") ⇒ หน้าตาคนละชุดกับ QT/SO/04 ที่ใช้คู่ "ไทย / ENGLISH" */
const SECTION_TITLE = Object.fromEntries(PDR_SECTIONS.map((s) => [s.key, s.title]));
const PAPER_HEADINGS = {
  request: { text: SECTION_TITLE.request, sub: '/ REQUEST INFORMATION' },
  customer: { text: `1. ${SECTION_TITLE.customer}`, sub: '/ CUSTOMER / BRAND INFORMATION' },
  spec: { text: `2. ${SECTION_TITLE.spec}`, sub: '/ PRODUCT SPECIFICATIONS' },
  regulatory: { text: SECTION_TITLE.regulatory, sub: '/ REGULATORY & COMPLIANCE REQUIREMENTS' },
};

/* PDR เป็นเอกสารไทยล้วน (ไม่มีระบบเลือกภาษา) — ป้ายที่ยืมจากพจนานุกรมของใบเสนอราคา (หัวช่องลงนาม · "ลงชื่อ" ·
   "วันที่ __/__/__" · ป้าย "ต่อ") อ่านผ่านตัวเดียวกับ QT/SO/04 ⇒ สี่เอกสารพิมพ์คำพวกนี้ตรงกันทุกตัวอักษร */
const DOC_L = quotationDocLabels('th');
const CONTINUED = { text: DOC_L.t('continuedMark'), sub: quotationDocLabels('en').t('continuedMark') };

// "ไทย <span>/ ENGLISH</span>" แบบ `headingHtml` ของ FM-SA-04 · `continued` = หัวข้อซ้ำบนแผ่นต่อ
// ("2. ข้อกำหนดผลิตภัณฑ์ (ต่อ) / PRODUCT SPECIFICATIONS (cont.)" — ป้าย "ต่อ" ทั้งสองภาษาแบบใบเสนอราคา)
function headingHtml({ text, sub }, { continued = false, className = '' } = {}) {
  const main = continued ? `${text} ${CONTINUED.text}` : text;
  const second = sub ? (continued ? `${sub} ${CONTINUED.sub}` : sub) : '';
  return `<h3${className ? ` class="${className}"` : ''}>${esc(main)}${second ? ` <span>${esc(second)}</span>` : ''}</h3>`;
}

const TICK_ON = '☑';
const TICK_OFF = '☐';
const LINE = '<span class="fill"></span>';

// ⭐ **ช่องที่ไม่ได้กรอก พิมพ์ว่า N/A** (มติผู้ใช้ 2026-08-07) — เดิมพิมพ์เป็นเส้นให้
// เขียนมือ ซึ่งอ่านกำกวม: เส้นว่างแปลว่า "ยังไม่กรอก" หรือ "ไม่เกี่ยวกับใบนี้" ก็ได้
// · N/A บอกชัดว่า **ระบบถามแล้วแต่ไม่มีคำตอบ** ⇒ RD อ่านแล้วรู้ทันทีว่าต้องไปถามต่อ
// ⚠️ **ยกเว้นช่องลงนาม** — ลายเซ็น ชื่อที่ยังไม่รู้ และวันที่ เว้นไว้ให้เขียนมือบนกระดาษเสมอ
// (ช่องลงนามของเปลือก: "ลงชื่อ" · (____) · "วันที่ __/__/__") พิมพ์ N/A ทับเมื่อไรก็เซ็นไม่ได้
// · `LINE` ยังใช้กับช่องที่ตั้งใจให้เขียนต่อ (1.10 · 2.9 · Scentotype)
const NA = '<span class="na">N/A</span>';
const cell = (v) => (v == null || String(v).trim() === '' ? NA : esc(v));

// ── ต้นทุนความสูงต่อบล็อก (หน่วยเป็นมิลลิเมตรบนกระดาษ A4) ─────────────────
//
// ⚠️ **วัดจากหน้าที่เรนเดอร์จริงในเบราว์เซอร์ ไม่ใช่คำนวณจากสูตร** (แนวเดียวกับ
// BILL_LINES_* ของใบแจ้งชำระภาษี) — แก้ CSS ของ `.pdr` เมื่อไรต้องวัดใหม่ทั้งชุด
//
// วิธีวัด: เปิดพรีวิว แล้วอ่าน **`offsetHeight`** ของแถว/บล็อกแต่ละชนิด หารด้วย 96/25.4
// 🐞 **ห้ามใช้ `getBoundingClientRect()`** — เปลือกย่อเอกสารด้วย `zoom` ตามความกว้างจอ
// (ZOOM_LADDER) rect จึงคืนค่าที่ย่อแล้ว · วัดครั้งแรกด้วย rect ตอน zoom .74 ได้เลขเล็ก
// กว่าจริง 1.35 เท่า ตั้งต้นทุนตามนั้นแล้วหน้าแรกล้น 254mm โดยไม่มีใครเห็น
//
// ⚠️ ล้นหน้าแล้ว **เนื้อหาหายเงียบ** เพราะ `.sheet` ของเปลือกเป็น `overflow: hidden`
// ⇒ ต้นทุนที่ตั้งต่ำเกินจริงไม่ได้แค่ทำให้หน้าดูแน่น แต่กินข้อมูลทิ้ง
//
// ── รอบวัด 2026-08-14 · หัวใบ 2 แถว (ถอด "ลูกค้า" ออก) · line-height 1.65 ──
// พื้นที่จริงต่อแผ่น: กล่อง `.sheetContent` 222.25mm หัก padding ของมันเอง
// (บน 5mm + ล่าง 4mm) เหลือ **213.25mm** ⇒ ตั้งงบไว้ 206mm เผื่อความคลาดเคลื่อน
// ของการตัดบรรทัดภาษาไทยที่เดาความกว้างไม่ได้แน่นอน (ระยะเผื่อ 7.25mm เท่ารอบก่อน)
//
// (รอบก่อน · หัวใบ 3 แถว · line-height 1.45-1.5: กล่อง 232.8 เหลือ 223.8 ⇒ งบ 216)
//
// ⚠️ **จำนวนแถวบนหัวใบเปลี่ยน = พื้นที่ต่อแผ่นเปลี่ยน** ต้องวัดใหม่ทุกครั้ง ·
// เคยเพิ่มแถวจนพื้นที่จริงเหลือ 215.4mm ทั้งที่งบยังตั้ง 217 — รอดมาได้เพราะโมเดล
// ต้นทุนประเมินสูงกว่าจริง ซึ่งเป็นความบังเอิญ ไม่ใช่ความปลอดภัย · และตอนถอดแถวออก
// ถ้าไม่ปรับกลับ งบที่ต่ำเกินจะกินหน้าเปล่าเพิ่มมาทั้งแผ่น
// ⚠️ แก้ padding ของ `.sheetContent` ก็ต้องหักเหมือนกัน — ระยะที่ไม่ได้หักคือระยะที่
// โมเดลไม่รู้ว่ามีอยู่ แล้วแผ่นจะล้นเงียบ ๆ (`.sheet` เป็น overflow: hidden)
//
// ── ⭐ **หัวเอกสารพิมพ์เฉพาะแผ่นแรก** (IS-26080030 · RD แจ้งเอง 2026-08-18) ──
// "ไม่ต้องแสดงผลหัวเอกสารในทุกหน้ากระดาษ ให้แสดงเฉพาะหน้าแรก เพื่อลดจำนวนหน้ากระดาษลง"
// ⇒ **งบต่อแผ่นมีสองค่า** แผ่นแรกเสียที่ให้หัวเอกสาร แผ่นถัดไปไม่เสีย
// 🪤 ถ้าตัดหัวออกแต่ยังใช้งบก้อนเดียว แผ่นหลังจะเว้นที่ว่างไว้เท่าความสูงหัวเอกสารทุกแผ่น
// = ตัดหัวไปแล้วแต่ไม่ได้หน้าคืนสักแผ่น ซึ่งเป็นเป้าหมายทั้งหมดของเรื่องที่แจ้งมา
//
// ── รอบวัด 2026-08-20 (headless Chrome · zoom 1) · หัวใบ **3 แถว** ────────
// เพิ่มแถว "เลขที่เอกสาร" (mig 0271) ⇒ หัวเอกสารสูงขึ้น 6.35mm แผ่นแรกจึงเสียที่
// ไปเท่านั้น · แผ่นที่ไม่มีหัวไม่ขยับเลย (275.96mm เท่าเดิม) = ยืนยันว่าวัดถูกตัว
//   หัวเอกสาร (`.documentHeader` รวม padding-bottom + เส้นคั่น)  60.06mm
//   `.sheetContent` แผ่นที่มีหัว   215.90mm  ⇒ หัก padding เอง (5+4) = 206.90 ⇒ งบ 199
//   `.sheetContent` แผ่นที่ไม่มีหัว 275.96mm  ⇒ หัก padding เอง (5+4) = 266.96 ⇒ งบ 259
// ระยะเผื่อ ≥7.25mm ทั้งสองค่า (กันการตัดบรรทัดภาษาไทยที่เดาความกว้างไม่ได้แน่)
//
// (รอบก่อน · หัวใบ 2 แถว: หัว 53.71 · มีหัว 222.25 ⇒ งบ 206 · ไม่มีหัว 275.96 ⇒ 259)
const PAGE_MM = 199;
const PAGE_REST_MM = 259;

// ความสูงหัวเอกสารที่วัดได้ (60.06mm) = ส่วนต่างของงบสองค่า — เปิดให้เทสต์ยึดไว้
// เพื่อไม่ให้มีใครตัดหัวออกแล้วลืมคืนพื้นที่ให้แผ่นหลัง (แล้วจำนวนหน้าไม่ลดสักแผ่น)
export const PDR_PAGE_BUDGET_MM = { first: PAGE_MM, rest: PAGE_REST_MM };
const COST = {
  // หัวข้อแบบใบเสนอราคา/FM-SA-04 (8.7pt · มติ 23/09) — วัดได้ h3 5.03 + margin บน 3.5 ล่าง 1.5 = 10.03
  // (เดิม 10.5pt ⇒ 6.09 + 6.6 = 12.7) · หัวข้อแรกของแผ่นไม่มี margin บน = เผื่อเกินอีก 3.5 ซึ่งเป็นทิศที่ปลอดภัย
  heading: 10.2,
  row: 7.95,
  // ตัวเลือกแบบติ๊ก — วัดจาก 2 ตัว 12.7mm · 4 ตัว 22.49mm · 6 ตัว 37.04mm
  // (บรรทัดละ 4.76mm · ตัวเลือกที่ป้ายยาวตกบรรทัดจึงเผื่อไว้เกินความสูงหนึ่งบรรทัด)
  optionBase: 2.7,
  option: 5,
  // ช่อง "ติ๊กแล้วเขียนต่อ" (สามช่องรวมเป็นข้อเดียว วัดได้ 29.63mm)
  tick: 9.9,
  // คำขยายใต้ค่า (โน้ตข้อ 1.11 · hint ของ Target Cost) ดันแถวเป็นสองบรรทัด
  note: 4.8,
  /* ก้อนท้าย (หัวข้อลงนาม + ช่องลงนามสองแถวตามฝ่าย ขาย 3 · RD 4 + Status) — ดู `pdrSignaturesMm` · รอบวัด 2026-09-23
     (headless Chrome · zoom 1 · offsetHeight ของ .signTail · จอ/สื่อพิมพ์เท่ากัน):
       ชื่อทุกช่องบรรทัดเดียว 87.31 · สองบรรทัด 96.31 · สาม 105.30 · สี่ 114.30 · หก 132.56 · เก้า 159.81
       ⇒ ฐาน 87.31 (หัวข้อ 2.5+5.03+1.5 · กล่องแถวละ 34.13 · ช่องไฟ 2.5 · Status 2.5+4.76) + 4.53 ต่อบรรทัดชื่อที่เกิน **ต่อแถว**
     🐞 เดิม (ตาราง Role/Name/Signature/Date) จองไว้ 73.6 + 7.9 = 81.5 — กล่องแบบ QT/SO สูงกว่านั้น ถ้าไม่วัดใหม่
        แผ่นสุดท้ายที่เต็มพอดีจะโดน `overflow: hidden` ตัดช่องลงนามแถวล่างทิ้ง */
  signatures: 88,
  signatureLine: 4.6,
  // ⭐ กล่องสินค้าหนึ่งตัว (ข้อ 2.1–2.7.3 · mig 0352) — ซ้าย 28% หัวสินค้า · ขวาสองคอลัมน์
  // ห้าแถว (2.1 เต็มแถว · 2.2|2.3 · 2.4|2.5 · 2.6|2.7.1 · 2.7.2|2.7.3)
  // ── รอบวัด 2026-09-11 (headless Chrome · offsetHeight) ─────────────────
  //   ข้อความสั้นทุกช่อง (N/A ครึ่งหนึ่ง)          61.65 + margin 2 = 63.65mm
  //   F+FB สองท่อน · หมายเหตุ 38 ตัว               66.67 + margin 2 = 68.67mm
  //   หมายเหตุ 300 ตัว + รายละเอียด F 120 ตัว      124.09 + margin 2 = 126.09mm
  // ⇒ ฐาน 66 (ครอบกล่องสั้นเผื่อ 2.3mm) + `halfWrapCost` ของช่องที่ยาวได้ (โมเดลได้
  //   80.4 / 128.4 สำหรับสองกล่องหลัง = ประเมินสูงกว่าจริงทุกกล่อง ซึ่งเป็นทิศที่ปลอดภัย)
  product: 66,
  // บรรทัด "ไม่มีบรีฟกลิ่น" ของใบที่เลือกกลิ่นจากทะเบียน — วัดได้ 8.73 + margin 2mm
  noBrief: 11,
};

/* ข้อความยาวตกบรรทัดในช่องค่าของตาราง — บรรทัดที่เกินหนึ่ง ด้วยตัวประมาณบรรทัดของ Sarabun ชุดเดียวกับ FM-SA-04
   🐞 เดิมนับ 75 ตัวอักษรต่อบรรทัด — ข้อความไทยที่ไม่มีช่องว่าง/ละตินคำยาวตัดบรรทัดเร็วกว่านั้น ⇒ ข้อ 1.10 ของ PDR จริง
      (RQ-SB-26090095) สูงกว่าที่จอง 1.39mm · `tickIndent` = ช่องเขียนต่อของข้อ 1.10/2.9 เยื้องซ้าย 4.5mm */
const extraLines = (text, tickIndent = 0) => (String(text ?? '').trim()
  ? textLines(text, KV_VALUE_MM - tickIndent) - 1 : 0);
// ครึ่งคอลัมน์ขวาของกล่องสินค้า (~60mm) — วัดจริงได้ ~34 ตัวอักษรไทยเต็มความกว้างต่อบรรทัด
// ⚠️ ตั้ง 30 ไม่ใช่ 34 — ประเมินต่ำ = เนื้อหาหายใต้ `overflow: hidden` · ประเมินสูง = แค่หน้าหลวม
const halfWrapCost = (text) => Math.max(0, Math.ceil(String(text || '').length / 30) - 1) * COST.note;

// ── ชิ้นส่วนที่พิมพ์ในช่องค่า ─────────────────────────────────────────────
//
// ⭐ **พิมพ์ทุกตัวเลือกเสมอ ไม่ใช่เฉพาะที่เลือก** — กระดาษมีช่องติ๊กครบทุกตัว คนอ่าน
// จึงเห็นด้วยว่า "ตัวเลือกอะไรบ้างที่ไม่ได้เลือก" ซึ่งเป็นข้อมูลคนละอย่างกับค่าที่กรอก
// (เดิมพิมพ์เป็นข้อความคั่นจุด "ขวด · ฝา" ⇒ อ่านไม่ออกว่ามีตัวเลือกอะไรอีก)
function optionList(options = [], raw) {
  const picked = new Set(
    Array.isArray(raw) ? raw : [raw].filter((v) => v != null && String(v).trim() !== ''),
  );
  return `<ul class="opts">${options
    .map((o) => `<li${picked.has(o.value) ? ' class="on"' : ''}>${picked.has(o.value) ? TICK_ON : TICK_OFF} ${esc(o.label)}</li>`)
    .join('')}</ul>`;
}

// ช่อง "ติ๊กแล้วเขียนต่อ" (1.10 · 2.9) — ติ๊กเองตามว่ามีข้อความหรือยัง ไม่มีคอลัมน์
// เก็บสถานะติ๊กแยก · ว่าง = เส้นให้เขียนมือ ไม่ใช่ N/A เพราะบรรทัดนี้ตั้งใจให้เขียนต่อได้
function tickLine(field, text) {
  const on = text != null && String(text).trim() !== '';
  return `<div class="tick">
    <span class="tickHead">${on ? TICK_ON : TICK_OFF} ${esc(field.label)}${field.hint ? ` <em>(${esc(field.hint)})</em>` : ''}</span>
    <span class="tickText">${on ? esc(text) : LINE}</span>
  </div>`;
}

/* ⭐ ช่องติ๊กที่มีข้อความเขียนต่อ (1.15 Archetype · 12 ตัวเลือก) — พิมพ์ครบทุกตัวเหมือนช่องติ๊ก
   อื่น แต่ **สามคอลัมน์** (12 บรรทัดเรียงลงกินครึ่งแผ่น) · ตัวที่ติ๊กเต็มแถวพร้อมข้อความต่อท้าย
   (ท่าเดียวกับ Scentotype บนกระดาษ: "☑ CAREGIVER — ดูแลแขกเหมือนคนในบ้าน") */
const NOTES_OF = Object.fromEntries(
  PDR_SECTIONS.flatMap((s) => s.fields).filter((f) => f.type === 'notes').map((f) => [f.of, f]),
);
function notedOptionList(field, request) {
  const picked = new Set(Array.isArray(request[field.column]) ? request[field.column] : []);
  const notes = request[NOTES_OF[field.key]?.column] || {};
  return `<ul class="opts cols">${(field.options || []).map((o) => {
    const on = picked.has(o.value);
    const note = on ? String(notes[o.value] ?? '').trim() : '';
    return `<li${on ? ' class="on"' : ''}>${on ? TICK_ON : TICK_OFF} ${esc(o.label)}${note ? ` — ${esc(note)}` : ''}</li>`;
  }).join('')}</ul>`;
}
/* ต้นทุนของกริดสามคอลัมน์ — **เดินตามการวางจริงของ CSS grid** ไม่ใช่นับแบบรวมก้อน
   🐞 รอบแรกนับ "ติ๊ก + ceil(ไม่ติ๊ก/3)" ⇒ ประเมินต่ำ (ผลรีวิวก่อน merge 2026-09-11): ตัวที่ติ๊ก
      กินเต็มแถว (`grid-column: 1 / -1`) และ auto-placement เดินหน้าอย่างเดียว ⇒ แถวที่ยังไม่เต็ม
      ก่อนหน้ามันถูกปิดทิ้ง · และข้อความเขียนต่อ (≤200 ตัว) ตกบรรทัดในช่องค่า ~75 ตัว/บรรทัด
      ⇒ ต้นทุนต่ำกว่าจริง = เนื้อหาถูก `overflow: hidden` ของแผ่นกินทิ้ง */
const notedOptionCost = (field, request) => {
  const picked = new Set(Array.isArray(request[field.column]) ? request[field.column] : []);
  const notes = request[NOTES_OF[field.key]?.column] || {};
  let lines = 0;
  let fill = 0;
  for (const o of field.options || []) {
    if (picked.has(o.value)) {
      if (fill) { lines += 1; fill = 0; }
      // ⚠️ 55 ตัว/บรรทัด ไม่ใช่ 75 ของช่องค่าทั่วไป — ตัวที่ติ๊กเป็นตัวหนา และวัดจริง (2026-09-11 ·
      //    ข้อความ 200 ตัวติดกัน) ได้ ~60 ตัว/บรรทัด · ตั้งต่ำกว่าจริงไว้ ประเมินเกิน = แค่หน้าหลวม
      const text = `${o.label} — ${String(notes[o.value] ?? '').trim()}`;
      lines += Math.max(1, Math.ceil(text.length / 55));
      continue;
    }
    fill += 1;
    if (fill === 3) { lines += 1; fill = 0; }
  }
  if (fill) lines += 1;
  return COST.option * lines;
};

/* ⭐ ช่องเลือกที่ต่อท้ายด้วยค่าจากทะเบียน (`withContext` · 1.8 ใหม่/เก่า + ไทย/ต่างชาติ · ม-151)
   🐞 **เอกสารวาดช่องเลือกเป็นกล่องติ๊กเอง ไม่ผ่าน `pdrFieldText`** ⇒ #1791 ขึ้นไทย/ต่างชาติบนจอสรุป/ฟอร์ม
      แต่กระดาษ PDR ไม่มีเลย (ผู้ใช้ทักจาก RQ-FD-26090194) · วาดเป็นกล่องติ๊กชุดที่สองต่อท้าย ค่าติ๊กตามทะเบียน */
function contextOptionList(field, context) {
  if (!field.withContext) return '';
  return optionList(field.withContext.options || [], context?.[field.withContext.key]);
}

function fieldValueHtml(field, request, context) {
  if (field.type === 'multi' && NOTES_OF[field.key]) return notedOptionList(field, request);
  if (field.type === 'select' || field.type === 'multi') {
    return optionList(field.options || [], request[field.column]) + contextOptionList(field, context);
  }
  const text = pdrFieldText(field, request, context);
  if (field.type === 'tick') return tickLine(field, text);
  return cell(text);
}

function fieldValueCost(field, request, context) {
  if (field.type === 'multi' && NOTES_OF[field.key]) return notedOptionCost(field, request);
  if (field.type === 'select' || field.type === 'multi') {
    return COST.option * ((field.options || []).length + (field.withContext?.options || []).length);
  }
  if (field.type === 'tick') {
    /* ช่องติ๊กเขียนต่อ: ว่าง = หัว + เส้นให้เขียน (COST.tick วัดจากช่องว่าง) · มีข้อความ = หัว + ข้อความ + margin 0.8
       🐞 ช่องที่มีข้อความสูง 9.79 + 0.8 ต่อช่อง (วัด 2026-09-23 · RQ-SB-26090095) มากกว่า COST.tick ⇒ เคยจองต่ำ */
    const text = pdrFieldText(field, request, context);
    return String(text ?? '').trim()
      ? 2 * BODY_MM + 0.8 + extraLines(text, 4.5) * BODY_MM
      : COST.tick;
  }
  return COST.row + (field.hint ? COST.note : 0) + extraLines(pdrFieldText(field, request, context)) * BODY_MM;
}

// แถวหนึ่งของตาราง = หนึ่ง "ข้อ" บนกระดาษ (บางข้อมีหลายช่องอยู่ในกล่องเดียว)
//
// ⚠️ ช่องที่ประกาศ `inHeader` ในทะเบียนถูกพิมพ์ไว้บนหัวใบแล้ว ⇒ คืน `tr: null` ให้
// ผู้เรียกข้ามไป · พิมพ์ซ้ำในตารางด้วยอ่านแล้วเหมือนเป็นคนละค่ากัน
function groupRow(group, request, context) {
  if (group.fields.every((f) => f.inHeader)) return { tr: null, cost: 0 };
  // ⭐ `docLabel` = ป้ายเฉพาะบนกระดาษ (เช่น "ดีล" บนจอ → "โครงการ" บนเอกสาร)
  const title = (group.fields.length === 1 && group.fields[0].docLabel) || group.title;
  const head = `${group.no ? `<span class="no">${esc(group.no)}</span>` : ''}${esc(title)}`;
  // ช่องเดี่ยวที่มี hint (เช่นโน้ตสีแดงข้อ 1.11) — กระดาษเขียนโน้ตไว้ในช่องค่า
  const single = group.fields.length === 1 ? group.fields[0] : null;
  // ⭐ 1.12 ของใบที่เลือกกลิ่นจากทะเบียน — บอกว่านับจากไหน (ใบพัฒนากลิ่นนับจาก SO ตามเดิม)
  const hint = single?.key === 'scentCount' && requestPdrScentSource(request) === 'registry'
    ? 'นับจากกลิ่นของสินค้าในข้อ 2' : single?.hint;
  const note = single && single.type !== 'tick' && hint
    ? `<span class="note">${esc(hint)}</span>` : '';
  const body = group.fields.map((f) => fieldValueHtml(f, request, context)).join('');
  // ⚠️ ขอบบนล่างของช่องคิด **ครั้งเดียวต่อแถว** ไม่ใช่ต่อช่องที่อยู่ในแถวเดียวกัน ·
  // ต้นทุนของแถวข้อความธรรมดา (COST.row) รวมขอบไว้แล้วจึงไม่บวกซ้ำ
  const stacked = group.fields.some((f) => ['select', 'multi', 'tick'].includes(f.type));
  /* ⚠️ แถวสูงเท่าช่องที่สูงกว่า — ป้ายยาวตกสองบรรทัดได้ (ป้ายหนา 600 ตามแบบ 04 · เช่นแถวเดิม
     "2.7 ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น (บันทึกไว้เดิม)") ขณะที่ค่าบรรทัดเดียว ⇒ แถวสูงกว่าที่จองจากค่า
     (วัดจริง 12.44 vs จอง 7.95 · PDR จริง RQ-SB-26080003) */
  const labelMm = ROW_BASE_MM + labelLines(group.no, title) * BODY_MM;
  const cost = Math.max(labelMm, (stacked ? COST.optionBase : 0) + (note && !single?.hint ? COST.note : 0)
    + group.fields.reduce((sum, f) => sum + fieldValueCost(f, request, context), 0));
  return { tr: `<tr><th>${head}</th><td>${body}${note}</td></tr>`, cost };
}

// ── ข้อ 2.1–2.7 รายสินค้า (mig 0229 · 0352) — กล่องละหนึ่งสินค้า ─────────────
//
// ⭐ **กล่องทรงเดียวกับบรีฟกลิ่น** (มติผู้ใช้ 2026-09-11 · ม็อกไฟนอล) — ซ้าย: "สินค้าที่ N —
// หมวด" + ขนาด · จำนวน · ขวา: ข้อ 2.1–2.7.3 สองคอลัมน์ · เดิมพิมพ์ 2.2/2.3 เป็นสองแถวที่
// รวมทุกสินค้า ⇒ พอสเปกย้ายลงแถว คนอ่านต้องไล่จับคู่เองว่าบรรทัดไหนของสินค้าไหน
// ⚠️ ข้อความทุกข้อมาจาก `pdrTargetFacts` ตัวเดียวกับจอสรุป · ข้อ 2.5 พิมพ์ครบทุกตัวเลือก
//    พร้อมช่องติ๊กเหมือนช่องติ๊กอื่นบนกระดาษ
// ⚠️ ใบที่ยังไม่มีรายการต้องได้แถว N/A เหมือนช่องอื่น ไม่ใช่หายไปทั้งข้อ — กระดาษที่
// พิมพ์ออกไปต้องบอกได้ว่า "ถามแล้วแต่ยังไม่มีคำตอบ"
const TEXTURE_SPEC = PDR_TARGET_SPEC.find((f) => f.key === 'texture');

function productBlock(row, index, { categoryName, scentSource }) {
  const facts = pdrTargetFacts(row, { scentSource });
  const sub = (f) => {
    const body = f.key === 'texture'
      ? optionList(TEXTURE_SPEC.options, row.texture)
      : `<span class="subBody">${cell(f.value)}</span>`;
    return `<div class="sub${f.key === 'scent' ? ' wide' : ''}">
      <span class="subHead"><span class="no">${esc(f.no)}</span>${esc(f.label)}</span>${body}
    </div>`;
  };
  return `<section class="briefBlock prodBlock">
    <div class="briefLeft">
      <h4>สินค้าที่ ${index + 1} — ${esc(categoryName(row.categoryCode))}</h4>
      <p class="briefText">${cell(pdrTargetSizeText(row))}</p>
    </div>
    <div class="briefRight prodRight">${facts.map(sub).join('')}</div>
  </section>`;
}

const productCost = (row, { scentSource }) => {
  const facts = pdrTargetFacts(row, { scentSource });
  const long = facts.filter((f) => f.key === 'cost' || f.key === 'note' || f.key === 'color');
  return COST.product + long.reduce((sum, f) => sum + halfWrapCost(f.value), 0);
};

// ── 2.1 บรีฟกลิ่น — สองคอลัมน์เหมือนกระดาษ ───────────────────────────────
//
// ⭐ กระดาษวาง "กลิ่นที่ต้องการ / บรีฟกลิ่น" ไว้คอลัมน์ซ้าย แล้ว 2.1.1–2.1.5 เรียงลง
// คอลัมน์ขวาในกล่องเดียวกัน — เรียงเป็นแถวเดี่ยวเหมือนหัวข้ออื่นจะอ่านคนละจังหวะกับกระดาษ
//
// ⚠️ Performance (2.1.4) และ Scentotype (2.1.5) พิมพ์ครบทุกตัวเลือกพร้อมช่องติ๊ก ·
// Scentotype มีเส้นให้เขียนต่อหลังทุกตัวบนกระดาษ ⇒ ตัวที่ติ๊กแล้วพิมพ์ข้อความต่อท้าย (mig 0222)
//
// 🐞 **บรีฟยาวเคยถูกตัดทิ้งบนกระดาษจริง** (ตรวจ 2026-09-23 · PDR จริง 35 ใบ · อ่านอย่างเดียว) — กล่องบรีฟเป็นก้อน
//    ตัดกลางไม่ได้ และต้นทุนเดิมนับ 75 ตัว/บรรทัด (ความกว้างช่องตาราง) ทั้งที่คอลัมน์บรีฟกว้างแค่ ~88mm และไม่นับ
//    การขึ้นบรรทัดใหม่ของบรีฟ (pre-wrap) ⇒ สามใบพิมพ์บรีฟหายไปใต้ `overflow: hidden` ของแผ่น:
//    RQ-SB-26090014 (154 + 232mm) · RQ-SB-26090185 (80mm) · RQ-SB-26090097 (7–45mm สี่แผ่น) — บรีฟรับได้ 4,000 ตัว
//    และ 2.1.1–2.1.3 อีกช่องละ 2,000 ⇒ สูงกว่าหนึ่งแผ่นได้จริง
// ⇒ (1) ต้นทุนกล่องคิดด้วยตัวประมาณบรรทัดของ Sarabun ชุดเดียวกับ FM-SA-04 (`estimateTextLines`) บนความกว้างคอลัมน์ที่วัดจริง
//   (2) กล่องที่สูงกว่าหนึ่งแผ่นเปล่า **ต่อข้ามแผ่นเป็นกล่องสองคอลัมน์ของบรีฟเดียวกัน** (`splitBrief`) — หัวกล่อง
//       "… (ต่อ)" · ซ้ายต่อบรีฟ · ขวาต่อ 2.1.1–2.1.5 · ข้อความยาวตัดที่ขอบคำ — ไม่มีข้อความไหนหายจากกระดาษ
//   ⭐ มติผู้ใช้ 2026-09-23 (ดูภาพก่อน/หลัง RQ-SB-26090185): รอบแรกแตกบรีฟยาวเป็นแถวตาราง ⇒ ผู้ใช้ถาม "แยกทำไม บรีฟ
//      มันจัดกลุ่มอยู่มั้ย" — บรีฟต้องยังเป็นกล่องเดียวกันทั้งก้อน แม้ข้ามแผ่น

// ความกว้างข้อความที่วัดจริง (headless Chrome · zoom 1 · 2026-09-23): คอลัมน์บรีฟ 88.37 / 88.64 · ช่องค่าตาราง 125.38
// ⚠️ ปัดลง — ประเมินช่องแคบกว่าจริง = บรรทัดมากกว่าจริง = ทิศที่ปลอดภัย · แก้ CSS ช่อง/padding ต้องวัดใหม่
const BRIEF_COL_MM = 88.2;
const KV_VALUE_MM = 125.2;
// ช่องป้ายแถว (th 56mm หัก padding) วัดได้ 51.83 · ป้ายที่มีเลขข้อเสียที่ให้ `.no` (min-width 9mm) ไปก่อน
const KV_LABEL_MM = 51.5;
const labelLines = (no, label) => textLines(label, KV_LABEL_MM - (no ? 9 : 0));
const BODY_MM = lineMm(8.4); // ข้อความ 8.4pt × 1.65
const SUBHEAD_MM = lineMm(7.8); // ป้ายข้อย่อย 7.8pt
const H4_MM = lineMm(8.6); // หัวกล่อง 8.6pt
// กรอบแถวตาราง kv (padding 1.2 บนล่าง + เส้น) — FM-SA-04 วัดได้ 2.72 + n × 4.89 · เผื่อการปัดพิกเซลของ Chrome
const ROW_BASE_MM = 2.9;
// แถวที่ตัดข้ามแผ่นต้องเหลือบนแผ่นเดิมอย่างน้อยเท่านี้ — น้อยกว่านี้ยกทั้งแถวไปแผ่นใหม่ (บรรทัดกำพร้าอ่านยาก)
const MIN_SPLIT_LINES = 3;

// จำนวนบรรทัดของข้อความ — ว่าง = N/A หนึ่งบรรทัด
const textLines = (text, widthMm, { pt = 8.4, preWrap = false } = {}) => {
  const t = String(text ?? '').trim();
  return t ? Math.max(1, estimateTextLines(t, widthMm, pt, { preWrap })) : 1;
};

/* 🐞 **อักขระที่วาดกับที่ประมาณไม่ตรงกัน** (ผลตรวจก่อน merge) — แปลง **ก่อนทั้งวาดและประมาณ** ⇒ สองฝั่งนับของชิ้นเดียวกัน
   · แท็บ (บรีฟที่วางมาจาก Excel/Google Sheets) — Chrome วาดถึงจุดหยุดทุก 8 ช่อง ตัวประมาณนับเท่าช่องว่างเดียว ⇒ บรีฟ 40
     บรรทัดที่มีแท็บวาดสูง 412mm ขณะจอง 217mm (ถูกตัดทิ้ง 146mm) ⇒ ช่องว่าง 4 ตัว
   · CR เดี่ยว — HTML ตีเป็นขึ้นบรรทัด แต่ตัวประมาณแยกบรรทัดเฉพาะ \n ⇒ บรีฟ 70 บรรทัดคั่นด้วย CR ล้น 216mm ⇒ \n
   · NBSP — Chrome ไม่ตัดบรรทัดตรงนั้น ข้อความไทยที่เชื่อมด้วย NBSP ตกบรรทัดมากกว่าที่ประมาณ ⇒ ช่องว่างธรรมดา
   ⚠️ แปลงเฉพาะตอนพิมพ์ — ข้อมูลในฐานไม่แตะ */
const paperText = (value) => (value == null ? value
  : String(value).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u00a0/g, ' '));
const BRIEF_TEXT_KEYS = ['label', 'brief', 'researchTopic', 'inspiration', 'likedNotes', 'dislikedNotes'];
const paperBrief = (brief = {}) => ({
  ...brief, ...Object.fromEntries(BRIEF_TEXT_KEYS.map((key) => [key, paperText(brief[key])])),
});

function scentotypeList(brief = {}) {
  const picked = new Set(brief.scentotypes || []);
  const notes = brief.scentotypeNotes || {};
  return `<ul class="opts">${SCENTOTYPES.map((t) => {
    const on = picked.has(t.value);
    const note = on ? String(notes[t.value] || '').trim() : '';
    return `<li${on ? ' class="on"' : ''}>${on ? TICK_ON : TICK_OFF} ${esc(t.label)} ${note ? esc(note) : LINE}</li>`;
  }).join('')}</ul>`;
}
// บรรทัดของ Scentotype ทั้งชุด — ตัวที่มีข้อความเขียนต่อตกบรรทัดได้ (โน้ต ≤ 200 ตัว)
const scentotypeLines = (brief = {}, widthMm) => SCENTOTYPES.reduce((sum, t) => {
  const note = (brief.scentotypes || []).includes(t.value) ? String(brief.scentotypeNotes?.[t.value] || '').trim() : '';
  return sum + (note ? textLines(`${TICK_ON} ${t.label} ${note}`, widthMm) : 1);
}, 0);

const briefTitle = (index, total) => (total > 1 ? `บรีฟกลิ่นที่ ${index + 1}` : 'กลิ่นที่ต้องการ / บรีฟกลิ่น');

/* ── กล่องบรีฟ = ชิ้นสองสาย (ซ้าย · ขวา) ──────────────────────────────────────────
   ซ้าย: บรีฟ (pre-wrap) → "หากต้องการให้ทำวิจัย ระบุ" · ขวา: 2.1.1 → 2.1.2 → 2.1.3 → 2.1.4 → 2.1.5
   กล่องที่ลงหนึ่งแผ่นเปล่าได้ = ท่อนเดียว (หน้าตาเดิม) · สูงกว่านั้น = ตัวแบ่งหน้าเติมทีละท่อนเท่าที่แผ่นเหลือ
   (`splitBrief`) — ทุกท่อนเป็นกล่องสองคอลัมน์ของบรีฟเดียวกัน หัวกล่องท่อนต่อมี "(ต่อ)" · ข้อย่อยที่ถูกตัดกลาง
   ขึ้นป้ายเดิม + "(ต่อ)" บนท่อนถัดไป · ท่อนต่อที่ซ้ายหมดแล้วเหลือแค่หัวกล่อง (ขวายังต่อ) — กล่องยังเป็นกล่องเดิม
   ⚠️ ความสูงคิดจากชิ้นชุดเดียวกับที่วาด (`briefPieceMm`) ⇒ ท่อนที่ตัดสินว่า "พอ" คือท่อนที่วาดแล้วพอจริง */

// ⚠️ ป้าย + เลขข้อจากทะเบียน `PDR_BRIEF_LABELS` — 2.1.4 Performance · 2.1.5 Scentotype
//    ตามไฟล์ของ AE (มติผู้ใช้ 2026-09-11 · สลับกับลำดับเดิม)
function briefFlow(brief = {}, index = 0, total = 1) {
  const L = PDR_BRIEF_LABELS;
  const paper = (key) => L[key].paper || L[key].label;
  const sub = (no, label, text) => ({ kind: 'sub', no, label, text: text ?? '' });
  return {
    title: `2.1 ${briefTitle(index, total)}${brief.label ? ` — ${brief.label}` : ''}`,
    cont: false,
    left: [{ kind: 'para', text: brief.brief ?? '' }, sub('', paper('researchTopic'), brief.researchTopic)],
    right: [
      sub(L.inspiration.no, paper('inspiration'), brief.inspiration),
      sub(L.likedNotes.no, paper('likedNotes'), brief.likedNotes),
      sub(L.dislikedNotes.no, paper('dislikedNotes'), brief.dislikedNotes),
      { kind: 'opts', no: L.performance.no, label: L.performance.label,
        html: optionList(SCENT_PERFORMANCE, brief.performance), lines: SCENT_PERFORMANCE.length },
      { kind: 'opts', no: L.scentotypes.no, label: L.scentotypes.label,
        html: scentotypeList(brief), lines: scentotypeLines(brief, BRIEF_COL_MM) },
    ],
  };
}

/* ความสูงรายชิ้น — บรีฟ: บรรทัด (pre-wrap) + margin 1.6 · ข้อย่อย: ป้าย 7.8pt + บรรทัดข้อความ/ตัวเลือก + margin 1.2
   (ข้อย่อยตัวสุดท้ายของคอลัมน์ไม่มี margin จริง — นับไว้ = เผื่อ 1.2) · กล่อง: padding 1.6+1.6 + เส้น 0.2+0.2 + ปัดพิกเซล 1
   รอบวัด 2026-09-23: บรีฟว่าง วาด 89.96 · ตัวนี้คิด 92.0 */
const BRIEF_CHROME_MM = 3.2 + 0.4 + 1;
const briefPieceMm = (p) => (p.kind === 'para'
  ? textLines(p.text, BRIEF_COL_MM, { preWrap: true }) * BODY_MM + 1.6
  : SUBHEAD_MM + (p.kind === 'opts' ? p.lines : textLines(p.text, BRIEF_COL_MM)) * BODY_MM + 1.2);
const briefHeadMm = (flow) => textLines(`${flow.title}${flow.cont ? ` ${CONTINUED.text}` : ''}`, BRIEF_COL_MM, { pt: 8.6 }) * H4_MM + 1.2;
const sumMm = (pieces) => pieces.reduce((sum, p) => sum + briefPieceMm(p), 0);
const briefSegmentMm = (flow) => Math.max(briefHeadMm(flow) + sumMm(flow.left), sumMm(flow.right)) + BRIEF_CHROME_MM;

const briefPieceHtml = (p) => {
  if (p.kind === 'para') return `<p class="briefText">${cell(p.text)}</p>`;
  const head = `<span class="subHead">${p.no ? `<span class="no">${esc(p.no)}</span>` : ''}${esc(p.label)}${
    p.cont ? ` ${esc(CONTINUED.text)}` : ''}</span>`;
  return `<div class="sub">${head}${p.kind === 'opts' ? p.html : `<span class="subBody">${cell(p.text)}</span>`}</div>`;
};
const briefSegmentHtml = (flow) => `<section class="briefBlock${flow.cont ? ' cont' : ''}">
    <div class="briefLeft"><h4>${esc(flow.title)}${flow.cont ? ` ${esc(CONTINUED.text)}` : ''}</h4>${flow.left.map(briefPieceHtml).join('')}</div>
    <div class="briefRight">${flow.right.map(briefPieceHtml).join('')}</div>
  </section>`;
const briefFlowItem = (base, flow) => ({ ...base, flow, html: briefSegmentHtml(flow), cost: briefSegmentMm(flow) });

export function pdrBriefBlockMm(input = {}, index = 0, total = 1) {
  return briefSegmentMm(briefFlow(paperBrief(input), index, total));
}

// ชิ้นข้อความที่ยาวเกินที่เหลือ — ตัดที่ขอบคำให้ได้บรรทัดเต็มที่ที่พอ (ตัวเลือก/ช่องว่างตัดไม่ได้)
function splitBriefPiece(p, roomMm) {
  if (p.kind === 'opts' || !String(p.text ?? '').trim()) return null;
  const fixed = p.kind === 'para' ? 1.6 : SUBHEAD_MM + 1.2;
  const lines = Math.floor((roomMm - fixed) / BODY_MM);
  if (lines < MIN_SPLIT_LINES) return null;
  const cut = takeLines(p.text, lines, BRIEF_COL_MM, { preWrap: p.kind === 'para' });
  return cut ? [{ ...p, text: cut[0] }, { ...p, text: cut[1], cont: true }] : null;
}
function fillColumn(pieces, roomMm) {
  const placed = [];
  let used = 0;
  for (const [i, piece] of pieces.entries()) {
    const mm = briefPieceMm(piece);
    if (used + mm <= roomMm) { placed.push(piece); used += mm; continue; }
    const parts = splitBriefPiece(piece, roomMm - used);
    if (parts) return { placed: [...placed, parts[0]], rest: [parts[1], ...pieces.slice(i + 1)] };
    return { placed, rest: pieces.slice(i) };
  }
  return { placed, rest: [] };
}
/* ตัดกล่องบรีฟหนึ่งท่อนให้พอที่เหลือ `roomMm` — คืน [ท่อนที่ลงแผ่นนี้, ท่อนที่เหลือ] หรือ null (เริ่มแผ่นนี้ไม่ได้)
   ⚠️ ท่อนแรกต้องได้บรีฟอย่างน้อยส่วนหนึ่ง — กล่องที่ซ้ายมีแต่หัวกล่องบนท่อนแรกอ่านเหมือนบรีฟว่าง ⇒ ยกไปแผ่นใหม่ */
function splitBrief(item, roomMm) {
  const { flow } = item;
  const inner = roomMm - BRIEF_CHROME_MM;
  const left = fillColumn(flow.left, inner - briefHeadMm(flow));
  const right = fillColumn(flow.right, inner);
  if (!flow.cont && !left.placed.length) return null;
  // 🐞 ผลตรวจก่อน merge: ท่อนแรกที่ขวาว่าง (2.1.1 ยังเริ่มไม่ได้) อ่านเหมือน 2.1.1–2.1.5 ไม่ได้กรอก ⇒ ยกไปแผ่นใหม่เหมือนกัน
  if (!flow.cont && flow.right.length && !right.placed.length) return null;
  if (!left.placed.length && !right.placed.length) return null;
  if (!left.rest.length && !right.rest.length) return null;
  return [
    briefFlowItem(item, { ...flow, left: left.placed, right: right.placed }),
    briefFlowItem(item, { ...flow, cont: true, left: left.rest, right: right.rest }),
  ];
}

/* ── แถวตารางที่ตัดข้ามแผ่นได้ (ข้อที่สูงกว่าหนึ่งแผ่น เช่น 2.9 เต็มเพดาน · ดู groupSplitRows) ──────────────
   แถว kv หนึ่งแถว: ป้าย | [หัวข้อตัวหนา] + ข้อความยาว (pre-wrap) · ตัวแบ่งหน้าเรียก `splitRow` เมื่อแถวไม่พอที่
   ⇒ ส่วนแรกลงแผ่นนี้เท่าที่พอ ส่วนที่เหลือขึ้นแผ่นใหม่ ป้ายต่อท้าย "(ต่อ)" */
const splitRowTr = (split, text, first) => `<tr><th>${split.thHtml}${first ? '' : ` ${esc(CONTINUED.text)}`}</th><td class="pre">${
  first && split.lead ? `<strong class="lead">${esc(split.lead)}</strong>` : ''}${cell(text)}</td></tr>`;
// ⚠️ แถวสูงเท่าช่องที่สูงกว่า — ป้ายยาว ("2.1.1 แรงบันดาลใจ (Why แก่นของแบรนด์)") ตกสองบรรทัดในช่องป้าย
//    ขณะที่ค่าเป็น N/A บรรทัดเดียว ⇒ นับบรรทัดของป้ายด้วย ไม่งั้นแถวสูงเกินที่จอง
const splitRowMm = (split, text, first) => ROW_BASE_MM + Math.max(
  split.thLines,
  (first && split.lead ? textLines(split.lead, split.widthMm) : 0) + textLines(text, split.widthMm, { preWrap: true }),
) * BODY_MM;
function splitRowItem(base, text, first) {
  const split = { ...base.split, text, first };
  return { ...base, split, tr: splitRowTr(split, text, first), cost: splitRowMm(split, text, first) };
}

/* ตัดข้อความให้ได้ไม่เกิน `maxLines` บรรทัด — ตัดที่ขอบคำ (Intl.Segmenter ภาษาไทย) · ค้นแบบทวิภาค
   บนตัวประมาณบรรทัดชุดเดียวกับที่คิดต้นทุน ⇒ ส่วนที่ได้ไม่ยาวเกินที่จองไว้
   คืน `null` เมื่อตัดไม่ได้ (คำแรกก็ยาวเกินแล้ว) */
const HAS_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
const WORDS = HAS_SEGMENTER ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const GRAPHEMES = HAS_SEGMENTER ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
const cutsOf = (source, segmenter) => (segmenter
  ? [...segmenter.segment(source)].map((s) => s.index + s.segment.length)
  : Array.from({ length: source.length }, (_, i) => i + 1));
function longestFit(source, cuts, maxLines, widthMm, preWrap) {
  let lo = 0;
  let hi = cuts.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const head = source.slice(0, cuts[mid]).trimEnd();
    if (!head || estimateTextLines(head, widthMm, 8.4, { preWrap }) <= maxLines) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best < 0 ? null : cuts[best];
}
/* 🐞 ผลตรวจก่อน merge: ตัดได้แค่ขอบคำ ⇒ คำเดียวที่ยาวเกินที่เหลือ (URL/รหัสยาว 4,000 ตัวไม่มีช่องว่าง) ตัดไม่ได้เลย
   แม้บนแผ่นเปล่า ⇒ ทั้งก้อนถูกวางแล้วล้นแผ่น · ถอยไปตัดระดับตัวอักษร (grapheme) แบบ overflow-wrap: anywhere ของ Chrome */
function takeLines(text, maxLines, widthMm, { preWrap = true } = {}) {
  const source = String(text ?? '');
  const at = longestFit(source, cutsOf(source, WORDS), maxLines, widthMm, preWrap)
    ?? longestFit(source, cutsOf(source, GRAPHEMES), maxLines, widthMm, preWrap);
  if (at == null) return null;
  const head = source.slice(0, at).trimEnd();
  const tail = source.slice(at).replace(/^[ \t]*\r?\n?/, '');
  return head && tail.trim() ? [head, tail] : null;
}

function splitRow(item, roomMm) {
  const { split } = item;
  const lead = split.first && split.lead ? textLines(split.lead, split.widthMm) : 0;
  const lines = Math.floor((roomMm - ROW_BASE_MM) / BODY_MM) - lead;
  // ป้ายสองบรรทัดกับข้อความบรรทัดเดียวก็สูงสองบรรทัด — ส่วนแรกต้องได้อย่างน้อยเท่าป้าย
  if (lines < Math.max(MIN_SPLIT_LINES, split.thLines)) return null;
  const cut = takeLines(split.text, lines, split.widthMm);
  if (!cut) return null;
  return [splitRowItem(item, cut[0], split.first), splitRowItem(item, cut[1], false)];
}

/* แถวข้อที่สูงกว่าหนึ่งแผ่นเปล่า — แยกเป็นแถวรายช่องที่ตัดข้ามแผ่นได้ (ป้ายข้อเดิมทุกแถว · ชื่อช่องเป็นหัวตัวหนา)
   🐞 ผลตรวจก่อน merge (มีมาตั้งแต่ก่อนรอบนี้): 2.9 Value Proposition รวมสามช่องติ๊กเขียนต่อ (ช่องละ ≤ 2,000 ตัว) เป็นแถวเดียว
      ที่ตัดกลางไม่ได้ ⇒ สามช่องเต็มเพดานสูง ~340mm เกินแผ่น · ท้าย Value ถูก `overflow: hidden` ตัดทิ้ง ~68mm
   ช่องเลือก/ช่องที่ว่างยังเป็นแถวปกติ (ช่องติ๊กว่างยังเป็นเส้นให้เขียนมือ) — ตัดข้ามแผ่นเฉพาะข้อความยาว */
const SPLITTABLE_TYPES = new Set(['text', 'textarea', 'tick']);
function groupSplitRows(group, request, context, base) {
  const title = (group.fields.length === 1 && group.fields[0].docLabel) || group.title;
  const thHtml = `${group.no ? `<span class="no">${esc(group.no)}</span>` : ''}${esc(title)}`;
  const thLines = labelLines(group.no, `${title} ${CONTINUED.text}`);
  return group.fields.map((field) => {
    const text = paperText(pdrFieldText(field, request, context));
    if (!SPLITTABLE_TYPES.has(field.type) || String(text ?? '').trim() === '') {
      const valueMm = ['select', 'multi', 'tick'].includes(field.type)
        ? COST.optionBase + fieldValueCost(field, request, context) : fieldValueCost(field, request, context);
      return {
        ...base, type: 'row', tr: `<tr><th>${thHtml}</th><td>${fieldValueHtml(field, request, context)}</td></tr>`,
        cost: Math.max(ROW_BASE_MM + thLines * BODY_MM, valueMm),
      };
    }
    const lead = field.type === 'tick'
      ? `${TICK_ON} ${field.label}${field.hint ? ` (${field.hint})` : ''}`
      : (group.fields.length > 1 ? field.label : '');
    return splitRowItem({ ...base, type: 'row', split: { thHtml, thLines, lead, widthMm: KV_VALUE_MM } }, text, true);
  });
}

// ช่องลงนาม 7 ช่อง — ชื่อเติมจากที่ระบบรู้ ที่เหลือกรอกในฟอร์ม PDR (mig 0221)
//
// ⭐ **กล่องลงนามชุดเดียวกับ QT/SO/FM-SA-04** (มติผู้ใช้ 2026-09-23 "ใช้ 04 / QT เป็นต้นแบบ") — `signatureSection`
// ของเปลือก: หน่วยงาน (ไทย) · ตำแหน่งเต็ม (อังกฤษ) · ที่ว่าง "ลงชื่อ" · (ชื่อ) · "วันที่ __/__/__"
// ⇒ เดิมเป็นตาราง Role / Name / Signature / Date ของตัวเอง ซึ่งเป็นช่องลงนามแบบที่สี่ที่ไม่มีเอกสารอื่นใช้
// ⚠️ **ยังเซ็นมือบนกระดาษทั้งหมด** (PDR ไม่มีขั้นอนุมัติในระบบให้ประทับรูปลายเซ็น) ⇒ ทุกช่องเป็นช่องเซ็นมือของ
//    เปลือก ไม่มี `esignature` · ชื่อที่รู้แล้วพิมพ์ในวงเล็บ ช่องที่ยังไม่มีชื่อเป็นเส้นให้เขียน (ไม่ใช่ N/A —
//    ช่องลงนามต้องเขียนมือได้ กติกาเดิมของ `LINE`)
//
// ⚠️ ผูกกับ **ตำแหน่ง ไม่ใช่ชื่อคนที่พิมพ์ไว้ในกระดาษ** — ชื่อที่ฝังในแม่แบบจะค้าง
// ทันทีที่คนเปลี่ยนงาน · **ช่องแรกช่องเดียว**ที่มาจากแถวคำร้อง (ระบบรู้ว่าใครเปิดใบ)
// ที่เหลือเป็น **ชื่อบนกระดาษ** ที่กรอกเองต่อใบ ไม่ใช่ role ในระบบ (ม-45)
//
// 🐞 **ช่อง AE Supervisor เคยเป็นช่องที่สองที่ระบบเติมให้** จาก `approvedByName` ของ
// ประตูหัวหน้า (mig 0216) · ถอดขั้นนั้นทั้งขั้นใน ม-121 แล้วไม่มีใครเขียนคอลัมน์นั้น
// อีก ⇒ พิมพ์ `N/A` ค้างทุกใบ และไม่มีช่องไหนบนฟอร์มกรอกมันได้
// ⇒ ย้ายเข้าชุด `signers` (ม-124 · mig 0261) กรอกได้เหมือนอีก 5 ช่อง
//
// ⚠️ ตำแหน่ง (`label`) และหน่วยงาน (`paperTeam`) ของช่องที่กรอกเองทั้งหมด **อ่านจากทะเบียน `pdrFields.js`**
// ไม่สะกดซ้ำที่นี่ — เปลี่ยนชื่อตำแหน่งแล้วต้องเปลี่ยนพร้อมกันทั้งฟอร์ม จอ และกระดาษ
// ⚠️ **ลำดับช่องบนกระดาษ = ลำดับในทะเบียน** ไม่ได้เรียงที่นี่
// ⭐ **สองแถวตามฝ่าย กว้างเต็มกระดาษ** (มติผู้ใช้ 2026-09-23 "final review แบ่งสองบรรทัดตามฝ่ายแล้วขยายให้กว้างพอดีกระดาษ")
//    แถวบน = ฝ่ายขาย (AE · AE Supervisor · Sale & Marketing Manager = 3 ช่อง) · แถวล่าง = ฝ่าย RD (4 ช่อง) — แถวละหนึ่ง
//    `signatureSection` ของเปลือก ⇒ แต่ละแถวแบ่งความกว้างเท่ากันตามจำนวนช่องของตัวเอง (`--sig-cols` ของเปลือก)
//    🐞 รอบแรกเรียง 7 ช่องต่อกันสี่ช่องต่อแถว ⇒ แถวล่างเหลือช่องว่างหนึ่งช่อง และฝ่ายขายกับ RD ปนกันในแถวเดียว
//    ⚠️ ช่องที่ทะเบียนไม่ระบุ `paperRow` ตกแถว RD (ทะเบียนมีเทสต์ให้ระบุครบทุกช่อง)
const SIGNER_SECTION = PDR_SECTIONS.find((s) => s.key === 'signers');
const SIGN_SEATS = [
  { team: DOC_L.t('salesTeam'), role: 'Account Executive', column: 'requestedByName', row: 'sales' },
  ...(SIGNER_SECTION?.fields || []).map((f) => ({
    team: f.paperTeam || f.label, role: f.label, column: f.column, row: f.paperRow === 'sales' ? 'sales' : 'rd',
  })),
];
const SIGN_ROWS = ['sales', 'rd'].map((row) => SIGN_SEATS.filter((seat) => seat.row === row)).filter((row) => row.length);

/* ความสูงก้อนท้าย — แถวกล่องสูงตามชื่อที่ยาวที่สุดของแถว (กริดยืดทั้งแถว)
   ชื่อพิมพ์ในวงเล็บ ตัวหนา 7.8pt ในช่องข้อความกว้าง (186 − ช่องไฟ 2.5 × (n − 1)) / n − padding 2+2 − เส้น ≈
   แถวสามช่อง 55.7mm · แถวสี่ช่อง 40.0mm ⇒ นับบรรทัดด้วยตัวประมาณของ Sarabun ชุดเดียวกับ FM-SA-04 (`signaturesMm` ของ 04)
   🐞 รอบแรกนับ 22 ตัวต่อบรรทัด — ผลตรวจก่อน merge: ชื่อละตินตัวพิมพ์ใหญ่ ("MR. WORAWUT WONGWATTANAKUL (MANAGER)")
      กว้างกว่าที่เดา ตก 3 บรรทัดขณะจอง 2 ⇒ ก้อนท้ายสูงกว่าที่จอง 8–25mm · ประเมินต่ำ = แถวล่างถูกตัดทิ้งเงียบ ๆ
   🐞 ก่อนนั้นจองค่าคงที่ — ชื่อ 80 ตัวขึ้นไป (ช่องรับได้ 200) ล้นแผ่นจริง 5–176px */
const signNameMm = (columns) => Math.floor(((186 - 2.5 * (columns - 1)) / columns - 4.6) * 10) / 10;
const signNameLines = (name, columns) => (name ? textLines(`(${name})`, signNameMm(columns), { pt: 7.8 }) : 1);
const signerOf = (request) => (seat) => ({ label: seat.team, role: seat.role, name: String(request[seat.column] ?? '').trim() });
// export ให้เทสต์ตรึงกับค่าที่วัดจริง (pdrDocument.test.mjs) — ตัวจองต่ำกว่าที่วาด = แถวล่างถูกตัดทิ้งเงียบ ๆ
export function pdrSignaturesMm(request = {}) {
  const extra = SIGN_ROWS.reduce((sum, row) => sum
    + Math.max(...row.map((seat) => signNameLines(signerOf(request)(seat).name, row.length))) - 1, 0);
  return COST.signatures + extra * COST.signatureLine;
}

const statusBlock = (request) => `<p class="status">Status: ${PAPER_STATUS
  .map(([label, list]) => `<span class="st${list.includes(request.status) ? ' on' : ''}">${list.includes(request.status) ? TICK_ON : TICK_OFF} ${esc(label)}</span>`)
  .join('')}</p>`;

/* หัวข้อ "การตรวจสอบและอนุมัติ / FINAL REVIEW & APPROVAL" คำเดียวกับ FM-SA-04 (`specFinalReview`) + ช่องลงนามสองแถว + Status
   ⭐ ก้อนท้ายชิดขอบล่างของแผ่น (`.signTail` · margin-top: auto) แบบกลุ่มท้ายของ QT/SO/04 — ตัวแบ่งหน้าตัดสินเหมือนเดิม */
const signatureBlock = (request) => `<div class="signTail">
  ${headingHtml(DOC_L.pair('specFinalReview'), { className: 'signHeading' })}${
  SIGN_ROWS.map((row) => signatureSection(row.map(signerOf(request)), DOC_L)).join('')}
  ${statusBlock(request)}
</div>`;

// ── จัดแบ่งหน้า ──────────────────────────────────────────────────────────
//
// เดินตามลำดับเนื้อหาแล้วขึ้นหน้าใหม่เมื่อต้นทุนสะสมเกินหนึ่งแผ่น · หัวข้อที่ยาวข้าม
// หน้าได้ แต่ต้องพิมพ์หัวข้อซ้ำพร้อมคำว่า "(ต่อ)" ⇒ หน้าที่สองอ่านออกเองโดยไม่ต้อง
// ย้อนกลับไปดูหน้าก่อน
//
// ⚠️ หัวข้อ **ห้ามค้างท้ายหน้าโดยไม่มีแถวตามมา** — ขึ้นหน้าใหม่พร้อมกับแถวแรกเสมอ
//
// ⚠️ **งบของแผ่นที่กำลังเติมอยู่ ไม่ใช่งบก้อนเดียว** — แผ่นแรกเสียที่ให้หัวเอกสาร
// แผ่นถัดไปไม่มีหัว จึงรับได้มากกว่า (ดูรอบวัดที่ `PAGE_REST_MM`)
function paginate(items) {
  const pages = [];
  let page = [];
  let used = 0;
  const budget = () => (pages.length === 0 ? PAGE_MM : PAGE_REST_MM);
  const breakPage = (item) => {
    pages.push(page);
    page = [];
    used = 0;
    // ตัดกลางหัวข้อ = เปิดหน้าใหม่ด้วยหัวข้อเดิม + "(ต่อ)"
    // ⚠️ ต้องครอบ **บล็อกบรีฟด้วย ไม่ใช่เฉพาะแถวตาราง** — ใบที่มีหลายกลิ่นจะมีหน้าที่
    // ขึ้นต้นด้วยกล่อง 2.1 ล้วน ๆ ถ้าไม่พิมพ์หัวข้อซ้ำ หน้านั้นจะไม่บอกว่าตัวเองคือหัวข้อไหน
    if (item.heading) {
      page.push({ type: 'heading', section: item.section, html: headingHtml(item.heading, { continued: true }), cost: COST.heading });
      used += COST.heading;
    }
  };
  /* หัวข้อกินที่ของตัวเองบวก **ก้อนแรกที่ตามมาจริง** ตอนตัดสินใจ
     🐞 เดิมบวกแค่ `COST.row` (แถวข้อความบรรทัดเดียว) ⇒ หัวข้อที่ก้อนแรกสูงกว่านั้นมาก ค้างท้ายแผ่นโดยไม่มีแถวตาม
        (ผลตรวจ 23/09: PDR จริง 25 ใน 35 ใบมีหัวข้อค้างท้ายแผ่น · ใบตัวอย่าง "Regulatory & Compliance Requirements"
        ค้างท้ายหน้า 3 ส่วนแถวแรกของมันคือช่องติ๊ก 7 ตัว ~40mm ขึ้นหน้า 4 ไปคนเดียว) — ผิดกติกาข้างบนตรง ๆ
     ⚠️ แถวที่ตัดข้ามแผ่นได้ ขอแค่ส่วนแรกขั้นต่ำ (MIN_SPLIT_LINES) ไม่ใช่ทั้งแถว */
  const lookahead = (item, next) => {
    if (item.type !== 'heading') return 0;
    if (!next || next.type === 'heading') return COST.row;
    if (next.split) {
      const lead = next.split.first && next.split.lead ? textLines(next.split.lead, next.split.widthMm) : 0;
      return Math.min(next.cost, ROW_BASE_MM + (lead + MIN_SPLIT_LINES) * BODY_MM);
    }
    // กล่องบรีฟที่ต่อข้ามแผ่นได้ — ขอแค่หัวกล่อง + บรีฟขั้นต่ำ
    if (next.flow && next.canSplit) {
      return Math.min(next.cost, BRIEF_CHROME_MM + briefHeadMm(next.flow) + MIN_SPLIT_LINES * BODY_MM + 1.6);
    }
    return next.cost;
  };
  for (const [index, original] of items.entries()) {
    let item = original;
    for (;;) {
      if (used + item.cost + lookahead(item, items[index + 1]) <= budget()) break;
      // แถวข้อความยาว/กล่องบรีฟยาว: ส่วนแรกลงแผ่นนี้เท่าที่พอ ส่วนที่เหลือต่อแผ่นใหม่ (วนจนลงหมด — ยาวกว่าหลายแผ่นก็ได้)
      const splitter = item.split ? splitRow : (item.flow && item.canSplit ? splitBrief : null);
      if (splitter) {
        const parts = splitter(item, budget() - used);
        if (parts) {
          page.push(parts[0]);
          used += parts[0].cost;
          breakPage(item);
          [, item] = parts;
          continue;
        }
      }
      /* ⚠️ แผ่นที่มีแต่หัวข้อ = ขึ้นแผ่นใหม่ก็ไม่ช่วย (ก้อนสูงกว่าทั้งแผ่น) ⇒ วางต่อหัวข้อตรงนี้
         🐞 ไม่มีบรรทัดนี้ หัวข้อกับก้อนยักษ์จะวนแยกกัน: หัวข้อได้แผ่นเปล่าของตัวเอง ก้อนไปล้นแผ่นถัดไป */
      if (!page.some((entry) => entry.type !== 'heading')) break;
      breakPage(item);
    }
    page.push(item);
    used += item.cost;
  }
  if (page.length) pages.push(page);
  return pages;
}

// รวมแถวที่ติดกันของหัวข้อเดียวกันให้อยู่ในตารางเดียว — แถวลอยนอก <table> ไม่แสดงผล
function renderPage(items) {
  const out = [];
  let open = null;
  const close = () => { if (open) { out.push(`${open}</table>`); open = null; } };
  for (const item of items) {
    if (item.type === 'row') {
      if (!open) open = '<table class="kv">';
      open += item.tr;
      continue;
    }
    close();
    out.push(item.html);
  }
  close();
  return out.join('');
}

export function renderPdrDocument({
  request = {}, briefs = [], company = {}, form = null, standard = null, toolbar = true,
} = {}) {
  // ผู้เรียกส่ง `form` มาตรง ๆ ได้ (ค่าที่ resolve แล้ว) ไม่งั้นอ่านจากมาตรฐานที่ส่งมา
  const resolved = form || resolveDocumentForm(standard, PDR_KEY);
  const formLine = resolved.code
    ? `${resolved.code}: Rev. No.${resolved.revision}. ${resolved.effectiveDate}`
    : '';
  const titleTh = resolveDocumentTitleTh(standard, PDR_KEY);

  // ⭐ หัวข้อ · ป้ายชื่อ · ลำดับ · เลขข้อ · การแปลง enum มาจาก `lib/requests/pdrFields.js`
  // ที่เดียวกับฟอร์มและจอแสดง
  //
  // ⚠️ ค่าที่ระบบเติมให้มาจาก server (`findRequest`) — เอกสารเป็นฟังก์ชันบริสุทธิ์
  // โหลดเองไม่ได้ · ไม่มี context = ช่องพวกนั้นพิมพ์ N/A
  //
  // 🐞 เดิมบรรทัดนี้ต่อ `scentCount: briefs.length` ไว้ **หลัง spread** ⇒ ทับค่าที่
  // `pdrContext` คำนวณมาจากใบสั่งขายทิ้งทุกครั้ง · ใบที่ AE รวบ 3 กลิ่นเป็นบรีฟเดียว
  // (โหมดที่ฟอร์มเปิดให้ทำ) จะพิมพ์ลงกระดาษว่า "1 กลิ่น" ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3
  const context = { briefs, ...(request.pdrContext || {}) };

  const header = documentHeader({
    // ⚠️ resolveCompanyBlock คืนคีย์ legalNameTh/legalNameEn ส่วนเปลือกรับ nameTh/nameEn
    // (แม็ปแบบเดียวกับ billPrint/ganttPrint/reportPrint) — ลืมแม็ปแล้วหัวเอกสารขึ้น "-"
    company: {
      nameTh: company.legalNameTh,
      nameEn: company.legalNameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    formLine,
    titleTh,
    titleEn: standard?.titleEn || resolved.title || 'PRODUCT DEVELOPMENT REQUEST (PDR)',
    // ⚠️ **"วันที่ร้องขอ" ย้ายลงไปอยู่ในก้อน Request Information แล้ว** (มติผู้ใช้
    // 2026-08-08) — เดิม hardcode ที่นี่ด้วย `createdAt` ⇒ สองปัญหา: ฟอร์มกับหน้า
    // รายละเอียดไม่มีช่องนี้เลย และร่างที่ค้างไว้หลายวันจะพิมพ์วันที่สร้างร่างแทนวันที่ยื่นจริง
    //
    // ⚠️ เปลือกรับ `{ label, value }` **ไม่ใช่คู่ [label, value]** — ส่งเป็น array
    // เมื่อไรได้ `<dt></dt><dd>-</dd>` คือหัวใบไม่มีทั้งเลขที่เอกสารและชื่อลูกค้า
    //
    // ⚠️ **"โครงการ" อยู่ในเนื้อหา ไม่ใช่หัวใบ** (มติผู้ใช้ 2026-08-09) — หัวใบเก็บไว้
    // เฉพาะสิ่งที่ใช้ระบุตัวใบ ส่วนโครงการเป็นข้อมูลของงาน จึงอยู่ในก้อน
    // "1. Customer Information" ต่อจากชื่อบริษัท (ธง `docLabel` ในทะเบียน)
    //
    // ⚠️ **"ลูกค้า" ถอดออกจากหัวใบแล้ว** (มติผู้ใช้ 2026-08-14) — ด้วยเหตุผลเดียวกับ
    // โครงการ: ชื่อลูกค้าเป็นข้อมูลของงาน ไม่ใช่ตัวระบุใบ และมันพิมพ์อยู่แล้วที่ข้อ 1.3
    // "ชื่อบริษัท" ในก้อน Customer Information ⇒ หัวใบเหลือ เลขที่ · วันที่
    // 🪤 **ถอดแถวหัวใบ = พื้นที่ต่อแผ่นเปลี่ยน** ต้องปรับ `PAGE_MM` ตามทุกครั้ง
    // (ดูหมายเหตุที่ `PAGE_MM` — ไม่ปรับกลับ งบที่ต่ำเกินจะกินหน้าเปล่าเพิ่มมาทั้งแผ่น)
    //
    // ⚠️ "วันที่" ถูกถอดออกจากตารางข้างล่างแล้ว (ธง `inHeader`) — พิมพ์สองที่บนแผ่น
    // เดียวกันอ่านแล้วเหมือนคนละค่า
    //
    // ⭐ **สองเลขคนละตัว อยู่คนละบรรทัด** (มติผู้ใช้ 2026-08-20 · IS-26080030 ข้อ 1)
    //   `เลขที่เอกสาร` (DDMMYY-XXX) = เลข ISO ของฝ่าย RD ต่อจากรหัสแบบฟอร์มที่พิมพ์
    //     อยู่บรรทัด `formLine` แล้ว ⇒ อ่านคู่กันได้เป็น FM-RD-01-200869-016 เหมือน
    //     กระดาษเดิม · ออกตอน **รับเรื่อง** จึงว่างได้ถ้ายังไม่มีใครรับ (พิมพ์ "-")
    //   `เลขที่คำร้อง` (SB-26080001) = เลขของใบในระบบ ออกตอนผู้ขอกดส่ง
    // ⚠️ **ป้าย "เลขที่เอกสาร" ย้ายมือ ไม่ใช่ป้ายใหม่** — เดิมมันเป็นป้ายของ `docNo`
    // (แถวล่าง) · มติ 2026-08-20 ให้ `docNo` เป็น "เลขที่คำร้อง" ตามชื่อจริงของมัน
    // แล้วยกคำว่า "เอกสาร" มาให้เลข ISO ซึ่งเป็นเลขของ *ตัวกระดาษ* จริง ๆ
    // 🪤 ใครแก้ป้ายสองแถวนี้ต้องแก้พร้อมกัน — สลับผิดคู่แล้วหัวใบยังดูปกติทุกประการ
    // (ดู lib/requests/pdrRefNo.js)
    // 🪤 **แถวหัวใบเพิ่ม = พื้นที่ต่อแผ่นลด** ต้องวัด `PAGE_MM`/`PAGE_REST_MM` ใหม่
    // ทั้งคู่ทุกครั้ง (ดูหมายเหตุที่ `PAGE_MM`)
    rows: [
      { label: 'เลขที่เอกสาร', value: request.pdrRefNo },
      { label: 'เลขที่คำร้อง', value: request.docNo },
      { label: 'วันที่', value: context.requestedAt },
    ],
  });

  const items = [];
  // แถวหนึ่งข้อ — สูงกว่าหนึ่งแผ่นเปล่า (หักที่ของหัวข้อต่อ) แยกเป็นแถวรายช่องที่ตัดข้ามแผ่นได้ (ดู groupSplitRows)
  const pushGroup = (section, heading, group) => {
    const { tr, cost } = groupRow(group, request, context);
    if (!tr) return;
    if (cost > PAGE_REST_MM - COST.heading) {
      items.push(...groupSplitRows(group, request, context, { section, heading }));
      return;
    }
    items.push({ type: 'row', section, heading, tr, cost });
  };
  const pushSection = (key) => {
    const section = PDR_SECTIONS.find((s) => s.key === key);
    if (!section) return;
    const heading = PAPER_HEADINGS[key] || { text: section.title, sub: '' };
    items.push({ type: 'heading', section: key, html: headingHtml(heading), cost: COST.heading });
    for (const group of pdrSectionGroups(section, request, context)) pushGroup(key, heading, group);
  };

  pushSection('request');
  pushSection('customer');

  items.push({ type: 'heading', section: 'spec', html: headingHtml(PAPER_HEADINGS.spec), cost: COST.heading });
  const scentSource = requestPdrScentSource(request);
  if (requestUsesScentBriefs(request)) {
    // ⚠️ ใบที่ยังไม่มีบรีฟก็ต้องได้กล่อง 2.1 เปล่า — กระดาษที่พิมพ์ไปเขียนมือต่อได้
    const list = (briefs.length ? briefs : [{}]).map(paperBrief);
    for (const [index, brief] of list.entries()) {
      // ⭐ กล่องที่ลงแผ่นเปล่าได้ = ก้อนเดียวตัดกลางไม่ได้ (ตามกระดาษ) · สูงกว่านั้น = ต่อข้ามแผ่นเป็นกล่องเดียวกัน
      //    (`canSplit` · ดูหมายเหตุที่ briefFlow) — กล่องที่ลงแผ่นถัดไปได้ทั้งก้อนไม่ถูกตัดแค่เพราะแผ่นนี้เหลือที่น้อย
      const item = briefFlowItem({ type: 'atom', section: 'spec', heading: PAPER_HEADINGS.spec }, briefFlow(brief, index, list.length));
      // ⚠️ หักหัวข้อต่อแผ่นด้วย — กล่องที่ขึ้นแผ่นใหม่มี "2. ข้อกำหนดผลิตภัณฑ์ (ต่อ)" นำเสมอ (เกณฑ์เดียวกับ pushGroup)
      items.push({ ...item, canSplit: item.cost > PAGE_REST_MM - COST.heading });
    }
  } else {
    /* ⭐ ใบที่เลือกกลิ่นจากทะเบียน (พัฒนาสูตร NPD) — **บอกว่าไม่มีบรีฟ** ไม่ใช่เว้นไปเฉย ๆ
       RD ที่คุ้นกับกระดาษพัฒนากลิ่นจะมองหากล่อง 2.1 · บรรทัดนี้บอกว่ากลิ่นไปอยู่ที่ไหน */
    items.push({
      type: 'atom', section: 'spec', heading: PAPER_HEADINGS.spec,
      html: '<p class="noBrief">ไม่มีบรีฟกลิ่น — กลิ่นเลือกจากทะเบียนในข้อ 2.1 ของสินค้าแต่ละตัว</p>',
      cost: COST.noBrief,
    });
  }
  // ⭐ สินค้ารายตัว (ข้อ 2.1–2.7.3) — ต้องมาก่อนข้ออื่นของหมวดสเปก ตามเลขข้อบนกระดาษ
  const targets = Array.isArray(request.targets) ? request.targets : [];
  const categoryName = (code) => categoryLabel(code, context.categories || []) || code;
  if (!targets.length) {
    items.push({
      type: 'row', section: 'spec', heading: PAPER_HEADINGS.spec,
      tr: `<tr><th>สินค้าที่ขอพัฒนา</th><td>${cell(null)}</td></tr>`,
      cost: COST.row,
    });
  }
  for (const [index, row] of targets.entries()) {
    items.push({
      type: 'atom', section: 'spec', heading: PAPER_HEADINGS.spec,
      html: productBlock(row, index, { categoryName, scentSource }),
      cost: productCost(row, { scentSource }),
    });
  }
  const specSection = PDR_SECTIONS.find((s) => s.key === 'spec');
  for (const group of pdrSectionGroups(specSection, request, context)) pushGroup('spec', PAPER_HEADINGS.spec, group);

  pushSection('regulatory');
  // ⚠️ ช่องลงนามกับบรรทัด Status เป็น **ก้อนเดียว** — แยกกันเมื่อไรมีโอกาสที่ Status
  // หลุดไปลอยอยู่หน้าใหม่ตัวเดียว ซึ่งอ่านแล้วไม่รู้ว่าเป็นสถานะของอะไร
  items.push({
    type: 'atom',
    section: 'signers',
    html: signatureBlock(request),
    cost: pdrSignaturesMm(request),
  });

  const pages = paginate(items);
  // ⭐ **หัวเอกสารอยู่แผ่นแรกแผ่นเดียว** (IS-26080030) — ดูเหตุผลและรอบวัดที่ `PAGE_MM`
  //
  // ⚠️ แผ่นที่ไม่มีหัวยังต้อง **บอกได้เองว่าเป็นใบไหน** ถ้าหลุดจากปึก ⇒ ท้ายกระดาษ
  // แบกหน้าที่นั้นแทน: ชื่อบริษัท · รหัสแบบฟอร์ม + เลขที่คำร้อง · เลขหน้า
  // (เดิมท้ายกระดาษมีแค่รหัสแบบฟอร์ม ซึ่งเหมือนกันทุกใบ = ระบุใบไม่ได้)
  const footerCenter = [formLine, request.docNo].filter(Boolean).join(' · ');
  const sheets = pages.map((pageItems, index) => `
    <article class="sheet explicit-page" aria-label="${esc(titleTh)} หน้า ${index + 1}">
      ${index === 0 ? header : ''}
      <div class="sheetContent">${renderPage(pageItems)}</div>
      ${documentFooter({
    left: company.legalNameTh,
    center: footerCenter,
    right: `หน้า ${index + 1} / ${pages.length}`,
  })}
    </article>`).join('');

  return renderDocumentHTML({
    title: `PDR ${request.docNo || ''}`.trim(),
    accentKey: resolveDocumentAccentKey(standard, PDR_KEY),
    variantClass: 'pdr',
    pages: sheets,
    // ⚠️ พรีวิวในหน้าตั้งค่าฝังเป็น iframe — ปุ่มพิมพ์ในนั้นพิมพ์แค่ใบตัวอย่าง
    // ผู้เรียกจึงปิดแถบเครื่องมือได้ (แบบเดียวกับ billPrint/ganttPrint)
    toolbar: toolbar === false ? null : { label: `${titleTh} (PDR)`, button: 'พิมพ์เอกสาร' },
    extraCss: `
      /* ⚠️ หัวเอกสารมีแค่เส้นคั่น ไม่มีระยะใต้เส้น — หัวข้อแรกจึงไปแปะติดเส้นเลย
         (ผู้ใช้ทักเอง 2026-08-09) · ระยะนี้ถูกหักออกจากงบต่อหน้าแล้วที่ PAGE_MM */
      .pdr .sheetContent { gap: 0; padding-top: 5mm; }
      /* ⭐ **หน้าตาแบบใบเสนอราคา / FM-SA-04** (มติผู้ใช้ 2026-09-23 "ปรับ เอกสาร PDR ให้ใช้ 04 / QT เป็นต้นแบบ")
         หัวข้อในเนื้อ = หัวข้อ "งวดชำระเงิน / PAYMENT SCHEDULE" ของใบเสนอราคา ตัวเดียวกับหัวข้อของ FM-SA-04:
         navy 8.7pt · ภาษารองสีจาง 7.2pt/500 · ห่างก้อนบน 3.5 · ห่างตาราง 1.5 (ต้นทุน COST.heading)
         ⚠️ ห้ามใช้ backtick ในคอมเมนต์ของก้อนนี้ — ทั้งก้อน CSS อยู่ใน template literal */
      .pdr h3 { margin: 3.5mm 0 1.5mm; color: var(--doc-navy); font-size: 8.7pt; }
      .pdr h3 span { color: var(--doc-muted); font-size: 7.2pt; font-weight: 500; }
      /* 🐞 ต้องเจาะจงลูกตรงของ .sheetContent — h3:first-child เฉย ๆ ไปโดนหัวข้อในก้อนลงนามด้วย
         (มันเป็นลูกคนแรกของกล่องตัวเอง) ⇒ หัวข้อลงนามแปะติดตารางข้างบนสนิท
         กฎนี้มีไว้ตัดระยะของหัวข้อ **แรกสุดของแผ่น** เท่านั้น */
      .pdr .sheetContent > h3:first-child { margin-top: 0; }
      .pdr .na { color: var(--doc-muted); font-style: italic; }

      /* ⭐ **สีแบบใบเสนอราคา — accent อยู่ที่ชื่อเอกสาร (h1 ของเปลือก) ที่เดียว** (กติกาเดียวกับ FM-SA-04 รอบสี่)
         เลขข้อ (1.1 · 2.8) สีเดียวกับป้ายแถว (navy) · คำขยายใต้ค่า (โน้ตข้อ 1.11 · hint ของ 2.2) สีจางแบบบรรทัดรอง
         ของตารางรายการในใบเสนอราคา · ป้ายแถว = ตัวอักษร navy บนพื้น neutral แบบ .installmentTable th / ตาราง kv ของ 04
         🐞 เดิมเลขข้อกับคำขยายเป็นสี accent (terracotta) ⇒ ทั้งแผ่นมีจุดส้มกระจายเป็นร้อยจุด ดูเป็นเอกสารคนละชุดกับ QT/SO/04 */
      .pdr .no { display: inline-block; min-width: 9mm; font-weight: 600; }

      /* ตาราง kv = ตาราง kv ของ FM-SA-04 (เส้นบาง --doc-line · ป้ายแถว navy 600 บนพื้น neutral · padding 1.2/2)
         ⚠️ คอลัมน์ป้ายคง 56mm (ไม่ใช่ 38% ของ 04) — ความกว้างช่องป้าย/ค่าที่วัดไว้ (KV_LABEL_MM · KV_VALUE_MM)
            คือตัวหารของตัวประมาณบรรทัด แก้ความกว้างหรือ padding ต้องวัดใหม่ */
      .pdr table.kv { width: 100%; table-layout: fixed; border-collapse: collapse; }
      .pdr table.kv th, .pdr table.kv td {
        padding: 1.2mm 2mm; vertical-align: top; border: 0.2mm solid var(--doc-line);
        font-size: 8.4pt; line-height: 1.65; text-align: left; overflow-wrap: anywhere; }
      .pdr table.kv th { width: 56mm; color: var(--doc-navy); font-weight: 600;
        background: var(--doc-neutral-soft); }
      .pdr .note { display: block; margin-top: .6mm; color: var(--doc-muted); font-size: 7.4pt; }
      /* แถวที่ตัดข้ามแผ่นได้ (ข้อที่สูงกว่าหนึ่งแผ่น เช่น 2.9 เต็มเพดาน) — ข้อความพิมพ์ตามบรรทัดที่พิมพ์มา
         ชื่อช่องนำเป็นหัวตัวหนา (.lead) · บรีฟยาวไม่ใช้ทางนี้ (ต่อเป็นกล่องสองคอลัมน์เดิม) */
      .pdr table.kv td.pre { white-space: pre-wrap; }
      .pdr table.kv td.pre .lead { display: block; color: var(--doc-navy); white-space: normal; }

      /* ตัวเลือกแบบติ๊ก — พิมพ์ครบทุกตัวเหมือนกระดาษ ตัวที่เลือกเน้นเข้ม */
      .pdr .opts { margin: 0; padding: 0; list-style: none; }
      .pdr .opts li { display: flex; gap: 1.2mm; color: var(--doc-muted); line-height: 1.65; overflow-wrap: anywhere; }
      .pdr .opts li.on { color: var(--doc-text); font-weight: 600; }

      /* ช่อง "ติ๊กแล้วเขียนต่อ" (1.10 · 2.9) */
      .pdr .tick { display: block; margin-bottom: .8mm; }
      .pdr .tick:last-child { margin-bottom: 0; }
      .pdr .tickHead { display: block; font-weight: 600; }
      .pdr .tickHead em { color: var(--doc-muted); font-size: 7.4pt; font-style: normal; font-weight: 400; }
      .pdr .tickText { display: block; padding-left: 4.5mm; }

      /* 2.1 — ซ้าย: บรีฟกลิ่น · ขวา: 2.1.1–2.1.5 (วางตามกระดาษ) · เส้นชุดเดียวกับตาราง kv
         ⚠️ **สองคอลัมน์กว้างเท่ากันเสมอ** (minmax(0, 1fr)) + ข้อความทุกชิ้นตัดคำกลางได้ (overflow-wrap: anywhere)
         🐞 ผลตรวจก่อน merge: 1fr = minmax(auto, 1fr) ⇒ URL/รหัสยาวไม่มีจุดตัดในชื่อบรีฟหรือโน้ต Scentotype ถ่างคอลัมน์ตัวเอง
            (ซ้าย 69 / ขวา 116mm) ขณะที่ตัวประมาณ/ตัวตัดคิดคอลัมน์ละ 88.2mm ⇒ กล่องสูงกว่าที่จอง 45–83mm ถูกตัดทิ้ง */
      .pdr .briefBlock { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        border: 0.2mm solid var(--doc-line); break-inside: avoid; }
      .pdr .briefLeft { padding: 1.6mm 2mm; border-right: 0.2mm solid var(--doc-line);
        background: var(--doc-neutral-soft); }
      .pdr .briefRight { padding: 1.6mm 2mm; }
      .pdr .briefBlock h4 { margin: 0 0 1.2mm; color: var(--doc-navy); font-size: 8.6pt; overflow-wrap: anywhere; }
      .pdr .briefText { margin: 0 0 1.6mm; font-size: 8.4pt; line-height: 1.65;
        white-space: pre-wrap; overflow-wrap: anywhere; }
      .pdr .sub { margin-bottom: 1.2mm; font-size: 8.4pt; line-height: 1.65; }
      .pdr .sub:last-child { margin-bottom: 0; }
      .pdr .subHead { display: block; color: var(--doc-navy); font-size: 7.8pt; font-weight: 600; overflow-wrap: anywhere; }
      .pdr .subBody { display: block; overflow-wrap: anywhere; }

      /* 1.15 Archetype — สามคอลัมน์ · ตัวที่ติ๊กเต็มแถวพร้อมข้อความเขียนต่อ */
      .pdr .opts.cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 3mm; }
      .pdr .opts.cols li.on { grid-column: 1 / -1; }

      /* ข้อ 2.1–2.7 รายสินค้า — กล่องทรงเดียวกับบรีฟ · ซ้ายแคบ (หัวสินค้า) ขวาสองคอลัมน์ */
      .pdr .prodBlock { grid-template-columns: minmax(0, 28%) minmax(0, 72%); margin-bottom: 2mm; }
      .pdr .prodRight { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 3mm; }
      .pdr .prodRight .sub.wide { grid-column: 1 / -1; }
      .pdr .noBrief { margin: 0 0 2mm; padding: 1.6mm 2mm; font-size: 8.4pt; line-height: 1.65;
        color: var(--doc-muted); border: 0.2mm dashed var(--doc-line-strong); }
      .pdr .fill { display: block; min-height: 3.4mm; border-bottom: .3mm dotted var(--doc-line-strong); }

      /* ช่องลงนาม = .signatures ของเปลือกตัวเดียวกับ QT/SO/FM-SA-04 — ที่นี่ปรับแค่ที่ 04 ปรับ:
         ต่อจากหัวข้อ "การตรวจสอบและอนุมัติ / FINAL REVIEW & APPROVAL" · ก้อนทั้งก้อนชิดล่าง (.signTail) ·
         **สองแถวตามฝ่าย** (ฝ่ายขาย 3 ช่อง · RD 4 ช่อง) แต่ละแถวกว้างเต็มกระดาษ แบ่งตาม --sig-cols ของเปลือก ·
         ช่องกว้างเท่ากันเสมอ (minmax(0, 1fr)) ชื่อยาวตัดในช่องตัวเอง — ตัวจองความสูง pdrSignaturesMm คิดความกว้างรายแถว
         ระยะระหว่างสองแถว 2.5mm เท่าช่องไฟแนวนอนของเปลือก */
      .pdr .signatures { grid-template-columns: repeat(var(--sig-cols), minmax(0, 1fr)); margin-top: 0; padding-top: 0; }
      .pdr .signatures + .signatures { margin-top: 2.5mm; }
      .pdr .signatures strong { overflow-wrap: anywhere; }
      .pdr h3.signHeading { margin-top: 2.5mm; }
      .pdr .signTail { margin-top: auto; }

      .pdr .status { margin: 2.5mm 0 0; font-size: 8.4pt; }
      .pdr .status .st { margin-right: 10mm; color: var(--doc-muted); }
      .pdr .status .st.on { color: var(--doc-text); font-weight: 700; }
    `,
  });
}

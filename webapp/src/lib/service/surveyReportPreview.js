// ── ใบตัวอย่างของรายงานการประเมินพื้นที่ (FM-TS-01) — สำหรับหน้า "มาตรฐานเอกสาร" เท่านั้น ─────────────
//
// ⭐ เดินสายเดียวกับกระดาษจริงทุกขั้น ไม่มีทางลัด:
//     อินพุต → `buildSurveyReportSnapshot` (โหมด draft) → `surveyReportView` (ฉบับลูกค้า หรือฉบับภายใน) → `paginateSurveyReport`
//     → `renderSurveyReportHTML`
//   ⇒ สิ่งที่เห็นในพรีวิวคือสิ่งที่ตัวเรนเดอร์พิมพ์จริง ทั้งสัดส่วน สี และการขึ้นหน้า (หลักเดียวกับ `standardPreview.js`)
//
// 🔴 **ฝั่ง client** — ไฟล์นี้ถูก import จากจอตั้งค่า (ผ่าน `lib/documents/standardPreview.js`)
//   · สายเรนเดอร์ทั้งสายไม่มี `node:` / `server-only` / แพ็กเกจนอก `src` สักตัว (เทสต์เดินตามสาย import คุมไว้)
//   · **ห้าม import `surveyReportTestKit.mjs`** — ชุดนั้นใช้ `node:crypto` และเป็นของเทสต์/harness ไม่ใช่โค้ดของแอป
//     ⇒ อินพุตตัวอย่างข้างล่างเขียนมือ (สองพื้นที่ ชื่อสมมติทั้งหมด ไม่มีข้อมูลลูกค้าจริง)
//   · ห้าม import `surveyReportInputs.js` / `surveyReportState.js` / `surveyReportPaper.js` (ฝั่ง server)
//
// 🔑 จากมาตรฐานที่กำลังดู/กำลังแก้ กระดาษรับแค่ **บรรทัดแบบฟอร์ม** (รหัส · Revision · วันที่มีผล) — ตรงกับของจริง:
//   ชื่อเอกสาร · สี · เลขที่ ตรึงอยู่ในระบบ (`DOCUMENT_FORM_ONLY_KEYS` ใน lib/documentStandards.js)
//   · เลขที่บนใบตัวอย่าง **ตายตัว** ไม่ประกอบจากรูปแบบที่แก้ได้ในหน้าตั้งค่า — เลขจริงออกจาก RPC `issue_survey_report`
//     ประกอบจากรูปแบบ = พรีวิวบอกว่าแก้รูปแบบแล้วเลขเปลี่ยน ซึ่งไม่จริง
//   · สีไม่ได้ส่งจากที่นี่ — ตัวเรนเดอร์ไม่มีตัวเลือกสี เลือกจากฉบับของ view เอง เหมือนกระดาษที่ตรึง (`surveyReportPaper.js`):
//     ฉบับลูกค้า = terracotta · ฉบับภายใน = steel (มติเจ้าของ 08/10/2026 · `lib/documents/documentAudience.js`)
//     ⇒ ช่องสีของแถวมาตรฐาน (แถวที่เผยแพร่ยังถือ teal) ไม่มีทางไปถึงใบตัวอย่าง
//
// 🔑 สองฉบับ: `audience` ('external' = ฉบับลูกค้า — ค่าตั้งต้น · 'internal' = ฉบับภายใน) — หน้าตั้งค่ามีตัวสลับ
//   ใบตัวอย่างของฉบับภายในมาจากภาพนิ่งเดียวกัน ผ่านตัวกรองของฉบับภายใน (แถบ "ฉบับภายใน" · จุดที่เลือก · ภาคผนวก)
//
// ⚠️ อินพุตตัวอย่างเขียนเทียบรูปร่างที่ `buildSurveyReportSnapshot` รับ ณ วันที่เขียน — ตัวสร้างภาพนิ่งเพิ่มช่องบังคับเมื่อไร
//   เทสต์ "ไม่มีคำเตือน" (`surveyReportPreview.test.mjs`) จะล้ม ให้มาเติมช่องที่นี่
import { COMPANY_PROFILE_FALLBACK } from '@/lib/companyProfile';
import { resolveDocumentForm } from '@/lib/documentStandards';
import { SURVEY_DOC_PLAN, SURVEY_DOC_SPOT, SURVEY_DOC_WIDE } from './survey';
import { renderSurveyReportHTML } from './surveyReportDocument';
import { paginateSurveyReport } from './surveyReportLayout';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot';
import { surveyReportView } from './surveyReportView';

// คีย์มาตรฐานเอกสารของ FM-TS-01 — ค่าเดียวกับ `SURVEY_REPORT_STANDARD_KEY` (surveyReportInputs.js · ฝั่ง server จึงไม่ import)
const STANDARD_KEY = 'siteSurvey';

/** เลขที่บนใบตัวอย่าง — ตายตัว (ดูหัวไฟล์) · เดือนตรงกับวันที่ของชุดตัวอย่าง (ก.ย. 2026) */
export const SURVEY_REPORT_PREVIEW_DOC_NO = 'SU-26090001-0';

/** ลายน้ำทุกแผ่น — ใบตัวอย่างพิมพ์/บันทึก PDF ได้จากหน้าเต็มจอ จึงต้องไม่มีทางถูกเข้าใจว่าเป็นเอกสารจริง */
export const SURVEY_REPORT_PREVIEW_WATERMARK = 'ตัวอย่าง';

/* รูปตัวอย่าง — กล่องเทา 4:3 ฝังในตัว (data URI) ใช้แทนทั้งภาพกว้าง ภาพผัง และรูปจุด (ฉบับภายใน)
   ⚠️ ห้ามเป็นลิงก์ `/api/…` หรือ token `su-img:` — พรีวิวอยู่ใน iframe `srcDoc` ไม่มีไฟล์แนบจริงให้ชี้ */
const SAMPLE_IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">'
  + '<rect width="400" height="300" fill="#e3e7eb"/>'
  + '<circle cx="128" cy="104" r="22" fill="#c5ccd3"/>'
  + '<path d="M56 236l84-92 52 56 44-40 108 76z" fill="#c5ccd3"/>'
  + '</svg>';
export const SURVEY_REPORT_PREVIEW_IMAGE = `data:image/svg+xml,${encodeURIComponent(SAMPLE_IMAGE_SVG)}`;

/* ── ชุดตัวอย่าง (เขียนมือ) ───────────────────────────────────────────────────────────────── */

/* จุดเวลาตายตัว — ไม่อ่านนาฬิกา (พรีวิวต้องนิ่งทุกครั้งที่เปิด) · วันที่ทั้งชุดตั้งที่นี่ที่เดียว
   ⭐ ทุกวันที่บนใบตัวอย่างต้อง **ไม่ก่อนวันที่มีผลของแบบฟอร์มที่ seed ไว้ (29/09/2569 = 29/09/2026)**
     แบบฟอร์มควบคุมที่ประเมิน/ออกก่อนวันที่ตัวเองมีผล = ใบที่มีจริงไม่ได้ (เคยตั้งไว้ 25–26/09 · เทสต์คุมแล้ว)
     และต้องยังอยู่ใน ก.ย. 2026 ให้ตรงเดือนในเลขที่ (`SU-2609…`)
   · ประเมิน อ. 29/09/2026 (อยู่ในวันเข้าพื้นที่ จ.–ศ. ของไซต์ตัวอย่าง) · ส่งผล/ออกเอกสาร พ. 30/09/2026 10:00 เวลาไทย
   ⚠️ ร่างที่พิมพ์วันที่มีผลช้ากว่านี้ ใบตัวอย่างไม่ขยับตาม (ชุดตัวอย่างตายตัว) — ยอมรับ */
const SAMPLE_SURVEY_DAY = '2026-09-29';
const SAMPLE_ISSUED_DAY = '2026-09-30';
const SAMPLE_SENT_AT = `${SAMPLE_ISSUED_DAY}T03:00:00.000Z`;
// จุดเวลาในวันประเมิน — รับเวลา UTC (`HH:MM` · เวลาไทย = +7 ชม.)
const onSurveyDay = (utcTime) => `${SAMPLE_SURVEY_DAY}T${utcTime}:00.000Z`;

// ทะเบียนขนาดแพ็คเกจ — ชุดตั้งต้นของ mig 0398 (XS เลือกเอง · SM ไม่เกิน 300 · ST ไม่เกิน 2,400 · XL เกินนั้น)
const SAMPLE_SIZES = [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
];

// `spotId` = จุดที่รูปนี้ผูกอยู่ (เฉพาะรูปจุด — ภาพนิ่งผูกรูปกับจุดด้วย `metadata.spotId` เท่านั้น ไม่เดาจากลำดับ)
const sampleFile = (id, docType, createdAt, spotId = null) => ({
  id, docType, fileName: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1, createdAt, metadata: spotId ? { spotId } : {},
});

/* สองพื้นที่ — พื้นที่แรกส่วนเดียว (ขนาดพับอยู่ในหัวพื้นที่) · พื้นที่สองสองส่วน (ตารางส่วนข้างภาพผัง)
   ⇒ ใบตัวอย่างโชว์ทั้งสองทรงของหน้ารายพื้นที่ และใช้สองขนาดแพ็คเกจ (แถวรวมมีช่อง "ขนาดแพ็ค")
   ⚠️ หมายเหตุพื้นที่ไม่มีคำที่ระบบเตือนในฉบับลูกค้า (เครื่อง · รุ่น · ราคา · จุดติดตั้ง) — ตัวอย่างต้องไม่สอนให้พิมพ์คำพวกนั้น
   · จุดติดตั้ง: พื้นที่ละหนึ่งจุดที่หัวหน้าเลือกแล้ว พร้อมรูป — พิมพ์เฉพาะฉบับภายใน (ฉบับลูกค้าไม่มีทางได้จุด)
     ใบจริงออกไม่ได้ถ้ายังไม่เคาะจุด ⇒ ใบตัวอย่างของฉบับภายในต้องไม่ขึ้น "จุดที่ติดตั้งได้ 0" */
function sampleZones() {
  return [
    {
      id: 'preview-zone-1', requestId: 'preview-request', zoneId: 'preview-registry-1', zoneCode: 'ZN-0001-00001',
      zoneName: 'ล็อบบี้ต้อนรับ', floor: '1', status: 'ok', cutReason: null, sortOrder: 0,
      parts: [{ id: 'preview-part-1a', label: 'ล็อบบี้', widthM: 12, lengthM: 9, heightM: 3.5 }],
      spots: [{ id: 'preview-spot-1a', label: 'ผนังข้างเคาน์เตอร์ต้อนรับ', note: 'มีปลั๊กไฟในระยะหนึ่งเมตร', selected: true }],
      packageSize: 'ST', packageSizeSuggested: 'ST', packageSizeManual: false, packageQty: 1, packageNote: null,
      note: 'เพดานสูง มีประตูทางเข้าเปิดออกสู่ภายนอกสองด้าน',
      surveyedByName: 'ตัวอย่าง ผู้ประเมิน', surveyedAt: onSurveyDay('04:10'),
    },
    {
      id: 'preview-zone-2', requestId: 'preview-request', zoneId: 'preview-registry-2', zoneCode: 'ZN-0001-00002',
      zoneName: 'ห้องประชุมใหญ่', floor: '2', status: 'ok', cutReason: null, sortOrder: 1,
      parts: [
        { id: 'preview-part-2a', label: 'ห้องหลัก', widthM: 8, lengthM: 6, heightM: 3 },
        { id: 'preview-part-2b', label: 'โถงหน้าห้อง', widthM: 4, lengthM: 3, heightM: 3 },
      ],
      spots: [{ id: 'preview-spot-2a', label: 'มุมห้องด้านประตูทางเข้า', note: null, selected: true }],
      packageSize: 'SM', packageSizeSuggested: 'SM', packageSizeManual: false, packageQty: 1, packageNote: null,
      note: 'ผนังกระจกหนึ่งด้าน ระบบปรับอากาศแยกจากโถงกลาง',
      surveyedByName: 'ตัวอย่าง ผู้ประเมิน', surveyedAt: onSurveyDay('04:35'),
    },
  ];
}

const SAMPLE_FILES = {
  'preview-zone-1': [
    sampleFile('preview-z1-wide-1', SURVEY_DOC_WIDE, onSurveyDay('04:02')),
    sampleFile('preview-z1-wide-2', SURVEY_DOC_WIDE, onSurveyDay('04:03')),
    sampleFile('preview-z1-plan-1', SURVEY_DOC_PLAN, onSurveyDay('04:08')),
    sampleFile('preview-z1-spot-1', SURVEY_DOC_SPOT, onSurveyDay('04:09'), 'preview-spot-1a'),
  ],
  'preview-zone-2': [
    sampleFile('preview-z2-wide-1', SURVEY_DOC_WIDE, onSurveyDay('04:22')),
    sampleFile('preview-z2-wide-2', SURVEY_DOC_WIDE, onSurveyDay('04:23')),
    sampleFile('preview-z2-plan-1', SURVEY_DOC_PLAN, onSurveyDay('04:30')),
    sampleFile('preview-z2-spot-1', SURVEY_DOC_SPOT, onSurveyDay('04:32'), 'preview-spot-2a'),
  ],
};

/**
 * อินพุตของ `buildSurveyReportSnapshot` สำหรับใบตัวอย่าง — รูปร่างเดียวกับที่ `loadSurveyReportInputs` ส่งให้ของจริง
 * @param standard แถวเวอร์ชันมาตรฐานที่กำลังดู หรือค่าในฟอร์มที่กำลังแก้ (ร่างก็ได้) · ไม่ส่ง = ค่าสำรองของ FM-TS-01
 *   ⚠️ อ่านจาก `standard` แค่บรรทัดแบบฟอร์ม ผ่าน `resolveDocumentForm` ⇒ วันที่มีผล (ISO ค.ศ.) พิมพ์เป็น พ.ศ.
 *      แบบเดียวกับที่ตัวโหลดของจริงทำ (`documentStandardToForm`)
 */
export function surveyReportPreviewInputs(standard) {
  const form = resolveDocumentForm(standard, STANDARD_KEY);
  const company = COMPANY_PROFILE_FALLBACK;
  return {
    takenAt: SAMPLE_SENT_AT,
    request: {
      id: 'preview-request', kind: 'site_survey', status: 'answered', docNo: 'RQ-AS-26090001',
      title: 'ประเมินพื้นที่อาคารตัวอย่าง', body: null, team: null,
      requestedById: 'preview-requester', requestedByName: 'ตัวอย่าง ผู้ขอ', submittedAt: '2026-09-25T02:00:00.000Z',
      assignedByName: null,
      requestedDueDate: SAMPLE_SURVEY_DAY, requestedDueTime: '10:00',
      committedDueDate: SAMPLE_SURVEY_DAY, committedDueTime: '10:00',
      requestedResultDate: SAMPLE_ISSUED_DAY, committedResultDate: SAMPLE_ISSUED_DAY,
      answeredAt: SAMPLE_SENT_AT, answeredById: 'preview-approver', answeredByName: 'ตัวอย่าง ผู้อนุมัติ',
      closedAt: null, closedByName: null,
    },
    deal: { code: 'DL-26090001' },
    customer: { id: 'preview-customer', arCode: 'AR-0000', name: 'บริษัท ตัวอย่าง จำกัด' },
    site: {
      code: 'ST-0000-01-BKK-0001', name: 'อาคารตัวอย่าง ทาวเวอร์',
      address: '99/9 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10110',
      contactName: 'คุณตัวอย่าง ผู้ติดต่อ', contactPhone: '081-234-5678',
      accessFrom: '09:00', accessTo: '17:00', accessDays: [1, 2, 3, 4, 5], accessNote: null,
    },
    visit: {
      code: 'SV-26090001', status: 'done',
      scheduledDate: SAMPLE_SURVEY_DAY, startTime: '10:00', endTime: '12:00',
      actualDate: SAMPLE_SURVEY_DAY, actualStartTime: '10:05', actualEndTime: '11:40', actualEndDate: null,
      assigneeId: 'preview-assessor', assigneeName: 'ตัวอย่าง ผู้ประเมิน',
    },
    visitClosedBySend: false,
    // ป้ายเดียวกับ `ROLE_LABELS.ts_senior` (ตัวโหลดของจริงอ่านจากทะเบียนผู้ใช้)
    assigneeRoleLabel: 'เจ้าหน้าที่บริการอาวุโส (Senior)',
    helpers: [],
    priorUnable: [],
    zones: sampleZones(),
    zoneRegistry: [
      { id: 'preview-registry-1', code: 'ZN-0001-00001', floor: '1', building: null },
      { id: 'preview-registry-2', code: 'ZN-0001-00002', floor: '2', building: null },
    ],
    filesByZone: SAMPLE_FILES,
    sizes: SAMPLE_SIZES,
    history: [],
    // คีย์เดียวกับที่ตัวโหลดของจริงแปลงจากบล็อกบริษัท (legalNameTh → name · phone → tel)
    company: {
      name: company.legalNameTh, address: company.address, taxId: company.taxId,
      tel: company.phone, line: company.line, website: company.website,
    },
    form: { code: form.code, revision: form.revision, effectiveDate: form.effectiveDate },
  };
}

const sampleImageSrc = () => SURVEY_REPORT_PREVIEW_IMAGE;

/* ผู้อ่าน (`DOCUMENT_AUDIENCES` ของ lib/documents/documentAudience.js) → ฉบับของกระดาษ · ค่าที่ไม่ใช่ 'internal' = ฉบับลูกค้า
   ⚠️ ทิศปลอดภัย: ค่าแปลก ๆ ต้องไม่พาใบตัวอย่างไปฉบับภายใน (คู่กลับของ `surveyReportAudience` ในตัวเรนเดอร์ — เทสต์เทียบไว้) */
const versionOf = (audience) => (audience === 'internal' ? 'internal' : 'customer');

/**
 * ใบตัวอย่างพร้อมของที่เทสต์ต้องดู
 * @param opts.audience `'external'` (ฉบับลูกค้า — ค่าตั้งต้น) | `'internal'` (ฉบับภายใน)
 * @returns `{ html, view, layout, warnings }` — `layout.overflow` ต้องว่าง · `warnings` (เหตุที่ตรึงไม่ได้ของโหมด draft)
 *   ต้องว่าง: ชุดตัวอย่างต้องเป็นใบที่ออกเอกสารได้จริง ไม่ใช่ใบที่มีช่องขีด
 */
export function buildSurveyReportPreview(standard, { audience } = {}) {
  const built = buildSurveyReportSnapshot(surveyReportPreviewInputs(standard), { mode: 'draft' });
  const view = surveyReportView(built.snapshot, { version: versionOf(audience) });
  const layout = paginateSurveyReport(view);
  const html = renderSurveyReportHTML({
    view,
    layout,
    docNo: SURVEY_REPORT_PREVIEW_DOC_NO,
    issuedAt: SAMPLE_ISSUED_DAY,
    watermark: SURVEY_REPORT_PREVIEW_WATERMARK,
    imageSrc: sampleImageSrc,
  });
  return { html, view, layout, warnings: built.warnings };
}

/** HTML เต็มไฟล์ของใบตัวอย่าง FM-TS-01 — ตัวที่ `buildStandardPreviewHTML('siteSurvey', standard, { audience })` เรียก */
export function buildSurveyReportPreviewHTML(standard, { audience } = {}) {
  return buildSurveyReportPreview(standard, { audience }).html;
}

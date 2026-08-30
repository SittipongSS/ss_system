// ── ใบตัวอย่างของ "มาตรฐานเอกสาร" — ที่เดียวที่รู้ว่าเอกสารชนิดไหนใช้เครื่องยนต์ไหน
//
// ⭐ เรนเดอร์ด้วย **เครื่องยนต์ตัวจริงที่ใช้พิมพ์** ไม่ใช่กล่อง CSS จำลอง ⇒ สิ่งที่เห็น
// คือสิ่งที่ออกจากเครื่องพิมพ์จริง ทั้งสัดส่วน สี และการขึ้นหน้า
//
// 🐞 เดิมความรู้ชุดนี้อยู่ในหน้าตั้งค่าไฟล์เดียว ส่วนหน้า "เปิดเต็มจอ" มีเครื่องยนต์
// ใบเสนอราคาของตัวเอง ⇒ ปุ่มเปิดเต็มจอโผล่ได้แค่ QT/SO อีกสามชนิดดูเต็มจอไม่ได้เลย
// (ผู้ใช้ทักเอง) · ยกออกมาที่นี่แล้วสองหน้าเรียกตัวเดียวกัน เพิ่มชนิดใหม่แก้ที่เดียว
import { COMPANY_PROFILE_FALLBACK } from '@/lib/companyProfile';
import { numberingPatternExample } from '@/lib/documentStandards';
import { buildGanttPrintHTML } from '@/lib/pm/ganttPrint';
import { renderPdrDocument } from '@/lib/requests/pdrDocument';
import { buildBillPrintHTML } from '@/lib/tax/billPrint';
import { renderQuotationMasterDocumentHTML } from '@/lib/sales/quotationMasterDocument';
import { buildQuotationMasterPreview } from '@/lib/sales/quotationMasterTemplate';

// ⚠️ ชนิดที่ **มีชุดกรณีทดสอบ/สถานะให้เลือก** — เครื่องยนต์ใบเสนอราคารับ scenario กับ
// documentState ส่วนอีกสามชนิดมีใบตัวอย่างชุดเดียว ตัวควบคุมพวกนั้นจึงไม่มีความหมาย
export const SCENARIO_DOCUMENT_KEYS = Object.freeze(['quotation', 'salesOrder']);

// โครงการตัวอย่างของพรีวิวเอกสารไทม์ไลน์ — วันที่ชุดเดียวกับตัวอย่างเลขที่ (20/07/2569)
// timelineDocBase เว้นว่างไว้ตั้งใจ: พรีวิวโชว์เลขที่ "ตอนออก" (Rev 0) ตรงตามรูปแบบที่
// กำลังแก้อยู่ ไม่ต้องประกอบเลข Rev ใหม่
const timelinePreviewProject = (standard) => ({
  id: 'timeline-preview',
  code: 'PJ-26070001',
  rev: 0,
  timelineDocBase: '',
  timelineDocNumber: numberingPatternExample(standard?.numberingPattern, '0') || 'PT-26070001-0',
  name: 'น้ำหอม Eau de Parfum 50 ml',
  productName: 'น้ำหอม Eau de Parfum 50 ml',
  customerName: 'บริษัท ตัวอย่าง จำกัด',
  aeOwner: 'ตัวอย่าง ผู้ดูแล',
  preparedBy: 'ตัวอย่าง ผู้ประสานงาน',
  aeSupervisor: 'ตัวอย่าง ผู้ตรวจสอบ',
  startDate: '2026-07-20',
  dueDate: '2026-09-14',
  categoryFallback: 'น้ำหอม / Eau de Parfum',
  metadata: { brand: 'EXAMPLE', quotationNumber: 'QT-26070001-0', poNumber: 'PO-2607-001' },
  projectProducts: [],
  tasks: [
    { id: 't1', phase: 'เตรียมงาน', name: 'ยืนยันบรีฟและกลิ่นตัวอย่าง', role: 'AC', status: 'Completed', startDate: '2026-07-20', finishDate: '2026-07-31' },
    { id: 't2', phase: 'เตรียมงาน', name: 'อนุมัติสูตร', role: 'RD', status: 'Completed', startDate: '2026-08-01', finishDate: '2026-08-07', isMilestone: true },
    { id: 't3', phase: 'ผลิต', name: 'สั่งวัสดุบรรจุ', role: 'PC', status: 'In Progress', startDate: '2026-08-08', finishDate: '2026-08-28' },
    { id: 't4', phase: 'ผลิต', name: 'ผลิตและบรรจุ', role: 'PD', status: 'Pending', startDate: '2026-08-29', finishDate: '2026-09-14' },
  ],
});

const taxPreviewOrder = (standard) => ({
  id: 'TAX-PREVIEW',
  taxNoticeNumber: numberingPatternExample(standard?.numberingPattern, '0') || 'ET-26070001-0',
  taxNoticeStandardSnapshot: standard,
  quotationRef: 'QT-26070001-0',
  poReference: 'SO-26070001-0',
  customerName: 'บริษัท ตัวอย่าง จำกัด',
  customerTaxId: '0100000000001',
  createdAt: '2026-07-20T09:00:00+07:00',
  deliveryDate: '2026-08-20',
  items: [{
    id: 'preview-line-1',
    quantity: 100,
    totalTax: 880,
    product: {
      fgCode: 'PF-EDP-050-001',
      brand: 'EXAMPLE',
      productDescription: 'น้ำหอม Eau de Parfum 50 ml',
      retailPriceIncVat: 107,
      retailPriceExVat: 100,
    },
  }],
});

// ── ใบตัวอย่างของ PDR ────────────────────────────────────────────────────────
// ⚠️ **PDR ไม่ออกเลขที่ของตัวเอง** — ช่อง "เลขที่เอกสาร" บนกระดาษใช้เลขที่คำร้อง (SB-…)
// ที่ออกไปแล้วตอนกดส่ง · ตัวอย่างจึงโชว์เลขคำร้อง ไม่ใช่ numberingPatternExample
// เหมือนอีกสามใบ ไม่งั้นพรีวิวจะสอนผิดว่าใบนี้ออกเลขเอง
const PDR_PREVIEW_BRIEF = {
  label: 'สดชื่นแนวซิตรัส',
  brief: 'กลิ่นเปิดสดชื่นแนวส้ม-เบอร์กาม็อท ตามด้วยกลิ่นดอกไม้ขาวบาง ๆ จบด้วยมัสก์นุ่ม',
  inspiration: 'เช้าวันหยุดในสวนส้มหลังฝนตก',
  likedNotes: 'ซิตรัส · ดอกไม้ขาว · มัสก์',
  dislikedNotes: 'กลิ่นหวานจัด · วานิลลาเข้ม',
  scentotypes: ['cheerer', 'discoverer'],
  scentotypeNotes: { cheerer: 'สดใส เข้าถึงง่าย' },
  performance: ['lasting', 'diffusive'],
};

const pdrPreviewRequest = () => ({
  docNo: 'RQ-SB-26070001',
  customerName: 'บริษัท ตัวอย่าง จำกัด',
  status: 'pending',
  submittedAt: '2026-07-20T09:00:00+07:00',
  requestedDueDate: '2026-08-20',
  urgent: false,
  pdrRequestType: 'new_product',
  pdrCustomerBrand: 'EXAMPLE',
  pdrMoodTone: 'สดชื่น อบอุ่น เข้าถึงง่าย',
  pdrProjectValue: 950000,
  pdrCustomerKind: 'new',
  pdrProductKinds: ['01-001', '02-010'],
  pdrWantedAt: '2026-09-15',
  pdrMoq: '1,000 ขวด',
  pdrTexture: 'premium',
  pdrPackSize: '50 ml · 1,000 ชิ้น/กลิ่น',
  pdrPackagingForms: ['bottle', 'cap', 'box'],
  pdrPackagingArtwork: 'none',
  pdrDocuments: ['coa', 'msds', 'ifra'],
  pdrSignChemist: 'ปกิตา เจริญวงษ์',
  pdrSignCoordinator: 'ณิชา ลัคนาภิเศรษฐ์',
  pdrSignFinalApprover: 'รุจิรา ตระกูลยิ่งเจริญ',
  requestedByName: 'ตัวอย่าง ผู้ดูแล',
  // ⭐ ข้อ 2.2/2.3 เป็นแถวรายสินค้าตั้งแต่ mig 0229 — ใบตัวอย่างต้องโชว์ของจริงที่
  // กระดาษจะพิมพ์ ไม่ใช่ N/A · **ไม่ใส่ `pdrTargetCost`/`pdrTargetPrice` (ช่องเก่า)**
  // เพราะใบใหม่ไม่เขียนลงช่องนั้นแล้ว ใส่ไปจะได้บรรทัด "(บันทึกไว้เดิม)" บนใบตัวอย่าง
  // ซึ่งไม่มีทางเกิดกับใบที่เปิดวันนี้
  targets: [
    {
      categoryCode: '01-001',
      fOn: true,
      fNote: 'เข้มข้น 20% เบสแอลกอฮอล์',
      fPricePerKg: 1200,
      fbOn: false,
      pricePerUnit: 590,
    },
    {
      categoryCode: '02-010',
      fOn: false,
      fbOn: true,
      fbNote: 'เบสน้ำ ไม่มีแอลกอฮอล์',
      fbPricePerKg: 880,
      pricePerUnit: 250,
    },
  ],
  // ค่าที่ปกติ server เติมให้ (`findRequest`) — พรีวิวเป็นฝั่ง client จึงป้อนตรง ๆ
  pdrContext: {
    requestedAt: '2026-07-20',
    requester: 'ตัวอย่าง ผู้ดูแล',
    coordinator: 'ตัวอย่าง ผู้ประสานงาน',
    contactName: 'คุณตัวอย่าง ผู้ติดต่อ',
    contactPhone: '081-234-5678 · @example',
    customer: 'บริษัท ตัวอย่าง จำกัด',
    deal: 'ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026',
    sampleDue: '2026-08-20',
    scentCount: 3,
    // ป้ายหมวดของข้อ 1.11 และ 2.2/2.3 — พรีวิวเป็นฝั่ง client จึงป้อนทะเบียนย่อ ๆ เอง
    categories: [
      { mainCategoryCode: '01', typeCode: '001', nameTh: 'น้ำหอม', nameEn: 'PERFUME' },
      { mainCategoryCode: '02', typeCode: '010', nameTh: 'สเปรย์ปรับอากาศ', nameEn: 'ROOM SPRAY' },
    ],
  },
});

/**
 * HTML ของใบตัวอย่างสำหรับมาตรฐานเอกสารหนึ่งชนิด
 *
 * @param documentKey  คีย์ใน DOCUMENT_STANDARD_KEYS
 * @param standard     แถวเวอร์ชันที่กำลังดู/กำลังแก้ (ร่างก็ได้ — พรีวิวจะขยับตามทันที)
 * @param options      { grayscale, scenarioId, documentState } — สองตัวหลังใช้เฉพาะ
 *                     ชนิดใน SCENARIO_DOCUMENT_KEYS
 */
export function buildStandardPreviewHTML(documentKey, standard, options = {}) {
  const { grayscale = false, scenarioId = 'standard', documentState = 'approved' } = options;

  if (documentKey === 'projectTimeline') {
    // ส่งมาตรฐานเป็น activeStandard (ไม่ใช่ timelineStandardSnapshot บนตัวอย่าง)
    // เพื่อให้ร่างที่กำลังแก้มีผลกับพรีวิวทันที
    return buildGanttPrintHTML(timelinePreviewProject(standard), null, standard, { toolbar: false });
  }

  // ⭐ PDR มีเครื่องยนต์ของตัวเอง (lib/requests/pdrDocument) — ตกไปใช้เครื่องยนต์
  // ใบเสนอราคาเมื่อไรได้พรีวิวที่เป็น "ใบเสนอราคาที่เปลี่ยนแค่ชื่อ" คือมีผู้ซื้อ/
  // ข้อมูลอ้างอิง/ยืนราคาถึง ซึ่งไม่มีอยู่บนกระดาษ FM-RD-01 เลย
  if (documentKey === 'pdr') {
    return renderPdrDocument({
      request: pdrPreviewRequest(),
      briefs: [PDR_PREVIEW_BRIEF],
      company: COMPANY_PROFILE_FALLBACK,
      standard,
      toolbar: false,
    });
  }

  if (documentKey === 'exciseTaxNotice') {
    return buildBillPrintHTML(taxPreviewOrder(standard), {
      name: 'บริษัท ตัวอย่าง จำกัด',
      taxId: '0100000000001',
      address: 'กรุงเทพมหานคร',
      // company/activeStandard ปล่อยว่าง: มาตรฐานมากับ taxNoticeStandardSnapshot แล้ว
      // และบล็อกบริษัทตกไปใช้ค่าที่เผยแพร่ · ส่ง toolbar:false เป็นตัวสุดท้าย
    }, undefined, null, { toolbar: false });
  }

  const model = buildQuotationMasterPreview(scenarioId, documentState, 'v4', documentKey, { standard });
  return renderQuotationMasterDocumentHTML(model, { grayscale, toolbar: false });
}

// จำนวนหน้า/รายการ/งวด ของใบตัวอย่าง — หน้าเต็มจอโชว์เป็นบรรทัดสรุป · มีเฉพาะชนิดที่
// เครื่องยนต์คืน model ออกมา (อีกสามชนิดคืน HTML ตรง ๆ ไม่มี model ให้ถาม)
export function standardPreviewModel(documentKey, standard, { scenarioId = 'standard', documentState = 'approved' } = {}) {
  if (!SCENARIO_DOCUMENT_KEYS.includes(documentKey)) return null;
  return buildQuotationMasterPreview(scenarioId, documentState, 'v4', documentKey, { standard });
}

// ── PDR: หัวข้อ · ป้ายชื่อ · ลำดับ — **แหล่งเดียวของทั้งสามจอ** ────────────
//
// 🐞 ของจริงที่ผู้ใช้ทักมา: "ฟอร์มกรอก · ตอนโชว์รายละเอียด · ตอนแก้ มันไม่เหมือนกันเลย"
// เพราะทั้งสามที่ต่างคนต่างเขียนลิสต์ของตัวเอง แล้วเพี้ยนกันทุกมิติ:
//
//   · **หัวข้อ** ฟอร์มมี "ข้อมูลคำขอ" + "ข้อมูลลูกค้า" แยกกัน · จอแสดงยุบเป็น
//     "ข้อมูลลูกค้าและคำขอ" ก้อนเดียว · เอกสารใช้ "1. ข้อมูลลูกค้า"
//   · **ลำดับ** มูลค่าโปรเจกต์อยู่ที่ 3 ในฟอร์ม แต่อยู่ที่ 7 ในจอแสดง
//   · **ป้ายชื่อ** "Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)" บนฟอร์ม → "Target
//     Cost / KG" บนจอแสดง → "Target Cost / Unit (ราคาต้นทุน/KG)" บนเอกสาร
//   · **ช่องที่หายไป** ผู้ร้องขอ · ลูกค้า · จำนวนกลิ่น อยู่บนฟอร์มและบนเอกสาร
//     แต่จอแสดงไม่มีเลย
//   · **ค่าดิบหลุดออกเอกสาร** เอกสารพิมพ์ `new_product` · `premium` · `existing`
//     ตรง ๆ เพราะไม่ได้แปลง enum ⇒ ลูกค้าได้กระดาษที่มีรหัสของระบบอยู่บนนั้น
//   · **ข้อกำหนดเฉพาะอื่น ๆ** อยู่คนละหัวข้อ: ฟอร์ม/เอกสารไว้ใต้ "กฎระเบียบ"
//     จอแสดงเอาไปรวมกับ "ข้อกำหนดผลิตภัณฑ์"
//
// ⇒ ไฟล์นี้ประกาศครั้งเดียว ทั้งสามจออ่านจากที่นี่ · เพิ่ม/แก้ช่องต้องมาที่นี่ที่เดียว
// และเพี้ยนกันอีกไม่ได้เชิงโครงสร้าง ไม่ใช่เพราะมีคนคอยไล่ดูให้ตรงกัน

// ⚠️ ตัวนับเดียวกับที่ด่านหน้าประตูของหัวข้อใช้ — "จำนวนกลิ่นที่ขาย" ต้องเป็นเลข
// เดียวกันทั้งตอนกันไม่ให้เปิดใบผิด และตอนพิมพ์ลงกระดาษ
import { scentCountForOrder } from '@/lib/requests/scentDesignOrders';

export const PDR_REQUEST_TYPES = [
  { value: 'new_product', label: 'New Product' },
  { value: 'modification', label: 'Product Modification' },
  { value: 'rd_test', label: 'R&D Test' },
  { value: 'cost_reduction', label: 'Cost Reduction' },
];

export const PDR_TEXTURES = [
  { value: 'standard', label: 'STANDARD' },
  { value: 'premium', label: 'PREMIUM' },
];

export const PDR_CUSTOMER_KINDS = [
  { value: 'new', label: 'ลูกค้าใหม่' },
  { value: 'existing', label: 'ลูกค้าเก่า' },
];

// 2.8 รูปแบบบรรจุภัณฑ์ — เลือกได้หลายอย่าง
export const PDR_PACKAGING_FORMS = [
  { value: 'bottle', label: 'ขวด' },
  { value: 'cap', label: 'ฝา' },
  { value: 'box', label: 'กล่อง' },
];

// ⭐ มติผู้ใช้: **ติ๊กว่ามีภาพประกอบ = ต้องแนบภาพจริง** ⇒ ด่านบังคับอยู่ที่
// `pdrArtworkError()` ท้ายไฟล์ · ปล่อยให้ติ๊กแล้วไม่แนบ = RD ตามหาภาพที่ไม่มีอยู่
export const PDR_ARTWORK = [
  { value: 'has', label: 'มีภาพประกอบ' },
  { value: 'none', label: 'ไม่มีภาพประกอบ' },
];

// Regulatory & Compliance — มติผู้ใช้: ติ๊กได้ทั้ง 6 ตัว **แต่ไม่ติ๊กไว้ล่วงหน้า**
// (กระดาษเขียนว่าสี่ตัวแรก "มีให้เป็นพื้นฐาน" แต่ยังมีช่องติ๊ก ⇒ ให้ AE ยืนยันเอง)
export const PDR_DOCUMENTS = [
  { value: 'coa', label: 'COA' },
  { value: 'msds', label: 'MSDS' },
  { value: 'ifra', label: 'IFRA' },
  { value: 'fda', label: 'อย.' },
  { value: 'halal', label: 'ฮาลาล (Halal)' },
  { value: 'export', label: 'เอกสารส่งออก' },
];

const labelOf = (list, value) => list.find((o) => o.value === value)?.label || null;

/**
 * โครงของฟอร์ม — เรียงตามฟอร์มกระดาษ FM-RD-01 Rev.02
 *
 * field:
 *   key      ชื่อช่องในฟอร์ม (สั้น — อยู่ในบริบท PDR อยู่แล้ว)
 *   column   คอลัมน์บนแถวคำร้อง (mig 0214 · prefix `pdr` กันปนกับกลไกคำร้อง)
 *   label    ป้ายชื่อ — **ชุดเดียวทั้งสามจอ**
 *   hint     คำขยายในวงเล็บ · ฟอร์มแสดงต่อท้ายป้าย จอแสดง/เอกสารไม่แสดง (กินที่)
 *   type     'text' | 'money' | 'date' | 'select' | 'tick' | 'derived'
 *   options  ตัวเลือกของ select — ใช้แปลงค่าดิบเป็นป้ายด้วย
 *   derive   ที่มาของค่าที่ระบบเติมให้เอง (ไม่ได้อยู่ในคอลัมน์ pdr*)
 */
export const PDR_SECTIONS = [
  {
    key: 'request',
    title: 'ข้อมูลคำขอ',
    note: 'ผู้ร้องขอ วันที่ และแผนก ระบบเติมให้จากคนที่เปิดใบ',
    fields: [
      // ⭐ AE/AC มาจาก **ผู้ดูแล/ผู้ประสานงานของโครงการ** (mig 0190) ไม่ใช่คนกดปุ่ม
      // (มติผู้ใช้: "คล้าย ๆ โครงการ ที่มีผู้ดูแล AE กับผู้ประสานงาน AC")
      // ⚠️ ถอยไปใช้ชื่อคนเปิดใบเมื่อโครงการยังไม่ได้ระบุ — ช่องว่างบนเอกสารที่ต้อง
      // มีชื่อคนรับผิดชอบเสมอ แย่กว่าชื่อที่ใกล้เคียงความจริงที่สุด
      // ⭐ **วันที่ร้องขอ = วันที่ยื่นคำร้อง** (มติผู้ใช้ 2026-08-08) ไม่ใช่วันที่สร้างร่าง
      //
      // 🐞 เดิมบรรทัดนี้ hardcode อยู่ที่หัวเอกสาร (`pdrDocument.js`) ด้วย `createdAt`
      // ⇒ สองปัญหาพร้อมกัน: (1) ฟอร์มกับหน้ารายละเอียด **ไม่มีช่องนี้เลย** ทั้งที่
      // เป็นข้อแรกของ Request Information บนกระดาษ · (2) ร่างที่ค้างไว้สามวันแล้วค่อย
      // กดส่ง จะพิมพ์วันที่สร้างร่างลงกระดาษ ซึ่งไม่ใช่วันที่ยื่นจริง
      //
      // ⚠️ ร่างที่ยังไม่ส่ง = ยังไม่มีวันยื่น ⇒ N/A ตามกติกา ไม่ใช่ถอยไปใช้ createdAt
      { key: 'requestedAt', label: 'วันที่ร้องขอ', type: 'derived', derive: 'requestedAt', from: 'วันที่ยื่นคำร้อง' },
      { key: 'requester', label: 'ผู้ร้องขอ (AE)', type: 'derived', derive: 'requester', from: 'เติมจากผู้ดูแลโครงการ' },
      { key: 'coordinator', label: 'ผู้ร้องขอ (AC)', type: 'derived', derive: 'coordinator', from: 'เติมจากผู้ประสานงานโครงการ' },
      { key: 'department', label: 'แผนก', type: 'derived', derive: 'department', from: 'การขายและบริการ' },
      {
        key: 'requestType', column: 'pdrRequestType', label: 'ประเภทของคำขอ',
        type: 'select', options: PDR_REQUEST_TYPES,
      },
      // ⭐ สองประเภทบนกระดาษมีช่องกรอกต่อ (Product Modification → รหัสสินค้าก่อนหน้า ·
      // Cost Reduction → รหัสลูกค้า/รหัสสินค้าก่อนหน้า) — ช่องเดียวรับทั้งสองแบบ
      {
        key: 'prevProductCode', column: 'pdrPrevProductCode', label: 'รหัสสินค้า/ลูกค้าก่อนหน้า',
        hint: 'สำหรับ Product Modification และ Cost Reduction', type: 'text',
        showFor: ['modification', 'cost_reduction'],
      },
      // ⚠️ **ไม่ใช่คอลัมน์ pdr*** — วันนี้คือ `requestedDueDate` ของกลไกคำร้องซึ่งมี
      // อยู่ก่อนแล้ว · เก็บซ้ำอีกช่องเมื่อไรก็ได้สองวันที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนจริง
      {
        key: 'sampleDue', label: 'วันที่คาดหวังกำหนดส่งตัวอย่างกลิ่น',
        type: 'derived', derive: 'sampleDue', from: 'เติมจากช่อง "ต้องการคำตอบ"',
      },
      {
        // ⭐ หัวฟอร์มกระดาษเขียนไว้ว่า "หากเป็นงานด่วน … พร้อมแจ้งเหตุผลว่าทำไม"
        // ⇒ เป็น **คำถามในฟอร์ม** ไม่ใช่แค่ธงบนใบ · ช่องกรอกอยู่ที่ฟอร์มเปิดคำร้อง
        // (ติ๊กด่วนแล้วช่องนี้โผล่) — ที่นี่เป็นฝั่งอ่านสำหรับจอสรุปกับกระดาษ
        key: 'urgentReason', label: 'เหตุผลที่เป็นงานด่วน',
        type: 'derived', derive: 'urgentReason', from: 'กรอกตอนเปิดคำร้อง (เฉพาะงานด่วน)',
      },
    ],
  },
  {
    key: 'customer',
    title: 'ข้อมูลลูกค้า',
    fields: [
      // ⭐ 1.1/1.2 มาจาก **ทะเบียนลูกค้า** (มติผู้ใช้) ไม่ใช่ช่องกรอกซ้ำ — พิมพ์ซ้ำ
      // เมื่อไรก็ได้เบอร์สองชุดที่ขัดกัน และเบอร์ที่ RD โทรจะเป็นเบอร์ที่เก่ากว่า
      { key: 'contactName', label: 'ชื่อผู้ติดต่อ', type: 'derived', derive: 'contactName', from: 'เติมจากทะเบียนลูกค้า' },
      { key: 'contactPhone', label: 'Phone / Line', type: 'derived', derive: 'contactPhone', from: 'เติมจากทะเบียนลูกค้า' },
      { key: 'customer', label: 'ชื่อบริษัท', type: 'derived', derive: 'customer', from: 'เติมจาก SO' },
      { key: 'deal', label: 'ดีล', type: 'derived', derive: 'deal', from: 'เติมจาก SO' },
      // ⚠️ **ไม่ derive จากดีล** — ถามมูลค่าทั้งโครงการ ไม่ใช่ค่าออกแบบกลิ่นในใบนี้
      // (ลูกค้าอาจจ่ายค่าออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน — ผู้ใช้ทักเอง)
      {
        key: 'projectValue', column: 'pdrProjectValue', label: 'มูลค่าโปรเจกต์ทั้งหมด',
        type: 'money', placeholder: 'ทั้งโครงการ ไม่ใช่แค่ค่าออกแบบกลิ่น',
      },
      {
        key: 'scentCount', label: 'จำนวนกลิ่นที่ต้องการพัฒนา',
        type: 'derived', derive: 'scentCount', from: 'เติมจากใบสั่งขาย',
      },
      { key: 'customerBrand', column: 'pdrCustomerBrand', label: 'ชื่อแบรนด์', type: 'text' },
      { key: 'moodTone', column: 'pdrMoodTone', label: 'Mood & Tone', type: 'text' },
      { key: 'brandDirection', column: 'pdrBrandDirection', label: 'ทิศทางการเติบโตของแบรนด์', type: 'text' },
      { key: 'shipTo', column: 'pdrShipTo', label: 'ที่อยู่จัดส่งตัวอย่าง', type: 'text' },
      {
        key: 'customerKind', column: 'pdrCustomerKind', label: 'ประเภทลูกค้า',
        type: 'select', options: PDR_CUSTOMER_KINDS,
      },
      { key: 'productKind', column: 'pdrProductKind', label: 'ประเภทสินค้า', type: 'text' },
      { key: 'wantedAt', column: 'pdrWantedAt', label: 'วันที่ต้องการสินค้า', type: 'date' },
      { key: 'sellFrom', column: 'pdrSellFrom', label: 'วันที่ต้องการจำหน่าย', type: 'date' },
      // ⭐ ติ๊กแล้วเขียนต่อ (มติผู้ใช้) — สามช่องนี้อยู่ใต้หัวข้อย่อยเดียวกันบนฟอร์ม
      {
        key: 'targetDemographic', column: 'pdrTargetDemographic', label: 'DemoGraphic',
        hint: 'เพศ · อายุ · การศึกษา · รายได้', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
      {
        key: 'targetPsychographic', column: 'pdrTargetPsychographic', label: 'PsychoGraphic',
        hint: 'ความสนใจ · ไลฟ์สไตล์', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
      {
        key: 'targetPainpoint', column: 'pdrTargetPainpoint', label: 'Painpoint',
        hint: 'ทำไมต้องทำแบรนด์นี้', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
    ],
  },
  {
    key: 'spec',
    title: 'ข้อกำหนดผลิตภัณฑ์',
    fields: [
      {
        key: 'targetCost', column: 'pdrTargetCost', label: 'Target Cost / KG',
        hint: 'F/FB ไม่รวมบรรจุภัณฑ์', type: 'money',
      },
      {
        key: 'targetPrice', column: 'pdrTargetPrice', label: 'Target Price / Unit',
        hint: 'ราคาขาย', type: 'money',
      },
      { key: 'moq', column: 'pdrMoq', label: 'MOQ ที่คาดหวัง', type: 'text' },
      {
        key: 'texture', column: 'pdrTexture', label: 'ลักษณะเนื้อผลิตภัณฑ์',
        type: 'select', options: PDR_TEXTURES,
      },
      { key: 'color', column: 'pdrColor', label: 'สีเนื้อผลิตภัณฑ์', type: 'text' },
      { key: 'packSize', column: 'pdrPackSize', label: 'ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น', type: 'text' },
      // 2.8 รูปแบบบรรจุภัณฑ์
      {
        key: 'packagingForms', column: 'pdrPackagingForms', label: 'รูปแบบบรรจุภัณฑ์',
        type: 'multi', options: PDR_PACKAGING_FORMS,
      },
      {
        key: 'packagingArtwork', column: 'pdrPackagingArtwork', label: 'ภาพประกอบบรรจุภัณฑ์',
        type: 'select', options: PDR_ARTWORK,
      },
      // 2.9 Value Proposition — **ของทั้งใบ ไม่ใช่รายกลิ่น** (มติผู้ใช้)
      {
        key: 'vpAttribute', column: 'pdrVpAttribute', label: 'Attribute',
        hint: 'คุณสมบัติของสินค้า', type: 'tick', group: 'Value Proposition', wide: true,
      },
      {
        key: 'vpBenefit', column: 'pdrVpBenefit', label: 'Benefit',
        hint: 'ประโยชน์ที่ผู้ใช้ได้รับ', type: 'tick', group: 'Value Proposition', wide: true,
      },
      {
        key: 'vpValue', column: 'pdrVpValue', label: 'Value',
        hint: 'คุณค่าที่แบรนด์ส่งมอบ', type: 'tick', group: 'Value Proposition', wide: true,
      },
      { key: 'brandSample', column: 'pdrBrandSample', label: 'ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)', type: 'text', wide: true },
    ],
  },
  {
    key: 'regulatory',
    title: 'ข้อกำหนดด้านเอกสารและกฎระเบียบ',
    note: 'เอกสารที่ติ๊กจะยังไม่สร้างคำร้องขอเอกสาร — ฟอร์มระบุเองว่าได้รับหลังผลิตเป็นสินค้าแล้ว',
    fields: [
      {
        key: 'documents', column: 'pdrDocuments', label: 'เอกสารที่ลูกค้าต้องการ',
        type: 'multi', options: PDR_DOCUMENTS,
      },
      {
        key: 'exportDocNote', column: 'pdrExportDocNote', label: 'เอกสารส่งออก — ระบุ',
        type: 'text', wide: true, showForDocument: 'export',
        placeholder: 'ประเทศปลายทาง / ชนิดเอกสาร',
      },
      {
        key: 'specialRequirements', column: 'pdrSpecialRequirements', label: 'ข้อกำหนดเฉพาะอื่น ๆ',
        type: 'textarea', wide: true,
        placeholder: 'เช่น ห้ามใช้สารพาราเบน · Vegan · No Alcohol',
      },
    ],
  },
  {
    // ── ผู้เซ็นบนเอกสาร (ม-45 · mig 0221) ────────────────────────────────
    //
    // ⭐ **ชื่อบนกระดาษ ไม่ใช่ role ในระบบ** (มติผู้ใช้: "ตำแหน่งบนเอกสารก่อน
    // ยังไม่ต้องเป็น role จริง") — ตารางลายเซ็นของ FM-RD-01 มี 7 แถว ระบบรู้จริง
    // แค่ AE (คนเปิดใบ) กับ AE Supervisor (ประตูหัวหน้า) อีก 5 แถวพิมพ์เป็นเส้นว่าง
    //
    // ⚠️ **ไม่มีช่องไหนบังคับ และไม่บล็อกการปิดเรื่อง** — ใครยังไม่เซ็นก็เว้นไว้
    // แล้วเซ็นมือบนกระดาษได้เหมือนเดิม
    key: 'signers',
    title: 'ผู้เซ็นบนเอกสาร',
    note: 'ชื่อที่จะพิมพ์ในตารางลายเซ็นของ PDR — เป็นชื่อบนกระดาษ ไม่ใช่สิทธิ์ในระบบ · เว้นว่างได้',
    fields: [
      { key: 'signSalesManager', column: 'pdrSignSalesManager', label: 'Sale & Marketing Manager', type: 'text' },
      { key: 'signPerfumer', column: 'pdrSignPerfumer', label: 'Perfumer', type: 'text' },
      { key: 'signChemist', column: 'pdrSignChemist', label: 'Product Development Chemist', type: 'text' },
      { key: 'signCoordinator', column: 'pdrSignCoordinator', label: 'Project Coordinator', type: 'text' },
      { key: 'signFinalApprover', column: 'pdrSignFinalApprover', label: 'Final Approval (RD Supervisor)', type: 'text' },
    ],
  },
];

// ทุกช่องที่มีคอลัมน์จริง — ใช้ตรวจว่าไม่มีคอลัมน์ไหนหลุดจากจอ
export const PDR_FIELDS = PDR_SECTIONS.flatMap((s) => s.fields);
export const PDR_COLUMNS = PDR_FIELDS.map((f) => f.column).filter(Boolean);

const money = (v) => (v == null || v === '' ? null : Number(v).toLocaleString('th-TH'));

/**
 * ค่าที่ **พร้อมแสดง** ของช่องหนึ่ง — คืน string หรือ null ถ้าไม่ได้กรอก
 *
 * ⚠️ ที่เดียวที่แปลง enum เป็นป้ายไทย — เดิมเอกสารไม่ได้แปลง ⇒ พิมพ์ `new_product`
 * · `premium` · `existing` ลงกระดาษที่ส่งให้ลูกค้า
 *
 * ⚠️ ค่าที่ไม่รู้จักคืนค่าดิบ ไม่ใช่ null — ข้อมูลเก่าที่ enum เปลี่ยนไปแล้วต้องยัง
 * เห็นบนจอ ไม่ใช่หายเงียบจนดูเหมือนไม่เคยกรอก
 */
export function pdrFieldText(field, request = {}, context = {}) {
  if (!field) return null;

  if (field.type === 'derived') {
    const { briefs = [] } = context;
    switch (field.derive) {
      // ⚠️ AE/AC เป็นของ **โครงการ** (mig 0190) ไม่ใช่คนกดปุ่ม — แต่ถอยไปใช้ชื่อคน
      // เปิดใบเมื่อโครงการยังไม่ระบุ · ช่องว่างบนเอกสารที่ต้องมีคนรับผิดชอบเสมอ
      // แย่กว่าชื่อที่ใกล้ความจริงที่สุด
      // ⚠️ อ่านจาก `submittedAt` ที่เดียว — ร่างยังไม่ส่ง = ยังไม่มีวันยื่น ⇒ N/A
      case 'requestedAt': return context.requestedAt ?? requestedAtText(request);
      case 'requester': return context.requester || request.requestedByName || null;
      case 'coordinator': return context.coordinator || null;
      case 'department': return 'การขายและบริการ';
      case 'customer': return context.customer || request.customerName || null;
      case 'deal': return context.deal || null;
      case 'contactName': return context.contactName || null;
      case 'contactPhone': return context.contactPhone || null;
      // ⚠️ วันเดียวกับ `requestedDueDate` ของกลไกคำร้อง ไม่ใช่คอลัมน์ใหม่
      case 'sampleDue': return context.sampleDue ?? sampleDueText(request);
      // ⚠️ ใบที่ไม่ได้ติ๊กด่วนต้องได้ค่าว่าง **ไม่ใช่ค่าที่ค้างจากตอนเคยติ๊ก** —
      // API ล้างคอลัมน์ให้เมื่อถอดธงอยู่แล้ว ตรงนี้กันอีกชั้นสำหรับแถวเก่า
      case 'urgentReason': return request.urgent ? (request.urgentReason || '') : '';
      // ⚠️ **จำนวนกลิ่นมาจากใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ** (มติผู้ใช้ 2026-08-08)
      //
      // 🐞 เดิมถอยไปใช้ `briefs.length` เมื่อผู้เรียกไม่ส่งมา ⇒ ใบที่ AE **รวบเป็น
      // บรีฟเดียว** (ลูกค้าบอกแนวเดียว "ทำแนวสดชื่นมา 3 ทาง" — โหมดที่ฟอร์มเปิดให้ทำ
      // อยู่แล้ว) จะพิมพ์ลงกระดาษว่า **1 กลิ่น** ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3
      // ⇒ จำนวนที่ลูกค้าจ่ายไปแล้วต้องมาจาก qty ของบรรทัดออกแบบกลิ่นเสมอ
      //
      // ⚠️ ไม่มีค่าจากผู้เรียก = ไม่รู้ ⇒ N/A · **ห้ามเดาจากจำนวนก้อน** เพราะเดาแล้ว
      // ผิดเงียบ ซึ่งแย่กว่าช่องว่างที่บอกตรง ๆ ว่ายังไม่รู้
      case 'scentCount': {
        const n = context.scentCount ?? null;
        return n ? `${n} กลิ่น` : null;
      }
      default: return null;
    }
  }

  const raw = request[field.column];

  // ⚠️ ช่องติ๊กหลายตัวมาเป็น array — ว่างคือ "ยังไม่ได้เลือก" ไม่ใช่ค่าที่แสดงเป็น []
  if (field.type === 'multi') {
    const list = Array.isArray(raw) ? raw : [];
    if (!list.length) return null;
    return list.map((v) => labelOf(field.options || [], v) || String(v)).join(' · ');
  }

  if (raw == null || String(raw).trim() === '') return null;
  if (field.type === 'select') return labelOf(field.options || [], raw) || String(raw);
  if (field.type === 'money') return money(raw);
  return String(raw).trim();
}

/**
 * ช่องนี้ควรโผล่บนฟอร์มไหม — บางช่องขึ้นต่อเมื่อเลือกตัวเลือกบางตัวเท่านั้น
 *
 * ⭐ รหัสสินค้าก่อนหน้า ขึ้นเฉพาะ Product Modification / Cost Reduction
 * ⭐ "เอกสารส่งออก — ระบุ" ขึ้นเฉพาะเมื่อติ๊ก "เอกสารส่งออก"
 *
 * ⚠️ **ซ่อนบนฟอร์มเท่านั้น ไม่ลบค่า** — ผู้ใช้สลับประเภทไปมาแล้วค่าที่พิมพ์ไว้ต้อง
 * ไม่หาย · และจอแสดง/เอกสารยังโชว์ค่าที่มีอยู่เสมอ ไม่งั้นข้อมูลจะหายไปจากสายตา
 * ทั้งที่ยังอยู่ในฐานข้อมูล
 */
export function pdrFieldVisible(field, values = {}) {
  if (field?.showFor) return field.showFor.includes(values.requestType);
  if (field?.showForDocument) {
    const list = Array.isArray(values.documents) ? values.documents : [];
    return list.includes(field.showForDocument);
  }
  return true;
}

/**
 * ติ๊กว่ามีภาพประกอบแล้วต้องแนบจริง — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ มติผู้ใช้ตอนไล่ฟอร์ม: "แยกแต่ถ้าบอกมี ต้องแนบภาพประกอบนะ" · ปล่อยให้ติ๊กแล้ว
 * ไม่แนบ = RD ตามหาภาพที่ไม่มีอยู่จริง ซึ่งแย่กว่าติ๊กว่าไม่มีตั้งแต่แรก
 *
 * ⚠️ **ไม่บังคับตอนเปิดใบ** — หน้า `/requests/new` แนบไฟล์ไม่ได้ (ต้องมี id ก่อน)
 * ⇒ ผู้เรียกส่ง `stage: 'submit'` ตอนกดส่งเท่านั้น ซึ่งเป็นจังหวะที่แนบได้แล้ว
 */
export function pdrArtworkError(values = {}, { attachmentCount = 0, stage = null } = {}) {
  if (stage !== 'submit') return null;
  if (values.packagingArtwork !== 'has') return null;
  return attachmentCount > 0 ? null : 'ติ๊กว่ามีภาพประกอบบรรจุภัณฑ์แล้ว — ต้องแนบไฟล์ภาพก่อนส่ง';
}

/**
 * แถวของหัวข้อหนึ่ง พร้อมแสดง — [[ป้าย, ค่า], …]
 *
 * `includeEmpty: true` สำหรับเอกสาร (ช่องว่างต้องพิมพ์เป็นเส้นให้เขียนมือ)
 * · ค่าเริ่มต้นตัดช่องว่างทิ้ง สำหรับบนจอ (21 ช่องส่วนใหญ่ไม่บังคับ ⇒ แสดงครบ
 *   จะกลบของที่กรอกจริงจนหาไม่เจอ)
 */
export function pdrSectionRows(section, request = {}, { includeEmpty = false, context = {} } = {}) {
  return (section?.fields || [])
    .map((f) => [f.label, pdrFieldText(f, request, context)])
    .filter(([, v]) => includeEmpty || (v != null && String(v).trim() !== ''));
}

/**
 * ค่าที่ระบบเติมให้เอง — ประกอบจากแถวที่โหลดมาแล้ว คืน object ที่ส่งเป็น `context`
 *
 * ⭐ **ที่เดียวที่รู้ว่าค่าเติมเองมาจากตารางไหน** — จอแสดง เอกสาร และฟอร์มตอนเปิดใบ
 * เรียกตัวนี้ทั้งหมด ⇒ "ผู้ร้องขอ AE บนเอกสาร" กับ "ผู้ร้องขอ AE บนจอ" เป็นคนเดียวกัน
 * เสมอ ไม่ใช่เพราะบังเอิญเขียนเหมือนกัน
 *
 * ⚠️ AE/AC เป็นของ **โครงการ** (mig 0190) — ใช้ `aeOwner`/`acOwner` ซึ่งเป็น *ชื่อ*
 * ไม่ใช่ `aeOwnerId` · ชื่อคือสิ่งที่ต้องพิมพ์ลงเอกสาร และเป็น snapshot ตามเจตนาเดิม
 *
 * ⚠️ ผู้ติดต่อเอาจาก `contacts[0]` ก่อน แล้วค่อยถอยไป `contactPerson/contactPhone`
 * — 0033 ย้ายไป contacts[] แต่คอลัมน์เก่ายังมีค่าอยู่บนแถวที่ไม่เคยถูกแก้
 */
// วันที่คาดหวังตัวอย่าง — `requestedDueDate` ของกลไกคำร้อง ไม่ใช่คอลัมน์ของ PDR
//
// ⚠️ "ด่วน" ต่อท้ายเพราะกระดาษสั่งให้ระบุคำนี้ตรง ๆ เมื่อเป็นงานด่วน · ใบที่ติดธงด่วน
// แต่ยังไม่ระบุวันต้องยังขึ้นให้เห็นว่าด่วน ไม่ใช่เงียบไปทั้งช่อง
// วันที่ยื่นคำร้อง — ตัดเหลือ YYYY-MM-DD (คอลัมน์เป็น timestamptz)
//
// ⚠️ **ไม่ถอยไปใช้ `createdAt`** — สองวันนี้ต่างกันจริงเมื่อร่างค้างไว้ก่อนกดส่ง
// และกระดาษถามหา "วันที่ร้องขอ" ซึ่งคือวันที่เรื่องออกจากมือผู้ขอ ไม่ใช่วันที่เริ่มพิมพ์
function requestedAtText(request = {}) {
  const at = request.submittedAt || null;
  return at ? String(at).slice(0, 10) : null;
}

function sampleDueText(request = {}) {
  const at = request.requestedDueDate || null;
  if (!at && !request.urgent) return null;
  return `${at || 'ยังไม่ระบุวัน'}${request.urgent ? ' · ด่วน' : ''}`;
}

// ⚠️ `salesOrderLines` = บรรทัดของใบสั่งขายที่ผูกอยู่ — ใช้หา **จำนวนกลิ่นที่ขาย**
// ไม่ใช่จำนวนก้อนบรีฟ (ดูเหตุผลที่ `case 'scentCount'`) · ไม่ส่งมา = ช่องนั้นขึ้น N/A
export function pdrContext({
  request = {}, project = null, customer = null, deal = null, briefs = [], salesOrderLines = null,
} = {}) {
  const primary = (Array.isArray(customer?.contacts) ? customer.contacts[0] : null) || {};
  const phone = primary.phone || customer?.contactPhone || null;
  const line = primary.line || customer?.line || null;
  return {
    requestedAt: requestedAtText(request),
    requester: project?.aeOwner || request.requestedByName || null,
    coordinator: project?.acOwner || null,
    customer: request.customerName || customer?.name || null,
    deal: deal?.code || deal?.id || null,
    contactName: primary.name || customer?.contactPerson || null,
    // Phone / Line เป็นช่องเดียวบนกระดาษ — ต่อกันด้วย · เมื่อมีทั้งคู่
    contactPhone: [phone, line].filter(Boolean).join(' · ') || null,
    sampleDue: sampleDueText(request),
    scentCount: salesOrderLines ? scentCountForOrder(salesOrderLines) : null,
    briefs,
  };
}

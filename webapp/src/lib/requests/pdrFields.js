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
      { key: 'requester', label: 'ผู้ร้องขอ (AE)', type: 'derived', derive: 'requester', from: 'เติมจากผู้เปิดใบ' },
      {
        key: 'requestType', column: 'pdrRequestType', label: 'ประเภทของคำขอ',
        type: 'select', options: PDR_REQUEST_TYPES,
      },
    ],
  },
  {
    key: 'customer',
    title: 'ข้อมูลลูกค้า',
    fields: [
      { key: 'customer', label: 'ลูกค้า', type: 'derived', derive: 'customer', from: 'เติมจาก SO' },
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
      { key: 'brandSample', column: 'pdrBrandSample', label: 'ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)', type: 'text', wide: true },
    ],
  },
  {
    key: 'regulatory',
    title: 'ข้อกำหนดด้านเอกสารและกฎระเบียบ',
    note: 'เอกสารที่ติ๊กจะยังไม่สร้างคำร้องขอเอกสาร — ฟอร์มระบุเองว่าได้รับหลังผลิตเป็นสินค้าแล้ว',
    fields: [
      {
        key: 'specialRequirements', column: 'pdrSpecialRequirements', label: 'ข้อกำหนดเฉพาะอื่น ๆ',
        type: 'textarea', wide: true,
        placeholder: 'เช่น ห้ามใช้สารพาราเบน · Vegan · No Alcohol',
      },
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
    if (field.derive === 'requester') return context.requester || request.requestedByName || null;
    if (field.derive === 'customer') return context.customer || request.customerName || null;
    if (field.derive === 'deal') return context.deal || null;
    if (field.derive === 'scentCount') {
      const n = context.scentCount ?? (briefs.length || null);
      return n ? `${n} กลิ่น` : null;
    }
    return null;
  }

  const raw = request[field.column];
  if (raw == null || String(raw).trim() === '') return null;
  if (field.type === 'select') return labelOf(field.options || [], raw) || String(raw);
  if (field.type === 'money') return money(raw);
  return String(raw).trim();
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

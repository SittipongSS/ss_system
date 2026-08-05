// ── RD · หัวข้อเก่า — อ่านของเดิมได้ครบ แต่เปิดใบใหม่ไม่ได้อีก ───────────
//
// ⚠️ **ห้ามลบทิ้ง**: prod มีคำร้องที่ใช้หัวข้อพวกนี้อยู่จริง ลบแล้วใบเก่าจะกลายเป็น
// ชื่อ key ดิบบนหน้าจอ · ธง `legacy` กรองออกจากลิสต์ตอนเปิดใบใหม่เท่านั้น
// (`kindsForDept`) ส่วน `requestKindLabel` ยังรู้จักครบ
//
// ⭐ อยู่ **ไฟล์เดียวรวมกัน** ไม่แยกไฟล์ละหัวข้อเหมือนของที่ยังใช้อยู่ — ของตายแล้ว
// ไม่ควรกินที่เท่าของเป็น และไม่มีใครต้องมาแก้มันอีก
const scentBrief = {
  key: 'scent_brief',
  // ⚠️ ป้ายชื่อ **ไม่ต่อท้ายว่า "เลิกใช้"** — ป้ายนี้ไปโผล่บนใบเก่าที่เปิดไปแล้ว
  // ซึ่งตัวใบไม่ได้เลิกใช้ มีแต่ *หัวข้อ* ที่เปิดใหม่ไม่ได้
  label: 'แจ้งบรีฟออกแบบกลิ่น',
  legacy: true,
  dept: 'RD', scope: 'SB', hasItems: false,
  needs: ['salesOrder'],
  stepKey: 'scent-06', dealType: 'SCENT',
  form: {
    titlePlaceholder: 'เช่น บรีฟกลิ่นสำหรับ Reed Diffuser',
    bodyLabel: 'บรีฟกลิ่น',
    bodyPlaceholder: 'โทนกลิ่นที่ต้องการ · กลุ่มลูกค้า · ตัวอย่างอ้างอิง · ข้อจำกัด',
  },
  hint: 'ต้องมีใบสั่งขายออกแบบกลิ่นก่อน (ค่าบริการ) — ปิดเรื่องแล้วกลิ่นเข้าทะเบียน',
};

const mockup = {
  key: 'mockup',
  label: 'ขอ Mock-up',
  legacy: true,
  dept: 'RD', scope: 'MU', hasItems: false,
  // ⚠️ เคยบังคับ `productType` ด้วย — mig 0204 DROP `dept_requests.productTypeId`
  // ทิ้งไปแล้ว ค่าที่กรอกจึงไม่มีที่เก็บ · หมวดสินค้ากลับมาเป็น **รายแถว** ที่
  // หัวข้อ "พัฒนาผลิตภัณฑ์" แทน
  needs: ['project', 'deal', 'scent'],
  stepKey: 'npd-15', dealType: 'NPD',
  form: {
    titlePlaceholder: 'เช่น ขอ Mock-up ขวด 30 ml พร้อมฉลาก',
    bodyLabel: 'รายละเอียด',
    bodyPlaceholder: 'รูปแบบที่ต้องการ · ขนาด · ข้อจำกัด',
    scentLabel: 'กลิ่นที่ลูกค้ามีอยู่',
  },
  hint: 'ขอตัวอย่างจริงจาก RD — อ้างกลิ่นที่ลูกค้ามีและประเภทสินค้าที่จะขึ้น',
};

const RD_LEGACY_KINDS = [scentBrief, mockup];

export default RD_LEGACY_KINDS;

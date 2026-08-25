// ── ปลายทางและป้ายชื่อของแจ้งเตือน (mig 0185) ────────────────────────────
//
// แยกจาก `lib/notifications.js` เพราะ **หน้าจอต้องใช้ด้วย** — ไฟล์นั้น import
// `node:crypto` กับตัวอ่าน Supabase ซึ่งลากเข้า bundle ฝั่งเบราว์เซอร์ไม่ได้
// ที่นี่จึงเป็นข้อมูลล้วน ไม่ import อะไรเลย (แพตเทิร์นเดียวกับ `lib/issues/statuses.js`)
//
// ⚠️ ทะเบียนนี้ต้องครบทุก entity ที่มีเธรด (`UPDATE_ENTITIES`) — มีเทสต์ไล่ทีละตัว
// ใน `notifications.test.mjs` ว่าไม่มีตัวไหนกดแล้วไม่ไปไหน

// เธรดของ entity ไหนกดไปหน้าไหน — เก็บ path ตอนสร้างเพราะกล่องแจ้งเตือนไม่ควรต้อง
// รู้จัก routing ของทุกโมดูล · entity ที่ไม่มีในนี้ = แจ้งเตือนไม่มีลิงก์ (ยังอ่านได้)
const HREF = {
  personal_task: (id) => `/pm/tasks/${id}`,
  project: (id) => `/sa/projects/${id}`,
  dept_request: (id) => `/requests/${id}`,
  deal: (id) => `/sa/deals/${id}`,
  lead: (id) => `/sa/leads/${id}`,
  costing_request: (id) => `/sa/costing/${id}`,
  customer: (id) => `/database/customers/${id}`,
  product: (id) => `/database/products/${id}`,
  excise_registration: (id) => `/tax/registrations/${id}`,
  excise_order: (id) => `/tax/filings/${id}`,
  sahamit_po: (id) => `/sahamit/po/${id}`,
  // นัดเข้าบริการยังไม่มีหน้ารายละเอียดรายใบ — ส่งไปที่ **ตาราง** ซึ่งเป็นที่ที่เปิด
  // นัดนั้นได้จริง (คลิกชิปแล้วโมดัลเปิดพร้อมเธรด)
  service_visit: () => '/service/schedule',
  system_issue: (id) => `/support/${id}`,
  // สัญญา — แจ้งเตือนพาไปที่ใบ ไม่ใช่ทะเบียน (เรื่องที่ต้องตัดสินใจอยู่บนใบใบเดียว)
  sales_contract: (id) => `/sa/contracts/${id}`,
};

// ป้ายที่ขึ้นหัวแจ้งเตือน — ใช้ชื่อเอกสารจากแถวแม่ถ้ามี ไม่มีก็ใช้ id ดิบเป็นทางสุดท้าย
// (⚠️ กฎเดิม: อย่า fallback เป็น id ดิบบนหน้าจอถ้าเลี่ยงได้ — ลองหลายช่องก่อน)
export const ENTITY_LABEL = {
  personal_task: 'งาน',
  project: 'โครงการ',
  dept_request: 'คำร้อง',
  deal: 'ดีล',
  lead: 'ลีด',
  costing_request: 'ใบขอราคาผลิต',
  customer: 'ลูกค้า',
  product: 'สินค้า',
  excise_registration: 'ทะเบียนสรรพสามิต',
  excise_order: 'ใบยื่นชำระภาษี',
  sahamit_po: 'PO สหมิตร',
  service_visit: 'นัดเข้าบริการ',
  system_issue: 'เรื่องแจ้งปัญหา',
  sales_contract: 'สัญญา',
  // รายงานประจำสัปดาห์ ไม่ใช่ระเบียนในระบบ — ป้ายจึงบอก "เรื่องอะไร" ไม่ใช่ "ใบไหน"
  // (ถ้าไม่มีบรรทัดนี้ แถวจะขึ้นว่า "รายการ" ซึ่งไม่บอกอะไรเลย)
  drive_orphans: 'ไฟล์กำพร้าบน Drive',
};

export function notificationHref(entityType, entityId) {
  return HREF[entityType] ? HREF[entityType](entityId) : null;
}

/**
 * ป้ายชนิดของแถวในกล่อง — ป้ายเดียวกับที่ถูกต่อไว้ในหัวข้อตอนสร้าง
 *
 * หัวข้อถูกเก็บเป็นข้อความตายตัวในแถว (ชื่อเอกสารตอนนั้น) ป้ายนี้จึงเป็นตัวเดียวที่
 * ยังบอกชนิดของแถวเก่าได้ถูกต้องแม้ทะเบียนจะเปลี่ยนคำในภายหลัง
 */
export function entityLabel(entityType) {
  return ENTITY_LABEL[entityType] || 'รายการ';
}

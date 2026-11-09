// ── สำเนาชื่อลูกค้าที่กระจายอยู่ตามตารางอื่น ─────────────────────────────
//
// ⭐ ที่มา (2026-08-27): เปลี่ยนชื่อลูกค้าที่ทะเบียนแล้ว **ชื่อเก่าค้างถาวร** ในบางระบบ
// เพราะ 5 ตารางก๊อปคอลัมน์ `customerName` ไว้ แต่ตอนแก้ลูกค้ามี cascade ให้ตารางเดียว
// (`excise_registrations`) ที่เขียนไว้แบบ hard-code ในตัว route
//
// ของจริงที่วัดได้ตอนพบ: projects 3 แถว · sales_deals 4 แถว ชื่อไม่ตรงทะเบียน เช่น
//   โครงการ/ดีลยังโชว์ "นางสาว ไพลิน สถิตบุญวิวัฒน์" ทั้งที่ลูกค้ากลายเป็น
//   "บริษัท ดานิสตาร์ จำกัด" ไปแล้ว
//
// ── ทำไมเลือก cascade ไม่ใช่ "join อ่านสด" ──────────────────────────────
// คอลัมน์ที่ก๊อปไว้ถูกอ่านกระจายอยู่ **สิบกว่าจุด** ทั้ง API และหน้าจอ (PM my-work,
// task-deals, DealPicker, ProjectDealsHub, การ์ดบริบทของงาน ฯลฯ) — เปลี่ยนทุกจุดให้
// join คือรีแฟกเตอร์ใหญ่ที่มีโอกาสพลาดสูง ขณะที่ cascade แก้ที่จุดเขียนจุดเดียว
// แล้วทุกจุดอ่านเดิมถูกต้องทันที
//
// ข้อเสียของ cascade คือ "ต้องไล่เพิ่มทุกครั้งที่มีตารางใหม่" ซึ่งคือสาเหตุที่พังรอบนี้
// (5 ตาราง cascade แค่ 1) ⇒ แก้ด้วยการย้ายรายการมาไว้ที่นี่ **ที่เดียว** แล้วให้เทสต์
// บังคับว่าทุกตารางที่ถือสำเนาต้องประกาศโหมดของตัวเองไว้ตรงนี้
//
// ── โหมด ──────────────────────────────────────────────────────────────
// 'live'   = สำเนาต้องเดินตามทะเบียนเสมอ — cascade ให้ตอนแก้ลูกค้า
// 'frozen' = **เอกสาร** ชื่อบนใบคือชื่อ ณ วันออกใบ ห้ามขยับ (มติผู้ใช้ 2026-08-27:
//            อยากได้ข้อมูลใหม่ต้องออก Rev.) — ต้องมี `reason` กำกับเสมอ
//
// ── แหล่งที่มาของค่า ('displayName') ────────────────────────────────────
// 🐞 2026-09-03: `fields: { customerName: 'name' }` แบบเดิมประทับ null ให้ลูกค้าที่มี
// แต่ชื่ออังกฤษ ⇒ สำเนาชื่อต้องผ่าน `customerSnapshotName` (ไทยก่อน ตกไปอังกฤษ)
// ไม่ใช่หยิบคอลัมน์ `name` ดิบ · คีย์ 'displayName' ไม่ใช่คอลัมน์จริงในตาราง customers
// เป็นตัวบอกว่า "ให้คิดจากกติกาสองภาษา" — ตัวอื่น (taxId) ยังหยิบคอลัมน์ตรง ๆ เหมือนเดิม
import { customerSnapshotName } from './customerName.js';

const SOURCE_RESOLVERS = Object.freeze({ displayName: customerSnapshotName });

/* แปลง source ของทะเบียน → ค่าที่ประทับจริง
   export ออกไปเพราะสคริปต์ backfill ต้องใช้ **ตัวเดียวกับ cascade** — ก่อนหน้านี้
   สคริปต์ก๊อปตรรกะไปเขียนซ้ำ (hard-code เช็ค 'displayName') แล้วพอทะเบียนเพิ่ม
   resolver ใหม่ สคริปต์ตามไม่ทันแบบเงียบ ๆ จนเขียนค่าคนละตัวกับที่ระบบเขียน */
export const customerMirrorValue = (customer, sourceField) => (SOURCE_RESOLVERS[sourceField]
  ? SOURCE_RESOLVERS[sourceField](customer)
  : customer[sourceField] ?? null);
export const CUSTOMER_NAME_MIRRORS = Object.freeze([
  // ทะเบียนสรรพสามิต: snapshot ไว้โชว์/ดูประวัติ ไม่ใช่เอกสารที่ส่งลูกค้า
  { table: 'excise_registrations', mode: 'live', fields: { customerName: 'displayName', taxId: 'taxId' } },
  // โครงการ: ภาชนะของงาน ไม่ใช่เอกสาร — ชื่อลูกค้าควรเป็นชื่อปัจจุบันเสมอ
  { table: 'projects', mode: 'live', fields: { customerName: 'displayName' } },
  // ดีล: API รายการ join ทะเบียนสดอยู่แล้ว แต่คอลัมน์นี้ยังถูกอ่านตอนจัดกลุ่ม/ค้นหา
  // ⇒ ต้อง cascade ด้วย ไม่งั้นชื่อบนแถวกับชื่อที่ใช้จัดกลุ่มเป็นคนละตัว
  { table: 'sales_deals', mode: 'live', fields: { customerName: 'displayName' } },

  /* ── ข้อมูลหลักฝั่งสินค้า (เพิ่ม 2026-11-09) ─────────────────────────────
     🐞 เจ้าของแจ้ง: แก้ชื่อลูกค้า AR-1056 แล้ว FG-1056-03-002 ยังโชว์ชื่อเก่า
     ("บริษัท กอ ขอ 168 จำกัด") — `products` ถือสำเนา `customerName` มาตั้งแต่ก่อนมี
     ทะเบียนนี้ แต่ไม่เคยถูกประกาศ ⇒ ไม่มี cascade · วัดบน prod วันพบ: FG 53 แถว
     (ลูกค้า 22 ราย) · กลิ่น 13 · สูตร 5 · ไซต์บริการ 2 · ราคาวัตถุดิบเฉพาะลูกค้า 5
     ทั้งหมดเป็น **ทะเบียน** ไม่ใช่เอกสาร (ม. ฐานข้อมูล = ศูนย์กลาง 09/11) ⇒ live */
  // สินค้า FG: หน้าสินค้า "ลูกค้าเจ้าของ" · BOM board · สเปค · ป้ายเจ้าของบนบรรทัด QT อ่านช่องนี้
  { table: 'products', mode: 'live', fields: { customerName: 'displayName' } },
  // ทะเบียนกลิ่น/สูตรของ RD: ชื่อลูกค้าเจ้าของกลิ่น (ใบ PDR ที่ออกแล้วตรึงอยู่ในเอกสารของมันเอง)
  { table: 'scents', mode: 'live', fields: { customerName: 'displayName' } },
  { table: 'formulas', mode: 'live', fields: { customerName: 'displayName' } },
  // แชร์กลิ่น/สูตรให้ลูกค้าอื่น (ม-150): คอลัมน์ "snapshot ตอนแชร์" ใช้วาดรายชื่อผู้ได้รับแชร์
  { table: 'scent_customer_shares', mode: 'live', fields: { customerName: 'displayName' } },
  { table: 'formula_customer_shares', mode: 'live', fields: { customerName: 'displayName' } },
  // ทะเบียนไซต์บริการ: ไซต์มีชื่อของตัวเอง (`name`) ช่องนี้คือชื่อลูกค้าเจ้าของไซต์
  // (เอกสารประเมินพื้นที่ที่ออกแล้วตรึง HTML ไว้ ไม่อ่านช่องนี้ย้อนหลัง)
  { table: 'service_sites', mode: 'live', fields: { customerName: 'displayName' } },
  // คลังราคาวัตถุดิบ: ราคาเฉพาะลูกค้า — ตัวตนของแถวผูก `customerId` ไม่ใช่ชื่อ (mig 0181)
  { table: 'material_prices', mode: 'live', fields: { customerName: 'displayName' } },
  /* คำร้อง RQ ทุกฝ่าย (เดิม material_price_asks · rename ที่ 0173) — มติเจ้าของ 09/11
     "เปลี่ยนตาม" รวมใบที่ปิดแล้ว: เป็นงานภายใน ไม่ใช่เอกสารส่งลูกค้า และใบ PDR อ่าน
     ที่อยู่/ไทย-ต่างชาติสดจากทะเบียนอยู่แล้ว ชื่อจึงต้องเดินชุดเดียวกัน
     (prod วันตัดสิน: ค้างชื่อเก่า 35 ใบจาก 15 ลูกค้า) · ยาม guard_dept_request (0173)
     กันแค่ docNo/ใบยกเลิก ไม่กันการเขียนชื่อ */
  { table: 'dept_requests', mode: 'live', fields: { customerName: 'displayName' } },

  /* ── เอกสาร: ตรึงชื่อ ณ วันออกใบ ───────────────────────────────────────── */
  {
    table: 'costing_requests',
    mode: 'frozen',
    reason: 'ใบขอราคาผลิตเป็นเอกสารที่ส่งต่อฝ่ายต้นทุน — mig 0141 ประกาศไว้ตั้งแต่เกิดว่า '
      + 'snapshot เพื่อ "ลูกค้าเปลี่ยนชื่อแล้วใบเก่าไม่เพี้ยน" · ฉบับใหม่ออกผ่าน revise',
  },
  {
    table: 'sales_contracts',
    mode: 'frozen',
    reason: 'สัญญาเป็นเอกสารที่ลงนามกับลูกค้า — ชื่อคู่สัญญาคือชื่อ ณ วันทำสัญญา '
      + 'อยากได้ชื่อใหม่ต้องออก Rev. (กติกาเดียวกับใบเสนอราคา)',
  },
  {
    table: 'shipment_prep',
    mode: 'frozen',
    reason: 'ใบเตรียมส่งของมีเลขที่และสถานะพิมพ์แล้ว (printed) — เป็นเอกสารที่ออกไปกับของ '
      + 'ชื่อบนใบต้องตรงกับที่พิมพ์ออกไป',
  },
  {
    table: 'orders',
    mode: 'frozen',
    reason: 'ตารางใบสั่งรุ่นแรก (mig 0004) ประกาศคอลัมน์นี้ว่า "snapshot at time of order" — '
      + 'เลิกใช้แล้ว (ว่างบน prod) ประกาศไว้ให้ยามครบเท่านั้น',
  },
  {
    table: 'sales_orders',
    mode: 'frozen',
    reason: 'ใบสั่งขายเป็นเอกสารสายเดียวกับใบเสนอราคา — ชื่อบนใบสืบ snapshot มาจากใบที่ผูกอยู่ '
      + 'และเป็นชื่อที่ลูกค้ายืนยันคำสั่งซื้อไว้ ขยับตามทะเบียนไม่ได้',
  },
  {
    table: 'quotations',
    mode: 'frozen',
    reason: 'ใบเสนอราคาเป็นหลักฐานการค้า — ชื่อ/ที่อยู่/สาขาบนใบตรึง ณ วันออกใบ '
      + 'อยากได้ข้อมูลใหม่ต้องออก Rev. (มติผู้ใช้ 2026-08-27) · หมายเหตุ: "ร่างที่ยังไม่ยื่น" '
      + 'โชว์ชื่อลูกค้าสดจากทะเบียนตอนอ่าน (refreshCustomerNameForDisplay) ซึ่งไม่ขัดกับ '
      + 'frozen ตรงนี้ เพราะเป็นการแสดงผล ไม่ได้เขียนทับคอลัมน์',
  },
]);

export const liveCustomerNameMirrors = () => CUSTOMER_NAME_MIRRORS.filter((m) => m.mode === 'live');

/* เขียนชื่อ (และเลขภาษีถ้าตารางนั้นเก็บไว้) ของลูกค้าหนึ่งรายลงทุกตารางโหมด 'live'
   ⚠️ **ต้องเช็ค error ทุกตาราง** — ตัวเดิมที่ hard-code ไว้ใน route ไม่เช็คเลย
   สำเนาที่อัปเดตไม่สำเร็จจะเงียบสนิท แล้วไปโผล่เป็น "ชื่อไม่ตรงกัน" ทีหลัง
   คืนรายชื่อตารางที่พลาด — ผู้เรียกตัดสินใจเองว่าจะบล็อกหรือแค่ log
   (การแก้ลูกค้าไม่ควรล้มเพราะสำเนาตารางเดียวเขียนไม่ผ่าน) */
export async function cascadeCustomerName(supabase, customerId, customer) {
  if (!customerId || !customer) return [];
  const failed = [];
  for (const mirror of liveCustomerNameMirrors()) {
    const patch = {};
    for (const [column, sourceField] of Object.entries(mirror.fields)) {
      patch[column] = customerMirrorValue(customer, sourceField);
    }
    const { error } = await supabase.from(mirror.table).update(patch).eq('customerId', customerId);
    if (error) {
      failed.push(mirror.table);
      console.error(`[customer] cascade ชื่อลูกค้าไปที่ ${mirror.table} ไม่สำเร็จ:`, error.message);
    }
  }
  return failed;
}

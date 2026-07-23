// เติมข้อมูลลูกค้าที่ "ว่าง" บนเอกสาร (ใบเสนอราคา/ใบสั่งขาย) จากทะเบียนลูกค้าสด
//
// ข้อมูลลูกค้าบนใบเป็น snapshot ณ วันสร้าง (read-only, immutable) แต่ใบที่สร้างก่อน
// ฟีเจอร์ snapshot ครบ — ผู้ติดต่อ (2026-07-19) และเลขผู้เสียภาษี (2026-07-21) — จะมี
// บางช่องว่าง ทำให้เอกสารแสดง "-". ตัวช่วยนี้ดึงค่าจากตาราง customers ตาม customerId
// ที่ตรึงบนใบ มาเติม "เฉพาะช่องที่ว่าง" — ไม่ทับค่าที่ตรึงไว้แล้ว จึงคงความ immutable
// ของ snapshot ที่มีจริง และไม่ต้องออก Revise ใบเก่าทีละใบ.
export const CUSTOMER_SNAPSHOT_FIELDS = [
  'customerTaxId',
  'billingAddress',
  'shippingAddress',
  'branchCode',
  'contactName',
  'contactPhone',
];

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

// map แถวลูกค้า (customers) → รูปฟิลด์ snapshot บนใบ. ผู้ติดต่อยึดรายการแรกใน contacts
// (โครงสร้างใหม่) ไม่มีก็ falldown ไป contactPerson/contactPhone (ฟิลด์เดิม).
function customerToSnapshot(customer) {
  const contacts = Array.isArray(customer.contacts) ? customer.contacts : [];
  const primary = contacts[0] || {};
  return {
    customerTaxId: customer.taxId || null,
    billingAddress: customer.address || null,
    shippingAddress: customer.shippingAddress || customer.address || null,
    branchCode: customer.branchCode || null,
    contactName: primary.name || customer.contactPerson || null,
    contactPhone: primary.phone || customer.contactPhone || null,
  };
}

// record = อ็อบเจกต์ที่มี customerId + ฟิลด์ snapshot (quotation หรือ order.quotation).
// คืน record เดิมถ้าไม่มีช่องว่าง/ไม่มี customerId/หาลูกค้าไม่เจอ (ไม่ยิง query เกินจำเป็น).
export async function fillCustomerSnapshotFromMaster(supabase, record) {
  if (!record || !record.customerId) return record;
  if (!CUSTOMER_SNAPSHOT_FIELDS.some((field) => isBlank(record[field]))) return record;

  const { data: customer } = await supabase
    .from('customers')
    .select('taxId, address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
    .eq('id', record.customerId)
    .maybeSingle();
  if (!customer) return record;

  const fromMaster = customerToSnapshot(customer);
  const filled = { ...record };
  for (const field of CUSTOMER_SNAPSHOT_FIELDS) {
    if (isBlank(filled[field]) && !isBlank(fromMaster[field])) filled[field] = fromMaster[field];
  }
  return filled;
}

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

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('taxId, address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
    .eq('id', record.customerId)
    .maybeSingle();
  // fallback เติมช่องที่ว่างบนเอกสาร — โหลดไม่ได้ก็คืนของเดิม (เอกสารยังออกได้ แค่มีช่องว่าง)
  // แต่ต้อง log ไม่งั้นเอกสารขาดข้อมูลลูกค้าโดยไม่มีใครรู้ว่าเพราะ query พัง
  if (customerError) console.error('[snapshot] เติมข้อมูลลูกค้าบนเอกสารไม่สำเร็จ:', customerError.message);
  if (!customer) return record;

  const fromMaster = customerToSnapshot(customer);
  const filled = { ...record };
  for (const field of CUSTOMER_SNAPSHOT_FIELDS) {
    if (isBlank(filled[field]) && !isBlank(fromMaster[field])) filled[field] = fromMaster[field];
  }
  return filled;
}

// ── ชื่อลูกค้าบน "ร่างที่ยังไม่ยื่น" อ่านสดจากทะเบียน ────────────────────
//
// ⭐ ที่มา (2026-08-27): คนสร้างลูกค้าไว้ชื่อ 'บริษัท ก จำกัด (สำนักงานใหญ่)' → ออกใบ
// 11:26 → ตัดคำออกจากชื่อตอน 12:29 · ใบที่ออกไปแล้วยังถือชื่อเก่า ซึ่ง **ถูกต้อง**
// สำหรับใบที่ยื่น/ส่งไปแล้ว (หลักฐานการค้า) แต่ใบที่ยังเป็นร่างไม่เคยยื่นเลยก็ค้าง
// ชื่อเก่าไปด้วย ทั้งที่ยังไม่มีใครเห็นนอกจากคนทำ
//
// ⚠️ ด่านคือ `isEditableQuotation` **ตัวเดียวกับที่หน้าจอใช้ตัดสินว่าแก้ใบได้ไหม**
// (draft + ยังไม่ยื่น) — ห้ามเขียนชุดสถานะซ้ำที่นี่ ดูเหตุผลยาวที่ quotationWorkflow.js
// พอยื่นอนุมัติปุ๊บ ชื่อบนใบตรึงทันที ไม่ขยับตามทะเบียนอีกเลย
//
// ⚠️ **แสดงผลอย่างเดียว ไม่เขียนกลับ** — คอลัมน์ `customerName` บนใบยังเป็น snapshot
// เหมือนเดิม (quotations ประกาศเป็น 'frozen' ใน customerNameMirrors.js) · ค่าที่ตรึง
// จริงถูกเขียนตอนกดยื่นอนุมัติ (`draftCustomerNameStamp` ข้างล่าง · submit/route.js)
// ซึ่งเป็นจังหวะที่เนื้อใบกลายเป็นหลักฐาน
//
// 🐞 24/11/2026 QT-26110656-4: คอมเมนต์บรรทัดบนเขียนไว้ตั้งแต่ 27/08 แต่ route ยื่นอนุมัติ
// **ไม่เคยเขียนชื่อลงใบเลย** ⇒ แก้ชื่อลูกค้า → ออก Rev. (ลอกชื่อเก่าจากฉบับก่อน) → ร่างโชว์
// ชื่อใหม่ (แสดงผลตรงนี้) → กดยื่น → ด่านนี้ปิด ⇒ จอถอยไปโชว์คอลัมน์ที่ยังถือชื่อเก่า
// "ชื่อดีดกลับ" · ทางแก้: จอกับด่านยื่นถามคู่ชื่อจากฟังก์ชันเดียวกัน (`liveCustomerNameFields`)
// ⇒ ชื่อที่ร่างโชว์ = ชื่อที่ถูกตรึง เสมอ
import { isEditableQuotation } from '@/lib/sales/quotationWorkflow';
import { customerNameIn, CUSTOMER_NAME_SELECT } from '@/lib/master/customerName';

/* คู่ชื่อ (ไทย · อังกฤษ) ที่ใบควรถือตามทะเบียน ณ ตอนนี้ — ใช้สามที่: จอของร่าง (แสดงผล) ·
   ด่านยื่นอนุมัติ (ตรึงลงใบ) · ออก Rev. (ฉบับใหม่เริ่มจากทะเบียน เหมือนที่อยู่/เลขภาษี)
   ⚠️ ต้อง**คู่ภาษา**เสมอ — รีเฟรชแต่ไทย แล้วใบอังกฤษจะได้ชื่อไทยสดคู่กับชื่ออังกฤษที่ค้างจาก
   วันสร้างใบ (หรือว่างเปล่าสำหรับใบก่อน mig 0343) ทั้งที่คนเพิ่งกรอก nameEn ลงทะเบียนไป
   ทะเบียนว่าง (ทั้งภาษาหรือแค่อังกฤษ) = คงค่าเดิมของใบ ไม่ล้างทิ้ง */
export function liveCustomerNameFields(live, quote = {}) {
  const liveEn = String(live?.nameEn || '').trim();
  return {
    customerName: customerNameIn(live) || quote.customerName || null,
    customerNameEn: liveEn || quote.customerNameEn || null,
  };
}

/* ด่านยื่นอนุมัติ: คีย์ชื่อที่ต้องเขียนลงร่างก่อนลงนาม — `patch: null` = ใบถือชื่อตรงทะเบียนอยู่แล้ว
   (หรือไม่ใช่ร่างที่ยังไม่ยื่น / ไม่ผูกลูกค้า / หาลูกค้าไม่เจอ)
   ⚠️ อ่านทะเบียนไม่สำเร็จ = คืน `error` ให้ผู้เรียก**ปฏิเสธการยื่น** — ต่างจากตัวแสดงผลที่กลืน error:
   ยื่นต่อเงียบ ๆ คือการตรึงชื่อที่จอไม่ได้โชว์ ซึ่งคือบั๊กตัวนี้เอง */
export async function draftCustomerNameStamp(supabase, quote) {
  if (!quote?.customerId || !isEditableQuotation(quote)) return { patch: null, error: null };
  const { data, error } = await supabase
    .from('customers').select(CUSTOMER_NAME_SELECT).eq('id', quote.customerId).maybeSingle();
  if (error) return { patch: null, error };
  if (!data) return { patch: null, error: null };
  const next = liveCustomerNameFields(data, quote);
  const patch = {};
  for (const [key, value] of Object.entries(next)) {
    if ((quote[key] ?? null) !== value) patch[key] = value;
  }
  return { patch: Object.keys(patch).length ? patch : null, error: null };
}

export async function refreshCustomerNameForDisplay(supabase, quotes = []) {
  const targets = quotes.filter((q) => q?.customerId && isEditableQuotation(q));
  const ids = [...new Set(targets.map((q) => q.customerId))];
  if (!ids.length) return quotes;
  /* `.limit(ids.length)` = ขอบเขตจริงของคำสั่งนี้ ไม่ใช่เลขที่ตั้งให้ผ่านด่าน — `.in('id', …)`
     คืนได้มากสุดเท่าจำนวน id ที่ส่งไปอยู่แล้ว (1 ใบ = 1 id · รายการใบของดีล = จำนวนลูกค้า
     ที่ไม่ซ้ำ ซึ่งมักเป็น 1) · เขียนให้ชัดเพราะ check:rowcap อ่านจากคำสั่ง ไม่ได้รู้ว่า
     `in()` มีขอบเขตในตัว และ `customers` เป็นตารางที่โตได้ */
  const { data, error } = await supabase
    .from('customers').select(CUSTOMER_NAME_SELECT).in('id', ids).limit(ids.length);
  // เสริมการแสดงผลเท่านั้น — อย่าให้ GET ล้มเพราะ join นี้ (กติกาเดียวกับ refreshFgLinesForDisplay)
  if (error) return quotes;
  // ลูกค้าที่มีแต่ชื่ออังกฤษต้องได้ชื่อจริง ไม่ใช่ค่าว่างทับชื่อบนร่าง
  const byId = new Map((data || []).map((c) => [c.id, c]));
  for (const q of targets) {
    const live = byId.get(q.customerId);
    // แสดงผลอย่างเดียว ไม่เขียนกลับฐาน — ตัวตรึงจริงคือ draftCustomerNameStamp (ตัวตัดสินคู่ชื่อตัวเดียวกัน)
    if (live) Object.assign(q, liveCustomerNameFields(live, q));
  }
  return quotes;
}

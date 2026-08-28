// ── Tax: registration requirement / completeness service ──────────────
// Single source of truth สำหรับ "ทะเบียนพร้อมยื่นหรือยัง" (draft → pending_legal).
// ใช้ร่วมกันทั้ง submit-gate (PATCH /api/excise-registrations/[id]) และ
// GET /api/.../requirements เพื่อให้ checklist ที่ผู้ใช้เห็น == กฎที่ server บังคับ.
//
// กฎ (ยกมาจาก inline เดิมใน excise-registrations/[id]/route.js):
//   • เอกสาร required ของทะเบียน (ฉลาก/Artwork) ต้องแนบที่ "ทะเบียน"
//   • แผนที่บริษัท (address_map) ต้องมีที่ "ลูกค้า" เจ้าของ — เป็น master data
//     แนบครั้งเดียวที่ลูกค้า ไม่ทำซ้ำต่อทะเบียน
//
// คืน { ready, missing[], warnings[] } ตาม contract ของ BOUNDARY_MAP_PLAN:
//   missing  = เอกสารจำเป็นที่ยังขาด (บล็อกการยื่น) — { entity, docType, label }
//   warnings = คุณภาพข้อมูลเชิงแนะนำ (ไม่บล็อก) — { field, message }
//   ready    = missing.length === 0
import { listAttachments } from '@/lib/master/attachments';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { requiredDocKeys, attachmentTypeLabel } from '@/lib/master/attachmentTypes';

/**
 * ทะเบียนใบนี้ขาดราคาขายปลีกหรือไม่ — คืนรายการที่ขาด หรือ null เมื่อครบ
 * (แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์ได้ — ตัวหลักผูกกับ supabase/attachments)
 */
export function missingRetailPriceEntry(registration, product) {
  if (!registration?.productId) return null;
  // ทะเบียนที่ฝ่าย RA ยกเว้นภาษีไว้ไม่ต้องมีราคา — ภาษี 0 เพราะได้รับยกเว้นจริง
  if (registration.isExciseTaxable === false) return null;
  const retail = Number(product?.retailPriceIncVat);
  if (Number.isFinite(retail) && retail > 0) return null;
  return {
    entity: 'product',
    docType: 'retailPriceIncVat',
    label: `ราคาขายปลีก (รวม VAT) ของสินค้า${product?.fgCode ? ` ${product.fgCode}` : ''} — ฐานคิดภาษีสรรพสามิต`,
  };
}

/* ── กฎเดียวของ "ทะเบียนพร้อมยื่นหรือยัง" — ส่วนตัดสินล้วน ๆ ────────────────
   ตัวโหลดข้อมูลมีสองแบบ (รายใบ / เป็นชุด) แต่ **กฎต้องมีชุดเดียว** ไม่งั้นหน้าคิว
   กับด่านตอนกดยื่นจะตอบคนละอย่าง แล้วผู้ใช้เห็น "ครบ" บนคิวแต่กดยื่นไม่ผ่าน

   @param registrationDocTypes  Set ของ docType ที่แนบไว้ที่ **ทะเบียน**
   @param customerDocTypes      Set ของ docType ที่แนบไว้ที่ **ลูกค้า**
   @param customer              แถวลูกค้า (email, phone, contactPhone, taxId, branchCode)
                                · null = โหลดไม่เจอ ⇒ ข้ามด่าน identity (พฤติกรรมเดิม) */
export function registrationMissing({
  registration, product, registrationDocTypes, customerDocTypes, customer,
} = {}) {
  const reg = registration || {};
  const missing = [];
  const warnings = [];

  if (reg.productId && reg.isExciseTaxable !== false) {
    const entry = missingRetailPriceEntry(reg, product);
    if (entry) missing.push(entry);
  }

  const regPresent = registrationDocTypes || new Set();
  for (const k of requiredDocKeys('registration')) {
    if (!regPresent.has(k)) {
      missing.push({ entity: 'registration', docType: k, label: attachmentTypeLabel('registration', k) });
    }
  }

  if (!reg.customerId) {
    // ไม่มีลูกค้าเจ้าของ = ยื่นไม่ได้ (ปกติไม่ควรเกิด — reg สร้างพร้อม customerId).
    missing.push({ entity: 'registration', docType: 'customer', label: 'ลูกค้าเจ้าของทะเบียน' });
    return { ready: false, missing, warnings };
  }

  // แผนที่บริษัท (address_map) ระดับลูกค้า — shared master data.
  if (!(customerDocTypes || new Set()).has('address_map')) {
    missing.push({ entity: 'customer', docType: 'address_map', label: attachmentTypeLabel('customer', 'address_map') });
  }

  if (customer) {
    // ── 5.4 identity gate (BOUNDARY_MAP) ──
    // เลขประจำตัวผู้เสียภาษี + สาขา ระบุตัวผู้เสียภาษีในเอกสารสรรพสามิต — บังคับ
    // "เฉพาะตอนยื่นทะเบียน" (ไม่ใช่ตอนสร้างลูกค้า เผื่อบุคคลธรรมดา/ต่างชาติที่ยังไม่มี).
    // unique จริงคุมที่ DB ระดับ (taxId, branchCode) แล้ว (migration 0039);
    // ตรงนี้คือ completeness ก่อนยื่น (ขาด = บล็อก).
    if (!customer.taxId || !String(customer.taxId).trim()) {
      missing.push({ entity: 'customer', docType: 'taxId', label: 'เลขประจำตัวผู้เสียภาษีของลูกค้า' });
    }
    if (!customer.branchCode || !String(customer.branchCode).trim()) {
      missing.push({ entity: 'customer', docType: 'branchCode', label: 'รหัสสาขาของลูกค้า (เช่น 00000 = สำนักงานใหญ่)' });
    }

    // Soft warnings (ไม่บล็อก): ข้อมูลติดต่อช่วยให้ฝ่าย RA ตามลูกค้าได้.
    if (!customer.email) warnings.push({ field: 'customerEmail', message: 'ยังไม่มีอีเมลลูกค้า' });
    if (!customer.phone && !customer.contactPhone) warnings.push({ field: 'customerPhone', message: 'ยังไม่มีเบอร์โทรลูกค้า' });
  }

  return { ready: missing.length === 0, missing, warnings };
}

export async function registrationRequirements(supabase, regId) {
  // query พังต้องดัง — ไม่งั้นด่าน "แนบเอกสารครบไหม" จะตอบว่าไม่พบทะเบียน
  // แล้วผู้ใช้จะไล่หาว่าทะเบียนหายไปไหน ทั้งที่ปัญหาอยู่ที่ DB/schema
  const { data: reg, error: regError } = await supabase
    .from('excise_registrations')
    .select('id, customerId, productId, "isExciseTaxable"')
    .eq('id', regId).maybeSingle();
  if (regError) throw regError;
  if (!reg) return { ready: false, missing: [], warnings: [], notFound: true };

  /* ── ราคาขายปลีกของสินค้า — ฐานของภาษีทั้งก้อน ────────────────────────────
     🐞 **พบตอนตรวจระบบ 2026-08-16:** สินค้าในหมวดที่ต้องเสียภาษี 17 จาก 94 ตัว
     ไม่มี `retailPriceIncVat` ⇒ `exciseTax` = 0 ⇒ ถ้าขายแล้วยื่น จะ **ยื่นภาษีขาด
     โดยไม่มีอะไรฟ้อง** (คอมเมนต์ใน lib/master/categoryOf.js เตือนอาการนี้ไว้เองแล้ว)

     ⭐ **ด่านอยู่ตรงนี้ ไม่ใช่ตอนสร้าง/อนุมัติสินค้า** (มติผู้ใช้ 2026-08-16) —
     ราคาขายปลีกยังกรอกไม่ได้ตั้งแต่ตอนเปิดสินค้า มันมาทีหลัง · บังคับตอนนั้นเท่ากับ
     บล็อกงานด้วยข้อมูลที่ยังไม่มีอยู่จริง
     ⇒ จุดที่ถูกคือ **ตอนยื่นขึ้นทะเบียน** เพราะทะเบียนคือใบที่ประกาศราคาขายปลีก
     ต่อสรรพสามิต — ไม่มีราคา = ยื่นไม่ได้อยู่แล้วโดยธรรมชาติของเอกสาร
     และเมื่อทะเบียนผ่าน ราคาก็มีครบก่อนถึงขั้นขาย/ยื่นชำระเสมอ

     ⚠️ ทะเบียนที่ฝ่าย RA ยกเว้นภาษีไว้ (`isExciseTaxable === false`) ไม่ต้องมีราคา
     — ภาษีเป็น 0 เพราะได้รับยกเว้นจริง ไม่ใช่เพราะข้อมูลขาด */
  let product = null;
  if (reg.productId && reg.isExciseTaxable !== false) {
    const { data, error: productError } = await supabase
      .from('products').select('"fgCode", "retailPriceIncVat"').eq('id', reg.productId).maybeSingle();
    // query พังต้องดัง — เงียบแล้วด่านนี้หายไปทั้งข้อ (เหตุผลเดียวกับ identity gate)
    if (productError) throw productError;
    product = data;
  }

  const registrationDocTypes = new Set((await listAttachments('registration', regId)).map((a) => a.docType));
  if (!reg.customerId) {
    return registrationMissing({ registration: reg, product, registrationDocTypes });
  }

  const customerDocTypes = new Set((await listAttachments('customer', reg.customerId)).map((a) => a.docType));
  const { data: cust, error: custError } = await supabase
    .from('customers').select('email, phone, contactPhone, taxId, branchCode').eq('id', reg.customerId).maybeSingle();
  // query พังต้องดัง — ไม่งั้น `if (cust)` เป็นเท็จแล้ว **ข้ามด่าน identity ทั้งก้อน**
  // ปล่อยให้ยื่นทะเบียนได้ทั้งที่ยังไม่มีเลขผู้เสียภาษี/รหัสสาขา
  if (custError) throw custError;

  return registrationMissing({
    registration: reg, product, registrationDocTypes, customerDocTypes, customer: cust,
  });
}

/* ── ตัวโหลดเป็นชุด — สำหรับหน้าคิวที่ต้องรู้ความพร้อมของทุกใบพร้อมกัน ───────
 *
 * ⭐ ทำไมต้องมี: หน้าคิวเดิมไม่รู้เลยว่าใบไหนพร้อม/ขาดอะไร ต้องเปิดทีละใบถึงเห็น
 * ⇒ ฝ่าย RA เปิด 17 ใบเพื่อหาว่าใบไหนตรวจได้ · เรียก `registrationRequirements`
 * วนลูปแทนก็ได้คำตอบเดียวกัน แต่เป็น 4 query × จำนวนใบ (17 ใบ = 68 query)
 *
 * ⚠️ ใช้กฎเดียวกับตัวรายใบ (`registrationMissing`) เสมอ — คิวกับด่านตอนกดยื่น
 * ต้องตอบตรงกัน ไม่งั้นผู้ใช้เห็น "ครบ" บนคิวแล้วกดยื่นไม่ผ่าน
 *
 * ⚠️ ทุก query ที่นี่กรองด้วย `in.(...)` ของ id ที่ส่งเข้ามา ⇒ จำนวนแถวผูกกับจำนวน
 * ทะเบียนที่เรียก ไม่ใช่ขนาดตาราง (เพดาน 1,000 แถวจึงไม่แตะ — ดู check:rowcap)
 *
 * @returns Map<registrationId, { ready, missing[], warnings[] }>
 */
export async function registrationRequirementsBatch(supabase, registrations = []) {
  const out = new Map();
  const regs = (registrations || []).filter((r) => r?.id);
  if (!regs.length) return out;

  const productIds = [...new Set(regs.map((r) => r.productId).filter(Boolean))];
  const customerIds = [...new Set(regs.map((r) => r.customerId).filter(Boolean))];

  /* ⚠️ ทุก query จำกัดแถวชัดเจน — สองตัวแรกกรองด้วยรายการ id ที่รู้จำนวนแน่นอน
     (`.limit(ids.length)` = อ่านได้อย่างมากเท่าที่ขอ) · สองตัวหลังเป็นไฟล์แนบซึ่ง
     "หนึ่ง entity มีได้หลายไฟล์" จำนวนจึงไม่รู้ล่วงหน้า ⇒ ไล่ทีละหน้าด้วย
     `fetchAllResult` ไม่ใช่เดาเพดานเอง (เดาแล้วขาด = ด่านเอกสารบอกว่า "ขาด" ทั้งที่
     แนบครบ ซึ่งไปบล็อกการยื่นจริง) */
  const regIds = regs.map((r) => r.id);
  const [products, customers, regDocs, custDocs] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, "fgCode", "retailPriceIncVat"')
        .in('id', productIds).limit(productIds.length)
      : { data: [] },
    customerIds.length
      ? supabase.from('customers').select('id, email, phone, "contactPhone", "taxId", "branchCode"')
        .in('id', customerIds).limit(customerIds.length)
      : { data: [] },
    fetchAllResult(() => supabase.from('attachments').select('"entityId", "docType"')
      .eq('entityType', 'registration').in('entityId', regIds).order('id', { ascending: true })),
    customerIds.length
      ? fetchAllResult(() => supabase.from('attachments').select('"entityId", "docType"')
        .eq('entityType', 'customer').in('entityId', customerIds).order('id', { ascending: true }))
      : { data: [] },
  ]);
  // query พังต้องดัง — เหตุผลเดียวกับตัวรายใบ: เงียบแล้วด่านหายไปทั้งข้อ
  for (const res of [products, customers, regDocs, custDocs]) {
    if (res?.error) throw res.error;
  }

  const productOf = new Map((products.data || []).map((p) => [p.id, p]));
  const customerOf = new Map((customers.data || []).map((c) => [c.id, c]));
  const docsBy = (rows) => {
    const map = new Map();
    for (const row of rows || []) {
      if (!map.has(row.entityId)) map.set(row.entityId, new Set());
      map.get(row.entityId).add(row.docType);
    }
    return map;
  };
  const regDocsOf = docsBy(regDocs.data);
  const custDocsOf = docsBy(custDocs.data);

  for (const reg of regs) {
    out.set(reg.id, registrationMissing({
      registration: reg,
      product: productOf.get(reg.productId) || null,
      registrationDocTypes: regDocsOf.get(reg.id) || new Set(),
      customerDocTypes: custDocsOf.get(reg.customerId) || new Set(),
      customer: customerOf.get(reg.customerId) || null,
    }));
  }
  return out;
}

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
import { requiredDocKeys, attachmentTypeLabel } from '@/lib/master/attachmentTypes';

/**
 * ทะเบียนใบนี้ขาดราคาขายปลีกหรือไม่ — คืนรายการที่ขาด หรือ null เมื่อครบ
 * (แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์ได้ — ตัวหลักผูกกับ supabase/attachments)
 */
export function missingRetailPriceEntry(registration, product) {
  if (!registration?.productId) return null;
  // ทะเบียนที่ฝ่าย RAยกเว้นภาษีไว้ไม่ต้องมีราคา — ภาษี 0 เพราะได้รับยกเว้นจริง
  if (registration.isExciseTaxable === false) return null;
  const retail = Number(product?.retailPriceIncVat);
  if (Number.isFinite(retail) && retail > 0) return null;
  return {
    entity: 'product',
    docType: 'retailPriceIncVat',
    label: `ราคาขายปลีก (รวม VAT) ของสินค้า${product?.fgCode ? ` ${product.fgCode}` : ''} — ฐานคิดภาษีสรรพสามิต`,
  };
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

  const missing = [];
  const warnings = [];

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

     ⚠️ ทะเบียนที่ฝ่าย RAยกเว้นภาษีไว้ (`isExciseTaxable === false`) ไม่ต้องมีราคา
     — ภาษีเป็น 0 เพราะได้รับยกเว้นจริง ไม่ใช่เพราะข้อมูลขาด */
  if (reg.productId && reg.isExciseTaxable !== false) {
    const { data: product, error: productError } = await supabase
      .from('products').select('"fgCode", "retailPriceIncVat"').eq('id', reg.productId).maybeSingle();
    // query พังต้องดัง — เงียบแล้วด่านนี้หายไปทั้งข้อ (เหตุผลเดียวกับ identity gate ข้างล่าง)
    if (productError) throw productError;
    const entry = missingRetailPriceEntry(reg, product);
    if (entry) missing.push(entry);
  }

  // เอกสาร required ระดับทะเบียน (ฉลาก/Artwork).
  const regPresent = new Set((await listAttachments('registration', regId)).map((a) => a.docType));
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
  const custPresent = new Set((await listAttachments('customer', reg.customerId)).map((a) => a.docType));
  if (!custPresent.has('address_map')) {
    missing.push({ entity: 'customer', docType: 'address_map', label: attachmentTypeLabel('customer', 'address_map') });
  }

  const { data: cust, error: custError } = await supabase
    .from('customers').select('email, phone, contactPhone, taxId, branchCode').eq('id', reg.customerId).maybeSingle();
  // query พังต้องดัง — ไม่งั้น `if (cust)` เป็นเท็จแล้ว **ข้ามด่าน identity ทั้งก้อน**
  // ปล่อยให้ยื่นทะเบียนได้ทั้งที่ยังไม่มีเลขผู้เสียภาษี/รหัสสาขา
  if (custError) throw custError;
  if (cust) {
    // ── 5.4 identity gate (BOUNDARY_MAP) ──
    // เลขประจำตัวผู้เสียภาษี + สาขา ระบุตัวผู้เสียภาษีในเอกสารสรรพสามิต — บังคับ
    // "เฉพาะตอนยื่นทะเบียน" (ไม่ใช่ตอนสร้างลูกค้า เผื่อบุคคลธรรมดา/ต่างชาติที่ยังไม่มี).
    // unique จริงคุมที่ DB ระดับ (taxId, branchCode) แล้ว (migration 0039);
    // ตรงนี้คือ completeness ก่อนยื่น (ขาด = บล็อก).
    if (!cust.taxId || !String(cust.taxId).trim()) {
      missing.push({ entity: 'customer', docType: 'taxId', label: 'เลขประจำตัวผู้เสียภาษีของลูกค้า' });
    }
    if (!cust.branchCode || !String(cust.branchCode).trim()) {
      missing.push({ entity: 'customer', docType: 'branchCode', label: 'รหัสสาขาของลูกค้า (เช่น 00000 = สำนักงานใหญ่)' });
    }

    // Soft warnings (ไม่บล็อก): ข้อมูลติดต่อช่วยให้ฝ่าย RAตามลูกค้าได้.
    if (!cust.email) warnings.push({ field: 'customerEmail', message: 'ยังไม่มีอีเมลลูกค้า' });
    if (!cust.phone && !cust.contactPhone) warnings.push({ field: 'customerPhone', message: 'ยังไม่มีเบอร์โทรลูกค้า' });
  }

  return { ready: missing.length === 0, missing, warnings };
}

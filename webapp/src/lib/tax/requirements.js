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

export async function registrationRequirements(supabase, regId) {
  const { data: reg } = await supabase
    .from('excise_registrations').select('id, customerId').eq('id', regId).maybeSingle();
  if (!reg) return { ready: false, missing: [], warnings: [], notFound: true };

  const missing = [];
  const warnings = [];

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

  // Soft warnings (ไม่บล็อก): ข้อมูลติดต่อช่วยให้ฝ่ายกฎหมายตามลูกค้าได้.
  const { data: cust } = await supabase
    .from('customers').select('email, phone, contactPhone').eq('id', reg.customerId).maybeSingle();
  if (cust) {
    if (!cust.email) warnings.push({ field: 'customerEmail', message: 'ยังไม่มีอีเมลลูกค้า' });
    if (!cust.phone && !cust.contactPhone) warnings.push({ field: 'customerPhone', message: 'ยังไม่มีเบอร์โทรลูกค้า' });
  }

  return { ready: missing.length === 0, missing, warnings };
}

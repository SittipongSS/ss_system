// ── ด่าน "เอกสารบังคับ" ของ master data (ฝั่ง server) ──────────────────
// เดิมการ์ด `required: true` ใน attachmentTypes เป็น **ป้ายแสดงผลล้วน** — ไม่มีด่านไหน
// บังคับจริงนอกจากทะเบียนสรรพสามิต (lib/tax/requirements) ผลบน prod คือ
// ลูกค้า 94 ราย มีเอกสาร 2 ราย · สินค้า 120 รายการ มี Artwork 0 รายการ แต่ทุกใบ
// "อนุมัติแล้ว" ครบ · ไฟล์นี้คือด่านที่ทำให้ป้ายนั้นมีผลจริงตอนกดอนุมัติ (มติ 2026-07-31)
//
// ตัวช่วยที่ไม่มี I/O (ชุดการ์ด/ข้อความ/ตรวจเหตุผลยกเว้น) อยู่ที่ attachmentTypes
// เพื่อให้เทสต์และฝั่ง client ใช้ได้โดยไม่ต้องลาก supabase เข้ามา
import 'server-only';
import { listAttachments } from '@/lib/master/attachments';
import { docTypesFor, requiredDocKeys } from '@/lib/master/attachmentTypes';

// เอกสารบังคับที่ยังไม่ได้แนบ — คืน [{ key, label }] (ว่าง = ครบ)
export async function missingRequiredDocs(entityType, entityId, record) {
  const docTypes = docTypesFor(entityType, record);
  const required = requiredDocKeys(entityType, docTypes);
  if (!required.length) return [];

  const attached = new Set((await listAttachments(entityType, entityId)).map((a) => a.docType));
  return required
    .filter((key) => !attached.has(key))
    .map((key) => ({ key, label: docTypes.find((t) => t.key === key)?.label || key }));
}

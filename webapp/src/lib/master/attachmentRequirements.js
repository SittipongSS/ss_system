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
import { docTypesFor, requiredDocKeys, unsatisfiedRequiredDocs } from '@/lib/master/attachmentTypes';
import { businessDate } from '@/lib/businessDate';

// เอกสารบังคับที่ยังใช้ไม่ได้ — คืน [{ key, label, reason, expiresAt }] (ว่าง = ครบ)
//   reason 'absent'  = ยังไม่ได้แนบเลย
//   reason 'expired' = แนบแล้วแต่พ้นอายุที่กำหนด (เช่น หนังสือรับรองเกิน 6 เดือน)
//
// ⭐ เอกสารหมดอายุต้องนับเป็น "ไม่ครบ" ไม่งั้นด่านนี้ไร้ความหมายกับเอกสารที่มีอายุ:
// หนังสือรับรองปีที่แล้วก็ติ๊กเขียวผ่านฉลุย ทั้งที่ยื่นกับใครไม่ได้แล้ว · ทางยกเว้น
// (เขียนเหตุผล) ยังใช้ได้เหมือนเดิม จึงไม่มีใครติดตายเพราะกฎนี้
//
// วันที่ที่ยังไม่กรอก (unknown) **ไม่นับว่าหมดอายุ** — ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้
// ต้องไม่กลายเป็นของเสียข้ามคืน ฝั่งจอขึ้นป้ายเตือนให้ไปเติมวันที่แทน
export async function missingRequiredDocs(entityType, entityId, record, { today } = {}) {
  const docTypes = docTypesFor(entityType, record);
  const required = requiredDocKeys(entityType, docTypes);
  if (!required.length) return [];

  const attachments = await listAttachments(entityType, entityId);
  // กติกาการตัดสินอยู่ที่ attachmentTypes (ไม่มี I/O) — ไฟล์นี้เหลือหน้าที่ไปเอาข้อมูล
  return unsatisfiedRequiredDocs(entityType, docTypes, attachments, today || businessDate());
}

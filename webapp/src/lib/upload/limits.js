// เพดานขนาดไฟล์ที่ **server** บังคับ — ค่ากลางจาก attachmentTypes โดยเปิดให้ env
// override ได้ (ตั้ง SUPABASE_MAX_UPLOAD_MB บน Vercel = เปลี่ยนได้ไม่ต้อง deploy)
// ⚠️ ต้องเป็นไฟล์ server-only: ค่า env ตัวนี้ไม่มีคำนำหน้า NEXT_PUBLIC ⇒ ฝั่ง client
// เห็นเป็น undefined แล้วจะได้เพดานคนละตัวกับที่ server บังคับ
import { MAX_UPLOAD_BYTES } from '@/lib/master/attachmentTypes';

export const MAX_BYTES = Number(process.env.SUPABASE_MAX_UPLOAD_MB) > 0
  ? Number(process.env.SUPABASE_MAX_UPLOAD_MB) * 1024 * 1024
  : MAX_UPLOAD_BYTES;

export const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

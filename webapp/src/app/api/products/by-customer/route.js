import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// GET /api/master/products/by-customer?customerId=... — FG ทั้งหมดของลูกค้ารายนั้น
// สำหรับด่านเตือน "สินค้าซ้ำ" ในฟอร์ม (ลูกค้า + ชื่อ + ขนาด — ดู lib/master/productDuplicate)
//
// ⚠️ **ทุกสถานะ ทุกทีม ไม่ตัดตัวที่เลิกใช้** — ต่างจาก GET /api/products ปกติที่คืนเฉพาะ
// ที่อนุมัติแล้วและยังใช้งานอยู่ · ตัวที่ยังรออนุมัติหรือเพิ่งเลิกใช้ ก็ยัง "ซ้ำ" อยู่ดี
// สำหรับคนที่กำลังจะเพิ่มตัวเดิมเข้าไปอีกใบ (ฟอร์มบอกสถานะไปด้วยเพื่อให้ตัดสินใจได้)
//
// ⚠️ ไม่ scope ตามทีมด้วยเหตุผลเดียวกับ ?customerId= ของ route หลัก: FG ของลูกค้าราย
// เดียวถูกสร้างโดยหลายทีมได้ กรองด้วยทีมผู้สร้างแล้วด่านซ้ำจะมองไม่เห็นครึ่งหนึ่ง
//
// ไม่คืนราคา/ต้นทุน — ด่านนี้ต้องการแค่ชื่อกับขนาดพอ (ราคาเป็นข้อมูลลับที่ redact
// รายบทบาทอยู่ใน route หลัก จึงไม่เอามาไว้ในเส้นที่ไม่ต้องใช้)
const FIELDS = 'id, fgCode, customerId, productDescription, productDescriptionEn, volume, volumeUnit, isActive, approvalStatus';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const customerId = new URL(request.url).searchParams.get('customerId');
  if (!customerId) return Response.json([]);

  const { data, error } = await supabase
    .from('products').select(FIELDS).eq('customerId', customerId)
    .order('createdAt', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

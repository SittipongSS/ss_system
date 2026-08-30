import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isCompleteTaxId, taxIdMatchFilter, taxIdMatches } from '@/lib/master/customerTaxId';

export const dynamic = 'force-dynamic';

// GET /api/master/customers/by-tax-id?taxId=... — ลูกค้าที่ใช้เลขผู้เสียภาษีนี้อยู่แล้ว
//
// ฟอร์มเรียกตอนกรอกเลขครบ 13 หลัก เพื่อเตือน**ก่อน**กรอกทั้งใบเสร็จแล้วค่อยโดนตีกลับ
//
// ⚠️ **ไม่ใช้ลิสต์ลูกค้าที่หน้าโหลดไว้แล้ว** ทั้งที่หน้ารวมมีครบ: โมดัลแก้ (หน้า [id])
// มีแค่ลูกค้ารายเดียว และลิสต์ที่โหลดตอนเปิดหน้าไม่เห็นรายที่เพิ่งถูกสร้างจากอีกจอ
// ⇒ ถามสดทุกครั้ง ฟอร์มทั้งสองทางจึงใช้เส้นเดียวกัน
//
// ⚠️ คืนเฉพาะช่องที่ใช้บอก "ซ้ำกับใคร" — ไม่ใช่ทั้งแถว: เลขผู้เสียภาษีเป็นตัวค้นที่
// ใครก็เดาได้ ถ้าคืนทั้งแถวจะกลายเป็นทางดูดข้อมูลลูกค้าทีละรายผ่านการเดาเลข
// (ทุกคนที่ล็อกอินอ่าน /api/customers ได้อยู่แล้ว แต่ตัวนี้ไม่ควรเปิดกว้างกว่านั้น)
const FIELDS = 'id, arCode, name, taxId, branchCode, isActive, approvalStatus';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const taxId = new URL(request.url).searchParams.get('taxId') || '';
  // เลขไม่ครบ = ยังไม่ถามฐานข้อมูล (คนกำลังพิมพ์อยู่) — คืนว่างไม่ใช่ error
  if (!isCompleteTaxId(taxId)) return Response.json([]);

  // ⚠️ ดึงหลวมแล้วกรองด้วยคีย์ — ในฐานมีเลขเดียวกันที่เก็บคนละรูป (มีขีด/ศูนย์นำหน้าหาย)
  // ซึ่ง `.eq` มองไม่เห็น · กรองซ้ำที่นี่ ฟอร์มจึงได้เฉพาะรายที่ซ้ำจริง
  const { data, error } = await supabase.from('customers').select(FIELDS).or(taxIdMatchFilter(taxId));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(taxIdMatches(data, { taxId }));
}

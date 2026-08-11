import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { FG_SCOPE, peekMasterNumber } from '@/lib/master/masterCodes';

export const dynamic = 'force-dynamic';

// GET /api/master/products/next-code — "เลขรันถัดไป" ของรหัสสินค้าอัตโนมัติ (mig 0230)
//
// คืนเฉพาะ **เลขรัน** ไม่ประกอบรหัสให้ เพราะอีกสองท่อน (รหัสลูกค้า · หมวดสินค้า) เป็น
// คำตอบที่เปลี่ยนไปมาในฟอร์มระหว่างกรอก — ฟอร์มจึงประกอบเองด้วย composeFgCode ทุกครั้ง
// ที่คำตอบเปลี่ยน ไม่ต้องยิง API ซ้ำ (เลขรันไม่เกี่ยวกับลูกค้าหรือหมวด: นับรวมทั้งระบบ)
//
// ⚠️ พรีวิวเท่านั้น ไม่จองเลข — เลขจริงจองตอน POST (RPC atomic) ดูเหตุผลเต็มที่
// customers/next-code
export async function GET() {
  const supabase = getSupabaseAdmin();
  try {
    const number = await peekMasterNumber(supabase, FG_SCOPE);
    return Response.json({ number });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { AR_SCOPE, formatArCode, peekMasterNumber } from '@/lib/master/masterCodes';

export const dynamic = 'force-dynamic';

// GET /api/master/customers/next-code — "เลขถัดไป" ของรหัสลูกค้าอัตโนมัติ (mig 0230)
//
// ⚠️ **พรีวิวเท่านั้น ไม่จองเลข** — โมดัลเพิ่มลูกค้าเรียกตัวนี้เพื่อโชว์บนแถบรหัสว่ากำลัง
// จะได้เลขอะไร · เลขจริงจองตอน POST (RPC atomic) ถ้ามีคนบันทึกก่อนเลขที่ได้จะขยับ
// ซึ่งเป็นเรื่องปกติและฟอร์มเขียนกำกับไว้แล้ว — ห้ามเอาเลขจากตัวนี้ไป insert ตรง ๆ
//
// ⚠️ path ต้องอยู่ใต้ /api/customers ที่ proxy เปิดให้อ่านอยู่แล้ว (OPEN_READ_APIS)
// ถ้าย้ายไปเป็น namespace ของตัวเอง เช่น /api/codes จะโดน default-deny เงียบ ๆ
// ⇒ ฟอร์มของทุก role ที่ไม่ใช่แอดมินจะโชว์ "—" ตลอดโดยไม่มี error ให้เห็น
export async function GET() {
  const supabase = getSupabaseAdmin();
  try {
    const number = await peekMasterNumber(supabase, AR_SCOPE);
    return Response.json({ number, code: formatArCode(number) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

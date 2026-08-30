// ── GET /api/products/export — ทะเบียนสินค้าเป็นไฟล์ Excel ───────────────────
//
// 🪤 **ต้องเป็น GET เท่านั้น** — proxy ตัดสินสิทธิ์เขียนจาก method+path และกฎของ
//    `/api/products` คือ "POST/PATCH ต้องมี products:edit" ⇒ ทำเป็น POST เมื่อไร
//    **ฝ่ายบัญชี (FN) กดโหลดไม่ได้ทันที** โดนตัดที่ proxy ก่อนถึง handler ด้วยซ้ำ
//    (อาการซ้ำรอยปุ่มบัญชีบนใบสั่งขาย — ดูคอมเมนต์ยาวใน proxy.js)
//
// แถวที่ได้ = **เท่าที่ตาเห็นบนจอ** (มติผู้ใช้ 2026-08-28) จึงรับตัวกรองชุดเดียวกับ
// หน้ารายการมาทาง query แล้วกรองด้วย `filterProducts` ตัวเดียวกับที่จอใช้
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canSeeProductCostUser } from '@/lib/permissions';
import { filterProducts } from '@/lib/master/productFilter';
import { buildProductExportBuffer, productExportFilename } from '@/lib/master/productWorkbook';
import { GET as listProducts } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const csv = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function GET(request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);

  // แหล่งแถว = handler เดิมของลิสต์ (manage=1 เห็นทุกสถานะ) — เรียกตรง ๆ ไม่ผ่าน HTTP
  // ⭐ ได้ของแถมครบชุดโดยไม่ต้องเขียนซ้ำ: ไล่หน้าทะลุเพดาน 1,000 แถวของ PostgREST ·
  //    แนบ registrationStatus ให้เฉพาะคนที่เห็นระบบภาษี · redactProductMargin
  //    ⇒ ถ้าคนนี้ไม่มีสิทธิ์เห็นต้นทุน `costPrice` ไม่ถูกส่งมาตั้งแต่ต้นทางแล้ว
  const listRes = await listProducts(new Request(new URL('/api/products?manage=1', url.origin)));
  if (!listRes.ok) return listRes;
  const products = await listRes.json();

  const supabase = getSupabaseAdmin();
  // ทะเบียนหมวด — ตัวกรอง "ขึ้นทะเบียน" กับการค้นชื่อหมวดใช้ตัวนี้ ขาดไปแล้วผลเพี้ยนเงียบ ๆ
  const { data: productTypes, error } = await supabase
    .from('product_types')
    .select('mainCategoryCode, mainCategoryName, typeCode, nameTh, nameEn, isExcise, requiresFdaNotice');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = filterProducts(products, {
    search: url.searchParams.get('q') || '',
    statuses: csv(url.searchParams.get('status')),
    registrations: csv(url.searchParams.get('reg')),
    showInactive: url.searchParams.get('inactive') === '1',
    // ⭐ "ขาดราคาขายปลีก" ย้ายมาจากแท็บของ /tax/reports (มติผู้ใช้ 2026-08-29)
    // — ต้องรับที่นี่ด้วย ไม่งั้นไฟล์กับตารางเดินหนีกันทันทีที่ผู้ใช้ติ๊กตัวกรองนี้
    missingRetailPrice: url.searchParams.get('missingPrice') === '1',
    productTypes: productTypes || [],
  }).sort((a, b) => String(a.fgCode || '').localeCompare(String(b.fgCode || ''), 'th'));

  try {
    const now = new Date();
    const buffer = await buildProductExportBuffer(rows, {
      includeCost: canSeeProductCostUser(user),
      now,
    });
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${productExportFilename(now)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[product-export]', err);
    return Response.json({ error: 'ส่งออกข้อมูลสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}

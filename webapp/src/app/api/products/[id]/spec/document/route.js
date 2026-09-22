/* ── ตัวอย่างกระดาษ FM-SA-04 จากหน้าสเปคของสินค้า — HTML ไม่ใช่ PDF (mig 0370) ─────────
 *
 * GET /api/products/[id]/spec/document
 *
 * ⭐ มติเจ้าของ 21/09/2569: สเปคในฐานไม่มีเลขที่และไม่มี Rev · เลขที่/Rev/ด่านอนุมัติเป็นของ
 *   **เอกสารที่ออกจากบรรทัด SO** ⇒ ที่นี่พิมพ์ได้แค่ **ตัวอย่าง** จากสเปคสด
 *   (ลายน้ำ "ตัวอย่าง" · ช่อง "เลขที่" เป็นขีด · ไม่มีลายเซ็น ไม่มีเจ้าของดีล · ใบไทยเสมอ)
 *   กระดาษของเอกสารจริงอยู่ที่ `/api/sales-planning/spec-documents/[id]/document`
 *   🪤 `?issue=` ของโมเดลเดิม (0364) ไม่มีแล้ว — ส่งมาก็ได้ตัวอย่างเหมือนเดิม
 *
 * ⚠️ **ด่านเดียวกับหน้าสินค้า** — ใครเห็นสินค้าชิ้นนี้ได้ ก็พิมพ์ตัวอย่างได้ · สินค้านอกหมวด
 *    01/02 ไม่มีใบสเปค (`productSpecScopeReason`)
 * 🐞 เดิมอ่านบริษัทจากตาราง `company_profile` ที่ไม่มีอยู่จริง (error ถูกทิ้ง ⇒ ตกค่าสำรองเงียบ ๆ
 *    ทุกครั้ง) · ตอนนี้ใช้ `getPublishedCompanyProfile` ตัวเดียวกับ QT/SO/สัญญา
 * ⚠️ เปิดด้วย `window.open` ⇒ ล้มเมื่อไรต้องได้หน้าภาษาไทย ไม่ใช่ JSON/500 ดิบเต็มแท็บ
 */
import { withUser } from '@/lib/http';
import { canViewRecord } from '@/lib/permissions';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import {
  renderProductSpecSample, specPaperErrorResponse, specPaperResponse,
} from '@/lib/sales/productSpecFreeze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  try {
    if (!user) return specPaperErrorResponse(req, 'unauthorized', 401);
    const { id } = await ctx.params;

    const { data: product, error } = await supabase
      .from('products')
      .select('id, fgCode, categoryCode, team, ownerId')
      .eq('id', id)
      .maybeSingle();
    if (error) return specPaperErrorResponse(req, `อ่านสินค้าไม่สำเร็จ: ${error.message}`, 500);
    // ไม่พบ = 404 เหมือนสินค้าที่มองไม่เห็น (ไม่บอกว่ามีอยู่)
    if (!product || !canViewRecord(user, 'products', product)) {
      return specPaperErrorResponse(req, 'ไม่พบสินค้าชิ้นนี้', 404);
    }
    const scopeReason = productSpecScopeReason(product);
    if (scopeReason) return specPaperErrorResponse(req, scopeReason, 400);

    const paper = await renderProductSpecSample(supabase, { productId: id });
    if (paper.error) return specPaperErrorResponse(req, paper.error, paper.status || 500);
    return specPaperResponse(paper.html);
  } catch (error) {
    // 🪤 ตัวเรนเดอร์/ข้อมูลบริษัท throw ได้ — ต้องไม่หลุดเป็น 500 ดิบ
    console.error('[products/spec/document] เปิดตัวอย่างไม่สำเร็จ', error);
    return specPaperErrorResponse(req, `เปิดตัวอย่างใบสเปคไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'}`, 500);
  }
});

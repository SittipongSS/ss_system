/* ── กระดาษ FM-SA-04 ของเอกสารหนึ่งใบ — HTML ไม่ใช่ PDF (เหมือน QT/SO) (mig 0370) ─────
 *
 * GET /api/sales-planning/spec-documents/[id]/document?rev=N
 *   ไม่ส่ง `rev` = ฉบับที่อนุมัติอยู่ · ยังไม่เคยอนุมัติ = Rev ล่าสุด
 *
 * ⭐ มติเจ้าของ 21/09/2569 (docs/fm-sa-04-document-model.md §กระดาษ)
 *   · approved / superseded ⇒ `frozenHtml` ที่ตรึงตอน AE Sup อนุมัติ (ไม่เรนเดอร์ใหม่)
 *     ลายน้ำ "ถูกแทนด้วย Rev.XX" / "ยกเลิก" ประทับทับเท่านั้น เนื้อที่ตรึงไม่ถูกแตะ
 *   · pending_* / rejected ⇒ ภาพนิ่งที่ถ่ายตอนยื่น + "ฉบับร่าง"
 *   · draft ⇒ สเปค + SO ปัจจุบัน (สด) + "ฉบับร่าง"
 *   ตัวเลือกแหล่ง/ลายน้ำอยู่ที่ `renderSpecDocumentPaper` ที่เดียว — ที่นี่ตรวจสิทธิ์แล้วตอบ
 *
 * ⚠️ **ด่านเดียวกับหน้าเอกสาร** (`GET /api/sales-planning/spec-documents/[id]`) — ใครเปิดหน้า
 *    เอกสารได้ก็พิมพ์ได้ · ด่านที่สองที่ไม่ตรงกันคือรูที่คนนอกขอบเขตอ่านเอกสารผ่านทางพิมพ์
 *    (บทเรียนเดียวกับ PDR) · ขอบเขตมาจาก SO ที่ผูกอยู่ (`loadScoped` โหมด view) · SO ถูกลบถาวร
 *    (FK SET NULL) = เปิดเฉพาะฝ่ายขายที่แก้สเปคได้ ตามเราต์หน้าเอกสาร
 * ⚠️ เปิดด้วย `window.open` ⇒ ล้มเมื่อไรต้องได้หน้าภาษาไทย ไม่ใช่ JSON/500 ดิบเต็มแท็บ
 *    (รวมตอนอ่านรูปประกอบไม่ขึ้น — ของเดิมตอบ 500 ดิบเมื่อไฟล์แนบอ่านพลาด)
 */
import { withUser } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canEditProductSpec } from '@/lib/sales/productSpecWorkflow';
import { loadSpecDocument } from '@/lib/sales/productSpecStore';
import {
  pickDocumentRevision, renderSpecDocumentPaper, specPaperErrorResponse, specPaperResponse,
  specPaperScopedErrorResponse,
} from '@/lib/sales/productSpecFreeze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  try {
    if (!user) return specPaperErrorResponse(req, 'unauthorized', 401);
    const { id } = await ctx.params;

    const loaded = await loadSpecDocument(supabase, id);
    if (loaded.error) return specPaperErrorResponse(req, loaded.error, loaded.status || 500);

    if (loaded.document.salesOrderId) {
      const scoped = await loadScoped(supabase, 'sales_orders', loaded.document.salesOrderId, user, 'view');
      if (scoped.response) return specPaperScopedErrorResponse(req, scoped.response);
    } else if (!canEditProductSpec(user.role)) {
      return specPaperErrorResponse(req, 'forbidden', 403);
    }

    const picked = pickDocumentRevision(loaded, new URL(req.url).searchParams.get('rev'));
    if (picked.error) return specPaperErrorResponse(req, picked.error, picked.status);

    const paper = await renderSpecDocumentPaper(supabase, { loaded, revision: picked.revision });
    if (paper.error) return specPaperErrorResponse(req, paper.error, paper.status || 500);
    return specPaperResponse(paper.html);
  } catch (error) {
    // 🪤 ตัวเรนเดอร์/ข้อมูลบริษัท throw ได้ (ไม่ใช่ supabase ที่คืน error เสมอ) — ต้องไม่หลุดเป็น 500 ดิบ
    console.error('[spec-documents/document] เปิดกระดาษไม่สำเร็จ', error);
    return specPaperErrorResponse(req, `เปิดเอกสารไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'}`, 500);
  }
});

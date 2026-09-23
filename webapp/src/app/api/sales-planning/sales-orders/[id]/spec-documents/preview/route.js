/* ── กระดาษร่าง FM-SA-04 ของเอกสารที่ยังไม่บันทึก — HTML ไม่ใช่ PDF (เหมือน QT/SO) ─────────────
 *
 * GET /api/sales-planning/sales-orders/[id]/spec-documents/preview?line=<salesOrderLineId>
 *
 * ⭐ **มติเจ้าของ 23/09/2569** "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก" — ปุ่ม "ดูตัวอย่างกระดาษ" ของหน้า
 *   `/sales-planning/spec-documents/new` · กระดาษประกอบสดจากสเปคปัจจุบัน + SO/บรรทัดนี้ + เจ้าของดีล
 *   (`renderSpecDocumentDraftPreview` · ตัวสร้างภาพนิ่งเดียวกับร่างของเอกสารจริง) · ลายน้ำ "ฉบับร่าง" ตามภาษาของ SO ·
 *   ช่อง "เลขที่" เป็นขีด (ยังไม่มีเลข)
 * 🔴 **เส้นนี้ห้ามเขียนอะไรเลย** — ไม่ออกเลข ไม่สร้างเอกสาร ไม่ตรึงกระดาษ (เทสต์ซอร์สล็อกไว้)
 * ⚠️ **แคบเท่าปุ่มที่พามา: AC / admin เท่านั้น** (`canIssueProductSpecDocument`) — ต่างจากกระดาษของเอกสาร *ที่มีแล้ว*
 *    (`spec-documents/[id]/document`) ซึ่งเปิดกว้างเท่าคนที่เห็นใบสั่งขาย · 🐞 ผลตรวจสด 23/09: role ที่หน้าใหม่บอกว่า
 *    "ไม่มีสิทธิ์ออกเอกสารนี้" (senior_ae · rd) ยิง URL นี้ตรง ๆ แล้วได้กระดาษเต็มใบ ⇒ จอปิดประตูแต่หน้าต่างเปิดอยู่
 *    กระดาษของเอกสารที่มีแล้วยังกว้างได้เพราะมันมีอยู่ก็ต่อเมื่อ AC ตัดสินใจออกไปแล้ว · ของที่ยังไม่มีใครตัดสินใจออก
 *    ไม่ควรประกอบให้คนที่ออกไม่ได้ดู (มติ 23/09 · docs/fm-sa-04-document-model.md §จอ)
 * ⚠️ ขอบเขตรายแถวยังเป็นโหมด view ของ `loadScoped` — AC ที่ไม่ได้ถือใบนี้ยังถูกกันเหมือนเดิม · ใบย้อนหลังถูกกันด้วย
 *    ตัวโหลดตัวเดียวกับการ์ด (`loadSpecDocOrder`) · บรรทัดนอกหมวด / ไม่ผูกสินค้า / สินค้ายังไม่มีสเปค = หน้าแจ้งเหตุ
 *    ไม่ใช่กระดาษเปล่า
 * ⚠️ เปิดเป็นลิงก์แท็บใหม่ ⇒ ล้มเมื่อไรต้องได้หน้าภาษาไทย ไม่ใช่ JSON/500 ดิบเต็มแท็บ (`specPaperErrorResponse`)
 */
import { withUser } from '@/lib/http';
import { canIssueProductSpecDocument } from '@/lib/sales/productSpecDocWorkflow';
import { loadSpecDocOrder, specDocLineScopeReason } from '@/lib/sales/productSpecDocOrder';
import { loadDealOwner } from '@/lib/sales/productSpecStore';
import {
  renderSpecDocumentDraftPreview, specPaperErrorResponse, specPaperResponse, specPaperScopedErrorResponse,
} from '@/lib/sales/productSpecFreeze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  try {
    if (!user) return specPaperErrorResponse(req, 'unauthorized', 401);
    /* ด่านคนก่อนแตะฐาน — เท่ากับปุ่ม "ดูตัวอย่างกระดาษ" ที่หน้าออกเอกสาร (ดูหัวไฟล์)
       ⚠️ ข้อความเดียวกับที่หน้าใหม่บอก ⇒ คนที่ยิง URL ตรงได้คำตอบเดียวกับที่จอบอก ไม่ใช่ "forbidden" ดิบ */
    if (!canIssueProductSpecDocument(user.role)) {
      return specPaperErrorResponse(req, 'ออกเอกสาร FM-SA-04 ได้เฉพาะ AC — กระดาษร่างของเอกสารที่ยังไม่บันทึกจึงเปิดได้เฉพาะคนที่ออกได้', 403);
    }
    const { id } = await ctx.params;
    const lineId = String(new URL(req.url).searchParams.get('line') || '').trim();
    if (!lineId) return specPaperErrorResponse(req, 'ไม่ได้ระบุบรรทัดสินค้าของใบสั่งขาย', 400);

    const loaded = await loadSpecDocOrder(supabase, id, user, 'view');
    if (loaded.response) return specPaperScopedErrorResponse(req, loaded.response);
    if (loaded.error) return specPaperErrorResponse(req, `อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${loaded.error}`, 500);
    if (loaded.blocked) return specPaperErrorResponse(req, loaded.blocked, 400);
    const { order } = loaded;
    const line = order.lines.find((row) => row.id === lineId);
    if (!line) return specPaperErrorResponse(req, 'ไม่พบบรรทัดสินค้านี้ในใบสั่งขาย', 404);
    const scopeReason = specDocLineScopeReason(line);
    if (scopeReason) return specPaperErrorResponse(req, scopeReason, 400);

    // ผู้ติดต่อฝ่ายขายบนกระดาษ = AE เจ้าของดีล (ไม่ใช่คนที่เปิดดู) — ตัวอ่านเดียวกับร่างของเอกสารจริง
    const owner = await loadDealOwner(supabase, order);
    if (owner.error) return specPaperErrorResponse(req, `อ่าน AE เจ้าของดีลไม่สำเร็จ: ${owner.error}`, 500);

    const paper = await renderSpecDocumentDraftPreview(supabase, { order, line, dealOwner: owner.dealOwner });
    if (paper.error) return specPaperErrorResponse(req, paper.error, paper.status || 500);
    return specPaperResponse(paper.html);
  } catch (error) {
    // 🪤 ตัวเรนเดอร์/ข้อมูลบริษัท throw ได้ (ไม่ใช่ supabase ที่คืน error เสมอ) — ต้องไม่หลุดเป็น 500 ดิบ
    console.error('[spec-documents/preview] เปิดกระดาษร่างไม่สำเร็จ', error);
    return specPaperErrorResponse(req, `เปิดกระดาษร่างไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'}`, 500);
  }
});

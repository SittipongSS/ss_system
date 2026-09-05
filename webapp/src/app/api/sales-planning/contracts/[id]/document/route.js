import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { loadScoped } from '@/lib/scopedRow';
import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { buildContractHTML } from '@/lib/sales/contractDocument';
import { EXTERNAL_NO_DOCUMENT_NOTE, isExternalContract } from '@/lib/sales/contracts';
import { hasContractTemplate, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';
import { loadContractQuotation } from '@/lib/sales/contractQuotationSource';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/sales-planning/contracts/[id]/document — เอกสารสัญญาเป็น HTML สำหรับพิมพ์
//
// ใบที่ออกแล้ว → **เนื้อที่ตรึงไว้** เสมอ (ไม่เรนเดอร์จากข้อมูลสด) เพื่อให้พิมพ์ซ้ำได้
// เหมือนฉบับที่ลูกค้าถืออยู่ แม้แม่แบบหรือทะเบียนลูกค้าจะเปลี่ยนไปแล้ว
// ใบร่าง → เรนเดอร์สดเป็นตัวอย่าง (มีลายน้ำ "ฉบับร่าง")
//
// ⭐ ใบที่ออกเลขแล้วแต่เนื้อยังว่าง (เรนเดอร์ล้มตอนกดออกสัญญา) → เรนเดอร์ซ้ำแล้วเก็บ
//    ให้เอง (idempotent) — ไม่ใช่ใบเสียที่ต้องยกเลิกทิ้ง
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;
  /* 🔴 **ต้องอยู่ก่อนด่านแม่แบบ** — ใบ external ที่ชนิดมีแม่แบบ (เช่น `scent_design`)
     จะผ่านด่านล่างไปได้ทั้งใบ แล้วได้ "สัญญา" ที่ระบบแต่งเองออกมาเต็มทุกช่อง
     · เรียงกลับกันเมื่อไร ใบ external ชนิด service/manufacturing จะได้ข้อความผิดทาง
       ("ส่งต้นฉบับให้ผู้ดูแลเพิ่มก่อน") ทั้งที่สายนี้ไม่ต้องใช้แม่แบบเลย */
  if (isExternalContract(contract)) return fail(EXTERNAL_NO_DOCUMENT_NOTE, 409);
  if (!hasContractTemplate(contract.kind)) return fail(MISSING_TEMPLATE_NOTE, 409);

  let html = contract.issuedHtml || null;
  if (!html) {
    const company = await getPublishedCompanyProfile(supabase);
    /* 🐞 **ร่างเคยพิมพ์คนละเนื้อกับฉบับจริง** — ที่นี่ส่งแค่ `{ quoteNumber }` ⇒ ตาราง
       ข้อ 2 ไม่มีค่าบริการ/รายละเอียด และข้อ 3 ไม่มีบรรทัดงวดเลย ทั้งที่เส้นทาง
       "ออกสัญญา" แก้ไปแล้ว · คนตรวจร่างจึงเห็นเอกสารที่ไม่ตรงกับของที่จะออกจริง
       ⚠️ ไม่ตรวจสถานะใบที่นี่โดยตั้งใจ — ร่างต้องเปิดดูได้แม้ใบยังไม่อนุมัติ
          ด่าน "ใบต้องอนุมัติอยู่" อยู่ที่ตอนกดออกสัญญาเท่านั้น
       ⚠️ โหลดไม่สำเร็จ = เรนเดอร์ต่อด้วยเลขที่ใน metadata (พฤติกรรมเดิม) ไม่ใช่ 500 —
          ร่างต้องเปิดดูได้เสมอ */
    const { quotation } = await loadContractQuotation(supabase, contract.quotationId);
    html = buildContractHTML(contract, {
      company,
      quotation: contract.quotationId
        ? { ...(quotation || {}), quoteNumber: quotation?.quoteNumber || contract.metadata?.quoteNumber }
        : { quoteNumber: contract.metadata?.quoteNumber },
    });
    // ใบที่ออกเลขแล้วเท่านั้นที่เก็บเนื้อไว้ — ร่างต้องเรนเดอร์สดทุกครั้ง ไม่งั้นจะ
    // พิมพ์ร่างเก่าออกมาหลังแก้ช่องกรอก
    if (contract.contractNo) {
      await supabase.from('sales_contracts').update({ issuedHtml: html }).eq('id', id);
    }
  }

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
});

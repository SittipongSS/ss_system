// ── ฉบับที่ออกจริงของแบบฟอร์ม PDR — HTML ไม่ใช่ PDF (เหมือน QT/SO) ──────
//
// ⚠️ **ด่านเดียวกับหน้ารายละเอียด** — ใครอ่านคำร้องใบนี้ได้ ก็พิมพ์เอกสารได้
// ไม่ใช่ด่านของตัวเอง · ด่านที่สองที่ไม่ตรงกันคือรูที่คนอ่านใบของฝ่ายอื่นได้ผ่านทางพิมพ์
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { findRequest } from '@/lib/materialPricesAdmin';
import { requestUsesPdr } from '@/lib/master/requestTypes';
import { resolveCompanyBlock } from '@/lib/companyProfile';
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { renderPdrDocument } from '@/lib/requests/pdrDocument';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const row = await findRequest(supabase, id);
  if (!row) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, row)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!requestUsesPdr(row)) {
    return Response.json({ error: 'คำร้องหัวข้อนี้ไม่มีแบบฟอร์ม PDR' }, { status: 400 });
  }

  // ⚠️ มาตรฐานที่เผยแพร่อ่านคู่กับบล็อกบริษัท — ล้มเมื่อไรส่ง null แล้วเอกสารตกไปใช้
  // ค่าสำรอง `FM-RD-01 Rev.02` ใน documentBrand.js · ตารางตั้งค่าล่มต้องไม่ทำให้
  // พิมพ์เอกสารไม่ได้ (กติกาเดียวกับ publishedNumberingPattern)
  // 🐞 เดิมอ่านบริษัทจากตาราง `company_profile` ที่ไม่มีอยู่จริง และทิ้ง error ⇒ กระดาษ PDR
  //    พิมพ์ค่าสำรองใน documentBrand.js ทุกใบ ไม่เคยเห็นค่าที่เผยแพร่ในหน้าตั้งค่าองค์กร ·
  //    ของจริงคือ `organization_setting_versions` ผ่าน `getPublishedCompanyProfile`
  //    ตัวเดียวกับ QT/SO/สัญญา/FM-SA-04 · อ่านไม่ได้ ⇒ ยังตกค่าสำรองเหมือนเดิม แต่ลง log
  //    ไม่ให้เงียบอีก
  const [company, { data: standard, error: standardError }] = await Promise.all([
    getPublishedCompanyProfile(supabase).catch((error) => {
      console.warn('[pdr-document] อ่านข้อมูลบริษัทไม่สำเร็จ — ใช้ค่าสำรอง', error?.message || error);
      return resolveCompanyBlock(null);
    }),
    supabase.from('document_standard_versions').select('*')
      .eq('documentKey', 'pdr').eq('status', 'published').maybeSingle(),
  ]);
  if (standardError) {
    console.warn('[pdr-document] อ่านมาตรฐานเอกสาร PDR ไม่สำเร็จ — ใช้ค่าสำรอง', standardError.message);
  }

  const html = renderPdrDocument({
    request: row,
    briefs: row.briefs || [],
    company,
    // ⭐ **มาตรฐานคุมทั้งรหัสฟอร์ม Rev วันที่มีผล ชื่อบนหัวใบ และสี Accent** — ส่ง
    // แถวเวอร์ชันดิบเข้าไป ตัวเอกสาร resolve เองที่เดียว (แบบเดียวกับ ganttPrint/billPrint)
    standard: standard || null,
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

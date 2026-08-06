// ── ฉบับที่ออกจริงของแบบฟอร์ม PDR — HTML ไม่ใช่ PDF (เหมือน QT/SO) ──────
//
// ⚠️ **ด่านเดียวกับหน้ารายละเอียด** — ใครอ่านคำร้องใบนี้ได้ ก็พิมพ์เอกสารได้
// ไม่ใช่ด่านของตัวเอง · ด่านที่สองที่ไม่ตรงกันคือรูที่คนอ่านใบของฝ่ายอื่นได้ผ่านทางพิมพ์
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { findRequest } from '@/lib/materialPricesAdmin';
import { requestHasPdr } from '@/lib/master/requestTypes';
import { resolveDocumentForm } from '@/lib/documentStandards';
import { resolveCompanyBlock } from '@/lib/companyProfile';
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
  if (!requestHasPdr(row.kind)) {
    return Response.json({ error: 'คำร้องหัวข้อนี้ไม่มีแบบฟอร์ม PDR' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('company_profile').select('*').limit(1).maybeSingle();

  const html = renderPdrDocument({
    request: row,
    briefs: row.briefs || [],
    company: resolveCompanyBlock(profile || null),
    // ⚠️ ยังไม่ผูกมาตรฐานที่เผยแพร่ — `resolveDocumentForm(null, …)` ตกไปใช้ค่าสำรอง
    // `FM-RD-01 Rev.02` ซึ่งตรงกับกระดาษจริงอยู่แล้ว · ผูกทีหลังได้โดยไม่กระทบเอกสาร
    // ที่พิมพ์ไปแล้ว เพราะรหัสฟอร์มอยู่บนกระดาษที่ออกไปเท่านั้น
    form: resolveDocumentForm(null, 'pdr'),
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

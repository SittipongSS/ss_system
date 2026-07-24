import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getPublishedCompanyProfile, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export const dynamic = 'force-dynamic';

// บล็อกบริษัทที่เผยแพร่สำหรับฝังในเอกสาร (ใบเสนอราคา/SO/ใบภาษี/Gantt) — เปิดให้ผู้ใช้
// ที่ล็อกอินทุกคนอ่านได้ (ไม่ต้อง master:manage) เพราะข้อมูลนี้พิมพ์บนเอกสารถึงลูกค้าอยู่แล้ว
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const company = await getPublishedCompanyProfile(getSupabaseAdmin());
    return Response.json({ company });
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'โหลดข้อมูลบริษัทไม่สำเร็จ' }, { status });
  }
}

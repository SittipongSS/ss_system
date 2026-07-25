// มาตรฐานเอกสารที่ "เผยแพร่แล้ว" สำหรับฝังบนเอกสารตอนพิมพ์ — เปิดให้ผู้ใช้ที่ล็อกอิน
// ทุกคนอ่านได้ (ไม่ต้อง canManageDocumentStandards) เพราะรหัสแบบฟอร์ม/Revision พิมพ์อยู่
// บนใบที่ส่งถึงลูกค้าอยู่แล้ว ต่างจาก GET /api/document-standards ที่เป็นหน้าจัดการ
// (เห็นร่าง + ประวัติเวอร์ชัน) ซึ่งยังจำกัดที่หัวหน้าฝ่ายขาย/แอดมินตามเดิม
//
// ⚠ ต้องลงทะเบียนใน OPEN_READ_APIS ของ proxy.js ด้วย — ด่าน lockdown เป็น allowlist
// แบบ default-deny ถ้าไม่ลงทะเบียน non-admin จะได้ 403 เงียบ ๆ แล้วเอกสารตกไปใช้
// ค่าสำรองโดยไม่มีใครรู้ (บั๊กที่เคยเกิดกับ /api/company-profile — PR #694)
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadDocumentStandardsAdmin, DocumentStandardError } from '@/lib/admin/documentStandards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const rows = await loadDocumentStandardsAdmin(getSupabaseAdmin());
    const standards = {};
    for (const row of rows) standards[row.documentKey] = row.published || null;
    return Response.json({ standards });
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    return Response.json({ error: error.message || 'โหลดมาตรฐานเอกสารไม่สำเร็จ' }, { status });
  }
}

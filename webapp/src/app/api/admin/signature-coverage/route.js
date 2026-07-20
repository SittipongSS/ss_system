import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser } from '@/lib/permissions';
import { loadUserDirectory } from '@/lib/usersRepo';
import { buildSignatureCoverage } from '@/lib/admin/signatureCoverage';

export const dynamic = 'force-dynamic';

// ดีลที่ปิด/ส่งต่อฝ่ายผลิตแล้ว ไม่ก่อใบเสนอราคาใหม่ให้ต้องอนุมัติ
const CLOSED_STAGES = ['won', 'in_project', 'lost'];
// ใบที่ยังอนุมัติได้อยู่จริง — ตรงกับเงื่อนไขใน quotations/[id]/approval
const APPROVABLE_STATUSES = ['draft', 'sent', 'rejected'];

// GET /api/admin/signature-coverage — Phase 5B readiness: ใครยังไม่มีลายเซ็น
// อิเล็กทรอนิกส์ทั้งที่ต้องอนุมัติเอกสาร (mig 0125). อ่านอย่างเดียวล้วน — ลายเซ็นเป็น
// ของส่วนตัว เจ้าตัวต้องอัปเองที่ /account เท่านั้น (ADR 0006) รายงานนี้แค่ชี้เป้า
// gate ด้วย users:view (cap เดิม อ่านอย่างเดียว) เหมือน GET /api/users
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canUser(user, 'users:view')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();

  const [directory, signatures, deals, quotations] = await Promise.all([
    loadUserDirectory(supabase),
    supabase.from('user_signatures').select('userId, activeVersionId'),
    // limit สูงกว่าจำนวนดีลเปิดจริงมาก — กัน default page size ของ PostgREST ตัดแถว
    // แล้วทำให้ AE บางคนดูเหมือนไม่ถือดีล (= ถูกจัดเป็น "ยังไม่จำเป็น" ทั้งที่ต้องมี)
    supabase.from('sales_deals').select('ownerId, stage').not('stage', 'in', `(${CLOSED_STAGES.join(',')})`).limit(5000),
    supabase
      .from('quotations')
      .select('id, status, approvalStatus, deal:sales_deals(ownerId, stage)')
      .eq('approvalStatus', 'pending')
      .in('status', APPROVABLE_STATUSES),
  ]);

  const firstError = signatures.error || deals.error || quotations.error;
  if (firstError) return Response.json({ error: 'โหลดข้อมูลความพร้อมลายเซ็นไม่สำเร็จ' }, { status: 500 });

  const activeSignatureUserIds = new Set(
    (signatures.data || []).filter((row) => row.activeVersionId).map((row) => row.userId),
  );

  const dealCounts = countBy(deals.data || [], (row) => row.ownerId);
  // ใบรออนุมัติ "ของเจ้าของดีล" — ผู้อนุมัติคือเจ้าของ ไม่ใช่คนสร้างใบ
  const pendingCounts = countBy(quotations.data || [], (row) => {
    const deal = row.deal;
    if (!deal || CLOSED_STAGES.includes(deal.stage)) return null;
    return deal.ownerId;
  });

  const coverage = buildSignatureCoverage({
    users: [...directory.values()],
    activeSignatureUserIds,
    dealCounts,
    pendingCounts,
  });

  return Response.json(coverage);
}

function countBy(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

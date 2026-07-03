import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canApproveMasterData } from '@/lib/permissions';
import { normalizeBrands } from '@/lib/master/brands';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Customers are a central registry — every signed-in user can view all of them
// (so teams don't re-register the same customer). Edit/delete is team-scoped.
//
// Approval gate: by default GET returns only APPROVED customers, so every
// downstream consumer (orders, excise registration, PM pickers) automatically
// never sees a pending/rejected row. The management page passes ?manage=1 to
// see all statuses (with badges + approve/reject actions).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const manage = new URL(request.url).searchParams.get('manage') === '1';

  let query = supabase.from('customers').select('*').order('createdAt', { ascending: false });
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Hide retired (isActive=false) customers from every downstream picker, but
  // keep them in the management view. Filtered in JS (not the query) so it stays
  // resilient if migration 0030 hasn't run yet — a missing column reads as
  // undefined, which we treat as active. Legacy NULL is active too.
  const rows = manage ? data : (data || []).filter((c) => c.isActive !== false);
  return Response.json(rows);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // Duplicate AR Code check
  const { data: dup } = await supabase
    .from('customers')
    .select('id')
    .eq('arCode', body.arCode)
    .maybeSingle();
  if (dup) {
    return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  // AE / AC creations land as 'pending'; Senior AE+ auto-approve their own.
  const nowIso = new Date().toISOString();
  const autoApprove = canApproveMasterData(user?.role);

  // Contacts (migration 0033): list is the source of truth; the first contact is
  // primary and mirrors into the legacy single columns for back-compat.
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const primary = contacts[0] || {};

  const newCustomer = {
    // Collision-proof id. The old 'CUS-'+last-6-ms scheme repeated every ~16.7
    // min and the live DB has no unique on id — two customers could share one.
    id: 'CUS-' + randomUUID(),
    arCode: body.arCode,
    name: body.name,
    taxId: body.taxId,
    customerType: body.customerType === 'individual' ? 'individual' : 'company', // migration 0034
    branchCode: body.branchCode || '00000', // '00000' = สำนักงานใหญ่ (migration 0032)
    phone: body.phone || null,
    address: body.address,                    // ที่อยู่ออกเอกสาร/บิล
    shippingAddress: body.shippingAddress || null, // null = ใช้ที่อยู่ออกเอกสาร
    brands: normalizeBrands(body.brands), // [{th,en}] (migration 0059)
    isActive: true, // ลูกค้าใหม่ใช้งานอยู่เสมอ (migration 0030)
    // แผนที่/เอกสารย้ายไปตาราง attachments (docType address_map) — ไม่เขียน mapFileUrl อีก.
    // Master-data contact / commercial fields (migration 0005, 0025, 0033).
    contacts,
    contactPerson: primary.name || null,
    contactPhone: primary.phone || null,
    email: primary.email || null,
    creditTerms: body.creditTerms || null,
    metadata: body.metadata || {},
    // Managing team + owner come from the server-side identity.
    team: user?.team ?? null,            // ทีมหลัก/ผู้สร้าง
    teams: user?.team ? [user.team] : [], // ทีมดูแลทั้งหมด (migration 0037)
    ownerId: user?.id ?? null,
    // Approval workflow (migration 0027).
    approvalStatus: autoApprove ? 'approved' : 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: autoApprove ? (user?.id ?? null) : null,
    approvedByName: autoApprove ? (user?.name ?? null) : null,
    approvedAt: autoApprove ? nowIso : null,
    createdAt: nowIso,
  };

  const { data, error } = await supabase.from('customers').insert(newCustomer).select().single();
  if (error) {
    // Unique violation (migration 0031): a concurrent insert beat the app-level
    // dup check above, or taxId already exists. Map to a friendly 409.
    if (error.code === '23505') {
      const msg = /taxId/i.test(error.message) ? 'เลขประจำตัวผู้เสียภาษี + สาขานี้มีในระบบแล้ว' : 'รหัสลูกค้านี้มีในระบบแล้ว';
      return Response.json({ error: msg }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  await recordAudit({ user, action: 'create', entityType: 'customer', entityId: data.id, after: data, request });
  return Response.json(data, { status: 201 });
}

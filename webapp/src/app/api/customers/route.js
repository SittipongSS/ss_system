import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canApproveMasterData, caretakerTeamsOf, hasTeam, primaryTeam, userTeams, viewScopeUser, isSuperuser, TEAMS } from '@/lib/permissions';
import { addressesFromLegacy, legacyAddressMirror, normalizeAddresses } from '@/lib/master/addresses';
import { normalizeBrands } from '@/lib/master/brands';
import {
  AR_SCOPE, CODE_MODE_AUTO, arCodeError, codeModeOf, formatArCode, nextMasterNumber,
} from '@/lib/master/masterCodes';
import { splitTaxIdMatches, taxIdDigits, taxIdDuplicateError } from '@/lib/master/customerTaxId';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Customers are a central registry (so teams don't re-register the same
// customer) but the LIST is team-scoped by default (กฎ ลูกค้า›แบรนด์›สินค้า):
// AE/AC/Senior see only customers their team ดูแล (teams[] — fallback team) to
// keep pickers short. `?scope=all` widens to every customer (database page /
// ตามหาลูกค้าที่ทีมอื่นดูแลอยู่แล้ว) and `?manage=1` implies it. Record-level
// access (GET /[id]) stays open to everyone — cross-team flows that derive a
// customer from a product (excise/PM) are unaffected. Edit/delete team-scoped.
//
// Approval gate: by default GET returns only APPROVED customers, so every
// downstream consumer (orders, excise registration, PM pickers) automatically
// never sees a pending/rejected row. The management page passes ?manage=1 to
// see all statuses (with badges + approve/reject actions).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const params = new URL(request.url).searchParams;
  const manage = params.get('manage') === '1';
  const scopeAll = manage || params.get('scope') === 'all';

  let query = supabase.from('customers').select('*').order('createdAt', { ascending: false });
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Hide retired (isActive=false) customers from every downstream picker, but
  // keep them in the management view. Filtered in JS (not the query) so it stays
  // resilient if migration 0030 hasn't run yet — a missing column reads as
  // undefined, which we treat as active. Legacy NULL is active too.
  let rows = manage ? data : (data || []).filter((c) => c.isActive !== false);

  // Default team scope — customers with no team at all are shared rows every
  // team can see. A team-scoped user without a team can't be scoped → show all.
  if (!scopeAll) {
    const user = await getCurrentUser();
    // คนอยู่หลายทีมได้ ⇒ เห็นลูกค้าของทุกทีมที่สังกัด (กติกาเดียวกับ inScope)
    if (viewScopeUser(user) === 'team' && userTeams(user).length) {
      rows = rows.filter((c) => {
        const teams = caretakerTeamsOf(c);
        return teams.length === 0 || hasTeam(user, teams);
      });
    }
  }
  return Response.json(rows);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // ── รหัสลูกค้า: สวิตช์ "ระบบใหม่" ในโมดัล (มติผู้ใช้ 2026-08-12, mig 0230) ──
  // เปิด (auto) = server ออกเลขให้เอง AR-AAAA เริ่ม 1001 · ปิด (manual) = ใช้รหัสที่
  // กรอกมา (รูปแบบเดิม AR-AAA)
  //
  // ⚠️ **เลขจองที่นี่ที่เดียว ตอนจะ insert จริง** — ไม่ใช่ตอนเปิดฟอร์ม: เปิดฟอร์มแล้ว
  // ปิดทิ้งเป็นเรื่องปกติ ถ้าจองตั้งแต่ตอนนั้น เลขจะโหว่เป็นรูทุกครั้งที่มีคนเปลี่ยนใจ
  // (ฟอร์มจึงได้แค่ "เลขถัดไป" แบบพรีวิวจาก /next-code)
  //
  // ⚠️ ค่าที่ client ส่งมาในโหมด auto **ไม่ถูกใช้เลย** — ถือเป็นแค่สิ่งที่หน้าจอโชว์
  // ตอนนั้น ไม่ใช่คำสั่ง (สองคนเปิดฟอร์มพร้อมกันจะเห็นเลขเดียวกัน แต่ต้องได้คนละเลข)
  const codeMode = codeModeOf(body.codeMode);
  let arCode = String(body.arCode || '').trim();
  if (codeMode === CODE_MODE_AUTO) {
    try {
      arCode = formatArCode(await nextMasterNumber(supabase, AR_SCOPE));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  } else {
    const codeError = arCodeError(arCode, { mode: codeMode });
    if (codeError) return Response.json({ error: codeError }, { status: 400 });
  }

  // Duplicate AR Code check
  const { data: dup, error: dupError } = await supabase
    .from('customers')
    .select('id')
    .eq('arCode', arCode)
    .maybeSingle();
  if (dupError) return Response.json({ error: dupError.message }, { status: 500 });
  if (dup) {
    return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  // AE / AC / Senior AE creations land as 'pending' — only AE Supervisor approves
  // (admin = sysadmin break-glass). Approvers auto-approve their own.
  const nowIso = new Date().toISOString();
  const autoApprove = canApproveMasterData(user?.role);

  // Contacts (migration 0033): list is the source of truth; the first contact is
  // primary and mirrors into the legacy single columns for back-compat.
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const primary = contacts[0] || {};

  /* ทีมดูแล (migration 0037) — ไม่เลือก = ไร้ทีม = "ส่วนกลาง" ทุกทีมแก้ได้
     (canEditRecord) · fallback ทีมหลักสำคัญเพราะ edit ผูกกับ teams[] แล้ว
     (มติ 2026-07-21): ลูกค้าที่สร้างโดยไม่ระบุทีมจะกลายเป็นกำพร้าถ้าไม่มี fallback

     คนสร้างเลือกได้ แต่ **เลือกได้เฉพาะทีมที่ตัวเองสังกัด** (มติ 2026-08-11)
     ⚠️ ไม่ใช่ "ทุกทีมของเขา" โดยอัตโนมัติ — ลูกค้าหนึ่งรายจะถูกยกให้สองทีมดูแลได้ก็ต่อเมื่อ
     มีคนสั่งเท่านั้น · ไม่ส่งมา = ทีมหลัก (พฤติกรรมเดิมของคนอยู่ทีมเดียว)
     superuser (admin/AE Sup) ไม่มีทีมของตัวเอง จึงเลือกได้ทุกทีมเหมือนเดิม
     ⚠️ ห้ามเชื่อ body.teams ตรง ๆ สำหรับคนสายทีม — ไม่งั้นยิง API ตรงแล้วยกลูกค้า
     ให้ทีมที่ตัวเองไม่ได้อยู่ได้ */
  const requestedTeams = Array.isArray(body.teams) ? body.teams.filter((t) => TEAMS.includes(t)) : [];
  const mine = userTeams(user);
  const pickedTeams = isSuperuser(user?.role)
    ? requestedTeams
    : (requestedTeams.filter((t) => mine.includes(t)).length
      ? requestedTeams.filter((t) => mine.includes(t))
      : (primaryTeam(user) ? [primaryTeam(user)] : []));

  // ที่อยู่ (0202): ลิสต์คือแหล่งความจริง — ช่องเดี่ยวเดิมเป็นกระจกของที่อยู่หลัก
  // ผู้เรียกที่ยังส่งแบบเก่า (address/shippingAddress) แปลงขึ้นลิสต์ให้
  // สาขา (2026-08-06) อยู่บนที่อยู่ที่ใช้ออกเอกสาร — body.branchCode ของสายเก่า
  // ยังใช้ได้ในฐานะค่าสำรองเมื่อที่อยู่ที่ส่งมาไม่ได้ระบุสาขา
  const addresses = normalizeAddresses(
    body.addresses !== undefined ? body.addresses : addressesFromLegacy(body),
  );
  const mirror = legacyAddressMirror(addresses, { fallbackBranchCode: body.branchCode });
  if (!mirror.address) {
    return Response.json({ error: 'ต้องมีที่อยู่สำหรับออกเอกสารอย่างน้อย 1 รายการ' }, { status: 400 });
  }

  // ── เช็คซ้ำจากเลขประจำตัวผู้เสียภาษี (มติผู้ใช้ 2026-08-12) ────────────────
  // ⚠️ ต้องเช็ค **หลัง** คำนวณ mirror.branchCode เพราะสาขาคือครึ่งหนึ่งของคีย์ซ้ำ
  // (unique (taxId, branchCode), mig 0039) — บริษัทเดียวเปิดหลายสาขาได้โดยชอบ
  // ⚠️ DB มี unique อยู่แล้วและจะตีกลับเองถ้าด่านนี้แพ้ race — ที่ด่านนี้มีเพิ่มคือ
  // **บอกว่าไปชนกับรายไหน** ข้อความจาก unique บอกแค่ว่าซ้ำ คนกรอกหาไม่เจอว่าซ้ำกับอะไร
  const taxId = taxIdDigits(body.taxId) || null;
  if (taxId) {
    const { data: sameTax, error: taxError } = await supabase
      .from('customers').select('id, arCode, name, taxId, branchCode').eq('taxId', taxId);
    if (taxError) return Response.json({ error: taxError.message }, { status: 500 });
    const { sameBranch } = splitTaxIdMatches(sameTax, { taxId, branchCode: mirror.branchCode });
    const taxDupError = taxIdDuplicateError(sameBranch, { branchCode: mirror.branchCode });
    if (taxDupError) return Response.json({ error: taxDupError }, { status: 409 });
  }

  const newCustomer = {
    // Collision-proof id. The old 'CUS-'+last-6-ms scheme repeated every ~16.7
    // min and the live DB has no unique on id — two customers could share one.
    id: 'CUS-' + randomUUID(),
    arCode,
    name: body.name,
    taxId,                                    // ตัวเลขล้วน (ถอดขีดแล้วที่ด่านเช็คซ้ำ)
    customerType: body.customerType === 'individual' ? 'individual' : 'company', // migration 0034
    addresses,                                // ที่อยู่ทั้งหมด (migration 0202)
    // ── กระจกของที่อยู่หลัก (อย่าเขียนทับมือ) ────────────────────────────
    branchCode: mirror.branchCode,            // สาขาของที่อยู่ออกบิลหลัก ('00000' = สนญ.)
    phone: body.phone || null,
    address: mirror.address,                  // ที่อยู่ออกเอกสาร/บิล
    shippingAddress: mirror.shippingAddress,  // null = ใช้ที่อยู่ออกเอกสาร
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
    // Managing team + owner. team-role → ทีมตัวเอง; superuser → ทีมที่เลือก (หรือไร้ทีม).
    team: pickedTeams[0] ?? user?.team ?? null, // ทีมหลัก (คอลัมน์เก่า) = ทีมแรกที่ดูแล
    teams: pickedTeams,                          // ทีมดูแลทั้งหมด (migration 0037)
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

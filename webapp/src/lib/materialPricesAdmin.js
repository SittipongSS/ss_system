// ── ทะเบียนวัสดุ (mig 0143 + 0157) — ชั้นเข้าถึงข้อมูล (server only) ────
import { pdrContext } from '@/lib/requests/pdrFields';
import { randomUUID } from 'crypto';
import {
  materialIdentityKey, normalizeMaterialInput, unitBasisForMaterialKind,
} from '@/lib/materialPrices';
import { normalizePmType } from '@/lib/master/materialTypes';

// โหลดวัสดุในทะเบียนพร้อมรุ่นราคา + ชั้นราคาของแต่ละรุ่น (ก้อนเดียว กัน N+1)
// status: undefined = ที่ใช้งานได้จริง (active) · null = ทุกสถานะ · array = ตามที่ระบุ
export async function loadMaterials(supabase, { status, kind = null, customerId } = {}) {
  let query = supabase.from('material_prices').select('*');
  if (status !== null) {
    const wanted = Array.isArray(status) ? status : [status || 'active'];
    query = query.in('status', wanted);
  }
  if (kind) query = query.eq('kind', kind);
  // customerId: undefined = ไม่กรอง (ทั้งทะเบียน); ค่าอื่น (รวม null ผ่าน .is) = กรองตรง
  if (customerId !== undefined) {
    query = customerId === null ? query.is('customerId', null) : query.eq('customerId', customerId);
  }
  const { data: materials, error } = await query.order('label', { ascending: true });
  if (error) throw error;
  if (!materials?.length) return [];

  const { data: revisions, error: revError } = await supabase
    .from('material_price_revisions')
    .select('*')
    .in('materialId', materials.map((m) => m.id))
    .order('revisionNo', { ascending: false });
  if (revError) throw revError;

  // ราคาอยู่ที่ชั้น (0157) — รุ่นที่ไม่มีชั้นเลย = รุ่นเสีย ไม่ควรมี (RPC กันไว้)
  let tiers = [];
  if (revisions?.length) {
    const { data, error: tierError } = await supabase
      .from('material_price_revision_tiers')
      .select('*')
      .in('revisionId', revisions.map((r) => r.id));
    if (tierError) throw tierError;
    tiers = data || [];
  }

  const revisionsWithTiers = (revisions || []).map((r) => ({
    ...r,
    tiers: tiers.filter((t) => t.revisionId === r.id),
  }));

  return materials.map((m) => ({
    ...m,
    revisions: revisionsWithTiers.filter((r) => r.materialId === m.id),
  }));
}

export async function findMaterial(supabase, id) {
  const rows = await loadMaterials(supabase, { status: null });
  return rows.find((m) => m.id === id) || null;
}

// ชื่อ/รหัสสูตร ณ เวลาที่ผูก — เก็บลงแถววัสดุเพื่อให้เอกสารเก่าที่ snapshot ค่านี้
// ไว้ยังอ่านได้ · คืน {} เมื่อไม่ผูกสูตร (PM) หรือหาไม่เจอ
export async function formulaSnapshotFor(supabase, formulaId) {
  if (!formulaId) return { formulaCode: null, formulaName: null };
  const { data, error } = await supabase
    .from('formulas').select('code, name').eq('id', formulaId).maybeSingle();
  if (error) throw error;
  return { formulaCode: data?.code || null, formulaName: data?.name || null };
}

// หา "วัสดุตัวเดิม" จากตัวตน (ชนิด+ชื่อ+สูตร+ลูกค้า) ไม่เจอค่อยสร้างใหม่
//
// ⚠️ นี่คือจุดที่ปิดบั๊ก "ตอบใบขอราคาทุกครั้ง = สร้างวัสดุตัวใหม่ ไม่เคยเป็น rev.2":
// ของเดิม insert ตรงทุกครั้งโดยไม่มองว่ามีตัวเดิมอยู่แล้วหรือยัง
// คืน { material, created }
export async function ensureMaterial(supabase, input = {}) {
  const { value, error } = normalizeMaterialInput(input);
  if (error) throw new Error(error);

  const candidates = await loadMaterials(supabase, {
    status: null, kind: value.kind, customerId: value.customerId,
  });
  const key = materialIdentityKey(value);
  const existing = candidates.find((m) => materialIdentityKey(m) === key);
  if (existing) return { material: existing, created: false };

  const nowIso = new Date().toISOString();
  const status = input.status === 'draft' ? 'draft' : 'active';
  const row = {
    id: `MAT-${randomUUID()}`,
    ...value,
    // snapshot ชื่อ/รหัสสูตรจากทะเบียน (mig 0181) — ตัวตนยึด formulaId แล้ว แต่
    // ⚠️ ใบขอราคาผลิตที่ออกไปแล้ว snapshot `formulaCode`/`formulaName` ไว้ ลบ/หยุด
    // เขียนตอนนี้จะทำให้เอกสารเก่าอ่านไม่ได้ → เก็บเป็นค่า derive ที่ **ไม่มีใคร
    // พิมพ์เองได้อีกแล้ว** (ฟอร์มเลือกจากทะเบียนอย่างเดียว) จึง drift ไม่ได้
    ...(await formulaSnapshotFor(supabase, value.formulaId)),
    pmType: normalizePmType(value.kind, input.pmType),
    status,
    createdById: input.user?.id ?? null,
    createdByName: input.user?.name ?? null,
    updatedAt: nowIso,
  };
  if (status === 'active') {
    row.acceptedById = input.user?.id ?? null;
    row.acceptedByName = input.user?.name ?? null;
    row.acceptedAt = nowIso;
  }
  const { data, error: insertError } = await supabase
    .from('material_prices').insert(row).select().single();
  if (insertError) throw insertError;
  return { material: { ...data, revisions: [] }, created: true };
}

// ── เคสขอราคาวัสดุ (mig 0158) ──────────────────────────────────────────
// โหลดเคส + รายการ + ชั้นจำนวนที่ขอ เป็นก้อนเดียว (กัน N+1)
export async function loadRequests(supabase, {
  id = null, dept = null, status = null, requestedById = null, team = null,
} = {}) {
  let query = supabase.from('dept_requests').select('*');
  if (id) query = query.eq('id', id);
  if (dept) query = query.eq('dept', dept);
  if (status?.length) query = query.in('status', status);
  if (requestedById) query = query.eq('requestedById', requestedById);
  // ⚠️ ขอบเขต "ทีม" กรองที่นี่ ไม่ใช่ที่จอ (กับดักข้อ 9) — กรองที่จอแปลว่าคำร้อง
  // ของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จากแท็บ Network
  if (team) query = query.eq('team', team);
  const { data: asks, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;
  if (!asks?.length) return [];

  const { data: items, error: itemError } = await supabase
    .from('dept_request_items')
    .select('*')
    .in('requestId', asks.map((a) => a.id))
    .order('sortOrder', { ascending: true });
  if (itemError) throw itemError;

  // ⚠️ เดิมมีขั้นดึง `dept_request_item_tiers` มาแปะรายแถว — ตารางถูก DROP ใน
  // mig 0219 พร้อมหัวข้อขอราคา (ม-28) · ราคาในโมเดลใหม่เป็นราคาเดียวต่อแถว
  return asks.map((a) => ({
    ...a,
    items: (items || []).filter((i) => i.requestId === a.id),
  }));
}

export async function findRequest(supabase, id) {
  const [row] = await loadRequests(supabase, { id });
  if (!row) return null;

  // ⭐ บรรทัดของใบสั่งขายที่ผูก — ใช้กระทบยอด "สั่งเท่าไร ลูกค้าคอนเฟิร์มเท่าไร" (P3d)
  // ดึงเฉพาะตอนเปิดใบเดียว ไม่ใช่ตอนโหลดคิวทั้งชุด — คิวไม่ได้ใช้ตัวเลขนี้ และการ
  // join ทุกแถวจะแพงโดยไม่ได้อะไรกลับมา
  //
  // ⚠️ เอา `qty` อย่างเดียว — ที่เหลือเป็นข้อมูลของใบสั่งขายซึ่งหน้าคำร้องไม่ควรรู้
  // (ยิ่งดึงมามาก ยิ่งมีของให้หลุดออกทาง response โดยไม่ตั้งใจ)
  // ⭐ บรีฟรายกลิ่น (mig 0213) — ชั้นกลางที่ direction ชี้กลับ · หน้ารายละเอียดใช้
  // ทำตัวเลือก "ตอบบรีฟก้อนไหน" ตอน RD ส่งของ และโชว์ว่าใบนี้ขอกี่ทิศทาง
  const { data: briefs, error: briefError } = await supabase
    .from('dept_request_scents').select('*').eq('requestId', id)
    .order('sortOrder', { ascending: true });
  if (briefError) throw briefError;
  const withBriefs = { ...row, briefs: briefs || [] };

  // ⭐ ค่าที่แบบฟอร์ม PDR เติมให้เอง (ผู้ดูแล AE · ผู้ประสานงาน AC · ผู้ติดต่อลูกค้า)
  //
  // ⚠️ **ประกอบที่ server** ไม่ใช่ให้แต่ละจอไปโหลดเอง — จอแสดงกับเอกสารต้องได้ชื่อ
  // ชุดเดียวกันเสมอ · และเอกสารเป็นฟังก์ชันบริสุทธิ์ที่โหลดอะไรเองไม่ได้อยู่แล้ว
  // ⚠️ โหลดเฉพาะใบเดียวตอนเปิด ไม่ใช่ตอนโหลดคิวทั้งชุด (คิวไม่ได้ใช้ค่าพวกนี้)
  const [project, customer, deal] = await Promise.all([
    withBriefs.projectId
      ? supabase.from('projects').select('id, "aeOwner", "acOwner"').eq('id', withBriefs.projectId)
        .maybeSingle().then((r) => r.data)
      : null,
    withBriefs.customerId
      ? supabase.from('customers').select('id, name, contacts, "contactPerson", "contactPhone"')
        .eq('id', withBriefs.customerId).maybeSingle().then((r) => r.data)
      : null,
    withBriefs.dealId
      ? supabase.from('sales_deals').select('id, code').eq('id', withBriefs.dealId)
        .maybeSingle().then((r) => r.data)
      : null,
  ]);
  // ⚠️ **ต้องโหลดก่อน `pdrContext`** — ช่อง "จำนวนกลิ่นที่ต้องการพัฒนา" (PDR 1.12)
  // อ่านจากบรรทัดออกแบบกลิ่นของใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ (มติผู้ใช้ 2026-08-08)
  //
  // ⚠️ `fgCode`/`description` ต้องมาด้วย — `lineCategoryCode()` ใช้แกะรหัสหมวดเมื่อ
  // บรรทัดไม่ได้ผูก `productId` ซึ่งมีจริงบน prod · ดึงมาแค่ `id, qty` แล้วทุกใบจะนับ
  // ได้ 0 เงียบ ๆ แล้วช่อง 1.12 ขึ้น N/A ทั้งที่ใบนั้นขายกลิ่นอยู่
  let salesOrderLines = [];
  if (withBriefs.salesOrderId) {
    const { data: lines, error } = await supabase
      .from('sales_order_lines').select('id, qty, "fgCode", description')
      .eq('salesOrderId', withBriefs.salesOrderId);
    if (error) throw error;
    salesOrderLines = lines || [];
  }

  withBriefs.pdrContext = pdrContext({
    request: withBriefs, project, customer, deal, briefs: briefs || [], salesOrderLines,
  });

  return { ...withBriefs, salesOrderLines };
}

// เพิ่มรุ่นราคาใหม่ให้วัสดุที่มีอยู่แล้ว — ใช้ทั้งตอนตอบคำขอราคาและตอนแก้ราคา
// ในทะเบียน. คืน { material, revision }
//
// ⚠️ **ต้องผ่าน RPC เสมอ ห้าม insert material_price_revisions ตรง ๆ**: rev เป็น
// immutable (guard ห้าม UPDATE/DELETE) ถ้าเขียน rev สำเร็จแล้ว insert ชั้นราคาพัง
// จะได้ rev ที่ไม่มีราคาค้างถาวรและลบทิ้งไม่ได้ — RPC ทำทั้งคู่ใน transaction เดียว
//
// รับได้ทั้ง tiers (หลายชั้น) และ price (ชั้นเดียว — ทางลัดของผู้เรียกที่ยังไม่มีชั้น)
export async function appendMaterialRevision(supabase, {
  materialId, kind, price = null, tiers = null,
  validUntil = null, note = null, askItemId = null, user = null,
}) {
  if (!materialId) throw new Error('ต้องระบุวัสดุในทะเบียนก่อนออกราคา');
  const { data: material, error: findError } = await supabase
    .from('material_prices').select('*').eq('id', materialId).maybeSingle();
  if (findError) throw findError;
  if (!material) throw new Error('ไม่พบวัสดุในทะเบียน');

  const list = Array.isArray(tiers) && tiers.length
    ? tiers
    : [{ qty: null, price: Number(price) }];
  const unitBasis = unitBasisForMaterialKind(kind || material.kind);

  const { data: result, error } = await supabase.rpc('append_material_price_revision', {
    p_material_id: material.id,
    p_unit_basis: unitBasis,
    p_tiers: list.map((t) => ({ qty: t.qty ?? null, price: Number(t.price) })),
    p_valid_until: validUntil || null,
    p_quoted_by: user?.id ?? null,
    p_quoted_name: user?.name ?? null,
    p_note: note,
    p_ask_item_id: askItemId,
  });
  if (error) throw error;

  const revisionId = result?.revisionId;
  const { data: revision, error: revError } = await supabase
    .from('material_price_revisions').select('*').eq('id', revisionId).single();
  if (revError) throw revError;
  const { data: revTiers, error: tierError } = await supabase
    .from('material_price_revision_tiers').select('*').eq('revisionId', revisionId);
  if (tierError) throw tierError;

  return { material, revision: { ...revision, tiers: revTiers || [] } };
}

// รับวัสดุร่างที่เซลเสนอเข้าทะเบียน (RD/PC) — ทำพร้อมใส่ราคาได้ในก้าวเดียว
export async function acceptMaterial(supabase, { materialId, user }) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('material_prices').update({
    status: 'active',
    acceptedById: user?.id ?? null,
    acceptedByName: user?.name ?? null,
    acceptedAt: nowIso,
    updatedAt: nowIso,
  }).eq('id', materialId);
  if (error) throw error;
}

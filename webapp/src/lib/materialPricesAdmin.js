// ── คลังราคาวัสดุ (mig 0143) — ชั้นเข้าถึงข้อมูล (server only) ──────────
import { randomUUID } from 'crypto';
import { unitBasisForMaterialKind } from '@/lib/materialPrices';

// โหลดวัสดุในคลังพร้อมรุ่นราคา (ประกอบเป็นก้อนเดียว กัน N+1)
export async function loadMaterials(supabase, { includeHidden = false, kind = null, customerId } = {}) {
  let query = supabase.from('material_prices').select('*');
  if (!includeHidden) query = query.eq('isHidden', false);
  if (kind) query = query.eq('kind', kind);
  // customerId: undefined = ไม่กรอง (ทั้งคลัง); ค่าอื่น (รวม null ผ่าน .is) = กรองตรง
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

  return materials.map((m) => ({
    ...m,
    revisions: (revisions || []).filter((r) => r.materialId === m.id),
  }));
}

export async function loadMaterialRequests(supabase, { id = null, filters = {} } = {}) {
  let query = supabase.from('material_price_requests').select('*');
  if (id) query = query.eq('id', id);
  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.team?.length) query = query.in('team', filters.team);
  const { data: requests, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;
  if (!requests?.length) return [];

  const { data: items, error: itemError } = await supabase
    .from('material_price_request_items')
    .select('*')
    .in('requestId', requests.map((r) => r.id))
    .order('sortOrder', { ascending: true });
  if (itemError) throw itemError;

  return requests.map((r) => ({
    ...r,
    items: (items || []).filter((i) => i.requestId === r.id),
  }));
}

export async function findMaterialRequest(supabase, id) {
  const [req] = await loadMaterialRequests(supabase, { id });
  return req || null;
}

// เพิ่มรุ่นราคาใหม่ให้วัสดุ (สร้างวัสดุก่อนถ้ายังไม่มี) — ใช้ทั้งตอนตอบใบขอราคาวัสดุ
// และตอนยืนยันราคาจากใบขอราคาผลิต (PR-B). คืน { material, revision }
// หมายเหตุ: material_price_revisions เป็น immutable (guard) — เพิ่มได้อย่างเดียว
export async function appendMaterialRevision(supabase, {
  materialId = null, kind, label, sourceDept, customerId = null, customerName = null,
  price, validUntil = null, sourceRequestId = null, note = null, user = null,
}) {
  const nowIso = new Date().toISOString();
  const unitBasis = unitBasisForMaterialKind(kind);
  const priceField = unitBasis === 'per_kg'
    ? { pricePerKg: Number(price), pricePerUnit: null }
    : { pricePerUnit: Number(price), pricePerKg: null };

  let material;
  if (materialId) {
    const { data, error } = await supabase.from('material_prices').select('*').eq('id', materialId).maybeSingle();
    if (error) throw error;
    material = data;
  }
  if (!material) {
    const id = materialId || `MAT-${randomUUID()}`;
    const { data, error } = await supabase.from('material_prices').insert({
      id, kind, label, sourceDept,
      customerId: customerId || null, customerName: customerName || null,
      createdById: user?.id ?? null, createdByName: user?.name ?? null,
    }).select().single();
    if (error) throw error;
    material = data;
  }

  // เลขรุ่นถัดไป = max + 1 (rev เป็น immutable จึงไม่มี race ภายในคำขอเดียว)
  const { data: last } = await supabase
    .from('material_price_revisions').select('revisionNo')
    .eq('materialId', material.id).order('revisionNo', { ascending: false }).limit(1).maybeSingle();
  const revisionNo = (last?.revisionNo || 0) + 1;

  const { data: revision, error: revError } = await supabase
    .from('material_price_revisions').insert({
      id: `MREV-${randomUUID()}`,
      materialId: material.id,
      revisionNo,
      unitBasis,
      ...priceField,
      quotedById: user?.id ?? null, quotedByName: user?.name ?? null,
      quotedAt: nowIso,
      validUntil,
      sourceRequestId,
      note,
    }).select().single();
  if (revError) throw revError;

  await supabase.from('material_prices').update({ updatedAt: nowIso }).eq('id', material.id);
  return { material, revision };
}

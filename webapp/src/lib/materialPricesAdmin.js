// ── ทะเบียนวัสดุ (mig 0143 + 0157) — ชั้นเข้าถึงข้อมูล (server only) ────
import { pdrContext } from '@/lib/requests/pdrFields';
import { requestPdrRowsPickScent, requestUsesDeliveredRows } from '@/lib/master/requestTypes';
import { requestRowSummary } from '@/lib/requests/rowStage';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { byColumns, fetchAllInChunks } from '@/lib/supabaseInChunks';
import { pickSurveyVisit } from '@/lib/service/surveyQueue';
import { randomUUID } from 'crypto';
import {
  materialIdentityKey, normalizeMaterialInput, pickStampedMaterial, unitBasisForMaterialKind,
} from '@/lib/materialPrices';
import { normalizePmType } from '@/lib/master/materialTypes';
import { brandDisplayFromList } from '@/lib/master/brands';
import { customerNameIn } from '@/lib/master/customerName';

// โหลดวัสดุในทะเบียนพร้อมรุ่นราคา + ชั้นราคาของแต่ละรุ่น (ก้อนเดียว กัน N+1)
// status: undefined = ที่ใช้งานได้จริง (active) · null = ทุกสถานะ · array = ตามที่ระบุ
/* `linked` = กรองด้วยตัวชี้ทะเบียน เช่น { column: 'scentId', ids: [...] }
   ⚠️ มีไว้ให้ทะเบียนกลิ่น/สูตรดึง "ราคาล่าสุดของแถวที่กำลังแสดง" โดยไม่ต้องโหลด
   ทะเบียนวัสดุทั้งก้อน — หน้าทะเบียนกลิ่นเปิดบ่อยกว่าหน้าวัสดุมาก
   ⚠️ ids ว่าง = ไม่มีอะไรให้หา คืนลิสต์ว่างทันที ไม่ใช่ยิง `.in()` ด้วย array ว่าง
   ซึ่ง PostgREST ตีความเป็น "ไม่กรอง" แล้วได้ทั้งตารางกลับมา */
export async function loadMaterials(supabase, {
  status, kind = null, customerId, linked = null,
} = {}) {
  if (linked && !linked.ids?.length) return [];
  let query = supabase.from('material_prices').select('*');
  if (status !== null) {
    const wanted = Array.isArray(status) ? status : [status || 'active'];
    query = query.in('status', wanted);
  }
  if (kind) query = query.eq('kind', kind);
  if (linked) query = query.in(linked.column, linked.ids);
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

// ── วัสดุของกลิ่น/สูตรตัวหนึ่ง — หาตัวเดิมก่อน ไม่เจอค่อยสร้าง ─────────────────
//
// 🐞 **ใส่ราคา FB ครั้งที่สองของสูตรเดียวกันพัง** (พบ 2026-09-22 ตอนทำ ม-148) — เดิมเรียก
// `ensureMaterial` โดยไม่ส่ง `formulaId` แต่ตัวตนของวัสดุ **รวม formulaId** (mig 0181)
// ⇒ ครั้งแรกสร้างวัสดุ (formulaId ว่าง) แล้วประทับ formulaId · ครั้งที่สองคีย์ที่หา
// (formulaId ว่าง) ไม่ตรงตัวที่ประทับแล้ว ⇒ สร้างวัสดุตัวใหม่ แล้วประทับ formulaId ชน
// `material_prices_identity_uk` (23505) · ทุกครั้งถัดไปเจอตัวกำพร้าแล้วพังแบบเดิม
// ราคา F ไม่โดนเพราะ scentId ไม่อยู่ในตัวตน · บน prod ยังไม่มีใครเจอเพราะ FB มีตัวเดียว
//
// ⇒ ลำดับการหา:
//   1) ตัวที่ **ประทับ pointer นี้แล้ว** = วัสดุของกลิ่น/สูตรนี้ (ไม่ขึ้นกับชื่อ — ทะเบียนแก้ชื่อได้)
//   2) ตัวเก่าที่ **ยังไม่ประทับ** ชื่อ+ลูกค้าตรง (ราคาจากยุคคำร้องขอราคา) → รับมาประทับ
//      (พฤติกรรมเดิมของราคาแรก — ประวัติราคาเก่าไม่หลุด)
//   3) สร้างใหม่ผ่าน `ensureMaterial` — สูตรใส่ `formulaId` ตั้งแต่เกิดให้ตรงตัวตน
async function registryEntryMaterial(supabase, { kind, stampColumn, source, user }) {
  const candidates = await loadMaterials(supabase, {
    status: null, kind, customerId: source.customerId ?? null,
  });
  // ⚠️ เทียบชนิดซ้ำแม้ query กรองแล้ว — B กับ FB ของสูตรเดียวกันประทับ formulaId ตัวเดียวกัน
  // ⭐ ตัวเลือกเดียวกับที่หน้าทะเบียนใช้แสดงราคา (`pickStampedMaterial`) — ใส่แล้วต้องเห็นตัวที่ใส่
  const stamped = pickStampedMaterial(candidates, {
    stampColumn, id: source.id, kind, label: source.name,
  });
  if (stamped) return stamped;
  const unstampedKey = materialIdentityKey({
    kind, label: source.name, formulaId: null, customerId: source.customerId,
  });
  const legacy = candidates.find((m) => m.kind === kind && !m[stampColumn]
    && materialIdentityKey(m) === unstampedKey);
  if (legacy) return legacy;
  const make = (label) => ensureMaterial(supabase, {
    kind,
    label,
    customerId: source.customerId,
    customerName: source.customerName,
    formulaId: stampColumn === 'formulaId' ? source.id : null,
    user,
  }).then(({ material }) => material);
  const material = await make(source.name);
  if (!material[stampColumn] || material[stampColumn] === source.id) return material;
  /* 🐞 **ชื่อชนกับวัสดุของอีกตัว** (รีวิว ม-148 รอบสอง) — ตัวตนวัสดุ F ไม่มี scentId (แค่ ชนิด+ชื่อ+ลูกค้า) ⇒ กลิ่น A
     เปลี่ยนชื่อ "Rose" → "Rose Garden" แล้วกลิ่น B ใหม่ของลูกค้าเดิมใช้ชื่อ "Rose" · ใส่ราคา F ให้ B แล้ว `ensureMaterial`
     คืนวัสดุของ A ⇒ ราคาของ B ไปต่อท้ายประวัติ A เงียบ ๆ (ของ A เปลี่ยน · B ยังไม่มีราคา) · มีบน main มาก่อน
     แต่แบรนช์นี้เพิ่มทางเข้า F (ช่อง F ของสูตร · แถวพัฒนาสูตร) ⇒ **ห้ามต่อท้ายวัสดุที่ผูกตัวอื่นเด็ดขาด**
     · ดัชนีตัวตนห้ามมี "Rose" ตัวที่สองของลูกค้าเดิม ⇒ สร้างด้วยป้ายที่ไม่ชน (ชื่อ + รหัส) แทนการปฏิเสธ */
  const own = await make(`${source.name} (${source.code || source.id})`);
  if (own[stampColumn] && own[stampColumn] !== source.id) {
    const failure = new Error(`มีวัสดุชื่อนี้ผูกกับ${stampColumn === 'formulaId' ? 'สูตร' : 'กลิ่น'}อื่นอยู่แล้ว — ใส่ราคาไม่ได้ ติดต่อผู้ดูแลระบบ`);
    failure.status = 409;
    throw failure;
  }
  return own;
}

// ── ใส่ราคาหลายช่องในจังหวะเดียว (F · B · FB — ม-148 · มติผู้ใช้ 2026-09-22) ──────────
//
// `entries` = ผลของ `normalizeSlotPrices` · `loadSource(slot)` คืน `{ source, error }` —
// ผู้เรียกตัดสินเองว่ากลิ่น/สูตรสถานะไหนใส่ราคาได้ (ทะเบียนเข้ม · ขั้นราคาในคำร้องไม่ตรวจสถานะเหมือนเดิม)
// ⚠️ **ตรวจแหล่งทุกช่องก่อนเขียนสักช่อง** — rev เป็น immutable ⇒ ช่องแรกเขียนแล้วช่องสองตีกลับ
// = ราคาครึ่งชุดค้างทะเบียน และกดซ้ำได้ rev ซ้ำ · ที่ยังพลาดได้หลังผ่านด่านคือคำขอสะดุดกลางทาง
// (ไม่มี transaction ข้ามหลายช่อง) — rev ที่เขียนแล้วยังถูกต้องทุกตัว แค่ต้องกดใส่ช่องที่เหลืออีกครั้ง
// คืน `[{ slot, price, source, revision }]` ตามลำดับที่ส่งมา
export async function priceRegistrySlots(supabase, {
  entries = [], loadSource, validUntil = null, note = null, askItemId = null, user = null,
}) {
  const sources = new Map();
  for (const { slot } of entries) {
    const key = `${slot.stampColumn}:${slot.id}`;
    if (sources.has(key)) continue;
    const { source, error } = await loadSource(slot);
    if (error || !source) {
      const failure = new Error(error || `ไม่พบ${slot.registry}ในทะเบียน`);
      failure.status = 400;
      throw failure;
    }
    sources.set(key, source);
  }
  const written = [];
  for (const entry of entries) {
    const source = sources.get(`${entry.slot.stampColumn}:${entry.slot.id}`);
    const { revision } = await priceRegistryEntry(supabase, {
      kind: entry.slot.kind,
      stampColumn: entry.slot.stampColumn,
      source,
      price: entry.price,
      validUntil,
      note,
      askItemId,
      user,
    });
    written.push({ ...entry, source, revision });
  }
  return written;
}

// ── ใส่ราคา F/FB ให้กลิ่น/สูตรในทะเบียน ─────────────────────────────────
//
// ⭐ **ทางเข้าราคา RM มีกี่ทาง ก็ต้องผ่านก้อนนี้ก้อนเดียว** — ตอนนี้มีสองทาง:
// ขั้นใส่ราคาบนคำร้องสายพัฒนา (price/route.js) และปุ่มใส่ราคาบนหน้าทะเบียน
// กลิ่น/สูตร · เขียนแยกกันเมื่อไร ตัวตนวัสดุ/การประทับ pointer จะเพี้ยนหากัน
// (โรคเดียวกับฟอร์มสร้าง/แก้ใน AGENTS.md)
//
// กลไก: วัสดุ 1 ตัวต่อกลิ่น/สูตร (ensureMaterial หาตัวเดิมจากตัวตน ชนิด+ชื่อ+ลูกค้า)
// → ประทับ `scentId`/`formulaId` ครั้งแรกครั้งเดียว (ห้ามทับ — ประวัติราคาชี้ตัวผิด
// ย้อนหลังทั้งชุด) → ต่อ rev ใหม่ผ่าน RPC
//
// ⚠️ F/FB **ไม่มีชั้นจำนวน** (มติผู้ใช้ 2026-08-03) — ราคาเดียวต่อ กก.
// คืน { material, revision }
export async function priceRegistryEntry(supabase, {
  kind,               // 'RM_F' (กลิ่น) | 'RM_FB' (สูตร)
  stampColumn,        // 'scentId' | 'formulaId'
  source,             // แถวจากทะเบียนกลิ่น/สูตร — ใช้ name + customerId/Name
  price,
  validUntil = null,
  note = null,
  askItemId = null,
  user = null,
}) {
  const material = await registryEntryMaterial(supabase, { kind, stampColumn, source, user });

  if (!material[stampColumn]) {
    const { error: stampError } = await supabase.from('material_prices')
      .update({ [stampColumn]: source.id, updatedAt: new Date().toISOString() })
      .eq('id', material.id);
    if (stampError) throw stampError;
  }

  const { revision } = await appendMaterialRevision(supabase, {
    materialId: material.id,
    kind,
    price,
    validUntil,
    note,
    askItemId,
    user,
  });
  return { material, revision };
}

// ── เคสขอราคาวัสดุ (mig 0158) ──────────────────────────────────────────
// โหลดเคส + รายการ + ชั้นจำนวนที่ขอ เป็นก้อนเดียว (กัน N+1)
/**
 * @param lean  ข้ามการเติมข้อมูลที่มีไว้ให้ "จอ" อ่าน (ชื่อ/รหัสโครงการ · รหัส AR)
 *
 * ⭐ สำหรับผู้เรียกที่ **นับ** ไม่ใช่ **แสดง** — `/api/nav/counts` ยิงทุก 2 นาที
 * ต่อคนต่อแท็บ และเรียกฟังก์ชันนี้ถึง 3 รอบ (คำร้องของฉัน · คิวฝ่ายฉัน · คิว RD)
 * ⇒ query สองตัวท้ายถูกยิงซ้ำ 3 รอบเพื่อเติมข้อความที่ไม่มีใครอ่านสักตัว
 * วัดบนพรีวิว: 16 query · ~340ms ต่อการเรียกหนึ่งครั้ง
 *
 * ⚠️ **ตัดได้แค่ของที่ตัวกรองแถวไม่แตะเท่านั้น** — `items` ยังต้องมาเสมอ เพราะ
 * `requestNextStep` อ่านมันเพื่อตัดสินว่า "ใบนี้รอใคร" ⇒ ตัวนับกับหน้าคิวยังกรอง
 * ด้วย helper ชุดเดียวกันบนข้อมูลชุดเดียวกัน (กติกาของ lib/nav/navCounts.js)
 * ⚠️ ห้ามใช้กับผู้เรียกที่ส่งแถวลงจอ — คิวจะได้หัวกลุ่มเป็น uuid และไม่มีรหัส AR
 */
export async function loadRequests(supabase, {
  id = null, dept = null, status = null, requestedById = null, team = null, lean = false,
} = {}) {
  /* ⭐ **ทุกการอ่านในตัวโหลดนี้โตตามจำนวนใบ** (2026-09-11) — ใบคำร้อง 74 → 188 ใน 26 วัน
     · หัวใบ: เพดาน Max rows 1,000 แถว (เกินแล้วได้ไม่ครบโดยไม่มี error) ⇒ ไล่หน้าด้วย `fetchAll`
     · แถว/โครงการ/ลูกค้า/ดีล: ลิสต์ id เข้า `.in()` ⇒ URL ยาวตามจำนวนใบ · แถวคำร้องวัดจริง 188 ใบ
       = 7,985 ไบต์ จากเพดาน 14,000 (`POSTGREST_URL_LIMIT`) ⇒ ชนที่ ~330 ใบ ≈ กลางเดือน ต.ค. 69
       แล้วคิว "ทั้งหมด" ของแอดมิน + ป้ายตัวเลขบนเมนู (`loadVisibleRequests` ตัวเดียวกัน) ล้มทั้งคู่
       ⇒ ซอยลิสต์ข้างนอก ไล่หน้าข้างใน (`fetchAllInChunks` · lib/supabaseInChunks.js) */
  const asks = await fetchAll(() => {
    let query = supabase.from('dept_requests').select('*');
    if (id) query = query.eq('id', id);
    if (dept) query = query.eq('dept', dept);
    if (status?.length) query = query.in('status', status);
    if (requestedById) query = query.eq('requestedById', requestedById);
    // ⚠️ ขอบเขต "ทีม" กรองที่นี่ ไม่ใช่ที่จอ (กับดักข้อ 9) — กรองที่จอแปลว่าคำร้อง
    // ของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จากแท็บ Network
    // `team` รับได้ทั้งทีมเดียวและอาร์เรย์ — คนเปิดคิวอยู่ได้หลายทีม (scopeFilter)
    if (team) query = Array.isArray(team) ? query.in('team', team) : query.eq('team', team);
    // ⚠️ `id` ต่อท้ายให้ลำดับนิ่งข้ามหน้า (กติกาของ fetchAll) — ใบที่สร้างวินาทีเดียวกันมีจริง
    return query.order('createdAt', { ascending: false }).order('id', { ascending: true });
  });
  if (!asks.length) return [];

  // PostgREST เรียงต่อก้อน ไม่ได้เรียงทั้งชุด ⇒ เรียงซ้ำหลังรวม (ลำดับแถวในใบ = sortOrder)
  const rawItems = await fetchAllInChunks(
    asks.map((a) => a.id),
    (chunk) => supabase.from('dept_request_items').select('*').in('requestId', chunk)
      .order('sortOrder', { ascending: true }).order('id', { ascending: true }),
    { sort: byColumns('sortOrder', 'id') },
  );
  /* ⭐ **ราคาที่ใส่แล้วติดมากับแถว** (ผู้ใช้ 2026-09-22: "ในหน้ารายการคำร้อง … ไม่ได้โชว์ราคาเลย") — ตัวเดียวกับ
     หน้าใบเดียว (`attachRowPrice`) ⇒ คิวกับหน้ารายละเอียดพูดเลขเดียวกัน · ยิงเฉพาะแถวที่มีราคา (ส่วนน้อยมาก) */
  // ⚠️ โหมด `lean` (ตัวนับบนเมนู · poll ถี่) ไม่ต้องใช้ราคา — ข้ามสามคำสั่งอ่านทะเบียนวัสดุ
  const items = lean ? rawItems : await attachRowPrice(supabase, rawItems);

  /* ⭐ **แถวสินค้า PDR ของใบ NPD ที่คิวต้องใช้ตัดสิน "ตาใคร"** (ม-144 · รีวิวรอบ 5–6) — สินค้าที่ยังไม่มีแถวงาน
     (`npdUncoveredPairs`) คืองานของฝ่าย · ไม่ดึง ⇒ ป้ายขึ้นตาผู้ขอ ("รอปิดเรื่อง"/"รอ SA ทำต่อ") แล้วหลุดจากคิว
     ของฝ่าย ทั้งที่ฝ่ายคือคนเดียวที่ซ่อมได้
     ⚠️ ดึงเฉพาะใบที่คำตอบเปลี่ยนได้จริง = เงื่อนไขเดียวกับจุดที่ `requestNextStep` เช็ค: รับเรื่องแล้ว ยังไม่มีตรา
        (มีตรา ⇒ คิวตอบจากตราก่อน) และไม่มีแถวรอฝ่าย (มี ⇒ ตาฝ่ายอยู่แล้ว) · แถวรอผู้ขอยังนับ (ฝ่ายมาก่อน)
        ⇒ ปกติชุดนี้ว่าง ไม่มี query เพิ่ม · ใบเดียว (`findRequest`) ไม่ดึง — มันโหลดแถวสินค้าเต็มของตัวเองทับ */
  const itemsOf = (requestId) => (items || []).filter((i) => i.requestId === requestId);
  const npdCandidateIds = id ? [] : asks.filter((a) => {
    if (!requestUsesDeliveredRows(a) || !requestPdrRowsPickScent(a)) return false;
    if (a.status !== 'acknowledged' || a.answeredAt || a.closedAt) return false;
    const rows = itemsOf(a.id);
    return rows.length > 0 && requestRowSummary(rows).waitingDept === 0;
  }).map((a) => a.id);
  let npdTargets = [];
  if (npdCandidateIds.length) {
    /* ⚠️ ดึงให้ครบทุกหน้า เรียงนิ่ง (รีวิวรอบ 7) — เพดานคิดจาก 20 แถวต่อใบใช้ไม่ได้: ก้าวบันทึกแบบฟอร์มเขียนชุดใหม่
       ก่อนลบชุดเดิม ⇒ ใบที่ลบไม่สำเร็จมีได้ 40 แถว แล้วตัดแบบไม่เรียงทำให้อีกใบได้ targets ว่างเงียบ ๆ */
    // ซอยลิสต์ใบด้วย — ใบ NPD ที่เข้าเงื่อนไขโตตามจำนวนใบเหมือนกัน (ผลเข้า filter รายใบ ไม่ต้องเรียงซ้ำ)
    npdTargets = await fetchAllInChunks(npdCandidateIds, (chunk) => supabase.from('dept_request_pdr_targets')
      .select('id, requestId, categoryCode, scentId').in('requestId', chunk).order('id'));
  }
  const npdCandidates = new Set(npdCandidateIds);

  /* ⭐ **ชื่อโครงการมาด้วยตั้งแต่ตอนโหลดคิว** (มติผู้ใช้ 2026-08-11) — คิวจัดกลุ่ม
     ตามโครงการได้แล้ว แต่แถวเก็บแค่ `projectId` ⇒ หัวกลุ่มจะเป็น uuid ที่ไม่มีใคร
     อ่านออก · `findRequest` โหลดโครงการอยู่แล้วแต่นั่นคือตอนเปิด **ใบเดียว**
     ⚠️ **คิวรวมเดียว ไม่ใช่ N+1** — คิวหนึ่งหน้ามีได้ 100+ ใบ · ดึงรายใบแปลว่า
     100 query ต่อการเปิดหน้าหนึ่งครั้ง (โรคที่หน้านี้เพิ่งถอด 8 endpoint ทิ้งไป) */
  const projectIds = lean ? [] : [...new Set(asks.map((a) => a.projectId).filter(Boolean))];
  let projects = [];
  if (projectIds.length) {
    // ซอยลิสต์ — โครงการที่ไม่ซ้ำโตตามจำนวนใบ (ผลเข้า Map ไม่ต้องเรียงซ้ำ)
    projects = await fetchAllInChunks(projectIds, (chunk) => supabase
      .from('projects').select('id, code, name').in('id', chunk).order('id'));
  }
  const projectById = new Map(projects.map((p) => [p.id, p]));

  /* ⭐ **รหัสลูกค้า (AR) มาด้วยตั้งแต่ตอนโหลดคิว** (มติผู้ใช้ IS-26080003) — คิวจัดกลุ่ม
     ตามลูกค้าได้ และแถวโชว์ชื่อกิจการอยู่แล้ว แต่รหัสคือตัวที่เชื่อมกับรหัสกลิ่น/MU
     ⚠️ **อ่านสดจากทะเบียนเสมอ ไม่ประทับลงแถวคำร้อง** — `customerName` ที่แถวเก็บไว้คือ
     ชื่อ ณ วันที่ผูก (หลักฐาน) ส่วนรหัสเป็นตัวชี้กลับทะเบียน ต้องเป็นค่าปัจจุบัน
     ⚠️ รวมเป็น query เดียวเหมือนโครงการ — ดึงรายใบ = 100 query ต่อการเปิดคิวหนึ่งครั้ง */
  const customerIds = lean ? [] : [...new Set(asks.map((a) => a.customerId).filter(Boolean))];
  let customers = [];
  if (customerIds.length) {
    // ⚠️ id ลูกค้ายาว 40 ตัวอักษร (CUS-uuid) — ชนเพดาน URL เร็วกว่าตารางอื่นเกือบเท่าตัว
    customers = await fetchAllInChunks(customerIds, (chunk) => supabase
      // `brands` = ทะเบียนแบรนด์ของลูกค้า — ใช้แปลงรหัสแบรนด์ที่ดีลเก็บไว้เป็นชื่อ
      // สองภาษา (`brandDisplayFromList`) · ดีลเก็บแค่ข้อความที่ผู้ใช้เลือกตอนนั้น
      .from('customers').select('id, "arCode", brands').in('id', chunk).order('id'));
  }
  const arById = new Map(customers.map((c) => [c.id, String(c.arCode || '').trim() || null]));
  const brandsById = new Map(customers.map((c) => [c.id, c.brands]));

  /* ⭐ **แบรนด์มาด้วยตั้งแต่ตอนโหลดคิว** (มติผู้ใช้ 2026-08-17) — ตารางคำร้องโชว์
     รหัส AR / ชื่อกิจการ / แบรนด์ เป็นก้อนเดียวเหมือนตาราง QT/SO · แบรนด์ไม่ได้อยู่
     บนคำร้อง มันเป็นของ **ดีลต้นทาง** (`metadata.brand` — ที่เดียวกับที่หน้ารายการ
     ดีลอ่าน) ⇒ ใบที่ไม่ผูกดีลไม่มีแบรนด์ ซึ่งถูกแล้ว
     ⚠️ query เดียวเหมือนโครงการ/ลูกค้า — ดึงรายใบ = 100 query ต่อการเปิดคิวหนึ่งครั้ง */
  const dealIds = lean ? [] : [...new Set(asks.map((a) => a.dealId).filter(Boolean))];
  let deals = [];
  if (dealIds.length) {
    deals = await fetchAllInChunks(dealIds, (chunk) => supabase
      .from('sales_deals').select('id, metadata, code, title').in('id', chunk).order('id'));
  }
  const brandByDeal = new Map(deals.map((d) => [d.id, String(d.metadata?.brand || '').trim()]));
  // ⭐ ดีลเป็นคอลัมน์ของตัวเองในคิวแล้ว (มติผู้ใช้ 2026-08-20) — query เดิมอยู่แล้ว
  // (ดึงมาทำแบรนด์) แค่ขอสองคอลัมน์เพิ่ม ⇒ ไม่มี query เพิ่มสักตัว
  const dealById = new Map(deals.map((d) => [d.id, d]));

  // ⚠️ เดิมมีขั้นดึง `dept_request_item_tiers` มาแปะรายแถว — ตารางถูก DROP ใน
  // mig 0219 พร้อมหัวข้อขอราคา (ม-28) · ราคาในโมเดลใหม่เป็นราคาเดียวต่อแถว
  return asks.map((a) => ({
    ...a,
    items: itemsOf(a.id),
    ...(npdCandidates.has(a.id) ? { targets: npdTargets.filter((t) => t.requestId === a.id) } : {}),
    // แบนเป็นสองช่อง ไม่ใช่ก้อน `project` ซ้อน — แถวคิวถูกส่งลงจอตรง ๆ และของซ้อน
    // ชั้นทำให้ต้องเช็ค null สองชั้นทุกที่ที่อ่าน
    projectCode: projectById.get(a.projectId)?.code ?? null,
    projectName: projectById.get(a.projectId)?.name ?? null,
    customerArCode: arById.get(a.customerId) ?? null,
    // ชื่อแบรนด์ที่คนอ่านออก (TH · EN) — ดีลเก็บข้อความดิบ ทะเบียนของลูกค้าเป็นตัวแปล
    customerBrand: brandDisplayFromList(brandsById.get(a.customerId), brandByDeal.get(a.dealId)) || null,
    dealCode: dealById.get(a.dealId)?.code ?? null,
    dealName: dealById.get(a.dealId)?.title ?? null,
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
  // ⭐ แถวข้อ 2.2/2.3 (mig 0229) — ต้นทุน F/FB ต่อกิโล และราคาขายต่อชิ้น รายสินค้า
  // ⚠️ โหลดคู่กับบรีฟตรงนี้ เพราะทั้งจอสรุปและ **เอกสาร** อ่านจากก้อนเดียวกัน ·
  // เอกสารเป็นฟังก์ชันบริสุทธิ์ที่โหลดเองไม่ได้ (เหตุผลเดียวกับ `pdrContext` ข้างล่าง)
  const { data: targets, error: targetError } = await supabase
    .from('dept_request_pdr_targets').select('*').eq('requestId', id)
    .order('sortOrder', { ascending: true });
  if (targetError) throw targetError;
  /* ⭐ ข้อ 2.1 กลิ่นรายสินค้า (mig 0352 · พัฒนาสูตร NPD) — จอ/เอกสารโชว์ **รหัส · ชื่อ**
     ไม่ใช่ id · อ่านสดจากทะเบียน ไม่ประทับลงแถว (กติกาเดียวกับรหัส ZN ข้างล่าง)
     ⚠️ ตามกลับไม่เจอ = null แล้วจอบอกตรง ๆ · FK เป็น RESTRICT จึงไม่ควรเกิด */
  const targetScentIds = [...new Set((targets || []).map((t) => t.scentId).filter(Boolean))];
  if (targetScentIds.length) {
    const { data: scentRows, error: scentError } = await supabase
      .from('scents').select('id, code, name').in('id', targetScentIds);
    if (scentError) throw scentError;
    const byId = new Map((scentRows || []).map((x) => [x.id, x]));
    for (const t of targets) {
      const scent = t.scentId ? byId.get(t.scentId) : null;
      t.scentCode = scent?.code || null;
      t.scentName = scent?.name || null;
    }
  }
  /* ⭐ พื้นที่ที่ต้องประเมิน (mig 0314) — ของ **ใบ** ไม่ใช่ของทะเบียนโซน
     ⚠️ โหลดคู่กับบรีฟด้วยเหตุผลเดียวกัน: ทั้งจอ TS และจอ SA อ่านก้อนเดียวกัน
     ⚠️ **โหลดเฉพาะตอนเปิดใบเดียว** — คิวโชว์จำนวนจาก `surveyZoneCount` ที่ประทับ
        ไว้บนแถวไม่ได้ (ไม่มีคอลัมน์นั้น) ⇒ คิวไม่โชว์จำนวน แทนที่จะยิงรายใบ 100 ครั้ง */
  /* ⚠️ **เฉพาะใบประเมิน** — ของเดิมยิงทุกใบทุกหัวข้อแล้วได้ 0 แถวเสมอ = คำสั่งส่วนเกิน
     หนึ่งครั้งต่อการเปิดใบ ทั้งที่ 5 หัวข้อจาก 6 ไม่มีทางมีแถวนี้เลย */
  let surveyZones = [];
  if (row.kind === 'site_survey') {
    const { data, error: surveyError } = await supabase
      .from('service_survey_zones').select('*').eq('requestId', id)
      .order('sortOrder', { ascending: true }).order('id', { ascending: true });
    if (surveyError) throw surveyError;
    surveyZones = data || [];
  }
  /* ⚠️ **รหัส ZN ต้องมาด้วย ไม่ใช่ id ดิบ** — จอโชว์ "รหัส · ชื่อ" ตามกติกาของทั้งระบบ
     · แถวเก็บแค่ `zoneId` ซึ่งเป็น id ภายใน (SZN-…) ที่ไม่มีใครอ่านออก
     ⚠️ อ่านสดจากทะเบียน ไม่ประทับลงแถว — รหัสเป็นตัวชี้กลับทะเบียน (กติกาเดียวกับ AR) */
  const surveyZoneIds = [...new Set(surveyZones.map((z) => z.zoneId).filter(Boolean))];
  if (surveyZoneIds.length) {
    const { data: zoneRows, error: zoneError } = await supabase
      .from('service_zones').select('id, code, floor').in('id', surveyZoneIds);
    if (zoneError) throw zoneError;
    const zoneById = new Map((zoneRows || []).map((z) => [z.id, z]));
    for (const row of surveyZones) {
      const zone = row.zoneId ? zoneById.get(row.zoneId) : null;
      row.zoneCode = zone?.code || null;
      /* ⭐ ชั้นของโซนในทะเบียน — แถวผลวัดเก็บ `floor` เฉพาะพื้นที่ที่ SA เพิ่มใหม่ (mig 0315)
         ⇒ โซนที่เลือกจากทะเบียนต้องอ่านชั้นจากทะเบียน ไม่งั้นตารางหน้าคำร้องขึ้นขีดทุกแถว */
      row.zoneFloor = zone?.floor || null;
    }
  }
  /* ป้ายสถานที่ — จอโชว์ **รหัส SS · ชื่อ** ไม่ใช่ id (กติกา entity display)
     ⚠️ อ่านสดจากทะเบียน ไม่ประทับลงใบ — ไซต์ถูกเปลี่ยนชื่อแล้วใบต้องพาไปหาที่ถูก */
  /* ⚠️ **โหลดเฉพาะใบประเมิน** — เช็คชนิดก่อน ไม่ใช่เช็คว่ามี `siteId` ไหม
     หัวข้ออื่นไม่มีคอลัมน์นี้อยู่แล้ว แต่การถามชนิดทำให้อ่านออกว่าทำไมถึงโหลด */
  let surveySite = null;
  let surveyVisit = null;
  let surveyVisits = [];
  if (row.kind === 'site_survey' && row.siteId) {
    /* ⭐ **ช่วงเวลาที่ไซต์ให้เข้า + เขต** (หน้าคำร้องแบบไทม์ไลน์ · มติเจ้าของ 25/09) — โมดัลลงคิวบนหน้านี้
       เคยบอกด่าน ④ ว่า "หน้านี้ไม่เห็นช่วงเข้าไซต์" เพราะ select ไม่มีสี่ช่องนี้ · ตอนนี้เห็นเท่าหน้าจัดคิว
       ⚠️ อ่านพลาดต้องโยน ไม่ใช่กลืน — ของเดิม `const { data }` ทำให้ "อ่านไม่สำเร็จ" หน้าตาเหมือน "ไม่มีไซต์" */
    const { data, error: siteError } = await supabase
      .from('service_sites')
      .select('id, code, name, address, "customerName", "routeZone", "mapUrl", "contactName", "contactPhone", "accessFrom", "accessTo", "accessDays", "accessNote"')
      .eq('id', row.siteId).maybeSingle();
    if (siteError) throw siteError;
    surveySite = data || null;
    /* ⭐ **นัดของเจ้าหน้าที่ที่ผูกกับใบนี้ — ทุกรอบ** (เฟส 2 → หน้าคำร้องแบบไทม์ไลน์)
       ⚠️ หนึ่งใบมี **นัดที่ยังมีชีวิตได้ใบเดียว** (index mig 0316) แต่มีนัดที่จบไปแล้ว
          กี่ใบก็ได้ (ไปแล้วเข้าไม่ได้ → นัดใหม่) ⇒ อ่านทุกรอบครั้งเดียว แล้วเลือกตัวแทนด้วย
          `pickSurveyVisit` — กติกาเดียวกับหน้าจัดคิวและ route ส่งผล (นัดที่ยังมีชีวิตก่อน)
       🐞 เอาแถวล่าสุดเฉย ๆ ไม่พอ — นัดที่ปิดแล้วถูกเปิดกลับได้จากโมดัลนัด ⇒ แถวที่ยังมีชีวิต
          เก่ากว่าแถวที่ปิดได้ · จอที่เห็นแถวที่ปิดจะโชว์ "ลงคิวใหม่" ซึ่ง server ตีกลับ 409
       ⚠️ เวลาเริ่ม/ส่งงานจริง (`actual*`) + ผู้ช่วย อยู่บนนัดเท่านั้น — เธรดของใบไม่มีเหตุการณ์
          "เริ่มงาน" และ SA อ่านเธรดของนัดไม่ได้ ⇒ ขั้น "เข้าพื้นที่" ต้องอ่านจากที่นี่
       ⚠️ เพดาน 20 รอบ (ratchet check:rowcap) — ใบที่ไปแล้วเข้าไม่ได้ยี่สิบรอบคือใบที่ต้องปิด
       ⚠️ อ่านพลาดต้องโยน — ของเดิมกลืน error แล้วใบที่มีนัดอ่านเป็น "ไม่มีนัด" = ปุ่ม "ลงคิวใหม่" โผล่ */
    const { data: visitRows, error: visitError } = await supabase
      .from('service_visits')
      .select('id, code, status, "requestId", "scheduledDate", "startTime", "endTime", "assigneeId", "assigneeName", "assistantIds", "actualDate", "actualStartTime", "actualEndTime", "actualEndDate", "unableReason", "createdByName", "createdAt"')
      .eq('requestId', id)
      .order('createdAt', { ascending: false })
      .limit(20);
    if (visitError) throw visitError;
    surveyVisits = visitRows || [];
    surveyVisit = pickSurveyVisit(surveyVisits);
  }
  const withBriefs = {
    ...row,
    briefs: briefs || [],
    targets: targets || [],
    surveyZones,
    surveySite,
    surveyVisit,
    surveyVisits,
  };

  // ⭐ ค่าที่แบบฟอร์ม PDR เติมให้เอง (ผู้ดูแล AE · ผู้ประสานงาน AC · ผู้ติดต่อลูกค้า)
  //
  // ⚠️ **ประกอบที่ server** ไม่ใช่ให้แต่ละจอไปโหลดเอง — จอแสดงกับเอกสารต้องได้ชื่อ
  // ชุดเดียวกันเสมอ · และเอกสารเป็นฟังก์ชันบริสุทธิ์ที่โหลดอะไรเองไม่ได้อยู่แล้ว
  // ⚠️ โหลดเฉพาะใบเดียวตอนเปิด ไม่ใช่ตอนโหลดคิวทั้งชุด (คิวไม่ได้ใช้ค่าพวกนี้)
  const [project, customer, deal] = await Promise.all([
    withBriefs.projectId
      // name/code เพิ่มมาเพื่อการ์ดบริบทบน panel (ม-94) — โหลดใบเดียวตอนเปิดอยู่แล้ว
      ? supabase.from('projects').select('id, code, name, "aeOwner", "acOwner"').eq('id', withBriefs.projectId)
        .maybeSingle().then((r) => r.data)
      : null,
    withBriefs.customerId
      // ⚠️ `arCode` เพิ่มมาเพื่อหัวใบ (ม-98) — ใบเก็บแค่ `customerName` ตอนเปิด
      // รหัสลูกค้าอยู่ที่ทะเบียนที่เดียว ไม่ประทับลงใบ (ดูเหตุผลใน headerFacts.js)
      /* ⭐ ที่อยู่ 4 คอลัมน์ — PDR 1.7 "ที่อยู่ลูกค้า" อ่านสดจากทะเบียน (มติผู้ใช้ 2026-09-11)
         ⚠️ ต้องครบทั้งลิสต์ใหม่และคอลัมน์สำเนาเดิม — `customerAddresses` ถอยไปอ่านสำเนา
         เมื่อลูกค้ายังไม่มี `addresses` · ขาดตัวไหน = ลูกค้ากลุ่มนั้นได้ 1.7 ว่างเงียบ ๆ
         ⚠️ ใช้ประกอบข้อความใน `pdrContext` เท่านั้น — ไม่ส่งออกทาง `refCustomer` */
      // ⭐ `isForeign` — PDR 1.8 ไทย/ต่างชาติ อ่านจากทะเบียน (มติผู้ใช้ 2026-09-23) · ขาดคอลัมน์นี้ = ทุกใบขึ้น "ลูกค้าไทย"
      ? supabase.from('customers').select('id, name, "nameEn", "arCode", "isForeign", contacts, "contactPerson", "contactPhone", addresses, address, "shippingAddress", "branchCode"')
        .eq('id', withBriefs.customerId).maybeSingle().then((r) => r.data)
      : null,
    withBriefs.dealId
      // ⚠️ `title` ต้องมาด้วย — เอกสาร PDR พิมพ์ช่อง "โครงการ" เป็น **ชื่อดีล**
      // ไม่ใช่รหัส · รหัสอย่างเดียว RD อ่านแล้วไม่รู้ว่างานอะไร
      ? supabase.from('sales_deals').select('id, code, title').eq('id', withBriefs.dealId)
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

  // ⚠️ ทะเบียนหมวดสินค้า — ช่อง "ประเภทสินค้า" (PDR 1.11) เก็บรหัสล้วน · โหลดที่นี่
  // ที่เดียวแล้วส่งเข้า context ⇒ ทั้งจอสรุปและเอกสารที่ออกจริงได้ชื่อชุดเดียวกัน
  const { data: categories } = await supabase
    .from('product_types').select('"mainCategoryCode", "typeCode", "nameTh", "nameEn"');

  withBriefs.pdrContext = pdrContext({
    request: withBriefs, project, customer, deal, briefs: briefs || [], salesOrderLines,
    categories: categories || [],
    // 1.12 ของใบที่ไม่มีใบสั่งขาย (พัฒนาสูตร NPD) นับกลิ่นจากแถวสินค้า
    targets: targets || [],
  });

  // ราคาติดมาแล้วจาก `loadRequests` (ตัวเดียวกัน) — ไม่ยิงซ้ำ (รีวิว ม-148 รอบสอง)
  const items = withBriefs.items || [];
  /* ⭐ แถวงานต้นทางของพัฒนาสูตร NPD ที่มีไฟล์แนบ (ม-144) — แบบฟอร์ม PDR ถอนแถวพวกนี้ไม่ได้ (ถอน = กวาดไฟล์)
     ⇒ จอต้องรู้ก่อนกดบันทึก ไม่งั้นหัวใบบันทึกไปแล้วค่อยโดนตีกลับที่ก้าวแบบฟอร์ม (บันทึกครึ่งเดียว)
     ⚠️ ถามเฉพาะใบที่มีแถวแบบนี้ · ≤ 20 แถว ⇒ `.in()` ปลอดภัย · `.limit` = ขอบเขตชัด (check:rowcap) */
  const npdRootIds = requestUsesDeliveredRows(withBriefs) && requestPdrRowsPickScent(withBriefs)
    ? items.filter((i) => i.lineKind === 'product_dev' && !i.derivedFromItemId).map((i) => i.id)
    : [];
  if (npdRootIds.length) {
    const { data: files, error: filesError } = await supabase.from('attachments')
      .select('entityId').eq('entityType', 'dept_request_item').in('entityId', npdRootIds).limit(1000);
    if (filesError) throw filesError;
    const withFiles = new Set((files || []).map((f) => f.entityId));
    for (const item of items) if (withFiles.has(item.id)) item._hasFiles = true;
  }

  // ── ป้ายอ้างอิง QT/SO (ม-88) — จอโชว์ **เลขที่** ไม่ใช่ id ────────────────
  // โหลดเฉพาะตอนเปิดใบเดียว · ตามกลับไม่เจอ (ใบถูกลบ) = คืน null แล้วจอบอกตรง ๆ
  /* ⭐ **ตัวตนสำหรับออกบิลเดินมากับ QT** (ม-96) — หัวข้อขอเอกสารการเงินเปิดใบมา
     เพื่อ *ออกบิล* ⇒ ชื่อ/ที่อยู่ออกบิล · เลขผู้เสียภาษี · สาขา คือของที่บัญชีต้องใช้
     ก่อนพิมพ์เอกสาร · ไม่ส่งมาด้วย = ต้องเปิดใบเสนอราคาอีกแท็บทุกครั้ง
     ⚠️ อ่านจาก **QT** ไม่ใช่ทะเบียนลูกค้า — QT เป็น snapshot ที่ลูกค้าเซ็นรับแล้ว
     ส่วนทะเบียนแก้ทีหลังได้ ⇒ ออกบิลตามทะเบียนวันนี้อาจไม่ตรงกับที่ตกลงกันไว้ */
  const [refQuotation, refSalesOrder] = await Promise.all([
    withBriefs.quotationId
      ? supabase.from('quotations')
        .select('id, "quoteNumber", "customerName", "customerTaxId", "billingAddress", "branchCode", "totalAmount"')
        .eq('id', withBriefs.quotationId).maybeSingle().then((r) => r.data)
      : null,
    withBriefs.salesOrderId
      ? supabase.from('sales_orders').select('id, "orderNumber"')
        .eq('id', withBriefs.salesOrderId).maybeSingle().then((r) => r.data)
      : null,
  ]);

  /* ⭐ **งวดชำระที่ใบนี้ถูกแขวนไว้** (ม-96 · ฝั่งกลับของ B-5) — B-5 ทำลิงก์ไว้ทางเดียว
     (จากใบสั่งขายเห็นคำร้อง) ⇒ บัญชีที่เปิดใบจากคิวไม่รู้เลยว่าใบนี้ผูกกับงวดไหน
     ⚠️ ค้นด้วย `billingRequestId` ซึ่งไม่มี FK (โดยเจตนา · 0260) — ไม่เจอ = ยังไม่ผูก
     ไม่ใช่ข้อมูลเสีย */
  let linkedInstallment = null;
  if (withBriefs.kind === 'billing_doc') {
    const { data: inst } = await supabase
      .from('sales_order_installments')
      .select('id, seq, label, amount, "dueDate", status, "salesOrderId"')
      .eq('billingRequestId', withBriefs.id).maybeSingle();
    if (inst) {
      const { data: order } = await supabase
        .from('sales_orders').select('id, "orderNumber"').eq('id', inst.salesOrderId).maybeSingle();
      linkedInstallment = { ...inst, orderNumber: order?.orderNumber || null };
    }
  }

  // การ์ดบริบทบน panel (ม-94) — โครงการ/ดีลที่ใบนี้เกาะอยู่ พร้อมป้ายชื่อจริง
  // (จอทำลิงก์เอง — id อย่างเดียวกดไปได้แต่บอกไม่ได้ว่าคือใบไหน)
  return {
    ...withBriefs, items, salesOrderLines, refQuotation, refSalesOrder, linkedInstallment,
    refProject: project ? { id: project.id, code: project.code, name: project.name } : null,
    refDeal: deal,
    // ⚠️ เลือกฟิลด์ทีละตัว ไม่ส่ง `customer` ทั้งแถว — ทะเบียนลูกค้ามีที่อยู่ เครดิต
    // และรายชื่อผู้ติดต่อทั้งชุด ซึ่งหน้าคำร้องไม่ได้ใช้และไม่ควรหลุดออกทาง response
    refCustomer: customer
      ? {
        id: customer.id,
        arCode: customer.arCode || null,
        // ลูกค้าที่มีแต่ชื่ออังกฤษต้องไม่กลายเป็นการ์ดไร้ชื่อบน panel
        name: customerNameIn(customer) || null,
        contactPerson: customer.contactPerson || null,
        contactPhone: customer.contactPhone || null,
      }
      : null,
  };
}

// ── ราคาที่ออกจากแถวนี้ — ให้ใบคำร้องแสดงย้อนกลับได้ ──────────────────────
//
// 🐞 **ช่องว่างข้อ 5 ของแบบพัฒนาสูตร**: RD ใส่ราคาเสร็จ แถวขึ้นว่า "เสร็จ" แต่
// **ในใบไม่มีตัวเลขให้เห็นเลย** — rev ไปอยู่ในทะเบียนวัสดุอย่างเดียว ⇒ คนที่เปิดใบมา
// อ่านย้อนหลังไม่รู้ว่าตกลงราคาเท่าไร ต้องไปเปิดทะเบียนแล้วเดาว่าแถวไหนของใคร
//
// ⚠️ **ตามจาก `answeredRevisionId` บนแถว** — ขั้นราคาประทับไว้แล้วตอนบันทึกสำเร็จ
// (price/route.js) ซึ่งชี้ rev ที่ถูกต้องตรง ๆ · ตามจากชื่อวัสดุจะได้ราคาของรอบอื่น
// ที่ใช้วัสดุเดียวกันปนมา
//
// ⚠️ อ่านอย่างเดียว ไม่ใช่แหล่งความจริงใหม่ — ทะเบียนวัสดุยังเป็นเจ้าของราคาเหมือนเดิม
async function attachRowPrice(supabase, items) {
  const priced = items.filter((i) => i.answeredRevisionId);
  if (!priced.length) return items;

  /* ⭐ ม-148 — แถวสูตรใส่ได้ F · B · FB ในจังหวะเดียว · แถวชี้ rev ช่องหลักตัวเดียว (`answeredRevisionId`)
     ช่องอื่นหาจาก `sourceAskItemId` ที่ขั้นใส่ราคาประทับไว้ทุก rev ⇒ ไม่ต้องมีคอลัมน์ใหม่
     ⚠️ ตัวนี้ถูกเรียกทั้งหน้าใบเดียวและ **คิวทั้งหน้า** (หลายร้อยใบ · ผู้ใช้ 2026-09-22 ขอให้หน้ารายการโชว์ราคา)
     ⇒ ทุก `.in()` ซอยเป็นก้อน (fetchAllInChunks · กับดัก 16 KB) */
  const REV_COLUMNS = 'id, "materialId", "revisionNo", "validUntil", note, "quotedAt", "quotedByName", "sourceAskItemId"';
  const bySource = await fetchAllInChunks(
    priced.map((i) => i.id),
    (chunk) => supabase.from('material_price_revisions').select(REV_COLUMNS)
      .in('sourceAskItemId', chunk).order('id'),
  );
  const knownIds = new Set(bySource.map((r) => r.id));
  const missing = [...new Set(priced.map((i) => i.answeredRevisionId))].filter((rid) => !knownIds.has(rid));
  // rev ที่เกิดก่อนมี `sourceAskItemId` (หรือไม่ได้ประทับ) — ตามจาก pointer ของแถวเหมือนเดิม
  const answered = missing.length
    ? await fetchAllInChunks(missing, (chunk) => supabase.from('material_price_revisions')
      .select(REV_COLUMNS).in('id', chunk).order('id'))
    : [];
  const revisions = [...bySource, ...answered];

  // ราคาอยู่ที่ชั้น (0157) — F/B/FB ไม่มีชั้นจำนวน จึงมีชั้นเดียวเสมอ (per_kg)
  const tiers = await fetchAllInChunks(
    revisions.map((r) => r.id),
    (chunk) => supabase.from('material_price_revision_tiers')
      .select('"revisionId", qty, "pricePerKg", "pricePerUnit"').in('revisionId', chunk).order('revisionId'),
  );
  const materials = await fetchAllInChunks(
    revisions.map((r) => r.materialId).filter(Boolean),
    (chunk) => supabase.from('material_prices').select('id, kind, label').in('id', chunk).order('id'),
  );
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const byRevision = new Map(revisions.map((rev) => {
    const material = materialById.get(rev.materialId) || null;
    const tier = (tiers || []).find((t) => t.revisionId === rev.id) || null;
    return [rev.id, {
      revisionId: rev.id,
      kind: material?.kind || null,
      short: PRICE_SHORT[material?.kind] || null,
      materialLabel: material?.label || null,
      price: tier ? Number(tier.pricePerKg ?? tier.pricePerUnit) : null,
      // หน่วยตามชั้นที่มีจริง ไม่เดาจากชนิด — per_piece ของ PM ก็ผ่านทางนี้ได้
      perUnit: tier ? (tier.pricePerKg != null ? 'กก.' : 'ชิ้น') : null,
      validUntil: rev.validUntil || null,
      note: rev.note || null,
      quotedAt: rev.quotedAt || null,
      quotedByName: rev.quotedByName || null,
      sourceAskItemId: rev.sourceAskItemId || null,
      revisionNo: rev.revisionNo ?? null,
      quotedAtRaw: rev.quotedAt || '',
    }];
  }));

  return items.map((i) => {
    if (!i.answeredRevisionId) return { ...i, pricedResult: null, pricedResults: [] };
    const main = byRevision.get(i.answeredRevisionId) || null;
    /* ทุกช่องที่ใส่จากแถวนี้ — **ชนิดละหนึ่ง** เรียง F · B · FB (รีวิว ม-148 รอบสอง)
       ⚠️ ใส่หลายช่องแล้วคำขอสะดุดกลางทาง กดซ้ำ = rev ของช่องแรกเกิดสองตัว (ประทับ id แถวเดียวกัน) ⇒ ไม่คัด
       จะโชว์ F สองบรรทัด · ช่องของ rev หลัก (`answeredRevisionId`) ยึดตัวนั้น · ช่องอื่นเอาตัวล่าสุด */
    const latest = new Map();
    for (const r of byRevision.values()) {
      if (r.sourceAskItemId !== i.id || !r.kind) continue;
      const cur = latest.get(r.kind);
      const newer = !cur || r.quotedAtRaw > cur.quotedAtRaw
        || (r.quotedAtRaw === cur.quotedAtRaw && (r.revisionNo ?? 0) > (cur.revisionNo ?? 0));
      if (newer) latest.set(r.kind, r);
    }
    if (main?.kind) latest.set(main.kind, main);
    const list = (latest.size ? [...latest.values()] : [main].filter(Boolean))
      .sort((a, b) => (PRICE_ORDER[a.kind] ?? 9) - (PRICE_ORDER[b.kind] ?? 9));
    return { ...i, pricedResult: main, pricedResults: list };
  });
}

// ป้ายสั้น/ลำดับของช่องราคาบนแถว (ชุดเดียวกับ lib/master/priceSlots.js)
const PRICE_SHORT = { RM_F: 'F', RM_B: 'B', RM_FB: 'FB' };
const PRICE_ORDER = { RM_F: 0, RM_B: 1, RM_FB: 2 };

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

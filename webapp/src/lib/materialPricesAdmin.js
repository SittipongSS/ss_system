// ── ทะเบียนวัสดุ (mig 0143 + 0157) — ชั้นเข้าถึงข้อมูล (server only) ────
import { pdrContext } from '@/lib/requests/pdrFields';
import { REQUEST_SLOT_VISIT_STATES } from '@/lib/service/visitStatus';
import { randomUUID } from 'crypto';
import {
  materialIdentityKey, normalizeMaterialInput, unitBasisForMaterialKind,
} from '@/lib/materialPrices';
import { normalizePmType } from '@/lib/master/materialTypes';
import { brandDisplayFromList } from '@/lib/master/brands';

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
  const { material } = await ensureMaterial(supabase, {
    kind,
    label: source.name,
    customerId: source.customerId,
    customerName: source.customerName,
    user,
  });

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
  let query = supabase.from('dept_requests').select('*');
  if (id) query = query.eq('id', id);
  if (dept) query = query.eq('dept', dept);
  if (status?.length) query = query.in('status', status);
  if (requestedById) query = query.eq('requestedById', requestedById);
  // ⚠️ ขอบเขต "ทีม" กรองที่นี่ ไม่ใช่ที่จอ (กับดักข้อ 9) — กรองที่จอแปลว่าคำร้อง
  // ของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จากแท็บ Network
  // `team` รับได้ทั้งทีมเดียวและอาร์เรย์ — คนเปิดคิวอยู่ได้หลายทีม (scopeFilter)
  if (team) query = Array.isArray(team) ? query.in('team', team) : query.eq('team', team);
  const { data: asks, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;
  if (!asks?.length) return [];

  const { data: items, error: itemError } = await supabase
    .from('dept_request_items')
    .select('*')
    .in('requestId', asks.map((a) => a.id))
    .order('sortOrder', { ascending: true });
  if (itemError) throw itemError;

  /* ⭐ **ชื่อโครงการมาด้วยตั้งแต่ตอนโหลดคิว** (มติผู้ใช้ 2026-08-11) — คิวจัดกลุ่ม
     ตามโครงการได้แล้ว แต่แถวเก็บแค่ `projectId` ⇒ หัวกลุ่มจะเป็น uuid ที่ไม่มีใคร
     อ่านออก · `findRequest` โหลดโครงการอยู่แล้วแต่นั่นคือตอนเปิด **ใบเดียว**
     ⚠️ **คิวรวมเดียว ไม่ใช่ N+1** — คิวหนึ่งหน้ามีได้ 100+ ใบ · ดึงรายใบแปลว่า
     100 query ต่อการเปิดหน้าหนึ่งครั้ง (โรคที่หน้านี้เพิ่งถอด 8 endpoint ทิ้งไป) */
  const projectIds = lean ? [] : [...new Set(asks.map((a) => a.projectId).filter(Boolean))];
  let projects = [];
  if (projectIds.length) {
    const { data, error: projectError } = await supabase
      .from('projects').select('id, code, name').in('id', projectIds);
    if (projectError) throw projectError;
    projects = data || [];
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
    const { data, error: customerError } = await supabase
      // `brands` = ทะเบียนแบรนด์ของลูกค้า — ใช้แปลงรหัสแบรนด์ที่ดีลเก็บไว้เป็นชื่อ
      // สองภาษา (`brandDisplayFromList`) · ดีลเก็บแค่ข้อความที่ผู้ใช้เลือกตอนนั้น
      .from('customers').select('id, "arCode", brands').in('id', customerIds);
    if (customerError) throw customerError;
    customers = data || [];
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
    const { data, error: dealError } = await supabase
      .from('sales_deals').select('id, metadata, code, title').in('id', dealIds);
    if (dealError) throw dealError;
    deals = data || [];
  }
  const brandByDeal = new Map(deals.map((d) => [d.id, String(d.metadata?.brand || '').trim()]));
  // ⭐ ดีลเป็นคอลัมน์ของตัวเองในคิวแล้ว (มติผู้ใช้ 2026-08-20) — query เดิมอยู่แล้ว
  // (ดึงมาทำแบรนด์) แค่ขอสองคอลัมน์เพิ่ม ⇒ ไม่มี query เพิ่มสักตัว
  const dealById = new Map(deals.map((d) => [d.id, d]));

  // ⚠️ เดิมมีขั้นดึง `dept_request_item_tiers` มาแปะรายแถว — ตารางถูก DROP ใน
  // mig 0219 พร้อมหัวข้อขอราคา (ม-28) · ราคาในโมเดลใหม่เป็นราคาเดียวต่อแถว
  return asks.map((a) => ({
    ...a,
    items: (items || []).filter((i) => i.requestId === a.id),
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
      .from('service_zones').select('id, code').in('id', surveyZoneIds);
    if (zoneError) throw zoneError;
    const codeById = new Map((zoneRows || []).map((z) => [z.id, z.code]));
    for (const row of surveyZones) row.zoneCode = row.zoneId ? codeById.get(row.zoneId) || null : null;
  }
  /* ป้ายสถานที่ — จอโชว์ **รหัส SS · ชื่อ** ไม่ใช่ id (กติกา entity display)
     ⚠️ อ่านสดจากทะเบียน ไม่ประทับลงใบ — ไซต์ถูกเปลี่ยนชื่อแล้วใบต้องพาไปหาที่ถูก */
  /* ⚠️ **โหลดเฉพาะใบประเมิน** — เช็คชนิดก่อน ไม่ใช่เช็คว่ามี `siteId` ไหม
     หัวข้ออื่นไม่มีคอลัมน์นี้อยู่แล้ว แต่การถามชนิดทำให้อ่านออกว่าทำไมถึงโหลด */
  let surveySite = null;
  let surveyVisit = null;
  if (row.kind === 'site_survey' && row.siteId) {
    const { data } = await supabase
      .from('service_sites').select('id, code, name, address, "contactName", "contactPhone"')
      .eq('id', row.siteId).maybeSingle();
    surveySite = data || null;
    /* ⭐ **นัดของเจ้าหน้าที่ที่ผูกกับใบนี้** (เฟส 2) — ใบต้องบอกได้เองว่าลงคิวไปแล้วหรือยัง
       และนัดนั้นขึ้นตารางจริงไหม · ไม่งั้นคนเปิดใบต้องไปเปิดหน้าจัดคิวเจ้าหน้าที่อีกแท็บ
       ⚠️ หนึ่งใบมี **นัดที่ยังมีชีวิตได้ใบเดียว** (index mig 0316) แต่มีนัดที่จบไปแล้ว
          กี่ใบก็ได้ (ไปแล้วเข้าไม่ได้ → นัดใหม่)
       🐞 **เอาแถวล่าสุดเฉย ๆ ไม่พอ** — นัดที่ปิดแล้วถูกเปิดกลับมาได้จากโมดัลนัด ⇒ แถวที่
          ยังมีชีวิตเป็นแถวเก่ากว่าแถวที่ปิดได้ · จอที่เห็นแถวที่ปิดจะโชว์ปุ่ม "ลงคิวใหม่"
          ซึ่ง server ตีกลับ 409 ทุกครั้ง (มันเห็นนัดที่ยังเปิดอยู่) ⇒ ถามนัดที่ยังมีชีวิต
          ก่อน ไม่มีค่อยเอาแถวล่าสุดมาโชว์เป็น *ประวัติ* */
    const visitCols = 'id, code, "scheduledDate", "startTime", status, "assigneeName"';
    const { data: liveRows } = await supabase
      .from('service_visits').select(visitCols)
      .eq('requestId', id)
      .in('status', REQUEST_SLOT_VISIT_STATES)
      .order('createdAt', { ascending: false })
      .limit(1);
    surveyVisit = (liveRows || [])[0] || null;
    if (!surveyVisit) {
      const { data: lastRows } = await supabase
        .from('service_visits').select(visitCols)
        .eq('requestId', id)
        .order('createdAt', { ascending: false })
        .limit(1);
      surveyVisit = (lastRows || [])[0] || null;
    }
  }
  const withBriefs = {
    ...row,
    briefs: briefs || [],
    targets: targets || [],
    surveyZones,
    surveySite,
    surveyVisit,
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
      ? supabase.from('customers').select('id, name, "arCode", contacts, "contactPerson", "contactPhone"')
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
  });

  const items = await attachRowPrice(supabase, withBriefs.items || []);

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
        name: customer.name || null,
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
  const revisionIds = [...new Set(items.map((i) => i.answeredRevisionId).filter(Boolean))];
  if (!revisionIds.length) return items;

  const { data: revisions, error } = await supabase
    .from('material_price_revisions')
    .select('id, "materialId", "validUntil", note, "quotedAt", "quotedByName"')
    .in('id', revisionIds);
  if (error) throw error;

  // ราคาอยู่ที่ชั้น (0157) — F/FB ไม่มีชั้นจำนวน จึงมีชั้นเดียวเสมอ (per_kg)
  const { data: tiers, error: tierError } = await supabase
    .from('material_price_revision_tiers')
    .select('"revisionId", qty, "pricePerKg", "pricePerUnit"')
    .in('revisionId', revisionIds);
  if (tierError) throw tierError;

  const { data: materials, error: matError } = await supabase
    .from('material_prices').select('id, kind, label')
    .in('id', [...new Set((revisions || []).map((r) => r.materialId).filter(Boolean))]);
  if (matError) throw matError;
  const materialById = new Map((materials || []).map((m) => [m.id, m]));

  const byRevision = new Map((revisions || []).map((rev) => {
    const material = materialById.get(rev.materialId) || null;
    const tier = (tiers || []).find((t) => t.revisionId === rev.id) || null;
    return [rev.id, {
      kind: material?.kind || null,
      materialLabel: material?.label || null,
      price: tier ? Number(tier.pricePerKg ?? tier.pricePerUnit) : null,
      // หน่วยตามชั้นที่มีจริง ไม่เดาจากชนิด — per_piece ของ PM ก็ผ่านทางนี้ได้
      perUnit: tier ? (tier.pricePerKg != null ? 'กก.' : 'ชิ้น') : null,
      validUntil: rev.validUntil || null,
      note: rev.note || null,
      quotedAt: rev.quotedAt || null,
      quotedByName: rev.quotedByName || null,
    }];
  }));

  return items.map((i) => ({
    ...i,
    pricedResult: byRevision.get(i.answeredRevisionId) || null,
  }));
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

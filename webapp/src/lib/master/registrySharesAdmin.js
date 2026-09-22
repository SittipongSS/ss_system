// ── แชร์กลิ่น/สูตรให้ลูกค้ารายอื่น (ม-150 · mig 0373) — ชั้นเข้าถึงข้อมูล (server only) ─────────
//
// ตัวตัดสินล้วนอยู่ที่ `registryShares.js` · ไฟล์นี้อ่าน/เขียนสองตาราง `scent_customer_shares` ·
// `formula_customer_shares` และติด `sharedCustomers` / `sharedCustomerIds` ให้แถวทะเบียน
// ⚠️ ทุก query อ่าน `error` เสมอ (supabase ไม่ throw) · ลิสต์ที่โตตามข้อมูลซอยก้อน (กับดัก 16 KB)
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { CUSTOMER_NAME_SELECT, customerSnapshotName } from '@/lib/master/customerName';
import { diffShares, normalizeShareInput, unshareError } from '@/lib/master/registryShares';

export const SHARE_TABLES = Object.freeze({
  scent: Object.freeze({ table: 'scent_customer_shares', column: 'scentId' }),
  formula: Object.freeze({ table: 'formula_customer_shares', column: 'formulaId' }),
});

const tableOf = (kind) => {
  const t = SHARE_TABLES[kind];
  if (!t) throw new Error(`ชนิดทะเบียนไม่ถูกต้อง: ${kind}`);
  return t;
};

/**
 * ติดรายชื่อลูกค้าที่ได้รับแชร์ให้แถวกลิ่น/สูตร — `sharedCustomers: [{ customerId, customerName }]` + `sharedCustomerIds`
 * ⭐ ตัวเดียวที่ทุกทางอ่านทะเบียนเรียก (รายการ · รายละเอียด · ด่าน) — ด่าน "ของลูกค้ารายนี้ไหม" อ่านจากตรงนี้
 */
export async function attachShares(supabase, rows = [], kind) {
  const { table, column } = tableOf(kind);
  const ids = (rows || []).map((r) => r?.id).filter(Boolean);
  if (!ids.length) return (rows || []).map((r) => ({ ...r, sharedCustomers: [], sharedCustomerIds: [] }));
  const select = `"${column}", "customerId", "customerName"`;
  /* ทะเบียนทั้งชุด (ตัวเลือกกลิ่น/สูตรทั้งระบบ) = อ่านตารางแชร์ทั้งตารางรอบเดียว ไม่ซอย `.in()` หลายสิบก้อนต่อกัน
     (ตารางแชร์เล็กกว่าทะเบียนเสมอ) · ชุดเล็ก (ใบเดียว/ด่าน) ซอยตาม id ตามเดิม */
  const wanted = new Set(ids);
  const shares = ids.length > 300
    ? (await fetchAll(() => supabase.from(table).select(select).order(column).order('customerId')))
      .filter((s) => wanted.has(s[column]))
    : await fetchAllInChunks(ids, (chunk) => supabase.from(table).select(select)
      .in(column, chunk).order(column).order('customerId'));
  const ownerOf = new Map((rows || []).map((r) => [r?.id, r?.customerId || null]));
  const byId = new Map();
  for (const s of shares) {
    // แถวแชร์ของ **เจ้าของปัจจุบัน** (เปลี่ยนเจ้าของทีหลัง) ไม่ใช่การแชร์ — ไม่นับ ไม่งั้นบันทึกแชร์ทีไรก็พยายามเลิกแชร์เจ้าของ (409 ถาวร)
    if (ownerOf.get(s[column]) && ownerOf.get(s[column]) === s.customerId) continue;
    const list = byId.get(s[column]) || [];
    list.push({ customerId: s.customerId, customerName: s.customerName ?? null });
    byId.set(s[column], list);
  }
  return rows.map((r) => {
    const list = (byId.get(r.id) || []).sort((a, b) => String(a.customerName || a.customerId)
      .localeCompare(String(b.customerName || b.customerId), 'th'));
    return { ...r, sharedCustomers: list, sharedCustomerIds: list.map((s) => s.customerId) };
  });
}

/** id กลิ่น/สูตรที่แชร์ให้ลูกค้ารายนี้ — ตัวกรอง `?customerId=` ของทะเบียนต้องรวมของที่แชร์มาด้วย */
export async function sharedIdsForCustomer(supabase, kind, customerId) {
  if (!customerId) return [];
  const { table, column } = tableOf(kind);
  const rows = await fetchAll(() => supabase.from(table).select(`"${column}"`)
    .eq('customerId', customerId).order(column));
  return rows.map((r) => r[column]);
}

/* ── ลูกค้าไหนใช้ของชิ้นนี้อยู่แล้ว — ด่านเลิกแชร์ ─────────────────────────────────────────
   เลิกแชร์ลูกค้าที่ใช้อยู่ = สูตร/คำร้องของเขาติดด่าน "ของลูกค้ารายอื่น" ทุกครั้งที่แก้ (ทางตัน)
   · กลิ่น: สูตรของลูกค้านั้นที่ใช้กลิ่นนี้ · คำร้องของลูกค้านั้นที่อ้างกลิ่นนี้ (หัวใบ · บรรทัด · PDR) · สินค้า
   · สูตร: สินค้าของลูกค้านั้น · สูตรของลูกค้านั้นที่แก้ต่อจากสูตรนี้ · คำร้องที่อ้าง/ผลิตสูตรนี้ */
export async function shareUsage(supabase, kind, id, customerIds = []) {
  const usage = Object.fromEntries(customerIds.map((c) => [c, { formulas: 0, requests: 0, products: 0 }]));
  if (!customerIds.length) return usage;
  const wanted = new Set(customerIds);
  const rowsOf = (table, select, column) => fetchAll(() => supabase.from(table).select(select).eq(column, id).order('id'));

  const requestIds = new Set();
  let products; let formulas;
  if (kind === 'scent') {
    const [reqs, items, targets, prods, fmls, children] = await Promise.all([
      rowsOf('dept_requests', 'id', 'scentId'),
      rowsOf('dept_request_items', 'id, "requestId"', 'scentId'),
      rowsOf('dept_request_pdr_targets', 'id, "requestId"', 'scentId'),
      rowsOf('products', 'id, "customerId"', 'scentId'),
      rowsOf('formulas', 'id, "customerId"', 'scentId'),
      // กลิ่นรอบแก้ของลูกค้านั้นที่แตกจากกลิ่นนี้ — เลิกแชร์แล้วแก้กลิ่นพวกนั้นไม่ได้อีก (ด่านสายพันธุ์)
      rowsOf('scents', 'id, "customerId"', 'derivedFromScentId'),
    ]);
    reqs.forEach((r) => requestIds.add(r.id));
    [...items, ...targets].forEach((r) => requestIds.add(r.requestId));
    products = prods; formulas = fmls;
    for (const c of children) if (wanted.has(c.customerId)) usage[c.customerId].scents = (usage[c.customerId].scents || 0) + 1;
    /* สูตรของกลิ่นนี้ที่ **แชร์** ให้ลูกค้านั้นอยู่ — เลิกแชร์กลิ่นแล้วสูตรที่แชร์ไว้ใช้ไม่ได้ (เลือกกลิ่นในคำร้องไม่ได้) */
    const formulaIds = fmls.map((f) => f.id);
    const sharedFormulas = formulaIds.length
      ? await fetchAllInChunks(formulaIds, (chunk) => supabase.from('formula_customer_shares')
        .select('"formulaId", "customerId"').in('formulaId', chunk).order('formulaId'))
      : [];
    for (const f of sharedFormulas) {
      if (wanted.has(f.customerId)) usage[f.customerId].sharedFormulas = (usage[f.customerId].sharedFormulas || 0) + 1;
    }
  } else {
    const [reqs, items, prods, children] = await Promise.all([
      rowsOf('dept_requests', 'id', 'formulaId'),
      rowsOf('dept_request_items', 'id, "requestId"', 'producedFormulaId'),
      rowsOf('products', 'id, "customerId"', 'formulaId'),
      rowsOf('formulas', 'id, "customerId"', 'derivedFromFormulaId'),
    ]);
    reqs.forEach((r) => requestIds.add(r.id));
    items.forEach((r) => requestIds.add(r.requestId));
    products = prods; formulas = children;
  }
  for (const p of products) if (wanted.has(p.customerId)) usage[p.customerId].products += 1;
  for (const f of formulas) if (wanted.has(f.customerId)) usage[f.customerId].formulas += 1;
  const requests = requestIds.size
    ? await fetchAllInChunks([...requestIds], (chunk) => supabase.from('dept_requests')
      .select('id, "customerId"').in('id', chunk).order('id'))
    : [];
  for (const r of requests) if (wanted.has(r.customerId)) usage[r.customerId].requests += 1;
  return usage;
}

const httpError = (message, status) => Object.assign(new Error(message), { status });

/**
 * ตั้งรายชื่อลูกค้าที่ได้รับแชร์ (แทนทั้งชุด) — คืน `{ before, after, add, remove }`
 * ⚠️ ผู้เรียกตรวจสิทธิ์ (RD เท่านั้น) ก่อนเรียก · ลูกค้าต้องมีจริง · เลิกแชร์ลูกค้าที่ใช้อยู่ไม่ได้
 * ⚠️ ไม่มี transaction — เพิ่มก่อนลบ (พังกลางทาง = แชร์เกิน ไม่ใช่แชร์ขาดจนของใครติดด่าน)
 */
export async function saveRegistryShares(supabase, kind, entity, rawIds, user = null) {
  const { table, column } = tableOf(kind);
  const { customerIds, error } = normalizeShareInput(rawIds, { ownerId: entity?.customerId || null, kind });
  if (error) throw httpError(error, 400);

  const customers = customerIds.length
    ? await fetchAllInChunks(customerIds, (chunk) => supabase.from('customers')
      .select(CUSTOMER_NAME_SELECT).in('id', chunk).order('id'))
    : [];
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const missing = customerIds.filter((id) => !customerById.has(id));
  if (missing.length) throw httpError(`ไม่พบลูกค้า ${missing.join(', ')} ในทะเบียน`, 400);

  const [current] = await attachShares(supabase, [entity], kind);   // ไม่รวมแถวของเจ้าของปัจจุบัน (ดู attachShares)
  const { add, remove } = diffShares(current.sharedCustomerIds, customerIds);
  // แถวค้างของเจ้าของ (เปลี่ยนเจ้าของหลังแชร์) — ล้างทิ้งเงียบ ๆ ไม่ผ่านด่านใช้งาน (เจ้าของใช้ได้อยู่แล้ว)
  if (entity?.customerId) {
    const { error: ownerRowError } = await supabase.from(table).delete()
      .eq(column, entity.id).eq('customerId', entity.customerId);
    if (ownerRowError) throw ownerRowError;
  }
  if (remove.length) {
    const usage = await shareUsage(supabase, kind, entity.id, remove);
    const nameOf = (id) => current.sharedCustomers.find((s) => s.customerId === id)?.customerName || id;
    const blocked = unshareError(remove, usage, nameOf);
    if (blocked) throw httpError(blocked, 409);
  }

  const nowIso = new Date().toISOString();
  if (add.length) {
    // upsert + ignoreDuplicates — สองคนกดบันทึกพร้อมกันต้องไม่ 500 ด้วย 23505 ของ PK
    const { error: insertError } = await supabase.from(table).upsert(add.map((customerId) => ({
      [column]: entity.id,
      customerId,
      customerName: customerSnapshotName(customerById.get(customerId)),
      createdById: user?.id != null ? String(user.id) : null,
      createdByName: user?.name ?? null,
      createdAt: nowIso,
    })), { onConflict: `${column},customerId`, ignoreDuplicates: true });
    if (insertError) throw insertError;
  }
  if (remove.length) {
    const { error: deleteError } = await supabase.from(table).delete()
      .eq(column, entity.id).in('customerId', remove);
    if (deleteError) throw deleteError;
  }
  /* ⭐ แชร์สูตร = แชร์กลิ่นของสูตรนั้นให้ด้วย — คำร้องเลือก **กลิ่น** ไม่ใช่สูตร ⇒ ได้สูตรแต่เลือกกลิ่นไม่ได้ = ใช้สูตรที่แชร์ไม่ได้จริง
     · เฉพาะรายที่เพิ่งเพิ่ม · เลิกแชร์สูตรไม่ถอนกลิ่นตาม (กลิ่นอาจถูกใช้ทางอื่นแล้ว — ถอนเองที่หน้ากลิ่น ผ่านด่านใช้งาน) */
  const scentSharedWith = [];
  if (kind === 'formula' && entity.scentId && add.length) {
    const { data: scent, error: scentError } = await supabase.from('scents')
      .select('id, "customerId"').eq('id', entity.scentId).maybeSingle();
    if (scentError) throw scentError;
    for (const customerId of add) {
      if (scent && await ensureShared(supabase, 'scent', scent, customerId, null, user)) scentSharedWith.push(customerId);
    }
  }
  const [after] = await attachShares(supabase, [entity], kind);
  return { before: current.sharedCustomers, after: after.sharedCustomers, add, remove, scentSharedWith };
}

/**
 * แชร์ให้ลูกค้ารายเดียวถ้ายังไม่ได้แชร์ — ทางอัตโนมัติของ RD ตอนส่งงานผูกสูตรของลูกค้าอื่น (ไม่มีด่านเลิกแชร์)
 * คืน true เมื่อเพิ่งแชร์ · false เมื่อเป็นเจ้าของ/แชร์อยู่แล้ว
 */
export async function ensureShared(supabase, kind, entity, customerId, customerName = null, user = null) {
  if (!entity?.customerId || !customerId || entity.customerId === customerId) return false;
  const { table, column } = tableOf(kind);
  const { data, error } = await supabase.from(table).select(`"${column}"`)
    .eq(column, entity.id).eq('customerId', customerId).limit(1);
  if (error) throw error;
  if (data?.length) return false;
  // ชื่ออ่านจากทะเบียนลูกค้า (ลูกค้าชื่ออังกฤษล้วนต้องไม่ได้ null) — ถอยไปค่าที่ส่งมาเมื่อหาไม่เจอ
  const { data: customer, error: customerError } = await supabase.from('customers')
    .select(CUSTOMER_NAME_SELECT).eq('id', customerId).maybeSingle();
  if (customerError) throw customerError;
  const { error: insertError } = await supabase.from(table).upsert({
    [column]: entity.id, customerId,
    customerName: customer ? customerSnapshotName(customer) : customerName,
    createdById: user?.id != null ? String(user.id) : null,
    createdByName: user?.name ?? null,
    createdAt: new Date().toISOString(),
  }, { onConflict: `${column},customerId`, ignoreDuplicates: true });
  if (insertError) throw insertError;
  return true;
}

/**
 * ราคาวัสดุของกลิ่น/สูตรที่แชร์ — ติด `sharedCustomerIds` ให้แถววัสดุ (ม-150)
 * ⭐ ราคา F/B/FB เป็นของกลิ่น/สูตรตัวเดียว (ราคาเดียวทุกลูกค้า) แต่แถววัสดุประทับลูกค้าเจ้าของ ⇒ ตัวเลือกวัสดุ
 *    ของใบขอราคาผลิตลูกค้าที่ได้รับแชร์ต้องเห็นมันด้วย (`MaterialPicker`) · วัสดุที่ไม่ผูกกลิ่น/สูตรได้ `[]`
 */
export async function attachMaterialShares(supabase, materials = []) {
  const scentIds = [...new Set(materials.map((m) => m.scentId).filter(Boolean))];
  const formulaIds = [...new Set(materials.map((m) => m.formulaId).filter(Boolean))];
  const load = async (kind, ids) => {
    if (!ids.length) return new Map();
    const { table, column } = tableOf(kind);
    const rows = await fetchAllInChunks(ids, (chunk) => supabase.from(table)
      .select(`"${column}", "customerId"`).in(column, chunk).order(column).order('customerId'));
    const byId = new Map();
    for (const r of rows) byId.set(r[column], [...(byId.get(r[column]) || []), r.customerId]);
    return byId;
  };
  const [byScent, byFormula] = await Promise.all([load('scent', scentIds), load('formula', formulaIds)]);
  return materials.map((m) => ({
    ...m,
    sharedCustomerIds: m.formulaId ? (byFormula.get(m.formulaId) || []) : (m.scentId ? (byScent.get(m.scentId) || []) : []),
  }));
}

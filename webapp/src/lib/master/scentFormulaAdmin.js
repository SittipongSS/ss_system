// ── ทะเบียนกลิ่น + สูตร (mig 0171) — ชั้นเข้าถึงข้อมูล (server only) ──────
//
// ⚠️ ทุก query ที่นี่ต้องอ่าน `error` เสมอ — `const { data } = await supabase…`
// ทิ้ง error ทำให้ schema error กลายเป็น "ไม่พบ X" แล้วไล่หาสาเหตุไม่เจอ
// (เคยหลุด prod มาแล้ว: คอลัมน์ที่ไม่มีจริงทำให้เปิดใบขอราคาผลิตไม่ได้ทั้งหน้า)
import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { registryRefTargets } from '@/lib/master/registryRefs';
import { loadMaterials } from '@/lib/materialPricesAdmin';
import {
  latestRevision, materialPriceState, pickStampedMaterial, revisionPriceRange, revisionUnitPrice,
} from '@/lib/materialPrices';
import {
  SCENT_STATUS_LABELS, derivedFromError, isScentUsable, newScentStatus, normalizeScentInput, proposedScentStatus,
} from '@/lib/master/scents';
import { formulaScentCustomerError, derivedFromFormulaError, normalizeFormulaInput } from '@/lib/master/formulas';
import { customerSnapshotName, CUSTOMER_NAME_SELECT } from '@/lib/master/customerName';
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';
import { priceSlotsFor } from '@/lib/master/priceSlots';
import { rowPriceSlots } from '@/lib/requests/rowPriceTarget';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { attachShares, sharedIdsForCustomer } from '@/lib/master/registrySharesAdmin';

// ── กลิ่น ────────────────────────────────────────────────────────────────
//
// ⭐ **กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต** (มติ: แก้แล้วได้กลิ่นตัวใหม่ที่มีรหัส
// ชื่อ วันที่ ของตัวเอง ไม่ใช่ Rev. ของตัวเดิม) ⇒ ไม่มีตารางรอบให้ join อีกแล้ว
// วันที่ส่งย้ายมาอยู่บนตัวกลิ่นเอง (`sentAt` — mig 0205 ยกมาจาก scent_revisions)
/* ── อ่านแถวทะเบียนกลิ่น/สูตร — `customerId` = ของลูกค้ารายนี้ **รวมที่แชร์มา** (ม-150) ─────────────
   ⚠️ เดิม `.eq('customerId')` ตัวเดียว ⇒ กลิ่นที่แชร์ให้ลูกค้ารายนี้หายจากตัวเลือกของเขา (โมดัลปิดบรีฟ · หน้าลูกค้า)
   · สองก้อน (ของตัวเอง + ที่แชร์มา) แล้วรวม — ไม่ใช้ `.or(id.in.(…))` เพราะลิสต์โตตามข้อมูล (กับดัก 16 KB) */
async function loadRegistryRows(supabase, table, kind, { status = null, customerId = null } = {}) {
  const base = () => {
    let query = supabase.from(table).select('*');
    if (status) query = query.in('status', Array.isArray(status) ? status : [status]);
    return query;
  };
  if (!customerId) {
    const { data, error } = await base().order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }
  const { data: owned, error } = await base().eq('customerId', customerId).order('name', { ascending: true });
  if (error) throw error;
  const sharedIds = await sharedIdsForCustomer(supabase, kind, customerId);
  if (!sharedIds.length) return owned || [];
  const shared = await fetchAllInChunks(sharedIds, (chunk) => base().in('id', chunk).order('id'));
  const seen = new Set((owned || []).map((r) => r.id));
  return [...(owned || []), ...shared.filter((r) => !seen.has(r.id))]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}

export async function loadScents(supabase, { status = null, customerId = null } = {}) {
  const data = await loadRegistryRows(supabase, 'scents', 'scent', { status, customerId });
  // ⭐ ลูกค้าที่ได้รับแชร์ (ม-150) — ทุกตัวเลือก/ด่านที่ถาม "ของลูกค้ารายนี้ไหม" อ่านจากตรงนี้
  const withShares = await attachShares(supabase, data, 'scent');
  const withSource = await attachScentSource(supabase, withShares);
  // ราคา F ของกลิ่น — ดูเหตุผลที่ `attachRegistryPrice`
  return attachRegistryPrice(supabase, withSource, { column: 'scentId', kind: 'RM_F' });
}

// ── ที่มาของกลิ่นแต่ละตัว ────────────────────────────────────────────────
//
// ⭐ ทะเบียนกลิ่นเป็นข้อมูลกลางที่ **ข้อมูลส่วนใหญ่มาจากสายพัฒนากลิ่น** ส่วนที่เพิ่ม
// ตรงจากทะเบียนคือกลิ่นเดิมที่เคยออกแบบไว้ก่อนมีระบบ (มติผู้ใช้ 2026-08-08)
// ⇒ เปิดทะเบียนมาต้องแยกออกทันทีว่าตัวไหนผ่านสายงานจริง ตัวไหนคนพิมพ์เข้ามาเอง
//
// 🐞 `briefId` · `dealId` เก็บครบมาตั้งแต่ mig 0213 **แต่ไม่เคยขึ้นบนจอเลย**
//
// ⚠️ สองฮอป: `scents.briefId` → `dept_request_scents.requestId` → `dept_requests.docNo`
// · ข้ามฮอปแรกไม่ได้เพราะกลิ่นไม่ได้ผูกคำร้องตรง ๆ (บรีฟเป็นชั้นกลางของโครงสามชั้น)
//
// ⚠️ ไม่ยิงอะไรเลยเมื่อไม่มีแถวไหนมี `briefId` — ตัวเลือกกลิ่นในฟอร์มต่าง ๆ เรียก
// `loadScents` ด้วย และไม่ควรจ่ายค่า query เพิ่มถ้าทะเบียนยังไม่เคยมีของจากสายงาน
async function attachScentSource(supabase, rows) {
  const briefIds = [...new Set(rows.map((s) => s.briefId).filter(Boolean))];
  if (!briefIds.length) return rows.map((s) => ({ ...s, sourceRequest: null }));

  const { data: briefs, error: briefError } = await supabase
    .from('dept_request_scents').select('id, "requestId"').in('id', briefIds);
  if (briefError) throw briefError;
  const requestIdByBrief = new Map((briefs || []).map((b) => [b.id, b.requestId]));

  const requestIds = [...new Set([...requestIdByBrief.values()].filter(Boolean))];
  const { data: requests, error: requestError } = requestIds.length
    ? await supabase.from('dept_requests').select('id, "docNo"').in('id', requestIds)
    : { data: [], error: null };
  if (requestError) throw requestError;
  const requestById = new Map((requests || []).map((r) => [r.id, r]));

  return rows.map((s) => {
    // ⚠️ `briefId` มีแต่ตามกลับไม่เจอ = คำร้องถูกลบไปแล้ว — ยังต้องนับว่า "มาจาก
    // คำร้อง" อยู่ดี · ตกเป็น "เพิ่มเอง" เมื่อไรคือโกหกเรื่องที่มาของข้อมูล
    const request = requestById.get(requestIdByBrief.get(s.briefId)) || null;
    return { ...s, sourceRequest: request ? { id: request.id, docNo: request.docNo || null } : null };
  });
}

export async function findScent(supabase, id) {
  const { data, error } = await supabase.from('scents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** กลิ่น + ลูกค้าที่ได้รับแชร์ (ม-150) — ด่าน "ของลูกค้ารายนี้ไหม" ต้องใช้ตัวนี้ ไม่ใช่ `findScent` เปล่า */
export async function findScentShared(supabase, id) {
  const scent = await findScent(supabase, id);
  if (!scent) return null;
  const [withShares] = await attachShares(supabase, [scent], 'scent');
  return withShares;
}

// กลิ่นนี้ถูกคำร้องผลิตขึ้นมาแล้วหรือยัง — ด่านก่อนลบ
//
// ⚠️ ตาข่ายนี้มาแทน "มีประวัติการส่งแล้ว ลบไม่ได้" ของเดิม · `producedScentId`
// เป็น FK แบบ SET NULL (0204) ⇒ ลบกลิ่นได้เงียบ ๆ แล้วคำร้องจะชี้ไปที่ว่าง
// โดยไม่มีอะไรฟ้อง — สายพันธุ์ของงานขาดตรงนั้นและต่อกลับไม่ได้อีก
export async function countRequestItemsProducingScent(supabase, scentId) {
  const { count, error } = await supabase
    .from('dept_request_items')
    .select('id', { count: 'exact', head: true })
    .eq('producedScentId', scentId);
  if (error) throw error;
  return count || 0;
}

/**
 * นับทุก pointer ที่เป็น `RESTRICT` หลัง mig 0232 — ใช้เป็น `linkedCount` ของด่านลบ
 *
 * ⭐ **ต้องนับให้ครบทุกช่อง ไม่ใช่เฉพาะช่องที่นึกออก** — ช่องที่ตกหล่นจะผ่านด่านนี้
 * ไปแล้วไปตายที่ฐานข้อมูลด้วย 23503 ซึ่งขึ้นจอเป็นภาษาอังกฤษที่ผู้ใช้อ่านไม่ออก
 * ⚠️ รายการต้องตรงกับ `unlinkRegistryRefs()` ใน `lib/forceDelete.js` เสมอ —
 * นับอย่าง ปลดอีกอย่าง แปลว่าบังคับลบแล้วยังโดนปฏิเสธอยู่ดี
 */
export async function countRegistryRefs(supabase, kind, id) {
  let total = 0;
  for (const [table, column] of registryRefTargets(kind)) {
    const { count, error } = await supabase
      .from(table).select('id', { count: 'exact', head: true }).eq(column, id);
    if (error) throw error;
    total += count || 0;
  }
  return total;
}

// ด่านสายพันธุ์ที่ต้องถาม DB — โยน Error เป็นภาษาไทยให้ route ตอบ 400 ตามเดิม
//
// ⚠️ อยู่ที่นี่ ไม่ใช่แค่กรองตัวเลือกบนจอ — ตัวเลือกที่กรองแล้วกันคนกดผิด
// แต่ไม่กันคนยิง API ตรง · กลิ่นข้ามลูกค้าเป็นข้อห้ามระดับโมเดล (มติ 9)
export async function assertDerivedFromScent(supabase, { derivedFromScentId, customerId, id }) {
  if (!derivedFromScentId) return;
  const parent = await findScentShared(supabase, derivedFromScentId);
  const error = derivedFromError(parent, { customerId, id });
  if (error) throw new Error(error);
}

/* ── ชื่อลูกค้าที่ประทับลงแถวกลิ่น — อ่านจากทะเบียนเสมอ ไม่เชื่อค่าที่ผู้เรียกส่งมา ──
   🐞 2026-09-03: `customerName` ของกลิ่นมาจาก client ล้วน (`normalizeScentInput` รับ
   `body.customerName` ตรง ๆ) และทุกจอส่ง `customers.find(...)?.name` มา ⇒ ลูกค้าที่มี
   แต่ชื่ออังกฤษถูกประทับ null ทับทุกครั้งที่กดบันทึก · แก้ที่จอแล้วยังเหลือทางอื่นอีกสาม
   (คำร้อง SA · ส่งงานรายบรรทัด · จัดระเบียบ) ที่ส่งสำเนาของสำเนาต่อกันมา
   ⇒ derive ที่นี่ = ปิดรูให้ทุกทางเรียกพร้อมกัน รวมคนยิง API ตรง
   (แพตเทิร์นเดียวกับ `customerForFormula` ของสูตร)
   ⚠️ **หาไม่เจอ = คงค่าที่ส่งมา ไม่ล้างทิ้ง** — `scents.customerId` ไม่มี FK (mig 0171)
   แถวเก่าชี้ลูกค้าที่ถูกลบไปแล้วได้ · ล้างชื่อทิ้งเมื่อไรจอปลายทางวาดขีดแทนของที่เคยมี */
export async function scentCustomerName(supabase, customerId, fallback = null) {
  if (!customerId) return null;
  // ⚠️ ต้องอ่าน error (กติกาหัวไฟล์) — ทิ้งแล้ว schema error จะกลายเป็น "ไม่พบลูกค้า"
  const { data, error } = await supabase
    .from('customers').select(CUSTOMER_NAME_SELECT).eq('id', customerId).maybeSingle();
  if (error) throw error;
  return data ? customerSnapshotName(data) : fallback;
}

export async function createScent(supabase, input, user, { accepted = false } = {}) {
  const { value, error } = normalizeScentInput(input);
  if (error) throw new Error(error);
  // รับเข้าทะเบียนตั้งแต่แรกได้เฉพาะตอน RD เป็นคนสร้าง และต้องมีรหัสมาด้วย
  if (accepted && !value.code) throw new Error('ต้องระบุรหัสกลิ่น');
  await assertDerivedFromScent(supabase, value);

  const nowIso = new Date().toISOString();
  const row = {
    id: genId('SCT'),
    ...value,
    // ชื่อลูกค้าเป็นค่าที่ derive ได้ — ทับค่าที่ผู้เรียกส่งมาเสมอ (ดู scentCustomerName)
    customerName: await scentCustomerName(supabase, value.customerId, value.customerName),
    // ⭐ **เลือกสถานะได้ตอนสร้าง** (มติผู้ใช้ 2026-08-08) — ทางเพิ่มตรงมีไว้ลงกลิ่นเดิม
    // ที่ลูกค้าอนุมัติไปแล้ว ⇒ ควรเป็น `active` ตั้งแต่แรก ไม่ใช่บังคับ `developing`
    // แล้วให้ RD กดเปลี่ยนอีกรอบทุกใบ
    // ⚠️ `newScentStatus` จำกัดไว้เฉพาะสองสถานะที่ "ของจริงแล้ว" และเฉพาะตอน RD
    // เป็นคนสร้าง — ฝ่ายขายยังได้ `draft` เสมอ (ใส่รหัส = รับเข้าทะเบียน เป็นอำนาจ RD)
    status: newScentStatus(input.status, accepted),
    /* ⭐ ร่างจำสถานะที่ผู้เสนอบอกว่าเป็นจริงไว้ (mig 0269) — ฝ่ายขายที่ย้ายข้อมูล
       กลิ่นเก่ารู้อยู่แล้วว่าตัวไหนลูกค้าอนุมัติไปแล้ว ⇒ RD ไม่ต้องไล่ถามใหม่ตอนกดรับ
       ⚠️ RD สร้างเองใส่ `status` ตรง ๆ ได้อยู่แล้ว ช่องนี้จึงว่างสำหรับแถวของ RD */
    proposedStatus: accepted ? null : proposedScentStatus(input.status),
    // RD ที่สร้างเองเป็นเจ้าของกลิ่นโดยปริยาย — ฝ่ายขายเปิดร่างยังไม่มีเจ้าของ
    ownerId: value.ownerId || (accepted ? user?.id ?? null : null),
    ownerName: value.ownerName || (accepted ? user?.name ?? null : null),
    acceptedById: accepted ? user?.id ?? null : null,
    acceptedByName: accepted ? user?.name ?? null : null,
    acceptedAt: accepted ? nowIso : null,
    // ⚠️ กรอกวันผลิตมาเอง = คนกรอกคือคนบันทึก · เว้นว่างแล้วช่องคนบันทึกต้องว่างตาม
    // ไม่ใช่ติดชื่อไว้บนวันที่ที่ไม่มีอยู่
    producedById: value.producedAt ? user?.id ?? null : null,
    producedByName: value.producedAt ? user?.name ?? null : null,
    sentById: value.sentAt ? user?.id ?? null : null,
    sentByName: value.sentAt ? user?.name ?? null : null,
    createdById: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const { data, error: insertError } = await supabase.from('scents').insert(row).select().single();
  if (insertError) throw translateScentConflict(insertError);
  return data;
}

export async function updateScent(supabase, id, patch) {
  const { data, error } = await supabase
    .from('scents')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw translateScentConflict(error);
  return data;
}

// unique violation จาก DB อ่านไม่รู้เรื่องสำหรับผู้ใช้ — แปลเป็นภาษาคนตรงจุดที่ชน
function translateScentConflict(error) {
  const msg = String(error?.message || '');
  if (error?.code === '23505') {
    if (msg.includes('scents_identity_uk')) {
      return new Error('ลูกค้ารายนี้มีกลิ่นชื่อนี้อยู่แล้ว — เปิดกลิ่นเดิมแทนการสร้างซ้ำ');
    }
    if (msg.includes('scents_code_uk')) return new Error('รหัสกลิ่นนี้ถูกใช้ไปแล้ว');
    if (msg.includes('formulas_code_uk')) return new Error('รหัสสูตรนี้ถูกใช้ไปแล้ว');
    // ⭐ ตัวตนใหม่ของสูตร (0207) — ชนแปลว่า "ของชิ้นนี้มีในทะเบียนแล้ว" ไม่ใช่
    // "รหัสซ้ำ" · ข้อความต้องชี้ทางไปเปิดของเดิม ไม่ใช่ให้ไปเปลี่ยนรหัสหนี
    if (msg.includes('formulas_identity_uk')) {
      return new Error('หมวดสินค้านี้กับกลิ่นนี้มีสูตรอยู่แล้ว — เปิดสูตรเดิมแทนการสร้างซ้ำ');
    }
  }
  return error;
}

// ── สูตร ─────────────────────────────────────────────────────────────────
export async function loadFormulas(supabase, { status = null, customerId = null } = {}) {
  const data = await loadRegistryRows(supabase, 'formulas', 'formula', { status, customerId });
  const withShares = await attachShares(supabase, data, 'formula');
  const withSource = await attachFormulaSource(supabase, withShares);
  const withUsage = await attachFormulaUsage(supabase, withSource);
  // ราคา FB ของสูตร — คู่ขนานกับ F ของกลิ่น
  const withPrice = await attachRegistryPrice(supabase, withUsage, { column: 'formulaId', kind: 'RM_FB' });
  return withFragranceOilPrice(supabase, withPrice);
}

/* ⭐ **สูตรหมวดหัวน้ำหอม (02-020) ราคาหลักคือ F ของกลิ่น** (ม-148 · `priceSlotsFor`) — สูตรพวกนี้ใส่ได้แค่ F ลงที่กลิ่น
   ⇒ ช่องราคา FB ของมันว่างตลอดกาล · ตาราง/หน้ารายละเอียดต้องโชว์ราคาที่ใส่ได้จริง ไม่ใช่ "ยังไม่ผูกราคา" ถาวร
   · `priceSlot` บอกจอว่าราคาที่ติดมาคือช่องไหน (ป้ายคอลัมน์/การ์ด) */
async function withFragranceOilPrice(supabase, rows) {
  /* ⚠️ เงื่อนไขเดียวกับ `priceSlotsFor` เป๊ะ (รีวิว ม-148 รอบสาม) — กลิ่นใช้ไม่ได้ = สูตรถอยไปช่อง B/FB ⇒ ราคาหลักยังเป็น FB
     ของสูตร · ต้องมี `scentStatus` บนแถวก่อนเรียก (loadFormulas: attachFormulaUsage · หน้ารายละเอียด: โหลดกลิ่นก่อน) */
  const isOil = (r) => r.categoryCode === PDR_FRAGRANCE_OIL_CODE && r.scentId
    && (r.scentStatus ? isScentUsable({ status: r.scentStatus }) : true);
  const oil = rows.filter(isOil);
  if (!oil.length) return rows.map((r) => ({ ...r, priceSlot: 'FB' }));
  const scentPrices = await attachRegistryPrice(
    supabase, [...new Set(oil.map((r) => r.scentId))].map((id) => ({ id })), { column: 'scentId', kind: 'RM_F' },
  );
  const byScent = new Map(scentPrices.map((s) => [s.id, s.price]));
  return rows.map((r) => (isOil(r)
    ? { ...r, price: byScent.get(r.scentId) || null, priceSlot: 'F' }
    : { ...r, priceSlot: 'FB' }));
}

// FG ที่ใช้สูตรแต่ละตัว — `usedByProducts: [{ id, fgCode }]` (1 สูตรผูกได้หลาย FG · ม-150)
// · ประโยครอบแก้บอกว่ามี FG ไหนต้องย้ายไปสูตรใหม่ · ไม่ได้ใช้ตัดตัวเลือกสูตรบนฟอร์มสินค้าแล้ว
// พ่วงชื่อกลิ่นของสูตร (`scentName`) ไปด้วย — ฟอร์มสินค้าโชว์ "กลิ่นที่จะได้"
// ใต้ช่องสูตรโดยไม่ต้องโหลดทะเบียนกลิ่นทั้งก้อนเอง
async function attachFormulaUsage(supabase, rows) {
  if (!rows.length) return rows;
  // ⚠️ ซอยก้อน — ทะเบียนทั้งชุดส่ง id หลายร้อยตัว (กับดัก 16 KB) และหลาย FG ต่อสูตรทำให้แถวโตได้เกิน 1,000
  const holders = await fetchAllInChunks(rows.map((r) => r.id), (chunk) => supabase
    .from('products').select('id, "fgCode", "formulaId"').in('formulaId', chunk).order('id'));
  const byFormula = new Map();
  for (const p of holders) {
    byFormula.set(p.formulaId, [...(byFormula.get(p.formulaId) || []), { id: p.id, fgCode: p.fgCode || null }]);
  }

  const scentIds = [...new Set(rows.map((r) => r.scentId).filter(Boolean))];
  let scentById = new Map();
  if (scentIds.length) {
    const { data: scents, error: scentError } = await supabase
      .from('scents').select('id, name, status').in('id', scentIds);
    if (scentError) throw scentError;
    scentById = new Map((scents || []).map((s) => [s.id, s]));
  }

  return rows.map((r) => ({
    ...r,
    usedByProducts: byFormula.get(r.id) || [],
    scentName: scentById.get(r.scentId)?.name || null,
    // ม-148 — โมดัลราคาเปิดช่อง F (ลงกลิ่นของสูตร) เฉพาะกลิ่นที่ใส่ราคาได้ · ตัวเดียวกับที่ route ตัดสิน
    scentStatus: scentById.get(r.scentId)?.status || null,
  }));
}

// ── ที่มาของสูตรแต่ละตัว ─────────────────────────────────────────────────
//
// ⭐ กติกาเดียวกับ ม-74 ของทะเบียนกลิ่น — เปิดทะเบียนมาต้องแยกออกทันทีว่าตัวไหน
// ผ่านสายพัฒนาสูตรจริง ตัวไหนคนพิมพ์เข้ามาเอง (ช่องว่างข้อ 2 ของแบบพัฒนาสูตร)
//
// ⚠️ **หลักฐานอยู่ที่แถวคำร้อง ไม่ใช่บนตัวสูตร** — ต่างจากกลิ่นที่มี `briefId` ติดตัว
// · ตารางสูตรไม่มีคอลัมน์ที่ชี้กลับคำร้องเลย (ตรวจ 2026-08-08: id · code · name ·
// formulaDate · scentId · customerId · … · dealId) ⇒ ตามจาก
// `dept_request_items.producedFormulaId` แทน · ผลที่ตามมาที่ต้องรู้:
// **ลบคำร้องทิ้งแล้วสูตรจะกลายเป็น "เพิ่มเอง"** เพราะหลักฐานหายไปพร้อมแถว
//
// ⚠️ **ห้ามตัดสินจาก `dealId`** — ฟอร์มเพิ่มสูตรเองก็กรอกดีลได้ (บทเรียนเดียวกับ ม-74)
//
// ⚠️ ไม่ยิงอะไรเลยเมื่อทะเบียนว่าง — ตัวเลือกสูตรในฟอร์มต่าง ๆ เรียก `loadFormulas`
// ด้วย และไม่ควรจ่ายค่า query เพิ่มโดยไม่จำเป็น
async function attachFormulaSource(supabase, rows) {
  if (!rows.length) return rows;
  const ids = rows.map((f) => f.id).filter(Boolean);
  if (!ids.length) return rows.map((f) => ({ ...f, sourceRequest: null }));

  const { data: items, error: itemError } = await supabase
    .from('dept_request_items')
    .select('"requestId", "producedFormulaId"')
    .in('producedFormulaId', ids);
  if (itemError) throw itemError;

  const requestIdByFormula = new Map(
    (items || []).filter((i) => i.producedFormulaId).map((i) => [i.producedFormulaId, i.requestId]),
  );
  const requestIds = [...new Set([...requestIdByFormula.values()].filter(Boolean))];
  const { data: requests, error: requestError } = requestIds.length
    ? await supabase.from('dept_requests').select('id, "docNo"').in('id', requestIds)
    : { data: [], error: null };
  if (requestError) throw requestError;
  const requestById = new Map((requests || []).map((r) => [r.id, r]));

  return rows.map((f) => {
    const request = requestById.get(requestIdByFormula.get(f.id)) || null;
    return { ...f, sourceRequest: request ? { id: request.id, docNo: request.docNo || null } : null };
  });
}

export async function findFormula(supabase, id) {
  const { data, error } = await supabase.from('formulas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** สูตร + ลูกค้าที่ได้รับแชร์ (ม-150) — คู่กับ `findScentShared` */
export async function findFormulaShared(supabase, id) {
  const formula = await findFormula(supabase, id);
  if (!formula) return null;
  const [withShares] = await attachShares(supabase, [formula], 'formula');
  return withShares;
}

// ⭐ **ลูกค้าของสูตรมาจากกลิ่นเสมอ ไม่ใช่จากฟอร์ม** (mig 0207)
//
// เดิมช่องลูกค้าอยู่ในฟอร์มและเว้นว่างได้ ⇒ สูตรผูกลูกค้า A แต่ใช้กลิ่นของลูกค้า B
// ได้โดยไม่มีอะไรห้าม · ย้ายมาให้ server เติม ⇒ ความขัดแย้งเป็นไปไม่ได้เชิงโครงสร้าง
// (แพตเทิร์นเดียวกับ productFormulaSnapshot — ค่าที่ derive ได้ ห้ามให้ client ส่ง)
//
// 🐞 **คืน null เมื่อไม่มีกลิ่น ไม่ใช่คืนลูกค้าเปล่า** — เวอร์ชันแรกคืน
// `{customerId: null}` ซึ่งไป **ล้างลูกค้าทิ้ง** ของสูตรที่ไม่ผูกกลิ่น · จุดที่พังจริง
// คือ "จัดระเบียบ" (unsorted): สินค้าของลูกค้ารายหนึ่งถูกย้ายเป็นสูตร แล้วสูตรนั้น
// กลายเป็นสูตรฐานไร้ลูกค้าเงียบ ๆ
//
// กฎที่ถูกคือ **"กลิ่นเป็นเจ้าของคำตอบเมื่อมีกลิ่น"** ไม่ใช่ "สูตรห้ามมีลูกค้า" —
// สูตรฐานที่ไม่ผูกกลิ่นยังผูกลูกค้าได้ตามที่ผู้เรียกกำหนด (แต่ไม่ใช่จากฟอร์มทะเบียน)
/* ⭐ **กลับทิศจาก 0207** (มติผู้ใช้ 2026-08-10) — ลูกค้าเป็นค่าที่คนกรอกเลือกเอง
   แล้ว **กลิ่นต้องเป็นของลูกค้ารายนั้น** · ของเดิม derive ลูกค้าจากกลิ่น ซึ่งกันรูเดิม
   ได้ก็จริงแต่กลับทิศจากที่คนคิด (เขารู้ลูกค้าก่อน แล้วค่อยหากลิ่นของลูกค้าคนนั้น)
   ⚠️ รูที่ 0207 ปิดไว้ต้องไม่กลับมา — ตรวจตรง ๆ ด้วย `formulaScentCustomerError`
   แทนการเติมให้ · ป้องกันเรื่องเดียวกันคนละกลไก
   ⚠️ `customerName` อ่านจากทะเบียนลูกค้าเสมอ ไม่รับจาก client (ชื่ออาจเก่า) */
async function customerForFormula(supabase, { customerId, scentId }) {
  if (scentId) {
    const scent = await findScentShared(supabase, scentId);
    if (!scent) throw new Error('ไม่พบกลิ่นที่เลือกในทะเบียนกลิ่น');
    const mismatch = formulaScentCustomerError(scent, { customerId });
    if (mismatch) throw new Error(mismatch);
    // ผ่านด่านแล้ว + เป็นเจ้าของกลิ่น ⇒ ใช้ชื่อจากกลิ่นได้เลย
    if (scent.customerId === customerId) {
      return { customerId: scent.customerId, customerName: scent.customerName ?? null };
    }
    /* ⭐ กลิ่นที่แชร์มา (ม-150) — ลูกค้าของสูตรคือ **ลูกค้าที่เลือก** ไม่ใช่เจ้าของกลิ่น · ชื่ออ่านจากทะเบียนลูกค้า (ข้างล่าง)
       ⚠️ ห้ามคืน `scent.customerId` แบบเดิม — สูตรของลูกค้า B จะกลายเป็นของ A เงียบ ๆ */
  }
  if (!customerId) return { customerId: null, customerName: null };
  // ⚠️ ต้องแยก error ออกจาก "ไม่เจอ" — ทิ้ง error แล้วเช็ค `!data` ทำให้ปัญหาการอ่าน
  // กลายเป็น "ไม่พบลูกค้า" แล้วไล่ผิดทางยาว (มี ratchet test คุมทั้งรีโป)
  const { data, error } = await supabase
    .from('customers').select(CUSTOMER_NAME_SELECT).eq('id', customerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ไม่พบลูกค้าที่เลือก');
  // ลูกค้าที่มีแต่ชื่ออังกฤษต้องไม่โดนประทับ null ลงสูตร แล้วจอปลายทางวาดขีด
  return { customerId: data.id, customerName: customerSnapshotName(data) };
}

export async function assertDerivedFromFormula(supabase, { derivedFromFormulaId, customerId, id }) {
  if (!derivedFromFormulaId) return;
  const parent = await findFormulaShared(supabase, derivedFromFormulaId);
  const error = derivedFromFormulaError(parent, { customerId, id });
  if (error) throw new Error(error);
}

// `fallbackCustomer` ใช้ได้เฉพาะตอน **ไม่มีกลิ่น** — ทางเดียวที่ยังส่งมาคือ
// "จัดระเบียบ" ซึ่งย้ายสินค้าของลูกค้ารายหนึ่งมาเป็นสูตรฐาน · ฟอร์มทะเบียนไม่ส่ง
// ค่านี้เลย และห้ามส่ง (นั่นคือรูที่ 0207 ปิดไป)
/* `developing` (ม-148 · มติผู้ใช้ 2026-09-22) — สูตรที่เกิดพร้อมกลิ่นตอนส่งงาน **พัฒนากลิ่น**
   เดินคู่กลิ่น: รับเข้าทะเบียนแล้ว (มีรหัส · มีเจ้าของ) แต่ยัง "กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม
   (ก้าว outcome ของแถวพลิกเป็น active พร้อมกลิ่น) · ⚠️ ต่างจากกติกาทั่วไปที่สูตรรับเข้าแล้ว
   active ทันที (ดู ALLOWED_TRANSITIONS ใน formulas.js) — direction ที่ลูกค้าปฏิเสธจะไม่ทิ้งสูตร
   "ใช้งาน" ค้างทะเบียน และยังลบตามแถวได้ตอนส่งผิด (ด่านลบรับเฉพาะ draft/developing) */
export async function createFormula(supabase, input, user, {
  accepted = false, fallbackCustomer = null, developing = false,
} = {}) {
  const { value, error } = normalizeFormulaInput(input);
  if (error) throw new Error(error);
  if (accepted && !value.code) throw new Error('ต้องระบุรหัสสูตร');

  // fallbackCustomer ยังใช้ได้เฉพาะทาง "จัดระเบียบ" ที่ไม่ได้ส่งลูกค้ามา (ดูหัวข้อบน)
  // ⚠️ ชื่อที่ติดมากับ fallbackCustomer เป็น **สำเนาของสำเนา** (body → สแนปช็อตของสินค้า)
  // ลูกค้าที่มีแต่ชื่ออังกฤษจึงเป็น null มาแต่ต้นทาง ⇒ derive จากทะเบียนเหมือนทางอื่น
  const picked = await customerForFormula(supabase, value);
  const customer = picked.customerId ? picked : (fallbackCustomer
    ? {
      customerId: fallbackCustomer.customerId ?? null,
      customerName: await scentCustomerName(
        supabase, fallbackCustomer.customerId, fallbackCustomer.customerName,
      ),
    }
    : picked);
  await assertDerivedFromFormula(supabase, { ...value, ...customer });

  const nowIso = new Date().toISOString();
  const row = {
    id: genId('FML'),
    ...value,
    ...customer,
    // RD ที่สร้างเองเป็นเจ้าของสูตรโดยปริยาย (ตรงกับทะเบียนกลิ่น)
    ownerId: accepted ? user?.id ?? null : null,
    ownerName: accepted ? user?.name ?? null : null,
    status: accepted ? (developing ? 'developing' : 'active') : 'draft',
    acceptedById: accepted ? user?.id ?? null : null,
    acceptedByName: accepted ? user?.name ?? null : null,
    acceptedAt: accepted ? nowIso : null,
    createdById: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const { data, error: insertError } = await supabase.from('formulas').insert(row).select().single();
  if (insertError) throw translateScentConflict(insertError);
  return data;
}

// แก้สูตรจากฟอร์ม — ต่างจาก `updateFormula` ตรงที่ **derive ลูกค้าจากกลิ่นใหม่ทุกครั้ง**
// และตรวจสายพันธุ์ให้ · `updateFormula` ดิบ ๆ ยังใช้ได้กับ patch ที่ไม่แตะกลิ่น
// (เปลี่ยนสถานะ · รับเข้าทะเบียน) ซึ่งไม่ต้องคิดเรื่องลูกค้าเลย
export async function editFormula(supabase, id, patch) {
  // ⚠️ ไม่มีกลิ่น = **ไม่แตะลูกค้าเดิม** ไม่ใช่ล้างทิ้ง — สูตรฐานที่ผูกลูกค้าไว้จาก
  // การจัดระเบียบ ต้องไม่กลายเป็นไร้ลูกค้าเพราะแค่มีคนเข้ามาแก้ชื่อ
  // ⚠️ ไม่ส่งทั้งลูกค้าและกลิ่นมา = **ไม่แตะลูกค้าเดิม** ไม่ใช่ล้างทิ้ง — สูตรฐานที่ผูก
  // ลูกค้าไว้จากการจัดระเบียบ ต้องไม่กลายเป็นไร้ลูกค้าเพราะแค่มีคนเข้ามาแก้ชื่อ
  const touchesCustomer = 'customerId' in patch || 'scentId' in patch;
  const customer = touchesCustomer ? await customerForFormula(supabase, patch) : null;
  await assertDerivedFromFormula(supabase, { ...patch, ...(customer || {}), id });
  return updateFormula(supabase, id, customer ? { ...patch, ...customer } : patch);
}

export async function updateFormula(supabase, id, patch) {
  const { data, error } = await supabase
    .from('formulas')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw translateScentConflict(error);
  return data;
}

// ข้อมูลสูตรบนสินค้า = snapshot จากทะเบียน (PR-5) — ฟอร์มส่งมาแค่ formulaId
// ชื่อ/รหัส/วันที่ server เติมให้เอง ไม่รับค่าที่พิมพ์มา
//
// ⚠️ นี่คือจุดที่ปิดต้นเหตุของกอง "รอจัดระเบียบ": ตอนสามช่องนั้นพิมพ์เองได้
// prod จึงมี 10 แถวที่เอา *ชื่อกลิ่น* ไปกรอกช่องชื่อสูตร แล้วไม่มีใครกลับมาตรวจ
// (ดู loadUnsortedProducts) · โยน error เมื่อ id ไม่มีจริง — บันทึกผ่านแบบเงียบ ๆ
// โดยไม่ผูกอะไรเลยแย่กว่า เพราะสินค้าจะโผล่กลับมาเป็น "รอจัดระเบียบ" อีกรอบ
// ⚠️ ทุกทางที่ผูกสูตรเข้าสินค้า (สร้าง · แก้ · จัดระเบียบ) ผ่านฟังก์ชันนี้ —
// ด่าน 1 สูตร : 1 FG (มติ 2026-08-10) **ถอดแล้ว** — 1 สูตรผูกได้หลาย FG (มติผู้ใช้ 2026-09-22 · ม-150)
//
// `forProductId` = สินค้าที่กำลังบันทึก — แก้สินค้าเดิมที่ถือสูตรนี้อยู่แล้วต้องผ่าน
export async function productFormulaSnapshot(supabase, formulaId, { forProductId = null } = {}) {
  // ⚠️ ตอนล้างสูตร **ไม่แตะ scentId** — สินค้าที่ RD จัดระเบียบว่าเป็น "กลิ่น"
  // (scentId มีค่า, formulaId ว่าง) ต้องรอดจากการกดบันทึกฟอร์มแก้ทั่วไป
  // การล้าง scentId ตอนถอดสูตรเป็นหน้าที่ของ PATCH (ซึ่งรู้ค่าเดิมของแถว)
  const empty = { formulaId: null, formulaCode: null, formulaName: null, formulaDate: null };
  if (!formulaId) return empty;
  const formula = await findFormula(supabase, formulaId);
  if (!formula) throw new Error('ไม่พบสูตรที่เลือกในทะเบียนสูตร');

  /* ⭐ **1 สูตรผูกได้หลาย FG** (มติผู้ใช้ 2026-09-22 · ม-150 · mig 0373 ถอด `products_formula_uk`) — เดิม 1 สูตร : 1 FG
     (mig 0231) ⇒ ลูกค้าที่ได้รับแชร์สูตรทำ FG ของตัวเองไม่ได้ และสร้างสูตรซ้ำคู่เดิมก็ไม่ได้ (ตัวตนสูตร = หมวด × กลิ่น)
     · `forProductId` ไม่ได้ใช้ตัดสินแล้ว — คงรับไว้ให้ผู้เรียกเดิมไม่ต้องแก้ */
  void forProductId;
  return {
    formulaId: formula.id,
    formulaCode: formula.code || null,
    formulaName: formula.name || null,
    formulaDate: formula.formulaDate || null,
    // กลิ่นของสินค้า derive จากสูตรเสมอ (FG → สูตร → กลิ่น) — ไม่ให้กรอกเอง
    scentId: formula.scentId || null,
  };
}

/* ── แหล่งของช่องราคา (F → กลิ่น · B/FB → สูตร) — ด่านเดียวของทุกทางใส่ราคา (รีวิว ม-148 รอบสอง) ──────────
   ⭐ ขั้นใส่ราคาในคำร้องกับปุ่มราคาหน้าทะเบียนสูตรต้องตัดสินเหมือนกัน — เดิมหน้าทะเบียนตรวจสถานะกลิ่นก่อนใส่ F
   แต่ขั้นในคำร้องไม่ตรวจ ⇒ กลิ่นที่เลิกใช้ไปแล้วยังได้ราคา F ใหม่จากคำร้อง
   คืน `{ source, error }` (รูปที่ `priceRegistrySlots` ใช้) */
export async function loadPriceSlotSource(supabase, slot) {
  if (slot.stampColumn === 'formulaId') {
    const formula = await findFormula(supabase, slot.id);
    return formula ? { source: formula } : { source: null, error: 'ไม่พบสูตรในทะเบียน' };
  }
  const scent = await findScent(supabase, slot.id);
  if (!scent) return { source: null, error: 'ไม่พบกลิ่นในทะเบียน — ใส่ราคา F ไม่ได้' };
  if (!isScentUsable(scent)) {
    return {
      source: null,
      error: `กลิ่น ${scent.code || scent.name} สถานะ "${SCENT_STATUS_LABELS[scent.status] || scent.status}" ยังใส่ราคา F ไม่ได้`,
    };
  }
  return { source: scent };
}

/* ── ช่องราคาของแถวคำร้อง — คิดจาก **ทะเบียนสด** ที่เดียว (รีวิว ม-148 รอบสาม) ─────────────────────────
   ⭐ ขั้นใส่ราคา (POST) กับโมดัลบนจอ (GET ติดผลนี้ให้แถวที่รอราคา) ถามตัวนี้ตัวเดียว — เดิมโมดัลคิดจากสแนปช็อตของแถว
   ส่วน API คิดจากสูตรสด ⇒ RD แก้กลิ่นของสูตร/กลิ่นเลิกใช้ แล้วโมดัลเปิดช่องที่ API ตีกลับ ทั้งชุดบันทึกไม่ได้
   · แถวผูกสูตร: F ลงกลิ่นของ **สูตร** · หมวดของสูตร (02-020 = F อย่างเดียว) · กลิ่นใช้ไม่ได้ = ไม่มีช่อง F
   · แถวกลิ่นอย่างเดียว / สูตรหาไม่เจอ: ถอยไปตัวคิดจากแถว (`rowPriceSlots`) */
export async function rowPriceSlotsLive(supabase, row) {
  if (!row?.producedFormulaId) return rowPriceSlots(row);
  const formula = await findFormula(supabase, row.producedFormulaId);
  if (!formula) return rowPriceSlots(row);
  const scent = formula.scentId ? await findScent(supabase, formula.scentId) : null;
  return priceSlotsFor({
    scentId: formula.scentId || null,
    formulaId: formula.id,
    // หมวดของ **สูตร** อย่างเดียว — กติกาเดียวกับปุ่มราคาหน้าทะเบียนสูตรและ withFragranceOilPrice (รีวิวรอบสี่)
    categoryCode: formula.categoryCode || null,
    scentUsable: scent ? isScentUsable(scent) : true,
  });
}

/* ของที่ชี้เข้ากลิ่น/สูตรด้วย FK แบบ SET NULL (ไม่อยู่ใน `countRegistryRefs`) — ด่านก่อนลบ (ม-148 · รีวิว 2026-09-22)
   · กลิ่น: สูตรที่ใช้กลิ่นนี้ (ทุกสถานะ) + สินค้า + กลิ่นที่แก้ต่อจากมัน · สูตร: สินค้า + สูตรที่แก้ต่อจากมัน
   ⚠️ คืนเลข ไม่ตัดสินเอง — ข้อความอยู่ที่ `deleteScentError` / `deleteFormulaError` ตัวเดียวกับหน้าทะเบียน */
export async function countRegistryDependents(supabase, kind, id) {
  const head = (table, column) => supabase.from(table)
    .select('id', { count: 'exact', head: true }).eq(column, id)
    .then(({ count, error }) => { if (error) throw error; return count || 0; });
  if (kind === 'formula') {
    const [productCount, childCount] = await Promise.all([
      head('products', 'formulaId'), head('formulas', 'derivedFromFormulaId'),
    ]);
    return { productCount, childCount };
  }
  // `childCount` = กลิ่นที่แก้ต่อจากกลิ่นนี้ (`scents.derivedFromScentId` SET NULL) — กติกาเดียวกับฝั่งสูตร
  const [formulaCount, productCount, childCount] = await Promise.all([
    head('formulas', 'scentId'), head('products', 'scentId'), head('scents', 'derivedFromScentId'),
  ]);
  return { formulaCount, productCount, childCount };
}

// จำนวนสินค้าที่อ้างสูตรนี้ — ใช้เป็นด่านก่อนลบ
export async function countProductsUsingFormula(supabase, formulaId) {
  const { count, error } = await supabase
    .from('products').select('id', { count: 'exact', head: true }).eq('formulaId', formulaId);
  if (error) throw error;
  return count || 0;
}

// ── "รอจัดระเบียบ": สินค้าที่มีชื่อสูตรแต่ยังไม่ผูกทะเบียน ────────────────
// migration ตั้งใจไม่ backfill กลุ่มนี้ (ชื่อส่วนใหญ่คือ *ชื่อกลิ่น* ไม่ใช่สูตร)
export async function loadUnsortedProducts(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, productDescription, customerId, customerName, formulaName, formulaCode, formulaDate, formulaId, scentId')
    .is('formulaId', null)
    .is('scentId', null)
    .not('formulaName', 'is', null);
  if (error) throw error;
  return data || [];
}

// ผูกสินค้ากลับไปที่ทะเบียนหลัง RD ตัดสินว่าแถวนั้นเป็นกลิ่นหรือสูตร
//
// สามช่องข้อความเดิมต้องถูกจัดการไปพร้อมกัน ไม่งั้นแถวจะ "ผูกแล้วแต่ยังโชว์ของเก่า":
//   เป็นสูตร → เขียนทับด้วย snapshot จากทะเบียน (ชื่อที่ RD ตั้งอาจไม่เท่าที่พิมพ์ไว้)
//   เป็นกลิ่น → ล้างทิ้ง เพราะค่านั้น *ไม่เคยเป็นข้อมูลสูตร* มาตั้งแต่แรก
//               (ตัวกลิ่นย้ายไปอยู่ในทะเบียนกลิ่นแล้ว หน้าสินค้าอ่านผ่าน scentId)
export async function linkProductToRegistry(supabase, productId, { formulaId = null, scentId = null }) {
  const patch = { updatedAt: new Date().toISOString() };
  if (formulaId) Object.assign(patch, await productFormulaSnapshot(supabase, formulaId, { forProductId: productId }));
  if (scentId) {
    patch.scentId = scentId;
    patch.formulaName = null; patch.formulaCode = null; patch.formulaDate = null;
  }
  const { data, error } = await supabase
    .from('products').update(patch).eq('id', productId).select('id').single();
  if (error) throw error;
  return data;
}

// ── ราคาล่าสุดของทะเบียน — F ผูกกลิ่น · FB ผูกสูตร ────────────────────────
//
// ⭐ **ราคาไม่ได้อยู่ในทะเบียนกลิ่น/สูตร มันอยู่ที่ทะเบียนวัสดุ** (`material_prices`)
// ซึ่งมี rev · ชั้นจำนวน · อายุราคา และเป็นตัวที่ใบขอราคาผลิตดึงไปใช้จริง
// (`fill-prices`) · คำร้องพัฒนากลิ่น/สูตรตอบราคาแล้วเขียนลงที่นั่นพร้อมประทับ
// `scentId`/`formulaId` ไว้ตั้งแต่ mig 0171
//
// ⇒ ทะเบียนกลิ่น/สูตร **แสดง** ราคาจากที่นั่น ไม่เก็บสำเนาของตัวเอง
// ⚠️ เก็บสำเนาเมื่อไรก็ได้ราคาสองแหล่งที่ขัดกันเองภายในไม่กี่เดือน แล้วไม่มีใคร
// ตอบได้ว่าใบขอราคาผลิตควรเชื่ออันไหน — โรคประจำถิ่นที่รีโปนี้จ่ายค่าเรียนมาหลายรอบ
//
// ⚠️ คืน `null` เมื่อยังไม่มีวัสดุผูก **ต่างจาก** `{ price: null }` ที่แปลว่าผูกแล้ว
// แต่ยังไม่มีใครใส่ราคา — สองอย่างนี้ผู้ใช้ต้องอ่านออกว่าคนละเรื่อง
// `as` = คีย์ที่ติดลงแถว (ตั้งต้น `price`) — หน้ารายละเอียดสูตรติดราคา B เพิ่มเป็น `basePrice` (ม-148)
// `today` = วันไทยที่ใช้ตัดสินหมดอายุ (ตั้งต้นวันนี้ตามนาฬิกาไทย · ส่งมาได้เพื่อเทสต์)
export async function attachRegistryPrice(supabase, rows, { column, kind, as = 'price', today = businessDate() }) {
  const ids = rows.map((r) => r.id).filter(Boolean);
  const materials = await loadMaterials(supabase, {
    status: null, kind, linked: { column, ids },
  });
  const byRow = new Map();
  const labelOf = new Map(rows.map((r) => [r.id, r.name]));
  for (const key of new Set(materials.map((m) => m[column]).filter(Boolean))) {
    // ⭐ ตัวเดียวกับที่ตัวเขียนราคาเลือก (`pickStampedMaterial`) — วัสดุสองตัวชี้แถวเดียวกันต้องไม่แสดงคนละตัว
    const m = pickStampedMaterial(materials, { stampColumn: column, id: key, kind, label: labelOf.get(key) });
    if (!m) continue;
    const rev = latestRevision(m.revisions || []);
    byRow.set(key, {
      materialId: m.id,
      /* 🐞 เดิมส่ง `rev` เป็นอาร์กิวเมนต์ที่สอง ทั้งที่ลายเซ็นคือ (material, todayIso) ⇒ `isRevisionExpired` ได้
         String(object) = "[object Ob" ซึ่งเรียงเหนือทุก 'YYYY-MM-DD' ⇒ ราคาทุกตัวบนทะเบียนกลิ่น/สูตรขึ้น "หมดอายุ"
         · วันนี้ต้องมาจากนาฬิกาไทย (businessDate) ไม่ใช่ UTC — ก่อน 07:00 ไทย UTC ยังเป็นเมื่อวาน */
      state: materialPriceState(m, today),
      unitPrice: revisionUnitPrice(rev),
      range: revisionPriceRange(rev),
      validUntil: rev?.validUntil || null,
      revisionNo: rev?.revisionNo ?? null,
    });
  }
  return rows.map((r) => ({ ...r, [as]: byRow.get(r.id) || null }));
}

/* ── ใบเดียวพร้อมของประกอบ — ใช้โดยหน้ารายละเอียด ────────────────────────
 * ⚠️ ต้องต่อ "ที่มา" และ "ราคา" ชุดเดียวกับหน้ารายการ ไม่งั้นเปิดใบเดียวกันจาก
 * สองทางแล้วเห็นข้อมูลไม่เท่ากัน — โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์ม
 */
export async function findScentDetail(supabase, id) {
  const scent = await findScentShared(supabase, id);
  if (!scent) return null;
  const [withSource] = await attachScentSource(supabase, [scent]);
  const [withPrice] = await attachRegistryPrice(supabase, [withSource], {
    column: 'scentId', kind: 'RM_F',
  });
  return attachScentDelivery(supabase, withPrice);
}

/* ⭐ **กลิ่นนี้ส่งเป็นอะไร + สูตรที่ใช้กลิ่นนี้** (ม-148) — ปุ่ม "ใส่ราคา F" บนทะเบียนกลิ่นเป็นทางที่ราคา
   ผิดชนิดเข้ามามากที่สุด (วัด prod 2026-09-22: 14 จาก 18 ราคา F มาจากปุ่มนี้ · 8 ตัวเป็น EDP) เพราะหน้า
   กลิ่นไม่รู้เลยว่ามีสูตร ⇒ ติดสองอย่างให้หน้ารายละเอียด/โมดัลราคาเตือนได้ (`scentFPriceNotice`)
   · `deliveredCategoryCode` = หมวดที่แถวคำร้องบันทึกตอนส่ง (null = ส่งก่อน ม-148 หรือเพิ่มตรงจากทะเบียน)
   · `formulas` = สูตรที่ยังไม่เลิกใช้ของกลิ่นนี้ (ก้อนเล็ก — ไม่ส่งทั้งแถวทะเบียน)
   ⚠️ เฉพาะหน้ารายละเอียด — `loadScents` เป็นตัวเลือกกลิ่นทั้งระบบ ไม่ลากสอง query นี้ไปทุกดรอปดาวน์ */
async function attachScentDelivery(supabase, scent) {
  const [{ data: rows, error: rowError }, { data: formulas, error: formulaError }] = await Promise.all([
    supabase.from('dept_request_items').select('"categoryCode", "producedFormulaId"')
      .eq('producedScentId', scent.id).not('categoryCode', 'is', null).limit(1),
    supabase.from('formulas').select('id, code, name, "categoryCode", status')
      .eq('scentId', scent.id).neq('status', 'archived').order('code'),
  ]);
  if (rowError) throw rowError;
  if (formulaError) throw formulaError;
  return {
    ...scent,
    deliveredCategoryCode: rows?.[0]?.categoryCode || null,
    formulas: formulas || [],
  };
}

export async function findFormulaDetail(supabase, id) {
  const formula = await findFormulaShared(supabase, id);
  if (!formula) return null;
  const [withSource] = await attachFormulaSource(supabase, [formula]);
  const [withPrice] = await attachRegistryPrice(supabase, [withSource], {
    column: 'formulaId', kind: 'RM_FB',
  });
  /* ⭐ ม-148 — สูตรมีสามราคา: FB (`price` · ช่องหลักของการ์ด) · B ของสูตรเอง (`basePrice`) ·
     F ของกลิ่นที่สูตรใช้ (`scentPrice` — ราคาเป็นของกลิ่น ไม่ใช่สำเนา) · หน้ารายการยังโชว์ FB ช่องเดียว */
  const [withBase] = await attachRegistryPrice(supabase, [withPrice], {
    column: 'formulaId', kind: 'RM_B', as: 'basePrice',
  });
  // กลิ่นก่อน — `withFragranceOilPrice` ต้องรู้สถานะกลิ่น (ตัดสินชุดเดียวกับ priceSlotsFor)
  const scent = withBase.scentId ? await findScent(supabase, withBase.scentId) : null;
  const [withOil] = await withFragranceOilPrice(supabase, [{ ...withBase, scentStatus: scent?.status || null }]);
  if (!withOil.scentId) return { ...withOil, scentPrice: null };
  const [scentRow] = await attachRegistryPrice(supabase, [{ id: withOil.scentId }], {
    column: 'scentId', kind: 'RM_F',
  });
  return { ...withOil, scentPrice: scentRow?.price || null };
}

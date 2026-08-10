// ── ทะเบียนกลิ่น + สูตร (mig 0171) — ชั้นเข้าถึงข้อมูล (server only) ──────
//
// ⚠️ ทุก query ที่นี่ต้องอ่าน `error` เสมอ — `const { data } = await supabase…`
// ทิ้ง error ทำให้ schema error กลายเป็น "ไม่พบ X" แล้วไล่หาสาเหตุไม่เจอ
// (เคยหลุด prod มาแล้ว: คอลัมน์ที่ไม่มีจริงทำให้เปิดใบขอราคาผลิตไม่ได้ทั้งหน้า)
import { genId } from '@/lib/id';
import { loadMaterials } from '@/lib/materialPricesAdmin';
import {
  latestRevision, materialPriceState, revisionPriceRange, revisionUnitPrice,
} from '@/lib/materialPrices';
import { derivedFromError, newScentStatus, normalizeScentInput } from '@/lib/master/scents';
import { formulaScentCustomerError, derivedFromFormulaError, normalizeFormulaInput } from '@/lib/master/formulas';

// ── กลิ่น ────────────────────────────────────────────────────────────────
//
// ⭐ **กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต** (มติ: แก้แล้วได้กลิ่นตัวใหม่ที่มีรหัส
// ชื่อ วันที่ ของตัวเอง ไม่ใช่ Rev. ของตัวเดิม) ⇒ ไม่มีตารางรอบให้ join อีกแล้ว
// วันที่ส่งย้ายมาอยู่บนตัวกลิ่นเอง (`sentAt` — mig 0205 ยกมาจาก scent_revisions)
export async function loadScents(supabase, { status = null, customerId = null } = {}) {
  let query = supabase.from('scents').select('*');
  if (status) query = query.in('status', Array.isArray(status) ? status : [status]);
  if (customerId) query = query.eq('customerId', customerId);
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  const withSource = await attachScentSource(supabase, data || []);
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

// ด่านสายพันธุ์ที่ต้องถาม DB — โยน Error เป็นภาษาไทยให้ route ตอบ 400 ตามเดิม
//
// ⚠️ อยู่ที่นี่ ไม่ใช่แค่กรองตัวเลือกบนจอ — ตัวเลือกที่กรองแล้วกันคนกดผิด
// แต่ไม่กันคนยิง API ตรง · กลิ่นข้ามลูกค้าเป็นข้อห้ามระดับโมเดล (มติ 9)
export async function assertDerivedFromScent(supabase, { derivedFromScentId, customerId, id }) {
  if (!derivedFromScentId) return;
  const parent = await findScent(supabase, derivedFromScentId);
  const error = derivedFromError(parent, { customerId, id });
  if (error) throw new Error(error);
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
    // ⭐ **เลือกสถานะได้ตอนสร้าง** (มติผู้ใช้ 2026-08-08) — ทางเพิ่มตรงมีไว้ลงกลิ่นเดิม
    // ที่ลูกค้าอนุมัติไปแล้ว ⇒ ควรเป็น `active` ตั้งแต่แรก ไม่ใช่บังคับ `developing`
    // แล้วให้ RD กดเปลี่ยนอีกรอบทุกใบ
    // ⚠️ `newScentStatus` จำกัดไว้เฉพาะสองสถานะที่ "ของจริงแล้ว" และเฉพาะตอน RD
    // เป็นคนสร้าง — ฝ่ายขายยังได้ `draft` เสมอ (ใส่รหัส = รับเข้าทะเบียน เป็นอำนาจ RD)
    status: newScentStatus(input.status, accepted),
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
  let query = supabase.from('formulas').select('*');
  if (status) query = query.in('status', Array.isArray(status) ? status : [status]);
  if (customerId) query = query.eq('customerId', customerId);
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  const withSource = await attachFormulaSource(supabase, data || []);
  // ราคา FB ของสูตร — คู่ขนานกับ F ของกลิ่น
  return attachRegistryPrice(supabase, withSource, { column: 'formulaId', kind: 'RM_FB' });
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
    const scent = await findScent(supabase, scentId);
    if (!scent) throw new Error('ไม่พบกลิ่นที่เลือกในทะเบียนกลิ่น');
    const mismatch = formulaScentCustomerError(scent, { customerId });
    if (mismatch) throw new Error(mismatch);
    // ผ่านด่านแล้ว = ลูกค้าของสูตรกับของกลิ่นเป็นคนเดียวกัน ⇒ ใช้ชื่อจากกลิ่นได้เลย
    return { customerId: scent.customerId, customerName: scent.customerName ?? null };
  }
  if (!customerId) return { customerId: null, customerName: null };
  // ⚠️ ต้องแยก error ออกจาก "ไม่เจอ" — ทิ้ง error แล้วเช็ค `!data` ทำให้ปัญหาการอ่าน
  // กลายเป็น "ไม่พบลูกค้า" แล้วไล่ผิดทางยาว (มี ratchet test คุมทั้งรีโป)
  const { data, error } = await supabase
    .from('customers').select('id, name').eq('id', customerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ไม่พบลูกค้าที่เลือก');
  return { customerId: data.id, customerName: data.name ?? null };
}

export async function assertDerivedFromFormula(supabase, { derivedFromFormulaId, customerId, id }) {
  if (!derivedFromFormulaId) return;
  const parent = await findFormula(supabase, derivedFromFormulaId);
  const error = derivedFromFormulaError(parent, { customerId, id });
  if (error) throw new Error(error);
}

// `fallbackCustomer` ใช้ได้เฉพาะตอน **ไม่มีกลิ่น** — ทางเดียวที่ยังส่งมาคือ
// "จัดระเบียบ" ซึ่งย้ายสินค้าของลูกค้ารายหนึ่งมาเป็นสูตรฐาน · ฟอร์มทะเบียนไม่ส่ง
// ค่านี้เลย และห้ามส่ง (นั่นคือรูที่ 0207 ปิดไป)
export async function createFormula(supabase, input, user, {
  accepted = false, fallbackCustomer = null,
} = {}) {
  const { value, error } = normalizeFormulaInput(input);
  if (error) throw new Error(error);
  if (accepted && !value.code) throw new Error('ต้องระบุรหัสสูตร');

  // fallbackCustomer ยังใช้ได้เฉพาะทาง "จัดระเบียบ" ที่ไม่ได้ส่งลูกค้ามา (ดูหัวข้อบน)
  const picked = await customerForFormula(supabase, value);
  const customer = picked.customerId ? picked : (fallbackCustomer || picked);
  await assertDerivedFromFormula(supabase, { ...value, ...customer });

  const nowIso = new Date().toISOString();
  const row = {
    id: genId('FML'),
    ...value,
    ...customer,
    // RD ที่สร้างเองเป็นเจ้าของสูตรโดยปริยาย (ตรงกับทะเบียนกลิ่น)
    ownerId: accepted ? user?.id ?? null : null,
    ownerName: accepted ? user?.name ?? null : null,
    status: accepted ? 'active' : 'draft',
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
export async function productFormulaSnapshot(supabase, formulaId) {
  const empty = { formulaId: null, formulaCode: null, formulaName: null, formulaDate: null };
  if (!formulaId) return empty;
  const formula = await findFormula(supabase, formulaId);
  if (!formula) throw new Error('ไม่พบสูตรที่เลือกในทะเบียนสูตร');
  return {
    formulaId: formula.id,
    formulaCode: formula.code || null,
    formulaName: formula.name || null,
    formulaDate: formula.formulaDate || null,
  };
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
  if (formulaId) Object.assign(patch, await productFormulaSnapshot(supabase, formulaId));
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
export async function attachRegistryPrice(supabase, rows, { column, kind }) {
  const ids = rows.map((r) => r.id).filter(Boolean);
  const materials = await loadMaterials(supabase, {
    status: null, kind, linked: { column, ids },
  });
  const byRow = new Map();
  for (const m of materials) {
    const key = m[column];
    if (!key) continue;
    const rev = latestRevision(m.revisions || []);
    byRow.set(key, {
      materialId: m.id,
      state: materialPriceState(m, rev),
      unitPrice: revisionUnitPrice(rev),
      range: revisionPriceRange(rev),
      validUntil: rev?.validUntil || null,
      revisionNo: rev?.revisionNo ?? null,
    });
  }
  return rows.map((r) => ({ ...r, price: byRow.get(r.id) || null }));
}

/* ── ใบเดียวพร้อมของประกอบ — ใช้โดยหน้ารายละเอียด ────────────────────────
 * ⚠️ ต้องต่อ "ที่มา" และ "ราคา" ชุดเดียวกับหน้ารายการ ไม่งั้นเปิดใบเดียวกันจาก
 * สองทางแล้วเห็นข้อมูลไม่เท่ากัน — โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์ม
 */
export async function findScentDetail(supabase, id) {
  const scent = await findScent(supabase, id);
  if (!scent) return null;
  const [withSource] = await attachScentSource(supabase, [scent]);
  const [withPrice] = await attachRegistryPrice(supabase, [withSource], {
    column: 'scentId', kind: 'RM_F',
  });
  return withPrice;
}

export async function findFormulaDetail(supabase, id) {
  const formula = await findFormula(supabase, id);
  if (!formula) return null;
  const [withSource] = await attachFormulaSource(supabase, [formula]);
  const [withPrice] = await attachRegistryPrice(supabase, [withSource], {
    column: 'formulaId', kind: 'RM_FB',
  });
  return withPrice;
}

// ── ทะเบียนกลิ่น + สูตร (mig 0171) — ชั้นเข้าถึงข้อมูล (server only) ──────
//
// ⚠️ ทุก query ที่นี่ต้องอ่าน `error` เสมอ — `const { data } = await supabase…`
// ทิ้ง error ทำให้ schema error กลายเป็น "ไม่พบ X" แล้วไล่หาสาเหตุไม่เจอ
// (เคยหลุด prod มาแล้ว: คอลัมน์ที่ไม่มีจริงทำให้เปิดใบขอราคาผลิตไม่ได้ทั้งหน้า)
import { genId } from '@/lib/id';
import { normalizeScentInput } from '@/lib/master/scents';
import { normalizeFormulaInput } from '@/lib/master/formulas';

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
  return data || [];
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

export async function createScent(supabase, input, user, { accepted = false } = {}) {
  const { value, error } = normalizeScentInput(input);
  if (error) throw new Error(error);
  // รับเข้าทะเบียนตั้งแต่แรกได้เฉพาะตอน RD เป็นคนสร้าง และต้องมีรหัสมาด้วย
  if (accepted && !value.code) throw new Error('ต้องระบุรหัสกลิ่น');

  const nowIso = new Date().toISOString();
  const row = {
    id: genId('SCT'),
    ...value,
    status: accepted ? 'developing' : 'draft',
    // RD ที่สร้างเองเป็นเจ้าของกลิ่นโดยปริยาย — ฝ่ายขายเปิดร่างยังไม่มีเจ้าของ
    ownerId: value.ownerId || (accepted ? user?.id ?? null : null),
    ownerName: value.ownerName || (accepted ? user?.name ?? null : null),
    acceptedById: accepted ? user?.id ?? null : null,
    acceptedByName: accepted ? user?.name ?? null : null,
    acceptedAt: accepted ? nowIso : null,
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
  return data || [];
}

export async function findFormula(supabase, id) {
  const { data, error } = await supabase.from('formulas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createFormula(supabase, input, user, { accepted = false } = {}) {
  const { value, error } = normalizeFormulaInput(input);
  if (error) throw new Error(error);
  if (accepted && !value.code) throw new Error('ต้องระบุรหัสสูตร');

  const nowIso = new Date().toISOString();
  const row = {
    id: genId('FML'),
    ...value,
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

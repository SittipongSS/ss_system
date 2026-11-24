// ── "ต่อจากคำร้อง" + บรีฟ "แก้จากกลิ่น" — ฝั่ง DB (ม-164 PR-4) ──────────────────────────────────────
//
// ⭐ ตัวตัดสินอยู่ที่ `scentContinue.js` (logic ล้วน) · ไฟล์นี้โหลดแถวมาให้มันตัดสิน
// ⭐ ตัวหาพี่น้องนิติบุคคลรับเป็นพารามิเตอร์ (`deps.siblings`) — เทสต์ส่งตัวจำลองเข้ามา (ห้ามต่อฐานจริง)
// ⚠️ ทุกคำสั่งอ่านมีขอบเขต (`fetchAllInChunks` · `.limit`) — `dept_requests` อยู่ใน check:rowcap
import { customerTaxSiblingIds } from '@/lib/master/customerTaxSiblings';
import { attachShares } from '@/lib/master/registrySharesAdmin';
import { scentUsableByCustomer } from '@/lib/master/registryShares';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { continueRequestError } from '@/lib/requests/scentContinue';
import { scentRef } from '@/lib/master/registryLabel';

const defaultDeps = { siblings: customerTaxSiblingIds };
// ใบของลูกค้ารายหนึ่ง (ทั้งนิติบุคคล) — เพดานกันพัง ไม่ใช่กติกา (ลูกค้าที่มีคำร้องพัฒนากลิ่นเกินนี้ = ต้องค้นด้วยเลขที่)
const CANDIDATE_LIMIT = 100;

/**
 * ตรวจใบเดิมที่จะ "ต่อจาก" — คืน `{ error, prev }` · `prevId` ว่าง = ไม่ต่อจากใบไหน (ผ่าน)
 * @param customerId  ลูกค้าของใบที่กำลังเปิด/แก้ (derive จาก SO/ดีล — ไม่ใช่ค่าที่ client ส่ง)
 */
export async function checkContinueTarget(supabase, { prevId, requestId = null, kind, customerId }, deps = {}) {
  const { siblings } = { ...defaultDeps, ...deps };
  const id = String(prevId ?? '').trim();
  if (!id) return { error: null, prev: null };
  const { data: prev, error } = await supabase.from('dept_requests')
    .select('id, "docNo", kind, status, "customerId"').eq('id', id).maybeSingle();
  if (error) throw error;
  const siblingIds = customerId ? await siblings(supabase, customerId) : [];
  const sameTaxEntity = !!prev && !!customerId && siblingIds.includes(prev.customerId);
  return { error: continueRequestError({ requestId, kind, prev, sameTaxEntity }), prev: prev || null };
}

/**
 * คำร้องพัฒนากลิ่นของลูกค้าเดียวกัน (นิติบุคคล) ที่ใบใหม่ "ต่อจาก" ได้ — ใหม่สุดก่อน · ไม่รวมใบยกเลิก
 * @returns `[{ id, docNo, title, status, createdAt, confirmedScentIds }]`
 * ⚠️ `canRead(row)` = ด่านอ่านรายใบของผู้เรียก — ลิสต์ต้องไม่โชว์เลขที่ของใบที่คนเปิดฟอร์มเปิดไม่ได้
 */
export async function loadContinueCandidates(supabase, { customerId, excludeId = null, canRead = () => true }, deps = {}) {
  const { siblings } = { ...defaultDeps, ...deps };
  if (!customerId) return [];
  const customerIds = await siblings(supabase, customerId);
  const rows = (await fetchAllInChunks(customerIds, (chunk) => supabase
    .from('dept_requests').select('id, "docNo", title, status, kind, dept, team, "requestedById", "customerId", "createdAt"')
    .in('customerId', chunk).eq('kind', 'scent_dev').neq('status', 'cancelled')
    .order('id', { ascending: true })))
    .filter((r) => r.id !== excludeId && canRead(r))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, CANDIDATE_LIMIT);
  const confirmed = await fetchAllInChunks(rows.map((r) => r.id), (chunk) => supabase
    .from('dept_request_items').select('id, "requestId", "producedScentId"')
    .in('requestId', chunk).eq('outcome', 'confirmed').order('id', { ascending: true }));
  const scentsOf = new Map();
  for (const item of confirmed) {
    if (!item.producedScentId) continue;
    if (!scentsOf.has(item.requestId)) scentsOf.set(item.requestId, []);
    scentsOf.get(item.requestId).push(item.producedScentId);
  }
  return rows.map((r) => ({
    id: r.id, docNo: r.docNo || null, title: r.title || null, status: r.status, createdAt: r.createdAt || null,
    confirmedScentIds: [...new Set(scentsOf.get(r.id) || [])],
  }));
}

/**
 * กลิ่นตั้งต้นของบรีฟต้องมีจริงและเป็นของลูกค้าเดียวกัน (นิติบุคคล · หรือแชร์ให้) — คืนข้อความไทย หรือ null
 * @param keep  `(sourceScentId) => boolean` — กลิ่นเดิมของบรีฟเดิม (ไม่ตรวจซ้ำ · ย้ายเจ้าของทีหลังไม่ล็อกการบันทึกช่องอื่น)
 * ⚠️ ไม่บังคับสถานะกลิ่น — กลิ่นที่เลิกใช้แล้วก็เป็นต้นทางของการแก้ได้
 */
export async function briefSourceScentError(supabase, briefs = [], { customerId, keep = () => false }, deps = {}) {
  const { siblings } = { ...defaultDeps, ...deps };
  const ids = [...new Set((briefs || []).map((b) => b?.sourceScentId).filter((id) => id && !keep(id)))];
  if (!ids.length) return null;
  const { data, error } = await supabase.from('scents').select('id, code, name, "producedAt", "customerId", status').in('id', ids);
  if (error) throw error;
  const scents = await attachShares(supabase, data || [], 'scent');
  const byId = new Map(scents.map((s) => [s.id, s]));
  const siblingIds = customerId ? await siblings(supabase, customerId) : [];
  for (const [i, brief] of (briefs || []).entries()) {
    const id = brief?.sourceScentId;
    if (!id || keep(id)) continue;
    const at = `บรีฟ "${brief.label || `กลิ่นที่ ${i + 1}`}"`;
    const scent = byId.get(id);
    if (!scent) return `${at}: ไม่พบกลิ่นตั้งต้นในทะเบียน — อาจถูกลบไปแล้ว เลือกใหม่`;
    if (customerId && !siblingIds.includes(scent.customerId) && !scentUsableByCustomer(scent, customerId)) {
      return `${at}: กลิ่น ${scentRef(scent)} เป็นของลูกค้ารายอื่น — เลือกได้เฉพาะกลิ่นของลูกค้าเจ้าของใบ`;
    }
  }
  return null;
}

/**
 * ลิงก์สองทางของใบ — `continuesRequest` (ใบที่ใบนี้ต่อจาก) · `continuedBy` (ใบที่ต่อจากใบนี้)
 * ⚠️ คอลัมน์ยังไม่มี (mig 0436 ไม่รัน) = ไม่มีลิงก์ ไม่ล้มทั้งหน้า
 */
export async function loadContinueRefs(supabase, request) {
  try {
    const prevId = request.continuesRequestId || null;
    const [{ data: prev, error: prevError }, { data: next, error: nextError }] = await Promise.all([
      prevId
        ? supabase.from('dept_requests').select('id, "docNo", status').eq('id', prevId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('dept_requests').select('id, "docNo", status')
        .eq('continuesRequestId', request.id).neq('status', 'cancelled')
        .order('createdAt', { ascending: true }).limit(50),
    ]);
    if (prevError) throw prevError;
    if (nextError) throw nextError;
    return { continuesRequest: prev || null, continuedBy: next || [] };
  } catch (error) {
    if (/continuesRequestId|does not exist|could not find/i.test(String(error?.message || ''))) {
      return { continuesRequest: null, continuedBy: [] };
    }
    throw error;
  }
}

// ── ที่เก็บลิงก์ "คำร้องขอเอกสารการเงิน ↔ งวด" (mig 0413) — ฝั่ง server เท่านั้น ──────────────────────────────────────
//
// กติกาล้วนอยู่ที่ `installmentRequests.js` (มีเทสต์) · ไฟล์นี้แตะฐานอย่างเดียว (รับ `supabase` จากผู้เรียก)
// ⭐ สามงานของไฟล์นี้:
//   ① `loadInstallmentRequests` — ตัวโหลดเดียวของทุกจอ: คำร้องที่ `installmentId` ชี้งวด ∪ คำร้องที่ตัวชี้ (0260) ชี้อยู่
//      · ฐานยังไม่รัน 0413 = โหลดทางตัวชี้อย่างเดียว (จอไม่พัง · แถวไม่มีคีย์ `installmentId` ⇒ กติกาถอยไปใช้ตัวชี้เอง)
//   ② `syncBillingPointers` — ตัวเขียนตัวชี้ที่เดียว (SQL ของ 0376/0377/0378 อ่านตัวชี้ตัดสินแถวล็อก)
//   ③ `claimPendingRequests` / `releaseInstallmentRequests` — ผูกคำร้องที่เลือกงวดจากแผน QT ไว้ตอนสร้างแถวงวด · ปล่อยก่อนลบแถว
// ⚠️ supabase ไม่ throw — ทุกตัวอ่าน `error` เอง · ①② คืน `{ error }` ให้ผู้เรียกตัดสินว่าดังแค่ไหน · ③ ไม่โยน (ผู้เรียกคือการสร้าง/
//   อนุมัติใบ — ผูกไม่สำเร็จต้องไม่ลากงานหลักล้ม · คำร้องยังแนบเองได้จากการ์ดการชำระ)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { billingPointerFor } from '@/lib/sales/installmentRequests';

const REQUESTS = 'dept_requests';
const INSTALLMENTS = 'sales_order_installments';
const KIND = 'billing_doc';
/* คอลัมน์ของ 0413 + เวลาสร้าง (ลำดับในงวด/ตัวชี้) — ตัวโหลดต่อท้าย select ของผู้เรียกให้เอง */
const LINK_COLUMNS = '"installmentId", "installmentSeq", "createdAt"';

const text = (value) => String(value ?? '').trim();
const isColumnMissing = (error) => error?.code === '42703' || error?.code === 'PGRST204';
const uniq = (values) => [...new Set(values.map(text).filter(Boolean))];

/**
 * คำร้องขอเอกสารการเงินของชุดงวด — ตัวโหลดเดียวของทุกจอ (หัวไฟล์ ①)
 *
 * @param rows   แถวงวด (`id` · `billingRequestId` ตัวชี้)
 * @param select คอลัมน์ของผู้เรียก **ไม่รวม** สองคอลัมน์ของ 0413 (ต่อท้ายให้เมื่อฐานพร้อม) · ต้องมี `id` `status`
 * @param includeIds id คำร้องที่ผู้เรียกอยากได้เพิ่ม (เช่นชุดตามใบเสนอราคาที่โหลดไว้แล้ว — ส่งมาเพื่อไม่โหลดซ้ำ ไม่ใช่ให้โหลดเพิ่ม)
 * @returns `{ data, error, schemaReady }` · `data` = แถวคำร้องไม่ซ้ำ (ฐานพร้อม = มีคีย์ `installmentId` ทุกแถว)
 *   ⚠️ อ่านพลาด = `error` (ห้ามถือว่า "ยังไม่ขอ" — ผู้เรียกโยนหรือบอกบนจอ)
 */
export async function loadInstallmentRequests(supabase, rows, { select = 'id, status', skipIds = [] } = {}) {
  const installmentIds = uniq((rows || []).map((row) => row?.id));
  const pointerIds = uniq((rows || []).map((row) => row?.billingRequestId));
  const skip = new Set(uniq(skipIds));
  const byId = new Map();
  let schemaReady = true;

  if (installmentIds.length) {
    const { data, error } = await fetchInChunks(installmentIds, (chunk) => fetchAllResult(() => supabase
      .from(REQUESTS).select(`${select}, ${LINK_COLUMNS}`)
      .in('installmentId', chunk).eq('kind', KIND)
      .order('id', { ascending: true })));
    if (error && isColumnMissing(error)) schemaReady = false;
    else if (error) return { data: [], error, schemaReady };
    else (data || []).forEach((request) => byId.set(request.id, request));
  }

  const missing = pointerIds.filter((id) => !byId.has(id) && !skip.has(id));
  if (missing.length) {
    const columns = schemaReady ? `${select}, ${LINK_COLUMNS}` : select;
    const { data, error } = await fetchInChunks(missing, (chunk) => fetchAllResult(() => supabase
      .from(REQUESTS).select(columns)
      .in('id', chunk).eq('kind', KIND)
      .order('id', { ascending: true })));
    if (error) return { data: [...byId.values()], error, schemaReady };
    (data || []).forEach((request) => byId.set(request.id, request));
  }
  return { data: [...byId.values()], error: null, schemaReady };
}

/**
 * เขียนตัวชี้ (`sales_order_installments."billingRequestId"`) ให้ตรงกับคำร้องที่ผูกจริง — ตัวเขียนตัวชี้ที่เดียว (หัวไฟล์ ②)
 *
 * ตัวชี้ที่ควรเป็น = คำร้องแรก (เก่าสุด · ทุกสถานะ) ที่ `installmentId` ชี้งวดนั้น (`billingPointerFor`) · ไม่มี = null
 * ⭐ ยกเว้นลิงก์รุ่นเก่า: ตัวชี้ชี้คำร้องที่ยังไม่มี `installmentId` (เขียนจากโค้ดก่อน 0413) และไม่มีคำร้องใหม่ผูกงวดนี้ = **คงไว้**
 *   (ล้างทิ้ง = ลิงก์ที่ผู้ใช้กดแนบไว้หายเงียบ ๆ)
 * ⭐ เขียนเฉพาะแถวที่ต่าง + ประทับ `updatedAt` (ตัวชี้เปลี่ยน = ล็อกปรับแผนเปลี่ยน ⇒ แผงที่เปิดค้างต้องได้ 409 ไม่ใช่เขียนทับ)
 * @param drop id คำร้องที่ห้ามคงไว้ในฐานะลิงก์รุ่นเก่า (ถอดลิงก์รุ่นเก่า — แถวคำร้องไม่มีอะไรให้ล้าง เหลือแค่ตัวชี้)
 * @returns `{ changed: [{ id, before, after }], error }` — ไม่ throw
 */
export async function syncBillingPointers(supabase, installmentIds, { now = null, drop = [] } = {}) {
  const ids = uniq(installmentIds || []);
  /* `drop` = คำร้องที่เพิ่งถูกถอดจากงวด — ห้ามคงไว้ในฐานะลิงก์รุ่นเก่า (ถอดลิงก์รุ่นเก่า = แถวคำร้องไม่เปลี่ยน เหลือแค่ตัวชี้ที่ต้องย้าย) */
  const dropped = new Set(uniq(drop || []));
  if (!ids.length) return { changed: [], error: null };
  try {
    const [linked, current] = await Promise.all([
      fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
        .from(REQUESTS).select('id, "installmentId", "createdAt"')
        .in('installmentId', chunk).eq('kind', KIND)
        .order('id', { ascending: true }))),
      fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
        .from(INSTALLMENTS).select('id, "billingRequestId"')
        .in('id', chunk)
        .order('id', { ascending: true }))),
    ]);
    if (linked.error) return { changed: [], error: linked.error };
    if (current.error) return { changed: [], error: current.error };
    const requests = linked.data || [];

    /* ตัวชี้ปัจจุบันที่ไม่มีคำร้องใหม่มาแทน — ต้องรู้ว่าเป็นลิงก์รุ่นเก่า (คำร้องยังไม่มี installmentId) หรือค้างจากการย้าย/ถอด */
    const stale = uniq((current.data || [])
      .filter((row) => row.billingRequestId && !billingPointerFor(row.id, requests))
      .map((row) => row.billingRequestId));
    const legacy = new Set();
    if (stale.length) {
      const { data, error } = await fetchInChunks(stale, (chunk) => fetchAllResult(() => supabase
        .from(REQUESTS).select('id, "installmentId"').in('id', chunk)
        .order('id', { ascending: true })));
      if (error) return { changed: [], error };
      (data || []).filter((request) => !text(request.installmentId)).forEach((request) => legacy.add(request.id));
    }

    const stamp = now || new Date().toISOString();
    const changed = [];
    for (const row of current.data || []) {
      const before = text(row.billingRequestId) || null;
      let after = billingPointerFor(row.id, requests);
      if (!after && before && legacy.has(before) && !dropped.has(before)) after = before;
      if (after === before) continue;
      const { error } = await supabase.from(INSTALLMENTS)
        .update({ billingRequestId: after, updatedAt: stamp }).eq('id', row.id);
      if (error) return { changed, error };
      changed.push({ id: row.id, before, after });
    }
    return { changed, error: null };
  } catch (error) {
    return { changed: [], error };
  }
}

/**
 * ผูกคำร้องที่ "เลือกงวดจากแผน QT" ไว้ตอนยังไม่มีแถวงวด — เรียกทันทีหลังสร้างแถวงวดจากแผน QT (`ensureInstallments`)
 *
 * ⭐ ณ วินาทีนั้นเลขงวด = เลขในแผน QT เป๊ะ ⇒ จับคู่ด้วย (ใบเสนอราคา, เลข) ได้ไม่เดา · หลังจากนี้ยึด id (หัวไฟล์ installmentRequests.js)
 * ⭐ ข้ามคำร้องที่ยกเลิกแล้ว — ผูกไปก็แค่ล็อกแถวจากปรับแผนโดยไม่มีประโยชน์ · ร่างผูกได้ (ผู้ใช้เลือกงวดไว้แล้ว)
 * ⭐ เติม `salesOrderId` ให้คำร้องที่ยังไม่อ้างใบสั่งขาย (คำร้องที่ขอจากหน้า QT) — อ้างใบอื่นอยู่แล้วไม่ทับ
 * ⚠️ เขียนแบบมีเงื่อนไข `installmentId IS NULL` — อีกคำขอผูกไปก่อนแล้วไม่ทับ
 * @returns `{ claimed: [{ requestId, installmentId }], error }` — ไม่ throw (ผู้เรียก log เอง)
 */
export async function claimPendingRequests(supabase, { order, rows } = {}) {
  const quotationId = text(order?.quotationId);
  const bySeq = new Map((rows || []).filter((row) => row?.id && Number(row.seq) > 0).map((row) => [Number(row.seq), row]));
  if (!quotationId || !bySeq.size) return { claimed: [], error: null };
  try {
    const { data, error } = await fetchAllResult(() => supabase
      .from(REQUESTS).select('id, status, "salesOrderId", "installmentSeq"')
      .eq('kind', KIND).eq('quotationId', quotationId)
      .is('installmentId', null).not('installmentSeq', 'is', null)
      .neq('status', 'cancelled')
      .order('id', { ascending: true }));
    if (error) return { claimed: [], error: isColumnMissing(error) ? null : error };
    const claimed = [];
    for (const request of data || []) {
      const row = bySeq.get(Number(request.installmentSeq));
      if (!row) continue;
      const patch = {
        installmentId: row.id,
        ...(text(request.salesOrderId) ? {} : { salesOrderId: order.id }),
      };
      const { data: done, error: writeError } = await supabase.from(REQUESTS)
        .update(patch).eq('id', request.id).is('installmentId', null)
        .select('id').maybeSingle();
      if (writeError) return { claimed, error: writeError };
      if (done) claimed.push({ requestId: request.id, installmentId: row.id });
    }
    if (claimed.length) {
      const sync = await syncBillingPointers(supabase, claimed.map((c) => c.installmentId));
      if (sync.error) return { claimed, error: sync.error };
    }
    return { claimed, error: null };
  } catch (error) {
    return { claimed: [], error };
  }
}

/**
 * ปล่อยคำร้องออกจากแถวงวดที่กำลังจะถูกลบ (ตั้งงวดใหม่ตอนอนุมัติ — freezeInstallments) — ล้างทั้ง id และเลข
 * ⭐ คงกติกาเดิม "ไม่อุ้มคำร้องข้ามการตั้งใหม่": แผนเปลี่ยนจำนวนงวด = ยอดเปลี่ยน ⇒ เลขเดิมไม่ได้แปลว่าเงินก้อนเดิม
 *   (ไม่ล้างเลข = `claimPendingRequests` ของชุดใหม่ผูกกลับตามเลขเงียบ ๆ) · คำร้องกลับไปเป็น "ไม่ระบุงวด" ให้คนแนบใหม่
 * @returns `{ released: [id คำร้อง], error }` — ไม่ throw · ฐานยังไม่รัน 0413 = ไม่มีอะไรให้ปล่อย
 */
export async function releaseInstallmentRequests(supabase, installmentIds) {
  const ids = uniq(installmentIds || []);
  if (!ids.length) return { released: [], error: null };
  try {
    const { data, error } = await fetchInChunks(ids, (chunk) => supabase
      .from(REQUESTS).update({ installmentId: null, installmentSeq: null })
      .in('installmentId', chunk).select('id'));
    if (error) return { released: [], error: isColumnMissing(error) ? null : error };
    return { released: (data || []).map((r) => r.id), error: null };
  } catch (error) {
    return { released: [], error };
  }
}

/**
 * ถอดคำร้องออกจากงวดทุกทาง (ก่อนบังคับลบคำร้อง — forceDelete) — ล้าง `installmentId`/`installmentSeq` ของคำร้อง แล้วเขียนตัวชี้
 * ของงวดที่เคยชี้คำร้องนี้ใหม่ (คำร้องอื่นของงวดเดียวกันขึ้นมาเป็นตัวชี้แทน · ไม่มี = ว่าง)
 * ⚠️ ต้องเรียก **ก่อน** ลบแถวคำร้อง — หลังลบแล้วตัวชี้ยังชี้ id ที่ไม่มีอยู่ และติดล็อก "ถอดคำร้องก่อน" ของปรับแผน (0377) ถาวร
 * @returns `{ installmentIds, error }` — ไม่ throw (ผู้เรียกตัดสินว่าหยุดการลบไหม) · ฐานยังไม่รัน 0413 = ถอดทางตัวชี้อย่างเดียว
 */
export async function detachRequestFromInstallments(supabase, requestId) {
  const id = text(requestId);
  if (!id) return { installmentIds: [], error: null };
  try {
    const [own, pointed] = await Promise.all([
      supabase.from(REQUESTS).update({ installmentId: null, installmentSeq: null })
        .eq('id', id).not('installmentId', 'is', null).select('id, "installmentId"'),
      supabase.from(INSTALLMENTS).select('id').eq('billingRequestId', id),
    ]);
    /* ตัวชี้ = คำร้องแรกของงวด ⇒ ตัวชี้เปลี่ยนเฉพาะงวดที่ชี้คำร้องนี้อยู่ (`pointed`) · งวดที่คำร้องนี้ไม่ใช่ใบแรก ตัวชี้คงเดิม */
    if (own.error && !isColumnMissing(own.error)) return { installmentIds: [], error: own.error };
    if (pointed.error) return { installmentIds: [], error: pointed.error };
    const ids = uniq((pointed.data || []).map((row) => row.id));
    if (!ids.length) return { installmentIds: [], error: null };
    const sync = await syncBillingPointers(supabase, ids, { drop: [id] });
    return { installmentIds: ids, error: sync.error };
  } catch (error) {
    return { installmentIds: [], error };
  }
}

/**
 * งวดที่คำร้องนี้เป็นของ (ฝั่งกลับของ `installmentRequests`) — `installmentId` ก่อน · ไม่มี = งวดที่ตัวชี้ชี้คำร้องนี้ (ลิงก์รุ่นเก่า)
 * @param request แถวคำร้อง (`id` · `installmentId` ถ้าฐานมี) · ⚠️ `select('*')` ของฐานที่รัน 0413 แล้วมีคีย์เสมอ
 * @param select  คอลัมน์ของงวดที่ผู้เรียกต้องการ
 * @returns `{ data: แถวงวด[], error }` — ลิงก์รุ่นเก่าคืนได้หลายแถวถ้าข้อมูลเพี้ยน (ผู้เรียกตัดสินเอง · ไม่เดา)
 */
export async function loadRequestInstallments(supabase, request, { select = 'id' } = {}) {
  const id = text(request?.id);
  if (!id) return { data: [], error: null };
  const own = text(request?.installmentId);
  const query = supabase.from(INSTALLMENTS).select(select);
  const { data, error } = own
    ? await query.eq('id', own).limit(2)
    : await query.eq('billingRequestId', id).limit(2);
  return { data: data || [], error: error || null };
}

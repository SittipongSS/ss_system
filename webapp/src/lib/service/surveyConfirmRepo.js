// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 §2.2) — จุดอ่าน/เขียนฐานทุกจุดของงวด (server only) ──────────────
//
// ⭐ **ไม่ throw ทุกฟังก์ชัน** — supabase ไม่ throw แต่ตัวช่วยไล่หน้า/ซอยก้อน (`fetchAll*`) throw ⇒ ห่อทุกจุดแล้วคืน `{ error }`
//   และ **ไม่ตอบ "ไม่มี" แทน "อ่านไม่ได้"** เด็ดขาด: ด่านตอนยื่นที่เห็นลูกว่างเพราะอ่านพัง = ปล่อยใบยืนยันผ่านเป็นใบธรรมดา (F4)
// 🔴 **เพดานแถว (R9 · check:rowcap 188/188 ไม่มีที่ว่าง)** — ลูกอ่านด้วย `.limit(50)` · ทุก `.in()` ผ่าน `fetchAllInChunks` ·
//   อ่านทีละแถวด้วย `.eq('id', …).maybeSingle()` · เอกสารประเมินผ่าน `loadSurveyReports` (มี `.limit` ของตัวเอง)
// 🔴 **ดึงโมดูลกระดาษได้แค่คู่เบา** `surveyReportRows` (loadSurveyReports) + `surveyReportState` (current/stale) — คู่เดียวกับที่
//   route คำร้องดึงอยู่แล้ว · ห้าม surveyReportPaper / Images / Document / Inputs และห้ามนิยาม "ฉบับปัจจุบัน" ซ้ำ
// ⚠️ แถว `service_survey_zones` อ่านด้วย `select('*')` เท่านั้น (เหมือน loadSurveyZones) — ลิสต์คอลัมน์ที่มี method ชนยามลิสต์ปิด
//   ของคอลัมน์ mig 0408 (surveyMethodGuards.test.mjs)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { appendUpdate } from '@/lib/master/updates';
import { canManageRequest } from '@/lib/requests/access';
import { isDrawingZone } from '@/lib/service/surveyMethod';
import { loadSurveyReports } from '@/lib/service/surveyReportRows';
import { surveyReportCurrent, surveyReportIsStale } from '@/lib/service/surveyReportState';
import {
  surveyConfirmLinkView, surveyConfirmOfView, surveyConfirmPlan, surveyConfirmPreviousRoundText, surveyConfirmZoneStates,
} from '@/lib/service/surveyConfirmLink';

/* จำนวนบรรทัดต่อแถวเธรด — 15 บรรทัดห่างเพดานตัดเนื้อ 4,000 ตัวอักษรของ appendUpdate มาก */
export const SURVEY_CONFIRM_LINES_PER_ROW = 15;
/* ชนิดเธรด (R8) — ก้อนแรกยิงกระดิ่ง · ก้อนต่อเงียบ (ทะเบียนใน updateTypes.js) */
const KIND_FIRST = 'survey_confirm';
const KIND_MORE = 'survey_confirm_more';
const CHILDREN_LIMIT = 50;
const EXISTING_LINES_LIMIT = 200;

const fail = (where, error) => {
  const message = error?.message || String(error || 'unknown');
  console.error('[surveyConfirm]', where, message);
  return message;
};
const uniq = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined && v !== ''))];

/* แถวพื้นที่ของใบเดียว — ไล่หน้า (ใบหนึ่งมีพื้นที่ได้หลายร้อย) · ไม่ throw */
async function zoneRowsOf(supabase, requestId) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('service_survey_zones').select('*')
    .eq('requestId', requestId)
    .order('sortOrder', { ascending: true }).order('id', { ascending: true }));
  return error ? { rows: null, error } : { rows: data || [], error: null };
}

/* ลูกของใบต้นทาง — คำสั่งเดียวบน partial index ของ mig 0408 · ใหม่ก่อน · เพดาน 50 */
async function childrenOf(supabase, originalId) {
  const { data, error } = await supabase
    .from('dept_requests')
    .select('id, "docNo", status, title, "createdAt", "submittedAt", "answeredAt", "closedAt", "cancelledAt", "committedDueDate", "requestedById", team')
    .eq('surveyConfirmOfId', originalId)
    .order('createdAt', { ascending: false })
    .limit(CHILDREN_LIMIT);
  return error ? { children: null, error } : { children: data || [], error: null };
}

/**
 * ทุกอย่างที่ตัวจัดสภาพต้องรู้ของใบต้นทางหนึ่งใบ — แถวพื้นที่ของใบ · ทุกแถวผลวัดของพื้นที่จากแบบเหล่านั้น (ทุกใบ) ·
 * ใบแม่ของแถวเหล่านั้น · ลูกที่ผูกกับใบนี้
 * @returns { rows, rowsByZone, requestsById, children, error } — `error` มีค่า = อ่านไม่ครบ ผู้เรียกต้องไม่ตัดสินจากก้อนนี้
 * @param opts.children ลูกที่ผู้เรียกอ่านมาแล้ว (ตัวโหลดของหน้าคำร้อง) — ไม่ส่ง = อ่านเอง
 */
export async function loadSurveyConfirmContext(supabase, original, { children: knownChildren = null } = {}) {
  const empty = { rows: [], rowsByZone: new Map(), requestsById: new Map(), children: [] };
  if (!original?.id) return { ...empty, error: null };
  try {
    const own = await zoneRowsOf(supabase, original.id);
    if (own.error) return { ...empty, error: fail('zone rows', own.error) };
    const rows = own.rows;

    // เฉพาะพื้นที่จากแบบที่ไม่ถูกตัด — ตัวจัดสภาพดูแค่แถวพวกนี้ · ไม่มีเลย = ไม่ต้องยิงสองคำสั่งถัดไป
    const zoneIds = uniq(rows.filter((r) => r && r.status !== 'cut' && isDrawingZone(r)).map((r) => r.zoneId));
    let all = [];
    if (zoneIds.length) {
      all = await fetchAllInChunks(zoneIds, (chunk) => supabase
        .from('service_survey_zones').select('*').in('zoneId', chunk).order('id', { ascending: true }));
    }
    const rowsByZone = new Map();
    for (const r of all) {
      if (!r?.zoneId) continue;
      if (!rowsByZone.has(r.zoneId)) rowsByZone.set(r.zoneId, []);
      rowsByZone.get(r.zoneId).push(r);
    }

    const parentIds = uniq([original.id, ...all.map((r) => r?.requestId)]);
    const parents = await fetchAllInChunks(parentIds, (chunk) => supabase.from('dept_requests')
      .select('id, "docNo", status, "answeredAt", "createdAt", "committedDueDate", "closedAt", "surveyConfirm"')
      .in('id', chunk).order('id', { ascending: true }));
    const requestsById = new Map(parents.filter((p) => p?.id).map((p) => [p.id, p]));

    let children = knownChildren;
    if (!Array.isArray(children)) {
      const read = await childrenOf(supabase, original.id);
      if (read.error) return { ...empty, error: fail('children', read.error) };
      children = read.children;
    }
    return { rows, rowsByZone, requestsById, children, error: null };
  } catch (e) {
    return { ...empty, error: fail('context', e) };
  }
}

/** ใบต้นทางหนึ่งใบตาม id (select '*') — `{ original, error }` · ไม่มีแถว = `{ original: null, error: null }` */
export async function loadSurveyConfirmOriginal(supabase, id) {
  if (!id) return { original: null, error: null };
  try {
    const { data, error } = await supabase.from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (error) return { original: null, error: fail('original', error) };
    return { original: data || null, error: null };
  } catch (e) {
    return { original: null, error: fail('original', e) };
  }
}

/**
 * ดีลของใบต้นทาง (GET confirm-plan · R13) — ลูกค้ามาจากดีล ไม่ใช่จากแถวคำร้อง (ทางเดียวกับที่ POST อ่าน) · ไม่ throw
 * คืน `{ deal, error }` · ไม่มี id / ไม่พบแถว = `deal: null` (route ตอบประโยคของ `loadSurveySite` เอง)
 * ⚠️ ด่านของเส้นนี้คือ `canManageRequest` **ของใบต้นทาง** ที่ route ถามไปแล้ว — ไม่ใช่ขอบเขตดีลของ `loadScoped`
 *    (POST ไม่ถามขอบเขตดีล ⇒ ถามที่นี่ = ฟอร์มถูกปฏิเสธทั้งที่ POST จะรับ) · อ่านคอลัมน์ป้ายเท่านั้น แถวเดียวด้วย primary key
 */
export async function loadSurveyConfirmDeal(supabase, dealId) {
  if (!dealId) return { deal: null, error: null };
  try {
    const { data, error } = await supabase
      .from('sales_deals').select('id, code, title, customerId, customerName')
      .eq('id', dealId).maybeSingle();
    if (error) return { deal: null, error: fail('deal', error) };
    return { deal: data || null, error: null };
  } catch (e) {
    return { deal: null, error: fail('deal', e) };
  }
}

/**
 * ก้อน `surveyConfirmLink` ของหน้าคำร้อง — ไม่ throw · อ่านพัง = `{ unknown: true }` (คีย์อื่นไม่มี)
 *   ⚠️ ข้อยกเว้นเดียว (รอบแก้ S5): **ใบยืนยัน** ที่อ่านพัง = `{ unknown: true, confirmOf }` — id ของใบต้นทางอยู่บนแถวของใบเอง
 *      ไม่ต้องอ่านอะไรก็รู้ ⇒ อ่านลูก/สภาพพังต้องไม่ทำให้ฟอร์มแก้ไขหลุดล็อก (ไทล์วิธีประเมินของ S4 กลับมา แล้ว server ตอบ N25)
 *      และบรรทัด "ยืนยันผลจากแบบของ" ไม่หาย · อ่านใบต้นทางพัง = `confirmOf` รู้แค่ id (`docNo: null`)
 * คืน null (ไม่แนบคีย์ — R-KEYS) เว้นแต่เป็นคำร้องประเมินพื้นที่ และ (เป็นใบยืนยัน หรือ ส่งผลแล้วตอบ needed หรือ มีลูก)
 * ⚠️ คำสั่งอ่านลูกคือ **หนึ่งคำสั่งบน index** (partial index ของ mig 0408 · `.limit(50)`) และยิงทุกหน้าคำร้องประเมินพื้นที่
 */
export async function loadSurveyConfirmLink(supabase, request, user) {
  if (request?.kind !== 'site_survey' || !request.id) return null;
  const linkedTo = request.surveyConfirmOfId || null;
  // ใบยืนยัน: อ่านใบต้นทางก่อน (แยกจากคำสั่งอ่านลูก) — ทุกทางที่อ่านพังหลังจากนี้ยังพก `confirmOf` ไปด้วย
  let confirmOf = linkedTo ? { id: linkedTo } : null;
  const unknown = () => (confirmOf ? { unknown: true, confirmOf: surveyConfirmOfView(confirmOf) } : { unknown: true });
  try {
    if (linkedTo) {
      const { original, error } = await loadSurveyConfirmOriginal(supabase, linkedTo);
      if (error) return unknown();
      confirmOf = original ? { id: original.id, docNo: original.docNo || null } : { id: linkedTo, missing: true };
    }
    const read = await childrenOf(supabase, request.id);
    if (read.error) {
      fail('link children', read.error);
      return unknown();
    }
    const children = read.children;
    const candidate = !!request.answeredAt && request.surveyConfirm === 'needed';
    if (!linkedTo && !candidate && !children.length) return null;

    let plan = null;
    let states = null;
    if (candidate) {
      const ctx = await loadSurveyConfirmContext(supabase, request, { children });
      if (ctx.error) return unknown();
      states = surveyConfirmZoneStates({ request, ...ctx });
      plan = surveyConfirmPlan({ original: request, ...ctx, stage: 'open' });
    }
    return surveyConfirmLinkView({ request, plan, states, children, confirmOf, canManage: canManageRequest(user, request) });
  } catch (e) {
    fail('link', e);
    return unknown();
  }
}

/**
 * เขียนบรรทัดลงเธรดของ **ใบต้นทาง** (R8) — ก้อนละ 15 บรรทัด (เนื้อ = บรรทัดต่อด้วย '\n')
 *   ก้อน 0 → `survey_confirm` (ยิงกระดิ่ง) · ก้อน 1+ → `survey_confirm_more` (เงียบ) ⇒ หนึ่งเหตุการณ์ หนึ่งกระดิ่ง
 * กดซ้ำได้: อ่านแถวเดิมทั้งสองชนิดของใบต้นทาง (`.limit(200)`) แล้วข้ามก้อนที่ `meta.key` มีอยู่แล้ว ⇒ ลองใหม่เขียนแค่ก้อนที่ขาด
 *   กุญแจของก้อน: เหตุการณ์ 'sent' = `{key}:{ลำดับก้อน}` (ผู้เรียกส่ง `sent:{childId}:{answeredAt}`) ·
 *   เหตุการณ์อื่น (หนึ่งบรรทัด) = `{key}` ตรง ๆ (`opened:{childId}` · `ended:{childId}:{how}:{เวลา}`)
 * `onlyIfKeyPrefix` — ไม่เขียนอะไรเลยถ้าไม่มีแถวเดิมที่ `meta.key` ขึ้นต้นด้วยค่านี้ (B-4 · R12)
 * อ่านแถวเดิมพัง ⇒ ไม่เขียน คืน `error` (ฝั่งปลอดภัยต่อบรรทัดซ้ำ) · เขียนก้อนไหนพัง ⇒ หยุด คืน `error` (ก้อนที่เขียนแล้วอยู่ต่อ)
 * meta = { key, childId, childDocNo, event, outcomes? } — `outcomes` อยู่บนก้อน 0 เท่านั้น
 * @returns { written, skipped, error } — ไม่ throw
 * @param deps.append ตัวเขียนเธรด (เทสต์ส่งตัวจำลอง) — ค่าตั้งต้น appendUpdate
 */
export async function appendSurveyConfirmLines(supabase, {
  originalId, key, event, child, lines, outcomes = null, user = null, onlyIfKeyPrefix = null,
} = {}, { append = appendUpdate } = {}) {
  const result = { written: 0, skipped: 0, error: null };
  const clean = (Array.isArray(lines) ? lines : []).map((l) => String(l ?? '').trim()).filter(Boolean);
  if (!originalId || !key || !clean.length) return result;
  try {
    const { data, error } = await supabase
      .from('entity_updates').select('id, kind, meta')
      .eq('entityType', 'dept_request').eq('entityId', String(originalId))
      .in('kind', [KIND_FIRST, KIND_MORE])
      .order('createdAt', { ascending: false })
      .limit(EXISTING_LINES_LIMIT);
    if (error) return { ...result, error: fail('existing lines', error) };
    const keys = new Set((data || []).map((r) => r?.meta?.key).filter((k) => typeof k === 'string'));
    const chunks = [];
    for (let i = 0; i < clean.length; i += SURVEY_CONFIRM_LINES_PER_ROW) chunks.push(clean.slice(i, i + SURVEY_CONFIRM_LINES_PER_ROW));
    if (onlyIfKeyPrefix && ![...keys].some((k) => k.startsWith(onlyIfKeyPrefix))) {
      return { ...result, skipped: chunks.length };
    }
    for (const [index, chunk] of chunks.entries()) {
      const chunkKey = event === 'sent' ? `${key}:${index}` : (index === 0 ? key : `${key}:${index}`);
      if (keys.has(chunkKey)) {
        result.skipped += 1;
        continue;
      }
      const meta = {
        key: chunkKey, childId: child?.id || null, childDocNo: child?.docNo || null, event: event || null,
        ...(index === 0 && outcomes ? { outcomes } : {}),
      };
      const written = await append(supabase, {
        entityType: 'dept_request', entityId: originalId, kind: index === 0 ? KIND_FIRST : KIND_MORE,
        body: chunk.join('\n'), meta, user,
      });
      if (written?.error) return { ...result, error: fail(`append ${chunkKey}`, written.error) };
      result.written += 1;
    }
    return result;
  } catch (e) {
    return { ...result, error: fail('append', e) };
  }
}

/**
 * สำหรับกระดาษ (กลุ่ม F พิมพ์แถว `ยืนยันผลจากแบบของ`) — `{ requestDocNo, reportDocNo }` · ไม่ผูก / ใบต้นทางหาย = null
 * `reportDocNo` = เลขของฉบับปัจจุบันของใบต้นทาง เมื่อฉบับนั้นไม่ค้างรุ่น · ไม่งั้น null
 * ⚠️ อ่านพัง = `{ error }` — กลุ่ม F ต้องไม่ตีความว่า "ไม่ผูก" (กระดาษที่ตรึงแล้วจะขาดแถวนี้ไปตลอด)
 */
export async function loadSurveyReportConfirms(supabase, request) {
  if (!request?.surveyConfirmOfId) return null;
  const { original, error } = await loadSurveyConfirmOriginal(supabase, request.surveyConfirmOfId);
  if (error) return { error };
  if (!original) return null;
  const { reports, error: reportError } = await loadSurveyReports(supabase, original.id);
  if (reportError) return { error: fail('reports', reportError) };
  const current = surveyReportCurrent(reports);
  return {
    requestDocNo: original.docNo || original.id,
    reportDocNo: current && !surveyReportIsStale(original, current) ? (current.docNo || null) : null,
  };
}

/**
 * สำหรับใบประเมินของใบยืนยัน (กลุ่ม E) — `{ id, docNo, missing, previousByZone: { [zoneId]: ข้อความรอบจากแบบ } }` · ไม่ผูก = null
 * ใบต้นทางหาย ⇒ `missing: true` + previousByZone ว่าง · อ่านพัง ⇒ `{ error }` (ผู้เรียกตั้ง unknown.confirmOf)
 * ข้อความมาจาก surveyConfirmPreviousRoundText ของแถวจากแบบที่ไม่ถูกตัดของใบต้นทาง (แถวที่ไม่มีตัวเลขเลย = ไม่มีรายการ)
 */
export async function loadSurveyConfirmSheetInfo(supabase, request) {
  const linkedTo = request?.surveyConfirmOfId;
  if (!linkedTo) return null;
  const { original, error } = await loadSurveyConfirmOriginal(supabase, linkedTo);
  if (error) return { error };
  if (!original) return { id: linkedTo, docNo: null, missing: true, previousByZone: {} };
  const own = await zoneRowsOf(supabase, original.id);
  if (own.error) return { error: fail('sheet rows', own.error) };
  const previousByZone = {};
  for (const row of own.rows) {
    if (!row?.zoneId || row.status === 'cut' || !isDrawingZone(row) || previousByZone[row.zoneId]) continue;
    const text = surveyConfirmPreviousRoundText(row, original.docNo);
    if (text) previousByZone[row.zoneId] = text;
  }
  return { id: original.id, docNo: original.docNo || null, missing: false, previousByZone };
}

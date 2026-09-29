// ── เขียน/อ่านของใบประเมินพื้นที่ (mig 0314) ────────────────────────────
//
// ⭐ **จังหวะเป็นหัวใจของไฟล์นี้**:
//   ตอนสร้างร่าง → เขียนเฉพาะ `service_survey_zones` (พื้นที่ใหม่มีแต่ `zoneName`)
//   ตอนกดส่งใบ  → ค่อยสร้างไซต์/โซนจริงในทะเบียน แล้วเติม `zoneId` กลับเข้าแถว
//
// 🔴 **ร่างที่ไม่ได้ส่งต้องไม่ทิ้งอะไรไว้ในทะเบียนโซนเลย** — มติข้อ 1 เขียนว่า
// "เกิดตอน SA **กดส่ง**" ไม่ใช่ตอนบันทึกร่าง ⇒ ห้ามย้ายการสร้างโซนไปไว้ตอนสร้างร่าง
// (ถ้าย้าย ร่างที่ถูกทิ้งจะกินรหัส ZN และทิ้งโซนกำพร้าไว้ในทะเบียนของลูกค้า)
import { genId } from '@/lib/id';
import { listAttachments } from '@/lib/master/attachments';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { ZONE_RUN_BUCKET, ZONE_RUN_WIDTH, zoneCodePrefix } from '@/lib/service/zoneCode';
import { CUSTOMER_NAME_SELECT, customerNameIn } from '@/lib/master/customerName';
import {
  SEND_BACK_DONE_KIND, SEND_BACK_KIND, surveyRecallRecord, surveySendBackState,
} from '@/lib/service/survey';
import { zoneNameKey } from '@/lib/service/surveyRequest';

/* ไซต์ที่ใบอ้าง ต้องมีจริง **และเป็นของลูกค้ารายเดียวกับดีล**
   ⚠️ ไม่ตรวจข้อหลัง = ใบเกาะไซต์ของลูกค้าคนอื่นได้ แล้วผลวัดไปโผล่ในทะเบียนผิดบ้าน */
export async function loadSurveySite(supabase, siteId, customerId, { requireCustomer = false } = {}) {
  const { data, error } = await supabase
    .from('service_sites').select('id, code, name, customerId').eq('id', siteId).maybeSingle();
  if (error) throw error;
  if (!data) return { site: null, error: 'ไม่พบสถานที่ที่เลือก' };
  /* 🐞 **ยามหลุดทั้งข้อเมื่อดีลไม่มีลูกค้า** — ของเดิมเขียน `if (customerId && …)`
     ⇒ `customerId` เป็น null (ดีลลอยที่ยังไม่ผูกลูกค้า) แปลว่า "ไม่ต้องตรวจ" ⇒ ใบเกาะ
     ไซต์ของลูกค้ารายไหนก็ได้ แล้วผลวัดไปโผล่ในทะเบียนผิดบ้าน
     ⇒ เส้นที่ *ต้อง* ตรวจ (ตอนเปิดใบ) ส่ง `requireCustomer` มาแล้วปฏิเสธไปเลย
     ⚠️ เส้นที่เรียกทีหลัง (สร้างนัด) ไม่ต้องตรวจซ้ำ — ใบผ่านด่านนี้มาตั้งแต่ตอนเปิดแล้ว */
  if (!customerId) {
    if (requireCustomer) {
      return { site: null, error: 'ดีลของใบนี้ยังไม่มีลูกค้า — ผูกลูกค้าที่ดีลก่อนจึงเลือกสถานที่ได้' };
    }
    return { site: data, error: null };
  }
  if (data.customerId !== customerId) {
    return { site: null, error: `สถานที่ ${data.code || data.id} เป็นของลูกค้ารายอื่น` };
  }
  return { site: data, error: null };
}

export async function loadSiteZones(supabase, siteId) {
  const { data, error } = await supabase
    .from('service_zones').select('id, code, name, building, floor, isActive')
    .eq('siteId', siteId).order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadSurveyZones(supabase, requestId) {
  const { data, error } = await supabase
    .from('service_survey_zones').select('*')
    .eq('requestId', requestId)
    .order('sortOrder', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

/* ── สภาพหน้างานของใบ ณ ตอนนี้ — ด่าน "ส่งงาน" ของช่าง (มติ 2026-09-21) ─────
   ใบ + ผลวัดทุกแถว + ไฟล์รายพื้นที่ **จากฐาน** ไม่ใช่จากจอ — จอที่โหลดค้างไว้บอกได้ทั้ง
   "ยังขาด" ทั้งที่อีกคนเพิ่งเติมครบ และ "ครบ" ทั้งที่อีกคนเพิ่งลบรูปทิ้ง
   ⚠️ ไฟล์ยิงรายพื้นที่ขนานกัน (ท่าเดียวกับ GET ใบประเมิน) */
export async function loadSurveyFieldState(supabase, requestId) {
  const [{ data: request, error }, zones] = await Promise.all([
    supabase.from('dept_requests')
      .select('id, "docNo", title, status, "answeredAt", "closedAt", "cancelledAt"')
      .eq('id', requestId).maybeSingle(),
    loadSurveyZones(supabase, requestId),
  ]);
  if (error) throw error;
  const files = await Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
  const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
  return { request: request || null, zones, filesByZone };
}

/* ── ตอนสร้างร่าง: เขียนแถวของใบอย่างเดียว ─────────────────────────────
   `zoneName` เป็น snapshot ณ ตอนเปิดใบ — โซนถูกเปลี่ยนชื่อทีหลัง ใบเก่ายังอ่านได้
   ว่าตอนนั้นเรียกอะไร (แพตเทิร์นเดียวกับ `customerName` บนเอกสาร) */
export async function insertSurveyZones(supabase, { requestId, zones, existingZones = [] }) {
  const byId = new Map(existingZones.map((z) => [z.id, z]));
  const rows = zones.map((zone) => ({
    id: genId('SVZ'),
    requestId,
    zoneId: zone.zoneId || null,
    // โซนเดิมใช้ชื่อจากทะเบียน · พื้นที่ใหม่ใช้ชื่อที่พิมพ์มา
    zoneName: zone.zoneId ? (byId.get(zone.zoneId)?.name || zone.zoneId) : zone.name,
    // ชั้นของ **พื้นที่ใหม่** เท่านั้น (mig 0315) — โซนเดิมมีชั้นอยู่ในทะเบียนแล้ว
    // ⚠️ ไม่มีชั้น = ตอนกดส่งออกรหัสโซนไม่ได้ · CHECK ของตารางกันไว้อีกชั้น
    floor: zone.zoneId ? null : (zone.floor || null),
    note: zone.note || null,
    sortOrder: zone.sortOrder ?? 0,
  }));
  if (!rows.length) return { rows: [], error: null };
  const { error } = await supabase.from('service_survey_zones').insert(rows);
  if (error) return { rows: [], error };
  return { rows, error: null };
}

/* ── คอลัมน์ตัวชี้เจ้าของพร้อมหรือยัง (mig 0355) ─────────────────────────────────
   🐞 ตัวออกรหัส (`create_entity_rows_with_code` → `master_row_columns`) **ทิ้งคีย์ที่ไม่มีคอลัมน์
      เงียบ ๆ** ⇒ deploy ก่อนรันมิก = โซนจากใบเกิดโดยไม่มีตัวชี้ ถาวร (ไม่มี backfill) ⇒ ยกเลิกใบ/
      ช่างลบพื้นที่ทีหลัง ตัวกวาดจะไม่ลบโซนเปล่านั้นให้ — เงียบสนิท (บทเรียนเดียวกับ spots mig 0354)
   ⇒ ถามคอลัมน์ก่อนสร้างโซนแถวแรก (limit 0 — ไม่ดึงข้อมูล) · และเพราะเป็น select ที่ **เอ่ยชื่อคอลัมน์**
      ด่าน CI check:columns จึงเห็นมัน = แดงจนกว่าจะรันมิก (การเขียนผ่าน RPC ด่านนั้นมองไม่เห็น) */
export async function zoneSurveyOwnerColumnError(supabase) {
  const { error } = await supabase.from('service_zones').select('"createdBySurveyRequestId"').limit(0);
  if (!error) return null;
  // 42703 = ไม่มีคอลัมน์จริง · อย่างอื่น (เน็ต/สิทธิ์) ห้ามโทษ migration
  return error.code === '42703'
    ? 'ระบบยังไม่พร้อมบันทึกเจ้าของพื้นที่ (ยังไม่ได้รัน migration 0355) — แจ้งผู้ดูแลระบบ · ยังไม่ได้สร้างพื้นที่'
    : `ตรวจความพร้อมของทะเบียนพื้นที่ไม่สำเร็จ — ${error.message} · ยังไม่ได้สร้างพื้นที่ ลองใหม่อีกครั้ง`;
}

/* ── ตอนกดส่งใบ: พื้นที่ใหม่ได้รหัส ZN ตรงนี้ ──────────────────────────
   คืน `{ created, error }` — `created` = จำนวนโซนที่เพิ่งเกิด (ไว้เขียนลง audit)
   ⚠️ ไม่มีทรานแซกชันครอบ PostgREST ⇒ ออกแบบให้ **รันซ้ำได้**: แถวที่มี `zoneId`
      แล้วถูกข้าม ⇒ ส่งซ้ำหลังล้มกลางทางจะไม่สร้างโซนซ้อน */
export async function materializeSurveyZones(supabase, { requestId, siteId, user }) {
  const rows = await loadSurveyZones(supabase, requestId);
  const pending = rows.filter((r) => !r.zoneId);
  if (!pending.length) return { created: 0, error: null };

  // รหัสโซนอ้าง **เลขรันของไซต์** ⇒ ต้องรู้รหัสไซต์ก่อนออกรหัสโซน (mig 0315)
  const { data: site, error: siteError } = await supabase
    .from('service_sites').select('id, code').eq('id', siteId).maybeSingle();
  if (siteError) return { created: 0, error: siteError.message };
  if (!site) return { created: 0, error: 'ไม่พบสถานที่ของใบนี้' };

  /* ── โซนชื่อเดียวกันมีอยู่แล้วในไซต์ = **ผูกเข้าอันเดิม ไม่ใช่ตีกลับ** ───────
     🐞 กับดักที่ปิดตรงนี้: การสร้างโซนกับการเขียน `zoneId` กลับเข้าแถวของใบ เป็นคนละ
        คำสั่ง (PostgREST ไม่มีทรานแซกชัน) ⇒ ล้มคั่นกลางเมื่อไร จะได้ **โซนที่สร้างแล้ว
        แต่ใบยังไม่รู้จัก** · รอบส่งถัดไปแถวนั้นยังนับเป็น pending แล้วชนด่านชื่อซ้ำ
        ⇒ ใบนั้นส่งไม่ได้ตลอดกาล และหน้าคำร้องไม่มีปุ่มไหนแก้ได้เลย
     ⭐ ผูกเข้าโซนเดิมแทน ทำให้ทั้งฟังก์ชัน **รันซ้ำได้จริง** ตามที่หัวฟังก์ชันสัญญาไว้
     ⚠️ ชื่อซ้ำ *ภายในใบเดียวกัน* ยังตีกลับตั้งแต่ตอนกรอก (`normalizeSurveyZones`) */
  const existing = await loadSiteZones(supabase, siteId);
  const byName = new Map(existing.map((z) => [zoneNameKey(z.name), z]));
  const toCreate = [];
  for (const row of pending) {
    const hit = byName.get(zoneNameKey(row.zoneName));
    if (!hit) { toCreate.push(row); continue; }
    const { error: linkError } = await supabase
      .from('service_survey_zones')
      .update({ zoneId: hit.id, updatedAt: new Date().toISOString() })
      .eq('id', row.id);
    if (linkError) return { created: 0, error: linkError.message };
  }
  if (!toCreate.length) return { created: 0, error: null };

  // ตัวชี้เจ้าของต้องลงได้ก่อนสร้างโซนแถวแรก (ทางผูกตามชื่อข้างบนไม่ต้องใช้คอลัมน์นี้ จึงไม่ถูกกั้น)
  const ownerColumnError = await zoneSurveyOwnerColumnError(supabase);
  if (ownerColumnError) return { created: 0, error: ownerColumnError };

  /* ⚠️ **ยิงทีละแถว ไม่ใช่ทั้งชุด** — แต่ละแถวต้องได้ `zoneId` กลับมาผูกกับแถวของใบ
     (ตั้งแต่ mig 0384 รหัสไม่มีชั้นแล้ว prefix จึงเป็นตัวเดียวทั้งไซต์ แต่การผูกรายแถวยังต้องทีละแถว)
     ⭐ ล้มกลางทางไม่เป็นไร: แถวที่สำเร็จได้ `zoneId` แล้ว รอบถัดไปข้ามให้เอง
        (ตัวนี้ออกแบบให้รันซ้ำได้อยู่แล้ว — ดูหัวฟังก์ชัน) */
  let created = 0;
  for (const row of toCreate) {
    const { prefix, error: codeError } = zoneCodePrefix({ siteCode: site.code });
    if (codeError) return { created, error: `พื้นที่ "${row.zoneName}": ${codeError}` };

    const zoneRow = {
      id: genId('SZN'),
      siteId,
      name: row.zoneName,
      floor: row.floor,
      /* 🔑 **ใบนี้เป็นเจ้าของโซนที่เพิ่งสร้าง** (mig 0355) — ตัวเก็บกวาดตอนยกเลิกใบ (§5E ③) ลบได้
         เฉพาะโซนที่ชี้ใบนั้น · โซนที่ "ผูกตามชื่อ" ข้างบนไม่ได้ช่องนี้ = ของทะเบียน ไม่ใช่ของใบ
         ⚠️ ที่นี่ที่เดียวที่เขียน — ทุกทางที่ใบประเมินสร้างโซนผ่านฟังก์ชันนี้ (SA กดส่ง · ช่างเพิ่มหน้างาน) */
      createdBySurveyRequestId: requestId,
      createdById: user?.id ? String(user.id) : null,
      createdByName: user?.name || null,
    };
    // รหัสออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
    const { data: zone, error } = await insertRowWithComposedCode(
      supabase,
      { scope: 'ZN', bucket: ZONE_RUN_BUCKET, prefix, width: ZONE_RUN_WIDTH },
      zoneRow,
    );
    if (error) return { created, error: error.message };
    if (!zone) return { created, error: 'สร้างพื้นที่ไม่สำเร็จ — ลองกดส่งอีกครั้ง' };

    const { error: linkError } = await supabase
      .from('service_survey_zones')
      .update({ zoneId: zone.id, updatedAt: new Date().toISOString() })
      .eq('id', row.id);
    if (linkError) return { created, error: linkError.message };
    created += 1;
  }
  return { created, error: null };
}


/* ── พื้นที่ที่มีใบสั่งวัดค้างอยู่แล้ว (เฟส 3A) ─────────────────────────────
 * 🔴 **ยามนี้ต้องอยู่ฝั่ง server ด้วย ไม่ใช่แค่ปิดปุ่มบนจอ** — ระหว่างที่ SA กรอกอยู่
 *   อีกคนเปิดใบสั่งวัดพื้นที่เดียวกันไปแล้วได้ · จอที่โหลดไว้ก่อนไม่มีทางรู้
 *   ⇒ ไม่ตรวจ = ช่างได้ใบสั่งวัดพื้นที่เดียวกันสองใบ แล้วไปเสียเที่ยว
 * ⚠️ คืนทั้งแถวและใบแม่ ให้ตัวตัดสิน (`surveyZoneBusyError`) เป็นคนบอกว่าใบไหน "ยังเปิด"
 */
export async function loadZoneSurveyLocks(supabase, zoneIds = []) {
  const ids = (Array.isArray(zoneIds) ? zoneIds : []).filter(Boolean);
  if (!ids.length) return { rows: [], requestsById: new Map() };

  /* 🔴 ต้องห่อ `fetchAll` — พื้นที่เดียวถูกประเมินซ้ำได้ไม่จำกัดรอบ (มติข้อ 8) และใบเดียว
     ขอได้ถึง 60 พื้นที่ ⇒ แถวโตเร็วกว่าที่คิด · เพดาน 1,000 แถวของ PostgREST ตัดเงียบ
     และของที่ถูกตัดคือ "ใบที่จองพื้นที่นี้อยู่" ⇒ ยามจะปล่อยผ่านโดยไม่มี error ให้เห็น
     ⚠️ `order('id')` ปิดท้ายเสมอ — ไล่หน้าด้วยคอลัมน์ซ้ำได้แถวซ้ำและแถวหายพร้อมกัน */
  const rows = await fetchAll(() => supabase
    .from('service_survey_zones').select('id, "requestId", "zoneId", status')
    .in('zoneId', ids)
    .order('id', { ascending: true }));

  const requestIds = [...new Set(rows.map((r) => r.requestId).filter(Boolean))];
  if (!requestIds.length) return { rows, requestsById: new Map() };

  const requests = await fetchAll(() => supabase
    .from('dept_requests').select('id, "docNo", status')
    .in('id', requestIds)
    .order('id', { ascending: true }));

  return { rows, requestsById: new Map(requests.map((r) => [r.id, r])) };
}

/* ══ บริบทของใบที่การ์ดควบคุมและหัวใบต้องใช้ (PR2 ของการรื้อจอประเมิน) ═══════
 *
 * ⭐ **โหลดที่ server ที่เดียว ไม่ใช่ให้จอยิงตามอีกสี่รอบ** — จอ TS เปิดจากมือถือหน้างาน
 *   ทุกรอบที่เพิ่มคือวินาทีที่ช่างยืนรอ · และของทั้งสี่ชิ้นเป็น "ของประกอบใบ" ที่หน้าคำร้อง
 *   ฝั่งขายโหลดอยู่แล้ว (`findRequest` ใน lib/materialPricesAdmin.js) ⇒ ท่าเดียวกัน
 *
 * 🔴 **อ่านพลาดต้องกลายเป็น "ไม่ทราบ" ไม่ใช่ "ไม่มี"** (กติกา supabase-never-throws) —
 *   `supabase-js` ไม่ throw · คืน `{ data: null, error }` ⇒ เขียน `data || null` ตรง ๆ
 *   เมื่อไร ใบที่อ่านไซต์ไม่สำเร็จจะหน้าตาเหมือนใบที่ไม่มีไซต์เป๊ะ ⇒ ปัก `unknown.<ชิ้น>`
 *   แล้วให้จอเขียน "ไม่ทราบ" · **ไม่ตีกลับทั้งเส้น** เพราะผลวัดซึ่งเป็นเนื้อหลักอ่านได้แล้ว
 *
 * ⚠️ ทุกชิ้นเป็นของ "ประกอบ" — ล้มชิ้นไหนก็ไม่ล้มใบ ⇒ ยิงขนานกันได้ และต้องไม่ throw
 */
/* แถวเธรด "ส่งกลับให้ช่างแก้" / "ช่างแจ้งว่าแก้แล้ว" ล่าสุดของใบ — ใบหนึ่งวนได้หลายรอบ
   ⚠️ เพดาน 20 แถวพอเสมอ: ตัวตัดสินต้องการแค่แถวล่าสุดของแต่ละชนิด และใบที่ส่งกลับเกินสิบรอบ
      ก็ยังมีแถวล่าสุดของทั้งสองชนิดอยู่ในยี่สิบแถวบนสุด (สองชนิดสลับกันเป็นคู่) */
export function loadSendBackRows(supabase, requestId) {
  return supabase.from('entity_updates')
    .select('id, kind, body, meta, "authorId", "authorName", "createdAt"')
    .eq('entityType', 'dept_request').eq('entityId', String(requestId))
    .in('kind', [SEND_BACK_KIND, SEND_BACK_DONE_KIND])
    .order('createdAt', { ascending: false }).limit(20);
}

/* แถว "ดึงผลกลับมาแก้" ล่าสุด — ตรึงอยู่ในเธรดของใบ (`entity_updates` kind='recall')
   ⚠️ เอา **แถวล่าสุดแถวเดียว** — ใบหนึ่งถูกดึงกลับได้หลายรอบ และของที่จอต้องบอกคือ
      รอบล่าสุดเท่านั้น (รอบก่อน ๆ อ่านได้ในเธรดของใบคำร้อง) */
export function loadRecallRows(supabase, requestId) {
  return supabase.from('entity_updates')
    .select('id, body, meta, "authorId", "authorName", "createdAt"')
    .eq('entityType', 'dept_request').eq('entityId', String(requestId)).eq('kind', 'recall')
    .order('createdAt', { ascending: false }).limit(1);
}

/** สภาพการส่งกลับของใบ สำหรับ route — อ่านไม่สำเร็จโยน error (ด่านเขียนต้อง fail-closed) */
export async function loadSurveySendBackState(supabase, requestId) {
  const { data, error } = await loadSendBackRows(supabase, requestId);
  if (error) throw error;
  return surveySendBackState(data || []);
}

/* ══ ทีมบนนัด — ชื่อคนไป + ผู้ช่วย (แผน §10.5 S5 · หัวงาน "ทีม PA คุณ · NP Nattawut (ผู้ช่วย)") ═══════════
 *
 * ⭐ **ถามบัญชีรายคนเฉพาะผู้ช่วย ไม่ไล่ทั้งทะเบียน** — จอนี้โหลดใหม่ทุกครั้งที่บันทึกและทุกครั้งที่กลับจากแอปกล้อง
 *   `loadUserDirectory` ไล่ผู้ใช้ทั้งระบบทุกรอบ ⇒ ใช้ `getUserById` ต่อคน ยิงขนานกัน และยิงเฉพาะเมื่อมีผู้ช่วย
 *   (ท่าเดียวกับ `lib/pm/projectOwner.js`) · ชื่อคนไปมีบนนัดอยู่แล้ว (`assigneeName`) ไม่ต้องถาม
 * ⚠️ **"คุณ" ตอบโดย server** (`you`) — จอไม่รู้ user id ของตัวเอง (ท่าเดียวกับ `canWrite` · `onVisit`)
 * 🔴 **อ่านชื่อไม่สำเร็จ ≠ ไม่มีคนนี้** (กติกา supabase-never-throws) — ล้ม = ชื่อ `null` + `unknown` ให้จอเขียน
 *   "ไม่ทราบ" · บัญชีที่ถูกลบไปแล้ว = `gone` (จอเขียนว่าไม่อยู่ในรายชื่อแล้ว) · ไม่ตีกลับทั้งเส้น — ชื่อผู้ช่วย
 *   เป็นของประกอบ ผลวัดซึ่งเป็นเนื้อหลักอ่านได้แล้ว
 * @returns `{ crew: [{ id, name, lead, you, gone? }], unknown: boolean }` — คนไปก่อน แล้วผู้ช่วยตามลำดับบนนัด
 */
export async function loadSurveyCrew(supabase, visit, { viewerId = null } = {}) {
  if (!visit) return { crew: [], unknown: false };
  const me = viewerId != null ? String(viewerId) : null;
  const leadId = visit.assigneeId != null && visit.assigneeId !== '' ? String(visit.assigneeId) : null;
  const helperIds = [...new Set((Array.isArray(visit.assistantIds) ? visit.assistantIds : [])
    .filter((id) => id != null && id !== '').map(String))]
    .filter((id) => id !== leadId);

  const lookups = await Promise.all(helperIds.map(async (id) => {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        // "ไม่พบ" = บัญชีถูกลบไปแล้ว ไม่ใช่อ่านพลาด
        if (error.status === 404 || /not.?found/i.test(error.message || '')) return { id, name: null, gone: true };
        throw error;
      }
      const user = data?.user || null;
      if (!user) return { id, name: null, gone: true };
      // ชื่อที่แสดง — กติกาเดียวกับทะเบียนผู้ใช้ (`loadUserDirectory`: ชื่อในบัญชี → อีเมล)
      return { id, name: String(user.user_metadata?.name || user.email || '').trim() || null };
    } catch (e) {
      console.error('[survey] อ่านชื่อผู้ช่วยบนนัดไม่สำเร็จ', visit.id, id, e?.message || e);
      return { id, name: null, failed: true };
    }
  }));

  const crew = [];
  if (leadId || visit.assigneeName) {
    crew.push({ id: leadId, name: visit.assigneeName || null, lead: true, you: !!me && me === leadId });
  }
  for (const hit of lookups) {
    crew.push({
      id: hit.id, name: hit.name, lead: false, you: !!me && me === hit.id,
      ...(hit.gone ? { gone: true } : {}),
    });
  }
  return { crew, unknown: lookups.some((hit) => hit.failed) };
}

export async function loadSurveySheetContext(supabase, request, zones = []) {
  const unknown = {};
  const rows = Array.isArray(zones) ? zones : [];
  const note = (piece, error) => {
    unknown[piece] = true;
    console.error('[survey] อ่าน', piece, 'ไม่สำเร็จ', request?.id, error?.message || error);
  };

  const siteId = request?.siteId || null;
  const customerId = request?.customerId || null;
  /* รหัส ZN อ่านสดจากทะเบียน ไม่ประทับลงแถว — พื้นที่ถูกเปลี่ยนรหัสแล้วใบเก่าต้องพาไปถูกที่
     ⚠️ ห่อ `fetchInChunks` เพราะลิสต์ **โตตามข้อมูล** (ใบเดียวขอได้ถึง 60 พื้นที่ และ
        พื้นที่ที่ช่างเพิ่มหน้างานไม่มีเพดาน) — `.in()` ที่ยาวเกิน ~16 KB ตายเป็น
        `TypeError: fetch failed` โดยไม่มีอะไรบอก (ดู lib/supabaseInChunks.js) */
  const zoneIds = [...new Set(rows.map((r) => r.zoneId).filter(Boolean))];

  const [siteRes, zoneRes, customerRes, recallRes, sendBackRes] = await Promise.all([
    /* ⭐ ช่วงเข้าไซต์ · เงื่อนไขการเข้า · ลิงก์แผนที่ (แผน §10.5 S5) — หัวงานของจอหน้างานแบบ A บอกช่างก่อน
       เดินเข้าตึก ("ให้เข้า จ. 14:30–16:30" · "ฝากมา" · ปุ่ม "นำทาง") · คอลัมน์ชุดเดียวกับที่หน้าจัดคิวอ่าน
       (`visitsRepo.sitesForVisits`) ⇒ มีจริงบนตารางแล้ว ไม่ต้องมี migration */
    siteId
      ? supabase.from('service_sites')
        .select('id, code, name, address, "contactName", "contactPhone", "accessFrom", "accessTo", "accessDays", "accessNote", "mapUrl"')
        .eq('id', siteId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    zoneIds.length
      ? fetchInChunks(zoneIds, (chunk) => supabase
        .from('service_zones').select('id, code').in('id', chunk))
      : Promise.resolve({ data: [], error: null }),
    customerId
      /* 🔴 **ห้าม select แค่ `name`** — ลูกค้าที่มีแต่ชื่ออังกฤษจะคืน `name: null` แล้วจอ
         วาดขีด ทั้งที่ชื่อมีอยู่จริง และเพราะไม่ได้หยิบ `nameEn` มา ปลายทางกู้คืนเองไม่ได้
         (บทเรียน AR-630 · กติกาที่ `lib/master/customerName.js` เขียนไว้เอง) */
      ? supabase.from('customers').select(`${CUSTOMER_NAME_SELECT}, "arCode"`)
        .eq('id', customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    /* แถว "ดึงผลกลับมาแก้" ล่าสุด — ตรึงอยู่ในเธรดของใบ (`entity_updates` kind='recall')
       ⚠️ เอา **แถวล่าสุดแถวเดียว** — ใบหนึ่งถูกดึงกลับได้หลายรอบ และของที่จอต้องบอกคือ
          รอบล่าสุดเท่านั้น (รอบก่อน ๆ อ่านได้ในเธรดของใบคำร้อง) */
    request?.id ? loadRecallRows(supabase, request.id) : Promise.resolve({ data: [], error: null }),
    /* การส่งกลับให้ช่างแก้ + การแจ้งว่าแก้แล้ว — ตัวตัดสินต้องการแค่แถวล่าสุดของแต่ละชนิด */
    request?.id ? loadSendBackRows(supabase, request.id) : Promise.resolve({ data: [], error: null }),
  ]);

  if (siteRes.error) note('site', siteRes.error);
  if (zoneRes.error) note('zoneCodes', zoneRes.error);
  if (customerRes.error) note('customer', customerRes.error);
  if (recallRes.error) note('recall', recallRes.error);
  if (sendBackRes.error) note('sendBack', sendBackRes.error);

  const codeById = new Map((zoneRes.data || []).map((z) => [z.id, z.code]));
  for (const row of rows) {
    if (!row.zoneId) { row.zoneCode = null; continue; }
    // อ่านทะเบียนไม่สำเร็จ ≠ พื้นที่นี้ไม่มีรหัส — จอต้องเขียน "ไม่ทราบ" เฉพาะกรณีแรก
    row.zoneCode = unknown.zoneCodes ? null : (codeById.get(row.zoneId) || null);
    if (unknown.zoneCodes) row.zoneCodeUnknown = true;
  }

  const customer = customerRes.data || null;
  return {
    site: siteRes.error ? null : (siteRes.data || null),
    customer: customerRes.error ? null : (customer && {
      // ไทยก่อน ไม่มีค่อยตกไปอังกฤษ — ตัวเดียวกับที่ทุกจุดสำเนาชื่อลูกค้าใช้ ห้ามอ่าน `.name` ตรง ๆ
      id: customer.id, name: customerNameIn(customer, 'th') || null, arCode: customer.arCode || null,
    }),
    recall: recallRes.error ? null : surveyRecallRecord((recallRes.data || [])[0] || null),
    // อ่านไม่สำเร็จ = null (ไม่ใช่ "ไม่เคยส่งกลับ") · `unknown.sendBack` บอกจอแทน
    sendBack: sendBackRes.error ? null : surveySendBackState(sendBackRes.data || []),
    unknown,
  };
}


// ── ยกเลิกใบประเมิน → เก็บกวาดพื้นที่ที่ใบนี้สร้างไว้ (§5E ③) ────────────
//
// 🐞 **ร่างที่ยกเลิกทิ้งพื้นที่ขยะค้างในทะเบียนของลูกค้าถาวร** — โซนเกิดตอน *กดส่งใบ*
//   (`materializeSurveyZones`) ⇒ ใบที่ถูกยกเลิกหลังจากนั้นทิ้งโซนไว้โดยไม่มีอะไรลบให้
//   ⇒ โซนขยะไปโผล่เป็น **ไทล์ให้ติ๊ก** ในใบรอบหน้า และนับอยู่ในแท็บ "พื้นที่บริการ"
//   ของหน้าลูกค้า ทั้งที่ไม่เคยมีใครไปวัดจริงสักครั้ง
//
// 🔴 **ห้ามลบพื้นที่ที่มีอะไรผูกอยู่** ต่อให้ยกเลิกใบ (แผน §5E ③) — FK กันไว้สามชั้นแล้ว
//   (`service_zone_terms` RESTRICT · `service_assets` · `service_visits`) แต่ด่านที่ DB
//   ตอบเป็น error ดิบ ⇒ ต้องตัดสินก่อนยิงลบ และของที่ลบไม่ได้ให้ **ปิดใช้งานแทน**
//
// 🔑 **"โซนนี้เป็นของใบนี้ไหม" — ระบบไม่มีคอลัมน์ชี้กลับ** (`service_zones` ไม่มี
//   `surveyRequestId`) ⇒ ตัดสินจากสองอย่างพร้อมกัน:
//     ① โซนถูกสร้าง **หลัง** ใบถูกเปิด — โซนที่ SA ติ๊กมาจากทะเบียนมีอยู่ก่อนใบเสมอ
//     ② ไม่มีใครอ้างถึงมันนอกจากใบนี้ (ไม่มีผลวัดของใบอื่น · ไม่มีรอบขาย · ไม่มีเครื่อง)
//   ⚠️ ①  อย่างเดียวไม่พอ (ใบอื่นอาจสร้างโซนทีหลังแล้วใบนี้ติ๊กมาใช้)
//      ②  อย่างเดียวก็ไม่พอ (โซนเก่าที่ยังไม่มีใครใช้ ไม่ใช่ขยะของใบนี้ — เป็นทะเบียน
//         ของลูกค้าที่รอวันได้ใช้) ⇒ ต้องครบทั้งคู่ถึงลบ
//   🪤 เพิ่มคอลัมน์ชี้กลับวันหน้าเมื่อไร ให้ย้ายมาใช้ตัวนั้นแทน — เกณฑ์เวลาเป็นการอนุมาน
//      ที่ดีที่สุดเท่าที่ข้อมูลวันนี้ให้ได้ ไม่ใช่ความจริงที่บันทึกไว้
import { purgeAttachments } from '@/lib/master/attachments';

/** โซนหนึ่งเป็น "ของใบนี้และยังไม่มีใครใช้" ไหม — ตรรกะล้วน ผู้เรียกนับของมาให้ */
export function zoneCleanupDecision({ zone, request, refs } = {}) {
  if (!zone || !request) return { action: 'keep', reason: 'ไม่มีข้อมูลพอจะตัดสิน' };

  const zoneAt = String(zone.createdAt || '');
  const reqAt = String(request.createdAt || '');
  // ① เกิดหลังใบไหม — ไม่รู้เวลา = ไม่ลบ (fail-closed: ของในทะเบียนลูกค้าห้ามหายเพราะเดา)
  if (!zoneAt || !reqAt || zoneAt < reqAt) {
    return { action: 'keep', reason: 'พื้นที่นี้มีอยู่ในทะเบียนก่อนใบนี้ — ไม่ใช่ของที่ใบนี้สร้าง' };
  }

  /* ②ก **มีคนคีย์จุดติดตั้งลงทะเบียนโซนแล้ว** (mig 0354 — โมดัลเพิ่มไซต์ย้อนหลัง/แก้โซน) = ทะเบียน
     ของลูกค้า ไม่ใช่ขยะของใบนี้ · ใบประเมินไม่เคยเขียนจุดลงโซน ⇒ จุดบนโซนมาจากคนเสมอ
     🐞 ไม่มีข้อนี้ = ใบประเมินที่ติ๊กโซนชื่อเดียวกัน (เกิดหลังใบ) แล้วถูกยกเลิก ลบโซนพร้อมจุดที่คีย์ไว้ทิ้ง
     ⚠️ ถ้าวันหนึ่งก๊อป "จุดที่เลือกติดตั้ง" จากใบประเมินลงโซน (มติข้อ D) ต้องกลับมาทบทวนข้อนี้ */
  if (Array.isArray(zone.spots) && zone.spots.length > 0) {
    return { action: 'keep', reason: 'พื้นที่นี้มีจุดติดตั้งในทะเบียนแล้ว — เก็บไว้' };
  }

  // ② มีใครใช้อยู่ไหม
  const others = Number(refs?.otherSurveyRows || 0);
  const terms = Number(refs?.terms || 0);
  const assets = Number(refs?.assets || 0);
  if (terms > 0 || assets > 0) {
    /* ขายไปแล้ว/มีเครื่องอยู่ = ของจริงหน้างาน ⇒ **ปิดใช้งานแทนลบ**
       (ลบไม่ได้อยู่แล้วเพราะ FK RESTRICT — แต่ต้องตอบให้ชัดว่าจะทำอะไรแทน) */
    return { action: 'keep', reason: 'พื้นที่นี้ขายไปแล้วหรือมีเครื่องอยู่ — เก็บไว้ในทะเบียน' };
  }
  if (others > 0) {
    return { action: 'keep', reason: 'มีใบประเมินใบอื่นอ้างถึงพื้นที่นี้อยู่' };
  }
  return { action: 'delete', reason: 'พื้นที่ที่ใบนี้สร้างและยังไม่มีใครใช้' };
}

/* ── ลบแถวผลวัดพร้อมไฟล์ของมัน ─────────────────────────────────────────
   🔴 **แถวผลวัดถือไฟล์แนบ** (ชนิด `service_survey_zone`) — ลบแถวเฉย ๆ เหลือไฟล์กำพร้า
     บน Drive ที่ไม่มีอะไรชี้ถึงอีก (ด่าน `attachmentCascade` ใน CI จับไว้)
   ⚠️ **เส้นลบแถวผลวัดทุกเส้นต้องผ่านที่นี่** — ตอนนี้มีสองเส้นแล้ว (ยกเลิกใบ · ลบพื้นที่
     ที่ช่างเพิ่มผิด) และเส้นที่สามจะลืมเรียกตัวกวาด เหมือนที่เคยเกิดมาแล้วสองครั้ง */
export async function purgeSurveyZoneRows(supabase, rowIds = []) {
  const ids = (Array.isArray(rowIds) ? rowIds : []).filter(Boolean);
  if (!supabase || !ids.length) return null;
  for (const rowId of ids) await purgeAttachments('service_survey_zone', rowId, supabase);
  const { error } = await supabase.from('service_survey_zones').delete().in('id', ids);
  return error ? error.message : null;
}

/* ── นับของที่ผูกกับโซนแล้วถามตัวตัดสิน ─────────────────────────────────
   คืน `{ action, reason, label }` — ยังไม่ลบอะไรทั้งสิ้น
   ⚠️ **"แถวของใบอื่น" = ทุกแถวของโซนนี้ ลบแถวของใบนี้** ⇒ เรียกก่อนหรือหลังลบแถวของ
     ใบนี้ก็ได้คำตอบเดียวกัน (ก่อนลบ mine = n · หลังลบ mine = 0) */
export async function zoneReleaseDecision(supabase, { request, zone }) {
  const label = zone?.code || zone?.name || zone?.id || '';
  const [{ count: allSurveys = 0 } = {}, { count: mySurveys = 0 } = {},
    { count: terms = 0 } = {}, { count: assets = 0 } = {}] = await Promise.all([
    supabase.from('service_survey_zones').select('id', { count: 'exact', head: true }).eq('zoneId', zone.id),
    supabase.from('service_survey_zones').select('id', { count: 'exact', head: true })
      .eq('zoneId', zone.id).eq('requestId', request.id),
    supabase.from('service_zone_terms').select('id', { count: 'exact', head: true }).eq('zoneId', zone.id),
    supabase.from('service_assets').select('id', { count: 'exact', head: true }).eq('zoneId', zone.id),
  ]);
  const decision = zoneCleanupDecision({
    zone,
    request,
    refs: { otherSurveyRows: Math.max(0, allSurveys - mySurveys), terms, assets },
  });
  return { ...decision, label };
}

/** โซนที่ตัดสินแล้วว่าลบได้ — ลบจริง · คืนข้อความ error หรือ `null` */
export async function deleteZoneRow(supabase, zoneId) {
  const { error } = await supabase.from('service_zones').delete().eq('id', zoneId);
  // FK ยังกันอยู่ = มีของที่ตัวนับมองไม่เห็น ⇒ เก็บไว้ ดีกว่าฝืนลบ
  return error ? error.message : null;
}

/**
 * เก็บกวาดจริงตอนยกเลิกใบ — คืนสรุปไว้เขียนลงเธรด/audit
 * ⚠️ **ห้ามโยน error ออกไป** — ผู้เรียกอยู่หลังจุดที่ใบถูกยกเลิกสำเร็จแล้ว
 *   ล้มตรงนี้ = ใบที่ยกเลิกสำเร็จตอบ 500 · ของที่ค้างคือโซนเปล่า ซึ่งลบทีหลังได้
 */
export async function cleanupCancelledSurveyZones(supabase, { request }) {
  const out = { deleted: [], kept: [] };
  if (!supabase || !request?.id) return out;

  try {
    const { data: rows } = await supabase
      .from('service_survey_zones').select('id, "zoneId"').eq('requestId', request.id);
    const byZone = new Map();
    for (const row of rows || []) {
      if (!row.zoneId) continue;
      if (!byZone.has(row.zoneId)) byZone.set(row.zoneId, []);
      byZone.get(row.zoneId).push(row.id);
    }
    if (!byZone.size) return out;

    /* `*` ไม่ใช่รายชื่อคอลัมน์ — ตัวตัดสินต้องเห็น `spots` (mig 0354) และ `*` ไม่พังในช่วงที่
       คอลัมน์ยังไม่มี (รายชื่อที่มี spots จะ error ⇒ zones = null ⇒ ตัวกวาดเงียบทั้งเส้น) */
    const { data: zones } = await supabase
      .from('service_zones').select('*').in('id', [...byZone.keys()]);

    for (const zone of zones || []) {
      /* ⚠️ **ตัดสินก่อนลบแถวผลวัด** — ลบแถวก่อนแล้วโซนถูกเก็บไว้ (ขายไปแล้ว/มีเครื่อง)
         จะได้โซนที่ไม่เหลือประวัติการวัดเลย ซึ่งเป็นของที่มีค่าที่สุดของทะเบียน */
      const decision = await zoneReleaseDecision(supabase, { request, zone });
      if (decision.action !== 'delete') { out.kept.push(`${decision.label} (${decision.reason})`); continue; }

      /* FK ของ `service_survey_zones.zoneId` เป็น RESTRICT ⇒ แถวต้องไปก่อนโซน
         (แถวเหล่านี้จะถูกลบตาม CASCADE ของใบอยู่แล้ว แต่ใบยังไม่ถูกลบ มันแค่ `cancelled`) */
      const purgeError = await purgeSurveyZoneRows(supabase, byZone.get(zone.id));
      if (purgeError) { out.kept.push(`${decision.label} (ลบแถวผลวัดไม่ได้: ${purgeError})`); continue; }

      const dropError = await deleteZoneRow(supabase, zone.id);
      if (dropError) out.kept.push(`${decision.label} (ลบไม่ได้: ${dropError})`);
      else out.deleted.push(decision.label);
    }
  } catch (e) {
    // เงียบแบบมีร่องรอย — ผู้เรียกเขียนสรุปลง audit อยู่แล้ว
    out.kept.push(`เก็บกวาดไม่สำเร็จ: ${e.message}`);
  }
  return out;
}

/** ข้อความต่อท้ายสรุปยกเลิก — ว่าง = ไม่มีอะไรให้เล่า */
export function cancelCleanupSummary(result = {}) {
  const parts = [];
  if (result.deleted?.length) parts.push(`ลบพื้นที่ที่ยังไม่มีใครใช้ ${result.deleted.length} รายการ (${result.deleted.join(' · ')})`);
  if (result.kept?.length) parts.push(`เก็บไว้ ${result.kept.length} รายการ`);
  return parts.join(' · ');
}

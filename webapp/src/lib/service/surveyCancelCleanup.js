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

/**
 * เก็บกวาดจริง — คืนสรุปไว้เขียนลงเธรด/audit
 * ⚠️ **ห้ามโยน error ออกไป** — ผู้เรียกอยู่หลังจุดที่ใบถูกยกเลิกสำเร็จแล้ว
 *   ล้มตรงนี้ = ใบที่ยกเลิกสำเร็จตอบ 500 · ของที่ค้างคือโซนเปล่า ซึ่งลบทีหลังได้
 */
export async function cleanupCancelledSurveyZones(supabase, { request }) {
  const out = { deleted: [], kept: [] };
  if (!supabase || !request?.id) return out;

  try {
    const { data: rows } = await supabase
      .from('service_survey_zones').select('id, "zoneId"').eq('requestId', request.id);
    const zoneIds = [...new Set((rows || []).map((r) => r.zoneId).filter(Boolean))];
    if (!zoneIds.length) return out;

    const { data: zones } = await supabase
      .from('service_zones').select('id, code, name, "createdAt"').in('id', zoneIds);

    for (const zone of zones || []) {
      /* นับของที่อ้างถึงโซนนี้ — **แถวผลวัดของใบอื่น** เท่านั้นที่นับ
         (แถวของใบนี้เองกำลังจะไปพร้อมใบ ไม่ใช่หลักฐานว่ามีคนอื่นใช้) */
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
      const label = zone.code || zone.name || zone.id;

      if (decision.action !== 'delete') { out.kept.push(`${label} (${decision.reason})`); continue; }

      /* ⚠️ ลบแถวผลวัดของใบนี้ก่อน — FK ของ `service_survey_zones.zoneId` เป็น RESTRICT
         (แถวเหล่านี้จะถูกลบตาม CASCADE ของใบอยู่แล้ว แต่ใบยังไม่ถูกลบ มันแค่ `cancelled`)
         🔴 **แถวผลวัดถือไฟล์แนบ** (ชนิด `service_survey_zone`) — ลบแถวเฉย ๆ เหลือไฟล์
           กำพร้าบน Drive ที่ไม่มีอะไรชี้ถึงอีก (ด่าน `attachmentPurge` ใน CI จับไว้) */
      const { data: myRows } = await supabase.from('service_survey_zones')
        .select('id').eq('zoneId', zone.id).eq('requestId', request.id);
      for (const row of myRows || []) await purgeAttachments('service_survey_zone', row.id, supabase);
      await supabase.from('service_survey_zones').delete().eq('zoneId', zone.id).eq('requestId', request.id);
      const { error } = await supabase.from('service_zones').delete().eq('id', zone.id);
      if (error) {
        // FK ยังกันอยู่ = มีของที่ตัวนับมองไม่เห็น ⇒ เก็บไว้ ดีกว่าฝืนลบ
        out.kept.push(`${label} (ลบไม่ได้: ${error.message})`);
      } else {
        out.deleted.push(label);
      }
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

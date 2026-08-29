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
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { ZONE_RUN_BUCKET, ZONE_RUN_WIDTH, zoneCodePrefix } from '@/lib/service/zoneCode';
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

  /* ⚠️ **ยิงทีละแถว ไม่ใช่ทั้งชุด** (mig 0315) — รหัสโซนมีชั้นอยู่ในท่อนหน้าเลขรัน
     ⇒ พื้นที่คนละชั้นใช้ prefix คนละตัว และ RPC รับ prefix เดียวต่อหนึ่งคำสั่ง
     ⭐ ล้มกลางทางไม่เป็นไร: แถวที่สำเร็จได้ `zoneId` แล้ว รอบถัดไปข้ามให้เอง
        (ตัวนี้ออกแบบให้รันซ้ำได้อยู่แล้ว — ดูหัวฟังก์ชัน) */
  let created = 0;
  for (const row of toCreate) {
    const { prefix, error: codeError } = zoneCodePrefix({ siteCode: site.code, floor: row.floor });
    if (codeError) return { created, error: `พื้นที่ "${row.zoneName}": ${codeError}` };

    const zoneRow = {
      id: genId('SZN'),
      siteId,
      name: row.zoneName,
      floor: row.floor,
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

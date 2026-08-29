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
import { insertRowsWithEntityCode } from '@/lib/entityCode';
import { zoneNameKey } from '@/lib/service/surveyRequest';

/* ไซต์ที่ใบอ้าง ต้องมีจริง **และเป็นของลูกค้ารายเดียวกับดีล**
   ⚠️ ไม่ตรวจข้อหลัง = ใบเกาะไซต์ของลูกค้าคนอื่นได้ แล้วผลวัดไปโผล่ในทะเบียนผิดบ้าน */
export async function loadSurveySite(supabase, siteId, customerId) {
  const { data, error } = await supabase
    .from('service_sites').select('id, code, name, customerId').eq('id', siteId).maybeSingle();
  if (error) throw error;
  if (!data) return { site: null, error: 'ไม่พบสถานที่ที่เลือก' };
  if (customerId && data.customerId !== customerId) {
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

  // ⚠️ ตรวจชื่อชนอีกรอบ **ที่จังหวะส่ง** — ระหว่างที่ใบเป็นร่างอยู่ อาจมีคนสร้างโซน
  //    ชื่อเดียวกันในไซต์นั้นไปแล้ว · ปล่อยไปจะได้ error ดิบจาก unique index (mig 0297)
  const existing = await loadSiteZones(supabase, siteId);
  const taken = new Set(existing.map((z) => zoneNameKey(z.name)));
  for (const row of pending) {
    if (taken.has(zoneNameKey(row.zoneName))) {
      return { created: 0, error: `สถานที่นี้มีพื้นที่ชื่อ "${row.zoneName}" อยู่แล้ว — แก้ชื่อหรือเลือกจากพื้นที่เดิม` };
    }
    taken.add(zoneNameKey(row.zoneName));
  }

  const zoneRows = pending.map((row) => ({
    id: genId('SZN'),
    siteId,
    name: row.zoneName,
    createdById: user?.id ? String(user.id) : null,
    createdByName: user?.name || null,
  }));
  // รหัส ZN ออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
  const { data: created, error } = await insertRowsWithEntityCode(supabase, 'ZN', zoneRows);
  if (error) return { created: 0, error: error.message };

  // ⚠️ จับคู่ด้วย **id ที่เราสร้างเอง** ไม่ใช่ลำดับที่ RPC คืนมา — ลำดับไม่ใช่สัญญา
  const byId = new Map((created || []).map((z) => [z.id, z]));
  for (const [index, row] of pending.entries()) {
    const zone = byId.get(zoneRows[index].id);
    if (!zone) return { created: 0, error: 'สร้างพื้นที่ไม่สำเร็จ — ลองกดส่งอีกครั้ง' };
    const { error: linkError } = await supabase
      .from('service_survey_zones')
      .update({ zoneId: zone.id, updatedAt: new Date().toISOString() })
      .eq('id', row.id);
    if (linkError) return { created: 0, error: linkError.message };
  }
  return { created: pending.length, error: null };
}

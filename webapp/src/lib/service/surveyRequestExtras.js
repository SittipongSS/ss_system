// ── งานประเมินที่หน้าคำร้องต้องใช้ (หน้าคำร้องแบบไทม์ไลน์ · มติเจ้าของ 25/09) ─────────────
//
// ⚠️ **แยกไฟล์จาก surveyRepo โดยตั้งใจ** — ตัวนี้ลาก `visitBundle` (→ visitsRepo → authUser/next headers)
//    ถ้าอยู่ใน surveyRepo เทสต์ของ surveyRepo ทุกไฟล์จะ import ไม่ขึ้นใต้ node ล้วน
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { visitBundle } from '@/lib/service/visitBundle';
import { surveyRecallRecord, surveySendBackState } from '@/lib/service/survey';
import { loadRecallRows, loadSendBackRows } from '@/lib/service/surveyRepo';

/**
 * ของที่ **หน้าคำร้อง** ต้องใช้วาดงานประเมิน (หน้าคำร้องแบบไทม์ไลน์ · มติเจ้าของ 25/09)
 *
 * ⭐ ทำไมต้องมี: ทุกตัวตัดสินของใบประเมิน (`surveyFieldProgress` · `surveyZoneFacts` ·
 *   `surveyGateChecklist` · `surveyControlView`) นับรูปจาก `filesByZone` — หน้าคำร้องไม่เคย
 *   ได้ก้อนนี้ ⇒ ถ้าส่งไฟล์ว่างไป ทุกพื้นที่จะอ่านว่า "ยังไม่มีภาพกว้าง" แล้วจอบอก "วัดแล้ว 0/3"
 *   ทั้งที่ช่างวัดครบ · SA เปิดจอประเมินไม่ได้ ⇒ ต้องมาที่นี่
 *
 * ⚠️ **ส่งเฉพาะ `docType` ต่อไฟล์** — ตัวตัดสินทุกตัวอ่านแค่ช่องนี้ · ชื่อไฟล์/ลิงก์ไม่ต้องออกไป
 *   (คนอ่านไฟล์พื้นที่ = คนอ่านใบได้อยู่แล้ว `canViewSurveyZoneFiles` แต่ไม่ส่งของที่ไม่ใช้)
 * ⚠️ **ภาระของไซต์ใช้ `visitBundle` ตัวเดียวกับหน้าจัดคิว** — โมดัลลงคิวบนหน้านี้กับหน้าจัดคิว
 *   ต้องบอก "จุด · แพ็ค" เท่ากันสำหรับไซต์เดียวกัน (สูตรเดียว ไม่ก๊อป)
 * 🔴 **อ่านพลาด = "ไม่ทราบ" ไม่ใช่ "ไม่มี"** (กติกา supabase-never-throws) — ทุกชิ้นเป็นของประกอบ
 *   ล้มชิ้นไหนไม่ล้มทั้งหน้า · ปัก `unknown.<ชิ้น>` ให้จอเขียน "ไม่ทราบ" แทนตัวเลขที่ผิด
 *
 * @param request แถวจาก `findRequest` (ต้องมี `surveyZones` · `siteId`)
 * @returns `{ filesByZone, recall, sendBack, siteLoad, unknown }`
 */
export async function loadSurveyRequestExtras(supabase, request) {
  const unknown = {};
  const note = (piece, error) => {
    unknown[piece] = true;
    console.error('[survey] หน้าคำร้องอ่าน', piece, 'ไม่สำเร็จ', request?.id, error?.message || error);
  };
  const zoneRowIds = (Array.isArray(request?.surveyZones) ? request.surveyZones : [])
    .map((zone) => zone?.id).filter(Boolean);
  const settle = (promise) => promise.then((data) => ({ data, error: null }), (error) => ({ data: null, error }));

  const [filesRes, recallRes, sendBackRes, loadRes] = await Promise.all([
    /* ⚠️ ห่อ fetchAllInChunks — ลิสต์พื้นที่โตตามข้อมูล (ช่างเพิ่มหน้างานไม่มีเพดาน) และ
       รูปต่อพื้นที่ไม่มีเพดาน ⇒ ทั้ง `.in()` ยาวเกิน 16 KB และแถวเกิน 1,000 ต้องกันพร้อมกัน */
    settle(fetchAllInChunks(zoneRowIds, (chunk) => supabase.from('attachments')
      .select('id, "entityId", "docType"')
      .eq('entityType', 'service_survey_zone').in('entityId', chunk)
      .order('id', { ascending: true }))),
    request?.id ? loadRecallRows(supabase, request.id) : Promise.resolve({ data: [], error: null }),
    request?.id ? loadSendBackRows(supabase, request.id) : Promise.resolve({ data: [], error: null }),
    request?.siteId
      ? settle(visitBundle(supabase, [], { extraSiteIds: [request.siteId], gateSiteIds: [] }))
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (filesRes.error) note('files', filesRes.error);
  if (recallRes.error) note('recall', recallRes.error);
  if (sendBackRes.error) note('sendBack', sendBackRes.error);
  if (loadRes.error) note('siteLoad', loadRes.error);

  const filesByZone = {};
  if (!filesRes.error) {
    for (const id of zoneRowIds) filesByZone[id] = [];
    for (const file of filesRes.data || []) {
      if (!filesByZone[file.entityId]) continue;
      filesByZone[file.entityId].push({ docType: file.docType || null });
    }
  }
  return {
    filesByZone,
    recall: recallRes.error ? null : surveyRecallRecord((recallRes.data || [])[0] || null),
    // อ่านไม่สำเร็จ = null (ไม่ใช่ "ไม่เคยส่งกลับ") · `unknown.sendBack` บอกจอแทน
    sendBack: sendBackRes.error ? null : surveySendBackState(sendBackRes.data || []),
    siteLoad: loadRes.error || !request?.siteId ? null : (loadRes.data?.workload?.[request.siteId] || null),
    unknown,
  };
}

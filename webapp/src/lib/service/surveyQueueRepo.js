// ── ตัวโหลดคำร้องประเมินพื้นที่ที่ "รอลงคิว" ของหน้าจัดคิว (มติเจ้าของ 23/09) ─────────
//
// ⭐ ผู้เรียกเดียวคือ `GET /api/service/visits/queue` — โหลดพร้อมนัดของรายการงาน เพราะคำถาม
//    "ใบนี้ลงคิวไปแล้วหรือยัง" ต้องตอบด้วย **นัดชุดเดียวกับที่จอวาด** (ไม่งั้นใบเดียวกันโผล่
//    สองการ์ด: การ์ดคำร้อง + การ์ดนัด) และหลังกดรับเรื่อง/ลงคิว จอโหลดใหม่รอบเดียวได้ทั้งคู่
// ⭐ **payload = การ์ด** — แถวที่ส่งกลับผ่าน `surveyQueueStep` แล้วทุกแถว ⇒ ตัวเลขบนแถบ
//    ต้นทางงานนับจากอาร์เรย์นี้ได้ตรง ๆ ไม่มีชุดที่สองให้เพี้ยน
// ⚠️ อ่านอย่างเดียว · ไม่มีการเขียนใด ๆ
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { SERVICE_DEPARTMENT } from '@/lib/permissions';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { surveyNeedsVisit } from './surveyMethod';
import {
  SITE_REQUEST_KINDS, liveSurveyVisitsByRequest, pickSurveyVisit, surveyQueueStep,
} from './surveyQueue';

/* คอลัมน์ที่การ์ดใช้ — ทุกช่องต้องมีจริงบนฐาน (ด่าน `check:columns` อ่านค่าคงที่นี้)
   ⚠️ ห้าม `select('*')` — ใบประเมินมีช่องข้อความยาว (รายละเอียด · หมายเหตุ) ที่การ์ดไม่ใช้ */
export const SURVEY_QUEUE_REQUEST_COLUMNS = [
  'id', 'docNo', 'kind', 'dept', 'status', 'title',
  'customerId', 'customerName', 'dealId', 'siteId',
  'requestedById', 'requestedByName', 'submittedAt',
  'requestedDueDate', 'requestedDueTime', 'requestedResultDate',
  'acknowledgedAt', 'acknowledgedByName',
  'committedDueDate', 'committedDueTime', 'committedResultDate', 'dueCommittedAt',
  'assigneeId', 'assigneeName',
  'closedAt', 'answeredAt', 'cancelledAt', 'createdAt',
].join(', ');

/* นัดของใบที่ "เคยลงคิวแล้วแต่ตอนนี้ไม่มีนัดที่ยังมีชีวิต" — แค่พอบอกว่านัดเดิมจบแบบไหน */
export const SURVEY_QUEUE_VISIT_COLUMNS = 'id, code, status, "requestId", "scheduledDate", "createdAt"';

/* แถวพื้นที่ของใบ — แค่พอตอบว่า "ใบนี้ต้องมีนัดไหม" (`surveyNeedsVisit`: สถานะตัด + วิธีประเมิน · mig 0408)
   ⚠️ ไม่เอาผลวัด/จุดติดตั้ง — การ์ดไม่ใช้ และ `parts`/`spots` เป็น jsonb ก้อนใหญ่ */
export const SURVEY_QUEUE_ZONE_COLUMNS = 'id, "requestId", status, method';

/**
 * คำร้องประเมินพื้นที่ของฝ่าย TS ที่การ์ด "คำร้องรอลงคิว" ต้องแสดง
 *
 * @param visits นัดของรายการงาน (ร่าง + นัดเปิด + ปิดใน 14 วัน) — ชุดเดียวกับที่ route ส่งให้จอ
 *               ⚠️ ชุดนี้มีนัดที่ยังมีชีวิตครบทุกใบอยู่แล้ว (`REQUEST_SLOT_VISIT_STATES` ⊆ ชุดสถานะ
 *               ของรายการงาน — เทสต์ล็อกไว้) ⇒ "ลงคิวแล้วหรือยัง" ไม่ต้องยิงถามเพิ่ม
 * @returns แถวคำร้อง + `surveyVisit` (null ได้) + `surveyNeedsVisit` (boolean เสมอ)
 *          — เฉพาะแถวที่ `surveyQueueStep` ไม่ใช่ null
 * @throws  error ของ Supabase ตัวแรก (ผ่าน fetchAll) — route แยก try ของตัวเอง
 *          ⚠️ ห้ามกลืนเป็นอาร์เรย์ว่าง: ว่าง = "ไม่มีใบรอลงคิว" ซึ่งโกหกเมื่อ query พัง
 */
export async function loadSurveyQueueRequests(supabase, { visits = [] } = {}) {
  /* ⚠️ ไล่หน้าด้วย fetchAll + ลำดับนิ่งที่ `id` — คำร้องที่เดินอยู่โตตามจำนวนลูกค้า
     · ตัวกรองทั้งสามเป็นค่าคงที่ ⇒ URL ไม่โตตามข้อมูล (ไม่ชนเพดาน 16 KB) */
  const rows = await fetchAll(() => supabase
    .from('dept_requests').select(SURVEY_QUEUE_REQUEST_COLUMNS)
    .eq('dept', SERVICE_DEPARTMENT)
    .in('kind', SITE_REQUEST_KINDS)
    .in('status', REQUEST_OPEN_STATUSES)
    .order('submittedAt', { ascending: true })
    .order('id', { ascending: true }));

  /* ⭐ **ใบนี้ต้องมีนัดไหม** (ประเมินจากแบบ · mig 0408) — คำนวณจากแถวพื้นที่ทุกครั้ง ไม่มีคอลัมน์สรุปบนใบ
     ถามครั้งเดียวทุกใบที่เดินอยู่ **รวมใบรอรับเรื่อง** (การ์ด "รับเรื่อง" ของงานโต๊ะต้องรู้ตัวว่าเป็นงานโต๊ะ)
     ⚠️ ลิสต์ id โตตามข้อมูล ⇒ ซอยก้อน (URL 16 KB) + ไล่หน้า (เพดาน 1,000 แถว) · ผลเข้า Map ไม่ต้องเรียงซ้ำ
     🔴 **อ่านพลาดต้องโยน** — กลืนแล้วปล่อยทุกใบเป็น "ต้องมีนัด" = งานโต๊ะกลับมาเป็นการ์ดลงคิวเงียบ ๆ
        แล้วผู้วางคิวลงนัดให้ใบที่ไม่มีใครต้องไปหน้างาน */
  const zones = await fetchAllInChunks(rows.map((row) => row.id), (chunk) => supabase
    .from('service_survey_zones').select(SURVEY_QUEUE_ZONE_COLUMNS)
    .in('requestId', chunk)
    .order('id', { ascending: true }));
  const zonesByRequest = new Map();
  for (const zone of zones) {
    if (!zonesByRequest.has(zone.requestId)) zonesByRequest.set(zone.requestId, []);
    zonesByRequest.get(zone.requestId).push(zone);
  }

  const liveByRequest = liveSurveyVisitsByRequest(visits);
  const decorated = rows.map((row) => ({
    ...row,
    surveyVisit: liveByRequest.get(row.id) || null,
    // ใบที่ยังไม่มีแถวพื้นที่ = ต้องมีนัด (กติกาของ `surveyNeedsVisit` — ไม่มีแถวไม่ใช่งานโต๊ะ)
    surveyNeedsVisit: surveyNeedsVisit(zonesByRequest.get(row.id) || []),
  }));

  /* ⭐ ถามประวัตินัดเฉพาะใบที่ "รับเรื่องแล้ว + มีวันแล้ว + ไม่มีนัดที่ยังมีชีวิต" — ใบกลุ่มนี้
     เท่านั้นที่คำตอบขึ้นกับว่านัดเดิมจบแบบไหน (เข้าแล้ว = รอผล · ยกเลิก/เข้าไม่ได้ = ลงคิวใหม่)
     · งานโต๊ะไม่ถาม — `surveyQueueStep` ตอบ null ให้ใบกลุ่มนี้โดยไม่ดูนัดเลย
     ⚠️ ลิสต์ id โตตามข้อมูล ⇒ ซอยก้อน (URL 16 KB) + ไล่หน้า (เพดาน 1,000 แถว) */
  const historyIds = decorated
    .filter((row) => row.status === 'acknowledged' && !row.surveyVisit
      && row.surveyNeedsVisit !== false
      && String(row.committedDueDate ?? '').trim())
    .map((row) => row.id);
  if (historyIds.length) {
    const history = await fetchAllInChunks(historyIds, (chunk) => supabase
      .from('service_visits').select(SURVEY_QUEUE_VISIT_COLUMNS)
      .in('requestId', chunk)
      .order('id', { ascending: true }));
    const byRequest = new Map();
    for (const visit of history) {
      if (!byRequest.has(visit.requestId)) byRequest.set(visit.requestId, []);
      byRequest.get(visit.requestId).push(visit);
    }
    for (const row of decorated) {
      if (byRequest.has(row.id)) row.surveyVisit = pickSurveyVisit(byRequest.get(row.id));
    }
  }

  return decorated.filter((row) => surveyQueueStep(row) !== null);
}

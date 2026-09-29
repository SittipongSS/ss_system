// ── หัวหน้าแจ้งช่างให้กลับไปเก็บงานหน้างาน (แผน §5.4 บรรทัด 604) ──────────
//
// 🐞 **ทางตันที่มีมาตั้งแต่เฟส 3** — ด่านสามข้อบนของหกข้อเป็นของช่าง (ขนาด · ภาพกว้าง ·
//   จุดที่ติดตั้งได้) ซึ่งหัวหน้าแก้เองไม่ได้ ⇒ เขาเห็นแค่ปุ่มส่งผลที่กดไม่ได้ และไม่มีทาง
//   บอกช่างในระบบเลย · คอมเมนต์ใน `survey.js` อ้างถึงปุ่มนี้มาตั้งแต่วันแรกในฐานะเหตุผล
//   ที่จอสรุปต้องกางเช็คลิสต์ทั้งหกข้อ — แต่ปุ่มไม่เคยถูกสร้าง
//
// 🔴 **กระดิ่งของใบคำร้องไปไม่ถึงช่าง และยัดเข้าไปตรง ๆ ก็ไม่ได้**
//   ทะเบียนผู้รับของ `dept_request` = ผู้ขอ (SA) + คนที่เคยโพสต์ + คนที่ถูก @ เท่านั้น
//   และ role `ts` **เปิดหน้าคำร้องไม่ได้** (403) ⇒ ต่อให้ยัดชื่อเข้าไป เขากดกระดิ่งแล้วเจอ
//   หน้าปฏิเสธ ⇒ ต้องยิงตรงด้วย `notifyUsers` ไปที่ **คนที่ถูกมอบหมายบนนัด** และ
//   **ชี้ href ไปที่จอที่เขาเปิดได้** (`/service/surveys/[id]`) ไม่ใช่หน้าคำร้อง
//
// ⚠️ **ไม่แตะสถานะใบและไม่แตะนัด** — ดูเหตุผลเต็มที่ `surveySendBackError`
//
// 🔄 **ฝั่งช่างครบแล้วก็ส่งกลับได้** (แผน §10.5 S4 · ม็อก A-5/AW-2) — ของขาดไม่ใช่ด่านแล้ว
//   แต่ยังนับจากฐานทุกครั้ง: มี = เล่าต่อท้ายข้อของหัวหน้าในเธรด/กระดิ่ง · ไม่มี = เล่าแค่ข้อที่หัวหน้าพิมพ์
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { appendUpdate } from '@/lib/master/updates';
import { notifyUsers } from '@/lib/notifications';
import { listAttachments } from '@/lib/master/attachments';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import {
  surveyCrewGaps, surveySendBackBody, surveySendBackError, surveySendBackItems,
} from '@/lib/service/survey';

export const dynamic = 'force-dynamic';

// POST { note } — หนึ่งบรรทัดหนึ่งข้อ (แผน §10.5 S3)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    /* ⭐ แยกข้อที่ server ด้วยตัวเดียวกับจอ — ตัวคำขอยังเป็นข้อความดิบ `{ note }` ⇒ แท็บเก่าที่ส่ง
       บรรทัดเดียวยังใช้ได้ (ได้หนึ่งข้อ) · ของที่เก็บคือข้อที่ตัดบรรทัดว่างแล้ว ไม่ใช่ข้อความดิบ */
    const { items, error: itemsError } = surveySendBackItems(body.note);
    const note = items.join('\n');

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* ⚠️ **ต้องนับของขาดจากฐาน ไม่ใช่เชื่อจอ** — จอที่โหลดค้างไว้ตั้งแต่ก่อนช่างบันทึก
       จะบอกว่ายังขาด ทั้งที่ครบไปแล้ว ⇒ ช่างได้กระดิ่งให้กลับไปทำของที่ทำเสร็จแล้ว */
    const zones = await loadSurveyZones(supabase, id);
    const files = await Promise.all(
      zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)),
    );
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    const gaps = surveyCrewGaps(zones, filesByZone);

    /* คนที่จะได้รับแจ้ง = คนที่ถูกมอบหมายบนนัดของใบนี้ (คนไป + คนช่วย)
       ⚠️ ใช้ `findSurveyVisit` แบบไม่กรองสถานะ — นัดที่ปิดว่า `done` ไปแล้วยังบอกได้ว่า
         "ใครไป" และคนคนนั้นยังเขียนผลวัดของใบนี้ได้อยู่ (`visitWriteAccess` ดูการมอบหมาย
         ไม่ได้ดูสถานะนัด) ⇒ เขาคือคนที่กลับไปเก็บงานได้จริงโดยไม่ต้องลงคิวใหม่ */
    const visit = await findSurveyVisit(supabase, id);
    const crewIds = [...new Set([
      visit?.assigneeId,
      ...(Array.isArray(visit?.assistantIds) ? visit.assistantIds : []),
    ].filter(Boolean).map(String))];

    /* 🔑 ด่านตัวเดียวกับที่ปุ่มบนจอใช้ — สิทธิ์ · ล็อก · แจ้งถึงใครไหม · ข้อความ/ข้อ อยู่ในนั้นครบ
       ⚠️ ไม่ส่ง `gaps` เข้าด่านแล้ว (S4) — ของขาดเป็นเรื่องเล่าในข้อความ ไม่ใช่เงื่อนไขว่าส่งกลับได้ไหม */
    const gate = surveySendBackError(request, {
      canSend: canSendSurveyResult(user), note, crewIds,
    });
    if (gate) {
      if (/ได้เฉพาะหัวหน้า/.test(gate)) return forbidden(gate);
      // ข้อความสั้น/ข้อเกินเพดาน = คำขอผิด (400) ไม่ใช่สภาพใบ (409)
      if (gate === itemsError || /ต้องบอกว่าให้กลับไปทำอะไร/.test(gate)) return badRequest(gate);
      return conflict(gate);
    }

    // เธรดเป็นบรรทัดเดียว — ข้อคั่นด้วยจุด ครบทุกข้อ (ข้อทั้งชุดอยู่ใน `meta.items` ให้จอของช่างติ๊ก)
    const text = surveySendBackBody(gaps, items.join(' · '));

    /* บรรทัดในเธรดของใบ — **ผู้ขอเห็นด้วย และควรเห็น** ผลที่รอมาช้าลงเพราะอะไร
       ⚠️ แต่บรรทัดนี้ **ไม่ใช่ตัวที่แจ้งช่าง** (ดูหัวไฟล์) ⇒ ต้องยิงกระดิ่งแยกข้างล่าง
       🐞 UAT 25/09 — เดิมทิ้งผล (`appendUpdate` ไม่ throw คืน `{ row, error }`) ⇒ เขียนพลาดแล้วช่างยังได้กระดิ่ง
         หัวหน้าได้ toast สำเร็จ แต่แถวนี้คือที่เก็บเดียวของ "ส่งกลับค้าง" ⇒ ใบไม่มีเรื่องค้าง ช่างกดแจ้งแก้แล้ว
         โดนตอบ "ไม่มีเรื่องที่หัวหน้าแจ้งให้แก้ค้างอยู่" ⇒ พลาด = ตอบ error ก่อนถึงกระดิ่ง (แบบเดียวกับ send-back-done) */
    const { row, error: writeError } = await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: 'send_back',
      body: text,
      /* `note` = ข้อความที่หัวหน้าพิมพ์ ⇒ จอของช่างยกไปโชว์บนแถบ "หัวหน้าให้กลับไปแก้" ได้ตรง ๆ
         โดยไม่ต้องแกะจาก body (แถวเก่าก่อน 2026-09-22 ไม่มี — `surveySendBackState` ตัดจาก body ให้)
         `items` = ข้อที่ช่างติ๊กทีละข้อ (S3) · ⚠️ `note` ยังเก็บ (ข้อต่อบรรทัด) และอยู่ท้ายสุด —
         แถบเดิมของช่างกับแท็บที่เปิดค้างอ่านตัวนี้ */
      meta: { gates: gaps.map((g) => g.key), crew: crewIds.length, items, note },
      user,
    });
    if (writeError || !row) return fail(`บันทึกการส่งกลับไม่สำเร็จ — ${writeError || 'ไม่ได้แถวกลับมา'} · ลองใหม่อีกครั้ง`, 500);

    /* 🔴 กระดิ่งของช่าง — `href` ต้องเป็นจอที่เขาเปิดได้ ไม่ใช่หน้าคำร้องที่เขาโดน 403
       🐞 UAT 25/09 — กระดิ่งตัดที่ 500 ตัวอักษร ⇒ ใช้ฉบับกระดิ่ง (ของขาดก่อน · ข้อของหัวหน้าย่อ) ไม่ใช่ `text` */
    const notified = await notifyUsers(supabase, {
      userIds: crewIds,
      entityType: 'dept_request',
      entityId: id,
      kind: 'survey_send_back',
      title: `กลับไปเก็บงานที่ ${request.title || request.docNo || 'ใบประเมิน'}`,
      body: surveySendBackBody(gaps, items, { bell: true }),
      actorName: user?.name || null,
      href: `/service/surveys/${id}`,
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: request,
      /* "ติด 0 ข้อ" อ่านเหมือนนับพลาด — ฝั่งช่างครบแล้วพูดตรง ๆ ว่าครบ (ส่งกลับเพื่อขอเพิ่ม · S4) */
      summary: `แจ้งช่างให้กลับไปเก็บงาน ${request.docNo || id} — ${items.join(' · ')}`
        + ` · ${gaps.length ? `ติด ${gaps.length} ข้อ` : 'ฝั่งช่างครบแล้ว'} · แจ้ง ${notified.sent || 0} คน`,
      request: req,
    });
    return ok({ gaps, notified: notified.sent || 0 });
  } catch (e) {
    return fail(e.message, 500);
  }
});

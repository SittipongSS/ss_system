// ── ข้อมูลของใบประเมินสำหรับจอฝ่าย TS (เฟส 3) ────────────────────────────
//
// ⭐ **ทำไมไม่ใช้ `/api/sa/requests/[id]`** — เส้นนั้นตอบ "ใบคำร้อง" ในภาษาของระบบคำร้อง
//   (รายการ · เธรด · สถานะ) · จอของ TS ต้องการ **ผลวัดรายพื้นที่ + ไฟล์ของแต่ละพื้นที่**
//   ซึ่งเป็นตารางลูกที่เส้นนั้นไม่รู้จัก ⇒ ยิงเส้นนั้นแล้วต้องยิงตามอีกสองรอบต่อพื้นที่
//
// ⚠️ ด่านอ่านเป็น **ด่านของคำร้อง** ไม่ใช่ด่านโมดูลบริการล้วน — ใบที่ไม่ได้ส่งถึงฝ่ายเรา
//   ต้องอ่านไม่ได้ ถึงจะถือ `service:view` ก็ตาม (id หลุดทางลิงก์แจ้งเตือนได้)
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService, canSendSurveyResult } from '@/lib/permissions';
import { canOpenRequestPage, canOpenSurveySheet, surveyReadError } from '@/lib/service/surveyAccess';
import { listAttachments } from '@/lib/master/attachments';
import { loadSurveyCrew, loadSurveySheetContext, loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveySendBackOnSheet } from '@/lib/service/survey';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const dynamic = 'force-dynamic';

const isOnVisit = (user, visit) => {
  if (!user?.id || !visit) return false;
  const crew = [visit.assigneeId, ...(Array.isArray(visit.assistantIds) ? visit.assistantIds : [])];
  return crew.filter(Boolean).map(String).includes(String(user.id));
};

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ตัดคนนอกโมดูลก่อนแตะฐาน — ไม่งั้นการยิง id ไปเรื่อย ๆ บอกได้ว่าใบไหนมีอยู่จริง
    if (!canOpenSurveySheet(user)) return forbidden();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* 🔑 **ด่านอ่านอยู่ที่เดียว** (`surveyReadError`) — ยอมทั้งคนคุมคิวและช่างหน้างาน
       🐞 เดิมเป็น `canViewRequests` ล้วน ซึ่งปิดประตูใส่ role `ts` ที่จอนี้ทำมาให้เขาใช้ */
    const readError = surveyReadError(user, request);
    if (readError) return forbidden(readError);

    const zones = await loadSurveyZones(supabase, id);

    /* ── ทุกอย่างที่เหลือของใบ ยิงพร้อมกันรอบเดียว ────────────────────────────
       ① ไฟล์ของแต่ละพื้นที่ — ด่านนับรูปต้องการของจริง ไม่ใช่ตัวเลขที่จอเดา
          ⚠️ ยิงรายพื้นที่ **ขนานกัน** — ใบหนึ่งมีสิบพื้นที่ ยิงเรียงกันคือรอสิบรอบ
          ⚠️ ใบที่ยังไม่มีพื้นที่เลย = `[]` ไม่ใช่ error (ร่างที่เพิ่งเปิด)
       ② นัดของใบ — ที่เดียวที่บอกว่า "ใครไป" ⇒ ด่านเขียนของช่างอ่านจากตัวนี้
          ⭐ `preferOpen` — นัดที่ยังค้างมาก่อนใบล่าสุด: โมดัลส่งผลบอกว่าจะปิดนัดไหน และ route ส่งผลปิด
             **นัดที่ค้าง** (มติ 24/09) ⇒ จอต้องถือนัดตัวเดียวกัน ไม่งั้นส่งผลโดน 409 "นัดเปลี่ยนไป" ทุกครั้ง
       ③ ของประกอบใบที่การ์ดควบคุมและหัวใบต้องใช้ (PR2):
          ไซต์ (รหัส/ชื่อ/ที่อยู่/ผู้ติดต่อ · ช่วงเข้าไซต์/เงื่อนไขการเข้า/ลิงก์แผนที่ ของหัวงาน §10.5 S5) ·
          รหัส ZN ของแต่ละพื้นที่ · รหัส AR ของลูกค้า ·
          แถว "ดึงผลกลับ" ล่าสุด
          🔴 **ชิ้นไหนอ่านไม่สำเร็จ ตอบ `unknown.<ชิ้น>` ไม่ใช่ปล่อยว่างเงียบ** — ใบที่อ่าน
             ไซต์ไม่สำเร็จกับใบที่ไม่มีไซต์ต้องหน้าตาไม่เหมือนกันบนจอ (`ไม่ทราบ` vs ขีด)
          ⚠️ ไม่ตีกลับทั้งเส้นเมื่อชิ้นประกอบล้ม — ผลวัดซึ่งเป็นเนื้อหลักของจออ่านได้แล้ว
             ตีกลับ 500 = ช่างที่ยืนอยู่หน้างานเปิดใบไม่ได้เพราะที่อยู่ไซต์อ่านไม่ออก
          ⚠️ ตัวโหลดเติม `zoneCode` ลงแถว `zones` ให้ในที่ (อ่านสดจากทะเบียน ไม่ประทับลงแถว)
       ④ ทีมบนนัด (§10.5 S5) — ชื่อผู้ช่วยต้องรู้ก่อนว่านัดไหน ⇒ **ต่อท้ายนัดในสายเดียวกัน** ไม่ใช่รอทั้งก้อน
          (ใบที่ไม่มีผู้ช่วยไม่ยิงอะไรเพิ่มเลย) · ล้มรายคน = `unknown.crew` ไม่ใช่ 500

       ⭐ **ไม่มีก้อนไหนรอผลของอีกก้อน ⇒ ยิงขนานกัน** — จอนี้ถูกโหลดใหม่ทุกครั้ง
          ที่บันทึก/ส่ง/ดึงกลับ และทุกครั้งที่สลับกลับมาที่แท็บ (`useRevalidateOnFocus`)
          ⇒ รอบเดินทางที่เพิ่มมาหนึ่งรอบ คือรอบที่ช่างรอทุกครั้งที่กดบันทึกหน้างาน
       ⚠️ `findSurveyVisit` ยัง throw ได้เหมือนเดิม ⇒ ทั้งเส้นยังเป็น 500 เท่าเดิม
          (ตั้งใจ: มันเป็นด่านตัดสิน `canWrite` — เดาแทนไม่ได้ ต้อง fail-closed) */
    const [files, [visit, crewRes], context] = await Promise.all([
      Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase))),
      findSurveyVisit(supabase, id, { preferOpen: true })
        .then(async (found) => [found, await loadSurveyCrew(supabase, found, { viewerId: user?.id })]),
      loadSurveySheetContext(supabase, request, zones),
    ]);
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    if (crewRes.unknown) context.unknown.crew = true;

    // ⚠️ ส่ง `canWrite` มาจาก server ไม่ให้จอคำนวณเอง (จอไม่รู้ user id ของตัวเอง)
    const canEditAll = canEditService(user);
    const access = (canEditAll || canDoFieldWork(user))
      ? visitWriteAccess({ user, visit, canEditAll })
      : { ok: false, error: null };

    return ok({
      request,
      zones,
      filesByZone,
      /* นัดของใบ — `select('*')` อยู่แล้ว ⇒ รหัส SV · วัน/เวลา · ชื่อช่าง · สถานะนัด
         มาครบตั้งแต่เดิม (จอใช้ทั้งบอกว่าใครไป และเป็นด่านว่าใครเขียนได้) */
      visit,
      /* ⭐ ทีมบนนัด `[{ id, name, lead, you, gone? }]` — คนไปก่อน แล้วผู้ช่วย · `you` = คนที่เปิดจอ (หัวงานเขียน "คุณ")
         ⚠️ จอไม่รู้ user id ของตัวเอง ⇒ server บอก (ท่าเดียวกับ `canWrite` · `onVisit`) */
      crew: crewRes.crew,
      site: context.site,
      customer: context.customer,
      recall: context.recall,
      /* ⭐ หัวหน้าส่งกลับให้แก้ค้างอยู่ไหม — แถบของช่างขึ้นปุ่ม "แจ้งหัวหน้าว่าแก้แล้ว" ตามตัวนี้
         และการ์ดของหัวหน้าบอกว่ารอช่างแก้/ช่างแจ้งแล้ว */
      /* ใบส่งผลแล้ว = เรื่องที่ค้างไม่ค้างแล้ว (ผลล็อก ช่างแก้ต่อไม่ได้) · ดึงกลับ = ค้างตามจริงอีกครั้ง (`surveySendBackOnSheet`) */
      sendBack: surveySendBackOnSheet(context.sendBack, request),
      unknown: context.unknown,
      canWrite: access.ok === true,
      /* ⭐ **คนละสิทธิ์กับ `canWrite`** — เคาะแพ็คเกจ/จุด และกดส่งผล เป็นการตัดสินใจ
         เชิงพาณิชย์ของหัวหน้าฝ่าย ไม่ใช่การรายงานหน้างานของช่าง (แผน §5.4) */
      canDecide: canSendSurveyResult(user),
      // เหตุผลที่เขียนไม่ได้ — จอต้องบอกเหตุ ไม่ใช่ซ่อนปุ่มเงียบ ๆ
      writeBlockedReason: access.ok ? null : (access.error || 'ไม่มีสิทธิ์บันทึกผลของใบนี้'),
      /* ⭐ **เปิดหน้าคำร้องได้ไหม** — จอเอาไปตัดสินว่าจะโชว์ลิงก์ "คำร้อง RQ-…" หรือไม่
         🐞 จอเคยเดาเองว่า "เขียนได้แต่เคาะไม่ได้ = ช่าง" ⇒ **ช่างที่ไม่ได้อยู่ในนัด**
            (เปิดใบของเพื่อนอ่านได้ตามกติกาของโมดูล) หลุดเป็น "คนดู" แล้วได้ลิงก์ที่
            ตอบ 403 ใส่เขา · สิทธิ์ผูกกับ role ซึ่งจอไม่รู้ ⇒ server ตอบให้ที่นี่
         ⚠️ **ไม่ใช่ด่านอ่านของใบประเมิน** — ด่านนั้นคือ `surveyReadError` ข้างบน */
      canOpenRequest: canOpenRequestPage(user),
      /* ⭐ **คนดูอยู่บนนัดนี้ไหม** (คนไป/คนช่วย) — แถบ "เริ่มงาน/ส่งงาน" ของช่างขึ้นให้หัวหน้า
         เฉพาะเมื่อเขาเป็นคนออกหน้างานเอง (Senior) · หัวหน้าที่เปิดมาเคาะแพ็คเกจไม่ใช่คนส่งงาน
         ⚠️ จอไม่รู้ user id ของตัวเอง ⇒ server ตอบให้ (ท่าเดียวกับ `canWrite`) */
      onVisit: isOnVisit(user, visit),
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

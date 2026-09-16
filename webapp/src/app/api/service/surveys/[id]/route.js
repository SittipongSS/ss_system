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
import { loadSurveySheetContext, loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const dynamic = 'force-dynamic';

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
       ③ ของประกอบใบที่การ์ดควบคุมและหัวใบต้องใช้ (PR2):
          ไซต์ (รหัส/ชื่อ/ที่อยู่/ผู้ติดต่อ) · รหัส ZN ของแต่ละพื้นที่ · รหัส AR ของลูกค้า ·
          แถว "ดึงผลกลับ" ล่าสุด
          🔴 **ชิ้นไหนอ่านไม่สำเร็จ ตอบ `unknown.<ชิ้น>` ไม่ใช่ปล่อยว่างเงียบ** — ใบที่อ่าน
             ไซต์ไม่สำเร็จกับใบที่ไม่มีไซต์ต้องหน้าตาไม่เหมือนกันบนจอ (`ไม่ทราบ` vs ขีด)
          ⚠️ ไม่ตีกลับทั้งเส้นเมื่อชิ้นประกอบล้ม — ผลวัดซึ่งเป็นเนื้อหลักของจออ่านได้แล้ว
             ตีกลับ 500 = ช่างที่ยืนอยู่หน้างานเปิดใบไม่ได้เพราะที่อยู่ไซต์อ่านไม่ออก
          ⚠️ ตัวโหลดเติม `zoneCode` ลงแถว `zones` ให้ในที่ (อ่านสดจากทะเบียน ไม่ประทับลงแถว)

       ⭐ **ไม่มีก้อนไหนรอผลของอีกก้อน ⇒ ยิงขนานกัน** — จอนี้ถูกโหลดใหม่ทุกครั้ง
          ที่บันทึก/ส่ง/ดึงกลับ และทุกครั้งที่สลับกลับมาที่แท็บ (`useRevalidateOnFocus`)
          ⇒ รอบเดินทางที่เพิ่มมาหนึ่งรอบ คือรอบที่ช่างรอทุกครั้งที่กดบันทึกหน้างาน
       ⚠️ `findSurveyVisit` ยัง throw ได้เหมือนเดิม ⇒ ทั้งเส้นยังเป็น 500 เท่าเดิม
          (ตั้งใจ: มันเป็นด่านตัดสิน `canWrite` — เดาแทนไม่ได้ ต้อง fail-closed) */
    const [files, visit, context] = await Promise.all([
      Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase))),
      findSurveyVisit(supabase, id),
      loadSurveySheetContext(supabase, request, zones),
    ]);
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));

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
      site: context.site,
      customer: context.customer,
      recall: context.recall,
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
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

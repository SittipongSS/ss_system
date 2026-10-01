// ── API รอบบริการรายใบ (mig 0188 · ความถี่ตามปฏิทิน mig 0397) ─────────────
// PATCH  : แก้รอบ · ?generate=1 = เติมนัดล่วงหน้าให้ครบ horizon ด้วย
//          เปลี่ยนความถี่/ช่วงวันของรอบที่มีนัดอยู่แล้ว → นัดตามรอบเดิมที่ยังไม่ได้เข้าและไม่มีใครย้ายวัน ต้องได้คำยืนยัน
//          (`cancelVisitIds`) ก่อนถูกยกเลิก — ยังไม่ยืนยัน = 409 `plan_schedule_confirm` พร้อมรายการ ยังไม่เขียนอะไร
// DELETE : ลบรอบ — **รอบที่มีนัดปิดงานแล้วลบไม่ได้** (แอดมินบังคับได้ด้วย ?force=1)
//          นัดที่ gen ไว้แล้วยังอยู่เสมอ (FK เป็น SET NULL) กลายเป็นงานนอกรอบ
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { canForceDelete, isDryRun, isForceRequest } from '@/lib/forceDelete';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { appendUpdate } from '@/lib/master/updates';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { IN_CHUNK_SIZE } from '@/lib/supabaseInChunks';
import { CADENCE_TEXT, cadenceText, isWorkday } from '@/lib/service/cadence';
import { planForceManifest } from '@/lib/service/forceDeleteService';
import { generateVisitsForPlan, loadPlanHolidays, planHolidayGapYears } from '@/lib/service/planGen';
import {
  cancelConfirmation, mergePlanPatch, normalizePlanInput, planScheduleDiff,
} from '@/lib/service/rounds';
import { isClosedVisit, planDeleteBlocker } from '@/lib/service/visitStatus';
import { requirePlan } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

/* สถานะที่ "ยังไม่ได้เข้า" — นัดตามรอบเดิมถูกยกเลิกได้เฉพาะสองสถานะนี้ · ตัวกรองของคำสั่งเขียนเอง
   ⇒ นัดที่ช่างกดเริ่มงานไปในเสี้ยววินาทีระหว่างอ่านกับเขียน ไม่ถูกยกเลิก */
const CANCELLABLE_STATUSES = ['draft', 'scheduled'];

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requirePlan({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.plan;

    const body = await req.json().catch(() => ({}));
    /* 🔴 แท็บรุ่นก่อน mig 0397 ส่งแค่ `everyDays` (ค่าตั้งต้น 30) ทุกครั้งที่บันทึก — บนรอบที่ตั้งตามปฏิทินแล้ว
       ต้อง **ปฏิเสธ** ไม่ใช่แปลงเป็น "ทุก 30 วัน" เงียบ ๆ (`mergePlanPatch` · ยังไม่เขียนอะไร) */
    const { merged, error: mergeError } = mergePlanPatch(before, body);
    if (mergeError) return badRequest(mergeError);
    const { value, error } = normalizePlanInput(merged);
    if (error) return badRequest(error);

    /* 🪤 **ด่านเดียวกับ POST ต้องมีที่นี่ด้วย** — `salesOrderId` ไม่มี FK (mig 0188:20)
       และ `normalizePlanInput` ปล่อยผ่านทุกค่า · เดิม PATCH ไม่เคยตรวจเพราะไม่มีจอไหน
       ส่งค่านี้มาเลย · ตอนนี้ย้ายใบได้แล้ว ⇒ id มั่วเข้าฐานได้ทางนี้
       ⚠️ ตรวจเฉพาะตอนค่า **เปลี่ยน** — PATCH ผสม `{...before, ...body}` ⇒ ค่าเดิม
          ติดมาทุกครั้งที่แก้อะไรก็ตาม ยิงถามฐานทุกครั้งคือคิวรีที่ไม่ได้ตอบอะไรใหม่ */
    const movedOrder = (value.salesOrderId || null) !== (before.salesOrderId || null);
    if (movedOrder && value.salesOrderId) {
      const { data: order, error: orderError } = await supabase
        .from('sales_orders').select('id').eq('id', value.salesOrderId).maybeSingle();
      if (orderError) return fail(orderError.message, 500);
      if (!order) return badRequest('ไม่พบใบสั่งขายที่อ้างถึง');
    }

    /* ── ตารางของรอบเปลี่ยนไหม → นัดตามรอบเดิมใบไหนต้องยกเลิก (mig 0397 · คำตอบเจ้าของข้อ 4) ──────────
       ⭐ คิดทุกครั้งที่รอบยังเปิดอยู่หลังบันทึก (ไม่ใช่เฉพาะตอน "ความถี่เปลี่ยน" — เลื่อนวันเริ่ม/ร่นวันสิ้นสุดก็เปลี่ยนตาราง)
          รอบที่ตารางไม่เปลี่ยน = ไม่มีนัดเข้าข่าย ไม่ถาม ไม่เขียนนัด
       ⚠️ **ปิดรอบ (`isActive` false) ไม่แตะนัด** และไม่อ่านวันหยุด/นัดเลย — พฤติกรรมเดิมที่โมดัลสัญญากับผู้ใช้ไว้
       🔴 วันหยุดอ่านจากตารางก่อนเขียนอะไร — อ่านไม่ได้ = 500 (`loadPlanHolidays` โยน · catch ข้างล่าง)
          ตัวตัดสิน "ย้ายวันเอง" เทียบวันนัดกับวันที่รอบเดิมนัดให้ ⇒ วันหยุดชุดผิด = ยกเลิกนัดที่คนจัดไว้ด้วยมือ */
    let holidays = null;
    let planVisits = [];
    let diff = planScheduleDiff();
    if (value.isActive) {
      holidays = await loadPlanHolidays(supabase);
      planVisits = await fetchAll(() => supabase
        .from('service_visits').select('*')
        .eq('planId', id).order('id', { ascending: true }));
      diff = planScheduleDiff({
        before, after: { ...before, ...value }, visits: planVisits, todayIso: businessDate(), holidays,
      });
    }
    const fromText = cadenceText(before);
    const toText = cadenceText(value);
    /* `manual` = นัดของรอบที่ยังไม่ได้เข้าและไม่มีช่องของรอบ (คนตั้งเอง · แถบ "ตั้งนัดรอบถัดไป" ของรอบทุก N วัน) —
       ไม่เคยถูกยกเลิก/ย้าย แต่จอต้องบอกจำนวน ไม่งั้นงวดเดียวมีสองนัดโดยไม่มีใครรู้ (นับเฉพาะตอนตารางของรอบเปลี่ยน) */
    const kept = {
      moved: diff.keptMoved.length, started: diff.keptStarted.length, past: diff.keptPast.length,
      manual: diff.keptManual.length,
    };

    /* ⭐ **โมดัลต้องบอกผลก่อน** (กติกาโมดัลอนุมัติ) — ยังไม่ได้คำยืนยันครบทุกใบ = 409 พร้อมรายการ **ยังไม่เขียนอะไรเลย**
       ยืนยันมาเกิน (นัดที่ปิด/เริ่ม/ย้ายไประหว่างนั้น) ผ่านได้ · ยืนยันมาไม่ครบ = `stale` ให้จอโชว์รายการใหม่
       ⚠️ ส่งด้วย `ok(payload, 409)` — `fail()`/`conflict()` พกได้แค่ `{ error }` จอจะไม่มีรายการให้แสดง */
    const confirmation = cancelConfirmation(diff, body.cancelVisitIds);
    if (!confirmation.ok) {
      return ok({
        error: confirmation.stale
          ? CADENCE_TEXT.confirm.stale
          : CADENCE_TEXT.confirm.needConfirm(diff.cancel.length),
        code: 'plan_schedule_confirm',
        stale: confirmation.stale,
        preview: {
          fromText,
          toText,
          cancel: diff.cancel.map((visit) => ({
            id: visit.id,
            code: visit.code || null,
            scheduledDate: visit.scheduledDate,
            planSlotDate: visit.planSlotDate,
            status: visit.status,
            assigneeName: visit.assigneeName || null,
          })),
          keptMoved: kept.moved,
          keptStarted: kept.started,
          keptPast: kept.past,
          keptManual: kept.manual,
          reslot: diff.reslot.length,
        },
      }, 409);
    }

    /* ── ลำดับเขียน: ยกเลิก + ถอดออกจากรอบ → บันทึกรอบ (+ audit ของรอบ) → จัดช่องของนัดที่อยู่ต่อ → เติมนัด (D17) ───
       ไม่มีทรานแซกชัน (คำสั่งแยกกัน) ⇒ ลำดับนี้ทำให้ทุกสภาพครึ่งทาง **หายเองเมื่อกดบันทึกอีกครั้ง**:
         · ยกเลิกล้มกลางทาง → รอบยังไม่ถูกบันทึก · กดครั้งถัดไปยังตัดสินจากรอบเดิมตัวจริง และนัดที่ยกเลิกไปแล้วหลุดจากรายการเอง
         · บันทึกรอบล้ม → ไม่เหลือนัดให้ยกเลิก กดครั้งถัดไปบันทึกได้เลย
         · จัดช่อง/เติมนัดล้ม → รอบบันทึกแล้ว กดครั้งถัดไปทำส่วนที่ขาด — นัดที่ช่องยังเป็นของรอบเก่าไม่ใช่ช่องของรอบที่บันทึกแล้ว
           `planScheduleDiff` จึงเก็บไว้เสมอ (ไม่เสนอยกเลิก) แล้วจัดช่องให้ตามกติกาเดิม
       🔴 **นัดที่ถูกยกเลิกเพราะเปลี่ยนรอบถูกถอดออกจากรอบด้วย** (`planId` · `planSlotDate` ว่าง — D26)
          นัดที่ถูกยกเลิกยังถือช่องของรอบ (กันระบบ gen กลับมาเอง) ⇒ ถ้าไม่ถอด เปลี่ยน "วันที่ 22 → 15 → 22"
          ช่องวันที่ 22 ทั้งหมดถูกนัดที่ยกเลิกถือไว้ รอบจะไม่มีนัดเปิดอีกเลย
          นัดยังอยู่ในประวัติของไซต์เป็นนัดยกเลิกนอกรอบ · ที่มาอยู่ในเธรด + audit */
    const nowIso = new Date().toISOString();
    const visitBefore = new Map(planVisits.map((visit) => [visit.id, visit]));
    const cancelled = [];
    const cancelIds = diff.cancel.map((visit) => visit.id);
    for (let at = 0; at < cancelIds.length; at += IN_CHUNK_SIZE) {
      const chunk = cancelIds.slice(at, at + IN_CHUNK_SIZE);
      const { data: rows, error: cancelError } = await supabase
        .from('service_visits')
        .update({ status: 'cancelled', planId: null, planSlotDate: null, updatedAt: nowIso })
        .in('id', chunk).eq('planId', id).in('status', CANCELLABLE_STATUSES)
        .select();
      if (cancelError) return fail(`${CADENCE_TEXT.confirm.cancelFailed} (${cancelError.message})`, 500);
      for (const row of rows || []) {
        cancelled.push(row);
        // เธรด/audit พลาด = log ไม่ใช่ล้มงานหลัก (appendUpdate กับ recordAudit ไม่ throw)
        await appendUpdate(supabase, {
          entityType: 'service_visit', entityId: row.id, kind: 'cancel',
          body: CADENCE_TEXT.confirm.threadBody(fromText, toText), user,
        });
        await recordAudit({
          user, action: 'update', entityType: 'service_visit', entityId: row.id,
          before: visitBefore.get(row.id) || null, after: row,
          summary: `ยกเลิกนัดตามรอบเดิม ${row.code || row.id} · ${row.scheduledDate} · ถอดออกจากรอบ`,
          request: req,
        });
      }
    }

    const { data, error: updateError } = await supabase
      .from('service_plans')
      .update({ ...value, updatedAt: nowIso })
      .eq('id', id).select().single();
    if (updateError) {
      return fail(cancelled.length
        ? `${CADENCE_TEXT.confirm.saveFailed(cancelled.length)} (${updateError.message})`
        : updateError.message, 500);
    }

    /* 🔴 **รอยของการแก้รอบเขียนทันทีที่บันทึกรอบสำเร็จ** — ขั้นถัดไป (จัดช่อง · เติมนัด) ล้มแล้วตอบ 500 ได้ ถ้ารอยอยู่ท้ายสุด
       การเปลี่ยนความถี่ครั้งนี้จะไม่มีแถวของรอบเลย และครั้งที่กดซ้ำจะบันทึก before = after (ค่าเดิมหายจากประวัติ)
       จำนวนนัดที่คงไว้อยู่ในรอยรายนัดข้างล่าง · จำนวนนัดที่เติมอยู่ในรอยของตัวเติมนัด (planGen) */
    await recordAudit({
      user, action: 'update', entityType: 'service_plan', entityId: id, before, after: data,
      /* ⚠️ **ย้ายใบต้องอ่านออกจากบรรทัดสรุป** — มันขยับคอลัมน์ "รอบที่เดิน n/N"
         ของสองใบพร้อมกัน (ใบเก่าลด ใบใหม่เพิ่ม) ⇒ เป็นการเปลี่ยนตัวเลขบนเอกสาร
         ของคนอื่น ไม่ใช่การแก้ความถี่เฉย ๆ */
      summary: `แก้รอบบริการ${toText}`
        + (fromText !== toText ? ` (เดิม ${fromText})` : '')
        + (movedOrder ? ` · ย้ายข้อผูกพันไปใบ ${data.salesOrderId || '(ไม่ผูกใบ)'}` : '')
        + (cancelled.length ? ` · ยกเลิกนัดตามรอบเดิม ${cancelled.length} นัด` : ''),
      request: req,
    });

    /* ── นัดที่อยู่ต่อ: ให้ถือช่องของรอบใหม่ / ล้างช่องของรอบเดิม ─────────────────────────────────────────
       `reslot` นัดที่ยังไม่ได้เข้าซึ่งอยู่ต่อเป็นนัดของรอบใหม่ (วันนัดตรงกัน · หรือช่องของงวดนี้เลยวันไปแล้ว) — นับใน `reslotted`
       `hold`   นัดที่ไม่ถูกยกเลิก (คนย้ายวัน · กำลังทำ · เลยวันนัด · จบไปแล้ว) ซึ่งอยู่ในงวดของช่องใหม่ที่ยังว่าง — ถือช่องนั้น
                ⇒ ตัวเติมนัดไม่สร้างใบที่สองลงงวดเดียวกัน (คำตอบเจ้าของข้อ 2: หนึ่งงวดหนึ่งนัด)
       ⚠️ ต้องมาก่อนเติมนัด — ไม่งั้นช่องใหม่ยังว่าง ตัวเติมจะสร้างนัดใบที่สองลงงวด/วันเดียวกัน */
    let reslotted = 0;
    const reslotIds = new Set(diff.reslot.map((item) => item.visit.id));
    for (const { visit, slot } of [...diff.reslot, ...diff.hold]) {
      const { data: moved, error: reslotError } = await supabase
        .from('service_visits')
        .update({ planSlotDate: slot, updatedAt: nowIso })
        .eq('id', visit.id).eq('planId', id)
        .select();
      if (reslotError) return fail(`${CADENCE_TEXT.confirm.afterSaveFailed} (${reslotError.message})`, 500);
      if (!moved?.length) continue;   // นัดถูกถอดออกจากรอบไประหว่างนั้น — ไม่ใช่นัดของรอบนี้แล้ว
      if (reslotIds.has(visit.id)) reslotted += 1;
      await recordAudit({
        user, action: 'update', entityType: 'service_visit', entityId: visit.id,
        before: visit, after: moved[0],
        summary: `คงนัด ${visit.code || visit.id} · ${visit.scheduledDate} ไว้ตามรอบใหม่ (${toText})`,
        request: req,
      });
    }

    /* นัดที่ไม่ถูกยกเลิกและไม่มีช่องใหม่ให้ถือ → **ล้างช่องของรอบเดิม** (ยังเป็นนัดของรอบ แต่ไม่มีช่อง)
       🔴 ปล่อยช่องเดิมค้างไว้ = บันทึกรอบครั้งถัดไปตัดสิน "ย้ายเอง" ใหม่กับรอบที่ไม่ได้สร้างนัดใบนั้น แล้วเสนอยกเลิก
          นัดที่คนย้ายด้วยมือ ทั้งที่ครั้งนี้แก้แค่หมายเหตุ */
    const releaseIds = diff.release.map((visit) => visit.id);
    for (let at = 0; at < releaseIds.length; at += IN_CHUNK_SIZE) {
      const chunk = releaseIds.slice(at, at + IN_CHUNK_SIZE);
      const { error: releaseError } = await supabase
        .from('service_visits')
        .update({ planSlotDate: null, updatedAt: nowIso })
        .in('id', chunk).eq('planId', id);
      if (releaseError) return fail(`${CADENCE_TEXT.confirm.afterSaveFailed} (${releaseError.message})`, 500);
    }

    // ⚠️ **นัดที่คนย้ายวัน/เริ่มงาน/เลยวันแล้ว ไม่ถูกยกเลิก** ตอนแก้รอบ — ลบแล้ว gen ใหม่คือการลบงานที่คนจัดไว้ด้วยมือ
    // นัดที่ถูกยกเลิกมีเฉพาะชุดที่ผู้ใช้ยืนยันในโมดัล (ข้างบน) · ที่เหลือเติมเพิ่มได้อย่างเดียว
    let generated = [];
    const generating = data.isActive && new URL(req.url).searchParams.get('generate') === '1';
    if (generating) {
      try {
        generated = await generateVisitsForPlan({ supabase, plan: data, user, req, holidays });
      } catch (e) {
        return fail(`${CADENCE_TEXT.confirm.afterSaveFailed} (${e.message})`, 500);
      }
    }

    /* นัดของรอบที่ยังไม่ได้เข้าและ **วันนัดไม่ใช่วันทำการ** ตามตารางวันหยุดที่เพิ่งอ่าน (เฉพาะตอนเติมนัด)
       ⭐ นัดที่สร้างไว้ก่อนเจ้าของคีย์วันหยุดของปีนั้น ถือช่องอยู่แล้ว ⇒ ตัวเติมไม่ย้ายให้ และไม่มีอะไรฟ้อง
          (ตาราง holidays ยังไม่มีปี 2027 ณ 01/10) — บอกรหัสนัดให้คนจัดคิวไปย้ายเอง · ไม่ย้ายให้เองเพราะวันนัดอาจถูกคนเลือกไว้ */
    const today = businessDate();
    const cancelledIds = new Set(cancelled.map((row) => row.id));
    const offDayVisits = generating
      ? [...planVisits, ...generated]
        .filter((visit) => visit.planId === id && !cancelledIds.has(visit.id)
          && CANCELLABLE_STATUSES.includes(visit.status)
          && String(visit.scheduledDate || '').slice(0, 10) >= today
          && !isWorkday(visit.scheduledDate, holidays))
        .map((visit) => ({ id: visit.id, code: visit.code || null, scheduledDate: String(visit.scheduledDate).slice(0, 10) }))
        .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0))
      : [];

    return ok({
      plan: data,
      generated,
      // แถวที่ถูกยกเลิกจริง — สั้นกว่ารายการที่ยืนยันได้ (นัดที่เริ่มงานไปแล้วไม่ถูกแตะ)
      cancelled: cancelled.map((row) => ({ id: row.id, code: row.code || null, scheduledDate: row.scheduledDate })),
      reslotted,
      kept,
      offDayVisits,
      holidayGapYears: holidays ? planHolidayGapYears(data, holidays) : [],
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requirePlan({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.plan;

    // ⭐ ทางลัดผู้ดูแลระบบ — เหตุผลเต็มที่ lib/service/forceDeleteService.js
    const admin = canForceDelete(user);
    if (isDryRun(req) && admin) return ok(await planForceManifest(supabase, id));

    /* 🔴 **ด่านที่หายไป** — การลบ *นัด* ห้ามแตะนัดที่ปิดงานแล้ว ("ประวัติการเข้าไซต์
       คือของมีค่าที่สุดของโมดูล") แต่การลบ *รอบ* ซึ่งเป็นแม่ของนัดพวกนั้นกลับไม่มี
       ด่านอะไรเลย ⇒ ได้ผลเสียแบบเดียวกันผ่านประตูหลัง เพราะ FK เป็น SET NULL
       ⚠️ **ไม่มีจอไหนถามด่านนี้ก่อนเปิดปุ่ม และไม่ควรถามด้วย** (แก้คอมเมนต์ที่เคย
          เขียนว่าจอถาม — ไม่จริงมาตลอด) · ตามกติกา "ติดด่าน = โชว์แล้วบอกเหตุ"
          ปุ่มลบต้องขึ้นเสมอ แล้วเหตุมาตอนกด: route ตอบ 409 พร้อมข้อความจาก
          `planDeleteBlocker` และ `deleteWithForce` เอาไปแสดง (แอดมินได้พรีวิว
          บังคับลบต่อ) ⇒ ตัวตัดสินยังเป็นตัวเดียว แต่ **จอไม่ต้องถามซ้ำ**
          🪤 ถ้าวันหนึ่งย้ายไปซ่อนปุ่มที่จอ จะได้ปุ่มหายโดยไม่บอกเหตุ ซึ่งผิดกติกา */
    const visits = await fetchAll(() => supabase
      .from('service_visits').select('id, status')
      .eq('planId', id).order('id', { ascending: true }));
    const blocked = planDeleteBlocker(visits || []);
    if (blocked && !(isForceRequest(req) && admin)) return conflict(blocked);

    // FK ของนัดเป็น SET NULL — นัดที่ gen ไว้แล้วอยู่ต่อในฐานะงานนอกรอบ
    // (ตั้งใจ: นัดที่ลูกค้ารู้แล้วว่าเจ้าหน้าที่จะมา ห้ามหายไปเพราะแอดมินลบรอบ)
    const { error } = await supabase.from('service_plans').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    /* รอยที่เขียนต้องบอก **ผลจริง** ไม่ใช่แค่ว่าลบอะไร — ใบที่ถูกบังคับลบทั้งที่มี
       ประวัติ คือใบที่คนตามหาทีหลังว่า "ทำไมรอบที่เดินเป็นศูนย์" */
    const closed = (visits || []).filter(isClosedVisit).length;
    await recordAudit({
      user, action: 'delete', entityType: 'service_plan', entityId: id, before,
      summary: blocked
        ? `ลบรอบบริการ${cadenceText(before)} (แอดมินข้ามด่านประวัติ) — นัดที่ปิดงานแล้ว ${closed} ครั้งขาดจากรอบ ไม่ถูกนับเป็นรอบตามข้อผูกพันอีก`
        : `ลบรอบบริการ${cadenceText(before)} — นัดที่สร้างไว้แล้วยังอยู่ในฐานะงานนอกรอบ`,
      request: req,
    });
    return ok({ ok: true, forced: !!blocked });
  } catch (e) {
    return fail(e.message, 500);
  }
});

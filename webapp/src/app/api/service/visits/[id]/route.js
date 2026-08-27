// ── API นัดรายใบ (mig 0188) ──────────────────────────────────────────────
// PATCH  : แก้นัด · ปิดงาน (status=done) จะ **เสนอ** นัดรอบถัดไปกลับไปให้ผู้ใช้ยืนยัน
// DELETE : ลบนัด — ใช้ได้เฉพาะนัดที่ยังไม่เกิดขึ้น (ปิดงานแล้วคือประวัติ ห้ามลบ)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { isReschedule, nextAfterDone, normalizeVisitInput, rescheduleSummary } from '@/lib/service/rounds';
import { VISIT_STATUS_LABELS, canDeleteVisit, isClosedVisit } from '@/lib/service/visitStatus';
import { findPlan, loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';
import { loadAssets, loadZones } from '@/lib/service/sitesRepo';
import { deriveVisitStatus } from '@/lib/service/visitAssets';
import { businessDate } from '@/lib/businessDate';
import { businessTimeKey } from '@/lib/datePeriods';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id });
    if (access.response) return access.response;
    /* ⭐ ส่งอุปกรณ์ + โซนของไซต์มาด้วย — ฟอร์มปิดงานรายเครื่องต้องรู้ว่าที่ไซต์นี้มี
       อะไรให้ทำบ้าง · ของเดิมหน้าปิดงานได้แค่ `visit` + `site` จาก /my-visits ซึ่ง
       select แค่ 12 คอลัมน์และไม่มี assets เลย ⇒ ยิงจากที่นี่ทีเดียวดีกว่าให้จอ
       ไปเรียก /sites/[id]/assets เพิ่มอีกใบ */
    const [items, assets, zones, results] = await Promise.all([
      loadVisitItems(supabase, id),
      loadAssets(supabase, access.visit.siteId),
      loadZones(supabase, access.visit.siteId),
      supabase.from('service_visit_assets').select('*').eq('visitId', id)
        .then(({ data, error }) => { if (error) throw error; return data || []; }),
    ]);
    return ok({ visit: access.visit, items, assets, zones, results });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.visit;

    const body = await req.json().catch(() => ({}));

    /* ⭐ **สถานะของใบสรุปจากลูก ไม่ใช่จากปุ่มที่ช่างเลือก** (มติ 2026-08-02 ข้อ 6)
       ถ้าให้เลือกเอง คนจะกด "เสร็จ" เพราะเป็นปุ่มที่จบงานเร็วที่สุดเสมอ แล้ว "ทำไม่ครบ"
       จะไม่มีวันปรากฏในระบบทั้งที่ของจริงเกิดทุกเดือน
       ⚠️ อ่านผลจาก **แถวจริงใน DB** ไม่ใช่จาก body — เชื่อค่าที่ client ส่งมาเมื่อไร
       ก็ข้ามการสรุปได้ทันที (แพตเทิร์นเดียวกับที่ billing-request-flow §3.5 บันทึกไว้) */
    if (body.closeFromAssets) {
      const { data: results, error: resErr } = await supabase
        .from('service_visit_assets').select('assetId, outcome').eq('visitId', id);
      if (resErr) return fail(resErr.message, 500);
      body.status = deriveVisitStatus(results || []);
      if (body.status === 'unable' && !String(body.unableReason ?? '').trim()) {
        const reasons = (results || []).map((r) => r.reason).filter(Boolean);
        body.unableReason = reasons[0] || 'ไปถึงไซต์แล้วแต่ทำไม่ได้สักรายการ';
      }
    }

    const { value, error } = normalizeVisitInput({ ...before, ...body });
    if (error) return badRequest(error);

    // ⭐ เลื่อนนัดต้องมีเหตุผล (S-5) — ลูกค้าถามว่า "ทำไมช่างไม่มาสักที" ต้องตอบได้ว่า
    // เลื่อนกี่ครั้งเพราะอะไรบ้าง · เหตุผลลง**เธรด** ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียว
    // ถูกเขียนทับทุกครั้งที่เลื่อน = ประวัติเลื่อน 5 ครั้งเหลือ 1
    const rescheduled = isReschedule(before, value);
    const reason = String(body.rescheduleReason ?? '').trim();
    if (rescheduled && !reason) {
      return badRequest('เลื่อนนัดต้องระบุเหตุผล — ประวัติการเลื่อนคือสิ่งที่ต้องตอบลูกค้าทีหลัง');
    }

    /* ⭐ เวลาที่เข้าจริง **ประทับที่ server** (มติ 2026-08-02 ข้อ 5) — ปุ่ม "เริ่มงาน"/
       "ปิดงาน" ไม่ได้เพิ่มข้อมูลใหม่ มันทำให้ช่องที่มีอยู่แล้วเชื่อถือได้ · ของเดิมช่าง
       กรอกทีเดียวตอนปิดงานจากนาฬิกาเครื่องตัวเอง = เลขที่พิมพ์ย้อนหลัง เปลี่ยนเวลาใน
       มือถือแล้วเพี้ยนโดยไม่มีอะไรจับได้
       ⚠️ ต้องเป็น **นาฬิกาไทย** (businessDate/businessTimeKey) — ตารางนี้เก็บ date+time
       แยกกันเป็นเวลาไทยล้วนตามการตัดสินใจของ mig 0187/0188 ไม่ใช่ timestamptz
       ⚠️ `stamp: false` (ค่าตั้งต้น) = คำขอนี้มาจากฟอร์มแก้ ⇒ เวลาที่ส่งมาคือค่าที่คนพิมพ์
       ถ้าต่างจากของเดิมให้ติดธง actualTimeEdited ไว้ ไม่ใช่กลืนเงียบ */
    const nowIso = new Date().toISOString();
    const patch = { ...value };
    if (body.stamp === 'start') {
      patch.actualDate = patch.actualDate || businessDate(nowIso);
      patch.actualStartTime = businessTimeKey(nowIso);
    } else if (body.stamp === 'end') {
      patch.actualDate = patch.actualDate || businessDate(nowIso);
      patch.actualEndTime = businessTimeKey(nowIso);
      // เผลอปิดงานโดยไม่เคยกดเริ่ม — ยังต้องมีเวลาเริ่มไว้คิดชั่วโมงงาน
      if (!patch.actualStartTime) patch.actualStartTime = businessTimeKey(nowIso);
    } else {
      const touched = ['actualStartTime', 'actualEndTime']
        .some((k) => String(patch[k] ?? '') !== String(before[k] ?? '').slice(0, 5));
      // ⚠️ ธงติดค้างทางเดียว — แก้แล้วคือแก้แล้ว ย้อนค่ากลับไม่ได้ล้างประวัติ
      if (touched && (before.actualStartTime || before.actualEndTime)) patch.actualTimeEdited = true;
    }

    const { data, error: updateError } = await supabase
      .from('service_visits')
      .update({ ...patch, updatedAt: nowIso })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_visit', entityId: id, before, after: data,
      summary: `แก้นัดเข้าบริการ ${data.code || id} · ${data.scheduledDate}`, request: req,
    });

    // ── เหตุการณ์ที่ต้องเล่าย้อนหลังได้ ลงเธรดกลาง (S-5) ────────────────
    // ⚠️ เขียนหลัง update สำเร็จเท่านั้น — เธรดที่บอกว่าเลื่อนแล้วแต่วันไม่เปลี่ยนจริง
    // แย่กว่าไม่มีเธรด เพราะคนจะเชื่อเธรดมากกว่าตาราง
    if (rescheduled) {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'reschedule',
        body: rescheduleSummary(before, data, reason), user,
      });
    }
    /* 🐞 ของเดิมบันทึกเธรดเฉพาะ `done` ⇒ `partial`/`unable` ไม่ทิ้งร่องรอยเลย
       ทั้งที่เป็นสองสถานะที่ต้องอธิบายลูกค้ามากที่สุด */
    if (isClosedVisit(data) && !isClosedVisit(before)) {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'done',
        body: [
          `${VISIT_STATUS_LABELS[data.status]} · เข้าจริง ${data.actualDate}`,
          data.unableReason, data.summary,
        ].filter(Boolean).join(' — '),
        user,
      });
    }
    if (data.status === 'cancelled' && before.status !== 'cancelled') {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'cancel',
        body: reason || 'ยกเลิกนัด', user,
      });
    }

    // ⭐ ปิดงานแล้วเสนอนัดรอบถัดไป — **เสนอ ไม่สร้างให้เอง** เพราะรอบอาจถูกยกเลิก
    // ระหว่างทาง หรือช่างรู้ว่าลูกค้าจะย้ายไซต์ · ผู้ใช้กดยืนยันแล้วค่อย POST
    /* 🐞 ของเดิมยิงเฉพาะ `done` ⇒ ปิดเป็น `partial` แล้วไม่มีการเสนอรอบถัดไป
       ทั้งที่เป็นเคสที่ต้องกลับไปแน่นอนที่สุด */
    let suggestion = null;
    if (isClosedVisit(data) && !isClosedVisit(before) && data.planId) {
      const plan = await findPlan(supabase, data.planId);
      if (plan) suggestion = nextAfterDone(plan, data);
    }
    return ok({ visit: data, nextVisitSuggestion: suggestion });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.visit;

    // ⚠️ นัดที่ปิดงานแล้วคือ **ประวัติการเข้าไซต์** ซึ่งเป็นของมีค่าที่สุดของโมดูลนี้
    // ยกเลิกได้ (status) แต่ลบทิ้งไม่ได้
    /* 🐞 ของเดิมบล็อกเฉพาะ `done` ⇒ `partial`/`unable`/`in_progress` ลบทิ้งได้
       = ประวัติการเข้าไซต์หาย ซึ่งคอมเมนต์บรรทัดบนบอกเองว่ามีค่าที่สุดของโมดูล */
    if (!canDeleteVisit(before)) {
      return conflict('นัดที่ช่างไปถึงไซต์แล้วลบไม่ได้ — เป็นประวัติการเข้าไซต์ · ถ้าบันทึกผิดให้แก้ข้อมูลแทน');
    }

    const { error } = await supabase.from('service_visits').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    // เธรด + แจ้งเตือนไม่มี FK — ไม่กวาดคู่กัน = กระดิ่งมีแถวที่กดแล้วไปเจอนัดที่ไม่มีแล้ว
    // (entity อื่นทั้ง 12 ตัวเรียกตัวนี้ตอนลบอยู่แล้ว นัดเข้าบริการเป็นตัวเดียวที่ตกหล่น)
    await purgeUpdates(supabase, 'service_visit', id);

    await recordAudit({
      user, action: 'delete', entityType: 'service_visit', entityId: id, before,
      summary: `ลบนัดเข้าบริการ ${before.code || id} · ${before.scheduledDate}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});

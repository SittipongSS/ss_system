// ── API นัดรายใบ (mig 0188) ──────────────────────────────────────────────
// PATCH  : แก้นัด · ปิดงาน (status=done) จะ **เสนอ** นัดรอบถัดไปกลับไปให้ผู้ใช้ยืนยัน
// DELETE : ลบนัด — ใช้ได้เฉพาะนัดที่ยังไม่เกิดขึ้น (ปิดงานแล้วคือประวัติ ห้ามลบ)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { isReschedule, nextAfterDone, normalizeVisitInput, rescheduleSummary } from '@/lib/service/rounds';
import {
  VISIT_STATUS_LABELS, canDeleteVisit, holdsRequestSlot, isClosedVisit, isLiveVisit,
} from '@/lib/service/visitStatus';
import { SURVEY_VISIT_KIND, findSurveyVisit } from '@/lib/service/surveyVisit';
import { findPlan, loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';
import { findSite, loadAssets, loadZones } from '@/lib/service/sitesRepo';
import { evaluateVisitGate, gateBlocker, gatePassed } from '@/lib/service/visitGate';
import { isSuperuser } from '@/lib/permissions';
import { deriveVisitStatus } from '@/lib/service/visitAssets';
import { businessDate } from '@/lib/businessDate';
import { fmtDate } from '@/lib/format';
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
        /* 🐞 เดิม select แค่ assetId, outcome แล้วบรรทัดล่างไปอ่าน `r.reason` ⇒ เหตุผล
           เป็น undefined เสมอ ใบ unable ทุกใบจึงได้ข้อความสำรอง "ทำไม่ได้สักรายการ"
           ทั้งที่ช่างพิมพ์เหตุผลจริงไว้แล้วรายเครื่อง */
        .from('service_visit_assets').select('assetId, outcome, reason').eq('visitId', id);
      if (resErr) return fail(resErr.message, 500);
      body.status = deriveVisitStatus(results || []);
      if (body.status === 'unable' && !String(body.unableReason ?? '').trim()) {
        const reasons = (results || []).map((r) => r.reason).filter(Boolean);
        body.unableReason = reasons[0] || 'ไปถึงไซต์แล้วแต่ทำไม่ได้สักรายการ';
      }
    }

    /* ปุ่มจับเวลาใช้กับใบที่ยังไม่ปิดเท่านั้น — ใบที่ปิดแล้วยิง `stamp` ซ้ำ จะเขียนทับ
       เวลาจริงด้วย "ตอนนี้" (แก้ผลรายเครื่องตอนเย็น = เวลาจบกลายเป็นตอนเย็น) หรือไม่ก็
       ชน CHECK actual_time_window แล้วโผล่เป็นข้อความ Postgres ดิบให้ผู้ใช้อ่าน
       ⇒ ตอบให้ชัดว่าต้องไปทางไหนแทน (แก้ย้อนหลังผ่านฟอร์มแก้นัด ซึ่งติดธง actualTimeEdited) */
    if (body.stamp && isClosedVisit(before)) {
      return conflict('ใบนี้ปิดงานแล้ว — แก้เวลาย้อนหลังที่ฟอร์มแก้นัด ปุ่มจับเวลาใช้ได้เฉพาะใบที่ยังไม่ปิด');
    }

    /* ⭐ กด "เริ่มงาน" = **server เป็นคนตั้งสถานะ** ไม่ใช่ค่าที่จอส่งมา
       🐞 ของเดิมรอให้ client ส่ง `status: 'in_progress'` มาคู่กับ `stamp: 'start'`
       (หน้า "งานวันนี้" ส่งมาจริง) ⇒ ผู้เรียกที่ส่งแต่ `stamp` ได้ใบที่มีเวลาเริ่ม
       แต่สถานะยังเป็น "นัดไว้" = แถวที่ขัดกันเอง และ `in_progress` กลายเป็นค่าที่
       ต้องพึ่งความสุจริตของจอ ทั้งที่ mig 0300 ทำมาเพื่อไม่ต้องพึ่ง */
    if (body.stamp === 'start' && !isClosedVisit(before)) body.status = 'in_progress';

    // ⚠️ `existingKind` = นี่คือการ *แก้* ของเดิม ไม่ใช่การสร้าง (ดูคอมเมนต์ในตัวด่าน)
    const { value, error } = normalizeVisitInput({ ...before, ...body }, { existingKind: before.kind });
    if (error) return badRequest(error);

    /* ⭐ **ด่านเข้าไซต์** (มติผู้ใช้ 2026-08-28) — ร่างขึ้นตารางได้ต่อเมื่อผ่านด่าน
       ⚠️ ตรวจจาก **ค่าหลังแก้** (`value`) ไม่ใช่ค่าเดิม — คนกดปล่อยเข้าคิวพร้อมกับ
       เลือกช่างในคำขอเดียวกันได้ ถ้าตรวจจาก `before` จะบอกว่ายังไม่มีช่างทั้งที่เพิ่งใส่
       ⚠️ ด่านตัวเดียวกับที่จอใช้ขึ้นปุ่ม — ห้ามเขียนเงื่อนไขซ้ำที่นี่
       🐞 ของเดิมดักแค่ `draft → scheduled` ⇒ ยิง `status: 'in_progress'` (หรือ
       `closeFromAssets`) ใส่ร่างตรง ๆ ข้ามด่านได้ทั้งดุ้น — ร่างที่ยังไม่มีช่างและ
       นัดวันที่ไซต์ปิด กลายเป็น "กำลังทำงาน" ได้ใน request เดียว
       ⇒ ด่านคุม **ทุกทางออกจากร่างไปสู่สถานะที่มีชีวิต** ไม่ใช่ทางเดียว */
    let gateTrail = null;
    if (before.status === 'draft' && isLiveVisit(value)) {
      const site = await findSite(supabase, before.siteId);
      const gate = evaluateVisitGate({ ...before, ...value }, { site });
      const override = String(body.gateOverrideReason ?? '').trim();

      if (!gatePassed(gate)) {
        if (!override) return badRequest(gateBlocker(gate));
        /* ข้ามด่านเป็นสิทธิ์ของหัวหน้า ไม่ใช่ของทุกคนที่แก้งานบริการได้ —
           ของจริงมี 25 จุดที่วิ่งอยู่ทั้งที่หมดสัญญา ถ้าบล็อกแข็งวันแรกงานหยุดทันที
           แต่ถ้าใครก็ข้ามได้ ด่านก็ไม่มีความหมายตั้งแต่วันแรกเหมือนกัน */
        if (!isSuperuser(user?.role)) {
          return badRequest('ข้ามด่านได้เฉพาะหัวหน้า — ให้หัวหน้าเป็นคนกด หรือแก้ให้ครบก่อน');
        }
        if (override.length < 10) {
          return badRequest('การข้ามด่านต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร — เหตุผลนี้จะติดกับใบถาวร');
        }
        gateTrail = {
          gateOverrideById: user.id ? String(user.id) : null,
          gateOverrideByName: user.name || null,
          gateOverrideAt: new Date().toISOString(),
          gateOverrideReason: override,
          skipped: gate.filter((i) => i.state === 'blocked').map((i) => i.label),
        };
      }
      gateTrail = {
        ...(gateTrail || {}),
        queuedById: user.id ? String(user.id) : null,
        queuedByName: user.name || null,
        queuedAt: new Date().toISOString(),
      };
    }

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
    if (gateTrail) {
      const { skipped, ...cols } = gateTrail;
      Object.assign(patch, cols);
    }
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

    /* ── เปิดนัดประเมินที่ปิดไปแล้วกลับมา = อาจได้นัดเปิดสองใบต่อหนึ่งคำร้อง ────
       ⭐ ยามจริงคือ index ของ mig 0316 · ตัวนี้อยู่เพื่อ **ข้อความไทยและสถานะ 409**
          และเพื่อให้แอปทำงานเหมือนกันในช่วงที่ยังไม่ได้รัน migration
       ⚠️ ยิงเฉพาะ transition ที่ *ฟื้น* นัดจริง ๆ — ไม่ใช่ทุกครั้งที่แก้นัด */
    if (before.kind === SURVEY_VISIT_KIND && before.requestId
      && patch.status && patch.status !== before.status
      && holdsRequestSlot({ status: patch.status }) && !holdsRequestSlot(before)) {
      const other = await findSurveyVisit(supabase, before.requestId, { openOnly: true });
      if (other && other.id !== id) {
        return conflict(`ใบคำร้องนี้มีนัดที่ยังไม่ปิดอยู่แล้ว (${other.code || other.id}) — ปิดหรือยกเลิกนัดนั้นก่อน ถึงจะเปิดนัดนี้กลับมาได้`);
      }
    }

    const { data, error: updateError } = await supabase
      .from('service_visits')
      .update({ ...patch, updatedAt: nowIso })
      .eq('id', id).select().single();
    /* 🐞 **แก้สถานะก็ชน index ได้ ไม่ใช่แค่ตอนสร้าง** (mig 0316) — เปิดนัดที่ปิดไปแล้ว
       กลับมาเป็น "นัดไว้" ในขณะที่ใบนั้นมีนัดอื่นเปิดอยู่ = สองนัดเปิดพร้อมกัน ⇒ DB
       ตีกลับ · ปล่อยข้อความดิบขึ้นจอ (`duplicate key value violates unique constraint …`
       พร้อมสถานะ 500) คนอ่านไม่รู้ว่าต้องทำอะไรต่อ และ 500 อ่านเหมือนระบบพัง
       ทั้งที่เป็นกติกาของงาน ⇒ 409 พร้อมข้อความไทย */
    if (updateError) {
      if (String(updateError.message || '').includes('service_visits_survey_open_request_uk')) {
        return conflict('ใบคำร้องนี้มีนัดที่ยังไม่ปิดอยู่แล้ว — ปิดหรือยกเลิกนัดนั้นก่อน ถึงจะเปิดนัดนี้กลับมาได้');
      }
      return fail(updateError.message, 500);
    }

    /* ── นัดประเมินพื้นที่: ใบต้นเรื่องต้องตามวันด้วย (เฟส 2) ────────────────
       🐞 ก่อนหน้านี้ซิงก์ **ทางเดียว** — เลื่อนวันบนใบขยับนัดให้ แต่แก้วันที่หน้าจัดคิวช่าง
          (ซึ่งเป็นที่ที่ TS ทำงานจริง) ใบยังถือวันเก่า ⇒ ฝ่ายขายอ่านใบแล้วบอกลูกค้าผิดวัน
          และตัวนับ "เลยกำหนด" ก็นับจากวันที่ไม่มีใครจะไปแล้ว
       ⚠️ เขียนกลับเฉพาะ **วัน/เวลา** — สถานะของใบเป็นเรื่องของก้าวคำร้อง ไม่ใช่ของนัด */
    if (data.requestId && data.kind === 'survey') {
      const nextDate = data.scheduledDate || null;
      const nextTime = data.startTime ? String(data.startTime).slice(0, 5) : null;
      const { data: reqRow } = await supabase
        .from('dept_requests').select('id, "committedDueDate", "committedDueTime"')
        .eq('id', data.requestId).maybeSingle();
      const changed = reqRow
        && (String(reqRow.committedDueDate ?? '') !== String(nextDate ?? '')
          || String(reqRow.committedDueTime ?? '').slice(0, 5) !== String(nextTime ?? ''));
      if (changed) {
        const { error: syncError } = await supabase.from('dept_requests').update({
          committedDueDate: nextDate,
          committedDueTime: nextTime,
          updatedAt: nowIso,
        }).eq('id', data.requestId);
        if (syncError) {
          console.error('[service-visits] ซิงก์วันกลับใบคำร้องไม่สำเร็จ:', syncError.message);
        } else {
          /* 🐞 **ซิงก์เงียบคือวันที่เปลี่ยนเองบนใบ** — ของเดิมเขียนวันใหม่ลง
             `dept_requests` โดยไม่ลงเธรดของใบเลย ⇒ ฝ่ายขายเปิดใบมาเห็น "TS กำหนดส่ง"
             เป็นอีกวันโดยไม่มีแถวไหนบอกว่าใครเลื่อนและเพราะอะไร (เธรดของ *นัด* มี
             แต่คนอ่านใบไม่ได้เปิดดู) · เหตุผลที่ TS พิมพ์ตอนเลื่อนนัดถูกส่งต่อมาด้วย */
          const from = reqRow.committedDueDate ? fmtDate(reqRow.committedDueDate) : '(ไม่เคยระบุ)';
          const to = nextDate ? fmtDate(nextDate) : '(ไม่ระบุ)';
          await appendUpdate(supabase, {
            entityType: 'dept_request', entityId: data.requestId, kind: 'reschedule',
            body: `TS เลื่อนวันนัดจากตารางช่าง ${from} → ${to}`
              + (nextTime ? ` ${nextTime} น.` : '')
              + (String(reason || '').trim() ? ` — ${String(reason).trim().slice(0, 300)}` : ''),
            user,
          });
        }
      }
    }

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
    /* ⭐ ปล่อยเข้าคิว/ข้ามด่านต้องอยู่ในเธรด — "ทำไมนัดนี้ขึ้นตารางทั้งที่ยังไม่จ่าย"
       เป็นคำถามที่ต้องตอบได้ทีหลัง และคอลัมน์เดียวถูกเขียนทับทุกครั้งที่ปล่อย */
    if (gateTrail) {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'queue',
        body: gateTrail.skipped?.length
          ? `ข้ามด่านแล้วปล่อยเข้าคิว (ข้าม: ${gateTrail.skipped.join(' · ')}) — ${gateTrail.gateOverrideReason}`
          : 'ปล่อยเข้าคิว — ด่านครบ',
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

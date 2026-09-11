// ── API นัดรายใบ (mig 0188) ──────────────────────────────────────────────
// PATCH  : แก้นัด · ปิดงาน (status=done) จะ **เสนอ** นัดรอบถัดไปกลับไปให้ผู้ใช้ยืนยัน
// DELETE : ลบนัด — ใช้ได้เฉพาะนัดที่ยังไม่เกิดขึ้น (ปิดงานแล้วคือประวัติ ห้ามลบ)
import { recordAudit } from '@/lib/audit';
import { canForceDelete, isForceRequest } from '@/lib/forceDelete';
import { withUser, ok, fail, badRequest, conflict, forbidden } from '@/lib/http';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { isReschedule, nextAfterDone, normalizeVisitInput, rescheduleSummary } from '@/lib/service/rounds';
import {
  VISIT_STATUS_LABELS, canDeleteVisit, holdsRequestSlot, isClosedVisit, isLiveVisit,
} from '@/lib/service/visitStatus';
import { SURVEY_VISIT_KIND, findSurveyVisit } from '@/lib/service/surveyVisit';
import { surveyStepBackBody, surveyStepBackPlan } from '@/lib/service/surveyStepBack';
import { surveyEditLockError } from '@/lib/service/survey';
import { findPlan, loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';
import { findSite, loadAssets, loadAssetsByIds, loadZones } from '@/lib/service/sitesRepo';
import { evaluateVisitGate, gateBlocker, gatePassed } from '@/lib/service/visitGate';
import { gateContextForSite, loadVisitGateContext } from '@/lib/service/gateContext';
import { isSuperuser } from '@/lib/permissions';
import { PLANNING_FIELD_ERROR, planningFieldsIn } from '@/lib/service/visitAccess';
import { REMOVE_VISIT_KIND, deriveVisitStatus } from '@/lib/service/visitAssets';
import {
  retrievalApplies, retrievalBlockedMessage, retrievalCandidateIds, retrievalKindSwitchError,
  retrievalPlan, retrievalStatusLockError,
} from '@/lib/service/visitRetrieval';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { commitAssetMove } from '@/lib/service/assetMoveCommit';
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
    /* ⭐ ผลด่านราย **โซน** (PR-C) — ใบส่งงาน/ปิดงานต้องตัดโซนที่ไม่ได้รับอนุญาต
       เป็น "งดบริการ" พร้อมเหตุ · ไซต์เดียวโดนหลาย SO ครอบ จ่ายใบเดียวไปได้เฉพาะ
       โซนที่ใบนั้นครอบ (มติผู้ใช้ 2026-08-27)
       ⚠️ คำนวณจากด่านตัวเดียวกับที่ปฏิเสธจริง — จอห้ามคิดเงื่อนไขเอง */
    const gateCtx = await loadVisitGateContext(supabase, [access.visit.siteId]);
    const gate = evaluateVisitGate(
      access.visit,
      gateContextForSite(gateCtx, access.visit.siteId, { site: null }),
    );
    /* ⭐ **เครื่องที่นัดนี้แตะ แต่ไม่ได้อยู่ที่ไซต์นี้แล้ว** — แยกเป็นคีย์ของมันเอง
       🐞 นัดถอนเครื่องที่ปิดแล้ว: ทุกเครื่องที่ถอนออก "ไม่มีไซต์" ⇒ `loadAssets(siteId)`
         ไม่เห็นมัน ⇒ ใบส่งงานของนัดถอนว่างทั้งใบ และแผ่นปิดงานหาชื่อเครื่องไม่เจอ
       ⚠️ **ห้ามรวมเข้า `assets`** — จอใช้ `assets` ตัดสินว่าเครื่องไหนต้องตอบ (`pendingAssets`)
          และเป็นตัวเลือกเครื่องที่เอามาแทน · เครื่องที่ถอนแล้วถูกติดตั้งที่อื่นเป็น "ใช้งาน"
          ⇒ รวมเข้าไปเมื่อไร จอจะบังคับให้ตอบผลของเครื่องที่อยู่ไซต์อื่น */
    const onSite = new Set(assets.map((a) => a.id));
    const offSiteIds = [...new Set(results.flatMap((r) => [r.assetId, r.replacedByAssetId]))]
      .filter((assetId) => assetId && !onSite.has(assetId));
    const resultAssets = offSiteIds.length ? await loadAssetsByIds(supabase, offSiteIds) : [];
    return ok({
      visit: access.visit, items, assets, zones, results, resultAssets,
      zoneGates: gate.zoneGates || [],
    });
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

    /* ── เจ้าหน้าที่หน้างานแก้ได้เฉพาะ "ผลของการไป" ไม่ใช่ "แผนว่าจะไปเมื่อไร/ใครไป" ────
       ⭐ มติผู้ใช้ 2026-08-30: Operation = *ปิดงานของตัวเอง* · การจัดคิวเป็นของ
          Planner/หัวหน้า ⇒ ด่านรายใบปล่อยเขาเข้ามาแล้ว (`ownWorkOnly`) แต่ต้องกันช่อง
          ที่เป็นเรื่องของ **แผน**: วัน · เวลานัด · ผู้รับผิดชอบ · ไซต์ · ชนิดงาน
       🐞 ไม่กัน = เจ้าหน้าที่เลื่อนนัดตัวเองหนีงานได้ และย้ายงานไปให้คนอื่นได้เงียบ ๆ
          ซึ่งทั้งสองอย่างต้องผ่านคนจัดคิวเสมอ (ลูกค้าถูกแจ้งวันไปแล้ว) */
    if (access.ownWorkOnly && planningFieldsIn(body).length) {
      return forbidden(PLANNING_FIELD_ERROR);
    }

    /* ⭐ **สถานะของใบสรุปจากลูก ไม่ใช่จากปุ่มที่เจ้าหน้าที่เลือก** (มติ 2026-08-02 ข้อ 6)
       ถ้าให้เลือกเอง คนจะกด "เสร็จ" เพราะเป็นปุ่มที่จบงานเร็วที่สุดเสมอ แล้ว "ทำไม่ครบ"
       จะไม่มีวันปรากฏในระบบทั้งที่ของจริงเกิดทุกเดือน
       ⚠️ อ่านผลจาก **แถวจริงใน DB** ไม่ใช่จาก body — เชื่อค่าที่ client ส่งมาเมื่อไร
       ก็ข้ามการสรุปได้ทันที (แพตเทิร์นเดียวกับที่ billing-request-flow §3.5 บันทึกไว้) */
    if (body.closeFromAssets) {
      const { data: results, error: resErr } = await supabase
        /* 🐞 เดิม select แค่ assetId, outcome แล้วบรรทัดล่างไปอ่าน `r.reason` ⇒ เหตุผล
           เป็น undefined เสมอ ใบ unable ทุกใบจึงได้ข้อความสำรอง "ทำไม่ได้สักรายการ"
           ทั้งที่เจ้าหน้าที่พิมพ์เหตุผลจริงไว้แล้วรายเครื่อง */
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

    /* 🔴 **ช่างเลื่อนวันที่เข้าจริงของนัดถอนที่ปิดแล้วไม่ได้** — วันนี้คือตัวตัดสินว่าเครื่องไหน
       "อยู่ที่ไซต์ตอนไปถอน" (เครื่องที่ติดตั้งทีหลังถอนผ่านนัดนี้ไม่ได้) และเป็นวันที่ในประวัติ
       ของเครื่องที่ถอนไปแล้ว · ปล่อยให้เลื่อน = เลื่อนวันไปหลังวันติดตั้งของเครื่องสัญญาใหม่
       แล้วถอนมันออกผ่านนัดเก่าได้ · แผ่นปิดงานไม่ส่งวันใหม่มาอยู่แล้ว (ส่งค่าเดิมกลับ)
       ⚠️ ผู้จัดคิวแก้ได้ตามปกติ (แก้เวลาย้อนหลังเป็นหน้าที่ของฟอร์มแก้นัด) */
    if (access.ownWorkOnly && before.kind === REMOVE_VISIT_KIND && isClosedVisit(before)
      && String(value.actualDate ?? '') !== String(before.actualDate ?? '')) {
      return forbidden('วันที่เข้าจริงของนัดถอนเครื่องที่ปิดงานแล้ว ต้องให้ผู้จัดคิวเป็นคนแก้');
    }

    // 🔴 นัดที่มีผลรายเครื่องแล้วเปลี่ยนชนิดเข้า/ออกจาก "ถอนเครื่อง" ไม่ได้ — ดูเหตุผลที่ตัวตัดสิน
    if (value.kind !== before.kind && (value.kind === REMOVE_VISIT_KIND || before.kind === REMOVE_VISIT_KIND)) {
      const { count: resultCount, error: countError } = await supabase
        .from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('visitId', id);
      if (countError) return fail(countError.message, 500);
      const kindSwitch = retrievalKindSwitchError(before, value, { hasResults: (resultCount || 0) > 0 });
      if (kindSwitch) return badRequest(kindSwitch);
    }

    /* ⭐ **ด่านเข้าไซต์** (มติผู้ใช้ 2026-08-28) — ร่างขึ้นตารางได้ต่อเมื่อผ่านด่าน
       ⚠️ ตรวจจาก **ค่าหลังแก้** (`value`) ไม่ใช่ค่าเดิม — คนกดปล่อยเข้าคิวพร้อมกับ
       เลือกเจ้าหน้าที่บริการในคำขอเดียวกันได้ ถ้าตรวจจาก `before` จะบอกว่ายังไม่มีเจ้าหน้าที่ทั้งที่เพิ่งใส่
       ⚠️ ด่านตัวเดียวกับที่จอใช้ขึ้นปุ่ม — ห้ามเขียนเงื่อนไขซ้ำที่นี่
       🐞 ของเดิมดักแค่ `draft → scheduled` ⇒ ยิง `status: 'in_progress'` (หรือ
       `closeFromAssets`) ใส่ร่างตรง ๆ ข้ามด่านได้ทั้งดุ้น — ร่างที่ยังไม่มีเจ้าหน้าที่และ
       นัดวันที่ไซต์ปิด กลายเป็น "กำลังทำงาน" ได้ใน request เดียว
       ⇒ ด่านคุม **ทุกทางออกจากร่างไปสู่สถานะที่มีชีวิต** ไม่ใช่ทางเดียว */
    let gateTrail = null;
    if (before.status === 'draft' && isLiveVisit(value)) {
      const site = await findSite(supabase, before.siteId);
      /* ⭐ ด่าน ①② ตรวจจริงตั้งแต่ PR-C ⇒ ต้องป้อนบริบท (โซน · รอบขาย · ใบ · งวด · สัญญา)
         ⚠️ โหลดผ่าน `loadVisitGateContext` ตัวเดียวกับที่จอใช้ — ประกอบเองแยกกันเมื่อไร
            ปุ่มกับด่านจะพูดคนละเรื่อง */
      const gateCtx = await loadVisitGateContext(supabase, [before.siteId]);
      const gate = evaluateVisitGate(
        { ...before, ...value },
        gateContextForSite(gateCtx, before.siteId, { site }),
      );
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

    // ⭐ เลื่อนนัดต้องมีเหตุผล (S-5) — ลูกค้าถามว่า "ทำไมเจ้าหน้าที่ไม่มาสักที" ต้องตอบได้ว่า
    // เลื่อนกี่ครั้งเพราะอะไรบ้าง · เหตุผลลง**เธรด** ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียว
    // ถูกเขียนทับทุกครั้งที่เลื่อน = ประวัติเลื่อน 5 ครั้งเหลือ 1
    const rescheduled = isReschedule(before, value);
    const reason = String(body.rescheduleReason ?? '').trim();
    if (rescheduled && !reason) {
      return badRequest('เลื่อนนัดต้องระบุเหตุผล — ประวัติการเลื่อนคือสิ่งที่ต้องตอบลูกค้าทีหลัง');
    }

    /* ⭐ เวลาที่เข้าจริง **ประทับที่ server** (มติ 2026-08-02 ข้อ 5) — ปุ่ม "เริ่มงาน"/
       "ปิดงาน" ไม่ได้เพิ่มข้อมูลใหม่ มันทำให้ช่องที่มีอยู่แล้วเชื่อถือได้ · ของเดิมเจ้าหน้าที่
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

    /* ── นัดถอนเครื่อง: ทะเบียนต้องขยับตาม (เหตุผลเต็มที่ lib/service/visitRetrieval.js) ──
       ⚠️ ตรวจ **ก่อน** เขียนใบ — เครื่องที่ถอนไม่ได้ตอนปิดครั้งแรก (วันที่ขัดกับทะเบียน)
          ต้องตีกลับทั้งคำขอ ไม่ใช่ปิดใบไปแล้วค่อยบอกว่าเครื่องยังค้างอยู่ที่ไซต์
       ⚠️ ใช้ค่า **หลังแก้** ของใบ (`nextVisit`) — วันที่เข้าจริงเพิ่งถูกประทับข้างบน */
    let retrieval = null;
    let retrievalFromSite = null;
    if (before.kind === REMOVE_VISIT_KIND) {
      const nextVisit = { ...before, ...patch };
      const [{ data: retrievalRows, error: retrievalRowsError }, retrievalSiteAssets] = await Promise.all([
        supabase.from('service_visit_assets').select('assetId, outcome').eq('visitId', id),
        loadAssets(supabase, before.siteId),
      ]);
      if (retrievalRowsError) return fail(retrievalRowsError.message, 500);
      // ถอนเครื่องออกไปแล้ว ⇒ ใบต้องปิดเป็น "เข้าแล้ว/ทำไม่ครบ" ตลอดไป (ไม่ใช่เข้าไม่ได้/ยกเลิก/เปิดกลับ)
      const statusLock = retrievalStatusLockError(nextVisit, retrievalRows || [], retrievalSiteAssets);
      if (statusLock) return conflict(statusLock);
      if (retrievalApplies(before, nextVisit)) {
        /* ประวัติ return/install/transfer ของเครื่องที่ผลบอกว่าถอนแล้ว — ใช้แยก "ถอนไปแล้วแล้ว
           มีคนติดตั้งคืน" (ห้ามถอนทับ) ออกจาก "ยังไม่เคยถอนสำเร็จ" (ต้องลองใหม่) */
        const { data: priorMoves, error: priorMovesError } = await fetchInChunks(
          retrievalCandidateIds(retrievalRows || []),
          (chunk) => supabase.from('service_asset_moves')
            .select('assetId, kind, note, movedAt, createdAt')
            .in('kind', ['return', 'install', 'transfer']).in('assetId', chunk),
        );
        if (priorMovesError) return fail(priorMovesError.message, 500);
        /* 🔴 **บันทึกซ้ำใช้วันที่เข้าจริงเดิมของใบ ไม่ใช่ค่าที่ส่งมา** — วันที่เข้าจริงไม่ใช่ช่อง
           ของแผน (ช่างแก้ได้) ⇒ ถ้าเชื่อค่าที่ส่งมา ช่างเลื่อนวันของนัดถอนเก่าไปหลังวันติดตั้ง
           ของเครื่องใหม่ที่ไซต์ แล้วถอนมันออกได้ผ่านด่านวันที่ */
        const planVisit = isClosedVisit(before) && before.actualDate
          ? { ...nextVisit, actualDate: before.actualDate } : nextVisit;
        retrieval = retrievalPlan({
          visit: planVisit, results: retrievalRows || [], siteAssets: retrievalSiteAssets,
          priorMoves: priorMoves || [],
        });
        const blocked = retrievalBlockedMessage(retrieval.blocked);
        if (blocked) return badRequest(blocked);
        /* ⚠️ โหลดไซต์ **ก่อนเขียนใบ** — ถ้าไปโหลดหลัง update แล้วมันโยน ใบปิดไปแล้วแต่ไม่มีเครื่อง
           ไหนถูกถอน ไม่มีเธรด "ปิดงาน" และจอได้ 500 ที่อ่านว่า "ไม่ได้ปิด" */
        if (retrieval.moves.length) retrievalFromSite = await findSite(supabase, before.siteId);
      }
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
       🐞 ก่อนหน้านี้ซิงก์ **ทางเดียว** — เลื่อนวันบนใบขยับนัดให้ แต่แก้วันที่หน้าจัดคิวเจ้าหน้าที่
          (ซึ่งเป็นที่ที่ TS ทำงานจริง) ใบยังถือวันเก่า ⇒ ฝ่ายขายอ่านใบแล้วบอกลูกค้าผิดวัน
          และตัวนับ "เลยกำหนด" ก็นับจากวันที่ไม่มีใครจะไปแล้ว
       ⚠️ เขียนกลับเฉพาะ **วัน/เวลา** — สถานะของใบเป็นเรื่องของก้าวคำร้อง ไม่ใช่ของนัด */
    /* จอของช่างต้องบอกผลจริงหลังกดปิด — "ทำไม่ได้แล้ว" เฉย ๆ ไม่ได้บอกว่าใบเดินต่อยังไง */
    let steppedBackRequest = false;
    if (data.requestId && data.kind === 'survey') {
      const nextDate = data.scheduledDate || null;
      const nextTime = data.startTime ? String(data.startTime).slice(0, 5) : null;
      const { data: reqRow } = await supabase
        .from('dept_requests')
        .select('id, status, "committedDueDate", "committedDueTime", "answeredAt", "cancelledAt"')
        .eq('id', data.requestId).maybeSingle();

      /* 🔴 **ถอยกลับขั้น "ลงคิว" เมื่อช่างไปแล้วเข้าไม่ได้** (§5E ② · มติข้อ 23)
         ล้างวันบนใบ ⇒ ทั้งราง คิว ตัวนับ และปุ่มลงคิว derive จากคอลัมน์เดียวนี้
         ⇒ ใบไหลกลับเข้าคิว "รับแล้ว ยังไม่ลงวัน" เอง · นัดเดิมค้างเป็น `unable` ในประวัติ
         ⚠️ ต้องอยู่ **ก่อน** บล็อกซิงก์วันข้างล่าง และบล็อกนั้นต้องไม่เขียนวันกลับมาทับ */
      const stepBack = surveyStepBackPlan({ visit: data, before, request: reqRow });
      if (stepBack) {
        steppedBackRequest = true;
        const { error: backError } = await supabase.from('dept_requests')
          .update({ ...stepBack.patch, updatedAt: nowIso }).eq('id', data.requestId);
        if (backError) {
          console.error('[service-visits] ถอยขั้นใบประเมินไม่สำเร็จ:', backError.message);
        } else {
          /* บรรทัดในเธรดคือตัวที่แจกกระดิ่ง — SA ต้องได้ทั้ง "ยังไม่ได้คำตอบ" และ **เหตุผล**
             ไม่ใช่รู้แค่ว่าวันหายไปเฉย ๆ (แผน §5E ②) */
          /* 🐞 **ห้ามส่ง `user.id` เข้าเธรดของใบคำร้อง** — `notifyThreadUpdate` แจกกระดิ่ง
             ให้ "คนที่เคยโพสต์" ด้วย ⇒ ช่างที่กดปิดนัดเป็น "เข้าไม่ได้" กลายเป็น past
             author ของใบนั้น**ถาวร** แล้วได้กระดิ่งทุกความเคลื่อนไหวของใบตลอดไป
             🔴 และกระดิ่งนั้นพาไป `/requests/[id]` ซึ่ง role `ts` **เปิดไม่ได้ (403)**
               — ได้ toast `forbidden` อังกฤษเปล่า ๆ · เป็นรูสายพันธุ์เดียวกับที่
               `send-back` ปิดไปแล้ว (ยิงกระดิ่งของช่างแยก + href ไปจอที่เขาเปิดได้)
             ⇒ เก็บ **ชื่อ** ไว้ให้ SA อ่านว่าใครแจ้ง แต่ไม่ผูก `authorId` */
          await appendUpdate(supabase, {
            entityType: 'dept_request', entityId: data.requestId, kind: 'unable',
            body: surveyStepBackBody(stepBack),
            user: { name: user?.name || null, department: user?.department || null },
          });
        }
      }

      /* ⚠️ **ซิงก์วันเฉพาะนัดที่ยังกินสิทธิ์อยู่** (`holdsRequestSlot`)
         🐞 ของเดิมไม่ดูสถานะนัดเลย ⇒ PATCH นัดที่ปิดไปแล้วอีกครั้ง (แก้สรุป/แนบไฟล์)
           จะเห็นว่าวันบนใบว่าง ≠ วันของนัด แล้ว **เขียนวันเก่ากลับลงใบ** ⇒ ใบเด้งกลับ
           ขั้น "นัดแล้ว" เองเงียบ ๆ พร้อมวันที่ไม่มีใครจะไป (ปลุก "วันผี" ที่เพิ่งล้างไป) */
      /* 🔴 **ใบที่จบไปแล้วห้ามรับวันใหม่** — ตั้งแต่มีปุ่ม "ปิดใบโดยไม่ได้ประเมิน" (§5E ③)
         ใบถูกปิดขณะที่นัดยังเปิดค้างบนตารางช่างได้จริง ⇒ ช่างแก้สรุปนัดนั้นทีหลังเมื่อไร
         วันจะถูกเขียนกลับลงใบที่ปิดไปแล้ว แล้วใบโผล่กลับเข้าคิว "นัดแล้ว" เองเงียบ ๆ
         ⚠️ ใช้ตัวตัดสินของผลประเมินตัวเดียวกัน (`surveyEditLockError`) ไม่เขียนเงื่อนไขซ้ำ */
      const requestClosedOff = !!surveyEditLockError(reqRow);
      const changed = holdsRequestSlot(data) && reqRow && !requestClosedOff
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
            body: `TS เลื่อนวันนัดจากตารางเจ้าหน้าที่ ${from} → ${to}`
              + (nextTime ? ` ${nextTime} น.` : '')
              + (String(reason || '').trim() ? ` — ${String(reason).trim().slice(0, 300)}` : ''),
            user,
          });
        }
      }
    }

    /* ── ถอนเครื่องออกจากไซต์ — หลังเขียนใบสำเร็จแล้วเท่านั้น ─────────────────
       ⭐ คำสั่ง `return` ตัวเดียวกับปุ่มที่หน้าเครื่อง (ทางเขียนเดียว `commitAssetMove`)
       ⚠️ ล้มรายเครื่องไม่ตีกลับทั้งคำขอ — ใบปิดไปแล้ว และการบันทึกครั้งถัดไปจะปรับให้ตรงเอง
          (แผนตัดสินจากสภาพปัจจุบัน) ⇒ บอกจอว่าเครื่องไหนค้าง แทน 500 ที่อ่านว่า "ไม่ได้ปิด"
       ⚠️ guard `siteId` — เครื่องที่ผู้จัดคิวย้ายไปไซต์อื่นระหว่างทาง ต้องไม่ถูกถอนจากที่ใหม่ */
    const retrieved = { moved: [], failed: [] };
    if (retrieval?.moves.length) {
      for (const { asset, input } of retrieval.moves) {
        const label = asset.label || asset.code || asset.id;
        const result = await commitAssetMove(supabase, {
          asset, kind: 'return', input, fromSite: retrievalFromSite, user, guard: { siteId: data.siteId },
        });
        if (result.error) {
          retrieved.failed.push({ assetId: asset.id, label, error: result.error });
          continue;
        }
        retrieved.moved.push({ assetId: asset.id, label });
        await recordAudit({
          user, action: 'update', entityType: 'service_asset', entityId: asset.id,
          before: asset, after: result.asset,
          summary: `ถอดออกจากไซต์ ${asset.serial || label} · ถอนตามนัด ${data.code || id}`,
          request: req,
        });
      }
    }
    /* ⚠️ เครื่องที่ถอนไม่สำเร็จต้องอยู่ในเธรดของนัดด้วย — toast ของช่างหายไปพร้อมจอ และนัด
       ที่เลยวันแล้วหายจากหน้างานวันนี้ทันทีที่ปิด ⇒ ผู้จัดคิวต้องเห็นจากนัดเองว่ามีเครื่องค้าง
       (บันทึกนัดนี้อีกครั้ง = ระบบลองถอนให้ใหม่) */
    const retrievedText = [
      retrieved.moved.length ? `ถอนเครื่องออกจากไซต์ ${retrieved.moved.length} เครื่อง` : null,
      retrieved.failed.length
        ? `ถอนไม่สำเร็จ ${retrieved.failed.length} เครื่อง (${retrieved.failed.map((f) => f.label).join(' · ')}) — บันทึกนัดนี้อีกครั้งเพื่อลองใหม่`
        : null,
    ].filter(Boolean).join(' · ') || null;

    await recordAudit({
      user, action: 'update', entityType: 'service_visit', entityId: id, before, after: data,
      summary: `แก้นัดเข้าบริการ ${data.code || id} · ${data.scheduledDate}`
        + (retrievedText ? ` · ${retrievedText}` : ''),
      request: req,
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
          data.unableReason, retrievedText, data.summary,
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
    // ระหว่างทาง หรือเจ้าหน้าที่รู้ว่าลูกค้าจะย้ายไซต์ · ผู้ใช้กดยืนยันแล้วค่อย POST
    /* 🐞 ของเดิมยิงเฉพาะ `done` ⇒ ปิดเป็น `partial` แล้วไม่มีการเสนอรอบถัดไป
       ทั้งที่เป็นเคสที่ต้องกลับไปแน่นอนที่สุด */
    let suggestion = null;
    if (isClosedVisit(data) && !isClosedVisit(before) && data.planId) {
      const plan = await findPlan(supabase, data.planId);
      if (plan) suggestion = nextAfterDone(plan, data);
    }
    return ok({
      visit: data, nextVisitSuggestion: suggestion, steppedBackRequest,
      // จอของช่างบอกผลที่เกิดกับทะเบียน — "ปิดแล้ว" เฉย ๆ ไม่บอกว่าเครื่องออกจากไซต์หรือยัง
      retrieval: retrieval ? { moved: retrieved.moved.length, failed: retrieved.failed } : null,
    });
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
    /* ⭐ **ยกเว้นผู้ดูแลระบบที่กด ?force=1** (มติผู้ใช้ 2026-08-28 "ขอสิทธิ์ทุกอย่าง
       ให้แอดมิน รวมลบด้วย" · PR #1501) — นัดเป็นเส้นเดียวในระบบที่ตกหล่นจากมตินั้น
       ⚠️ ด่านนี้เป็น **โค้ดล้วน** ไม่ใช่ FK: ตารางลูกของนัดทั้งสองตัวเป็น CASCADE
          (`service_visit_items` 0188:118 · `service_visit_assets` 0301:31) ⇒ ลบแล้ว
          ลูกหายตามเอง · แอดมินที่ต้องล้างนัดทดสอบ/นัดที่บันทึกผิดจึงติดอยู่ตรงนี้ที่เดียว
       ⚠️ ยังไม่ใช่การเปิดฟรี — ต้องเป็น admin **และ** ส่ง ?force=1 มาโดยตั้งใจ
          (จอถามยืนยันก่อนเสมอ · ปุ่มปกติไม่ส่งธงนี้) */
    const force = isForceRequest(req) && canForceDelete(user);
    if (!canDeleteVisit(before) && !force) {
      return conflict('นัดที่เจ้าหน้าที่ไปถึงไซต์แล้วลบไม่ได้ — เป็นประวัติการเข้าไซต์ · ถ้าบันทึกผิดให้แก้ข้อมูลแทน');
    }

    const { error } = await supabase.from('service_visits').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    // เธรด + แจ้งเตือนไม่มี FK — ไม่กวาดคู่กัน = กระดิ่งมีแถวที่กดแล้วไปเจอนัดที่ไม่มีแล้ว
    // (entity อื่นทั้ง 12 ตัวเรียกตัวนี้ตอนลบอยู่แล้ว นัดเข้าบริการเป็นตัวเดียวที่ตกหล่น)
    await purgeUpdates(supabase, 'service_visit', id);

    await recordAudit({
      user, action: 'delete', entityType: 'service_visit', entityId: id, before,
      // ⚠️ ต้องอ่านออกจาก audit ว่าใบไหนถูกลบด้วยสิทธิ์พิเศษ — ไม่งั้นประวัติที่หายไป
      //    จะดูเหมือนการลบตามปกติทั้งที่ข้ามด่านมา
      summary: `ลบนัดเข้าบริการ ${before.code || id} · ${before.scheduledDate}${force && !canDeleteVisit(before) ? ' (แอดมินข้ามด่านประวัติ)' : ''}`,
      request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});

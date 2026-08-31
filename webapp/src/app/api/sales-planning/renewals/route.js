// ── API ทะเบียนติดตามต่อสัญญาบริการ (mig 0327 · แผน §PR-E) ──────────────────
//
// ⭐ **รายชื่อ "ใกล้หมด" คำนวณสดทุกครั้ง** จาก `service_zone_terms."endDate"` —
//   ตาราง `service_renewal_followups` เก็บแค่ผลการติดตาม ไม่ได้เก็บว่าใครใกล้หมด
//   (กติกาเดียวกับ `termIsActive`: สถานะที่ขึ้นกับวันที่ห้ามเก็บลงฐาน)
//
// ⚠️ ตัวตัดสินทั้งหมดอยู่ที่ `lib/service/renewals.js` — ที่นี่มีหน้าที่หยิบข้อมูลกับ
//   ตรวจสิทธิ์เท่านั้น ห้ามเขียนเงื่อนไข "ใกล้หมดกี่วัน" ซ้ำ
//
// ⚠️ ขอบเขตการมองเห็นเดินตาม **ดีลของใบสั่งขายที่ขายรอบนั้น** (`inSalesViewScope`)
//   ไม่ใช่ทีมของไซต์ — ไซต์เป็นของฝ่ายบริการ แต่การต่อสัญญาเป็นงานขาย
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { loadSites } from '@/lib/service/sitesRepo';
import { loadAllZones, loadTerms } from '@/lib/service/termsRepo';
import { followupPatch, followupSaveError, renewalCounts, renewalRows } from '@/lib/service/renewals';
import { ensureRetrieveVisit } from '@/lib/service/renewalRetrieveVisit';
import { sweepRenewalNotices } from '@/lib/service/renewalNotify';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

/* โหลดของทั้งหมดที่ทะเบียนต้องใช้ — ก้อนเดียวใช้ทั้ง GET และ POST
   (POST ต้องรู้ว่าไซต์นั้นเข้าเขตจริงไหมก่อนเปิดเรื่อง ไม่งั้นเปิดเรื่องให้ไซต์อะไรก็ได้) */
async function loadRenewalContext(supabase, user) {
  const [zones, sites, terms] = await Promise.all([
    loadAllZones(supabase), loadSites(supabase), loadTerms(supabase),
  ]);

  const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
  /* ⚠️ ไล่ทีละหน้า — จำนวนรอบขายโตตามงานที่ขายได้ · เพดาน 1,000 ตัดเงียบแล้ว
     ไซต์ที่หลุดจะ "ไม่ใกล้หมด" ทั้งที่หมดพรุ่งนี้ (check:rowcap คุมไว้) */
  const { data: orders, error: orderError } = orderIds.length
    ? await fetchAllResult(() => supabase.from('sales_orders')
      .select('id, "orderNumber", status, "supersededById", "dealId", "customerId"')
      .in('id', orderIds).order('id', { ascending: true }))
    : { data: [], error: null };
  if (orderError) throw new Error(orderError.message);

  const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
  const { data: deals, error: dealError } = dealIds.length
    ? await fetchAllResult(() => supabase.from('sales_deals')
      .select('id, title, team, "ownerId", "ownerName", line')
      .in('id', dealIds).order('id', { ascending: true }))
    : { data: [], error: null };
  if (dealError) throw new Error(dealError.message);

  const { data: followups, error: followupError } = await fetchAllResult(() => supabase
    .from('service_renewal_followups').select('*').order('id', { ascending: true }));
  if (followupError) throw new Error(followupError.message);

  const dealById = new Map((deals || []).map((d) => [d.id, d]));
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));

  /* ขอบเขต: ตัด term ที่ใบแม่อยู่นอกขอบเขตของผู้ใช้ทิ้งตั้งแต่ต้นทาง
     ⚠️ ตัดที่ term ไม่ใช่ที่แถวสุดท้าย — ไซต์เดียวมีรอบจากหลายดีลได้ ถ้าตัดทีหลัง
     คนที่เห็นดีลเดียวจะได้วันหมดของดีลที่ตัวเองไม่มีสิทธิ์เห็นมาเป็นตัวเรียง */
  const visibleTerms = terms.filter((t) => {
    const order = ordersById.get(t.salesOrderId);
    const deal = order?.dealId ? dealById.get(order.dealId) : null;
    return deal ? inSalesViewScope(user, deal) : false;
  });

  return { zones, sites, terms: visibleTerms, ordersById, dealById, followups: followups || [] };
}

/* เรื่องที่ปิดไปแล้วครอบวันหมดไหนบ้าง (siteId → [วันหมด]) — ตัวกันไม่ให้เรื่องเดิม
   โผล่ซ้ำ และตัวที่ทำให้รอบ **ถัดไป** ยังโผล่ได้ (mig 0327 `coveredEndDate`) */
function closedEndDatesOf(followups = []) {
  const map = new Map();
  for (const row of followups) {
    if (row.status === 'following' || !row.coveredEndDate) continue;
    map.set(row.siteId, [...(map.get(row.siteId) || []), row.coveredEndDate]);
  }
  return map;
}

const rowsOf = (ctx, todayIso) => renewalRows({
  sites: ctx.sites, zones: ctx.zones, terms: ctx.terms, ordersById: ctx.ordersById,
  followups: ctx.followups, closedEndDates: closedEndDatesOf(ctx.followups), todayIso,
});

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  try {
    const todayIso = businessDate();
    const ctx = await loadRenewalContext(supabase, user);
    const rows = rowsOf(ctx, todayIso);
    /* แนบดีล/ใบของรอบที่เร็วที่สุดไปด้วย — จอต้องลิงก์กลับไปที่ใบและรู้ว่าใครเป็นเจ้าของ
       (ไม่ส่งราคา/ยอดไปด้วย: ทะเบียนนี้ตอบว่า "ต้องโทรใครก่อน" ไม่ใช่เรื่องเงิน) */
    const enriched = rows.map((row) => {
      const term = row.terms.find((t) => t.endDate === row.endDate) || row.terms[0];
      const order = ctx.ordersById.get(term?.salesOrderId) || null;
      const deal = order?.dealId ? ctx.dealById.get(order.dealId) || null : null;
      const { terms: _terms, ...rest } = row;
      return {
        ...rest,
        zoneCount: row.terms.length,
        order: order ? { id: order.id, orderNumber: order.orderNumber } : null,
        deal: deal ? { id: deal.id, title: deal.title, ownerId: deal.ownerId, ownerName: deal.ownerName } : null,
      };
    });
    /* ⚠️ **ระบบไม่มี cron** — กระดิ่งถูกกวาดตอนมีคนเปิดทะเบียน (แพตเทิร์นเดียวกับ
       contractQuotationSync) · fire-and-forget: ยิงพลาดต้องไม่ทำให้ทะเบียนพัง
       ⚠️ ยิงจาก `enriched` เพราะผู้รับคือ **เจ้าของดีล** ซึ่งอยู่ในก้อนนั้น */
    sweepRenewalNotices(supabase, enriched, { actorName: user.name || null });
    return ok({ rows: enriched, counts: renewalCounts(rows, todayIso), todayIso });
  } catch (e) {
    return fail(e.message, 500);
  }
});

/* ── บันทึกผลการติดตาม (เปิดเรื่องใหม่ หรืออัปเดตเรื่องที่เปิดอยู่) ────────────
   payload: { siteId, status, nextContactOn?, resultNote?, declineReason?, renewedSalesOrderId? }

   ⚠️ **ด่านคือ `followupSaveError` ตัวเดียวกับที่โมดัลบนจอถาม** — ห้ามเขียนเงื่อนไข
     "ไม่ต่อต้องมีเหตุผล" ซ้ำที่นี่
   ⚠️ ไซต์ต้องอยู่ในทะเบียนจริง ณ ตอนกด (คำนวณสดใหม่) — จอส่ง siteId อะไรมาก็ได้ */
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const siteId = String(body.siteId || '').trim();
  if (!siteId) return badRequest('ต้องระบุไซต์');

  try {
    const todayIso = businessDate();
    const ctx = await loadRenewalContext(supabase, user);
    const row = rowsOf(ctx, todayIso).find((r) => r.siteId === siteId);
    if (!row) return badRequest('ไซต์นี้ไม่ได้อยู่ในทะเบียนต่อสัญญาแล้ว — รีเฟรชแล้วลองใหม่');

    /* สิทธิ์แก้เดินตามดีลของรอบนั้น (เหมือนขอบเขตการมองเห็น) — ไม่ใช่ cap ลอย ๆ
       ⚠️ ไม่มีดีล = แก้ไม่ได้ ไม่ใช่ปล่อยผ่าน (ใบที่ไม่มีดีลคือใบที่หลุดขอบเขตทุกด่าน) */
    const term = row.terms.find((t) => t.endDate === row.endDate) || row.terms[0];
    const order = ctx.ordersById.get(term?.salesOrderId) || null;
    const deal = order?.dealId ? ctx.dealById.get(order.dealId) || null : null;
    const canEdit = canEditSalesPlanning(user) && !!deal && inSalesEditScope(user, deal);

    const open = ctx.followups.find((f) => f.siteId === siteId && f.status === 'following') || null;
    const gate = followupSaveError(open, body, { canEdit });
    if (gate) return fail(gate, 409);

    const patch = followupPatch(body, todayIso);
    const now = new Date().toISOString();

    /* ⭐ ปิดเรื่อง "ไม่ต่อ" ต้องสร้างนัดถอนเครื่องให้ TS จริง (มติผู้ใช้ 2026-09-01)
       ⚠️ **สร้างนัดก่อนเขียนสถานะ declined ลงแถว ไม่ใช่หลัง** — ถ้าสร้างนัดพลาดแล้ว
       ยังปิดเรื่องต่อ จะกลับไปเป็นบั๊กเดิมที่ฟังก์ชันนี้เกิดมาแก้ (ปิดเรื่องไปแล้วแต่
       TS ไม่รู้ตัว) ⇒ ล้มตรงนี้แล้วผู้ใช้เห็น error ยังดีกว่าปิดเรื่องแบบเงียบ ๆ
       ⚠️ ไม่สร้างซ้ำถ้าไซต์นี้มีนัดถอนค้างอยู่แล้ว (`visit: null, error: null`) */
    let retrieveVisit = null;
    if (patch.status === 'declined') {
      const { visit, error: visitError } = await ensureRetrieveVisit(supabase, {
        site: row.site, followup: patch, user, todayIso,
      });
      if (visitError) return fail(`สร้างนัดถอนเครื่องให้ฝ่ายบริการไม่สำเร็จ — ${visitError}`, 500);
      retrieveVisit = visit;
    }

    if (open) {
      const { data, error } = await supabase.from('service_renewal_followups')
        .update({
          ...patch,
          renewedSalesOrderId: body.renewedSalesOrderId || open.renewedSalesOrderId || null,
          updatedAt: now,
        })
        /* กันสองคนกดชนกัน — เรื่องต้องยังเปิดอยู่ ณ ตอนเขียนจริง (แพตเทิร์นเดียวกับ
           ด่านกันกดชนของใบสั่งขาย · ค่าเดิมไม่ใช่ NULL จึงใช้ .eq ได้) */
        .eq('id', open.id).eq('status', 'following')
        .select().maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail('เรื่องนี้เพิ่งถูกปิดโดยคนอื่น — รีเฟรชแล้วลองใหม่', 409);
      await recordAudit({
        user, action: 'update', entityType: 'service_renewal_followup', entityId: open.id,
        before: open, after: data,
        summary: `อัปเดตการติดตามต่อสัญญา ${row.site?.name || siteId} — ${patch.status}`
          + (retrieveVisit ? ` · สร้างนัดถอนเครื่อง ${retrieveVisit.code || retrieveVisit.id}` : ''),
        request: req,
      });
      return ok({ ...data, retrieveVisit });
    }

    const insert = {
      id: genId('SRF'),
      siteId,
      coveredEndDate: row.endDate,
      ownerId: deal?.ownerId || user.id || null,
      ownerName: deal?.ownerName || user.name || null,
      ...patch,
      renewedSalesOrderId: body.renewedSalesOrderId || null,
      openedAt: now,
      createdById: user.id || null,
      createdByName: user.name || null,
      createdAt: now,
      updatedAt: now,
    };
    const { data, error } = await supabase.from('service_renewal_followups').insert(insert).select().single();
    if (error) {
      // UNIQUE (siteId) WHERE following — มีคนเปิดเรื่องของไซต์นี้พร้อมกัน
      if (error.code === '23505') return fail('ไซต์นี้มีเรื่องติดตามที่เปิดอยู่แล้ว — รีเฟรชแล้วลองใหม่', 409);
      return fail(error.message, 500);
    }
    await recordAudit({
      user, action: 'create', entityType: 'service_renewal_followup', entityId: data.id,
      before: null, after: data,
      summary: `เปิดเรื่องติดตามต่อสัญญา ${row.site?.name || siteId} (หมด ${row.endDate})`
        + (retrieveVisit ? ` · สร้างนัดถอนเครื่อง ${retrieveVisit.code || retrieveVisit.id}` : ''),
      request: req,
    });
    return ok({ ...data, retrieveVisit });
  } catch (e) {
    return fail(e.message, 500);
  }
});

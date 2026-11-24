// ── API ทะเบียนติดตามต่อสัญญาบริการ (mig 0327 · แผน §PR-E) ──────────────────
//
// ⭐ **รายชื่อ "ใกล้หมด" คำนวณสดทุกครั้ง** จากสัญญาของใบ (mig 0324) หรือช่วงบริการของใบที่เปิดงานบริการแล้ว (PR-C) —
//   ตาราง `service_renewal_followups` เก็บแค่ผลการติดตาม ไม่ได้เก็บว่าใครใกล้หมด
//   (กติกาเดียวกับ `termIsActive`: สถานะที่ขึ้นกับวันที่ห้ามเก็บลงฐาน)
//
// ⚠️ ตัวตัดสินทั้งหมดอยู่ที่ `lib/service/renewals.js` — ที่นี่มีหน้าที่ตรวจสิทธิ์เท่านั้น ห้ามเขียนเงื่อนไข "ใกล้หมดกี่วัน" ซ้ำ
//   · ตัวโหลด (`loadRenewalContext`) อยู่ที่ `lib/service/renewalContext.js` — ใช้ร่วมกับ cron กระดิ่งต่อรอบบริการ
//
// ⚠️ ขอบเขตการมองเห็นเดินตาม **ดีลของใบสั่งขายที่ขายรอบนั้น** (`inSalesViewScope`)
//   ไม่ใช่ทีมของไซต์ — ไซต์เป็นของฝ่ายบริการ แต่การต่อสัญญาเป็นงานขาย
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { followupPatch, followupSaveError, renewalCounts, renewalLeadTerm } from '@/lib/service/renewals';
import { enrichedRenewalRows, loadRenewalContext, rowsOf } from '@/lib/service/renewalContext';
import { ensureRetrieveVisit } from '@/lib/service/renewalRetrieveVisit';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  try {
    const todayIso = businessDate();
    const ctx = await loadRenewalContext(supabase, user);
    const rows = rowsOf(ctx, todayIso);
    const enriched = enrichedRenewalRows(ctx, rows);
    /* 🪦 เดิมกวาดกระดิ่งต่อรอบบริการตรงนี้ (GET ที่เขียนข้อมูล · กวาดได้แค่ไซต์ในขอบเขตของคนเปิด) — ย้ายไป cron
       daily-digest แล้ว (งวด 3 วันกำหนด · มติเจ้าของ 24/11/2026 · lib/service/renewalNotify.js) */
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
    const term = renewalLeadTerm(row);
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

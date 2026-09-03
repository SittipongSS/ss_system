// ── API ไซต์บริการรายตัว (mig 0187) ──────────────────────────────────────
// GET    : ไซต์ + โซน + เครื่องทั้งหมดในไซต์
// PATCH  : แก้ข้อมูลไซต์
// DELETE : ลบไซต์ — บล็อกถ้ายังมีเครื่องอยู่ (ให้ปิดใช้งานแทน)
import { recordAudit } from '@/lib/audit';
import { canForceDelete, isDryRun, isForceRequest } from '@/lib/forceDelete';
import { deleteSiteDeep, siteForceManifest } from '@/lib/service/forceDeleteService';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { normalizeSiteInput } from '@/lib/service/sites';
import { checkSiteReferences } from '@/lib/service/siteReferences';
import { findCustomer, loadAssets, loadZones, requireSite } from '@/lib/service/sitesRepo';
import { customerSnapshotName } from '@/lib/master/customerName';
import { loadVisits, siteScheduleContext } from '@/lib/service/visitsRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { termOrderActive } from '@/lib/service/terms';
import { serviceRoundsSold } from '@/lib/sales/serviceOrders';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

/* ── ขายไว้กี่รอบของไซต์นี้ (mig 0326) ────────────────────────────────────
   ⭐ นับจาก **รอบขายที่ใบแม่ยังมีผล** เท่านั้น — ใบที่ถูก Rev. ทับแล้วมี term ค้างอยู่
   ในฐานตลอดไป (term ไม่มีคอลัมน์สถานะโดยเจตนา · ตัวตัดสินคือ termOrderActive)
   ⇒ ไม่กรอง = ไซต์ที่เคยต่อสัญญาสองรอบจะบวกรอบซ้ำเป็นสองเท่า
   ⚠️ ใช้ termOrderActive (ชั้นใบแม่) ไม่ใช่ termIsActive (ที่บวกชั้น "วันนี้อยู่ในช่วง")
   — คนตั้งรอบมักตั้งก่อนหรือหลังช่วงของ term เล็กน้อย ถ้ากรองด้วยวันจะได้ 0 บ่อยจนไร้ประโยชน์
   ⚠️ อ่านสดจากบรรทัด ไม่ก๊อป snapshot ที่ term — แก้จำนวนรอบได้ทางเดียวคือ Rev. ที่ QT
   ซึ่งได้ใบใหม่ + term ชุดใหม่อยู่แล้ว */
/* ใบสั่งขายที่ยังมีผลและลงของไว้ที่ไซต์นี้ — ใช้เป็นตัวเลือกตอนผูก/ย้ายรอบ
   ⚠️ อ่านสดทุกครั้ง ไม่แคช: ใบถูก Rev. ระหว่างวันได้ และตัวเลือกที่ล้าจะพาคนไปผูก
   รอบกับใบที่ตายแล้ว */
async function siteSalesOrders(supabase, zones = []) {
  const zoneIds = zones.map((z) => z.id);
  if (!zoneIds.length) return [];
  const terms = await loadTerms(supabase, { zoneIds });
  const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
  if (!orderIds.length) return [];
  const { data: orders, error } = await fetchAllResult(() => supabase.from('sales_orders')
    .select('id, "orderNumber", status, "supersededById"')
    .in('id', orderIds).order('id', { ascending: true }));
  if (error) throw error;
  return (orders || []).filter(termOrderActive)
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber }))
    .sort((a, b) => String(a.orderNumber || '').localeCompare(String(b.orderNumber || '')));
}

async function siteRoundsSold(supabase, zones = []) {
  const zoneIds = zones.map((z) => z.id);
  if (!zoneIds.length) return null;
  const terms = await loadTerms(supabase, { zoneIds });
  if (!terms.length) return null;
  const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
  if (!orderIds.length) return null;
  /* ⚠️ ไล่ทีละหน้าแม้จะกรองด้วย id ชุดเดียว — ไซต์ที่ต่อสัญญามาหลายปีสะสม term ได้เกิน
     พันแถว และเพดาน PostgREST ตัดเงียบ ๆ ⇒ ใบที่หลุดจะถูกนับเป็น "ไม่มีผล" แล้ว
     จำนวนรอบที่ขายหายไปดื้อ ๆ (ด่าน check:rowcap ใน CI คุมไว้) */
  const { data: orders, error: orderError } = await fetchAllResult(() => supabase.from('sales_orders')
    .select('id, status, "supersededById"').in('id', orderIds).order('id', { ascending: true }));
  if (orderError) throw orderError;
  const activeIds = new Set((orders || []).filter(termOrderActive).map((o) => o.id));
  const lineIds = terms
    .filter((t) => activeIds.has(t.salesOrderId))
    .map((t) => t.salesOrderLineId).filter(Boolean);
  if (!lineIds.length) return null;
  const { data: lines, error: lineError } = await fetchAllResult(() => supabase.from('sales_order_lines')
    .select('id, "serviceRounds"').in('id', lineIds).order('id', { ascending: true }));
  if (lineError) throw lineError;
  return serviceRoundsSold(lines || []);
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;
    // schedule = เข้าเติมล่าสุด + นัดครั้งหน้า → ตารางเครื่องใช้ประเมินว่าน้ำหอม
    // จะหมดวันไหน และมีนัดครอบแล้วหรือยัง (S-4)
    const todayIso = businessDate();
    const schedule = await siteScheduleContext(supabase, [id], todayIso);
    const zones = await loadZones(supabase, id);
    return ok({
      site: access.site,
      zones,
      assets: await loadAssets(supabase, id),
      schedule: schedule.get(id) || { lastRefillDate: null, nextVisitDate: null },
      // ข้อผูกพันจำนวนรอบที่ฝ่ายขายระบุไว้ — ฟอร์มวางรอบเอาไปเทียบกับความถี่ที่กำลังตั้ง
      roundsSold: await siteRoundsSold(supabase, zones),
      /* ⭐ **ใบสั่งขายที่ลงของไว้ที่ไซต์นี้** — ตัวเลือกของช่อง "ใบที่ครอบรอบนี้"
         ⚠️ รายการต้องมาจาก term ของไซต์นี้เท่านั้น ไม่ใช่ทะเบียนใบทั้งระบบ:
            รอบที่ผูกใบที่ไม่เคยลงของที่ไซต์นี้คือข้อผูกพันที่อ้างไม่ได้
         ⚠️ กรองด้วย `termOrderActive` — ใบที่ถูก Rev./ยกเลิกแล้วต้องไม่อยู่ในตัวเลือก
            (ย้ายรอบไปใบที่ตายแล้ว = รอบกำพร้าอีกใบ) */
      salesOrders: await siteSalesOrders(supabase, zones),
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.site;

    // ฟอร์มเดียวกับตอนสร้าง (กฎ AGENTS.md) → validate ชุดเดียวกัน โดยรวมค่าเดิม
    // เข้าไปก่อน เพื่อให้ PATCH ที่ส่งมาบางช่องไม่ถูกอ่านว่า "ล้างช่องที่เหลือ"
    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeSiteInput({ ...before, ...body });
    if (error) return badRequest(error);

    // ย้ายไซต์ข้ามลูกค้าได้ (สาขาถูกโอนกิจการเกิดขึ้นจริง) แต่ปลายทางต้องมีจริง
    const moved = value.customerId !== before.customerId;
    let customerName = before.customerName;
    const customer = await findCustomer(supabase, value.customerId);
    if (!customer) return badRequest('ไม่พบลูกค้าที่ระบุ');
    if (moved) customerName = customerSnapshotName(customer);

    /* ⚠️ **ย้ายลูกค้า = ล้างที่อยู่ต้นทาง** (mig 0313) — `customerAddressId` ชี้เข้า
       `addresses[]` ของลูกค้าคนเดิม · ปล่อยไว้แล้วปุ่ม "ดึงใหม่" จะเทียบกับที่อยู่
       ของคนละบริษัท · ข้อความที่อยู่ที่ก๊อปไว้แล้วยังอยู่ครบ หายแค่ "ที่มา" */
    if (moved) value.customerAddressId = null;

    const refError = await checkSiteReferences(supabase, value, customer);
    if (refError) return badRequest(refError);

    const { data, error: updateError } = await supabase
      .from('service_sites')
      .update({ ...value, customerName, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_site', entityId: id, before, after: data,
      summary: `แก้ไซต์บริการ ${data.code || id} · ${data.name}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.site;

    /* ⭐ **ทางลัดผู้ดูแลระบบ** (ผู้ใช้แจ้ง 2026-09-02 "แอดมินลบแล้วติดนู่นนี่")
       มติ #1501 ให้แอดมินลบได้ทุกอย่าง และ 9 route ทั่วระบบต่อ ?force=1 ไปแล้ว
       แต่โมดูลบริการไม่เคยต่อสักเส้น ⇒ แอดมินชนกำแพงทุกครั้งที่จะเก็บกวาด
       ⚠️ ปลดด่านเฉย ๆ ไม่พอ — ลูกเป็น FK RESTRICT หลายชั้น ต้องเก็บกวาดตามลำดับ
          (ดู lib/service/forceDeleteService.js) */
    const admin = canForceDelete(user);
    const force = isForceRequest(req) && admin;

    // ?dryRun=1 — พรีวิวว่าจะลบอะไรพ่วง เดินเส้นเดียวกับตัวลบจริง
    if (isDryRun(req) && admin) {
      return ok(await siteForceManifest(supabase, id));
    }

    if (force) {
      await deleteSiteDeep(supabase, id);
      await recordAudit({
        user, action: 'delete', entityType: 'service_site', entityId: id, before,
        summary: `ลบไซต์บริการ ${before.code || id} · ${before.name} (แอดมินบังคับลบทั้งสาย)`,
        request: req,
      });
      return ok({ ok: true, forced: true });
    }

    // ⚠️ FK ของเครื่องเป็น RESTRICT (mig 0332) — ลบไซต์ที่ยังมีเครื่องไม่ได้
    // ปิดใช้งานคือสิ่งที่ผู้ใช้ต้องการจริงเกือบทุกครั้ง (ของจริงยังอยู่หน้างาน)
    const assets = await loadAssets(supabase, id);
    if (assets.length) {
      return conflict(`ไซต์นี้ยังมีเครื่องอยู่ ${assets.length} เครื่อง — ปิดใช้งานแทนการลบ`);
    }

    // โซนก็ RESTRICT เหมือนนัด (mig 0297) — เช็คก่อนเพื่อให้ข้อความบอกทางออก
    // ไม่ใช่ error ดิบจาก Postgres
    const zones = await loadZones(supabase, id);
    if (zones.length) {
      return conflict(`ไซต์นี้ยังมีโซนอยู่ ${zones.length} โซน — ปิดใช้งานแทนการลบ เพื่อไม่ให้ประวัติของโซนหาย`);
    }

    // 🐞 ของเดิมเช็คแค่เครื่อง แต่ FK ของ **นัด** เป็น RESTRICT → ไซต์ที่ไม่มีเครื่อง
    // แล้วแต่ยังมีประวัตินัด จะพังที่ Postgres แล้วผู้ใช้เห็นข้อความดิบภาษาอังกฤษ
    // ("violates foreign key constraint …") ซึ่งไม่บอกว่าต้องทำอะไรต่อ
    const visits = await loadVisits(supabase, { siteId: id });
    if (visits.length) {
      return conflict(`ไซต์นี้มีประวัตินัดอยู่ ${visits.length} ครั้ง — ปิดใช้งานแทนการลบ เพื่อไม่ให้ประวัติการเข้าไซต์หาย`);
    }

    const { error } = await supabase.from('service_sites').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_site', entityId: id, before,
      summary: `ลบไซต์บริการ ${before.code || id} · ${before.name}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});

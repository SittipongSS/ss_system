// ── API ตารางนัดเข้าบริการ (mig 0188) ────────────────────────────────────
// GET  ?from=&to=&siteId=&assigneeId= : นัดในช่วง + ไซต์ที่เกี่ยวข้อง (ปฏิทินใช้ทั้งคู่)
// POST : สร้างนัด (นอกรอบก็ได้ — งานซ่อมด่วนไม่ได้มาจากรอบไหน)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { normalizeVisitInput } from '@/lib/service/rounds';
import { initialVisitStatus } from '@/lib/service/visitGate';
import { gateContextForSite, loadVisitGateContext } from '@/lib/service/gateContext';
import { findSite, requireService } from '@/lib/service/sitesRepo';
import { findPlan, loadVisits, sitesForVisits } from '@/lib/service/visitsRepo';
import { siteWorkload } from '@/lib/service/visitLoad';
import { termIsActive } from '@/lib/service/terms';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);
  try {
    const visits = await loadVisits(supabase, {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      siteId: url.searchParams.get('siteId'),
      assigneeId: url.searchParams.get('assigneeId'),
    });
    // ปฏิทินต้องรู้ชื่อ/โซน/ช่วงเวลาเข้าไซต์เพื่อขึ้นป้ายเตือน — ส่งไปพร้อมกัน
    // ไม่งั้นหน้าจอต้องยิงตามรายนัด (สัปดาห์หนึ่ง 40 นัด = 40 คำขอ)
    const sites = await sitesForVisits(supabase, visits);
    const siteIds = [...sites.keys()];

    /* ⭐ ภาระของเจ้าหน้าที่นับเป็น **จุด + แพ็ค** ไม่ใช่จำนวนนัด (F-6) — ไซต์หนึ่งมี
       เครื่องตัวเดียว อีกไซต์มี 12 ตัว "วันนี้ 5 นัด" จึงบอกไม่ได้ว่าไหวไหม
       ⇒ ส่งจำนวนจุดที่ยังอยู่หน้างาน + แพ็คตามรอบขายของโซนมาพร้อมกัน
       ⚠️ นับที่ server ทีเดียว ไม่ให้จอไล่ยิงรายไซต์ (200 ไซต์ = 200 คำขอ)
       ⚠️ **ต้องเลือก `qty` มาด้วย** — ชุดอุปกรณ์ 1 แถวมีได้หลายจุด (สบู่ 242 จุด)
          ไม่ดึงมา = ประเมินงานต่ำเงียบ ๆ (พบตอน UAT 2026-08-28) */
    const [assets, zones] = siteIds.length ? await Promise.all([
      supabase.from('service_assets').select('id, siteId, status, qty').in('siteId', siteIds)
        .then(({ data, error }) => { if (error) throw error; return data || []; }),
      supabase.from('service_zones').select('id, siteId').in('siteId', siteIds)
        .then(({ data, error }) => { if (error) throw error; return data || []; }),
    ]) : [[], []];

    const zoneIds = zones.map((z) => z.id);
    const terms = zoneIds.length
      ? await supabase.from('service_zone_terms').select('id, zoneId, packageQty, salesOrderId')
        .in('zoneId', zoneIds)
        .then(({ data, error }) => { if (error) throw error; return data || []; })
      : [];

    /* ⚠️ "รอบไหนยังมีผล" ตัดสินที่ terms.js ที่เดียว — ที่นี่แค่หยิบใบสั่งขายแม่มาให้
       (ไม่มีใบ = ตัวตัดสินตอบ false ตามที่ออกแบบ ไม่ใช่เดาว่าใช่) */
    const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
    const orders = orderIds.length
      ? await supabase.from('sales_orders').select('id, status, supersededById')
        .in('id', orderIds).limit(1000)
        .then(({ data, error }) => { if (error) throw error; return data || []; })
      : [];
    const ordersById = new Map(orders.map((o) => [o.id, o]));
    const activeTermIds = terms
      .filter((term) => termIsActive(term, ordersById.get(term.salesOrderId)))
      .map((term) => term.id);

    const workload = {};
    for (const siteId of siteIds) {
      workload[siteId] = siteWorkload({
        siteId, assets, zones, terms, activeTermIds: new Set(activeTermIds),
      });
    }

    /* ⭐ บริบทของด่าน ①② (PR-C) — ส่งไปให้จอคำนวณด่านด้วย **ตัวประเมินตัวเดียวกับ
       server** แทนที่จะให้จอเดาเงื่อนไขเอง · จอจัดคิวต้องประเมินสดตอนคนเปลี่ยนวัน/
       ผู้รับผิดชอบในโมดัล จึงส่งข้อมูลไป ไม่ใช่ส่งผลสำเร็จรูปมาก้อนเดียว
       🪤 **ซ้อนกับการโหลด zones/terms/orders ข้างบนที่ใช้คำนวณภาระ** — ของข้างบน
          เลือกมาไม่ครบสำหรับด่าน (ไม่มีวันของ term · ไม่มี serviceContractId)
          ⇒ รอบนี้ยอมยิงซ้ำเพื่อให้ด่านถูกก่อน · ยุบเป็นก้อนเดียวได้ถ้าเจอว่าหน้านี้หนัก */
    const gateContext = await loadVisitGateContext(supabase, siteIds);

    return ok({ visits, sites: [...sites.values()], workload, gateContext });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeVisitInput(body);
  if (error) return badRequest(error);

  try {
    const site = await findSite(supabase, value.siteId);
    if (!site) return badRequest('ไม่พบไซต์ที่ระบุ');

    // ⚠️ รอบที่ผูกต้องเป็นรอบ**ของไซต์เดียวกัน** — ผูกข้ามไซต์ได้เมื่อไหร่
    // `nextAfterDone` จะสร้างนัดรอบถัดไปให้ไซต์ของ *รอบ* ไม่ใช่ไซต์ที่เพิ่งเข้า
    // = นัดโผล่ผิดที่โดยไม่มีใครสังเกต จนกว่าเจ้าหน้าที่จะขับไปถึงหน้างานผิดแห่ง
    if (value.planId) {
      const plan = await findPlan(supabase, value.planId);
      if (!plan) return badRequest('ไม่พบรอบบริการที่ระบุ');
      if (plan.siteId !== value.siteId) return badRequest('รอบบริการที่เลือกเป็นของไซต์อื่น');
    }

    /* ⭐ **ทุกใบเกิดผ่านด่าน** (มติผู้ใช้ 2026-08-28: TS ไม่ใช่ต้นทางของงาน)
       ผ่านตั้งแต่แรก = ขึ้นตารางเลย · ไม่ผ่าน = จอดเป็นร่างรอคนจัดการ
       ⚠️ ไม่ใช่ "สร้างเป็นร่างเสมอแล้วให้คนมากดปล่อยทีละใบ" — รอบบริการที่มีเจ้าหน้าที่ประจำ
       และวันอยู่ในช่วงเข้าได้ ต้องไหลผ่านเอง ไม่งั้นกติกานี้กลายเป็นแรงเสียดทานรายวัน
       ⚠️ ผู้เรียกกำหนดสถานะเองไม่ได้ — ด่านเป็นคนตัดสิน (client ส่ง status มาก็ถูกทับ) */
    const gateCtx = await loadVisitGateContext(supabase, [value.siteId]);
    const row = {
      id: genId('SVV'),
      ...value,
      /* ⭐ ด่าน ①② ตรวจจริงตั้งแต่ PR-C ⇒ ต้องป้อนบริบท ไม่งั้นทุกใบเกิดเป็นร่าง */
      status: initialVisitStatus(value, gateContextForSite(gateCtx, value.siteId, { site })),
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await insertRowWithEntityCode(supabase, 'SV', row);
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_visit', entityId: data.id, after: data,
      summary: `นัดเข้าบริการ ${data.code} · ${site.name} · ${data.scheduledDate}`,
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});

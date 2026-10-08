// ── API ตารางนัดเข้าบริการ (mig 0188) ────────────────────────────────────
// GET  ?from=&to=&siteId=&assigneeId= : นัดในช่วง + ไซต์ที่เกี่ยวข้อง (ปฏิทินใช้ทั้งคู่)
//        ระบุไซต์ = อ่านแบบทะเบียน (หน้า /database/sites/[id]) — ดูด่านใน GET
// POST : สร้างนัด (นอกรอบก็ได้ — งานซ่อมด่วนไม่ได้มาจากรอบไหน)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { isCadenceSlot } from '@/lib/service/cadence';
import { normalizeVisitInput } from '@/lib/service/rounds';
import { initialVisitStatus } from '@/lib/service/visitGate';
import { gateContextForSite, loadVisitGateContext } from '@/lib/service/gateContext';
import { findSite, requireService, requireSite } from '@/lib/service/sitesRepo';
import { canViewService } from '@/lib/permissions';
import { findPlan, loadVisits } from '@/lib/service/visitsRepo';
import { visitBundle } from '@/lib/service/visitBundle';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  try {
    /* ⭐ **นัดของไซต์เดียว = ประวัติการเข้าบนหน้าทะเบียนไซต์** (มติผู้ใช้ 2026-09-24: "ฐานข้อมูล
       ไซต์ เครื่อง เปิดให้ผู้ใช้ที่เข้าระบบฐานข้อมูลได้เห็นได้เลย") — ด่านเดิม (ฝ่าย TS) ทำให้คนนอก TS
       เปิดหน้าไซต์แล้วเจอ Forbidden ทั้งหน้า · หน้าโซนก็อ่านนัดของไซต์ผ่านเส้นทะเบียนอยู่แล้ว
       ⚠️ ปฏิทิน/คิวทั้งระบบ (ไม่ระบุไซต์) ยังเป็นงานของ TS */
    const access = siteId
      ? await requireSite({ user, supabase, id: siteId, registry: true })
      : requireService({ user });
    if (access.response) return access.response;
    const visits = await loadVisits(supabase, {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      siteId,
      assigneeId: url.searchParams.get('assigneeId'),
    });
    /* คนอ่านทะเบียนที่ไม่ใช่ฝ่ายบริการได้ **ตัวนัดอย่างเดียว** — ภาระงานกับบริบทด่าน (จ่ายถึง ·
       สัญญา) เป็นเครื่องมือจัดคิวของ TS ไม่ใช่ข้อมูลหลัก ⇒ ไม่คำนวณ ไม่ส่ง */
    if (!canViewService(user)) return ok({ visits, sites: access.site ? [access.site] : [] });
    /* ไซต์ · ภาระ (จุด + แพ็ค) · บริบทด่าน ①② — ประกอบที่ visitBundle ที่เดียว
       (รายการงาน `visits/queue` ใช้ตัวเดียวกัน ⇒ สองคอลัมน์ของหน้าจัดตารางนับภาระสูตรเดียว) */
    const { sites, workload, gateContext } = await visitBundle(supabase, visits);
    return ok({ visits, sites, workload, gateContext });
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
    /* ⭐ **ช่องของรอบ** (`planSlotDate` · mig 0397) — นัดที่คนกดยืนยันจากแถบ "ตั้งนัดรอบถัดไป" ของรอบตามปฏิทิน
       พกช่องมากับข้อเสนอ (`nextAfterDone`) ⇒ เก็บไว้ให้ตัวเติมนัดรู้ว่าช่องนั้นมีนัดแล้ว แม้วันนัดจะถูกย้ายทีหลัง
       ⚠️ รับเฉพาะวันที่เป็น **ช่องจริงของรอบนั้น** (`isCadenceSlot`) — ค่าอื่นทิ้ง ไม่ใส่คีย์เลย
          (ช่องปลอมจะกันตัวเติมนัดไม่ได้ และจะถูกนับเป็น "นัดตามรอบเดิม" ตอนเปลี่ยนรอบ) */
    let planSlotDate = null;
    if (value.planId) {
      const plan = await findPlan(supabase, value.planId);
      if (!plan) return badRequest('ไม่พบรอบบริการที่ระบุ');
      if (plan.siteId !== value.siteId) return badRequest('รอบบริการที่เลือกเป็นของไซต์อื่น');
      if (isCadenceSlot(plan, body.planSlotDate)) planSlotDate = String(body.planSlotDate).slice(0, 10);
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
      /* 🔒 นัดเกิดใหม่ไม่มีรูปหน้างาน/ลายเซ็น — ค่าที่ผู้เรียกส่งมาถูกทิ้งเสมอ (ไม่มีจอไหนส่ง) · สองช่องนี้เขียนได้จาก
         PATCH ของนัดกับ `visits/[id]/photos` ซึ่งมีด่านใบรับการอัปโหลด (docs/upload-receipts.md) ⇒ เส้นสร้างต้องไม่เป็น
         ทางอ้อมที่เก็บลิงก์ไฟล์ของคนอื่นโดยไม่ผ่านด่าน */
      attachments: [],
      customerSignatureUrl: null,
      ...(planSlotDate ? { planSlotDate } : {}),
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

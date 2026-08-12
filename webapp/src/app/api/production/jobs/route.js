// ── API คิวงานผลิต (mig 0189 · P-2) ───────────────────────────────────────
// GET  ?status=&salesOrderId=&projectId=&from=&to=&autoDraft=1
//   autoDraft=1 = กวาด SO ที่อนุมัติแล้วมาสร้างงานร่างก่อนคืนคิว (กดซ้ำได้)
// POST : สร้างงานเอง (PC แตก/รวมล็อตเองได้ตามมติ §10.1)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { deliveriesForSalesOrder, productionReadiness } from '@/lib/pm/deliveries';
import { normalizeJobInput, sortQueue } from '@/lib/pm/productionPlan';
import { autoDraftJobs } from '@/lib/pm/productionAutoDraft';
import { deliveriesForJobs, loadJobs } from '@/lib/pm/productionJobsRepo';
import { loadLines, requireProduction } from '@/lib/pm/productionLinesRepo';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireProduction({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);

  try {
    // ⭐ กวาด SO อนุมัติแล้วมาเป็นงานร่างก่อน — คิวที่ต้องกดปุ่มก่อนถึงจะครบ คือคิว
    // ที่คนจะเชื่อว่าว่างทั้งที่มีงานรออยู่ · กันซ้ำสองชั้นแล้ว (ดู autoDraftJobs)
    // ⚠️ ทำเฉพาะคนที่แก้ได้ — คนอ่านอย่างเดียวไม่ควรเขียนข้อมูลจากการเปิดหน้า
    let generated = [];
    if (url.searchParams.get('autoDraft') === '1' && !requireProduction({ user, edit: true }).response) {
      generated = await autoDraftJobs({ supabase, user, req });
    }

    const statusParam = url.searchParams.get('status');
    const jobs = await loadJobs(supabase, {
      status: statusParam ? statusParam.split(',').filter(Boolean) : null,
      salesOrderId: url.searchParams.get('salesOrderId'),
      projectId: url.searchParams.get('projectId'),
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    });

    // ของเข้าของ SO ที่คิวอ้างถึง → ตอบ "ของครบหรือยัง" ในคำขอเดียว
    const deliveries = await deliveriesForJobs(supabase, jobs);
    const todayIso = businessDate();
    const withReadiness = jobs.map((job) => ({
      ...job,
      readiness: job.salesOrderId
        ? productionReadiness(deliveriesForSalesOrder(deliveries.get(job.salesOrderId) || [], job.salesOrderId), todayIso)
        : null,
    }));

    return ok({
      jobs: sortQueue(withReadiness),
      lines: await loadLines(supabase),
      generated: generated.length,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeJobInput(body);
  if (error) return badRequest(error);

  try {
    // รหัส PB ออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
    const row = {
      id: genId('PBJ'),
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await insertRowWithEntityCode(supabase, 'PB', row);
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'production_job', entityId: data.id, after: data,
      summary: `สร้างงานผลิต ${data.code} · ${data.productName || data.fgCode || ''} ${data.qty}`.trim(),
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});

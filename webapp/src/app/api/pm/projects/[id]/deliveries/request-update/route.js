// ── ขอให้ PC อัปเดตกำหนดของเข้าทั้งชุด (มติ 13 · kind `material_eta`) ────
//
// ⭐ ที่มา (คำขอตั้งต้นของผู้ใช้): SA ต้อง "ขอเช็คสถานะติดตามการเข้าของ PM/RM"
// ซึ่งเดิมคือไล่ถาม PC เป็นรายตัวนอกระบบ · ปุ่มเดียวเปิดคำร้องให้ทั้งชุดแทน
//
// ทำเป็น endpoint เดียวแทนที่จะให้หน้าจอยิงสามครั้ง (เปิดคำร้อง → ส่ง → ประทับแถว)
// เพราะถ้าพลาดกลางทางจะได้คำร้องร่างค้างที่ไม่มีใครเห็น หรือแถวที่ประทับ id ของ
// คำร้องที่ยังไม่ถูกส่ง — กติกาทั้งชุดอยู่ที่เดียว
import { randomUUID } from 'crypto';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { loadDeliveries, requireProject } from '@/lib/pm/deliveriesRepo';
import { openDeliveriesToChase, chaseRequestBody } from '@/lib/pm/deliveries';
import { insertRequestWithDocNo } from '@/lib/deptRequests';
import { requestStepKey } from '@/lib/master/requestTypes';

export const dynamic = 'force-dynamic';

const KIND = 'material_eta';
const DEPT = 'PC'; // ฝ่ายจัดซื้อเป็นเจ้าของกำหนดของเข้าเสมอ (REQUEST_KINDS.material_eta)

// POST { dealId? } — ไม่ส่ง dealId = ขอทั้งโครงการ (ทุกรอบ)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  // ผู้ "ขอ" คือฝ่ายขาย — ใช้ด่านเดียวกับการแก้ของเข้า (ครอบ PC ด้วย เผื่อ PC
  // อยากเปิดคำร้องไว้เป็นหลักฐานว่ากำลังตามอยู่)
  const access = await requireProject({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const project = access.project;
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const body = await req.json().catch(() => ({}));
  const dealId = body.dealId || null;

  try {
    const all = await loadDeliveries(supabase, project.id);
    // ⚠️ ขอเฉพาะแถวที่ "ยังไม่มา และยังไม่ได้ขอค้างอยู่" — กันสแปมคิว PC ด้วยเรื่อง
    // เดิมซ้ำ ๆ ซึ่งเป็นวิธีที่คิวของฝ่ายกลายเป็นของที่ไม่มีใครอ่าน
    const rows = openDeliveriesToChase(all, { dealId });
    if (!rows.length) {
      const anyOpen = all.some((r) => !r.arrivedAt);
      return badRequest(anyOpen
        ? 'ของที่ยังไม่มาถูกขอให้อัปเดตไปแล้ว — รอ PC ตอบก่อน'
        : 'ของมาครบแล้ว ไม่มีอะไรต้องติดตาม');
    }

    const requestId = `DR-${randomUUID()}`;
    const nowIso = new Date().toISOString();
    // เปิดแล้วส่งเลยในจังหวะเดียว — คำร้องร่างที่ไม่มีใครกดส่งคือคิวที่หายไปเงียบ ๆ
    // ⚠️ ไม่ใส่ docNo ตรงนี้ — เลขออกพร้อม insert ในทรานแซกชันเดียว (mig 0243)
    // ไม่งั้น insert ที่ล้มจะกินเลขที่คำร้องทิ้งทุกครั้ง
    const { data: request, error } = await insertRequestWithDocNo(supabase, {
      id: requestId,
      kind: KIND,
      dept: DEPT,
      status: 'pending',
      title: `ขออัปเดตกำหนดของเข้า ${project.code || project.name || ''}`.trim(),
      body: chaseRequestBody(rows),
      projectId: project.id,
      dealId,
      stepKey: requestStepKey(KIND),
      customerId: project.customerId || null,
      customerName: project.customerName || null,
      requestedById: user?.id ?? null,
      requestedByName: user?.name ?? null,
      team: user?.team ?? null,
      submittedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (error) return fail(error.message, 500);
    const docNo = request?.docNo || '';

    // ประทับแถวที่ขอ — พาเนลจะได้โชว์ว่า "ขอไปแล้ว" และรอบหน้าจะไม่ขอซ้ำ
    // (เขียนพลาดไม่ rollback คำร้อง: คำร้องถูกส่งไปแล้วจริง แค่แถวไม่ติดธง
    //  ซึ่งแย่น้อยกว่าการลบคำร้องที่ PC เห็นในคิวไปแล้วทิ้ง)
    const { error: stampError } = await supabase.from('material_deliveries')
      .update({ requestId, updatedAt: nowIso })
      .in('id', rows.map((r) => r.id));

    await recordAudit({
      user, action: 'create', entityType: 'dept_request', entityId: requestId, after: request,
      summary: `ขอให้ฝ่าย ${DEPT} อัปเดตกำหนดของเข้า ${rows.length} รายการ (${docNo})`
        + (stampError ? ' ⚠ ติดธงบนรายการไม่สำเร็จ' : ''),
      request: req,
    });

    // คิวฝ่ายจัดซื้อ — เหมือนคำร้องชนิดอื่นที่ส่งเข้าคิว (ไม่เช็ค error: แจ้งเตือน
    // พลาดต้องไม่ทำให้คำร้องที่บันทึกแล้วตอบ 500)

    return ok({
      requestId,
      docNo,
      asked: rows.length,
      warning: stampError ? stampError.message : null,
    }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});

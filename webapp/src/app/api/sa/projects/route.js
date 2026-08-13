import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, unauthorized, forbidden, badRequest, conflict } from '@/lib/http';
import { can } from '@/lib/permissions';
import { todayStr } from '@/lib/pm/schedule';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { normalizeProjectType } from '@/lib/salesPlanning';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { normalizeBusinessLine } from '@/lib/master/businessLines';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:edit')) return forbidden();

  const body = await req.json().catch(() => ({}));
  if (!body.name) return badRequest('ต้องระบุชื่อโครงการ');
  // สายธุรกิจบังคับ **เฉพาะตอนสร้าง** (mig 0191 + มติ 2026-08-02)
  // ⚠️ ไม่บังคับที่ PATCH โดยเจตนา — โครงการถูก patch จากหลายทางที่ไม่เกี่ยวกับสาย
  // (เปลี่ยนสถานะ · ปิด/เปิดโครงการ · แก้วันที่) ถ้าบังคับที่นั่นด้วย ทางเหล่านั้น
  // จะพังทันทีกับโครงการเก่า 13 ใบที่ line ยังว่าง · ตัวบังคับสำหรับของเก่าอยู่ที่
  // ฟอร์ม ซึ่งเป็นจุดที่คนกำลังมองโครงการนั้นอยู่จริง
  if (!normalizeBusinessLine(body.line)) return badRequest('ต้องเลือกสายธุรกิจ (PRODUCT หรือ SERVICE)');
  const categoryError = await activeProductTypeError(body.productMainCategory || null);
  if (categoryError) return badRequest(categoryError);

  const startDate = body.startDate || todayStr();
  const dueDate = body.dueDate || null;

  let customerEmail = body.customerEmail || '';
  const custId = body.customerId || null;
  if (!customerEmail && custId) {
    const { data: cust } = await supabase.from('customers').select('email').eq('id', custId).maybeSingle();
    customerEmail = cust?.email || '';
  }
  
  // รหัสโครงการอัตโนมัติออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — ห้ามจองไว้ก่อน
  // ตรงนี้: ลูป retry ข้างล่างเคยออกรหัสใหม่ทุกรอบที่ชน ⇒ กินเลขทิ้งรอบละใบ
  const autoCode = !body.code;
  const projectCode = body.code || null;
  
  const baseRow = {
    name: body.name,
    customerId: body.customerId || null,
    customerName: body.customerName || null,
    // ⚠️ normalizeProjectType ไม่ใช่ normalizeDealType — ประเภทดีลมี 'OTHER' (mig 0247)
    //    ที่ projects_type_check ไม่รับ · ตัวนี้ตกค่านอกลิสต์เป็น NPD ให้เอง
    type: normalizeProjectType(body.type || 'NPD'),
    // สายธุรกิจ (mig 0191) — มาจากฟอร์มเท่านั้น **ไม่มี fallback โดยเจตนา**
    // ⚠️ บรรทัดเหนือขึ้นไปคือตัวอย่างของสิ่งที่ห้ามทำซ้ำ: `body.type || 'NPD'`
    //    คือเหตุผลที่โครงการทั้ง 11 ใบบน prod เป็น NPD หมด · ไม่เลือก = NULL
    //    แล้วไปโผล่ตัวนับ "ยังไม่ระบุสาย" ให้คนมาเลือก ไม่ใช่เดาแทน
    line: normalizeBusinessLine(body.line) ?? null,
    formulaName: body.formulaName || null,
    urgency: body.urgency || 'Schedule',
    aeOwner: body.aeOwner || user.name || '',
    // ตัวตนจริงของผู้ดูแล (mig 0190) — ชื่อข้างบนเป็น snapshot สำหรับพิมพ์เอกสาร
    // ไม่ได้เลือกชื่อเอง = ผู้สร้างเป็นผู้ดูแลเอง จึงใส่ id ของตัวเองให้ตรงกัน
    aeOwnerId: body.aeOwnerId || (body.aeOwner ? null : user.id) || null,
    acOwner: body.acOwner || '',
    acOwnerId: body.acOwnerId || null,
    status: 'New',
    startDate,
    dueDate,
    productMainCategory: body.productMainCategory || '',
    productSubCategory: body.productSubCategory || '',
    docNumber: '',
    productName: body.name || '',
    productCode: '',
    orderQty: '',
    productionQty: '',
    aeSupervisor: body.aeSupervisor || '',
    keyAccountExec: '',
    customerEmail,
    preparedBy: body.preparedBy || user.name || '',
    reviewedBy: '',
    team: user.team || null,
    ownerId: user.id || null,
    metadata: {
      ...(body.metadata || {}),
      brand: body.brand || '',
      source: 'sales-projects',
    },
  };

  let project = null;
  let error = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const projectId = genId('PRJ');
    ({ data: project, error } = autoCode
      ? await insertRowWithEntityCode(supabase, 'PJ', { ...baseRow, id: projectId })
      : await supabase
        .from('projects')
        .insert({ ...baseRow, id: projectId, code: projectCode })
        .select()
        .single());
    if (!error) break;
    if (error.code === '23505') {
      if (!autoCode) return conflict(`รหัสโครงการซ้ำ: ${projectCode}`);
      continue; // เลขของรอบที่ล้มถูกคืนแล้ว รอบใหม่ฟังก์ชันออกรหัสให้เอง
    }
    break;
  }
  if (error) return fail(error.message, 500);

  let productWarning = null;
  if (Array.isArray(body.projectProducts) && body.projectProducts.length > 0) {
    const ppRows = body.projectProducts
      .filter((p) => p.productId)
      .map((p) => ({ id: genId('PP'), projectId: project.id, productId: p.productId, orderQty: p.orderQty || null, productionQty: p.productionQty || null }));
    if (ppRows.length) {
      const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
      if (ppErr) productWarning = 'เชื่อมสินค้า (FG) เข้าโครงการไม่สำเร็จ — โปรดผูกใหม่ที่หน้าโครงการ';
    }
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    after: project,
    summary: `สร้างโครงการ ${project.code} จากหน้ารวมโครงการขาย`,
    request: req,
  });

  return ok({ project: { ...project, tasks: [] }, productWarning }, 201);
});

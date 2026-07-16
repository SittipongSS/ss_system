// ── Admin force-delete (break-glass) ──────────────────────────────────
// กฎกลางของระบบคือ "ข้อมูลที่เข้าสู่ workflow แล้วห้าม hard delete" (ดู
// lib/deletion.js) — กันไม่ให้เกิด record กำพร้าเพราะ live DB ไม่มี FK จริงทุก
// ความสัมพันธ์ (เมโม no-real-fk-constraints). helper ชุดนี้เปิด "ทางลัดผู้ดูแล
// ระบบ" ให้ลบทั้งสายได้จริง โดย:
//   1. จำกัดเฉพาะ role === 'admin' เท่านั้น (เข้มกว่า isSuperuser — ae_supervisor
//      เป็น superuser แต่ลบบังคับไม่ได้). force คือ break-glass ที่ทำลายหลักฐาน
//      ทางบัญชี (ใบเสนอราคา accepted / Sale Order = แหล่งยอด Actual) จึงต้องแคบ.
//   2. ต้อง cascade ลูกที่ "ไม่มี FK จริง" ด้วยมือ ไม่งั้นเหลือแถวกำพร้า — จุดนี้
//      คือเหตุผลที่ปลด guard เฉย ๆ ไม่พอ ต้องเก็บกวาดให้ครบ.
//   3. บันทึก audit ทุกครั้ง (ผู้เรียกเป็นคนเรียก recordAudit ด้วย manifest นี้).
//
// ทุก preview เป็น pure-ish (query อย่างเดียว ไม่ลบ) เพื่อให้ ?dryRun=1 ใช้ซ้ำ
// เส้นทางเดียวกับตอนลบจริง — สิ่งที่โชว์ในพรีวิว = สิ่งที่จะโดนลบเป๊ะ.

// อ่าน query flag จาก request URL.
function flag(req, name) {
  try {
    const v = new URL(req.url).searchParams.get(name);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function isForceRequest(req) {
  return flag(req, 'force');
}

export function isDryRun(req) {
  return flag(req, 'dryRun');
}

// force / dryRun เป็นสิทธิ์ผู้ดูแลระบบเท่านั้น (ไม่ใช่แค่ superuser).
export function canForceDelete(user) {
  return user?.role === 'admin';
}

// สร้างรายการเดียวสำหรับ manifest — ข้ามรายการที่ count = 0 ให้ผู้เรียกกรองเอง.
function line(label, count) {
  return { label, count: count || 0 };
}

// นับแบบ head-only (ไม่ดึงข้อมูลจริง) — คืน 0 เมื่อ error เพื่อไม่ให้พรีวิวพัง
// (พรีวิวไม่ควรบล็อกการลบ; ถ้านับพลาดก็แค่แสดงไม่ครบ ตัวลบจริงยังเก็บกวาดครบ).
async function countBy(supabase, table, column, value, extra) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
    if (extra) q = extra(q);
    const { count } = await q;
    return count || 0;
  } catch {
    return 0;
  }
}

// ── DEAL ──────────────────────────────────────────────────────────────
// manifest ของสิ่งที่จะโดนลบ/ปลดเมื่อ force ลบดีลหนึ่งใบ. project = โครงการ PM
// ที่ผูก (ถ้ามีและเป็นดีลสุดท้ายของโครงการ), lastOfProject = true เมื่อจะลบโครงการ
// พ่วง (ไม่มีดีลพี่น้องเหลือ).
export async function dealForcePreview(supabase, deal, { project = null, lastOfProject = false } = {}) {
  const id = deal.id;
  const [accepted, salesOrders, quotations, inquiries, personalTasks] = await Promise.all([
    countBy(supabase, 'quotations', 'dealId', id, (q) => q.eq('status', 'accepted')),
    countBy(supabase, 'sales_orders', 'dealId', id),
    countBy(supabase, 'quotations', 'dealId', id),
    countBy(supabase, 'inquiries', 'dealId', id),
    countBy(supabase, 'personal_tasks', 'dealId', id),
  ]);

  let projectTasks = 0;
  let excise = 0;
  let projectInquiries = 0;
  if (project && lastOfProject) {
    [projectTasks, excise, projectInquiries] = await Promise.all([
      countBy(supabase, 'project_tasks', 'projectId', project.id),
      countBy(supabase, 'excise_registrations', 'projectId', project.id),
      countBy(supabase, 'inquiries', 'projectId', project.id),
    ]);
  }

  const cascade = [
    line('ใบเสนอราคาที่รับแล้ว (Won) — แหล่งยอด Actual', accepted),
    line('ใบสั่งขาย (Sale Order) — แหล่งยอด Actual', salesOrders),
    line('ใบเสนอราคาทั้งหมด', quotations),
    line('ทะเบียนสรรพสามิต', excise),
    project && lastOfProject ? line(`โครงการผลิต ${project.code || project.id}`, 1) : line('โครงการผลิต', 0),
    line('ขั้นตอนงานผลิต (task)', projectTasks),
    line('เรื่องสอบถาม (inquiry)', inquiries + projectInquiries),
    line('งานส่วนตัวที่ผูกดีล', personalTasks),
  ].filter((r) => r.count > 0);

  const notes = [];
  if (deal.metadata?.sahamitPoId) notes.push('ดีลนี้มาจาก PO สหมิตร (settle เข้ายอดแล้ว)');
  if (['won', 'in_project'].includes(deal.stage)) notes.push('ดีลนี้ปิดการขาย (Won) แล้ว');

  return { cascade, notes };
}

// เก็บกวาดลูกดีลที่ "ไม่มี FK จริง" ก่อน/หลังลบแถวดีล. เรียกก่อนลบ sales_deals
// (ลบลูกก่อน แล้วค่อยลบแม่). ครอบคลุม:
//   • personal_tasks.dealId (mig 0085 — ไม่มี FK)
//   • inquiries.dealId + inquiry_messages ของมัน + personal_tasks.inquiryId (mig 0104 — ไม่มี FK)
//   • sales_deals.parentDealId ที่ชี้มาดีลนี้ (self-ref mig 0072 — ไม่มี FK): ปลดเป็น null
// ไม่แตะลูกที่ FK cascade เองอยู่แล้ว (quotations/sales_orders/activities/...).
export async function cleanupDealOrphans(supabase, dealId) {
  // inquiries ผูกดีล — ลบ message + งานที่ผูก inquiry ก่อน แล้วลบตัว inquiry
  const { data: inqs } = await supabase.from('inquiries').select('id').eq('dealId', dealId);
  const inquiryIds = (inqs || []).map((r) => r.id);
  if (inquiryIds.length) {
    await supabase.from('inquiry_messages').delete().in('inquiryId', inquiryIds);
    await supabase.from('personal_tasks').delete().in('inquiryId', inquiryIds);
    await supabase.from('inquiries').delete().in('id', inquiryIds);
  }
  // งานส่วนตัวที่ผูกดีลโดยตรง
  await supabase.from('personal_tasks').delete().eq('dealId', dealId);
  // ดีลอื่นที่อ้างดีลนี้เป็น parent — ปลด logical ref กันกำพร้า
  await supabase.from('sales_deals').update({ parentDealId: null }).eq('parentDealId', dealId);
}

// ── PROJECT ───────────────────────────────────────────────────────────
// ลูกโครงการที่ไม่มี FK จริง เพิ่มเติมจาก deleteProjectDeep (ซึ่งเก็บ
// personal_tasks + project_doc_revisions + inquiries ให้แล้ว): ทะเบียนสรรพสามิต
// (mig 0066 — ไม่มี FK) ปกติถูก "บล็อก" การลบ; เมื่อ force ผู้ดูแลเลือกลบพ่วง.
export async function forceDeleteProjectExcise(supabase, projectId) {
  await supabase.from('excise_registrations').delete().eq('projectId', projectId);
}

// ── QUOTATION ─────────────────────────────────────────────────────────
// preview การลบใบเสนอราคาหนึ่งใบ. quotation_lines cascade เอง (FK); sales_orders
// .quotationId เป็น ON DELETE CASCADE → Sale Order (แหล่งยอด Actual) หายตามทันที
// ที่ระดับ DB — โชว์ให้ผู้ดูแลเห็นชัดก่อน.
export async function quotationForcePreview(supabase, quote) {
  const salesOrders = await countBy(supabase, 'sales_orders', 'quotationId', quote.id);
  const cascade = [
    line('ใบสั่งขาย (Sale Order) ที่อ้างใบนี้ — แหล่งยอด Actual', salesOrders),
  ].filter((r) => r.count > 0);
  const notes = [];
  if (quote.status === 'accepted') notes.push('ใบนี้ถูกรับแล้ว (accepted) = แหล่งยอด Actual ของดีล');
  return { cascade, notes };
}

// เก็บกวาด logical ref ของใบเสนอราคาที่ไม่มี FK: metadata.acceptedQuotationId ของ
// ดีลที่ชี้มาใบนี้ (mig 0098 jsonb). ปลดออกกันชี้ค้าง.
export async function cleanupQuotationOrphans(supabase, quote) {
  if (!quote?.dealId) return;
  try {
    const { data: deal } = await supabase
      .from('sales_deals').select('id, metadata').eq('id', quote.dealId).maybeSingle();
    if (deal?.metadata?.acceptedQuotationId === quote.id) {
      const nextMeta = { ...deal.metadata };
      delete nextMeta.acceptedQuotationId;
      await supabase.from('sales_deals').update({ metadata: nextMeta }).eq('id', deal.id);
    }
  } catch {
    // best-effort — ไม่ให้ทำลาย flow การลบหลัก
  }
}

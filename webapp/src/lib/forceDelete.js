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
import { purgeUpdatesMany } from '@/lib/master/updates';
import { registryRefTargets } from '@/lib/master/registryRefs';
import { purgeAttachments } from '@/lib/master/attachments';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { isWonStage } from '@/lib/salesPlanning';

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
// manifest ของสิ่งที่จะโดนลบ/ปลดเมื่อ force ลบดีลหนึ่งใบ. นับเฉพาะลูก "ของดีลนี้"
// (ใบเสนอราคา/SO/สอบถาม/งานส่วนตัว/timeline segment). โครงการ PM ที่ผูก (param project)
// ไม่ถูกลบ — แค่แจ้งเป็น note ว่ายังอยู่ (เฟส B: ลบดีลไม่ลบโครงการ).
export async function dealForcePreview(supabase, deal, { project = null } = {}) {
  const id = deal.id;
  // นับเฉพาะลูก "ของดีลนี้" — โครงการ/ทะเบียนสรรพสามิต/งานผลิตส่วนที่เหลือไม่ถูกลบ
  // เพราะลบดีลไม่ลบโครงการ (เฟส B). project_tasks นับด้วย dealId = segment ของดีลนี้.
  const [accepted, salesOrders, quotations, inquiries, personalTasks, dealTasks] = await Promise.all([
    countBy(supabase, 'quotations', 'dealId', id, (q) => q.eq('status', 'accepted')),
    countBy(supabase, 'sales_orders', 'dealId', id),
    countBy(supabase, 'quotations', 'dealId', id),
    countBy(supabase, 'dept_requests', 'dealId', id),
    countBy(supabase, 'personal_tasks', 'dealId', id),
    countBy(supabase, 'project_tasks', 'dealId', id),
  ]);

  // ใบยื่นภาษีเป็นด่านที่ break-glass ก็ข้ามไม่ได้ (FK RESTRICT + RPC ไม่ล้างให้) —
  // ต้องบอกตั้งแต่พรีวิว ไม่ใช่ปล่อยให้ไปพังตอนลบจริง (แพตเทิร์นเดียวกับ QT/SO)
  const filings = await exciseFilingsOfDeal(supabase, id);
  if (filings.length) {
    return { cascade: [], notes: [exciseFilingBlockMessage(filings, 'ดีล')], blocked: true };
  }

  // ตรวจไม่ได้ = บล็อกไว้ก่อน (ไม่ใช่ "ไม่มีสัญญา") — พรีวิวเป็นสิ่งที่ผู้ใช้อ่านก่อนกดทำลาย
  let contracts;
  try {
    contracts = await contractsOfDeal(supabase, id);
  } catch (contractError) {
    return { cascade: [], notes: [contractError.message], blocked: true };
  }
  if (contracts.length) {
    return { cascade: [], notes: [contractBlockMessage(contracts, 'ดีล')], blocked: true };
  }

  // เอกสารที่ลงนาม/ออกฉบับจริงแล้วในดีล — บังคับลบจะทำลายหลักฐานถาวร ต้องขึ้นพรีวิว
  // (พรีวิวอ่านไม่ได้ ≠ ไม่มี — แต่ต้องไม่ทำให้พรีวิวพัง จึงเตือนว่าตรวจไม่ได้แทน)
  let signedNote = null;
  try {
    const signed = await dealSignedDocuments(supabase, id);
    const signedCount = signed.quotations.length + signed.salesOrders.length;
    if (signedCount > 0) {
      signedNote = `⚠️ มีเอกสารที่ลงนาม/ออกฉบับจริงแล้ว ${signedCount} ใบ`
        + ` (${[...signed.quotations.map((r) => r.quoteNumber || r.id), ...signed.salesOrders.map((r) => r.orderNumber || r.id)].join(', ')})`
        + ' — บังคับลบจะทำลายหลักฐานลายเซ็นและฉบับตรึงถาวร กู้คืนไม่ได้';
    }
  } catch (signedError) {
    signedNote = `ตรวจเอกสารที่มีหลักฐานลายเซ็นไม่สำเร็จ (${signedError.message}) — การลบจริงอาจถูกฐานข้อมูลปฏิเสธ`;
  }

  const cascade = [
    line('ใบเสนอราคาที่รับแล้ว (Won) — แหล่งยอด Actual', accepted),
    line('ใบสั่งขาย — แหล่งยอด Actual', salesOrders),
    line('ใบเสนอราคาทั้งหมด', quotations),
    line('ขั้นตอนงานผลิต (task) ของดีลนี้', dealTasks),
    line('คำร้องข้ามฝ่ายที่ผูกดีล', inquiries),
    line('งานส่วนตัวที่ผูกดีล', personalTasks),
  ].filter((r) => r.count > 0);

  const notes = [];
  if (signedNote) notes.push(signedNote);
  // โครงการไม่ลบตามดีล (เฟส B) — บอกให้ผู้ดูแลเห็นชัดว่าโครงการและงานส่วนที่เหลือยังอยู่
  if (project) {
    notes.push(`โครงการผลิต ${project.code || project.id} จะยังอยู่ (ถอดเฉพาะงานของดีลนี้ออก) — ลบโครงการทำที่หน้าโครงการ`);
  }
  if (deal.metadata?.sahamitPoId) notes.push('ดีลนี้มาจาก PO สหมิตร (settle เข้ายอดแล้ว)');
  if (isWonStage(deal.stage)) notes.push('ดีลนี้ปิดการขาย (Won) แล้ว');

  return { cascade, notes, blocked: false };
}

// เก็บกวาดลูกดีลที่ "ไม่มี FK จริง" ก่อน/หลังลบแถวดีล. เรียกก่อนลบ sales_deals
// (ลบลูกก่อน แล้วค่อยลบแม่). ครอบคลุม:
//   • personal_tasks.dealId (mig 0085 — ไม่มี FK)
//   • dept_requests.dealId + เธรดของมัน + personal_tasks.inquiryId (ไม่มี FK ทั้งคู่)
//   • sales_deals.parentDealId ที่ชี้มาดีลนี้ (self-ref mig 0072 — ไม่มี FK): ปลดเป็น null
// ไม่แตะลูกที่ FK cascade เองอยู่แล้ว (quotations/sales_orders/activities/...).
// เธรดอัปเดตของงาน (entity_updates, mig 0163) ไม่มี FK — ต้องกวาดก่อนลบตัวงาน
// ไม่งั้นเหลือเธรดกำพร้าที่ไม่มีทางเข้าถึงและไม่มีใครลบให้
async function purgeTaskThreads(supabase, { column, values }) {
  if (!values?.length) return;
  const { data: tasks, error } = await supabase
    .from('personal_tasks').select('id').in(column, values);
  // query พังแล้วเงียบ = ได้ [] แล้วสรุปว่า "ไม่มีเธรดให้กวาด" ทั้งที่ยังไม่ได้อ่านเลย
  if (error) throw new Error(`อ่านงานที่ผูก ${column} ไม่สำเร็จ: ${error.message}`);
  await purgeUpdatesMany(supabase, 'personal_task', (tasks || []).map((t) => t.id));
}

// ⚠️ โยน error ออกมาเสมอเมื่อกวาดไม่สำเร็จ — ผู้เรียกต้องหยุดก่อนลบแถวดีล ไม่งั้น
// ดีลหายแต่ลูกยังอยู่ กลายเป็นแถวกำพร้าที่ไม่มีทางเข้าถึงและไม่มีใครตามลบให้
/* ── ลบงานส่วนบุคคลเป็นชุด: กวาดไฟล์แนบก่อนเสมอ ───────────────────────────
 * 🐞 เส้นลบงานทีละใบ (`/api/pm/personal-tasks/[id]`) เรียก `purgeAttachments` อยู่แล้ว
 * แต่เส้นที่ลบเป็นชุด (ล้างของพ่วงดีล/คำร้อง/โครงการ) ยิง `.delete()` ตรง ๆ ⇒ ไฟล์แนบ
 * ของงานเหล่านั้นค้างทั้งแถวและไฟล์บน Drive · งานส่วนบุคคลเป็นชนิดที่คนแนบไฟล์บ่อย
 * ที่สุดในระบบ (29 แถวบน prod) ⇒ เส้นชุดคือทางที่จะสร้างของกำพร้ามากที่สุด */
async function purgeTaskAttachments(supabase, column, value) {
  // ⚠️ ไล่ทีละหน้า — ถ้าโดนเพดาน 1,000 ตัด ไฟล์แนบของงานที่เกินมาจะค้างเป็นของกำพร้า
  // ทั้งแถวและไฟล์บน Drive ซึ่งคือบั๊กที่ฟังก์ชันนี้เพิ่งถูกเขียนขึ้นมาเพื่อปิดพอดี
  const { data, error } = await fetchAllResult(() => supabase
    .from('personal_tasks').select('id').eq(column, value).order('id', { ascending: true }));
  if (error) throw new Error(`อ่านงานที่จะลบไม่สำเร็จ: ${error.message}`);
  for (const task of data || []) await purgeAttachments('personal_task', task.id, supabase);
  return (data || []).length;
}

export async function cleanupDealOrphans(supabase, dealId) {
  // คำร้องผูกดีล — ลบเธรด + งานที่ผูกคำร้องก่อน แล้วลบตัวคำร้อง
  const { data: inqs, error: inqError } = await supabase
    .from('dept_requests').select('id').eq('dealId', dealId);
  if (inqError) throw new Error(`อ่านคำร้องข้ามฝ่ายที่ผูกดีลไม่สำเร็จ: ${inqError.message}`);
  const inquiryIds = (inqs || []).map((r) => r.id);
  if (inquiryIds.length) {
    // เธรดของคำร้องอยู่ในตารางกลาง (polymorphic ไม่มี FK) — ต้องกวาดเอง
    // บรรทัด/ชั้นจำนวนของคำร้องมี FK CASCADE อยู่แล้ว ปล่อยให้ DB จัดการ
    await purgeUpdatesMany(supabase, 'dept_request', inquiryIds);
    await purgeTaskThreads(supabase, { column: 'inquiryId', values: inquiryIds });
    for (const inquiryId of inquiryIds) await purgeTaskAttachments(supabase, 'inquiryId', inquiryId);
    const { error: reqTaskError } = await supabase
      .from('personal_tasks').delete().in('inquiryId', inquiryIds);
    if (reqTaskError) throw new Error(`ลบงานที่ผูกคำร้องไม่สำเร็จ: ${reqTaskError.message}`);
    // ⚠️ ลบตรง ๆ ไม่ได้ — guard_dept_request (0173) บล็อกคำร้องที่ส่งแล้วทุกใบ
    // ต้องผ่าน RPC ที่ตั้ง flag app.force_delete ให้ทีละใบ (แพตเทิร์นเดียวกับใบ CR)
    for (const requestId of inquiryIds) {
      const { error: rpcError } = await supabase.rpc('force_delete_dept_request', { p_id: requestId });
      if (rpcError) throw new Error(`ลบคำร้อง ${requestId} ไม่สำเร็จ: ${rpcError.message}`);
    }
  }
  // งานส่วนตัวที่ผูกดีลโดยตรง
  await purgeTaskThreads(supabase, { column: 'dealId', values: [dealId] });
  await purgeTaskAttachments(supabase, 'dealId', dealId);
  const { error: taskError } = await supabase.from('personal_tasks').delete().eq('dealId', dealId);
  if (taskError) throw new Error(`ลบงานที่ผูกดีลไม่สำเร็จ: ${taskError.message}`);
  // ดีลอื่นที่อ้างดีลนี้เป็น parent — ปลด logical ref กันกำพร้า
  const { error: parentError } = await supabase
    // ขยับ `updatedAt` ตามกติกาเดียวกับจุดอื่น — แถวเปลี่ยนแล้วต้องบันทึกว่าเปลี่ยนเมื่อไร
    .from('sales_deals').update({ parentDealId: null, updatedAt: new Date().toISOString() }).eq('parentDealId', dealId);
  if (parentError) throw new Error(`ปลดดีลลูกออกจากดีลนี้ไม่สำเร็จ: ${parentError.message}`);
}

// ── PROJECT ───────────────────────────────────────────────────────────
// ลูกโครงการที่ไม่มี FK จริง เพิ่มเติมจาก deleteProjectDeep (ซึ่งเก็บ
// personal_tasks + project_doc_revisions + dept_requests ให้แล้ว): ทะเบียนสรรพสามิต
// (mig 0066 — ไม่มี FK) ปกติถูก "บล็อก" การลบ; เมื่อ force ผู้ดูแลเลือกลบพ่วง.
export async function forceDeleteProjectExcise(supabase, projectId) {
  await supabase.from('excise_registrations').delete().eq('projectId', projectId);
}

// ── ใบยื่นชำระภาษี: ด่านที่ break-glass ก็ข้ามไม่ได้ ────────────────────────
// orders."salesOrderId" เป็น FK ON DELETE RESTRICT (mig 0160) และ RPC บังคับลบ
// (force_delete_sales_order / force_delete_quotation, mig 0152/0168) ไม่ได้ล้าง
// ตาราง orders ให้ — การลบจึงพังกลางทางด้วย error ดิบจาก Postgres ทั้งที่พรีวิว
// เพิ่งบอกว่าลบได้ (ฝั่ง SO ได้ 409 ข้อความกลาง ๆ ที่ชี้ทางผิด · ฝั่ง QT ได้ 500 ดิบ)
//
// เจตนา: **ไม่ลบใบยื่นให้อัตโนมัติ** — ใบยื่นเป็นเอกสารภาษีที่อาจยื่นกรมสรรพสามิตแล้ว
// การลากลบตามเอกสารต้นทางเป็นผลข้างเคียงที่เงียบเกินไป. เส้นทางเดียวกับด่านอื่นทั้งหมด
// (ยกเลิก SO / ย้อนการอนุมัติ / ออก Rev. ก็ถูกใบยื่นบล็อกเหมือนกัน) คือให้จัดการใบยื่นก่อน
export async function exciseFilingsOfSalesOrder(supabase, salesOrderId) {
  const { data, error } = await supabase
    .from('orders').select('id, status').eq('salesOrderId', salesOrderId);
  // คอลัมน์ยังไม่มี (ยังไม่รัน mig 0160) = ยังไม่มีใบยื่นในระบบ → ไม่บล็อก
  if (error) return [];
  return data || [];
}

export async function exciseFilingsOfQuotation(supabase, quotationId) {
  const { data: orders } = await supabase
    .from('sales_orders').select('id').eq('quotationId', quotationId);
  const ids = (orders || []).map((row) => row.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('orders').select('id, status').in('salesOrderId', ids);
  if (error) return [];
  return data || [];
}

// ── สัญญา: FK RESTRICT ทั้ง dealId และ quotationId (mig 0278) ──────────────
// สัญญาเป็นเอกสารผูกพันตามกฎหมาย ⇒ ห้ามหายตามดีล/ใบเสนอราคาไปเงียบ ๆ และห้ามให้
// break-glass ทำลายให้ด้วย · ปล่อยไว้เฉย ๆ = ลบจริงตายกลางทางด้วย error ดิบจาก
// Postgres (บทเรียนเดียวกับ document_signature_evidence ที่หลุดขึ้นหน้าดีลทั้งดุ้น)
/* ⚠️ **อ่านไม่สำเร็จต้องดัง ไม่ใช่คืน []** — สองตัวนี้ถูกใช้เป็น *ด่านหน้างานทำลาย*
   (ดักก่อนลบดีล/ใบเสนอราคา) การกลืน error แล้วคืนอาร์เรย์ว่างแปลว่า "ไม่มีสัญญา"
   ⇒ เน็ตหลุดชั่ววินาทีเดียวก็เปิดทางให้ cleanup วิ่งต่อจนข้อมูลหาย (ตรวจ 2026-08-28)
   ผู้เรียกฝั่งพรีวิวจับ error เองแล้วแสดงว่าตรวจไม่ได้ ดีกว่าบอกว่า "ไม่มี" */
export async function contractsOfDeal(supabase, dealId) {
  const { data, error } = await supabase
    .from('sales_contracts').select('id, "contractNo", status').eq('dealId', dealId);
  if (error) throw new Error(`ตรวจสัญญาของดีลไม่สำเร็จ: ${error.message}`);
  return data || [];
}

export async function contractsOfQuotation(supabase, quotationId) {
  const { data, error } = await supabase
    .from('sales_contracts').select('id, "contractNo", status').eq('quotationId', quotationId);
  if (error) throw new Error(`ตรวจสัญญาของใบเสนอราคาไม่สำเร็จ: ${error.message}`);
  return data || [];
}

export function contractBlockMessage(contracts = [], documentLabel = 'เอกสาร') {
  const list = contracts.map((row) => row.contractNo || `${row.id} (ฉบับร่าง)`).join(', ');
  return `ลบถาวรไม่ได้แม้ใช้สิทธิ์ผู้ดูแลระบบ: มีสัญญาผูกอยู่ ${list}`
    + ' — สัญญาเป็นเอกสารผูกพันตามกฎหมายที่ระบบจะไม่ลบให้อัตโนมัติ'
    + ` กรุณาจัดการสัญญาที่หน้า "บริหารงานขาย › สัญญา" ก่อน แล้วจึงลบ${documentLabel}นี้ได้`;
}

export function exciseFilingBlockMessage(filings = [], documentLabel = 'เอกสาร') {
  const list = filings.map((row) => `${row.id}${row.status ? ` (${row.status})` : ''}`).join(', ');
  return `ลบถาวรไม่ได้แม้ใช้สิทธิ์ผู้ดูแลระบบ: มีใบยื่นชำระภาษีผูกอยู่ ${list}`
    + ` — ใบยื่นเป็นเอกสารภาษีที่ระบบจะไม่ลบให้อัตโนมัติ กรุณาลบใบยื่นที่หน้า "ภาษี › การยื่นชำระ" ก่อน`
    + ` แล้วจึงลบ${documentLabel}นี้ได้`;
}

// ── ดีล: เอกสารลูกที่ FK RESTRICT ไม่ยอมให้ cascade ───────────────────
// quotations/sales_orders."dealId" เป็น ON DELETE CASCADE (0065:8 · 0107:9) แต่ลูกของ
// เอกสารสองชนิดนั้น — หลักฐานลายเซ็น (0125) และฉบับตรึง (0130/0148) — เป็น RESTRICT
// ⇒ ลบดีลตรง ๆ ตายกลางทางด้วย error ดิบจาก Postgres ที่หลุดขึ้นหน้าดีลทั้งดุ้น
// ("update or delete on table \"quotations\" violates foreign key constraint
// \"document_signature_evidence_quotationId_fkey\"" — prod 2026-08-20)
//
// เจตนา: เส้นทางปกติ **บล็อกพร้อมบอกชื่อใบ** (แปลง FK RESTRICT เป็นข้อความที่อ่านออก
// กติกาเดียวกับ DELETE quotation) · ทาง ?force=1 ของผู้ดูแลระบบลบให้ผ่าน RPC break-glass
//
// ⚠️ โยน error เมื่ออ่านไม่สำเร็จ — เงียบแล้วสรุปว่า "ไม่มีหลักฐาน" คือปล่อยให้ไปตาย
// ที่ฐานข้อมูลด้วย error ดิบเหมือนเดิม
export async function dealSignedDocuments(supabase, dealId) {
  const [quotes, orders] = await Promise.all([
    supabase.from('quotations').select('id, quoteNumber').eq('dealId', dealId),
    supabase.from('sales_orders').select('id, orderNumber').eq('dealId', dealId),
  ]);
  if (quotes.error) throw new Error(`อ่านใบเสนอราคาของดีลไม่สำเร็จ: ${quotes.error.message}`);
  if (orders.error) throw new Error(`อ่านใบสั่งขายของดีลไม่สำเร็จ: ${orders.error.message}`);
  const quoteRows = quotes.data || [];
  const orderRows = orders.data || [];
  const signed = { quotation: new Set(), sales_order: new Set() };
  const probes = [
    ['document_signature_evidence', 'quotationId', 'quotation', quoteRows],
    ['issued_documents', 'quotationId', 'quotation', quoteRows],
    ['document_signature_evidence', 'salesOrderId', 'sales_order', orderRows],
    ['issued_documents', 'salesOrderId', 'sales_order', orderRows],
  ];
  for (const [table, column, kind, rows] of probes) {
    if (!rows.length) continue;
    const { data, error } = await supabase
      .from(table).select(column).in(column, rows.map((r) => r.id));
    if (error) throw new Error(`ตรวจหลักฐาน/ฉบับตรึงของเอกสารในดีลไม่สำเร็จ: ${error.message}`);
    for (const row of data || []) if (row?.[column]) signed[kind].add(row[column]);
  }
  return {
    quotations: quoteRows.filter((r) => signed.quotation.has(r.id)),
    salesOrders: orderRows.filter((r) => signed.sales_order.has(r.id)),
  };
}

// ใบยื่นชำระภาษีของ SO ทุกใบในดีล — ด่านที่ break-glass ก็ข้ามไม่ได้ (ดูหมายเหตุด้านบน)
export async function exciseFilingsOfDeal(supabase, dealId) {
  const { data: orders } = await supabase
    .from('sales_orders').select('id').eq('dealId', dealId);
  const ids = (orders || []).map((row) => row.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('orders').select('id, status').in('salesOrderId', ids);
  if (error) return [];
  return data || [];
}

// ข้อความบล็อกเส้นทางปกติ — บอกชื่อใบที่ขวางอยู่ ไม่ใช่ "ลบไม่ได้" ลอย ๆ
export function dealSignedBlockMessage({ quotations = [], salesOrders = [] } = {}) {
  const parts = [];
  if (quotations.length) parts.push(`ใบเสนอราคา ${quotations.map((r) => r.quoteNumber || r.id).join(', ')}`);
  if (salesOrders.length) parts.push(`ใบสั่งขาย ${salesOrders.map((r) => r.orderNumber || r.id).join(', ')}`);
  return `ลบดีลไม่ได้: มีเอกสารที่ลงนาม/ออกฉบับจริงแล้วในดีลนี้ (${parts.join(' · ')})`
    + ' — เอกสารเหล่านี้เก็บเป็นหลักฐานถาวร ให้ “ยกเลิก”/ออก Rev. ที่หน้าเอกสารก่อน'
    + ' (ถ้าจำเป็นต้องลบทั้งดีลจริง ๆ ให้แอดมินใช้ “บังคับลบ”)';
}

// บังคับลบเอกสารทั้งสายของดีลผ่าน RPC break-glass (mig 0152/0168) ก่อนลบแถวดีล —
// RPC เก็บกวาดตามลำดับ FK ให้: SO ลูก → ฉบับตรึง+ไฟล์แนบ → หลักฐาน → ตัวใบ
// (sales_orders."quotationId" เป็น NOT NULL UNIQUE ⇒ วนตามใบเสนอราคาครอบคลุม SO ครบ)
//
// ⚠️ ลบทีละใบ ไม่ใช่ทรานแซกชันเดียว — ล้มกลางทางแล้วดีลยังอยู่กับใบที่เหลือ ผู้เรียก
// ต้องหยุดและรายงาน ไม่ใช่ลบดีลต่อ (จะได้ error ดิบจาก FK อยู่ดี)
export async function forceDeleteDealDocuments(supabase, dealId, actor = {}) {
  const { data: quotes, error } = await supabase
    .from('quotations').select('id, quoteNumber').eq('dealId', dealId);
  if (error) throw new Error(`อ่านใบเสนอราคาของดีลไม่สำเร็จ: ${error.message}`);
  for (const quote of quotes || []) {
    const { error: rpcError } = await supabase.rpc('force_delete_quotation', {
      p_id: quote.id,
      p_actor_id: actor.id || null,
      p_actor_name: actor.name || null,
      p_actor_role: actor.role || null,
    });
    if (rpcError) throw new Error(`บังคับลบใบเสนอราคา ${quote.quoteNumber || quote.id} ไม่สำเร็จ: ${rpcError.message}`);
  }
  return (quotes || []).length;
}

// ── QUOTATION ─────────────────────────────────────────────────────────
// preview การลบใบเสนอราคาหนึ่งใบ. quotation_lines cascade เอง (FK); sales_orders
// .quotationId เป็น ON DELETE CASCADE → Sale Order (แหล่งยอด Actual) หายตามทันที
// ที่ระดับ DB — โชว์ให้ผู้ดูแลเห็นชัดก่อน.
export async function quotationForcePreview(supabase, quote) {
  // ⚠️ contractsOfQuotation โยน error เมื่ออ่านไม่สำเร็จ — จับไว้แล้วบล็อก ไม่ใช่ปล่อยให้
  //    Promise.all พาทั้งพรีวิวพัง (และไม่ใช่แปลว่า "ไม่มีสัญญา")
  const [salesOrders, evidence, issued, filings, contracts] = await Promise.all([
    countBy(supabase, 'sales_orders', 'quotationId', quote.id),
    countBy(supabase, 'document_signature_evidence', 'quotationId', quote.id),
    countBy(supabase, 'issued_documents', 'quotationId', quote.id),
    exciseFilingsOfQuotation(supabase, quote.id),
    contractsOfQuotation(supabase, quote.id).catch((e) => ({ readError: e.message })),
  ]);
  if (contracts?.readError) {
    return { cascade: [], notes: [contracts.readError], blocked: true };
  }
  // สัญญาที่อ้างใบนี้ = ด่านที่ break-glass ข้ามไม่ได้เช่นกัน (FK RESTRICT ของ mig 0278)
  if (contracts.length) {
    return { cascade: [], notes: [contractBlockMessage(contracts, 'ใบเสนอราคา')], blocked: true };
  }
  // ใบยื่นภาษีเป็นด่านที่ break-glass ก็ข้ามไม่ได้ (FK RESTRICT + RPC ไม่ล้างให้) —
  // ต้องบอกตั้งแต่พรีวิว ไม่ใช่ปล่อยให้ไปพังตอนลบจริงแล้วได้ error ดิบจาก Postgres
  if (filings.length) {
    return {
      cascade: [],
      notes: [exciseFilingBlockMessage(filings, 'ใบเสนอราคา')],
      blocked: true,
    };
  }
  const cascade = [
    line('ใบสั่งขายที่อ้างใบนี้ — แหล่งยอด Actual', salesOrders),
    line('หลักฐานลายเซ็น (immutable) ของใบนี้', evidence),
    line('เอกสารฉบับตรึงที่ออกจริง + ไฟล์ PDF ถาวร', issued),
  ].filter((r) => r.count > 0);
  const notes = [];
  // ตั้งแต่ mig 0152 ผู้ดูแลระบบลบเอกสารที่มีหลักฐานได้ (break-glass) — พรีวิวจึงเลิกบอกว่า
  // blocked แต่ต้องเตือนให้ชัดว่าจะทำลายหลักฐานถาวร (พรีวิว = สิ่งที่จะเกิดจริง)
  if (evidence > 0 || Boolean(quote.signatureEvidenceId) || issued > 0) {
    notes.push('⚠️ ใบนี้มีหลักฐานลายเซ็น/ฉบับตรึง — บังคับลบจะทำลายหลักฐานถาวร กู้คืนไม่ได้ ปกติควรใช้ “ยกเลิก”/“ย้อนการรับ” แทน');
  }
  if (quote.status === 'accepted') {
    notes.push('ใบนี้ถูกรับแล้ว (accepted) = แหล่งยอด Actual ของดีล');
    // mig 0168: ลบแล้วดีลจะถอยออกจาก Won ให้เอง — บอกไว้ในพรีวิวเพราะเป็นผลที่
    // กระทบยอดและตัวเลือกในหน้าสร้างใบเสนอราคา ไม่ใช่ผลข้างเคียงที่ควรเงียบ
    notes.push('ระบบจะถอยดีลออกจาก Won กลับไปสถานะก่อนหน้าให้อัตโนมัติ (ยอด Actual หลุด และดีลกลับมาออกใบเสนอราคาใหม่ได้)');
  }
  return { cascade, notes, blocked: false };
}

// พรีวิวการลบใบสั่งขายหนึ่งใบ (ของใหม่ — เดิม SO ไม่มีเส้นทาง force เลย).
// sales_order_lines เป็น FK CASCADE จึงไม่ต้องนับ; ที่ต้องเตือนคือหลักฐาน+ฉบับตรึง
export async function salesOrderForcePreview(supabase, order) {
  const [evidence, issued, filings, installments, paidInstallments, zoneTerms] = await Promise.all([
    countBy(supabase, 'document_signature_evidence', 'salesOrderId', order.id),
    countBy(supabase, 'issued_documents', 'salesOrderId', order.id),
    exciseFilingsOfSalesOrder(supabase, order.id),
    countBy(supabase, 'sales_order_installments', 'salesOrderId', order.id),
    // งวดที่บัญชีคอนเฟิร์มแล้ว = เงินที่รับมาจริง ต้องขึ้นให้เห็นเป็นบรรทัดของตัวเอง
    countBy(supabase, 'sales_order_installments', 'salesOrderId', order.id, (q) => q.eq('status', 'confirmed')),
    /* 🐞 รอบขายของโซนบริการหายตาม CASCADE โดยพรีวิวไม่เคยบอก — mig 0297:48 สั่งไว้
       ตั้งแต่วันสร้างตารางว่า dryRun ต้องนับแถวนี้ แต่เฟส 4 เพิ่งมาต่อของจริง
       ⚠️ โซนกับประวัติการเข้าไซต์ **ไม่หาย** (FK เป็น RESTRICT) — ที่หายคือสะพาน
       ที่บอกว่าโซนนั้นขายอยู่ในรอบไหน ⇒ โซนจะเด้งกลับไปคิว "รอตั้งไซต์/โซน" เงียบ ๆ */
    countBy(supabase, 'service_zone_terms', 'salesOrderId', order.id),
  ]);
  if (filings.length) {
    return { cascade: [], notes: [exciseFilingBlockMessage(filings, 'ใบสั่งขาย')], blocked: true };
  }
  const cascade = [
    line('หลักฐานลายเซ็น (immutable) ของใบนี้', evidence),
    line('เอกสารฉบับตรึงที่ออกจริง + ไฟล์ PDF ถาวร', issued),
    line('งวดชำระของใบนี้', installments),
    line('— ในนั้นเป็นงวดที่บัญชีคอนเฟิร์มแล้ว', paidInstallments),
    line('รอบขายของโซนบริการที่ผูกกับใบนี้ (โซนและประวัติการเข้าไซต์ยังอยู่)', zoneTerms),
  ].filter((r) => r.count > 0);
  const notes = [];
  if (evidence > 0 || issued > 0) {
    notes.push('⚠️ ใบนี้มีหลักฐานลายเซ็น/ฉบับตรึง — บังคับลบจะทำลายหลักฐานถาวร กู้คืนไม่ได้');
  }
  if (paidInstallments > 0) {
    notes.push(`🔴 มีงวดที่บัญชีคอนเฟิร์มแล้ว ${paidInstallments} งวด = เงินที่รับมาจริง — ลบแล้วร่องรอยการรับเงินหายถาวร`);
  }
  if (zoneTerms > 0) {
    notes.push(`🔴 ใบนี้เป็นต้นเรื่องของรอบบริการ ${zoneTerms} รอบ — ลบแล้วโซนเหล่านั้นจะกลับไปเป็น “ขายแล้วแต่ยังไม่ผูก” และคิวงานเข้าใหม่จะทวงซ้ำ`);
  }
  if (order.status === 'approved') {
    notes.push('ใบนี้อนุมัติแล้ว = แหล่งยอด Actual ของดีล — ปกติควรใช้ “ยกเลิก SO” แทน');
  }
  return { cascade, notes, blocked: false };
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
      // ⚠️ `metadata` คือสิ่งที่แดชบอร์ดอ่าน — ไม่ขยับ `updatedAt` = สแตมป์ไม่ขยับ
      // = ตัวเลขค้างได้ถึง 5 นาทีหลังบังคับลบใบเสนอราคา (ดู lib/sales/dashboardStamp)
      await supabase.from('sales_deals')
        .update({ metadata: nextMeta, updatedAt: new Date().toISOString() }).eq('id', deal.id);
    }
  } catch {
    // best-effort — ไม่ให้ทำลาย flow การลบหลัก
  }
}

// ── ทะเบียนกลิ่น / ทะเบียนสูตร (mig 0171 · 0232) ──────────────────────
// ไม่มีอะไรถูก **ลบ** พ่วง — มีแต่ของที่ถูก **ปลดการเชื่อมโยง** · พรีวิวจึงต้องเขียน
// ป้ายให้ตรงความจริง ไม่งั้นผู้ดูแลระบบเข้าใจผิดว่ากำลังจะลบสินค้าทิ้ง
//
// ⭐ **หลัง mig 0232 การปลดไม่ได้เกิดเอง** — pointer ที่เป็น *หลักฐาน* ถูกเปลี่ยนเป็น
// `ON DELETE RESTRICT` แล้ว (คำร้อง · บรรทัดคำร้อง · ทะเบียนราคา) ⇒ ลบตรง ๆ จะโดน
// ฐานข้อมูลปฏิเสธ (23503) ⇒ ทางบังคับลบต้อง **ปลดเองก่อน** ด้วย `unlinkRegistryRefs()`
// ซึ่งเป็นสิ่งที่ต้องการพอดี: ของที่เคยหายเงียบ กลายเป็นของที่ต้องกดยืนยันหลังเห็นรายการ
//   คง SET NULL (ลบแล้วชี้ไปที่ว่างได้โดยไม่เสียความหมาย):
//     formulas.scentId · products.scentId/formulaId · scent_lineage.derivedFromScentId
//   RESTRICT (mig 0232 · ต้องปลดเองก่อนลบ):
//     dept_requests.scentId/formulaId · dept_request_items.scentId/producedScentId/
//     producedFormulaId · material_prices.scentId/formulaId
/**
 * ปลด pointer ที่เป็น `RESTRICT` ออกก่อนลบทะเบียน (mig 0232)
 *
 * ⭐ **นี่คือสิ่งที่ฐานข้อมูลเคยทำให้เองแบบเงียบ ๆ** — ตอนนี้ต้องทำเองอย่างตั้งใจ
 * หลังผู้ดูแลระบบเห็นพรีวิวแล้วกดยืนยัน · ไม่ทำ = `DELETE` โดนปฏิเสธด้วย 23503
 *
 * ⚠️ **ไม่แตะของที่ยังเป็น SET NULL** (`products` · `formulas.scentId` · lineage) —
 * ฐานข้อมูลจัดการเองถูกอยู่แล้ว และการมาอัปเดตซ้ำคือ write ที่ไม่มีเหตุผล
 * ⚠️ รายการเป้าหมายอยู่ที่ `lib/master/registryRefs.js` ที่เดียว — ใช้ร่วมกับตัวนับ
 * ก่อนลบ · นับอย่างปลดอีกอย่างเมื่อไร บังคับลบจะยังโดนปฏิเสธอยู่ดี
 *
 * @param kind 'scent' | 'formula'
 */
export async function unlinkRegistryRefs(supabase, kind, id) {
  for (const [table, column] of registryRefTargets(kind)) {
    // ⚠️ ปล่อย error ขึ้นไป ไม่กลืน — ปลดไม่สำเร็จแล้วไปลบต่อจะได้ 23503 ที่อ่านไม่ออก
    // ส่วนการปลดสำเร็จบางตารางแล้วพังกลางทางยังดีกว่าลบทะเบียนทิ้งโดยลิงก์ยังค้าง
    const { error } = await supabase.from(table).update({ [column]: null }).eq(column, id);
    if (error) throw new Error(`ปลดการเชื่อมโยง ${table}.${column} ไม่สำเร็จ: ${error.message}`);
  }
}

export async function scentForcePreview(supabase, scent) {
  const [requestItems, requestedItems, requests, formulas, products, materials] = await Promise.all([
    countBy(supabase, 'dept_request_items', 'producedScentId', scent.id),
    // ⚠️ สองแถวนี้เพิ่มหลัง mig 0232 — เดิมไม่ได้นับ ทั้งที่มันเป็น pointer ที่หายเงียบ
    // ได้เหมือนกัน ⇒ พรีวิวเคยบอกน้อยกว่าความจริง
    countBy(supabase, 'dept_request_items', 'scentId', scent.id),
    countBy(supabase, 'dept_requests', 'scentId', scent.id),
    countBy(supabase, 'formulas', 'scentId', scent.id),
    countBy(supabase, 'products', 'scentId', scent.id),
    countBy(supabase, 'material_prices', 'scentId', scent.id),
  ]);
  const cascade = [
    line('บรรทัดคำร้องที่ผลิตกลิ่นนี้ขึ้นมา (ปลดการเชื่อมโยง คำร้องยังอยู่)', requestItems),
    line('บรรทัดคำร้องที่ขอกลิ่นนี้ (ปลดการเชื่อมโยง คำร้องยังอยู่)', requestedItems),
    line('คำร้องที่อ้างกลิ่นนี้ทั้งใบ (ปลดการเชื่อมโยง คำร้องยังอยู่)', requests),
    line('สูตรที่อ้างกลิ่นนี้ (ปลดการเชื่อมโยง สูตรยังอยู่)', formulas),
    line('สินค้าที่อ้างกลิ่นนี้ (ปลดการเชื่อมโยง สินค้ายังอยู่)', products),
    line('วัสดุในทะเบียนที่อ้างกลิ่นนี้ (ปลดการเชื่อมโยง)', materials),
  ].filter((r) => r.count > 0);
  const notes = [];
  // ⚠️ ปลดแล้วต่อกลับไม่ได้ — ไม่มีที่ไหนเก็บไว้ว่ากลิ่นตัวไหนมาจากคำร้องใบไหน
  // นอกจากคอลัมน์นี้คอลัมน์เดียว (ต่างจากสินค้า/วัสดุที่ยังผูกกันทางอื่นได้)
  if (requestItems > 0) {
    notes.push('คำร้องจะไม่รู้อีกว่ากลิ่นที่ส่งไปคือตัวไหน — ปกติควรใช้ “เก็บเข้ากรุ” แทนการลบ');
  }
  return { cascade, notes, blocked: false };
}

// ── ทะเบียนวัสดุ (mig 0143/0157/0210) ──────────────────────────────────
//
// สายสัมพันธ์ของวัสดุหนึ่งตัว:
//   material_price_revisions.materialId   → CASCADE     (0143) ประวัติราคาหายตาม
//   dept_request_items.materialId         → RESTRICT    (0158)
//   costing_item_components.materialId    → RESTRICT    (0159)
//   material_deliveries.materialId        → SET NULL    (0176) ของเข้ายังอยู่
// + รุ่นราคา/ชั้นราคามี trigger ห้าม DELETE ทุกกรณี (0143/0157)
//
// ⭐ เดิมพรีวิวตอบ blocked:true ทันทีที่มีคนอ้าง (เจตนา "ไม่ลบเอกสารของคนอื่น") ผลคือ
// ผู้ดูแลระบบไม่มีทางลบวัสดุตัวไหนได้เลย — วัสดุเกือบทุกตัวเกิดจากบรรทัดคำร้อง จึงมี
// คนอ้างเสมอ · มติผู้ใช้ 2026-08-05: ต้องลบได้จริง → mig 0210 เปิดช่อง force ให้ทั้ง
// trigger และ RESTRICT ทั้งสองตัว (ดู RPC force_delete_material_price) โดยแยกวิธี
// ตามรูปร่างข้อมูล: ใบขอราคาผลิต **ปลดการเชื่อมโยง** (label/ราคาเป็น snapshot บนแถว
// อยู่แล้ว) · บรรทัดคำร้อง **ลบทั้งบรรทัด** เพราะ constraint บังคับว่าบรรทัดชนิดวัสดุ
// ต้องมี materialId เสมอ (0204) ปลดเป็น NULL ไม่ได้
//
// พรีวิวจึงต้องเขียนป้ายให้ตรงว่าอันไหน "ปลด" อันไหน "ลบ" — ผู้ดูแลระบบตัดสินใจจาก
// ตรงนี้ที่เดียว และ ?dryRun=1 ใช้เส้นทางเดียวกับตอนลบจริง
export async function materialForcePreview(supabase, material) {
  const [revisions, requestItems, costingLines, deliveries] = await Promise.all([
    countBy(supabase, 'material_price_revisions', 'materialId', material.id),
    countBy(supabase, 'dept_request_items', 'materialId', material.id),
    countBy(supabase, 'costing_item_components', 'materialId', material.id),
    countBy(supabase, 'material_deliveries', 'materialId', material.id),
  ]);

  const cascade = [
    line('ประวัติรุ่นราคาของวัสดุนี้ (ลบพ่วง กู้ไม่ได้)', revisions),
    line('บรรทัดในคำร้องขอราคาที่อ้างวัสดุนี้ (ลบทั้งบรรทัด — ตัวคำร้องยังอยู่)', requestItems),
    line('บรรทัดในใบขอราคาผลิตที่อ้างวัสดุนี้ (ปลดการเชื่อมโยง — ชื่อและราคาที่ตรึงไว้ยังอยู่)', costingLines),
    line('รายการของเข้าที่อ้างวัสดุนี้ (ปลดการเชื่อมโยง ของเข้ายังอยู่)', deliveries),
  ].filter((r) => r.count > 0);

  const notes = [];
  if (revisions > 0) {
    notes.push('ประวัติราคาคือหลักฐานว่าเคยเสนอลูกค้าเท่าไร — ปกติควรใช้ “เก็บเข้ากรุ” แทนการลบ');
  }
  // ที่ต้องเตือนแรงกว่าอย่างอื่น: บรรทัดคำร้องเป็นเอกสารของฝ่ายอื่นและหายถาวร
  if (requestItems > 0) {
    notes.push(`⚠️ บรรทัดในคำร้อง ${requestItems} รายการจะถูกลบทิ้งถาวร (พร้อมไฟล์แนบของบรรทัดนั้น)`
      + ' — คำร้องจะไม่เหลือประวัติว่าเคยถามราคาวัสดุตัวนี้');
  }
  if (material.status === 'active') {
    notes.push('วัสดุนี้ยังใช้งานอยู่ (active) ไม่ใช่ร่างที่เสนอมาแล้วไม่ได้ใช้');
  }
  return { cascade, notes, blocked: false };
}

// เก็บกวาดของที่ RPC ทำแทนไม่ได้ ก่อนเรียก force_delete_material_price:
// ไฟล์แนบของบรรทัดคำร้องที่กำลังจะโดนลบ อยู่บน Drive (นอก DB) และ attachments เป็น
// polymorphic ไม่มี FK — ไม่กวาดตรงนี้ = ไฟล์ค้างบน Drive โดยไม่มีทางเข้าถึงอีกเลย
//
// ⚠️ โยน error เมื่ออ่านบรรทัดไม่สำเร็จ — ผู้เรียกต้องหยุดก่อนลบ (กติกาเดียวกับ
// cleanupDealOrphans/cleanupRequestOrphans)
export async function cleanupMaterialOrphans(supabase, materialId) {
  const { data: items, error } = await supabase
    .from('dept_request_items').select('id').eq('materialId', materialId);
  if (error) throw new Error(`อ่านบรรทัดคำร้องที่อ้างวัสดุนี้ไม่สำเร็จ: ${error.message}`);
  for (const item of items || []) {
    await purgeAttachments('dept_request_item', item.id);
  }
  return (items || []).length;
}

// ── คำร้องข้ามฝ่าย (mig 0173) ─────────────────────────────────────────
// เส้นทาง force มีมาตั้งแต่ #779 แต่ **ไม่มีพรีวิวและไม่มีปุ่มบนหน้าจอ** — ผู้ดูแล
// ระบบต้องยิง URL เอง · และของที่จะโดนลบพ่วงมีจริงหลายอย่างที่ไม่มี FK:
//   dept_request_items / _tiers  → FK CASCADE (DB จัดการ)
//   entity_updates (เธรด)         → polymorphic ไม่มี FK ต้องกวาดเอง
//   attachments (หัว + รายบรรทัด) → polymorphic ไม่มี FK ต้องกวาดเอง + ลบไฟล์บน Drive
//   personal_tasks.inquiryId      → ไม่มี FK · "สร้างงานจากคำร้อง" ค้างเป็นงานกำพร้า
// (สามอย่างท้ายคือของที่ `cleanupDealOrphans` กวาดให้ตอนลบดีล แต่ตอนลบคำร้อง
//  ทีละใบไม่มีใครกวาด — รูเดียวกันคนละทางเข้า)
export async function requestForcePreview(supabase, request) {
  const [items, updates, tasks] = await Promise.all([
    countBy(supabase, 'dept_request_items', 'requestId', request.id),
    countBy(supabase, 'entity_updates', 'entityId', request.id, (q) => q.eq('entityType', 'dept_request')),
    countBy(supabase, 'personal_tasks', 'inquiryId', request.id),
  ]);
  const cascade = [
    line('บรรทัดวัสดุ + ชั้นจำนวนที่ขอ (ลบพ่วง)', items),
    line('ข้อความและเหตุการณ์ในเธรดคำร้อง (ลบพ่วง)', updates),
    line('งานที่สร้างจากคำร้องนี้ (ลบพ่วง)', tasks),
  ].filter((r) => r.count > 0);

  const notes = [];
  // ราคาที่ตอบแล้วอยู่ในทะเบียนวัสดุเป็น rev ของตัวเอง — **ไม่หายไปกับคำร้อง**
  // ต้องบอกให้ชัด ไม่งั้นผู้ดูแลระบบจะกลัวว่ากำลังลบประวัติราคาทิ้ง
  if (['answered', 'closed'].includes(request.status)) {
    notes.push('ราคาที่ตอบแล้วอยู่ในทะเบียนวัสดุเป็นรุ่นของตัวเอง — ลบคำร้องแล้วราคายังอยู่ตามเดิม');
  }
  if (request.docNo) {
    notes.push(`คำร้องที่ออกเลข ${request.docNo} แล้วถือเป็นหลักฐาน — ปกติควรใช้ “ยกเลิก” แทนการลบ`);
  }
  if (request.dealId) {
    notes.push('บรรทัดที่เคยลงไว้ในเธรดของดีลจะไม่ถูกลบตาม (เป็นประวัติของดีล) — ลิงก์ในนั้นจะกดไม่เจอ');
  }
  return { cascade, notes, blocked: false };
}

// เก็บกวาดลูกของคำร้องที่ไม่มี FK จริง — เรียกก่อนลบแถวคำร้องเสมอ
//
// ⚠️ โยน error เมื่อกวาดไม่สำเร็จ: ปล่อยให้ลบคำร้องสำเร็จแต่ลูกค้างไว้ = แถวกำพร้า
// ที่ไม่มีทางเข้าถึงและไม่มีใครตามลบให้ (กติกาเดียวกับ cleanupDealOrphans)
export async function cleanupRequestOrphans(supabase, requestId) {
  const { data: items, error: itemError } = await supabase
    .from('dept_request_items').select('id').eq('requestId', requestId);
  if (itemError) throw new Error(`อ่านบรรทัดของคำร้องไม่สำเร็จ: ${itemError.message}`);

  // ไฟล์แนบอยู่สองระดับ: หัวคำร้อง + รายบรรทัด · ต้องลบไฟล์บน Drive ด้วย ไม่ใช่แค่แถว
  await purgeTaskAttachments(supabase, 'inquiryId', requestId);
  await purgeAttachments('dept_request', requestId);
  for (const item of items || []) {
    await purgeAttachments('dept_request_item', item.id);
  }

  // งานที่สร้างจากคำร้องนี้ + เธรดของงานพวกนั้น
  await purgeTaskThreads(supabase, { column: 'inquiryId', values: [requestId] });
  const { error: taskError } = await supabase
    .from('personal_tasks').delete().eq('inquiryId', requestId);
  if (taskError) throw new Error(`ลบงานที่ผูกคำร้องไม่สำเร็จ: ${taskError.message}`);
}

export async function formulaForcePreview(supabase, formula) {
  const [products, materials, requests, requestItems] = await Promise.all([
    countBy(supabase, 'products', 'formulaId', formula.id),
    countBy(supabase, 'material_prices', 'formulaId', formula.id),
    // เพิ่มหลัง mig 0232 ด้วยเหตุผลเดียวกับฝั่งกลิ่น — เดิมพรีวิวไม่เคยพูดถึงคำร้องเลย
    countBy(supabase, 'dept_requests', 'formulaId', formula.id),
    countBy(supabase, 'dept_request_items', 'producedFormulaId', formula.id),
  ]);
  const cascade = [
    line('คำร้องที่อ้างสูตรนี้ทั้งใบ (ปลดการเชื่อมโยง คำร้องยังอยู่)', requests),
    line('บรรทัดคำร้องที่ผลิตสูตรนี้ขึ้นมา (ปลดการเชื่อมโยง คำร้องยังอยู่)', requestItems),
    line('สินค้าที่อ้างสูตรนี้ (ปลดการเชื่อมโยง สินค้ายังอยู่)', products),
    line('วัสดุในทะเบียนที่อ้างสูตรนี้ (ปลดการเชื่อมโยง)', materials),
  ].filter((r) => r.count > 0);
  const notes = [];
  if (products > 0) {
    notes.push('สินค้าที่ปลดแล้วจะกลับไปอยู่ในรายการ “รอจัดระเบียบ” ถ้ายังมีชื่อสูตรเป็นข้อความอยู่');
  }
  return { cascade, notes, blocked: false };
}

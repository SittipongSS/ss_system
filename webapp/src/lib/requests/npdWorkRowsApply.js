// ── ตัวเขียนแถวงานของพัฒนาสูตร NPD (ม-144) — แยกจาก `npdWorkRows.js` เพราะแตะ DB ────────
//
// ⚠️ แยกไฟล์ให้ตัววางแผน (ล้วน) ถูก import ฝั่งจอได้โดยไม่ลาก supabase/ไฟล์แนบเข้า bundle ของเบราว์เซอร์
// ⚠️ **ไม่มี transaction** (PostgREST) — ลำดับ: เพิ่ม → แก้สเปก → ถอน · ล้มกลางทางคืน error ให้ผู้เรียก
//    บอกผู้ใช้ (ไม่ throw) · ตัววางแผน idempotent ⇒ บันทึกแบบฟอร์ม PDR อีกครั้ง = ซ่อมส่วนที่ขาดเอง
import { randomUUID } from 'crypto';
import { resolveLineLabels } from '@/lib/requests/lineLabels';
import { purgeAttachments } from '@/lib/master/attachments';

/**
 * เขียนแผนลงตาราง — คืน `{ inserted, removed, kept, error, insertFailed }` (`inserted` = แถวที่เขียนจริงพร้อมป้าย)
 *
 * @param plan ผลของ `planNpdWorkRows`
 * @param ctx.items แถวงานที่ใบมีตอนนี้ (หา sortOrder ถัดไป)
 * @param ctx.ack  `{ ackAt, ackById, ackByName }` — **แถวใหม่เริ่มที่ "กำลังทำ" เสมอ** ใบรับเรื่องแล้ว
 *                 (บทเรียน DC-26080003: แถวที่ไม่มี ackAt ต้องกดรับซ้ำรายแถว 25 ครั้ง)
 */
export async function applyNpdWorkRows(supabase, {
  requestId, customerId = null, items: knownItems = [], plan, ack = {}, nowIso,
}) {
  let items = knownItems;
  // `insertFailed` = มีคู่ที่ต้องงอกแต่ไม่ได้งอก ⇒ ผู้เรียกต้องถือว่างานยังไม่จบ (ถอนตราปิด) จนกว่าจะบันทึกซ่อม
  const result = { inserted: [], removed: [], kept: [], error: null, insertFailed: false };
  if (!plan) return result;
  const insertFail = (message) => ({ ...result, error: message, insertFailed: true });

  /* ⚠️ **อ่านแถวสดก่อนงอก** (รีวิว ม-144) — สองคนกดรับเรื่อง/บันทึกแบบฟอร์มพร้อมกัน ต่างคนต่างวางแผนจาก
     ภาพเดิม (ยังไม่มีแถว) แล้วงอกซ้ำทุกคู่ · แถวต้นทางของ NPD ลบที่แถวไม่ได้ ⇒ ซ้ำแล้วค้างถาวร
     อ่านซ้ำหน้างานปิดช่องนั้นเกือบหมด (ไม่มี transaction ให้ปิดสนิท) */
  let toInsert = plan.insert;
  if (toInsert.length) {
    const { data: fresh, error: freshError } = await supabase.from('dept_request_items')
      .select('categoryCode, scentId, sortOrder, lineKind').eq('requestId', requestId);
    if (freshError) return insertFail(freshError.message);
    const have = new Set((fresh || []).filter((r) => r.lineKind === 'product_dev')
      .map((r) => `${r.categoryCode}::${r.scentId}`));
    toInsert = toInsert.filter((p) => !have.has(`${p.categoryCode}::${p.scentId}`));
    items = [...(items || []), ...(fresh || [])];
  }

  if (toInsert.length) {
    const start = Math.max(0, ...(items || []).map((i) => Number(i?.sortOrder) || 0));
    const drafts = toInsert.map((p, i) => ({
      lineKind: 'product_dev', categoryCode: p.categoryCode, scentId: p.scentId, spec: p.spec, sortOrder: start + i + 1,
    }));
    // ⭐ ป้ายจากทะเบียน (หมวด · รหัส ชื่อกลิ่น) ตัวเดียวกับที่ Standard ใช้ + ด่านกลิ่นข้ามลูกค้า
    const labelled = await resolveLineLabels(supabase, drafts, { lineShape: 'product_dev', customerId });
    if (labelled.error) return insertFail(labelled.error);
    const rows = labelled.items.map((r) => ({
      id: `DRI-${randomUUID()}`,
      requestId,
      lineKind: 'product_dev',
      sortOrder: r.sortOrder,
      label: r.label,
      spec: r.spec,
      categoryCode: r.categoryCode,
      scentId: r.scentId,
      ackAt: ack.ackAt ?? null,
      ackById: ack.ackById ?? null,
      ackByName: ack.ackByName ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
    const { error } = await supabase.from('dept_request_items').insert(rows);
    if (error) return insertFail(error.message);
    result.inserted = rows;
  }

  for (const u of plan.update) {
    const { error } = await supabase.from('dept_request_items')
      .update({ spec: u.spec, updatedAt: nowIso }).eq('id', u.id);
    if (error) return { ...result, error: error.message };
  }

  if (plan.remove.length) {
    /* ⚠️ **ลบแบบมีเงื่อนไขก่อน แล้วค่อยกวาดไฟล์เฉพาะแถวที่ลบจริง** (รีวิว ม-144) — แถวที่อีกคนเพิ่งกดส่งสูตร
       ระหว่างการบันทึกนี้ต้องรอด ทั้งแถวและไฟล์ · (ด่านไฟล์แนบของแผนกันแถวที่มีไฟล์ไว้ก่อนแล้ว — ตรงนี้คือ
       ตาข่ายชั้นสุดท้าย) · `attachments` ไม่มี FK cascade จึงต้องกวาดเอง */
    const ids = plan.remove.map((r) => r.id);
    const { data: gone, error } = await supabase.from('dept_request_items').delete()
      .in('id', ids).is('readyAt', null).is('producedFormulaId', null).is('outcome', null)
      .select('id');
    if (error) return { ...result, error: error.message };
    const goneIds = new Set((gone || []).map((r) => r.id));
    for (const id of goneIds) {
      await purgeAttachments('dept_request_item', id).catch(() => {});
    }
    result.removed = plan.remove.filter((r) => goneIds.has(r.id));
    // แถวที่เงื่อนไขกันไว้ (เพิ่งถูกส่งสูตร/มีผล) — ผู้เรียกต้องบอกผู้ใช้
    result.kept = plan.remove.filter((r) => !goneIds.has(r.id));
  }
  return result;
}

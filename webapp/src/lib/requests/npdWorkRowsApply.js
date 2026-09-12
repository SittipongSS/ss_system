// ── ตัวเขียนแถวงานของพัฒนาสูตร NPD (ม-144) — แยกจาก `npdWorkRows.js` เพราะแตะ DB ────────
//
// ⚠️ แยกไฟล์ให้ตัววางแผน (ล้วน) ถูก import ฝั่งจอได้โดยไม่ลาก supabase/ไฟล์แนบเข้า bundle ของเบราว์เซอร์
// ⚠️ **ไม่มี transaction** (PostgREST) — ลำดับ: เพิ่ม → แก้สเปก → ถอน · ล้มกลางทางคืน error ให้ผู้เรียก
//    บอกผู้ใช้ (ไม่ throw) · ตัววางแผน idempotent ⇒ บันทึกแบบฟอร์ม PDR อีกครั้ง = ซ่อมส่วนที่ขาดเอง
import { randomUUID } from 'crypto';
import { resolveLineLabels } from '@/lib/requests/lineLabels';
import { purgeAttachments } from '@/lib/master/attachments';

/**
 * เขียนแผนลงตาราง — คืน `{ inserted, removed, kept, error }` (`inserted` = แถวที่เขียนจริงพร้อมป้าย)
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
  const result = { inserted: [], removed: [], kept: [], error: null };
  if (!plan) return result;

  /* ⚠️ **อ่านแถวสดก่อนงอก** (รีวิว ม-144) — สองคนกดรับเรื่อง/บันทึกแบบฟอร์มพร้อมกัน ต่างคนต่างวางแผนจาก
     ภาพเดิม (ยังไม่มีแถว) แล้วงอกซ้ำทุกคู่ · แถวต้นทางของ NPD ลบที่แถวไม่ได้ ⇒ ซ้ำแล้วค้างถาวร
     อ่านซ้ำหน้างานปิดช่องนั้นเกือบหมด · ช่องที่เหลือ (อ่านทันกันพอดี) ปิดด้วยดัชนี mig 0356 + `insertNpdWorkRows` */
  let toInsert = plan.insert;
  if (toInsert.length) {
    const { data: fresh, error: freshError } = await supabase.from('dept_request_items')
      .select('categoryCode, scentId, sortOrder, lineKind').eq('requestId', requestId);
    if (freshError) return { ...result, error: freshError.message };
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
    if (labelled.error) return { ...result, error: labelled.error };
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
    const written = await insertNpdWorkRows(supabase, requestId, rows);
    if (written.error) return { ...result, error: written.error };
    result.inserted = written.inserted;
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

const pairOf = (r) => `${r.categoryCode}::${r.scentId}`;
// ชนดัชนีคู่ซ้ำ (23505) · deadlock ระหว่างผู้เขียนสองคนที่รอกันบนดัชนีเดียวกัน (40P01) — ทั้งคู่แปลว่า "อีกคนเขียนอยู่"
const RACE_CODES = new Set(['23505', '40P01']);

/**
 * เขียนแถวงานชุดใหม่ — ชนดัชนีคู่ซ้ำ (mig 0356) = อีกคำขอเพิ่งงอกคู่เดียวกันไปก่อน ⇒ อ่านใหม่แล้วเติมเฉพาะที่ขาด
 *
 * ⭐ **ชนแล้วไม่ใช่ความผิดพลาดของผู้ใช้** — สองคนกดรับเรื่อง/บันทึกแบบฟอร์มพร้อมกัน ผลที่ต้องการ (ทุกคู่มีแถว)
 *    เกิดขึ้นแล้วจากอีกฝั่ง · ตอบ error = คำเตือน "กดบันทึกอีกครั้งเพื่อซ่อม" ทั้งที่ไม่มีอะไรต้องซ่อม
 * ⚠️ insert หลายแถวในคำสั่งเดียวเป็นก้อนเดียว (ชนแถวเดียว = ไม่ลงสักแถว) ⇒ ลองใหม่ได้โดยไม่ต้องไล่ว่าตัวไหนลงแล้ว
 * ⚠️ **เรียงแถวตามคู่ก่อนเขียนทุกครั้ง** (รีวิว mig 0356) — สองคนเขียนคู่ชุดเดียวกันคนละลำดับ (ลำดับมาจากแบบฟอร์ม)
 *    จะรอกันบนดัชนีจน Postgres ตัดสินเป็น deadlock · ลำดับเดียวกัน = คนหลังรอแล้วได้ 23505 ตามปกติ
 * ⚠️ วนจนกว่าจะลงหรือไม่เหลืออะไรให้เขียน — ชนทุกครั้งแปลว่ามีคู่ใหม่โผล่อย่างน้อยหนึ่ง ⇒ จบภายใน rows.length+1 รอบ
 *    (ลองแค่ครั้งเดียวไม่พอ: สามคนพร้อมกัน ครั้งที่สองก็ชนได้ ทั้งที่ทุกคู่มีแถวแล้ว)
 * @returns `{ inserted, error }` — `inserted` = แถวที่คำขอนี้เขียนจริง (ไม่รวมของอีกคำขอ)
 */
export async function insertNpdWorkRows(supabase, requestId, rows) {
  let rest = [...(rows || [])].sort((a, b) => pairOf(a).localeCompare(pairOf(b), 'en'));
  for (let round = 0; rest.length; round += 1) {
    const { error } = await supabase.from('dept_request_items').insert(rest);
    if (!error) return { inserted: rest, error: null };
    if (!RACE_CODES.has(error.code) || round >= (rows || []).length) return { inserted: [], error: error.message };

    const { data: now, error: readError } = await supabase.from('dept_request_items')
      .select('categoryCode, scentId, lineKind, sortOrder').eq('requestId', requestId);
    if (readError) return { inserted: [], error: readError.message };
    const have = new Set((now || []).filter((r) => r.lineKind === 'product_dev').map(pairOf));
    // ลำดับต่อท้ายของจริงตอนนี้ — ของเดิมคิดจากภาพก่อนอีกคำขอเขียน (เลขชนกันได้ แม้จอไม่โชว์เลขนี้)
    const last = Math.max(0, ...(now || []).map((r) => Number(r.sortOrder) || 0));
    rest = rest.filter((r) => !have.has(pairOf(r))).map((r, i) => ({ ...r, sortOrder: last + i + 1 }));
  }
  return { inserted: [], error: null };
}

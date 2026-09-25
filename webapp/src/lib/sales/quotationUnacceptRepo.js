// ── ย้อนการรับใบเสนอราคา — ส่วนที่อ่านฐาน (พรีวิวให้โมดัล) ─────────────────────────────
//
// ⭐ มติเจ้าของ 25/09: ย้อนการรับเปิดใบพี่น้องที่ "การรับใบนี้" ปิดไว้คืนสถานะเดิม (mig 0388) และโครงการที่ผูกไว้คงอยู่
//   โมดัลต้องบอกผลนี้ก่อนกด (กติกาโมดัลอนุมัติ #1223) ⇒ route ตอบ ?dryRun=1 ด้วยพรีวิวจากไฟล์นี้
// ⚠️ กติกาว่าใบไหนเปิดเป็นอะไรอยู่ที่ `siblingsReopenedByUnaccept` (quotationUnaccept.js) ที่เดียว — ไฟล์นี้แค่อ่านแถว
//   ตัวเขียนจริงคือ RPC unaccept_quotation_atomic (0388) ซึ่งคืนรายการที่เปิดจริงกลับมาให้ route ลงเธรด/audit
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { siblingsReopenedByUnaccept } from '@/lib/sales/quotationUnaccept';

// ตราอ่านผ่าน JSON path — ไม่ลาก metadata ทั้งก้อนของทุกใบในดีลมาเพื่อคีย์เดียว
// updatedAt = เวลาที่ใบถูกปิด เทียบกับ acceptedAt ของ **ใบที่ย้อน** (แถว `quote` ที่ route โหลดแล้ว) — ใบรุ่นเก่าไม่มีตรา
//   เปิดเฉพาะที่การรับใบนี้ปิด (รีวิว 25/09: ไม่อ่าน acceptedAt ของใบอื่นมาหาข้อยกเว้นอีก)
const SIBLING_COLUMNS = 'id, quoteNumber, status, approvalStatus, updatedAt, closedByAccept:metadata->closedByAccept';

/**
 * @param quote  ใบที่กำลังย้อน — แถวที่ route โหลดและผ่านด่านแล้ว (ต้องมี id · quoteNumber · dealId · acceptedAt · deal.project?)
 * @returns { quoteNumber, reopen: [...], project: { id, code, name } | null }
 * ⚠️ อ่านไม่ขึ้น = throw — พรีวิวที่บอกว่า "ไม่มีใบให้เปิด" ทั้งที่อ่านไม่ได้ คือโมดัลโกหก
 */
export async function previewQuotationUnaccept(supabase, quote) {
  const dealId = quote?.dealId || quote?.deal?.id;
  // ⚠️ ไล่ทีละหน้า (check:rowcap) — ใบของดีลเดียวไม่มีทางแตะพัน แต่ตาราง quotations โตตลอด
  const { data, error } = await fetchAllResult(() => supabase
    .from('quotations')
    .select(SIBLING_COLUMNS)
    .eq('dealId', dealId)
    .order('id', { ascending: true }));
  if (error) throw new Error(`อ่านใบเสนอราคาของดีลไม่สำเร็จ: ${error.message}`);
  const project = quote?.deal?.project || null;
  return {
    quoteNumber: quote?.quoteNumber || null,
    reopen: siblingsReopenedByUnaccept(quote, data || []),
    project: project ? { id: project.id, code: project.code || null, name: project.name || null }
      : quote?.deal?.projectId ? { id: quote.deal.projectId, code: null, name: null } : null,
  };
}

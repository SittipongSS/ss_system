// ── เขียนเหตุการณ์เอกสารลงเธรด "ทั้งสองที่" ในครั้งเดียว ─────────────────
//
// ทุก action ของ QT/SO ต้องลง 2 ที่: เธรดของ **ใบ** (คนทำใบอ่าน) และเธรดของ
// **ดีลแม่** (คนดูภาพรวมการขายอ่าน) — ถ้าปล่อยให้แต่ละ route เรียก `appendUpdate`
// เองสองครั้ง จะมีจุดที่ลืมแน่นอน (มี 8 route ที่ยิงเหตุการณ์เอกสาร)
//
// ⚠️ ไม่ throw: ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว เธรดพลาดต้องไม่ทำให้
// action ที่สำเร็จไปแล้วตอบ error (กติกาเดียวกับ appendUpdate)
import { appendUpdate } from '@/lib/master/updates';
import {
  dealDocumentUpdate, quotationActionUpdate, salesOrderActionUpdate,
} from '@/lib/sales/documentUpdates';

const BUILDER = {
  quotation: quotationActionUpdate,
  sales_order: salesOrderActionUpdate,
};

/**
 * @param docType   'quotation' | 'sales_order'
 * @param doc       แถวเอกสาร (ต้องมี id + เลขที่ + dealId ถ้าอยากให้ขึ้นดีล)
 * @param action    submit | approve | reject | withdraw | revise | accept |
 *                  unaccept | revoke | cancel | restore
 * @param opts      { reason, note, overrideReason, toRevisionNo }
 * @param docId     id ของใบที่จะลงเธรด — ระบุเองได้เมื่อเหตุการณ์ต้องลงใบ *เดิม*
 *                  (ออก Rev. สร้างใบใหม่คนละ id แต่ต้องเล่าบนใบเดิม)
 */
export async function appendDocumentEvent(supabase, {
  docType, doc, action, opts = {}, user = null, docId = null, dealId = null,
}) {
  const build = BUILDER[docType];
  if (!build || !doc) return;

  const onDoc = build(action, doc, opts);
  if (onDoc) {
    await appendUpdate(supabase, {
      entityType: docType, entityId: docId || doc.id, ...onDoc, user,
    });
  }

  // เงาบนดีลแม่ — คืน null เองสำหรับ action ที่ดีลไม่สนใจ (withdraw/restore)
  const onDeal = dealDocumentUpdate(docType, action, doc, opts);
  const deal = dealId || doc.dealId;
  if (onDeal && deal) {
    await appendUpdate(supabase, { entityType: 'deal', entityId: deal, ...onDeal, user });
  }
}

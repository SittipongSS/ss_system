// ── เขียนเหตุการณ์เอกสารลงเธรดของดีลแม่ ──────────────────────────────────
//
// ทุก action ของ QT/SO ลงเธรด **ดีลแม่** ที่เดียว (ใบไม่มีเธรดของตัวเองแล้ว —
// มติผู้ใช้ 2026-08-04 ดูเหตุผลใน lib/sales/documentUpdates.js) · ยังผ่านไฟล์นี้
// แทนที่จะให้แต่ละ route เรียก `appendUpdate` เอง เพราะมี 8 route ที่ยิงเหตุการณ์
// เอกสาร กระจายไป 8 จุดคือมีจุดที่ลืมแน่นอน
//
// ⚠️ ไม่ throw: ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว เธรดพลาดต้องไม่ทำให้
// action ที่สำเร็จไปแล้วตอบ error (กติกาเดียวกับ appendUpdate)
import { appendUpdate } from '@/lib/master/updates';
import { dealDocumentUpdate } from '@/lib/sales/documentUpdates';
import { dealRequestUpdate } from '@/lib/sales/dealUpdates';
import { askActionUpdate } from '@/lib/costingUpdates';

/**
 * @param docType   'quotation' | 'sales_order'
 * @param doc       แถวเอกสาร (ต้องมี id + เลขที่ + dealId ถ้าอยากให้ขึ้นดีล)
 * @param action    submit | approve | reject | withdraw | revise | accept |
 *                  unaccept | revoke | cancel | restore
 * @param opts      { reason, note, overrideReason, toRevisionNo }
 * @param dealId    ระบุเองได้เมื่อแถวเอกสารที่ส่งมาไม่มี `dealId` ติดมาด้วย
 */
export async function appendDocumentEvent(supabase, {
  docType, doc, action, opts = {}, user = null, dealId = null,
}) {
  if (!doc) return;

  const onDeal = dealDocumentUpdate(docType, action, doc, opts);
  const deal = dealId || doc.dealId;
  if (onDeal && deal) {
    await appendUpdate(supabase, { entityType: 'deal', entityId: deal, ...onDeal, user });
  }
}

/**
 * เหตุการณ์ของ "คำร้องข้ามฝ่าย" ลงทั้งเธรดคำร้องและเธรดดีลแม่ในครั้งเดียว
 *
 * ⭐ ใช้ไฟล์นี้ (ไม่ใช่ appendUpdate ตรง ๆ) ด้วยเหตุผลเดียวกับ QT/SO: เหตุการณ์
 * คำร้องยิงจาก 3 route (PATCH หัวเรื่อง · /answer · POST ตอนเปิด) เขียนสองที่เอง
 * ทุกจุดคือมีจุดที่ลืมแน่นอน — พลาดแล้วเธรดดีลขาดเรื่องไปเงียบ ๆ
 *
 * @param request  แถวคำร้อง (ต้องมี id · kind · dept · docNo · dealId)
 * @param action   submit | acknowledge | assign | update | pdr | reschedule |
 *                 approve | bounce | answer | close | cancel
 * @param opts     { reason, previousDueDate, assigneeName }
 *                 reason = เหตุผลตอนยกเลิก/ตีกลับ/เลื่อนวัน
 *                 previousDueDate = วันกำหนดส่ง **ก่อน** เลื่อน (route ต้องอ่านจาก
 *                 แถวเดิม เพราะแถวที่ส่งมาถูกทับไปแล้ว) — เธรดต้องบอกว่าเลื่อนจาก
 *                 วันไหนเป็นวันไหน ไม่ใช่แค่ "แก้วันแล้ว"
 *                 assigneeName = ชื่อผู้รับผิดชอบหลังมอบหมาย (null = ถอนมอบหมาย)
 * @param mentions คนที่ถูก @ ในเรื่องนี้ — **ต้องผ่าน sanitizeMentions มาแล้ว**
 *                 รูป [{ id, name }] · ลงเฉพาะแถวของเธรด **คำร้อง** (แจ้งเตือน
 *                 อ่านจาก meta.mentions ของแถวนั้น) ไม่ยกไปเธรดดีล เพราะคนที่ถูก
 *                 แท็กถูกแท็กในคำร้อง ไม่ใช่ในดีล
 * @param dealOnly ข้ามแถวของเธรดคำร้อง เขียนแค่เงาบนดีล — ใช้ตอนเธรดคำร้องเล่า
 *                 เรื่องเดียวกันละเอียดกว่าอยู่แล้ว (ตอบราคาลงเธรดคำร้องรายบรรทัด
 *                 แล้ว สรุปทับอีกบรรทัดคือเสียงซ้ำ ส่วนดีลต้องการแค่ "ตอบครบแล้ว")
 */
export async function appendRequestEvent(supabase, {
  request, action, opts = {}, user = null, mentions = [], dealOnly = false,
}) {
  if (!request) return;

  const onRequest = dealOnly ? null : askActionUpdate(action, request, opts);
  if (onRequest) {
    // รูปของ meta ต้องตรงกับที่ POST /api/updates เขียน (ids + ชื่อ ณ ตอนพิมพ์)
    // ไม่งั้นแจ้งเตือนออกแต่ตัวไฮไลต์ในข้อความหาชื่อไม่เจอ
    const meta = mentions.length
      ? {
        ...onRequest.meta,
        mentions: mentions.map((m) => m.id),
        mentionNames: mentions.map((m) => m.name).filter(Boolean),
      }
      : onRequest.meta;
    await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: request.id, ...onRequest, meta, user,
    });
  }

  // เงาบนดีล — พาดหัวอย่างเดียว ดูเหตุผลใน dealRequestUpdate
  const onDeal = dealRequestUpdate(action, request, opts);
  if (onDeal && request.dealId) {
    await appendUpdate(supabase, {
      entityType: 'deal', entityId: request.dealId, ...onDeal, user,
    });
  }
}

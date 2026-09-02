// ── ใบ external ใบไหน "แนบเอกสารแทนสัญญาแล้ว" ───────────────────────────────
//
// ⭐ **คำถามนี้ตอบจากแถวสัญญาไม่ได้** — `sales_contracts.signedFileId` ถูกเซ็ตตอน
//   *อนุมัติ* เท่านั้น (RPC `approve_external_sales_contract`) ส่วนช่วงที่ใบยังเป็นร่าง
//   ไฟล์อยู่ในตาราง `attachments` ล้วน ⇒ ต้องถามอีกตารางหนึ่ง
//
// ⭐ **มีไว้เพื่อชี้คิวให้ถูกคน** — ใบ external ร่างสลับเจ้าของงานตอนแนบไฟล์:
//   ก่อนแนบเป็นงานของเจ้าของใบ (ไปเอาเอกสารจากลูกค้ามา) หลังแนบเป็นงานของ AE Supervisor
//   (อ่านแล้วอนุมัติ) · ก่อนหน้านี้ทั้งสองช่วงตกอยู่เลนเจ้าของ ⇒ ขั้นอนุมัติของสายนี้
//   ไม่มีคิวรองรับเลยทั้งเส้น
//
// ⚠️ **คิวรีเพิ่มต้องแคบเสมอ** — ตัวนับป้ายบนเมนูยิงทุก 2 นาทีทุกคน ⇒ ถามเฉพาะเมื่อ
//   (ก) มีใบ external ที่เป็นร่างจริง ๆ และ (ข) คนที่ถามเป็นคนที่กดอนุมัติได้
//   ไม่งั้นคืนชุดว่างโดยไม่แตะฐานเลย
//
// ⚠️ ไฟล์นี้เป็นฝั่ง server เท่านั้น (รับ `supabase`) — ตัวตัดสินที่จอใช้ร่วมอยู่ที่
//   `contracts.js` ตามเดิม ที่นี่แค่หาข้อมูลมาป้อนให้มัน
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { EXTERNAL_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { canApproveExternalContract, isExternalContract } from '@/lib/sales/contracts';

/**
 * id ของใบ external ที่เป็นร่างและ **แนบเอกสารแทนสัญญาไว้แล้ว**
 *
 * @returns {Promise<Set<string>>} ว่างเสมอเมื่อไม่มีใบที่ต้องถาม หรือผู้ใช้ไม่ใช่ผู้อนุมัติ
 */
export async function externalDocReadyIds(supabase, rows = [], user = null) {
  if (!canApproveExternalContract(user)) return new Set();
  const ids = (rows || [])
    .filter((row) => isExternalContract(row) && row?.status === 'draft' && row?.id)
    .map((row) => row.id);
  if (!ids.length) return new Set();

  /* ใช้ index `attachments_entity_idx` (entityType, entityId) ที่มีอยู่แล้ว (mig 0028)
     ⚠️ ห่อ `fetchAllResult` ตามกติกา check:rowcap — ในทางปฏิบัติได้หน้าเดียวเสมอ
        (ใบ external ที่เป็นร่างพร้อมกันมีหลักหน่วย) แต่ `attachments` เป็นตารางที่โตได้
        และ PostgREST ตัดที่ 1000 แถวเงียบ ๆ ⇒ ไม่มีเหตุให้ยกเว้น
     ⚠️ ลำดับต้องจบด้วยคีย์ที่ไม่ซ้ำ (`id`) ไม่งั้นหน้าซ้อนกันตอนไล่หน้า
     ⚠️ ไม่บล็อกถ้าอ่านไม่ได้ — ป้ายตัวเลขที่ขาดไปดีกว่าเมนูที่พังทั้งแถบ */
  const { data, error } = await fetchAllResult(() => supabase
    .from('attachments')
    .select('"entityId"')
    .eq('entityType', 'contract')
    .eq('docType', EXTERNAL_DOC_TYPE)
    .in('entityId', ids)
    .order('id', { ascending: true }));
  if (error) return new Set();
  return new Set((data || []).map((row) => row.entityId));
}

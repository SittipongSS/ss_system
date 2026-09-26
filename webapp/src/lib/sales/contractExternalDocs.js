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
//   (ก) มีใบ external ที่เป็นร่างจริง ๆ และ (ข) ใบนั้นเลนของคนที่ถามพลิกได้ด้วยคำตอบ:
//   คนที่กดอนุมัติได้ = ทุกใบ · คนอื่น = เฉพาะใบที่ตัวเองเป็นเจ้าของ/คนสร้าง (`laneAsksAbout`)
//   ไม่งั้นคืนชุดว่างโดยไม่แตะฐานเลย
// ⭐ **เจ้าของใบต้องได้คำตอบด้วย** (รีวิว 25/09) — ของเดิมถามให้ผู้อนุมัติอย่างเดียว ⇒ ร่างที่แนบ
//   เอกสารแล้วยังค้างเลน "งานที่ค้างอยู่กับคุณ" + ป้ายเมนูของเจ้าของใบ ทั้งที่รางบนแถวเดียวกัน
//   บอก "รอ AE Supervisor อนุมัติ" (ไม่มีอะไรให้เจ้าของทำแล้ว) · ตอนนี้ `isContractWaitingOnMe`
//   ได้ `externalDocReady: true` ⇒ คืน `canApproveExternalContract` = false สำหรับเจ้าของ ⇒ หลุดเลน
//   ⚠️ ตัวนับป้ายกับทะเบียนต้องใช้กติกานี้ **ทั้งคู่** — ใช้คนละชุดแล้วป้ายกับรายการนับไม่ตรงกัน
//
// ⚠️ ไฟล์นี้เป็นฝั่ง server เท่านั้น (รับ `supabase`) — ตัวตัดสินที่จอใช้ร่วมอยู่ที่
//   `contracts.js` ตามเดิม ที่นี่แค่หาข้อมูลมาป้อนให้มัน
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { EXTERNAL_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { canApproveExternalContract, isExternalContract, isSubstituteContract } from '@/lib/sales/contracts';

/**
 * id ของใบ external ที่เป็นร่างและ **แนบเอกสารแทนสัญญาไว้แล้ว**
 *
 * @param {{ strict?: boolean, anyViewer?: boolean }} [options] `strict: true` ⇒ อ่านไม่สำเร็จให้ **โยน** error
 *   (ใช้กับตัวนับป้าย — ADR 0016: ป้ายที่ลดลงเงียบ ๆ แย่กว่าป้ายที่ขึ้นขีดว่านับไม่สำเร็จ)
 * @returns {Promise<Set<string>>} ว่างเสมอเมื่อไม่มีใบที่ต้องถาม หรือผู้ใช้ไม่ใช่ผู้อนุมัติ
 */
/* ⭐ `anyViewer` — ถามโดยไม่ดูว่าคนเปิดเป็นผู้อนุมัติไหม (2026-09-15)
   ใช้กับที่ที่ต้อง **แสดง** ว่าใบแนบเอกสารแล้ว (รางบนการ์ดสัญญาของดีล/ใบสั่งขาย ·
   ตัวทวงผู้อนุมัติใน cron) ไม่ใช่ที่ที่ตัดสินเลนคิว
   ⚠️ **ตัวนับป้ายบนเมนูห้ามเปิดธงนี้** — ยิงทุก 2 นาทีทุกคน ด่านผู้อนุมัติคือสิ่งที่ทำให้
      คนส่วนใหญ่ไม่เกิดคิวรีเลย (มีเทสต์ล็อกไว้) */
export async function externalDocReadyIds(supabase, rows = [], user = null, { strict = false, anyViewer = false } = {}) {
  const approver = canApproveExternalContract(user);
  /* ⚠️ เอกสารแทนสัญญาของใบสั่งขายย้อนหลังไม่ต้องถาม — `isContractWaitingOnMe` ตัดมันออกจากทุกเลนอยู่แล้ว
     (งานของคิวใบสั่งขาย · 0374) ⇒ ถามไปก็ได้คำตอบที่ไม่มีใครใช้ · ต้องมี `metadata` ในแถวถึงจะตัดได้ */
  const ids = (rows || [])
    .filter((row) => isExternalContract(row) && row?.status === 'draft' && row?.id && !isSubstituteContract(row))
    .filter((row) => anyViewer || laneAsksAbout(row, user, approver))
    .map((row) => row.id);
  if (!ids.length) return new Set();

  /* ใช้ index `attachments_entity_idx` (entityType, entityId) ที่มีอยู่แล้ว (mig 0028)
     ⚠️ ห่อ `fetchAllResult` ตามกติกา check:rowcap — ในทางปฏิบัติได้หน้าเดียวเสมอ
        (ใบ external ที่เป็นร่างพร้อมกันมีหลักหน่วย) แต่ `attachments` เป็นตารางที่โตได้
        และ PostgREST ตัดที่ 1000 แถวเงียบ ๆ ⇒ ไม่มีเหตุให้ยกเว้น
     ⚠️ ลำดับต้องจบด้วยคีย์ที่ไม่ซ้ำ (`id`) ไม่งั้นหน้าซ้อนกันตอนไล่หน้า
     ⚠️ ทะเบียน (`/api/sales-planning/contracts`) ไม่บล็อกถ้าอ่านไม่ได้ — หน้าที่ยังเปิดได้
        ดีกว่าหน้าที่ 500 ทั้งหน้า · แต่ **ตัวนับป้ายส่ง `strict: true`** เพราะชุดว่างที่นี่
        แปลว่า "ทุกใบยังไม่แนบเอกสาร" ⇒ ใบของ AE Sup ถูกโยนกลับเข้าเลนเจ้าของใบ
        ป้ายจึงลดลงเงียบ ๆ โดยที่ `attempt()` ไม่รู้ว่ามีอะไรพัง (ADR 0016) */
  const { data, error } = await fetchAllResult(() => supabase
    .from('attachments')
    .select('"entityId"')
    .eq('entityType', 'contract')
    .eq('docType', EXTERNAL_DOC_TYPE)
    .in('entityId', ids)
    .order('id', { ascending: true }));
  if (error) {
    if (strict) throw error;
    return new Set();
  }
  return new Set((data || []).map((row) => row.entityId));
}

/* ใบไหนที่คำตอบ "แนบแล้ว" พลิกเลนของคนดูได้ — ผู้อนุมัติ: ทุกใบ · คนอื่น: ใบของตัวเอง (เจ้าของ/คนสร้าง)
   ⚠️ ตรงกับเลนเจ้าของใน `isContractWaitingOnMe` (`ownerId`/`createdBy`) — ขยับที่หนึ่งต้องขยับอีกที่ */
function laneAsksAbout(row, user, approver = canApproveExternalContract(user)) {
  if (approver) return true;
  const me = user?.id || '';
  return !!me && (row?.ownerId === me || row?.createdBy === me);
}

/**
 * ชุดสำหรับ **ตัดสินเลน** จากชุด "แนบแล้ว" ที่ถามแบบ `anyViewer` มาแล้ว — ไม่แตะฐานซ้ำ
 * (ทะเบียนถามครั้งเดียวใช้สองเรื่อง: รางของทุกแถว + เลนของคนดู) · ผลเท่ากับเรียก
 * `externalDocReadyIds(supabase, rows, user)` แบบไม่เปิดธงเป๊ะ ⇒ ป้ายเมนูกับรายการนับตรงกัน
 */
export function externalDocLaneIds(rows = [], attachedIds = new Set(), user = null) {
  const approver = canApproveExternalContract(user);
  return new Set((rows || [])
    .filter((row) => row?.id && attachedIds.has(row.id) && laneAsksAbout(row, user, approver))
    .map((row) => row.id));
}

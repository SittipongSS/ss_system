// ── ไล่ปิดร่างสัญญาตามใบเสนอราคาที่ถูกปิด + แจ้งเตือนคนที่ถือใบ ─────────────────
//
// ⭐ มติผู้ใช้ 2026-08-22: ร่างปิดตาม · ใบที่ออกเลขแล้วแค่เตือน
//
// ⚠️ **เรียกได้สองจังหวะโดยตั้งใจ**
//    1. ตอนที่ใบเสนอราคาถูกปิดจริง (route ที่เราคุมเอง เช่นออก Rev.) — คนเห็นผลทันที
//    2. ตอนเปิดทะเบียนสัญญา (lazy) — เพราะสถานะใบเสนอราคาเปลี่ยนได้จากทางที่โค้ดนี้
//       ไม่ได้ถือมีดด้วย (RPC ของ accept/won · แก้มือบน SQL Editor) ⇒ ถ้าไล่ปิดเฉพาะ
//       ทางที่ 1 จะมีร่างค้างที่ไม่มีวันปิดโดยไม่มีใครรู้
//    ทั้งสองทางเรียกฟังก์ชันเดียวกัน และซ้ำได้ไม่เสียหาย (idempotent)
import { notifyUsers } from '@/lib/notifications';
import {
  closureCancelReason, contractFollowsQuotationClosure, quotationClosure,
} from '@/lib/sales/contractQuotationState';

const CONTRACT_COLUMNS = 'id, "contractNo", status, "dealId", "quotationId", "ownerId", "ownerName", "createdBy", "customerName", kind';

/* ปิดร่าง + แจ้งเตือนสำหรับใบเสนอราคา *ใบเดียว*
   คืน { cancelled, warned } — ตัวเรียกเอาไปเขียน log/audit ต่อได้ ไม่ต้องเดาว่าเกิดอะไร */
export async function syncContractsForQuotation(supabase, { quotation, actor = null } = {}) {
  const closure = quotationClosure(quotation);
  if (!quotation?.id || !closure) return { cancelled: [], warned: [] };

  const { data: contracts, error } = await supabase
    .from('sales_contracts').select(CONTRACT_COLUMNS)
    .eq('quotationId', quotation.id)
    .neq('status', 'cancelled');
  if (error || !contracts?.length) return { cancelled: [], warned: [] };

  const followers = contracts.filter(contractFollowsQuotationClosure);
  const kept = contracts.filter((row) => !contractFollowsQuotationClosure(row));

  if (followers.length) {
    const now = new Date().toISOString();
    const { error: cancelError } = await supabase
      .from('sales_contracts')
      .update({
        status: 'cancelled',
        cancelReason: closureCancelReason(quotation),
        cancelledAt: now,
        updatedAt: now,
      })
      // ⚠️ ย้ำเงื่อนไข "ยังเป็นร่าง" ที่คำสั่ง update ด้วย — ระหว่างที่อ่านมา อาจมีคนกดออกเลข
      //    ไปแล้ว ใบที่ออกเลขแล้วห้ามถูกยกเลิกโดยตัวไล่ปิดเด็ดขาด
      .in('id', followers.map((row) => row.id))
      .eq('status', 'draft')
      .is('contractNo', null);
    if (cancelError) return { cancelled: [], warned: [] };
  }

  await Promise.all([...followers, ...kept].map((contract) => notifyUsers(supabase, {
    userIds: [contract.ownerId, contract.createdBy].filter(Boolean),
    entityType: 'sales_contract',
    entityId: contract.id,
    kind: 'contract_quotation_closed',
    title: contractFollowsQuotationClosure(contract)
      ? `ร่างสัญญาถูกยกเลิกตามใบเสนอราคา ${quotation.quoteNumber || ''}`.trim()
      : `ใบเสนอราคาของสัญญา ${contract.contractNo || ''} ${closure.label}`.trim(),
    body: contractFollowsQuotationClosure(contract)
      ? `${closure.label} — ร่างสัญญาของ ${contract.customerName || 'ลูกค้า'} จึงถูกยกเลิกตาม`
      : `สัญญาใบนี้ออกเลขแล้ว ระบบไม่ยกเลิกให้ — ตรวจแล้วตัดสินใจเองว่าจะยกเลิกหรือออกฉบับแก้ไข`,
    actorName: actor?.name || null,
    // ⚠️ กันแจ้งซ้ำทุกครั้งที่มีคนเปิดทะเบียน — หนึ่งใบเสนอราคา : หนึ่งสัญญา : หนึ่งแจ้งเตือน
    dedupeKey: `QTCLOSE-${quotation.id}-${contract.id}`,
  })));

  return { cancelled: followers.map((row) => row.id), warned: kept.map((row) => row.id) };
}

/* ใช้กับทะเบียน: รับสัญญาที่โหลดมาแล้ว ไปดูใบเสนอราคาของมันทีเดียว แล้วไล่ปิดที่ต้องปิด
   คืน Map ของ quotationId → ใบเสนอราคา เพื่อให้ตัวเรียกแปะสถานะลงแถวได้โดยไม่ต้องอ่านซ้ำ */
export async function syncContractsAgainstQuotations(supabase, contracts = [], { actor = null } = {}) {
  const ids = [...new Set((contracts || []).map((row) => row.quotationId).filter(Boolean))];
  if (!ids.length) return { quotationById: new Map(), cancelledIds: new Set() };

  const { data: quotations, error } = await supabase
    .from('quotations').select('id, "quoteNumber", status, "approvalStatus", "approvedAt", "createdAt"')
    .in('id', ids);
  if (error) return { quotationById: new Map(), cancelledIds: new Set() };

  const quotationById = new Map((quotations || []).map((row) => [row.id, row]));
  const cancelledIds = new Set();
  const closed = (quotations || []).filter((row) => quotationClosure(row));
  for (const quotation of closed) {
    const affected = (contracts || []).filter((row) => row.quotationId === quotation.id);
    if (!affected.some(contractFollowsQuotationClosure)) continue;
    // ทีละใบ ไม่ขนาน — ใบเสนอราคาที่ถูกปิดพร้อมกันหลายใบเป็นเรื่องผิดปกติอยู่แล้ว
    const result = await syncContractsForQuotation(supabase, { quotation, actor });
    result.cancelled.forEach((id) => cancelledIds.add(id));
  }
  return { quotationById, cancelledIds };
}

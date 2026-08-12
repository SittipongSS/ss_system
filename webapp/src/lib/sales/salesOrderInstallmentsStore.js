// ── ที่เก็บงวดชำระของใบสั่งขาย (mig 0245) — ฝั่ง server เท่านั้น ─────────
//
// logic ล้วนอยู่ที่ `salesOrderPayments.js` (มีเทสต์) · ไฟล์นี้แตะ DB อย่างเดียว
// เพื่อให้ด่าน/การคำนวณทดสอบได้โดยไม่ต้องมีฐานข้อมูล
import { genId } from '@/lib/id';
import { buildInstallmentsForOrder } from '@/lib/sales/salesOrderPayments';

const TABLE = 'sales_order_installments';

export async function loadInstallments(supabase, salesOrderId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('salesOrderId', salesOrderId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * สร้างงวดจากแผนชำระของ QT ต้นทาง — **idempotent**
 *
 * ⚠️ กันซ้ำด้วย unique index `(salesOrderId, seq)` ที่ระดับ DB ไม่ใช่พึ่งการเช็คก่อน insert
 * (ระหว่าง "เช็คว่าว่าง" กับ "insert" มีช่องให้กดสองครั้งพร้อมกันเสมอ)
 * ⇒ ชนแล้วถือว่าสำเร็จ คืนของที่มีอยู่
 *
 * ใช้สองทาง: อัตโนมัติตอนอนุมัติใบ · และปุ่ม "เริ่มติดตามการชำระ" สำหรับใบเก่า
 */
export async function ensureInstallments(supabase, { order, user, now = null }) {
  const existing = await loadInstallments(supabase, order.id);
  if (existing.length) return { rows: existing, created: false };

  const rows = buildInstallmentsForOrder(
    order.quotation?.paymentPlan,
    order.totalAmount,
    {
      // หลักฐานตอนปิด Won ของ QT ต้นทาง — ยืมมาตั้งงวดแรกเมื่อปิดด้วยสลิปโอนเงิน
      wonEvidence: order.quotation
        ? {
          docType: order.quotation.wonDocType,
          docDate: order.quotation.wonDocDate,
          attachments: order.quotation.wonAttachments,
        }
        : null,
      actor: { id: user?.id || null, name: user?.name || user?.email || null },
      now,
    },
  );
  if (!rows.length) return { rows: [], created: false };

  const payload = rows.map((row) => ({
    id: genId('SOI'),
    salesOrderId: order.id,
    seq: row.seq,
    label: row.label,
    percent: row.percent,
    amount: row.amount,
    status: row.status || 'pending',
    paidOn: row.paidOn || null,
    reportedAt: row.reportedAt || null,
    reportedById: row.reportedById || null,
    reportedByName: row.reportedByName || null,
    evidence: row.evidence || [],
    note: row.note || null,
    createdById: user?.id || null,
    createdByName: user?.name || user?.email || null,
  }));

  const { data, error } = await supabase.from(TABLE).insert(payload).select('*');
  if (error) {
    // 23505 = unique violation ⇒ อีกคำขอสร้างไปแล้ว ไม่ใช่ความผิดพลาดที่ต้องแจ้งผู้ใช้
    if (error.code === '23505') {
      return { rows: await loadInstallments(supabase, order.id), created: false };
    }
    throw error;
  }
  return { rows: (data || []).sort((a, b) => a.seq - b.seq), created: true };
}

/** อัปเดตงวดเดียว — คืนแถวหลังอัปเดต */
export async function updateInstallment(supabase, id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadInstallment(supabase, id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

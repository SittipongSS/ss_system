// ── ที่เก็บงวดชำระของใบสั่งขาย (mig 0245) — ฝั่ง server เท่านั้น ─────────
//
// logic ล้วนอยู่ที่ `salesOrderPayments.js` (มีเทสต์) · ไฟล์นี้แตะ DB อย่างเดียว
// เพื่อให้ด่าน/การคำนวณทดสอบได้โดยไม่ต้องมีฐานข้อมูล
import { genId } from '@/lib/id';
import {
  buildInstallmentsForOrder, installmentsFromPaymentPlan, isInstallmentFrozen,
} from '@/lib/sales/salesOrderPayments';

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
 * ใช้สี่ทาง: **อัตโนมัติตอนออกใบจาก QT** (มติผู้ใช้ 2026-08-19 — ทางปกติ) · ปุ่ม
 * "เริ่มติดตามการชำระ" ที่เหลือเป็นทางกู้เมื่อตอนออกใบยังไม่มีแผนชำระหรือสร้างไม่สำเร็จ ·
 * ปุ่มเดียวกันบนใบเก่าที่อนุมัติไปก่อนมีระบบนี้ · และตอนอนุมัติใบสำหรับใบที่ยังไม่มีแถว
 *
 * ⚠️ แถวที่สร้างโดยไม่ส่ง `frozenAt` **ยังไม่ freeze** — ยอดยังเดินตามแผนของ QT
 * จนกว่าจะอนุมัติ (`freezeInstallments`) · ที่เขียนยอดลงไปเลยเพราะคอลัมน์เป็น NOT NULL
 * ส่วนตัวที่ผู้ใช้เห็นจริงมาจาก `withLiveAmounts` ที่ทับให้ตอนอ่าน
 *
 * 🐞 **หลักฐาน Won ยืมมาได้เฉพาะตอน freeze** — `buildInstallmentsForOrder` ตั้งงวดแรก
 * เป็น `reported` เมื่อ QT ปิดด้วยสลิป · แถวนั้นบนงวดร่างจะชน CHECK
 * `sales_order_installments_draft_pending` ของ 0259 (ไม่ freeze = ต้อง pending)
 * ⇒ ส่ง `frozenAt` มาด้วยเมื่อไร ถึงจะยืมหลักฐานได้ · ไม่งั้นได้แถว pending ล้วน
 * แล้ว `freezeInstallments` ไปยืมให้ทีหลังตอนอนุมัติ (เจตนาเดิมของมติ 2026-08-13 คงอยู่)
 */
export async function ensureInstallments(supabase, { order, user, now = null, frozenAt = null }) {
  const existing = await loadInstallments(supabase, order.id);
  if (existing.length) return { rows: existing, created: false };

  const rows = buildInstallmentsForOrder(
    order.quotation?.paymentPlan,
    order.totalAmount,
    {
      // หลักฐานตอนปิด Won ของ QT ต้นทาง — ยืมมาตั้งงวดแรกเมื่อปิดด้วยสลิปโอนเงิน
      wonEvidence: frozenAt && order.quotation
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
    ...(frozenAt ? { frozenAt } : {}),
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

/**
 * หยุดยอดของงวดทั้งใบ — เรียกตอน **อนุมัติใบ** เท่านั้น (B-4 · mig 0259)
 *
 * ⭐ นี่คือจุดที่เหตุผลเดิมของ 0245 ย้ายมาอยู่: ยอดต่องวดถูกเขียนทับ **ครั้งสุดท้าย**
 * จากแผนของ QT + ยอดจริงของใบ ณ วินาทีที่อนุมัติ แล้วประทับ `frozenAt`
 * ⇒ ไม่มีทาง drift เพราะทุกครั้งที่อนุมัติจะทับใหม่เสมอ
 *
 * ⚠️ **จำนวนงวดต่างกันแก้ด้วยการทับยอดไม่ได้** — QT ถูกแก้หลังกด "เริ่มติดตาม" ได้
 * ⇒ ตั้งใหม่ทั้งชุด (ลบของเดิมแล้วสร้างจากแผนล่าสุด) · ปลอดภัยเพราะงวดที่ยังไม่
 * freeze **บังคับเป็น `pending` โดย CHECK ของ 0259** จึงไม่มีหลักฐานหรือคำแจ้งให้ทำหาย
 * ⚠️ แลกกับ `dueDate` ที่ SA กรอกไว้ — จอเตือนไว้ก่อนแล้ว (`installmentPlanDrift`)
 *
 * ⚠️ **idempotent** — อนุมัติซ้ำ/กู้ธงที่ล้ม เรียกซ้ำได้ แถวที่ freeze แล้วไม่ถูกแตะ
 */
export async function freezeInstallments(supabase, { order, user, now = null }) {
  const existing = await loadInstallments(supabase, order.id);
  const stamp = now || new Date().toISOString();

  // freeze ไปแล้วทั้งชุด = อนุมัติซ้ำ ไม่ต้องทำอะไร (ยอดที่เซ็นไปแล้วห้ามขยับ)
  if (existing.length && existing.every(isInstallmentFrozen)) {
    return { rows: existing, frozen: false };
  }

  const plan = installmentsFromPaymentPlan(order.quotation?.paymentPlan, order.totalAmount);
  const draft = existing.filter((row) => !isInstallmentFrozen(row));

  // จำนวนไม่ตรงแผนล่าสุด ⇒ ตั้งใหม่ทั้งชุด (ดูเหตุผลข้างบน)
  if (draft.length && plan.length && draft.length !== plan.length) {
    const { error } = await supabase.from(TABLE).delete().in('id', draft.map((r) => r.id));
    if (error) throw error;
    const seeded = await ensureInstallments(supabase, { order, user, now: stamp, frozenAt: stamp });
    return { rows: seeded.rows, frozen: true };
  }

  // ยังไม่เคยกด "เริ่มติดตาม" — สร้างให้ตอนอนุมัติเหมือนพฤติกรรมเดิมของ 0245
  if (!existing.length) {
    const seeded = await ensureInstallments(supabase, { order, user, now: stamp, frozenAt: stamp });
    return { rows: seeded.rows, frozen: !!seeded.rows.length };
  }

  /* จำนวนตรงกัน — ทับยอด/สัดส่วน/ป้ายรายแถว แล้วประทับ frozenAt
     ⭐ **ยืมหลักฐาน Won ตรงนี้ด้วย** — งวดร่างเป็น `pending` ล้วนเสมอ (CHECK ของ 0259)
     ⇒ ใบที่ SA กด "เริ่มติดตาม" ไว้ก่อน ต้องได้งวดแรกเป็น `reported` พร้อมสลิปจากตอน
     ปิด Won เหมือนใบที่ไม่เคยกด ไม่งั้นการกดปุ่มเร็วกลายเป็นการเสียสิทธิ์ */
  const bySeq = new Map(plan.map((row) => [row.seq, row]));
  const seeded = buildInstallmentsForOrder(order.quotation?.paymentPlan, order.totalAmount, {
    wonEvidence: order.quotation ? {
      docType: order.quotation.wonDocType,
      docDate: order.quotation.wonDocDate,
      attachments: order.quotation.wonAttachments,
    } : null,
    actor: { id: user?.id || null, name: user?.name || user?.email || null },
    now: stamp,
  });
  const seedBySeq = new Map(seeded.filter((r) => r.status === 'reported').map((r) => [r.seq, r]));

  for (const row of draft) {
    const fresh = bySeq.get(row.seq);
    // ⚠️ ยืมให้เฉพาะแถวที่ยังไม่มีใครแตะ — SA แจ้งเองไว้แล้วต้องไม่ถูกทับ
    const seed = row.status === 'pending' ? seedBySeq.get(row.seq) : null;
    const { error } = await supabase.from(TABLE).update({
      ...(fresh ? { percent: fresh.percent, amount: fresh.amount, label: fresh.label } : {}),
      ...(seed ? {
        status: 'reported',
        paidOn: seed.paidOn,
        reportedAt: seed.reportedAt,
        reportedById: seed.reportedById,
        reportedByName: seed.reportedByName,
        evidence: seed.evidence,
        note: row.note || seed.note,
      } : {}),
      frozenAt: stamp,
      updatedAt: stamp,
    }).eq('id', row.id);
    if (error) throw error;
  }
  return { rows: await loadInstallments(supabase, order.id), frozen: draft.length > 0 };
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

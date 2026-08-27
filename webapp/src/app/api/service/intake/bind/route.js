// ── ผูกบรรทัดใบสั่งขายเข้ากับโซน (เฟส 4) ─────────────────────────────────
//
// ⭐ นี่คือ **สะพานเส้นเดียว** ระหว่างฝ่ายขายกับฝ่ายบริการ: 1 บรรทัด = 1 รอบขาย
//   ที่ผูกโซนหนึ่งโซน · ต่อสัญญา = ใบใหม่ผูกโซนเดิม (โซนไม่เกิดใหม่ ประวัติต่อเนื่อง)
//
// ⚠️ **รับทั้งใบในคำขอเดียว** ไม่ใช่ยิงทีละบรรทัด — คนกรอกจับคู่ทั้งใบแล้วกดครั้งเดียว
//   ถ้าปล่อยให้ยิงทีละบรรทัด ใบที่ล้มกลางทางจะเหลือครึ่งผูกครึ่งไม่ผูก แล้วคิวจะโชว์
//   ใบเดิมซ้ำโดยที่คนกรอกไม่รู้ว่าอันไหนเข้าไปแล้ว
//
// ⚠️ ตรวจก่อนเขียนทั้งชุด: ใบต้องอนุมัติ · บรรทัดต้องเป็นของใบนั้นจริง · โซนต้องมีอยู่
//   · บรรทัดต้องยังไม่ถูกผูก (UNIQUE ที่ DB เป็นด่านสุดท้าย ไม่ใช่ด่านแรก —
//   ข้อความ 23505 ดิบ ๆ ไม่บอกผู้ใช้ว่าบรรทัดไหน)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { requireService } from '@/lib/service/sitesRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { normalizeTermInput, termSnapshotFromLine } from '@/lib/service/terms';
import { orderReceivable } from '@/lib/service/intake';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const salesOrderId = String(body.salesOrderId ?? '').trim();
  const rows = Array.isArray(body.bindings) ? body.bindings : [];
  if (!salesOrderId) return badRequest('ต้องระบุใบสั่งขาย');
  if (!rows.length) return badRequest('ยังไม่ได้จับคู่บรรทัดไหนกับโซน');

  try {
    const { data: order, error: orderError } = await supabase
      .from('sales_orders').select('id, "orderNumber", status, supersededById, customerId, customerName')
      .eq('id', salesOrderId).maybeSingle();
    if (orderError) return fail(orderError.message, 500);
    if (!order) return notFound('ไม่พบใบสั่งขาย');
    /* ⚠️ ด่านเดียวกับที่คิวใช้กรอง — ถ้าที่นี่หลวมกว่า คนจะผูกใบที่ยังไม่อนุมัติได้
       ด้วยการยิงตรง แล้ว snapshot ที่ก๊อปไปจะเป็นยอดที่ยังขยับได้ */
    if (!orderReceivable(order)) {
      return conflict('ใบสั่งขายนี้ยังไม่อนุมัติ หรือถูกออกฉบับแก้ทับแล้ว — ผูกโซนไม่ได้');
    }

    const { data: lines, error: lineError } = await supabase
      .from('sales_order_lines')
      .select('id, salesOrderId, productId, fgCode, description, qty, unit')
      .eq('salesOrderId', salesOrderId);
    if (lineError) return fail(lineError.message, 500);
    const linesById = new Map((lines || []).map((l) => [l.id, l]));

    const zoneIds = [...new Set(rows.map((r) => String(r.zoneId ?? '').trim()).filter(Boolean))];
    const { data: zones, error: zoneError } = zoneIds.length
      ? await supabase.from('service_zones').select('id, name, siteId').in('id', zoneIds)
      : { data: [], error: null };
    if (zoneError) return fail(zoneError.message, 500);
    const zonesById = new Map((zones || []).map((z) => [z.id, z]));

    const taken = new Set((await loadTerms(supabase)).map((t) => t.salesOrderLineId));
    const seen = new Set();
    const payload = [];

    for (const row of rows) {
      const lineId = String(row.salesOrderLineId ?? '').trim();
      const line = linesById.get(lineId);
      if (!line) return badRequest('มีบรรทัดที่ไม่ได้อยู่ในใบสั่งขายใบนี้');
      if (seen.has(lineId)) return badRequest(`บรรทัด ${line.fgCode || line.description || lineId} ถูกจับคู่ซ้ำในคำขอเดียวกัน`);
      seen.add(lineId);
      if (taken.has(lineId)) {
        return conflict(`บรรทัด ${line.fgCode || line.description || lineId} ถูกผูกกับโซนไปแล้ว — เปิดหน้าโซนเพื่อดูรอบที่มีอยู่`);
      }
      const zone = zonesById.get(String(row.zoneId ?? '').trim());
      if (!zone) return badRequest('มีโซนที่ไม่พบในทะเบียน — สร้างโซนก่อนแล้วค่อยผูก');

      /* snapshot มาจาก **แถวจริงใน DB** ไม่ใช่จาก body — เชื่อค่าที่จอส่งมาเมื่อไร
         ก็ผูกยอดที่ไม่ตรงกับใบได้ทันที (แพตเทิร์นเดียวกับ closeFromAssets) */
      const snapshot = termSnapshotFromLine(line);
      const { value, error } = normalizeTermInput({
        ...snapshot,
        ...row,
        salesOrderId,
        salesOrderLineId: lineId,
        // จำนวนแพ็คมาจากบรรทัดขายเสมอ — ช่องนี้บนจอเป็นตัวอ่านอย่างเดียว
        packageQty: snapshot.packageQty,
        productId: snapshot.productId,
        fgCode: snapshot.fgCode,
        description: snapshot.description,
        unit: snapshot.unit,
      });
      if (error) return badRequest(error);

      payload.push({
        id: genId('SZT'),
        ...value,
        createdById: user.id ? String(user.id) : null,
        createdByName: user.name || null,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('service_zone_terms').insert(payload).select();
    if (insertError) {
      // 23505 = UNIQUE ของ salesOrderLineId — มีคนผูกบรรทัดเดียวกันแทรกเข้ามาก่อน
      if (insertError.code === '23505') {
        return conflict('มีบรรทัดที่เพิ่งถูกผูกโดยคนอื่น — โหลดคิวใหม่แล้วลองอีกครั้ง');
      }
      return fail(insertError.message, 500);
    }

    await recordAudit({
      user, action: 'create', entityType: 'service_zone_term', entityId: salesOrderId,
      after: { salesOrderId, count: payload.length },
      summary: `ผูก ${payload.length} บรรทัดของใบสั่งขาย ${order.orderNumber || salesOrderId} เข้ากับโซนบริการ`,
      request: req,
    });

    return ok({ terms: inserted || [] }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});

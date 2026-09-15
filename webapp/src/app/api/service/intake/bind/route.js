// ── ผูกบรรทัดใบสั่งขายเข้ากับโซน (เฟส 4) ─────────────────────────────────
//
// ⭐ นี่คือ **สะพานเส้นเดียว** ระหว่างฝ่ายขายกับฝ่ายบริการ
//   ต่อสัญญา = ใบใหม่ผูกโซนเดิม (โซนไม่เกิดใหม่ ประวัติต่อเนื่อง)
//
// ⭐ **จัดสรรได้ ไม่ใช่จับคู่** (mig 0312 · มติผู้ใช้ 2026-08-29)
//   > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*
//   บรรทัดเดียวแบ่งลงได้หลายโซน โซนละกี่หน่วยก็ได้ · `packageQty` ของ term =
//   **จำนวนที่ลงโซนนั้น** ไม่ใช่จำนวนทั้งบรรทัด
//
// ⚠️ **ผลรวมห้ามเกินจำนวนในบรรทัด** และต้องนับ **ของที่จัดสรรไปแล้วรอบก่อน** ด้วย
//   (จัดสรรทีละส่วนคนละวันได้) · DB กันได้แค่ "โซนเดิมซ้ำในบรรทัดเดียว" (unique index)
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
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { requireService } from '@/lib/service/sitesRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { allocatedByLine, normalizeTermInput, remainingOfLine, termSnapshotFromLine } from '@/lib/service/terms';
import { bindTargetError, orderReceivable } from '@/lib/service/intake';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const salesOrderId = String(body.salesOrderId ?? '').trim();
  /* รับได้ทั้งชื่อเดิม (`bindings`) และชื่อใหม่ (`allocations`) — ความหมายเดียวกัน
     ต่างกันแค่ตอนนี้บรรทัดเดิมโผล่ได้หลายแถว (คนละโซน) */
  const rows = Array.isArray(body.allocations) ? body.allocations
    : (Array.isArray(body.bindings) ? body.bindings : []);
  if (!salesOrderId) return badRequest('ต้องระบุใบสั่งขาย');
  if (!rows.length) return badRequest('ยังไม่ได้จัดสรรของลงโซนไหนเลย');

  try {
    const { data: order, error: orderError } = await supabase
      .from('sales_orders').select('id, "orderNumber", status, supersededById, customerId, customerName, origin')
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
      /* "installationPoint" (mig 0360) — จุดติดตั้งตามชีตของใบย้อนหลัง ลง audit คู่กับโซนที่ TS เลือกจริง */
      .select('id, salesOrderId, productId, fgCode, description, qty, unit, "installationPoint"')
      .eq('salesOrderId', salesOrderId);
    if (lineError) return fail(lineError.message, 500);
    const linesById = new Map((lines || []).map((l) => [l.id, l]));

    const zoneIds = [...new Set(rows.map((r) => String(r.zoneId ?? '').trim()).filter(Boolean))];
    const { data: zones, error: zoneError } = zoneIds.length
      ? await supabase.from('service_zones').select('id, name, siteId, "isActive"').in('id', zoneIds)
      : { data: [], error: null };
    if (zoneError) return fail(zoneError.message, 500);
    const zonesById = new Map((zones || []).map((z) => [z.id, z]));

    /* ⭐ ไซต์ของโซนที่จะผูก (แผน P1 §3-K) — ตรวจเจ้าของ/ชนิด/สถานะด้วย `bindTargetError` ก่อนเขียนทั้งชุด
       ⚠️ ของเดิมเชื่อ zoneId ที่จอส่งมาอย่างเดียว ⇒ ยิงตรงผูกไซต์ของลูกค้าคนอื่น/คลังเครื่องได้ · ใบย้อนหลังที่ TS
          ต้องหาไซต์เองจากชื่อจุดในชีต (ตรงงานจริง 25%) คือจุดที่พลาดแบบนี้ง่ายที่สุด
       ⚠️ ซอยก้อน + ไล่หน้าตามกติกาตัวอ่านทะเบียนโมดูลบริการ แม้ลิสต์มาจากคำขอเดียว */
    const siteIds = [...new Set((zones || []).map((z) => z.siteId).filter(Boolean))];
    const { data: sites, error: siteError } = await fetchInChunks(siteIds, (chunk) => fetchAllResult(() => supabase
      .from('service_sites').select('id, name, "customerId", kind, "isActive"')
      .in('id', chunk).order('id', { ascending: true })));
    if (siteError) return fail(siteError.message, 500);
    const sitesById = new Map((sites || []).map((s) => [s.id, s]));

    /* ของที่จัดสรรไปแล้ว (รอบก่อน ๆ) — ต้องนับรวมด้วย ไม่งั้นจัดสรรเกินได้ด้วยการ
       แบ่งกดหลายครั้ง · อ่านจาก DB เสมอ ไม่เชื่อค่าที่จอส่งมา */
    const already = allocatedByLine(await loadTerms(supabase));
    const seenLineZone = new Set();
    const addedByLine = new Map();
    const payload = [];

    const label = (line, id) => line?.fgCode || line?.description || id;

    for (const row of rows) {
      const lineId = String(row.salesOrderLineId ?? '').trim();
      const line = linesById.get(lineId);
      if (!line) return badRequest('มีบรรทัดที่ไม่ได้อยู่ในใบสั่งขายใบนี้');
      const zoneId = String(row.zoneId ?? '').trim();
      const zone = zonesById.get(zoneId);
      if (!zone) return badRequest('มีโซนที่ไม่พบในทะเบียน — สร้างโซนก่อนแล้วค่อยผูก');
      /* ⭐ ปลายทางต้องเป็นไซต์ลูกค้าของใบนี้ที่ยังเปิดใช้งาน — ตัวตัดสินเดียวกับที่ wizard ถามก่อนกดบันทึก */
      const targetError = bindTargetError({
        order, zone, site: sitesById.get(zone.siteId) || null, lineLabel: label(line, lineId),
      });
      if (targetError) return badRequest(targetError);

      /* โซนเดิมของบรรทัดเดิมซ้ำในคำขอเดียว = ต้องรวมเป็นแถวเดียวแล้วบวกจำนวน
         (unique index ที่ DB เป็นด่านสุดท้าย ข้อความ 23505 ดิบไม่บอกว่าแถวไหน) */
      const pairKey = `${lineId}|${zoneId}`;
      if (seenLineZone.has(pairKey)) {
        return badRequest(`${label(line, lineId)} ถูกจัดสรรลงโซน ${zone.name} ซ้ำในคำขอเดียวกัน — รวมเป็นรายการเดียวแล้วใส่จำนวนรวม`);
      }
      seenLineZone.add(pairKey);

      /* ⚠️ **ผลรวมห้ามเกินจำนวนในบรรทัด** — นับของเดิม + ของที่กำลังจะใส่ในคำขอนี้
         บรรทัดที่ไม่มีจำนวน (บริการ "1 งาน") จัดสรรได้โซนเดียว ตามกติกา remainingOfLine */
      const qtyRaw = row.packageQty ?? row.qty;
      const qty = qtyRaw === undefined || qtyRaw === null || String(qtyRaw).trim() === ''
        ? null : Number(qtyRaw);
      if (qty !== null && (!Number.isFinite(qty) || qty <= 0)) {
        return badRequest(`จำนวนที่จัดสรรของ ${label(line, lineId)} ต้องเป็นตัวเลขมากกว่า 0`);
      }
      const remaining = remainingOfLine(line, already.get(lineId));
      const usedHere = addedByLine.get(lineId) || 0;
      const want = qty ?? remaining;
      if (want > remaining - usedHere) {
        return conflict(
          `จัดสรร ${label(line, lineId)} เกินจำนวนที่ขาย — เหลือให้จัดสรรอีก ${Math.max(0, remaining - usedHere)} ${line.unit || 'หน่วย'}`,
        );
      }
      addedByLine.set(lineId, usedHere + want);

      /* snapshot มาจาก **แถวจริงใน DB** ไม่ใช่จาก body — เชื่อค่าที่จอส่งมาเมื่อไร
         ก็ผูกยอดที่ไม่ตรงกับใบได้ทันที (แพตเทิร์นเดียวกับ closeFromAssets) */
      const snapshot = termSnapshotFromLine(line);
      /* ⚠️ **ตัดวันเริ่ม/สิ้นสุดของ term ที่ body ส่งมาทิ้ง** (แผน P1 §3-K) — คิวนี้ไม่มีช่องให้กรอก (wizard ไม่ส่ง)
         แต่ `termInWindow` ยังอ่านสองคอลัมน์นี้อยู่ ⇒ ยิงตรงมาพร้อม endDate ย้อนหลัง = รอบขายของโซน "หมดอายุ"
         ตั้งแต่วันที่ผูก แล้วด่านเข้าไซต์ติดเงียบ ๆ ด้วยเหตุผิดฝ่าย · ช่วงบริการจริงอ่านจากสัญญาที่ผูกกับใบ */
      const safeRow = { ...row };
      delete safeRow.startDate;
      delete safeRow.endDate;
      const { value, error } = normalizeTermInput({
        ...snapshot,
        ...safeRow,
        salesOrderId,
        salesOrderLineId: lineId,
        /* ⭐ จำนวนที่ **จัดสรรลงโซนนี้** (mig 0312) — ไม่ใช่จำนวนทั้งบรรทัดอีกแล้ว
           ไม่ระบุมา = ยกที่เหลือทั้งหมดลงโซนนี้ (เคสที่พบบ่อยที่สุด: ของทั้งบรรทัดไปที่เดียว) */
        packageQty: want,
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
      // 23505 = unique (salesOrderLineId, zoneId) — มีคนจัดสรรของเดิมลงโซนเดิมแทรกมาก่อน
      if (insertError.code === '23505') {
        return conflict('มีของที่เพิ่งถูกจัดสรรลงโซนเดียวกันโดยคนอื่น — โหลดคิวใหม่แล้วลองอีกครั้ง');
      }
      return fail(insertError.message, 500);
    }

    /* ⭐ audit รายแถว (แผน P1 §3-K) — ของเดิมเก็บแค่ `count` ⇒ ย้อนดูไม่ได้ว่าบรรทัดไหนลงโซนไหนกี่หน่วย
       · ใบย้อนหลังพก "จุดติดตั้งตามชีต" คู่กับโซนที่ TS เลือกจริง = ร่องรอยเดียวของการตัดสินชีตที่ตรงงานจริง 25% */
    await recordAudit({
      user, action: 'create', entityType: 'service_zone_term', entityId: salesOrderId,
      after: {
        salesOrderId,
        historical: isHistoricalOrder(order),
        count: payload.length,
        terms: (inserted || []).map((t) => ({
          id: t.id,
          salesOrderLineId: t.salesOrderLineId,
          zoneId: t.zoneId,
          packageQty: t.packageQty,
          installationPoint: linesById.get(t.salesOrderLineId)?.installationPoint ?? null,
        })),
      },
      summary: `จัดสรรของจากใบสั่งขาย${isHistoricalOrder(order) ? 'ย้อนหลัง' : ''} ${order.orderNumber || salesOrderId} ลงโซนบริการ ${payload.length} รายการ`,
      request: req,
    });

    return ok({ terms: inserted || [] }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});

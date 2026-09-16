// ── TS แจ้ง "ไม่พบจุดนี้หน้างาน" / ถอนการแจ้ง (มติ 16/09/2026 ข้อ 23 · mig 0362) ──
//
// ⭐ **นี่คือทางเขียนทางเดียวของธง `siteNotFound*`** — ฝั่งขายมีของตัวเองที่ PATCH ใบสั่งขาย
//   (แก้ชื่อส่งกลับ / ปิดจุด) และแตะคนละชุดคอลัมน์ ⇒ อ่านแถวเดียวรู้ว่าใครถือลูกอยู่
//
// ⚠️ **แจ้งได้เฉพาะบรรทัดของใบย้อนหลังที่ยังไม่ผูกโซนเลย** (เคาะ 16/09) — ด่านจริงอยู่ที่ trigger
//   ของ 0362 ทั้งคู่ · ที่นี่ตรวจซ้ำเพื่อให้ผู้ใช้ได้ข้อความไทยที่บอกว่าบรรทัดไหนและทำไม
//   (raise ของ trigger บอกแค่รหัสกับ id — ถ้าปล่อยหลุดออกจอ ผู้ใช้อ่านไม่รู้เรื่อง)
//
// ⚠️ **ถอนได้จนกว่าฝ่ายขายจะตัดสิน** — ปิดจุดแล้ว (`siteClosedAt`) ถอนไม่ได้ ต้องให้ฝ่ายขาย
//   แก้ชื่อส่งกลับเท่านั้น · จุดที่ฝ่ายขายแก้ชื่อส่งกลับมาแล้วธงว่าง ⇒ ถอนไม่ได้เพราะไม่มีอะไรให้ถอน
//
// ⚠️ **รับทั้งชุดในคำขอเดียว** เหมือน bind — ขั้น 1 ของวิซาร์ดเลือก "ทุกจุดของใบนี้" ได้
//   ยิงทีละจุดแล้วล้มกลางทาง = ครึ่งใบติดธงครึ่งใบไม่ติด โดยที่คนกดไม่รู้ว่าถึงไหน
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { requireService } from '@/lib/service/sitesRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { allocatedByLine } from '@/lib/service/terms';
import { orderReceivable } from '@/lib/service/intake';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import {
  lineAwaitingSiteDecision, lineSiteClosed, lineSiteNotFound, siteFlagClearPatch, siteFlagTrail,
  siteNotFoundInputError, siteNotFoundPatch, siteNotFoundReasonLabel,
} from '@/lib/sales/siteNotFound';

export const dynamic = 'force-dynamic';

const LINE_SELECT = 'id, salesOrderId, fgCode, description, qty, unit, "installationPoint", "siteNotFoundAt", "siteNotFoundById", "siteNotFoundByName", "siteNotFoundReason", "siteNotFoundNote", "siteClosedAt", "siteClosedById", "siteClosedByName", "siteClosedNote"';

const pointLabel = (line, id) => line?.installationPoint || line?.fgCode || line?.description || id;

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const salesOrderId = String(body.salesOrderId ?? '').trim();
  const action = String(body.action || 'flag');
  const lineIds = [...new Set((Array.isArray(body.lineIds) ? body.lineIds : [])
    .map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (!salesOrderId) return badRequest('ต้องระบุใบสั่งขาย');
  if (!lineIds.length) return badRequest('ยังไม่ได้เลือกจุดติดตั้ง');
  if (action !== 'flag' && action !== 'withdraw') return badRequest('คำสั่งไม่ถูกต้อง');

  const reason = String(body.reason ?? '').trim();
  const note = String(body.note ?? '');
  if (action === 'flag') {
    const inputError = siteNotFoundInputError({ reason, note });
    if (inputError) return badRequest(inputError);
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('sales_orders').select('id, "orderNumber", status, supersededById, customerId, customerName, origin')
      .eq('id', salesOrderId).maybeSingle();
    if (orderError) return fail(orderError.message, 500);
    if (!order) return notFound('ไม่พบใบสั่งขาย');
    if (!orderReceivable(order)) {
      return conflict('ใบสั่งขายนี้ยังไม่อนุมัติ หรือถูกออกฉบับแก้ทับแล้ว — แจ้งจุดไม่ได้');
    }
    /* มติข้อ 23 ครอบเฉพาะใบย้อนหลัง — ใบ pipeline มีจุดติดตั้งเป็นโซนที่ฝ่ายขายเลือกไว้แล้ว
       ไม่ใช่ข้อความจากชีต ⇒ ไม่มีอะไรให้ "หาไม่เจอ" */
    if (!isHistoricalOrder(order)) {
      return conflict('แจ้งไม่พบจุดได้เฉพาะใบสั่งขายย้อนหลัง');
    }

    /* ⚠️ ห่อ fetchAllResult แม้อ่านใบเดียว — ใบย้อนหลังมีได้ถึง 200 บรรทัด (1 บรรทัด = 1 จุด)
       และเพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ · ลำดับต้องนิ่ง ไม่งั้นหน้าซ้อนกัน */
    const { data: lines, error: lineError } = await fetchAllResult(() => supabase
      .from('sales_order_lines').select(LINE_SELECT).eq('salesOrderId', salesOrderId)
      .order('sortOrder', { ascending: true })
      .order('id', { ascending: true }));
    if (lineError) return fail(lineError.message, 500);
    const linesById = new Map((lines || []).map((l) => [l.id, l]));

    /* ⚠️ อ่านโซนที่ผูกไว้แล้วจากฐานเสมอ ไม่เชื่อค่าที่จอส่งมา — จอที่เปิดค้างไว้ก่อนมีคนไปผูกโซน
       จะยังโชว์จุดนั้นว่าง แล้วส่งกลับมาติดธงทับของที่ทำงานอยู่จริง */
    const allocated = allocatedByLine(await loadTerms(supabase));

    const targets = [];
    for (const lineId of lineIds) {
      const line = linesById.get(lineId);
      if (!line) return badRequest('มีจุดติดตั้งที่ไม่ได้อยู่ในใบสั่งขายใบนี้');
      if (action === 'flag') {
        if (lineSiteNotFound(line)) {
          return conflict(`${pointLabel(line, lineId)} ถูกแจ้งไว้แล้ว — รีเฟรชหน้าจอเพื่อดูสถานะล่าสุด`);
        }
        if (allocated.has(lineId)) {
          return conflict(`${pointLabel(line, lineId)} ผูกโซนไปแล้ว — ถอนโซนที่ทะเบียนไซต์ก่อนถ้าผูกผิดจุด`);
        }
      } else {
        if (!lineSiteNotFound(line)) {
          return conflict(`${pointLabel(line, lineId)} ไม่มีการแจ้งค้างอยู่ — รีเฟรชหน้าจอเพื่อดูสถานะล่าสุด`);
        }
        if (lineSiteClosed(line)) {
          return conflict(`${pointLabel(line, lineId)} ฝ่ายขายตัดสินไปแล้ว — ถอนการแจ้งไม่ได้`);
        }
      }
      targets.push(line);
    }

    const at = new Date().toISOString();
    const patch = action === 'flag'
      ? siteNotFoundPatch({ reason, note, user: { id: user.id, name: user.name }, at })
      : siteFlagClearPatch();

    const updated = [];
    for (const line of targets) {
      /* ⚠️ ตัวกรองบอกสถานะที่คาดไว้ด้วย (`.is('siteNotFoundAt', …)`) — สองคนกดพร้อมกัน
         คนหลังได้ 0 แถวแทนที่จะทับของคนแรกเงียบ ๆ */
      let query = supabase.from('sales_order_lines').update(patch).eq('id', line.id);
      query = action === 'flag'
        ? query.is('siteNotFoundAt', null)
        : query.not('siteNotFoundAt', 'is', null).is('siteClosedAt', null);
      const { data, error } = await query.select(LINE_SELECT).maybeSingle();
      if (error) return fail(error.message, 409);
      if (!data) return conflict(`${pointLabel(line, line.id)} เพิ่งถูกเปลี่ยนสถานะโดยคนอื่น — รีเฟรชหน้าจอ`);
      updated.push(data);
      await recordAudit({
        user,
        action: 'update',
        entityType: 'sales_order_line',
        entityId: line.id,
        before: siteFlagTrail(line),
        after: siteFlagTrail(data),
        summary: action === 'flag'
          ? `แจ้งไม่พบจุดติดตั้ง "${pointLabel(line, line.id)}" ของ ${order.orderNumber || order.id} — ${siteNotFoundReasonLabel(reason) || reason}`
          : `ถอนการแจ้งไม่พบจุดติดตั้ง "${pointLabel(line, line.id)}" ของ ${order.orderNumber || order.id}`,
        request: req,
      });
    }

    return ok({
      lines: updated,
      awaitingSiteDecision: (lines || [])
        .map((l) => updated.find((u) => u.id === l.id) || l)
        .filter(lineAwaitingSiteDecision).length,
    });
  } catch (error) {
    return fail(error?.message || 'บันทึกไม่สำเร็จ', 500);
  }
});

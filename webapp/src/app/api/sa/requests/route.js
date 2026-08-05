// ── API คำร้องข้ามฝ่าย (mig 0173) — รายการ + เปิดคำร้อง ─────────────────
// GET  : ผู้ขอเห็นของตัวเอง · RD/PC เห็นคิวของฝ่ายตน · admin เห็นทั้งหมด
// POST : เปิดเป็น "ร่าง" (ยังไม่ออกเลข — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง)
//
// ⚠️ ชนิดคำร้องคุมทุกกฎ (lib/master/requestTypes.js): ชนิดไหนมีบรรทัด ชนิดไหน
// บังคับดีล ชนิดไหนต้องอ้างกลิ่น/สูตร — handler ไม่ตัดสินเอง เรียก requestShapeError
//
// ⚠️ ชนิดขอราคา: ทุกรายการผูก materialId เสมอ — ของใหม่จะสร้างวัสดุ "ร่าง" ใน
// ทะเบียนให้ก่อนแล้วผูก id (จุดที่ปิดบั๊ก "ตอบคำขอทีไรก็เกิดวัสดุตัวใหม่")
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewCosting, isSuperuser } from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { normalizeRequestItems } from '@/lib/deptRequests';
import {
  deptForRequest, materialKindForRequest, requestDeptError, requestHasItems, requestHasTiers,
  legacyKindError, requestKindLabel, requestNeedsRef, requestShapeError, requestStepKey,
} from '@/lib/master/requestTypes';
import { ensureMaterial, findRequest, loadRequests } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/requests?status=pending,acknowledged&dealId=D-1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam ? statusParam.split(',').filter(Boolean) : null;
    const dealId = url.searchParams.get('dealId');

    // _mine: ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย)
    // จึงติดธงมาจาก server ให้แท็บ "คำร้องของฉัน" แยกได้โดยไม่ต้องเดาจากชื่อ
    const decorate = (rows) => rows
      .filter((r) => !dealId || r.dealId === dealId)
      .map((r) => ({ ...r, _mine: r.requestedById === user?.id }));

    // ขอบเขตที่เห็น: admin ทั้งหมด · RD/PC คิวของฝ่ายตน + ของที่ตัวเองเปิด ·
    // ผู้ขอเฉพาะของตัวเอง (คำร้องเป็นงานปฏิบัติของคนเปิด ไม่ใช่ของทั้งทีม)
    if (isSuperuser(user?.role)) {
      return Response.json(decorate(await loadRequests(supabase, { status })),
        { headers: { 'Cache-Control': 'no-store' } });
    }
    const mine = await loadRequests(supabase, { status, requestedById: user?.id || '—' });
    const dept = ['RD', 'PC'].find((d) => canQuoteMaterial(user, d));
    if (!dept) return Response.json(decorate(mine), { headers: { 'Cache-Control': 'no-store' } });

    const queue = await loadRequests(supabase, { status, dept });
    const byId = new Map([...queue, ...mine].map((r) => [r.id, r]));
    // ร่างของคนอื่นยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย ไม่ควรโผล่ในคิว
    const rows = [...byId.values()]
      .filter((r) => r.status !== 'draft' || r.requestedById === user?.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json(decorate(rows), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/requests
// { kind, dept, title, body?, urgent?, requestedDueDate?,
//   dealId? | salesOrderId? | scentId? | formulaId?,   ← ตามหัวข้อ
//   productId?, formulaCode?, formulaName?, costingRequestId?,
//   items?: [{ kind, materialId?, label, spec?, componentId?, tiers?: [qty…] }] }
//
// ⚠️ `title` บังคับทุกหัวข้อ · ของที่ต้องผูก**ต่างกันตามหัวข้อ** (ดู `needs` ใน
// lib/master/requestTypes.js) — ขอราคาไม่ผูกดีล · บรีฟกลิ่นผูก SO · Mock-up ผูก
// โครงการ+ดีล+กลิ่น+หมวดสินค้า
// ⚠️ `projectId` / `customerId` / `customerName` **ไม่รับจาก client** — derive จาก
// ดีล (หรือจากกลิ่น/สูตรเมื่อหัวข้อไม่ผูกดีล) · `note` เลิกใช้แล้ว
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!canUser(user, 'costing:edit') && !canQuoteMaterial(user, 'RD') && !canQuoteMaterial(user, 'PC')) {
    return Response.json({ error: 'ไม่มีสิทธิ์เปิดคำร้อง' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;

  // หัวข้อที่เลิกใช้แล้วเปิดใบใหม่ไม่ได้ — ฟอร์มกรองออกให้แล้ว แต่ยิงตรงยังได้
  const retired = legacyKindError(kind);
  if (retired) return Response.json({ error: retired }, { status: 400 });

  // ด่านตามชนิด — ที่เดียวของระบบ (หัวเรื่อง/ดีล/กลิ่น/สูตร/บรรทัด)
  const shapeError = requestShapeError(kind, body);
  if (shapeError) return Response.json({ error: shapeError }, { status: 400 });

  // ฝ่ายผู้ตอบ: ชนิดที่ล็อกไว้ใช้ค่านั้น · ชนิดที่ไม่ล็อกอนุมานจากรายการ/ที่ผู้ขอเลือก
  const dept = deptForRequest(kind, { dept: body.dept, items: body.items });
  if (!dept) return Response.json({ error: 'ต้องระบุฝ่ายที่ต้องการให้ตอบ' }, { status: 400 });
  // ฟอร์มให้เลือกฝ่ายเองแล้ว (มติ 2026-08-03) — เลือกไม่เข้ากับชนิดต้องตีกลับ
  // ไม่ใช่เงียบ ๆ ส่งไปฝ่ายอื่นแล้วให้คนขอรอคำตอบจากฝ่ายที่ไม่เคยได้รับเรื่อง
  if (body.dept) {
    const deptError = requestDeptError(kind, body.dept);
    if (deptError) return Response.json({ error: deptError }, { status: 400 });
  }

  let items = [];
  if (requestHasItems(kind)) {
    const normalized = normalizeRequestItems(body.items, {
      dept, hasTiers: requestHasTiers(kind),
    });
    if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
    items = normalized.items;
    // ชนิดวัสดุของบรรทัดต้องตรงกับชนิดคำร้อง — ปิดรอยที่เคยทำให้เปิดคำร้องจาก
    // บรรทัด RM_F ในใบขอราคาผลิตแล้วได้ `kind: price_pm` (หัวใบบอกบรรจุภัณฑ์
    // แต่บรรทัดเป็นหัวน้ำหอม → เลขที่ออกผิด scope และช่องกลิ่นไม่เคยถูกถาม)
    const want = materialKindForRequest(kind);
    const off = items.find((i) => i.kind !== want);
    if (off) {
      return Response.json({
        error: `"${requestKindLabel(kind)}" รับได้เฉพาะรายการชนิด ${want} — พบ ${off.kind}`,
      }, { status: 400 });
    }
  }

  const requestId = `DR-${randomUUID()}`;

  // ── สิ่งที่คำร้องผูก: มาจากแถวจริงเสมอ ไม่เชื่อ client ───────────────────
  //
  // ⭐ มติผู้ใช้ 2026-08-03 (รอบสอง) — แต่ละหัวข้อผูกไม่เหมือนกัน (ดู `needs` ใน
  // lib/master/requestTypes.js) · `requestShapeError` ตรวจแล้วว่า "เลือกครบไหม"
  // ตรงนี้ตรวจ "ของที่เลือกมีจริงและสัมพันธ์กันจริงไหม" ซึ่งต้องอ่าน DB
  //
  // ⭐ **บรีฟกลิ่นยึด SO เป็นหลัก** แล้ว derive ดีล/โครงการ/ลูกค้าจาก SO — ไม่ให้
  // เลือกซ้ำ เพราะเลือกสองที่แล้วขัดกันเองได้ (SO ของดีล A แต่เลือกดีล B)
  let salesOrderId = null;
  let dealId = body.dealId || null;
  if (requestNeedsRef(kind, 'salesOrder')) {
    const { data: soRow, error: soError } = await supabase
      .from('sales_orders').select('id, dealId, status').eq('id', body.salesOrderId).maybeSingle();
    if (soError) return Response.json({ error: soError.message }, { status: 500 });
    if (!soRow) return Response.json({ error: 'ไม่พบใบสั่งขายที่เลือก' }, { status: 400 });
    // ⭐ **ต้องอนุมัติแล้วเท่านั้น** (มติผู้ใช้) — ใบที่ยังรออนุมัติแปลว่าค่าบริการ
    // ออกแบบกลิ่นยังไม่ถูกตกลง · เริ่มงาน RD ก่อนแล้วใบไม่ผ่าน = ทำฟรี
    if (soRow.status !== 'approved') {
      return Response.json({
        error: 'ใบสั่งขายนี้ยังไม่อนุมัติ — เปิดคำร้องพัฒนากลิ่นได้เมื่อใบสั่งขายผ่านอนุมัติแล้ว',
      }, { status: 400 });
    }
    salesOrderId = soRow.id;
    dealId = soRow.dealId || null;
    if (!dealId) {
      return Response.json({
        error: 'ใบสั่งขายนี้ไม่ได้ผูกดีล — เปิดบรีฟกลิ่นจากใบนี้ไม่ได้',
      }, { status: 400 });
    }
  }

  // โครงการ/ลูกค้าเติมจากดีล **ถ้าหัวข้อนี้ผูกดีล** — หัวข้อขอราคาไม่ผูกดีลแล้ว
  // (มติรอบสอง: กลิ่น/สูตรผูกลูกค้าอยู่แล้ว ใช้รอบไหนก็ได้ · วัสดุเป็นราคากลาง)
  let projectId = null;
  let customerId = null;
  let customerName = null;
  if (dealId) {
    const { data: dealRow, error: dealError } = await supabase
      .from('sales_deals').select('id, projectId, customerId, customerName')
      .eq('id', dealId).maybeSingle();
    if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
    if (!dealRow) return Response.json({ error: 'ไม่พบดีลที่เลือก' }, { status: 400 });
    // บังคับโครงการเฉพาะหัวข้อที่ประกาศว่าต้องมี — SO ที่ derive ดีลมาให้ก็ต้องผ่าน
    // ด่านนี้ด้วย เพราะหมุดไทม์ไลน์ของบรีฟกลิ่นต้องมีโครงการจึงจะปักได้
    if (!dealRow.projectId && requestNeedsRef(kind, 'project')) {
      return Response.json({
        error: 'ดีลนี้ยังไม่ผูกโครงการ — ผูกโครงการให้ดีลก่อนจึงเปิดคำร้องได้',
      }, { status: 400 });
    }
    projectId = dealRow.projectId || null;
    // ลูกค้ามาจากดีล ไม่ใช่จาก client — ปล่อยให้ส่งเองคือเปิดช่องให้ราคาเข้าทะเบียน
    // ใต้ชื่อลูกค้าที่ไม่ใช่เจ้าของดีล
    customerId = dealRow.customerId || null;
    customerName = dealRow.customerName || null;
  }

  // หัวข้อขอราคา F/FB ไม่ผูกดีล → ลูกค้ามาจาก **กลิ่น/สูตร** ที่อ้างถึงแทน
  // (กลิ่นมี customerId NOT NULL เสมอ ตามมติ 9 — กลิ่นของลูกค้า A ใช้กับ B ไม่ได้)
  if (!customerId && (body.scentId || body.formulaId)) {
    const table = body.scentId ? 'scents' : 'formulas';
    const refId = body.scentId || body.formulaId;
    const { data: refRow } = await supabase
      .from(table).select('customerId, customerName').eq('id', refId).maybeSingle();
    customerId = refRow?.customerId || null;
    customerName = refRow?.customerName || null;
  }

  try {
    // 1) ชนิดขอราคา: ทุกรายการต้องมีวัสดุในทะเบียน — ของใหม่เข้าเป็นร่างรอ RD/PC รับ
    const resolved = [];
    for (const item of items) {
      if (item.materialId) { resolved.push(item); continue; }
      const { material } = await ensureMaterial(supabase, {
        kind: item.kind,
        label: item.label,
        customerId,
        customerName,
        // ผู้ขอเสนอได้แต่ตัววัสดุ (ร่าง); ถ้าคนเปิดเป็น RD/PC ของฝ่ายนั้นเองก็รับเข้าเลย
        status: canQuoteMaterial(user, item.kind) ? 'active' : 'draft',
        user,
      });
      resolved.push({ ...item, materialId: material.id });
    }

    // 2) หัวคำร้อง — stepKey มาจากชนิด ไม่ใช่จาก client (กันปักหมุดผิดขั้น)
    const { error: headError } = await supabase.from('dept_requests').insert({
      id: requestId,
      kind,
      dept,
      status: 'draft',
      title: body.title ? String(body.title).trim().slice(0, 200) : null,
      body: body.body ? String(body.body).trim().slice(0, 4000) : null,
      urgent: !!body.urgent,
      dealId,
      projectId,
      salesOrderId,
      // 🐞 เคยมี `productTypeId` ตรงนี้ — mig 0204 DROP คอลัมน์ทิ้งไปแล้วแต่ลืมถอด
      // ออกจาก insert ⇒ **เปิดคำร้องไม่ได้เลยทุกหัวข้อ** เพราะ PostgREST ปฏิเสธทั้ง
      // ก้อนเมื่อ body มีคอลัมน์ที่ไม่มีจริง (ไม่ใช่แค่เมินค่านั้นทิ้ง)
      // หมวดสินค้าย้ายไปอยู่ **รายแถว** (`dept_request_items.categoryCode` — 0204)
      stepKey: requestStepKey(kind),
      scentId: body.scentId || null,
      formulaId: body.formulaId || null,
      customerId,
      customerName,
      productId: body.productId || null,
      productName: body.productName || null,
      formulaCode: body.formulaCode || null,
      formulaName: body.formulaName || null,
      formulaDate: body.formulaDate || null,
      costingRequestId: body.costingRequestId || null,
      requestedById: user?.id ?? null,
      requestedByName: user?.name ?? null,
      requestedDueDate: body.requestedDueDate || null,
      team: user?.team ?? null,
      // ⚠️ เลิกเขียน `note` (มติผู้ใช้ 2026-08-03: "ไม่ต้องมีหมายเหตุ") — คำร้องมี
      // "รายละเอียด" (body) ที่ทำงานเดียวกันอยู่แล้ว สองช่องข้อความอิสระบนเรื่อง
      // เดียวทำให้คนเขียนต้องเดาว่าอะไรควรอยู่ช่องไหน และผู้ตอบต้องอ่านสองที่
      // · คอลัมน์ยังอยู่เพื่ออ่านของเก่า (หน้ารายละเอียดยังแสดงถ้ามีค่า) ไม่ DROP
    });
    if (headError) throw headError;

    // 3) รายการ + ชั้นจำนวนที่ขอ (เฉพาะชนิดที่มีบรรทัด)
    if (resolved.length) {
      const itemRows = resolved.map((item) => ({
        id: `DRI-${randomUUID()}`,
        requestId,
        // mig 0204: บรรทัดมีรูปร่าง — วันนี้ทุกบรรทัดยังเป็นวัสดุ (หัวข้อที่มีบรรทัด
        // มีแต่ขอราคา) · รูปร่างอื่นเข้ามาใน P1b พร้อมหัวข้อพัฒนากลิ่น/ผลิตภัณฑ์/เอกสาร
        // ⚠️ คอลัมน์เป็น NOT NULL และ default ถูกถอดทิ้งใน migration — ต้องส่งเสมอ
        lineKind: 'material',
        sortOrder: item.sortOrder,
        kind: item.kind,
        materialId: item.materialId,
        label: item.label,
        spec: item.spec,
        componentId: item.componentId,
      }));
      const { error: itemError } = await supabase.from('dept_request_items').insert(itemRows);
      if (itemError) {
        await supabase.from('dept_requests').delete().eq('id', requestId);
        throw itemError;
      }

      const tierRows = resolved.flatMap((item, idx) => item.tiers.map((qty) => ({
        id: `DRT-${randomUUID()}`,
        requestItemId: itemRows[idx].id,
        qty,
      })));
      if (tierRows.length) {
        const { error: tierError } = await supabase.from('dept_request_item_tiers').insert(tierRows);
        if (tierError) {
          await supabase.from('dept_requests').delete().eq('id', requestId);
          throw tierError;
        }
      }
    }

    const created = await findRequest(supabase, requestId);
    await recordAudit({
      user, action: 'create', entityType: 'dept_request', entityId: requestId, after: created,
      summary: `เปิดคำร้อง "${requestKindLabel(kind)}" ถึงฝ่าย ${dept} (ร่าง)`, request,
    });
    return Response.json(created, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

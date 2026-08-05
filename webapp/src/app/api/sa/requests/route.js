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
import {
  REQUEST_ANSWER_DEPARTMENTS, canAnswerRequestsFor, canUser, canViewRequests, isSuperuser,
} from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { normalizeScentBriefs } from '@/lib/requests/scentBriefs';
import { scentCountForOrder, scentDesignOrderError } from '@/lib/requests/scentDesignOrders';
import { resolveScope, scopeFilter } from '@/lib/requests/scope';
import {
  deptForRequest, materialKindForRequest, requestDeptError, requestHasTiers,
  legacyKindError, lineShapeForKind, requestHasPdr, requestKindLabel, requestNeedsRef,
  requestShapeError,
  requestStepKey,
} from '@/lib/master/requestTypes';
import { ensureMaterial, findRequest, loadRequests } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/requests?status=pending,acknowledged&dealId=D-1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam ? statusParam.split(',').filter(Boolean) : null;
    const dealId = url.searchParams.get('dealId');
    // ⭐ ขอบเขตที่ขอมา — **บังคับที่นี่ ไม่ใช่ที่จอ** (กับดักข้อ 9 ของแผน)
    // สิทธิ์ไม่พอให้ถอยลงมา ไม่ปฏิเสธ ⇒ ลิงก์ที่แชร์กันไว้ไม่พังในมือคนสิทธิ์น้อยกว่า
    const scope = resolveScope(user, url.searchParams.get('scope'));
    const scopeWhere = scopeFilter(user, scope);

    // _mine: ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย)
    // จึงติดธงมาจาก server ให้แท็บ "คำร้องของฉัน" แยกได้โดยไม่ต้องเดาจากชื่อ
    const decorate = (rows) => rows
      .filter((r) => !dealId || r.dealId === dealId)
      .map((r) => ({ ...r, _mine: r.requestedById === user?.id }));

    // ขอบเขตที่เห็น: admin ทั้งหมด · RD/PC คิวของฝ่ายตน + ของที่ตัวเองเปิด ·
    // ผู้ขอเฉพาะของตัวเอง (คำร้องเป็นงานปฏิบัติของคนเปิด ไม่ใช่ของทั้งทีม)
    if (isSuperuser(user?.role)) {
      return Response.json(
        decorate(await loadRequests(supabase, { status, ...(scopeWhere || {}) })),
        { headers: { 'Cache-Control': 'no-store', 'X-Request-Scope': scope } },
      );
    }
    // ⚠️ ผู้ใช้ทั่วไป: `scopeWhere` แคบกว่าหรือเท่ากับ "ของตัวเอง" เสมอ (resolveScope
    // ไม่มีทางคืน 'all' ให้คนที่ไม่ใช่ผู้ดูแล) ⇒ ใช้แทนที่ตัวกรองเดิมได้ตรง ๆ
    const mine = await loadRequests(supabase, { status, ...(scopeWhere || {}) });
    // ฝ่ายที่ผู้ใช้คนนี้รับคำร้องได้ — อ่านจากลิสต์กลาง ไม่สะกดเองในนี้
    const dept = REQUEST_ANSWER_DEPARTMENTS.find((d) => canAnswerRequestsFor(user, d));
    if (!dept) return Response.json(decorate(mine), { headers: { 'Cache-Control': 'no-store' } });

    const queue = await loadRequests(supabase, { status, dept });
    const byId = new Map([...queue, ...mine].map((r) => [r.id, r]));
    // ร่างของคนอื่นยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย ไม่ควรโผล่ในคิว
    const rows = [...byId.values()]
      .filter((r) => r.status !== 'draft' || r.requestedById === user?.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json(decorate(rows), {
      headers: { 'Cache-Control': 'no-store', 'X-Request-Scope': scope },
    });
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
  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  // เปิดคำร้องได้ = ฝ่ายขาย (costing:edit) หรือคนที่รับคำร้องของฝ่ายใดฝ่ายหนึ่งได้
  // ⚠️ เดิมเช็ค `canQuoteMaterial` ฝั่ง RD/PC ตรง ๆ ⇒ ฝ่ายที่รับคำร้องแต่ไม่ตอบราคา
  // จะเปิดคำร้องถามฝ่ายอื่นไม่ได้เลย ทั้งที่เป็นเรื่องคนละอย่างกับการตอบราคา
  const answersSomeDept = REQUEST_ANSWER_DEPARTMENTS.some((d) => canAnswerRequestsFor(user, d));
  if (!canUser(user, 'costing:edit') && !answersSomeDept) {
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

  // ⭐ **บรรทัดมีหลายรูปร่าง** (วัสดุ · พัฒนาผลิตภัณฑ์ · เอกสาร) กฎคนละชุดสิ้นเชิง —
  // route ไม่ตัดสินเองว่ารูปร่างไหนตรวจยังไง แต่ถามทะเบียนรูปร่างบรรทัด ซึ่งอยู่ใน
  // บ้านของฝ่ายที่เป็นเจ้าของรูปร่างนั้น (P7b) ⇒ เพิ่มรูปร่างใหม่ ไฟล์นี้ไม่ต้องแก้
  const lineShape = lineShapeForKind(kind);
  const normalized = normalizeLinesFor(lineShape, body.items, {
    dept,
    hasTiers: requestHasTiers(kind),
    materialKind: materialKindForRequest(kind),
    kindLabel: requestKindLabel(kind),
  });
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const items = normalized.items;
  // ⚠️ ยังเหลือธงสองตัวสำหรับขั้น **เขียนลงตาราง** ข้างล่าง (แต่ละรูปร่างเก็บคนละ
  // คอลัมน์) — P7b ย้ายเฉพาะ *ด่านตรวจ* เข้าโมดูล ส่วนตัวประกอบแถวยังอยู่ที่นี่
  // เพราะมันแตะ supabase · ย้ายพร้อมกันในใบเดียวคือแตะ route กับด่านพร้อมกัน
  // ซึ่งเป็นทางที่บั๊ก #973 เดินมา
  const isProductDev = lineShape === 'product_dev';
  const isDocument = lineShape === 'document';

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
  let scentCount = null;
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
    // ⭐ ต้องเป็นใบที่ขาย **บริการออกแบบกลิ่น** จริง — ป้ายบนฟอร์มเขียนไว้แบบนั้น
    // แต่ก่อนหน้านี้ไม่มีอะไรตรวจ ⇒ เปิดบรีฟบนใบขายสินค้าได้ (ใบเดียวบน prod ก็เป็น
    // ใบขายสินค้า) · ดู lib/requests/scentDesignOrders.js
    const { data: soLines, error: soLineError } = await supabase
      .from('sales_order_lines').select('qty, fgCode, description').eq('salesOrderId', soRow.id);
    if (soLineError) return Response.json({ error: soLineError.message }, { status: 500 });

    // ⭐ 1 SO : 1 PDR ตายตัว (มติผู้ใช้) — อยากได้เพิ่มต้องออกใบสั่งขายใหม่
    const { data: taken, error: takenError } = await supabase
      .from('dept_requests').select('docNo, id')
      .eq('salesOrderId', soRow.id).neq('status', 'cancelled').maybeSingle();
    if (takenError) return Response.json({ error: takenError.message }, { status: 500 });

    const gate = scentDesignOrderError({ ...soRow }, soLines || [], {
      usedByRequestNo: taken ? (taken.docNo || taken.id) : null,
    });
    if (gate) return Response.json({ error: gate }, { status: 400 });

    salesOrderId = soRow.id;
    scentCount = scentCountForOrder(soLines || []);
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
    //
    // ⚠️ พัฒนาผลิตภัณฑ์ไม่มีวัสดุ — ป้ายชื่อ (`label`) เป็น snapshot ที่ derive จาก
    // **ทะเบียน** ไม่ใช่ค่าที่ client ส่งมา · แพตเทิร์นเดียวกับ productFormulaSnapshot
    // ปล่อยให้พิมพ์เองเมื่อไร จะได้ป้ายที่ไม่ตรงกับหมวด/กลิ่นที่แถวชี้อยู่จริง
    const resolved = [];
    if (isProductDev) {
      const scentIds = [...new Set(items.map((i) => i.scentId))];
      const [{ data: scentRows, error: scentError }, { data: typeRows, error: typeError }] =
        await Promise.all([
          supabase.from('scents').select('id, code, name, customerId').in('id', scentIds),
          supabase.from('product_types').select('mainCategoryCode, typeCode, nameTh, nameEn'),
        ]);
      if (scentError) throw scentError;
      if (typeError) throw typeError;
      const scentById = new Map((scentRows || []).map((r) => [r.id, r]));
      const typeByCode = new Map((typeRows || [])
        .map((r) => [`${r.mainCategoryCode}-${r.typeCode}`, r]));

      for (const item of items) {
        const scent = scentById.get(item.scentId);
        if (!scent) throw new Error(`ไม่พบกลิ่นที่เลือกในรายการที่ ${item.sortOrder}`);
        // ⚠️ กลิ่นข้ามลูกค้าไม่ได้ (มติ 9) — ใบผูกดีลของลูกค้ารายหนึ่ง จะขอกลิ่นของ
        // อีกรายไม่ได้ · ตรวจที่นี่ ไม่ใช่แค่กรองตัวเลือกบนจอ
        if (customerId && scent.customerId !== customerId) {
          throw new Error(`รายการที่ ${item.sortOrder}: กลิ่นนี้เป็นของลูกค้าคนละราย`);
        }
        const type = typeByCode.get(item.categoryCode);
        // หมวดที่ชื่อว่างทั้งสองภาษามีจริง (prod 5 แถว) — ถอยไปใช้รหัส ห้ามป้ายว่าง
        const typeName = type?.nameTh || type?.nameEn || item.categoryCode;
        resolved.push({
          ...item,
          label: `${typeName} · ${scent.code ? `${scent.code} ` : ''}${scent.name}`,
        });
      }
    }
    // บรรทัดเอกสารไม่มีของให้ resolve — ชนิดกับรายละเอียดครบตั้งแต่ normalize แล้ว
    if (isDocument) resolved.push(...items);
    for (const item of (isProductDev || isDocument) ? [] : items) {
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

    // 2.5) บรีฟรายกลิ่น — ชั้นกลางของโครงสามชั้น (mig 0213)
    //
    // ⚠️ ตรวจ **หลัง** รู้จำนวนกลิ่นจากใบสั่งขายแล้ว เพราะด่านบังคับให้เท่ากัน ·
    // ตารางแยกจาก dept_request_items โดยตั้งใจ (บรีฟไม่เดิน 5 ก้าว — ดู 0213)
    if (requestHasPdr(kind)) {
      const { briefs, error: briefError } = normalizeScentBriefs(body.briefs, {
        expected: scentCount,
      });
      if (briefError) return Response.json({ error: briefError }, { status: 400 });
      const briefRows = briefs.map((b) => ({
        id: `DRS-${randomUUID()}`,
        requestId,
        sortOrder: b.sortOrder,
        label: b.label,
        brief: b.brief,
        researchTopic: b.researchTopic,
        inspiration: b.inspiration,
        likedNotes: b.likedNotes,
        dislikedNotes: b.dislikedNotes,
        scentotypes: b.scentotypes,
        performance: b.performance,
      }));
      const { error: briefInsertError } = await supabase
        .from('dept_request_scents').insert(briefRows);
      if (briefInsertError) throw briefInsertError;
    }

    // 3) รายการ + ชั้นจำนวนที่ขอ (เฉพาะชนิดที่มีบรรทัด)
    if (resolved.length) {
      const itemRows = resolved.map((item) => (isDocument ? {
        id: `DRI-${randomUUID()}`,
        requestId,
        lineKind: 'document',
        sortOrder: item.sortOrder,
        label: item.label,
        spec: item.spec,
        docType: item.docType,
      } : isProductDev ? {
        id: `DRI-${randomUUID()}`,
        requestId,
        lineKind: 'product_dev',
        sortOrder: item.sortOrder,
        label: item.label,
        spec: item.spec,
        categoryCode: item.categoryCode,
        scentId: item.scentId,
        qty: item.qty,
        unit: item.unit,
      } : {
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

      const tierRows = resolved.flatMap((item, idx) => (item.tiers || []).map((qty) => ({
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

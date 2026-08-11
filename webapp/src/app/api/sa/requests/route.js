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
  REQUEST_ANSWER_DEPARTMENTS, attributionTeam, canAnswerRequestsFor, canUser, canViewRequests, isSuperuser,
} from '@/lib/permissions';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { normalizeScentBriefs } from '@/lib/requests/scentBriefs';
import { normalizePdr } from '@/lib/requests/pdr';
import { normalizePdrTargets } from '@/lib/requests/pdrTargets';
import { scentCountForOrder, scentDesignOrderError } from '@/lib/requests/scentDesignOrders';
import { requestOptionalRefs } from '@/lib/master/requestTypes';
import { REQUEST_SCOPES, resolveScope, scopeFilter } from '@/lib/requests/scope';
import {
  deptForRequest, requestDeptError,
  legacyKindError, lineShapeForKind, requestHasPdr, requestKindLabel, requestNeedsRef,
  requestShapeError,
  requestStepKey,
} from '@/lib/master/requestTypes';
import { findRequest, loadRequests } from '@/lib/materialPricesAdmin';
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
    //
    // ⚠️ **ที่นี่ `_mine` = "ฉันเป็นคนเปิดใบนี้" เท่านั้น** ไม่ใช่ "ฉันจัดการได้" —
    // ตั้งแต่เปิดให้ทีมทำแทนกันได้ (ม-100) สองอย่างนี้ไม่เท่ากันแล้ว · แท็บ
    // "ที่ฉันเปิด" ต้องหมายความตามชื่อ ไม่งั้นใบของเพื่อนร่วมทีมจะไหลเข้ามาปน
    // ⚠️ หน้ารายละเอียดติดธงชื่อเดียวกันแต่คนละความหมาย (= จัดการได้) — อย่า "แก้ให้
    // ตรงกัน" โดยไม่อ่านสองที่ก่อน
    const decorate = (rows) => rows
      .filter((r) => !dealId || r.dealId === dealId)
      .map((r) => ({ ...r, _mine: r.requestedById === user?.id }));

    // ขอบเขตที่เห็น: admin ทั้งหมด · RD/PC คิวของฝ่ายตน + ของที่ตัวเองเปิด ·
    // ผู้ขอเฉพาะของตัวเอง (คำร้องเป็นงานปฏิบัติของคนเปิด ไม่ใช่ของทั้งทีม)
    if (isSuperuser(user?.role)) {
      // 🐞 **ผู้ดูแลระบบต้องเห็นทุกใบเมื่อไม่ได้ระบุขอบเขตมา** — ของเดิมเอา `scopeWhere`
      // ที่ตั้งต้นเป็น "ของฉัน" มาใช้แล้วคืนทันที ⇒ admin ที่ไม่ได้เปิดใบเอง **เห็นหน้าคิว
      // ว่างเปล่า ทั้งสามแท็บเป็น (0)** ทั้งที่มีคำร้องอยู่จริง (ผู้ใช้เจอเองบนจอ)
      //
      // ⚠️ ระบุ `?scope=` มาเมื่อไรก็ยังเคารพเหมือนเดิม — ตัวสลับขอบเขตบนจอยังทำงาน
      // ที่แก้คือ **ค่าตั้งต้น** ไม่ใช่การปลดด่าน (admin เห็นได้ทุกใบอยู่แล้วโดยสิทธิ์)
      const explicit = REQUEST_SCOPES.includes(url.searchParams.get('scope'));
      const adminWhere = explicit ? (scopeWhere || {}) : {};
      return Response.json(
        decorate(await loadRequests(supabase, { status, ...adminWhere })),
        { headers: { 'Cache-Control': 'no-store', 'X-Request-Scope': explicit ? scope : 'all' } },
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
//   items?: ตามรูปร่างบรรทัดของหัวข้อ (พัฒนาสูตร: หมวด×กลิ่น · เอกสาร: ชนิด+รายละเอียด) }
//
// ⚠️ `title` บังคับทุกหัวข้อ · ของที่ต้องผูก**ต่างกันตามหัวข้อ** (ดู `needs` ใน
// lib/master/requestTypes.js) — พัฒนากลิ่นผูก SO · พัฒนาสูตรผูกโครงการ+ดีล
// (หมวดกับกลิ่นอยู่รายแถว)
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
  const dept = deptForRequest(kind, { dept: body.dept });
  if (!dept) return Response.json({ error: 'ต้องระบุฝ่ายที่ต้องการให้ตอบ' }, { status: 400 });
  // ฟอร์มให้เลือกฝ่ายเองแล้ว (มติ 2026-08-03) — เลือกไม่เข้ากับชนิดต้องตีกลับ
  // ไม่ใช่เงียบ ๆ ส่งไปฝ่ายอื่นแล้วให้คนขอรอคำตอบจากฝ่ายที่ไม่เคยได้รับเรื่อง
  if (body.dept) {
    const deptError = requestDeptError(kind, body.dept);
    if (deptError) return Response.json({ error: deptError }, { status: 400 });
  }

  // ⭐ **บรรทัดมีหลายรูปร่าง** (พัฒนาสูตร · เอกสาร · ใบวางบิล) กฎคนละชุดสิ้นเชิง —
  // route ไม่ตัดสินเองว่ารูปร่างไหนตรวจยังไง แต่ถามทะเบียนรูปร่างบรรทัด ซึ่งอยู่ใน
  // บ้านของฝ่ายที่เป็นเจ้าของรูปร่างนั้น (P7b) ⇒ เพิ่มรูปร่างใหม่ ไฟล์นี้ไม่ต้องแก้
  const lineShape = lineShapeForKind(kind);
  const normalized = normalizeLinesFor(lineShape, body.items, {
    dept,
    kindLabel: requestKindLabel(kind),
  });
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const items = normalized.items;
  // ⚠️ ยังเหลือธงสองตัวสำหรับขั้น **เขียนลงตาราง** ข้างล่าง (แต่ละรูปร่างเก็บคนละ
  // คอลัมน์) — P7b ย้ายเฉพาะ *ด่านตรวจ* เข้าโมดูล ส่วนตัวประกอบแถวยังอยู่ที่นี่
  // เพราะมันแตะ supabase · ย้ายพร้อมกันในใบเดียวคือแตะ route กับด่านพร้อมกัน
  // ซึ่งเป็นทางที่บั๊ก #973 เดินมา
  const isProductDev = lineShape === 'product_dev';

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

  // ── อ้างอิงเพิ่มแบบไม่บังคับ: QT · SO · FG (ม-88) ───────────────────────
  //
  // ⭐ มติผู้ใช้ 2026-08-08: "ใส่รายละเอียดที่เกี่ยวข้อง QT SO FG **(ถ้ามี)**" —
  // ว่างได้เสมอ · ส่งมาเมื่อไรตรวจสองข้อ: **ของมีจริง** และ **อยู่ดีลเดียวกัน**
  // (QT/SO ผูกดีล — อ้างข้ามดีลคือความขัดแย้งแบบเดียวกับที่บรีฟกลิ่นกันไว้)
  //
  // ⚠️ ไม่ใช่ด่านธุรกิจเต็มชุดของบรีฟกลิ่น (อนุมัติแล้ว · 1SO:1PDR) — ที่นี่แค่
  // "แนบป้ายอ้างอิงให้ตามกลับได้" ไม่ได้เปิดสิทธิ์อะไรจากใบที่อ้าง
  let quotationId = null;
  let optionalSalesOrderId = null;
  let refProduct = null;
  const optionalRefs = requestOptionalRefs(kind);
  if (optionalRefs.includes('quotation') && body.quotationId) {
    const { data: qt, error: qtError } = await supabase
      .from('quotations').select('id, "dealId"').eq('id', body.quotationId).maybeSingle();
    if (qtError) return Response.json({ error: qtError.message }, { status: 500 });
    if (!qt) return Response.json({ error: 'ไม่พบใบเสนอราคาที่อ้างถึง' }, { status: 400 });
    if (dealId && qt.dealId && qt.dealId !== dealId) {
      return Response.json({ error: 'ใบเสนอราคาที่อ้างไม่ใช่ของดีลนี้' }, { status: 400 });
    }
    quotationId = qt.id;
  }
  if (optionalRefs.includes('salesOrder') && !requestNeedsRef(kind, 'salesOrder') && body.salesOrderId) {
    const { data: so, error: soRefError } = await supabase
      .from('sales_orders').select('id, "dealId"').eq('id', body.salesOrderId).maybeSingle();
    if (soRefError) return Response.json({ error: soRefError.message }, { status: 500 });
    if (!so) return Response.json({ error: 'ไม่พบใบสั่งขายที่อ้างถึง' }, { status: 400 });
    if (dealId && so.dealId && so.dealId !== dealId) {
      return Response.json({ error: 'ใบสั่งขายที่อ้างไม่ใช่ของดีลนี้' }, { status: 400 });
    }
    optionalSalesOrderId = so.id;
  }
  if (optionalRefs.includes('product')) {
    // ⭐ FG **หลายรายการ** (ม-89) — ตรวจทุกตัวว่ามีจริง แล้วเก็บ snapshot
    // [{ id, label }] เอง (ชื่อจากแถวจริง ไม่รับจาก client — ทะเบียนเปลี่ยนชื่อ
    // ทีหลัง ใบเก่ายังอ่านออกว่าตอนนั้นอ้างอะไร) · FG ไม่ผูกดีล จึงไม่เทียบดีล
    const wanted = [...new Set((Array.isArray(body.productIds) ? body.productIds : [])
      .concat(body.productId ? [body.productId] : []).filter(Boolean))];
    if (wanted.length > 20) {
      return Response.json({ error: 'อ้างสินค้า (FG) ได้ไม่เกิน 20 รายการ' }, { status: 400 });
    }
    if (wanted.length) {
      const { data: fgs, error: fgError } = await supabase
        .from('products').select('id, "fgCode", "productDescription"').in('id', wanted);
      if (fgError) return Response.json({ error: fgError.message }, { status: 500 });
      const byId = new Map((fgs || []).map((f) => [f.id, f]));
      const missing = wanted.filter((id) => !byId.has(id));
      if (missing.length) {
        return Response.json({ error: 'ไม่พบสินค้า (FG) ที่อ้างถึงบางรายการ' }, { status: 400 });
      }
      refProduct = wanted.map((id) => {
        const fg = byId.get(id);
        return { id, label: [fg.fgCode, fg.productDescription].filter(Boolean).join(' · ') || id };
      });
    }
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
    // บรรทัดรูปร่างอื่น (เอกสาร · ใบวางบิล) ไม่มีของให้ resolve — ครบตั้งแต่ normalize
    //
    // ⚠️ เดิมมีสาขาที่ **สร้างวัสดุร่างให้บรรทัดที่ยังไม่ผูกทะเบียน** (`ensureMaterial`)
    // ซึ่งเป็นของบรรทัดวัสดุล้วน ๆ · ถอดพร้อมหัวข้อขอราคาใน mig 0219 (มติ ม-28)
    if (!isProductDev) resolved.push(...items);

    // ⭐ ส่วนหัว PDR (mig 0214) — 21 ช่องที่ฟอร์มถามตั้งแต่ตอนเปิดใบ
    //
    // ⚠️ **ตรวจก่อน insert เสมอ** — ตกลง DB ไปแล้วค่อยพังจะได้ใบร่างที่กินเลขไปแล้ว
    // (ยังไม่กินจริงตรงนี้ แต่ได้ใบเปล่าค้างที่ผู้ใช้ต้องมาลบเอง)
    // ⚠️ ปล่อยผ่านเฉพาะหัวข้อที่ประกาศธง — ส่ง `pdr` มากับหัวข้ออื่นคือของที่ไม่มี
    // ความหมาย ไม่ควรเงียบ ๆ เขียนลงคอลัมน์
    let pdrColumns = {};
    let briefRows = [];
    let targetRows = [];
    if (requestHasPdr(kind)) {
      const { columns, error: pdrError } = normalizePdr(body.pdr);
      if (pdrError) return Response.json({ error: pdrError }, { status: 400 });
      pdrColumns = columns;

      // 🔴 **บรีฟต้องตรวจตรงนี้ ไม่ใช่หลัง insert หัวคำร้อง** (ผู้ใช้เจอเอง 2026-08-09)
      // เดิมด่านบรีฟอยู่หลังหัวถูกเขียนลง DB แล้ว ⇒ ตกด่าน = ตอบ 400 แต่**แถวคำร้อง
      // ค้างอยู่** · ผู้ใช้เห็นแต่ข้อความว่าบันทึกไม่สำเร็จ แล้วกดใหม่ก็เจอ "ใบสั่งขายนี้
      // เปิดคำร้องไปแล้ว" (กติกา 1 SO : 1 PDR) ⇒ **ใบสั่งขายใบนั้นใช้ไม่ได้อีกเลย**
      // ทั้งที่ยังไม่เคยเปิดสำเร็จสักครั้ง · คอมเมนต์เหนือ PDR เขียนกฎนี้ไว้แล้ว
      // ("ตรวจก่อน insert เสมอ") แต่บรีฟหลุดออกไปอยู่นอกกฎ
      // ⚠️ `scentCount` — ชื่อออปชันต้องตรงกับที่ `normalizeScentBriefs` อ่าน · เดิมส่ง
      // `expected` ซึ่งไม่มีใครอ่าน ⇒ เพดาน "บรีฟห้ามเกินจำนวนกลิ่นที่ขาย" ไม่เคยทำงาน
      const { briefs, error: briefError } = normalizeScentBriefs(body.briefs, { scentCount });
      if (briefError) return Response.json({ error: briefError }, { status: 400 });

      // ⭐ ข้อ 2.2/2.3 · ต้นทุน/ราคาขายรายสินค้า (mig 0229) — ตรวจก่อน insert เหมือน
      // บรีฟ ด้วยเหตุผลเดียวกันที่เขียนไว้ข้างบน (ตกด่านหลัง insert = ใบร่างค้างที่จอง
      // ใบสั่งขายไว้แล้ว)
      // ⚠️ ส่งหมวดจากข้อ 1.11 ของ *ใบเดียวกัน* เข้าไปด้วย — แถวที่อ้างหมวดนอกนั้น
      // แปลว่าฟอร์มกับใบไม่ตรงกัน ต้องถูกทัก ไม่ใช่เขียนลงเงียบ ๆ
      const { targets, error: targetError } = normalizePdrTargets(body.pdrTargets, {
        categoryCodes: pdrColumns.pdrProductKinds || [],
      });
      if (targetError) return Response.json({ error: targetError }, { status: 400 });
      targetRows = targets.map((t) => ({ ...t, id: `DPT-${randomUUID()}`, requestId }));
      briefRows = briefs.map((b) => ({
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
        // ข้อความต่อท้าย Scentotype รายตัว (mig 0222 · ข้อ 2.1.4 บนกระดาษ)
        scentotypeNotes: b.scentotypeNotes || {},
        performance: b.performance,
      }));
    }

    // 2) หัวคำร้อง — stepKey มาจากชนิด ไม่ใช่จาก client (กันปักหมุดผิดขั้น)
    const { error: headError } = await supabase.from('dept_requests').insert({
      ...pdrColumns,
      id: requestId,
      kind,
      dept,
      status: 'draft',
      title: body.title ? String(body.title).trim().slice(0, 200) : null,
      body: body.body ? String(body.body).trim().slice(0, 4000) : null,
      urgent: !!body.urgent,
      urgentReason: body.urgent ? (body.urgentReason || null) : null,
      dealId,
      projectId,
      // SO ของบรีฟกลิ่น (บังคับ+ด่านเต็ม) หรือ SO อ้างอิงของขอเอกสาร (ม-88) — ช่องเดียวกัน
      salesOrderId: salesOrderId || optionalSalesOrderId,
      // ⚠️ ใส่คีย์เฉพาะเมื่ออ้างจริง — PostgREST ปฏิเสธ **ทั้งก้อน** เมื่อ body มี
      // คอลัมน์ที่ DB ยังไม่มี (mig 0225 ยังไม่รัน = ใบที่ไม่อ้าง QT ต้องยังเปิดได้)
      // บทเรียนเดียวกับ `productTypeId` ที่คอมเมนต์ล่างเล่าไว้
      ...(quotationId ? { quotationId } : {}),
      // 🐞 เคยมี `productTypeId` ตรงนี้ — mig 0204 DROP คอลัมน์ทิ้งไปแล้วแต่ลืมถอด
      // ออกจาก insert ⇒ **เปิดคำร้องไม่ได้เลยทุกหัวข้อ** เพราะ PostgREST ปฏิเสธทั้ง
      // ก้อนเมื่อ body มีคอลัมน์ที่ไม่มีจริง (ไม่ใช่แค่เมินค่านั้นทิ้ง)
      // หมวดสินค้าย้ายไปอยู่ **รายแถว** (`dept_request_items.categoryCode` — 0204)
      stepKey: requestStepKey(kind),
      scentId: body.scentId || null,
      formulaId: body.formulaId || null,
      customerId,
      customerName,
      // FG อ้างอิง (ม-88/ม-89) — snapshot อยู่ใน productRefs · คู่เดิม (productId/
      // productName) เก็บตัวแรกไว้ให้จอเก่าที่ยังอ่านช่องเดี่ยว
      ...(refProduct?.length ? { productRefs: refProduct } : {}),
      productId: refProduct?.[0]?.id || null,
      productName: refProduct?.[0]?.label || null,
      formulaCode: body.formulaCode || null,
      formulaName: body.formulaName || null,
      formulaDate: body.formulaDate || null,
      costingRequestId: body.costingRequestId || null,
      requestedById: user?.id ?? null,
      requestedByName: user?.name ?? null,
      requestedDueDate: body.requestedDueDate || null,
      // ทีมเจ้าของคำร้อง — คนอยู่หลายทีมเลือกได้ว่าใบนี้เข้าคิวทีมไหน
      // (ค่าที่ไม่ใช่ทีมของตัวเองถูกตีเป็นทีมหลักเสมอ — ดู attributionTeam)
      team: attributionTeam(user, body.team),
      // ⚠️ เลิกเขียน `note` (มติผู้ใช้ 2026-08-03: "ไม่ต้องมีหมายเหตุ") — คำร้องมี
      // "รายละเอียด" (body) ที่ทำงานเดียวกันอยู่แล้ว สองช่องข้อความอิสระบนเรื่อง
      // เดียวทำให้คนเขียนต้องเดาว่าอะไรควรอยู่ช่องไหน และผู้ตอบต้องอ่านสองที่
      // · คอลัมน์ยังอยู่เพื่ออ่านของเก่า (หน้ารายละเอียดยังแสดงถ้ามีค่า) ไม่ DROP
    });
    if (headError) throw headError;

    // 2.5) บรีฟรายกลิ่น — ชั้นกลางของโครงสามชั้น (mig 0213)
    //
    // ตรวจและประกอบแถวไปแล้วก่อน insert หัว (ดูเหตุผลที่นั่น) — เหลือแค่เขียนลงตาราง
    // ⚠️ ตารางแยกจาก dept_request_items โดยตั้งใจ (บรีฟไม่เดิน 5 ก้าว — ดู 0213)
    // 🐞 **ล้มแล้วต้องลบหัวทิ้งด้วย** — เดิมโยน error เปล่า ๆ ทิ้งใบร่างที่ไม่มีบรีฟ
    // ค้างไว้ · ใบร่างนั้นยังจองใบสั่งขายตามกติกา 1 SO : 1 PDR
    // (`lib/requests/scentDesignOrders.js`) ⇒ **เปิดใบใหม่จาก SO เดิมไม่ได้อีก**
    // และคนกดไม่รู้ด้วยซ้ำว่ามีใบค้าง เพราะหน้าจอเห็นแต่ error
    // ⚠️ ต้องทำเหมือนบล็อก `itemRows` ข้างล่างซึ่งลบหัวก่อนโยนอยู่แล้ว — ของสองก้อน
    // นี้อยู่ในธุรกรรมเดียวกันในความหมายของผู้ใช้ แต่ Supabase ไม่มี transaction ให้
    if (briefRows.length) {
      const { error: briefInsertError } = await supabase
        .from('dept_request_scents').insert(briefRows);
      if (briefInsertError) {
        await supabase.from('dept_requests').delete().eq('id', requestId);
        throw briefInsertError;
      }
    }

    // 2.1) แถวข้อ 2.2/2.3 — กติกาเดียวกับบรีฟทุกข้อ รวมถึงลบหัวทิ้งเมื่อล้ม
    if (targetRows.length) {
      const { error: targetInsertError } = await supabase
        .from('dept_request_pdr_targets').insert(targetRows);
      if (targetInsertError) {
        await supabase.from('dept_requests').delete().eq('id', requestId);
        throw targetInsertError;
      }
    }

    // 3) รายการ (เฉพาะหัวข้อที่มีบรรทัด) — ชั้นจำนวนถูกถอดใน mig 0219
    if (resolved.length) {
      // ⚠️ คอลัมน์ `lineKind` เป็น NOT NULL และไม่มี default (0204) — ต้องส่งเสมอ
      // ⚠️ แต่ละรูปร่างเก็บคนละคอลัมน์ ⇒ ประกอบแถวตามรูปร่าง ไม่ใช่ก้อนเดียวรวม
      const itemRows = resolved.map((item) => (isProductDev ? {
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
        // เอกสารและใบวางบิลใช้โครงเดียวกัน ต่างที่ `lineKind` ซึ่ง normalize เติมมาแล้ว
        lineKind: item.lineKind,
        sortOrder: item.sortOrder,
        label: item.label,
        spec: item.spec,
        docType: item.docType,
      }));
      const { error: itemError } = await supabase.from('dept_request_items').insert(itemRows);
      if (itemError) {
        await supabase.from('dept_requests').delete().eq('id', requestId);
        throw itemError;
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

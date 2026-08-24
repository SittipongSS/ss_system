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
  REQUEST_ANSWER_DEPARTMENTS, attributionTeam, canAnswerRequestsFor, canUser, canViewRequests,
} from '@/lib/permissions';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { resolveLineLabels } from '@/lib/requests/lineLabels';
import { resolveOptionalRefs } from '@/lib/requests/optionalRefs';
import { normalizeScentBriefs } from '@/lib/requests/scentBriefs';
import { normalizePdr } from '@/lib/requests/pdr';
import { normalizePdrTargets } from '@/lib/requests/pdrTargets';
import { scentCountForOrder, scentDesignOrderError } from '@/lib/requests/scentDesignOrders';
import { billingQuotationError, resolveBillAmount } from '@/lib/requests/billingQuotations';
import { loadVisibleRequests } from '@/lib/requests/visibleRows';
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
    // ⭐ ขอบเขตที่ขอมา — **บังคับที่ server ไม่ใช่ที่จอ** (กับดักข้อ 9 ของแผน)
    // สิทธิ์ไม่พอให้ถอยลงมา ไม่ปฏิเสธ ⇒ ลิงก์ที่แชร์กันไว้ไม่พังในมือคนสิทธิ์น้อยกว่า
    // ⚠️ ตัวเลือกใบ + ธง `_mine` อยู่ที่ lib/requests/visibleRows.js ที่เดียว —
    // ตัวเลขบนเมนู (/api/nav/counts) ต้องนับจากชุดเดียวกับที่หน้านี้แสดง
    const { rows, scope } = await loadVisibleRequests(supabase, user, {
      scopeParam: url.searchParams.get('scope'), status,
    });
    return Response.json(
      rows.filter((r) => !dealId || r.dealId === dealId),
      { headers: { 'Cache-Control': 'no-store', 'X-Request-Scope': scope } },
    );
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

  // ⭐ **ขอเอกสารการเงินยึดใบเสนอราคา** (ม-ค) แล้ว derive ดีลจากใบ — รูปเดียวกับที่
  // บรีฟกลิ่นยึด SO เป๊ะ ๆ · `body.dealId` ที่ฟอร์มเติมไว้ให้ดูถูก **ทับทิ้ง** ตรงนี้
  // ไม่ใช่เอามาเทียบ (เชื่อ client เมื่อไรก็เปิดทางให้ใบเกาะดีลที่ไม่ใช่ของ QT)
  let billBaseAmount = null;
  let bill = null;
  if (requestNeedsRef(kind, 'quotation')) {
    const { data: qtRow, error: qtRowError } = await supabase
      .from('quotations')
      // ⚠️ ต้องมี `subtotal` ด้วย — ด่านใช้แยก "ให้ฟรี (ลดเต็ม)" ออกจาก "ใบยังไม่มีของ"
      .select('id, "dealId", status, "approvalStatus", "totalAmount", "subtotal"')
      .eq('id', body.quotationId).maybeSingle();
    if (qtRowError) return Response.json({ error: qtRowError.message }, { status: 500 });
    if (!qtRow) return Response.json({ error: 'ไม่พบใบเสนอราคาที่เลือก' }, { status: 400 });
    // ด่านตัวเดียวกับที่ฟอร์มใช้กรองลิสต์ — ป้ายช่องกับของที่ผ่านจริงต้องตรงกันเสมอ
    const qtGate = billingQuotationError(qtRow);
    if (qtGate) return Response.json({ error: qtGate }, { status: 400 });
    if (!qtRow.dealId) {
      return Response.json({
        error: 'ใบเสนอราคานี้ไม่ได้ผูกดีล — ขอเอกสารการเงินจากใบนี้ไม่ได้',
      }, { status: 400 });
    }
    dealId = qtRow.dealId;
    billBaseAmount = Number(qtRow.totalAmount);
    // ยอดที่ขอ — คิดจาก **ฐานของแถวจริง** ไม่ใช่ `billBaseAmount` ที่ฟอร์มแนบมา
    bill = resolveBillAmount({
      percent: body.billPercent, amount: body.billAmount, baseAmount: billBaseAmount,
    });
    if (bill.error) return Response.json({ error: bill.error }, { status: 400 });
  }

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
  // ทีมของดีลต้นทาง — ใช้เป็นทีมของคำร้องเมื่อคนเปิดไม่มีทีมของตัวเอง (ดูตอนเขียนแถว)
  let dealTeam = null;
  if (dealId) {
    const { data: dealRow, error: dealError } = await supabase
      .from('sales_deals').select('id, projectId, customerId, customerName, team')
      .eq('id', dealId).maybeSingle();
    if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
    if (!dealRow) return Response.json({ error: 'ไม่พบดีลที่เลือก' }, { status: 400 });
    /* ⭐ **ไม่บังคับโครงการอีกต่อไป** (2026-08-24) — เหตุผลเดิมคือ "หมุดไทม์ไลน์ต้องมี
       โครงการจึงจะปักได้" ซึ่งไม่จริง: `requestsByStepKey` จับหมุดด้วย `stepKey` และใช้
       ดีลเป็นตัวกรอง ส่วนไทม์ไลน์ลอยบนดีลได้อยู่แล้ว (DL1 · lib/pm/status.js)
       ⇒ ด่าน "ต้องมีโครงการ" เหลือที่เดียวคือตอนปิด Won (quotations/[id]/accept)
       ซึ่งเป็นจุดที่ของจริงเริ่มเกาะโครงการ (SO → งานผลิต → ส่งของ)
       ⚠️ `projectId` ยัง derive จากดีลเหมือนเดิม — ว่างได้ แล้วรับค่าย้อนหลังตอนดีล
       ผูกโครงการ (`moveDealMirrors` ทำงานทั้งเส้นผูกแรกและเส้นย้าย) */
    projectId = dealRow.projectId || null;
    // ลูกค้ามาจากดีล ไม่ใช่จาก client — ปล่อยให้ส่งเองคือเปิดช่องให้ราคาเข้าทะเบียน
    // ใต้ชื่อลูกค้าที่ไม่ใช่เจ้าของดีล
    customerId = dealRow.customerId || null;
    customerName = dealRow.customerName || null;
    dealTeam = dealRow.team || null;
  }

  // ── อ้างอิงเพิ่มแบบไม่บังคับ: QT · SO · FG (ม-88) ───────────────────────
  //
  // ⭐ มติผู้ใช้ 2026-08-08: "ใส่รายละเอียดที่เกี่ยวข้อง QT SO FG **(ถ้ามี)**" —
  // ว่างได้เสมอ · ส่งมาเมื่อไรตรวจสองข้อ: **ของมีจริง** และ **อยู่ดีลเดียวกัน**
  // (QT/SO ผูกดีล — อ้างข้ามดีลคือความขัดแย้งแบบเดียวกับที่บรีฟกลิ่นกันไว้)
  //
  // ⚠️ ไม่ใช่ด่านธุรกิจเต็มชุดของบรีฟกลิ่น (อนุมัติแล้ว · 1SO:1PDR) — ที่นี่แค่
  // "แนบป้ายอ้างอิงให้ตามกลับได้" ไม่ได้เปิดสิทธิ์อะไรจากใบที่อ้าง
  // ⚠️ หัวข้อที่ **ต้อง** อ้าง QT ผ่านด่านของตัวเองไปแล้วข้างบน (ม-ค) — เก็บค่าไว้
  // ตรงนี้ด้วย ไม่งั้นแถวจะบันทึกโดยไม่มี `quotationId` ทั้งที่เป็นต้นทางของทั้งใบ
  let quotationId = requestNeedsRef(kind, 'quotation') ? body.quotationId : null;
  /* ⚠️ **ตัวเดียวกับทางแก้ใบ** (`PATCH action: 'update'`) — ฟอร์มแก้กางช่อง QT/SO/FG
     ชุดเดียวกันนี้ (มติผู้ใช้ 2026-08-24 "หน้าแก้ต้องเหมือนหน้าสร้าง") ⇒ ด่านต้องเป็น
     ก้อนเดียว ไม่งั้นสร้างผ่านแต่แก้ไม่ผ่าน (หรือแย่กว่า: แก้ผ่านทั้งที่สร้างไม่ผ่าน) */
  const { patch: refPatch, error: refError } = await resolveOptionalRefs(supabase, kind, body, { dealId });
  if (refError) return Response.json({ error: refError }, { status: 400 });
  // `quotationId` ของหัวข้อที่ **ยึด QT เป็นต้นทาง** ถูกตั้งไปแล้วข้างบน — helper
  // ไม่แตะคีย์นั้น (มันคุมเฉพาะ "อ้างอิงเพิ่ม") จึงเขียนทับได้เฉพาะเมื่อ helper ตอบมา
  if (refPatch.quotationId !== undefined) quotationId = refPatch.quotationId;
  const optionalSalesOrderId = refPatch.salesOrderId ?? null;
  const refProduct = refPatch.productRefs?.length ? refPatch.productRefs : null;

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
    // ⚠️ **ตัวเดียวกับทางแก้ใบ** (`PATCH action: 'update'`) — ป้าย "หมวด · กลิ่น"
    // กับด่านกลิ่นข้ามลูกค้าอยู่ที่ `lib/requests/lineLabels.js` ที่เดียว · เขียนสอง
    // ที่เมื่อไรก็เพี้ยนกันเมื่อนั้น
    //
    // ⚠️ เดิมมีสาขาที่ **สร้างวัสดุร่างให้บรรทัดที่ยังไม่ผูกทะเบียน** (`ensureMaterial`)
    // ซึ่งเป็นของบรรทัดวัสดุล้วน ๆ · ถอดพร้อมหัวข้อขอราคาใน mig 0219 (มติ ม-28)
    const { items: resolved, error: labelError } = await resolveLineLabels(supabase, items, {
      lineShape, customerId,
    });
    // โยนเหมือนเดิม — ตกที่ catch ท้าย handler ซึ่งลบใบร่างที่เพิ่งสร้างทิ้งให้
    if (labelError) throw new Error(labelError);

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
      // ยอดที่ขอวางบิล (mig 0257) — ใส่คีย์เฉพาะหัวข้อที่ยึด QT ด้วยเหตุผลเดียวกับ
      // บรรทัดบน: migration ยังไม่รัน = หัวข้ออื่นต้องยังเปิดใบได้ตามปกติ
      ...(bill ? {
        billPercent: bill.percent,
        billAmount: bill.amount,
        billBaseAmount,
      } : {}),
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
      /* ทีมเจ้าของคำร้อง — คนอยู่หลายทีมเลือกได้ว่าใบนี้เข้าคิวทีมไหน
         (ค่าที่ไม่ใช่ทีมของตัวเองถูกตีเป็นทีมหลักเสมอ — ดู attributionTeam)
         ⭐ คนที่ **ไม่มีทีมเลย** (admin/หัวหน้าฝ่ายขาย/RD/PC) เปิดใบแล้วเคยได้ team = null
         ⇒ ใบนั้นไม่โผล่ในคิวทีมไหนเลย เห็นได้แค่คิวของฝ่ายที่ต้องตอบกับตัวคนเปิดเอง
         ทั้งที่ใบส่วนใหญ่ของกลุ่มนี้เปิดคาดีลของทีมใดทีมหนึ่งอยู่แล้ว ⇒ ถอยไปใช้
         **ทีมของดีลต้นทาง** ซึ่งคือทีมที่ต้องตามงานใบนี้จริง (กติกาเดียวกับโครงการ:
         ขอบเขตเดินตามงาน ไม่ใช่ตามคนกด — mig 0253 / lib/pm/projectOwner.js)
         ⚠️ ไม่ผูกดีล + คนเปิดไม่มีทีม = null เหมือนเดิม (ไม่มีอะไรให้เดา และใบแบบนั้น
         เป็นงานระหว่างคนเปิดกับฝ่ายที่ตอบ ไม่ใช่งานของทีมขายทีมใดทีมหนึ่ง) */
      team: attributionTeam(user, body.team) || dealTeam,
      // ⚠️ เลิกเขียน `note` (มติผู้ใช้ 2026-08-03: "ไม่ต้องมีหมายเหตุ") — คำร้องมี
      // "รายละเอียด" (body) ที่ทำงานเดียวกันอยู่แล้ว สองช่องข้อความอิสระบนเรื่อง
      // เดียวทำให้คนเขียนต้องเดาว่าอะไรควรอยู่ช่องไหน และผู้ตอบต้องอ่านสองที่
      // · คอลัมน์ยังอยู่เพื่ออ่านของเก่า (หน้ารายละเอียดยังแสดงถ้ามีค่า) ไม่ DROP
    });
    if (headError) throw headError;

    /* ⭐ **ฝ่ายของคนเปิดใบ** (mig 0270) — ป้ายบนคิวเลิกใช้คำว่า "ฝ่าย"/"ผู้ขอ" ลอย ๆ
       แล้วพูดชื่อฝ่ายจริงทั้งสองฝั่ง ("รอ RD ตอบ" / "รอ SA ตอบ" · มติผู้ใช้ 2026-08-20)
       ⚠️ **เขียนแยกจาก insert หัว และกลืน error โดยตั้งใจ** — PostgREST ปฏิเสธทั้งก้อน
       เมื่อ body มีคอลัมน์ที่ DB ยังไม่มี ⇒ ยัดคีย์นี้ลง insert เมื่อไร รีโปที่ยังไม่ได้
       รัน mig 0270 จะ **เปิดคำร้องไม่ได้เลยสักใบ** (บทเรียนเดียวกับ mig 0258) ·
       ป้ายถอยไปใช้คำว่า "ผู้ขอ" ได้อยู่แล้วเมื่อค่านี้ว่าง */
    if (user?.department) {
      const { error: deptError } = await supabase.from('dept_requests')
        .update({ requesterDept: user.department }).eq('id', requestId);
      if (deptError) console.error('[requests] stamp requesterDept failed', deptError.message);
    }

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

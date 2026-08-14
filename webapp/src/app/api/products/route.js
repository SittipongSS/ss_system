import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canApproveMasterData, canUser, redactProductMargin } from '@/lib/permissions';
import { registrationStatusOf } from '@/lib/excise/recommendation';
import { categoryOf, categoryFlagsOf, activeProductTypeError } from '@/lib/master/productTypes';
import {
  CODE_MODE_AUTO, codeModeOf, composeFgCode, customerCodeSegment, fgCodeError, fgCodeHasRunNo,
  fgCodePrefix, insertProductWithCode,
} from '@/lib/master/masterCodes';
import { recordAudit } from '@/lib/audit';
import { resolveProductTaxable } from '@/lib/tax/exciseBilling';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';
import { productFormulaSnapshot } from '@/lib/master/scentFormulaAdmin';
import { naText } from "@/lib/format";

export const dynamic = 'force-dynamic';
// Approval gate: by default GET returns only APPROVED products, so downstream
// consumers (excise registration, PM pickers, order lines) never see a pending
// row. The management page passes ?manage=1 to see all statuses.
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const manage = url.searchParams.get('manage') === '1';
  // A PM project is bound to one customer, and that customer's FGs may have been
  // registered by a DIFFERENT team (product.team = creator's team, not the
  // customer's). Scoping by customerId therefore intentionally BYPASSES team
  // scope so the project product-picker can see all of its customer's FGs.
  // The approval gate + isActive filter + margin redaction below still apply.
  const customerId = url.searchParams.get('customerId');

  let query = supabase.from('products').select('*').order('createdAt', { ascending: false });
  if (customerId) query = query.eq('customerId', customerId);
  // NO team scope on read (มติ 2026-07-20): the FG catalog is shared master data,
  // like product_types. `product.team` records who CREATED the row, not who owns
  // the product — the owner is the customer — so scoping reads by it hid FGs from
  // the very teams selling them. That mismatch already forced the ?customerId=
  // bypass above (a443cbe) for the PM picker; scoping the list view had the same
  // bug with no escape hatch. Confidentiality is handled where it belongs:
  // redactProductMargin strips cost/margin below, and writes stay team-scoped via
  // editScope in POST/PATCH.
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Hide retired (isActive=false) products from downstream pickers; keep them in
  // the management view. Filtered in JS so it stays resilient before migration
  // 0036 runs (missing column reads as undefined → treated as active).
  const rows = manage ? (data || []) : (data || []).filter((p) => p.isActive !== false);
  // สถานะขึ้นทะเบียนสรรพสามิตสรุปราย FG ('none'|'in_progress'|'approved') สำหรับ
  // ตัวกรองหน้า list — ข้อมูลทะเบียนเป็นความลับของระบบภาษี จึงแนบเฉพาะผู้ที่เห็น
  // ระบบภาษี (history:view เหมือน lib/master/relations); role อื่นไม่ได้ field นี้เลย
  // (UI ใช้การมี field เป็นสัญญาณซ่อนตัวกรอง). โหลดชุดเดียวด้วย .in() — ห้าม N+1.
  if (rows.length && canUser(user, 'history:view')) {
    const { data: regRows, error: regError } = await supabase
      .from('excise_registrations')
      .select('id, productId, status')
      .in('productId', rows.map((p) => p.id));
    if (regError) return Response.json({ error: regError.message }, { status: 500 });
    const byProduct = new Map();
    for (const r of regRows || []) {
      if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
      byProduct.get(r.productId).push(r);
    }
    for (const p of rows) p.registrationStatus = registrationStatusOf(byProduct.get(p.id));
  }
  // Strip the confidential cost breakdown/profit for non-margin roles.
  return Response.json(rows.map((p) => redactProductMargin(user, p)));
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // FG always belongs to a customer (selected in the create form).
  if (!body.customerId) return Response.json({ error: 'กรุณาเลือกลูกค้าเจ้าของสินค้า' }, { status: 400 });
  const { data: customer, error: customerError } = await supabase
    .from('customers').select('*').eq('id', body.customerId).maybeSingle();
  if (customerError) return Response.json({ error: customerError.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });

  // ── รหัสสินค้า: สวิตช์ "ระบบใหม่" ในโมดัล (มติผู้ใช้ 2026-08-12, mig 0230) ──
  // เปิด (auto) = ประกอบให้จาก **รหัสลูกค้าที่เลือก + หมวดที่เลือก + เลขรันที่จองสด**
  //   FG-AAAA-BB-CCC-DDDDD (ลูกค้าเก่ารหัส 3 หลักเติมศูนย์เป็น AAAA ตอนประกอบ)
  // ปิด (manual) = ใช้รหัสที่กรอกมา (รูปแบบเดิม FG-AAA-BB-CCC-DDDD)
  //
  // ⚠️ ท่อน AAAA/BB-CCC ประกอบจากค่าที่ **server อ่านเอง** (customer.arCode ที่เพิ่ง
  // โหลด + categoryCode ที่ตรวจแล้ว) ไม่ใช่จากสตริงที่ client ส่งมา — ไม่งั้นรหัสบนใบ
  // จะเป็นของลูกค้าหนึ่ง แต่ customerId ชี้อีกคน โดยไม่มีอะไรจับได้
  const codeMode = codeModeOf(body.codeMode);
  const categoryCode = body.categoryCode || categoryOf(body.fgCode);
  const categoryError = await activeProductTypeError(categoryCode);
  if (categoryError) return Response.json({ error: categoryError }, { status: 400 });

  // ⚠️ **โหมด auto ยังไม่มีรหัสตรงนี้** — เลขรันจองพร้อม insert ในฟังก์ชัน SQL ท้าย
  // ฟังก์ชัน (mig 0237) ตรงนี้เตรียมได้แค่ "ท่อนหน้าเลขรัน" ซึ่งเป็นตัวเดียวกับที่
  // composeFgCode ใช้ ⇒ ประกอบ prefix ไม่ได้ = ประกอบรหัสไม่ได้ ตีกลับตั้งแต่ยังไม่แตะเลข
  let fgCode = String(body.fgCode || '').trim();
  let fgPrefix = null;
  if (codeMode === CODE_MODE_AUTO) {
    if (!customerCodeSegment(customer.arCode)) {
      return Response.json(
        { error: `ลูกค้ารายนี้มีรหัส "${naText(customer.arCode)}" ซึ่งไม่ใช่รูปแบบ AR ที่ระบบรู้จัก — ปิดสวิตช์ระบบใหม่แล้วกรอกรหัสสินค้าเอง` },
        { status: 400 },
      );
    }
    fgPrefix = fgCodePrefix({ arCode: customer.arCode, categoryCode });
    if (!fgPrefix) {
      return Response.json(
        { error: `หมวดสินค้า "${naText(categoryCode)}" ไม่ใช่รูปแบบ BB-CCC ที่ประกอบรหัสได้ — เลือกหมวดใหม่หรือปิดสวิตช์ระบบใหม่แล้วกรอกรหัสเอง` },
        { status: 400 },
      );
    }
    // ── หมวด 03/04: รหัสจบที่ CCC ไม่มีเลขรัน (มติผู้ใช้ 2026-08-13) ────────
    // ไม่มีเลขให้จอง ⇒ **ไม่เรียกฟังก์ชันออกรหัส** ประกอบรหัสตรงนี้แล้ว insert ปกติ
    // เหมือนโหมดกรอกเอง · เรียกไปก็ได้รหัสที่มีเลขรันติดท้ายซึ่งผิดรูปแบบที่ตกลงไว้
    if (!fgCodeHasRunNo(categoryCode)) {
      fgPrefix = null;
      fgCode = composeFgCode({ arCode: customer.arCode, categoryCode });
      // รหัสถูกกำหนดครบตั้งแต่ลูกค้า+หมวด ⇒ คู่เดิมสร้างซ้ำไม่ได้ · ข้อความต้องบอก
      // ว่าทำไม ไม่ใช่แค่ "รหัสซ้ำ" เพราะคนกรอกไม่ได้พิมพ์รหัสเองจึงไม่รู้ว่าไปชนอะไร
      const { data: dup, error: dupError } = await supabase
        .from('products')
        .select('id')
        .eq('fgCode', fgCode)
        .maybeSingle();
      if (dupError) return Response.json({ error: dupError.message }, { status: 500 });
      if (dup) {
        return Response.json(
          { error: `${fgCode} มีในระบบแล้ว — หมวดนี้ออกรหัสโดยไม่มีเลขรัน ลูกค้าหนึ่งรายจึงมีได้หนึ่งรายการต่อหมวดรอง ถ้าต้องการอีกรายการให้เลือกหมวดรองอื่น` },
          { status: 409 },
        );
      }
    }
  } else {
    const codeError = fgCodeError(fgCode, { mode: codeMode, categoryCode });
    if (codeError) return Response.json({ error: codeError }, { status: 400 });

    // Duplicate FG Code check — เฉพาะรหัสที่กรอกเอง (เลขจากเคาน์เตอร์ยังไม่ได้จอง
    // จึงไม่มีอะไรให้เช็ค · unique index 0035 เป็นตาข่ายท้ายสุดอยู่แล้ว)
    const { data: dup, error: dupError } = await supabase
      .from('products')
      .select('id')
      .eq('fgCode', fgCode)
      .maybeSingle();
    if (dupError) return Response.json({ error: dupError.message }, { status: 500 });
    if (dup) {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
  }

  const { volume, costPrice, retailPriceIncVat } = body;
  // ราคาผลิต/ราคาขายปลีก เป็น optional — เก็บ null ไว้ตามจริง แต่ในการคำนวณ
  // ภาษี/ต้นทุน ให้ถือว่า 0 เพื่อกัน NaN เมื่อยังไม่ได้กรอกราคา.
  const costPriceNum = costPrice == null || costPrice === '' ? 0 : Number(costPrice);
  const retailPriceIncVatNum =
    retailPriceIncVat == null || retailPriceIncVat === '' ? 0 : Number(retailPriceIncVat);
  // Every FG belongs to a customer (chosen at creation). customerName is a
  // snapshot taken server-side so the catalog row is stable even if the
  // customer is later renamed. Category comes from the picker (auto mode) or is
  // derived from the typed FG code (manual) — ตรวจไปแล้วด้านบนพร้อมกับตัวรหัส
  // สูตรมาจากทะเบียน — ชื่อ/รหัส/วันที่เป็น snapshot ที่ derive จาก formulaId
  let formulaSnapshot;
  try {
    formulaSnapshot = await productFormulaSnapshot(supabase, body.formulaId);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  // Taxability is auto-derived from the category's isExcise flag (mig 0131 —
  // not re-parsed from fgCode, and no hardcoded category code), but LG may
  // override it.
  const autoTaxable = (await categoryFlagsOf(categoryCode)).isExcise;
  const taxableOverride =
    typeof body.taxableOverride === 'boolean' ? body.taxableOverride : null;
  const isExciseTaxable = resolveProductTaxable({ taxableOverride, autoTaxable });

  const retailPriceExVat = isExciseTaxable ? retailPriceIncVatNum / 1.07 : 0;
  const exciseTax = isExciseTaxable ? retailPriceExVat * 0.08 : 0;
  const localTax = isExciseTaxable ? exciseTax * 0.1 : 0;

  const factoryPrice = costPriceNum;
  const laborCost = volume >= 30 ? 5 : 2;
  const shippingCost = 1;
  const materialCost = factoryPrice * 0.65;
  const factoryProfit = factoryPrice - materialCost - laborCost - shippingCost;

  // AE / AC / Senior AE creations land as 'pending' — only AE Supervisor approves
  // (admin = sysadmin break-glass). Approvers auto-approve their own.
  const nowIso = new Date().toISOString();
  const autoApprove = canApproveMasterData(user?.role);

  // Whitelist the catalog fields we accept from the form (don't spread the
  // whole body — keeps stray status values out of the master row).
  const newProduct = {
    // Collision-proof id (was 'PRD-'+last-6-ms, repeated every ~16.7 min with
    // no DB unique). Mirrors customers (migration 0031/0035).
    id: 'PRD-' + randomUUID(),
    // โหมด auto ที่มีเลขรัน **ไม่ใส่คีย์ fgCode เลย** — ฟังก์ชัน SQL เติมให้หลังจองเลข
    // ในทรานแซกชันเดียวกับ insert (mig 0237) เหมือนฝั่งลูกค้า
    // ส่วนหมวด 03/04 ไม่มีเลขให้จอง รหัสประกอบเสร็จตั้งแต่ด้านบน จึงส่งมาตรง ๆ
    ...(fgPrefix ? {} : { fgCode }),
    customerId: customer.id,
    customerName: customer.name,
    productDescription: body.productDescription ?? null,
    productDescriptionEn: body.productDescriptionEn ?? null, // ชื่อสินค้า EN (0059)
    brandName: body.brandName ?? null,
    brandNameEn: body.brandNameEn ?? null, // snapshot EN ของแบรนด์ (0059)
    // ข้อมูลสูตร (0112 → ทะเบียน 0171) — optional: FG ที่ไม่มีสูตร (กล่อง/บรรจุภัณฑ์)
    // ก็สร้างได้ · ทั้งชุดมาจาก formulaId ไม่รับข้อความที่พิมพ์เอง
    ...formulaSnapshot,
    volume,
    volumeUnit: body.volumeUnit || 'ml',
    // หน่วยขายที่แสดงบนใบเสนอราคา/ใบสั่งขาย (0146) — ต่างจาก volumeUnit (ปริมาตรบรรจุ)
    saleUnit: body.saleUnit?.trim() || 'ชิ้น',
    // ชิ้นต่อลัง (ตัวแปลงหน่วยฝั่งสหมิตร, migration 0075) — optional, null = ยังไม่ตั้ง.
    piecesPerCase:
      body.piecesPerCase == null || body.piecesPerCase === '' ? null : Number(body.piecesPerCase),
    costPrice: costPrice == null || costPrice === '' ? null : costPriceNum,
    retailPriceIncVat:
      retailPriceIncVat == null || retailPriceIncVat === '' ? null : retailPriceIncVatNum,
    taxableOverride,
    isExciseTaxable,
    retailPriceExVat,
    exciseTax,
    localTax,
    laborCost,
    shippingCost,
    materialCost,
    factoryProfit,
    categoryCode: categoryCode ?? null,
    isActive: true, // สินค้าใหม่ใช้งานอยู่เสมอ (migration 0036)
    metadata: body.metadata || {},
    // Ownership comes from the server-side identity, not the client body.
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    assignee: body.assignee || user?.name || 'Sales',
    // Approval workflow (migration 0027).
    approvalStatus: autoApprove ? 'approved' : 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: autoApprove ? (user?.id ?? null) : null,
    approvedByName: autoApprove ? (user?.name ?? null) : null,
    approvedAt: autoApprove ? nowIso : null,
    createdAt: nowIso,
  };

  // ── ออกรหัส + insert ──────────────────────────────────────────────────────
  // โหมด auto ผ่านฟังก์ชัน SQL (mig 0237): บวกเลขเคาน์เตอร์กับ insert อยู่ในคำสั่งเดียว
  // ⇒ insert ล้มด้วยเหตุใดก็ตาม เลขรันที่จองถูก rollback คืน ไม่มีรหัสหายจากระบบ
  // ⚠️ ห้ามแยกกลับไปเป็น "จองเลขก่อน แล้วค่อย insert" — สองคำสั่ง = เลขข้ามทุกครั้งที่
  // insert ไม่ผ่าน · โหมด manual ไม่มีเลขให้จอง จึง insert ตรงตามเดิม
  // `fgPrefix` มีค่าเฉพาะโหมด auto ที่ต้องจองเลขรัน — หมวด 03/04 ถูกตั้งเป็น null
  // ไว้ด้านบนพร้อมประกอบรหัสเสร็จแล้ว จึงเดินทาง insert ปกติเหมือนโหมดกรอกเอง
  const { data, error } = fgPrefix
    ? await insertProductWithCode(supabase, fgPrefix, newProduct)
    : await supabase.from('products').insert(newProduct).select().single();
  if (error) {
    // Unique violation (migration 0035) — a concurrent insert beat the app-level
    // dup check, or fgCode already exists.
    if (error.code === '23505') {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  await recordProductPriceHistory({
    user,
    productId: data.id,
    after: data,
    changeType: 'create',
    metadata: { fgCode: data.fgCode, customerId: data.customerId },
  });
  await recordAudit({ user, action: 'create', entityType: 'product', entityId: data.id, after: data, request });


  return Response.json(data, { status: 201 });
}
